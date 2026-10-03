/**
 * Het lijnplan en de vloot op de klok (ontwerp busbedrijf-planning §8.7).
 *
 *   npx tsx scripts/probe-lijnplan.ts                 alleen de kunstmatige kaart
 *   npx tsx scripts/probe-lijnplan.ts --hafencity ["<pad naar OMSI 2>"]
 *                                                     ook HafenCity, lijn 109 (lokaal)
 *
 * Op de fixture (scripts/fixtures/planfixture.ts): omloop D staat erop bij klok
 * −15 en 14, LEE-ritten staan op 'leeg', de sleutels zijn die van `kaartDag`,
 * en verder de klok van OMSI, de vertraging en de snelheid.
 *
 * Met --hafencity leest de proef de OMSI-map (alleen lezen; de cache gaat naar
 * een tijdelijke map): een werkdag heeft 22 omlopen met korte en lege ritten en
 * geen route zonder punten, op zaterdag om klok 30 rijden 55201 en 55202, op
 * een werkdag om 1470 rijden de late omlopen, en 8640 klokstanden kosten
 * minder dan een halve seconde.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ankerVoor, kaartDag } from '../src/core/bedrijfsplan'
import { bouwLijnplan, eindVan } from '../src/core/lijnplan'
import type { LijnPlan } from '../src/core/planTypen'
import type { TripRoute } from '../src/core/routing'
import { klokUitOmsi, maakSporen, plekOpKlok, vertragingVan } from '../src/shared/vloot'
import { ANKER, LIJN, MAP, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

let fouten = 0
function klopt(wat: string, ja: boolean, uitleg?: string): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}${!ja && uitleg ? `: ${uitleg}` : ''}`)
  if (!ja) fouten++
}

/* ------------------------------------------------------------------ */
/* De kunstmatige kaart                                               */
/* ------------------------------------------------------------------ */

const map = fixtureKaart()
const kal = fixtureKalender()

// Haltes op een rechte lijn van west naar oost; de remise ervoor, de Überliegeplatz erachter.
const STOPS = new Map<string, { x: number; y: number }>([
  ['D', { x: -300, y: 0 }],
  ['1', { x: 0, y: 0 }],
  ['2', { x: 500, y: 0 }],
  ['3', { x: 1000, y: 0 }],
  ['4', { x: 1500, y: 0 }],
  ['5', { x: 2000, y: 0 }],
  ['5b', { x: 2100, y: 50 }]
])

/*
 * De routes: recht over de haltes, met een tussenpunt zodat het een echte lijn
 * is. De LEE-rit krijgt geen route: daar moet de kaart zelf recht trekken.
 */
let vragen = 0
const routes = (legs: Array<{ tripFile: string; stopIds: string[] }>): TripRoute[] => {
  vragen++
  return legs.map((leg) => {
    if (leg.tripFile === 'lee') return { points: [], guessed: [] }
    const punten = leg.stopIds.map((id) => STOPS.get(id)).filter((p) => p !== undefined)
    return { points: punten.flatMap((p) => [p.x, p.y]), guessed: [] }
  })
}

const plan = (dag: number): LijnPlan => bouwLijnplan(map, routes, [LIJN], kal, ANKER, dag)

// ---- de sleutels zijn die van kaartDag ----
let gelijk = true
for (let dag = 1; dag <= 28; dag++) {
  const a = plan(dag).omlopen.map((o) => o.sleutel).sort().join(';')
  const b = kaartDag(map, kal, [LIJN], ANKER, dag).omlopen.map((o) => o.sleutel).sort().join(';')
  if (a !== b) {
    gelijk = false
    console.log(`   dag ${dag}: lijnplan ${a} / kaartDag ${b}`)
  }
}
klopt('vier weken lang dezelfde omlopen en sleutels als kaartDag (ook de feestdag en de vakantie)', gelijk)

vragen = 0
const zaterdag = plan(6)
klopt('alle routes van een dag in één vraag', vragen === 1)
klopt('zaterdag (dag 6): alleen omloop D', zaterdag.omlopen.map((o) => o.tourNumber).join() === 'D')
klopt('zaterdag: het plan begint om −15 (vrijdag 23:45)', zaterdag.van === -15)
klopt('zaterdag: de datum is 30-04-2016', zaterdag.datum === '2016-04-30')
klopt('zaterdag: het plan eindigt bij de laatste aankomst', zaterdag.tot === Math.max(...zaterdag.omlopen.flatMap((o) => o.ritten.map(eindVan))))

