# Retrieval evaluation

Store: **sqlite** | embedder: `BAAI/bge-small-en-v1.5` | reranker: `cross-encoder/ms-marco-MiniLM-L-6-v2` | corpus: 26 docs / 146 passages | 66 labelled in-scope questions.

| Configuration | Recall@1 | Recall@3 | Recall@5 | Precision@3 | MRR | nDCG@5 | p50 latency |
|---|---|---|---|---|---|---|---|
| bm25_only | 0.651 | 0.864 | 0.894 | 0.288 | 0.764 | 0.788 | 8.2 ms |
| dense_only | 0.712 | 0.879 | 0.939 | 0.293 | 0.809 | 0.836 | 123.1 ms |
| hybrid_rrf | 0.727 | 0.909 | 0.939 | 0.303 | 0.825 | 0.848 | 14.1 ms |
| hybrid+multiquery | 0.712 | 0.924 | 0.955 | 0.308 | 0.824 | 0.853 | 507.0 ms |
| hybrid+multiquery+rerank | 0.818 | 0.970 | 1.000 | 0.323 | 0.896 | 0.920 | 1821.4 ms |
| full (+prereq hop) | 0.818 | 0.970 | 1.000 | 0.323 | 0.896 | 0.920 | 1856.5 ms |

**Evidence gate** (refuse out-of-scope questions): best threshold 0.14 answers 89% of in-scope questions and refuses 100% of out-of-scope ones.

**Injection guard:** 3/3 adversarial queries rejected.
