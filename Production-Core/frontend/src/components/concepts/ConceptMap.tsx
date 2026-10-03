import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BAND_FILL, related, type MapConcept, type MapLink } from './mapData';

const R = 24;

/**
 * The prerequisite graph, drawn as stickers: each concept a circle filled with its mastery band and outlined in ink, a
 * ring showing progress on the ones in progress, locked ones dashed. Hovering or selecting a concept lights up its whole
 * chain (what it needs, what it unlocks) and dims the rest. The view is fitted to the graph, so there is no empty margin.
 */
export default function ConceptMap({ concepts, links, focus, selected, dimmed, onHover, onSelect }: {
    concepts: MapConcept[]; links: MapLink[]; focus: string | null; selected: string | null;
    dimmed: (c: MapConcept) => boolean; onHover: (id: string | null) => void; onSelect: (id: string) => void;
}) {
    const byId = useMemo(() => Object.fromEntries(concepts.map((c) => [c.id, c])), [concepts]);
    const box = useMemo(() => {
        if (!concepts.length) return '0 0 100 100';
        const xs = concepts.map((c) => c.x), ys = concepts.map((c) => c.y);
        const x0 = Math.min(...xs) - 90, y0 = Math.min(...ys) - 50, x1 = Math.max(...xs) + 90, y1 = Math.max(...ys) + 60;
        return `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
    }, [concepts]);
    const chain = useMemo(() => (focus ? related(links, focus) : null), [links, focus]);
    const inChain = (id: string) => !chain || id === focus || chain.up.has(id) || chain.down.has(id);

    return (
        <svg viewBox={box} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label="Prerequisite graph of the curriculum">
            <defs>
                <marker id="cm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill="var(--max-line)" />
                </marker>
            </defs>

            {links.map((l, i) => {
                const a = byId[l.source], b = byId[l.target];
                if (!a || !b) return null;
                const on = chain ? (inChain(l.source) && inChain(l.target)) : true;
                const x1 = a.x + R, x2 = b.x - R - 4, dx = Math.max(40, (x2 - x1) / 2);
                const done = a.status === 'mastered';
                return (
                    <motion.path key={`${l.source}-${l.target}`} d={`M ${x1} ${a.y} C ${x1 + dx} ${a.y}, ${x2 - dx} ${b.y}, ${x2} ${b.y}`}
                        fill="none" stroke="var(--max-line)" strokeWidth={chain && on ? 2.4 : 1.6} strokeLinecap="round"
                        strokeDasharray={done ? undefined : '6 6'} markerEnd="url(#cm-arrow)"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1, opacity: chain ? (on ? 0.9 : 0.08) : 0.35 }}
                        transition={{ pathLength: { duration: 0.9, delay: i * 0.01 }, opacity: { duration: 0.25 } }} />
                );
            })}

            {concepts.map((c, i) => {
                const fill = BAND_FILL[c.band ?? 'untouched'] ?? BAND_FILL.untouched;
                const off = (chain && !inChain(c.id)) || dimmed(c);
                const isSel = selected === c.id, isFocus = focus === c.id;
                const label = c.title.length > 22 ? `${c.title.slice(0, 20)}…` : c.title;
                return (
                    <motion.g key={c.id} tabIndex={0} role="button" aria-label={`${c.title}: ${Math.round(c.mastery_level * 100)}% mastery, ${c.status}`}
                        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: off ? 0.18 : 1, scale: 1 }}
                        transition={{ opacity: { duration: 0.25 }, scale: { type: 'spring', damping: 18, delay: i * 0.015 } }}
                        style={{ transformOrigin: `${c.x}px ${c.y}px`, cursor: 'pointer', outline: 'none' }}
                        onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(c.id)} onBlur={() => onHover(null)}
                        onClick={() => onSelect(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); } }}>
                        {(isSel || isFocus) && <circle cx={c.x} cy={c.y} r={R + 9} fill="none" stroke="var(--max)" strokeWidth={5} opacity={0.9} />}
                        {/* the sticker: hard shadow, band fill, ink outline (dashed when locked) */}
                        <circle cx={c.x + 3} cy={c.y + 3} r={R} fill="var(--max-line)" opacity={c.status === 'locked' ? 0 : 1} />
                        <circle cx={c.x} cy={c.y} r={R} fill={c.status === 'locked' ? 'rgb(var(--c-warm-100))' : fill} stroke="var(--max-line)" strokeWidth={2.5}
                            strokeDasharray={c.status === 'locked' ? '4 4' : undefined} />
                        {c.status === 'learning' && c.mastery_level > 0 && (
                            <circle cx={c.x} cy={c.y} r={R - 6} fill="none" stroke="var(--max-line)" strokeWidth={3} strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * (R - 6) * c.mastery_level} ${2 * Math.PI * (R - 6)}`} transform={`rotate(-90 ${c.x} ${c.y})`} />
                        )}
                        <text x={c.x} y={c.y + 4} textAnchor="middle" className="pointer-events-none select-none" style={{ font: '800 11px Fraunces, Georgia, serif', fill: '#1b1405' }}>
                            {c.status === 'locked' ? '·' : `${Math.round(c.mastery_level * 100)}`}
                        </text>
                        <text x={c.x} y={c.y + R + 17} textAnchor="middle" className="pointer-events-none select-none"
                            style={{ font: `${isSel ? 800 : 700} 11.5px "Plus Jakarta Sans", system-ui, sans-serif`, fill: 'rgb(var(--c-navy))' }}>
                            {label}
                        </text>
                    </motion.g>
                );
            })}
        </svg>
    );
}
