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


/**
 * L'introduzione della fase: la prima frase della sintesi, fino al primo punto, punto e virgola o
 * due punti (al più due righe; la sintesi intera resta per i lettori di schermo).
 */
const primaFrase = (t: string) => {
  const m = t.match(/^.+?[.!?;:](?=\s|$)/)
  return m ? m[0].replace(/[;:]$/, '.') : t
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
    const righe = (h: HTMLElement) => {
      let riga = -1
      let y = -Infinity
      h.querySelectorAll<HTMLElement>('.parola').forEach((p) => {
        if (p.offsetTop > y + 4) {
          riga++
          y = p.offsetTop
        }
        p.style.setProperty('--riga', String(riga))
      })
      return riga + 1
    }
    const misura = () => {
      el.querySelectorAll<HTMLElement>('.titolo-h').forEach((h) => {
        // ogni titolo sta in due righe: se ne servono di più, il corpo si riduce a passi del 4%
        let k = 1
        h.style.setProperty('--stringi', '1')
        while (righe(h) > 2 && k > 0.5) {
          k -= 0.04
          h.style.setProperty('--stringi', k.toFixed(2))
        }
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
            <span className="titolo-righe">
              <Parole testo={f.titolo} />
            </span>
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
