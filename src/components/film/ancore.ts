import { lerp, tra } from '@/core/math'
import {
  ASSE_GEMMA_RACCORDO, G, INTERNODO, S_GEMME_SPERONE, fiancoSperone, germogli, lunghezzaGermoglio, puntiGermoglio, puntiSperone, suPolilinea, type Pt,
} from '../vite/geometria'

/*
 * Ancore della tavola: i punti della vite disegnata che un momento film raccorda con il suo
 * soggetto. Ognuna restituisce, per il giorno interno g, la base e la punta del soggetto in
 * unità della tavola (600 × 800): bastano a fissare posizione, misura e asse.
 * Un nuovo film usa un'ancora esistente o ne aggiunge una qui.
 */
export type Asse = { base: Pt; punta: Pt }

const GERMOGLI = germogli()
const INDICE_SPERONE = 8 // i germogli dello sperone seguono gli 8 del capo

function gemmaSperone(k: number, g: number): Asse {
  const sp = puntiSperone()
  const s = S_GEMME_SPERONE[k]
  const c = suPolilinea(sp, s)
  const q = suPolilinea(sp, s + 0.02)
  const tang = (Math.atan2(q[1] - c[1], q[0] - c[0]) * 180) / Math.PI
  const p: Pt = k === 0 ? fiancoSperone(sp, s) : c
  const ang = ((tang + 90 + ASSE_GEMMA_RACCORDO) * Math.PI) / 180
  const scala = 1 + tra(g, G.piantoDa, G.germoglioDa) * 0.6
  const l = 8.6 * scala
  return { base: p, punta: [p[0] + Math.sin(ang) * l, p[1] - Math.cos(ang) * l] }
}

function germoglioSperone(k: number, g: number): Asse {
  const gm = GERMOGLI[INDICE_SPERONE + k]
  const L = lunghezzaGermoglio(gm, g)
  const gemma = gemmaSperone(k, g)
  if (L < 2) return gemma
  const pts = puntiGermoglio(gm, L)
  return { base: gm.base, punta: pts[pts.length - 1] }
}

/**
 * L'infiorescenza j del germoglio k (stessa posa di Grappolo in ViteTavola), che prima della
 * fioritura punta in alto e in fuori e poi pende.
 */
function infiorescenza(k: number, j: number, g: number): Asse {
  const gm = GERMOGLI[k]
  const L = Math.max(1, lunghezzaGermoglio(gm, g))
  const at = suPolilinea(puntiGermoglio(gm, L), Math.min(1, ((j + 0.6) * INTERNODO) / L))
  const lato = j % 2 ? -1 : 1
  const appare = tra(g, G.infiorescenze - 6, G.infiorescenze + 10)
  const sviluppo = appare * 0.4 + tra(g, G.infiorescenze, G.fioreDa) * 0.6
  const allegato = g >= G.fioreA
  const scala = (allegato ? lerp(1.3, 1.06, tra(g, G.fioreA, G.fioreA + 24)) : lerp(0.72, 1.3, sviluppo)) * (0.9 + (j % 2) * 0.12)
  const ang = (lerp(lato * 118, lato * 14, tra(g, G.fioreA - 4, G.fioreA + 24)) * Math.PI) / 180
  const l = 46 * scala
  // l'asse del raccordo è verticale, centrato sull'infiorescenza e lungo quanto lei: la camera la
  // porta su quella filmata per posizione e misura senza ruotare la tavola (la chioma resta diritta)
  const c: Pt = [at[0] - Math.sin(ang) * l * 0.5, at[1] + Math.cos(ang) * l * 0.5]
  return { base: [c[0], c[1] + l * 0.5], punta: [c[0], c[1] - l * 0.5] }
}

const ANCORE: Record<string, (g: number) => Asse> = {
  'infiorescenza-3': (g) => infiorescenza(3, 2, g),
  'gemma-sperone-0': (g) => gemmaSperone(0, g),
  'germoglio-sperone-0': (g) => germoglioSperone(0, g),
}

export function ancora(nome: string, g: number): Asse {
  const f = ANCORE[nome]
  if (!f) throw new Error(`Ancora della tavola sconosciuta: ${nome}`)
  return f(g)
}
