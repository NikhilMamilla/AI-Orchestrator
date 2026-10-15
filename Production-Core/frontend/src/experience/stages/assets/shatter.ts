import {
    Box3,
    DoubleSide, Euler, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
    Quaternion, RepeatWrapping, Scene, ShaderMaterial, Vector3, type Object3D, type Texture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EVIDENCE_SHARDS } from '../../copy';
import { canvasTexture, fontsReady, SERIF, span } from '../../procedural/common';
import type { StageCtx, StageFactory } from '../../types';
import { cameraPath, scrubbable } from './common';

/**
 * Stage 2 on the placeholder assets: the teal curtain drifts on camera_2's path (only the camera is used: no hand and no glass
 * pane are loaded, they were never drawn).
 * Then the pieces of glass_shards.glb rise past the camera, four of them carrying what Kiddoo does instead (README).
 */

const HAND_RISE = 4.733;                                  // seconds of the hand's animation played while the glass breaks
const GATE = 0.22;                                        // progress spent breaking the glass
// the seven front shards: start x/z offset, rotation start (xyz) and end (xyz); they rise 2.64 units past the camera
const SHARD_OFF = [[0.02, 0.4], [-0.06, -0.08], [0.08, -0.15], [-0.04, -0.05], [0.05, 0.2], [-0.08, -0.4], [0.05, -0.18]];
const SHARD_ROT = [[0.1, -0.05, 0.15, 0.25, 0.2, -0.4], [0.05, 0.12, -0.3, -0.15, -0.25, 0.5], [-0.08, -0.1, 0.45, 0.2, 0.15, -0.6],
    [0.12, 0.08, -0.2, -0.1, 0.3, 0.35], [-0.05, -0.15, 0.55, 0.18, -0.2, -0.45], [0.15, 0.05, -0.1, -0.2, 0.1, 0.65], [-0.1, 0.12, 0.35, 0.15, -0.15, -0.55]];
const TEXT_MAX = 6;                                       // at most this many shards carry an evidence line
const TEXT_FROM = 0.27, TEXT_TO = 0.85;                   // the worded shards are on screen from about 0.36 to 0.76                    // the window in which they fly (no gold line on screen)
const BG_SHARDS = [[-0.72, -0.28, -1.8], [0.64, -0.2, -2], [-0.95, -0.28, -2.2], [0.86, -0.42, -1.9], [-0.4, -0.04, -2.45], [0.36, -0.62, -2.3], [-0.6, -0.56, -1.7], [0.72, -0.06, -2.55], [0.06, -0.12, -2.65]];
const BG_ROT = [[0.3, 0.4, 0.2], [-0.25, 0.5, -0.35], [0.45, -0.3, 0.6], [-0.2, 0.35, 0.35], [0.55, -0.2, -0.45], [-0.4, 0.1, 0.65], [0.35, -0.5, -0.55], [-0.3, 0.45, 0.25], [0.2, -0.35, -0.4]];
const BG_SCALE = [1.65, 1.4, 1.9, 1.5, 1.25, 1.75, 1.35, 1.2, 1.1];

