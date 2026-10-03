/**
 * Every file the landing story can load, in one place so any of them can be swapped later.
 *
 * In development the story can use third-party placeholder assets (models, atlases, textures, audio). They live in
 * the gitignored `placeholder-assets/` folder, outside public/, and only the Vite dev server serves them: in `npm run dev`
 * they are on by default (`VITE_PLACEHOLDERS=off` turns them off). A production build cannot contain them, so it uses
 * the procedural version of each stage instead, and scripts/check-dist.mjs fails the build if one slips in.
 * Never used, by decision: the world map (other companies' buildings), third-party texts and job statistics, logo coins,
 * quote cards with real people, diplomas with real seals, logos, brand files, company videos and paid fonts.
 * frontend/ASSET-TODO.md lists a free replacement for every file below.
 */

export type AssetKind = 'model' | 'audio' | 'texture' | 'ktx2' | 'video';

export interface AssetEntry {
    path: string;
    kind: AssetKind;
    placeholder: boolean;
    use: string;                         // what it is for in the story
    replaceWith: string;                 // a free, licence-clean source for a final asset
}

export const PLACEHOLDERS_ENABLED: boolean = import.meta.env.DEV && import.meta.env.VITE_PLACEHOLDERS !== 'off';

const PH = (path: string, kind: AssetKind, use: string, replaceWith: string): AssetEntry => ({ path, kind, placeholder: true, use, replaceWith });
const HAND = 'Sketchfab CC0 / CC-BY rigged hand, or a MakeHuman (CC0) hand exported to glTF';

