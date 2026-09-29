/**
 * DE MEETSTAND: RONDE 0 VAN DE VOORVALLEN
 *
 * design/ontwerpen/voorvallen-en-controleurs.md, §3.2 "Ronde 0" en §5 "Wat Luc
 * in OMSI meet"; de handleiding voor Luc staat in design/ontwerpen/ronde0-meten.md.
 *
 * WAAROM
 * Voordat er één voorval gebouwd wordt, moet vaststaan wat OMSI werkelijk
 * doorgeeft: wanneer de volgende halte verspringt, hoe `nextDist` bij een
 * halte verloopt, welke `PAX_EntryN`/`PAX_ExitN` bij welke deur hoort, of een
 * laatkomer echt op de deurknop drukt, en hoe knielen, de oprijplaat, de
 * alarmlichten en het stopverzoek heten in de scripts van de C2, de o530 U e2
 * en de MAN NL. Dat kan alleen Luc meten, in OMSI. Deze stand maakt dat één
 * handeling: aanzetten, rijden, afvinken, "Meting opslaan", zip versturen.
 *
 * WAT HIJ DOET
 * - De plugin krijgt een ruime set getallen te vragen (`meetGetallenVoor`): de
 *   systeemgetallen van elk voertuig (core/live.ts, `VOERTUIG_GETALLEN`), de
 *   vering van de andere assen, en uit de varlists van de bus die rijdt elke
 *   naam die past op knielen, oprijplaat, kinderwagen, stopverzoek,
 *   alarmlicht, storing, haltestellenbremse, klima, deur en licht -- binnen de
 *   512 van de plugin, na de getallen van de apparaatschermen (`getallenlijst`).
 * - Elke 250 ms een regel in een eigen bestand (`Meetsessie.schrijf`): tijd,
 *   klok, halte, `nextDist`, snelheid, alle 32 deurgetallen, en de gevonden
 *   scriptgetallen (alleen wat veranderde, elke tien tellen alles).
 * - Een afvinklijst per bus (shared/meetstand.ts). Bij elke vink een regel in
 *   het bestand, en een volledige afdruk van alle getallen van de bus
 *   (getallen.json van de plugin, zodra die NA de vink geschreven is).
 * - "Meting opslaan": één zip, zonder persoonlijke gegevens.
 *
 * WAT ER NIET IN KOMT
 * Geen naam van de chauffeur, geen personeelsnummer of pincode, geen profiel,
 * geen paden van deze pc (een absoluut buspad wordt ingekort tot vanaf
 * `vehicles`). Wel de bus, de kaart en de haltes -- dat is spelmateriaal.
 *
 * Geen Electron: het hoofdproces geeft de gegevens en de paden mee, en de
 * proeven kunnen dit los draaien.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { MEET_STAPPEN, type MeetStap, type MetingBeeld } from '../shared/meetstand'
import { DEUR_GETALLEN, type LiveData, type LiveStatus } from './live'
import { blockTag, readOmsiLines, str } from './omsiFile'
import { maakZip } from './zip'

/** De versie van het meetbestand; omhoog als de regels van vorm veranderen. */
export const MEET_VERSIE = 1

/** Elke zoveel milliseconden een regel (de opdracht: 250 ms). */
export const MEET_INTERVAL_MS = 250

/** Elke zoveel milliseconden alle scriptgetallen, niet alleen wat veranderde. */
const VOL_ELKE_MS = 10_000

/**
 * Waar de app in de varlists van de bus naar zoekt, in volgorde van belang:
 * wat vooraan staat valt het laatst buiten de 512. Deuren en licht leveren de
 * meeste namen (bij de C2 samen bijna vierhonderd), dus die achteraan.
 */
export const MEET_PATRONEN: ReadonlyArray<{ id: string; patroon: RegExp }> = [
  { id: 'kneel', patroon: /kneel/i },
  { id: 'ramp', patroon: /ramp/i },
  { id: 'kinderwagen', patroon: /kinderwagen/i },
  { id: 'haltewunsch', patroon: /haltewunsch/i },
  { id: 'warnblink', patroon: /warnblink/i },
  { id: 'failure', patroon: /failure/i },
  { id: 'bremse_halte', patroon: /bremse_halte/i },
  { id: 'klima', patroon: /klima/i },
  { id: 'tuer', patroon: /tuer|door/i },
  { id: 'licht', patroon: /licht|light/i }
]

