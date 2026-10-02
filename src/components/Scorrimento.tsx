import { useLayoutEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { ciclo } from '@/core/ciclo'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { anno } from '@/core/anno'
import { osservaPalco } from '@/core/misure'
import { usePreferenze } from '@/core/preferenze'
import { FASI, TRATTI_FILM, pDaSigma, pistaFase } from '@/core/tempo'
import { spazio, useSpazio } from '@/spazio/stato'

gsap.registerPlugin(ScrollTrigger)

/*
 * LO SCROLL DELLA FASE. Nel livello Fase lo scroll verticale (rotella, swipe, frecce) fa avanzare
 * la fase aperta: la pista è lunga quanto la sola fase (larghezzaFase, in schermi) e ogni punto
 * diventa il progresso dell'anno con la stessa tabella di prima (tempo.ts). Vite, film, titoli,
 * nodo e calendario continuano a leggere solo `anno`.
 * Nel livello Anno la pagina non scorre: lo scroll orizzontale muove l'arco (spazio/input.ts).
 */

// solo per le prove automatiche: posizione di scroll (0–1) del punto f (0–1) del primo momento film
;(window as unknown as { __film: (f: number) => number }).__film = (f) => {
  const [i, t] = [...TRATTI_FILM.entries()][0] ?? [0, null]
  if (!t) return 0
  const pista = pistaFase(i)
  return (t.s0 + f * (t.s1 - t.s0) - pista.s0) / pista.lunga
}

let contenitore: HTMLElement | null = null
let lenis: Lenis | null = null
let montata = 0

const corsa = () => (contenitore ? contenitore.offsetHeight - window.innerHeight : 0)
const pInizio = (i: number) => pDaSigma(pistaFase(i).s0)

/**
 * Monta la fase i nel DOM: la pista prende la sua lunghezza e (con `daCapo`, o se cambia fase)
 * lo scroll torna al suo inizio. L'anno si posa sull'inizio della fase.
 */
export function montaFase(i: number, daCapo = false) {
  const j = Math.max(0, Math.min(FASI.length - 1, i))
  const cambia = j !== montata
  montata = j
  spazio.set({ aperta: j })
  if (contenitore) contenitore.style.height = `calc(${pistaFase(j).lunga.toFixed(3)} * 100svh + 100svh)`
  if (cambia || daCapo) {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true })
    window.scrollTo(0, 0)
    anno.set(pInizio(j))
  }
  ScrollTrigger.refresh()
}

/** Nel livello Fase la pagina scorre; nell'Anno no. */
export function attivaScroll(si: boolean) {
  document.documentElement.classList.toggle('scorre', si)
  if (si) lenis?.start()
  else lenis?.stop()
  ciclo.sveglia()
}

/** Se lo scroll della fase è arrivato a un estremo (per la spinta oltre l'inizio o la fine). */
export function limiteScroll(): 'su' | 'giu' | null {
  const y = lenis ? lenis.targetScroll : window.scrollY
  const max = corsa()
  if (y <= 1) return 'su'
  if (y >= max - 1) return 'giu'
  return null
}

/** Un passo di tastiera: con Lenis scorre fluido (le pressioni ripetute si sommano). */
function scorriDi(d: number) {
  ciclo.sveglia()
  if (lenis) lenis.scrollTo(lenis.targetScroll + d, { force: false })
  else window.scrollBy({ top: d, behavior: 'instant' })
}

export function Scorrimento({ children }: { children: ReactNode }) {
  const rif = useRef<HTMLDivElement>(null)
  const { ridotto } = usePreferenze()
  const aperta = useSpazio((d) => d.aperta)

  useLayoutEffect(() => {
    contenitore = rif.current
    let stacca: (() => void) | null = null
    if (!ridotto && new URLSearchParams(location.search).get('lenis') !== '0') {
      const l = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false, autoRaf: false })
      lenis = l
      l.on('scroll', ScrollTrigger.update)
      if (!document.documentElement.classList.contains('scorre')) l.stop()
      stacca = ciclo.aggiungi((ora) => {
        l.raf(ora)
        return l.isScrolling !== false
      })
    }
    const st = ScrollTrigger.create({
      trigger: rif.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        if (spazio.get().modo !== 'fase' && spazio.get().livello !== 'fase') return
        const pista = pistaFase(montata)
        anno.set(pDaSigma(pista.s0 + self.progress * pista.lunga))
      },
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

  useLayoutEffect(() => {
    const tasti = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (spazio.get().modo !== 'fase') return
      const el = e.target as HTMLElement
      if (el.closest('dialog, input, textarea, select, [data-tasti-propri]')) return
      const passo = window.innerHeight * 0.14
      switch (e.key) {
        case 'ArrowDown':
          scorriDi(passo)
          break
        case 'ArrowUp':
          scorriDi(-passo)
          break
        case 'PageDown':
          scorriDi(window.innerHeight * 0.8)
          break
        case 'PageUp':
          scorriDi(-window.innerHeight * 0.8)
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
    <div ref={rif} className="corsa" style={{ height: `calc(${pistaFase(aperta).lunga.toFixed(3)} * 100svh + 100svh)` }}>
      <div className="palco">{children}</div>
    </div>
  )
}
