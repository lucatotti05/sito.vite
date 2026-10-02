import { C, chiaro, scuro } from '@/core/colori'
import { useMemo, useRef } from 'react'
import { useAnnoFotogramma } from '@/core/anno'
import { caso, easeInOut, lerp, mixHex, tra } from '@/core/math'
import { preferenze } from '@/core/preferenze'
import { tFase } from '@/core/tempo'
import {
  ACINI, ACINO_C, PUNTO_NERVATURE, RAGGIO_ACINO, SUOLO_Y, acinoA, antera,
  baseStame, cade, coloreInvaiatura, fasiFiore, lobiFoglia, traiettoria, type Caduta, type Pt,
} from './forme'

/*
 * Decori e marcatori di ogni fase. I decori si aggiornano da soli a ogni fotogramma leggendo il
 * progresso della loro fase; con movimento ridotto mostrano lo stato finale.
 */

const tDi = (p: number, i: number) => (preferenze.get().ridotto ? 1 : tFase(p, i))
const rad = (a: number) => (a * Math.PI) / 180

// ── marcatori (disegnati nell'origine; posizione, rotazione e scala le dà il nodo) ──
export function Gemma() {
  return (
    <>
      <path d="M-7 4 C-8 -4 -3 -12 0 -15 C3 -12 8 -4 7 4 Z" className="m-gemma" />
      <path d="M-4 2 C-4 -4 -1 -9 0 -11 M4 2 C4 -4 1 -9 0 -11" className="m-perule" />
    </>
  )
}
export function Goccia() {
  return (
    <>
      <path d="M0 -13 C4 -6 8 -1 8 4 A8 8 0 0 1 -8 4 C-8 -1 -4 -6 0 -13 Z" className="m-goccia" />
      <path d="M-3.5 2 A4 4 0 0 1 -1 -3" className="m-riflesso" />
    </>
  )
}
export function Bocciolo() {
  return (
    <>
      <g className="m-foglioline">
        <path d="M0 -10 C-10 -14 -15 -8 -14 -3 C-8 -3 -3 -6 0 -10 Z" />
        <path d="M0 -10 C10 -14 15 -8 14 -3 C8 -3 3 -6 0 -10 Z" />
      </g>
      <path d="M0 -15 C-3 -10 -3 -6 0 -4 C3 -6 3 -10 0 -15 Z" className="m-punta" />
      <path d="M-7 4 C-8 -3 -4 -9 0 -10 C4 -9 8 -3 7 4 Z" className="m-gemma" />
      <path d="M-3 2 C-3 -3 -1 -6 0 -7 M3 2 C3 -3 1 -6 0 -7" className="m-perule" />
    </>
  )
}
export function Punta() {
  return <circle r="6.5" className="m-punta-lobo" />
}
export function Antera() {
  return (
    <>
      <ellipse rx="10" ry="6.5" className="m-antera" />
      <path d="M-7 0 Q0 -3 7 0" className="m-solco" />
    </>
  )
}
export function Acino() {
  return (
    <>
      <circle r={RAGGIO_ACINO} className="m-acino" />
      <ellipse cx="-4" cy="-4.5" rx="3.5" ry="2.4" className="m-acino-luce" />
    </>
  )
}
export function Stazione() {
  return (
    <>
      <circle r="9" className="m-stazione" />
      <circle r="3.5" className="m-stazione-cuore" />
    </>
  )
}
export function FogliaSecca() {
  return <path d="M0 -12 L4 -6 L11 -7 L8 -1 L13 4 L5 5 L3 11 L0 7 L-3 11 L-5 5 L-13 4 L-8 -1 L-11 -7 L-4 -6 Z" className="m-foglia-secca" />
}

// ── 01 legno: anello di legno vecchio, disco del taglio, sezione del tralcio ──
export function DecoroLegno() {
  const arco = (r: number, a0: number, a1: number) => {
    const p = (a: number) => `${(200 + r * Math.cos(rad(a))).toFixed(1)} ${(200 + r * Math.sin(rad(a))).toFixed(1)}`
    return `M${p(a0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`
  }
  const base: Pt = [200 + 132 * Math.cos(rad(118)), 200 + 132 * Math.sin(rad(118))]
  return (
    <g>
      <path d={arco(78, 196, 384)} className="d-legno-vecchio" />
      <path d={Array.from({ length: 9 }, (_, i) => arco(78, 205 + i * 20, 214 + i * 20)).join(' ')} className="d-crepe" />
      <ellipse cx={base[0]} cy={base[1]} rx="5" ry="4.2" transform={`rotate(118 ${base[0]} ${base[1]})`} className="d-taglio" />
      <Sezione />
    </g>
  )
}
function Sezione() {
  return (
    <g>
      <circle cx="200" cy="200" r="40" className="d-corteccia" />
      <circle cx="200" cy="200" r="34" className="d-legno" />
      <path
        d={Array.from({ length: 22 }, (_, i) => {
          const a = rad((i / 22) * 360)
          return `M${(200 + 14 * Math.cos(a)).toFixed(1)} ${(200 + 14 * Math.sin(a)).toFixed(1)} L${(200 + 33 * Math.cos(a)).toFixed(1)} ${(200 + 33 * Math.sin(a)).toFixed(1)}`
        }).join(' ')}
        className="d-raggi"
      />
      <circle cx="200" cy="200" r="13" className="d-midollo" />
    </g>
  )
}

