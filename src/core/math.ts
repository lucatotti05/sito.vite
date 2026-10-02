export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Posizione di v fra a e b, limitata a 0–1. */
export const tra = (v: number, a: number, b: number) => clamp((v - a) / (b - a))
export const smooth = (t: number) => t * t * (3 - 2 * t)
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** Campana 0→1→0 su [a, b]. */
export const campana = (v: number, a: number, b: number) => Math.sin(Math.PI * tra(v, a, b))

/** Numero pseudo-casuale stabile (stessa vite a ogni caricamento). */
export function caso(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── colori ───────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const hexRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const hx = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
export const rgbHex = ([r, g, b]: RGB) => `#${hx(r)}${hx(g)}${hx(b)}`
export const mixHex = (a: string, b: string, t: number) => {
  const A = hexRgb(a), B = hexRgb(b)
  return rgbHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)])
}
const lin = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export const luminanza = (h: string) => {
  const [r, g, b] = hexRgb(h)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const contrasto = (a: string, b: string) => {
  const la = luminanza(a), lb = luminanza(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Interpola una tavolozza a chiavi (posizioni 0–1 nell'anno). */
export function interpolaTavolozza<T extends Record<string, string>>(chiavi: { p: number; c: T }[], p: number): T {
  let i = 0
  while (i < chiavi.length - 2 && p > chiavi[i + 1].p) i++
  const a = chiavi[i], b = chiavi[i + 1]
  const t = smooth(tra(p, a.p, b.p))
  const out = {} as Record<string, string>
  for (const k in a.c) out[k] = mixHex(a.c[k], b.c[k], t)
  return out as T
}
