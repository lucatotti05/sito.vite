import { ciclo } from '@/core/ciclo'
import { motore } from './motore'
import { spazio } from './stato'

/*
 * LA LANTERNA NELLA FASE: la luce è negli shader (spazio/shader.ts); qui la sua parte di senso.
 * Vicino a un organo della vite la luce ne rivela l'annotazione (al più due insieme, le più
 * vicine). Assente su touch e con movimento ridotto: lì restano le prime due note, sempre.
 */
const RAGGIO = 190 // px: un po' meno della luce, l'organo dev'essere davvero illuminato

function lavoro() {
  const st = spazio.get()
  const attiva = motore.mouse.ok && st.dentro
  document.documentElement.classList.toggle('lanterna', motore.mouse.ok)
  if (!attiva) return false
  const svg = document.querySelector<SVGSVGElement>('svg.vite-note')
  const ctm = svg?.getScreenCTM()
  if (!svg || !ctm) return false
  const { x: mx, y: my, forza } = motore.mouse
  const vicini: { g: Element; d: number }[] = []
  svg.querySelectorAll('.v-etichette > g[data-x]').forEach((g) => {
    const p = new DOMPoint(Number(g.getAttribute('data-x')), Number(g.getAttribute('data-y'))).matrixTransform(ctm)
    const d = Math.hypot(p.x - mx, p.y - my)
    if (d < RAGGIO && forza > 0.4) vicini.push({ g, d })
  })
  vicini.sort((a, b) => a.d - b.d)
  const scelti = new Set(vicini.slice(0, 2).map((v) => v.g))
  svg.querySelectorAll('.v-etichette > g[data-x]').forEach((g) => g.classList.toggle('rivelata', scelti.has(g)))
  // finché il punto della lanterna insegue il cursore si ricontrolla
  return Math.abs(motore.mouse.tx - mx) > 0.5 || Math.abs(motore.mouse.ty - my) > 0.5
}

export function avviaLanterna() {
  const togli = ciclo.aggiungi(lavoro)
  const muovi = () => ciclo.sveglia()
  window.addEventListener('pointermove', muovi, { passive: true })
  return () => {
    togli()
    window.removeEventListener('pointermove', muovi)
  }
}
