"""The learning loop: question -> check -> grade -> update learner model -> decide -> log.

Closes the "continuous learning loop" of the PRD. Every graded answer updates (a) BKT mastery of the
concept, (b) the spaced-repetition schedule, (c) the streak/progress history, then asks the policy what to
do next and records that decision, with its reasoning, in the agent activity feed.
"""
from __future__ import annotations

import asyncio
import random
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from backend.app.models.student_profile import ConceptMastery, StudentProfile
from backend.app.rag.types import Document
from backend.app.config import settings
from backend.app.learning import coding_profiles

from .mastery import MASTERED, ReviewState, assisted, bkt_update, next_review, params_for_level, retention
from .policy import ConceptNode, Decision, decide, learning_path, next_concepts
from .analyst import HISTORY_CAP as ATTEMPT_CAP, analyse
from .goals import plan_goal
from .journal import build_journal
from .planner import plan_session
from . import challenges, diagnostic, prefs, rhythm, strategy, study, teachback
from .quiz import Quiz, generate_quiz

EventFn = Callable[[str, str, str, Dict[str, Any]], Awaitable[None]]     # (user_id, agent, message, meta)
_SENT = re.compile(r"(?<=[.!?])\s+")
HISTORY_CAP = 120


TALKING_POINTS = {
    "worked_example": "Sit with them on one problem and work it through step by step before another attempt.",
    "break": "Suggest a short break; rushing and missing is often tiredness or frustration, not lack of ability.",
    "change_strategy": "Ask which kind of explanation helps them most (a diagram, an example, or a conversation) and try that.",
    "contrast": "Ask them to explain the difference between the two ideas in their own words.",
}


class LearningError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class QuizRepo:
    """Persistence contract for quizzes (Postgres in production, in-memory in tests)."""

    async def create(self, user_id: str, quiz: Quiz) -> str: ...
    async def get(self, user_id: str, quiz_id: str) -> Optional[dict]: ...
    async def mark_answered(self, user_id: str, quiz_id: str, chosen: int, correct: bool) -> bool: ...
    async def reopen(self, user_id: str, quiz_id: str) -> None: ...
    async def bump_hints(self, user_id: str, quiz_id: str, level: int) -> None: ...


class PgQuizRepo(QuizRepo):
    def __init__(self, db):
        from backend.app.services.database import json_param
        self.db, self._j = db, json_param

    async def create(self, user_id, quiz):
        row = await self.db.fetch_one(
            "insert into quiz_items(user_id, doc_id, chunk_id, question, options, answer_index, explanation, notes, "
            "generated_by, option_sources) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id::text",
            (user_id, quiz.doc_id, quiz.chunk_id, quiz.question, self._j(quiz.options), quiz.answer_index,
             quiz.explanation, self._j(quiz.distractor_notes), quiz.generated_by, self._j(quiz.option_sources)))
        return row["id"]

    async def get(self, user_id, quiz_id):
        try:
            return await self.db.fetch_one(
                "select id::text, doc_id, chunk_id, question, options, answer_index, explanation, notes, answered_at, created_at, "
                "option_sources, hints_used "
                "from quiz_items where id = %s and user_id = %s", (quiz_id, user_id))
        except Exception:                      # malformed uuid etc.
            return None

    async def mark_answered(self, user_id, quiz_id, chosen, correct):
        n = await self.db.execute(              # atomic: only the first answer counts
            "update quiz_items set answered_at = now(), chosen_index = %s, correct = %s "
            "where id = %s and user_id = %s and answered_at is null", (chosen, correct, quiz_id, user_id))
        return n == 1

    async def bump_hints(self, user_id, quiz_id, level):
        await self.db.execute("update quiz_items set hints_used = greatest(hints_used, %s) "
                              "where id = %s and user_id = %s and answered_at is null", (level, quiz_id, user_id))

    async def reopen(self, user_id, quiz_id):
        await self.db.execute("update quiz_items set answered_at = null, chosen_index = null, correct = null "
                              "where id = %s and user_id = %s", (quiz_id, user_id))


class MemoryQuizRepo(QuizRepo):
    def __init__(self):
        self.rows: Dict[str, dict] = {}

    async def create(self, user_id, quiz):
        qid = f"q{len(self.rows) + 1}"
        self.rows[qid] = {"id": qid, "user_id": user_id, "doc_id": quiz.doc_id, "question": quiz.question,
                          "options": quiz.options, "answer_index": quiz.answer_index, "explanation": quiz.explanation,
                          "notes": quiz.distractor_notes, "answered_at": None, "option_sources": quiz.option_sources,
                          "created_at": datetime.now(timezone.utc), "chunk_id": quiz.chunk_id, "hints_used": 0}
        return qid

    async def get(self, user_id, quiz_id):
        r = self.rows.get(quiz_id)
        return r if r and r["user_id"] == user_id else None

    async def mark_answered(self, user_id, quiz_id, chosen, correct):
        r = self.rows.get(quiz_id)
        if not r or r["user_id"] != user_id or r["answered_at"]:
            return False
        r["answered_at"] = datetime.now(timezone.utc)
        return True

    async def bump_hints(self, user_id, quiz_id, level):
        r = self.rows.get(quiz_id)
        if r and r["user_id"] == user_id and not r["answered_at"]:
            r["hints_used"] = max(r["hints_used"], level)

    async def reopen(self, user_id, quiz_id):
        r = self.rows.get(quiz_id)
        if r and r["user_id"] == user_id:
            r["answered_at"] = None


