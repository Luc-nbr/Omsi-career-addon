import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, type IpcMain } from 'electron'

/**
 * DE FOTO V4: DE TEGELFOTO UIT DE 3D-RENDERER (bus3d-ontwerp §4.5, §9)
 *
 * Achter de schakelaar `bus3d` (tot F3): dan vraagt `bus:foto` deze foto in
 * plaats van de v3b. Zonder schakelaar verandert er niets: de v3b blijft.
 *
 * Een verborgen venster laadt `bus3d.html?foto=1` met de preload `bus3d`, en
 * tekent met dezelfde renderer als het 3D-venster (bus3d/fotomodus.ts): 640x400
 * WebP, doorzichtig, 215°/8°, strak op 88% van de breedte, met alleen de
 * contactschaduw als alfa zodat hij op elke tegelkleur past. Het venster haalt
 * zijn pakket zelf op, net als het 3D-venster, en ontwart gehusselde blokken in
 * het geheugen; de foto is een plaatje en geen meetkunde, dus hij mag op schijf.
 *
 * Eén foto tegelijk, in een rij. Het venster gaat 60 s na de laatste foto
 * dicht: zo houdt het geen WebGL-context en geen GPU-geheugen vast naast OMSI.
 * Een bus zonder model of versleuteld met een sleutel die hier niet geregistreerd
 * is, krijgt een `.geen` naast de foto's: dan wordt het niet elke keer opnieuw
 * geprobeerd (zoals bij v3).
 */

export const FOTO_V4 = { breedte: 640, hoogte: 400 }
const RUST_MS = 60_000
const TIJD_MS = 45_000

export interface Busfoto4Afhankelijk {
  userData: () => string
  preload: string
  /** De pagina `bus3d.html` (zonder zoekdeel; `?foto=1` komt er hier bij). */
  pagina: { url?: string; bestand?: string }
  omsiDraait: () => boolean
  log: (regel: string) => void
}

export interface Busfoto4 {
  /** De foto (pad naar het bestand), van schijf of nieuw getekend; niets als het niet kon. */
  foto(relatiefPad: string, kleurstelling?: string): Promise<string | undefined>
  /** Staat hij er al (of staat vast dat hij er niet komt)? Zonder te tekenen. */
  bestaand(relatiefPad: string, kleurstelling?: string): string | undefined
  map(): string
  sluit(): void
}

/** Waar de foto's v4 staan. */
export function busfoto4Map(userData: string): string {
  return join(userData, 'busfotos', 'v4')
}

/** Dezelfde naamregel als v3 (main/busfoto.ts), met .webp. */
function bestandsnaam(relatiefPad: string, kleurstelling?: string): string {
  const sleutel = kleurstelling ? `${relatiefPad.toLowerCase()}|${kleurstelling}` : relatiefPad.toLowerCase()
  return createHash('sha1').update(sleutel).digest('hex').slice(0, 16)
}

