import { useCallback, useEffect, useState } from 'react';
import { fetchAnnouncements, type LearnerAnnouncement } from '../lib/learning';

const SEEN = 'kiddoo-seen-announcements';
const DISMISSED = 'kiddoo-dismissed-announcement';
const EVERY_MS = 30_000;

function readSeen(): number[] {
    try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch { return []; }
}
function readDismissed(): number | null {
    try { return Number(localStorage.getItem(DISMISSED)) || null; } catch { return null; }
}
function write(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: state lasts for this visit */ }
}

/** Live announcements: re-checked every 30 s while the tab is visible and whenever it regains focus. */
export function useAnnouncements() {
    const [items, setItems] = useState<LearnerAnnouncement[]>([]);
    const [seen, setSeen] = useState<number[]>(readSeen);
    const [dismissed, setDismissed] = useState<number | null>(readDismissed);

    const load = useCallback(async () => {
        try { setItems((await fetchAnnouncements()).announcements); } catch { /* keep the last list */ }
    }, []);

    useEffect(() => {
        void load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, EVERY_MS);
        const onFocus = () => void load();
        window.addEventListener('focus', onFocus);
        return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
    }, [load]);

    const banner = items.find((a) => a.live && a.id !== dismissed) ?? null;
    const unread = items.filter((a) => !seen.includes(a.id)).length;

    const dismiss = (id: number) => { setDismissed(id); write(DISMISSED, String(id)); };
    const markAllSeen = () => {
        const ids = [...new Set([...seen, ...items.map((a) => a.id)])].slice(-50);
        setSeen(ids);
        write(SEEN, JSON.stringify(ids));
    };
    return { items, banner, unread, dismiss, markAllSeen };
}
