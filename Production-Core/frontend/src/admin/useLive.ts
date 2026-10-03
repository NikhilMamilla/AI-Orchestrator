import { useCallback, useEffect, useRef, useState } from 'react';
import { RagError } from '../lib/rag';

export interface Live<T> {
    data: T | null;
    error: string | null;
    loading: boolean;
    updated: number;
    reload: () => Promise<void>;
}

/** Loads now, then again every `everyMs` while the tab is visible. Keeps the last good data through a failed refresh. */
export function useLive<T>(load: () => Promise<T>, everyMs: number, deps: unknown[] = []): Live<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [updated, setUpdated] = useState(0);
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; });

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            setData(await loadRef.current());
            setError(null);
            setUpdated(Date.now());
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not load this right now.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, everyMs);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, everyMs, ...deps]);

    return { data, error, loading, updated, reload };
}

/** A clock that ticks every few seconds, for "updated 12s ago" labels. */
export function useNow(everyMs = 5000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), everyMs);
        return () => clearInterval(t);
    }, [everyMs]);
    return now;
}
