# L'anno della vite — Design system

Questo documento è la fonte unica delle decisioni visive. Ogni modifica al sito deve rispettarlo. Se una richiesta lo contraddice, segnalalo prima di procedere invece di inventare valori nuovi.

## Principio

Una cantina di notte, una lanterna, una tavola scientifica e la realtà filmata. Poche cose, grandi, con molto spazio intorno. Tutto si muove con la stessa fisica; niente scatta, niente si muove senza motivo. L'utente deve avere l'impressione di toccare la materia, non di guardare una pagina.

Sottrarre prima di aggiungere: se un elemento non serve a capire la vite o a muoversi nel sito, si toglie.

## Spazio (riferimento: jesperlandberg.com)

Il sito non è una pagina ma uno spazio 3D, renderizzato in un unico canvas WebGL (three.js o OGL), con l'interfaccia HTML ridotta al minimo sopra.

- **Il vuoto.** Fondo `--nero` infinito. Nessuna decorazione nello spazio oltre al suolo e ai pannelli.
- **La luce delle stagioni.** Ogni fase ha la sua luce (`core/stagioni.ts`: inverno freddo, verde tenero di primavera, oro della fioritura, vino dell'invaiatura e della vendemmia, ambra dell'autunno). Illumina il foglio da dietro la pianta, si versa sul suolo davanti al pannello centrale e accende appena l'orizzonte: scorrendo l'arco la luce dello spazio cambia con l'anno. Intensità bassa (pochi punti percentuali), mai un colore pieno.
- **Il suolo è il vigneto.** Un piano orizzontale in prospettiva con linee sottili che sono i filari e i loro pali, che si perdono verso l'orizzonte. Linee di 1px in `--avorio` a opacità bassa (circa 12%), che sfumano nel buio con la distanza. Il suolo si muove con la camera ed è l'unico elemento che dà la scala dello spazio.
- **Le fasi sono pannelli curvi.** Dieci pannelli, uno per fase, disposti lungo un arco davanti alla camera. Ogni pannello è un piano suddiviso in molti segmenti, incurvato nel vertex shader come un foglio o uno schermo piegato. Dentro c'è la tavola o la clip della fase, viva anche da lontano (in versione ridotta). In basso a sinistra, nel pannello, il nome della fase; in basso a destra, sulla stessa riga, un cerchio di 1px con un + che si riempie sotto il cursore. Il foglio ha angoli appena smussati (10px a schermo, 8px sul telefono), un filo di luce sul bordo e una luce radente satinata che scorre sulla curva quando l'arco gira; il suolo lucido ne riflette appena il piede. Tutto questo si spegne mentre il pannello entra: a volo finito è identico alla fase.
- **Fisica dei pannelli.** Lo scroll orizzontale (o il trascinamento) fa scorrere l'arco. Durante il movimento i pannelli si flettono di più in proporzione alla velocità e tornano alla curvatura di riposo con una molla. Il pannello centrale è leggermente più vicino e più luminoso.
- **Due livelli.** *Anno*: la vista d'insieme, con l'arco dei pannelli sopra il vigneto. *Fase*: al clic sul pannello (o continuando a scorrere verso di lui) la camera vola dentro, il pannello si spiana e riempie lo schermo e si entra nell'esperienza della fase (film guidato dallo scroll, nodo orbitale, collana). Uscendo, il movimento inverso riporta il pannello nell'arco. Il volo tra i livelli dura `--d-volo` con `--ease-volo` ed è interrompibile (un volo interrotto torna indietro dal punto in cui è, con `--ease-out`). A volo finito il pannello si dissolve in `--d-ui` sulla fase vera, già dipinta sotto: nessuno scatto al passaggio di mano.
- **Comandi.** L'asse orizzontale è il tempo, quello verticale la profondità. Nell'Anno lo scroll orizzontale, il trascinamento e le frecce ← → fanno scorrere l'arco, che a riposo si posa sul pannello più vicino; la rotella in giù è una spinta verso il pannello centrale (la camera si avvicina con resistenza e, oltre la soglia, entra), come il clic, Invio o ↓. Nella Fase lo scroll verticale fa avanzare la fase; la spinta oltre l'inizio riporta all'Anno, oltre la fine riporta all'Anno con la fase successiva al centro; Esc e la voce "Anno" escono sempre. La spinta torna a zero con la molla appena l'input si ferma.
- **Arco.** La camera sta tra il centro dell'arco e i pannelli: il centrale è il più vicino, i laterali si voltano e si allontanano. Pannelli 3:4 a riposo, che si spianano e prendono le proporzioni dello schermo entrando. Sul telefono un pannello alla volta, con i vicini che si affacciano ai lati.
- **Interfaccia agli angoli.** Solo quattro voci, una per angolo, in Inter Tight 12px maiuscolo con tracking +0.04em (unica eccezione alla regola sul maiuscolo): in alto a sinistra "L'anno della vite", in alto a destra la voce del calendario (mese corrente), in basso a sinistra "Anno / Fase" con quella attiva in `--avorio` e l'altra in `--avorio-60`, in basso a destra "Collana". Margini agli angoli: `max(24px, 5vw)`.

