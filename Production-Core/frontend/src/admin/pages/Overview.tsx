import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminOverview, adminSystem } from '../api';
import { fetchMetrics } from '../../lib/rag';
import { downloadCsv, gated, ms, num, pct, shortDay, sum } from '../format';
import { useLive } from '../useLive';
import { ChartTip, Empty, ErrorLine, ExportButton, Kpi, Legend, LiveChip, Loading, PageHead, Panel, RangeSeg, Status } from '../ui';

const SERIES = [
    { key: 'questions', label: 'Questions asked', color: 'var(--s-1)' },
    { key: 'answers', label: 'Quiz answers', color: 'var(--s-2)' },
    { key: 'code_runs', label: 'Code runs', color: 'var(--s-3)' },
] as const;

export default function Overview() {
    const [days, setDays] = useState(14);
    const ov = useLive(() => adminOverview(days), 30_000, [days]);
    const feed = useLive(fetchMetrics, 15_000);
    const sys = useLive(adminSystem, 60_000);
    const d = ov.data;
    const k = d?.min_group ?? 1;

    const chart = d ? d.days.map((day, i) => ({ day, questions: d.series.questions[i], answers: d.series.answers[i], code_runs: d.series.code_runs[i] })) : [];
    const groundedSeries = d ? d.series.questions.map((q, i) => (q ? d.series.grounded[i] / q : null)) : [];

    return (
        <>
            <PageHead title="Platform overview" sub={`Is the platform healthy, and are people learning? The last ${days} days, refreshed every 30 seconds.`}
                right={<><RangeSeg value={days} onChange={setDays} /><LiveChip updated={ov.updated} loading={ov.loading} onRefresh={() => { void ov.reload(); void feed.reload(); void sys.reload(); }} />
                    <ExportButton onClick={() => d && downloadCsv(`kiddoo-overview-${days}d.csv`, d.days.map((day, i) => ({
                        day, active_learners: d.series.active[i] ?? `<${k}`, new_learners: d.series.new[i], questions: d.series.questions[i],
                        grounded: d.series.grounded[i], refused: d.series.refused[i], quiz_answers: d.series.answers[i], code_runs: d.series.code_runs[i],
                    })))} /></>} />

            {ov.error && !d && <ErrorLine text={ov.error} />}

            {/* alerts */}
            {d && (
                <div className="a-panel flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-[22px_10px_22px_10px] px-5 py-2.5" aria-label="Alerts">
                    {d.alerts.length === 0 ? <Status level="good" label="All clear: no alerts right now" /> : d.alerts.map((a) => (
                        <span key={a.text} className="flex items-center gap-2 text-xs"><Status level={a.level} label={a.level === 'critical' ? 'Critical' : a.level === 'serious' ? 'Needs action' : 'Watch'} /><span className="a-ink-2">{a.text}</span></span>
                    ))}
                </div>
            )}

            {/* KPIs */}
            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                {!d ? Array.from({ length: 8 }, (_, i) => <div key={i} className="a-tile h-[88px] animate-pulse" />) : (
                    <>
                        <Kpi label="Learners" value={num(d.kpi.learners)} sub={`+${d.kpi.new} new in ${days} days`} series={d.series.new} color="var(--s-1)" />
                        <Kpi label="Active today" value={gated(d.kpi.active_1d, k)} sub="answered or asked" series={d.series.active} color="var(--s-1)" />
                        <Kpi label="Active 7 days" value={gated(d.kpi.active_7d, k)} sub="distinct learners" color="var(--s-1)" />
                        <Kpi label="Questions" value={num(d.kpi.questions)} sub="asked the tutor" series={d.series.questions} color="var(--s-1)" />
                        <Kpi label="Quiz answers" value={num(d.kpi.answers)} sub="check questions" series={d.series.answers} color="var(--s-2)" />
                        <Kpi label="Code runs" value={num(d.kpi.code_runs)} sub="in the sandbox" series={d.series.code_runs} color="var(--s-3)" />
                        <Kpi label="Grounded" value={pct(d.kpi.grounded_rate)} sub={`refused ${pct(d.kpi.refusal_rate)}`} series={groundedSeries} color="var(--s-3)" />
                        <Kpi label="p95 answer time" value={ms(d.kpi.p95_ms)} sub="end to end" />
                    </>
                )}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                <Panel title="Activity" cap="Per day. Hover a day for exact numbers." className="min-h-[320px] lg:min-h-0"
                    right={d && <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color, value: num(sum(d.series[s.key])) }))} />}>
                    {!d ? <Loading /> : sum(d.series.questions) + sum(d.series.answers) + sum(d.series.code_runs) === 0 ? (
                        <Empty>No activity in this range yet. Questions, quiz answers and code runs appear here as learners use Kiddoo.</Empty>
                    ) : (
                        <div className="h-full min-h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} minTickGap={24} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                    <Tooltip content={<ChartTip title={shortDay} />} cursor={{ stroke: 'var(--a-line-strong)' }} />
                                    {SERIES.map((s) => (
                                        <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false}
                                            activeDot={{ r: 4, stroke: 'var(--a-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Panel>

                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Services" cap="Checked every minute" className="shrink-0"
                        right={<Link to="/admin/system" className="a-btn !h-7 !px-2.5 !text-[11px]">System</Link>}>
                        {!sys.data ? <Loading /> : (
                            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                {sys.data.services.map((s) => (
                                    <li key={s.name} className="a-row flex items-center justify-between gap-2 !py-1.5">
                                        <span className="a-ink truncate text-[11px] font-semibold">{s.name}</span>
                                        <Status level={s.ok === true ? 'good' : s.ok === false ? (s.required ? 'critical' : 'warning') : 'idle'}
                                            label={s.ok === true ? 'Up' : s.ok === false ? 'Down' : 'Idle'} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <Panel title="Live pipeline" cap="Latest answers since the server started. No question text is stored." className="min-h-[260px] flex-1 lg:min-h-0">
                        {!feed.data ? <Loading /> : feed.data.recent.length === 0 ? <Empty>No answers since the server started.</Empty> : (
                            <ul className="space-y-1.5">
                                {feed.data.recent.map((r) => (
                                    <li key={r.request_id} className="a-row flex items-center gap-2 !py-1.5 text-[11px]">
                                        <Status level={r.status === 'grounded' ? 'good' : r.status === 'insufficient_evidence' ? 'warning' : 'serious'}
                                            label={r.status === 'grounded' ? 'Grounded' : r.status === 'insufficient_evidence' ? 'Refused' : (r.status ?? 'Other')} />
                                        <span className="a-muted truncate">{r.intent ?? '–'} · {r.mode ?? r.failure ?? '–'}</span>
                                        <b className="a-num a-ink ml-auto shrink-0">{ms(r.total_ms)}</b>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </>
    );
}
