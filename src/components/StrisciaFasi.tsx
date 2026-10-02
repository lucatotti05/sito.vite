import { useRef } from 'react'
import { useAnno, useAnnoFotogramma } from '@/core/anno'
import { FASI, indiceFase, mesiDi } from '@/core/tempo'
import { salta } from '@/spazio/volo'
import { useSpazio } from '@/spazio/stato'

/**
 * La barra delle fasi (DESIGN.md): solo nel livello Fase, una riga sottile in fondo. Numeri in
 * stile etichetta in proporzione alla durata delle fasi, la corrente in avorio; l'ago dell'anno
 * è una linea di 1px in oro. Ogni numero è un pulsante: si torna nell'arco e si entra nell'altra.
 */
export function StrisciaFasi() {
  const ago = useRef<HTMLDivElement>(null)
  const corrente = useAnno(indiceFase)
  const dentro = useSpazio((d) => d.dentro)
  useAnnoFotogramma((p) => {
    if (ago.current) ago.current.style.transform = `translateX(${(p * 100).toFixed(3)}cqw)`
  })
  return (
    <nav className={`striscia${dentro ? ' su' : ''}`} id="fasi" aria-label="Fasi dell'anno" aria-hidden={!dentro}>
      <div className="striscia-corpo">
        <ol className="striscia-fasi">
          {FASI.map((f, i) => (
            <li key={f.id} style={{ flexGrow: f.fine - f.inizio }}>
              <button
                type="button"
                tabIndex={dentro ? 0 : -1}
                aria-current={corrente === i ? 'step' : undefined}
                aria-label={`Fase ${f.numero}: ${f.titolo}, ${mesiDi(f)}`}
                title={`${f.titolo}, ${mesiDi(f)}`}
                onClick={() => salta(i)}
              >
                <span className="striscia-n">{String(f.numero).padStart(2, '0')}</span>
              </button>
              {/* al passaggio il numero rivela il nome della fase */}
              <span className={`striscia-tip t-annotazione${i >= FASI.length - 3 ? ' destra' : ''}`} aria-hidden="true">
                {f.titolo}
              </span>
            </li>
          ))}
        </ol>
        <div className="striscia-ago" ref={ago} aria-hidden="true" />
      </div>
    </nav>
  )
}
