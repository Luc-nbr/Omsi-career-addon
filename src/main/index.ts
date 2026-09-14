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
import { readMapGeometry, type MapGeometry } from '../core/geo'
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
let fleetIndex: FleetIndex | undefined
/**
 * Nulmeting bij het begin van een dienst, gelezen uit de live gegevens van de
 * plugin. Het verschil met de stand aan het eind is wat er werkelijk gereden is.
 */
let pending:
  | { odometerKm: number; clockMinutes: number; harshBrakes: number; harshAccels: number }
  | undefined
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

function pushFrame(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const live = readLive()
  overlayWindow.webContents.send('overlay:frame', {
    connected: Boolean(live?.alive),
    status: live ? describeLive(live, overlayDuty, pending) : undefined,
    duty: overlayDuty,
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

function closeOverlay(): void {
  if (overlayTimer) clearInterval(overlayTimer)
  overlayTimer = undefined
  overlayEditing = false
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
  overlayWindow = null
}

function openOverlay(duty: Duty): void {
  overlayDuty = duty
  if (overlayWindow && !overlayWindow.isDestroyed()) return

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
    overlayWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  overlayTimer = setInterval(pushFrame, 200)
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
  ipcMain.handle('map:geometry', (_event, folder: string): MapGeometry => {
    const cached = geometryCache.get(folder)
    if (cached) return cached
    const loaded = map(folder)
    const ids = new Set<string>(loaded.stops.keys())
    for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
    const geometry = readMapGeometry(loaded.path, ids, omsi())
    // Busstops.cfg is de bron voor de namen; wat er in de tegel staat is de
    // naam van het object en heet lang niet altijd naar de halte.
    for (const stop of geometry.stops) {
      const known = loaded.stops.get(stop.id)
      if (known?.name) stop.name = known.name
    }
    geometryCache.set(folder, geometry)
    return geometry
  })

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
   * De dienst begint: overlay openen en de kilometerstand vastleggen. De app
   * schrijft niets in de spelmap — de speler heeft zijn bus en kaart zelf al
   * geladen, wij geven alleen de instructies.
   */
  ipcMain.handle('duty:begin', async (_event, duty: Duty) => {
    const live = readLive()
    pending = live
      ? {
          odometerKm: live.km + live.metres / 1000,
          clockMinutes: live.time / 60,
          harshBrakes: live.harshBrakes,
          harshAccels: live.harshAccels
        }
      : undefined
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
    const live = readLive()
    if (!live) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: false }
    if (!pending) return { drivenKm: 0, elapsedMinutes: 0, dutyComplete: false, finished: true }

    const elapsed = live.time / 60 - pending.clockMinutes
    const status = describeLive(live, overlayDuty, pending)
    return {
      drivenKm: Math.max(0, live.km + live.metres / 1000 - pending.odometerKm),
      elapsedMinutes: elapsed >= 0 ? elapsed : elapsed + 1440,
      delayMinutes: status.delayMinutes,
      harshBrakes: status.harshBrakes,
      harshAccels: status.harshAccels,
      topSpeed: live.topSpeed,
      dutyComplete: status.dutyComplete,
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
    if (!career) return careerPayload()
    pending = undefined
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
