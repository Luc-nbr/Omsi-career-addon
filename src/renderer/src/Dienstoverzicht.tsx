import type { JSX } from 'react'
import type { Duty } from '../../core/types'
import { formatDuration, formatTime } from '../../shared/format'
import { useLanguage, useT } from './language'

/**
 * Wat je in deze dienst gaat doen, rit voor rit.
 *
 * WAAROM DIT BESTAAT
 * De dienstenlijst zegt alleen wanneer je begint, wanneer je klaar bent en hoe
 * lang het duurt. Dat is genoeg om te kiezen tussen een ochtend en een avond,
 * maar niet om te weten wat je aanneemt: rijd je vier keer dezelfde lijn heen
 * en weer, of kruis je halverwege de stad naar een andere lijn? Luc: "ik mis
 * ook een functie waarbij je kan zien wat je in de aangeklikte dienst gaat
 * doen".
 *
 * Het staat onder de regel die je aanwijst en niet in een eigen venster: het
 * hoort bij die dienst, en je vergelijkt het met de regels eronder.
 *
 * Elke rit noemt zijn lijn, waar hij heen gaat en hoe laat hij vertrekt. Twee
 * dingen krijgen extra aandacht omdat ze je in het spel werk bezorgen: een
 * pauze op het eindpunt, en het moment waarop je in OMSI zelf een andere lijn
 * of omloop moet kiezen -- Set Time Table kent er maar een tegelijk.
 */
export function Dienstoverzicht({ duty }: { duty: Duty }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()

  return (
    <div className="dienstuitleg">
      <p className="dienstuitleg-kop">
        {tr('duty.overviewHead', {
          trips: duty.legs.length,
          stops: duty.totalStops,
          lines: duty.lineNumbers.length
        })}
      </p>

      <ol className="dienstuitleg-ritten">
        {duty.legs.map((leg, index) => (
          <li key={`${leg.tripFile}-${index}`}>
            {/* De pauze hoort vóór de rit waar hij bij hoort: dan lees je hem als wachten. */}
            {leg.layoverBefore > 0 && (
              <span className="dienstuitleg-pauze">
                {tr('duty.overviewBreak', { time: formatDuration(leg.layoverBefore, taal) })}
              </span>
            )}
            <span className="dienstuitleg-rit">
              <span className="dienstuitleg-tijd">{formatTime(leg.departure)}</span>
              <span className="dienstuitleg-lijn">{leg.lineNumber || '—'}</span>
              <span className="dienstuitleg-naar" title={leg.terminus}>
                {leg.terminus}
              </span>
              <span className="dienstuitleg-duur">{formatDuration(leg.minutes, taal)}</span>
            </span>
            {leg.switchInOmsi && (
              <span className="dienstuitleg-wissel">{tr('duty.overviewSwitch')}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
