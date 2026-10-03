import { GraduationCap } from 'lucide-react';
import type { Personalization } from '../../lib/rag';

interface Props {
    info: Personalization;
    onExplain: (title: string) => void;
}

/** Shows how the learner's measured mastery shaped this answer (level choice, prerequisites to revisit). */
export default function LearnerContext({ info, onExplain }: Props) {
    const seen = info.focus_mastery !== null;
    return (
        <aside className="campus-card border-l-4 border-l-campus-gold p-4" aria-label="Personalised for you">
            <p className="flex items-center gap-2 text-sm font-semibold text-campus-navy">
                <GraduationCap className="h-4 w-4 text-campus-gold" aria-hidden />
                Personalised from your progress
            </p>
            <p className="mt-1 text-sm text-campus-warm-500">
                {seen
                    ? `Your mastery of ${info.focus_title} is ${Math.round((info.focus_mastery ?? 0) * 100)}%, so this was explained at the ${info.level_used} level.`
                    : `You haven't practiced ${info.focus_title} yet, so this was explained at the ${info.level_used} level.`}
            </p>
            {info.prerequisites_to_revisit.length > 0 && (
                <div className="mt-2">
                    <p className="text-sm text-campus-warm-500">Worth revisiting first:</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                        {info.prerequisites_to_revisit.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => onExplain(p.title)}
                                    className="rounded-full bg-campus-gold-light px-3 py-1 text-xs font-semibold text-campus-navy hover:bg-campus-gold/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-campus-gold"
                                >
                                    {p.title} · {p.mastery === null ? 'not practiced' : `${Math.round(p.mastery * 100)}%`}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </aside>
    );
}
