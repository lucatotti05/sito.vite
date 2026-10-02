import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { D, E, PASSO } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { motore } from '@/spazio/motore'

/*
 * APERTURA — un anno in otto secondi.
 * 1. Nel buio si apre una finestra 3:4 al centro (la misura dei pannelli): dentro scorre l'anno
 *    filmato (gemma, fiore, invaiatura, foglie che cadono) e sotto il mese corre su un filo.
 * 2. Con le foglie d'autunno la finestra si allarga fino a tutto schermo (--ease-volo), il film
 *    resta fermo sotto come dietro un vetro che cresce; in basso a sinistra entra il nome del sito.
 * 3. All'uscita il film si stringe dentro il pannello centrale dell'arco (motore.rettCentrale),
 *    mentre la camera arriva e i pannelli salgono intorno; il nome vola nell'angolo in alto a
 *    sinistra e diventa la voce. Il film si dissolve nel pannello: il sito comincia.
 * Qualsiasi input porta subito all'uscita. Non c'è entrando in una fase (?fase=N); con movimento
 * ridotto: il fotogramma fermo e il nome, poi una dissolvenza.
 */
const FILM = `${import.meta.env.BASE_URL}intro/anno`
const LOCANDINA = `${import.meta.env.BASE_URL}intro/locandina.webp`
/** i quattro tratti del film (s) e il loro mese; dall'ultimo la finestra si allarga */
const MESI = [
  { da: 0, mese: 'aprile', anno: 0.28 },
  { da: 1.1, mese: 'maggio', anno: 0.38 },
  { da: 2.2, mese: 'agosto', anno: 0.6 },
  { da: 3.2, mese: 'novembre', anno: 0.86 },
]
const ALLARGA_DA = 3.15
/** quanto resta il film a tutto schermo con il nome prima di diventare il pannello */
const SOSTA = 1.9
const MASSIMO = 10.5

/** solo in sviluppo: ?lento=8 rallenta l'apertura (per verificarla fotogramma per fotogramma) */
let LENTO = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('lento')) || 1 : 1

