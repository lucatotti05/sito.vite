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
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vProf = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
export const TERRA_F = /* glsl */ `
uniform vec3 uLuce;
uniform float uAlfa;
varying float vProf;
${LANTERNA}
void main() {
  float l = lanterna(gl_FragCoord.xy) * exp(-vProf * 0.08) * uAlfa;
  gl_FragColor = vec4(uLuce * l * 0.16, 0.0);
}
`

// ── pannelli curvi ──────────────────────────────────────────────────────
export const PANNELLO_V = /* glsl */ `
uniform vec2 uDim;
uniform float uCurva;
uniform float uPiega;
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vec3 p = vec3(position.x * uDim.x, position.y * uDim.y, 0.0);
  // il foglio si incurva attorno a un asse verticale: i bordi vengono verso chi guarda
  float k = uCurva;
  if (abs(k) > 1e-4) {
    float a = p.x * k;
    p.z = (1.0 - cos(a)) / k;
    p.x = sin(a) / k;
  }
  // con la velocità il foglio si piega anche in altezza, come carta che fende l'aria
  float y = position.y * 2.0;
  p.z += uPiega * (1.0 - y * y) * uDim.y * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
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
varying vec2 vUv;
${LANTERNA}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rumore(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec4 campiona(sampler2D t, vec4 crop, vec2 uv) { return texture2D(t, crop.xy + uv * crop.zw); }

void main() {
  vec2 uvA = vUv + uSposta;
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
  vec3 col = mix(uFondo, c.rgb, c.a);
  // il pannello centrale è più luminoso: gli altri affondano nel fondo
  col = mix(uFondo, col, uLuce);
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
  // fuoco della tastiera: un filetto di 1px in oro attorno al foglio
  if (uFocus > 0.0) {
    vec2 b = min(vUv, 1.0 - vUv) / uBordo;
    if (min(b.x, b.y) < 1.6) col = mix(col, uOro, uFocus);
  }
  // la lanterna scalda la carta sotto il cursore
  float l = lanterna(gl_FragCoord.xy);
  col += uLuceCol * l * (0.10 + 0.35 * dot(col, vec3(0.3, 0.5, 0.2)));
  gl_FragColor = vec4(col * uAlfa, uAlfa);
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
${LANTERNA}

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
    if (uFilmAlfa > 0.001) {
      vec2 uv = (P - uQuadro.xy) / uQuadro.zw;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        vec3 col = max(texture2D(uFilm, uv).rgb, uNero); // il nero della clip è il nero del sito
        vec2 c = uMaschera.xy;
        float diag = length(uQuadro.zw);
        float v = smoothstep(min(uQuadro.z, uQuadro.w) * 0.3, diag * 0.62, distance(P, c));
        col = mix(col, uNero, 0.55 * v);
        float a = 1.0;
        // i bordi del fotogramma che cadono dentro lo schermo sfumano (sotto c'è la vite)
        float sf = min(uQuadro.z, uQuadro.w) * 0.16;
        if (uQuadro.x > 0.5) a *= smoothstep(0.0, sf, P.x - uQuadro.x);
        if (uQuadro.x + uQuadro.z < uRis.x - 0.5) a *= smoothstep(0.0, sf, uQuadro.x + uQuadro.z - P.x);
        if (uQuadro.y > 0.5) a *= smoothstep(0.0, sf, P.y - uQuadro.y);
        if (uQuadro.y + uQuadro.w < uRis.y - 0.5) a *= smoothstep(0.0, sf, uQuadro.y + uQuadro.w - P.y);
        // maschera radiale sfumata sul soggetto
        if (uMascheraOn > 0.5) a *= 1.0 - smoothstep(uMaschera.z, uMaschera.z * 1.45, distance(P, c));
        a *= uFilmAlfa;
        acc = sopra(vec4(col * a, a), acc);
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
