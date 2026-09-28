import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import { constants } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSettings } from '../core/settings'
import { zetNaOpslaan } from '../core/veilig'
import {
  bouwstempel,
  kopieVoorBekijken,
  nieuwereSchrijver,
  noteerSchrijver,
  variantVan,
  type Schrijver
} from '../core/versiewacht'
import { DEFAULT_LANGUAGE, isLanguage, t } from '../shared/i18n'

/*
 * De bouwstempel en de wacht tegen oudere exe's; de regels staan in
 * core/versiewacht.ts, dit is de kant die Electron nodig heeft (het venster
 * met de vraag, het omzetten van de gebruikersmap).
 */

/** De bouwstempel van deze exe; `__BOUW__` bakt electron.vite.config.ts erin. */
export function stempel(): string {
  return bouwstempel(typeof __BOUW__ === 'undefined' ? undefined : __BOUW__, variantVan(app.isPackaged))
}

let bekijken: { nieuwere: Schrijver; kopie: string } | undefined

/** Draait de app alleen om te bekijken? Dan staat erin wie de map het laatst bijwerkte. */
export function alleenBekijken(): { versie: string; bouw?: string } | undefined {
  return bekijken ? { versie: bekijken.nieuwere.versie, bouw: bekijken.nieuwere.bouw } : undefined
}

/**
 * Bij het starten, vóór er iets in de gebruikersmap geschreven wordt: is deze
 * exe ouder dan wat de map het laatst bijwerkte, dan vragen wat de speler wil.
 *
 * - Alleen bekijken: de app draait op een kopie van de gebruikersmap in de
 *   tijdelijke map, en schrijft verder nergens -- niet in de echte map, niet
 *   in OMSI, niet bij Steam (`sluitSchrijvenAf`). Rondkijken kan, opslaan
 *   niet, en OMSI starten dus ook niet. Chromium volgt de kopie ook; alleen
 *   zijn eigen `Local State` komt nog in de echte map (geen gegevens van de app).
 * - Toch doorgaan: zoals altijd.
 * - Afsluiten: de app gaat meteen weer dicht.
 *
 * Anders, en na "toch doorgaan", noteert de eerste opslag in de gebruikersmap
 * welke versie er schreef (`noteerSchrijver`).
 *
 * `OMSI_ENHANCER_PROEFKEUZE` beantwoordt de vraag zonder venster, voor een
 * proef (scripts/probe-versiewacht.cjs); in een gewone start staat hij niet.
 */
export function bewaakVersie(versie: string): 'verder' | 'afsluiten' {
  const echt = app.getPath('userData')
  const nieuwere = nieuwereSchrijver(echt, versie)
  if (nieuwere) {
    const keuze = vraag(echt, versie, nieuwere)
    if (keuze === 'afsluiten') return 'afsluiten'
    if (keuze === 'bekijken') {
      const kopie = join(app.getPath('temp'), `omsi-enhancer-bekijken-${process.pid}`)
      ruimOudeKopieenOp(app.getPath('temp'))
      kopieVoorBekijken(echt, kopie)
      app.setPath('userData', kopie)
      bekijken = { nieuwere, kopie }
      sluitSchrijvenAf([kopie])
      toonInTitel(echt, versie)
      app.on('will-quit', () => {
        try {
          fs.rmSync(kopie, { recursive: true, force: true })
        } catch {
          // Dan ruimt Windows de tijdelijke map later op.
        }
      })
      return 'verder'
    }
  }
  let genoteerd = false
  zetNaOpslaan((pad) => {
    if (genoteerd || !pad.toLowerCase().startsWith(echt.toLowerCase() + sep)) return
    genoteerd = true
    try {
      noteerSchrijver(echt, versie, stempel())
    } catch {
      // Niet kunnen noteren mag het opslaan zelf niet tegenhouden.
    }
  })
  return 'verder'
}

/*
 * Kopieën van een vorige keer bekijken. Opruimen bij het afsluiten lukt niet
 * altijd helemaal (Chromium houdt er nog iets open), en een kopie kan honderd
 * megabyte zijn. Alleen wat ouder is dan twaalf uur: een kopie van een ander
 * exemplaar dat nu draait (met een eigen --user-data-dir) blijft staan.
 */
function ruimOudeKopieenOp(temp: string): void {
  try {
    for (const naam of fs.readdirSync(temp)) {
      if (!naam.startsWith('omsi-enhancer-bekijken-')) continue
      const map = join(temp, naam)
      if (Date.now() - fs.statSync(map).mtimeMs > 12 * 3600 * 1000) fs.rmSync(map, { recursive: true, force: true })
    }
  } catch {
    // Opruimen is geen voorwaarde om te kunnen bekijken.
  }
}

function taal(userData: string): Parameters<typeof t>[0] {
  const gekozen = readSettings(userData).language
  return isLanguage(gekozen) ? gekozen : DEFAULT_LANGUAGE
}

