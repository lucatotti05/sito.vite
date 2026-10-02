import { useEffect, useRef, useState } from 'react'
import { anno } from '@/core/anno'
import { misure } from '@/core/misure'
import { camera, inquadratura } from './camera'
import { statoFilm } from '../film/raccordo'
import { fotografa, rettIstantanea, type Istantanea } from '../film/fuoco'
import { spazio } from '@/spazio/stato'
import { Vite } from './Vite'
import { motore } from '@/spazio/motore'

const giornoDa01 = (p: number) => Math.round(p * 36500) / 100
/** ms tra due aggiornamenti della tavola: le transizioni di vite.css (90ms) riempiono gli intervalli */
const INTERVALLO_CRESCITA = 80
function useGiornoTemperato() {
  const [g, setG] = useState(() => giornoDa01(anno.get()))
  useEffect(() => {
    let ultimo = 0
    let attesa = 0
    let mostrato = giornoDa01(anno.get())
    const applica = () => {
      attesa = 0
      ultimo = performance.now()
      mostrato = giornoDa01(anno.get())
      setG(mostrato)
    }
    const stacca = anno.subscribe(() => {
      if (giornoDa01(anno.get()) === mostrato || attesa) return
      const passato = performance.now() - ultimo
      if (passato >= INTERVALLO_CRESCITA) applica()
      else attesa = window.setTimeout(applica, INTERVALLO_CRESCITA - passato)
    })
    return () => {
      stacca()
      clearTimeout(attesa)
    }
  }, [])
  return g
}

