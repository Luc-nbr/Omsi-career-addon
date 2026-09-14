import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { CareerState, CareerSummary } from '../../core/career'
import type { IbisPlan } from '../../core/ibis'
import type { Duty } from '../../core/types'
import type { Vehicle } from '../../core/vehicles'
import { TIME_WINDOWS, type CareerApi, type DutyRequest, type LaunchResult, type MapSummary } from '../../shared/api'
import { dayOfYear, formatDuration } from '../../shared/format'
import { DutyCard } from './DutyCard'
import { Sidebar } from './Sidebar'

declare global {
  interface Window {
    career: CareerApi
  }
}

type CareerPayload = { state: CareerState; summary: CareerSummary }

/** Dienstlengtes die je kunt kiezen, in minuten. */
const LENGTHS = [60, 90, 120, 150, 180, 240, 300, 360, 420, 480]

export function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [career, setCareer] = useState<CareerPayload>()

  const [mapFolder, setMapFolder] = useState('')
  const [lengthIndex, setLengthIndex] = useState(5)
  const [timeWindow, setTimeWindow] = useState<DutyRequest['window']>('heledag')
  const [vehiclePath, setVehiclePath] = useState('')
  const [windowed, setWindowed] = useState(false)

  const [duty, setDuty] = useState<Duty>()
  const [ibis, setIbis] = useState<IbisPlan>()
  const [busy, setBusy] = useState(false)
  const [launched, setLaunched] = useState<LaunchResult>()

  useEffect(() => {
    void (async () => {
      try {
        const status = await window.career.status()
        if (!status.found) {
          setError('Geen OMSI 2-installatie gevonden. Staat het spel op een andere schijf?')
          return
        }
        const [loadedMaps, loadedVehicles, loadedCareer] = await Promise.all([
          window.career.maps(),
          window.career.vehicles(),
          window.career.career()
        ])
        setMaps(loadedMaps)
        setVehicles(loadedVehicles)
        setCareer(loadedCareer)
        setMapFolder(loadedMaps[0]?.folder ?? '')
        setVehiclePath(loadedVehicles[0]?.relativePath ?? '')
        setReady(true)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  }, [])

  const selectedMap = useMemo(() => maps.find((m) => m.folder === mapFolder), [maps, mapFolder])
  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.relativePath === vehiclePath),
    [vehicles, vehiclePath]
  )

  /** Voertuigen gegroepeerd per map, anders is de lijst van 351 onleesbaar. */
  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, Vehicle[]>()
    for (const vehicle of vehicles) {
      const list = groups.get(vehicle.folder) ?? []
      list.push(vehicle)
      groups.set(vehicle.folder, list)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [vehicles])

  /**
   * De bestemmingscodes hangen aan de gekozen bus én aan het jaar van de kaart,
   * dus ze worden opnieuw opgehaald zodra een van beide wijzigt.
   */
  useEffect(() => {
    if (!duty || !selectedVehicle || !selectedMap) {
      setIbis(undefined)
      return
    }
    let current = true
    void window.career.ibis(duty, selectedVehicle, selectedMap.year).then((plan) => {
      if (current) setIbis(plan)
    })
    return () => {
      current = false
    }
  }, [duty, selectedVehicle, selectedMap])

  const assign = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    setLaunched(undefined)
    try {
      const result = await window.career.generateDuty({
        mapFolder,
        targetMinutes: LENGTHS[lengthIndex],
        window: timeWindow
      })
      if (!result) {
        setError(
          `Geen dienst van ongeveer ${formatDuration(LENGTHS[lengthIndex])} in dit dagdeel op deze kaart. ` +
            'Kies een andere lengte of een ruimer dagdeel.'
        )
        setDuty(undefined)
      } else {
        setDuty(result)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [mapFolder, lengthIndex, timeWindow])

  const start = useCallback(async () => {
    if (!duty || !selectedVehicle || !selectedMap) return
    setBusy(true)
    setError(undefined)
    try {
      setLaunched(
        await window.career.launch({
          duty,
          vehicle: selectedVehicle,
          year: selectedMap.year,
          dayOfYear: selectedMap.dayOfYear || dayOfYear(new Date()),
          windowed,
          yard: ibis?.yard
        })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [duty, selectedVehicle, selectedMap, windowed, ibis])

  const finish = useCallback(async () => {
    if (!duty || !selectedVehicle) return
    setCareer(await window.career.completeDuty(duty, `${selectedVehicle.manufacturer} ${selectedVehicle.type}`))
    setDuty(undefined)
    setLaunched(undefined)
  }, [duty, selectedVehicle])

  if (error && !ready) {
    return (
      <div className="main">
        <h1>Er ging iets mis</h1>
        <p className="subtitle">{error}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="main">
        <h1>Dienstregeling inlezen…</h1>
        <p className="subtitle">Alle kaarten, omlopen en voertuigen worden doorgenomen.</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        career={career}
        onRename={async (name) => setCareer(await window.career.renameDriver(name))}
      />

      <main className="main">
        <h1>Nieuwe dienst</h1>
        <p className="subtitle">
          Kies waar en hoe lang je wilt rijden. De dienst komt uit de echte dienstregeling van de kaart.
        </p>

        <section className="card">
          <div className="field-grid">
            <div>
              <label htmlFor="map">Kaart</label>
              <select id="map" value={mapFolder} onChange={(event) => setMapFolder(event.target.value)}>
                {maps.map((item) => (
                  <option key={item.folder} value={item.folder}>
                    {item.name} — {item.tours} omlopen
                  </option>
                ))}
              </select>
              {selectedMap && (
                <p className="note" style={{ marginTop: 8 }}>
                  Speelt in {selectedMap.year}
                  {!selectedMap.hasTemplate && (
                    <>
                      {' · '}
                      <span className="warn">
                        nog nooit gespeeld, dus de bus kan niet automatisch klaargezet worden
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="bus">Bus</label>
              <select id="bus" value={vehiclePath} onChange={(event) => setVehiclePath(event.target.value)}>
                {vehicleGroups.map(([folder, items]) => (
                  <optgroup key={folder} label={folder}>
                    {items.map((vehicle) => (
                      <option key={vehicle.relativePath} value={vehicle.relativePath}>
                        {vehicle.manufacturer} {vehicle.type}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="length">Dienstlengte</label>
              <div className="length-value">{formatDuration(LENGTHS[lengthIndex])}</div>
              <input
                id="length"
                type="range"
                min={0}
                max={LENGTHS.length - 1}
                value={lengthIndex}
                onChange={(event) => setLengthIndex(Number(event.target.value))}
              />
            </div>

            <div>
              <label>Dagdeel</label>
              <div className="chips">
                {(Object.keys(TIME_WINDOWS) as Array<DutyRequest['window']>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="chip"
                    aria-pressed={timeWindow === key}
                    onClick={() => setTimeWindow(key)}
                  >
                    {TIME_WINDOWS[key].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={assign} disabled={busy}>
              {duty ? 'Andere dienst' : 'Dienst toewijzen'}
            </button>
            <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <input
                type="checkbox"
                checked={windowed}
                onChange={(event) => setWindowed(event.target.checked)}
                style={{ width: 'auto' }}
              />
              In venster starten
            </label>
          </div>

          {error && ready && (
            <p className="note warn" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
        </section>

        {duty && (
          <DutyCard
            duty={duty}
            ibis={ibis}
            vehicle={selectedVehicle}
            launched={launched}
            busy={busy}
            onStart={start}
            onFinish={finish}
          />
        )}

        {!duty && (
          <p className="empty">
            Nog geen dienst toegewezen. Kies hierboven een kaart en lengte en druk op “Dienst toewijzen”.
          </p>
        )}
      </main>
    </div>
  )
}