## Colore

| Token | Valore | Uso |
|---|---|---|
| `--nero` | `#120d0a` | Fondo di tutto il sito. Unico nero ammesso. |
| `--terra` | `#1e1611` | Superfici in rilievo (pagina del calendario, pannelli). |
| `--avorio` | `#ede4d3` | Testo principale e linee della tavola incisa. |
| `--avorio-85` | `rgb(237 228 211 / .85)` | Testo corrente. |
| `--avorio-60` | `rgb(237 228 211 / .60)` | Etichette, testi secondari. |
| `--avorio-20` | `rgb(237 228 211 / .20)` | Filetti, divisori. |
| `--oro` | `#c9a45c` | Accento. Al massimo un elemento in oro per schermata. |
| `--vinaccia` | `#6e1f2b` | Accento per invaiatura, maturazione, vendemmia. |
| `--verde` | `#9cbf5a` | Accento per germogli e foglie giovani. Mai come colore d'interfaccia. |
| `--ambra` | `#c98a3c` | Accento per l'autunno e per la luce della lanterna. |

Il colore pieno compare solo come accento con un significato botanico. L'interfaccia è avorio su nero.

## Tipografia

Due famiglie, con ruoli distinti:

- **Fraunces** (display, variabile con optical size): titoli, introduzioni, numeri, annotazioni. Un serif morbido e calligrafico, caldo come la carta e il legno.
- **Inter Tight** (testo): testo corrente, etichette, interfaccia.

| Stile | Famiglia | Dimensione | Interlinea | Tracking | Peso |
|---|---|---|---|---|---|
| `titolo-fase` | Fraunces | `clamp(64px, 7.5vw, 132px)` | 0.92 | −0.02em | 400 |
| `titolo-sezione` | Fraunces | `clamp(36px, 3.6vw, 60px)` | 1.0 | −0.01em | 400 |
| `introduzione` | Fraunces corsivo | `clamp(20px, 1.6vw, 26px)` | 1.35 | 0 | 400 |
| `testo` | Inter Tight | 17px | 1.6 | 0 | 400 |
| `etichetta` | Inter Tight | 13px | 1.4 | +0.02em | 500 |
| `annotazione` | Fraunces corsivo | 16px | 1.3 | 0 | 400 |
| `mese` | Fraunces corsivo | 56px | 1.0 | −0.01em | 400 |

Regole:

- Al massimo quattro stili visibili nella stessa schermata.
- Fraunces sempre con optical size automatico (`font-optical-sizing: auto`).
- Numeri nel testo in stile old-style (`font-variant-numeric: oldstyle-nums`).
- Righe di testo tra 40 e 65 caratteri; introduzioni al massimo 42.
- Niente maiuscolo per etichette o titoletti (unica eccezione: le quattro voci agli angoli, vedi "Spazio").
- Niente etichette sopra i titoli ("Fase 03", "Pratiche del periodo"): l'informazione va nel calendario o nel contesto.
- Niente stringhe di metadati separate da punti mediani ("aprile · BBCH 07 · fase 3").
- Niente singola parola evidenziata in corsivo o in colore dentro un titolo.

