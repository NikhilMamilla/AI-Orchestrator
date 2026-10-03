/**
 * The rules of the story, kept free of three.js and the DOM so they can be tested: which stages exist, how scrolling
 * moves the progress of a stage, how a hold gate fills and drains, and when a stage hands over to the next one.
 *
 * Scrolling is virtual. The page never scrolls: wheel, touch and keys move a `target` in 0..1 for the current stage, and
 * the displayed `value` follows it smoothly. A hold gate stops the target at `hold.at` until it is completed.
 */

export type StageId = 'believed' | 'shatter' | 'burn' | 'tunnel' | 'city';

export interface StageSpec {
    id: StageId;
    name: string;                       // for the ruler, the live region and screen readers
    length: number;                     // wheel units (px of deltaY) that take the stage from 0 to 1
    hold?: { at: number; ms: number; label: string; advance?: boolean };
    creep?: number;                     // progress per second the stage moves on its own once started (the tunnel flies)
    xpOnHold?: number;                  // XP total after its hold completes
    xpOnEnter?: number;                 // XP total on arrival
    final?: boolean;                    // the last stage: its scroll is an opening (clouds), then you browse it
    flash: string;                      // the colour of the cut into this stage
    tone: 'light' | 'dark';             // the scene behind the HUD: light scenes get dark ink
    cut?: 'snapshot';                   // enter by breaking a snapshot of the last frame instead of a colour fade
}

export const STAGES: StageSpec[] = [
    { id: 'believed', name: 'Every learner', length: 2600, hold: { at: 0.95, ms: 1500, label: 'Tap & hold', advance: true }, xpOnHold: 100, flash: '#ffffff', tone: 'light' },
    { id: 'shatter', name: 'Confident, not right', length: 5000, flash: '#b8323a', tone: 'dark' },
    { id: 'burn', name: 'Wasted study', length: 2500, hold: { at: 0.95, ms: 1500, label: 'Tap & hold', advance: true }, xpOnHold: 300, flash: '#8e2a2e', tone: 'dark' },
    { id: 'tunnel', name: 'Five agents', length: 4600, creep: 0.026, flash: '#05060d', tone: 'dark' },
    { id: 'city', name: 'The DSA city', length: 2600, final: true, xpOnEnter: 500, flash: '#ffffff', tone: 'light' },
];

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoothstep = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** How far forward the target may go: up to the hold gate until it is done, then a little past 1 (the hand-over zone). */
export function maxTarget(spec: StageSpec, holdDone: boolean) {
    if (spec.final) return 1;
    if (spec.hold && !holdDone) return spec.hold.at;
    return 1.08;
}

/** How far back: below 0 is the zone that returns to the previous stage; the first stage has nowhere to go back to. */
export const minTarget = (index: number) => (index === 0 ? 0 : -0.08);

/** One frame of a hold gate: fills while held, drains twice as fast when released. */
export function stepHold(v: number, holding: boolean, dtMs: number, ms: number) {
    return clamp01(v + (holding ? dtMs / ms : (-2 * dtMs) / ms));
}

/** Frame-rate independent easing of the shown value towards the target. */
export function follow(value: number, target: number, dt: number, rate = 5) {
    return value + (target - value) * (1 - Math.exp(-dt * rate));
}

/** -1: hand back to the previous stage, 1: on to the next, 0: stay. */
export function edgeOf(index: number, spec: StageSpec, value: number, target: number, holdDone: boolean): -1 | 0 | 1 {
    if (index > 0 && target <= -0.06 && value <= 0.01) return -1;
    if (!spec.final && target >= 1.06 && value >= 0.99 && (!spec.hold || holdDone)) return 1;
    return 0;
}

export const holdVisible = (spec: StageSpec, value: number, holdDone: boolean) =>
    !!spec.hold && !holdDone && value >= spec.hold.at - 0.02;

/** Position on the top ruler, 0..1 across the whole story. */
export const rulerPosition = (index: number, value: number) =>
    Math.min(1, (index + clamp01(value)) / (STAGES.length - 1));

/**
 * Statement lines fade in with blur at `a` and out at `b` (progress). Returns 0..1 visibility, plus whether it is still
 * entering (for the direction of the drift).
 */
export function lineVisibility(p: number, a: number, b: number, ramp = 0.07) {
    const fin = smoothstep((p - a) / ramp);
    const fout = smoothstep((p - (b - ramp)) / ramp);
    return { v: fin * (1 - fout), fin, fout };
}
