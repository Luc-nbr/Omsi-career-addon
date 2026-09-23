import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Apparaatsoort, Busapparaat, Uitlijning } from './busscherm'
import { log } from './logboek'
import type { Duty, DutyLeg } from './types'

/**
 * Wat de plugin elke tiende seconde wegschrijft. De namen komen uit OMSI's eigen
 * variabelentabellen; `time` is seconden na middernacht, zoals de busscripts
 * laten zien met `(L.S.Time) 3600 /` voor uren, en `velocity` is km/h, want die
 * scripts delen hem door 3.6 voor hun natuurkunde.
 */
export interface LiveData {
  alive: boolean
  /** Welke plugin dit schreef; ontbreekt bij een plugin van voor 22-09-2026. */
  plugin?: number
  /**
   * Wat er op het schermpje van de bus staat. Welke velden gevuld zijn hangt
   * van het busmodel af: een MAN vult `bestemming` en `lijn`, de Thueringer
   * Wald-bus zijn LAWO met vier regels. Ontbreekt bij een oudere plugin.
   */
  ibis?: {
    bestemming: string
    lijn: string
    lawo1: string
    lawo2: string
    lawo3: string
    lawo4: string
    /** De twee regels van de AFR 200, de kaartautomaat in de Thueringer Wald-bus. */
    afr1: string
    afr2: string
  }
  /**
   * Welke bus er rijdt, zoals hij in het geheugen van OMSI staat: de naam uit
   * het keuzescherm, het modelbestand en de map. Daarmee vindt de app de
   * `model.cfg` en dus de schermpjes van deze bus; zie core/busscherm.ts.
   * Ontbreekt bij een plugin ouder dan 6.
   */
  bus?: {
    naam: string
    model: string
    pad: string
    /** Het `.bus`-bestand zelf, als OMSI het op die plek bijhoudt; vaak leeg. */
    bestand: string
  }
  /**
   * De stringvariabelen van de bus die de app gevraagd heeft, met wat erin
   * staat. De app zegt in `vragen.txt` welke namen ze wil; dat zijn de
   * variabelen die in de model.cfg aan een schermpje hangen, plus de namen van
   * de kaartautomaat. Namen die deze bus niet kent, staan er niet in.
   */
  vars?: Record<string, string>
  /** Pasten niet alle gevraagde variabelen in het bericht? Dan mist er iets. */
  varsAfgekapt?: boolean
  /** Bitmasker van de variabelen die OMSI werkelijk heeft doorgegeven. */
  seen: number
  /**
   * Idem voor de systeemvariabelen. Ontbreekt bij een plugin van voor
   * 19-09-2026; dan weten we niet of een nul "geen aanrijding" betekent of
   * "niet doorgegeven", en houden we het op het eerste.
   */
  seenSys?: number
  /** Idem voor de stringvariabelen. */
  seenStr: number
  /** Hoe de tekst binnenkwam: 0 niets, 1 als bytes, 2 als twee bytes per teken. */
  strKind: number
  time: number
  day: number
  month: number
  year: number
  velocity: number
  passengers: number
  scheduleActive: number
  targetIndex: number
  tankPercent: number
  km: number
  metres: number
  entryRequest: number
  exitRequest: number
  ticket: number
  entryOpen: number
  exitOpen: number
  atStation: number
  brightness: number
  streetCond: number
  precipRate: number
  precipType: number
  lightsLow: number
  blinkerLeft: number
  blinkerRight: number
  brakeLight: number
  engineOn: number
  busstopIndex: number
  /** Rijstijl, opgeteld sinds het spel startte. */
  maxBrake: number
  maxAccel: number
  topSpeed: number
  harshBrakes: number
  harshAccels: number
  /**
   * De accu van een elektrische bus, als deel van 0 tot 1. Komt uit het script
   * van het busmodel; op een dieselbus staat hij er niet.
   */
  battery?: number
  /** Buiten, in graden. Systeemvariabele, dus overal hetzelfde weer. */
  temperature?: number
  /**
   * Aanrijdingen sinds het spel startte, en hoe hard.
   *
   * `coll_energy` is een systeemvariabele en bestaat dus op elke bus, ook op
   * modellen die zelf geen schade bijhouden. De grens waarboven het een
   * aanrijding heet komt uit OMSI's eigen busscripts; zie de plugin.
   */
  collisions?: number
  collisionEnergy?: number
  worstCollision?: number
  /** Alleen gevuld op bussen met een IBIS; anders leeg. */
  busstop: string
  delayMin: string
  delaySec: string
  line: string
  terminus: string
  matrix: string
  /** Hoe oud het bestand is, in milliseconden. Zet de app zelf, niet de plugin. */
  ageMs?: number
  /** Welke OMSI draait, zoals de plugin die in het programma zelf las. */
  exeVersion?: string
  /** Rechtstreeks uit het geheugen van OMSI; alleen op 2.3.004, zie omsicareer.c. */
  mem?: MemoryData
}

export interface MemoryData {
  /** 1 als het voertuig van de speler gevonden en de positie aannemelijk is. */
  ok: number
  /** Index in de tegellijst van global.cfg. */
  tile: number
  /** Positie binnen de tegel, zoals Direct3D hem kent. */
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  /** Wat het dienstregelingsmenu van OMSI op de bus zette. */
  schedActive: number
  line: number
  tour: number
  tourEntry: number
  trip: number
  nextIndex: number
  nextDist: number
  delay: number
  lineName: string
  tourName: string
  tripName: string
  nextStop: string
  /*
   * De kaartverkoop aan de deur; zie de plugin. `koper` is -1 als er niemand
   * staat te betalen. Ouder dan de plugin van 22-09-2026 geeft dit niet door,
   * vandaar de vraagtekens.
   */
  /** Het laatste opdrachtnummer dat de plugin uitvoerde, en of het lukte. */
  opdracht?: number
  opdrachtFout?: number
  koper?: number
  ticketSoort?: number
  ticketIndex?: number
  ticketPrijs?: number
  ticketGegeven?: number
  ticketSlecht?: number
  ticketKlaar?: number
}

