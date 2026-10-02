import * as THREE from 'three'
import { ciclo } from '@/core/ciclo'
import { C } from '@/core/colori'
import { clamp, lerp, smooth } from '@/core/math'
import { preferenze } from '@/core/preferenze'
import { FASI } from '@/core/tempo'
import { FILM } from '@/components/film/registro'
import { spazio } from './stato'
import { PANNELLO_F, PANNELLO_V, SUOLO_F, SUOLO_V, TERRA_F, TERRA_V, VELO_F, VELO_V } from './shader'
import { ASPETTO_CELLA, CELLE, FONT_NOME, PX_NOME, VUOTA, caricaTexture, libera, ritaglio, textureNome, urlCiclo, urlFermo } from './texture'

/*
 * IL MOTORE DELLO SPAZIO: un solo canvas WebGL, un solo ciclo (core/ciclo.ts, il ticker di GSAP).
 * Disegna solo quando qualcosa è cambiato (arco, volo, molle, lanterna, fotogramma, ciclo vivo
 * del pannello centrale); a riposo il ciclo si addormenta come il resto del sito.
 *
 * Scena (livello Anno e volo):  il vigneto (filari, fili e pali in linee di 1px che si perdono nel
 *   buio), la terra che prende la luce della lanterna, dieci pannelli curvi su un arco.
 * Velo (sempre, per ultimo):     grana e vignettatura; nel livello Fase anche l'istantanea sfocata,
 *   il buio del raccordo, la clip e la lanterna, sopra la tavola del DOM.
 */

// ── disposizione: misure dello spazio per tipo di schermo ──────────────────
export type Disposizione = {
  stretto: boolean
  fov: number
  /** raggio dell'arco e di quanto si avvicina il pannello centrale */
  R: number
  vicino: number
  /** posizione della camera rispetto al centro dell'arco (negativa = più vicina ai pannelli del
   *  centro: l'arco si avvolge e i pannelli laterali si voltano e si allontanano) */
  D: number
  /** pannello a riposo (3:4) */
  w: number
  h: number
  /** distanza tra i centri di due pannelli lungo l'arco */
  passo: number
  camY: number
  guardaY: number
  suoloY: number
  /** curvatura a riposo (1/raggio) */
  kRiposo: number
}
export function disposizione(vw: number): Disposizione {
  return vw < 760
    ? { stretto: true, fov: 40, R: 3.6, vicino: 0.12, D: -0.7, w: 0.75, h: 1, passo: 0.8, camY: 0.12, guardaY: -0.03, suoloY: -0.74, kRiposo: 0.55 }
    : { stretto: false, fov: 34, R: 5.2, vicino: 0.25, D: -1.9, w: 0.75, h: 1, passo: 0.95, camY: 0.24, guardaY: -0.02, suoloY: -0.72, kRiposo: 0.6 }
}

/** quanto i pannelli laterali si voltano verso il centro, oltre l'orientamento dell'arco */
const VOLTA = 1.6

// ── molle (DESIGN.md: rigidità 170, smorzamento 22, massa 1) ────────────────
type Molla = { x: number; v: number }
const molla = (): Molla => ({ x: 0, v: 0 })
function passoMolla(m: Molla, bersaglio: number, dt: number, k = 170, c = 22) {
  // sotto-passi: stabile anche con un fotogramma lungo
  const n = Math.max(1, Math.ceil(dt / 0.008))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const a = -k * (m.x - bersaglio) - c * m.v
    m.v += a * h
    m.x += m.v * h
  }
  return Math.abs(m.x - bersaglio) > 1e-4 || Math.abs(m.v) > 1e-4
}

// nessuna gestione del colore: token, texture e shader parlano già nei valori dello schermo
THREE.ColorManagement.enabled = false
const rgb = (hex: string) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16) / 255)
  return new THREE.Vector3(r, g, b)
}
const NERO = rgb(C.nero)
const TERRA = rgb(C.terra)
const AVORIO = rgb(C.avorio)
const ORO = rgb(C.oro)
const LUCE = rgb('#e8c58a') // la lanterna (--lanterna)

