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
  aanHetWerk,
  geefOpslag,
  marktloon,
  neemAan,
  onderhoudskosten,
  ontsla,
  sollicitanten,
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

// ---- personeel ----
console.log('')
let p = richtBedrijfOp('Personeel')
const pin = schrijfIn(p, kaart, lijn)
if ('bedrijf' in pin) p = pin.bedrijf
const leeg = dagprognose(p)
klopt('40 uur is vijf diensten van acht uur, allemaal open', leeg.diensten === 5 && leeg.openDiensten === 5 && leeg.lonen === 0)
const s1 = sollicitanten(p)
klopt('drie sollicitanten, dezelfde bij opnieuw vragen', s1.length === 3 && JSON.stringify(s1) === JSON.stringify(sollicitanten(p)))
// Neem net zo lang aan tot er twee chauffeurs zijn (over een paar dagen als het moet).
let pogingen = 0
while (aanHetWerk(p, 'chauffeur').length < 2 && pogingen++ < 20) {
  const c = sollicitanten(p).find((x) => x.rol === 'chauffeur')
  if (c) {
    const u = neemAan(p, c.nr)
    if ('bedrijf' in u) p = u.bedrijf
  } else p = sluitDagAf(p)
}
klopt('twee chauffeurs aangenomen', aanHetWerk(p, 'chauffeur').length === 2)
klopt('een aangenomen sollicitant is weg van de lijst', sollicitanten(p).length < 3 || p.sollicitantWeg!.length === 0)
const met2 = dagprognose(p)
klopt('twee chauffeurs rijden twee diensten, drie blijven open', met2.eigenDiensten === 2 && met2.openDiensten === 3)
klopt('eigen chauffeur bespaart 8 u inhuur per dienst', met2.personeelBesparing === 16 * REGELS.inhuurChauffeurPerUur)
klopt('lonen tellen mee in de kosten', met2.kosten === Math.round(40 * REGELS.inhuurPerUur) - met2.personeelBesparing + met2.lonen)
klopt('een chauffeur tegen marktloon verdient zich terug', REGELS.urenPerDienst * REGELS.inhuurChauffeurPerUur > marktloon('chauffeur', 50))

// Invallen: een eigen dienst van 2 × 60 min op lijn 35 dekt een open dienst.
const inval = { mapFolder: 'Rheinhausen', legs: [{ lineFile: 'Linie_35', lineNumber: '35', minutes: 60 }, { lineFile: 'Linie_35', lineNumber: '35', minutes: 60 }] } as unknown as Duty
const pz = boekEigenDienst(p, inval, undefined)
klopt('zelf invallen zonder rittenstaat telt als gereden: 2 uur', pz.zelfUren === 2 && dagprognose(pz).zelfDiensten === 1 && dagprognose(pz).openDiensten === 2)

const ervaringVoor = aanHetWerk(p, 'chauffeur')[0].ervaring
const kasVoorDag = p.kas
const verwacht = dagprognose(p)
p = sluitDagAf(p)
klopt('dag afsluiten boekt precies de prognose', p.kas - kasVoorDag === verwacht.vergoeding - verwacht.kosten)
klopt('wie werkte kreeg ervaring', (p.personeel!.find((m) => m.rol === 'chauffeur')?.ervaring ?? 0) >= ervaringVoor)
klopt('invaluren staan de volgende dag weer op nul', p.zelfUren === 0)

const eerste = p.personeel![0]
const hoger = geefOpslag(p, eerste.id).personeel![0]
klopt('opslag: 10 % meer loon en blijer', hoger.loon === Math.round((eerste.loon * 1.1) / 100) * 100 && hoger.tevredenheid > eerste.tevredenheid)
const voorOntslag = p.kas
const na = ontsla(p, eerste.id)
klopt('ontslag kost vijf dagen loon en de collega is minder blij', voorOntslag - na.kas === eerste.loon * 5 && na.personeel!.length === p.personeel!.length - 1)

// Monteurs: goedkoper onderhoud.
const bus = { nummer: 1, relativePath: '', naam: '', vorm: 'solo', aankoop: 0, gekochtOp: 1, km: 0, staat: 40, schade: 0 } as const
klopt('twee monteurs: 30 % goedkoper onderhoud, met een plafond', onderhoudskosten(bus, 2) === Math.round(onderhoudskosten(bus) * 0.7) && onderhoudskosten(bus, 10) === Math.round(onderhoudskosten(bus) * 0.55))

// Honderd dagen: het personeel blijft binnen de grenzen, en dezelfde dagen geven dezelfde uitkomst.
let lang = p
let tweede = p
for (let i = 0; i < 100; i++) {
  lang = sluitDagAf(lang)
  tweede = sluitDagAf(tweede)
}
klopt('100 dagen: tevredenheid en ervaring tussen 0 en 100', lang.personeel!.every((m) => m.tevredenheid >= 0 && m.tevredenheid <= 100 && m.ervaring <= 100))
klopt('100 dagen: twee keer dezelfde uitkomst (geen echt toeval)', JSON.stringify(lang) === JSON.stringify(tweede))
klopt('100 dagen: hele centen', Number.isInteger(lang.kas))

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
