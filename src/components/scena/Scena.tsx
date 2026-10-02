import { memo, useRef } from 'react'
import { useAnnoFotogramma } from '@/core/anno'
import { misure } from '@/core/misure'
import { caso, campana, clamp, tra } from '@/core/math'
import { parallasseAttiva, preferenze } from '@/core/preferenze'
import { indiceFase, larghezzaFase, sigmaDaP, sigmaInizioFase, tFase } from '@/core/tempo'

/*
 * La scena dietro la vite: piani a profondità diverse che scorrono a velocità diverse.
 * Ogni piano "a tessere" è una striscia periodica larga 2000 unità (alta 1000 = altezza del palco),
 * ripetuta tre volte: scorre all'infinito lungo l'anno. Gli oggetti di fase (vigneto in prospettiva,
 * trattore, papaveri) sono ancorati a un punto del nastro e scorrono con il loro piano.
 */

export type Strato = 'lontano' | 'nebbia' | 'medio' | 'filare' | 'vicino'
const VEL: Record<Strato, number> = { lontano: 0.05, nebbia: 0.1, medio: 0.17, filare: 0.48, vicino: 1 }
const VEL_PIATTA = 0.32 // parallasse spenta: tutti i piani alla stessa velocità

export function velocita(s: Strato) {
  const st = preferenze.get()
  if (st.ridotto) return 0
  return parallasseAttiva() ? VEL[s] : VEL_PIATTA
}

/** Spostamento orizzontale degli oggetti: proporzionato all'altezza, ma mai fuori da uno schermo stretto. */
const unitaDx = (vw: number, H: number) => Math.min(H, vw * 0.48)

/**
 * Punto di fuga della fase: la luce da cui emergono le carte della collana (la porta della
 * cantina nella fase 1, il faro del trattore nella 2, una finestra accesa sulle colline poi).
 * Stessa formula degli oggetti di scena, così carta e luce coincidono.
 */
export function puntoFuga(fase: number, p: number, vw: number, H: number) {
  const pr = PROPS.find((x) => x.fase === fase && x.fuga)
  if (!pr || !pr.fuga) return { x: vw * 0.75, y: H * 0.66 }
  const ancora = sigmaInizioFase(pr.fase) + pr.t * larghezzaFase(pr.fase)
  const sigma = preferenze.get().ridotto ? ancora : sigmaDaP(p)
  const h = pr.h * H
  const x = vw * 0.5 + (ancora - sigma) * vw * velocita(pr.strato) + pr.dx * unitaDx(vw, H) + pr.fuga[0] * h
  return { x, y: pr.y * H + pr.fuga[1] * h }
}

// ── forme periodiche ─────────────────────────────────────────────────────
function collina(base: number, armoniche: [number, number, number][], passo = 20) {
  // armoniche: [ampiezza, frequenza intera, fase] → la curva si richiude su 2000 unità
  let d = `M0 1000 L0 ${base}`
  for (let x = 0; x <= 2000; x += passo) {
    let y = base
    for (const [a, f, ph] of armoniche) y += a * Math.sin((2 * Math.PI * f * x) / 2000 + ph)
    d += ` L${x} ${y.toFixed(1)}`
  }
  return d + ' L2000 1000 Z'
}
function quotaCollina(x: number, base: number, armoniche: [number, number, number][]) {
  let y = base
  for (const [a, f, ph] of armoniche) y += a * Math.sin((2 * Math.PI * f * x) / 2000 + ph)
  return y
}
const ARM_LONTANO: [number, number, number][] = [[34, 1, 0.4], [18, 3, 1.3], [9, 7, 2.1]]
const ARM_MEDIO: [number, number, number][] = [[28, 2, 2.2], [14, 5, 0.7], [6, 11, 1.9]]

function cipresso(x: number, y: number, h: number) {
  const w = h * 0.1
  return `M${x} ${y} C${x - w} ${y - h * 0.18} ${x - w * 0.9} ${y - h * 0.7} ${x} ${y - h} C${x + w * 0.9} ${y - h * 0.7} ${x + w} ${y - h * 0.18} ${x} ${y} Z`
}

