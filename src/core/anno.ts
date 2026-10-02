import { useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * IL valore guida: progresso dell'anno, 0–1, derivato dallo scroll (vedi Scorrimento.tsx).
 * Vite, calendario, scene, nodi e carte leggono solo questo. Non diventa mai una data a schermo.
 */
let p = 0
const ascoltatori = new Set<() => void>()

export const anno = {
  get: () => p,
  set(v: number) {
    if (v === p) return
    p = v
    ascoltatori.forEach((f) => f())
  },
  subscribe(f: () => void) {
    ascoltatori.add(f)
    return () => {
      ascoltatori.delete(f)
    }
  },
}

/** Rilegge il componente solo quando il valore derivato (primitivo) cambia. */
export function useAnno<T extends number | string | boolean>(derivato: (p: number) => T): T {
  return useSyncExternalStore(anno.subscribe, () => derivato(p))
}

/** Per il movimento a ogni fotogramma: chiama `f(p)` fuori dal ciclo di React. */
export function useAnnoFotogramma(f: (p: number) => void, deps: unknown[] = []) {
  const rif = useRef(f)
  rif.current = f
  useEffect(() => {
    const giro = () => rif.current(p)
    giro()
    const stacca = anno.subscribe(giro)
    window.addEventListener('resize', giro)
    return () => {
      stacca()
      window.removeEventListener('resize', giro)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
