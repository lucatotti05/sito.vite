import { C, chiaro, scuro } from '@/core/colori'
import { caso, clamp, easeInOut, easeOut, lerp, tra } from '@/core/math'

/*
 * Le dieci forme del nodo orbitale. Ogni forma è una linea di N punti (aperta o chiusa) nello
 * spazio 400 × 400 del nodo, centro (200, 200). Tutte hanno lo stesso numero di punti e le
 * forme chiuse partono dal basso in senso orario: così il morph da una fase all'altra è un
 * semplice interpolare punto per punto, fluido e reversibile.
 * Ogni geometria dice anche dove stanno le pratiche ("pose") in funzione del progresso della fase t.
 */

export type Pt = [number, number]
export const N = 120
export const CENTRO: Pt = [200, 200]

export type Posa = {
  p: Pt
  /** rotazione del marcatore, gradi */
  ang?: number
  scala?: number
  /** 0–1, per i marcatori che si aprono (gemme) */
  apre?: number
  /** 0–1, invaiatura dell'acino */
  vira?: number
}
export type Etichettatura = { x: number; y: number; ancora: 'start' | 'middle' | 'end'; guida?: boolean }

export type Forma = {
  forma: (t: number) => Pt[]
  larghezza: (u: number, t: number) => number
  tratto: string
  riempi: string
  opacitaRiempi: (t: number) => number
  pose: (t: number, n: number) => Posa[]
  /** i collegamenti tra pratiche passano per questo punto (per la foglia: le nervature) */
  viaLegami?: Pt
  etichetta?: (i: number, posa: Posa, t: number) => Etichettatura
  /** oscillazione lenta nel tempo (solo il legno) */
}

// ── utilità ─────────────────────────────────────────────────────────────
const rad = (a: number) => (a * Math.PI) / 180

export function ricampiona(pts: Pt[], n = N): Pt[] {
  const lung = [0]
  for (let i = 1; i < pts.length; i++) lung.push(lung[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const tot = lung[lung.length - 1] || 1
  const out: Pt[] = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * tot
    while (j < lung.length - 2 && lung[j + 1] < s) j++
    const f = (s - lung[j]) / (lung[j + 1] - lung[j] || 1)
    out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)])
  }
  return out
}
export const misto = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)])
export const su = (pts: Pt[], u: number): Pt => {
  const f = clamp(u) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(f))
  return [lerp(pts[i][0], pts[i + 1][0], f - i), lerp(pts[i][1], pts[i + 1][1], f - i)]
}
const tangente = (pts: Pt[], u: number) => {
  const a = su(pts, u - 0.01), b = su(pts, u + 0.01)
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
}
const normale = (pts: Pt[], u: number, d: number): Pt => {
  const a = rad(tangente(pts, u))
  const p = su(pts, u)
  return [p[0] - Math.sin(a) * d, p[1] + Math.cos(a) * d]
}
function campiona(f: (u: number) => Pt, n = 360): Pt[] {
  return ricampiona(Array.from({ length: n + 1 }, (_, i) => f(i / n)))
}
const cerchio = (cx: number, cy: number, r: number, ry = r) =>
  campiona((u) => [cx + r * Math.cos(rad(90 + 360 * u)), cy + ry * Math.sin(rad(90 + 360 * u))])