/**
 * Wat er aan de deur verkocht wordt.
 *
 * OMSI zet dit zelf linksboven in beeld -- welk kaartje de passagier wil, wat
 * het kost en hoeveel geld hij gegeven heeft -- maar geeft het niet aan een
 * plugin door. De plugin leest het uit het geheugen van het spel; zie
 * `read_memory` in plugin/omsicareer.c.
 */
export interface Verkoop {
  /** Welk kaartje, als plek in het kaartpakket van de kaart. */
  kaartje: number
  /** Wat het kost, in euro's. */
  prijs: number
  /** Wat de chauffeur van hem aangenomen heeft. */
  gegeven: number
  /** Te weinig wisselgeld teruggegeven; de passagier is er niet blij mee. */
  slechtWisselgeld: boolean
  /** Afgehandeld: hij mag doorlopen. */
  klaar: boolean
}

/**
 * Ouder dan dit is een live-bestand geen live meer. De plugin schrijft tien keer
 * per seconde; wie OMSI hard afsluit laat een bestand achter dat "alive" zegt.
 */
const LIVE_STALE_MS = 15000

/** Zoveel moet er sinds het starten gereden zijn voordat een dienst vanzelf af kan zijn. */
const MIN_DRIVEN_KM = 1

/**
 * Bitposities in `seen`, gelijk aan de volgorde in OMSICareer.opl. Alles vanaf
 * `lightsLow` komt uit de scripts van het busmodel en ontbreekt op bussen die
 * het niet kent — dan mag de app er geen conclusie aan verbinden.
 */
const BIT = {
  /*
   * Welk kaartje er in de bus gekozen is. `GivenTicket` is geen teller maar de
   * keuze van de chauffeur op de kaartautomaat: -1 als er niets gekozen is, en
   * anders de plek in het kaartpakket van de kaart. Niet elke bus heeft hem.
   */
  ticket: 9,
  lightsLow: 17,
  blinkerLeft: 18,
  blinkerRight: 19,
  brakeLight: 20,
  engineOn: 21,
  busstopIndex: 22,
  battery: 23
} as const

/** Bitposities in `seenSys`, gelijk aan de volgorde in de systeemlijst. */
const SYSBIT = {
  collEnergy: 6,
  temperature: 7
} as const

function has(data: LiveData, bit: number): boolean {
  return ((data.seen >>> bit) & 1) === 1
}

/**
 * Of OMSI deze systeemvariabele werkelijk heeft doorgegeven.
 *
 * Een oudere plugin stuurt geen `seenSys` mee. Die kende de nieuwe namen ook
 * niet, dus dan is het antwoord nee -- en niet "we weten het niet", want daar
 * kan de interface niets mee.
 */
function hasSys(data: LiveData, bit: number): boolean {
  return ((( data.seenSys ?? 0) >>> bit) & 1) === 1
}

/**
 * Waar de plugin zijn gegevens neerzet: `OMSI Career` in de lokale AppData.
 *
 * De map heet nog naar de oude naam van de app. Dat pad zit ingebakken in de
 * DLL die in OMSI draait; meeveranderen betekent de plugin opnieuw bouwen en
 * bij iedereen vervangen, en daar wint niemand iets mee.
 *
 * WAAROM NIET ALLEEN %LOCALAPPDATA%
 * Lucs app kreeg op 21-09 nooit verbinding, met de oude en met de nieuwe
 * versie, terwijl de plugin vanaf 22:57:58 gewoon naar
 * C:\Users\lucru\AppData\Local\OMSI Career schreef. De app vond daar zelfs het
 * plugin-logboek niet: bij de start om 22:46 ontbrak de regel "plugin-logboek",
 * die elke proefstart van dezelfde bouw wel schreef. Zijn app, geopend vanuit
 * het Startmenu, zocht dus op een andere plek dan de plugin schrijft. Een
 * proefstart vanaf de opdrachtregel kreeg de variabele goed mee, en daarom
 * werkte het daar wel.
 *
 * Dus kijkt de app op meer plekken: de variabele, en de lokale AppData die
 * Windows zelf opgeeft (naast AppData\Roaming, uit `stelLiveMappenIn`). Waar de
 * plugin het laatst iets schreef, daar is hij. Een proef kan de map vastzetten
 * met OMSI_ENHANCER_LIVEMAP, zodat een nep-live.json niet wedijvert met het
 * echte spel.
 */
let andereMappen: string[] = []
let gekozenMap: string | undefined
let gekozenOp = 0

export function stelLiveMappenIn(lokaleAppData: string[]): void {
  andereMappen = lokaleAppData.filter(Boolean)
  gekozenMap = undefined
}

function kandidaten(): string[] {
  const alle = [process.env.LOCALAPPDATA ?? '', ...andereMappen].filter(Boolean)
  const gezien = new Set<string>()
  return alle.filter((map) => {
    const sleutel = map.toLowerCase().replace(/[\\/]+$/, '')
    if (gezien.has(sleutel)) return false
    gezien.add(sleutel)
    return true
  })
}

/** Welke map `OMSI Career` de plugin gebruikt. Eens per vijf tellen opnieuw bekeken. */
export function liveMap(): string {
  const vast = process.env.OMSI_ENHANCER_LIVEMAP
  if (vast) return vast
  const nu = Date.now()
  if (gekozenMap && nu - gekozenOp < 5000) return gekozenMap
  gekozenOp = nu
  let beste: string | undefined
  let besteTijd = -Infinity
  for (const basis of kandidaten()) {
    const map = join(basis, 'OMSI Career')
    for (const naam of ['live.json', 'plugin.log']) {
      try {
        const tijd = statSync(join(map, naam)).mtimeMs
        if (tijd > besteTijd) {
          besteTijd = tijd
          beste = map
        }
      } catch {
        // Niet hier.
      }
    }
  }
  const keus = beste ?? join(kandidaten()[0] ?? '', 'OMSI Career')
  if (keus !== gekozenMap) {
    log(
      `plugin-map: ${keus} (LOCALAPPDATA in dit proces: ${process.env.LOCALAPPDATA ?? 'ontbreekt'})`
    )
  }
  gekozenMap = keus
  return keus
}

