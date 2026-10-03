"""Sketch check: neuro-symbolic grading of a hand-drawn data structure.

A vision model only *reads* the picture (nodes, values, parent/child edges). It is never asked whether the drawing is
correct: that verdict comes from deterministic rules (BST ordering, heap order, complete-tree shape) applied to what
was read. The reading is always shown back to the learner, so a misread is visible instead of silently judged.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Dict, List, Optional

KINDS = {"bst": "binary search tree", "min-heap": "min-heap drawn as a tree", "max-heap": "max-heap drawn as a tree"}
MAX_NODES = 31

PROMPT = """This image is a hand-drawn %s. Read it exactly as drawn, even if it is wrong. Do not fix mistakes.
List every node (circle) with its written value, and every line joining a parent (upper node) to a child (lower node).
For each line say whether the child hangs to the LEFT or the RIGHT of its parent as drawn (or null if directly below).
Reply with JSON only:
{"nodes": [{"id": "n1", "value": 8}], "edges": [{"parent": "n1", "child": "n2", "side": "left"}]}
Use short unique ids. If a value is unreadable use null."""


PROMPT_B = """This image is a hand-drawn %s. Describe it level by level, exactly as drawn, even if it is wrong. Do not fix mistakes.
First the top node, then the nodes of the next row from left to right, and so on. Then list every line from a parent (upper node) to its child (lower node), saying whether the child hangs LEFT or RIGHT of the parent.
Reply with JSON only:
{"nodes": [{"id": "n1", "value": 8}], "edges": [{"parent": "n1", "child": "n2", "side": "left"}]}
Use short unique ids. If a value is unreadable use null."""


class SketchError(ValueError):
    pass


def parse_extraction(raw: str) -> Dict[str, Any]:
    """Tolerant JSON parse followed by strict sanitising; anything unusable raises SketchError."""
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise SketchError("The drawing could not be read.")
    try:
        data = json.loads(m.group(0), strict=False)
    except ValueError:
        raise SketchError("The drawing could not be read.")
    nodes, ids = [], set()
    for n in data.get("nodes") or []:
        nid, val = str(n.get("id", "")).strip(), n.get("value")
        try:
            val = int(val)
        except (TypeError, ValueError):
            val = None
        if nid and nid not in ids:
            ids.add(nid)
            nodes.append({"id": nid, "value": val})
    if not nodes:
        raise SketchError("No nodes were found in the drawing.")
    if len(nodes) > MAX_NODES:
        raise SketchError(f"Please draw at most {MAX_NODES} nodes.")
    edges = []
    for e in data.get("edges") or []:
        p, c = str(e.get("parent", "")), str(e.get("child", ""))
        side = e.get("side") if e.get("side") in ("left", "right") else None
        if p in ids and c in ids and p != c:
            edges.append({"parent": p, "child": c, "side": side})
    return {"nodes": nodes, "edges": edges}


def _build(ex: Dict[str, Any]):
    val = {n["id"]: n["value"] for n in ex["nodes"]}
    kids: Dict[str, Dict[str, Optional[str]]] = {i: {"left": None, "right": None, "any": []} for i in val}   # type: ignore[dict-item]
    parent: Dict[str, str] = {}
    problems: List[str] = []
    for e in ex["edges"]:
        if e["child"] in parent:
            problems.append(f"{_v(val, e['child'])} has more than one parent.")
            continue
        parent[e["child"]] = e["parent"]
        kids[e["parent"]]["any"].append((e["child"], e["side"]))        # type: ignore[union-attr]
    for pid, k in kids.items():
        placed = k["any"]
        if len(placed) > 2:
            problems.append(f"{_v(val, pid)} has {len(placed)} children; a binary tree allows at most 2.")
        free = [s for s in ("left", "right") if s not in [x[1] for x in placed]]
        for cid, side in placed[:2]:
            if side is None:
                side = free.pop(0) if free else None
            if side:
                k[side] = cid
    roots = [i for i in val if i not in parent]
    return val, kids, parent, roots, problems


def _v(val, i):
    return "?" if val[i] is None else str(val[i])


def _walk(kids, start):
    out, stack = [], [start]
    while stack:
        cur = stack.pop()
        out.append(cur)
        stack.extend(c for c in (kids[cur]["left"], kids[cur]["right"]) if c)
        if len(out) > MAX_NODES * 2:                                  # a cycle would loop forever
            break
    return out


def _outline(val, kids, root) -> str:
    lines: List[str] = []

    def go(n, depth, tag):
        lines.append("  " * depth + (f"{tag}: " if tag else "") + _v(val, n))
        for side in ("left", "right"):
            if kids[n][side]:
                go(kids[n][side], depth + 1, side)
    if len(_walk(kids, root)) <= MAX_NODES:
        go(root, 0, "")
    return "\n".join(lines)


def check(kind: str, ex: Dict[str, Any]) -> Dict[str, Any]:
    """Apply the rules for `kind` to the extracted structure. Findings are computed, never model-written."""
    if kind not in KINDS:
        raise SketchError("Unknown structure type.")
    val, kids, parent, roots, findings = _build(ex)
    findings = [{"rule": "shape", "message": m} for m in findings]
    reading = {"nodes": len(val), "outline": ""}
    if len(roots) != 1:
        findings.append({"rule": "shape", "message": "A tree has exactly one root; I found " + (f"{len(roots)} separate top nodes." if roots else "none (the lines form a loop).")})
        return {"kind": kind, "ok": False, "findings": findings, "reading": reading, "checked": False}
    root = roots[0]
    reach = _walk(kids, root)
    if len(set(reach)) != len(val) or len(reach) != len(set(reach)):
        findings.append({"rule": "shape", "message": "Some nodes are not connected to the root, or the lines loop back."})
        return {"kind": kind, "ok": False, "findings": findings, "reading": reading, "checked": False}
    reading["outline"] = _outline(val, kids, root)
    if any(v is None for v in val.values()):
        findings.append({"rule": "unreadable", "message": "At least one value could not be read, so the order rules were not checked."})
        return {"kind": kind, "ok": False, "findings": findings, "reading": reading, "checked": False}

    if kind == "bst":
        def subtree(n):
            return _walk(kids, n) if n else []
        for n in reach:
            for side, sign in (("left", -1), ("right", 1)):
                for d in subtree(kids[n][side]):
                    bad = val[d] >= val[n] if sign < 0 else val[d] <= val[n]
                    if bad and len(findings) < 5:
                        rel = "<" if sign < 0 else ">"
                        findings.append({"rule": "bst_order", "nodes": [val[n], val[d]],
                                         "message": f"{val[d]} is in the {side} subtree of {val[n]}, so it must be {rel} {val[n]}."})
    else:
        want_min = kind == "min-heap"
        for n in reach:
            for c in (kids[n]["left"], kids[n]["right"]):
                if c and ((val[c] < val[n]) if want_min else (val[c] > val[n])) and len(findings) < 5:
                    findings.append({"rule": "heap_order", "nodes": [val[n], val[c]],
                                     "message": f"In a {kind} a parent must be {'<=' if want_min else '>='} its children, but {val[n]} has child {val[c]}."})
        index = {root: 1}
        for n in reach:
            for side, off in (("left", 0), ("right", 1)):
                if kids[n][side]:
                    index[kids[n][side]] = 2 * index[n] + off
        if sorted(index.values()) != list(range(1, len(val) + 1)):
            findings.append({"rule": "heap_shape", "message": "A heap is a complete tree: every level is full except possibly the last, which fills from the left. This drawing leaves a gap."})
    return {"kind": kind, "ok": not findings, "findings": findings, "reading": reading, "checked": True}


def canonical(ex: Dict[str, Any]) -> Any:
    """Id-independent form of a reading, so two readings can be compared by what they say."""
    v = {n["id"]: n["value"] for n in ex["nodes"]}
    return (sorted(map(str, v.values())), sorted((str(v[e["parent"]]), str(v[e["child"]]), e["side"] or "") for e in ex["edges"]))


async def read_and_check(llm, png_data_url: str, kind: str) -> Dict[str, Any]:
    """Vision model reads the picture twice with differently worded prompts; deterministic rules judge what it read.
    If the two readings disagree the picture was not read reliably, and no verdict is given."""
    if kind not in KINDS:
        raise SketchError("Unknown structure type.")
    img = {"type": "image_url", "image_url": png_data_url}
    calls = [llm.complete([{"role": "user", "content": [{"type": "text", "text": t % KINDS[kind]}, img]}],
                          temperature=0.0, max_tokens=900, use_cache=False) for t in (PROMPT, PROMPT_B)]
    results = await asyncio.gather(*calls, return_exceptions=True)
    reads = []
    for r in results:
        if isinstance(r, Exception):
            continue
        try:
            reads.append((parse_extraction(r.text), r.model))
        except SketchError:
            continue
    if not reads:
        raise SketchError("The drawing could not be read. Try drawing larger and clearer.")
    ex, model = reads[0]
    out = check(kind, ex)
    out.update({"extraction": ex, "model": model, "reads": len(reads),
                "reliable": len(reads) == 2 and canonical(reads[0][0]) == canonical(reads[1][0])})
    return out
