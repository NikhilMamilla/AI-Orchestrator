import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

// The landing experience can preview third-party placeholder assets while it is being built. They live outside public/
// (Vite copies all of public/ into every build), are gitignored, and are served by the dev server only: a production
// build can never contain them. See ASSET-TODO.md.
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devPlaceholders()],
  // the landing city reads curriculum/dsa_roadmap.md directly (one source of truth for the 22 domains)
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(__dirname, '../../curriculum')] } },
})
