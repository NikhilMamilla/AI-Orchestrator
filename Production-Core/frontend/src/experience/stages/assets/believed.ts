import { Group, Mesh, MeshMatcapMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, type Texture } from 'three';
import { clamp01, ease, pearlMatcap, span } from '../../procedural/common';
import { cameraPath, dress, scrubbable, skin, tile } from './common';
import type { StageCtx, StageFactory } from '../../types';
import { petals } from './petals';

/**
 * Stage 1 ("Every learner is different") on the placeholder assets: the sculpted hand and the human hand (fancy_hand_2.glb, human_hand_1.glb),
 * the camera path of camera_1.glb, the hand textures and mask from human_hands.ktx2, petals, and the opening sky behind them. Scroll scrubs every animation; holding the ring plays the last part, where the hands
 * meet. The words on top are Kiddoo's (Overlays.tsx).
 */

// the background: the opening gradient, unchanged for the whole stage (no garden), so the count, the gate and this scene are one sky
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
    const A = ctx.assets;
    const [eth, human, cam, handsAtlas, spc] = await Promise.all([
        A.model('handEth'), A.model('handHuman'), A.model('camera1'),
        A.texture('humanHandsAtlas'), A.texture('spcAtlas'),
    ]);
    if (!eth || !human || !cam) return (await import('../believed')).default(ctx);   // assets missing: the procedural stage

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    const bg = background();
    scene.add(bg.mesh);

    // the sculpted hand: matcap, the model's own normal map, the hand mask from the atlas
    let normalMap: Texture | null = null;
    eth.scene.traverse((o) => { const m = (o as Mesh).material as { normalMap?: Texture } | undefined; if (!normalMap && m?.normalMap) normalMap = m.normalMap; });
    const mask = handsAtlas ? handsAtlas.clone() : null;
    if (mask) { mask.offset.set(0.75, 0.25); mask.repeat.set(0.25, -0.25); mask.needsUpdate = true; }
    const ownMatcap = pearlMatcap();                                       // pearl and gold, like the gate's hand
    const ethMat = new MeshMatcapMaterial({ matcap: ownMatcap, alphaMap: mask, normalMap, transparent: true, toneMapped: false });
    eth.scene.traverse((o) => { if ((o as Mesh).isMesh) { (o as Mesh).material = ethMat; o.frustumCulled = false; } });

    // the human hand: the atlas's top row of skin tiles, blended at these animation frames
    const rigs = [scrubbable(eth), scrubbable(human), scrubbable(cam)];
    const duration = Math.max(...rigs.map((r) => r.duration));
    const hand = skin(handsAtlas, [0, 1, 2, 3].map((c) => tile(c, 0)), [216, 340, 405, 435], 0, duration);
    dress(human.scene, 'HumanHand', hand.mat);
    const path = cameraPath(cam);
    const hands = new Group();                                             // both hands, so they can come in from the back together
    hands.add(eth.scene, human.scene);
    scene.add(cam.scene);                                                  // stage 1 is words only: the hands are not shown

    const flowers = spc ? petals(spc) : null;
    if (flowers) scene.add(flowers.group);

    const fwd = new Vector3();
    let entered = false;
    const scrub = (s: number) => { rigs.forEach((r) => r.set(duration * s)); hand.at(s); };

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        },
        update(p, dt, c) {
            // the title card stands alone; once it has gone the hands come forward out of the light, scroll plays 70% of
            // the clip from where the hand is already in view, and holding the ring plays the rest, where the hands meet
            const s = clamp01(0.15 + span(p, 0.06, 1) * 0.55 + (c.holdDone ? 0.3 : c.hold * 0.3));
            const come = ease(span(p, 0.05, 0.2));
            hands.visible = come > 0.001;
            hands.position.z = -0.35 * (1 - come);                            // from a little further back, fading in
            ethMat.opacity = come;
            scrub(s);
            if (!entered && p > 0.08) { entered = true; c.sound.fx('hand'); }

            path.follow(camera, dt, c.pointer);

            if (flowers) {
                flowers.setEntry(span(p, 0.25, 0.85));
                fwd.set(0, 0, -0.7).applyQuaternion(camera.quaternion);
                flowers.group.position.copy(camera.position).add(fwd);
                flowers.update(dt, 1 + c.hold * 3);
            }
        },
        dispose() {
            bg.dispose(); ethMat.dispose(); ownMatcap.dispose(); hand.mat.dispose(); mask?.dispose(); flowers?.dispose();
            rigs.forEach((r) => r.mixer.stopAllAction());
            hands.remove(eth.scene, human.scene); scene.remove(hands, cam.scene);                       // the models stay cached for a return visit
        },
    };
};

export default factory;
