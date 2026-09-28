/**
 * De regels van het busbedrijf, nagerekend.
 *
 *   npx tsx scripts/probe-bedrijf.ts
 *
 * Oprichten, inschrijven, een dag afsluiten, een eigen dienst met rittenstaat,
 * verlengen bij een goede reputatie en vervallen bij een slechte. Leest en
 * schrijft niets.
 */
import {
  REGELS,
  boekEigenDienst,
  dagprognose,
  isInzetbaar,
  koopNieuw,
  koopTweedehands,
  naarWerkplaats,
  tweedehandsAanbod,
  verkoop,
  vormVanNaam,
  waardeVan,
  type MarktBus,
  dagresultaat,
  richtBedrijfOp,
  schrijfIn,
  sluitDagAf,
  type Bedrijf
} from '../src/core/bedrijf'
import type { LineSummary } from '../src/core/duty'
import type { Rittenstaat } from '../src/core/rittenstaat'
import type { Duty } from '../src/core/types'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

const lijn: LineSummary = {
  lineFile: 'Linie_35',
  lineNumbers: ['35'],
  tours: 6,
  trips: 96,
  first: 300,
  last: 1400,
  averageMinutes: 25
}
const kaart = { folder: 'Rheinhausen', name: 'Rheinhausen' }

let b: Bedrijf = richtBedrijfOp('Proefbus')
klopt('startkapitaal in de kas', b.kas === REGELS.startkapitaal && b.boekingen.length === 1)

const uit = schrijfIn(b, kaart, lijn)
klopt('inschrijven lukt', 'bedrijf' in uit)
if ('bedrijf' in uit) b = uit.bedrijf
const kosten = REGELS.inschrijvingVast + 6 * REGELS.inschrijvingPerOmloop
klopt(`inschrijfgeld ${kosten / 100} eraf`, b.kas === REGELS.startkapitaal - kosten)
klopt('96 ritten × 25 min = 40 uur per dag', b.concessies[0].urenPerDag === 40)
klopt('tweede keer op dezelfde lijn kan niet', 'fout' in schrijfIn(b, kaart, lijn))
klopt('te weinig kas kan niet', 'fout' in schrijfIn({ ...b, kas: 0 }, kaart, { ...lijn, lineFile: 'X' }))

const voor = b.kas
b = sluitDagAf(b)
const r = dagresultaat({ urenPerDag: 40 }, 50)
klopt(`dag afsluiten: +${(r.vergoeding - r.kosten) / 100} bij reputatie 50`, b.kas - voor === r.vergoeding - r.kosten && b.dag === 2)
klopt('vergoeding hoger dan inhuur, anders loont niets', r.vergoeding > r.kosten)

// Een eigen dienst op lijn 35: vier tijdhaltes, drie goed, één te vroeg.
const duty = { mapFolder: 'Rheinhausen', legs: [{ lineFile: 'Linie_35', lineNumber: '35' }] } as unknown as Duty
const staat = {
  ritten: [{ haltes: [{ oordeel: 'goed' }, { oordeel: 'goed' }, { oordeel: 'goed' }, { oordeel: 'vroeg' }] }]
} as unknown as Rittenstaat
const vorige = b
b = boekEigenDienst(b, duty, staat)
klopt(
  'eigen dienst: 3 × bonus − 1 × malus te vroeg, gemeten',
  b.kas - vorige.kas === 3 * REGELS.bonusOpTijd - REGELS.malusTeVroeg && b.boekingen[0].gemeten
)
klopt('75 % op tijd: reputatie +1', b.reputatie === vorige.reputatie + 1)
klopt('zonder rittenstaat boekt een dienst niets', boekEigenDienst(b, duty, undefined) === b)
const anders = { mapFolder: 'Spandau', legs: [{ lineFile: 'Linie_35', lineNumber: '35' }] } as unknown as Duty
klopt('een dienst buiten je concessies boekt niets', boekEigenDienst(b, anders, staat) === b)

// Tot het eind van de looptijd, met een goede en met een slechte reputatie.
let goed = b
let slecht = { ...b, reputatie: 20 }
for (let i = 0; i < REGELS.looptijdDagen; i++) {
  goed = sluitDagAf(goed)
  slecht = sluitDagAf(slecht)
}
klopt('goede reputatie: verlengd', goed.concessies.length === 1 && goed.boekingen.some((x) => x.soort === 'verlenging'))
klopt('slechte reputatie: vervallen', slecht.concessies.length === 0 && slecht.boekingen.some((x) => x.soort === 'vervallen'))
klopt('boekingen blijven begrensd', goed.boekingen.length <= REGELS.boekingenBewaard)
klopt('bedragen blijven hele centen', goed.boekingen.every((x) => Number.isInteger(x.bedrag)) && Number.isInteger(goed.kas))

