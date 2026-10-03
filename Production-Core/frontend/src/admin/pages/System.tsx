import { useState } from 'react';
import { Eraser, Link2Off, Trash2 } from 'lucide-react';
import { RagError } from '../../lib/rag';
import { adminSystem, adminTool } from '../api';
import { useLive } from '../useLive';
import { ErrorLine, LiveChip, Loading, PageHead, Panel, Status } from '../ui';

const TOOLS = [
    { id: 'clear-cache', icon: Eraser, title: 'Clear the answer cache', text: 'Model answers are cached for an hour. Clear it after changing a source so the next answer is fresh.' },
    { id: 'prune-shares', icon: Link2Off, title: 'Remove dead share links', text: 'Deletes teacher/parent links that have expired or were revoked. Live links are untouched.' },
    { id: 'prune-gaps', icon: Trash2, title: 'Prune old content gaps', text: 'Deletes refused-question records older than the 90-day retention window.' },
] as const;

export default function System() {
    const live = useLive(adminSystem, 30_000);
    const s = live.data;
    const [confirm, setConfirm] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

    const run = async (tool: (typeof TOOLS)[number]['id']) => {
        setBusy(tool);
        setResult(null);
        try {
            const r = await adminTool(tool);
            setResult({ ok: true, text: r.message });
        } catch (e) {
            setResult({ ok: false, text: e instanceof RagError ? e.message : 'That tool failed.' });
        } finally {
            setBusy(null);
            setConfirm(null);
        }
    };

    return (
        <>
            <PageHead title="System" sub="Every service the tutor depends on, checked live. Settings show only whether they are set, never their values."
                right={<LiveChip updated={live.updated} loading={live.loading} onRefresh={() => void live.reload()} />} />
            {live.error && !s && <ErrorLine text={live.error} />}
            {!s ? <Loading /> : (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.3fr_1fr_1fr]">
                    <Panel title="Services" cap="Checked every 30 seconds (Judge0 at most once a minute)" className="min-h-[320px] xl:min-h-0">
                        <ul className="space-y-1.5">
                            {s.services.map((x) => (
                                <li key={x.name} className="a-row flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="a-ink text-xs font-bold">{x.name}{!x.required && <span className="a-muted font-normal"> · optional</span>}</p>
                                        <p className="a-muted truncate font-mono text-[10px]">{x.detail}</p>
                                    </div>
                                    <Status level={x.ok === true ? 'good' : x.ok === false ? (x.required ? 'critical' : 'warning') : 'idle'}
                                        label={x.ok === true ? 'Up' : x.ok === false ? 'Down' : 'Idle'} />
                                </li>
                            ))}
                        </ul>
                        {s.docs_without_passages > 0 && (
                            <p className="a-row mt-2 text-[11px]"><Status level="serious" label="Needs action" /> <span className="a-ink-2">{s.docs_without_passages} document(s) have no passages.</span></p>
                        )}
                    </Panel>

                    <div className="flex min-h-0 flex-col gap-3">
                        <Panel title="Environment" className="shrink-0">
                            <ul className="space-y-1 text-[11px]">
                                <li className="flex justify-between"><span className="a-ink-2">Mode</span><b className="a-num a-ink">{s.env}</b></li>
                                <li className="flex justify-between"><span className="a-ink-2">Auth bypass</span>
                                    <Status level={s.auth_disabled ? 'critical' : 'good'} label={s.auth_disabled ? 'On (dev only)' : 'Off'} /></li>
                                <li className="flex justify-between"><span className="a-ink-2">Smallest group shown</span><b className="a-num a-ink">{s.min_group} learner{s.min_group > 1 ? 's' : ''}</b></li>
                            </ul>
                        </Panel>
                        <Panel title="Settings" cap="Set or missing; values are never sent to the browser" className="min-h-[200px] flex-1 xl:min-h-0">
                            <ul className="grid grid-cols-1 gap-1">
                                {s.settings.map((x) => (
                                    <li key={x.name} className="flex items-center justify-between gap-2 text-[11px]">
                                        <code className="a-ink truncate">{x.name}</code>
                                        <Status level={x.set ? 'good' : 'idle'} label={x.set ? 'Set' : 'Missing'} />
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                        <Panel title="Admins" cap="From ADMIN_EMAILS; each must verify their email" className="shrink-0">
                            <ul className="space-y-1 text-[11px]">
                                {s.admins.map((a) => (
                                    <li key={a} className="flex items-center justify-between gap-2">
                                        <span className="a-ink truncate">{a}</span>
                                        {a === s.you.email?.toLowerCase() && <Status level={s.you.verified ? 'good' : 'warning'} label={s.you.verified ? 'You · verified' : 'You · not verified'} />}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    </div>

                    <Panel title="Admin tools" cap="Each one asks before it runs" className="min-h-[320px] xl:min-h-0">
                        <ul className="space-y-2">
                            {TOOLS.map((t) => (
                                <li key={t.id} className="a-row">
                                    <p className="a-ink flex items-center gap-2 text-xs font-bold"><t.icon className="h-3.5 w-3.5 a-gold" aria-hidden /> {t.title}</p>
                                    <p className="a-muted mt-1 text-[11px] leading-relaxed">{t.text}</p>
                                    <div className="mt-2 flex gap-2">
                                        {confirm === t.id ? (
                                            <>
                                                <button type="button" className="a-btn a-btn-gold" disabled={busy !== null} onClick={() => void run(t.id)}>{busy === t.id ? 'Running…' : 'Yes, run it'}</button>
                                                <button type="button" className="a-btn" onClick={() => setConfirm(null)}>Cancel</button>
                                            </>
                                        ) : (
                                            <button type="button" className="a-btn" onClick={() => { setConfirm(t.id); setResult(null); }}>Run</button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {result && <p role={result.ok ? 'status' : 'alert'} className="a-row mt-2 text-[11px] font-semibold" style={{ color: result.ok ? 'var(--a-mint)' : 'var(--critical)' }}>{result.text}</p>}
                    </Panel>
                </div>
            )}
        </>
    );
}
