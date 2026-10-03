import { CalendarCheck } from 'lucide-react';
import type { PlanBlock, SessionPlan as Plan } from '../../lib/learning';

const LABEL: Record<PlanBlock['type'], string> = { remediate: 'Fix a gap', review: 'Review', practice: 'Practice', new: 'Learn new' };
const TONE: Record<PlanBlock['type'], string> = {
    remediate: 'bg-campus-rose-light text-campus-rose',
    review: 'bg-campus-amber-light text-campus-amber',
    practice: 'bg-campus-gold-light text-campus-navy',
    new: 'bg-campus-warm-100 text-campus-warm-500',
};

export default function SessionPlan({ plan, onStart }: { plan: Plan; onStart: (b: PlanBlock) => void }) {
    const mix = plan.difficulty_mix;
    return (
        <section className="campus-card mb-8 p-5" aria-labelledby="plan-h">
            <h2 id="plan-h" className="mb-1 flex items-center gap-2 text-lg">
                <CalendarCheck className="h-5 w-5 text-campus-gold" aria-hidden /> Today&apos;s plan · {plan.minutes} min
            </h2>
            <p className="mb-3 text-xs text-campus-warm-400">
                {plan.split.new} min new · {plan.split.practice} min practice · {plan.split.review} min review, with about {mix.questions} questions
                ({mix.comfortable} comfortable, {mix.challenging} challenging, {mix.stretch} stretch).
            </p>
            {plan.notes.map((n) => (
                <p key={n} className="mb-2 rounded-campus-sm bg-campus-warm-50 p-2 text-sm text-campus-warm-500">{n}</p>
            ))}
            <ol className="space-y-2">
                {plan.blocks.map((b, i) => (
                    <li key={`${b.type}-${b.concept}-${i}`} className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[b.type]}`}>{LABEL[b.type]}</span>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-campus-navy">
                                {b.title} <span className="text-xs font-normal text-campus-warm-300">{b.minutes} min</span>
                            </p>
                            <p className="text-xs text-campus-warm-400">{b.why}</p>
                        </div>
                        <button type="button" onClick={() => onStart(b)} className="campus-btn-primary px-3 py-1.5">Start</button>
                    </li>
                ))}
            </ol>
        </section>
    );
}
