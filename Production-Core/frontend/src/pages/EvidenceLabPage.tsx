import { useCallback, useEffect, useState } from 'react';
import { Check, FlaskConical, Loader2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import { RagError } from '../lib/rag';
import {
    studyAnswer, studyJoin, studyReport, studyResult, studyStart, studyStatus,
    type StudyItem, type StudyReport, type StudyResult, type StudyStatus,
} from '../lib/learning';

const pct = (v: number | null | undefined) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);

function Stat({ label, value, tone = '#fffaf0' }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-[16px] border-2 border-[var(--max-line)] p-3" style={{ background: tone, boxShadow: '3px 3px 0 var(--max-line)' }}>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#1b1405]/70">{label}</p>
            <p className="mt-1 font-heading text-xl font-extrabold leading-tight text-[#1b1405]">{value}</p>
        </div>
    );
}

function Test({ phase, onDone }: { phase: 'pre' | 'post'; onDone: () => void }) {
    const [items, setItems] = useState<StudyItem[] | null>(null);
    const [idx, setIdx] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        studyStart(phase)
            .then((r) => { setItems(r.items); setIdx(Math.max(0, r.items.findIndex((i) => !i.answered))); })
            .catch((e) => setError(e instanceof RagError ? e.message : 'Could not build the test right now.'));
    }, [phase]);

    const choose = async (chosen: number) => {
        if (!items) return;
        setBusy(true);
        setError(null);
        try {
            const st = await studyAnswer(phase, items[idx].quiz_id, chosen);
            if (idx + 1 >= items.length) onDone();
            else setIdx(idx + 1);
            void st;
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not record your answer.');
        } finally {
            setBusy(false);
        }
    };

    if (error && !items) return <p role="alert" className="rounded-[16px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>;
    if (!items) return <p role="status" className="flex items-center gap-2 text-sm text-campus-warm-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Building your test. This can take a minute…</p>;
    const q = items[idx];
    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="max-sticker" style={{ background: '#f3dc8f' }}>Question {idx + 1} / {items.length}</span>
                <span role="status" className="text-[11px] text-campus-warm-500">No hints and no feedback during the test.</span>
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full border border-[var(--max-line)]/25 bg-[rgb(var(--c-navy)/0.08)]"><div className="h-full rounded-full bg-[#3fbf8a] transition-all" style={{ width: `${(idx / items.length) * 100}%` }} /></div>
            <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.15rem' }}>{q.question}</h2>
            <div className="mt-4 grid gap-2.5">
                {q.options.map((o, i) => (
                    <button key={i} type="button" disabled={busy} onClick={() => void choose(i)} className="choice !py-3 disabled:opacity-60">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-[11px] font-extrabold">{String.fromCharCode(65 + i)}</span>
                        {o}
                    </button>
                ))}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-campus-rose">{error}</p>}
        </div>
    );
}

