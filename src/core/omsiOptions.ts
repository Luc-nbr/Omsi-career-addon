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

export function readOptions(omsiPath: string): OptionsFile {
  const lines = readFileSync(optionsPath(omsiPath), 'latin1').split('\r\n')
  const index = new Map<string, number>()
  lines.forEach((line, at) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) index.set(trimmed, at)
  })
  return { lines, index }
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
 * Zet de waarden van een blok.
 *
 * Er wordt alleen geschoven waar het moet: staan er al evenveel regels, dan
 * worden ze vervangen. Minder waarden dan er staan haalt regels weg, meer
 * voegt ze toe. Een blok zonder waarden is hoe OMSI "uit" noteert bij de
 * vlaggen, dus een lege lijst hoort erbij te kunnen.
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

export function writeOptions(omsiPath: string, file: OptionsFile): void {
  writeFileSync(optionsPath(omsiPath), file.lines.join('\r\n'), 'latin1')
}
