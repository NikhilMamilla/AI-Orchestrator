import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, BookOpen, Code2, Loader2, Lock, MessageSquareText, PenTool, Search, Workflow, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import ConceptMap from '../components/concepts/ConceptMap';
import { BAND_FILL, BAND_LABEL, type MapConcept, type MapLink } from '../components/concepts/mapData';
import { CHALLENGE_CONCEPTS, DRAW_CONCEPTS, VISUALIZER_CONCEPTS } from '../experience/domains';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../lib/api';

type Filter = 'all' | 'mastered' | 'learning' | 'locked';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'mastered', label: 'Mastered' }, { id: 'learning', label: 'In progress' }, { id: 'locked', label: 'Locked' }];
const STATUS_LABEL: Record<MapConcept['status'], string> = { mastered: 'Mastered', learning: 'In progress', locked: 'Locked' };
const pct = (v: number) => Math.round(v * 100);

export default function ConceptsPage() {
    const { isAuthenticated, user } = useAuthStore();
    const navigate = useNavigate();
    const [data, setData] = useState<{ concepts: MapConcept[]; links: MapLink[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [hover, setHover] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated) { navigate('/login'); return; }
        apiClient.getConceptMap()
            .then((d: { concepts?: MapConcept[]; links?: MapLink[] } | null) => setData({ concepts: d?.concepts ?? [], links: d?.links ?? [] }))
            .catch(() => setError("Couldn't load your concept map. Please refresh in a moment."));
    }, [isAuthenticated, navigate, user?.id]);

    const concepts = useMemo(() => data?.concepts ?? [], [data]);
    const links = useMemo(() => data?.links ?? [], [data]);
    const byId = useMemo(() => Object.fromEntries(concepts.map((c) => [c.id, c])), [concepts]);
    const q = query.trim().toLowerCase();
    const matches = useMemo(() => (q ? concepts.filter((c) => c.title.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q)) : []), [concepts, q]);
    const dimmed = (c: MapConcept) => (filter !== 'all' && c.status !== filter) || (q !== '' && !matches.includes(c));

    const counts = {
        mastered: concepts.filter((c) => c.status === 'mastered').length,
        learning: concepts.filter((c) => c.status === 'learning').length,
        locked: concepts.filter((c) => c.status === 'locked').length,
    };
    const overall = concepts.length ? concepts.reduce((s, c) => s + c.mastery_level, 0) / concepts.length : 0;
    const domains = useMemo(() => {
        const m = new Map<string, MapConcept[]>();
        concepts.forEach((c) => m.set(c.domain, [...(m.get(c.domain) ?? []), c]));
        return [...m.entries()].map(([name, list]) => ({
            name, total: list.length, mastered: list.filter((c) => c.status === 'mastered').length,
            avg: list.reduce((s, c) => s + c.mastery_level, 0) / list.length,
        })).sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name));
    }, [concepts]);

    const sel = selected ? byId[selected] : null;
    const needs = sel ? links.filter((l) => l.target === sel.id).map((l) => byId[l.source]).filter(Boolean) : [];
    const unlocks = sel ? links.filter((l) => l.source === sel.id).map((l) => byId[l.target]).filter(Boolean) : [];

    return (
        <div className="app-shell relative flex min-h-screen flex-col lg:h-[100svh] lg:flex-row lg:overflow-hidden">
            <AppBackdrop />
            <Sidebar account={false} />

            {/* one screen on desktop: the map on the left, the concept (or the overview) on the right */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6">
                <TopBar title="Concepts" subtitle="Knowledge map" />

                <header className="flex shrink-0 flex-col items-start justify-between gap-3 px-1 md:flex-row md:items-end">
                    <div>
                        <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Your knowledge <span className="max-mark">map.</span></h1>
                        <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>The real prerequisite graph, coloured by your mastery. Point at a concept to see its chain; click it for details.</p>
                    </div>
                    {data && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#f3dc8f' }}><b className="font-heading text-xs">{pct(overall)}%</b> overall</span>
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#bdeed6' }}><b className="font-heading text-xs">{counts.mastered}</b> mastered</span>
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#ffd2c8' }}><b className="font-heading text-xs">{counts.learning}</b> in progress</span>
                            <span className="max-sticker !rounded-full !px-3 !py-1 !text-[10px]" style={{ background: '#e9e3d3' }}><b className="font-heading text-xs">{counts.locked}</b> locked</span>
                        </div>
                    )}
                </header>

                {error && <p role="alert" className="shrink-0 rounded-[18px] border-2 border-campus-rose/40 bg-campus-rose-light p-3 text-sm text-campus-rose">{error}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
                    {/* ── the map ── */}
                    <section className="sticker flex min-h-[480px] flex-col p-4 lg:min-h-0" style={{ borderRadius: '28px 12px 28px 12px' }} aria-label="Concept map">
                        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                            <div role="tablist" aria-label="Show" className="flex gap-1 rounded-full border-2 border-[var(--max-line)]/15 bg-[rgb(var(--c-warm-50))] p-1">
                                {FILTERS.map((f) => (
                                    <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                                        className={`relative rounded-full px-3 py-1 text-[11px] font-semibold ${filter === f.id ? 'text-[#1b1405]' : 'text-campus-warm-500 hover:text-campus-navy'}`}>
                                        {filter === f.id && <motion.span layoutId="concept-filter" className="pill-lit absolute inset-0 rounded-full" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                                        <span className="relative">{f.label}</span>
                                    </button>
                                ))}
                            </div>
                            <label className="relative ml-auto w-full max-w-[16rem]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-campus-warm-400" aria-hidden />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a concept or domain"
                                    onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) setSelected(matches[0].id); }}
                                    aria-label="Find a concept" className="share-input h-9 w-full !pl-8 text-xs" />
                            </label>
                        </div>

                        <div className="relative mt-3 min-h-0 flex-1">
                            {!data && !error && (
                                <div className="absolute inset-0 grid place-items-center text-sm text-campus-warm-500" role="status"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Drawing your map…</span></div>
                            )}
                            {data && concepts.length > 0 && (
                                <ConceptMap concepts={concepts} links={links} focus={hover ?? selected} selected={selected} dimmed={dimmed}
                                    onHover={setHover} onSelect={(id) => setSelected((s) => (s === id ? null : id))} />
                            )}
                            {data && q !== '' && matches.length === 0 && (
                                <p className="absolute inset-x-0 top-2 text-center text-xs text-campus-warm-500">No concept matches “{query}”.</p>
                            )}
                        </div>

                        <ul className="mt-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t-2 border-dashed border-[var(--max-line)]/15 pt-2.5 text-[10.5px] text-campus-warm-500" aria-label="Key">
                            {BAND_LABEL.map(([k, l]) => (
                                <li key={k} className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-full border-2 border-[var(--max-line)]" style={{ background: BAND_FILL[k] }} />{l}</li>
                            ))}
                            <li className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-[var(--max-line)] bg-campus-warm-100" />Locked</li>
                            <li className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.12em] xl:block">Arrow: needed before · solid: done</li>
                        </ul>
                    </section>

                    {/* ── the concept, or the overview ── */}
                    <aside className="sticker no-scrollbar flex min-h-[320px] flex-col overflow-y-auto p-5 lg:min-h-0" style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }} aria-live="polite">
                        <AnimatePresence mode="wait">
                            {sel ? (
                                <motion.div key={sel.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">{sel.domain}</p>
                                            <h2 className="max-h3 mt-1 text-campus-navy" style={{ fontSize: '1.3rem' }}>{sel.title}</h2>
                                        </div>
                                        <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="btn-glass max-btn h-8 w-8 shrink-0 !p-0"><X className="h-3.5 w-3.5" aria-hidden /></button>
                                    </div>

                                    <div className="rounded-[18px] border-2 border-[var(--max-line)] p-4" style={{ background: BAND_FILL[sel.band ?? 'untouched'], boxShadow: '4px 4px 0 var(--max-line)' }}>
                                        <div className="flex items-baseline justify-between">
                                            <span className="font-heading text-4xl font-extrabold leading-none text-[#1b1405]">{pct(sel.mastery_level)}%</span>
                                            <span className="max-sticker" style={{ background: '#fffaf0' }}>{STATUS_LABEL[sel.status]}</span>
                                        </div>
                                        <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#1b1405]/70">mastery{sel.difficulty ? ` · level ${sel.difficulty}` : ''}</p>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full border border-[#1b1405]/30 bg-white/60">
                                            <div className="h-full rounded-full bg-[#1b1405]" style={{ width: `${Math.max(2, pct(sel.mastery_level))}%` }} />
                                        </div>
                                        {sel.status === 'locked' && (
                                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#1b1405]"><Lock className="h-3 w-3" aria-hidden /> Opens once what it needs is at 60% or more.</p>
                                        )}
                                    </div>

                                    <Chain title="Needs first" empty="Nothing: a starting point." items={needs} onPick={setSelected} />
                                    <Chain title="Unlocks next" empty="Nothing builds on it yet." items={unlocks} onPick={setSelected} />

                                    <div>
                                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">Work on it</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Tool to="/ask" state={{ query: `Explain ${sel.title}` }} icon={MessageSquareText} label="Ask" />
                                            <Tool to="/learn" icon={BookOpen} label="Practice" />
                                            {CHALLENGE_CONCEPTS.includes(sel.id) && <Tool to="/challenges" icon={Code2} label="Challenges" />}
                                            {VISUALIZER_CONCEPTS.includes(sel.id) && <Tool to="/visualize" icon={Workflow} label="Visualizer" />}
                                            {DRAW_CONCEPTS.includes(sel.id) && <Tool to="/learn" icon={PenTool} label="Draw it" />}
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="flex flex-col gap-4">
                                    <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.15rem' }}>By <span className="max-mark">domain</span></h2>
                                    {!data && <p className="text-xs text-campus-warm-500">Loading…</p>}
                                    <ul className="space-y-2.5">
                                        {domains.map((d) => (
                                            <li key={d.name}>
                                                <button type="button" onClick={() => setQuery(d.name)} className="j-row block w-full text-left">
                                                    <span className="flex items-baseline justify-between gap-2">
                                                        <b className="truncate text-[12px] text-campus-navy">{d.name}</b>
                                                        <span className="shrink-0 font-mono text-[10px] text-campus-warm-500">{d.mastered}/{d.total} · {pct(d.avg)}%</span>
                                                    </span>
                                                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[rgb(var(--c-navy)/0.1)]">
                                                        <span className="block h-full rounded-full" style={{ width: `${Math.max(3, pct(d.avg))}%`, background: d.avg >= 0.8 ? '#3fbf8a' : d.avg >= 0.6 ? '#f3dc8f' : d.avg >= 0.4 ? '#ffb47a' : '#ff8a73' }} />
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="j-note mt-auto text-[11px] leading-relaxed text-campus-warm-500">
                                        <p className="mb-1 font-heading text-[12px] font-bold text-campus-navy">Reading the map</p>
                                        Left to right is the order to learn in. A concept opens when what it needs reaches 60%, and counts as mastered at 80%. Click a domain to find it on the map.
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </aside>
                </div>
            </main>
        </div>
    );
}

function Chain({ title, empty, items, onPick }: { title: string; empty: string; items: MapConcept[]; onPick: (id: string) => void }) {
    return (
        <div>
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">{title}</p>
            {items.length === 0 ? <p className="text-xs text-campus-warm-500">{empty}</p> : (
                <ul className="space-y-1.5">
                    {items.map((c) => (
                        <li key={c.id}>
                            <button type="button" onClick={() => onPick(c.id)} className="j-row flex w-full items-center gap-2.5 text-left">
                                <i className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--max-line)] ${c.status === 'locked' ? 'border-dashed' : ''}`}
                                    style={{ background: c.status === 'locked' ? 'rgb(var(--c-warm-100))' : BAND_FILL[c.band ?? 'untouched'] }} />
                                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-campus-navy">{c.title}</span>
                                <span className="shrink-0 font-mono text-[10px] text-campus-warm-500">{pct(c.mastery_level)}%</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-campus-warm-400" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Tool({ to, state, icon: Icon, label }: { to: string; state?: unknown; icon: React.ComponentType<{ className?: string }>; label: string }) {
    return (
        <Link to={to} state={state} className="btn-glass max-btn h-9 gap-1.5 px-3 text-xs">
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
        </Link>
    );
}
