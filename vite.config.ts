import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const radice = path.dirname(fileURLToPath(import.meta.url))

/**
 * I momenti film: ogni cartella public/film/<id>/ con un manifest.json è un momento.
 * Per aggiungerne uno basta aggiungere la cartella; l'elenco arriva al sito come `virtual:film`.
 */
function momentiFilm(): Plugin {
  const ID = 'virtual:film'
  const dir = path.resolve(radice, 'public/film')
  const leggi = () =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((d) => fs.existsSync(path.join(dir, d, 'manifest.json')))
          .sort()
          .map((d) => ({ ...JSON.parse(fs.readFileSync(path.join(dir, d, 'manifest.json'), 'utf8')), cartella: `film/${d}/` }))
      : []
  return {
    name: 'momenti-film',
    resolveId: (id) => (id === ID ? '\0' + ID : undefined),
    load: (id) => (id === '\0' + ID ? `export default ${JSON.stringify(leggi())}` : undefined),
    configureServer(server) {
      server.watcher.add(dir)
      const ricarica = (f: string) => {
        if (!f.startsWith(dir) || !f.endsWith('manifest.json')) return
        const m = server.moduleGraph.getModuleById('\0' + ID)
        if (m) server.moduleGraph.invalidateModule(m)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', ricarica)
      server.watcher.on('change', ricarica)
      server.watcher.on('unlink', ricarica)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), momentiFilm()],
  resolve: {
    alias: { '@': path.resolve(radice, './src') },
  },
  server: { host: true },
  build: {
    // three da solo pesa ~525 kB: è l'unico file oltre i 500 e non si divide oltre
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        // le librerie in file a parte: cambiano di rado e restano nella cache tra un rilascio e l'altro
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/')) return 'three'
          if (id.includes('/gsap/') || id.includes('/lenis/')) return 'moto'
          if (id.includes('/react') || id.includes('/scheduler/')) return 'react'
        },
      },
    },
  },
})
