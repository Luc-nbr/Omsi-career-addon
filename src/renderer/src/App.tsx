import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { GameMode } from '../../core/career'
import type { LineSummary } from '../../core/duty'
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
import { CareerPanel } from './CareerPanel'
import { DutyCard } from './DutyCard'
import { DutyList } from './DutyList'
import { FreePlay } from './FreePlay'
import { LinePicker } from './LinePicker'
import { Modes } from './Modes'
import { Profiles } from './Profiles'
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

/**
 * Welk scherm er staat. De app begint altijd bij de chauffeur en gaat dan naar
 * de modus; daarna pas komt het rijden in beeld.
 */
type Screen = 'profiles' | 'modes' | 'drive'

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

  const [screen, setScreen] = useState<Screen>('profiles')
  const [mode, setMode] = useState<GameMode>('service')

  const [mapFolder, setMapFolder] = useState('')
  const [lengthIndex, setLengthIndex] = useState(4)
  const [timeWindow, setTimeWindow] = useState<DutyRequest['window']>('heledag')
  /** Leeg betekent: elke lijn van deze kaart mag. */
  const [lineFile, setLineFile] = useState('')
  const [lines, setLines] = useState<LineSummary[]>([])

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

  /*
   * De aangenomen dienst staat in het profiel. Na het laden, na een herstart of
   * na het wisselen van profiel wordt hij hier teruggezet, en zolang hij er is
   * valt er niets anders te kiezen.
   */
  const active = career?.state?.activeDuty
  const confirmed = Boolean(active)
  const exam = active?.exam
  const activeKey = active ? `${career?.state?.id}|${active.confirmedAt}` : ''
  useEffect(() => {
    if (!active) return
    const held = active.assignment as Assignment
    setMapFolder(held.duty.mapFolder)
    setDuties([held])
    setSelected(0)
    setVehicleOverride(active.vehicleOverride)
    setStarted(Boolean(active.startedAt))
    if (active.mode) setMode(active.mode)
  }, [activeKey])

  /** De lijnen van de gekozen kaart; die zijn er voor de route- en examenkeuze. */
  useEffect(() => {
    if (!mapFolder) {
      setLines([])
      return
    }
    let current = true
    void window.career
      .lines(mapFolder)
      .then((found) => {
        if (current) setLines(found)
      })
      .catch(() => {
        if (current) setLines([])
      })
    return () => {
      current = false
    }
  }, [mapFolder])

  // Een lijn van de vorige kaart bestaat hier niet; die keuze vervalt.
  useEffect(() => {
    setLineFile('')
  }, [mapFolder])

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

  /** Zoekt diensten. In de carrièremodus alleen op lijnen met een vergunning. */
  const search = useCallback(
    async (onlyLine?: string) => {
      if (confirmed) return
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
          window: timeWindow,
          lineFile: onlyLine ?? lineFile ?? undefined
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
    },
    [mapFolder, lengthIndex, timeWindow, lineFile, language, confirmed]
  )

  const confirmDuty = useCallback(
    async (asExam?: { lineFile: string; lineNumbers: string[]; basic: boolean }) => {
      if (!assignment || confirmed) return
      setCareer(await window.career.confirmDuty(assignment, vehicleOverride, mode, asExam))
    },
    [assignment, confirmed, vehicleOverride, mode]
  )

  const cancelDuty = useCallback(async () => {
    if (!confirmed || !window.confirm(t(language, 'act.cancelAsk'))) return
    setCareer(await window.career.cancelDuty())
    setDuties([])
    setSelected(undefined)
    setStarted(false)
    setStarting(false)
    setNote(undefined)
  }, [confirmed, language])

  /**
   * Dienst starten. Dit zet de situatie klaar in OMSI -- datum, tijd, bus bij de
   * halte en de dienstregeling -- en start daarna pas het spel. Er is geen aparte
   * knop meer voor het klaarzetten; dat hoort bij starten.
   */
  const begin = useCallback(async () => {
    if (!duty || !confirmed) return
    setBusy(true)
    setNote(t(language, 'start.preparing'))
    try {
      const result = await window.career.beginDuty({
        duty,
        ibis,
        vehiclePath: vehicle?.relativePath,
        date: assignment?.date,
        lineNumber: ibis?.line || duty.legs[0]?.lineNumber || '',
        terminus: duty.legs[0]?.terminus ?? '',
        yard: ibis?.yard
      })
      setStarted(true)
      setOverlayOpen(true)
      // Alleen wachten als we het spel zelf hebben aangezwengeld.
      setStarting(result.launched)

      const lines: string[] = []
      if (result.prepareError) {
        lines.push(t(language, 'start.failed', { reason: result.prepareError }))
      } else {
        lines.push(t(language, 'start.ready', { map: duty.mapName }))
        if (result.prepared?.timetableSet) lines.push(t(language, 'start.timetableSet'))
      }
      if (result.running) lines.push(t(language, 'start.alreadyRunning'))
      setNote(lines.join(' '))
    } finally {
      setBusy(false)
    }
  }, [duty, confirmed, ibis, vehicle, assignment, language])

  const createProfile = useCallback(async (name: string) => {
    setCareer(await window.career.createProfile(name))
    setScreen('modes')
  }, [])

  const chooseProfile = useCallback(async (id: string) => {
    setCareer(await window.career.selectProfile(id))
    setScreen('modes')
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
    setOverlayOpen(await window.career.setOverlay(duty, !overlayOpen, ibis))
  }, [duty, overlayOpen, ibis])

  /**
   * Afronden. Een examenrit gaat naar de examencommissie in plaats van naar het
   * logboek: daar hangt een vergunning aan vast, geen loon.
   */
  const finish = useCallback(async () => {
    if (!duty || !vehicle) return
    setBusy(true)
    try {
      const result = await window.career.checkSession()
      if (exam) {
        const payload = await window.career.finishExam(
          duty,
          {
            finished: result.dutyComplete || result.drivenKm > 0,
            delayMinutes: result.delayMinutes,
            harshBrakes: result.harshBrakes,
            harshAccels: result.harshAccels,
            topSpeed: result.topSpeed
          },
          exam.basic
        )
        setCareer(payload)
        const verdict = payload.state?.exams[0]
        setNote(
          verdict?.passed
            ? t(language, 'exam.granted', { line: verdict.lineNumbers.join('/') || verdict.lineFile })
            : t(language, 'exam.again')
        )
      } else {
        setCareer(
          await window.career.completeDuty(duty, `${vehicle.manufacturer} ${vehicle.type}`, {
            drivenKm: result.drivenKm,
            delayMinutes: result.delayMinutes,
            harshBrakes: result.harshBrakes,
            harshAccels: result.harshAccels
          })
        )
        setNote(
          result.finished && result.drivenKm > 0
            ? `Dienst geboekt: ${result.drivenKm.toFixed(1)} km` +
                (result.harshBrakes ? `, ${result.harshBrakes}× hard geremd` : ', vloeiend gereden') +
                '.'
            : 'Dienst geboekt. OMSI draaide niet, dus er viel niets te meten.'
        )
      }
      setDuties([])
      setSelected(undefined)
      setStarted(false)
      setOverlayOpen(false)
    } finally {
      setBusy(false)
    }
  }, [duty, vehicle, exam, language])

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
  if (career && (!career.state || career.profiles.length === 0)) {
    return <Welcome language={language} onLanguage={chooseLanguage} onCreate={createProfile} />
  }

  if (screen === 'profiles') {
    return (
      <Profiles
        language={language}
        onLanguage={chooseLanguage}
        profiles={career?.profiles ?? []}
        onChoose={chooseProfile}
        onCreate={createProfile}
      />
    )
  }

  if (screen === 'modes') {
    return (
      <Modes
        language={language}
        driver={career?.state?.driver ?? ''}
        licences={career?.summary?.licences ?? 0}
        running={active ? active.mode ?? 'service' : undefined}
        onPick={(picked) => {
          setMode(picked)
          setScreen('drive')
        }}
        onBack={() => setScreen('profiles')}
      />
    )
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
        <div className="mode-bar">
          <span className="mode-tag">{t(language, `mode.${mode}` as const)}</span>
          <button type="button" className="link-button" onClick={() => setScreen('modes')}>
            {t(language, 'mode.otherMode')}
          </button>
        </div>

        {/* De kop zegt in welke modus je bent; alleen bij dienst is dat "dienst kiezen". */}
        <h1>{mode === 'service' ? t(language, 'app.title') : t(language, `mode.${mode}` as const)}</h1>
        <p className="subtitle">
          {mode === 'service'
            ? t(language, 'app.subtitle')
            : t(language, mode === 'career' ? 'mode.careerIntro' : 'mode.freeIntro')}
        </p>

        {mode === 'free' ? (
          <FreePlay
            language={language}
            maps={maps}
            lines={lines}
            vehicleGroups={vehicleGroups}
            mapFolder={mapFolder}
            onMapChange={setMapFolder}
            lineFile={lineFile}
            onLineChange={setLineFile}
          />
        ) : (
          <>
            {mode === 'career' && career?.state && (
              <CareerPanel
                language={language}
                state={career.state}
                maps={maps}
                lines={lines}
                mapFolder={mapFolder}
                onMapChange={setMapFolder}
                busy={busy || confirmed}
                onAssign={(licensedLine) => void search(licensedLine)}
                onExam={async (line, basic) => {
                  setBusy(true)
                  setError(undefined)
                  setNote(undefined)
                  try {
                    const found = await window.career.examDuty(mapFolder, line.lineFile)
                    if (!found) {
                      setError(t(language, 'exam.none'))
                      return
                    }
                    setDuties([found])
                    setSelected(0)
                    setVehicleOverride('')
                    setStarted(false)
                    // Het examen ligt meteen vast: er valt niets te kiezen.
                    setCareer(
                      await window.career.confirmDuty(found, '', 'career', {
                        lineFile: line.lineFile,
                        lineNumbers: line.lineNumbers,
                        basic
                      })
                    )
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause))
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            )}

            {mode === 'service' && (
              <section className="card">
                <div className="field-grid">
                  <div>
                    <label htmlFor="map">{t(language, 'app.map')}</label>
                    <select
                      id="map"
                      value={mapFolder}
                      disabled={confirmed}
                      onChange={(event) => setMapFolder(event.target.value)}
                    >
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
                    <LinePicker
                      language={language}
                      lines={lines}
                      value={lineFile}
                      disabled={confirmed}
                      onChange={setLineFile}
                    />
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
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void search()}
                    disabled={busy || confirmed}
                  >
                    {t(language, duties.length > 0 ? 'app.searchAgain' : 'app.search')}
                  </button>
                  <PluginNote status={plugin} language={language} />
                </div>
                {confirmed && (
                  <p className="note" style={{ marginTop: 12 }}>
                    {t(language, 'app.activeDuty')}
                  </p>
                )}
              </section>
            )}

            {(error || note) && (
              <section className="card">
                {error && <p className="note warn">{error}</p>}
                {note && <p className="note">{note}</p>}
              </section>
            )}

            {duties.length > 0 && !confirmed && (
              <section className="card">
                <h2 className="section-title">{t(language, 'app.roster', { count: duties.length })}</h2>
                <DutyList duties={duties} selected={selected} onSelect={setSelected} />
              </section>
            )}

            {assignment ? (
              <DutyCard
                assignment={assignment}
                ibis={ibis}
                vehicle={vehicle}
                vehicleGroups={vehicleGroups}
                vehicleOverride={vehicleOverride}
                onVehicleChange={setVehicleOverride}
                busy={busy}
                confirmed={confirmed}
                started={started}
                overlayOpen={overlayOpen}
                exam={Boolean(exam)}
                onConfirm={() => void confirmDuty()}
                onCancel={cancelDuty}
                onBegin={begin}
                onToggleOverlay={toggleOverlay}
                onFinish={finish}
                printers={printers}
                printer={printer}
                onPrinterChange={setPrinter}
              />
            ) : (
              duties.length > 0 && <p className="empty">{t(language, 'app.pickDuty')}</p>
            )}
          </>
        )}
      </main>
    </div>
    </LanguageProvider>
  )
}
