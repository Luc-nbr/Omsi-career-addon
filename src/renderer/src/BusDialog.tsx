import type { JSX } from 'react'
import { useT } from './language'

interface Props {
  /** De bus die de app zou nemen, zoals hij in het menu heet. */
  bus: string
  /** Welk deel van de eindbestemmingen die bus kent, 0 tot 1. */
  fit?: number
  /** Het wagenpark waarmee hij deze dienst kan rijden. */
  yard?: string
  onDoorgaan: () => void
  onZelf: () => void
}

/**
 * De vraag bij het binnenkomen op de busstap.
 *
 * De app heeft al een bus gekozen -- die past het best bij de eindbestemmingen
 * van deze dienst -- en meestal is dat precies wat je wilt. Maar het menu telt
 * honderden uitvoeringen in drie lagen, en wie daar binnenkomt zonder te weten
 * dat er al iets klaarstaat gaat zoeken naar iets wat er al is.
 *
 * Dus: zeggen wat de app zou doen, en de keuze laten. Niet forceren -- wie zelf
 * wil kiezen klikt dat weg en heeft het hele menu -- maar ook niet verzwijgen.
 */
export function BusDialog({ bus, fit, yard, onDoorgaan, onZelf }: Props): JSX.Element {
  const tr = useT()
  const deel = fit === undefined ? undefined : Math.round(fit * 100)
  return (
    <div className="backdrop">
      <section className="dialog">
        <div className="glow" />
        <h2>{tr('busvraag.title')}</h2>
        <p>
          <strong>{bus}</strong>
          {yard ? ` · ${yard}` : ''}
        </p>
        <p>
          {deel !== undefined && deel >= 100
            ? tr('busvraag.perfect')
            : deel !== undefined
              ? tr('busvraag.partly', { percent: deel })
              : tr('busvraag.plain')}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onZelf}>
            {tr('busvraag.own')}
          </button>
          <button type="button" className="btn" onClick={onDoorgaan}>
            {tr('busvraag.keep')}
          </button>
        </div>
      </section>
    </div>
  )
}
