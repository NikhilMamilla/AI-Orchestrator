import { authed, RagError } from '../lib/rag';

/** A learner count the server hid because the group is smaller than `min_group` (shown as "<k"). */
export type Gated = number | null;

export interface Overview {
    days: string[];
    kpi: {
        learners: number; active_1d: Gated; active_7d: Gated; new: number; questions: number; answers: number; code_runs: number;
        grounded_rate: number | null; refusal_rate: number | null; p95_ms: number | null;
    };
    series: { active: Gated[]; new: number[]; questions: number[]; answers: number[]; code_runs: number[]; grounded: number[]; refused: number[] };
    alerts: { level: 'warning' | 'serious' | 'critical'; text: string }[];
    min_group: number;
}

export interface Learners {
    learners: number;
    heatmap: { concept: string; title: string; learning: Gated; ready: Gated; mastered: Gated; learners: Gated }[];
    hardest: { concept: string; title: string; accuracy: number; answers: number; learners: number; median_seconds: number | null }[];
    mixups: { concept: string; confused_with: string; times: number }[];
    overdue: { concept: string; title: string; learners: Gated }[];
    struggling: { concept: string; title: string; learners: Gated }[];
    styles: { style: string; trials: number; win_rate: number | null }[];
    placement: { started: Gated; finished: Gated };
    goals: { set: Gated; past_deadline: Gated };
    answers_per_learner: { label: string; learners: Gated }[];
    streaks: { label: string; learners: Gated }[];
    missed_questions: { concept: string; question: string; answers: number; miss_rate: number; common_wrong: string | null; correct: string | null }[];
    min_group: number;
}

export interface ChallengeRow { id: string; title: string; concept: string; kind: string; tried: Gated; passed: Gated; pass_rate: number | null; mean_fails: number | null }

export interface Quality {
    days: string[];
    status: Record<'grounded' | 'insufficient_evidence' | 'fallback' | 'other', number[]>;
    p50_ms: (number | null)[];
    p95_ms: (number | null)[];
    confidence: { bin: string; answers: number }[];
    models: { model: string; answers: number }[];
    failures: Record<string, number>;
    tokens: number;
    answers: number;
    cache_hit_rate: number | null;
    eval: {
        retrieval?: { config: string; 'recall@3': number; mrr: number; 'ndcg@5': number; n: number }[];
        evidence_gate?: { threshold: number; inscope_answered: number; oos_refused: number; balanced_accuracy: number };
        injection_guard?: { queries: number; rejected: number };
        generation?: Record<string, number | null>;
        teachback?: Record<string, { pass_rate: number; n: number }>;
        sketch?: Record<string, number | null>;
    };
}

export interface Service { name: string; ok: boolean | null; detail: string; required: boolean }
export interface SystemInfo {
    services: Service[];
    docs_without_passages: number;
    env: string;
    auth_disabled: boolean;
    settings: { name: string; set: boolean }[];
    admins: string[];
    min_group: number;
    you: { email: string | null; verified: boolean };
}

async function get<T>(path: string): Promise<T> {
    const res = await authed(`/admin${path}`);
    if (res.status === 401 || res.status === 403) throw new RagError('Admin access required.', res.status);
    if (!res.ok) {
        const detail = await res.json().then((d) => (typeof d.detail === 'string' ? d.detail : null)).catch(() => null);
        throw new RagError(detail ?? 'Could not load this right now.', res.status);
    }
    return res.json();
}

export const adminOverview = (days = 14) => get<Overview>(`/overview?days=${days}`);
export const adminLearners = () => get<Learners>('/learners');
export const adminChallenges = () => get<{ challenges: ChallengeRow[]; min_group: number }>('/challenges');
export const adminQuality = (days = 14) => get<Quality>(`/quality?days=${days}`);
export const adminSystem = () => get<SystemInfo>('/system');

