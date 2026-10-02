/*
 * Misure del palco e degli slot, lette solo quando cambiano (ResizeObserver), mai durante
 * l'aggiornamento di un fotogramma: leggere clientWidth/offsetTop dopo aver scritto stili
 * costringe il browser a ricalcolare tutto il layout a ogni fotogramma.
 */
export type Rett = { x: number; y: number; w: number; h: number }
export const misure = {
  vw: window.innerWidth,
  H: window.innerHeight,
  slot: { x: 0, y: 0, w: 0, h: 0 } as Rett,
  dock: { x: 0, y: 0, w: 0, h: 0 } as Rett,
}
const rett = (el: HTMLElement | null): Rett => (el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : { x: 0, y: 0, w: 0, h: 0 })

let osservatore: ResizeObserver | null = null
export function osservaPalco(palco: HTMLElement, dopo: () => void) {
  const leggi = () => {
    misure.vw = palco.clientWidth
    misure.H = palco.clientHeight
    misure.slot = rett(palco.querySelector('.slot-carta'))
    misure.dock = rett(palco.querySelector('.slot-carta-dock'))
    dopo()
  }
  osservatore?.disconnect()
  osservatore = new ResizeObserver(leggi)
  osservatore.observe(palco)
  leggi()
  return () => osservatore?.disconnect()
}
