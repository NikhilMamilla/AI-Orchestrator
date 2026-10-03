import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    BookOpen, Code2, FlaskConical, GraduationCap, LayoutDashboard, LogOut, Map, Menu, MessageSquareText, NotebookPen,
    SlidersHorizontal, Sparkles, Terminal, Workflow, X, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import ThemeToggle from './fx/ThemeToggle';

interface Item { icon: LucideIcon; label: string; path: string }

const PRIMARY: Item[] = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: MessageSquareText, label: 'Ask', path: '/ask' },
    { icon: BookOpen, label: 'Learn', path: '/learn' },
    { icon: Code2, label: 'Challenges', path: '/challenges' },
];
const SECONDARY: Item[] = [
    { icon: NotebookPen, label: 'Journal', path: '/journal' },
    { icon: Workflow, label: 'Visualize', path: '/visualize' },
    { icon: Map, label: 'Concepts', path: '/concepts' },
    { icon: Terminal, label: 'Playground', path: '/playground' },
    { icon: Sparkles, label: 'Insights', path: '/insights' },
    { icon: FlaskConical, label: 'Evidence Lab', path: '/lab' },
    { icon: SlidersHorizontal, label: 'Settings', path: '/settings' },
];
const ALL = [...PRIMARY, ...SECONDARY];          // admins reach their console from the top bar

const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;

function Brand({ compact = false }: { compact?: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--max-line)] bg-gradient-to-br from-[#f3dc8f] to-[#c9a64a]">
                <GraduationCap className="h-5 w-5 text-[#1b1405]" aria-hidden />
            </div>
            {!compact && (
                <div className="leading-tight">
                    <span className="block font-heading text-xl font-extrabold tracking-tight text-campus-navy">Kiddoo</span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-campus-warm-500">DSA tutor</span>
                </div>
            )}
        </div>
    );
}

/** `account={false}`: the page has a TopBar with the account and sign out, so the rail leaves them out. */
const Sidebar = ({ account = true }: { account?: boolean }) => {
    const [open, setOpen] = useState(false);
    // the top bar's hamburger (pages with a TopBar) opens the drawer; it closes on Escape and whenever the page changes
    useEffect(() => {
        const show = () => setOpen(true);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('kiddoo:nav', show);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('kiddoo:nav', show); window.removeEventListener('keydown', onKey); };
    }, []);
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    useEffect(() => setOpen(false), [pathname]);

    return (
        <>
            {/* ───────── Desktop: floating glass sidebar ───────── */}
            <div className="sticky top-0 hidden h-screen shrink-0 p-4 lg:block">
                <aside className="app-rail relative flex h-full w-64 flex-col overflow-hidden" aria-label="Main navigation">
                    <div className="px-6 pb-4 pt-5"><Brand /></div>

                    <nav className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-3 pb-4 pt-1" aria-label="Sections">
                        {ALL.map((item) => (
                            <NavLink key={item.path} to={item.path} className="group relative block rounded-2xl">
                                {({ isActive }) => (
                                    <span className={`relative z-10 flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${isActive ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:bg-campus-navy/5 hover:text-campus-navy'}`}>
                                        {isActive && (
                                            <motion.span layoutId="nav-pill" transition={spring} aria-hidden className="pill-lit absolute inset-0 -z-10 rounded-full" />
                                        )}
                                        <item.icon className="h-[18px] w-[18px] transition-transform group-hover:scale-110" aria-hidden />
                                        {item.label}
                                    </span>
                                )}
                            </NavLink>
                        ))}
                    </nav>

                    {account && <div className="mt-2 space-y-2 border-t-2 border-dashed border-[var(--max-line)]/20 p-4">
                        <div className="neo-inset flex items-center gap-3 rounded-2xl p-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-sm font-extrabold text-[#1b1405]">
                                {user?.name?.charAt(0)?.toUpperCase() || 'S'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-campus-navy">{user?.name}</p>
                                <p className="truncate text-[11px] text-campus-warm-400">{user?.email}</p>
                            </div>
                            <ThemeToggle />
                        </div>
                        <button onClick={handleLogout} className="app-press group flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-campus-rose transition-colors hover:bg-campus-rose/10">
                            <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> Sign out
                        </button>
                    </div>}
                </aside>
            </div>

            {/* ───────── Mobile: the same navbar as a drawer from the left, opened by the hamburger ───────── */}
            {account && <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
                className="app-rail fixed left-3 top-3 z-40 grid h-11 w-11 place-items-center !rounded-full text-campus-navy lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>}
            <AnimatePresence>
                {open && (
                    <>
                        <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}
                            className="fixed inset-0 z-50 bg-[rgb(8_32_42/0.35)] backdrop-blur-sm lg:hidden" />
                        <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label="Main navigation"
                            initial={{ x: '-105%' }} animate={{ x: 0 }} exit={{ x: '-105%' }} transition={{ type: 'spring', damping: 32, stiffness: 330 }}
                            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.6, right: 0 }} onDragEnd={(_, i) => { if (i.offset.x < -80) setOpen(false); }}
                            className="app-rail fixed bottom-3 left-3 top-3 z-50 flex w-[min(18rem,82vw)] flex-col overflow-hidden lg:hidden">
                            <div className="flex items-center justify-between px-5 pb-3 pt-4">
                                <Brand />
                                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full text-campus-navy hover:bg-campus-navy/5"><X className="h-5 w-5" aria-hidden /></button>
                            </div>
                            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3" aria-label="Sections">
                                {ALL.map((item) => (
                                    <NavLink key={item.path} to={item.path} onClick={() => setOpen(false)} className="relative block rounded-full">
                                        {({ isActive }) => (
                                            <span className={`relative z-10 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold ${isActive ? 'text-[#1b1405]' : 'text-campus-warm-500'}`}>
                                                {isActive && <span aria-hidden className="pill-lit absolute inset-0 -z-10 rounded-full" />}
                                                <item.icon className="h-[18px] w-[18px]" aria-hidden />
                                                {item.label}
                                            </span>
                                        )}
                                    </NavLink>
                                ))}
                            </nav>
                            <div className="space-y-2 border-t-2 border-dashed border-[var(--max-line)]/20 p-3">
                                <div className="neo-inset flex items-center gap-3 rounded-2xl p-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-sm font-extrabold text-[#1b1405]">
                                        {user?.name?.charAt(0)?.toUpperCase() || 'S'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-campus-navy">{user?.name}</p>
                                        <p className="truncate text-[11px] text-campus-warm-400">{user?.email}</p>
                                    </div>
                                    <ThemeToggle />
                                </div>
                                <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-campus-rose hover:bg-campus-rose/10">
                                    <LogOut className="h-4 w-4" aria-hidden /> Sign out
                                </button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default Sidebar;
