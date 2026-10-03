import { describe, expect, it } from 'vitest';
import { record, type AlgoId } from './algoSteps';
import { speakable } from './speech';

// small deterministic PRNG so failures are reproducible
function rng(seed: number) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

const SORTS: AlgoId[] = ['bubble', 'insertion', 'selection', 'merge', 'quick'];
const last = <T,>(xs: T[]): T => xs[xs.length - 1];

describe('algorithm recorders run the real algorithms', () => {
    it('every sort ends sorted, keeps the same elements, on random inputs', () => {
        const r = rng(42);
        for (let t = 0; t < 200; t++) {
            const n = 1 + Math.floor(r() * 14);
            const arr = Array.from({ length: n }, () => Math.floor(r() * 40));
            const expected = [...arr].sort((a, b) => a - b);
            for (const id of SORTS) {
                const steps = record(id, arr, 0);
                expect(last(steps).array, `${id} on ${arr}`).toEqual(expected);
                expect([...steps[0].array].sort((a, b) => a - b)).toEqual(expected);
            }
        }
    });

    it('binary search finds present targets, reports absent ones, and never exceeds floor(log2 n)+1 comparisons', () => {
        const r = rng(7);
        for (let t = 0; t < 200; t++) {
            const n = 1 + Math.floor(r() * 14);
            const arr = Array.from({ length: n }, () => Math.floor(r() * 40));
            const sorted = [...arr].sort((a, b) => a - b);
            const target = r() < 0.5 ? arr[Math.floor(r() * n)] : 999;
            const end = last(record('binary', arr, target));
            if (target === 999) expect(end.found).toBeUndefined();
            else expect(sorted[end.found as number]).toBe(target);
            expect(end.comparisons).toBeLessThanOrEqual(Math.floor(Math.log2(n)) + 1);
        }
    });

    it('linear search agrees with the array', () => {
        expect(last(record('linear', [4, 8, 15, 16], 15)).found).toBe(2);
        expect(last(record('linear', [4, 8, 15, 16], 3)).found).toBeUndefined();
    });

    it('comparison counts match the textbook values', () => {
        const asc = [1, 2, 3, 4, 5, 6, 7, 8];
        const desc = [...asc].reverse();
        expect(last(record('bubble', asc, 0)).comparisons).toBe(7);      // best case: one pass, then stops
        expect(last(record('bubble', desc, 0)).comparisons).toBe(28);    // worst case: n(n-1)/2
        expect(last(record('selection', asc, 0)).comparisons).toBe(28);  // always n(n-1)/2
    });

    it('does not mutate the caller input', () => {
        const input = [3, 1, 2];
        record('bubble', input, 0);
        expect(input).toEqual([3, 1, 2]);
    });
});

describe('speech text', () => {
    it('removes citation markers, markdown and code before speaking', () => {
        const t = speakable('Binary search is **fast** [1][2].\n\n```py\nprint(1)\n```\nIt halves the range.');
        expect(t).not.toMatch(/\[\d\]|\*|`/);
        expect(t).toContain('code omitted');
        expect(t).toContain('halves the range');
    });
});
