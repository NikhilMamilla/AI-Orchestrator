import { assetUrl, type AssetKey } from '../lib/experienceAssets';
import type { StageId } from './flow';

/**
 * Sound for the story. Muted until the visitor turns it on (browsers block audio before a gesture anyway).
 * Everything is synthesised with Web Audio: a slow pad per stage (crossfaded on stage changes) and short effects built
 * from filtered noise and sine tones. With the dev-only placeholder preview on, recorded files play instead.
 */

export type Fx = 'shatter' | 'burn' | 'whoosh' | 'tunnel' | 'xp' | 'hand' | 'click';
const FX_FILE: Record<Fx, AssetKey> = { shatter: 'fxShatter', burn: 'fxBurn', whoosh: 'fxWhoosh', tunnel: 'fxTunnel', xp: 'fxXp', hand: 'fxHand', click: 'fxClick' };
const AMB_FILE: Record<StageId, AssetKey> = { believed: 'ambBelieved', shatter: 'ambShatter', burn: 'ambShatter', tunnel: 'ambTunnel', city: 'ambCity' };
const CHORDS: Record<StageId, number[]> = {
    believed: [220, 277.18, 329.63, 440],        // A major, open and bright
    shatter: [146.83, 174.61, 220, 293.66],      // D minor
    burn: [130.81, 155.56, 196, 261.63],         // C minor, low
    tunnel: [164.81, 246.94, 329.63, 493.88],    // E, open fifths
    city: [196, 246.94, 293.66, 392],            // G major
};

export class Sound {
    muted = true;
    private ac: AudioContext | null = null;
    private master: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private pad: { gain: GainNode; stop: (at: number) => void } | null = null;
    private file: HTMLAudioElement | null = null;
    private stage: StageId | null = null;
    private charge: { osc: OscillatorNode; gain: GainNode } | null = null;

    setMuted(m: boolean) {
        this.muted = m;
        if (!m) this.ensure();
        const ac = this.ac;
        if (ac && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.15);
        if (this.file) this.file.muted = m;
        if (!m && this.stage && !this.pad && !this.file) this.ambient(this.stage);
    }

