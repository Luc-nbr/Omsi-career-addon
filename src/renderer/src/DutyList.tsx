import type { JSX } from 'react'
import type { Assignment } from '../../shared/api'
import { describeDays, formatDuration, formatTime } from '../../shared/format'

interface Props {
  duties: Assignment[]
  selected?: number
  onSelect(index: number): void
  /** Klok in het spel, als OMSI draait; diensten die bijna beginnen krijgen een merkteken. */
  clockMinutes?: number
}

/** Het rooster: welke diensten er te rijden zijn. */
export function DutyList({ duties, selected, onSelect, clockMinutes }: Props): JSX.Element {
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
            <span className="duty-item-line">{duty.lineNumbers.join('/')}</span>
            <span className="duty-item-time">
              {formatTime(duty.start)} – {formatTime(duty.end)}
              {soon && <em>nu</em>}
            </span>
            <span className="duty-item-meta">
              {formatDuration(duty.durationMinutes)} · {duty.legs.length} ritten ·{' '}
              {describeDays(duty.days)}
            </span>
            <span className="duty-item-bus">
              {assignment.vehicle
                ? `${assignment.vehicle.manufacturer} ${assignment.vehicle.type}`
                : 'geen passende bus'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
