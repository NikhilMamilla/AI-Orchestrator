import { ACESFilmicToneMapping, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { PLACEHOLDERS_ENABLED, STAGE_ASSETS } from '../lib/experienceAssets';
import { AssetCache } from './assets';
import { STAGES, edgeOf, follow, holdVisible, lineVisibility, maxTarget, minTarget, rulerPosition, stepHold, type StageId } from './flow';
import { Sound } from './sound';
import { useExperience } from './store';
import type { StageCtx, StageFactory, StageModule } from './types';

/**
 * Each stage is its own chunk, loaded when it is next (prefetched while the stage before it plays). With the
 * placeholder assets available (dev) a stage uses its asset-based version; a production build draws them itself.
 */
const PROCEDURAL: Record<StageId, () => Promise<StageFactory>> = {
    believed: () => import('./stages/believed').then((m) => m.default),
    shatter: () => import('./stages/shatter').then((m) => m.default),
    burn: () => import('./stages/burn').then((m) => m.default),
    tunnel: () => import('./stages/tunnel').then((m) => m.default),
    city: () => import('./stages/city').then((m) => m.default),
};
const WITH_ASSETS: Partial<Record<StageId, () => Promise<StageFactory>>> = PLACEHOLDERS_ENABLED ? {
    believed: () => import('./stages/assets/believed').then((m) => m.default),
    shatter: () => import('./stages/assets/shatter').then((m) => m.default),
} : {};
const FACTORIES = { ...PROCEDURAL, ...WITH_ASSETS } as Record<StageId, () => Promise<StageFactory>>;

interface Line { el: HTMLElement; a: number; b: number; last: number }

export interface EngineOpts { canvas: HTMLCanvasElement; root: HTMLElement; fade: HTMLElement; reduced: boolean; onExit: () => void }

/**
 * The stage manager. One renderer and one canvas for the whole story; the active stage owns a scene and a camera.
 * Input moves the stage's progress (virtual scroll), hold gates stop it until they are held long enough, and reaching
 * either end hands over to the neighbouring stage behind a short colour cut.
 */
export class Engine {
    private renderer: WebGLRenderer;
    private assets: AssetCache;
    readonly sound = new Sound();
    private ctx: StageCtx;
    private mod: StageModule | null = null;
    private idx = 0;
    private value = -0.12;
    private target = 0;
    private hold = 0;
    private holdKey = false;
    private holdPointer = false;
    private gateShown = false;
    private holdDone = STAGES.map(() => false);
    private switching = false;
    private lockUntil = 0;
    private raf = 0;
    private last = performance.now();
    private lines: Line[] = [];
    private ptr = { x: 0, y: 0 };
    private touchY: number | null = null;
    private disposed = false;
    private rulerShown = -1;
    private leaving = false;
    private liveSince: number | null = null;                 // when the story first appeared (after the white flash)
    private rulerEl: HTMLElement | null = null;
    private off: (() => void)[] = [];
    private snapshotRT: WebGLRenderTarget | null = null;
    private prepared: { i: number; mod: Promise<StageModule> } | null = null;   // the next stage, built ahead of the cut

    private o: EngineOpts;

    constructor(o: EngineOpts) {
        this.o = o;
        this.renderer = new WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = SRGBColorSpace;
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.setClearColor('#070a19');
        this.assets = new AssetCache(this.renderer);
        this.ctx = {
            renderer: this.renderer, w: 1, h: 1, mobile: false, reduced: o.reduced, pointer: { x: 0, y: 0 }, time: 0,
            hold: 0, holding: false, holdDone: false, sound: this.sound, assets: this.assets, snapshot: null,
        };
        this.resize();
        this.listen();
        o.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); o.onExit(); });
    }

    async start(i = 0) {
        useExperience.getState().set({ active: true, stage: i, reached: i, hold: { visible: false, label: '' } });
        this.assets.prefetch(STAGE_ASSETS[STAGES[i].id]);
        this.mod = await this.create(i);
        if (this.disposed) { this.mod.dispose(); return; }
        this.enter(i, 1);
        this.raf = requestAnimationFrame(this.frame);
    }

    private async create(i: number) {
        const factory = await FACTORIES[STAGES[i].id]();
        const m = await factory(this.ctx);
        m.resize(this.ctx.w, this.ctx.h);
        return m;
    }

    /** Bookkeeping when a stage becomes active. */
    private enter(i: number, dir: number) {
        const spec = STAGES[i];
        this.idx = i;
        this.hold = 0;
        this.gateShown = false;
        this.ctx.time = 0;
        if (dir > 0) { this.value = -0.12; this.target = 0; } else { this.value = 0.97; this.target = 0.97; }
        for (let k = 0; k < i; k++) this.holdDone[k] = true;                   // a jump forward counts the gates as passed
        const st = useExperience.getState();
        st.set({ stage: i, reached: Math.max(st.reached, i), hold: { visible: false, label: '' }, announce: `Part ${i + 1} of ${STAGES.length}: ${spec.name}` });
        if (spec.xpOnEnter) { st.gainXp(spec.xpOnEnter); this.sound.fx('xp'); }
        this.sound.ambient(spec.id);
        if (spec.id === 'tunnel') this.sound.fx('tunnel');
        this.lines = Array.from(this.o.root.querySelectorAll<HTMLElement>(`[data-stage-overlay="${spec.id}"] [data-in]`)).map((el) => ({
            el, a: Number(el.dataset.in), b: el.dataset.out ? Number(el.dataset.out) : 9, last: -1,
        }));
        const next = STAGES[i + 1];
        if (next) {
            this.assets.prefetch(STAGE_ASSETS[next.id]);                     // its files now, its scene a moment later
            // the stage after this one is built now, behind the cut (or the opening), so no stage is ever built on screen
            if (this.prepared?.i !== i + 1) this.prepared = { i: i + 1, mod: this.create(i + 1) };
        }
    }

    /** Cut to another stage: fade to its colour, swap scenes underneath, fade back. */
    async goto(i: number, dir: number) {
        if (this.switching || i < 0 || i >= STAGES.length || this.disposed) return;
        this.switching = true;
        this.lockUntil = performance.now() + 1100;
        const snap = dir > 0 && STAGES[i].cut === 'snapshot' && this.mod;
        this.snapshotRT?.dispose();
        this.snapshotRT = null;
        this.ctx.snapshot = null;
        if (snap && this.mod) {                                               // keep the last frame: the next stage breaks it
            const size = this.renderer.getDrawingBufferSize(new Vector2());
            const rt = new WebGLRenderTarget(size.x, size.y);
            this.renderer.setRenderTarget(rt);
            this.renderer.render(this.mod.scene, this.mod.camera);
            this.renderer.setRenderTarget(null);
            this.snapshotRT = rt;
            this.ctx.snapshot = rt.texture;
        } else {
            this.o.fade.style.background = STAGES[i].flash;
            this.o.fade.style.opacity = '1';
        }
        const ready = this.prepared?.i === i ? this.prepared.mod : null;
        if (this.prepared && this.prepared.i !== i) void this.prepared.mod.then((m) => m.dispose());
        this.prepared = null;
        const nextP = ready ?? this.create(i);
        if (!snap) await new Promise((r) => setTimeout(r, 480));
        let next: StageModule;
        try { next = await nextP; } catch (err) { console.error('[experience] stage failed', err); this.o.onExit(); return; }
        if (this.disposed) { next.dispose(); return; }
        this.prewarm(next);                         // while the screen is a solid fade (or the still frame about to break)
        this.mod?.dispose();
        this.mod = next;
        this.enter(i, dir);
        const ahead = this.prepared as { mod: Promise<StageModule> } | null;
        if (ahead && !snap) await Promise.race([ahead.mod.catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
        if (this.disposed) return;
        this.o.fade.style.opacity = '0';
        this.switching = false;
    }

    /** Draw a stage once, offscreen: compiles its shaders and uploads its textures before it is ever shown. */
    private prewarm(m: StageModule) {
        try {
            const rt = new WebGLRenderTarget(64, 64);
            this.renderer.setRenderTarget(rt);
            this.renderer.render(m.scene, m.camera);
            this.renderer.setRenderTarget(null);
            rt.dispose();
        } catch { /* it will compile on first draw instead */ }
    }

    /** From the ruler: jump to the start of a stage. */
    jump(i: number) { if (i !== this.idx) void this.goto(i, 1); }

    /** QA only (?expqa): show stage i at progress p, with its gate counted as passed when p is beyond it. */
    async seek(i: number, p: number) {
        if (i !== this.idx) { await this.goto(i, 1); while (this.switching) await new Promise((r) => setTimeout(r, 50)); }
        const spec = STAGES[i];
        if (spec.hold && p > spec.hold.at) this.holdDone[i] = true;
        this.value = this.target = p;
    }

    /** The hold ring itself can be pressed (pointer or keyboard). */
    press(on: boolean) { this.holdPointer = on; }

    private completeHold() {
        const spec = STAGES[this.idx];
        this.holdDone[this.idx] = true;
        this.holdKey = this.holdPointer = false;
        if (spec.xpOnHold) { useExperience.getState().gainXp(spec.xpOnHold); this.sound.fx('xp'); }
        if (spec.hold?.advance) void this.goto(this.idx + 1, 1);
        else this.target = Math.max(this.target, (spec.hold?.at ?? 0) + 0.06);   // move on by itself a little
    }

    private frame = (now: number) => {
        this.raf = requestAnimationFrame(this.frame);
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        if (document.documentElement.dataset.intro === 'running' || document.hidden || !this.mod) return;
        this.liveSince ??= now;
        const spec = STAGES[this.idx], done = this.holdDone[this.idx];

        if (!this.switching) {
            if (spec.creep && this.value > 0.02) this.target = Math.min(maxTarget(spec, done), this.target + spec.creep * dt);
            this.value = follow(this.value, this.target, dt, 4.2);
            const gate = holdVisible(spec, this.value, done);
            if (gate !== this.gateShown) {
                this.gateShown = gate;
                useExperience.getState().set({ hold: { visible: gate, label: spec.hold?.label ?? '' } });
                if (!gate) this.holdKey = this.holdPointer = false;
            }
            const holding = gate && (this.holdKey || this.holdPointer);
            if (spec.hold && (gate || this.hold > 0)) {
                this.hold = stepHold(this.hold, holding, dt * 1000, spec.hold.ms);
                this.sound.charging(this.hold, holding);
                if (gate && this.hold >= 1) this.completeHold();
            }
            this.ctx.holding = holding;
            const e = edgeOf(this.idx, spec, this.value, this.target, this.holdDone[this.idx]);
            if (e) void this.goto(this.idx + e, e);
        }

        this.ctx.time += dt;
        this.ctx.hold = this.hold;
        this.ctx.holdDone = this.holdDone[this.idx];
        const k = 1 - Math.exp(-dt * 3);
        this.ctx.pointer.x += (this.ptr.x - this.ctx.pointer.x) * k;
        this.ctx.pointer.y += (this.ptr.y - this.ctx.pointer.y) * k;
        const p = Math.max(-0.12, this.value);
        this.mod.update(p, dt, this.ctx);
        this.renderer.render(this.mod.scene, this.mod.camera);

        const r = this.o.root.style;
        r.setProperty('--exp-hold', this.hold.toFixed(4));
        // the last words have been read: fade to white and hand over to the landing page
        if (spec.final && this.value > 0.985 && !this.leaving) {
            this.leaving = true;
            this.o.fade.style.background = '#ffffff';
            this.o.fade.style.opacity = '1';
            window.setTimeout(() => this.o.onExit(), 520);
        }
        const pos = rulerPosition(this.idx, this.value);
        r.setProperty('--exp-pos', pos.toFixed(4));
        const concept = Math.round(pos * 26);
        if (concept !== this.rulerShown) {
            this.rulerShown = concept;
            this.rulerEl ??= this.o.root.querySelector<HTMLElement>('[data-ruler-value]');
            if (this.rulerEl) this.rulerEl.textContent = String(concept);
        }
        for (const l of this.lines) {
            const { v, fin } = lineVisibility(p, l.a, l.b);
            if (Math.abs(v - l.last) < 0.002) continue;
            l.last = v;
            l.el.style.opacity = v.toFixed(3);
            l.el.style.filter = v > 0.995 || this.narrow ? '' : `blur(${((1 - v) * 14).toFixed(1)}px)`;
            l.el.style.transform = `translate3d(0, ${((fin < 1 ? 1 - fin : -(1 - v)) * 26).toFixed(1)}px, 0)`;
            l.el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
        }
    };

    private narrow = typeof window !== 'undefined' && window.innerWidth < 768;

    private resize = () => {
        const w = window.innerWidth, h = window.innerHeight;
        const mobile = w < 768;
        this.narrow = mobile;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5));   // keep the GPU budget low
        this.renderer.setSize(w, h, false);
        Object.assign(this.ctx, { w, h, mobile });
        this.mod?.resize(w, h);
    };

    private scrollBy(delta: number) {
        const spec = STAGES[this.idx];
        if (this.switching || performance.now() < this.lockUntil) return;
        this.target = Math.min(maxTarget(spec, this.holdDone[this.idx]), Math.max(minTarget(this.idx), this.target + delta / spec.length));
    }

    private listen() {
        const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
            window.addEventListener(type, fn, opts);
            this.off.push(() => window.removeEventListener(type, fn, opts));
        };
        const onHud = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('[data-hud]');
        const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input,textarea,select,[contenteditable="true"]');

        on('resize', this.resize);
        on('wheel', (e) => {
            if (document.documentElement.dataset.intro === 'running') return;
            if (onHud(e.target) && (e.target as Element).closest('[data-scrollable]')) return;          // the city card scrolls itself
            e.preventDefault();
            const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
            this.scrollBy(d);
        }, { passive: false });
        on('touchstart', (e) => { this.touchY = onHud(e.target) ? null : e.touches[0].clientY; }, { passive: true });
        on('touchmove', (e) => {
            if (this.touchY === null) return;
            const y = e.touches[0].clientY;
            this.scrollBy((this.touchY - y) * 2.6);
            this.touchY = y;
        }, { passive: true });
        on('touchend', () => { this.touchY = null; }, { passive: true });

        on('pointermove', (e) => {
            this.ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
            this.mod?.pointer?.('move', e, this.ctx);
        });
        on('pointerdown', (e) => {
            if (onHud(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
            if (this.gateShown) { this.holdPointer = true; return; }
            this.mod?.pointer?.('down', e, this.ctx);
        });
        const up = (e: PointerEvent) => { this.holdPointer = false; this.mod?.pointer?.('up', e, this.ctx); };
        on('pointerup', up);
        on('pointercancel', up);
        on('blur', () => { this.holdKey = this.holdPointer = false; });

        on('keydown', (e) => {
            if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (document.documentElement.dataset.intro === 'running') return;
            const onButton = !!(e.target as Element | null)?.closest?.('button,a,[role="button"]');
            if (e.key === 'Escape') {
                // the same key skips the opening; a second press right after it must not also skip the story
                if (this.liveSince !== null && performance.now() - this.liveSince > 1500) { e.preventDefault(); this.o.onExit(); }
                return;
            }
            if ((e.key === ' ' || e.key === 'Enter') && this.gateShown && !(onButton && e.key === 'Enter')) {
                e.preventDefault();
                if (!e.repeat) this.holdKey = true;
                return;
            }
            if (onButton && (e.key === ' ' || e.key === 'Enter')) return;
            const step = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) ? 1
                : e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            if (step < 0 && this.value < 0.03 && this.idx > 0) { void this.goto(this.idx - 1, -1); return; }
            this.scrollBy(step * STAGES[this.idx].length * 0.1);
        });
        on('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') this.holdKey = false; });
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.off.forEach((f) => f());
        this.mod?.dispose();
        this.mod = null;
        void this.prepared?.mod.then((m) => m.dispose());
        this.snapshotRT?.dispose();
        this.assets.dispose();
        this.sound.dispose();
        this.renderer.dispose();
        useExperience.getState().set({ active: false, hold: { visible: false, label: '' } });
    }
}
