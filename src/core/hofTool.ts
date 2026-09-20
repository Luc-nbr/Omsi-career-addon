import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { readHof, normalise, type Hof } from './hof'
import { readOmsiLines } from './omsiFile'

/**
 * Wagenparken van de ene bus naar de andere zetten.
 *
 * WAAROM DIT BESTAAT
 * Een `.hof` hoort in de map van een bus, niet bij de kaart. Rijd je op
 * HamburgLi20 met een bus die dat wagenpark niet naast zich heeft liggen, dan
 * kent hij geen enkele bestemmingscode: de IBIS accepteert je invoer niet en de
 * film blijft leeg. De gewoonte in de OMSI-wereld is dan het bestand met de hand
 * te kopieren. Dat is precies het soort werk dat een app hoort te doen.
 *
 * Het raakt ons ook zelf: `pickVehicle` slaat elke bus zonder passend wagenpark
 * over. Op de kaarten van deze gebruiker kent doorgaans maar een handvol van de
 * achtenvijftig bussen de bestemmingen, en alleen die staan in het busmenu.
 *
 * WAAROM NIET BLIND KOPIEREN
 * Een wagenpark draagt per bestemming een rij tekstvelden, en de bus leest die
 * op volgnummer: veld 0 is het IBIS-scherm, veld 4 de rollbandtextuur, enzovoort.
 * Welke betekenis bij welk nummer hoort ligt niet overal gelijk. In de
 * installatie van deze gebruiker staan 449 wagenparken in dertien verschillende
 * indelingen: de gewone met zeven velden (266 bestanden), dezelfde plus een
 * Krüger-bitmap (26), een oudere met zes, de matrixbussen van HafenCity met vijf,
 * en de treinen met drie. Geef een zevenveldsbus een driewveldsbestand en zijn
 * script leest velden die er niet zijn.
 *
 * Gelukkig staat de betekenis in het bestand zelf, als commentaarregels
 * ("string4: Rollbandtextur"). Daarmee is per bus vast te stellen welke
 * indeling hij gewend is, en of een kandidaat daarbij past.
 */

/** De veldindeling van een wagenpark: hoeveel velden, en wat ze betekenen. */
export interface HofSchema {
  /** `stringcount_terminus`; hoeveel tekstvelden elke bestemming draagt. */
  count: number
  /**
   * De omschrijvingen zoals ze in het bestand staan, op volgorde. Leeg als het
   * bestand ze niet vermeldt -- dan blijft alleen het aantal over om op te gaan.
   */
  fields: string[]
}

/** Een wagenpark zoals het op schijf ligt, met alles wat nodig is om te kiezen. */
export interface HofFile {
  /** Volledig pad. */
  path: string
  /** Bestandsnaam met extensie; zo komt hij ook in de doelmap te liggen. */
  file: string
  /** De map van de bus waar hij nu ligt. */
  owner: string
  hof: Hof
  schema: HofSchema
}

/** Wat er van een bus te zeggen valt voor deze kaart. */
export interface BusHofState {
  /** Mapnaam onder `Vehicles`. */
  folder: string
  /** De indelingen die deze bus al draagt; daar moet een kandidaat bij passen. */
  schemas: HofSchema[]
  /** Het beste dat hij nu zelf heeft: hoeveel eindbestemmingen hij herkent. */
  known: number
  /** Naam van dat wagenpark, als hij er een heeft. */
  knownFile?: string
  /** Wat we zouden neerzetten om hem de kaart te leren kennen. */
  offer?: { source: string; file: string; matched: number }
}

/**
 * Leest alleen de kop van een wagenpark: het aantal velden en hun betekenis.
 *
 * Apart van `readHof`, want hiervoor hoeven de honderden bestemmingen niet
 * ontleed te worden en bij 449 bestanden scheelt dat.
 */
export function readSchema(path: string, gelezen?: string[]): HofSchema {
  const lines = gelezen ?? readOmsiLines(path)
  let count = 6
  const fields: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === 'stringcount_terminus') {
      const parsed = Number.parseInt((lines[i + 1] ?? '').trim(), 10)
      if (Number.isFinite(parsed) && parsed >= 0) count = parsed
      continue
    }
    /*
     * De uitleg staat als "string4:<tab>Rollbandtextur". Het is commentaar en
     * geen blok, dus alleen te herkennen aan die vorm. Bestanden zonder die
     * regels bestaan; dan houden we het bij het aantal.
     */
    const match = line.match(/^\s*string\s*(\d+)\s*:\s*\t*\s*(.+?)\s*$/i)
    if (match) fields[Number.parseInt(match[1], 10)] = match[2]
  }
  return { count, fields: [...fields].map((value) => value ?? '') }
}

