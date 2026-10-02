import { memo, useMemo } from 'react'
import { usePratica } from '../nodo/luoghi'
import { caso, clamp, lerp, tra } from '@/core/math'
import {
  ASSE_GEMMA_RACCORDO, CAPO_VECCHIO, FILI, G, INTERNODO, S_GEMME_CAPO, S_GEMME_SPERONE, SUOLO, TRALCI_VECCHI,
  fiancoSperone, germogli, giornoNodo, grappolo, lunghezzaGermoglio, nastro, puntiAEretto, puntiBEretto, puntiCapo,
  puntiGermoglio, puntiSperone, suPolilinea, type Germoglio, type Pt,
} from './geometria'

/*
 * La vite: una TAVOLA INCISA in SVG (DESIGN.md, "Vite: tavola incisa"), a strati.
 *  - strato del LEGNO (palo, fili, ceppo, capo a frutto ad archetto, sperone): fermo;
 *  - tre strati della CHIOMA (gruppi di germogli): ognuno ondeggia con una leggera inclinazione
 *    CSS ancorata al filo di banchina, come una brezza (la fa il compositore, non si ridisegna);
 *  - strato delle ANNOTAZIONI.
 *
 * Stile: linee in avorio da 0,75 a 1,5px a schermo (spessore fisso a ogni ingrandimento),
 * tratteggi paralleli per il volume, nessun riempimento colorato. Le forme sono riempite del
 * nero del fondo, così quelle davanti coprono quelle dietro come in un'incisione.
 * La luce viene da sinistra e dall'alto: i tratteggi stanno sul lato in ombra.
 * Il colore compare solo come accento botanico, nelle linee e in una velatura trasparente:
 * verde per germogli e foglie giovani, vinaccia per gli acini dall'invaiatura, ambra per le
 * foglie d'autunno.
 */

// ── colori dell'incisione: token, mescolati solo per gli accenti ─────────────────
const tinta = (accento: string, k: number) => (k <= 0.001 ? 'var(--avorio)' : `color-mix(in oklab, var(${accento}) ${(clamp(k) * 100).toFixed(0)}%, var(--avorio))`)
/** più lontano, più spento: la profondità di un'incisione si legge nell'intensità del segno */
const lontano = (colore: string, k: number) => (k <= 0.001 ? colore : `color-mix(in oklab, ${colore} ${(100 - clamp(k) * 55).toFixed(0)}%, var(--nero))`)

// ── tratteggio: linee parallele ritagliate su un poligono (calcolato una volta sola) ──
/** Segmenti paralleli con angolo `ang` (gradi) e passo `passo`, dentro il poligono `poli`. */
function tratteggio(poli: Pt[], ang: number, passo: number, margine = 0.12): string {
  const a = (ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  // si ruota il poligono di -ang: le linee diventano orizzontali
  const r = poli.map(([x, y]): Pt => [x * c + y * s, -x * s + y * c])
  let y0 = Infinity, y1 = -Infinity
  for (const p of r) {
    y0 = Math.min(y0, p[1])
    y1 = Math.max(y1, p[1])
  }
  let d = ''
  for (let y = y0 + passo / 2; y < y1; y += passo) {
    const xs: number[] = []
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length]
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]))
    }
    xs.sort((m, n) => m - n)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const l = xs[i + 1] - xs[i]
      if (l < passo * 0.8) continue
      const xa = xs[i] + l * margine, xb = xs[i + 1] - l * margine
      // indietro nello spazio della tavola
      d += `M${(xa * c - y * s).toFixed(1)} ${(xa * s + y * c).toFixed(1)}L${(xb * c - y * s).toFixed(1)} ${(xb * s + y * c).toFixed(1)}`
    }
  }
  return d
}

/** Le normali di una polilinea verso l'ombra (lontano dalla luce, che viene da sinistra e dall'alto). */
function lineeOmbra(pts: Pt[], w0: number, w1: number, quote: number[]) {
  const n = pts.length
  const linee = quote.map(() => '')
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    let nx = -ty, ny = tx
    if (nx + ny < 0) {
      nx = -nx
      ny = -ny
    }
    const w = lerp(w0, w1, i / (n - 1)) / 2
    quote.forEach((q, k) => {
      // i segni si accorciano verso le estremità, come il bulino che entra ed esce
      if (i === 0 || i === n - 1) return
      linee[k] += `${linee[k] ? 'L' : 'M'}${(pts[i][0] + nx * w * q).toFixed(1)} ${(pts[i][1] + ny * w * q).toFixed(1)}`
    })
  }
  return linee.join(' ')
}

/** Un pezzo di legno inciso: contorno, e sul lato in ombra due segni lungo il cilindro. */
function Legno({ pts, w, colore, className = 'v-legno' }: { pts: Pt[]; w: [number, number]; colore?: string; className?: string }) {
  const stile = colore ? { color: colore } : undefined
  return (
    <g style={stile}>
      <path d={nastro(pts, w[0], w[1])} className={className} />
      {w[0] > 2.2 && <path d={lineeOmbra(pts, w[0], w[1], [0.38, 0.7])} className="v-incisione" />}
    </g>
  )
}