/**
 * Systeemgetallen die alleen de meting vraagt, naast `VOERTUIG_GETALLEN`: de
 * vering van de andere assen. Knielt een bus alleen rechts, of ook achter, dan
 * staat het hier.
 */
export const MEET_EXTRA: readonly string[] = [
  'Axle_Suspension_1_L',
  'Axle_Suspension_1_R',
  'Axle_Suspension_2_L',
  'Axle_Suspension_2_R'
]

/** De bus zoals de plugin hem doorgeeft (`LiveData.bus`). */
type Bus = { naam?: string; model?: string; pad?: string; bestand?: string }

/**
 * Alle getalnamen uit de varlists van een bus, zoals OMSI ze na zijn eigen 138
 * inleest: de `[varnamelist]` van de .bus, regel voor regel.
 *
 * Welk .bus-bestand er rijdt, zegt de plugin vaak niet (`bestand` is meestal
 * leeg); dan alle .bus-bestanden in de map. Een naam die deze variant niet
 * heeft, komt dan in `getallenOnbekend` terug, en dat is ook een uitkomst.
 */
export function varlistVanBus(omsiPath: string, bus: Bus | undefined): { namen: string[]; bestanden: string[] } {
  const heel = (pad: string): string => (isAbsolute(pad) ? pad : join(omsiPath, ...pad.split(/[\\/]+/).filter(Boolean)))
  let busBestanden: string[] = []
  if (bus?.bestand && existsSync(heel(bus.bestand))) busBestanden = [heel(bus.bestand)]
  else if (bus?.pad) {
    const map = heel(bus.pad)
    try {
      busBestanden = readdirSync(map)
        .filter((naam) => naam.toLowerCase().endsWith('.bus'))
        .map((naam) => join(map, naam))
    } catch {
      busBestanden = []
    }
  }
  const namen: string[] = []
  const bestanden: string[] = []
  const gelezen = new Set<string>()
  const gezien = new Set<string>()
  for (const busPad of busBestanden) {
    let regels: string[]
    try {
      regels = readOmsiLines(busPad)
    } catch {
      continue
    }
    for (let i = 0; i < regels.length; i++) {
      if (blockTag(regels[i]) !== '[varnamelist]') continue
      const aantal = Number.parseInt(str(regels[i + 1]), 10)
      for (let k = 0; k < (Number.isFinite(aantal) ? Math.min(aantal, 200) : 0); k++) {
        const rel = str(regels[i + 2 + k])
        if (!rel) continue
        const pad = join(dirname(busPad), ...rel.split(/[\\/]+/).filter(Boolean))
        const sleutel = pad.toLowerCase()
        if (gelezen.has(sleutel)) continue
        gelezen.add(sleutel)
        let lijst: string[]
        try {
          lijst = readOmsiLines(pad)
        } catch {
          continue
        }
        bestanden.push(rel.replace(/\\/g, '/'))
        for (const regel of lijst) {
          const naam = regel.trim()
          if (!naam || gezien.has(naam.toLowerCase())) continue
          gezien.add(naam.toLowerCase())
          namen.push(naam)
        }
      }
    }
  }
  return { namen, bestanden }
}

/** De namen die op een patroon passen, in de volgorde van `MEET_PATRONEN`. */
export function profielNamen(namen: readonly string[]): string[] {
  const uit: string[] = []
  const gezien = new Set<string>()
  for (const { patroon } of MEET_PATRONEN) {
    for (const naam of namen) {
      const sleutel = naam.toLowerCase()
      if (gezien.has(sleutel) || !patroon.test(naam)) continue
      gezien.add(sleutel)
      uit.push(naam)
    }
  }
  return uit
}

/**
 * Wat de meting bovenop `VOERTUIG_GETALLEN` vraagt: de vering van de andere
 * assen en de scriptnamen van de bus. De lijst gaat door `getallenlijst` in
 * core/live.ts, die de grens van 512 bewaakt.
 */
export function meetGetallenVoor(varlistNamen: readonly string[]): string[] {
  return [...MEET_EXTRA, ...profielNamen(varlistNamen)]
}

