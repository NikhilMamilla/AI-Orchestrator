import type { StudyStatus } from './learning';

/** One sentence about when the post-test opens, or null when it is already open (or the server did not say). */
export function postTestOpensText(st: Pick<StudyStatus, 'post_open' | 'post_opens_at' | 'min_gap_hours'>, timeZone?: string): string | null {
    if (st.post_open !== false || !st.post_opens_at) return null;
    const when = new Date(st.post_opens_at).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    });
    const gap = st.min_gap_hours ? `${st.min_gap_hours} hours after you finished the pre-test, ` : '';
    return `Your post-test opens ${gap}on ${when}${timeZone === 'UTC' ? ' UTC' : ''}. Keep learning until then; it measures what stayed with you, not what you remember from a minute ago.`;
}
