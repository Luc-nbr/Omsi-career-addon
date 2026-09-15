import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  completeDuty,
  recordExam,
  summarise,
  type ActiveDuty,
  type CareerState,
  type GameMode
} from '../core/career'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  readProfile,
  resolveActive,
  setActive,
  writeProfile
} from '../core/profiles'
import { dateForMask, dayKind, readCalendar, type Calendar } from '../core/calendar'
import {
  buildNetwork,
  examTrip,
  generateDuties,
  generateDuty,
  listLines,
  type LineSummary,
  type Network
} from '../core/duty'
import { judgeExam, type ExamMeasurement } from '../core/exam'
import { readGameSettings, writeGameSettings } from '../core/gameSettings'
import {
  readControllers,
  writeControllers,
  type ControllerConfig
} from '../core/omsiControllers'
import {
  readActionLabels,
  readKeyNames,
  readKeyboard,
  writeKeyboard,
  type KeyBinding
} from '../core/omsiKeys'
import { buildFleetIndex, pickVehicleForDuty, readMapFleet, type FleetIndex } from '../core/fleet'
import { readMapData, readTileGrid, type Lane, type MapGeometry } from '../core/geo'
import { LaneNetwork, routeForTrip, type TripRoute } from '../core/routing'
import { VehicleTracker, type VehiclePosition } from '../core/vehicle'
import { buildIbisPlan, type IbisPlan } from '../core/ibis'
import { describeLive, readLive } from '../core/live'
import { findOmsiInstall } from '../core/install'
import { isOmsiRunning, launchOmsi } from '../core/launch'
import { ensurePlugin, pluginSourceDir, type PluginStatus } from '../core/pluginInstall'
import { readOverlayLayout, writeOverlayLayout } from '../core/overlayLayout'
import { receiptHeightMicrons, RECEIPT_WIDTH_MICRONS } from '../core/receipt'
import { readSettings, writeSettings, type Settings } from '../core/settings'
import { formatTime } from '../shared/format'
import { findTemplate, readSituationTime, writeSituation } from '../core/situation'
import { presetStartup } from '../core/startup'
import { spawnAtStop } from '../core/spawn'
import { listMaps, loadMap } from '../core/timetable'
import { listVehicles } from '../core/vehicles'
import type { Duty, OmsiMap } from '../core/types'
import {
  TIME_WINDOWS,
  type Assignment,
  type BeginRequest,
  type FreeRequest,
  type DutyDate,
  type DutyRequest,
  type MapSummary
} from '../shared/api'
import { defaultLayout, OVERLAY_RATES, type OverlayLayout } from '../shared/overlay'

/** Kaarten inlezen kost merkbaar tijd, dus we doen het één keer per sessie. */
const mapCache = new Map<string, OmsiMap>()
const networkCache = new Map<string, Network>()
const mapFleetCache = new Map<string, Set<string>>()
const mapEraCache = new Map<string, { year: number; dayOfYear: number }>()
const calendarCache = new Map<string, Calendar>()
const geometryCache = new Map<string, MapGeometry>()
const laneCache = new Map<string, Lane[]>()
const laneNetworkCache = new Map<string, LaneNetwork>()
const routeCache = new Map<string, TripRoute>()
let fleetIndex: FleetIndex | undefined
/**
 * Nulmeting bij het begin van een dienst, gelezen uit de live gegevens van de
 * plugin. Het verschil met de stand aan het eind is wat er werkelijk gereden is.
 */
let omsiPath: string | undefined
let career: CareerState | undefined
let pluginStatus: PluginStatus | undefined

const userData = () => app.getPath('userData')

function omsi(): string {
  if (!omsiPath) omsiPath = findOmsiInstall()
  if (!omsiPath) throw new Error('Geen OMSI 2-installatie gevonden.')
  return omsiPath
}

function map(folder: string): OmsiMap {
  const cached = mapCache.get(folder)
  if (cached) return cached
  const loaded = loadMap(join(omsi(), 'maps'), folder)
  if (!loaded) throw new Error(`Kaart "${folder}" kon niet worden geladen.`)
  mapCache.set(folder, loaded)
  return loaded
}

/**
 * Halteposities en wegennet van een kaart. Het doorlezen van de tegels kost een
 * fractie van een seconde tot ruim een seconde, dus eenmaal per kaart. De
 * rijstroken blijven hier; de interface heeft alleen de tekening nodig.
 */
function mapGeometry(folder: string): MapGeometry {
  const cached = geometryCache.get(folder)
  if (cached) return cached
  const loaded = map(folder)
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi())
  // Busstops.cfg is de bron voor de namen; wat er in de tegel staat is de
  // naam van het object en heet lang niet altijd naar de halte.
  for (const stop of geometry.stops) {
    const known = loaded.stops.get(stop.id)
    if (known?.name) stop.name = known.name
  }
  geometryCache.set(folder, geometry)
  laneCache.set(folder, lanes)
  return geometry
}

function laneNetwork(folder: string): LaneNetwork {
  const cached = laneNetworkCache.get(folder)
  if (cached) return cached
  mapGeometry(folder)
  const built = new LaneNetwork(laneCache.get(folder) ?? [])
  laneNetworkCache.set(folder, built)
  return built
}

function network(folder: string): Network {
  const cached = networkCache.get(folder)
  if (cached) return cached
  const built = buildNetwork(map(folder))
  networkCache.set(folder, built)
  return built
}

/** Wagenpark van de kaart uit ailists.cfg. */
function fleetOf(folder: string): Set<string> {
  const cached = mapFleetCache.get(folder)
  if (cached) return cached
  const fleet = readMapFleet(join(omsi(), 'maps', folder))
  mapFleetCache.set(folder, fleet)
  return fleet
}

