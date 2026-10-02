import Lenis from 'lenis'
import { ciclo } from '@/core/ciclo'
import { clamp } from '@/core/math'
import { D, E } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { FASI } from '@/core/tempo'
import { limiteScroll } from '@/components/Scorrimento'
import { motore } from './motore'
import { spazio } from './stato'
import { entra, esci, salta } from './volo'

/*
 * L'INPUT DELLO SPAZIO. Asse orizzontale = il tempo (l'arco), asse verticale = la profondità.
 *  - Anno: scroll orizzontale (trackpad, ⇧ + rotella) e trascinamento fanno scorrere l'arco con
 *    inerzia (Lenis su un contenitore virtuale, sincronizzato con il ciclo unico di GSAP); a
 *    riposo l'arco si posa sul pannello più vicino. Rotella in giù = spinta verso il pannello
 *    centrale: la camera si avvicina con resistenza e, oltre la soglia, entra. Clic, Invio, ↓.
 *  - Fase: lo scroll verticale è quello della fase (Scorrimento.tsx). Oltre l'inizio (in su) o
 *    oltre la fine (in giù) la spinta accumula; oltre la soglia si torna all'Anno (alla fine, con
 *    la fase successiva al centro). Esc, la voce "Anno" nell'angolo.
 * La spinta decade con la molla del sito appena l'input si ferma. Le code d'inerzia del trackpad
 * dopo un passaggio di livello non contano: serve un gesto nuovo.
 */

const PX = 520 // scroll virtuale per pannello
const SOGLIA_ANNO = 540
const SOGLIA_FASE = 720

let lenis: Lenis | null = null
let contenitore: HTMLDivElement | null = null
let ultimoInput = 0
let posato = true
let trascina: { id: number; x0: number; y0: number; s0: number; asse: 'x' | 'y' | null; campioni: { t: number; x: number }[]; mosso: boolean } | null = null
const spinta = { x: 0, v: 0, ultimo: 0 }
/** fino a quando le rotelle non contano per la spinta (code d'inerzia dopo un passaggio) */
let bloccoFino = 0

const pxPannello = () => {
  // quanti px a schermo vale un pannello sull'arco: il trascinamento segue il dito
  const L = motore.L
  const Rc = L.R - L.vicino
  const largo = 2 * (Rc + L.D) * Math.tan((L.fov * Math.PI) / 360) * (motore.vw / motore.H)
  return (motore.vw * L.passo) / largo
}

export const arco = {
  /** Porta l'arco sul pannello i (durata in secondi; 0 = subito). */
  centra(i: number, durata: number = D.scena) {
    const j = clamp(Math.round(i), 0, FASI.length - 1)
    if (!lenis) {
      spazio.arco = j
      return
    }
    ciclo.sveglia()
    if (durata <= 0 || preferenze.get().ridotto) lenis.scrollTo(j * PX, { immediate: true, force: true })
    else lenis.scrollTo(j * PX, { duration: durata, easing: (t) => E.inOut(t), force: true })
    posato = true
  },
  /** Le code d'inerzia della rotella non devono spingere dopo un passaggio di livello. */
  blocca() {
    bloccoFino = performance.now() + 450
    spinta.x = 0
    spinta.v = 0
  },
}

function posa() {
  if (!lenis || trascina || posato) return
  const j = clamp(Math.round(lenis.targetScroll / PX), 0, FASI.length - 1)
  posato = true
  if (Math.abs(j * PX - lenis.targetScroll) > 0.5) lenis.scrollTo(j * PX, { lerp: 0.08, force: true })
}

function spingi(d: number, soglia: number) {
  spinta.x += d / soglia
  spinta.v = 0
  spinta.ultimo = performance.now()
  ciclo.sveglia()
  const st = spazio.get()
  if (st.livello === 'anno' && !st.volo && spinta.x >= 1) {
    spinta.x = 0
    entra(st.centrale)
  } else if (st.modo === 'fase' && st.dentro) {
    if (spinta.x >= 1) {
      spinta.x = 0
      esci(st.aperta < FASI.length - 1 ? 1 : 0)
    } else if (spinta.x <= -1) {
      spinta.x = 0
      esci(0)
    }
  }
}

function rotella(e: WheelEvent) {
  const ora = performance.now()
  if (ora < bloccoFino) {
    // finché arrivano eventi ravvicinati è la coda dello stesso gesto
    bloccoFino = ora + 160
    return
  }
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
  const dx = e.deltaX * k, dy = e.deltaY * k
  const st = spazio.get()
  if (document.documentElement.classList.contains('banco-aperto')) return
  if (st.livello === 'anno' && !st.volo) {
    if (Math.abs(dx) > Math.abs(dy) * 0.8 || e.shiftKey) {
      ultimoInput = ora
      posato = false
      return
    }
    spingi(dy, dy > 0 ? SOGLIA_ANNO : SOGLIA_ANNO * 2.5)
  } else if (st.modo === 'fase' && st.dentro) {
    const lim = limiteScroll()
    if ((lim === 'su' && dy < 0) || (lim === 'giu' && dy > 0)) spingi(dy, SOGLIA_FASE)
    else if (Math.abs(spinta.x) > 0) spinta.ultimo = 0 // si è ripreso a scorrere: la spinta torna
  }
}

