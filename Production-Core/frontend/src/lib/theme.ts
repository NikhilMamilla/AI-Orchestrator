import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'kiddoo-theme';
const listeners = new Set<() => void>();

function stored(): Theme | null {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : null;
    } catch {
        return null;                       // private mode / blocked storage: fall back to the system preference
    }
}

export function systemTheme(): Theme {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
    return (document.documentElement.dataset.theme as Theme | undefined) ?? stored() ?? systemTheme();
}

export function applyTheme(t: Theme, persist = true): void {
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#090d1c' : '#fbf6ee');
    if (persist) {
        try {
            localStorage.setItem(KEY, t);
        } catch {
            /* ignore */
        }
    }
    listeners.forEach((l) => l());
}

/** Call once before first paint (also done by an inline script in index.html to avoid a flash). */
export function initTheme(): void {
    applyTheme(stored() ?? systemTheme(), false);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!stored()) applyTheme(e.matches ? 'dark' : 'light', false);
    });
}

export function useTheme(): [Theme, () => void] {
    const theme = useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        currentTheme,
        () => 'light' as Theme,
    );
    return [theme, () => applyTheme(theme === 'dark' ? 'light' : 'dark')];
}

/** The setting as chosen: a fixed theme, or follow the system. */
export type ThemeMode = Theme | 'system';
export function themeMode(): ThemeMode {
    return stored() ?? 'system';
}
export function setThemeMode(mode: ThemeMode): void {
    if (mode === 'system') {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        applyTheme(systemTheme(), false);
    } else {
        applyTheme(mode);
    }
}

/** Reduced motion, chosen in Settings (on top of the system preference): stops the app's decorative animation. */
const MOTION_KEY = 'kiddoo-motion';
export function motionReduced(): boolean {
    try { return localStorage.getItem(MOTION_KEY) === 'reduce'; } catch { return false; }
}
export function setMotionReduced(on: boolean): void {
    try { if (on) localStorage.setItem(MOTION_KEY, 'reduce'); else localStorage.removeItem(MOTION_KEY); } catch { /* ignore */ }
    if (on) document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
}

/* ── More appearance, kept per device in localStorage for a no-flash first paint, and synced to the server (prefs.ui) ── */
const TEXT_KEY = 'kiddoo-text', PETALS_KEY = 'kiddoo-petals', CONTRAST_KEY = 'kiddoo-contrast';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

export type TextSize = 90 | 100 | 110 | 120;
export function textSize(): TextSize { return (Number(get(TEXT_KEY)) || 100) as TextSize; }
export function setTextSize(size: TextSize): void {
    put(TEXT_KEY, size === 100 ? null : String(size));
    document.documentElement.style.fontSize = size === 100 ? '' : `${size}%`;
}
export function petalsOn(): boolean { return get(PETALS_KEY) !== 'off'; }
export function setPetals(on: boolean): void {
    put(PETALS_KEY, on ? null : 'off');
    if (on) delete document.documentElement.dataset.petals; else document.documentElement.dataset.petals = 'off';
}
export function contrastOn(): boolean { return get(CONTRAST_KEY) === 'high'; }
export function setContrast(on: boolean): void {
    put(CONTRAST_KEY, on ? 'high' : null);
    if (on) document.documentElement.dataset.contrast = 'high'; else delete document.documentElement.dataset.contrast;
}

export interface UiPrefs { theme: ThemeMode; text_size: TextSize; petals: boolean; motion: 'full' | 'reduce'; contrast: boolean }
export function currentUi(): UiPrefs {
    return { theme: themeMode(), text_size: textSize(), petals: petalsOn(), motion: motionReduced() ? 'reduce' : 'full', contrast: contrastOn() };
}
/** Apply appearance saved on the server (another device's choices follow the learner here). */
export function applyUi(ui: Partial<UiPrefs>): void {
    if (ui.theme) setThemeMode(ui.theme);
    if (ui.text_size) setTextSize(ui.text_size);
    if (typeof ui.petals === 'boolean') setPetals(ui.petals);
    if (ui.motion) setMotionReduced(ui.motion === 'reduce');
    if (typeof ui.contrast === 'boolean') setContrast(ui.contrast);
}