// ── un pannello ───────────────────────────────────────────────────────────
type Pannello = {
  i: number
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  u: Record<string, THREE.IUniform>
  fermo: THREE.Texture | null
  ciclo: THREE.Texture | null
  cicloInCorso: boolean
  /** la tavola vera all'inizio della fase, alla misura dello schermo */
  istantanea: THREE.Texture | null
  istAspetto: number
  /** lo stato della fase all'uscita */
  uscita: THREE.Texture | null
  usAspetto: number
  /** comparsa dell'immagine (0 → 1) quando arriva */
  pronto: number
  bPronto: number
  nomeAspetto: number
  nomeAltezzaPx: number
  /** dove sta il soggetto nell'istantanea (frazione della larghezza) */
  soggettoX: number
  film: boolean
  angoli: THREE.Vector3[]
}

type StatoFilm = { tex: THREE.Texture | null; quadro: [number, number, number, number]; maschera: [number, number, number]; alfa: number; mascheraOn: boolean }
type StatoFuoco = { tex: THREE.Texture | null; rett: [number, number, number, number]; alfa: number; buio: number; ruota: [number, number, number] }

class Motore {
  canvas!: HTMLCanvasElement
  renderer!: THREE.WebGLRenderer
  scena = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200)
  veloScena = new THREE.Scene()
  veloCam = new THREE.Camera()
  velo!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  suolo!: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>
  terra!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  pannelli: Pannello[] = []
  L = disposizione(window.innerWidth)
  vw = window.innerWidth
  H = window.innerHeight
  dpr = 1
  avviato = false
  sporco = true
  ultimo = 0
  tempo = 0
  // arco
  arcoPrec = 0
  vel = 0
  curva = molla()
  piega = molla()
  ritardo = molla()
  avanti = molla()
  // lanterna
  mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, forza: 0, bersaglio: 0, ok: false }
  focus = -1
  sopra = -1
  film: StatoFilm = { tex: null, quadro: [0, 0, 1, 1], maschera: [0, 0, 1e5], alfa: 0, mascheraOn: false }
  fuoco: StatoFuoco = { tex: null, rett: [0, 0, 1, 1], alfa: 0, buio: 0, ruota: [0, 0, 0] }
  stacca: (() => void) | null = null
  /** il pannello centrale (per i cicli vivi) */
  centrale = -1
  /** apertura del sito: la camera arriva e l'arco si compone (0 → 1) */
  apertura = 0
  inizioApertura = 0
  avvio = performance.now()

  avvia(canvas: HTMLCanvasElement) {
    if (this.avviato) return
    this.avviato = true
    this.canvas = canvas
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
    r.outputColorSpace = THREE.LinearSRGBColorSpace // gli shader scrivono già i valori dello schermo
    r.setClearColor(new THREE.Color(0, 0, 0), 0)
    r.autoClear = false
    this.renderer = r
    this.costruisci()
    this.misura()
    this.caricaFermi()
    window.addEventListener('resize', this.misura)
    const mqLanterna = window.matchMedia('(hover: hover) and (pointer: fine)')
    const aggiornaLanterna = () => {
      this.mouse.ok = mqLanterna.matches && !preferenze.get().ridotto
      this.sporca()
    }
    aggiornaLanterna()
    mqLanterna.addEventListener('change', aggiornaLanterna)
    const togliPref = preferenze.subscribe(aggiornaLanterna)
    window.addEventListener('pointermove', this.muovi, { passive: true })
    document.addEventListener('pointerleave', this.esce)
    window.addEventListener('blur', this.esce)
    const togliSpazio = spazio.subscribe(() => this.sporca())
    this.stacca = () => {
      togliPref()
      togliSpazio()
      mqLanterna.removeEventListener('change', aggiornaLanterna)
    }
    this.ultimo = performance.now()
    ciclo.aggiungi(this.fotogramma)
  }

  /** Carica la texture sulla GPU quando il browser è libero: mai dentro un fotogramma di movimento. */
  private carica(t: THREE.Texture, poi: () => void) {
    const fai = () => {
      this.renderer.initTexture(t)
      poi()
      this.sporca()
    }
    if ('requestIdleCallback' in window) requestIdleCallback(fai, { timeout: 300 })
    else setTimeout(fai, 30)
  }

  sporca = () => {
    this.sporco = true
    ciclo.sveglia()
  }

  private muovi = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.mouse.tx = e.clientX
    this.mouse.ty = e.clientY
    if (this.mouse.x < -1e3) {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    }
    this.mouse.bersaglio = 1
    this.sporca()
  }
  private esce = () => {
    this.mouse.bersaglio = 0
    this.sporca()
  }

  // ── costruzione della scena ──────────────────────────────────────────────
  private costruisci() {
    const L = this.L
    // il vigneto: filari (a terra), due fili e i pali, in linee di 1px
    const v: number[] = []
    const passoFila = 1.4
    const nFile = 45
    const largo = nFile * passoFila
    const lungo = 70
    const passoPali = 2.8
    const hPalo = 0.5
    for (let f = 0; f < nFile; f++) {
      const x = -largo / 2 + (f + 0.5) * passoFila
      // filare a terra, in tratti corti: un segmento lungo che passa dietro la camera si perde nel ritaglio
      for (let z = 3; z > -lungo; z -= 2) {
        v.push(x, 0, z, x, 0, z - 2)
      }
      for (let z = 3 - ((f * 0.37) % passoPali); z > -lungo * 0.65; z -= passoPali) v.push(x, 0, z, x, hPalo, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    const premolt = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true }
    this.suolo = new THREE.LineSegments(
      g,
      new THREE.ShaderMaterial({
        vertexShader: SUOLO_V,
        fragmentShader: SUOLO_F,
        uniforms: {
          uScorre: { value: 0 },
          uLargo: { value: largo },
          uColore: { value: AVORIO },
          uLuce: { value: LUCE },
          uAlfa: { value: 0.14 },
          ...this.uniformLanterna(),
        },
        depthWrite: false,
        ...premolt,
      }),
    )
    this.suolo.frustumCulled = false
    this.suolo.position.y = L.suoloY
    this.suolo.renderOrder = 0
    this.scena.add(this.suolo)

    this.terra = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShaderMaterial({
        vertexShader: TERRA_V,
        fragmentShader: TERRA_F,
        uniforms: { uLuce: { value: LUCE }, uAlfa: { value: 1 }, ...this.uniformLanterna() },
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      }),
    )
    this.terra.rotation.x = -Math.PI / 2
    this.terra.position.set(0, L.suoloY - 0.001, -60)
    this.terra.renderOrder = 1
    this.scena.add(this.terra)

    // i pannelli
    const seg = L.stretto ? [28, 6] : [48, 10]
    const geo = new THREE.PlaneGeometry(1, 1, seg[0], seg[1])
    FASI.forEach((f, i) => {
      const nome = textureNome(f.titolo)
      const u: Record<string, THREE.IUniform> = {
        uDim: { value: new THREE.Vector2(L.w, L.h) },
        uCurva: { value: L.kRiposo },
        uPiega: { value: 0 },
        uA: { value: VUOTA },
        uCropA: { value: new THREE.Vector4(0, 0, 1, 1) },
        uCropA2: { value: new THREE.Vector4(0, 0, 1, 1) },
        uMixA: { value: 0 },
        uB: { value: VUOTA },
        uCropB: { value: new THREE.Vector4(0, 0, 1, 1) },
        uMixB: { value: 0 },
        uCentroB: { value: new THREE.Vector2(0.5, 0.48) },
        uNome: { value: nome.t },
        uNomeRett: { value: new THREE.Vector4(0, 0, 0, 0) },
        uNomeAlfa: { value: 1 },
        uFondo: { value: TERRA.clone() },
        uAvorio: { value: AVORIO },
        uLuceCol: { value: LUCE },
        uOro: { value: ORO },
        uFocus: { value: 0 },
        uBordo: { value: new THREE.Vector2(0.002, 0.002) },
        uLuce: { value: 0.5 },
        uAlfa: { value: 1 },
        uPronto: { value: 0 },
        uAspetto: { value: new THREE.Vector2(0.75, 1) },
        ...this.uniformLanterna(),
      }
      const m = new THREE.ShaderMaterial({ vertexShader: PANNELLO_V, fragmentShader: PANNELLO_F, uniforms: u, ...premolt, depthWrite: true })
      const mesh = new THREE.Mesh(geo, m)
      mesh.frustumCulled = false
      this.scena.add(mesh)
      this.pannelli.push({
        i, mesh, u, fermo: null, ciclo: null, cicloInCorso: false, istantanea: null, istAspetto: 1.6, uscita: null, usAspetto: 1.6,
        pronto: 0, bPronto: 0, nomeAspetto: nome.aspetto, nomeAltezzaPx: nome.altezzaPx, soggettoX: 0.56,
        film: FILM.some((x) => x.fase === f.numero),
        angoli: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      })
    })

    // i nomi si riscrivono quando il Bodoni corsivo è caricato (prima la misura sarebbe sbagliata)
    Promise.resolve(document.fonts?.load(`italic 400 ${PX_NOME}px ${FONT_NOME}`)).then(() => {
      this.pannelli.forEach((p) => {
        const n = textureNome(FASI[p.i].titolo)
        libera(p.u.uNome.value as THREE.Texture)
        p.u.uNome.value = n.t
        p.nomeAspetto = n.aspetto
        p.nomeAltezzaPx = n.altezzaPx
      })
      this.sporca()
    })

    // il velo
    this.velo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: VELO_V,
        fragmentShader: VELO_F,
        uniforms: {
          uRis: { value: new THREE.Vector2(1, 1) },
          uDpr: { value: 1 },
          uFase: { value: 0 },
          uNero: { value: NERO },
          uAvorio: { value: AVORIO },
          uLuceCol: { value: LUCE },
          uGrana: { value: 0.06 },
          uVignetta: { value: 0.7 },
          uSfocata: { value: VUOTA },
          uSfRett: { value: new THREE.Vector4(0, 0, 1, 1) },
          uSfAlfa: { value: 0 },
          uSfRuota: { value: new THREE.Vector3() },
          uBuio: { value: 0 },
          uFilm: { value: VUOTA },
          uQuadro: { value: new THREE.Vector4(0, 0, 1, 1) },
          uMaschera: { value: new THREE.Vector3(0, 0, 1e5) },
          uFilmAlfa: { value: 0 },
          uMascheraOn: { value: 0 },
          ...this.uniformLanterna(),
        },
        depthTest: false,
        depthWrite: false,
        ...premolt,
      }),
    )
    this.velo.frustumCulled = false
    this.veloScena.add(this.velo)
  }

  private uniformLanterna() {
    return { uMouse: { value: new THREE.Vector2(-1e5, -1e5) }, uLanterna: { value: 0 }, uRaggio: { value: 260 } }
  }

  private caricaFermi() {
    // il pannello centrale per primo, poi gli altri allontanandosi
    const c = Math.round(spazio.arco)
    const ordine = FASI.map((_, i) => i).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))
    let k = 0
    const lavora = async () => {
      while (k < ordine.length) {
        const i = ordine[k++]
        const t = await caricaTexture(urlFermo(i))
        if (t) this.carica(t, () => (this.pannelli[i].fermo = t))
      }
    }
    lavora()
    lavora()
  }

  misura = () => {
    this.vw = window.innerWidth
    this.H = window.innerHeight
    const L0 = this.L
    this.L = disposizione(this.vw)
    const stretto = this.L.stretto
    this.dpr = Math.min(window.devicePixelRatio || 1, stretto ? 2 : 1.75)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.vw, this.H, false)
    this.camera.aspect = this.vw / this.H
    this.camera.fov = this.L.fov
    this.camera.updateProjectionMatrix()
    this.suolo.position.y = this.L.suoloY
    this.terra.position.y = this.L.suoloY - 0.001
    const vu = this.velo.material.uniforms
    vu.uRis.value.set(this.vw, this.H)
    vu.uDpr.value = this.dpr
    if (L0.stretto !== stretto) this.pannelli.forEach((p) => (p.u.uCurva.value = this.L.kRiposo))
    this.sporca()
  }

  // ── contenuti dei pannelli ────────────────────────────────────────────────
  /** La tavola vera all'inizio della fase i (canvas o bitmap alla misura dello schermo). */
  impostaIstantanea(i: number, img: HTMLCanvasElement | ImageBitmap, soggettoX: number) {
    const p = this.pannelli[i]
    if (!p) return
    const t = new THREE.Texture(img as unknown as HTMLImageElement)
    Object.assign(t, { flipY: false, colorSpace: THREE.NoColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4 })
    t.needsUpdate = true
    this.carica(t, () => {
      libera(p.istantanea)
      p.istantanea = t
      p.istAspetto = img.width / img.height
      p.soggettoX = soggettoX
    })
  }
  haIstantanea = (i: number) => !!this.pannelli[i]?.istantanea
  /** Lo stato della fase al momento dell'uscita. */
  impostaUscita(i: number, img: HTMLCanvasElement | null) {
    const p = this.pannelli[i]
    if (!p) return
    libera(p.uscita)
    p.uscita = null
    if (img) {
      p.uscita = new THREE.Texture(img as unknown as HTMLImageElement)
      Object.assign(p.uscita, { flipY: false, colorSpace: THREE.NoColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4 })
      p.uscita.needsUpdate = true
      p.usAspetto = img.width / img.height
      p.bPronto = 1
    }
    this.sporca()
  }
  /** Dopo l'uscita il pannello torna alla sua anteprima viva. */
  dimenticaUscita(i: number) {
    const p = this.pannelli[i]
    if (!p?.uscita) return
    libera(p.uscita)
    p.uscita = null
    this.sporca()
  }

  private gestisciCicli(c: number) {
    // atlante del ciclo vivo: solo il pannello centrale e i vicini; gli altri lo liberano
    this.pannelli.forEach((p) => {
      const d = Math.abs(p.i - c)
      if (d <= 1 && !p.ciclo && !p.cicloInCorso && !preferenze.get().ridotto) {
        p.cicloInCorso = true
        // l'atlante si vede circa alla sua misura: niente mipmap (caricarle costerebbe un fotogramma)
        caricaTexture(urlCiclo(p.i), false).then((t) => {
          p.cicloInCorso = false
          if (!t) return
          if (Math.abs(p.i - Math.round(spazio.arco)) > 2) return libera(t)
          this.carica(t, () => (p.ciclo = t))
        })
      } else if (d > 2 && p.ciclo) {
        libera(p.ciclo)
        p.ciclo = null
      }
    })
  }

  // ── il fotogramma ────────────────────────────────────────────────────────
  private fotogramma = (ora: number): boolean => {
    const dt = Math.min(0.05, Math.max(0.001, (ora - this.ultimo) / 1000))
    this.ultimo = ora
    this.tempo += dt
    const ridotto = preferenze.get().ridotto
    const st = spazio.get()
    let anima = false

    // velocità dell'arco → flessione dei pannelli (molle)
    const arco = spazio.arco
    const vIst = (arco - this.arcoPrec) / dt
    this.arcoPrec = arco
    this.vel = lerp(this.vel, vIst, 1 - Math.pow(0.001, dt))
    const v = ridotto ? 0 : this.vel
    if (Math.abs(v) > 0.002) anima = true
    anima = passoMolla(this.curva, clamp(Math.abs(v) * 0.32, 0, 1.4), dt) || anima
    anima = passoMolla(this.piega, clamp(-Math.abs(v) * 0.05, -0.16, 0), dt) || anima
    anima = passoMolla(this.ritardo, clamp(-v * 0.055, -0.3, 0.3), dt) || anima
    const sopraCentrale = this.sopra >= 0 && this.sopra === Math.round(arco) && st.livello === 'anno' && !st.volo
    anima = passoMolla(this.avanti, sopraCentrale && !ridotto ? 1 : 0, dt) || anima
    if (Math.abs(vIst) > 1e-4) this.sporco = true

    const c = Math.round(clamp(arco, 0, FASI.length - 1))
    if (c !== this.centrale) {
      this.centrale = c
      this.gestisciCicli(c)
    }

    // lanterna: il punto insegue il cursore con interpolazione 0,1 per fotogramma
    const m = this.mouse
    const k = 1 - Math.pow(0.9, dt * 60)
    const fBers = m.ok ? m.bersaglio : 0
    if (Math.abs(m.tx - m.x) > 0.1 || Math.abs(m.ty - m.y) > 0.1 || Math.abs(fBers - m.forza) > 0.002) {
      m.x += (m.tx - m.x) * k
      m.y += (m.ty - m.y) * k
      m.forza += (fBers - m.forza) * (1 - Math.pow(0.92, dt * 60))
      anima = true
      this.sporco = true
    }

    // il volo: u (0 Anno → 1 Fase) e la spinta (anticipo del volo o arretramento)
    const s = spazio.spinta
    const e = clamp(spazio.u + (st.livello === 'anno' && !st.volo ? Math.max(-0.4, s) * 0.16 : 0), -0.08, 1)
    const fase = st.modo === 'fase'

    // ciclo vivo del pannello centrale (a riposo nel livello Anno)
    const vivo = !ridotto && st.modo === 'scena' && !document.hidden
    if (vivo && this.pannelli[c]?.ciclo) anima = true

    // comparsa delle immagini
    for (const p of this.pannelli) {
      const bers = p.fermo || p.ciclo ? 1 : 0
      if (Math.abs(p.pronto - bers) > 0.001) {
        p.pronto = bers ? Math.min(1, p.pronto + dt / 0.45) : 0
        anima = true
        this.sporco = true
      }
      const haB = !!(p.uscita || p.istantanea)
      if (haB && p.bPronto < 1) {
        p.bPronto = Math.min(1, p.bPronto + dt / 0.28)
        anima = true
        this.sporco = true
      }
    }

    // apertura: parte quando il pannello centrale ha la sua immagine (o dopo un attimo)
    if (this.apertura < 1) {
      // a orologio (non a fotogrammi): dura 2,2 s anche se i primi fotogrammi sono lenti
      if (!this.inizioApertura && (this.pannelli[c]?.fermo || ora - this.avvio > 1200)) this.inizioApertura = ora
      if (this.inizioApertura) this.apertura = ridotto ? 1 : Math.min(1, (ora - this.inizioApertura) / 2200)
      anima = true
      this.sporco = true
    }

    if (!this.sporco && !anima) return false
    this.sporco = false
    if (fase) this.disegnaFase()
    else this.disegnaScena(e, st.aperta, vivo)
    return anima || this.sporco
  }

  private aggiornaLanterna(u: Record<string, THREE.IUniform>) {
    const m = this.mouse
    u.uMouse.value.set(m.x * this.dpr, (this.H - m.y) * this.dpr)
    u.uLanterna.value = m.forza
    u.uRaggio.value = 260 * this.dpr
  }

  private disegnaScena(e: number, aperta: number, vivo: boolean) {
    const L = this.L
    const cam = this.camera
    const Rc = L.R - L.vicino
    const fov = (L.fov * Math.PI) / 180
    const d = L.h / 2 / Math.tan(fov / 2)
    const ee = clamp(e)
    // la camera vola dalla posa dell'Anno a quella frontale sul pannello aperto (all'apertura del
    // sito arriva da più lontano e più in alto)
    const ap = 1 - smooth(this.apertura)
    cam.position.set(0, lerp(L.camY, 0, e) + ap * 0.5, lerp(L.D, -Rc + d, e) + ap * 2.6)
    const guarda = new THREE.Vector3(0, lerp(L.guardaY, 0, e), lerp(-L.R, -Rc, e))
    cam.lookAt(guarda)
    cam.updateMatrixWorld()

    const su = this.suolo.material.uniforms
    su.uScorre.value = spazio.arco * L.passo * 0.85
    // una linea di 1 pixel del dispositivo sullo schermo denso è sottile la metà: si compensa l'opacità
    su.uAlfa.value = 0.13 * Math.pow(Math.min(2, this.dpr), 0.85) * (1 - ee)
    this.aggiornaLanterna(su)
    this.aggiornaLanterna(this.terra.material.uniforms)
    this.terra.material.uniforms.uAlfa.value = 1 - ee

    const aspettoSchermo = this.vw / this.H
    const pxUnita = this.H / (2 * (Rc + L.D) * Math.tan(fov / 2))
    const nomeH = (PX_NOME * 1.5) / pxUnita // altezza della riga del nome, in unità del mondo
    const margine = 18 / pxUnita
    const ridotto = preferenze.get().ridotto

    for (const p of this.pannelli) {
      const u = p.u
      const off = p.i - spazio.arco
      const aperto = p.i === aperta
      const vic = smooth(clamp(1 - Math.abs(off)))
      // gli altri pannelli si aprono di lato e si spengono mentre la camera entra
      const allarga = aperto ? 0 : Math.sign(off || 1) * ee * 0.55
      const th = off * (L.passo / L.R) + allarga
      const R = L.R - L.vicino * vic - (p.i === this.sopra ? this.avanti.x * 0.1 : 0)
      const ea = aperto ? e : 0
      const eac = clamp(ea)
      const visibile = Math.abs(off) < 5.5
      p.mesh.visible = visibile
      if (!visibile) continue
      // apertura: i pannelli salgono dal vigneto uno dopo l'altro, dal centro verso i lati
      const comp = smooth(clamp(this.apertura * 1.7 - 0.25 - Math.abs(off) * 0.16))
      p.mesh.position.set(R * Math.sin(th), -(1 - comp) * 0.35, -R * Math.cos(th))
      // i pannelli laterali si voltano verso il centro più di quanto chieda l'arco: profondità
      p.mesh.rotation.set(0, -th * (1 + VOLTA * (1 - eac)) + this.ritardo.x * (1 - (aperto ? ee : 0)), 0)
      const w = lerp(L.w, aspettoSchermo * L.h, eac)
      u.uDim.value.set(w, L.h)
      const flessione = (L.kRiposo + this.curva.x * (1 - 0.25 * Math.min(2, Math.abs(off)))) * (ridotto ? 0 : 1)
      u.uCurva.value = flessione * (1 - eac)
      u.uPiega.value = this.piega.x * (1 - eac)
      u.uAspetto.value.set(w / L.h, 1)
      u.uFondo.value.copy(TERRA).lerp(NERO, eac)
      u.uLuce.value = lerp(lerp(0.66, 1, vic) * clamp(1.1 - Math.abs(off) * 0.12), 1, eac)
      u.uAlfa.value = (aperto ? 1 : clamp(1 - ee * 1.6) * clamp(1.2 - Math.max(0, Math.abs(off) - 3.5) * 0.6)) * comp
      u.uFocus.value = this.focus === p.i ? 1 - eac : 0
      u.uBordo.value.set(1 / (pxUnita * w), 1 / (pxUnita * L.h))
      p.mesh.renderOrder = 10 + Math.round((5 - Math.abs(off)) * 10) + (aperto ? 100 : 0)
      this.aggiornaLanterna(u)

      // contenuto A: anteprima o ciclo vivo; contenuto B: istantanea (ingresso) o uscita
      const pa = w / L.h
      if (p.ciclo && vivo && Math.abs(off) < 1.5) {
        const periodo = 9
        const t = (this.tempo / periodo) % 2
        const f = (t < 1 ? t : 2 - t) * (CELLE.n - 1)
        const f0 = Math.floor(f)
        const cella = { c: CELLE.colonne, r: CELLE.righe, i: f0 }
        u.uA.value = p.ciclo
        u.uCropA.value.copy(ritaglio(ASPETTO_CELLA, pa, 0.5, 0.5, cella))
        u.uCropA2.value.copy(ritaglio(ASPETTO_CELLA, pa, 0.5, 0.5, { ...cella, i: Math.min(CELLE.n - 1, f0 + 1) }))
        u.uMixA.value = f - f0
      } else if (p.ciclo && !p.fermo) {
        u.uA.value = p.ciclo
        u.uCropA.value.copy(ritaglio(ASPETTO_CELLA, pa, 0.5, 0.5, { c: CELLE.colonne, r: CELLE.righe, i: 0 }))
        u.uCropA2.value.copy(u.uCropA.value)
        u.uMixA.value = 0
      } else {
        u.uA.value = p.fermo ?? VUOTA
        u.uCropA.value.copy(ritaglio(ASPETTO_CELLA, pa))
        u.uCropA2.value.copy(u.uCropA.value)
        u.uMixA.value = 0
      }
      u.uPronto.value = smooth(p.pronto)
      const B = aperto && p.uscita ? p.uscita : aperto ? p.istantanea : null
      if (B && ea > 0) {
        const ba = B === p.uscita ? p.usAspetto : p.istAspetto
        u.uB.value = B
        u.uCropB.value.copy(ritaglio(ba, pa, p.soggettoX, 0.5))
        // l'istantanea prende il posto dell'anteprima nella prima metà del volo (all'uscita, il contrario)
        u.uMixB.value = smooth(clamp(ea / 0.55)) * smooth(p.bPronto)
      } else u.uMixB.value = 0

      // il nome, in basso a sinistra, sempre alla stessa misura a schermo
      const hN = nomeH / L.h
      const wN = (nomeH * p.nomeAspetto) / w
      // allineato al bordo sinistro della tavola montata, al centro della fascia libera in basso
      u.uNomeRett.value.set((0.08 * L.w) / w, Math.min(1 - margine / L.h - hN, 0.947 - hN / 2), wN, hN)
      u.uNomeAlfa.value = clamp(1 - ea * 3) * lerp(0.6, 1, vic)

      // angoli a schermo (pannello piano): per il clic
      const hw = w / 2, hh = L.h / 2
      p.mesh.updateMatrixWorld()
      ;[[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].forEach(([x, y], j) => p.angoli[j].set(x, y, 0).applyMatrix4(p.mesh.matrixWorld).project(cam))
    }

    const vu = this.velo.material.uniforms
    vu.uFase.value = 0
    vu.uVignetta.value = 0.75 * (1 - ee)
    const r = this.renderer
    r.setClearColor(new THREE.Color(NERO.x, NERO.y, NERO.z), 1)
    r.clear()
    r.render(this.scena, cam)
    r.render(this.veloScena, this.veloCam)
  }

  private disegnaFase() {
    const vu = this.velo.material.uniforms
    vu.uFase.value = 1
    vu.uVignetta.value = 0
    const f = this.film
    vu.uFilm.value = f.tex ?? VUOTA
    vu.uQuadro.value.set(...f.quadro)
    vu.uMaschera.value.set(...f.maschera)
    vu.uFilmAlfa.value = f.tex ? f.alfa : 0
    vu.uMascheraOn.value = f.mascheraOn ? 1 : 0
    const s = this.fuoco
    vu.uSfocata.value = s.tex ?? VUOTA
    vu.uSfRett.value.set(...s.rett)
    vu.uSfAlfa.value = s.tex ? s.alfa : 0
    vu.uSfRuota.value.set(...s.ruota)
    vu.uBuio.value = s.buio
    this.aggiornaLanterna(vu)
    const r = this.renderer
    r.setClearColor(new THREE.Color(0, 0, 0), 0)
    r.clear()
    r.render(this.veloScena, this.veloCam)
  }

  /** Il pannello sotto il punto (px CSS), o −1. */
  pannelloSotto(x: number, y: number) {
    const nx = (x / this.vw) * 2 - 1, ny = 1 - (y / this.H) * 2
    let migliore = -1, ordine = -1
    for (const p of this.pannelli) {
      if (!p.mesh.visible || p.u.uAlfa.value < 0.3) continue
      const a = p.angoli
      let dentro = true
      for (let j = 0; j < 4; j++) {
        const A = a[j], B = a[(j + 1) % 4]
        if ((B.x - A.x) * (ny - A.y) - (B.y - A.y) * (nx - A.x) > 0) dentro = false
      }
      if (dentro && p.mesh.renderOrder > ordine) {
        ordine = p.mesh.renderOrder
        migliore = p.i
      }
    }
    return migliore
  }

  /** Il pannello sotto il cursore: quello centrale si fa avanti di poco, come per farsi prendere. */
  impostaSopra(i: number) {
    if (i === this.sopra) return
    this.sopra = i
    this.sporca()
  }

  impostaFocus(i: number) {
    this.focus = i
    this.sporca()
  }
}

export const motore = new Motore()
if (import.meta.env.DEV) (window as unknown as { __motore: Motore }).__motore = motore
