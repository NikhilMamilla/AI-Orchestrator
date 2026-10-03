import { useEffect, useState } from 'react';
import { STAGES } from './flow';
import { useExperience } from './store';

const IDLE_MS = 2000;

/**
 * The "Scroll" pill: shown when the story starts, hidden the moment you scroll, back after 2 s without scrolling.
 * Never while a hold ring asks you to hold instead, nor in the city (it is browsed, not scrolled).
 */
export default function ScrollHint() {
    const active = useExperience((s) => s.active);
    const holding = useExperience((s) => s.hold.visible);
    const final = useExperience((s) => !!STAGES[s.stage]?.final);
    const [idle, setIdle] = useState(true);

    useEffect(() => {
        let t = 0;
        const moved = () => {
            setIdle(false);
            window.clearTimeout(t);
            t = window.setTimeout(() => setIdle(true), IDLE_MS);
        };
        const onKey = (e: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar'].includes(e.key)) moved(); };
        window.addEventListener('wheel', moved, { passive: true });
        window.addEventListener('touchmove', moved, { passive: true });
        window.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener('wheel', moved);
            window.removeEventListener('touchmove', moved);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    const show = active && idle && !holding && !final;
    return (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[calc(4svh+4.75rem)] z-[3] flex justify-center transition-all duration-500 ease-out"
            style={{ opacity: show ? 1 : 0, transform: `translateY(${show ? 0 : 8}px)` }}>
            <span className="flex items-center gap-3 rounded-full border border-white/60 bg-white/45 px-6 py-2.5 font-mono text-sm font-semibold uppercase tracking-[0.18em] text-[#1f5a60] shadow-[0_4px_14px_-6px_rgb(23_63_77/0.35)] backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#1f5a60]" />Scroll
            </span>
        </div>
    );
}
