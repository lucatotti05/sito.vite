/*
 * Gli shader dello spazio. Tutti i colori escono premoltiplicati per l'alfa (il canvas è
 * premoltiplicato): nel livello Fase il canvas è trasparente sopra la tavola e si compone da solo.
 * Le texture non hanno conversioni di colore: i valori campionati sono già quelli dello schermo.
 * Le texture sono caricate con l'origine in alto (flipY spento): v = 0 è la prima riga.
 */

/** La luce della lanterna: gaussiana attorno al cursore, in pixel del dispositivo. */
const LANTERNA = /* glsl */ `
uniform vec2 uMouse;
uniform float uLanterna;
uniform float uRaggio;
float lanterna(vec2 fc) {
  float d = distance(fc, uMouse) / uRaggio;
  return uLanterna * exp(-d * d * 2.2);
}
`

/**
 * IL MONDO NASCOSTO: sotto il buio del sito c'è il vigneto vivo, dipinto (public/mondo/, una tavola
 * per stagione). Dove passa il cursore resta una scia (uTraccia: r = quantità, gb = direzione) che
 * fiorisce piano come acqua sulla carta e lo scopre: il bordo è organico e respira, con un filo di
 * luce calda. Il disegno della vite, dentro la scia, prende colore come un acquerello: le campiture
 * si velano di verdi e ocre, gli accenti si accendono, le linee restano linee.
 */
const VITA = /* glsl */ `
float hashP(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float rumP(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashP(i), hashP(i + vec2(1, 0)), f.x), mix(hashP(i + vec2(0, 1)), hashP(i + vec2(1, 1)), f.x), f.y);
}
float fbmP(vec2 p) { return rumP(p) * 0.55 + rumP(p * 2.07 + 7.3) * 0.3 + rumP(p * 4.31 + 1.7) * 0.15; }
/** la soglia organica del bordo, che respira piano */
float sogliaVita(vec2 P, float t) {
  float n = fbmP(P * 0.0062 + vec2(t * 0.05, -t * 0.04)) * 0.7 + fbmP(P * 0.021 - vec2(t * 0.09, 0.0)) * 0.3;
  return 0.26 + (n - 0.5) * 0.3;
}
/** quanto si vede il mondo: 0 fuori dalla scia, 1 dentro, con il bordo morbido e frastagliato */
float apri(float m, vec2 P, float t) {
  float s = sogliaVita(P, t);
  return smoothstep(s - 0.035, s + 0.09, m);
}
/** il filo di luce sul bordo che avanza */
float filoVita(float m, vec2 P, float t) {
  float d = (m - sogliaVita(P, t)) / 0.03;
  return exp(-d * d) * smoothstep(0.02, 0.12, m);
}
/**
 * Il disegno che prende colore, come un acquerello steso sopra \`sotto\`: cc è il disegno nel punto,
 * bordo quanto il punto è vicino al contorno di una campitura (lì l'acqua deposita più colore).
 */
vec3 acquerello(vec4 cc, float bordo, vec2 P, vec3 stagione, vec3 sotto, float conLegno) {
  vec3 rgb = cc.rgb / max(cc.a, 1e-3);
  float a = cc.a;
  float lum = dot(rgb, vec3(0.3, 0.59, 0.11));
  float ch = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
  float macchia = fbmP(P * 0.018);
  float velo = fbmP(P * 0.045 + 4.7);
  float grana = rumP(P * 0.7) * 0.6 + rumP(P * 1.9 + 3.0) * 0.4; // la grana della carta sotto l'acqua
  // ogni foglia un'altra mescolanza: verde profondo, verde giallo, un'ocra; poi la luce della stagione
  vec3 tinta = mix(vec3(0.24, 0.38, 0.12), vec3(0.58, 0.64, 0.22), smoothstep(0.25, 0.8, macchia));
  tinta = mix(tinta, vec3(0.7, 0.5, 0.18), 0.35 * smoothstep(0.55, 0.9, velo));
  tinta = mix(tinta, stagione, 0.22);
  // il legno (nell'istantanea della tavola la sua campitura è segnata bruna) prende i bruni della corteccia
  float scura = 1.0 - smoothstep(0.16, 0.24, lum);
  float legno = conLegno * scura * smoothstep(0.01, 0.05, rgb.r - rgb.g);
  tinta = mix(tinta, vec3(0.38, 0.23, 0.11) * (0.8 + 0.4 * velo), legno);
  tinta *= 0.78 + 0.34 * grana;
  float linea = a * smoothstep(0.26, 0.55, lum) * (1.0 - smoothstep(0.14, 0.32, ch));
  float colore = a * smoothstep(0.14, 0.28, ch) * (1.0 - scura);
  float campitura = a * (1.0 - linea) * (1.0 - colore);
  vec3 col = mix(sotto, tinta * (0.85 + 0.3 * velo), campitura * (0.62 + 0.22 * velo));
  col *= 1.0 - 0.28 * bordo * campitura;                       // il colore si deposita sul contorno
  col = mix(col, clamp(mix(vec3(lum), rgb, 1.8) * 1.35, 0.0, 1.0), colore);
  col = mix(col, vec3(0.97, 0.9, 0.75), linea * 0.92);
  return col;
}
`

