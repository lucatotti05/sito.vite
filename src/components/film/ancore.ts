import { tra } from '@/core/math'
import {
  ASSE_GEMMA_RACCORDO, G, S_GEMME_SPERONE, fiancoSperone, germogli, lunghezzaGermoglio, puntiGermoglio, puntiSperone, suPolilinea, type Pt,
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

const ANCORE: Record<string, (g: number) => Asse> = {
  'gemma-sperone-0': (g) => gemmaSperone(0, g),
  'germoglio-sperone-0': (g) => germoglioSperone(0, g),
}

export function ancora(nome: string, g: number): Asse {
  const f = ANCORE[nome]
  if (!f) throw new Error(`Ancora della tavola sconosciuta: ${nome}`)
  return f(g)
}
