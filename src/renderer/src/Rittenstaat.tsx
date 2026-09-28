import type { JSX } from 'react'
import type { Rittenstaat } from '../../core/rittenstaat'
import { formatTime } from '../../shared/format'
import { useT } from './language'

/**
 * De rittenstaat van een gereden dienst: per halte gepland tegenover werkelijk
 * vertrek. Zie core/rittenstaat.ts voor hoe er gemeten wordt.
 *
 * Dichtgeklapt staat alleen de telling, want in het logboek wil je eerst zien
 * hoe het ging; open staat per rit elke halte. Kleur betekent wat ze overal in
 * de app betekent: blauw te vroeg, groen op tijd, rood te laat. Een geschatte
 * tijd krijgt geen kleur en geen oordeel -- dat is geen meting.
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
      <p className="rs-uitleg">
        {tr('rs.note', { early: staat.norm.vroegS, late: Math.round(staat.norm.laatS / 60) })}
      </p>
      {staat.ritten.map((rit, index) =>
        rit.haltes.some((halte) => halte.vertrek !== undefined) ? (
          <table key={index} className="rs-rit">
            <caption>{tr('rs.trip', { time: formatTime(rit.vertrek), line: rit.lijn, to: rit.naar })}</caption>
            <thead>
              <tr>
                <th>{tr('rs.stop')}</th>
                <th>{tr('rs.planned')}</th>
                <th>{tr('rs.left')}</th>
                <th>{tr('rs.diff')}</th>
              </tr>
            </thead>
            <tbody>
              {rit.haltes.map((halte, nr) => (
                <tr key={nr}>
                  <td>
                    {halte.naam}
                    {halte.doorgereden && <small> · {tr('rs.passed')}</small>}
                    {(halte.remmen ?? 0) > 0 && <small> · {tr('rs.brakes', { count: halte.remmen ?? 0 })}</small>}
                    {(halte.klappen ?? 0) > 0 && (
                      <small className="laat"> · {tr('rs.collisions', { count: halte.klappen ?? 0 })}</small>
                    )}
                  </td>
                  <td className={halte.vast ? '' : 'geschat'}>
                    {formatTime(halte.gepland)}
                    {!halte.vast && <small> {tr('rs.estimated')}</small>}
                  </td>
                  <td>{halte.vertrek !== undefined ? metSeconden(halte.vertrek) : '—'}</td>
                  <td className={`verschil ${halte.oordeel === 'goed' ? 'optijd' : halte.oordeel ?? 'geschat'}`}>
                    {halte.verschilS !== undefined ? verschil(halte.verschilS) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null
      )}
    </details>
  )
}

/** Een klok op de seconde; minuten na middernacht, over middernacht teruggezet. */
function metSeconden(minuten: number): string {
  const totaal = Math.round(minuten * 60)
  const dag = ((totaal % 86400) + 86400) % 86400
  const u = Math.floor(dag / 3600)
  const m = Math.floor((dag % 3600) / 60)
  const s = dag % 60
  return `${String(u).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Een verschil als −2:05 of +0:30; nul is gewoon 0:00. */
function verschil(seconden: number): string {
  const teken = seconden < 0 ? '−' : seconden > 0 ? '+' : ''
  const s = Math.abs(seconden)
  return `${teken}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
