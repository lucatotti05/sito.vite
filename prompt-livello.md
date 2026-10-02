# Prompt di lavoro autonomo: portare "L'anno della vite" al livello Awwwards

Lavora da solo, senza fare domande, per tutto il tempo disponibile. Ogni decisione è tua, purché rispetti DESIGN.md (fonte unica delle decisioni visive). Se una regola di DESIGN.md impedisce un risultato chiaramente migliore, rispettala e annota la proposta nel resoconto finale.

## Obiettivo

Un sito che possa competere su Awwwards (riferimenti: jesperlandberg.com, lusion.co, activetheory.net, i "Site of the Day" editoriali). Tre criteri che valgono più di tutto:

1. **Ogni scritta si legge bene**, su ogni sfondo, a 1440 e a 390 px: contrasto almeno AA (4,5:1 per il testo corrente, 3:1 sopra i 24px), mai testo sopra il disegno senza un fondo che lo protegga, mai testo tagliato o sovrapposto ad altro testo.
2. **Niente di superfluo**: ogni elemento deve servire a capire la vite o a muoversi nel sito. Istruzioni ovvie, doppioni (la stessa informazione in due posti), decorazioni senza significato: via.
3. **Gli spazi sono occupati bene e funzionano**: composizione equilibrata, niente vuoti casuali né zone affollate, allineamenti su una griglia sola, margini coerenti tra angoli, titoli, nodo, calendario e barra.

## Metodo (ripeti a ogni giro)

1. Avvia il sito (`npx vite --port 5180`) e fotografa con Playwright (Chromium in /opt/pw-browsers) a 1440×900 e 390×844, a densità 2: Anno fermo, Anno in movimento, volo d'ingresso a metà, ogni fase che tocchi (almeno 1, 3 con il film, 6, 9, 10 con il finale), nodo con una pratica aperta, collana aperta, uscita, movimento ridotto.
2. Critica ogni screenshot come un direttore artistico: leggibilità, gerarchia, allineamenti, ritmo, densità, coerenza dei materiali, qualità del movimento. Scrivi i difetti in ordine di gravità.
3. Correggi i tre difetti più gravi. Verifica con nuovi screenshot. Non fidarti del codice: guarda le immagini.
4. `npx tsc -b`, `npx oxlint src`, `npx vite build` puliti. Commit con messaggio chiaro e push sul branch `claude/affectionate-gates-onzl0n`.
5. Ricomincia dal punto 1.

## Aree da coprire

- **Anno (arco)**: composizione verticale (niente fascia vuota sopra), dimensione e distanza dei pannelli, tavole montate leggibili, nome della fase, vigneto visibile ma discreto, apertura del sito, flessione e inerzia, hover, fuoco da tastiera, angoli.
- **Volo Anno ↔ Fase**: continuità del pannello, ritmo dell'ingresso dell'interfaccia (titolo, calendario, nodo, barra in sequenza, non tutto insieme), uscita pulita.
- **Fase**: titolo e introduzione sempre leggibili sopra la tavola, colonna dei testi libera, nodo (etichette leggibili, nessuna sovrapposizione, interazione inclinazione/orbita), calendario, barra delle fasi leggibile sopra il disegno, annotazioni (al massimo due), film della fase 3 con sottotitoli leggibili, collana, finale.
- **Mobile (390)**: stessi criteri; nessun testo sopra la pianta senza fondo; bersagli di almeno 44px.
- **Movimento**: solo token di DESIGN.md, interrompibile, motivato (gerarchia, racconto, risposta, cambio di stato). Niente animazioni per riempire.
- **Accessibilità**: contrasto, fuoco visibile, tastiera completa (arco, ingresso, uscita, nodo, collana), lettori di schermo, movimento ridotto, aree sicure.
- **Qualità**: niente errori in console, prestazioni (nessun lavoro pesante dentro un fotogramma di movimento), codice pulito e commentato come il resto del progetto.

## Vincoli

- DESIGN.md: palette, tipografia (Bodoni Moda e Instrument Sans), token di durata e curva, un solo oro per schermata, niente box arrotondati, glassmorphism, bagliori, gradienti decorativi, filtri animati su elementi grandi.
- Un solo canvas WebGL, un solo ciclo requestAnimationFrame.
- Non toccare i contenuti testuali delle fasi (fasi.json, pratiche.json) se non per togliere ciò che è superfluo nell'interfaccia.
- Se cambi la tavola o l'inquadratura, rigenera le anteprime (`npm run anteprime`, con il sito acceso sulla porta 5180).

## Resoconto finale

Cosa hai cambiato e perché (con gli screenshot prima/dopo in `verifica/spazio/`), cosa hai verificato e come, cosa resta da fare e cosa non hai potuto verificare (i 60 fps veri vanno provati su una macchina reale).
