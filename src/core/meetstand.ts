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
 * - Voor de twee open punten uit §5: de plek op de kaart in elke regel en de
 *   flitspalen van de dienst (kant en bereik van een paal), en de hele
 *   kaartverkoop met `ticketSlecht` en het gegeven geld.
 * - "Meting opslaan": één zip, zonder persoonlijke gegevens, op de
 *   achtergrond. Daarna gaat de ruwe map weg en rust de sessie tot de volgende
 *   dienst of rit; hoogstens 250 MB per meting, en de nieuwste vijf metingen
 *   blijven staan (tegenlezing en proefverslag van 30-09).
 *
 * WAT ER NIET IN KOMT
 * Geen naam van de chauffeur, geen personeelsnummer of pincode, geen profiel,
 * geen paden van deze pc (een absoluut buspad of modelpad wordt ingekort tot
 * vanaf `vehicles`), en in de afdrukken niet wat de speler in de IBIS als
 * nummer of pincode intikte (`AFDRUK_GEHEIM`). Wel de bus, de kaart en de
 * haltes -- dat is spelmateriaal.
 *
 * In "alleen bekijken" meet de app niet: de gebruikersmap is dan een kopie
 * die weggaat zodra hij sluit (main, `metingGeweigerd`).
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
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { MEET_STAPPEN, type MeetStap, type MetingBeeld } from '../shared/meetstand'
import { DEUR_GETALLEN, type LiveData, type LiveStatus } from './live'
import { FLITS, type Flitspaal } from './onderweg'
import { blockTag, readOmsiLines, str } from './omsiFile'
import { maakZipAchtergrond, openZip } from './zip'

/** De versie van het meetbestand; omhoog als de regels van vorm veranderen. */
export const MEET_VERSIE = 1

/** Elke zoveel milliseconden een regel (de opdracht: 250 ms). */
export const MEET_INTERVAL_MS = 250

/** Elke zoveel milliseconden alle scriptgetallen, niet alleen wat veranderde. */
const VOL_ELKE_MS = 10_000

/**
 * Zo groot mag één meting worden; daarna stopt het schrijven tot hij is
 * opgeslagen. Nagemeten in de tegenlezing van 30-09 met de varlists van de C2:
 * 10 MB per uur als er niets verandert, 26 MB bij 40 scriptgetallen die
 * bewegen, 73 MB bij 150. Ronde 0 (drie bussen, elk een half uur tot drie
 * kwartier) blijft daar ruim onder; wie de meetstand vergeet uit te zetten,
 * vult zo niet ongemerkt de schijf.
 */
export const MEET_MAX_BYTES = 250 * 1024 * 1024

/**
 * Zoveel metingen (een map of een zip, de nieuwste) blijven er in `metingen/`
 * staan; oudere gaan weg. Een map waar al een zip van is, gaat meteen weg: de
 * zip heeft alles.
 */
export const METINGEN_BEWAARD = 5

/**
 * Namen in de afdruk waarvan het getal NIET meegaat: wat de speler in de IBIS
 * van de bus intikt als chauffeursnummer of pincode (`IBIS_PIN`, in de o530
 * `6_numer_kierowcy`, Pools voor "nummer van de chauffeur"). Dat is niet het
 * nummer uit het profiel van de app, maar het kan hetzelfde zijn; voor ronde 0
 * doet het er niet toe. De naam blijft staan, het getal wordt `null`.
 */
export const AFDRUK_GEHEIM =
  /(^|_)pin($|_)|kierowc|fahrernummer|fahrer_?nr|personalnummer|personal_?nr|dienstnummer|driver_?(id|nr|num)/i

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
  /**
   * Waar de bus op de kaart staat, zoals de flitspalen hem zien (`vehicleOnMap`
   * in main; kaartmeters, koers in graden). Alleen als die stand vers is. Voor
   * §5 van het ontwerp: aan welke kant en op welke afstand de bus langs een
   * paal komt.
   */
  plek?: { x: number; y: number; koers: number }
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
  /** De flitspalen van de dienst (`palenVoor` in main), zodra ze er zijn; verandert de lijst, dan een regel `palen`. */
  palen?: readonly Flitspaal[]
}

