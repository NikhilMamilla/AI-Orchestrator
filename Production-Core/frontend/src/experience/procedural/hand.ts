import { Group, LatheGeometry, Mesh, SphereGeometry, Vector2, type BufferGeometry, type Material } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * An original procedural hand, sculpted from smooth turned shapes: a rounded palm, four fingers of three tapering bones,
 * a two-bone thumb, and a forearm that narrows at the wrist. One shared material (a matcap) makes it read as porcelain.
 *
 * Frame: the hand points along +Y, the palm faces +Z, the thumb is on -X. Three nested groups pose it:
 *   root.rotation.z = dir   (where it points on screen)
 *   tilt.rotation.x         (towards / away from the camera)
 *   roll.rotation.y         (turn about its own length: palm to camera, palm down, …)
 */
export type Curl = [number, number, number, number, number];     // thumb, index, middle, ring, pinky (0 open .. 1 closed)

/** A tapering bone from r0 at its joint to r1 at its end, rounded at both ends, growing along +Y. */
function bone(len: number, r0: number, r1: number, tip: boolean) {
    const pts: Vector2[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {                                   // lower cap (quarter circle)
        const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
        pts.push(new Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
    }
    pts.push(new Vector2(r1, len));
    const capR = tip ? r1 : r1 * 0.98;
    for (let i = 1; i <= n; i++) {                                   // upper cap
        const a = (i / n) * (Math.PI / 2);
        pts.push(new Vector2(Math.cos(a) * capR, len + Math.sin(a) * capR * (tip ? 1.15 : 1)));
    }
    pts[pts.length - 1].x = 0;
    return new LatheGeometry(pts, 20);
}

/** The forearm: narrow at the wrist, fuller towards the elbow, slightly flattened. */
function forearm() {
    const prof: [number, number][] = [[0, 0.02], [0.24, 0.0], [0.27, -0.25], [0.3, -0.7], [0.36, -1.6], [0.4, -2.8], [0.39, -4.4], [0.36, -6.2], [0, -6.25]];
    return new LatheGeometry(prof.map(([r, y]) => new Vector2(r, y)), 28);
}

export function buildHand(mat: Material, mirror = false) {
    const root = new Group(), tilt = new Group(), roll = new Group(), hand = new Group();
    root.add(tilt); tilt.add(roll); roll.add(hand);
    const geos: BufferGeometry[] = [];
    const mesh = (g: BufferGeometry) => { geos.push(g); return new Mesh(g, mat); };

    const palm = mesh(new RoundedBoxGeometry(1.1, 1.14, 0.42, 6, 0.2));
    palm.position.set(0, 0.06, 0);
    hand.add(palm);
    const mound = mesh(new SphereGeometry(1, 28, 20));              // the muscle at the base of the thumb
    mound.scale.set(0.3, 0.44, 0.2);
    mound.rotation.z = 0.35;
    mound.position.set(-0.3, -0.18, 0.07);
    hand.add(mound);
    const arm = mesh(forearm());
    arm.scale.z = 0.78;
    arm.position.y = -0.42;
    hand.add(arm);

    const finger = (x: number, baseY: number, lens: number[], r: number, splay: number) => {
        const base = new Group();
        base.position.set(x, baseY, 0.0);
        base.rotation.z = splay;
        hand.add(base);
        const knuckle = mesh(new SphereGeometry(r * 1.08, 16, 12));  // blends the finger into the palm
        knuckle.scale.z = 0.9;
        base.add(knuckle);
        const joints: Group[] = [];
        let parent: Group = base;
        lens.forEach((len, i) => {
            const r0 = r * (1 - i * 0.12), r1 = r * (1 - (i + 1) * 0.12);
            const j = new Group();
            parent.add(j);
            joints.push(j);
            const b = mesh(bone(len, r0, r1, i === lens.length - 1));
            b.scale.z = 0.88;                                         // fingers are a little flatter than round
            j.add(b);
            const end = new Group();
            end.position.y = len;
            j.add(end);
            parent = end;
        });
        return joints;
    };
    const fingers = [
        finger(-0.37, 0.56, [0.46, 0.3, 0.24], 0.135, 0.07),        // index
        finger(-0.12, 0.6, [0.5, 0.33, 0.25], 0.14, 0.0),           // middle
        finger(0.13, 0.57, [0.47, 0.31, 0.24], 0.132, -0.06),       // ring
        finger(0.37, 0.48, [0.37, 0.25, 0.2], 0.115, -0.14),        // pinky
    ];
    const thumbBase = new Group();
    thumbBase.position.set(-0.42, -0.12, 0.1);
    thumbBase.rotation.set(0.4, 0.3, 0.72);                          // out to the side and a little forward of the palm
    hand.add(thumbBase);
    let tp: Group = thumbBase;
    const thumb: Group[] = [];
    [0.5, 0.36].forEach((len, i) => {
        const r0 = 0.165 * (1 - i * 0.12), r1 = 0.165 * (1 - (i + 1) * 0.12);
        const j = new Group();
        tp.add(j);
        thumb.push(j);
        const b = mesh(bone(len, r0, r1, i === 1));
        b.scale.z = 0.88;
        j.add(b);
        const end = new Group();
        end.position.y = len;
        j.add(end);
        tp = end;
    });
    if (mirror) hand.scale.x = -1;

    const MAX = [1.05, 1.3, 0.95];                                   // how far each joint can bend
    const setCurl = (c: Curl) => {
        thumb.forEach((j, i) => { j.rotation.x = c[0] * (i === 0 ? 0.55 : 0.9); });
        fingers.forEach((js, f) => js.forEach((j, i) => { j.rotation.x = c[f + 1] * MAX[i]; }));
    };
    setCurl([0.2, 0.1, 0.1, 0.15, 0.2]);
    return { root, tilt, roll, setCurl, dispose: () => geos.forEach((g) => g.dispose()) };
}
