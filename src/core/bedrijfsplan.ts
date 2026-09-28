import { REGELS, type Busvorm } from './bedrijf'
import { dayKind, runsOn, type Calendar } from './calendar'
import { MIN_STOPS_FOR_BUS_LINE } from './network'
import { tripMinutes } from './timetable'
import type { OmsiMap } from './types'
import type {
  DienstSleutel,
  DienstVanDag,
  Dagrooster,
  KaartDag,
  LijnWeek,
  OmloopSleutel,
  OmloopVanDag,
  PlanRit
} from './planTypen'

/*
 * Het bedrijfsplan: welke omlopen en diensten er op een bedrijfsdag rijden.
 *
 * WAAROM
 * Het busbedrijf rekende met "dienstregelingsuren per dag" van een lijn, en
 * dat was het totaal van alle dagsoorten bij elkaar: een werkdag, zaterdag en
 * zondag opgeteld. Voor een planscherm -- welke bus op welke omloop, welke
 * chauffeur op welke dienst -- moet het de echte dag zijn. Die staat in de
 * dienstregeling van de kaart: `map.tours` met hun dagmasker, en de kalender
 * met feestdagen en vakanties (calendar.ts).
 *
 * WAT HIER STAAT
 * Alleen rekenen, zonder Network (dat laat de korte ritten weg, en die rijdt
 * de chauffeur wel). Het ontwerp is design/ontwerpen/busbedrijf-planning.md
 * §1 en §3.1; de getallen daar (lijn 109: werkdag 28 diensten, zaterdag 23,
 * zondag 18) zijn op Lucs kaart gemeten en lokaal na te rekenen met
 * scripts/probe-bedrijfsplan.ts.
 */

/** Een dienst duurt hoogstens zoveel minuten; een langere omloop wordt geknipt. */
export const DIENST_MAX: number = REGELS.planning.dienstMax
/** Knippen mag alleen waar de bus minstens zo lang stilstaat. */
export const KNIP_PAUZE: number = REGELS.planning.knipPauze

const DAG_MS = 86_400_000

/**
 * Het anker van een kaart: de maandag op of vóór haar tijdvak. Dag 1 van het
 * bedrijf valt daarop, zodat een week op maandag begint en dag 7 een zondag is.
 */
export function ankerVoor(tijdvak: { year: number; dayOfYear: number }): string {
  const datum = new Date(Date.UTC(tijdvak.year, 0, tijdvak.dayOfYear))
  const maandag = new Date(datum.getTime() - ((datum.getUTCDay() + 6) % 7) * DAG_MS)
  return maandag.toISOString().slice(0, 10)
}

/** De datum van een bedrijfsdag op deze kaart, als UTC-middernacht. */
export function bedrijfsdatum(anker: string, dag: number): Date {
  const [j, m, d] = anker.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d) + (dag - 1) * DAG_MS)
}

/*
 * De sleutels. tourNumber staat achteraan omdat het vrije tekst is (er kan een
 * `|` in staan); ontleden gaat dus van links voor de omloop en van rechts voor
 * het deel.
 */
export function omloopSleutel(mapFolder: string, lineFile: string, days: number, tourNumber: string): OmloopSleutel {
  return `${mapFolder}|${lineFile}|${days}|${tourNumber}`
}

export function dienstSleutel(omloop: OmloopSleutel, deel: number): DienstSleutel {
  return `${omloop}|${deel}`
}

export function ontleedOmloop(s: string): { mapFolder: string; lineFile: string; days: number; tourNumber: string } | undefined {
  const a = s.indexOf('|')
  const b = a < 0 ? -1 : s.indexOf('|', a + 1)
  const c = b < 0 ? -1 : s.indexOf('|', b + 1)
  if (c < 0) return undefined
  const days = Number(s.slice(b + 1, c))
  if (!Number.isInteger(days)) return undefined
  return { mapFolder: s.slice(0, a), lineFile: s.slice(a + 1, b), days, tourNumber: s.slice(c + 1) }
}

export function ontleedDienst(s: string): { omloop: OmloopSleutel; deel: number } | undefined {
  const at = s.lastIndexOf('|')
  if (at < 0) return undefined
  const deel = Number(s.slice(at + 1))
  const omloop = s.slice(0, at)
  if (!Number.isInteger(deel) || deel < 1 || !ontleedOmloop(omloop)) return undefined
  return { omloop, deel }
}

/** De busvorm die de remisenaam van een omloop noemt, als hij dat doet. */
export function vormVanDepot(depot: string): Busvorm | undefined {
  if (/gelenk|schlenk/i.test(depot)) return 'geleed'
  if (/doppeldeck|\bdd\b/i.test(depot)) return 'dubbel'
  if (/midi|kurz/i.test(depot)) return 'midi'
  if (/solo|standard/i.test(depot)) return 'solo'
  return undefined
}