// ── foglie della vite: pentagonali, a cinque lobi, denti irregolari, seno peziolare a U ──
// Tre varianti: lobi poco incisi, lobi profondi, quasi trilobata. Ogni foglia ha la lamina,
// le nervature principali e secondarie, e il tratteggio sulla metà oltre la nervatura
// (la foglia è piegata lungo la nervatura e quella metà è in ombra).
const GIUNTO: Pt = [0, -40] // dove il picciolo entra nella lamina
function formaFoglia(tipo: 0 | 1 | 2) {
  const cy = -50, R = 46
  const r = caso(17 + tipo * 5)
  // lobi: angolo, lunghezza relativa
  const lobi: [number, number][] =
    tipo === 2 ? [[0, 1], [58, 0.9], [-58, 0.9], [122, 0.5], [-122, 0.5]] : [[0, 1], [62, 0.9], [-62, 0.9], [124, 0.66], [-124, 0.66]]
  const seno = tipo === 0 ? 0.74 : tipo === 1 ? 0.5 : 0.6 // profondità dei seni laterali
  const ampiezze = Array.from({ length: 60 }, () => 0.55 + r() * 0.9)
  const forma = (a: number) => {
    let picco = 0
    for (const [la, ll] of lobi) {
      const d = Math.abs(a - la) / 30
      picco = Math.max(picco, ll * Math.exp(-Math.pow(d, 1.35)))
    }
    // seno peziolare: i lobi inferiori si avvicinano, la lamina rientra fino al giunto
    const fondo = lerp(seno, 0.1, tra(Math.abs(a), 146, 180))
    let k = fondo + (1 - fondo) * picco
    if (Math.abs(a) > 150) k = Math.min(k, lerp(k, 0.12, tra(Math.abs(a), 150, 180)))
    // denti: a sega, irregolari, più marcati sui lobi
    const periodo = tipo === 1 ? 8 : 9
    const i = Math.floor((a + 180) / periodo)
    const f = ((a + 180) % periodo) / periodo
    const dente = (1 - f) * 0.05 * ampiezze[i % 60] * (0.4 + picco)
    return R * (k + dente)
  }
  const pts: Pt[] = []
  for (let a = -179; a <= 179; a += 1.5) {
    const psi = (a * Math.PI) / 180
    const rr = forma(a)
    pts.push([rr * Math.sin(psi), cy - rr * Math.cos(psi)])
  }
  const lamina = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + 'Z'
  // metà in ombra (lato destro della nervatura centrale): tratteggio obliquo; vicino al giunto,
  // dove la foglia si incava, un secondo tratteggio incrociato
  const destra: Pt[] = [GIUNTO, ...pts.filter((p) => p[0] >= 0.5), [0, cy - forma(0)]]
  const conca: Pt[] = pts.filter((p) => Math.hypot(p[0] - GIUNTO[0], p[1] - GIUNTO[1]) < R * 0.55 && p[0] > -2)
  const ombra = tratteggio(destra, 38, 7.5) + tratteggio([GIUNTO, ...conca], -30, 9, 0.2)
  // nervature: dal giunto alle punte dei lobi, appena curve; secondarie verso i denti
  let vene = ''
  let secondarie = ''
  for (const [la, ll] of lobi) {
    const psi = (la * Math.PI) / 180
    const L = forma(la) * 0.94
    const tip: Pt = [L * Math.sin(psi), cy - L * Math.cos(psi)]
    const c: Pt = [(GIUNTO[0] + tip[0]) / 2 + Math.cos(psi) * 3, (GIUNTO[1] + tip[1]) / 2 + Math.sin(psi) * 3]
    vene += `M${GIUNTO[0]} ${GIUNTO[1]} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${tip[0].toFixed(1)} ${tip[1].toFixed(1)} `
    for (const t of [0.35, 0.55, 0.75]) {
      const q: Pt = [lerp(GIUNTO[0], tip[0], t), lerp(GIUNTO[1], tip[1], t)]
      for (const lato of [-1, 1]) {
        const a2 = la + lato * (34 - t * 10) * ll
        const p2 = (a2 * Math.PI) / 180
        const L2 = forma(a2) * 0.9
        const fine: Pt = [L2 * Math.sin(p2), cy - L2 * Math.cos(p2)]
        const m: Pt = [lerp(q[0], fine[0], 0.55), lerp(q[1], fine[1], 0.55)]
        secondarie += `M${q[0].toFixed(1)} ${q[1].toFixed(1)} L${m[0].toFixed(1)} ${m[1].toFixed(1)} `
      }
    }
  }
  return { lamina, ombra, vene, secondarie }
}
const FOGLIE = [formaFoglia(0), formaFoglia(1), formaFoglia(2)]

