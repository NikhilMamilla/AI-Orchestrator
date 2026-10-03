import { useEffect, useRef } from 'react';
import { BookMarked } from 'lucide-react';
import type { Citation, Evidence } from '../../lib/rag';

interface Props {
    evidence: Evidence[];
    citations: Citation[];
    activeRef: number | null;
    onSelect: (ref: number) => void;
}

export default function EvidencePanel({ evidence, citations, activeRef, onSelect }: Props) {
    const cited = new Set(citations.map((c) => c.ref));
    const refs = useRef<Record<number, HTMLLIElement | null>>({});

    useEffect(() => {
        if (activeRef != null) refs.current[activeRef]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeRef]);

    if (evidence.length === 0) return null;
    return (
        <section aria-labelledby="evidence-h">
            <h2 id="evidence-h" className="mb-3 flex items-center gap-2 text-base">
                <BookMarked className="h-4 w-4 text-campus-gold-dark" aria-hidden /> Sources
            </h2>
            <ul className="space-y-3">
                {evidence.map((e) => {
                    const active = activeRef === e.ref;
                    return (
                        <li
                            key={e.chunk_id}
                            ref={(el) => {
                                refs.current[e.ref] = el;
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(e.ref)}
                                aria-pressed={active}
                                className={`w-full rounded-campus-sm border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold ${
                                    active ? 'border-campus-gold bg-campus-ivory shadow-campus-gold' : 'border-campus-warm-100 bg-campus-ivory hover:border-campus-warm-200'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded bg-campus-gold-light px-1 font-mono text-[11px] font-semibold text-campus-navy">
                                        {e.ref}
                                    </span>
                                    <span className="font-semibold text-campus-navy">{e.doc_title}</span>
                                    <span className="truncate text-xs text-campus-warm-400">{e.heading_path.split(' > ').slice(1).join(' › ')}</span>
                                    <span className="ml-auto shrink-0 text-xs text-campus-warm-300" title="Relevance score from the reranker">
                                        {cited.has(e.ref) ? 'cited · ' : 'retrieved · '}
                                        {e.score.toFixed(2)}
                                    </span>
                                </div>
                                <p className={`mt-2 whitespace-pre-wrap text-sm text-campus-warm-500 ${active ? '' : 'line-clamp-3'}`}>{e.text}</p>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