export function ViteNelPalco() {
  // giorno interno, frazionario al centesimo: serve solo al disegno. Lo stato di React cambia al più
  // ogni 80 ms; ciò che cade o si muove interpola tra un passo e l'altro (vite.css, .v-in-volo),
  // mentre la camera si muove a ogni fotogramma scrivendo direttamente il viewBox
  const g = useGiornoTemperato()
  const posto = useRef<HTMLDivElement>(null)

  // la macchina da presa: a ogni fotogramma (scroll o pratica scelta) sposta il viewBox degli strati
  useEffect(() => {
    const base = { x: 0, y: 0, h: 0, W: 0, H: 0 }
    let fermo = 0
    // il pennello del cursore (spazio/motore.ts): quando la camera si ferma la tavola si fotografa
    // a metà risoluzione; l'istantanea segue poi la camera (spostamento e scala) e si spegne se la
    // vite è cresciuta da allora o se la camera ruota (raccordo film), finché non se ne fa un'altra
    let ist: Istantanea | null = null
    let giornoIst = -1
    let scatto = 0
    let inCorso = false
    const posaDipinto = () => {
      if (!ist) return
      const { vw, H } = misure
      const p = anno.get()
      const q = inquadratura(p, vw, H)
      const fedele = !q.ruota && Math.abs(p * 365 - giornoIst) < 0.6 && ist.W === vw && ist.H === H ? 1 : 0
      motore.posaDipinto(rettIstantanea(ist, q, H), fedele)
    }
    const scatta = () => {
      const el = posto.current
      if (!el || inCorso || !motore.pennelloAcceso() || spazio.get().modo !== 'fase') return
      const { vw, H } = misure
      const p = anno.get()
      const q = inquadratura(p, vw, H)
      if (q.ruota || statoFilm(p, vw, H)?.coperta) return
      if (ist && Math.abs(p * 365 - giornoIst) < 0.05 && ist.vb.x === q.x && ist.vb.y === q.y && ist.vb.h === q.h) return
      inCorso = true
      fotografa(el, q, vw, H, { scala: 0.75, sfoca: false, fissi: true }).then((r) => {
        inCorso = false
        if (!r) return
        ist = r
        giornoIst = p * 365
        motore.impostaDipinto(r.tela)
        posaDipinto()
      })
    }
    const programmaScatto = () => {
      clearTimeout(scatto)
      scatto = window.setTimeout(() => {
        if ('requestIdleCallback' in window) requestIdleCallback(scatta, { timeout: 400 })
        else scatta()
      }, 260)
    }
    /** il viewBox degli strati prende l'inquadratura q: le linee tornano nitide alla loro misura */
    const riallinea = (q: { x: number; y: number; w: number; h: number }, vw: number, H: number) => {
      const el = posto.current
      if (!el) return
      Object.assign(base, { x: q.x, y: q.y, h: q.h, W: vw, H })
      const vb = `${q.x.toFixed(1)} ${q.y.toFixed(1)} ${q.w.toFixed(1)} ${q.h.toFixed(1)}`
      el.querySelectorAll('svg.vite-svg').forEach((s) => s.setAttribute('viewBox', vb))
      const strati = el.querySelector<HTMLElement>('.vite-strati')
      if (strati) strati.style.transform = ''
      // ogni valore va scritto sull'elemento che lo usa, mai su un antenato: una variabile CSS
      // ereditata cambiata spesso farebbe ricalcolare gli stili di tutta la vite
      el.querySelector<SVGElement>('svg.vite-note')?.style.setProperty('--unita', (q.h / H).toFixed(4))
      const origine = `50% ${(((470 - q.y) / q.h) * 100).toFixed(2)}%`
      el.querySelectorAll<SVGElement>('svg.vite-chioma').forEach((s) => (s.style.transformOrigin = origine))
    }
    const aggiorna = () => {
      const el = posto.current
      if (!el) return
      const { vw, H } = misure
      const p = anno.get()
      const q = inquadratura(p, vw, H)
      const strati = el.querySelector<HTMLElement>('.vite-strati')
      // la camera: tra un riallineamento e l'altro la tavola si sposta e si scala con una sola
      // trasformazione del contenitore (la fa il compositore: niente layout né pittura dell'SVG);
      // il viewBox si riallinea quando lo zoom si scosta di oltre l'8% o quando la camera si ferma
      // con la clip a tutto schermo la tavola è coperta: non si riallinea né si muove
      const film = statoFilm(p, vw, H)
      const invisibile = !!film && film.coperta
      const k = base.h ? base.h / q.h : 0
      if (invisibile) {
        /* niente: la tavola è coperta dalla clip */
      } else if (!base.h || base.W !== vw || base.H !== H || k < 0.92 || k > 1.08) riallinea(q, vw, H)
      else if (strati) {
        const tx = ((base.x - q.x) * H) / q.h, ty = ((base.y - q.y) * H) / q.h
        strati.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${k.toFixed(4)})`
      }
      clearTimeout(fermo)
      if (!invisibile)
        fermo = window.setTimeout(() => {
          riallinea(inquadratura(anno.get(), misure.vw, misure.H), misure.vw, misure.H)
          programmaScatto()
        }, 160)
      posaDipinto()
      // momento film: la vite ruota sull'asse della gemma e la camera la porta a coincidere con la
      // gemma filmata; lì si apre il portale sulla clip (spazio/shader.ts). Fuori dal portale la tavola
      // resta nitida e si scurisce appena: nessuna immagine sfocata, nessun filtro
      el.style.transformOrigin = q.ruota ? `${q.perno[0].toFixed(1)}px ${q.perno[1].toFixed(1)}px` : ''
      el.style.transform = q.ruota ? `rotate(${q.ruota.toFixed(2)}deg)` : ''
      motore.fuoco.alfa = 0
      motore.fuoco.buio = (film?.buio ?? 0) * (vw < 760 ? 0.62 : 0.42)
      motore.sporca()
      el.classList.toggle('vicino', q.zoom > 5)
      // mentre la camera ruota (raccordo film) pali e fili si ritirano: nessuna diagonale sullo schermo
      el.classList.toggle('rollio', Math.abs(q.ruota) > 0.3)
    }
    aggiorna()
    const a = anno.subscribe(aggiorna)
    const c = camera.subscribe(aggiorna)
    // entrando nella fase (e quando la vite finisce di crescere) si prepara l'istantanea
    const sp = spazio.subscribe(() => spazio.get().modo === 'fase' && programmaScatto())
    window.addEventListener('resize', aggiorna)
    return () => {
      a()
      c()
      sp()
      clearTimeout(fermo)
      clearTimeout(scatto)
      window.removeEventListener('resize', aggiorna)
    }
  }, [])

  return (
    <div className="vite-posto" ref={posto}>
      <Vite giorno={g} />
    </div>
  )
}

