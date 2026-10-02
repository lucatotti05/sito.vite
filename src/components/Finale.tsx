import { useRef } from 'react'
import { useAnnoFotogramma } from '@/core/anno'
import { tra } from '@/core/math'
import { FASI, tFase } from '@/core/tempo'
import { esci } from '@/spazio/volo'
import { spazio } from '@/spazio/stato'

/** Negli ultimi istanti di dicembre: un finale breve e il pulsante per ricominciare l'anno. */
export function Finale() {
  const el = useRef<HTMLElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useAnnoFotogramma((p) => {
    const n = el.current
    if (!n) return
    const o = tra(tFase(p, FASI.length - 1), 0.93, 0.985) * (p > 0.9 ? 1 : 0)
    // fuori dal finale non si scrive nulla
    if (o < 0.01 && n.style.visibility === 'hidden') return
    n.style.opacity = o.toFixed(3)
    // il finale prende il posto del titolo della fase (un titolo per volta)
    document.documentElement.classList.toggle('finale-su', o > 0.3)
    n.style.visibility = o < 0.01 ? 'hidden' : 'visible'
    n.style.transform = `translateY(${((1 - o) * 14).toFixed(1)}px)`
    if (btn.current) btn.current.tabIndex = o > 0.5 ? 0 : -1
  })
  return (
    <section className="finale" ref={el} aria-label="Fine dell'anno">
      <h2 className="finale-titolo t-titolo-fase">La vite torna a riposo</h2>
      <p className="finale-testo t-testo">
        I tralci sono legno, le gemme dormono sotto le perule. Tra poche settimane si torna a potare: il ciclo ricomincia da qui.
      </p>
      <button ref={btn} type="button" className="finale-ricomincia" onClick={() => esci(-spazio.get().aperta)}>
        Ricomincia l’anno
      </button>
    </section>
  )
}