/** il mondo dipinto, a tutto schermo (copre lo schermo, con la parallasse del cursore) */
const MONDO = /* glsl */ `
uniform sampler2D uMondoA;
uniform sampler2D uMondoB;
uniform float uMondoMix;
uniform vec4 uMondoRett; // ox, oy, w, h (px CSS)
uniform float uMondoOn;
vec3 mondo(vec2 P, float t) {
  vec2 uv = (P - uMondoRett.xy) / uMondoRett.zw;
  // il vigneto respira: un'onda lentissima, come aria calda sopra i filari
  uv += (vec2(rumP(P * 0.004 + t * 0.15), rumP(P * 0.004 + 9.0 - t * 0.13)) - 0.5) * 0.004;
  return mix(texture2D(uMondoA, uv).rgb, texture2D(uMondoB, uv).rgb, uMondoMix);
}
`

// ── suolo: filari, fili e pali (linee di 1px) ───────────────────────────
export const SUOLO_V = /* glsl */ `
uniform float uScorre;
uniform float uLargo;
varying float vProf;
void main() {
  vec3 p = position;
  // il vigneto scorre di lato con l'arco: i filari si ripetono all'infinito
  p.x = mod(p.x - uScorre + uLargo * 0.5, uLargo) - uLargo * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vProf = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
export const SUOLO_F = /* glsl */ `
uniform vec3 uColore;
uniform vec3 uLuce;
uniform float uAlfa;
varying float vProf;
${LANTERNA}
void main() {
  // le linee si perdono nel buio con la distanza (e si ritirano proprio davanti alla camera)
  float nebbia = exp(-vProf * 0.045) * smoothstep(0.3, 2.2, vProf);
  float l = lanterna(gl_FragCoord.xy);
  vec3 c = mix(uColore, uLuce, min(1.0, l * 1.4));
  float a = uAlfa * nebbia * (1.0 + l * 3.0);
  gl_FragColor = vec4(c * a, a);
}
`

// ── suolo: la luce calda della lanterna sulla terra ──────────────────────
export const TERRA_V = /* glsl */ `
varying float vProf;
varying vec2 vMondo;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMondo = w.xz;
  vec4 mv = viewMatrix * w;
  vProf = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
export const TERRA_F = /* glsl */ `
uniform vec3 uLuce;
uniform float uAlfa;
uniform vec3 uStagione;
uniform vec3 uPozza;    // x, z del pannello centrale e forza della luce che versa a terra
varying float vProf;
varying vec2 vMondo;
${LANTERNA}
void main() {
  float l = lanterna(gl_FragCoord.xy) * exp(-vProf * 0.08) * uAlfa;
  // il pannello centrale versa la luce della stagione sul suolo davanti a sé
  vec2 d = (vMondo - uPozza.xy) / vec2(1.5, 1.1);
  float pz = exp(-dot(d, d)) * uPozza.z * uAlfa;
  gl_FragColor = vec4(uLuce * l * 0.16 + uStagione * pz, 0.0);
}
`

