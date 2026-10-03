import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Loader2, MessageSquareText, Route as RouteIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import QuizCard from '../components/learn/QuizCard';
import GoalCard from '../components/learn/GoalCard';
import PlacementCheck from '../components/learn/PlacementCheck';
import TeachBack from '../components/learn/TeachBack';
import SketchPad from '../components/learn/SketchPad';
import SessionPlan from '../components/learn/SessionPlan';
import AnalystCard from '../components/learn/AnalystCard';
import { fetchInsights, fetchPath, fetchPlan, fetchReview, type Insights, type PathStep, type ReviewItem, type SessionPlan as Plan } from '../lib/learning';
import type { Level } from '../lib/rag';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
type Tab = 'practice' | 'review' | 'plan' | 'goal' | 'placement' | 'teach' | 'draw' | 'analyst';

function MasteryBar({ value }: { value: number }) {
    return (
        <div className="mt-1.5 h-2 w-full max-w-[14rem] overflow-hidden rounded-full border border-[var(--max-line)]/25 bg-campus-warm-100" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Mastery">
            <div className={`h-full rounded-full ${value >= 0.8 ? 'bg-[#3fbf8a]' : 'bg-[#f3dc8f]'}`} style={{ width: `${Math.max(3, value * 100)}%` }} />
        </div>
    );
}

