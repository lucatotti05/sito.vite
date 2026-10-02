import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { D, E, PASSO } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { motore } from '@/spazio/motore'

/*
 * APERTURA: il nome del sito compare grande al centro (Bodoni, rivelazione a maschera riga per
 * riga, --d-entrata), resta mentre arrivano le prime tavole e poi vola nell'angolo in alto a
 * sinistra, dove diventa la voce dell'angolo; intanto la camera arriva e l'arco si compone
 * (motore.liberaApertura). Un tasto, la rotella, un tocco o un clic la portano alla fine.
 * Non c'è se si arriva direttamente dentro una fase (?fase=N); con movimento ridotto è una dissolvenza.
 */
const MIN_MS = 2300

export function Apertura() {
  const [attiva, setAttiva] = useState(() => !new URLSearchParams(location.search).has('fase'))
  const rif = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = rif.current
    if (!attiva || !el) {
      motore.liberaApertura()
      document.documentElement.classList.add('aperto')
      return
    }
    const ridotto = preferenze.get().ridotto
    const titolo = el.querySelector<HTMLElement>('.apertura-titolo')!
    const sotto = el.querySelector<HTMLElement>('.apertura-sotto')!
    const parole = el.querySelectorAll<HTMLElement>('.apertura-parola > span')
    let finita = false
    const t0 = performance.now()
    const tl = gsap.timeline()
    if (ridotto) tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: D.entrata })
    else {
      tl.fromTo(parole, { yPercent: 110 }, { yPercent: 0, duration: D.entrata * 1.6, ease: E.out, stagger: PASSO * 1.5 })
      tl.fromTo(sotto, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D.entrata, ease: E.out }, '-=0.25')
    }

    const chiudi = () => {
      if (finita) return
      finita = true
      togli()
      motore.liberaApertura()
      const angolo = document.querySelector<HTMLElement>('.angolo-ts')
      const fine = () => {
        document.documentElement.classList.add('aperto')
        setAttiva(false)
      }
      if (ridotto || !angolo) {
        gsap.to(el, { opacity: 0, duration: D.scena, ease: 'none', onComplete: fine })
        return
      }
      // il titolo vola nell'angolo: stessa scala della voce, poi le due si scambiano
      const a = titolo.getBoundingClientRect(), b = angolo.getBoundingClientRect()
      const k = b.height / a.height
      tl.kill()
      gsap.to(sotto, { opacity: 0, y: -6, duration: D.ui, ease: E.in })
      gsap.to(titolo, {
        x: b.left - a.left,
        y: b.top - a.top + (b.height - a.height * k) / 2,
        scale: Math.max(k, 0.08),
        transformOrigin: '0 0',
        duration: D.scena * 1.35,
        ease: E.inOut,
      })
      gsap.to(titolo, { opacity: 0, duration: D.ui, ease: E.in, delay: D.scena * 1.35 - D.ui * 0.6, onComplete: fine })
      document.documentElement.classList.add('aperto-angoli')
    }

    // chiude quando le prime tavole sono pronte (e il nome si è letto), o al primo input
    let attesa = 0
    const prova = () => {
      if (finita) return
      if (motore.pronto() && performance.now() - t0 > MIN_MS) return chiudi()
      if (performance.now() - t0 > 6000) return chiudi()
      attesa = window.setTimeout(prova, 120)
    }
    attesa = window.setTimeout(prova, 300)
    const subito = () => chiudi()
    const eventi = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const
    eventi.forEach((ev) => window.addEventListener(ev, subito, { passive: true, once: true }))
    function togli() {
      clearTimeout(attesa)
      eventi.forEach((ev) => window.removeEventListener(ev, subito))
    }
    return () => {
      togli()
      tl.kill()
    }
  }, [attiva])

  if (!attiva) return null
  const parole = 'L’anno della vite'.split(' ')
  return (
    <div className="apertura" ref={rif} aria-hidden="true">
      <p className="apertura-titolo t-titolo-fase">
        {parole.map((w, i) => (
          <span key={i}>
            <span className="apertura-parola">
              <span>{w}</span>
            </span>
            {i < parole.length - 1 ? ' ' : null}
          </span>
        ))}
      </p>
      <p className="apertura-sotto t-introduzione">Il Sangiovese in Toscana, un anno in dieci fasi.</p>
    </div>
  )
}
