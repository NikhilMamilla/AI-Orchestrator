
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../lib/api';
import { fetchPath, type PathStep } from '../lib/learning';
import ProgressChart from '../components/dashboard/ProgressChart';
import Sidebar from '../components/Sidebar';
import AppBackdrop from '../components/fx/AppBackdrop';
import TopBar from '../components/TopBar';
import {
    Trophy,
    Flame,
    Clock,
    ArrowRight,
    Sparkles,
    BookOpen,
} from 'lucide-react';

const vFadeUp = {
    hidden: { opacity: 0, y: 15 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut' as const },
    },
};

const stagger = {
    visible: {
        transition: {
            staggerChildren: 0.1,
        },
    },
};


interface DashboardData {
    progress_overview?: { concepts_mastered?: number; current_streak?: number; total_time_minutes?: number };
    analytics?: { progress_over_time?: { date: string; mastery: number }[] };
}

export default function DashboardPage() {
    const { user, isAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [nextSteps, setNextSteps] = useState<PathStep[]>([]);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        loadDashboard();
        fetchPath().then((p) => setNextSteps(p.steps.filter((x) => x.mastery < 0.8).slice(0, 3))).catch(() => setNextSteps([]));
    }, [isAuthenticated, navigate]);

    const loadDashboard = async () => {
        try {
            if (user?.id) {
                const data = await apiClient.getDashboard();
                setDashboardData(data);
            }
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    };

    const history = dashboardData?.analytics?.progress_over_time ?? [];
    // an older server sends no per-day answer counts: then any recorded day counts as activity
    const active = history.some((h) => { const n = (h as { answers?: number }).answers; return n === undefined ? true : n > 0; });
    const trend = active && history.length >= 2 ? history[history.length - 1].mastery - history[0].mastery : null;

    const startLearningSession = () => {
        navigate('/session/active');
    };


    const stats = [
        { icon: Trophy, label: 'Concepts mastered', value: String(dashboardData?.progress_overview?.concepts_mastered || 0), unit: '', tone: '#3fbf8a' },
        { icon: Flame, label: 'Current streak', value: String(dashboardData?.progress_overview?.current_streak || 0), unit: 'days', tone: '#ff8a73' },
        { icon: Clock, label: 'Time invested', value: String(Math.round((dashboardData?.progress_overview?.total_time_minutes || 0) / 60)), unit: 'hours', tone: '#9b8cff' },
    ];
    const firstName = user?.name?.split(' ')[0] || 'there';
    const SHAPES = ['40px 14px 40px 14px', '14px 40px 14px 40px', '40px 40px 14px 40px'];
    const tone = (c: string) => ({ ['--max' as string]: c }) as React.CSSProperties;

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the bar, the greeting, the numbers, then the chart and next steps share what is left */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Dashboard" />

                {/* ── greeting and the call to action ── */}
                <motion.header variants={stagger} initial="hidden" animate="visible" className="flex shrink-0 flex-col items-start justify-between gap-4 px-1 sm:flex-row sm:items-end">
                    <motion.div variants={vFadeUp}>
                        <p className="max-tag mb-3" style={{ fontSize: '10px', padding: '0.25rem 0.75rem' }}>Welcome back</p>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.6rem, 2.3vw, 2.15rem)' }}>{firstName}&rsquo;s <span className="max-mark">dashboard.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '1rem' }}>Your learning, measured from your own answers.</p>
                    </motion.div>
                    {/* the entrance moves the wrapper, so the button's own press (CSS transform) is never overridden */}
                    <motion.div variants={vFadeUp} className="shrink-0">
                        <button type="button" onClick={startLearningSession} className="btn-skeu group h-11 px-5 text-sm">
                            <BookOpen className="h-4 w-4" /> Start a session <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </button>
                    </motion.div>
                </motion.header>

                {/* ── the three numbers: clay stickers, each in its own colour ── */}
                <motion.section variants={stagger} initial="hidden" animate="visible" className="grid shrink-0 grid-cols-1 gap-5 sm:grid-cols-3">
                    {stats.map((stat, i) => (
                        <motion.div key={stat.label} variants={vFadeUp}>
                            <div className="clay-card max-edge flex items-center gap-4 px-5 py-4" style={{ ...tone(stat.tone), borderRadius: SHAPES[i], rotate: `${[-0.6, 0.5, -0.4][i]}deg` }}>
                                <div className="clay-icon grid h-11 w-11 shrink-0 place-items-center" style={{ background: stat.tone }}>
                                    <stat.icon className="h-5 w-5 text-[#1b1405]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">{stat.label}</p>
                                    <p className="mt-0.5 flex items-baseline gap-1.5">
                                        <span className="max-num text-campus-navy" style={{ fontSize: '1.75rem' }}>{stat.value}</span>
                                        {stat.unit && <span className="font-display text-base italic text-campus-warm-500">{stat.unit}</span>}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.section>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* ── learning progress: a glass pebble around the mastery curve ── */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="glass-pebble max-edge flex min-h-[300px] flex-col p-5 lg:col-span-2 lg:min-h-0" style={{ borderRadius: '36px 14px 36px 14px' }}>
                        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                            <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.2rem' }}>Learning <span className="max-mark">progress</span></h2>
                            <span className="max-sticker" style={{ background: trend === null ? '#e9e3d3' : trend >= 0 ? '#3fbf8a' : '#ff8a73' }}>
                                {trend === null ? 'No answers in 14 days' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)} pts · 14 days`}
                            </span>
                        </div>
                        <div className="min-h-0 w-full flex-1">
                            <ProgressChart data={history} />
                        </div>
                    </motion.div>

                    {/* ── next steps: the roadmap's next three concepts, each with its mastery ── */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        className="clay-card max-edge flex min-h-0 flex-col p-5" style={{ ...tone('#f3dc8f'), borderRadius: '14px 36px 14px 36px' }}>
                        <h2 className="max-h3 mb-3 flex shrink-0 items-center gap-2 text-campus-navy" style={{ fontSize: '1.2rem' }}>
                            <Sparkles className="h-4 w-4 text-campus-gold-dark" /> Next <span className="max-mark">steps</span>
                        </h2>
                        <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden">
                            {nextSteps.length === 0 && (
                                <p className="max-sub" style={{ fontSize: '0.95rem' }}>Ask a question and answer a check question: your roadmap appears here.</p>
                            )}
                            {nextSteps.map((step) => (
                                <button type="button" key={step.id} onClick={() => navigate('/learn')} className="step-chip group w-full rounded-[18px] px-3.5 py-2.5 text-left">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="truncate font-heading text-sm font-bold text-campus-navy">{step.title}</h3>
                                        <span className="max-sticker shrink-0" style={{ background: step.mastery >= 0.5 ? '#f3dc8f' : '#ffd2c8' }}>{Math.round(step.mastery * 100)}%</span>
                                    </div>
                                    <p className="mt-1 truncate text-[11px] leading-relaxed text-campus-warm-500">{step.why}</p>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => navigate('/learn')} className="btn-glass max-btn mt-4 h-10 w-full shrink-0 justify-center text-xs">
                            Open my roadmap <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
