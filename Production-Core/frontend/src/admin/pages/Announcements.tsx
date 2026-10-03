import { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { RagError } from '../../lib/rag';
import { adminAudit, listAnnouncements, postAnnouncement, retractAnnouncement } from '../api';
import { useLive } from '../useLive';
import { Empty, ErrorLine, LiveChip, Loading, PageHead, Panel, Status } from '../ui';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ACTION: Record<string, string> = {
    upload: 'Uploaded a source', 'announcement:post': 'Posted an announcement', 'announcement:retract': 'Retracted an announcement',
    'tool:clear-cache': 'Cleared the answer cache', 'tool:prune-shares': 'Removed dead share links', 'tool:prune-gaps': 'Pruned old content gaps',
};

export default function Announcements() {
    const list = useLive(listAnnouncements, 30_000);
    const log = useLive(adminAudit, 30_000);
    const [text, setText] = useState('');
    const [level, setLevel] = useState<'info' | 'warning'>('info');
    const [days, setDays] = useState(7);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const post = async () => {
        setBusy(true);
        setMsg(null);
        try {
            await postAnnouncement(text.trim(), level, days);
            setText('');
            setMsg({ ok: true, text: 'Posted. Learners see it on their dashboard now.' });
            void list.reload();
            void log.reload();
        } catch (e) {
            setMsg({ ok: false, text: e instanceof RagError ? e.message : 'Could not post that.' });
        } finally {
            setBusy(false);
        }
    };
    const retract = async (id: number) => {
        try { await retractAnnouncement(id); } catch { /* the list refresh shows the real state */ }
        void list.reload();
        void log.reload();
    };

    return (
        <>
            <PageHead title="Announcements" sub="A short message every learner sees at the top of their dashboard, until it expires or you retract it. Every admin action is recorded in the audit log."
                right={<LiveChip updated={list.updated} loading={list.loading} onRefresh={() => { void list.reload(); void log.reload(); }} />} />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1fr_1fr]">
                <Panel title="New announcement" cap="Plain text, up to 280 characters" className="min-h-[300px] xl:min-h-0" tone="#f3dc8f">
                    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void post(); }}>
                        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={4} aria-label="Announcement text"
                            placeholder="e.g. New: a Dijkstra source is live. Ask about shortest paths!"
                            className="w-full resize-none rounded-[16px] border-2 p-3 text-[13px] outline-none" style={{ borderColor: 'var(--a-line-strong)', background: 'var(--a-surface-2)', color: 'var(--a-ink)' }} />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="a-seg" role="group" aria-label="Kind">
                                <button type="button" aria-pressed={level === 'info'} onClick={() => setLevel('info')}>Info</button>
                                <button type="button" aria-pressed={level === 'warning'} onClick={() => setLevel('warning')}>Warning</button>
                            </div>
                            <div className="a-seg" role="group" aria-label="Show for">
                                {[1, 3, 7, 14].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d}d</button>)}
                            </div>
                            <span className="a-num a-muted text-[10px]">{text.length}/280</span>
                        </div>

                        <p className="a-cap">Preview</p>
                        <div className="flex items-start gap-2 rounded-[16px] border-2 border-[var(--max-line)] px-3 py-2 text-xs" style={{ background: level === 'warning' ? '#ffd2c8' : '#bdeed6', color: '#1b1405' }}>
                            <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{text.trim() || 'Your message appears here.'}</span>
                        </div>

                        <button type="submit" className="a-btn a-btn-gold w-full !h-10" disabled={busy || !text.trim()}><Send className="h-3.5 w-3.5" aria-hidden /> Post to all learners</button>
                        {msg && <p role={msg.ok ? 'status' : 'alert'} className="text-[11px] font-semibold" style={{ color: msg.ok ? 'var(--a-mint)' : 'var(--critical)' }}>{msg.text}</p>}
                    </form>
                </Panel>

                <Panel title="Posted" cap="Newest first; only the newest live one is shown to learners" className="min-h-[300px] xl:min-h-0">
                    {list.error && !list.data ? <ErrorLine text={list.error} /> : !list.data ? <Loading /> : list.data.announcements.length === 0 ? <Empty>Nothing posted yet.</Empty> : (
                        <ul className="space-y-2">
                            {list.data.announcements.map((a) => (
                                <li key={a.id} className="a-row text-[11px]" style={{ opacity: a.live ? 1 : 0.6 }}>
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <Status level={a.live ? (a.level === 'warning' ? 'warning' : 'good') : 'idle'} label={a.live ? (a.level === 'warning' ? 'Live · warning' : 'Live') : 'Ended'} />
                                        {a.live && <button type="button" className="a-btn !h-7 !px-2.5 !text-[11px]" onClick={() => void retract(a.id)}>Retract</button>}
                                    </div>
                                    <p className="a-ink leading-snug">{a.text}</p>
                                    <p className="a-muted mt-1">{a.created_by} · {when(a.created_at)}{a.expires_at ? ` · until ${when(a.expires_at)}` : ''}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel title="Audit log" cap="Who did what, newest first" className="min-h-[300px] xl:min-h-0">
                    {log.error && !log.data ? <ErrorLine text={log.error} /> : !log.data ? <Loading /> : log.data.entries.length === 0 ? <Empty>No admin actions recorded yet.</Empty> : (
                        <ul className="space-y-1.5">
                            {log.data.entries.map((e, i) => (
                                <li key={`${e.created_at}-${i}`} className="a-row text-[11px]">
                                    <p className="a-ink font-semibold">{ACTION[e.action] ?? e.action}</p>
                                    <p className="a-muted">{e.actor} · {when(e.created_at)}</p>
                                    {Object.keys(e.detail).length > 0 && <p className="a-num a-ink-2 mt-0.5 truncate text-[10px]">{Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </>
    );
}
