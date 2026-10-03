import { adminEngagement, type Engagement as E } from '../api';
import { downloadCsv, gated, num, pct, shortDay } from '../format';
import { useLive } from '../useLive';
import { Empty, ErrorLine, ExportButton, Kpi, Legend, LiveChip, Loading, PageHead, Panel } from '../ui';

const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'];
const step = (v: number, max: number) => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 4)));
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function Engagement() {
    const live = useLive(adminEngagement, 60_000);
    const d = live.data;
    const exportCsv = () => d && downloadCsv('kiddoo-retention.csv', d.cohorts.map((c) => ({
        week_of: c.week_of, learners: c.learners ?? `<${d.min_group}`,
        ...Object.fromEntries(c.retention.map((r, i) => [`week_${i}`, r == null ? '' : r])),
    })));
    return (
        <>
            <PageHead title="Engagement" sub="Do learners come back, and when do they study? Retention by the week of each learner's first answer."
                right={<><LiveChip updated={live.updated} loading={live.loading} onRefresh={() => void live.reload()} /><ExportButton onClick={exportCsv} /></>} />
            {live.error && !d && <ErrorLine text={live.error} />}
            {!d ? <Loading /> : <Body d={d} />}
        </>
    );
}

function Body({ d }: { d: E }) {
    const k = d.min_group;
    const latest = [...d.cohorts].reverse().find((c) => c.retention[1] != null);
    const max = d.grid ? Math.max(1, ...d.grid.flat()) : 1;
    return (
        <>
            <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Learners who answered" value={gated(d.learners, k)} sub="at least one quiz answer" />
                <Kpi label="Answers counted" value={num(d.answers)} sub="feed the study-time grid" />
                <Kpi label="Came back in week 2" value={latest ? pct(latest.retention[1]) : '–'} sub={latest ? `cohort of ${shortDay(latest.week_of)}` : 'no finished cohort yet'} />
                <Kpi label="Busiest time" value={d.peak ? `${d.peak.day} ${hourLabel(d.peak.hour)}` : '–'} sub="learners' local time" />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr_1.35fr]">
                <Panel title="Weekly retention" cap="Share of each week's new learners active again N weeks later" className="min-h-[300px] xl:min-h-0"
                    right={<Legend items={[{ label: 'lower', color: SEQ[1] }, { label: 'higher', color: SEQ[4] }]} />}>
                    <table className="w-full border-separate text-[11px]" style={{ borderSpacing: '3px' }}>
                        <caption className="sr-only">Retention by cohort week</caption>
                        <thead>
                            <tr>
                                <th className="a-cap text-left font-bold">Started</th>
                                <th className="a-cap text-right font-bold">Learners</th>
                                {Array.from({ length: d.weeks }, (_, w) => <th key={w} className="a-cap text-center font-bold">W{w}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {d.cohorts.map((c) => (
                                <tr key={c.week_of}>
                                    <th scope="row" className="a-ink whitespace-nowrap pr-1 text-left font-semibold">{shortDay(c.week_of)}</th>
                                    <td className="a-num a-ink pr-1 text-right">{gated(c.learners, k)}</td>
                                    {c.retention.map((r, w) => {
                                        const st = r == null ? 0 : step(r, 1);
                                        return (
                                            <td key={w}>
                                                <span title={r == null ? 'Not enough data' : `${pct(r)} active in week ${w}`}
                                                    className="a-num block rounded-[6px] py-1 text-center text-[10px] font-bold"
                                                    style={{ background: r == null ? 'transparent' : SEQ[st], color: st >= 3 ? 'var(--seq-ink-hi)' : 'var(--a-ink)', border: r == null ? '1.5px dashed var(--a-line)' : 'none' }}>
                                                    {r == null ? '' : pct(r)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="a-muted mt-2 text-[11px]">W0 is always 100%: the week each learner started. Dashed cells haven&rsquo;t happened yet.</p>
                </Panel>

                <Panel title="When learners study" cap="Quiz answers by weekday and hour (learners' local time)" className="min-h-[300px] xl:min-h-0"
                    right={<Legend items={[{ label: 'fewer', color: SEQ[1] }, { label: 'more', color: SEQ[4] }]} />}>
                    {!d.grid ? <Empty>Hidden until {k}+ learners have answered, so one person&rsquo;s routine is never shown.</Empty> : d.answers === 0 ? <Empty>No answers yet.</Empty> : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-separate" style={{ borderSpacing: '2px' }}>
                                <caption className="sr-only">Answers by weekday and hour</caption>
                                <thead>
                                    <tr>
                                        <th />
                                        {Array.from({ length: 24 }, (_, h) => <th key={h} className="a-muted text-center font-mono text-[8px] font-normal">{h % 3 === 0 ? h : ''}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.grid.map((row, i) => (
                                        <tr key={d.weekdays[i]}>
                                            <th scope="row" className="a-cap pr-1 text-left !text-[9px]">{d.weekdays[i]}</th>
                                            {row.map((v, h) => (
                                                <td key={h}><span title={`${d.weekdays[i]} ${hourLabel(h)}: ${v} answers`} className="block h-5 min-w-[10px] rounded-[4px]" style={{ background: SEQ[step(v, max)] }} /></td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );
}