export function livePath(): string {
  return join(liveMap(), 'live.json')
}

/**
 * Het eigen logboek van de plugin, van de laatste keer dat OMSI draaide.
 *
 * De plugin zet daarin of hij geladen werd, of OMSI PluginStart aanriep, waar
 * hij schrijft, of er gegevens binnenkwamen en of het schrijven lukte. Zie de
 * kop van `g_logPath` in plugin/omsicareer.c voor waarom dat er is.
 */
export function pluginLogboek(): { regels: string[]; tijd: number } | undefined {
  const file = join(dirname(livePath()), 'plugin.log')
  try {
    const tijd = statSync(file).mtimeMs
    const regels = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-40)
    return { regels, tijd }
  } catch {
    return undefined
  }
}

/** Leest de laatste stand. Geeft `undefined` als OMSI niet draait. */
export function readLive(): LiveData | undefined {
  const file = livePath()
  if (!existsSync(file)) return undefined
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as LiveData
    data.ageMs = Date.now() - statSync(file).mtimeMs
    return data
  } catch {
    // Het bestand wordt atomair vervangen, maar een halve lezing blijft mogelijk.
    return undefined
  }
}

/**
 * Het schermpje van de bus, zoals het in de bus zelf staat.
 *
 * WAAROM DIT ZO LOS IS
 * Elke bus heeft een ander apparaat: een MAN heeft een IBIS met een regel of
 * twee, de Thueringer Wald-bus een LAWO met vier regels, en een moderne bus een
 * boordcomputer met veel meer erop. De app spiegelt daarom wat de bus werkelijk
 * doorgeeft -- de regels die er zijn, in de volgorde waarin ze op het apparaat
 * staan -- en verzint er niets bij. Staat er niets, dan tekent de app zijn
 * eigen scherm met wat de dienst en de plugin wel weten.
 */
/** Een apparaat in de bus, met wat er nu op staat. */
export interface Apparaatweergave {
  /** De naam waaronder de bus het kent, bijvoorbeeld "afr_display". */
  naam: string
  soort: Apparaatsoort
  /** De regels, in de volgorde waarin ze op het apparaat staan. */
  regels: string[]
  /** De vorm, uit de model.cfg van de bus; zie core/busscherm.ts. */
  achtergrond: string
  tekstkleur: string
  uitlijning: Uitlijning
  breedte: number
  hoogte: number
}

export interface IbisScherm {
  /**
   * Welk apparaat er in deze bus zit. `bus` betekent: uit de model.cfg van de
   * bus zelf, en dan staat in `apparaten` precies wat erin zit. De andere drie
   * zijn de terugval voor een oudere plugin, die alleen de vaste namen kende.
   */
  soort: 'bus' | 'afr' | 'lawo' | 'ibis'
  /** De regels van het eerste apparaat; zonder lege regels aan het eind. */
  regels: string[]
  /** Alle apparaten van deze bus, als de model.cfg gelezen kon worden. */
  apparaten?: Apparaatweergave[]
  /** De bestemming en de lijn/omloop zoals de IBIS ze kent. */
  bestemming?: string
  lijn?: string
}

/** Een waarschuwing voor de chauffeur, met een reden erbij. */
export interface Advice {
  /** Sleutel van de melding; de tekst komt uit de vertaling ("advice.<id>"). */
  id: string
  severity: 'info' | 'warn'
  /** Getal in de melding, als er een in voorkomt. */
  count?: number
}

