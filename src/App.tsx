import { ViteNelPalco } from '@/components/vite/ViteNelPalco'
import { Calendario } from '@/components/calendario/Calendario'
import { Contafotogrammi } from '@/components/Contafotogrammi'
import { Finale } from '@/components/Finale'
import { Indicatori } from '@/components/Indicatori'
import { Banco } from '@/components/collana/Banco'
import { CarteCollana } from '@/components/collana/CarteCollana'
import { NodoFase } from '@/components/nodo/NodoFase'
import { MomentiFilm } from '@/components/film/MomentoFilm'
import { Scorrimento } from '@/components/Scorrimento'
import { StrisciaFasi } from '@/components/StrisciaFasi'
import { Titoli } from '@/components/Titoli'
import { Angoli } from '@/components/Angoli'
import { Apertura } from '@/components/Apertura'
import { Guida } from '@/components/Guida'
import { Spazio } from '@/spazio/Spazio'

export default function App() {
  return (
    <>
      <a className="salta" href="#fasi">
        Vai all’elenco delle fasi
      </a>
      <main>
        <h1 className="sr-only">L’anno della vite</h1>
        <Scorrimento>
          <ViteNelPalco />
          <Spazio />
          <MomentiFilm />
          <div className="velo-ui" aria-hidden="true" />
          <Titoli />
          <CarteCollana />
          <NodoFase />
          <Indicatori />
          <Calendario />
          <Finale />
          <StrisciaFasi />
          <Angoli />
          <Guida />
          <Apertura />
        </Scorrimento>
      </main>
      <Banco />
      <Contafotogrammi />
    </>
  )
}
