/*
 * Genera le anteprime dei pannelli dello spazio (public/anteprime/fasi/NN/):
 *   fermo.webp  512 × 683, la fase al suo inizio (o il primo fotogramma della clip);
 *   ciclo.webp  atlante 4 × 3 di 12 fotogrammi lungo la fase (la crescita della tavola o la clip),
 *               per il ciclo vivo del pannello centrale.
 * Uso: con il sito in esecuzione (npm run dev), `npm run anteprime [-- http://localhost:5180/]`.
 * La tavola si fotografa in modalità ?anteprima (src/Anteprima.tsx) a 1440 × 900, ritagliata in
 * 3:4 attorno alla pianta (dove la mette la regia: 56% della larghezza).
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:5180/').replace(/\/?$/, '/')
const radice = path.resolve(import.meta.dirname, '..')
const fasi = JSON.parse(fs.readFileSync(path.join(radice, 'src/data/fasi.json'), 'utf8'))
const dirFilm = path.join(radice, 'public/film')
const film = fs.existsSync(dirFilm)
  ? fs.readdirSync(dirFilm).filter((d) => fs.existsSync(path.join(dirFilm, d, 'manifest.json'))).map((d) => ({ ...JSON.parse(fs.readFileSync(path.join(dirFilm, d, 'manifest.json'), 'utf8')), cartella: `film/${d}/` }))
  : []

const W = 1440, H = 900
const CW = 512, CH = 683, COL = 4, RIG = 3, N = COL * RIG
const ritaglio = { x: Math.round(0.56 * W - (H * 0.75) / 2), y: 0, width: Math.round(H * 0.75), height: H }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const pagina = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await pagina.goto(`${BASE}?anteprima&p=0`, { waitUntil: 'networkidle' })
await pagina.addStyleTag({ content: '.vite-note{display:none!important}' })
await pagina.evaluate(() => document.fonts.ready)
// la pagina che compone e codifica le immagini (stessa origine: niente canvas contaminati)
const banco = await browser.newPage()
await banco.goto(`${BASE}?anteprima`, { waitUntil: 'domcontentloaded' })

async function scatta(p) {
  await pagina.evaluate((q) => window.__imposta(q), p)
  await pagina.waitForTimeout(420) // crescita temperata (100 ms) + riallineamento della camera (160 ms)
  const buf = await pagina.screenshot({ clip: ritaglio, omitBackground: true, type: 'png' })
  return `data:image/png;base64,${buf.toString('base64')}`
}

/** Compone le immagini (data URL o percorsi del sito, con ritaglio opzionale) in una griglia webp. */
async function componi(sorgenti, col, rig) {
  const url = await banco.evaluate(
    async ({ sorgenti, CW, CH, col, rig }) => {
      const c = document.createElement('canvas')
      c.width = CW * col
      c.height = CH * rig
      const ctx = c.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      for (let i = 0; i < sorgenti.length; i++) {
        const s = sorgenti[i]
        const im = new Image()
        im.src = s.src
        await im.decode()
        const r = s.taglio ?? { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight }
        ctx.drawImage(im, r.x, r.y, r.w, r.h, (i % col) * CW, Math.floor(i / col) * CH, CW, CH)
      }
      return c.toDataURL('image/webp', 0.86)
    },
    { sorgenti, CW, CH, col, rig },
  )
  return Buffer.from(url.split(',')[1], 'base64')
}

for (const [i, f] of fasi.entries()) {
  const nn = String(i + 1).padStart(2, '0')
  const dir = path.join(radice, 'public/anteprime/fasi', nn)
  fs.mkdirSync(dir, { recursive: true })
  const m = film.find((x) => x.fase === f.numero)
  let fotogrammi
  if (m) {
    // la clip: primo fotogramma e 12 fotogrammi lungo la clip, ritagliati in 3:4 sul soggetto
    const { larghezza: IW, altezza: IH, numero, percorso, cifre } = m.fotogrammi
    const tw = IH * 0.75
    const tx = Math.max(0, Math.min(IW - tw, m.inquadratura.fuoco[0] * IW - tw / 2))
    const taglio = { x: tx, y: 0, w: tw, h: IH }
    const src = (k) => `${BASE}${m.cartella}${percorso.replace('{n}', String(k).padStart(cifre, '0'))}`
    fotogrammi = Array.from({ length: N }, (_, k) => ({ src: src(Math.round((k / (N - 1)) * (numero - 1))), taglio }))
  } else {
    const span = f.fine - f.inizio
    fotogrammi = []
    for (let k = 0; k < N; k++) fotogrammi.push({ src: await scatta(f.inizio + 0.0005 + (k / (N - 1)) * span * 0.97) })
  }
  fs.writeFileSync(path.join(dir, 'fermo.webp'), await componi([fotogrammi[0]], 1, 1))
  fs.writeFileSync(path.join(dir, 'ciclo.webp'), await componi(fotogrammi, COL, RIG))
  console.log(`${nn} ${f.titolo}${m ? ' (clip)' : ''}`)
}
await browser.close()