const stops = STOPS
const zaterdagSporen = maakSporen(zaterdag, stops)
const D = zaterdag.omlopen[0]
const dMin15 = plekOpKlok(D, zaterdagSporen, stops, -15)
const d14 = plekOpKlok(D, zaterdagSporen, stops, 14)
klopt('omloop D staat erop bij klok −15 (rijdt)', dMin15.staat === 'rit' && Number.isFinite(dMin15.x))
klopt('omloop D staat erop bij klok 14 (rijdt)', d14.staat === 'rit' && Number.isFinite(d14.x))
klopt('omloop D om −15 aan het begin van "terug" (halte 5, oostkant)', Math.abs(dMin15.x - 2000) < 1)
klopt('omloop D om 12 in de pauze aan halte 1', (() => {
  const p = plekOpKlok(D, zaterdagSporen, stops, 12)
  return p.staat === 'pauze' && Math.abs(p.x) < 1 && p.volgendeHalte === '1' && p.volgendeTijd === 14
})())
klopt('omloop D om −30 nog in de remise', plekOpKlok(D, zaterdagSporen, stops, -30).staat === 'remise')

// ---- een werkdag ----
const maandag = plan(1)
const sporen = maakSporen(maandag, stops)
const A = maandag.omlopen.find((o) => o.tourNumber === 'A')!
klopt('maandag: omlopen A en B', maandag.omlopen.map((o) => o.tourNumber).sort().join('') === 'AB')
klopt('A begint met de LEE-rit (2 haltes, leeg)', A.ritten[0].route.startsWith('lee|') && A.ritten[0].leeg && A.ritten[0].stopIds.length === 2)
klopt('A heeft lege ritten (LEE en Überliege) en ritten die tellen', A.ritten.some((r) => r.leeg) && A.ritten.some((r) => !r.leeg))
klopt('de LEE-rit om 295 staat op "leeg"', plekOpKlok(A, sporen, stops, 295).staat === 'leeg')
/*
 * De Überliege-ritten van de fixture: `heen && n % 4 === 1` komt nooit voor (heen
 * hoort bij even n), dus omloop A heeft er geen. Staat er een, dan moet hij op
 * 'leeg' staan.
 */
{
  const u = A.ritten.find((r) => r.route.startsWith('ueberliege'))
  if (u) klopt('een Überliege-rit staat op "leeg"', plekOpKlok(A, sporen, stops, u.vertrek + 2).staat === 'leeg')
  else console.log('     (de fixture heeft geen Überliege-ritten in omloop A; zie de noot hierboven)')
}
klopt('de LEE-rit heeft geen route, maar wel een spoor (recht van D naar 1)', (maandag.routes['lee|D,1'] ?? []).length === 0 && sporen.has('lee|D,1'))
klopt('de LEE-rit rijdt van de remise naar halte 1', (() => {
  const p = plekOpKlok(A, sporen, stops, 295)
  return p.x > -300 && p.x < 0
})())
klopt('A om 0 in de remise, om 1500 klaar', plekOpKlok(A, sporen, stops, 0).staat === 'remise' && plekOpKlok(A, sporen, stops, 1500).staat === 'klaar')