/** Een buspad zonder iets van deze pc: vanaf `vehicles`, of anders alleen de laatste map. */
export function veiligBuspad(pad: string | undefined): string {
  if (!pad) return ''
  const schoon = pad.replace(/\\/g, '/')
  if (!isAbsolute(pad) && !/^[a-z]:/i.test(schoon)) return schoon
  const plek = schoon.toLowerCase().lastIndexOf('/vehicles/')
  return plek >= 0 ? schoon.slice(plek + 1) : basename(schoon)
}

/** Een naam die in elke bestandsnaam past. */
function bestandsdeel(tekst: string): string {
  return (tekst.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'bus').slice(0, 40)
}

function afgerond(waarde: number): number {
  return Math.round(waarde * 10000) / 10000
}

/** Wat het hoofdproces bij elke regel meegeeft. */
export interface MeetInvoer {
  live: LiveData
  /** `describeLive` van dezelfde stand, met de dienst die loopt (of de gekoppelde omloop). */
  status?: LiveStatus
  /** Verkochte kaartjes volgens de app (`telVerkoop`). */
  verkocht: number
}

/** Wat er in de kop van een meetbestand staat, en wanneer het verandert een regel `vraag`. */
export interface MeetKop {
  modus: 'dienst' | 'vrij'
  kaart?: string
  appVersie: string
  /** De getallen die de meting vroeg bovenop de deuren (`meetGetallenVoor`). */
  gevraagd: readonly string[]
  /** Wat daarvan buiten de 512 viel. */
  afgevallen: readonly string[]
  /** Uit welke varlists de namen komen, zoals de .bus ze noemt. */
  varlists: readonly string[]
}

interface Segment {
  nr: number
  sleutel: string
  busNaam: string
  bestand: string
  vinkjes: Set<MeetStap>
  vorige: Map<string, number | null>
  volOp: number
  gevraagdSleutel: string
  gevraagd: number
  afgevallen: number
  onbekend: string
}

/** Een afdruk van getallen.json die nog gemaakt moet worden. */
interface Afdruk {
  naam: string
  /** Pas een afdruk die de plugin NA dit moment schreef. */
  na: number
  /** Daarna toch, wat er dan ligt. */
  tot: number
  busNaam: string
}

function stempel(tijd: Date): string {
  const t = (n: number): string => String(n).padStart(2, '0')
  return (
    `${tijd.getFullYear()}${t(tijd.getMonth() + 1)}${t(tijd.getDate())}-` +
    `${t(tijd.getHours())}${t(tijd.getMinutes())}${t(tijd.getSeconds())}`
  )
}

/**
 * Eén meting: van de eerste regel tot "Meting opslaan". Een wissel van bus
 * begint een nieuw bestand in dezelfde meting, zodat de drie bussen van ronde
 * 0 in één zip komen -- ook als er tussendoor een dienst afgerond wordt.
 */
export class Meetsessie {
  private map?: string
  private begin = 0
  private segment?: Segment
  private segmenten: Array<{ nr: number; bus: string; pad: string; regels: number; vinkjes: MeetStap[] }> = []
  private regels = 0
  private afdrukken: Afdruk[] = []
  private laatstOpgeslagen?: string
  private schrijfFout = false

  constructor(
    /** `<gebruikersmap>/metingen`. */
    private readonly basis: string,
    /** Waar de plugin getallen.json neerzet (`liveMap()`). */
    private readonly getallenJson: () => string,
    private readonly nu: () => number = Date.now,
    private readonly melden: (regel: string) => void = () => undefined
  ) {}

  /** De map van de meting die loopt of het laatst liep, voor de proef en het logboek. */
  get mapVanMeting(): string | undefined {
    return this.map
  }

  /** Wanneer de meting die loopt begon (ms); niets als er geen loopt. */
  get begonnenOp(): number | undefined {
    return this.map ? this.begin : undefined
  }

