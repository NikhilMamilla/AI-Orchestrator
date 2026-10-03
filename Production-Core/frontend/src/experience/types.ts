import type { Camera, Scene, Texture, WebGLRenderer } from 'three';
import type { AssetCache } from './assets';
import type { Sound } from './sound';

/** What the engine hands to the active stage every frame. */
export interface StageCtx {
    renderer: WebGLRenderer;
    w: number;
    h: number;
    mobile: boolean;
    reduced: boolean;
    pointer: { x: number; y: number };   // -1..1, smoothed
    time: number;                        // seconds since the stage began
    hold: number;                        // 0..1 fill of the hold gate
    holding: boolean;
    holdDone: boolean;
    sound: Sound;
    assets: AssetCache;
    snapshot: Texture | null;            // the previous stage's last frame, for a stage that enters by breaking it
}

/** A stage of the story: its own scene and camera, driven by its progress (0..1). */
export interface StageModule {
    scene: Scene;
    camera: Camera;
    update(p: number, dt: number, ctx: StageCtx): void;
    resize(w: number, h: number): void;
    dispose(): void;
    /** Pointer input on the canvas (the city: drag, click). Return true when it was used. */
    pointer?(kind: 'down' | 'move' | 'up', e: PointerEvent, ctx: StageCtx): boolean;
}

export type StageFactory = (ctx: StageCtx) => Promise<StageModule>;
