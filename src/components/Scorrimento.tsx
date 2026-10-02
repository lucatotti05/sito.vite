import { useLayoutEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { ciclo } from '@/core/ciclo'
import { D, E } from '@/core/movimento'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { anno } from '@/core/anno'
import { osservaPalco } from '@/core/misure'
import { preferenze, usePreferenze } from '@/core/preferenze'
import { FASI, SCHERMI, TRATTI_FILM, indiceFase, pDaSigma, sigmaDaP, tFase } from '@/core/tempo'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

// solo per le prove automatiche: posizione di scroll (0–1) che corrisponde a un punto dell'anno
;(window as unknown as { __sigma: (p: number) => number }).__sigma = (p) => sigmaDaP(p) / SCHERMI
// e il punto f (0–1) del primo momento film
;(window as unknown as { __film: (f: number) => number }).__film = (f) => {
  const t = [...TRATTI_FILM.values()][0]
  return t ? (t.s0 + f * (t.s1 - t.s0)) / SCHERMI : 0
}

let contenitore: HTMLElement | null = null
/** Scroll fluido (Lenis) per rotella e trackpad; il tocco resta nativo. Spento con movimento ridotto. */
let lenis: Lenis | null = null
/** fase verso cui sta andando uno scorrimento animato: le pressioni ripetute di ⇧ + freccia si sommano */
let obiettivo: number | null = null

/**
 * Porta lo scroll al punto dell'anno p. Con `fluido` lo scorrimento è animato (durata in base
 * alla distanza; si interrompe se l'utente scorre); con movimento ridotto è sempre immediato.
 */
export function vaiA(p: number, fluido = false) {
  if (!contenitore) return
  const corsa = contenitore.offsetHeight - window.innerHeight
  const y = contenitore.offsetTop + (sigmaDaP(p) / SCHERMI) * corsa
  gsap.killTweensOf(window)
  if (!fluido || preferenze.get().ridotto) {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
    else window.scrollTo({ top: y, behavior: 'instant' })
    return
  }
  // un salto di fase è un passaggio di scena non guidato dallo scroll: --d-scena, --ease-in-out
  const durata = D.scena
  ciclo.sveglia()
  if (lenis) {
    // si interrompe da sola se l'utente scorre: Lenis prende il nuovo bersaglio
    lenis.scrollTo(y, {
      duration: durata,
      easing: (t) => E.inOut(t),
      force: true,
      onComplete: () => (obiettivo = null),
    })
    return
  }
  gsap.to(window, {
    scrollTo: { y, autoKill: true },
    duration: durata,
    ease: E.inOut,
    onComplete: () => (obiettivo = null),
    onInterrupt: () => (obiettivo = null),
  })
}
/** Un passo di tastiera: con Lenis scorre fluido verso il bersaglio (le pressioni ripetute si sommano). */
function scorriDi(d: number) {
  ciclo.sveglia()
  if (lenis) lenis.scrollTo(lenis.targetScroll + d, { force: true })
  else window.scrollBy({ top: d, behavior: 'instant' })
}
/** Va all'inizio di una fase (indice 0–9) e la scrive nell'indirizzo come ?fase=N. */
export function vaiAFase(i: number, fluido = true) {
  const j = Math.max(0, Math.min(FASI.length - 1, i))
  obiettivo = fluido && !preferenze.get().ridotto ? j : null
  vaiA(FASI[j].inizio + 0.0004, fluido)
  const u = new URL(location.href)
  u.searchParams.set('fase', String(j + 1))
  u.hash = ''
  history.replaceState(history.state, '', u)
}
/** Ricomincia l'anno dal frontespizio. */
export function ricomincia() {
  vaiA(0, true)
  const u = new URL(location.href)
  u.searchParams.delete('fase')
  u.hash = ''
  history.replaceState(history.state, '', u)
}

/**
 * Lo scroll verticale (rotella, swipe, frecce) diventa il progresso dell'anno.
 * Il contenitore è alto quanto l'anno; il palco resta fermo (sticky) e tutto ciò che si muove
 * in orizzontale legge `anno`.
 */
export function Scorrimento({ children }: { children: ReactNode }) {
  const rif = useRef<HTMLDivElement>(null)
  const { ridotto } = usePreferenze()

  useLayoutEffect(() => {
    contenitore = rif.current
    // Lenis leviga rotella e trackpad e passa ogni posizione a ScrollTrigger; lo scrub è diretto
    // (nessun secondo smorzamento: prima lo scrub da 0,75 s si sommava e il sito sembrava in ritardo)
    // Lenis gira nel ciclo unico (core/ciclo.ts) solo mentre scorre: a riposo il ciclo si ferma
    let stacca: (() => void) | null = null
    if (!ridotto && new URLSearchParams(location.search).get('lenis') !== '0') {
      const l = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: false })
      lenis = l
      l.on('scroll', ScrollTrigger.update)
      stacca = ciclo.aggiungi((ora) => {
        l.raf(ora)
        return l.isScrolling !== false
      })
    }
    const st = ScrollTrigger.create({
      trigger: rif.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => anno.set(pDaSigma(self.progress * SCHERMI)),
    })
    return () => {
      st.kill()
      stacca?.()
      lenis?.destroy()
      lenis = null
    }
  }, [ridotto])

  // misure del palco: lette solo al ridimensionamento, poi ridisegna il fotogramma
  useLayoutEffect(() => {
    const palco = rif.current?.querySelector<HTMLElement>('.palco')
    if (!palco) return
    return osservaPalco(palco, () => {
      const p = anno.get()
      anno.set(p + 1e-9)
      anno.set(p)
    })
  }, [])

  // ?fase=5 (o #fase-5) nell'indirizzo porta direttamente a quella fase
  useLayoutEffect(() => {
    const daIndirizzo = () => {
      const n = Number(new URLSearchParams(location.search).get('fase') ?? location.hash.match(/^#fase-(\d+)$/)?.[1])
      if (n >= 1 && n <= FASI.length) requestAnimationFrame(() => vaiA(FASI[n - 1].inizio + 0.0004))
    }
    daIndirizzo()
    window.addEventListener('hashchange', daIndirizzo)
    return () => window.removeEventListener('hashchange', daIndirizzo)
  }, [])

  useLayoutEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('dialog, input, textarea, select, [data-tasti-propri]')) return
      const passo = window.innerHeight * 0.14
      const i = obiettivo ?? indiceFase(anno.get())
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          if (e.shiftKey) vaiAFase(i + 1)
          else scorriDi(passo)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          if (e.shiftKey) vaiAFase(obiettivo === null && tFase(anno.get(), i) > 0.04 ? i : i - 1)
          else scorriDi(-passo)
          break
        case 'PageDown':
          vaiAFase(i + 1)
          break
        case 'PageUp':
          vaiAFase(obiettivo === null && tFase(anno.get(), i) > 0.04 ? i : i - 1)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', tasti)
    return () => window.removeEventListener('keydown', tasti)
  }, [])

  return (
    <div ref={rif} className="corsa" style={{ height: `calc(${SCHERMI.toFixed(3)} * 100svh + 100svh)` }}>
      <div className="palco">{children}</div>
    </div>
  )
}