// ── 02 pianto: il taglio bagnato al centro, la goccia che si raccoglie in basso ──
export function DecoroPianto({ iFase }: { iFase: number }) {
  const goccia = useRef<SVGGElement>(null)
  useAnnoFotogramma((p) => {
    const t = tDi(p, iFase)
    const s = easeInOut(tra(t, 0.45, 0.95))
    goccia.current?.setAttribute('transform', `translate(200 ${330 + 12 * s}) scale(${(0.2 + 1.3 * s).toFixed(3)})`)
  })
  return (
    <g>
      <circle cx="200" cy="200" r="36" className="d-corteccia" />
      <circle cx="200" cy="200" r="30" className="d-legno" />
      <circle cx="200" cy="200" r="11" className="d-midollo" />
      <ellipse cx="190" cy="190" rx="13" ry="6" transform="rotate(-30 190 190)" className="d-bagnato" />
      <g ref={goccia}>
        <path d="M0 -10 C4 -4 8 0 8 5 A8 8 0 0 1 -8 5 C-8 0 -4 -4 0 -10 Z" className="m-goccia" />
      </g>
    </g>
  )
}

// ── 03 germogliamento: la terra da cui parte il germoglio ──
export function DecoroGermogliamento() {
  return <path d="M96 358 Q128 352 164 360" className="d-terra" />
}

// ── 04 foglia: nervature e picciolo ──
export function DecoroFoglia({ iFase }: { iFase: number }) {
  const vene = useRef<SVGPathElement>(null)
  useAnnoFotogramma((p) => {
    const t = tDi(p, iFase)
    const [j0, j1] = PUNTO_NERVATURE
    let d = ''
    for (const [x, y] of lobiFoglia(t)) {
      d += `M${j0} ${j1} L${x.toFixed(1)} ${y.toFixed(1)} `
      // due nervature secondarie per lobo
      for (const f of [0.4, 0.68]) {
        const mx = lerp(j0, x, f), my = lerp(j1, y, f)
        const a = Math.atan2(y - j1, x - j0)
        d += `M${mx.toFixed(1)} ${my.toFixed(1)} l${(Math.cos(a - 0.7) * 22).toFixed(1)} ${(Math.sin(a - 0.7) * 22).toFixed(1)} `
        d += `M${mx.toFixed(1)} ${my.toFixed(1)} l${(Math.cos(a + 0.7) * 22).toFixed(1)} ${(Math.sin(a + 0.7) * 22).toFixed(1)} `
      }
    }
    vene.current?.setAttribute('d', d)
  })
  return (
    <g>
      <path d={`M${PUNTO_NERVATURE[0]} ${PUNTO_NERVATURE[1]} C200 300 198 330 202 366`} className="d-picciolo" />
      <path ref={vene} className="d-vene" />
    </g>
  )
}

