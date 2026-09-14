import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { PluginStatus } from '../../core/pluginInstall'
import type { Vehicle } from '../../core/vehicles'
import {
  TIME_WINDOWS,
  type Assignment,
  type CareerApi,
  type CareerPayload,
  type DutyRequest,
  type MapSummary
} from '../../shared/api'
import { formatDuration } from '../../shared/format'
import { DutyCard } from './DutyCard'
import { DutyList } from './DutyList'
import { Sidebar } from './Sidebar'

declare global {
  interface Window {
    career: CareerApi
  }
}

/** Dienstlengtes die je kunt kiezen, in minuten. Korter dan een half uur niet. */
const LENGTHS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480]

/** Staat de overlay-plugin klaar in OMSI? */
function PluginNote({ status }: { status?: PluginStatus }): JSX.Element {
  if (!status) return <span className="note">Plugin controleren…</span>
  if (status.error) return <span className="note warn">Overlay: {status.error}</span>
  if (status.changed) return <span className="note">Overlay-plugin bijgewerkt in OMSI.</span>
  return <span className="note">Overlay-plugin staat klaar in OMSI.</span>
}

export function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [career, setCareer] = useState<CareerPayload>()

  const [mapFolder, setMapFolder] = useState('')
  const [lengthIndex, setLengthIndex] = useState(4)
  const [timeWindow, setTimeWindow] = useState<DutyRequest['window']>('heledag')

  const [duties, setDuties] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<number>()
  /** Leeg betekent: de bus gebruiken die de app voorstelt. */
  const [vehicleOverride, setVehicleOverride] = useState('')
  const [ibis, setIbis] = useState<IbisPlan>()
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [note, setNote] = useState<string>()
  const [plugin, setPlugin] = useState<PluginStatus>()
  const [newName, setNewName] = useState('')

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
        setReady(true)
        // Losstaand: de overlay-plugin klaarzetten mag de rest niet ophouden.
        void window.career.pluginStatus().then(setPlugin)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  }, [])

  const selectedMap = useMemo(() => maps.find((m) => m.folder === mapFolder), [maps, mapFolder])
  const assignment = selected !== undefined ? duties[selected] : undefined
  const duty = assignment?.duty

  const vehicle = useMemo(() => {
    if (vehicleOverride) return vehicles.find((v) => v.relativePath === vehicleOverride)
    return assignment?.vehicle ?? undefined
  }, [vehicleOverride, vehicles, assignment])

  /** Voertuigen gegroepeerd per map, anders is de lijst van 351 onleesbaar. */
  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, Vehicle[]>()
    for (const item of vehicles) {
      const list = groups.get(item.folder) ?? []
      list.push(item)
      groups.set(item.folder, list)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [vehicles])

  /** Bestemmingscodes hangen aan de bus en aan het tijdvak van de kaart. */
  useEffect(() => {
    if (!duty || !vehicle || !selectedMap) {
      setIbis(undefined)
      return
    }
    let current = true
    void window.career.ibis(duty, vehicle, selectedMap.year).then((plan) => {
      if (current) setIbis(plan)
    })
    return () => {
      current = false
    }
  }, [duty, vehicle, selectedMap])

  const search = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    setNote(undefined)
    setSelected(undefined)
    setStarted(false)
    setVehicleOverride('')
    try {
      const found = await window.career.listDuties({
        mapFolder,
        targetMinutes: LENGTHS[lengthIndex],
        window: timeWindow
      })
      setDuties(found)
      if (found.length === 0) {
        setError(
          `Geen dienst van ongeveer ${formatDuration(LENGTHS[lengthIndex])} in dit dagdeel op deze kaart. ` +
            'Kies een andere lengte of een ruimer dagdeel.'
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [mapFolder, lengthIndex, timeWindow])

  const begin = useCallback(async () => {
    if (!duty) return
    const { connected, launched, running } = await window.career.beginDuty(duty)
    setStarted(true)
    setOverlayOpen(true)
    setNote(
      connected
        ? launched
          ? 'OMSI wordt gestart.'
          : undefined
        : launched
          ? 'OMSI wordt gestart. Laad je kaart en bus; de overlay vult zich zodra het spel loopt.'
          : running
            ? 'OMSI draait al. De overlay vult zich zodra de plugin gegevens doorgeeft.'
            : 'OMSI kon niet gestart worden. Start het spel zelf; de overlay staat klaar.'
    )
  }, [duty])

  const createProfile = useCallback(async () => {
    if (!newName.trim()) return
    setCareer(await window.career.createProfile(newName))
    setNewName('')
  }, [newName])

  const toggleOverlay = useCallback(async () => {
    if (!duty) return
    setOverlayOpen(await window.career.toggleOverlay(duty))
  }, [duty])

  const finish = useCallback(async () => {
    if (!duty || !vehicle) return
    setBusy(true)
    try {
      const result = await window.career.checkSession()
      setCareer(
        await window.career.completeDuty(duty, `${vehicle.manufacturer} ${vehicle.type}`, {
          drivenKm: result.drivenKm,
          delayMinutes: result.delayMinutes
        })
      )
      setDuties([])
      setSelected(undefined)
      setStarted(false)
      setOverlayOpen(false)
      setNote(
        result.finished && result.drivenKm > 0
          ? `Dienst geboekt: ${result.drivenKm.toFixed(1)} km gereden.`
          : 'Dienst geboekt. OMSI draaide niet, dus de kilometers zijn niet gemeten.'
      )
    } finally {
      setBusy(false)
    }
  }, [duty, vehicle])

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

  // Zonder profiel valt er niets te loggen; eerst een chauffeur aanmaken.
  if (career && !career.state) {
    return (
      <div className="main">
        <h1>Nieuwe chauffeur</h1>
        <p className="subtitle">
          Je diensten, kilometers en verdiensten worden per chauffeur bijgehouden en lokaal
          opgeslagen. Hoe heet je?
        </p>
        <section className="card" style={{ maxWidth: 420 }}>
          <label htmlFor="naam">Naam</label>
          <input
            id="naam"
            value={newName}
            autoFocus
            placeholder="Bijvoorbeeld Luc"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newName.trim()) void createProfile()
            }}
          />
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={!newName.trim()}
              onClick={() => void createProfile()}
            >
              Profiel aanmaken
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        career={career}
        onRename={async (name) => setCareer(await window.career.renameDriver(name))}
        onSelectProfile={async (id) => setCareer(await window.career.selectProfile(id))}
        onNewProfile={async (name) => setCareer(await window.career.createProfile(name))}
      />

      <main className="main">
        <h1>Dienst kiezen</h1>
        <p className="subtitle">
          Laad je kaart en bus zelf in OMSI. Kies hier daarna een dienst; de app geeft de
          instructies, de IBIS-codes en de overlay.
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
                </p>
              )}
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
            <button type="button" className="btn" onClick={search} disabled={busy}>
              {duties.length > 0 ? 'Ander rooster' : 'Diensten zoeken'}
            </button>
            <PluginNote status={plugin} />
          </div>

          {error && ready && (
            <p className="note warn" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
          {note && (
            <p className="note" style={{ marginTop: 12 }}>
              {note}
            </p>
          )}
        </section>

        {duties.length > 0 && (
          <section className="card">
            <h2 className="section-title">Rooster — {duties.length} diensten</h2>
            <DutyList duties={duties} selected={selected} onSelect={setSelected} />
          </section>
        )}

        {assignment
          ? (
              <DutyCard
                assignment={assignment}
                ibis={ibis}
                vehicle={vehicle}
                vehicleGroups={vehicleGroups}
                vehicleOverride={vehicleOverride}
                onVehicleChange={setVehicleOverride}
                busy={busy}
                started={started}
                overlayOpen={overlayOpen}
                onBegin={begin}
                onToggleOverlay={toggleOverlay}
                onFinish={finish}
              />
            )
          : duties.length > 0 && <p className="empty">Kies hierboven een dienst.</p>}
      </main>
    </div>
  )
}
