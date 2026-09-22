import type { JSX } from 'react'
import { useT } from './language'

interface Props {
  /** De kaart van de dienst die je wilt gaan rijden. */
  kaart: string
  bezig: boolean
  /** Instappen in het spel zoals het draait; niets klaarzetten. */
  onMeerijden: () => void
  /** Toch klaarzetten, voor de volgende keer dat OMSI opstart. */
  onKlaarzetten: () => void
  onTerug: () => void
}

/**
 * OMSI draait al. Wat wil je dat de app doet?
 *
 * WAAROM DIT ER IS
 * De app zet een dienst klaar in het startscherm van OMSI -- kaart, situatie,
 * dienstregeling, bus bij de halte -- en start daarna het spel. Dat werkt alleen
 * bij het opstarten: OMSI leest dat scherm één keer en daarna nooit meer. Wie de
 * app opende terwijl hij al in de bus zat, kreeg dus een situatie klaargezet die
 * hij pas de volgende keer zou zien, plus achteraf de mededeling dat hij het
 * spel maar opnieuw moest starten. Dat is geen keuze, dat is een doodlopende weg
 * met een bordje erbij.
 *
 * Nu is het een vraag met twee antwoorden die allebei ergens toe leiden. En het
 * is een vraag vooraf en geen mededeling achteraf: als je het spel toch opnieuw
 * gaat starten, wil je dat weten voordat de dienst in je loopbaan staat.
 *
 * WAAROM DE APP OMSI NIET AFSLUIT
 * Dat is jouw spel, met een rit erin die misschien nog loopt. De app sluit geen
 * programma's van de gebruiker af -- ook niet als het handig zou uitkomen.
 */
export function DraaitDialog({
  kaart,
  bezig,
  onMeerijden,
  onKlaarzetten,
  onTerug
}: Props): JSX.Element {
  const tr = useT()
  return (
    <div className="backdrop">
      <section className="dialog draait">
        <div className="glow" />
        <h2>{tr('draait.title')}</h2>
        <p>{tr('draait.body', { map: kaart })}</p>

        <ul className="draait-keuzes">
          <li>
            <b>{tr('draait.rideName')}</b>
            <span>{tr('draait.rideWhat')}</span>
          </li>
          <li>
            <b>{tr('draait.prepName')}</b>
            <span>{tr('draait.prepWhat')}</span>
          </li>
        </ul>

        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onTerug} disabled={bezig}>
            {tr('draait.back')}
          </button>
          <button type="button" className="btn ghost" onClick={onKlaarzetten} disabled={bezig}>
            {tr('draait.prep')}
          </button>
          <button type="button" className="btn" onClick={onMeerijden} disabled={bezig}>
            {tr('draait.ride')}
          </button>
        </div>
      </section>
    </div>
  )
}
