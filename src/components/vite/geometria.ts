import { caso, clamp, easeInOut, lerp, tra } from '@/core/math'

/*
 * Geometria della vite (Guyot semplice), in unità della tavola 600 × 800.
 * Tutto dipende da `g`, il giorno interno dell'anno (0–365, anche frazionario): non si mostra mai.
 *
 * Gennaio: capo vecchio a sinistra con i tralci dell'anno scorso, sperone vecchio sulla testa con
 * due tralci (A e B). La potatura toglie il capo vecchio; A diventa il nuovo capo a frutto, piegato
 * ad archetto a destra; B si accorcia a sperone di due gemme. Da qui nascono i germogli dell'anno.
 */

export type Pt = [number, number]

// ── calendario biologico interno (giorni) ────────────────────────────────
export const G = {
  potaturaDa: 14, potaturaA: 40, // tagli dei tralci vecchi
  legaturaDa: 44, legaturaA: 56,
  piantoDa: 62, piantoA: 98,
  cotoneDa: 80, germoglioDa: 96,
  infiorescenze: 118, fioreDa: 146, fioreA: 168,
  invaiaturaDa: 208, invaiaturaA: 230,
  vendemmiaDa: 264, vendemmiaA: 290,
  lignificaDa: 215, lignificaA: 305,
  autunnoDa: 284, cadutaDa: 300, cadutaA: 348,
  cimatura: 176,
}

export const FILO_BANCHINA = 470
export const FILI = [FILO_BANCHINA, 372, 282, 196]
export const SUOLO = 745

// ── tralci A e B: posa eretta e posa finale ──────────────────────────────
const NA = 22
export const ORIGINE_A: Pt = [306, 452]
export const ORIGINE_B: Pt = [296, 450]
const TAGLIO_A = 0.75 // parte di A che resta come capo
const TAGLIO_B = 0.1 // parte di B che resta come sperone

const eretto = (o: Pt, dx: number, lung: number, curva: number) => (s: number): Pt => [
  o[0] + dx * s + curva * Math.sin(Math.PI * s),
  o[1] - lung * s,
]
const ERETTO_A = eretto(ORIGINE_A, 30, 360, 8)
const ERETTO_B = eretto(ORIGINE_B, -34, 340, -6)
/** Capo ad archetto legato al filo di banchina. */
const CAPO = (u: number): Pt => [ORIGINE_A[0] + 258 * u, ORIGINE_A[1] + 22 * u - 32 * Math.sin(Math.PI * u)]

/** Posa del tralcio A: 0 = eretto, 1 = legato. Restituisce i punti della parte che resta. */
export function puntiCapo(piega: number): Pt[] {
  const e = easeInOut(piega)
  return Array.from({ length: NA }, (_, i) => {
    const u = i / (NA - 1)
    const a = ERETTO_A(u * TAGLIO_A)
    const b = CAPO(u)
    // la piega procede dalla base: la punta arriva per ultima
    const k = clamp(e * 1.25 - u * 0.25)
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]
  })
}
export const puntiAEretto = () => Array.from({ length: NA }, (_, i) => ERETTO_A(i / (NA - 1)))
export const puntiBEretto = () => Array.from({ length: NA }, (_, i) => ERETTO_B(i / (NA - 1)))
export const puntiSperone = () => Array.from({ length: 6 }, (_, i) => ERETTO_B((i / 5) * TAGLIO_B))

/** Gemme del capo (8) e dello sperone (2): posizione su s della parte che resta. */
export const S_GEMME_CAPO = Array.from({ length: 8 }, (_, k) => 0.1 + k * 0.118)
export const S_GEMME_SPERONE = [0.42, 0.88]
/**
 * La gemma basale dello sperone è quella del momento film del germogliamento: è inclinata
 * rispetto allo sperone come la gemma della clip rispetto al suo tralcio, e il suo germoglio
 * parte con la stessa inclinazione (vedi film/ancore.ts).
 */
export const ASSE_GEMMA_RACCORDO = -26
/** e sta sul fianco sinistro dello sperone, non sull'asse (come nella clip, dove la gemma affianca il tralcio) */
export const FIANCO_GEMMA_RACCORDO = 2.6

