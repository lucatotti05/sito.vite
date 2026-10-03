#!/bin/bash
# L'anno della vite: doppio clic per aggiornare e avviare il sito (Mac).
# Scarica le ultime modifiche, installa i pacchetti solo se sono cambiati, chiude un eventuale
# server rimasto aperto e apre il sito nel browser.
cd "$(dirname "$0")" || exit 1
RAMO="claude/affectionate-gates-onzl0n"

echo "→ Aggiorno il sito…"
if ! git pull --ff-only origin "$RAMO"; then
  echo "⚠︎ Non sono riuscito ad aggiornare (modifiche locali o rete): avvio la versione che c'è."
fi

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "→ Installo i pacchetti…"
  npm install || { echo "⚠︎ npm install non è riuscito"; read -r -p "Premi Invio per chiudere"; exit 1; }
fi

# un server vecchio ancora aperto terrebbe i pacchetti di prima
lsof -ti tcp:5173 | xargs kill 2>/dev/null

echo "→ Avvio. Per fermare il sito chiudi questa finestra (o Ctrl+C)."
npm run dev -- --port 5173 --open
