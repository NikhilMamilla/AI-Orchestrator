# Claim verifier: lexical vs NLI vs blend

The verifier scores every answer sentence against the retrieved evidence. Three variants were measured on two
datasets. Thresholds were tuned on a random half and scored on the other half (held out).

## 1. Planted errors in our own corpus (`python -m backend.app.rag.bench_perturb`)

98 real corpus sentences, each paired with a corrupted twin (a Big-O class swapped, or a requirement negated).
Evidence is the full source document, so the corrupted claim shares nearly all its words with the evidence.
The corruptions are **synthetic**; the sentences are real. 196 claims, about 98 held out.

| Variant | AUROC | accuracy | precision (corrupted) | recall (corrupted) | F1 |
|---|---|---|---|---|---|
| lexical + embedding | 0.607 | 0.561 | 0.586 | 0.354 | 0.442 |
| NLI entailment | 0.834 | 0.786 | 0.814 | 0.729 | 0.769 |
| **blend 0.35 lexical + 0.65 NLI** | 0.821 | **0.796** | 0.733 | **0.917** | **0.815** |
| blend 0.15 lexical + 0.85 NLI | 0.836 | 0.776 | 0.750 | 0.812 | 0.780 |

Reading: word and embedding overlap barely beats a coin flip when a wrong claim reuses the right words (the exact
failure mode of a "wrong complexity" answer). Entailment fixes most of it. The blend is chosen because it caught
92% of corrupted claims with the best F1.

## 2. HaluEval summarization (public benchmark, `python -m backend.app.rag.bench_halu`)

120 documents, 240 summaries (faithful vs hallucinated). Best aggregation per variant:

| Variant | AUROC | held-out accuracy |
|---|---|---|
| lexical + embedding (mean) | 0.716 | 0.658 |
| NLI entailment (min) | 0.688 | 0.608 |
| blend 0.35 / 0.65 (min) | 0.725 | 0.658 |
| blend 0.35 / 0.65 (mean) | 0.696 | **0.675** |

Reading: on this harder, subtler task the variants are within noise of each other (240 items, so differences of
about 0.03 are not significant), and none is strong. We do not claim NLI wins here.

## 3. Real generated answers (`gen_eval` + `calibrate_verifier`)

`nli_support_threshold = 0.38` on the blend score (the tuned thresholds were 0.37 and 0.39). The strongest evidence
for the blend is benchmark 1, which matches how the system is used (short technical claims against source text).
Samples are small and the perturbations are synthetic; treat the numbers as indicative, not as a guarantee.

## What the real answers showed (and the final setting)

38 answers written by ministral-14b, judged by open-mistral-nemo: 33 judged fully faithful, 5 containing an unsupported claim.

* The first shipped configuration (blend 0.65, a single threshold of 0.38, refuse when more than half the claims fail) **answered only 20% of in-scope questions**: LLM answers paraphrase and combine passages, so entailment against a single passage is often low even for faithful sentences. Benchmarks 1 and 2 use verbatim or near-verbatim sentences and did not predict this.
* On real answers the claim-score distributions of faithful and unfaithful answers **overlap heavily** (at NLI weight 0.65 the median claim score was 0.28 for faithful answers and 0.38 for the five unfaithful ones). The per-claim verifier is therefore **not a reliable gate** for subtle, paraphrase-level errors. It is reliable for verbatim-style corruptions (benchmark 1).
* Changes made: (1) NLI premise can be the concatenation of the top passages, so a sentence drawing on several passages can be entailed; (2) a **three-tier verdict**: supported, partly supported, unsupported; (3) refuse only when more than half the claims are *unsupported*, not merely partly supported.

Final setting: NLI weight **0.35**, supported at **0.34**, unsupported below **0.22**. On the 38 real answers: 0 of 33 faithful answers refused; faithful claims 75% supported, 22% partly supported, 3% unsupported. Of the 5 unfaithful answers, 3 contain at least one claim that is not fully supported and none reach the unsupported tier.

## Limits

* Only 5 unfaithful answers: recall on subtle unfaithfulness is not established. The verifier annotates and lowers confidence; it does not guarantee faithfulness.
* The LLM judge is itself fallible (and lenient: 97% faithful), and the judge and generator are both Mistral models.
* Planted-error and HaluEval samples are small, and the planted corruptions are synthetic.
* The remaining safeguards for faithfulness are upstream: the evidence gate, a prompt that restricts the model to the evidence, and citations the learner can open.

