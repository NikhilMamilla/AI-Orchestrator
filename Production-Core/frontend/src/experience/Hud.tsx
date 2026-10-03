import { GraduationCap, Menu } from 'lucide-react';
import { useExperience } from './store';
import type { Engine } from './engine';

/**
 * The chrome that stays on screen through the whole story: the hold ring and a glass dock with the main call to action.
 * No top bar (no ruler, XP, sound or skip button); Escape still leaves the story. Everything interactive is marked
 * data-hud so the engine leaves its pointer and wheel input alone.
 */

const RING_R = 52, RING_C = 2 * Math.PI * RING_R;

function HoldRing() {
    const hold = useExperience((s) => s.hold);
    // everything below is driven by --exp-hold (0..1), which the engine writes every frame: no React renders while held
    return (
        <div aria-hidden={!hold.visible} className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity duration-500 ${hold.visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            {/* not data-hud: pressing anywhere, including here, is the hold the engine listens for */}
            <div className="exp-hold relative grid h-44 w-44 cursor-pointer touch-none select-none place-items-center">
                {/* idle ripples: they invite the press and fade away as soon as it starts */}
                <span className="exp-hold-ripple" />
                <span className="exp-hold-ripple [animation-delay:1.1s]" />
                {/* the light that gathers while it is held */}
                <span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgb(243 220 143 / 0.55), transparent 62%)', opacity: 'var(--exp-hold, 0)', transform: 'scale(calc(0.8 + var(--exp-hold, 0) * 0.5))' }} />
                {/* the glass disc */}
                <span className="absolute inset-5 rounded-full border border-white/35 bg-[radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.35),rgb(15_47_56/0.55)_70%)] shadow-[0_18px_40px_-12px_rgb(6_24_30/0.7),inset_0_1px_0_rgb(255_255_255/0.45)]"
                    style={{ transform: 'scale(calc(1 - var(--exp-hold, 0) * 0.06))' }} />
                {/* the progress: a thin track and a gold arc with a bright head */}
                <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90 overflow-visible">
                    <defs>
                        <linearGradient id="exp-hold-gold" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#fff4cf" /><stop offset="0.5" stopColor="#f3dc8f" /><stop offset="1" stopColor="#c9a64a" />
                        </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r={RING_R} fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth="1.2" />
                    <circle cx="60" cy="60" r={RING_R} fill="none" stroke="url(#exp-hold-gold)" strokeWidth="3.4" strokeLinecap="round"
                        style={{ strokeDasharray: RING_C, strokeDashoffset: `calc(${RING_C}px * (1 - var(--exp-hold, 0)))`, filter: 'drop-shadow(0 0 4px rgb(243 220 143 / 0.9))' }} />
                </svg>
                <span className="absolute inset-0" style={{ transform: 'rotate(calc(var(--exp-hold, 0) * 360deg))', opacity: 'min(1, calc(var(--exp-hold, 0) * 20))' }}>
                    <span className="absolute left-1/2 top-[6.7%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_3px_#f3dc8f]" />
                </span>
                {/* the core: a pearl that swells with the hold, and the word inside it */}
                <span className="relative grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-[radial-gradient(circle_at_38%_32%,#ffffff,#f4f1e6_55%,#d8d2bd)] shadow-[0_0_28px_rgb(255_255_255/0.75),0_6px_16px_-6px_rgb(0_0_0/0.4)]"
                    style={{ transform: 'scale(calc(1 + var(--exp-hold, 0) * 0.22))' }}>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#173f4d] [margin-right:-0.3em]">Hold</span>
                </span>
            </div>
            {/* the label on its own dark chip, readable over any scene */}
            <p className="mt-2 flex items-center gap-2.5 whitespace-nowrap rounded-full bg-[#0d2a33]/70 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-white shadow-lg max-sm:px-5 max-sm:py-2 max-sm:text-[11px]">
                {hold.label}<span className="h-1 w-1 rounded-full bg-[#f3dc8f] max-sm:hidden" /><span className="text-white/60 max-sm:hidden">or hold space</span>
            </p>
        </div>
    );
}

/** The dock: every button leaves the story for the landing page (the logo, the main button and the menu alike). */
function Dock({ startLabel, onDetails }: { startLabel: string; onDetails: () => void }) {
    return (
        <div data-hud className="pointer-events-auto absolute bottom-[4svh] left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1.5 rounded-full border border-[rgb(var(--hud)/0.15)] bg-[rgb(var(--hud)/0.14)] p-1.5 shadow-[0_10px_34px_-10px_rgb(0_0_0/0.6)]">
                <button type="button" onClick={onDetails} aria-label="Go to the landing page" className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#f3dc8f] to-[#c9a64a] text-[#1b1405] transition hover:brightness-105">
                    <GraduationCap className="h-5 w-5" />
                </button>
                <button type="button" onClick={onDetails} className="h-11 w-[min(44vw,17rem)] rounded-full bg-gradient-to-b from-[#f3dc8f] to-[#d9b657] font-body text-sm font-bold text-[#1b1405] transition hover:brightness-105">{startLabel}</button>
                <button type="button" onClick={onDetails} aria-label="Go to the landing page"
                    className="grid h-11 w-11 place-items-center rounded-full bg-[rgb(var(--hud)/0.15)] text-[rgb(var(--hud))] transition hover:bg-[rgb(var(--hud)/0.25)]">
                    <Menu className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}

export default function Hud({ engine, onExit, startLabel }: {
    engine: React.RefObject<Engine | null>; onExit: () => void; onStart: () => void; startLabel: string; authenticated: boolean;
}) {
    const announce = useExperience((s) => s.announce);
    void engine;
    return (
        <div className="pointer-events-none absolute inset-0 z-[5]">
            <HoldRing />
            <Dock startLabel={startLabel} onDetails={onExit} />
            <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        </div>
    );
}