// the backdrop: a clean teal curtain, soft vertical light that drifts slowly (no footage: nothing noisy, nothing to download)
const CURTAIN = /* glsl */ `
vec3 palette(float v) {
    vec3 lo = vec3(0.004, 0.022, 0.032), mid = vec3(0.012, 0.13, 0.165), hi = vec3(0.16, 0.5, 0.53);
    return v < 0.5 ? mix(lo, mid, v * 2.0) : mix(mid, hi, (v - 0.5) * 2.0);
}
vec3 curtain(vec2 uv, float t) {
    float beams = 0.0;
    for (int i = 0; i < 3; i++) {
        float f = float(i);
        float cx = 0.2 + 0.3 * f + 0.05 * sin(t * 0.12 + f * 2.1);
        float w = 0.085 + 0.02 * f;
        float d = (uv.x - cx) / w;
        beams += exp(-d * d) * (0.55 + 0.45 * sin(t * 0.18 + f * 1.7));
    }
    float v = 0.26 + 0.16 * (1.0 - uv.y) + 0.34 * beams * (0.55 + 0.45 * uv.y);
    return palette(clamp(v, 0.0, 1.0));
}`;
const BG_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FS = CURTAIN + /* glsl */ `
uniform sampler2D uStill;
uniform float uHasStill, uToStill, uAspect, uStillAspect, uRed, uTime;
varying vec2 vUv;
void main() {
    vec3 col = curtain(vUv, uTime);
    if (uHasStill > 0.5) col = mix(col, texture2D(uStill, vec2(vUv.x * uAspect, vUv.y) * 3.0).rgb, uToStill);
    float corner = pow(1.0 - vUv.y, 1.8) * (0.35 + 0.65 * abs(vUv.x - 0.5) * 2.0);   // dark pull into the bottom corners
    col *= 1.0 - corner * 0.7;
    col *= 1.0 + uRed * 0.5;                                                         // a bright pulse at the moment of impact
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}`;

/**
 * Clear cut glass without transmission (which would re-render the scene every frame): each shard samples the curtain
 * behind it at its own screen position, bent by the surface normal, with the three channels bent by slightly different
 * amounts (the rainbow fringe along the edges). Edges and bevels get a bright Fresnel rim and a moving specular glint,
 * and the body stays mostly see-through, so the hand behind reads through the glass like in a real pane.
 */
