import { existsSync, readdirSync } from 'node:fs'
import { dirname, extname, join, basename } from 'node:path'
import { blockTag, readOmsiLines, str } from './omsiFile'

/**
 * Een bestemming uit een Betriebshof-bestand (.hof). De `code` is het nummer dat
 * de chauffeur in de IBIS intoetst; `station` is dezelfde naam die de
 * dienstregeling als eindbestemming gebruikt, en vormt zo de koppeling.
 */
export interface Terminus {
  code: string
  station: string
  /** De tekst zoals hij op de bestemmingsfilm verschijnt. */
  display: string
}

/**
 * Een route uit het informatiesysteem van het wagenpark.
 *
 * Dit is wat de chauffeur in de IBIS intoetst: eerst de lijn, dan de route. De
 * bestemming hoort bij de route en volgt er vanzelf uit - die hoef je niet apart
 * in te voeren.
 */
export interface Route {
  /** Routenummer; dit typ je in. */
  code: string
  /** Korte omschrijving, zoals "URUH-NERV". */
  name: string
  /** Bestemmingscode waar deze route op uitkomt. */
  target: string
  lineNumber: string
  /**
   * De haltes die deze route aandoet. Meerdere routes van dezelfde lijn kunnen
   * op dezelfde bestemming uitkomen - 9202 rijdt vanaf Stadtgrenze, 9226 vanaf
   * Reimerweg - en alleen deze lijst houdt ze uit elkaar.
   */
  stops: string[]
}

/** Eén wagenpark: welke bestemmingen en routes deze bus kent. */
export interface Hof {
  file: string
  name: string
  termini: Terminus[]
  routes: Route[]
}

/**
 * Een .hof-bestand koppelt één busmodel aan een bepaald wagenpark: dezelfde bus
 * rijdt in Berlijn andere bestemmingen dan in Hamburg. Het aantal tekstvelden
 * per bestemming staat in het bestand zelf en loopt in de praktijk van 1 tot 26,
 * soms met tabs erachter, dus dat moet per bestand gelezen worden.
 *
 * Let op: OMSI herkent sleutelwoorden aan het regelbegin, met of zonder blokhaken.
 * `stringcount_terminus` staat er zonder.
 *
 * `gelezen` is er voor wie het bestand toch al voor zich heeft. `scanHofs` haalt
 * uit elk wagenpark twee dingen -- de bestemmingen en de veldindeling -- en
 * haalde het daarvoor twee keer van schijf; over 448 bestanden is dat de helft
 * van de tijd, en die tijd gaat af van het hoofdproces.
 */
export function readHof(path: string, gelezen?: string[]): Hof {
  const lines = gelezen ?? readOmsiLines(path)
  const hof: Hof = { file: path, name: basename(path, extname(path)), termini: [], routes: [] }

  let stringCount = 6
  const countIndex = lines.findIndex((line) => line.trim() === 'stringcount_terminus')
  if (countIndex >= 0) {
    const parsed = Number.parseInt(str(lines[countIndex + 1]), 10)
    if (Number.isFinite(parsed) && parsed >= 0) stringCount = parsed
  }

  const nameIndex = lines.findIndex((line) => line.trim() === '[name]')
  if (nameIndex >= 0) hof.name = str(lines[nameIndex + 1]) || hof.name

  for (let i = 0; i < lines.length; i++) {
    const tag = blockTag(lines[i])

    if (tag === '[addterminus]' || tag === '[addterminus_allexit]') {
      const code = str(lines[i + 1])
      const station = str(lines[i + 2])
      // string0 is de tekst op het IBIS-display en de bestemmingsfilm.
      const display = str(lines[i + 3])
      if (code && station) hof.termini.push({ code, station, display: display || station })
      i += 2 + stringCount
      continue
    }

    /**
     * Routes van het informatiesysteem: vier velden, in beide bestandsvormen
     * hetzelfde. De nieuwere bestanden plakken er tabs achter, vandaar het
     * trimmen.
     */
    if (tag === '[infosystem_trip]') {
      const code = str(lines[i + 1])
      const name = str(lines[i + 2])
      const target = str(lines[i + 3])
      const lineNumber = str(lines[i + 4])
      if (code && target) {
        // De haltelijst die erop volgt hoort bij deze route.
        const stops: string[] = []
        let j = i + 5
        while (j < lines.length && blockTag(lines[j]) !== '[infosystem_busstop_list]') {
          if (blockTag(lines[j])?.startsWith('[infosystem_trip')) break
          j++
        }
        if (blockTag(lines[j]) === '[infosystem_busstop_list]') {
          const count = Number.parseInt(str(lines[j + 1]), 10)
          if (Number.isFinite(count)) {
            for (let k = 0; k < count; k++) {
              const stop = str(lines[j + 2 + k])
              if (stop) stops.push(stop)
            }
          }
        }
        hof.routes.push({ code, name, target, lineNumber, stops })
      }
      i += 4
      continue
    }

    /**
     * Nieuwere wagenparken gebruiken een lijstvorm die tot `[end]` loopt en per
     * regel tabgescheiden kolommen heeft — die bestanden zijn uit Excel
     * geëxporteerd, compleet met rijen opvultabs. Kolom 0 draagt vlaggen zoals
     * `{ALLEX}`, daarna volgen code, station en de displayteksten.
     */
    if (tag === '[addterminus_list]') {
      for (let j = i + 1; j < lines.length; j++) {
        if (blockTag(lines[j]) === '[end]') {
          i = j
          break
        }
        const columns = lines[j].split('\t')
        const code = str(columns[1])
        const station = str(columns[2])
        if (!code || !station) continue
        hof.termini.push({ code, station, display: str(columns[3]) || station })
      }
    }
  }
  return hof
}