class LearningService:
    def __init__(self, profiles, quizzes: QuizRepo, store, llm=None, emit: Optional[EventFn] = None):
        self.profiles, self.quizzes, self.store, self.llm, self.emit = profiles, quizzes, store, llm, emit
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)    # serialise read-modify-write per user
        self.embedder, self.nli = None, None                                 # set by the API layer; needed for teach-back grading

    # ---------- graph ----------
    def _docs(self) -> List[Document]:
        return self.store.list_documents()

    def graph(self) -> Dict[str, ConceptNode]:
        return {d.id: ConceptNode(d.id, d.title, d.level, [p for p in d.prerequisites], d.domain) for d in self._docs()}

    @staticmethod
    def mastery_map(profile: StudentProfile) -> Dict[str, float]:
        return {str(m.concept_id): m.mastery_level for m in profile.concept_mastery}

    @classmethod
    def effective_map(cls, profile: StudentProfile) -> Dict[str, float]:
        """Measured mastery, plus placement-assumed concepts counted as 'ready' (never as mastered) for unlocking."""
        return diagnostic.effective_mastery(cls.mastery_map(profile), profile.patterns.get("diagnostic"))

    async def _profile(self, user_id: str) -> StudentProfile:
        return await self.profiles.get_profile_by_user_id(user_id) or await self.profiles.create_profile_safe(user_id)

    # ---------- quiz ----------
    def _passage_for(self, doc_id: str, chunk_id: Optional[str], rng: random.Random) -> tuple[str, str]:
        if chunk_id:
            c = self.store.get_chunks([chunk_id]).get(chunk_id)
            if c and c.doc_id == doc_id:
                parent = self.store.get_chunks([c.parent_id]).get(c.parent_id) if c.parent_id else None
                return (parent or c).text[:1500], c.id
        passages = [(cid, t) for cid, t in self.store.passages_for_doc(doc_id) if len(t) >= 120]
        if not passages:
            raise LearningError("That concept has no content to quiz on.", 404)
        cid, text = rng.choice(passages)
        return text, cid

    def _distractors(self, doc_id: str, rng: random.Random, n: int = 14) -> tuple[List[str], Dict[str, str]]:
        others = [d for d in self._docs() if d.id != doc_id]
        rng.shuffle(others)
        pool: List[str] = []
        origin: Dict[str, str] = {}
        for d in others[:8]:
            for _, text in self.store.passages_for_doc(d.id)[:2]:
                for s in _SENT.split(re.sub(r"```.*?```", " ", text, flags=re.S)):
                    if 40 <= len(s.strip()) <= 200:
                        pool.append(s)
                        origin.setdefault(s, d.id)
        rng.shuffle(pool)
        return pool[:n], origin

    async def create_quiz(self, user_id: str, doc_id: str, chunk_id: Optional[str] = None,
                          level: str = "beginner") -> Dict[str, Any]:
        doc = await asyncio.to_thread(self.store.get_document, doc_id)
        if not doc:
            raise LearningError("Unknown concept.", 404)
        rng = random.Random()
        pool, sources = await asyncio.to_thread(self._distractors, doc_id, rng)
        quiz = None
        for attempt in range(4):                       # a passage can lack a usable sentence: try another
            passage, cid = await asyncio.to_thread(self._passage_for, doc_id, chunk_id if attempt == 0 else None, rng)
            quiz = await generate_quiz(self.llm, title=doc.title, level=level, passage=passage, doc_id=doc_id,
                                       chunk_id=cid, distractor_pool=pool, distractor_sources=sources)
            if quiz:
                break
        if quiz is None:
            raise LearningError("Could not build a question from that material.", 422)
        qid = await self.quizzes.create(user_id, quiz)
        return {"quiz_id": qid, "doc_id": doc_id, "title": doc.title, "question": quiz.question,
                "options": quiz.options, "generated_by": quiz.generated_by}      # never includes the key

    # ---------- answer ----------
    async def answer(self, user_id: str, quiz_id: str, chosen: int, tz_offset_min: Optional[int] = None,
                     confidence: Optional[str] = None) -> Dict[str, Any]:
        if not 0 <= chosen <= 3:
            raise LearningError("Choose one of the four options.")
        row = await self.quizzes.get(user_id, quiz_id)
        if not row:
            raise LearningError("Question not found.", 404)
        if row.get("answered_at"):
            raise LearningError("This question was already answered.", 409)
        correct = chosen == int(row["answer_index"])
        now = datetime.now(timezone.utc)
        created = row.get("created_at")
        seconds = (now - created).total_seconds() if isinstance(created, datetime) else None
        sources = row.get("option_sources") or []
        confused = sources[chosen] if (not correct and isinstance(sources, list) and chosen < len(sources)) else None
        local_hour = (now + timedelta(minutes=-tz_offset_min)).hour if tz_offset_min is not None else None
        if not await self.quizzes.mark_answered(user_id, quiz_id, chosen, correct):
            raise LearningError("This question was already answered.", 409)

        doc_id = row["doc_id"]
        async with self._locks[user_id]:
            try:
                profile = await self._profile(user_id)
                graph = await asyncio.to_thread(self.graph)
                before = self.mastery_map(profile).get(doc_id, 0.0)
                after, decision, new_profile = self._apply(
                    profile, graph, doc_id, correct, now, attempt={"s": seconds, "x": confused, "h": local_hour, "k": confidence,
                                  "u": int(row.get("hints_used") or 0)}, quiz_id=quiz_id)
                if not await self.profiles.update_profile(user_id, {
                        "concept_mastery": [m.model_dump(mode="json") for m in new_profile.concept_mastery],
                        "overall_stats": new_profile.overall_stats.model_dump(mode="json"),
                        "patterns": new_profile.patterns}):
                    raise RuntimeError("profile update affected no rows")
            except Exception:                            # don't burn the question if mastery could not be saved
                await self.quizzes.reopen(user_id, quiz_id)
                raise
        if self.emit:
            await self.emit(user_id, "orchestrator", f"{decision.action.title()}: {decision.reasoning}",
                            {"decision": decision.action, "concept": doc_id, "mastery": round(after, 3), "correct": correct})
        notes = row.get("notes") or []
        note = notes[chosen] if (not correct and isinstance(notes, list) and chosen < len(notes)) else ""
        nxt = [{"id": n.id, "title": n.title} for n in next_concepts(graph, self.effective_map(new_profile), 3)]
        return {"correct": correct, "correct_index": int(row["answer_index"]), "explanation": row.get("explanation", ""),
                "misconception": note, "mastery_before": round(before, 3), "mastery_after": round(after, 3),
                "mastered": after >= MASTERED, "hints_used": int(row.get("hints_used") or 0), "decision": {"action": decision.action, "reasoning": decision.reasoning,
                                                              "focus": decision.focus}, "next": nxt}

    def _apply(self, profile: StudentProfile, graph: Dict[str, ConceptNode], doc_id: str, correct: bool,
               now: Optional[datetime] = None, attempt: Optional[Dict[str, Any]] = None, quiz_id: Optional[str] = None) -> tuple[float, Decision, StudentProfile]:
        now = now or datetime.now(timezone.utc)
        node = graph.get(doc_id)
        a = attempt or {}
        params = params_for_level(node.level if node else 1)
        if correct:                                          # help and self-declared guessing make luck more likely
            params = assisted(params, a.get("u", 0), a.get("k"))
        entry = next((m for m in profile.concept_mastery if str(m.concept_id) == doc_id), None)
        if entry is None:
            entry = ConceptMastery(concept_id=doc_id, mastery_level=params.p_init, first_attempted=now, last_practiced=now)
            profile.concept_mastery.append(entry)
        entry.mastery_level = round(bkt_update(entry.mastery_level, correct, params), 4)
        entry.attempts_count += 1
        entry.avg_score = round(((entry.avg_score * (entry.attempts_count - 1)) + (1.0 if correct else 0.0)) / entry.attempts_count, 4)
        entry.last_practiced = now

        srs = profile.patterns.setdefault("srs", {})
        st = srs.get(doc_id, {})
        new_state, due = next_review(ReviewState(st.get("interval_days", 0.0), st.get("ease", 2.3), st.get("reps", 0)),
                                     correct, entry.mastery_level, now)
        srs[doc_id] = {"interval_days": new_state.interval_days, "ease": round(new_state.ease, 3), "reps": new_state.reps}
        entry.next_review_due = due
        entry.retention_score = 1.0

        log = profile.patterns.setdefault("attempts", [])
        a = attempt or {}
        log.append({"c": doc_id, "ok": bool(correct), "s": None if a.get("s") is None else round(a["s"], 1),
                    "t": now.isoformat(), "h": a.get("h"), "x": a.get("x"), "k": a.get("k"), "u": a.get("u", 0), "m": a.get("m")})
        del log[:-ATTEMPT_CAP]

        diag = profile.patterns.get("diagnostic")
        if diag and quiz_id is not None and diag.get("pending_quiz") == quiz_id:       # this answer belongs to the placement check
            diag["belief"] = diagnostic.update(diag["belief"], graph, doc_id, correct)
            diag["asked"][doc_id] = bool(correct)
            diag["pending_quiz"] = None
        strategy.credit(profile.patterns, doc_id, correct)          # settles the teaching-style trial for this concept

        recent = profile.patterns.setdefault("recent_results", {}).setdefault(doc_id, [])
        recent.append(bool(correct))
        del recent[:-6]

        stats = profile.overall_stats
        today = now.date()
        last = profile.patterns.get("last_active")
        last_day = datetime.fromisoformat(last).date() if last else None
        if last_day == today:
            pass
        elif last_day == today - timedelta(days=1):
            stats.current_streak += 1
        else:
            stats.current_streak = 1
        stats.longest_streak = max(stats.longest_streak, stats.current_streak)
        profile.patterns["last_active"] = now.isoformat()
        stats.total_sessions = max(stats.total_sessions, 1)
        mm = self.mastery_map(profile)
        stats.concepts_mastered = sum(1 for v in mm.values() if v >= MASTERED)

        hist = profile.patterns.setdefault("progress_history", [])
        avg = round(sum(mm.values()) / max(1, len(graph)), 4)       # overall mastery across the whole curriculum
        point = {"date": today.isoformat(), "mastery": round(avg * 100, 1)}
        if hist and hist[-1].get("date") == point["date"]:
            hist[-1] = point
        else:
            hist.append(point)
        del hist[:-HISTORY_CAP]
        eff = self.effective_map(profile)
        decision = decide(doc_id, correct, graph, eff, recent)
        return entry.mastery_level, decision, profile

    # ---------- views ----------
    async def path(self, user_id: str, goal: Optional[str] = None) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        graph = await asyncio.to_thread(self.graph)
        mm = self.mastery_map(profile)
        eff = self.effective_map(profile)
        assumed = {c for c in eff if c not in mm}
        steps = learning_path(graph, eff, goal)
        return {"goal": goal, "steps": [{"id": n.id, "title": n.title, "level": n.level, "domain": n.domain,
                                         "mastery": round(mm.get(n.id, 0.0), 3), "assumed": n.id in assumed,
                                         "why": ("Assumed known from your placement check: verify with a question" if n.id in assumed
                                                 else "Unlocked: prerequisites met" if all(eff.get(p, 0.0) >= 0.6 for p in n.prerequisites if p in graph)
                                                 else "Needs: " + ", ".join(graph[p].title for p in n.prerequisites if p in graph and eff.get(p, 0.0) < 0.6))}
                                        for n in steps],
                "minutes_estimate": len(steps) * 25}

    async def review_queue(self, user_id: str) -> List[Dict[str, Any]]:
        profile = await self._profile(user_id)
        graph = await asyncio.to_thread(self.graph)
        now = datetime.now(timezone.utc)
        out = []
        for m in profile.concept_mastery:
            if m.next_review_due is None or str(m.concept_id) not in graph:
                continue
            due = m.next_review_due if m.next_review_due.tzinfo else m.next_review_due.replace(tzinfo=timezone.utc)
            last = m.last_practiced if m.last_practiced.tzinfo else m.last_practiced.replace(tzinfo=timezone.utc)
            interval = profile.patterns.get("srs", {}).get(str(m.concept_id), {}).get("interval_days", 1.0)
            out.append({"id": str(m.concept_id), "title": graph[str(m.concept_id)].title, "due": due.isoformat(),
                        "overdue": due <= now, "mastery": round(m.mastery_level, 3),
                        "retention": round(retention((now - last).total_seconds() / 86400, interval), 3)})
        out.sort(key=lambda r: r["due"])
        return out

    # ---------- analyst & planner ----------
    async def insights(self, user_id: str) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        docs = await asyncio.to_thread(self._docs)
        return analyse(profile.patterns.get("attempts", []), self.mastery_map(profile), {d.id: d.title for d in docs})

    async def session_plan(self, user_id: str, minutes: int = 40, level: str = "beginner") -> Dict[str, Any]:
        profile = await self._profile(user_id)
        graph = await asyncio.to_thread(self.graph)
        mastery = self.effective_map(profile)
        analysis = analyse(profile.patterns.get("attempts", []), self.mastery_map(profile))
        due = [r["id"] for r in await self.review_queue(user_id) if r["overdue"]]
        return plan_session(graph, mastery, due, analysis, minutes, level)

    # ---------- teaching-style bandit ----------
    async def choose_style(self, user_id: str) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        stats = strategy.stats_of(profile.patterns)
        return {"style": strategy.choose(stats), **strategy.summary(stats)}

    async def note_explanation(self, user_id: str, concept: str, style: str) -> None:
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            strategy.note_explanation(profile.patterns, concept, style)
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})

    async def strategy_summary(self, user_id: str) -> Dict[str, Any]:
        return strategy.summary(strategy.stats_of((await self._profile(user_id)).patterns))

    # ---------- placement diagnostic ----------
    DIAG_TARGET = 8

    async def diagnostic_next(self, user_id: str, level: str = "beginner") -> Dict[str, Any]:
        """Start or continue the adaptive placement check; returns the next question, or the final placement."""
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            graph = await asyncio.to_thread(self.graph)
            measured = self.mastery_map(profile)
            diag = profile.patterns.get("diagnostic")
            if diag and diag.get("done"):
                return self._diag_view(diag)
            if not diag:
                diag = {"belief": {c: measured.get(c, diagnostic.PRIOR) for c in graph}, "asked": {},
                        "pending_quiz": None, "done": False, "started": datetime.now(timezone.utc).isoformat()}
            asked = set(diag["asked"])
            probe = None if len(asked) >= self.DIAG_TARGET else diagnostic.next_probe(
                diag["belief"], graph, asked, set(measured) - asked)
            if probe is None:
                diag.update(done=True, pending_quiz=None, placement=diagnostic.placement(
                    diag["belief"], diag["asked"], {c: v for c, v in measured.items() if c not in diag["asked"]}))
                profile.patterns["diagnostic"] = diag
                await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
                known = [c for c, v in diag["placement"].items() if v["status"] == "assumed_known"]
                if self.emit:
                    await self.emit(user_id, "analyst", f"Placement complete after {len(diag['asked'])} questions: "
                                    f"{len(known)} concepts assumed known from the prerequisite graph.", {"asked": len(diag["asked"])})
                return self._diag_view(diag)
        quiz = await self.create_quiz(user_id, probe, None, level)
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            diag["pending_quiz"] = quiz["quiz_id"]
            profile.patterns["diagnostic"] = diag
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        return {"done": False, "quiz": quiz, "progress": {"asked": len(diag["asked"]), "target": self.DIAG_TARGET}}

    def _diag_view(self, diag: Dict[str, Any]) -> Dict[str, Any]:
        place = diag.get("placement", {})
        return {"done": True, "progress": {"asked": len(diag["asked"]), "target": self.DIAG_TARGET},
                "assumed_known": sorted(c for c, v in place.items() if v["status"] == "assumed_known"),
                "likely_gaps": sorted(c for c, v in place.items() if v["status"] == "likely_gap")}

    async def diagnostic_reset(self, user_id: str) -> None:
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            profile.patterns.pop("diagnostic", None)
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})

    # ---------- goal & deadline ----------
    async def set_goal(self, user_id: str, goal: Optional[str], deadline: date, daily_minutes: int) -> Dict[str, Any]:
        graph = await asyncio.to_thread(self.graph)
        if goal and goal not in graph:
            raise LearningError("Unknown goal concept.", 404)
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            profile.patterns["goal"] = {"concept": goal, "deadline": deadline.isoformat(), "daily_minutes": daily_minutes}
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        return await self.goal_plan(user_id)

    async def goal_plan(self, user_id: str) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        g = profile.patterns.get("goal")
        if not g:
            return {"goal": None}
        path = await self.path(user_id, g.get("concept"))
        plan = plan_goal(path["steps"], date.fromisoformat(g["deadline"]), int(g["daily_minutes"]))
        return {"goal": g, **plan}

    # ---------- journal ----------
    async def journal(self, user_id: str, days: int = 7) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        docs = await asyncio.to_thread(self._docs)
        return build_journal(profile.patterns.get("attempts", []), self.mastery_map(profile), {d.id: d.title for d in docs},
                             profile.patterns.get("progress_history", []), days)

    # ---------- hints ----------
    async def hint(self, user_id: str, quiz_id: str) -> Dict[str, Any]:
        """Progressive help before answering. 1: rule one wrong option out. 2: show the source passage."""
        row = await self.quizzes.get(user_id, quiz_id)
        if not row:
            raise LearningError("Question not found.", 404)
        if row.get("answered_at"):
            raise LearningError("This question was already answered.", 409)
        level = min(2, int(row.get("hints_used") or 0) + 1)
        if level == 1:
            wrong = [i for i in range(len(row["options"])) if i != int(row["answer_index"])]
            out = {"level": 1, "eliminate": wrong[sum(map(ord, quiz_id)) % len(wrong)],
                   "text": "One option is ruled out. A correct answer now earns slightly less mastery."}
        else:
            chunk = (await asyncio.to_thread(self.store.get_chunks, [row["chunk_id"]])).get(row["chunk_id"]) if row.get("chunk_id") else None
            if not chunk:
                return {"level": 2, "text": "No source passage is available for this question.", "eliminate": None}
            out = {"level": 2, "eliminate": None, "source": chunk.text[:600], "heading": chunk.heading_path,
                   "text": "Here is the passage this question was written from. A correct answer now earns less mastery."}
        await self.quizzes.bump_hints(user_id, quiz_id, level)
        return out

    # ---------- teach-back ----------
    async def teachback(self, user_id: str, doc_id: str, explanation: str) -> Dict[str, Any]:
        """Grade the learner's own explanation against the concept's material; a graded attempt updates mastery."""
        if self.embedder is None and getattr(self, "load_models", None):
            pipe = await self.load_models()
            self.embedder, self.nli = pipe.embedder, pipe.nli
        if self.embedder is None:
            raise LearningError("Teach-back is unavailable right now.", 503)
        doc = await asyncio.to_thread(self.store.get_document, doc_id)
        if not doc:
            raise LearningError("Unknown concept.", 404)
        passages = [t for _, t in await asyncio.to_thread(self.store.passages_for_doc, doc_id) if len(t) >= 80]
        if not passages:
            raise LearningError("This concept has no material to check against yet.", 404)
        result = await asyncio.to_thread(teachback.grade, explanation, passages[:12], self.embedder, self.nli)
        result["concept"] = {"id": doc_id, "title": doc.title}
        if not result["graded"]:
            return result
        now = datetime.now(timezone.utc)
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            graph = await asyncio.to_thread(self.graph)
            before = self.mastery_map(profile).get(doc_id, 0.0)
            recent = any(a.get("m") == "teachback" and a["c"] == doc_id and datetime.fromisoformat(a["t"]) > now - timedelta(hours=24)
                         for a in profile.patterns.get("attempts", []))
            if recent:                                   # feedback is unlimited, but one graded teach-back per concept per day moves mastery
                result.update({"mastery_before": round(before, 3), "mastery_after": round(before, 3), "mastery_updated": False,
                               "decision": None, "note": "You already taught this concept back today, so your mastery was not changed again."})
                return result
            after, decision, new_profile = self._apply(profile, graph, doc_id, bool(result["passed"]), now, attempt={"m": "teachback"})
            if not await self.profiles.update_profile(user_id, {
                    "concept_mastery": [m.model_dump(mode="json") for m in new_profile.concept_mastery],
                    "overall_stats": new_profile.overall_stats.model_dump(mode="json"),
                    "patterns": new_profile.patterns}):
                raise LearningError("Could not save your progress. Try again.", 503)
        if self.emit:
            await self.emit(user_id, "evaluator", f"Teach-back on {doc.title}: score {result['score']:.2f}, {'passed' if result['passed'] else 'not yet'}",
                            {"concept": doc_id, "score": result["score"], "mode": "teachback"})
        result.update({"mastery_before": round(before, 3), "mastery_after": round(after, 3), "mastery_updated": True,
                       "decision": {"action": decision.action, "reasoning": decision.reasoning}})
        return result

    # ---------- evidence lab (opt-in pre/post study) ----------
    @staticmethod
    def _study_view(st: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not st:
            return {"joined": False, "step": "join", "concepts": study.CONCEPTS}
        return {"joined": True, "step": study.next_step(st), "concepts": st["concepts"],
                "pre_score": st["pre"]["score"], "post_score": st["post"]["score"],
                "pre_answered": len(st["pre"]["answers"]), "post_answered": len(st["post"]["answers"])}

    async def study_status(self, user_id: str) -> Dict[str, Any]:
        return self._study_view((await self._profile(user_id)).patterns.get("study"))

    async def study_join(self, user_id: str) -> Dict[str, Any]:
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            patterns = profile.patterns
            if not patterns.get("study"):
                patterns["study"] = study.new_state(datetime.now(timezone.utc).isoformat())
                await self.profiles.update_profile(user_id, {"patterns": patterns})
            return self._study_view(patterns["study"])

    async def study_start(self, user_id: str, phase: str) -> Dict[str, Any]:
        """Create (once) the phase's questions; calling again returns the same ones."""
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            st = profile.patterns.get("study")
            if not st:
                raise LearningError("Join the study first.", 409)
            step = study.next_step(st)
            if step != phase:
                raise LearningError(f"The {phase}-test is not available now (current step: {step}).", 409)
            ph = st[phase]
            if not ph["quizzes"]:
                async def two(c):
                    out: List[Dict[str, Any]] = []
                    for _ in range(study.PER_CONCEPT * 3):
                        q = await self.create_quiz(user_id, c, None, "beginner")
                        if frozenset(q["options"]) not in [frozenset(o["options"]) for o in out]:       # a repeat of the same item is not a second item
                            out.append(q)
                        if len(out) == study.PER_CONCEPT:
                            break
                    return out
                groups = await asyncio.gather(*(two(c) for c in st["concepts"]))
                items = [q for g in groups for q in g]
                if len(items) < study.PER_CONCEPT * len(st["concepts"]):
                    raise LearningError("Could not build the full test right now. Try again in a minute.", 503)
                ph["quizzes"] = [q["quiz_id"] for q in items]
                await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        rows = [await self.quizzes.get(user_id, q) for q in ph["quizzes"]]
        return {"phase": phase, "items": [{"quiz_id": r["id"], "doc_id": r["doc_id"], "question": r["question"], "options": r["options"],
                                           "answered": r["id"] in ph["answers"]} for r in rows if r]}

    async def study_answer(self, user_id: str, phase: str, quiz_id: str, chosen: int) -> Dict[str, Any]:
        """Record an answer without feedback or mastery changes, so the test does not teach."""
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            st = profile.patterns.get("study")
            if not st or study.next_step(st) != phase or quiz_id not in st[phase]["quizzes"]:
                raise LearningError("That question is not part of your current test.", 409)
            if quiz_id in st[phase]["answers"]:
                raise LearningError("Already answered.", 409)
            row = await self.quizzes.get(user_id, quiz_id)
            if not row or not 0 <= chosen < len(row["options"]):
                raise LearningError("Choose one of the options.")
            correct = chosen == int(row["answer_index"])
            await self.quizzes.mark_answered(user_id, quiz_id, chosen, correct)
            st[phase]["answers"][quiz_id] = correct
            st[phase]["score"] = study.phase_score(st[phase])
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
            view = self._study_view(st)
        return {"recorded": True, **view}

    async def study_result(self, user_id: str) -> Dict[str, Any]:
        st = (await self._profile(user_id)).patterns.get("study")
        if not st or study.next_step(st) != "done":
            raise LearningError("Finish both tests to see your result.", 409)
        return {"pre": st["pre"]["score"], "post": st["post"]["score"], "gain": round(st["post"]["score"] - st["pre"]["score"], 3),
                "items_per_test": len(st["pre"]["quizzes"])}

    # ---------- preferences / leaderboard opt-in ----------
    async def get_prefs(self, user_id: str) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        lb = profile.patterns.get("leaderboard") or {}
        return {**prefs.merged(profile.patterns.get("prefs")), "leaderboard_nickname": lb.get("nickname")}

    async def set_prefs(self, user_id: str, raw: Dict[str, Any]) -> Dict[str, Any]:
        try:
            async with self._locks[user_id]:
                profile = await self._profile(user_id)
                current = prefs.merged(profile.patterns.get("prefs"))
                if "ui" in raw:                                       # a partial appearance change keeps the rest
                    raw = {**raw, "ui": {**current["ui"], **(raw["ui"] or {})}}
                profile.patterns["prefs"] = prefs.clean_prefs({**current, **raw})
                await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        except prefs.PrefsError as e:
            raise LearningError(str(e))
        return await self.get_prefs(user_id)

    async def set_leaderboard(self, user_id: str, nickname: Optional[str]) -> Dict[str, Any]:
        try:
            nick = prefs.clean_nickname(nickname) if nickname else None
        except prefs.PrefsError as e:
            raise LearningError(str(e))
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            if nick:
                profile.patterns["leaderboard"] = {"nickname": nick}
            else:
                profile.patterns.pop("leaderboard", None)
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        return await self.get_prefs(user_id)

    # ---------- coding profiles (Settings) ----------
    async def get_coding_profiles(self, user_id: str, force: bool = False) -> Dict[str, Any]:
        profile = await self._profile(user_id)
        handles = dict(profile.patterns.get("coding_profiles") or {})
        done = profile.patterns.get("coding_verified") or {}
        verification = {p: {"verified": (done.get(p) or {}).get("handle", "").lower() == h.lower(),
                            "verified_at": (done.get(p) or {}).get("at") if (done.get(p) or {}).get("handle", "").lower() == h.lower() else None,
                            "code": coding_profiles.verification_code(settings.verify_secret, user_id, p, h),
                            "where": coding_profiles.VERIFY_FIELDS[p]}
                        for p, h in handles.items()}
        return {"handles": handles, "cards": await coding_profiles.cards(handles, force=force), "verification": verification}

    async def verify_coding_profile(self, user_id: str, platform: str) -> Dict[str, Any]:
        """Reads the platform's public profile now and checks for the learner's code (proof they own the handle)."""
        if platform not in coding_profiles.PLATFORMS:
            raise LearningError("Unknown platform.", 404)
        profile = await self._profile(user_id)
        handle = (profile.patterns.get("coding_profiles") or {}).get(platform)
        if not handle:
            raise LearningError("Link this profile first.")
        code = coding_profiles.verification_code(settings.verify_secret, user_id, platform, handle)
        result = await coding_profiles.verify(platform, handle, code)
        if result["verified"]:
            async with self._locks[user_id]:
                profile = await self._profile(user_id)
                profile.patterns.setdefault("coding_verified", {})[platform] = {"handle": handle, "at": datetime.now(timezone.utc).isoformat()}
                await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        return {"platform": platform, **result, **(await self.get_coding_profiles(user_id))}

    async def set_coding_profiles(self, user_id: str, raw: Dict[str, Any]) -> Dict[str, Any]:
        try:
            clean = coding_profiles.clean_handles(raw)
        except coding_profiles.ProfileError as e:
            raise LearningError(str(e))
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            merged = {**(profile.patterns.get("coding_profiles") or {}), **{k: v for k, v in clean.items()}}
            for k, v in raw.items():                                  # an empty value removes that link
                if not (v or "").strip():
                    merged.pop(k, None)
            profile.patterns["coding_profiles"] = merged
            await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
        return await self.get_coding_profiles(user_id)

    # ---------- teacher / parent view ----------
    async def shared_summary(self, user_id: str) -> Dict[str, Any]:
        """Read-only progress for a shared link: numbers and alerts only, never answers or anything the learner typed."""
        profile = await self._profile(user_id)
        docs = await asyncio.to_thread(self._docs)
        titles = {d.id: d.title for d in docs}
        mastery = self.mastery_map(profile)
        analysis = analyse(profile.patterns.get("attempts", []), mastery, titles)
        stats = profile.overall_stats
        due = [r for r in await self.review_queue(user_id) if r["overdue"]]
        alerts = [{"title": sg["title"].replace("You keep mixing up", "Keeps mixing up"), "severity": sg["severity"],
                   "suggestion": TALKING_POINTS.get(sg["action"], "")} for sg in analysis["signals"]]     # neutral wording, no learner-addressed text
        return {
            "concepts": [{"id": d.id, "title": d.title, "mastery": round(mastery.get(d.id, 0.0), 3)} for d in docs],
            "mastered": sum(1 for v in mastery.values() if v >= MASTERED), "total_concepts": len(docs),
            "streak_days": stats.current_streak, "answers": analysis["attempts"], "accuracy": analysis["accuracy"],
            "reviews_overdue": len(due), "alerts": alerts, "best_time_of_day": analysis["best_time_of_day"],
            "goal": self._shared_goal(profile.patterns.get("goal"), mastery, titles),
            "longest_streak": stats.longest_streak,
            "levels": [{"level": lv, "mastered": sum(1 for d in docs if d.level == lv and mastery.get(d.id, 0) >= MASTERED),
                        "total": sum(1 for d in docs if d.level == lv)} for lv in (1, 2, 3)],
            "strongest": [{"title": titles[c], "mastery": round(v, 3)} for c, v in sorted(mastery.items(), key=lambda kv: -kv[1])
                          if v > 0 and c in titles][:3],
            "focus": [{"title": titles[c], "mastery": round(v, 3)} for c, v in sorted(mastery.items(), key=lambda kv: kv[1])
                      if 0 < v < MASTERED and c in titles][:3],
            "challenges": {"passed": sum(1 for st in (profile.patterns.get("challenges") or {}).values() if st.get("passed")),
                           "total": len(challenges.load())},
            "progress": rhythm.daily_progress(profile.patterns.get("progress_history") or [], profile.patterns.get("attempts") or [],
                                       datetime.now(timezone.utc)),
            "weekly": rhythm.rhythm(profile.patterns.get("attempts") or [], datetime.now(timezone.utc))["weekly"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _shared_goal(goal, mastery, titles):
        if not goal:
            return None
        concept = goal.get("concept")
        return {"target": titles.get(concept, "Whole curriculum") if concept else "Whole curriculum",
                "deadline": goal.get("deadline"), "daily_minutes": goal.get("daily_minutes"),
                "progress": round(mastery.get(concept, 0.0), 3) if concept else
                round(sum(1 for v in mastery.values() if v >= MASTERED) / max(1, len(titles)), 3)}

    # ---------- code challenges ----------
    async def challenge_list(self, user_id: str) -> List[Dict[str, Any]]:
        state = (await self._profile(user_id)).patterns.get("challenges", {})
        return [challenges.public_view(c, state.get(c["id"], {})) for c in challenges.load()]

    async def challenge_hint(self, user_id: str, challenge_id: str) -> Dict[str, Any]:
        """The learner asks for the hint before the ladder offers it. Recorded, so passing afterwards earns hint-level credit."""
        c = challenges.get(challenge_id)
        if not c:
            raise LearningError("Unknown challenge.", 404)
        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            st = profile.patterns.setdefault("challenges", {}).setdefault(challenge_id, {"fails": 0, "passed": False})
            if not st.get("hint_taken"):
                st["hint_taken"] = True
                await self.profiles.update_profile(user_id, {"patterns": profile.patterns})
            return challenges.public_view(c, st)

    async def challenge_submit(self, user_id: str, challenge_id: str, code: str) -> Dict[str, Any]:
        c = challenges.get(challenge_id)
        if not c:
            raise LearningError("Unknown challenge.", 404)
        if not code.strip() or len(code) > challenges.MAX_CODE:
            raise LearningError("Submit between 1 and 8000 characters of code.")
        try:
            results = await challenges.grade(code, c["tests"])
        except RuntimeError:
            raise LearningError("The code runner is busy. Try again in a few seconds.", 429)
        except Exception:
            raise LearningError("The code execution service is unavailable right now.", 503)
        passed = all(r["ok"] for r in results)

        async with self._locks[user_id]:
            profile = await self._profile(user_id)
            st = profile.patterns.setdefault("challenges", {}).setdefault(challenge_id, {"fails": 0, "passed": False})
            graph = await asyncio.to_thread(self.graph)
            before = self.mastery_map(profile).get(c["concept"], 0.0)
            record = None                                         # (correct, hints) to feed the learner model, at most twice per challenge
            if passed and not st["passed"]:
                record = (True, 2 if st["fails"] >= challenges.SOLUTION_AFTER
                          else (1 if st["fails"] >= challenges.HINT_AFTER or st.get("hint_taken") else 0))
                st["passed"] = True
            elif not passed and not st["passed"]:
                st["fails"] += 1
                if st["fails"] == 1:
                    record = (False, 0)
            after, decision = before, None
            if record is not None and c["concept"] in graph:
                after, decision, profile = self._apply(profile, graph, c["concept"], record[0],
                                                       attempt={"s": None, "x": None, "h": None, "k": None, "u": record[1]})
            await self.profiles.update_profile(user_id, {"concept_mastery": [m.model_dump(mode="json") for m in profile.concept_mastery],
                                                         "overall_stats": profile.overall_stats.model_dump(mode="json"),
                                                         "patterns": profile.patterns})
            view = challenges.public_view(c, st)
        if self.emit and decision is not None:
            await self.emit(user_id, "assessor", f"Challenge '{c['title']}' {'passed' if passed else 'not passed yet'}: "
                            f"{decision.reasoning}", {"challenge": challenge_id, "passed": passed})
        shown = [{"ok": r["ok"], "status": r["status"], "error": r["error"], "got": r["got"] if i == 0 else None}
                 for i, r in enumerate(results)]            # actual output only for the sample test; others are pass/fail
        return {"passed": passed, "tests_passed": sum(r["ok"] for r in results), "tests_total": len(results), "results": shown,
                "challenge": view, "mastery_before": round(before, 3), "mastery_after": round(after, 3),
                "decision": None if decision is None else {"action": decision.action, "reasoning": decision.reasoning}}
