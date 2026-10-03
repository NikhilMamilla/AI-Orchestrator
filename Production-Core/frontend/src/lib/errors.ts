/** Best user-facing message from an axios/Error/unknown failure. */
export function errorMessage(err: unknown, fallback: string): string {
    const e = err as { response?: { data?: { detail?: unknown } }; message?: unknown } | null;
    const detail = e?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    return typeof e?.message === 'string' && e.message ? e.message : fallback;
}
