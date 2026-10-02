# DESIGN.md — Il trattore in campo

Sistema visivo dell'app di studio sulla meccanica del trattore. Riferimento unico per
pagina web, formule, scene 3D e modelli (Blender → glTF → three.js).
Carattere: **pubblicazione tecnica di qualità**, come un quaderno di ingegneria stampato
bene: carta calda, inchiostro verde bosco, un solo accento ruggine, formule composte come
in un libro.

## 1. Principi

1. **Chiarezza tecnica prima dell'estetica.** Ogni colore, movimento o etichetta aiuta a
   capire un fenomeno meccanico. Niente decorazione fine a sé stessa.
2. **Carta e campo.** Toni caldi (carta, inchiostro, verde bosco, ruggine). Niente neri puri,
   niente gradienti viola/blu, niente grana sovrapposta (peserebbe sulle scene WebGL).
3. **Un solo accento.** Il ruggine segnala ciò che è attivo, selezionato o da guardare
   *adesso*: fase corrente, cursori, occhielli. Non si usa per decorare.
4. **Formule da libro.** MathML nativo: variabili in corsivo, pedici veri, operatori con la
   loro spaziatura, unità in tondo separate dal numero da uno spazio sottile, virgola decimale.
5. **Il soggetto resta visibile.** Nelle scene 3D formule, frecce ed etichette non coprono
   mai il trattore o il pezzo selezionato.
6. **Telefono per primo.** Target touch ≥ 44 px, nessuno scorrimento orizzontale a 390 px,
   tutto offline (font e librerie in locale), 60 fps anche con CPU rallentata 4×.

## 2. Colori

Tutti gli inchiostri superano WCAG AA (4,5:1) sulle superfici su cui sono usati.

| Token | Valore | Uso | Contrasto |
|---|---|---|---|
| `--bg` | `#EEE8DA` | Sfondo pagina (carta) | — |
| `--surface` | `#F7F3E9` | Fondo degli strumenti, barre di riproduzione | — |
| `--surface-2` | `#FFFDF7` | Card, pannelli, schede, input | — |
| `--sunken` | `#E6DFCE` | Tracce, segmenti inattivi, valori dei cursori | — |
| `--tray` | `#E2D9C5` | Vassoio esterno degli strumenti e dell'immagine hero | — |
| `--ink` | `#221E18` | Testo principale | 12,5:1 su `--sunken` |
| `--ink-2` | `#4F493E` | Testo secondario, etichette | 7,3:1 su `--bg` |
| `--ink-3` | `#6B6456` | Didascalie, intervalli, footer | 4,8:1 su `--bg` |
| `--line` / `--line-strong` | `#DCD3BF` / `#C4B99F` | Divisori | — |
| `--brand` | `#233A2C` | Titoli, pulsante primario, riepilogo mobile | 12:1 su `--surface-2` |
| `--brand-2` | `#2F4A39` | Hover del primario | — |
| `--brand-ink` | `#F3EEE2` | Testo su `--brand` | 10,6:1 |
| `--accent` | `#A9581F` | Solo riempimenti e segni grandi: cursori, punti, barre attive | — |
| `--accent-ink` | `#8A4415` | Testo ruggine (occhielli, etichette di fase) | 5,9:1 su `--bg` |
| `--accent-soft` | `#F3E3D2` | Fondo della nota e dei pulsanti attivi | — |
| `--ok` / `--ok-soft` | `#2E6B45` / `#DCE9DF` | Badge "stabile" | 5,1:1 |
| `--danger` / `--danger-soft` | `#9B3B2E` / `#F3DCD6` | Valore fuori limite, badge "a rischio" | 5,2:1 |

**Forze** (scena, etichette, legenda): Fa `#2E8B4F`, Fra `#6B6456`, Fu `#D8541C`, M `#3E5C76`.
Il colore compare sulla freccia e sul pallino dell'etichetta; il testo dell'etichetta è
sempre crema su fondo scuro (13,8:1), quindi leggibile su qualsiasi sfondo della scena.

La modalità scura non è prevista: l'app è pensata come quaderno di studio su carta
(`color-scheme: light`).

## 3. Tipografia

Font inclusi nel progetto, in `assets/fonts/` (woff2, sottoinsieme latino, 202 kB in tutto).
Fraunces tondo e Plex Sans 400 sono precaricati.

