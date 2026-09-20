import type { JSX } from 'react'
import { useT } from './language'
import type { HofOffer } from '../../shared/api'

interface Props {
  /** De bus die de kaart niet kent, zoals hij in het menu heet. */
  bus: string
  aanbod: HofOffer
  bezig: boolean
  onJa: () => void
  onNee: () => void
}

/**
 * Het venstertje dat vraagt of we het wagenpark erbij mogen zetten.
 *
 * WAAROM EEN VENSTER EN GEEN KNOP ERGENS
 * Dit stond eerst als tweede knop op het merkenscherm, en daar vond niemand
 * hem -- ook niet wie ernaar zocht. Het moment waarop het ertoe doet is een
 * ander: je hebt een bus gekozen, je staat op de remisestap, en elke remise
 * zegt "0 van 2 bestemmingen". Dan is er iets mis, dan weet de app precies wat,
 * en dan hoort hij het te vragen in plaats van te wachten tot je het zelf vindt.
 *
 * Het venster zegt ook wat er gebeurt. Er wordt een bestand in de map van een
 * bus gezet -- in de spelmap van de gebruiker -- en dat mag nooit een verrassing
 * zijn.
 */
export function HofDialog({ bus, aanbod, bezig, onJa, onNee }: Props): JSX.Element {
  const tr = useT()
  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>{tr('hofvraag.title')}</h2>
        <p>{tr('hofvraag.body', { bus, known: aanbod.known, total: aanbod.total })}</p>
        <p>
          {tr('hofvraag.offer', {
            file: aanbod.offerFile ?? '',
            matched: aanbod.offerMatched ?? 0,
            total: aanbod.total
          })}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onNee} disabled={bezig}>
            {tr('hofvraag.no')}
          </button>
          <button type="button" className="btn" onClick={onJa} disabled={bezig}>
            {bezig ? tr('setup.hofBusy') : tr('hofvraag.yes')}
          </button>
        </div>
      </section>
    </div>
  )
}