/**
 * Het tijdvak waarin een kaart speelt. Bij voorkeur uit haar situatiebestand;
 * heeft de kaart er geen, dan draagt de mapnaam het jaartal vaak zelf
 * ("Vienna_2005_Line_24A"). Dat jaar bepaalt welk wagenpark-bestand geldt, dus
 * terugvallen op het huidige jaar zou de verkeerde bestemmingscodes opleveren.
 */
function era(folder: string): { year: number; dayOfYear: number } {
  const cached = mapEraCache.get(folder)
  if (cached) return cached

  const template = findTemplate(omsi(), folder)
  const fromName = folder.match(/(19\d{2}|20[0-2]\d)/)
  const time = (template && readSituationTime(template)) || {
    year: fromName ? Number.parseInt(fromName[1], 10) : new Date().getFullYear(),
    dayOfYear: 180
  }
  mapEraCache.set(folder, time)
  return time
}

/** Feestdagen en schoolvakanties van een kaart; die bepalen welke omloop rijdt. */
function calendar(folder: string): Calendar {
  const cached = calendarCache.get(folder)
  if (cached) return cached
  const built = readCalendar(map(folder).path)
  calendarCache.set(folder, built)
  return built
}

/**
 * De datum waarop een omloop rijdt, gezocht vanaf het tijdvak van de kaart.
 * Zonder de juiste datum staat de omloop niet in het dienstregelingsmenu.
 */
function dutyDate(folder: string, days: number): DutyDate | undefined {
  const start = era(folder)
  const found = dateForMask(calendar(folder), start.year, start.dayOfYear, days)
  if (!found) return undefined
  return {
    year: found.year,
    dayOfYear: found.dayOfYear,
    iso: found.date.toISOString().slice(0, 10),
    kind: dayKind(calendar(folder), found.date)
  }
}

/** Waar de bus bij de eerste halte komt te staan. */
function spawnFor(folder: string, stopId: string | undefined) {
  if (!stopId) return undefined
  const stop = mapGeometry(folder).stops.find((item) => item.id === stopId)
  const path = map(folder).path
  const grid = readTileGrid(path)
  if (!stop || !grid) return undefined
  return spawnAtStop(path, grid, laneNetwork(folder), stop)
}

/**
 * In welke taal OMSI zelf staat. Zijn eigen keuze staat in options.cfg; die
 * volgen we, want de namen van de toetsen komen uit zijn bestanden en moeten
 * overeenkomen met wat er in het spel staat.
 */
function omsiLanguage(): string {
  const value = readGameSettings(omsi()).language
  return value && value.length === 3 ? value.toUpperCase() : 'ENG'
}

function fleet(): FleetIndex {
  if (!fleetIndex) fleetIndex = buildFleetIndex(omsi())
  return fleetIndex
}

/**
 * De overlay hangt als doorzichtig, klikdoorlatend venster boven OMSI. Het is
 * bewust geen hook in de grafische laag: dat sloopt oude DX9-spellen. Het spel
 * draait in vensterstand, dus een venster erbovenop volstaat.
 */
let overlayWindow: BrowserWindow | null = null
let overlayTimer: NodeJS.Timeout | undefined
let overlayDuty: Duty | undefined
/** Het IBIS-plan bij die dienst; de overlay toont het tot de IBIS gevuld is. */
let overlayIbis: IbisPlan | undefined
/**
 * In de bewerkstand kun je de vensters verslepen. Dat kan niet altijd aanstaan:
 * een venster dat muisklikken aanneemt, pakt ook de aandacht af van OMSI, en
 * dan staat je stuur stil. Dus normaal laat de overlay alles door en alleen als
 * je hem aanpast niet.
 */
let overlayEditing = false
/**
 * Het vak waar de elementen van de overlay in staan, zoals de pagina het meet.
 *
 * Het venster is doorzichtig en ligt over het spel heen, en alles wat eronder
 * zit moet Windows bij elk beeld opnieuw mengen -- ook de lege hoeken. Dus maken
 * we het venster niet groter dan zijn inhoud. In de bewerkstand mag dat niet:
 * dan moet je de elementen over het hele scherm kunnen slepen.
 */
let overlayBox: { x: number; y: number; w: number; h: number } | undefined

/**
 * Nulmeting van de lopende dienst: het verschil met de stand aan het eind is wat
 * er werkelijk gereden is. Hij staat in het profiel, zodat hij een herstart van
 * de app overleeft.
 */
function baseline(): NonNullable<CareerState['activeDuty']>['baseline'] {
  return career?.activeDuty?.baseline
}

/** De lopende dienst: die van de overlay, of anders die uit het profiel (na een herstart). */
function currentDuty(): Duty | undefined {
  return overlayDuty ?? (career?.activeDuty?.assignment as Assignment | undefined)?.duty
}

/** Verse gegevens van een draaiend OMSI, of niets. */
function freshLive(): ReturnType<typeof readLive> {
  const live = readLive()
  return live && live.alive && (live.ageMs ?? 0) < 15000 ? live : undefined
}

/**
 * Leg de nulmeting vast zodra dat kan: bij het starten als OMSI al draait,
 * anders bij de eerste verse gegevens daarna. Een oud live-bestand van een
 * vorige keer telt niet; dat zou kilometers van toen als begin nemen.
 */
function captureBaseline(live = freshLive()): void {
  const active = career?.activeDuty
  if (!career || !active?.startedAt || active.baseline) return
  if (!live) return
  persist({
    ...career,
    activeDuty: {
      ...active,
      baseline: {
        odometerKm: live.km + live.metres / 1000,
        clockMinutes: live.time / 60,
        harshBrakes: live.harshBrakes,
        harshAccels: live.harshAccels
      }
    }
  })
}