// ── 05 fiore: stami, ovario, pedicello, l'orbita che resta come ricordo ──
const SF = (x: number, y: number): Pt => [200 + (x - 200) * 1.14, 214 + (y - 214) * 1.14]
export function DecoroFiore({ iFase }: { iFase: number }) {
  const base = useRef<SVGGElement>(null)
  const fili = useRef<(SVGPathElement | null)[]>([])
  const ricordo = useRef<SVGEllipseElement>(null)
  useAnnoFotogramma((p) => {
    const t = tDi(p, iFase)
    const { m, c } = fasiFiore(t)
    base.current?.style.setProperty('opacity', tra(m, 0.14, 0.34).toFixed(3))
    ricordo.current?.style.setProperty('opacity', tra(m, 0.86, 1).toFixed(3))
    for (let i = 0; i < 5; i++) {
      const f = fili.current[i]
      if (!f) continue
      const { p: pos } = antera(i, t)
      const B = baseStame(i)
      const ctrl: Pt = [(B[0] + pos[0]) / 2 + (pos[0] - 200) * 0.18, Math.max(B[1], pos[1]) + 18 * c]
      f.setAttribute('d', `M${B[0].toFixed(1)} ${B[1].toFixed(1)} Q${ctrl[0].toFixed(1)} ${ctrl[1].toFixed(1)} ${pos[0].toFixed(1)} ${pos[1].toFixed(1)}`)
      f.style.opacity = c > 0 ? '1' : '0'
    }
  })
  const [ex, ey] = SF(200, 170)
  return (
    <g>
      <ellipse ref={ricordo} cx={ex} cy={ey} rx={134 * 1.14} ry={46 * 1.14} className="d-ricordo" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} ref={(e) => { fili.current[i] = e }} className="d-filamento" />)}
      <g ref={base} transform="translate(200 214) scale(1.14) translate(-200 -214)">
        <linearGradient id="fiore-pedicello" gradientUnits="userSpaceOnUse" x1="0" y1="262" x2="0" y2="326">
          <stop offset="0" className="d-pedicello-stop" />
          <stop offset="1" className="d-pedicello-stop" stopOpacity="0" />
        </linearGradient>
        <path d="M200 326 C199 304 203 284 200 262" className="d-pedicello" stroke="url(#fiore-pedicello)" />
        <path d="M184 262 C188 252 212 252 216 262 C212 270 188 270 184 262 Z" className="d-ricettacolo" />
        {[-14, -7, 0, 7, 14].map((x) => <ellipse key={x} cx={200 + x} cy={254} rx="3.4" ry="2.4" className="d-nettario" />)}
        <path d="M184 252 C182 226 192 206 200 204 C208 206 218 226 216 252 Z" className="d-ovario" />
        <path d="M196 206 C196 198 204 198 204 206" className="d-stilo" />
        <ellipse cx="200" cy="198" rx="7" ry="3.4" className="d-stimma" />
      </g>
    </g>
  )
}

// ── 06–07 grappolo: raspo e acini ──
export function DecoroGrappolo({ iFase, fase }: { iFase: number; fase: 6 | 7 }) {
  const acini = useRef<(SVGCircleElement | null)[]>([])
  const raspo = useRef<SVGPathElement>(null)
  const ultimo = useRef(-1)
  useAnnoFotogramma((p) => {
    // si riscrive solo quando il grappolo cambia in modo visibile (1/150 della fase), non a ogni pixel di scroll
    const t = Math.round(tDi(p, iFase) * 150) / 150
    if (t === ultimo.current) return
    ultimo.current = t
    let d = ''
    ACINI.forEach((a, j) => {
      const { p: q, r } = acinoA(j, t, fase)
      const c = acini.current[j]
      if (c) {
        c.setAttribute('cx', q[0].toFixed(1))
        c.setAttribute('cy', q[1].toFixed(1))
        c.setAttribute('r', r.toFixed(2))
        c.style.fill = fase === 7 ? coloreAcino(coloreInvaiatura(a.soglia, t)) : C.verde
      }
      d += `M200 ${(q[1] - 16).toFixed(1)} Q${((200 + q[0]) / 2).toFixed(1)} ${(q[1] - 14).toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)} `
    })
    raspo.current?.setAttribute('d', `M200 40 L200 ${(acinoA(ACINI.length - 1, t, fase).p[1]).toFixed(1)} ` + d)
  })
  return (
    <g>
      <path ref={raspo} className="d-raspo" />
      {ACINI.map((_, j) => <circle key={j} ref={(e) => { acini.current[j] = e }} className="d-acino" />)}
    </g>
  )
}
export const coloreAcino = (v: number) =>
  v < 0.5 ? mixHex(C.verde, chiaro(C.vinaccia, 0.15), v * 2) : mixHex(chiaro(C.vinaccia, 0.15), scuro(C.vinaccia, 0.45), (v - 0.5) * 2)

// ── 08 maturazione: buccia con pruina, polpa, vinaccioli, pennello ──
export function DecoroMaturazione() {
  const [cx, cy] = ACINO_C
  const semi: [number, number, number][] = [[224, 236, 28], [178, 222, -24], [204, 186, 160]]
  return (
    <g>
      <path d={`M${cx} ${cy - 126} L${cx} ${cy - 160}`} className="d-pedicello-acino" />
      <path d={`M${cx} ${cy - 122} C${cx - 4} ${cy - 80} ${cx + 4} ${cy - 50} ${cx} ${cy - 20}`} className="d-pennello" />
      <path
        d={Array.from({ length: 14 }, (_, i) => {
          const a = rad((i / 14) * 360)
          return `M${(cx + 40 * Math.cos(a)).toFixed(1)} ${(cy + 40 * Math.sin(a)).toFixed(1)} L${(cx + 100 * Math.cos(a)).toFixed(1)} ${(cy + 104 * Math.sin(a)).toFixed(1)}`
        }).join(' ')}
        className="d-vasi"
      />
      {semi.map(([x, y, a], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
          <path d="M0 -17 C7 -14 10 0 8 7 C6 13 -6 13 -8 7 C-10 0 -7 -14 0 -17 Z" className="d-seme" />
          <path d="M-3 -9 C-1 -5 -1 2 -2 6" className="d-seme-luce" />
        </g>
      ))}
      <path d={`M${cx - 92} ${cy - 62} A114 118 0 0 1 ${cx - 20} ${cy - 116}`} className="d-pruina" />
    </g>
  )
}