| Ruolo | Font | Pesi | Note |
|---|---|---|---|
| Titoli | **Fraunces** (variabile, tondo e corsivo) | 500–600 | `opsz` alto, tracking −0,022/−0,03 em, `text-wrap: balance` |
| Formule | **Fraunces** corsivo per le variabili | 400 | Greco (α, η, ω) da Georgia / Noto Serif |
| Testo e interfaccia | **IBM Plex Sans** | 400 · 500 · 600 | Corpo 16/1,6, massimo 52–56 caratteri per riga |
| Numeri e dati | **IBM Plex Mono** | 400 · 500 · 600 | `tabular-nums`; unità in Plex Sans più piccola |

**Scala** (rapporto ≈ 1,25): 12 · 13 · 14 · 16 · 18 · 22 · H2 `clamp(28px, 4.2vw, 40px)` ·
H1 `clamp(40px, 7.2vw, 76px)`.
- Occhielli: Plex Mono 12 px maiuscolo, spaziatura +0,06/+0,08 em, in `--accent-ink`,
  numerati per sezione ("01 · Simulazione").
- Titoli con la sola iniziale maiuscola (uso italiano).
- Numeri nelle card: Plex Mono 22–26 px seguiti dall'unità in Plex Sans 14 px.

### Formule (MathML)
- `<mi>` in corsivo per le variabili (`text-transform: none`, così resta il font Fraunces).
- Pedici descrittivi in tondo: `<mtext>ra</mtext>`, `<mtext>u,tr</mtext>`, oppure
  `<mi mathvariant="normal">a</mi>`.
- Nomi di funzione in tondo (`<mi class="fn">cos</mi>`) seguiti da `&#x2061;`
  (applicazione di funzione) per lo spazio corretto prima dell'argomento.
- Operatori `·` `=` `≤` `≥` `<` `−` `±` sempre come `<mo>`; frazioni con `<mfrac>`.
- Numeri con virgola decimale (`0,75`); unità in tondo con spazio sottile (`7,2 km/h`,
  `daN·m`).
- Dove c'è un valore in tempo reale: formula simbolica in un riquadro, sotto il simbolo
  del risultato con `=` e il valore grande in mono.

## 4. Spazi, griglia, raggi e profondità

- Contenitore `max-width: 1200px`, margine `--gutter = clamp(16px, 5vw, 40px)`.
- Griglia a 8 pt: 4 · 8 · 12 · 16 · 20 · 24 · 28 · 36 · 48 · 64 px.
- Sezioni: `--sec = clamp(72px, 9vw, 120px)` di spazio sopra ogni sezione.
- Testata di sezione su due colonne da 900 px in su: occhiello + H2 a sinistra, sottotitolo a
  destra allineato in basso.
- Raggi: `--r-xs` 6 · `--r-sm` 8 · `--r-md` 12 · `--r-lg` 16 · `--r-xl` 22 px · 999 px per
  pillole e pulsanti.
- Profondità:
  - `--hairline`: bordo interno di 1 px `rgba(35,58,44,.09)`, al posto dei bordi grigi;
  - `--shadow-1`: ombra minima per card e pannelli;
  - `--shadow-2`: ombra ampia e tinta di verde, solo per strumenti e immagine hero.
- **Strumento (doppio bordo).** Vassoio esterno `--tray` con padding 6 px e raggio 22;
  nucleo interno con raggio 16 e luce interna di 1 px. Si usa solo per le due scene 3D e
  per l'immagine hero.
- Livelli: `--z-hud` 5 · `--z-panel` 8 · `--z-popup` 10 · `--z-bar` 18 · `--z-nav` 20.

## 5. Componenti

- **Barra di navigazione**: fissa, 60 px, carta traslucida con blur (unico elemento con blur).
  Le voci stanno in una pillola; quella della sezione in vista è piena in `--brand`
  (`aria-current`). Su mobile: solo il logo più voci scorrevoli su una riga, con dissolvenza
  sul bordo destro.
- **Hero**: due colonne da 900 px in su.
  - A sinistra occhiello a pillola, H1 con "in 3D" in corsivo ruggine, testo introduttivo
    e i 3 passi numerati separati da un filetto.
  - A destra l'immagine del trattore renderizzata da Blender (`assets/img/trattore-hero.webp`,
    34 kB) in uno strumento, con chip dei dati principali sotto.
- **Pulsanti**:
  - primario: pillola `--brand`, altezza ≥ 44 px, icona in un cerchio interno;
  - secondario (`.quiet`): carta con bordo sottile;
  - solo icona: 44 × 44 px con `aria-label`;
  - stato attivo (`aria-pressed`): fondo `--accent-soft`;
  - da premuti `scale(.97)`.
