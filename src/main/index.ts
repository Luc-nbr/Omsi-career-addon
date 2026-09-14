import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { completeDuty, loadCareer, saveCareer, summarise, type CareerState } from '../core/career'
import { buildNetwork, generateDuties, type Network } from '../core/duty'
import { buildFleetIndex, pickVehicleForDuty, readMapFleet, type FleetIndex } from '../core/fleet'
import { buildIbisPlan } from '../core/ibis'
import { describeLive, readLive } from '../core/live'
import { findOmsiInstall } from '../core/install'
import { findTemplate, readSituationTime } from '../core/situation'
import { listMaps, loadMap } from '../core/timetable'
import { listVehicles } from '../core/vehicles'
import type { Duty, OmsiMap } from '../core/types'
import { TIME_WINDOWS, type Assignment, type DutyRequest, type MapSummary } from '../shared/api'

/** Kaarten inlezen kost merkbaar tijd, dus we doen het één keer per sessie. */
const mapCache = new Map<string, OmsiMap>()
const networkCache = new Map<string, Network>()
const mapFleetCache = new Map<string, Set<string>>()
const mapEraCache = new Map<string, { year: number; dayOfYear: number }>()
let fleetIndex: FleetIndex | undefined
/**
 * Nulmeting bij het begin van een dienst, gelezen uit de live gegevens van de
 * plugin. Het verschil met de stand aan het eind is wat er werkelijk gereden is.
 */
let pending: { odometerKm: number; clockMinutes: number } | undefined
let omsiPath: string | undefined
let career: CareerState

const careerFile = () => join(app.getPath('userData'), 'career.json')

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

function pushFrame(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const live = readLive()
  overlayWindow.webContents.send('overlay:frame', {
    connected: Boolean(live?.alive),
    status: live ? describeLive(live, overlayDuty) : undefined,
    duty: overlayDuty
  })
}

function closeOverlay(): void {
  if (overlayTimer) clearInterval(overlayTimer)
  overlayTimer = undefined
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
}

function openOverlay(duty: Duty): void {
  overlayDuty = duty
  if (overlayWindow && !overlayWindow.isDestroyed()) return

  overlayWindow = new BrowserWindow({
    width: 330,
    height: 320,
    x: 24,
    y: 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
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
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  overlayTimer = setInterval(pushFrame, 200)
}

function careerPayload() {
  return { state: career, summary: summarise(career) }
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
   * De dienst begint: overlay openen en de kilometerstand vastleggen. De app
   * schrijft niets in de spelmap — de speler heeft zijn bus en kaart zelf al
   * geladen, wij geven alleen de instructies.
   */
  ipcMain.handle('duty:begin', (_event, duty: Duty) => {
    const live = readLive()
    pending = live
      ? { odometerKm: live.km + live.metres / 1000, clockMinutes: live.time / 60 }
      : undefined
    openOverlay(duty)
    return { connected: Boolean(live?.alive) }
  })

  /** Wat er sinds het begin van de dienst gereden is, volgens de plugin. */
  ipcMain.handle('duty:session', () => {
    const live = readLive()
    if (!live?.alive) return { drivenKm: 0, elapsedMinutes: 0, finished: false }
    if (!pending) return { drivenKm: 0, elapsedMinutes: 0, finished: true }

    const elapsed = live.time / 60 - pending.clockMinutes
    return {
      drivenKm: Math.max(0, live.km + live.metres / 1000 - pending.odometerKm),
      elapsedMinutes: elapsed >= 0 ? elapsed : elapsed + 1440,
      delayMinutes: describeLive(live).delayMinutes,
      finished: true
    }
  })

  ipcMain.handle('overlay:toggle', (_event, duty: Duty) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      closeOverlay()
      return false
    }
    openOverlay(duty)
    return true
  })

  ipcMain.handle('career:load', () => careerPayload())

  ipcMain.handle('career:complete', (_event, duty, vehicle: string, measured) => {
    career = completeDuty(career, duty, vehicle, measured)
    pending = undefined
    saveCareer(careerFile(), career)
    return careerPayload()
  })

  ipcMain.handle('career:rename', (_event, name: string) => {
    career = { ...career, driver: name.trim() || career.driver }
    saveCareer(careerFile(), career)
    return careerPayload()
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

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  career = loadCareer(careerFile())
  registerHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', closeOverlay)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
