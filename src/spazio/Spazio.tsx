import { useEffect, useRef } from 'react'
import { FASI, indiceFase, mesiDi } from '@/core/tempo'
import { montaFase } from '@/components/Scorrimento'
import { avviaInput, arco } from './input'
import { avviaLanterna } from './lanterna'
import { motore } from './motore'
import { spazio, useSpazio } from './stato'
import { apriSubito, entra, preparaIstantanea } from './volo'

/** La fase del giorno di oggi: l'arco si apre lì. */
export function faseDiOggi() {
  const d = new Date()
  const inizio = new Date(d.getFullYear(), 0, 1)
  return indiceFase((d.getTime() - inizio.getTime()) / 86400000 / 365)
}

/**
 * Il canvas unico dello spazio, dentro il palco tra la tavola (sotto) e l'interfaccia della
 * fase (sopra). Per tastiera e lettori di schermo i pannelli sono anche dieci pulsanti veri:
 * il fuoco porta il pannello al centro, Invio entra.
 */
export function Spazio() {
  const tela = useRef<HTMLCanvasElement>(null)
  const livello = useSpazio((d) => d.livello)
  const volo = useSpazio((d) => d.volo)
  const dentro = useSpazio((d) => d.dentro)
  const aperta = useSpazio((d) => d.aperta)
  const centrale = useSpazio((d) => d.centrale)
  const nav = useRef<HTMLElement>(null)

  useEffect(() => {
    const c = tela.current
    if (!c) return
    const qs = new URLSearchParams(location.search)
    const n = Number(qs.get('fase') ?? location.hash.match(/^#fase-(\d+)$/)?.[1])
    const iniziale = n >= 1 && n <= FASI.length ? n - 1 : faseDiOggi()
    spazio.arco = iniziale
    spazio.set({ centrale: iniziale })
    montaFase(iniziale, true)
    motore.avvia(c)
    const stacca = avviaInput(c)
    const staccaLanterna = avviaLanterna()
    if (n >= 1 && n <= FASI.length) apriSubito(iniziale)
    else preparaIstantanea(iniziale)

    // quando l'arco si posa su un pannello, la sua fase si monta nel DOM (all'inizio) e la sua
    // tavola si fotografa: è pronta per il volo
    let attesa = 0
    let ultimo = iniziale
    const togli = spazio.subscribe(() => {
      const st = spazio.get()
      if (st.livello !== 'anno' || st.volo || st.centrale === ultimo) return
      ultimo = st.centrale
      clearTimeout(attesa)
      attesa = window.setTimeout(() => {
        const s = spazio.get()
        if (s.livello !== 'anno' || s.volo) return
        montaFase(s.centrale, true)
        preparaIstantanea(s.centrale)
      }, 260)
    })
    return () => {
      togli()
      stacca()
      staccaLanterna()
      clearTimeout(attesa)
    }
  }, [])

  // un solo pulsante nel giro del Tab, quello del pannello al centro (all'apertura la fase di oggi):
  // le frecce spostano l'arco e il fuoco lo segue
  useEffect(() => {
    const n = nav.current
    if (!n || !n.contains(document.activeElement)) return
    n.querySelectorAll('button')[centrale]?.focus()
  }, [centrale])

  const inAnno = livello === 'anno' && !volo
  return (
    <>
      <canvas ref={tela} className="spazio-tela" aria-hidden="true" />
      <p className="sr-only" aria-live="polite">
        {dentro ? `Dentro la fase ${FASI[aperta].titolo}. Esc per tornare all’anno.` : livello === 'anno' && !volo ? 'Vista dell’anno: frecce sinistra e destra per scorrere le fasi, Invio per entrare.' : ''}
      </p>
      <nav ref={nav} className="spazio-fasi" aria-label="Le dieci fasi dell'anno" aria-hidden={!inAnno}>
        <ol>
          {FASI.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                tabIndex={inAnno && i === centrale ? 0 : -1}
                onFocus={() => {
                  arco.centra(i)
                  motore.impostaFocus(i)
                }}
                onBlur={() => motore.impostaFocus(-1)}
                onClick={() => entra(i)}
              >
                Entra nella fase: {f.titolo}, {mesiDi(f)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}