function vraag(userData: string, versie: string, nieuwere: Schrijver): 'bekijken' | 'doorgaan' | 'afsluiten' {
  const proef = process.env.OMSI_ENHANCER_PROEFKEUZE
  if (proef === 'bekijken' || proef === 'doorgaan' || proef === 'afsluiten') return proef
  const tl = taal(userData)
  const knop = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'OMSI Enhancer',
    message: t(tl, 'vw.bericht', { nieuw: nieuwere.versie, eigen: versie }),
    detail: [t(tl, 'vw.uitleg'), nieuwere.bouw ? `${nieuwere.versie}: ${nieuwere.bouw}\n${versie}: ${stempel()}` : '']
      .filter(Boolean)
      .join('\n\n'),
    buttons: [t(tl, 'vw.bekijken'), t(tl, 'vw.doorgaan'), t(tl, 'vw.afsluiten')],
    defaultId: 0,
    // Wegklikken is het veilige antwoord.
    cancelId: 0,
    noLink: true
  })
  return knop === 1 ? 'doorgaan' : knop === 2 ? 'afsluiten' : 'bekijken'
}

/**
 * Elk venster zegt in zijn titel dat er niets opgeslagen wordt. Via de pagina
 * en niet via `browser-window-created`: die kwam in de proef niet aan, en de
 * pagina zet bij het laden haar eigen `<title>`; daarna zetten wij de onze.
 */
function toonInTitel(userData: string, versie: string): void {
  const titel = `OMSI Enhancer ${versie} — ${t(taal(userData), 'vw.titelBalk')}`
  app.on('web-contents-created', (_gebeurtenis, inhoud) => {
    const zet = (): void => {
      const venster = BrowserWindow.fromWebContents(inhoud)
      if (venster && !venster.isDestroyed() && venster.getTitle() !== titel) venster.setTitle(titel)
    }
    inhoud.on('page-title-updated', zet)
    inhoud.on('did-finish-load', zet)
  })
}

/*
 * NIETS SCHRIJVEN BUITEN DE KOPIE
 *
 * De app schrijft op tientallen plekken: profielen, instellingen, de
 * situatie en het weer in OMSI, keyboard.cfg, de plugin, Steams
 * localconfig.vdf. Bij elk daarvan een eigen vraag "mag dat nu?" zetten, kan
 * altijd één plek missen -- en wie er later een bijmaakt, weet er niets van.
 * Daarom zit de grens een laag lager: in alleen-bekijken weigeren de
 * schrijvende functies van `fs` zelf alles buiten de kopie, met de fout
 * EROFS ("alleen-lezen bestandssysteem"), die het scherm meldt zoals elke
 * andere fout. Het werkt omdat de gebouwde app `fs.writeFileSync(...)` bij
 * elke aanroep op het moduleobject opzoekt. Alleen in dit hoofdproces: de
 * kaartwerker schrijft alleen zijn cache, en die staat in de kopie.
 */
const PADEN: Record<string, number[]> = {
  writeFileSync: [0],
  appendFileSync: [0],
  copyFileSync: [1],
  cpSync: [1],
  renameSync: [0, 1],
  rmSync: [0],
  rmdirSync: [0],
  unlinkSync: [0],
  mkdirSync: [0],
  truncateSync: [0],
  symlinkSync: [1],
  linkSync: [1],
  utimesSync: [0],
  createWriteStream: [0],
  writeFile: [0],
  appendFile: [0],
  copyFile: [1],
  cp: [1],
  rename: [0, 1],
  rm: [0],
  rmdir: [0],
  unlink: [0],
  mkdir: [0],
  truncate: [0],
  symlink: [1],
  link: [1]
}

function alsPad(waarde: unknown): string | undefined {
  if (typeof waarde === 'string') return waarde
  if (Buffer.isBuffer(waarde)) return waarde.toString()
  if (waarde instanceof URL) return fileURLToPath(waarde)
  return undefined
}

function schrijftBijOpenen(vlaggen: unknown): boolean {
  if (vlaggen === undefined || vlaggen === null) return false
  if (typeof vlaggen === 'number') {
    const schrijf = constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND
    return (vlaggen & schrijf) !== 0
  }
  return /[wa+]/.test(String(vlaggen))
}

export function sluitSchrijvenAf(toegestaan: string[]): void {
  const grenzen = toegestaan.map((map) => resolve(map).toLowerCase())
  const mag = (pad: string): boolean => {
    const vol = resolve(pad).toLowerCase()
    return grenzen.some((g) => vol === g || vol.startsWith(g + sep))
  }
  const weiger = (pad: string): Error =>
    Object.assign(new Error(`Alleen bekijken: niet geschreven naar ${pad}`), { code: 'EROFS', path: pad })

  const bewaak = (doel: Record<string, unknown>, naam: string, indexen: number[]): void => {
    const origineel = doel[naam]
    if (typeof origineel !== 'function') return
    doel[naam] = function (this: unknown, ...args: unknown[]) {
      for (const i of indexen) {
        const pad = alsPad(args[i])
        if (pad !== undefined && !mag(pad)) throw weiger(pad)
      }
      return (origineel as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
  const openen = (doel: Record<string, unknown>, naam: string): void => {
    const origineel = doel[naam]
    if (typeof origineel !== 'function') return
    doel[naam] = function (this: unknown, ...args: unknown[]) {
      const pad = alsPad(args[0])
      if (pad !== undefined && schrijftBijOpenen(args[1]) && !mag(pad)) throw weiger(pad)
      return (origineel as (...a: unknown[]) => unknown).apply(this, args)
    }
  }

  const modules = [fs as unknown as Record<string, unknown>, fs.promises as unknown as Record<string, unknown>]
  for (const doel of modules) {
    for (const [naam, indexen] of Object.entries(PADEN)) bewaak(doel, naam, indexen)
    openen(doel, 'openSync')
    openen(doel, 'open')
  }
}
