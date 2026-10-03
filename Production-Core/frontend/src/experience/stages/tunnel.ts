import {
    AdditiveBlending, BackSide, Color, CylinderGeometry, FogExp2, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
    PlaneGeometry, PMREMGenerator, PointLight, Scene, ShaderMaterial, TorusGeometry, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RING_P } from '../copy';
import { embers } from '../procedural/burn';
import { span } from '../procedural/common';
import type { StageFactory } from '../types';

/**
 * Stage 4: a flight down a glossy emerald tunnel through the five agents, towards a light. After the reference's tunnel
 * (its colour, gloss and light that rides ahead of the camera), drawn in code and kept clean: smooth walls, thin lines of
 * light every few metres, one slow band of light running back past you. Five gold gates stand in it; each brightens and
 * turns as you pass through while the agent's name and its row from docs/LEARNING.md appear (Overlays.tsx). Only in the
 * last tenth, after every word has gone, does the light at the end open up into the white of the city.
 */

const Z0 = 46, Z1 = -50;                                   // the camera flies from +z to -z
const camZ = (p: number) => Z0 + (Z1 - Z0) * p;
const LEN = 112, R = 2.1, LINE = 4;                        // tube length, radius, spacing of the lines of light
const END_FROM = 0.9;                                      // the white light only opens after the last words

const GLOW_FS = /* glsl */ `
uniform float uStrength; varying vec2 vUv;
void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = exp(-d * d * 7.0), halo = exp(-d * 2.6) * 0.5;
    vec3 col = mix(vec3(0.62, 1.0, 0.82), vec3(1.0), core);
    gl_FragColor = vec4(col * (core + halo) * uStrength, 1.0);
}`;

const factory: StageFactory = async (ctx) => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.05, 140);
    scene.add(camera);
    scene.fog = new FogExp2(0x010604, 0.07);
    const pmrem = new PMREMGenerator(ctx.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    pmrem.dispose();

    // the walls: deep emerald, metallic and glossy; thin rings of light and one slow band running back past you
    const u = { uTime: { value: 0 }, uEnd: { value: 0 }, uLine: { value: new Color('#8ff5c8') } };
    const wallMat = new MeshStandardMaterial({
        color: '#052c1e', emissive: '#00180a', emissiveIntensity: 0.6, metalness: 0.45, roughness: 0.3, side: BackSide, envMapIntensity: 0,
    });
    wallMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform float uTime, uEnd;\nuniform vec3 uLine;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float f = abs(fract(vWorldP.z / ${LINE.toFixed(1)}) - 0.5) * ${LINE.toFixed(1)};      // distance to the nearest line
                float lines = exp(-f * f * 900.0) * 0.55;
                float band = exp(-pow((fract((vWorldP.z - uTime * 6.0) / 24.0) - 0.5) * 24.0, 2.0) * 1.5) * 0.35;
                float spill = smoothstep(${(-LEN / 2 + 12).toFixed(1)}, ${(-LEN / 2).toFixed(1)}, vWorldP.z);
                totalEmissiveRadiance += uLine * (lines + band) + vec3(0.85, 1.0, 0.92) * spill * spill * uEnd * 1.8;`);
    };
    const tubeGeo = new CylinderGeometry(R, R, LEN, 160, 1, true);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new Mesh(tubeGeo, wallMat);
    scene.add(tube);

    // the light that rides ahead of the camera: it gives the walls their sheen without lighting the ones beside you
    const near = new PointLight('#b8ffd9', 1.0, 14, 2);
    scene.add(near);

    // the five gates (one per agent): a thin gold ring and its soft glow
    const gateGeo = new TorusGeometry(1.7, 0.022, 16, 200);
    const haloGeo = new TorusGeometry(1.7, 0.12, 12, 200);
    const gates = RING_P.map((p) => {
        const z = camZ(p);
        const coreMat = new MeshStandardMaterial({ color: '#f3dc8f', emissive: '#f3dc8f', emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.25, envMapIntensity: 0.4 });
        const haloMat = new MeshBasicMaterial({ color: '#f3dc8f', transparent: true, opacity: 0.02, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
        const core = new Mesh(gateGeo, coreMat), halo = new Mesh(haloGeo, haloMat);
        core.position.z = halo.position.z = z;
        scene.add(core, halo);
        return { core, halo, coreMat, haloMat, z, passed: false, spin: 0 };
    });

    // the light at the end of the tunnel
    const glowMat = new ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: GLOW_FS, uniforms: { uStrength: { value: 0 } }, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false,
    });
    const glow = new Mesh(new PlaneGeometry(9, 9), glowMat);
    glow.position.z = -LEN / 2 + 1;
    scene.add(glow);

    const dust = embers(260, new Vector3(3.2, 3.2, 100), new Vector3(0, 0, 0), 12);
    dust.mat.uniforms.uSize.value = 0.35;
    dust.mat.uniforms.uMaxSize.value = 3;
    dust.mat.uniforms.uColor.value.set(0.8, 1.0, 0.88);
    dust.mat.uniforms.uRise.value = 0.6;
    scene.add(dust.points);
    let entered = false;

    return {
        scene, camera,
        resize(w, h) { camera.aspect = w / h; camera.fov = w / h < 1 ? 75 : 60; camera.updateProjectionMatrix(); },
        update(p, dt, c) {
            const t = c.time;
            const z = camZ(Math.max(0, p));
            camera.position.set(Math.sin(t * 0.4) * 0.1 + c.pointer.x * 0.25, Math.cos(t * 0.33) * 0.08 - c.pointer.y * 0.18, z);
            camera.lookAt(-c.pointer.x * 0.35, c.pointer.y * 0.25, z - 10);
            near.position.set(0, 0, z - 7);
            u.uTime.value = t;
            wallMat.emissiveIntensity = 0.6 * Math.min(1, span(p, -0.1, 0.05) + 0.3);
            if (!entered && p > -0.05) { entered = true; c.sound.fx('tunnel'); }

            for (const g of gates) {
                const d = z - g.z;                                         // > 0: still ahead
                const lit = Math.exp(-((d - 1.5) ** 2) / 14);
                g.coreMat.emissiveIntensity = 0.3 + lit * 1.2;
                g.haloMat.opacity = 0.015 + lit * 0.12;
                g.spin += dt * (0.1 + lit * 1.2);                          // a slow turn that quickens as you pass through
                g.core.rotation.z = g.halo.rotation.z = g.spin;
                if (!g.passed && d < 0) { g.passed = true; c.sound.fx('whoosh'); }
                if (g.passed && d > 2) g.passed = false;
            }
            // a small, steady light ahead the whole way; it opens up only at the very end
            const end = span(p, END_FROM, 1);
            glowMat.uniforms.uStrength.value = 0.35 + end * end * 1.6;
            glow.scale.setScalar(1 + end * end * 1.5);
            u.uEnd.value = end;
            (scene.fog as FogExp2).density = 0.07 * (1 - end * 0.5);
            dust.mat.uniforms.uTime.value = t;
            dust.mat.uniforms.uOpacity.value = 0.45;
        },
        dispose() {
            wallMat.dispose(); tubeGeo.dispose(); gateGeo.dispose(); haloGeo.dispose(); dust.dispose(); env.dispose();
            glow.geometry.dispose(); glowMat.dispose();
            gates.forEach((g) => { g.coreMat.dispose(); g.haloMat.dispose(); });
        },
    };
};

export default factory;
