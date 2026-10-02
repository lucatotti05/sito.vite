import { interpolaTavolozza, lerp, smooth, tra } from './math'

/*
 * CANTINA lungo l'anno. Il buio caldo resta la base; cambiano con discrezione temperatura e
 * intensità della luce, come la stessa cantina a ore e stagioni diverse:
 * inverno freddo e basso → primavera tiepida → estate calda e piena → vendemmia ambra e vinaccia
 * → autunno ruggine → di nuovo inverno.
 * Chiavi alle posizioni dell'anno (uso interno): inverno · fine inverno · risveglio · germogli ·
 * fioritura · estate · invaiatura · vendemmia · autunno · inverno.
 */
const P = [0, 0.14, 0.26, 0.36, 0.43, 0.54, 0.62, 0.74, 0.86, 1]

export type Scena = {
  cieloA: string; cieloB: string; lontano: string; medio: string; filare: string
  terra: string; chioma: string
  /** colore della luce radente */
  luce: string
  /** tinta delle ombre: fredda d'inverno, vinaccia in vendemmia */
  ombra: string
}

const RIGHE: string[][] = [
  // cieloA     cieloB     lontano    medio      filare     terra      chioma     luce       ombra
  ['#0d0d10', '#22232a', '#191a1f', '#131316', '#0f0d0e', '#0a0909', '#2a2522', '#a9b6c4', '#0b1016'],
  ['#0f0e10', '#282628', '#1c1b1d', '#161415', '#110e0e', '#0c0a09', '#2c2622', '#b8b9b2', '#0f1116'],
  ['#0f0e0d', '#2b2a22', '#1c1e19', '#161714', '#100f0d', '#0b0a08', '#2f3324', '#d4c49c', '#12130e'],
  ['#0e0f0c', '#2a3022', '#1a2219', '#141a13', '#0f120e', '#0a0c08', '#2e4128', '#dfc48a', '#10140e'],
  ['#0f0f0b', '#343324', '#1c2618', '#152014', '#0f150e', '#0a0d08', '#34512c', '#e8c47c', '#13150c'],
  ['#110f0a', '#3b321f', '#1e2516', '#172014', '#10140d', '#0b0c07', '#2d4824', '#f2bd66', '#19130a'],
  ['#120d0c', '#3a2420', '#23201a', '#1a1814', '#120f0d', '#0d0a08', '#3a3f22', '#eeae60', '#1c100e'],
  ['#130b0c', '#3e1e22', '#25191a', '#1c1314', '#140d0e', '#0e0909', '#4a3a1e', '#e69656', '#230b13'],
  ['#110c0b', '#33201a', '#261c16', '#1d1511', '#140f0c', '#0d0a08', '#5a3818', '#d88a50', '#1c0e0a'],
  ['#0d0d10', '#22232a', '#191a1f', '#131316', '#0f0d0e', '#0a0909', '#2a2522', '#a9b6c4', '#0b1016'],
]
/** intensità della luce: bassa d'inverno, piena d'estate */
const FORZA = [0.55, 0.6, 0.7, 0.8, 0.88, 1, 0.96, 0.9, 0.74, 0.55]
/** altezza del sole, 0 = radente all'orizzonte, 1 = alta: bassa d'inverno, alta d'estate */
const ALTEZZA = [0.1, 0.16, 0.3, 0.45, 0.58, 0.85, 0.74, 0.5, 0.28, 0.1]

const CHIAVI = RIGHE.map((r, i) => ({
  p: P[i],
  c: { cieloA: r[0], cieloB: r[1], lontano: r[2], medio: r[3], filare: r[4], terra: r[5], chioma: r[6], luce: r[7], ombra: r[8] },
}))

export const scenaA = (p: number) => interpolaTavolozza(CHIAVI, p)

const interpola = (v: number[], p: number) => {
  let i = 0
  while (i < P.length - 2 && p > P[i + 1]) i++
  return lerp(v[i], v[i + 1], smooth(tra(p, P[i], P[i + 1])))
}
export const forzaLuceA = (p: number) => interpola(FORZA, p)
export const altezzaLuceA = (p: number) => interpola(ALTEZZA, p)
