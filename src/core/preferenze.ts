import { useSyncExternalStore } from 'react'

/*
 * Preferenze di movimento. Non ci sono temi: Cantina è lo stile del sito.
 * - prefers-reduced-motion (o ?movimento=ridotto per le prove): niente parallasse né morph, solo dissolvenze.
 * - P (strumento di sviluppo, nessun pannello): accende e spegne la parallasse; ?parallasse=0 nell'indirizzo.
 */

type Stato = { parallasse: boolean; ridotto: boolean }

const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
const qs = new URLSearchParams(location.search)
const ridottoForzato = qs.get('movimento') === 'ridotto'

let stato: Stato = {
  parallasse: qs.get('parallasse') !== '0',
  ridotto: ridottoForzato || mq.matches,
}

const ascoltatori = new Set<() => void>()
const avvisa = () => ascoltatori.forEach((f) => f())

function applica() {
  document.documentElement.dataset.movimento = stato.ridotto ? 'ridotto' : 'pieno'
  const u = new URL(location.href)
  u.searchParams.delete('tema') // indirizzi vecchi dei tre temi
  if (stato.parallasse) u.searchParams.delete('parallasse')
  else u.searchParams.set('parallasse', '0')
  if (u.href !== location.href) history.replaceState(history.state, '', u)
}
applica()

mq.addEventListener('change', () => {
  stato = { ...stato, ridotto: ridottoForzato || mq.matches }
  applica()
  avvisa()
})

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'p' && e.key !== 'P')) return
  if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
  stato = { ...stato, parallasse: !stato.parallasse }
  applica()
  avvisa()
})

export const preferenze = {
  get: () => stato,
  subscribe(f: () => void) {
    ascoltatori.add(f)
    return () => {
      ascoltatori.delete(f)
    }
  },
}

export const usePreferenze = () => useSyncExternalStore(preferenze.subscribe, preferenze.get)

/** Parallasse effettiva: spenta con P o dal movimento ridotto. */
export const parallasseAttiva = () => stato.parallasse && !stato.ridotto