export interface LiveStatus {
  /** Klok in het spel, minuten na middernacht. */
  clockMinutes: number
  speedKmh: number
  passengers: number
  entryRequest: boolean
  exitRequest: boolean
  doorsOpen: boolean
  /**
   * Het kaartje dat in de bus gekozen is, als plek in het kaartpakket van de
   * kaart. Niets als de bus het niet doorgeeft of er niets gekozen is.
   */
  ticketKeuze?: number
  /** Wie er aan de deur een kaartje koopt, en waarvoor; zie `Verkoop`. */
  verkoop?: Verkoop
  /** Wat er op het schermpje van deze bus staat; zie `IbisScherm`. */
  ibisScherm?: IbisScherm
  /** De namen die de kaartautomaat van de bus zelf toont; zie `kaartnamenVan`. */
  busKaartjes?: string[]
  /**
   * De plugin die OMSI nu geladen heeft. Lager dan `PLUGIN_VERSIE` betekent dat
   * OMSI nog met een oude draait: sluiten, de app laten bijwerken, opnieuw starten.
   */
  pluginVersie: number
  /**
   * De laatste toets die de app in OMSI liet indrukken: welk nummer, en of het
   * lukte. Ging het mis, dan stond OMSI niet vooraan.
   */
  opdracht?: { nr: number; fout: boolean }
  /** De rit waar je volgens de dienstkaart nu mee bezig bent. */
  legIndex: number
  leg?: DutyLeg
  /** Eerstvolgende halte volgens de IBIS; leeg op bussen zonder IBIS. */
  nextStop: string
  /**
   * Hoeveel meter er nog tot die halte ligt. Komt uit het geheugen van OMSI en
   * is er dus alleen als het spel zich laat lezen; zonder dat weet niemand waar
   * de bus precies staat.
   */
  metresToStop?: number
  /** Kilometerstand van de bus; hiermee schatten we hoe ver hij gevorderd is. */
  odometerKm: number
  /** Hoeveelste halte van deze rit, als de bus dat doorgeeft. */
  stopIndex?: number
  stopsTotal: number
  /**
   * Geeft deze bus zijn halte door? De IBIS-variabelen vullen zich pas zodra de
   * lijn en route zijn ingetoetst, en niet elk model biedt ze aan.
   */
  reportsStops: boolean
  /** Biedt deze bus halte-informatie uberhaupt aan? */
  offersStops: boolean
  /**
   * Wat er op de IBIS staat, zoals de bus het zelf doorgeeft: het lijnnummer en
   * de bestemming op de film. Daarmee is te zien of de chauffeur zijn lijn en
   * route heeft ingetoetst, zonder dat hij dat hoeft te melden.
   *
   * Niet elke bus geeft ze door. Moderne bussen met een eigen scherm laten ze
   * leeg, ook als de chauffeur alles netjes heeft ingevoerd.
   */
  ibisLine: string
  ibisTerminus: string
  /**
   * Komt deze stand uit het dienstregelingsmenu van OMSI zelf?
   *
   * Dan weet het spel welke rit er loopt -- lijn, omloop en ritbestand -- en
   * klopt die met de aangenomen dienst. Dat is een harder bewijs dan wat er op
   * de film staat, en het werkt bij elke bus.
   */
  fromTimetable: boolean
  delayMinutes: number
  delayFromIbis: boolean
  /**
   * Hoeveel seconden je voor of achter ligt op de dienstregeling, gerekend
   * tegen de tijd die bij de eerstvolgende halte hoort. Positief is te laat.
   * Niets als er geen halte bekend is om tegen af te zetten.
   */
  deltaSeconds?: number
  /**
   * Stemming van 0 tot 1. Alleen zinnig met passagiers aan boord: een lege bus
   * heeft niemand die ergens iets van vindt.
   */
  mood: number
  /** Sleutel van de stemming; de tekst komt uit de vertaling ("mood.<sleutel>"). */
  moodLabel: string
  hasPassengers: boolean
  harshBrakes: number
  harshAccels: number
  /**
   * De tank, als deel van 0 tot 1. OMSI houdt dit in elk voertuig bij, dus het
   * is er altijd -- ook op bussen die zelf geen meter in het dashboard hebben.
   */
  fuel: number
  /** De accu van een elektrische bus, 0 tot 1. Niets op een dieselbus. */
  battery?: number
  /** Buiten, in graden. */
  temperature?: number
  /** Verkochte kaartjes tijdens deze dienst. */
  tickets: number
  /**
   * Aanrijdingen tijdens deze dienst, en de hardste klap.
   *
   * Sinds het begin van de dienst, niet sinds het spel startte: wie vorige week
   * ergens tegenaan reed, krijgt dat vanavond niet opnieuw voor zijn kiezen.
   */
  collisions: number
  worstCollision: number
  advice: Advice[]
  /** De dienst is uitgereden: eindtijd voorbij en de bus staat stil. */
  dutyComplete: boolean
  /**
   * Kan de app in OMSI kijken? Dan weet hij waar de bus staat en welke
   * dienstregeling in het menu gekozen is. Zo niet (een andere OMSI-versie),
   * dan valt hij terug op wat de IBIS meldt.
   */
  omsiReadable: boolean
  /** Wat de speler in OMSI's dienstregelingsmenu koos, als dat bekend is. */
  schedule?: OmsiSchedule
}

export interface OmsiSchedule {
  lineName: string
  tourName: string
  tripName: string
  /** Hoort de gekozen rit bij de dienst die in de app is bevestigd? */
  matchesDuty: boolean
  /** Welke rit van de dienst dat is. */
  legIndex?: number
}

/** "TTData\\92 Fd-Sg.ttp" en "92 fd-sg" zijn dezelfde rit. */
function tripKey(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? ''
  return base.replace(/\.ttp$/i, '').trim().toLowerCase()
}

/**
 * Welke dienstregeling staat er op de bus, en past die bij de dienst? Een rit
 * komt in een dienst soms twee keer voor (heen en terug heten anders, maar een
 * omloop kan dezelfde rit later nog eens rijden): dan de rit die op de klok het
 * dichtst bij ligt.
 */
function readSchedule(data: LiveData, duty: Duty | undefined, clockMinutes: number): OmsiSchedule | undefined {
  const mem = data.mem
  if (!mem || mem.ok !== 1 || !mem.tripName.trim()) return undefined
  /*
   * Alleen een dienstregeling die daadwerkelijk rijdt. Terwijl het venster Set
   * Time Table openstaat houdt OMSI de rit die je aan het bekijken bent al in
   * het geheugen; daarop afgaan vult de overlay met een dienst die de chauffeur
   * nog niet gekozen heeft.
   */
  if (!(mem.schedActive > 0.5)) return undefined
  const key = tripKey(mem.tripName)
  let legIndex: number | undefined
  if (duty) {
    let best = Infinity
    duty.legs.forEach((leg, index) => {
      if (tripKey(leg.tripFile) !== key) return
      const distance = Math.abs(leg.departure - clockMinutes)
      if (distance < best) {
        best = distance
        legIndex = index
      }
    })
  }
  /*
   * De omloop van de rit die erbij hoort, niet die van de hele dienst: een
   * dienst kan onderweg overstappen, en dan staat er in OMSI een andere omloop
   * dan waarmee hij begon.
   */
  const leg = duty && legIndex !== undefined ? duty.legs[legIndex] : undefined
  const tourMatches = !leg || !mem.tourName.trim() || mem.tourName.trim() === leg.tourNumber.trim()
  return {
    lineName: mem.lineName.trim(),
    tourName: mem.tourName.trim(),
    tripName: mem.tripName.trim(),
    matchesDuty: legIndex !== undefined && tourMatches,
    legIndex
  }
}

