import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { bouwBusTekening } from '../core/busbeeld'
import { log, logFout } from '../core/logboek'

/**
 * Een foto van een bus maken, in een venster dat niemand ziet.
 *
 * WAAROM ZO
 * Tekenen vraagt een tekenkaart, en die zit in Electron aan een venster. Dus
 * staat hier een verborgen venster dat één ding doet: een tekening ontvangen en
 * er een PNG van maken. Het hoofdproces leest de modellen (dat is gewoon
 * bestandswerk) en bewaart het plaatje daarna op schijf, want het is duur: het
 * uitlezen van de honderden onderdelen van één bus kostte gemeten 266 tot 1092
 * ms, en een bus levert 19.000 tot 419.000 driehoeken.
 *
 * Eén venster voor alle bussen, en één tekening tegelijk. Het gaat om schijf en
 * geheugen, niet om rekenkracht: twee bussen tegelijk tekenen maakt het voor
 * niemand sneller, en een tweede venster kost nog eens een tekenkaartcontext.
 */

/** Waar de foto's komen te staan. */
export function busfotoMap(userData: string): string {
  return join(userData, 'busfotos')
}

/** De naam van de foto van deze bus; het pad bepaalt hem, zodat hij terug te vinden is. */
function bestandsnaam(relatiefPad: string): string {
  return `${createHash('sha1').update(relatiefPad.toLowerCase()).digest('hex').slice(0, 16)}.png`
}

let venster: BrowserWindow | undefined
let bezig: Promise<unknown> = Promise.resolve()

function maakVenster(preload: string, pagina: { url?: string; bestand?: string }): BrowserWindow {
  if (venster && !venster.isDestroyed()) return venster
  venster = new BrowserWindow({
    width: 640,
    height: 480,
    show: false,
    /*
     * `paintWhenInitiallyHidden` moet aan: een venster dat nooit getoond wordt
     * tekent anders niets, en dan komt er een leeg beeld terug.
     */
    paintWhenInitiallyHidden: true,
    webPreferences: { preload, sandbox: false, offscreen: false }
  })
  venster.on('closed', () => {
    venster = undefined
  })
  if (pagina.url) void venster.loadURL(pagina.url)
  else if (pagina.bestand) void venster.loadFile(pagina.bestand)
  return venster
}

interface FotoOpdracht {
  /** Volledig pad naar het .bus-bestand. */
  busPad: string
  /** Pad vanaf de OMSI-map; bepaalt de naam van het plaatje. */
  relatiefPad: string
  userData: string
  preload: string
  pagina: { url?: string; bestand?: string }
  breedte?: number
  hoogte?: number
}

/**
 * De foto van één bus. Staat hij er al, dan komt hij van schijf.
 *
 * Geeft het pad naar het plaatje terug, of `undefined` als het niet lukte. Het
 * mislukken van een plaatje mag nooit een scherm ophouden: de tegel valt dan
 * terug op het icoon, zoals een kaart zonder `picture.jpg` op zijn monogram.
 */
export function maakBusfoto(opdracht: FotoOpdracht): Promise<string | undefined> {
  const map = busfotoMap(opdracht.userData)
  const doel = join(map, bestandsnaam(opdracht.relatiefPad))
  if (existsSync(doel)) return Promise.resolve(doel)

  /* In de rij: één tekening tegelijk; zie de uitleg bovenaan. */
  const beurt = bezig.then(() => tekenEen(opdracht, map, doel))
  bezig = beurt.catch(() => undefined)
  return beurt
}

function tekenEen(
  opdracht: FotoOpdracht,
  map: string,
  doel: string
): Promise<string | undefined> {
  const begin = Date.now()
  const tekening = bouwBusTekening(opdracht.busPad)
  if (!tekening) {
    log(`busfoto: geen model voor ${opdracht.relatiefPad}`)
    return Promise.resolve(undefined)
  }
  const gelezen = Date.now() - begin

  return new Promise<string | undefined>((klaar) => {
    const paneel = maakVenster(opdracht.preload, opdracht.pagina)
    let afgerond = false
    const stop = (uitkomst: string | undefined): void => {
      if (afgerond) return
      afgerond = true
      ipcMain.removeListener('busfoto:klaar', opPng)
      ipcMain.removeListener('busfoto:mislukt', opFout)
      clearTimeout(wekker)
      klaar(uitkomst)
    }

    const opPng = (_gebeurtenis: unknown, png: string): void => {
      try {
        mkdirSync(map, { recursive: true })
        const data = png.replace(/^data:image\/png;base64,/, '')
        writeFileSync(doel, Buffer.from(data, 'base64'))
        log(
          `busfoto ${opdracht.relatiefPad}: ${tekening.driehoeken} driehoeken, ` +
            `${gelezen} ms lezen, ${Date.now() - begin} ms in totaal`
        )
        stop(doel)
      } catch (fout) {
        logFout('busfoto bewaren', fout)
        stop(undefined)
      }
    }
    const opFout = (_gebeurtenis: unknown, reden: string): void => {
      log(`busfoto ${opdracht.relatiefPad} mislukt: ${reden}`)
      stop(undefined)
    }

    ipcMain.on('busfoto:klaar', opPng)
    ipcMain.on('busfoto:mislukt', opFout)
    /*
     * Een tekening die nooit terugkomt mag niet de hele rij ophouden. Twintig
     * seconden is ruim: de zwaarste bus hier kostte 1,1 seconde aan inlezen en
     * de tekening zelf een fractie daarvan.
     */
    const wekker = setTimeout(() => {
      log(`busfoto ${opdracht.relatiefPad}: geen antwoord binnen twintig seconden`)
      stop(undefined)
    }, 20000)

    /*
     * De texturen gaan (nog) niet mee.
     *
     * `bouwBusTekening` levert per stuk het *pad* naar de textuur, en het
     * venster verwacht kale pixels. Zolang die er niet zijn hoort het veld weg
     * te blijven: stuurden we het pad, dan las WebGL er een lege plaat uit en
     * kwam de hele bus zwart uit beeld -- precies wat er gebeurde.
     */
    const stukken = tekening.stukken.map((stuk) => ({
      posities: stuk.posities,
      normalen: stuk.normalen,
      uvs: stuk.uvs,
      indices: stuk.indices
    }))

    const stuur = (): void =>
      paneel.webContents.send('busfoto:teken', {
        stukken,
        doos: tekening.doos,
        breedte: opdracht.breedte ?? 512,
        hoogte: opdracht.hoogte ?? 384
      })

    if (paneel.webContents.isLoading()) paneel.webContents.once('did-finish-load', stuur)
    else stuur()
  })
}

/** Het venster opruimen; de app hoeft er niet op te wachten bij het afsluiten. */
export function sluitBusfotoVenster(): void {
  if (venster && !venster.isDestroyed()) venster.destroy()
  venster = undefined
}
