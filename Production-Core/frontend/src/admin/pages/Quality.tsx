import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchMetrics } from '../../lib/rag';
import { adminQuality, type Quality as Q } from '../api';
import { downloadCsv, ms, num, pct, shortDay, sum } from '../format';
import { useLive } from '../useLive';
import { ChartTip, Empty, ErrorLine, ExportButton, Kpi, Legend, LiveChip, Loading, PageHead, Panel, RangeSeg } from '../ui';

const STATUS = [
    { key: 'grounded', label: 'Grounded', color: 'var(--s-1)' },
    { key: 'insufficient_evidence', label: 'Refused', color: 'var(--s-2)' },
    { key: 'fallback', label: 'Quoted fallback', color: 'var(--s-3)' },
] as const;
const CONFIG_NAME: Record<string, string> = {
    bm25_only: 'BM25 only', dense_only: 'Dense only', hybrid_rrf: 'Hybrid (RRF)', 'hybrid+multiquery': '+ multi-query',
    'hybrid+multiquery+rerank': '+ rerank', 'full (+prereq hop)': 'Full (+ prerequisite hop)',
};
const label = (k: string) => CONFIG_NAME[k] ?? k.replace(/_/g, ' ');

export default function Quality() {
    const [days, setDays] = useState(14);
    const q = useLive(() => adminQuality(days), 60_000, [days]);
    const m = useLive(fetchMetrics, 15_000);
    const d = q.data;

    return (
        <>
            <PageHead title="Answer quality" sub="Is the tutor grounded, honest and fast? Daily history from the request log, plus the committed evaluation runs."
                right={<><RangeSeg value={days} onChange={setDays} /><LiveChip updated={q.updated} loading={q.loading} onRefresh={() => { void q.reload(); void m.reload(); }} />
                    <ExportButton onClick={() => d && downloadCsv(`kiddoo-quality-${days}d.csv`, d.days.map((day, i) => ({
                        day, grounded: d.status.grounded[i], refused: d.status.insufficient_evidence[i], fallback: d.status.fallback[i],
                        other: d.status.other[i], p50_ms: d.p50_ms[i] ?? '', p95_ms: d.p95_ms[i] ?? '',
                    })))} /></>} />
            {q.error && !d && <ErrorLine text={q.error} />}
            {!d ? <Loading /> : <Body d={d} stages={m.data?.stage_latency_ms ?? {}} />}
        </>
    );
}

