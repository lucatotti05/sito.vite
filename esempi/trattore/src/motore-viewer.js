/* Visualizzatore 3D del motore diesel (three.js).
 * Richiede vendor/three-runtime.min.js (three.js 0.170.0 locale). Bundle: vendor/motore-viewer.min.js
 *   esbuild src/motore-viewer.js --bundle --minify --format=iife --outfile=vendor/motore-viewer.min.js
 */
const { THREE, GLTFLoader, OrbitControls } = window.THREE_RT;   // da vendor/three-runtime.min.js

const CYCLE = 6;                       // secondi per 720 gradi a velocita 1x
const ACCENT = new THREE.Color("#A9581F");

/* ---------- Schede dei pezzi ---------- */
const PEZZI = {
  basamento: ["Basamento", "Struttura", "Blocco in ghisa che sostiene cilindro e albero motore. Contiene i supporti di banco, il vano manovella e la camicia d'acqua per il raffreddamento."],
  canna_cilindro: ["Canna del cilindro", "Struttura", "Tubo rettificato in cui scorre il pistone. È riportata nel basamento e bagnata dall'acqua di raffreddamento."],
  testata: ["Testata", "Struttura", "Chiude il cilindro in alto. Ospita i condotti di aspirazione e scarico, le sedi delle valvole e l'iniettore."],
  collettore_aspirazione: ["Collettore di aspirazione", "Alimentazione", "Porta l'aria filtrata al condotto di aspirazione. Nel diesel entra solo aria: il gasolio arriva dall'iniettore."],
  collettore_scarico: ["Collettore di scarico", "Scarico", "Raccoglie i gas combusti espulsi durante la fase di scarico e li porta verso la marmitta."],
  pistone: ["Pistone", "Manovellismo", "Riceve la spinta dei gas e la trasmette alla biella. Nel cielo ha la camera di combustione a omega, dove il gasolio si mescola all'aria compressa."],
  fascia_compressione_1: ["Prima fascia di compressione", "Manovellismo", "Anello elastico che sigilla il pistone contro la canna e trattiene la pressione di combustione."],
  fascia_compressione_2: ["Seconda fascia di compressione", "Manovellismo", "Completa la tenuta ai gas e raschia il velo d'olio residuo."],
  fascia_raschiaolio: ["Fascia raschiaolio", "Manovellismo", "Toglie l'olio in eccesso dalla canna e lo rimanda nel carter, così non brucia in camera di combustione."],
  spinotto: ["Spinotto", "Manovellismo", "Perno cavo che collega il pistone al piede di biella lasciandoli liberi di oscillare."],
  biella: ["Biella", "Manovellismo", "Collega pistone e albero motore: trasforma il moto alterno del pistone in moto rotatorio. Interasse 200 mm."],
  cappello_biella: ["Cappello di biella", "Manovellismo", "Metà inferiore della testa di biella, imbullonata, che si chiude attorno al perno di manovella."],
  albero_motore: ["Albero motore", "Manovellismo", "Ruota grazie alla spinta della biella sul perno di manovella (raggio 57,5 mm, corsa 115 mm). I contrappesi bilanciano le masse rotanti."],
  volano: ["Volano", "Manovellismo", "Disco pesante che accumula energia nella fase attiva e la restituisce nelle altre tre, rendendo regolare la rotazione. La corona dentata serve all'avviamento."],
  ingranaggio_albero_motore: ["Ingranaggio dell'albero motore", "Distribuzione", "Ruota da 20 denti che trascina tutta la distribuzione."],
  ingranaggio_intermedio: ["Ingranaggio intermedio", "Distribuzione", "Rinvio da 20 denti fra albero motore e albero a camme: non cambia il rapporto, mantiene lo stesso verso di rotazione."],
  ingranaggio_distribuzione: ["Ingranaggio della distribuzione", "Distribuzione", "Ruota da 40 denti sull'albero a camme: rapporto 2:1, la camma fa un giro ogni due giri dell'albero motore."],
  albero_a_camme: ["Albero a camme", "Distribuzione", "Le sue camme sollevano le punterie al momento giusto: ogni valvola si apre una volta ogni ciclo (720°)."],
  punteria_aspirazione: ["Punteria di aspirazione", "Distribuzione", "Segue il profilo della camma e trasmette l'alzata all'asta."],
  punteria_scarico: ["Punteria di scarico", "Distribuzione", "Segue il profilo della camma di scarico e trasmette l'alzata all'asta."],
  asta_aspirazione: ["Asta di aspirazione", "Distribuzione", "Asta di spinta che porta il movimento dalla punteria, in basso nel blocco, al bilanciere in testata."],
  asta_scarico: ["Asta di scarico", "Distribuzione", "Asta di spinta fra punteria e bilanciere dello scarico."],
  bilanciere_aspirazione: ["Bilanciere di aspirazione", "Distribuzione", "Leva che ruota sul suo asse: l'asta ne alza un'estremità, l'altra spinge giù la valvola. Rapporto di leva 1,5."],
  bilanciere_scarico: ["Bilanciere di scarico", "Distribuzione", "Leva che apre la valvola di scarico spingendola verso il basso."],
  asse_bilancieri: ["Asse dei bilancieri", "Distribuzione", "Perno fisso con i supporti su cui oscillano i bilancieri."],
  valvola_aspirazione: ["Valvola di aspirazione", "Distribuzione", "Apre il cilindro all'aria: apre 15° prima del PMS e chiude 45° dopo il PMI. Il fungo è più grande di quello di scarico per favorire il riempimento."],
  valvola_scarico: ["Valvola di scarico", "Distribuzione", "Lascia uscire i gas combusti: apre 50° prima del PMI e chiude 15° dopo il PMS."],
  molla_valvola_aspirazione: ["Molla valvola di aspirazione", "Distribuzione", "Richiude la valvola e tiene la punteria a contatto con la camma."],
  molla_valvola_scarico: ["Molla valvola di scarico", "Distribuzione", "Richiude la valvola di scarico quando la camma torna sul cerchio di base."],
  iniettore: ["Iniettore", "Alimentazione", "Spruzza il gasolio ad alta pressione nella camera del pistone poco prima del PMS: l'aria compressa, a oltre 500 °C, lo fa accendere da solo. Nel diesel non c'è candela."],
  gas_cilindro: ["Carica nel cilindro", "Ciclo", "Aria in aspirazione e compressione, gas in combustione e scarico. Il colore segue la fase."],
};

