/**
 * Vindt vrij rijden de omloop die OMSI rijdt? (core/omloopvolgen.ts)
 *
 *   npx tsx scripts/probe-koppelen.ts [kaart ...]
 *
 * Over alle kaarten: per lijn en per omloop elke derde rit, met de klok op 0,
 * +8, -15 en +45 minuten van het vertrek, op een datum waarop de omloop rijdt.
 * OMSI wordt nagebootst zoals het monster van 21-09 het liet zien: `line` is de
 * plek van het `.ttl` in de map (readdir), `tour` de plek van de `[newtour]` in
 * het bestand, `tourEntry` de plek van de rit in de omloop, `trip` de plek van
 * het `.ttp`, en de namen kaal.
 *
 * Getoetst: de koppeling is `index`, de eerste rit en het hele vervolg kloppen,
 * en `readSchedule` (core/live.ts) wijst rit 0 aan, en na de volgende rit rit 1.
 *
 * Daarna de varianten, waar het misgaat als OMSI anders telt dan gedacht:
 * - een omloopnaam van één teken, verminkt ("1" wordt "1#x") -> nog steeds index;
 * - een omloopnaam van meer tekens die niet klopt -> geen index;
 * - `tripName` met het pad erin zoals de plugin het doorgeeft ("TTData 853_...");
 * - OMSI sorteert de ritten op vertrektijd -> uiterlijk na de eerste wissel
 *   `vertrek`, en nooit een verkeerde rit na een wissel;
 * - OMSI telt alleen de omlopen die vandaag rijden -> de goede dagvariant;
 * - een andere lijn met hetzelfde omloopnummer -> geen match in readSchedule;
 * - een teken buiten ASCII vervangen door een ander teken -> nog steeds index;
 * - een actieve chrono zonder bruikbare namen: `line` één verder en `lines`
 *   (plugin 14) één langer dan het aantal .ttl -> nooit een andere rit; met
 *   `lines` gelijk aan het aantal .ttl hetzelfde als zonder `lines`;
 * - het monster van 21-09 -> 853_ERN-HOB4 om 19:44;
 * - de reproducties uit het onderzoek (Hohenkirchen B_HBT-ERN, Ahlheim B_E-HBF
 *   en B_BOW-KUR), waar de oude weg een andere rit toonde;
 * - een exacte omloopnaam ("12") gaat voor een verminkte ("1" met rommel
 *   erachter), ook als die andere omloop vandaag wel rijdt en "12" niet;
 * - een keuze van een andere kaart (de app staat op A, OMSI speelt B) -> nooit
 *   een andere rit dan die OMSI bij naam noemt.
 *
 * Afsluitcode 0 alleen als het basisgeval 100% `index` is, geen enkele variant
 * een verkeerde rit oplevert, en er geen lijnbotsingen zijn.
 */
import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { dateForMask, readCalendar, runsOn } from '../src/core/calendar'
import { findOmsiInstall } from '../src/core/install'
import { readSchedule, type LiveData, type MemoryData } from '../src/core/live'
import { koppelOmsiKeuze, vouw, type Koppeling, type OmsiKeuze } from '../src/core/omloopvolgen'
import { listMaps, loadMap } from '../src/core/timetable'
import type { Duty, OmsiMap, Tour, TourTrip } from '../src/core/types'

const omsi = findOmsiInstall()
if (!omsi) {
  console.log('Geen OMSI 2 gevonden; proef overgeslagen.')
  process.exit(0)
}
const only = process.argv.slice(2)

const namenIn = (map: OmsiMap, soort: string): string[] =>
  readdirSync(join(map.path, 'TTData'))
    .filter((naam) => extname(naam).toLowerCase() === soort)
    .map((naam) => naam.slice(0, naam.length - soort.length))