function Body({ d, stages }: { d: Q; stages: Record<string, { p50: number | null; p95: number | null }> }) {
    const daily = d.days.map((day, i) => ({ day, grounded: d.status.grounded[i], insufficient_evidence: d.status.insufficient_evidence[i], fallback: d.status.fallback[i], p50: d.p50_ms[i], p95: d.p95_ms[i] }));
    const grounded = sum(d.status.grounded), refused = sum(d.status.insufficient_evidence), fallback = sum(d.status.fallback);
    const stageRows = Object.entries(stages);
    const maxStage = Math.max(1, ...stageRows.map(([, s]) => s.p95 ?? 0));
    const e = d.eval;

    return (
        <>
            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi label="Answers" value={num(d.answers)} sub="in this range" series={d.days.map((_, i) => d.status.grounded[i] + d.status.insufficient_evidence[i] + d.status.fallback[i] + d.status.other[i])} />
                <Kpi label="Grounded" value={pct(d.answers ? grounded / d.answers : null)} sub="cited from sources" series={d.status.grounded} color="var(--s-1)" />
                <Kpi label="Refused" value={pct(d.answers ? refused / d.answers : null)} sub="evidence gate said no" series={d.status.insufficient_evidence} color="var(--s-2)" />
                <Kpi label="Cache hits" value={pct(d.cache_hit_rate)} sub={`${num(d.tokens)} tokens used`} />
                <Kpi label="LLM failures" value={num(Object.values(d.failures).reduce((a, b) => a + b, 0))} sub={`${fallback} answered by quoting`} />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr_1fr]">
                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Outcomes per day" cap="Every answer is grounded, refused, or quoted when no model is available" className="min-h-[240px] flex-1 xl:min-h-0"
                        right={<Legend items={STATUS.map((s) => ({ label: s.label, color: s.color, value: num(sum(d.status[s.key])) }))} />}>
                        {d.answers === 0 ? <Empty>No answers logged in this range yet. Each answer adds one anonymous row (no user, no question text).</Empty> : (
                            <div className="h-full min-h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={daily} margin={{ top: 6, right: 8, bottom: 0, left: -20 }} barCategoryGap="22%">
                                        <CartesianGrid vertical={false} />
                                        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} minTickGap={20} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                        <Tooltip content={<ChartTip title={shortDay} />} cursor={{ fill: 'var(--a-line)' }} />
                                        {STATUS.map((s, i) => (
                                            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="var(--a-surface)" strokeWidth={2}
                                                radius={i === STATUS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Panel>
                    <Panel title="Answer time per day" cap="End to end, including retrieval and verification" className="min-h-[200px] flex-1 xl:min-h-0"
                        right={<Legend items={[{ label: 'p50', color: 'var(--s-1)' }, { label: 'p95', color: 'var(--s-2)' }]} />}>
                        {d.answers === 0 ? <Empty>No timings yet.</Empty> : (
                            <div className="h-full min-h-[150px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={daily} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
                                        <CartesianGrid vertical={false} />
                                        <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} minTickGap={20} />
                                        <YAxis tickFormatter={(v) => ms(Number(v))} tickLine={false} axisLine={false} width={52} />
                                        <Tooltip content={<ChartTip title={shortDay} format={ms} />} cursor={{ stroke: 'var(--a-line-strong)' }} />
                                        <Line dataKey="p50" name="p50" stroke="var(--s-1)" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: 'var(--a-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                                        <Line dataKey="p95" name="p95" stroke="var(--s-2)" strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: 'var(--a-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Panel>
                </div>

                <div className="flex min-h-0 flex-col gap-3">
                    <Panel title="Confidence of grounded answers" cap="How sure the pipeline was, in tenths" className="min-h-[180px] flex-1 xl:min-h-0">
                        {grounded === 0 ? <Empty>No grounded answers yet.</Empty> : (
                            <div className="h-full min-h-[130px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={d.confidence} margin={{ top: 6, right: 4, bottom: 0, left: -24 }} barCategoryGap="12%">
                                        <CartesianGrid vertical={false} />
                                        <XAxis dataKey="bin" tickLine={false} />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                        <Tooltip content={<ChartTip title={(l) => `confidence ${l}–${(Number(l) + 0.1).toFixed(1)}`} />} cursor={{ fill: 'var(--a-line)' }} />
                                        <Bar dataKey="answers" name="Answers" fill="var(--s-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Panel>
                    <Panel title="Pipeline stages" cap="p50 · p95 since the server started" className="min-h-[180px] flex-1 xl:min-h-0">
                        {stageRows.length === 0 ? <Empty>No requests since the server started.</Empty> : (
                            <ul className="space-y-1.5" aria-label="Per-stage latency">
                                {stageRows.map(([name, s]) => (
                                    <li key={name} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-2 text-[11px]">
                                        <span className="a-ink truncate font-semibold">{name}</span>
                                        <span className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--a-line)' }}><span className="block h-full rounded-full" style={{ width: `${Math.max(3, ((s.p95 ?? 0) / maxStage) * 100)}%`, background: 'var(--s-1)' }} /></span>
                                        <span className="a-num a-ink-2 text-right text-[10px]">{ms(s.p50)} · {ms(s.p95)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Models and failures" className="shrink-0">
                        <ul className="space-y-1 text-[11px]">
                            {d.models.length === 0 && Object.keys(d.failures).length === 0 && <li className="a-muted">Nothing logged yet.</li>}
                            {d.models.map((x) => <li key={x.model} className="flex justify-between gap-2"><span className="a-ink truncate font-mono">{x.model}</span><b className="a-num a-ink">{x.answers}</b></li>)}
                            {Object.entries(d.failures).map(([f, n]) => <li key={f} className="flex justify-between gap-2"><span style={{ color: 'var(--critical)' }}>{f.replace(/_/g, ' ')}</span><b className="a-num a-ink">{n}</b></li>)}
                        </ul>
                    </Panel>
                </div>

                <Panel title="Evaluation results" cap="Committed runs in docs/eval, reproducible from the README" className="min-h-[420px] xl:min-h-0">
                    {Object.keys(e).length === 0 ? <Empty>No evaluation files found.</Empty> : (
                        <div className="space-y-3 text-[11px]">
                            {e.retrieval && (
                                <table className="w-full">
                                    <caption className="a-cap mb-1 text-left">Retrieval (labelled questions)</caption>
                                    <thead><tr className="a-muted text-left"><th className="font-semibold">Config</th><th className="text-right font-semibold">Recall@3</th><th className="text-right font-semibold">MRR</th></tr></thead>
                                    <tbody>{e.retrieval.map((r) => (
                                        <tr key={r.config} style={{ borderTop: '1px solid var(--a-line)' }}>
                                            <td className="a-ink py-0.5">{label(r.config)}</td><td className="a-num a-ink text-right">{pct(r['recall@3'], 1)}</td><td className="a-num a-ink text-right">{r.mrr?.toFixed(3)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            )}
                            {e.evidence_gate && <Fact title="Evidence gate" rows={[['In-scope answered', pct(e.evidence_gate.inscope_answered, 1)], ['Off-topic refused', pct(e.evidence_gate.oos_refused, 1)], ['Threshold', String(e.evidence_gate.threshold)]]} />}
                            {e.injection_guard && <Fact title="Injection guard" rows={[['Attacks rejected', `${e.injection_guard.rejected} / ${e.injection_guard.queries}`]]} />}
                            {e.generation && <Fact title="Generated answers" rows={[['Faithfulness', pct(e.generation.faithfulness_shipped, 1)], ['Citation accuracy', pct(e.generation.citation_accuracy, 1)], ['Off-topic refusal', pct(e.generation.oos_refusal_rate, 1)]]} />}
                            {e.teachback && <Fact title="Teach it back (pass rate)" rows={Object.entries(e.teachback).map(([k2, v]) => [`${k2} explanations`, pct(v.pass_rate, 1)] as [string, string])} />}
                            {e.sketch && <Fact title="Draw it: invalid drawings caught" rows={[['Rules judge', pct(e.sketch.neuro_symbolic_detects_invalid, 1)], ['Model judges', pct(e.sketch.direct_detects_invalid, 1)]]} />}
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );
}

function Fact({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <div>
            <p className="a-cap mb-1">{title}</p>
            <ul className="a-row space-y-0.5">
                {rows.map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="a-ink-2">{k}</span><b className="a-num a-ink">{v}</b></li>)}
            </ul>
        </div>
    );
}
