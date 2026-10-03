import { CanvasTexture, Color, InstancedMesh, MeshMatcapMaterial, Object3D, PerspectiveCamera, Scene, TetrahedronGeometry, Vector3 } from 'three';
import { EVIDENCE_SHARDS } from '../copy';
import { backdrop, canvasTexture, ease, easeOut, fontsReady, pearlMatcap, rng, SCRIPT, SERIF, span } from '../procedural/common';
import { brokenPane, glassMaterial, glassMesh, glassSlab } from '../procedural/glass';
import type { StageFactory } from '../types';

/**
 * Stage 2: the confident-but-wrong tutor breaks.
 * A pane of glass carries the sentence "Most AI tutors sound Confident". It cracks from one point, then shatters; every
 * piece flies off carrying its fragment of the words. Through the gap come four slabs of glass, each with one of the
 * things Kiddoo does instead (from the README): cites every claim, checks each sentence, refuses before spending a model
 * call, and says "I don't have enough evidence".
 */

const PANE_W = 8, PANE_H = 4;
const IMPACT: [number, number] = [0.63, 0.4];

function gold(g: CanvasRenderingContext2D, y0: number, y1: number) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.55, '#f3dc8f'); gr.addColorStop(1, '#c9a64a');
    return gr;
}

function paneTexture() {
    return canvasTexture(2048, 1024, (g) => {
        const fr = g.createLinearGradient(0, 0, 2048, 1024);                  // the frosted surface
        fr.addColorStop(0, 'rgba(255,255,255,0.10)'); fr.addColorStop(0.5, 'rgba(200,210,255,0.04)'); fr.addColorStop(1, 'rgba(255,255,255,0.09)');
        g.fillStyle = fr; g.fillRect(0, 0, 2048, 1024);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeRect(3, 3, 2042, 1018);
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.shadowColor = 'rgba(243,220,143,0.35)'; g.shadowBlur = 24;
        g.font = `600 190px ${SERIF}`;
        g.fillStyle = gold(g, 260, 460);
        g.fillText('Most AI tutors', 1024, 430);
        // "sound Confident." with a calligraphic C
        g.font = `italic 600 150px ${SERIF}`;
        const a = 'sound ', b = 'onfident.';
        g.font = `italic 600 150px ${SERIF}`; const wa = g.measureText(a).width;
        g.font = `400 330px ${SCRIPT}`; const wc = g.measureText('C').width * 0.62;
        g.font = `600 190px ${SERIF}`; const wb = g.measureText(b).width;
        let x = 1024 - (wa + wc + wb) / 2;
        g.textAlign = 'left';
        g.fillStyle = gold(g, 560, 800);
        g.font = `italic 600 150px ${SERIF}`; g.fillText(a, x, 760); x += wa;
        g.font = `400 330px ${SCRIPT}`; g.fillText('C', x - 20, 790); x += wc;
        g.font = `600 190px ${SERIF}`; g.fillText(b, x, 760);
    });
}

function crackTexture(lines: { x: number; y: number }[][]) {
    return canvasTexture(2048, 1024, (g) => {
        g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3; g.lineCap = 'round';
        g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 6;
        g.beginPath();
        for (const [a, b] of lines) { g.moveTo(a.x * 2048, (1 - a.y) * 1024); g.lineTo(b.x * 2048, (1 - b.y) * 1024); }
        g.stroke();
    });
}

function slabTexture(big: string, rest: string) {
    return canvasTexture(1024, 512, (g) => {
        const fr = g.createLinearGradient(0, 0, 1024, 512);
        fr.addColorStop(0, 'rgba(255,255,255,0.16)'); fr.addColorStop(1, 'rgba(180,190,255,0.06)');
        g.fillStyle = fr; g.fillRect(0, 0, 1024, 512);
        g.textAlign = 'center';
        g.shadowColor = 'rgba(243,220,143,0.4)'; g.shadowBlur = 18;
        g.fillStyle = gold(g, 120, 300);
        g.font = `600 150px ${SERIF}`;
        g.fillText(big, 512, 250);
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(245,243,234,0.92)';
        let size = 64;
        g.font = `italic 500 ${size}px ${SERIF}`;
        while (g.measureText(rest).width > 900 && size > 36) { size -= 2; g.font = `italic 500 ${size}px ${SERIF}`; }
        g.fillText(rest, 512, 360);
    });
}

