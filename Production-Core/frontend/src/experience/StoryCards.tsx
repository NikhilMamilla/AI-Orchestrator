import { AGENTS } from './copy';

/**
 * The story as five still cards, for visitors who ask for reduced motion (and anyone whose browser has no WebGL):
 * the same beats and the same words as the animated version, no 3D, no holds.
 */
const BEATS = [
    { k: 'Every learner', title: 'Every learner is different. Yet courses teach everyone the same way.', body: 'The same pages, the same pace, no matter what you already know.' },
    { k: 'Confident, not right', title: 'Most AI tutors sound confident, even when they are wrong.', body: 'Kiddoo only answers from a curated knowledge base, cites every claim, checks each sentence against its sources, and says “I don’t have enough evidence” instead of guessing.' },
    { k: 'Wasted study', title: 'Hours re-reading what you already know.', body: 'Kiddoo measures what you know (Bayesian Knowledge Tracing + spaced repetition), so you only study what you don’t.' },
    { k: 'Five agents', title: 'Five cooperating agents decide what you study next.', body: AGENTS.map((a) => a.name).join(' · ') },
    { k: 'The DSA city', title: '22 roadmap domains, joined by real prerequisite links.', body: 'Each domain lists what you will cover and the Kiddoo tools you can use for it.' },
];

export default function StoryCards() {
    return (
        <section id="story" className="stage flex min-h-[100svh] items-center py-20 [&>*]:w-full" data-anchor="center">
            <div className="mx-auto max-w-6xl px-6">
                <p className="mb-3 text-xs font-accent font-semibold uppercase tracking-[0.2em] text-campus-gold">The story</p>
                <h2 className="mb-8 font-heading text-3xl font-bold text-campus-navy lg:text-4xl">Why Kiddoo exists</h2>
                <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {BEATS.map((b, i) => (
                        <li key={b.k} className="campus-card flex flex-col p-5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-campus-warm-400">{String(i + 1).padStart(2, '0')} · {b.k}</span>
                            <h3 className="mt-3 font-display text-xl font-semibold leading-snug text-campus-navy">{b.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-campus-warm-500">{b.body}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
