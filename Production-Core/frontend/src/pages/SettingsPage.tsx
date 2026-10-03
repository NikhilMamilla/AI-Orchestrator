import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowUpRight, BadgeCheck, BookOpen, Check, Code2, Copy, Download, Eraser, ExternalLink, Eye, Link2, Loader2, Lock, Mail, MailCheck, Monitor, Moon, Palette, RefreshCw,
    ShieldAlert, ShieldCheck, Sparkles, Sun, Trash2, Trophy, UserRound,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import { useAuthStore } from '../store/authStore';
import { useIsAdmin } from '../hooks/useIsAdmin';
import GoogleLogo from '../components/auth/GoogleLogo';
import { listShares, revokeShare, type ShareLink } from '../lib/share';
import { RagError } from '../lib/rag';
import { applyUi, currentUi, useTheme, type UiPrefs } from '../lib/theme';
import {
    deleteMyData, deletePartOfData, downloadMyData, fetchCodingProfiles, fetchDataSummary, fetchLeaderboard, fetchPrefs, optInLeaderboard,
    saveCodingProfiles, savePrefs, verifyCodingProfile, type Board, type CodingProfiles, type DataPart, type DataSummary, type Platform, type Prefs,
} from '../lib/learning';

type Section = 'profile' | 'learning' | 'coding' | 'appearance' | 'leaderboard' | 'data';
const SECTIONS: { id: Section; label: string; icon: typeof UserRound; tone: string }[] = [
    { id: 'profile', label: 'Profile', icon: UserRound, tone: '#ffd2c8' },
    { id: 'learning', label: 'Learning', icon: BookOpen, tone: '#cfe5ff' },
    { id: 'coding', label: 'Coding profiles', icon: Code2, tone: '#bdeed6' },
    { id: 'appearance', label: 'Appearance', icon: Palette, tone: '#ddd6ff' },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, tone: '#ffe0c2' },
    { id: 'data', label: 'Privacy & data', icon: ShieldAlert, tone: '#ffd2c8' },
];
const STYLES = [
    { id: 'auto', label: 'Let the tutor learn what works for me' },
    { id: 'default', label: 'Clear and concise' },
    { id: 'socratic', label: 'Socratic: guide me with questions' },
    { id: 'worked_example', label: 'Worked examples first' },
    { id: 'analogy', label: 'Analogies first' },
] as const;
const TONES = [{ id: 'encouraging', label: 'Encouraging' }, { id: 'neutral', label: 'Neutral' }, { id: 'challenging', label: 'Challenging' }] as const;
const PLATFORMS: { id: Platform; name: string; color: string; hint: string }[] = [
    { id: 'github', name: 'GitHub', color: '#24292f', hint: 'octocat' },
    { id: 'leetcode', name: 'LeetCode', color: '#ffa116', hint: 'your-username' },
    { id: 'codeforces', name: 'Codeforces', color: '#1f8acb', hint: 'tourist' },
    { id: 'hackerrank', name: 'HackerRank', color: '#2ec866', hint: 'your_username' },
    { id: 'codechef', name: 'CodeChef', color: '#5b4638', hint: 'your_handle' },
];
const LIVE_EVERY_MS = 10 * 60 * 1000;

