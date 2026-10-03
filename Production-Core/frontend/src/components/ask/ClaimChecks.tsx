import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { Trace } from '../../lib/rag';

/** Per-sentence verification: each statement is scored against its cited source before the answer is shown. */
export default function ClaimChecks({ trace }: { trace: Trace }) {
    const checks = trace.claim_checks;
    if (!checks || checks.length === 0) return null;
    return (
        <details className="campus-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-campus-navy">
                How each sentence was checked ({checks.filter((c) => c.status === 'supported').length} supported, {checks.filter((c) => c.status === 'weak').length} partly, {checks.filter((c) => c.status === 'unsupported').length} unsupported)
            </summary>
            <p className="mt-2 text-xs text-campus-warm-400">
                Every sentence is compared with the source passages
                {trace.verifier === 'nli+lexical' ? ' using a natural-language-inference model plus word and meaning overlap' : ' using word and meaning overlap'}.
                The bar shows the support score. Partly supported means the wording goes beyond a single passage; unsupported claims are flagged and, if most of an answer is unsupported, it is withheld.
            </p>
            <ul className="mt-3 space-y-2">
                {checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                        {c.status === 'supported'
                            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-campus-success" aria-label="Supported" />
                            : <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${c.status === 'weak' ? 'text-campus-amber' : 'text-campus-rose'}`} aria-label={c.status === 'weak' ? 'Partly supported' : 'Not supported'} />}
                        <div className="min-w-0 flex-1">
                            <p className="text-campus-warm-500">{c.text}</p>
                            <div className="mt-1 flex items-center gap-2">
                                <div className="h-1.5 w-28 rounded bg-campus-warm-100" role="progressbar" aria-valuenow={Math.round(c.support * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Support score">
                                    <div className={`h-1.5 rounded ${c.status === 'supported' ? 'bg-campus-success' : c.status === 'weak' ? 'bg-campus-amber' : 'bg-campus-rose'}`} style={{ width: `${Math.max(3, c.support * 100)}%` }} />
                                </div>
                                <span className="font-mono text-[11px] text-campus-warm-400">
                                    {Math.round(c.support * 100)}%{c.cited.length > 0 && ` · source ${c.cited.join(', ')}`}
                                </span>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </details>
    );
}
