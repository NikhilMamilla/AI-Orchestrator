# Placeholder assets: what the story uses in development, and what replaces them

In development the landing story (`Production-Core/frontend/src/experience`) can use third-party placeholder files kept
in `Production-Core/frontend/placeholder-assets/`. **They are not ours.**

**Where they can appear**

- **Dev only.** They live outside `public/` and the folder is gitignored. Only the Vite dev server serves them: on by
  default in `npm run dev`, off with `VITE_PLACEHOLDERS=off`.
- **Never in a build.** `npm run build` cannot contain them. Every stage has a version drawn in code, which a build
  uses instead. `scripts/check-dist.mjs` then fails the build if any of these files, a paid font name or a
  `/placeholder-assets/` URL appears in `dist/`.

**Decided 2026-10-02:** neutral assets only, dev only, for now. The decision is recorded in
`src/lib/experienceAssets.ts`, which also lists each file's purpose.

**Never used, whatever the mode**

- `world.ktx2`: other companies' buildings.
- `texts.ktx2` and the job statistics in `shards-petals-coins.ktx2`: third-party text and numbers.
- The logo coins.
- The quote cards: photos of real people with quotes attributed to them.
- The diplomas: real universities' seals.
- `logos/`, `brand/`, the company card videos, and the paid fonts (PP Supply, STK Bureau, Bethany Elingston).

## Used in dev (`placeholder-assets/`)

Every file below has a version drawn in code, which the production build uses instead (listed per stage).

| File | Used for | Free replacement |
|---|---|---|
| `models/loader_hand.glb` | The draw-a-zero gate: the hand that follows the pointer | Sketchfab CC0 / CC-BY rigged hand, or a MakeHuman (CC0) hand exported to glTF |
| `textures/frost.webp` | The gate's frosted glass | a CC0 frosted-glass texture (ambientCG) |
| `models/fancy_hand_2.glb` | Stage 1: the sculpted hand | Sketchfab CC0 / CC-BY rigged hand, or a MakeHuman (CC0) hand exported to glTF |
| `models/human_hand_1.glb` | Stage 1: the human hand | same |
| `models/camera_1.glb` | Stage 1: the camera path | our own camera path (Blender) |
| `textures/matcap-hand.webp` | Stage 1 and the gate: the hand's material | a matcap from github.com/nidorx/matcaps (CC0) |
| `atlases/human_hands.ktx2` | Stages 1–2: skin textures and the hand mask | textures baked from the CC0 hand |
| `atlases/shards-petals-coins.ktx2` | Stage 1: petals (only the petal frames are sampled) | Poly Haven (CC0) petal photos |
| `atlases/garden-godrays.ktx2` | Stage 1: garden, pillars, sky, light rays | Poly Haven (CC0) HDRI crops, Pexels photos |
| `models/stage2_glass-shatter.glb` | Stage 2: the stage 1 frame breaks along its cells | Blender cell-fracture of our own pane |
| `models/glass_shards.glb` | Stage 2: the shards carrying Kiddoo's evidence lines | same |
| `models/human_hand_2.glb` | Stage 2: the rising hand | Sketchfab CC0 / CC-BY rigged hand, or a MakeHuman (CC0) hand exported to glTF |
| `models/camera_2.glb` | Stage 2: the camera path | our own camera path (Blender) |
| `textures/frost_normal.webp` | Stage 2: the shards' surface | a CC0 frosted-glass normal map (ambientCG) |
| `textures/stage2_background2.webp` | Stage 2: the closing grain | Pexels (free licence) abstract texture |
| `videos/stage2_background_video-mobile.mp4` | Stage 2: the curtain (used on every screen) | Pexels (free licence) light loop |
| `videos/stage2_background_video-desktop.mp4` | listed in the manifest; the mobile file is used instead (same look, 4.5× less upload) | — |
| `textures/stage3_background1.webp` | Stage 3: background | Pexels (free licence) dark texture |
| `atlases/clouds.ktx2`, `atlases/clouds-mobile.ktx2` | Stage 5: clouds over the city | Poly Haven (CC0) cloud textures |
| `audio/amb_stage1.mp3` | Stage 1 ambience (sound is muted until turned on; production synthesises it) | Pixabay Music / Freesound CC0 ambient pad |
| `audio/amb_stage2-3.mp3` | Stages 2–3 ambience (sound is muted until turned on; production synthesises it) | Freesound CC0 dark drone |
| `audio/amb_stage4-5.mp3` | Stage 4 ambience (sound is muted until turned on; production synthesises it) | Freesound CC0 airy drone |
| `audio/amb_stage5.mp3` | Stage 5 ambience (sound is muted until turned on; production synthesises it) | Pixabay Music CC0 light loop |
| `audio/fx_glass-shatter.mp3` | Stage 2: the pane breaks (sound is muted until turned on; production synthesises it) | Freesound CC0 "glass break" |
| `audio/fx_money-burn.mp3` | Stage 3: catching fire (sound is muted until turned on; production synthesises it) | Freesound CC0 "paper burning" |
| `audio/fx_whoosh.mp3` | Stage 4: passing a ring (sound is muted until turned on; production synthesises it) | Freesound CC0 "whoosh" |
| `audio/fx_tunnel.mp3` | Stage 4: entering (sound is muted until turned on; production synthesises it) | Freesound CC0 "air rush" |
| `audio/fx_hold-button.mp3` | Hold rings (sound is muted until turned on; production synthesises it) | Freesound CC0 "charge up" |
| `audio/fx_xp-topup.mp3` | XP counter (sound is muted until turned on; production synthesises it) | Freesound CC0 "coin chime" |
| `audio/fx_hand-entry.mp3` | Stage 1: a hand enters (sound is muted until turned on; production synthesises it) | Freesound CC0 "soft swoosh" |
| `audio/fx_click.mp3` | City: selecting a district (sound is muted until turned on; production synthesises it) | Freesound CC0 "ui click" |

## Not used

| File(s) | Why |
|---|---|
| `atlases/leather-money-shreds.ktx2`, `textures/stage3_money-hand.webp` | Stage 3 burns our own pages of study notes (drawn in code), not money |
| `atlases/board-certificates.ktx2` | Stage 3 draws its own sharp chalkboard (the mastery update, review schedule, prerequisite graph) |
| `models/tunnel_new_new.glb` | Its twisted, lobed profile filled the view; the tunnel is our own tube and shader |
| `textures/matcap-certificate.webp`, `textures/origami_certificate.webp` | Belong to the diploma scene |
| `ui/*` | Our HUD is drawn in CSS/SVG |
| `_zero-vendor/**` | Their copy of the decoders. The Draco files are byte-identical to three.js's own `libs/draco/gltf/`; `public/vendor/` holds three's copies |
