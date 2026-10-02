import gsap from 'gsap'

/*
 * UN SOLO CICLO per tutto il sito (DESIGN.md, "Movimento"): il ticker di GSAP, che già muove le
 * animazioni e ScrollTrigger. Chi ha bisogno di un fotogramma si registra con `aggiungi`; il suo
 * lavoro restituisce true finché vuole il fotogramma successivo. Quando nessuno lo chiede più il
 * ciclo si toglie dal ticker, e GSAP si addormenta da solo se non ha animazioni in corso.
 * Il primo input (rotella, tocco, tasto, puntatore) lo risveglia.
 */
type Lavoro = (ora: number) => boolean
const lavori = new Set<Lavoro>()
let registrato = false

gsap.ticker.lagSmoothing(0)
// a riposo GSAP dorme dopo mezzo secondo senza animazioni (default: 2 s)
gsap.config({ autoSleep: 30 })

function giro() {
  const ora = performance.now()
  let ancora = false
  for (const l of lavori) if (l(ora)) ancora = true
  if (!ancora) {
    gsap.ticker.remove(giro)
    registrato = false
  }
}

export const ciclo = {
  /** Registra un lavoro per fotogramma; restituisce la funzione per toglierlo. */
  aggiungi(l: Lavoro) {
    lavori.add(l)
    ciclo.sveglia()
    return () => {
      lavori.delete(l)
    }
  },
  /** Chiede almeno un fotogramma a tutti i lavori registrati. */
  sveglia() {
    if (registrato) return
    registrato = true
    gsap.ticker.add(giro)
  },
}

for (const evento of ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown', 'pointermove', 'scroll'] as const)
  window.addEventListener(evento, () => ciclo.sveglia(), { passive: true, capture: true })
