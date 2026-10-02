import { useEffect, useRef } from 'react'
import { anno } from '@/core/anno'
import { ciclo } from '@/core/ciclo'
import { C } from '@/core/colori'
import { campana, caso, tra } from '@/core/math'
import { misure } from '@/core/misure'
import { preferenze, usePreferenze } from '@/core/preferenze'
import { sigmaDaP } from '@/core/tempo'

/*
 * Atmosfera della stagione: poche particelle su un canvas a metà risoluzione, davanti alla scena,
 * solo nelle fasi in cui servono: brina d'inverno (riposo, fine anno), polline in fioritura,
 * foglie che cadono in autunno. In tutto al massimo 60 su desktop e 25 sul telefono.
 * Girano nel ciclo unico (core/ciclo.ts) e solo finché ce n'è almeno una: nel resto dell'anno
 * il ciclo si ferma. Si fermano con prefers-reduced-motion e quando il banco è aperto.
 */

type Tipo = 'brina' | 'polline' | 'foglia'
type P = { x: number; y: number; vx: number; vy: number; s: number; f: number; a: number; c: number }

/** al massimo, in tutto: 60 su desktop, 25 sul telefono */
const MASSIMO: [number, number] = [60, 25]
const BUDGET: Record<Tipo, [number, number]> = {
  brina: [40, 16],
  polline: [40, 16],
  foglia: [10, 5],
}
const pesi = (p: number): Record<Tipo, number> => ({
  brina: Math.max(1 - tra(p, 0.1, 0.2), tra(p, 0.9, 0.98)),
  polline: campana(p, 0.38, 0.48),
  foglia: campana(p, 0.8, 0.97),
})
/** velocità con cui ogni tipo segue lo scorrimento della scena (profondità) */
const PROFONDITA: Record<Tipo, number> = { brina: 1, polline: 0.45, foglia: 1.25 }
const FOGLIA = new Path2D('M0 -1 L0.3 -0.5 L0.9 -0.6 L0.65 -0.08 L1 0.3 L0.4 0.4 L0.25 0.9 L0 0.55 L-0.25 0.9 L-0.4 0.4 L-1 0.3 L-0.65 -0.08 L-0.9 -0.6 L-0.3 -0.5 Z')