// ── 09 vendemmia: il grappolo si svuota, gli acini cadono nella cassetta ──
const NV = 18
export function DecoroVendemmia({ iFase }: { iFase: number }) {
  const acini = useRef<(SVGCircleElement | null)[]>([])
  const dati = useMemo(() => {
    const r = caso(909)
    const c0 = traiettoria(0)
    return Array.from({ length: NV }, (_, j) => {
      const fila = Math.floor(Math.sqrt(j * 2))
      const da: Pt = [c0[0] + (r() - 0.5) * (14 + fila * 9), c0[1] + 10 + fila * 11 + r() * 4]
      const a: Pt = [282 + (j % 6) * 12 - 30 + (r() - 0.5) * 4, 300 - Math.floor(j / 6) * 9 + (r() - 0.5) * 3]
      return { da, a, quando: 0.14 + j * 0.032 + r() * 0.02 }
    })
  }, [])
  useAnnoFotogramma((p) => {
    const t = tDi(p, iFase)
    const c0 = traiettoria(0), c1 = traiettoria(1)
    dati.forEach((d, j) => {
      const u = easeInOut(tra(t, d.quando, d.quando + 0.2))
      const c = traiettoria(u)
      const x = c[0] + (d.da[0] - c0[0]) * (1 - u) + (d.a[0] - c1[0]) * u
      const y = c[1] + (d.da[1] - c0[1]) * (1 - u) + (d.a[1] - c1[1]) * u
      const el = acini.current[j]
      if (el) {
        el.setAttribute('cx', x.toFixed(1))
        el.setAttribute('cy', y.toFixed(1))
      }
    })
  })
  const c0 = traiettoria(0)
  return (
    <g>
      <path d={`M40 ${c0[1] - 26} C120 ${c0[1] - 34} 220 ${c0[1] - 30} 330 ${c0[1] - 40}`} className="d-tralcio" />
      <path d={`M${c0[0]} ${c0[1] - 30} L${c0[0]} ${c0[1] + 6} M${c0[0]} ${c0[1] + 6} l-9 22 M${c0[0]} ${c0[1] + 6} l8 26 M${c0[0]} ${c0[1] + 14} l-14 30 M${c0[0]} ${c0[1] + 16} l14 36`} className="d-raspo" />
      {dati.map((_, j) => <circle key={j} r="6.2" ref={(e) => { acini.current[j] = e }} className="d-acino d-acino-maturo" />)}
      <g className="d-cassetta">
        <path d="M206 304 H358 L350 352 H214 Z" />
        <path d="M210 320 H354 M212 336 H352" className="d-doghe" />
      </g>
    </g>
  )
}

// ── 10 caduta: il tralcio spoglio in alto, altre foglie che cadono, la terra ──
const ALTRE: Caduta[] = [
  { x0: 70, y0: 30, x1: 96, da: 0.04, giro: -1 },
  { x0: 160, y0: 40, x1: 132, da: 0.2, giro: 1 },
  { x0: 252, y0: 46, x1: 262, da: 0.34, giro: -1 },
  { x0: 340, y0: 34, x1: 300, da: 0.5, giro: 1 },
  { x0: 186, y0: 24, x1: 160, da: 0.56, giro: -1 },
]
export function DecoroCaduta({ iFase }: { iFase: number }) {
  const foglie = useRef<(SVGGElement | null)[]>([])
  const ultimo = useRef(-1)
  useAnnoFotogramma((p) => {
    const t = Math.round(tDi(p, iFase) * 240) / 240
    if (t === ultimo.current) return
    ultimo.current = t
    ALTRE.forEach((c, j) => {
      const { p: q, ang } = cade(c, t)
      foglie.current[j]?.setAttribute('transform', `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(1.15)`)
    })
  })
  let zolle = ''
  for (let x = -20; x < 420; x += 14) zolle += `M${x} ${SUOLO_Y + 14 + (x % 3) * 4} l8 0 `
  return (
    <g>
      <path d="M20 22 C120 14 260 18 380 10" className="d-tralcio" />
      <path d={zolle} className="d-zolle" />
      {ALTRE.map((_, j) => (
        <g key={j} ref={(e) => { foglie.current[j] = e }} className={`d-foglia d-foglia-${j % 3}`}>
          <FogliaSecca />
        </g>
      ))}
    </g>
  )
}
