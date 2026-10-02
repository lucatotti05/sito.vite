import gsap from 'gsap'
import { lerp, smooth, tra } from '@/core/math'
import { D, E } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { statoFilm } from '../film/raccordo'

/*
 * LA MACCHINA DA PRESA SULLA VITE.
 * La vite non è più una tavola in un riquadro: occupa tutto il palco e la "camera" sceglie
 * cosa inquadrare, stagione per stagione, cambiando il viewBox degli strati SVG (resta nitida
 * a qualunque ingrandimento). Largo in inverno sul legno, stretto sul capo a frutto alla
 * legatura e al pianto, sulle gemme al germogliamento, sulle infiorescenze in fioritura,
 * primo piano sul grappolo dall'invaiatura alla vendemmia, di nuovo largo in autunno, e un
 * ultimo primo piano sulle gemme che dormono nel finale.
 * Quando si sceglie una pratica nel nodo, la camera si sposta verso il punto della pianta in
 * cui la pratica si fa (vedi luoghi.ts).
 * Con movimento ridotto l'inquadratura resta larga e ferma.
 */

export type Punto = [number, number]
type Chiave = { p: number; zoom: number; fuoco: Punto | null } // null = inquadratura larga

const CHIAVI: Chiave[] = [
  { p: 0, zoom: 1, fuoco: null },
  { p: 0.1, zoom: 1.04, fuoco: null },
  { p: 0.155, zoom: 1.55, fuoco: [445, 452] }, // legatura: il capo ad archetto
  { p: 0.21, zoom: 2.3, fuoco: [505, 462] }, // pianto: i tagli che piangono, le gemme che si gonfiano
  { p: 0.258, zoom: 2.6, fuoco: [318, 440] }, // ingresso del germogliamento: le gemme cotonose dello sperone
  { p: 0.29, zoom: 2.0, fuoco: [430, 440] }, // germogliamento: le punte verdi
  { p: 0.36, zoom: 1.1, fuoco: [360, 330] }, // sviluppo: la chioma che sale
  { p: 0.425, zoom: 2.0, fuoco: [432, 388] }, // fioritura: le infiorescenze
  { p: 0.5, zoom: 1.0, fuoco: null }, // allegagione: la pianta intera, piena
  { p: 0.6, zoom: 2.7, fuoco: [438, 398] }, // invaiatura: il grappolo
  { p: 0.67, zoom: 3.5, fuoco: [442, 402] }, // maturazione: primo piano sugli acini
  { p: 0.75, zoom: 2.5, fuoco: [436, 398] }, // vendemmia
  { p: 0.82, zoom: 1.08, fuoco: null },
  { p: 0.9, zoom: 1.0, fuoco: null }, // caduta delle foglie
  { p: 0.97, zoom: 1.7, fuoco: [430, 452] }, // finale: le gemme che dormono sul capo
  { p: 1, zoom: 1.7, fuoco: [430, 452] },
]

/** Dove sta il soggetto sullo schermo e quanto è alta l'inquadratura larga, per tipo di schermo. */
export function regia(vw: number) {
  const stretto = vw < 760
  // desktop: la pianta a destra della colonna del nodo, suolo al 93% dell'altezza;
  // telefono: la pianta occupa il 60% alto dello schermo, il nodo sta sotto
  const base = stretto ? 1250 : 860
  // desktop: la pianta a destra, fuori dalla colonna dei testi
  const ax = stretto ? 0.5 : 0.62
  const ay = stretto ? 0.38 : 0.5
  const suoloY = stretto ? 0.6 : 0.93
  const largo: Punto = [330, 745 - (suoloY - ay) * base]
  return { base, ax, ay, largo }
}

/** Solo per le anteprime dei pannelli (src/Anteprima.tsx): limite allo zoom della stagione. */
export const regolaCamera = { zoomMax: Infinity }

// pratica selezionata: la camera va verso il suo luogo (0 = nessuna, 1 = arrivata)
const verso = { k: 0, luogo: [0, 0] as Punto }
const ascoltatori = new Set<() => void>()
export const camera = {
  subscribe(f: () => void) {
    ascoltatori.add(f)
    return () => {
      ascoltatori.delete(f)
    }
  },
  /** Porta la camera verso un punto della pianta (o la libera con null). */
  guarda(luogo: Punto | null) {
    if (luogo) verso.luogo = luogo
    gsap.to(verso, {
      k: luogo ? 1 : 0,
      duration: preferenze.get().ridotto ? 0 : D.scena,
      ease: E.inOut,
      overwrite: true,
      onUpdate: () => ascoltatori.forEach((f) => f()),
    })
  },
}

const lerpP = (a: Punto, b: Punto, t: number): Punto => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

export type Inquadratura = { x: number; y: number; w: number; h: number; zoom: number; ruota: number; perno: Punto }
/** Finestra visibile (viewBox) per il progresso dell'anno p, con la rotazione del raccordo film. */
export function inquadratura(p: number, vw: number, H: number): Inquadratura {
  const r = regia(vw)
  let zoom = 1
  let fuoco = r.largo
  if (!preferenze.get().ridotto) {
    let i = 0
    while (i < CHIAVI.length - 2 && p > CHIAVI[i + 1].p) i++
    const a = CHIAVI[i], b = CHIAVI[i + 1]
    const t = smooth(tra(p, a.p, b.p))
    zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)) // zoom percettivamente uniforme
    fuoco = lerpP(a.fuoco ?? r.largo, b.fuoco ?? r.largo, t)
    if (zoom > regolaCamera.zoomMax) {
      // il fuoco si avvicina all'inquadratura larga quanto lo zoom si riduce: il soggetto resta in campo
      const k = Math.log(regolaCamera.zoomMax) / Math.log(zoom)
      fuoco = lerpP(r.largo, fuoco, k)
      zoom = regolaCamera.zoomMax
    }
  }
  if (verso.k > 0) {
    fuoco = lerpP(fuoco, verso.luogo, verso.k * 0.75)
    zoom *= 1 + 0.3 * verso.k
  }
  let h = r.base / zoom
  let x = fuoco[0] - r.ax * h * (vw / H)
  let y = fuoco[1] - r.ay * h
  let ruota = 0
  let perno: Punto = [0, 0]
  // momento film: la camera si aggancia alla gemma (posizione, misura e asse del primo fotogramma).
  // Si mescolano la scala (in logaritmo) e la posizione a schermo del punto agganciato.
  const film = statoFilm(p, vw, H)
  if (film && film.k > 0) {
    const a = film.aggancio, B = film.ancoraTavola, k = film.k
    const u0 = H / h
    const S = lerpP([(B[0] - x) * u0, (B[1] - y) * u0], a.perno, k)
    h = Math.exp(lerp(Math.log(h), Math.log(a.h), k))
    const u = H / h
    x = B[0] - S[0] / u
    y = B[1] - S[1] / u
    ruota = a.ruota * k
    perno = S
  }
  return { x, y, w: h * (vw / H), h, zoom: r.base / h, ruota, perno }
}
