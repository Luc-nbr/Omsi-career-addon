import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { completeDuty, summarise, type CareerState } from '../core/career'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  readProfile,
  resolveActive,
  setActive,
  writeProfile
} from '../core/profiles'
import { buildNetwork, generateDuties, type Network } from '../core/duty'
import { buildFleetIndex, pickVehicleForDuty, readMapFleet, type FleetIndex } from '../core/fleet'
import { readMapData, type Lane, type MapGeometry } from '../core/geo'
import { LaneNetwork, routeForTrip } from '../core/routing'
import { VehicleTracker, type VehiclePosition } from '../core/vehicle'
import { buildIbisPlan } from '../core/ibis'
import { describeLive, readLive } from '../core/live'
import { findOmsiInstall } from '../core/install'
import { isOmsiRunning, launchOmsi } from '../core/launch'
import { ensurePlugin, pluginSourceDir, type PluginStatus } from '../core/pluginInstall'
import { readOverlayLayout, writeOverlayLayout } from '../core/overlayLayout'
import { receiptHeightMicrons, RECEIPT_WIDTH_MICRONS } from '../core/receipt'
import { readSettings, writeSettings, type Settings } from '../core/settings'
import { findTemplate, readSituationTime } from '../core/situation'
import { listMaps, loadMap } from '../core/timetable'
import { listVehicles } from '../core/vehicles'
import type { Duty, OmsiMap } from '../core/types'
import { TIME_WINDOWS, type Assignment, type DutyRequest, type MapSummary } from '../shared/api'
import { defaultLayout, type OverlayLayout } from '../shared/overlay'

/** Kaarten inlezen kost merkbaar tijd, dus we doen het één keer per sessie. */
const mapCache = new Map<string, OmsiMap>()
const networkCache = new Map<string, Network>()
const mapFleetCache = new Map<string, Set<string>>()
const mapEraCache = new Map<string, { year: number; dayOfYear: number }>()
const geometryCache = new Map<string, MapGeometry>()
const laneCache = new Map<string, Lane[]>()
const laneNetworkCache = new Map<string, LaneNetwork>()
const routeCache = new Map<string, number[]>()
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
/**
 * In de bewerkstand kun je de vensters verslepen. Dat kan niet altijd aanstaan:
 * een venster dat muisklikken aanneemt, pakt ook de aandacht af van OMSI, en
 * dan staat je stuur stil. Dus normaal laat de overlay alles door en alleen als
 * je hem aanpast niet.
 */
let overlayEditing = false

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
function captureBaseline(): void {
  const active = career?.activeDuty
  if (!career || !active?.startedAt || active.baseline) return
  const live = freshLive()
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

function pushFrame(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  captureBaseline()
  const live = readLive()
  const duty = currentDuty()
  overlayWindow.webContents.send('overlay:frame', {
    connected: Boolean(live?.alive),
    status: live ? describeLive(live, duty, baseline()) : undefined,
    vehicle: vehicleOnMap(live, duty),
    duty,
    editing: overlayEditing
  })
}

function setOverlayEdit(on: boolean): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false
  overlayEditing = on
  passMouseThrough(!on)
  overlayWindow.setFocusable(on)
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

function openOverlay(duty: Duty): void {
  overlayDuty = duty
  if (overlayIsOpen()) return

  // Het venster beslaat het hele scherm, zodat je een paneel overal neer kunt
  // zetten. Wat niet beschilderd is, is doorzichtig en laat klikken door.
  const area = screen.getPrimaryDisplay().workArea

  overlayWindow = new BrowserWindow({
    width: area.width,
    height: area.height,
    x: area.x,
    y: area.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
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

  // Even vaak als de plugin schrijft: de kaart rijdt mee, en haperen valt op.
  overlayTimer = setInterval(pushFrame, 100)
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
    (_event, folder: string, legs: Array<{ tripFile: string; stopIds: string[] }>): number[][] => {
      const loaded = map(folder)
      const geometry = mapGeometry(folder)
      const stopAt = new Map(geometry.stops.map((stop) => [stop.id, stop]))
      return legs.map((leg) => {
        const key = `${folder}|${leg.tripFile}|${leg.stopIds.join(',')}`
        const cached = routeCache.get(key)
        if (cached) return cached
        const stops = leg.stopIds.map((id) => stopAt.get(id)).filter((stop) => stop !== undefined)
        if (stops.length < 2) return []
        const route = routeForTrip(loaded.path, omsi(), leg.tripFile, stops, () => laneNetwork(folder))
        routeCache.set(key, route)
        return route
      })
    }
  )

  ipcMain.handle('omsi:live', () => Boolean(readLive()?.alive))

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
        latestStart: window.to
      })
      if (duties.length > 0) break
    }

    return duties.map((duty) => {
      const choice = pickVehicleForDuty(fleet(), duty, year, mapFleet)
      return {
        duty,
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

  /**
   * De chauffeur neemt een dienst aan. Vanaf nu staat hij in het profiel en
   * blijft hij daar tot hij is afgerond of geannuleerd. Een tweede dienst
   * aannemen terwijl er een loopt kan niet.
   */
  ipcMain.handle('duty:confirm', (_event, assignment: Assignment, vehicleOverride: string) => {
    if (!career || career.activeDuty) return careerPayload()
    return persist({
      ...career,
      activeDuty: { assignment, vehicleOverride, confirmedAt: new Date().toISOString() }
    })
  })

  /** De aangenomen dienst teruggeven, zonder hem in het logboek te zetten. */
  ipcMain.handle('duty:cancel', () => {
    closeOverlay()
    overlayDuty = undefined
    if (!career) return careerPayload()
    return persist({ ...career, activeDuty: undefined })
  })

  /**
   * De dienst begint: overlay openen, het spel starten en de kilometerstand
   * vastleggen. De app schrijft niets in de spelmap — de speler laadt zijn bus
   * en kaart zelf, wij geven de instructies.
   */
  ipcMain.handle('duty:begin', async (_event, duty: Duty) => {
    if (career?.activeDuty && !career.activeDuty.startedAt) {
      persist({ ...career, activeDuty: { ...career.activeDuty, startedAt: new Date().toISOString() } })
    }
    captureBaseline()
    const live = freshLive()
    openOverlay(duty)

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
    return { connected: Boolean(live?.alive), launched, running }
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
  ipcMain.handle('overlay:set', (_event, duty: Duty | undefined, open: boolean) => {
    if (open && duty) openOverlay(duty)
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

  ipcMain.handle('settings:write', (_event, settings: Settings) =>
    writeSettings(userData(), settings)
  )

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
    title: 'OMSI Career',
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

app.whenReady().then(() => {
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
