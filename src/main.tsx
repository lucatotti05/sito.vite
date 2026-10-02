import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ?anteprima: la tavola da sola, per generare le anteprime dei pannelli (scripts/anteprime.mjs)
const Anteprima = lazy(() => import('./Anteprima.tsx').then((m) => ({ default: m.Anteprima })))
const anteprima = new URLSearchParams(location.search).has('anteprima')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {anteprima ? (
      <Suspense>
        <Anteprima />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
