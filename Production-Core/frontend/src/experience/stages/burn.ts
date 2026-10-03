import {
    Color, Euler, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, Vector3, type Texture,
} from 'three';
import { canvasTexture, ease, MONO, SERIF, span } from '../procedural/common';
import { burnMaterial, embers } from '../procedural/burn';
import type { StageCtx, StageFactory } from '../types';

/**
 * Stage 3: the hours that re-reading burns. The camera starts almost touching a page of study notes (read six times),
 * pulls back and rolls while ten pages burn from the edges in, with embers; then it turns round and drifts through ash
 * towards a chalkboard: "Kiddoo measures what you know". Holding the ring zooms into the board.
 * The pages and the board are always our own (drawn below). Uses stage3_background1.webp when it is available.
 */

const BILLS: { p: [number, number, number]; r: [number, number, number]; s: number; b0: number; b1: number }[] = [
    { p: [0.022, 0, 0], r: [0, 0, 0], s: 1, b0: 0.3, b1: 1.5 }, { p: [0.2, 0.05, -0.3], r: [15, -25, 35], s: 0.8, b0: 0.15, b1: 0.9 },
    { p: [-0.2, -0.15, -0.15], r: [-20, 45, -60], s: 0.9, b0: 0.25, b1: 1.25 }, { p: [0.1, 0.1, 0.15], r: [25, -45, -40], s: 1, b0: 0.1, b1: 1.3 },
    { p: [0.05, -0.07, 0.6], r: [-15, 20, 30], s: 0.85, b0: 0.2, b1: 1.5 }, { p: [-0.05, 0.3, -0.3], r: [-15, 20, 30], s: 0.85, b0: 0.2, b1: 1.5 },
    { p: [0.4, -0.2, -0.1], r: [30, -40, 20], s: 0.75, b0: 0.35, b1: 1.2 }, { p: [-0.35, 0.25, -0.15], r: [-25, 35, -45], s: 0.7, b0: 0.4, b1: 1.3 },
    { p: [0.15, -0.3, -0.2], r: [40, -20, 55], s: 0.65, b0: 0.45, b1: 1.4 }, { p: [-0.25, 0.15, -0.25], r: [-35, 50, -30], s: 0.72, b0: 0.38, b1: 1.25 },
];
const D = Math.PI / 180;
const CAM0 = new Vector3(0, 0, 0.36), CAM1 = new Vector3(0, 0, 2);   // starts on the whole first page, readable
const BURN_END = 0.38;                         // the bills are gone by here
const BOARD_Z = 15;

/** The pages that burn: four sets of study notes, each one re-read again and again (the tally in the corner). */
const PAGES: { title: string; reads: number; lines: string[]; mark: number }[] = [
    { title: 'Arrays', reads: 6, mark: 1, lines: ['Traversal, insertion, deletion', 'Linear search O(n), binary search O(log n)', 'Prefix sum: pre[i] = pre[i-1] + a[i]', 'Two pointers: move in from both ends'] },
    { title: 'Big-O', reads: 5, mark: 0, lines: ['O(1) < O(log n) < O(n) < O(n log n)', 'Drop constants, keep the biggest term', 'Nested loops over n: O(n²)', 'Halving each step: O(log n)'] },
    { title: 'Binary search', reads: 7, mark: 2, lines: ['Only on a sorted array', 'lo = 0, hi = n - 1', 'mid = lo + (hi - lo) / 2', 'Loop while lo <= hi'] },
    { title: 'Recursion', reads: 4, mark: 1, lines: ['Base case first, always', 'Merge sort: T(n) = 2T(n/2) + n', 'fib(n) = fib(n-1) + fib(n-2)', 'Too deep: stack overflow'] },
];

