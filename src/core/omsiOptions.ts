import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * De instellingen van OMSI zelf, in `options.cfg`.
 *
 * Het bestand is gewone tekst in de Windows-codering met CRLF: een blok
 * `[naam]`, daaronder nul of meer waarden, dan een lege regel. Er staan ook
 * kopregels tussen (" GRAPHICS ------"), die bij niets horen.
 *
 * We lezen en schrijven het als losse bytes (`latin1`) en raken alleen de
 * regels aan die veranderen. Alles wat we niet kennen blijft daardoor staan
 * zoals OMSI het schreef -- ook de instellingen die deze app niet toont.
 *
 * Let op: OMSI schrijft dit bestand bij het afsluiten opnieuw. Wat je aanpast
 * terwijl het spel draait, is straks weg.
 */

export interface OptionsFile {
  /** Alle regels, zonder regeleinde. */
  lines: string[]
  /** Per blok het regelnummer van de tag zelf. */
  index: Map<string, number>
}

export function optionsPath(omsiPath: string): string {
  return join(omsiPath, 'options.cfg')
}

/** Is dit een kopregel als " GRAPHICS ------------" in plaats van een waarde? */
function isHeading(line: string): boolean {
  return line.includes('-----')
}

function indexLines(lines: string[]): Map<string, number> {
  const index = new Map<string, number>()
  lines.forEach((line, at) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) index.set(trimmed, at)
  })
  return index
}

export function readOptions(omsiPath: string): OptionsFile {
  const lines = readFileSync(optionsPath(omsiPath), 'latin1').split('\r\n')
  return { lines, index: indexLines(lines) }
}

/** Staat het blok in het bestand? Bij de vlaggen van OMSI is dat de hele instelling. */
export function hasOption(file: OptionsFile, tag: string): boolean {
  return file.index.has(tag)
}

/** Hoeveel waarderegels er onder een blok staan. */
function valueCount(file: OptionsFile, at: number): number {
  let count = 0
  for (let i = at + 1; i < file.lines.length; i++) {
    const line = file.lines[i].trim()
    if (line === '' || line.startsWith('[') || isHeading(file.lines[i])) break
    count++
  }
  return count
}

/** De waarden van een blok; een leeg blok levert een lege lijst. */
export function optionValues(file: OptionsFile, tag: string): string[] {
  const at = file.index.get(tag)
  if (at === undefined) return []
  const count = valueCount(file, at)
  return file.lines.slice(at + 1, at + 1 + count).map((line) => line.trim())
}

/**
 * Zet de waarden van een blok dat er al staat.
 *
 * Er wordt alleen geschoven waar het moet: staan er al evenveel regels, dan
 * worden ze vervangen. Minder waarden dan er staan haalt regels weg, meer
 * voegt ze toe.
 */
export function setOptionValues(file: OptionsFile, tag: string, values: string[]): void {
  const at = file.index.get(tag)
  if (at === undefined) return
  const had = valueCount(file, at)
  file.lines.splice(at + 1, had, ...values)

  // De regelnummers van alles wat erna komt schuiven mee.
  const shift = values.length - had
  if (shift !== 0) {
    for (const [key, line] of file.index) {
      if (line > at) file.index.set(key, line + shift)
    }
  }
}

/**
 * Zet een blok erbij dat nog niet in het bestand staat.
 *
 * Het komt achteraan in de sectie met de gegeven kop (" GRAPHICS -----"),
 * zodat het bestand eruit blijft zien zoals OMSI het schrijft: het blok, de
 * waarden en een lege regel. Zonder die kop gaat het achteraan.
 */
export function addOption(file: OptionsFile, tag: string, values: string[], heading?: string): void {
  if (file.index.has(tag)) return
  const lines = file.lines

  let at = lines.length
  const start = heading
    ? lines.findIndex((line) => isHeading(line) && line.trim().split(' ')[0] === heading)
    : -1
  if (start >= 0) {
    const next = lines.findIndex((line, i) => i > start && isHeading(line))
    if (next >= 0) at = next
  }
  // Aan het eind van het bestand staat soms nog een lege slotregel; daar voor.
  if (at === lines.length && lines[at - 1] === '') at--

  lines.splice(at, 0, tag, ...values, '')
  file.index = indexLines(lines)
}

/** Haalt een blok weg, met zijn waarden en de lege regel erna. */
export function removeOption(file: OptionsFile, tag: string): void {
  const at = file.index.get(tag)
  if (at === undefined) return
  let count = 1 + valueCount(file, at)
  if (file.lines[at + count]?.trim() === '') count++
  file.lines.splice(at, count)
  file.index = indexLines(file.lines)
}

export function writeOptions(omsiPath: string, file: OptionsFile): void {
  writeFileSync(optionsPath(omsiPath), file.lines.join('\r\n'), 'latin1')
}
