/* Scena 3D della simulazione "Il trattore in campo" (three.js).
 * Solo grafica: percorso, fasi, calcoli e popup restano nello script di index.html,
 * che espone window.__sim e chiama scene.render() a ogni fotogramma.
 * Richiede vendor/three-runtime.min.js. Bundle: vendor/trattore-scene.min.js
 *   esbuild src/trattore-scene.js --bundle --minify --format=iife --outfile=vendor/trattore-scene.min.js
 */
const { THREE, GLTFLoader } = window.THREE_RT;

const U = 0.04;                    // 1 unità della simulazione = 4 cm
const WB = 2.10, KP = 1.20;        // passo e distanza fra i perni fuso [m]
const R_POST = 0.725, R_ANT = 0.50, R_SPR = 0.32, R_IDL = 0.26;
const GAUGE = 1.50;
const V_REF = 7.2;                 // km/h a cui il rotolamento coincide con lo spostamento a schermo
const PTO_VIS = 1.5 * 2 * Math.PI; // giri/s mostrati per la p.d.p. (540 giri/min, rallentata per leggibilità)

const SUOLO = ["#B49A74", "#8FA86E", "#CDB985", "#86694D", "#6A5644"];   // colore per tipo di terreno
const SUOLO_RUVIDO = [0.95, 0.95, 0.95, 0.98, 0.55];
const FORZE = { Fa: "#2E8B4F", Fra: "#6B6456", Fu: "#D8541C", M: "#3E5C76" };
const ETICHETTE = { Fa: "<span><i>F</i><sub>a</sub></span>", Fra: "<span><i>F</i><sub>ra</sub></span>",
                    Fu: "<span><i>F</i><sub>u</sub></span>", M: "<span><i>M</i></span>" };
/* inquadratura per fase: più vicina durante la lavorazione, più ampia quando compaiono le frecce */
const DIST_FASE = { "Avvicinamento in piano": 1.0, "Salita, aderenza sotto sforzo": 1.08, "Curva in pendenza": 1.12,
                    "Lavorazione con presa di potenza": 0.84, "Rientro in discesa": 1.0 };

/* ---------- caricamento del .glb (http oppure file:// con copia base64) ---------- */
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function fetchGlb(url) {
  if (location.protocol !== "file:") {
    const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status);
    return r.arrayBuffer();
  }
  await loadScript(url + ".js");
  const bin = atob(window.TRATTORE_GLB_B64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function webglOk() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch (e) { return false; }
}

