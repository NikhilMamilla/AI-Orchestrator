import {
    DoubleSide, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Texture,
} from 'three';
import { rng } from '../../procedural/common';

/**
 * A swirl of petals drawn from the petal frames of shards-petals-coins.ktx2 (only the petal frames: the atlas's
 * statistics and logo coins are never sampled). One instanced draw call; each petal is a curved quad that tumbles,
 * drifts down-left, orbits the box centre and fades at the box edges so the field wraps without popping.
 */

const COUNT = 450;
const BOUNDS = new Vector3(1.7, 0.7, 1.1);
const CENTER = new Vector3(-0.5, 0, 0);
const ATLAS = 2048;
// petal frames (x, y, w, h in atlas pixels): the bottom half of the atlas, left and right groups
const PETALS = [[0, 1249, 256, 234], [256, 1249, 256, 311], [0, 1483, 256, 311], [256, 1560, 256, 311], [986, 1243, 256, 311], [1242, 1243, 256, 311],
    [1498, 1243, 256, 311], [1754, 1243, 256, 311], [986, 1560, 256, 311], [1242, 1560, 256, 311], [1498, 1560, 256, 311], [1754, 1560, 256, 311]]
    .map(([x, y, w, h]) => [x / ATLAS, 1 - (y + h) / ATLAS, w / ATLAS, h / ATLAS]);

const VS = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aVelocity;
attribute float aPhase;
attribute vec4 aPetalRect;
attribute float aScale;
attribute vec2 aRotSpeed;
uniform float uTime;
uniform float uSwirlTime;
uniform vec3 uBounds;
uniform vec3 uBoundsCenter;
uniform float uEntry;
varying vec2 vUv;
varying vec4 vPetalRect;
varying float vOpacity;
varying float vBrightness;
varying float vSaturation;
varying float vFresnel;
vec3 wrapPos(vec3 p, vec3 b) { return mod(p + b, 2.0 * b) - b; }
void main() {
    vec3 cp = wrapPos(aOffset + aVelocity * uTime - uBoundsCenter, uBounds);
    float entryT = clamp((uEntry - aPhase / 6.283 * 0.3) / 0.7, 0.0, 1.0);
    float entryEase = entryT * entryT * (3.0 - 2.0 * entryT);
    cp.x += (1.0 - entryEase) * uBounds.x * 3.0;                 // petals slide in from the right
    float sw = uSwirlTime * (0.15 + aPhase * 0.08);
    cp.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * cp.xz;
    cp.x += sin(cp.y * 8.0 + uTime * 1.3 + aPhase) * 0.02 * entryEase;
    cp.z += sin(cp.y * 6.0 + uTime * 1.17 + aPhase * 1.7) * 0.02 * entryEase;
    cp.y += sin(cp.x * 7.0 + uTime * 0.91 + aPhase * 0.5) * 0.01 * entryEase;
    vOpacity = smoothstep(0.0, 0.3, (uBounds.x - abs(cp.x)) / uBounds.x) * smoothstep(0.0, 0.3, (uBounds.y - abs(cp.y)) / uBounds.y)
             * smoothstep(0.0, 0.3, (uBounds.z - abs(cp.z)) / uBounds.z);
    if (vOpacity < 0.001) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
    vec3 pos = position * aScale;
    float waveArg = position.x * 6.0 + uTime * 3.0 + aPhase;
    pos.z += sin(waveArg) * 0.12 * aScale;
    float ax = aPhase + uTime * aRotSpeed.x, ay = aPhase * 1.3 + uTime * aRotSpeed.y;
    float cx = cos(ax), sx = sin(ax), cy = cos(ay), sy = sin(ay);
    mat3 rot = mat3(cy, sy * sx, sy * cx, 0.0, cx, -sx, -sy, cy * sx, cy * cx);
    pos = rot * pos;
    float dzdx = cos(waveArg) * 6.0 * 0.12 * aScale;
    vec3 n = normalize(rot * vec3(-dzdx, 0.0, 1.0));
    vec3 worldPos = (modelMatrix * vec4(pos + cp + uBoundsCenter, 1.0)).xyz;
    float f = 1.0 - abs(dot(n, normalize(cameraPosition - worldPos)));
    vFresnel = f * f;
    vUv = uv;
    vPetalRect = aPetalRect;
    vBrightness = 0.7 + fract(aPhase * 3.17) * 0.6;
    vSaturation = 0.6 + fract(aPhase * 5.43) * 0.8;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + cp + uBoundsCenter, 1.0);
}`;

const FS = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;
varying vec2 vUv;
varying vec4 vPetalRect;
varying float vOpacity;
varying float vBrightness;
varying float vSaturation;
varying float vFresnel;
void main() {
    vec4 texel = texture2D(uAtlas, vPetalRect.xy + vPetalRect.zw * (0.01 + vUv * 0.98));
    float a = texel.a * uOpacity * vOpacity;
    if (a < 0.005) discard;
    float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
    vec3 color = mix(vec3(lum), texel.rgb, vSaturation) * vBrightness;
    float base = lum * vBrightness, lit = base * (0.65 + 1.15 * vFresnel);
    color = lit + (color - base) * (lit / max(base, 0.001));
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
}`;