function memVan(keuze: OmsiKeuze): MemoryData {
  return {
    ok: 1,
    tile: 0,
    x: 0,
    y: 0,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    schedActive: 1,
    line: keuze.line,
    tour: keuze.tour,
    tourEntry: keuze.tourEntry,
    trip: keuze.trip,
    nextIndex: 0,
    nextDist: 0,
    delay: 0,
    lineName: keuze.lineName,
    tourName: keuze.tourName,
    tripName: keuze.tripName,
    nextStop: ''
  }
}

function schema(keuze: OmsiKeuze, duty: Duty | undefined): ReturnType<typeof readSchedule> {
  return readSchedule({ mem: memVan(keuze) } as unknown as LiveData, duty, keuze.klok)
}

/** Wat er vanaf een rit echt volgt: de ritten met een `.ttp`, in deze volgorde. */
function verwacht(map: OmsiMap, reeks: TourTrip[]): string[] {
  return reeks
    .filter((entry) => map.trips.has(entry.tripFile.toLowerCase()))
    .map((entry) => `${entry.tripFile.toLowerCase()}@${entry.departure}`)
}

function gekregen(duty: Duty | undefined): string[] {
  return (duty?.legs ?? []).map((leg) => `${leg.tripFile.toLowerCase()}@${leg.departure}`)
}

