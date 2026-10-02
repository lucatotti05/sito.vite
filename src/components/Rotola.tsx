import type { CSSProperties } from 'react'

/**
 * Testo che "rotola" al passaggio del cursore: le lettere salgono una dopo l'altra e le stesse
 * arrivano da sotto, come i caratteri di un rullo da tipografia (spazio.css, .rotola). Il testo
 * vero resta per i lettori di schermo; con movimento ridotto non si muove nulla.
 * Va dentro un elemento con la classe `con-rotola` (bottone o link), che fa da innesco.
 */
export function Rotola({ testo }: { testo: string }) {
  const lettere = [...testo]
  const riga = (copia: number) => (
    <span className="rotola-riga" aria-hidden="true">
      {lettere.map((l, i) => (
        <span key={`${copia}-${i}`} style={{ '--i': i } as CSSProperties}>
          {l === ' ' ? ' ' : l}
        </span>
      ))}
    </span>
  )
  return (
    <span className="rotola">
      <span className="sr-only">{testo}</span>
      {riga(0)}
      {riga(1)}
    </span>
  )
}
