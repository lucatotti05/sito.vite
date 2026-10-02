import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type JSX, type KeyboardEvent } from 'react'
import gsap from 'gsap'
import { D, E } from '@/core/movimento'
import { ciclo } from '@/core/ciclo'
import praticheJson from '@/data/pratiche.json'
import { useAnnoFotogramma } from '@/core/anno'
import { lerp } from '@/core/math'
import { usePreferenze } from '@/core/preferenze'
import { usePrimoPiano } from '@/core/primoPiano'
import { LUCI_STAGIONE } from '@/core/stagioni'
import { FASI, mesiDi, tFase, type Fase } from '@/core/tempo'
import { camera } from '../vite/camera'
import { righe } from './comune'
import { luogoDi, pratica } from './luoghi'
import { Acino, Antera, Bocciolo, FogliaSecca, Gemma, Goccia, Punta, Stazione, coloreAcino } from './decori'

export type Pratica = {
  id: string
  titolo: string
  breve?: string
  cosa: string
  perche: string
  quando: string
  errore: string
  correlate: string[]
  da_verificare?: boolean
}
const PRATICHE = praticheJson as Record<string, Pratica[]>
const NESSUNA: Pratica[] = []

/*
 * IL NODO ORBITALE DELLE PRATICHE — un sistema in orbita attorno alla fase.
 * Al centro il cuore della fase: il suo organo (gemma, goccia, fiore, acino, foglia) dentro un
 * alone della luce della stagione, con due onde che ne escono piano. Attorno, su un piano inclinato,
 * l'orbita delle pratiche e un quadrante dell'anno (dodici tacche, i mesi della fase accesi).
 * Scorrendo la fase l'orbita gira (guidata dalla posizione, reversibile); le pratiche dietro il
 * cuore sono più piccole e più spente, quelle davanti più grandi. Al clic il piano si inclina e
 * l'orbita ruota con la molla finché la scelta arriva davanti: si ingrandisce, le collegate si
 * accendono e un filo le unisce, le altre arretrano e si sfocano. Con movimento ridotto: niente
 * onde, niente sfocature, posizioni senza molla.
 *
 * Dal componente di riferimento (riferimenti/radial-orbital-timeline.tsx): un solo nodo aperto alla
 * volta, i correlati evidenziati, la scheda con i collegamenti cliccabili, il clic fuori che chiude.
 */

/** l'organo della fase: il marcatore delle sue pratiche e del suo cuore */
const MARCATORI: (() => JSX.Element)[] = [Gemma, Goccia, Bocciolo, Punta, Antera, Acino, Acino, Stazione, Stazione, FogliaSecca]
const INVITO = 'Le pratiche girano attorno alla fase mentre scorri: scegline una per vederla sulla vite.'

/** centro dell'orbita a riposo; con una pratica scelta scende (la scheda prende lo spazio sopra) */
const CENTRO: [number, number] = [214, 192]
const CY_SCELTA = 300
/** raggio dell'orbita e del quadrante dell'anno (unità del disegno) */
const R = 170
const R_ANNO = 196
/** inclinazione del piano: a riposo e con una pratica scelta (gradi) */
const INCL_RIPOSO = 54
const INCL_SCELTA = 75
/** quanto gira l'orbita lungo tutta la fase (gradi) */
const GIRO = 150
/** interlinea delle etichette su due righe, in corpi (13px a schermo) */
const INTERLINEA = 1.2
const rad = (a: number) => (a * Math.PI) / 180

const mqStretto = window.matchMedia('(max-width: 759px)')
const useStretto = () =>
  useSyncExternalStore(
    (f) => {
      mqStretto.addEventListener('change', f)
      return () => mqStretto.removeEventListener('change', f)
    },
    () => mqStretto.matches,
  )

