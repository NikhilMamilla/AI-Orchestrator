import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { lazy, Suspense, useCallback, useRef, useState, useEffect } from 'react';
import {
    Brain, BookOpen, Library, ClipboardCheck, TrendingUp,
    GraduationCap, ArrowRight, Map,
    Code2, BarChart3, Shield, Zap, ChevronRight,
    UserPlus, Play, Rocket, MessageSquare,
    Github, Linkedin, Twitter, Heart,
    Layers, GitBranch, Network, Binary, Cpu, Sigma,
    Target, LineChart, Award, Menu, X,
} from 'lucide-react';
import AgentOrchestration from '../components/landing/AgentOrchestration';
import ThemeToggle from '../components/fx/ThemeToggle';
import { BlurText, CountUp } from '../components/fx/Motion';
import { GROUPS } from '../components/fx/graphGroups';
import IntroExperience from '../components/intro/IntroExperience';
import { introWillPlay, prefersReducedMotion } from '../lib/introFlag';
import HoldToStart from '../components/intro/HoldToStart';
import StoryCards from '../experience/StoryCards';

const Experience = lazy(() => import('../experience/Experience'));

/* ═══════════════════════════════════════════════════════════
   SCROLL-REVEAL
   ═══════════════════════════════════════════════════════════ */
// phones: no reveal on scroll; every section is already there however fast you scroll
const PHONE = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '-80px' });
    if (PHONE) return <div className={className}>{children}</div>;
    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 35 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════
   3D TILT CARD (mouse-follow perspective)
   ═══════════════════════════════════════════════════════════ */
