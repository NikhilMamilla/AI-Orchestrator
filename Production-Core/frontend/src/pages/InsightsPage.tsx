import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Award, Brain, CalendarClock, Loader2, MessageSquareText, Target } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import StudyRhythm from '../components/dashboard/StudyRhythm';
import AgentActivityLog, { type AgentEvent } from '../components/dashboard/AgentActivityLog';
import AchievementBadges, { type Achievement } from '../components/dashboard/AchievementBadges';
import { apiClient } from '../lib/api';

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T };

function useLoad<T>(fn: () => Promise<T>): Load<T> {
    const [res, setRes] = useState<Load<T>>({ state: 'loading' });
    useEffect(() => {
        let alive = true;
        fn().then(
            (data) => alive && setRes({ state: 'ok', data }),
            () => alive && setRes({ state: 'error' }),
        );
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return res;
}

function Panel({ title, mark, icon: Icon, tone, shape, className = '', children }: {
    title: string; mark: string; icon: typeof Activity; tone: string; shape: string; className?: string; children: React.ReactNode;
}) {
    return (
        <section className={`sticker flex min-h-0 flex-col p-5 ${className}`} style={{ borderRadius: shape, ['--max' as string]: tone }}>
            <h2 className="max-h3 mb-3 flex shrink-0 items-center gap-2 text-campus-navy" style={{ fontSize: '1.15rem' }}>
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: tone }}><Icon className="h-3.5 w-3.5 text-[#1b1405]" aria-hidden /></span>
                {title} <span className="max-mark">{mark}</span>
            </h2>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-1 pr-1">{children}</div>
        </section>
    );
}

const Loading = () => (
    <div className="flex items-center gap-2 py-6 text-sm text-campus-warm-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
    </div>
);
const ErrorNote = () => (
    <p className="rounded-[16px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose" role="alert">
        Couldn&rsquo;t load this right now. Please refresh in a moment.
    </p>
);

export default function InsightsPage() {
    const activity = useLoad<AgentEvent[]>(() => apiClient.getAgentActivity());
    const achievements = useLoad<Achievement[]>(() => apiClient.getAchievements());

    const earned = achievements.state === 'ok' ? achievements.data.filter((a) => a.earned).length : null;
    const total = achievements.state === 'ok' ? achievements.data.length : null;
    const decisions = activity.state === 'ok' ? activity.data.length : null;
    const next = achievements.state === 'ok'
        ? achievements.data.filter((a) => !a.earned).sort((a, b) => (b.progress ?? 0) / (b.maxProgress || 1) - (a.progress ?? 0) / (a.maxProgress || 1)).slice(0, 3)
        : [];

    const stats = [
        { label: 'agent decisions', value: decisions ?? '–', tone: '#ddd6ff' },
        { label: 'badges earned', value: earned == null ? '–' : `${earned} / ${total}`, tone: '#f3dc8f' },
        { label: 'closest milestone', value: next[0] ? `${Math.round(((next[0].progress ?? 0) / (next[0].maxProgress || 1)) * 100)}%` : '–', tone: '#bdeed6' },
    ];

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: what the agents decided on the left, milestones and badges on the right */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Insights" subtitle="Intelligence hub" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Your <span className="max-mark">insights.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>What your agents decided, and how far you&rsquo;ve come. Everything here is computed from your own activity.</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2" aria-label="Summary">
                        {stats.map((x) => (
                            <span key={x.label} className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: x.tone }}><b className="font-heading text-xs">{x.value}</b> {x.label}</span>
                        ))}
                    </div>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
                    <div className="flex min-h-0 flex-col gap-5">
                    <Panel title="Agent" mark="activity" icon={Activity} tone="#9b8cff" shape="28px 12px 28px 12px" className="min-h-[300px] flex-1 lg:min-h-0">
                        {activity.state === 'loading' && <Loading />}
                        {activity.state === 'error' && <ErrorNote />}
                        {activity.state === 'ok' && (activity.data.length > 0 ? (
                            <AgentActivityLog events={activity.data} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                                <span className="clay-icon grid h-14 w-14 place-items-center" style={{ background: '#ddd6ff' }}><Brain className="h-7 w-7 text-[#1b1405]" aria-hidden /></span>
                                <p className="font-heading text-base font-bold text-campus-navy">No agent decisions yet</p>
                                <p className="max-w-sm text-xs leading-relaxed text-campus-warm-500">
                                    When you start a learning session, the Orchestrator logs each decision and the reasoning behind it here.
                                </p>
                                <Link to="/ask" className="btn-skeu mt-1 h-10 gap-1.5 px-5 text-xs">
                                    <MessageSquareText className="h-4 w-4" aria-hidden /> Ask a question
                                </Link>
                            </div>
                        ))}
                    </Panel>
                    <Panel title="Your study" mark="rhythm" icon={CalendarClock} tone="#b9dcff" shape="12px 28px 12px 28px" className="shrink-0">
                        <StudyRhythm />
                    </Panel>
                    </div>

                    <div className="flex min-h-0 flex-col gap-5">
                        <Panel title="Next" mark="milestones" icon={Target} tone="#3fbf8a" shape="12px 28px 12px 28px" className="shrink-0">
                            {achievements.state === 'loading' && <Loading />}
                            {achievements.state === 'error' && <ErrorNote />}
                            {achievements.state === 'ok' && (next.length > 0 ? (
                                <ul className="space-y-2.5">
                                    {next.map((a) => {
                                        const pct = Math.round(((a.progress ?? 0) / (a.maxProgress || 1)) * 100);
                                        return (
                                            <li key={a.id} className="j-row">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <b className="truncate text-[12px] text-campus-navy">{a.title}</b>
                                                    <span className="shrink-0 font-mono text-[10px] text-campus-warm-500">{a.progress ?? 0} / {a.maxProgress}</span>
                                                </div>
                                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--c-navy)/0.1)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={a.title}>
                                                    <div className="h-full rounded-full bg-[#3fbf8a]" style={{ width: `${Math.max(3, pct)}%` }} />
                                                </div>
                                                <p className="mt-1 truncate text-[11px] text-campus-warm-500">{a.description}</p>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-sm text-campus-warm-500">You&rsquo;ve earned every badge. Impressive.</p>
                            ))}
                        </Panel>

                        <Panel title="Your" mark="badges" icon={Award} tone="#f3dc8f" shape="28px 12px 28px 12px" className="min-h-[260px] flex-1 lg:min-h-0">
                            {achievements.state === 'loading' && <Loading />}
                            {achievements.state === 'error' && <ErrorNote />}
                            {achievements.state === 'ok' && <AchievementBadges achievements={achievements.data} />}
                        </Panel>
                    </div>
                </div>
            </main>
        </div>
    );
}
