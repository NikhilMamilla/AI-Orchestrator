import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ProgressPoint {
    date: string;
    mastery: number;
    answers?: number;
    accuracy?: number | null;
}

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Tip({ active, payload }: { active?: boolean; payload?: { payload: ProgressPoint & { name: string } }[] }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
        <div className="rounded-[14px] border-2 border-[var(--max-line)] bg-[rgb(var(--c-warm-50))] px-3 py-2 text-xs text-campus-navy shadow-[3px_3px_0_#ff8a73]">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-campus-warm-500">{day(p.date)}</p>
            <p>Overall mastery <b>{p.mastery.toFixed(1)}%</b></p>
            <p>{p.answers ?? 0} answer{p.answers === 1 ? '' : 's'}{p.accuracy != null ? ` · ${p.accuracy}% right` : ''}</p>
        </div>
    );
}

/** Overall mastery across the whole curriculum, day by day, with that day's answers underneath. */
export default function ProgressChart({ data }: { data: ProgressPoint[] }) {
    if (!data?.length || data.every((d) => d.answers !== undefined && !d.answers && !d.mastery)) {
        return (
            <div className="flex h-full min-h-[160px] items-center justify-center px-6 text-center">
                <p className="max-sub" style={{ fontSize: '1.1rem' }}>Your mastery curve appears after you answer your first check question.</p>
            </div>
        );
    }
    const rows = data.map((d) => ({ ...d, name: day(d.date) }));
    const top = Math.max(...rows.map((r) => r.mastery));
    const ceiling = Math.min(100, Math.max(5, Math.ceil((top * 1.3) / 5) * 5));       // zoom so small progress is visible

    return (
        <div className="flex h-full min-h-[200px] w-full flex-col">
            <div className="min-h-[130px] flex-1">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={rows} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                        <defs>
                            <linearGradient id="campusGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" style={{ stopColor: '#ff8a73', stopOpacity: 0.55 }} />
                                <stop offset="100%" style={{ stopColor: '#f3dc8f', stopOpacity: 0.05 }} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--c-warm-200))" />
                        <XAxis dataKey="name" hide />
                        <YAxis axisLine={false} tickLine={false} domain={[0, ceiling]} tickFormatter={(v) => `${v}%`}
                            tick={{ fill: 'rgb(var(--c-warm-400))', fontSize: 10, fontFamily: 'JetBrains Mono' }} width={44} />
                        <Tooltip content={<Tip />} cursor={{ stroke: 'rgb(var(--c-gold))', strokeDasharray: '4 4' }} />
                        <Area type="monotone" dataKey="mastery" stroke="var(--max-line)" strokeWidth={2.5} fill="url(#campusGradient)"
                            dot={(p: { cx?: number; cy?: number; index?: number; payload?: ProgressPoint }) =>
                                (p.payload?.answers ?? 1) ? <circle key={p.index} cx={p.cx} cy={p.cy} r={4.5} fill="#f3dc8f" stroke="var(--max-line)" strokeWidth={2} /> : <g key={p.index} />}
                            activeDot={{ r: 6, fill: '#ff8a73', stroke: 'var(--max-line)', strokeWidth: 2 }} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="h-[52px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={rows} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18}
                            tick={{ fill: 'rgb(var(--c-warm-400))', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                        <YAxis hide allowDecimals={false} width={44} />
                        <Tooltip content={<Tip />} cursor={{ fill: 'rgb(var(--c-navy) / 0.06)' }} />
                        <Bar dataKey="answers" fill="#6da7ec" stroke="var(--max-line)" strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <p className="flex shrink-0 justify-between px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-campus-warm-500">
                <span>Line: overall mastery</span><span>Bars: answers per day</span>
            </p>
        </div>
    );
}
