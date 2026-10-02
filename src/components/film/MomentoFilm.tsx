import { useEffect, useRef, useState } from 'react'
import { anno } from '@/core/anno'
import { misure } from '@/core/misure'
import { usePreferenze } from '@/core/preferenze'
import { FASI, indiceFase } from '@/core/tempo'
import { daFotogramma, statoFilm } from './raccordo'
import { FILM, urlFotogramma, type Manifesto } from './registro'

/*
 * MOMENTO FILM: una clip a fotogrammi guidata dallo scroll, inserita all'ingresso di una fase.
 * Un solo canvas sopra la vite e sotto la grana e l'interfaccia: quegli strati
 * restano fermi e dicono all'occhio che l'inquadratura non è cambiata, è cambiata la materia.
 *
 * Ogni fotogramma, sul canvas:
 *   1. il fotogramma inquadrato (quadroClip, ridotto attorno al soggetto durante il raccordo);
 *   2. il fondo #15100c in "lighten": il nero della clip diventa esattamente il nero del sito;
 *   3. i bordi del fotogramma che cadono dentro lo schermo sfumano nel trasparente (sotto c'è la vite);
 *   4. la maschera radiale centrata sul soggetto ("destination-in").
 * L'opacità d'insieme (dissolvenza sulla gemma) è sullo stile del canvas: la fa il compositore.
 *
 * Caricamento: quando entra la fase precedente, prima un fotogramma ogni 8, poi tutti. In memoria
 * restano i file compressi; si decodifica solo una finestra attorno al fotogramma corrente.
 */

// il nero della clip coincide con --nero (DESIGN.md, "Film"): letto dal token, non scritto qui
const FONDO = getComputedStyle(document.documentElement).getPropertyValue('--nero').trim() || '#120d0a'
const [FR, FG, FB] = [1, 3, 5].map((i) => parseInt(FONDO.slice(i, i + 2), 16))
const fondoA = (a: number) => `rgba(${FR},${FG},${FB},${a})`
const FINESTRA = 8 // fotogrammi decodificati attorno al corrente (per lato)
const TIENI = 16 // oltre questa distanza le immagini decodificate si liberano

class Fotogrammi {
  private file: (Blob | null)[]
  private pronte = new Map<number, ImageBitmap>()
  private inCorso = new Set<number>()
  private avviato = false
  private m: Manifesto
  private stretto: boolean
  quandoPronta: () => void = () => {}

  constructor(m: Manifesto, stretto: boolean) {
    this.m = m
    this.stretto = stretto
    this.file = new Array(m.fotogrammi.numero).fill(null)
  }

  /** Scarica i file: prima a passo largo, poi completi. Mai all'avvio della pagina. */
  async carica() {
    if (this.avviato) return
    this.avviato = true
    const n = this.m.fotogrammi.numero
    // primo e ultimo subito (la clip si apre sull'uno e si richiude sull'altro), poi 1 ogni 8, poi tutti
    const ordine = [...new Set([0, n - 1, ...Array.from({ length: Math.ceil(n / 8) }, (_, i) => i * 8), ...Array.from({ length: n }, (_, i) => i)])]
    let k = 0
    const lavora = async () => {
      while (k < ordine.length) {
        const i = ordine[k++]
        try {
          const r = await fetch(urlFotogramma(this.m, i, this.stretto))
          if (r.ok) this.file[i] = await r.blob()
        } catch {
          /* un fotogramma mancante si sostituisce con il più vicino */
        }
        if (i === 0 || i === n - 1) this.decodifica(i)
      }
    }
    await Promise.all([lavora(), lavora(), lavora()])
  }

  private decodifica(i: number) {
    const b = this.file[i]
    if (!b || this.pronte.has(i) || this.inCorso.has(i)) return
    this.inCorso.add(i)
    createImageBitmap(b)
      .then((bm) => {
        this.pronte.set(i, bm)
        this.quandoPronta()
      })
      .catch(() => {})
      .finally(() => this.inCorso.delete(i))
  }

  /** Il fotogramma da mostrare per l'indice i: l'esatto se è pronto, altrimenti il più vicino pronto. */
  prendi(i: number): ImageBitmap | null {
    const n = this.m.fotogrammi.numero
    for (let d = 0; d <= FINESTRA; d++) {
      this.decodifica(Math.min(n - 1, i + d))
      this.decodifica(Math.max(0, i - d))
    }
    for (const [k, bm] of this.pronte)
      if (Math.abs(k - i) > TIENI && k !== 0 && k !== n - 1) {
        bm.close()
        this.pronte.delete(k)
      }
    if (this.pronte.has(i)) return this.pronte.get(i)!
    let meglio: ImageBitmap | null = null
    let dist = Infinity
    for (const [k, bm] of this.pronte)
      if (Math.abs(k - i) < dist) {
        dist = Math.abs(k - i)
        meglio = bm
      }
    return meglio
  }
}