interface Segment {
  nr: number
  sleutel: string
  busNaam: string
  bestand: string
  vinkjes: Set<MeetStap>
  /** Hoeveel afdrukken er per stap al gemaakt zijn: de tweede heet `dump-1-knielen-2.json`. */
  afdrukNr: Map<MeetStap, number>
  vorige: Map<string, number | null>
  volOp: number
  gevraagdSleutel: string
  gevraagd: number
  afgevallen: number
  onbekend: string
  palen: string
}

/** Een afdruk van getallen.json die nog gemaakt moet worden. */
interface Afdruk {
  naam: string
  /** Pas een afdruk die de plugin NA dit moment schreef. */
  na: number
  /** Daarna toch, wat er dan ligt. */
  tot: number
  busNaam: string
  /** Bij welke vink hij hoort: een vink die weer uitgaat, schrapt hem. */
  segment?: number
  stap?: MeetStap
}

/** Per bus in meting.json. `regels` zijn alle regels van het bestand, `meetregels` alleen die met `t: 'm'`. */
interface SegmentRij {
  nr: number
  bus: string
  model: string
  pad: string
  regels: number
  meetregels: number
  vinkjes: MeetStap[]
}

function stempel(tijd: Date): string {
  const t = (n: number): string => String(n).padStart(2, '0')
  return (
    `${tijd.getFullYear()}${t(tijd.getMonth() + 1)}${t(tijd.getDate())}-` +
    `${t(tijd.getHours())}${t(tijd.getMinutes())}${t(tijd.getSeconds())}`
  )
}

/** Een map of zip van de meetstand, en niets anders: alleen die ruimt `ruimOp` op. */
const MEETNAAM = /^meting-\d{8}-\d{6}(\.zip)?$/

/**
 * Een afdruk van getallen.json zonder wat de speler als nummer of pincode
 * intikte (`AFDRUK_GEHEIM`). Is het geen JSON zoals de plugin hem schrijft,
 * dan gaat hij niet mee: liever geen afdruk dan een die niet na te kijken was.
 */
