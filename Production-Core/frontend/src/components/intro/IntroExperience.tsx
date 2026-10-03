import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { introState } from '../../lib/introState';
import { detectCircle, type Pt } from '../../lib/circleGesture';
import { introFlag, introWillPlay } from '../../lib/introFlag';
import { assetUrl } from '../../lib/experienceAssets';

const GateHand = lazy(() => import('./GateHand'));
// the gate is the count's sky; with the dev assets frost.webp adds texture over it, otherwise an SVG frost does
const FROST = assetUrl('frost');

/**
 * Opening sequence, in four scenes (the navigation bar is not part of any of them):
 *   1. COUNT      a giant 00 rolls to 26 (the concepts in the curriculum) and the statement types itself in the top-left
 *                 corner. Typography only: no 3D graph.
 *   2. LOOP       a frost ring draws itself on the right like a big zero, closes, and bursts outward as an iris that
 *                 carries the scene into the gate.
 *   3. GATE       "Are you ready?  Draw a zero."  Draw a circle with the mouse or a finger;
 *                 the path is judged by detectCircle (closed, round, sweeps about 360 degrees). Enter also opens it.
 *   4. OPENING    the circle you drew becomes the opening: the gate dissolves outward from it and the "Every Learner"
 *                 title card is revealed inside, then the page continues as normal stages.
 * Plays once per page load (module flag survives route changes and StrictMode remounts); never with reduced motion.
 */

const FINAL = { active: false, reveal: 26, edges: 1, settle: 1, spin: 0, fade: 1 };
const LINES = ['Every concept.', 'Every link.', 'One path. Yours.'];
const RING = 100;
const CIRC = 2 * Math.PI * RING;
const HINTS: Record<string, string> = {
    short: 'Keep going: draw a whole circle', small: 'A little bigger', open: 'Close the loop where you started',
    wobbly: 'Smoother: one round loop', partial: 'All the way around',
};

function DigitColumn({ stripRef }: { stripRef: React.RefObject<HTMLSpanElement | null> }) {
    return (
        <span className="relative inline-block h-[1em] w-[0.6em] overflow-hidden">
            <span ref={stripRef} className="absolute inset-x-0 top-0 flex flex-col will-change-transform">
                {Array.from({ length: 30 }, (_, i) => (
                    <span key={i} className="block h-[1em] text-center leading-[1em]">{i % 10}</span>
                ))}
            </span>
        </span>
    );
}

