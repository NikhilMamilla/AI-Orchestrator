import {
    BufferAttribute, DoubleSide, ExtrudeGeometry, Mesh, ShaderMaterial, Shape, Vector2, type BufferGeometry, type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './common';

/**
 * Glass that can break. A pane is cut into radial cells around an impact point (shared corners, so before it breaks it
 * is seamless), every cell keeps the part of the pane's texture it covers, and the vertex shader flies the cells apart:
 * one geometry, one draw call. The same material renders whole glass slabs (with the animation attributes at zero).
 */

const VS = /* glsl */ `
uniform float uT;
attribute vec3 aCenter;
attribute vec3 aDir;
attribute vec3 aSpin;
attribute float aDelay;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
mat3 rotAxis(vec3 a, float ang) {
    float s = sin(ang), c = cos(ang), oc = 1.0 - c;
    return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
                oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
                oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
}
void main() {
    float t = clamp((uT - aDelay) / max(0.001, 1.0 - aDelay), 0.0, 1.0);
    float spinLen = length(aSpin);
    mat3 R = spinLen > 0.0001 ? rotAxis(aSpin / spinLen, spinLen * t) : mat3(1.0);
    vec3 p = R * (position - aCenter) + aCenter + aDir * t + vec3(0.0, -1.6 * t * t, 0.0);
    vN = normalize(normalMatrix * (R * normal));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
uniform sampler2D uText;
uniform sampler2D uCrack;
uniform float uCrackR;
uniform float uOpacity;
uniform float uAspect;
uniform vec2 uImpact;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
    vec3 n = normalize(vN), v = normalize(vView);
    float facing = abs(dot(n, v));
    float fres = pow(1.0 - facing, 2.0);
    vec3 l1 = normalize(vec3(-0.45, 0.65, 0.6)), l2 = normalize(vec3(0.7, -0.2, 0.5));
    float spec = pow(max(dot(reflect(-l1, n), v), 0.0), 48.0) + 0.5 * pow(max(dot(reflect(-l2, n), v), 0.0), 24.0);
    vec3 col = uTint * (0.12 + fres * 0.7) + vec3(spec);
    float a = 0.12 + fres * 0.45 + spec * 0.7;
    vec4 tx = texture2D(uText, vUv);
    col = mix(col, tx.rgb, tx.a);
    a = max(a, tx.a);
    vec2 d = (vUv - uImpact) * vec2(uAspect, 1.0);
    float cr = texture2D(uCrack, vUv).a * (1.0 - smoothstep(uCrackR - 0.03, uCrackR, length(d)));
    col = mix(col, vec3(1.0), cr * 0.85);
    a = max(a, cr * 0.9);
    gl_FragColor = vec4(col, a * uOpacity);
    #include <colorspace_fragment>
}`;

export function glassMaterial(text: Texture, crack: Texture | null, tint: [number, number, number] = [0.72, 0.78, 1.0]) {
    return new ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: {
            uT: { value: 0 }, uText: { value: text }, uCrack: { value: crack ?? text }, uCrackR: { value: crack ? 0 : -1 },
            uOpacity: { value: 1 }, uAspect: { value: 2 }, uImpact: { value: new Vector2(0.5, 0.5) }, uTint: { value: tint },
        },
    });
}

type V = { x: number; y: number };

/** Keep the part of a convex polygon inside the rectangle (Sutherland-Hodgman). */
function clip(poly: V[], hw: number, hh: number): V[] {
    const planes: [(p: V) => number][] = [[(p) => -hw - p.x], [(p) => p.x - hw], [(p) => -hh - p.y], [(p) => p.y - hh]];
    let out = poly;
    for (const [f] of planes) {
        const src = out;
        out = [];
        for (let i = 0; i < src.length; i++) {
            const a = src[i], b = src[(i + 1) % src.length], fa = f(a), fb = f(b);
            if (fa <= 0) out.push(a);
            if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
        }
        if (!out.length) return out;
    }
    return out;
}