/**
 * Welke halte van de rit OMSI bedoelt met de naam die hij doorgeeft.
 *
 * Het nummer dat OMSI erbij levert is niet ons nummer: het telt in zijn eigen
 * lijst en die loopt anders. Gemeten op Rheinhausen, rit 35_DIAK_BREIT: OMSI
 * meldde halte 6 "Rothhauser Strasse", terwijl dat bij ons halte 1 is en halte
 * 6 "Plankenhof" heet. Op het nummer afgaan wijst dus de verkeerde halte aan,
 * en rekent ook het verschil met de dienstregeling tegen de verkeerde tijd af.
 *
 * De naam is wel dezelfde -- beide komen uit de dienstregeling van de kaart.
 * Komt een halte twee keer voor in dezelfde rit, dan wint die waarvan de
 * geplande tijd het dichtst ligt bij waar we volgens de klok zouden moeten zijn.
 */
function stopIndexByName(
  leg: DutyLeg | undefined,
  name: string,
  clockMinutes: number,
  delayMinutes: number
): number | undefined {
  const wanted = name.trim().toLowerCase()
  if (!leg || !wanted) return undefined
  const onSchedule = clockMinutes - delayMinutes
  let best: number | undefined
  let closest = Infinity
  leg.stops.forEach((stop, index) => {
    if (stop.trim().toLowerCase() !== wanted) return
    const when = leg.stopTimes[index]
    const gap = when === undefined ? 0 : Math.abs(when - onSchedule)
    if (gap < closest) {
      closest = gap
      best = index
    }
  })
  return best
}

/**
 * Welke halte aan de beurt is volgens de klok.
 *
 * Terugval voor als OMSI een naam meldt die niet in deze rit voorkomt. Zijn
 * nummer overnemen kan niet -- dat telt in zijn eigen lijst -- en dan zou de
 * halteteller ineens tien plaatsen verspringen. De klok weet het ook: de eerste
 * halte waarvan de geplande tijd nog voor ons ligt.
 */
function stopIndexByTime(
  leg: DutyLeg | undefined,
  clockMinutes: number,
  delayMinutes: number
): number | undefined {
  if (!leg || leg.stopTimes.length === 0) return undefined
  const onSchedule = clockMinutes - delayMinutes
  const at = leg.stopTimes.findIndex((when) => when >= onSchedule)
  return at >= 0 ? at : Math.max(0, leg.stops.length - 1)
}

/**
 * Het verschil met de dienstregeling, op de seconde.
 *
 * De klok van het spel en de tijd die bij de eerstvolgende halte hoort staan
 * allebei in minuten; het verschil daartussen is wat de chauffeur wil weten.
 * Rond middernacht loopt de een door en de ander niet, dus een verschil van
 * meer dan een paar uur is een dagovergang en geen vertraging.
 */
function scheduleDelta(
  leg: DutyLeg | undefined,
  stopIndex: number | undefined,
  clockMinutes: number
): number | undefined {
  if (!leg || stopIndex === undefined || leg.stopTimes.length === 0) return undefined
  const scheduled = leg.stopTimes[Math.min(Math.max(stopIndex, 0), leg.stopTimes.length - 1)]
  if (scheduled === undefined) return undefined
  let difference = clockMinutes - scheduled
  if (difference > 720) difference -= 1440
  if (difference < -720) difference += 1440
  if (Math.abs(difference) > 180) return undefined
  return Math.round(difference * 60)
}

/**
 * Groter dan dit is geen vertraging maar rommel uit een geheugenplek die nog
 * niet in gebruik is. Drie uur te laat haalt geen enkele dienstregeling.
 */
const MAX_SENSIBLE_DELAY_S = 3 * 3600

/** Vertaalt de vertragingstekst van de IBIS naar minuten. */
function ibisDelay(data: LiveData): number | undefined {
  const minutes = Number.parseFloat(data.delayMin.trim())
  if (!Number.isFinite(minutes)) return undefined
  const seconds = Number.parseFloat(data.delaySec.trim())
  return minutes + (Number.isFinite(seconds) ? seconds / 60 : 0)
}

/**
 * Waarschuwingen op grond van wat de bus werkelijk doorgeeft.
 *
 * Alleen variabelen die OMSI heeft aangeroepen tellen mee. Een bus die zijn
 * lichten niet als variabele aanbiedt staat niet "met het licht uit" — we weten
 * het simpelweg niet, en daar hoort geen waarschuwing bij.
 */
/**
 * De kaartverkoop uit het geheugen, als de plugin hem doorgeeft en er werkelijk
 * iemand staat te betalen. Een prijs van nul is geen verkoop: dan is het vak
 * nog niet gevuld, en een kaartje van gratis bestaat in geen kaartpakket.
 */
/*
 * Wat het apparaat in deze bus toont. Lege regels aan het eind vallen weg: een
 * LAWO met twee gevulde regels hoort er niet als vier te staan.
 */
