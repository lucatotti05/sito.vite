import { useSyncExternalStore } from 'react'
import type { Punto } from '../vite/camera'

/*
 * Dove si fa ogni pratica, sulla pianta (coordinate della tavola 600 × 800).
 * Quando si sceglie una pratica nel nodo, la vite si illumina in quel punto e la camera ci va.
 */
type Luogo = { punto: Punto; dove: string }
const L = {
  capo: { punto: [440, 452], dove: 'sul capo a frutto' },
  legatura: { punto: [548, 470], dove: 'dove il capo si lega al filo' },
  palo: { punto: [70, 380], dove: 'sul palo e sui fili' },
  suolo: { punto: [300, 752], dove: 'al piede della vite' },
  interfila: { punto: [470, 760], dove: 'nell’interfila' },
  gemme: { punto: [430, 440], dove: 'sulle gemme del capo' },
  chioma: { punto: [420, 280], dove: 'sulla chioma' },
  germogli: { punto: [380, 430], dove: 'alla base dei germogli' },
  tronco_base: { punto: [302, 700], dove: 'alla base del tronco' },
  fili: { punto: [440, 330], dove: 'tra i fili di contenimento' },
  grappoli: { punto: [436, 398], dove: 'sulla zona dei grappoli' },
  foglie_basali: { punto: [400, 418], dove: 'sulle foglie attorno ai grappoli' },
  apici: { punto: [430, 160], dove: 'sugli apici dei germogli' },
  radici: { punto: [300, 760], dove: 'nel suolo, alle radici' },
  ceppo: { punto: [302, 560], dove: 'sul ceppo' },
} satisfies Record<string, Luogo>

const PRATICA_LUOGO: Record<string, keyof typeof L> = {
  potatura: 'capo', legatura: 'legatura', pali: 'palo', sarmenti: 'interfila', suolo: 'suolo',
  'fine-legatura': 'legatura', concimazione: 'suolo', interfila: 'interfila', revisione: 'interfila',
  gelate: 'gemme', monitoraggio: 'gemme', 'primi-trattamenti': 'chioma',
  scacchiatura: 'germogli', spollonatura: 'tronco_base', 'palizzatura-1': 'fili', 'peronospora-1': 'chioma',
  'scacchiatura-r': 'germogli', palizzatura: 'fili', difesa: 'grappoli', sfogliatura: 'foglie_basali', allegagione: 'grappoli',
  cimatura: 'apici', 'sfogliatura-g': 'foglie_basali', 'difesa-2': 'grappoli', acqua: 'radici',
  diradamento: 'grappoli', tignoletta: 'grappoli', stress: 'chioma',
  botrite: 'grappoli', campionamento: 'grappoli', programma: 'grappoli',
  raccolta: 'grappoli', trasporto: 'interfila', pulizia: 'interfila',
  'concimazione-a': 'suolo', sovescio: 'interfila', segnatura: 'ceppo',
}
export const luogoDi = (id: string): Luogo => L[PRATICA_LUOGO[id] ?? 'chioma'] as Luogo

/** La pratica scelta nel nodo, letta anche dalla vite. */
type Scelta = { id: string; titolo: string; luogo: Luogo } | null
let scelta: Scelta = null
const asc = new Set<() => void>()
export const pratica = {
  get: () => scelta,
  imposta(s: Scelta) {
    scelta = s
    document.documentElement.classList.toggle('pratica-aperta', !!s)
    asc.forEach((f) => f())
  },
  subscribe(f: () => void) {
    asc.add(f)
    return () => {
      asc.delete(f)
    }
  },
}
export const usePratica = () => useSyncExternalStore(pratica.subscribe, pratica.get)