// ---- het wagenpark ----
console.log('')
const markt: MarktBus[] = [
  { relativePath: 'Vehicles\\MAN_NL\\NL202.bus', naam: 'MAN NL202', vorm: 'solo' },
  { relativePath: 'Vehicles\\MAN_NG\\NG272.bus', naam: 'MAN NG272', vorm: 'geleed' }
]
klopt('vorm uit de naam: Gelenkbus is geleed, O530K is midi', vormVanNaam('MAN Gelenkbus NG272') === 'geleed' && vormVanNaam('Citaro O530K') === 'midi')
let w = richtBedrijfOp('Wagenpark')
const ins = schrijfIn(w, kaart, lijn)
if ('bedrijf' in ins) w = ins.bedrijf
const zonder = dagprognose(w)
const k1 = koopNieuw(w, markt[0])
klopt('nieuwe solo kopen', 'bedrijf' in k1)
if ('bedrijf' in k1) w = k1.bedrijf
klopt('nieuwe bus: wagennummer 101, staat 100, prijs eraf', w.bussen![0].nummer === 101 && w.bussen![0].staat === 100 && w.kas === REGELS.startkapitaal - kosten - REGELS.nieuwprijs.solo)
const met = dagprognose(w)
klopt('één bus op zes omlopen: dekking 1/6, en goedkoper dan zonder', Math.abs(met.dekking - 1 / 6) < 1e-9 && met.kosten < zonder.kosten)

const markt1 = tweedehandsAanbod(w, markt)
klopt('tweedehandsmarkt: vier aanbiedingen, dezelfde bij opnieuw vragen', markt1.length === REGELS.tweedehandsPerDag && JSON.stringify(markt1) === JSON.stringify(tweedehandsAanbod(w, markt)))
const k2 = koopTweedehands(w, markt1[0])
if ('bedrijf' in k2) w = k2.bedrijf
klopt('tweedehands gekocht, en daarna weg van de markt', w.bussen!.length === 2 && tweedehandsAanbod(w, markt).length === REGELS.tweedehandsPerDag - 1)
klopt('dezelfde aanbieding twee keer kopen kan niet', 'fout' in koopTweedehands(w, markt1[0]))

const staatVoor = w.bussen![0].staat
w = sluitDagAf(w)
klopt('na een dag: km erbij en staat eraf', w.bussen![0].km > 0 && w.bussen![0].staat < staatVoor)
klopt('de markt is de volgende dag weer vol', tweedehandsAanbod(w, markt).length === REGELS.tweedehandsPerDag)
klopt('historie: één dag vastgelegd met kas en dekking', w.historie!.length === 1 && w.historie![0].kas === w.kas && w.historie![0].dekking > 0)

const o = naarWerkplaats(w, 101, 'onderhoud')
if ('bedrijf' in o) w = o.bedrijf
klopt('onderhoud: staat 100, vandaag niet inzetbaar', w.bussen![0].staat === 100 && !isInzetbaar(w.bussen![0], w.dag))
w = sluitDagAf(w)
klopt('de dag erna weer inzetbaar', isInzetbaar(w.bussen![0], w.dag))

// Schade uit een eigen dienst met bus 101.
const klapStaat = {
  ritten: [{ haltes: [{ oordeel: 'goed', klappen: 2 }, { oordeel: 'goed' }] }]
} as unknown as Rittenstaat
w = boekEigenDienst(w, duty, klapStaat, 'vehicles\\man_nl\\nl202.bus')
klopt('twee aanrijdingen: schade op de eigen bus', w.bussen![0].schade === 2 * REGELS.schadePerKlap)
const waardeMetSchade = waardeVan(w.bussen![0])
const r2 = naarWerkplaats(w, 101, 'reparatie')
if ('bedrijf' in r2) w = r2.bedrijf
klopt('reparatie haalt de schade weg en de waarde stijgt', w.bussen![0].schade === 0 && waardeVan(w.bussen![0]) > waardeMetSchade)
const kasVoorVerkoop = w.kas
const waarde = waardeVan(w.bussen![0])
w = verkoop(w, 101)
klopt('verkopen levert 85 % van de waarde', w.kas - kasVoorVerkoop === Math.round(waarde * REGELS.verkoopFactor) && w.bussen!.length === 1)
klopt('alles blijft hele centen', Number.isInteger(w.kas) && w.boekingen.every((x) => Number.isInteger(x.bedrag)))

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