export function petals(atlas: Texture) {
    const R = rng(21);
    const base = new PlaneGeometry(1, 1, 6, 3);
    const pos = base.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, (x * x + y * y) * 0.6); }   // cupped
    base.computeVertexNormals();
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    geo.setAttribute('uv', base.attributes.uv);
    geo.instanceCount = COUNT;
    const off = new Float32Array(COUNT * 3), vel = new Float32Array(COUNT * 3), ph = new Float32Array(COUNT), rect = new Float32Array(COUNT * 4);
    const sc = new Float32Array(COUNT), rs = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
        off.set([CENTER.x + (R() * 2 - 1) * BOUNDS.x, (R() * 2 - 1) * BOUNDS.y, (R() * 2 - 1) * BOUNDS.z], i * 3);
        const s = 0.07 + R() * 0.11;
        vel.set([-s * 1.732 + (R() - 0.5) * 0.08, -s, (R() - 0.5) * 0.08], i * 3);
        ph[i] = R() * Math.PI * 2;
        rect.set(PETALS[(R() * PETALS.length) | 0], i * 4);
        sc[i] = 0.0084 + R() * (0.06 - 0.0084);
        rs.set([0.3 + R() * 0.9, 0.3 + R() * 0.9], i * 2);
    }
    geo.setAttribute('aOffset', new InstancedBufferAttribute(off, 3));
    geo.setAttribute('aVelocity', new InstancedBufferAttribute(vel, 3));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(ph, 1));
    geo.setAttribute('aPetalRect', new InstancedBufferAttribute(rect, 4));
    geo.setAttribute('aScale', new InstancedBufferAttribute(sc, 1));
    geo.setAttribute('aRotSpeed', new InstancedBufferAttribute(rs, 2));
    const mat = new ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uSwirlTime: { value: 0 }, uAtlas: { value: atlas }, uBounds: { value: BOUNDS }, uBoundsCenter: { value: CENTER }, uOpacity: { value: 1 }, uEntry: { value: 0 } },
    });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    const group = new Group();
    group.add(mesh);
    let entry = 0;
    return {
        group,
        setEntry(e: number) { entry = Math.min(1, Math.max(0, e)); mat.uniforms.uEntry.value = entry; },
        update(dt: number, swirl = 1) {
            mat.uniforms.uTime.value += dt;
            mat.uniforms.uSwirlTime.value += dt * entry * entry * (3 - 2 * entry) * swirl;
        },
        dispose() { base.dispose(); geo.dispose(); mat.dispose(); },
    };
}
