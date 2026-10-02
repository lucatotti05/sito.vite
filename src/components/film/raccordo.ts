import { clamp, smooth, tra } from '@/core/math'
import { preferenze } from '@/core/preferenze'
import { FASI, filmA, giornoDa } from '@/core/tempo'
import { regia } from '../vite/camera'
import type { Pt } from '../vite/geometria'
import { ancora } from './ancore'
import { FILM, type Manifesto } from './registro'

/*
 * IL PASSAGGIO INVISIBILE tra la vite disegnata e la clip. Tutto dipende da f, l'avanzamento
 * nei 1,5 schermi del momento film (quindi dallo scroll: si ferma se ci si ferma, torna indietro).
 * La camera non smette mai di avvicinarsi: prima avanza nella tavola, poi dentro la clip.
 *
 *  0 ─ 0,17     la camera si avvicina alla gemma disegnata (fino a circa 5×) finché coincide, per
 *               posizione, misura e asse, con la gemma della clip, che compare piccola (27 %)
 *               nello stesso punto; la vite sfoca e si scurisce, la luce si scalda e si abbassa
 *  0,17 ─ 0,23  dissolvenza locale: la gemma vera prende il posto di quella disegnata
 *  0,23 ─ 0,40  la clip si ingrandisce attorno alla gemma fino a coprire lo schermo, il portale
 *               si allarga; la vite disegnata resta agganciata e si avvicina appena (parallasse)
 *  0,23 ─ 0,77  scorrono i fotogrammi (sotto, l'anno avanza: la vite mette i germogli)
 *  0,60 ─ 0,77  speculare: la clip si allontana attorno al germoglio e la maschera si richiude
 *  0,77 ─ 0,83  dissolvenza sul germoglio disegnato, che coincide con quello dell'ultimo fotogramma
 *  0,83 ─ 1     la camera torna alla sua inquadratura
 * A metà (0,5), con la clip a tutto schermo, la camera passa dal raccordo d'ingresso a quello
 * d'uscita: la vite è coperta e il cambio non si vede.
 */
export const T = {
  aggancio: 0.17,
  dissolveIn: [0.17, 0.23],
  apre: [0.23, 0.4],
  /** scala della clip al momento del raccordo (1 = copre lo schermo) */
  piccola: 0.27,
  clip: [0.23, 0.77],
  chiude: [0.6, 0.77],
  dissolveOut: [0.77, 0.83],
  esce: 0.83,
  cambio: 0.5,
} as const

export type Quadro = { scala: number; ox: number; oy: number; dw: number; dh: number }

/** Come il fotogramma sta sullo schermo: copre lo schermo e tiene il soggetto dove la regia mette la vite. */
export function quadroClip(m: Manifesto, vw: number, H: number): Quadro {
  const { larghezza: IW, altezza: IH } = m.fotogrammi
  const r = regia(vw)
  const verticale = vw / H < 0.9
  // su schermi verticali il fotogramma non copre tutto in altezza: resta una fascia sopra e sotto
  // che sfuma nel fondo (lì stanno sottotitoli e barra delle fasi)
  const scala = verticale ? Math.max(vw / IW, (H * 0.62) / IH) : Math.max(vw / IW, H / IH)
  const dw = IW * scala, dh = IH * scala
  const [fx, fy] = m.inquadratura.fuoco
  const ox = clamp(r.ax * vw - fx * dw, vw - dw, 0)
  const oy = dh >= H ? clamp(r.ay * H - fy * dh, H - dh, 0) : clamp(r.ay * H - fy * dh, 0, H - dh)
  return { scala, ox, oy, dw, dh }
}
export const daFotogramma = (q: Quadro, [x, y]: [number, number]): Pt => [q.ox + x * q.dw, q.oy + y * q.dh]
/** Il quadro ridotto di z attorno al punto c dello schermo. */
const riduci = (q: Quadro, c: Pt, z: number): Quadro => ({
  scala: q.scala * z, ox: c[0] + (q.ox - c[0]) * z, oy: c[1] + (q.oy - c[1]) * z, dw: q.dw * z, dh: q.dh * z,
})

/** Camera che mette l'ancora della tavola (base → punta) esattamente sul segmento a schermo. */
export type Aggancio = { x: number; y: number; h: number; ruota: number; perno: Pt }
function aggancio(base: Pt, punta: Pt, sBase: Pt, sPunta: Pt, H: number): Aggancio {
  const u = Math.hypot(sPunta[0] - sBase[0], sPunta[1] - sBase[1]) / Math.hypot(punta[0] - base[0], punta[1] - base[1])
  let ruota = (Math.atan2(sPunta[1] - sBase[1], sPunta[0] - sBase[0]) - Math.atan2(punta[1] - base[1], punta[0] - base[0])) * (180 / Math.PI)
  while (ruota > 180) ruota -= 360
  while (ruota < -180) ruota += 360
  return { x: base[0] - sBase[0] / u, y: base[1] - sBase[1] / u, h: H / u, ruota, perno: sBase }
}

