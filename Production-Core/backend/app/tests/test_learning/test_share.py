"""Teacher/parent view: nothing the learner typed is exposed, alerts carry talking points, tokens are hashed."""
from backend.app.api.v1.share import _hash


def test_token_is_stored_only_as_a_hash():
    h = _hash("abc")
    assert len(h) == 64 and "abc" not in h and _hash("abc") == h and _hash("abd") != h


async def test_shared_summary_has_numbers_and_alerts_but_no_answers_or_text(svc):
    for _ in range(4):
        q = await svc.create_quiz("u70", "arrays")
        row = svc.quizzes.rows[q["quiz_id"]]
        await svc.answer("u70", q["quiz_id"], next(i for i in range(4) if i != row["answer_index"]), confidence="sure")
    s = await svc.shared_summary("u70")
    assert s["answers"] == 4 and s["accuracy"] == 0.0 and s["total_concepts"] > 0
    titles = {a["title"] for a in s["alerts"]}
    assert "Three misses in a row" in titles and all(a["suggestion"] for a in s["alerts"] if a["title"] in titles)
    assert set(s) == {"concepts", "mastered", "total_concepts", "streak_days", "answers", "accuracy", "reviews_overdue",
                      "alerts", "best_time_of_day", "goal", "longest_streak", "levels", "strongest", "focus", "challenges",
                      "progress", "weekly", "updated_at"}                         # an allow-list: new fields must be added on purpose
    assert all(set(p) == {"date", "mastery", "answers", "accuracy"} for p in s["progress"])     # numbers only, never text
    assert all(set(r) == {"title", "mastery"} for r in s["strongest"] + s["focus"])
    assert all(set(a) == {"title", "severity", "suggestion"} for a in s["alerts"])
    assert all(set(c) == {"id", "title", "mastery"} for c in s["concepts"])


async def test_summary_for_a_new_learner_is_empty_not_invented(svc):
    s = await svc.shared_summary("brand-new")
    assert s["answers"] == 0 and s["alerts"] == [] and s["mastered"] == 0 and s["streak_days"] == 0
