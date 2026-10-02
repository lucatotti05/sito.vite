import { mixHex } from './math'

/*
 * I colori del design system per il codice che ha bisogno del valore (interpolazioni su canvas
 * o nei disegni SVG calcolati): letti dai token CSS (token.css), così la fonte resta una sola.
 */
const leggi = (nome: string, riserva: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : riserva
}
export const C = {
  nero: leggi('nero', '#120d0a'),
  terra: leggi('terra', '#1e1611'),
  avorio: leggi('avorio', '#ede4d3'),
  oro: leggi('oro', '#c9a45c'),
  vinaccia: leggi('vinaccia', '#6e1f2b'),
  verde: leggi('verde', '#9cbf5a'),
  ambra: leggi('ambra', '#c98a3c'),
}
/** Un token scurito verso il nero (k = 0 il token, 1 il nero). */
export const scuro = (c: string, k: number) => mixHex(c, C.nero, k)
/** Un token schiarito verso l'avorio (k = 0 il token, 1 l'avorio). */
export const chiaro = (c: string, k: number) => mixHex(c, C.avorio, k)
