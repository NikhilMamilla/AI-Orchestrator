import { describe, expect, it } from 'vitest';
import { coverageNote } from './format';

describe('admin statistics coverage', () => {
    it('says nothing when every learner is counted', () => {
        expect(coverageNote({ profiles_used: 120, profiles_total: 120, capped: false })).toBe('');
        expect(coverageNote(undefined)).toBe('');
    });
    it('says plainly when the statistics cover only the most recent learners', () => {
        const note = coverageNote({ profiles_used: 5000, profiles_total: 7200, capped: true });
        expect(note).toContain('5,000');
        expect(note).toContain('7,200');
        expect(note.toLowerCase()).toContain('most recently active');
    });
});
