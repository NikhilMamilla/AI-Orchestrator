import { fetchPrefs } from '../lib/learning';
import { useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { canListen, listen } from '../lib/speech';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AppBackdrop from '../components/fx/AppBackdrop';
import StageTracker from '../components/ask/StageTracker';
import AnswerCard from '../components/ask/AnswerCard';
import EvidencePanel from '../components/ask/EvidencePanel';
import TraceDetails from '../components/ask/TraceDetails';
import StyleNote from '../components/ask/StyleNote';
import ClaimChecks from '../components/ask/ClaimChecks';
import LearnerContext from '../components/ask/LearnerContext';
import QuizCard from '../components/learn/QuizCard';
import { CONCEPT_GRAPH } from '../lib/conceptGraph';
import { askStream, RagError, type AskLevel, type RagAnswer, type StageName, type Style } from '../lib/rag';

const MAX_CHARS = 1000;
const LEVELS = [{ id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' }];
const EXAMPLES = [
    'Why does binary search need a sorted array?',
    'When does quick sort degrade to O(n²)?',
    'How do I detect a cycle in a directed graph?',
    'Why does Dijkstra fail with negative edges?',
];

const STYLES: { value: Style; label: string }[] = [
    { value: 'auto', label: 'Style: auto' },
    { value: 'default', label: 'Clear & concise' },
    { value: 'socratic', label: 'Socratic' },
    { value: 'worked_example', label: 'Worked example' },
    { value: 'analogy', label: 'Analogy' },
];

type Turn = { question: string; answer: RagAnswer };

// what the evidence panel explains before the first question (README, "What is different")
const HOW = [
    { k: 'Find the passages', t: 'Dense and keyword search over the course material, fused and reranked by a cross-encoder.' },
    { k: 'Refuse when it is not there', t: 'An evidence gate stops before spending a model call if nothing relevant is found.' },
    { k: 'Answer with citations', t: 'Every claim gets a numbered source; open it here to read the passage.' },
    { k: 'Check every sentence', t: 'Each sentence is checked against its sources; weak citations are repaired.' },
    { k: 'Measure its confidence', t: 'Each answer carries a measured confidence; if the model is down, it quotes the sources instead.' },
    { k: 'Ignore planted instructions', t: 'Prompt-injection defences at ingest, query, prompt and output keep the material from steering the answer.' },
];

export default function AskPage() {
    const location = useLocation();
    const [listening, setListening] = useState(false);
    const [levelPage, setLevelPage] = useState(0);
    const stopListening = useRef<() => void>(() => undefined);
    const [query, setQuery] = useState((location.state as { query?: string } | null)?.query ?? '');
    const [level, setLevel] = useState<AskLevel>('auto');
    const [style, setStyle] = useState<Style>('auto');
    useEffect(() => { fetchPrefs().then((p) => setStyle(p.style)).catch(() => undefined); }, []);
    const [stages, setStages] = useState<StageName[]>([]);
    const [pending, setPending] = useState<string | null>(null);
    const [turn, setTurn] = useState<Turn | null>(null);
    const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeRef, setActiveRef] = useState<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const busy = pending !== null;
    // before the first question the page is one screen; once there is something to read, the page scrolls freely
    const reading = busy || turn !== null || error !== null;
    const tooLong = query.length > MAX_CHARS;

    const submit = useCallback(
        async (text: string) => {
            const q = text.trim();
            if (!q || q.length > MAX_CHARS || busy) return;
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            setPending(q);
            setStages([]);
            setError(null);
            setTurn(null);
            setActiveRef(null);
            try {
                const answer = await askStream(
                    { query: q, level, style, history },
                    (name) => setStages((s) => (s.includes(name) ? s : [...s, name])),
                    ctrl.signal,
                );
                setTurn({ question: q, answer });
                if (answer.status === 'grounded') {
                    setHistory((h) => [...h.slice(-6), { role: 'user' as const, content: q }, { role: 'assistant' as const, content: answer.text.slice(0, 1500) }]);
                }
                setActiveRef(answer.citations[0]?.ref ?? null);
                setQuery('');
                requestAnimationFrame(() => resultRef.current?.focus());
            } catch (e) {
                if ((e as Error).name === 'AbortError') setError('Stopped.');
                else setError(e instanceof RagError ? e.message : 'Something went wrong. Please try again.');
            } finally {
                setPending(null);
            }
        },
        [busy, level, style, history],
    );

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit(query);
        }
    };

    const explain = (title: string) => { setQuery(`Explain ${title}`); inputRef.current?.focus(); };

    return (
        <div className={`app-shell relative flex min-h-screen flex-col lg:flex-row ${reading ? '' : 'lg:h-[100svh] lg:overflow-hidden'}`}>
            <AppBackdrop />
            <Sidebar account={false} />

            {/* before a question: one screen on desktop. With an answer: the page scrolls normally, no inner scrolling */}
            <main className={`relative z-10 flex flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:px-6 lg:pb-5 lg:pl-2 lg:pr-6 ${reading ? '' : 'min-h-0'}`}>
                <TopBar title="Ask" subtitle="Grounded tutor" />

                <header className="shrink-0 px-1">
                    <h1 className="max-h2 text-campus-navy" style={{ fontSize: 'clamp(1.5rem, 2.2vw, 2rem)' }}>Ask anything about <span className="max-mark">DSA.</span></h1>
                    <p className="max-sub mt-1" style={{ fontSize: '0.98rem' }}>Every answer comes only from the course material and cites its sources. If the material doesn&rsquo;t cover it, Kiddoo says so instead of guessing.</p>
                </header>

                <div className={`grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr] ${reading ? 'items-start' : 'min-h-0 flex-1'}`}>
                    {/* ── the conversation: the question box, then what came back ── */}
                    <section className={`flex flex-col gap-4 ${reading ? '' : 'min-h-0'}`}>
                        <form onSubmit={(e) => { e.preventDefault(); void submit(query); }} className="sticker shrink-0 p-3" style={{ borderRadius: '28px 12px 28px 12px' }}>
                            <label htmlFor="ask-input" className="sr-only">Your question</label>
                            <textarea id="ask-input" ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} rows={2}
                                placeholder="e.g. Why is appending to a dynamic array O(1) amortized?" aria-describedby="ask-hint" aria-invalid={tooLong}
                                className="w-full resize-none bg-transparent px-2 pt-1 text-[0.95rem] text-campus-navy placeholder:text-campus-warm-400 focus:outline-none" />
                            <p id="ask-hint" className={`px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${tooLong ? 'text-campus-rose' : 'text-campus-warm-400'}`}>
                                {tooLong ? `Too long by ${query.length - MAX_CHARS}` : 'Enter to send · Shift+Enter: new line'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-[var(--max-line)]/15 pt-2.5">
                                <select aria-label="Your level" value={level} onChange={(e) => setLevel(e.target.value as AskLevel)} className="pill-select">
                                    <option value="auto">Level: auto</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                                <select aria-label="Teaching style" value={style} onChange={(e) => setStyle(e.target.value as Style)} className="pill-select">
                                    {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                                {canListen && (
                                    <button type="button" aria-pressed={listening} aria-label={listening ? 'Stop dictation' : 'Dictate your question'}
                                        onClick={() => {
                                            if (listening) { stopListening.current(); return; }
                                            setListening(true);
                                            stopListening.current = listen((t) => setQuery((q) => (q ? q + ' ' : '') + t), () => setListening(false));
                                        }}
                                        className={`btn-glass max-btn h-8 w-8 !p-0 ${listening ? '!bg-campus-rose-light text-campus-rose' : ''}`}>
                                        <Mic className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                )}
                                <span className="ml-auto" />
                                {busy ? (
                                    <button type="button" onClick={() => abortRef.current?.abort()} className="btn-glass max-btn h-9 w-9 !p-0" aria-label="Stop">
                                        <Square className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                ) : (
                                    <button type="submit" disabled={!query.trim() || tooLong} className="btn-skeu h-9 w-9 !p-0 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send question">
                                        <ArrowUp className="h-4 w-4" aria-hidden />
                                    </button>
                                )}
                            </div>
                        </form>

                        <div ref={resultRef} tabIndex={-1} aria-busy={busy} className={`flex flex-col gap-4 pb-3 pr-2 focus:outline-none ${reading ? '' : 'no-scrollbar min-h-0 flex-1 overflow-y-auto'}`}>
                            {!busy && !turn && !error && (<>
                                <div className="sticker shrink-0 p-5" style={{ borderRadius: '12px 28px 12px 28px' }}>
                                    <p className="max-tag mb-4" style={{ fontSize: '10px', padding: '0.25rem 0.75rem' }}><Sparkles className="mr-1.5 inline h-3 w-3" aria-hidden />Try one of these</p>
                                    <div className="flex flex-wrap gap-2.5">
                                        {EXAMPLES.map((ex) => (
                                            <button key={ex} type="button" onClick={() => void submit(ex)} className="step-chip rounded-full px-3.5 py-1.5 text-left text-xs font-semibold text-campus-navy">{ex}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="sticker flex min-h-0 flex-1 flex-col p-5" style={{ borderRadius: '28px 12px 28px 12px', ['--max' as string]: '#3fbf8a' }}>
                                    <div className="mb-3 grid shrink-0 grid-cols-[auto_1fr_auto] items-baseline gap-4">
                                        <h2 className="max-h3 text-campus-navy" style={{ fontSize: '1.1rem' }}>Topics Kiddoo <span className="max-mark">can answer</span></h2>
                                        <span className="truncate text-center font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-campus-warm-500">
                                            {LEVELS[levelPage].label} <span className="text-campus-warm-400">· {levelPage + 1} / {LEVELS.length}</span>
                                        </span>
                                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-campus-warm-500">{CONCEPT_GRAPH.length} concept documents</span>
                                    </div>
                                    {/* one level at a time; the arrows after the last topic step to the next or previous level */}
                                    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-1 pr-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {CONCEPT_GRAPH.filter((c) => c.level === LEVELS[levelPage].id).sort((a, b) => a.title.localeCompare(b.title)).map((c) => (
                                                <button key={c.id} type="button" onClick={() => void submit(`Explain ${c.title}`)} className="topic-chip rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold text-campus-navy">{c.title}</button>
                                            ))}
                                            <span className="flex items-center gap-1.5">
                                                <button type="button" aria-label="Previous level" disabled={levelPage === 0} onClick={() => setLevelPage((v) => v - 1)}
                                                    className="btn-glass max-btn h-7 w-7 !p-0 disabled:pointer-events-none disabled:opacity-35"><ChevronLeft className="h-3.5 w-3.5" aria-hidden /></button>
                                                <button type="button" aria-label="Next level" disabled={levelPage === LEVELS.length - 1} onClick={() => setLevelPage((v) => v + 1)}
                                                    className="btn-glass max-btn h-7 w-7 !p-0 disabled:pointer-events-none disabled:opacity-35"><ChevronRight className="h-3.5 w-3.5" aria-hidden /></button>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>)}

                            {busy && (
                                <section className="sticker p-5" aria-live="polite" style={{ borderRadius: '28px 12px 28px 12px' }}>
                                    <p className="mb-3 flex items-center gap-2 text-sm font-bold text-campus-navy">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Working on: <span className="truncate font-normal text-campus-warm-500">{pending}</span>
                                    </p>
                                    <StageTracker seen={stages} />
                                </section>
                            )}

                            {error && !busy && (
                                <div role="alert" className="rounded-[20px] border-2 border-campus-rose/40 bg-campus-rose-light p-4 text-sm text-campus-rose">{error}</div>
                            )}

                            {turn && !busy && (
                                <>
                                    <p className="max-h3 px-1 text-campus-navy" style={{ fontSize: '1.1rem' }}>{turn.question}</p>
                                    <AnswerCard answer={turn.answer} activeRef={activeRef} onCite={setActiveRef} />
                                    {turn.answer.trace.personalization && <LearnerContext info={turn.answer.trace.personalization} onExplain={explain} />}
                                    {turn.answer.status === 'grounded' && turn.answer.citations[0] && (
                                        <QuizCard key={turn.answer.trace.request_id} docId={turn.answer.citations[0].doc_id} chunkId={turn.answer.citations[0].chunk_id}
                                            title={turn.answer.citations[0].title}
                                            level={turn.answer.trace.personalization?.level_used ?? (level === 'auto' ? 'beginner' : level)}
                                            onNext={(_id, title) => explain(title)} />
                                    )}
                                </>
                            )}
                        </div>
                    </section>

                    {/* ── the evidence: the sources behind the answer, and how it was checked ── */}
                    <aside className={`sticker flex flex-col gap-4 p-5 ${reading ? '' : 'no-scrollbar min-h-0 overflow-y-auto'}`} style={{ borderRadius: '12px 28px 12px 28px', ['--max' as string]: '#9b8cff' }}>
                        <h2 className="max-h3 shrink-0 text-campus-navy" style={{ fontSize: '1.2rem' }}>The <span className="max-mark">evidence</span></h2>
                        {turn && !busy ? (
                            <>
                                <EvidencePanel evidence={turn.answer.evidence} citations={turn.answer.citations} activeRef={activeRef} onSelect={setActiveRef} />
                                {turn.answer.trace.style && <StyleNote info={turn.answer.trace.style} />}
                                <ClaimChecks trace={turn.answer.trace} />
                                <TraceDetails trace={turn.answer.trace} />
                            </>
                        ) : (
                            <ol className="space-y-3">
                                {HOW.map((h, i) => (
                                    <li key={h.k} className="flex gap-3">
                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-[var(--max-line)] bg-[var(--max)] font-heading text-xs font-extrabold text-[#1b1405]">{i + 1}</span>
                                        <span>
                                            <span className="block font-heading text-sm font-bold text-campus-navy">{h.k}</span>
                                            <span className="block text-xs leading-relaxed text-campus-warm-500">{h.t}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {!(turn && !busy) && (
                            <p className="mt-auto rounded-[18px] border-2 border-dashed border-[var(--max-line)]/20 p-4 text-xs leading-relaxed text-campus-warm-500">
                                After an answer, this panel shows the passages it used, a support check for every sentence, and the trace of
                                what ran. Answer the check question under it and your mastery updates.
                            </p>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    );
}