  /** Eén regel, elke 250 ms zolang er gemeten wordt. */
  schrijf(invoer: MeetInvoer, kop: MeetKop): void {
    const { live } = invoer
    const nu = this.nu()
    if (!this.map) {
      this.map = join(this.basis, `meting-${stempel(new Date(nu))}`)
      this.begin = nu
      this.segment = undefined
      this.segmenten = []
      this.regels = 0
      this.afdrukken = []
      mkdirSync(this.map, { recursive: true })
      this.melden(`meetstand: meting begonnen in ${basename(this.map)}`)
    }
    const bus = live.bus
    const busNaam = (bus?.naam || basename(veiligBuspad(bus?.pad)) || 'bus').trim()
    /*
     * Zonder bus in live.json (OMSI laadt er net een) blijft het bestand van
     * de vorige bus open: anders kwam er bij elk laadmoment een los bestand
     * "bus" tussen.
     */
    const heeftBus = Boolean(bus && (bus.naam || bus.pad || bus.model))
    const sleutel = heeftBus ? `${bus?.pad ?? ''}|${bus?.model ?? ''}|${bus?.naam ?? ''}` : (this.segment?.sleutel ?? '||')
    if (this.segment?.sleutel !== sleutel) this.nieuwSegment(sleutel, busNaam, invoer, kop, nu)
    const segment = this.segment!

    const uit: object[] = []
    /* De gevraagde lijst veranderde (de varlists waren er pas later, of een apparaat erbij). */
    const gevraagdSleutel = `${kop.gevraagd.join('|')}#${kop.afgevallen.length}`
    if (gevraagdSleutel !== segment.gevraagdSleutel) {
      segment.gevraagdSleutel = gevraagdSleutel
      segment.gevraagd = kop.gevraagd.length
      segment.afgevallen = kop.afgevallen.length
      uit.push({ t: 'vraag', tijd: nu - this.begin, getallen: kop.gevraagd, afgevallen: kop.afgevallen, varlists: kop.varlists })
    }
    /* Wat de bus niet kent, zegt de plugin; ook dat is een uitkomst. */
    const onbekend = (live.getallenOnbekend ?? []).join('|')
    if (onbekend !== segment.onbekend) {
      segment.onbekend = onbekend
      uit.push({ t: 'onbekend', tijd: nu - this.begin, namen: live.getallenOnbekend ?? [] })
    }
    uit.push(this.meetRegel(invoer, kop, segment, nu))
    this.voegToe(segment, uit)
    this.regels += 1
    this.maakAfdrukken(nu)
  }

  private nieuwSegment(sleutel: string, busNaam: string, invoer: MeetInvoer, kop: MeetKop, nu: number): void {
    if (this.segment) this.segmentKlaar()
    const nr = (this.segment?.nr ?? 0) + 1
    const bestand = join(this.map!, `meting-${nr}-${bestandsdeel(busNaam)}.jsonl`)
    const { live } = invoer
    this.segment = {
      nr,
      sleutel,
      busNaam,
      bestand,
      vinkjes: new Set(),
      vorige: new Map(),
      volOp: 0,
      gevraagdSleutel: `${kop.gevraagd.join('|')}#${kop.afgevallen.length}`,
      gevraagd: kop.gevraagd.length,
      afgevallen: kop.afgevallen.length,
      onbekend: ''
    }
    this.segmenten.push({ nr, bus: busNaam, pad: veiligBuspad(live.bus?.pad), regels: 0, vinkjes: [] })
    this.voegToe(this.segment, [
      {
        t: 'kop',
        versie: MEET_VERSIE,
        begin: new Date(nu).toISOString(),
        tijd: nu - this.begin,
        app: kop.appVersie,
        plugin: live.plugin ?? null,
        exe: live.exeVersion ?? null,
        bus: { naam: busNaam, model: live.bus?.model ?? '', pad: veiligBuspad(live.bus?.pad) },
        modus: kop.modus,
        kaart: kop.kaart ?? null,
        intervalMs: MEET_INTERVAL_MS,
        deurNamen: DEUR_GETALLEN,
        getallen: kop.gevraagd,
        afgevallen: kop.afgevallen,
        varlists: kop.varlists
      }
    ])
    /* De afdruk bij het begin: pas als de plugin er een van DEZE bus schreef. */
    this.afdrukken.push({ naam: `dump-${nr}-begin.json`, na: nu + 500, tot: nu + 10_000, busNaam: live.bus?.naam ?? '' })
    this.melden(`meetstand: bus ${nr} ${busNaam}`)
  }

  private segmentKlaar(): void {
    const s = this.segment
    const rij = s && this.segmenten.find((r) => r.nr === s.nr)
    if (s && rij) rij.vinkjes = MEET_STAPPEN.filter((stap) => s.vinkjes.has(stap))
  }

