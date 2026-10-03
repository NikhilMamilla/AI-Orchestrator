import type { CSSProperties, ReactNode } from 'react';
import { STAGES, type StageId } from './flow';
import { AGENTS, RING_P } from './copy';
import { useExperience } from './store';
import { PLACEHOLDERS_ENABLED as ASSETS } from '../lib/experienceAssets';
import { Script } from '../components/fx/ScriptWord';

/**
 * The statement lines of each stage. The engine fades every [data-in] element in (with blur) at progress `data-in` and
 * out at `data-out`, so the words move with the scroll exactly like the 3D scene does.
 */

const HIDDEN: CSSProperties = { opacity: 0, visibility: 'hidden', willChange: 'opacity, transform, filter' };

function L({ a, b, className = '', children }: { a: number; b?: number; className?: string; children: ReactNode }) {
    return <div aria-hidden data-in={a} data-out={b} className={`pointer-events-none ${className}`} style={HIDDEN}>{children}</div>;
}

function Stage({ id, title, children }: { id: StageId; title: string; children: ReactNode }) {
    const active = useExperience((s) => STAGES[s.stage].id === id);
    return (
        <section data-stage-overlay={id} aria-hidden={!active} className={`absolute inset-0 ${active ? '' : 'hidden'}`}>
            <h2 className="sr-only">{title}</h2>
            {children}
        </section>
    );
}

const small = 'font-mono text-[11px] uppercase tracking-[0.4em] text-white/60';