function ibisSchermVan(data: LiveData, apparaten?: Busapparaat[]): IbisScherm | undefined {
  const tekst = (waarde: string | undefined): string => (waarde ?? '').trim()
  const snijdLeeg = (regels: string[]): string[] => {
    const uit = [...regels]
    while (uit.length > 0 && uit[uit.length - 1] === '') uit.pop()
    return uit
  }

  /*
   * Eerst de bus zelf. Weet de app welke schermpjes erin zitten -- dat staat in
   * de model.cfg -- en geeft de plugin de variabelen door, dan is dit geen
   * nabootsing meer maar hetzelfde als wat er in de bus staat.
   */
  const uitDeBus: Apparaatweergave[] = []
  for (const apparaat of apparaten ?? []) {
    if (!data.vars) break
    const regels = snijdLeeg(apparaat.variabelen.map((naam) => tekst(data.vars?.[naam])))
    if (regels.length === 0) continue
    uitDeBus.push({
      naam: apparaat.naam,
      soort: apparaat.soort,
      regels,
      achtergrond: apparaat.achtergrond,
      tekstkleur: apparaat.tekstkleur,
      uitlijning: apparaat.uitlijning,
      breedte: apparaat.breedte,
      hoogte: apparaat.hoogte
    })
  }

  const ibis = data.ibis
  const bestemming = tekst(ibis?.bestemming)
  const lijn = tekst(ibis?.lijn)
  if (uitDeBus.length > 0) {
    return {
      soort: 'bus',
      regels: uitDeBus[0].regels,
      apparaten: uitDeBus,
      bestemming: bestemming || undefined,
      lijn: lijn || undefined
    }
  }
  if (!ibis) return undefined
  /*
   * Welk apparaat er in de bus zit, blijkt uit wat er gevuld is. De AFR 200 van
   * de Thueringer Wald-bus gaat voor: die staat naast de chauffeur en is het
   * ding waarmee hij werkt. Daarna de LAWO met vier regels, en anders de ene
   * regel van een gewone IBIS.
   */
  const afrRegels = snijdLeeg([ibis.afr1, ibis.afr2].map(tekst))
  const lawoRegels = snijdLeeg([ibis.lawo1, ibis.lawo2, ibis.lawo3, ibis.lawo4].map(tekst))
  if (afrRegels.length > 0) {
    return { soort: 'afr', regels: afrRegels, bestemming: bestemming || undefined, lijn: lijn || undefined }
  }
  if (lawoRegels.length > 0) {
    return { soort: 'lawo', regels: lawoRegels, bestemming: bestemming || undefined, lijn: lijn || undefined }
  }
  if (!bestemming && !lijn) return undefined
  return { soort: 'ibis', regels: [], bestemming: bestemming || undefined, lijn: lijn || undefined }
}

/**
 * De namen die de kaartautomaat van deze bus op zijn eigen knoppen heeft.
 *
 * De AFR 200 haalt ze bij het opstarten uit het kaartpakket van de kaart
 * (`(M.V.GetTicketName)` in afr200.osc) en zet ze in `afr_ticketname_0` tot en
 * met `_9`, op dezelfde plek als het nummer dat OMSI bij de verkoop doorgeeft.
 * Daarmee kan de app op de tegel zetten wat de chauffeur op de automaat ziet,
 * in plaats van de naam uit het kaartbestand van de kaart.
 *
 * Staat de automaat uit, dan zijn de namen leeg; dan geeft dit niets terug en
 * blijft het bij de namen uit het kaartpakket.
 */
export function kaartnamenVan(data: LiveData): string[] | undefined {
  const vars = data.vars
  if (!vars) return undefined
  const namen: string[] = []
  for (let i = 0; i < 12; i++) {
    const waarde = vars[`afr_ticketname_${i}`] ?? vars[`atron_ticket${i + 1}`]
    if (waarde === undefined) break
    namen.push(waarde.trim())
  }
  while (namen.length > 0 && namen[namen.length - 1] === '') namen.pop()
  return namen.length > 0 ? namen : undefined
}

/**
 * Welke stringvariabelen de plugin moet doorgeven.
 *
 * De app schrijft ze in `vragen.txt` naast live.json; de plugin zoekt ze op in
 * de bus en zet ze in `vars`. Alleen schrijven als er iets verandert -- het
 * bestand wordt anders tien keer per seconde overschreven terwijl er niets
 * anders in staat.
 */
export function schrijfVragen(namen: string[]): void {
  const lijst = namen.slice(0, 64)
  const inhoud = lijst.join('\r\n') + (lijst.length > 0 ? '\r\n' : '')
  const pad = join(liveMap(), 'vragen.txt')
  try {
    if (existsSync(pad) && readFileSync(pad, 'utf8') === inhoud) return
    const tijdelijk = pad + '.tmp'
    writeFileSync(tijdelijk, inhoud)
    renameSync(tijdelijk, pad)
    log(`vragen aan de plugin: ${lijst.length} variabelen`)
  } catch (fout) {
    log(`vragen.txt schrijven mislukt: ${String(fout)}`)
  }
}

/** Alles wat de bus aan tekst bijhoudt; de plugin ververst het eens per twee tellen. */
export function leesSchermen():
  | { bus: string; model: string; pad: string; bestand: string; aantal: number; vars: Record<string, string> }
  | undefined {
  try {
    return JSON.parse(readFileSync(join(liveMap(), 'schermen.json'), 'utf8'))
  } catch {
    return undefined
  }
}

function verkoopVan(data: LiveData): Verkoop | undefined {
  const mem = data.mem
  if (!mem || mem.ok !== 1) return undefined
  const koper = mem.koper ?? -1
  const kaartje = mem.ticketIndex ?? -1
  const prijs = mem.ticketPrijs ?? 0
  if (koper < 0 || kaartje < 0 || !(prijs > 0)) return undefined
  return {
    kaartje,
    prijs,
    gegeven: mem.ticketGegeven ?? 0,
    slechtWisselgeld: (mem.ticketSlecht ?? 0) > 0,
    klaar: (mem.ticketKlaar ?? 0) > 0
  }
}