- **Cursori**: traccia di 4 px riempita in `--accent` fino al valore, pomello di 22 px con
  anello ruggine e alone al passaggio del mouse. Il valore sta in una targhetta `--sunken`
  in mono.
- **Pannello dello scenario**: tre gruppi (Terreno e mezzo · Percorso · Trasmissione) con
  occhiello mono e filetti di separazione; su desktop resta fisso mentre si scorre.
- **Card delle grandezze**: tre gruppi (Trazione · Potenze · Stabilità).
  - Ogni card: etichetta, valore grande con unità, formula MathML sotto un filetto
    tratteggiato.
  - Le formule lunghe occupano la riga intera.
  - La stabilità è un badge verde o rosso.
  - Su mobile ogni card è una riga (etichetta e valore affiancati, formula sotto).
- **Riepilogo mobile**: barra fissa in basso (sotto 980 px), visibile mentre il pannello dei
  cursori è in vista, con forza utile, potenza nominale e stabilità.
- **Nota**: fondo `--accent-soft` con icona informativa di linea sottile.
- **Teoria**: elenco numerato su due colonne; ogni voce ha la formula in un riquadro carta
  a 18 px.
- **Legenda dei simboli** (`#simboli`, in fondo alla Teoria): tutte le 28 lettere usate, in
  tre gruppi (Aderenza e resistenze · Potenze · Stabilità). Ogni riga ha simbolo MathML a
  19 px, significato e unità o valore del trattore in una targhetta mono. Dalla legenda sotto
  la simulazione c'è il collegamento "Tutti i simboli".
- **Notazione**: *r* è il raggio di curva, *r*<sub>p</sub> il raggio sotto carico delle ruote
  posteriori. Con α = arctan *i*: aderenza e rotolamento usano il peso perpendicolare al terreno
  *P* · cos α, la resistenza della pendenza la componente lungo il pendio *P* · sin α.
- **Footer**: logo, testo, pulsante "Torna su".

## 6. Movimento e accessibilità

- Curva di easing `--ease: cubic-bezier(.32,.72,0,1)`. Durate 160 ms (pressione),
  240 ms (stati), 420 ms (pannelli, schede, dissolvenze).
- Si animano solo `transform` e `opacity`; mai `transition: all`.
- Le testate di sezione compaiono salendo di 14 px (IntersectionObserver, una sola volta).
- Con `prefers-reduced-motion`: niente rotazione automatica né autoplay del motore,
  transizioni azzerate, testate già visibili, scorrimento istantaneo.
- Focus: anello di 2 px `--accent-ink` a 3 px di distanza; sui cursori è un alone attorno al
  pomello.
- Presente il link "Vai alla simulazione". `scroll-padding-top: 72px`, così la barra fissa
  non copre il punto di arrivo.
- Controlli: `touch-action: manipulation` e colore di tocco tenue. La scena della
  simulazione usa `pan-y`: trascinamento orizzontale per ruotare, verticale per scorrere.
- Immagini con `width`/`height`; hero con `fetchpriority="high"`, poster del motore con
  `loading="lazy"`.

## 7. Modelli 3D (Blender → glTF → three.js)

### Regole tecniche
- **Correttezza meccanica**: proporzioni reali in scala (1 unità Blender = 1 m),
  cinematica esatta, fasature plausibili. Stile pulito e semplificato, non fotorealistico.
- **Peso**: al massimo **2 MB per `.glb`** (3 MB per il trattore), obiettivo sotto 800 kB.
  Solo modelli low-poly (cilindri da 24–32 lati, smussi con 1–2 segmenti), shading flat o
  smooth con auto-smooth, **nessuna texture**, **nessuna compressione Draco** (servirebbe
  un decoder in più da tenere in locale).
- **Un oggetto per pezzo**, nome in italiano minuscolo con trattino basso (`pistone`,
  `biella`, `valvola_aspirazione`). Origine sul punto di rotazione o di articolazione del pezzo.
- Assi: Z in alto in Blender (diventa Y in glTF).
- File: sorgente in `models/sorgenti/<nome>.blend`, export in `models/<nome>.glb`,
  immagine di riserva in `models/<nome>-poster.webp`, copia base64 `models/<nome>.glb.js`
  per l'apertura come file.

### Materiali del motore (PBR semplice, roughness alta, metallic basso)

