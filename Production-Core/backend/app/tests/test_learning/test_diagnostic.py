"""Adaptive placement over the prerequisite graph: inference direction, probing, honesty about 'assumed' mastery."""
from backend.app.learning import diagnostic as dg
from backend.app.learning.policy import ConceptNode, next_concepts

G = {"big-o": ConceptNode("big-o", "Big-O", 1), "arrays": ConceptNode("arrays", "Arrays", 1, ["big-o"]),
     "bs": ConceptNode("bs", "Binary Search", 1, ["arrays"]), "bst": ConceptNode("bst", "BST", 2, ["bs"]),
     "graphs": ConceptNode("graphs", "Graphs", 2, ["arrays"])}
B0 = {c: dg.PRIOR for c in G}


def test_correct_answer_lifts_prerequisites_wrong_answer_lowers_dependents():
    up = dg.update(B0, G, "bst", True)
    assert abs(up["bst"] - 0.9 * 0.5 / (0.9 * 0.5 + 0.25 * 0.5)) < 1e-9 and up["bs"] > B0["bs"] and up["arrays"] > B0["arrays"] > 0
    assert up["bs"] > up["arrays"] > up["big-o"]                       # inference weakens with graph distance
    assert up["graphs"] == B0["graphs"]                                # unrelated branch untouched
    down = dg.update(B0, G, "arrays", False)
    assert down["arrays"] < 0.2 and down["bs"] < B0["bs"] and down["bs"] < down["bst"] < B0["bst"]
    assert down["big-o"] == B0["big-o"]                                # a wrong answer says nothing about prerequisites


def test_next_probe_prefers_informative_concepts_and_never_repeats():
    first = dg.next_probe(B0, G, set())
    assert first in G and first not in ("bst", "graphs")               # leaves are less informative than hubs
    seen = set()
    b = dict(B0)
    for _ in range(10):
        p = dg.next_probe(b, G, seen)
        if p is None:
            break
        assert p not in seen
        seen.add(p)
        b = dg.update(b, G, p, True)
    assert seen and len(seen) < len(G)                                 # stops early once the rest is inferable


def test_measured_concepts_are_not_asked_again():
    assert dg.next_probe(B0, G, set(), measured=set(G) - {"graphs"}) in ("graphs", None)


def test_placement_labels_sources_and_effective_mastery_never_claims_mastery():
    b = dg.update(dg.update(B0, G, "bst", True), G, "bst", True)
    place = dg.placement(b, {"bst": True}, {})
    assert place["bst"]["source"] == "asked" and place["arrays"]["source"] == "inferred"
    assert place["arrays"]["status"] == "assumed_known"
    eff = dg.effective_mastery({}, {"placement": place})
    assert eff["arrays"] == dg.ASSUMED_MASTERY_VIEW < 0.80            # unlocks dependents but is not "mastered"
    assert dg.effective_mastery({"arrays": 0.1}, {"placement": place})["arrays"] == 0.1    # measured always wins


def test_assumed_known_unlocks_the_roadmap_without_claiming_mastery():
    eff = dg.effective_mastery({}, {"placement": {"big-o": {"status": "assumed_known"}, "arrays": {"status": "assumed_known"}}})
    assert [n.id for n in next_concepts(G, eff, 5) if n.id == "bs"]    # binary search is now unlocked


async def test_service_runs_a_full_placement_and_unlocks_the_right_topics(svc):
    seen, correct_map = [], {}
    for _ in range(12):
        step = await svc.diagnostic_next("u30")
        if step["done"]:
            break
        q = step["quiz"]
        key = svc.quizzes.rows[q["quiz_id"]]["answer_index"]
        seen.append(q["doc_id"])
        await svc.answer("u30", q["quiz_id"], key)                     # a learner who knows everything
    assert step["done"] and 1 <= len(seen) <= svc.DIAG_TARGET and len(set(seen)) == len(seen)
    assert step["assumed_known"]                                      # inferred from the graph, beyond what was asked
    path = await svc.path("u30")
    assert any(s["assumed"] for s in path["steps"]) or len(path["steps"]) > 0
    prof = svc.profiles.p["u30"]
    measured = {m.concept_id for m in prof.concept_mastery}
    assert measured == set(seen)                                      # only asked concepts have measured mastery
    again = await svc.diagnostic_next("u30")
    assert again["done"]                                              # finished placement is stable
    await svc.diagnostic_reset("u30")
    assert not (await svc.diagnostic_next("u30"))["done"]


def test_knowledge_map_bands_follow_the_prd_thresholds():
    from backend.app.api.v1.concepts import band_of
    assert [band_of(m) for m in (0, 0.2, 0.4, 0.59, 0.6, 0.79, 0.8, 1)] == [
        "untouched", "needs_work", "weak", "weak", "partial", "partial", "mastered", "mastered"]
