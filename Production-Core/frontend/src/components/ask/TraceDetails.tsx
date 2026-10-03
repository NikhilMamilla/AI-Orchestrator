import type { Trace } from '../../lib/rag';

export default function TraceDetails({ trace }: { trace: Trace }) {
    const max = Math.max(1, ...trace.stages.map((s) => s.ms));
    return (
        <details className="campus-card group p-4 text-sm">
            <summary className="cursor-pointer select-none font-semibold text-campus-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold">
                How this answer was produced <span className="font-normal text-campus-warm-400">· {Math.round(trace.total_ms)} ms</span>
            </summary>
            <div className="mt-3 space-y-3">
                <ul className="space-y-1.5">
                    {trace.stages.map((s) => (
                        <li key={s.name} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2">
                            <span className="text-campus-warm-500">{s.name}</span>
                            <span className="h-2 rounded bg-campus-warm-100">
                                <span className="block h-2 rounded bg-campus-gold" style={{ width: `${Math.max(2, (s.ms / max) * 100)}%` }} />
                            </span>
                            <span className="text-right font-mono text-xs text-campus-warm-400">{s.ms} ms</span>
                        </li>
                    ))}
                </ul>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-campus-warm-500 sm:grid-cols-3">
                    {([
                        ['Intent', trace.intent],
                        ['Candidates', trace.retrieved],
                        ['Embedder', trace.embedder],
                        ['Reranker', trace.reranker],
                        ['Generator', trace.mode === 'llm' ? trace.model : trace.mode],
                        ['Tokens', trace.tokens_total],
                        ['Top score', trace.top_score],
                        ['Request', trace.request_id],
                    ] as const).map(([k, v]) =>
                        v === undefined || v === '' ? null : (
                            <div key={k} className="min-w-0">
                                <dt className="text-campus-warm-300">{k}</dt>
                                <dd className="truncate font-mono">{String(v)}</dd>
                            </div>
                        ),
                    )}
                </dl>
            </div>
        </details>
    );
}
