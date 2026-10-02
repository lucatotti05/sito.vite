import { useAnno } from '@/core/anno'
import { usePrimoPiano } from '@/core/primoPiano'
import { FASI, indiceFase, tFase } from '@/core/tempo'
import { NodoPratiche } from './NodoPratiche'
import { useSpazio } from '@/spazio/stato'

/**
 * Il nodo è aperto dentro la fase: entra quando il pannello passa la mano al DOM, passa di forma
 * in forma tra le fasi e si chiude negli ultimi istanti di dicembre, quando arriva il finale.
 * Lo scroll decide se è aperto; l'apertura e la chiusura sono a tempo (.nodo-posto in palco.css).
 */
const aperto = (p: number) => {
  const i = indiceFase(p)
  const t = tFase(p, i)
  return !(i === FASI.length - 1 && t > 0.9)
}

export function NodoFase() {
  const i = useAnno(indiceFase)
  // un solo elemento interattivo aperto: con la collana in primo piano il nodo si richiude
  const inScena = useAnno(aperto)
  const primo = usePrimoPiano()
  const dentro = useSpazio((d) => d.dentro)
  const su = dentro && inScena && primo === 'nodo'
  return (
    <div className={`nodo-posto${su ? ' aperto' : ''}`} aria-hidden={!su}>
      <NodoPratiche fase={FASI[i]} />
    </div>
  )
}
