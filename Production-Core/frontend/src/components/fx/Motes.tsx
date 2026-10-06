/**
 * Soft light motes that rise slowly through the sky backdrop: the one decorative particle of the landing, the sign-in
 * pages and the app. Each has its own lane, size, speed and start time so they never bunch. Purely decorative.
 */
export default function Motes({ count = 24 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, i) => {
                const size = [5, 8, 12][i % 3], warm = i % 5 === 0;
                const dur = 46 - size * 1.6 + (i % 4) * 4, phase = ((i * 13) % count) / count;
                return <span key={i} className={`mote${warm ? ' mote-warm' : ''}`} style={{
                    left: `${((i + 0.5) / count) * 100}%`, width: `${size}px`, height: `${size}px`,
                    ['--o' as string]: 0.35 + size * 0.03, ['--dx' as string]: `${(i % 2 ? 1 : -1) * (1.5 + (i % 3))}vw`,
                    animationDuration: `${dur}s`, animationDelay: `${-phase * dur}s`,
                }} />;
            })}
        </>
    );
}
