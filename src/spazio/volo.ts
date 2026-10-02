import gsap from 'gsap'
import { anno } from '@/core/anno'
import { misure } from '@/core/misure'
import { D, E } from '@/core/movimento'
import { preferenze } from '@/core/preferenze'
import { FASI } from '@/core/tempo'
import { fotografa } from '@/components/film/fuoco'
import { statoFilm } from '@/components/film/raccordo'
import { inquadratura, regia } from '@/components/vite/camera'
import { attivaScroll, montaFase } from '@/components/Scorrimento'
import { motore } from './motore'
import { spazio } from './stato'
import { arco } from './input'

/*
 * IL VOLO TRA I LIVELLI. Anno ↔ Fase è lo stesso oggetto che si avvicina: il pannello si spiana,
 * si allarga fino alle proporzioni dello schermo e, quando lo riempie, passa la mano alla fase
 * vera nel DOM, che sta sotto il canvas con gli stessi pixel (l'istantanea della tavola).
 * All'uscita si fotografa lo stato corrente, il canvas torna opaco e il pannello torna nell'arco.
 * --d-scena, --ease-in-out; interrompibile: un nuovo comando riparte dal valore corrente di u.
 */

let tween: gsap.core.Tween | null = null
let gettone = 0

const durata = (da: number, a: number) => D.volo * Math.max(0.4, Math.abs(a - da))
const svela = (si: boolean) => {
  document.documentElement.dataset.svela = si ? 'si' : 'no'
}

function scriviIndirizzo(i: number | null) {
  const u = new URL(location.href)
  if (i === null) u.searchParams.delete('fase')
  else u.searchParams.set('fase', String(i + 1))
  u.hash = ''
  if (u.href !== location.href) history.replaceState(history.state, '', u)
}

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms))
const fotogrammi = (n: number) => new Promise<void>((r) => {
  const giro = () => (--n <= 0 ? r() : requestAnimationFrame(giro))
  requestAnimationFrame(giro)
})

// ── istantanee ───────────────────────────────────────────────────────────
let preparando = -1
/**
 * Fotografa la tavola montata nel DOM all'inizio della fase i: è l'immagine che il pannello mostra
 * mentre arriva a tutto schermo, identica alla fase vera sotto il canvas.
 */
export async function preparaIstantanea(i: number) {
  if (preparando === i) return
  preparando = i
  try {
    await fotogrammi(2)
    await attesa(200)
    if (spazio.get().aperta !== i) return
    const posto = document.querySelector<HTMLElement>('.vite-posto')
    if (!posto) return
    const { vw, H } = misure
    const q = inquadratura(anno.get(), vw, H)
    const ist = await fotografa(posto, q, vw, H, { scala: Math.min(window.devicePixelRatio || 1, 1.5), sfoca: false, fissi: true })
    if (ist && spazio.get().aperta === i) motore.impostaIstantanea(i, ist.tela, regia(vw).ax)
  } finally {
    if (preparando === i) preparando = -1
  }
}

/** Lo stato della fase all'uscita: la tavola (con la sua inquadratura) e, se c'è, la clip. */
async function fotografaUscita(): Promise<HTMLCanvasElement | null> {
  const posto = document.querySelector<HTMLElement>('.vite-posto')
  if (!posto) return null
  const { vw, H } = misure
  const p = anno.get()
  const q = inquadratura(p, vw, H)
  // l'uscita si vede rimpicciolire subito: basta la misura dello schermo in px CSS
  const s = 1
  const c = document.createElement('canvas')
  c.width = Math.round(vw * s)
  c.height = Math.round(H * s)
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.scale(s, s)
  const strati = posto.querySelector<HTMLElement>('.vite-strati')
  const opTavola = strati?.style.opacity ? Number(strati.style.opacity) : 1
  if (opTavola > 0.02) {
    const ist = await fotografa(posto, q, vw, H, { scala: s, sfoca: false, fissi: true })
    if (ist) {
      ctx.globalAlpha = opTavola
      ctx.drawImage(ist.tela, 0, 0, vw, H)
      ctx.globalAlpha = 1
    }
  }
  const film = statoFilm(p, vw, H)
  const img = motore.film.tex?.image as ImageBitmap | undefined
  if (film && img && film.alfa > 0.02) {
    const { ox, oy, dw, dh } = film.quadro
    const { cx, cy, r } = film.maschera
    const off = document.createElement('canvas')
    off.width = c.width
    off.height = c.height
    const o = off.getContext('2d')!
    o.scale(s, s)
    o.drawImage(img, ox, oy, dw, dh)
    o.globalCompositeOperation = 'lighten'
    o.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--nero').trim() || '#120d0a'
    o.fillRect(ox, oy, dw, dh)
    o.globalCompositeOperation = 'destination-in'
    const g = o.createRadialGradient(cx, cy, 0, cx, cy, r * 1.45)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1 / 1.45, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    o.fillStyle = g
    o.fillRect(0, 0, vw, H)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = film.alfa
    ctx.drawImage(off, 0, 0)
  }
  return c
}