    private ensure() {
        if (this.ac) { void this.ac.resume(); return; }
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ac.destination);
        const len = this.ac.sampleRate * 2;
        this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }

    /** Crossfade to the ambience of a stage. */
    ambient(id: StageId) {
        this.stage = id;
        if (this.muted || !this.ac || !this.master) return;
        const ac = this.ac, now = ac.currentTime;
        if (this.pad) { this.pad.gain.gain.setTargetAtTime(0, now, 0.6); this.pad.stop(now + 3); this.pad = null; }
        if (this.file) {
            const old = this.file;
            this.file = null;
            const fade = setInterval(() => { old.volume = Math.max(0, old.volume - 0.06); if (old.volume <= 0) { clearInterval(fade); old.pause(); } }, 60);
        }
        const url = assetUrl(AMB_FILE[id]);
        if (url) {
            const a = new Audio(url);
            a.loop = true; a.volume = 0;
            void a.play().catch(() => undefined);
            const rise = setInterval(() => { a.volume = Math.min(0.55, a.volume + 0.04); if (a.volume >= 0.55) clearInterval(rise); }, 60);
            this.file = a;
            return;
        }
        const gain = ac.createGain();
        gain.gain.value = 0;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.4;
        const lfo = ac.createOscillator(), lfoAmt = ac.createGain();
        lfo.frequency.value = 0.07; lfoAmt.gain.value = 260;
        lfo.connect(lfoAmt).connect(lp.frequency);
        const oscs = CHORDS[id].flatMap((f, i) => {
            const a = ac.createOscillator(), b = ac.createOscillator(), g = ac.createGain();
            a.type = 'sine'; b.type = 'triangle';
            a.frequency.value = f; b.frequency.value = f * 1.004;          // a slow beat between the two voices
            g.gain.value = 0.16 / (1 + i * 0.35);
            a.connect(g); b.connect(g); g.connect(lp);
            return [a, b];
        });
        lp.connect(gain).connect(this.master);
        [lfo, ...oscs].forEach((o) => o.start());
        gain.gain.setTargetAtTime(0.11, now, 1.2);
        this.pad = { gain, stop: (at) => [lfo, ...oscs].forEach((o) => o.stop(at)) };
    }

    fx(name: Fx) {
        if (this.muted || !this.ac || !this.master || !this.noise) return;
        const url = assetUrl(FX_FILE[name]);
        if (url) { const a = new Audio(url); a.volume = 0.7; void a.play().catch(() => undefined); return; }
        const ac = this.ac, t = ac.currentTime, out = this.master;
        const noise = (dur: number) => { const s = ac.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random(), dur); return s; };
        const env = (peak: number, a: number, d: number, at = t) => {
            const g = ac.createGain();
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(peak, at + a);
            g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
            return g;
        };
        const tone = (f: number, at: number, d: number, peak: number, type: OscillatorType = 'sine') => {
            const o = ac.createOscillator();
            o.type = type; o.frequency.value = f;
            o.connect(env(peak, 0.005, d, at)).connect(out);
            o.start(at); o.stop(at + d + 0.05);
        };
        if (name === 'whoosh' || name === 'tunnel') {
            const dur = name === 'whoosh' ? 0.9 : 1.7;
            const f = ac.createBiquadFilter();
            f.type = name === 'whoosh' ? 'bandpass' : 'lowpass'; f.Q.value = 1.1;
            f.frequency.setValueAtTime(name === 'whoosh' ? 300 : 120, t);
            f.frequency.exponentialRampToValueAtTime(name === 'whoosh' ? 2600 : 1100, t + dur * 0.45);
            f.frequency.exponentialRampToValueAtTime(name === 'whoosh' ? 380 : 160, t + dur);
            noise(dur).connect(f).connect(env(name === 'whoosh' ? 0.35 : 0.45, dur * 0.4, dur * 0.6)).connect(out);
        } else if (name === 'shatter') {
            const f = ac.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 1800;
            noise(0.9).connect(f).connect(env(0.55, 0.004, 0.8)).connect(out);
            for (let i = 0; i < 14; i++) tone(2200 + Math.random() * 3600, t + Math.random() * 0.5, 0.25 + Math.random() * 0.4, 0.05, 'triangle');
        } else if (name === 'burn') {
            const f = ac.createBiquadFilter();
            f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.8;
            noise(1.8).connect(f).connect(env(0.12, 0.4, 1.4)).connect(out);
            for (let i = 0; i < 36; i++) {                                 // crackle: tiny bursts at random times
                const at = t + Math.random() * 1.6, hp = ac.createBiquadFilter();
                hp.type = 'highpass'; hp.frequency.value = 2500 + Math.random() * 3000;
                const s = ac.createBufferSource(); s.buffer = this.noise; s.start(at, Math.random(), 0.03);
                s.connect(hp).connect(env(0.25 * Math.random(), 0.001, 0.025, at)).connect(out);
            }
        } else if (name === 'xp') {
            tone(880, t, 0.25, 0.12); tone(1318.5, t + 0.11, 0.45, 0.12);
        } else if (name === 'hand') {
            const f = ac.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.6);
            noise(1.2).connect(f).connect(env(0.25, 0.5, 0.7)).connect(out);
        } else if (name === 'click') {
            tone(1900, t, 0.06, 0.08, 'triangle');
        }
    }

    /** The rising tone while a hold ring charges; silent when released. */
    charging(level: number, holding: boolean) {
        if (this.muted || !this.ac || !this.master) return;
        const ac = this.ac;
        if (!this.charge) {
            const osc = ac.createOscillator(), gain = ac.createGain();
            osc.type = 'sine'; gain.gain.value = 0;
            osc.connect(gain).connect(this.master);
            osc.start();
            this.charge = { osc, gain };
        }
        this.charge.osc.frequency.setTargetAtTime(196 + level * 392, ac.currentTime, 0.05);
        this.charge.gain.gain.setTargetAtTime(holding && level < 1 ? 0.05 + level * 0.05 : 0, ac.currentTime, 0.06);
    }

    dispose() {
        this.file?.pause();
        this.file = null;
        if (this.ac) { const ac = this.ac; this.ac = null; void ac.close(); }
        this.pad = null; this.charge = null; this.master = null;
    }
}