/** De .hof-bestanden die naast een busmodel staan. */
export function listHofs(vehicleFile: string): Hof[] {
  const folder = dirname(vehicleFile)
  if (!existsSync(folder)) return []
  const hofs: Hof[] = []
  for (const entry of readdirSync(folder)) {
    if (extname(entry).toLowerCase() !== '.hof') continue
    try {
      hofs.push(readHof(join(folder, entry)))
    } catch {
      // Een onleesbaar wagenpark mag de busselectie niet blokkeren.
    }
  }
  return hofs
}

/** Namen vergelijken zonder te struikelen over punten, accenten en hoofdletters. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
}

export interface HofMatch {
  hof: Hof
  /** Hoeveel van de gevraagde eindbestemmingen dit wagenpark kent. */
  matched: number
  codes: Map<string, Terminus>
}

/**
 * Wagenparken dragen hun ingangsdatum in de naam: "Spandau 1986", "Spandau
 * 1989-11", "Hamburg (HHA 2015)". In het bestand staat dat als "GÜLTIG AB
 * 1.1.1986". Eén busmodel heeft er acht naast zich liggen, één per tijdvak.
 */
function validFrom(name: string): number | undefined {
  const match = name.match(/(19|20)(\d{2})(?:\s*-\s*(\d{1,2})\b)?/)
  if (!match) return undefined
  const year = Number.parseInt(`${match[1]}${match[2]}`, 10)
  const month = match[3] ? Math.min(12, Math.max(1, Number.parseInt(match[3], 10))) : 1
  return year * 12 + (month - 1)
}

/**
 * Kiest het wagenpark dat het beste bij de dienst past. Een busmodel heeft er
 * vaak meerdere naast zich staan — Berlijn, Grundorf, Hamburg — en alleen de
 * juiste kent de eindbestemmingen van deze kaart.
 *
 * Bij gelijke herkenning beslist het tijdvak: van de wagenparken die op de
 * speeldatum al golden, wint het laatst ingegane. Zonder dat zou lijn 54 in 1988
 * de codes van een ander jaar krijgen, en dan toetst de chauffeur iets anders in
 * dan er op de film verschijnt.
 */
/**
 * Wat één wagenpark van deze eindbestemmingen kent.
 *
 * Apart van het kiezen, want wie zelf een wagenpark aanwijst wil dezelfde
 * gegevens terug: de codes die erbij horen, en hoeveel bestemmingen het kent.
 */
export function matchHof(hof: Hof, termini: string[]): HofMatch {
  const wanted = [...new Set(termini.map(normalise))].filter(Boolean)
  const codes = new Map<string, Terminus>()
  for (const terminus of hof.termini) {
    const key = normalise(terminus.station)
    if (!codes.has(key)) codes.set(key, terminus)
  }
  return { hof, matched: wanted.filter((name) => codes.has(name)).length, codes }
}

export function pickHof(hofs: Hof[], termini: string[], year?: number): HofMatch | undefined {
  const scored: HofMatch[] = hofs.map((hof) => matchHof(hof, termini))

  const best = Math.max(0, ...scored.map((entry) => entry.matched))
  if (best === 0) return undefined
  const candidates = scored.filter((entry) => entry.matched === best)
  if (candidates.length === 1 || year === undefined) return candidates[0]

  const target = year * 12
  const dated = candidates
    .map((entry) => ({ entry, from: validFrom(entry.hof.name) }))
    .filter((item): item is { entry: HofMatch; from: number } => item.from !== undefined)
  if (dated.length === 0) return candidates[0]

  const inForce = dated.filter((item) => item.from <= target)
  const chosen = inForce.length > 0
    ? inForce.reduce((a, b) => (b.from > a.from ? b : a))
    : dated.reduce((a, b) => (b.from < a.from ? b : a))
  return chosen.entry
}
