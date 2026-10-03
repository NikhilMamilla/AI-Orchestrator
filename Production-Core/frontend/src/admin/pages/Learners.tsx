import { useState } from 'react';
import { adminLearners, type Gated, type Learners as L } from '../api';
import { ConceptDrawer } from '../drawers';
import { downloadCsv, gated, num, pct } from '../format';
import { useLive } from '../useLive';
import { Empty, ErrorLine, ExportButton, Kpi, Legend, LiveChip, Loading, PageHead, Panel } from '../ui';

const BANDS = [
    { key: 'learning', label: 'Learning', hint: 'mastery under 60%' },
    { key: 'ready', label: 'Ready', hint: '60–80%' },
    { key: 'mastered', label: 'Mastered', hint: '80% and up' },
] as const;
const STYLE_NAME: Record<string, string> = { default: 'Clear and concise', socratic: 'Socratic', worked_example: 'Worked examples', analogy: 'Analogies' };
const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'];

/** Sequential, one hue: the share of a concept's learners in a band picks the step. */
function cellColor(v: Gated, total: Gated) {
    if (v == null || total == null || total === 0) return { bg: 'var(--seq-0)', dark: false };
    const step = v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / total) * 4));
    return { bg: SEQ[step], dark: step >= 3 };
}

function Bar({ value, color = 'var(--s-1)' }: { value: number; color?: string }) {
    return (
        <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--a-line)' }} aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, value * 100)}%`, background: color }} />
        </span>
    );
}

export default function Learners() {
    const live = useLive(adminLearners, 60_000);
    const d = live.data;
    const k = d?.min_group ?? 1;
    const [open, setOpen] = useState<string | null>(null);
    const exportCsv = () => d && downloadCsv('kiddoo-cohort.csv', d.heatmap.map((r) => {
        const h = d.hardest.find((x) => x.concept === r.concept);
        const show = (v: Gated) => (v == null ? `<${k}` : v);
        return { concept: r.title, learners: show(r.learners), learning: show(r.learning), ready: show(r.ready), mastered: show(r.mastered),
            accuracy: h?.accuracy ?? '', answers: h?.answers ?? '', median_seconds: h?.median_seconds ?? '' };
    }));

    return (
        <>
            <PageHead title="Learners, as a group" sub={`How the whole cohort is doing: never one person. ${k > 1 ? `Groups smaller than ${k} show as “<${k}”.` : 'Exact counts (development mode).'}`}
                right={<><LiveChip updated={live.updated} loading={live.loading} onRefresh={() => void live.reload()} /><ExportButton onClick={exportCsv} /></>} />
            {live.error && !d && <ErrorLine text={live.error} />}
            {!d ? <Loading /> : <Body d={d} k={k} onOpen={setOpen} />}
            <ConceptDrawer id={open} onClose={() => setOpen(null)} onOpen={setOpen} />
        </>
    );
}