/** A ruled page of notes with a margin line, one highlighted line and a tally of how many times it was read. */
function pageTexture(page: (typeof PAGES)[number]) {
    return canvasTexture(1400, 600, (g) => {
        g.fillStyle = '#d9ceb0'; g.fillRect(0, 0, 1400, 600);                 // aged paper, so gold words read over it
        g.strokeStyle = 'rgba(70,110,170,0.28)'; g.lineWidth = 2;
        for (let y = 150; y < 600; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(1400, y); g.stroke(); }
        g.strokeStyle = 'rgba(200,70,70,0.45)'; g.beginPath(); g.moveTo(110, 0); g.lineTo(110, 600); g.stroke();
        g.fillStyle = '#1f2b46'; g.font = `600 64px ${SERIF}`;
        g.fillText(page.title, 140, 96);
        g.fillStyle = 'rgba(240,215,80,0.5)'; g.fillRect(136, 140 + page.mark * 100 + 22, 760, 46);
        g.fillStyle = '#2b3550'; g.font = `italic 500 46px ${SERIF}`;
        page.lines.forEach((t, i) => g.fillText(t, 140, 190 + i * 100 + 8));
        // the tally: read, and read again
        g.save(); g.translate(1110, 70); g.rotate(-0.06);
        g.fillStyle = 'rgba(190,40,40,0.85)'; g.font = `600 30px ${MONO}`;
        g.fillText(`READ ×${page.reads}`, 0, 0);
        g.strokeStyle = 'rgba(190,40,40,0.75)'; g.lineWidth = 4;
        for (let k = 0; k < page.reads; k++) {
            const x = 10 + (k % 5) * 22 + Math.floor(k / 5) * 140;
            if (k % 5 === 4) { g.beginPath(); g.moveTo(x - 92, 58); g.lineTo(x + 6, 22); g.stroke(); }
            else { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, 62); g.stroke(); }
        }
        g.restore();
    });
}

/** The chalkboard behind "Kiddoo measures what you know": a prerequisite graph top right and a mastery curve crossing
 *  its threshold bottom left, in soft chalk. No formulas or sentences, so no chalk letters ever sit behind the words;
 *  the top left, bottom right and middle stay clear. Drawn at 2400 x 1500 so it stays sharp. */
function boardTexture() {
    return canvasTexture(2400, 1500, (g) => {
        const gr = g.createRadialGradient(1200, 650, 150, 1200, 750, 1400);
        gr.addColorStop(0, '#2f4d3e'); gr.addColorStop(1, '#14231b');
        g.fillStyle = gr; g.fillRect(0, 0, 2400, 1500);
        const chalk = (a: number) => `rgba(226,238,230,${a})`;
        g.lineCap = 'round'; g.lineJoin = 'round';
        // top right: a prerequisite graph (the shape of the curriculum)
        const nodes: [number, number][] = [[1980, 170], [1800, 380], [2160, 380], [1980, 590], [2240, 610]];
        g.strokeStyle = chalk(0.42); g.lineWidth = 4;
        [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4]].forEach(([i, j]) => { g.beginPath(); g.moveTo(nodes[i][0], nodes[i][1] + 34); g.lineTo(nodes[j][0], nodes[j][1] - 34); g.stroke(); });
        nodes.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.stroke(); });
        // bottom left: a mastery curve rising to the threshold
        const ox = 160, oy = 1360, w = 640, h = 330;
        g.strokeStyle = chalk(0.42); g.lineWidth = 4;
        g.beginPath(); g.moveTo(ox, oy - h); g.lineTo(ox, oy); g.lineTo(ox + w, oy); g.stroke();
        g.setLineDash([16, 14]); g.beginPath(); g.moveTo(ox, oy - h * 0.9); g.lineTo(ox + w, oy - h * 0.9); g.stroke(); g.setLineDash([]);
        g.strokeStyle = chalk(0.6); g.lineWidth = 6; g.beginPath();
        for (let i = 0; i <= 60; i++) { const x = i / 60, y = 1 - Math.exp(-x * 3.4); if (i) g.lineTo(ox + x * w, oy - y * h * 0.96); else g.moveTo(ox, oy); }
        g.stroke();
    });
}

