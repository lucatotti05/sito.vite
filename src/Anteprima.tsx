import { useLayoutEffect } from 'react'
import { anno } from '@/core/anno'
import { ViteNelPalco } from '@/components/vite/ViteNelPalco'
import { regolaCamera } from '@/components/vite/camera'
import { regolaFilm } from '@/components/film/raccordo'

/*
 * Solo per `npm run anteprime` (scripts/anteprime.mjs): la tavola da sola, su fondo trasparente,
 * al punto dell'anno p (?anteprima&p=0.123). Lo script la fotografa per i pannelli dello spazio.
 */
export function Anteprima() {
  useLayoutEffect(() => {
    const qs = new URLSearchParams(location.search)
    const p = Number(qs.get('p') ?? 0)
    // le tavole dei pannelli: l'inquadratura della stagione, ma mai troppo stretta
    regolaCamera.zoomMax = Number(qs.get('zoom') ?? Infinity)
    // i pannelli sono tavole incise anche nelle fasi con un film: niente raccordo verso la clip
    regolaFilm.spento = true
    anno.set(p)
    document.documentElement.classList.add('anteprima')
    document.documentElement.dataset.svela = 'si'
    ;(window as unknown as { __imposta: (p: number) => void }).__imposta = (q) => anno.set(q)
  }, [])
  return (
    <div className="palco anteprima-palco">
      <ViteNelPalco />
    </div>
  )
}
