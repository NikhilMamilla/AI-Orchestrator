import {
    CanvasTexture, Color, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector2, Vector3,
} from 'three';

/** A hex colour as raw 0..1 components, for shaders that write straight to the screen (no colour management). */
export const raw = (hex: string) => { const c = new Color(); c.setStyle(hex, ''); return new Vector3(c.r, c.g, c.b); };

/** Deterministic pseudo-random numbers, so the scenes look the same on every visit. */
export function rng(seed: number) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const ease = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
export const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
/** 0..1 inside [a, b] of progress p. */
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Keyframes over progress: [[p, values], ...] with smooth interpolation between neighbours. */
export function keyframes<T extends Record<string, number>>(frames: [number, T][], p: number): T {
    if (p <= frames[0][0]) return { ...frames[0][1] };
    for (let i = 1; i < frames.length; i++) {
        const [p1, b] = frames[i];
        if (p <= p1) {
            const [p0, a] = frames[i - 1];
            const t = ease((p - p0) / (p1 - p0));
            const out = {} as Record<string, number>;
            for (const k in a) out[k] = lerp(a[k], b[k], t);
            return out as T;
        }
    }
    return { ...frames[frames.length - 1][1] };
}

/** A pearl-and-gold matcap drawn on a canvas: every hand, petal and coin is lit by it, so no lights are needed. */
export function pearlMatcap(size = 256, tint = '#2b2d66') {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const R = size / 2;
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    let gr = g.createRadialGradient(R * 0.92, R * 0.86, 0, R, R, R);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.45, '#efe4cc'); gr.addColorStop(0.78, '#a49cc4'); gr.addColorStop(1, tint);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    gr = g.createRadialGradient(R * 0.7, R * 0.58, 0, R * 0.7, R * 0.58, R * 0.42);       // the soft key highlight
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'lighter';
    gr = g.createRadialGradient(R * 1.62, R * 1.45, 0, R * 1.62, R * 1.45, R * 0.75);      // the gold rim light
    gr.addColorStop(0, 'rgba(243,210,120,0.75)'); gr.addColorStop(1, 'rgba(243,210,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
}

const BACKDROP_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

export const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }`;

const BACKDROP_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uTop, uBottom, uGlow;
uniform vec2 uGlowPos;
uniform float uGlowSize, uIntensity, uRays, uColumns, uTime, uAspect, uFlash;
${NOISE_GLSL}
void main() {
    vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
    vec2 q = vec2((vUv.x - uGlowPos.x) * uAspect, vUv.y - uGlowPos.y);
    c += uGlow * exp(-dot(q, q) / (uGlowSize * uGlowSize)) * uIntensity;
    if (uRays > 0.0) {                                      // light falling from the top left, slowly shifting
        vec2 d = vec2((vUv.x + 0.2) * uAspect, vUv.y - 1.3);
        float a = atan(d.y, d.x);
        float r = vnoise(vec2(a * 22.0, uTime * 0.12)) * vnoise(vec2(a * 9.0 - uTime * 0.05, 3.0));
        c += uGlow * pow(r, 2.2) * uRays * smoothstep(2.2, 0.3, length(d));
    }
    if (uColumns > 0.0) {                                   // vertical light columns, like light through a curtain
        float x = vUv.x * uAspect;
        float col = pow(vnoise(vec2(x * 5.0, uTime * 0.07)), 3.0) + 0.5 * pow(vnoise(vec2(x * 13.0 + 7.0, uTime * 0.11)), 4.0);
        c += uGlow * col * uColumns * (0.35 + 0.65 * vUv.y);
    }
    c += uFlash;
    c += (hash(vUv * vec2(1931.0, 1087.0) + fract(uTime)) - 0.5) * 0.022;   // film grain, hides gradient banding
    gl_FragColor = vec4(c, 1.0);
}`;

export interface BackdropLook { top: string; bottom: string; glow: string; glowPos?: [number, number]; glowSize?: number; intensity?: number; rays?: number; columns?: number }

/** A full-screen gradient with a glow, light rays or light columns, drawn behind everything else in a stage. */
export function backdrop(look: BackdropLook) {
    const mat = new ShaderMaterial({
        vertexShader: BACKDROP_VS, fragmentShader: BACKDROP_FS, depthWrite: false, depthTest: false,
        uniforms: {
            uTop: { value: raw(look.top) }, uBottom: { value: raw(look.bottom) }, uGlow: { value: raw(look.glow) },
            uGlowPos: { value: new Vector2(...(look.glowPos ?? [0.5, 0.5])) }, uGlowSize: { value: look.glowSize ?? 0.45 },
            uIntensity: { value: look.intensity ?? 0.6 }, uRays: { value: look.rays ?? 0 }, uColumns: { value: look.columns ?? 0 },
            uTime: { value: 0 }, uAspect: { value: 1 }, uFlash: { value: 0 },
        },
    });
    const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return { mesh, u: mat.uniforms, dispose: () => { mesh.geometry.dispose(); mat.dispose(); } };
}

/** Wait (briefly) for the display fonts, so text drawn on canvases uses them. */
export async function fontsReady(specs = ['600 100px "Cormorant Garamond"', 'italic 600 100px "Cormorant Garamond"', '400 100px "Pinyon Script"', '500 40px "Space Grotesk"']) {
    if (!document.fonts) return;
    await Promise.race([Promise.all(specs.map((s) => document.fonts.load(s))), new Promise((r) => setTimeout(r, 1800))]).catch(() => undefined);
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

export const SERIF = '"Cormorant Garamond", Georgia, serif';
export const SCRIPT = '"Pinyon Script", "Cormorant Garamond", cursive';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';