export type StatoFilm = {
  m: Manifesto
  f: number
  quadro: Quadro
  /** scala della clip rispetto all'inquadratura che copre lo schermo */
  scalaClip: number
  /** peso della camera di raccordo (0 = camera della stagione, 1 = agganciata) */
  k: number
  aggancio: Aggancio
  /** punto della tavola agganciato (serve alla camera per mescolare le due inquadrature) */
  ancoraTavola: Pt
  /** fotogramma, frazionario */
  fotogramma: number
  /** clip: avanzamento 0–1 (note e sottotitoli) */
  t: number
  alfa: number
  /** il portale sulla clip: centro e raggio (px), apertura 0–1 (forma organica → cerchio) */
  maschera: { cx: number; cy: number; r: number }
  apertura: number
  /** la clip copre tutto lo schermo (la tavola sotto non si vede) */
  coperta: boolean
  sfoca: number
  buio: number
  luce: number
}

let chiave = ''
let ultimo: StatoFilm | null = null
/** Solo per le anteprime dei pannelli (src/Anteprima.tsx): la tavola senza il raccordo col film. */
export const regolaFilm = { spento: false }

/** Lo stato del momento film al punto p dell'anno (null fuori dai momenti film). */
export function statoFilm(p: number, vw: number, H: number): StatoFilm | null {
  if (regolaFilm.spento) return null
  const c = `${p}|${vw}|${H}|${preferenze.get().ridotto}`
  if (c === chiave) return ultimo
  chiave = c
  ultimo = calcola(p, vw, H)
  return ultimo
}

function calcola(p: number, vw: number, H: number): StatoFilm | null {
  const a = filmA(p)
  if (!a) return null
  const m = FILM.find((x) => x.id === a.id)
  if (!m) return null
  const f = a.f
  const ridotto = preferenze.get().ridotto
  const coprente = quadroClip(m, vw, H)
  const g = giornoDa(p)
  const entra = f < T.cambio
  const seg = entra ? m.soggetto.inizio : m.soggetto.fine
  // la clip cresce (e all'uscita cala) attorno al soggetto: scala in logaritmo, percettivamente uniforme
  const e = entra ? smooth(tra(f, T.apre[0], T.apre[1])) : 1 - smooth(tra(f, T.chiude[0], T.chiude[1]))
  const z = ridotto ? 1 : Math.exp(Math.log(T.piccola) * (1 - e))
  const centro = daFotogramma(coprente, seg.centro)
  const q = riduci(coprente, centro, z)
  const asse = ancora(entra ? m.tavola.inizio : m.tavola.fine, g)
  // la tavola resta agganciata al soggetto ma, mentre la clip cresce dentro il portale, si avvicina
  // appena (parallasse, al più 1,35×): un ingrandimento di 3,7× la riempirebbe di tratti enormi e
  // confusi attorno al portale. Il soggetto disegnato è già coperto dalla clip, il distacco non si vede
  const zT = ridotto ? 1 : Math.exp(Math.log(T.piccola) * (1 - e * 0.23))
  const qT = riduci(coprente, centro, zT)
  const ag = aggancio(asse.base, asse.punta, daFotogramma(qT, seg.base), daFotogramma(qT, seg.punta), H)
  const k = ridotto ? 0 : entra ? smooth(tra(f, 0, T.aggancio)) : 1 - smooth(tra(f, T.esce, 1))
  const nF = m.fotogrammi.numero
  const t = tra(f, T.clip[0], T.clip[1])
  // IL PORTALE (come una scheda che si apre su jesperlandberg.com): sulla gemma disegnata, quando
  // coincide con quella filmata, si apre una forma organica dal bordo di luce che cresce fino a
  // coprire lo schermo e rivela la clip; all'uscita si richiude sul germoglio. Il raggio cresce in
  // modo percettivamente uniforme (prima piano, poi veloce, poi si posa) e parte da zero.
  const R = Math.max(Math.hypot(centro[0], centro[1]), Math.hypot(vw - centro[0], centro[1]), Math.hypot(centro[0], H - centro[1]), Math.hypot(vw - centro[0], H - centro[1])) * 1.12
  const apertura = ridotto ? 1 : entra ? smooth(tra(f, 0.15, 0.42)) : 1 - smooth(tra(f, 0.58, 0.85))
  const alfa = ridotto ? Math.min(tra(f, 0.1, 0.25), 1 - tra(f, 0.75, 0.9)) : apertura > 0.0005 ? 1 : 0
  const rMin = seg.raggio * q.dh * 0.25
  const maschera = ridotto
    ? { cx: vw / 2, cy: H / 2, r: Math.hypot(vw, H) * 1.2 }
    : { cx: centro[0], cy: centro[1], r: apertura <= 0 ? 0 : rMin * Math.pow(R / rMin, Math.pow(apertura, 0.85)) * Math.min(1, apertura * 8) }
  const coperta = ridotto ? alfa >= 1 : maschera.r >= R * 0.995
  const dentro = ridotto ? 0 : Math.min(tra(f, 0.06, 0.3), 1 - tra(f, 0.7, 0.94))
  return {
    m, f, quadro: q, k, aggancio: ag, ancoraTavola: asse.base, scalaClip: z,
    fotogramma: t * (nF - 1), t, alfa,
    maschera, apertura, coperta,
    sfoca: dentro,
    buio: dentro,
    luce: smooth(Math.min(tra(f, 0, 0.2), 1 - tra(f, 0.8, 1))),
  }
}

/** Fase (indice) del primo film: serve a decidere quando iniziare a caricare i fotogrammi. */
export const fasiConFilm = () => FILM.map((m) => FASI.findIndex((x) => x.numero === m.fase)).filter((i) => i >= 0)
