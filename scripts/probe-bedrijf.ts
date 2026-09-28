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

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
