import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { schrijfVeilig } from './veilig'

/**
 * Welke versie van de app schreef het laatst in de gebruikersmap, en wat een
 * oudere versie dan hoort te doen.
 *
 * WAAROM
 * Een oude draagbare exe die nog ergens stond, draaide ooit naast een nieuwe
 * en schreef in dezelfde profielen (zie CLAUDE.md). Het slot op de
 * gebruikersmap (`requestSingleInstanceLock`) houdt twee tegelijk tegen, maar
 * niet een oude exe die later start: die leest profielen die een nieuwere
 * versie schreef -- met velden die hij niet kent -- en schrijft ze terug
 * zonder die velden. Daarom staat er in de gebruikersmap wie er schreef, en
 * vraagt een oudere versie eerst wat de speler wil: alleen bekijken, of toch
 * doorgaan. (Idee uit openOMSI, dat na een update onthoudt naar welke versie
 * het ging.)
 *
 * Dit beschermt alleen tegen versies die dit zelf al kennen (van 28-09-2026
 * af); een exe van daarvoor weet niet dat hij moet kijken, en schrijft ook
 * niet op wie hij is.
 */

export interface Schrijver {
  versie: string
  /** De bouwstempel: `bouw 1a2b3c4 · 2026-09-28 20:15 · setup`. */
  bouw?: string
  tijd: string
}

export interface Schrijvers {
  /** De hoogste versie die ooit in deze map schreef. */
  hoogste: Schrijver
  /** De versie die het laatst schreef. */
  laatst: Schrijver
}

export const SCHRIJVER_BESTAND = 'laatst-geschreven.json'

/**
 * Versienummers vergelijken als getallen per deel: 0.4.10 komt na 0.4.9.
 * Een achtervoegsel (`-beta`) telt niet mee.
 */
export function vergelijkVersies(a: string, b: string): number {
  const delen = (v: string): number[] => v.split('-')[0].split('.').map((d) => Number.parseInt(d, 10) || 0)
  const x = delen(a)
  const y = delen(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const verschil = (x[i] ?? 0) - (y[i] ?? 0)
    if (verschil !== 0) return Math.sign(verschil)
  }
  return 0
}

export function leesSchrijvers(userData: string): Schrijvers | undefined {
  try {
    const gelezen = JSON.parse(readFileSync(join(userData, SCHRIJVER_BESTAND), 'utf8')) as Schrijvers
    return typeof gelezen?.hoogste?.versie === 'string' && typeof gelezen?.laatst?.versie === 'string'
      ? gelezen
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Noteren dat deze versie schreef. De hoogste blijft staan als die hoger is:
 * wie na 0.4.9 een keer met 0.4.1 "toch doorgaan" koos, krijgt de vraag de
 * volgende keer weer -- de profielen zijn nog steeds van 0.4.9.
 */
export function noteerSchrijver(userData: string, versie: string, bouw?: string, nu = new Date()): void {
  const ik: Schrijver = { versie, bouw, tijd: nu.toISOString() }
  const eerder = leesSchrijvers(userData)
  const hoogste = eerder && vergelijkVersies(eerder.hoogste.versie, versie) > 0 ? eerder.hoogste : ik
  schrijfVeilig(join(userData, SCHRIJVER_BESTAND), `${JSON.stringify({ hoogste, laatst: ik }, undefined, 2)}\n`)
}

/**
 * Is deze versie ouder dan wat er het laatst in de map schreef? Dan staat
 * erin wie dat was, voor de melding.
 */
export function nieuwereSchrijver(userData: string, versie: string): Schrijver | undefined {
  const schrijvers = leesSchrijvers(userData)
  return schrijvers && vergelijkVersies(schrijvers.hoogste.versie, versie) > 0 ? schrijvers.hoogste : undefined
}

/*
 * Wat er niet mee hoeft naar de kopie om te bekijken: de caches van Chromium
 * (die maakt hij zelf opnieuw, in de kopie -- gemeten in
 * probe-alleenbekijken.cjs: na het omzetten schrijft Chromium daar, en in de
 * echte map alleen nog `Local State`), het logboek, en de reservekopieën van
 * add-ons -- die kunnen gigabytes zijn en worden bij bekijken nooit gelezen.
 * `Local Storage` gaat wel mee: daar onthoudt het scherm kleine keuzes.
 */
const NIET_MEE = new Set(
  [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'blob_storage',
    'Network',
    'Shared Dictionary',
    'Session Storage',
    'SharedStorage',
    'SharedStorage-wal',
    'Local State',
    'Preferences',
    'lockfile',
    'logs',
    'addon-reserve',
    'kopieen'
  ].map((naam) => naam.toLowerCase())
)

/**
 * Een kopie van de gebruikersmap om alleen te bekijken. Alles wat de app
 * daarna opslaat, komt in die kopie en is weg zodra de app dicht is; de echte
 * map blijft zoals de nieuwere versie hem achterliet.
 */
export function kopieVoorBekijken(userData: string, naar: string): void {
  mkdirSync(naar, { recursive: true })
  if (!existsSync(userData)) return
  for (const naam of readdirSync(userData)) {
    if (NIET_MEE.has(naam.toLowerCase())) continue
    cpSync(join(userData, naam), join(naar, naam), { recursive: true, force: true })
  }
}

/** De variant van de app, voor de bouwstempel. */
export type Variant = 'setup' | 'draagbaar' | 'dev'

/**
 * Welke variant draait. De draagbare exe van electron-builder pakt zichzelf
 * uit in een tijdelijke map en zet daarbij `PORTABLE_EXECUTABLE_DIR` (de map
 * waar de exe echt staat); de installatie niet. Niet ingepakt is ontwikkelen.
 */
export function variantVan(ingepakt: boolean, omgeving: NodeJS.ProcessEnv = process.env): Variant {
  if (!ingepakt) return 'dev'
  return omgeving.PORTABLE_EXECUTABLE_DIR ? 'draagbaar' : 'setup'
}

/**
 * `bouw 1a2b3c4 · 2026-09-28 20:15 · setup`: welke broncode, wanneer
 * gebouwd, en welke van de twee exe's. Het versienummer alleen zei niet
 * genoeg -- tussen twee versies worden er soms tien gebouwd, en een oude
 * draagbare exe met hetzelfde nummer was niet van een nieuwe te onderscheiden.
 */
export function bouwstempel(bouw: { hash: string; tijd: string } | undefined, variant: Variant): string {
  return `bouw ${bouw?.hash ?? 'onbekend'} · ${bouw?.tijd ?? '?'} · ${variant}`
}