function TiltCard({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    const ref = useRef<HTMLDivElement>(null);
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);

    const handleMove = (e: React.MouseEvent) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const midX = rect.width / 2;
        const midY = rect.height / 2;
        setRotateY(((x - midX) / midX) * 8);
        setRotateX((-(y - midY) / midY) * 8);
    };

    const handleLeave = () => { setRotateX(0); setRotateY(0); };

    return (
        <div
            ref={ref}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            className={className}
            style={{
                ...style,
                transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
                transition: 'transform 0.15s ease-out',
                transformStyle: 'preserve-3d',
            }}
        >
            {children}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   AGENT DATA
   ═══════════════════════════════════════════════════════════ */
const agents = [
    {
        icon: Brain, title: 'The Maestro', agent: 'Orchestrator',
        color: 'bg-campus-primary', iconColor: 'text-campus-gold', borderHover: 'hover:border-campus-navy/30',
        description: 'Decides whether to advance, deepen, review or remediate from your measured mastery and the prerequisite graph. Builds a session plan, checks whether a deadline is realistic, and explains every decision.',
        features: ['Session plan', 'Placement check', 'Goal & deadline'],
    },
    {
        icon: BookOpen, title: 'Adaptive Tutor', agent: 'Teaching',
        color: 'bg-campus-gold', iconColor: 'text-[#1b1405]', borderHover: 'hover:border-campus-gold/30',
        description: 'Picks a teaching style (Socratic, worked example, analogy or concise) with a bandit that learns from how you do on the next check question, and sets the explanation level from your mastery.',
        features: ['4 styles', 'Learns what works', 'Mastery-aware'],
    },
    {
        icon: Library, title: 'Content Curator', agent: 'Knowledge',
        color: 'bg-campus-success', iconColor: 'text-white', borderHover: 'hover:border-campus-success/30',
        description: 'Hybrid keyword and semantic retrieval with a cross-encoder rerank. Answers cite their sources, every sentence is verified, and it says so when the material does not cover your question.',
        features: ['Hybrid retrieval', 'Cited answers', 'Evidence gate'],
    },
    {
        icon: ClipboardCheck, title: 'Smart Evaluator', agent: 'Assessment',
        color: 'bg-campus-amber', iconColor: 'text-white', borderHover: 'hover:border-campus-amber/30',
        description: 'Writes check questions from the passage you just read, offers hints that cost mastery credit, asks how sure you are, and grades code challenges against hidden tests in a sandbox.',
        features: ['Grounded questions', 'Hints & confidence', 'Code challenges'],
    },
    {
        icon: TrendingUp, title: 'Behavioral Analyst', agent: 'Analyst',
        color: 'bg-campus-rose', iconColor: 'text-white', borderHover: 'hover:border-campus-rose/30',
        description: 'Spots struggle, rushing, plateaus and recurring mix-ups from your real answers and response times, and stays quiet until it has enough data to say something.',
        features: ['Struggle & plateau', 'Misconceptions', 'Best time of day'],
    },
];

const features = [
    { icon: Zap, title: 'Adaptive placement', desc: 'About 8 questions use the prerequisite graph to find where you should start' },
    { icon: MessageSquare, title: 'Cited answers', desc: 'Every sentence is checked against its source, and you can open the source' },
    { icon: Map, title: 'Knowledge map', desc: 'The real prerequisite graph, coloured by your mastery' },
    { icon: Code2, title: 'Code challenges', desc: 'Fix bugs and write solutions, graded by hidden tests in a sandbox' },
    { icon: BarChart3, title: 'Journal & sharing', desc: 'A weekly summary you can save as PDF, and a link a teacher can open' },
    { icon: Shield, title: 'Misconception tracking', desc: 'Wrong answers reveal which concept you are confusing a topic with' },
];

const syllabus = [
    { icon: Sigma, title: 'Foundations', topics: ['Big-O complexity', 'Recursion', 'Bit manipulation', 'Prefix sums'] },
    { icon: Layers, title: 'Arrays & Strings', topics: ['Arrays', 'Two pointers & sliding window', 'String matching (KMP)', 'Sorting algorithms'] },
    { icon: GitBranch, title: 'Linear Structures', topics: ['Linked lists', 'Stacks', 'Queues', 'Hash tables'] },
    { icon: Network, title: 'Trees', topics: ['Binary trees', 'Binary search trees', 'Heaps & priority queues', 'Tries'] },
    { icon: Cpu, title: 'Graphs', topics: ['Graph basics', 'BFS', 'DFS', 'Topological sort', 'Dijkstra', 'Union-Find'] },
    { icon: Binary, title: 'Paradigms', topics: ['Binary search', 'Dynamic programming', 'Greedy algorithms', 'Backtracking'] },
];

const steps = [
    { icon: UserPlus, step: '01', title: 'Create a profile', desc: 'Your learner model starts empty and learns only from your own answers.' },
    { icon: Play, step: '02', title: 'Find your level', desc: 'Take the adaptive placement check, or simply ask a question and learn from the cited answer.' },
    { icon: Rocket, step: '03', title: 'Practice and review', desc: 'Mastery, review dates and your roadmap update after every answer.' },
];


/* ═══════════════════════════════════════════════════════════
   SECTIONS: a normal, continuously scrolling page; every section is at least one screen tall
   ═══════════════════════════════════════════════════════════ */
// The animated story (src/experience) plays before the page; with reduced motion it is a section of still cards instead.
const REDUCED = prefersReducedMotion();
// organic corner sets: neighbouring cards never share a shape
const SHAPES = ['44px 16px 44px 16px', '16px 44px 16px 44px', '40px 40px 14px 40px', '14px 40px 40px 40px', '40px 14px 40px 40px', '40px 40px 40px 14px'];

function useSections() {
    const [scrolled, setScrolled] = useState(false);
    // jump to a section (#id), or to the top
    const go = useCallback((id: string | null) => {
        if (!id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        // each section plays its entrance (.story-in) the first time it comes into view
        const io = new IntersectionObserver((entries) => entries.forEach((e) => {
            if (e.isIntersecting) { (e.target as HTMLElement).dataset.pos = 'active'; io.unobserve(e.target); }
        }), { threshold: 0.15 });
        document.querySelectorAll<HTMLElement>('main#main .stage').forEach((el) => io.observe(el));
        // a #section in the address (and no opening to play) scrolls there once the page is drawn
        if (introWillPlay()) window.history.replaceState(null, '', window.location.pathname + window.location.search);
        else if (window.location.hash) window.setTimeout(() => go(window.location.hash.slice(1)), 60);
        return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); };
    }, [go]);
    return { scrolled, go };
}

