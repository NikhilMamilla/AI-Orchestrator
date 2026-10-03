import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Bug, CheckCircle2, Code2, Lightbulb, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import { useDarkTheme } from '../hooks/useDarkTheme';
import { fetchChallenges, submitChallenge, type Challenge, type ChallengeResult, takeChallengeHint } from '../lib/learning';
import { RagError } from '../lib/rag';

// how a run is graded (README: graded by real execution, Judge0; hints and the solution cost mastery credit)
const GRADING = [
    { k: 'Read the brief', t: 'Each challenge has a sample input and the output it should print.' },
    { k: 'Run it for real', t: 'Your code runs in a sandbox against the sample and hidden tests; nothing is guessed.' },
    { k: 'See what failed', t: 'Each test reports its status, and the sample shows what your program printed.' },
    { k: 'Fix, don’t rewrite', t: 'Debug challenges start from almost-working code: find the bug, keep the rest.' },
    { k: 'Stuck? Take a hint', t: 'A hint points you the right way; like the solution, it costs some mastery credit.' },
    { k: 'Earn mastery', t: 'Passing raises your mastery of the concept; viewing the worked solution lowers the credit.' },
];

export default function ChallengesPage() {
    const [list, setList] = useState<Challenge[] | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [result, setResult] = useState<ChallengeResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const l = await fetchChallenges();
            setList(l);
            return l;
        } catch {
            setError("Couldn't load the challenges.");
            return null;
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    const active = list?.find((c) => c.id === activeId) ?? null;
    const open = (c: Challenge) => {
        setActiveId(c.id);
        setCode(c.starter);
        setResult(null);
        setError(null);
    };

    const run = async () => {
        if (!active || busy) return;
        setBusy(true);
        setError(null);
        try {
            const r = await submitChallenge(active.id, code);
            setResult(r);
            await load();
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not run your code.');
        } finally {
            setBusy(false);
        }
    };

    const takeHint = async () => {
        if (!active) return;
        try {
            const v = await takeChallengeHint(active.id);
            setList((l) => l?.map((c) => (c.id === v.id ? v : c)) ?? l);
            setResult((r) => (r ? { ...r, challenge: v } : r));
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'No hint available right now.');
        }
    };

    const view = result?.challenge ?? active;
    const dark = useDarkTheme();
    const passedCount = (list ?? []).filter((c) => c.passed).length;
    const label = (c: Challenge) => `${c.kind === 'debug' ? 'Fix the bug' : 'Write it'} · ${c.concept.replace(/-/g, ' ')}`;

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the list, the editor, the results; each panel scrolls inside (no scrollbar shown) */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Challenges" subtitle="Practice by doing" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Fix it. <span className="max-mark">Write it.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>Your code runs in a sandbox against hidden tests, and passing counts toward your mastery of the concept.</p>
                    </div>
                    {list && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#bdeed6' }}><b className="font-heading text-xs">{passedCount} / {list.length}</b> passed</span>
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#ffd2c8' }}><b className="font-heading text-xs">{list.filter((c) => c.kind === 'debug').length}</b> to fix</span>
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#f3dc8f' }}><b className="font-heading text-xs">{list.filter((c) => c.kind !== 'debug').length}</b> to write</span>
                        </div>
                    )}
                </header>

                {error && <p role="alert" className="shrink-0 rounded-[18px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[16rem_1fr_19rem]">
                    {/* ── the list ── */}
                    <section aria-label="Challenges" className="sticker flex min-h-[260px] flex-col p-4 lg:min-h-0" style={{ borderRadius: '24px 10px 24px 10px' }}>
                        <h2 className="max-h3 mb-3 shrink-0 px-1 text-campus-navy" style={{ fontSize: '1.05rem' }}>All <span className="max-mark">challenges</span></h2>
                        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
                            {!list && !error && <p className="flex items-center gap-2 px-1 text-sm text-campus-warm-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
                            <ul className="space-y-2">
                                {(list ?? []).map((c) => {
                                    const on = c.id === activeId;
                                    return (
                                        <li key={c.id}>
                                            <button type="button" onClick={() => open(c)} aria-current={on}
                                                className={`chal-item flex w-full items-start gap-2.5 rounded-[16px] p-2.5 text-left ${on ? 'chal-on' : ''}`}>
                                                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] ${c.passed ? 'bg-[#3fbf8a]' : c.kind === 'debug' ? 'bg-[#ffd2c8]' : 'bg-[#f3dc8f]'}`}>
                                                    {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-[#1b1405]" aria-label="Passed" /> : c.kind === 'debug' ? <Bug className="h-3.5 w-3.5 text-[#1b1405]" aria-label="Debug" /> : <Code2 className="h-3.5 w-3.5 text-[#1b1405]" aria-label="Write" />}
                                                </span>
                                                <span className="min-w-0">
                                                    <strong className="block truncate font-heading text-[13px] text-campus-navy">{c.title}</strong>
                                                    <span className="block truncate text-[10.5px] text-campus-warm-500">{label(c)}</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </section>

                    {/* ── the brief and the editor ── */}
                    <section className="flex min-h-[460px] flex-col gap-4 lg:min-h-0" aria-label={active?.title ?? 'Editor'}>
                        {!active ? (
                            <div className="sticker flex flex-1 flex-col items-center justify-center p-8 text-center" style={{ borderRadius: '10px 28px 10px 28px', ['--max' as string]: '#f3dc8f' }}>
                                <span className="clay-icon mb-4 grid h-14 w-14 place-items-center" style={{ background: '#f3dc8f' }}><Code2 className="h-7 w-7 text-[#1b1405]" /></span>
                                <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.4rem' }}>Pick a <span className="max-mark">challenge</span></h2>
                                <p className="max-sub mt-2 max-w-sm" style={{ fontSize: '1rem' }}>Choose one on the left. You get a brief, a sample, and an editor with starter code.</p>
                            </div>
                        ) : (
                            <>
                                <div className="sticker shrink-0 p-4" style={{ borderRadius: '10px 28px 10px 28px', ['--max' as string]: '#f3dc8f' }}>
                                    <div className="flex items-start justify-between gap-3">
                                        <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.15rem' }}>{active.title}</h2>
                                        <span className="max-sticker shrink-0" style={{ background: active.kind === 'debug' ? '#ffd2c8' : '#f3dc8f' }}>{active.kind === 'debug' ? 'Fix the bug' : 'Write it'}</span>
                                    </div>
                                    <p className="mt-1 text-[13px] leading-relaxed text-campus-warm-500">{active.prompt}</p>
                                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                        <div><p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Sample input</p><pre className="chal-pre">{active.sample.input}</pre></div>
                                        <div><p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Expected output</p><pre className="chal-pre">{active.sample.output}</pre></div>
                                    </div>
                                </div>

                                <div className="sticker min-h-[260px] flex-1 overflow-hidden p-1.5 lg:min-h-0" style={{ borderRadius: '22px' }}>
                                    <div className="h-full overflow-hidden rounded-[16px]">
                                        <Editor height="100%" language="python" value={code} onChange={(v) => setCode(v ?? '')} theme={dark ? 'vs-dark' : 'vs-light'}
                                            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, padding: { top: 12 }, automaticLayout: true }} />
                                    </div>
                                </div>

                                <div className="flex shrink-0 flex-wrap items-center gap-3">
                                    <button type="button" onClick={() => void run()} disabled={busy} className="btn-skeu h-10 px-5 text-sm disabled:opacity-60">
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {busy ? 'Running…' : `Run ${active.tests} tests`}
                                    </button>
                                    <button type="button" onClick={() => { setCode(active.starter); setResult(null); }} className="btn-glass max-btn h-10 gap-1.5 px-4 text-xs">
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset code
                                    </button>
                                    <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-campus-warm-500">Python · {active.tests} tests ({active.tests - 1} hidden)</span>
                                </div>
                            </>
                        )}
                    </section>

                    {/* ── results, hint, solution ── */}
                    <aside className="sticker no-scrollbar flex min-h-[260px] flex-col gap-4 overflow-y-auto p-4 lg:min-h-0" style={{ borderRadius: '24px 10px 24px 10px', ['--max' as string]: '#9b8cff' }} aria-live="polite">
                        <h2 className="max-h3 shrink-0 text-campus-navy" style={{ fontSize: '1.05rem' }}>Your <span className="max-mark">results</span></h2>

                        {!result && (
                            <ol className="space-y-3">
                                {GRADING.map((g, i) => (
                                    <li key={g.k} className="flex gap-2.5">
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-[11px] font-extrabold text-[#1b1405]">{i + 1}</span>
                                        <span>
                                            <span className="block font-heading text-[13px] font-bold text-campus-navy">{g.k}</span>
                                            <span className="block text-[11.5px] leading-relaxed text-campus-warm-500">{g.t}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}

                        {result && active && (
                            <div className="space-y-3">
                                <p className={`font-heading text-sm font-bold ${result.passed ? 'text-campus-success' : 'text-campus-rose'}`}>
                                    {result.passed ? 'All tests passed.' : `${result.tests_passed} of ${result.tests_total} tests passed.`}
                                </p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {result.results.map((r, i) => (
                                        <li key={i} className="max-sticker !inline-flex items-center gap-1 whitespace-nowrap" style={{ background: r.ok ? '#bdeed6' : '#ffd2c8' }}>
                                            {r.ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />} {i === 0 ? 'Sample' : `Hidden ${i}`}: {r.status}
                                        </li>
                                    ))}
                                </ul>
                                {result.results[0] && !result.results[0].ok && result.results[0].got !== null && (
                                    <p className="text-xs text-campus-warm-500">On the sample your program printed <code className="font-mono">{result.results[0].got || '(nothing)'}</code>.</p>
                                )}
                                {result.results.find((r) => r.error) && <pre className="chal-pre max-h-40 overflow-auto !text-campus-rose">{result.results.find((r) => r.error)?.error}</pre>}
                                {result.decision && (
                                    <p className="rounded-[16px] border-2 border-dashed border-[var(--max-line)]/20 p-3 text-xs leading-relaxed text-campus-warm-500">
                                        Mastery of {active.concept.replace(/-/g, ' ')}: <b className="text-campus-navy">{Math.round(result.mastery_before * 100)}% → {Math.round(result.mastery_after * 100)}%</b>. {result.decision.reasoning}
                                    </p>
                                )}
                            </div>
                        )}

                        {view && !view.hint && !view.passed && (
                            <div className="rounded-[16px] border-2 border-dashed border-[rgb(var(--c-navy)/0.2)] p-3 text-xs">
                                <p className="mb-1 flex items-center gap-1.5 font-heading text-[13px] font-bold text-campus-navy"><Lightbulb className="h-3.5 w-3.5" aria-hidden /> Stuck?</p>
                                <p className="mb-2 leading-relaxed text-campus-warm-500">A hint points you the right way. Passing after it earns a little less mastery credit. It also opens by itself after 2 failed runs.</p>
                                <button type="button" onClick={() => void takeHint()} className="btn-skeu h-9 gap-1.5 px-4 text-xs"><Lightbulb className="h-3.5 w-3.5" aria-hidden /> Take a hint</button>
                            </div>
                        )}
                        {view?.hint && (
                            <div className="rounded-[16px] border-2 border-[var(--max-line)] bg-[#f3dc8f] p-3 text-xs text-[#1b1405]" role="note">
                                <p className="mb-1 flex items-center gap-1.5 font-heading text-[13px] font-bold"><Lightbulb className="h-3.5 w-3.5" aria-hidden /> Hint</p>
                                <p className="leading-relaxed">{view.hint}</p>
                            </div>
                        )}
                        {view?.solution && (
                            <details className="rounded-[16px] border-2 border-[rgb(var(--c-navy)/0.15)] p-3 text-xs">
                                <summary className="cursor-pointer font-heading text-[13px] font-bold text-campus-navy">Worked solution{view.passed ? '' : ' (lowers the mastery credit for a pass)'}</summary>
                                <pre className="chal-pre mt-2">{view.solution}</pre>
                            </details>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    );
}
