import type { Texture, WebGLRenderer } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { assetUrl, DECODERS, EXPERIENCE_ASSETS, type AssetKey } from '../lib/experienceAssets';

/**
 * Loads, caches and prefetches the files a stage asks for (glTF + Draco models, KTX2 atlases, WebP textures). A missing
 * or disallowed asset resolves to null, so a stage can always fall back to drawing its procedural version. The loaders
 * are imported only when a file is actually requested. Models are kept for the life of the story (going back to a stage
 * reuses them); everything is freed when the story closes.
 */
export class AssetCache {
    private models = new Map<AssetKey, Promise<GLTF | null>>();
    private textures = new Map<AssetKey, Promise<Texture | null>>();
    private draco: DRACOLoader | null = null;
    private ktx: KTX2Loader | null = null;
    private renderer: WebGLRenderer;

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer;
    }

    model(key: AssetKey): Promise<GLTF | null> {
        const hit = this.models.get(key);
        if (hit) return hit;
        const url = assetUrl(key);
        const p: Promise<GLTF | null> = url
            ? Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/loaders/DRACOLoader.js')])
                .then(([gl, dr]) => {
                    const loader = new gl.GLTFLoader();
                    if (!this.draco) { this.draco = new dr.DRACOLoader(); this.draco.setDecoderPath(DECODERS.draco); }
                    loader.setDRACOLoader(this.draco);
                    return loader.loadAsync(url);
                })
                .catch((err) => { console.warn(`[experience] ${key} not loaded`, err); return null; })
            : Promise.resolve(null);
        this.models.set(key, p);
        return p;
    }

    /** A WebP/PNG texture or a KTX2 atlas, in sRGB. */
    texture(key: AssetKey): Promise<Texture | null> {
        const hit = this.textures.get(key);
        if (hit) return hit;
        const url = assetUrl(key), kind = EXPERIENCE_ASSETS[key].kind;
        let p: Promise<Texture | null> = Promise.resolve(null);
        if (url && kind === 'ktx2') {
            p = import('three/examples/jsm/loaders/KTX2Loader.js').then(({ KTX2Loader }) => {
                if (!this.ktx) this.ktx = new KTX2Loader().setTranscoderPath(DECODERS.basis).detectSupport(this.renderer);
                return this.ktx.loadAsync(url);
            });
        } else if (url && kind === 'texture') {
            p = import('three').then(({ TextureLoader }) => new TextureLoader().loadAsync(url));
        }
        p = p.then(async (t) => {
            if (t) { const { SRGBColorSpace, NoColorSpace } = await import('three'); t.colorSpace = /normal/i.test(EXPERIENCE_ASSETS[key].path) ? NoColorSpace : SRGBColorSpace; }
            return t;
        }).catch((err) => { console.warn(`[experience] ${key} not loaded`, err); return null; });
        this.textures.set(key, p);
        return p;
    }

    /** Start loading a stage's set in the background. */
    prefetch(keys: AssetKey[]) {
        for (const k of keys) {
            const kind = EXPERIENCE_ASSETS[k].kind;
            if (kind === 'model') void this.model(k);
            else if (kind === 'texture' || kind === 'ktx2') void this.texture(k);
        }
    }

    dispose() {
        for (const p of this.models.values()) void p.then((g) => g?.scene.traverse((o) => {
            const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
            m.geometry?.dispose();
            (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
        }));
        for (const p of this.textures.values()) void p.then((t) => t?.dispose());
        this.models.clear();
        this.textures.clear();
        this.draco?.dispose();
        this.ktx?.dispose();
        this.draco = null;
        this.ktx = null;
    }
}