/** L'acino inciso, di raggio 1: contorno, mezzaluna di tratteggio sul lato in ombra, punto di luce. */
const ACINO_OMBRA = (() => {
  let d = ''
  for (const [r, a0, a1] of [[0.82, -10, 120], [0.64, 5, 100], [0.46, 22, 80]] as const) {
    const p = (a: number): Pt => [Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r]
    const [x0, y0] = p(a0), [x1, y1] = p(a1)
    d += `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }
  return d
})()

/** Definizioni condivise da tutti gli strati: le tre foglie e l'acino, disegnati una volta sola. */
const Definizioni = memo(function Definizioni() {
  return (
    <svg className="vite-defs" aria-hidden="true" focusable="false">
      <defs>
        {FOGLIE.map((f, i) => (
          // due tracciati per foglia: la lamina, e in un solo tracciato picciolo, nervature e tratteggio
          <symbol id={`v-foglia-${i}`} overflow="visible" key={i}>
            <path d={f.lamina} className="v-lamina" />
            <path d={`M0 0 Q1.5 -20 ${GIUNTO[0]} ${GIUNTO[1]} ${f.vene} ${f.secondarie} ${f.ombra}`} className="v-incisione" />
          </symbol>
        ))}
        {/* due tracciati per acino: il contorno, e in un solo tracciato mezzaluna d'ombra e punto di luce */}
        {/* fili e suolo del filare: pieni vicino alla pianta, sfumano nel buio da entrambi i lati
            (non attraversano lo schermo dietro titoli e calendario) */}
        <linearGradient id="v-sfuma-filare" gradientUnits="userSpaceOnUse" x1={SFUMA[0]} y1="0" x2={SFUMA[3]} y2="0">
          <stop offset="0" style={{ stopColor: 'var(--avorio)', stopOpacity: 0 }} />
          <stop offset={(SFUMA[1] - SFUMA[0]) / (SFUMA[3] - SFUMA[0])} style={{ stopColor: 'var(--avorio)', stopOpacity: 0.2 }} />
          <stop offset={(SFUMA[2] - SFUMA[0]) / (SFUMA[3] - SFUMA[0])} style={{ stopColor: 'var(--avorio)', stopOpacity: 0.2 }} />
          <stop offset="1" style={{ stopColor: 'var(--avorio)', stopOpacity: 0 }} />
        </linearGradient>
        <symbol id="v-acino" overflow="visible">
          <circle r="1" className="v-acino" />
          <path d={`${ACINO_OMBRA}M-0.5 -0.4a0.12 0.12 0 1 0 0.24 0a0.12 0.12 0 1 0 -0.24 0`} className="v-incisione" />
        </symbol>
      </defs>
    </svg>
  )
})

/** I due pali attorno alla pianta; il filare continua solo come accenno e sfuma (SFUMA). */
const PALI = [64, 584]
/** dove i fili del filare sono pieni (dal secondo al terzo valore) e dove spariscono */
const SFUMA = [-40, 70, 584, 690] as const
const ZOLLA = Array.from({ length: 40 }, (_, i): Pt => {
  const a = (i / 40) * Math.PI * 2
  return [302 + Math.cos(a) * 78, SUOLO + 6 + Math.sin(a) * 13]
})
const OMBRA_PORTATA: Pt[] = [[296, SUOLO + 4], [318, SUOLO + 2], [600, SUOLO + 16], [560, SUOLO + 22]]
const Fissi = memo(function Fissi() {
  // palo, fili, suolo: non cambiano mai. Linee sottili come la vite, mai barre scure
  return (
    <g className="v-fissi">
      <path d={`M${SFUMA[0]} ${SUOLO + 2} C0 ${SUOLO - 4} 600 ${SUOLO + 6} ${SFUMA[3]} ${SUOLO}`} className="v-suolo" style={{ stroke: 'url(#v-sfuma-filare)' }} />
      {/* la zolla e l'ombra portata verso destra (luce da sinistra): solo tratteggio */}
      <path d={tratteggio(ZOLLA, 0, 3.2, 0.06)} className="v-suolo" />
      <path d={tratteggio(OMBRA_PORTATA, 8, 3, 0.04)} className="v-suolo" />
      {PALI.map((x) => (
        <path key={x} d={`M${x} 128 V${SUOLO + 2} M${x + 12} 128 V${SUOLO + 2} M${x} 128 H${x + 12}`} className="v-palo" />
      ))}
      {FILI.map((y) => (
        <path key={y} d={`M${SFUMA[0]} ${y} L${SFUMA[3]} ${y + 0.5}`} className="v-filo" style={{ stroke: 'url(#v-sfuma-filare)' }} />
      ))}
    </g>
  )
})

// il ceppo: vecchio, nodoso, un po' ritorto; si allarga al colletto e sotto la testa
const TRONCO = (() => {
  const r = caso(11)
  const sx: Pt[] = [], dx: Pt[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16 // 0 = colletto, 1 = testa
    const y = lerp(SUOLO + 4, 470, t)
    const c = 301 + Math.sin(t * 5.2 + 0.6) * 3.2 + (r() - 0.5) * 1.2
    const mezza = 11.5 + 5.5 * Math.pow(1 - t, 3) + 3.2 * Math.pow(t, 6) + Math.sin(t * 13) * 0.9 + (r() - 0.5) * 1.1
    sx.push([c - mezza, y])
    dx.push([c + mezza + (r() - 0.5) * 0.8, y])
  }
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  return { d: `M${sx.map(f).join(' L')} L${[...dx].reverse().map(f).join(' L')} Z`, sx, dx }
})()
const TESTA = 'M282 474 C280 452 298 438 314 446 C324 452 320 472 308 478 Z'
const Ceppo = memo(function Ceppo() {
  const r = caso(5)
  // fessure della corteccia: lunghe, che seguono il ritorto del ceppo
  let fessure = ''
  for (let i = 0; i < 22; i++) {
    const u = r()
    const y0 = lerp(SUOLO - 4, 486, r()), lung = 30 + r() * 70
    let d = ''
    for (let k = 0; k <= 6; k++) {
      const y = y0 - (lung * k) / 6
      const t = tra(y, SUOLO + 4, 470)
      const j = Math.round(t * 16)
      const L = TRONCO.sx[j][0], R = TRONCO.dx[j][0]
      const x = lerp(L + 2, R - 2, u) + Math.sin(k * 1.3 + i) * 0.9
      d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    fessure += d + ' '
  }
  // il lato destro, in ombra: segni verticali che seguono il ritorto, più fitti verso il bordo
  let ombra = ''
  for (const u of [0.6, 0.7, 0.78, 0.85, 0.91]) {
    ombra += TRONCO.sx.map((p, j) => `${j ? 'L' : 'M'}${lerp(p[0], TRONCO.dx[j][0], u).toFixed(1)} ${p[1].toFixed(1)}`).join('') + ' '
  }
  const testa: Pt[] = [[284, 470], [290, 446], [312, 446], [320, 460], [308, 476]]
  return (
    <g>
      <path d={TRONCO.d} className="v-legno" />
      <path d={ombra} className="v-incisione" />
      <path d={fessure} className="v-fessure" />
      {/* testa e vecchio sperone */}
      <path d={TESTA} className="v-legno" />
      <path d={tratteggio(testa.slice(1, 4).concat([[306, 466]]), 50, 2.6)} className="v-incisione" />
      <path d="M296 452 l-3 -8 M307 449 l3 -7 M290 466 q6 4 14 2" className="v-fessure" />
    </g>
  )
})

function Gemma({ p, ang, gonfio, cotone, verde, altra }: { p: Pt; ang: number; gonfio: number; cotone: number; verde: number; altra: boolean }) {
  const s = 1 + gonfio * 0.6
  return (
    <g className={altra ? 'v-gemma-altra' : undefined} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${s.toFixed(2)})`}>
      <path d="M-3.4 0 C-3.6 -4 -1.6 -7.4 0 -8.6 C1.6 -7.4 3.6 -4 3.4 0 Z" className="v-legno" />
      {/* le perule: il lato in ombra tratteggiato */}
      <path d="M0.6 -7.4 L1.6 -1 M1.6 -6.2 L2.6 -1.2" className="v-incisione" />
      {/* la lanugine della gemma cotonosa: piccoli riccioli */}
      {cotone > 0 && (
        <path
          d={`M-1.6 ${-3 - 2 * cotone} q0.8 -1.2 1.6 0 q0.8 1.2 1.6 0 M-1.2 ${-5 - 2 * cotone} q0.6 -1 1.2 0 q0.6 1 1.2 0`}
          className="v-cotone"
          style={{ opacity: cotone }}
        />
      )}
      {verde > 0 && <path d={`M-1.6 -7 Q0 ${-7 - 6 * verde} 1.6 -7`} className="v-punta" />}
    </g>
  )
}

