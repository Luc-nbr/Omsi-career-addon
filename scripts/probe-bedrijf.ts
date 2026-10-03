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
  ritVoorBedrijf,
  leesPost,
  ongelezen,
  richtBedrijfOp,
  schrijfIn,
  sluitDagAf,
  type Bedrijf
} from '../src/core/bedrijf'
import type { LineSummary } from '../src/core/duty'
import type { PlanCijfers } from '../src/core/planTypen'
import { fixtureBedrijf } from './fixtures/planfixture'
import { migreer } from '../src/core/bedrijfsdag'
import { legeVandaag } from '../src/core/uitval'
import { busTellerVan, verwijderBus } from '../src/core/bedrijf'
import type { Vehicle } from '../src/core/vehicles'
import type { Rittenstaat } from '../src/core/rittenstaat'
import type { Duty } from '../src/core/types'
// Deel D: zelf rijden vanuit het bedrijf.
import type { DagPlan, LopendeRit } from '../src/core/planTypen'
import { kaartDag } from '../src/core/bedrijfsplan'
import { dagplan } from '../src/core/rooster'
import { besparingVanRit, geredenVan, rijvenster, voorstellen } from '../src/core/bedrijfsrit'
import { boete, chauffeurKosten, vergoeding } from '../src/core/plantarief'
import { ANKER, LIJN, MAP, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

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

// ---- het postvak ----
console.log('')
let p5 = richtBedrijfOp('Post')
klopt('een nieuw bedrijf krijgt een welkomstbericht', p5.post?.length === 1 && p5.post[0].soort === 'welkom' && ongelezen(p5) === 1)
const p5in = schrijfIn(p5, kaart, lijn)
if ('bedrijf' in p5in) p5 = p5in.bedrijf
p5 = sluitDagAf(p5)
klopt('na een dag: een dagrapport bovenaan met het resultaat', p5.post![0].soort === 'dagrapport' && p5.post![0].v?.resultaat === p5.historie!.at(-1)!.resultaat)
const ids = p5.post!.map((b) => b.id)
klopt('ids zijn uniek', new Set(ids).size === ids.length)
klopt('één bericht lezen', ongelezen(leesPost(p5, p5.post![0].id)) === ongelezen(p5) - 1)
klopt('alles lezen', ongelezen(leesPost(p5)) === 0)
{ const leeg = leesPost(p5); klopt('lezen zonder iets ongelezens geeft hetzelfde bedrijf terug', leesPost(leeg) === leeg) }
// Een concessie die over drie dagen afloopt, en een die vandaag afloopt.
let p6: Bedrijf = { ...p5, concessies: p5.concessies.map((c) => ({ ...c, tot: p5.dag + 3 })) }
p6 = sluitDagAf(p6)
// Na het afsluiten loopt hij nog drie dagen (tot en met dag + 3): dan komt het bericht.
klopt('drie dagen voor het einde komt er bericht, met de verlenging erbij', p6.post!.some((b) => b.soort === 'afloop' && b.v?.dagen === 3 && b.v?.verlengt === 1))
p6 = sluitDagAf(p6)
klopt('... en de dag erna niet nog eens', p6.post!.filter((b) => b.soort === 'afloop').length === 1)
const p7 = sluitDagAf({ ...p5, reputatie: 10, concessies: p5.concessies.map((c) => ({ ...c, tot: p5.dag })) })
klopt('vervallen staat in de post', p7.post!.some((b) => b.soort === 'vervallen'))
const p8 = sluitDagAf({ ...p5, kas: -5_000_00 })
klopt('rood staan: een bericht van de boekhouding', p8.post![0].soort === 'kas')
// Een bus die onder de grens van slijtage zakt, en een die uit de werkplaats komt.
const kb5 = koopNieuw({ ...p5, kas: 1_000_000_00 }, markt[0])
if ('bedrijf' in kb5) {
  const q = { ...kb5.bedrijf, bussen: kb5.bedrijf.bussen!.map((b) => ({ ...b, staat: REGELS.slijtageMelding + 0.1 })) }
  klopt('slijtage onder de grens wordt gemeld', sluitDagAf(q).post!.some((b) => b.soort === 'slijtage'))
  const w = naarWerkplaats(q, q.bussen![0].nummer, 'onderhoud')
  klopt('uit de werkplaats wordt gemeld', 'bedrijf' in w && sluitDagAf(w.bedrijf).post!.some((b) => b.soort === 'werkplaats' && b.v?.nummer === q.bussen![0].nummer))
}
// Honderd dagen: het postvak blijft binnen de grens, en de ziekmeldingen komen erin.
let p9 = lang
klopt('100 dagen: postvak begrensd', (p9.post ?? []).length <= REGELS.postBewaard)

// ---- de telefoon: alleen tijdens een dienst op een eigen lijn ----
const rv = ritVoorBedrijf(p5, duty, undefined, staat)
klopt('op een eigen lijn: de kaart met de telling van de eigen dienst', rv?.lijnen[0].lineFile === 'Linie_35' && rv.telling?.opTijd === 3 && rv.telling.vroeg === 1)
klopt('de telling op de telefoon is wat er straks geboekt wordt', (() => {
  const na = boekEigenDienst(p5, duty, staat)
  return rv?.telling?.bedrag === na.kas - p5.kas
})())
const vreemd = { mapFolder: 'Rheinhausen', legs: [{ lineFile: 'Linie_99', lineNumber: '99' }] } as unknown as Duty
klopt('op een lijn van een ander: niets op de telefoon', ritVoorBedrijf(p5, vreemd, undefined, staat) === undefined)
klopt('hoofdletters in de lijnnaam maken niet uit', ritVoorBedrijf(p5, { ...duty, legs: [{ lineFile: 'LINIE_35', lineNumber: '35' }] } as unknown as Duty) !== undefined)
if ('bedrijf' in kb5) {
  const metBus = ritVoorBedrijf(kb5.bedrijf, duty, markt[0].relativePath.toUpperCase())
  klopt('in een eigen bus: nummer en staat op de telefoon', metBus?.bus?.nummer === kb5.bedrijf.bussen![0].nummer && metBus.bus.staat === 100)
  klopt('in een andere bus: geen bus op de telefoon', ritVoorBedrijf(kb5.bedrijf, duty, 'Vehicles\\Ander\\x.bus')?.bus === undefined)
}
klopt('klein genoeg om elke tik mee te sturen (< 1 kB)', JSON.stringify(rv).length < 1000)

// ---- de planning: sluitDagAf met cijfers, tellers, ziekSinds (busbedrijf-planning §3.6) ----
console.log('')
{
  const fb = fixtureBedrijf()
  const cijfers: PlanCijfers = {
    perConcessie: [
      { mapFolder: 'Proefstad', lineFile: 'L1', naam: '1 · Proefstad', bron: 'plan', rituren: 150, uitgevallen: 5.5, vergoeding: 16_218_00, onderaannemer: 12_000_00 },
      { mapFolder: 'Weg', lineFile: 'W', naam: 'W · Weg', bron: 'terugval', rituren: 10, uitgevallen: 0, vergoeding: 1_000_00, onderaannemer: 900_00 }
    ],
    vergoeding: 17_218_00,
    onderaannemer: 12_900_00,
    eigenBus: 68_00,
    uitzend: { diensten: 1, kosten: 444_70 },
    huurbus: { omlopen: 0, kosten: 0 },
    overuren: { minuten: 37, kosten: 53_06 },
    lonen: 1_380_00,
    uitgevallen: { rituren: 5.5, ritten: 3, boete: 330_00, reputatie: 1 },
    legacyZelf: 100_00,
    kosten: 12_900_00 + 68_00 + 444_70 + 53_06 + 1_380_00 + 330_00,
    gereden: 160,
    werkend: [1, 2],
    overwerkt: [2],
    eigenAandeel: 0.1,
    busUren: { 101: 6.8 },
    omlopen: 22,
    eigenOmlopen: 1,
    diensten: 28,
    eigenDiensten: 2,
    jijDiensten: 0,
    openDiensten: 1,
    uitbesteed: 25
  }
  const met = { ...fb, zelfUren: 2, vandaag: { dag: fb.dag, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} } }
  const na = sluitDagAf(met, cijfers)
  const vandaagGeboekt = na.boekingen.filter((x) => x.dag === fb.dag)
  klopt('met cijfers: alles in hele centen', vandaagGeboekt.every((x) => Number.isInteger(x.bedrag)))
  klopt('met cijfers: de kas gaat met vergoeding − kosten + invaluren', na.kas - met.kas === cijfers.vergoeding - cijfers.kosten + cijfers.legacyZelf)
  klopt('met cijfers: de terugval staat erbij als "zonder kaart"', vandaagGeboekt.some((x) => x.wat.endsWith('(zonder kaart)')))
  klopt('met cijfers: boete, uitzend, overuren en eigen bus geboekt', ['boete', 'uitzend', 'overuren', 'eigen-bus'].every((s) => vandaagGeboekt.some((x) => x.soort === s)))
  const staat = na.historie!.at(-1)!
  klopt('dagstaat: uitgevallen en uitbesteed', staat.uitgevallen === 5.5 && staat.uitbesteed === 25 && staat.openDiensten === 1)
  klopt('vandaag is weg en de invaluren op nul', na.vandaag === undefined && na.zelfUren === 0)
  klopt('slijtage per bus: 101 reed 6,8 u, 102 niets', na.bussen!.find((x) => x.nummer === 101)!.km === 10_000 + Math.round(6.8 * REGELS.kmPerUur) && na.bussen!.find((x) => x.nummer === 102)!.km === 10_000)
  klopt('xp: 1 per gereden rituur plus de winstdag', (na.xp ?? 0) - (met.xp ?? 0) >= 160)
  klopt('een bericht over wat uitviel', na.post!.some((p) => p.soort === 'uitgevallen'))
  const ervaring = (b: Bedrijf, id: number): number => b.personeel!.find((x) => x.id === id)?.ervaring ?? -1
  klopt('werkend krijgt ervaring (chauffeur 1 en de monteur), wie niet werkte niet', ervaring(na, 1) > 10 && ervaring(na, 6) > 40 && ervaring(na, 3) === 50)
  const zonderOverwerk = sluitDagAf(met, { ...cijfers, overwerkt: [] })
  const blij = (b: Bedrijf, id: number): number => b.personeel!.find((x) => x.id === id)?.tevredenheid ?? -1
  klopt('alleen wie overwerkt was wordt er minder blij van', blij(na, 2) < blij(zonderOverwerk, 2) && blij(na, 1) === blij(zonderOverwerk, 1))
  klopt('zonder cijfers: het oude pad (geen boete-boeking)', !sluitDagAf(met).boekingen.some((x) => x.soort === 'boete'))

  // Tellers: een verkocht nummer komt niet terug, en het rooster wordt opgeruimd.
  let t: Bedrijf = { ...fb, kas: 1_000_000_00, rooster: { bussen: { 'o|1': 103 }, chauffeurs: { 'o|1|1': 6 } } }
  t = verkoop(t, 103)
  klopt('verkoop ruimt het rooster op', t.rooster!.bussen['o|1'] === undefined)
  const gekocht = koopNieuw(t, markt[0])
  klopt('na verkoop van 103 krijgt de volgende bus 104', 'bedrijf' in gekocht && gekocht.bedrijf.bussen!.at(-1)!.nummer === 104)
  t = ontsla(t, 6)
  klopt('ontslag ruimt het rooster op', t.rooster!.chauffeurs['o|1|1'] === undefined)
  const aangenomen = neemAan(t, sollicitanten(t)[0].nr)
  klopt('na ontslag van 6 krijgt de volgende 7', 'bedrijf' in aangenomen && aangenomen.bedrijf.personeel!.at(-1)!.id === 7)

  // ziekSinds: de eerste dag van de ziekte, en weg zodra hij beter is.
  let z: Bedrijf = { ...fb, personeel: fb.personeel!.map((m) => ({ ...m, ziekTot: undefined, ziekSinds: undefined })) }
  let gezien = false
  let gewist = false
  for (let i = 0; i < 400 && !(gezien && gewist); i++) {
    const voor = z
    z = sluitDagAf(z)
    for (const m of z.personeel!) {
      const was = voor.personeel!.find((x) => x.id === m.id)
      if (m.ziekTot !== undefined && was?.ziekTot === undefined && m.ziekSinds === voor.dag + 1) gezien = true
      if (was?.ziekTot !== undefined && m.ziekTot === undefined && m.ziekSinds === undefined) gewist = true
    }
  }
  klopt('ziekSinds is de dag na de afsluiting, en gaat samen met ziekTot weg', gezien && gewist)
}

