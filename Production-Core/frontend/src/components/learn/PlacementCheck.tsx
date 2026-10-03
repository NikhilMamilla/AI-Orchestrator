import { useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import QuizCard from './QuizCard';
import { diagnosticNext, diagnosticReset, type DiagnosticStep } from '../../lib/learning';
import { RagError } from '../../lib/rag';

interface Props {
    onFinished: () => void;
    titles: Record<string, string>;
}

/** Adaptive placement: about 8 questions; the prerequisite graph lets answers imply what you already know. */
export default function PlacementCheck({ onFinished, titles }: Props) {
    const [step, setStep] = useState<DiagnosticStep | null>(null);
    const [answered, setAnswered] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    const next = async () => {
        setBusy(true);
        setError(null);
        try {
            const s = await diagnosticNext();
            setStep(s);
            setAnswered(false);
            setOpen(true);
            if (s.done) onFinished();
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not load the next question.');
        } finally {
            setBusy(false);
        }
    };

    const restart = async () => {
        setBusy(true);
        try {
            await diagnosticReset();
            setStep(null);
            setOpen(false);
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <section className="campus-card mb-8 flex flex-wrap items-center gap-4 p-5" aria-labelledby="pl-h">
                <span className="flex h-10 w-10 items-center justify-center rounded-campus-sm bg-campus-gold/10 text-campus-gold-dark"><Compass className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-[14rem] flex-1">
                    <h2 id="pl-h" className="text-lg">Placement check</h2>
                    <p className="text-sm text-campus-warm-400">
                        About 8 adaptive questions. Each answer also tells us about related concepts, so we skip what you already know.
                    </p>
                </div>
                <button type="button" onClick={() => void next()} disabled={busy} className="campus-btn-primary px-4 py-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Find my level
                </button>
                {error && <p role="alert" className="w-full text-sm text-campus-rose">{error}</p>}
            </section>
        );
    }

    if (step?.done) {
        return (
            <section className="campus-card mb-8 p-5" aria-labelledby="pl-h">
                <h2 id="pl-h" className="mb-1 text-lg">Placement complete</h2>
                <p className="text-sm text-campus-warm-500">
                    From {step.progress.asked} questions we assume you already know{' '}
                    <strong>{step.assumed_known.length ? step.assumed_known.map((c) => titles[c] ?? c).join(', ') : 'no concepts yet'}</strong>.
                    {step.likely_gaps.length > 0 && <> Likely gaps: <strong>{step.likely_gaps.map((c) => titles[c] ?? c).join(', ')}</strong>.</>}
                </p>
                <p className="mt-2 text-xs text-campus-warm-400">
                    These are assumptions from the prerequisite graph, not measured mastery. They unlock your roadmap, and practice questions will confirm them.
                </p>
                <button type="button" onClick={() => void restart()} disabled={busy} className="mt-3 text-sm text-campus-navy underline">Retake the check</button>
            </section>
        );
    }

    if (step && !step.done) {
        return (
            <section className="mb-8" aria-label="Placement check">
                <p className="mb-2 text-sm text-campus-warm-400" role="status">Question {step.progress.asked + 1} of up to {step.progress.target}</p>
                <QuizCard key={step.quiz.quiz_id} docId={step.quiz.doc_id} title={step.quiz.title} level="beginner"
                    initialQuiz={step.quiz} compact onAnswered={() => setAnswered(true)} />
                {answered && (
                    <button type="button" onClick={() => void next()} disabled={busy} className="campus-btn-primary mt-3 px-4 py-2">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Continue
                    </button>
                )}
                {error && <p role="alert" className="mt-2 text-sm text-campus-rose">{error}</p>}
            </section>
        );
    }
    return null;
}