export default function LearnPage() {
    const [steps, setSteps] = useState<PathStep[] | null>(null);
    const [minutes, setMinutes] = useState(0);
    const [review, setReview] = useState<ReviewItem[] | null>(null);
    const [plan, setPlan] = useState<Plan | null>(null);
    const [insights, setInsights] = useState<Insights | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [active, setActive] = useState<{ id: string; title: string; level: number } | null>(null);
    const [tab, setTab] = useState<Tab>('review');

    const load = useCallback(async () => {
        try {
            const [p, r] = await Promise.all([fetchPath(), fetchReview()]);
            fetchPlan().then(setPlan).catch(() => setPlan(null));
            fetchInsights().then(setInsights).catch(() => setInsights(null));
            setSteps(p.steps);
            setMinutes(p.minutes_estimate);
            setReview(r);
            setError(null);
        } catch {
            setError("Couldn't load your learning plan. Please refresh in a moment.");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const practice = (id: string, title: string, level: number) => {
        setActive({ id, title, level });
        setTab('practice');
    };

    const due = (review ?? []).filter((r) => r.overdue);
    const unlocked = (steps ?? []).filter((s) => s.why.startsWith('Unlocked'));
    const titles = Object.fromEntries((steps ?? []).map((s) => [s.id, s.title]));
    const TABS: { id: Tab; label: string; badge?: number; show: boolean }[] = [
        { id: 'practice', label: 'Practice', show: active !== null },
        { id: 'review', label: 'Review', badge: due.length || undefined, show: true },
        { id: 'plan', label: 'Session plan', show: true },
        { id: 'goal', label: 'Goal', show: true },
        { id: 'placement', label: 'Placement', show: true },
        { id: 'teach', label: 'Teach it back', show: true },
        { id: 'draw', label: 'Draw it', show: true },
        { id: 'analyst', label: 'Analyst', show: true },
    ];

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the roadmap on the left, one tool at a time on the right (each panel scrolls inside, no scrollbar) */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Learn" subtitle="Your plan" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Your <span className="max-mark">roadmap.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>It follows the real prerequisite graph. Answer questions to build mastery; Kiddoo schedules what to review and when.</p>
                    </div>
                    {steps && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                            {[
                                { v: steps.length, l: 'left', c: '#ffd2c8' },
                                { v: `${Math.round(minutes / 60)} h`, l: 'to go', c: '#f3dc8f' },
                                { v: unlocked.length, l: 'unlocked', c: '#bdeed6' },
                                { v: due.length, l: 'due now', c: '#ddd6ff' },
                            ].map((x) => (
                                <span key={x.l} className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: x.c }}><b className="font-heading text-xs not-italic">{x.v}</b> {x.l}</span>
                            ))}
                        </div>
                    )}
                </header>

                {error && <p role="alert" className="shrink-0 rounded-[18px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_1.15fr]">
                    {/* ── the roadmap ── */}
                    <section aria-labelledby="rm-h" className="sticker flex min-h-[420px] flex-col p-5 lg:min-h-0" style={{ borderRadius: '28px 12px 28px 12px' }}>
                        <h2 id="rm-h" className="max-h3 mb-3 flex shrink-0 items-center gap-2 text-campus-navy" style={{ fontSize: '1.2rem' }}>
                            <RouteIcon className="h-4 w-4" aria-hidden /> Next <span className="max-mark">concepts</span>
                        </h2>
                        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2 pr-2">
                            {!steps && !error && (
                                <p className="flex items-center gap-2 text-sm text-campus-warm-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your plan…</p>
                            )}
                            {steps && steps.length === 0 && <p className="max-sub">You&rsquo;ve mastered every concept. Impressive.</p>}
                            {steps && steps.length > 0 && (
                                <ol className="space-y-2.5">
                                    {steps.map((s, i) => {
                                        const open = s.why.startsWith('Unlocked');
                                        return (
                                            <li key={s.id} className={`road-row flex items-center gap-3 rounded-[20px] p-3 ${open ? '' : 'opacity-60'}`}>
                                                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-xs font-extrabold text-[#1b1405] ${open ? 'bg-[var(--max)]' : 'bg-[#e9e3d3]'}`}>{i + 1}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-heading text-sm font-bold text-campus-navy">{s.title} <span className="ml-1 font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-campus-warm-400">{s.domain}</span></p>
                                                    <p className="truncate text-[11px] text-campus-warm-500">{s.why}</p>
                                                    <MasteryBar value={s.mastery} />
                                                </div>
                                                <Link to="/ask" state={{ query: `Explain ${s.title}` }} className="btn-glass max-btn grid h-8 w-8 shrink-0 !p-0" title="Ask about this concept" aria-label={`Ask about ${s.title}`}>
                                                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                                                </Link>
                                                <button type="button" disabled={!open} onClick={() => practice(s.id, s.title, s.level)} className="btn-skeu h-8 shrink-0 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                                                    Practice
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </section>

                    {/* ── the tools: one at a time ── */}
                    <section className="sticker flex min-h-[420px] flex-col p-4 lg:min-h-0" style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }}>
                        <div role="tablist" aria-label="Learning tools" className="no-scrollbar mb-4 flex shrink-0 gap-1 overflow-x-auto rounded-full border-2 border-[var(--max-line)]/15 p-1">
                            {TABS.filter((t) => t.show).map((t) => (
                                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                                    className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${tab === t.id ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                    {tab === t.id && <motion.span layoutId="learn-tab" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                    <span className="relative">{t.label}{t.badge ? <span className="ml-1.5 rounded-full bg-campus-rose px-1.5 text-[10px] text-white">{t.badge}</span> : null}</span>
                                </button>
                            ))}
                        </div>

                        <div role="tabpanel" className="no-scrollbar learn-panel min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
                            {tab === 'practice' && active && (
                                <div>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-sm text-campus-warm-500">Practicing: <strong className="text-campus-navy">{active.title}</strong></p>
                                        <button type="button" onClick={() => { setActive(null); setTab('review'); void load(); }} className="btn-glass max-btn h-8 px-3 text-xs">Done</button>
                                    </div>
                                    <QuizCard key={active.id} docId={active.id} title={active.title} level={LEVELS[Math.min(2, Math.max(0, active.level - 1))]} autoStart
                                        onNext={(id, title) => practice(id, title, active.level)} />
                                </div>
                            )}

                            {tab === 'review' && (
                                <div>
                                    <h2 className="max-h3 mb-3 flex items-center gap-2 text-campus-navy" style={{ fontSize: '1.1rem' }}><CalendarClock className="h-4 w-4" aria-hidden /> Review <span className="max-mark">queue</span></h2>
                                    {!review && <p className="text-sm text-campus-warm-500">Loading…</p>}
                                    {review && review.length === 0 && (
                                        <p className="max-sub" style={{ fontSize: '1rem' }}>Nothing scheduled yet. Answer a few questions and concepts will appear here at the right time to be reviewed.</p>
                                    )}
                                    {review && review.length > 0 && (
                                        <ul className="space-y-2.5">
                                            {review.map((r) => (
                                                <li key={r.id} className="road-row flex flex-wrap items-center gap-3 rounded-[20px] p-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-heading text-sm font-bold text-campus-navy">{r.title}</p>
                                                        <p className="text-[11px] text-campus-warm-500">{r.overdue ? 'Due now' : `Due ${new Date(r.due).toLocaleDateString()}`} · estimated recall {Math.round(r.retention * 100)}%</p>
                                                    </div>
                                                    <span className="max-sticker" style={{ background: r.overdue ? '#ffd2c8' : '#e9e3d3' }}>{r.overdue ? 'Review' : 'Scheduled'}</span>
                                                    <button type="button" onClick={() => practice(r.id, r.title, 1)} className="btn-skeu h-8 px-3 text-xs">Practice</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {tab === 'plan' && (plan && plan.blocks.length > 0
                                ? <SessionPlan plan={plan} onStart={(b) => practice(b.concept, b.title, b.level === 'beginner' ? 1 : b.level === 'intermediate' ? 2 : 3)} />
                                : <p className="max-sub" style={{ fontSize: '1rem' }}>Your session plan appears once Kiddoo knows a little about you: take the placement check or answer a few questions.</p>)}
                            {tab === 'goal' && <GoalCard titles={titles} />}
                            {tab === 'placement' && <PlacementCheck onFinished={() => void load()} titles={titles} />}
                            {tab === 'teach' && (steps && steps.length > 0
                                ? <TeachBack concepts={steps.map((x) => ({ id: x.id, title: x.title }))} />
                                : <p className="max-sub" style={{ fontSize: '1rem' }}>Teach-back opens once your roadmap has loaded.</p>)}
                            {tab === 'draw' && <SketchPad />}
                            {tab === 'analyst' && (insights
                                ? <AnalystCard insights={insights} />
                                : <p className="max-sub" style={{ fontSize: '1rem' }}>The Analyst stays quiet until it has enough of your answers to say something.</p>)}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
