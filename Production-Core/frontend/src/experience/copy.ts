/**
 * Words the 3D scenes need as well as the overlays. Every factual line is quoted from the README or docs/LEARNING.md.
 */

/** Stage 2: the shards that fly in after the pane breaks (README, opening paragraph and "What is different"). */
export const EVIDENCE_SHARDS = [
    { big: 'Answers', rest: 'only from a curated knowledge base' },
    { big: 'Cites', rest: 'every claim' },
    { big: 'Checks', rest: 'each sentence against its sources' },
    { big: 'Refuses', rest: 'topics it has no evidence for' },
    { big: 'Measures', rest: 'its confidence in every answer' },
    { big: 'Says', rest: '“I don’t have enough evidence”' },
];

/** Stage 4: the five PRD agents, in the order of docs/LEARNING.md, with its "What it actually does" column verbatim. */
export const AGENTS = [
    { name: 'Knowledge Curator', does: 'Hybrid retrieval, rerank, evidence gate, cited answers' },
    { name: 'Adaptive Pedagogy', does: 'Chooses the teaching style (bandit) and explanation level (from mastery)' },
    { name: 'Comprehensive Evaluator', does: 'Grounded check questions, hints, confidence, grading, misconception capture' },
    { name: 'Behavioural Analyst', does: 'Struggle, rushing, slow, plateau, confusion pairs, calibration, best time of day' },
    { name: 'Master Orchestrator', does: 'Advance/deepen/review/remediate, session plan, goal feasibility, placement' },
];

/** Stage progress at which the camera passes through each agent's ring. */
export const RING_P = [0.14, 0.28, 0.42, 0.56, 0.7];