export const EXPERIENCE_ASSETS = {
    // stage 1: the two hands, their camera path, the garden
    handEth: PH('models/fancy_hand_2.glb', 'model', 'Stage 1: the sculpted hand that reaches across', HAND),
    handHuman: PH('models/human_hand_1.glb', 'model', 'Stage 1: the human hand that reaches back', HAND),
    camera1: PH('models/camera_1.glb', 'model', 'Stage 1: the animated camera path', 'our own camera path (Blender)'),
    handMatcap: PH('textures/matcap-hand.webp', 'texture', 'Stage 1: the sculpted hand\'s material', 'a matcap from github.com/nidorx/matcaps (CC0)'),
    humanHandsAtlas: PH('atlases/human_hands.ktx2', 'ktx2', 'Stages 1-2: skin textures and the hand mask', 'textures baked from the CC0 hand above'),
    spcAtlas: PH('atlases/shards-petals-coins.ktx2', 'ktx2', 'Stage 1: petals (only the petal frames are used)', 'Poly Haven (CC0) petal photos'),
    gardenAtlas: PH('atlases/garden-godrays.ktx2', 'ktx2', 'Stage 1: garden, pillars, sky and light rays', 'Poly Haven (CC0) HDRI crops and Pexels photos'),
    // stage 2: the glass
    glassShatter: PH('models/stage2_glass-shatter.glb', 'model', 'Stage 2: the pane that breaks (animated fracture)', 'Blender cell-fracture of our own pane'),
    glassShards: PH('models/glass_shards.glb', 'model', 'Stage 2: the shards that carry our evidence lines', 'Blender cell-fracture of our own pane'),
    handHuman2: PH('models/human_hand_2.glb', 'model', 'Stage 2: the hand that rises behind the glass', HAND),
    camera2: PH('models/camera_2.glb', 'model', 'Stage 2: the animated camera path', 'our own camera path (Blender)'),
    stage2Bg: PH('textures/stage2_background2.webp', 'texture', 'Stage 2: background', 'Pexels (free licence) abstract light'),
    stage2Video: PH('videos/stage2_background_video-desktop.mp4', 'video', 'Stage 2: moving background', 'Pexels (free licence) light loop'),
    stage2VideoMobile: PH('videos/stage2_background_video-mobile.mp4', 'video', 'Stage 2: moving background (phones)', 'Pexels (free licence) light loop'),
    // stage 3: what wasted study burns
    moneyShredsAtlas: PH('atlases/leather-money-shreds.ktx2', 'ktx2', 'Stage 3: paper shreds and the burning bill (no quote cards)', 'Poly Haven (CC0) paper textures'),
    moneyHand: PH('textures/stage3_money-hand.webp', 'texture', 'Stage 3: the hand holding the bill', 'Pexels (free licence) photo'),
    certAtlas: PH('atlases/board-certificates.ktx2', 'ktx2', 'Stage 3: the chalkboard (only the chalkboard; the diplomas are never sampled)', 'our own canvas board (already the production fallback)'),
    stage3Bg: PH('textures/stage3_background1.webp', 'texture', 'Stages 3-4: background', 'Pexels (free licence) dark texture'),
    // stage 4: the tunnel, stage 5: clouds
    clouds: PH('atlases/clouds.ktx2', 'ktx2', 'Stage 5: clouds parting over the city', 'Poly Haven (CC0) cloud textures'),
    cloudsMobile: PH('atlases/clouds-mobile.ktx2', 'ktx2', 'Stage 5: clouds (phones)', 'Poly Haven (CC0) cloud textures'),
    frost: PH('textures/frost.webp', 'texture', 'The draw-a-zero gate: frosted glass', 'a CC0 frosted-glass texture (ambientCG)'),
    frostNormal: PH('textures/frost_normal.webp', 'texture', 'Stage 2: the surface of the glass shards (normal map)', 'a CC0 frosted-glass normal map (ambientCG)'),
    loaderHand: PH('models/loader_hand.glb', 'model', 'The draw-a-zero gate: the hand that follows the pointer', HAND),
    // sound
    ambBelieved: PH('audio/amb_stage1.mp3', 'audio', 'Stage 1 ambience', 'Pixabay Music or Freesound CC0 ambient pad'),
    ambShatter: PH('audio/amb_stage2-3.mp3', 'audio', 'Stages 2-3 ambience', 'Freesound CC0 dark drone'),
    ambTunnel: PH('audio/amb_stage4-5.mp3', 'audio', 'Stage 4 ambience', 'Freesound CC0 airy drone'),
    ambCity: PH('audio/amb_stage5.mp3', 'audio', 'Stage 5 ambience', 'Pixabay Music CC0 light ambient loop'),
    fxShatter: PH('audio/fx_glass-shatter.mp3', 'audio', 'Stage 2: the pane breaks', 'Freesound CC0 "glass break"'),
    fxBurn: PH('audio/fx_money-burn.mp3', 'audio', 'Stage 3: catching fire', 'Freesound CC0 "paper burning"'),
    fxWhoosh: PH('audio/fx_whoosh.mp3', 'audio', 'Stage 4: passing an agent ring', 'Freesound CC0 "whoosh"'),
    fxTunnel: PH('audio/fx_tunnel.mp3', 'audio', 'Stage 4: entering the tunnel', 'Freesound CC0 "air rush"'),
    fxHold: PH('audio/fx_hold-button.mp3', 'audio', 'Hold rings: charging', 'Freesound CC0 "charge up"'),
    fxXp: PH('audio/fx_xp-topup.mp3', 'audio', 'XP counter tops up', 'Freesound CC0 "coin chime"'),
    fxHand: PH('audio/fx_hand-entry.mp3', 'audio', 'Stage 1: a hand enters', 'Freesound CC0 "soft swoosh"'),
    fxClick: PH('audio/fx_click.mp3', 'audio', 'City: selecting a district', 'Freesound CC0 "ui click"'),
} as const satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof EXPERIENCE_ASSETS;

/** URL of an asset, or null when it must not be used (every placeholder in production, and in dev with VITE_PLACEHOLDERS=off). */
export function assetUrl(key: AssetKey): string | null {
    const a: AssetEntry = EXPERIENCE_ASSETS[key];
    if (a.placeholder) return PLACEHOLDERS_ENABLED ? `/placeholder-assets/${a.path}` : null;
    return `/${a.path}`;
}

/** What each stage loads; the next stage's set is prefetched while the current one plays. */
export const STAGE_ASSETS: Record<'believed' | 'shatter' | 'burn' | 'tunnel' | 'city', AssetKey[]> = {
    believed: ['loaderHand', 'handEth', 'handHuman', 'camera1', 'handMatcap', 'humanHandsAtlas', 'spcAtlas', 'gardenAtlas'],
    shatter: ['glassShatter', 'glassShards', 'handHuman2', 'camera2', 'stage2Bg', 'humanHandsAtlas', 'frostNormal'],
    burn: ['stage3Bg'],                                                 // the pages and the board are drawn in code
    tunnel: [],
    city: ['clouds', 'cloudsMobile'],
};

/** three.js's own decoders, copied from node_modules/three/examples/jsm/libs (MIT / Apache-2.0). */
export const DECODERS = { draco: '/vendor/draco/', basis: '/vendor/basis/' };
