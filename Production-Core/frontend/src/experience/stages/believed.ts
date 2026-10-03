import {
    CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, MeshMatcapMaterial, Object3D,
    PerspectiveCamera, Scene, TetrahedronGeometry, Vector3,
} from 'three';
import { backdrop, ease, keyframes, pearlMatcap, rng, span } from '../procedural/common';
import { buildHand, type Curl } from '../procedural/hand';
import type { StageFactory } from '../types';

/**
 * Stage 1, "Every Learner is different … yet courses teach Everyone the same way."
 * The title card, then a hand rises from below and turns to reach across the screen; petals, gold coins and glass
 * shards start to drift; a second hand reaches back from the right. At the end a hold ring appears: holding it brings
 * the two hands together, the light swells, and the story cuts to white.
 */

type Pose = { x: number; y: number; z: number; dir: number; tilt: number; roll: number };
// dir: where the hand points on screen (0 up, -pi/2 right); roll: about its length (0 palm to camera, ~pi/2 palm down)
const A_FRAMES: [number, Pose][] = [
    [0.0, { x: 0.3, y: -13, z: 0, dir: 0, tilt: -0.15, roll: 0.2 }],
    [0.2, { x: 0.3, y: -11, z: 0, dir: 0, tilt: -0.15, roll: 0.2 }],
    [0.34, { x: 0.3, y: -1.7, z: 0, dir: -0.05, tilt: -0.25, roll: 0.25 }],
    [0.5, { x: -2.9, y: -0.3, z: 0, dir: -1.45, tilt: 0.2, roll: 1.15 }],
    [0.7, { x: -2.4, y: -0.2, z: 0.1, dir: -1.5, tilt: 0.25, roll: 1.2 }],
    [1.0, { x: -2.05, y: -0.15, z: 0.1, dir: -1.52, tilt: 0.25, roll: 1.2 }],
];
const B_FRAMES: [number, Pose][] = [
    [0.0, { x: 13, y: 0.5, z: 0, dir: 1.5, tilt: 0.25, roll: -1.2 }],
    [0.58, { x: 13, y: 0.5, z: 0, dir: 1.5, tilt: 0.25, roll: -1.2 }],
    [0.8, { x: 3.45, y: 0.35, z: 0.1, dir: 1.55, tilt: 0.25, roll: -1.2 }],
    [1.0, { x: 3.1, y: 0.3, z: 0.1, dir: 1.56, tilt: 0.25, roll: -1.2 }],
];
const RISE: Curl = [0.25, 0.12, 0.1, 0.16, 0.24];
const REACH_A: Curl = [0.3, 0.08, 0.35, 0.55, 0.65];
const REACH_B: Curl = [0.25, 0.1, 0.3, 0.42, 0.5];
const mixCurl = (a: Curl, b: Curl, t: number) => a.map((v, i) => v + (b[i] - v) * t) as Curl;