export function maakBusfoto4(ipcMain: IpcMain, af: Busfoto4Afhankelijk): Busfoto4 {
  let venster: BrowserWindow | undefined
  /** Klaar als de pagina van het venster geladen is: pas dan luistert hij naar fotovragen. */
  let geladen: Promise<void> = Promise.resolve()
  let rij: Promise<unknown> = Promise.resolve()
  let volgende = 0
  const wachtend = new Map<number, (u: { webp?: Uint8Array; reden?: string }) => void>()
  let rust: ReturnType<typeof setTimeout> | undefined

  ipcMain.on('bus3d:fotoKlaar', (e, id: unknown, uitkomst: unknown) => {
    if (!venster || venster.isDestroyed() || e.sender !== venster.webContents) return
    const k = typeof id === 'number' ? wachtend.get(id) : undefined
    if (!k) return
    wachtend.delete(id as number)
    const u = (uitkomst ?? {}) as { webp?: unknown; reden?: unknown }
    if (u.webp instanceof Uint8Array) k({ webp: u.webp })
    else k({ reden: typeof u.reden === 'string' ? u.reden.slice(0, 200) : 'fout' })
  })

  function maakVenster(): BrowserWindow {
    if (venster && !venster.isDestroyed()) return venster
    const w = new BrowserWindow({
      width: FOTO_V4.breedte,
      height: FOTO_V4.hoogte,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: af.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Niet afknijpen: een verborgen venster zou anders op elk beeld wachten (zie main/busfoto.ts).
        backgroundThrottling: false
      }
    })
    w.on('closed', () => {
      if (venster === w) venster = undefined
      for (const [id, k] of wachtend) {
        wachtend.delete(id)
        k({ reden: 'venster weg' })
      }
    })
    w.webContents.on('render-process-gone', (_e, d) => af.log(`busfoto v4: FOUT venster weg: ${d.reason}`))
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    // Klaar als de pagina zegt dat ze luistert (bus3d/fotomodus.ts laadt na de pagina zelf).
    geladen = new Promise<void>((k) => w.webContents.ipc.once('bus3d:fotoGereed', () => k()))
    if (af.pagina.url) void w.loadURL(`${af.pagina.url}?foto=1`)
    else if (af.pagina.bestand) void w.loadFile(af.pagina.bestand, { query: { foto: '1' } })
    venster = w
    return w
  }

  function sluit(): void {
    if (rust) clearTimeout(rust)
    rust = undefined
    if (venster && !venster.isDestroyed()) venster.destroy()
    venster = undefined
  }

  function bestaand(relatiefPad: string, kleurstelling?: string): string | undefined {
    const pad = join(busfoto4Map(af.userData()), `${bestandsnaam(relatiefPad, kleurstelling)}.webp`)
    return existsSync(pad) ? pad : undefined
  }

  async function teken(relatiefPad: string, kleurstelling: string | undefined): Promise<string | undefined> {
    const map = busfoto4Map(af.userData())
    const naam = bestandsnaam(relatiefPad, kleurstelling)
    const doel = join(map, `${naam}.webp`)
    const geen = join(map, `${naam}.geen`)
    if (existsSync(doel)) return doel
    if (existsSync(geen)) return undefined
    if (rust) clearTimeout(rust)
    const w = maakVenster()
    await geladen
    if (w.isDestroyed()) return undefined
    const id = ++volgende
    const t0 = Date.now()
    const uit = await new Promise<{ webp?: Uint8Array; reden?: string }>((k) => {
      wachtend.set(id, k)
      const klok = setTimeout(() => {
        if (!wachtend.has(id)) return
        wachtend.delete(id)
        k({ reden: 'tijd' })
        // Een venster dat niet meer antwoordt: weg, de volgende vraag maakt een nieuw.
        sluit()
      }, TIJD_MS)
      klok.unref?.()
      w.webContents.send('bus3d:fotoVraag', {
        id,
        relatiefPad,
        kleurstelling,
        b: FOTO_V4.breedte,
        h: FOTO_V4.hoogte,
        licht: af.omsiDraait()
      })
    })
    rust = setTimeout(sluit, RUST_MS)
    rust.unref?.()
    if (!uit.webp) {
      af.log(`busfoto v4 ${relatiefPad}${kleurstelling ? ` (${kleurstelling})` : ''}: geen foto (${uit.reden})`)
      // Alleen als vaststaat dat het nooit lukt; een fout of de tijd kan de volgende keer wel.
      if (uit.reden === 'geen-model' || uit.reden === 'versleuteld') {
        mkdirSync(map, { recursive: true })
        writeFileSync(geen, '')
      }
      return undefined
    }
    const b = uit.webp
    const isWebp = b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45
    if (!isWebp) return undefined
    mkdirSync(map, { recursive: true })
    const tijdelijk = `${doel}.${process.pid}.bezig`
    writeFileSync(tijdelijk, b)
    renameSync(tijdelijk, doel)
    af.log(`busfoto v4 ${relatiefPad}${kleurstelling ? ` (${kleurstelling})` : ''}: ${(b.length / 1024).toFixed(0)} kB in ${Date.now() - t0} ms`)
    return doel
  }

  return {
    foto: (relatiefPad, kleurstelling) => {
      const pad = String(relatiefPad ?? '')
      if (!/\.bus$/i.test(pad)) return Promise.resolve(undefined)
      const volgendeFoto = rij.then(() => teken(pad, kleurstelling || undefined))
      rij = volgendeFoto.catch(() => undefined)
      return volgendeFoto.catch(() => undefined)
    },
    bestaand: (relatiefPad, kleurstelling) => bestaand(String(relatiefPad ?? ''), kleurstelling || undefined),
    map: () => busfoto4Map(af.userData()),
    sluit
  }
}
