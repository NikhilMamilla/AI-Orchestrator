import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchRhythm, type Rhythm } from '../../lib/learning';

const SEQ = ['rgb(var(--c-navy) / 0.06)', '#b7d3f6', '#6da7ec', '#2a78d6', '#184f95'];
const step = (v: number, max: number) => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 4)));
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** The learner's own rhythm: when they study and how much, refreshed every minute while the page is open. */
export default function StudyRhythm() {
    const [r, setR] = useState<Rhythm | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        const load = () => fetchRhythm().then((d) => { if (live) { setR(d); setFailed(false); } }).catch(() => live && setFailed(true));
        void load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
        return () => { live = false; clearInterval(t); };
    }, []);

    if (!r) return failed
        ? <p className="text-xs text-campus-rose" role="alert">Couldn&rsquo;t load your rhythm right now.</p>
        : <p className="flex items-center gap-2 text-xs text-campus-warm-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;
    if (r.answers === 0) return <p className="j-row text-xs text-campus-warm-500">Answer a few check questions and your study rhythm appears here: when you study, how often, and how it&rsquo;s going.</p>;

    const max = Math.max(1, ...r.grid.flat());
    const maxW = Math.max(1, ...r.weekly.map((w) => w.answers));
    const stats = [
        { label: 'day streak', value: r.streak, tone: '#f3dc8f' },
        { label: 'active days', value: r.active_days, tone: '#bdeed6' },
        { label: 'busiest', value: r.peak ? `${r.peak.day} ${hour(r.peak.hour)}` : '–', tone: '#ddd6ff' },
    ];
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {stats.map((s) => <span key={s.label} className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: s.tone }}><b className="font-heading text-xs">{s.value}</b> {s.label}</span>)}
            </div>
            <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
                <div>
                    <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">When you study (your local time)</p>
                    <table className="w-full border-separate" style={{ borderSpacing: '2px' }}>
                        <caption className="sr-only">Your answers by weekday and hour</caption>
                        <tbody>
                            {r.grid.map((row, d) => (
                                <tr key={r.weekdays[d]}>
                                    <th scope="row" className="pr-1 text-left font-mono text-[9px] font-bold text-campus-warm-500">{r.weekdays[d]}</th>
                                    {row.map((v, h) => <td key={h}><span title={`${r.weekdays[d]} ${hour(h)}: ${v} answer${v === 1 ? '' : 's'}`} className="block h-3.5 rounded-[3px]" style={{ background: SEQ[step(v, max)] }} /></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-1 flex justify-between font-mono text-[9px] text-campus-warm-500"><span>00:00</span><span>12:00</span><span>23:00</span></p>
                </div>
                <div>
                    <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">Answers per week</p>
                    <div className="flex h-20 items-end gap-1" role="img" aria-label={r.weekly.map((w) => `${w.weeks_ago} weeks ago: ${w.answers}`).join(', ')}>
                        {r.weekly.map((w) => (
                            <div key={w.weeks_ago} className="flex flex-1 flex-col items-center gap-0.5" title={`${w.weeks_ago === 0 ? 'This week' : `${w.weeks_ago} week(s) ago`}: ${w.answers} answers${w.accuracy == null ? '' : `, ${Math.round(w.accuracy * 100)}% right`}`}>
                                <span className="w-full rounded-t-[4px] border-2 border-b-0 border-[var(--max-line)]" style={{ height: `${Math.max(3, (w.answers / maxW) * 64)}px`, background: w.weeks_ago === 0 ? '#f3dc8f' : '#6da7ec' }} />
                                <span className="font-mono text-[8px] text-campus-warm-500">{w.weeks_ago === 0 ? 'now' : `-${w.weeks_ago}`}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
