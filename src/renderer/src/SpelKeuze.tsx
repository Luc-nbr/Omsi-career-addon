import type { JSX } from 'react'
import type { SpelStand, SpelVoorstel } from '../../shared/api'
import type { TextKey } from '../../shared/i18n'
import { useT } from './language'

/*
 * DE SPELKEUZE (keuze van Luc, 01-10; zie core/spelmotor.ts)
 *
 * De speler kiest zelf in welk spel hij rijdt: OMSI 2 of openOMSI. De app
 * wisselt nooit uit zichzelf; herkennen is alleen voor "welk spel draait nu".
 * Daarom staat de keuze op twee plekken: hier naast START, waar een dienst of
 * vrije rit begint, en onder Instellingen > App. Wie alleen OMSI 2 heeft,
 * ziet geen van beide: er valt niets te kiezen.
 */

type Motor = 'omsi' | 'openomsi'

const NAAM: Record<Motor, TextKey> = { omsi: 'oo.omsi', openomsi: 'oo.openomsi' }
const REDEN: Record<SpelVoorstel['reden'], TextKey> = {
  draait: 'oo.reden.draait',
  laatst: 'oo.reden.laatst',
  alleen: 'oo.reden.alleen',
  standaard: 'oo.reden.standaard'
}

/** Is er iets te kiezen? Alleen als openOMSI er staat (of gekozen is). */
export function spelTeKiezen(stand: SpelStand | undefined): boolean {
  return Boolean(stand && (stand.openomsi || stand.keuze === 'openomsi'))
}

/**
 * "Spel: OMSI 2 | openOMSI", naast START.
 *
 * Een klik kiest meteen (en bewaart het); er is geen derde stand
 * "automatisch". Nog niet gekozen: geen van beide staat aan, het voorstel
 * draagt een stip. Loopt er al een dienst, dan is het spel dat van de dienst en
 * valt er hier niets te wisselen.
 */
export function SpelSchakelaar({
  stand,
  bezig,
  onKies
}: {
  stand: SpelStand
  bezig?: boolean
  onKies: (motor: Motor) => void
}): JSX.Element {
  const tr = useT()
  const aan: Motor | undefined = stand.vanDienst ? stand.motor : stand.keuze
  const uitleg = stand.vanDienst
    ? tr('oo.vanDienst', { spel: tr(NAAM[stand.motor]) })
    : stand.kiezen
      ? tr('oo.nogNiet', { spel: tr(NAAM[stand.voorstel.motor]), reden: tr(REDEN[stand.voorstel.reden]) })
      : undefined
  return (
    <div className="spelschakelaar" role="radiogroup" aria-label={tr('oo.titel')} title={uitleg} data-spel={aan ?? ''}>
      <span className="spelschakelaar-kop">{tr('oo.titel')}</span>
      {(['omsi', 'openomsi'] as const).map((motor) => (
        <button
          key={motor}
          type="button"
          role="radio"
          aria-checked={aan === motor}
          data-motor={motor}
          data-voorstel={stand.kiezen && stand.voorstel.motor === motor ? 'ja' : undefined}
          disabled={bezig || stand.vanDienst}
          onClick={() => {
            if (aan !== motor) onKies(motor)
          }}
        >
          {tr(NAAM[motor])}
        </button>
      ))}
    </div>
  )
}

/**
 * De vraag bij de eerste START: openOMSI staat er en de speler koos nog niet.
 * Twee antwoorden, het voorstel bovenaan met de reden erbij; daarna gaat START
 * gewoon verder. Er start niets voordat er gekozen is.
 */
export function SpelDialog({
  voorstel,
  bezig,
  onKies,
  onTerug
}: {
  voorstel: SpelVoorstel
  bezig: boolean
  onKies: (motor: Motor) => void
  onTerug: () => void
}): JSX.Element {
  const tr = useT()
  const volgorde: Motor[] = voorstel.motor === 'openomsi' ? ['openomsi', 'omsi'] : ['omsi', 'openomsi']
  const uitleg: Record<Motor, TextKey> = { omsi: 'oo.kiesOmsi', openomsi: 'oo.kiesOpenomsi' }
  return (
    <div className="backdrop">
      <section className="dialog draait spelkeuze" role="dialog" aria-label={tr('oo.kiesTitel')}>
        <div className="glow" />
        <h2>{tr('oo.kiesTitel')}</h2>
        <p>{tr('oo.kiesUitleg')}</p>
        <div className="spelkeuze-keuzes" role="radiogroup" aria-label={tr('oo.titel')}>
          {volgorde.map((motor) => (
            <button
              key={motor}
              type="button"
              role="radio"
              className="animatie-keuze"
              data-motor={motor}
              aria-checked={motor === voorstel.motor}
              disabled={bezig}
              onClick={() => onKies(motor)}
            >
              <b>
                {tr(NAAM[motor])}
                {motor === voorstel.motor && (
                  <em className="spelkeuze-voorstel">
                    {' '}
                    · {tr('oo.voorgesteld')}, {tr(REDEN[voorstel.reden])}
                  </em>
                )}
              </b>
              <span>{tr(uitleg[motor])}</span>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onTerug} disabled={bezig}>
            {tr('oo.terug')}
          </button>
        </div>
      </section>
    </div>
  )
}

/** Waarom START niets begon, in de woorden van de speler; leeg als het wel kan. */
export function spelWeigering(
  tr: (key: TextKey, vars?: Record<string, string | number>) => string,
  stand: Pick<SpelStand, 'anderSpel' | 'nietGevonden'>
): string | undefined {
  if (stand.anderSpel) return tr('oo.anderSpel', { spel: tr(NAAM[stand.anderSpel]) })
  if (stand.nietGevonden) return tr('oo.nietGevondenStart')
  return undefined
}

export function spelNaam(motor: Motor): TextKey {
  return NAAM[motor]
}
