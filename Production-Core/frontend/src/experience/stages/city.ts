import {
    AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, EdgesGeometry,
    InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshMatcapMaterial, Object3D, OctahedronGeometry,
    Fog, PerspectiveCamera, PlaneGeometry, Points, Raycaster, RepeatWrapping, Scene, ShaderMaterial, Sprite, SpriteMaterial, Vector2, Vector3, type Texture,
} from 'three';
import { DOMAINS, ROADS, type Domain } from '../domains';
import { canvasTexture, clamp01, ease, MONO, rng, span } from '../procedural/common';
import { useExperience } from '../store';
import type { StageCtx, StageFactory } from '../types';

/**
 * Stage 5: the DSA city. The opening descends through clouds (clouds.ktx2 when available) while the last lines appear;
 * then the 22 domains of curriculum/dsa_roadmap.md stand as districts, front to back in prerequisite order, joined by
 * roads that are the real prerequisite links between their concepts (domains.ts). Domains with no Kiddoo concept
 * document yet are drawn as scaffolding. Click a district, use the d-pad, the arrow keys or the joystick to browse;
 * drag to pan; wheel to zoom.
 */

const LEVEL_COLOR = { Foundations: '#bfeedd', Intermediate: '#7fcdb0', Advanced: '#3f9c80' } as const;
const levelColor = (d: Domain) => new Color(d.level ? (d.level.endsWith('Advanced') ? LEVEL_COLOR.Advanced : d.level.includes('Intermediate') ? LEVEL_COLOR.Intermediate : LEVEL_COLOR.Foundations) : '#d9dedb');
const CLOUD_RECTS = [[0, 0, 1019, 570], [1028, 0, 1020, 569], [0, 584, 973, 377], [928, 1076, 1120, 411], [0, 1487, 973, 515], [1053, 1497, 995, 505]];
const AZIMUTH = Math.PI / 4, ELEV_MAP = 0.62, ELEV_SKY = 1.25, DIST_MAP = 74, DIST_SKY = 190;

const SKY_FS = /* glsl */ `
varying vec2 vUv;
void main() {
    vec3 top = vec3(0.86, 0.93, 0.91), bot = vec3(0.97, 0.98, 0.97);
    gl_FragColor = vec4(pow(mix(bot, top, vUv.y), vec3(2.2)), 1.0);
    #include <colorspace_fragment>
}`;
const GROUND_VS = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FS = /* glsl */ `
uniform vec2 uCenter;
varying vec3 vW;
void main() {
    vec2 g = abs(fract(vW.xz / 3.6) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.03, min(g.x, g.y));
    float d = length(vW.xz - uCenter);
    vec3 col = mix(vec3(0.93, 0.96, 0.95), vec3(0.84, 0.91, 0.88), line * 0.6);
    col = mix(col, vec3(0.97, 0.98, 0.97), smoothstep(30.0, 80.0, d));
    gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
    #include <colorspace_fragment>
}`;

