/* =====================================================================
   Il Potatore — logica di gioco, disegno della vite, interazione.
   Le regole agronomiche e il punteggio sono quelli della versione
   originale; è stato tolto soltanto il mal dell'esca.
   ===================================================================== */
(function(){
"use strict";

/* ================= UTILITÀ ================= */
const $ = (s, r)=> (r || document).querySelector(s);
const $$ = (s, r)=> Array.from((r || document).querySelectorAll(s));
const SVG_NS = "http://www.w3.org/2000/svg";
const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const mqDesktop = window.matchMedia("(min-width: 980px)");
const reducedMotion = ()=> mqReduced.matches;
const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
const lerp = (a, b, t)=> a + (b - a) * t;
const pad2 = n=> String(n).padStart(2, "0");
const fx = p=> p[0].toFixed(1) + "," + p[1].toFixed(1);
const MONO = "IBM Plex Mono, SFMono-Regular, Menlo, monospace";

function svgEl(tag, attrs, parent){
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function esc(s){
  return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
function iconSvg(name, cls){
  return `<svg class="ico ${cls || ""}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}
function mulberry32(seed){
  let a = seed | 0;
  return function(){
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function restartClass(el, cls){
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function animateEl(el, keyframes, opts){
  if (!el || reducedMotion() || typeof el.animate !== "function") return null;
  return el.animate(keyframes, opts);
}

/* ================= MEMORIA LOCALE (record) ================= */
// v2: nuovo punteggio (settembre 2026), i record della v1 non sono confrontabili
const STORE_KEY = "ilPotatore.records.v2";
try{ localStorage.removeItem("ilPotatore.records.v1"); }catch(e){ /* nessun archivio */ }
const TUT_KEY = "ilPotatore.tutorialVisto";
function readRecords(){
  try{
    const r = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return (r && typeof r === "object") ? r : {};
  }catch(e){ return {}; }
}
function writeRecords(r){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(r)); }catch(e){ /* archivio non disponibile: il gioco funziona lo stesso */ }
}
function comboKey(f, o, d){ return `${f}|${o}|${d}`; }
function recordFor(f, o, d){
  const r = readRecords()[comboKey(f, o, d)];
  return (r && typeof r.best === "number") ? r : null;
}
function saveRecord(score){
  const recs = readRecords();
  const key = comboKey(STATE.forma, STATE.obiettivo, STATE.difficolta);
  const prev = (recs[key] && typeof recs[key].best === "number") ? recs[key] : null;
  const isNew = !prev || score > prev.best;
  recs[key] = {
    best: prev ? Math.max(prev.best, score) : score,
    plays: (prev && typeof prev.plays === "number" ? prev.plays : 0) + 1,
    date: new Date().toISOString().slice(0, 10)
  };
  writeRecords(recs);
  return {isNew, prevBest: prev ? prev.best : null, rec: recs[key]};
}
const LAST_KEY = "ilPotatore.ultimaScelta";
function saveLastChoice(){
  try{ localStorage.setItem(LAST_KEY, JSON.stringify({forma:STATE.forma, obiettivo:STATE.obiettivo, difficolta:STATE.difficolta})); }catch(e){ /* nessun archivio */ }
}
function loadLastChoice(){
  try{
    const c = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    if (!c) return;
    if (["guyot","cordone"].includes(c.forma)) STATE.forma = c.forma;
    if (["qualita","equilibrio","quantita"].includes(c.obiettivo)) STATE.obiettivo = c.obiettivo;
    if (["facile","medio","difficile"].includes(c.difficolta)) STATE.difficolta = c.difficolta;
  }catch(e){ /* dato illeggibile: si riparte da zero */ }
}
function tutorialSeen(){
  try{ return localStorage.getItem(TUT_KEY) === "1"; }catch(e){ return false; }
}
function markTutorialSeen(){
  try{ localStorage.setItem(TUT_KEY, "1"); }catch(e){ /* nessun archivio */ }
}

/* ================= STATO ================= */
const STATE = {
  forma:null, obiettivo:null, difficolta:null,
  vine:null,
  selectedCaneId:null,
  currentRole:"capo",
  choices:{ capo:null, sperone:null },      // {caneId, cutNode}
  cordoneChoices:{},                         // {posId: {caneId, cutNode, removed}}
  session:{ count:0, totalScore:0 },
  hoverCaneId:null,
  sheetExpanded:false,
  zoomOff:false,          // su telefono: vista intera anche con un tralcio selezionato
  vineActive:false,       // c'è una vite in corso non ancora confermata
  vineSettings:null       // forma, obiettivo e difficoltà con cui è stata generata la vite in corso
};

const OBJ_LABELS = {qualita:"Alta qualità", equilibrio:"Equilibrio", quantita:"Quantità"};
const FORMA_LABELS = {guyot:"Guyot", cordone:"Cordone speronato"};
const DIFF_LABELS = {facile:"Facile", medio:"Medio", difficile:"Difficile"};

/* ================= SCHERMATE E FASI ================= */
const STEPS = ["tutorial","setup","game","growth","result"];
const STEP_NAMES = {tutorial:"Tutorial", setup:"Impostazioni", game:"Potatura", growth:"Crescita", result:"Risultato"};

function showScreen(id){
  $$(".screen").forEach(s=> s.classList.toggle("is-active", s.id === id));
  const step = document.getElementById(id).dataset.step;
  const idx = STEPS.indexOf(step);
  $$("#stepper li").forEach((li, i)=>{
    li.classList.toggle("is-done", i < idx);
    if (i === idx) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  $$("#stepCompact .bar i").forEach((b, i)=>{ b.className = i < idx ? "on" : (i === idx ? "cur" : ""); });
  $("#stepCompactName").textContent = `${idx + 1}/5 · ${STEP_NAMES[step]}`;
  document.body.classList.toggle("is-game", step === "game");
  window.scrollTo(0, 0);
  const main = $("#main");
  if (main && document.activeElement && document.activeElement !== document.body && !main.contains(document.activeElement)){
    main.focus({preventScroll:true});
  }
}

/* ================= IMPOSTAZIONI ================= */
function wireOptionGroup(containerId, stateKey){
  $$(`#${containerId} .opt input`).forEach(input=>{
    input.addEventListener("change", ()=>{
      STATE[stateKey] = input.value;
      saveLastChoice();
      syncSetup();
    });
  });
}
wireOptionGroup("opt-forma", "forma");
wireOptionGroup("opt-obiettivo", "obiettivo");
wireOptionGroup("opt-difficolta", "difficolta");

function syncSetup(){
  ["forma","obiettivo","difficolta"].forEach(k=>{
    $$(`#opt-${k} .opt`).forEach(card=>{
      const on = card.dataset.v === STATE[k];
      card.classList.toggle("is-selected", on);
      $("input", card).checked = on;
    });
  });
  $$("#opt-difficolta .rec").forEach(el=>{
    if (STATE.forma && STATE.obiettivo){
      const r = recordFor(STATE.forma, STATE.obiettivo, el.dataset.rec);
      el.innerHTML = r
        ? `<span class="chip accent">${iconSvg("star")}record ${r.best}/100</span>`
        : `<span class="chip">nessun record</span>`;
    } else {
      el.innerHTML = "";
    }
  });
  checkStartReady();
  renderRecordsTable();
  renderResumeBanner();
}

function sameAsVine(){
  const v = STATE.vineSettings;
  return !!v && v.forma === STATE.forma && v.obiettivo === STATE.obiettivo && v.difficolta === STATE.difficolta;
}
function renderResumeBanner(){
  const box = $("#resumeBanner");
  const active = STATE.vineActive && STATE.vine && STATE.vineSettings;
  box.hidden = !active;
  if (!active) return;
  const v = STATE.vineSettings;
  $("#resumeText").innerHTML = `Hai una vite in corso: <b>vite ${STATE.session.count + 1}</b> · ${FORMA_LABELS[v.forma]} · ${OBJ_LABELS[v.obiettivo]} · ${DIFF_LABELS[v.difficolta]}. Se inizi una nuova vite, le scelte fatte su quella in corso andranno perse${sameAsVine() ? "" : " e la media della sessione ripartirà da zero"}.`;
}

function startReady(){ return !!(STATE.forma && STATE.obiettivo && STATE.difficolta); }

function checkStartReady(){
  const ready = startReady();
  $("#btnStart").setAttribute("aria-disabled", ready ? "false" : "true");
  $("#btnStartLabel").textContent = !ready ? "Seleziona le tre opzioni per iniziare" : (STATE.vineActive ? "Inizia una nuova vite" : "Inizia a potare");
  const parts = [];
  if (STATE.forma) parts.push(FORMA_LABELS[STATE.forma]);
  if (STATE.obiettivo) parts.push(OBJ_LABELS[STATE.obiettivo]);
  if (STATE.difficolta) parts.push(DIFF_LABELS[STATE.difficolta]);
  const sum = $("#setupSummary");
  if (!parts.length){
    sum.innerHTML = '<span class="muted">Scegli forma, obiettivo e difficoltà</span>';
  } else if (!ready){
    const miss = 3 - parts.length;
    sum.innerHTML = `${esc(parts.join(" · "))} <span class="muted">· ${miss === 1 ? "manca una scelta" : "mancano " + miss + " scelte"}</span>`;
  } else {
    const r = recordFor(STATE.forma, STATE.obiettivo, STATE.difficolta);
    sum.innerHTML = `${esc(parts.join(" · "))} <span class="muted">· ${r ? "record " + r.best + "/100" : "nessun record"}</span>`;
  }
}

function renderRecordsTable(){
  const recs = readRecords();
  let html = '<table><caption class="sr-only">Miglior punteggio per ogni combinazione</caption><thead><tr><th scope="col">Forma · obiettivo</th><th scope="col">Facile</th><th scope="col">Medio</th><th scope="col">Difficile</th></tr></thead><tbody>';
  ["guyot","cordone"].forEach(f=>{
    ["qualita","equilibrio","quantita"].forEach(o=>{
      html += `<tr><th scope="row">${FORMA_LABELS[f]} · ${OBJ_LABELS[o]}</th>`;
      ["facile","medio","difficile"].forEach(d=>{
        const r = recs[comboKey(f, o, d)];
        if (r && typeof r.best === "number") html += `<td>${r.best}<span style="color:var(--ink-3)"> · ${r.plays} ${r.plays === 1 ? "vite" : "viti"}</span></td>`;
        else html += '<td class="empty">—</td>';
      });
      html += "</tr>";
    });
  });
  html += "</tbody></table>";
  $("#recordsTable").innerHTML = html;
}

$("#btnStart").addEventListener("click", ()=>{
  if (!startReady()){
    const missing = !STATE.forma ? "opt-forma" : !STATE.obiettivo ? "opt-obiettivo" : "opt-difficolta";
    document.getElementById(missing).scrollIntoView({behavior: reducedMotion() ? "auto" : "smooth", block:"center"});
    restartClass($("#btnStart"), "shake");
    return;
  }
  // la media della sessione riparte solo se cambia la combinazione
  if (!sameAsVine()) STATE.session = {count:0, totalScore:0};
  saveLastChoice();
  showScreen("gameScreen");
  startNewVine();
});
$("#btnResume").addEventListener("click", ()=>{
  if (!STATE.vineActive || !STATE.vineSettings) return;
  Object.assign(STATE, STATE.vineSettings);   // si torna alle impostazioni con cui è nata la vite
  saveLastChoice();
  showScreen("gameScreen");
  refresh();
});
$("#btnChangeSettings").addEventListener("click", goSettings);
$("#btnChangeSettings2").addEventListener("click", goSettings);
function goSettings(){
  showScreen("setupScreen");
  syncSetup();
}
$("#btnNextVine").addEventListener("click", ()=>{
  showScreen("gameScreen");
  startNewVine();
});
$("#btnReviewTutorial").addEventListener("click", ()=>{
  tutIdx = 0;
  renderTutorialSlide(0);
  showScreen("tutorialScreen");
});

/* ================= TUTORIAL ================= */
const T_LABEL = `font-family="${MONO}" font-size="13" font-weight="500" fill="#4F493E"`;
const BUD_D = "M0,-5.5 C7,-5.5 13,-2.2 16,0 C13,2.2 7,5.5 0,5.5Z";
const BUD_HI = "M3,-2 Q9,-3.2 14,-.5";
function tBud(x, y, rot, s, blind){
  const fill = blind ? "#A39C8C" : "#7B3F24", stroke = blind ? "#6B6557" : "#4A2412";
  const extra = blind
    ? `<path d="M4,-3 L10,3" stroke="#5F594D" stroke-width="1"/>`
    : `<path d="${BUD_HI}" stroke="#C0804F" stroke-width="1" fill="none"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="${BUD_D}" fill="${fill}" stroke="${stroke}" stroke-width=".8"/>${extra}</g>`;
}
function tCane(d, w, colors){
  const c = colors || ["#5E3A1F","#8E5C34","#C38F5E"];
  return `<path d="${d}" stroke="${c[0]}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`
    + `<path d="${d}" stroke="${c[1]}" stroke-width="${(w * 0.7).toFixed(1)}" fill="none" stroke-linecap="round"/>`
    + `<path d="${d}" stroke="${c[2]}" stroke-width="${(w * 0.2).toFixed(1)}" fill="none" stroke-linecap="round" transform="translate(-${(w * 0.18).toFixed(1)} -${(w * 0.1).toFixed(1)})" opacity=".8"/>`;
}
function tNode(x, y, rx, ry, rot){
  return `<g transform="translate(${x} ${y}) rotate(${rot || 0})"><ellipse rx="${rx}" ry="${ry}" fill="#6B4326"/><ellipse rx="${(rx * 0.7).toFixed(1)}" ry="${(ry * 0.72).toFixed(1)}" fill="#8E5C34"/></g>`;
}
function tPill(x, y, w, text, fill){
  return `<rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="24" rx="12" fill="${fill}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MONO}" font-size="11.5" font-weight="600" letter-spacing=".6" fill="#F3EEE2">${text}</text>`;
}

const TUTORIAL_SLIDES = [
  {
    title:"Nodo, internodo, gemma",
    illus:`<svg viewBox="0 0 280 280">
      ${tCane("M124 272 C122 200 132 120 140 18", 15)}
      ${tNode(124.6, 218, 10, 5, -3)}${tNode(128.8, 148, 10, 5, -4)}${tNode(135, 78, 9, 4.6, -5)}
      ${tBud(116, 213, -140, 1, false)}${tBud(137.5, 143, -40, 1, false)}${tBud(127, 73, -140, 0.95, false)}
      <path d="M121 146 c-6 -4 -12 -4 -15 1 c-2 4 2 7 5 5 c2 -1.5 1 -4 -1 -3.5" stroke="#5A4633" stroke-width="1.2" fill="none"/>
      <g stroke="#A9581F" stroke-width="1.2" fill="none"><path d="M112 64 L72 44"/><path d="M138 218 H186"/><path d="M152 146 h6 v-64 h-6"/><path d="M158 114 H186"/></g>
      <g fill="#A9581F"><circle cx="112" cy="64" r="2.4"/><circle cx="138" cy="218" r="2.4"/></g>
      <text x="66" y="48" text-anchor="end" ${T_LABEL}>gemma</text>
      <text x="192" y="222" ${T_LABEL}>nodo</text>
      <text x="192" y="118" ${T_LABEL}>internodo</text>
    </svg>`,
    html:`<p>Il <b>tralcio</b> è il ramo di un anno che tagli ogni inverno. È diviso in <b>internodi</b>, separati da <b>nodi</b>: ogni nodo porta una <b>gemma</b>, il punto da cui nascerà il germoglio dell'anno successivo.</p>
      <p>Contare le gemme correttamente, nodo per nodo, è la base di tutta la potatura.</p>`
  },
  {
    title:"Gemme franche, cieche e della corona",
    illus:`<svg viewBox="0 0 280 240">
      ${tCane("M10 170 C80 160 180 160 270 150", 14)}
      ${tNode(85, 163, 5, 10, -3)}${tNode(195, 159, 5, 10, -4)}
      ${tBud(85, 156, -95, 2.3, false)}${tBud(195, 152, -85, 1.7, true)}
      ${tBud(22, 160, -100, 0.7, false)}${tBud(34, 158, -80, 0.7, false)}
      <path d="M28 150 V112" stroke="#C4B99F" stroke-width="1.2" stroke-dasharray="3 3"/>
      <text x="28" y="104" text-anchor="middle" ${T_LABEL}>corona</text>
      <circle cx="85" cy="66" r="20" fill="#DCE9DF"/><path d="M75 66 l7 7 13 -14" stroke="#2E6B45" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="195" cy="66" r="20" fill="#F3DCD6"/><path d="M187 58 l16 16 M203 58 l-16 16" stroke="#9B3B2E" stroke-width="3" stroke-linecap="round"/>
      <g stroke="#C4B99F" stroke-width="1.2" stroke-dasharray="3 3"><path d="M85 90 V110"/><path d="M195 90 V120"/></g>
      <text x="85" y="212" text-anchor="middle" ${T_LABEL}>franca</text>
      <text x="195" y="212" text-anchor="middle" ${T_LABEL}>cieca</text>
    </svg>`,
    html:`<p>Una <b>gemma franca</b> è viva e produttiva: darà un germoglio con foglie e, se tutto va bene, grappoli.</p>
      <p>Una <b>gemma cieca</b> non germoglierà: è stata danneggiata da gelo o grandine. Quando conti le gemme lasciate su un capo a frutto, le gemme cieche <b>non contano</b> come produttive — anche se restano fisicamente sul tralcio.</p>
      <p>Alla base di ogni tralcio ci sono 1-2 <b>gemme della corona</b>, piccole e ravvicinate: sono poco fertili e <b>non si contano</b>. Si conta dalla prima gemma franca; nel righello del gioco le trovi segnate con una C.</p>`
  },
  {
    title:"Capo a frutto e sperone di rinnovo",
    illus:`<svg viewBox="0 0 280 260">
      <ellipse cx="140" cy="246" rx="112" ry="9" fill="#E2D9C5"/>
      <path d="M8 132 H272" stroke="#8A8F8C" stroke-width="1.4"/>
      <path d="M133 248 C134 212 131 182 134 152 L148 152 C150 182 146 212 149 248 Z" fill="#66574A"/>
      <g stroke="#3F3428" stroke-width="1" opacity=".45" fill="none"><path d="M137 244 C138 212 136 186 138 158"/><path d="M143 244 C144 214 141 188 144 158"/></g>
      <ellipse cx="141" cy="150" rx="17" ry="11" fill="#5A4A3A"/><ellipse cx="136" cy="146" rx="6" ry="3" fill="#8E7D68" opacity=".6"/>
      ${tCane("M134 146 C126 118 104 126 88 131 C66 134 44 133 18 132", 8)}
      ${tBud(104, 125, -90, 0.7)}${tBud(86, 129, -90, 0.7)}${tBud(66, 130, -90, 0.7)}${tBud(46, 130, -90, 0.7)}${tBud(28, 130, -90, 0.7)}
      <g stroke="#56604A" stroke-width="1.6" fill="none"><path d="M72 128 q2 8 4 0"/><path d="M36 128 q2 8 4 0"/></g>
      ${tCane("M148 144 C150 132 151 122 150 108", 7)}
      ${tBud(149, 134, -40, 0.7)}${tBud(151, 120, -140, 0.7)}
      <ellipse cx="150" cy="107" rx="4" ry="1.8" fill="#EBDDBB" stroke="#B7925F" stroke-width=".6"/>
      <path d="M75 104 V126" stroke="#233A2C" stroke-width="1.2"/>
      ${tPill(75, 92, 124, "CAPO A FRUTTO", "#233A2C")}
      <path d="M166 90 L153 104" stroke="#3E5C76" stroke-width="1.2"/>
      ${tPill(212, 80, 92, "SPERONE", "#3E5C76")}
    </svg>`,
    html:`<p>Nel sistema <b>Guyot</b> lasci due tralci diversi sulla testa del ceppo:</p>
      <ul>
        <li><b>Capo a frutto</b> — un tralcio lungo (6-12 gemme secondo l'obiettivo), porterà l'uva di quest'anno.</li>
        <li><b>Sperone di rinnovo</b> — un tralcio corto (2 gemme), vicino alla testa: l'anno prossimo diventerà il nuovo capo a frutto.</li>
      </ul>
      <p>Il capo a frutto va scelto su un tralcio nato dallo <b>sperone dell'anno scorso</b> (legno di due anni): i tralci che spuntano dal legno vecchio della testa, i succhioni, hanno gemme basali poco fertili.</p>
      <p>Lo sperone va scelto <b>più in basso del capo</b>, il più vicino possibile alla testa, anche su legno più vecchio: senza lo sperone, o con uno sperone troppo alto, il ceppo “si allontanerebbe” ogni anno di più dalla sua testa originale.</p>`
  },
  {
    title:"Cordone speronato",
    illus:`<svg viewBox="0 0 280 220">
      <ellipse cx="140" cy="210" rx="110" ry="7" fill="#E2D9C5"/>
      <path d="M6 112 H274" stroke="#8A8F8C" stroke-width="1.4"/>
      <path d="M134 212 C135 180 132 150 135 126 L147 126 C149 152 146 182 148 212Z" fill="#66574A"/>
      <g fill="none" stroke-linecap="round">
        <path d="M141 128 C132 116 118 118 100 118 L18 118" stroke="#4A4033" stroke-width="13"/>
        <path d="M141 128 C150 116 164 118 182 118 L262 118" stroke="#4A4033" stroke-width="13"/>
        <path d="M141 128 C132 116 118 118 100 118 L18 118" stroke="#7A6E5C" stroke-width="9"/>
        <path d="M141 128 C150 116 164 118 182 118 L262 118" stroke="#7A6E5C" stroke-width="9"/>
        <path d="M100 115.5 L22 115.5 M182 115.5 L258 115.5" stroke="#A39883" stroke-width="2.4"/>
      </g>
      ${[40,92,190,242].map((x, i)=>{
        const dx = i % 2 ? 4 : -4;
        return `<path d="M${x} 114 L${x + dx * 0.3} 100" stroke="#5A4F40" stroke-width="8" stroke-linecap="round"/>`
          + tCane(`M${x - dx * 0.2} 108 C${x - dx} 98 ${x - dx * 1.8} 90 ${x - dx * 2.2} 80`, 6)
          + tBud(x - dx * 0.8, 99, dx > 0 ? -140 : -40, 0.6) + tBud(x - dx * 1.6, 89, dx > 0 ? -40 : -140, 0.6)
          + `<ellipse cx="${x - dx * 2.2}" cy="79.5" rx="3.4" ry="1.5" fill="#EBDDBB" stroke="#B7925F" stroke-width=".6"/>`
          + `<path d="M${x + dx * 0.3} 100 C${x + dx * 1.5} 84 ${x + dx * 2.5} 70 ${x + dx * 3} 56" stroke="#8F8570" stroke-width="1.2" fill="none" stroke-dasharray="3 3"/>`;
      }).join("")}
      <text x="60" y="148" text-anchor="middle" ${T_LABEL}>cordone permanente</text>
      <path d="M204 60 L199 76" stroke="#3E5C76" stroke-width="1.2"/>
      ${tPill(212, 46, 132, "BASALE · TENUTO", "#3E5C76")}
      <text x="150" y="30" text-anchor="end" font-family="${MONO}" font-size="11" fill="#6B6456">distale · tolto</text>
    </svg>`,
    html:`<p>Il <b>cordone speronato</b> ha un braccio permanente (il cordone) che non cambia negli anni. Lungo il cordone, ogni 20-25 cm, c'è un vecchio sperone che ha dato <b>due tralci</b>: uno <b>basale</b> e uno <b>distale</b>.</p>
      <p>Si tiene il basale, tagliato alle gemme richieste dall'obiettivo (1-2 per la qualità, 2 per l'equilibrio, 2-3 per la quantità), e si toglie il distale: è il <b>taglio di ritorno</b>, che impedisce allo sperone di allungarsi ogni anno. Se il basale è difettoso si può tenere il distale, accettando uno sperone un po' più lungo.</p>`
  },
  {
    title:"Il metodo Simonit & Sirch",
    illus:`<svg viewBox="0 0 280 260">
      <path d="M66 244 C68 198 62 150 68 96 L96 96 C100 150 94 198 98 244Z" fill="#7A6E5C" stroke="#4A4033" stroke-width="1.2"/>
      <path d="M96 136 L72 150 L96 164 Z" fill="#8A7760" opacity=".6"/>
      <ellipse cx="97" cy="150" rx="5" ry="14" fill="#EBDDBB" stroke="#B7925F" stroke-width=".8"/>
      <path d="M82 240 C82 208 80 188 79 170" stroke="#9B3B2E" stroke-width="3" fill="none" stroke-dasharray="6 4" stroke-linecap="round"/>
      <path d="M79 146 C80 128 82 114 82 102" stroke="#9B3B2E" stroke-width="3" fill="none" stroke-dasharray="6 4" opacity=".35" stroke-linecap="round"/>
      <path d="M186 244 C188 198 182 150 188 96 L216 96 C220 150 214 198 218 244Z" fill="#7A6E5C" stroke="#4A4033" stroke-width="1.2"/>
      <path d="M214 154 L230 146 L232 156 L215 162Z" fill="#7A6E5C" stroke="#4A4033" stroke-width="1"/>
      <path d="M231 148 L223 152 L231 156Z" fill="#8A7760" opacity=".6"/>
      <ellipse cx="231.5" cy="151" rx="2.2" ry="5.2" fill="#EBDDBB" stroke="#B7925F" stroke-width=".6"/>
      <path d="M202 240 C202 196 200 150 202 104" stroke="#2E6B45" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M195 112 L202 101 L209 112" stroke="#2E6B45" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="82" y="30" text-anchor="middle" font-family="${MONO}" font-size="12.5" font-weight="600" fill="#9B3B2E">flusso interrotto</text>
      <text x="202" y="30" text-anchor="middle" font-family="${MONO}" font-size="12.5" font-weight="600" fill="#2E6B45">flusso continuo</text>
      <text x="80" y="256" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#4F493E">cono di disseccamento</text>
      <text x="212" y="256" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#4F493E">legno di rispetto</text>
    </svg>`,
    html:`<p>Marco Simonit e Pierpaolo Sirch hanno codificato la <b>potatura ramificata</b>, oggi adottata in tutto il mondo, su 4 principi:</p>
      <ul>
        <li><b>Ramificazione controllata</b> — lasciar crescere la pianta con l'età.</li>
        <li><b>Continuità del flusso linfatico</b> — ogni taglio dovrebbe proseguire, non interrompere, il percorso della linfa.</li>
        <li><b>Tagli piccoli e mirati</b> — le ferite ampie creano “coni di disseccamento” che aprono la strada alle malattie del legno.</li>
        <li><b>Legno di rispetto</b> — un piccolo moncone sacrificale che allontana il disseccamento dal legno vivo.</li>
      </ul>
      <p>Il gioco ne valuta alcuni aspetti: l'origine, il diametro, il lato e l'altezza dei tralci che scegli e, nel livello difficile, il lato delle ferite. Il legno di rispetto non è valutato.</p>`
  },
  {
    title:"Attenzione alle insidie",
    illus:`<svg viewBox="0 0 280 260">
      <ellipse cx="140" cy="248" rx="90" ry="7" fill="#E2D9C5"/>
      <path d="M133 250 L134 234 L148 234 L149 250Z" fill="#66574A"/>
      <ellipse cx="141" cy="232" rx="15" ry="9" fill="#5A4A3A"/>
      ${tCane("M134 226 C112 170 84 120 52 70", 4)}
      ${tBud(100, 142, -150, 0.5)}${tBud(76, 106, -60, 0.5)}
      ${tCane("M140 224 C142 160 146 100 150 30", 9)}
      ${tNode(141.5, 190, 6.5, 3.4, -2)}${tNode(143.3, 150, 6.5, 3.4, -2)}${tNode(146, 110, 6.2, 3.2, -3)}${tNode(148.2, 70, 6, 3, -3)}
      ${tBud(137, 186, -140, 0.7)}${tBud(147.5, 146, -40, 0.62, true)}${tBud(142, 106, -140, 0.7)}${tBud(152, 66, -40, 0.7)}
      ${tCane("M147 228 C172 176 200 136 236 96", 8, ["#4F6236","#7C9258","#AFC28A"])}
      <g stroke="#A9581F" stroke-width="1.2" fill="none"><path d="M154 148 L196 170"/></g>
      <circle cx="154" cy="148" r="2.4" fill="#A9581F"/>
      <text x="52" y="56" text-anchor="middle" ${T_LABEL}>tralcio sottile</text>
      <text x="200" y="182" ${T_LABEL}>gemma</text><text x="200" y="197" ${T_LABEL}>cieca</text>
      <text x="274" y="80" text-anchor="end" ${T_LABEL}>poco lignificato</text>
    </svg>`,
    html:`<p>Nei livelli <b>medio</b> e <b>difficile</b> compaiono insidie reali del vigneto:</p>
      <ul>
        <li><b>Gemme cieche</b> — da freddo o grandine: non contano nel conteggio delle gemme produttive.</li>
        <li><b>Tralci di diametro scorretto o poco lignificati</b> — troppo sottili, troppo grossi o ancora verdi: non sono buoni candidati.</li>
        <li><b>Tralci dal lato sbagliato</b> — crescono verso il basso: interrompono il flusso linfatico.</li>
        <li><b>Succhioni</b> — tralci nati dal legno vecchio della testa: possono diventare uno sperone, se sono più in basso del capo, ma mai il capo a frutto.</li>
      </ul>
      <p>Nel livello <b>difficile</b> contano anche due regole in più:</p>
      <ul>
        <li><b>Vigore</b> — se il diametro medio dei tralci supera 9,5 mm la pianta è vigorosa: lascia una gemma in più; sotto 7,5 mm lasciane una in meno.</li>
        <li><b>Ferite sullo stesso lato</b> — ogni tralcio tolto lascia una ferita a sinistra o a destra del legno: raggruppale su un lato, così sull'altro la linfa scorre senza interruzioni.</li>
      </ul>
      <p>Osserva sempre la scheda del tralcio prima di tagliare: ogni dettaglio è lì per un motivo.</p>`
  },
  {
    title:"Pronto a potare?",
    illus:`<svg viewBox="0 0 280 260">
      <path d="M168 102 C200 76 225 50 250 30" stroke="#8F8570" stroke-width="1.3" fill="none" stroke-dasharray="4 4"/>
      ${tCane("M30 240 C90 180 130 134 168 102", 12)}
      ${tNode(70, 199, 5, 10, 45)}${tNode(106, 164, 5, 10, 43)}${tNode(140, 128, 5, 9.5, 42)}
      ${tBud(65, 193, -135, 1.05)}${tBud(113, 168, -45, 1.05)}${tBud(135, 122, -135, 1.05)}
      <ellipse cx="168" cy="102" rx="2.8" ry="6.5" transform="rotate(-40 168 102)" fill="#EBDDBB" stroke="#B7925F" stroke-width=".7"/>
      <g transform="translate(196 134) rotate(-40)">
        <path d="M-4 2 C-14 20 -20 48 -18 74 C-12 77 -8 75 -6 70 C-8 48 -4 22 3 4Z" fill="#A9581F"/>
        <path d="M4 2 C14 20 22 46 24 72 C18 76 14 74 12 70 C10 48 6 22 -2 4Z" fill="#8A4415"/>
        <path d="M-6 30 l4 3 l-3 4 l4 3 l-3 4" stroke="#6F7676" stroke-width="1.6" fill="none"/>
        <path d="M0 0 C-6 -14 -8 -34 -2 -54 C4 -36 6 -16 4 0Z" fill="#C9CDCB" stroke="#6F7676" stroke-width="1"/>
        <path d="M0 0 C8 -12 10 -30 6 -44 C0 -34 -4 -16 -4 0Z" fill="#8E9696" stroke="#5E6565" stroke-width="1"/>
        <circle r="4.2" fill="#5E6565"/><circle r="1.6" fill="#C9CDCB"/>
      </g>
    </svg>`,
    html:`<p>Ora scegli forma di allevamento, obiettivo enologico e difficoltà. Ogni vite è generata al momento: nessuna sarà uguale all'altra.</p>
      <p>Dopo ogni taglio potrai anche vedere <b>come cresce</b> la vite quella stagione, germoglio per germoglio — prima di scoprire il punteggio.</p>`
  }
];

let tutIdx = 0;
const tutSeen = new Set([0]);
function renderTutorialSlide(dir){
  const s = TUTORIAL_SLIDES[tutIdx];
  const n = TUTORIAL_SLIDES.length;
  tutSeen.add(tutIdx);
  const body = $("#tutorialBody");
  body.classList.remove("tut-anim-in", "tut-anim-back");
  body.innerHTML = `<div class="tut-illus" aria-hidden="true">${s.illus}</div><div class="tut-text"><h2>${s.title}</h2>${s.html}</div>`;
  if (dir){ void body.offsetWidth; body.classList.add(dir > 0 ? "tut-anim-in" : "tut-anim-back"); }
  $("#tutCount").textContent = `${pad2(tutIdx + 1)} / ${pad2(n)}`;
  $("#tutProgress").innerHTML = TUTORIAL_SLIDES.map((sl, i)=>
    `<button type="button" data-i="${i}" class="${tutSeen.has(i) ? "is-seen" : ""}" ${i === tutIdx ? 'aria-current="step"' : ""} aria-label="Scheda ${i + 1} di ${n}: ${esc(sl.title)}"></button>`
  ).join("");
  $("#btnTutBack").disabled = tutIdx === 0;
  $("#btnTutNextLabel").textContent = tutIdx === n - 1 ? "Inizia" : "Avanti";
}
function goTut(i){
  i = clamp(i, 0, TUTORIAL_SLIDES.length - 1);
  if (i === tutIdx) return;
  const dir = i > tutIdx ? 1 : -1;
  tutIdx = i;
  renderTutorialSlide(dir);
}
function finishTutorial(){
  markTutorialSeen();
  showScreen("setupScreen");
  syncSetup();
}
$("#btnTutNext").addEventListener("click", ()=>{
  if (tutIdx < TUTORIAL_SLIDES.length - 1) goTut(tutIdx + 1);
  else finishTutorial();
});
$("#btnTutBack").addEventListener("click", ()=> goTut(tutIdx - 1));
$("#btnSkipTutorial").addEventListener("click", finishTutorial);
$("#tutProgress").addEventListener("click", e=>{
  const b = e.target.closest("button[data-i]");
  if (b) goTut(Number(b.dataset.i));
});
document.addEventListener("keydown", e=>{
  if (!$("#tutorialScreen").classList.contains("is-active")) return;
  if (e.target.closest("input, textarea, select")) return;
  if (e.key === "ArrowRight"){ e.preventDefault(); if (tutIdx < TUTORIAL_SLIDES.length - 1) goTut(tutIdx + 1); }
  if (e.key === "ArrowLeft"){ e.preventDefault(); goTut(tutIdx - 1); }
});
(function wireSwipe(){
  const box = $("#tutorialBody");
  let sx = null, sy = null;
  box.addEventListener("pointerdown", e=>{ if (e.pointerType !== "mouse"){ sx = e.clientX; sy = e.clientY; } });
  box.addEventListener("pointerup", e=>{
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) goTut(tutIdx + (dx < 0 ? 1 : -1));
  });
  box.addEventListener("pointercancel", ()=>{ sx = sy = null; });
})();

/* ===================== LOGICA DEL GIOCO · INIZIO =====================
   Generazione delle viti e punteggio. Nessun accesso al DOM: lo stesso
   blocco viene eseguito dalle simulazioni in revisione/sim.js.
   Usa soltanto STATE.forma, STATE.obiettivo, STATE.difficolta, STATE.vine.
   ===================================================================== */
const rnd = (a, b)=> a + Math.random() * (b - a);
const rndInt = (a, b)=> Math.floor(rnd(a, b + 1));
const pick = (arr)=> arr[Math.floor(Math.random() * arr.length)];
const chance = (p)=> Math.random() < p;
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// gemme franche da lasciare sul capo a frutto (Guyot)
const OBJ_TARGETS = {qualita:{min:6, max:8}, equilibrio:{min:8, max:10}, quantita:{min:10, max:12}};
// gemme franche per sperone (cordone speronato)
const CORD_TARGETS = {qualita:{min:1, max:2}, equilibrio:{min:2, max:2}, quantita:{min:2, max:3}};
// punteggio massimo quando la potatura non è valida (nessun taglio, capo quasi senza gemme)
const GATE_CAP = 35;
// pesi del punteggio Guyot: capo a frutto 60, sperone di rinnovo 40
const W = {capoCarico:30, capoOrigine:10, capoDiametro:8, capoLign:7, capoLato:5,
  spCarico:12, spBasso:12, spLign:8, spDiametro:4, spLato:4, ferite:20};
// difficile: soglie del diametro medio dei tralci (mm) per il vigore della pianta
const VIGORE_ALTO = 9.5, VIGORE_BASSO = 7.5;
const hard = ()=> STATE.difficolta === "difficile";

function diffParams(){
  if (STATE.difficolta === "facile") return {nCanes:4, spurDistr:1, defects:[1, 2], obvious:true,
    blindIdeal:0, blindSp:0, blindDistr:0.1, cordPos:4, cordBasalBad:0.2, cordDistalBad:0.25, cordBlind:0.05};
  if (STATE.difficolta === "medio") return {nCanes:5, spurDistr:2, defects:[1, 2], obvious:false,
    blindIdeal:0.6, blindSp:0.2, blindDistr:0.25, cordPos:5, cordBasalBad:0.3, cordDistalBad:0.3, cordBlind:0.2};
  return {nCanes:6, spurDistr:2, defects:[2, 2], obvious:false,
    blindIdeal:0.8, blindSp:0.4, blindDistr:0.35, cordPos:6, cordBasalBad:0.4, cordDistalBad:0.3, cordBlind:0.3};
}

function baseCane(id){
  return {id, label:"", lengthNodes:6, corona:rndInt(1, 2), diametro:"matita", mm:0, lignificazione:rnd(0.72, 1),
    lato:"giusto", latoFerita:"sinistra", blindNodes:[], angleSeed:Math.random(), origine:"due_anni", ins:{on:"spur", t:0.5, side:1}, h:40};
}
// diametro in mm coerente con la classe; bias > 0 spinge verso tralci più grossi (pianta vigorosa)
function setMm(c, bias){
  const r = c.diametro === "sottile" ? [5.0, 6.4] : c.diametro === "grosso" ? [10.6, 13] : [6.8, 10.2];
  const u = bias > 0 ? rnd(0.74, 1) : bias < 0 ? rnd(0, 0.26) : rnd(0.32, 0.68);
  c.mm = Math.round((r[0] + (r[1] - r[0]) * u) * 10) / 10;
}
function meanMm(canes){ return canes.reduce((a, c)=> a + c.mm, 0) / canes.length; }
function vigoreOf(canes){ const m = meanMm(canes); return m > VIGORE_ALTO ? "alto" : m < VIGORE_BASSO ? "basso" : "normale"; }
function vigorShift(){ const v = STATE.vine && STATE.vine.vigore; return v === "alto" ? 1 : v === "basso" ? -1 : 0; }
// target di gemme franche, corretto per il vigore in difficile
function guyotTarget(){ const b = OBJ_TARGETS[STATE.obiettivo], d = vigorShift(); return {min:b.min + d, max:b.max + d}; }
function cordTarget(){ const b = CORD_TARGETS[STATE.obiettivo], d = vigorShift(); const mn = Math.max(1, b.min + d); return {min:mn, max:Math.max(mn, b.max + d)}; }
function addBlind(c, n, from, to){
  let guard = 0;
  while (c.blindNodes.length < n && guard++ < 60){
    const i = rndInt(from, Math.max(from, to));
    if (!c.blindNodes.includes(i)) c.blindNodes.push(i);
  }
  c.blindNodes.sort((a, b)=> a - b);
}
function applyDefect(c, d, target){
  if (d === "verde") c.lignificazione = rnd(0.25, 0.55);
  else if (d === "sottile") c.diametro = "sottile";
  else if (d === "grosso") c.diametro = "grosso";
  else if (d === "lato") c.lato = "sbagliato";
  else if (d === "corto"){ c.lengthNodes = rndInt(3, Math.max(3, target.min - 2)); applyDefect(c, pick(["sottile", "verde"]), target); } // tralcio stentato
  else if (d === "cieche") addBlind(c, rndInt(2, 3), 1, c.lengthNodes);
}

// gemme franche fino al nodo k: le cieche non contano; le gemme della corona sono fuori dal conteggio dei nodi
function effectiveBudsUpTo(cane, k){
  let n = 0;
  for (let i = 1; i <= k; i++){
    if (cane.blindNodes.includes(i)) continue;
    n++;
  }
  return n;
}
function maxFranche(c){ return effectiveBudsUpTo(c, c.lengthNodes); }
// nodi dopo cui tagliare per avere tra lo e hi gemme franche; null se il tralcio non basta
function cutRange(c, lo, hi){
  let a = null, b = null;
  for (let k = 1; k <= c.lengthNodes; k++){ const e = effectiveBudsUpTo(c, k); if (e >= lo && e <= hi){ if (a == null) a = k; b = k; } }
  return a == null ? null : [a, b];
}
function cutText(r){ return r[0] === r[1] ? `dopo il nodo ${r[0]}` : `dopo un nodo tra il ${r[0]} e il ${r[1]}`; }
function caneDefects(c){
  const d = [];
  if (c.diametro !== "matita") d.push(c.diametro);
  if (c.lignificazione < 0.6) d.push("legno verde");
  if (c.lato !== "giusto") d.push("lato sbagliato");
  return d;
}

function generateGuyotVine(){
  const dp = diffParams(), t0 = OBJ_TARGETS[STATE.obiettivo];
  // in difficile la pianta può essere più o meno vigorosa: si genera con il target più alto possibile, poi si calcola il vigore
  const bias = hard() ? pick([-1, 0, 1]) : 0;
  const t = {min:t0.min, max:t0.max + (hard() ? 1 : 0)};
  // A: capo distale e sperone basale sullo sperone dell'anno scorso; B: capo basale, sperone dal legno vecchio più in basso
  const caso = chance(0.5) ? "A" : "B";
  let id = 0;
  const capo = baseCane(id++);
  capo.lengthNodes = t.max + rndInt(2, 5);
  if (chance(dp.blindIdeal)){ const nb = rndInt(1, 2); addBlind(capo, nb, 2, t.max); capo.lengthNodes += nb; }
  const sp = baseCane(id++);
  sp.lengthNodes = rndInt(4, 10);
  if (chance(dp.blindSp)) addBlind(sp, 1, 1, 2);
  const distr = [];
  const nDistr = dp.nCanes - 2;
  const nSpur = Math.min(dp.spurDistr, nDistr);
  for (let i = 0; i < nDistr; i++){
    const d = baseCane(id++);
    d.onSpur = i < nSpur;
    if (d.onSpur){
      // tralci dello sperone dell'anno scorso con un difetto visibile nella scheda
      d.lengthNodes = rndInt(t.max + 1, t.max + 6);   // vigorosi, salvo quelli stentati ("corto")
      const pool = dp.obvious ? ["verde", "sottile", "corto", "lato"] : ["verde", "sottile", "grosso", "lato", "corto", "cieche"];
      shuffle(pool).slice(0, rndInt(dp.defects[0], dp.defects[1])).forEach(x=> applyDefect(d, x, t));
    } else {
      // succhioni dal legno vecchio della testa: lunghi e spesso grossi
      d.lengthNodes = t.max + rndInt(3, 7);
      if (chance(0.6)) applyDefect(d, "grosso", t);
      if (chance(dp.obvious ? 0.3 : 0.5)) applyDefect(d, pick(["verde", "lato", "cieche"]), t);
    }
    if (!d.blindNodes.length && chance(dp.blindDistr)) addBlind(d, 1, 1, d.lengthNodes);
    distr.push(d);
  }
  // difficile: un secondo sperone valido (sano, più in basso del capo) al posto di un succhione
  let sp2 = null;
  if (hard()){
    const i = distr.findIndex(d=> !d.onSpur);
    if (i >= 0){
      sp2 = baseCane(distr[i].id);
      sp2.lengthNodes = rndInt(4, 8);
      distr[i] = sp2;
    }
  }
  const onSpur = distr.filter(d=> d.onSpur);
  const onOld = distr.filter(d=> !d.onSpur);
  let spur;
  const old = onOld.slice();
  if (caso === "A"){
    // sperone sotto il capo; i distrattori stanno spesso in cima (il tralcio distale è il più vigoroso, non sempre il migliore)
    spur = [sp, capo];
    onSpur.forEach(d=>{ if (chance(0.75)) spur.push(d); else spur.splice(rndInt(0, spur.length - 1), 0, d); });
  } else {
    spur = [capo, ...shuffle(onSpur)];
    old.push(sp);
  }
  spur.forEach((c, i)=>{
    const tt = spur.length === 1 ? 0.6 : 0.22 + 0.76 * i / (spur.length - 1);
    c.origine = "due_anni";
    c.ins = {on:"spur", t:Math.min(1, Math.max(0.12, tt + rnd(-0.03, 0.03))), side:1};
    c.h = 20 + 40 * c.ins.t;
  });
  old.forEach(c=>{
    c.origine = "vecchio";
    const on = chance(0.5) ? "head" : "side";
    c.ins = {on, t:0, side: chance(0.5) ? -1 : 1};
    c.h = on === "head" ? rnd(0, 6) : rnd(8, 14);
  });
  const canes = [...spur, ...old].sort((a, b)=> a.id - b.id);
  const letters = shuffle("ABCDEF".slice(0, canes.length).split(""));
  canes.forEach((c, i)=>{ c.label = letters[i]; });
  // le gemme (e quindi i tralci) sullo sperone dell'anno scorso si alternano sui due lati
  const first = chance(0.5) ? "sinistra" : "destra";
  spur.forEach((c, i)=>{ c.latoFerita = i % 2 === 0 ? first : (first === "sinistra" ? "destra" : "sinistra"); });
  old.forEach(c=>{ c.latoFerita = c.ins.on === "side" ? "destra" : (c.ins.side < 0 ? "sinistra" : "destra"); });
  if (sp2){
    // un solo sperone lascia tutte le ferite dallo stesso lato: bisogna guardare il lato di inserzione
    const X = chance(0.5) ? "sinistra" : "destra", Y = X === "sinistra" ? "destra" : "sinistra";
    distr.forEach(d=>{ if (d !== sp2) d.latoFerita = X; });
    const good = chance(0.5) ? sp : sp2, other = good === sp ? sp2 : sp;
    good.latoFerita = Y; other.latoFerita = X;
    capo.latoFerita = chance(0.5) ? X : Y;
  }
  canes.forEach(c=> setMm(c, bias));
  const vigore = hard() ? vigoreOf(canes) : "normale";
  return {tipo:"guyot", canes, caso, idealCapoId:capo.id, idealSperoneId:sp.id, vigore, diametroMedio:Math.round(meanMm(canes) * 10) / 10};
}

function generateCordoneVine(){
  const dp = diffParams(), T = CORD_TARGETS[STATE.obiettivo];
  const bias = hard() ? pick([-1, 0, 1]) : 0;
  const n = dp.cordPos, spacing = 48;
  // posizioni alternate sui due bracci, dal centro verso l'esterno (circa 24 cm l'una dall'altra)
  const xs = [];
  for (let i = 0; i < n; i++){ const arm = i % 2 === 0 ? -1 : 1; xs.push(arm * (30 + Math.floor(i / 2) * spacing)); }
  xs.sort((a, b)=> a - b);
  const positions = [];
  let id = 0;
  const pool = ["verde", "sottile", "grosso", "lato", "cieche"];
  xs.forEach((x, pi)=>{
    const b = baseCane(id++), d = baseCane(id++);
    b.lengthNodes = rndInt(3, 6); d.lengthNodes = rndInt(3, 7);
    if (chance(dp.cordBasalBad)) applyDefect(b, pick(pool), T);
    if (chance(dp.cordDistalBad)) applyDefect(d, pick(pool), T);
    if (!b.blindNodes.length && chance(dp.cordBlind)) addBlind(b, 1, 1, 2);
    if (!d.blindNodes.length && chance(dp.cordBlind)) addBlind(d, 1, 1, 2);
    b.ruolo = "basale"; d.ruolo = "distale";
    b.pos = d.pos = pi;
    b.h = 4; d.h = 12;
    b.label = `${pi + 1}B`; d.label = `${pi + 1}D`;
    // basale e distale nascono su lati opposti del vecchio sperone
    b.latoFerita = chance(0.5) ? "sinistra" : "destra";
    d.latoFerita = b.latoFerita === "sinistra" ? "destra" : "sinistra";
    setMm(b, bias); setMm(d, bias);
    positions.push({posId:pi, x, canes:[b, d]});
  });
  const all = positions.flatMap(p=> p.canes);
  const vigore = hard() ? vigoreOf(all) : "normale";
  return {tipo:"cordone", positions, vigore, diametroMedio:Math.round(meanMm(all) * 10) / 10};
}

function allCanes(){
  return STATE.vine.tipo === "guyot" ? STATE.vine.canes : STATE.vine.positions.flatMap(p=> p.canes);
}
function findCane(caneId){ return allCanes().find(c=> c.id === caneId); }

/* ---------- Punteggio Guyot ---------- */
function capoPart(c, k, t){
  const fb = [];
  let pts = 0;
  const eff = effectiveBudsUpTo(c, k);
  // su un tralcio difettoso le gemme lasciate non danno la produzione prevista: il carico vale la metà
  const unfit = caneDefects(c).length > 0 || c.origine !== "due_anni";
  const f = unfit ? 0.35 : 1;
  if (eff >= t.min && eff <= t.max){
    pts += W.capoCarico * f;
    fb.push({good:!unfit, p:"carico", title:"Carico di gemme corretto", text:`${eff} gemme franche rientrano nel target ${t.min}-${t.max} per l'obiettivo scelto.${unfit ? " Ma su un tralcio difettoso le gemme non danno la produzione prevista: il carico vale solo un terzo dei punti." : ""}`});
  } else {
    const diff = eff < t.min ? t.min - eff : eff - t.max;
    pts += Math.max(0, W.capoCarico - 12 * diff) * f;
    const r = cutRange(c, t.min, t.max);
    fb.push({good:false, p:"carico", title:"Carico di gemme fuori target", text:`${eff} gemme franche effettive, contro un target di ${t.min}-${t.max}.${c.blindNodes.length ? " Le gemme cieche non contano." : ""} Le gemme della corona, alla base, non si contano mai.`,
      next: r ? `su questo tralcio taglia ${cutText(r)}, contando solo le gemme franche.` : "questo tralcio non ha abbastanza gemme franche per il target: scegli un capo più lungo."});
  }
  if (c.origine === "due_anni"){
    pts += W.capoOrigine;
    fb.push({good:true, p:"ramificazione", title:"Capo sul legno di due anni", text:"Il capo a frutto nasce dallo sperone dell'anno scorso: le sue gemme sono fertili e la struttura della pianta prosegue in modo ordinato.", tag:"Simonit&Sirch · ramificazione controllata"});
  } else {
    fb.push({good:false, p:"ramificazione", title:"Capo sul legno vecchio", text:"Il tralcio scelto nasce dal legno vecchio della testa (un succhione): le gemme alla base sono poco fertili e il capo non prosegue la struttura costruita con lo sperone dell'anno scorso.", tag:"Simonit&Sirch · ramificazione controllata",
      next:"scegli il capo tra i tralci nati sullo sperone dell'anno scorso (nella scheda: «Legno di 2 anni»)."});
  }
  if (c.diametro === "matita"){
    pts += W.capoDiametro;
    fb.push({good:true, p:"tagli", title:"Ferita proporzionata", text:"Tralcio ‘a matita’: quando l'anno prossimo toglierai questo capo alla base, la ferita sarà piccola e il cono di disseccamento resterà contenuto.", tag:"Simonit&Sirch · tagli piccoli e mirati"});
  } else {
    if (c.diametro === "grosso") pts += 3;
    fb.push({good:false, p:"tagli", title: c.diametro === "sottile" ? "Capo troppo sottile" : "Ferita sproporzionata", text: c.diametro === "sottile" ? "Tralcio sottile: ha scarsa vigoria e riserve insufficienti." : "Tralcio grosso: quando l'anno prossimo lo toglierai alla base, la ferita sarà ampia. Il metodo Simonit e Sirch associa le ferite ampie a coni di disseccamento più profondi e a un rischio più alto di malattie del legno.", tag:"Simonit&Sirch · tagli piccoli e mirati",
      next:"scegli un capo «a matita», né sottile né grosso (riga «Diametro» della scheda)."});
  }
  if (c.lignificazione >= 0.6) pts += W.capoLign;
  else fb.push({good:false, p:"legno", title:"Legno poco lignificato", text:"Il tralcio scelto è ancora verdastro: rischia di seccare, meglio un tralcio più maturo.",
    next:"controlla la riga «Lignificazione» e scegli un tralcio maturo, color nocciola."});
  if (c.lato === "giusto"){
    pts += W.capoLato;
    fb.push({good:true, p:"linfa", title:"Flusso linfatico rispettato", text:"Il tralcio prosegue la continuità del flusso linfatico, invece di interromperla o farla deviare.", tag:"Simonit&Sirch · continuità linfatica"});
  } else {
    fb.push({good:false, p:"linfa", title:"Flusso linfatico interrotto", text:"Il tralcio cresce dal lato sbagliato, verso il basso: la linfa dovrebbe cambiare percorso, un'interruzione che il metodo Simonit&Sirch raccomanda di evitare.", tag:"Simonit&Sirch · continuità linfatica",
      next:"scarta i tralci che scendono verso il basso e scegli uno rivolto verso il filo."});
  }
  return {pts:Math.round(pts), fb, eff};
}

function speronePart(s, k, capo){
  const fb = [];
  let pts = 0;
  const eff = effectiveBudsUpTo(s, k);
  const unfit = caneDefects(s).length > 0;
  const f = unfit ? 0.35 : 1;
  if (eff === 2){
    pts += W.spCarico * f;
    fb.push({good:!unfit, p:"carico", title:"Sperone a 2 gemme", text:`Lo sperone di rinnovo è tagliato correttamente a 2 gemme franche.${unfit ? " Ma il tralcio è difettoso: il capo che ne nascerà sarà debole, e il carico vale solo un terzo dei punti." : ""}`});
  } else if (Math.abs(eff - 2) === 1){
    pts += 5 * f;
    const r2 = cutRange(s, 2, 2);
    fb.push({good:false, p:"carico", title:`Sperone a ${eff} ${eff === 1 ? "gemma" : "gemme"}`, text:"La regola più diffusa è 2 gemme franche. Alcuni manuali ammettono 1 gemma (vitigni molto fertili, obiettivi di alta qualità) o 3 (vitigni poco fertili alla base): punteggio parziale.",
      next: r2 ? `taglia lo sperone ${cutText(r2)}: restano 2 gemme franche.` : "scegli come sperone un tralcio con almeno 2 gemme franche alla base."});
  } else {
    const r2 = cutRange(s, 2, 2);
    fb.push({good:false, p:"carico", title:"Sperone non a 2 gemme", text:`Hai lasciato ${eff} ${eff === 1 ? "gemma" : "gemme"} sullo sperone: la regola classica è tagliare a 2 gemme franche.`,
      next: r2 ? `taglia lo sperone ${cutText(r2)}: restano 2 gemme franche.` : "scegli come sperone un tralcio con almeno 2 gemme franche alla base."});
  }
  if (s.h < capo.h - 3){
    pts += W.spBasso;
    fb.push({good:true, p:"ramificazione", title:"Sperone più basso del capo", text:"Lo sperone è sotto il capo a frutto, vicino alla testa: l'anno prossimo il nuovo capo nascerà in basso e la testa del ceppo non si alza.", tag:"Simonit&Sirch · ramificazione controllata"});
  } else {
    fb.push({good:false, p:"ramificazione", title:"Sperone più alto del capo", text:"Lo sperone di rinnovo va scelto più in basso del capo a frutto, il più vicino possibile alla testa: altrimenti ogni anno la testa del ceppo si alza e la struttura si allunga.", tag:"Simonit&Sirch · ramificazione controllata",
      next:"confronta la riga «Inserzione» dei tralci e scegli come sperone uno che nasca più in basso del capo, anche dal legno vecchio."});
  }
  if (s.lignificazione >= 0.6) pts += W.spLign;
  else fb.push({good:false, p:"legno", title:"Sperone poco lignificato", text:"Lo sperone darà il capo a frutto dell'anno prossimo: se il legno è ancora verde rischia di seccare durante l'inverno.",
    next:"anche per lo sperone scegli un tralcio maturo (riga «Lignificazione»)."});
  if (s.diametro === "matita") pts += W.spDiametro;
  else {
    if (s.diametro === "grosso") pts += 2;
    fb.push({good:false, p:"tagli", title:`Sperone ${s.diametro}`, text: s.diametro === "sottile" ? "Un tralcio sottile ha poche riserve: il capo a frutto che ne nascerà sarà debole." : "Un tralcio grosso lascia l'anno prossimo una ferita ampia sulla testa del ceppo.", tag:"Simonit&Sirch · tagli piccoli e mirati",
      next:"anche per lo sperone preferisci un tralcio «a matita»."});
  }
  if (s.lato === "giusto") pts += W.spLato;
  else fb.push({good:false, p:"linfa", title:"Sperone dal lato sbagliato", text:"Lo sperone cresce verso il basso: il capo che ne nascerà l'anno prossimo interromperà il flusso linfatico.", tag:"Simonit&Sirch · continuità linfatica",
    next:"scegli come sperone un tralcio rivolto verso l'alto."});
  return {pts:Math.round(pts), fb, eff};
}

// difficile: ferite dei tralci tolti, meglio se tutte dallo stesso lato
function feritePart(removed){
  const fb = [];
  const sx = removed.filter(c=> c.latoFerita === "sinistra").length, dx = removed.length - sx;
  let pts;
  const frac = removed.length ? Math.max(sx, dx) / removed.length : 1;
  pts = frac === 1 ? W.ferite : frac >= 0.75 ? Math.round(W.ferite * 0.4) : 0;
  if (sx === 0 || dx === 0){
    fb.push({good:true, p:"ferite", title:"Ferite sullo stesso lato", text:`Le ${removed.length === 1 ? "ferita" : removed.length + " ferite"} dei tralci tolti stanno tutte dallo stesso lato: sull'altro lato il flusso della linfa resta continuo.`, tag:"Simonit&Sirch · ferite sullo stesso lato"});
  } else {
    fb.push({good:false, p:"ferite", title:"Ferite su entrambi i lati", text:`Hai lasciato ${sx} ${sx === 1 ? "ferita" : "ferite"} a sinistra e ${dx} a destra: così il flusso della linfa è interrotto su tutti e due i lati del legno.`, tag:"Simonit&Sirch · ferite sullo stesso lato",
      next:"guarda la riga «Lato di inserzione» dei tralci e scegli quali tenere in modo che quelli tolti stiano tutti dalla stessa parte."});
  }
  return {pts, fb, sx, dx};
}

function rawGuyot(ch){
  const t = guyotTarget();
  const capo = findCane(ch.capo.caneId), sp = findCane(ch.sperone.caneId);
  const C = capoPart(capo, ch.capo.cutNode, t);
  const S = speronePart(sp, ch.sperone.cutNode, capo);
  const F = hard() ? feritePart(STATE.vine.canes.filter(c=> c.id !== capo.id && c.id !== sp.id)) : {pts:0, fb:[]};
  let gate = null;
  if (ch.capo.cutNode >= capo.lengthNodes && ch.sperone.cutNode >= sp.lengthNodes){
    gate = {why:"nessun taglio", text:`Non hai accorciato né il capo a frutto né lo sperone: una vite non potata produce troppi germogli deboli e grappoli piccoli, e la struttura si allunga. Il punteggio non può superare ${GATE_CAP}.`,
      next:`accorcia il capo a ${t.min}-${t.max} gemme franche e lo sperone a 2.`};
  } else if (C.eff < Math.ceil(t.min / 2)){
    gate = {why:"capo quasi senza gemme", text:`Sul capo a frutto restano solo ${C.eff} ${C.eff === 1 ? "gemma franca" : "gemme franche"}, meno della metà del minimo (${t.min}): la produzione dell'anno sarebbe quasi nulla. Il punteggio non può superare ${GATE_CAP}.`,
      next:`il capo a frutto è il tralcio lungo: lascia ${t.min}-${t.max} gemme franche; è lo sperone che si taglia a 2.`};
  }
  if (hard() && vigorShift() !== 0){
    const b = OBJ_TARGETS[STATE.obiettivo];
    C.fb.unshift({good:true, info:true, title:`Vigore ${STATE.vine.vigore}`, text:`Il diametro medio dei tralci è ${String(STATE.vine.diametroMedio).replace(".", ",")} mm: la pianta ha un vigore ${STATE.vine.vigore}, quindi il target del capo passa da ${b.min}-${b.max} a ${t.min}-${t.max} gemme franche.`});
  }
  return {raw:C.pts + S.pts + F.pts, fb:[...C.fb, ...S.fb, ...F.fb], effC:C.eff, effS:S.eff, gate};
}

// il massimo ottenibile su questa vite (il punteggio è sempre relativo a questo)
function bestRawGuyot(){
  const t = guyotTarget();
  const canes = STATE.vine.canes;
  let best = 0;
  canes.forEach(c=>{
    let bc = 0;
    for (let k = 1; k <= c.lengthNodes; k++) bc = Math.max(bc, capoPart(c, k, t).pts);
    canes.forEach(s=>{
      if (s.id === c.id) return;
      let bs = 0;
      for (let k = 1; k <= s.lengthNodes; k++) bs = Math.max(bs, speronePart(s, k, c).pts);
      const bf = hard() ? feritePart(canes.filter(x=> x.id !== c.id && x.id !== s.id)).pts : 0;
      best = Math.max(best, bc + bs + bf);
    });
  });
  return best || 1;
}

function evaluateGuyot(ch){
  const r = rawGuyot(ch);
  const best = bestRawGuyot();
  let score = Math.round(100 * r.raw / best);
  const fb = r.fb.slice();
  const maxRaw = 100 + (hard() ? W.ferite : 0);
  if (best < maxRaw) fb.push({good:true, info:true, title:"Punteggio relativo a questa vite", text:`Su questa vite nessuna potatura era perfetta: il massimo possibile era ${best} punti su ${maxRaw}. Il tuo punteggio è calcolato rispetto a quel massimo.`});
  if (r.gate){
    score = Math.min(score, GATE_CAP);
    fb.unshift({good:false, gate:true, title:"Potatura non valida", text:r.gate.text, next:r.gate.next});
  }
  return {score, fb, effC:r.effC, effS:r.effS, raw:r.raw, best, gate:r.gate};
}

/* ---------- Punteggio del cordone speronato ---------- */
function cordTargetText(T){ return T.min === T.max ? `${T.min}` : `${T.min}-${T.max}`; }
function cordPosRaw(pos, chB, chD){
  const T = cordTarget();
  const [b, d] = pos.canes;
  const P = `Posizione ${pos.posId + 1}`;
  const fb = [];
  const kept = [];
  if (chB && !chB.removed) kept.push({c:b, k:chB.cutNode, basal:true});
  if (chD && !chD.removed) kept.push({c:d, k:chD.cutNode, basal:false});
  if (!kept.length){
    fb.push({good:false, p:"posizioni", title:`${P}: posizione svuotata`, text:"Hai tolto entrambi i tralci: su questo tratto di cordone non resta nessuno sperone e la posizione è persa. Anche un tralcio difettoso, tagliato corto, è meglio di niente.",
      next:`tieni sempre uno dei due tralci della posizione ${pos.posId + 1}: di norma il basale ${b.label}.`});
    return {raw:10, fb};
  }
  if (kept.length === 2){
    fb.push({good:false, p:"ritorno", title:`${P}: due speroni sulla stessa posizione`, text:"Hai tenuto sia il tralcio basale sia il distale: troppe gemme su una posizione e sperone che si allunga. Tieni il basale e togli il distale (taglio di ritorno).",
      next:`elimina il tralcio ${d.label} con «Elimina (taglio di ritorno)» e tieni solo ${b.label}.`});
    return {raw:15, fb};
  }
  const {c, k, basal} = kept[0];
  let raw = 0;
  const bDef = caneDefects(b);
  const bBad = bDef.length > 0 || maxFranche(b) < T.min;
  if (basal){
    raw += 40;
    fb.push({good:true, p:"ritorno", title:`${P}: taglio di ritorno`, text:"Hai tenuto il tralcio basale e tolto il distale: lo sperone resta vicino al cordone."});
  } else if (bBad){
    raw += 30;
    fb.push({good:true, p:"ritorno", title:`${P}: tenuto il distale`, text:`Il tralcio basale era difettoso (${bDef.length ? bDef.join(", ") : "troppo poche gemme franche"}): tenere il distale è accettabile, ma lo sperone si allunga di un internodo.`});
  } else {
    raw += 5;
    fb.push({good:false, p:"ritorno", title:`${P}: manca il taglio di ritorno`, text:"Hai tenuto il tralcio distale anche se il basale era sano: così lo sperone si allunga ogni anno. Tieni il basale e togli il distale.",
      next:`tieni ${b.label} come sperone ed elimina ${d.label}.`});
  }
  if (c.diametro === "matita") raw += 15;
  else {
    if (c.diametro === "grosso") raw += 6;
    fb.push({good:false, p:"sani", title:`${P}: tralcio ${c.diametro}`, text: c.diametro === "sottile" ? "Uno sperone sottile dà germogli deboli." : "Uno sperone grosso lascerà una ferita ampia sul cordone.",
      next:"confronta i due tralci della posizione e tieni quello «a matita», se c'è."});
  }
  if (c.lignificazione >= 0.6) raw += 10;
  else fb.push({good:false, p:"sani", title:`${P}: legno verde`, text:"Il tralcio tenuto non è maturo: rischia di seccare durante l'inverno.",
    next:"confronta i due tralci e tieni quello con la lignificazione buona."});
  if (c.lato === "giusto") raw += 10;
  else fb.push({good:false, p:"sani", title:`${P}: lato sbagliato`, text:"Il tralcio tenuto cresce verso il basso: interrompe il flusso linfatico lungo il cordone.",
    next:"tieni il tralcio rivolto verso l'alto."});
  const eff = effectiveBudsUpTo(c, k);
  const tt = cordTargetText(T);
  if (eff >= T.min && eff <= T.max){
    raw += 25;
    fb.push({good:true, p:"gemme", title:`${P}: ${eff} ${eff === 1 ? "gemma franca" : "gemme franche"}`, text:`Nel target di ${tt} per sperone dell'obiettivo scelto.`});
  } else if (eff === T.min - 1 || eff === T.max + 1){
    raw += 12;
    const rr = cutRange(c, T.min, T.max);
    fb.push({good:false, p:"gemme", title:`${P}: ${eff} ${eff === 1 ? "gemma" : "gemme"}, una fuori target`, text:`Il target per l'obiettivo scelto è ${tt} per sperone. Alcuni manuali ammettono una gemma in più o in meno (vitigni poco fertili alla base, vigore della pianta): punteggio parziale.`,
      next: rr ? `su ${c.label} taglia ${cutText(rr)}.` : `${c.label} non arriva al target: valuta l'altro tralcio della posizione.`});
  } else {
    const rr = cutRange(c, T.min, T.max);
    fb.push({good:false, p:"gemme", title:`${P}: ${eff} ${eff === 1 ? "gemma" : "gemme"}`, text:`Troppo lontano dal target di ${tt} gemme franche per sperone.`,
      next: rr ? `su ${c.label} taglia ${cutText(rr)}.` : `${c.label} non arriva al target: valuta l'altro tralcio della posizione.`});
  }
  return {raw, fb};
}
// tutte le scelte possibili su una posizione: tenere uno dei due tralci a k gemme (l'altro tolto), o nessuno, o entrambi interi
function cordPosOptions(pos){
  const [b, d] = pos.canes;
  const opts = [{chB:{caneId:b.id, cutNode:0, removed:true}, chD:{caneId:d.id, cutNode:0, removed:true}},
    {chB:{caneId:b.id, cutNode:b.lengthNodes, removed:false}, chD:{caneId:d.id, cutNode:d.lengthNodes, removed:false}}];
  [b, d].forEach(c=>{
    for (let k = 1; k <= c.lengthNodes; k++){
      opts.push({chB: c === b ? {caneId:b.id, cutNode:k, removed:false} : {caneId:b.id, cutNode:0, removed:true},
        chD: c === d ? {caneId:d.id, cutNode:k, removed:false} : {caneId:d.id, cutNode:0, removed:true}});
    }
  });
  return opts;
}
function removedOf(pos, chB, chD){
  const [b, d] = pos.canes;
  return [chB && chB.removed ? b : null, chD && chD.removed ? d : null].filter(Boolean);
}
// quota di ferite della posizione che stanno sul lato scelto (10 punti in difficile)
function sideBonus(removed, side){
  if (!removed.length) return 0;
  return W.ferite * removed.filter(c=> c.latoFerita === side).length / removed.length;
}
function cordPosBest(pos, side){
  let best = 0;
  cordPosOptions(pos).forEach(o=>{
    const v = cordPosRaw(pos, o.chB, o.chD).raw + (side ? sideBonus(removedOf(pos, o.chB, o.chD), side) : 0);
    if (v > best) best = v;
  });
  return best;
}
function evaluateCordone(choices){
  const fb = [], posScores = [], bests = [];
  const P = STATE.vine.positions;
  const raws = P.map(pos=> cordPosRaw(pos, choices[pos.canes[0].id], choices[pos.canes[1].id]));
  if (!hard()){
    let total = 0;
    P.forEach((pos, i)=>{
      const best = cordPosBest(pos);
      const sc = Math.round(100 * raws[i].raw / best);
      total += sc; posScores.push(sc); bests.push(best);
      fb.push(...raws[i].fb);
      if (best < 100) fb.push({good:true, info:true, title:`Posizione ${pos.posId + 1}: nessuna scelta perfetta`, text:`Su questa posizione nessun tralcio era perfetto: il massimo ottenibile era ${best} punti su 100, e il punteggio della posizione è calcolato rispetto a quel massimo.`});
    });
    return {score:Math.round(total / P.length), fb, posScores, bests};
  }
  // difficile: le ferite dei tralci tolti contano per tutta la vite, meglio se dallo stesso lato
  const removed = P.flatMap((pos, i)=> removedOf(pos, choices[pos.canes[0].id], choices[pos.canes[1].id]));
  const sx = removed.filter(c=> c.latoFerita === "sinistra").length, dx = removed.length - sx;
  const side = sx >= dx ? "sinistra" : "destra";
  let total = 0;
  P.forEach((pos, i)=>{
    const v = raws[i].raw + sideBonus(removedOf(pos, choices[pos.canes[0].id], choices[pos.canes[1].id]), side);
    total += v;
    fb.push(...raws[i].fb);
  });
  const bestFor = sd=> P.reduce((a, pos)=> a + cordPosBest(pos, sd), 0);
  const bestSide = bestFor("sinistra") >= bestFor("destra") ? "sinistra" : "destra";
  const bestTotal = bestFor(bestSide);
  P.forEach((pos, i)=>{
    const v = raws[i].raw + sideBonus(removedOf(pos, choices[pos.canes[0].id], choices[pos.canes[1].id]), side);
    const b = cordPosBest(pos, side);
    posScores.push(Math.round(100 * v / b)); bests.push(b);
  });
  if (!removed.length){ /* nessun tralcio tolto: la regola delle ferite non si valuta */ }
  else if (sx === 0 || dx === 0) fb.push({good:true, p:"ferite", title:"Ferite sullo stesso lato", text:`Le ferite dei tralci tolti stanno tutte ${side === "sinistra" ? "a sinistra" : "a destra"} dei vecchi speroni: sull'altro lato il flusso della linfa lungo il cordone resta continuo.`, tag:"Simonit&Sirch · ferite sullo stesso lato"});
  else fb.push({good:false, p:"ferite", title:"Ferite su entrambi i lati", text:`Hai lasciato ${sx} ${sx === 1 ? "ferita" : "ferite"} a sinistra e ${dx} a destra dei vecchi speroni: il flusso della linfa è interrotto su tutti e due i lati.`, tag:"Simonit&Sirch · ferite sullo stesso lato",
    next:"guarda la riga «Lato di inserzione»: dove il basale e il distale sono equivalenti, togli quello che sta dal lato delle altre ferite."});
  if (vigorShift() !== 0){
    const b = CORD_TARGETS[STATE.obiettivo], T = cordTarget();
    fb.unshift({good:true, info:true, title:`Vigore ${STATE.vine.vigore}`, text:`Il diametro medio dei tralci è ${String(STATE.vine.diametroMedio).replace(".", ",")} mm: la pianta ha un vigore ${STATE.vine.vigore}, quindi il target per sperone passa da ${cordTargetText(b)} a ${cordTargetText(T)} gemme franche.`});
  }
  if (bestTotal < 100 * P.length + W.ferite * P.length) fb.push({good:true, info:true, title:"Punteggio relativo a questa vite", text:"Su questa vite nessuna potatura era perfetta in ogni posizione: il punteggio è calcolato rispetto al massimo ottenibile, ferite comprese."});
  return {score:Math.round(100 * total / bestTotal), fb, posScores, bests};
}

/* ---------- La potatura ideale su questa vite, ricavata dalle stesse regole ---------- */
function cmpKey(a, b){
  for (let i = 0; i < a.length; i++){ if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
  return 0;
}
function idealGuyot(){
  const canes = STATE.vine.canes;
  const t = guyotTarget();
  const mid = (t.min + t.max) / 2;
  let best = null;
  canes.forEach(cC=>{
    canes.forEach(cS=>{
      if (cC.id === cS.id) return;
      for (let kc = 1; kc <= cC.lengthNodes; kc++){
        for (let ks = 1; ks <= cS.lengthNodes; ks++){
          const ch = {capo:{caneId:cC.id, cutNode:kc}, sperone:{caneId:cS.id, cutNode:ks}};
          const r = rawGuyot(ch);
          const raw = r.gate ? -1 : r.raw;
          const key = [raw, -Math.abs(r.effC - mid), -kc, -ks];
          if (!best || cmpKey(key, best.key) > 0) best = {key, choices:ch};
        }
      }
    });
  });
  return {choices:best.choices, score:evaluateGuyot(best.choices).score};
}
function idealCordone(){
  const choices = {};
  const T = cordTarget();
  const mid = (T.min + T.max) / 2;
  const P = STATE.vine.positions;
  let side = null;
  if (hard()){
    const bestFor = sd=> P.reduce((a, pos)=> a + cordPosBest(pos, sd), 0);
    side = bestFor("sinistra") >= bestFor("destra") ? "sinistra" : "destra";
  }
  P.forEach(pos=>{
    const [b, d] = pos.canes;
    let best = null;
    cordPosOptions(pos).forEach(o=>{
      const kept = !o.chB.removed ? b : !o.chD.removed ? d : null;
      const both = !o.chB.removed && !o.chD.removed;
      const raw = cordPosRaw(pos, o.chB, o.chD).raw + (side ? sideBonus(removedOf(pos, o.chB, o.chD), side) : 0);
      const k = kept ? (kept === b ? o.chB.cutNode : o.chD.cutNode) : 0;
      const key = [raw, kept === b && !both ? 1 : 0, kept && !both ? -Math.abs(effectiveBudsUpTo(kept, k) - mid) : -99, -k];
      if (!best || cmpKey(key, best.key) > 0) best = {key, o};
    });
    choices[b.id] = best.o.chB; choices[d.id] = best.o.chD;
  });
  return {choices, score:evaluateCordone(choices).score};
}
/* ===================== LOGICA DEL GIOCO · FINE ===================== */

function startNewVine(){
  STATE.selectedCaneId = null;
  STATE.hoverCaneId = null;
  STATE.currentRole = "capo";
  STATE.choices = {capo:null, sperone:null};
  STATE.cordoneChoices = {};
  STATE.vine = STATE.forma === "guyot" ? generateGuyotVine() : generateCordoneVine();
  STATE.vine.drawSeed = Math.floor(Math.random() * 2147483647);
  STATE.vineSettings = {forma:STATE.forma, obiettivo:STATE.obiettivo, difficolta:STATE.difficolta};
  STATE.vineActive = true;
  STATE.zoomOff = false;
  clearNotice();
  STAGE.zoomKey = null;
  PENDING = null;

  $("#gtForma").textContent = isPhone() ? {guyot:"Guyot", cordone:"Cordone"}[STATE.forma] : FORMA_LABELS[STATE.forma];
  $("#gtObiettivo").textContent = OBJ_LABELS[STATE.obiettivo];
  const t = OBJ_TARGETS[STATE.obiettivo], T = CORD_TARGETS[STATE.obiettivo];
  $("#gtTarget").textContent = STATE.forma === "guyot" ? `${t.min}–${t.max} gemme` : `${T.min === T.max ? T.min : T.min + "–" + T.max} gemme per sperone`;
  const ex = $("#gtExtra");
  ex.hidden = STATE.difficolta !== "difficile";
  ex.textContent = `Ø medio ${String(STATE.vine.diametroMedio).replace(".", ",")} mm`;
  $("#gtVineNum").textContent = STATE.session.count + 1;
  $("#gtAvgScore").textContent = STATE.session.count > 0 ? Math.round(STATE.session.totalScore / STATE.session.count) : "—";
  $("#roleSec").hidden = STATE.forma !== "guyot";
  $("#chipsLabel").textContent = STATE.forma === "guyot" ? "Tralci" : "Tralci del cordone (B basale · D distale)";
  setSheetExpanded(false);

  const fxLayer = $('#vineSvg > g[data-layer="fx"]');
  if (fxLayer) fxLayer.innerHTML = "";
  refresh();
}

/* ================= SCELTE ================= */
function getChoiceForCane(caneId){
  if (STATE.forma === "guyot"){
    if (STATE.choices.capo && STATE.choices.capo.caneId === caneId) return {...STATE.choices.capo, role:"capo"};
    if (STATE.choices.sperone && STATE.choices.sperone.caneId === caneId) return {...STATE.choices.sperone, role:"sperone"};
    return null;
  }
  const c = STATE.cordoneChoices[caneId];
  return c ? {...c, role:"sperone"} : null;
}
function roleOfCane(caneId){
  const c = getChoiceForCane(caneId);
  if (!c) return null;
  if (STATE.forma === "cordone") return c.removed ? "removed" : "sperone";
  return c.role;
}
function setCutNode(caneId, node){
  if (STATE.forma === "guyot"){
    const role = STATE.currentRole;
    if (role === "capo" && STATE.choices.sperone && STATE.choices.sperone.caneId === caneId){
      STATE.choices.sperone = null;
    }
    if (role === "sperone" && STATE.choices.capo && STATE.choices.capo.caneId === caneId){
      STATE.choices.capo = null;
    }
    STATE.choices[role] = {caneId, cutNode:node};
  } else {
    STATE.cordoneChoices[caneId] = {caneId, cutNode:node, removed:false};
  }
}
function markRemoved(caneId){
  if (STATE.forma !== "cordone") return;
  STATE.cordoneChoices[caneId] = {caneId, cutNode:0, removed:true};
}
function clearChoice(caneId){
  if (STATE.forma === "guyot"){
    if (STATE.choices.capo && STATE.choices.capo.caneId === caneId) STATE.choices.capo = null;
    if (STATE.choices.sperone && STATE.choices.sperone.caneId === caneId) STATE.choices.sperone = null;
  } else {
    delete STATE.cordoneChoices[caneId];
  }
}
function choicesComplete(){
  if (STATE.forma === "guyot") return !!(STATE.choices.capo && STATE.choices.sperone);
  return allCanes().every(c=> STATE.cordoneChoices[c.id]);
}

/* ================= AZIONI DI GIOCO ================= */
function selectCane(caneId){
  if (STATE.selectedCaneId === caneId) return;
  STATE.selectedCaneId = caneId;
  refresh({scrollRuler:true});
}

const ROLE_WITH_ART = {capo:"il capo a frutto", sperone:"lo sperone di rinnovo"};
function snapshotChoices(){
  return {
    choices:{capo: STATE.choices.capo ? {...STATE.choices.capo} : null, sperone: STATE.choices.sperone ? {...STATE.choices.sperone} : null},
    cordone:JSON.parse(JSON.stringify(STATE.cordoneChoices)),
    role:STATE.currentRole, sel:STATE.selectedCaneId
  };
}
function restoreChoices(snap){
  STATE.choices = snap.choices;
  STATE.cordoneChoices = snap.cordone;
  STATE.currentRole = snap.role;
  STATE.selectedCaneId = snap.sel;
  refresh();
  toast("Scelta annullata");
}
// con un solo ruolo ancora libero, il prossimo taglio va a quello
function syncRoleToMissing(){
  if (STATE.forma !== "guyot") return false;
  const c = STATE.choices.capo, s = STATE.choices.sperone;
  const before = STATE.currentRole;
  if (!c && s) STATE.currentRole = "capo";
  else if (c && !s) STATE.currentRole = "sperone";
  return before !== STATE.currentRole;
}

function doCut(caneId, node){
  clearNotice();
  const prevKeep = keptLength(caneId);
  const prevRole = roleOfCane(caneId);
  const cane = findCane(caneId);
  const snap = snapshotChoices();
  STATE.selectedCaneId = caneId;
  let role = "sperone", advanced = false, displaced = null;
  if (STATE.forma === "guyot"){
    role = (prevRole === "capo" || prevRole === "sperone") ? prevRole : STATE.currentRole;
    const holder = STATE.choices[role];
    if (holder && holder.caneId !== caneId) displaced = holder.caneId;
    STATE.currentRole = role;
    setCutNode(caneId, node);
    advanced = syncRoleToMissing();
  } else {
    setCutNode(caneId, node);
  }
  const newKeep = keptLength(caneId);
  refresh({fx:{type:"cut", caneId, prevKeep, newKeep, pop: prevRole !== roleOfCane(caneId)}, flashStatus:advanced, popChoice:caneId, scrollRuler:true});
  if (displaced != null){
    toast(`Il tralcio ${findCane(displaced).label} non è più ${ROLE_WITH_ART[role]}: ora lo è il tralcio ${cane.label}`, "warn", {label:"Annulla", fn:()=> restoreChoices(snap)});
  } else if (!prevRole || prevRole === "removed"){
    const eff = effectiveBudsUpTo(cane, node);
    if (STATE.forma === "guyot"){
      toast(`${role === "capo" ? "Capo a frutto" : "Sperone"}: tralcio ${cane.label} · ${eff} ${eff === 1 ? "gemma franca" : "gemme franche"}`);
    } else {
      toast(`Sperone sul tralcio ${cane.label}: ${eff} ${eff === 1 ? "gemma" : "gemme"}`);
    }
  }
}

function doRemove(caneId){
  const prevKeep = keptLength(caneId);
  const cane = findCane(caneId);
  if (roleOfCane(caneId) === "removed"){
    clearChoice(caneId);
    refresh();
    toast(`Tralcio ${cane.label}: eliminazione annullata`);
    return;
  }
  markRemoved(caneId);
  refresh({fx:{type:"cut", caneId, prevKeep, newKeep:0, pop:true}, popChoice:caneId});
  toast(`Tralcio ${cane.label}: eliminato${cane.ruolo === "distale" ? " (taglio di ritorno)" : ""}`);
}

function doClear(caneId){
  clearChoice(caneId);
  syncRoleToMissing();
  refresh();
}
function deselectCane(){
  if (STATE.selectedCaneId == null) return;
  STATE.selectedCaneId = null;
  refresh();
}

// il selettore sceglie solo il ruolo del prossimo tralcio non ancora assegnato
function setRole(role){
  if (STATE.currentRole === role) return;
  STATE.currentRole = role;
  refresh();
}
// spostare un tralcio già scelto all'altro ruolo è un'azione esplicita della sua scheda
function moveRole(caneId, role){
  if (STATE.forma !== "guyot") return;
  const cur = roleOfCane(caneId);
  if ((cur !== "capo" && cur !== "sperone") || cur === role) return;
  const snap = snapshotChoices();
  const node = STATE.choices[cur].cutNode;
  const holder = STATE.choices[role];
  const displaced = holder && holder.caneId !== caneId ? holder.caneId : null;
  STATE.currentRole = role;
  setCutNode(caneId, node);
  syncRoleToMissing();
  refresh({fx:{type:"role", caneId, pop:true}, popChoice:caneId, flashStatus:true});
  const lbl = findCane(caneId).label;
  if (displaced != null){
    toast(`Tralcio ${lbl}: ora è ${ROLE_WITH_ART[role]}. Il tralcio ${findCane(displaced).label} non ha più un ruolo`, "warn", {label:"Annulla", fn:()=> restoreChoices(snap)});
  } else {
    toast(`Tralcio ${lbl}: ora è ${ROLE_WITH_ART[role]}`, null, {label:"Annulla", fn:()=> restoreChoices(snap)});
  }
}

$("#roleButtons").addEventListener("click", e=>{
  const b = e.target.closest("button[data-role]");
  if (b) setRole(b.dataset.role);
});
$("#caneChips").addEventListener("click", e=>{
  const b = e.target.closest("button[data-cane]");
  if (!b) return;
  const id = Number(b.dataset.cane);
  if (STATE.selectedCaneId === id) deselectCane(); else selectCane(id);
});
$("#selectedCaneInfo").addEventListener("click", e=>{
  const cell = e.target.closest("button[data-node]");
  if (cell){ doCut(STATE.selectedCaneId, Number(cell.dataset.node)); return; }
  const act = e.target.closest("button[data-act]");
  if (!act) return;
  if (act.dataset.act === "remove") doRemove(STATE.selectedCaneId);
  if (act.dataset.act === "clear") doClear(STATE.selectedCaneId);
  if (act.dataset.act === "move") moveRole(STATE.selectedCaneId, act.dataset.role);
});
$("#selectedCaneInfo").addEventListener("keydown", e=>{
  const cell = e.target.closest("button[data-node]");
  if (!cell) return;
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const cells = $$("button[data-node]", $("#selectedCaneInfo"));
  const i = cells.indexOf(cell) + (e.key === "ArrowRight" ? 1 : -1);
  if (cells[i]) cells[i].focus();
});
let resetArmed = 0;
$("#btnResetVine").addEventListener("click", ()=>{
  // azione distruttiva: serve un secondo tocco entro 3 secondi
  const lbl = $("#btnResetVineLbl");
  if (Date.now() - resetArmed > 3000){
    resetArmed = Date.now();
    lbl.textContent = "Tocca di nuovo per azzerare le scelte";
    setTimeout(()=>{ if (Date.now() - resetArmed >= 3000) lbl.textContent = "Ricomincia questa vite"; }, 3100);
    return;
  }
  resetArmed = 0;
  lbl.textContent = "Ricomincia questa vite";
  STATE.choices = {capo:null, sperone:null};
  STATE.cordoneChoices = {};
  STATE.currentRole = "capo";
  refresh();
  toast("Scelte azzerate su questa vite");
});

function setSheetExpanded(on){
  STATE.sheetExpanded = on;
  $("#panel").classList.toggle("is-expanded", on);
  $("#sheetHandle").setAttribute("aria-expanded", on ? "true" : "false");
  $("#sheetHandleLbl").textContent = on ? "Chiudi" : "Dettagli";
  $("#sheetHandle .sr-only").textContent = on ? "Nascondi dettagli" : "Mostra dettagli";
}
$("#sheetHandle").addEventListener("click", ()=> setSheetExpanded(!STATE.sheetExpanded));
document.addEventListener("keydown", e=>{
  if (e.key !== "Escape" || !$("#gameScreen").classList.contains("is-active")) return;
  if (STATE.sheetExpanded && !mqDesktop.matches){ setSheetExpanded(false); return; }
  deselectCane();
});

let toastTimer = null, noticeTimer = null;
// avvisi semplici sulla scena (non intercettano i tocchi); quelli con un'azione stanno nel pannello, così non coprono la vite
function toast(msg, kind, action){
  if (action){ notice(msg, kind, action); return; }
  const t = $("#toast");
  t.className = "toast" + (kind === "warn" ? " warn" : "");
  t.innerHTML = iconSvg(kind === "warn" ? "alert" : "check") + `<span>${esc(msg)}</span>`;
  void t.offsetWidth;
  t.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove("is-on"), 2600);
}
function notice(msg, kind, action){
  const n = $("#panelNotice");
  n.className = "panel-notice" + (kind === "warn" ? " warn" : "");
  n.innerHTML = `${iconSvg(kind === "warn" ? "alert" : "info")}<span>${esc(msg)}</span><button type="button" class="notice-act">${esc(action.label)}</button>`;
  n.hidden = false;
  $(".notice-act", n).addEventListener("click", ()=>{ clearNotice(); action.fn(); }, {once:true});
  restartClass(n, "flash-in");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(clearNotice, 9000);
}
function clearNotice(){
  clearTimeout(noticeTimer);
  const n = $("#panelNotice");
  if (n){ n.hidden = true; n.innerHTML = ""; }
}

$("#btnConfirm").addEventListener("click", ()=>{
  if (!choicesComplete()){
    restartClass($("#btnConfirm"), "shake");
    if (STATE.forma === "guyot"){
      const miss = [];
      if (!STATE.choices.capo) miss.push("il capo a frutto");
      if (!STATE.choices.sperone) miss.push("lo sperone di rinnovo");
      toast(`${miss.length > 1 ? "Mancano" : "Manca"} ${miss.join(" e ")}: ${miss.length > 1 ? "sceglili" : "sceglilo"} prima di confermare`, "warn");
    } else {
      const miss = allCanes().filter(c=> !STATE.cordoneChoices[c.id]).length;
      toast(miss === 1 ? "Manca un tralcio: taglialo o eliminalo prima di confermare" : `Mancano ${miss} tralci: tagliali o eliminali prima di confermare`, "warn");
    }
    return;
  }
  confirmPruning();
});

/* ================= PANNELLO ================= */
function guidance(){
  if (STATE.forma === "guyot"){
    const c = STATE.choices.capo, s = STATE.choices.sperone, sel = STATE.selectedCaneId;
    if (c && s) return {step:"Passo 3 di 3", title:"Pronto per la conferma", text:"Controlla capo a frutto e sperone di rinnovo, poi conferma la potatura."};
    const step = c || s ? "Passo 2 di 3" : "Passo 1 di 3";
    // il ruolo da proporre è quello che manca; con entrambi liberi decide il selettore
    const role = !c && !s ? STATE.currentRole : (!c ? "capo" : "sperone");
    const next = STATE.currentRole;
    if (sel != null && !roleOfCane(sel)){
      return {step, title: next === "capo" ? "Dove tagli il capo a frutto?" : "Dove tagli lo sperone?",
        text:"Tocca sul righello, o sulla vite, la gemma sopra cui tagliare: quella gemma resta, il resto del tralcio si elimina."};
    }
    if (role === "capo") return {step, title:"Scegli il capo a frutto", text:"Tocca il tralcio da tenere lungo per la produzione di quest'anno."};
    return {step, title:"Scegli lo sperone di rinnovo", text:"Tocca un altro tralcio da tagliare corto: darà il capo a frutto dell'anno prossimo."};
  }
  const n = STATE.vine.positions.length;
  const done = STATE.vine.positions.filter(p=> p.canes.every(c=> STATE.cordoneChoices[c.id])).length;
  if (done >= n) return {step:`Posizioni decise: ${done} di ${n}`, title:"Pronto per la conferma", text:"Hai deciso tutti i tralci del cordone. Controlla e conferma la potatura."};
  const sel = STATE.selectedCaneId;
  if (sel != null && !STATE.cordoneChoices[sel]){
    const c = findCane(sel);
    return {step:`Posizioni decise: ${done} di ${n}`, title:`Tralcio ${c.label}: taglia o elimina`, text:"Tocca la gemma sopra cui tagliare se lo tieni come sperone, oppure eliminalo."};
  }
  return {step:`Posizioni decise: ${done} di ${n}`, title:"Decidi ogni posizione del cordone", text:"Ogni vecchio sperone porta due tralci, il basale (B) e il distale (D): per ciascuno scegli se tenerlo come sperone, e dove tagliarlo, oppure eliminarlo."};
}

function renderPanel(opts){
  opts = opts || {};
  const g = guidance();
  $("#statusStep").textContent = g.step + (STATE.difficolta === "difficile" && STATE.vine ? ` · Ø medio ${String(STATE.vine.diametroMedio).replace(".", ",")} mm` : "");
  $("#statusTitle").textContent = g.title;
  $("#statusText").textContent = g.text;
  if (opts.flashStatus) restartClass($("#statusBox"), "flash");

  // ruoli
  $$("#roleButtons button").forEach(b=> b.setAttribute("aria-pressed", b.dataset.role === STATE.currentRole ? "true" : "false"));

  // tralci o posizioni
  const canes = allCanes().slice();
  if (STATE.forma === "guyot") canes.sort((a, b)=> a.label.localeCompare(b.label)); else canes.sort((a, b)=> a.id - b.id);
  $("#caneChips").innerHTML = canes.map(c=>{
    const r = roleOfCane(c.id);
    const roleTxt = r === "capo" ? ", capo a frutto" : r === "sperone" ? (STATE.forma === "guyot" ? ", sperone di rinnovo" : ", sperone tagliato") : r === "removed" ? ", eliminato" : "";
    const what = "Tralcio";
    return `<button type="button" class="cane-chip ${r ? "role-" + r : ""}" data-cane="${c.id}" aria-pressed="${STATE.selectedCaneId === c.id}" aria-label="${what} ${c.label}${roleTxt}">${c.label}${r ? '<span class="rdot"></span>' : ""}</button>`;
  }).join("");

  renderCaneCard(opts);

  // scelte
  const list = $("#selectionList");
  if (STATE.forma === "guyot"){
    const row = (role, name)=>{
      const ch = STATE.choices[role];
      if (!ch) return `<li class="pending"><span class="rdot"></span><span>${name}: <i>non scelto</i></span></li>`;
      const cane = findCane(ch.caneId);
      const eff = effectiveBudsUpTo(cane, ch.cutNode);
      const unit = role === "capo" ? "gemme franche" : "gemme";
      return `<li class="${role}" data-cane="${ch.caneId}"><span class="rdot"></span><span>${name}: <b>tralcio ${cane.label}</b>, taglio dopo il nodo ${ch.cutNode} → <b>${eff} ${unit}</b></span></li>`;
    };
    list.innerHTML = row("capo", "Capo a frutto") + row("sperone", "Sperone di rinnovo");
  } else {
    list.innerHTML = STATE.vine.positions.map(pos=>{
      const parts = pos.canes.map(c=>{
        const ch = STATE.cordoneChoices[c.id];
        if (!ch) return `${c.label} <i>da decidere</i>`;
        if (ch.removed) return `${c.label} eliminato`;
        const eff = effectiveBudsUpTo(c, ch.cutNode);
        return `${c.label} <b>${eff} ${eff === 1 ? "gemma" : "gemme"}</b>`;
      });
      const decided = pos.canes.every(c=> STATE.cordoneChoices[c.id]);
      const kept = pos.canes.filter(c=> STATE.cordoneChoices[c.id] && !STATE.cordoneChoices[c.id].removed).length;
      const cls = !decided ? "pending" : kept === 0 ? "removed" : "sperone";
      return `<li class="${cls}" data-cane="${pos.canes[0].id}"><span class="rdot"></span><span>Posizione ${pos.posId + 1}: ${parts.join(" · ")}</span></li>`;
    }).join("");
  }
  if (STATE.difficolta === "difficile"){
    let removed = [];
    if (STATE.forma === "guyot"){
      if (STATE.choices.capo && STATE.choices.sperone) removed = STATE.vine.canes.filter(c=> c.id !== STATE.choices.capo.caneId && c.id !== STATE.choices.sperone.caneId);
    } else {
      removed = allCanes().filter(c=> STATE.cordoneChoices[c.id] && STATE.cordoneChoices[c.id].removed);
    }
    const sx = removed.filter(c=> c.latoFerita === "sinistra").length, dx = removed.length - sx;
    list.insertAdjacentHTML("beforeend", removed.length
      ? `<li class="${sx && dx ? "pending" : "sperone"}"><span class="rdot"></span><span>Ferite dei tralci tolti: <b>${sx} a sinistra</b> · <b>${dx} a destra</b></span></li>`
      : `<li class="pending"><span class="rdot"></span><span>Ferite: ${STATE.forma === "guyot" ? "scegli capo e sperone per vedere dove resteranno" : "nessun tralcio tolto finora"}</span></li>`);
  }
  if (opts.popChoice != null){
    const li = $(`#selectionList li[data-cane="${opts.popChoice}"]`);
    if (li) restartClass(li, "pop");
  }
  $("#btnConfirm").setAttribute("aria-disabled", choicesComplete() ? "false" : "true");
}

function renderCaneCard(opts){
  const box = $("#selectedCaneInfo");
  const prevRuler = $(".ruler", box);
  const prevScroll = prevRuler ? prevRuler.scrollLeft : 0;
  const prevCane = box.dataset.cane;
  const sel = STATE.selectedCaneId;
  if (sel == null){
    box.dataset.cane = "";
    box.innerHTML = `<div class="empty-note">${iconSvg("hand")}<span>Tocca un tralcio sulla vite, o sceglilo qui sopra, per vederne le caratteristiche e decidere dove tagliare.</span></div>`;
    return;
  }
  const cane = findCane(sel);
  const choice = getChoiceForCane(sel);
  const role = roleOfCane(sel);
  const removed = role === "removed";
  const cut = choice && !removed ? choice.cutNode : null;
  const n = cane.lengthNodes;
  const what = "Tralcio";

  let tag;
  if (role === "capo") tag = '<span class="role-tag capo">Capo a frutto</span>';
  else if (role === "sperone") tag = '<span class="role-tag sperone">Sperone</span>';
  else if (removed) tag = '<span class="role-tag removed">Eliminato</span>';
  else tag = '<span class="role-tag none">Da decidere</span>';

  // le gemme della corona, alla base, compaiono nel righello ma non si possono scegliere e non si contano
  let cells = "";
  for (let j = 0; j < cane.corona; j++){
    cells += `<span class="bud-cell corona" aria-hidden="true" title="Gemma della corona: non si conta"><span class="g"></span><span class="n">C</span></span>`;
  }
  for (let i = 1; i <= n; i++){
    const blind = cane.blindNodes.includes(i);
    const cls = ["bud-cell"];
    if (blind) cls.push("blind");
    if (removed || (cut != null && i > cut)) cls.push("removed");
    if (cut === i){ cls.push("cut"); if (i === n) cls.push("last"); }
    const lbl = `Gemma ${i}${blind ? ", cieca" : ""}: taglia sopra questa gemma`;
    cells += `<button type="button" class="${cls.join(" ")}" data-node="${i}" aria-pressed="${cut === i}" aria-label="${lbl}"><span class="g"></span><span class="n">${i}</span></button>`;
  }

  const t = OBJ_TARGETS[STATE.obiettivo];
  let read;
  if (removed){
    read = `<span>Tralcio eliminato dal cordone</span>`;
  } else if (cut != null){
    const eff = effectiveBudsUpTo(cane, cut);
    const T = CORD_TARGETS[STATE.obiettivo];
    const base = STATE.difficolta === "difficile" ? "target base" : "target";
    const tgt = STATE.forma === "cordone" ? `${base} ${T.min === T.max ? T.min : T.min + "–" + T.max}` : role === "capo" ? `${base} ${t.min}–${t.max}` : "target 2";
    read = `<span>Taglio dopo il nodo <b>${cut}</b></span><span><b>${eff}</b> ${eff === 1 ? "gemma franca" : "gemme franche"} <span class="tgt">· ${tgt}</span></span>`;
  } else {
    const next = STATE.forma === "guyot" ? (STATE.currentRole === "capo" ? "capo a frutto" : "sperone di rinnovo") : "sperone";
    read = `<span>Nessun taglio ancora</span><span class="tgt">diventerà ${next}</span>`;
  }

  const blindTxt = cane.blindNodes.length ? `Gemme cieche: ${cane.blindNodes.join(", ")}` : "Nessuna gemma cieca";
  let origTxt, origCls = "";
  if (STATE.forma === "guyot"){
    if (cane.origine === "due_anni"){
      const where = cane.ins.t < 0.45 ? "in basso" : cane.ins.t < 0.75 ? "a metà" : "in alto";
      origTxt = `Legno di 2 anni · sullo sperone dell'anno scorso, ${where}`;
    } else {
      origTxt = "Legno vecchio · succhione della testa (non adatto come capo)";
      origCls = "warn";
    }
  } else {
    origTxt = cane.ruolo === "basale" ? "Basale · nasce in basso sul vecchio sperone" : "Distale · nasce in cima al vecchio sperone";
  }
  const hTxt = `${Math.round(cane.h * 0.6)} cm sopra la testa`;

  let actions = "";
  if (STATE.forma === "guyot" && (role === "capo" || role === "sperone")){
    const other = role === "capo" ? "sperone" : "capo";
    actions += `<button type="button" class="btn-line" data-act="move" data-role="${other}">${iconSvg("reset", "sm")}Usa come ${other === "capo" ? "capo a frutto" : "sperone"}</button>`;
  }
  if (STATE.forma === "cordone"){
    const remLbl = cane.ruolo === "distale" ? "Elimina (taglio di ritorno)" : "Elimina questo tralcio";
    actions += `<button type="button" class="btn-line danger" data-act="remove" aria-pressed="${removed}">${iconSvg(removed ? "undo" : "ban", "sm")}${removed ? "Ripristina il tralcio" : remLbl}</button>`;
  }
  if (choice && !removed){
    actions += `<button type="button" class="btn-line more-inline" data-act="clear">${iconSvg("undo", "sm")}Annulla il taglio</button>`;
  }

  box.dataset.cane = String(sel);
  box.innerHTML = `<div class="cane-card">
      <div class="head"><h4>${what} ${cane.label}</h4>${tag}</div>
      <div class="ruler-wrap">
        <div class="ruler" role="group" aria-label="${what} ${cane.label}: scegli la gemma sopra cui tagliare">
          <span class="end" aria-hidden="true">base</span>${cells}<span class="end" aria-hidden="true">punta</span>
        </div>
        <div class="ruler-read" aria-live="polite">${read}</div>
        <p class="ruler-note">C = gemma della corona: non si conta</p>
      </div>
      <div class="more"><dl class="facts">
        <dt>${STATE.forma === "guyot" ? "Origine" : "Tralcio"}</dt><dd class="${origCls}">${origTxt}</dd>
        ${STATE.forma === "guyot" ? `<dt>Inserzione</dt><dd>${hTxt}</dd>` : ""}
        <dt>Gemme</dt><dd class="num">${n} nodi + ${cane.corona} della corona</dd>
        <dt>Diametro</dt><dd class="${cane.diametro !== "matita" ? "bad" : ""}">${cane.diametro} · ${String(cane.mm).replace(".", ",")} mm</dd>
        ${STATE.difficolta === "difficile" ? `<dt>Lato di inserzione</dt><dd>${cane.latoFerita}: se lo togli, la ferita resta a ${cane.latoFerita}</dd>` : ""}
        <dt>Lignificazione</dt><dd class="${cane.lignificazione < 0.6 ? "bad" : ""}">${cane.lignificazione < 0.6 ? "scarsa (verde)" : "buona"}</dd>
        <dt>Lato</dt><dd class="${cane.lato !== "giusto" ? "bad" : ""}">${cane.lato === "giusto" ? "giusto, verso il filo" : "sbagliato, verso il basso"}</dd>
        <dt>Gemme cieche</dt><dd class="${cane.blindNodes.length ? "bad" : ""}">${blindTxt}</dd>
      </dl></div>
      ${actions ? `<div class="card-actions">${actions}</div>` : ""}
    </div>`;

  const ruler = $(".ruler", box);
  if (ruler){
    if (String(sel) === prevCane && !opts.scrollRuler){
      ruler.scrollLeft = prevScroll;
    } else {
      const target = $(".bud-cell.cut", ruler);
      if (target) ruler.scrollLeft = target.offsetLeft - ruler.clientWidth / 2 + target.clientWidth / 2;
      else ruler.scrollLeft = 0;
    }
  }
}

function focusKey(){
  const a = document.activeElement;
  if (!a || a === document.body || !$("#panel").contains(a)) return null;
  if (a.closest("#caneChips") && a.dataset.cane != null) return {sel:`#caneChips button[data-cane="${a.dataset.cane}"]`};
  if (a.dataset.node != null) return {sel:`#selectedCaneInfo button[data-node="${a.dataset.node}"]`, fallback:"#selectedCaneInfo button.bud-cell"};
  if (a.dataset.act) return {sel:`#selectedCaneInfo button[data-act="${a.dataset.act}"]`, fallback:"#selectedCaneInfo button.bud-cell[aria-pressed=\"true\"], #selectedCaneInfo button.bud-cell"};
  return null;
}
function restoreFocus(key){
  if (!key) return;
  const el = $(key.sel) || (key.fallback ? $(key.fallback) : null) || $(`#caneChips button[aria-pressed="true"]`);
  if (el && document.activeElement !== el) el.focus({preventScroll:true});
}
function refresh(opts){
  opts = opts || {};
  const fk = focusKey();
  renderPanel(opts);
  renderStage(opts);
  restoreFocus(fk);
}

/* ================= GEOMETRIA ================= */
function makeCurve(pts){
  const cum = [0];
  for (let i = 1; i < pts.length; i++){
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const length = cum[cum.length - 1];
  function at(s){
    s = clamp(s, 0, length);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1){
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = (cum[hi] - cum[lo]) || 1;
    const t = (s - cum[lo]) / seg;
    return {x: lerp(pts[lo][0], pts[hi][0], t), y: lerp(pts[lo][1], pts[hi][1], t)};
  }
  const c = {pts, cum, length, at, light:1};
  const tm = tangentAt(c, length / 2);
  c.light = ((-tm.y) * -0.55 + (tm.x) * -0.83) >= 0 ? 1 : -1;
  return c;
}
function quadPts(x0, y0, cx, cy, x1, y1, n){
  const pts = [];
  for (let i = 0; i <= n; i++){
    const t = i / n, mt = 1 - t;
    pts.push([mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * y0 + 2 * mt * t * cy + t * t * y1]);
  }
  return pts;
}
function cubicPts(p0, p1, p2, p3, n){
  const pts = [];
  for (let i = 0; i <= n; i++){
    const t = i / n, mt = 1 - t;
    pts.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return pts;
}
function tangentAt(c, s){
  const a = c.at(Math.max(0, s - 1.5)), b = c.at(Math.min(c.length, s + 1.5));
  let tx = b.x - a.x, ty = b.y - a.y;
  const l = Math.hypot(tx, ty) || 1;
  return {x: tx / l, y: ty / l};
}
function normalAt(c, s){
  const t = tangentAt(c, s);
  return {x: -t.y * c.light, y: t.x * c.light};
}
// nastro affusolato lungo la curva; off sposta il centro verso il lato illuminato (in frazioni della larghezza)
function ribbon(c, s0, s1, w0, w1, off){
  off = off || 0;
  const n = Math.max(3, Math.ceil(Math.abs(s1 - s0) / 5));
  const L = [], R = [];
  for (let i = 0; i <= n; i++){
    const s = s0 + (s1 - s0) * i / n;
    const p = c.at(s), nm = normalAt(c, s);
    const w = lerp(w0, w1, i / n);
    const cx = p.x + nm.x * w * off, cy = p.y + nm.y * w * off;
    L.push([cx + nm.x * w / 2, cy + nm.y * w / 2]);
    R.push([cx - nm.x * w / 2, cy - nm.y * w / 2]);
  }
  return "M" + L.map(fx).join("L") + "L" + R.reverse().map(fx).join("L") + "Z";
}
function lineAlong(c, s0, s1, off, wFn){
  const n = Math.max(3, Math.ceil(Math.abs(s1 - s0) / 6));
  const P = [];
  for (let i = 0; i <= n; i++){
    const s = s0 + (s1 - s0) * i / n;
    const p = c.at(s), nm = normalAt(c, s);
    const w = wFn(s);
    P.push([p.x + nm.x * w * off, p.y + nm.y * w * off]);
  }
  return "M" + P.map(fx).join("L");
}
function smoothClosed(pts){
  const n = pts.length;
  const mid = (a, b)=> [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = "M" + fx(mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) d += "Q" + fx(pts[i]) + " " + fx(mid(pts[i], pts[(i + 1) % n]));
  return d + "Z";
}
function distToPolyline(p, pts){
  let best = Infinity;
  for (let i = 1; i < pts.length; i++){
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / l2, 0, 1);
    const d = Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/* ================= DISPOSIZIONE DELLA VITE (coordinate del mondo: suolo a y = 0) ================= */
const G = {headY:-150, fruitWire:-172, wires:[-172, -282, -392], stakeX:19, stakeTop:-438};

function caneModel(cane, jx, jy, angleDeg, length){
  const rad = angleDeg * Math.PI / 180;
  const dx = Math.cos(rad) * length, dy = -Math.sin(rad) * length;
  const curveOff = (cane.angleSeed - 0.5) * 60;
  const curve = makeCurve(quadPts(jx, jy, jx + dx * 0.5 + curveOff, jy + dy * 0.5, jx + dx, jy + dy, 48));
  return {cane, curve, total:curve.length, jx, jy, angle:angleDeg};
}
function stubGeom(x, y, angleDeg, len, w0, w1, label){
  const rad = angleDeg * Math.PI / 180;
  const ex = x + Math.cos(rad) * len, ey = y - Math.sin(rad) * len;
  const curve = makeCurve(quadPts(x, y, (x + ex) / 2, (y + ey) / 2 - 3, ex, ey, 16));
  return {x:ex, y:ey, curve, w0, w1, label};
}
function guyotLayout(vine){
  const headX = 0, headY = G.headY;
  const stubMain = stubGeom(headX - 9, headY - 4, 118, 72, 15, 10, "sperone dell'anno scorso (legno di 2 anni)");
  const stubSide = stubGeom(headX + 9, headY - 2, 25, 30, 13, 9, null);
  const canes = vine.canes.map(cane=>{
    const r = mulberry32(Math.floor(cane.angleSeed * 1e9));   // angoli casuali ma stabili per ogni tralcio
    let jx, jy, angle;
    if (cane.ins.on === "spur"){
      const sS = stubMain.curve.length * cane.ins.t;
      const p = stubMain.curve.at(sS), nm = normalAt(stubMain.curve, sS);
      const sgn = (cane.latoFerita === "sinistra" ? -1 : 1) * (nm.x >= 0 ? 1 : -1);
      jx = p.x + nm.x * 5 * sgn; jy = p.y + nm.y * 5 * sgn;
      angle = 72 + r() * 52;
    } else if (cane.ins.on === "side"){
      jx = stubSide.x; jy = stubSide.y;
      angle = 38 + r() * 40;
    } else {
      const sd = cane.ins.side || 1;
      jx = headX + sd * 15; jy = headY + 3;
      angle = sd > 0 ? 22 + r() * 34 : 124 + r() * 34;
    }
    let length = 60 + cane.lengthNodes * 22;
    if (cane.lato === "sbagliato"){
      // cresce verso il basso: si vede subito che è dal lato sbagliato
      angle = jx < headX ? 198 + r() * 14 : -32 + r() * 14;
      length = 50 + cane.lengthNodes * 14;
    }
    return caneModel(cane, jx, jy, angle, length);
  });
  return {tipo:"guyot", headX, headY, stubs:[stubMain, stubSide], canes};
}
function cordoneArms(y0, xStart, xEnd){
  const mk = (dir, xEndArm)=>{
    const pts = cubicPts([0, -142], [dir * 4, -164], [dir * 26, y0 - 1], [dir * 58, y0], 18);
    for (let x = 70; x <= Math.abs(xEndArm) + 16; x += 12) pts.push([dir * x, y0 + Math.sin(x / 37) * 1.3]);
    return makeCurve(pts);
  };
  return [mk(-1, xStart), mk(1, xEnd)];
}
function cordoneLayout(vine){
  const y0 = -170;
  const xs = vine.positions.map(p=> p.x);
  const xStart = Math.min(...xs) - 34, xEnd = Math.max(...xs) + 34;
  const knobs = [], canes = [];
  vine.positions.forEach(pos=>{
    const [b, d] = pos.canes;
    const r = mulberry32(Math.floor(b.angleSeed * 1e9));
    // il vecchio sperone (legno di 2 anni) su cui sono nati i due tralci
    const knob = stubGeom(pos.x, y0 - 7, 90 + (r() - 0.5) * 18, 22, 11, 8, null);
    knobs.push(knob);
    const jb0 = knob.curve.at(knob.curve.length * 0.3), jd0 = knob.curve.at(knob.curve.length);
    const off = c=> (c.latoFerita === "sinistra" ? -4 : 4);
    const jb = {x:jb0.x + off(b), y:jb0.y}, jd = {x:jd0.x + off(d), y:jd0.y};
    const out = pos.x < 0 ? 1 : -1;   // il basale si apre verso l'esterno, il distale verso il centro
    let aB = 90 + out * (14 + r() * 16), aD = 90 - out * (4 + r() * 16);
    let lB = 44 + b.lengthNodes * 18, lD = 44 + d.lengthNodes * 18;
    if (b.lato === "sbagliato"){ aB = pos.x < 0 ? 205 : -25; lB = 40 + b.lengthNodes * 12; }
    if (d.lato === "sbagliato"){ aD = pos.x < 0 ? 200 : -20; lD = 40 + d.lengthNodes * 12; }
    canes.push(caneModel(b, jb.x, jb.y, aB, lB), caneModel(d, jd.x, jd.y, aD, lD));
  });
  return {tipo:"cordone", y0, xStart, xEnd, arms:cordoneArms(y0, xStart, xEnd), knobs, canes};
}
function layoutFor(vine){ return vine.tipo === "guyot" ? guyotLayout(vine) : cordoneLayout(vine); }

function newBounds(){ return {x0:Infinity, y0:Infinity, x1:-Infinity, y1:-Infinity}; }
function addPt(b, x, y){ if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
function layoutBounds(L){
  const b = newBounds();
  L.canes.forEach(m=> m.curve.pts.forEach(p=> addPt(b, p[0], p[1])));
  addPt(b, -46, 0); addPt(b, 46, 0);
  if (L.tipo === "cordone"){ addPt(b, L.xStart - 24, L.y0); addPt(b, L.xEnd + 24, L.y0); L.knobs.forEach(k=> k.curve.pts.forEach(p=> addPt(b, p[0], p[1]))); }
  else L.stubs.forEach(s=> s.curve.pts.forEach(p=> addPt(b, p[0], p[1])));
  return b;
}
function fitView(svg, b, opts){
  // i margini sono in pixel dello schermo: due passate per convertirli in unità del disegno
  const r = svg.getBoundingClientRect();
  if (r.width < 24 || r.height < 24) return null;   // SVG nascosto o non ancora impaginato
  const W = r.width, H = r.height;
  const maxK = opts.maxK || 1.5;
  let k = 1, x0, y0, bw, bh;
  for (let pass = 0; pass < 3; pass++){
    x0 = b.x0 - opts.padX / k; const x1 = b.x1 + opts.padX / k;
    y0 = b.y0 - opts.padTop / k; const y1 = b.y1 + opts.padBottom / k;
    bw = x1 - x0; bh = y1 - y0;
    if (W / bw > maxK){ const nw = W / maxK; x0 -= (nw - bw) / 2; bw = nw; }
    if (H / bh > maxK){ const nh = H / maxK; y0 -= (nh - bh); bh = nh; }
    const ar = W / H;
    if (bw / bh < ar){ const nw = bh * ar; x0 -= (nw - bw) / 2; bw = nw; }
    else { const nh = bw / ar; y0 -= (nh - bh); bh = nh; }
    k = W / bw;
  }
  svg.setAttribute("viewBox", `${x0.toFixed(1)} ${y0.toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return {x0, y0, bw, bh, k};
}
function ensureLayers(svg){
  let scene = svg.querySelector(':scope > g[data-layer="scene"]');
  if (!scene){
    scene = svgEl("g", {"data-layer":"scene"}, svg);
    svgEl("g", {"data-layer":"fx"}, svg);
  }
  return {scene, fxl: svg.querySelector(':scope > g[data-layer="fx"]')};
}

/* ================= PALETTE DELLA SCENA ================= */
const SEASON = {
  winter:{skyTop:"#E0DCCE", skyLow:"#F3EFE5", hillFar:"#DAD3C1", hillNear:"#D0C7B2", soilTop:"#CDB893", soilBot:"#B19A74", furrow:"rgba(92,70,44,.16)", grass:"#9C956F", row:"#B7AD95", band:"#A88F6A"},
  spring:{skyTop:"#D9E3D6", skyLow:"#F2F3E8", hillFar:"#C9D5BC", hillNear:"#B8C8A3", soilTop:"#B6C593", soilBot:"#9AAE79", furrow:"rgba(58,80,38,.14)", grass:"#7E9A5E", row:"#A6B492", band:"#A38D69"}
};
const WOOD = {
  ripe:{dark:"#5E3A1F", mid:"#8E5C34", light:"#C8955F", node:"#6B4326"},
  green:{dark:"#4F6236", mid:"#7C9258", light:"#B3C58E", node:"#5D7240"},
  old:{dark:"#463C30", mid:"#776B59", light:"#A69B86", node:"#584D3F"},
  trunk:{dark:"#3B3127", mid:"#65564A", light:"#90806B"}
};
const BUD = {fill:"#7B3F24", stroke:"#4A2412", hi:"#C0804F", blindFill:"#A39C8C", blindStroke:"#6B6557"};
const ROLE_FILL = {capo:"#233A2C", sperone:"#3E5C76", removed:"#E6DFCE"};
const ROLE_TEXT = {capo:"#F3EEE2", sperone:"#F3EEE2", removed:"#4F493E"};
const ROLE_NAME = {capo:"CAPO A FRUTTO", sperone:"SPERONE", removed:"ELIMINATO"};
const ACCENT = "#A9581F";

function baseWidth(cane){
  return cane.diametro === "sottile" ? 4.5 : cane.diametro === "grosso" ? 11 : 7.5;
}

/* ================= PITTURA: FONDALE, SOSTEGNI, LEGNO VECCHIO ================= */
function paintBackdrop(g, ctx, vb){
  const P = SEASON[ctx.season];
  const defs = svgEl("defs", null, g);
  const sky = svgEl("linearGradient", {id:`${ctx.uid}-sky`, gradientUnits:"userSpaceOnUse", x1:0, y1:vb.y0, x2:0, y2:0}, defs);
  svgEl("stop", {offset:"0", "stop-color":P.skyTop}, sky);
  svgEl("stop", {offset:"1", "stop-color":P.skyLow}, sky);
  const soil = svgEl("linearGradient", {id:`${ctx.uid}-soil`, gradientUnits:"userSpaceOnUse", x1:0, y1:0, x2:0, y2:vb.y0 + vb.bh}, defs);
  svgEl("stop", {offset:"0", "stop-color":P.soilTop}, soil);
  svgEl("stop", {offset:"1", "stop-color":P.soilBot}, soil);
  const trunk = svgEl("linearGradient", {id:`${ctx.uid}-trunk`, x1:"0", y1:"0", x2:"1", y2:"0"}, defs);
  [["0", WOOD.trunk.dark], [".3", WOOD.trunk.mid], [".46", WOOD.trunk.light], [".72", WOOD.trunk.mid], ["1", WOOD.trunk.dark]]
    .forEach(s=> svgEl("stop", {offset:s[0], "stop-color":s[1]}, trunk));
  const stake = svgEl("linearGradient", {id:`${ctx.uid}-stake`, x1:"0", y1:"0", x2:"1", y2:"0"}, defs);
  [["0", "#7C6A53"], [".4", "#A8927A"], ["1", "#6E5E4A"]].forEach(s=> svgEl("stop", {offset:s[0], "stop-color":s[1]}, stake));

  const X0 = Math.max(-2400, vb.x0 - 20), X1 = Math.min(2400, vb.x0 + vb.bw + 20);
  svgEl("rect", {x:X0, y:vb.y0 - 20, width:X1 - X0, height:Math.max(0, -vb.y0 + 20), fill:`url(#${ctx.uid}-sky)`}, g);
  // colline lontane
  const hill = (base, a1, a2, f1, f2, fill)=>{
    let d = `M${X0.toFixed(1)},0`;
    for (let x = X0; x <= X1 + 24; x += 24) d += `L${x.toFixed(1)},${(base - a1 * Math.sin(x / f1) - a2 * Math.sin(x / f2 + 1.3)).toFixed(1)}`;
    d += `L${(X1 + 24).toFixed(1)},0Z`;
    svgEl("path", {d, fill}, g);
  };
  hill(-34, 12, 7, 190, 71, P.hillFar);
  hill(-14, 6, 4, 130, 53, P.hillNear);
  // filari lontani
  const rows = svgEl("g", {stroke:P.row, "stroke-width":0.8, opacity:0.7}, g);
  for (let x = Math.floor(X0 / 26) * 26; x <= X1; x += 26) svgEl("line", {x1:x, y1:-3, x2:x, y2:-15}, rows);
  svgEl("line", {x1:X0, y1:-12, x2:X1, y2:-12, "stroke-width":0.5}, rows);
  // suolo
  const soilH = vb.y0 + vb.bh + 20;
  if (soilH > 0) svgEl("rect", {x:X0, y:0, width:X1 - X0, height:soilH, fill:`url(#${ctx.uid}-soil)`}, g);
  svgEl("ellipse", {cx:0, cy:7, rx:300, ry:11, fill:P.band, opacity:0.32}, g);
  const fur = svgEl("g", {stroke:P.furrow, "stroke-width":1, fill:"none"}, g);
  for (let i = 0; i < 7; i++){
    const y = 5 + i * 5 + i * i * 1.6;
    let d = `M${X0.toFixed(1)},${y}`;
    for (let x = X0; x <= X1 + 40; x += 40) d += `L${x.toFixed(1)},${(y + Math.sin(x / 55 + i) * 0.9).toFixed(1)}`;
    svgEl("path", {d}, fur);
  }
  const r = ctx.rng;
  const grass = svgEl("g", {stroke:P.grass, "stroke-width":1, "stroke-linecap":"round", fill:"none", opacity:0.9}, g);
  for (let j = 0; j < 26; j++){
    const x = (r() - 0.5) * 560, y = 2 + r() * 16, h = 4 + r() * 6;
    svgEl("path", {d:`M${(x - 2).toFixed(1)},${y.toFixed(1)}l-2,-${h.toFixed(1)}M${x.toFixed(1)},${y.toFixed(1)}l0.5,-${(h * 1.2).toFixed(1)}M${(x + 2).toFixed(1)},${y.toFixed(1)}l2.4,-${(h * 0.9).toFixed(1)}`}, grass);
  }
  for (let j = 0; j < 14; j++){
    const x = (r() - 0.5) * 420, y = 3 + r() * 18, rr = 1.2 + r() * 1.8;
    svgEl("ellipse", {cx:x.toFixed(1), cy:y.toFixed(1), rx:rr.toFixed(1), ry:(rr * 0.6).toFixed(1), fill:"rgba(80,64,42,.28)"}, g);
  }
}

function paintSupport(g, ctx, vb){
  const X0 = Math.max(-2400, vb.x0 - 20), X1 = Math.min(2400, vb.x0 + vb.bw + 20);
  const sw = Math.max(1.1, 1 / ctx.k);
  // palo tutore accanto al ceppo
  const sx = G.stakeX;
  svgEl("rect", {x:sx - 4, y:G.stakeTop, width:8, height:-G.stakeTop + 6, rx:1.5, fill:`url(#${ctx.uid}-stake)`}, g);
  svgEl("path", {d:`M${sx - 4},${G.stakeTop + 1} L${sx},${G.stakeTop - 4} L${sx + 4},${G.stakeTop + 1}Z`, fill:"#8E7B64"}, g);
  const grain = svgEl("g", {stroke:"rgba(60,45,30,.25)", "stroke-width":0.6, fill:"none"}, g);
  for (let i = 0; i < 3; i++) svgEl("path", {d:`M${sx - 2 + i * 2},${G.stakeTop + 8} L${sx - 2.4 + i * 2.1},-2`}, grain);
  // fili
  G.wires.forEach(wy=>{
    svgEl("line", {x1:X0, y1:wy, x2:X1, y2:wy, stroke:"#6E7472", "stroke-width":sw}, g);
    svgEl("line", {x1:X0, y1:wy - sw * 0.45, x2:X1, y2:wy - sw * 0.45, stroke:"#D4D7D2", "stroke-width":sw * 0.35, opacity:0.7}, g);
    svgEl("rect", {x:sx - 5, y:wy - 2, width:10, height:4, rx:1, fill:"#5F6563"}, g);
  });
}

function paintTrunk(g, ctx, x, yTop, yBot, baseW){
  const r = ctx.rng;
  const h = yBot - yTop, topW = baseW * 0.84, flare = baseW * 1.38;
  const w = ()=> (r() - 0.5) * baseW * 0.16;
  const pts = [
    [x - topW / 2, yTop], [x - baseW * 0.5 + w(), yTop + h * 0.28], [x - baseW * 0.46 + w(), yTop + h * 0.58],
    [x - baseW * 0.56 + w(), yTop + h * 0.86], [x - flare / 2, yBot + 2],
    [x + flare / 2, yBot + 2], [x + baseW * 0.56 + w(), yTop + h * 0.86], [x + baseW * 0.47 + w(), yTop + h * 0.58],
    [x + baseW * 0.5 + w(), yTop + h * 0.28], [x + topW / 2, yTop]
  ];
  svgEl("path", {d:smoothClosed(pts), fill:`url(#${ctx.uid}-trunk)`, stroke:"rgba(40,30,20,.35)", "stroke-width":0.8}, g);
  const bark = svgEl("g", {fill:"none", "stroke-linecap":"round"}, g);
  for (let i = 0; i < 7; i++){
    const t = (i + 0.5) / 7;
    const xt = x - topW / 2 + t * topW + (r() - 0.5) * 1.5;
    const xb = x - flare / 2 + t * flare + (r() - 0.5) * 2;
    const xm = (xt + xb) / 2 + (r() - 0.5) * 5;
    const d = `M${xt.toFixed(1)},${(yTop + 3).toFixed(1)} Q${xm.toFixed(1)},${(yTop + h * 0.5).toFixed(1)} ${xb.toFixed(1)},${(yBot - 1).toFixed(1)}`;
    svgEl("path", {d, stroke:"rgba(28,20,12,.24)", "stroke-width":(0.8 + r() * 0.7).toFixed(2)}, bark);
    svgEl("path", {d, stroke:"rgba(255,240,220,.13)", "stroke-width":0.7, transform:"translate(1.3 0)"}, bark);
  }
  for (let i = 0; i < 7; i++){
    const cy = yTop + 8 + r() * (h - 16), cx = x + (r() - 0.5) * baseW * 0.7;
    svgEl("path", {d:`M${(cx - 3).toFixed(1)},${cy.toFixed(1)} q3,${(1.5 + r()).toFixed(1)} ${(6 + r() * 3).toFixed(1)},0`, stroke:"rgba(28,20,12,.35)", "stroke-width":0.8}, bark);
  }
  svgEl("path", {d:`M${(x - topW / 2 + 2).toFixed(1)},${(yTop + 4).toFixed(1)} Q${(x - baseW * 0.45).toFixed(1)},${(yTop + h * 0.5).toFixed(1)} ${(x - flare / 2 + 5).toFixed(1)},${(yBot - 4).toFixed(1)}`, stroke:"rgba(255,245,225,.16)", "stroke-width":2.6, fill:"none", "stroke-linecap":"round"}, g);
  // legacci al palo
  [0.3, 0.64].forEach(f=>{
    const yy = yTop + h * f;
    svgEl("path", {d:`M${(x + baseW * 0.45).toFixed(1)},${(yy - 2).toFixed(1)} Q${(G.stakeX - 1).toFixed(1)},${(yy - 5).toFixed(1)} ${(G.stakeX + 4).toFixed(1)},${(yy - 1).toFixed(1)} Q${(G.stakeX - 1).toFixed(1)},${(yy + 4).toFixed(1)} ${(x + baseW * 0.45).toFixed(1)},${(yy + 2).toFixed(1)}`, stroke:"#4F5A44", "stroke-width":1.5, fill:"none"}, g);
  });
  svgEl("ellipse", {cx:x, cy:yBot + 2, rx:flare * 0.85, ry:3.6, fill:SEASON[ctx.season].band, opacity:0.55}, g);
}

function paintHead(g, ctx, x, y){
  [[0, 3, 19, 12, WOOD.trunk.dark], [-9, -3, 12, 9.5, WOOD.trunk.mid], [9, -2, 12, 9, WOOD.trunk.mid], [-1, -8, 10, 7.5, WOOD.trunk.mid], [0, 1, 15, 9, WOOD.trunk.mid]]
    .forEach(b=> svgEl("ellipse", {cx:x + b[0], cy:y + b[1], rx:b[2], ry:b[3], fill:b[4]}, g));
  svgEl("ellipse", {cx:x - 6, cy:y - 6, rx:7, ry:3.5, fill:WOOD.trunk.light, opacity:0.45}, g);
  [[-13, -5], [13, -3], [3, -12]].forEach(s=>{
    svgEl("ellipse", {cx:x + s[0], cy:y + s[1], rx:3.6, ry:2.6, fill:"#A08E72"}, g);
    svgEl("ellipse", {cx:x + s[0], cy:y + s[1], rx:1.8, ry:1.2, fill:"#5E5040"}, g);
  });
}

function paintOldWood(g, c, w0, w1){
  svgEl("path", {d:ribbon(c, 0, c.length, w0, w1, 0), fill:WOOD.old.dark}, g);
  svgEl("path", {d:ribbon(c, 0, c.length, w0 * 0.74, w1 * 0.74, 0.1), fill:WOOD.old.mid}, g);
  svgEl("path", {d:ribbon(c, 0, c.length, w0 * 0.2, w1 * 0.2, 0.32), fill:WOOD.old.light, opacity:0.8}, g);
  const wFn = s=> lerp(w0, w1, s / c.length);
  svgEl("path", {d:lineAlong(c, 2, c.length - 2, -0.18, wFn), stroke:"rgba(30,22,14,.35)", "stroke-width":0.8, fill:"none"}, g);
  svgEl("path", {d:lineAlong(c, 6, c.length - 4, 0.05, wFn), stroke:"rgba(30,22,14,.22)", "stroke-width":0.6, fill:"none"}, g);
}
function paintOldCut(g, c, w){
  const p = c.at(c.length), t = tangentAt(c, c.length);
  const ang = Math.atan2(t.y, t.x) * 180 / Math.PI;
  svgEl("ellipse", {cx:p.x, cy:p.y, rx:2, ry:w * 0.5, transform:`rotate(${ang.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`, fill:"#9C8F76", stroke:"#4F4536", "stroke-width":0.8}, g);
}

function paintStubs(g, ctx, L, withLabel){
  L.stubs.forEach(st=>{
    paintOldWood(g, st.curve, st.w0, st.w1);
    paintOldCut(g, st.curve, st.w1);
  });
  const st = L.stubs[0];
  if (withLabel && st.label){
    const k = ctx.k, p = st.curve.at(st.curve.length * 0.4);
    // lato con meno tralci che scendono dalla testa
    const down = side=> L.canes.filter(m=> m.cane.lato === "sbagliato" && Math.sign(m.jx - L.headX || 1) === side).length;
    const side = down(-1) <= down(1) ? -1 : 1;
    const tx = L.headX + side * (30 + 8 / k), ty = L.headY + 44;
    svgEl("path", {d:`M${(p.x + 3).toFixed(1)},${(p.y + 2).toFixed(1)} Q${(L.headX + 22).toFixed(1)},${(L.headY + 20).toFixed(1)} ${(tx - 3 / k).toFixed(1)},${(ty - 4 / k).toFixed(1)}`, stroke:"#8A7F6B", "stroke-width":(1 / k).toFixed(2), fill:"none"}, g);
    const t = svgEl("text", {x:tx.toFixed(1), y:ty.toFixed(1), "text-anchor": side < 0 ? "end" : "start", "font-family":MONO, "font-size":(11 / k).toFixed(2), "font-weight":500, fill:"#4F493E", stroke:"#F4F0E6", "stroke-width":(3.2 / k).toFixed(2), "paint-order":"stroke", "stroke-linejoin":"round"}, g);
    t.textContent = st.label;
  }
}

function paintCordon(g, ctx, L){
  L.arms.forEach(c=>{
    paintOldWood(g, c, 19, 13);
    paintOldCut(g, c, 13);
  });
  const r = ctx.rng;
  const cr = svgEl("g", {stroke:"rgba(30,22,14,.32)", "stroke-width":0.8, fill:"none"}, g);
  L.arms.forEach(c=>{
    for (let s = 30; s < c.length - 10; s += 22 + r() * 16){
      const p = c.at(s), t = tangentAt(c, s);
      const o = (r() - 0.5) * 6;
      svgEl("path", {d:`M${(p.x + t.y * o).toFixed(1)},${(p.y - t.x * o).toFixed(1)} l${(t.x * 7).toFixed(1)},${(t.y * 7 + (r() - 0.5)).toFixed(1)}`}, cr);
    }
  });
  L.knobs.forEach(k=>{
    svgEl("ellipse", {cx:k.curve.pts[0][0], cy:k.curve.pts[0][1] + 3, rx:8, ry:5, fill:WOOD.old.node}, g);
    paintOldWood(g, k.curve, k.w0, k.w1);
    paintOldCut(g, k.curve, k.w1);
  });
}

function paintVineBase(g, ctx, L, vb, withLabel){
  paintSupport(g, ctx, vb);
  if (L.tipo === "guyot"){
    paintTrunk(g, ctx, L.headX, L.headY + 6, 0, 27);
    paintStubs(g, ctx, L, withLabel);
    paintHead(g, ctx, L.headX, L.headY);
  } else {
    paintTrunk(g, ctx, 0, -146, 0, 25);
    paintCordon(g, ctx, L);
  }
}

/* ================= PITTURA: TRALCI, NODI, GEMME ================= */
function paintWood(g, c, s0, s1, w0, w1, pal){
  svgEl("path", {d:ribbon(c, s0, s1, w0, w1, 0), fill:pal.dark}, g);
  svgEl("path", {d:ribbon(c, s0, s1, w0 * 0.72, w1 * 0.72, 0.1), fill:pal.mid}, g);
  svgEl("path", {d:ribbon(c, s0, s1, w0 * 0.22, w1 * 0.22, 0.34), fill:pal.light, opacity:0.85}, g);
  if (s1 - s0 > 12){
    const wFn = s=> lerp(w0, w1, (s - s0) / ((s1 - s0) || 1));
    svgEl("path", {d:lineAlong(c, s0 + 3, s1 - 3, -0.2, wFn), stroke:pal.dark, "stroke-width":0.5, opacity:0.4, fill:"none"}, g);
  }
}
function paintNode(g, p, t, w, pal){
  const ang = Math.atan2(t.y, t.x) * 180 / Math.PI;
  const tr = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`;
  const ng = svgEl("g", {transform:tr}, g);
  svgEl("ellipse", {rx:(w * 0.36).toFixed(2), ry:(w * 0.66).toFixed(2), fill:pal.node}, ng);
  svgEl("ellipse", {rx:(w * 0.24).toFixed(2), ry:(w * 0.5).toFixed(2), fill:pal.mid}, ng);
}
function paintTendril(g, p, t, nm, side, w){
  const ox = p.x - nm.x * side * w * 0.45, oy = p.y - nm.y * side * w * 0.45;
  const dx = -nm.x * side * 0.8 + t.x * 0.6, dy = -nm.y * side * 0.8 + t.y * 0.6;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  svgEl("path", {d:"M0,0 C3,-1 7,-2 10,-1 C13,0 13,4 10,4.4 C8,4.6 7.5,2.4 9.2,2", transform:`translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${ang.toFixed(1)})`, stroke:"#5A4633", "stroke-width":0.9, fill:"none", opacity:0.8, "stroke-linecap":"round"}, g);
}
// gemma a cono con perule; restituisce il centro della gemma (per il tocco)
function paintBud(g, p, t, nm, side, w, h, blind, opacity){
  // la gemma dormiente sta nell'ascella del nodo, rivolta verso la punta del tralcio
  const ax = t.x * Math.cos(0.55) + nm.x * side * Math.sin(0.55);
  const ay = t.y * Math.cos(0.55) + nm.y * side * Math.sin(0.55);
  const bx = p.x + nm.x * side * w * 0.3, by = p.y + nm.y * side * w * 0.3;
  const ang = Math.atan2(ay, ax) * 180 / Math.PI;
  const hh = blind ? h * 0.72 : h * 0.92, b = blind ? h * 0.6 : h * 0.74;
  const bg = svgEl("g", {transform:`translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${ang.toFixed(1)})`, opacity:opacity < 1 ? opacity : null}, g);
  svgEl("path", {d:`M0,${(-b / 2).toFixed(2)} C${(hh * 0.5).toFixed(2)},${(-b * 0.62).toFixed(2)} ${(hh * 0.9).toFixed(2)},${(-b * 0.3).toFixed(2)} ${hh.toFixed(2)},0 C${(hh * 0.9).toFixed(2)},${(b * 0.3).toFixed(2)} ${(hh * 0.5).toFixed(2)},${(b * 0.62).toFixed(2)} 0,${(b / 2).toFixed(2)}Z`,
    fill: blind ? BUD.blindFill : BUD.fill, stroke: blind ? BUD.blindStroke : BUD.stroke, "stroke-width":0.7}, bg);
  if (blind){
    svgEl("path", {d:`M${(hh * 0.25).toFixed(2)},${(-b * 0.28).toFixed(2)} L${(hh * 0.62).toFixed(2)},${(b * 0.24).toFixed(2)}`, stroke:"#5F594D", "stroke-width":0.9}, bg);
  } else {
    svgEl("path", {d:`M${(hh * 0.16).toFixed(2)},${(-b * 0.2).toFixed(2)} Q${(hh * 0.55).toFixed(2)},${(-b * 0.3).toFixed(2)} ${(hh * 0.9).toFixed(2)},${(-b * 0.04).toFixed(2)}`, stroke:BUD.hi, "stroke-width":0.9, fill:"none", opacity:0.85}, bg);
  }
  return {x: bx + ax * hh / 2, y: by + ay * hh / 2, tipX: bx + ax * hh, tipY: by + ay * hh};
}
// base di un succhione: colletto nodoso sul legno vecchio, diverso dall'inserzione sullo sperone dell'anno scorso
function paintOldCollar(g, m){
  if (m.cane.origine !== "vecchio") return;
  svgEl("ellipse", {cx:m.jx.toFixed(1), cy:m.jy.toFixed(1), rx:8.5, ry:6.5, fill:WOOD.old.dark}, g);
  svgEl("ellipse", {cx:(m.jx - 1.5).toFixed(1), cy:(m.jy - 1.5).toFixed(1), rx:5.5, ry:4, fill:WOOD.old.mid}, g);
  svgEl("path", {d:`M${(m.jx - 5).toFixed(1)},${(m.jy + 2).toFixed(1)} q3,-3 7,-1 M${(m.jx - 3).toFixed(1)},${(m.jy - 3).toFixed(1)} q3,1 6,-1`, stroke:"rgba(30,22,14,.45)", "stroke-width":0.8, fill:"none"}, g);
}
// gemme della corona: piccole e ravvicinate alla base del tralcio, non si contano e non si toccano
function paintCorona(g, c, IN, wAt, ctx, n){
  for (let j = 1; j <= n; j++){
    const s = IN * 0.16 * j;
    paintBud(g, c.at(s), tangentAt(c, s), normalAt(c, s), j % 2 ? -1 : 1, wAt(s), ctx.budH * 0.55, false, 0.85);
  }
}
function paintCutFace(g, p, t, w, k, withMark){
  const ang = Math.atan2(t.y, t.x) * 180 / Math.PI;
  svgEl("ellipse", {cx:p.x, cy:p.y, rx:1.8, ry:(w * 0.52).toFixed(2), transform:`rotate(${ang.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`, fill:"#EDE0C2", stroke:"#B08A5A", "stroke-width":0.6}, g);
  if (withMark){
    const L = w / 2 + 6 / k;
    svgEl("line", {x1:(p.x - t.y * L).toFixed(1), y1:(p.y + t.x * L).toFixed(1), x2:(p.x + t.y * L).toFixed(1), y2:(p.y - t.x * L).toFixed(1), stroke:ACCENT, "stroke-width":(2.2 / k).toFixed(2), "stroke-linecap":"round"}, g);
  }
}
function pill(g, x, y, text, k, fill, color, extra){
  const fs = 10.5 / k, h = 20 / k, padX = 8 / k;
  const w = text.length * fs * 0.64 + padX * 2;
  const grp = svgEl("g", extra || null, g);
  svgEl("rect", {x:(x - w / 2).toFixed(1), y:(y - h / 2).toFixed(1), width:w.toFixed(1), height:h.toFixed(1), rx:(h / 2).toFixed(1), fill, stroke:"rgba(255,253,247,.9)", "stroke-width":(1.2 / k).toFixed(2)}, grp);
  const t = svgEl("text", {x:x.toFixed(1), y:(y + fs * 0.36).toFixed(1), "text-anchor":"middle", "font-family":MONO, "font-size":fs.toFixed(2), "font-weight":600, "letter-spacing":(fs * 0.04).toFixed(2), fill:color}, grp);
  t.textContent = text;
  return grp;
}

/* ================= SCENA DELLA POTATURA ================= */
const STAGE = {k:1, hit:[], layout:null, zoomKey:null, vb:null, anim:0};
const isPhone = ()=> !mqDesktop.matches;
function zoomedCane(){
  return isPhone() && !STATE.zoomOff && STATE.selectedCaneId != null ? STATE.selectedCaneId : null;
}
// passaggio morbido del viewBox dalla vista intera al tralcio selezionato (e ritorno)
function tweenViewBox(svg, from, to){
  cancelAnimationFrame(STAGE.anim);
  if (!from || reducedMotion()) return;
  const t0 = performance.now(), dur = 320;
  const ease = t=> 1 - Math.pow(1 - t, 3);
  const step = now=>{
    const p = Math.min(1, (now - t0) / dur), e = ease(p);
    const v = ["x0","y0","bw","bh"].map(key=> from[key] + (to[key] - from[key]) * e);
    svg.setAttribute("viewBox", v.map(n=> n.toFixed(1)).join(" "));
    if (p < 1) STAGE.anim = requestAnimationFrame(step);
  };
  svg.setAttribute("viewBox", [from.x0, from.y0, from.bw, from.bh].map(n=> n.toFixed(1)).join(" "));
  STAGE.anim = requestAnimationFrame(step);
}
function updateZoomButton(){
  const b = $("#btnZoom");
  if (!b) return;
  const show = isPhone() && STATE.selectedCaneId != null;
  b.hidden = !show;
  if (!show) return;
  const zoomed = !STATE.zoomOff;
  b.setAttribute("aria-label", zoomed ? "Mostra tutta la vite" : "Ingrandisci il tralcio selezionato");
  b.setAttribute("aria-pressed", zoomed ? "true" : "false");
  $("use", b).setAttribute("href", zoomed ? "#i-zoom-out" : "#i-zoom-in");
}

function keptLength(caneId){
  const L = STAGE.layout || (STATE.vine ? layoutFor(STATE.vine) : null);
  if (!L) return 0;
  const m = L.canes.find(mm=> mm.cane.id === caneId);
  if (!m) return 0;
  const ch = getChoiceForCane(caneId);
  if (!ch) return m.total;
  if (ch.removed) return 0;
  const n = m.cane.lengthNodes, IN = m.total / n;
  return ch.cutNode < n ? IN * (ch.cutNode + 0.32) : m.total;
}

function renderStage(opts){
  opts = opts || {};
  const svg = $("#vineSvg");
  if (!svg || !STATE.vine || !$("#gameScreen").classList.contains("is-active")) return;
  const L = layoutFor(STATE.vine);
  const hudPad = mqDesktop.matches ? 78 : 74;
  const zid = zoomedCane();
  let vb;
  if (zid != null){
    // su telefono il tralcio selezionato riempie la scena: gemme più distanziate sotto il dito
    const m = L.canes.find(mm=> mm.cane.id === zid);
    const zb = newBounds();
    m.curve.pts.forEach(pt=> addPt(zb, pt[0], pt[1]));
    addPt(zb, m.jx, m.jy + 20);
    vb = fitView(svg, zb, {padX:46, padTop:hudPad, padBottom:26, maxK:2.6});
  } else {
    const bb = layoutBounds(L); addPt(bb, 0, 34);
    vb = fitView(svg, bb, {padX:30, padTop:hudPad, padBottom:mqDesktop.matches ? 46 : 12, maxK:1.5});
  }
  if (!vb) return;
  const zkey = zid == null ? "all" : "cane-" + zid;
  if (STAGE.zoomKey !== zkey){
    if (STAGE.zoomKey != null) tweenViewBox(svg, STAGE.vb, vb);
    STAGE.zoomKey = zkey;
  }
  STAGE.vb = vb;
  updateZoomButton();
  const {scene, fxl} = ensureLayers(svg);
  scene.innerHTML = "";
  const k = vb.k;
  const ctx = {k, rng:mulberry32(STATE.vine.drawSeed), uid:"vs", season:"winter",
    wScale:clamp(0.85 / k, 1, 1.4), budH:Math.max(9, 7.8 / k)};
  paintBackdrop(scene, ctx, vb);
  paintVineBase(scene, ctx, L, vb, true);

  const gWood = svgEl("g", null, scene);
  const gLabels = svgEl("g", null, scene);
  const order = L.canes.slice().sort((a, b)=>{
    const wa = a.cane.id === STATE.selectedCaneId ? 2 : a.cane.id === STATE.hoverCaneId ? 1 : 0;
    const wb = b.cane.id === STATE.selectedCaneId ? 2 : b.cane.id === STATE.hoverCaneId ? 1 : 0;
    return wa - wb;
  });
  STAGE.hit = [];
  order.forEach(m=>{
    const hit = paintCanePrune(gWood, gLabels, m, ctx, opts);
    STAGE.hit.push(hit);
  });
  STAGE.k = k;
  STAGE.layout = L;
  const n = L.canes.length;
  $("#vineSvgTitle").textContent = STATE.forma === "guyot"
    ? `La vite da potare: ${n} tralci sulla testa del ceppo`
    : `La vite da potare: cordone con ${n} posizioni`;
  if (opts.fx && opts.fx.type === "cut") runCutFx(fxl, L, opts.fx, ctx);
}

function paintCanePrune(gWood, gLabels, m, ctx, opts){
  const cane = m.cane, c = m.curve, total = m.total, n = cane.lengthNodes, k = ctx.k;
  const ch = getChoiceForCane(cane.id);
  const role = roleOfCane(cane.id);
  const removed = role === "removed";
  const cutNode = ch && !removed ? ch.cutNode : null;
  const IN = total / n;
  const sKeep = removed ? 0 : (cutNode != null && cutNode < n ? IN * (cutNode + 0.32) : total);
  const Wb = baseWidth(cane) * ctx.wScale, Wt = Math.max(1.8, Wb * 0.34);
  const wAt = s=> lerp(Wb, Wt, s / total);
  const pal = cane.lignificazione < 0.6 ? WOOD.green : WOOD.ripe;
  const isSel = STATE.selectedCaneId === cane.id;
  const isHover = STATE.hoverCaneId === cane.id && !isSel;
  const grp = svgEl("g", {"data-cane":cane.id, class:"cane" + (role ? " has-role" : "") + (removed ? " is-removed" : "")}, gWood);

  if (isSel || isHover){
    svgEl("path", {d:ribbon(c, 0, total, Wb + 16 / k, Wt + 14 / k, 0), fill: isSel ? "rgba(169,88,31,.2)" : "rgba(169,88,31,.1)",
      stroke: isSel ? ACCENT : "none", "stroke-width":(1.4 / k).toFixed(2), class: isSel ? "sel-glow" : null}, grp);
  }
  if (sKeep < total){
    svgEl("path", {d:ribbon(c, sKeep, total, wAt(sKeep) * 0.92, Wt * 0.92, 0), class:"ghost", fill:"rgba(255,253,247,.42)", stroke:"#8F8570",
      "stroke-width":(1 / k).toFixed(2), "stroke-dasharray":`${(3 / k).toFixed(2)} ${(2.5 / k).toFixed(2)}`}, grp);
  }
  if (sKeep > 0) paintWood(grp, c, 0, sKeep, Wb, wAt(sKeep), pal);

  paintCorona(grp, c, IN, wAt, ctx, cane.corona);
  if (STATE.forma === "guyot") paintOldCollar(grp, m);
  const buds = [];
  const numG = isSel ? svgEl("g", {"font-family":MONO, "font-size":(10.5 / k).toFixed(2), "font-weight":600, "text-anchor":"middle", stroke:"#FFFDF7", "stroke-width":(3 / k).toFixed(2), "paint-order":"stroke", "stroke-linejoin":"round"}, gLabels) : null;
  for (let i = 1; i <= n; i++){
    const s = Math.min(total, IN * i);
    const kept = s <= sKeep + 0.01;
    const p = c.at(s), t = tangentAt(c, s), nm = normalAt(c, s);
    const w = wAt(s);
    const side = i % 2 === 0 ? 1 : -1;
    if (kept && i < n) paintNode(grp, p, t, w, pal);
    if (kept && i >= 3 && i % 3 !== 0 && i < n) paintTendril(grp, p, t, nm, side, w);
    const blind = cane.blindNodes.includes(i);
    const bud = paintBud(grp, p, t, nm, side, w, ctx.budH, blind, kept ? 1 : 0.38);
    buds.push({i, x:bud.x, y:bud.y});
    if (numG){
      const off = w / 2 + ctx.budH + 7 / k;
      const lx = p.x + nm.x * side * off, ly = p.y + nm.y * side * off;
      const tt = svgEl("text", {x:lx.toFixed(1), y:(ly + 3.6 / k).toFixed(1), fill: cutNode === i ? "#8A4415" : (kept ? "#4F493E" : "#6B6456")}, numG);
      tt.textContent = i;
    }
  }
  if (removed){
    const p = c.at(3);
    paintCutFace(grp, p, tangentAt(c, 3), Wb, k, true);
  } else if (sKeep < total){
    paintCutFace(grp, c.at(sKeep), tangentAt(c, sKeep), wAt(sKeep), k, true);
  }

  // etichetta del tralcio in punta
  const tip = c.at(total), tt = tangentAt(c, total);
  const R = 11 / k;
  const lx = tip.x + tt.x * (R + 6 / k), ly = tip.y + tt.y * (R + 6 / k);
  const lblFill = isSel ? ACCENT : (role && !removed ? ROLE_FILL[role] : "#FFFDF7");
  const lblInk = isSel || (role && !removed) ? "#FFFDF7" : "#221E18";
  const lg = svgEl("g", null, gLabels);
  svgEl("circle", {cx:lx.toFixed(1), cy:ly.toFixed(1), r:R.toFixed(2), fill:lblFill, stroke: isSel || (role && !removed) ? "#FFFDF7" : "#C4B99F", "stroke-width":(1.2 / k).toFixed(2)}, lg);
  const lt = svgEl("text", {x:lx.toFixed(1), y:(ly + 4 / k).toFixed(1), "text-anchor":"middle", "font-family":MONO, "font-size":(11.5 / k).toFixed(2), "font-weight":600, fill:lblInk}, lg);
  lt.textContent = cane.label;

  if (role && !removed && (STATE.forma === "guyot" || isSel)){
    const sp = removed ? total * 0.42 : Math.max(sKeep * 0.5, Math.min(sKeep, 26));
    const p = c.at(sp);
    let nm = normalAt(c, sp);
    // nel cordone l'etichetta va verso il centro della vite, così non esce dai bordi
    if (STATE.forma === "cordone" && nm.x * p.x > 0) nm = {x:-nm.x, y:-nm.y};
    const off = wAt(sp) / 2 + 17 / k;
    const pop = opts.fx && opts.fx.pop && opts.fx.caneId === cane.id;
    pill(gLabels, p.x + nm.x * off, p.y + nm.y * off, ROLE_NAME[role], k, ROLE_FILL[role], ROLE_TEXT[role], pop ? {class:"fx-pop"} : null);
  }
  return {caneId:cane.id, pts:c.pts, buds};
}

function runCutFx(fxl, L, fxd, ctx){
  if (reducedMotion()) return;
  const m = L.canes.find(mm=> mm.cane.id === fxd.caneId);
  if (!m) return;
  const c = m.curve, k = ctx.k;
  const Wb = baseWidth(m.cane) * ctx.wScale, Wt = Math.max(1.8, Wb * 0.34);
  const wAt = s=> lerp(Wb, Wt, s / m.total);
  const pal = m.cane.lignificazione < 0.6 ? WOOD.green : WOOD.ripe;
  if (fxd.newKeep < fxd.prevKeep - 0.5){
    const s0 = Math.max(fxd.newKeep, 0);
    const piece = svgEl("g", {style:"transform-box:fill-box;transform-origin:center"}, fxl);
    paintWood(piece, c, s0, fxd.prevKeep, wAt(s0), wAt(fxd.prevKeep), pal);
    const t = tangentAt(c, (s0 + fxd.prevKeep) / 2);
    const rot = t.x >= 0 ? 16 : -16;
    const a = piece.animate([
      {transform:"translate(0px,0px) rotate(0deg)", opacity:1},
      {transform:`translate(${(t.x * 8).toFixed(1)}px,${(46).toFixed(1)}px) rotate(${rot}deg)`, opacity:0}
    ], {duration:620, easing:"cubic-bezier(.5,0,.9,.55)", fill:"forwards"});
    a.onfinish = ()=> piece.remove();
  }
  const sCut = fxd.newKeep <= 0 ? 3 : fxd.newKeep;
  const p = c.at(sCut), t = tangentAt(c, sCut);
  const ring = svgEl("circle", {cx:p.x.toFixed(1), cy:p.y.toFixed(1), r:(7 / k).toFixed(2), fill:"none", stroke:ACCENT, "stroke-width":(2 / k).toFixed(2), class:"fx-ring"}, fxl);
  const ra = ring.animate([{transform:"scale(.5)", opacity:1}, {transform:"scale(2.4)", opacity:0}], {duration:420, easing:"cubic-bezier(.32,.72,0,1)", fill:"forwards"});
  ra.onfinish = ()=> ring.remove();
  const ang = Math.atan2(t.y, t.x) * 180 / Math.PI + 90;
  const blades = svgEl("g", {transform:`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})`}, fxl);
  const bl = 13 / k, sw = (2 / k).toFixed(2);
  const b1 = svgEl("line", {x1:0, y1:0, x2:0, y2:(-bl).toFixed(2), stroke:"#4F5657", "stroke-width":sw, "stroke-linecap":"round", style:"transform-origin:0 0"}, blades);
  const b2 = svgEl("line", {x1:0, y1:0, x2:0, y2:(-bl).toFixed(2), stroke:"#4F5657", "stroke-width":sw, "stroke-linecap":"round", style:"transform-origin:0 0"}, blades);
  b1.animate([{transform:"rotate(-34deg)", opacity:1}, {transform:"rotate(0deg)", opacity:1, offset:.55}, {transform:"rotate(0deg)", opacity:0}], {duration:380, easing:"cubic-bezier(.32,.72,0,1)", fill:"forwards"});
  const ba = b2.animate([{transform:"rotate(34deg)", opacity:1}, {transform:"rotate(0deg)", opacity:1, offset:.55}, {transform:"rotate(0deg)", opacity:0}], {duration:380, easing:"cubic-bezier(.32,.72,0,1)", fill:"forwards"});
  ba.onfinish = ()=> blades.remove();
}

/* ---- tocco e mouse sulla scena ---- */
function toWorld(svg, cx, cy){
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : {x:0, y:0};
}
function nearestCane(w, exclude){
  let best = null;
  STAGE.hit.forEach(h=>{
    if (h.caneId === exclude) return;
    const d = distToPolyline(w, h.pts) * STAGE.k;
    if (!best || d < best.d) best = {d, caneId:h.caneId};
  });
  return best;
}
$("#btnZoom").addEventListener("click", ()=>{
  STATE.zoomOff = !STATE.zoomOff;
  renderStage();
});
(function wireStage(){
  const svg = $("#vineSvg");
  let lastType = "mouse";
  svg.addEventListener("pointerdown", e=>{ lastType = e.pointerType || "mouse"; });
  svg.addEventListener("click", e=>{
    if (!STATE.vine) return;
    const w = toWorld(svg, e.clientX, e.clientY);
    const k = STAGE.k;
    const fine = lastType === "mouse";
    let bud = null;
    STAGE.hit.forEach(h=>{
      const sel = h.caneId === STATE.selectedCaneId;
      const lim = sel ? 22 : (fine ? 9 : -1);
      h.buds.forEach(b=>{
        const d = Math.hypot(b.x - w.x, b.y - w.y) * k;
        if (d <= lim && (!bud || d < bud.d)) bud = {d, caneId:h.caneId, node:b.i};
      });
    });
    if (bud){
      const other = nearestCane(w, bud.caneId);
      if (!(other && other.d < bud.d * 0.55 && other.d <= 30)){
        doCut(bud.caneId, bud.node);
        return;
      }
    }
    const nc = nearestCane(w, null);
    if (nc && nc.d <= 30) selectCane(nc.caneId);
    else if (!nc || nc.d > 60) deselectCane();
  });
  let raf = 0, pending = null;
  svg.addEventListener("pointermove", e=>{
    if (e.pointerType !== "mouse" || !STATE.vine) return;
    pending = {x:e.clientX, y:e.clientY};
    if (raf) return;
    raf = requestAnimationFrame(()=>{
      raf = 0;
      const w = toWorld(svg, pending.x, pending.y);
      const nc = nearestCane(w, null);
      const id = nc && nc.d <= 30 ? nc.caneId : null;
      svg.classList.toggle("is-hovering", id != null);
      if (id !== STATE.hoverCaneId){ STATE.hoverCaneId = id; renderStage(); }
    });
  });
  svg.addEventListener("pointerleave", ()=>{
    svg.classList.remove("is-hovering");
    if (STATE.hoverCaneId != null){ STATE.hoverCaneId = null; renderStage(); }
  });
})();

/* ================= CONFERMA ================= */
let PENDING = null;
function confirmPruning(){
  const snapG = {capo: STATE.choices.capo ? {...STATE.choices.capo} : null, sperone: STATE.choices.sperone ? {...STATE.choices.sperone} : null};
  const snapC = {};
  Object.keys(STATE.cordoneChoices).forEach(kk=>{ snapC[kk] = {...STATE.cordoneChoices[kk]}; });
  const result = STATE.forma === "guyot" ? evaluateGuyot(snapG) : evaluateCordone(snapC);
  PENDING = {result, choicesG:snapG, choicesC:snapC, shown:false};
  STATE.vineActive = false;
  const btn = $("#btnConfirm");
  btn.setAttribute("aria-disabled", "true");
  const go = ()=>{
    btn.setAttribute("aria-disabled", "false");
    showScreen("growthScreen");
    renderGrowth(true);
  };
  if (reducedMotion()){ go(); return; }
  const svg = $("#vineSvg");
  const fading = [];
  $$("g.cane", svg).forEach(gc=>{
    if (!gc.classList.contains("has-role") || gc.classList.contains("is-removed")) fading.push(gc);
    else $$(".ghost", gc).forEach(gh=> fading.push(gh));
  });
  fading.forEach(el=>{
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center bottom";
    el.animate([{opacity:1, transform:"translateY(0)"}, {opacity:0, transform:"translateY(18px)"}], {duration:420, easing:"cubic-bezier(.5,0,.9,.55)", fill:"forwards"});
  });
  toast("Potatura confermata");
  setTimeout(go, fading.length ? 520 : 200);
}

/* ================= CRESCITA ================= */
const LEAF_D = "M0,-0.22 C-0.18,-0.2 -0.42,-0.18 -0.5,-0.36 C-0.56,-0.46 -0.44,-0.5 -0.38,-0.52 C-0.52,-0.62 -0.5,-0.82 -0.3,-0.8 C-0.24,-0.9 -0.12,-1 0,-1.08 C0.12,-1 0.24,-0.9 0.3,-0.8 C0.5,-0.82 0.52,-0.62 0.38,-0.52 C0.44,-0.5 0.56,-0.46 0.5,-0.36 C0.42,-0.18 0.18,-0.2 0,-0.22Z";
const LEAF_V = "M0,-0.22 L0,-0.98 M0,-0.3 L-0.32,-0.72 M0,-0.3 L0.32,-0.72 M0,-0.26 L-0.4,-0.42 M0,-0.26 L0.4,-0.42";

// capo a frutto piegato ad archetto: sale sopra il filo e scende a legarsi al filo di banchina
function bentCurve(m, keep){
  const dirX = Math.sign(m.curve.at(m.total).x - m.jx) || -1;
  const wy = G.fruitWire, archH = 44;
  let span = Math.max(70, keep * 0.62), arc = null, pts = null;
  for (let it = 0; it < 7; it++){
    const apexX = m.jx + dirX * span * 0.38, apexY = Math.min(m.jy, wy) - archH;
    const endX = m.jx + dirX * span, endY = wy - 2;
    pts = cubicPts([m.jx, m.jy], [m.jx + dirX * 3, m.jy - 26], [apexX - dirX * span * 0.2, apexY], [apexX, apexY], 18)
      .concat(cubicPts([apexX, apexY], [apexX + dirX * span * 0.3, apexY], [endX - dirX * 8, endY - 26], [endX, endY], 18).slice(1));
    arc = makeCurve(pts);
    span *= keep / arc.length;
  }
  const end = pts[pts.length - 1];
  for (let d = 10; d <= 60; d += 10) pts.push([end[0] + dirX * d, end[1]]);
  const c = makeCurve(pts);
  c.tieS = arc.length;
  return c;
}

function prunedModel(L, choicesG, choicesC){
  const parts = [], scars = [];
  L.canes.forEach(m=>{
    const id = m.cane.id;
    let role = null, cut = null;
    if (L.tipo === "guyot"){
      if (choicesG.capo && choicesG.capo.caneId === id){ role = "capo"; cut = choicesG.capo.cutNode; }
      else if (choicesG.sperone && choicesG.sperone.caneId === id){ role = "sperone"; cut = choicesG.sperone.cutNode; }
    } else {
      const c = choicesC[id];
      if (c && !c.removed){ role = "sperone"; cut = c.cutNode; }
    }
    if (!role){
      const t0 = tangentAt(m.curve, 2);
      scars.push({x:m.jx + t0.x * 2, y:m.jy + t0.y * 2, t:t0, w:baseWidth(m.cane)});
      return;
    }
    const n = m.cane.lengthNodes;
    const IN = m.total / n;
    const keep = cut < n ? IN * (cut + 0.32) : m.total;
    const bent = L.tipo === "guyot" && role === "capo";
    const curve = bent ? bentCurve(m, keep) : m.curve;
    parts.push({m, cane:m.cane, role, cut, keep, curve, IN, bent, eff:effectiveBudsUpTo(m.cane, cut)});
  });
  return {parts, scars};
}

function budSide(part, i, curve, s){
  if (part.bent){
    const nm = normalAt(curve, s);
    return nm.y < 0 ? 1 : -1;
  }
  return i % 2 === 0 ? 1 : -1;
}

function paintPart(g, part, ctx, sprouted){
  const c = part.curve, k = ctx.k;
  const total = part.m.total;
  const Wb = baseWidth(part.cane) * ctx.wScale, Wt = Math.max(1.8, Wb * 0.34);
  const wAt = s=> lerp(Wb, Wt, s / total);
  const pal = part.cane.lignificazione < 0.6 ? WOOD.green : WOOD.ripe;
  paintWood(g, c, 0, part.keep, Wb, wAt(part.keep), pal);
  paintCorona(g, c, part.IN, wAt, ctx, part.cane.corona);
  if (STATE.forma === "guyot") paintOldCollar(g, part.m);
  const buds = [];
  for (let i = 1; i <= part.cut; i++){
    const s = Math.min(part.keep, part.IN * i);
    const p = c.at(s), t = tangentAt(c, s), nm = normalAt(c, s), w = wAt(s);
    const side = budSide(part, i, c, s);
    if (i < part.cane.lengthNodes) paintNode(g, p, t, w, pal);
    const blind = part.cane.blindNodes.includes(i);
    let info;
    if (sprouted && !blind){
      const bx = p.x + nm.x * side * w * 0.42, by = p.y + nm.y * side * w * 0.42;
      svgEl("ellipse", {cx:bx.toFixed(1), cy:by.toFixed(1), rx:(ctx.budH * 0.32).toFixed(2), ry:(ctx.budH * 0.26).toFixed(2), fill:"#6E8A4C"}, g);
      info = {x:bx, y:by, tipX:bx, tipY:by};
    } else {
      info = paintBud(g, p, t, nm, side, w, ctx.budH, blind, 1);
    }
    buds.push({i, blind, p, nm, side, w, base:{x:info.tipX, y:info.tipY}});
  }
  if (part.cut < part.cane.lengthNodes) paintCutFace(g, c.at(part.keep), tangentAt(c, part.keep), wAt(part.keep), k, false);
  if (part.bent){
    [part.keep - 24, part.keep - 6].forEach(s2=>{
      if (s2 < 10) return;
      const p = c.at(s2);
      svgEl("path", {d:`M${(p.x - 2.5).toFixed(1)},${(p.y - 4).toFixed(1)} q2.5,10 5,0`, stroke:"#4F5A44", "stroke-width":1.4, fill:"none"}, g);
    });
  }
  return buds;
}

function paintScar(g, sc){
  const ang = Math.atan2(sc.t.y, sc.t.x) * 180 / Math.PI;
  svgEl("ellipse", {cx:sc.x.toFixed(1), cy:sc.y.toFixed(1), rx:1.8, ry:(sc.w * 0.5).toFixed(2), transform:`rotate(${ang.toFixed(1)} ${sc.x.toFixed(1)} ${sc.y.toFixed(1)})`, fill:"#E3D3AE", stroke:"#8E7458", "stroke-width":0.6}, g);
}

function planShoots(parts, buds, rng){
  const shoots = [];
  parts.forEach((part, pi)=>{
    // sul capo ad archetto l'acrotonia è attenuata; restano un po' più vigorose la punta e la sommità dell'arco
    let sApex = 0;
    if (part.bent){
      let minY = Infinity;
      for (let s2 = 0; s2 <= part.keep; s2 += 4){ const p = part.curve.at(s2); if (p.y < minY){ minY = p.y; sApex = s2; } }
    }
    buds[pi].forEach(b=>{
      const i = b.i, cutNode = part.cut;
      const baseLen = 46 + part.cane.lignificazione * 10;
      let vigor;
      if (b.blind){
        vigor = 0.28;   // controgemma: germoglio debole e poco fertile al posto della gemma principale
      } else if (part.bent){
        const s2 = Math.min(part.keep, part.IN * i);
        vigor = 0.62 + 0.38 * (i / cutNode) + 0.14 * Math.exp(-Math.pow((s2 - sApex) / (0.18 * part.keep), 2));
      } else {
        vigor = 0.4 + 0.6 * (i / cutNode);
      }
      const len = baseLen * vigor * 2.3;
      const lean = ((i % 2 ? 1 : -1) * (3 + rng() * 7) + (part.bent ? Math.sign(part.curve.at(part.keep).x - part.m.jx) * 5 : 0)) * Math.PI / 180;
      const dir = {x:Math.sin(lean), y:-Math.cos(lean)};
      const perp = {x:-dir.y, y:dir.x};
      const bend = (rng() - 0.5) * len * 0.22;
      const b0 = b.base;
      const e = {x:b0.x + dir.x * len, y:b0.y + dir.y * len};
      const c = {x:b0.x + dir.x * len * 0.5 + perp.x * bend, y:b0.y + dir.y * len * 0.5 + perp.y * bend};
      shoots.push({part, pi, i, len, b:b0, c, e, order:cutNode - i, weak:!!b.blind});
    });
  });
  return shoots;
}
function quadAt(sh, t){
  const mt = 1 - t;
  return {x:mt * mt * sh.b.x + 2 * mt * t * sh.c.x + t * t * sh.e.x, y:mt * mt * sh.b.y + 2 * mt * t * sh.c.y + t * t * sh.e.y};
}
function quadTan(sh, t){
  const x = 2 * (1 - t) * (sh.c.x - sh.b.x) + 2 * t * (sh.e.x - sh.c.x);
  const y = 2 * (1 - t) * (sh.c.y - sh.b.y) + 2 * t * (sh.e.y - sh.c.y);
  const l = Math.hypot(x, y) || 1;
  return {x:x / l, y:y / l};
}

let growthAnims = [];
function stopGrowthAnims(finish){
  growthAnims.forEach(a=>{ try{ if (finish) a.finish(); else a.cancel(); }catch(e){ /* animazione già conclusa */ } });
  growthAnims = [];
}

function paintShoot(g, sh, ctx, rng, anim, delay){
  const k = ctx.k;
  const grp = svgEl("g", {class:"shoot"}, g);
  const stem = svgEl("path", {d:`M${sh.b.x.toFixed(1)},${sh.b.y.toFixed(1)} Q${sh.c.x.toFixed(1)},${sh.c.y.toFixed(1)} ${sh.e.x.toFixed(1)},${sh.e.y.toFixed(1)}`,
    fill:"none", stroke: sh.weak ? "#A7B585" : "#5E8144", "stroke-width":Math.max(sh.weak ? 1.6 : 2.4, (sh.weak ? 1.2 : 1.7) / k).toFixed(2), "stroke-linecap":"round"}, grp);
  const dur = 520 + sh.len * 3.2;
  if (anim && !reducedMotion()){
    const L = stem.getTotalLength();
    stem.style.strokeDasharray = `${L.toFixed(1)}`;
    stem.style.strokeDashoffset = `${L.toFixed(1)}`;
    growthAnims.push(stem.animate([{strokeDashoffset:L}, {strokeDashoffset:0}], {duration:dur, delay, easing:"cubic-bezier(.32,.72,0,1)", fill:"forwards"}));
  }
  const nL = clamp(Math.round(sh.len / 26), 1, 6);
  const scaleF = clamp(sh.len / 110, 0.7, 1.15);
  for (let j = 0; j < nL; j++){
    const t = (j + 0.55) / (nL + 0.35);
    const pt = quadAt(sh, t), tg = quadTan(sh, t);
    const side = j % 2 ? 1 : -1;
    const ld = {x:tg.x * 0.35 + (-tg.y) * side * 0.94, y:tg.y * 0.35 + tg.x * side * 0.94};
    const size = lerp(19, 10, t) * scaleF;
    const pet = size * 0.28;
    const ox = pt.x + ld.x * pet, oy = pt.y + ld.y * pet;
    const rot = Math.atan2(ld.y, ld.x) * 180 / Math.PI + 90 + (rng() - 0.5) * 16;
    const young = t > 0.72;
    const outer = svgEl("g", {transform:`translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${size.toFixed(2)})`}, grp);
    const inner = svgEl("g", {class:"leaf"}, outer);
    svgEl("path", {d:"M0,0 L0,-0.22", stroke:"#5E8144", "stroke-width":(1.1 / size).toFixed(3), fill:"none"}, inner);
    svgEl("path", {d:LEAF_D, fill: sh.weak ? "#CBD5A8" : young ? "#A6C27B" : (j % 2 ? "#7FA35A" : "#86A962"), stroke: sh.weak ? "#98A676" : "#56773C", "stroke-width":(0.7 / size).toFixed(3)}, inner);
    svgEl("path", {d:LEAF_V, stroke:"#56773C", "stroke-width":(0.6 / size).toFixed(3), fill:"none", opacity:0.75}, inner);
    svgEl("path", {d:`M${pt.x.toFixed(1)},${pt.y.toFixed(1)} L${ox.toFixed(1)},${oy.toFixed(1)}`, stroke:"#5E8144", "stroke-width":1, fill:"none"}, grp);
    if (anim && !reducedMotion()){
      inner.style.transformOrigin = "0px 0px";
      growthAnims.push(inner.animate([{opacity:0, transform:"scale(.25)"}, {opacity:1, transform:"scale(1)"}],
        {duration:460, delay:delay + dur * t * 0.9, easing:"cubic-bezier(.32,.72,0,1)", fill:"backwards"}));
    }
  }
  // apice e viticcio
  const tipT = quadTan(sh, 1);
  const apex = svgEl("path", {d:`M${sh.e.x.toFixed(1)},${sh.e.y.toFixed(1)} q${(tipT.x * 5 - tipT.y * 3).toFixed(1)},${(tipT.y * 5 + tipT.x * 3).toFixed(1)} ${(tipT.x * 7 - tipT.y * 7).toFixed(1)},${(tipT.y * 7 + tipT.x * 7).toFixed(1)}`, stroke:"#8FB064", "stroke-width":1.6, fill:"none", "stroke-linecap":"round"}, grp);
  if (sh.len > 70){
    const pt = quadAt(sh, 0.62), tg = quadTan(sh, 0.62);
    svgEl("path", {d:"M0,0 C3,-1 7,-2 10,-1 C13,0 13,4 10,4.4 C8,4.6 7.5,2.4 9.2,2", transform:`translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${(Math.atan2(tg.y, tg.x) * 180 / Math.PI + 40).toFixed(1)})`, stroke:"#7E9E57", "stroke-width":0.9, fill:"none"}, grp);
  }
  if (anim && !reducedMotion()){
    growthAnims.push(apex.animate([{opacity:0}, {opacity:1}], {duration:240, delay:delay + dur * 0.9, fill:"backwards"}));
  }
  return delay + dur;
}

function renderPruned(svg, opts){
  const L = layoutFor(STATE.vine);
  const PM = prunedModel(L, opts.choicesG, opts.choicesC);
  const rngPlan = mulberry32(STATE.vine.drawSeed + 7);
  // prima passata per conoscere i punti delle gemme e i germogli (per l'inquadratura)
  const b = newBounds();
  addPt(b, -46, 0); addPt(b, 46, 0);
  if (L.tipo === "cordone"){ addPt(b, L.xStart - 24, L.y0); addPt(b, L.xEnd + 24, L.y0); }
  else { addPt(b, -40, G.headY - 70); addPt(b, 40, G.headY - 20); }
  PM.parts.forEach(pt=>{
    for (let s = 0; s <= pt.keep; s += 8){ const p = pt.curve.at(s); addPt(b, p.x, p.y); }
  });
  const prelim = {k:1, budH:9, wScale:1};
  const fakeBuds = PM.parts.map(pt=>{
    const arr = [];
    for (let i = 1; i <= pt.cut; i++){
      const s = Math.min(pt.keep, pt.IN * i);
      const p = pt.curve.at(s), nm = normalAt(pt.curve, s), side = budSide(pt, i, pt.curve, s);
      arr.push({i, blind:pt.cane.blindNodes.includes(i), base:{x:p.x + nm.x * side * 9, y:p.y + nm.y * side * 9}});
    }
    return arr;
  });
  let shootsPrelim = [];
  if (opts.mode === "growth"){
    shootsPrelim = planShoots(PM.parts, fakeBuds, mulberry32(STATE.vine.drawSeed + 7));
    shootsPrelim.forEach(sh=>{ addPt(b, sh.e.x - 22, sh.e.y - 16); addPt(b, sh.e.x + 22, sh.e.y); addPt(b, sh.b.x - 20, sh.b.y); addPt(b, sh.b.x + 20, sh.b.y); });
  }
  addPt(b, 0, 30);
  if (opts.mode === "mini"){
    // spazio per le etichette con il numero di gemme (stima con una scala tipica delle miniature)
    const k0 = 0.55;
    PM.parts.forEach(pt=>{
      const s = pt.bent ? Math.min(pt.keep * 0.62, pt.keep - 10) : pt.keep;
      const p = pt.curve.at(s), nm = normalAt(pt.curve, s), tt = tangentAt(pt.curve, pt.keep);
      const side = pt.bent ? (nm.y < 0 ? 1 : -1) : 1;
      const x = pt.bent ? p.x + nm.x * side * 24 / k0 : p.x + tt.x * 20 / k0;
      const y = pt.bent ? p.y + nm.y * side * 24 / k0 : p.y + tt.y * 20 / k0;
      const half = L.tipo === "cordone" ? 12 / k0 : 42 / k0;
      addPt(b, x - half, y - 12 / k0); addPt(b, x + half, y + 12 / k0);
    });
  }
  const vb = fitView(svg, b, opts.mode === "mini" ? {padX:14, padTop:36, padBottom:6, maxK:1.4} : {padX:24, padTop:40, padBottom:10, maxK:1.15});
  if (!vb) return null;
  const {scene, fxl} = ensureLayers(svg);
  scene.innerHTML = "";
  fxl.innerHTML = "";
  const k = vb.k;
  const ctx = {k, rng:mulberry32(STATE.vine.drawSeed), uid:svg.id, season: opts.mode === "growth" ? "spring" : "winter",
    wScale:clamp(0.85 / k, 1, 1.4), budH:Math.max(9, 8.5 / k)};
  if (opts.mode === "mini") ctx.budH = Math.max(8, 7 / k);
  paintBackdrop(scene, ctx, vb);
  paintVineBase(scene, ctx, L, vb, false);
  const gWood = svgEl("g", null, scene);
  PM.scars.forEach(sc=> paintScar(gWood, sc));
  const budsAll = PM.parts.map(pt=> paintPart(gWood, pt, ctx, opts.mode === "growth"));
  const gLabels = svgEl("g", null, scene);

  if (opts.mode === "mini"){
    PM.parts.forEach(pt=>{
      const s = pt.bent ? Math.min(pt.keep * 0.62, pt.keep - 10) : pt.keep;
      const p = pt.curve.at(s), nm = normalAt(pt.curve, s);
      const side = pt.bent ? (nm.y < 0 ? 1 : -1) : 1;
      const off = pt.bent ? 24 / k : 0;
      const tt = tangentAt(pt.curve, pt.keep);
      const x = pt.bent ? p.x + nm.x * side * off : p.x + tt.x * 20 / k;
      const y = pt.bent ? p.y + nm.y * side * off : p.y + tt.y * 20 / k;
      if (L.tipo === "cordone"){
        const R = 9 / k;
        svgEl("circle", {cx:x.toFixed(1), cy:y.toFixed(1), r:R.toFixed(2), fill:ROLE_FILL[pt.role], stroke:"#FFFDF7", "stroke-width":(1.2 / k).toFixed(2)}, gLabels);
        const tx = svgEl("text", {x:x.toFixed(1), y:(y + 3.8 / k).toFixed(1), "text-anchor":"middle", "font-family":MONO, "font-size":(11 / k).toFixed(2), "font-weight":600, fill:ROLE_TEXT[pt.role]}, gLabels);
        tx.textContent = pt.eff;
      } else {
        pill(gLabels, x, y, `${pt.eff} ${pt.eff === 1 ? "GEMMA" : "GEMME"}`, k, ROLE_FILL[pt.role], ROLE_TEXT[pt.role]);
      }
    });
    return {PM};
  }

  // germogli
  const shoots = planShoots(PM.parts, budsAll, rngPlan);
  const gShoots = svgEl("g", null, scene);
  const rngLeaf = mulberry32(STATE.vine.drawSeed + 11);
  let end = 0;
  const partDelay = {};
  let acc = 200;
  PM.parts.forEach((pt, pi)=>{ partDelay[pi] = acc; acc += 120; });
  shoots.sort((a, b)=> a.pi - b.pi || a.order - b.order);
  shoots.forEach(sh=>{
    const delay = partDelay[sh.pi] + sh.order * 120;
    end = Math.max(end, paintShoot(gShoots, sh, ctx, rngLeaf, opts.animate, delay));
  });

  // annotazioni: acrotonia sul capo a frutto, gemma cieca
  const ann = svgEl("g", null, gLabels);
  const capoIdx = PM.parts.findIndex(pt=> pt.role === "capo");
  if (capoIdx >= 0){
    const tips = shoots.filter(sh=> sh.pi === capoIdx && !sh.weak).sort((a, b)=> a.i - b.i).map(sh=> [sh.e.x, sh.e.y - 6 / k]);
    if (tips.length >= 3){
      let d = "M" + fx(tips[0]);
      for (let i = 1; i < tips.length - 1; i++) d += "Q" + fx(tips[i]) + " " + fx([(tips[i][0] + tips[i + 1][0]) / 2, (tips[i][1] + tips[i + 1][1]) / 2]);
      d += "L" + fx(tips[tips.length - 1]);
      svgEl("path", {d, fill:"none", stroke:"#6B6456", "stroke-width":(1.4 / k).toFixed(2), "stroke-dasharray":`${(4 / k).toFixed(2)} ${(4 / k).toFixed(2)}`}, ann);
      const last = tips[tips.length - 1];
      pill(ann, last[0], last[1] - 16 / k, "ACROTONIA", k, "#FFFDF7", "#4F493E");
    }
  }
  let blindShown = false;
  PM.parts.forEach((pt, pi)=>{
    budsAll[pi].forEach(bd=>{
      if (!bd.blind || blindShown) return;
      blindShown = true;
      const p = bd.base;
      const lx = p.x + bd.nm.x * bd.side * 26 / k, ly = p.y + bd.nm.y * bd.side * 26 / k + (pt.bent ? -10 / k : 0);
      svgEl("path", {d:`M${p.x.toFixed(1)},${p.y.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)}`, stroke:"#6B6456", "stroke-width":(1 / k).toFixed(2)}, ann);
      pill(ann, lx, ly - 10 / k, "CONTROGEMMA · POCO FERTILE", k, "#FFFDF7", "#4F493E");
    });
  });
  if (opts.animate && !reducedMotion()){
    growthAnims.push(ann.animate([{opacity:0}, {opacity:0, offset:0.85}, {opacity:1}], {duration:end + 300, fill:"backwards"}));
  }
  return {PM, shoots, end};
}

let growthDirty = false, growthTimer = 0;
function renderGrowth(animate){
  stopGrowthAnims(false);
  clearTimeout(growthTimer);
  growthDirty = false;
  if (!PENDING) return;
  const r = renderPruned($("#growthSvg"), {mode:"growth", choicesG:PENDING.choicesG, choicesC:PENDING.choicesC, animate});
  if (animate && r && !reducedMotion()){
    // se lo schermo è cambiato durante l'animazione, a fine crescita si rifà l'inquadratura
    growthTimer = setTimeout(()=>{
      if (growthDirty && $("#growthScreen").classList.contains("is-active")) renderGrowth(false);
    }, r.end + 450);
  }
  const guyot = STATE.forma === "guyot";
  $("#growthCaption").innerHTML = guyot
    ? "Il capo è piegato ad <b>archetto</b> e legato al filo: la piegatura attenua l'<b>acrotonia</b>, cioè la tendenza delle gemme verso la punta a germogliare con più vigore. I germogli sono più uniformi, un po' più lunghi in punta e sulla sommità dell'arco. Dalle gemme cieche può spuntare una <b>controgemma</b>: un germoglio debole, pallido e poco fertile. Quanto l'archetto attenui l'acrotonia dipende da vitigno, vigore e angolo di piegatura: gli autori non sono concordi."
    : "Sugli speroni, quasi verticali, l'<b>acrotonia</b> resta piena: il germoglio più vigoroso è quello della gemma più lontana dalla base. Dalle gemme cieche può spuntare una <b>controgemma</b>: un germoglio debole, pallido e poco fertile.";
  $("#growthIntro").textContent = guyot
    ? "Il capo a frutto è stato piegato ad archetto e legato al filo; il legno tolto è stato eliminato. Ora guarda dove nascono i germogli."
    : "Gli speroni sono stati tagliati e i tralci eliminati sono stati tolti dal cordone. Ora guarda dove nascono i germogli.";
}
$("#btnReplayGrowth").addEventListener("click", ()=> renderGrowth(true));
$("#btnSeeScore").addEventListener("click", ()=> showResult());
$("#btnSkipGrowth").addEventListener("click", ()=>{ stopGrowthAnims(true); showResult(); });

/* ================= RISULTATO ================= */
const PRINCIPLES = [
  {key:"ramificazione", name:"Ramificazione controllata"},
  {key:"linfa", name:"Continuità del flusso linfatico"},
  {key:"tagli", name:"Tagli piccoli e mirati"},
  {key:"ferite", name:"Ferite sullo stesso lato"},
  {key:"rispetto", name:"Legno di rispetto"}
];

function showResult(){
  if (!PENDING) return;
  stopGrowthAnims(true);
  const result = PENDING.result;
  let recInfo = PENDING.recInfo;
  if (!PENDING.shown){
    PENDING.shown = true;
    STATE.session.count++;
    STATE.session.totalScore += result.score;
    recInfo = saveRecord(result.score);
    PENDING.recInfo = recInfo;
  }
  showScreen("resultScreen");
  const score = result.score;
  const guyot = STATE.forma === "guyot";

  $("#resultEyebrow").textContent = `Risultato · vite ${STATE.session.count}`;
  $("#scoreVerdict").textContent =
    result.gate ? "Da rivedere" :
    score >= 92 ? "Potatura da manuale" :
    score >= 75 ? "Ottimo lavoro" :
    score >= 50 ? "Ci siamo quasi" : "Da rivedere";
  if (result.gate){
    $("#verdictSub").textContent = result.gate.why === "nessun taglio" ? "Potatura non valida: non hai accorciato né il capo a frutto né lo sperone." : "Potatura non valida: sul capo a frutto sono rimaste troppo poche gemme.";
  } else if (guyot){
    $("#verdictSub").textContent = `${result.effC} ${result.effC === 1 ? "gemma franca" : "gemme franche"} sul capo a frutto (target ${guyotTarget().min}-${guyotTarget().max}), ${result.effS} sullo sperone di rinnovo.`;
  } else {
    const ok = result.posScores.filter(p=> p === 100).length;
    $("#verdictSub").textContent = `${ok} ${ok === 1 ? "posizione decisa" : "posizioni decise"} in modo ideale su ${result.posScores.length}.`;
  }

  // numero e barra
  const numEl = $("#scoreNum");
  const meter = $("#scoreMeter");
  const color = score >= 75 ? "#2E6B45" : score >= 50 ? "#A9581F" : "#9B3B2E";
  meter.style.background = color;
  meter.style.transition = "none";
  meter.style.transform = "scaleX(0)";
  void meter.offsetWidth;
  meter.style.transition = "";
  requestAnimationFrame(()=>{ meter.style.transform = `scaleX(${score / 100})`; });
  if (reducedMotion()){
    numEl.textContent = score;
  } else {
    const start = performance.now(), dur = 900;
    const step = now=>{
      const p = Math.min(1, (now - start) / dur);
      numEl.textContent = Math.round(score * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const starCount = score >= 92 ? 3 : score >= 75 ? 2 : score >= 50 ? 1 : 0;
  $$("#starsRow .ico").forEach((s, i)=>{
    s.classList.toggle("lit", i < starCount);
    s.classList.remove("pop");
    if (i < starCount){ s.style.animationDelay = `${600 + i * 140}ms`; void s.getBoundingClientRect(); s.classList.add("pop"); }
  });
  $("#starsRow").setAttribute("aria-label", `${starCount} ${starCount === 1 ? "stella" : "stelle"} su 3`);

  // record e sessione
  const meta = [];
  if (recInfo.isNew && recInfo.prevBest != null) meta.push(`<span class="chip accent">${iconSvg("star")}nuovo record · prima ${recInfo.prevBest}</span>`);
  else if (recInfo.isNew) meta.push(`<span class="chip accent">${iconSvg("star")}primo record salvato</span>`);
  else meta.push(`<span class="chip">${iconSvg("star")}record ${recInfo.rec.best}/100</span>`);
  meta.push(`<span class="chip">${FORMA_LABELS[STATE.forma]} · ${OBJ_LABELS[STATE.obiettivo]} · ${DIFF_LABELS[STATE.difficolta]}</span>`);
  meta.push(`<span class="chip">sessione: ${STATE.session.count} ${STATE.session.count === 1 ? "vite" : "viti"} · media ${Math.round(STATE.session.totalScore / STATE.session.count)}/100</span>`);
  $("#scoreMeta").innerHTML = meta.join("");

  // principi (Guyot) o regole del cordone
  renderPrinciples(result);

  // confronto con la potatura ideale
  const ideal = guyot ? idealGuyot() : idealCordone();
  PENDING.ideal = ideal;
  $("#cmpYoursCap").innerHTML = describePruning(PENDING.choicesG, PENDING.choicesC, score);
  $("#cmpIdealCap").innerHTML = describePruning(ideal.choices, ideal.choices, ideal.score);
  requestAnimationFrame(renderResultMinis);

  const t = guyotTarget();
  const T = cordTarget();
  const tt = T.min === T.max ? `${T.min}` : `${T.min}-${T.max}`;
  $("#idealBox").innerHTML = guyot
    ? `<h4>La scelta ideale, su questa vite</h4>
       <p>Capo a frutto: un tralcio nato dallo sperone dell'anno scorso (legno di 2 anni), “a matita”, ben lignificato e rivolto verso il filo, tagliato per lasciare ${t.min}-${t.max} gemme franche (obiettivo: ${OBJ_LABELS[STATE.obiettivo]}). Le gemme cieche e quelle della corona non si contano.</p>
       <p>Sperone di rinnovo: un tralcio diverso, più in basso del capo e il più vicino possibile alla testa del ceppo, maturo, tagliato a 2 gemme franche. Può nascere anche dal legno vecchio, purché sia più in basso.</p>
       <p class="note-small">In vigna il numero giusto di gemme dipende anche dal vigore della pianta (per esempio dal peso del legno di potatura dell'anno prima): gli obiettivi del gioco sono una semplificazione. Gli autori non concordano sul fatto che meno gemme diano sempre più qualità, perché la pianta può compensare con germogli e grappoli più grandi.</p>`
    : `<h4>La scelta ideale, su questa vite</h4>
       <p>Su ogni vecchio sperone si tiene il tralcio basale, tagliato a ${tt} ${tt === "1" ? "gemma franca" : "gemme franche"} (obiettivo: ${OBJ_LABELS[STATE.obiettivo]}), e si toglie il distale: è il taglio di ritorno, che tiene lo sperone vicino al cordone.</p>
       <p>Se il basale è difettoso si può tenere il distale, accettando che lo sperone si allunghi. Uno sperone su un tralcio sottile, grosso, verde o rivolto verso il basso vale meno punti.</p>`;

  // dettaglio: prima cosa non va, poi cosa va bene, infine le note sul punteggio
  const bad = result.fb.filter(f=> !f.good), good = result.fb.filter(f=> f.good && !f.info), info = result.fb.filter(f=> f.info);
  const item = f=> `<li><span class="st">${iconSvg(f.info ? "info" : f.good ? "check" : "alert")}</span><span><b>${esc(f.title)}</b><span class="t">${esc(f.text)}</span>${f.next ? `<span class="next"><b>La prossima volta:</b> ${esc(f.next)}</span>` : ""}${f.tag ? `<span class="tag">${esc(f.tag)}</span>` : ""}</span></li>`;
  let html = "";
  if (bad.length) html += `<div class="fb-group bad"><h4>${iconSvg("alert", "sm")}Da rivedere · ${bad.length}</h4><ul class="fb-list stagger">${bad.map(item).join("")}</ul></div>`;
  if (good.length) html += `<div class="fb-group good"><h4>${iconSvg("check", "sm")}Fatto bene · ${good.length}</h4><ul class="fb-list stagger">${good.map(item).join("")}</ul></div>`;
  if (info.length) html += `<div class="fb-group info"><h4>${iconSvg("info", "sm")}Come è calcolato il punteggio</h4><ul class="fb-list stagger">${info.map(item).join("")}</ul></div>`;
  $("#feedbackGrid").innerHTML = html;
  $$("#feedbackGrid .stagger > li").forEach((li, i)=>{ li.style.animationDelay = `${120 + i * 50}ms`; });
}

function describePruning(chG, chC, score){
  if (STATE.forma === "guyot"){
    const c = chG.capo, s = chG.sperone;
    const cc = findCane(c.caneId), cs = findCane(s.caneId);
    const ec = effectiveBudsUpTo(cc, c.cutNode), es = effectiveBudsUpTo(cs, s.cutNode);
    return `Capo a frutto: <b>tralcio ${cc.label}</b>, ${ec} ${ec === 1 ? "gemma franca" : "gemme franche"}<br>Sperone: <b>tralcio ${cs.label}</b>, ${es} ${es === 1 ? "gemma" : "gemme"}<br><span class="num">${score}/100</span>`;
  }
  const parts = STATE.vine.positions.map(pos=>{
    const kept = pos.canes.filter(c=> chC[c.id] && !chC[c.id].removed);
    if (!kept.length) return `${pos.posId + 1}: <b>svuotata</b>`;
    return `${pos.posId + 1}: ` + kept.map(c=>{ const e = effectiveBudsUpTo(c, chC[c.id].cutNode); return `<b>${c.label} ${e}</b>`; }).join(" + ");
  });
  return `Speroni tenuti (tralcio e gemme): ${parts.join(" · ")}<br><span class="num">${score}/100</span>`;
}

function renderResultMinis(){
  if (!PENDING || !$("#resultScreen").classList.contains("is-active")) return;
  renderPruned($("#cmpYours"), {mode:"mini", choicesG:PENDING.choicesG, choicesC:PENDING.choicesC});
  const ideal = PENDING.ideal;
  if (ideal) renderPruned($("#cmpIdeal"), {mode:"mini", choicesG:ideal.choices, choicesC:ideal.choices});
}

function renderPrinciples(result){
  const list = $("#principlesList");
  const st = (cls, ico, label)=> `<span class="st">${iconSvg(ico)}</span><span class="nm">`;
  if (STATE.forma === "guyot"){
    $("#principlesTitle").textContent = "I principi Simonit & Sirch su questa vite";
    list.innerHTML = PRINCIPLES.map(pr=>{
      const items = result.fb.filter(f=> f.p === pr.key);
      if (pr.key === "ferite" && !items.length){
        return `<li class="na">${st("na", "minus")}${pr.name}<small>solo in difficile</small></span><p>Nel livello difficile ogni tralcio tolto lascia una ferita a sinistra o a destra, e il gioco premia chi le raggruppa su un lato.</p></li>`;
      }
      if (pr.key === "rispetto" || !items.length){
        return `<li class="na">${st("na", "minus")}${pr.name}<small>non valutato</small></span><p>In questa partita tagli soltanto legno di un anno. Sul tralcio le pratiche sono due: tagliare a metà dell'internodo sopra l'ultima gemma, oppure sul nodo successivo accecandone la gemma, per usare il diaframma del nodo come barriera al disseccamento (soluzione frequente nei manuali di potatura ramificata). Gli autori non sono concordi su quale sia migliore; il gioco disegna la prima.</p></li>`;
      }
      const ok = items.every(f=> f.good);
      return `<li class="${ok ? "ok" : "bad"}">${st(ok ? "ok" : "bad", ok ? "check" : "alert")}${pr.name}<small>${ok ? "rispettato" : "mancato"}</small></span><p>${items.map(f=> esc(f.title)).join(" · ")}</p></li>`;
    }).join("");
    return;
  }
  $("#principlesTitle").textContent = "Le regole del cordone su questa vite";
  const ch = PENDING.choicesC;
  const T = cordTarget();
  const tt = T.min === T.max ? `${T.min}` : `${T.min}-${T.max}`;
  let ritorno = 0, ritornoTot = 0, target = 0, keptOne = 0, sani = 0, vuote = 0, doppie = 0;
  STATE.vine.positions.forEach(pos=>{
    const [bc, dc] = pos.canes;
    const kept = pos.canes.filter(c=> ch[c.id] && !ch[c.id].removed);
    if (!kept.length){ vuote++; return; }
    if (kept.length === 2){ doppie++; return; }
    keptOne++;
    const c = kept[0];
    const bBad = caneDefects(bc).length > 0 || maxFranche(bc) < T.min;
    if (!bBad){ ritornoTot++; if (c === bc) ritorno++; }
    if (!caneDefects(c).length) sani++;
    const e = effectiveBudsUpTo(c, ch[c.id].cutNode);
    if (e >= T.min && e <= T.max) target++;
  });
  const n = STATE.vine.positions.length;
  const row = (ok, na, name, tag, text)=> ({cls: na ? "na" : ok ? "ok" : "bad", ico: na ? "minus" : ok ? "check" : "alert", name, tag, text});
  const rows = [
    row(vuote === 0 && doppie === 0, false, "Uno sperone per posizione", vuote + doppie === 0 ? "rispettato" : `${vuote} vuote · ${doppie} doppie`, "Ogni vecchio sperone deve lasciare un solo sperone nuovo: né zero (posizione persa) né due (troppe gemme)."),
    row(ritorno === ritornoTot, ritornoTot === 0, "Taglio di ritorno", ritornoTot ? `${ritorno} di ${ritornoTot}` : "non valutato", "Quando il tralcio basale è sano si tiene quello e si toglie il distale, così lo sperone non si allunga."),
    row(target === keptOne, keptOne === 0, `Gemme per sperone: ${tt}`, keptOne ? `${target} di ${keptOne}` : "non valutato", `Per l'obiettivo scelto il target è ${tt} gemme franche per sperone; le gemme della corona e quelle cieche non contano.`),
    row(sani === keptOne, keptOne === 0, "Speroni su tralci sani", keptOne ? `${sani} di ${keptOne}` : "non valutato", "Uno sperone va lasciato su un tralcio maturo, a matita e rivolto verso l'alto: sottile, grosso, verde o dal lato sbagliato costano punti.")
  ];
  if (STATE.difficolta === "difficile"){
    const fer = result.fb.find(f=> f.p === "ferite");
    if (fer) rows.push(row(fer.good, false, "Ferite sullo stesso lato", fer.good ? "rispettato" : "mancato", fer.text));
  }
  list.innerHTML = rows.map(r=> `<li class="${r.cls}"><span class="st">${iconSvg(r.ico)}</span><span class="nm">${r.name}<small>${r.tag}</small></span><p>${r.text}</p></li>`).join("");
}

/* ================= RIDIMENSIONAMENTO ================= */
(function wireResize(){
  let raf = 0;
  const run = ()=>{
    raf = 0;
    if ($("#gameScreen").classList.contains("is-active")) renderStage();
    if ($("#growthScreen").classList.contains("is-active") && PENDING){
      const running = growthAnims.some(a=> a.playState === "running");
      if (!running) renderGrowth(false); else growthDirty = true;
    }
    if ($("#resultScreen").classList.contains("is-active")) renderResultMinis();
  };
  const schedule = ()=>{ if (!raf) raf = requestAnimationFrame(run); };
  if ("ResizeObserver" in window){
    const ro = new ResizeObserver(schedule);
    ro.observe($("#vineSvg"));
    ro.observe($("#growthSvg"));
    ro.observe($("#cmpYours"));
  }
  window.addEventListener("resize", schedule);
})();

/* ================= AVVIO ================= */
loadLastChoice();
renderTutorialSlide(0);
if (tutorialSeen()){
  showScreen("setupScreen");
  syncSetup();
} else {
  showScreen("tutorialScreen");
}

/* Accesso in sola lettura per le verifiche automatiche del punteggio */
window.__potatore = Object.freeze({
  STATE, OBJ_TARGETS, CORD_TARGETS, effectiveBudsUpTo, evaluateGuyot, evaluateCordone, idealGuyot, idealCordone, allCanes, findCane,
  startNewVine, refresh, doCut, doRemove, selectCane, setRole
});

})();
