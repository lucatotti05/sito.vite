import { useAnno } from '@/core/anno'
import { primoPiano, usePrimoPiano } from '@/core/primoPiano'
import { FASI, indiceFase, tFase } from '@/core/tempo'
import { carteDellaFase, disponibile } from './collana/collana'

/*
 * Gli indicatori discreti dell'elemento richiuso (DESIGN.md, densità): con il nodo aperto,
 * "Collana" sotto il calendario; con la collana aperta, "Pratiche" al posto del nodo.
 * Si aprono con un clic, un tocco o da tastiera (sono pulsanti).
 */
export function Indicatori() {
  const aperto = usePrimoPiano()
  const i = useAnno(indiceFase)
  // come il nodo: nascosti sul frontespizio e nel finale
  const attivi = useAnno((p) => {
    const k = indiceFase(p)
    const t = tFase(p, k)
    return !(k === 0 && t < 0.24) && !(k === FASI.length - 1 && t > 0.9)
  })
  const voci = carteDellaFase(i + 1)
  const pronte = voci.filter(disponibile).length
  if (!attivi || !voci.length) return null
  return aperto === 'nodo' ? (
    <button
      type="button"
      className="indicatore indicatore-collana t-etichetta"
      onClick={() => primoPiano.apri('collana')}
      aria-label={`Apri la collana di questa fase: ${voci.length} contenuti, ${pronte} disponibili`}
    >
      Collana
    </button>
  ) : (
    <button
      type="button"
      className="indicatore indicatore-nodo t-etichetta"
      onClick={() => primoPiano.apri('nodo')}
      aria-label="Torna alle pratiche della fase"
    >
      Pratiche
    </button>
  )
}
