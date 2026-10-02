import { useAnno } from '@/core/anno'
import { primoPiano, usePrimoPiano } from '@/core/primoPiano'
import { FASI, indiceFase, tFase } from '@/core/tempo'
import { useSpazio } from '@/spazio/stato'

/*
 * L'indicatore discreto dell'elemento richiuso (DESIGN.md, densità): con la collana in primo
 * piano, "Pratiche" al posto del nodo. La collana si apre dalla voce nell'angolo in basso a destra.
 */
export function Indicatori() {
  const aperto = usePrimoPiano()
  const dentro = useSpazio((d) => d.dentro)
  // come il nodo: nascosto nel finale
  const attivo = useAnno((p) => {
    const k = indiceFase(p)
    return !(k === FASI.length - 1 && tFase(p, k) > 0.9)
  })
  if (!dentro || !attivo || aperto !== 'collana') return null
  return (
    <button type="button" className="indicatore indicatore-nodo t-etichetta" onClick={() => primoPiano.apri('nodo')} aria-label="Torna alle pratiche della fase">
      Pratiche
    </button>
  )
}
