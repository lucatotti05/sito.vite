import { useEffect, useRef, useState } from 'react'
import { anno, useAnno } from '@/core/anno'
import { misure } from '@/core/misure'
import { camera, inquadratura } from '@/components/vite/camera'
import { fotografa, trasformaIstantanea, type Istantanea } from '@/components/film/fuoco'
import { statoFilm } from '@/components/film/raccordo'
import { FASI, TRATTI_FILM, indiceFase, mesiDi, pDelFilm, sigmaDaP } from '@/core/tempo'
import { Apertura } from '@/components/Apertura'
import { Atmosfera } from '@/components/Atmosfera'
import { Calendario } from '@/components/calendario/Calendario'
import { Contafotogrammi } from '@/components/Contafotogrammi'
import { Finale } from '@/components/Finale'
import { Indicatori } from '@/components/Indicatori'
import { Banco } from '@/components/collana/Banco'
import { CarteCollana } from '@/components/collana/CarteCollana'
import { NodoFase } from '@/components/nodo/NodoFase'
import { MomentiFilm } from '@/components/film/MomentoFilm'
import { Particelle } from '@/components/scena/Particelle'
import { Scena } from '@/components/scena/Scena'
import { Scorrimento } from '@/components/Scorrimento'
import { StrisciaFasi } from '@/components/StrisciaFasi'
import { Titoli } from '@/components/Titoli'
import { Vite } from '@/components/vite/Vite'

const giornoDa01 = (p: number) => Math.round(p * 3650) / 10
const INTERVALLO_CRESCITA = 100
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

