import { Group, Mesh, MeshMatcapMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { clamp01, ease, pearlMatcap, span } from '../../procedural/common';
import { cameraPath, dress, scrubbable, skin, tile } from './common';
import type { StageCtx, StageFactory } from '../../types';
import { petals } from './petals';

/**
 * Stage 1 ("Every learner is different") on the placeholder assets: the sculpted hand and the human hand (fancy_hand_2.glb, human_hand_1.glb),
 * the camera path of camera_1.glb, the hand textures and mask from human_hands.ktx2, petals, and the garden of
 * garden-godrays.ktx2 behind them. Scroll scrubs every animation; holding the ring plays the last part, where the hands
 * meet. The words on top are Kiddoo's (Overlays.tsx).
 */

// the background: the opening gradient, then white, then the garden layers (atlas rects in pixels of 4096 x 2661)
const GW = 4096, GH = 2661, GSCALE = 1 / 1751;
const LAYERS = [
    { rect: [2382, 19, 1714, 1714], pos: [0.5, 0.555], scale: 2.01, depth: 1 },       // sky over the lake (the base)
    { rect: [0, 1354, 1751, 547], pos: [0.5, 0.28], scale: 1.75, depth: 0.4 },        // far meadow
    { rect: [1760, 0, 269, 538], pos: [0.305, 0.54], scale: 1.1, depth: 0.34 },        // left pillar
    { rect: [2048, 0, 325, 629], pos: [0.685, 0.54], scale: 1.03, depth: 0.28 },       // right pillar
    { rect: [0, 819, 1751, 531], pos: [0.5, 0.23], scale: 1.82, depth: 0.2 },          // pond
    { rect: [0, 2, 1751, 815], pos: [0.5, 0], scale: 1.94, depth: 0 },                 // flowers in front
];
const RAYS = [[0, 1918, 1320, 743], [1320, 1918, 1320, 743], [2642, 1918, 1320, 743]];
const uvRect = ([x, y, w, h]: number[]) => new Vector4(x / GW, 1 - (y + h) / GH, w / GW, h / GH);

const BG_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FS = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uHasAtlas, uWhite, uGarden, uRays, uTime, uAspect;
uniform vec2 uParallax;
uniform vec4 uRect[6];
uniform vec2 uHalf[6];
uniform vec2 uCenter[6];
uniform float uDepth[6];
uniform vec4 uRay[3];
varying vec2 vUv;
vec4 layer(int i) {
    vec2 hs = vec2(uHalf[i].x / uAspect, uHalf[i].y);
    vec2 p = (vUv - uCenter[i] - uParallax * 0.07 * uDepth[i]) / (2.0 * hs) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0);
    return texture2D(uAtlas, uRect[i].xy + p * uRect[i].zw);
}
vec3 radial(vec2 c, vec2 r, vec3 base, vec3 glow) {
    vec2 d = (vec2(vUv.x, 1.0 - vUv.y) - c) / r;
    return mix(base, glow, 1.0 - smoothstep(0.0, 1.0, length(d)));
}
void main() {
    // the opening gradient: teal-blue with mint glows at the top and bottom centre
    vec3 base = vec3(110.0, 200.0, 230.0) / 255.0, glow = vec3(170.0, 235.0, 215.0) / 255.0;
    vec3 g = radial(vec2(0.5, 0.0), vec2(0.85, 0.7), base, glow);
    g = mix(g, radial(vec2(0.5, 1.0), vec2(0.85, 0.7), base, glow), 0.5);
    vec3 col = mix(pow(g, vec3(2.2)), vec3(1.0), uWhite);
    if (uHasAtlas > 0.5 && uGarden > 0.0) {
        vec2 hs0 = vec2(uHalf[0].x / uAspect, uHalf[0].y);
        vec2 p0 = clamp((vUv - uCenter[0] - uParallax * 0.07 * uDepth[0]) / (2.0 * hs0) + 0.5, 0.0, 1.0);
        vec3 acc = texture2D(uAtlas, uRect[0].xy + p0 * uRect[0].zw).rgb;
        for (int i = 1; i < 6; i++) { vec4 l = layer(i); acc = mix(acc, l.rgb, l.a); }
        float lum = dot(acc, vec3(0.299, 0.587, 0.114));
        float bloom = smoothstep(0.42, 1.0, lum);
        acc = mix(acc * 1.05, vec3(1.0), 0.08) + bloom * bloom * 0.15;
        col = mix(col, acc, uGarden);
    }
    if (uHasAtlas > 0.5 && uRays > 0.0) {                      // light rays from the top, three frames crossfading slowly
        float f = fract(uTime * 0.05) * 3.0;
        int i0 = int(floor(f));
        vec2 q = vec2(vUv.x, vUv.y);
        vec3 r0 = texture2D(uAtlas, uRay[i0 == 0 ? 0 : i0 == 1 ? 1 : 2].xy + q * uRay[0].zw).rgb;
        vec3 r1 = texture2D(uAtlas, uRay[i0 == 0 ? 1 : i0 == 1 ? 2 : 0].xy + q * uRay[0].zw).rgb;
        vec3 rays = mix(r0, r1, smoothstep(0.0, 1.0, fract(f)));
        col = 1.0 - (1.0 - col) * (1.0 - rays * uRays);           // screen blend
    }
    // the foreground: a soft green-grey pull into the bottom corners
    float corner = pow(1.0 - vUv.y, 1.6) * (0.35 + 0.65 * abs(vUv.x - 0.5) * 2.0);
    col = mix(col, pow(vec3(150.0, 191.0, 174.0) / 255.0, vec3(2.2)), corner * 0.45 * (1.0 - uGarden * 0.6));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}`;

function background(atlas: Texture | null) {
    const mat = new ShaderMaterial({
        vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false,
        uniforms: {
            uAtlas: { value: atlas }, uHasAtlas: { value: atlas ? 1 : 0 }, uWhite: { value: 0 }, uGarden: { value: 0 }, uRays: { value: 0 },
            uTime: { value: 0 }, uAspect: { value: 1 }, uParallax: { value: new Vector2() },
            uRect: { value: LAYERS.map((l) => uvRect(l.rect)) },
            uHalf: { value: LAYERS.map((l) => new Vector2((l.rect[2] * GSCALE * l.scale) / 2, (l.rect[3] * GSCALE * l.scale) / 2)) },
            uCenter: { value: LAYERS.map((l) => new Vector2(l.pos[0], l.pos[1])) },
            uDepth: { value: LAYERS.map((l) => l.depth) },
            uRay: { value: RAYS.map(uvRect) },
        },
    });
    const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return { mesh, u: mat.uniforms, dispose: () => { mesh.geometry.dispose(); mat.dispose(); } };
}

const factory: StageFactory = async (ctx: StageCtx) => {
    const A = ctx.assets;
    const [eth, human, cam, handsAtlas, spc, garden] = await Promise.all([
        A.model('handEth'), A.model('handHuman'), A.model('camera1'),
        A.texture('humanHandsAtlas'), A.texture('spcAtlas'), A.texture('gardenAtlas'),
    ]);
    if (!eth || !human || !cam) return (await import('../believed')).default(ctx);   // assets missing: the procedural stage

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    const bg = background(garden);
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
    let entered = false, parX = 0, parY = 0;
    const scrub = (s: number) => { rigs.forEach((r) => r.set(duration * s)); hand.at(s); };

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            bg.u.uAspect.value = w / h;
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

            bg.u.uTime.value += dt;
            bg.u.uWhite.value = p < 0.5 ? span(p, 0.1, 0.5) : 1;
            bg.u.uGarden.value = span(p, 0.5, 0.7);
            bg.u.uRays.value = span(p, 0.3, 1) * 0.55 + c.hold * 0.35;
            parX += (-c.pointer.x - parX) * (1 - Math.exp(-dt * 6));
            parY += (c.pointer.y - parY) * (1 - Math.exp(-dt * 6));
            bg.u.uParallax.value.set(parX, parY);

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