/** Punto sul fianco sinistro dello sperone (gemma del raccordo film e il suo germoglio). */
export function fiancoSperone(sp: Pt[], s: number): Pt {
  const c = suPolilinea(sp, s), q = suPolilinea(sp, s + 0.02)
  const t = Math.atan2(q[1] - c[1], q[0] - c[0])
  return [c[0] + Math.sin(t) * FIANCO_GEMMA_RACCORDO, c[1] - Math.cos(t) * FIANCO_GEMMA_RACCORDO]
}

export function suPolilinea(pts: Pt[], s: number): Pt {
  const f = clamp(s) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(f))
  const t = f - i
  return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]
}

// ── capo vecchio (legno di due anni) con i tralci dell'anno scorso ───────
export const CAPO_VECCHIO = Array.from({ length: 16 }, (_, i): Pt => {
  const s = i / 15
  return [292 - 206 * s, 468 + 6 * s - 26 * Math.sin(Math.PI * s)]
})
export const TRALCI_VECCHI = (() => {
  const r = caso(42)
  return Array.from({ length: 8 }, (_, k) => {
    const base = suPolilinea(CAPO_VECCHIO, 0.1 + k * 0.11)
    const lung = 300 + r() * 70 - k * 8
    const dx = (r() - 0.5) * 50
    const pts = Array.from({ length: 16 }, (_, i): Pt => {
      const s = i / 15
      return [base[0] + dx * s * s + 6 * Math.sin(Math.PI * s) * (k % 2 ? 1 : -1), base[1] - lung * s]
    })
    return { pts, taglio: G.potaturaDa + 2 + k * 2.6 }
  })
})()

// ── nastro affusolato attorno a una polilinea ───────────────────────────
export function nastro(pts: Pt[], w0: number, w1: number) {
  const n = pts.length
  if (n < 2) return ''
  const sx: string[] = []
  const dx: string[] = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l; ty /= l
    const w = lerp(w0, w1, i / (n - 1)) / 2
    sx.push(`${(pts[i][0] - ty * w).toFixed(1)} ${(pts[i][1] + tx * w).toFixed(1)}`)
    dx.push(`${(pts[i][0] + ty * w).toFixed(1)} ${(pts[i][1] - tx * w).toFixed(1)}`)
  }
  return `M${sx.join(' L')} L${dx.reverse().join(' L')} Z`
}

// ── germogli dell'anno ───────────────────────────────────────────────────
export type Germoglio = {
  base: Pt
  lungMax: number
  scarto: number
  spinta: number
  partenza: number
  fertile: boolean
  grappoli: number[] // indici dei nodi con grappolo
  seme: number
}
export function germogli(): Germoglio[] {
  const r = caso(1234)
  const capo = puntiCapo(1)
  const sperone = puntiSperone()
  const out: Germoglio[] = []
  S_GEMME_CAPO.forEach((s, k) => {
    const base = suPolilinea(capo, s)
    out.push({
      base,
      lungMax: base[1] - 70 - r() * 50,
      scarto: (r() - 0.5) * 40,
      spinta: (k % 2 ? 1 : -1) * (6 + r() * 6),
      // acrotonia: le gemme verso la punta partono prima
      partenza: G.germoglioDa + (7 - k) * 1.2 + r() * 3,
      fertile: k > 0 && k < 7,
      grappoli: k > 0 && k < 7 ? (r() > 0.45 ? [2, 3] : [2]) : [],
      seme: k + 1,
    })
  })
  S_GEMME_SPERONE.forEach((s, k) => {
    const base = k === 0 ? fiancoSperone(sperone, s) : suPolilinea(sperone, s)
    out.push({
      base,
      lungMax: base[1] - 60 - r() * 40,
      scarto: -20 - r() * 20,
      // il germoglio della gemma del raccordo esce inclinato come nella clip, poi si raddrizza
      spinta: k === 0 ? -22 : -8,
      partenza: G.germoglioDa + 2 + r() * 3,
      fertile: k === 1,
      grappoli: k === 1 ? [2] : [],
      seme: 20 + k,
    })
  })
  return out
}

export const INTERNODO = 34

export function lunghezzaGermoglio(gm: Germoglio, g: number) {
  const eta = g - gm.partenza
  if (eta <= 0) return 0
  let L = gm.lungMax * Math.pow(1 - Math.exp(-eta / 26), 1.5)
  if (g >= G.cimatura) L = Math.min(L, gm.base[1] - 150)
  return L
}

