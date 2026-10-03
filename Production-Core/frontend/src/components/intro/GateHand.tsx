import { useEffect, useRef } from 'react';
import {
    Group, Mesh, MeshMatcapMaterial, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Object3D, type Texture,
} from 'three';
import { introState } from '../../lib/introState';
import { AssetCache } from '../../experience/assets';
import { buildHand } from '../../experience/procedural/hand';
import { pearlMatcap } from '../../experience/procedural/common';

/**
 * The hand behind the "Draw a zero" gate. It rises in when the gate appears and follows the pointer: it sits a fixed
 * distance along the ray through the cursor and eases towards it, so it reads as the hand doing the drawing. With the
 * dev assets it is loader_hand.glb; otherwise our procedural hand, pointing. Both use our pearl-and-gold matcap.
 */
const DISTANCE = 2, FOLLOW = 13, ENTRY_DROP = -3, ENTRY_S = 0.9;

/** Moves a model so its fingertip (its highest vertex) is at its parent's origin: the tip then draws under the cursor. */
function tipToOrigin(model: Object3D) {
    model.updateMatrixWorld(true);
    const tip = new Vector3(-Infinity, -Infinity, -Infinity), v = new Vector3();
    model.traverse((o) => {
        const pos = (o as Mesh).isMesh ? (o as Mesh).geometry.attributes.position : null;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (v.y > tip.y) tip.copy(v); }
    });
    if (Number.isFinite(tip.y)) model.position.sub(tip);
}

export default function GateHand() {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = host.current;
        if (!el) return;
        let renderer: WebGLRenderer;
        try { renderer = new WebGLRenderer({ alpha: true, antialias: true }); } catch { return; }
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        el.appendChild(renderer.domElement);
        const scene = new Scene(), camera = new PerspectiveCamera(40, 1, 0.05, 50);
        const assets = new AssetCache(renderer);
        const holder = new Group();
        scene.add(holder);
        let disposed = false, procedural: ReturnType<typeof buildHand> | null = null, ownMatcap: Texture | null = null, mat: MeshMatcapMaterial | null = null;

        void assets.model('loaderHand').then((g) => {
            if (disposed) return;
            ownMatcap = pearlMatcap();                                       // pearl and gold, like the count's palette
            if (g) {
                let normalMap: Texture | null = null;
                g.scene.traverse((o) => { const m = (o as Mesh).material as { normalMap?: Texture } | undefined; if (!normalMap && m?.normalMap) normalMap = m.normalMap; });
                mat = new MeshMatcapMaterial({ matcap: ownMatcap, normalMap, toneMapped: false });
                g.scene.traverse((o: Object3D) => { if ((o as Mesh).isMesh) { (o as Mesh).material = mat!; o.frustumCulled = false; } });
                g.scene.scale.setScalar(6);
                tipToOrigin(g.scene);
                holder.add(g.scene);
            } else {
                mat = new MeshMatcapMaterial({ matcap: ownMatcap });
                procedural = buildHand(mat);
                procedural.setCurl([0.65, 0, 0.95, 1, 1]);                    // pointing with the index finger
                procedural.root.scale.setScalar(0.32);
                tipToOrigin(procedural.root);
                holder.add(procedural.root);
            }
        });

        const ndc = { x: 0.42, y: -0.3 };                                     // off to the side until the pointer moves, clear of the hints
        const onMove = (e: PointerEvent) => { ndc.x = (e.clientX / window.innerWidth) * 2 - 1; ndc.y = -(e.clientY / window.innerHeight) * 2 + 1; };
        const resize = () => {
            const w = window.innerWidth, h = window.innerHeight;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('resize', resize);

        const target = new Vector3(), cur = new Vector3();
        let raf = 0, last = performance.now(), shownAt = -1, hiddenAt = -1, init = false;
        const frame = (now: number) => {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const show = introState.gateHand;
            if (show && shownAt < 0) { shownAt = now; hiddenAt = -1; }
            if (!show && shownAt >= 0 && hiddenAt < 0) hiddenAt = now;
            if (shownAt < 0 || (hiddenAt >= 0 && now - hiddenAt > ENTRY_S * 1000)) { renderer.domElement.style.visibility = 'hidden'; return; }
            renderer.domElement.style.visibility = 'visible';
            // rise in (power2.out) and drop away again (power2.in)
            const tin = Math.min(1, (now - shownAt) / (ENTRY_S * 1000)), tout = hiddenAt >= 0 ? Math.min(1, (now - hiddenAt) / (ENTRY_S * 1000)) : 0;
            const drop = ENTRY_DROP * ((1 - (1 - (1 - tin) ** 2)) + tout * tout);
            target.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(DISTANCE).add(camera.position);
            if (!init) { cur.copy(target); init = true; }
            cur.lerp(target, 1 - Math.exp(-dt * FOLLOW));
            holder.position.copy(cur);
            holder.position.y += drop;
            holder.rotation.z = -ndc.x * 0.12;                                    // a slight lean towards the side it moves to
            renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('resize', resize);
            procedural?.dispose(); ownMatcap?.dispose(); mat?.dispose();
            assets.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return <div ref={host} aria-hidden className="pointer-events-none absolute inset-0" />;
}
