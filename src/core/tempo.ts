import fasiJson from '@/data/fasi.json'
import { FILM } from '@/components/film/registro'
import { clamp } from './math'

export type Fase = {
  id: string
  numero: number
  titolo: string
  mesi: string[]
  bbch: string
  stadio: string
  sintesi: string
  /** solo uso interno: frazione dell'anno, mai mostrata */
  inizio: number
  fine: number
  da_verificare: boolean
}

export const FASI = fasiJson as Fase[]
/** Le due fasi rifinite nel prototipo. */
export const RIFINITE = new Set([1, 5])

export const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
// confini dei mesi come frazione dell'anno (anno di 365 giorni, uso interno)
const INIZIO_MESE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365].map((d) => d / 365)

export const mesiDi = (f: Fase) =>
  f.mesi.length > 1 ? `${f.mesi[0]}–${f.mesi[f.mesi.length - 1]}` : f.mesi[0]

export function indiceFase(p: number) {
  for (let i = FASI.length - 1; i >= 0; i--) if (p >= FASI[i].inizio) return i
  return 0
}
/** Progresso dentro la fase, 0–1. */
export const tFase = (p: number, i: number) => clamp((p - FASI[i].inizio) / (FASI[i].fine - FASI[i].inizio))

/** Giorno interno (0–364) per la vite: serve al disegno, non compare mai. */
export const giornoDa = (p: number) => Math.min(364, Math.floor(clamp(p) * 365))

export function meseDa(p: number) {
  let m = 0
  while (m < 11 && p >= INIZIO_MESE[m + 1]) m++
  return m
}
export const inizioMese = (m: number) => INIZIO_MESE[m]

// ── scroll ───────────────────────────────────────────────────────────────
// Unità: "schermi" (σ), 1 = un'altezza di finestra. Ogni fase riceve:
// - una breve PAUSA all'ingresso (0,25 schermi) in cui l'anno avanza appena: si legge il titolo;
//   chi scorre veloce la attraversa senza accorgersene (nessuno scatto, nessuna calamita);
// - se ha un momento film, un tratto di 1,5 schermi in cui scorre la clip (e sotto, poco anno);
// - il resto, proporzionale alla durata, con un minimo.
// La velocità dell'anno (dp/dσ) passa da un tratto all'altro con raccordi morbidi: la camera e
// tutto ciò che legge p non ha mai sobbalzi. La mappa è una tabella, invertibile e deterministica.

export const PAUSA_S = 0.25
export const FILM_S = 1.5
const LENTO = 0.025 // parte della fase che passa durante la pausa
const SCALA = 0.735
const PESI = FASI.map((f) => (0.85 + 5 * (f.fine - f.inizio)) * (RIFINITE.has(f.numero) ? 1.4 : 1) * SCALA)

type Tratto = { s0: number; s1: number; p0: number; p1: number }
const TRATTI: Tratto[] = []
/** tratto del film di ogni fase (indice fase → σ e p d'inizio e fine) */
export const TRATTI_FILM = new Map<number, Tratto & { id: string }>()
const INIZI: number[] = []
const LARGHEZZE: number[] = []
{
  let s = 0
  FASI.forEach((f, i) => {
    const span = f.fine - f.inizio
    INIZI.push(s)
    let p = f.inizio
    const film = FILM.find((m) => m.fase === f.numero)
    // la prima fase si apre col frontespizio, che è già una pausa
    if (i > 0) {
      TRATTI.push({ s0: s, s1: s + PAUSA_S, p0: p, p1: p + LENTO * span })
      s += PAUSA_S
      p += LENTO * span
    }
    if (film) {
      const t = { s0: s, s1: s + FILM_S, p0: p, p1: p + film.anno.quota * span }
      TRATTI.push(t)
      TRATTI_FILM.set(i, { ...t, id: film.id })
      s += FILM_S
      p = t.p1
    }
    TRATTI.push({ s0: s, s1: s + PESI[i], p0: p, p1: f.fine })
    s += PESI[i]
    LARGHEZZE.push(s - INIZI[i])
  })
}
export const SCHERMI = TRATTI[TRATTI.length - 1].s1

// tabella σ → p: la velocità a tratti costanti viene ammorbidita con una media mobile triangolare
// (RACCORDO schermi per lato), poi integrata. I confini si spostano di pochi centesimi di schermo;
// chi deve sapere dov'è (il film) lo chiede in σ, non in p.
const PASSI = 4096
const RACCORDO = 0.07
const TAB = new Float64Array(PASSI + 1)
{
  const ds = SCHERMI / PASSI
  const v = new Float64Array(PASSI)
  for (let k = 0; k < PASSI; k++) {
    const s = (k + 0.5) * ds
    const t = TRATTI.find((x) => s < x.s1) ?? TRATTI[TRATTI.length - 1]
    v[k] = (t.p1 - t.p0) / (t.s1 - t.s0)
  }
  const r = Math.round(RACCORDO / ds)
  let acc = 0
  for (let k = 0; k < PASSI; k++) {
    let a = 0, n = 0
    for (let j = Math.max(0, k - r); j <= Math.min(PASSI - 1, k + r); j++) {
      const w = 1 - Math.abs(j - k) / (r + 1)
      a += v[j] * w
      n += w
    }
    acc += a / n
    TAB[k + 1] = acc
  }
  for (let k = 0; k <= PASSI; k++) TAB[k] /= acc
}

/** σ (schermi scorsi) → progresso dell'anno. */
export function pDaSigma(sigma: number) {
  const f = (clamp(sigma, 0, SCHERMI) / SCHERMI) * PASSI
  const k = Math.min(PASSI - 1, Math.floor(f))
  return TAB[k] + (TAB[k + 1] - TAB[k]) * (f - k)
}
/** progresso dell'anno → σ. Serve a posizionare scene e titoli sul nastro orizzontale. */
export function sigmaDaP(p: number) {
  const q = clamp(p)
  let lo = 0, hi = PASSI
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (TAB[m] <= q) lo = m
    else hi = m
  }
  const d = TAB[hi] - TAB[lo]
  return ((lo + (d > 0 ? (q - TAB[lo]) / d : 0)) / PASSI) * SCHERMI
}
export const sigmaInizioFase = (i: number) => INIZI[i]
export const larghezzaFase = (i: number) => LARGHEZZE[i]

/** Il momento film in corso al punto p dell'anno: avanzamento 0–1 sui suoi 1,5 schermi, o null. */
export function filmA(p: number) {
  if (!TRATTI_FILM.size) return null
  const s = sigmaDaP(p)
  for (const [i, t] of TRATTI_FILM) if (s >= t.s0 && s <= t.s1) return { fase: i, id: t.id, f: (s - t.s0) / (t.s1 - t.s0) }
  return null
}
/** p dell'anno in un punto del tratto film (f 0–1) della fase i. */
export function pDelFilm(i: number, f: number) {
  const t = TRATTI_FILM.get(i)
  return t ? pDaSigma(t.s0 + f * (t.s1 - t.s0)) : 0
}
