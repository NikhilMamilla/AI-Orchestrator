export interface Pt { x: number; y: number }
export interface CircleResult { ok: boolean; cx: number; cy: number; r: number; reason?: 'short' | 'small' | 'open' | 'wobbly' | 'partial' }

/**
 * Decides whether a pointer path is a hand-drawn circle (the "draw a zero" gate).
 * Rules, all measured on the path itself:
 *   - enough samples and a minimum size (relative to the screen, so a tiny scribble does not count)
 *   - it sweeps at least ~300 degrees around its own centre, in one direction
 *   - its distance from the centre stays roughly constant (not a line, a figure eight or a zig-zag)
 *   - it closes: the end comes back near the start
 * Returns the centre and mean radius so the caller can open the scene from the circle you drew.
 */
export function detectCircle(points: readonly Pt[], viewport: { w: number; h: number }): CircleResult {
    const fail = (reason: CircleResult['reason'], cx = 0, cy = 0, r = 0): CircleResult => ({ ok: false, cx, cy, r, reason });
    if (points.length < 12) return fail('short');

    let sx = 0, sy = 0;
    for (const p of points) { sx += p.x; sy += p.y; }
    const cx = sx / points.length, cy = sy / points.length;
    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    if (mean * 2 < 0.22 * Math.min(viewport.w, viewport.h)) return fail('small', cx, cy, mean);

    const variance = radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length;
    if (Math.sqrt(variance) / mean > 0.3) return fail('wobbly', cx, cy, mean);

    let swept = 0, prev = Math.atan2(points[0].y - cy, points[0].x - cx);
    for (let i = 1; i < points.length; i++) {
        const a = Math.atan2(points[i].y - cy, points[i].x - cx);
        let d = a - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        swept += d;
        prev = a;
    }
    if (Math.abs(swept) < 0.83 * 2 * Math.PI) return fail('partial', cx, cy, mean);

    const first = points[0], last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) > 0.7 * mean) return fail('open', cx, cy, mean);
    return { ok: true, cx, cy, r: mean };
}
