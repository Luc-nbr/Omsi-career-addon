import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { readOmsiLines, str } from './omsiFile'
import { schrijfVeilig } from './veilig'
import { writeWeather } from './weather'
import type { WeatherKind } from '../shared/weather'

/**
 * Situatiebestanden (.osn) leggen vast waar het spel begint: kaart, datum,
 * tijd en welk voertuig van jou is, met zijn plek op de kaart.
 *
 * De app leest ze om het tijdvak van een kaart te bepalen -- dat bepaalt welk
 * wagenpark-bestand geldt, Johannesstift is in 1988 code 221 en in 1994 code
 * 161 -- en schrijft er één, zodat de speler in OMSI alleen nog op Start hoeft
 * te drukken.
 *
 * Het formaat is nagerekend aan de bestanden die OMSI zelf wegschrijft. Een
 * voertuigblok is: pad, x, hoogte, z, vier getallen van het quaternion, drie
 * voor de snelheid, de tegel als x en y uit de bestandsnaam, de kilometerstand
 * en het wagenpark. De twee grondcoördinaten zijn het eerste en het derde
 * getal; dat is te zien aan de bussen die OMSI parkeerde: gelezen als x en z
 * staan ze op 1 tot 5 meter van een rijstrook, gelezen als x en y op 50.
 */

const BOM = Buffer.from([0xff, 0xfe])

/** Wat er klaargezet moet worden. */
export interface SituationRequest {
  mapFolder: string
  name: string
  description: string
  year: number
  /** Dag van het jaar, 1-366. */
  dayOfYear: number
  /** Tijd in minuten na middernacht; boven 1440 rolt de datum door. */
  minutes: number
  vehicle?: {
    /** Pad vanaf de OMSI-map, zoals `vehicles\\...\\bus.bus`. */
    relativePath: string
    lineNumber: string
    terminus: string
    /** Wagenpark waar de bestemmingscodes uit komen; staat achter in het blok. */
    yard?: string
    /**
     * De aanhanger van een gelede bus, als die er is.
     *
     * Een gelede bus is in OMSI twee voertuigen. Zetten we alleen de voorwagen
     * neer, dan begin je met een halve bus -- de balg achterop en verder niets.
     * Zie `src/core/trailer.ts` voor waar de afstand vandaan komt.
     */
    trailer?: {
      relativePath: string
      distance: number
      /** Zoals bij de voorwagen; zie `vars` hieronder. */
      vars?: Array<[string, number]>
    }
    /**
     * Scriptvariabelen die de bus bij het laden meekrijgt.
     *
     * Voor de kleurstelling: het nummer in de CTC-variabele (meestal
     * `Colorscheme`) en de [setvar]-waarden van die kleurstelling, precies wat
     * OMSI's eigen keuzevenster zet. Zie core/kleurstelling.ts. Wat er niet in
     * staat, begint met de beginwaarde uit de scripts van de bus.
     */
    vars?: Array<[string, number]>
  }
  /**
   * De dienstregeling die OMSI meteen moet klaarzetten. Met dit blok staat de
   * lijn, de omloop en de rit al gekozen zodra de situatie geladen is, en hoeft
   * de chauffeur het dienstregelingsmenu niet meer in.
   */
  timetable?: {
    /** Naam van het lijnbestand zonder .ttl, zoals het menu hem toont. */
    lineFile: string
    /** Naam van de omloop, zoals in `[newtour]`. */
    tour: string
    /** Hoeveelste rit van die omloop; daar begint de dienst. */
    trip: number
  }
  /**
   * Het weer. Zonder keuze nemen we over wat er voor deze kaart al klaarstaat;
   * dat past bij de streek en het tijdvak.
   */
  weather?: WeatherKind
  /** Waar het bestand heen gaat; standaard de Situations-map van OMSI. */
  into?: string
  /** Waar de bus komt te staan, in de tegelmaat van OMSI zelf. */
  spawn?: {
    tx: number
    ty: number
    x: number
    z: number
    height: number
    /** Koers in graden, noord nul, met de klok mee. */
    heading: number
    /**
     * De draaiing zoals OMSI hem zelf noteert (x, y, z, w). Een inzetpunt van
     * de kaart heeft er een, en OMSI zet de bus in zijn eigen situaties met
     * precies dat quaternion neer; dan gaat hij ongewijzigd mee in plaats van
     * uit de koers teruggerekend te worden.
     */
    quaternion?: [number, number, number, number]
  }
}

