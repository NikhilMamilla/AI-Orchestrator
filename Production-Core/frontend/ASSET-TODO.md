# Placeholder assets: what the story uses in development, and what replaces them

In development the landing story (`Production-Core/frontend/src/experience`) can use third-party placeholder files kept
in `Production-Core/frontend/placeholder-assets/`. **They are not ours.**

**Where they can appear**

- **Dev only.** They live outside `public/` and the folder is gitignored. Only the Vite dev server serves them: on by
  default in `npm run dev`, off with `VITE_PLACEHOLDERS=off`.
- **Not in a default build.** `npm run build` (and CI) cannot contain them. Every stage has a version drawn in code,
  which a build uses instead, and `scripts/check-dist.mjs` fails the build if any of these files, a paid font name or
  a `/placeholder-assets/` URL appears in `dist/`.
- **The hosted site ships them by the owner's decision (2026-10-03).** Vercel builds with `VITE_PLACEHOLDERS=ship`,
  which copies only the story's file types into `dist/placeholder-assets/`. The never-used files below are excluded,
  and the check still fails on them and on paid font names. The files stay out of git: the Vercel CLI uploads them
  from the local folder.

**Decided 2026-10-02:** neutral assets only. On 2026-10-03 the owner chose to ship them on the hosted site too. The
decision is recorded in `src/lib/experienceAssets.ts`, which also lists each file's purpose.

**Drawn in code, no file needed (since 2026-10):** stage 1's background (the opening teal sky gradient, kept for the whole
stage), the floating light motes, and stage 2's teal curtain. The garden image, the petal atlas
(`shards-petals-coins.ktx2`), the garden atlas (`garden-godrays.ktx2`) and the curtain videos
(`stage2_background_video-*.mp4`) are no longer loaded by anything and are not listed below.

**Never used, whatever the mode**

- `world.ktx2`: other companies' buildings.
- `texts.ktx2`: third-party text and numbers.
- The logo coins.
- The quote cards: photos of real people with quotes attributed to them.
- The diplomas: real universities' seals.
- `logos/`, `brand/`, the company card videos, and the paid fonts (PP Supply, STK Bureau, Bethany Elingston).

## Used in dev (`placeholder-assets/`)

Every file below has a version drawn in code, which the production build uses instead (listed per stage).

| File | Used for | Free replacement |
|---|---|---|
| `models/camera_1.glb` | Stage 1: the camera path | our own camera path (Blender) |
| `models/glass_shards.glb` | Stage 2: the shards carrying Kiddoo's evidence lines | same |
| `models/camera_2.glb` | Stage 2: the camera path | our own camera path (Blender) |
| `textures/stage2_background2.webp` | Stage 2: the closing grain | Pexels (free licence) abstract texture |
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
| `models/fancy_hand_2.glb`, `models/human_hand_1.glb`, `models/human_hand_2.glb`, `atlases/human_hands.ktx2`, `textures/matcap-hand.webp` | The story's hands were never drawn (stage 1 is words only, stage 2 uses the camera path only), so they are no longer loaded |
| `models/stage2_glass-shatter.glb`, `textures/frost_normal.webp` | The glass pane that broke was never visible, and the shards' normal map was never read; no longer loaded |
| `models/loader_hand.glb`, `textures/frost.webp` | Belonged to the removed "draw a zero" gate; the opening now goes from the count straight into the story |
| `atlases/garden-godrays.ktx2`, `atlases/shards-petals-coins.ktx2`, `videos/stage2_background_video-*.mp4` | Replaced by the code-drawn sky, light motes and teal curtain; nothing loads them |
| `atlases/leather-money-shreds.ktx2`, `textures/stage3_money-hand.webp` | Stage 3 burns our own pages of study notes (drawn in code), not money |
| `atlases/board-certificates.ktx2` | Stage 3 draws its own sharp chalkboard (the mastery update, review schedule, prerequisite graph) |
| `models/tunnel_new_new.glb` | Its twisted, lobed profile filled the view; the tunnel is our own tube and shader |
| `textures/matcap-certificate.webp`, `textures/origami_certificate.webp` | Belong to the diploma scene |
| `ui/*` | Our HUD is drawn in CSS/SVG |
| `_zero-vendor/**` | Their copy of the decoders. The Draco files are byte-identical to three.js's own `libs/draco/gltf/`; `public/vendor/` holds three's copies |