const BG_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uHasTex, uToGreen, uAspect, uTexAspect, uDim;
varying vec2 vUv;
void main() {
    vec2 s = uAspect > uTexAspect ? vec2(1.0, uTexAspect / uAspect) : vec2(uAspect / uTexAspect, 1.0);
    vec3 a = uHasTex > 0.5 ? texture2D(uTex, (vUv - 0.5) * s + 0.5).rgb : vec3(0.06, 0.09, 0.07);
    vec2 c = vec2((vUv.x - 0.5) * uAspect, vUv.y - 1.0);
    float r = min(length(c), 1.0);
    vec3 g1 = vec3(134.0, 163.0, 144.0) / 255.0, g2 = vec3(68.0, 102.0, 82.0) / 255.0, g3 = vec3(34.0, 52.0, 42.0) / 255.0;
    vec3 green = pow(r < 0.5 ? mix(g1, g2, r / 0.5) : mix(g2, g3, (r - 0.5) / 0.5), vec3(2.2));
    gl_FragColor = vec4(mix(a, green, uToGreen) * uDim, 1.0);
    #include <colorspace_fragment>
}`;

const FOV = 32;

const factory: StageFactory = async (ctx: StageCtx) => {
    const bgTex = await ctx.assets.texture('stage3Bg');
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 100);

    const bgMat = new ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: BG_FS,
        depthTest: false, depthWrite: false,
        uniforms: { uTex: { value: bgTex }, uHasTex: { value: bgTex ? 1 : 0 }, uToGreen: { value: 0 }, uAspect: { value: 1 }, uTexAspect: { value: 16 / 9 }, uDim: { value: 1 } },
    });
    const im = bgTex?.image as { width?: number; height?: number } | undefined;
    if (im?.width && im.height) bgMat.uniforms.uTexAspect.value = im.width / im.height;
    const bg = new Mesh(new PlaneGeometry(2, 2), bgMat);
    bg.frustumCulled = false; bg.renderOrder = -1000;
    scene.add(bg);

    // the pages of notes: the first (the close-up) is Arrays, the rest cycle through the four
    const pages = PAGES.map(pageTexture);
    const billGeo = new PlaneGeometry(0.345, 0.15, 16, 8);
    const bills = BILLS.map((b, i) => {
        const mat = burnMaterial(pages[i % pages.length], { aspect: 2.3, seed: i * 0.33 });
        mat.uniforms.uWaveAmp.value = i === 0 ? 0 : 0.015;
        const m = new Mesh(billGeo, mat);
        m.position.set(...b.p); m.rotation.set(b.r[0] * D, b.r[1] * D, b.r[2] * D); m.scale.setScalar(b.s);
        m.frustumCulled = false;
        scene.add(m);
        return { m, mat, b, seed: Math.random() };
    });
    const fire = embers(240, new Vector3(1.2, 1.4, 1.2), new Vector3(0, 0, 0.2));
    scene.add(fire.points);

    // after the fire: ash drifting towards a chalkboard
    const ash = embers(260, new Vector3(3, 3, 14), new Vector3(0, 0, 8), 4);
    ash.mat.uniforms.uColor.value.set(0.85, 0.9, 0.85);
    scene.add(ash.points);
    const boardTex: Texture = boardTexture();
    // soft edges, so the board melts into the green rather than ending in a hard rectangle
    const edges = canvasTexture(256, 256, (g) => {
        const gr = g.createRadialGradient(128, 128, 100, 128, 128, 128);
        gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    });
    const boardMat = new MeshBasicMaterial({ map: boardTex, alphaMap: edges, transparent: true, opacity: 0, toneMapped: false, color: new Color(1.5, 1.55, 1.5) });
    const board = new Mesh(new PlaneGeometry(6.6, 6.6 * 0.625), boardMat);
    board.position.set(0, 0, BOARD_Z);
    board.rotation.set(0, Math.PI, -Math.PI / 2);                // the camera has turned round (looks along +z) and rolled 90 degrees
    board.visible = false;                                       // the words stand on the green and the drifting ash alone
    scene.add(board);

    const qA = new Quaternion().setFromEuler(new Euler(0, 0, 90 * D)), qB = new Quaternion().setFromEuler(new Euler(180 * D, 0, 90 * D));
    const tilt = new Quaternion(), look = new Euler();
    let crackle = false;

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            // portrait: a horizontal view a little wider than a square screen's, so the pages are not cut at the sides
            camera.fov = camera.aspect < 1 ? (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * 1.3 / camera.aspect) * 180) / Math.PI : FOV;
            camera.updateProjectionMatrix();
            bgMat.uniforms.uAspect.value = w / h;
        },
        update(p, dt, c) {
            const t = c.time, r = Math.min(1, span(p, 0, BURN_END));
            // pull back from the bill and roll; then turn round and drift back towards the board; holding zooms in
            camera.position.lerpVectors(CAM0, CAM1, ease(r));
            if (p <= BURN_END) camera.quaternion.setFromEuler(look.set(0, 0, 90 * D * ease(r)));
            else {
                camera.quaternion.slerpQuaternions(qA, qB, ease(span(p, BURN_END, BURN_END + 0.06)));
                camera.position.z = CAM1.z + ease(span(p, BURN_END, 0.95)) * (BOARD_Z - 8) + ease(c.hold) * 0.8 + (c.holdDone ? 0.8 : 0);
            }
            tilt.setFromEuler(look.set(-c.pointer.y * 0.02, -c.pointer.x * 0.03, 0));
            camera.quaternion.multiply(tilt);

            bgMat.uniforms.uToGreen.value = span(p, 0.175, 0.35);
            bgMat.uniforms.uDim.value = 1;                                       // the same green as behind "Guessing", to the end
            if (!crackle && p > 0.05) { crackle = true; c.sound.fx('burn'); }
            if (crackle && p < 0.02) crackle = false;

            for (const { m, mat, b, seed } of bills) {
                const k = span(r, b.b0, b.b1);
                mat.uniforms.uBurnProgress.value = k;
                mat.uniforms.uTime.value += dt;
                if (b === BILLS[0]) mat.uniforms.uWaveAmp.value = span(r, 0.2, 0.4) * 0.015;
                m.visible = p < 0.4 && k < 0.999;
                m.position.z = b.p[2] + r * (0.3 + seed * 0.7);
                const q = r * 1.5;
                m.rotation.set(b.r[0] * D + Math.sin(seed * 6.283 + r * 3) * q, b.r[1] * D + Math.cos(seed * 4.1 + r * 2.5) * q, b.r[2] * D + Math.sin(seed * 3.7 + r * 4) * q * 0.5);
            }
            fire.mat.uniforms.uTime.value = t;
            fire.mat.uniforms.uOpacity.value = Math.min(span(p, 0, 0.05), 1 - span(p, 0.2, 0.35));
            fire.points.visible = p < 0.36;
            ash.mat.uniforms.uTime.value = t;
            ash.mat.uniforms.uOpacity.value = span(p, BURN_END, BURN_END + 0.08) * 0.8;
            boardMat.opacity = span(p, 0.45, 0.62) * 0.8;                       // the board is clearly there, the words stay on top
        },
        dispose() {
            bg.geometry.dispose(); bgMat.dispose(); billGeo.dispose(); bills.forEach(({ mat }) => mat.dispose()); pages.forEach((x) => x.dispose());
            fire.dispose(); ash.dispose(); board.geometry.dispose(); boardMat.dispose(); edges.dispose(); boardTex.dispose();
        },
    };
};

export default factory;