## Spazio e impaginazione

- Unità base 8px. Scala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192.
- Margini laterali: `max(24px, 6vw)`. Margine superiore: `8vh`. Nessun testo a meno di 24px dal bordo.
- Griglia a 12 colonne, gutter 24px. Tutti i testi delle fasi partono dalla stessa colonna.
- **Griglia verticale della fase, uguale in tutte le fasi.** Il titolo sta in una fascia alta due righe e poggia sul suo fondo: l'ultima riga di ogni titolo cade sulla stessa linea. Un titolo che non sta in due righe si riduce (a passi del 4%) finché ci sta. L'introduzione parte sempre dallo stesso punto, in una fascia di tre righe. Il nodo prende solo lo spazio che resta sotto (mai sopra i testi). Il corpo del titolo segue la larghezza ma anche l'altezza della finestra (al più 11% dell'altezza).
- **Nessun testo sopra un altro testo**, a nessuna misura di finestra e in nessun momento della fase: lo verifica `scripts/sovrapposizioni.mjs`. Le etichette del nodo si separano da sole e restano dentro il disegno.
- Densità: in ogni momento sono visibili al massimo il titolo con una riga d'introduzione, la vite (o il film) e un solo elemento interattivo aperto (nodo orbitale oppure collana).
- Annotazioni sulla vite: al massimo due visibili insieme.

## Superfici e materia

- Niente box arrotondati nell'interfaccia, niente glassmorphism, niente gradienti decorativi. L'unica luce colorata è quella delle stagioni (pannelli, suolo, orizzonte, cuore del nodo), bassa e con un significato.
- Raggio degli angoli: 0. Eccezioni: i pannelli dell'arco (10px, 8px sul telefono), la finestra dell'apertura (da 14px a 0) e la pagina del calendario (2px), come la carta.
- Un'unica ombra, per gli oggetti di carta: `0 30px 60px -30px rgb(0 0 0 / .8)`.
- Grana fine e costante su tutto il sito (opacità circa 6%), identica sulla tavola e sul film.
- Linee: 1px in `--avorio-20` per i filetti, 1px in `--oro` al 60% per le linee delle annotazioni.

## Movimento

| Token | Valore | Uso |
|---|---|---|
| `--d-micro` | 160ms | Stati di passaggio del cursore, piccoli feedback. |
| `--d-ui` | 280ms | Apertura e chiusura di pannelli, etichette. |
| `--d-entrata` | 450ms | Entrata dei titoli e delle carte, sfoglio del calendario. |
| `--d-scena` | 700ms | Passaggi di scena non guidati dallo scroll. |
| `--d-volo` | 1150ms | Il volo della camera tra Anno e Fase (il salto di scala più grande del sito). |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | Entrate: arrivo morbido. |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Movimenti da A a B. |
| `--ease-in` | `cubic-bezier(.7, 0, .84, 0)` | Uscite. |
| `--ease-volo` | `cubic-bezier(.5, 0, .18, 1)` | Il volo: parte piano, attraversa lo spazio, si posa lentissimo. |

