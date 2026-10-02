import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react'
import gsap from 'gsap'
import { D, E } from '@/core/movimento'
import { ciclo } from '@/core/ciclo'
import praticheJson from '@/data/pratiche.json'
import { anno, useAnnoFotogramma } from '@/core/anno'
import { easeInOut, lerp, mixHex, tra } from '@/core/math'
import { usePreferenze } from '@/core/preferenze'
import { usePrimoPiano } from '@/core/primoPiano'
import { FASI, mesiDi, tFase, type Fase } from '@/core/tempo'
import { camera } from '../vite/camera'
import { righe } from './comune'
import { luogoDi, pratica } from './luoghi'
import {
  Acino, Antera, Bocciolo, DecoroCaduta, DecoroFiore, DecoroFoglia, DecoroGermogliamento, DecoroGrappolo, DecoroLegno,
  DecoroMaturazione, DecoroPianto, DecoroVendemmia, FogliaSecca, Gemma, Goccia, Punta, Stazione, coloreAcino,
} from './decori'
import { CENTRO, FORME, etichettaFuori, misto, nastro, poligono, type Etichettatura, type Posa, type Pt } from './forme'

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

/*
 * IL NODO ORBITALE DELLE PRATICHE — un solo componente per tutto l'anno.
 * La forma principale (120 punti) passa con un morph dalla forma finale della fase precedente
 * a quella della fase corrente, poi si anima con il progresso della fase. Le pratiche sono
 * posate sui punti significativi della forma (gemme, gocce, lobi, antere, acini, parti
 * dell'acino, tappe del percorso, foglie). Con movimento ridotto: stato finale e dissolvenza.
 *
 * Dal componente orbitale di partenza (riferimenti/radial-orbital-timeline.tsx) restano:
 * un solo nodo aperto alla volta, i correlati evidenziati, la scheda con i collegamenti
 * cliccabili, il clic fuori che chiude.
 */

type Geometria = { Marcatore: () => JSX.Element; Decoro?: (p: { iFase: number }) => JSX.Element; invito: string }
const GEOMETRIE: Geometria[] = [
  { Marcatore: Gemma, Decoro: DecoroLegno, invito: 'Ogni gemma sul tralcio è una pratica.' },
  { Marcatore: Goccia, Decoro: DecoroPianto, invito: 'Le pratiche sono gocce: scorrono lungo l’orbita e si raccolgono in basso.' },
  { Marcatore: Bocciolo, Decoro: DecoroGermogliamento, invito: 'Le pratiche sono gemme lungo il germoglio e si aprono mentre scorri.' },
  { Marcatore: Punta, Decoro: DecoroFoglia, invito: 'Le pratiche stanno sulle punte dei lobi, collegate dalle nervature.' },
  { Marcatore: Antera, Decoro: DecoroFiore, invito: 'Le pratiche stanno sulle antere dei cinque stami.' },
  { Marcatore: Acino, Decoro: (p) => <DecoroGrappolo {...p} fase={6} />, invito: 'Le pratiche sono acini: crescono finché il grappolo si chiude.' },
  { Marcatore: Acino, Decoro: (p) => <DecoroGrappolo {...p} fase={7} />, invito: 'Gli acini virano uno alla volta, anche quelli delle pratiche.' },
  { Marcatore: Stazione, Decoro: DecoroMaturazione, invito: 'Buccia, polpa e vinaccioli: una pratica per ogni parte.' },
  { Marcatore: Stazione, Decoro: DecoroVendemmia, invito: 'Le pratiche stanno sul percorso dal raspo alla cassetta.' },
  { Marcatore: FogliaSecca, Decoro: DecoroCaduta, invito: 'Le pratiche sono foglie che cadono e si posano a terra.' },
]

