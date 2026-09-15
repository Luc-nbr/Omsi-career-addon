import type { JSX } from 'react'
import type { LineSummary } from '../../core/duty'
import { t, type Language } from '../../shared/i18n'

interface Props {
  language: Language
  lines: LineSummary[]
  /** Leeg is "elke lijn"; alleen waar dat mag. */
  value: string
  disabled?: boolean
  /** Zonder deze keuze is er geen lijst, alleen de lijnen zelf. */
  allowAny?: boolean
  label?: string
  onChange(lineFile: string): void
}

/**
 * De route kiezen.
 *
 * Wat OMSI een lijn noemt is een bestand met omlopen, en dat heet lang niet
 * altijd naar het lijnnummer: op Thüringer Wald heet het "Omnibusverkehr
 * Rennsteig" en rijden daar de 725 en de 731 in. Daarom staat het lijnnummer
 * erbij, en eronder wat je ervan kunt verwachten.
 */
export function LinePicker({
  language,
  lines,
  value,
  disabled,
  allowAny = true,
  label,
  onChange
}: Props): JSX.Element {
  const chosen = lines.find((line) => line.lineFile === value)
  return (
    <>
      <label htmlFor="line">{label ?? t(language, 'line.pick')}</label>
      <select
        id="line"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowAny && <option value="">{t(language, 'line.any')}</option>}
        {lines.map((line) => (
          <option key={line.lineFile} value={line.lineFile}>
            {line.lineNumbers.length > 0 && line.lineNumbers.join('/') !== line.lineFile
              ? `${line.lineFile} — ${line.lineNumbers.join('/')}`
              : line.lineFile}
          </option>
        ))}
      </select>
      {chosen && (
        <p className="note" style={{ marginTop: 8 }}>
          {t(language, 'line.meta', {
            tours: chosen.tours,
            trips: chosen.trips,
            minutes: chosen.averageMinutes
          })}
        </p>
      )}
    </>
  )
}
