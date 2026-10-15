import { describe, expect, it } from 'vitest';
import { CONCEPT_GRAPH } from '../lib/conceptGraph';
import { DOMAINS } from './domains';
import { coverage } from './coverage';

describe('roadmap coverage', () => {
    it('counts the domains that have notes and the ones that do not, from the real data', () => {
        const c = coverage(DOMAINS);
        expect(c.total).toBe(22);
        expect(c.covered + c.missing.length).toBe(c.total);
        expect(c.concepts).toBe(CONCEPT_GRAPH.length);                         // every written concept sits in exactly one domain
        expect(c.missing).toContain('Segment Trees & Fenwick Tree');           // on the roadmap, not written yet
        expect(c.missing).not.toContain('Arrays');
    });
    it('says so in one honest sentence', () => {
        const c = coverage(DOMAINS);
        expect(c.sentence).toBe(`The roadmap has ${c.total} domains; Kiddoo's notes cover ${c.covered} of them so far (${c.concepts} concepts).`);
    });
});
