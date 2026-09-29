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

/** Welke exe: het versienummer en zijn bouw. */
export interface Wie {
  versie: string
  /** De bouwstempel als tekst, voor de melding: `bouw 1a2b3c4 · 2026-09-28 20:15 · setup`. */
  bouw?: string
  /** De korte git-hash van de bouw (sinds 29-09; zie `isNieuwer`). */
  hash?: string
  /** Wanneer hij gebouwd is, ISO in UTC. */
  gebouwd?: string
  variant?: Variant
}

export interface Schrijver extends Wie {
  /** Wanneer hij het laatst schreef. */
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
 * Is exe `a` nieuwer dan exe `b`? Eerst het versienummer. Bij hetzelfde
 * nummer de bouw: na elke wijziging wordt er opnieuw gebouwd (CLAUDE.md), en
 * al die exe's heten dan 0.4.7 -- ook de oude draagbare die het risico is
 * waarvoor deze wacht er staat. Tot 29-09 telde alleen het nummer, en zag een
 * oude 0.4.7 niet dat een nieuwe 0.4.7 de map had bijgewerkt.
 *
 * Een andere bouw is nieuwer als hij later gebouwd is. Nooit bij een
 * ontwikkelversie (`dev`: die bouwt bij elke start opnieuw, en zegt dus niets
 * over wat er in de map staat), zonder bouwtijd (een notitie van vóór 29-09),
 * of met dezelfde hash (dezelfde broncode, twee keer gebouwd).
 *
 * Dezelfde hash met een `+` erachter is níét dezelfde broncode: dat is een
 * bouw met onvastgelegde wijzigingen op die commit, en tussen twee commits
 * worden er zo soms tien gebouwd (CLAUDE.md: na elke wijziging). Tot de
 * tegenlezing van 29-09 telden twee vuile bouwen op dezelfde commit als
 * gelijk, en zag een oude draagbare van 12:00 niet dat die van 15:00 de map
 * had bijgewerkt. Nu beslist dan de bouwtijd; de setup en de draagbare van
 * één bouw hebben dezelfde tijd en blijven gelijk.
 */
export function isNieuwer(a: Wie, b: Wie): boolean {
  const versies = vergelijkVersies(a.versie, b.versie)
  if (versies !== 0) return versies > 0
  if (a.variant === 'dev' || b.variant === 'dev') return false
  if (typeof a.gebouwd !== 'string' || typeof b.gebouwd !== 'string') return false
  if (a.hash && a.hash === b.hash && !a.hash.endsWith('+')) return false
  return a.gebouwd > b.gebouwd
}

/**
 * Noteren dat deze exe schreef. De hoogste blijft staan als die nieuwer is:
 * wie na 0.4.9 een keer met 0.4.1 "toch doorgaan" koos, krijgt de vraag de
 * volgende keer weer -- de profielen zijn nog steeds van 0.4.9.
 *
 * Een ontwikkelversie met hetzelfde nummer neemt de plek van een gebouwde
 * niet over. `isNieuwer` zegt bij `dev` altijd nee, dus zonder deze regel
 * werd één ontwikkelstart op de echte map de hoogste -- en daarna kreeg een
 * oude draagbare exe met dat nummer de vraag niet meer (tegenlezing 29-09).
 * Een ontwikkelversie met een hoger nummer wordt wel de hoogste: die schreef
 * profielen van dat nummer.
 */
export function noteerSchrijver(userData: string, wie: Wie, nu = new Date()): void {
  const ik: Schrijver = { ...wie, tijd: nu.toISOString() }
  const eerder = leesSchrijvers(userData)
  const blijft =
    eerder !== undefined &&
    (isNieuwer(eerder.hoogste, ik) ||
      (ik.variant === 'dev' &&
        eerder.hoogste.variant !== 'dev' &&
        vergelijkVersies(eerder.hoogste.versie, ik.versie) === 0))
  const hoogste = blijft ? eerder.hoogste : ik
  schrijfVeilig(join(userData, SCHRIJVER_BESTAND), `${JSON.stringify({ hoogste, laatst: ik }, undefined, 2)}\n`)
}

/**
 * Is deze exe ouder dan wat er het laatst in de map schreef? Dan staat erin
 * wie dat was, voor de melding.
 */
export function nieuwereSchrijver(userData: string, wie: Wie): Schrijver | undefined {
  const schrijvers = leesSchrijvers(userData)
  return schrijvers && isNieuwer(schrijvers.hoogste, wie) ? schrijvers.hoogste : undefined
}

/*
 * Wat er niet mee hoeft naar de kopie om te bekijken: de caches van Chromium
 * (die maakt hij zelf opnieuw, in de kopie -- gemeten in
 * probe-alleenbekijken.cjs: na het omzetten schrijft Chromium daar, en in de
 * echte map alleen nog `Local State`), het logboek, en de reservekopieën van
 * add-ons -- die kunnen gigabytes zijn en worden bij bekijken nooit gelezen.
 * `Local Storage` gaat wel mee: daar onthoudt het scherm kleine keuzes. En
 * de `kaartcache` en de `busfotos` ook (bij Luc samen zo'n 165 MB, vóór het
 * venster): zonder kaartcache leest de werker bij het rondkijken elke kaart
 * opnieuw, en dat duurt langer dan het kopiëren.
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
