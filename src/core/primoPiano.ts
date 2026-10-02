import { useSyncExternalStore } from 'react'
import { anno } from './anno'
import { indiceFase } from './tempo'

/*
 * Densità (DESIGN.md, "Spazio e impaginazione"): in ogni momento un solo elemento interattivo
 * aperto, il nodo orbitale oppure la collana. L'altro resta richiuso in un indicatore discreto.
 * Il nodo è quello di partenza; a ogni cambio di fase si torna al nodo.
 */
export type Elemento = 'nodo' | 'collana'
let aperto: Elemento = 'nodo'
const asc = new Set<() => void>()
const avvisa = () => asc.forEach((f) => f())

export const primoPiano = {
  get: () => aperto,
  apri(e: Elemento) {
    if (e === aperto) return
    aperto = e
    document.documentElement.dataset.primoPiano = e
    avvisa()
  },
  subscribe(f: () => void) {
    asc.add(f)
    return () => {
      asc.delete(f)
    }
  },
}
document.documentElement.dataset.primoPiano = aperto

let fase = indiceFase(anno.get())
anno.subscribe(() => {
  const i = indiceFase(anno.get())
  if (i !== fase) {
    fase = i
    primoPiano.apri('nodo')
  }
})

export const usePrimoPiano = () => useSyncExternalStore(primoPiano.subscribe, primoPiano.get)