/**
 * Past deze kandidaat bij een indeling die de bus al draagt?
 *
 * De kandidaat moet minstens zoveel velden hebben, met dezelfde betekenis op
 * dezelfde plaats. Meer velden mag: die leest het script gewoon niet. Minder
 * niet, want dan grijpt het mis.
 *
 * Kent een van beide zijden geen omschrijvingen, dan blijft het aantal over.
 * Dat is zwakker bewijs, dus daar is de eis gelijkheid en geen "minstens".
 */
function fitsOne(bus: HofSchema, candidate: HofSchema): boolean {
  if (bus.fields.length === 0 || candidate.fields.length === 0) {
    return bus.count === candidate.count
  }
  if (candidate.count < bus.count) return false
  return bus.fields.every(
    (field, index) => normalise(field) === normalise(candidate.fields[index] ?? '')
  )
}

/**
 * Past dit wagenpark bij deze bus?
 *
 * Niet: "past het bij DE indeling van de bus" -- die heeft hij niet. Een bus
 * draagt vaak wagenparken in verschillende indelingen tegelijk; in deze
 * installatie heeft elke bus zowel een bestand van zeven velden als een van
 * zesentwintig. Zijn script leest kennelijk allebei.
 *
 * Dus is de vraag of de bus al met zo'n vorm leeft. Vindt er een van zijn
 * bestaande wagenparken hem passen, dan is de kandidaat net zo veilig als wat
 * er al ligt. De eerste versie nam de indeling met de meeste velden als "de"
 * indeling, en die verwierp daarna elk gewoon bestand van zeven -- op
 * HamburgLi20 kreeg zo geen enkele bus een aanbod terwijl het bestand er lag.
 */
export function schemaFits(bus: HofSchema[] | undefined, candidate: HofSchema): boolean {
  if (!bus || bus.length === 0) return true
  return bus.some((own) => fitsOne(own, candidate))
}

/**
 * De laatste lezing, met de vingerafdruk waarbij hij gold.
 *
 * Het doorlezen van alle wagenparken kost hier 1,0 tot 1,3 seconde: 448
 * bestanden, en elk gaat er twee keer doorheen -- een keer voor de bestemmingen
 * en een keer voor de veldindeling. Dat gebeurde bij elke vraag opnieuw, en de
 * vragen komen uit het hoofdproces: zolang zo'n lezing loopt tekent er geen
 * venster, beweegt de overlay niet en wacht elke klik. Wie in de dienstenlijst
 * op en neer klikt gaf daarmee per dienst een seconde weg.
 *
 * Wat er ligt verandert zelden -- een bus installeren, of de app die zelf een
 * bestand neerzet -- dus is het antwoord te bewaren zolang het klopt.
 */
let laatsteLezing: { pad: string; vinger: string; hofs: HofFile[] } | undefined

/**
 * Waaraan te zien is dat er iets veranderd is.
 *
 * Windows werkt de tijd van een map bij zodra er een bestand in of uit gaat, dus
 * de tijden van de voertuigmappen samen dekken precies wat wij hier lezen: een
 * nieuw geinstalleerde bus, en het bestand dat `placeHof` zelf neerzet. De 154
 * mappen navragen kost 17 ms, tegen 716 voor een lezing.
 */
function vingerafdruk(root: string): string {
  const delen: string[] = []
  for (const folder of readdirSync(root)) {
    try {
      const stat = statSync(join(root, folder))
      if (stat.isDirectory()) delen.push(`${folder}:${stat.mtimeMs}`)
    } catch {
      // Een map die net weg is telt niet mee; de volgende lezing merkt het.
    }
  }
  return delen.join('|')
}

/**
 * Dezelfde afdruk, voor wie hem buiten dit bestand nodig heeft.
 *
 * De schijfcache bewaarde de busindex en de wagenparken onder de afdruk uit
 * `kaartcache.ts`, en die kijkt naar `tile_*.map` en `global.cfg` -- bestanden
 * die in `Vehicles` niet bestaan. Daarmee was de afdruk daar een vaste waarde:
 * de cache sloeg altijd aan, ook nadat er een bus bij was gezet. Deze afdruk
 * kijkt naar de mappen zelf en ziet dat wel.
 */