const STRUTTURA = ["basamento", "testata", "canna_cilindro", "collettore_aspirazione", "collettore_scarico"];

/* Vista esplosa: spostamenti (m, assi three: X destra, Y su, Z verso chi guarda) */
const ESPLOSO = {
  testata: [0, 0.16, 0], collettore_aspirazione: [-0.08, 0.16, 0], collettore_scarico: [-0.08, 0.16, 0],
  valvola_aspirazione: [0, 0.07, 0], valvola_scarico: [0, 0.07, 0],
  molla_valvola_aspirazione: [0, 0.24, 0], molla_valvola_scarico: [0, 0.24, 0],
  bilanciere_aspirazione: [0, 0.31, 0], bilanciere_scarico: [0, 0.31, 0], asse_bilancieri: [0, 0.31, 0],
  iniettore: [-0.03, 0.34, 0],
  pistone: [0, 0.03, 0.17], fascia_compressione_1: [0, 0.07, 0], fascia_compressione_2: [0, 0.05, 0],
  fascia_raschiaolio: [0, 0.03, 0], spinotto: [0, 0, 0.07],
  biella: [0, -0.02, 0.17], cappello_biella: [0, -0.05, 0],
  albero_motore: [0, -0.16, 0], volano: [0, 0, -0.09], ingranaggio_albero_motore: [0, 0, 0.07],
  albero_a_camme: [0.12, 0, 0], ingranaggio_distribuzione: [0, 0, 0.06], ingranaggio_intermedio: [0.05, -0.08, 0.1],
  punteria_aspirazione: [0.12, 0.03, 0], punteria_scarico: [0.12, 0.03, 0],
  asta_aspirazione: [0.14, 0.1, 0], asta_scarico: [0.14, 0.1, 0],
};

/* ---------- Fasi del ciclo (gradi di manovella) ---------- */
const FASI = [
  { id: "asp", nome: "Aspirazione", da: 0, a: 180 },
  { id: "com", nome: "Compressione", da: 180, a: 350 },
  { id: "sco", nome: "Iniezione e scoppio", da: 350, a: 390 },
  { id: "esp", nome: "Espansione", da: 390, a: 540 },
  { id: "sca", nome: "Scarico", da: 540, a: 720 },
];
const C_ASP = new THREE.Color("#8FBFDE"), C_COM = new THREE.Color("#3E5C76"),
      C_SCO = new THREE.Color("#E0521C"), C_SCA = new THREE.Color("#8C8577");
function gasColor(th, out) {
  if (th < 180) return out.copy(C_ASP);
  if (th < 350) return out.copy(C_ASP).lerp(C_COM, (th - 180) / 170);
  if (th < 390) return out.copy(C_COM).lerp(C_SCO, Math.min(1, (th - 350) / 12));
  if (th < 540) return out.copy(C_SCO).lerp(C_SCA, (th - 390) / 150);
  return out.copy(C_SCA);
}
const faseDi = (th) => FASI.find((f) => th >= f.da && th < f.a) || FASI[0];

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

