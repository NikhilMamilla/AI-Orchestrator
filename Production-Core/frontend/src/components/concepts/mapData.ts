// The concept map's data shapes, colours and graph helpers (kept apart from the component for fast refresh).
export interface MapConcept {
    id: string;
    title: string;
    domain: string;
    difficulty?: number;
    status: 'mastered' | 'learning' | 'locked';
    band?: 'mastered' | 'partial' | 'weak' | 'needs_work' | 'untouched';
    mastery_level: number;
    x: number;
    y: number;
    color: string;
}
export interface MapLink { source: string; target: string }

// the PRD's mastery bands (8.1-B), in the app's sticker palette
export const BAND_FILL: Record<string, string> = { mastered: '#3fbf8a', partial: '#f3dc8f', weak: '#ffb47a', needs_work: '#ff8a73', untouched: '#fffaf0' };
export const BAND_LABEL: [string, string][] = [['mastered', 'Mastered 80%+'], ['partial', 'Partial 60–80%'], ['weak', 'Weak 40–60%'], ['needs_work', 'Needs work < 40%'], ['untouched', 'Not started']];

/** Every concept reachable by following links backwards (prerequisites) or forwards (what it unlocks). */
export function related(links: MapLink[], id: string) {
    const up = new Set<string>(), down = new Set<string>();
    const walk = (from: string, set: Set<string>, dir: 'up' | 'down') => {
        for (const l of links) {
            const next = dir === 'up' ? (l.target === from ? l.source : null) : (l.source === from ? l.target : null);
            if (next && !set.has(next)) { set.add(next); walk(next, set, dir); }
        }
    };
    walk(id, up, 'up');
    walk(id, down, 'down');
    return { up, down };
}