const SEME_SPERONE = 9
function gemmeLungo(pts: Pt[], sList: number[], g: number, seme: number) {
  const r = caso(seme)
  const gonfio = tra(g, G.piantoDa, G.germoglioDa)
  const cotone = tra(g, G.cotoneDa, G.germoglioDa) * (1 - tra(g, G.germoglioDa + 4, G.germoglioDa + 10))
  return sList.map((s, k) => {
    const p = suPolilinea(pts, s)
    const q = suPolilinea(pts, s + 0.02)
    const tang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI
    const lato = k % 2 ? 1 : -1
    const scarto = (r() - 0.5) * 10
    const raccordo = seme === SEME_SPERONE && k === 0
    const ang = raccordo ? tang + 90 + ASSE_GEMMA_RACCORDO : tang + 90 + lato * 55 + scarto
    // la gemma del momento film affianca lo sperone (vedi film/ancore.ts)
    const pos: Pt = raccordo ? fiancoSperone(pts, s) : p
    const verde = tra(g, G.germoglioDa - 2 + r() * 4, G.germoglioDa + 8)
    return <Gemma key={k} altra={!raccordo} p={pos} ang={ang} gonfio={gonfio} cotone={cotone} verde={verde * (g < G.germoglioDa + 12 ? 1 : 0)} />
  })
}

function Nodi({ pts, ogni, larghezza }: { pts: Pt[]; ogni: number; larghezza: number }) {
  let d = ''
  for (let s = ogni; s < 0.98; s += ogni) {
    const p = suPolilinea(pts, s), q = suPolilinea(pts, s + 0.01)
    const a = Math.atan2(q[1] - p[1], q[0] - p[0])
    const nx = -Math.sin(a) * larghezza, ny = Math.cos(a) * larghezza
    d += `M${(p[0] - nx).toFixed(1)} ${(p[1] - ny).toFixed(1)} L${(p[0] + nx).toFixed(1)} ${(p[1] + ny).toFixed(1)} `
  }
  return <path d={d} className="v-nodo" />
}