export function puntiGermoglio(gm: Germoglio, L: number, n = 14): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const s = i / (n - 1)
    const l = L * s
    const avvio = 1 - Math.pow(1 - clamp(l / 60), 2)
    // il germoglio non è un bastone: ondeggia appena (sempre di più con la lunghezza) e la punta si piega
    const onda = Math.sin(l / 70 + gm.seme * 1.7) * 7 * clamp(l / 220)
    const piega = Math.pow(clamp((l - 200) / 160), 2) * 22 * (gm.seme % 2 ? 1 : -1)
    return [gm.base[0] + gm.spinta * avvio + gm.scarto * Math.pow(l / 360, 2) + onda + piega, gm.base[1] - l + Math.pow(clamp((l - 260) / 120), 2) * 10]
  })
}

/** Giorno in cui si forma il nodo j (inverso della crescita, numerico). */
export function giornoNodo(gm: Germoglio, j: number) {
  const target = (j + 1) * INTERNODO
  let lo = gm.partenza, hi = gm.partenza + 200
  for (let it = 0; it < 18; it++) {
    const m = (lo + hi) / 2
    if (lunghezzaGermoglio(gm, m) < target) lo = m
    else hi = m
  }
  return hi
}

// ── grappolo del Sangiovese: conico, con spalla in alto e un'ala laterale ─────
export type Acino = { x: number; y: number; r: number; soglia: number; raccolta: number; ramo: Pt }
export type Grappolo = { acini: Acino[]; raspo: string }
/**
 * Coordinate locali: il peduncolo parte da (0, -8), l'asse scende fino a ~ (0, 62).
 * Le file in alto sono più larghe (la spalla), poi il cono si stringe; l'ala nasce dal
 * peduncolo verso `lato`. Ogni acino ricorda il punto del raspo da cui pende, così dopo la
 * vendemmia resta lo scheletro del grappolo.
 */
export function grappolo(seme: number, lato: number): Grappolo {
  const r = caso(seme * 97)
  const acini: Acino[] = []
  let raspo = 'M0 -8 L0 60 '
  const file = 9
  for (let i = 0; i < file; i++) {
    const y = 3 + i * 6
    const w = 15 * Math.pow(1 - i / 9.6, 0.78) + (i <= 1 ? 2.4 : 0) + (r() - 0.5) * 1.5
    const n = Math.max(1, Math.round((2 * w) / 5.8))
    const sfasa = i % 2 ? 1.3 : -1.3
    raspo += `M${(-w * 0.8).toFixed(1)} ${(y - 1).toFixed(1)} Q0 ${(y - 4).toFixed(1)} ${(w * 0.8).toFixed(1)} ${(y - 1).toFixed(1)} `
    for (let j = 0; j < n; j++) {
      const x = (n === 1 ? 0 : -w + (j * 2 * w) / (n - 1)) + sfasa + (r() - 0.5) * 1.6
      const ramo: Pt = [x * 0.8, y - 1 - 3 * (1 - Math.abs(x) / (w + 1))]
      acini.push({ x, y: y + 2.2 + (r() - 0.5) * 1.6, r: 0.88 + r() * 0.2, soglia: r(), raccolta: r(), ramo })
    }
  }
  // ala: un piccolo grappolo che pende di lato dal peduncolo
  const ax = 15 * lato
  raspo += `M0 -2 Q${(ax * 0.6).toFixed(1)} -4 ${ax.toFixed(1)} 4 L${(ax * 1.1).toFixed(1)} 20 `
  for (let j = 0; j < 7; j++) {
    const yy = 6 + j * 2.6
    const x = ax + lato * (j % 2 ? 3 : -2) * (1 - j / 8) + (r() - 0.5)
    acini.push({ x, y: yy + 2, r: 0.78 + r() * 0.16, soglia: r(), raccolta: r(), ramo: [ax, yy - 1] })
  }
  return { acini, raspo }
}

export const fasiAcino = (g: number) => ({
  fiore: tra(g, G.fioreDa, G.fioreA),
  allegato: g >= G.fioreA,
  crescita: tra(g, G.fioreA, G.invaiaturaDa + 10),
})
