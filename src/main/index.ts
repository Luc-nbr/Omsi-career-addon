import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { completeDuty, loadCareer, saveCareer, summarise, type CareerState } from '../core/career'
import { buildNetwork, generateDuty, SIGN_ON_MINUTES, type Network } from '../core/duty'
import { buildFleetIndex, pickVehicleForDuty, readMapFleet, type FleetIndex } from '../core/fleet'
import { buildIbisPlan } from '../core/ibis'
import { describeLive, readLive } from '../core/live'
import { findOmsiInstall } from '../core/install'
import { launchOmsi } from '../core/launch'
import { findTemplate, readSituationTime, writeSituation } from '../core/situation'
import { compareSession, readMapSession, type SessionState } from '../core/session'
import { listMaps, loadMap } from '../core/timetable'
import { listVehicles } from '../core/vehicles'
import type { Duty, OmsiMap } from '../core/types'
import {
  TIME_WINDOWS,
  type Assignment,
  type DutyRequest,
  type LaunchRequest,
  type MapSummary
} from '../shared/api'
import { dayOfYearForDays } from '../shared/format'

/** Kaarten inlezen kost merkbaar tijd, dus we doen het één keer per sessie. */
const mapCache = new Map<string, OmsiMap>()
const networkCache = new Map<string, Network>()
const mapFleetCache = new Map<string, Set<string>>()
const mapEraCache = new Map<string, { year: number; dayOfYear: number }>()
let fleetIndex: FleetIndex | undefined
/**
 * Nulmeting bij het starten van een dienst. OMSI schrijft laststn.osn pas bij
 * het afsluiten, dus door voor en na te lezen weten we wat er werkelijk gereden
 * is - zonder plugin en zonder dat de speler cijfers moet invoeren.
 */
let pending: { mapFolder: string; situationName: string; before: SessionState } | undefined
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

/** Het tijdvak waarin een kaart speelt, overgenomen uit haar situatiebestand. */
function era(folder: string): { year: number; dayOfYear: number } {
  const cached = mapEraCache.get(folder)
  if (cached) return cached
  const template = findTemplate(omsi(), folder)
  const time = (template && readSituationTime(template)) || {
    year: new Date().getFullYear(),
    dayOfYear: 180
  }
  mapEraCache.set(folder, time)
  return time
}

function fleet(): FleetIndex {
  if (!fleetIndex) fleetIndex = buildFleetIndex(omsi())
  return fleetIndex
}

/** De naam die de situatie krijgt; ook de sleutel om hem later te herkennen. */
function situationName(duty: { tourNumber: string; lineNumbers: string[] }): string {
  return `Dienst ${duty.tourNumber} — lijn ${duty.lineNumbers.join('/')}`
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
   * Een toewijzing is dienst plus bus. De bus wordt erbij gezocht zodra de
   * dienst er is, want pas dan weten we welke eindbestemmingen hij moet kunnen
   * tonen.
   */
  ipcMain.handle('duty:generate', (_event, request: DutyRequest): Assignment | null => {
    const window = TIME_WINDOWS[request.window] ?? TIME_WINDOWS.heledag
    const loaded = map(request.mapFolder)
    const net = network(request.mapFolder)

    // Lukt het binnen het gevraagde dagdeel niet, dan verruimen we stapsgewijs.
    let duty
    for (const tolerance of [undefined, 40, 75]) {
      duty = generateDuty(loaded, net, {
        targetMinutes: request.targetMinutes,
        toleranceMinutes: tolerance,
        earliestStart: window.from,
        latestStart: window.to
      })
      if (duty) break
    }
    if (!duty) return null

    const { year } = era(request.mapFolder)
    const choice = pickVehicleForDuty(fleet(), duty, year, fleetOf(request.mapFolder))
    return {
      duty,
      vehicle: choice?.vehicle ?? null,
      yard: choice?.yard,
      fit: choice?.fit,
      fromMapFleet: choice?.fromMapFleet,
      alternatives: choice?.alternatives
    }
  })

  ipcMain.handle('duty:ibis', (_event, duty, vehicle, year: number) =>
    buildIbisPlan(omsi(), vehicle.relativePath, duty, year)
  )

  ipcMain.handle('duty:launch', (_event, request: LaunchRequest) => {
    const { duty, vehicle } = request
    const { year } = era(duty.mapFolder)
    /**
     * Het wagenpark moet altijd meegeschreven worden. Blijft het leeg, dan
     * houdt de bus het wagenpark van het sjabloon - en dat is zomaar Grundorf
     * op een Berlijnse dienst, waarna de getoonde codes nergens op slaan.
     */
    const yard =
      request.yard ?? buildIbisPlan(omsi(), vehicle.relativePath, duty, year).yard
    /**
     * De dienst rijdt alleen op bepaalde dagen, dus de datum in het spel moet
     * een dag zijn waarop dat klopt. Anders staat de dienstregeling er wel,
     * maar rijdt het omliggende verkeer een ander patroon.
     */
    const dayOfYear = dayOfYearForDays(request.year, request.dayOfYear, duty.days)

    const result = writeSituation(omsi(), {
      mapFolder: duty.mapFolder,
      name: situationName(duty),
      description:
        `${duty.legs.length} ritten vanaf ${duty.depot || 'de remise'}, ` +
        `aanmelden om ${String(Math.floor(duty.signOn / 60) % 24).padStart(2, '0')}:` +
        `${String(duty.signOn % 60).padStart(2, '0')}.`,
      year: request.year,
      dayOfYear,
      minutes: duty.start - SIGN_ON_MINUTES,
      vehicle: {
        relativePath: vehicle.relativePath,
        lineNumber: duty.lineNumbers[0] ?? '',
        terminus: duty.legs[0]?.terminus ?? '',
        yard
      }
    })

    // Nulmeting: de situatie zoals wij hem net hebben weggeschreven.
    const before = readMapSession(omsi(), duty.mapFolder)
    pending = before
      ? { mapFolder: duty.mapFolder, situationName: situationName(duty), before }
      : undefined

    launchOmsi({ omsiPath: omsi(), mapFolder: duty.mapFolder, windowed: request.windowed })
    return result
  })

  /**
   * Vergelijkt de huidige situatie met de nulmeting. Zolang OMSI het bestand
   * niet heeft overschreven, is de sessie nog niet afgesloten en zegt het niets.
   */
  ipcMain.handle('duty:session', () => {
    if (!pending) return null
    return compareSession(
      pending.before,
      readMapSession(omsi(), pending.mapFolder),
      pending.situationName
    )
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
