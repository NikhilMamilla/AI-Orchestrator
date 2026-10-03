import { authed, RagError } from './rag';

const API = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000/api/v1';

export interface ShareLink {
    id: string;
    label: string;
    created_at: string;
    expires_at: string;
    last_viewed_at: string | null;
    views: number;
}

export interface SharedSummary {
    shared_with: string;
    link_expires_at: string;
    concepts: { id: string; title: string; mastery: number }[];
    mastered: number;
    total_concepts: number;
    streak_days: number;
    answers: number;
    accuracy: number | null;
    reviews_overdue: number;
    alerts: { title: string; severity: 'info' | 'warn'; suggestion: string }[];
    best_time_of_day: { bucket: string; accuracy: number; n: number } | null;
    goal: { target: string; deadline: string; daily_minutes: number; progress: number } | null;
    longest_streak: number;
    levels: { level: number; mastered: number; total: number }[];
    strongest: { title: string; mastery: number }[];
    focus: { title: string; mastery: number }[];
    challenges: { passed: number; total: number };
    progress: { date: string; mastery: number; answers: number; accuracy: number | null }[];
    weekly: { weeks_ago: number; answers: number; accuracy: number | null }[];
    updated_at: string;
}

async function ok<T>(res: Response, fallback: string): Promise<T> {
    if (res.ok) return res.json();
    throw new RagError(fallback, res.status);
}

export async function createShare(label: string, days = 30): Promise<{ id: string; token: string; expires_at: string; path: string }> {
    const res = await authed('/share/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, days }) });
    return ok(res, 'Could not create the link.');
}

export async function listShares(): Promise<ShareLink[]> {
    return ok(await authed('/share/'), 'Could not load your links.');
}

export async function revokeShare(id: string): Promise<void> {
    await ok(await authed(`/share/${id}`, { method: 'DELETE' }), 'Could not revoke the link.');
}

/** Public: no login. The token in the URL is the credential. */
export async function viewShared(token: string): Promise<SharedSummary> {
    const res = await fetch(`${API}/share/view/${encodeURIComponent(token)}`);
    if (res.status === 404) throw new RagError('This link is not valid, has expired, or was turned off by the student.', 404);
    if (res.status === 429) throw new RagError('Too many requests. Try again in a minute.', 429);
    return ok(res, 'Could not load this summary.');
}