const factory: StageFactory = async () => {
    await fontsReady();
    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 100);
    const bg = backdrop({ top: '#1b1d4f', bottom: '#05060f', glow: '#8f86ff', glowPos: [0.5, 0.55], glowSize: 0.5, intensity: 0.28, columns: 0.5 });
    scene.add(bg.mesh);

    const { geo, lines } = brokenPane(PANE_W, PANE_H, IMPACT);
    const textTex = paneTexture(), crackTex = crackTexture(lines.map(([a, b]) => [a, b]));
    const paneMat = glassMaterial(textTex, crackTex);
    paneMat.uniforms.uImpact.value.set(IMPACT[0], IMPACT[1]);
    paneMat.uniforms.uAspect.value = PANE_W / PANE_H;
    const pane = glassMesh(geo, paneMat);
    scene.add(pane);

    const slabs = EVIDENCE_SHARDS.slice(1, 5).map((s, k) => {     // four slabs fit the procedural timing
        const tex = slabTexture(s.big, s.rest);
        const mat = glassMaterial(tex, null);
        const mesh = glassMesh(glassSlab(4.2, 2.1, 11 + k), mat);
        scene.add(mesh);
        return { mesh, mat, tex, start: 0.56 + k * 0.085, side: k % 2 ? 1 : -1 };
    });

    // small glass splinters that keep drifting once the pane is gone
    const R = rng(5);
    const matcap = pearlMatcap(128, '#1d2160');
    const bitsMat = new MeshMatcapMaterial({ matcap, color: new Color('#b5bcff'), transparent: true, opacity: 0.6 });
    const bitsGeo = new TetrahedronGeometry(0.12);
    const bits = new InstancedMesh(bitsGeo, bitsMat, 46);
    const items = Array.from({ length: 46 }, () => ({ p: new Vector3((R() * 2 - 1) * 9, (R() * 2 - 1) * 5, -8 + R() * 9), s: 0.5 + R() * 1.4, spin: R() * 3 + 0.5, ph: R() * 6 }));
    scene.add(bits);
    const dummy = new Object3D();
    let fit = 1, shattered = false;

    return {
        scene, camera,
        resize(w, h) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            bg.u.uAspect.value = w / h;
            const visH = 2 * 8 * Math.tan((camera.fov * Math.PI) / 360), visW = visH * camera.aspect;
            fit = Math.min((visW * 0.86) / PANE_W, (visH * 0.62) / PANE_H);
        },
        update(p, _dt, c) {
            const t = c.time;
            bg.u.uTime.value = t;
            const crack = span(p, 0.1, 0.3), burst = easeOut(span(p, 0.3, 0.64));
            if (!shattered && p > 0.3) { shattered = true; c.sound.fx('shatter'); }
            if (shattered && p < 0.24) shattered = false;
            const shake = burst > 0 && burst < 0.25 ? Math.sin(t * 70) * 0.05 * (1 - burst * 4) : 0;
            camera.position.set(c.pointer.x * 0.35 + shake, -c.pointer.y * 0.25, 8 - p * 1.4);
            camera.lookAt(0, 0, -2);

            pane.scale.setScalar(fit);
            paneMat.uniforms.uCrackR.value = ease(crack) * 1.25 + (crack > 0 ? 0.03 : -1);
            paneMat.uniforms.uT.value = burst;
            paneMat.uniforms.uOpacity.value = 1 - span(burst, 0.7, 1);
            pane.visible = burst < 0.999;
            bg.u.uIntensity.value = 0.28 + burst * 0.25;

            for (const s of slabs) {
                const k = span(p, s.start, s.start + 0.3);
                s.mesh.visible = k > 0 && k < 1;
                if (!s.mesh.visible) continue;
                const e = ease(k);
                s.mesh.position.set(s.side * (2.1 - e * 1.2) * Math.min(1, fit * 1.2), (s.side > 0 ? 0.55 : -0.5) + Math.sin(t * 0.8) * 0.05, -10 + e * 14.5);
                s.mesh.rotation.set((e - 0.5) * 0.35, (0.5 - e) * 0.9 * s.side, s.side * 0.05 + Math.sin(t * 0.6) * 0.03);
                s.mat.uniforms.uOpacity.value = span(k, 0, 0.12) * (1 - span(k, 0.8, 1));
            }

            const show = span(p, 0.3, 0.45);
            bits.visible = show > 0;
            items.forEach((it, i) => {
                dummy.position.set(it.p.x + Math.sin(t * 0.3 + it.ph) * 0.4, it.p.y + Math.cos(t * 0.25 + it.ph) * 0.3, it.p.z + p * 3);
                dummy.rotation.set(t * it.spin * 0.3 + it.ph, t * it.spin * 0.2, it.ph);
                dummy.scale.setScalar(it.s * show);
                dummy.updateMatrix();
                bits.setMatrixAt(i, dummy.matrix);
            });
            bits.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            bg.dispose(); geo.dispose(); paneMat.dispose(); textTex.dispose(); crackTex.dispose();
            slabs.forEach((s) => { s.mesh.geometry.dispose(); s.mat.dispose(); (s.tex as CanvasTexture).dispose(); });
            bitsGeo.dispose(); bitsMat.dispose(); matcap.dispose(); bits.dispose();
        },
    };
};

export default factory;
