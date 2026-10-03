# Generation evaluation (LLM judge)

40 in-scope + 10 out-of-scope questions. Generator: Mistral (ministral-14b); judge: open-mistral-nemo (a different model). Verifier: nli+lexical.

| Metric | Value |
|---|---|
| judged_raw | 38 |
| judged_shipped | 38 |
| answer_rate | 0.95 |
| oos_refusal_rate | 1.0 |
| faithfulness_raw | 0.9553 |
| faithfulness_shipped | 0.943 |
| unfaithful_answer_rate_raw | 0.1579 |
| unfaithful_answer_rate_shipped | 0.1842 |
| verifier_recall_on_unfaithful | 0.0 |
| relevance_mean_1to5 | 4.9474 |
| citation_accuracy | 0.9474 |
| latency_ms_p50 | 14298.0 |
| tokens_mean | 638.0 |

## How to read this (honest notes)

* **History:** the first run of the shipped pipeline answered only 20% of in-scope questions because the verifier over-refused paraphrased but faithful answers. After re-calibrating on real answers (`verifier.md`) the answer rate is 95% with 100% out-of-scope refusal.
* **What the verifier does and does not do:** `verifier_recall_on_unfaithful = 0.0`: of the 6 answers the judge found to contain an unsupported claim, the verifier flagged none as *unsupported*. Shipped faithfulness (94%) is therefore about the same as raw (96%). The verifier currently annotates and lowers confidence; it should not be described as preventing unfaithful answers. It does catch verbatim-style corruptions (planted-error AUROC 0.82).
* **What does the protecting work:** the evidence gate (out-of-scope refusal 100%), a prompt restricted to numbered evidence, and citations the learner can open (citation accuracy 94.7%).
* **Limits:** 38 judged answers, one generator model and one judge model from the same provider, judge leniency unknown. Treat figures as indicative.
* Earlier runs are kept for transparency: `generation_run1_nli038.json` (20% answer rate) and `generation_run2_joined.json`.