export default function EvidenceLabPage() {
    const [st, setSt] = useState<StudyStatus | null>(null);
    const [result, setResult] = useState<StudyResult | null>(null);
    const [report, setReport] = useState<StudyReport | null>(null);
    const [consent, setConsent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const s = await studyStatus();
            setSt(s);
            if (s.step === 'done') setResult(await studyResult());
        } catch {
            setError('Could not load the study. Please refresh in a moment.');
        }
    }, []);
    useEffect(() => { void load(); studyReport().then(setReport).catch(() => setReport(null)); }, [load]);

    const join = async () => {
        try { setSt(await studyJoin()); } catch { setError('Could not join the study.'); }
    };

    const stepIdx = !st ? -1 : st.step === 'join' ? 0 : st.step === 'pre' ? 1 : st.step === 'post' ? 3 : 4;

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: your step on the left, the study and the cohort on the right */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Evidence Lab" subtitle="Does it work?" />

                <header className="shrink-0 px-1">
                    <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Measured, not <span className="max-mark">claimed.</span></h1>
                    <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>An optional pre/post test built into the app: take a short test now, learn as you normally would, then take a parallel test and see your own change.</p>
                </header>

                {error && <p role="alert" className="shrink-0 rounded-[18px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_21rem]">
                    {/* ── your step ── */}
                    <section className="sticker no-scrollbar min-h-[420px] overflow-y-auto p-6 lg:min-h-0" style={{ borderRadius: '28px 12px 28px 12px' }}>
                        {!st && !error && <p role="status" className="flex items-center gap-2 text-sm text-campus-warm-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}

                        {st?.step === 'join' && (
                            <div aria-labelledby="join-h">
                                <h2 id="join-h" className="max-h3 text-campus-navy" style={{ fontSize: '1.35rem' }}>Join the <span className="max-mark">study</span></h2>
                                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                                    {[
                                        ['8 + 8 questions', '8 multiple-choice questions before, and 8 different ones after, on arrays, complexity, binary search and hash tables.'],
                                        ['Anonymous', 'Only your scores are used, shown to the organiser as an aggregate and exported without your name or email.'],
                                        ['Honest about limits', 'There is no control group, so a gain shows learning during use, not proof the tutor caused it.'],
                                        ['No effect on you', 'You can stop at any time. Nothing here affects your mastery or roadmap.'],
                                    ].map(([k, t]) => (
                                        <li key={k} className="j-note"><b className="block text-[13px] text-campus-navy">{k}</b><span className="text-xs leading-relaxed text-campus-warm-500">{t}</span></li>
                                    ))}
                                </ul>
                                <label className="choice mt-5 !items-start !py-3">
                                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#3fbf8a]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                                    <span>I agree that my test scores may be used, anonymously, to evaluate this tutor.</span>
                                </label>
                                <button type="button" className="btn-skeu mt-4 h-10 px-5 text-sm disabled:opacity-50" disabled={!consent} onClick={() => void join()}>
                                    <FlaskConical className="h-4 w-4" aria-hidden /> Join the study
                                </button>
                            </div>
                        )}

                        {st && (st.step === 'pre' || st.step === 'post') && (
                            <div aria-label={st.step === 'pre' ? 'Pre-test' : 'Post-test'}>
                                {st.step === 'post' && <p className="j-note mb-4 text-xs text-campus-warm-500">Your pre-test is recorded (<b className="text-campus-navy">{pct(st.pre_score)}</b>). Learn for a while, then take this parallel test: new questions, same topics.</p>}
                                <Test key={st.step} phase={st.step} onDone={() => void load()} />
                            </div>
                        )}

                        {st?.step === 'done' && result && (
                            <div aria-labelledby="res-h">
                                <h2 id="res-h" className="max-h3 text-campus-navy" style={{ fontSize: '1.35rem' }}>Your <span className="max-mark">result</span></h2>
                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                    <Stat label="Before" value={pct(result.pre)} tone="#ffd2c8" />
                                    <Stat label="After" value={pct(result.post)} tone="#bdeed6" />
                                    <Stat label="Change" value={`${result.gain >= 0 ? '+' : ''}${Math.round(result.gain * 100)} pts`} tone="#f3dc8f" />
                                </div>
                                <p className="mt-4 text-xs leading-relaxed text-campus-warm-500">Each test has {result.items_per_test} questions, so one question is {Math.round(100 / result.items_per_test)} points: a small change is within noise. Thank you for taking part.</p>
                            </div>
                        )}
                    </section>

                    {/* ── the study, and the cohort ── */}
                    <aside className="sticker no-scrollbar flex min-h-0 flex-col gap-5 overflow-y-auto p-5" style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }}>
                        <div>
                            <h2 className="max-h3 mb-3 text-campus-navy" style={{ fontSize: '1.1rem' }}>The <span className="max-mark">study</span></h2>
                            <ol className="space-y-2">
                                {['Join', 'Pre-test', 'Learn as usual', 'Post-test', 'Your result'].map((label, i) => {
                                    const done = stepIdx > i || stepIdx === 4, now = !done && stepIdx === i;
                                    return (
                                        <li key={label} className="flex items-center gap-3">
                                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-[11px] font-extrabold text-[#1b1405] ${done ? 'bg-[#3fbf8a]' : now ? 'bg-[#f3dc8f]' : 'bg-[#fffaf0]'}`}>
                                                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                                            </span>
                                            <span className={`text-[13px] ${now ? 'font-bold text-campus-navy' : 'text-campus-warm-500'}`}>{label}{now ? ' · now' : ''}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        {report ? (
                            <div aria-labelledby="rep-h">
                                <h2 id="rep-h" className="max-h3 mb-3 text-campus-navy" style={{ fontSize: '1.1rem' }}>Cohort <span className="max-mark">report</span></h2>
                                <div className="grid grid-cols-3 gap-2">
                                    <Stat label="Joined" value={String(report.joined)} tone="#ddd6ff" />
                                    <Stat label="Pre done" value={String(report.pre_done)} tone="#f3dc8f" />
                                    <Stat label="Both" value={String(report.completed)} tone="#bdeed6" />
                                </div>
                                {report.result.n > 0 && (
                                    <ul className="mt-3 space-y-1.5 text-[11.5px] text-campus-navy">
                                        <li className="j-row">Mean: <b>{pct(report.result.mean_pre)} → {pct(report.result.mean_post)}</b></li>
                                        <li className="j-row">Mean gain, 95% CI: <b>{Math.round((report.result.mean_gain ?? 0) * 100)} pts{report.result.ci95 ? ` [${Math.round(report.result.ci95[0] * 100)}, ${Math.round(report.result.ci95[1] * 100)}]` : ''}</b></li>
                                        <li className="j-row">Effect size dz, p: <b>{report.result.cohens_dz ?? 'n/a'}, {report.result.p_value ?? 'n/a'}</b></li>
                                    </ul>
                                )}
                                <p className="mt-3 text-xs leading-relaxed text-campus-warm-500">{report.result.verdict}</p>
                                <p className="mt-2 text-[10.5px] text-campus-warm-500">Anonymised scores: <code className="font-mono">GET /api/v1/learning/study/admin/export.csv</code> (admin token).</p>
                            </div>
                        ) : (
                            <p className="j-note mt-auto text-[11px] leading-relaxed text-campus-warm-500">
                                The organiser sees only aggregates: the mean before and after, a bootstrap confidence interval, a paired t-test and the effect size.
                                No effect is claimed below 10 learners who finished both tests.
                            </p>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    );
}