/* ═══════════════════════════════════════════════════════════
   STATS COUNTER ANIMATION
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthStore();

    const { scrolled, go } = useSections();
    const goStart = useCallback(() => navigate(isAuthenticated ? '/dashboard' : '/register'), [navigate, isAuthenticated]);
    // the story plays first on a fresh visit (never with reduced motion); "Replay the story" brings it back
    const [story, setStory] = useState(() => introWillPlay());
    const [returned, setReturned] = useState(false);
    const exitStory = useCallback(() => { setStory(false); setReturned(true); window.scrollTo(0, 0); }, []);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // the pill navbar follows the pointer: it shows on any movement (mouse, scroll, touch, keys) and tucks away after
    // 2.5 s of stillness, except at the top of the page, while hovered or focused, or while the mobile menu is open
    const [navAwake, setNavAwake] = useState(true);
    const [navHeld, setNavHeld] = useState(false);
    useEffect(() => {
        let t = 0;
        const wake = () => {
            setNavAwake(true);
            window.clearTimeout(t);
            t = window.setTimeout(() => setNavAwake(false), 2500);
        };
        const evs = ['mousemove', 'scroll', 'touchstart', 'keydown', 'wheel'] as const;
        evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
        wake();
        return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, wake)); };
    }, []);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [hoverId, setHoverId] = useState<string | null>(null);
    useEffect(() => {
        if (story) return;
        const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id === 'top' ? null : e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
        ['top', 'workflow', 'agents', 'syllabus', 'insights', 'process', 'features', 'start'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
        return () => io.disconnect();
    }, [story]);

    useEffect(() => {                                        // the open menu holds the page still; Escape closes it
        if (!mobileMenuOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
    }, [mobileMenuOpen]);

    const navLinks = [
        { label: 'Flow', href: '#workflow' },
        { label: 'AI Team', href: '#agents' },
        { label: 'Curriculum', href: '#syllabus' },
        { label: 'Insights', href: '#insights' },
        { label: 'Process', href: '#process' },
        { label: 'Features', href: '#features' }
    ];

    return (
        <div className="min-h-screen overflow-x-hidden relative">
            <IntroExperience />
            {story && (
                <Suspense fallback={null}>
                    <Experience onExit={exitStory} onStart={goStart} startLabel={isAuthenticated ? 'Go to dashboard' : 'Start learning free'} authenticated={isAuthenticated} />
                </Suspense>
            )}

            {/* ━━━ STICKY NAV ━━━ */}
            <nav className={`landing-nav fixed inset-x-3 top-3 z-50 transition-[transform,opacity] duration-500 ease-out sm:inset-x-5 ${story ? 'hidden' : ''}`}
                style={!navAwake && scrolled && !navHeld && !mobileMenuOpen ? { transform: 'translateY(-130%)', opacity: 0, pointerEvents: 'none' } : undefined}
                onMouseEnter={() => setNavHeld(true)} onMouseLeave={() => setNavHeld(false)}
                onFocus={() => setNavHeld(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setNavHeld(false); }}>
                <div className="mx-auto flex max-w-6xl items-center gap-3" inert={story}>
                <div className={`pill-nav relative flex h-16 min-w-0 flex-1 items-center justify-between gap-4 pl-4 pr-4 transition-all duration-500 ${scrolled || mobileMenuOpen ? 'pill-nav-on' : ''}`}>
                    <div className="flex items-center gap-2 md:gap-3 group cursor-pointer" onClick={() => go(null)}>
                        <div className="w-8 h-8 md:w-9 md:h-9 bg-campus-primary rounded-campus-sm flex items-center justify-center shadow-campus-navy group-hover:scale-110 transition-transform duration-300">
                            <GraduationCap className="text-campus-gold w-4 h-4 md:w-5 md:h-5" />
                        </div>
                        <span className="font-heading font-bold text-campus-navy text-base md:text-lg tracking-tight">Kiddoo</span>
                    </div>

                    {/* Desktop Links */}
                    <div className="pill-links absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center p-1 lg:flex" onMouseLeave={() => setHoverId(null)}>
                        {navLinks.map(link => {
                            const id = link.href.slice(1), lit = (hoverId ?? activeId) === id;
                            return (
                                <a key={link.href} href={link.href} onMouseEnter={() => setHoverId(id)}
                                    onClick={(e) => { e.preventDefault(); go(id); }}
                                    className={`relative rounded-full px-4 py-1.5 font-body text-sm font-semibold transition-colors duration-200 ${lit ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                    {lit && <motion.span layoutId="pill-nav-lit" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                    <span className="relative">{link.label}</span>
                                </a>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-3">
                            {isAuthenticated ? (
                                <button onClick={() => navigate('/dashboard')} className="btn-skeu py-2 px-5 text-xs lg:text-sm">
                                    Dashboard <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => navigate('/login')} className="text-xs lg:text-sm font-body font-semibold text-campus-navy hover:text-campus-gold transition-colors px-3">
                                        Sign In
                                    </button>
                                    <button onClick={() => navigate('/register')} className="btn-skeu py-2 px-4 lg:py-2.5 lg:px-5 text-xs lg:text-sm">
                                        Get Started <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Mobile Menu Toggle */}
                        <button
                            className="lg:hidden p-2 text-campus-navy"
                            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={mobileMenuOpen}
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
                {/* the theme toggle: its own circle, beside the pill */}
                <ThemeToggle className="pill-theme h-12 w-12 shrink-0" />
                </div>

                {/* Mobile menu: covers the whole screen, the page blurred behind it, every word centred (the pill stays on top) */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                            className="fixed inset-0 -z-10 isolate flex flex-col items-center justify-center px-6 lg:hidden"
                            onClick={(e) => { if (e.target === e.currentTarget) setMobileMenuOpen(false); }}
                        >
                            {/* the hero's own sky behind the menu */}
                            <div aria-hidden className="world-sky pointer-events-none absolute inset-0 -z-10" />
                            <div aria-hidden className="world-layer sky-rays" />
                            <ul className="flex flex-col items-center gap-[clamp(0.9rem,3.2svh,1.8rem)]">
                                {navLinks.map((link, i) => (
                                    <motion.li key={link.href} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i + 0.05, duration: 0.35 }}>
                                        <a href={link.href} onClick={(e) => { e.preventDefault(); go(link.href.slice(1)); setMobileMenuOpen(false); }}
                                            className="group flex items-baseline gap-3 font-heading text-[clamp(1.9rem,8.5vw,2.6rem)] font-bold leading-none tracking-tight text-campus-navy transition-colors hover:text-campus-gold">
                                            <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-campus-warm-500">{String(i + 1).padStart(2, '0')}</span>
                                            <span className={i % 2 ? 'font-display italic' : ''}>{link.label}</span>
                                        </a>
                                    </motion.li>
                                ))}
                            </ul>
                            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.35 }}
                                className="mt-[clamp(1.5rem,5svh,3rem)] flex w-full max-w-[18rem] flex-col items-center gap-2">
                                {isAuthenticated ? (
                                    <button onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }} className="campus-btn-gold w-full justify-center py-3">
                                        Dashboard <ArrowRight className="h-5 w-5" />
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={() => { navigate('/register'); setMobileMenuOpen(false); }} className="campus-btn-gold w-full justify-center py-3">Get Started Free</button>
                                        <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} className="w-full py-3 text-center font-display text-xl font-semibold italic text-campus-navy underline decoration-2 underline-offset-4">Sign in</button>
                                    </>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            <main id="main" data-intro-ui={story ? undefined : ''} inert={story} className={`landing relative z-[5] ${story ? 'hidden' : ''} ${returned ? 'story-return' : ''}`}>
                {REDUCED && <StoryCards />}
            {/* ━━━ HERO ━━━ */}
            <section id="top" data-anchor="right" className="stage world world-sky relative flex min-h-[100svh] items-center overflow-hidden pb-8 pt-20 lg:pt-20">
                <div aria-hidden className="world-layer sky-rays" />
                <div aria-hidden className="world-layer">{Array.from({ length: 34 }, (_, i) => {
                    // a fuller fall, spaced out: each petal has its own lane across the width, and neighbouring lanes start far
                    // apart in time, so they never bunch; three sizes (near ones larger and faster), pink, white and rose petals
                    const N = 34, size = [0.7, 1, 1.45][i % 3], tone = ['', ' petal-white', ' petal-deep'][(i * 7) % 3];
                    const dur = (24 - size * 6) + (i % 5) * 1.5, phase = ((i * 13) % N) / N;
                    return <span key={i} className={`petal${tone}`} style={{ left: `${((i + 0.5) / N) * 100}%`, width: `${16 * size}px`, height: `${10 * size}px`, opacity: 0.55 + size * 0.25, animationDelay: `${-phase * dur}s`, animationDuration: `${dur}s`, animationName: i % 2 ? 'petalFall' : 'petalFallAlt' }} />;
                })}</div>

                <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-6">
                    <div className="mx-auto max-w-4xl">
                        {/* copy */}
                        <div data-intro-copy className="text-center">
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                                className="max-tag mb-6 inline-flex items-center gap-2.5 max-sm:mb-5 max-sm:max-w-full">
                                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-campus-success" /><span className="relative inline-flex h-2 w-2 rounded-full bg-campus-success" /></span>
                                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-campus-navy max-sm:text-[9.5px] max-sm:tracking-[0.14em]">Grounded in sources · adapts to you</span>
                            </motion.div>

                            <h1 className="max-h1 text-campus-navy">
                                <BlurText text="A DSA tutor that" />{' '}
                                <BlurText text="shows its" delay={0.25} />{' '}<span className="max-mark italic"><BlurText text="evidence." delay={0.4} /></span>
                            </h1>

                            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
                                className="max-sub mx-auto mt-5 max-w-2xl max-sm:mt-4 max-sm:px-1 max-sm:text-[1.05rem] max-sm:leading-relaxed">
                                Every answer is built only from vetted course material, cites its sources and is checked sentence by sentence. A team of five agents then learns how <em className="not-italic font-semibold text-campus-navy">you</em> learn, and plans what to study next.
                            </motion.p>

                            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.65 }}
                                className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                                <button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/register')} className="btn-skeu group px-8 py-4 text-base max-sm:w-full max-sm:max-w-[18rem] max-sm:justify-center">
                                    {isAuthenticated ? 'Go to dashboard' : 'Start learning free'}
                                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
                                </button>
                                <a href="#workflow" onClick={(e) => { e.preventDefault(); go('workflow'); }} className="btn-glass max-btn px-6 py-4 text-base max-sm:w-full max-sm:max-w-[18rem] max-sm:justify-center">See how it works <ChevronRight className="h-4 w-4" aria-hidden /></a>
                                {!REDUCED && <button type="button" onClick={() => setStory(true)} className="btn-min px-3 py-4 text-sm font-semibold">Replay the story</button>}
                            </motion.div>

                            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                                className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-campus-warm-400 max-sm:hidden">
                                {['Free to use', 'Citations you can open', 'Refuses instead of guessing'].map((t) => (
                                    <li key={t} className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-campus-success" aria-hidden />{t}</li>
                                ))}
                            </motion.ul>
                        </div>

                    </div>

                    {/* proof strip: real, verifiable numbers */}
                    <motion.dl initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.7 }}
                        className="glass-pebble max-edge mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-4 px-6 py-5 text-center sm:grid-cols-4" style={{ borderRadius: '60px 22px 60px 22px' }}>
                        {[
                            { v: 26, s: '', l: 'concept documents' },
                            { v: 66, s: '', l: 'labelled eval questions' },
                            { v: 11, s: '', l: 'sandbox-verified challenges' },
                            { v: 5, s: '', l: 'cooperating agents' },
                        ].map((x) => (
                            <div key={x.l}>
                                <dd data-intro-stat={x.v === 26 ? '' : undefined} className="max-num text-campus-navy"><CountUp value={x.v} suffix={x.s} /></dd>
                                <dt className="mt-1 text-[11px] font-medium uppercase leading-tight tracking-wider text-campus-warm-400">{x.l}</dt>
                            </div>
                        ))}
                    </motion.dl>
                </div>
            </section>


            {/* ━━━ AGENT WORKFLOW DIAGRAM (n8n-style) ━━━ */}
            {/* a clean, still background in the section's sky colour: no drifting clouds, no glow */}
            <section id="workflow" className="stage world world-clouds world-flat flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full relative overflow-hidden" data-anchor="center">

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <Reveal className="text-center mb-14">
                        <p className="max-tag mb-5">System Architecture</p>
                        <h2 className="max-h2 text-campus-navy mb-4">
                            How Agents <span className="max-mark">Collaborate</span>
                        </h2>
                        <p className="max-sub max-w-xl mx-auto">
                            An illustrative, scripted walkthrough of how the agents hand work to each other. Hover an agent to see its connections. Your own agents' real decisions appear on the Insights page.
                        </p>
                    </Reveal>

                    <Reveal delay={0.2}>
                        <div className="glass-pebble p-2 sm:p-3" style={{ borderRadius: '48px 20px 48px 20px' }}><AgentOrchestration /></div>
                    </Reveal>
                </div>
            </section>

            {/* ━━━ AGENT DEEP-DIVE (3D tilt cards) ━━━ */}
            <section id="agents" className="stage world world-green flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full" data-anchor="center">
                <div className="max-w-7xl mx-auto px-6">
                    <Reveal className="text-center mb-16">
                        <p className="max-tag mb-5">The Intelligence Layer</p>
                        <h2 className="max-h2 text-campus-navy mb-4">
                            Meet Your AI <span className="max-mark">Team</span>
                        </h2>
                        <p className="max-sub max-w-xl mx-auto">
                            Each agent is a specialist. Together, they create something no single AI could achieve.
                        </p>
                    </Reveal>

                    <div className="flex flex-wrap justify-center gap-6">
                        {agents.map((agent, i) => (
                            <Reveal key={i} delay={i * 0.1} className="w-full md:w-[calc(50%-1.5rem)] lg:w-[calc(33.333%-1.5rem)] max-w-sm flex">
                                <TiltCard className="clay-card max-edge p-7 h-full transition-all duration-300 group w-full" style={{ borderRadius: SHAPES[i % SHAPES.length], rotate: `${[-1.1, 0.8, -0.5, 1, -0.8, 0.6][i % 6]}deg` }}>
                                    {/* Icon */}
                                    <div className={`clay-icon w-14 h-14 ${agent.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                                        <agent.icon className={`w-7 h-7 ${agent.iconColor}`} />
                                    </div>

                                    {/* Meta */}
                                    <p className="text-[10px] font-accent font-semibold uppercase tracking-[0.15em] text-campus-warm-300 mb-1">
                                        {agent.agent}
                                    </p>
                                    <h3 className="max-h3 text-campus-navy mb-3">{agent.title}</h3>
                                    <p className="text-sm font-body text-campus-warm-400 leading-relaxed mb-5">{agent.description}</p>

                                    {/* Feature pills */}
                                    <div className="flex flex-wrap gap-2">
                                        {agent.features.map((f, fi) => (
                                            <span key={fi} className="clay-chip text-[10px] font-accent font-semibold px-3 py-1">
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </TiltCard>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ━━━ DSA SYLLABUS ━━━ */}
            <section id="syllabus" className="stage world world-sky flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full relative overflow-hidden" data-anchor="right">
                <div aria-hidden className="world-layer sky-rays" />
                <div className="absolute bottom-0 right-[10%] w-80 h-80 bg-campus-gold/5 rounded-full blur-[100px]" />
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <Reveal className="mb-10 text-center">
                        <p className="max-tag mb-5">Curriculum</p>
                        <h2 className="max-h2 text-campus-navy mb-4">
                            What You'll <span className="max-mark">Master</span>
                        </h2>
                        <p className="max-sub max-w-xl mx-auto">
                            Every concept in the curriculum, grouped by topic, in the order you learn them.
                        </p>
                    </Reveal>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {syllabus.map((topic, i) => (
                            <Reveal key={i} delay={i * 0.08}>
                                <div tabIndex={0}
                                    style={{ borderRadius: SHAPES[i % SHAPES.length], rotate: `${[-1.1, 0.8, -0.5, 1, -0.8, 0.6][(i + 3) % 6]}deg` }}
                                    className="glass-pebble max-edge p-5 h-full group transition-all duration-300">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center group-hover:scale-105 transition-all duration-300" style={{ background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${GROUPS[i].color}55 70%)`, boxShadow: `0 6px 18px -6px ${GROUPS[i].color}aa` }}>
                                            <topic.icon className="w-6 h-6 text-campus-navy group-hover:text-campus-gold transition-colors" />
                                        </div>
                                        <h3 className="max-h3 text-campus-navy">{topic.title}</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {topic.topics.map((sub, si) => (
                                            <span key={si} className="glass-chip text-[10px] font-accent font-medium px-2.5 py-1">
                                                {sub}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ━━━ MASTERY INSIGHTS ━━━ */}
            <section id="insights" className="stage world world-insight flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full relative overflow-hidden" data-anchor="center">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-campus-gold/10 rounded-full blur-[140px] pointer-events-none" />
                <div className="max-w-6xl mx-auto px-6 relative z-10">
                    <Reveal className="text-center mb-16">
                        <p className="max-tag mb-5">Intelligence</p>
                        <h2 className="max-h2 text-campus-navy mb-4">
                            Your Progress, <span className="max-mark">Visualized</span>
                        </h2>
                        <p className="max-sub max-w-xl mx-auto">
                            Real-time analytics that show you exactly where you stand and what to focus on next.
                        </p>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
                        <Reveal delay={0.1} className="h-full">
                            <div className="neu-card relative px-8 pb-8 pt-14 text-center group transition-all duration-300 h-full flex flex-col justify-start">
                                <div className="neu-well w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                                    <Target className="w-8 h-8 text-campus-success" />
                                </div>
                                <span className="max-sticker absolute right-5 top-5">Live</span>
                                <h3 className="max-h3 text-campus-navy mb-3">Mastery Score</h3>
                                <p className="text-sm font-body text-campus-warm-400 leading-relaxed">
                                    A live score for every concept. Green means mastered, amber means review, red means revisit.
                                </p>
                            </div>
                        </Reveal>
                        <Reveal delay={0.2} className="h-full">
                            <div className="neu-card relative px-8 pb-8 pt-14 text-center group transition-all duration-300 h-full flex flex-col justify-start">
                                <div className="neu-well w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                                    <LineChart className="w-8 h-8 text-campus-gold" />
                                </div>
                                <span className="max-sticker absolute right-5 top-5">Over time</span>
                                <h3 className="max-h3 text-campus-navy mb-3">Learning Velocity</h3>
                                <p className="text-sm font-body text-campus-warm-400 leading-relaxed">
                                    See your mastery curve over time, and how your accuracy and response times change.
                                </p>
                            </div>
                        </Reveal>
                        <Reveal delay={0.3} className="h-full">
                            <div className="neu-card relative px-8 pb-8 pt-14 text-center group transition-all duration-300 h-full flex flex-col justify-start">
                                <div className="neu-well w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                                    <Award className="w-8 h-8 text-campus-gold" />
                                </div>
                                <span className="max-sticker absolute right-5 top-5">Named</span>
                                <h3 className="max-h3 text-campus-navy mb-3">Gap Analysis</h3>
                                <p className="text-sm font-body text-campus-warm-400 leading-relaxed">
                                    Weak prerequisites and recurring mix-ups are named, and reviews are scheduled when you are likely to forget.
                                </p>
                            </div>
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* ━━━ HOW IT WORKS ━━━ */}
            <section id="process" className="stage world world-plain flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full" data-anchor="center">
                <div className="max-w-5xl mx-auto px-6">
                    <Reveal className="text-center mb-16">
                        <p className="max-tag mb-5">Simple Process</p>
                        <h2 className="max-h2 text-campus-navy">How It <span className="max-mark">Works</span></h2>
                    </Reveal>

                    <div className="relative">
                        {/* hand-drawn arrows from one step to the next: they draw in, hold for three seconds, fade, and draw again */}
                        {[{ cls: 'left-[25%] top-10', flip: false, d: 0 }, { cls: 'left-[58.5%] top-28', flip: true, d: 0.7 }].map((ar) => (
                            <svg key={ar.cls} aria-hidden viewBox="0 0 170 110" className={`step-arrow pointer-events-none absolute hidden h-[110px] w-[170px] md:block ${ar.cls}`} style={ar.flip ? { scale: '1 -1' } : undefined}>
                                {[{ k: 'shade', stroke: 'var(--max)', dx: 4 }, { k: 'ink', stroke: 'var(--max-line)', dx: 0 }].map((l) => (
                                    <g key={l.k} transform={`translate(${l.dx} ${l.dx})`}>
                                        <path className="arrow-line" pathLength={1} d="M10 22 C 52 2, 104 8, 132 70" fill="none" stroke={l.stroke} strokeWidth="4.5" strokeLinecap="round" style={{ animationDelay: `${ar.d}s` }} />
                                        <path className="arrow-head" pathLength={1} d="M108 62 L134 76 L144 48" fill="none" stroke={l.stroke} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: `${ar.d}s` }} />
                                    </g>
                                ))}
                            </svg>
                        ))}
                        <div className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
                            {steps.map((step, i) => (
                                <Reveal key={i} delay={0.2 + i * 0.25} className={i === 1 ? 'md:mt-32' : ''}>
                                    <div className="step-card group relative mx-auto max-w-[300px] px-6 pb-7 pt-12 text-center" style={{ rotate: `${[-1.5, 1.2, -1][i]}deg` }}>
                                        <span aria-hidden className="step-num">{step.step}</span>
                                        <div className="step-blob mx-auto mb-5 grid h-20 w-20 place-items-center">
                                            <step.icon className="h-9 w-9 text-[#1b1405] transition-transform duration-500 group-hover:rotate-[-12deg] group-hover:scale-110" />
                                        </div>
                                        <h3 className="max-h3 mb-2 text-campus-navy">{step.title}</h3>
                                        <p className="text-sm leading-relaxed text-campus-warm-500">{step.desc}</p>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </div>
            </section >

            {/* ━━━ FEATURES (dark section) ━━━ */}
            <section id="features" className="stage world world-chalk flex min-h-[100svh] items-center py-20 lg:py-24 [&>*]:w-full relative overflow-hidden" data-anchor="center">
                <div aria-hidden className="world-layer ash" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-campus-gold/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-campus-success/5 rounded-full blur-[80px]" />

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <Reveal className="text-center mb-16">
                        <p className="max-tag mb-5">Platform</p>
                        <h2 className="max-h2 text-white">Everything You <span className="max-mark">Need</span></h2>
                    </Reveal>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((feat, i) => (
                            <Reveal key={i} delay={i * 0.08}>
                                <div className="brut-card p-6 group" style={{ rotate: `${[-1.2, 0.8, -0.6, 1, -0.9, 0.7][i % 6]}deg`, borderRadius: SHAPES[(i + 2) % SHAPES.length] }}>
                                    <div className="brut-icon w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-transform duration-300 group-hover:rotate-12">
                                        <feat.icon className="w-6 h-6 text-[#1b1405]" />
                                    </div>
                                    <h3 className="max-h3 text-[#1b1405] mb-1.5">{feat.title}</h3>
                                    <p className="text-sm font-body text-[#3d3020] leading-relaxed">{feat.desc}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section >

            {/* ━━━ FINAL CTA ━━━ */}
            <div className="stage world world-sky flex min-h-[100svh] flex-col">
                <div aria-hidden className="world-layer sky-rays" />
<section id="start" data-anchor="left" className="flex flex-1 items-center py-20 lg:py-16 [&>*]:w-full">
                <div className="max-w-4xl mx-auto px-6">
                    <Reveal>
                        <div className="glass-pebble max-edge relative p-10 text-center overflow-hidden lg:p-16" style={{ borderRadius: '72px 28px 72px 28px' }}>
                            <div className="absolute top-0 left-0 w-60 h-60 bg-campus-gold/8 rounded-full blur-[80px]" />
                            <div className="absolute bottom-0 right-0 w-72 h-72 bg-campus-primary/5 rounded-full blur-[80px]" />

                            <div className="relative z-10">
                                <motion.div
                                    animate={{ y: [0, -6, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                    className="w-18 h-18 bg-campus-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-campus-navy/30 w-[72px] h-[72px]"
                                >
                                    <GraduationCap className="w-9 h-9 text-campus-gold" />
                                </motion.div>
                                <h2 className="max-h2 text-campus-navy mb-4">
                                    Ready to Master <span className="max-mark">DSA?</span>
                                </h2>
                                <p className="max-sub max-w-lg mx-auto mb-8">
                                    Five agents, one learner model, and a path that adapts to every answer you give.
                                </p>
                                <HoldToStart label={isAuthenticated ? 'Go to dashboard' : 'Start learning free'} onDone={goStart} />
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section >

            {/* ━━━ FOOTER: the name large, the pages of the app, the facts ━━━ */}
            <footer className="relative px-5 pb-8 pt-4 sm:px-6">
                <div className="foot-card mx-auto max-w-6xl px-6 py-10 max-sm:py-8 sm:px-10 lg:px-14">
                    <div className="grid gap-10 max-sm:grid-cols-2 max-sm:gap-x-4 max-sm:gap-y-8 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
                        <div className="max-sm:col-span-2 max-sm:flex max-sm:flex-col max-sm:items-center max-sm:text-center">
                            <p className="foot-word text-campus-navy">Kiddoo</p>
                            <p className="max-sub mt-3 max-w-xs">A DSA tutor that shows its evidence, and learns how you learn.</p>
                            <div className="mt-6 flex gap-3">
                                {[
                                    { icon: Github, href: '#', label: 'GitHub' },
                                    { icon: Linkedin, href: '#', label: 'LinkedIn' },
                                    { icon: Twitter, href: '#', label: 'Twitter' },
                                ].map((social) => (
                                    <a key={social.label} href={social.href} aria-label={social.label} className="foot-social grid h-11 w-11 place-items-center rounded-full">
                                        <social.icon className="h-[18px] w-[18px]" />
                                    </a>
                                ))}
                            </div>
                        </div>
                        {[
                            { h: 'Learn', links: [['Ask a question', '/ask'], ['Concepts', '/concepts'], ['Learning path', '/learn'], ['Challenges', '/challenges']] },
                            { h: 'See it work', links: [['Visualizer', '/visualize'], ['Playground', '/playground'], ['Evidence Lab', '/lab'], ['Journal', '/journal']] },
                            { h: 'Kiddoo', links: [['How it works', '#workflow'], ['The AI team', '#agents'], ['Curriculum', '#syllabus'], [isAuthenticated ? 'Dashboard' : 'Create an account', isAuthenticated ? '/dashboard' : '/register']] },
                        ].map((col) => (
                            <div key={col.h} className="max-sm:last:col-span-2 max-sm:last:text-center">
                                <p className="max-tag">{col.h}</p>
                                <ul className="mt-5 space-y-3 max-sm:mt-4 max-sm:space-y-2.5">
                                    {col.links.map(([label, to]) => (
                                        <li key={label}>
                                            <a href={to} onClick={(e) => { e.preventDefault(); if (to.startsWith('#')) go(to.slice(1)); else navigate(to); }}
                                                className="foot-link font-display text-lg font-semibold text-campus-navy max-sm:text-base">{label}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t-2 border-[var(--max-line)]/15 pt-6 max-sm:mt-8 max-sm:text-center sm:flex-row">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-campus-warm-500 max-sm:text-[10px] max-sm:tracking-[0.14em]">© {new Date().getFullYear()} Kiddoo · An evidence-first DSA tutor</p>
                        <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-campus-warm-500 max-sm:text-[10px] max-sm:tracking-[0.14em]">Made with <Heart className="h-3.5 w-3.5 fill-campus-rose text-campus-rose" /> for learners everywhere</p>
                    </div>
                </div>
            </footer>
            </div>
            </main>
        </div >
    );
}