// De tweede "heen": daarvoor ligt een pauze aan halte 1 (de eerste volgt direct op de LEE-rit).
const heen = A.ritten.filter((r) => r.route.startsWith('heen'))[1]
klopt('elke rit heeft een tijd per halte, oplopend, vanaf het vertrek', A.ritten.every((r) => r.tijden.length === r.stopIds.length && r.tijden[0] === r.vertrek && r.tijden.every((t, i) => i === 0 || t >= r.tijden[i - 1])))
klopt('"heen" komt na 25 minuten aan', eindVan(heen) === heen.vertrek + 25)
klopt('op "heen" schuift de bus naar het oosten, met koers 90', (() => {
  const a = plekOpKlok(A, sporen, stops, heen.vertrek + 5)
  const b = plekOpKlok(A, sporen, stops, heen.vertrek + 15)
  return a.staat === 'rit' && b.x > a.x && Math.abs(a.koers - 90) < 1
})())
klopt('halverwege "heen" (12,5 min) bij halte 3', Math.abs(plekOpKlok(A, sporen, stops, heen.vertrek + 12.5).x - 1000) < 1)
klopt('de volgende halte en haar tijd, met de vertraging erbij', (() => {
  const p = plekOpKlok(A, sporen, stops, heen.vertrek + 8, 2)
  // Twee minuten te laat: de bus is waar hij om +6 had moeten zijn, net vóór halte 2 (+6,25).
  return p.volgendeHalte === '2' && p.volgendeTijd === heen.tijden[1] + 2
})())
klopt('met vertraging staat de bus nog aan de halte als hij volgens het plan al rijdt', (() => {
  const p = plekOpKlok(A, sporen, stops, heen.vertrek + 1, 3)
  return p.staat === 'pauze' && Math.abs(p.x) < 1
})())
klopt('te laat zonder vervanging: de bus wacht aan het begin van zijn rit', (() => {
  const p = plekOpKlok(A, sporen, stops, heen.vertrek + 5, 0, heen.vertrek + 20)
  return p.staat === 'wacht' && Math.abs(p.x) < 1 && p.volgendeTijd === heen.vertrek + 20
})())
klopt('met een route maar zonder haltes op de kaart: naar de tijd over de route', (() => {
  const s = maakSporen(maandag, new Map())
  const a = plekOpKlok(A, s, new Map(), heen.vertrek + 5)
  const b = plekOpKlok(A, s, new Map(), heen.vertrek + 20)
  return a.staat === 'rit' && Number.isFinite(a.x) && b.x > a.x
})())
klopt('zonder route en zonder haltes: geen plek, maar ook geen fout', (() => {
  const kaal = bouwLijnplan(map, () => [], [LIJN], kal, ANKER, 1)
  const o = kaal.omlopen.find((x) => x.tourNumber === 'A')!
  const p = plekOpKlok(o, maakSporen(kaal, new Map()), new Map(), heen.vertrek + 5)
  return p.staat === 'rit' && Number.isNaN(p.x)
})())
klopt('een routeerfout laat het plan heel, zonder routes', (() => {
  const fout = bouwLijnplan(map, () => {
    throw new Error('proef')
  }, [LIJN], kal, ANKER, 1)
  return fout.omlopen.length === 2 && Object.values(fout.routes).every((p) => p.length === 0)
})())

// ---- vertraging ----
const reeksen = Array.from({ length: 400 }, (_, i) => vertragingVan(3, A.sleutel, i, 10, 50))
const ervaren = Array.from({ length: 400 }, (_, i) => vertragingVan(3, A.sleutel, i, 90, 100))
klopt('vertraging tussen −1 en 8, in hele minuten', [...reeksen, ...ervaren].every((m) => Number.isInteger(m) && m >= -1 && m <= 8))
klopt('vertraging is elke keer gelijk voor dezelfde dag, omloop en rit', vertragingVan(3, A.sleutel, 7, 30, 70) === vertragingVan(3, A.sleutel, 7, 30, 70))
const gem = (l: number[]): number => l.reduce((a, b) => a + b, 0) / l.length
klopt('weinig ervaring en een matige bus lopen verder uit', gem(reeksen) > gem(ervaren) + 0.5, `${gem(reeksen).toFixed(2)} tegen ${gem(ervaren).toFixed(2)}`)

// ---- de klok van OMSI ----
const bereik = { van: -15, tot: 1506 }
klopt('OMSI op de bedrijfsdatum: de minuten zelf', klokUitOmsi(865.5, '2016-04-30', '2016-04-30', bereik) === 865.5)
klopt('OMSI de dag erna om 00:30: 1470', klokUitOmsi(30, '2016-05-01', '2016-04-30', bereik) === 1470)
klopt('OMSI de dag erna om 01:10: buiten het plan', klokUitOmsi(70, '2016-05-01', '2016-04-30', bereik) === undefined)
klopt('OMSI de avond ervoor om 23:45: −15', klokUitOmsi(1425, '2016-04-29', '2016-04-30', bereik) === -15)
klopt('OMSI de avond ervoor om 23:00: buiten het plan', klokUitOmsi(1380, '2016-04-29', '2016-04-30', bereik) === undefined)
klopt('OMSI een andere dag: niets', klokUitOmsi(600, '2016-05-07', '2016-04-30', bereik) === undefined)
klopt('over een maandgrens', klokUitOmsi(10, '2016-05-01', '2016-04-30', { van: 0, tot: 1500 }) === 1450)

// ---- snelheid op de fixture ----
{
  const t0 = performance.now()
  let n = 0
  for (let s = 0; s < 8640; s++) {
    const klok = maandag.van + ((maandag.tot - maandag.van) * s) / 8640
    for (const o of maandag.omlopen) if (Number.isFinite(plekOpKlok(o, sporen, stops, klok, vertragingVan(1, o.sleutel, 0)).x)) n++
  }
  const ms = performance.now() - t0
  klopt(`8640 klokstanden op de fixture in ${ms.toFixed(0)} ms (< 500)`, ms < 500 && n > 0)
}

