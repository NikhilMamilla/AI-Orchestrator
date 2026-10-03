import { AnimationMixer, Mesh, PerspectiveCamera, Quaternion, ShaderMaterial, Vector2, Vector3, type AnimationAction, type Object3D, type Texture } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp01 } from '../../procedural/common';

/** Shared pieces of the asset-based stages: scrubbed animations, the skin shader, following an animated camera. */

/** All animation clips of a model, paused and positioned by hand ("scrubbed"). */
export function scrubbable(g: GLTF) {
    const mixer = new AnimationMixer(g.scene);
    const actions: AnimationAction[] = g.animations.map((c) => { const a = mixer.clipAction(c); a.play(); a.paused = true; return a; });
    const duration = Math.max(0, ...g.animations.map((c) => c.duration));
    return { mixer, actions, duration, set: (t: number) => { actions.forEach((a) => { a.time = Math.min(t, a.getClip().duration); }); mixer.update(0); } };
}

/** One tile of the hand atlas (4 x 4 tiles; v runs downwards). */
export const tile = (col: number, row: number) => ({ offset: new Vector2(col * 0.25, 1 - row * 0.25), scale: new Vector2(0.25, -0.25) });

const SKIN_VS = /* glsl */ `
varying vec2 vUv;
#include <skinning_pars_vertex>
void main() {
    vUv = uv;
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
}`;
const SKIN_FS = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uOffA, uScaleA, uOffB, uScaleB, uAlphaOff, uAlphaScale;
uniform float uMix, uOpacity;
varying vec2 vUv;
void main() {
    vec4 a = texture2D(uAtlas, vUv * uScaleA + uOffA), b = texture2D(uAtlas, vUv * uScaleB + uOffB);
    vec4 m = mix(vec4(a.rgb * a.a, a.a), vec4(b.rgb * b.a, b.a), uMix);
    float mask = texture2D(uAtlas, vUv * uAlphaScale + uAlphaOff).r;
    gl_FragColor = vec4(m.rgb * uOpacity * mask, m.a * uOpacity * mask);
    #include <colorspace_fragment>
}`;

/**
 * A skinned hand whose look changes along its animation: the atlas tiles are keyframes (at animation frames, 30 fps),
 * blended two at a time, and the white hand silhouette tile cuts it out.
 */
export function skin(atlas: Texture | null, tiles: { offset: Vector2; scale: Vector2 }[], frames: number[], frameOffset: number, duration: number) {
    const mat = new ShaderMaterial({
        vertexShader: SKIN_VS, fragmentShader: SKIN_FS, transparent: true, premultipliedAlpha: true, toneMapped: false,
        uniforms: {
            uAtlas: { value: atlas }, uOffA: { value: tiles[0].offset.clone() }, uScaleA: { value: tiles[0].scale }, uOffB: { value: tiles[0].offset.clone() },
            uScaleB: { value: tiles[0].scale }, uMix: { value: 0 }, uOpacity: { value: atlas ? 1 : 0 },
            uAlphaOff: { value: new Vector2(0.75, 0.25) }, uAlphaScale: { value: new Vector2(0.25, -0.25) },
        },
    });
    const times = frames.map((f) => (f - frameOffset) / 30 / duration);
    const at = (s: number) => {
        let i = 0;
        while (i < times.length - 2 && s >= times[i + 1]) i++;
        if (s <= times[0]) { mat.uniforms.uOffA.value.copy(tiles[0].offset); mat.uniforms.uOffB.value.copy(tiles[0].offset); mat.uniforms.uMix.value = 0; return; }
        if (s >= times[times.length - 1]) { const l = tiles[tiles.length - 1].offset; mat.uniforms.uOffA.value.copy(l); mat.uniforms.uOffB.value.copy(l); mat.uniforms.uMix.value = 0; return; }
        mat.uniforms.uOffA.value.copy(tiles[i].offset);
        mat.uniforms.uOffB.value.copy(tiles[i + 1].offset);
        mat.uniforms.uMix.value = clamp01((s - times[i]) / (times[i + 1] - times[i]));
    };
    return { mat, at };
}

/** Put a material on every mesh under the node with this name. */
export function dress(root: Object3D, name: string, material: ShaderMaterial) {
    root.traverse((o) => { if (o.name === name) o.traverse((m) => { if ((m as Mesh).isMesh) { (m as Mesh).material = material; m.frustumCulled = false; } }); });
}

/** The animated camera inside a model ("Camera"), and a follower that eases our camera onto it. */
export function cameraPath(g: GLTF) {
    let ref: PerspectiveCamera | null = null;
    g.scene.traverse((o) => { if ((o as Mesh).isMesh) o.visible = false; if ((o as PerspectiveCamera).isPerspectiveCamera && !ref) ref = o as PerspectiveCamera; });
    const wp = new Vector3(), wq = new Quaternion(), nudge = new Vector3();
    let first = true;
    return {
        follow(camera: PerspectiveCamera, dt: number, pointer: { x: number; y: number }, look = 0.03) {
            const r = ref as PerspectiveCamera | null;
            if (!r) return;
            r.updateWorldMatrix(true, false);
            r.getWorldPosition(wp);
            r.getWorldQuaternion(wq);
            const k = first ? 1 : 1 - Math.exp(-dt * 5);
            first = false;
            camera.position.lerp(wp, k);
            camera.quaternion.slerp(wq, k);
            if (Math.abs(camera.fov - r.fov) > 0.01) { camera.fov = r.fov; camera.updateProjectionMatrix(); }
            nudge.set(pointer.x * look, -pointer.y * look * 0.66, 0).applyQuaternion(camera.quaternion);
            camera.position.add(nudge);
        },
    };
}
