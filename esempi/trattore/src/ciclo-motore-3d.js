/* Scena 3D della pagina "Il ciclo a quattro tempi" (ciclo-motore.html).
 * Nessuna animazione propria: l'angolo di manovella arriva dalla pagina (scroll o cursore)
 * con setAngle(θ) e la scena si ridisegna solo quando θ cambia ed è visibile.
 * Richiede vendor/three-runtime.min.js (three.js 0.170.0 locale). Bundle:
 *   esbuild src/ciclo-motore-3d.js --bundle --minify --format=iife --outfile=vendor/ciclo-motore-3d.min.js
 */
const { THREE, GLTFLoader } = window.THREE_RT;

const CLIP_S = 6;                  // il clip ciclo_4_tempi dura 6 s per 720°

/* ---------- Fasatura ----------
 * Il clip del .glb apre le valvole quasi nei punti morti (aspirazione ≈ −3°→213°,
 * scarico ≈ 506°→723°). La pagina usa una fasatura tipica: il treno valvole
 * (punteria, asta, bilanciere, valvola, molla) viene campionato dal clip con il tempo
 * "stirato", così la forma dell'alzata resta quella del modello. */
const TRENO = (lato) => [`punteria_${lato}`, `asta_${lato}`, `bilanciere_${lato}`, `valvola_${lato}`, `molla_valvola_${lato}`];
const CLIP_ASP = { c: 105, h: 108, chiusa: 400 };      // centro e semiampiezza nel clip (gradi)
const CLIP_SCA = { c: 614.5, h: 108.5, chiusa: 250 };

function stira(th, apre, chiude, clip) {
  const c = (apre + chiude) / 2, h = (chiude - apre) / 2;
  let d = th - c;
  if (d > 360) d -= 720; else if (d < -360) d += 720;
  return Math.abs(d) < h ? clip.c + d * (clip.h / h) : clip.chiusa;
}

/* ---------- Colori della carica (DESIGN.md §7) ---------- */
const C_ASP = new THREE.Color("#8FBFDE"), C_COM = new THREE.Color("#3E5C76"),
      C_SCO = new THREE.Color("#E0521C"), C_SCA = new THREE.Color("#8C8577");
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function gasColor(th, F, out) {
  if (th < F.IVC) return out.copy(C_ASP);
  if (th < F.SOC) return out.copy(C_ASP).lerp(C_COM, smooth(F.IVC, F.SOC - 20, th));
  if (th < 380) return out.copy(C_COM).lerp(C_SCO, smooth(F.SOC, F.SOC + 8, th));
  if (th < 690) return out.copy(C_SCO).lerp(C_SCA, smooth(380, F.EVO + 30, th));
  return out.copy(C_SCA).lerp(C_ASP, smooth(690, 720, th));
}

/* ---------- Caricamento del .glb (http oppure file:// tramite script base64) ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("script " + src));
    document.head.appendChild(s);
  });
}
async function fetchGlb(url, onProgress) {
  if (location.protocol !== "file:") {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const total = +r.headers.get("content-length") || 0;
    if (!r.body || !total) return r.arrayBuffer();
    const reader = r.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(got / total);
    }
    const buf = new Uint8Array(got); let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
    return buf.buffer;
  }
  await loadScript(url + ".js");                           // definisce window.MOTORE_GLB_B64
  const bin = atob(window.MOTORE_GLB_B64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  onProgress(1);
  return buf.buffer;
}

/* ---------- Getto di gasolio: 4 coni dall'ugello verso la camera a omega ---------- */
function makeSpray() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xE9B654, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const LEN = 0.027, ALFA = THREE.MathUtils.degToRad(70);         // semiangolo del cono di getti 70°
  const geo = new THREE.ConeGeometry(0.0034, LEN, 14, 1, true);
  geo.translate(0, -LEN / 2, 0);                                  // vertice sull'ugello, getto verso −y
  const giu = new THREE.Vector3(0, -1, 0);
  for (let k = 0; k < 4; k++) {
    const phi = k * Math.PI / 2;
    const dir = new THREE.Vector3(Math.sin(ALFA) * Math.cos(phi), -Math.cos(ALFA), Math.sin(ALFA) * Math.sin(phi));
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromUnitVectors(giu, dir);
    m.renderOrder = 3;
    g.add(m);
  }
  g.userData.mat = mat;
  return g;
}