function Momento({ m }: { m: Manifesto }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const note = useRef<SVGSVGElement>(null)
  const { ridotto } = usePreferenze()
  const [riga, setRiga] = useState(-1)
  const iFase = FASI.findIndex((f) => f.numero === m.fase)

  useEffect(() => {
    const c = tela.current
    const svg = note.current
    if (!c || !svg) return
    const ctx = c.getContext('2d', { alpha: true })
    if (!ctx) return
    const stretto = window.innerWidth < 760
    const fot = new Fotogrammi(m, stretto)
    let W = 0, H = 0, dpr = 1
    let disegnato = ''
    let visibile = false
    const gruppi = Array.from(svg.querySelectorAll<SVGGElement>('g.film-nota'))

    const misura = () => {
      dpr = Math.min(window.devicePixelRatio || 1, stretto ? 1.5 : 2)
      W = misure.vw
      H = misure.H
      c.width = Math.round(W * dpr)
      c.height = Math.round(H * dpr)
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
      disegnato = ''
    }

    const disegna = () => {
      const p = anno.get()
      // i fotogrammi arrivano quando la fase precedente entra in scena
      if (indiceFase(p) >= iFase - 1) fot.carica()
      if (W !== misure.vw || H !== misure.H) misura()
      const st = statoFilm(p, W, H)
      const attivo = !!st && st.m.id === m.id && st.alfa > 0.001
      if (!attivo) {
        if (visibile) {
          visibile = false
          c.style.visibility = 'hidden'
          c.style.opacity = '0'
          gruppi.forEach((g) => g.classList.remove('on'))
          document.documentElement.classList.remove('film-pieno')
          setRiga(-1)
        }
        return
      }
      if (!visibile) {
        visibile = true
        c.style.visibility = 'visible'
      }
      c.style.opacity = st.alfa.toFixed(3)
      // per tutta la clip (dalla dissolvenza sulla gemma a quella sul germoglio) nodo e carte fanno spazio
      const pieno = st.alfa > 0.5
      document.documentElement.classList.toggle('film-pieno', pieno)

      const i = Math.round(st.fotogramma)
      const img = fot.prendi(i)
      const { ox, oy, dw, dh } = st.quadro
      const { cx, cy, r } = st.maschera
      const firma = `${i}|${img ? 1 : 0}|${cx.toFixed(1)}|${cy.toFixed(1)}|${r.toFixed(1)}|${W}|${H}`
      if (firma !== disegnato) {
        disegnato = firma
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        ctx.clearRect(0, 0, W, H)
        if (img) {
          ctx.drawImage(img, ox, oy, dw, dh)
          // il nero della clip coincide con il fondo del sito (solo dentro il fotogramma)
          ctx.globalCompositeOperation = 'lighten'
          ctx.fillStyle = FONDO
          ctx.fillRect(ox, oy, dw, dh)
          ctx.globalCompositeOperation = 'source-over'
          // una vignettatura morbida verso il fondo, come quella del sito
          const v = ctx.createRadialGradient(cx, cy, Math.min(dw, dh) * 0.3, cx, cy, Math.hypot(dw, dh) * 0.62)
          v.addColorStop(0, fondoA(0))
          v.addColorStop(1, fondoA(0.55))
          ctx.fillStyle = v
          ctx.fillRect(ox, oy, dw, dh)
          // i bordi del fotogramma che cadono dentro lo schermo sfumano nel trasparente: sotto c'è
          // la vite (sfocata e scura), quindi nessun rettangolo e nessun alone di fondo
          ctx.globalCompositeOperation = 'destination-in'
          const sf = Math.min(dw, dh) * 0.16
          const sfuma = (x0: number, y0: number, x1: number, y1: number, inizio: boolean, fine: boolean) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1)
            const L = Math.hypot(x1 - x0, y1 - y0)
            const u = Math.min(0.45, sf / L)
            g.addColorStop(0, inizio ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)')
            g.addColorStop(u, 'rgba(0,0,0,1)')
            g.addColorStop(1 - u, 'rgba(0,0,0,1)')
            g.addColorStop(1, fine ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, W, H)
          }
          // un bordo sfuma solo se cade dentro lo schermo; a fotogramma coprente i bordi sono fuori
          // (la banda sfumata esce dallo schermo man mano che la clip cresce: nessun salto)
          const dentroX0 = ox > 0.5, dentroX1 = ox + dw < W - 0.5, dentroY0 = oy > 0.5, dentroY1 = oy + dh < H - 0.5
          if (dentroX0 || dentroX1) sfuma(ox, 0, ox + dw, 0, dentroX0, dentroX1)
          if (dentroY0 || dentroY1) sfuma(0, oy, 0, oy + dh, dentroY0, dentroY1)
          // maschera radiale sfumata sul soggetto
          if (r < Math.hypot(W, H) * 1.5) {
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.45)
            g.addColorStop(0, 'rgba(0,0,0,1)')
            g.addColorStop(1 / 1.45, 'rgba(0,0,0,1)')
            g.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, W, H)
          }
          ctx.globalCompositeOperation = 'source-over'
        }
      }

      // note ancorate alle coordinate del fotogramma: solo dentro la maschera e nel loro intervallo
      const k = Math.min(1, W / 1100)
      // nessun testo a meno di 24px dal bordo (DESIGN.md); su desktop le note restano fuori dalla colonna dei testi
      const sinistra = W < 760 ? 24 : W * 0.37
      let visibili = 0 // DESIGN.md: al massimo due annotazioni visibili insieme
      m.note.forEach((n, j) => {
        const g = gruppi[j]
        if (!g) return
        const [sx, sy] = daFotogramma(st.quadro, [n.x, n.y])
        const dentro = Math.hypot(sx - cx, sy - cy) < r * 0.85
        let dir = Math.sign(n.lx)
        const larg = n.testo.length * (W < 760 ? 6.3 : 7.4)
        let lx = sx + n.lx * k
        const ly = sy + n.ly * k
        if (dir < 0 && lx - 18 - larg < sinistra) {
          dir = 1
          lx = sx + Math.abs(n.lx) * k * 0.6
        }
        if (dir > 0 && lx + 18 + larg > W - 24) {
          dir = -1
          lx = sx - Math.abs(n.lx) * k * 0.6
        }
        // una nota che non sta né a destra né a sinistra (schermi stretti) non si mostra
        const sta = dir < 0 ? lx - 18 - larg >= Math.min(sinistra, 24) : lx + 18 + larg <= W - 24
        const on = st.t >= n.da && st.t <= n.a && dentro && st.alfa > 0.9 && st.scalaClip > 0.85 && sta && visibili < 2
        if (on) visibili++
        g.classList.toggle('on', on)
        if (!on && !g.classList.contains('posata')) return
        g.classList.add('posata')
        g.querySelector('circle')?.setAttribute('cx', sx.toFixed(1))
        g.querySelector('circle')?.setAttribute('cy', sy.toFixed(1))
        g.querySelector('path')?.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} L${lx.toFixed(1)} ${ly.toFixed(1)} L${(lx + dir * 12).toFixed(1)} ${ly.toFixed(1)}`)
        const tx = g.querySelector('text')
        if (tx) {
          tx.setAttribute('x', (lx + dir * 18).toFixed(1))
          tx.setAttribute('y', (ly + 5).toFixed(1))
          tx.setAttribute('text-anchor', dir < 0 ? 'end' : 'start')
        }
      })
      const pienoTesto = st.alfa > 0.9 && st.scalaClip > 0.7
      setRiga(pienoTesto ? m.sottotitoli.findIndex((s) => st.t >= s.da && st.t < s.a) : -1)
    }

    fot.quandoPronta = () => {
      disegnato = ''
      disegna()
    }
    misura()
    disegna()
    const stacca = anno.subscribe(disegna)
    window.addEventListener('resize', disegna)
    return () => {
      stacca()
      window.removeEventListener('resize', disegna)
      document.documentElement.classList.remove('film-pieno')
    }
  }, [m, iFase, ridotto])

  const testo = riga >= 0 ? m.sottotitoli[riga].testo : ''
  return (
    <div className="film" data-film={m.id}>
      <canvas ref={tela} className="film-tela" role="img" aria-label={m.descrizione} />
      <svg ref={note} className="film-note" aria-hidden="true">
        {m.note.map((n) => (
          <g key={n.testo} className="film-nota">
            <circle r="1.5" />
            <path />
            <text>{n.testo}</text>
          </g>
        ))}
      </svg>
      <p className={`film-sottotitolo t-introduzione${testo ? ' on' : ''}`} aria-live="polite" key={riga}>
        {testo}
      </p>
    </div>
  )
}

/** Tutti i momenti film dei manifest; ognuno si accende solo nel suo tratto di scroll. */
export function MomentiFilm() {
  return (
    <>
      {FILM.map((m) => (
        <Momento key={m.id} m={m} />
      ))}
    </>
  )
}
