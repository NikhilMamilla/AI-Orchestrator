import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, BookOpen, Check, Loader2, NotebookPen, Printer, ShieldCheck, Sparkles, Target, Trophy, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import ShareManager from '../components/learn/ShareManager';
import { fetchJournal, type Journal } from '../lib/learning';

const RANGES = [{ days: 1, label: 'Today' }, { days: 7, label: 'This week' }, { days: 30, label: 'This month' }];

export default function JournalPage() {
    const [days, setDays] = useState(7);
    const [journal, setJournal] = useState<Journal | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setJournal(null);
        setError(null);
        fetchJournal(days).then(setJournal).catch(() => setError("Couldn't load your journal. Please refresh in a moment."));
    }, [days]);

    const change = journal?.overall_mastery_change;

    return (
        <div className="journal-page app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <div className="print:hidden"><AppBackdrop /></div>
            <div className="print:hidden"><Sidebar account={false} /></div>

            {/* one screen on desktop (each list scrolls inside, no scrollbar); printing lays everything out in full */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <div className="print:hidden"><TopBar title="Journal" subtitle="Learning journal" /></div>

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Your <span className="max-mark">journal.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>
                            {journal ? <>From <b className="not-italic">{journal.from}</b> to <b className="not-italic">{journal.to}</b>, built only from the answers you gave.</> : 'Built only from the answers you gave.'}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 print:hidden">
                        <div role="tablist" aria-label="Period" className="flex gap-1 rounded-full border-2 border-[var(--max-line)]/15 bg-[rgb(var(--c-warm-50))] p-1">
                            {RANGES.map((r) => (
                                <button key={r.days} role="tab" aria-selected={days === r.days} type="button" onClick={() => setDays(r.days)}
                                    className={`relative rounded-full px-3 py-1.5 text-xs font-semibold ${days === r.days ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                    {days === r.days && <motion.span layoutId="journal-range" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                    <span className="relative">{r.label}</span>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={() => window.print()} className="btn-glass max-btn h-9 gap-1.5 px-3.5 text-xs">
                            <Printer className="h-3.5 w-3.5" aria-hidden /> Save as PDF
                        </button>
                    </div>
                </header>

                {error && <p role="alert" className="shrink-0 rounded-[18px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
                    {/* ── the journal ── */}
                    <section className="flex min-h-0 flex-col gap-4">
                        {!journal && !error && (
                            <div className="sticker flex flex-1 items-center justify-center gap-2 p-6 text-sm text-campus-warm-500" role="status" style={{ borderRadius: '28px 12px 28px 12px' }}>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Writing your journal…
                            </div>
                        )}

                        {journal && journal.answers === 0 && (
                            <div className="sticker flex flex-1 flex-col items-center justify-center p-8 text-center" style={{ borderRadius: '28px 12px 28px 12px' }}>
                                <span className="clay-icon mb-4 grid h-14 w-14 place-items-center" style={{ background: '#f3dc8f' }}><NotebookPen className="h-7 w-7 text-[#1b1405]" /></span>
                                <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.4rem' }}>Nothing <span className="max-mark">recorded</span> yet</h2>
                                <p className="max-sub mt-2 max-w-md" style={{ fontSize: '1rem' }}>Answer a check question on the Learn page and your journal fills in: what you practiced, what you mastered, and where you got stuck and then broke through.</p>
                            </div>
                        )}

                        {journal && journal.answers > 0 && (
                            <>
                                <div className="grid shrink-0 grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Summary">
                                    {[
                                        { label: 'Answers', value: String(journal.answers), tone: '#f3dc8f' },
                                        { label: 'Correct', value: journal.accuracy !== null ? `${Math.round(journal.accuracy * 100)}%` : '–', tone: '#bdeed6' },
                                        { label: 'Active days', value: String(journal.active_days), tone: '#ffd2c8' },
                                        { label: 'Answering', value: `${journal.minutes_answering}m`, tone: '#ddd6ff' },
                                    ].map((x, i) => (
                                        <div key={x.label} className="j-stat max-edge px-4 py-3" style={{ ['--max' as string]: x.tone, borderRadius: ['26px 10px 26px 10px', '10px 26px 10px 26px'][i % 2] }}>
                                            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">
                                                <span className="h-2 w-2 rounded-full border border-[var(--max-line)]" style={{ background: x.tone }} />{x.label}
                                            </p>
                                            <p className="max-num mt-1 text-campus-navy" style={{ fontSize: '1.7rem' }}>{x.value}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="shrink-0 px-1 text-[11px] text-campus-warm-500">
                                    {journal.time_note}
                                    {change && <> · Overall mastery <b className="text-campus-navy">{change.from}% → {change.to}%</b> ({change.delta >= 0 ? '+' : ''}{change.delta} points)</>}
                                </p>

                                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Panel title="Practiced" tone="#f3dc8f" icon={BookOpen} empty="Nothing practiced in this period." count={journal.concepts_practiced.length}>
                                        {journal.concepts_practiced.map((c) => (
                                            <Row key={c.id} title={c.title} note={`${c.answers} answer${c.answers === 1 ? '' : 's'}`} pct={c.accuracy} bar="#3fbf8a" label="correct" />
                                        ))}
                                    </Panel>
                                    <Panel title="To improve" tone="#ffd2c8" icon={Target} empty="Nothing below mastery in this period." count={journal.needs_work.length}>
                                        {journal.needs_work.map((c) => <Row key={c.id} title={c.title} pct={c.mastery} bar="#ff8a73" label="mastery" />)}
                                    </Panel>
                                    <Panel title="Mastered" tone="#bdeed6" icon={Trophy} empty="Nothing yet: keep going." count={journal.mastered_now.length}>
                                        {journal.mastered_now.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {journal.mastered_now.map((t) => <span key={t} className="max-sticker" style={{ background: '#bdeed6' }}>{t}</span>)}
                                            </div>
                                        )}
                                    </Panel>
                                    <Panel title="Breakthroughs" tone="#ddd6ff" icon={Sparkles} empty="No stuck-then-mastered concepts or recurring mix-ups yet." count={journal.overcame.length + journal.recurring_mix_ups.length}>
                                        {journal.overcame.length > 0 && (
                                            <div className="mb-2 flex flex-wrap gap-1.5">
                                                {journal.overcame.map((t) => <span key={t} className="max-sticker" style={{ background: '#ddd6ff' }}>{t}</span>)}
                                            </div>
                                        )}
                                        {journal.overcame.length > 0 && <p className="mb-2 text-[11px] text-campus-warm-500">You got stuck on these, then reached mastery.</p>}
                                        {journal.recurring_mix_ups.map((m) => (
                                            <div key={m.concept + m.confused_with} className="j-row flex items-center gap-2 text-[11.5px]">
                                                <b className="truncate text-campus-navy">{m.concept}</b><ArrowLeftRight className="h-3 w-3 shrink-0 text-campus-warm-500" aria-hidden />
                                                <b className="truncate text-campus-navy">{m.confused_with}</b><span className="ml-auto shrink-0 font-mono text-[10px] text-campus-warm-500">×{m.times}</span>
                                            </div>
                                        ))}
                                    </Panel>
                                </div>
                            </>
                        )}
                    </section>

                    {/* ── sharing ── */}
                    <aside className="sticker no-scrollbar journal-share flex min-h-0 flex-col gap-3 overflow-y-auto p-5 print:hidden" style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }}>
                        <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.15rem' }}>Share your <span className="max-mark">progress</span></h2>
                        <ShareManager bare />
                        <div className="mt-auto grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <div className="j-note">
                                <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">They see</p>
                                <ul className="space-y-1.5 text-[11.5px] text-campus-navy">
                                    {['Mastery', 'Streak', 'Accuracy', 'Overdue reviews', 'Alerts, with talking points'].map((t) => (
                                        <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-campus-success" aria-hidden />{t}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="j-note">
                                <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">They never see</p>
                                <ul className="space-y-1.5 text-[11.5px] text-campus-navy">
                                    {['Your answers', 'Your questions', 'Anything you typed'].map((t) => (
                                        <li key={t} className="flex items-center gap-2"><X className="h-3.5 w-3.5 shrink-0 text-campus-rose" aria-hidden />{t}</li>
                                    ))}
                                </ul>
                            </div>
                            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-campus-warm-500 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                Only a hash of the link is stored. Expired, revoked and unknown links all look the same: not found.
                            </p>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

function Panel({ title, tone, icon: Icon, empty, count, children }: {
    title: string; tone: string; icon: React.ComponentType<{ className?: string }>; empty: string; count: number; children: React.ReactNode;
}) {
    return (
        <section className="sticker flex min-h-[150px] flex-col p-4 print:break-inside-avoid sm:min-h-0" style={{ ['--max' as string]: tone, borderRadius: '20px 8px 20px 8px' }}>
            <h2 className="mb-3 flex shrink-0 items-center gap-2 font-heading text-sm font-bold text-campus-navy">
                <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: tone }}><Icon className="h-3 w-3 text-[#1b1405]" /></span>
                {title}
                {count > 0 && <span className="ml-auto font-mono text-[10px] font-semibold text-campus-warm-500">{count}</span>}
            </h2>
            <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
                {count === 0
                    ? <div className="flex h-full flex-col items-center justify-center gap-2 py-3 text-center">
                        <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-dashed border-[var(--max-line)]/30"><Icon className="h-4 w-4 text-campus-warm-400" /></span>
                        <p className="max-w-[16rem] text-[11.5px] text-campus-warm-500">{empty}</p>
                    </div>
                    : children}
            </div>
        </section>
    );
}

function Row({ title, note, pct, bar, label }: { title: string; note?: string; pct: number; bar: string; label: string }) {
    const v = Math.round(pct * 100);
    return (
        <div className="j-row">
            <div className="flex items-baseline justify-between gap-2">
                <b className="truncate text-[12px] text-campus-navy">{title}</b>
                <span className="shrink-0 font-mono text-[10px] text-campus-warm-500">{note ? `${note} · ` : ''}{v}% {label}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--c-navy)/0.1)]" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={`${title}: ${v}% ${label}`}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, v)}%`, background: bar }} />
            </div>
        </div>
    );
}
