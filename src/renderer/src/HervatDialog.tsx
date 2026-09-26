import type { JSX } from 'react'
import { useT } from './language'

interface Props {
  /** De lijn en de kaart van de dienst die openstond. */
  lijn: string
  kaart: string
  onHervatten: () => void
  onVerwijderen: () => void
}

/**
 * Er stond nog een dienst open. Verder rijden, of verwijderen?
 *
 * WAAROM DIT ER IS
 * De app kwam bij het openen vanzelf op de lopende dienst uit. Dat is handig als
 * je hem gisteren halverwege liet staan en vandaag verder wilt, en hinderlijk in
 * elk ander geval: je opende de app om iets op te zoeken en zat meteen in een
 * dienst die je niet ging rijden. De app hoort te vragen wat je komt doen in
 * plaats van het te raden.
 *
 * Eerst was het tweede antwoord "laat maar staan": de dienst bleef in je profiel
 * en de vraag kwam bij de volgende start terug. Luc: "dit moet worden, verder
 * rijden of verwijderen". Verwijderen doet hetzelfde als "dienst annuleren" op
 * het rijscherm -- de dienst gaat weg en er wordt niets geboekt -- en staat in
 * rood, want het is het enige in dit venster dat niet terug te draaien is. Geen
 * tweede vraag erachter: dit venster ís de vraag.
 */
export function HervatDialog({ lijn, kaart, onHervatten, onVerwijderen }: Props): JSX.Element {
  const tr = useT()
  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>{tr('hervat.title')}</h2>
        <p>{tr('hervat.body', { line: lijn, map: kaart })}</p>
        <div className="dialog-actions">
          <button type="button" className="btn danger" onClick={onVerwijderen}>
            {tr('hervat.delete')}
          </button>
          <button type="button" className="btn" onClick={onHervatten}>
            {tr('hervat.resume')}
          </button>
        </div>
      </section>
    </div>
  )
}