- Molle (nodo orbitale, rotazioni): rigidità 170, smorzamento 22, massa 1. Sempre interrompibili: un nuovo input riparte dalla posizione e velocità attuali.
- Scroll: Lenis con interpolazione 0.1, sincronizzato con GSAP ScrollTrigger.
- Lanterna e reazioni al cursore: interpolazione 0.1 per fotogramma.
- Tutto ciò che dipende dallo scroll è guidato dalla posizione, non dal tempo, ed è reversibile.
- Si animano solo `transform`, `opacity` e uniform degli shader. Mai proprietà di layout.
- Un unico ciclo `requestAnimationFrame` per tutto il sito, che si ferma quando non c'è scroll, puntatore o animazione in corso e riparte al primo input.
- Niente filtri SVG (`feDropShadow`, `filter="url(#…)"`) né filtri CSS (`blur()`, `brightness()`) animati su elementi grandi: ombre e controluce sono tracciati già disegnati; il fuori fuoco è un'immagine pre-sfocata in dissolvenza con quella nitida.
- I tratteggi della tavola incisa si realizzano con pattern, simboli riusati o su canvas, non con migliaia di linee SVG.
- Niente `mix-blend-mode` su livelli a tutto schermo: colori e opacità equivalenti, o aree piccole.
- React non si aggiorna a ogni fotogramma: i valori continui (progresso, posizioni, angoli) si scrivono direttamente su transform, opacity o variabili CSS dell'elemento che li usa.
- Con `prefers-reduced-motion`: dissolvenze semplici, niente parallasse, niente deformazioni, niente lanterna.
- **Micro-interazioni.** Ogni gesto ha una risposta che appartiene al mondo del sito, in `--d-micro`/`--d-ui`: le voci rotolano come caratteri da tipografia (le lettere salgono, le stesse arrivano da sotto, 14ms tra l'una e l'altra); la voce attiva di "Anno / Fase" ha un filetto di 1px che scorre all'altra in `--d-scena`; i link testuali ritirano e ridisegnano la sottolineatura; alla pressione il testo scende di 1px. Nell'arco il pannello sotto il cursore si fa avanti, la tavola si sposta appena sotto il vetro e sotto il nome si traccia un filetto; alla pressione il foglio cede; ogni clic ravviva la lanterna. A riposo i pannelli respirano (pochi millimetri, sfasati).
- **Apertura.** Un anno in otto secondi. Nel buio si apre dal basso una finestra 3:4 al centro (la misura dei pannelli, angoli di 14px): dentro scorre l'anno filmato (gemma, fiore, invaiatura, foglie d'autunno, `public/intro/anno.mp4`) e sotto il mese corre su un filo d'oro che si riempie. Con le foglie d'autunno la finestra si allarga a tutto schermo in `--d-volo` con `--ease-volo` (il film resta fermo sotto, come dietro un vetro che cresce) ed entra in basso a sinistra il nome del sito su due righe, con l'introduzione. Quando le prime tavole sono pronte il film si stringe nel pannello centrale dell'arco mentre la camera arriva e i pannelli salgono intorno, e si dissolve in lui; il nome vola nell'angolo in alto a sinistra e diventa la voce. Qualsiasi input porta subito all'uscita; non c'è entrando in una fase; con movimento ridotto: fotogramma fermo, nome e dissolvenza.

## Componenti

**Titolo di fase.** Stile `titolo-fase`, allineato alla colonna dei testi. Entra con una rivelazione a maschera, riga per riga, `--d-entrata` con `--ease-out`, ritardo di 60ms tra le righe. Esce con `--ease-in` in `--d-ui`. Il vecchio titolo esce del tutto prima che entri il nuovo.

