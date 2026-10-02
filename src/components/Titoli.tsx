import { useLayoutEffect, useRef } from 'react'
import { useAnno } from '@/core/anno'
import { FASI, indiceFase } from '@/core/tempo'
import { useSpazio } from '@/spazio/stato'

/*
 * Titoli delle fasi (DESIGN.md, "Titolo di fase"). Lo scroll decide QUALE titolo è attivo;
 * l'entrata è una rivelazione a maschera riga per riga (--d-entrata, --ease-out, 60ms tra le
 * righe), l'uscita è in --d-ui con --ease-in e finisce prima che entri il nuovo (palco.css).
 * Sotto il titolo una sola riga d'introduzione: niente metadati (fase e BBCH vanno nel calendario).
 * Il titolo entra quando il pannello ha passato la mano alla fase (spazio/volo.ts) ed esce appena
 * si torna verso l'Anno. Con movimento ridotto: solo dissolvenze.
 */


/** La prima frase della sintesi: l'introduzione della fase (il resto è per i lettori di schermo). */
const primaFrase = (t: string) => {
  const m = t.match(/^.+?[.!?](?=\s|$)/)
  return m ? m[0] : t
}

/** Il titolo diviso in parole, ognuna dentro la sua maschera. */
function Parole({ testo }: { testo: string }) {
  return (
    <>
      {testo.split(' ').map((w, i, a) => (
        <span key={i}>
          <span className="parola">
            <span>{w}</span>
          </span>
          {i < a.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  )
}

export function Titoli() {
  const dentro = useSpazio((d) => d.dentro)
  const fase = useAnno(indiceFase) + 1
  const corrente = dentro ? fase : 0
  const rif = useRef<HTMLDivElement>(null)

  // a quale riga appartiene ogni parola: si misura solo quando cambiano caratteri o misure, mai
  // durante l'animazione; il ritardo di ogni parola è quello della sua riga
  useLayoutEffect(() => {
    const el = rif.current
    if (!el) return
    const misura = () => {
      el.querySelectorAll<HTMLElement>('.titolo-h').forEach((h) => {
        let riga = -1
        let y = -Infinity
        h.querySelectorAll<HTMLElement>('.parola').forEach((p) => {
          if (p.offsetTop > y + 4) {
            riga++
            y = p.offsetTop
          }
          p.style.setProperty('--riga', String(riga))
        })
      })
    }
    misura()
    document.fonts?.ready.then(misura)
    const ro = new ResizeObserver(misura)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="titoli" ref={rif}>
      {FASI.map((f, i) => (
        <section key={f.id} className={`titolo${corrente === i + 1 ? ' attivo' : ''}`} aria-hidden={corrente !== i + 1}>
          <h2 className="titolo-h t-titolo-fase">
            <Parole testo={f.titolo} />
          </h2>
          <div className="titolo-corpo">
            <p className="t-introduzione">{primaFrase(f.sintesi)}</p>
            <p className="sr-only">
              {f.sintesi} Fase {f.numero} di 10, BBCH {f.bbch}.
            </p>
          </div>
        </section>
      ))}
    </div>
  )
}
