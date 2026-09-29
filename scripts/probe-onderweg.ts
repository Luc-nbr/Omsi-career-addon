/**
 * Onderweg, nagerekend: flitspalen, boetes, gebeurtenissen en de controleurs.
 *
 *   npx tsx scripts/probe-onderweg.ts
 *
 * Alles op nagebootste metingen; leest en schrijft niets.
 */
import {
  FLITS,
  GEBEURTENIS,
  beoordeel,
  boeteVoor,
  controleAanBoord,
  flitsControle,
  flitspalen,
  gebeurtenisVoor,
  onderwegVan,
  type Gebeurtenis
} from '../src/core/onderweg'
import { bouwRittenstaat, volgSpoor, type SpoorRegel } from '../src/core/rittenstaat'
import { completeDuty, type CareerState } from '../src/core/career'
import type { Duty } from '../src/core/types'
import {
  VOORVAL_CATALOGUS,
  VOORVAL_SOORTEN,
  geldigeVoorvalUitslag,
  somVanVoorvallen,
  type VoorvalUitslag
} from '../src/shared/voorval'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

// ---- flitspalen ----
const borden = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 137.3, y: Math.floor(i / 20) * 91.7, kmh: i % 3 === 0 ? 30 : 50 }))
const palen = flitspalen(borden, 'Rheinhausen')
const actie = flitspalen(borden, 'Rheinhausen', FLITS.dichtheidActie)
klopt(`ongeveer 15 % van de borden krijgt een camera (${palen.length} van 400)`, palen.length > 35 && palen.length < 85)
klopt('elke keer dezelfde palen', JSON.stringify(palen) === JSON.stringify(flitspalen(borden, 'Rheinhausen')))
klopt('een andere kaart, andere palen', JSON.stringify(palen) !== JSON.stringify(flitspalen(borden, 'Grundorf')))
klopt('bij een flitsactie meer palen, en de vaste blijven staan', actie.length > palen.length && palen.every((p) => actie.some((a) => a.id === p.id)))
klopt('zonder borden geen palen', flitspalen(undefined, 'x').length === 0)

klopt('53 waar 50 mag: na de correctie niet te hard', boeteVoor(53, 50) === 0)
klopt('54 waar 50 mag: 1 km/u te hard', boeteVoor(54, 50) === FLITS.boeteVast + FLITS.boetePerKmh)
klopt('70 waar 50 mag: 17 km/u te hard', boeteVoor(70, 50) === FLITS.boeteVast + 17 * FLITS.boetePerKmh)

// Een paal op (100, 0). Rijden langs de x-as: bij een beweging naar +x ligt y < 0 rechts (zelfde regel als de navigatie).
const paal = [{ id: 1, x: 100, y: -6, kmh: 50 }]
const vlak = new Set<number>()
const f1 = flitsControle(paal, { x: 90, y: 0 }, { x: 105, y: 0 }, 62, vlak)
klopt('langs de paal aan jouw kant, te hard: geflitst', f1?.kmh === 62 && f1.boete === boeteVoor(62, 50))
klopt('de seconde erna niet nog eens', flitsControle(paal, { x: 105, y: 0 }, { x: 120, y: 0 }, 62, vlak) === undefined)
flitsControle(paal, { x: 120, y: 0 }, { x: 200, y: 0 }, 62, vlak)
klopt('ver genoeg weg: de paal flitst weer', !vlak.has(1))
klopt('de andere kant op: het bord geldt niet voor jou', flitsControle(paal, { x: 110, y: 0 }, { x: 95, y: 0 }, 62, new Set()) === undefined)
klopt('niet te hard: niets', flitsControle(paal, { x: 90, y: 0 }, { x: 105, y: 0 }, 52, new Set()) === undefined)
klopt('te ver van de paal: niets', flitsControle(paal, { x: 90, y: 30 }, { x: 105, y: 30 }, 62, new Set()) === undefined)
klopt('een sprong van honderden meters (andere tegel geladen): niets', flitsControle(paal, { x: -400, y: 0 }, { x: 600, y: 0 }, 62, new Set()) === undefined)

// ---- het spoor ----
const duty = {
  mapFolder: 'Rheinhausen',
  legs: [
    { lineFile: 'L35', lineNumber: '35', terminus: 'Bahnhof', departure: 600, arrival: 630, stops: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], stopTimes: [600, 605, 610, 615, 620, 625, 630], stopVast: [600, 605, 610, 615, 620, 625, 630] }
  ]
} as unknown as Duty
const a = volgSpoor(undefined, { klok: 600, rit: 0, halte: 1, uitMenu: true, snelheid: 30, reizigers: 3, remmen: 0, optrekken: 0, wisselgeld: 4 })
const b = volgSpoor(a.stand, { klok: 601, rit: 0, halte: 1, uitMenu: true, snelheid: 30, reizigers: 3, remmen: 0, optrekken: 0, wisselgeld: 5 })
klopt('te weinig wisselgeld komt als verschil in het spoor', b.regels.length === 1 && b.regels[0].t === 'wisselgeld' && 'n' in b.regels[0] && b.regels[0].n === 1)