/** Nastro di larghezza variabile attorno alla linea (il "tratto" della forma). */
export function nastro(pts: Pt[], w: (u: number) => number) {
  const n = pts.length
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)]
    let tx = q[0] - p[0], ty = q[1] - p[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l; ty /= l
    const h = w(i / (n - 1)) / 2
    a.push(`${(pts[i][0] - ty * h).toFixed(1)} ${(pts[i][1] + tx * h).toFixed(1)}`)
    b.push(`${(pts[i][0] + ty * h).toFixed(1)} ${(pts[i][1] - tx * h).toFixed(1)}`)
  }
  return `M${a.join(' L')} L${b.reverse().join(' L')} Z`
}
export const poligono = (pts: Pt[]) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} Z`

/** Etichetta di base: verso l'esterno rispetto al centro. */
export function etichettaFuori(p: Pt, d = 30, c: Pt = CENTRO): Etichettatura {
  let dx = p[0] - c[0], dy = p[1] - c[1]
  const l = Math.hypot(dx, dy) || 1
  dx /= l; dy /= l
  return { x: p[0] + dx * d, y: p[1] + dy * d + 5, ancora: Math.abs(dx) < 0.35 ? 'middle' : dx > 0 ? 'start' : 'end' }
}

// ── 01 RIPOSO · le orbite sono il legno ─────────────────────────────────
const A0 = 118, A1 = 418, RL = 132
const LEGNO = campiona((u) => [200 + RL * Math.cos(rad(lerp(A0, A1, u))), 200 + RL * Math.sin(rad(lerp(A0, A1, u)))])
const NODI_GEMME = [1, 3, 5, 7, 9]
export const legno: Forma = {
  forma: () => LEGNO,
  larghezza: (u) => lerp(9, 2.2, u) + 1.8 * Math.exp(-Math.pow(((u * 300) % 30) - 15, 2) / 6),
  tratto: '#8e5a32',
  riempi: C.nero,
  opacitaRiempi: () => 0,
  pose: (_t, n) =>
    Array.from({ length: n }, (_, i) => {
      const a = A0 + 15 + NODI_GEMME[i % 5] * 30
      const lato = i % 2 ? -1 : 1
      return { p: [200 + (RL + lato * 9) * Math.cos(rad(a)), 200 + (RL + lato * 9) * Math.sin(rad(a))] as Pt, ang: a + 270 - lato * 35 }
    }),
  etichetta: (_i, posa) => etichettaFuori(posa.p, 36),
}

// ── 02 PIANTO · gocce che scorrono lungo l'orbita e si raccolgono in basso ──
const RP = 128
const PIANTO = cerchio(200, 200, RP)
const GOCCE_DA = [210, 250, 290, 330]
const GOCCE_A = [146, 113, 427, 394]
export const pianto: Forma = {
  forma: () => PIANTO,
  larghezza: () => 1.6,
  tratto: '#8fa6a0', // acqua del pianto: nessun token
  riempi: C.nero,
  opacitaRiempi: () => 0,
  pose: (t, n) =>
    Array.from({ length: n }, (_, i) => {
      const k = easeInOut(tra(t, 0.12 + i * 0.06, 0.62 + i * 0.06))
      const a = lerp(GOCCE_DA[i % 4], GOCCE_A[i % 4], k)
      return { p: [200 + RP * Math.cos(rad(a)), 200 + RP * Math.sin(rad(a))] as Pt, ang: 0 }
    }),
  etichetta: (_i, posa) => etichettaFuori(posa.p, 34),
}

// ── 03 GERMOGLIAMENTO · l'orbita si srotola come un viticcio ────────────
function viticcio(arriccio: number): Pt[] {
  const L = 470, passi = 240
  let x = 112, y = 372, out: Pt[] = [[x, y]]
  for (let k = 1; k <= passi; k++) {
    const s = k / passi
    const th = rad(-90 + 34 * s + arriccio * 620 * Math.pow(s, 4))
    x += Math.cos(th) * (L / passi)
    y += Math.sin(th) * (L / passi)
    out.push([x, y])
  }
  return ricampiona(out)
}
const U_GEMME = [0.2, 0.42, 0.62]
export const germogliamento: Forma = {
  forma: (t) => viticcio(lerp(1, 0.42, easeInOut(t))),
  larghezza: (u) => lerp(6, 1.2, u),
  tratto: scuro(C.verde, 0.18),
  riempi: C.nero,
  opacitaRiempi: () => 0,
  pose: (t, n) => {
    const pts = viticcio(lerp(1, 0.42, easeInOut(t)))
    return Array.from({ length: n }, (_, i) => {
      const u = U_GEMME[i % 3]
      const lato = i % 2 ? -1 : 1
      return {
        p: normale(pts, u, lato * 7),
        ang: tangente(pts, u) + 90 + lato * 40,
        apre: easeOut(tra(t, 0.12 + i * 0.14, 0.5 + i * 0.14)),
      }
    })
  },
  etichetta: (_i, posa) => etichettaFuori(posa.p, 30, [200, 230]),
}

// ── 04 SVILUPPO · il contorno di una foglia pentalobata ─────────────────
const FC: Pt = [200, 212]
function fogliaPunti(t: number): Pt[] {
  const R = lerp(128, 150, easeOut(t))
  const prof = lerp(0.08, 0.2, t)
  return campiona((u) => {
    const psi = -180 + 360 * u
    let r = R * (1 - prof + prof * Math.cos(rad((psi * 360) / 64)))
    r *= 1 + 0.025 * Math.abs(((psi + 180) % 8) / 8 - 0.5) // dentelli
    if (Math.abs(psi) > 140) r *= lerp(1, 0.46, tra(Math.abs(psi), 140, 180))
    return [FC[0] + r * Math.sin(rad(psi)), FC[1] - r * Math.cos(rad(psi))]
  })
}
const LOBI = [-128, -64, 64, 128, 0]
export const PUNTO_NERVATURE: Pt = [200, 258]
export const foglia: Forma = {
  forma: fogliaPunti,
  larghezza: () => 1.6,
  tratto: scuro(C.verde, 0.08),
  riempi: scuro(C.verde, 0.68),
  opacitaRiempi: (t) => lerp(0.25, 0.55, t),
  viaLegami: PUNTO_NERVATURE,
  pose: (t, n) => {
    const R = lerp(128, 150, easeOut(t))
    return Array.from({ length: n }, (_, i) => {
      const psi = LOBI[i % 5]
      return { p: [FC[0] + R * Math.sin(rad(psi)), FC[1] - R * Math.cos(rad(psi))] as Pt }
    })
  },
  etichetta: (_i, posa) => etichettaFuori(posa.p, 26, FC),
}
export const lobiFoglia = (t: number) => {
  const R = lerp(128, 150, easeOut(t)) * 0.9
  return [0, ...LOBI.slice(0, 4)].map((psi): Pt => [FC[0] + R * Math.sin(rad(psi)), FC[1] - R * Math.cos(rad(psi))])
}

// ── 05 FIORITURA · la caliptra si stacca e libera gli stami ─────────────
/** scala del fiore attorno a (200, 214) */
const SF = (p: Pt): Pt => [200 + (p[0] - 200) * 1.14, 214 + (p[1] - 214) * 1.14]
function caliptra(aperta: number, cx: number, cy: number, ang: number, s: number): Pt[] {
  return campiona((u) => {
    const f = Math.PI + u * 2 * Math.PI // parte dal basso, senso orario
    const giu = -Math.cos(f)
    let x = 34 * Math.sin(f) * (1 + 0.1 * giu)
    let y = Math.min(-52 * Math.cos(f), 47)
    const peso = Math.max(0, (giu - 0.35) / 0.65)
    if (aperta > 0 && peso > 0) {
      const punte = Math.pow(Math.abs(Math.cos(2.5 * (f - Math.PI))), 6)
      y += aperta * peso * (punte * 11 - 6)
      x *= 1 + aperta * peso * 0.35
    }
    const c = Math.cos(rad(ang)), si = Math.sin(rad(ang))
    return SF([cx + s * (x * c - y * si), cy + s * (x * si + y * c)])
  })
}
const F_CERCHIO = cerchio(200, 200, 130)
const F_CHIUSA = caliptra(0, 200, 212, 0, 1)
const F_APERTA = caliptra(1, 266, 88, -28, 0.86)
const ANGOLI = [54, 126, 198, 270, 342]
const E = { cx: 200, cy: 170, rx: 134, ry: 46 }
export const morphFiore = (t: number) => tra(t, 0.08, 0.66)
export function fasiFiore(t: number) {
  const m = morphFiore(t)
  return { m, a: easeInOut(tra(m, 0, 0.32)), b: easeInOut(tra(m, 0.36, 0.74)), c: easeOut(tra(m, 0.44, 0.96)) }
}
export const anteraFinale = (i: number): Pt => SF([E.cx + E.rx * Math.cos(rad(ANGOLI[i])), E.cy + E.ry * Math.sin(rad(ANGOLI[i]))])
const suOrbitaF = (i: number): Pt => [200 + 130 * Math.cos(rad(ANGOLI[i])), 200 + 130 * Math.sin(rad(ANGOLI[i]))]
const nascosta = (i: number): Pt => SF([196 + (i - 2) * 4, 226])
export const baseStame = (i: number): Pt => SF([200 + (i - 2) * 3.5, 252])
export function antera(i: number, t: number): { p: Pt; scala: number } {
  const { a, c } = fasiFiore(t)
  if (c > 0) return { p: misto([nascosta(i)], [anteraFinale(i)], c)[0], scala: lerp(0.35, 1, c) }
  return { p: misto([suOrbitaF(i)], [nascosta(i)], a)[0], scala: lerp(1, 0.35, a) }
}
const ETICH_FIORE: { dx: number; dy: number; ancora: 'start' | 'middle' | 'end' }[] = [
  { dx: 18, dy: 30, ancora: 'start' },
  { dx: -18, dy: 30, ancora: 'end' },
  { dx: -20, dy: -6, ancora: 'end' },
  { dx: -16, dy: -12, ancora: 'end' },
  { dx: 20, dy: -6, ancora: 'start' },
]
export const fiore: Forma = {
  forma: (t) => {
    const { a, b } = fasiFiore(t)
    return b > 0 ? misto(F_CHIUSA, F_APERTA, b) : misto(F_CERCHIO, F_CHIUSA, a)
  },
  larghezza: () => 1.2,
  tratto: scuro(C.verde, 0.3),
  riempi: scuro(C.verde, 0.3),
  opacitaRiempi: (t) => fasiFiore(t).a,
  pose: (t, n) => Array.from({ length: n }, (_, i) => ({ ...antera(i % 5, t), ang: 0 })),
  etichetta: (i, posa, t) => {
    const { c } = fasiFiore(t)
    if (c <= 0) return etichettaFuori(posa.p, 26)
    const L = ETICH_FIORE[i % 5]
    return { x: posa.p[0] + L.dx, y: posa.p[1] + L.dy, ancora: L.ancora }
  },
}

// ── 06–07 GRAPPOLO · acini che crescono, si toccano, poi invaiano ───────
function contornoGrappolo(t: number): Pt[] {
  const y0 = lerp(86, 100, t), y1 = lerp(352, 332, t), W = lerp(124, 96, easeOut(t))
  const hw = (v: number) => W * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v)), 0.7) * (1 - 0.3 * v)
  const pts: Pt[] = []
  for (let k = 0; k <= 80; k++) {
    const v = 1 - k / 80
    pts.push([200 - hw(v), y0 + v * (y1 - y0)])
  }
  for (let k = 1; k < 30; k++) {
    const s = k / 30
    pts.push([lerp(200 - hw(0), 200 + hw(0), s), y0 - 16 * Math.sin(Math.PI * s)])
  }
  for (let k = 0; k <= 80; k++) {
    const v = k / 80
    pts.push([200 + hw(v), y0 + v * (y1 - y0)])
  }
  return ricampiona(pts)
}
const G_CHIUSO = contornoGrappolo(1)
export const RAGGIO_ACINO = 12.5
/** acini del grappolo chiuso, impacchettati per file */
export const ACINI: { p: Pt; soglia: number; fila: number }[] = (() => {
  const r = caso(606)
  const out: { p: Pt; soglia: number; fila: number }[] = []
  const y0 = 100, y1 = 332, W = 96
  const hw = (v: number) => W * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * v)), 0.7) * (1 - 0.3 * v)
  let fila = 0
  for (let y = y0 + 16; y < y1 - 6; y += 21.5) {
    const v = (y - y0) / (y1 - y0)
    const largo = hw(v) - 10
    const n = Math.max(1, Math.floor((2 * largo) / 24) + 1)
    const sfas = fila % 2 ? 12 : 0
    for (let j = 0; j < n; j++) {
      const x = n === 1 ? 200 : 200 - largo + (j * 2 * largo) / (n - 1)
      out.push({ p: [x + (n > 1 ? sfas * 0.25 : 0), y + (r() - 0.5) * 3], soglia: r(), fila })
    }
    fila++
  }
  return out
})()
/** gli acini su cui stanno le pratiche: file diverse, lati alterni (le etichette non si toccano) */
const ACINI_PRATICHE = (() => {
  const file = new Map<number, number[]>()
  ACINI.forEach((a, j) => {
    file.set(a.fila, [...(file.get(a.fila) ?? []), j])
  })
  const righe = [...file.values()]
  return [1, 3, 5, 7].map((r, k) => {
    const fila = righe[Math.min(r, righe.length - 1)]
    const ord = [...fila].sort((a, b) => ACINI[a].p[0] - ACINI[b].p[0])
    return k % 2 ? ord[ord.length - 1] : ord[0]
  })
})()
const CENTRO_G: Pt = [200, 215]
export function acinoA(j: number, t: number, fase: 6 | 7): { p: Pt; r: number } {
  const a = ACINI[j]
  if (fase === 7) return { p: a.p, r: RAGGIO_ACINO }
  const k = easeInOut(t)
  const spread = lerp(1.22, 1, k)
  return { p: [CENTRO_G[0] + (a.p[0] - CENTRO_G[0]) * spread, CENTRO_G[1] + (a.p[1] - CENTRO_G[1]) * spread], r: lerp(4.5, RAGGIO_ACINO, k) }
}
/** ogni acino vira per conto suo, sfasato */
export const coloreInvaiatura = (soglia: number, t: number) => tra(t, 0.08 + soglia * 0.6, 0.08 + soglia * 0.6 + 0.2)
const posaAcino = (fase: 6 | 7) => (t: number, n: number): Posa[] =>
  Array.from({ length: n }, (_, i) => {
    const j = ACINI_PRATICHE[i % 4]
    const { p, r } = acinoA(j, t, fase)
    return { p, scala: r / RAGGIO_ACINO, vira: fase === 7 ? coloreInvaiatura(ACINI[j].soglia, t) : 0 }
  })
const etichettaGrappolo = (_i: number, posa: Posa): Etichettatura => {
  const dx = posa.p[0] >= 200 ? 1 : -1
  return { x: dx > 0 ? 300 + 12 : 100 - 12, y: posa.p[1] + 5, ancora: dx > 0 ? 'start' : 'end', guida: true }
}
export const allegagione: Forma = {
  forma: contornoGrappolo,
  larghezza: () => 1,
  tratto: scuro(C.verde, 0.32),
  riempi: scuro(C.verde, 0.82),
  opacitaRiempi: () => 0.4,
  pose: posaAcino(6),
  etichetta: etichettaGrappolo,
}
export const invaiatura: Forma = {
  forma: () => G_CHIUSO,
  larghezza: () => 1,
  tratto: chiaro(C.vinaccia, 0.2),
  riempi: C.terra,
  opacitaRiempi: () => 0.4,
  pose: posaAcino(7),
  etichetta: etichettaGrappolo,
}

// ── 08 MATURAZIONE · sezione di un acino ────────────────────────────────
export const ACINO_C: Pt = [200, 214]
export const maturazione: Forma = {
  forma: (t) => cerchio(ACINO_C[0], ACINO_C[1], lerp(114, 120, t), lerp(114, 120, t) * 1.04),
  larghezza: () => 10,
  tratto: scuro(C.vinaccia, 0.25),
  riempi: '#c9c08e',
  opacitaRiempi: () => 0.2,
  pose: () => [
    { p: [ACINO_C[0] + 118 * Math.cos(rad(-38)), ACINO_C[1] + 123 * Math.sin(rad(-38))] }, // buccia
    { p: [150, 262] }, // polpa
    { p: [224, 236] }, // vinaccioli
  ],
  etichetta: (i, posa) =>
    i === 0
      ? { x: posa.p[0] + 18, y: posa.p[1] - 14, ancora: 'start' }
      : i === 1
        ? { x: 58, y: 334, ancora: 'end', guida: true }
        : { x: 344, y: 330, ancora: 'start', guida: true },
}

// ── 09 VENDEMMIA · dal raspo alla cassetta ──────────────────────────────
export const traiettoria = (u: number): Pt => [92 + 178 * u - 22 * Math.sin(Math.PI * u), 92 + 214 * Math.pow(u, 1.5)]
const VENDEMMIA = campiona(traiettoria)
export const vendemmia: Forma = {
  forma: () => VENDEMMIA,
  larghezza: (u) => lerp(1.4, 2.2, u),
  tratto: scuro(C.avorio, 0.4),
  riempi: C.nero,
  opacitaRiempi: () => 0,
  pose: () => [{ p: traiettoria(0.02) }, { p: traiettoria(0.52) }, { p: [346, 300] }],
  etichetta: (i, posa) =>
    i === 0
      ? { x: posa.p[0] - 24, y: posa.p[1] - 8, ancora: 'end' }
      : i === 1
        ? { x: posa.p[0] + 18, y: posa.p[1] - 6, ancora: 'start' }
        : { x: posa.p[0] - 2, y: posa.p[1] - 22, ancora: 'middle' },
}

// ── 10 CADUTA DELLE FOGLIE · l'orbita diventa il terreno ────────────────
export const SUOLO_Y = 330
const SUOLO = campiona((u) => [-30 + 460 * u, SUOLO_Y + 5 * Math.sin(u * Math.PI * 3)])
export type Caduta = { x0: number; y0: number; x1: number; da: number; giro: number }
export const FOGLIE_PRATICHE: Caduta[] = [
  { x0: 96, y0: 52, x1: 40, da: 0.1, giro: 1 },
  { x0: 214, y0: 30, x1: 200, da: 0.26, giro: -1 },
  { x0: 312, y0: 62, x1: 362, da: 0.42, giro: 1 },
]
export function cade(c: Caduta, t: number): { p: Pt; ang: number; e: number } {
  const e = easeInOut(tra(t, c.da, c.da + 0.42))
  const x = lerp(c.x0, c.x1, e) + 22 * Math.sin(e * 3 * Math.PI) * (1 - e)
  const y = lerp(c.y0, SUOLO_Y - 9, e)
  return { p: [x, y], ang: 34 * Math.sin(e * 3 * Math.PI) * (1 - e) + e * 72 * c.giro, e }
}
export const caduta: Forma = {
  forma: () => SUOLO,
  larghezza: () => 2.2,
  tratto: '#6a4220',
  riempi: C.nero,
  opacitaRiempi: () => 0,
  pose: (t, n) => Array.from({ length: n }, (_, i) => {
    const { p, ang } = cade(FOGLIE_PRATICHE[i % 3], t)
    return { p, ang, scala: 1.5 }
  }),
  etichetta: (_i, posa) => ({ x: posa.p[0], y: posa.p[1] - 20, ancora: 'middle' }),
}

/** In ordine di fase. */
export const FORME: Forma[] = [legno, pianto, germogliamento, foglia, fiore, allegagione, invaiatura, maturazione, vendemmia, caduta]