| Materiale | Colore | Metallic / roughness | Pezzi |
|---|---|---|---|
| `ghisa` | `#8C8577` | 0,1 / 0,85 | basamento, testata, collettori (nell'app anche semitrasparenti) |
| `acciaio` | `#C9C4B8` | 0,35 / 0,5 | albero motore, biella, spinotto, volano |
| `alluminio` | `#DCD6C8` | 0,25 / 0,45 | pistone |
| `distribuzione` | `#3E5C76` | 0,3 / 0,55 | albero a camme, punterie, aste, bilancieri, valvole, ingranaggi |
| `molle_fasce` | `#3A362E` | 0,2 / 0,6 | fasce elastiche, molle delle valvole, cappello della biella |
| `canna` | `#B7B0A0` | 0,3 / 0,4 | canna del cilindro |
| `iniettore` | `#C08A2E` | 0,3 / 0,5 | iniettore |
| `selezione` (solo nell'app) | `#A9581F` emissivo 0,45 | — | pezzo toccato o evidenziato |

Colori del gas nel cilindro (oggetto `gas_cilindro`, colorato dall'app in base alla fase):
aspirazione `#8FBFDE` · compressione `#3E5C76` · iniezione e scoppio `#E0521C` ·
scarico `#8C8577`.

### Visualizzatore del motore
- Dentro uno **strumento** (vedi §4), come la simulazione. Fondo del palco con alone
  radiale carta e luci calde.
- HUD: una sola pillola con la fase e l'angolo di manovella (`Compressione | 540°`).
- Barra comandi:
  - desktop: Play · Vista esplosa · Trasparenza · velocità 0,25× / 0,5× / 1× · Vista (icona);
  - mobile: su due righe, con Vista esplosa e Trasparenza a metà larghezza ciascuna.
- Toccando un pezzo: si evidenzia in `selezione`. Su desktop la scheda (occhiello mono,
  nome in Fraunces 22 px, funzione in Plex Sans 15 px) sta nel pannello laterale; sotto
  900 px compare anche come scheda sovrapposta in basso nella scena.
- Caricamento pigro: il bundle si scarica quando la sezione è a meno di 600 px dal
  viewport; il rendering si ferma quando la scena non è visibile.
- Durante il caricamento si vede il poster con una barra di avanzamento sottile in
  `--accent`. Se fallisce resta il poster, con un messaggio chiaro e il pulsante "Riprova".

## 8. Scena 3D della simulazione (trattore in campo)

- **Solo grafica.** Percorso (`pathAt()`), fasi, durata di 34 s, calcoli e tempi dei popup
  restano nello script di `index.html`. Lo script espone `window.__sim` in sola lettura e a
  ogni fotogramma chiama `__sim.scene3d.render(pos, dt, playing)`, che restituisce il punto
  a schermo del trattore.
- **Pannello delle formule** (ex popup). Stessi momenti e stesse durate di prima.
  - Su desktop: colonna fissa a destra nella scena (330 px, massimo 34% della larghezza).
  - Su mobile: scheda in basso.
  - Ogni scheda ha: fase (occhiello), titolo, formula simbolica, simbolo del risultato con
    valore grande.
  - Una linea tratteggiata sottile collega il trattore alla scheda visibile.
- **Il trattore resta libero.**
  - La camera usa `setViewOffset` per spostare l'inquadratura di metà pannello (desktop) o
    di circa il 16% dell'altezza (mobile), senza costi di calcolo.
  - Cipressi e casale che si trovano fra camera e trattore sfumano al 14% di opacità.
  - La distanza della camera cambia con la fase: 0,84× durante la lavorazione, 1,08–1,12×
    in salita e in curva.
- **Etichette delle forze**: pillola scura con pallino del colore della forza, lettera in
  Fraunces corsivo e pedice vero. Se due etichette si sovrappongono, la più bassa scende.
  La legenda delle quattro forze sta sotto la scena.
- **Velocità di riproduzione**: segmento 0,25× · 0,5× · 1× nella barra (1× = 34 s per giro).
  Rallenta anche la p.d.p. e allunga i popup nella stessa proporzione, così restano visibili
  per la stessa parte del giro.
- **Barra di riproduzione**: Play, fase corrente e tempo (`15,7 / 34 s`), cursore, binario delle
  5 fasi (Piano 28% · Salita 17% · Curva 17% · Presa di potenza 23% · Rientro 15%) con la fase
  attiva in ruggine; su mobile il binario resta senza nomi. "Trascina per ruotare" sparisce
  al primo trascinamento o dopo 6 s.
- **Riserva.** La versione SVG resta sempre nella pagina. Si vede durante il caricamento, senza
  WebGL e se la scena 3D fallisce; la tela three.js compare con una dissolvenza (`.is-3d`).
- **Scala.** 1 unità della simulazione = 4 cm. La salita è incernierata a 0,85 · `FLAT_LEN`, dove
  `pathAt()` comincia davvero a salire, e ruota di `atan(i/100)` con il cursore.
- **Camera.** Segue il trattore con smorzamento e usa gli stessi `az`/`el` dell'orbita SVG, quindi
  trascinamento, "Vista", rotazione automatica e movimento ridotto non cambiano. Distanza base
  15,5 m (21 m in verticale), campo visivo 32°.
- **Assetto.** Beccheggio e rollio sono ricavati dalla quota del terreno sotto assi e carreggiata.
- **Moto.** Ruote e cingoli rotolano in proporzione a v e coincidono con il moto a schermo a
  7,2 km/h. Differenziale e sterzo di Ackermann in curva; i cingoli sterzano per differenza di
  velocità. P.d.p. a 1,5 giri/s mostrati (540 giri/min rallentati), rotore della fresatrice × 0,4.
- **Frecce delle forze.** Cilindro + cono con `depthTest: false`, nel riferimento del trattore,
  lunghe `valore × 0,02` unità come in SVG. M è una freccia curva, oraria vista da dietro.
- **Suolo per tipo di terreno.** Terra battuta `#B49A74` · cotica `#8FA86E` · stoppie `#CDB985` ·
  letto di semina `#86694D` · bagnato `#6A5644` (roughness 0,55). Prato `#AFC495`, vite `#6E8F55`,
  cipressi `#2C4A2A`, casale `#E8DCC0` con tetto `#8B3F2B`.
- **Ombre.** Proietta ombre solo il trattore (mappa 1024 px che lo segue), così non ci sono ombre
  che compaiono e spariscono ai bordi.

### Materiali del trattore (`models/trattore.glb`)

| Materiale | Colore | Pezzi |
|---|---|---|
| `carrozzeria` | `#33513F` | cofano, parafanghi, serbatoio, parafanghi dei cingoli |
| `fusione` | `#4A4540` | telaio, cambio, ponti, fuselli, zavorre, ruote e rulli dei cingoli |
| `cerchi` | `#C08A2E` | cerchi, protezioni di p.d.p. e cardano |
| `gomma` | `#2A2621` | pneumatici, maglie dei cingoli |
| `nero` | `#1F1C18` | roll-bar, marmitta, griglia, cruscotto, volante, attacco a tre punti |
| `attrezzo` | `#A9581F` | telaio e cofano della fresatrice |
| `acciaio_lucido` | `#C9C4B8` | albero p.d.p., cardano, zappe del rotore |
| `fari` | `#FFE9A8` (emissivo) | fari anteriori e da lavoro |

Nodi di gruppo: `versione_ruote`, `versione_cingoli` (scelti dal selettore "Organo di contatto"),
`fresatrice`. Il percorso dell'anello dei cingoli è negli `extras` di `percorso_cingolo`
(`punti_yz`, `lunghezza`, `maglie`); l'app ripete `maglia_cingolo` con un InstancedMesh.

## 9. App installabile e offline (PWA)

- **Manifest** `manifest.webmanifest`: nome "Il trattore in campo", nome breve "Trattore",
  `display: standalone`, sfondo `#EEE8DA`, barra `#EEE8DA`. Icone in `assets/icons/`:
  sagoma del trattore crema `#F3EEE2` con mozzi ruggine `#C0692A` su verde `#233A2C`, da 48 a
  512 px, più due versioni "maskable" (contenuto nell'80% centrale), l'icona Apple da 180 px
  e le favicon da 16 e 32 px.
- **Service worker** `sw.js`: all'installazione mette in cache i 31 file del sito (2,6 MB).
  - Pagina, script e modelli: prima la rete, poi la cache (attesa massima 4 s se c'è già una
    copia). Ogni apertura con internet aggiorna da sola la cache.
  - Font e immagini: prima la cache, aggiornamento in secondo piano.
  - Cambiando `VERSIONE` in `sw.js` il browser installa il service worker nuovo, riscarica
    tutto e cancella le cache vecchie; la pagina si ricarica una volta da sola.
- **Non indicizzato**: `<meta name="robots" content="noindex, nofollow">` e, su Netlify,
  l'intestazione `X-Robots-Tag` in `_headers`. Nessun `robots.txt` che blocchi l'accesso,
  altrimenti i motori non leggerebbero il noindex.
- Il service worker non si registra aprendo la pagina come file (file://): in quel caso
  restano le copie `models/*.glb.js`.