const halte = (k: number, van: number): SpoorRegel[] => [
  { t: 'stil', k: k - 0.5 },
  { t: 'weg', k },
  { t: 'halte', k: k + 0.1, rit: 0, van, naar: van + 1, naarRit: 0, reizigers: 5 }
]
const regels: SpoorRegel[] = [
  { t: 'begin', k: 599, dienst: 'x' },
  // Op weg naar de instaphalte: de controleurs zijn er nog niet.
  { t: 'rem', k: 601, rit: 0, halte: 1, n: 3 },
  ...halte(600, 0),
  ...halte(604.2, 1), // te vroeg (48 s)
  { t: 'flits', k: 606, rit: 0, halte: 2, paal: 7, kmh: 61, limiet: 50, boete: boeteVoor(61, 50) },
  ...halte(610, 2),
  { t: 'wisselgeld', k: 610, rit: 0, halte: 3, n: 1 },
  { t: 'rem', k: 612, rit: 0, halte: 3, n: 1 },
  ...halte(615, 3),
  ...halte(620, 4),
  { t: 'flits', k: 621, rit: 0, paal: 9, kmh: 58, limiet: 50, boete: boeteVoor(58, 50) }
]
const staat = bouwRittenstaat(duty, regels)
klopt('flitsen per halte en in het totaal (ook zonder halte)', staat.ritten[0].haltes[2].flitsen?.length === 1 && staat.flitsen?.length === 2)
klopt('wisselgeld bij de halte', staat.ritten[0].haltes[3].wisselgeld === 1)

// ---- gebeurtenissen ----
const lang = { ...duty, legs: [duty.legs[0], duty.legs[0], duty.legs[0]] } as Duty
const reeks = Array.from({ length: 2000 }, (_, i) => gebeurtenisVoor(lang, `profiel|${i}`))
const met = reeks.filter(Boolean) as Gebeurtenis[]
klopt(`ongeveer 60 % van de diensten heeft iets (${met.length} van 2000)`, met.length > 1100 && met.length < 1300)
klopt('alle vijf soorten komen voor', new Set(met.map((g) => g.soort)).size === 5)
klopt('dezelfde dienst, dezelfde gebeurtenis', JSON.stringify(gebeurtenisVoor(lang, 'profiel|7')) === JSON.stringify(reeks[7]))
klopt('een examen krijgt niets', Array.from({ length: 50 }, (_, i) => gebeurtenisVoor(lang, `p|${i}`, true)).every((g) => g === undefined))
const controles = met.filter((g) => g.soort === 'controle')
klopt(
  'controleurs stappen niet bij de eerste halte in en er voorbij de laatste uit',
  controles.every((g) => (g.van ?? 0) >= 1 && (g.tot ?? 0) <= 6 && (g.tot ?? 0) - (g.van ?? 0) >= 3)
)

const controle: Gebeurtenis = { soort: 'controle', rit: 0, van: 1, tot: 4 }
klopt('aan boord tussen de halte van instappen en die van uitstappen', !controleAanBoord(controle, 0, 1) && controleAanBoord(controle, 0, 2) && controleAanBoord(controle, 0, 4) && !controleAanBoord(controle, 0, 5))
const rapport = beoordeel(controle, staat, {})
klopt(
  'het rapport: te vroeg, flits (dubbel), wisselgeld en remmen',
  rapport.rapport?.vroeg === 1 && rapport.rapport.flitsen === 1 && rapport.rapport.wisselgeld === 1 && rapport.rapport.remmen === 1 && rapport.rapport.fouten === 5
)
klopt('vijf fouten: een slecht rapport', rapport.bedrag === GEBEURTENIS.controleSlecht && rapport.gehaald === false)
klopt('zonder rittenstaat: niet gemeten, telt niet', beoordeel(controle, undefined, {}).gehaald === undefined && beoordeel(controle, undefined, {}).bedrag === 0)

klopt('comfort: twee keer hard mag', beoordeel({ soort: 'comfort' }, undefined, { harshBrakes: 1, harshAccels: 1 }).bedrag === GEBEURTENIS.comfortPremie)
klopt('comfort: drie keer niet', beoordeel({ soort: 'comfort' }, undefined, { harshBrakes: 3 }).gehaald === false)
klopt('comfort zonder meting telt niet', beoordeel({ soort: 'comfort' }, undefined, {}).gehaald === undefined)
klopt('schadevrij', beoordeel({ soort: 'schadevrij' }, undefined, { collisions: 0 }).bedrag === GEBEURTENIS.schadevrijPremie)
const stipt = beoordeel({ soort: 'stiptheid' }, staat, {})
klopt(`stiptheid: op tijd min te vroeg en te laat (${stipt.bedrag})`, stipt.bedrag === (staat.vastGemeten - 2 * staat.teVroeg - 2 * staat.teLaat) * GEBEURTENIS.stiptheidPerHalte)
klopt('flitsactie: geflitst is niet gehaald', beoordeel({ soort: 'flitsactie' }, staat, {}).gehaald === false)