export function Particelle() {
  const tela = useRef<HTMLCanvasElement>(null)
  const { ridotto } = usePreferenze()

  useEffect(() => {
    const cv = tela.current
    if (!cv || ridotto) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const r = caso(77)
    const pool: Record<Tipo, P[]> = { brina: [], polline: [], foglia: [] }
    const coloriFoglia = [C.ambra, C.vinaccia, C.oro]
    let W = 0, H = 0, dpr = 0.5, ultimoSigma = sigmaDaP(anno.get()), ultimo = performance.now(), vuoto = false

    const dimensiona = () => {
      W = misure.vw
      H = misure.H
      dpr = 0.5 // metà risoluzione: particelle morbide, un quarto dei pixel da disegnare
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
    }
    const nuova = (t: Tipo, ovunque: boolean): P => {
      const p: P = { x: r() * W, y: r() * H, vx: 0, vy: 0, s: 1, f: r() * Math.PI * 2, a: 0, c: Math.floor(r() * 4) }
      switch (t) {
        case 'brina': p.y = H * (0.8 + r() * 0.17); p.s = 0.8 + r() * 1.4; break
        case 'polline': p.y = H * (0.15 + r() * 0.7); p.vx = 5 + r() * 10; p.vy = (r() - 0.5) * 4; p.s = 0.8 + r() * 1.5; break
        case 'foglia': p.x = ovunque ? r() * W : r() * W * 1.2 - W * 0.1; p.y = ovunque ? r() * H : -30; p.vx = 14 + r() * 26; p.vy = 38 + r() * 34; p.s = 9 + r() * 10; break
      }
      p.c = Math.floor(r() * 3)
      return p
    }

    /** un fotogramma; restituisce true se ci sono particelle da muovere (il ciclo resta sveglio) */
    const giro = (ora: number) => {
      if (document.hidden || document.documentElement.classList.contains('banco-aperto')) return false
      if (W !== misure.vw || H !== misure.H) dimensiona()
      const dt = Math.min(0.05, (ora - ultimo) / 1000)
      ultimo = ora
      const p = anno.get()
      const sigma = sigmaDaP(p)
      const dSig = (sigma - ultimoSigma) * W
      ultimoSigma = sigma
      const w = pesi(p)
      const stretto = W < 760
      let totale = 0
      const voluti = (Object.keys(pool) as Tipo[]).reduce((a, t) => a + BUDGET[t][stretto ? 1 : 0] * w[t], 0)
      const riduci = Math.min(1, MASSIMO[stretto ? 1 : 0] / Math.max(1, voluti))
      for (const t of Object.keys(pool) as Tipo[]) {
        const bersaglio = Math.round(BUDGET[t][stretto ? 1 : 0] * w[t] * riduci)
        const lista = pool[t]
        while (lista.length < bersaglio) lista.push(nuova(t, true))
        if (lista.length > bersaglio) lista.length = bersaglio
        totale += lista.length
      }
      if (totale === 0) {
        if (!vuoto) ctx.clearRect(0, 0, cv.width, cv.height)
        vuoto = true
        return false
      }
      vuoto = false
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const s = ora / 1000
      for (const t of Object.keys(pool) as Tipo[]) {
        const lista = pool[t]
        if (!lista.length) continue
        const scorre = dSig * PROFONDITA[t] * (preferenze.get().parallasse ? 1 : 0.6)
        for (let i = 0; i < lista.length; i++) {
          const q = lista[i]
          q.x -= scorre
          if (q.x < -40) q.x += W + 80
          else if (q.x > W + 40) q.x -= W + 80
          switch (t) {
            case 'brina': {
              const tw = Math.pow(Math.max(0, Math.sin(s * 1.6 + q.f)), 10)
              ctx.globalAlpha = 0.15 + 0.85 * tw * w.brina
              ctx.fillStyle = C.avorio
              ctx.fillRect(q.x - q.s * 1.6, q.y - 0.4, q.s * 3.2, 0.8)
              ctx.fillRect(q.x - 0.4, q.y - q.s * 1.6, 0.8, q.s * 3.2)
              break
            }
            case 'polline': {
              q.x += (q.vx + Math.sin(s * 0.7 + q.f) * 6) * dt
              q.y += (q.vy + Math.cos(s * 0.9 + q.f) * 5) * dt
              if (q.y < H * 0.1 || q.y > H * 0.9) q.vy = -q.vy
              ctx.globalAlpha = (0.35 + 0.35 * Math.sin(s + q.f)) * w.polline
              ctx.fillStyle = C.oro
              ctx.beginPath()
              ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2)
              ctx.fill()
              break
            }
            case 'foglia': {
              q.x += (q.vx + Math.sin(s * 1.2 + q.f) * 22) * dt
              q.y += q.vy * dt
              if (q.y > H + 30 || q.x > W + 40) Object.assign(q, nuova('foglia', false))
              const ang = Math.sin(s * 1.6 + q.f) * 1.1 + q.f
              const schiaccia = 0.35 + 0.65 * Math.abs(Math.cos(s * 2.1 + q.f)) // la foglia gira su sé stessa
              ctx.save()
              ctx.translate(q.x, q.y)
              ctx.rotate(ang)
              ctx.scale(q.s * schiaccia, q.s)
              ctx.globalAlpha = 0.85 * w.foglia
              ctx.fillStyle = coloriFoglia[q.c]
              ctx.fill(FOGLIA)
              ctx.restore()
              break
            }
          }
        }
      }
      ctx.globalAlpha = 1
      return true
    }
    dimensiona()
    const stacca = ciclo.aggiungi(giro)
    // quando lo scroll porta in una fase con particelle, il ciclo riparte
    const sveglia = anno.subscribe(() => ciclo.aggiungi(giro))
    return () => {
      stacca()
      sveglia()
      ctx.clearRect(0, 0, cv.width, cv.height)
    }
  }, [ridotto])

  return <canvas ref={tela} className="particelle" aria-hidden="true" />
}
