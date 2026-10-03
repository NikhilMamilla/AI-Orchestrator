import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkLooseStrong from '../../lib/remarkLooseStrong';
import { AlertTriangle, ShieldCheck, ShieldQuestion, Square, Volume2 } from 'lucide-react';
import { canSpeak, speak, stopSpeaking } from '../../lib/speech';
import type { RagAnswer } from '../../lib/rag';

interface Props {
    answer: RagAnswer;
    activeRef: number | null;
    onCite: (ref: number) => void;
}

const bandOf = (c: number) =>
    c >= 0.7 ? { label: 'High confidence', cls: 'text-campus-success bg-campus-success-light' }
        : c >= 0.4 ? { label: 'Moderate confidence', cls: 'text-campus-amber bg-campus-amber-light' }
            : { label: 'Low confidence', cls: 'text-campus-rose bg-campus-rose-light' };

export default function AnswerCard({ answer, activeRef, onCite }: Props) {
    // [1] -> markdown link so citations render as interactive chips
    const md = useMemo(() => answer.text.replace(/\[(\d+)\]/g, '[$1](#cite-$1)'), [answer.text]);
    const band = bandOf(answer.confidence);
    const [speaking, setSpeaking] = useState(false);
    useEffect(() => () => stopSpeaking(), [answer.text]);

    if (answer.status !== 'grounded') {
        const rejected = answer.status === 'rejected';
        return (
            <section className="campus-card p-6" aria-live="polite">
                <div className="flex items-start gap-3">
                    <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-campus-amber" aria-hidden />
                    <div>
                        <h2 className="text-lg">{rejected ? "I can't help with that one" : 'Not enough evidence'}</h2>
                        <p className="mt-1 text-campus-warm-500">{answer.text}</p>
                        {!rejected && answer.evidence.length > 0 && (
                            <p className="mt-3 text-sm text-campus-warm-400">
                                Closest material found is listed below, but it doesn't answer your question well enough to rely on.
                            </p>
                        )}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="campus-card p-6" aria-live="polite">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${band.cls}`}>
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    {band.label} · {Math.round(answer.confidence * 100)}%
                </span>
                {answer.trace.mode === 'extractive' && (
                    <span className="rounded-full bg-campus-warm-100 px-3 py-1 text-xs text-campus-warm-500" title="The language model was unavailable, so this answer is quoted directly from the sources.">
                        Quoted from sources
                    </span>
                )}
                {canSpeak && (
                    <button type="button" onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else { setSpeaking(true); speak(answer.text, () => setSpeaking(false)); } }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-campus-warm-100 px-3 py-1 text-xs font-semibold text-campus-navy hover:bg-campus-warm-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold"
                        aria-pressed={speaking}>
                        {speaking ? <Square className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
                        {speaking ? 'Stop' : 'Listen'}
                    </button>
                )}
                {answer.trace.cache_hit && <span className="rounded-full bg-campus-warm-100 px-3 py-1 text-xs text-campus-warm-500">Cached</span>}
            </div>

            <div className="prose prose-campus max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkLooseStrong]}
                    components={{
                        a: ({ href, children }) => {
                            const m = /^#cite-(\d+)$/.exec(href ?? '');
                            if (!m) return <span>{children}</span>;          // never render model-supplied links
                            const n = Number(m[1]);
                            const known = answer.evidence.some((e) => e.ref === n);
                            return (
                                <button
                                    type="button"
                                    onClick={() => known && onCite(n)}
                                    disabled={!known}
                                    aria-label={`Source ${n}`}
                                    className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-baseline font-mono text-[11px] font-semibold no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold ${
                                        activeRef === n ? 'bg-campus-primary text-white' : 'bg-campus-gold-light text-campus-navy hover:bg-campus-gold'
                                    } ${known ? '' : 'cursor-not-allowed opacity-40'}`}
                                >
                                    {children}
                                </button>
                            );
                        },
                    }}
                >
                    {md}
                </ReactMarkdown>
            </div>

            {answer.unsupported_claims.length > 0 && (
                <div className="mt-4 rounded-campus-sm border border-campus-amber/30 bg-campus-amber-light p-3 text-sm" role="note">
                    <p className="flex items-center gap-2 font-semibold text-campus-amber">
                        <AlertTriangle className="h-4 w-4" aria-hidden /> Couldn't verify {answer.unsupported_claims.length === 1 ? 'a statement' : `${answer.unsupported_claims.length} statements`}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-campus-warm-500">
                        {answer.unsupported_claims.map((c) => (
                            <li key={c}>{c}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