/* Verzoeken uit het wagenparkontwerp (§F11) die nog in deel 0 horen. */
{
  // (a) De waarde verandert niet mee als de migratie de vorm uit OMSI haalt.
  const fb = fixtureBedrijf()
  const alsSolo = { ...fb, bussen: fb.bussen!.map((x) => (x.nummer === 101 ? { ...x, vorm: 'solo' as const } : x)) }
  const voor = waardeVan(alsSolo.bussen!.find((x) => x.nummer === 101)!)
  const sg = { relativePath: 'Vehicles\\SG292\\SG292.bus', manufacturer: 'MAN', type: 'SG292', aanhanger: 'x.bus' } as unknown as Vehicle
  const na = migreer(alsSolo, [], {}, [sg]).bedrijf
  const b101 = na.bussen!.find((x) => x.nummer === 101)!
  klopt('migratie zet de vorm van de SG292 op geleed', b101.vorm === 'geleed')
  klopt('en legt de nieuwprijs vast met de oude vorm', b101.nieuwwaarde === REGELS.nieuwprijs.solo)
  klopt('dus de waarde blijft gelijk', waardeVan(b101) === voor)
  const nieuw = koopNieuw({ ...richtBedrijfOp('Waarde'), kas: 10_000_000_00 }, { relativePath: 'a.bus', naam: 'A', vorm: 'solo' })
  klopt('een nieuwe bus krijgt zijn nieuwprijs mee', 'bedrijf' in nieuw && nieuw.bedrijf.bussen![0].nieuwwaarde === REGELS.nieuwprijs.solo)

  // (b) Een oud profiel zonder teller dat zijn hoogste bus al verkocht had.
  let oud: Bedrijf = { ...richtBedrijfOp('Teller'), kas: 10_000_000_00 }
  for (const n of ['A', 'B']) {
    const k = koopNieuw(oud, { relativePath: `${n}.bus`, naam: n, vorm: 'solo' })
    if ('bedrijf' in k) oud = k.bedrijf
  }
  oud = verkoop(oud, 102)
  oud = { ...oud, busTeller: undefined }
  klopt('de teller komt ook uit de boekingen', busTellerVan(oud) === 102)
  const weer = koopNieuw(oud, { relativePath: 'C.bus', naam: 'C', vorm: 'solo' })
  klopt('een verkocht nummer komt niet terug, ook zonder teller', 'bedrijf' in weer && weer.bedrijf.bussen!.at(-1)!.nummer === 103)

  // (c) verwijderBus ruimt ook rooster en invulling op.
  const met: Bedrijf = {
    ...fb,
    rooster: { bussen: { a: 101, b: 102 }, chauffeurs: {} },
    vandaag: { ...legeVandaag(fb.dag), busInvulling: { c: { soort: 'eigen', nummer: 101 } } }
  }
  const zonder = verwijderBus(met, 101)
  klopt('verwijderBus haalt de bus weg', !zonder.bussen!.some((x) => x.nummer === 101))
  klopt('en uit het rooster', !Object.values(zonder.rooster!.bussen).includes(101) && zonder.rooster!.bussen.b === 102)
  klopt('en uit de invulling van vandaag', Object.keys(zonder.vandaag!.busInvulling).length === 0)
  klopt('en legt de teller vast', (zonder.busTeller ?? 0) >= 103)
}

