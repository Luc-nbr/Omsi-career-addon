import type { JSX } from 'react'
import type { HalteStaat, Rittenstaat } from '../../core/rittenstaat'
import { formatTime } from '../../shared/format'
import { useT } from './language'

/**
 * De rittenstaat van een gereden dienst: per halte gepland tegenover werkelijk
 * vertrek. Zie core/rittenstaat.ts voor hoe er gemeten wordt.
 *
 * Dichtgeklapt staat alleen de telling, want in het logboek wil je eerst zien
 * hoe het ging; open staat per rit elke halte, als een lijn met stippen zoals
 * de dienst-app op de telefoon. Kleur betekent wat ze overal in de app
 * betekent: blauw te vroeg, groen op tijd, rood te laat. Een geschatte tijd
 * krijgt geen kleur en geen oordeel -- dat is geen meting.
 *
 * Tijden op de minuut. Luc: "de seconden mogen weg". Het oordeel zelf rekent
 * wel op de seconde (een halve minuut te vroeg is al te vroeg); alleen het
 * getal op het scherm is afgerond.
 */
export function RittenstaatVak({ staat }: { staat: Rittenstaat }): JSX.Element {
  const tr = useT()
  const goed = staat.vastGemeten - staat.teVroeg - staat.teLaat
  return (
    <details className="rittenstaat">
      <summary>
        <span>{tr('rs.title', { good: goed, fixed: staat.vastGemeten })}</span>
        {staat.teVroeg > 0 && <b className="vroeg">{tr('rs.early', { count: staat.teVroeg })}</b>}
        {staat.teLaat > 0 && <b className="laat">{tr('rs.late', { count: staat.teLaat })}</b>}
        {staat.voorlopig && <small>{tr('rs.provisional')}</small>}
      </summary>
      {staat.ritten.map((rit, index) =>
        rit.haltes.some((halte) => halte.vertrek !== undefined) ? (
          <div key={index} className="rs-rit">
            <p className="rs-kop">
              <b>{formatTime(rit.vertrek)}</b>
              <span>{tr('rs.trip', { line: rit.lijn, to: rit.naar })}</span>
            </p>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>{tr('rs.stop')}</th>
                  <th>{tr('rs.planned')}</th>
                  <th>{tr('rs.left')}</th>
                  <th>{tr('rs.diff')}</th>
                </tr>
              </thead>
              <tbody>
                {rit.haltes.map((halte, nr) => (
                  <tr key={nr} className={halte.vertrek === undefined ? 'ongemeten' : ''}>
                    <td className="rs-stip">
                      <i className={halte.oordeel === 'goed' ? 'optijd' : halte.oordeel ?? ''} />
                    </td>
                    <td className="rs-naam">
                      {halte.naam}
                      {(halte.doorgereden ||
                        (halte.remmen ?? 0) > 0 ||
                        (halte.klappen ?? 0) > 0 ||
                        (halte.wisselgeld ?? 0) > 0 ||
                        (halte.flitsen?.length ?? 0) > 0) && (
                        <small>
                          {[
                            halte.doorgereden ? tr('rs.passed') : '',
                            (halte.remmen ?? 0) > 0 ? tr('rs.brakes', { count: halte.remmen ?? 0 }) : '',
                            (halte.klappen ?? 0) > 0 ? tr('rs.collisions', { count: halte.klappen ?? 0 }) : '',
                            (halte.wisselgeld ?? 0) > 0 ? tr('rs.change', { count: halte.wisselgeld ?? 0 }) : '',
                            ...(halte.flitsen ?? []).map((f) => tr('rs.flashed', { kmh: f.kmh, limit: f.limiet }))
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                    </td>
                    <td className={halte.vast ? '' : 'geschat'}>
                      {formatTime(halte.gepland)}
                      {!halte.vast && <small>{tr('rs.estimated')}</small>}
                    </td>
                    <td>{halte.vertrek !== undefined ? formatTime(halte.vertrek) : '—'}</td>
                    <td>
                      <Verschil halte={halte} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null
      )}
    </details>
  )
}

/** Het verschil als label: "−2 min" in blauw, "op tijd" in groen, "+4 min" in rood. */
function Verschil({ halte }: { halte: HalteStaat }): JSX.Element | null {
  const tr = useT()
  if (halte.verschilS === undefined) return null
  const minuten = Math.round(halte.verschilS / 60)
  const tekst =
    halte.oordeel === 'goed' || minuten === 0
      ? tr('rs.onTime')
      : tr('rs.minutes', { n: `${minuten > 0 ? '+' : '−'}${Math.abs(minuten)}` })
  const soort = halte.oordeel === 'goed' ? 'optijd' : halte.oordeel ?? 'geschat'
  return <span className={`rs-label ${soort}`}>{tekst}</span>
}