**Calendario (pagina d'almanacco).** Circa 220×300px su desktop, 120×164px su mobile. Pagina di carta scura (`--terra`) con texture leggera, appesa a un'asola. Contiene solo tipografia: numero romano del mese, nome del mese in stile `mese`, un filetto, nome della fase e sigla BBCH in stile `etichetta`. Niente icone, niente nastri. Al passaggio della soglia del mese la pagina si gira in 3D in `--d-entrata` con `--ease-in-out`, con un'ombra che scorre sul foglio sotto. Lo sfoglio è interrompibile e reversibile.

**Nodo orbitale.** Un sistema in orbita attorno alla fase. Al centro il cuore: l'organo della fase (gemma, goccia, gemma che si apre, foglia, antera, acino, stazione del percorso, foglia secca) in un disco scuro, dentro un alone della luce della stagione che respira, con due onde lente che ne escono. Attorno, su un piano inclinato di 54°, l'orbita delle pratiche (la metà lontana tratteggiata, quella vicina piena, 1px) e il quadrante dell'anno: dodici tacche, quelle dei mesi della fase accese nella luce della stagione. Le pratiche sono dischi con l'organo della fase e un'ombra morbida sotto; quelle lontane più piccole e più spente. Etichette in stile `etichetta`, fuori dall'orbita dalla parte del loro lato. Scorrendo la fase l'orbita gira (guidata dalla posizione). Al clic il piano si inclina a 75° e scende sotto la scheda, l'orbita ruota con la molla finché la pratica scelta arriva davanti: si ingrandisce, le collegate si accendono e un filo le unisce passando vicino al cuore, le altre arretrano, si sfocano e perdono l'etichetta. Dettaglio della pratica in un pannello senza bordo, con filetto verticale in `--vinaccia`.

**Annotazioni.** Stile `annotazione`, punto di 3px e linea di 1px in oro al 60%. Compaiono come se venissero scritte (tracciato della linea, poi il testo) in `--d-entrata`.

**Lanterna.** Luce calda (`--ambra` schiarito, circa `#e8c58a`), raggio circa 260px, intensità bassa, in modalità `screen` o `soft-light`. Sta tra la scena e l'interfaccia, mai sopra i testi. Vicino a un organo della vite ne rivela l'annotazione. Assente su touch e con movimento ridotto.

**Barra delle fasi.** Solo nel livello Fase (nel livello Anno la posizione è data dall'arco dei pannelli). Una sola riga sottile in fondo: numeri delle fasi in stile `etichetta`, la fase corrente in `--avorio`, le altre in `--avorio-60`. Indicatore di posizione: una linea di 1px in `--oro`.

**Carte della collana.** Ogni tipo ha una forma riconoscibile (gioco, simulazione, scheda), nessuna è un rettangolo arrotondato generico. Le carte "in arrivo" sono incisioni incomplete dell'argomento, non scatole vuote.

## Vite: tavola incisa

- Linee in `--avorio` (legno, foglie, grappoli) di spessore tra 0.75 e 1.5px, tratteggi paralleli per dare volume. Niente riempimenti piatti.
- Il colore compare solo come accento con trasparenza e tratteggio: `--verde` per germogli e foglie giovani, `--vinaccia` per gli acini dall'invaiatura, `--ambra` per le foglie d'autunno.
- Foglie pentalobate con nervature; grappoli fatti di acini con contorno e un punto di luce.

## Film

- Le clip sono texture in un canvas WebGL, con grana e vignettatura nello shader, uguali al resto del sito.
- Il nero della clip coincide con `--nero`; i bordi sfumano nel fondo: nessun rettangolo visibile.
- Il passaggio tavola ↔ film avviene quando il soggetto disegnato e quello filmato coincidono per posizione e dimensione: lì si apre un **portale**, una forma organica che respira e diventa cerchio mentre cresce fino a coprire lo schermo, con un filo di luce calda sul bordo (la luce della clip) e la clip che si piega appena dietro il bordo come dietro una lente. All'uscita si richiude sul soggetto. Fuori dal portale la tavola resta nitida e si scurisce appena: nessuna immagine sfocata.

## Controllo prima di consegnare

- [ ] Nessun testo a meno di 24px dal bordo; massimo quattro stili tipografici per schermata.
- [ ] Al massimo un elemento in oro per schermata.
- [ ] Nessun box arrotondato, glassmorphism, bagliore, icona generica o etichetta in maiuscolo.
- [ ] Al massimo un elemento interattivo aperto e due annotazioni visibili.
- [ ] Tutte le transizioni usano i token di durata e curva; tutte sono interrompibili.
- [ ] 60 fps su un portatile medio con l'indicatore FPS; nessuno scatto nello scroll veloce.
- [ ] Verificato a 1440px e 390px, e con movimento ridotto.
