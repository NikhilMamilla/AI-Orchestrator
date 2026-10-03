import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { ago } from './format';
import { useNow } from './useLive';

const TONES = ['#f3dc8f', '#bdeed6', '#ddd6ff', '#ffd2c8', '#b9dcff'];
const SHAPES = ['28px 12px 28px 12px', '12px 28px 12px 28px'];
const hash = (t: string) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** "Answer quality" -> "Answer" + a marker on "quality", like every learner page heading. */
function Marked({ text, dot = false }: { text: string; dot?: boolean }) {
    const words = text.trim().split(' ');
    const last = words.pop() ?? '';
    return <>{words.length ? `${words.join(' ')} ` : ''}<span className="max-mark">{last}{dot ? '.' : ''}</span></>;
}

export function PageHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
    return (
        <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end" style={{ ['--max' as string]: '#f3dc8f' }}>
            <div className="min-w-0">
                <h1 className="a-title a-ink"><Marked text={title} dot /></h1>
                <p className="max-sub mt-1 max-w-3xl" style={{ fontSize: '0.98rem' }}>{sub}</p>
            </div>
            {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
        </header>
    );
}

export function Panel({ title, cap, right, className = '', bodyClass = '', tone, children }: {
    title: string; cap?: string; right?: React.ReactNode; className?: string; bodyClass?: string; tone?: string; children: React.ReactNode;
}) {
    const h = hash(title);
    const t = tone ?? TONES[h % TONES.length];
    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            className={`a-panel flex min-h-0 flex-col p-4 ${className}`} style={{ borderRadius: SHAPES[h % 2], ['--max' as string]: t }}>
            <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: t }} aria-hidden>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1b1405]" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="a-head a-ink truncate text-[1.02rem] font-bold leading-tight"><Marked text={title} /></h2>
                        {cap && <p className="a-ink-2 truncate text-[11px]">{cap}</p>}
                    </div>
                </div>
                {right}
            </div>
            <div className={`a-scroll min-h-0 flex-1 overflow-y-auto pb-1 pr-1 ${bodyClass}`}>{children}</div>
        </motion.section>
    );
}

/** A headline number with its 14-day trend. The sparkline is decoration for the number beside it, so it has no axis. */
export function Kpi({ label, value, sub, series, color = 'var(--s-1)' }: {
    label: string; value: string; sub?: string; series?: (number | null)[]; color?: string;
}) {
    const pts = (series ?? []).map((v) => v ?? 0);
    const max = Math.max(1, ...pts);
    const w = 84, h = 26;
    const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, pts.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
    return (
        <div className="a-tile flex min-w-0 flex-col justify-between gap-1.5 px-3 py-2.5" style={{ ['--max' as string]: TONES[hash(label) % TONES.length] }}>
            <p className="a-cap truncate">{label}</p>
            <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-heading a-ink truncate text-[1.4rem] font-extrabold leading-none">{value}</p>
                    {sub && <p className="a-ink-2 mt-1 truncate text-[10px]">{sub}</p>}
                </div>
                {pts.length > 1 && (
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" role="img" aria-label={`${label}, last ${pts.length} days: ${pts.join(', ')}`}>
                        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx={w} cy={h - 2 - (pts[pts.length - 1] / max) * (h - 4)} r={3} fill={color} stroke="var(--max-line)" strokeWidth={1.5} />
                    </svg>
                )}
            </div>
        </div>
    );
}

const STATUS = {
    good: { cls: 'a-good', Icon: CheckCircle2 },
    critical: { cls: 'a-critical', Icon: XCircle },
    warning: { cls: 'a-warning', Icon: AlertTriangle },
    serious: { cls: 'a-serious', Icon: AlertTriangle },
    idle: { cls: 'a-idle', Icon: CircleDashed },
} as const;

