"""Teaching-style bandit: learns from real quiz outcomes, explores until evidence exists, claims nothing early."""
import random

from backend.app.learning import strategy as st


def test_empty_stats_have_no_winner_and_every_style_can_be_chosen():
    stats = st.stats_of({})
    assert st.summary(stats)["best"] is None
    seen = {st.choose(stats, random.Random(i)) for i in range(200)}
    assert seen == set(st.STYLES)                                   # uniform prior explores every arm


def test_thompson_sampling_converges_to_the_style_that_actually_works():
    rng = random.Random(7)
    true_rate = {"socratic": 0.85, "worked_example": 0.45, "analogy": 0.45, "default": 0.45}
    stats = st.stats_of({})
    picks = []
    for _ in range(400):
        s = st.choose(stats, rng)
        win = rng.random() < true_rate[s]
        stats[s]["n"] += 1
        stats[s]["wins"] += win
        picks.append(s)
    assert picks[-100:].count("socratic") > 70                       # exploits the winner late on
    assert st.summary(stats)["best"] == "socratic"
    assert all(v["n"] > 0 for v in stats.values())                   # but still tried the others


def test_no_winner_is_claimed_without_enough_trials():
    stats = st.stats_of({"strategy_stats": {"socratic": {"n": 2, "wins": 2}, "analogy": {"n": 1, "wins": 0}}})
    assert st.summary(stats)["best"] is None


def test_trial_is_settled_by_the_next_quiz_on_that_concept_only_once():
    p = {}
    st.note_explanation(p, "binary-search", "analogy")
    assert st.credit(p, "arrays", True) is None                      # different concept: no credit
    assert st.credit(p, "binary-search", True) == "analogy"
    assert p["strategy_stats"]["analogy"] == {"n": 1, "wins": 1}
    assert st.credit(p, "binary-search", False) is None              # already settled
    st.note_explanation(p, "binary-search", "not-a-style")
    assert "binary-search" not in p.get("strategy_pending", {})


async def test_service_credits_the_style_when_a_quiz_is_answered(svc):
    await svc.note_explanation("u20", "binary-search", "socratic")
    q = await svc.create_quiz("u20", "binary-search")
    key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]
    await svc.answer("u20", q["quiz_id"], key)
    s = await svc.strategy_summary("u20")
    assert s["styles"]["socratic"]["n"] == 1 and s["styles"]["socratic"]["wins"] == 1
    chosen = await svc.choose_style("u20")
    assert chosen["style"] in st.STYLES and chosen["total_trials"] == 1