// ---- in het loon ----
const ow = onderwegVan({ soort: 'schadevrij' }, staat, { collisions: 0 })!
klopt('onderweg: premie min boetes', ow.bedrag === GEBEURTENIS.schadevrijPremie - boeteVoor(61, 50) - boeteVoor(58, 50))
klopt('zonder gebeurtenis en zonder flitsen: niets', onderwegVan(undefined, bouwRittenstaat(duty, regels.filter((r) => r.t !== 'flits')), {}) === undefined)
const leeg = { entries: [], licences: [] } as unknown as CareerState
const volDuty = { ...duty, lineNumbers: ['35'], tourNumber: '1', depot: '', durationMinutes: 240, totalStops: 20 } as unknown as Duty
const zonder = completeDuty(leeg, volDuty, 'bus', {}).entries[0].pay
const metOw = completeDuty(leeg, volDuty, 'bus', {}, undefined, ow).entries[0]
klopt('het loon is loon plus onderweg, en het staat erbij', Math.abs(metOw.pay - (zonder + ow.bedrag)) < 0.001 && metOw.onderweg === ow)

// ---- het contract van de voorvallen (B7, shared/voorval.ts) ----
const rolstoel: VoorvalUitslag = {
  id: 'v1',
  soort: 'rolstoel',
  start: 612,
  stappen: [
    { id: 'stil', gehaald: true },
    { id: 'deur', gehaald: true },
    { id: 'knielen', gehaald: null }
  ],
  afloop: 'goed',
  verschoondS: 75,
  bedrag: 10,
  reputatie: 0,
  xp: 5
}
const aanrijding: VoorvalUitslag = {
  id: 'v2',
  soort: 'aanrijding',
  start: 640,
  stappen: [{ id: 'stil', gehaald: false }],
  afloop: 'mis',
  verschoondS: 0,
  bedrag: -25.5,
  reputatie: -1,
  xp: 0,
  veiligheidsfout: true
}
const geoefend: VoorvalUitslag = { ...rolstoel, id: 'v3', oefenen: true, bedrag: 10, xp: 5, verschoondS: 30 }
const som = somVanVoorvallen([rolstoel, aanrijding, geoefend])
klopt(
  `voorvallen opgeteld: geoefend telt niet voor geld, wel voor verschoning (${som.bedrag} euro, ${som.verschoondS} s)`,
  som.bedrag === -15.5 && som.xp === 5 && som.reputatie === -1 && som.verschoondS === 105 && som.goed === 1 && som.veiligheidsfouten === 1 && som.aantal === 3
)
const metVoorvallen = onderwegVan({ soort: 'schadevrij' }, staat, { collisions: 0 }, [rolstoel, aanrijding])!
klopt(
  'onderweg: de voorvallen staan erbij en tellen in het bedrag',
  metVoorvallen.voorvallen?.length === 2 && Math.abs(metVoorvallen.bedrag - (ow.bedrag + 10 - 25.5)) < 0.001
)
klopt('zonder voorvallen blijft het veld weg (oude logboeken lezen hetzelfde)', !('voorvallen' in ow))
klopt(
  'alleen een voorval, geen gebeurtenis en geen flits: toch een onderweg',
  onderwegVan(undefined, undefined, {}, [rolstoel])?.bedrag === 10
)
klopt('een uitslag gaat heel door JSON en het nakijken', JSON.stringify(geldigeVoorvalUitslag(JSON.parse(JSON.stringify(aanrijding)))) === JSON.stringify(aanrijding))
klopt('een onbekende soort is ongeldig', geldigeVoorvalUitslag({ ...rolstoel, soort: 'draak' }) === undefined)
klopt('een kapot bedrag is ongeldig', geldigeVoorvalUitslag({ ...rolstoel, bedrag: 'tien' }) === undefined && geldigeVoorvalUitslag({ ...rolstoel, bedrag: Number.NaN }) === undefined)
klopt('een stap zonder uitkomst is ongeldig', geldigeVoorvalUitslag({ ...rolstoel, stappen: [{ id: 'stil' }] }) === undefined)
klopt('wat er verder in staat valt weg', !('geheim' in (geldigeVoorvalUitslag({ ...rolstoel, geheim: 1 }) ?? {})))
klopt(
  `de catalogus: 30 soorten (V1-V32 zonder V8 en V24), elk nummer één keer`,
  VOORVAL_SOORTEN.length === 30 &&
    new Set(VOORVAL_SOORTEN.map((s) => VOORVAL_CATALOGUS[s].nr)).size === 30 &&
    !VOORVAL_SOORTEN.some((s) => ['V8', 'V24'].includes(VOORVAL_CATALOGUS[s].nr))
)

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