function ViteNelPalco() {
  // giorno interno, frazionario al decimo: serve solo al disegno. Lo stato di React cambia al più
  // 10 volte al secondo (la crescita è lenta: un ritardo di 100 ms non si vede), mentre la camera
  // si muove a ogni fotogramma scrivendo direttamente il viewBox
  const g = useGiornoTemperato()
  const posto = useRef<HTMLDivElement>(null)
  const sfocata = useRef<HTMLCanvasElement>(null)
  const buio = useRef<HTMLDivElement>(null)

  /**
   * Le due istantanee sfocate del raccordo film: quella d'ingresso si prepara poco prima del
   * momento film (con l'inquadratura del suo inizio), quella d'uscita mentre la clip copre tutto
   * (con l'inquadratura della sua fine). Si rifanno a ogni ridimensionamento.
   */
  const fuoco = useRef<{ ingresso: Istantanea | null; uscita: Istantanea | null; inCorso: boolean; misura: string }>({
    ingresso: null, uscita: null, inCorso: false, misura: '',
  }).current
  const prepara = (p: number, vw: number, H: number) => {
    const misura = `${vw}x${H}`
    if (fuoco.misura !== misura) {
      fuoco.ingresso = fuoco.uscita = null
      fuoco.misura = misura
    }
    if (fuoco.inCorso || !posto.current) return
    const s = sigmaDaP(p)
    for (const [i, t] of TRATTI_FILM) {
      // d'abitudine l'istantanea d'ingresso si prepara poco prima del film e quella d'uscita a clip piena;
      // se si arriva di salto più avanti, si prepara lì (pronta in poche decine di millisecondi)
      const lun = t.s1 - t.s0
      const quale = !fuoco.ingresso && s > t.s0 - 0.6 && s < t.s0 + 0.5 * lun ? 'ingresso' : !fuoco.uscita && s > t.s0 + 0.4 * lun && s < t.s1 + 0.2 ? 'uscita' : null
      if (!quale) continue
      const qq = inquadratura(pDelFilm(i, quale === 'ingresso' ? 0 : 1), vw, H)
      fuoco.inCorso = true
      // l'istantanea si prepara quando il browser è libero (mai dentro un fotogramma di scroll)
      const prepara = () => {
        if (!posto.current) return void (fuoco.inCorso = false)
        fotografa(posto.current, qq, vw, H).then((ist) => {
          fuoco[quale] = ist
          fuoco.inCorso = false
        })
      }
      if ('requestIdleCallback' in window) requestIdleCallback(prepara, { timeout: 400 })
      else setTimeout(prepara, 60)
      return
    }
  }

  // la macchina da presa: a ogni fotogramma (scroll o pratica scelta) sposta il viewBox degli strati
  useEffect(() => {
    const base = { x: 0, y: 0, h: 0, W: 0, H: 0 }
    let fermo = 0
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
      // durante il raccordo film la tavola nitida può essere del tutto dissolta (resta l'istantanea
      // sfocata): allora non si riallinea né si muove, nessun lavoro per qualcosa che non si vede
      const filmOra = statoFilm(p, vw, H)
      const invisibile = !!filmOra && (filmOra.f < 0.5 ? fuoco.ingresso : fuoco.uscita) && filmOra.sfoca * 1.8 >= 1
      const k = base.h ? base.h / q.h : 0
      if (invisibile) {
        /* niente: la tavola è coperta dall'istantanea */
      } else if (!base.h || base.W !== vw || base.H !== H || k < 0.92 || k > 1.08) riallinea(q, vw, H)
      else if (strati) {
        const tx = ((base.x - q.x) * H) / q.h, ty = ((base.y - q.y) * H) / q.h
        strati.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${k.toFixed(4)})`
      }
      clearTimeout(fermo)
      if (!invisibile) fermo = window.setTimeout(() => riallinea(inquadratura(anno.get(), misure.vw, misure.H), misure.vw, misure.H), 160)
      // più la camera stringe, più la scena dietro va fuori fuoco
      document.querySelector<HTMLElement>('.velo')?.style.setProperty('--fuoco', Math.min(1, (q.zoom - 1) / 2).toFixed(3))
      // momento film: la vite ruota sull'asse della gemma, va fuori fuoco e si scurisce (la nitidezza
      // passa alla clip). Niente filtri: l'istantanea sfocata (fuoco.ts) si dissolve con la tavola
      // nitida e un velo nero la scurisce; si muovono solo transform e opacity
      const film = statoFilm(p, vw, H)
      el.style.transformOrigin = q.ruota ? `${q.perno[0].toFixed(1)}px ${q.perno[1].toFixed(1)}px` : ''
      el.style.transform = q.ruota ? `rotate(${q.ruota.toFixed(2)}deg)` : ''
      prepara(p, vw, H)
      const sf = film?.sfoca ?? 0
      const ist = film ? (film.f < 0.5 ? fuoco.ingresso : fuoco.uscita) : null
      const tela = sfocata.current
      if (tela) {
        if (ist && sf > 0.002) {
          if (tela.dataset.chi !== (film!.f < 0.5 ? 'in' : 'out')) {
            tela.dataset.chi = film!.f < 0.5 ? 'in' : 'out'
            tela.width = ist.tela.width
            tela.height = ist.tela.height
            tela.getContext('2d')?.drawImage(ist.tela, 0, 0)
          }
          tela.style.transform = trasformaIstantanea(ist, q, H)
          tela.style.opacity = Math.min(1, sf * 1.6).toFixed(3)
        } else tela.style.opacity = '0'
      }
      // la nitidezza lascia la tavola prima che arrivi il soggetto: a metà raccordo resta solo il fuori fuoco
      if (strati) strati.style.opacity = sf > 0.002 && ist ? Math.max(0, 1 - sf * 1.8).toFixed(3) : ''
      if (buio.current) buio.current.style.opacity = ((film?.buio ?? 0) * (vw < 760 ? 0.72 : 0.5)).toFixed(3)
      el.classList.toggle('vicino', q.zoom > 5)
      // mentre la camera ruota (raccordo film) pali e fili si ritirano: nessuna diagonale sullo schermo
      el.classList.toggle('rollio', Math.abs(q.ruota) > 0.3)
    }
    aggiorna()
    const a = anno.subscribe(aggiorna)
    const c = camera.subscribe(aggiorna)
    window.addEventListener('resize', aggiorna)
    return () => {
      a()
      c()
      clearTimeout(fermo)
      window.removeEventListener('resize', aggiorna)
    }
  }, [])

  return (
    <div className="vite-posto" ref={posto}>
      <Vite giorno={g} />
      <canvas className="vite-fuoco" ref={sfocata} aria-hidden="true" />
      <div className="vite-buio" ref={buio} aria-hidden="true" />
    </div>
  )
}

function Annuncio() {
  const i = useAnno(indiceFase)
  const f = FASI[i]
  return (
    <p className="sr-only" aria-live="polite">
      Fase {f.numero}: {f.titolo}, {mesiDi(f)}.
    </p>
  )
}

export default function App() {
  return (
    <>
      <a className="salta" href="#fasi">
        Vai all’elenco delle fasi
      </a>
      <Atmosfera />
      <main>
        <Scorrimento>
          <Scena />
          <div className="velo" aria-hidden="true" />
          <Particelle />
          <ViteNelPalco />
          <MomentiFilm />
          <div className="velo-ui" aria-hidden="true" />
          <Titoli />
          <CarteCollana />
          <NodoFase />
          <Indicatori />
          <Calendario />
          <Finale />
          <div id="fasi">
            <StrisciaFasi />
          </div>
          <div className="grana" aria-hidden="true" />
          <Apertura />
        </Scorrimento>
      </main>
      <Banco />
      <Annuncio />
      <Contafotogrammi />
    </>
  )
}
