"""Measures the sketch checker on synthetic hand-wobbled drawings with known ground truth.

    python -m backend.app.learning.sketch_eval [--n 24] [--model pixtral-12b-2409]

Per drawing the vision model (a) reads the structure, which the deterministic rules then judge (our method), and
(b) is separately asked "is this a valid <structure>?" directly (the naive baseline). Ground truth comes from how the
drawing was generated. Drawings are programmatic, not real student handwriting, so the numbers are an upper bound.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import math
import random
import re
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

from backend.app.config import settings

from ..rag.evaluation import ROOT
from ..rag.llm import LLMRouter, MistralClient
from . import sketch

W, H = 720, 460
Tree = Dict[int, Tuple[Optional[int], Optional[int]]]          # index -> (left index, right index); values kept apart


def wobble_line(d: ImageDraw.ImageDraw, a, b, rng, w=3):
    pts = []
    for t in [i / 8 for i in range(9)]:
        pts.append((a[0] + (b[0] - a[0]) * t + rng.uniform(-2.5, 2.5), a[1] + (b[1] - a[1]) * t + rng.uniform(-2.5, 2.5)))
    d.line(pts, fill=(20, 20, 20), width=w, joint="curve")


def wobble_circle(d, c, r, rng, w=3):
    pts = [(c[0] + (r + rng.uniform(-2.5, 2.5)) * math.cos(t / 20 * 2 * math.pi), c[1] + (r + rng.uniform(-2.5, 2.5)) * math.sin(t / 20 * 2 * math.pi))
           for t in range(21)]
    d.line(pts, fill=(20, 20, 20), width=w, joint="curve")


def render(values: Dict[int, int], kids: Tree, rng: random.Random) -> Image.Image:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=26)
    order: List[int] = []                                          # in-order positions give x, depth gives y

    def inorder(n):
        if n is None:
            return
        inorder(kids[n][0]); order.append(n); inorder(kids[n][1])
    inorder(1)
    depth = {1: 0}
    for n in sorted(kids):
        for c in kids[n]:
            if c is not None:
                depth[c] = depth[n] + 1
    maxd = max(depth.values())
    pos = {n: (60 + (W - 120) * i / max(1, len(order) - 1), 55 + (H - 110) * depth[n] / max(1, maxd)) for i, n in enumerate(order)}
    r = 26
    for n, (l, rr) in kids.items():
        for c in (l, rr):
            if c is not None:
                (x1, y1), (x2, y2) = pos[n], pos[c]
                dist = math.hypot(x2 - x1, y2 - y1)
                ux, uy = (x2 - x1) / dist, (y2 - y1) / dist
                wobble_line(d, (x1 + ux * r, y1 + uy * r), (x2 - ux * r, y2 - uy * r), rng)
    for n, (x, y) in pos.items():
        wobble_circle(d, (x, y), r, rng)
        txt = str(values[n])
        bb = d.textbbox((0, 0), txt, font=font)
        d.text((x - (bb[2] - bb[0]) / 2, y - (bb[3] - bb[1]) / 2 - 3), txt, fill=(20, 20, 20), font=font)
    return img


def bst_case(rng: random.Random, valid: bool):
    n = rng.randint(5, 7)
    vals = rng.sample(range(1, 40), n)
    kids: Tree = {}
    values: Dict[int, int] = {}
    nxt = [1]

    def insert(i, v):
        if v < values[i]:
            side = 0
        else:
            side = 1
        cur = kids.setdefault(i, [None, None])
        if cur[side] is None:
            nxt[0] += 1
            cur[side] = nxt[0]
            values[nxt[0]] = v
            kids[nxt[0]] = [None, None]
        else:
            insert(cur[side], v)
    values[1] = vals[0]
    kids[1] = [None, None]
    for v in vals[1:]:
        insert(1, v)
    if not valid:
        for _ in range(50):                                        # swap two values until the BST property breaks
            a, b = rng.sample(sorted(values), 2)
            values[a], values[b] = values[b], values[a]
            seq = []

            def io(n):
                if n is None:
                    return
                io(kids[n][0]); seq.append(values[n]); io(kids[n][1])
            io(1)
            if seq != sorted(seq):
                break
            values[a], values[b] = values[b], values[a]
    seq = []

    def io2(n):
        if n is None:
            return
        io2(kids[n][0]); seq.append(values[n]); io2(kids[n][1])
    io2(1)
    return values, {k: tuple(v) for k, v in kids.items()}, seq == sorted(seq) and len(set(seq)) == len(seq)


def heap_case(rng: random.Random, valid: bool):
    n = rng.randint(5, 7)
    arr = sorted(rng.sample(range(1, 40), n))                      # sorted ascending is a valid min-heap array
    if not valid:
        for _ in range(50):
            i, j = rng.sample(range(n), 2)
            arr[i], arr[j] = arr[j], arr[i]
            if any(arr[(k - 1) // 2] > arr[k] for k in range(1, n)):
                break
            arr[i], arr[j] = arr[j], arr[i]
    values = {i + 1: v for i, v in enumerate(arr)}
    kids = {i: (2 * i if 2 * i <= n else None, 2 * i + 1 if 2 * i + 1 <= n else None) for i in range(1, n + 1)}
    ok = all(arr[(k - 1) // 2] <= arr[k] for k in range(1, n))
    return values, kids, ok


def edges_truth(values, kids):
    return sorted((values[p], values[c]) for p, (l, r) in kids.items() for c in (l, r) if c is not None)


def edges_read(ex):
    v = {n["id"]: n["value"] for n in ex["nodes"]}
    return sorted((v[e["parent"]], v[e["child"]]) for e in ex["edges"])


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


async def main(n: int, model: str) -> None:
    llm = LLMRouter([MistralClient(settings.mistral_keys_list, models=(model,), timeout=60.0)])
    rng = random.Random(11)
    cases = []
    for i in range(n):
        kind = ["bst", "min-heap"][i % 2]
        valid = (i // 2) % 2 == 0
        values, kids, ok = (bst_case if kind == "bst" else heap_case)(rng, valid)
        cases.append((kind, values, kids, ok))
    rows = []
    sem = asyncio.Semaphore(2)

    async def run(i, kind, values, kids, ok):
        img = render(values, kids, random.Random(i))
        if i < 4:
            img.save(ROOT / "docs" / "eval" / f"sketch_sample_{i}_{kind}_{'valid' if ok else 'invalid'}.png")
        url = to_data_url(img)
        row = {"i": i, "kind": kind, "truth_valid": ok, "read_ok": None, "extract_exact": None, "pred_valid": None, "direct_valid": None}
        async with sem:
            try:
                out = await sketch.read_and_check(llm, url, kind)
                ex = out["extraction"]
                row["extract_exact"] = sorted(n["value"] for n in ex["nodes"]) == sorted(values.values()) and edges_read(ex) == edges_truth(values, kids)
                row["pred_valid"] = out["ok"]
                row["reliable"] = out["reliable"]
                row["read_ok"] = True
            except Exception as e:
                row["read_ok"] = False
                row["error"] = str(e)[:80]
            try:
                q = f"Is this hand-drawn {sketch.KINDS[kind]} a VALID {sketch.KINDS[kind]}? Answer with exactly one word: yes or no."
                res = await llm.complete([{"role": "user", "content": [{"type": "text", "text": q}, {"type": "image_url", "image_url": url}]}],
                                         temperature=0.0, max_tokens=5, use_cache=False)
                row["direct_valid"] = bool(re.match(r"\s*yes", res.text, re.I))
            except Exception as e:
                row["direct_error"] = str(e)[:80]
        rows.append(row)
        print(row, flush=True)

    await asyncio.gather(*(run(i, *c) for i, c in enumerate(cases)))

    def acc(key):
        got = [r for r in rows if r[key] is not None]
        return (round(sum(1 for r in got if r[key] == r["truth_valid"]) / len(got), 3), len(got)) if got else (None, 0)

    def rate(key, truth, want):
        sel = [r for r in rows if r["truth_valid"] == truth and r[key] is not None]
        return (round(sum(1 for r in sel if r[key] == want) / len(sel), 3), len(sel)) if sel else (None, 0)
    conf = [r for r in rows if r.get("reliable")]
    ex_rows = [r for r in rows if r["extract_exact"] is not None]
    result = {
        "model": model, "n": n, "read_failures": sum(1 for r in rows if not r["read_ok"]),
        "extraction_exact": [round(sum(1 for r in ex_rows if r["extract_exact"]) / max(1, len(ex_rows)), 3), len(ex_rows)],
        "neuro_symbolic_accuracy": acc("pred_valid"), "direct_vlm_accuracy": acc("direct_valid"),
        "neuro_symbolic_detects_invalid": rate("pred_valid", False, False), "direct_detects_invalid": rate("direct_valid", False, False),
        "neuro_symbolic_false_alarm_on_valid": rate("pred_valid", True, False), "direct_false_alarm_on_valid": rate("direct_valid", True, False),
        "reliable_readings": [round(len(conf) / max(1, len(ex_rows)), 3), len(ex_rows)],
        "reliable_extraction_exact": [round(sum(1 for r in conf if r["extract_exact"]) / max(1, len(conf)), 3), len(conf)],
        "reliable_accuracy": [round(sum(1 for r in conf if r["pred_valid"] == r["truth_valid"]) / max(1, len(conf)), 3), len(conf)],
        "reliable_detects_invalid": [round(sum(1 for r in conf if not r["truth_valid"] and not r["pred_valid"]) / max(1, sum(1 for r in conf if not r["truth_valid"])), 3), sum(1 for r in conf if not r["truth_valid"])],
        "reliable_false_alarm_on_valid": [round(sum(1 for r in conf if r["truth_valid"] and not r["pred_valid"]) / max(1, sum(1 for r in conf if r["truth_valid"])), 3), sum(1 for r in conf if r["truth_valid"])],
        "rows": sorted(rows, key=lambda r: r["i"]),
    }
    (ROOT / "docs" / "eval" / "sketch.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, indent=1))
    await llm.aclose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=24)
    ap.add_argument("--model", default="pixtral-12b-2409")
    a = ap.parse_args()
    asyncio.run(main(a.n, a.model))