export default function IntroExperience() {
    const [on, setOn] = useState(() => introWillPlay());
    const root = useRef<HTMLDivElement>(null);
    const counter = useRef<HTMLDivElement>(null);
    const statement = useRef<HTMLDivElement>(null);
    const label = useRef<HTMLDivElement>(null);
    const tens = useRef<HTMLSpanElement>(null);
    const ones = useRef<HTMLSpanElement>(null);
    const ring = useRef<HTMLDivElement>(null);
    const stroke = useRef<SVGCircleElement>(null);
    const glow = useRef<SVGCircleElement>(null);
    const head = useRef<SVGGElement>(null);
    const bloom = useRef<HTMLDivElement>(null);
    const gate = useRef<HTMLDivElement>(null);
    const pad = useRef<HTMLCanvasElement>(null);
    const flash = useRef<HTMLDivElement>(null);
    const hint = useRef<HTMLParagraphElement>(null);
    const live = useRef<HTMLParagraphElement>(null);

    useLayoutEffect(() => {
        document.getElementById('intro-pre')?.remove();                   // hand-off from the static first frame
        if (!on || !root.current) return;
        const html = document.documentElement;
        html.dataset.intro = 'running';
        const ui = Array.from(document.querySelectorAll<HTMLElement>('[data-intro-ui]'));
        const rail = Array.from(document.querySelectorAll<HTMLElement>('[data-intro-rail]'));
        const W = () => window.innerWidth, H = () => window.innerHeight;
        const hidden = () => -0.3 * Math.min(W(), H());                   // a closed iris: a negative radius hides everything
        const maxR = () => Math.hypot(W(), H()) * 1.1;
        const setIris = (el: HTMLElement, x: number, y: number, r: number) => {
            el.style.setProperty('--ix', `${x}px`);
            el.style.setProperty('--iy', `${y}px`);
            el.style.setProperty('--ir', `${r}px`);
        };

        // the loop sits right of the statement (centred on phones); while opening it IS the iris edge
        // phones: centred in the free band between the statement and the label, clear of both (glow and head reach 1.09 R)
        const phoneBand = () => {
            const top = statement.current?.getBoundingClientRect().bottom ?? H() * 0.3;
            const bottom = label.current?.getBoundingClientRect().top ?? H() * 0.75;
            return { cy: (top + bottom) / 2, r: Math.max(40, Math.min(W() * 0.4, ((bottom - top) / 2 - 22) / 1.09)) };
        };
        const loop = { draw: 0, open: 0 };
        const tick = () => {
            const phone = W() < 768 ? phoneBand() : null;
            introState.cx = phone ? W() / 2 : W() * 0.74;
            introState.cy = phone ? phone.cy : H() / 2;
            const R = phone ? phone.r : Math.min(H() * 0.4, W() * 0.215);
            const r = R + (maxR() - R) * loop.open;
            const el = ring.current!;
            el.style.width = el.style.height = `${(R * 2.4).toFixed(1)}px`;
            el.style.transform = `translate3d(${introState.cx}px, ${introState.cy}px, 0) translate(-50%, -50%) scale(${(r / R).toFixed(4)})`;
            const off = `${CIRC * (1 - loop.draw)}`;
            stroke.current!.style.strokeDashoffset = off;
            glow.current!.style.strokeDashoffset = off;
            head.current!.style.transform = `rotate(${loop.draw * 360 - 90}deg)`;
            bloom.current!.style.setProperty('--bx', `${introState.cx}px`);
            bloom.current!.style.setProperty('--by', `${introState.cy}px`);
            if (!finished) setIris(gate.current!, introState.cx, introState.cy, loop.open > 0 ? r * 0.98 : hidden());
        };

        Object.assign(introState, { active: true, reveal: 0, edges: 0, settle: 0, spin: 0, fade: 1 });

        const count = { v: 0 };
        const roll = () => {                                              // a true odometer: the tens carry as the ones pass 9 -> 0
            const v = count.v, carry = Math.floor(v / 10) + Math.max(0, (v % 10) - 9);
            ones.current!.style.transform = `translate3d(0, ${(-v / 30) * 100}%, 0)`;
            tens.current!.style.transform = `translate3d(0, ${(-carry / 30) * 100}%, 0)`;
        };

        // ---------------- scene 3: drawing a circle ----------------
        let gateOpen = false, finished = false, skipAll = false, drawing = false, pts: Pt[] = [];
        let tl1: gsap.core.Timeline | null = null;
        const cvs = pad.current!, g2 = cvs.getContext('2d')!;
        let fadeTrail: gsap.core.Tween | null = null;
        const sizeCanvas = () => {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            cvs.width = Math.round(W() * d); cvs.height = Math.round(H() * d);
            g2.setTransform(d, 0, 0, d, 0, 0);
        };
        const paintTrail = (alpha = 1) => {
            g2.clearRect(0, 0, W(), H());
            if (pts.length < 2) return;
            g2.lineCap = g2.lineJoin = 'round';
            for (const [w, a, blur] of [[16, 0.2, 18], [6, 0.9, 6], [2.4, 1, 0]] as const) {   // soft halo, frost body, bright core
                g2.beginPath();
                g2.lineWidth = w; g2.strokeStyle = `rgba(255,255,255,${a * alpha})`;
                g2.shadowColor = 'rgba(255,255,255,0.9)'; g2.shadowBlur = blur;
                pts.forEach((p, i) => (i ? g2.lineTo(p.x, p.y) : g2.moveTo(p.x, p.y)));
                g2.stroke();
            }
            g2.shadowBlur = 0;
        };
        const onDown = (e: PointerEvent) => {
            if (!gateOpen || finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
            fadeTrail?.kill();
            drawing = true; pts = [{ x: e.clientX, y: e.clientY }];
        };
        const onMove = (e: PointerEvent) => {
            if (!gateOpen || !drawing) return;
            const prev = pts[pts.length - 1];
            if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 3) { pts.push({ x: e.clientX, y: e.clientY }); paintTrail(); }
        };
        const onUp = () => {
            if (!drawing) return;
            drawing = false;
            const res = detectCircle(pts, { w: W(), h: H() });
            if (res.ok) { paintTrail(); open({ cx: res.cx, cy: res.cy, r: res.r }); return; }
            const msg = HINTS[res.reason ?? 'short'];
            if (hint.current) hint.current.textContent = msg;
            if (live.current) live.current.textContent = msg;
            const fade = { a: 1 };
            fadeTrail = gsap.to(fade, { a: 0, duration: 0.7, ease: 'power2.in', onUpdate: () => paintTrail(fade.a), onComplete: () => { pts = []; g2.clearRect(0, 0, W(), H()); } });
            gsap.fromTo(gate.current!.querySelector('.gate-title'), { x: -8 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') skip();
            else if (gateOpen && !finished && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); skip(); }
        };

        // ---------------- scene 4: white light, then the title card ----------------
        function open(c: { cx: number; cy: number; r: number }) {
            if (finished) return;
            finished = true; gateOpen = false;
            introState.gateHand = false;
            gate.current!.style.pointerEvents = 'none';
            const f = flash.current!;
            f.style.background = `radial-gradient(circle at ${c.cx}px ${c.cy}px, #ffffff 0%, #ffffff 100%)`;
            ctx.add(() => {
                gsap.timeline({ onComplete: finish })
                    .to(gate.current!.querySelectorAll('.gate-ui'), { autoAlpha: 0, duration: 0.35, ease: 'power2.out' }, 0)
                    .fromTo(f, { clipPath: `circle(${c.r}px at ${c.cx}px ${c.cy}px)`, autoAlpha: 0.0 },
                        { clipPath: `circle(${maxR()}px at ${c.cx}px ${c.cy}px)`, autoAlpha: 1, duration: 0.9, ease: 'power2.in' }, 0)
                    .add(() => {                                           // fully white: swap the scenes underneath
                        gate.current!.style.display = 'none';
                        if (ui.length) gsap.set(ui, { autoAlpha: 1 });
                        html.dataset.intro = 'reveal';                     // the title card begins its own entrance
                    }, 0.95)
                    .to(f, { autoAlpha: 0, duration: 1.5, ease: 'power1.inOut' }, 1.0)
                    .add(() => { if (rail.length) gsap.to(rail, { autoAlpha: 1, duration: 0.6 }); }, 2.2);
            });
        }

        // ---------------- scene 1 + 2: count, links, loop, burst into the gate ----------------
        const ctx = gsap.context(() => {
            const q = gsap.utils.selector(root);
            if (ui.length) gsap.set(ui, { autoAlpha: 0 });
            if (rail.length) gsap.set(rail, { autoAlpha: 0 });
            gsap.set(q('.intro-hair'), { scaleX: 0 });
            gsap.set(q('.intro-rise, .intro-links'), { yPercent: 110 });
            gsap.set(q('.intro-line'), { yPercent: 112 });
            gsap.set(ring.current, { autoAlpha: 0 });
            gsap.set(bloom.current, { autoAlpha: 0 });
            gsap.set(gate.current, { autoAlpha: 0 });
            gsap.set(q('.gate-ui'), { autoAlpha: 0, y: 18 });
            gate.current!.classList.add('intro-iris-in');
            sizeCanvas();
            tick();

            tl1 = gsap.timeline({
                defaults: { ease: 'power3.out' }, onUpdate: tick,
                onComplete: () => { introState.fade = 0; },
            });
            if (new URLSearchParams(window.location.search).has('introseek')) {   // QA only: seekable, frame-exact review
                tl1.pause();
                (window as unknown as { __intro: gsap.core.Timeline }).__intro = tl1;
            }
            tl1
                .to(q('.intro-hair'), { scaleX: 1, duration: 1.2, ease: 'power3.inOut', stagger: 0.12 }, 0.1)
                .to(q('.intro-rise'), { yPercent: 0, duration: 0.8, stagger: 0.08 }, 0.25)
                .to(introState, { spin: 1.5, duration: 4.2, ease: 'power1.inOut' }, 0)
                .to(count, { v: 26, duration: 1.9, ease: 'power2.inOut', onUpdate: roll }, 0.45)
                .to(introState, { reveal: 26, duration: 1.9, ease: 'power1.inOut' }, 0.45)
                .to(q('.intro-line'), { yPercent: 0, duration: 0.95, stagger: 0.85 }, 0.9)
                .to(introState, { edges: 1, duration: 1.45, ease: 'power2.inOut' }, 2.0)
                .to(q('.intro-links'), { yPercent: 0, duration: 0.7 }, 2.1)
                .to(ring.current, { autoAlpha: 1, duration: 0.3, ease: 'none' }, 2.55)
                .to(loop, { draw: 1, duration: 1.3, ease: 'power2.inOut' }, 2.6)
                .addLabel('exit', 3.55)
                .to(q('.intro-line'), { yPercent: -112, duration: 0.55, ease: 'power3.in', stagger: 0.06 }, 'exit')
                .to(q('.intro-rise, .intro-links'), { yPercent: -110, duration: 0.45, ease: 'power3.in', stagger: 0.03 }, 'exit')
                .to(q('.intro-hair'), { scaleX: 0, transformOrigin: '100% 50%', duration: 0.6, ease: 'power3.in' }, 'exit')
                .to(counter.current, { autoAlpha: 0, yPercent: -12, duration: 0.5, ease: 'power2.in' }, 'exit+=0.3')
                // the loop closes and bursts: the iris carries the scene into the gate, and the graph shrinks away
                .addLabel('burst', 3.95)
                .set(gate.current, { autoAlpha: 1 }, 'burst')
                .to(bloom.current, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, 'burst')
                .to(bloom.current, { autoAlpha: 0, duration: 0.9, ease: 'power2.in' }, 'burst+=0.35')
                .to(loop, { open: 1, duration: 1.5, ease: 'expo.inOut' }, 'burst')
                .to(ring.current, { autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, 'burst+=1.0')
                .to(introState, { fade: 0, duration: 1.0, ease: 'power3.in' }, 'burst')
                // "Are you ready?  Draw a zero."
                .to(q('.gate-ui'), { autoAlpha: 1, y: 0, duration: 1.0, stagger: 0.18, ease: 'power3.out' }, 'burst+=1.1')
                .add(() => {
                    gateOpen = true;
                    introState.gateHand = true;
                    gate.current!.style.pointerEvents = 'auto';
                    if (skipAll) open({ cx: W() / 2, cy: H() / 2, r: Math.min(W(), H()) * 0.14 });
                }, 'burst+=1.1');
        }, root);

        function finish() {
            introFlag.played = true;
            window.removeEventListener('keydown', onKey);
            introState.gateHand = false;
            // hide the layer first: reverting its styles would show the count and lines again until React unmounts it
            if (root.current) root.current.style.visibility = 'hidden';
            ctx.revert();                                                   // removes every inline style the intro added
            Object.assign(introState, FINAL);                               // ...and leaves the scene in its final state
            ui.forEach((el) => { el.classList.remove('intro-iris-in'); ['--ix', '--iy', '--ir'].forEach((v) => el.style.removeProperty(v)); });
            delete html.dataset.intro;
            html.style.cursor = '';
            setOn(false);                                                   // unmount the intro layer: nothing invisible stays on top
        }
        function skip() {
            if (finished) return;
            if (gateOpen) open({ cx: W() / 2, cy: H() / 2, r: Math.min(W(), H()) * 0.14 });
            else { skipAll = true; tl1?.timeScale(8); }                     // race through the count, then open straight away
        }

        const resize = () => { sizeCanvas(); tick(); };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('keydown', onKey);
        window.addEventListener('resize', resize);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', resize);
            if (!introFlag.played) {                                                  // unmounted mid-way (route change, StrictMode): leave nothing behind
                ctx.revert();
                Object.assign(introState, FINAL);
                ui.forEach((el) => el.classList.remove('intro-iris-in'));
                delete html.dataset.intro;
            }
        };
    }, [on]);

    if (!on) return null;
    return (
        <>
            {/* scenes 1-2: stage one's sky, so the count, the gate and the first scene are one world */}
            <div aria-hidden className="intro-backdrop pointer-events-none fixed inset-0 z-0" />

            <div ref={root} className="fixed inset-0 z-[70] cursor-default select-none overflow-hidden text-[#173f4d]" role="presentation">
                <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-white opacity-0" style={{ visibility: 'hidden' }} />
                <div ref={bloom} aria-hidden className="pointer-events-none absolute inset-0"
                    style={{ background: 'radial-gradient(circle at var(--bx, 70%) var(--by, 50%), rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.14) 28%, transparent 55%)' }} />
                <div ref={ring} aria-hidden className="pointer-events-none absolute left-0 top-0 will-change-transform">
                    <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible">
                        <defs>
                            <filter id="intro-frost" x="-20%" y="-20%" width="140%" height="140%">
                                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
                                <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
                            </filter>
                            <filter id="intro-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
                            <radialGradient id="intro-headg"><stop offset="0" stopColor="#ffffff" /><stop offset="0.45" stopColor="#ffffff" stopOpacity="0.85" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
                        </defs>
                        <circle cx="120" cy="120" r={RING} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1" strokeDasharray="2 6" />
                        <g transform="rotate(-90 120 120)">
                            <circle ref={glow} cx="120" cy="120" r={RING} fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity="0.55"
                                strokeDasharray={CIRC} strokeDashoffset={CIRC} filter="url(#intro-glow)" />
                            <circle ref={stroke} cx="120" cy="120" r={RING} fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round"
                                strokeDasharray={CIRC} strokeDashoffset={CIRC} filter="url(#intro-frost)" />
                        </g>
                        <g ref={head} style={{ transformOrigin: '120px 120px', transform: 'rotate(-90deg)' }}>
                            <circle cx={120 + RING} cy="120" r="9" fill="url(#intro-headg)" />
                            <circle cx={120 + RING} cy="120" r="2.6" fill="#ffffff" />
                        </g>
                    </svg>
                </div>

                {/* scene 1: corner typography. No bar and no navigation at the top: the opening is only the scene. */}
                <span aria-hidden className="intro-hair absolute bottom-[3.5svh] left-[5vw] right-[5vw] h-px origin-left bg-[#173f4d]/25" />
                <div ref={statement} aria-hidden className="absolute left-[5vw] top-[9svh] max-w-[88vw] font-heading text-[min(11vw,3.6rem)] font-bold leading-[0.98] tracking-tight sm:top-[10svh] lg:max-w-[44vw] lg:text-[min(6vw,9.5svh)]">
                    {LINES.map((line, i) => (
                        <span key={line} className="block overflow-hidden pb-[0.1em]">
                            <span className={`intro-line block ${i === 2 ? 'ink-deep-flat italic' : ''}`}>{line}</span>
                        </span>
                    ))}
                </div>
                <div className="absolute bottom-[6svh] left-[5vw]">
                    <div ref={label} className="absolute bottom-full left-0 mb-3 overflow-hidden">
                        <p className="intro-rise whitespace-nowrap font-accent text-[10px] uppercase tracking-[0.28em] text-[#173f4d]/70 sm:text-[11px]">Concepts in your curriculum</p>
                    </div>
                    <div ref={counter} className="origin-top-left font-accent text-[clamp(7rem,34vw,10rem)] font-bold leading-none tracking-[-0.04em] tabular-nums sm:text-[clamp(8rem,28svh,17rem)]">
                        <DigitColumn stripRef={tens} /><DigitColumn stripRef={ones} />
                    </div>
                </div>
                <div className="absolute bottom-[6svh] right-[5vw] overflow-hidden text-right">
                    <p className="intro-links font-accent text-[10px] uppercase tracking-[0.28em] text-[#173f4d]/70 sm:text-[11px]">51 prerequisite links</p>
                </div>

                {/* scene 3: the gate. The same sky as the count; frost and light instead of a new colour. */}
                <div ref={gate} className="gate absolute inset-0 cursor-default overflow-hidden" style={{ pointerEvents: 'none', touchAction: 'none' }}>
                    <div aria-hidden className="gate-bg absolute inset-0" />
                    {FROST && <div aria-hidden className="gate-frost-img absolute inset-[-4%]" style={{ backgroundImage: `url(${FROST})` }} />}
                    {!FROST && <svg aria-hidden className="gate-frost absolute inset-[-8%] h-[116%] w-[116%]" preserveAspectRatio="none">
                        <filter id="frostA" x="0" y="0" width="100%" height="100%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="5" seed="11" />
                            <feColorMatrix type="matrix" values="0 0 0 0 0.78  0 0 0 0 0.84  0 0 0 0 1  0 0 0 1.9 -0.78" />
                        </filter>
                        <filter id="frostB" x="0" y="0" width="100%" height="100%">
                            <feTurbulence type="turbulence" baseFrequency="0.018 0.03" numOctaves="3" seed="4" />
                            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3.2 -1.35" />
                        </filter>
                        <rect width="100%" height="100%" filter="url(#frostA)" opacity="0.75" />
                        <rect width="100%" height="100%" filter="url(#frostB)" opacity="0.5" />
                    </svg>}
                    <div aria-hidden className="gate-vignette absolute inset-0" />
                    <Suspense fallback={null}><GateHand /></Suspense>

                                        <canvas ref={pad} className="absolute inset-0 h-full w-full touch-none" />

                    <div className="pointer-events-none absolute inset-x-0 top-[26svh] flex flex-col items-center text-center">
                        <p className="gate-ui font-mono text-[11px] uppercase tracking-[0.5em] text-[#173f4d]/75 sm:text-xs">Are you ready?</p>
                        <p className="gate-ui gate-title mt-5 font-mono text-[clamp(1.1rem,2.3vw,1.9rem)] font-semibold uppercase tracking-[0.42em] text-[#173f4d]">Draw a zero</p>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-[8svh] flex flex-col items-center gap-2 text-center">
                        <p ref={hint} className="gate-ui font-mono text-[11px] uppercase tracking-[0.3em] text-[#173f4d]/80">One circle, any size, any direction</p>
                        <p className="gate-ui font-mono text-[10px] uppercase tracking-[0.3em] text-[#173f4d]/55">or press Enter</p>
                    </div>
                    <p ref={live} className="sr-only" role="status" aria-live="polite">Draw a circle with the mouse or a finger to continue, or press Enter.</p>

                </div>

            </div>
        </>
    );
}
