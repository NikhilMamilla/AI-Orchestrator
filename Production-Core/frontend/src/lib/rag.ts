import { getAccessToken } from './firebase';

export const API = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000/api/v1';

export type Level = 'beginner' | 'intermediate' | 'advanced';
/** `auto` lets the server pick the level from the learner's measured mastery. */
export type AskLevel = Level | 'auto';

export interface Personalization {
    focus: string;
    focus_title: string;
    focus_mastery: number | null;
    level_used: Level;
    suggested_level: Level;
    prerequisites_to_revisit: { id: string; title: string; mastery: number | null; status: 'weak' | 'unpracticed' }[];
}
export type Style = 'auto' | 'default' | 'socratic' | 'worked_example' | 'analogy';
export type AnswerStatus = 'grounded' | 'insufficient_evidence' | 'rejected' | 'error';

export interface Evidence {
    ref: number;
    chunk_id: string;
    doc_id: string;
    doc_title: string;
    heading_path: string;
    text: string;
    score: number;
}

export interface Citation {
    ref: number;
    chunk_id: string;
    doc_id: string;
    title: string;
    section: string;
    score: number;
}

export interface TraceStage {
    name: string;
    ms: number;
    ok: boolean;
    [k: string]: unknown;
}

export interface ClaimCheck {
    text: string;
    support: number;
    supported: boolean;
    status: 'supported' | 'weak' | 'unsupported';
    entailment: number | null;
    cited: number[];
}

export interface StyleInfo {
    used: Exclude<Style, 'auto'>;
    auto: boolean;
    summary: { styles: Record<string, { n: number; wins: number; rate: number | null }>; best: string | null; total_trials: number };
}

export interface Trace {
    request_id: string;
    total_ms: number;
    stages: TraceStage[];
    model?: string;
    mode?: 'llm' | 'extractive';
    tokens_total?: number;
    retrieved?: number;
    embedder?: string;
    reranker?: string;
    intent?: string;
    top_score?: number;
    cache_hit?: boolean;
    failure?: string;
    personalization?: Personalization;
    style?: StyleInfo;
    verifier?: 'nli+lexical' | 'lexical';
    claim_checks?: ClaimCheck[];
}

export interface RagAnswer {
    text: string;
    status: AnswerStatus;
    confidence: number;
    citations: Citation[];
    unsupported_claims: string[];
    evidence: Evidence[];
    trace: Trace;
}

export type StageName = 'screen' | 'understand' | 'retrieve' | 'rerank' | 'context' | 'generate' | 'verify';

export interface AskParams {
    query: string;
    level: AskLevel;
    style: Style;
    history?: { role: 'user' | 'assistant'; content: string }[];
}

export class RagError extends Error {
    status?: number;
    retryAfter?: number;
    constructor(message: string, status?: number, retryAfter?: number) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

/** Streams real pipeline stage events, then resolves with the final answer. */
export async function askStream(
    params: AskParams,
    onStage: (name: StageName, info: Record<string, unknown>) => void,
    signal?: AbortSignal,
): Promise<RagAnswer> {
    const token = await getAccessToken();
    let res: Response;
    try {
        res = await fetch(`${API}/rag/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(params),
            signal,
        });
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new RagError('Cannot reach the server. Check your connection and try again.');
    }
    if (res.status === 429) {
        throw new RagError('You are asking too fast. Please wait a moment.', 429, Number(res.headers.get('Retry-After')) || 10);
    }
    if (res.status === 401) throw new RagError('Your session has expired. Please sign in again.', 401);
    if (res.status === 422) throw new RagError('That question could not be processed.', 422);
    if (!res.ok || !res.body) throw new RagError('The server had a problem. Please try again.', res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let answer: RagAnswer | null = null;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const event = /^event: (.*)$/m.exec(frame)?.[1];
            const data = /^data: (.*)$/m.exec(frame)?.[1];
            if (!event || !data) continue;
            const payload = JSON.parse(data);
            if (event === 'stage') onStage(payload.name as StageName, payload);
            else if (event === 'answer') answer = payload as RagAnswer;
            else if (event === 'error') throw new RagError(payload.message ?? 'Something went wrong.');
        }
    }
    if (!answer) throw new RagError('The connection closed before an answer arrived.');
    return answer;
}

export async function fetchChunk(chunkId: string): Promise<{ doc_title: string; heading_path: string; text: string; version: number | null }> {
    const token = await getAccessToken();
    const res = await fetch(`${API}/rag/chunks/${encodeURIComponent(chunkId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new RagError('Could not load that source.', res.status);
    return res.json();
}

// ───────── admin / observability ─────────
export async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    return fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

export interface Metrics {
    counters: Record<string, number>;
    latency_ms: { p50: number | null; p95: number | null };
    stage_latency_ms: Record<string, { p50: number | null; p95: number | null }>;
    tokens_total: number;
    recent: (Trace & { status?: string; confidence?: number; query_chars?: number })[];
}

export interface KbDocument {
    id: string;
    title: string;
    level: number;
    domain: string;
    prerequisites: string[];
    tags: string[];
    version: number;
}

export interface KbOverview {
    documents: KbDocument[];
    stats: { documents: number; sections: number; passages: number };
    embedder: string;
    reranker: string;
}

export async function fetchMetrics(): Promise<Metrics> {
    const res = await authed('/rag/admin/metrics');
    if (res.status === 403) throw new RagError('Admin access required.', 403);
    if (!res.ok) throw new RagError('Could not load metrics.', res.status);
    return res.json();
}

export async function fetchKnowledgeBase(): Promise<KbOverview> {
    const res = await authed('/rag/documents');
    if (!res.ok) throw new RagError('Could not load the knowledge base.', res.status);
    return res.json();
}

export async function uploadDocument(file: File): Promise<{ added: string[]; updated: string[]; unchanged: string[]; duplicate_passages_dropped: number; quarantined_spans: number }> {
    const body = new FormData();
    body.append('file', file);
    const res = await authed('/rag/documents', { method: 'POST', body });
    if (res.status === 403) throw new RagError('Admin access required.', 403);
    if (res.status === 429) throw new RagError('Too many uploads. Wait a minute.', 429);
    if (res.status === 422) throw new RagError((await res.json()).detail ?? 'File rejected.', 422);
    if (!res.ok) throw new RagError('Upload failed.', res.status);
    return res.json();
}
