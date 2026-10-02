import type { ReactNode } from 'react'
import { numeroDi, tipoDi, url, type Voce } from './collana'

/**
 * Il contenuto della collana incorniciato come oggetto posato nella scena, non imitato:
 * - "campione": foglio d'erbario con l'anteprima montata con le linguette e il cartellino;
 * - "schermo": una lastra scura, sottile, con l'anteprima a filo.
 * Ciò che è "in arrivo" non ha un oggetto: compare nel registro sotto la carta (CarteCollana).
 */
export function Oggetto({ voce, dentro, compatto = false }: { voce: Voce; dentro?: ReactNode; compatto?: boolean }) {
  if (!voce.anteprima) return null
  const img = <img src={url(voce.anteprima)} alt="" width={1280} height={800} decoding="async" draggable={false} />
  if (voce.oggetto === 'schermo')
    return (
      <div className={`ogg ogg-schermo${compatto ? ' compatto' : ''}`}>
        <div className="ogg-vetro">
          {img}
          {dentro}
        </div>
        <span className="ogg-riflesso" aria-hidden="true" />
      </div>
    )
  return (
    <div className={`ogg ogg-campione${compatto ? ' compatto' : ''}`}>
      <div className="ogg-montaggio">
        {img}
        {dentro}
        <span className="ogg-linguetta l1" aria-hidden="true" />
        <span className="ogg-linguetta l2" aria-hidden="true" />
        <span className="ogg-linguetta l3" aria-hidden="true" />
      </div>
      <div className="ogg-cartellino">
        <span className="ogg-cart-n">Collana, numero {Number(numeroDi(voce))}</span>
        <span className="ogg-cart-t">{voce.titolo}</span>
        <span className="ogg-cart-g">{tipoDi(voce)}</span>
      </div>
    </div>
  )
}