// ── l'orizzonte: la luce bassa della stagione dietro il vigneto ─────────────
// un quadro a tutto schermo disegnato per primo: la foschia nasce sulla linea dell'orizzonte vero
// (uOrizzonte, px CSS dall'alto), sale lenta nel cielo e si spegne subito sul suolo
export const CIELO_V = /* glsl */ `
void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`
export const CIELO_F = /* glsl */ `
uniform vec3 uStagione;
uniform float uAlfa;
uniform vec2 uRis;
uniform float uDpr;
uniform float uOrizzonte;
uniform sampler2D uTraccia;
uniform float uTracciaOn;
uniform float uTempo;
${VITA}
${MONDO}
void main() {
  vec2 P = vec2(gl_FragCoord.x, uRis.y * uDpr - gl_FragCoord.y) / uDpr;
  vec3 dip = vec3(0.0);
  if (uTracciaOn > 0.5) {
    // nel vuoto la scia scopre il vigneto vivo; i filari del suolo restano disegnati sopra
    vec4 tr = texture2D(uTraccia, gl_FragCoord.xy / (uRis * uDpr));
    if (tr.r > 0.004) {
      dip = mondo(P, uTempo) * apri(tr.r, P, uTempo) * uMondoOn + vec3(1.0, 0.78, 0.45) * filoVita(tr.r, P, uTempo) * 0.3;
    }
  }
  float dy = (uOrizzonte - P.y) / uRis.y; // > 0 sopra l'orizzonte
  float h = dy > 0.0 ? exp(-dy * 3.2) : exp(dy * 9.0);
  float x = (P.x / uRis.x - 0.5) * 2.0;
  h *= 1.0 - 0.55 * x * x;
  gl_FragColor = vec4(uStagione * h * uAlfa + dip, 0.0);
}
`

