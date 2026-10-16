/** The free backend host goes to sleep when idle and takes 30-60 s to wake. A request that arrives while it wakes times out;
 *  these helpers wake it early (while the visitor is still on the landing or sign-in page) and retry reads that failed
 *  only because it was waking. Writes are never retried: they might already have happened. */
export const MAX_RETRIES = 2;
export const RETRY_DELAY_MS = 3000;
const WAKING_STATUSES = new Set([502, 503, 504]);

export function shouldRetry(err: { code?: string; response?: { status?: number }; config?: { method?: string; __retries?: number } }): boolean {
    const method = (err.config?.method ?? 'get').toLowerCase();
    if (method !== 'get') return false;
    if ((err.config?.__retries ?? 0) >= MAX_RETRIES) return false;
    if (!err.response) return err.code !== 'ERR_CANCELED';           // timeout or no connection while the host wakes
    return WAKING_STATUSES.has(err.response.status ?? 0);
}

/** One cheap, fire-and-forget request that makes the host start waking up. Failure is fine. */
export function wakeBackend(baseUrl: string): void {
    try { void fetch(`${baseUrl.replace(/\/$/, '')}/health`, { method: 'GET', cache: 'no-store' }).catch(() => undefined); } catch { /* ignore */ }
}
