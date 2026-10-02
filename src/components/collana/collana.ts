import { useSyncExternalStore } from 'react'
import collanaJson from '@/data/collana.json'

/*
 * La collana come sistema di dati (src/data/collana.json). Ogni contenuto dice in quali fasi
 * compare: una fase può avere più carte, che emergono dalla scena a profondità diverse.
 * Le voci "in arrivo" hanno un aspetto proprio e non si aprono.
 */
export type Voce = {
  id: string
  titolo: string
  tipo: string
  fasi: number[]
  stato: 'disponibile' | 'in arrivo'
  oggetto?: 'campione' | 'schermo'
  anteprima: string | null
  link: string | null
  sintesi?: string
  punti?: string[]
}
export const COLLANA = collanaJson as Voce[]
export const url = (percorso: string) => `${import.meta.env.BASE_URL}${percorso}`
export const disponibile = (v: Voce) => v.stato === 'disponibile' && !!v.link

/** Numero d'ordine nella collana, solo per i contenuti disponibili. */
export const numeroDi = (v: Voce) => String(COLLANA.filter(disponibile).indexOf(v) + 1).padStart(2, '0')
export const tipoDi = (v: Voce) => v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1)

/** Le carte di una fase (numero 1–10): prima i disponibili, poi gli "in arrivo". */
export const carteDellaFase = (numero: number) =>
  COLLANA.filter((v) => v.fasi.includes(numero)).sort((a, b) => Number(disponibile(b)) - Number(disponibile(a)))

/** Quale voce è aperta sul banco di lavoro, e da quale elemento è partita. */
type Aperta = { voce: Voce; origine: HTMLElement } | null
let aperta: Aperta = null
const asc = new Set<() => void>()
export const banco = {
  get: () => aperta,
  apri(voce: Voce, origine: HTMLElement) {
    aperta = { voce, origine }
    asc.forEach((f) => f())
  },
  chiudi() {
    aperta = null
    asc.forEach((f) => f())
  },
  subscribe(f: () => void) {
    asc.add(f)
    return () => {
      asc.delete(f)
    }
  },
}
export const useBanco = () => useSyncExternalStore(banco.subscribe, banco.get)
