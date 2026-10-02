import { useRef } from 'react'
import { useAnno, useAnnoFotogramma } from '@/core/anno'
import { FASI, MESI, indiceFase, mesiDi } from '@/core/tempo'
import { vaiAFase } from './Scorrimento'

/** Le dieci fasi in proporzione alla loro durata, con l'ago dell'anno. Ogni fase è un pulsante. */
export function StrisciaFasi() {
  const ago = useRef<HTMLDivElement>(null)
  const corrente = useAnno(indiceFase)
  useAnnoFotogramma((p) => {
    if (ago.current) ago.current.style.transform = `translateX(${(p * 100).toFixed(3)}cqw)`
  })
  return (
    <nav className="striscia" aria-label="Fasi dell'anno">
      <div className="striscia-corpo">
      <ol className="striscia-fasi">
        {FASI.map((f, i) => (
          <li key={f.id} style={{ flexGrow: f.fine - f.inizio }}>
            <button
              type="button"
              aria-current={corrente === i ? 'step' : undefined}
              aria-label={`Fase ${f.numero}: ${f.titolo}, ${mesiDi(f)}`}
              title={`${f.titolo}, ${mesiDi(f)}`}
              onClick={() => vaiAFase(i)}
            >
              <span className="striscia-n">{String(f.numero).padStart(2, '0')}</span>
              <span className="striscia-nome">{f.titolo}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="striscia-mesi" aria-hidden="true">
        {MESI.map((m) => (
          <span key={m}>{m.slice(0, 3)}</span>
        ))}
      </div>
      <div className="striscia-ago" ref={ago} aria-hidden="true" />
      </div>
    </nav>
  )
}
