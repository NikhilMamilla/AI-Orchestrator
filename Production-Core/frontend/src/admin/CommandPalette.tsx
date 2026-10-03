import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { Overlay } from './ui';
import './admin.css';                     // the palette is also used on learner pages

export interface Command { label: string; hint: string; to: string; keywords?: string }

/** Ctrl/⌘ + K: jump to any page or action of the console by typing. */
export default function CommandPalette({ commands }: { commands: Command[] }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [i, setI] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
                setQ('');
                setI(0);
            } else if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

    const hits = useMemo(() => {
        const t = q.trim().toLowerCase();
        return t ? commands.filter((c) => `${c.label} ${c.hint} ${c.keywords ?? ''}`.toLowerCase().includes(t)) : commands;
    }, [q, commands]);
    const go = (c: Command | undefined) => { if (c) { setOpen(false); navigate(c.to); } };

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} aria-label="Search the console (Ctrl+K)"
                className="hidden h-9 w-48 items-center gap-2 rounded-full border-2 border-[rgb(var(--c-navy)/0.18)] bg-[rgb(var(--c-warm-50))] pl-3 pr-1 text-left text-xs text-campus-warm-500 transition-colors hover:border-[var(--max-line)] md:inline-flex">
                <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1 truncate">Search pages…</span>
                <kbd className="pill-lit shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-[#1b1405]">Ctrl K</kbd>
            </button>
            <Overlay>
            <AnimatePresence>
                {open && (
                    <motion.div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <button type="button" aria-label="Close" className="a-scrim absolute inset-0" onClick={() => setOpen(false)} />
                        <motion.div role="dialog" aria-modal="true" aria-label="Command palette" initial={{ y: -10, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -10, opacity: 0 }}
                            className="a-panel a-dialog relative w-full max-w-lg p-3" style={{ borderRadius: '24px 10px 24px 10px', ['--max' as string]: '#f3dc8f' }}>
                            <div className="relative">
                                <Search className="a-ink-2 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
                                <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} aria-label="Search pages and actions"
                                    placeholder="Search pages and actions…" className="a-input !h-11 !pl-9 !text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)); }
                                        if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
                                        if (e.key === 'Enter') { e.preventDefault(); go(hits[i]); }
                                    }} />
                            </div>
                            <ul className="a-scroll mt-2 max-h-[50vh] space-y-1 overflow-y-auto" role="listbox" aria-label="Results">
                                {hits.length === 0 && <li className="a-muted px-3 py-2 text-xs">No match.</li>}
                                {hits.map((c, n) => (
                                    <li key={c.label} role="option" aria-selected={n === i}>
                                        <button type="button" onMouseEnter={() => setI(n)} onClick={() => go(c)}
                                            className="flex w-full items-center justify-between gap-3 rounded-full px-3 py-2 text-left text-xs"
                                            style={n === i ? { background: 'linear-gradient(180deg, #fbe9a8, #f0cf6a 55%, #dcb24a)', color: '#1b1405' } : undefined}>
                                            <span><b>{c.label}</b> <span className={n === i ? '' : 'a-muted'}>· {c.hint}</span></span>
                                            {n === i && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            </Overlay>
        </>
    );
}
