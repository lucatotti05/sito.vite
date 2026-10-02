import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

/*
 * I token di movimento di DESIGN.md per il codice (GSAP): stesse durate e stesse curve del CSS
 * (token.css, --d-* e --ease-*). Nessuna durata o curva scritta a mano altrove.
 */
gsap.registerPlugin(CustomEase)

/** Durate in secondi. */
export const D = { micro: 0.16, ui: 0.28, entrata: 0.45, scena: 0.7, volo: 1.15 } as const
/** Ritardo tra le righe (e tra gli elementi di una sequenza). */
export const PASSO = 0.06

export const E = {
  /** il volo tra Anno e Fase: parte piano, attraversa lo spazio, si posa lentissimo */
  volo: CustomEase.create('ds-volo', 'M0,0 C0.5,0 0.18,1 1,1'),
  /** entrate: arrivo morbido */
  out: CustomEase.create('ds-out', '0.16,1,0.3,1'),
  /** movimenti da A a B */
  inOut: CustomEase.create('ds-in-out', '0.65,0,0.35,1'),
  /** uscite */
  in: CustomEase.create('ds-in', '0.7,0,0.84,0'),
}