async function init() {
  const sim = window.__sim;
  const stage = document.getElementById("stageWrap");
  if (!sim || !stage || !webglOk()) return;               // resta la versione SVG
  const t0 = performance.now();
  const gltf = await new GLTFLoader().parseAsync(await fetchGlb("models/trattore.glb"), "");

  /* ---------- renderer e scena ---------- */
  const host = document.createElement("div"); host.className = "sim-canvas";
  stage.insertBefore(host, stage.firstChild);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdcebe9, 45, 120);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x6b7a4e, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const lambert = (c, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.95, metalness: 0 }, extra || {}));

  /* ---------- terreno: piano + salita incernierata dove inizia la salita di pathAt() ---------- */
  const FLAT = sim.FLAT_LEN * 0.85 * U;         // pathAt() comincia a salire a 0,85 · FLAT_LEN
  const SLOPE = sim.SLOPE_LEN * U, W = sim.FIELD_W * U;
  const soilMat = lambert(SUOLO[0]);
  const grass = lambert("#AFC495"), vineMat = lambert("#6E8F55"), postMat = lambert("#7A6A55"),
        cypMat = lambert("#2C4A2A"), wallMat = lambert("#E8DCC0"), roofMat = lambert("#8B3F2B"),
        winMat = lambert("#3A362E"), sideMat = lambert("#7D6446");

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), grass);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -40); ground.receiveShadow = true; scene.add(ground);
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(W, FLAT + 2), soilMat);
  flat.rotation.x = -Math.PI / 2; flat.position.set(0, 0, -(FLAT - 2) / 2); flat.receiveShadow = true; scene.add(flat);

  const slope = new THREE.Group(); slope.position.set(0, 0, -FLAT); scene.add(slope);
  const slopeSurf = new THREE.Mesh(new THREE.PlaneGeometry(W, SLOPE), soilMat);
  slopeSurf.rotation.x = -Math.PI / 2; slopeSurf.position.z = -SLOPE / 2; slopeSurf.receiveShadow = true; slope.add(slopeSurf);
  // fianchi della collina (triangoli aggiornati con la pendenza)
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(36).fill(0), 3));
  const sides = new THREE.Mesh(sideGeo, sideMat); scene.add(sides);
  const plateau = new THREE.Group(); scene.add(plateau);
  const plateauTop = new THREE.Mesh(new THREE.BoxGeometry(W + 30, 1, 30), grass);
  plateauTop.position.set(0, -0.5, -15); plateauTop.receiveShadow = true; plateau.add(plateauTop);

  // filari di vite ai lati della corsia di lavoro (il trattore passa fra x = -1,7 e x = 3,5 m)
  const ROWS = [-2.3, -4.7, 4.3, 6.1].filter((x) => Math.abs(x) < W / 2);
  function vineRows(len, parent) {
    const g = new THREE.Group();
    for (const x of ROWS) {
      for (let z = 0.7; z + 3.2 < len; z += 4) {                      // chioma fra un palo e l'altro
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 3.3), vineMat);
        canopy.position.set(x, 1.15, -z - 1.8); g.add(canopy);
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.07), postMat);
        trunk.position.set(x, 0.37, -z - 1.8); g.add(trunk);
      }
      for (let z = 0.5; z < len; z += 4) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), postMat);
        post.position.set(x, 0.85, -z); g.add(post);
      }
    }
    parent.add(g); return g;
  }
  vineRows(FLAT, scene).position.z = 0;
  vineRows(SLOPE, slope);

  /* oggetti che possono coprire il trattore: sfumano quando stanno fra la camera e il trattore */
  const occluders = [];
  function fadeable(obj, mats, samples, radius) {
    for (const m of mats) { m.transparent = true; m.opacity = 1; }
    occluders.push({ obj, mats, samples, radius, k: 1 });
  }
  function cypress(h, x, z, parent) {
    const mat = cypMat.clone();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.75, h, 8), mat);
    c.position.set(x, h / 2, z); (parent || scene).add(c);
    fadeable(c, [mat], [new THREE.Vector3(0, -h * 0.3, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.3, 0)], 1.4);
  }
  for (let i = 0; i < 6; i++) {
    const z = -1.2 - i * 2.4;
    cypress(7 + (i * 13) % 5 * 0.4, -W / 2 - 1.1, z);
    cypress(7 + (i * 17) % 5 * 0.4, W / 2 + 1.1, z);
  }
  // casale sulla collina
  function house(w, h, d, x, z, rot) {
    const g = new THREE.Group();
    const wm = wallMat.clone(), rm = roofMat.clone(), nm = winMat.clone();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wm); body.position.y = h / 2; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.05, h * 0.45, 4, 1), rm);
    roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
    roof.position.y = h + h * 0.225; g.add(roof);
    for (let k = -1; k <= 1; k++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.05), nm);
      win.position.set(k * w / 3.2, h * 0.6, d / 2 + 0.02); g.add(win);
    }
    g.position.set(x, 0, z); g.rotation.y = rot; plateau.add(g);
    const S3 = [];
    for (const sx of [-0.35, 0, 0.35]) for (const sz of [-0.35, 0, 0.35]) S3.push(new THREE.Vector3(sx * w, h * 0.6, sz * d));
    fadeable(g, [wm, rm, nm], S3, Math.max(w, d) * 0.45);
  }
  house(6.5, 4.2, 5, -2.6, -4.5, 0.35);
  house(4.6, 3.4, 4, 3.2, -5.2, -0.17);
  cypress(8.5, -7.5, -3.2, plateau); cypress(9.2, 7.8, -3.4, plateau);
  // colline lontane
  for (const [x, z, r, h] of [[-40, -70, 30, 9], [10, -95, 38, 12], [55, -75, 30, 8], [-70, -40, 25, 6], [70, -30, 25, 7]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert("#9DB88A"));
    m.scale.y = h / r; m.position.set(x, -0.1, z); scene.add(m);
  }

  let curI = null, curTerr = null;
  function updateTerrain(iPct, terrIdx) {
    if (iPct !== curI) {
      curI = iPct;
      const a = Math.atan(iPct / 100);
      slope.rotation.x = a;
      const topY = SLOPE * Math.sin(a), topZ = -FLAT - SLOPE * Math.cos(a);
      plateau.position.set(0, topY, topZ);
      const p = sideGeo.attributes.position;
      let k = 0;
      for (const sx of [-W / 2, W / 2]) {
        const tri = [[sx, 0, -FLAT], [sx, topY, topZ], [sx, 0, topZ]];
        const ord = sx < 0 ? [0, 1, 2] : [0, 2, 1];
        for (const o of ord) { p.setXYZ(k++, ...tri[o]); }
        for (const o of ord) { p.setXYZ(k++, ...tri[o]); }
      }
      p.needsUpdate = true; sideGeo.computeVertexNormals(); sideGeo.computeBoundingSphere();
      sideMat.side = THREE.DoubleSide;
    }
    if (terrIdx !== curTerr) {
      curTerr = terrIdx;
      soilMat.color.set(SUOLO[terrIdx] || SUOLO[0]); soilMat.roughness = SUOLO_RUVIDO[terrIdx] ?? 0.95;
    }
  }
  function heightAt(z) {
    const a = Math.atan(curI / 100);
    if (z > -FLAT) return 0;
    const d = Math.min((-FLAT - z) / Math.cos(a), SLOPE);
    return d * Math.sin(a);
  }

  /* ---------- trattore ---------- */
  const model = gltf.scene;
  const N = {}; model.traverse((o) => { if (o.name) N[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const tractor = new THREE.Group(); tractor.add(model); scene.add(tractor);
  if (N.fari) N.fari.material = Object.assign(N.fari.material.clone(), { emissive: new THREE.Color("#FFE9A8"), emissiveIntensity: 0.6 });
  const baseQ = {}; for (const n of ["volante", "cardano"]) baseQ[n] = N[n].quaternion.clone();

  // maglie del cingolo: una geometria ripetuta lungo il percorso salvato nel .glb
  const pathNode = N.percorso_cingolo, ex = pathNode.userData;
  const flatPts = ex.punti_yz, loopLen = ex.lunghezza, nShoe = ex.maglie;
  const P = []; for (let i = 0; i < flatPts.length; i += 2) P.push(new THREE.Vector2(-flatPts[i], flatPts[i + 1]));   // (z, y) in three
  const cum = [0]; for (let i = 1; i <= P.length; i++) cum.push(cum[i - 1] + P[i - 1].distanceTo(P[i % P.length]));
  const total = cum[P.length];
  const cen = P.reduce((a, b) => a.clone().add(b), new THREE.Vector2()).multiplyScalar(1 / P.length);
  function along(s, outP, outT) {
    s = ((s % total) + total) % total;
    let lo = 0, hi = P.length;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = P[lo], b = P[(lo + 1) % P.length], f = (s - cum[lo]) / (cum[lo + 1] - cum[lo]);
    outP.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f); outT.set(b.x - a.x, b.y - a.y).normalize();
  }
  // verso di marcia: sul tratto a terra le maglie devono andare indietro (+z) quando il trattore avanza
  const tp = new THREE.Vector2(), tt = new THREE.Vector2();
  let lowest = 0; for (let i = 1; i < P.length; i++) if (P[i].y < P[lowest].y) lowest = i;
  along(cum[lowest], tp, tt); const trackDir = tt.x > 0 ? 1 : -1;
  const shoeSrc = N.maglia_cingolo; shoeSrc.visible = false;
  const shoes = new THREE.InstancedMesh(shoeSrc.geometry, shoeSrc.material, nShoe * 2);
  shoes.castShadow = true; shoes.frustumCulled = false; model.add(shoes);
  const shoeOff = [0, 0];
  const m4 = new THREE.Matrix4(), bx = new THREE.Vector3(1, 0, 0), by = new THREE.Vector3(), bz = new THREE.Vector3();
  function layoutShoes() {
    const pitch = total / nShoe;
    for (let side = 0; side < 2; side++) {
      const x = side ? GAUGE / 2 : -GAUGE / 2;
      for (let k = 0; k < nShoe; k++) {
        along(shoeOff[side] + k * pitch, tp, tt);
        // normale verso l'esterno dell'anello
        let ny = -tt.x, nz = tt.y;             // (y, z) perpendicolare alla tangente (z, y)
        const cz = tp.x - cen.x, cy = tp.y - cen.y;
        if (ny * cy + nz * cz < 0) { ny = -ny; nz = -nz; }
        by.set(0, ny, nz); bz.crossVectors(bx, by);
        m4.makeBasis(bx, by, bz).setPosition(x, tp.y, tp.x);
        shoes.setMatrixAt(side * nShoe + k, m4);
      }
    }
    shoes.instanceMatrix.needsUpdate = true;
  }
  layoutShoes();

  function setVersion(type) {
    const crawler = type === "cingoli";
    N.versione_ruote.visible = !crawler; N.versione_cingoli.visible = crawler; shoes.visible = crawler;
  }

  /* ---------- frecce delle forze (nel riferimento del trattore) ---------- */
  function arrow(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 12), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 16), mat);
    shaft.renderOrder = head.renderOrder = 10;
    g.add(shaft, head); g.userData = { shaft, head }; return g;
  }
  function setArrowLen(a, len) {       // freccia lungo -z (avanti) di lunghezza len
    const s = Math.max(len - 0.38, 0.05);
    a.userData.shaft.scale.y = s; a.userData.shaft.position.y = s / 2;
    a.userData.head.position.y = s + 0.19;
  }
  const arrows = {};
  const labels = {};
  for (const k of ["Fa", "Fra", "Fu"]) {
    const a = arrow(FORZE[k]); tractor.add(a); arrows[k] = a;
    const l = document.createElement("div"); l.className = "force-label"; l.innerHTML = ETICHETTE[k]; l.style.setProperty("--c", FORZE[k]);
    stage.appendChild(l); labels[k] = l;
  }
  // Fa a terra sul fianco sinistro, in avanti; Fra a terra dietro la ruota destra, indietro; Fu sopra il trattore, in avanti
  arrows.Fa.position.set(-1.15, 0.12, 1.05); arrows.Fa.rotation.x = -Math.PI / 2;
  arrows.Fra.position.set(1.15, 0.12, 1.25); arrows.Fra.rotation.x = Math.PI / 2;
  arrows.Fu.position.set(0, 2.75, 1.1); arrows.Fu.rotation.x = -Math.PI / 2;
  // M: freccia curva attorno all'albero della p.d.p.
  const mMat = new THREE.MeshBasicMaterial({ color: FORZE.M, depthTest: false, transparent: true, opacity: 0.95 });
  const mArrow = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 32, Math.PI * 1.5), mMat);
  const mHead = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 12), mMat);
  mHead.position.set(0, -0.26, 0); mHead.rotation.z = -Math.PI / 2; arc.renderOrder = mHead.renderOrder = 10;
  mArrow.add(arc, mHead); mArrow.scale.x = -1;          // verso orario visto da dietro, come la p.d.p.
  mArrow.position.set(0, 0.60, 1.52); tractor.add(mArrow);
  const lm = document.createElement("div"); lm.className = "force-label"; lm.innerHTML = ETICHETTE.M; lm.style.setProperty("--c", FORZE.M); stage.appendChild(lm); labels.M = lm;

  /* ---------- camera e dimensioni ---------- */
  let W_ = 1, H_ = 1;
  function resize() {
    W_ = stage.clientWidth; H_ = stage.clientHeight;
    renderer.setSize(W_, H_, false); camera.aspect = W_ / H_; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();
  const camTarget = new THREE.Vector3(0, 1, -2);
  const v3 = new THREE.Vector3();
  function toScreen(p) { v3.copy(p).project(camera); return { x: (v3.x + 1) / 2 * W_, y: (1 - v3.y) / 2 * H_, vis: v3.z < 1 }; }

  /* ---------- stato del moto ---------- */
  const prev = { x: null, z: 0, psi: 0 };
  let steer = 0, wheelA = { rl: 0, rr: 0, fl: 0, fr: 0 }, spr = [0, 0], ptoA = 0;
  const posW = new THREE.Vector3(), tmp = new THREE.Vector3();
  let distK = 1;
  const labelPos = { Fa: { x: 0, y: 0 }, Fra: { x: 0, y: 0 }, Fu: { x: 0, y: 0 } };
  /* etichette: se due si sovrappongono, la più bassa scende quanto basta */
  function separate(keys) {
    const L = keys.map((k) => labelPos[k]).sort((a, b) => a.y - b.y);
    for (let i = 1; i < L.length; i++)
      for (let j = 0; j < i; j++)
        if (Math.abs(L[i].x - L[j].x) < 58 && L[i].y - L[j].y < 30) L[i].y = L[j].y + 30;
  }

  function render(pos, dt, playing) {
    const S = sim.S, C = sim.CACHE;
    updateTerrain(S.i, S.terrainIdx);
    setVersion(S.type);

    // posizione e assetto: x, z e direzione da pathAt(); quota e beccheggio dal terreno sotto i due assi
    const x = pos.x * U, z = pos.z * U, psi = (pos.heading * Math.PI) / 180 + Math.PI;
    const fx = -Math.sin(psi), fz = -Math.cos(psi);          // versore avanti (three)
    const hF = heightAt(z + fz * WB / 2), hR = heightAt(z - fz * WB / 2);
    const pitch = Math.atan2(hF - hR, WB);
    // rollio: in diagonale sul pendio il lato a monte sta più in alto (stabilità trasversale)
    const rz = -Math.sin(psi);                                // componente z del versore "destra"
    const rollAng = Math.atan2(heightAt(z + rz * GAUGE / 2) - heightAt(z - rz * GAUGE / 2), GAUGE);
    tractor.position.set(x, (hF + hR) / 2, z);
    tractor.rotation.set(pitch, psi, rollAng, "YXZ");

    // spostamento reale nel fotogramma (segno: avanti o indietro) e curvatura del percorso
    let ds = 0, kappa = 0;
    if (prev.x !== null) {
      const dx = x - prev.x, dz = z - prev.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        ds = Math.sign(dx * fx + dz * fz || 1) * d;
        let dpsi = psi - prev.psi; dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
        if (d > 1e-4) kappa = dpsi / ds;
      }
    }
    prev.x = x; prev.z = z; prev.psi = psi;
    const target = Math.abs(kappa) > 1e-4 ? Math.atan(WB * kappa) : 0;
    if (Math.abs(ds) > 1e-5 || !playing) steer += (target - steer) * Math.min(1, dt * 6);

    // ruote: rotolamento proporzionale a v (coincide con il moto a V_REF), differenziale in curva
    const k = S.v / V_REF, roll = ds * k;
    const side = (off) => roll * (1 + kappa * off);
    wheelA.rl -= side(-GAUGE / 2) / R_POST; wheelA.rr -= side(GAUGE / 2) / R_POST;
    wheelA.fl -= side(-0.725) / R_ANT; wheelA.fr -= side(0.725) / R_ANT;
    N.ruota_post_sx.rotation.x = wheelA.rl; N.ruota_post_dx.rotation.x = wheelA.rr;
    N.ruota_ant_sx.rotation.x = wheelA.fl; N.ruota_ant_dx.rotation.x = wheelA.fr;
    // sterzo di Ackermann: la ruota interna sterza di più
    let dl = 0, dr = 0;
    if (Math.abs(steer) > 1e-4) {
      const Rc = WB / Math.tan(steer);
      dl = Math.atan(WB / (Rc - KP / 2)); dr = Math.atan(WB / (Rc + KP / 2));   // sterzata a sinistra: Rc > 0
    }
    N.fusello_ant_sx.rotation.y = dl; N.fusello_ant_dx.rotation.y = dr;
    N.volante.quaternion.copy(baseQ.volante).multiply(tmpQ.setFromAxisAngle(AX_Y, steer * 9));
    // cingoli: velocità diversa per lato in curva (sterzatura per differenza di velocità)
    if (S.type === "cingoli") {
      for (let s = 0; s < 2; s++) {
        const d = side(s ? GAUGE / 2 : -GAUGE / 2);
        shoeOff[s] += trackDir * d; spr[s] -= d / R_SPR;
      }
      layoutShoes();
      N.ruota_motrice_sx.rotation.x = spr[0]; N.ruota_motrice_dx.rotation.x = spr[1];
      for (const [nm, s] of [["tendicingolo_ant_sx", 0], ["tendicingolo_post_sx", 0], ["tendicingolo_ant_dx", 1], ["tendicingolo_post_dx", 1]])
        N[nm].rotation.x = spr[s] * R_SPR / R_IDL;
    }
    // presa di potenza, cardano e rotore della fresatrice: girano solo nella fase di lavorazione
    const pdp = pos.phase.indexOf("presa di potenza") >= 0;
    if (pdp && playing) ptoA += dt * PTO_VIS * (sim.speed || 1);   // rallenta con la velocità di riproduzione
    N.albero_pdp.rotation.z = -ptoA;                 // senso orario visto da dietro
    N.cardano.quaternion.copy(baseQ.cardano).multiply(tmpQ.setFromAxisAngle(AX_Z, ptoA));
    N.rotore_fresa.rotation.x = -ptoA * 0.4;

    // frecce: stesse fasi, stessi valori e stessa scala della versione SVG (0,02 unità per daN)
    const forces = pos.phase.indexOf("Salita") >= 0 || pos.phase.indexOf("Curva") >= 0;
    const lens = { Fa: Math.max(C.Fa * 0.02, 14) * U, Fra: Math.max((C.Fra + C.Fri) * 0.02, 8) * U, Fu: Math.max(Math.abs(C.Fu) * 0.02, 8) * U };
    for (const k2 of ["Fa", "Fra", "Fu"]) {
      arrows[k2].visible = forces; setArrowLen(arrows[k2], lens[k2]);
    }
    mArrow.visible = pdp;

    // luce che segue il trattore (ombre nitide), camera in orbita con gli stessi angoli az/el
    sun.position.set(x - 4, tractor.position.y + 16, z + 3); sun.target.position.copy(tractor.position);
    const { az, el } = sim.view();
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    const want = tmp.set(x, tractor.position.y + 1.0, z);
    camTarget.lerp(want, Math.min(1, dt * 3));
    const narrow = W_ / H_ < 1;
    distK += ((DIST_FASE[pos.phase] || 1) - distK) * Math.min(1, dt * 1.5);
    const dist = (narrow ? 21 : 15.5) * distK;
    camera.position.set(camTarget.x + Math.sin(a) * Math.cos(e) * dist, camTarget.y + Math.sin(e) * dist, camTarget.z + Math.cos(a) * Math.cos(e) * dist);
    camera.lookAt(camTarget);
    // alberi e casale sulla linea di vista diventano quasi trasparenti (il trattore resta sempre visibile)
    fadeOccluders(dt);
    // spazio del pannello delle formule: la finestra di ripresa si sposta e il trattore resta nella zona libera
    const sh = sim.viewShift || { x: 0, y: 0 };
    camera.setViewOffset(W_, H_, sh.x, sh.y, W_, H_);
    renderer.render(scene, camera);

    // etichette delle frecce e punto di ancoraggio del pannello delle formule
    tractor.updateMatrixWorld();
    const onKeys = [];
    for (const k2 of ["Fa", "Fra", "Fu"]) {
      const on = arrows[k2].visible;
      labels[k2].style.opacity = on ? 1 : 0;
      if (on) {
        const s2 = toScreen(arrows[k2].userData.head.getWorldPosition(posW));
        labelPos[k2].x = s2.x; labelPos[k2].y = s2.y - 14; onKeys.push(k2);
      }
    }
    separate(onKeys);
    for (const k2 of onKeys) labels[k2].style.transform = `translate(${labelPos[k2].x}px, ${labelPos[k2].y}px) translate(-50%, -100%)`;
    labels.M.style.opacity = pdp ? 1 : 0;
    if (pdp) { const s2 = toScreen(mArrow.getWorldPosition(posW)); labels.M.style.transform = `translate(${s2.x + 24}px, ${s2.y - 20}px) translate(0, -100%)`; }
    const anchor = toScreen(posW.set(x, tractor.position.y + 3.2, z));
    return { x: anchor.x, y: anchor.y };
  }
  const tmpQ = new THREE.Quaternion(), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);

  const segA = new THREE.Vector3(), segB = new THREE.Vector3(), segD = new THREE.Vector3(), wp = new THREE.Vector3(), cp = new THREE.Vector3();
  function fadeOccluders(dt) {
    segA.copy(camera.position);
    segB.copy(tractor.position); segB.y += 1.0;
    segD.subVectors(segB, segA);
    const len2 = segD.lengthSq();
    for (const o of occluders) {
      o.obj.updateWorldMatrix(true, false);
      let hit = false;
      for (const s of o.samples) {
        wp.copy(s).applyMatrix4(o.obj.matrixWorld);
        const t = Math.max(0, Math.min(1, cp.subVectors(wp, segA).dot(segD) / len2));
        if (t < 0.03 || t > 0.97) continue;
        cp.copy(segA).addScaledVector(segD, t);
        if (cp.distanceTo(wp) < o.radius) { hit = true; break; }
      }
      const target = hit ? 0.14 : 1;
      o.k += (target - o.k) * Math.min(1, dt * 6);
      for (const m of o.mats) { m.opacity = o.k; m.depthWrite = o.k > 0.98; }
    }
  }

  sim.scene3d = { ready: true, render, loadMs: Math.round(performance.now() - t0) };
  stage.classList.add("is-3d");
  window.__trattore3d = { loadMs: sim.scene3d.loadMs, readyAt: Math.round(performance.now()), N, camera, toScreen };
}

init().catch((e) => { console.error("Scena 3D non disponibile, resta la versione SVG:", e); });
