import { useEffect, useRef } from 'react';
import { Engine } from './engine';
import Hud from './Hud';
import Overlays from './Overlays';
import ScrollHint from './ScrollHint';
import { prefersReducedMotion } from '../lib/introFlag';
import { STAGES } from './flow';
import { useExperience } from './store';

/**
 * The landing story: one canvas, five stages, the HUD on top. It mounts behind the opening (count and "Draw a zero")
 * while that plays, stays invisible, and takes over at the white flash. Loaded as its own chunk; nothing else in the
 * app loads three.js for it.
 */
export default function Experience({ onExit, onStart, startLabel, authenticated }: {
    onExit: () => void; onStart: () => void; startLabel: string; authenticated: boolean;
}) {
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const fade = useRef<HTMLDivElement>(null);
    const engine = useRef<Engine | null>(null);
    const tone = useExperience((s) => STAGES[s.stage].tone);       // light scenes get dark HUD ink
    const exit = useRef(onExit);
    exit.current = onExit;

    useEffect(() => {
        let e: Engine;
        try {
            e = new Engine({ canvas: canvas.current!, root: root.current!, fade: fade.current!, reduced: prefersReducedMotion(), onExit: () => exit.current() });
        } catch (err) {
            console.warn('[experience] WebGL unavailable, showing the page instead', err);
            exit.current();
            return;
        }
        engine.current = e;
        document.documentElement.dataset.story = 'on';                     // the page under the story is not drawn
        if (new URLSearchParams(window.location.search).has('expqa')) (window as unknown as { __exp: Engine }).__exp = e;   // QA: frame-exact review
        void e.start().catch((err) => { console.error('[experience] could not start', err); exit.current(); });
        return () => { e.dispose(); engine.current = null; delete document.documentElement.dataset.story; };
    }, []);

    return (
        <div ref={root} data-tone={tone} className="exp fixed inset-0 z-[60] select-none overflow-hidden bg-[#070a19] text-[#f5f3ea]" style={{ touchAction: 'none' }}>
            <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
            <Overlays />
            <ScrollHint />
            <div ref={fade} aria-hidden className="pointer-events-none absolute inset-0 z-[4] opacity-0 transition-opacity duration-[450ms] ease-in-out" />
            <Hud engine={engine} onExit={onExit} onStart={onStart} startLabel={startLabel} authenticated={authenticated} />
        </div>
    );
}
