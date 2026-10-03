import { Check, Loader2 } from 'lucide-react';
import type { StageName, TraceStage } from '../../lib/rag';

const LABELS: Record<StageName, string> = {
    screen: 'Checking the question',
    understand: 'Understanding intent and concepts',
    retrieve: 'Searching course material (keyword + semantic)',
    rerank: 'Ranking candidate passages',
    context: 'Building the evidence set',
    generate: 'Writing the answer from evidence',
    verify: 'Verifying each claim against its source',
};

interface Props {
    /** Stages the server has actually started, in order. Nothing is shown that did not run. */
    seen: StageName[];
    /** Final per-stage timings; present once the answer has arrived. */
    finished?: TraceStage[];
}

export default function StageTracker({ seen, finished }: Props) {
    const ms = new Map((finished ?? []).map((s) => [s.name, s.ms]));
    return (
        <ol className="space-y-2" aria-label="Progress">
            {seen.map((name, i) => {
                const done = !!finished || i < seen.length - 1;
                return (
                    <li key={name} className="flex items-center gap-3 text-sm">
                        <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full ${
                                done ? 'bg-campus-success text-white' : 'bg-campus-gold-light text-campus-navy'
                            }`}
                        >
                            {done ? <Check className="h-3 w-3" aria-hidden /> : <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                        </span>
                        <span className={done ? 'text-campus-warm-400' : 'font-medium text-campus-ink'}>{LABELS[name]}</span>
                        {ms.has(name) && <span className="ml-auto font-mono text-xs text-campus-warm-300">{ms.get(name)} ms</span>}
                    </li>
                );
            })}
        </ol>
    );
}
