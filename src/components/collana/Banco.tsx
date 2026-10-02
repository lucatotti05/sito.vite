import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { D, E, PASSO } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { FASI, mesiDi } from '@/core/tempo'
import { banco, numeroDi, tipoDi, url, useBanco, type Voce } from './collana'
import { Oggetto } from './Oggetto'

/*
 * Il banco di lavoro. Aprire una carta è un passaggio di luogo: la scena arretra e si scurisce,
 * l'oggetto (foglio o schermo) viaggia dalla scena al banco e lì si ingrandisce; sul banco l'app
 * è viva nell'anteprima, con le note a fianco e il pulsante per aprirla davvero.
 * <dialog> nativo: focus intrappolato, Esc, ritorno del focus alla carta.
 */

function rettangoloFlip(da: DOMRect, a: DOMRect) {
  return {
    x: da.left + da.width / 2 - (a.left + a.width / 2),
    y: da.top + da.height / 2 - (a.top + a.height / 2),
    scale: da.width / a.width,
  }
}

function Contenuto({ voce, chiudi, pronto }: { voce: Voce; chiudi: () => void; pronto: boolean }) {
  const fasi = FASI.filter((x) => voce.fasi.includes(x.numero))
  return (
    <div className="banco-griglia">
      <div className="banco-piano">
        <div className="banco-oggetto">
          <span className="banco-riflesso-taglio" aria-hidden="true">
            <span className="banco-riflesso" />
          </span>
          <Oggetto
            voce={voce}
            dentro={
              pronto ? (
                <iframe src={url(voce.link!)} title={`Anteprima di ${voce.titolo}`} tabIndex={-1} loading="lazy" className="banco-vivo" />
              ) : null
            }
          />
        </div>
      </div>
      <div className="banco-note">
        <h2 className="banco-titolo banco-a t-titolo-sezione" id="banco-titolo">
          {voce.titolo}
        </h2>
        <p className="banco-meta banco-a t-etichetta">
          {tipoDi(voce)} della collana, numero {Number(numeroDi(voce))}
        </p>
        <p className="banco-sintesi banco-a t-testo">{voce.sintesi}</p>
        <div className="banco-a">
          <h3 className="banco-sottotitolo t-etichetta">Cosa si impara</h3>
          <ul className="banco-punti t-testo">
            {(voce.punti ?? []).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p className="banco-fase banco-a t-etichetta">
          Nell'anno:{' '}
          {fasi.map((f, i) => (
            <span key={f.id}>
              {i > 0 && '; '}
              <strong>{f.titolo}</strong>, {mesiDi(f)}
            </span>
          ))}
        </p>
        <div className="banco-azioni banco-a">
          <a className="bottone primario" href={url(voce.link!)} target="_blank" rel="noopener">
            Apri {voce.titolo}
            <span className="sr-only"> (si apre in una nuova scheda)</span>
          </a>
          <button type="button" className="bottone" onClick={chiudi}>
            Torna alla vigna
          </button>
        </div>
      </div>
    </div>
  )
}

export function Banco() {
  const aperta = useBanco()
  const dlg = useRef<HTMLDialogElement>(null)
  const [voce, setVoce] = useState<Voce | null>(null)
  const [pronto, setPronto] = useState(false)
  const origine = useRef<HTMLElement | null>(null)
  const inChiusura = useRef(false)

  // apertura
  useLayoutEffect(() => {
    if (!aperta) return
    origine.current = aperta.origine
    setVoce(aperta.voce)
  }, [aperta])

  useLayoutEffect(() => {
    const d = dlg.current
    if (!voce || !d || d.open) return
    const ridotto = preferenze.get().ridotto
    document.documentElement.classList.add('banco-aperto')
    d.showModal()
    const ogg = d.querySelector<HTMLElement>('.banco-oggetto')!
    const da = origine.current?.getBoundingClientRect()
    const tl = gsap.timeline({ onComplete: () => setPronto(true) })
    if (ridotto || !da) {
      tl.fromTo(d, { opacity: 0 }, { opacity: 1, duration: D.ui, ease: E.out })
    } else {
      // 1. la macchina da presa si avvicina alla carta e la scena affonda nel buio
      // 2. il banco sale nell'inquadratura; l'oggetto vola dalla scena al banco lungo un arco
      // 3. un riflesso passa sull'oggetto appena posato, poi arrivano le note
      const flip = rettangoloFlip(da, ogg.getBoundingClientRect())
      gsap.set('.palco', { transformOrigin: `${da.left + da.width / 2}px ${da.top + da.height / 2}px` })
      tl.set(d, { opacity: 1 })
        .fromTo('.palco', { scale: 1 }, { scale: 1.22, duration: D.scena, ease: E.in }, 0)
        .fromTo(d.querySelector('.banco-buio'), { opacity: 0 }, { opacity: 0.82, duration: D.scena, ease: E.in }, 0.05)
        .fromTo(d.querySelector('.banco-fondo'), { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, duration: D.scena, ease: E.out }, 0.32)
        .fromTo(ogg, { x: flip.x }, { x: 0, duration: D.scena, ease: E.inOut }, 0.05)
        .fromTo(ogg, { y: flip.y }, { y: 0, duration: D.scena, ease: E.inOut }, 0.05)
        .fromTo(ogg, { scale: flip.scale, rotate: -7 }, { keyframes: [{ scale: 1.035, rotate: 1.2, duration: D.entrata, ease: E.inOut }, { scale: 1, rotate: 0, duration: D.ui, ease: E.out }] }, 0.05)
        .fromTo(ogg, { '--sollevato': 0 }, { '--sollevato': 1, duration: D.ui, yoyo: true, repeat: 1, ease: E.inOut }, 0.1)
        .fromTo(d.querySelector('.banco-riflesso'), { xPercent: -130, opacity: 0.9 }, { xPercent: 130, opacity: 0.9, duration: D.scena, ease: E.inOut }, D.scena)
        .fromTo(d.querySelectorAll('.banco-a'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D.entrata, stagger: PASSO, ease: E.out }, D.entrata)
    }
    return () => {
      tl.kill()
    }
  }, [voce])

  // l'app viva è disegnata a 1280 × 800 e ridotta alla misura dell'oggetto
  useLayoutEffect(() => {
    if (!pronto) return
    const d = dlg.current
    const cornice = d?.querySelector<HTMLElement>('.ogg-vetro, .ogg-montaggio')
    const fr = d?.querySelector<HTMLElement>('.banco-vivo')
    if (!cornice || !fr) return
    const adatta = () => fr.style.setProperty('--k', String(cornice.clientWidth / 1280))
    adatta()
    const ro = new ResizeObserver(adatta)
    ro.observe(cornice)
    return () => ro.disconnect()
  }, [pronto])

  const chiudi = () => {
    const d = dlg.current
    if (!d || inChiusura.current) return
    inChiusura.current = true
    const ridotto = preferenze.get().ridotto
    const ogg = d.querySelector<HTMLElement>('.banco-oggetto')!
    const fine = () => {
      d.close()
      gsap.set('.palco', { clearProps: 'transform,transformOrigin' })
      document.documentElement.classList.remove('banco-aperto')
      setPronto(false)
      setVoce(null)
      banco.chiudi()
      inChiusura.current = false
      // la carta torna visibile al render successivo: solo allora può ricevere il focus
      const carta = origine.current?.closest('button')
      requestAnimationFrame(() => requestAnimationFrame(() => carta?.focus()))
    }
    const da = origine.current?.getBoundingClientRect()
    if (ridotto || !da) {
      gsap.to(d, { opacity: 0, duration: D.ui, ease: E.in, onComplete: fine })
      return
    }
    setPronto(false)
    gsap.set(ogg, { clearProps: 'transform' })
    const flip = rettangoloFlip(da, ogg.getBoundingClientRect())
    gsap
      .timeline({ onComplete: fine })
      .to(d.querySelectorAll('.banco-a'), { opacity: 0, y: 10, duration: D.micro, ease: E.in }, 0)
      .to(ogg, { x: flip.x, duration: D.scena, ease: E.inOut }, 0.08)
      .to(ogg, { y: flip.y, duration: D.scena, ease: E.inOut }, 0.08)
      .to(ogg, { scale: flip.scale, rotate: -7, duration: D.scena, ease: E.inOut }, 0.08)
      .to(d.querySelector('.banco-fondo'), { opacity: 0, yPercent: 40, duration: D.entrata, ease: E.in }, 0.12)
      .to(d.querySelector('.banco-buio'), { opacity: 0, duration: D.entrata, ease: E.in }, 0.4)
      .to('.palco', { scale: 1, duration: D.scena, ease: E.out }, 0.1)
  }

  return (
    <dialog
      data-lenis-prevent
      ref={dlg}
      className="banco"
      aria-labelledby="banco-titolo"
      onCancel={(e) => {
        e.preventDefault()
        chiudi()
      }}
    >
      <div className="banco-buio" aria-hidden="true" />
      <div className="banco-fondo" aria-hidden="true" onClick={chiudi} />
      {voce && <Contenuto voce={voce} chiudi={chiudi} pronto={pronto} />}
      <button type="button" className="banco-chiudi t-etichetta" onClick={chiudi} aria-label="Chiudi e torna alla vigna">
        Chiudi
      </button>
    </dialog>
  )
}
