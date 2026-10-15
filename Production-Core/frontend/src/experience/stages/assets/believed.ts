import { Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3 } from 'three';
import { clamp01, span } from '../../procedural/common';
import { cameraPath, scrubbable } from './common';
import type { StageCtx, StageFactory } from '../../types';
import { motes } from './motes';

/**
 * Stage 1 ("Every learner is different") on the placeholder assets: the camera path of camera_1.glb sways the view a little over
 * the opening sky and the drifting light motes. The stage is words only: no model is shown, so none is loaded (the hand
 * models and their textures were never drawn). Scroll scrubs the camera's animation; holding the ring plays the last part.
 * The words on top are Kiddoo's (Overlays.tsx).
 */

// the background: the opening gradient, unchanged for the whole stage (no garden), so the count and this scene are one sky
const BG_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FS = /* glsl */ `
varying vec2 vUv;
vec3 radial(vec2 c, vec2 r, vec3 base, vec3 glow) {
    vec2 d = (vec2(vUv.x, 1.0 - vUv.y) - c) / r;
    return mix(base, glow, 1.0 - smoothstep(0.0, 1.0, length(d)));
}
void main() {
    // the opening gradient: teal-blue with mint glows at the top and bottom centre
    vec3 base = vec3(110.0, 200.0, 230.0) / 255.0, glow = vec3(170.0, 235.0, 215.0) / 255.0;
    vec3 g = radial(vec2(0.5, 0.0), vec2(0.85, 0.7), base, glow);
    g = mix(g, radial(vec2(0.5, 1.0), vec2(0.85, 0.7), base, glow), 0.5);
    vec3 col = pow(g, vec3(2.2));
    // the foreground: a soft green-grey pull into the bottom corners
    float corner = pow(1.0 - vUv.y, 1.6) * (0.35 + 0.65 * abs(vUv.x - 0.5) * 2.0);
    col = mix(col, pow(vec3(150.0, 191.0, 174.0) / 255.0, vec3(2.2)), corner * 0.45);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}`;

function background() {
    const mat = new ShaderMaterial({ vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false });
    const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return { mesh, dispose: () => { mesh.geometry.dispose(); mat.dispose(); } };
}

const factory: StageFactory = async (ctx: StageCtx) => {
    const cam = await ctx.assets.model('camera1');
    if (!cam) return (await import('../believed')).default(ctx);          // asset missing: the procedural stage

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    const bg = background();
    scene.add(bg.mesh);

    const rig = scrubbable(cam);                                           // its clip is 18.57 s, as the longest of the three clips always was
    const path = cameraPath(cam);
    scene.add(cam.scene);                                                  // its meshes are hidden by cameraPath; only the camera is used

    const flowers = motes();
    scene.add(flowers.group);

    const fwd = new Vector3();
    let entered = false;

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        },
        update(p, dt, c) {
            // scroll plays 70% of the camera clip from a little way in, and holding the ring plays the rest
            const s = clamp01(0.15 + span(p, 0.06, 1) * 0.55 + (c.holdDone ? 0.3 : c.hold * 0.3));
            rig.set(rig.duration * s);
            if (!entered && p > 0.08) { entered = true; c.sound.fx('hand'); }

            path.follow(camera, dt, c.pointer);

            flowers.setEntry(span(p, 0.25, 0.85));
            fwd.set(0, 0, -0.7).applyQuaternion(camera.quaternion);
            flowers.group.position.copy(camera.position).add(fwd);
            flowers.update(dt, 1 + c.hold * 3);
        },
        dispose() {
            bg.dispose(); flowers.dispose();
            rig.mixer.stopAllAction();
            scene.remove(cam.scene);                                       // the model stays cached for a return visit
        },
    };
};

export default factory;