/**
 * Een omloop in diensten knippen.
 *
 * Zoveel delen als nodig om onder `max` te blijven, met de knippen zo dicht
 * mogelijk bij een gelijke verdeling. Knippen mag alleen vóór een rit die telt
 * (minstens drie haltes: daar kan een chauffeur instappen), na minstens
 * `KNIP_PAUZE` minuten stilstand. Is er geen plek, dan wordt er niet geknipt;
 * een stuk zonder telbare rit gaat op in het vorige.
 */
export function knipOmloop(ritten: PlanRit[], max: number = DIENST_MAX): PlanRit[][] {
  if (ritten.length === 0) return []
  const begin = ritten[0].vertrek
  const span = Math.max(...ritten.map((r) => r.aankomst)) - begin
  const delen = Math.max(1, Math.ceil(span / max))
  const knippen: number[] = []
  for (let k = 1; k < delen; k++) {
    const ideaal = begin + (span * k) / delen
    let beste: number | undefined
    for (let i = 1; i < ritten.length; i++) {
      if (i <= (knippen[knippen.length - 1] ?? 0)) continue
      if (!ritten[i].telt || ritten[i].vertrek - ritten[i - 1].aankomst < KNIP_PAUZE) continue
      if (beste === undefined || Math.abs(ritten[i].vertrek - ideaal) < Math.abs(ritten[beste].vertrek - ideaal)) beste = i
    }
    if (beste !== undefined) knippen.push(beste)
  }
  const stukken: PlanRit[][] = []
  let vanaf = 0
  for (const knip of [...knippen, ritten.length]) {
    stukken.push(ritten.slice(vanaf, knip))
    vanaf = knip
  }
  // Een stuk zonder rit die telt, gaat op in het vorige (of, als eerste, in het volgende).
  const uit: PlanRit[][] = []
  for (const stuk of stukken) {
    if (stuk.some((r) => r.telt) || uit.length === 0) uit.push(stuk)
    else uit[uit.length - 1].push(...stuk)
  }
  if (uit.length > 1 && !uit[0].some((r) => r.telt)) uit.splice(0, 2, [...uit[0], ...uit[1]])
  return uit
}

function rituren(ritten: PlanRit[]): number {
  return ritten.filter((r) => r.telt).reduce((som, r) => som + (r.aankomst - r.vertrek) / 60, 0)
}

/**
 * De omlopen van één lijn op één datum.
 *
 * Alle ritten van de omloop, ook de korte (Überliegeplatz, LEE met twee
 * haltes): die rijdt de chauffeur ook, dus ze tellen voor zijn werktijd. Geld
 * en rituren komen alleen uit de ritten die tellen.
 */
export function omlopenVanDag(map: OmsiMap, lineFile: string, datum: Date, kalender: Calendar): OmloopVanDag[] {
  const lijnSleutel = lineFile.toLowerCase()
  const uit: OmloopVanDag[] = []
  for (const tour of map.tours) {
    if (tour.lineFile.toLowerCase() !== lijnSleutel || !runsOn(tour.days, datum, kalender)) continue
    const gezien = new Set<string>()
    const ritten: PlanRit[] = []
    for (const entry of [...tour.trips].sort((a, b) => a.departure - b.departure)) {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!trip) continue
      const sleutel = `${entry.tripFile.toLowerCase()}@${entry.departure}`
      if (gezien.has(sleutel)) continue
      gezien.add(sleutel)
      const eerste = trip.stops[0]
      ritten.push({
        sleutel,
        tripFile: entry.tripFile,
        vertrek: entry.departure,
        aankomst: entry.departure + tripMinutes(trip, entry.profileIndex),
        haltes: trip.stops.length,
        telt: trip.stops.length >= MIN_STOPS_FOR_BUS_LINE,
        lijn: trip.lineNumber || trip.ident || tour.lineFile,
        van: eerste ? (eerste.name ?? map.stops.get(eerste.id)?.name ?? '') : '',
        naar: trip.terminus
      })
    }
    if (!ritten.some((r) => r.telt)) continue
    const sleutel = omloopSleutel(map.folder, tour.lineFile, tour.days, tour.number)
    const stukken = knipOmloop(ritten)
    const diensten: DienstVanDag[] = stukken.map((stuk, i) => {
      const van = stuk[0].vertrek
      const tot = Math.max(...stuk.map((r) => r.aankomst))
      return {
        sleutel: dienstSleutel(sleutel, i + 1),
        omloop: sleutel,
        deel: i + 1,
        delen: stukken.length,
        van,
        tot,
        minuten: tot - van,
        rituren: rituren(stuk),
        ritten: stuk
      }
    })
    const van = ritten[0].vertrek
    const tot = Math.max(...ritten.map((r) => r.aankomst))
    uit.push({
      sleutel,
      mapFolder: map.folder,
      lineFile: tour.lineFile,
      lijn: ritten.find((r) => r.telt)!.lijn,
      tourNumber: tour.number,
      days: tour.days,
      depot: tour.depot,
      vorm: vormVanDepot(tour.depot),
      van,
      tot,
      minuten: tot - van,
      rituren: rituren(ritten),
      diensten
    })
  }
  return uit.sort((a, b) => a.van - b.van || a.sleutel.localeCompare(b.sleutel))
}

