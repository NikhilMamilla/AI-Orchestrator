import { useState } from 'react';
import { CheckCircle2, CircleAlert, CircleDashed, Loader2, PenLine } from 'lucide-react';
import { teachBack, type TeachBackResult } from '../../lib/learning';
import { RagError } from '../../lib/rag';

const MAX = 1500;
const TIER = {
    supported: { icon: CheckCircle2, cls: 'text-campus-success', label: 'Matches the material' },
    weak: { icon: CircleDashed, cls: 'text-campus-amber', label: 'Partly supported' },
    unsupported: { icon: CircleAlert, cls: 'text-campus-rose', label: 'Not in the material' },
} as const;

function Meter({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100);
    return (
        <div>
            <div className="flex justify-between gap-2 text-xs text-campus-warm-400"><span>{label}</span><span>{pct}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-campus-navy/10" role="img" aria-label={`${label} ${pct} percent`}>
                <div className="h-full rounded-full bg-gradient-to-r from-campus-gold to-campus-success transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** Explain a concept in your own words; every sentence is checked against the course material (no LLM involved). */
export default function TeachBack({ concepts }: { concepts: { id: string; title: string }[] }) {
    const [docId, setDocId] = useState('');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [res, setRes] = useState<TeachBackResult | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            setRes(await teachBack(docId, text.trim()));
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not check your explanation right now.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="campus-card mb-8 p-5" aria-labelledby="tb-h">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-campus-sm bg-campus-gold/10 text-campus-gold-dark"><PenLine className="h-5 w-5" aria-hidden /></span>
                <div>
                    <h2 id="tb-h" className="text-lg">Teach it back</h2>
                    <p className="text-sm text-campus-warm-400">Explain a concept as if to a friend. Each sentence is checked against the course material, and the key points you left out are shown. Explaining is one of the strongest ways to learn.</p>
                </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
                <label className="text-sm text-campus-warm-500" htmlFor="tb-concept">Concept</label>
                <select id="tb-concept" value={docId} onChange={(e) => { setDocId(e.target.value); setRes(null); }}
                    className="rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-3 py-2 text-sm text-campus-navy">
                    <option value="">Choose a concept…</option>
                    {concepts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <label className="text-sm text-campus-warm-500" htmlFor="tb-text">Your explanation</label>
                <textarea id="tb-text" value={text} maxLength={MAX} rows={5} onChange={(e) => setText(e.target.value)}
                    placeholder="In my own words: …"
                    className="rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-3 py-2 text-sm text-campus-navy placeholder:text-campus-warm-400" />
                <div className="flex items-center justify-between">
                    <span className="text-xs text-campus-warm-400">{text.length}/{MAX}</span>
                    <button type="button" className="campus-btn-primary px-4 py-2" disabled={busy || !docId || text.trim().length < 20} onClick={() => void submit()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Check my explanation
                    </button>
                </div>
                {error && <p role="alert" className="text-sm text-campus-rose">{error}</p>}
            </div>

            {res && !res.graded && <p role="status" className="mt-4 rounded-campus-sm bg-campus-amber/10 p-3 text-sm text-campus-warm-500">{res.reason}</p>}
            {res && res.graded && (
                <div className="mt-5 space-y-5" role="status" aria-live="polite">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Meter label="Accuracy: sentences the material supports" value={res.accuracy ?? 0} />
                        <Meter label="Coverage: key points you included" value={res.coverage ?? 0} />
                    </div>
                    <p className="text-sm text-campus-navy">
                        <strong>{res.passed ? 'Solid explanation.' : 'Not there yet.'}</strong>{' '}
                        {res.note ? <>{res.note}</> : res.mastery_before !== undefined && res.mastery_after !== undefined && <>Mastery {Math.round(res.mastery_before * 100)}% → {Math.round(res.mastery_after * 100)}%.</>}
                    </p>
                    <ul className="space-y-2">
                        {res.claims.map((c, i) => {
                            const t = TIER[c.status];
                            return (
                                <li key={i} className="flex gap-2 text-sm">
                                    <t.icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.cls}`} aria-hidden />
                                    <span><span className="sr-only">{t.label}: </span>{c.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {res.points.some((p) => !p.covered) && (
                        <div>
                            <h3 className="text-sm font-semibold text-campus-navy">What the material also says</h3>
                            <ul className="mt-2 space-y-2">
                                {res.points.filter((p) => !p.covered).map((p, i) => (
                                    <li key={i} className="rounded-campus-sm border border-campus-gold/30 bg-campus-gold/5 p-3 text-sm text-campus-warm-500">{p.point}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
