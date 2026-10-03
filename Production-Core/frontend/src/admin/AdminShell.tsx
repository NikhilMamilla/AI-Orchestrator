import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Activity, BookOpenCheck, FlaskConical, GraduationCap, LayoutGrid, Library, LogOut, MailCheck, Megaphone, Repeat, ScanSearch, Server,
    ShieldCheck, Users, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useIsAdmin } from '../hooks/useIsAdmin';
import ThemeToggle from '../components/fx/ThemeToggle';
import AppBackdrop from '../components/fx/AppBackdrop';
import CommandPalette, { type Command } from './CommandPalette';
import './admin.css';

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }
const NAV: Item[] = [
    { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/admin/learners', label: 'Learners', icon: Users },
    { to: '/admin/engagement', label: 'Engagement', icon: Repeat },
    { to: '/admin/content', label: 'Content', icon: Library },
    { to: '/admin/inspector', label: 'Inspector', icon: ScanSearch },
    { to: '/admin/quality', label: 'Answer quality', icon: Activity },
    { to: '/admin/study', label: 'Study', icon: FlaskConical },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/admin/system', label: 'System', icon: Server },
];
const COMMANDS: Command[] = [
    { label: 'Overview', hint: 'KPIs, alerts, activity', to: '/admin', keywords: 'home dashboard' },
    { label: 'Learners', hint: 'mastery heatmap, hardest concepts', to: '/admin/learners', keywords: 'cohort mixups missed' },
    { label: 'Engagement', hint: 'retention and study hours', to: '/admin/engagement', keywords: 'cohort weekly hours' },
    { label: 'Content', hint: 'knowledge base, coverage, gaps', to: '/admin/content', keywords: 'upload documents roadmap challenges' },
    { label: 'Inspect a question', hint: 'retrieval scores and the evidence gate', to: '/admin/inspector', keywords: 'debug test search' },
    { label: 'Answer quality', hint: 'grounded vs refused, latency, evals', to: '/admin/quality', keywords: 'metrics evaluation' },
    { label: 'Study', hint: 'Evidence Lab report and CSV', to: '/admin/study', keywords: 'pre post experiment' },
    { label: 'Post an announcement', hint: 'message every learner', to: '/admin/announcements', keywords: 'banner notice audit' },
    { label: 'Audit log', hint: 'who did what', to: '/admin/announcements', keywords: 'history actions' },
    { label: 'System', hint: 'services, settings, tools', to: '/admin/system', keywords: 'health cache judge0 database' },
    { label: 'Open learner view', hint: 'the student app', to: '/dashboard', keywords: 'student learn' },
];

/** The admin console: its own rail, top bar and look. Only admins get past the gate; the server checks every call anyway. */
export default function AdminShell() {
    const isAdmin = useIsAdmin();
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const here = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV[0];
    const signOut = async () => { await logout(); navigate('/login'); };

    return (
        <div className="admin app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />

            {/* rail (desktop): the learner sidebar's sticker, with the console's sections */}
            <div className="relative z-10 hidden shrink-0 p-4 lg:block">
                <aside className="app-rail flex h-full w-60 flex-col overflow-hidden" aria-label="Admin navigation">
                    <div className="flex items-center gap-3 px-6 pb-4 pt-5">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--max-line)] bg-gradient-to-br from-[#f3dc8f] to-[#c9a64a]">
                            <ShieldCheck className="h-5 w-5 text-[#1b1405]" aria-hidden />
                        </span>
                        <div className="leading-tight">
                            <span className="block font-heading text-xl font-extrabold tracking-tight text-campus-navy">Kiddoo</span>
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-campus-warm-500">Admin console</span>
                        </div>
                    </div>
                    <nav className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto px-3" aria-label="Sections">
                        {NAV.map((n) => (
                            <NavLink key={n.to} to={n.to} end={n.end} className="a-nav">
                                {({ isActive }) => (
                                    <>
                                        {isActive && <motion.span layoutId="admin-pill" transition={{ type: 'spring', stiffness: 380, damping: 30 }} aria-hidden className="pill-lit absolute inset-0 -z-10 rounded-full" />}
                                        <n.icon className="h-[18px] w-[18px]" aria-hidden /> {n.label}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="mt-auto space-y-3 p-4">
                        <p className="j-note text-[11px] leading-relaxed text-campus-warm-500">
                            Aggregates only. No learner names, emails or answers appear anywhere in this console.
                        </p>
                        <Link to="/dashboard" className="btn-skeu h-10 w-full gap-1.5 text-xs">
                            <GraduationCap className="h-4 w-4" aria-hidden /> Open learner view
                        </Link>
                    </div>
                </aside>
            </div>

            <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-4 px-4 pb-8 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                {/* top bar: the learner app's pill */}
                <header className="top-bar flex h-14 shrink-0 items-center justify-between gap-4 pl-5 pr-2">
                    <div className="flex min-w-0 items-baseline gap-3">
                        <span className="font-heading text-base font-extrabold text-campus-navy">{here.label}</span>
                        <span className="hidden truncate font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-campus-warm-500 sm:inline">Admin console</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link to="/dashboard" className="btn-skeu h-9 w-9 lg:hidden" aria-label="Open learner view"><GraduationCap className="h-4 w-4" aria-hidden /></Link>
                        <CommandPalette commands={COMMANDS} />
                        <ThemeToggle className="h-9 w-9" />
                        <div className="hidden items-center gap-2.5 py-1 pl-1 pr-3 xl:flex">
                            <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[#f3dc8f] font-heading text-xs font-extrabold text-[#1b1405]">
                                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                            </span>
                            <span className="min-w-0 leading-tight">
                                <span className="block max-w-[11rem] truncate text-xs font-bold text-campus-navy">{user?.name}</span>
                                <span className="block max-w-[11rem] truncate text-[10px] text-campus-warm-500">{user?.email}</span>
                            </span>
                        </div>
                        <button type="button" onClick={signOut} className="btn-glass max-btn h-9 gap-1.5 px-3.5 text-xs"><LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out</button>
                    </div>
                </header>

                {/* sections (mobile) */}
                <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto lg:hidden" aria-label="Sections">
                    {NAV.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end} className="a-nav shrink-0">
                            {({ isActive }) => (
                                <>
                                    {isActive && <span aria-hidden className="pill-lit absolute inset-0 -z-10 rounded-full" />}
                                    <n.icon className="h-4 w-4" aria-hidden /> {n.label}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex min-h-0 flex-1 flex-col">
                    {isAdmin === null && (
                        <p role="status" className="grid flex-1 place-items-center py-24 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-campus-warm-500">Checking access…</p>
                    )}
                    {isAdmin === false && <Gate verified={!!user?.emailVerified} email={user?.email ?? ''} />}
                    {isAdmin && (
                        <AnimatePresence mode="wait">
                            <motion.div key={pathname} className="flex min-h-0 flex-1 flex-col gap-4"
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                <Outlet />
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </main>
        </div>
    );
}

function Gate({ verified, email }: { verified: boolean; email: string }) {
    return (
        <div className="sticker m-auto max-w-md p-7 text-center" style={{ borderRadius: '28px 12px 28px 12px', ['--max' as string]: '#ffd2c8' }}>
            <span className="clay-icon mx-auto mb-4 grid h-14 w-14 place-items-center" style={{ background: '#f3dc8f' }}>
                {verified ? <ShieldCheck className="h-7 w-7 text-[#1b1405]" aria-hidden /> : <MailCheck className="h-7 w-7 text-[#1b1405]" aria-hidden />}
            </span>
            {verified ? (
                <>
                    <h2 className="max-h3 text-campus-navy">Admins <span className="max-mark">only</span></h2>
                    <p className="a-muted mt-2 text-xs leading-relaxed">
                        You&rsquo;re signed in as <b className="a-ink">{email}</b>, which isn&rsquo;t an admin account. The server decides who is an
                        admin, from <code>ADMIN_EMAILS</code>.
                    </p>
                    <Link to="/dashboard" className="btn-skeu mt-5 h-10 gap-1.5 px-5 text-xs">Back to your dashboard</Link>
                </>
            ) : (
                <>
                    <h2 className="max-h3 text-campus-navy">Verify your <span className="max-mark">email</span></h2>
                    <p className="a-muted mt-2 text-xs leading-relaxed">
                        Admin access counts only once <b className="a-ink">{email}</b> is verified, so nobody can claim an admin address they
                        don&rsquo;t own. After verifying, sign out and back in.
                    </p>
                    <Link to="/settings" className="btn-skeu mt-5 h-10 gap-1.5 px-5 text-xs"><BookOpenCheck className="h-3.5 w-3.5" aria-hidden /> Verify in Settings</Link>
                </>
            )}
        </div>
    );
}
