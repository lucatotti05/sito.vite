import { FASI, indiceFase, tFase } from '@/core/tempo'
import { ViteFotogrammi, disponibile, useManifest } from './ViteFotogrammi'
import { ViteTavola } from './ViteTavola'

/**
 * La vite, componente isolato. Riceve solo il giorno interno (0–365, anche frazionario),
 * che non compare mai a schermo. Se per la fase esistono i fotogrammi AI usa il canvas,
 * altrimenti la tavola SVG.
 */
export function Vite({ giorno }: { giorno: number }) {
  const manifest = useManifest()
  const p = giorno / 365
  const i = indiceFase(p)
  if (disponibile(manifest, FASI[i].numero)) return <ViteFotogrammi fase={FASI[i].numero} t={tFase(p, i)} />
  return <ViteTavola giorno={giorno} />
}
