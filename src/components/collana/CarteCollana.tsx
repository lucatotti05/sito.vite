import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { D, E, PASSO } from '@/core/movimento'
import { anno, useAnno, useAnnoFotogramma } from '@/core/anno'
import { misure } from '@/core/misure'
import { easeInOut, lerp, tra } from '@/core/math'
import { preferenze } from '@/core/preferenze'
import { primoPiano, usePrimoPiano } from '@/core/primoPiano'
import { FASI, indiceFase, tFase } from '@/core/tempo'
import { puntoFuga } from '../scena/Scena'
import { banco, carteDellaFase, disponibile, tipoDi, useBanco, type Voce } from './collana'
import { Oggetto } from './Oggetto'

/*
 * I contenuti della collana emergono dalla scena. Ogni carta parte dal punto di fuga della fase
 * (una luce sulle colline), lontana e piccola, e viaggia verso chi guarda lungo una retta nello
 * spazio (proiezione 1/z). Le carte della stessa fase arrivano a profondità diverse: la prima
 * davanti, le altre più indietro, più piccole e più tardi. Tutto è funzione del progresso della
 * fase: scrollando indietro le carte tornano nella scena.
 * Su telefono le carte atterrano già piccole sul bordo destro, per lasciare spazio al nodo.
 */

const Z0 = 9

/** Soglia (progresso della fase) oltre la quale la carta è in scena; dopo 0,9 lascia il posto. */
const soglia = (d: number) => 0.05 + d * 0.07

