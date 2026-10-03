import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, Flag, GraduationCap, Loader2, Printer, ShieldCheck, Sparkles, Target, TriangleAlert } from 'lucide-react';
import { viewShared, type SharedSummary } from '../lib/share';
import { RagError } from '../lib/rag';
import AppBackdrop from '../components/fx/AppBackdrop';
import ThemeToggle from '../components/fx/ThemeToggle';
import ProgressChart from '../components/dashboard/ProgressChart';

const LEVEL = ['', 'Foundations', 'Intermediate', 'Advanced'];
const BAND = [
    { min: 0.8, label: 'Mastered', color: '#3fbf8a' },
    { min: 0.6, label: 'Ready', color: '#f3dc8f' },
    { min: 0.01, label: 'Learning', color: '#ffb59e' },
    { min: 0, label: 'Not started', color: 'rgb(var(--c-navy) / 0.1)' },
];
const bandOf = (m: number) => BAND.find((b) => m >= b.min) ?? BAND[3];
const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const REFRESH_MS = 60_000;

function Card({ title, mark, icon: Icon, tone, shape = '28px 12px 28px 12px', className = '', children }: {
    title: string; mark: string; icon: typeof Target; tone: string; shape?: string; className?: string; children: React.ReactNode;
}) {
    return (
        <section className={`sticker p-5 ${className}`} style={{ borderRadius: shape, ['--max' as string]: tone }}>
            <h2 className="max-h3 mb-3 flex items-center gap-2 text-campus-navy" style={{ fontSize: '1.1rem' }}>
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: tone }}><Icon className="h-3.5 w-3.5 text-[#1b1405]" aria-hidden /></span>
                {title} <span className="max-mark">{mark}</span>
            </h2>
            {children}
        </section>
    );
}

