import { app, ipcMain, powerMonitor, shell, type BrowserWindow } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import { log } from '../core/logboek'
import { isNieuwer, magNuInstalleren, welkeUitvoering, type BijwerkStand } from '../core/bijwerken'

/*
 * De automatische updater (electron-updater, releases op GitHub).
 *
 * De geïnstalleerde versie kijkt 30 tellen na de start en daarna elke vier uur
 * of er een nieuwere release is, downloadt die op de achtergrond, en installeert
 * hem stil en start de app opnieuw zodra het veilig is (`magNuInstalleren` in
 * core/bijwerken.ts): geen dienst, geen vrije rit, geen OMSI of openOMSI. Lukt
 * dat niet voor de speler de app sluit, dan bij het afsluiten.
 *
 * De draagbare exe meldt alleen dat er een nieuwe versie is. Fouten (geen
 * latest.yml in de laatste release, offline, de limiet van GitHub) gaan
 * alleen in het logboek.
 */

const EIGENAAR = 'Luc-nbr'
const REPO = 'Omsi-career-addon'
const RELEASEPAGINA = `https://github.com/${EIGENAAR}/${REPO}/releases/latest`
const EERSTE_KEER = 30_000
const ELKE_KEER = 4 * 60 * 60 * 1000
const VEILIG_KIJKEN = 60_000

export interface Bijwerkhulp {
  venster(): BrowserWindow | undefined
  dienstLoopt(): boolean
  vrijeRit(): boolean
  spelDraait(): Promise<boolean>
  bekijken: boolean
}

let stand: BijwerkStand | undefined
let klaar: string | undefined

function meld(nieuw: BijwerkStand, hulp: Bijwerkhulp): void {
  stand = nieuw
  const venster = hulp.venster()
  if (venster && !venster.isDestroyed()) venster.webContents.send('bijwerken:stand', nieuw)
}

/** Alleen de eerste regel: bij een ontbrekende latest.yml zit er anders een hele lap tekst achter. */
function meldFout(fout: unknown): void {
  const tekst = fout instanceof Error ? fout.message : String(fout)
  log(`bijwerken: ${tekst.split('\n')[0].slice(0, 300)}`)
}

/** Welke versie er gedownload en geïnstalleerd werd; de eerste start daarna zegt "bijgewerkt". */
const notitie = (): string => join(app.getPath('userData'), 'bijwerken.json')

function vorigeKeerBijgewerkt(hulp: Bijwerkhulp): void {
  try {
    if (!existsSync(notitie())) return
    const { versie } = JSON.parse(readFileSync(notitie(), 'utf8')) as { versie?: string }
    const nu = app.getVersion()
    if (versie === nu) {
      log(`bijwerken: bijgewerkt naar ${nu}`)
      meld({ soort: 'bijgewerkt', versie: nu }, hulp)
    }
    // Een nieuwere die nog niet geïnstalleerd is blijft staan; de rest is klaar.
    if (!versie || !isNieuwer(versie, nu)) rmSync(notitie(), { force: true })
  } catch (fout) {
    meldFout(fout)
  }
}

let bezig = false

async function probeerTeInstalleren(hulp: Bijwerkhulp): Promise<void> {
  if (!klaar || bezig) return
  bezig = true
  try {
    const venster = hulp.venster()
    const spelerInDeApp =
      Boolean(venster && !venster.isDestroyed() && venster.isFocused()) && powerMonitor.getSystemIdleTime() < 120
    const veilig = magNuInstalleren({
      dienstLoopt: hulp.dienstLoopt(),
      vrijeRit: hulp.vrijeRit(),
      spelDraait: await hulp.spelDraait(),
      spelerInDeApp
    })
    if (!veilig) return
    log(`bijwerken: ${klaar} stil installeren en de app opnieuw starten`)
    autoUpdater.quitAndInstall(true, true)
  } catch (fout) {
    meldFout(fout)
  } finally {
    bezig = false
  }
}

export function startBijwerken(hulp: Bijwerkhulp): void {
  ipcMain.handle('bijwerken:stand', () => stand)
  ipcMain.handle('bijwerken:weg', () => {
    stand = undefined
  })
  ipcMain.handle('bijwerken:pagina', () => shell.openExternal(RELEASEPAGINA))

  const soort = welkeUitvoering({
    verpakt: app.isPackaged,
    draagbaarMap: process.env.PORTABLE_EXECUTABLE_DIR,
    argv: process.argv,
    bekijken: hulp.bekijken
  })
  if (soort !== 'installatie' && soort !== 'draagbaar') {
    log(`bijwerken: uit (${soort})`)
    return
  }

  autoUpdater.logger = null
  autoUpdater.setFeedURL({ provider: 'github', owner: EIGENAAR, repo: REPO })
  autoUpdater.allowPrerelease = false
  autoUpdater.on('error', meldFout)

  if (soort === 'draagbaar') {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('update-available', (info) => {
      log(`bijwerken: versie ${info.version} is uit (draagbaar: alleen melden)`)
      meld({ soort: 'nieuw', versie: info.version }, hulp)
    })
  } else {
    vorigeKeerBijgewerkt(hulp)
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', (info) => log(`bijwerken: versie ${info.version} gevonden, downloaden`))
    autoUpdater.on('update-downloaded', (info) => {
      const eerste = klaar === undefined
      klaar = info.version
      try {
        writeFileSync(notitie(), JSON.stringify({ versie: info.version }))
      } catch (fout) {
        meldFout(fout)
      }
      log(`bijwerken: versie ${info.version} gedownload`)
      meld({ soort: 'wacht', versie: info.version }, hulp)
      if (eerste) setInterval(() => void probeerTeInstalleren(hulp), VEILIG_KIJKEN).unref?.()
      void probeerTeInstalleren(hulp)
    })
  }

  const kijk = (): void => {
    if (klaar) return
    // Een fout komt ook als gebeurtenis `error` binnen en staat dan al in het logboek.
    autoUpdater.checkForUpdates().catch(() => undefined)
  }
  setTimeout(kijk, EERSTE_KEER).unref?.()
  setInterval(kijk, ELKE_KEER).unref?.()
}
