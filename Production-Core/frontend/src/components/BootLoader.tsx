import { useEffect } from 'react';

/** The same "Loading…" screen index.html paints before any JavaScript (classes styled there), shown while sign-in or a
 *  page's code resolves. Mounting it removes the static copy, so the two hand over without a flash. */
export default function BootLoader() {
    useEffect(() => { document.getElementById('boot')?.remove(); }, []);
    return (
        <div className="boot" role="status" aria-label="Loading">
            <div className="boot-in"><span className="boot-mark" /><span className="boot-dots">Loading<i /><i /><i /></span></div>
        </div>
    );
}