/** Status always carries an icon and a word, never colour alone. */
export function Status({ level, label }: { level: keyof typeof STATUS; label: string }) {
    const { cls, Icon } = STATUS[level];
    return (
        <span className={`a-status ${cls}`}>
            <i aria-hidden />
            <Icon className="h-3.5 w-3.5 a-ink-2" aria-hidden />
            <span className="a-ink">{label}</span>
        </span>
    );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
    return (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
            {items.map((it) => (
                <li key={it.label} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} aria-hidden />
                    <span className="a-ink-2">{it.label}</span>
                    {it.value && <b className="a-num a-ink">{it.value}</b>}
                </li>
            ))}
        </ul>
    );
}

interface TipProps { active?: boolean; label?: string | number; payload?: { name?: string; value?: number | string | null; color?: string }[]; format?: (v: number) => string; title?: (l: string) => string }

export function ChartTip({ active, label, payload, format, title }: TipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="a-tip">
            <p className="a-cap mb-1">{title ? title(String(label)) : label}</p>
            {payload.map((p) => (
                <p key={p.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} aria-hidden />
                    <span className="a-ink-2">{p.name}</span>
                    <b className="a-num ml-auto pl-3">{p.value == null ? '–' : format ? format(Number(p.value)) : p.value}</b>
                </p>
            ))}
        </div>
    );
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
    <p className="a-muted flex items-center gap-2 text-xs" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {label}</p>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
    <p className="a-row a-muted text-xs leading-relaxed">{children}</p>
);

export const ErrorLine = ({ text }: { text: string }) => (
    <p role="alert" className="a-row text-xs" style={{ color: 'var(--critical)' }}>{text}</p>
);

export function LiveChip({ updated, loading, onRefresh }: { updated: number; loading: boolean; onRefresh: () => void }) {
    const now = useNow();
    return (
        <>
            <span className="max-sticker a-status a-good !flex !items-center !rounded-full !px-3 !py-1 !tracking-[0.12em]" style={{ background: '#bdeed6' }} role="status"><i aria-hidden />Live · {updated ? ago(updated, now) : 'connecting'}</span>
            <button type="button" className="a-btn" onClick={onRefresh} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
            </button>
        </>
    );
}

export function RangeSeg({ value, onChange }: { value: number; onChange: (d: number) => void }) {
    return (
        <div className="a-seg" role="group" aria-label="Date range">
            {[7, 14, 30].map((d) => (
                <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}>{d} days</button>
            ))}
        </div>
    );
}

/** Renders on <body>, outside any blurred or animated parent (those trap `position: fixed`), keeping the console's styles. */
export function Overlay({ children }: { children: React.ReactNode }) {
    return createPortal(<div className="admin">{children}</div>, document.body);
}

/** A sticker that slides in from the right for drill-downs. Esc or the backdrop closes it. */
export function Drawer({ open, title, sub, onClose, children }: { open: boolean; title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    return (
        <Overlay>
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[100] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button type="button" aria-label="Close" className="a-scrim absolute inset-0" onClick={onClose} />
                    <motion.aside role="dialog" aria-modal="true" aria-label={title}
                        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="a-panel a-dialog relative m-3 flex w-full max-w-xl flex-col p-5" style={{ borderRadius: '28px 12px 28px 12px', ['--max' as string]: '#b9dcff' }}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="a-title a-ink !text-[1.5rem]"><Marked text={title} /></h2>
                                {sub && <p className="a-ink-2 mt-0.5 text-xs">{sub}</p>}
                            </div>
                            <button type="button" className="a-btn !h-8 !w-8 !p-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
                        </div>
                        <div className="a-scroll min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
                    </motion.aside>
                </motion.div>
            )}
        </AnimatePresence>
        </Overlay>
    );
}

export function ExportButton({ onClick, label = 'CSV' }: { onClick: () => void; label?: string }) {
    return <button type="button" className="a-btn" onClick={onClick}><Download className="h-3.5 w-3.5" aria-hidden /> {label}</button>;
}