function buildAdvice(data: LiveData, baseline?: { harshBrakes: number; harshAccels: number; tickets?: number; collisions?: number }): Advice[] {
  const advice: Advice[] = []

  if (has(data, BIT.lightsLow) && data.brightness < 0.35 && data.lightsLow < 0.5) {
    advice.push({ id: 'licht', severity: 'warn' })
  }

  if (data.velocity > 5 && (data.entryOpen > 0.5 || data.exitOpen > 0.5)) {
    advice.push({ id: 'deuren', severity: 'warn' })
  }

  /*
   * Het wegdek, niet de lucht. `precipRate` staat ook bij droog weer op een
   * waarde -- in een sessie zonder een druppel regen stond hij op 0,125 terwijl
   * `streetCond` netjes nul aangaf. Dat laatste is bovendien waar het om gaat:
   * een natte weg remt slechter, of het nu regent of net opgehouden is.
   */
  if (data.streetCond > 0.1) {
    advice.push({ id: 'nat', severity: 'info' })
  }

  const brakes = data.harshBrakes - (baseline?.harshBrakes ?? 0)
  // Alleen een punt als er iemand in de bus zit om het te voelen.
  if (brakes >= 3 && data.passengers > 0) {
    advice.push({ id: 'remmen', severity: 'warn', count: brakes })
  }

  if (has(data, BIT.engineOn) && data.engineOn < 0.5 && data.passengers > 0) {
    advice.push({ id: 'motor', severity: 'info' })
  }

  /*
   * Een aanrijding is geen tip maar een feit, en hij blijft staan: hij is al
   * gebeurd en gaat niet meer over. Vandaar de zwaarste soort.
   */
  const botsingen = (data.collisions ?? 0) - (baseline?.collisions ?? 0)
  if (hasSys(data, SYSBIT.collEnergy) && botsingen > 0) {
    advice.push({ id: 'aanrijding', severity: 'warn', count: botsingen })
  }

  /*
   * Bijna leeg. De grens ligt op een tiende: een stadsbus haalt daar nog wel
   * een rit mee, maar niet een hele dienst, en dit is het moment dat je er nog
   * iets aan kunt doen.
   */
  if (data.tankPercent > 0 && data.tankPercent < 0.1) {
    advice.push({ id: 'tank', severity: 'warn' })
  }

  /*
   * Wegrijden van de halte zonder richting aan te geven. In Duitsland geeft
   * §20 StVO een bus die de halte verlaat voorrang -- maar alleen als hij
   * knippert. Wie dat niet doet, heeft die voorrang niet.
   */
  if (
    has(data, BIT.blinkerLeft) &&
    data.atStation > 0.5 &&
    data.velocity > 3 &&
    data.velocity < 20 &&
    data.blinkerLeft < 0.5 &&
    data.blinkerRight < 0.5
  ) {
    advice.push({ id: 'knipperen', severity: 'info' })
  }

  return advice
}

/**
 * Legt de live gegevens naast de dienstkaart.
 *
 * De vertraging komt van de IBIS als de bus er een heeft — dat is OMSI's eigen
 * getal. Heeft de bus geen IBIS, dan rekenen we hem zelf uit tegen de
 * dienstregeling, want de klok en de geplande tijden kennen we allebei.
 */