/* ------------------------------------------------------------------ */
/* HafenCity, lijn 109 (lokaal, alleen met --hafencity)               */
/* ------------------------------------------------------------------ */

async function hafencity(pad: string | undefined): Promise<void> {
  const { maakKaartlaag } = await import('../src/core/kaartlaag')
  const { findOmsiInstall } = await import('../src/core/install')
  const omsi = pad ?? findOmsiInstall()
  if (!omsi) {
    klopt('OMSI 2 gevonden', false)
    return
  }
  const laag = maakKaartlaag(omsi, mkdtempSync(join(tmpdir(), 'probe-lijnplan-')))
  const folder = laag.overzicht().find((k) => /hafencity/i.test(k.folder))?.folder
  if (!folder) {
    klopt('HafenCity gevonden', false)
    return
  }
  const kaart = laag.map(folder)
  const lijn = [...new Set(kaart.tours.map((t) => t.lineFile))].find((l) => /109/.test(l))
  if (!lijn) {
    klopt('lijn 109 gevonden', false)
    return
  }
  const anker = ankerVoor(laag.tijdvak(folder))
  const geo = laag.geometrie(folder)
  const hStops = new Map(geo.stops.map((s) => [s.id, s]))
  console.log(`\nHafenCity (${folder}), ${lijn}, anker ${anker}`)

  const ma = laag.lijnplan(folder, [lijn], anker, 1)
  klopt(`werkdag: 22 omlopen (${ma.omlopen.length})`, ma.omlopen.length === 22)
  klopt('werkdag: korte en lege ritten staan erin', ma.omlopen.some((o) => o.ritten.some((r) => r.leeg)))
  const zonder = Object.entries(ma.routes).filter(([, p]) => p.length < 4)
  klopt(`werkdag: 0 routes zonder punten (${zonder.length} van ${Object.keys(ma.routes).length})`, zonder.length === 0, zonder.slice(0, 5).map(([k]) => k).join('; '))
  klopt('werkdag: dezelfde sleutels als kaartDag', ma.omlopen.map((o) => o.sleutel).sort().join(';') === laag.kaartDag(folder, [lijn], anker, 1).omlopen.map((o) => o.sleutel).sort().join(';'))
  const maSporen = maakSporen(ma, hStops)
  const laat = ma.omlopen.filter((o) => o.ritten.some((r) => eindVan(r) >= 1470))
  const onderweg1470 = laat.filter((o) => ['rit', 'leeg', 'pauze'].includes(plekOpKlok(o, maSporen, hStops, 1470).staat))
  klopt(`werkdag om 1470: de late omlopen rijden (${onderweg1470.length} van ${laat.length})`, laat.length > 0 && onderweg1470.length === laat.length)

  const za = laag.lijnplan(folder, [lijn], anker, 6)
  const zaSporen = maakSporen(za, hStops)
  for (const nr of ['55201', '55202']) {
    const o = za.omlopen.find((x) => x.tourNumber.trim() === nr)
    const p = o ? plekOpKlok(o, zaSporen, hStops, 30) : undefined
    klopt(`zaterdag om klok 30: ${nr} onderweg (${p?.staat ?? 'niet gevonden'})`, p !== undefined && ['rit', 'leeg', 'pauze'].includes(p.staat) && Number.isFinite(p.x))
  }

  const t0 = performance.now()
  for (let s = 0; s < 8640; s++) {
    const klok = ma.van + ((ma.tot - ma.van) * s) / 8640
    for (const o of ma.omlopen) plekOpKlok(o, maSporen, hStops, klok, vertragingVan(1, o.sleutel, 0))
  }
  const ms = performance.now() - t0
  klopt(`8640 klokstanden voor ${ma.omlopen.length} omlopen in ${ms.toFixed(0)} ms (< 500)`, ms < 500)
}

const metHafencity = process.argv.includes('--hafencity')
const pad = process.argv.slice(2).find((a) => !a.startsWith('--'))
void (metHafencity ? hafencity(pad) : Promise.resolve()).then(() => {
  console.log(fouten ? `\n${fouten} fout(en)` : `\nalles klopt (${MAP}${metHafencity ? ' en HafenCity' : ''})`)
  process.exit(fouten ? 1 : 0)
})
