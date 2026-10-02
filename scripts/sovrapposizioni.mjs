/*
 * Controllo delle sovrapposizioni tra testi: per ogni fase, a inizio, metà e fine, e a più misure
 * di finestra, misura i riquadri dei testi visibili e segnala quelli che si toccano.
 * Uso: con il sito acceso (npm run dev -- --port 5180), `node scripts/sovrapposizioni.mjs`.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5180/'
// MISURE=1440x900,390x844 e FASI=5,10 per controllare solo una parte
const MISURE = process.env.MISURE ? process.env.MISURE.split(',').map((m) => m.split('x').map(Number)) : [[1440, 900], [1056, 660], [1280, 720], [390, 844], [375, 667]]
const FASI = process.env.FASI ? process.env.FASI.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const MOMENTI = [0.04, 0.5, 0.86, 0.99]
const SEL = [
  '.titolo.attivo .titolo-righe', '.titolo.attivo .titolo-corpo p:not(.sr-only)', '.finale.su .titolo-righe', '.finale.su .finale-testo',
  '.finale.su .finale-ricomincia', '.nodo-posto.aperto .nodo-etichetta', '.nodo-posto.aperto .nodo-invito', '.calendario', '.angolo',
  '.striscia.su .striscia-n', '.film-nota.on text', '.film-sottotitolo.on', '.indicatore', '.registro.su', '.scheda',
]

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let totale = 0
for (const [w, h] of MISURE) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  for (const f of FASI) {
    await p.goto(`${BASE}?fase=${f}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1500)
    for (const m of MOMENTI) {
      let urti = []
      try {
      await p.evaluate((m) => window.scrollTo(0, m * (document.documentElement.scrollHeight - innerHeight)), m)
      await p.waitForTimeout(1300)
      urti = await p.evaluate((SEL) => {
        const visibile = (el) => {
          for (let e = el; e && e !== document.body; e = e.parentElement) {
            const cs = getComputedStyle(e)
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false
          }
          return true
        }
        // il riquadro del solo testo (non del bottone con il suo margine invisibile); il calendario
        // è un oggetto di carta: vale tutto il foglio
        const riquadro = (el) => {
          // blocchi di testo e SVG: il riquadro delle righe; voci degli angoli: il solo testo
          if (!el.matches('.angolo')) return el.getBoundingClientRect()
          const rg = document.createRange()
          let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (!n.textContent.trim() || n.parentElement.closest('.sr-only, .rotola-riga + .rotola-riga')) continue
            rg.selectNodeContents(n)
            for (const q of rg.getClientRects()) {
              if (q.width < 1) continue
              l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom)
            }
          }
          return l === Infinity ? null : { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }
        }
        const voci = []
        SEL.forEach((s) => document.querySelectorAll(s).forEach((el) => {
          if (!visibile(el)) return
          const r = riquadro(el)
          if (!r || r.width < 2 || r.height < 2) return
          voci.push({ s, t: (el.textContent || '').trim().slice(0, 28), r })
        }))
        const out = []
        const fuori = []
        for (const v of voci) if (v.r.left < 22 || v.r.right > innerWidth - 22) fuori.push(`${v.t} (fuori margine)`)
        for (let i = 0; i < voci.length; i++)
          for (let j = i + 1; j < voci.length; j++) {
            const A = voci[i].r, B = voci[j].r
            if (A.right <= B.left + 1 || B.right <= A.left + 1 || A.bottom <= B.top + 1 || B.bottom <= A.top + 1) continue
            out.push(`«${voci[i].t}» ↔ «${voci[j].t}»`)
          }
        return [...out, ...fuori]
      }, SEL)
      } catch (e) {
        urti = [`(misura non riuscita: ${String(e.message).slice(0, 60)})`]
      }
      if (urti.length) {
        totale += urti.length
        console.log(`${w}×${h} fase ${f} @${m}: ${urti.join(' · ')}`)
      }
    }
  }
  await p.close()
}
console.log(totale ? `${totale} sovrapposizioni` : 'nessuna sovrapposizione')
await b.close()
