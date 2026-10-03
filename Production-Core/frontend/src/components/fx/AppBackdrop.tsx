/**
 * The app's background, in the landing story's language: the sky of "Every learner" (night sky in the dark theme), its
 * light rays and the same petal fall as the top of the landing page. Fixed behind the page, so sticky navigation keeps working. Purely decorative.
 */
export default function AppBackdrop({ petals = 34 }: { petals?: number }) {
    return (
        <div aria-hidden className="world-sky pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <div className="world-layer sky-rays" />
            <div className="world-layer">
                {Array.from({ length: petals }, (_, i) => {
                    const N = petals, size = [0.7, 1, 1.45][i % 3], tone = ['', ' petal-white', ' petal-deep'][(i * 7) % 3];
                    const dur = (24 - size * 6) + (i % 5) * 1.5, phase = ((i * 13) % N) / N;
                    return <span key={i} className={`petal${tone}`} style={{ left: `${((i + 0.5) / N) * 100}%`, width: `${16 * size}px`, height: `${10 * size}px`, opacity: 0.55 + size * 0.25, animationDelay: `${-phase * dur}s`, animationDuration: `${dur}s`, animationName: i % 2 ? 'petalFall' : 'petalFallAlt' }} />;
                })}
            </div>
        </div>
    );
}
