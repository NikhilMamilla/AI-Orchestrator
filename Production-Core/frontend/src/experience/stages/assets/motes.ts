import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { rng } from '../../procedural/common';

/**
 * A quiet field of light motes: soft round specks that rise slowly and sway, wrapping inside a box in front of the
 * camera so the field never ends. One draw call, no textures. `setEntry` fades the field in; `update`'s `swirl` speeds
 * it up while the ring is held.
 */

const COUNT = 140;
const BOUNDS = new Vector3(1.7, 0.7, 1.1);

const VS = /* glsl */ `
attribute float aPhase;
attribute float aSize;
attribute float aRise;
uniform float uTime;
uniform float uEntry;
uniform float uPx;
uniform vec3 uBounds;
varying float vAlpha;
varying float vWarm;
void main() {
    vec3 p = position;
    p.y += aRise * uTime;
    p.x += sin(uTime * 0.35 + aPhase) * 0.05;
    p.z += cos(uTime * 0.3 + aPhase * 1.7) * 0.04;
    p = mod(p + uBounds, 2.0 * uBounds) - uBounds;
    float edge = smoothstep(0.0, 0.3, (uBounds.x - abs(p.x)) / uBounds.x) * smoothstep(0.0, 0.3, (uBounds.y - abs(p.y)) / uBounds.y)
               * smoothstep(0.0, 0.3, (uBounds.z - abs(p.z)) / uBounds.z);
    float tw = 0.65 + 0.35 * sin(uTime * 0.9 + aPhase * 3.0);
    vAlpha = edge * tw * uEntry;
    vWarm = step(0.8, fract(aPhase * 7.13));                       // one in five is warm gold
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(aSize * uPx / max(0.5, -mv.z), 22.0);
    gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */ `
varying float vAlpha;
varying float vWarm;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * vAlpha;
    if (a < 0.004) discard;
    vec3 col = mix(vec3(1.0), vec3(1.0, 0.86, 0.45), vWarm);
    gl_FragColor = vec4(col, a * 0.85);
    #include <colorspace_fragment>
}`;

export function motes() {
    const R = rng(21);
    const pos = new Float32Array(COUNT * 3), ph = new Float32Array(COUNT), size = new Float32Array(COUNT), rise = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
        pos.set([(R() * 2 - 1) * BOUNDS.x, (R() * 2 - 1) * BOUNDS.y, (R() * 2 - 1) * BOUNDS.z], i * 3);
        ph[i] = R() * Math.PI * 2;
        size[i] = 0.004 + R() * 0.008;
        rise[i] = 0.02 + R() * 0.05;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new BufferAttribute(ph, 1));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    geo.setAttribute('aRise', new BufferAttribute(rise, 1));
    const mat = new ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uEntry: { value: 0 }, uBounds: { value: BOUNDS }, uPx: { value: 900 * Math.min(2, window.devicePixelRatio || 1) } },
    });
    const points = new Points(geo, mat);
    points.frustumCulled = false;
    const group = new Group();
    group.add(points);
    return {
        group,
        setEntry(e: number) { const k = Math.min(1, Math.max(0, e)); mat.uniforms.uEntry.value = k * k * (3 - 2 * k); },
        update(dt: number, swirl = 1) { mat.uniforms.uTime.value += dt * (1 + (swirl - 1) * 0.5); },
        dispose() { geo.dispose(); mat.dispose(); },
    };
}