const Tessera = memo(function Tessera({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <svg className="tessere" viewBox="0 0 6000 1000" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
      <defs>
        <g id={id}>{children}</g>
      </defs>
      <use href={`#${id}`} x="0" />
      <use href={`#${id}`} x="2000" />
      <use href={`#${id}`} x="4000" />
    </svg>
  )
})

function Lontano() {
  return (
    <Tessera id="t-lontano">
      <path d={collina(612, ARM_LONTANO)} fill="var(--sc-lontano)" />
    </Tessera>
  )
}

function Medio() {
  const r = caso(7)
  const cipressi: string[] = []
  for (const cx of [180, 230, 262, 930, 1010, 1420, 1450, 1490, 1780]) {
    const y = quotaCollina(cx, 700, ARM_MEDIO) + 4
    cipressi.push(cipresso(cx, y, 70 + r() * 60))
  }
  // filari lontani sui fianchi delle colline: tratteggio leggero
  const righe: string[] = []
  for (let x = 380; x < 860; x += 16) {
    const y = quotaCollina(x, 700, ARM_MEDIO)
    righe.push(`M${x} ${y + 14} l${-26} ${60}`)
  }
  for (let x = 1100; x < 1360; x += 15) {
    const y = quotaCollina(x, 700, ARM_MEDIO)
    righe.push(`M${x} ${y + 12} l${22} ${54}`)
  }
  const cas = quotaCollina(1600, 700, ARM_MEDIO)
  return (
    <Tessera id="t-medio">
      <path d={collina(700, ARM_MEDIO)} fill="var(--sc-medio)" />
      <path d={righe.join(' ')} className="sc-righe" />
      <path d={`M1588 ${cas} v-24 l14 -12 l14 12 v24 Z M1616 ${cas} v-16 h22 v16 Z`} className="sc-scuro" />
      <path d={cipressi.join(' ')} className="sc-scuro" />
    </Tessera>
  )
}

function Filare() {
  const pali: string[] = []
  for (let x = 40; x < 2000; x += 250) {
    pali.push(`M${x - 3} 860 h6 v-150 h-6 Z`)
  }
  const ceppi: string[] = []
  for (let x = 80; x < 2000; x += 62) ceppi.push(`M${x} 860 q-3 -30 2 -62`)
  // chioma: ondulata, cresce in altezza con la stagione (scaleY via CSS)
  let chioma = 'M0 800'
  for (let x = 0; x <= 2000; x += 40) chioma += ` Q${x + 20} ${760 - ((x / 40) % 3) * 6} ${x + 40} ${790}`
  chioma += ' L2000 812 L0 812 Z'
  return (
    <Tessera id="t-filare">
      <g className="sc-chioma" data-chioma>
        <path d={chioma} fill="var(--sc-chioma)" />
      </g>
      <path d={ceppi.join(' ')} className="sc-ceppi" />
      <path d="M0 800 H2000 M0 760 H2000 M0 730 H2000" className="sc-fili" />
      <path d={pali.join(' ')} fill="var(--sc-filare)" />
    </Tessera>
  )
}

function Vicino() {
  const r = caso(3)
  let ciuffi = ''
  for (let x = 0; x < 2000; x += 9 + r() * 14) {
    const h = 14 + r() * 30
    ciuffi += `M${x.toFixed(0)} 930 q${(r() * 8 - 4).toFixed(1)} ${(-h / 2).toFixed(1)} ${(r() * 10 - 5).toFixed(1)} ${(-h).toFixed(1)} `
  }
  return (
    <Tessera id="t-vicino">
      <path d="M0 925 C400 915 700 935 1000 924 C1300 914 1600 934 2000 925 L2000 1000 L0 1000 Z" fill="var(--sc-terra)" />
      <path d={ciuffi} className="sc-ciuffi" />
    </Tessera>
  )
}

// ── oggetti di fase ──────────────────────────────────────────────────────
/**
 * Fase 1: la cantina sul colle, con la porta accesa. È il punto di fuga: lo sguardo va lì
 * e la carta della collana esce da quella luce.
 */
