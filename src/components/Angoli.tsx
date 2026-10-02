import { useEffect } from 'react'
import { MESI, FASI, meseDa } from '@/core/tempo'
import { useAnno } from '@/core/anno'
import { primoPiano, usePrimoPiano } from '@/core/primoPiano'
import { carteDellaFase } from './collana/collana'
import { arco } from '@/spazio/input'
import { faseDiOggi } from '@/spazio/Spazio'
import { spazio, useSpazio } from '@/spazio/stato'
import { entra, esci } from '@/spazio/volo'

/** Collana chiesta dall'Anno: si apre appena il pannello passa la mano alla fase. */
let collanaInAttesa = false

/**
 * L'interfaccia dello spazio (DESIGN.md, "Spazio"): quattro voci, una per angolo, in Instrument
 * Sans 12px maiuscolo. In alto a sinistra il nome (riporta all'Anno), in alto a destra il mese
 * (nella fase al suo posto pende la pagina d'almanacco), in basso a sinistra Anno / Fase, in
 * basso a destra la collana.
 */
export function Angoli() {
  const livello = useSpazio((d) => d.livello)
  const centrale = useSpazio((d) => d.centrale)
  const dentro = useSpazio((d) => d.dentro)
  const meseFase = useAnno(meseDa)
  const primo = usePrimoPiano()
  const mese = livello === 'anno' ? meseDa(FASI[centrale].inizio + 0.001) : meseFase
  const inFase = livello === 'fase'
  const voci = carteDellaFase(FASI[centrale].numero)

  useEffect(
    () =>
      spazio.subscribe(() => {
        if (collanaInAttesa && spazio.get().dentro) {
          collanaInAttesa = false
          primoPiano.apri('collana')
        }
      }),
    [],
  )

  const collana = () => {
    const st = spazio.get()
    if (st.dentro) primoPiano.apri(primoPiano.get() === 'collana' ? 'nodo' : 'collana')
    else if (st.livello === 'anno') {
      collanaInAttesa = true
      entra(st.centrale)
    }
  }

  return (
    <div className="angoli">
      <button type="button" className="angolo angolo-ts" onClick={() => esci(0)} aria-label="L’anno della vite: torna alla vista dell’anno">
        L’anno della vite
      </button>
      <button
        type="button"
        className={`angolo angolo-td${dentro ? ' via' : ''}`}
        onClick={() => arco.centra(faseDiOggi())}
        aria-label={`Mese: ${MESI[mese]}. Porta l’arco al mese di oggi`}
        tabIndex={dentro ? -1 : 0}
      >
        <span className="angolo-maschera">
          <span key={mese} className="angolo-mese">
            {MESI[mese]}
          </span>
        </span>
      </button>
      <div className="angolo angolo-bs" role="group" aria-label="Livello">
        <button type="button" aria-pressed={!inFase} onClick={() => esci(0)}>
          Anno
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" aria-pressed={inFase} onClick={() => entra(centrale)}>
          Fase
        </button>
      </div>
      <button
        type="button"
        className="angolo angolo-bd"
        aria-pressed={dentro && primo === 'collana'}
        disabled={!voci.length}
        onClick={collana}
        aria-label={voci.length ? `Collana della fase: ${voci.length} contenuti` : 'Collana: nessun contenuto per questa fase'}
      >
        Collana
      </button>
    </div>
  )
}
