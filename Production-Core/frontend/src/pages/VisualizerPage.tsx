import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquareText, Pause, Play, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import { ALGOS, record, type AlgoId } from '../lib/algoSteps';

const MAX_ITEMS = 16;

function randomArray(n = 10): number[] {
    return Array.from({ length: n }, () => 5 + Math.floor(Math.random() * 90));
}

function parseInput(text: string): number[] | null {
    const nums = text.split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.length < 2 || nums.length > MAX_ITEMS || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 999)) return null;
    return nums.map(Math.round);
}

export default function VisualizerPage() {
    const [algoId, setAlgoId] = useState<AlgoId>('binary');
    const [text, setText] = useState('3, 9, 14, 21, 27, 35, 42, 58, 63, 77');
    const [target, setTarget] = useState(42);
    const [stepIdx, setStepIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(600);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const algo = ALGOS.find((a) => a.id === algoId)!;
    const input = useMemo(() => parseInput(text), [text]);
    const steps = useMemo(() => (input ? record(algoId, input, target) : []), [algoId, input, target]);
    const step = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))];
    const maxVal = useMemo(() => Math.max(1, ...(step?.array ?? [1])), [step]);

    useEffect(() => {
        setStepIdx(0);
        setPlaying(false);
    }, [algoId, text, target]);

    useEffect(() => {
        if (timer.current) clearInterval(timer.current);
        if (!playing) return;
        timer.current = setInterval(() => {
            setStepIdx((i) => {
                if (i >= steps.length - 1) {
                    setPlaying(false);
                    return i;
                }
                return i + 1;
            });
        }, speed);
        return () => {
            if (timer.current) clearInterval(timer.current);
        };
    }, [playing, speed, steps.length]);

    // bar colours: the app's sticker palette, each with an ink outline
    const tone = (i: number): { bg: string; dim?: boolean } => {
        if (!step) return { bg: '#ddd6ff' };
        if (step.found === i) return { bg: '#3fbf8a' };
        if (step.swap.includes(i)) return { bg: '#ff8a73' };
        if (step.compare.includes(i)) return { bg: '#f3dc8f' };
        if (step.sorted.includes(i)) return { bg: '#bdeed6' };
        if (algo.kind === 'search' && step.low !== undefined && step.high !== undefined && (i < step.low || i > step.high)) return { bg: '#e9e3d3', dim: true };
        return { bg: '#ddd6ff' };
    };
    const back = () => { setPlaying(false); setStepIdx((i) => Math.max(0, i - 1)); };
    const fwd = () => { setPlaying(false); setStepIdx((i) => Math.min(steps.length - 1, i + 1)); };
    const toggle = () => { if (stepIdx >= steps.length - 1) setStepIdx(0); setPlaying((p) => !p); };

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the stage on the left, the numbers that describe it on the right */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Visualize" subtitle="See it run" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 xl:flex-row xl:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Watch it <span className="max-mark">run.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>Every step is recorded from a real run of the algorithm on your input, so the counts are exact.</p>
                    </div>
                    <div role="tablist" aria-label="Algorithm" className="flex max-w-full shrink-0 flex-wrap gap-1 rounded-[22px] border-2 border-[var(--max-line)]/15 bg-[rgb(var(--c-warm-50))] p-1">
                        {ALGOS.map((a) => (
                            <button key={a.id} role="tab" aria-selected={a.id === algoId} type="button" onClick={() => setAlgoId(a.id)}
                                className={`relative shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${a.id === algoId ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                {a.id === algoId && <motion.span layoutId="viz-algo" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                <span className="relative">{a.name}</span>
                            </button>
                        ))}
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_19rem]">
                    {/* ── the stage ── */}
                    <section className="sticker flex min-h-[460px] flex-col p-5 lg:min-h-0" aria-label={`${algo.name} visualization`} style={{ borderRadius: '28px 12px 28px 12px' }}>
                        <div className="flex shrink-0 flex-wrap items-end gap-3">
                            <label className="min-w-[13rem] flex-1">
                                <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Numbers · 2 to {MAX_ITEMS}, 0 to 999</span>
                                <input value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!input} className="share-input w-full font-mono" />
                            </label>
                            {algo.kind === 'search' && (
                                <label className="w-24">
                                    <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Target</span>
                                    <input type="number" min={0} max={999} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="share-input w-full font-mono" />
                                </label>
                            )}
                            <button type="button" onClick={() => setText(randomArray().join(', '))} className="btn-glass max-btn h-10 gap-1.5 px-4 text-xs">
                                <Shuffle className="h-3.5 w-3.5" aria-hidden /> Random
                            </button>
                        </div>
                        {!input && <p role="alert" className="mt-2 shrink-0 text-xs text-campus-rose">Enter between 2 and {MAX_ITEMS} whole numbers from 0 to 999, separated by commas.</p>}

                        {step && (
                            <>
                                {/* the bars fill whatever height is left */}
                                <div className="viz-floor mt-4 flex min-h-[180px] flex-1 items-stretch gap-1.5 rounded-[20px] px-3 pb-2 pt-3 sm:gap-2" aria-hidden>
                                    {step.array.map((v, i) => {
                                        const t = tone(i);
                                        return (
                                            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                                <span className="font-mono text-[10px] font-semibold text-campus-navy">{v}</span>
                                                <div className="relative w-full flex-1">
                                                    <div className={`absolute inset-x-0 bottom-0 rounded-t-[10px] border-2 border-[var(--max-line)] transition-all duration-300 ${t.dim ? 'opacity-35' : ''}`}
                                                        style={{ height: `${Math.max(4, (v / maxVal) * 100)}%`, background: t.bg, boxShadow: t.dim ? 'none' : '3px 0 0 var(--max-line)' }} />
                                                </div>
                                                <span className={`font-mono text-[9px] font-bold ${step.mid === i || step.low === i || step.high === i ? 'text-campus-navy' : 'text-campus-warm-400'}`}>
                                                    {step.mid === i ? 'mid' : step.low === i && step.low !== step.mid ? 'lo' : step.high === i && step.high !== step.mid ? 'hi' : i}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <p className="mt-3 min-h-[2.4rem] shrink-0 rounded-[14px] border-2 border-dashed border-[var(--max-line)]/15 px-3 py-2 text-[13px] text-campus-navy" aria-live="polite">{step.note}</p>

                                <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2.5">
                                    <button type="button" aria-label="Previous step" onClick={back} className="btn-glass max-btn h-9 w-9 !p-0"><SkipBack className="h-3.5 w-3.5" aria-hidden /></button>
                                    <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} className="btn-skeu h-10 gap-1.5 px-5 text-sm">
                                        {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {playing ? 'Pause' : 'Play'}
                                    </button>
                                    <button type="button" aria-label="Next step" onClick={fwd} className="btn-glass max-btn h-9 w-9 !p-0"><SkipForward className="h-3.5 w-3.5" aria-hidden /></button>
                                    <input type="range" min={0} max={steps.length - 1} value={stepIdx} aria-label="Step" onChange={(e) => { setPlaying(false); setStepIdx(Number(e.target.value)); }} className="viz-range min-w-[8rem] flex-1" />
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-campus-warm-500">step {stepIdx + 1}/{steps.length}</span>
                                    <label className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-campus-warm-500">Speed
                                        <input type="range" min={150} max={1200} step={50} value={1350 - speed} aria-label="Speed" onChange={(e) => setSpeed(1350 - Number(e.target.value))} className="viz-range w-20" />
                                    </label>
                                </div>
                            </>
                        )}
                    </section>

                    {/* ── what the run measured, the key, and the algorithm in a sentence ── */}
                    <aside className="sticker no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto p-5" style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }}>
                        <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.15rem' }}>{algo.name}</h2>
                        {step && (
                            <dl className="grid grid-cols-2 gap-2.5">
                                <Stat label="Comparisons" value={String(step.comparisons)} tone="#f3dc8f" />
                                <Stat label={algo.kind === 'sort' ? 'Swaps / writes' : 'Elements'} value={String(algo.kind === 'sort' ? step.swaps : step.array.length)} tone="#ffd2c8" />
                                <Stat label="Best · average" value={`${algo.best} · ${algo.average}`} tone="#bdeed6" small />
                                <Stat label="Worst · space" value={`${algo.worst} · ${algo.space}`} tone="#ddd6ff" small />
                            </dl>
                        )}
                        <div>
                            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Key</p>
                            <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-campus-navy">
                                {[['#f3dc8f', 'Comparing'], ['#ff8a73', 'Swap / write'], ['#bdeed6', 'In final place'], ['#3fbf8a', 'Found'], ['#ddd6ff', 'Waiting'], ['#e9e3d3', 'Ruled out']].map(([c, l]) => (
                                    <li key={l} className="flex items-center gap-2"><i className="inline-block h-3 w-3 shrink-0 rounded-[4px] border-2 border-[var(--max-line)]" style={{ background: c }} />{l}</li>
                                ))}
                            </ul>
                        </div>
                        <p className="text-xs leading-relaxed text-campus-warm-500">{algo.blurb}</p>
                        <Link to="/ask" state={{ query: algo.askAbout }} className="btn-glass max-btn mt-auto h-auto min-h-10 gap-2 px-4 py-2.5 text-left text-xs">
                            <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden /> <span>Ask the tutor: {algo.askAbout}</span>
                        </Link>
                    </aside>
                </div>
            </main>
        </div>
    );
}

function Stat({ label, value, tone, small = false }: { label: string; value: string; tone: string; small?: boolean }) {
    return (
        <div className="rounded-[14px] border-2 border-[var(--max-line)] p-2.5" style={{ background: tone, boxShadow: '3px 3px 0 var(--max-line)' }}>
            <dd className={`font-heading font-extrabold leading-tight text-[#1b1405] ${small ? 'text-[13px]' : 'text-xl'}`}>{value}</dd>
            <dt className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#1b1405]/70">{label}</dt>
        </div>
    );
}
