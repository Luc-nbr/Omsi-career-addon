import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { completeDuty, loadCareer, saveCareer, summarise, type CareerState } from '../core/career'
import { generateDuty, SIGN_ON_MINUTES } from '../core/duty'
import { buildIbisPlan } from '../core/ibis'
import { findOmsiInstall } from '../core/install'
import { launchOmsi } from '../core/launch'
import { findTemplate, readSituationTime, writeSituation } from '../core/situation'
import { listMaps, loadMap } from '../core/timetable'
import { listVehicles } from '../core/vehicles'
import type { OmsiMap } from '../core/types'
import { TIME_WINDOWS, type DutyRequest, type LaunchRequest, type MapSummary } from '../shared/api'

/** Kaarten inlezen kost merkbaar tijd, dus we doen het één keer per sessie. */
const mapCache = new Map<string, OmsiMap>()
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
      const template = findTemplate(omsi(), folder)
      const time = template ? readSituationTime(template) : undefined
      const today = new Date()
      return {
        folder,
        name: loaded.name,
        tours: loaded.tours.length,
        hasTemplate: Boolean(template),
        year: time?.year ?? today.getFullYear(),
        dayOfYear: time?.dayOfYear ?? 180
      }
    })
  )

  ipcMain.handle('omsi:vehicles', () => listVehicles(omsi()))

  ipcMain.handle('duty:generate', (_event, request: DutyRequest) => {
    const window = TIME_WINDOWS[request.window] ?? TIME_WINDOWS.heledag
    const loaded = map(request.mapFolder)
    // Lukt het binnen het gevraagde dagdeel niet, dan verruimen we stapsgewijs
    // de tolerantie voordat we opgeven.
    for (const tolerance of [20, 40, 75]) {
      const duty = generateDuty(loaded, {
        targetMinutes: request.targetMinutes,
        toleranceMinutes: tolerance,
        earliestStart: window.from,
        latestStart: window.to
      })
      if (duty) return duty
    }
    return null
  })

  ipcMain.handle('duty:ibis', (_event, duty, vehicle, year: number) =>
    buildIbisPlan(omsi(), vehicle.relativePath, duty, year)
  )

  ipcMain.handle('duty:launch', (_event, request: LaunchRequest) => {
    const { duty, vehicle } = request
    const result = writeSituation(omsi(), {
      mapFolder: duty.mapFolder,
      name: `Dienst ${duty.tourNumber} — lijn ${duty.lineNumbers.join('/')}`,
      description:
        `Omloop ${duty.tourNumber} vanaf ${duty.depot || 'de remise'}. ` +
        `${duty.legs.length} ritten, aanmelden om ${String(Math.floor(duty.signOn / 60) % 24).padStart(2, '0')}:` +
        `${String(duty.signOn % 60).padStart(2, '0')}.`,
      year: request.year,
      dayOfYear: request.dayOfYear,
      minutes: duty.start - SIGN_ON_MINUTES,
      vehicle: {
        relativePath: vehicle.relativePath,
        lineNumber: duty.lineNumbers[0] ?? '',
        terminus: duty.legs[0]?.terminus ?? '',
        yard: request.yard
      }
    })
    launchOmsi({ omsiPath: omsi(), mapFolder: duty.mapFolder, windowed: request.windowed })
    return result
  })

  ipcMain.handle('career:load', () => careerPayload())

  ipcMain.handle('career:complete', (_event, duty, vehicle: string) => {
    career = completeDuty(career, duty, vehicle)
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
