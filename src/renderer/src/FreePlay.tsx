import { useEffect, useState, type JSX } from 'react'
import type { LineSummary } from '../../core/duty'
import type { MapGeometry } from '../../core/geo'
import type { Vehicle } from '../../core/vehicles'
import { WEATHER_KINDS, type WeatherKind } from '../../shared/weather'
import type { MapSummary } from '../../shared/api'
import { t, type Language } from '../../shared/i18n'
import { LinePicker } from './LinePicker'

interface Props {
  language: Language
  maps: MapSummary[]
  lines: LineSummary[]
  vehicleGroups: Array<[string, Vehicle[]]>
  mapFolder: string
  onMapChange(folder: string): void
  lineFile: string
  onLineChange(lineFile: string): void
}

/** Dag van het jaar naar een datum, en terug; OMSI telt in dagen. */
function isoFrom(year: number, dayOfYear: number): string {
  const date = new Date(Date.UTC(year, 0, 1))
  date.setUTCDate(dayOfYear)
  return date.toISOString().slice(0, 10)
}

function dayOfYearOf(iso: string): { year: number; dayOfYear: number } {
  const date = new Date(`${iso}T00:00:00Z`)
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return {
    year: date.getUTCFullYear(),
    dayOfYear: Math.round((date.getTime() - start) / 86400000) + 1
  }
}

/**
 * Vrij rijden.
 *
 * Hier hoort geen dienst bij en er wordt niets geboekt: de app schrijft de
 * situatie zoals de speler hem samenstelt, zet hem klaar in het startscherm van
 * OMSI en biedt de overlay aan. Kiest hij een lijn, dan staat het
 * dienstregelingsmenu daar ook meteen op.
 */
export function FreePlay({
  language,
  maps,
  lines,
  vehicleGroups,
  mapFolder,
  onMapChange,
  lineFile,
  onLineChange
}: Props): JSX.Element {
  const selectedMap = maps.find((item) => item.folder === mapFolder)
  const [geometry, setGeometry] = useState<MapGeometry>()
  const [stopId, setStopId] = useState('')
  const [vehiclePath, setVehiclePath] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('08:00')
  const [weather, setWeather] = useState<WeatherKind>('clear')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()

  // De datum begint in het tijdvak van de kaart: 1988 in Spandau, 2016 in HafenCity.
  useEffect(() => {
    if (selectedMap) setDate(isoFrom(selectedMap.year, selectedMap.dayOfYear || 180))
    setStopId('')
  }, [selectedMap?.folder])

  useEffect(() => {
    if (!mapFolder) return
    let current = true
    void window.career.geometry(mapFolder).then((found) => {
      if (current) setGeometry(found)
    })
    return () => {
      current = false
    }
  }, [mapFolder])

  const stops = (geometry?.stops ?? [])
    .filter((stop) => stop.name)
    .sort((a, b) => a.name.localeCompare(b.name))

  const start = async (): Promise<void> => {
    if (!selectedMap || !date) return
    setBusy(true)
    setNote(undefined)
    try {
      const [hours, minutes] = time.split(':').map(Number)
      const when = dayOfYearOf(date)
      const result = await window.career.startFree({
        mapFolder,
        lineFile: lineFile || undefined,
        vehiclePath: vehiclePath || undefined,
        stopId: stopId || undefined,
        year: when.year,
        dayOfYear: when.dayOfYear,
        minutes: (hours || 0) * 60 + (minutes || 0),
        weather
      })
      const lines: string[] = [t(language, 'free.ready', { map: selectedMap.name })]
      if (result.running) lines.push(t(language, 'start.alreadyRunning'))
      setNote(lines.join(' '))
    } catch (cause) {
      setNote(t(language, 'start.failed', { reason: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="section-title">{t(language, 'free.title')}</h2>
      <p className="note">{t(language, 'free.intro')}</p>

      <div className="field-grid">
        <div>
          <label htmlFor="map">{t(language, 'app.map')}</label>
          <select id="map" value={mapFolder} onChange={(event) => onMapChange(event.target.value)}>
            {maps.map((item) => (
              <option key={item.folder} value={item.folder}>
                {item.name} — {t(language, 'app.mapTours', { count: item.tours })}
              </option>
            ))}
          </select>
        </div>

        <div>
          <LinePicker language={language} lines={lines} value={lineFile} onChange={onLineChange} />
        </div>

        <div>
          <label htmlFor="bus">{t(language, 'bus.pick')}</label>
          {/* Vrij rijden zonder bus bestaat niet: zonder keuze valt er niets neer te zetten. */}
          <select id="bus" value={vehiclePath} onChange={(event) => setVehiclePath(event.target.value)}>
            <option value="">&mdash;</option>
            {vehicleGroups.map(([folder, group]) => (
              <optgroup key={folder} label={folder}>
                {group.map((item) => (
                  <option key={item.relativePath} value={item.relativePath}>
                    {item.manufacturer} {item.type}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="stop">{t(language, 'free.stop')}</label>
          <select id="stop" value={stopId} onChange={(event) => setStopId(event.target.value)}>
            <option value="">{t(language, 'free.stopAuto')}</option>
            {stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="date">{t(language, 'free.date')}</label>
          <input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        <div>
          <label htmlFor="time">{t(language, 'free.time')}</label>
          <input id="time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </div>

        <div>
          <label>{t(language, 'free.weather')}</label>
          <div className="chips">
            {WEATHER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className="chip"
                aria-pressed={weather === kind}
                onClick={() => setWeather(kind)}
              >
                {t(language, `weather.${kind}` as const)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn" disabled={busy || !vehiclePath} onClick={() => void start()}>
          {t(language, busy ? 'free.starting' : 'free.start')}
        </button>
        {note && <span className="note">{note}</span>}
      </div>
    </section>
  )
}