export default function Overlays() {
    return (
        <div className="exp-lines pointer-events-none absolute inset-0 z-[2] text-[#f5f3ea]">
            {/* stage 1 plays over a light scene (the garden), so its words are in deep teal; text windows follow the reference */}
            <Stage id="believed" title="Every learner is different. Yet courses teach everyone the same way: the same pages, the same pace, no matter what you already know.">
                {/* the scroll pill lives in ScrollHint: it comes back after 2 s without scrolling, on every stage */}
                {/* straight after the zero: the opening words are already on screen */}
                <L a={-0.1} b={0.6} className="halo absolute left-[6vw] top-[9svh]">
                    <p className="ink-deep-flat ml-[1vw] font-display text-[clamp(1.6rem,4vw,4.4rem)] font-medium italic leading-none">Yet</p>
                    <Script deep first="C" rest="ourses" size="clamp(3rem, 9.4vw, 10.5rem)" tuck={0.72} className="mt-[0.6vw]" />
                    <p className="ink-deep-flat -mt-[3vw] text-right font-display text-[clamp(1.6rem,4.6vw,5rem)] font-medium italic leading-none">teach</p>
                </L>
                <L a={0.24} b={0.6} className="halo absolute bottom-[15svh] right-[6vw] text-right">
                    <Script deep first="E" rest="veryone" size="clamp(3rem, 9.4vw, 10.5rem)" />
                    <p className="ink-deep-flat -mt-[3vw] font-display text-[clamp(1.6rem,4.6vw,5rem)] font-medium italic leading-none">the same way.</p>
                </L>
                <L a={0.62} b={0.95} className="absolute inset-0 grid place-items-center text-center max-sm:px-8">
                    <div className="halo relative">
                        <p className="ink-deep-flat font-display text-[clamp(1.9rem,4.8vw,5rem)] font-semibold leading-[1.05]">The same pages,<br />the same pace,</p>
                        <p className="ink-deep mt-1 inline-block font-script text-[clamp(2.6rem,6.6vw,7rem)] leading-[1.1] max-sm:mx-0 max-sm:mt-2 max-sm:px-0 max-sm:text-[1.75rem]">no matter what you know.</p>
                    </div>
                </L>
            </Stage>

            <Stage id="shatter" title="Most AI tutors sound confident. Even when they are wrong. Kiddoo shows its evidence.">
                {/* with the assets the stage-one frame breaks first (to 0.22); the procedural pane carries the first line itself */}
                {ASSETS && (
                    <L a={-0.1} b={0.2} className="absolute inset-0 grid place-items-center text-center">
                        <div>
                            <p className="story-ink font-display text-[clamp(1.8rem,5vw,5.4rem)] font-semibold leading-none">Most AI tutors</p>
                            <p className="mt-1 leading-none">
                                <span className="story-ink relative left-[1.2vw] font-display text-[clamp(1.6rem,4.4vw,4.6rem)] font-medium italic leading-none">sound </span>
                                <Script first="C" rest="onfident." size="clamp(2.6rem, 7.6vw, 8.2rem)" tuck={0.72} />
                            </p>
                        </div>
                    </L>
                )}
                <L a={ASSETS ? 0.17 : 0.36} b={ASSETS ? 0.38 : 0.56} className="absolute inset-0 grid place-items-center text-center">
                    <div>
                        <p className="story-ink font-display text-[clamp(1.8rem,5vw,5.4rem)] font-semibold italic leading-none">Even when</p>
                        <p className="story-ink mt-3 font-display text-[clamp(2.4rem,7vw,7.6rem)] font-semibold leading-none">
                            <span className="text-[0.6em] font-medium italic">they are </span>Wrong.
                        </p>
                    </div>
                </L>
                <L a={ASSETS ? 0.74 : 0.6} b={1.06} className="absolute inset-x-0 top-[30svh] flex justify-center pr-[22vw] max-sm:top-[22svh] max-sm:pr-0">
                    {/* centred, nudged left: the bottom right holds the detail line */}
                    <div>
                        <p className="story-ink font-display text-[clamp(1.6rem,4.4vw,4.6rem)] font-semibold leading-none">Kiddoo shows its</p>
                        <Script first="E" rest="vidence." size="clamp(2.6rem, 7.4vw, 8rem)" className="ml-[6vw]" />
                    </div>
                </L>
                <L a={ASSETS ? 0.78 : 0.64} b={1.06} className="absolute bottom-[15svh] right-[6vw] max-w-[22rem] text-right text-sm leading-relaxed text-white/75 max-sm:inset-x-8 max-sm:bottom-auto max-sm:top-[44svh] max-sm:mx-auto max-sm:max-w-[19rem] max-sm:text-center max-sm:text-[15px] max-sm:text-white/85">
                    Kiddoo only answers from a curated knowledge base, cites every claim, and checks each sentence against its sources.
                </L>
            </Stage>

            <Stage id="burn" title="Hours re-reading what you already know. Guessing instead of evidence. Kiddoo measures what you know, so you only study what you don't.">
                <L a={0.04} b={0.28} className="absolute bottom-[15svh] left-[6vw] [&>*]:drop-shadow-[0_3px_14px_rgb(0_0_0/0.85)]">
                    <p className="story-ink font-display text-[clamp(1.8rem,5vw,5.4rem)] font-semibold leading-none">Hours</p>
                    <Script first="R" rest="e-reading" size="clamp(2.6rem, 7.6vw, 8.4rem)" className="ml-[5vw]" />
                </L>
                <L a={0.1} b={0.28} className="absolute right-[6vw] top-[10svh] text-right [&>*]:drop-shadow-[0_3px_14px_rgb(0_0_0/0.85)]">
                    <p className="story-ink font-display text-[clamp(1.4rem,4vw,4.2rem)] font-medium italic leading-none">what you already</p>
                    <Script first="K" rest="now." size="clamp(2.6rem, 7.6vw, 8.4rem)" />
                </L>
                <L a={0.3} b={0.46} className="absolute inset-0 grid place-items-center text-center">
                    <div>
                        <Script first="G" rest="uessing" size="clamp(3rem, 8.6vw, 9.4rem)" tuck={0.66} />
                        <p className="story-ink -mt-[0.6vw] font-display text-[clamp(1.5rem,4.2vw,4.4rem)] font-medium italic leading-none">instead of evidence.</p>
                    </div>
                </L>
                {/* centred over the board: "Kiddoo" in italics beside the top of the calligraphic "M" */}
                <L a={0.5} b={0.84} className="absolute inset-0 grid place-items-center pb-[4svh] text-left">
                    <div style={{ width: 'min(80vw, 118svh, 1060px)', containerType: 'inline-size' }}>
                        <div className="relative">
                            <p className="story-ink absolute bottom-[16cqw] left-[36cqw] font-display text-[13cqw] font-semibold italic leading-none tracking-[-0.01em]">Kiddoo</p>
                            <Script first="M" rest="easures" size="17cqw" tuck={0.74} className="ml-[4cqw] pt-[14cqw]" />
                        </div>
                        <p className="story-ink mr-[10cqw] -mt-[4cqw] text-right font-display text-[6.4cqw] font-medium italic leading-none">what you know.</p>
                        <p className={`mt-[4cqw] text-center ${small}`}>Bayesian Knowledge Tracing + spaced repetition</p>
                    </div>
                </L>
                {/* the hold: the words sit either side of the ring */}
                <L a={0.86} b={1.06} className="absolute left-[6vw] top-[12svh]">
                    <p className="story-ink font-display text-[clamp(1.5rem,4vw,4.2rem)] font-medium italic leading-none">so you only</p>
                    <p className="story-ink mt-1 font-display text-[clamp(2.4rem,6.6vw,7rem)] font-semibold leading-none">study</p>
                </L>
                <L a={0.88} b={1.06} className="absolute bottom-[16svh] right-[6vw] text-right">
                    <p className="story-ink font-display text-[clamp(1.5rem,4vw,4.2rem)] font-medium italic leading-none">what you</p>
                    <Script first="D" rest="on’t." size="clamp(2.8rem, 7.6vw, 8.4rem)" tuck={0.7} />
                </L>
            </Stage>

            <Stage id="tunnel" title="Five cooperating agents decide what you should study next.">
                <L a={-0.1} b={0.12} className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="story-ink font-display text-[clamp(1.6rem,4.6vw,4.8rem)] font-semibold leading-none">Five cooperating</p>
                    <Script first="A" rest="gents" size="clamp(2.8rem, 8vw, 8.6rem)" />
                </L>
                {AGENTS.map((ag, i) => (
                    <L key={ag.name} a={RING_P[i] - 0.07} b={RING_P[i] + 0.07} className="absolute inset-x-0 bottom-[17svh] px-6 text-center [&>*]:drop-shadow-[0_2px_10px_rgb(0_0_0/0.8)]">
                        <p className="font-mono text-xs uppercase tracking-[0.4em] text-[#f3dc8f]/85">{String(i + 1).padStart(2, '0')} / 05</p>
                        <p className="mt-3 leading-none"><Script first={ag.name[0]} rest={ag.name.slice(1)} size="clamp(2rem, 5vw, 5rem)" tuck={0.7} /></p>
                        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">{ag.does}</p>
                    </L>
                ))}
                <L a={0.77} b={0.93} className="absolute inset-0 flex flex-col items-center justify-center text-center [&>*]:drop-shadow-[0_2px_12px_rgb(0_0_0/0.8)]">
                    <p className="story-ink font-display text-[clamp(1.4rem,4vw,4.2rem)] font-medium italic leading-none">deciding what you study</p>
                    <Script first="N" rest="ext." size="clamp(2.8rem, 8vw, 8.6rem)" />
                </L>
            </Stage>

            {/* the city's opening, over the clouds: what is real about Kiddoo (README, docs/LEARNING.md), then the map */}
            <Stage id="city" title="Introducing Kiddoo: real sources, real practice, real progress. Explore the 22 domains of DSA.">
                <L a={-0.1} b={0.2} className="halo absolute inset-0 grid place-items-center text-center">
                    <div>
                        <Script deep first="I" rest="ntroducing" size="clamp(1.8rem, 4.6vw, 4.6rem)" />
                        <p className="ink-deep-flat font-display text-[clamp(3.4rem,11vw,11rem)] font-semibold leading-none tracking-[-0.02em]">Kiddoo</p>
                    </div>
                </L>
                <L a={0.2} b={0.38} className="halo absolute inset-0 grid place-items-center text-center">
                    <div className="relative">
                        <Script deep first="R" rest="eal" size="clamp(1.8rem, 4.6vw, 4.8rem)" />
                        <p className="ink-deep-flat -mt-[0.3em] ml-[10vw] font-display text-[clamp(3rem,9vw,9.6rem)] font-semibold leading-none tracking-[-0.02em]">sources</p>
                        <p className="ink-deep-flat ml-[24vw] mt-1 font-display text-[clamp(1rem,2.2vw,2.2rem)] italic leading-tight">that every answer cites</p>
                    </div>
                </L>
                <L a={0.38} b={0.56} className="halo absolute inset-0 grid place-items-center text-center">
                    <div className="relative">
                        <Script deep first="R" rest="eal" size="clamp(1.8rem, 4.6vw, 4.8rem)" />
                        <p className="ink-deep-flat -mt-[0.3em] ml-[10vw] font-display text-[clamp(3rem,9vw,9.6rem)] font-semibold leading-none tracking-[-0.02em]">practice</p>
                        <p className="ink-deep-flat ml-[24vw] mt-1 font-display text-[clamp(1rem,2.2vw,2.2rem)] italic leading-tight">graded by real execution</p>
                    </div>
                </L>
                <L a={0.56} b={0.74} className="halo absolute inset-0 grid place-items-center text-center">
                    <div className="relative">
                        <Script deep first="R" rest="eal" size="clamp(1.8rem, 4.6vw, 4.8rem)" />
                        <p className="ink-deep-flat -mt-[0.3em] ml-[10vw] font-display text-[clamp(3rem,9vw,9.6rem)] font-semibold leading-none tracking-[-0.02em]">progress</p>
                        <p className="ink-deep-flat ml-[24vw] mt-1 font-display text-[clamp(1rem,2.2vw,2.2rem)] italic leading-tight">measured from your own answers</p>
                    </div>
                </L>
                <L a={0.74} b={0.97} className="halo absolute inset-0 grid place-items-center text-center">
                    <div>
                        <p className="ink-deep-flat font-display text-[clamp(1.6rem,4vw,4rem)] font-medium italic leading-none">explore the</p>
                        <p className="ink-deep-flat font-display text-[clamp(3rem,9vw,9.6rem)] font-semibold leading-none">22 domains</p>
                        <p className="ink-deep-flat mt-1 font-display text-[clamp(1.4rem,3.4vw,3.4rem)] italic leading-none">of DSA</p>
                    </div>
                </L>
            </Stage>
        </div>
    );
}