export interface SituationResult {
  file: string
  /** Of de bus ook werkelijk neergezet kon worden. */
  vehiclePlaced: boolean
  /** Of hij op de gevraagde plek staat, of op die uit het sjabloon. */
  spawnPlaced: boolean
  template?: string
  /**
   * Waar het weer vandaan kwam, vanaf de OMSI-map ("maps\X\laststn.osn.owt"),
   * als het van de kaart kwam; zonder keuze en zonder weer van de kaart niets.
   */
  weerVan?: string
}

/** Geeft de index van de regel met deze tag, of -1. */
/** Het `[vars]`-blok: het aantal, dan per variabele de naam en de waarde. */
function varsBlok(vars: Array<[string, number]> | undefined): string[] {
  const lijst = vars ?? []
  return ['[vars]', String(lijst.length), ...lijst.flatMap(([naam, waarde]) => [naam, String(waarde)]), '']
}

function indexOfTag(lines: string[], tag: string): number {
  return lines.findIndex((line) => line.trim() === tag)
}

/** Wijst de kaart aan waar een situatiebestand over gaat. */
function situationMap(file: string): string {
  try {
    const lines = readOmsiLines(file)
    const index = indexOfTag(lines, '[map]')
    if (index < 0) return ''
    const match = str(lines[index + 1]).match(/maps[\\/]([^\\/]+)[\\/]/i)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

/**
 * Is dit een situatie die de app zelf schreef? Die heet "OMSI Enhancer — ..."
 * (vroeger "OMSI Career — ..."), ook als hij als `laststn.osn` klaarstaat.
 */
function isEigen(file: string): boolean {
  try {
    const lines = readOmsiLines(file)
    const index = indexOfTag(lines, '[name]')
    return index >= 0 && /^\s*OMSI (Enhancer|Career)/i.test(lines[index + 1] ?? '')
  } catch {
    return false
  }
}

/** Een bestand zonder inhoud (of dat niet te lezen valt). */
function isLeeg(pad: string): boolean {
  try {
    return statSync(pad).size === 0
  } catch {
    return true
  }
}

/**
 * Koos de app dit weer zelf? `writeWeather` noemt het "OMSI Enhancer - ..."
 * (vroeger "OMSI Career - ..."), en OMSI schrijft die naam na een rit ermee
 * zo terug in `laststn.osn.owt`. Zo'n weer is het weer van een vorige rit,
 * niet dat van de kaart.
 */
export function isEigenWeer(owt: string): boolean {
  try {
    const lines = readOmsiLines(owt)
    const index = indexOfTag(lines, '[name]')
    return index >= 0 && /^\s*OMSI (Enhancer|Career)/i.test(lines[index + 1] ?? '')
  } catch {
    return false
  }
}

/**
 * Het weer van de kaart: het eerste weerbestand naast een situatie van deze
 * kaart dat de app niet zelf koos (`isEigenWeer`). Eerst `laststn.osn` en de
 * kopieën die presetStartup ervan maakte, dan de scenario's in `Situations/`
 * (zonder die van de app zelf: `OMSI Enhancer.osn` draagt het weer van de
 * vorige rit, misschien van een andere kaart).
 *
 * Het weer telt apart van het sjabloon. `findTemplate(..., { zonderEigen })`
 * kiest voor het tijdvak de kopie `laststn.osn.voor-omsi-*`, en daar stond
 * nooit een `.owt` naast: op zes kaarten werd "zoals de kaart" zo het
 * standaardweer van OMSI, en haalde presetStartup het weer van de kaart
 * daarna ook nog weg (tegenlezing 28-09). Een `laststn.osn` die de app
 * schreef mag wel: het weer ernaast is dat van de kaart, tenzij de app het
 * koos -- en dat zegt de naam.
 */
export function findWeather(omsiPath: string, mapFolder: string): string | undefined {
  const kaart = join(omsiPath, 'maps', mapFolder)
  const kandidaten = ['laststn.osn', 'laststn.osn.voor-omsi-enhancer', 'laststn.osn.voor-omsi-career'].map((naam) =>
    join(kaart, naam)
  )
  const situations = join(omsiPath, 'Situations')
  if (existsSync(situations)) {
    for (const entry of readdirSync(situations)) {
      if (entry.toLowerCase().endsWith('.osn')) kandidaten.push(join(situations, entry))
    }
  }
  for (const osn of kandidaten) {
    const owt = `${osn}.owt`
    /*
     * Eerst wat niets kost: zonder weerbestand hoeft de situatie niet open.
     * Een leeg weerbestand telt als geen: er staat geen weer in. Tot de
     * tegenlezing van 29-09 werd het gekozen, en weigerde `schrijfVeilig` het
     * lege bestand over het weer van de vorige rit heen te zetten -- waarna
     * dat weer (door de app gekozen) naast de situatie bleef staan en
     * presetStartup het ook naar laststn.osn.owt kopieerde.
     */
    if (!existsSync(owt) || isLeeg(owt) || isEigenWeer(owt)) continue
    if (situationMap(osn) !== mapFolder) continue
    if (osn.startsWith(situations) && isEigen(osn)) continue
    return owt
  }
  return undefined
}

/** Heeft dit bestand een eigen voertuig? Dan is het een echt gespeelde situatie. */
function hasOwnVehicle(file: string): boolean {
  try {
    return indexOfTag(readOmsiLines(file), '[ismyVehicle]') >= 0
  } catch {
    return false
  }
}

/**
 * Zoekt een situatie die bij deze kaart hoort. OMSI bewaart na elke sessie
 * `laststn.osn` per kaart, en in `Situations/` staan de meegeleverde scenario's.
 */
export function findTemplate(
  omsiPath: string,
  mapFolder: string,
  opties: { zonderEigen?: boolean } = {}
): string | undefined {
  const candidates: string[] = []
  const lastSituation = join(omsiPath, 'maps', mapFolder, 'laststn.osn')
  if (existsSync(lastSituation)) candidates.push(lastSituation)
  /*
   * Zonder de eigen situaties. `laststn.osn` is vaak door de app zelf geschreven
   * (presetStartup), met de datum en het weer van de vorige rit -- dan werd een
   * zelfgekozen datum het tijdvak van de kaart, en het weer van gisteren "zoals
   * de kaart". De kopie die presetStartup van het origineel maakte, is wel
   * van OMSI.
   */
  if (opties.zonderEigen) {
    for (const kopie of ['laststn.osn.voor-omsi-enhancer', 'laststn.osn.voor-omsi-career']) {
      const pad = join(omsiPath, 'maps', mapFolder, kopie)
      if (existsSync(pad)) candidates.push(pad)
    }
  }

  const situations = join(omsiPath, 'Situations')
  if (existsSync(situations)) {
    for (const entry of readdirSync(situations)) {
      if (entry.toLowerCase().endsWith('.osn')) candidates.push(join(situations, entry))
    }
  }

  const forThisMap = candidates.filter(
    (file) => situationMap(file) === mapFolder && !(opties.zonderEigen && isEigen(file))
  )
  return forThisMap.find(hasOwnVehicle) ?? forThisMap[0]
}

/**
 * Het jaar en de dag waarin een kaart speelt. Kaarten met een Chrono-map horen
 * bij een tijdvak: Berlin-Spandau staat op 1988, HafenCity op 2016.
 */
export function readSituationTime(file: string): { year: number; dayOfYear: number } | undefined {
  try {
    const lines = readOmsiLines(file)
    const index = indexOfTag(lines, '[time]')
    if (index < 0) return undefined
    const year = Number.parseInt(str(lines[index + 1]), 10)
    const dayOfYear = Number.parseInt(str(lines[index + 2]), 10)
    if (!Number.isFinite(year) || !Number.isFinite(dayOfYear)) return undefined
    return { year, dayOfYear }
  } catch {
    return undefined
  }
}





/** Een draaiing om de staande as, zoals OMSI hem noteert: x, y, z, w. */
function yawQuaternion(headingDegrees: number): [string, string, string, string] {
  const half = ((headingDegrees * Math.PI) / 180) / 2
  return ['0.000000', Math.sin(half).toFixed(6), '0.000000', Math.cos(half).toFixed(6)]
}

/**
 * Bouwt het situatiebestand zelf op.
 *
 * Een situatie heeft veertien blokken en verder niets: naam, kaart, tijd,
 * camera, het eigen voertuig en twee lijsten met de stand van zijn
 * scriptvariabelen. Die lijsten zijn geteld -- eerst het aantal paren, dan de
 * paren -- en mogen dus ook leeg zijn. Dat is precies wat je wilt voor een
 * dienst die begint: de bus start met wat zijn eigen scripts als beginwaarde
 * hebben, motor uit en deuren dicht, in plaats van met de stand van een
 * willekeurige vorige rit in een andere bus.
 *
 * Daardoor is er geen sjabloon meer nodig en werkt het ook op een kaart die je
 * nooit eerder hebt gespeeld.
 */
export function buildSituation(request: SituationRequest): string[] {
  const dayOverflow = Math.floor(request.minutes / 1440)
  const minuteOfDay = ((request.minutes % 1440) + 1440) % 1440
  const spawn = request.spawn
  const vehicle = request.vehicle

  const lines: string[] = [
    '[name]',
    request.name,
    '[description]',
    request.description,
    '[end]',
    '',
    '[map]',
    `maps\\${request.mapFolder}\\global.cfg`,
    '',
    '[time]',
    String(request.year),
    String(request.dayOfYear + dayOverflow),
    String(Math.floor(minuteOfDay / 60)),
    String(minuteOfDay % 60),
    '0',
    ''
  ]

  if (spawn) {
    lines.push(
      '[centerkachel]',
      String(spawn.tx),
      String(spawn.ty),
      '',
      // De kaartcamera kijkt waar de bus staat; de drie hoeken erna zijn een
      // schuine blik van bovenaf, zoals OMSI er zelf een wegschrijft.
      '[mapcam]',
      spawn.x.toFixed(6),
      (spawn.height + 3).toFixed(6),
      spawn.z.toFixed(6),
      '0',
      '-25',
      '30',
      ''
    )
  }

  // Waar de chauffeur zit ten opzichte van de bus; OMSI schrijft hier dezelfde
  // waarden weg, ongeacht het voertuig.
  lines.push('[egopos]', '10', '0', '10', '0', '0', '')

  /*
   * De vlag dat er met een dienstregeling gereden wordt. OMSI zet hem in elke
   * situatie waarin de speler een omloop heeft gekozen, met een lege regel
   * erachter; zonder de vlag blijft het menu op "vrij rijden" staan.
   */
  if (request.timetable) lines.push('[TT_active]', '')

  if (vehicle && spawn) {
    const q = spawn.quaternion
      ? (spawn.quaternion.map((value) => value.toFixed(6)) as [string, string, string, string])
      : yawQuaternion(spawn.heading)
    lines.push(
      '----------------------------------------------',
      '',
      'Fahrzeug Nr. 0:',
      '',
      '[vehicle]',
      vehicle.relativePath,
      spawn.x.toFixed(3),
      spawn.height.toFixed(3),
      spawn.z.toFixed(3),
      q[0],
      q[1],
      q[2],
      q[3],
      // Stilstaand beginnen.
      '0.000',
      '0.000',
      '0.000',
      String(spawn.tx),
      String(spawn.ty),
      // Kilometerstand; die telt in de app niet mee, we meten het verschil.
      '0.000',
      vehicle.yard ?? '',
      '',
      '[ismyVehicle]',
      '',
      // Wat hier niet staat, begint met de eigen beginwaarden van de bus.
      ...varsBlok(vehicle.vars),
      '[stringvars]',
      '3',
      'SetLineTo',
      ` ${vehicle.lineNumber} `,
      'Matrix_Nr',
      ` ${vehicle.lineNumber} `,
      'IBIS_cabindisplay',
      vehicle.terminus,
      ''
    )

    /*
     * De gekozen dienstregeling. De velden zijn afgelezen aan situaties die
     * OMSI zelf wegschrijft: het lijnbestand, de naam van de omloop, het
     * volgnummer van de rit, de halte waar de bus staat, een vlag en de
     * afwijking op de dienstregeling in seconden. Wij zetten de bus aan het
     * begin van zijn eerste rit en op tijd, dus halte nul en geen afwijking.
     */
    if (request.timetable) {
      lines.push(
        '[settimetable]',
        request.timetable.lineFile,
        request.timetable.tour,
        String(request.timetable.trip),
        '0',
        '1',
        '0',
        ''
      )
    }

    /*
     * De aanhanger, als tweede voertuig.
     *
     * Zo doet OMSI het zelf ook: in `Nur für Fortgeschrittene.osn` staan de
     * voorwagen en de aanhanger achter elkaar, en de tweede draagt een
     * `[coupledwith]`-blok. Hij staat op dezelfde tegel en in dezelfde richting,
     * alleen `distance` meter naar achteren -- vooruit is (sin, cos) van de
     * koers, dus naar achteren is dat eraf.
     */
    const trailer = vehicle.trailer
    if (trailer) {
      const rad = (spawn.heading * Math.PI) / 180
      lines.push(
        '----------------------------------------------',
        '',
        'Fahrzeug Nr. 1:',
        '',
        '[vehicle]',
        trailer.relativePath,
        (spawn.x - Math.sin(rad) * trailer.distance).toFixed(3),
        spawn.height.toFixed(3),
        (spawn.z - Math.cos(rad) * trailer.distance).toFixed(3),
        q[0],
        q[1],
        q[2],
        q[3],
        '0.000',
        '0.000',
        '0.000',
        String(spawn.tx),
        String(spawn.ty),
        '0.000',
        vehicle.yard ?? '',
        '',
        // OMSI zet hier -1; de koppeling zelf leidt het spel uit de bestanden af.
        '[coupledwith]',
        '-1',
        '',
        ...varsBlok(trailer.vars),
        '[stringvars]',
        '0',
        ''
      )
    }

    lines.push(
      '----------------------------------------------',
      '',
      // Nul: de voorwagen. De aanhanger is nummer 1 en bestuur je niet.
      '[myvehicle]',
      '0',
      ''
    )
  }

  lines.push('[view]', '3', '')
  return lines
}

/**
 * Schrijft de situatie waarmee OMSI opstart.
 *
 * Alles wordt zelf opgebouwd, zonder sjabloon; zie `buildSituation`. Alleen het
 * weer komt van elders als de beller er geen kiest.
 */
export function writeSituation(omsiPath: string, request: SituationRequest): SituationResult {
  const lines = buildSituation(request)
  const folder = request.into ?? join(omsiPath, 'Situations')
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'OMSI Enhancer.osn')

  /*
   * De app heette eerst OMSI Career en schreef toen een situatie onder die naam.
   * Die zou anders in het laadmenu blijven staan naast de nieuwe, met gegevens
   * van een dienst die allang voorbij is.
   */
  for (const stale of ['OMSI Career.osn', 'OMSI Career.osn.owt']) {
    try {
      if (existsSync(join(folder, stale))) unlinkSync(join(folder, stale))
    } catch {
      // Zit hij vast, dan blijft hij staan; dat is hooguit rommel.
    }
  }
  /*
   * Via `schrijfVeilig` (core/veilig.ts): eerst een tijdelijk bestand naast de
   * situatie dat teruggelezen wordt, dan hernoemen. Tot 0.4.9 rechtstreeks, en
   * een afgebroken schrijfbeurt liet een halve situatie in OMSI's laadmenu --
   * die presetStartup daarna ook nog als "Last Situation" kopieerde. De bytes
   * gaan ongewijzigd door: UTF-16 met BOM, zoals OMSI het zelf schrijft. De
   * tijdelijke naam eindigt op `.bezig`, dus OMSI ziet hem nooit als `.osn`.
   */
  schrijfVeilig(file, Buffer.concat([BOM, Buffer.from(lines.join('\r\n'), 'utf16le')]))

  /*
   * Het weer hoort bij de situatie. Wie het zelf kiest krijgt precies dat;
   * anders nemen we over wat er voor deze kaart al klaarstond, want dat past bij
   * de streek en het tijdvak (`findWeather`). Zonder bestand valt OMSI terug op
   * zijn standaard.
   */
  const template = findTemplate(omsiPath, request.mapFolder, { zonderEigen: true })
  let weerVan: string | undefined
  try {
    const vanKaart = request.weather ? undefined : findWeather(omsiPath, request.mapFolder)
    if (request.weather) writeWeather(file, request.weather)
    else if (vanKaart) {
      schrijfVeilig(`${file}.owt`, readFileSync(vanKaart))
      weerVan = relative(omsiPath, vanKaart)
    }
    /*
     * Geen keuze en niets van de kaart: dan het standaardweer van OMSI. Een
     * oud weerbestand van een vorige rit hoort daar niet te blijven staan,
     * want OMSI leest het gewoon mee.
     */ else if (existsSync(`${file}.owt`)) unlinkSync(`${file}.owt`)
  } catch {
    // Weer is bijzaak; de dienst werkt ook zonder.
  }

  return {
    file,
    vehiclePlaced: Boolean(request.vehicle && request.spawn),
    spawnPlaced: Boolean(request.spawn),
    template: template ? basename(template) : undefined,
    weerVan
  }
}
