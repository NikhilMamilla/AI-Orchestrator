import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementBanner, AnnouncementInbox } from './AnnouncementBanner';
import CommandPalette, { type Command } from '../admin/CommandPalette';

const COMMANDS: Command[] = [
    { label: 'Dashboard', hint: 'your progress at a glance', to: '/dashboard', keywords: 'home' },
    { label: 'Ask', hint: 'a cited answer to any DSA question', to: '/ask', keywords: 'question tutor chat' },
    { label: 'Learn', hint: 'your plan, review queue and check questions', to: '/learn', keywords: 'quiz roadmap review' },
    { label: 'Challenges', hint: 'debug and code, graded in a sandbox', to: '/challenges', keywords: 'code judge0 practice' },
    { label: 'Journal', hint: 'your learning journal and share links', to: '/journal', keywords: 'pdf share teacher parent' },
    { label: 'Visualize', hint: 'watch algorithms run step by step', to: '/visualize', keywords: 'sort search animation' },
    { label: 'Concepts', hint: 'the map of what builds on what', to: '/concepts', keywords: 'graph prerequisites' },
    { label: 'Playground', hint: 'run your own code', to: '/playground', keywords: 'editor run' },
    { label: 'Insights', hint: 'agent decisions, badges, study rhythm', to: '/insights', keywords: 'achievements rhythm' },
    { label: 'Evidence Lab', hint: 'the pre/post study', to: '/lab', keywords: 'study test' },
    { label: 'Settings', hint: 'profile, coding profiles, theme, your data', to: '/settings', keywords: 'password export download' },
];
import { useAuthStore } from '../store/authStore';
import ThemeToggle from './fx/ThemeToggle';

/**
 * The slim bar at the top of an app page: where you are on the left; the theme, your account and sign out on the
 * right. A sticker pill, like the landing page's navbar.
 */
export default function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = useIsAdmin();
    const news = useAnnouncements();
    const signOut = async () => { await logout(); navigate('/login'); };
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <>
        <header className="top-bar relative z-30 flex h-14 shrink-0 items-center justify-between gap-4 pl-5 pr-2 max-lg:pl-1.5">
            <div className="flex min-w-0 items-center gap-3 max-lg:gap-2">
                <button type="button" onClick={() => window.dispatchEvent(new Event('kiddoo:nav'))} aria-label="Open menu"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-campus-navy hover:bg-campus-navy/5 lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>
                <span className="font-heading text-base font-extrabold text-campus-navy">{title}</span>
                <span className="hidden truncate font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-campus-warm-500 sm:inline">{subtitle ?? today}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {isAdmin && (
                    <Link to="/admin" className="btn-skeu h-9 gap-1.5 px-3.5 text-xs"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Admin console</Link>
                )}
                <CommandPalette commands={isAdmin ? [{ label: 'Admin console', hint: 'back to the console', to: '/admin', keywords: 'admin' }, ...COMMANDS] : COMMANDS} />
                <AnnouncementInbox items={news.items} unread={news.unread} onOpen={news.markAllSeen} />
                <ThemeToggle className="h-9 w-9" />
                <div className="hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-3 xl:flex">
                    <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-xs font-extrabold text-[#1b1405]">
                        {user?.name?.charAt(0)?.toUpperCase() || 'S'}
                    </span>
                    <span className="min-w-0 leading-tight">
                        <span className="block max-w-[11rem] truncate text-xs font-bold text-campus-navy">{user?.name}</span>
                        <span className="block max-w-[11rem] truncate text-[10px] text-campus-warm-500">{user?.email}</span>
                    </span>
                </div>
                <button type="button" onClick={signOut} className="btn-glass max-btn h-9 gap-1.5 px-3.5 text-xs">
                    <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
                </button>
            </div>
        </header>
        <AnnouncementBanner banner={news.banner} onDismiss={news.dismiss} />
        </>
    );
}
