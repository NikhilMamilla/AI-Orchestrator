import { useEffect, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { fetchGoal, saveGoal, type GoalPlan } from '../../lib/learning';
import { RagError } from '../../lib/rag';

const STATUS_TONE: Record<string, string> = {
    on_track: 'bg-campus-success-light text-campus-success',
    done: 'bg-campus-success-light text-campus-success',
    tight: 'bg-campus-amber-light text-campus-amber',
    unrealistic: 'bg-campus-rose-light text-campus-rose',
    past_deadline: 'bg-campus-rose-light text-campus-rose',
};

function isoIn(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function GoalCard({ titles }: { titles: Record<string, string> }) {
    const [plan, setPlan] = useState<GoalPlan | null>(null);
    const [editing, setEditing] = useState(false);
    const [goal, setGoal] = useState('');
    const [deadline, setDeadline] = useState(isoIn(30));
    const [minutes, setMinutes] = useState(45);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchGoal().then((p) => { setPlan(p); setEditing(!p.goal); }).catch(() => setEditing(true));
    }, []);

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            setPlan(await saveGoal(goal || null, deadline, minutes));
            setEditing(false);
        } catch (e) {
            setError(e instanceof RagError ? e.message : 'Could not save your goal.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="campus-card mb-8 p-5" aria-labelledby="goal-h">
            <h2 id="goal-h" className="mb-3 flex items-center gap-2 text-lg"><Flag className="h-5 w-5 text-campus-gold" aria-hidden /> Your goal</h2>
            {editing ? (
                <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10.5rem_6.5rem]" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                    <label className="text-sm">Target
                        <select value={goal} onChange={(e) => setGoal(e.target.value)} title={goal ? titles[goal] : 'Whole curriculum'} className="mt-1 w-full truncate rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-2.5 py-2">
                            <option value="">Whole curriculum</option>
                            {Object.entries(titles).map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                        </select>
                    </label>
                    <label className="text-sm">Deadline
                        <input type="date" required min={isoIn(1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 w-full rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-2.5 py-2" />
                    </label>
                    <label className="text-sm">Min / day
                        <input type="number" min={10} max={480} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 w-full rounded-campus-sm border border-campus-warm-200 bg-campus-surface px-2.5 py-2" />
                    </label>
                    <div className="flex items-center gap-3 sm:col-span-3">
                        <button type="submit" disabled={busy} className="campus-btn-primary px-4 py-2">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Plan it
                        </button>
                        {plan?.goal && <button type="button" onClick={() => setEditing(false)} className="text-sm text-campus-navy underline">Cancel</button>}
                        {error && <p role="alert" className="text-sm text-campus-rose">{error}</p>}
                    </div>
                </form>
            ) : plan && plan.goal ? (
                <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[plan.status ?? ''] ?? 'bg-campus-warm-100'}`}>{(plan.status ?? '').replace('_', ' ')}</span>
                        <span className="text-campus-warm-500">{plan.advice}</span>
                    </p>
                    <p className="mt-1 text-xs text-campus-warm-400">
                        {plan.remaining_concepts} concepts left · {plan.days_left} days · {plan.assumption}
                    </p>
                    <ol className="mt-3 space-y-1.5 text-sm">
                        {(plan.weeks ?? []).map((w) => (
                            <li key={w.week}><strong className="text-campus-navy">Week {w.week}</strong> · {w.concepts.map((c) => c.title).join(', ')} <span className="text-xs text-campus-warm-300">{w.minutes} min</span></li>
                        ))}
                    </ol>
                    {(plan.unscheduled_concepts ?? 0) > 0 && <p className="mt-2 text-xs text-campus-rose">{plan.unscheduled_concepts} concepts don&apos;t fit before the deadline.</p>}
                    <button type="button" onClick={() => setEditing(true)} className="mt-3 text-sm text-campus-navy underline">Change goal</button>
                </div>
            ) : null}
        </section>
    );
}
