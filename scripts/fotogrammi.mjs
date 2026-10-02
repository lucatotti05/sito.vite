/*
 * Da un video a un momento film: estrae i fotogrammi webp (1280 px e 640 px per il telefono)
 * in public/film/<id>/ e scrive un manifest di partenza da rifinire (soggetto, note, sottotitoli).
 * Uso: node scripts/fotogrammi.mjs <video> <id> <numero fase> [fotogrammi=124]
 * Richiede ffmpeg.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [video, id, fase, n = '124'] = process.argv.slice(2)
if (!video || !id || !fase) {
  console.error('uso: node scripts/fotogrammi.mjs <video> <id> <numero fase> [fotogrammi]')
  process.exit(1)
}
const radice = path.resolve(import.meta.dirname, '..')
const dir = path.join(radice, 'public/film', id)
const durata = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString())
const fps = Number(n) / durata
for (const [cartella, larghezza, qualita] of [['fotogrammi', 1280, 78], ['fotogrammi-telefono', 640, 74]]) {
  const out = path.join(dir, cartella)
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=${fps},scale=${larghezza}:-2:flags=lanczos`, '-frames:v', n, '-start_number', '0', '-c:v', 'libwebp', '-quality', String(qualita), path.join(out, '%03d.webp')])
}
const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(dir, 'fotogrammi', '000.webp')]).toString().trim().split(',').map(Number)
const conta = fs.readdirSync(path.join(dir, 'fotogrammi')).length
const mf = path.join(dir, 'manifest.json')
if (!fs.existsSync(mf)) {
  fs.writeFileSync(mf, JSON.stringify({
    id, fase: Number(fase), titolo: '', descrizione: '',
    fotogrammi: { percorso: 'fotogrammi/{n}.webp', mobile: 'fotogrammi-telefono/{n}.webp', cifre: 3, numero: conta, larghezza: w, altezza: h },
    inquadratura: { fuoco: [0.58, 0.42] },
    soggetto: {
      inizio: { base: [0.58, 0.6], punta: [0.58, 0.3], centro: [0.58, 0.45], raggio: 0.18 },
      fine: { base: [0.58, 0.6], punta: [0.58, 0.3], centro: [0.58, 0.45], raggio: 0.22 },
    },
    tavola: { inizio: '', fine: '' },
    anno: { quota: 0.5 }, luce: '#d6a265', note: [], sottotitoli: [],
  }, null, 2) + '\n')
}
console.log(`${conta} fotogrammi ${w}×${h} in public/film/${id}/`)