export async function adminTool(tool: 'clear-cache' | 'prune-shares' | 'prune-gaps'): Promise<{ affected: number; message: string }> {
    const res = await authed(`/admin/tools/${tool}`, { method: 'POST' });
    if (!res.ok) throw new RagError(res.status === 503 ? 'The database is not connected.' : 'That tool failed.', res.status);
    return res.json();
}

export interface Gap { topic: string; count: number; examples: string[]; closest_concept?: { id: string; title: string; similarity: number }; suggestion?: string }
export const adminGaps = () => authed('/rag/admin/gaps').then((r) => (r.ok ? r.json() : Promise.reject(new RagError('Could not load content gaps.', r.status)))) as
    Promise<{ clusters: Gap[]; total: number; retention_days?: number }>;

// ---------- drill-downs, engagement, inspector ----------
export interface ConceptDetail {
    concept: string; title: string;
    prerequisites: { id: string; title: string }[]; dependents: { id: string; title: string }[];
    learners: Gated; bands: { learning: Gated; ready: Gated; mastered: Gated }; overdue: Gated; struggling: Gated;
    answers: number | null; accuracy: number | null; median_seconds: number | null;
    weekly: { weeks_ago: number; answers: number | null; accuracy: number | null }[];
    confused_with: { title: string; times: number }[]; mistaken_for: { title: string; times: number }[];
    missed_questions: Learners['missed_questions'];
    challenges: ChallengeRow[];
    document: { level: number; domain: string; tags: string[]; version: number; passages: number };
    min_group: number;
}
export interface DocumentDetail {
    id: string; title: string; level: number; domain: string; prerequisites: string[]; tags: string[]; version: number; source: string;
    passages: { id: string; text: string }[];
}
export interface Engagement {
    cohorts: { week_of: string; learners: Gated; retention: (number | null)[] }[];
    weeks: number; weekdays: string[]; grid: number[][] | null; answers: number; learners: Gated;
    peak: { day: string; hour: number } | null; min_group: number;
}
export interface Inspection {
    query: string; level: string;
    screen: { passed: boolean; guard_score: number | null; guard_threshold: number; reason: string | null };
    plan?: { intent: string; concepts: { id: string; title: string }[]; rewrites: string[]; warnings: string[] };
    candidates?: { rank: number | null; chunk_id: string; doc_id: string; doc_title: string; heading: string; text: string;
        dense: number; bm25: number; fused: number; rerank: number | null; via: string[]; kept: boolean }[];
    retrieved?: number;
    gate?: { answer: boolean; top_score: number; min_top_score: number; coverage: number; min_coverage: number; missing_keywords: string[]; reasons: string[] };
    evidence?: { ref: number; doc_title: string; heading: string; score: number; text: string }[];
}

export const adminConcept = (id: string) => get<ConceptDetail>(`/concept/${encodeURIComponent(id)}`);
export const adminDocument = (id: string) => get<DocumentDetail>(`/documents/${encodeURIComponent(id)}`);
export const adminEngagement = () => get<Engagement>('/engagement');

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await authed(`/admin${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
        const detail = await res.json().then((d) => (typeof d.detail === 'string' ? d.detail : null)).catch(() => null);
        throw new RagError(detail ?? 'That did not work.', res.status);
    }
    return res.json();
}
export const adminInspect = (query: string, level: string) => send<Inspection>('/inspect', 'POST', { query, level });

// ---------- announcements and audit ----------
export interface Announcement { id: number; text: string; level: 'info' | 'warning'; created_by?: string; created_at: string; expires_at?: string; live?: boolean }
export interface AuditEntry { actor: string; action: string; detail: Record<string, unknown>; created_at: string }

export const listAnnouncements = () => get<{ announcements: Announcement[] }>('/announcements');   // 503 carries the migration hint
export const postAnnouncement = (text: string, level: 'info' | 'warning', days: number) => send<Announcement>('/announcements', 'POST', { text, level, days });
export const retractAnnouncement = (id: number) => send<Announcement>(`/announcements/${id}`, 'DELETE');
export const adminAudit = () => get<{ entries: AuditEntry[] }>('/audit');