function Carta({ voce, numeroFase, profondita }: { voce: Voce; numeroFase: number; profondita: number }) {
  const el = useRef<HTMLElement | null>(null)
  const aperta = useBanco()
  const iFase = numeroFase - 1
  const d = profondita
  // lo scroll decide se la carta è in scena; il viaggio dalla profondità e l'uscita sono a tempo
  // (450 ms e 260 ms, interrompibili): k 0 → 1 arriva, esce 0 → 1 lascia il posto
  const st = useRef({ k: 0, esce: 0, vuoleK: 0, vuoleEsce: 0 })

  const disegna = (p: number) => {
    const n = el.current
    if (!n) return
    const { vw, H } = misure
    const stretto = vw < 760
    const slot = stretto ? misure.dock : misure.slot
    if (!slot.w) return
    const ridotto = preferenze.get().ridotto
    const { k, esce } = st.current

    // posto d'arrivo: la prima carta nello slot, le altre dietro e di lato (sul telefono, sotto)
    const sw = slot.w, sh = slot.w / 0.82
    const scalaFin = 1 / (1 + 0.32 * d)
    const cx = slot.x + sw / 2 + (stretto ? 0 : -d * sw * 0.5)
    const cy = slot.y + sh / 2 + (stretto ? d * sh * 0.62 : d * sh * 0.08)

    // una carta nascosta non si tocca: nessuna scrittura, nessun ricalcolo degli stili
    const visibile = k > 0.001 && esce < 0.999
    if (!visibile) {
      if (n.style.visibility !== 'hidden') {
        n.style.visibility = 'hidden'
        n.tabIndex = -1
      }
      return
    }
    // posto e misura cambiano solo con le misure del palco: si scrivono solo se sono cambiati
    const posa = `${sw}|${cx}|${cy}`
    if (n.dataset.posa !== posa) {
      n.dataset.posa = posa
      n.style.width = `${sw}px`
      n.style.left = `${cx - sw / 2}px`
      n.style.top = `${cy - sh / 2}px`
      n.style.zIndex = String(5 - d) // sotto il nodo (7): la scheda su telefono resta sopra
    }
    n.style.visibility = 'visible'
    n.tabIndex = st.current.vuoleK && !st.current.vuoleEsce ? 0 : -1
    const smorza = 1 - 0.16 * d

    if (ridotto) {
      n.style.transform = `scale(${scalaFin.toFixed(3)})`
      n.style.opacity = (k * (1 - esce) * smorza).toFixed(3)
      return
    }
    const C = { x: vw / 2, y: H / 2 }
    const vp = puntoFuga(iFase, p, vw, H)
    const z0 = Z0 + d * 3
    const z = lerp(z0, 1 / scalaFin, k)
    const P0 = { x: (vp.x - C.x) * z0, y: (vp.y - C.y) * z0 }
    const P1 = { x: (cx - C.x) / scalaFin, y: (cy - C.y) / scalaFin }
    const px = C.x + lerp(P0.x, P1.x, k) / z
    const py = C.y + lerp(P0.y, P1.y, k) / z
    const tx = px - cx - esce * vw * 0.06
    const ty = py - cy
    const ry = lerp(-26, 0, k)
    n.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${(1 / z).toFixed(4)}) perspective(900px) rotateY(${ry.toFixed(2)}deg)`
    n.style.opacity = (tra(k, 0, 0.25) * (1 - esce) * smorza).toFixed(3)
    n.style.setProperty('--contatto', easeInOut(k).toFixed(3))
  }

  useAnnoFotogramma((p) => {
    const t = tFase(p, iFase)
    const i = indiceFase(p)
    // la carta emerge solo con la collana in primo piano (un solo elemento interattivo aperto)
    const collana = primoPiano.get() === 'collana'
    const dentro = collana && i === iFase && t >= soglia(d) ? 1 : i > iFase ? 1 : 0
    const oltre = i > iFase || (i === iFase && t > 0.9) ? 1 : 0
    const s = st.current
    const ridotto = preferenze.get().ridotto
    const ridisegna = () => disegna(anno.get())
    if (dentro !== s.vuoleK) {
      s.vuoleK = dentro
      gsap.to(s, {
        k: dentro, duration: ridotto ? D.ui : dentro ? D.entrata : D.ui, delay: dentro ? d * PASSO : 0,
        ease: dentro ? E.out : E.in, overwrite: 'auto', onUpdate: ridisegna,
      })
    }
    if (oltre !== s.vuoleEsce) {
      s.vuoleEsce = oltre
      gsap.to(s, { esce: oltre, duration: oltre ? D.ui : D.entrata, ease: oltre ? E.in : E.out, overwrite: 'auto', onUpdate: ridisegna })
    }
    disegna(p)
  }, [d, iFase])
  useEffect(() => () => gsap.killTweensOf(st.current), [])
  // aprire o richiudere la collana muove le carte anche a scroll fermo
  useEffect(
    () =>
      primoPiano.subscribe(() => {
        const s = st.current
        const v = primoPiano.get() === 'collana' && indiceFase(anno.get()) === iFase && tFase(anno.get(), iFase) >= soglia(d) ? 1 : 0
        if (v === s.vuoleK) return
        s.vuoleK = v
        gsap.to(s, { k: v, duration: v ? D.entrata : D.ui, delay: v ? d * PASSO : 0, ease: v ? E.out : E.in, overwrite: 'auto', onUpdate: () => disegna(anno.get()) })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, iFase],
  )

  return (
    <button
      ref={(e) => { el.current = e }}
      type="button"
      className={`carta${aperta?.voce.id === voce.id ? ' sul-banco' : ''}`}
      aria-haspopup="dialog"
      aria-label={`${voce.titolo}, ${tipoDi(voce).toLowerCase()} della collana. Apri sul banco di lavoro`}
      onClick={(ev) => banco.apri(voce, ev.currentTarget.querySelector('.ogg') as HTMLElement)}
    >
      <Oggetto voce={voce} compatto />
      <span className="carta-invito" aria-hidden="true">
        Apri <kbd>Invio</kbd>
      </span>
    </button>
  )
}

/**
 * Ciò che nella collana è ancora "in arrivo" non finge di essere una carta: è un registro
 * tipografico sotto la carta disponibile (o al suo posto), che compare e scompare con la fase.
 */
function Registro({ fase }: { fase: number }) {
  const voci = carteDellaFase(fase + 1).filter((v) => !disponibile(v))
  const conCarta = carteDellaFase(fase + 1).some(disponibile)
  // solo con la collana in primo piano, finché la fase è in corso: a tempo, in CSS (.registro.su)
  const collana = usePrimoPiano() === 'collana'
  const su = useAnno((p) => indiceFase(p) === fase && tFase(p, fase) <= 0.92) && collana
  if (!voci.length) return null
  return (
    <div className={`registro${conCarta ? '' : ' solo'}${su ? ' su' : ''}`}>
      <p className="registro-testa t-etichetta">Nella collana, in arrivo</p>
      <ul>
        {voci.map((v) => (
          <li key={v.id}>
            <span className="registro-titolo t-annotazione">{v.titolo}</span>
            <span className="registro-tipo t-etichetta">{tipoDi(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CarteCollana() {
  const fase = useAnno(indiceFase)
  const vicine = [fase - 1, fase, fase + 1].filter((i) => i >= 0 && i < FASI.length)
  return (
    <>
      <div className="slot-carta" aria-hidden="true" />
      <div className="slot-carta-dock" aria-hidden="true" />
      {vicine.flatMap((i) =>
        carteDellaFase(i + 1)
          .filter(disponibile)
          .map((v, d) => <Carta key={`${i}-${v.id}`} voce={v} numeroFase={i + 1} profondita={d} />),
      )}
      <Registro key={fase} fase={fase} />
    </>
  )
}
