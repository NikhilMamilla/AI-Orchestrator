import { Download } from 'lucide-react';
import { authed, RagError } from '../../lib/rag';
import type { StudyReport } from '../../lib/learning';
import { num, pct } from '../format';
import { useLive } from '../useLive';
import { Empty, ErrorLine, Kpi, LiveChip, Loading, PageHead, Panel, Status } from '../ui';

const MIN_COMPLETERS = 10;           // the study refuses to claim an effect below this many completers (README)

async function loadReport(): Promise<StudyReport> {
    const r = await authed('/learning/study/admin/report');
    if (!r.ok) throw new RagError('Could not load the study report.', r.status);
    return r.json();
}

async function exportCsv() {
    const r = await authed('/learning/study/admin/export.csv');
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    Object.assign(document.createElement('a'), { href: url, download: 'kiddoo-study.csv' }).click();
    URL.revokeObjectURL(url);
}

export default function Study() {
    const live = useLive(loadReport, 60_000);
    const s = live.data;
    const steps = s ? [
        { label: 'Joined', n: s.joined },
        { label: 'Pre-test done', n: s.pre_done },
        { label: 'Both tests done', n: s.completed },
    ] : [];
    const top = Math.max(1, s?.joined ?? 1);
    const res = s?.result;

    return (
        <>
            <PageHead title="Evidence Lab study" sub="The opt-in pre/post test: does learning with Kiddoo move scores? Anonymous; identities never leave the server."
                right={<>
                    <LiveChip updated={live.updated} loading={live.loading} onRefresh={() => void live.reload()} />
                    <button type="button" className="a-btn a-btn-gold" onClick={() => void exportCsv()} disabled={!s?.completed}><Download className="h-3.5 w-3.5" aria-hidden /> Export CSV</button>
                </>} />
            {live.error && !s && <ErrorLine text={live.error} />}
            {!s ? <Loading /> : (
                <>
                    <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-4">
                        <Kpi label="Joined" value={num(s.joined)} sub="gave consent" />
                        <Kpi label="Completed" value={num(s.completed)} sub={`of ${MIN_COMPLETERS} needed to claim anything`} />
                        <Kpi label="Mean before → after" value={res?.mean_pre == null ? '–' : `${pct(res.mean_pre)} → ${pct(res.mean_post)}`} sub="pre-test vs post-test" />
                        <Kpi label="Mean gain" value={res?.mean_gain == null ? '–' : `${res.mean_gain >= 0 ? '+' : ''}${Math.round(res.mean_gain * 100)} pts`} sub={res?.ci95 ? `95% CI [${Math.round(res.ci95[0] * 100)}, ${Math.round(res.ci95[1] * 100)}]` : 'no interval yet'} />
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
                        <Panel title="Funnel" cap="Where learners stop" className="min-h-[260px] lg:min-h-0">
                            {s.joined === 0 ? <Empty>Nobody has joined yet. Learners join from the Evidence Lab page.</Empty> : (
                                <ul className="space-y-3">
                                    {steps.map((st) => (
                                        <li key={st.label}>
                                            <div className="mb-1 flex justify-between text-[11px]"><span className="a-ink font-semibold">{st.label}</span><b className="a-num a-ink">{st.n} · {pct(st.n / top)}</b></div>
                                            <span className="block h-3 overflow-hidden rounded-[4px]" style={{ background: 'var(--a-line)' }}>
                                                <span className="block h-full rounded-[4px]" style={{ width: `${Math.max(2, (st.n / top) * 100)}%`, background: 'var(--s-1)' }} />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>

                        <Panel title="Result" cap="Paired statistics over learners who finished both tests" className="min-h-[260px] lg:min-h-0">
                            <div className="mb-3">
                                <Status level={s.completed >= MIN_COMPLETERS ? 'good' : 'idle'}
                                    label={s.completed >= MIN_COMPLETERS ? 'Enough completers to report' : `Waiting: ${s.completed} of ${MIN_COMPLETERS} completers`} />
                            </div>
                            <ul className="space-y-1.5 text-[11px]">
                                {[
                                    ['Completers (n)', num(res?.n)],
                                    ['Normalised gain', res?.normalised_gain == null ? '–' : res.normalised_gain.toFixed(2)],
                                    ["Effect size (Cohen's dz)", res?.cohens_dz == null ? '–' : res.cohens_dz.toFixed(2)],
                                    ['p-value (paired t)', res?.p_value == null ? '–' : res.p_value.toFixed(3)],
                                    ['Items per test', String(s.design.items_per_test)],
                                    ['Control group', s.design.control_group ? 'yes' : 'no (pre/post only)'],
                                ].map(([k, v]) => <li key={k} className="a-row flex justify-between gap-2 !py-1.5"><span className="a-ink-2">{k}</span><b className="a-num a-ink">{v}</b></li>)}
                            </ul>
                            <p className="a-row a-ink mt-2 text-[11px] leading-relaxed">{res?.verdict}</p>
                            <p className="a-cap mb-1 mt-3">Concepts tested</p>
                            <p className="a-ink-2 text-[11px]">{s.design.concepts.join(' · ')}</p>
                        </Panel>
                    </div>
                </>
            )}
        </>
    );
}