function correlateDi(pratiche: Pratica[], id: string | null) {
  const s = new Set<string>()
  if (!id) return s
  pratiche.find((p) => p.id === id)?.correlate.forEach((c) => s.add(c))
  pratiche.forEach((p) => p.correlate.includes(id) && s.add(p.id))
  return s
}

/** i mesi della fase sul quadrante dell'anno: indici 0–11 */
const MESI_ANNO = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export function NodoPratiche({ fase }: { fase: Fase }) {
  const iFase = FASI.indexOf(fase)
  const pratiche = PRATICHE[fase.id] ?? NESSUNA
  const n = pratiche.length
  const Marcatore = MARCATORI[iFase] ?? Gemma
  const { ridotto } = usePreferenze()
  const stretto = useStretto()
  const id = useId()
  const [attiva, setAttiva] = useState<string | null>(null)
  const scelta = pratiche.find((p) => p.id === attiva)
  const vicine = correlateDi(pratiche, attiva)
  const mesiFase = new Set(fase.mesi.map((m) => MESI_ANNO.indexOf(m)))

  const rSvg = useRef<SVGSVGElement>(null)
  const rSezione = useRef<HTMLElement>(null)
  const rScheda = useRef<HTMLElement>(null)
  const rOrbitaDietro = useRef<SVGPathElement>(null)
  const rOrbitaDavanti = useRef<SVGPathElement>(null)
  const rAnno = useRef<SVGGElement>(null)
  const rCuore = useRef<SVGGElement>(null)
  const rTacche = useRef<(SVGPathElement | null)[]>([])
  const rMarc = useRef<(SVGGElement | null)[]>([])
  const rEtich = useRef<(SVGTextElement | null)[]>([])
  const rLegami = useRef<(SVGPathElement | null)[]>([])
  /** --nodo-k: unità del disegno per pixel (le etichette sono 13px veri a schermo) */
  const nodoK = useRef(1.5)
  /** larghezza in px della colonna libera dei testi: le etichette possono arrivare fin lì */
  const limiteX = useRef(0)
  /** margini dello schermo in unità del disegno: nessuna etichetta a meno di 24px dal bordo */
  const bordi = useRef({ sx: -1e4, dx: 1e4 })
  /** larghezza vera di ogni etichetta, in unità del disegno (misurata al ridimensionamento) */
  const larghezze = useRef<number[]>([])
  const righeEtich = useRef<number[]>([])
  /** l'orbita: angolo (gradi) e inclinazione, con le loro molle; comparsa delle pratiche (0 → 1) */
  const orbita = useRef({ ang: 0, vAng: 0, incl: INCL_RIPOSO, vIncl: 0, angT: 0, inclT: INCL_RIPOSO, scelta: -1, comparsa: 1 })

  const rimisura = () => {
    limiteX.current = document.querySelector<HTMLElement>('.titoli')?.clientWidth ?? 0
    const r = rSvg.current?.getBoundingClientRect()
    if (r && r.width > 0) {
      const K = 590 / r.width
      bordi.current = { sx: -95 + (28 - r.left) * K, dx: -95 + (window.innerWidth - 28 - r.left) * K }
    }
    const fs = 13 * nodoK.current
    larghezze.current = rEtich.current.map((e) => {
      if (!e) return 0
      const ts = Array.from(e.querySelectorAll('tspan'))
      ts.forEach((t, j) => t.setAttribute('dy', String(j ? INTERLINEA * fs : 0)))
      return Math.max(0, ...ts.map((t) => t.getComputedTextLength()))
    })
  }

  useEffect(() => setAttiva(null), [fase.id])
  // quando la collana passa in primo piano la pratica aperta si chiude
  const primo = usePrimoPiano()
  useEffect(() => {
    if (primo !== 'nodo') setAttiva(null)
  }, [primo])

  // ponte con la vite: la pratica scelta si illumina sulla pianta e la camera ci va
  useEffect(() => {
    const p = pratiche.find((x) => x.id === attiva)
    if (p) {
      const luogo = luogoDi(p.id)
      pratica.imposta({ id: p.id, titolo: p.titolo, luogo })
      camera.guarda(luogo.punto)
    } else {
      pratica.imposta(null)
      camera.guarda(null)
    }
  }, [attiva, pratiche])
  useEffect(() => () => {
    pratica.imposta(null)
    camera.guarda(null)
  }, [])

  /** l'angolo che porta la pratica i davanti (in basso, verso chi guarda), vicino all'angolo attuale */
  const angoloPer = (i: number) => {
    const o = orbita.current
    let t = (-i * 360) / Math.max(1, n)
    while (t - o.ang > 180) t -= 360
    while (t - o.ang < -180) t += 360
    return t
  }
  const angoloScroll = (p: number) => -tFase(p, iFase) * GIRO

  // la pratica scelta: il piano si inclina e l'orbita la porta davanti (molla interrompibile)
  useEffect(() => {
    const o = orbita.current
    const i = pratiche.findIndex((x) => x.id === attiva)
    o.scelta = i
    o.inclT = i >= 0 ? INCL_SCELTA : INCL_RIPOSO
    if (i >= 0) o.angT = angoloPer(i)
    if (ridotto) {
      o.ang = o.angT
      o.incl = o.inclT
      o.vAng = o.vIncl = 0
    }
    applica()
    ciclo.sveglia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attiva, pratiche, ridotto])

  // cambio di fase: le pratiche nuove escono dal cuore e prendono il loro posto sull'orbita
  useLayoutEffect(() => {
    const o = orbita.current
    rimisura()
    if (ridotto) {
      o.comparsa = 1
      applica()
      return
    }
    const tw = gsap.fromTo(o, { comparsa: 0 }, { comparsa: 1, duration: D.scena * 1.3, ease: E.out, onUpdate: applica })
    return () => {
      tw.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase.id, ridotto, stretto])

  // lo scroll della fase fa girare l'orbita (finché non c'è una pratica scelta)
  useAnnoFotogramma(
    (p) => {
      const o = orbita.current
      if (o.scelta >= 0) return
      o.angT = angoloScroll(p)
      if (ridotto) o.ang = o.angT
      ciclo.sveglia()
      applica()
    },
    [iFase, ridotto, n],
  )

  useEffect(
    () =>
      ciclo.aggiungi(() => {
        const o = orbita.current
        const fermi = Math.abs(o.ang - o.angT) < 0.01 && Math.abs(o.vAng) < 0.01 && Math.abs(o.incl - o.inclT) < 0.01 && Math.abs(o.vIncl) < 0.01
        if (fermi) {
          if (o.ang !== o.angT || o.incl !== o.inclT) {
            o.ang = o.angT
            o.incl = o.inclT
            applica()
          }
          return false
        }
        // molla: rigidità 170, smorzamento 22, massa 1 (DESIGN.md); riparte da posizione e velocità attuali
        const dt = 1 / 60
        for (let k = 0; k < 2; k++) {
          const h = dt / 2
          o.vAng += (-170 * (o.ang - o.angT) - 22 * o.vAng) * h
          o.ang += o.vAng * h
          o.vIncl += (-170 * (o.incl - o.inclT) - 22 * o.vIncl) * h
          o.incl += o.vIncl * h
        }
        applica()
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // etichette e bersagli a misura di schermo: l'SVG del nodo è ridotto, quindi si compensa
  useLayoutEffect(() => {
    const svg = rSvg.current, sez = rSezione.current
    if (!svg || !sez) return
    const ro = new ResizeObserver(() => {
      nodoK.current = 590 / Math.max(1, svg.clientWidth)
      sez.style.setProperty('--nodo-k', nodoK.current.toFixed(3))
      rimisura()
      applica()
    })
    document.fonts?.ready.then(() => {
      rimisura()
      applica()
    })
    ro.observe(svg)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // la scheda nasce dal marcatore scelto
  useLayoutEffect(() => {
    const sc = rScheda.current
    const i = pratiche.findIndex((x) => x.id === attiva)
    const m = rMarc.current[i]
    if (!sc || !m || ridotto) return
    const a = m.getBoundingClientRect(), b = sc.getBoundingClientRect()
    const ox = a.left + a.width / 2 - b.left, oy = a.top + a.height / 2 - b.top
    const tw = gsap.fromTo(
      sc,
      { clipPath: `circle(0px at ${ox}px ${oy}px)`, opacity: 0.6 },
      { clipPath: `circle(${Math.hypot(b.width, b.height) * 1.1}px at ${ox}px ${oy}px)`, opacity: 1, duration: D.entrata, ease: E.out, clearProps: 'clipPath' },
    )
    return () => {
      tw.kill()
    }
  }, [attiva, pratiche, ridotto])

  /** Porta pratiche, etichette, orbita, quadrante e fili sul piano ruotato e inclinato. */
  const rApplica = useRef(() => {})
  const applica = () => rApplica.current()
  rApplica.current = function applicaOra() {
    const o = orbita.current
    const cx = CENTRO[0]
    // il piano si inclina e scende insieme: a pratica scelta l'orbita sta sotto la scheda
    const u = (o.incl - INCL_RIPOSO) / (INCL_SCELTA - INCL_RIPOSO)
    const cy = lerp(CENTRO[1], stretto ? CENTRO[1] : CY_SCELTA, u)
    rCuore.current?.setAttribute('transform', `translate(${cx} ${cy.toFixed(1)}) scale(${lerp(1, 0.72, Math.max(0, Math.min(1, u))).toFixed(3)})`)
    const ci = Math.cos(rad(o.incl))
    const k = o.comparsa
    const rr = R * (0.25 + 0.75 * k)
    // l'orbita: la metà dietro passa sotto il cuore, quella davanti sopra
    const ry = rr * ci
    rOrbitaDietro.current?.setAttribute('d', `M${(cx - rr).toFixed(1)} ${cy} A${rr.toFixed(1)} ${ry.toFixed(1)} 0 0 1 ${(cx + rr).toFixed(1)} ${cy}`)
    rOrbitaDavanti.current?.setAttribute('d', `M${(cx + rr).toFixed(1)} ${cy} A${rr.toFixed(1)} ${ry.toFixed(1)} 0 0 1 ${(cx - rr).toFixed(1)} ${cy}`)
    // il quadrante dell'anno gira con l'orbita: dodici tacche radiali sul piano inclinato
    rTacche.current.forEach((t, m) => {
      if (!t) return
      const a = rad(90 + m * 30 + o.ang * 0.6)
      const lun = mesiFase.has(m) ? 12 : 6
      const x0 = cx + R_ANNO * Math.cos(a), y0 = cy + R_ANNO * ci * Math.sin(a)
      const x1 = cx + (R_ANNO + lun) * Math.cos(a), y1 = cy + (R_ANNO + lun) * ci * Math.sin(a)
      t.setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`)
      t.style.opacity = (0.35 + 0.65 * ((Math.sin(a) + 1) / 2)).toFixed(3)
    })
    rAnno.current?.setAttribute('transform', '')

    const K = nodoK.current
    const fs = 13 * K
    const lh = INTERLINEA * fs
    const scelto = o.scelta
    // primo passo: dove vanno pratiche ed etichette
    const posti = pratiche.map((_, i) => {
      const th = rad(90 + (i * 360) / Math.max(1, n) + o.ang)
      const c = Math.cos(th), s = Math.sin(th)
      const x = cx + rr * c, y = cy + rr * ci * s
      const prof = (s + 1) / 2 // 0 dietro, 1 davanti
      const eScelta = i === scelto
      const sc = lerp(0.76, 1.1, prof) * (eScelta ? 1.25 : 1) * (0.4 + 0.6 * k)
      // l'etichetta sta fuori dall'orbita, dalla parte del suo lato: a destra, a sinistra, sopra o sotto
      const righeN = righeEtich.current[i] ?? 1
      const dist = 10 * K + 20 * sc
      let ancora: 'start' | 'middle' | 'end' = 'middle'
      let ex = x, ey = y
      if (c > 0.42) {
        ancora = 'start'
        ex = x + dist
        ey = y - ((righeN - 1) * lh) / 2 + fs * 0.35
      } else if (c < -0.42) {
        ancora = 'end'
        ex = x - dist
        ey = y - ((righeN - 1) * lh) / 2 + fs * 0.35
      } else if (s > 0) {
        ey = y + dist + fs * 0.7
      } else {
        ey = y - dist - (righeN - 1) * lh
      }
      return { x, y, prof, sc, eScelta, ex, ey, ancora, righeN }
    })

    // secondo passo: nessuna etichetta sopra un'altra né fuori dal disegno
    const scatola = (q: (typeof posti)[number], j: number) => {
      const w = (larghezze.current[j] || 10 * 0.56 * fs) + 6 * K
      const x0 = q.ancora === 'end' ? q.ex - w : q.ancora === 'middle' ? q.ex - w / 2 : q.ex
      return { x0: x0 - fs * 0.1, x1: x0 + w + fs * 0.1, y0: q.ey - fs * 0.95, y1: q.ey + (q.righeN - 1) * lh + fs * 0.4 }
    }
    const xMin = Math.max(-93, bordi.current.sx), xMax = Math.min(Math.max(493, limiteX.current * K - 95 - 4), bordi.current.dx), yMin = -18, yMax = 398
    const contieni = (i: number) => {
      const b = scatola(posti[i], i)
      if (b.x0 < xMin) posti[i].ex += xMin - b.x0
      else if (b.x1 > xMax) posti[i].ex -= b.x1 - xMax
      if (b.y0 < yMin) posti[i].ey += yMin - b.y0
      else if (b.y1 > yMax) posti[i].ey -= b.y1 - yMax
    }
    for (let giro = 0; giro < 24; giro++) {
      for (let i = 0; i < posti.length; i++) contieni(i)
      let mosso = false
      for (let i = 0; i < posti.length; i++)
        for (let j = i + 1; j < posti.length; j++) {
          const A = scatola(posti[i], i), B = scatola(posti[j], j)
          if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue
          const sopra = (A.y0 + A.y1) / 2 <= (B.y0 + B.y1) / 2
          const dy = (sopra ? A.y1 - B.y0 : B.y1 - A.y0) / 2 + fs * 0.2
          posti[i].ey += sopra ? -dy : dy
          posti[j].ey += sopra ? dy : -dy
          mosso = true
        }
      if (!mosso) break
    }

    // terzo passo: si scrive
    posti.forEach((q, i) => {
      const m = rMarc.current[i]
      const qualcuna = scelto >= 0
      const op = q.eScelta || !qualcuna ? lerp(0.5, 1, q.prof) : vicine.has(pratiche[i].id) ? lerp(0.6, 0.95, q.prof) : lerp(0.2, 0.5, q.prof)
      const sfoca = !ridotto && qualcuna && !q.eScelta ? (1 - q.prof) * 1.8 : 0
      if (m) {
        m.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${q.sc.toFixed(3)})`)
        m.style.opacity = (op * Math.min(1, k * 1.4)).toFixed(3)
        m.style.filter = sfoca > 0.05 ? `blur(${sfoca.toFixed(2)}px)` : ''
      }
      const e = rEtich.current[i]
      if (e) {
        e.setAttribute('transform', `translate(${q.ex.toFixed(1)} ${q.ey.toFixed(1)})`)
        e.setAttribute('text-anchor', q.ancora)
        const opE = q.eScelta || !qualcuna ? lerp(0.62, 1, q.prof) : vicine.has(pratiche[i].id) ? 0.85 : 0
        e.style.opacity = (opE * Math.max(0, k * 1.6 - 0.6)).toFixed(3)
        e.style.filter = sfoca > 0.05 ? `blur(${(sfoca * 0.7).toFixed(2)}px)` : ''
      }
    })
    // i fili tra la scelta e le collegate: curve che passano vicino al cuore
    let f = 0
    if (scelto >= 0) {
      const A = posti[scelto]
      posti.forEach((B, j) => {
        if (j === scelto || !vicine.has(pratiche[j].id)) return
        const el = rLegami.current[f++]
        if (!el) return
        const c: [number, number] = [lerp((A.x + B.x) / 2, cx, 0.55), lerp((A.y + B.y) / 2, cy, 0.55)]
        el.setAttribute('d', `M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`)
      })
    }
  }

  useEffect(() => {
    if (!attiva) return
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setAttiva(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [attiva])

  const scegli = (pid: string) => setAttiva((a) => (a === pid ? null : pid))
  const nome = (p: Pratica) => (stretto && p.breve ? p.breve : p.titolo)
  const tasti = (pid: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      scegli(pid)
      return
    }
    // frecce: da una pratica all'altra senza far scorrere l'anno
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const i = pratiche.findIndex((x) => x.id === pid)
    const j = (i + passo + n) % n
    rMarc.current[j]?.focus()
    if (attiva) setAttiva(pratiche[j].id)
  }
  righeEtich.current = pratiche.map((p) => righe(nome(p)).length)
  const nVicine = vicine.size
  const luce = LUCI_STAGIONE[iFase] ?? LUCI_STAGIONE[0]

  return (
    <section
      ref={rSezione}
      className={`nodo nodo-f${fase.numero}${attiva ? ' fermo' : ''}`}
      style={{ '--stagione': luce } as CSSProperties}
      aria-labelledby={`${id}-t`}
      onClick={() => setAttiva(null)}
    >
      <h2 id={`${id}-t`} className="sr-only">
        Pratiche del periodo: {fase.titolo}, {mesiDi(fase)}
      </h2>
      <svg
        ref={rSvg}
        viewBox="-95 -20 590 420"
        className="nodo-svg"
        role="group"
        data-tasti-propri
        aria-label={`Pratiche: ${pratiche.map((p) => p.titolo).join(', ')}. Frecce per passare da una all'altra.`}
      >
        <defs>
          <radialGradient id={`${id}-alone`}>
            <stop offset="0" stopColor={luce} stopOpacity="0.42" />
            <stop offset="0.45" stopColor={luce} stopOpacity="0.12" />
            <stop offset="1" stopColor={luce} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-ombra`}>
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g aria-hidden="true">
          {/* il quadrante dell'anno e la metà lontana dell'orbita */}
          <g ref={rAnno} className="nodo-anno">
            {MESI_ANNO.map((m, j) => (
              <path key={m} ref={(e) => { rTacche.current[j] = e }} className={`nodo-tacca${mesiFase.has(j) ? ' accesa' : ''}`} />
            ))}
          </g>
          <path ref={rOrbitaDietro} className="nodo-orbita dietro" />
        </g>
        {/* il cuore della fase: alone della stagione, onde, l'organo */}
        <g ref={rCuore} className="nodo-cuore" transform={`translate(${CENTRO[0]} ${CENTRO[1]})`} aria-hidden="true" key={`c${fase.id}`}>
          <circle r="118" fill={`url(#${id}-alone)`} className="cuore-alone" />
          {!ridotto && (
            <>
              <circle r="36" className="cuore-onda" />
              <circle r="36" className="cuore-onda tarda" />
            </>
          )}
          <circle r="37" className="cuore-disco" />
          <g className="cuore-organo">
            <Marcatore />
          </g>
        </g>
        <g aria-hidden="true">
          <path ref={rOrbitaDavanti} className="nodo-orbita davanti" />
          {Array.from({ length: nVicine }, (_, j) => (
            <path key={`${attiva}-${j}`} ref={(e) => { rLegami.current[j] = e }} pathLength={1} className="nodo-legame acceso" />
          ))}
        </g>
        <g>
          {pratiche.map((pr, k) => (
            <g
              key={pr.id}
              ref={(e) => { rMarc.current[k] = e }}
              role="button"
              tabIndex={0}
              aria-pressed={attiva === pr.id}
              aria-label={pr.titolo}
              className={`nodo-bottone${attiva === pr.id ? ' attiva' : ''}${vicine.has(pr.id) ? ' vicina' : ''} m-${k % 3}`}
              style={iFase === 6 ? ({ '--acino': coloreAcino(k / Math.max(1, n - 1)) } as CSSProperties) : undefined}
              onClick={(e) => {
                e.stopPropagation()
                scegli(pr.id)
              }}
              onKeyDown={tasti(pr.id)}
            >
              <ellipse cy="25" rx="20" ry="6" fill={`url(#${id}-ombra)`} className="nodo-ombra" />
              <circle className="nodo-bersaglio" />
              <circle r="26" className="nodo-fuoco" />
              {attiva === pr.id && <circle r="20" className="m-onda" key={`onda-${pr.id}`} />}
              <circle r="20" className="nodo-disco" />
              <g className="m-corpo" key={attiva === pr.id ? 'scelta' : 'quieta'}>
                <g transform="scale(0.92)">
                  <Marcatore />
                </g>
              </g>
            </g>
          ))}
        </g>
        {pratiche.map((pr, k) => (
          <text
            key={`e${pr.id}`}
            ref={(e) => { rEtich.current[k] = e }}
            className={`nodo-etichetta${attiva === pr.id ? ' attiva' : vicine.has(pr.id) ? ' vicina' : ''}`}
            aria-hidden="true"
          >
            {righe(nome(pr)).map((l, j) => (
              <tspan key={j} x="0" dy={j ? 18 : 0}>
                {l}
              </tspan>
            ))}
          </text>
        ))}
      </svg>
      <p className="nodo-invito t-etichetta" aria-live="polite" style={{ visibility: scelta ? 'hidden' : undefined }}>
        {INVITO}
      </p>
      {scelta && (
        <article ref={rScheda} className="scheda" data-lenis-prevent aria-live="polite" aria-labelledby={`${id}-s`} onClick={(e) => e.stopPropagation()}>
          <header className="scheda-testa">
            <p className="scheda-meta t-etichetta">{luogoDi(scelta.id).dove}</p>
            <h3 id={`${id}-s`} className="scheda-titolo t-titolo-sezione">
              {scelta.titolo}
            </h3>
            <button type="button" className="scheda-chiudi t-etichetta" onClick={() => setAttiva(null)} aria-label="Chiudi la scheda">
              Chiudi
            </button>
          </header>
          <dl className="scheda-campi">
            <div>
              <dt className="t-etichetta">Cosa si fa</dt>
              <dd className="t-testo">{scelta.cosa}</dd>
            </div>
            <div>
              <dt className="t-etichetta">Perché</dt>
              <dd className="t-testo">{scelta.perche}</dd>
            </div>
            <div>
              <dt className="t-etichetta">Quando, nella fase</dt>
              <dd className="t-testo">{scelta.quando}</dd>
            </div>
            <div className="scheda-errore">
              <dt className="t-etichetta">Errore tipico</dt>
              <dd className="t-testo">{scelta.errore}</dd>
            </div>
          </dl>
          {vicine.size > 0 && (
            <div className="scheda-legami">
              <span className="scheda-legami-testa t-etichetta">Collegata a</span>
              <div className="nodo-chip">
                {[...vicine].map((v) => (
                  <button key={v} type="button" onClick={() => setAttiva(v)}>
                    {pratiche.find((p) => p.id === v)?.titolo}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>
      )}
    </section>
  )
}