// ── comandi ─────────────────────────────────────────────────────────────
function vola(a: number, fatto: () => void) {
  tween?.kill()
  if (preferenze.get().ridotto) {
    // movimento ridotto: niente volo, una dissolvenza semplice del canvas sopra la fase
    const tela = document.querySelector<HTMLElement>('.spazio-tela')
    if (!tela) {
      spazio.u = a
      return fatto()
    }
    if (a === 1) {
      svela(true)
      tween = gsap.fromTo(tela, { opacity: 1 }, {
        opacity: 0, duration: D.scena, ease: 'none',
        onComplete: () => {
          spazio.u = 1
          fatto()
          gsap.set(tela, { opacity: 1 })
        },
      })
    } else {
      spazio.u = 0
      motore.sporca()
      tween = gsap.fromTo(tela, { opacity: 0 }, { opacity: 1, duration: D.scena, ease: 'none', onComplete: fatto })
    }
    return
  }
  const da = spazio.u
  tween = gsap.to(spazio, {
    u: a,
    duration: durata(da, a),
    // un volo interrotto riparte dal punto in cui è con una curva morbida in uscita
    ease: Math.abs(a - da) > 0.9 ? E.volo : E.out,
    onUpdate: () => {
      motore.sporca()
      if (spazio.u > 0.5 && spazio.get().livello === 'fase') svela(true)
    },
    onComplete: fatto,
  })
}

/** Entra nella fase i: la camera vola dentro il suo pannello. */
export function entra(i: number) {
  const j = Math.max(0, Math.min(FASI.length - 1, i))
  const st = spazio.get()
  if (st.modo === 'fase') return
  if (st.livello === 'fase' && st.aperta === j && st.volo) return
  const g = ++gettone
  if (st.aperta !== j) {
    montaFase(j)
    motore.dimenticaUscita(st.aperta)
  }
  spazio.set({ livello: 'fase', aperta: j, centrale: j, volo: true })
  spazio.spinta = 0
  arco.centra(j, durata(spazio.u, 1))
  if (!motore.haIstantanea(j)) preparaIstantanea(j)
  scriviIndirizzo(j)
  vola(1, () => {
    if (g !== gettone) return
    // passaggio di consegne: la fase vera è già dipinta sotto il canvas; il pannello si dissolve
    // su di lei (se l'istantanea coincide non si vede nulla, altrimenti è una dissolvenza morbida)
    svela(true)
    spazio.set({ dentro: true })
    attivaScroll(true)
    arco.blocca()
    motore.dissolviPannello(() => {
      if (g !== gettone) return
      spazio.set({ modo: 'fase', volo: false })
    })
  })
}

/**
 * Esce dalla fase verso l'Anno. `avanza` sposta l'arco di altrettanti pannelli mentre il pannello
 * torna al suo posto (fine della fase → la successiva al centro). `poi` si chiama all'arrivo.
 */
export function esci(avanza = 0, poi?: () => void) {
  const st = spazio.get()
  if (st.livello === 'anno' && !st.volo) return
  const g = ++gettone
  const i = st.aperta
  const meta = Math.max(0, Math.min(FASI.length - 1, i + avanza))
  const atterra = () => {
    if (g !== gettone) return
    spazio.set({ volo: false, centrale: meta })
    svela(false)
    motore.dimenticaUscita(i)
    arco.blocca()
    montaFase(meta, true)
    if (!motore.haIstantanea(meta)) preparaIstantanea(meta)
    poi?.()
  }
  scriviIndirizzo(null)
  spazio.spinta = 0
  if (st.modo === 'scena') {
    // si era ancora in volo verso la fase: si torna indietro dal punto in cui si è
    spazio.set({ livello: 'anno', centrale: meta })
    arco.centra(meta, durata(spazio.u, 0))
    vola(0, atterra)
    return
  }
  spazio.set({ livello: 'anno', dentro: false, volo: true })
  attivaScroll(false)
  // l'interfaccia della fase esce subito (--d-ui); intanto si fotografa lo stato corrente
  const scatta = Promise.race([fotografaUscita(), attesa(320).then(() => null)])
  scatta.then((c) => {
    if (g !== gettone) return
    motore.impostaUscita(i, c)
    spazio.set({ modo: 'scena', centrale: meta })
    arco.centra(meta, durata(1, 0))
    vola(0, atterra)
  })
}

/** Da dentro una fase a un'altra: si torna nell'arco, l'arco scorre, si entra nella nuova. */
export function salta(j: number) {
  const st = spazio.get()
  const k = Math.max(0, Math.min(FASI.length - 1, j))
  if (st.livello === 'anno' && !st.volo) {
    if (k === st.centrale) entra(k)
    else arco.centra(k, D.scena)
    return
  }
  if (k === st.aperta) return
  esci(k - st.aperta, () => entra(k))
}

/** Apertura diretta (indirizzo con ?fase=N): si parte già dentro la fase, senza volo. */
export function apriSubito(i: number) {
  const j = Math.max(0, Math.min(FASI.length - 1, i))
  montaFase(j)
  arco.centra(j, 0)
  spazio.u = 1
  svela(true)
  spazio.set({ livello: 'fase', aperta: j, centrale: j, modo: 'fase', dentro: true, volo: false })
  attivaScroll(true)
  motore.sporca()
}

if (import.meta.env.DEV) (window as unknown as { __gsap: typeof gsap; __spazio: typeof spazio }).__gsap = gsap
if (import.meta.env.DEV) (window as unknown as { __spazio: typeof spazio }).__spazio = spazio
