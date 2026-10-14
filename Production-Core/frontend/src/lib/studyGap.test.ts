import { describe, expect, it } from 'vitest';
import { postTestOpensText } from './studyGap';

describe('Evidence Lab: when the post-test opens', () => {
    it('says when it opens and why', () => {
        const text = postTestOpensText({ post_open: false, post_opens_at: '2026-10-17T14:30:00+00:00', min_gap_hours: 72 }, 'UTC');
        expect(text).toContain('17 Oct 2026');
        expect(text).toContain('14:30');
        expect(text).toContain('72 hours');
    });
    it('says nothing once the post-test is open', () => {
        expect(postTestOpensText({ post_open: true, post_opens_at: '2026-10-17T14:30:00+00:00', min_gap_hours: 72 }, 'UTC')).toBeNull();
    });
    it('says nothing when the server sent no opening time (an older server)', () => {
        expect(postTestOpensText({}, 'UTC')).toBeNull();
    });
});