/* ---------- Visualizzatore ---------- */
function initViewer(root) {
  const $ = (s) => root.querySelector(s);
  const stage = $(".mv-stage"), canvasHost = $(".mv-canvas"), poster = $(".mv-poster");
  const bar = $(".mv-progress i"), errBox = $(".mv-error");
  const btnPlay = $("#mvPlay"), btnExpl = $("#mvExplode"), btnXray = $("#mvXray"), btnReset = $("#mvReset");
  const hudFase = $("#mvFase"), hudAng = $("#mvAngolo");
  const card = $(".mv-card"), cardT = $("#mvNome"), cardG = $("#mvGruppo"), cardF = $("#mvFunzione");
  const faseList = root.querySelectorAll(".mv-fasi li");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = window.__motore = { loaded: false, loadMs: null, playing: false, t: 0, speed: 1, exploded: false, xray: false, selected: null, frames: 0 };

  let renderer, scene, camera, controls, mixer, action, model;
  const nodes = {}, applied = {}, meshes = [], origMat = new Map();
  let explodeK = 0, visible = true, started = false, t0 = 0;

  function setPlaying(v) {
    state.playing = v;
    btnPlay.innerHTML = (v ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>Pausa'
                           : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>Play');
    btnPlay.setAttribute("aria-pressed", v);
  }
  setPlaying(false);

  async function start() {
    if (started) return; started = true;
    errBox.hidden = true; root.classList.remove("is-error"); root.classList.add("is-loading");
    t0 = performance.now();
    try {
      const buf = await fetchGlb(root.dataset.model, (p) => { bar.style.transform = `scaleX(${p})`; });
      const gltf = await new GLTFLoader().parseAsync(buf, "");
      setup(gltf);
      state.loaded = true; state.loadMs = Math.round(performance.now() - t0); state.readyAt = Math.round(performance.now());
      root.classList.remove("is-loading"); root.classList.add("is-ready");
      if (!reduce) setPlaying(true);
    } catch (e) {
      console.error(e);
      started = false;
      root.classList.remove("is-loading"); root.classList.add("is-error"); errBox.hidden = false;
    }
  }

  function setup(gltf) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    canvasHost.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfffdf7, 0x4a4438, 1.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-0.6, 1.2, 1.0); scene.add(key);
    const rim = new THREE.DirectionalLight(0xdde8f0, 1.0); rim.position.set(0.8, 0.4, -0.8); scene.add(rim);

    model = gltf.scene; scene.add(model);
    model.traverse((o) => {
      if (!o.name) return;
      nodes[o.name] = o;
      if (o.isMesh) {
        o.userData.pezzo = o.name;
        meshes.push(o); origMat.set(o, o.material);
        if (STRUTTURA.includes(o.name)) { o.material = o.material.clone(); origMat.set(o, o.material); }
      }
    });
    const gas = nodes.gas_cilindro;
    gas.material = new THREE.MeshStandardMaterial({ color: C_ASP, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false });
    origMat.set(gas, gas.material); gas.renderOrder = 2;
    nodes.iniettore.material = nodes.iniettore.material.clone(); origMat.set(nodes.iniettore, nodes.iniettore.material);

    mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations.find((a) => a.name === "ciclo_4_tempi") || gltf.animations[0];
    action = mixer.clipAction(clip); action.play();

    const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
    camera = new THREE.PerspectiveCamera(36, 1, 0.01, 20);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.35; controls.maxDistance = 2.6;
    controls.target.copy(c); controls.userData = { home: c.clone() };
    resetView();
    new ResizeObserver(resize).observe(stage); resize();

    // tocco su un pezzo (distinto dalla rotazione)
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
      down = null;
      if (moved < 7 && dt < 500) pick(e.clientX, e.clientY);
    });
    state.screenOf = (name) => {
      const v = new THREE.Box3().setFromObject(nodes[name]).getCenter(new THREE.Vector3()).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    };
    requestAnimationFrame(loop);
  }

  function resetView() {
    const c = controls.userData.home.clone(); c.y += 0.09 * explodeK;
    const dir = new THREE.Vector3(-0.47, 0.25, 0.85).normalize();
    const narrow = stage.clientWidth / Math.max(1, stage.clientHeight) < 0.8;
    camera.position.copy(c).addScaledVector(dir, (narrow ? 1.75 : 1.35) * (1 + 0.6 * explodeK));
    controls.target.copy(c); controls.update();
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const cand = meshes.filter((m) => m.visible && m.name !== "gas_cilindro" && !(state.xray && STRUTTURA.includes(m.name)));
    const hit = ray.intersectObjects(cand, false)[0];
    select(hit ? hit.object : null);
  }

  function select(mesh) {
    if (state.selected) state.selected.material = origMat.get(state.selected);
    state.selected = mesh || null;
    root.classList.toggle("has-sel", !!mesh);
    if (!mesh) { cardT.textContent = "Tocca un pezzo"; cardG.textContent = "Guida"; cardF.textContent = "Tocca un componente nella scena per vederne nome e funzione. Trascina per ruotare, pizzica o usa la rotellina per lo zoom."; return; }
    const m = origMat.get(mesh).clone();
    m.emissive = ACCENT.clone(); m.emissiveIntensity = 0.45; m.color = m.color.clone().lerp(ACCENT, 0.35);
    if (m.transparent && STRUTTURA.includes(mesh.name)) m.opacity = Math.max(m.opacity, 0.5);
    mesh.material = m;
    const [nome, gruppo, funzione] = PEZZI[mesh.name] || [mesh.name, "", ""];
    cardT.textContent = nome; cardG.textContent = gruppo; cardF.textContent = funzione;
    const sh = $(".mv-sheet"); sh.querySelector(".g").textContent = gruppo; sh.querySelector("h3").textContent = nome; sh.querySelector(".f").textContent = funzione;
  }
  $(".mv-card-close").addEventListener("click", () => select(null));

  function setXray(v) {
    if (!model) return;
    state.xray = v; btnXray.setAttribute("aria-pressed", v);
    for (const n of STRUTTURA) {
      const mesh = nodes[n], m = origMat.get(mesh);
      m.transparent = v; m.opacity = v ? 0.16 : 1; m.depthWrite = !v; m.needsUpdate = true;
      if (state.selected === mesh) select(mesh);
    }
  }

  const col = new THREE.Color();
  let last = performance.now(), lastFase = "";
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!visible) return;
    if (state.playing) state.t = (state.t + dt * state.speed) % CYCLE;
    // togli l'offset dell'esploso applicato al fotogramma prima: il mixer riscrive
    // i valori solo quando cambiano, quindi non si puo contare su di lui per azzerarli
    for (const n in applied) nodes[n].position.sub(applied[n]);
    action.time = state.t; mixer.update(0);

    // vista esplosa con transizione
    const target = state.exploded ? 1 : 0, prevK = explodeK;
    explodeK += (target - explodeK) * Math.min(1, dt * 7);
    if (Math.abs(target - explodeK) < 1e-3) explodeK = target;
    if (explodeK !== prevK) {                    // allarga l'inquadratura mentre il modello si apre
      const dk = explodeK - prevK, off = camera.position.clone().sub(controls.target);
      controls.target.y += 0.09 * dk;
      off.multiplyScalar((1 + 0.6 * explodeK) / (1 + 0.6 * prevK));
      camera.position.copy(controls.target).add(off);
    }
    for (const n in ESPLOSO) {
      const o = nodes[n]; if (!o) continue;
      const d = ESPLOSO[n], v = (applied[n] ||= new THREE.Vector3());
      v.set(d[0], d[1], d[2]).multiplyScalar(explodeK);
      o.position.add(v);
    }
    nodes.gas_cilindro.visible = explodeK < 0.05;

    // fase, colore del gas, iniettore acceso durante l'iniezione
    const th = (state.t / CYCLE) * 720;
    gasColor(th, nodes.gas_cilindro.material.color);
    const inj = origMat.get(nodes.iniettore);
    inj.emissive.setRGB(1, 0.45, 0.1); inj.emissiveIntensity = th > 345 && th < 372 ? 0.9 : 0;
    const f = faseDi(th);
    hudAng.textContent = Math.floor(th) + "°";
    if (f.id !== lastFase) {
      lastFase = f.id; hudFase.textContent = f.nome;
      faseList.forEach((li) => li.classList.toggle("on", li.dataset.f === f.id));
    }
    controls.update();
    renderer.render(scene, camera);
    state.frames++;
  }

  btnPlay.addEventListener("click", () => { start(); setPlaying(!state.playing); });
  btnExpl.addEventListener("click", () => { state.exploded = !state.exploded; btnExpl.setAttribute("aria-pressed", state.exploded); });
  btnXray.addEventListener("click", () => setXray(!state.xray));
  btnReset.addEventListener("click", () => { if (controls) resetView(); });
  root.querySelectorAll(".mv-speed button").forEach((b) => b.addEventListener("click", () => {
    state.speed = +b.dataset.v;
    root.querySelectorAll(".mv-speed button").forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", on); });
  }));
  $(".mv-retry").addEventListener("click", start);

  // carica solo quando la sezione si avvicina; disegna solo quando e visibile
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) start(); }, { rootMargin: "400px" }).observe(root);
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(stage);
  select(null);
}

document.querySelectorAll("[data-motore-viewer]").forEach(initViewer);
