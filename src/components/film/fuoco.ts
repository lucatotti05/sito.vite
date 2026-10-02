import type { Inquadratura } from '../vite/camera'

/*
 * LA MESSA A FUOCO DEL RACCORDO senza filtri animati (DESIGN.md, "Movimento": niente filter
 * animati su elementi grandi). Prima del passaggio la tavola si fotografa UNA volta su un canvas
 * a bassa risoluzione: ingrandito torna sfocato, come fuori fuoco. Durante il raccordo
 * l'istantanea segue la camera con una sola trasformazione (scala e spostamento) e si dissolve
 * con la tavola nitida; costa come spostare un'immagine.
 *
 * L'istantanea si fa serializzando gli strati SVG della tavola (legno e chioma) con le regole
 * CSS che li riguardano e i valori dei token, e disegnandoli su canvas come immagine.
 */

const RIDUZIONE = 6 // l'istantanea è 1/6 dello schermo: ingrandita, è morbida come fuori fuoco

export type Istantanea = { tela: HTMLCanvasElement; vb: { x: number; y: number; h: number }; W: number; H: number }

let css = ''
/** Le regole della tavola e i valori dei token, da incollare dentro l'SVG serializzato. */
function regole() {
  if (css) return css
  const testi: string[] = []
  for (const foglio of Array.from(document.styleSheets)) {
    let rr: CSSRuleList
    try {
      rr = foglio.cssRules
    } catch {
      continue
    }
    for (const r of Array.from(rr)) if (r instanceof CSSStyleRule && /\.v-/.test(r.selectorText)) testi.push(r.cssText)
  }
  const cs = getComputedStyle(document.documentElement)
  const token = ['nero', 'avorio', 'avorio-20', 'avorio-60', 'avorio-85', 'verde', 'vinaccia', 'ambra', 'oro-60']
    .map((t) => `--${t}:${cs.getPropertyValue(`--${t}`).trim()}`)
    .join(';')
  css = `svg{${token};color:var(--avorio)}${testi.join('')}`
  return css
}

/** Fotografa la tavola con l'inquadratura `q` (senza rotazione) su un canvas ridotto. */
export async function fotografa(posto: HTMLElement, q: Pick<Inquadratura, 'x' | 'y' | 'w' | 'h'>, W: number, H: number): Promise<Istantanea | null> {
  const defs = posto.querySelector('svg.vite-defs')?.innerHTML ?? ''
  // pali e fili restano fuori: durante la rotazione del raccordo attraverserebbero lo schermo in diagonale
  const strati = Array.from(posto.querySelectorAll('svg.vite-legno, svg.vite-chioma'))
    .map((s) => {
      const c = s.cloneNode(true) as SVGElement
      c.querySelector('.v-fissi')?.remove()
      return c.innerHTML
    })
    .join('')
  const w = Math.max(1, Math.round(W / RIDUZIONE)), h = Math.max(1, Math.round(H / RIDUZIONE))
  const testo =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" ` +
    `viewBox="${q.x} ${q.y} ${q.w} ${q.h}"><style>${regole()}</style>${defs}${strati}</svg>`
  const url = URL.createObjectURL(new Blob([testo], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const tela = document.createElement('canvas')
    tela.width = w
    tela.height = h
    const ctx = tela.getContext('2d')
    if (!ctx) return null
    // una sfocatura sull'immagine piccola, calcolata una volta sola: ingrandita resta morbida, senza scalini
    // (dove il filtro del canvas non c'è, basta l'ingrandimento)
    ctx.filter = 'blur(1.5px)'
    ctx.drawImage(img, 0, 0, w, h)
    ctx.filter = 'none'
    return { tela, vb: { x: q.x, y: q.y, h: q.h }, W, H }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** La trasformazione CSS che porta l'istantanea sull'inquadratura corrente (stessa rotazione esclusa). */
export function trasformaIstantanea(ist: Istantanea, q: Pick<Inquadratura, 'x' | 'y' | 'h'>, H: number) {
  const k = ist.vb.h / q.h
  const tx = ((ist.vb.x - q.x) * H) / q.h
  const ty = ((ist.vb.y - q.y) * H) / q.h
  return `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${(k * RIDUZIONE).toFixed(4)})`
}