/** Per kaart een tracker: hij onthoudt welke as het noorden is en hoe de bus rijdt. */
const vehicleTrackers = new Map<string, VehicleTracker>()

/** Waar de bus van de speler op de kaart van de dienst staat, als OMSI dat laat lezen. */
function vehicleOnMap(live: ReturnType<typeof readLive>, duty: Duty | undefined): VehiclePosition | undefined {
  if (!live?.alive || live.mem?.ok !== 1 || !duty) return undefined
  try {
    let tracker = vehicleTrackers.get(duty.mapFolder)
    if (!tracker) {
      tracker = new VehicleTracker(map(duty.mapFolder).path)
      vehicleTrackers.set(duty.mapFolder, tracker)
    }
    const network = laneNetwork(duty.mapFolder)
    return tracker.update(live.mem, (x, y) => network.distanceToLane(x, y))
  } catch {
    return undefined
  }
}

/**
 * Wat de overlay het laatst gekregen heeft, als tekst.
 *
 * De overlay ligt over het spel heen: elke keer dat hij zichzelf opnieuw
 * tekent, moet Windows dat beeld over OMSI heen mengen, en dat kost het spel
 * beeldjes. Staat de bus stil bij een halte, dan is er tien keer per seconde
 * niets veranderd -- en dan sturen we ook niets.
 */
let lastFrame: string | undefined

function pushFrame(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  /*
   * Alleen verse gegevens. Een live.json van een vorige keer blijft op schijf
   * staan met alive:true, en dan bleef de overlay een dienst tonen die allang
   * uitgereden was -- inclusief een dienstregelingsmenu dat niemand meer had
   * openstaan. Eén keer lezen per beeld: de nulmeting krijgt hem doorgegeven in
   * plaats van het bestand nog eens van schijf te halen.
   */
  const live = freshLive()
  captureBaseline(live)
  const duty = currentDuty()
  const frame = {
    connected: Boolean(live?.alive),
    status: live ? describeLive(live, duty, baseline()) : undefined,
    vehicle: vehicleOnMap(live, duty),
    duty,
    ibis: overlayIbis,
    editing: overlayEditing
  }

  const signature = JSON.stringify(frame)
  if (signature === lastFrame) return
  lastFrame = signature
  overlayWindow.webContents.send('overlay:frame', frame)
}

/**
 * Waar de overlay mag komen: het hele scherm.
 *
 * Niet het werkgebied. Dat is het scherm min de taakbalk, en OMSI draait daar
 * dwars overheen -- een element dat je onderin wilt hebben kon daardoor niet
 * helemaal naar beneden. De overlay ligt over een spel heen, dus de taakbalk is
 * hier niet de baas.
 */
function overlayArea(): Electron.Rectangle {
  return screen.getPrimaryDisplay().bounds
}

/** Zet het venster om zijn inhoud heen, of over het hele scherm bij het slepen. */
function applyOverlayBounds(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const area = overlayArea()
  if (overlayEditing || !overlayBox) {
    overlayWindow.setBounds(area)
    return
  }
  overlayWindow.setBounds({
    x: area.x + Math.round(overlayBox.x),
    y: area.y + Math.round(overlayBox.y),
    width: Math.max(40, Math.min(area.width, Math.round(overlayBox.w))),
    height: Math.max(40, Math.min(area.height, Math.round(overlayBox.h)))
  })
}

function setOverlayEdit(on: boolean): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false
  overlayEditing = on
  passMouseThrough(!on)
  overlayWindow.setFocusable(on)
  // Slepen kan alleen als het venster het hele scherm beslaat; daarna weer krap.
  applyOverlayBounds()
  if (on) overlayWindow.focus()
  pushFrame()
  return on
}

/**
 * Klikken doorlaten naar het spel, maar de muisbewegingen wel doorgeven aan de
 * pagina. Daarmee kan de overlay zelf melden dat de muis boven een knop hangt
 * en pakken we hem alleen daar even op. Het venster blijft niet-focusbaar, dus
 * OMSI raakt de aandacht niet kwijt.
 */
function passMouseThrough(through: boolean): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(through, through ? { forward: true } : undefined)
}

/**
 * Het hoofdvenster, om het te kunnen laten weten wanneer de overlay open of
 * dicht gaat. Alleen het hoofdproces weet dat zeker: de overlay gaat ook dicht
 * vanuit zichzelf of bij het afronden van een dienst, en een knop in de app die
 * zelf bijhoudt of hij open staat, raakt dan uit de pas.
 */
let mainWindow: BrowserWindow | null = null

function overlayIsOpen(): boolean {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed())
}

function announceOverlay(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('overlay:state', overlayIsOpen())
}

function closeOverlay(): void {
  if (overlayTimer) clearInterval(overlayTimer)
  overlayTimer = undefined
  overlayEditing = false
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
  announceOverlay()
}

