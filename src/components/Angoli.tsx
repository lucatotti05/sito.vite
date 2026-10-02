import { useEffect, useLayoutEffect, useRef } from 'react'
import { Rotola } from './Rotola'
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
  // il filetto sotto la voce attiva di "Anno / Fase": scorre dall'una all'altra
  const gruppo = useRef<HTMLDivElement>(null)
  const cursore = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const g = gruppo.current, c = cursore.current
    if (!g || !c) return
    const posa = () => {
      const b = g.querySelector<HTMLElement>('button[aria-pressed="true"]')
      if (!b) return
      c.style.transform = `translate3d(${b.offsetLeft}px, 0, 0) scaleX(${b.offsetWidth})`
    }
    posa()
    document.fonts?.ready.then(posa)
  }, [inFase])

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
      <button type="button" className="angolo angolo-ts con-rotola" onClick={() => esci(0)} aria-label="L’anno della vite: torna alla vista dell’anno">
        <Rotola testo="L’anno della vite" />
      </button>
      <button
        type="button"
        className={`angolo angolo-td con-rotola${dentro ? ' via' : ''}`}
        onClick={() => arco.centra(faseDiOggi())}
        aria-label={`Mese: ${MESI[mese]}. Porta l’arco al mese di oggi`}
        tabIndex={dentro ? -1 : 0}
      >
        <span className="angolo-maschera">
          <span key={mese} className="angolo-mese">
            <Rotola testo={MESI[mese]} />
          </span>
        </span>
      </button>
      <div className="angolo angolo-bs" role="group" aria-label="Livello" ref={gruppo}>
        <button type="button" className="con-rotola" aria-pressed={!inFase} onClick={() => esci(0)}>
          <Rotola testo="Anno" />
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" className="con-rotola" aria-pressed={inFase} onClick={() => entra(centrale)}>
          <Rotola testo="Fase" />
        </button>
        <span className="angolo-cursore" ref={cursore} aria-hidden="true" />
      </div>
      <button
        type="button"
        className="angolo angolo-bd con-rotola"
        aria-pressed={dentro && primo === 'collana'}
        disabled={!voci.length}
        onClick={collana}
        aria-label={voci.length ? `Collana della fase: ${voci.length} contenuti` : 'Collana: nessun contenuto per questa fase'}
      >
        <Rotola testo="Collana" />
      </button>
    </div>
  )
}