type Rett = { x: number; y: number; w: number; h: number; r: number }

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
    const finestra = el.querySelector<HTMLElement>('.apertura-finestra')!
    const video = el.querySelector<HTMLVideoElement>('.apertura-film')!
    const ombra = el.querySelector<HTMLElement>('.apertura-ombra')!
    const titolo = el.querySelector<HTMLElement>('.apertura-titolo')!
    const sotto = el.querySelector<HTMLElement>('.apertura-sotto')!
    const parole = el.querySelectorAll<HTMLElement>('.apertura-parola > span')
    const calendario = el.querySelector<HTMLElement>('.apertura-calendario')!
    const mesi = el.querySelector<HTMLElement>('.apertura-mesi')!
    const filo = el.querySelector<HTMLElement>('.apertura-filo > span')!

    const vw = () => window.innerWidth, vh = () => window.innerHeight
    /** la finestra iniziale: 3:4 al centro, la misura di un pannello visto da vicino */
    const carta = (): Rett => {
      const w = Math.min(Math.max(170, vw() * (vw() < 760 ? 0.46 : 0.17)), 290)
      const h = (w * 4) / 3
      return { x: (vw() - w) / 2, y: (vh() - h) / 2 - vh() * 0.03, w, h, r: 14 }
    }
    const pieno = (): Rett => ({ x: 0, y: 0, w: vw(), h: vh(), r: 0 })
    // lo stato corrente della finestra; ogni passo lo porta da dov'è a dove deve andare
    const st: Rett & { svela: number } = { ...carta(), svela: 0 }
    const applica = () => {
      const W = vw(), H = vh()
      // si svela dal basso verso l'alto la prima volta (svela 0 → 1)
      const top = st.y + st.h * (1 - st.svela)
      finestra.style.clipPath = `inset(${top.toFixed(2)}px ${(W - st.x - st.w).toFixed(2)}px ${(H - st.y - st.h).toFixed(2)}px ${st.x.toFixed(2)}px round ${st.r.toFixed(2)}px)`
      // il film copre sempre la finestra, centrato su di lei: si ingrandisce quando lei si stringe
      const k = Math.max(st.w / W, st.h / H)
      const cx = st.x + st.w / 2 - W / 2, cy = st.y + st.h / 2 - H / 2
      video.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) scale(${(k * 1.06).toFixed(4)})`
      const c = st.y + st.h + 22
      calendario.style.transform = `translate3d(0, ${c.toFixed(1)}px, 0)`
    }
    applica()

    let finita = false
    let fase: 'carta' | 'pieno' | 'uscita' = 'carta'
    let tPieno = 0
    const t0 = performance.now()
    const rallenta = (n: number) => {
      LENTO = n
      gsap.globalTimeline.timeScale(1 / n)
      video.playbackRate = Math.max(0.0625, 1 / n)
    }
    if (LENTO !== 1) rallenta(LENTO)
    if (import.meta.env.DEV) Object.assign(window, { __apertura: { rallenta, esci: () => chiudi() } })
    const tl = gsap.timeline()
    let meseOra = -1
    /** quando il film è partito davvero (se non parte, la finestra si allarga comunque) */
    let tFilm = 0
    video.addEventListener('playing', () => (tFilm ||= performance.now()), { once: true })

    if (ridotto) {
      Object.assign(st, pieno(), { svela: 1 })
      applica()
      video.removeAttribute('autoplay')
      gsap.set(calendario, { opacity: 0 })
      gsap.set(parole, { yPercent: 0 })
      tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: D.entrata })
      tl.set(sotto, { opacity: 1 })
      fase = 'pieno'
      tPieno = performance.now()
    } else {
      gsap.set(parole, { yPercent: 110 })
      video.play().catch(() => {})
      tl.to(st, { svela: 1, duration: D.entrata * 2, ease: E.out, onUpdate: applica }, 0.15)
      tl.fromTo(calendario, { opacity: 0 }, { opacity: 1, duration: D.entrata, ease: E.out }, 0.55)
    }

    /** il film raggiunge le foglie d'autunno: la finestra si allarga a tutto schermo */
    const allarga = () => {
      if (fase !== 'carta' || finita) return
      fase = 'pieno'
      const p = pieno()
      gsap.to(calendario, { opacity: 0, y: -8, duration: D.ui, ease: E.in })
      gsap.to(st, { ...p, duration: D.volo * 1.15, ease: E.volo, onUpdate: applica, onComplete: () => (tPieno = performance.now()) })
      gsap.fromTo(ombra, { opacity: 0 }, { opacity: 1, duration: D.volo, ease: 'none' })
      gsap.fromTo(parole, { yPercent: 110 }, { yPercent: 0, duration: D.entrata * 1.6, ease: E.out, stagger: PASSO * 1.5, delay: D.volo * 0.55 })
      gsap.fromTo(sotto, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: D.entrata, ease: E.out, delay: D.volo * 0.9 })
    }

    /** l'uscita: il film diventa il pannello centrale dell'arco, il nome va nell'angolo */
    const chiudi = () => {
      if (finita) return
      finita = true
      togli()
      tl.kill()
      gsap.killTweensOf(st)
      const durata = D.volo * 1.1
      motore.liberaApertura(durata * 1000 * 1.05 * LENTO)
      const angolo = document.querySelector<HTMLElement>('.angolo-ts')
      const fine = () => {
        document.documentElement.classList.add('aperto')
        setAttiva(false)
      }
      if (ridotto || !angolo) {
        gsap.to(el, { opacity: 0, duration: D.scena, ease: 'none', onComplete: fine })
        return
      }
      fase = 'uscita'
      const b = motore.rettCentrale()
      gsap.to(st, { x: b.x, y: b.y, w: b.w, h: b.h, r: b.raggio, svela: 1, duration: durata, ease: E.volo, onUpdate: applica })
      gsap.to([ombra, calendario], { opacity: 0, duration: D.ui, ease: E.in })
      // il buio intorno alla finestra si ritira: sotto la camera arriva e i pannelli salgono
      gsap.to(el, { '--apertura-buio': 0, duration: D.scena, ease: 'none' })
      // il film si dissolve nel pannello quando ci è quasi arrivato
      gsap.to(finestra, { opacity: 0, duration: D.entrata, ease: 'none', delay: durata * 0.72 })
      // il nome vola nell'angolo: stessa scala della voce, poi le due si scambiano
      const a = titolo.getBoundingClientRect(), c = angolo.getBoundingClientRect()
      const k = c.height / a.height
      gsap.to(sotto, { opacity: 0, y: -6, duration: D.ui, ease: E.in })
      gsap.to(titolo, {
        x: c.left - a.left,
        y: c.top - a.top + (c.height - a.height * k) / 2,
        scale: Math.max(k, 0.08),
        transformOrigin: '0 0',
        duration: D.scena * 1.35,
        ease: E.inOut,
      })
      gsap.to(titolo, { opacity: 0, duration: D.ui * 1.4, ease: 'none', delay: D.scena * 1.35 * 0.42 })
      gsap.delayedCall(Math.max(durata * 0.72 + D.entrata, D.scena * 1.35), fine)
      document.documentElement.classList.add('aperto-angoli')
    }

    // il tempo del film guida il mese sotto la finestra e il momento in cui si allarga
    const segui = () => {
      if (finita) return
      const t = video.currentTime
      let m = 0
      while (m < MESI.length - 1 && t >= MESI[m + 1].da) m++
      if (m !== meseOra) {
        meseOra = m
        mesi.style.transform = `translate3d(0, ${-m * 1.3}em, 0)`
      }
      const prossimo = MESI[m + 1]
      const u = prossimo ? (t - MESI[m].da) / (prossimo.da - MESI[m].da) : 1
      filo.style.transform = `scaleX(${(MESI[m].anno + (prossimo ? (prossimo.anno - MESI[m].anno) * Math.min(1, u) : 0)).toFixed(4)})`
      const ora = performance.now()
      const fermo = tFilm ? ora - tFilm > (ALLARGA_DA + 1.5) * 1000 * LENTO : ora - t0 > 5000 * LENTO
      if (fase === 'carta' && (t >= ALLARGA_DA || fermo)) allarga()
      // a tutto schermo: si esce quando le prime tavole sono pronte e il nome si è letto
      if (fase === 'pieno' && tPieno && ora - tPieno > SOSTA * 1000 * LENTO && motore.pronto()) chiudi()
      if (ora - t0 > MASSIMO * 1000 * LENTO) chiudi()
    }
    gsap.ticker.add(segui)
    const misura = () => {
      if (fase === 'carta') Object.assign(st, carta(), { svela: st.svela })
      else if (fase === 'pieno') Object.assign(st, pieno())
      applica()
    }
    window.addEventListener('resize', misura)

    // qualsiasi input porta subito all'uscita
    const subito = () => chiudi()
    const eventi = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const
    eventi.forEach((ev) => window.addEventListener(ev, subito, { passive: true, once: true }))
    function togli() {
      gsap.ticker.remove(segui)
      window.removeEventListener('resize', misura)
      eventi.forEach((ev) => window.removeEventListener(ev, subito))
    }
    return () => {
      togli()
      tl.kill()
      gsap.killTweensOf(st)
    }
  }, [attiva])

  if (!attiva) return null
  const righe = [['L’anno'], ['della', 'vite']]
  return (
    <div className="apertura" ref={rif} aria-hidden="true">
      <div className="apertura-finestra">
        <video className="apertura-film" poster={LOCANDINA} muted playsInline autoPlay preload="auto">
          <source src={`${FILM}.mp4`} type="video/mp4" />
          <source src={`${FILM}.webm`} type="video/webm" />
        </video>
        <div className="apertura-ombra" />
      </div>
      <div className="apertura-calendario">
        <span className="apertura-maschera">
          <span className="apertura-mesi">
            {MESI.map((m) => (
              <span key={m.mese} className="t-annotazione">
                {m.mese}
              </span>
            ))}
          </span>
        </span>
        <span className="apertura-filo">
          <span />
        </span>
      </div>
      <div className="apertura-testi">
        <p className="apertura-titolo t-titolo-fase">
          {righe.map((r, j) => (
            <span key={j} className="apertura-riga">
              {r.map((w, i) => (
                <span key={i}>
                  <span className="apertura-parola">
                    <span>{w}</span>
                  </span>
                  {i < r.length - 1 ? ' ' : null}
                </span>
              ))}
            </span>
          ))}
        </p>
        <p className="apertura-sotto t-introduzione">Un anno in dieci fasi, dalla potatura alla caduta delle foglie.</p>
      </div>
    </div>
  )
}