/** A clay-white matcap with mint shadows: the city reads as one soft model. */
function cityMatcap() {
    return canvasTexture(256, 256, (g) => {
        g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.clip();
        let gr = g.createRadialGradient(118, 110, 0, 128, 128, 128);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#eef6f2'); gr.addColorStop(0.82, '#a9cbbf'); gr.addColorStop(1, '#4d7a6e');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        gr = g.createRadialGradient(92, 78, 0, 92, 78, 60);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    });
}

/** The rotating band around the selected district, lettered with its name. */
function bandTexture(name: string) {
    const t = canvasTexture(2048, 128, (g) => {
        g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 2048, 128);
        g.font = `600 70px ${MONO}`; g.fillStyle = 'rgba(255,255,255,0.95)'; g.textBaseline = 'middle';
        const text = ` ${name.toUpperCase()}  ·  `;
        let x = 0;
        while (x < 2048) { g.fillText(text, x, 66); x += g.measureText(text).width; }
    });
    t.wrapS = RepeatWrapping;
    return t;
}

const factory: StageFactory = async (ctx: StageCtx) => {
    const clouds = await ctx.assets.texture(ctx.w < 768 ? 'cloudsMobile' : 'clouds');
    const scene = new Scene();
    const camera = new PerspectiveCamera(22, 1, 1, 600);
    const R = rng(31);

    const sky = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }', fragmentShader: SKY_FS, depthTest: false, depthWrite: false,
    }));
    sky.frustumCulled = false; sky.renderOrder = -1000;
    scene.add(sky);

    // the city's centre (domains are laid out from the front row backwards)
    const cx = DOMAINS.reduce((s, d) => s + d.x, 0) / DOMAINS.length, cz = DOMAINS.reduce((s, d) => s + d.z, 0) / DOMAINS.length;
    const groundMat = new ShaderMaterial({ vertexShader: GROUND_VS, fragmentShader: GROUND_FS, uniforms: { uCenter: { value: new Vector2(cx, cz) } } });
    const ground = new Mesh(new PlaneGeometry(400, 400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.01, cz);
    scene.add(ground);

    // districts: a platform, buildings (instanced) and a landmark tower whose height grows with its concepts
    const matcap = cityMatcap();
    scene.fog = new Fog('#f3f7f5', 10, 20);                                      // the city stays in cloud until the opening ends
    const platGeo = new CylinderGeometry(3.0, 3.2, 0.32, 48);
    platGeo.translate(0, 0.16, 0);
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const built = DOMAINS.filter((d) => d.concepts.length).length;
    const counts = DOMAINS.map((d) => (d.concepts.length ? 4 + Math.min(8, d.bullets.length + d.concepts.length * 2) : 0));
    const bMat = new MeshMatcapMaterial({ matcap });
    const buildings = new InstancedMesh(box, bMat, counts.reduce((a, b) => a + b, 0) + built);
    const owner: number[] = [];
    const dummy = new Object3D();
    let n = 0;
    const platMats: MeshMatcapMaterial[] = [];
    const platforms = DOMAINS.map((d, i) => {
        const pm = new MeshMatcapMaterial({ matcap, color: d.concepts.length ? new Color('#eef4f1') : new Color('#e3e6e4') });
        platMats.push(pm);
        const plat = new Mesh(platGeo, pm);
        plat.position.set(d.x, 0, d.z);
        plat.userData.domain = i;
        scene.add(plat);
        if (!d.concepts.length) return plat;
        const col = levelColor(d);
        for (let k = 0; k < counts[i]; k++) {
            const a = (k / counts[i]) * Math.PI * 2 + R() * 0.4, r = 1.25 + R() * 1.05;
            const w = 0.55 + R() * 0.5, h = 0.6 + R() * (1.4 + d.depth * 0.25);
            dummy.position.set(d.x + Math.cos(a) * r, 0.32, d.z + Math.sin(a) * r);
            dummy.rotation.set(0, R() * Math.PI, 0);
            dummy.scale.set(w, h, w * (0.7 + R() * 0.6));
            dummy.updateMatrix();
            buildings.setMatrixAt(n, dummy.matrix);
            buildings.setColorAt(n, col.clone().offsetHSL(0, 0, (R() - 0.5) * 0.08));
            owner[n++] = i;
        }
        dummy.position.set(d.x, 0.32, d.z);                                     // the landmark
        dummy.rotation.set(0, Math.PI / 4, 0);
        dummy.scale.set(0.9, 2.2 + d.concepts.length * 0.9, 0.9);
        dummy.updateMatrix();
        buildings.setMatrixAt(n, dummy.matrix);
        buildings.setColorAt(n, new Color('#ffffff'));
        owner[n++] = i;
        return plat;
    });
    buildings.count = n;
    scene.add(buildings);

    // domains without a concept document yet: scaffolding
    const scaffold: number[] = [];
    const edge = new EdgesGeometry(new BoxGeometry(1, 1, 1));
    DOMAINS.forEach((d) => {
        if (d.concepts.length) return;
        for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2, r = k === 0 ? 0 : 1.6, h = 1 + R() * 2.2, w = 0.8 + R() * 0.4;
            const pos = edge.getAttribute('position');
            for (let v = 0; v < pos.count; v++) scaffold.push(d.x + Math.cos(a) * r + pos.getX(v) * w, 0.32 + (pos.getY(v) + 0.5) * h, d.z + Math.sin(a) * r + pos.getZ(v) * w);
        }
    });
    const scaffGeo = new BufferGeometry();
    scaffGeo.setAttribute('position', new BufferAttribute(new Float32Array(scaffold), 3));
    const scaffMat = new LineBasicMaterial({ color: '#9fb3ab', transparent: true, opacity: 0.8 });
    scene.add(new LineSegments(scaffGeo, scaffMat));

    // roads: L-shaped, along the grid; light runs along them from prerequisite to dependent
    const roadMat = new MeshBasicMaterial({ color: '#cfdcd6' });
    const roadGeo = new BoxGeometry(1, 0.04, 1);
    const paths: Vector3[][] = ROADS.map(([a, b]) => {
        const A = DOMAINS[a], B = DOMAINS[b];
        return [new Vector3(A.x, 0.03, A.z), new Vector3(B.x, 0.03, A.z), new Vector3(B.x, 0.03, B.z)];
    });
    const segs = paths.flatMap((p) => [[p[0], p[1]], [p[1], p[2]]]).filter(([u, v]) => u.distanceTo(v) > 0.01);
    const roads = new InstancedMesh(roadGeo, roadMat, segs.length);
    segs.forEach(([u, v], i) => {
        dummy.position.copy(u).add(v).multiplyScalar(0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(Math.abs(v.x - u.x) + 0.32, 1, Math.abs(v.z - u.z) + 0.32);
        dummy.updateMatrix();
        roads.setMatrixAt(i, dummy.matrix);
    });
    scene.add(roads);
    const FLOW = 3;
    const flowGeo = new BufferGeometry();
    flowGeo.setAttribute('position', new BufferAttribute(new Float32Array(paths.length * FLOW * 3), 3));
    const flowMat = new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending,
        vertexShader: 'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.45, 0.95, 0.75, smoothstep(0.5, 0.0, d)); }',
    });
    const flow = new Points(flowGeo, flowMat);
    flow.frustumCulled = false;
    scene.add(flow);

    // markers above each district and the band around the selected one
    const markGeo = new OctahedronGeometry(0.42);
    const markMat = new MeshMatcapMaterial({ matcap, color: new Color('#7fdcb6') });
    const markers = new InstancedMesh(markGeo, markMat, DOMAINS.length);
    scene.add(markers);
    const bandGeo = new CylinderGeometry(3.6, 3.6, 0.9, 96, 1, true);
    let bandTex: Texture = bandTexture(DOMAINS[1].name);
    const bandMat = new MeshBasicMaterial({ map: bandTex, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false, color: new Color('#ffffff') });
    const band = new Mesh(bandGeo, bandMat);
    const glowMat = new MeshBasicMaterial({ color: '#6ee0b0', transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false, blending: AdditiveBlending });
    const glow = new Mesh(new CylinderGeometry(3.4, 3.4, 2.4, 96, 1, true), glowMat);
    scene.add(band, glow);
    let bandFor = 1;

    // clouds: a ceiling the camera descends through, then a few drifting at the edges of the map
    const cloudTex: Texture[] = [];
    const cloudSprites = clouds ? Array.from({ length: 26 }, (_, i) => {
        const [x, y, w, h] = CLOUD_RECTS[i % CLOUD_RECTS.length];
        const t = clouds.clone();
        t.offset.set(x / 2048, 1 - (y + h) / 2048); t.repeat.set(w / 2048, h / 2048); t.needsUpdate = true;
        cloudTex.push(t);
        const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
        const ang = R() * Math.PI * 2, rad = i < 18 ? 2 + R() * 18 : 46 + R() * 20;
        const scale = (i < 18 ? 26 : 34) + R() * 16;
        s.scale.set(scale, scale * (h / w), 1);
        s.userData = { ang, rad, y: i < 18 ? 22 + R() * 70 : 6 + R() * 6, base: i < 18 ? 1 : 0.55, ceiling: i < 18 };
        scene.add(s);
        return s;
    }) : [];

    // camera: orbit target (eases to the selected district), pan offset, zoom
    const target = new Vector3(DOMAINS[1].x, 0, DOMAINS[1].z), goal = target.clone(), pan = new Vector3();
    let zoom = 1, hover = -1;
    const ray = new Raycaster(), ndc = new Vector2();
    const drag = { on: false, moved: 0, x: 0, y: 0 };
    const pick = (e: PointerEvent): number => {
        ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects([buildings, markers, ...platforms], false);
        for (const h of hits) {
            if (h.object === buildings && h.instanceId !== undefined) return owner[h.instanceId];
            if (h.object === markers && h.instanceId !== undefined) return h.instanceId;
            if (typeof h.object.userData.domain === 'number') return h.object.userData.domain;
        }
        return -1;
    };
    const right = new Vector3(), fwd = new Vector3();

    // the story ends on the sky and the clouds: the city itself is not shown (the landing page follows)
    const keep = new Set<Object3D>([sky, ...cloudSprites]);
    scene.children.forEach((o) => { if (!keep.has(o)) o.visible = false; });

    return {
        scene, camera,
        resize(w, h) { camera.aspect = w / h; camera.fov = w / h < 1 ? 34 : 22; camera.updateProjectionMatrix(); },
        pointer(kind, e, c) {
            const st = useExperience.getState();
            if (!st.cityReady) return false;
            if (kind === 'down') { drag.on = true; drag.moved = 0; drag.x = e.clientX; drag.y = e.clientY; return true; }
            if (kind === 'move') {
                if (drag.on) {
                    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                    drag.moved += Math.abs(dx) + Math.abs(dy);
                    drag.x = e.clientX; drag.y = e.clientY;
                    const k = (DIST_MAP / zoom) * 0.0011;
                    pan.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k * 1.4);
                } else {
                    const h = pick(e);
                    if (h !== hover) { hover = h; st.set({ hover: h }); document.documentElement.style.cursor = h >= 0 ? 'pointer' : ''; }
                }
                return true;
            }
            if (kind === 'up' && drag.on) {
                drag.on = false;
                if (drag.moved < 8) { const h = pick(e); if (h >= 0) { st.set({ domain: h }); c.sound.fx('click'); } }
                return true;
            }
            return false;
        },
        update(p, dt, c) {
            const st = useExperience.getState(), t = c.time;
            // follow the selection; the joystick pans; zoom eases
            const d = DOMAINS[st.domain];
            goal.set(d.x, 0, d.z);
            if (st.domain !== bandFor) { bandFor = st.domain; bandTex.dispose(); bandTex = bandTexture(d.name); bandMat.map = bandTex; pan.set(0, 0, 0); }
            pan.addScaledVector(right, st.joy.x * dt * 18).addScaledVector(fwd, -st.joy.y * dt * 18);
            pan.clampLength(0, 40);
            target.lerp(goal.clone().add(pan), 1 - Math.exp(-dt * 3.2));
            zoom += (st.zoom - zoom) * (1 - Math.exp(-dt * 6));
            // the opening: from high above the clouds down to the map
            const k = ease(clamp01(p));
            const elev = ELEV_SKY + (ELEV_MAP - ELEV_SKY) * k, dist = (DIST_SKY + (DIST_MAP - DIST_SKY) * k) / zoom;
            const az = AZIMUTH + c.pointer.x * 0.05 + Math.sin(t * 0.05) * 0.03;
            camera.position.set(target.x + Math.cos(elev) * Math.sin(az) * dist, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * Math.cos(az) * dist);
            // on wide screens the card covers the right: frame the selected district to its left
            const shift = st.cityReady && c.w >= 768 ? dist * 0.11 : 0;
            camera.lookAt(target.x + right.x * shift, target.y, target.z + right.z * shift);
            right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
            fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();

            // markers bob; the selected one is bigger; the band turns around it
            DOMAINS.forEach((dm, i) => {
                const sel = i === st.domain, hov = i === hover;
                dummy.position.set(dm.x, 3.8 + (dm.concepts.length ? dm.concepts.length * 0.9 + 0.6 : 0) + Math.sin(t * 1.6 + i) * 0.25, dm.z);
                dummy.rotation.set(0, t * 0.8 + i, 0);
                dummy.scale.setScalar(sel ? 1.6 : hov ? 1.25 : 1);
                dummy.updateMatrix();
                markers.setMatrixAt(i, dummy.matrix);
                platMats[i].color.set(sel ? '#c9f5e2' : dm.concepts.length ? '#eef4f1' : '#e3e6e4');
            });
            markers.instanceMatrix.needsUpdate = true;
            band.position.set(d.x, 0.95, d.z);
            glow.position.set(d.x, 1.2, d.z);
            bandTex.offset.x = -t * 0.04;
            glowMat.opacity = 0.16 + Math.sin(t * 2.2) * 0.05;

            // light flowing along the roads
            const fp = flowGeo.getAttribute('position') as BufferAttribute;
            paths.forEach((path, i) => {
                const l1 = path[0].distanceTo(path[1]), l2 = path[1].distanceTo(path[2]), L = l1 + l2 || 1;
                for (let f = 0; f < FLOW; f++) {
                    const s = ((t * 3 + i * 1.7 + (f * L) / FLOW) % L);
                    const q = s < l1 ? path[0].clone().lerp(path[1], s / (l1 || 1)) : path[1].clone().lerp(path[2], (s - l1) / (l2 || 1));
                    fp.setXYZ(i * FLOW + f, q.x, 0.12, q.z);
                }
            });
            fp.needsUpdate = true;

            // the cloud lifts off the city during the last line of the opening
            const fog = scene.fog as Fog, clear = span(p, 0.62, 0.92);
            fog.near = dist * (0.55 + clear * 0.7);
            fog.far = dist * (0.62 + clear * 3);

            // clouds part as the camera comes down, a few stay at the edges
            for (const s of cloudSprites) {
                const u = s.userData as { ang: number; rad: number; y: number; base: number; ceiling: boolean };
                const out = u.ceiling ? 1 + k * 2.2 : 1;
                const ox = u.ceiling ? goal.x : cx, oz = u.ceiling ? goal.z : cz;
                s.position.set(ox + Math.cos(u.ang + t * 0.01) * u.rad * out, u.y, oz + Math.sin(u.ang + t * 0.01) * u.rad * out);
                (s.material as SpriteMaterial).opacity = u.ceiling ? u.base * (1 - span(p, 0.55, 0.95)) : u.base * span(p, 0.6, 1);
            }
        },
        dispose() {
            document.documentElement.style.cursor = '';
            sky.geometry.dispose(); (sky.material as ShaderMaterial).dispose(); ground.geometry.dispose(); groundMat.dispose();
            matcap.dispose(); platGeo.dispose(); box.dispose(); bMat.dispose(); platMats.forEach((m) => m.dispose()); buildings.dispose();
            edge.dispose(); scaffGeo.dispose(); scaffMat.dispose(); roadMat.dispose(); roadGeo.dispose(); roads.dispose(); flowGeo.dispose(); flowMat.dispose();
            markGeo.dispose(); markMat.dispose(); markers.dispose(); bandGeo.dispose(); bandTex.dispose(); bandMat.dispose(); glowMat.dispose(); glow.geometry.dispose();
            cloudSprites.forEach((s) => (s.material as SpriteMaterial).dispose()); cloudTex.forEach((x) => x.dispose());
        },
    };
};

export default factory;
