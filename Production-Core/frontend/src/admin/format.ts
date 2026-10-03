import type { Gated } from './api';

/** A gated learner count: the number, or "<k" when the server hid a group too small to show. */
export const gated = (v: Gated | undefined, k: number) => (v == null ? `<${k}` : v.toLocaleString());
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '–' : `${(v * 100).toFixed(digits)}%`);
export const ms = (v: number | null | undefined) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
export const num = (v: number | null | undefined) => (v == null ? '–' : v.toLocaleString());
export const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
export const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export function ago(t: number, now: number) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`;
}

/** Download rows as a CSV file (aggregates only; the console never holds learner-level data). */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
}
