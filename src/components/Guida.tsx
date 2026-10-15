import { useEffect, useState } from 'react'
import { FASI } from '@/core/tempo'
import { spazio, useSpazio } from '@/spazio/stato'

/*
 * LA GUIDA. Chi arriva per la prima volta non sa che l'anno si attraversa di lato: finita
 * l'apertura, tra le voci in basso compare una nota scritta come le annotazioni della tavola
 * (un filo d'oro, poi il testo). Se ne va al primo gesto (l'arco si sposta o si entra in una
 * fase) e non torna più. Nella fase, quando lo scroll spinge oltre l'inizio o la fine, una nota
 * sopra la striscia dice dove porta la spinta: la sua presenza segue la spinta (--spinta-*,
 * scritte da input.ts sul palco), senza passare da React.
 * Le note sono per chi guarda: il lettore di schermo ha già le istruzioni (Spazio.tsx).
 */

const CHIAVE = 'anno-della-vite:guida'
const giaLetta = () => {
  try {
    return localStorage.getItem(CHIAVE) === '1'
  } catch {
    return false
  }
}
const segnaLetta = () => {
  try {
    localStorage.setItem(CHIAVE, '1')
  } catch {
    // senza memoria la nota tornerà alla prossima visita: niente di grave
  }
}
const apertoOra = () => document.documentElement.classList.contains('aperto')

export function Guida() {
  const livello = useSpazio((d) => d.livello)
  const dentro = useSpazio((d) => d.dentro)
  const aperta = useSpazio((d) => d.aperta)
  const [letta, setLetta] = useState(giaLetta)
  const [aperto, setAperto] = useState(apertoOra)

  // la nota aspetta la fine dell'apertura (html.aperto)
  useEffect(() => {
    if (aperto || letta) return
    const mo = new MutationObserver(() => apertoOra() && setAperto(true))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [aperto, letta])

  // il primo gesto la congeda: l'arco cambia pannello o si entra in una fase
  useEffect(() => {
    if (!aperto || letta) return
    const c0 = spazio.get().centrale
    return spazio.subscribe(() => {
      const st = spazio.get()
      if (st.livello === 'fase' || st.centrale !== c0) {
        setLetta(true)
        segnaLetta()
      }
    })
  }, [aperto, letta])

  const su = aperto && !letta && livello === 'anno'
  const dopo = aperta < FASI.length - 1 ? FASI[aperta + 1].titolo : null

  return (
    <>
      <p className={`guida t-annotazione${su ? ' su' : ''}`} aria-hidden="true">
        <span className="guida-mouse">Scorri di lato per attraversare l’anno. Clic su un foglio per entrare, Esc per tornare.</span>
        <span className="guida-dito">Scorri di lato per attraversare l’anno. Tocca un foglio per entrare.</span>
      </p>
      {dentro && (
        <>
          <p className="spinta-nota spinta-nota-giu t-annotazione" aria-hidden="true">
            {dopo ? `Ancora un poco e torni all’anno, su «${dopo}»` : 'Ancora un poco e torni all’anno'}
          </p>
          <p className="spinta-nota spinta-nota-su t-annotazione" aria-hidden="true">
            Ancora un poco e torni all’anno
          </p>
        </>
      )}
    </>
  )
}