/** Fill the animation attributes of one cell's geometry. */
function tag(g: BufferGeometry, c: [number, number, number], dir: [number, number, number], spin: [number, number, number], delay: number, w: number, h: number) {
    const n = g.getAttribute('position').count;
    const fill = (v: number[]) => { const a = new Float32Array(n * v.length); for (let i = 0; i < n; i++) a.set(v, i * v.length); return a; };
    g.setAttribute('aCenter', new BufferAttribute(fill(c), 3));
    g.setAttribute('aDir', new BufferAttribute(fill(dir), 3));
    g.setAttribute('aSpin', new BufferAttribute(fill(spin), 3));
    g.setAttribute('aDelay', new BufferAttribute(fill([delay]), 1));
    const pos = g.getAttribute('position'), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = pos.getX(i) / w + 0.5; uv[i * 2 + 1] = pos.getY(i) / h + 0.5; }   // the pane's texture, per cell
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    return g;
}

/**
 * A w x h pane broken around `impact` (in 0..1 pane coordinates). Returns the merged geometry and the crack lines (cell
 * edges) in 0..1 pane coordinates, for drawing the cracks before it breaks.
 */
export function brokenPane(w: number, h: number, impact: [number, number], seed = 3) {
    const R = rng(seed);
    const ix = (impact[0] - 0.5) * w, iy = (impact[1] - 0.5) * h;
    const rings = [0, 0.32, 0.72, 1.25, 1.95, 2.85, 4.0, 5.6, 7.6];
    const N = 15;
    const angles = Array.from({ length: N }, (_, i) => ((i + 0.2 + R() * 0.6) / N) * Math.PI * 2);
    const grid: V[][] = rings.map((r, k) => angles.map((a) => {
        if (k === 0) return { x: ix, y: iy };
        const rr = r * (0.82 + R() * 0.36), aa = a + (R() - 0.5) * 0.18;
        return { x: ix + Math.cos(aa) * rr, y: iy + Math.sin(aa) * rr };
    }));
    const parts: BufferGeometry[] = [];
    const lines: [V, V][] = [];
    const norm = (p: V): V => ({ x: p.x / w + 0.5, y: p.y / h + 0.5 });
    for (let k = 0; k < rings.length - 1; k++) {
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const raw = k === 0 ? [grid[0][i], grid[1][i], grid[1][j]] : [grid[k][i], grid[k + 1][i], grid[k + 1][j], grid[k][j]];
            const poly = clip(raw, w / 2, h / 2);
            if (poly.length < 3) continue;
            for (let e = 0; e < poly.length; e++) lines.push([norm(poly[e]), norm(poly[(e + 1) % poly.length])]);
            const shape = new Shape(poly.map((p) => new Vector2(p.x, p.y)));
            const g = new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
            g.translate(0, 0, -0.025);
            const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
            const dx = cx - ix, dy = cy - iy, dl = Math.hypot(dx, dy) || 1;
            const dist = dl / Math.hypot(w, h);
            const speed = 2.2 + R() * 3.5 + (1 - dist) * 2;
            const dir: [number, number, number] = [(dx / dl) * speed, (dy / dl) * speed * 0.8, 2.5 + R() * 6 * (1 - dist)];
            const spin: [number, number, number] = [(R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 5];
            parts.push(tag(g.toNonIndexed(), [cx, cy, 0], dir, spin, Math.min(0.55, dist * 0.9), w, h));
            g.dispose();
        }
    }
    const geo = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    return { geo, lines };
}

/** A whole, irregular glass slab (one of the evidence shards), with its own texture across it. */
export function glassSlab(w: number, h: number, seed: number) {
    const R = rng(seed);
    const pts: V[] = [
        { x: -w / 2 + R() * 0.3, y: -h / 2 + R() * 0.2 }, { x: w * (0.1 + R() * 0.2), y: -h / 2 - R() * 0.15 },
        { x: w / 2 + R() * 0.15, y: -h * 0.1 }, { x: w / 2 - R() * 0.3, y: h / 2 + R() * 0.15 },
        { x: -w * 0.2, y: h / 2 + R() * 0.1 }, { x: -w / 2 - R() * 0.2, y: h * 0.15 },
    ];
    const g = new ExtrudeGeometry(new Shape(pts.map((p) => new Vector2(p.x, p.y))), { depth: 0.07, bevelEnabled: false });
    g.translate(0, 0, -0.035);
    const out = tag(g.toNonIndexed(), [0, 0, 0], [0, 0, 0], [0, 0, 0], 0, w * 1.1, h * 1.1);
    g.dispose();
    return out;
}

export const glassMesh = (geo: BufferGeometry, mat: ShaderMaterial) => { const m = new Mesh(geo, mat); m.frustumCulled = false; return m; };
