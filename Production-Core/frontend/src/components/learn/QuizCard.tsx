import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Target, XCircle } from 'lucide-react';
import { answerQuiz, createQuiz, requestHint, type AnswerResult, type Confidence, type Hint, type QuizQuestion } from '../../lib/learning';
import { RagError, type Level } from '../../lib/rag';

interface Props {
    docId: string;
    title: string;
    level: Level;
    chunkId?: string;
    /** Start immediately instead of waiting for the learner to ask for a question. */
    autoStart?: boolean;
    onNext?: (conceptId: string, title: string) => void;
    /** A question that was already created server-side (placement check). */
    initialQuiz?: QuizQuestion;
    onAnswered?: (result: AnswerResult) => void;
    /** Hide 'another question' and 'next concept' buttons. */
    compact?: boolean;
}

const ACTION_LABEL: Record<AnswerResult['decision']['action'], string> = {
    advance: 'Move on',
    deepen: 'Keep practicing',
    remediate: 'Revisit a prerequisite',
    review: 'Review this concept',
    complete: 'Curriculum complete',
};

export default function QuizCard({ docId, title, level, chunkId, autoStart, onNext, initialQuiz, onAnswered, compact }: Props) {
    const [quiz, setQuiz] = useState<QuizQuestion | null>(initialQuiz ?? null);
    const [picked, setPicked] = useState<number | null>(null);
    const [result, setResult] = useState<AnswerResult | null>(null);
    const [busy, setBusy] = useState<'making' | 'grading' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confidence, setConfidence] = useState<Confidence | null>(null);
    const [hints, setHints] = useState<Hint[]>([]);
    const headingRef = useRef<HTMLHeadingElement>(null);

    const start = async () => {
        setBusy('making');
        setError(null);
        setResult(null);
        setPicked(null);
        setConfidence(null);
        setHints([]);
        try {
            setQuiz(await createQuiz(docId, level, chunkId));
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not create a question right now.');
        } finally {
            setBusy(null);
        }
    };

    useEffect(() => {
        if (autoStart && !initialQuiz) void start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId, chunkId]);

    useEffect(() => {
        if (quiz) headingRef.current?.focus();
    }, [quiz]);

    const submit = async (i: number) => {
        if (!quiz || busy || result) return;
        setPicked(i);
        setBusy('grading');
        try {
            const r = await answerQuiz(quiz.quiz_id, i, confidence ?? undefined);
            setResult(r);
            onAnswered?.(r);
        } catch (e) {
            setPicked(null);
            setError(e instanceof RagError ? e.message : 'Could not record your answer.');
        } finally {
            setBusy(null);
        }
    };

    const askHint = async () => {
        if (!quiz || busy || result || hints.length >= 2) return;
        setBusy('grading');
        try {
            const h = await requestHint(quiz.quiz_id);
            setHints((prev) => [...prev, h]);
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'No hint available right now.');
        } finally {
            setBusy(null);
        }
    };
    const eliminated = new Set(hints.map((h) => h.eliminate).filter((x): x is number => x !== null));

    if (!quiz) {
        return (
            <section className="campus-card flex flex-wrap items-center gap-4 p-5" aria-label="Check your understanding">
                <span className="flex h-10 w-10 items-center justify-center rounded-campus-sm bg-campus-gold/10 text-campus-gold-dark"><Target className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-[14rem] flex-1">
                    <p className="font-semibold text-campus-navy">Check your understanding of {title}</p>
                    <p className="text-sm text-campus-warm-400">One question from the passage you just read. Your answer updates your mastery and schedules a review.</p>
                </div>
                <button type="button" onClick={() => void start()} disabled={busy === 'making'} className="campus-btn-primary px-4 py-2">
                    {busy === 'making' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                    {busy === 'making' ? 'Writing a question…' : 'Quiz me'}
                </button>
                {error && <p role="alert" className="w-full text-sm text-campus-rose">{error}</p>}
            </section>
        );
    }

    return (
        <section className="campus-card p-5" aria-labelledby={`q-${quiz.quiz_id}`}>
            <p className="mb-1 font-accent text-[11px] uppercase tracking-wider text-campus-warm-300">
                {quiz.title} · {quiz.generated_by === 'llm' ? 'written from your source' : 'from the course text'}
            </p>
            <h2 id={`q-${quiz.quiz_id}`} ref={headingRef} tabIndex={-1} className="mb-4 text-lg focus:outline-none">{quiz.question}</h2>

            <ul className="space-y-2" role="radiogroup" aria-label="Answer options">
                {quiz.options.map((opt, i) => {
                    const isKey = result && i === result.correct_index;
                    const isWrongPick = result && i === picked && !result.correct;
                    return (
                        <li key={i}>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={picked === i}
                                disabled={!!result || busy === 'grading' || eliminated.has(i)}
                                onClick={() => void submit(i)}
                                className={`flex w-full items-start gap-3 rounded-campus-sm border p-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold ${
                                    eliminated.has(i) ? 'border-campus-warm-100 bg-campus-warm-50 line-through opacity-50'
                                    : isKey ? 'border-campus-success bg-campus-success-light'
                                        : isWrongPick ? 'border-campus-rose bg-campus-rose-light'
                                            : 'border-campus-warm-100 bg-campus-ivory hover:border-campus-gold'
                                } disabled:cursor-default`}
                            >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-campus-warm-100 text-[11px] font-semibold">{'ABCD'[i]}</span>
                                <span className="flex-1">{opt}</span>
                                {isKey && <CheckCircle2 className="h-5 w-5 text-campus-success" aria-label="Correct answer" />}
                                {isWrongPick && <XCircle className="h-5 w-5 text-campus-rose" aria-label="Your answer was wrong" />}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {!result && (
                <div className="mt-4 space-y-3">
                    <div role="radiogroup" aria-label="How sure are you?" className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-campus-warm-400">How sure are you?</span>
                        {(['guess', 'unsure', 'sure'] as Confidence[]).map((c) => (
                            <button key={c} type="button" role="radio" aria-checked={confidence === c} onClick={() => setConfidence(c)}
                                className={`rounded-full px-3 py-1 font-semibold capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold ${confidence === c ? 'bg-campus-primary text-white' : 'bg-campus-warm-100 text-campus-warm-500'}`}>
                                {c === 'guess' ? 'Just guessing' : c === 'unsure' ? 'Not sure' : 'Sure'}
                            </button>
                        ))}
                        <button type="button" onClick={() => void askHint()} disabled={hints.length >= 2 || busy !== null}
                            className="ml-auto rounded-campus-sm px-3 py-1 text-campus-navy underline disabled:opacity-40">
                            {hints.length === 0 ? 'Need a hint?' : hints.length === 1 ? 'Show the source' : 'No more hints'}
                        </button>
                    </div>
                    {hints.map((h) => (
                        <div key={h.level} className="rounded-campus-sm bg-campus-gold-light p-3 text-sm text-campus-warm-500" role="note">
                            <p>{h.text}</p>
                            {h.source && <blockquote className="mt-2 border-l-2 border-campus-gold pl-3 text-campus-warm-500">{h.heading && <strong className="block text-xs">{h.heading}</strong>}{h.source}</blockquote>}
                        </div>
                    ))}
                </div>
            )}

            {busy === 'grading' && <p className="mt-3 flex items-center gap-2 text-sm text-campus-warm-400" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…</p>}
            {error && <p role="alert" className="mt-3 text-sm text-campus-rose">{error}</p>}

            {result && (
                <div className="mt-5 space-y-3" aria-live="polite">
                    {result.hints_used > 0 && <p className="text-xs text-campus-warm-400">You used {result.hints_used} hint{result.hints_used > 1 ? 's' : ''}, so this answer counted for slightly less mastery.</p>}
                    <p className={`font-semibold ${result.correct ? 'text-campus-success' : 'text-campus-rose'}`}>{result.correct ? 'Correct.' : 'Not quite.'}</p>
                    {result.explanation && <p className="text-sm text-campus-warm-500">{result.explanation}</p>}
                    {!result.correct && result.misconception && <p className="rounded-campus-sm bg-campus-amber-light p-2.5 text-sm text-campus-warm-500"><strong>Why it's tempting:</strong> {result.misconception}</p>}

                    <div>
                        <div className="mb-1 flex justify-between text-xs text-campus-warm-400">
                            <span>Mastery of {quiz.title}</span>
                            <span className="font-mono">{Math.round(result.mastery_before * 100)}% → {Math.round(result.mastery_after * 100)}%</span>
                        </div>
                        <div className="relative h-2.5 rounded bg-campus-warm-100" role="progressbar" aria-valuenow={Math.round(result.mastery_after * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Mastery">
                            <div className="absolute inset-y-0 left-0 rounded bg-campus-gold/40 transition-all duration-700" style={{ width: `${result.mastery_before * 100}%` }} />
                            <div className={`absolute inset-y-0 left-0 rounded transition-all duration-700 ${result.mastered ? 'bg-campus-success' : 'bg-campus-gold'}`} style={{ width: `${result.mastery_after * 100}%` }} />
                            <div className="absolute inset-y-[-3px] w-px bg-campus-primary/50" style={{ left: '80%' }} title="Mastery threshold (80%)" />
                        </div>
                    </div>

                    <div className="rounded-campus-sm border border-campus-warm-100 bg-campus-ivory p-3 text-sm">
                        <p className="font-semibold text-campus-navy">Orchestrator: {ACTION_LABEL[result.decision.action]}</p>
                        <p className="text-campus-warm-500">{result.decision.reasoning}</p>
                    </div>

                    {!compact && <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void start()} className="campus-btn bg-campus-ivory px-3 py-2 text-campus-navy ring-1 ring-campus-warm-200">Another question</button>
                        {onNext && result.next.slice(0, 2).map((n) => (
                            <button key={n.id} type="button" onClick={() => onNext(n.id, n.title)} className="campus-btn-primary px-3 py-2">Next: {n.title}</button>
                        ))}
                    </div>}
                </div>
            )}
        </section>
    );
}
