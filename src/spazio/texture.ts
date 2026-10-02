import * as THREE from 'three'

/*
 * TEXTURE DEI PANNELLI, a livelli di dettaglio:
 *  - fermo:  anteprima ridotta (512 × 683) di ogni fase, caricata per tutte all'avvio;
 *  - ciclo:  atlante 4 × 3 di fotogrammi della fase (crescita della tavola o clip), solo per il
 *            pannello centrale e i due vicini; liberato quando il pannello si allontana;
 *  - istantanea: la tavola vera, alla misura dello schermo, fotografata quando il pannello è al
 *            centro: è l'immagine che passa la mano al DOM all'ingresso (stessi pixel);
 *  - uscita: lo stato della fase al momento dell'uscita (tavola e film), che torna nell'arco.
 * Le anteprime si rigenerano con `npm run anteprime` (scripts/anteprime.mjs).
 */

export const CELLE = { colonne: 4, righe: 3, n: 12 } as const
/** Proporzioni di una cella e del fermo-immagine (3:4, come il pannello a riposo). */
export const ASPETTO_CELLA = 3 / 4

const base = `${import.meta.env.BASE_URL}anteprime/fasi/`
export const urlFermo = (i: number) => `${base}${String(i + 1).padStart(2, '0')}/fermo.webp`
export const urlCiclo = (i: number) => `${base}${String(i + 1).padStart(2, '0')}/ciclo.webp`

function prepara(t: THREE.Texture, mip = true) {
  t.flipY = false
  t.colorSpace = THREE.NoColorSpace
  t.generateMipmaps = mip
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** Scarica un'immagine e la decodifica fuori dal thread principale. */
export async function caricaTexture(url: string, mip = true): Promise<THREE.Texture | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const bm = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    return prepara(new THREE.Texture(bm as unknown as HTMLImageElement), mip)
  } catch {
    return null
  }
}

export function textureDaCanvas(c: HTMLCanvasElement | ImageBitmap, mip = false) {
  return prepara(new THREE.Texture(c as unknown as HTMLImageElement), mip)
}

export function libera(t: THREE.Texture | null | undefined) {
  if (!t) return
  const img = t.image as { close?: () => void } | undefined
  t.dispose()
  img?.close?.()
}

/**
 * Ritaglio "cover" di una texture di proporzioni `ta` dentro un pannello di proporzioni `pa`,
 * con il centro orizzontale preferito `cx` (il soggetto). Restituisce offset e scala delle UV.
 * Quando il pannello ha le proporzioni della texture il ritaglio è l'intera immagine.
 */
export function ritaglio(ta: number, pa: number, cx = 0.5, cy = 0.5, cella?: { c: number; r: number; i: number }): THREE.Vector4 {
  let w = 1, h = 1
  if (pa < ta) w = pa / ta
  else h = ta / pa
  const x = Math.min(1 - w, Math.max(0, cx - w / 2))
  const y = Math.min(1 - h, Math.max(0, cy - h / 2))
  if (!cella) return new THREE.Vector4(x, y, w, h)
  const col = cella.i % cella.c, row = Math.floor(cella.i / cella.c)
  // mezzo texel di margine per lato: le celle vicine non sbavano nel filtro
  const m = 0.0015
  return new THREE.Vector4((col + m + x * (1 - 2 * m)) / cella.c, (row + m + y * (1 - 2 * m)) / cella.r, (w * (1 - 2 * m)) / cella.c, (h * (1 - 2 * m)) / cella.r)
}

/** Il nome della fase come texture: Bodoni Moda corsivo (stile annotazione, più grande), avorio. */
export const FONT_NOME = '"Bodoni Moda Variable", "Bodoni Moda", Didot, Georgia, serif'
export const PX_NOME = 20
export function textureNome(testo: string) {
  const scala = 3
  const px = PX_NOME * scala
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = `italic 400 ${px}px ${FONT_NOME}`
  ctx.font = font
  const w = Math.ceil(ctx.measureText(testo).width + 2 * scala)
  c.width = w
  c.height = Math.ceil(px * 1.5)
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ede4d3'
  ctx.fillText(testo, scala, c.height / 2)
  const t = prepara(new THREE.Texture(c as unknown as HTMLImageElement), true)
  return { t, aspetto: c.width / c.height, altezzaPx: c.height / scala }
}

/** Una texture 1 × 1 trasparente, per i pannelli che non hanno ancora la loro immagine. */
export const VUOTA = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  t.needsUpdate = true
  return t
})()