  private meetRegel(invoer: MeetInvoer, kop: MeetKop, segment: Segment, nu: number): object {
    const { live, status } = invoer
    const mem = live.mem && live.mem.ok === 1 ? live.mem : undefined
    const getal = (naam: string): number | null => {
      const w = live.getallen?.[naam]
      return typeof w === 'number' && Number.isFinite(w) ? afgerond(w) : null
    }
    /* De scriptgetallen: wat veranderde, en elke tien tellen alles (dan staat `vol`). */
    const vol = nu - segment.volOp >= VOL_ELKE_MS
    if (vol) segment.volOp = nu
    const getallen: Record<string, number | null> = {}
    for (const naam of [...kop.gevraagd, 'Cabinair_Temp', 'Dirt_Norm', 'Axle_Suspension_0_L', 'Axle_Suspension_0_R']) {
      if (live.getallen && !(naam in live.getallen)) continue
      const w = getal(naam)
      if (vol || segment.vorige.get(naam) !== w) getallen[naam] = w
      segment.vorige.set(naam, w)
    }
    const verkoop = mem && (mem.koper ?? -1) >= 0
    return {
      t: 'm',
      tijd: nu - this.begin,
      klok: Math.round(live.time * 10) / 10,
      snelheid: afgerond(live.velocity),
      grond: getal('Velocity_Ground'),
      rit: status && status.legIndex >= 0 ? status.legIndex : null,
      halte: {
        /* Onze halte: uit het menu bij naam, anders de schatting van de app. */
        index: status?.halteOpNaam ?? status?.stopIndex ?? null,
        naam: status?.nextStop ?? '',
        uitMenu: status?.halteOpNaam !== undefined,
        /* En die van OMSI zelf: het nummer telt in zijn eigen lijst. */
        omsiIndex: mem?.nextIndex ?? null,
        omsiNaam: mem?.nextStop?.trim() ?? ''
      },
      nextDist: mem ? afgerond(mem.nextDist) : null,
      dienstregeling: mem?.schedActive ?? null,
      vertraging: mem?.delay ?? null,
      aanHalte: live.atStation,
      reizigers: Math.round(live.passengers),
      deuren: DEUR_GETALLEN.map((naam) => getal(naam)),
      deur0: [live.entryOpen, live.exitOpen, live.entryRequest, live.exitRequest],
      knipper: [live.blinkerLeft, live.blinkerRight],
      licht: live.lightsLow,
      remlicht: live.brakeLight,
      motor: live.engineOn,
      kassa: verkoop
        ? { koper: mem?.koper ?? -1, prijs: mem?.ticketPrijs ?? 0, klaar: mem?.ticketKlaar ?? 0, verkocht: invoer.verkocht }
        : { verkocht: invoer.verkocht },
      getallen,
      ...(vol ? { vol: true } : {})
    }
  }

  private voegToe(segment: Segment, regels: object[]): void {
    try {
      appendFileSync(segment.bestand, regels.map((r) => JSON.stringify(r)).join('\n') + '\n')
      const rij = this.segmenten.find((r) => r.nr === segment.nr)
      if (rij) rij.regels += regels.length
    } catch (fout) {
      if (!this.schrijfFout) this.melden(`meetstand: schrijven mislukt: ${String(fout)}`)
      this.schrijfFout = true
    }
  }

  /**
   * Een stap afgevinkt (of weer uit). Bij aan komt er een afdruk van alle
   * getallen van de bus: de plugin schrijft getallen.json eens per twee
   * tellen, dus de eerste die NA de vink komt.
   */
  vink(stap: MeetStap, aan: boolean): boolean {
    const segment = this.segment
    if (!this.map || !segment) return false
    if (aan) segment.vinkjes.add(stap)
    else segment.vinkjes.delete(stap)
    const nu = this.nu()
    const dump = aan ? `dump-${segment.nr}-${stap}.json` : undefined
    this.voegToe(segment, [{ t: 'vink', tijd: nu - this.begin, stap, aan, ...(dump ? { dump } : {}) }])
    if (dump) this.afdrukken.push({ naam: dump, na: nu, tot: nu + 6000, busNaam: segment.busNaam })
    this.segmentKlaar()
    return true
  }