export function wagenparkAfdruk(omsiPath: string): string {
  const root = join(omsiPath, 'Vehicles')
  if (!existsSync(root)) return ''
  return createHash('sha1').update(vingerafdruk(root)).digest('hex')
}

/** Alle wagenparken die in de voertuigmappen liggen. */
export function scanHofs(omsiPath: string): HofFile[] {
  const root = join(omsiPath, 'Vehicles')
  if (!existsSync(root)) return []

  const vinger = vingerafdruk(root)
  if (laatsteLezing && laatsteLezing.pad === omsiPath && laatsteLezing.vinger === vinger) {
    return laatsteLezing.hofs
  }

  const found: HofFile[] = []
  for (const folder of readdirSync(root)) {
    const dir = join(root, folder)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    for (const entry of readdirSync(dir)) {
      if (extname(entry).toLowerCase() !== '.hof') continue
      const path = join(dir, entry)
      try {
        // Een keer van schijf, twee lezingen eruit.
        const regels = readOmsiLines(path)
        found.push({
          path,
          file: entry,
          owner: folder,
          hof: readHof(path, regels),
          schema: readSchema(path, regels)
        })
      } catch {
        // Een onleesbaar wagenpark slaan we over; de rest kan gewoon door.
      }
    }
  }
  laatsteLezing = { pad: omsiPath, vinger, hofs: found }
  return found
}

/** Hoeveel van deze eindbestemmingen dit wagenpark kent. */
function coverage(hof: Hof, wanted: Set<string>): number {
  let hits = 0
  const seen = new Set<string>()
  for (const terminus of hof.termini) {
    const key = normalise(terminus.station)
    if (!wanted.has(key) || seen.has(key)) continue
    seen.add(key)
    hits++
  }
  return hits
}

/** De indelingen die een bus al draagt, elk hooguit een keer. */
function busSchemas(own: HofFile[]): HofSchema[] {
  const seen = new Map<string, HofSchema>()
  for (const entry of own) {
    const key = `${entry.schema.count}|${entry.schema.fields.map(normalise).join('|')}`
    if (!seen.has(key)) seen.set(key, entry.schema)
  }
  return [...seen.values()]
}

/**
 * Wat er per bus te halen valt op deze kaart.
 *
 * `termini` zijn de eindbestemmingen van de dienstregeling, in dezelfde vorm als
 * `pickHof` ze krijgt. De bussen die de kaart al kennen komen er ook in te staan,
 * want de gebruiker hoort te zien wat er niet hoeft.
 */
export function planHofs(
  omsiPath: string,
  termini: string[],
  hofs = scanHofs(omsiPath)
): BusHofState[] {
  const wanted = new Set(termini.map(normalise).filter(Boolean))
  if (wanted.size === 0) return []

  const perFolder = new Map<string, HofFile[]>()
  for (const entry of hofs) {
    const list = perFolder.get(entry.owner)
    if (list) list.push(entry)
    else perFolder.set(entry.owner, [entry])
  }

  /*
   * De kandidaten: wagenparken die deze kaart werkelijk kennen, het beste
   * vooraan. Twee bussen kunnen hetzelfde bestand hebben; welk exemplaar we
   * pakken maakt niet uit zolang de indeling past, dus we houden ze allemaal en
   * kiezen per bus de eerste die past.
   */
  const candidates = hofs
    .map((entry) => ({ entry, matched: coverage(entry.hof, wanted) }))
    .filter((item) => item.matched > 0)
    .sort((a, b) => b.matched - a.matched)

  /*
   * Alle busmappen, niet alleen die met een wagenpark.
   *
   * Hier stond `for (const [folder, own] of perFolder)`, en die lijst komt uit
   * de gevonden .hof-bestanden. Een bus zonder enig wagenparkbestand kwam er
   * dus niet in voor -- terwijl dat juist de bus is die het nodig heeft: hij
   * kent geen enkele bestemming, het matrixbord blijft leeg en de IBIS weigert
   * de codes. In het busmenu bleef de tegel "wagenpark erbij halen" daardoor
   * weg bij precies de bussen waar hij hoorde te staan.
   */
  let mappen: string[]
  try {
    mappen = readdirSync(join(omsiPath, 'Vehicles'))
  } catch {
    mappen = [...perFolder.keys()]
  }

  const result: BusHofState[] = []
  for (const folder of mappen) {
    const own = perFolder.get(folder) ?? []
    // Alleen echte bussen; mappen zonder .bus zijn treinen, auto's en decor.
    const dir = join(omsiPath, 'Vehicles', folder)
    let inhoud: string[]
    try {
      inhoud = readdirSync(dir)
    } catch {
      continue
    }
    if (!inhoud.some((name) => extname(name).toLowerCase() === '.bus')) continue

    const schemas = busSchemas(own)
    let known = 0
    let knownFile: string | undefined
    for (const entry of own) {
      const hits = coverage(entry.hof, wanted)
      if (hits > known) {
        known = hits
        knownFile = entry.file
      }
    }

    const state: BusHofState = { folder, schemas, known, knownFile }

    /*
     * Alleen aanbieden als het beter wordt. Een bus die de helft van de
     * bestemmingen kent is misschien niet ideaal, maar een bestand ernaast
     * leggen dat evenveel kent helpt niemand.
     */
    const best = candidates.find(
      (item) =>
        item.entry.owner !== folder &&
        item.matched > known &&
        schemaFits(schemas, item.entry.schema) &&
        !own.some((mine) => mine.file.toLowerCase() === item.entry.file.toLowerCase())
    )
    if (best) {
      state.offer = { source: best.entry.path, file: best.entry.file, matched: best.matched }
    }
    result.push(state)
  }

  return result.sort((a, b) => a.folder.localeCompare(b.folder))
}

