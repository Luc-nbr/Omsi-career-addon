import type { JSX } from 'react'
import type { Assignment } from '../../shared/api'
import { describeDays, formatDuration, formatTime } from '../../shared/format'
import { useLanguage, useT } from './language'

interface Props {
  duties: Assignment[]
  selected?: number
  onSelect(index: number): void
  /** Klok in het spel, als OMSI draait; diensten die bijna beginnen krijgen een merkteken. */
  clockMinutes?: number
}

/** Het rooster: welke diensten er te rijden zijn. */
export function DutyList({ duties, selected, onSelect, clockMinutes }: Props): JSX.Element {
  const language = useLanguage()
  const tr = useT()
  return (
    <div className="duty-list">
      {duties.map((assignment, index) => {
        const { duty } = assignment
        // Binnen een half uur voor of na de spelklok: nu te beginnen.
        const soon =
          clockMinutes !== undefined && Math.abs(duty.start - clockMinutes) <= 30
        return (
          <button
            key={`${duty.legs[0].tripFile}-${duty.start}`}
            type="button"
            className="duty-item"
            aria-pressed={selected === index}
            onClick={() => onSelect(index)}
          >
            <span className="duty-item-line">{duty.lineFile}</span>
            <span className="duty-item-time">
              {formatTime(duty.start)} – {formatTime(duty.end)}
              {soon && <em>{tr('list.now')}</em>}
            </span>
            <span className="duty-item-meta">
              {tr('list.tour', { tour: duty.tourNumber })} ·{' '}
              {formatDuration(duty.durationMinutes, language)} ·{' '}
              {tr('list.trips', { count: duty.legs.length })} · {describeDays(duty.days, language)}
            </span>
            <span className="duty-item-bus">
              {assignment.vehicle
                ? `${assignment.vehicle.manufacturer} ${assignment.vehicle.type}`
                : tr('list.noBus')}
            </span>
          </button>
        )
      })}
    </div>
  )
}
