import { describe, expect, it } from 'vitest';
import { detectCircle, type Pt } from './circleGesture';

const VIEW = { w: 1366, h: 768 };
const arc = (from: number, to: number, r = 160, cx = 600, cy = 380, n = 60, wobble = 0): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
        const a = from + ((to - from) * i) / n;
        const rr = r + Math.sin(i * 1.7) * wobble;
        return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
    });

describe('detectCircle', () => {
    it('accepts a full circle and reports its centre and radius', () => {
        const r = detectCircle(arc(0, 2 * Math.PI), VIEW);
        expect(r.ok).toBe(true);
        expect(r.cx).toBeCloseTo(600, -1);
        expect(r.cy).toBeCloseTo(380, -1);
        expect(r.r).toBeCloseTo(160, -1);
    });

    it('accepts a circle drawn the other way, starting anywhere, with a slightly shaky hand', () => {
        expect(detectCircle(arc(Math.PI, -Math.PI + 0.1, 150, 700, 300, 80, 10), VIEW).ok).toBe(true);
    });

    it('accepts a loop that overshoots the start a little', () => {
        expect(detectCircle(arc(0.4, 0.4 + 2 * Math.PI + 0.35), VIEW).ok).toBe(true);
    });

    it('rejects a half circle, a straight line and a tiny scribble', () => {
        expect(detectCircle(arc(0, Math.PI), VIEW).ok).toBe(false);
        expect(detectCircle(arc(0, 1.6 * Math.PI), VIEW).ok).toBe(false);          // 288 degrees: not closed enough
        const line = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 15, y: 300 + i }));
        expect(detectCircle(line, VIEW).ok).toBe(false);
        expect(detectCircle(arc(0, 2 * Math.PI, 20), VIEW)).toMatchObject({ ok: false, reason: 'small' });
    });

    it('rejects a figure eight and a loop that never closes', () => {
        const eight: Pt[] = Array.from({ length: 80 }, (_, i) => {
            const t = (i / 79) * 2 * Math.PI;
            return { x: 600 + 170 * Math.sin(t), y: 380 + 110 * Math.sin(2 * t) };
        });
        expect(detectCircle(eight, VIEW).ok).toBe(false);
        expect(detectCircle(arc(0, 2 * Math.PI * 0.86), VIEW).ok).toBe(false);
    });

    it('needs enough points', () => {
        expect(detectCircle(arc(0, 2 * Math.PI, 160, 600, 380, 6), VIEW)).toMatchObject({ ok: false, reason: 'short' });
    });
});
