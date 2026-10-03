import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

const HOLD_MS = 1100;
const R = 46;
const C = 2 * Math.PI * R;

/**
 * "Tap & hold" ending, after the reference: press and hold the ring until it fills, then you are taken in.
 * Releasing early drains it back. Keyboard: hold Enter or Space. A plain link sits under it for anyone who prefers one.
 */
export default function HoldToStart({ onDone, label }: { onDone: () => void; label: string }) {
    const ring = useRef<SVGCircleElement>(null);
    const [done, setDone] = useState(false);
    const state = useRef({ p: 0, holding: false, raf: 0, last: 0 });

    useEffect(() => {
        const s = state.current;
        const step = (now: number) => {
            const dt = (now - s.last) / HOLD_MS;
            s.last = now;
            s.p = Math.max(0, Math.min(1, s.p + (s.holding ? dt : -dt * 2.2)));
            if (ring.current) ring.current.style.strokeDashoffset = `${C * (1 - s.p)}`;
            if (s.p >= 1) { setDone(true); onDone(); return; }
            if (s.holding || s.p > 0) s.raf = requestAnimationFrame(step);
        };
        (s as unknown as { start: () => void }).start = () => { cancelAnimationFrame(s.raf); s.last = performance.now(); s.raf = requestAnimationFrame(step); };
        return () => cancelAnimationFrame(s.raf);
    }, [onDone]);

    const press = (on: boolean) => {
        const s = state.current as typeof state.current & { start: () => void };
        if (done || s.holding === on) return;
        s.holding = on;
        s.start();
    };

    return (
        <div className="flex flex-col items-center gap-3">
            <button type="button" aria-label={`${label}: press and hold`}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }}
                onPointerUp={() => press(false)} onPointerCancel={() => press(false)} onPointerLeave={() => press(false)}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press(true); } }}
                onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') press(false); }}
                onContextMenu={(e) => e.preventDefault()}
                className="group relative grid h-32 w-32 touch-none select-none place-items-center rounded-full">
                <span aria-hidden className="absolute inset-3 rounded-full bg-gradient-to-br from-[#f3dc8f] to-campus-gold shadow-campus-gold transition-transform duration-300 group-active:scale-95" />
                <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                    <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--c-gold) / 0.25)" strokeWidth="2" />
                    <circle ref={ring} cx="50" cy="50" r={R} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C} />
                </svg>
                <span className="relative font-accent text-[11px] font-bold uppercase leading-tight tracking-[0.2em] text-[#1b1405]">Hold<br />to start</span>
            </button>
            <span className="font-accent text-[10px] uppercase tracking-[0.3em] text-campus-warm-400" aria-hidden>Tap &amp; hold</span>
            <button type="button" onClick={onDone} className="inline-flex items-center gap-1 text-sm text-campus-warm-500 underline-offset-4 hover:underline">
                or just click here <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    );
}
