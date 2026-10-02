import { useEffect, useRef, useState } from 'react'

/*
 * SECONDA IMPLEMENTAZIONE (vuota) — la vite come sequenza di fotogrammi su canvas.
 *
 * Quando arriveranno le clip generate con l'AI, ogni fase avrà la sua cartella:
 *   public/frames/fase-01/0001.webp … 0120.webp
 *   public/frames/manifest.json  →  { "fase-01": { "fotogrammi": 120, "estensione": "webp" }, … }
 *
 * Il componente riceve la fase e il progresso dentro la fase (entrambi derivati da `giorno`),
 * sceglie il fotogramma e lo disegna. Finché il manifest non c'è, `disponibile()` risponde
 * false e <Vite> usa la tavola SVG.
 *
 * Da fare quando ci saranno i file:
 *  - precaricare i fotogrammi della fase corrente e delle due vicine (ImageBitmap, max ~3 fasi in memoria);
 *  - disegnare con "cover" sul canvas a devicePixelRatio, solo se cambia l'indice;
 *  - dissolvenza incrociata di 300 ms al cambio di fase; con movimento ridotto, fotogramma fisso per fase.
 */

export type Manifest = Record<string, { fotogrammi: number; estensione: string }>

let manifest: Manifest | null | undefined
export async function caricaManifest(): Promise<Manifest | null> {
  if (manifest !== undefined) return manifest
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}frames/manifest.json`, { cache: 'no-cache' })
    manifest = r.ok && r.headers.get('content-type')?.includes('json') ? await r.json() : null
  } catch {
    manifest = null
  }
  return manifest ?? null
}

export function useManifest() {
  const [m, setM] = useState<Manifest | null>(null)
  useEffect(() => {
    caricaManifest().then(setM)
  }, [])
  return m
}

export const disponibile = (m: Manifest | null, fase: number) => !!m?.[`fase-${String(fase).padStart(2, '0')}`]

export function ViteFotogrammi({ fase, t }: { fase: number; t: number }) {
  const tela = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    // segnaposto: qui andrà il disegno del fotogramma Math.round(t * (n - 1)) di fase-XX
    void fase
    void t
  }, [fase, t])
  return <canvas ref={tela} className="vite-tela" aria-hidden="true" />
}
