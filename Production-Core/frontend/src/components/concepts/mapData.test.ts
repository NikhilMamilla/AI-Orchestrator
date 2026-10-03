import { describe, expect, it } from 'vitest';
import { related } from './mapData';

describe('concept map chain', () => {
    const links = [
        { source: 'big-o', target: 'arrays' }, { source: 'arrays', target: 'two-pointers' },
        { source: 'arrays', target: 'prefix-sum' }, { source: 'recursion', target: 'dfs' },
    ];
    it('finds everything a concept needs and everything it unlocks, transitively', () => {
        const { up, down } = related(links, 'arrays');
        expect([...up]).toEqual(['big-o']);
        expect([...down].sort()).toEqual(['prefix-sum', 'two-pointers']);
        expect(related(links, 'two-pointers').up).toEqual(new Set(['arrays', 'big-o']));
    });
    it('leaves unrelated concepts out and survives a cycle', () => {
        expect(related(links, 'arrays').up.has('recursion')).toBe(false);
        const cyc = related([{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }], 'a');
        expect(cyc.up.has('b') && cyc.down.has('b')).toBe(true);
    });
});
