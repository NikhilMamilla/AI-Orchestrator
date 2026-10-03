import { FlaskConical } from 'lucide-react';
import type { StyleInfo } from '../../lib/rag';

const NAME: Record<string, string> = { default: 'clear & concise', socratic: 'Socratic', worked_example: 'worked-example', analogy: 'analogy' };

/** Shows the measured evidence behind an automatically chosen teaching style. */
export default function StyleNote({ info }: { info: StyleInfo }) {
    const tried = Object.entries(info.summary.styles).filter(([, v]) => v.n > 0);
    return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-campus-warm-400">
            <FlaskConical className="h-3.5 w-3.5 text-campus-gold" aria-hidden />
            Explained in the <strong className="text-campus-navy">{NAME[info.used] ?? info.used}</strong> style, chosen automatically.
            {info.summary.total_trials === 0
                ? ' No trials yet: your next check question starts teaching me what works for you.'
                : ` Measured so far: ${tried.map(([k, v]) => `${NAME[k] ?? k} ${v.wins}/${v.n}`).join(', ')}.`}
            {info.summary.best && <> Best so far: <strong className="text-campus-navy">{NAME[info.summary.best]}</strong>.</>}
        </p>
    );
}