// ── trascinamento (mouse e dito) sul canvas, nel livello Anno ──────────────
function giu(e: PointerEvent) {
  const st = spazio.get()
  if (st.livello !== 'anno' || st.volo || !lenis || e.button !== 0) return
  document.documentElement.classList.add('trascina')
  trascina = { id: e.pointerId, x0: e.clientX, y0: e.clientY, s0: lenis.animatedScroll, asse: null, campioni: [{ t: performance.now(), x: e.clientX }], mosso: false }
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}
function muovi(e: PointerEvent) {
  const canvas = e.currentTarget as HTMLElement
  if (!trascina) {
    // sopra un pannello il cursore lo dice
    if (e.pointerType === 'mouse' && spazio.get().livello === 'anno') {
      const i = motore.pannelloSotto(e.clientX, e.clientY)
      canvas.style.cursor = i >= 0 ? 'pointer' : 'grab'
      motore.impostaSopra(i)
    }
    return
  }
  if (e.pointerId !== trascina.id || !lenis) return
  const dx = e.clientX - trascina.x0, dy = e.clientY - trascina.y0
  if (!trascina.asse && Math.hypot(dx, dy) > 6) trascina.asse = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
  if (trascina.asse === 'x') {
    trascina.mosso = true
    canvas.style.cursor = 'grabbing'
    lenis.scrollTo(trascina.s0 - (dx * PX) / pxPannello(), { immediate: true, force: true })
    const ora = performance.now()
    trascina.campioni.push({ t: ora, x: e.clientX })
    while (trascina.campioni.length > 2 && ora - trascina.campioni[0].t > 90) trascina.campioni.shift()
    ultimoInput = ora
    posato = false
  } else if (trascina.asse === 'y' && e.pointerType !== 'mouse') {
    // col dito: in su verso il pannello
    trascina.mosso = true
    const d = trascina.y0 - e.clientY
    trascina.y0 = e.clientY
    spingi(d * 2.2, SOGLIA_ANNO)
  }
}
function su(e: PointerEvent) {
  if (!trascina || e.pointerId !== trascina.id) return
  const t = trascina
  trascina = null
  document.documentElement.classList.remove('trascina')
  const canvas = e.currentTarget as HTMLElement
  canvas.style.cursor = ''
  if (!lenis) return
  if (!t.mosso) {
    // clic: sul pannello centrale si entra, su un altro lo si porta al centro
    const i = motore.pannelloSotto(e.clientX, e.clientY)
    const st = spazio.get()
    if (i >= 0 && i === Math.round(spazio.arco)) entra(i)
    else if (i >= 0) arco.centra(i, D.scena)
    else void st
    return
  }
  if (t.asse === 'x') {
    // lancio: la velocità del dito continua, poi l'arco si posa sul pannello più vicino
    const a = t.campioni[0], b = t.campioni[t.campioni.length - 1]
    const vx = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0 // px/ms
    const meta = lenis.animatedScroll - ((vx * 260) * PX) / pxPannello()
    const j = clamp(Math.round(meta / PX), 0, FASI.length - 1)
    lenis.scrollTo(j * PX, { duration: D.scena, easing: (x) => E.out(x), force: true })
    posato = true
  }
}

// ── tocco nel livello Fase: tirare oltre l'inizio o la fine ────────────────
let toccoY: number | null = null
function toccoInizio(e: TouchEvent) {
  toccoY = e.touches[0]?.clientY ?? null
}
function toccoMuovi(e: TouchEvent) {
  const st = spazio.get()
  if (toccoY === null || st.modo !== 'fase' || !st.dentro) return
  const y = e.touches[0].clientY
  const d = toccoY - y
  toccoY = y
  const lim = limiteScroll()
  if ((lim === 'su' && d < 0) || (lim === 'giu' && d > 0)) spingi(d * 2.4, SOGLIA_FASE)
}
function toccoFine() {
  toccoY = null
  spinta.ultimo = 0
}

// ── tastiera ────────────────────────────────────────────────────────────
function tasti(e: KeyboardEvent) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  if ((e.target as HTMLElement).closest('dialog, input, textarea, select, [data-tasti-propri]')) return
  const st = spazio.get()
  if (st.livello === 'anno' && !st.volo) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') arco.centra(st.centrale + (e.key === 'ArrowRight' ? 1 : -1), D.entrata)
    else if (e.key === 'Home' || e.key === 'End') arco.centra(e.key === 'Home' ? 0 : FASI.length - 1, D.scena)
    else if ((e.key === 'Enter' || e.key === 'ArrowDown') && !(e.target as HTMLElement).closest('button, a')) entra(st.centrale)
    else return
    e.preventDefault()
  } else if (e.key === 'Escape' && st.livello === 'fase') {
    e.preventDefault()
    esci(0)
  } else if (st.modo === 'fase' && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault()
    salta(st.aperta + (e.key === 'ArrowRight' ? 1 : -1))
  }
}

