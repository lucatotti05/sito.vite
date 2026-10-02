import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { D, E, PASSO } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'

/*
 * Apertura: pochi secondi, solo al primo arrivo dall'inizio dell'anno.
 * Buio → la luce radente si accende sulla vite (--accensione da 0 a 1, letta dai gradienti e dal
 * controluce) e un cerchio di luce si allarga dalla pianta alla scena → compare il titolo →
 * arrivano calendario e barra delle fasi. Qualsiasi tasto, rotella o tocco la porta alla fine.
 * Con movimento ridotto non c'è: la pagina è subito pronta.
 */
export function Apertura() {
  const velo = useRef<HTMLDivElement>(null)
  const [attiva, setAttiva] = useState(true)

  useLayoutEffect(() => {
    const v = velo.current
    const qs = new URLSearchParams(location.search)
    if (!v || preferenze.get().ridotto || window.scrollY > 20 || qs.has('fase') || location.hash) {
      setAttiva(false)
      return
    }
    // --accensione la usa solo la luce della scena
    const root = document.querySelector<HTMLElement>('.scena') ?? document.documentElement
    const stato = { luce: 0, foro: 0 }
    const scrivi = () => {
      root.style.setProperty('--accensione', stato.luce.toFixed(3))
      v.style.setProperty('--foro', stato.foro.toFixed(3))
    }
    scrivi()
    const ui = ['.titoli', '.calendario', '.striscia']
    gsap.set(ui, { autoAlpha: 0 })
    const fine = () => {
      root.style.removeProperty('--accensione')
      // solo ciò che l'apertura ha animato: gli altri stili in linea (per esempio --strisce del calendario) restano
      gsap.set(ui, { clearProps: 'opacity,visibility,transform' })
      setAttiva(false)
    }
    // una sequenza di passaggi di scena (--d-scena), poi l'interfaccia entra (--d-entrata)
    const tl = gsap
      .timeline({ onComplete: fine })
      .to(stato, { luce: 1, duration: D.scena, ease: E.inOut, onUpdate: scrivi }, D.ui)
      .to(stato, { foro: 1, duration: D.scena, ease: E.inOut, onUpdate: scrivi }, D.ui + D.micro)
      .fromTo('.titoli', { autoAlpha: 0 }, { autoAlpha: 1, duration: D.entrata, ease: E.out }, D.ui + D.scena)
      .to(['.calendario', '.striscia'], { autoAlpha: 1, duration: D.entrata, stagger: PASSO, ease: E.out }, D.ui + D.scena + D.micro)
      .to(v, { autoAlpha: 0, duration: D.ui, ease: E.in }, D.ui + D.scena)
    const salta = () => tl.progress(1)
    const opz = { once: true, passive: true } as const
    window.addEventListener('wheel', salta, opz)
    window.addEventListener('touchstart', salta, opz)
    window.addEventListener('keydown', salta, opz)
    window.addEventListener('pointerdown', salta, opz)
    return () => {
      tl.kill()
      window.removeEventListener('wheel', salta)
      window.removeEventListener('touchstart', salta)
      window.removeEventListener('keydown', salta)
      window.removeEventListener('pointerdown', salta)
      root.style.removeProperty('--accensione')
    }
  }, [])

  if (!attiva) return null
  return <div className="apertura" ref={velo} aria-hidden="true" />
}
