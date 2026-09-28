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
  NIVEAUS,
  OPLEIDINGEN,
  bedrijfsfactoren,
  inschrijfkosten,
  niveauVan,
  opleidingKlaar,
  stuurOpBijscholing,
  volgOpleiding,
  zelfOnderhoud,
  zelfRepareren,
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
const pzp = dagprognose(pz)
klopt('zelf invallen zonder rittenstaat telt als gereden: 2 uur bovenop 16', pz.zelfUren === 2 && pzp.zelfUren === 2 && pzp.chauffeurUren === 18 && pzp.openDiensten === 3)
klopt('invallen maakt de dag nooit duurder', pzp.kosten < met2.kosten)
// Uit de review: met genoeg chauffeurs mag een half uur invallen niemand thuis zetten.
const vol: Bedrijf = { ...p, concessies: [{ ...p.concessies[0], urenPerDag: 16 }] }
const volZelf = boekEigenDienst(vol, { mapFolder: 'Rheinhausen', legs: [{ lineFile: 'Linie_35', lineNumber: '35', minutes: 30 }] } as unknown as Duty, undefined)
klopt('16 u, 2 chauffeurs, 0,5 u zelf: beide chauffeurs rijden, kosten gelijk', dagprognose(volZelf).eigenDiensten === 2 && dagprognose(volZelf).kosten === dagprognose(vol).kosten)
// Uit de review: invallen telt naar gehaalde haltes, zoals het loon.
const metHaltes = { ...inval, totalStops: 20 } as unknown as Duty
klopt('meteen afronden (0 haltes) dekt niets', boekEigenDienst(p, metHaltes, undefined, undefined, 0).zelfUren === (p.zelfUren ?? 0))
klopt('de helft van de haltes dekt de helft van de uren', boekEigenDienst(p, metHaltes, undefined, undefined, 10).zelfUren === 1)
// Uit de review: 8,8 + 11,9 + 3,3 is 24 uur, geen 24,000000000000004 met een spookdienst.
const drie: Bedrijf = {
  ...p,
  concessies: [8.8, 11.9, 3.3].map((u, i) => ({ ...p.concessies[0], lineFile: `L${i}`, urenPerDag: u }))
}
klopt('drie concessies van samen 24 u zijn drie diensten', dagprognose(drie).diensten === 3)

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

// ---- niveaus en opleidingen ----
console.log('')
let o4 = richtBedrijfOp('Opleiding')
const o4in = schrijfIn(o4, kaart, lijn)
if ('bedrijf' in o4in) o4 = o4in.bedrijf
klopt('een nieuw bedrijf is niveau 1 zonder voordelen', niveauVan(o4) === 1 && bedrijfsfactoren(o4).vergoeding === 1 && bedrijfsfactoren(o4).sollicitanten === 3)
klopt('schadeherstel vraagt niveau 2', 'fout' in volgOpleiding(o4, 'schadeherstel') && (volgOpleiding(o4, 'schadeherstel') as { fout: string }).fout === 'niveau')
const wp = volgOpleiding(o4, 'werkplaats')
klopt('werkplaatsopleiding: betaald', 'bedrijf' in wp && wp.bedrijf.kas === o4.kas - OPLEIDINGEN.werkplaats.kosten)
if ('bedrijf' in wp) o4 = wp.bedrijf
klopt('dezelfde opleiding twee keer kan niet', 'fout' in volgOpleiding(o4, 'werkplaats'))
klopt('nog niet klaar: zelf onderhoud kan nog niet', !opleidingKlaar(o4, 'werkplaats'))
const xpVoor = o4.xp ?? 0
for (let i = 0; i < OPLEIDINGEN.werkplaats.dagen; i++) o4 = sluitDagAf(o4)
klopt('na drie dagen klaar, gemeld, en 100 punten erbij', opleidingKlaar(o4, 'werkplaats') && o4.opleidingen![0].gemeld === true && (o4.xp ?? 0) - xpVoor >= 100)
klopt('elke dag geeft punten voor de gereden uren', (o4.xp ?? 0) - xpVoor >= 100 + 3 * 20)

const kb = koopNieuw({ ...o4, kas: 1_000_000_00 }, markt[0])
if ('bedrijf' in kb) o4 = kb.bedrijf
o4 = { ...o4, bussen: o4.bussen!.map((b) => ({ ...b, staat: 40, schade: 30 })) }
const duur = onderhoudskosten(o4.bussen![0], 0, o4)
const zo = zelfOnderhoud(o4, o4.bussen![0].nummer, 1)
klopt('zelf onderhoud met score 1: staat 100 voor 30 % van de prijs', 'bedrijf' in zo && zo.bedrijf.bussen![0].staat === 100 && o4.kas - zo.bedrijf.kas === Math.round(duur * 0.3))
const zh = zelfOnderhoud(o4, o4.bussen![0].nummer, 0)
klopt('zelf onderhoud met score 0 helpt nog wat (40 %)', 'bedrijf' in zh && zh.bedrijf.bussen![0].staat === 64)
klopt('een score buiten 0-1 wordt begrensd', 'bedrijf' in zelfOnderhoud(o4, o4.bussen![0].nummer, 7) && (zelfOnderhoud(o4, o4.bussen![0].nummer, 7) as { bedrijf: Bedrijf }).bedrijf.bussen![0].staat === 100)
klopt('zelf repareren zonder opleiding kan niet', 'fout' in zelfRepareren(o4, o4.bussen![0].nummer, 1))

// Niveau 2 en verder: extra sollicitant, en een opleiding die dan open gaat.
const n2: Bedrijf = { ...o4, xp: NIVEAUS[1].xp }
klopt('niveau 2: een sollicitant extra', niveauVan(n2) === 2 && sollicitanten(n2).length === 4)
klopt('niveau 3: twee tweedehands extra', tweedehandsAanbod({ ...n2, xp: NIVEAUS[2].xp }, markt).length === REGELS.tweedehandsPerDag + 2)
klopt('niveau 4: inschrijven 10 % goedkoper', inschrijfkosten(lijn, { ...n2, xp: NIVEAUS[3].xp }) === Math.round(inschrijfkosten(lijn) * 0.9))
const n5: Bedrijf = { ...n2, xp: NIVEAUS[4].xp }
klopt('niveau 5: 3 % meer vergoeding, en dag afsluiten boekt nog steeds de prognose', (() => {
  const v = dagprognose(n5)
  const na = sluitDagAf(n5)
  return v.vergoeding === Math.round(dagprognose(n2).vergoeding * 1.03) && na.kas - n5.kas === v.vergoeding - v.kosten
})())

// Bijscholing: een dag weg, ervaring erbij.
let b4 = richtBedrijfOp('Bijscholing')
const b4in = schrijfIn(b4, kaart, lijn)
if ('bedrijf' in b4in) b4 = b4in.bedrijf
const eerste4 = sollicitanten(b4)[0]
const na4 = neemAan(b4, eerste4.nr)
if ('bedrijf' in na4) b4 = na4.bedrijf
const id4 = b4.personeel![0].id
const bs = stuurOpBijscholing(b4, id4)
klopt('bijscholing: ervaring erbij en vandaag niet aan het werk', 'bedrijf' in bs && bs.bedrijf.personeel![0].ervaring === Math.min(100, eerste4.ervaring + 12) && aanHetWerk(bs.bedrijf, eerste4.rol).length === 0)
if ('bedrijf' in bs) b4 = sluitDagAf(bs.bedrijf)
klopt('de dag erna weer aan het werk', aanHetWerk(b4, eerste4.rol).length === 1)

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
