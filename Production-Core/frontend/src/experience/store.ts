import { create } from 'zustand';
import { DOMAINS } from './domains';

/**
 * State the HUD shows and the stages share. Per-frame values (progress, hold fill, ruler position) never go through
 * here: the engine writes them as CSS variables on the experience root so React does not re-render every frame.
 */
export interface ExperienceState {
    active: boolean;                    // the story owns the screen and the input
    stage: number;
    reached: number;                    // furthest stage reached (ruler ticks up to here are jumps)
    xp: number;
    xpGain: { amount: number; id: number } | null;
    hold: { visible: boolean; label: string };
    muted: boolean;
    domain: number;                     // selected district in the city
    zoom: number;                       // city camera zoom, 0.55..2.4
    joy: { x: number; y: number };      // city joystick, -1..1
    announce: string;                   // polite live region
    cityReady: boolean;                 // the city's opening is over and it can be browsed
    hover: number;                      // district under the pointer, -1 for none

    set: (p: Partial<ExperienceState>) => void;
    gainXp: (total: number) => void;
    stepDomain: (d: number) => void;
    zoomBy: (f: number) => void;
}

let gainId = 0;

export const useExperience = create<ExperienceState>((set, get) => ({
    active: false,
    stage: 0,
    reached: 0,
    xp: 0,
    xpGain: null,
    hold: { visible: false, label: '' },
    muted: true,
    domain: 1,                          // the city opens on Arrays, the first building block after the foundations
    zoom: 1,
    joy: { x: 0, y: 0 },
    announce: '',
    cityReady: false,
    hover: -1,

    set: (p) => set(p),
    gainXp: (total) => {
        const cur = get().xp;
        if (total <= cur) return;
        set({ xp: total, xpGain: { amount: total - cur, id: ++gainId } });
    },
    stepDomain: (d) => set({ domain: (get().domain + d + DOMAINS.length) % DOMAINS.length }),
    zoomBy: (f) => set({ zoom: Math.min(2.4, Math.max(0.55, get().zoom * f)) }),
}));