/** Een bedrijfsdag op één kaart, voor de lijnen van het bedrijf daar. */
export function kaartDag(map: OmsiMap, kalender: Calendar, lineFiles: string[], anker: string, dag: number): KaartDag {
  const datum = bedrijfsdatum(anker, dag)
  const omlopen = lineFiles
    .flatMap((lijn) => omlopenVanDag(map, lijn, datum, kalender))
    .sort((a, b) => a.van - b.van || a.sleutel.localeCompare(b.sleutel))
  return {
    mapFolder: map.folder,
    mapName: map.name,
    lineFiles,
    dag,
    datum: datum.toISOString().slice(0, 10),
    weekdag: datum.getUTCDay(),
    soort: dayKind(kalender, datum),
    omlopen
  }
}

/**
 * De week van elke lijn op deze kaart, vanaf `vanDag`: voor de concessiemarkt
 * (het weekgemiddelde) en de inschrijving (de drukste dag).
 */
export function lijnWeek(map: OmsiMap, kalender: Calendar, anker: string, vanDag: number): Record<string, LijnWeek> {
  const lijnen = [...new Set(map.tours.map((t) => t.lineFile))]
  const uit: Record<string, LijnWeek> = {}
  for (const lineFile of lijnen) {
    const dagen: LijnWeek['dagen'] = []
    for (let dag = vanDag; dag < vanDag + 7; dag++) {
      const datum = bedrijfsdatum(anker, dag)
      const omlopen = omlopenVanDag(map, lineFile, datum, kalender)
      const diensten = omlopen.flatMap((o) => o.diensten)
      dagen.push({
        dag,
        datum: datum.toISOString().slice(0, 10),
        omlopen: omlopen.length,
        diensten: diensten.length,
        rituren: omlopen.reduce((s, o) => s + o.rituren, 0),
        werkuren: diensten.reduce((s, d) => s + d.minuten / 60, 0)
      })
    }
    if (dagen.every((d) => d.omlopen === 0)) continue
    const gem = (f: (d: LijnWeek['dagen'][number]) => number): number => dagen.reduce((s, d) => s + f(d), 0) / dagen.length
    uit[lineFile] = {
      lineFile,
      dagen,
      gemRituren: gem((d) => d.rituren),
      gemWerkuren: gem((d) => d.werkuren),
      gemDiensten: gem((d) => d.diensten),
      gemOmlopen: gem((d) => d.omlopen),
      piekOmlopen: Math.max(...dagen.map((d) => d.omlopen))
    }
  }
  return uit
}

export function zoekOmloop(r: Dagrooster, s: OmloopSleutel): { kaart: KaartDag; omloop: OmloopVanDag } | undefined {
  for (const kaart of r.kaarten) {
    const omloop = kaart.omlopen.find((o) => o.sleutel === s)
    if (omloop) return { kaart, omloop }
  }
  return undefined
}

export function zoekDienst(
  r: Dagrooster,
  s: DienstSleutel
): { kaart: KaartDag; omloop: OmloopVanDag; dienst: DienstVanDag } | undefined {
  const o = ontleedDienst(s)
  const z = o && zoekOmloop(r, o.omloop)
  const dienst = z?.omloop.diensten.find((d) => d.sleutel === s)
  return z && dienst ? { ...z, dienst } : undefined
}

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const

/** Waarvoor een dagmasker geldt, om het rooster per masker te kunnen tonen ("geldt voor ma–vr"). */
export function maskerDagen(days: number): {
  dagen: Array<(typeof DAGNAMEN)[number]>
  feestdag: boolean
  periode?: 'school' | 'break'
} {
  const school = (days & (1 << 8)) !== 0
  const vakantie = (days & (1 << 9)) !== 0
  return {
    dagen: DAGNAMEN.filter((_, i) => (days & (1 << i)) !== 0),
    feestdag: (days & (1 << 7)) !== 0,
    periode: school && !vakantie ? 'school' : vakantie && !school ? 'break' : undefined
  }
}
