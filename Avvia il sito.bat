@echo off
rem L'anno della vite: doppio clic per aggiornare e avviare il sito (Windows).
rem Scarica le ultime modifiche, installa i pacchetti la prima volta e apre il sito nel browser.
cd /d "%~dp0"
set RAMO=claude/affectionate-gates-onzl0n

where node >nul 2>nul
if errorlevel 1 (
  echo Serve Node.js: scarica la versione LTS da https://nodejs.org, installala e riprova.
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo Git non c'e': avvio la versione che c'e' nella cartella.
) else (
  echo Aggiorno il sito...
  git pull --ff-only origin %RAMO%
  if errorlevel 1 echo Non sono riuscito ad aggiornare: avvio la versione che c'e'.
)

rem public\esempi sul Mac e' un collegamento a ..\esempi: su Windows git lo scarica come file di
rem testo, quindi lo si sostituisce con un collegamento di Windows (giunzione, senza permessi speciali)
if not exist "public\esempi\" (
  if exist "public\esempi" del "public\esempi"
  mklink /J "public\esempi" "esempi" >nul
)

if not exist "node_modules\" (
  echo Installo i pacchetti, la prima volta ci vuole qualche minuto...
  call npm install
  if errorlevel 1 (
    echo npm install non e' riuscito.
    pause
    exit /b 1
  )
)

echo Avvio. Per fermare il sito chiudi questa finestra.
call npm run dev -- --port 5173 --open
pause
