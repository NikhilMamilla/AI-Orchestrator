# Policy simulation (synthetic learners)

**This is a simulation, not a study with real learners.** Synthetic students with hidden knowledge of the 26 real concepts and their prerequisite graph answer questions with slip 10% and guess 25%. Learning is 4x slower when a prerequisite is unknown (an assumption that favours prerequisite-aware policies). Every policy sees only answers and uses the product's BKT estimator.

300 students per policy (identical students across policies), budget 120 questions.

| policy | concepts truly known after budget (mean ± 95% CI) | questions to know 80% (median) | students reaching 80% |
|---|---|---|---|
| random | 8.2 / 26 ± 0.4 | 121+ | 0% |
| fixed order | 8.9 / 26 ± 0.4 | 121+ | 1% |
| unlocked-only (no remediation) | 13.7 / 26 ± 0.7 | 121+ | 16% |
| adaptive (ours) | 13.8 / 26 ± 0.6 | 121+ | 17% |

**Where the gain comes from:** prerequisite-aware unlocking accounts for almost all of it (+4.7 concepts over a fixed order). Remediation and lingering on a concept add +0.2 concepts, within the confidence interval, so no measurable benefit in this simulation.
Total advantage of the full policy over a fixed order: +4.9 concepts after 120 questions.

Reading: differences larger than the confidence intervals are real *within this simulation*; whether real learners behave like the simulated ones is untested. The honest claim is that the policy is sound under explicit assumptions, not that it improves real learning outcomes.