// ── ciclo ───────────────────────────────────────────────────────────────
let oraPrec = 0
function lavoro(ora: number) {
  const dt = Math.min(0.05, Math.max(0.001, (ora - (oraPrec || ora - 16)) / 1000))
  oraPrec = ora
  let ancora = false
  if (lenis) {
    lenis.raf(ora)
    spazio.arco = lenis.animatedScroll / PX
    if (lenis.isScrolling) ancora = true
    if (!posato && !trascina && ora - ultimoInput > 140) posa()
    if (!posato) ancora = true
    // il pannello centrale per l'interfaccia (mese nell'angolo) e per l'accessibilità
    const st = spazio.get()
    if (st.livello === 'anno' && !st.volo) {
      const c = clamp(Math.round(spazio.arco), 0, FASI.length - 1)
      if (c !== st.centrale) spazio.set({ centrale: c })
    }
  }
  // spinta: segue l'input, poi torna a zero con la molla
  if (spinta.x !== 0 || spinta.v !== 0) {
    if (ora - spinta.ultimo > 180) {
      for (let k = 0, n = Math.ceil(dt / 0.008); k < n; k++) {
        const h = dt / n
        spinta.v += (-170 * spinta.x - 22 * spinta.v) * h
        spinta.x += spinta.v * h
      }
      if (Math.abs(spinta.x) < 1e-4 && Math.abs(spinta.v) < 1e-4) spinta.x = spinta.v = 0
    }
    ancora = true
  }
  if (spazio.spinta !== spinta.x) {
    spazio.spinta = spinta.x
    motore.sporca()
    // nella fase la spinta si vede sul palco: arretra un poco, come staccandosi
    const palco = document.querySelector<HTMLElement>('.palco')
    if (palco) {
      const s = spazio.get().modo === 'fase' ? spinta.x : 0
      palco.style.transform = Math.abs(s) > 1e-3 ? `translate3d(0, ${(-s * 2.2).toFixed(2)}vh, 0) scale(${(1 - Math.abs(s) * 0.045).toFixed(4)})` : ''
    }
  }
  return ancora || !!trascina
}

/** Collega l'input allo spazio. Restituisce la funzione per staccarlo. */
export function avviaInput(canvas: HTMLCanvasElement) {
  contenitore = document.createElement('div')
  contenitore.className = 'arco-virtuale'
  contenitore.setAttribute('aria-hidden', 'true')
  const dentro = document.createElement('div')
  dentro.style.width = `${100 + (FASI.length - 1) * PX}px`
  dentro.style.height = '1px'
  contenitore.appendChild(dentro)
  document.body.appendChild(contenitore)
  lenis = new Lenis({
    wrapper: contenitore,
    content: dentro,
    eventsTarget: window,
    orientation: 'horizontal',
    gestureOrientation: 'horizontal',
    smoothWheel: true,
    syncTouch: false,
    lerp: 0.1,
    autoRaf: false,
    autoResize: false,
    // fuori dall'Anno (o in volo) l'arco non prende gli eventi; non si ferma Lenis: fermarlo
    // annullerebbe lo scorrimento in corso verso il pannello di arrivo
    virtualScroll: () => {
      const st = spazio.get()
      return st.livello === 'anno' && !st.volo && !document.documentElement.classList.contains('banco-aperto')
    },
  })
  lenis.scrollTo(spazio.arco * PX, { immediate: true, force: true })
  lenis.on('virtual-scroll', () => {
    ultimoInput = performance.now()
    posato = false
  })
  const aggiornaStato = () => {
    canvas.style.pointerEvents = spazio.get().modo === 'fase' ? 'none' : ''
  }
  const togli = spazio.subscribe(aggiornaStato)
  aggiornaStato()
  const togliLavoro = ciclo.aggiungi(lavoro)
  window.addEventListener('wheel', rotella, { passive: true })
  canvas.addEventListener('pointerdown', giu)
  canvas.addEventListener('pointermove', muovi)
  canvas.addEventListener('pointerup', su)
  canvas.addEventListener('pointercancel', su)
  window.addEventListener('touchstart', toccoInizio, { passive: true })
  window.addEventListener('touchmove', toccoMuovi, { passive: true })
  window.addEventListener('touchend', toccoFine, { passive: true })
  window.addEventListener('keydown', tasti)
  return () => {
    togli()
    togliLavoro()
    window.removeEventListener('wheel', rotella)
    canvas.removeEventListener('pointerdown', giu)
    canvas.removeEventListener('pointermove', muovi)
    canvas.removeEventListener('pointerup', su)
    canvas.removeEventListener('pointercancel', su)
    window.removeEventListener('touchstart', toccoInizio)
    window.removeEventListener('touchmove', toccoMuovi)
    window.removeEventListener('touchend', toccoFine)
    window.removeEventListener('keydown', tasti)
    lenis?.destroy()
    lenis = null
    contenitore?.remove()
  }
}
if (import.meta.env.DEV) (window as unknown as { __limite: typeof limiteScroll; __spinta: typeof spinta }).__limite = limiteScroll
if (import.meta.env.DEV) (window as unknown as { __spinta: typeof spinta }).__spinta = spinta
