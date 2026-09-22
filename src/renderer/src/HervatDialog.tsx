import type { JSX } from 'react'
import { useT } from './language'

interface Props {
  /** De lijn en de kaart van de dienst die openstond. */
  lijn: string
  kaart: string
  onHervatten: () => void
  onVerlaten: () => void
}

/**
 * Er stond nog een dienst open. Verder rijden, of laten staan?
 *
 * WAAROM DIT ER IS
 * De app kwam bij het openen vanzelf op de lopende dienst uit. Dat is handig als
 * je hem gisteren halverwege liet staan en vandaag verder wilt, en hinderlijk in
 * elk ander geval: je opende de app om iets op te zoeken en zat meteen in een
 * dienst die je niet ging rijden. De app hoort te vragen wat je komt doen in
 * plaats van het te raden.
 *
 * Het antwoord "verlaten" laat de dienst gewoon staan. Hij blijft in je profiel,
 * de tegel in het hoofdmenu zegt nog steeds "verder rijden", en je kunt er later
 * alsnog heen. Afbreken is iets anders en zit waar het hoort: op het rijscherm,
 * onder "dienst annuleren".
 */
export function HervatDialog({ lijn, kaart, onHervatten, onVerlaten }: Props): JSX.Element {
  const tr = useT()
  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>{tr('hervat.title')}</h2>
        <p>{tr('hervat.body', { line: lijn, map: kaart })}</p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onVerlaten}>
            {tr('hervat.leave')}
          </button>
          <button type="button" className="btn" onClick={onHervatten}>
            {tr('hervat.resume')}
          </button>
        </div>
      </section>
    </div>
  )
}