export function veiligeAfdruk(inhoud: Buffer): Buffer | undefined {
  let data: unknown
  try {
    data = JSON.parse(inhoud.toString('utf8'))
  } catch {
    return undefined
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const getallen = (data as { getallen?: unknown }).getallen
  if (!getallen || typeof getallen !== 'object' || Array.isArray(getallen)) return undefined
  const schoon: Record<string, unknown> = { ...(getallen as Record<string, unknown>) }
  const gemaskeerd = Object.keys(schoon).filter((naam) => AFDRUK_GEHEIM.test(naam))
  for (const naam of gemaskeerd) schoon[naam] = null
  return Buffer.from(
    JSON.stringify({ ...(data as Record<string, unknown>), getallen: schoon, ...(gemaskeerd.length > 0 ? { gemaskeerd } : {}) })
  )
}

/**
 * Eén meting: van de eerste regel tot "Meting opslaan". Een wissel van bus
 * begint een nieuw bestand in dezelfde meting, zodat de drie bussen van ronde
 * 0 in één zip komen -- ook als er tussendoor een dienst afgerond wordt.
 *
 * NA HET OPSLAAN RUST HIJ
 * Eerst begon de volgende regel meteen een nieuwe meting. Wie de handleiding
 * volgde (opslaan, dan de meetstand uit) terwijl de dienst nog liep, hield een
 * losse map over zonder zip, en een latere "Meting opslaan" zonder lopende
 * meting pakte juist dat restje in (proefverslag 30-09, punt 5). Nu wacht de
 * sessie na het opslaan op `hervat`: het hoofdproces roept dat aan als er een
 * nieuwe dienst of vrije rit begint, of als de meetstand weer aan gaat. Is de
 * meting vol (`MEET_MAX_BYTES`), dan rust hij ook, tot hij opgeslagen is.
 */
export class Meetsessie {
  private map?: string
  private begin = 0
  private segment?: Segment
  private segmenten: SegmentRij[] = []
  private regels = 0
  private bytes = 0
  private afdrukken: Afdruk[] = []
  private laatstOpgeslagen?: string
  private schrijfFout = false
  private rust?: 'opgeslagen' | 'vol'
  private bezig?: Promise<string | undefined>
  private opgeruimd = false

  constructor(
    /** `<gebruikersmap>/metingen`. */
    private readonly basis: string,
    /** Waar de plugin getallen.json neerzet (`liveMap()`). */
    private readonly getallenJson: () => string,
    private readonly nu: () => number = Date.now,
    private readonly melden: (regel: string) => void = () => undefined,
    /** Voor de proef: een kleinere grens en minder metingen bewaard. */
    private readonly grenzen: { maxBytes?: number; bewaard?: number } = {}
  ) {}

  /** De map van de meting die loopt of het laatst liep, voor de proef en het logboek. */
  get mapVanMeting(): string | undefined {
    return this.map
  }

  /** Wanneer de meting die loopt begon (ms); niets als er geen loopt. */
  get begonnenOp(): number | undefined {
    return this.map ? this.begin : undefined
  }

  /** Na het opslaan weer klaar voor een nieuwe meting; zie "NA HET OPSLAAN RUST HIJ". Een volle meting blijft vol. */
  hervat(): void {
    if (this.rust === 'opgeslagen') this.rust = undefined
  }

  /** Eén regel, elke 250 ms zolang er gemeten wordt. */
  schrijf(invoer: MeetInvoer, kop: MeetKop): void {
    if (this.rust) return
    const { live } = invoer
    const nu = this.nu()
    if (!this.map) {
      if (!this.opgeruimd) this.ruimOp()
      this.map = join(this.basis, `meting-${stempel(new Date(nu))}`)
      this.begin = nu
      this.segment = undefined
      this.segmenten = []
      this.regels = 0
      this.bytes = 0
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
    /*
     * De gevraagde lijst veranderde (de varlists waren er pas later, of een
     * apparaat erbij). Niet zolang er geen bus is: dan vraagt de app alleen de
     * vier extra veringen, en kwam er een regel `vraag` met alleen die vier in
     * het bestand van de vorige bus (proefverslag 30-09, punt 9).
     */
    const gevraagdSleutel = `${kop.gevraagd.join('|')}#${kop.afgevallen.length}`
    if (heeftBus && gevraagdSleutel !== segment.gevraagdSleutel) {
      segment.gevraagdSleutel = gevraagdSleutel
      segment.gevraagd = kop.gevraagd.length
      segment.afgevallen = kop.afgevallen.length
      uit.push({ t: 'vraag', tijd: nu - this.begin, getallen: kop.gevraagd, afgevallen: kop.afgevallen, varlists: kop.varlists })
    }
    /* Wat de bus niet kent, zegt de plugin; ook dat is een uitkomst. */
    const onbekend = (live.getallenOnbekend ?? []).join('|')
    if (heeftBus && onbekend !== segment.onbekend) {
      segment.onbekend = onbekend
      uit.push({ t: 'onbekend', tijd: nu - this.begin, namen: live.getallenOnbekend ?? [] })
    }
    /* De flitspalen van de dienst, zodra ze er zijn: waar ze staan, voor welke limiet, en tot welke afstand de app meet. */
    const palen = kop.palen?.length ? `${kop.palen.length}:${kop.palen[0].id}:${kop.palen[kop.palen.length - 1].id}` : ''
    if (palen && palen !== segment.palen) {
      segment.palen = palen
      uit.push({
        t: 'palen',
        tijd: nu - this.begin,
        bereikM: FLITS.bereikM,
        palen: (kop.palen ?? []).map((p) => ({ id: p.id, x: afgerond(p.x), y: afgerond(p.y), kmh: p.kmh }))
      })
    }
    uit.push(this.meetRegel(invoer, kop, segment, nu))
    this.voegToe(segment, uit)
    this.regels += 1
    const rij = this.segmenten.find((r) => r.nr === segment.nr)
    if (rij) rij.meetregels += 1
    this.maakAfdrukken(nu)
    if (this.bytes >= (this.grenzen.maxBytes ?? MEET_MAX_BYTES)) {
      this.rust = 'vol'
      this.melden(
        `meetstand: meting vol (${Math.round(this.bytes / 1024 / 1024)} MB); er komt niets meer bij tot hij opgeslagen is`
      )
    }
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
      afdrukNr: new Map(),
      vorige: new Map(),
      volOp: 0,
      gevraagdSleutel: `${kop.gevraagd.join('|')}#${kop.afgevallen.length}`,
      gevraagd: kop.gevraagd.length,
      afgevallen: kop.afgevallen.length,
      onbekend: '',
      palen: ''
    }
    /* Het model net zo ingekort als het pad: een absoluut pad van deze pc hoort niet in de zip (proefverslag 30-09, punt 7). */
    const model = veiligBuspad(live.bus?.model)
    const pad = veiligBuspad(live.bus?.pad)
    this.segmenten.push({ nr, bus: busNaam, model, pad, regels: 0, meetregels: 0, vinkjes: [] })
    this.voegToe(this.segment, [
      {
        t: 'kop',
        versie: MEET_VERSIE,
        begin: new Date(nu).toISOString(),
        tijd: nu - this.begin,
        app: kop.appVersie,
        plugin: live.plugin ?? null,
        exe: live.exeVersion ?? null,
        bus: { naam: busNaam, model, pad },
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
    const { live, status, plek } = invoer
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
      /* Waar op de kaart, zoals de flitspalen hem zien: [x, y] in meters en de koers in graden. */
      plek: plek ? [Math.round(plek.x * 10) / 10, Math.round(plek.y * 10) / 10, Math.round(plek.koers)] : null,
      deuren: DEUR_GETALLEN.map((naam) => getal(naam)),
      deur0: [live.entryOpen, live.exitOpen, live.entryRequest, live.exitRequest],
      knipper: [live.blinkerLeft, live.blinkerRight],
      licht: live.lightsLow,
      remlicht: live.brakeLight,
      motor: live.engineOn,
      tank: typeof live.tankPercent === 'number' && Number.isFinite(live.tankPercent) ? afgerond(live.tankPercent) : null,
      /*
       * De kaartverkoop met alles wat de plugin van de klant doorgeeft: of
       * `ticketSlecht` betrouwbaar aangaat (§5), staat naast `prijs` en `gegeven`.
       */
      kassa: verkoop
        ? {
            koper: mem?.koper ?? -1,
            soort: mem?.ticketSoort ?? null,
            index: mem?.ticketIndex ?? null,
            prijs: mem?.ticketPrijs ?? 0,
            gegeven: mem?.ticketGegeven ?? null,
            slecht: mem?.ticketSlecht ?? null,
            klaar: mem?.ticketKlaar ?? 0,
            verkocht: invoer.verkocht
          }
        : { verkocht: invoer.verkocht },
      getallen,
      ...(vol ? { vol: true } : {})
    }
  }

  private voegToe(segment: Segment, regels: object[]): void {
    try {
      const tekst = regels.map((r) => JSON.stringify(r)).join('\n') + '\n'
      appendFileSync(segment.bestand, tekst)
      this.bytes += Buffer.byteLength(tekst)
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
   *
   * Nog een keer dezelfde stap afvinken geeft een tweede afdruk
   * (`dump-1-knielen-2.json`) in plaats van de eerste te overschrijven, en een
   * vink die weer uitgaat voordat zijn afdruk er is, schrapt die afdruk
   * (proefverslag 30-09, punt 6). Een afdruk die er al is, blijft; de regel
   * `vink` met `aan: false` zegt dan dat hij niet telt.
   */
  vink(stap: MeetStap, aan: boolean): boolean {
    const segment = this.segment
    if (!this.map || !segment || this.rust) return false
    if (aan) segment.vinkjes.add(stap)
    else segment.vinkjes.delete(stap)
    const nu = this.nu()
    let dump: string | undefined
    let geschrapt: string[] = []
    if (aan) {
      const nr = (segment.afdrukNr.get(stap) ?? 0) + 1
      segment.afdrukNr.set(stap, nr)
      dump = nr === 1 ? `dump-${segment.nr}-${stap}.json` : `dump-${segment.nr}-${stap}-${nr}.json`
    } else {
      const hoort = (a: Afdruk): boolean => a.segment === segment.nr && a.stap === stap
      geschrapt = this.afdrukken.filter(hoort).map((a) => a.naam)
      this.afdrukken = this.afdrukken.filter((a) => !hoort(a))
    }
    this.voegToe(segment, [
      {
        t: 'vink',
        tijd: nu - this.begin,
        stap,
        aan,
        ...(dump ? { dump } : {}),
        ...(geschrapt.length > 0 ? { geschrapt } : {})
      }
    ])
    if (dump) this.afdrukken.push({ naam: dump, na: nu, tot: nu + 6000, busNaam: segment.busNaam, segment: segment.nr, stap })
    this.segmentKlaar()
    return true
  }

  /** Afdrukken van getallen.json die klaar zijn om te maken; met `nu` oneindig alles wat nog wacht, met wat er ligt. */
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
        const veilig = veiligeAfdruk(inhoud)
        if (veilig) writeFileSync(join(this.map, afdruk.naam), veilig)
      } catch {
        // Geen getallen.json (plugin ouder dan 13, of net vervangen): dan geen afdruk.
      }
    }
    this.afdrukken = nogNiet
  }

  beeld(loopt: boolean): MetingBeeld {
    const s = this.segment
    return {
      loopt: loopt && Boolean(this.map) && !this.rust,
      bus: s?.busNaam,
      stappen: MEET_STAPPEN.map((id) => ({ id, klaar: Boolean(s?.vinkjes.has(id)) })),
      regels: this.regels,
      seconden: this.map ? Math.round((this.nu() - this.begin) / 1000) : 0,
      gevraagd: s?.gevraagd ?? 0,
      afgevallen: s?.afgevallen ?? 0,
      opgeslagen: this.laatstOpgeslagen,
      ...(this.rust ? { rust: this.rust } : {})
    }
  }

  /**
   * "Meting opslaan": alles van deze meting in één zip naast de map, plus wat
   * het hoofdproces erbij geeft (het ritspoor van de dienst, onder een naam
   * zonder profiel). Zonder meting die loopt: de laatste map in `metingen/`
   * die nog geen zip heeft (na een herstart van de app). Geeft het pad van de
   * zip, of niets.
   *
   * Daarna rust de sessie (zie boven), en na een zip die terug te lezen is gaat
   * de ruwe map weg: eerst bleef hij naast de zip staan, en werd `metingen/`
   * met elke meting groter (tegenlezing 30-09, punt 1).
   *
   * Op de achtergrond (`maakZipAchtergrond`): een meting van 40-70 MB hield
   * het hoofdproces anders ruim een seconde vast. Twee keer drukken terwijl
   * hij bezig is, geeft twee keer dezelfde zip.
   */
  opslaan(extra: Array<{ naam: string; pad: string }> = []): Promise<string | undefined> {
    this.bezig ??= this.slaOp(extra).finally(() => {
      this.bezig = undefined
    })
    return this.bezig
  }

  private async slaOp(extra: Array<{ naam: string; pad: string }>): Promise<string | undefined> {
    const lopend = this.map
    const map = lopend ?? this.laatsteMap()
    if (!map || !existsSync(map)) return undefined
    const nu = this.nu()
    if (lopend) {
      /* Wat nog op een afdruk wachtte, nu met wat er ligt; daarna is de meting dicht. */
      this.maakAfdrukken(Number.POSITIVE_INFINITY)
      this.segmentKlaar()
      writeFileSync(
        join(map, 'meting.json'),
        JSON.stringify(
          {
            versie: MEET_VERSIE,
            begin: new Date(this.begin).toISOString(),
            eind: new Date(nu).toISOString(),
            /* Alleen de regels met `t: 'm'`; per bus staan er ook alle regels van het bestand. */
            meetregels: this.regels,
            bussen: this.segmenten
          },
          null,
          2
        )
      )
      this.map = undefined
      this.segment = undefined
      this.segmenten = []
      this.regels = 0
      this.bytes = 0
      this.afdrukken = []
      this.rust = 'opgeslagen'
    }
    const bestanden: Array<{ naam: string; inhoud: Buffer }> = []
    for (const naam of readdirSync(map).sort()) {
      const pad = join(map, naam)
      try {
        if (statSync(pad).isFile()) bestanden.push({ naam, inhoud: await readFile(pad) })
      } catch {
        // Net weg: dan niet mee.
      }
    }
    for (const { naam, pad } of extra) {
      try {
        if (existsSync(pad)) bestanden.push({ naam, inhoud: await readFile(pad) })
      } catch {
        // Niet te lezen: dan niet mee.
      }
    }
    const zip = `${map}.zip`
    const tijdelijk = `${zip}.tmp`
    await writeFile(tijdelijk, await maakZipAchtergrond(bestanden, new Date(nu)))
    await rename(tijdelijk, zip)
    this.laatstOpgeslagen = basename(zip)
    this.melden(`meetstand: opgeslagen als ${basename(zip)} (${bestanden.length} bestanden)`)
    /* De ruwe map pas weg als de zip terug te lezen is, met dezelfde bestanden even groot. */
    let klopt = false
    try {
      const gelezen = openZip(zip)
      const inZip = gelezen.bestanden.map((b) => `${b.naam}:${b.grootte}`).sort()
      gelezen.sluit()
      klopt = inZip.join('|') === bestanden.map((b) => `${b.naam}:${b.inhoud.length}`).sort().join('|')
    } catch {
      klopt = false
    }
    if (klopt) rmSync(map, { recursive: true, force: true })
    else this.melden(`meetstand: de zip klopt niet met ${basename(map)}; de map blijft staan`)
    this.ruimOp()
    return zip
  }

  /** De nieuwste meetmap zonder zip ernaast. */
  private laatsteMap(): string | undefined {
    try {
      return readdirSync(this.basis)
        .filter((naam) => MEETNAAM.test(naam) && !naam.endsWith('.zip'))
        .map((naam) => join(this.basis, naam))
        .filter((pad) => statSync(pad).isDirectory() && !existsSync(`${pad}.zip`))
        .sort()
        .pop()
    } catch {
      return undefined
    }
  }

  /**
   * `metingen/` klein houden: een map waar al een zip van is weg, een half
   * geschreven zip weg, en van de rest de nieuwste `METINGEN_BEWAARD`. De
   * meting die loopt blijft altijd. Alleen namen van de meetstand zelf
   * (`meting-JJJJMMDD-UUMMSS`, met of zonder `.zip`): wat iemand anders in de
   * map zet, blijft staan.
   */
  ruimOp(): void {
    this.opgeruimd = true
    let namen: string[]
    try {
      namen = readdirSync(this.basis)
    } catch {
      return
    }
    const weg = (naam: string): void => {
      try {
        rmSync(join(this.basis, naam), { recursive: true, force: true })
      } catch {
        // Vastgehouden (Verkenner, Defender): dan de volgende keer.
      }
    }
    const lopend = this.map ? basename(this.map) : undefined
    if (!this.bezig) {
      for (const naam of namen) if (/^meting-\d{8}-\d{6}\.zip\.tmp$/.test(naam)) weg(naam)
    }
    const stammen = new Set<string>()
    for (const naam of namen) {
      if (!MEETNAAM.test(naam)) continue
      const stam = naam.replace(/\.zip$/, '')
      if (!naam.endsWith('.zip') && stam !== lopend && namen.includes(`${stam}.zip`)) weg(naam)
      stammen.add(stam)
    }
    const oud = [...stammen].filter((stam) => stam !== lopend).sort()
    const bewaard = Math.max(0, (this.grenzen.bewaard ?? METINGEN_BEWAARD) - (lopend ? 1 : 0))
    for (const stam of oud.slice(0, Math.max(0, oud.length - bewaard))) {
      if (namen.includes(stam)) weg(stam)
      if (namen.includes(`${stam}.zip`)) weg(`${stam}.zip`)
    }
  }
}
