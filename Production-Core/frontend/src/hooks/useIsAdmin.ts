import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { authed } from '../lib/rag';

// One question per account (and per verification state): the server decides, the UI only hides what would 403 anyway.
const cache = new Map<string, Promise<boolean>>();

export function checkAdmin(key: string): Promise<boolean> {
    if (!cache.has(key)) {
        cache.set(key, authed('/learning/study/role')
            .then((r) => (r.ok ? r.json() : { admin: false }))
            .then((d: { admin?: boolean }) => !!d.admin)
            .catch(() => { cache.delete(key); return false; }));
    }
    return cache.get(key)!;
}

const remembered = (key: string): boolean | null => {
    try { const v = localStorage.getItem(`kiddoo-role:${key}`); return v == null ? null : v === '1'; } catch { return null; }
};
const remember = (key: string, admin: boolean) => {
    try { localStorage.setItem(`kiddoo-role:${key}`, admin ? '1' : '0'); } catch { /* storage blocked */ }
};

/** Whether the signed-in account is an admin. Answers instantly from the last answer on this device (a hint for the UI
 *  only: the server checks every admin request), then confirms with the server. */
export function useIsAdmin(): boolean | null {
    const user = useAuthStore((s) => s.user);
    const key = user ? `${user.id}:${user.emailVerified}` : '';
    const [state, setState] = useState<{ key: string; admin: boolean } | null>(null);

    useEffect(() => {
        if (!key) return;
        let live = true;
        void checkAdmin(key).then((admin) => { remember(key, admin); if (live) setState({ key, admin }); });
        return () => { live = false; };
    }, [key]);

    if (!key) return false;
    return state?.key === key ? state.admin : remembered(key);
}
