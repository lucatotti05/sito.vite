import { useAnnoFotogramma } from '@/core/anno'
import { campana, lerp, mixHex, tra } from '@/core/math'
import { C } from '@/core/colori'
import { misure } from '@/core/misure'
import { statoFilm } from './film/raccordo'
import { altezzaLuceA, forzaLuceA, scenaA } from '@/core/tavolozze'

/**
 * Scrive sulla scena i colori e la luce che dipendono dall'anno.
 * L'interfaccia resta quella di Cantina; cambiano scena, luce radente e tinta delle ombre.
 * Aggiorna al massimo 300 volte nell'intero anno: i passaggi di colore restano invisibili.
 */
let ultimo = -1
/** Quanti passi (300 l'anno, più quelli del raccordo film) */
export function Atmosfera() {
  useAnnoFotogramma((p) => {
    // 300 passi nell'anno: ogni scrittura sulla radice ricalcola gli stili di tutta la pagina
    // prima di un momento film la luce si scalda e si abbassa verso quella della clip (fino a 40 passi in più)
    const film = statoFilm(p, misure.vw, misure.H)
    const w = film?.luce ?? 0
    const q = Math.round(p * 300) * 64 + Math.round(w * 40)
    // le variabili si scrivono sulla scena, che è l'unica a usarle: scriverle sulla radice farebbe
    // ricalcolare gli stili di tutta la pagina (vite compresa) a ogni passo
    const scena = document.querySelector<HTMLElement>('.scena')
    if (!scena || q === ultimo) return
    ultimo = q
    const s = scena.style
    const sc = { ...scenaA(p) }
    if (film && w > 0) {
      sc.luce = mixHex(sc.luce, film.m.luce, w)
      sc.ombra = mixHex(sc.ombra, C.nero, w)
    }
    s.setProperty('--sc-cielo-a', sc.cieloA)
    s.setProperty('--sc-cielo-b', sc.cieloB)
    s.setProperty('--sc-lontano', sc.lontano)
    s.setProperty('--sc-medio', sc.medio)
    s.setProperty('--sc-filare', sc.filare)
    s.setProperty('--sc-terra', sc.terra)
    s.setProperty('--sc-chioma', sc.chioma)
    s.setProperty('--luce', sc.luce)
    s.setProperty('--ombra', sc.ombra)
    s.setProperty('--luce-forza', lerp(forzaLuceA(p), Math.max(forzaLuceA(p), 0.85), w).toFixed(3))
    // altezza del sole: sposta la luce della scena
    const alt = lerp(altezzaLuceA(p), 0.06, w)
    s.setProperty('--luce-alt', alt.toFixed(3))
    // pesi delle stagioni per nebbia, brina, calura e polvere (piani di profondità)
    s.setProperty('--peso-inverno', Math.max(1 - tra(p, 0.1, 0.22), tra(p, 0.88, 1)).toFixed(3))
    s.setProperty('--peso-estate', campana(p, 0.48, 0.74).toFixed(3))
    s.setProperty('--peso-vendemmia', campana(p, 0.66, 0.84).toFixed(3))
  })
  return null
}