// ── pannelli curvi ──────────────────────────────────────────────────────
export const PANNELLO_V = /* glsl */ `
uniform vec2 uDim;
uniform float uCurva;
uniform float uPiega;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vec3 p = vec3(position.x * uDim.x, position.y * uDim.y, 0.0);
  // il foglio si incurva attorno a un asse verticale: i bordi vengono verso chi guarda
  float k = uCurva;
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (abs(k) > 1e-4) {
    float a = p.x * k;
    p.z = (1.0 - cos(a)) / k;
    p.x = sin(a) / k;
    n = vec3(-sin(a), 0.0, cos(a));
  }
  // con la velocità il foglio si piega anche in altezza, come carta che fende l'aria
  float y = position.y * 2.0;
  p.z += uPiega * (1.0 - y * y) * uDim.y * 0.5;
  n = normalize(n + vec3(0.0, uPiega * y * 1.2, 0.0));
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`
export const PANNELLO_F = /* glsl */ `
uniform sampler2D uA;
uniform vec4 uCropA;
uniform vec4 uCropA2;
uniform float uMixA;
uniform sampler2D uB;
uniform vec4 uCropB;
uniform float uMixB;
uniform vec2 uCentroB;
uniform sampler2D uNome;
uniform vec4 uNomeRett;
uniform float uNomeAlfa;
uniform vec3 uFondo;
uniform vec3 uAvorio;
uniform vec3 uLuceCol;
uniform float uLuce;
uniform float uAlfa;
uniform float uPronto;
uniform vec2 uAspetto;
uniform vec3 uOro;
uniform float uFocus;
uniform vec2 uBordo;
uniform vec2 uSposta;   // la tavola sotto il vetro si sposta appena col cursore
uniform float uLinea;   // il filetto sotto il nome, tracciato quando il cursore è sul pannello
uniform vec3 uStagione; // la luce della stagione della fase: illumina il foglio da dietro la pianta
uniform float uBagliore;
uniform float uAngolo;  // raggio degli angoli, in px a schermo (0 a pannello aperto)
uniform float uRiflesso; // 1 = la copia specchiata sul suolo
uniform float uLucido;  // forza della luce radente sul foglio (0 a pannello aperto)
uniform sampler2D uTraccia;
uniform float uTracciaOn;
uniform float uTempo;
uniform vec2 uRisDev;   // misura del canvas in px del dispositivo
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
${LANTERNA}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rumore(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec4 campiona(sampler2D t, vec4 crop, vec2 uv) { return texture2D(t, crop.xy + uv * crop.zw); }
${VITA}

void main() {
  vec2 px = vec2(1.0) / uBordo;           // misura del foglio in px a schermo
  vec2 pp = (vUv - 0.5) * px;             // posizione nel foglio, px dal centro
  // angoli smussati, antialiasati su un pixel e mezzo
  vec2 qa = abs(pp) - px * 0.5 + uAngolo;
  float dBordo = length(max(qa, 0.0)) + min(max(qa.x, qa.y), 0.0) - uAngolo;
  float forma = 1.0 - smoothstep(-0.75, 0.75, dBordo);
  if (forma <= 0.0) discard;

  vec2 uvA = vUv + uSposta;
  if (uRiflesso > 0.5) uvA.x += (rumore(vec2(vUv.y * 38.0, 0.0)) - 0.5) * 0.012; // il suolo increspa il riflesso
  vec4 a = mix(campiona(uA, uCropA, uvA), campiona(uA, uCropA2, uvA), uMixA);
  a = mix(vec4(0.0), a, uPronto);
  vec4 c = a;
  if (uMixB > 0.0) {
    vec4 b = campiona(uB, uCropB, vUv);
    // dissolvenza a rumore organico centrata sul soggetto (DESIGN.md, "Film")
    vec2 q = (vUv - uCentroB) * uAspetto;
    float n = rumore(vUv * uAspetto * 5.0) * 0.55 + rumore(vUv * uAspetto * 13.0) * 0.25;
    float soglia = length(q) * 0.9 + n;
    float m = smoothstep(soglia - 0.12, soglia + 0.12, uMixB * 2.1);
    c = mix(a, b, m);
  }
  // la carta: più chiara in alto (luce dall'alto), con la luce della stagione dietro la pianta
  vec2 qb = (vUv - vec2(0.5, 0.4)) * uAspetto;
  float g = exp(-dot(qb, qb) * 4.2);
  vec3 fondo = uFondo * mix(1.0, mix(1.14, 0.8, vUv.y), uLucido) + uStagione * g * uBagliore;
  vec3 col = mix(fondo, c.rgb, c.a);
  // il cursore dà vita al disegno: sotto la scia la tavola del pannello prende colore (acquerello)
  if (uTracciaOn > 0.5 && uRiflesso < 0.5 && uLucido > 0.01) {
    vec4 tr = texture2D(uTraccia, gl_FragCoord.xy / uRisDev);
    if (tr.r > 0.004) {
      vec4 cc = campiona(uA, uCropA, uvA) * uPronto;
      vec2 o = uBordo * 3.0;
      float nb = (campiona(uA, uCropA, uvA + vec2(o.x, 0.0)).a + campiona(uA, uCropA, uvA - vec2(o.x, 0.0)).a + campiona(uA, uCropA, uvA + vec2(0.0, o.y)).a + campiona(uA, uCropA, uvA - vec2(0.0, o.y)).a) * 0.25 * uPronto;
      float bordo = clamp((cc.a - nb) * 3.0, 0.0, 1.0);
      float m = apri(tr.r, pp, uTempo) * uLucido;
      col = mix(col, acquerello(cc, bordo, pp + px * 0.5, uStagione, col, 0.0), m);
      col += vec3(1.0, 0.78, 0.45) * filoVita(tr.r, pp, uTempo) * 0.12 * uLucido;
    }
  }
  // il pannello centrale è più luminoso: gli altri affondano nel fondo
  col = mix(uFondo, col, uLuce);
  if (uRiflesso < 0.5) {
    // il nome della fase, in basso a sinistra, stampato sul foglio
    vec2 nu = (vUv - uNomeRett.xy) / uNomeRett.zw;
    if (nu.x >= 0.0 && nu.x <= 1.0 && nu.y >= 0.0 && nu.y <= 1.0) {
      float na = texture2D(uNome, nu).a * uNomeAlfa;
      col = mix(col, uAvorio, na);
    }
    // il filetto: 1px sotto il nome, da sinistra a destra
    float yl = uNomeRett.y + uNomeRett.w + uBordo.y * 2.0;
    if (uLinea > 0.001 && vUv.y >= yl && vUv.y < yl + uBordo.y && vUv.x >= uNomeRett.x && vUv.x <= uNomeRett.x + uNomeRett.z * uLinea) {
      col = mix(col, uAvorio, 0.85 * uNomeAlfa);
    }
    // in basso a destra, allineato al nome: un cerchio di 1px con un +; col cursore si riempie
    vec2 cc = vec2((1.0 - uNomeRett.x) * px.x - 13.0, (uNomeRett.y + uNomeRett.w * 0.5) * px.y);
    vec2 dc = vUv * px - cc;
    float rc = 11.0 + 2.0 * uLinea;
    float lc = length(dc);
    float anello = 1.0 - smoothstep(0.0, 1.0, abs(lc - rc) - 0.35);
    float disco = (1.0 - smoothstep(rc - 0.8, rc + 0.4, lc)) * uLinea;
    vec2 ad = abs(dc);
    float piu = (1.0 - smoothstep(0.0, 1.0, min(max(ad.x - 4.0, ad.y - 0.5), max(ad.y - 4.0, ad.x - 0.5)))) ;
    col = mix(col, uAvorio, max(anello * 0.55, disco) * uNomeAlfa);
    col = mix(col, mix(uAvorio, uFondo, disco), piu * uNomeAlfa);
    // fuoco della tastiera: un filetto di 1px in oro attorno al foglio
    if (uFocus > 0.0 && dBordo > -2.2) col = mix(col, uOro, uFocus);
    // luce radente sul foglio curvo: una fascia satinata che scorre quando l'arco gira e un filo
    // di luce sul bordo (il foglio ha uno spessore)
    vec3 N = normalize(vN);
    vec3 V = normalize(-vV);
    vec3 Lk = normalize(vec3(-0.55, 0.5, 0.65));
    float sat = pow(max(dot(N, normalize(Lk + V)), 0.0), 26.0);
    float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += (uLuceCol * sat * 0.07 + uAvorio * fr * 0.05) * uLucido;
  }
  // il filo di luce sul bordo (il foglio ha uno spessore): si vede anche nel riflesso
  col = mix(col, uAvorio, (1.0 - smoothstep(0.0, 1.2, abs(dBordo + 0.9))) * (0.16 + 0.3 * uRiflesso) * uLucido);
  // la lanterna scalda la carta sotto il cursore
  float l = lanterna(gl_FragCoord.xy);
  col += uLuceCol * l * (0.10 + 0.35 * dot(col, vec3(0.3, 0.5, 0.2)));
  float alfa = uAlfa * forma;
  if (uRiflesso > 0.5) {
    // il riflesso: il fondo del foglio (vicino al suolo) si specchia appena e sparisce verso il basso
    alfa *= smoothstep(0.3, 1.0, vUv.y) * 0.3;
  }
  gl_FragColor = vec4(col * alfa, alfa);
}
`