/* ---------- Scena ---------- */
export function init(root, opts = {}) {
  const F = Object.assign({ IVO: -15, IVC: 225, SOI: 345, SOC: 353, EOI: 370, EVO: 490, EVC: 735 }, opts.fasi);
  const host = root.querySelector(".cm-canvas");
  const state = window.__ciclo = { loaded: false, loadMs: null, th: 0, frames: 0 };
  let renderer, scene, camera, model, mixer, aBase, aAsp, aSca, spray, gasMat, injMat;
  const nodes = {};
  let visible = true, dirty = true, raf = 0, th = 0;

  const phone = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
  const maxDpr = phone ? 1.5 : 2;

  function setup(gltf) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfffdf7, 0x4a4438, 1.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-1.0, 1.2, 0.8); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdde8f0, 1.0); rim.position.set(0.8, 0.4, -0.8); scene.add(rim);

    model = gltf.scene; scene.add(model);
    model.traverse((o) => { if (o.name) nodes[o.name] = o; });

    // testata semitrasparente: le due valvole e i condotti restano visibili
    const t = nodes.testata;
    t.material = t.material.clone();
    Object.assign(t.material, { transparent: true, opacity: 0.26, depthWrite: false });
    t.renderOrder = 4;

    gasMat = new THREE.MeshStandardMaterial({ color: C_ASP, transparent: true, opacity: 0.6, roughness: 0.9, depthWrite: false, emissive: 0xE0521C, emissiveIntensity: 0 });
    nodes.gas_cilindro.material = gasMat; nodes.gas_cilindro.renderOrder = 2;
    injMat = nodes.iniettore.material = nodes.iniettore.material.clone();
    injMat.emissive = new THREE.Color(1, 0.45, 0.1);

    // getto: sulla punta dell'ugello, in coordinate del mondo (l'iniettore è inclinato di 8°)
    spray = makeSpray();
    nodes.iniettore.updateWorldMatrix(true, false);
    spray.position.setFromMatrixPosition(nodes.iniettore.matrixWorld);
    spray.position.y -= 0.0008;
    scene.add(spray);

    // tre azioni sullo stesso clip: manovellismo, treno aspirazione, treno scarico
    const clip = gltf.animations.find((a) => a.name === "ciclo_4_tempi") || gltf.animations[0];
    const asp = TRENO("aspirazione"), sca = TRENO("scarico");
    const part = (name, keep) => new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((tr) => keep(tr.name.split(".")[0])));
    mixer = new THREE.AnimationMixer(model);
    aBase = mixer.clipAction(part("base", (n) => !asp.includes(n) && !sca.includes(n)));
    aAsp = mixer.clipAction(part("asp", (n) => asp.includes(n)));
    aSca = mixer.clipAction(part("sca", (n) => sca.includes(n)));
    for (const a of [aBase, aAsp, aSca]) a.play();

    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
    new ResizeObserver(resize).observe(root); resize();
    new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) request(); }).observe(root);
  }

  /* Inquadratura fissa di tre quarti, adattata al riquadro: tutti gli spigoli del modello
   * restano dentro il campo visivo con un piccolo margine. */
  const box = new THREE.Box3(), DIR = new THREE.Vector3(-0.62, 0.2, 0.76).normalize();
  function frame() {
    applyAngle(0);                           // inquadra con il pistone al PMS (massimo ingombro in alto)
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, DIR).normalize();
    const camUp = new THREE.Vector3().crossVectors(DIR, right).normalize();
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th2 = tv * camera.aspect, m = 0.9;
    let d = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const z = p.dot(DIR);
      d = Math.max(d, z + Math.abs(p.dot(right)) / (th2 * m), z + Math.abs(p.dot(camUp)) / (tv * m));
    }
    camera.position.copy(c).addScaledVector(DIR, d);
    camera.lookAt(c);
    applyAngle(th);
  }

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    frame(); request();
  }

  function applyAngle(a) {
    aBase.time = (a / 720) * CLIP_S;
    aAsp.time = (stira(a, F.IVO, F.IVC, CLIP_ASP) / 720) * CLIP_S;
    aSca.time = (stira(a, F.EVO, F.EVC, CLIP_SCA) / 720) * CLIP_S;
    mixer.update(0);

    gasColor(a, F, gasMat.color);
    // bagliore proporzionale alla velocità di combustione: sale dopo l'accensione, poi si spegne
    gasMat.emissiveIntensity = a > F.SOC && a < 450 ? 0.9 * smooth(F.SOC, F.SOC + 7, a) * (1 - smooth(F.SOC + 10, 450, a)) : 0;

    // iniezione: il getto cresce in 3°, resta fino a fine iniezione e si dissolve in 4°
    const on = a >= F.SOI && a < F.EOI + 4;
    spray.visible = on;
    if (on) {
      const grow = smooth(F.SOI, F.SOI + 3, a), fade = 1 - smooth(F.EOI, F.EOI + 4, a);
      spray.scale.set(1, 0.25 + 0.75 * grow, 1);
      spray.userData.mat.opacity = 0.85 * fade;
    }
    injMat.emissiveIntensity = on ? 0.8 : 0;

    // in sola lettura, per le verifiche: corsa del pistone dal PMS e alzate delle valvole (mm)
    state.pistoneMm = Math.round((0.2575 - nodes.pistone.position.y) * 1e4) / 10;
    state.alzataAspMm = Math.round((0.3233 - nodes.valvola_aspirazione.position.y) * 1e4) / 10;
    state.alzataScaMm = Math.round((0.3233 - nodes.valvola_scarico.position.y) * 1e4) / 10;
    state.getto = on;
  }

  function draw() {
    raf = 0;
    if (!visible || !renderer) return;
    if (dirty) { applyAngle(th); dirty = false; }
    renderer.render(scene, camera);
    state.frames++;
  }
  function request() { if (!raf) raf = requestAnimationFrame(draw); }

  const api = {
    setAngle(a) {
      a = ((a % 720) + 720) % 720;
      if (a === th && !dirty) return;
      th = state.th = a; dirty = true;
      if (renderer) request();
    },
  };

  const t0 = performance.now();
  (async () => {
    const buf = await fetchGlb(root.dataset.model, opts.onProgress || (() => {}));
    const gltf = await new GLTFLoader().parseAsync(buf, "");
    setup(gltf);
    dirty = true; draw();
    state.loaded = true; state.loadMs = Math.round(performance.now() - t0);
    opts.onReady && opts.onReady();
  })().catch((e) => { console.error(e); opts.onError && opts.onError(e); });

  return api;
}

window.CicloMotore3D = { init };
