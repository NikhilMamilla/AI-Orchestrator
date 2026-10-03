import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Points, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { NOISE_GLSL, rng } from './common';

/**
 * Paper that burns: a fractal-noise front eats the sheet from its edge inwards (or from the centre out), with a glowing
 * ember rim and a charred band behind it, and the sheet ripples a little while it burns.
 */
const VS = /* glsl */ `
uniform float uTime, uSeed, uWaveAmp, uWaveFreq;
varying vec2 vUv;
void main() {
    vUv = uv;
    vec3 pos = position;
    pos.z += sin(uv.x * uWaveFreq + uTime * 2.0 + uSeed * 6.283) * uWaveAmp + sin(uv.y * uWaveFreq * 0.7 + uTime * 1.5 + uSeed * 3.7) * uWaveAmp * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const FS = /* glsl */ `
uniform sampler2D uTexture;
uniform float uBurnProgress, uBurnScale, uEmberWidth, uCharWidth, uBurnDirection, uAspect, uSeed, uTime, uTexRotate, uOpacity;
uniform vec3 uEmberColor, uEmberTip, uCharColor;
uniform vec2 uTexOffset, uTexScale;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
    vec2 c = vUv - 0.5; c.x *= uAspect;
    float edgeDist = 1.0 - clamp(length(c) * 2.0 / uAspect, 0.0, 1.0);
    float distField = mix(1.0 - edgeDist, edgeDist, uBurnDirection);
    float threshold = clamp(uBurnProgress, 0.0, 1.0) * 1.5;
    if (distField * 0.5 + 0.5 < threshold) discard;
    vec2 mUv = uTexRotate > 0.5 ? vec2(vUv.y, 1.0 - vUv.x) : vUv;
    vec4 tex = texture2D(uTexture, mUv * uTexScale + uTexOffset);
    vec2 nUv = vec2(vUv.x * uAspect, vUv.y) * uBurnScale;
    float n = fbm(nUv + uSeed * 73.156) * 0.65 + fbm(nUv * 0.8 + uSeed * 73.156 + 50.0) * 0.35;
    float edge = distField * 0.5 + n * 0.5 - threshold;
    if (edge < 0.0) discard;
    float charF = 1.0 - smoothstep(0.0, uCharWidth, edge);
    float emberF = 1.0 - smoothstep(0.0, uEmberWidth, edge);
    vec3 ember = mix(uEmberColor, uEmberTip, emberF) * (vnoise(nUv * 0.8 + uTime * 2.5) * 10.0 + 0.5);
    vec3 rgb = mix(tex.rgb, uCharColor, charF) + ember * emberF;
    gl_FragColor = vec4(rgb, tex.a * smoothstep(0.0, uEmberWidth, edge) * uOpacity);
    #include <colorspace_fragment>
}`;

export function burnMaterial(tex: Texture, o: { aspect: number; seed: number; offset?: [number, number]; scale?: [number, number]; rotate?: boolean; inward?: boolean }) {
    return new ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, side: DoubleSide, toneMapped: false,
        uniforms: {
            uTexture: { value: tex }, uBurnProgress: { value: 0 }, uBurnScale: { value: 4 }, uEmberWidth: { value: 0.025 }, uCharWidth: { value: 0.18 },
            uBurnDirection: { value: o.inward === false ? 0 : 1 }, uAspect: { value: o.aspect }, uEmberColor: { value: new Vector3(4, 0.75, 0.05) },
            uEmberTip: { value: new Vector3(6, 1.5, 0.25) }, uCharColor: { value: new Vector3(0.02, 0.01, 0.01) }, uSeed: { value: o.seed }, uTime: { value: 0 },
            uWaveAmp: { value: 0.015 }, uWaveFreq: { value: 8 }, uTexOffset: { value: new Vector2(...(o.offset ?? [0, 0])) },
            uTexScale: { value: new Vector2(...(o.scale ?? [1, 1])) }, uTexRotate: { value: o.rotate ? 1 : 0 }, uOpacity: { value: 1 },
        },
    });
}

/** Embers and ash: additive points that rise, drift and flicker. */
export function embers(count: number, spread: Vector3, center: Vector3, seed = 9) {
    const R = rng(seed), pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        pos.set([center.x + (R() - 0.5) * spread.x, center.y + (R() - 0.5) * spread.y, center.z + (R() - 0.5) * spread.z], i * 3);
        ph[i] = R(); sz[i] = 6 + R() * 18;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new BufferAttribute(ph, 1));
    geo.setAttribute('aSize', new BufferAttribute(sz, 1));
    const mat = new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uRise: { value: spread.y }, uColor: { value: new Vector3(1.0, 0.55, 0.15) }, uSize: { value: 1 }, uMaxSize: { value: 22 } },
        vertexShader: /* glsl */ `
            uniform float uTime, uRise, uSize, uMaxSize; attribute float aPhase, aSize; varying float vA;
            void main() {
                vec3 p = position;
                float t = fract(aPhase + uTime * (0.05 + aPhase * 0.08));
                p.y += (t - 0.5) * uRise;
                p.x += sin(uTime * 0.7 + aPhase * 40.0) * 0.05;
                vA = sin(t * 3.14159) * (0.6 + 0.4 * sin(uTime * 9.0 + aPhase * 60.0));
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_PointSize = min(aSize * uSize / max(0.2, -mv.z), uMaxSize);   // capped: a point next to the camera must not fill the screen
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            uniform float uOpacity; uniform vec3 uColor; varying float vA;
            void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor * (0.6 + a), a * vA * uOpacity); }`,
    });
    const points = new Points(geo, mat);
    points.frustumCulled = false;
    return { points, mat, dispose: () => { geo.dispose(); mat.dispose(); } };
}
