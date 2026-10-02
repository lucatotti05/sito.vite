/** Spezza un titolo lungo su due righe, allo spazio più vicino a metà. */
export function righe(t: string): string[] {
  if (t.length <= 15) return [t]
  const mid = t.length / 2
  let best = -1
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return best < 0 ? [t] : [t.slice(0, best), t.slice(best + 1)]
}