const factory: StageFactory = async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    // the same light teal as the asset version of this stage (the stage-one gradient), so the dark ink reads the same
    const bg = backdrop({ top: '#9fdcec', bottom: '#e6f6f1', glow: '#ffffff', glowPos: [0.5, 0.5], glowSize: 0.42, intensity: 0.28, rays: 0.5 });
    scene.add(bg.mesh);

    const matcap = pearlMatcap();
    const skin = new MeshMatcapMaterial({ matcap });
    const procA = buildHand(skin), procB = buildHand(skin, true);
    const handA = procA, handB = procB;
    void handA; void handB;                                                // stage 1 is words only: the hands are not shown

    // drifting petals (pearl), coins (gold) and glass shards (indigo)
    const R = rng(7);
    const kinds = [
        { geo: new CircleGeometry(0.17, 14), mat: new MeshMatcapMaterial({ matcap, color: new Color('#fff1ea'), side: DoubleSide }), n: 34, sx: 1, sy: 0.62, sz: 1 },
        { geo: new CylinderGeometry(0.15, 0.15, 0.035, 26), mat: new MeshMatcapMaterial({ matcap, color: new Color('#f0c95e') }), n: 16, sx: 1, sy: 1, sz: 1 },
        { geo: new TetrahedronGeometry(0.16), mat: new MeshMatcapMaterial({ matcap, color: new Color('#a9b0ff'), transparent: true, opacity: 0.75 }), n: 18, sx: 1.4, sy: 0.5, sz: 1 },
    ];
    const bits = kinds.map((k) => {
        const mesh = new InstancedMesh(k.geo, k.mat, k.n);
        const items = Array.from({ length: k.n }, () => ({
            p: new Vector3((R() * 2 - 1) * 10, (R() * 2 - 1) * 7, -7 + R() * 9),
            spin: new Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).multiplyScalar(0.9),
            fall: 0.18 + R() * 0.35, phase: R() * 10, size: 0.7 + R() * 0.7,
        }));
        scene.add(mesh);
        return { mesh, items, k };
    });
    const dummy = new Object3D();
    let soundA = false, soundB = false;

    const place = (h: { root: Group; tilt: Group; roll: Group }, f: Pose) => {
        h.root.position.set(f.x, f.y, f.z);
        h.root.rotation.z = f.dir;
        h.tilt.rotation.x = f.tilt;
        h.roll.rotation.y = f.roll;
    };

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.position.z = w / h < 0.9 ? 21 : w / h < 1.3 ? 15 : 12;     // portrait screens: further back so both hands fit
            camera.updateProjectionMatrix();
            bg.u.uAspect.value = w / h;
        },
        update(p, _dt, c) {
            const t = c.time, hold = ease(c.hold);
            bg.u.uTime.value = t;
            camera.position.x = c.pointer.x * 0.45;
            camera.position.y = -c.pointer.y * 0.3;
            camera.lookAt(0, 0, 0);

            const a = keyframes(A_FRAMES, p), b = keyframes(B_FRAMES, p);
            a.x += hold * 0.85 + Math.sin(t * 0.8) * 0.05; a.y += Math.sin(t * 1.1) * 0.06;
            b.x -= hold * 0.85 + Math.sin(t * 0.7 + 1) * 0.05; b.y += Math.sin(t * 0.9 + 2) * 0.06;
            place(handA, a);
            place(handB, b);
            const reachT = span(p, 0.36, 0.5);
            const breathe = Math.sin(t * 1.3) * 0.03;
            procA.setCurl(mixCurl(RISE, REACH_A, reachT).map((v, i) => v + breathe * (i + 1) * 0.3) as Curl);
            procB.setCurl(REACH_B.map((v, i) => v + Math.sin(t * 1.2 + i) * 0.025) as Curl);
            // the light follows the rising hand, then settles between the two hands
            const rise = span(p, 0.2, 0.36) * (1 - span(p, 0.4, 0.55));
            bg.u.uGlowPos.value.set(0.5, 0.5 - rise * 0.12);
            if (!soundA && p > 0.27) { soundA = true; c.sound.fx('hand'); }
            if (!soundB && p > 0.62) { soundB = true; c.sound.fx('hand'); }

            // the light gathers between the two index fingers while the ring is held
            bg.u.uIntensity.value = 0.32 + span(p, 0.6, 0.95) * 0.25 + hold * 0.9;
            bg.u.uGlowSize.value = 0.42 + hold * 0.2;
            bg.u.uFlash.value = Math.pow(hold, 4) * 0.55;

            const show = span(p, 0.3, 0.42), swirl = 1 + hold * 3.5;
            for (const { mesh, items, k } of bits) {
                items.forEach((it, i) => {
                    const fallY = ((it.p.y - (t * it.fall * swirl + p * 7) + 7) % 14 + 14) % 14 - 7;
                    dummy.position.set(it.p.x + Math.sin(t * 0.4 + it.phase) * 0.6, fallY, it.p.z);
                    dummy.rotation.set(it.spin.x * t * swirl + it.phase, it.spin.y * t * swirl, it.spin.z * t * swirl);
                    const s = it.size * show;
                    dummy.scale.set(s * k.sx, s * k.sy, s * k.sz);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                });
                mesh.instanceMatrix.needsUpdate = true;
                mesh.visible = show > 0.001;
            }
        },
        dispose() {
            bg.dispose(); procA.dispose(); procB.dispose(); skin.dispose(); matcap.dispose();
            bits.forEach(({ mesh, k }) => { k.geo.dispose(); k.mat.dispose(); mesh.dispose(); });
        },
    };
};

export default factory;
