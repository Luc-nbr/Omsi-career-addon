import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { IbisPlan } from '../../core/ibis'
import type { PluginStatus } from '../../core/pluginInstall'
import type { Vehicle } from '../../core/vehicles'
import {
  TIME_WINDOWS,
  type Assignment,
  type CareerApi,
  type CareerPayload,
  type DutyRequest,
  type MapSummary,
  type PrinterInfo
} from '../../shared/api'
import { formatDuration } from '../../shared/format'
import { DutyCard } from './DutyCard'
import { DutyList } from './DutyList'
import { Sidebar } from './Sidebar'
import { StartingDialog } from './StartingDialog'
import { Welcome } from './Welcome'
import { DEFAULT_LANGUAGE, t, type Language } from '../../shared/i18n'
import { LanguageProvider } from './language'

declare global {
  interface Window {
    career: CareerApi
  }
}

/** Dienstlengtes die je kunt kiezen, in minuten. Korter dan een half uur niet. */
const LENGTHS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480]

/** Staat de overlay-plugin klaar in OMSI? */
function PluginNote({ status, language }: { status?: PluginStatus; language: Language }): JSX.Element {
  if (!status) return <span className="note">{t(language, 'app.pluginChecking')}</span>
  if (status.error)
    return <span className="note warn">{t(language, 'app.pluginError', { error: status.error })}</span>
  if (status.changed) return <span className="note">{t(language, 'app.pluginUpdated')}</span>
  return <span className="note">{t(language, 'app.pluginReady')}</span>
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
  const [starting, setStarting] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState('')
  const finishRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)

  // De taalkeuze staat los van de chauffeur; hij hoort bij deze computer.
  useEffect(() => {
    void window.career.settings().then((settings) => setLanguage(settings.language))
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const chooseLanguage = useCallback((next: Language) => {
    setLanguage(next)
    void window.career.saveSettings({ language: next })
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const status = await window.career.status()
        if (!status.found) {
          setError(t(language, 'app.noOmsi'))
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
        void window.career.printers().then((found) => {
          setPrinters(found)
          setPrinter(found[0]?.name ?? '')
        })
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
          t(language, 'app.noDuty', { length: formatDuration(LENGTHS[lengthIndex], language) })
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [mapFolder, lengthIndex, timeWindow, language])

  const begin = useCallback(async () => {
    if (!duty) return
    const { connected, launched, running } = await window.career.beginDuty(duty)
    setStarted(true)
    setOverlayOpen(true)
    // Alleen wachten als we het spel zelf hebben aangezwengeld.
    setStarting(launched)
    setNote(
      connected || launched
        ? undefined
        : running
          ? 'OMSI draait al. De overlay vult zich zodra de plugin gegevens doorgeeft.'
          : 'OMSI kon niet gestart worden. Start het spel zelf; de overlay staat klaar.'
    )
  }, [duty])

  const createProfile = useCallback(async (name: string) => {
    setCareer(await window.career.createProfile(name))
  }, [])

  /**
   * Zolang de dienst loopt kijken we of hij is uitgereden: eindtijd voorbij en
   * de bus stil. Dan boekt de app hem zelf, zoals een chauffeur die afmeldt.
   */
  useEffect(() => {
    if (!started) return
    const timer = setInterval(() => {
      void window.career.checkSession().then((result) => {
        if (result.dutyComplete) void finishRef.current?.()
      })
    }, 5000)
    return () => clearInterval(timer)
  }, [started])

  // De stand van de overlay komt uit het hoofdproces; hij gaat ook dicht vanuit
  // de overlay zelf of bij het afronden, en dan moet de knop dat weten.
  useEffect(() => {
    void window.career.overlayIsOpen().then(setOverlayOpen)
    return window.career.onOverlayState(setOverlayOpen)
  }, [])

  const toggleOverlay = useCallback(async () => {
    if (!duty && !overlayOpen) return
    setOverlayOpen(await window.career.setOverlay(duty, !overlayOpen))
  }, [duty, overlayOpen])

  const finish = useCallback(async () => {
    if (!duty || !vehicle) return
    setBusy(true)
    try {
      const result = await window.career.checkSession()
      setCareer(
        await window.career.completeDuty(duty, `${vehicle.manufacturer} ${vehicle.type}`, {
          drivenKm: result.drivenKm,
          delayMinutes: result.delayMinutes,
          harshBrakes: result.harshBrakes,
          harshAccels: result.harshAccels
        })
      )
      setDuties([])
      setSelected(undefined)
      setStarted(false)
      setOverlayOpen(false)
      setNote(
        result.finished && result.drivenKm > 0
          ? `Dienst geboekt: ${result.drivenKm.toFixed(1)} km` +
              (result.harshBrakes ? `, ${result.harshBrakes}× hard geremd` : ', vloeiend gereden') +
              '.'
          : 'Dienst geboekt. OMSI draaide niet, dus er viel niets te meten.'
      )
    } finally {
      setBusy(false)
    }
  }, [duty, vehicle])

  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  if (error && !ready) {
    return (
      <div className="main">
        <h1>{t(language, 'app.errorTitle')}</h1>
        <p className="subtitle">{error}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="main">
        <h1>{t(language, 'app.loading')}</h1>
        <p className="subtitle">{t(language, 'app.loadingSub')}</p>
      </div>
    )
  }

  // Zonder profiel valt er niets te loggen; eerst een chauffeur aanmaken.
  if (career && !career.state) {
    return <Welcome language={language} onLanguage={chooseLanguage} onCreate={createProfile} />
  }

  return (
    <LanguageProvider language={language}>
    <div className="app">
      <Sidebar
        language={language}
        onLanguage={chooseLanguage}
        career={career}
        onRename={async (name) => setCareer(await window.career.renameDriver(name))}
        onSelectProfile={async (id) => setCareer(await window.career.selectProfile(id))}
        onNewProfile={async (name) => setCareer(await window.career.createProfile(name))}
      />

      {starting && (
        <StartingDialog
          onDone={() => {
            setStarting(false)
            setNote(t(language, 'app.omsiReady'))
          }}
          onDismiss={() => setStarting(false)}
        />
      )}

      <main className="main">
        <h1>{t(language, 'app.title')}</h1>
        <p className="subtitle">{t(language, 'app.subtitle')}</p>

        <section className="card">
          <div className="field-grid">
            <div>
              <label htmlFor="map">{t(language, 'app.map')}</label>
              <select id="map" value={mapFolder} onChange={(event) => setMapFolder(event.target.value)}>
                {maps.map((item) => (
                  <option key={item.folder} value={item.folder}>
                    {item.name} — {t(language, 'app.mapTours', { count: item.tours })}
                  </option>
                ))}
              </select>
              {selectedMap && (
                <p className="note" style={{ marginTop: 8 }}>
                  {t(language, 'app.mapEra', { year: selectedMap.year })}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="length">{t(language, 'app.length')}</label>
              <div className="length-value">{formatDuration(LENGTHS[lengthIndex], language)}</div>
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
              <label>{t(language, 'app.daypart')}</label>
              <div className="chips">
                {(Object.keys(TIME_WINDOWS) as Array<DutyRequest['window']>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="chip"
                    aria-pressed={timeWindow === key}
                    onClick={() => setTimeWindow(key)}
                  >
                    {t(language, `window.${key}` as const)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={search} disabled={busy}>
              {t(language, duties.length > 0 ? 'app.searchAgain' : 'app.search')}
            </button>
            <PluginNote status={plugin} language={language} />
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
            <h2 className="section-title">{t(language, 'app.roster', { count: duties.length })}</h2>
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
                printers={printers}
                printer={printer}
                onPrinterChange={setPrinter}
              />
            )
          : duties.length > 0 && <p className="empty">{t(language, 'app.pickDuty')}</p>}
      </main>
    </div>
    </LanguageProvider>
  )
}
