import { useEffect } from 'react';

/**
 * App-wide visual layer: the hero's still sky behind every page (so nothing else shows while a page loads or fades in)
 * plus one delegated pointer listener that feeds every glass card's
 * cursor spotlight (--mx / --my). A single listener keeps this cheap no matter how many cards are on screen.
 */
export default function GlobalFX() {
    useEffect(() => {
        let frame = 0;
        const onMove = (e: PointerEvent) => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const card = (e.target as HTMLElement | null)?.closest?.('.campus-card') as HTMLElement | null;
                if (!card) return;
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        return () => {
            window.removeEventListener('pointermove', onMove);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);
    return <div aria-hidden className="aurora-layer world-sky pointer-events-none fixed inset-0 -z-10" />;
}
