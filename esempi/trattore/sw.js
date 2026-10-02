/* Service worker di "Il trattore in campo".
 *
 * - Alla prima apertura mette in cache TUTTI i file del sito (pagina, font, immagini, icone,
 *   script in vendor/ e modelli .glb): da quel momento il sito funziona anche offline.
 * - Aggiornamento automatico: pagina, script e modelli si chiedono prima alla rete e la
 *   cache viene riscritta con la versione nuova; senza rete si usa la copia in cache.
 *   Font e immagini si servono subito dalla cache e si aggiornano in secondo piano.
 * - Se cambia questo file (per esempio VERSIONE), il browser installa il nuovo service
 *   worker, che riscarica tutto e cancella le cache vecchie.
 */
const VERSIONE = "2026-09-30.1";
const CACHE = "trattore-" + VERSIONE;

const FILE = [
  "./",
  "index.html",
  "ciclo-motore.html",
  "manifest.webmanifest",
  "assets/fonts/fraunces-latin-wght-normal.woff2",
  "assets/fonts/fraunces-latin-wght-italic.woff2",
  "assets/fonts/ibm-plex-sans-latin-400-normal.woff2",
  "assets/fonts/ibm-plex-sans-latin-500-normal.woff2",
  "assets/fonts/ibm-plex-sans-latin-600-normal.woff2",
  "assets/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "assets/fonts/ibm-plex-mono-latin-500-normal.woff2",
  "assets/fonts/ibm-plex-mono-latin-600-normal.woff2",
  "assets/img/trattore-hero.webp",
  "assets/icons/favicon-16.png",
  "assets/icons/favicon-32.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-72.png",
  "assets/icons/icon-96.png",
  "assets/icons/icon-144.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-256.png",
  "assets/icons/icon-384.png",
  "assets/icons/icon-512.png",
  "assets/icons/maskable-192.png",
  "assets/icons/maskable-512.png",
  "vendor/three-runtime.min.js",
  "vendor/trattore-scene.min.js",
  "vendor/motore-viewer.min.js",
  "vendor/gsap.min.js",
  "vendor/gsap-scrolltrigger.min.js",
  "vendor/ciclo-motore-3d.min.js",
  "models/trattore.glb",
  "models/motore_diesel.glb",
  "models/motore_diesel-poster.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: "reload" evita di copiare nella cache del service worker versioni vecchie
      // rimaste nella cache HTTP del browser
      .then((c) => c.addAll(FILE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("trattore-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATICI = /\.(woff2|png|webp|jpg|svg)$/i;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(STATICI.test(url.pathname) ? primaCache(req, event) : primaRete(req));
});

/* Rete prima (con attesa massima se c'è già una copia), poi cache */
async function primaRete(req) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req, { ignoreSearch: true }) ||
                (req.mode === "navigate" ? await cache.match("index.html") : undefined);
  const rete = fetch(req).then((res) => {
    if (res && res.ok && res.type === "basic") cache.put(stripSearch(req), res.clone());
    return res;
  });
  if (!copia) return rete;
  // con una copia pronta non si aspetta una rete lenta oltre 4 secondi
  const attesa = new Promise((ok) => setTimeout(() => ok(copia), 4000));
  return Promise.race([rete.catch(() => copia), attesa]);
}

/* Cache prima, aggiornamento in secondo piano */
async function primaCache(req, event) {
  const cache = await caches.open(CACHE);
  const copia = await cache.match(req, { ignoreSearch: true });
  const rete = fetch(req).then((res) => {
    if (res && res.ok && res.type === "basic") cache.put(stripSearch(req), res.clone());
    return res;
  }).catch(() => copia);
  if (copia) { event.waitUntil(rete); return copia; }
  return rete;
}

function stripSearch(req) {
  const u = new URL(req.url); u.search = "";
  return u.toString();
}
