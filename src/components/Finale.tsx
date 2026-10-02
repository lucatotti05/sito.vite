import { useEffect, useRef } from 'react'
import { useAnno } from '@/core/anno'
import { FASI, tFase } from '@/core/tempo'
import { esci } from '@/spazio/volo'
import { spazio, useSpazio } from '@/spazio/stato'

/**
 * Negli ultimi istanti di dicembre: un finale breve e il pulsante per ricominciare l'anno.
 * Prende il posto del titolo della fase nella stessa griglia: il titolo esce del tutto
 * (--d-ui, --ease-in) e solo dopo entra il finale, come tra due titoli (palco.css, .finale.su).
 */
const SOGLIA = 0.94

export function Finale() {
  const fine = useAnno((p) => tFase(p, FASI.length - 1) > SOGLIA && p > 0.9)
  const dentro = useSpazio((d) => d.dentro)
  const su = fine && dentro
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    document.documentElement.classList.toggle('finale-su', su)
    return () => document.documentElement.classList.remove('finale-su')
  }, [su])
  return (
    <section className={`finale${su ? ' su' : ''}`} aria-label="Fine dell'anno" aria-hidden={!su}>
      <h2 className="finale-titolo titolo-h t-titolo-fase">
        <span className="titolo-righe">La vite torna a riposo</span>
      </h2>
      <div className="finale-corpo">
        <p className="finale-testo t-testo">
          I tralci sono legno, le gemme dormono sotto le perule. Tra poche settimane si torna a potare: il ciclo ricomincia da qui.
        </p>
        <button ref={btn} type="button" className="finale-ricomincia" tabIndex={su ? 0 : -1} onClick={() => esci(-spazio.get().aperta)}>
          Ricomincia l’anno
        </button>
      </div>
    </section>
  )
}