/** Public, read-only view for a teacher or parent. No login: the link itself is the permission the student granted. */
export default function SharedViewPage() {
    const { token = '' } = useParams<{ token: string }>();
    const [data, setData] = useState<SharedSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {                         // the token is in the URL: keep it out of search indexes and Referer headers
        const tags = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
            const m = document.createElement('meta');
            m.name = name;
            m.content = content;
            document.head.appendChild(m);
            return m;
        });
        return () => tags.forEach((m) => m.remove());
    }, []);

    useEffect(() => {                         // live: the summary refreshes every minute while the page is open
        let live = true;
        const load = () => viewShared(token).then((d) => { if (live) { setData(d); setError(null); } })
            .catch((e) => live && setError(e instanceof RagError ? e.message : 'Could not load this summary.'));
        void load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
        return () => { live = false; clearInterval(t); };
    }, [token]);

    const maxWeek = Math.max(1, ...(data?.weekly ?? []).map((w) => w.answers));
    const daysLeft = data?.goal ? Math.ceil((new Date(data.goal.deadline).getTime() - Date.now()) / 86_400_000) : null;

    return (
        <div className="app-shell relative min-h-screen">
            <AppBackdrop />
            <main className="relative z-10 mx-auto max-w-6xl px-4 py-6 md:px-6">
                <header className="top-bar mb-6 flex h-14 items-center justify-between gap-3 pl-4 pr-2 print:hidden">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[var(--max-line)] bg-gradient-to-br from-[#f3dc8f] to-[#c9a64a]"><GraduationCap className="h-4 w-4 text-[#1b1405]" aria-hidden /></span>
                        <span className="font-heading text-base font-extrabold text-campus-navy">Kiddoo</span>
                        <span className="hidden font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-campus-warm-500 sm:inline">Shared progress</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {data && <span className="max-sticker hidden !rounded-full !px-3 !py-1 !text-[10px] md:inline-block" style={{ background: '#bdeed6' }}>Live · updates every minute</span>}
                        <button type="button" onClick={() => window.print()} className="btn-glass max-btn h-9 gap-1.5 px-3.5 text-xs"><Printer className="h-3.5 w-3.5" aria-hidden /> Print</button>
                        <ThemeToggle className="h-9 w-9" />
                    </div>
                </header>

                <div className="mb-6 px-1">
                    <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)' }}>Learning <span className="max-mark">summary.</span></h1>
                    {data && (
                        <p className="max-sub mt-1" style={{ fontSize: '1rem' }}>
                            Shared with {data.shared_with || 'you'} by the student. Link valid until {new Date(data.link_expires_at).toLocaleDateString()}.
                            Numbers only: no answers or anything the student typed.
                        </p>
                    )}
                </div>

                {!data && !error && <p className="flex items-center gap-2 text-sm text-campus-warm-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
                {error && <p className="sticker p-5 text-sm text-campus-rose" style={{ borderRadius: '24px 10px 24px 10px', ['--max' as string]: '#ffd2c8' }} role="alert">{error}</p>}

                {data && (
                    <div className="space-y-5">
                        {/* headline numbers */}
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                            {[
                                { k: 'Concepts mastered', v: `${data.mastered}/${data.total_concepts}`, tone: '#bdeed6' },
                                { k: 'Study streak', v: `${data.streak_days} day${data.streak_days === 1 ? '' : 's'}`, s: `best ${data.longest_streak}`, tone: '#f3dc8f' },
                                { k: 'Answers recorded', v: String(data.answers), tone: '#ddd6ff' },
                                { k: 'Accuracy', v: pct(data.accuracy), tone: '#ffd2c8' },
                                { k: 'Challenges passed', v: `${data.challenges.passed}/${data.challenges.total}`, s: 'graded by real execution', tone: '#b9dcff' },
                            ].map((x, i) => (
                                <div key={x.k} className="sticker px-4 py-3" style={{ borderRadius: i % 2 ? '10px 22px 10px 22px' : '22px 10px 22px 10px', ['--max' as string]: x.tone }}>
                                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">{x.k}</p>
                                    <p className="font-heading text-2xl font-extrabold text-campus-navy">{x.v}</p>
                                    {x.s && <p className="text-[11px] text-campus-warm-500">{x.s}</p>}
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                            <Card title="Mastery over" mark="14 days" icon={Sparkles} tone="#ffb59e">
                                <div className="h-[230px]"><ProgressChart data={data.progress} /></div>
                            </Card>
                            <div className="space-y-5">
                                <Card title="Things to" mark="know" icon={TriangleAlert} tone="#f3dc8f" shape="12px 28px 12px 28px">
                                    {data.alerts.length === 0 ? (
                                        <p className="flex items-center gap-2 text-sm text-campus-warm-500"><ShieldCheck className="h-4 w-4 text-campus-success" aria-hidden /> No concerning patterns in the recent answers.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {data.alerts.map((a) => (
                                                <li key={a.title} className="j-row text-sm">
                                                    <b className={a.severity === 'warn' ? 'text-campus-rose' : 'text-campus-navy'}>{a.title}</b>
                                                    {a.suggestion && <p className="mt-0.5 text-xs text-campus-warm-500">{a.suggestion}</p>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {data.reviews_overdue > 0 && <p className="mt-3 text-xs text-campus-warm-500">{data.reviews_overdue} concept{data.reviews_overdue > 1 ? 's are' : ' is'} due for review.</p>}
                                    {data.best_time_of_day && <p className="mt-1 text-xs text-campus-warm-500">Answers most accurately in the {data.best_time_of_day.bucket}.</p>}
                                </Card>
                                {data.goal && (
                                    <Card title="Current" mark="goal" icon={Flag} tone="#ddd6ff">
                                        <p className="text-sm text-campus-navy"><b>{data.goal.target}</b> by {new Date(data.goal.deadline).toLocaleDateString()}</p>
                                        <p className="text-xs text-campus-warm-500">{data.goal.daily_minutes} min a day · {daysLeft != null && daysLeft >= 0 ? `${daysLeft} days left` : 'deadline passed'}</p>
                                        <span className="mt-2 block h-2.5 overflow-hidden rounded-full border-2 border-[var(--max-line)] bg-[rgb(var(--c-navy)/0.06)]">
                                            <span className="block h-full bg-[#9b8cff]" style={{ width: `${Math.max(2, data.goal.progress * 100)}%` }} />
                                        </span>
                                        <p className="mt-1 text-right font-mono text-[10px] text-campus-warm-500">{pct(data.goal.progress)} there</p>
                                    </Card>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-5 md:grid-cols-3">
                            <Card title="By" mark="level" icon={GraduationCap} tone="#bdeed6">
                                <ul className="space-y-2.5">
                                    {data.levels.map((l) => (
                                        <li key={l.level} className="text-sm">
                                            <div className="mb-1 flex justify-between"><span className="text-campus-navy">{LEVEL[l.level]}</span><b className="font-mono text-xs text-campus-navy">{l.mastered}/{l.total}</b></div>
                                            <span className="block h-2 overflow-hidden rounded-full bg-[rgb(var(--c-navy)/0.08)]"><span className="block h-full rounded-full bg-[#3fbf8a]" style={{ width: `${l.total ? (l.mastered / l.total) * 100 : 0}%` }} /></span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                            <Card title="Strongest and" mark="next" icon={Target} tone="#f3dc8f" shape="12px 28px 12px 28px">
                                <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">Strongest</p>
                                {data.strongest.length === 0 ? <p className="text-xs text-campus-warm-500">Nothing practiced yet.</p> : data.strongest.map((c) => <p key={c.title} className="flex justify-between text-sm"><span className="text-campus-navy">{c.title}</span><b className="font-mono text-xs">{pct(c.mastery)}</b></p>)}
                                <p className="mb-1 mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">Working on</p>
                                {data.focus.length === 0 ? <p className="text-xs text-campus-warm-500">No concept in progress.</p> : data.focus.map((c) => <p key={c.title} className="flex justify-between text-sm"><span className="text-campus-navy">{c.title}</span><b className="font-mono text-xs">{pct(c.mastery)}</b></p>)}
                            </Card>
                            <Card title="Weekly" mark="activity" icon={CalendarClock} tone="#b9dcff">
                                <div className="flex h-28 items-end gap-1.5" role="img" aria-label={data.weekly.map((w) => `${w.weeks_ago} weeks ago: ${w.answers} answers`).join(', ')}>
                                    {data.weekly.map((w) => (
                                        <div key={w.weeks_ago} className="flex flex-1 flex-col items-center gap-1" title={`${w.answers} answers${w.accuracy == null ? '' : `, ${pct(w.accuracy)} right`}`}>
                                            <span className="font-mono text-[9px] text-campus-navy">{w.answers || ''}</span>
                                            <span className="w-full rounded-t-[5px] border-2 border-b-0 border-[var(--max-line)]" style={{ height: `${Math.max(4, (w.answers / maxWeek) * 72)}px`, background: w.weeks_ago === 0 ? '#f3dc8f' : '#6da7ec' }} />
                                            <span className="font-mono text-[9px] text-campus-warm-500">{w.weeks_ago === 0 ? 'now' : `-${w.weeks_ago}w`}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        <Card title="Mastery by" mark="concept" icon={Sparkles} tone="#ddd6ff" shape="12px 28px 12px 28px">
                            <ul className="mb-4 flex flex-wrap gap-3" aria-label="Legend">
                                {BAND.map((b) => <li key={b.label} className="flex items-center gap-1.5 text-xs text-campus-warm-500"><span className="h-3 w-3 rounded-[4px] border border-[var(--max-line)]" style={{ background: b.color }} aria-hidden />{b.label}</li>)}
                            </ul>
                            <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                                {data.concepts.map((c) => {
                                    const b = bandOf(c.mastery);
                                    return (
                                        <li key={c.id}>
                                            <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate text-campus-navy">{c.title}</span><span className="font-mono text-[11px] text-campus-warm-500">{pct(c.mastery)}</span></div>
                                            <span className="block h-2 overflow-hidden rounded-full bg-[rgb(var(--c-navy)/0.08)]" role="img" aria-label={`${c.title}: ${pct(c.mastery)}, ${b.label}`}>
                                                <span className="block h-full rounded-full" style={{ width: `${Math.max(c.mastery > 0 ? 3 : 0, c.mastery * 100)}%`, background: b.color }} />
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>

                        <p className="pb-4 text-center text-xs text-campus-warm-500">
                            Updated {new Date(data.updated_at).toLocaleTimeString()} · Mastery is measured by Kiddoo&rsquo;s learner model from real answers. The student can turn this link off at any time.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
