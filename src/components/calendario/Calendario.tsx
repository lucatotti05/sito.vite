import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { anno, useAnno } from '@/core/anno'
import { D, E } from '@/core/movimento'
import { usePreferenze } from '@/core/preferenze'
import { FASI, MESI, indiceFase, inizioMese, meseDa, type Fase } from '@/core/tempo'

/*
 * CALENDARIO: una pagina d'almanacco (DESIGN.md, "Componenti"). Carta scura con grana leggera,
 * appesa a un'asola; solo tipografia: numero romano del mese, nome del mese in stile `mese`,
 * un filetto, nome della fase e sigla BBCH in stile `etichetta`.
 *
 * Lo scroll decide il mese. Superata la soglia, la pagina gira in 3D attorno all'asola in
 * --d-entrata con --ease-in-out, con un'ombra che scorre sul foglio sotto. La girata è
 * interrompibile (riparte da dov'è) e reversibile (tornando indietro la pagina ricade).
 * Se lo scroll è veloce le pagine intermedie si saltano: una sola girata alla volta.
 * La pagina è divisa in strisce annidate che ruotano ognuna un poco rispetto alla precedente:
 * il foglio si curva come carta. Con movimento ridotto: dissolvenza tra le pagine.
 */

const STRISCE = 6
const ROMANI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const Pagina = memo(function Pagina({ mese, fase }: { mese: number; fase: Fase }) {
  return (
    <div className="cal-pagina">
      <span className="cal-romano t-etichetta">{ROMANI[mese]}</span>
      <span className="cal-mese t-mese">{MESI[mese]}</span>
      <span className="cal-filetto" />
      <span className="cal-fase t-etichetta">
        <span className="cal-fase-nome">{fase.titolo}</span>
        <span>BBCH {fase.bbch}</span>
      </span>
    </div>
  )
})

/** Una striscia della pagina che gira: faccia, retro e (annidata) la striscia successiva. */
function Striscia({ k, contenuto, rif }: { k: number; contenuto: React.ReactNode; rif: (k: number, el: HTMLDivElement | null) => void }) {
  return (
    <div className="cal-seg" ref={(e) => rif(k, e)} style={{ ['--k' as string]: k }}>
      <div className="cal-faccia">
        <div className="cal-scorcio">{contenuto}</div>
        <div className="cal-piega" />
      </div>
      <div className="cal-retro" />
      {k < STRISCE - 1 && <Striscia k={k + 1} contenuto={contenuto} rif={rif} />}
    </div>
  )
}

export function Calendario() {
  const { ridotto } = usePreferenze()
  const bersaglio = useAnno(meseDa)
  const faseOra = useAnno(indiceFase)
  const [mese, setMese] = useState(() => meseDa(anno.get()))
  const segs = useRef<(HTMLDivElement | null)[]>([])
  const girevole = useRef<HTMLDivElement>(null)
  const ombra = useRef<HTMLDivElement>(null)
  /** girata della pagina in cima: 0 = posata, 1 = girata del tutto */
  const giro = useRef({ u: 0 })
  const tw = useRef<gsap.core.Tween | null>(null)

  const disegna = (u: number) => {
    // le strisce in basso partono prima: la pagina si solleva dal fondo e si curva
    const D0 = 0.45
    let prec = 0
    let sotto = 0 // altezza proiettata della pagina che gira (per l'ombra sul foglio sotto)
    for (let k = 0; k < STRISCE; k++) {
      const ritardo = D0 * (1 - k / (STRISCE - 1))
      const x = Math.min(1, Math.max(0, (u - ritardo) / (1 - D0)))
      const A = 180 * x * x * (3 - 2 * x)
      const el = segs.current[k]
      if (el) {
        el.style.transform = `rotateX(${(A - prec).toFixed(2)}deg)`
        el.style.setProperty('--piega', (Math.max(0, Math.sin((A * Math.PI) / 180)) * (A < 90 ? 0.4 : 0.15)).toFixed(3))
      }
      sotto += Math.cos((A * Math.PI) / 180) / STRISCE
      prec = A
    }
    if (girevole.current) girevole.current.style.opacity = u > 0.94 ? '0' : '1'
    if (ombra.current) {
      ombra.current.style.transform = `translateY(${(Math.max(0, sotto) * 100).toFixed(1)}%)`
      ombra.current.style.opacity = (Math.sin(Math.PI * u) * 0.9).toFixed(3)
    }
  }

  // al cambio della pagina in cima le strisce mostrano già il nuovo mese: si rimettono subito in posa
  useLayoutEffect(() => {
    if (!ridotto) disegna(giro.current.u)
  })

  // la regia delle girate: una alla volta, dalla pagina in cima verso il mese dello scroll
  useEffect(() => {
    if (ridotto) {
      setMese(bersaglio)
      return
    }
    const g = giro.current
    const vai = (u: number, fatto?: () => void) => {
      tw.current?.kill()
      tw.current = gsap.to(g, { u, duration: D.entrata * Math.max(0.35, Math.abs(u - g.u)), ease: E.inOut, onUpdate: () => disegna(g.u), onComplete: fatto })
    }
    if (bersaglio === mese) {
      if (g.u > 0) vai(0)
      return
    }
    if (bersaglio > mese) {
      // troppo indietro: si saltano le pagine intermedie, poi una sola girata
      if (bersaglio > mese + 1) {
        tw.current?.kill()
        g.u = 0
        setMese(bersaglio - 1)
        return
      }
      vai(1, () => {
        g.u = 0
        setMese((m) => Math.min(11, m + 1))
      })
      return
    }
    // all'indietro: la pagina giusta parte già girata e ricade
    tw.current?.kill()
    g.u = 1
    setMese(bersaglio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bersaglio, mese, ridotto])
  useEffect(() => () => void tw.current?.kill(), [])

  const fase = FASI[faseOra]
  // la fase scritta su una pagina: quella in corso per il mese dello scroll, altrimenti quella con
  // cui il mese comincia
  const faseDi = (m: number) => (m === bersaglio ? fase : FASI[indiceFase(inizioMese(m))])
  const cima = <Pagina mese={mese} fase={faseDi(mese)} />
  const descr = `Calendario: ${MESI[bersaglio]}. Fase in corso: ${fase.titolo}, BBCH ${fase.bbch}.`

  return (
    <figure className="calendario" aria-label={descr} style={{ ['--strisce' as string]: STRISCE }}>
      <span className="cal-chiodo" aria-hidden="true" />
      <div className="cal-blocco" aria-hidden="true">
        {ridotto ? (
          <div className="cal-statica" key={bersaglio}>
            <Pagina mese={bersaglio} fase={fase} />
          </div>
        ) : (
          <>
            {mese < 11 && (
              <div className="cal-sotto">
                <Pagina mese={mese + 1} fase={faseDi(mese + 1)} />
                <div className="cal-ombra" ref={ombra} />
              </div>
            )}
            <div className="cal-girevole" ref={girevole}>
              <Striscia
                k={0}
                contenuto={cima}
                rif={(k, el) => {
                  segs.current[k] = el
                }}
              />
            </div>
          </>
        )}
        <span className="cal-asola" />
      </div>
      <figcaption className="sr-only">{descr}</figcaption>
    </figure>
  )
}