const GLASS_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec4 vClip;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
}`;
const GLASS_FS = CURTAIN + /* glsl */ `
uniform float uAspect, uRed, uTime;
varying vec3 vN; varying vec3 vV; varying vec4 vClip;
vec3 behind(vec2 uv) {
    vec3 c = curtain(clamp(uv, 0.001, 0.999), uTime);
    return c * (1.0 + uRed * 0.5);
}
void main() {
    vec3 N = normalize(vN), V = normalize(vV);
    if (!gl_FrontFacing) N = -N;
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 2.2);                            // 0 on the flat faces, rising on the bevelled edges
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec2 bend = N.xy * (0.045 + rim * 0.09);                    // refraction: the curtain visibly shifts behind the glass
    vec3 col = vec3(behind(suv + bend).r, behind(suv + bend * 1.25).g, behind(suv + bend * 1.5).b);
    col *= 0.84;                                                // clear glass darkens what is behind it slightly
    // thickness: a darker band just inside the edge, then the bright cut rim
    col = mix(col, col * 0.45, smoothstep(0.08, 0.32, rim) * (1.0 - smoothstep(0.45, 0.75, rim)));
    col += vec3(1.0, 0.97, 0.95) * smoothstep(0.42, 0.9, rim) * 1.2;
    // a soft sheen across the face and a rainbow film where it catches the light; both move as the shard turns
    vec3 R = reflect(-V, N);
    vec3 L1 = normalize(vec3(sin(uTime * 0.35) * 0.6, 0.75, 0.5));
    float sheen = pow(max(dot(R, L1), 0.0), 7.0);
    float glint = pow(max(dot(R, L1), 0.0), 90.0);
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (dot(R, vec3(0.7, 0.4, 0.2)) * 1.4 + suv.x * 0.6 + vec3(0.0, 0.33, 0.67)));
    col += vec3(1.0) * sheen * 0.18 + film * sheen * 0.55 + film * rim * 0.25 + vec3(1.0) * glint * 1.1;
    float a = clamp(0.3 + rim * 0.65 + sheen * 0.25 + glint * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
}`;

/** The words on a shard, on a 2:1 canvas: the key word large, the rest in italics on up to two centred lines. */
const TEXT_ASPECT = 2;
function evidenceTexture(big: string, rest: string) {
    return canvasTexture(1000, 500, (g) => {
        g.textAlign = 'center';
        g.fillStyle = '#ffffff';
        g.shadowColor = 'rgba(255,255,255,0.35)'; g.shadowBlur = 5;
        let size = 210;                                                                  // a little smaller, so the gap fits
        g.font = `600 ${size}px ${SERIF}`;
        while (g.measureText(big).width > 960 && size > 100) { size -= 4; g.font = `600 ${size}px ${SERIF}`; }
        // the rest, wrapped at 900px into one or two lines
        g.font = `italic 500 92px ${SERIF}`;
        // one line if it fits, otherwise two lines of balanced width
        const words = rest.split(' ');
        let lines = [rest];
        if (g.measureText(rest).width > 960) {
            let best = Infinity;
            for (let i = 1; i < words.length; i++) {
                const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
                const m = Math.max(g.measureText(a).width, g.measureText(b).width);
                if (m < best) { best = m; lines = [a, b]; }
            }
        }
        const two = lines.length > 1;
        g.font = `600 ${size}px ${SERIF}`;
        g.fillText(big, 500, two ? 196 : 250);                                        // a clear gap above the italic lines
        g.shadowBlur = 3;
        g.font = `italic 500 92px ${SERIF}`;
        lines.slice(0, 2).forEach((l, i) => g.fillText(l, 500, (two ? 368 : 410) + i * 100));
    });
}

/** The convex outline of points in the plane (monotone chain), counter-clockwise. */
function hull(pts: [number, number][]) {
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [], upper: [number, number][] = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** The largest rectangle of the given aspect inside a convex outline: a grid of centres, a binary search on each. */
function fitRect(h: [number, number][], aspect: number) {
    const inside = (x: number, y: number) => h.every((a, i) => { const b = h[(i + 1) % h.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0; });
    const fits = (cx: number, cy: number, w: number) => { const hw = w / 2, hh = w / aspect / 2; return inside(cx - hw, cy - hh) && inside(cx + hw, cy - hh) && inside(cx + hw, cy + hh) && inside(cx - hw, cy + hh); };
    const xs = h.map((q) => q[0]), ys = h.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let best = { x: 0, y: 0, w: 0 };
    const N = 24;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
        const cx = x0 + ((x1 - x0) * i) / N, cy = y0 + ((y1 - y0) * j) / N;
        if (!inside(cx, cy)) continue;
        let lo = 0, hi = x1 - x0;
        for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (fits(cx, cy, m)) lo = m; else hi = m; }
        if (lo > best.w) best = { x: cx, y: cy, w: lo };
    }
    return best;
}

const factory: StageFactory = async (ctx: StageCtx) => {
    const A = ctx.assets;
    const [shards, cam2, still] = await Promise.all([A.model('glassShards'), A.model('camera2'), A.texture('stage2Bg'), fontsReady()]);
    if (!shards || !cam2) return (await import('../shatter')).default(ctx);

    const scene = new Scene();
    const camera = new PerspectiveCamera(23, 1, 0.01, 100);
    scene.add(camera);                                                       // things attached to the camera must be in the scene
    const pmrem = new PMREMGenerator(ctx.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;

    // background: the clean curtain, then the still at the end
    const bgMat = new ShaderMaterial({
        vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false,
        uniforms: {
            uStill: { value: still }, uHasStill: { value: still ? 1 : 0 }, uToStill: { value: 0 },
            uAspect: { value: 1 }, uStillAspect: { value: 16 / 9 }, uRed: { value: 0 }, uTime: { value: 0 },
        },
    });
    if (still) { still.wrapS = still.wrapT = RepeatWrapping; still.needsUpdate = true; }
    const bg = new Mesh(new PlaneGeometry(2, 2), bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -1000;
    scene.add(bg);

    // the camera path (the hand and the glass pane it once carried were never drawn, so they are no longer loaded)
    const rigs = [scrubbable(cam2)];
    const duration = Math.max(...rigs.map((r) => r.duration));                // camera_2's own 16.33 s, as it always was the longest clip
    const path = cameraPath(cam2);
    scene.add(cam2.scene);                                                 // the camera path only
    const handT = (p: number) => {
        const g = span(p, 0, GATE), r = HAND_RISE / duration;
        const eased = g < 0.3 ? g : 0.3 + 0.7 * (1 - (1 - (g - 0.3) / 0.7) ** 2);
        return p < GATE ? r * eased : r + span(p, GATE, 1) * (1 - r) * 0.9;
    };
    rigs.forEach((r) => r.set(0));
    path.follow(camera, 1, { x: 0, y: 0 });

    // the rising shards, attached to the camera like a pane of glass you scroll through
    const glass = new ShaderMaterial({
        vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false, side: DoubleSide,
        uniforms: {
            uAspect: { value: 1 }, uRed: { value: 0 }, uTime: { value: 0 },
        },
    });
    const nodes = new Map<string, Object3D>();
    shards.scene.traverse((o) => { if (o.name) nodes.set(o.name, o); });
    const shardGroup = new Group();
    camera.add(shardGroup);
    const texts: Texture[] = [];
    type Piece = { obj: Group; p0: Vector3; p1: Vector3; q0: Quaternion; q1: Quaternion; wob: number[]; bg: boolean; box: Box3; outline: [number, number][]; worded?: boolean; base: number; dx: number; fit?: { x: number; y: number; w: number } };
    const pieces: Piece[] = [];
    const piece = (name: string, p0: number[], p1: number[], r0: number[], r1: number[], scale: number, bgPiece: boolean) => {
        const src = nodes.get(name);
        if (!src) return null;
        const mesh = src.clone();
        mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.multiplyScalar(1);
        mesh.traverse((o) => { if ((o as Mesh).isMesh) { (o as Mesh).material = glass; o.frustumCulled = false; } });
        const box = new Box3().setFromObject(mesh);                        // measured before it has a parent: its own space
        const outline: [number, number][] = [];                             // its silhouette as seen from the front
        if (!bgPiece) {
            const v = new Vector3();
            mesh.updateMatrixWorld(true);
            mesh.traverse((o) => {
                const pos = (o as Mesh).isMesh ? (o as Mesh).geometry.attributes.position : null;
                if (pos) for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); outline.push([v.x, v.y]); }
            });
        }
        const obj = new Group();
        obj.add(mesh);
        obj.scale.setScalar(scale);
        shardGroup.add(obj);
        const R = () => (4 + Math.random() * 8) * (Math.PI / 180);
        const pc = { obj, p0: new Vector3(...p0), p1: new Vector3(...p1), q0: new Quaternion().setFromEuler(new Euler(...r0)), q1: new Quaternion().setFromEuler(new Euler(...r1)),
            wob: [R(), R(), R(), 0.15 + Math.random() * 0.3, 0.15 + Math.random() * 0.3, 0.15 + Math.random() * 0.3, Math.random() * 6, Math.random() * 6, Math.random() * 6], bg: bgPiece, box, outline: outline.length > 2 ? hull(outline) : [], base: scale, dx: 0 };
        pieces.push(pc);
        return pc;
    };
    // the seven front shards; only the ones with room for words carry an evidence line, in the order they fly past
    const front: { pc: Piece; fit: { x: number; y: number; w: number } }[] = [];
    for (let e = 0; e < 7; e++) {
        const y = -0.66 - e * 0.22, [x, dz] = SHARD_OFF[e], r = SHARD_ROT[e];
        const pc = piece(`Shard_0${e + 1}`, [x, y, -0.8 + dz], [x, y + 2.64, -0.8 + dz], r.slice(0, 3), r.slice(3), 1.05, false);
        if (pc && pc.outline.length > 2) front.push({ pc, fit: fitRect(pc.outline, TEXT_ASPECT) });
    }
    // how big the words would look: the fitted width over the shard's distance from the camera
    const seen = (f: (typeof front)[number]) => f.fit.w / Math.abs(f.pc.p0.z);
    const roomy = Math.max(...front.map(seen), 0) * 0.45;
    front.filter((f) => seen(f) >= roomy).slice(0, TEXT_MAX).forEach(({ pc, fit }, k) => {
        const tex = evidenceTexture(EVIDENCE_SHARDS[k].big, EVIDENCE_SHARDS[k].rest);
        texts.push(tex);
        const w = fit.w * 0.95, plane = new Mesh(new PlaneGeometry(w, w / TEXT_ASPECT), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false }));
        plane.position.set(fit.x, fit.y, pc.box.max.z + 0.004);                  // inside the outline, just in front of its face
        pc.obj.add(plane);
        pc.worded = true;
        pc.fit = fit;
    });
    BG_SHARDS.forEach(([x, y, z], e) => {
        const o = BG_ROT[e], sgn = e % 2 ? 1 : -1, l = 0.25;
        piece(`BG_Shard_${String(e + 1).padStart(2, '0')}`, [x, y - 0.792, z], [x, y + 0.792, z], o, [o[0] + l * sgn, o[1] - l * 0.6, o[2] + l * sgn], BG_SCALE[e], true);
    });
    const qa = new Quaternion(), qw = new Quaternion(), ew = new Euler();

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            bgMat.uniforms.uAspect.value = w / h;
            glass.uniforms.uAspect.value = w / h;
            // portrait screens: each worded shard shrinks until its words fit the width, and moves so they sit centred
            const aspect = w / h, half = Math.tan((camera.fov * Math.PI) / 360) * aspect;
            for (const pc of pieces) {
                let k = 1, dx = 0;
                if (aspect < 1 && pc.fit) {
                    const textW = pc.fit.w * 0.95 * pc.base, visW = 2 * half * Math.abs(pc.p0.z);
                    k = Math.min(1, (0.8 * visW) / textW);
                    dx = -pc.p0.x - pc.fit.x * pc.base * k;
                }
                pc.obj.scale.setScalar(pc.base * k);
                pc.dx = dx;
            }
        },
        update(p, dt, c) {
            const gate = span(p, 0.02, GATE), t = span(p, GATE, 1);
            rigs.forEach((r) => r.set(duration * handT(p)));
            path.follow(camera, dt, c.pointer);

            // a light pulse at the moment of impact (the pane itself is gone: straight into the teal, no breaking frame)
            bgMat.uniforms.uRed.value = Math.max(0, 1 - gate * 15) * 0.85 * (p > 0 ? 1 : 0);
            glass.uniforms.uRed.value = bgMat.uniforms.uRed.value;
            glass.uniforms.uTime.value = c.time;
            bgMat.uniforms.uTime.value = c.time;

            bgMat.uniforms.uToStill.value = 0;                                   // it stays teal to the end; the pages follow

            const now = c.time;
            // the shards with words fly through on their own, between the gold lines, so the two never overlap
            const tText = span(p, TEXT_FROM, TEXT_TO);
            for (const pc of pieces) {
                const tp = pc.bg ? t : tText;
                pc.obj.visible = !!pc.worded && p > TEXT_FROM - 0.02 && p < TEXT_TO + 0.02;   // only glass that carries words
                pc.obj.position.lerpVectors(pc.p0, pc.p1, tp);
                pc.obj.position.x += pc.dx;
                qa.slerpQuaternions(pc.q0, pc.q1, tp);
                const w = pc.wob;
                qw.setFromEuler(ew.set(Math.sin(now * w[3] + w[6]) * w[0], Math.sin(now * w[4] + w[7]) * w[1], Math.sin(now * w[5] + w[8]) * w[2]));
                pc.obj.quaternion.multiplyQuaternions(qa, qw);
                const depth = Math.abs(pc.obj.position.z) * 0.15;              // a little parallax with the pointer
                pc.obj.position.x -= c.pointer.x * depth * 0.2;
                pc.obj.position.y += c.pointer.y * depth * 0.2;
            }
        },
        dispose() {
            bgMat.dispose(); bg.geometry.dispose(); env.dispose(); pmrem.dispose();
            glass.dispose(); texts.forEach((x) => x.dispose());
            rigs.forEach((r) => r.mixer.stopAllAction());
            camera.remove(shardGroup);
            scene.remove(cam2.scene);
        },
    };
};

export default factory;