/** Wat er bij het overzetten gebeurd is; gaat naar het profiel zodat het terug kan. */
export interface HofPlacement {
  /** Waar het bestand nu ligt. */
  path: string
  /** Waar het vandaan kwam. */
  source: string
  placedAt: string
}

/**
 * Zet een wagenpark in de map van een bus.
 *
 * Nooit over een bestaand bestand heen: de bus kiest zelf in het menu welk
 * wagenpark hij gebruikt, dus ernaast leggen kost niets en overschrijven kan
 * iemands eigen aanpassing wissen. Bestaat de naam al, dan gebeurt er niets en
 * dat is geen fout -- hij had hem al.
 */
export function placeHof(omsiPath: string, folder: string, source: string): HofPlacement | undefined {
  const target = join(omsiPath, 'Vehicles', folder, basename(source))
  if (existsSync(target)) return undefined
  if (!existsSync(source)) return undefined
  if (!existsSync(dirname(target))) return undefined
  copyFileSync(source, target)
  return { path: target, source, placedAt: new Date().toISOString() }
}

/**
 * Wat de app in de spelmap heeft neergezet.
 *
 * Dit staat er niet voor de netheid maar omdat het terug moet kunnen. De app
 * schrijft in andermans spelmap; dan hoort er een lijst te zijn van precies wat
 * er bij is gekomen, zodat het ook weer weg kan zonder dat iemand hoeft te
 * raden welk bestand van hem was en welk van ons.
 */
export function placementsFile(userDataPath: string): string {
  return join(userDataPath, 'hofs.json')
}

export function readPlacements(userDataPath: string): HofPlacement[] {
  const file = placementsFile(userDataPath)
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? (parsed as HofPlacement[]) : []
  } catch {
    return []
  }
}

export function writePlacements(userDataPath: string, list: HofPlacement[]): void {
  writeFileSync(placementsFile(userDataPath), JSON.stringify(list, null, 2), 'utf8')
}

/**
 * Een neergezet wagenpark weer weghalen.
 *
 * Alleen wat wij er zelf hebben neergezet, en alleen als het er nog precies zo
 * ligt: is het bestand sindsdien veranderd, dan heeft iemand eraan gewerkt en
 * blijft het staan. Liever een bestand te veel dan het werk van een ander weg.
 */
export function undoPlacement(userDataPath: string, path: string): boolean {
  const list = readPlacements(userDataPath)
  const entry = list.find((item) => item.path === path)
  if (!entry) return false
  if (existsSync(entry.path)) {
    try {
      const mine = readFileSync(entry.source)
      const there = readFileSync(entry.path)
      if (!mine.equals(there)) return false
      rmSync(entry.path)
    } catch {
      return false
    }
  }
  writePlacements(
    userDataPath,
    list.filter((item) => item.path !== path)
  )
  return true
}
