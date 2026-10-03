import { Link } from 'react-router-dom';
import { Radar } from 'lucide-react';
import type { Insights } from '../../lib/learning';

export default function AnalystCard({ insights }: { insights: Insights }) {
    const best = insights.best_time_of_day;
    return (
        <section className="campus-card mb-8 p-5" aria-labelledby="an-h">
            <h2 id="an-h" className="mb-1 flex items-center gap-2 text-lg">
                <Radar className="h-5 w-5 text-campus-gold" aria-hidden /> What the analyst noticed
            </h2>
            <p className="mb-3 text-xs text-campus-warm-400">
                From {insights.attempts} recorded answers
                {insights.accuracy !== null && ` · ${Math.round(insights.accuracy * 100)}% correct`}
                {insights.median_seconds !== null && ` · typical ${Math.round(insights.median_seconds)}s per question`}
            </p>
            {insights.note && <p className="text-sm text-campus-warm-400">{insights.note}</p>}
            {insights.signals.length === 0 && !insights.note && (
                <p className="text-sm text-campus-warm-400">No concerning patterns right now.</p>
            )}
            <ul className="space-y-2">
                {insights.signals.map((s) => (
                    <li key={s.id + s.title} className={`rounded-campus-sm p-3 text-sm ${s.severity === 'warn' ? 'bg-campus-amber-light' : 'bg-campus-warm-50'}`}>
                        <p className="font-semibold text-campus-navy">{s.title}</p>
                        <p className="text-campus-warm-500">{s.detail}</p>
                        {s.ask && (
                            <Link to="/ask" state={{ query: s.ask }} className="mt-1 inline-block text-campus-navy underline">
                                Ask: {s.ask}
                            </Link>
                        )}
                    </li>
                ))}
            </ul>
            {best && (
                <p className="mt-3 text-xs text-campus-warm-400">
                    You answer best in the {best.bucket} ({Math.round(best.accuracy * 100)}% over {best.n} answers).
                </p>
            )}
        </section>
    );
}