/* Deel D: zelf rijden vanuit het bedrijf (ontwerp busbedrijf-planning §7.7). */
{
  const fb = fixtureBedrijf()
  // Twee bussen van hetzelfde model: 104 is net als 101 een SG292.
  const b: Bedrijf = { ...fb, bussen: [...fb.bussen!, { ...fb.bussen![0], nummer: 104 }] }
  const pad104 = b.bussen!.find((x) => x.nummer === 104)!.relativePath
  const ritDuty = {
    mapFolder: MAP,
    totalStops: 20,
    legs: [
      { lineFile: LIJN, lineNumber: '1', minutes: 60 },
      { lineFile: LIJN, lineNumber: '1', minutes: 30 }
    ]
  } as unknown as Duty
  const rit: LopendeRit = {
    dienst: `${MAP}|${LIJN}|799|A|1`,
    dag: b.dag,
    van: 300,
    tot: 480,
    ritten: [],
    omloopNr: 'A',
    deel: 1,
    delen: 2,
    lijn: '1',
    busnummer: 104
  }
  const klapStaat = { ritten: [{ haltes: [{ oordeel: 'goed', klappen: 2 }, { oordeel: 'goed' }] }] } as unknown as Rittenstaat

  const na = boekEigenDienst(b, ritDuty, klapStaat, pad104.toUpperCase(), 20, rit)
  const g = na.vandaag?.gereden[rit.dienst]
  klopt('bedrijfsrit: vult gereden (1,5 rituur, 180 werkminuten, deel 1)', g?.rituren === 1.5 && g.werkMinuten === 180 && g.deel === 1)
  klopt('bedrijfsrit: zelfUren blijft onaangeroerd', (na.zelfUren ?? 0) === (b.zelfUren ?? 0))
  klopt(
    'twee bussen van hetzelfde model: de schade gaat naar 104, niet naar 101',
    na.bussen!.find((x) => x.nummer === 104)!.schade > 0 && na.bussen!.find((x) => x.nummer === 101)!.schade === 0
  )
  klopt('gereden draagt het busnummer van de rit', g?.busnummer === 104)
  const ander = boekEigenDienst(b, ritDuty, klapStaat, 'Vehicles\\Ander\\ander.bus', 20, rit)
  klopt('een ander pad: geen schade, bij geen enkele bus', ander.bussen!.every((x) => x.schade === 0))
  klopt('en dan geen busnummer in gereden', ander.vandaag?.gereden[rit.dienst]?.busnummer === undefined)
  klopt('de tijdhaltes tellen nog: reputatie en xp zoals altijd', na.reputatie > b.reputatie && (na.xp ?? 0) > (b.xp ?? 0))

  const half = geredenVan(ritDuty, rit, 10, () => true)
  klopt('geredenVan met de helft van de haltes: deel 0,5', half.deel === 0.5 && half.rituren === 0.75 && half.werkMinuten === 90)
  klopt('zonder telling telt hij voor vol', geredenVan(ritDuty, rit, undefined, () => true).deel === 1)
  const kleiner = boekEigenDienst(na, ritDuty, undefined, pad104, 4, rit)
  klopt('een kleinere tweede poging vervangt de eerste niet', kleiner.vandaag?.gereden[rit.dienst]?.rituren === 1.5)
  const groter = boekEigenDienst(boekEigenDienst(b, ritDuty, undefined, pad104, 4, rit), ritDuty, undefined, pad104, 20, rit)
  klopt('een grotere wel', groter.vandaag?.gereden[rit.dienst]?.rituren === 1.5)
  const gisteren = boekEigenDienst({ ...b, dag: 2 }, ritDuty, undefined, pad104, 20, rit)
  klopt('een rit van een andere bedrijfsdag: het oude pad (invaluren)', gisteren.zelfUren === 1.5 && !gisteren.vandaag?.gereden[rit.dienst])

  const beeld = ritVoorBedrijf(b, ritDuty, pad104, undefined, rit)
  klopt('telefoon: omloop, tot en de bus van de rit', beeld?.dienst?.omloop === 'A' && beeld.dienst.tot === 480 && beeld.bus?.nummer === 104)

  // Voorstellen en besparing op de kunstmatige kaart; de stub van het plan besteedt alles uit.
  const dagen = [{ dag: 1, kaarten: [kaartDag(fixtureKaart(), fixtureKalender(), [LIJN], ANKER, 1)] }]
  const plan = dagplan(fb, dagen, 1)
  const f = { vergoeding: 1, inhuur: 1 }
  const lijst = voorstellen(fb, plan, 20)
  klopt('voorstellen: elke uitbestede dienst, elk met besparing', lijst.length === plan.telling.diensten && lijst.every((v) => v.reden === 'uitbesteed' && v.bespaart > 0))
  klopt('voorstellen: hoogstens drie als je niets zegt', voorstellen(fb, plan).length === Math.min(3, plan.telling.diensten))
  klopt('voorstellen: de grootste besparing eerst', lijst.every((v, i) => i === 0 || lijst[i - 1].bespaart >= v.bespaart))
  const eerste = plan.kaarten[0].omlopen[0].diensten[0]
  const heel = rijvenster(eerste.dienst)!
  const bHeel = besparingVanRit(fb, plan, eerste.dienst.sleutel, heel)
  klopt('de hele dienst rijden bespaart de onderaannemer helemaal', bHeel.bespaart === eerste.stand.kosten && bHeel.restKosten === 0 && !bHeel.rest)
  const tellend = eerste.dienst.ritten.filter((r) => r.telt)
  const stuk = rijvenster(eerste.dienst, tellend[0].sleutel, tellend[1].sleutel)!
  const bStuk = besparingVanRit(fb, plan, eerste.dienst.sleutel, stuk)
  klopt(
    'een stuk rijden bespaart minder; de rest rijdt de onderaannemer voor het verschil',
    bStuk.bespaart > 0 && bStuk.bespaart < bHeel.bespaart && bStuk.rest?.wie.soort === 'onderaannemer' && bStuk.bespaart + bStuk.restKosten === eerste.stand.kosten
  )
  klopt('alle bedragen in hele centen', [bHeel.bespaart, bStuk.bespaart, bStuk.restKosten, ...lijst.map((v) => v.bespaart)].every(Number.isInteger))

  const metStand = (wat: (pd: DagPlan['kaarten'][0]['omlopen'][0]['diensten'][0]) => DagPlan['kaarten'][0]['omlopen'][0]['diensten'][0]): DagPlan => ({
    ...plan,
    kaarten: plan.kaarten.map((k) => ({ ...k, omlopen: k.omlopen.map((po) => ({ ...po, diensten: po.diensten.map(wat) })) }))
  })
  const eigen = metStand((pd) => ({ ...pd, stand: { wie: { soort: 'eigen', id: 1 }, bron: 'rooster', kosten: 0 } }))
  klopt(
    'rijdt er al een eigen chauffeur, dan bespaart het niets en is er geen voorstel',
    besparingVanRit(fb, eigen, eerste.dienst.sleutel, heel).bespaart === 0 && voorstellen(fb, eigen, 20).length === 0
  )
  const metGereden: Bedrijf = {
    ...fb,
    vandaag: { ...legeVandaag(fb.dag), gereden: { [eerste.dienst.sleutel]: { van: 0, tot: 1, werkMinuten: 1, rituren: 1, deel: 1 } } }
  }
  klopt('wat je vandaag al reed, komt niet terug in de voorstellen', !voorstellen(metGereden, plan, 20).some((v) => v.dienst === eerste.dienst.sleutel))
  const jij = metStand((pd) => (pd.dienst.sleutel === eerste.dienst.sleutel ? { ...pd, jij: { van: 0, tot: 1, nu: true } } : pd))
  klopt('wat je nu rijdt ook niet', !voorstellen(fb, jij, 20).some((v) => v.dienst === eerste.dienst.sleutel))

  // Een plots gat dat blijft liggen, en een te-laat-stuk dat de uitzendkracht rijdt.
  const tweede = plan.kaarten[0].omlopen[0].diensten[1] ?? plan.kaarten[0].omlopen[1].diensten[0]
  const laatTot = tweede.dienst.ritten.filter((r) => r.telt)[1].vertrek
  const gaten = metStand((pd) =>
    pd.dienst.sleutel === eerste.dienst.sleutel
      ? { ...pd, plots: true, stand: { wie: { soort: 'liggen' }, bron: 'centrale', reden: 'ziek', kosten: 0 } }
      : pd.dienst.sleutel === tweede.dienst.sleutel
        ? {
            ...pd,
            stuk: {
              van: pd.dienst.van,
              tot: laatTot,
              minuten: laatTot - pd.dienst.van,
              rituren: 0.5,
              stand: { wie: { soort: 'uitzend' }, bron: 'centrale', toeslag: true, kosten: chauffeurKosten('uitzend', laatTot - pd.dienst.van, f, true) }
            }
          }
        : pd
  )
  const gatLijst = voorstellen(fb, gaten, 20)
  klopt('plots open eerst, dan het korte klusje, dan uitbesteed', gatLijst[0]?.reden === 'open' && gatLijst[1]?.reden === 'stuk' && gatLijst.slice(2).every((v) => v.reden === 'uitbesteed'))
  klopt(
    'een gat dat blijft liggen: rijden bespaart de gemiste vergoeding en de boete',
    gatLijst[0]?.bespaart === vergoeding(eerste.dienst.rituren, fb.reputatie, f) + boete(eerste.dienst.rituren) && gatLijst[0]?.waarom === 'ziek'
  )
  klopt('het korte klusje is alleen het te-laat-stuk', gatLijst[1]?.dienst === tweede.dienst.sleutel && gatLijst[1].tot <= laatTot + 120 && gatLijst[1].van === tweede.dienst.ritten.find((r) => r.telt)!.vertrek)
  const bus = metStand((pd) => pd)
  bus.kaarten[0].omlopen[0] = { ...bus.kaarten[0].omlopen[0], bus: { wie: { soort: 'liggen' }, bron: 'hand', kosten: 0 } }
  klopt('een omloop zonder bus geeft geen voorstel', !voorstellen(fb, bus, 20).some((v) => v.omloop === bus.kaarten[0].omlopen[0].omloop.tourNumber))
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