  /** Afdrukken van getallen.json die klaar zijn om te maken. */
  private maakAfdrukken(nu: number): void {
    if (this.afdrukken.length === 0 || !this.map) return
    let tijd = 0
    try {
      tijd = statSync(this.getallenJson()).mtimeMs
    } catch {
      tijd = 0
    }
    const nogNiet: Afdruk[] = []
    for (const afdruk of this.afdrukken) {
      const vers = tijd > afdruk.na
      if (!vers && nu < afdruk.tot) {
        nogNiet.push(afdruk)
        continue
      }
      try {
        const inhoud = readFileSync(this.getallenJson())
        /* Van een andere bus (net gewisseld)? Dan nog even wachten, tenzij de tijd om is. */
        if (nu < afdruk.tot && afdruk.busNaam) {
          const bus = (JSON.parse(inhoud.toString('utf8')) as { bus?: string }).bus ?? ''
          if (bus.trim() !== afdruk.busNaam.trim()) {
            nogNiet.push(afdruk)
            continue
          }
        }
        writeFileSync(join(this.map, afdruk.naam), inhoud)
      } catch {
        // Geen getallen.json (plugin ouder dan 13, of net vervangen): dan geen afdruk.
      }
    }
    this.afdrukken = nogNiet
  }

  beeld(loopt: boolean): MetingBeeld {
    const s = this.segment
    return {
      loopt: loopt && Boolean(this.map),
      bus: s?.busNaam,
      stappen: MEET_STAPPEN.map((id) => ({ id, klaar: Boolean(s?.vinkjes.has(id)) })),
      regels: this.regels,
      seconden: this.map ? Math.round((this.nu() - this.begin) / 1000) : 0,
      gevraagd: s?.gevraagd ?? 0,
      afgevallen: s?.afgevallen ?? 0,
      opgeslagen: this.laatstOpgeslagen
    }
  }

  /**
   * "Meting opslaan": alles van deze meting in één zip naast de map, plus wat
   * het hoofdproces erbij geeft (het ritspoor van de dienst, onder een naam
   * zonder profiel). Daarna begint de volgende regel een nieuwe meting. Zonder
   * meting die loopt: de laatste map in `metingen/` die nog geen zip heeft
   * (na een herstart van de app). Geeft het pad van de zip, of niets.
   */
  opslaan(extra: Array<{ naam: string; pad: string }> = []): string | undefined {
    const map = this.map ?? this.laatsteMap()
    if (!map || !existsSync(map)) return undefined
    this.segmentKlaar()
    const nu = this.nu()
    if (this.map === map) {
      writeFileSync(
        join(map, 'meting.json'),
        JSON.stringify(
          {
            versie: MEET_VERSIE,
            begin: new Date(this.begin).toISOString(),
            eind: new Date(nu).toISOString(),
            regels: this.regels,
            bussen: this.segmenten
          },
          null,
          2
        )
      )
    }
    const bestanden: Array<{ naam: string; inhoud: Buffer }> = []
    for (const naam of readdirSync(map).sort()) {
      const pad = join(map, naam)
      try {
        if (statSync(pad).isFile()) bestanden.push({ naam, inhoud: readFileSync(pad) })
      } catch {
        // Net weg: dan niet mee.
      }
    }
    for (const { naam, pad } of extra) {
      try {
        if (existsSync(pad)) bestanden.push({ naam, inhoud: readFileSync(pad) })
      } catch {
        // Niet te lezen: dan niet mee.
      }
    }
    const zip = `${map}.zip`
    writeFileSync(zip, maakZip(bestanden, new Date(nu)))
    this.laatstOpgeslagen = basename(zip)
    this.melden(`meetstand: opgeslagen als ${basename(zip)} (${bestanden.length} bestanden)`)
    if (this.map === map) {
      this.map = undefined
      this.segment = undefined
      this.segmenten = []
      this.regels = 0
      this.afdrukken = []
    }
    return zip
  }

  /** De nieuwste meetmap zonder zip ernaast. */
  private laatsteMap(): string | undefined {
    try {
      return readdirSync(this.basis)
        .filter((naam) => naam.startsWith('meting-') && !naam.endsWith('.zip'))
        .map((naam) => join(this.basis, naam))
        .filter((pad) => statSync(pad).isDirectory() && !existsSync(`${pad}.zip`))
        .sort()
        .pop()
    } catch {
      return undefined
    }
  }
}
