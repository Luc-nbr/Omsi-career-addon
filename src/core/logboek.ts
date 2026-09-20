import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Het logboek van de app zelf: één tekstbestand dat meeschrijft wat er gebeurt.
 *
 * Waarom dit er is: meldingen komen binnen als "hij hangt" of "hij is
 * afgesloten", en tot nu toe viel daar niets aan na te kijken. Wat er op de
 * machine van de speler gebeurde stond nergens. Met dit bestand kan hij het
 * meesturen en zien wij waar de tijd bleef, welke kaart eraan te pas kwam en
 * met welke fout het ophield.
 *
 * Twee regels waaraan het zich houdt:
 *
 * - **Schrijven mag nooit de app tegenhouden.** Het gaat om een appendFileSync
 *   van een regel; dat kost microseconden en gaat naar dezelfde schijf waar de
 *   profielen al op staan. Gaat het toch mis (geen rechten, schijf vol), dan
 *   slikken we de fout: een app die valt omdat het loggen niet lukt is erger
 *   dan een app zonder logboek.
 * - **Er staat niets persoonlijks in.** Paden naar de OMSI-map en namen van
 *   kaarten, niet de naam van de speler of zijn profiel. Het bestand is bedoeld
 *   om doorgestuurd te worden.
 */

const MAX_BYTES = 1_000_000

let bestand: string | undefined

/** Waar het logboek staat, als het aanstaat. */
export function logboekPad(): string | undefined {
  return bestand
}

/**
 * Zet het logboek aan in deze map, en ruim de vorige ronde op.
 *
 * Er blijft één oude versie staan (`.vorige`). Wie na een crash terugkijkt,
 * heeft daar de sessie ervóór, want de app schrijft bij elke start verder in
 * hetzelfde bestand tot het groot wordt.
 */
export function startLogboek(map: string, regel: string): string | undefined {
  try {
    const dir = join(map, 'logs')
    mkdirSync(dir, { recursive: true })
    const pad = join(dir, 'omsi-enhancer.log')
    if (existsSync(pad) && statSync(pad).size > MAX_BYTES) {
      const vorige = `${pad}.vorige`
      if (existsSync(vorige)) unlinkSync(vorige)
      renameSync(pad, vorige)
    }
    bestand = pad
    log('')
    log(`=== ${regel}`)
    return pad
  } catch {
    bestand = undefined
    return undefined
  }
}

function stempel(): string {
  const nu = new Date()
  const twee = (getal: number): string => String(getal).padStart(2, '0')
  return (
    `${nu.getFullYear()}-${twee(nu.getMonth() + 1)}-${twee(nu.getDate())} ` +
    `${twee(nu.getHours())}:${twee(nu.getMinutes())}:${twee(nu.getSeconds())}.` +
    String(nu.getMilliseconds()).padStart(3, '0')
  )
}

/** Eén regel in het logboek. Zonder logboek gebeurt er niets. */
export function log(tekst: string): void {
  if (!bestand) return
  try {
    appendFileSync(bestand, tekst ? `${stempel()}  ${tekst}\r\n` : '\r\n', 'utf8')
  } catch {
    // Zie de kop: het logboek mag de app nooit in de weg zitten.
  }
}

/**
 * Een fout, met zijn stapel.
 *
 * De stapel staat erbij omdat een melding als "hij crashte" zonder plaats
 * niets oplevert; met de stapel is het meestal één regel zoeken.
 */
export function logFout(waar: string, fout: unknown): void {
  const err = fout instanceof Error ? fout : undefined
  log(`FOUT  ${waar}: ${err?.message ?? String(fout)}`)
  if (err?.stack) for (const regel of err.stack.split('\n').slice(1, 6)) log(`      ${regel.trim()}`)
}

/**
 * Meet hoe lang iets duurde en schrijf het op als het lang duurde.
 *
 * De grens staat op 150 ms: dat is ongeveer waar een klik begint aan te voelen
 * als een hapering. Wat sneller is dan dat hoeft niet in het logboek, anders
 * staat het vol met regels waar niemand iets aan heeft.
 */
export const TRAAG_MS = 150

export function meet<T>(wat: string, doen: () => T): T {
  const begin = Date.now()
  try {
    return doen()
  } finally {
    const duur = Date.now() - begin
    if (duur >= TRAAG_MS) log(`TRAAG ${wat}: ${duur} ms`)
  }
}

export async function meetAsync<T>(wat: string, doen: () => Promise<T>): Promise<T> {
  const begin = Date.now()
  try {
    return await doen()
  } finally {
    const duur = Date.now() - begin
    if (duur >= TRAAG_MS) log(`TRAAG ${wat}: ${duur} ms`)
  }
}