/** Legno dell'inverno: capo vecchio, tralci vecchi, A e B, con i tagli della potatura. */
function LegnoInverno({ g }: { g: number }) {
  const viaCapoVecchio = tra(g, G.potaturaA - 2, G.potaturaA + 3)
  const taglioB = tra(g, G.potaturaA + 1, G.potaturaA + 4)
  const taglioA = tra(g, G.potaturaA + 2, G.potaturaA + 5)
  const piega = tra(g, G.legaturaDa, G.legaturaA)
  return (
    <g>
      {viaCapoVecchio < 1 && (
        <g className="v-cade" style={{ opacity: 1 - viaCapoVecchio * viaCapoVecchio, transform: `translateY(${(viaCapoVecchio * viaCapoVecchio * 34).toFixed(2)}px)` }}>
          {TRALCI_VECCHI.map((t, k) => {
            const via = tra(g, t.taglio, t.taglio + 2.2)
            if (via >= 1) return null
            return (
              // il tralcio tagliato cade ruotando attorno al taglio, accelerando come un peso vero
              <g
                key={k}
                className="v-cade"
                style={{
                  opacity: 1 - via * via,
                  transformOrigin: `${t.pts[0][0]}px ${t.pts[0][1]}px`,
                  transform: `translateY(${(via * via * 70).toFixed(2)}px) rotate(${((k % 2 ? 1 : -1) * via * via * 14).toFixed(2)}deg)`,
                }}
              >
                <Legno pts={t.pts} w={[4.4, 1.3]} />
                <Nodi pts={t.pts} ogni={0.1} larghezza={2.6} />
              </g>
            )
          })}
          <Legno pts={CAPO_VECCHIO} w={[9, 5]} />
          <path d={CAPO_VECCHIO.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${(p[1] - 1).toFixed(1)}`).join(' ')} className="v-fessure" />
        </g>
      )}
      {taglioB < 1 && (
        <g className="v-cade" style={{ opacity: 1 - taglioB * taglioB, transform: `translateY(${(taglioB * taglioB * 46).toFixed(2)}px)` }}>
          <Legno pts={puntiBEretto().slice(2)} w={[4.2, 1.2]} />
          <Nodi pts={puntiBEretto()} ogni={0.1} larghezza={2.5} />
        </g>
      )}
      {taglioA < 1 && (
        <g style={{ opacity: 1 - taglioA }}>
          <Legno pts={puntiAEretto().slice(15)} w={[2.4, 1.1]} />
        </g>
      )}
      <Capo g={g} piega={piega} />
    </g>
  )
}

function Capo({ g, piega }: { g: number; piega: number }) {
  const pts = puntiCapo(piega)
  const sp = puntiSperone()
  const legacci = tra(g, G.legaturaA - 3, G.legaturaA + 1)
  const pianto = g > G.piantoDa && g < G.piantoA
  const goccia = (g * 1.7) % 1
  const tagliato = g > G.potaturaA + 4
  const capoFine = pts[pts.length - 1]
  const spFine = sp[sp.length - 1]
  return (
    <g>
      <Legno pts={pts} w={[6, 3.4]} />
      <Nodi pts={pts} ogni={0.118} larghezza={3.2} />
      <Legno pts={sp} w={[6, 5]} />
      {tagliato && (
        <>
          <ellipse cx={capoFine[0]} cy={capoFine[1]} rx="1.8" ry="1.6" className="v-legno" />
          <ellipse cx={spFine[0]} cy={spFine[1]} rx="2.6" ry="1.6" className="v-legno" />
        </>
      )}
      {legacci > 0 &&
        [0.5, 0.97].map((s) => {
          const p = suPolilinea(pts, s)
          return <circle key={s} cx={p[0]} cy={p[1] + 2} r={3.4} className="v-legaccio" style={{ opacity: legacci }} />
        })}
      {pianto &&
        [capoFine, spFine].map((p, i) => (
          <g key={i} className="v-pianto">
            <path d={`M${p[0]} ${p[1] + 1} q-1.4 ${3 + goccia * 4} 0 ${4 + goccia * 6} q1.4 -${1 + goccia * 4} 0 -${4 + goccia * 6}`} />
            {goccia > 0.6 && <circle cx={p[0]} cy={p[1] + 12 + (goccia - 0.6) * 60} r="1.2" />}
          </g>
        ))}
      {g < G.germoglioDa + 14 && (
        <>
          {gemmeLungo(pts, S_GEMME_CAPO, g, 3)}
          {gemmeLungo(sp, S_GEMME_SPERONE, g, SEME_SPERONE)}
        </>
      )}
    </g>
  )
}

/**
 * Il giorno "efficace" di un grappolo: fermo quando il suo aspetto non cambia (tra la fine
 * dell'invaiatura e la vendemmia), a passi di un giorno mentre gli acini crescono. Il componente
 * è memoizzato: se il giorno efficace non cambia, React non lo tocca e il browser non ricalcola.
 */
const giornoGrappolo = (g: number) => {
  if (g < G.infiorescenze - 6) return G.infiorescenze - 7
  if (g >= G.invaiaturaA && g < G.vendemmiaDa) return G.invaiaturaA
  if (g >= G.fioreA + 4 && g < G.invaiaturaDa) return Math.floor(g)
  if (g >= G.cadutaA) return G.cadutaA
  return g
}

/** Il grappolo: infiorescenza, fiori, acini, e dopo la vendemmia il raspo vuoto. */
const Grappolo = memo(function Grappolo({ seme, ax, ay, lato, g, j }: { seme: number; ax: number; ay: number; lato: number; g: number; j: number }) {
  const at: Pt = [ax, ay]
  const gr = useMemo(() => grappolo(seme * 10 + j, lato), [seme, j, lato])
  const fiore = tra(g, G.fioreDa, G.fioreA)
  const allegato = g >= G.fioreA
  const cresce = tra(g, G.fioreA, G.invaiaturaA)
  const appare = tra(g, G.infiorescenze - 6, G.infiorescenze + 10)
  const cade = tra(g, G.cadutaDa + 10, G.cadutaA)
  if (appare <= 0 || cade >= 1) return null
  // prima della fioritura l'infiorescenza punta in alto e in fuori, poi pende
  const pende = tra(g, G.fioreA - 4, G.fioreA + 24)
  const ang = lerp(lato * 118, lato * 14, pende)
  // infiorescenza ben visibile fino alla fioritura; poi il grappolo si raccoglie e gli acini crescono
  const sviluppo = appare * 0.4 + tra(g, G.infiorescenze, G.fioreDa) * 0.6
  const scala = (allegato ? lerp(1.3, 1.06, tra(g, G.fioreA, G.fioreA + 24)) : lerp(0.72, 1.3, sviluppo)) * (0.9 + (j % 2) * 0.12)
  const vendemmia = tra(g, G.vendemmiaDa, G.vendemmiaA)
  const secco = tra(g, G.vendemmiaDa, G.vendemmiaA + 12)
  // il raspo è verde finché è vivo, poi torna avorio (legno secco)
  const coloreRaspo = tinta('--verde', 0.55 * (1 - secco))
  return (
    <g
      transform={`translate(${at[0].toFixed(1)} ${at[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${scala.toFixed(3)})`}
      style={{ opacity: appare * (1 - cade) }}
    >
      <path d={gr.raspo} className="v-raspo" style={{ color: coloreRaspo }} />
      {vendemmia > 0 && (
        <path
          d={gr.acini.map((a) => `M${a.ramo[0].toFixed(1)} ${a.ramo[1].toFixed(1)} L${a.x.toFixed(1)} ${(a.y - 1.5).toFixed(1)}`).join(' ')}
          className="v-raspo"
          style={{ color: coloreRaspo, opacity: vendemmia }}
        />
      )}
      {gr.acini.map((a, i) => {
        if (g > lerp(G.vendemmiaDa, G.vendemmiaA, a.raccolta)) return null
        const r = allegato ? lerp(1.5, 3.7, cresce) * a.r : lerp(1.2, 1.55, fiore) * a.r
        const vira = allegato ? tra(g, lerp(G.invaiaturaDa, G.invaiaturaA - 8, a.soglia), lerp(G.invaiaturaDa + 6, G.invaiaturaA, a.soglia)) : 0
        const aperto = !allegato && fiore > a.soglia
        // verde finché l'acino è acerbo; dall'invaiatura il segno e la velatura si fanno vinaccia
        const colore = vira > 0 ? tinta('--vinaccia', 0.35 * vira) : tinta('--verde', aperto ? 0.15 : 0.4)
        return (
          <use
            key={i}
            href="#v-acino"
            transform={`translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) scale(${(aperto ? r * 1.12 : r).toFixed(2)})`}
            style={{ color: colore, ['--velo' as string]: (vira * 0.85).toFixed(2) }}
          />
        )
      })}
      {fiore > 0 && fiore < 1 &&
        gr.acini.slice(0, 9).map((a, i) =>
          a.soglia < fiore ? (
            <path key={`c${i}`} d={`M${(a.x - 1.2).toFixed(1)} ${(a.y + 7 + a.soglia * 16).toFixed(1)} q1.2 -2 2.4 0 Z`} className="v-caliptra" />
          ) : null,
        )}
    </g>
  )
})

/** Viticcio a spirale: un tratto, poi due giri che si stringono. */
function viticcio(p: Pt, verso: number, seme: number) {
  const r = caso(seme)
  const giri = 1.4 + r() * 1.1
  const lung = 9 + r() * 7
  const c: Pt = [p[0] + verso * lung, p[1] - 3 - r() * 5]
  let d = `M${p[0].toFixed(1)} ${p[1].toFixed(1)} Q${(p[0] + verso * lung * 0.5).toFixed(1)} ${(p[1] - 8).toFixed(1)} ${(c[0] + verso * 5).toFixed(1)} ${c[1].toFixed(1)}`
  for (let k = 1; k <= 14; k++) {
    const t = k / 14
    const th = verso * t * giri * 2 * Math.PI
    const rr = 5 * (1 - t) + 0.8
    d += ` L${(c[0] + verso * rr * Math.cos(th)).toFixed(1)} ${(c[1] + rr * Math.sin(th)).toFixed(1)}`
  }
  return d
}

/**
 * Il giorno "efficace" di un germoglio con le sue foglie e i viticci: fermo quando l'aspetto non
 * cambia (dopo la cimatura le foglie sono adulte; fino all'autunno cambia solo, piano, il colore
 * del tralcio che lignifica, a passi di tre giorni).
 */
const giornoGermoglio = (g: number) => {
  if (g < G.cimatura + 22) return g
  if (g < G.lignificaDa) return G.cimatura + 22
  if (g < G.autunnoDa) return G.lignificaDa + Math.floor((g - G.lignificaDa) / 3) * 3
  return g
}

/** Un germoglio: il fusto, le foglie e i viticci (i grappoli sono a parte, con il loro ritmo). */
const UnGermoglio = memo(function UnGermoglio({ gm, g }: { gm: Germoglio; g: number }) {
  const L = lunghezzaGermoglio(gm, g)
  if (L < 1) return null
  const lign = tra(g, G.lignificaDa, G.lignificaA)
  const pts = puntiGermoglio(gm, L)
  const nNodi = Math.floor(L / INTERNODO)
  const r = caso(gm.seme * 31)
  // il germoglio è verde finché non lignifica, poi diventa legno (avorio)
  const coloreFusto = tinta('--verde', 0.6 * (1 - lign))
  const foglie: React.JSX.Element[] = []
  const viticci: React.JSX.Element[] = []
  for (let j = 0; j < nNodi + 1; j++) {
    const s = Math.min(1, ((j + 0.6) * INTERNODO) / Math.max(L, 1))
    const p = suPolilinea(pts, s)
    const lato = j % 2 ? 1 : -1
    const nato = j < nNodi ? giornoNodo(gm, j) : g
    const eta = g - nato
    // ogni foglia è diversa: forma, misura, rotazione, specchio, profondità
    const tipo = Math.floor(r() * 3)
    const misura = 0.78 + r() * 0.5
    // la foglia non è mai di piatto: un po' girata, quindi scorciata
    const scorcio = 0.58 + r() * 0.42
    const specchio = r() > 0.5 ? -1 : 1
    const tono = r() * 2 - 1
    r() // (orientamento verso la luce della versione a colori: la sequenza resta la stessa)
    const dim = clamp(eta / 22) * lerp(0.66, 0.4, j / 12) * (j === nNodi ? 0.5 : 1) * misura
    const cadeDa = lerp(G.cadutaDa, G.cadutaA - 10, r())
    const cade = tra(g, cadeDa, cadeDa + 8)
    const autunno = tra(g, G.autunnoDa + r() * 10, G.autunnoDa + 30 + r() * 10)
    const giovane = 1 - clamp(eta / 18)
    // le foglie pendono dal picciolo: alcune di lato, altre quasi a testa in giù
    const ang = lato * (38 + r() * 78) + (r() - 0.5) * 22
    if (dim > 0.02 && cade < 1) {
      // accento botanico: verde per le giovani, ambra (e un poco di vinaccia) d'autunno
      const ruggine = autunno > 0.6 && tono > 0.3
      const colore =
        autunno > 0
          ? `color-mix(in oklab, ${ruggine ? 'color-mix(in oklab, var(--ambra) 70%, var(--vinaccia))' : 'var(--ambra)'} ${(autunno * 75).toFixed(0)}%, var(--avorio))`
          : tinta('--verde', 0.7 * giovane)
      const velo = Math.max(giovane * 0.16, autunno * 0.2)
      // la caduta: scende accelerando e ondeggia come una foglia vera (pendolo che si smorza a terra),
      // ruotando attorno al picciolo; tra un aggiornamento e l'altro la interpola il browser (vite.css)
      const fase = r() * Math.PI * 2
      const onda = Math.sin(cade * Math.PI * 3.2 + fase) * (1 - cade * 0.4)
      const fx = p[0] + cade * lato * 18 + onda * 16 * cade
      const fy = p[1] + cade * cade * 150
      const fr = ang + cade * lato * 60 + onda * 26 * cade
      const vel = cade > 0 && cade < 1
      foglie.push(
        <use
          key={`f${j}`}
          href={`#v-foglia-${tipo}`}
          className={vel ? 'v-in-volo' : undefined}
          style={{
            transform: `translate(${fx.toFixed(2)}px, ${fy.toFixed(2)}px) rotate(${fr.toFixed(2)}deg) scale(${(dim * specchio * scorcio).toFixed(4)}, ${dim.toFixed(4)})`,
            opacity: 1 - cade * cade,
            color: lontano(colore, clamp(-tono)),
            ['--velo' as string]: velo.toFixed(2),
          }}
        />,
      )
    }
    if (!gm.grappoli.includes(j) && j >= 3 && j < nNodi && eta > 5 && tra(g, G.cadutaDa, G.cadutaA) < 1) {
      viticci.push(<path key={`v${j}`} d={viticcio(p, -lato, gm.seme * 100 + j)} className="v-viticcio" style={{ color: coloreFusto }} />)
    }
  }
  return (
    <g className="v-germoglio">
      <Legno pts={pts} w={[lerp(2, 4.4, clamp(L / 200)), 1.1]} colore={coloreFusto} />
      {foglie}
      {viticci}
    </g>
  )
})

function GruppoGermogli({ g, indici }: { g: number; indici: number[] }) {
  const lista = useMemo(germogli, [])
  if (g < G.germoglioDa - 1) return null
  const gF = giornoGermoglio(g)
  const gG = giornoGrappolo(g)
  return (
    <g>
      {indici.map((k) => {
        const gm = lista[k]
        // dove nascono i grappoli: sul germoglio com'è nel suo giorno efficace
        const L = lunghezzaGermoglio(gm, gF)
        const pts = L >= 1 ? puntiGermoglio(gm, L) : null
        const nNodi = Math.floor(L / INTERNODO)
        return (
          <g key={k}>
            <UnGermoglio gm={gm} g={gF} />
            {pts &&
              gm.grappoli
                .filter((j) => j < nNodi + 1)
                .map((j) => {
                  const p = suPolilinea(pts, Math.min(1, ((j + 0.6) * INTERNODO) / Math.max(L, 1)))
                  return <Grappolo key={j} seme={gm.seme} ax={+p[0].toFixed(1)} ay={+p[1].toFixed(1)} lato={j % 2 ? -1 : 1} g={gG} j={j} />
                })}
          </g>
        )
      })}
    </g>
  )
}

/**
 * Note della tavola: ancorate a un punto della pianta, ma scritte a misura di schermo
 * (scale(var(--unita)) annulla lo zoom della camera), così restano leggibili in ogni inquadratura.
 */
function Etichette({ g }: { g: number }) {
  const lista: { testo: string; a: Pt; off: Pt }[] = []
  const capo = puntiCapo(tra(g, G.legaturaDa, G.legaturaA))
  const germoglio3 = (k: number) => {
    const gm = germogli()[3]
    const L = lunghezzaGermoglio(gm, g)
    return suPolilinea(puntiGermoglio(gm, L), Math.min(1, (k * INTERNODO) / Math.max(L, 1)))
  }
  if (g < G.potaturaA - 4) {
    lista.push({ testo: 'legno di due anni', a: suPolilinea(CAPO_VECCHIO, 0.62), off: [-60, 70] })
    lista.push({ testo: 'tralcio dell’anno', a: suPolilinea(TRALCI_VECCHI[3].pts, 0.55), off: [-90, -40] })
  } else if (g < 62) {
    lista.push({ testo: 'capo a frutto', a: suPolilinea(capo, 0.55), off: [60, 80] })
    lista.push({ testo: 'sperone', a: suPolilinea(puntiSperone(), 0.6), off: [-90, -50] })
    lista.push({ testo: 'gemma', a: suPolilinea(capo, S_GEMME_CAPO[5]), off: [70, -60] })
  } else if (g >= G.piantoDa && g < G.germoglioDa) {
    lista.push({ testo: 'il taglio piange', a: puntiCapo(1)[21], off: [70, 50] })
  } else if (g >= G.fioreDa - 6 && g <= G.fioreA + 4) {
    lista.push({ testo: 'infiorescenza in fiore', a: germoglio3(2.6), off: [110, -90] })
  } else if (g >= G.invaiaturaDa && g < G.vendemmiaDa) {
    lista.push({ testo: g < G.invaiaturaA ? 'acini che invaiano' : 'acini maturi', a: germoglio3(2.4), off: [120, 70] })
  } else if (g > G.vendemmiaA && g < G.cadutaDa + 10) {
    const p = germoglio3(2.6)
    lista.push({ testo: 'raspo dopo la vendemmia', a: [p[0] + 8, p[1] + 34], off: [120, 60] })
  }
  // gli organi sempre presenti: la lanterna li rivela quando ci passa vicino
  lista.push({ testo: 'ceppo', a: [302, 640], off: [-100, 20] })
  if (g >= G.legaturaA && !lista.some((e) => e.testo === 'capo a frutto')) lista.push({ testo: 'capo a frutto', a: suPolilinea(capo, 0.7), off: [80, 70] })
  if (g >= G.germoglioDa + 8 && g < G.cadutaA) lista.push({ testo: g < G.lignificaDa ? 'germoglio' : 'tralcio', a: germoglio3(1.1), off: [-120, -30] })
  return (
    <g className="v-etichette">
      {/* DESIGN.md: al massimo due annotazioni visibili insieme (senza lanterna, le prime due;
          con la lanterna, le due più vicine al cursore: spazio/lanterna.ts) */}
      {lista.map((e) => (
        <g key={e.testo} data-x={e.a[0].toFixed(1)} data-y={e.a[1].toFixed(1)} transform={`translate(${e.a[0].toFixed(1)} ${e.a[1].toFixed(1)})`}>
          <g className="v-nota">
            <path d={`M0 0 L${e.off[0]} ${e.off[1]}`} pathLength={1} className="v-guida" />
            <circle r="1.5" className="v-guida-punto" />
            <text x={e.off[0] + (e.off[0] > 0 ? 6 : -6)} y={e.off[1] + 5} textAnchor={e.off[0] > 0 ? 'start' : 'end'} className="v-etichetta">
              {e.testo}
            </text>
          </g>
        </g>
      ))}
    </g>
  )
}

/** Il punto della pianta in cui si fa la pratica scelta nel nodo: un anello e una nota. */
function LuogoPratica() {
  const s = usePratica()
  if (!s) return null
  const [x, y] = s.luogo.punto
  return (
    <g transform={`translate(${x} ${y})`} className="v-luogo" key={s.id}>
      <g className="v-nota">
        <circle r="18" className="v-luogo-anello" />
        <circle r="1.5" className="v-luogo-centro" />
        {/* centrata sotto l'anello: la camera porta il punto verso il centro, la nota non esce dallo schermo */}
        <text x="0" y="52" textAnchor="middle" className="v-luogo-titolo">{s.titolo}</text>
        <text x="0" y="72" textAnchor="middle" className="v-luogo-dove">{s.luogo.dove}</text>
      </g>
    </g>
  )
}

/** Il legno cambia fino al germogliamento (potatura, legatura, pianto, gemme), poi resta fermo. */
const StratoLegno = memo(function StratoLegno({ g }: { g: number }) {
  return g < G.legaturaA + 1 ? <LegnoInverno g={g} /> : <Capo g={g} piega={1} />
})

/** Tre gruppi di germogli, ognuno nel suo strato con la sua brezza: sperone e base del capo, centro, punta. */
const GRUPPI = [[8, 9, 0, 1, 2], [3, 4, 5], [6, 7]]

export const ViteTavola = memo(function ViteTavola({ giorno }: { giorno: number }) {
  const g = giorno
  return (
    <div className="vite-strati" role="img" aria-label="Tavola incisa della vite allevata a Guyot, nello stato della stagione in corso">
      <Definizioni />
      <svg className="vite-svg vite-legno" viewBox="0 0 600 800" aria-hidden="true">
        <Fissi />
        <Ceppo />
        <StratoLegno g={g < G.germoglioDa + 14 ? g : G.germoglioDa + 14} />
      </svg>
      {GRUPPI.map((indici, i) => (
        <svg key={i} className={`vite-svg vite-chioma brezza-${i}`} viewBox="0 0 600 800" aria-hidden="true">
          <GruppoGermogli g={g} indici={indici} />
        </svg>
      ))}
      <svg className="vite-svg vite-note" viewBox="0 0 600 800" aria-hidden="true">
        <Etichette g={g} />
        <LuogoPratica />
      </svg>
    </div>
  )
})
