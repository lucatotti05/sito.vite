import { useEffect, useRef, useState } from 'react'
import { ciclo } from '@/core/ciclo'

/*
 * Strumento di sviluppo (tasto F, o ?fps=1): fotogrammi al secondo, tempo del fotogramma al
 * 95° percentile e fotogrammi lunghi (oltre 20 ms) negli ultimi 5 secondi. Nessun pannello
 * visibile per chi visita; quando è spento non misura nulla.
 */
export function Contafotogrammi() {
  const [acceso, setAcceso] = useState(() => new URLSearchParams(location.search).get('fps') === '1')
  const testo = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'f' && e.key !== 'F')) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      setAcceso((a) => !a)
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [])

  useEffect(() => {
    if (!acceso) return
    // misura dentro il ciclo unico: mentre è acceso tiene sveglio il ciclo (strumento di sviluppo)
    const tempi: { t: number; d: number }[] = []
    let prec = performance.now()
    let scritto = 0
    return ciclo.aggiungi((ora) => {
      tempi.push({ t: ora, d: ora - prec })
      prec = ora
      while (tempi.length && ora - tempi[0].t > 5000) tempi.shift()
      if (ora - scritto > 250 && testo.current) {
        scritto = ora
        const fps = tempi.filter((x) => ora - x.t < 1000).length
        const ord = tempi.map((x) => x.d).sort((a, b) => a - b)
        const p95 = ord[Math.floor(ord.length * 0.95)] ?? 0
        const lunghi = tempi.filter((x) => x.d > 20).length
        testo.current.textContent = `${fps} fps\np95 ${p95.toFixed(1)} ms\n>20 ms: ${lunghi} / 5 s`
        testo.current.dataset.stato = fps >= 55 ? 'ok' : fps >= 45 ? 'medio' : 'basso'
      }
      return true
    })
  }, [acceso])

  if (!acceso) return null
  return <pre className="contafotogrammi" ref={testo} aria-hidden="true" />
}