function gelijk(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

const opVertrek = (tour: Tour): TourTrip[] =>
  tour.trips
    .map((entry, plek) => ({ entry, plek }))
    .sort((a, b) => a.entry.departure - b.entry.departure || a.plek - b.plek)
    .map((item) => item.entry)

const totaal = {
  basis: 0,
  basisIndex: 0,
  basisFout: 0,
  schemaFout: 0,
  varianten: 0,
  variantFout: 0,
  botsingen: 0
}
const fouten: string[] = []
/** De kaarten van de lus, voor de proef met een keuze van een andere kaart. */
const geladen: Array<{ folder: string; map: OmsiMap; ttlNamen: string[]; ttpNamen: string[]; kalender: ReturnType<typeof readCalendar> }> = []
const fout = (tekst: string): void => {
  if (fouten.length < 40) fouten.push(tekst)
}

for (const folder of listMaps(omsi)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(join(omsi, 'maps'), folder)
  if (!map || map.tours.length === 0) continue
  const ttlNamen = namenIn(map, '.ttl')
  const ttpNamen = namenIn(map, '.ttp')
  const kalender = readCalendar(map.path)
  const kaart = { basis: 0, index: 0, varianten: 0, fout: 0 }
  geladen.push({ folder, map, ttlNamen, ttpNamen, kalender })

  /* Lijnbotsingen: twee lijnbestanden die na het vouwen hetzelfde heten. */
  const gevouwen = new Map<string, string>()
  for (const naam of ttlNamen) {
    const sleutel = vouw(naam)
    if (gevouwen.has(sleutel)) {
      totaal.botsingen++
      fout(`${folder}: lijnbotsing ${gevouwen.get(sleutel)} / ${naam}`)
    } else gevouwen.set(sleutel, naam)
  }

  const koppel = (keuze: OmsiKeuze, datum: Date | undefined, voorkeur?: 'bestand' | 'vertrek'): Koppeling =>
    koppelOmsiKeuze(map, keuze, { kalender, ttlNamen, ttpNamen, datum, voorkeur })

  for (const tour of map.tours) {
    const line = ttlNamen.findIndex((naam) => naam === tour.lineFile)
    const datumVan = dateForMask(kalender, 2000, 100, tour.days)
    const datum = datumVan?.date
    const gesorteerd = opVertrek(tour)
    const ongesorteerd = tour.trips.some((entry, i) => entry !== gesorteerd[i])
    tour.trips.forEach((entry, plek) => {
      if (plek % 3 !== 0) return
      const trip = ttpNamen.findIndex((naam) => naam.toLowerCase() === entry.tripFile.toLowerCase())
      const basis: OmsiKeuze = {
        lineName: tour.lineFile,
        tourName: tour.number,
        tripName: entry.tripFile,
        line,
        tour: tour.index,
        tourEntry: entry.entry,
        trip,
        klok: entry.departure % 1440
      }
      const reeksBestand = tour.trips.slice(plek)
      const verwachtB = verwacht(map, reeksBestand)
      if (verwachtB.length === 0) return

      /* ---- het basisgeval, met vier klokken ---- */
      for (const scheef of [0, 8, -15, 45]) {
        const keuze = { ...basis, klok: (((entry.departure + scheef) % 1440) + 1440) % 1440 }
        const k = koppel(keuze, datum)
        totaal.basis++
        kaart.basis++
        if (k.soort === 'index') {
          totaal.basisIndex++
          kaart.index++
        }
        if (!gelijk(gekregen(k.duty), verwachtB)) {
          totaal.basisFout++
          kaart.fout++
          fout(`${folder} ${tour.lineFile}/"${tour.number}" #${entry.entry} ${entry.tripFile}: ${k.soort}, ${gekregen(k.duty).slice(0, 2).join(' ')} in plaats van ${verwachtB.slice(0, 2).join(' ')}`)
          continue
        }
        if (scheef !== 0) continue
        /* readSchedule: rit 0, en na de wissel naar de volgende rit rit 1. */
        const nu = schema(keuze, k.duty)
        const nuVerwacht = k.duty!.legs.findIndex((leg) => (leg.tourEntry ?? -1) >= entry.entry)
        if (!nu?.matchesDuty || nu.legIndex !== nuVerwacht) {
          totaal.schemaFout++
          fout(`${folder} ${tour.lineFile}/"${tour.number}" #${entry.entry}: readSchedule ${nu?.legIndex} i.p.v. ${nuVerwacht}`)
        }
        const volgende = tour.trips[plek + 1]
        if (volgende && map.trips.has(volgende.tripFile.toLowerCase())) {
          const later = schema(
            { ...keuze, tourEntry: volgende.entry, tripName: volgende.tripFile, klok: volgende.departure % 1440 },
            k.duty
          )
          const laterVerwacht = k.duty!.legs.findIndex((leg) => leg.tourEntry === volgende.entry)
          if (!later?.matchesDuty || later.legIndex !== laterVerwacht) {
            totaal.schemaFout++
            fout(`${folder} ${tour.lineFile}/"${tour.number}" na #${entry.entry}: readSchedule ${later?.legIndex} i.p.v. ${laterVerwacht}`)
          }
        }
      }

      /* ---- de varianten ---- */
      const variant = (naam: string, goed: boolean, uitleg: () => string): void => {
        totaal.varianten++
        kaart.varianten++
        if (!goed) {
          totaal.variantFout++
          kaart.fout++
          fout(`${folder} ${tour.lineFile}/"${tour.number}" #${entry.entry} [${naam}]: ${uitleg()}`)
        }
      }

      if (tour.number.trim().length === 1) {
        const k = koppel({ ...basis, tourName: `${tour.number.trim()}Ãx` }, datum)
        variant('naam van een teken', k.soort === 'index' && gelijk(gekregen(k.duty), verwachtB), () => k.soort)
      } else if (tour.number.trim().length > 1) {
        /*
         * Een andere omloop met dezelfde plek: niet op nummer koppelen. Wat
         * overblijft is hooguit de rit zelf, en die klopt dan wel.
         */
        const k = koppel({ ...basis, tourName: `${tour.number.trim()}#anders` }, datum)
        const eerste = gekregen(k.duty)[0]
        variant('andere naam', k.soort !== 'index' && k.soort !== 'vertrek', () => `${k.soort}, ${eerste}`)
      }

      {
        const k = koppel({ ...basis, tripName: `TTData ${entry.tripFile}` }, datum)
        variant('pad met spatie', k.soort === 'index' && gelijk(gekregen(k.duty), verwachtB), () => k.soort)
        const k2 = koppel({ ...basis, tripName: `TTData\\${entry.tripFile}.ttp` }, datum)
        variant('pad met backslash', k2.soort === 'index' && gelijk(gekregen(k2.duty), verwachtB), () => k2.soort)
      }

      if (/[^\x00-\x7e]/.test(entry.tripFile) || /[^\x00-\x7e]/.test(tour.number)) {
        const ander = (tekst: string): string => tekst.replace(/[^\x00-\x7e]/g, 'Ø')
        const k = koppel({ ...basis, tripName: ander(entry.tripFile), tourName: ander(tour.number), lineName: ander(tour.lineFile) }, datum)
        variant('ander teken', k.soort === 'index' && gelijk(gekregen(k.duty), verwachtB), () => k.soort)
      }

      /*
       * Een actieve chrono (tegenlezing merge 2e7794f). OMSI zet de lijnen van
       * een chrono vooraan in zijn lijst (1380dc3): `line` schuift op, en
       * `lines` (plugin 14) is langer dan het aantal .ttl. Zonder bruikbare
       * namen koppelde de plek dan op nummer aan een andere lijn (HafenCity
       * tijdens de Dom: 179 van de 436 keuzes). Met `lines` mag dat nooit, en
       * met `lines` gelijk aan het aantal .ttl telt de plek zoals zonder.
       */
      {
        const naamloos: OmsiKeuze = { ...basis, lineName: '', tourName: '', tripName: '' }
        const k = koppel({ ...naamloos, line: line + 1, lines: ttlNamen.length + 1 }, datum)
        const g = gekregen(k.duty)
        /*
         * Een losse rit weet alleen de rit en de klok: 109_RAM_UAL om 0:05 kan
         * ook die van 24:05 in een omloop van de dag ervoor zijn (Hamburg109_2).
         * Dezelfde rit op dezelfde kloktijd is dus goed.
         */
        const zelfdeRit = (a: string, b: string | undefined): boolean => {
          const [ritA, vertrekA] = a.split('@')
          const [ritB, vertrekB] = (b ?? '').split('@')
          const verschil = (((Number(vertrekA) - Number(vertrekB)) % 1440) + 1440) % 1440
          return ritA === ritB && (verschil < 0.01 || verschil > 1439.99)
        }
        const goed =
          (g.length === 0 || zelfdeRit(g[0], verwachtB[0])) &&
          (k.soort === 'rit' || k.soort === 'niets' || gelijk(g, verwachtB))
        variant('chrono vooraan', goed, () => `${k.soort} ${k.lineFile ?? '-'}: ${g.slice(0, 2).join(' ')} i.p.v. ${verwachtB.slice(0, 2).join(' ')}`)

        const zonder = koppel(naamloos, datum)
        const met = koppel({ ...naamloos, lines: ttlNamen.length }, datum)
        variant(
          'lengte past',
          met.soort === zonder.soort && met.lineFile === zonder.lineFile && gelijk(gekregen(met.duty), gekregen(zonder.duty)),
          () => `met lines ${met.soort} ${met.lineFile ?? '-'}, zonder ${zonder.soort} ${zonder.lineFile ?? '-'}`
        )
      }

      /* OMSI sorteert: tourEntry telt op vertrektijd. */
      if (ongesorteerd) {
        const pos = gesorteerd.indexOf(entry)
        const opTijd = { ...basis, tourEntry: pos }
        const verwachtV = verwacht(map, gesorteerd.slice(pos))
        let k = koppel(opTijd, datum)
        // Voor de wissel mag het nog 'bestand' zijn als beide kloppen; na de wissel niet meer fout.
        const volgendeV = gesorteerd[pos + 1]
        if (volgendeV && map.trips.has(volgendeV.tripFile.toLowerCase())) {
          const na = { ...opTijd, tourEntry: pos + 1, tripName: volgendeV.tripFile, klok: volgendeV.departure % 1440 }
          const s = schema(na, k.duty)
          let leg = s?.matchesDuty && s.legIndex !== undefined ? k.duty?.legs[s.legIndex] : undefined
          const takOk = Boolean(
            k.duty?.omsi &&
              leg &&
              leg.tourEntry === pos + 1 &&
              vouw(leg.tripFile) === vouw(volgendeV.tripFile)
          )
          if (!takOk) {
            /* Wat het volgen dan doet: opnieuw koppelen met de andere volgorde voorop. */
            k = koppel(na, datum, k.volgorde === 'bestand' ? 'vertrek' : 'bestand')
            leg = k.duty?.legs[0]
          }
          const verwachtNa = verwacht(map, gesorteerd.slice(pos + 1))
          const goed =
            Boolean(leg) &&
            `${leg!.tripFile.toLowerCase()}@${leg!.departure}` === verwachtNa[0] &&
            (takOk || (k.soort === 'vertrek' && gelijk(gekregen(k.duty), verwachtNa)) || (k.soort === 'index' && gelijk(gekregen(k.duty), verwachtNa)))
          variant('OMSI sorteert', goed, () => `${k.soort}, rit ${leg?.tripFile}@${leg?.departure} i.p.v. ${verwachtNa[0]}`)
        } else if (verwachtV.length > 0) {
          const goed = (k.soort === 'vertrek' || k.soort === 'index') && gekregen(k.duty)[0] === verwachtV[0]
          variant('OMSI sorteert (laatste)', goed || k.soort === 'naam', () => `${k.soort}`)
        }
      }

      /* OMSI telt alleen de omlopen die vandaag rijden. */
      if (datum) {
        const vanLijn = map.tours.filter((item) => item.lineFile === tour.lineFile)
        const vandaag = vanLijn.filter((item) => runsOn(item.days, datum, kalender))
        const gefilterd = vandaag.indexOf(tour)
        if (gefilterd >= 0 && gefilterd !== tour.index) {
          const k = koppel({ ...basis, tour: gefilterd }, datum)
          const goed = gelijk(gekregen(k.duty), verwachtB) || (k.soort === 'rit' && gekregen(k.duty)[0] === verwachtB[0])
          variant('gefilterd op dag', goed && k.soort !== 'niets', () => `${k.soort}: ${gekregen(k.duty).slice(0, 2).join(' ')} i.p.v. ${verwachtB.slice(0, 2).join(' ')}`)
        }
      }

      /* Een andere lijn met hetzelfde omloopnummer: readSchedule mag hem niet aanwijzen. */
      if (plek === 0) {
        const k = koppel(basis, datum)
        const andere = map.tours.find((item) => item.lineFile !== tour.lineFile && item.index === tour.index && item.trips.length > 0)
        if (andere && k.duty) {
          const e = andere.trips[0]
          const s = schema(
            {
              ...basis,
              lineName: andere.lineFile,
              line: ttlNamen.findIndex((naam) => naam === andere.lineFile),
              tourName: andere.number,
              tripName: e.tripFile,
              tourEntry: e.entry
            },
            k.duty
          )
          const zelfdeRit = k.duty.legs.some((leg) => vouw(leg.tripFile) === vouw(e.tripFile))
          variant('andere lijn', !s?.matchesDuty || zelfdeRit, () => `match op rit ${s?.legIndex}`)
        }
      }
    })
  }
  console.log(
    `${folder.padEnd(26)} basis ${kaart.basis}, index ${kaart.index} (${((kaart.index / Math.max(1, kaart.basis)) * 100).toFixed(1)}%), varianten ${kaart.varianten}, fout ${kaart.fout}`
  )
}

/* ---- het monster en de reproducties ---- */
function geval(folder: string, lijn: string, omloop: string, rit: string, rond: number): { goed: boolean; tekst: string } {
  if (only.length > 0 && !only.includes(folder)) return { goed: true, tekst: `${folder}: overgeslagen` }
  const map = loadMap(join(omsi!, 'maps'), folder)
  if (!map) return { goed: true, tekst: `${folder}: niet geïnstalleerd, overgeslagen` }
  const tour = map.tours.find((item) => item.lineFile === lijn && item.number === omloop)
  const entry = tour?.trips
    .filter((item) => item.tripFile === rit)
    .sort((a, b) => Math.abs(a.departure - rond) - Math.abs(b.departure - rond))[0]
  if (!tour || !entry) return { goed: false, tekst: `${folder}: ${lijn}/${omloop}/${rit} niet gevonden` }
  const ttlNamen = namenIn(map, '.ttl')
  const ttpNamen = namenIn(map, '.ttp')
  const kalender = readCalendar(map.path)
  const k = koppelOmsiKeuze(
    map,
    {
      lineName: lijn,
      tourName: omloop,
      tripName: rit,
      line: ttlNamen.indexOf(lijn),
      tour: tour.index,
      tourEntry: entry.entry,
      trip: ttpNamen.findIndex((naam) => naam.toLowerCase() === rit.toLowerCase()),
      klok: rond % 1440
    },
    { kalender, ttlNamen, ttpNamen, datum: dateForMask(kalender, 2000, 100, tour.days)?.date }
  )
  const eerste = k.duty?.legs[0]
  const goed = k.soort === 'index' && eerste?.tripFile.toLowerCase() === rit.toLowerCase() && eerste.departure === entry.departure
  const hhmm = (m: number): string => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return {
    goed,
    tekst: `${folder} ${lijn}/"${omloop}" #${entry.entry}: ${k.soort}, eerste rit ${eerste?.tripFile} ${eerste ? hhmm(eerste.departure) : '-'}${eerste?.leer ? ' (leegrit)' : ''}`
  }
}

const gevallen = [
  // Het monster van 21-09: line 0 "Freitag", tour 12 "13 - Solo", tourEntry 37, 853_ERN-HOB4.
  geval('Hohenkirchen - Herrenhof', 'Freitag', '13 - Solo', '853_ERN-HOB4', 19 * 60 + 44),
  geval('Hohenkirchen - Herrenhof', 'Freitag', '01 - Solo', 'B_HBT-ERN', 8 * 60),
  geval('Ahlheim 5', 'Eichenhoehe TA11 Mo-Do Schule', '111001', 'B_E-HBF', 227 + 45),
  geval('Ahlheim 5', 'Eichenhoehe TA11 Mo-Do Schule', '111010', 'B_BOW-KUR', 809 + 8)
]
for (const item of gevallen) console.log(`${item.goed ? 'goed' : 'FOUT'}  ${item.tekst}`)

/* Het monster: lijn 0 is Freitag, omloop 12 is "13 - Solo", rit 37 is 853_ERN-HOB4. */
if (!only.length || only.includes('Hohenkirchen - Herrenhof')) {
  const map = loadMap(join(omsi, 'maps'), 'Hohenkirchen - Herrenhof')
  if (map) {
    const ttlNamen = namenIn(map, '.ttl')
    const ttpNamen = namenIn(map, '.ttp')
    const kalender = readCalendar(map.path)
    const k = koppelOmsiKeuze(
      map,
      { lineName: 'Freitag', tourName: '13 - Solo', tripName: '853_ERN-HOB4', line: 0, tour: 12, tourEntry: 37, trip: 35, klok: 71341 / 60 },
      { kalender, ttlNamen, ttpNamen }
    )
    const leg = k.duty?.legs[0]
    const goed = ttlNamen[0] === 'Freitag' && k.soort === 'index' && leg?.tripFile.toLowerCase() === '853_ern-hob4' && leg.departure === 19 * 60 + 44
    gevallen.push({ goed, tekst: `monster 21-09 (nummers letterlijk): ${k.soort}, ${leg?.tripFile} ${leg?.departure}` })
    console.log(`${goed ? 'goed' : 'FOUT'}  monster 21-09 (nummers letterlijk): ${k.soort}, ${leg?.tripFile} om ${leg ? `${Math.floor(leg.departure / 60)}:${String(leg.departure % 60).padStart(2, '0')}` : '-'}`)
  }
}

/*
 * Een exacte omloopnaam gaat voor een die alleen met de verminking van één
 * teken klopt (nakijken 28-09). OMSI noemt "12"; op dezelfde lijn staan "1"
 * (rijdt elke dag) en "12" (alleen maandag tot vrijdag), allebei met dezelfde
 * rit, en het is zaterdag. `naamGelijk("12", "1")` is waar -- "1" met rommel
 * erachter -- en eerst ging "rijdt vandaag" voor "precies": dan koppelde de
 * app aan omloop 1, een "falsche Linien Route". Nagebouwd met twee omlopen
 * op een eigen lijnbestand, zodat de omlopen van de kaart niet meetellen.
 */
{
  const folder = listMaps(omsi).find((naam) => only.length === 0 || only.includes(naam))
  const map = folder ? loadMap(join(omsi, 'maps'), folder) : undefined
  const bron = map?.tours.find((tour) => tour.trips.filter((entry) => map.trips.has(entry.tripFile.toLowerCase())).length >= 2)
  if (!map || !bron) {
    gevallen.push({ goed: false, tekst: 'exacte naam: geen kaart met een omloop van twee ritten' })
  } else {
    const ritten = bron.trips
      .filter((entry) => map.trips.has(entry.tripFile.toLowerCase()))
      .slice(0, 3)
      .map((entry, plek) => ({ ...entry, entry: plek }))
    const LIJN = 'zz proef exacte naam'
    const omloop = (index: number, number: string, days: number): Tour => ({
      lineFile: LIJN,
      userAllowed: true,
      index,
      number,
      depot: '',
      days,
      trips: ritten.map((entry) => ({ ...entry }))
    })
    const nagebouwd: OmsiMap = {
      ...map,
      tours: [...map.tours, omloop(0, '1', 0b1111111), omloop(1, '12', 0b0011111)]
    }
    const opties = {
      kalender: readCalendar(map.path),
      ttlNamen: [...namenIn(map, '.ttl'), LIJN],
      ttpNamen: namenIn(map, '.ttp'),
      datum: new Date(Date.UTC(2021, 0, 2)) // een zaterdag
    }
    const keuze = (tourName: string, tour: number): OmsiKeuze => ({
      lineName: LIJN,
      tourName,
      tripName: ritten[0].tripFile,
      line: opties.ttlNamen.length - 1,
      tour,
      tourEntry: 0,
      trip: opties.ttpNamen.findIndex((naam) => naam.toLowerCase() === ritten[0].tripFile.toLowerCase()),
      klok: ritten[0].departure % 1440
    })
    const proef = (naam: string, k: Koppeling, soort: string, nummer: string): void => {
      const goed = k.soort === soort && k.tourNumber === nummer
      gevallen.push({ goed, tekst: `exacte naam, ${naam}: ${k.soort}, omloop "${k.tourNumber ?? ''}" (verwacht ${soort}, "${nummer}")` })
    }
    // Op nummer gekoppeld aan "12", maar "12" rijdt vandaag niet: niet uitwijken naar "1".
    proef('"12" op nummer', koppelOmsiKeuze(nagebouwd, keuze('12', 1), opties), 'index', '12')
    // Het nummer wijst niets aan: op naam, en dan "12", niet "1".
    proef('"12" op naam', koppelOmsiKeuze(nagebouwd, keuze('12', 999_999), opties), 'naam', '12')
    // De gewone gevallen blijven: "1" is "1", en een verminkte "1" ook.
    proef('"1" op naam', koppelOmsiKeuze(nagebouwd, keuze('1', 999_999), opties), 'naam', '1')
    proef('verminkte "1" op naam', koppelOmsiKeuze(nagebouwd, keuze('1Ãx', 999_999), opties), 'naam', '1')
    for (const item of gevallen.slice(-4)) console.log(`${item.goed ? 'goed' : 'FOUT'}  ${item.tekst}`)
  }
}

/*
 * Een keuze van een andere kaart (tegenlezing 28-09). De app staat op kaart A,
 * OMSI speelt B. Een rit die OMSI bij naam noemt, mag op A nooit een ANDERE
 * rit opleveren: eerst wees het ritnummer dan in de ritlijst van A een
 * willekeurige rit aan (590 van de 728 keuzes), en tekende de navigatie die
 * route. Per kaart B en per lijn de eerste omloop, zijn tweede rit.
 */
if (geladen.length > 1) {
  let paren = 0
  let niets = 0
  let anders = 0
  const voorbeelden: string[] = []
  for (const B of geladen) {
    const perLijn = new Map<string, Tour>()
    for (const tour of B.map.tours) if (!perLijn.has(tour.lineFile) && tour.trips.length > 1) perLijn.set(tour.lineFile, tour)
    for (const tour of [...perLijn.values()].slice(0, 6)) {
      const entry = tour.trips[1]
      const keuze: OmsiKeuze = {
        lineName: tour.lineFile,
        tourName: tour.number,
        tripName: entry.tripFile,
        line: B.ttlNamen.findIndex((naam) => vouw(naam) === vouw(tour.lineFile)),
        tour: tour.index,
        tourEntry: entry.entry,
        trip: B.ttpNamen.findIndex((naam) => vouw(naam) === vouw(entry.tripFile)),
        klok: entry.departure % 1440
      }
      for (const A of geladen) {
        if (A === B) continue
        const k = koppelOmsiKeuze(A.map, keuze, { kalender: A.kalender, ttlNamen: A.ttlNamen, ttpNamen: A.ttpNamen })
        paren++
        if (k.soort === 'niets') niets++
        const eerste = k.duty?.legs[0]?.tripFile
        if (eerste !== undefined && vouw(eerste) !== vouw(keuze.tripName)) {
          anders++
          if (voorbeelden.length < 5) voorbeelden.push(`OMSI ${B.folder} ${keuze.tripName} -> app ${A.folder}: ${k.soort} ${eerste}`)
        }
      }
    }
  }
  gevallen.push({
    goed: anders === 0,
    tekst: `keuze van een andere kaart: ${paren} keer, ${niets} niets, ${anders} met een andere rit${voorbeelden.length ? ` (${voorbeelden.join('; ')})` : ''}`
  })
  console.log(`${anders === 0 ? 'goed' : 'FOUT'}  ${gevallen[gevallen.length - 1].tekst}`)
}

for (const regel of fouten) console.log(`  ${regel}`)
const aandeel = totaal.basisIndex / Math.max(1, totaal.basis)
console.log(
  `totaal: basis ${totaal.basis}, index ${totaal.basisIndex} (${(aandeel * 100).toFixed(2)}%), ` +
    `verkeerde ritten basis ${totaal.basisFout}, readSchedule ${totaal.schemaFout}, ` +
    `varianten ${totaal.varianten} met ${totaal.variantFout} fout, lijnbotsingen ${totaal.botsingen}`
)
const goed =
  aandeel === 1 &&
  totaal.basisFout === 0 &&
  totaal.schemaFout === 0 &&
  totaal.variantFout === 0 &&
  totaal.botsingen === 0 &&
  gevallen.every((item) => item.goed)
console.log(goed ? 'koppelen: goed' : 'KOPPELEN KLOPT NIET')
process.exit(goed ? 0 : 1)
