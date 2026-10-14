# Frontend

A static single-page app in `Production-Core/frontend`: React 19, TypeScript, Vite 7, Tailwind 3, react-router 7,
zustand, framer-motion, GSAP, three.js (landing story only), Recharts, Monaco and Firebase Auth. How it fits the rest
of the system is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Commands

```bash
cd Production-Core/frontend
npm run dev        # http://localhost:5173 (story placeholder assets on by default)
npm run lint
npm test           # 27 tests in 5 files (story rules and city data, algorithm recorders, concept map, markdown, reconnect rule)
npm run build      # tsc -b, vite build, then scripts/check-dist.mjs
```

Settings come from `frontend/.env.local` (template: `.env.example`): `VITE_API_URL`, `VITE_WS_URL`,
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. One more
switch exists for the landing story, `VITE_PLACEHOLDERS` (see [the story's assets](#assets-and-the-build-check)).

## Source layout

| Folder | What lives there |
|---|---|
| `src/pages/` | One file per screen: Landing, Login, Register, Dashboard, Ask, Learn, LearningSession, Challenges, Concepts, Visualizer, Playground, Insights, Journal, EvidenceLab, Settings, SharedView |
| `src/components/` | `ask/` (answer card, evidence panel, claim checks, stage tracker), `learn/` (placement, quiz, goal, plan, analyst, teach-back, sketch pad, share manager), `concepts/`, `dashboard/`, `session/`, `auth/`, `intro/` (opening), `landing/`, `fx/` (backdrop, motes, motion, theme toggle) |
| `src/admin/` | The admin console: a shell, a command palette, drawers and nine pages (overview, learners, content, quality, study, system, engagement, inspector, announcements) |
| `src/experience/` | The animated landing story |
| `src/lib/` | `api.ts` (axios, attaches the Firebase ID token), `firebase.ts`, `learning.ts`, `rag.ts` (SSE client), `theme.ts` (appearance), `algoSteps.ts` (visualiser recorders), `share.ts`, `speech.ts`, `experienceAssets.ts` |
| `src/store/` | `authStore.ts` (zustand over Firebase Auth: sign-in, Google, verification, reset, linking, delete) |
| `src/hooks/` | `useWebSocket`, `useAnnouncements`, `useIsAdmin`, `useDarkTheme` |
| `src/index.css` | The shared look (below) |

Routing is in `src/App.tsx`. Public: `/`, `/login`, `/register`, `/shared/:token`. Protected (`ProtectedRoute`):
`/dashboard`, `/ask`, `/learn`, `/challenges`, `/concepts`, `/visualize`, `/playground`, `/insights`, `/journal`, `/lab`,
`/settings`, `/session/:id`, `/home` (role-based redirect) and `/admin/*`. Pages fade between routes.

## The shared look

* **Skies.** Every page sits on one of the landing's "worlds" (`.world-sky`, `-clouds`, `-green`, `-insight`, …) in
  `index.css`, light by day and deep teal by night. `AppBackdrop` puts the sky, slowly swaying light rays and the motes
  behind every app page.
* **Light motes.** `components/fx/Motes.tsx` draws soft specks (a few warm gold) that rise slowly and fade at both ends.
  The landing hero, the sign-in pages and `AppBackdrop` all use it; phones show half of them, and app pages on phones show
  none. It replaced the earlier falling petals everywhere (the in-story 3D version is `stages/assets/motes.ts`).
* **Appearance preferences** (`lib/theme.ts`): theme (system / light / dark), text size, floating light, reduced motion
  and high contrast. They are stored per device for a flash-free first paint and synced to the server
  (`GET/PUT /learning/preferences`, `prefs.ui`) so they follow the learner. The *floating light* switch keeps its older
  internal name `petals` (`kiddoo-petals`, `data-petals`, `prefs.ui.petals`) so saved settings still apply.
* **Reduced motion** (the OS setting or *Settings → Appearance → Reduce motion*) stops the rays, motes and other decorative
  animation, and the landing story becomes five still cards.

## The landing story (`src/experience`, `src/components/intro`)

A fresh visit to `/` plays, once per page load (a module flag survives route changes), and never with reduced motion:

1. **Count** (`IntroExperience`): a giant `00` rolls to `26` (the concepts in the curriculum) while "Every concept. Every
   link. One path. Yours." types itself. Typography only.
2. **Loop → light**: a frost ring draws itself like a zero, closes and bursts outward over the same teal-blue sky that
   stage 1 uses; the burst turns to white light that opens straight into the story. Escape or Enter skips the count.
3. **The story** (`Experience.tsx` + `engine.ts`): one WebGL canvas, five stages, a HUD on top.

| # | Stage | Scene | Words (taken from the README and the PRD) |
|---|---|---|---|
| 1 | Every learner | The opening sky, drifting light motes, deep-teal type. *Tap & hold* to continue | Every learner is different. Yet courses teach everyone the same way: the same pages, the same pace, no matter what you already know |
| 2 | Confident, not right | Teal glass pane cracks and shatters; slabs of glass carry what Kiddoo does instead | Most AI tutors sound confident, even when they are wrong. Then the glass lines read on as one sentence: Kiddoo answers only from a curated knowledge base, cites every claim, checks each sentence, refuses, measures its confidence, says "I don't have enough evidence". Kiddoo shows its evidence |
| 3 | Wasted study | Pages of study notes burn; ash drifts to a navy chalkboard. *Tap & hold* to zoom in | Hours re-reading what you already know. Guessing what to study. Kiddoo measures what you know, so you only study what you don't |
| 4 | Five agents | A flight down a green tunnel through five gold gates, one per agent | The five agents and their roles from [LEARNING.md](LEARNING.md) |
| 5 | The DSA city | Descent through clouds into a city of the 22 roadmap domains joined by real prerequisite roads; browse by click, d-pad, arrow keys, drag, wheel | Meet Kiddoo: real sources, real practice, real progress; explore the 22 domains of DSA (built from `curriculum/dsa_roadmap.md` and `domains.ts`) |

Mechanics (`flow.ts`, `engine.ts`): scrolling is **virtual**. The page never scrolls; wheel, touch and keys move a target
in 0..1 for the current stage and the shown value eases after it. A hold gate stops the target until the ring has been
held for 1.5 s. Each stage is its own chunk, built behind the previous one and entered through a flash or a snapshot cut.
The XP counter (100 / 300 / 500) and a muted-by-default synthesised soundtrack (`sound.ts`, Web Audio) are part of the HUD.
The page under the story is not drawn (`data-story="on"`), and "Replay the story" brings it back.

Colour: stage 1 uses the opening sky, stage 2 deep teal, stage 3 deep navy, stage 4 emerald, stage 5 a clear blue sky
with white clouds. Light stages get dark HUD ink (`tone: 'light'` in `flow.ts`).

**QA hook.** Add `?expqa` to the URL and `window.__exp.seek(stage, p)` jumps to any stage and progress for frame-exact
review.

**Tests** (`experience.test.ts`, 15) cover three things: the flow rules (five beats in order, hold gates, hand-over, the
ruler, statement fades); the city's data (exactly the 22 roadmap domains in order, every concept document in exactly one
domain, tool chips only where the tool exists, roads only along real prerequisite links); and the asset manifest (no
brand files, logos, paid fonts, world or text atlases; every placeholder listed in `ASSET-TODO.md` with a replacement).

### Assets and the build check

Each stage has a version **drawn entirely in code** (shaders, canvas textures, procedural geometry). Some stages can
instead use third-party placeholder files kept in the git-ignored `frontend/placeholder-assets/`:

* in `npm run dev`: on by default (`VITE_PLACEHOLDERS=off` turns them off);
* in a normal `npm run build` and in CI: never. `scripts/check-dist.mjs` fails the build if a placeholder file, a paid
  font name or a `/placeholder-assets/` URL reaches `dist/`;
* on the hosted site: shipped by the owner's decision (2026-10-03) with `VITE_PLACEHOLDERS=ship`. Only the story's file
  types are copied. Some files are never used in any mode (logos, brand files, company videos, the world and text
  atlases, quote cards, diplomas, paid fonts), and the check still fails if one appears.

The full file list, what replaces each file and what is never used is in [../frontend/ASSET-TODO.md](../frontend/ASSET-TODO.md).
The garden image, the petal atlas and the curtain video are no longer used anywhere: stage 1's background is the opening
gradient, stage 2's backdrop is a procedural teal curtain.

## Deploying the frontend

Vercel builds the app (root `Production-Core/frontend`, `vercel.json` sets caching and security headers and the SPA
rewrite). Because the placeholder assets are not in git, **deploy from the maintainer's machine** with the Vercel CLI
(`npx vercel deploy --prod`), which uploads the local folder (`.vercelignore` lists what is never uploaded). Pushing to
GitHub alone does not update the hosted site. After a deploy, add the site's domain under Firebase → Authentication →
Authorised domains once.