/** Il morph tra le forme è a tempo (non trascinato dallo scroll): parte dalla forma disegnata in quel momento. */
const MORPH_S = D.entrata
type Istantanea = { pts: Pt[]; larg: number[]; tratto: string; riempi: string; opR: number }
const campiona = (a: number[], u: number) => {
  const f = u * (a.length - 1)
  const i = Math.min(a.length - 2, Math.floor(f))
  return lerp(a[i], a[i + 1], f - i)
}

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
function coppie(pratiche: Pratica[]) {
  const visti = new Set<string>()
  const out: [number, number][] = []
  pratiche.forEach((p, a) =>
    p.correlate.forEach((c) => {
      const b = pratiche.findIndex((q) => q.id === c)
      const k = [a, b].sort().join('|')
      if (b >= 0 && !visti.has(k)) {
        visti.add(k)
        out.push([a, b])
      }
    }),
  )
  return out
}

export function NodoPratiche({ fase }: { fase: Fase }) {
  const iFase = FASI.indexOf(fase)
  const pratiche = PRATICHE[fase.id] ?? []
  const geo = GEOMETRIE[iFase]
  const { ridotto } = usePreferenze()
  const stretto = useStretto()
  const id = useId()
  const [attiva, setAttiva] = useState<string | null>(null)
  const scelta = pratiche.find((p) => p.id === attiva)
  const vicine = correlateDi(pratiche, attiva)
  const legami = coppie(pratiche)

  const rRiempi = useRef<SVGPathElement>(null)
  const rTratto = useRef<SVGPathElement>(null)
  const rDecoro = useRef<SVGGElement>(null)
  const rMarc = useRef<(SVGGElement | null)[]>([])
  const rEtich = useRef<(SVGTextElement | null)[]>([])
  const rGuide = useRef<(SVGPathElement | null)[]>([])
  const rLegami = useRef<(SVGPathElement | null)[]>([])
  const fermo = useRef(false)
  const ultimePose = useRef<Posa[]>([])
  const rSvg = useRef<SVGSVGElement>(null)
  const rPiano = useRef<SVGGElement>(null)
  const ultimeEtichette = useRef<Etichettatura[]>([])
  /**
   * L'orbita (dalla prova del germogliamento, scegli() e aggiornaNodo()): al clic il piano della
   * forma si inclina di 58° e ruota con la molla finché la pratica scelta arriva davanti (in basso,
   * verso chi guarda); le altre arretrano e si sfocano con la profondità. Si ruota e si inclina il
   * piano, le forme botaniche non si deformano: marcatori ed etichette restano dritti.
   */
  const orbita = useRef({ ang: 0, vAng: 0, incl: 0, vIncl: 0, angT: 0, inclT: 0, scelta: -1 })
  const rScheda = useRef<HTMLElement>(null)
  const rSezione = useRef<HTMLElement>(null)
  const morph = useRef<{ k: number; da: Istantanea | null }>({ k: 1, da: null })
  const ultima = useRef<Istantanea | null>(null)

  useEffect(() => setAttiva(null), [fase.id])
  // quando la collana passa in primo piano la pratica aperta si chiude
  const primo = usePrimoPiano()
  useEffect(() => {
    if (primo !== 'nodo') setAttiva(null)
  }, [primo])
  fermo.current = !!attiva

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

  // la pratica scelta: il piano ruota per portarla davanti e si inclina (molla interrompibile)
  useEffect(() => {
    const o = orbita.current
    const i = pratiche.findIndex((x) => x.id === attiva)
    const q = i >= 0 ? ultimePose.current[i] : null
    o.scelta = i
    if (q) {
      const phi = (Math.atan2(q.p[1] - CENTRO[1], q.p[0] - CENTRO[0]) * 180) / Math.PI
      let t = 90 - phi
      while (t - o.ang > 180) t -= 360
      while (t - o.ang < -180) t += 360
      o.angT = t
      o.inclT = 58
    } else {
      o.angT = 0
      o.inclT = 0
    }
    if (ridotto) {
      o.ang = o.angT
      o.incl = o.inclT
      o.vAng = o.vIncl = 0
      applicaPiano()
    }
    ciclo.sveglia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attiva, pratiche, ridotto])

  useEffect(
    () =>
      ciclo.aggiungi(() => {
        const o = orbita.current
        const fermi = Math.abs(o.ang - o.angT) < 0.01 && Math.abs(o.vAng) < 0.01 && Math.abs(o.incl - o.inclT) < 0.01 && Math.abs(o.vIncl) < 0.01
        if (fermi) {
          if (o.ang !== o.angT || o.incl !== o.inclT) {
            o.ang = o.angT
            o.incl = o.inclT
            applicaPiano()
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
        applicaPiano()
        return true
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // etichette e bersagli a misura di schermo: l'SVG del nodo è ridotto, quindi si compensa
  useLayoutEffect(() => {
    const svg = rSvg.current, sez = rSezione.current
    if (!svg || !sez) return
    const ro = new ResizeObserver(() => sez.style.setProperty('--nodo-k', (590 / Math.max(1, svg.clientWidth)).toFixed(3)))
    ro.observe(svg)
    return () => ro.disconnect()
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

  /** Porta pose, etichette e guide sul piano ruotato e inclinato; il disegno della forma ruota con lui. */
  function applicaPiano() {
    const o = orbita.current
    const a = (o.ang * Math.PI) / 180, inc = (o.incl * Math.PI) / 180
    const ca = Math.cos(a), sa = Math.sin(a), ci = Math.cos(inc)
    const [cx, cy] = CENTRO
    const ruota = (p: Pt): Pt => {
      const dx = p[0] - cx, dy = p[1] - cy
      return [dx * ca - dy * sa, dx * sa + dy * ca]
    }
    const piano = rPiano.current
    if (piano) piano.setAttribute('transform', Math.abs(o.ang) < 0.01 && o.incl < 0.01 ? '' : `translate(${cx} ${cy}) scale(1 ${ci.toFixed(4)}) rotate(${o.ang.toFixed(2)}) translate(${-cx} ${-cy})`)
    const pose = ultimePose.current
    const R = Math.max(1, ...pose.map((q) => Math.hypot(q.p[0] - cx, q.p[1] - cy)))
    const k = Math.min(1, Math.max(0, o.incl / 58))
    const quiete = o.scelta < 0 && k < 0.002 && Math.abs(o.ang) < 0.01
    pose.forEach((q, j) => {
      const [rx, ry] = ruota(q.p)
      const P: Pt = [cx + rx, cy + ry * ci]
      const prof = Math.min(1, Math.max(0, (ry / R + 1) / 2)) // 0 lontano, 1 vicino
      const s = 0.72 + 0.5 * prof * k + (1 - k) * 0.28
      const scelta = j === o.scelta
      const op = scelta || o.scelta < 0 ? 1 : lerp(1, 0.35 + 0.4 * prof, k)
      const sfoca = scelta || o.scelta < 0 ? 0 : (1 - prof) * 2.4 * k
      const m = rMarc.current[j]
      if (m) {
        m.setAttribute('transform', `translate(${P[0].toFixed(1)} ${P[1].toFixed(1)}) rotate(${(q.ang ?? 0).toFixed(1)}) scale(${((q.scala ?? 1) * s).toFixed(3)})`)
        m.style.opacity = quiete ? '' : `calc(var(--vis, 1) * ${op.toFixed(3)})`
        m.style.filter = sfoca > 0.05 ? `blur(${sfoca.toFixed(2)}px)` : ''
      }
      // l'etichetta resta dritta: lo scarto dal marcatore ruota con il piano, l'ancora segue il lato
      const et = ultimeEtichette.current[j]
      const e = rEtich.current[j]
      if (!et) return
      const off = ruota([cx + et.x - q.p[0], cy + et.y - q.p[1]])
      const ex = P[0] + off[0], ey = P[1] + off[1] * lerp(1, ci, 0.5)
      const ancora = quiete ? et.ancora : off[0] < -4 ? 'end' : off[0] > 4 ? 'start' : 'middle'
      if (e) {
        e.setAttribute('transform', `translate(${ex.toFixed(1)} ${ey.toFixed(1)})${quiete ? '' : ` scale(${s.toFixed(3)})`}`)
        e.setAttribute('text-anchor', ancora)
        e.style.opacity = quiete ? '' : `calc(var(--vis, 1) * ${op.toFixed(3)})`
        e.style.filter = sfoca > 0.05 ? `blur(${sfoca.toFixed(2)}px)` : ''
      }
      const gd = rGuide.current[j]
      if (gd) {
        const gx = ex + (ancora === 'end' ? 6 : ancora === 'start' ? -6 : 0)
        gd.setAttribute('d', et.guida ? `M${P[0].toFixed(1)} ${P[1].toFixed(1)} L${gx.toFixed(1)} ${(ey - 5).toFixed(1)}` : '')
      }
    })
  }

  const firma = useRef('')
  const aggiorna = (p: number) => {
    const forma = FORME[iFase]
    // si ridisegna solo quando la forma cambia in modo visibile (1/240 della fase) o durante il morph
    const tVero = Math.round(tFase(p, iFase) * 240) / 240
    const f = `${iFase}|${tVero}|${morph.current.k.toFixed(3)}|${ridotto}|${pratiche.length}`
    if (f === firma.current) return
    firma.current = f
    const t = ridotto ? 1 : tVero
    let pts = forma.forma(t)
    let larg = (u: number) => forma.larghezza(u, t)
    let tratto = forma.tratto, riempi = forma.riempi, opR = forma.opacitaRiempi(t)
    const M = morph.current
    if (!ridotto && M.da && M.k < 1) {
      const k = easeInOut(M.k)
      const da = M.da
      pts = misto(da.pts, pts, k)
      const l0 = larg
      larg = (u) => lerp(campiona(da.larg, u), l0(u), k)
      tratto = mixHex(da.tratto, tratto, k)
      riempi = mixHex(da.riempi, riempi, k)
      opR = lerp(da.opR, opR, k)
    }
    ultima.current = { pts, larg: pts.map((_, j) => larg(j / (pts.length - 1))), tratto, riempi, opR }
    rTratto.current?.setAttribute('d', nastro(pts, larg))
    rTratto.current?.style.setProperty('fill', tratto)
    rRiempi.current?.setAttribute('d', poligono(pts))
    rRiempi.current?.style.setProperty('fill', riempi)
    rRiempi.current?.style.setProperty('fill-opacity', opR.toFixed(3))

    const visDecoro = M.k >= 1 ? 1 : tra(M.k, 0.25, 1)
    if (rDecoro.current) {
      rDecoro.current.style.opacity = (ridotto ? 1 : visDecoro).toFixed(3)
    }

    // le pratiche della nuova fase compaiono nella seconda metà del morph
    const vis = ridotto || M.k >= 1 ? 1 : tra(M.k, 0.45, 1)
    let pose = forma.pose(t, pratiche.length)
    ultimePose.current = pose
    const etichette: Etichettatura[] = []
    pose.forEach((q: Posa, k) => {
      const m = rMarc.current[k]
      if (m) {
        m.style.setProperty('--vis', vis.toFixed(3))
        m.style.setProperty('--apre', (q.apre ?? 1).toFixed(3))
        if (q.vira !== undefined) m.style.setProperty('--acino', coloreAcino(q.vira))
        m.tabIndex = vis > 0.5 ? 0 : -1
      }
      const et = forma.etichetta?.(k, q, t) ?? etichettaFuori(q.p)
      etichette.push(et)
      rEtich.current[k]?.style.setProperty('--vis', vis.toFixed(3))
      const gd = rGuide.current[k]
      if (gd) gd.style.opacity = vis.toFixed(3)
    })
    ultimeEtichette.current = etichette
    applicaPiano()
    legami.forEach(([a, b], k) => {
      const el = rLegami.current[k]
      if (!el || !pose[a] || !pose[b]) return
      const A = pose[a].p, B = pose[b].p
      const c: Pt = forma.viaLegami ?? [lerp((A[0] + B[0]) / 2, CENTRO[0], 0.45), lerp((A[1] + B[1]) / 2, CENTRO[1], 0.45)]
      el.setAttribute('d', `M${A[0].toFixed(1)} ${A[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${B[0].toFixed(1)} ${B[1].toFixed(1)}`)
      el.style.setProperty('--vis', vis.toFixed(3))
    })
  }

  // cambio di fase: la forma parte da quella disegnata ora (anche a metà di un altro morph) e arriva
  // alla nuova in 420 ms; un nuovo cambio la interrompe e riparte da dov'è
  useLayoutEffect(() => {
    if (ridotto || !ultima.current) {
      morph.current = { k: 1, da: null }
      return
    }
    morph.current = { k: 0, da: ultima.current }
    const tw = gsap.to(morph.current, { k: 1, duration: MORPH_S, ease: 'none', onUpdate: () => aggiorna(anno.get()) })
    return () => {
      tw.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iFase, ridotto])

  useAnnoFotogramma((p) => aggiorna(p), [iFase, ridotto, pratiche.length])

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
    const j = (i + passo + pratiche.length) % pratiche.length
    rMarc.current[j]?.focus()
    if (attiva) setAttiva(pratiche[j].id)
  }
  const { Marcatore, Decoro } = geo

  return (
    <section
      ref={rSezione}
      className={`nodo nodo-f${fase.numero}${attiva ? ' fermo' : ''}`}
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
        <g key={ridotto ? fase.id : 'nodo'} className={ridotto ? 'nodo-dissolvi' : undefined}>
          <g ref={rPiano} className="nodo-piano">
          <path ref={rRiempi} className="forma-riempi" />
          <g ref={rDecoro} key={`d${fase.id}`} className="forma-decoro" aria-hidden="true">
            {Decoro && <Decoro iFase={iFase} />}
          </g>
          <path ref={rTratto} className="forma-tratto" />
          <g aria-hidden="true">
            {legami.map(([a, b], k) => {
              const acceso = attiva && (pratiche[a].id === attiva || pratiche[b].id === attiva)
              return (
                <path
                  key={`${fase.id}${a}-${b}${acceso ? '-acceso' : ''}`}
                  ref={(e) => { rLegami.current[k] = e }}
                  pathLength={1}
                  className={`nodo-legame${acceso ? ' acceso' : ''}`}
                />
              )
            })}
          </g>
          </g>
          {pratiche.map((pr, k) => (
            <path key={`g${pr.id}`} ref={(e) => { rGuide.current[k] = e }} className="nodo-guida" aria-hidden="true" />
          ))}
          {pratiche.map((pr, k) => (
            <g
              key={pr.id}
              ref={(e) => { rMarc.current[k] = e }}
              role="button"
              tabIndex={0}
              aria-pressed={attiva === pr.id}
              aria-label={pr.titolo}
              className={`nodo-bottone${attiva === pr.id ? ' attiva' : ''}${vicine.has(pr.id) ? ' vicina' : ''} m-${k % 3}`}
              onClick={(e) => {
                e.stopPropagation()
                scegli(pr.id)
              }}
              onKeyDown={tasti(pr.id)}
            >
              <circle className="nodo-bersaglio" />
              <circle r="18" className="nodo-fuoco" />
              {attiva === pr.id && <circle r="14" className="m-onda" key={`onda-${pr.id}`} />}
              <g className="m-corpo" key={attiva === pr.id ? 'scelta' : 'quieta'}>
                <Marcatore />
              </g>
            </g>
          ))}
          {pratiche.map((pr, k) => (
            <text
              key={`e${pr.id}`}
              ref={(e) => { rEtich.current[k] = e }}
              className={`nodo-etichetta${attiva === pr.id ? ' attiva' : vicine.has(pr.id) ? ' vicina' : ''}`}
              aria-hidden="true"
            >
              {righe(nome(pr)).map((l, j, arr) => (
                <tspan key={j} x="0" dy={j ? 18 : -(arr.length - 1) * 9}>
                  {l}
                </tspan>
              ))}
            </text>
          ))}
        </g>
      </svg>
      <p className="nodo-invito t-etichetta" aria-live="polite" style={{ visibility: scelta ? 'hidden' : undefined }}>
        {geo.invito} Selezionane una.
      </p>
      {scelta && (
        <article ref={rScheda} className="scheda" data-lenis-prevent aria-live="polite" aria-labelledby={`${id}-s`} onClick={(e) => e.stopPropagation()}>
          <header className="scheda-testa">
            <h3 id={`${id}-s`} className="scheda-titolo t-titolo-sezione">
              {scelta.titolo}
            </h3>
            <p className="scheda-meta t-etichetta">{luogoDi(scelta.id).dove}</p>
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
