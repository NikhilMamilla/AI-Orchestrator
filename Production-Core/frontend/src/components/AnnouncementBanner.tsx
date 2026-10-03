import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Megaphone, X } from 'lucide-react';
import type { LearnerAnnouncement } from '../lib/learning';

/** The newest live message from the Kiddoo team, under the top bar on every page. Dismissing hides that one message. */
export function AnnouncementBanner({ banner, onDismiss }: { banner: LearnerAnnouncement | null; onDismiss: (id: number) => void }) {
    return (
        <AnimatePresence>
            {banner && (
                <motion.div key={banner.id} role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="flex shrink-0 items-start gap-2.5 rounded-[18px_8px_18px_8px] border-2 border-[var(--max-line)] px-4 py-2 text-xs font-semibold text-[#1b1405] shadow-[3px_3px_0_var(--max-line)]"
                    style={{ background: banner.level === 'warning' ? '#ffd2c8' : '#bdeed6' }}>
                    <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 leading-relaxed"><span className="mr-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">From the Kiddoo team</span>{banner.text}</span>
                    <button type="button" onClick={() => onDismiss(banner.id)} aria-label="Dismiss this announcement" className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-black/10">
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The bell: every announcement of the last 30 days, with an unread count. Opening it marks them read. */
export function AnnouncementInbox({ items, unread, onOpen }: { items: LearnerAnnouncement[]; unread: number; onOpen: () => void }) {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('mousedown', close);
        window.addEventListener('keydown', close);
        return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
    }, [open]);

    return (
        <div ref={box} className="relative">
            <button type="button" onClick={() => { setOpen((o) => !o); onOpen(); }} aria-label={`Announcements${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full neo-raised text-campus-navy">
                <Bell className="h-[17px] w-[17px]" aria-hidden />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[#eb6834] px-1 font-mono text-[9px] font-bold text-white">{unread}</span>}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                        className="sticker absolute right-0 top-11 z-50 w-80 p-3 max-sm:fixed max-sm:inset-x-0 max-sm:top-16 max-sm:mx-auto max-sm:w-[min(20rem,calc(100vw-2rem))]" style={{ borderRadius: '22px 8px 22px 8px', ['--max' as string]: '#bdeed6' }}>
                        <p className="mb-2 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">From the Kiddoo team</p>
                        {items.length === 0 ? <p className="j-row text-xs text-campus-warm-500">No announcements in the last 30 days.</p> : (
                            <ul className="no-scrollbar max-h-72 space-y-1.5 overflow-y-auto">
                                {items.map((a) => (
                                    <li key={a.id} className="j-row text-xs" style={{ opacity: a.live ? 1 : 0.65 }}>
                                        <p className="mb-0.5 flex items-center gap-1.5 text-[10px] text-campus-warm-500">
                                            <span className="h-2 w-2 rounded-full" style={{ background: a.level === 'warning' ? '#ec835a' : '#0ca30c' }} aria-hidden />
                                            {a.level === 'warning' ? 'Important' : 'Update'} · {when(a.created_at)}{a.live ? '' : ' · ended'}
                                        </p>
                                        <p className="leading-snug text-campus-navy">{a.text}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