export function describeLive(
  data: LiveData,
  duty?: Duty,
  baseline?: {
    harshBrakes: number
    harshAccels: number
    odometerKm?: number
    clockMinutes?: number
    tickets?: number
    collisions?: number
  },
  /** De schermpjes van de bus die rijdt; zie core/busscherm.ts. */
  apparaten?: Busapparaat[]
): LiveStatus {
  const clockMinutes = data.time / 60

  /*
   * Welke rit aan de beurt is volgens de klok: de eerste die nog niet is
   * aangekomen. Dat is de rit die nu rijdt, of -- als de bus op het eindpunt
   * staat te wachten -- de rit die zo vertrekt.
   *
   * Hier stond eerst de laatste rit die al vertrokken was, en die bleef staan
   * nadat hij was aangekomen. Dan lag de gereden route nog op de kaart terwijl
   * de chauffeur al aan de volgende begon, met de instructies van een rit van
   * een half uur geleden erbij.
   */
  let legIndex = -1
  let leg: DutyLeg | undefined
  if (duty && duty.legs.length > 0) {
    const ahead = duty.legs.findIndex((item) => item.arrival > clockMinutes)
    legIndex = ahead >= 0 ? ahead : duty.legs.length - 1
    leg = duty.legs[legIndex]
  }

  // Wat in OMSI zelf gekozen is, gaat voor de klok: dat is de rit die gereden wordt.
  const omsiReadable = data.mem?.ok === 1
  const schedule = omsiReadable ? readSchedule(data, duty, clockMinutes) : undefined
  const fromMenu = Boolean(schedule?.matchesDuty && schedule.legIndex !== undefined && duty)
  if (fromMenu && duty && schedule?.legIndex !== undefined) {
    legIndex = schedule.legIndex
    leg = duty.legs[legIndex]
  }

  const fromIbis = ibisDelay(data)
  let delayMinutes = 0
  if (fromMenu && data.mem && Math.abs(data.mem.delay) <= MAX_SENSIBLE_DELAY_S) {
    // OMSI houdt de vertraging van een rijdende dienstregeling in seconden bij.
    delayMinutes = data.mem.delay / 60
  } else if (fromIbis !== undefined) {
    delayMinutes = fromIbis
  } else if (leg) {
    delayMinutes = clockMinutes > leg.arrival ? clockMinutes - leg.arrival : 0
  }

  const harshBrakes = Math.max(0, data.harshBrakes - (baseline?.harshBrakes ?? 0))
  const harshAccels = Math.max(0, data.harshAccels - (baseline?.harshAccels ?? 0))

  /**
   * Stemming uit gemeten gedrag: vertraging weegt het zwaarst, daarna hard
   * remmen en optrekken. OMSI geeft geen passagiersstemming door — die bestaat
   * alleen in de beoordelingen die na afloop in het chauffeursbestand belanden —
   * maar dit is wel op echte metingen gebaseerd in plaats van op een gok.
   */
  const punctuality = Math.max(0, 1 - Math.max(0, delayMinutes) / 8)
  const smoothness = Math.max(0, 1 - (harshBrakes * 0.08 + harshAccels * 0.05))
  const mood = Math.max(0, Math.min(1, punctuality * 0.6 + smoothness * 0.4))
  const hasPassengers = data.passengers >= 1

  /*
   * Alleen een voortgang tonen als de bus werkelijk iets meldt. Een index van
   * nul zonder haltenaam betekent dat de IBIS nog niet is ingetoetst, en dan
   * is "0 van 9 gehad" een bewering die nergens op slaat. Met een dienstregeling
   * uit het menu weet OMSI zelf welke halte de volgende is.
   */
  /*
   * De naam gaat voor het nummer: dat van OMSI telt in zijn eigen lijst en komt
   * niet overeen met de onze. Zonder naam blijft het nummer over, en zonder
   * dienstregeling in het menu de teller van de IBIS.
   */
  const byName = fromMenu && data.mem ? stopIndexByName(leg, data.mem.nextStop, clockMinutes, delayMinutes) : undefined
  const stopIndex = fromMenu
    ? byName ?? stopIndexByTime(leg, clockMinutes, delayMinutes)
    : has(data, BIT.busstopIndex) && data.busstop.trim() !== ''
      ? Math.max(0, Math.round(data.busstopIndex))
      : undefined

  return {
    clockMinutes,
    speedKmh: data.velocity,
    passengers: Math.round(data.passengers),
    entryRequest: data.entryRequest > 0.5,
    exitRequest: data.exitRequest > 0.5,
    doorsOpen: data.entryOpen > 0.5 || data.exitOpen > 0.5,
    ticketKeuze:
      has(data, BIT.ticket) && data.ticket >= 0 ? Math.round(data.ticket) : undefined,
    verkoop: verkoopVan(data),
    ibisScherm: ibisSchermVan(data, apparaten),
    busKaartjes: kaartnamenVan(data),
    pluginVersie: data.plugin ?? 1,
    opdracht:
      data.mem && (data.mem.opdracht ?? 0) > 0
        ? { nr: data.mem.opdracht ?? 0, fout: (data.mem.opdrachtFout ?? 0) > 0 }
        : undefined,
    legIndex,
    metresToStop:
      fromMenu && data.mem && data.mem.nextDist >= 0 && data.mem.nextDist < 20000
        ? Math.round(data.mem.nextDist)
        : undefined,
    leg,
    nextStop: fromMenu && data.mem ? data.mem.nextStop.trim() : data.busstop.trim(),
    odometerKm: data.km + data.metres / 1000,
    stopIndex,
    stopsTotal: leg?.stops.length ?? 0,
    reportsStops: fromMenu || data.busstop.trim() !== '',
    fromTimetable: fromMenu,
    ibisLine: data.line.trim(),
    ibisTerminus: data.terminus.trim(),
    offersStops: fromMenu || ((data.seenStr >>> 0) & 1) === 1,
    delayMinutes,
    delayFromIbis: fromMenu || fromIbis !== undefined,
    /*
     * Rijdt er een dienstregeling in OMSI, dan houdt het spel het verschil zelf
     * op de seconde bij; dat is hetzelfde getal dat de chauffeur in het spel
     * ziet. Alleen zonder die dienstregeling rekenen we het zelf uit, tegen de
     * tijd die bij de eerstvolgende halte hoort.
     */
    /*
     * Eén bron tegelijk. Rijdt er een dienstregeling in OMSI, dan is dat het
     * getal van OMSI en niets anders: onze eigen som meet tegen de aankomsttijd
     * van de volgende halte en komt daardoor een paar minuten anders uit. Door
     * tussen die twee te wisselen sprong het verschil heen en weer zonder dat er
     * iets gebeurd was. Slaat het getal van OMSI nergens op, dan tonen we liever
     * niets dan een ander soort getal.
     */
    deltaSeconds: fromMenu
      ? data.mem && Math.abs(data.mem.delay) <= MAX_SENSIBLE_DELAY_S
        ? Math.round(data.mem.delay)
        : undefined
      : scheduleDelta(leg, stopIndex, clockMinutes),
    mood,
    moodLabel: !hasPassengers
      ? 'empty'
      : mood > 0.8
        ? 'happy'
        : mood > 0.55
          ? 'calm'
          : mood > 0.3
            ? 'impatient'
            : 'annoyed',
    hasPassengers,
    harshBrakes,
    harshAccels,
    fuel: data.tankPercent,
    battery: has(data, BIT.battery) ? data.battery : undefined,
    temperature: hasSys(data, SYSBIT.temperature) ? data.temperature : undefined,
    tickets: Math.max(0, data.ticket - (baseline?.tickets ?? 0)),
    collisions: Math.max(0, (data.collisions ?? 0) - (baseline?.collisions ?? 0)),
    worstCollision: data.worstCollision ?? 0,
    advice: buildAdvice(data, baseline),
    dutyComplete: duty ? isDutyComplete(data, duty, baseline) : false,
    omsiReadable,
    schedule
  }
}

/**
 * Is de dienst werkelijk uitgereden?
 *
 * Alleen "eindtijd voorbij en de bus staat stil" was te weinig: stond de klok in
 * het spel toevallig later dan de dienst, of lag er nog een live-bestand van een
 * vorige keer, dan was een net gestarte dienst na vijf seconden al "af" en boekte
 * de app hem weg. Nu moet er ook echt gereden zijn: OMSI draait, de gegevens zijn
 * vers, er is sinds het starten minstens een kilometer afgelegd en minstens de
 * helft van de dienstduur verstreken.
 */
function isDutyComplete(
  data: LiveData,
  duty: Duty,
  baseline?: { odometerKm?: number; clockMinutes?: number }
): boolean {
  if (!data.alive || (data.ageMs !== undefined && data.ageMs > LIVE_STALE_MS)) return false
  if (baseline?.odometerKm === undefined || baseline.clockMinutes === undefined) return false

  const driven = data.km + data.metres / 1000 - baseline.odometerKm
  if (driven < MIN_DRIVEN_KM) return false

  const clock = data.time / 60
  let elapsed = clock - baseline.clockMinutes
  if (elapsed < 0) elapsed += 1440
  if (elapsed < duty.durationMinutes / 2) return false

  // Diensten na middernacht hebben eindtijden boven 24:00; de klok springt terug.
  const clockOnDutyDay = duty.end >= 1440 && clock < duty.start - 60 ? clock + 1440 : clock
  return clockOnDutyDay >= duty.end && data.velocity < 2
}
