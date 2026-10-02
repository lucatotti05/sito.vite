import { useLayoutEffect } from 'react'
import { anno } from '@/core/anno'
import { ViteNelPalco } from '@/components/vite/ViteNelPalco'

/*
 * Solo per `npm run anteprime` (scripts/anteprime.mjs): la tavola da sola, su fondo trasparente,
 * al punto dell'anno p (?anteprima&p=0.123). Lo script la fotografa per i pannelli dello spazio.
 */
export function Anteprima() {
  useLayoutEffect(() => {
    const p = Number(new URLSearchParams(location.search).get('p') ?? 0)
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
