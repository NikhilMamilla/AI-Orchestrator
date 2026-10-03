"""Sketch check: the verdict comes from deterministic rules over what the vision model read."""
import asyncio
import json

import pytest

from backend.app.learning import sketch


def ex(values, edges):
    return {"nodes": [{"id": k, "value": v} for k, v in values.items()],
            "edges": [{"parent": p, "child": c, "side": s} for p, c, s in edges]}


GOOD_BST = ex({"a": 8, "b": 3, "c": 10, "d": 1, "e": 6}, [("a", "b", "left"), ("a", "c", "right"), ("b", "d", "left"), ("b", "e", "right")])


def test_valid_bst_passes():
    r = sketch.check("bst", GOOD_BST)
    assert r["ok"] and r["checked"] and r["reading"]["outline"].splitlines()[0] == "8"


def test_subtle_bst_violation_is_named_against_the_far_ancestor():
    # 7 is a fine right child of 3, but sits in the left subtree of 5
    bad = ex({"a": 5, "b": 3, "c": 8, "d": 7}, [("a", "b", "left"), ("a", "c", "right"), ("b", "d", "right")])
    r = sketch.check("bst", bad)
    assert not r["ok"]
    assert any(f["rule"] == "bst_order" and f["nodes"] == [5, 7] for f in r["findings"])      # locally fine under 3, wrong under 5


def test_duplicate_values_break_strict_bst():
    r = sketch.check("bst", ex({"a": 4, "b": 4}, [("a", "b", "left")]))
    assert not r["ok"]


def test_heap_order_and_shape():
    ok = ex({"a": 1, "b": 3, "c": 2, "d": 7}, [("a", "b", "left"), ("a", "c", "right"), ("b", "d", "left")])
    assert sketch.check("min-heap", ok)["ok"]
    wrong_order = ex({"a": 5, "b": 3}, [("a", "b", "left")])
    assert any(f["rule"] == "heap_order" for f in sketch.check("min-heap", wrong_order)["findings"])
    assert sketch.check("max-heap", wrong_order)["ok"]
    gap = ex({"a": 1, "b": 2, "c": 3}, [("a", "b", "left"), ("b", "c", "right")])       # right child of b before a's right child
    assert any(f["rule"] == "heap_shape" for f in sketch.check("min-heap", gap)["findings"])


def test_structure_problems_are_reported_not_guessed():
    two_roots = ex({"a": 1, "b": 2}, [])
    assert any("exactly one root" in f["message"] for f in sketch.check("bst", two_roots)["findings"])
    loop = ex({"a": 1, "b": 2}, [("a", "b", "left"), ("b", "a", "left")])
    assert not sketch.check("bst", loop)["ok"]
    three = ex({"a": 5, "b": 1, "c": 2, "d": 9}, [("a", "b", "left"), ("a", "c", "right"), ("a", "d", None)])
    assert any("at most 2" in f["message"] for f in sketch.check("bst", three)["findings"])
    unreadable = {"nodes": [{"id": "a", "value": 3}, {"id": "b", "value": None}], "edges": [{"parent": "a", "child": "b", "side": "left"}]}
    r = sketch.check("bst", unreadable)
    assert not r["ok"] and not r["checked"] and r["findings"][0]["rule"] == "unreadable"


def test_parse_is_tolerant_but_strict_about_content():
    raw = 'Here you go:\n```json\n{"nodes":[{"id":"x","value":"7"},{"id":"x","value":9},{"id":"y","value":"zz"}],"edges":[{"parent":"x","child":"y"},{"parent":"x","child":"nope"}]}\n```'
    p = sketch.parse_extraction(raw)
    assert [n["value"] for n in p["nodes"]] == [7, None] and len(p["edges"]) == 1       # duplicate id dropped, bad edge dropped
    with pytest.raises(sketch.SketchError):
        sketch.parse_extraction("no json here")
    with pytest.raises(sketch.SketchError):
        sketch.parse_extraction(json.dumps({"nodes": [{"id": str(i), "value": i} for i in range(40)], "edges": []}))


def test_read_and_check_uses_the_model_only_for_reading():
    class Res:
        text = json.dumps({"nodes": [{"id": "a", "value": 5}, {"id": "b", "value": 9}], "edges": [{"parent": "a", "child": "b", "side": "left"}]})
        model = "fake-vision"

    class Fake:
        async def complete(self, messages, **kw):
            assert messages[0]["content"][1]["type"] == "image_url" and kw["temperature"] == 0.0
            return Res()
    r = asyncio.run(sketch.read_and_check(Fake(), "data:image/png;base64,AAAA", "bst"))
    assert not r["ok"] and r["findings"][0]["message"].startswith("9 is in the left subtree of 5")
    assert r["extraction"]["nodes"][0]["value"] == 5 and r["model"] == "fake-vision"


def test_disagreeing_readings_are_flagged_unreliable():
    a = {"nodes": [{"id": "a", "value": 5}, {"id": "b", "value": 3}], "edges": [{"parent": "a", "child": "b", "side": "left"}]}
    b = {"nodes": [{"id": "a", "value": 5}, {"id": "b", "value": 8}], "edges": [{"parent": "a", "child": "b", "side": "left"}]}

    class Fake:
        def __init__(self, outs):
            self.outs = iter(outs)

        async def complete(self, messages, **kw):
            class R:
                text = json.dumps(next(self.outs))
                model = "m"
            return R()
    same = asyncio.run(sketch.read_and_check(Fake([a, a]), "data:image/png;base64,AA", "bst"))
    diff = asyncio.run(sketch.read_and_check(Fake([a, b]), "data:image/png;base64,AA", "bst"))
    assert same["reliable"] and not diff["reliable"] and diff["reads"] == 2
