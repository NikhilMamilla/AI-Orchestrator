import re
import uuid
import logging
from dataclasses import asdict
from typing import Dict, List, Optional, Any

from backend.app.agents.assessment.evaluator import AnswerEvaluator
from backend.app.agents.orchestrator.decision_engine import DecisionEngine, DecisionType
from backend.app.agents.orchestrator.session_planner import SessionPlanner
from backend.app.agents.teaching.agent import TeachingAgent
from backend.app.learning import analyst
from backend.app.learning.policy import ConceptNode
from backend.app.rag.types import Answer

logger = logging.getLogger(__name__)

# The whole message must be one of these to count as "start the lesson" (never a word inside a longer question).
START_PHRASES = {"start", "begin", "go", "ok", "okay", "start learning", "begin learning", "lets start", "let us start",
                 "lets begin", "start the lesson", "begin the lesson", "dive in", "first topic"}
CONFUSED_PHRASES = ("dont understand", "do not understand", "confused", "not sure", "no idea", "dont get", "unclear",
                    "makes no sense", "im lost", "i am lost")

NO_KNOWLEDGE_BASE = ("The course notes aren't available right now, so I can't answer from them. "
                     "Please try again in a moment.")


def _normal(text: str) -> str:
    """Lower-case, apostrophes removed, punctuation dropped, spaces collapsed: "Let's start!" -> "lets start"."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text.lower().replace("'", "").replace("’", ""))).strip()


def answer_payload(ans: Answer) -> Dict[str, Any]:
    """The answer in the shape the Ask page already renders (text, status, confidence, citations, evidence)."""
    t = ans.trace or {}
    return {"text": ans.text, "status": ans.status, "confidence": ans.confidence, "citations": ans.citations,
            "unsupported_claims": ans.unsupported_claims, "evidence": [asdict(e) for e in ans.evidence],
            "trace": {"mode": t.get("mode"), "cache_hit": t.get("cache_hit")}}


class OrchestratorAgent:
    """
    Master Orchestrator Agent

    Responsibilities:
    - Coordinate all other agents
    - Make strategic decisions about learning journey
    - Plan sessions (short, medium, long-term)
    - Manage learning loop
    - Adapt entire system based on student needs

    Every piece of teaching content comes from the course notes through the same pipeline as the Ask page (`rag`), and
    a step that cannot be done for real says so; none returns a fixed stand-in result.
    """

    def __init__(
        self,
        llm_service: Any,
        rag: Any = None
    ):
        self.llm_service = llm_service
        self.rag = rag                                # the RAGPipeline: knowledge store, retrieval, verified answers
        self.decision_engine = DecisionEngine(self._graph)
        self.session_planner = SessionPlanner()
        self.agent_name = "orchestrator"

    # ---------------------------------------------------------------- helpers
    @property
    def _store(self):
        return getattr(self.rag, "store", None)

    def _graph(self) -> Dict[str, ConceptNode]:
        store = self._store
        if store is None:
            return {}
        return {d.id: ConceptNode(d.id, d.title, d.level, list(d.prerequisites), d.domain) for d in store.list_documents()}

    @staticmethod
    def _mastery_of(profile: Dict) -> Dict[str, float]:
        return {str(m["concept_id"]): float(m.get("mastery_level", 0.0))
                for m in (profile or {}).get("concept_mastery", []) if isinstance(m, dict) and "concept_id" in m}

    # ---------------------------------------------------------------- session
    async def start_learning_session(
        self,
        student_id: str,
        student_profile: Dict,
        initial_concept_id: Optional[str] = None,
        available_time_minutes: int = 40
    ) -> Dict:
        """Start a new learning session"""
        logger.info("[Orchestrator] Starting session for %s", student_id)
        session_id = f"session_{uuid.uuid4().hex[:8]}"

        # Create session plan
        session_plan = self.session_planner.plan_session(
            student_profile=student_profile,
            current_goal=student_profile.get("current_goal"),
            available_time_minutes=available_time_minutes
        )

        # Determine starting concept
        if not initial_concept_id:
            initial_concept_id = self._determine_starting_concept(student_profile)

        student_level_int = self._get_student_level_score(student_profile)
        content_package = await self._request_content(
            concept_id=initial_concept_id,
            student_level=student_level_int
        )

        lesson = await self._request_lesson(
            content_package=content_package,
            student_context={
                "student_id": student_id,
                "student_level": student_level_int,
                "learning_style": student_profile.get("learning_style", {}).get("primary_modality", "visual")
            }
        )

        return {
            "session_id": session_id,
            "session_plan": session_plan,
            "current_activity": {
                "type": "teaching",
                "concept_id": initial_concept_id,
                "lesson": lesson
            },
            "status": "active"
        }

    async def get_initial_greeting(
        self,
        student_profile: Dict,
        session_id: str
    ) -> str:
        """The opening message. Plain text, no language model: it states no facts about DSA, so there is nothing to ground."""
        name = student_profile.get("name") or "there"
        mastered = self._get_student_level_score(student_profile)
        progress = f" You've mastered {mastered} concept{'s' if mastered != 1 else ''} so far." if mastered else ""
        return (f"Hi {name}! I'm Kiddoo.{progress} Ask me anything about data structures and algorithms: every answer comes "
                "from the course notes, with sources you can open, and if the notes don't cover it I'll say so. "
                "Or type **start** and I'll begin with the next concept on your roadmap.")

    async def process_student_response(
        self,
        session_id: str,
        student_id: str,
        response_data: Dict,
        session_state: Dict
    ) -> Dict:
        """Process a student's message and decide the next action"""
        logger.info(f"[{self.agent_name}] Processing response in session {session_id}")

        kind = response_data.get("interaction_type") or response_data.get("type") or "chat"
        raw = response_data.get("answer")
        answer = raw.strip() if isinstance(raw, str) else ""
        current_concept = session_state.get("current_concept_id")
        profile = session_state.get("student_profile") or {}

        if not answer:
            return {"action": "chat_reply", "content": "Please type a question or an answer first."}

        # Assessment answer
        if kind == "assessment_answer":
            evaluation = await self._evaluate_answer(question=session_state.get("current_question"), answer=answer)
            if evaluation.get("is_correct") is None:                    # nothing could be graded: say so, do not count it
                return {"action": "chat_reply", "content": evaluation["feedback"]}

            session_state.setdefault("evaluations", []).append(evaluation)

            if len(session_state["evaluations"]) >= session_state.get("total_questions", 5):
                return await self._handle_assessment_complete(session_id, student_id, session_state)
            if session_state.get("remaining_questions"):
                return {"action": "ask_question", "question": session_state["remaining_questions"].pop(0)}
            return await self._handle_assessment_complete(session_id, student_id, session_state)

        # Comprehension check
        if kind == "comprehension_check":
            if self._quick_comprehension_check(response_data):
                return {"action": "continue_teaching"}
            adapted_explanation = await self._adapt_teaching(
                current_concept=current_concept,
                student_feedback=answer,
                context=session_state
            )
            return {"action": "provide_clarification", "content": adapted_explanation}

        # An explicit "start": the whole message is a start phrase, and no concept is under way
        if not current_concept and _normal(answer) in START_PHRASES:
            next_concept = self._determine_starting_concept(profile)
            session_state["current_concept_id"] = next_concept
            student_level = self._get_student_level_score(profile)
            content_package = await self._request_content(concept_id=next_concept, student_level=student_level)
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={"student_id": student_id, "student_level": student_level}
            )
            return {
                "action": "advance",
                "reasoning": f"You asked to start. Beginning with: {content_package.get('title') or next_concept}",
                "next_concept": next_concept,
                "lesson": lesson
            }

        # Everything else is a question for the tutor: answered from the notes, with sources, or refused
        ans = await self.grounded_reply(answer, profile, session_state.get("interactions", [])[-5:])
        return {"action": "chat_reply", "content": ans.text, "answer": answer_payload(ans)}

    async def grounded_reply(self, user_message: str, student_profile: Dict, session_history: List[Dict]) -> Answer:
        """Answer one chat turn through the RAG pipeline: screen, guard, evidence gate, verify, cite. The pipeline also screens
        the history and drops assistant turns, so nothing the client sends can steer the model."""
        if self.rag is None:
            return Answer(text=NO_KNOWLEDGE_BASE, status="error", confidence=0.0, citations=[], unsupported_claims=[],
                          evidence=[], trace={})
        return await self.rag.answer(user_message, level="auto", history=list(session_history),
                                     mastery=self._mastery_of(student_profile))

    async def generate_tutor_response(self, user_message: str, student_profile: Dict, session_history: List[Dict]) -> str:
        """The text of a grounded reply (kept for callers that only want the words)."""
        return (await self.grounded_reply(user_message, student_profile, session_history)).text

    async def _handle_assessment_complete(
        self,
        session_id: str,
        student_id: str,
        session_state: Dict
    ) -> Dict:
        """Handle completion of assessment and decide next action"""
        logger.info(f"[{self.agent_name}] Assessment complete, making strategic decision")

        assessment_results = {
            "session_id": session_id,
            "concept_id": session_state.get("current_concept_id"),
            "evaluations": session_state.get("evaluations", [])
        }

        analysis = await self._request_analysis(
            session_id=session_id,
            student_id=student_id,
            session_data={
                "assessment_results": [assessment_results],
                "interactions": session_state.get("interactions", []),
                "duration_minutes": session_state.get("elapsed_minutes", 0)
            }
        )

        decision = self.decision_engine.decide_next_action(
            current_state={
                "concept_id": session_state.get("current_concept_id"),
                "mastery_level": analysis.get("performance_analysis", {}).get("mastery_level") or 0.0
            },
            analyst_recommendations=analysis.get("recommendations", {}),
            student_profile=session_state.get("student_profile", {}),
            session_context={
                "fatigue_level": analysis.get("fatigue_analysis", {}).get("fatigue_level", "none"),
                "frustration_level": session_state.get("frustration_level", "low")
            }
        )

        return await self._execute_decision(decision, student_id, session_state)

    async def _emit(self, agent: str, message: str, meta: Dict) -> None:
        sink = getattr(self, "event_sink", None)
        if sink:
            try:
                await sink(agent, message, meta)
            except Exception:                       # observability must never break teaching
                logger.debug("event sink failed", exc_info=True)

    async def _execute_decision(
        self,
        decision: Dict,
        student_id: str,
        session_state: Dict
    ) -> Dict:
        """Execute the decision made by decision engine"""
        decision_type = decision["decision"]
        await self._emit("orchestrator", f"{decision_type.value.replace('_', ' ').title()}: {decision.get('reasoning', '')}",
                         {"decision": decision_type.value, "next_concept_id": decision.get("next_concept_id"),
                          "teaching_strategy": decision.get("teaching_strategy")})

        if decision_type == DecisionType.ADVANCE:
            next_concept_id = decision["next_concept_id"]
            content_package = await self._request_content(
                concept_id=next_concept_id,
                student_level=decision["parameters"].get("difficulty_level", 2)
            )
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={
                    "student_id": student_id,
                    "teaching_strategy": decision.get("teaching_strategy")
                }
            )
            return {
                "action": "advance",
                "reasoning": decision["reasoning"],
                "next_concept": next_concept_id,
                "lesson": lesson
            }
        elif decision_type == DecisionType.REVIEW:
            return {
                "action": "review",
                "reasoning": decision["reasoning"],
                "focus_areas": decision["parameters"].get("focus_on", "weak_areas")
            }
        elif decision_type == DecisionType.BREAK:
            return {
                "action": "suggest_break",
                "reasoning": decision["reasoning"],
                "break_duration_minutes": decision["parameters"].get("break_duration_minutes", 15)
            }
        elif decision_type == DecisionType.REMEDIATE:
            prereq_concept_id = decision["next_concept_id"]
            content_package = await self._request_content(
                concept_id=prereq_concept_id,
                student_level=1
            )
            lesson = await self._request_lesson(
                content_package=content_package,
                student_context={"student_id": student_id, "is_remediation": True}
            )
            return {
                "action": "remediate",
                "reasoning": decision["reasoning"],
                "prerequisite_concept": prereq_concept_id,
                "lesson": lesson
            }
        elif decision_type == DecisionType.SWITCH:
            return {
                "action": "switch",
                "reasoning": decision["reasoning"],
                "alternative_concept": decision["next_concept_id"]
            }
        else:
            return {"action": "continue"}

    async def _request_content(self, concept_id: Optional[str], student_level: int) -> Dict:
        """The concept's own notes from the knowledge store (flagged unavailable when there are none)."""
        store = self._store
        doc = store.get_document(concept_id) if (store is not None and concept_id) else None
        if doc is None:
            return {"concept_id": concept_id, "title": concept_id, "content": None, "unavailable": True}
        passages = [text for _, text in store.passages_for_doc(doc.id)][:3]
        return {"concept_id": doc.id, "title": doc.title,
                "content": {"explanation": " ".join(passages)[:1500], "difficulty_context": self._level_to_string(student_level)}}

    async def _request_lesson(self, content_package: Dict, student_context: Dict) -> Dict:
        """A lesson is the grounded, cited explanation of the concept, written from the notes by the same pipeline as Ask."""
        title = content_package.get("title") or "this topic"
        if content_package.get("unavailable") or self.rag is None:
            return {"lesson_content": f"I don't have course notes on {title} yet, so I can't teach it from the material.",
                    "teaching_strategy": "none", "concept_title": title, "status": "unavailable"}
        level = self._level_to_string(student_context.get("student_level", 0))
        ans = await self.rag.answer(f"Explain {title}", level=level)
        return {"lesson_content": ans.text, "teaching_strategy": "grounded", "concept_title": title,
                "status": ans.status, "answer": answer_payload(ans)}

    async def _evaluate_answer(self, question: Optional[Dict], answer: str) -> Dict:
        """Grade an answer with the Assessment agent's evaluator (is_correct is None when nothing could be graded)."""
        if not question:
            return {"is_correct": None, "score": None, "feedback": "There is no active question to grade yet."}
        try:
            return await AnswerEvaluator(self.llm_service).evaluate_answer(question, answer, None)
        except Exception:
            logger.exception("answer evaluation failed")
            return {"is_correct": None, "score": None, "feedback": "I couldn't grade that answer right now. Please try again."}

    async def _request_analysis(self, session_id: str, student_id: str, session_data: Dict) -> Dict:
        """Analyse the session's graded answers with the rule-based Analyst (mastery_level is None when nothing was graded)."""
        results = session_data.get("assessment_results") or [{}]
        concept = results[0].get("concept_id") or "unknown"
        graded = [e for r in results for e in (r.get("evaluations") or []) if e.get("score") is not None]
        attempts = [{"c": concept, "ok": bool(e.get("is_correct")), "s": None, "t": None, "h": None, "x": None} for e in graded]
        report = analyst.analyse(attempts) if attempts else {"signals": []}
        signals = {s.get("id") for s in report.get("signals", [])}
        mastery = round(sum(float(e["score"]) for e in graded) / len(graded), 3) if graded else None
        if "struggle" in signals:
            action = "review"
        elif "rapid_wrong" in signals:
            action = "break"
        elif mastery is None:
            action = "continue"
        else:
            action = "advance" if mastery >= 0.8 else "practice" if mastery >= 0.5 else "review"
        return {"performance_analysis": {"mastery_level": mastery, "graded_answers": len(graded)},
                "recommendations": {"primary_action": action}, "signals": report.get("signals", [])}

    async def _adapt_teaching(self, current_concept: Optional[str], student_feedback: str, context: Dict) -> str:
        """A simpler explanation from the Teaching agent, starting from the concept's own notes."""
        notes = await self._request_content(current_concept, 1)
        original = (notes.get("content") or {}).get("explanation") or ""
        profile = context.get("student_profile") or {}
        return await TeachingAgent(self.llm_service).adapt_explanation(
            original_explanation=original or "(no course notes for this concept)",
            student_feedback=student_feedback,
            context={"student_level": self._level_to_string(self._get_student_level_score(profile)),
                     "learning_style": (profile.get("learning_style") or {}).get("primary_modality", "visual")})

    def _determine_starting_concept(self, profile: Dict) -> Optional[str]:
        """The first concept of the learner's path, else the easiest concept in the notes that has no prerequisites."""
        path = (profile or {}).get("current_learning_path", [])
        if path:
            return path[0]
        roots = [n for n in self._graph().values() if not n.prerequisites]
        return min(roots, key=lambda n: (n.level, n.title)).id if roots else None

    def _get_student_level_score(self, profile: Dict) -> int:
        """Determine student's current level as a score (0-10)"""
        mastery = (profile or {}).get("concept_mastery", [])
        mastery_count = len([m for m in mastery if (isinstance(m, dict) and m.get("mastery_level", 0) >= 0.8)])
        return min(mastery_count, 10)

    def _level_to_string(self, level: int) -> str:
        """Convert numeric level to string"""
        if level <= 2: return "beginner"
        if level <= 4: return "intermediate"
        return "advanced"

    def _quick_comprehension_check(self, response: Dict) -> bool:
        """The learner understood unless they said they are lost."""
        answer = response.get("answer")
        return isinstance(answer, str) and not any(p in _normal(answer) for p in CONFUSED_PHRASES)