function CantinaSulColle() {
  return (
    <svg viewBox="-60 -60 120 60" className="prop-svg" aria-hidden="true">
      <defs>
        <radialGradient id="porta-alone">
          <stop offset="0" stopColor="var(--luce)" stopOpacity="0.75" />
          <stop offset="0.35" stopColor="var(--luce)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--luce)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={PORTA[0]} cy={PORTA[1]} r="46" fill="url(#porta-alone)" className="prop-alone" />
      <path d="M-44 0 V-30 L-18 -46 L8 -30 V0 Z M8 0 V-22 H40 V0 Z M14 -22 L24 -32 L40 -22 Z" className="sc-scuro" />
      <path d="M-14 0 V-13 Q-8 -19 -2 -13 V0 Z" className="prop-porta" />
      <rect x="-34" y="-24" width="5" height="7" className="prop-finestra" />
      <rect x="22" y="-15" width="4" height="5" className="prop-finestra" />
    </svg>
  )
}
/** Porta accesa, in unità del disegno (base 0, altezza 60). */
const PORTA = [-8, -8] as const

function Fascine() {
  const r = caso(11)
  let d = ''
  for (let i = 0; i < 26; i++) {
    const a = -0.25 + r() * 0.5
    d += `M${-80 + r() * 20} ${20 + r() * 10} l${(170 * Math.cos(a)).toFixed(1)} ${(-170 * Math.sin(a) * 0.3).toFixed(1)} `
  }
  return (
    <svg viewBox="-100 -20 220 60" className="prop-svg" aria-hidden="true">
      <path d={d} className="prop-sarmenti" />
      <path d="M-10 10 q4 18 0 30 M20 8 q4 18 0 32" className="prop-legaccio" />
    </svg>
  )
}
function Trattore() {
  return (
    <svg viewBox="0 0 120 70" className="prop-svg" aria-hidden="true">
      <circle cx="112" cy="44" r="26" fill="url(#porta-alone)" className="prop-alone" />
      <path d="M8 54 h70 v-18 h-10 l-6 -18 h-22 v18 h-32 Z" className="sc-scuro" />
      <circle cx="26" cy="54" r="11" className="sc-scuro" />
      <circle cx="70" cy="56" r="7" className="sc-scuro" />
      <path d="M80 50 h34 l-6 -6 h-28 Z" className="sc-scuro" />
      <circle cx="112" cy="44" r="2.6" className="prop-porta" />
      <path d="M-30 58 q20 -8 38 -2" className="prop-polvere" />
    </svg>
  )
}
/** Un casolare sulle colline con una finestra accesa: punto di fuga delle fasi 3–10. */
function Casolare() {
  return (
    <svg viewBox="-40 -40 80 40" className="prop-svg" aria-hidden="true">
      <circle cx="6" cy="-14" r="30" fill="url(#porta-alone)" className="prop-alone" />
      <path d="M-30 0 V-22 L-12 -34 L6 -22 V0 Z M6 0 V-18 H28 V0 Z M10 -18 L18 -25 L28 -18 Z" className="sc-scuro" />
      <rect x="4" y="-16" width="5" height="5" className="prop-porta" />
      <rect x="-20" y="-18" width="4" height="6" className="prop-finestra" />
    </svg>
  )
}
function Papaveri() {
  const r = caso(21)
  const fiori = Array.from({ length: 22 }, () => ({ x: r() * 700 - 350, y: 30 + r() * 50, s: 4 + r() * 5 }))
  return (
    <svg viewBox="-360 -20 720 110" className="prop-svg" aria-hidden="true">
      {fiori.map((f, i) => (
        <g key={i}>
          <path d={`M${f.x} ${f.y + 40} q2 -20 0 -40`} className="prop-stelo" />
          <circle cx={f.x} cy={f.y} r={f.s} className="prop-papavero" />
        </g>
      ))}
    </svg>
  )
}

type Prop = {
  fase: number; strato: Strato; t: number; dx: number; y: number; h: number; El: () => React.JSX.Element
  /** punto di fuga, in altezze dell'oggetto, rispetto alla base al centro */
  fuga?: [number, number]
}
// fase (indice), strato, momento della fase in cui è al centro, spostamento (frazione di H), quota e altezza (frazione di H)
const PROPS: Prop[] = [
  { fase: 0, strato: 'medio', t: 0.4, dx: 0.62, y: 0.72, h: 0.075, El: CantinaSulColle, fuga: [PORTA[0] / 60, PORTA[1] / 60] },
  { fase: 0, strato: 'vicino', t: 0.45, dx: -0.55, y: 0.92, h: 0.07, El: Fascine },
  { fase: 0, strato: 'vicino', t: 0.75, dx: 0.4, y: 0.925, h: 0.06, El: Fascine },
  { fase: 1, strato: 'medio', t: 0.4, dx: 0.56, y: 0.71, h: 0.05, El: Trattore, fuga: [52 / 70, -26 / 70] },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((fase, k): Prop => ({
    fase, strato: 'medio', t: 0.36, dx: 0.5 + (k % 3) * 0.08, y: 0.712, h: 0.05, El: Casolare, fuga: [6 / 40, -14 / 40],
  })),
  { fase: 4, strato: 'vicino', t: 0.4, dx: -0.2, y: 0.9, h: 0.12, El: Papaveri },
  { fase: 4, strato: 'vicino', t: 0.8, dx: 0.6, y: 0.9, h: 0.12, El: Papaveri },
]

export function Scena() {
  const strati = useRef<Partial<Record<Strato, HTMLDivElement | null>>>({})
  const props = useRef<(HTMLDivElement | null)[]>([])
  const palco = useRef<HTMLDivElement>(null)

  useAnnoFotogramma(
    (p) => {
      const el = palco.current
      if (!el) return
      const { vw, H } = misure
      const sigma = sigmaDaP(p)
      const tessera = 2 * H
      const ridotto = preferenze.get().ridotto
      for (const k of Object.keys(VEL) as Strato[]) {
        const s = strati.current[k]
        if (!s) continue
        const x = -((sigma * vw * velocita(k)) % tessera)
        s.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
      }
      // la chioma dei filari cresce in primavera e si spoglia in autunno
      const chioma = clamp(tra(p, 0.27, 0.5) * (1 - tra(p, 0.84, 0.97)))
      el.style.setProperty('--chioma', (0.04 + chioma * 0.96).toFixed(3))
      const fi = indiceFase(p)
      PROPS.forEach((pr, i) => {
        const n = props.current[i]
        if (!n) return
        const vicina = Math.abs(pr.fase - fi) <= 1
        n.style.visibility = vicina ? 'visible' : 'hidden'
        if (!vicina) return
        const ancora = sigmaInizioFase(pr.fase) + pr.t * larghezzaFase(pr.fase)
        const sig = ridotto ? ancora : sigma
        const x = vw * 0.5 + (ancora - sig) * vw * velocita(pr.strato) + pr.dx * unitaDx(vw, H)
        n.style.transform = `translate3d(${x.toFixed(1)}px, ${(pr.y * H).toFixed(1)}px, 0) translate(-50%, -100%)`
        n.style.height = `${pr.h * H}px`
        if (ridotto) {
          const t = pr.fase === fi ? tFase(p, fi) : pr.fase < fi ? 1 : 0
          n.style.opacity = String(campana(t, -0.1, 1.1) > 0.3 ? 1 : 0)
        } else n.style.opacity = '1'
      })
    },
  )

  return (
    <div ref={palco} className="scena" aria-hidden="true">
      <div className="sc-cielo" />
      <div className="sc-luce" />
      <div className="strato" ref={(e) => { strati.current.lontano = e }}><Lontano /></div>
      {/* nebbia bassa d'inverno e calura d'estate: bande che scorrono piano (animazione CSS, sul compositore) */}
      <div className="strato sc-nebbia" ref={(e) => { strati.current.nebbia = e }}>
        <div className="sc-nebbia-banda" />
      </div>
      <div className="sc-calura" />
      <div className="strato" ref={(e) => { strati.current.medio = e }}><Medio /></div>
      {PROPS.filter((p) => p.strato === 'medio').map((pr) => {
        const i = PROPS.indexOf(pr)
        return <div key={i} className="prop" ref={(e) => { props.current[i] = e }}><pr.El /></div>
      })}
      <div className="strato" ref={(e) => { strati.current.filare = e }}><Filare /></div>
      <div className="strato" ref={(e) => { strati.current.vicino = e }}><Vicino /></div>
      {PROPS.filter((p) => p.strato === 'vicino').map((pr) => {
        const i = PROPS.indexOf(pr)
        return <div key={i} className="prop prop-vicino" ref={(e) => { props.current[i] = e }}><pr.El /></div>
      })}
    </div>
  )
}