function Body({ d, k, onOpen }: { d: L; k: number; onOpen: (id: string) => void }) {
    const totalTrials = d.styles.reduce((a, s) => a + s.trials, 0);
    const maxBucket = Math.max(1, ...d.answers_per_learner.map((b) => b.learners ?? 0));
    return (
        <>
            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Learners" value={num(d.learners)} sub="with a learner profile" />
                <Kpi label="Placement checks" value={`${gated(d.placement.finished, k)} / ${gated(d.placement.started, k)}`} sub="finished / started" />
                <Kpi label="Goals set" value={gated(d.goals.set, k)} sub={`${gated(d.goals.past_deadline, k)} past their deadline`} />
                <Kpi label="Style trials" value={num(totalTrials)} sub="settled by the next quiz" />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr_1fr]">
                {/* mastery heatmap */}
                <Panel title="Mastery by concept" cap="How many learners sit in each band. Click a concept for its drill-down" className="min-h-[420px] xl:min-h-0"
                    right={<Legend items={[{ label: 'fewer', color: SEQ[1] }, { label: 'more', color: SEQ[4] }]} />}>
                    <table className="w-full border-separate text-[11px]" style={{ borderSpacing: '0 3px' }}>
                        <caption className="sr-only">Learners per mastery band for each concept</caption>
                        <thead>
                            <tr>
                                <th className="a-cap pb-1 text-left font-bold">Concept</th>
                                {BANDS.map((b) => <th key={b.key} className="a-cap pb-1 text-center font-bold" title={b.hint}>{b.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {d.heatmap.map((r) => (
                                <tr key={r.concept} className="cursor-pointer hover:opacity-80" role="button" tabIndex={0} onClick={() => onOpen(r.concept)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.concept); } }}>
                                    <th scope="row" className="a-ink max-w-[10rem] truncate pr-2 text-left font-semibold">{r.title}</th>
                                    {BANDS.map((b) => {
                                        const c = cellColor(r[b.key], r.learners);
                                        return (
                                            <td key={b.key} className="px-[1px]">
                                                <span title={`${r.title} · ${b.label}: ${gated(r[b.key], k)} learner(s)`}
                                                    className="a-num block rounded-[6px] py-1 text-center font-bold"
                                                    style={{ background: c.bg, color: c.dark ? 'var(--seq-ink-hi)' : 'var(--a-ink)' }}>
                                                    {gated(r[b.key], k)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>

                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Hardest concepts" cap={`Lowest quiz accuracy (needs ${k}+ learners and 3+ answers)`} className="min-h-[220px] flex-1 xl:min-h-0">
                        {d.hardest.length === 0 ? <Empty>Not enough answers yet to rank concepts.</Empty> : (
                            <ul className="space-y-1.5">
                                {d.hardest.map((h) => (
                                    <li key={h.concept} className="a-row cursor-pointer" role="button" tabIndex={0} onClick={() => onOpen(h.concept)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(h.concept); } }}>
                                        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                                            <b className="a-ink truncate">{h.title}</b>
                                            <span className="a-num a-ink-2 shrink-0">{pct(h.accuracy)} · {h.answers} answers{h.median_seconds != null ? ` · ${h.median_seconds}s` : ''}</span>
                                        </div>
                                        <Bar value={h.accuracy} color="var(--s-2)" />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Common mix-ups" cap="Wrong options that came from another concept" className="min-h-[180px] flex-1 xl:min-h-0">
                        {d.mixups.length === 0 ? <Empty>No repeated mix-ups yet.</Empty> : (
                            <ul className="space-y-1.5 text-[11px]">
                                {d.mixups.map((m) => (
                                    <li key={`${m.concept}-${m.confused_with}`} className="a-row flex items-center gap-2">
                                        <span className="a-ink truncate"><b>{m.concept}</b> <span className="a-muted">confused with</span> <b>{m.confused_with}</b></span>
                                        <b className="a-num a-gold ml-auto shrink-0">×{m.times}</b>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Needs attention" cap="Struggling now (3 wrong in a row) · overdue reviews" className="shrink-0">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {[{ title: 'Struggling', rows: d.struggling }, { title: 'Overdue', rows: d.overdue }].map((g) => (
                                <ul key={g.title} className="space-y-1">
                                    <li className="a-cap">{g.title}</li>
                                    {g.rows.length === 0 ? <li className="a-muted">None</li> : g.rows.slice(0, 4).map((r) => (
                                        <li key={r.concept} className="flex justify-between gap-2"><span className="a-ink truncate">{r.title}</span><b className="a-num a-ink">{gated(r.learners, k)}</b></li>
                                    ))}
                                </ul>
                            ))}
                        </div>
                    </Panel>
                </div>

                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Most-missed questions" cap="With the wrong answer most people picked" className="min-h-[220px] flex-1 xl:min-h-0">
                        {d.missed_questions.length === 0 ? <Empty>No question has been missed by {k}+ learners yet.</Empty> : (
                            <ul className="space-y-1.5">
                                {d.missed_questions.map((q) => (
                                    <li key={q.question} className="a-row text-[11px]">
                                        <p className="a-cap mb-0.5">{q.concept} · missed {pct(q.miss_rate)} of {q.answers}</p>
                                        <p className="a-ink leading-snug">{q.question}</p>
                                        {q.common_wrong && <p className="a-muted mt-1">Most picked: <span style={{ color: 'var(--critical)' }}>{q.common_wrong}</span> · correct: <span className="a-ink">{q.correct}</span></p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Teaching styles" cap="What the per-learner bandit tries, and how often the next quiz goes right" className="shrink-0">
                        <ul className="space-y-1.5">
                            {d.styles.map((s) => (
                                <li key={s.style} className="text-[11px]">
                                    <div className="mb-0.5 flex justify-between gap-2"><span className="a-ink">{STYLE_NAME[s.style] ?? s.style}</span>
                                        <span className="a-num a-ink-2">{s.trials} trials · {s.win_rate == null ? '–' : `${pct(s.win_rate)} right`}</span></div>
                                    <Bar value={s.win_rate ?? 0} color="var(--s-1)" />
                                </li>
                            ))}
                        </ul>
                    </Panel>
                    <Panel title="Engagement" cap="Quiz answers per learner" className="shrink-0">
                        <div className="flex h-20 items-end gap-2" role="img" aria-label={d.answers_per_learner.map((b) => `${b.label}: ${gated(b.learners, k)}`).join(', ')}>
                            {d.answers_per_learner.map((b) => (
                                <div key={b.label} className="flex flex-1 flex-col items-center gap-1" title={`${b.label} answers: ${gated(b.learners, k)} learner(s)`}>
                                    <span className="a-num a-ink text-[10px] font-bold">{gated(b.learners, k)}</span>
                                    <span className="w-full rounded-t-[4px]" style={{ height: `${Math.max(3, ((b.learners ?? 0) / maxBucket) * 44)}px`, background: 'var(--s-1)' }} />
                                    <span className="a-muted text-[9px]">{b.label}</span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>
            </div>
        </>
    );
}