export default function SettingsPage() {
    const isAdmin = useIsAdmin();
    const navigate = useNavigate();
    const [section, setSection] = useState<Section>('profile');
    const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const say = useCallback((kind: 'ok' | 'err', text: string) => {
        setToast({ kind, text });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2600);
    }, []);
    const errText = (e: unknown, fallback: string) =>
        e instanceof RagError ? e.message : ((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback);
    const run = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
        try { await fn(); say('ok', ok); return true; } catch (e) { say('err', errText(e, 'That did not work. Please try again.')); return false; }
    }, [say]);

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Settings" subtitle="Saved as you change them" />

                <header className="shrink-0 px-1">
                    <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Make it <span className="max-mark">yours.</span></h1>
                    <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>Every change saves the moment you make it, and changes how Kiddoo actually behaves.</p>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[15rem_1fr]">
                    {/* ── sections ── */}
                    <nav aria-label="Settings sections" className="sticker flex gap-1.5 overflow-x-auto p-2.5 lg:flex-col lg:overflow-visible" style={{ borderRadius: '24px 10px 24px 10px' }}>
                        {SECTIONS.map((s) => (
                            <button key={s.id} type="button" onClick={() => setSection(s.id)} aria-current={section === s.id}
                                className={`relative flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-semibold ${section === s.id ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                {section === s.id && <motion.span layoutId="settings-pill" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                <span className="relative grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: s.tone }}><s.icon className="h-3 w-3 text-[#1b1405]" aria-hidden /></span>
                                <span className="relative">{s.label}</span>
                            </button>
                        ))}
                        {/* shown to everyone: admins open the console; others get a note (the server checks every admin call anyway) */}
                        <button type="button" aria-disabled={!isAdmin}
                            onClick={() => (isAdmin ? navigate('/admin') : say('err', 'Only admins can open the admin console.'))}
                            title={isAdmin ? 'Open the admin console' : 'Admins only'}
                            className={`relative flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-semibold ${isAdmin ? 'text-campus-warm-500 hover:text-campus-navy' : 'cursor-not-allowed text-campus-warm-400 opacity-70'}`}>
                            <span className="relative grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--max-line)]" style={{ background: isAdmin ? '#b9dcff' : 'transparent' }}>
                                {isAdmin ? <ShieldCheck className="h-3 w-3 text-[#1b1405]" aria-hidden /> : <Lock className="h-3 w-3" aria-hidden />}
                            </span>
                            <span className="relative">Admin console</span>
                            {isAdmin ? <ArrowUpRight className="relative ml-auto h-3.5 w-3.5" aria-hidden /> : <span className="relative ml-auto font-mono text-[9px] uppercase tracking-[0.12em]">Admins</span>}
                        </button>
                    </nav>

                    {/* ── the section ── */}
                    <section className="sticker no-scrollbar relative min-h-[420px] min-w-0 overflow-y-auto overflow-x-hidden p-6 max-sm:p-4 lg:min-h-0" style={{ borderRadius: '10px 28px 10px 28px', ['--max' as string]: SECTIONS.find((s) => s.id === section)!.tone }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                                {section === 'profile' && <ProfileSection run={run} />}
                                {section === 'learning' && <LearningSection run={run} />}
                                {section === 'coding' && <CodingSection run={run} say={say} />}
                                {section === 'appearance' && <AppearanceSection say={say} />}
                                {section === 'leaderboard' && <LeaderboardSection run={run} />}
                                {section === 'data' && <DataSection run={run} />}
                            </motion.div>
                        </AnimatePresence>
                    </section>
                </div>

                {/* the "saved" toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.p role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                            className="fixed bottom-24 right-6 z-50 flex items-center gap-2 rounded-full border-2 border-[var(--max-line)] px-4 py-2 text-xs font-bold text-[#1b1405] shadow-[3px_3px_0_var(--max-line)] lg:bottom-8"
                            style={{ background: toast.kind === 'ok' ? '#bdeed6' : '#ffd2c8' }}>
                            {toast.kind === 'ok' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden />} {toast.text}
                        </motion.p>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

function Head({ title, mark, sub }: { title: string; mark: string; sub: string }) {
    return (
        <div className="mb-5">
            <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.35rem' }}>{title} <span className="max-mark">{mark}</span></h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-campus-warm-500">{sub}</p>
        </div>
    );
}
const Label = ({ children }: { children: React.ReactNode }) => (
    <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">{children}</span>
);

/* ---------- Profile: account, sign-in methods, password ---------- */
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

function Switch({ on, onToggle, title, note }: { on: boolean; onToggle: () => void; title: string; note: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} onClick={onToggle}
            className="flex w-full items-center justify-between gap-4 rounded-[18px] border-2 border-[rgb(var(--c-navy)/0.15)] p-3.5 text-left">
            <span>
                <b className="block text-[13px] text-campus-navy">{title}</b>
                <span className="block text-[11px] text-campus-warm-500">{note}</span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-[var(--max-line)] transition-colors ${on ? 'bg-[#3fbf8a]' : 'bg-[rgb(var(--c-navy)/0.12)]'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-[var(--max-line)] bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
        </button>
    );
}

function ProfileSection({ run }: { run: Run }) {
    const { user, updateName, changePassword, sendVerification, refreshUser, addPassword, linkGoogle, unlinkProvider, sendPasswordReset } = useAuthStore();
    const [linkSent, setLinkSent] = useState(false);
    const [name, setName] = useState(user?.name ?? '');
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const usesPassword = user?.providers.includes('password') ?? false;
    const usesGoogle = user?.providers.includes('google.com') ?? false;
    const methods = user?.providers.length ?? 0;
    const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
    const waiting = linkSent && !user?.emailVerified;
    const unverified = !user?.emailVerified;
    useEffect(() => {                          // verified in another tab or earlier: pick it up on open and on return
        if (!unverified) return;
        const check = () => { void refreshUser().catch(() => false); };
        check();
        window.addEventListener('focus', check);
        return () => window.removeEventListener('focus', check);
    }, [unverified, refreshUser]);
    useEffect(() => {
        if (!waiting) return;
        let stop = false;
        const check = async () => {
            if (stop) return;
            try { if (await refreshUser()) { stop = true; void run(async () => undefined, 'Email verified successfully.'); } } catch { /* try again */ }
        };
        const t = setInterval(() => void check(), 4000);
        const giveUp = setTimeout(() => clearInterval(t), 15 * 60 * 1000);       // a link is good for a while; stop polling after 15 min
        window.addEventListener('focus', check);
        return () => { stop = true; clearInterval(t); clearTimeout(giveUp); window.removeEventListener('focus', check); };
    }, [waiting, refreshUser, run]);

    return (
        <div>
            <Head title="Your" mark="profile" sub="Your account, how you sign in, and your password. Every change is saved to your account straight away." />
            <div className="grid gap-5 md:grid-cols-2">
                <div className="j-note space-y-4">
                    <div className="flex items-center gap-3">
                        {user?.avatar
                            ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full border-2 border-[var(--max-line)] object-cover" />
                            : <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-xl font-extrabold text-[#1b1405]">{(name || 'S').charAt(0).toUpperCase()}</span>}
                        <div className="min-w-0">
                            <p className="truncate font-heading text-base font-bold text-campus-navy">{user?.name}</p>
                            <p className="truncate text-xs text-campus-warm-500">{user?.email}</p>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                        <div className="j-row"><dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-campus-warm-500">Member since</dt><dd className="font-semibold text-campus-navy">{when(user?.createdAt ?? null)}</dd></div>
                        <div className="j-row"><dt className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-campus-warm-500">Last sign-in</dt><dd className="font-semibold text-campus-navy">{when(user?.lastSignIn ?? null)}</dd></div>
                    </dl>
                    <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void run(() => updateName(name), 'Name updated.'); }}>
                        <label className="block"><Label>Display name</Label>
                            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="share-input w-full" />
                        </label>
                        <button type="submit" disabled={name.trim().length < 2 || name.trim() === user?.name} className="btn-skeu mt-3 h-9 px-4 text-xs disabled:opacity-50">Save name</button>
                    </form>
                    {user?.emailVerified ? (
                        <div className="flex items-start gap-2.5 rounded-[14px] border-2 border-[var(--max-line)] bg-[#bdeed6] p-3 text-[11px] leading-relaxed text-[#1b1405]" role="status">
                            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <p className="min-w-0 flex-1">
                                <b className="block text-[12px]">Email verified successfully</b>
                                <span className="break-all">{user?.email}</span> is confirmed as yours, so you can recover your account with it.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-[14px] border-2 border-dashed border-[var(--max-line)] p-3">
                            <div className="mb-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-campus-warm-500">
                                <MailCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                <p className="min-w-0 flex-1">
                                    {linkSent
                                        ? <>We sent a link to <b className="break-all text-campus-navy">{user?.email}</b>. Open it and this page turns to verified by itself. <span className="inline-flex items-center gap-1 whitespace-nowrap text-campus-navy"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Waiting for you to click it…</span></>
                                        : 'Verify your email so you can recover your account.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn-skeu h-8 px-3 text-[11px]" onClick={() => void run(sendVerification, 'Verification link sent.').then((ok) => ok && setLinkSent(true))}>{linkSent ? 'Send again' : 'Send verification link'}</button>
                                <button type="button" className="btn-glass max-btn h-8 px-3 text-[11px]" onClick={() => void run(async () => {
                                    if (!(await refreshUser())) throw { response: { data: { detail: 'Not verified yet. Open the link in your inbox first.' } } };
                                }, 'Email verified.')}>I&rsquo;ve verified</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="j-note space-y-4">
                    <div>
                        <Label>Ways to sign in</Label>
                        <ul className="space-y-2">
                            <li className="j-row flex items-center gap-3">
                                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--max-line)] bg-white"><GoogleLogo className="h-4 w-4" /></span>
                                <span className="flex-1 text-xs"><b className="block text-campus-navy">Google</b><span className="text-campus-warm-500">{usesGoogle ? 'Linked' : 'Not linked'}</span></span>
                                {usesGoogle
                                    ? <button type="button" disabled={methods < 2} title={methods < 2 ? 'Add a password first' : undefined} onClick={() => void run(() => unlinkProvider('google.com'), 'Google unlinked.')} className="btn-glass max-btn h-8 px-3 text-[11px] disabled:opacity-40">Unlink</button>
                                    : <button type="button" onClick={() => void run(linkGoogle, 'Google linked.')} className="btn-skeu h-8 px-3 text-[11px]">Link Google</button>}
                            </li>
                            <li className="j-row flex items-center gap-3">
                                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[#f3dc8f]"><Mail className="h-4 w-4 text-[#1b1405]" aria-hidden /></span>
                                <span className="flex-1 text-xs"><b className="block text-campus-navy">Email + password</b><span className="text-campus-warm-500">{usesPassword ? 'Set' : 'Not set'}</span></span>
                                {usesPassword && methods > 1 && <button type="button" onClick={() => void run(() => unlinkProvider('password'), 'Password sign-in removed.')} className="btn-glass max-btn h-8 px-3 text-[11px]">Remove</button>}
                            </li>
                        </ul>
                        <p className="mt-1.5 text-[11px] text-campus-warm-500">At least one way to sign in always stays linked.</p>
                    </div>

                    {usesPassword ? (
                        <form onSubmit={(e) => { e.preventDefault(); void run(() => changePassword(cur, next), 'Password changed.').then((ok) => { if (ok) { setCur(''); setNext(''); setAgain(''); } }); }} className="space-y-2.5">
                            <Label>Change password</Label>
                            <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" aria-label="Current password" className="share-input w-full" />
                            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+, letters and a number)" aria-label="New password" className="share-input w-full" />
                            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" aria-label="Repeat new password" className="share-input w-full" />
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="submit" disabled={!cur || !strong || next !== again} className="btn-skeu h-9 px-4 text-xs disabled:opacity-50">Change password</button>
                                <button type="button" onClick={() => void run(sendPasswordReset, 'Reset link sent to your email.')} className="btn-glass max-btn h-9 px-3 text-xs">Forgot it? Email me a reset link</button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); void run(() => addPassword(next), 'Password added. You can now sign in with email too.').then((ok) => { if (ok) { setNext(''); setAgain(''); } }); }} className="space-y-2.5">
                            <Label>Add a password</Label>
                            <p className="text-[11px] leading-relaxed text-campus-warm-500">You sign in with Google. Add a password to also sign in with {user?.email} and a password, e.g. on a shared computer.</p>
                            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+, letters and a number)" aria-label="New password" className="share-input w-full" />
                            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" aria-label="Repeat new password" className="share-input w-full" />
                            <button type="submit" disabled={!strong || next !== again} className="btn-skeu h-9 px-4 text-xs disabled:opacity-50">Add password</button>
                        </form>
                    )}
                    {next && !strong && <p className="text-[11px] text-campus-rose">Use at least 8 characters with letters and a number.</p>}
                    {again && next !== again && <p className="text-[11px] text-campus-rose">The two passwords don&rsquo;t match.</p>}
                </div>
            </div>
        </div>
    );
}

/* ---------- Learning: style, tone, session length (server-side, changes real behaviour) ---------- */
function LearningSection({ run }: { run: Run }) {
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    useEffect(() => { fetchPrefs().then(setPrefs).catch(() => setPrefs(null)); }, []);
    const update = (patch: Partial<Prefs>) => {
        if (prefs) setPrefs({ ...prefs, ...patch });
        void run(async () => setPrefs(await savePrefs(patch)), 'Saved.');
    };
    if (!prefs) return <p className="flex items-center gap-2 text-sm text-campus-warm-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;
    return (
        <div>
            <Head title="How you" mark="learn" sub="These change real behaviour: the tutor's tone is written into its prompt, the style is the default on Ask, and the length sets your planned session." />
            <Label>Default teaching style</Label>
            <div className="mb-6 grid gap-2 sm:grid-cols-2">
                {STYLES.map((s) => (
                    <button key={s.id} type="button" onClick={() => update({ style: s.id })} className={`choice ${prefs.style === s.id ? 'choice-on' : ''}`}>
                        <span className="choice-dot" />{s.label}
                    </button>
                ))}
            </div>
            <Label>Tutor tone</Label>
            <div className="mb-6 flex flex-wrap gap-2">
                {TONES.map((t) => (
                    <button key={t.id} type="button" onClick={() => update({ tone: t.id })} className={`choice !w-auto ${prefs.tone === t.id ? 'choice-on' : ''}`}>
                        <span className="choice-dot" />{t.label}
                    </button>
                ))}
            </div>
            <Label>Planned session length</Label>
            <div className="flex items-center gap-4">
                <input type="range" min={10} max={120} step={5} value={prefs.session_minutes} aria-label="Planned session length in minutes"
                    onChange={(e) => setPrefs({ ...prefs, session_minutes: Number(e.target.value) })}
                    onPointerUp={() => update({ session_minutes: prefs.session_minutes })} onKeyUp={() => update({ session_minutes: prefs.session_minutes })}
                    className="viz-range flex-1" />
                <span className="max-sticker" style={{ background: '#f3dc8f' }}>{prefs.session_minutes} min</span>
            </div>
        </div>
    );
}

/* ---------- Coding profiles: link by username or URL, live stats, ownership verification ---------- */
function CodingSection({ run, say }: { run: Run; say: (k: 'ok' | 'err', t: string) => void }) {
    const [data, setData] = useState<CodingProfiles | null>(null);
    const [draft, setDraft] = useState<Partial<Record<Platform, string>>>({});
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState<Platform | null>(null);
    const load = useCallback(async (refresh = false) => {
        try {
            const d = await fetchCodingProfiles(refresh);
            setData(d);
            setDraft((cur) => (Object.keys(cur).length ? cur : d.handles));
        } catch { setData({ handles: {}, cards: [], verification: {} }); }
    }, []);
    useEffect(() => {
        void load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, LIVE_EVERY_MS);
        return () => clearInterval(t);
    }, [load]);

    const dirty = PLATFORMS.some((p) => (draft[p.id] ?? '') !== (data?.handles[p.id] ?? ''));
    const save = async () => {
        setBusy(true);
        const payload = Object.fromEntries(PLATFORMS.map((p) => [p.id, draft[p.id] ?? ''])) as Partial<Record<Platform, string>>;
        await run(async () => { const d = await saveCodingProfiles(payload); setData(d); setDraft(d.handles); }, 'Profiles saved. Now verify they are yours.');
        setBusy(false);
    };
    const refresh = async () => { setBusy(true); await load(true); setBusy(false); say('ok', 'Stats refreshed.'); };
    const check = async (p: Platform) => {
        setChecking(p);
        try {
            const r = await verifyCodingProfile(p);
            setData(r);
            say(r.verified ? 'ok' : 'err', r.verified ? 'Verified: this profile is yours.' : (r.reason ?? 'Not verified yet.'));
        } catch (e) {
            say('err', e instanceof RagError ? e.message : 'Could not check that profile right now.');
        } finally {
            setChecking(null);
        }
    };
    const copy = (code: string) => { void navigator.clipboard?.writeText(code).then(() => say('ok', 'Code copied.')); };
    const ago = (s: number) => { const m = Math.round((Date.now() / 1000 - s) / 60); return m < 1 ? 'just now' : `${m} min ago`; };

    return (
        <div>
            <Head title="Coding" mark="profiles" sub="Paste a username or your profile link. To stop fake links, each profile is verified: put a short code in your public bio, and Kiddoo checks it on the platform itself, live." />
            <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr] [&>*]:min-w-0">
                <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="j-note space-y-3">
                    {PLATFORMS.map((p) => {
                        const v = data?.verification?.[p.id];
                        return (
                            <label key={p.id} className="flex items-center gap-3">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-[11px] font-extrabold text-white" style={{ background: p.color }}>{p.name.charAt(0)}</span>
                                <span className="w-24 shrink-0 text-xs font-semibold text-campus-navy max-sm:w-[4.5rem]">{p.name}{v?.verified && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-campus-success" aria-label="verified" />}</span>
                                <input value={draft[p.id] ?? ''} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })} placeholder={`${p.hint} or profile link`} aria-label={`${p.name} username or profile link`} className="share-input h-9 min-w-0 flex-1 text-xs" />
                            </label>
                        );
                    })}
                    <div className="flex items-center gap-2 pt-1">
                        <button type="submit" disabled={!dirty || busy} className="btn-skeu h-9 px-4 text-xs disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />} Save profiles</button>
                        <span className="text-[11px] text-campus-warm-500">Leave a box empty to unlink it.</span>
                    </div>
                </form>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label>Live stats and verification</Label>
                        {data && data.cards.length > 0 && (
                            <button type="button" onClick={() => void refresh()} disabled={busy} className="btn-glass max-btn h-8 gap-1.5 px-3 text-[11px] disabled:opacity-50">
                                <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Refresh
                            </button>
                        )}
                    </div>
                    {!data && <p className="flex items-center gap-2 text-sm text-campus-warm-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>}
                    {data && data.cards.length === 0 && (
                        <div className="j-note flex flex-col items-center gap-2 py-8 text-center">
                            <Sparkles className="h-6 w-6 text-campus-warm-400" aria-hidden />
                            <p className="text-xs text-campus-warm-500">Add a username or profile link on the left to see your stats here.</p>
                        </div>
                    )}
                    {data?.cards.map((c) => {
                        const meta = PLATFORMS.find((p) => p.id === c.platform)!;
                        const v = data.verification?.[c.platform];
                        return (
                            <div key={c.platform} className="rounded-[18px] border-2 border-[var(--max-line)] p-4" style={{ boxShadow: `4px 4px 0 ${meta.color}` }}>
                                <div className="flex items-center gap-2.5">
                                    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-[10px] font-extrabold text-white" style={{ background: meta.color }}>{c.name.charAt(0)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5 font-heading text-sm font-bold text-campus-navy">
                                            {c.name}
                                            {v && <span className="max-sticker !inline-flex items-center gap-1 !px-1.5 !py-0 !text-[8px]" style={{ background: v.verified ? '#bdeed6' : '#ffd2c8' }}>{v.verified ? <><BadgeCheck className="h-3 w-3" aria-hidden />Verified</> : 'Unverified'}</span>}
                                        </span>
                                        <span className="block truncate text-[11px] text-campus-warm-500">@{c.handle}{c.live && c.ok ? ` · updated ${ago(c.fetched_at)}` : ''}</span>
                                    </span>
                                    <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.name} profile`} className="btn-glass max-btn h-8 w-8 !p-0"><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                                </div>
                                {c.stats.length > 0 && (
                                    <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                        {c.stats.map((s) => (
                                            <div key={s.label} className="rounded-[12px] bg-[rgb(var(--c-navy)/0.05)] px-2 py-1.5 text-center">
                                                <dd className="font-heading text-base font-extrabold text-campus-navy">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</dd>
                                                <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-campus-warm-500">{s.label}</dt>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                                {c.note && <p className={`mt-2 text-[11px] ${c.ok ? 'text-campus-warm-500' : 'text-campus-rose'}`}>{c.note}</p>}
                                {v && !v.verified && (
                                    <div className="mt-3 rounded-[14px] border-2 border-dashed border-[rgb(var(--c-navy)/0.25)] p-3 text-[11px] text-campus-warm-500">
                                        <p className="mb-2">Prove it&rsquo;s yours: add this code to {v.where}, save it there, then check.</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <code className="max-w-full break-all rounded-full border-2 border-[var(--max-line)] bg-[#f3dc8f] px-3 py-1 font-mono text-xs font-bold text-[#1b1405]">{v.code}</code>
                                            <button type="button" onClick={() => copy(v.code)} className="btn-glass max-btn h-8 gap-1 px-3 text-[11px]"><Copy className="h-3 w-3" aria-hidden /> Copy</button>
                                            <button type="button" onClick={() => void check(c.platform)} disabled={checking !== null} className="btn-skeu h-8 gap-1 px-3 text-[11px] disabled:opacity-50">
                                                {checking === c.platform ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <BadgeCheck className="h-3 w-3" aria-hidden />} Check now
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {v?.verified && <p className="mt-2 text-[11px] text-campus-success">Verified {v.verified_at ? new Date(v.verified_at).toLocaleDateString() : ''}. You can remove the code from your bio now.</p>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ---------- Appearance: applied instantly here, saved to the account so it follows you to every device ---------- */
function AppearanceSection({ say }: { say: (k: 'ok' | 'err', t: string) => void }) {
    const [ui, setUi] = useState<UiPrefs>(currentUi());
    useTheme();                                                            // re-render when the theme changes elsewhere
    const change = (patch: Partial<UiPrefs>, msg: string) => {
        applyUi(patch);
        setUi(currentUi());
        savePrefs({ ui: patch }).then(() => say('ok', `${msg} Saved to your account.`)).catch(() => say('err', `${msg} Saved on this device only (couldn't reach the server).`));
    };
    return (
        <div>
            <Head title="How it" mark="looks" sub="Applied straight away, and saved to your account, so the same look follows you to any device you sign in on." />
            <Label>Theme</Label>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                {([['light', 'Light', Sun, 'The sky by day'], ['dark', 'Dark', Moon, 'The sky at night'], ['system', 'System', Monitor, 'Follow this device']] as const).map(([id, label, Icon, note]) => (
                    <button key={id} type="button" onClick={() => change({ theme: id }, id === 'system' ? 'Following your system theme.' : `${label} theme on.`)} className={`choice !flex-col !items-start !gap-1 !py-3 ${ui.theme === id ? 'choice-on' : ''}`}>
                        <span className="flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden /><b className="text-[13px]">{label}</b></span>
                        <span className="text-[11px] opacity-75">{note}</span>
                    </button>
                ))}
            </div>
            <Label>Text size</Label>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                {([90, 100, 110, 120] as const).map((size) => (
                    <button key={size} type="button" onClick={() => change({ text_size: size }, `Text size ${size}%.`)} aria-pressed={ui.text_size === size}
                        className={`choice !w-auto !gap-2 !px-4 !py-2 ${ui.text_size === size ? 'choice-on' : ''}`}>
                        <span className="font-heading font-extrabold" style={{ fontSize: `${size / 100 * 15}px` }}>Aa</span><span className="text-[11px]">{size}%</span>
                    </button>
                ))}
            </div>
            <Label>Comfort</Label>
            <div className="grid max-w-3xl gap-3 md:grid-cols-2">
                <Switch on={ui.petals} onToggle={() => change({ petals: !ui.petals }, ui.petals ? 'Petals off.' : 'Petals back.')} title="Falling petals" note="The petals drifting across the background." />
                <Switch on={ui.motion === 'reduce'} onToggle={() => change({ motion: ui.motion === 'reduce' ? 'full' : 'reduce' }, ui.motion === 'reduce' ? 'Motion back on.' : 'Motion reduced.')} title="Reduce motion" note="Stops petals, light rays and other decorative animation." />
                <Switch on={ui.contrast} onToggle={() => change({ contrast: !ui.contrast }, ui.contrast ? 'Standard contrast.' : 'High contrast on.')} title="High contrast" note="Solid cards, full-strength text and borders, no glass blur." />
            </div>
        </div>
    );
}

/* ---------- Leaderboard (opt-in) ---------- */
function LeaderboardSection({ run }: { run: Run }) {
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    const [board, setBoard] = useState<Board | null>(null);
    const [nick, setNick] = useState('');
    const load = useCallback(() => {
        fetchPrefs().then((p) => { setPrefs(p); setNick(p.leaderboard_nickname ?? ''); }).catch(() => undefined);
        fetchLeaderboard().then(setBoard).catch(() => setBoard(null));
    }, []);
    useEffect(load, [load]);
    return (
        <div>
            <Head title="The" mark="leaderboard" sub="Off by default. If you join, only your chosen nickname and your mastery points (10 per concept's worth of measured mastery) are shown. No email, no name." />
            <form onSubmit={(e) => { e.preventDefault(); void run(() => optInLeaderboard(nick.trim()), 'You are on the leaderboard.').then(load); }} className="mb-5 flex flex-wrap items-end gap-2">
                <label><Label>Nickname</Label>
                    <input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder="e.g. Ada L" className="share-input w-56" />
                </label>
                <button type="submit" disabled={nick.trim().length < 3} className="btn-skeu h-10 px-4 text-xs disabled:opacity-50">{prefs?.leaderboard_nickname ? 'Update nickname' : 'Join'}</button>
                {prefs?.leaderboard_nickname && (
                    <button type="button" onClick={() => void run(() => optInLeaderboard(null), 'You left the leaderboard.').then(load)} className="btn-glass max-btn h-10 px-4 text-xs">Leave</button>
                )}
            </form>
            {board && board.top.length > 0 && (
                <ol className="max-w-lg space-y-1.5">
                    {board.top.map((r) => (
                        <li key={r.rank} className={`j-row flex items-center gap-3 ${r.you ? '!border-[var(--max-line)]' : ''}`}>
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] font-heading text-[11px] font-extrabold text-[#1b1405]" style={{ background: r.rank <= 3 ? ['#f3dc8f', '#e9e3d3', '#ffd2c8'][r.rank - 1] : '#fffaf0' }}>{r.rank}</span>
                            <span className={`flex-1 text-[13px] ${r.you ? 'font-bold text-campus-navy' : 'text-campus-navy'}`}>{r.nickname}{r.you ? ' (you)' : ''}</span>
                            <span className="font-mono text-[11px] text-campus-warm-500">{r.points} pts</span>
                        </li>
                    ))}
                </ol>
            )}
            {board && <p className="mt-3 text-[11px] text-campus-warm-500">{board.participants} learner(s) opted in.</p>}
        </div>
    );
}

/* ---------- Privacy and data: what is stored (live counts), a copy, partial or full erasure, account deletion ---------- */
const PARTS: { id: DataPart; title: string; note: string; count: (s: DataSummary) => string }[] = [
    { id: 'code_runs', title: 'Code runs', note: 'Programs you ran in the Playground.', count: (s) => `${s.code_runs}` },
    { id: 'agent_history', title: 'Agent history', note: 'The decisions the agents logged about you (Insights).', count: (s) => `${s.agent_decisions}` },
    { id: 'share_links', title: 'Share links', note: 'Turns off every teacher/parent link right away.', count: (s) => `${s.live_share_links} live` },
    { id: 'coding_profiles', title: 'Coding profiles', note: 'Unlinks every coding profile and its verification.', count: (s) => `${s.coding_profiles}` },
];

/** Who can see your progress right now: live teacher/parent links (views, expiry, revoke) and leaderboard visibility. */
function VisibilityPanel({ run, onLeaderboard, onChange }: { run: Run; onLeaderboard: boolean; onChange: () => void }) {
    const [links, setLinks] = useState<ShareLink[] | null>(null);
    const load = useCallback(() => { listShares().then(setLinks).catch(() => setLinks([])); }, []);
    useEffect(() => {
        load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);     // views update live
        return () => clearInterval(t);
    }, [load]);
    const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'never');
    const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

    return (
        <div className="j-note">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Label>Who can see your progress</Label>
                <Link to="/journal" className="text-[11px] font-semibold text-campus-navy underline-offset-2 hover:underline">New link in Journal ↗</Link>
            </div>
            <ul className="space-y-2">
                <li className="j-row flex items-center gap-3 text-xs">
                    <Eye className="h-4 w-4 shrink-0 text-campus-warm-500" aria-hidden />
                    <span className="flex-1"><b className="text-campus-navy">You</b><span className="block text-[11px] text-campus-warm-500">Everything, always.</span></span>
                </li>
                <li className="j-row flex items-center gap-3 text-xs">
                    <Trophy className="h-4 w-4 shrink-0 text-campus-warm-500" aria-hidden />
                    <span className="flex-1"><b className="text-campus-navy">Leaderboard</b><span className="block text-[11px] text-campus-warm-500">{onLeaderboard ? 'Your nickname and points are visible to other learners.' : 'Hidden. You haven’t opted in.'}</span></span>
                </li>
                {links === null && <li className="flex items-center gap-2 text-xs text-campus-warm-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading links…</li>}
                {links?.length === 0 && (
                    <li className="j-row flex items-center gap-3 text-xs">
                        <Link2 className="h-4 w-4 shrink-0 text-campus-warm-500" aria-hidden />
                        <span className="flex-1"><b className="text-campus-navy">No live share links</b><span className="block text-[11px] text-campus-warm-500">No teacher or parent can see your progress.</span></span>
                    </li>
                )}
                {links?.map((l) => (
                    <li key={l.id} className="j-row flex items-center gap-3 text-xs">
                        <Link2 className="h-4 w-4 shrink-0 text-[#3fbf8a]" aria-hidden />
                        <span className="min-w-0 flex-1">
                            <b className="block truncate text-campus-navy">{l.label || 'Share link'}</b>
                            <span className="block text-[11px] text-campus-warm-500">{l.views} view{l.views === 1 ? '' : 's'} · last opened {dt(l.last_viewed_at)} · {daysLeft(l.expires_at)} days left</span>
                        </span>
                        <button type="button" onClick={() => void run(async () => { await revokeShare(l.id); load(); onChange(); }, 'Link turned off.')} className="btn-glass max-btn h-8 shrink-0 px-3 text-[11px]">Turn off</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DataSection({ run }: { run: Run }) {
    const navigate = useNavigate();
    const { user, deleteAccount } = useAuthStore();
    const [s, setS] = useState<DataSummary | null>(null);
    const [confirm, setConfirm] = useState<'data' | 'account' | null>(null);
    const [typed, setTyped] = useState('');
    const [password, setPassword] = useState('');
    const usesPassword = user?.providers.includes('password') ?? false;

    const load = useCallback(() => { fetchDataSummary().then(setS).catch(() => undefined); }, []);
    useEffect(() => {
        load();
        const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);    // live counts
        return () => clearInterval(t);
    }, [load]);

    const erasePart = (p: DataPart, title: string) => void run(async () => { await deletePartOfData(p); load(); }, `${title} erased.`);
    const reset = () => { setConfirm(null); setTyped(''); setPassword(''); };

    const stored = s ? [
        { k: 'Concepts tracked', v: s.concepts_tracked }, { k: 'Answers logged', v: s.attempts_logged }, { k: 'Quiz questions', v: s.quiz_answers },
        { k: 'Code runs', v: s.code_runs }, { k: 'Agent decisions', v: s.agent_decisions }, { k: 'Share links', v: s.share_links },
    ] : [];

    return (
        <div>
            <Head title="Your" mark="data" sub="Exactly what Kiddoo stores about you (counted live), a full copy, and controls to erase part or all of it." />
            <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
                <div className="space-y-4">
                    <div className="j-note">
                        <div className="mb-2 flex items-center justify-between"><Label>What is stored right now</Label>{s?.profile_updated_at && <span className="text-[10px] text-campus-warm-500">profile updated {new Date(s.profile_updated_at).toLocaleString()}</span>}</div>
                        {!s ? <p className="flex items-center gap-2 text-xs text-campus-warm-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Counting…</p> : (
                            <>
                                <dl className="grid grid-cols-3 gap-2">
                                    {stored.map((x) => (
                                        <div key={x.k} className="j-row text-center"><dd className="font-heading text-lg font-extrabold text-campus-navy">{x.v.toLocaleString()}</dd><dt className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-campus-warm-500">{x.k}</dt></div>
                                    ))}
                                </dl>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {[[s.has_goal, 'Goal set'], [s.in_study, 'In the Evidence Lab study'], [s.on_leaderboard, 'On the leaderboard'], [s.coding_profiles > 0, `${s.coding_profiles} coding profile(s)`]].map(([on, label]) => (
                                        <span key={String(label)} className={`max-sticker !inline-flex items-center gap-1 !px-2 !py-0.5 !text-[9px] ${on ? '' : '!border-dashed !bg-transparent !text-campus-warm-500'}`}
                                            style={on ? { background: '#bdeed6' } : undefined}>{on ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}{on ? label : `No ${String(label).charAt(0).toLowerCase()}${String(label).slice(1)}`}</span>
                                    ))}
                                </div>
                            </>
                        )}
                        <p className="mt-3 text-[11px] leading-relaxed text-campus-warm-500">Your answers are never shown to anyone else. Admins see only group totals, and a share link shows only the numbers you choose to share.</p>
                        <button type="button" onClick={() => void run(downloadMyData, 'Your data was downloaded.')} className="btn-skeu mt-3 flex h-9 gap-1.5 px-4 text-xs">
                            <Download className="h-3.5 w-3.5" aria-hidden /> Download everything (JSON)
                        </button>
                    </div>

                    <div className="j-note">
                        <Label>Erase one kind of data</Label>
                        <ul className="space-y-2">
                            {PARTS.map((p) => (
                                <li key={p.id} className="j-row flex items-center gap-3">
                                    <span className="min-w-0 flex-1 text-xs"><b className="text-campus-navy">{p.title}</b> <span className="font-mono text-[10px] text-campus-warm-500">{s ? p.count(s) : ''}</span><span className="block text-[11px] text-campus-warm-500">{p.note}</span></span>
                                    <button type="button" onClick={() => erasePart(p.id, p.title)} className="btn-glass max-btn h-8 shrink-0 gap-1 px-3 text-[11px]"><Eraser className="h-3 w-3" aria-hidden /> Erase</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="space-y-4">
                    {([
                        { id: 'data', title: 'Delete my learning data', text: 'Erases your mastery, answers, plans, journal, share links, code runs and agent history. Your account stays, so you can start fresh.' },
                        { id: 'account', title: 'Delete my account', text: 'Erases all your learning data, then the account itself. You will be signed out and cannot sign in again with it.' },
                    ] as const).map((d) => (
                        <div key={d.id} className="rounded-[18px] border-2 border-campus-rose/50 p-4">
                            <b className="mb-1 block text-[13px] text-campus-rose">{d.title}</b>
                            <p className="text-xs leading-relaxed text-campus-warm-500">{d.text} This cannot be undone.</p>
                            {confirm !== d.id ? (
                                <button type="button" onClick={() => { reset(); setConfirm(d.id); }} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border-2 border-campus-rose/60 px-4 text-xs font-bold text-campus-rose">
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> {d.title}
                                </button>
                            ) : (
                                <div className="mt-3 space-y-2" role="alertdialog" aria-label={`Confirm: ${d.title}`}>
                                    <label className="block text-xs text-campus-navy">Type <b>DELETE</b> to confirm
                                        <input value={typed} onChange={(e) => setTyped(e.target.value)} className="share-input mt-1 w-full" />
                                    </label>
                                    {d.id === 'account' && usesPassword && (
                                        <label className="block text-xs text-campus-navy">Your password
                                            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="share-input mt-1 w-full" />
                                        </label>
                                    )}
                                    {d.id === 'account' && !usesPassword && <p className="text-[11px] text-campus-warm-500">Google will ask you to confirm it&rsquo;s you.</p>}
                                    <div className="flex gap-2">
                                        <button type="button" disabled={typed !== 'DELETE' || (d.id === 'account' && usesPassword && !password)}
                                            onClick={() => {
                                                const pw = password;
                                                reset();
                                                if (d.id === 'data') void run(async () => { await deleteMyData(); load(); }, 'Your learning data was deleted.');
                                                else void run(async () => { await deleteMyData(); await deleteAccount(pw || undefined); navigate('/'); }, 'Your account was deleted.');
                                            }}
                                            className="h-9 rounded-full border-2 border-[var(--max-line)] bg-campus-rose px-4 text-xs font-bold text-white disabled:opacity-40">Yes, delete</button>
                                        <button type="button" onClick={reset} className="btn-glass max-btn h-9 px-4 text-xs">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <VisibilityPanel run={run} onLeaderboard={!!s?.on_leaderboard} onChange={load} />
                </div>
            </div>
        </div>
    );
}
