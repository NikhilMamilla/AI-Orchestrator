import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

// The landing experience can preview third-party placeholder assets while it is being built. They live outside public/
// (Vite copies all of public/ into every build), are gitignored, and the dev server serves them. A production build
// includes them only when VITE_PLACEHOLDERS=ship (set on the hosted site); then only the file types the story loads are
// copied, never fonts, logos, brand files, company videos, the world map or the texts atlas. See ASSET-TODO.md.
const SHIP = process.env.VITE_PLACEHOLDERS === 'ship'
const NEVER = /^(fonts|logos|brand)\/|Card\.mp4$|PPSupply|STKBureau|Bethany|world\.ktx2$|texts\.ktx2$/
const PLACEHOLDER_DIR = resolve(__dirname, 'placeholder-assets')
const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
}

function devPlaceholders(): Plugin {
  return {
    name: 'kiddoo-dev-placeholders',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/placeholder-assets', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0])
        const file = resolve(PLACEHOLDER_DIR, '.' + rel)
        const type = TYPES[extname(file).toLowerCase()]
        if (!type || !file.startsWith(PLACEHOLDER_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },
  }
}

function shipPlaceholders(): Plugin {
  let outDir = 'dist'
  return {
    name: 'kiddoo-ship-placeholders',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir) },
    closeBundle() {
      if (!SHIP || !existsSync(PLACEHOLDER_DIR)) return
      const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
        const p = join(d, f)
        return statSync(p).isDirectory() ? walk(p) : [p]
      })
      let n = 0
      for (const file of walk(PLACEHOLDER_DIR)) {
        const rel = relative(PLACEHOLDER_DIR, file).split(sep).join('/')
        if (!TYPES[extname(file).toLowerCase()] || NEVER.test(rel)) continue
        const dest = join(outDir, 'placeholder-assets', rel)
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(file, dest)
        n++
      }
      console.log(`kiddoo: shipped ${n} story asset files (VITE_PLACEHOLDERS=ship)`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devPlaceholders(), shipPlaceholders()],
  // the landing city reads curriculum/dsa_roadmap.md directly (one source of truth for the 22 domains)
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(__dirname, '../../curriculum')] } },
})
