import { useSyncExternalStore } from 'react'

/*
 * LO SPAZIO: stato condiviso tra la scena WebGL, l'input, la fase montata nel DOM e l'interfaccia.
 * I valori continui (u, arco, spinta) si leggono a ogni fotogramma dal motore e non passano da
 * React; i valori discreti (livello, fase centrale, fase aperta, dentro) si possono osservare.
 *
 *  livello  'anno' = l'arco dei pannelli sopra il vigneto; 'fase' = dentro un pannello
 *  u        0 = Anno, 1 = Fase: la posizione lungo il volo (camera, curvatura, formato del pannello)
 *  arco     posizione continua lungo l'arco, in pannelli (0 = prima fase al centro)
 *  centrale la fase il cui pannello è al centro dell'arco
 *  aperta   la fase montata nel DOM (quella in cui si entra o da cui si esce)
 *  dentro   true quando il pannello ha passato la mano al DOM: titoli, nodo e calendario entrano
 *  modo     'scena' = il canvas disegna tutto lo spazio ed è opaco; 'fase' = il canvas è trasparente
 *           sopra la tavola e disegna solo film, lanterna e grana
 */
export type Livello = 'anno' | 'fase'
export type Modo = 'scena' | 'fase'

type Discreti = { livello: Livello; centrale: number; aperta: number; dentro: boolean; modo: Modo; volo: boolean }

let discreti: Discreti = { livello: 'anno', centrale: 0, aperta: 0, dentro: false, modo: 'scena', volo: false }
const ascoltatori = new Set<() => void>()

export const spazio = {
  /** 0 = Anno, 1 = Fase (scritto dal tween del volo) */
  u: 0,
  /** posizione lungo l'arco, in pannelli */
  arco: 0,
  /** spinta verso il pannello (Anno) o fuori dalla fase (Fase): −1…1, torna a 0 con una molla */
  spinta: 0,
  get: () => discreti,
  set(p: Partial<Discreti>) {
    let cambiato = false
    for (const k in p) {
      const c = k as keyof Discreti
      if (discreti[c] !== p[c]) cambiato = true
    }
    if (!cambiato) return
    discreti = { ...discreti, ...p }
    const r = document.documentElement.dataset
    r.livello = discreti.livello
    r.modo = discreti.modo
    r.dentro = discreti.dentro ? 'si' : 'no'
    ascoltatori.forEach((f) => f())
  },
  subscribe(f: () => void) {
    ascoltatori.add(f)
    return () => {
      ascoltatori.delete(f)
    }
  },
}
spazio.set({ livello: 'anno', modo: 'scena' })
document.documentElement.dataset.livello = 'anno'
document.documentElement.dataset.modo = 'scena'
document.documentElement.dataset.dentro = 'no'

export function useSpazio<T>(sel: (d: Discreti) => T): T {
  return useSyncExternalStore(spazio.subscribe, () => sel(discreti))
}