function openOverlay(duty: Duty, ibis?: IbisPlan): void {
  overlayDuty = duty
  if (ibis) overlayIbis = ibis
  if (overlayIsOpen()) return
  // Een vers venster weet nog niets; het eerste beeld moet er hoe dan ook komen.
  lastFrame = undefined
  overlayBox = undefined

  // Het venster beslaat het hele scherm, zodat je een paneel overal neer kunt
  // zetten. Wat niet beschilderd is, is doorzichtig en laat klikken door.
  const area = overlayArea()

  overlayWindow = new BrowserWindow({
    width: area.width,
    height: area.height,
    x: area.x,
    y: area.y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Boven een spel in vensterstand, en muisklikken gaan er dwars doorheen.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  passMouseThrough(true)
  overlayWindow.on('closed', () => {
    if (overlayTimer) clearInterval(overlayTimer)
    overlayTimer = undefined
    overlayWindow = null
    announceOverlay()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  /*
   * Hoe vaak, dat kiest de speler. Vaker ziet er vloeiender uit, maar elke
   * verversing van een doorzichtig venster over het spel kost OMSI beeldjes;
   * wie haperingen merkt, zet hem rustiger.
   */
  overlayTimer = setInterval(pushFrame, OVERLAY_RATES[readSettings(userData()).overlayRate])
  announceOverlay()
}

/**
 * Vult het kaartje aan met wie het afdrukt en wanneer. De datumnotatie volgt de
 * taal van de app, want het kaartje is het enige dat de chauffeur in handen
 * krijgt.
 */
function withDriver(payload: unknown): unknown {
  const language = readSettings(userData()).language
  const locale = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }[language]
  return {
    ...(payload as object),
    language,
    driver: career?.driver ?? '—',
    printedAt: new Date().toLocaleString(locale)
  }
}

/**
 * Rendert het dienstkaartje in een onzichtbaar venster en drukt het af.
 *
 * De pagina meldt zelf hoe hoog hij is geworden; daarmee wordt de pagina precies
 * zo lang als het kaartje. Bij een voorbeeld blijft het venster gewoon staan.
 */
function printReceipt(
  payload: unknown,
  options: { deviceName?: string; preview: boolean }
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      show: options.preview,
      width: 380,
      height: 780,
      title: 'Dienstkaartje',
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    let settled = false
    const finish = (ok: boolean, reason?: string) => {
      if (settled) return
      settled = true
      resolve({ ok, reason })
    }

    // De pagina laat weten hoe hoog hij is; dan pas kunnen we afdrukken.
    const onReady = (_event: Electron.IpcMainEvent, heightPx: number) => {
      if (window.isDestroyed()) return
      if (options.preview) {
        finish(true)
        return
      }
      window.webContents.print(
        {
          silent: true,
          printBackground: false,
          deviceName: options.deviceName,
          margins: { marginType: 'none' },
          pageSize: {
            width: RECEIPT_WIDTH_MICRONS,
            height: receiptHeightMicrons(heightPx)
          }
        },
        (success, failureReason) => {
          finish(success, success ? undefined : failureReason)
          if (!window.isDestroyed()) window.destroy()
        }
      )
    }

    ipcMain.once('receipt:ready', onReady)

    window.webContents.once('did-finish-load', () => {
      window.webContents.send('receipt:data', payload)
    })
    window.on('closed', () => {
      ipcMain.removeListener('receipt:ready', onReady)
      finish(false, 'Het venster werd gesloten voordat er iets is afgedrukt.')
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/receipt.html`)
    } else {
      void window.loadFile(join(__dirname, '../renderer/receipt.html'))
    }

    // Blijft het stil, dan is er iets mis met de pagina zelf.
    setTimeout(() => {
      if (!settled) {
        finish(false, 'Het kaartje kon niet worden opgemaakt.')
        if (!window.isDestroyed() && !options.preview) window.destroy()
      }
    }, 12_000)
  })
}

function careerPayload() {
  return career
    ? { state: career, summary: summarise(career), profiles: listProfiles(userData()) }
    : { state: null, summary: null, profiles: listProfiles(userData()) }
}

function persist(next: CareerState) {
  career = next
  writeProfile(userData(), next)
  return careerPayload()
}

/**
 * Hoeveelste rit van zijn omloop deze rit is.
 *
 * OMSI telt de ritten in de volgorde waarin het lijnbestand ze opsomt, en dat
 * nummer hoort in `[settimetable]`. Alleen op bestandsnaam zoeken is niet
 * genoeg: een omloop rijdt dezelfde rit vaak meerdere keren op een dag.
 */
function tripIndexInTour(duty: Duty): number | undefined {
  const first = duty.legs[0]
  if (!first) return undefined
  const tour = map(duty.mapFolder).tours.find(
    (item) => item.lineFile === duty.lineFile && item.number === duty.tourNumber
  )
  if (!tour) return undefined
  const index = tour.trips.findIndex(
    (trip) =>
      trip.tripFile.toLowerCase() === first.tripFile.toLowerCase() &&
      trip.departure === first.departure
  )
  return index >= 0 ? index : undefined
}

/**
 * Zet de dienst klaar in OMSI: het situatiebestand met de datum, de tijd, de bus
 * bij de eerste halte en de dienstregeling, en daarna het startscherm zo dat die
 * situatie er al staat.
 */
function prepareSituation(
  duty: Duty,
  vehiclePath: string | undefined,
  date: DutyDate | undefined,
  lineNumber: string,
  terminus: string,
  yard?: string
) {
  const when = date ?? dutyDate(duty.mapFolder, duty.days | duty.period)
  if (!when) throw new Error('Geen datum gevonden waarop deze omloop rijdt.')

  const first = duty.legs[0]
  const spawn = vehiclePath ? spawnFor(duty.mapFolder, first?.stopIds[0]) : undefined
  const trip = tripIndexInTour(duty)

  const result = writeSituation(omsi(), {
    mapFolder: duty.mapFolder,
    name: `OMSI Enhancer — lijn ${duty.lineFile}, omloop ${duty.tourNumber}`,
    description: `Vertrek ${formatTime(duty.start)} vanaf ${first?.stops[0] ?? '?'}.`,
    year: when.year,
    dayOfYear: when.dayOfYear,
    // Aanmelden: tien minuten voor vertrek, tijd genoeg voor de IBIS.
    minutes: duty.signOn,
    vehicle: vehiclePath ? { relativePath: vehiclePath, lineNumber, terminus, yard } : undefined,
    spawn,
    timetable: trip !== undefined ? { lineFile: duty.lineFile, tour: duty.tourNumber, trip } : undefined
  })

  // En het startscherm van OMSI erop zetten, zodat Start genoeg is.
  const startup = presetStartup(omsi(), duty.mapFolder, result.file)
  return { ...result, date: when, startup, timetableSet: trip !== undefined }
}

function registerHandlers(): void {
  ipcMain.handle('omsi:status', () => {
    const found = findOmsiInstall()
    omsiPath = found
    return { found: Boolean(found), path: found }
  })

  ipcMain.handle('omsi:maps', (): MapSummary[] =>
    listMaps(omsi()).map((folder) => {
      const loaded = map(folder)
      const time = era(folder)
      return {
        folder,
        name: loaded.name,
        tours: loaded.tours.length,
        hasTemplate: Boolean(findTemplate(omsi(), folder)),
        year: time.year,
        dayOfYear: time.dayOfYear
      }
    })
  )

  ipcMain.handle('omsi:vehicles', () => listVehicles(omsi()))

  /**
   * Halteposities van een kaart. Het doorlezen van de tegels kost een fractie
   * van een seconde tot ruim een seconde, dus eenmaal per kaart.
   */
  ipcMain.handle('map:geometry', (_event, folder: string): MapGeometry => mapGeometry(folder))

  /**
   * De route van elke rit van een dienst, als lijn over de kaart. Eenmaal per
   * rit uitgerekend; het rijstrokennet wordt pas opgebouwd als een rit geen
   * bruikbare route van OMSI zelf heeft.
   */
  ipcMain.handle(
    'map:routes',
    (_event, folder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): TripRoute[] => {
      const loaded = map(folder)
      const geometry = mapGeometry(folder)
      const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))
      return legs.map((leg) => {
        const key = `${folder}|${leg.tripFile}|${leg.stopIds.join(',')}`
        const cached = routeCache.get(key)
        if (cached) return cached
        const stops = leg.stopIds.map((id) => stopAt.get(id)).filter((stop) => stop !== undefined)
        if (stops.length < 2) return { points: [], guessed: [] }
        const route = routeForTrip(loaded.path, omsi(), leg.tripFile, stops, () => laneNetwork(folder))
        routeCache.set(key, route)
        return route
      })
    }
  )

  /*
   * De instellingen en de toetsen van OMSI zelf.
   *
   * OMSI schrijft `options.cfg` en `Inputs\\keyboard.cfg` bij het afsluiten
   * opnieuw. Draait het spel, dan is alles wat hier verandert straks weg, dus
   * dat melden we erbij in plaats van het stilletjes te laten gebeuren.
   */
  ipcMain.handle('game:settings', async () => ({
    values: readGameSettings(omsi()),
    omsiRunning: await isOmsiRunning()
  }))

  ipcMain.handle('game:settings:save', (_event, changes: Record<string, string>) => {
    writeGameSettings(omsi(), changes)
    return readGameSettings(omsi())
  })

  /** De taal van OMSI zelf bepaalt hoe de toetsen en handelingen heten. */
  ipcMain.handle('game:keys', async () => {
    const language = omsiLanguage()
    return {
      bindings: readKeyboard(omsi()),
      keyNames: [...readKeyNames(omsi(), language === 'DEU' ? 'DEU' : 'ENG')],
      labels: [...readActionLabels(omsi(), language)],
      omsiRunning: await isOmsiRunning()
    }
  })

  /**
   * De gamecontrollers. De namen van de handelingen zijn dezelfde als bij het
   * toetsenbord, dus die gaan mee: een knop op je stuur doet hetzelfde als een
   * toets.
   */
  ipcMain.handle('game:controllers', async () => ({
    controllers: readControllers(omsi()),
    labels: [...readActionLabels(omsi(), omsiLanguage())],
    omsiRunning: await isOmsiRunning()
  }))

  ipcMain.handle('game:controllers:save', (_event, controllers: ControllerConfig[]) => {
    writeControllers(omsi(), controllers)
    return readControllers(omsi())
  })

  ipcMain.handle('game:keys:save', (_event, bindings: KeyBinding[]) => {
    writeKeyboard(omsi(), bindings)
    return readKeyboard(omsi())
  })

  /** Terug naar de indeling waarmee OMSI geleverd wordt. */
  ipcMain.handle('game:keys:reset', () => {
    const defaults = readKeyboard(omsi(), true)
    if (defaults.length > 0) writeKeyboard(omsi(), defaults)
    return readKeyboard(omsi())
  })

  /*
   * "Draait OMSI?" betekent: geeft de plugin nu gegevens door. Een live.json van
   * een vorige sessie blijft met alive:true op schijf staan, en daarop afgaan
   * zou het opstartvenster meteen sluiten en de overlay boven een spel hangen
   * dat nog aan het laden is.
   */
  ipcMain.handle('omsi:live', () => Boolean(freshLive()?.alive))

  /** Printers die Windows kent, met de standaardprinter vooraan. */
  ipcMain.handle('print:printers', async (event) => {
    const printers = await event.sender.getPrintersAsync()
    return printers
      .map((printer) => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: printer.isDefault
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
  })

  ipcMain.handle('print:receipt', (_event, payload, deviceName?: string) =>
    printReceipt(withDriver(payload), { deviceName, preview: false })
  )

  ipcMain.handle('print:preview', (_event, payload) =>
    printReceipt(withDriver(payload), { preview: true })
  )

  /**
   * De overlay werkt alleen als de plugin in OMSI staat. Het installatieprogramma
   * zet hem er neer als het Steam via het register vindt; staat OMSI elders, dan
   * gebeurt het hier alsnog.
   */
  ipcMain.handle('plugin:status', () => {
    if (!pluginStatus) {
      pluginStatus = ensurePlugin(
        omsi(),
        pluginSourceDir(process.resourcesPath, app.isPackaged),
        app.isPackaged ? undefined : join(process.cwd(), 'plugin')
      )
    }
    return pluginStatus
  })

  /**
   * Levert een rooster om uit te kiezen. Bij elke dienst wordt een passende bus
   * gezocht — die is een aanbeveling, want de speler laadt zijn bus zelf in OMSI.
   */
  ipcMain.handle('duty:list', (_event, request: DutyRequest): Assignment[] => {
    const window = TIME_WINDOWS[request.window] ?? TIME_WINDOWS.heledag
    const loaded = map(request.mapFolder)
    const net = network(request.mapFolder)
    const { year } = era(request.mapFolder)
    const mapFleet = fleetOf(request.mapFolder)

    // Lukt het binnen het gevraagde dagdeel niet, dan verruimen we stapsgewijs.
    let duties: ReturnType<typeof generateDuties> = []
    for (const tolerance of [undefined, 40, 75]) {
      duties = generateDuties(loaded, net, {
        targetMinutes: request.targetMinutes,
        toleranceMinutes: tolerance,
        earliestStart: window.from,
        latestStart: window.to,
        lineFile: request.lineFile
      })
      if (duties.length > 0) break
    }

    return duties.map((duty) => {
      const choice = pickVehicleForDuty(fleet(), duty, year, mapFleet)
      return {
        duty,
        date: dutyDate(request.mapFolder, duty.days | duty.period),
        vehicle: choice?.vehicle ?? null,
        yard: choice?.yard,
        fit: choice?.fit,
        fromMapFleet: choice?.fromMapFleet,
        alternatives: choice?.alternatives
      }
    })
  })

  ipcMain.handle('duty:ibis', (_event, duty, vehicle, year: number) =>
    buildIbisPlan(omsi(), vehicle.relativePath, duty, year)
  )

  /** De lijnen van een kaart, om er een route mee te kiezen of een examen op te doen. */
  ipcMain.handle('map:lines', (_event, mapFolder: string): LineSummary[] =>
    listLines(map(mapFolder), network(mapFolder))
  )

  /**
   * De examenrit: één rit op de gekozen lijn, met een bus erbij gezocht. Slaagt
   * de kandidaat, dan levert dat de vergunning voor deze lijn op.
   */
  ipcMain.handle('duty:exam', (_event, mapFolder: string, lineFile: string): Assignment | null => {
    const duty = examTrip(map(mapFolder), network(mapFolder), lineFile)
    if (!duty) return null
    const choice = pickVehicleForDuty(fleet(), duty, era(mapFolder).year, fleetOf(mapFolder))
    return {
      duty,
      date: dutyDate(mapFolder, duty.days | duty.period),
      vehicle: choice?.vehicle ?? null,
      yard: choice?.yard,
      fit: choice?.fit,
      fromMapFleet: choice?.fromMapFleet,
      alternatives: choice?.alternatives
    }
  })

  /**
   * Het examen afronden: de gereden rit langs de eisen leggen en het oordeel in
   * het profiel zetten. Geslaagd betekent een vergunning voor deze lijn erbij.
   */
  ipcMain.handle(
    'career:exam',
    (_event, duty: Duty, measured: ExamMeasurement, basic: boolean) => {
      if (!career) return careerPayload()
      const judgement = judgeExam(measured)
      return persist(
        recordExam(career, {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          takenAt: new Date().toISOString(),
          mapFolder: duty.mapFolder,
          mapName: duty.mapName,
          lineFile: duty.lineFile,
          lineNumbers: duty.lineNumbers,
          basic,
          passed: judgement.passed,
          score: judgement.score,
          criteria: judgement.criteria
        })
      )
    }
  )

  /**
   * Vrij rijden: alleen klaarzetten wat de speler zelf heeft samengesteld.
   *
   * Er komt geen dienst aan te pas en er wordt niets geboekt. Kiest hij een
   * lijn, dan zoeken we daar de omloop bij die het dichtst bij zijn tijd
   * vertrekt -- dan staat het dienstregelingsmenu ook meteen goed en heeft de
   * overlay een route om te tekenen.
   */
  ipcMain.handle('free:start', async (_event, request: FreeRequest) => {
    const loaded = map(request.mapFolder)
    const net = network(request.mapFolder)

    const duty = request.lineFile
      ? generateDuty(loaded, net, {
          lineFile: request.lineFile,
          targetMinutes: 90,
          earliestStart: request.minutes - 30,
          latestStart: request.minutes + 120
        })
      : undefined

    const vehiclePath = request.vehiclePath
    const spawnStop = request.stopId ?? duty?.legs[0]?.stopIds[0]
    const spawn = vehiclePath ? spawnFor(request.mapFolder, spawnStop) : undefined
    const trip = duty ? tripIndexInTour(duty) : undefined

    const result = writeSituation(omsi(), {
      mapFolder: request.mapFolder,
      name: 'OMSI Enhancer — vrij rijden',
      description: duty
        ? `Lijn ${duty.lineNumbers.join('/')} vanaf ${formatTime(request.minutes)}.`
        : `Vrij rijden vanaf ${formatTime(request.minutes)}.`,
      year: request.year,
      dayOfYear: request.dayOfYear,
      minutes: request.minutes,
      vehicle: vehiclePath
        ? {
            relativePath: vehiclePath,
            lineNumber: duty?.lineNumbers[0] ?? '',
            terminus: duty?.legs[0]?.terminus ?? '',
            yard: request.yard
          }
        : undefined,
      spawn,
      weather: request.weather,
      timetable:
        duty && trip !== undefined
          ? { lineFile: duty.lineFile, tour: duty.tourNumber, trip }
          : undefined
    })

    const startup = presetStartup(omsi(), request.mapFolder, result.file)
    if (duty) openOverlay(duty)

    let launched = false
    const running = await isOmsiRunning()
    if (!running) {
      try {
        launchOmsi(omsi())
        launched = true
      } catch {
        // Lukt starten niet, dan doet de speler het zelf.
      }
    }
    return { file: result.file, startup, launched, running, duty: duty ?? null }
  })

  /**
   * De chauffeur neemt een dienst aan. Vanaf nu staat hij in het profiel en
   * blijft hij daar tot hij is afgerond of geannuleerd. Een tweede dienst
   * aannemen terwijl er een loopt kan niet.
   */
  ipcMain.handle(
    'duty:confirm',
    (
      _event,
      assignment: Assignment,
      vehicleOverride: string,
      mode?: GameMode,
      exam?: ActiveDuty['exam']
    ) => {
      if (!career || career.activeDuty) return careerPayload()
      return persist({
        ...career,
        activeDuty: {
          assignment,
          vehicleOverride,
          confirmedAt: new Date().toISOString(),
          mode,
          exam
        }
      })
    }
  )

  /** De aangenomen dienst teruggeven, zonder hem in het logboek te zetten. */
  ipcMain.handle('duty:cancel', () => {
    closeOverlay()
    overlayDuty = undefined
    overlayIbis = undefined
    if (!career) return careerPayload()
    return persist({ ...career, activeDuty: undefined })
  })

  /**
   * De dienst begint: overlay openen, het spel starten en de kilometerstand
   * vastleggen. Het klaarzetten hoort hierbij en is geen aparte knop meer: de
   * situatie wordt geschreven en als "Last Situation" klaargezet, en pas daarna
   * gaat het spel aan. Zo hoeft de chauffeur in OMSI alleen op Start te drukken.
   */
  ipcMain.handle('duty:begin', async (_event, request: BeginRequest) => {
    const { duty, ibis } = request
    if (career?.activeDuty && !career.activeDuty.startedAt) {
      persist({ ...career, activeDuty: { ...career.activeDuty, startedAt: new Date().toISOString() } })
    }

    /*
     * Eerst klaarzetten, dan pas starten. Andersom heeft geen zin: OMSI leest
     * het startscherm bij het opstarten, dus wat er daarna nog geschreven wordt
     * ziet het spel deze sessie niet meer.
     */
    let prepared: ReturnType<typeof prepareSituation> | undefined
    let prepareError: string | undefined
    try {
      prepared = prepareSituation(
        duty,
        request.vehiclePath,
        request.date,
        request.lineNumber,
        request.terminus,
        request.yard
      )
    } catch (cause) {
      prepareError = cause instanceof Error ? cause.message : String(cause)
    }

    captureBaseline()
    const live = freshLive()
    /*
     * De overlay gaat pas open als het spel er is. Draait OMSI al met de plugin,
     * dan kan dat nu; anders wacht de app op het venstertje dat meldt dat het
     * spel geladen is, en opent hem daar. Een overlay die boven een leeg
     * bureaublad hangt terwijl OMSI nog aan het laden is, is alleen maar in de
     * weg.
     */
    if (live?.alive) openOverlay(duty, ibis)

    // Het spel erbij starten, tenzij het al draait.
    let launched = false
    const running = await isOmsiRunning()
    if (!running) {
      try {
        launchOmsi(omsi())
        launched = true
      } catch {
        // Lukt starten niet, dan doet de speler het zelf; de overlay staat klaar.
      }
    }
    return { connected: Boolean(live?.alive), launched, running, prepared, prepareError }
  })

  /** Wat er sinds het begin van de dienst gereden is, volgens de plugin. */
  ipcMain.handle('duty:session', () => {
    /*
     * De plugin laat bij het afsluiten een laatste stand achter met alive=false.
     * Die telt gewoon mee: wie het spel sluit voordat hij afrondt, hoort zijn
     * kilometers niet kwijt te zijn.
     */
    captureBaseline()
    const live = readLive()
    const start = baseline()
    if (!live) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: false }
    if (!start) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: true }

    const elapsed = live.time / 60 - start.clockMinutes
    const status = describeLive(live, currentDuty(), start)
    return {
      drivenKm: Math.max(0, live.km + live.metres / 1000 - start.odometerKm),
      elapsedMinutes: elapsed >= 0 ? elapsed : elapsed + 1440,
      delayMinutes: status.delayMinutes,
      harshBrakes: status.harshBrakes,
      harshAccels: status.harshAccels,
      topSpeed: live.topSpeed,
      dutyComplete: status.dutyComplete,
      finished: true
    }
  })

  /**
   * Open of dicht, zoals gevraagd, en niet omgekeerd: een knop die "wisselt"
   * sluit een overlay die de app voor dicht aanzag. Levert de werkelijke stand.
   */
  ipcMain.handle('overlay:set', (_event, duty: Duty | undefined, open: boolean, ibis?: IbisPlan) => {
    if (open && duty) openOverlay(duty, ibis)
    else if (!open) closeOverlay()
    return overlayIsOpen()
  })

  ipcMain.handle('overlay:isOpen', () => overlayIsOpen())

  /** De overlay sluit zichzelf, met de knop in de bewerkstand. */
  ipcMain.handle('overlay:close', () => closeOverlay())

  ipcMain.handle('overlay:edit', (_event, on?: boolean) =>
    setOverlayEdit(on === undefined ? !overlayEditing : on)
  )

  /** De pagina meldt of de muis boven een knop hangt. */
  ipcMain.handle('overlay:hit', (_event, on: boolean) => {
    if (overlayEditing) return
    passMouseThrough(!on)
  })

  ipcMain.handle('settings:read', () => readSettings(userData()))

  ipcMain.handle('settings:write', (_event, settings: Partial<Settings>) => {
    const saved = writeSettings(userData(), settings)
    // Een overlay die al openstaat hoort de nieuwe verversing meteen te volgen.
    if (overlayTimer) {
      clearInterval(overlayTimer)
      overlayTimer = setInterval(pushFrame, OVERLAY_RATES[saved.overlayRate])
    }
    return saved
  })

  ipcMain.handle('overlay:bounds', (_event, box?: { x: number; y: number; w: number; h: number }) => {
    overlayBox = box
    applyOverlayBounds()
  })

  ipcMain.handle('overlay:layout', () => readOverlayLayout(userData()))

  ipcMain.handle('overlay:layout:save', (_event, layout: OverlayLayout) => {
    writeOverlayLayout(userData(), layout)
    return layout
  })

  ipcMain.handle('overlay:layout:reset', () => {
    const layout = defaultLayout()
    writeOverlayLayout(userData(), layout)
    return layout
  })

  ipcMain.handle('career:load', () => careerPayload())

  ipcMain.handle('career:create', (_event, name: string) => persist(createProfile(userData(), name)))

  ipcMain.handle('career:select', (_event, id: string) => {
    const chosen = readProfile(userData(), id)
    if (!chosen) return careerPayload()
    setActive(userData(), id)
    career = chosen
    return careerPayload()
  })

  ipcMain.handle('career:delete', (_event, id: string) => {
    deleteProfile(userData(), id)
    career = resolveActive(userData())
    return careerPayload()
  })

  ipcMain.handle('career:complete', (_event, duty, vehicle: string, measured) => {
    // Een afgeronde dienst heeft geen overlay meer nodig.
    closeOverlay()
    overlayDuty = undefined
    overlayIbis = undefined
    if (!career) return careerPayload()
    return persist(completeDuty(career, duty, vehicle, measured))
  })

  ipcMain.handle('career:rename', (_event, name: string) => {
    if (!career) return careerPayload()
    return persist({ ...career, driver: name.trim() || career.driver })
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#11151c',
    title: 'OMSI Enhancer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  window.on('ready-to-show', () => window.show())
  mainWindow = window

  /*
   * Het hoofdvenster dicht is de app dicht. Zonder dit bleef de app draaien: het
   * overlayvenster telt ook als venster, dus 'window-all-closed' kwam nooit, en
   * de overlay bleef boven het spel hangen zonder knop of taakbalkicoon.
   */
  window.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Een tweede start haalt het venster dat er al is naar voren. */
function bringMainWindowForward(): void {
  // Geen hoofdvenster na het opstarten betekent dat de app al aan het afsluiten
  // is; dan hoort er ook geen nieuw venster meer bij te komen.
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/*
 * Eén exemplaar tegelijk. Twee exemplaren delen dezelfde map in AppData: elk
 * houdt zijn eigen loopbaan in het geheugen en schrijft die bij elke wijziging
 * weg, dus de laatste schrijver wist wat de ander net vastlegde. En elk hangt
 * zijn eigen overlay boven OMSI. Dat gebeurde toen een oude draagbare versie
 * nog naast de geïnstalleerde draaide.
 *
 * Electron legt het slot op de map met gebruikersgegevens, precies de plek die
 * we willen beschermen. Wie het slot niet krijgt, opent niets en stopt.
 */
/**
 * Chauffeurs meenemen uit de tijd dat de app OMSI Career heette.
 *
 * Electron leidt de map met gebruikersgegevens af van de naam in package.json,
 * dus met de nieuwe naam kijkt de app naar een lege map en zou iedereen zijn
 * logboek kwijt zijn. Kopiëren en niet verplaatsen: wie de oude versie nog eens
 * start, vindt daar nog gewoon zijn profielen.
 */
function adoptOldProfiles(): void {
  const now = userData()
  const before = join(dirname(now), 'omsi-career')
  if (now === before || existsSync(join(now, 'profiles')) || !existsSync(join(before, 'profiles'))) {
    return
  }
  try {
    cpSync(before, now, { recursive: true })
  } catch {
    // Lukt het niet, dan begint de chauffeur met een leeg logboek; niets breekt.
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', bringMainWindowForward)

  app.whenReady().then(() => {
    adoptOldProfiles()
    career = resolveActive(userData())
    registerHandlers()
    createWindow()

    // Onder het rijden zit je niet met de muis in de app. Deze toets zet de
    // overlay in de bewerkstand en er weer uit; hij botst niet met OMSI, dat
    // Ctrl+Alt zelf nergens voor gebruikt.
    globalShortcut.register('Control+Alt+O', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) setOverlayEdit(!overlayEditing)
    })

    // Een stand verder in het dienstpaneel: beknopt, normaal, uitgebreid.
    globalShortcut.register('Control+Alt+V', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('overlay:cycle')
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', closeOverlay)

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
