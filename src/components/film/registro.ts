import elenco from 'virtual:film'

/*
 * I momenti film, letti dai manifest in public/film/<id>/manifest.json (vedi vite.config.ts).
 * Coordinate del fotogramma: frazioni 0–1 della larghezza e dell'altezza.
 * Avanzamento della clip (da/a di note e sottotitoli): 0 = primo fotogramma, 1 = ultimo.
 */
export type Segmento = { base: [number, number]; punta: [number, number]; centro: [number, number]; raggio: number }
export type Manifesto = {
  id: string
  fase: number
  titolo: string
  descrizione: string
  cartella: string
  fotogrammi: { percorso: string; cifre: number; numero: number; larghezza: number; altezza: number; mobile?: string }
  inquadratura: { fuoco: [number, number] }
  /** il soggetto sul primo e sull'ultimo fotogramma: base e punta definiscono posizione, misura e asse */
  soggetto: { inizio: Segmento; fine: Segmento }
  /** il punto corrispondente sulla vite disegnata (vedi ancore.ts) */
  tavola: { inizio: string; fine: string }
  /** parte della fase che passa mentre scorre la clip */
  anno: { quota: number }
  /** colore della luce della clip: la scena disegnata ci si avvicina prima del passaggio */
  luce: string
  note: { testo: string; x: number; y: number; da: number; a: number; lx: number; ly: number }[]
  sottotitoli: { da: number; a: number; testo: string }[]
}

export const FILM: Manifesto[] = elenco
export const filmDellaFase = (numero: number) => FILM.find((f) => f.fase === numero)

export function urlFotogramma(m: Manifesto, i: number, stretto: boolean) {
  const modello = (stretto && m.fotogrammi.mobile) || m.fotogrammi.percorso
  return `${import.meta.env.BASE_URL}${m.cartella}${modello.replace('{n}', String(i).padStart(m.fotogrammi.cifre, '0'))}`
}
