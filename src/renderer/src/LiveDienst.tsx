import { useEffect, useRef, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { LiveStatus } from '../../core/live'
import type { Duty } from '../../core/types'
import { formatTime } from '../../shared/format'
import { punctuality } from '../../shared/status'
import { useT } from './language'

interface Props {
  duty: Duty
  ibis?: IbisPlan
  status?: LiveStatus
}

/**
 * De dienstregeling die meeloopt.
 *
 * WAAROM DIT NAAST DE OVERLAY BESTAAT
 * De overlay hangt over het spel en is daarom klein: hij toont de volgende
 * halte, de vertraging en een kaartje, en verder niets -- alles wat je nodig
 * hebt terwijl je stuurt. Maar op een tweede scherm is er plaats voor de hele
 * dienst tegelijk, en dat is een ander soort kijken: niet "wat komt er nu",
 * maar "hoe staat de dag ervoor".
 *
 * Dus: alle ritten onder elkaar, de rit die loopt uitgeklapt met elke halte en
 * zijn tijd erbij, en de halte waar je bent gemarkeerd. Kleur betekent hier
 * hetzelfde als overal in deze app: alleen tijd. Groen op tijd, rood te laat,
 * blauw te vroeg, met de grens uit `src/shared/status.ts`.
 */
export function LiveDienst({ duty, ibis, status }: Props): JSX.Element {
  const tr = useT()
  const nuRef = useRef<HTMLDivElement | null>(null)

  const legIndex = status?.legIndex ?? -1
  const stopIndex = status?.stopIndex
  const stand = punctuality(status?.deltaSeconds)
  const klasse = stand === 'laat' ? 'late' : stand === 'vroeg' ? 'early' : 'ontime'
  const minuten = Math.round(status?.delayMinutes ?? 0)

  /*
   * De rit die loopt in beeld houden. Een dienst van acht ritten past niet op
   * een scherm, en wie halverwege de dag kijkt hoort niet te hoeven scrollen
   * naar waar hij is.
   */
  useEffect(() => {
    /*
     * `nearest` en niet `center`: met `center` schoof het hele vel mee omhoog
     * en verdwenen de tegels met de klok en de vertraging boven het scherm.
     * Zo blijft de beweging binnen de lijst waar hij hoort.
     */
    nuRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [legIndex])

  return (
    <div className="live">
      <div className="live-kop">
        <div className="live-tegel breed">
          <b className={status ? klasse : undefined}>
            {status ? formatTime(status.clockMinutes) : '--:--'}
          </b>
          <span>{tr('live.clock')}</span>
        </div>
        <div className="live-tegel">
          <b className={status ? klasse : undefined}>
            {status ? `${minuten > 0 ? '+' : ''}${minuten}` : '—'}
            <small>min</small>
          </b>
          <span>{tr('live.delay')}</span>
        </div>
        <div className="live-tegel">
          <b>{status?.passengers ?? '—'}</b>
          <span>{tr('live.onboard')}</span>
        </div>
        <div className="live-tegel">
          <b>
            {status ? Math.max(0, Math.round(status.speedKmh)) : '—'}
            <small>km/u</small>
          </b>
          <span>{tr('live.speed')}</span>
        </div>
      </div>

      <div className="live-ritten">
        {duty.legs.map((leg, index) => {
          const nu = index === legIndex
          const gehad = legIndex >= 0 && index < legIndex
          const entry = ibis?.legs[index]
          return (
            <div
              key={`${leg.tripFile}-${index}`}
              className={`live-rit ${nu ? 'nu' : ''} ${gehad ? 'gehad' : ''}`}
              ref={nu ? nuRef : undefined}
            >
              <div className="live-ritkop">
                <span className="live-tijd">{formatTime(leg.departure)}</span>
                <span className="live-naar">
                  <b>{leg.terminus}</b>
                  <small>
                    {tr('live.line', { line: leg.lineNumber })}
                    {entry?.route ? ` · ${tr('live.route', { route: entry.route })}` : ''}
                  </small>
                </span>
                <span className="live-tijd">{formatTime(leg.arrival)}</span>
              </div>

              {leg.layoverBefore > 0 && (
                <span className="live-pauze">
                  {tr('live.layover', { minutes: leg.layoverBefore })}
                </span>
              )}

              {/*
                Alleen de rit die loopt klapt open. De rest is een regel; wie de
                haltes van rit zes wil zien kijkt op de dienstkaart, en tijdens
                het rijden is alles tegelijk uitklappen een muur.
              */}
              {nu && (
                <ol className="live-haltes">
                  {leg.stops.map((naam, n) => {
                    const gepasseerd = stopIndex !== undefined && n < stopIndex
                    const hier = stopIndex === n
                    return (
                      <li
                        key={`${naam}-${n}`}
                        className={`live-halte ${hier ? 'hier' : ''} ${gepasseerd ? 'gehad' : ''}`}
                      >
                        <i aria-hidden="true" />
                        <span className="live-haltetijd">{formatTime(leg.stopTimes[n])}</span>
                        <span className="live-haltenaam">{naam}</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