// ── il velo a tutto schermo: livello Fase (fuoco, buio, film, lanterna) e grana ──
export const VELO_V = /* glsl */ `
void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`
export const VELO_F = /* glsl */ `
uniform vec2 uRis;      // misura in px CSS
uniform float uDpr;
uniform float uFase;    // 1 = livello Fase (canvas trasparente sopra la tavola)
uniform vec3 uNero;
uniform vec3 uAvorio;
uniform vec3 uLuceCol;
uniform float uGrana;
uniform float uVignetta;
// istantanea sfocata della tavola (messa a fuoco del raccordo film)
uniform sampler2D uSfocata;
uniform vec4 uSfRett;
uniform float uSfAlfa;
uniform vec3 uSfRuota;  // angolo (rad) e perno (px CSS): la tavola ruota nel raccordo film
uniform float uBuio;
// fotogramma della clip
uniform sampler2D uFilm;
uniform vec4 uQuadro;   // ox, oy, dw, dh (px CSS)
uniform vec3 uMaschera; // cx, cy, r
uniform float uFilmAlfa;
uniform float uMascheraOn;
uniform float uApertura; // 0 = il portale nasce (forma organica), 1 = aperto (cerchio)
uniform float uTempo;
uniform vec3 uBordo;     // colore della luce sul bordo del portale (la luce della clip)
// il pennello del cursore sulla tavola: scia e istantanea della tavola (rettangolo a schermo, px CSS)
uniform sampler2D uTraccia;
uniform float uTracciaOn;
uniform sampler2D uDipinto;
uniform vec4 uDipRett;
uniform vec2 uDipTexel;
uniform float uDipAlfa;
uniform vec3 uStagione;
${LANTERNA}
${VITA}
${MONDO}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 sopra(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 P = vec2(fc.x, uRis.y * uDpr - fc.y) / uDpr;
  vec4 acc = vec4(0.0);
  if (uFase > 0.5) {
    if (uSfAlfa > 0.001) {
      vec2 Q = P;
      if (abs(uSfRuota.x) > 1e-4) {
        vec2 d = P - uSfRuota.yz;
        float c = cos(-uSfRuota.x), s = sin(-uSfRuota.x);
        Q = uSfRuota.yz + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
      }
      vec2 uv = (Q - uSfRett.xy) / uSfRett.zw;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) acc = sopra(texture2D(uSfocata, uv) * uSfAlfa, acc);
    }
    if (uBuio > 0.001) acc = sopra(vec4(uNero * uBuio, uBuio), acc);
    if (uTracciaOn > 0.5) {
      vec4 tr = texture2D(uTraccia, fc / (uRis * uDpr));
      if (tr.r > 0.004) {
        // sotto la scia il mondo vivo; davanti, la vite della tavola che prende colore
        float o = apri(tr.r, P, uTempo);
        vec3 col = mix(uNero, mondo(P, uTempo), uMondoOn);
        vec2 uv = (P - uDipRett.xy) / uDipRett.zw;
        bool dentro = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
        float fedele = dentro ? uDipAlfa : 0.0;
        if (fedele > 0.01) {
          vec4 cc = texture2D(uDipinto, uv);
          vec2 d = uDipTexel * 2.5;
          float nb = (texture2D(uDipinto, uv + vec2(d.x, 0.0)).a + texture2D(uDipinto, uv - vec2(d.x, 0.0)).a + texture2D(uDipinto, uv + vec2(0.0, d.y)).a + texture2D(uDipinto, uv - vec2(0.0, d.y)).a) * 0.25;
          col = acquerello(cc, clamp((cc.a - nb) * 3.0, 0.0, 1.0), uv / uDipTexel, uStagione, col, 1.0);
        }
        // senza un'istantanea fedele (la vite sta crescendo) il mondo è un velo: sotto resta la tavola
        float a = o * mix(0.55, 1.0, fedele);
        acc = sopra(vec4(col * a, a), acc);
        float f = filoVita(tr.r, P, uTempo) * 0.35;
        acc = sopra(vec4(vec3(1.0, 0.78, 0.45) * f, f), acc);
      }
    }
    if (uFilmAlfa > 0.001) {
      vec2 c = uMaschera.xy;
      vec2 dP = P - c;
      float dist = length(dP);
      // il portale: un cerchio deformato da onde lente (forma organica che respira); più si apre,
      // più torna cerchio. d < 0 dentro, in px
      float ang = atan(dP.y, dP.x);
      float org = mix(0.16, 0.012, uApertura);
      float onda = sin(ang * 3.0 + uTempo * 0.9) * 0.55 + sin(ang * 5.0 - uTempo * 1.3 + 1.7) * 0.3 + sin(ang * 2.0 + uTempo * 0.6 + 4.1) * 0.45;
      float rr = uMaschera.z * (1.0 + org * onda);
      float d = uMascheraOn > 0.5 ? dist - rr : -1e5;
      // vicino al bordo la clip si piega come dietro una lente spessa (rifrazione verso l'interno)
      float spess = clamp(rr * 0.14, 6.0, 90.0);
      float lente = uMascheraOn > 0.5 ? smoothstep(-spess, 0.0, d) : 0.0;
      vec2 Q = P - normalize(dP + 1e-4) * lente * lente * spess * 0.55;
      vec2 uv = (Q - uQuadro.xy) / uQuadro.zw;
      if (d < 1.5 && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        vec3 col = max(texture2D(uFilm, uv).rgb, uNero); // il nero della clip è il nero del sito
        float diag = length(uQuadro.zw);
        float v = smoothstep(min(uQuadro.z, uQuadro.w) * 0.3, diag * 0.62, dist);
        col = mix(col, uNero, 0.55 * v);
        // dentro la lente la clip si scurisce appena verso il bordo: dà spessore al vetro
        col *= 1.0 - 0.35 * lente * lente;
        float a = 1.0;
        // i bordi del fotogramma che cadono dentro lo schermo sfumano (sotto c'è la vite)
        float sf = min(uQuadro.z, uQuadro.w) * 0.16;
        if (uQuadro.x > 0.5) a *= smoothstep(0.0, sf, P.x - uQuadro.x);
        if (uQuadro.x + uQuadro.z < uRis.x - 0.5) a *= smoothstep(0.0, sf, uQuadro.x + uQuadro.z - P.x);
        if (uQuadro.y > 0.5) a *= smoothstep(0.0, sf, P.y - uQuadro.y);
        if (uQuadro.y + uQuadro.w < uRis.y - 0.5) a *= smoothstep(0.0, sf, uQuadro.y + uQuadro.w - P.y);
        // bordo netto, antialiasato su un pixel e mezzo
        a *= 1.0 - smoothstep(-0.75, 0.75, d * uDpr) ;
        a *= uFilmAlfa;
        acc = sopra(vec4(col * a, a), acc);
      }
      // la luce sul bordo: un filo sottile e caldo, più intenso dove il bordo guarda la lanterna
      // e che si spegne man mano che il portale copre lo schermo
      if (uMascheraOn > 0.5 && uMaschera.z > 0.5) {
        float filo = exp(-pow(d / max(1.2, spess * 0.06), 2.0));
        float alone = d < 0.0 ? exp(-pow(d / (spess * 0.5), 2.0)) * 0.22 : 0.0; // solo dentro, verso il bordo
        float verso = 0.65 + 0.35 * dot(normalize(dP + 1e-4), normalize(uMouse / uDpr - c + 1e-4) * vec2(1.0, -1.0));
        float k = (filo + alone) * verso * (1.0 - smoothstep(0.82, 1.0, uApertura)) * uFilmAlfa;
        acc = sopra(vec4(uBordo * k * 0.85, k * 0.85), acc);
      }
    }
    // la lanterna: luce calda e morbida, mescolata (mai sommata oltre il bianco)
    float l = lanterna(fc) * 0.16;
    acc = sopra(vec4(uLuceCol * l, l), acc);
  } else if (uVignetta > 0.0) {
    // nel vuoto, i bordi dello schermo affondano nel nero
    vec2 q = P / uRis - 0.5;
    float v = smoothstep(0.35, 0.85, length(q * vec2(1.0, 0.8))) * uVignetta;
    acc = sopra(vec4(uNero * v, v), acc);
  }
  // grana fine e costante, identica su tavola, film e spazio
  float g = hash(floor(P));
  float ga = uGrana * smoothstep(0.6, 1.0, g) * 1.1;
  acc = sopra(vec4(uAvorio * ga, ga), acc);
  gl_FragColor = acc;
}
`

