# Sketch check ("Draw it"): evaluation

`python -m backend.app.learning.sketch_eval --n 32` (needs `pip install pillow`; uses Mistral `pixtral-12b-2409`).

**Method.** A vision model only *reads* the drawing (nodes, values, parent/child lines); deterministic rules (BST order,
heap order, complete-tree shape) give the verdict. The reading is shown back to the learner. The model reads each drawing
**twice with differently worded prompts**; if the two readings disagree, no verdict is given.

**Data.** 32 synthetic drawings (16 valid, 16 invalid; BSTs and min-heaps of 5 to 7 nodes), rendered with wobbling
hand-drawn-style lines. Ground truth comes from how each was generated. These are **not real student sketches**, so the
numbers are an upper bound. Raw rows: `sketch.json`; the single-read first run is kept in `sketch_run1_single_read.json`.

## Result

| | Verdict accuracy | Detects invalid | False alarm on valid |
|---|---|---|---|
| Ask the model directly "is this valid?" (baseline, n = 32) | 50% | 37.5% (6/16) | 37.5% (6/16) |
| Read + rules, single read (run 1, n = 31) | 74% | **100%** (16/16) | 53% (8/15) |
| Read + rules, all drawings (run 2, n = 32) | 75% | 100% (16/16) | 50% (8/16) |
| Read + rules, **only when both reads agree** (53% of drawings, n = 17) | **82%** | 100% (8/8) | 33% (3/9) |

Exact extraction of the structure: 56% overall, **94% when the two reads agree** (16/17).

## What this does and does not show

- Separating *reading* from *judging* helps a lot where it matters: an invalid tree is always caught (16/16), against about a third
  when the model is asked to judge directly. The finding names the exact offending pair (for example "9 is in the left subtree of 8").
- The weakness is **misreading**: a misread valid tree looks invalid, so false alarms stay high (33% to 50%). The two-read
  agreement check removes about half of the drawings and improves accuracy to 82%, but does not remove false alarms.
- Because of that, the UI always shows "What I read from your drawing", states that a mismatch is the reader's mistake, and
  gives no verdict when the two reads disagree.
- Small sample (n = 8 to 17 in the agreeing subset), wide uncertainty. No real handwriting. One model.
