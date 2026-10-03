# Teach-back grading: evaluation

`python -m backend.app.learning.teachback_eval --docs 26` (add `--rescore` to re-grade the saved texts without the LLM).

**What is measured.** Whether the grader (embedder + NLI, no LLM) separates three kinds of explanation of the same concept.
The explanations were **written by an LLM simulating learners** (13 concepts × 3 kinds = 39 texts): an accurate own-words
one (`good`), an accurate but vague two-sentence one (`thin`), and a confident one with two deliberate factual errors
(`wrong`). They are not real students; the texts are saved in `teachback_texts.json`.

## Final result (n = 13 per kind)

| Kind | Mean score | Mean accuracy | Mean coverage | Pass rate |
|---|---|---|---|---|
| good  | 0.587 | 0.768 | 0.406 | 77% |
| thin  | 0.536 | 0.917 | 0.154 | 69% |
| wrong | 0.405 | 0.619 | 0.192 | 15% |

- AUC good vs wrong (final score): **0.90**
- AUC good vs thin (final score): 0.69
- AUC thin vs wrong on accuracy alone: 0.95

## How it got here (kept as evidence)

| Version | Coverage method | AUC good vs wrong | AUC good vs thin |
|---|---|---|---|
| run 1 (`teachback_run1_nli_coverage.json`) | NLI with the **whole explanation** as the premise | 0.78 | **0.42** (no better than chance) |
| final | NLI with **each learner sentence** as the premise, best sentence per key point | 0.90 | 0.69 |

Whole-explanation premises failed because a long premise dilutes entailment of a short key point. The per-sentence variant
was chosen after comparing three variants offline on the saved texts. **That choice, and the constants `COVER_POINT=0.25`,
`COVER_SCALE=0.30`, `PASS_SCORE=0.50`, were tuned on these same 39 texts, so the numbers above are optimistic.**

## Honest limits

- **Pass is mostly an accuracy gate.** `thin` explanations pass 69% of the time because everything they say is correct.
  Whether that is right is a pedagogical choice, not a measurement.
- **Subtle errors slip through.** Accuracy of `wrong` is still 0.62 (vs 0.77 for `good`): the claim verifier has the same
  weakness documented in `verifier.md`. A real live check agreed: "binary search works on any unsorted list" was only partly flagged.
- **Short good explanations get low coverage** (a live 3-sentence correct explanation scored coverage 0.04), because the key
  points are the passage's central sentences, not the only valid ones. The result screen shows missed points as
  "What the material also says", never as errors.
- LLM-simulated learners are cleaner than real ones. A real pilot is needed (see the Evidence Lab).
- Abuse control: feedback is unlimited, but only the first graded teach-back per concept per 24 h changes mastery.