// ── la scia del pennello: una texture a bassa risoluzione che si scolora piano ────
// r = quantità di colore, gb = direzione del gesto (accumulata con il colore). Ogni fotogramma la
// scia precedente si scolora e deriva appena, e lungo il tratto percorso dal cursore si posano nuovi
// colpi di pennello, irregolari, più larghi dove il gesto è lento.
export const SCIA_F = /* glsl */ `
uniform sampler2D uPrima;
uniform vec2 uRis;      // px della scia
uniform float uScolora;
uniform vec4 uColpi[16]; // xy: centro (px della scia, y in alto), zw: direzione del gesto
uniform float uRaggi[16];
uniform int uN;
float hashS(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float rumS(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashS(i), hashS(i + vec2(1, 0)), f.x), mix(hashS(i + vec2(0, 1)), hashS(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRis;
  // il colore steso deriva appena, come pigmento che si allarga
  vec2 deriva = (vec2(rumS(gl_FragCoord.xy * 0.05), rumS(gl_FragCoord.xy * 0.05 + 9.1)) - 0.5) / uRis * 0.8;
  vec2 px = 1.0 / uRis;
  vec4 c = texture2D(uPrima, uv + deriva);
  // il colore si allarga piano attorno al gesto, come acqua sulla carta: la scia fiorisce
  vec4 media = (texture2D(uPrima, uv + vec2(px.x, 0.0)) + texture2D(uPrima, uv - vec2(px.x, 0.0)) + texture2D(uPrima, uv + vec2(0.0, px.y)) + texture2D(uPrima, uv - vec2(0.0, px.y))) * 0.25;
  c = max(c, media * 0.93) * uScolora;
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec2 d = gl_FragCoord.xy - uColpi[i].xy;
    vec2 dir = normalize(uColpi[i].zw + vec2(1e-4, 0.0));
    // il colpo è un'ellisse allungata nel verso del gesto, dal bordo irregolare
    vec2 q = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x)));
    float r = uRaggi[i] * (0.8 + 0.4 * rumS(gl_FragCoord.xy * 0.18 + float(i) * 3.7));
    float g = exp(-(q.x * q.x / (r * r * 1.9) + q.y * q.y / (r * r)));
    c.r = min(1.0, c.r + g * 0.3);
    c.gb += uColpi[i].zw * g * 0.3;
  }
  c.gb = clamp(c.gb, -1.5, 1.5);
  gl_FragColor = c;
}
`
