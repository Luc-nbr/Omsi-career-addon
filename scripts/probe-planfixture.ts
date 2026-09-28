/**
 * De planning van het busbedrijf, nagerekend op de kunstmatige kaart.
 *
 *   npx tsx scripts/probe-planfixture.ts
 *
 * Datums en maskers, het knippen van omlopen, de sleutels, de dienst voor
 * OMSI, de werktijdregels, de tarieven en de busvorm (ontwerp
 * busbedrijf-planning §3.6). Puur: geen OMSI, geen bestanden.
 */
import { ankerVoor, bedrijfsdatum, kaartDag, lijnWeek, omlopenVanDag, ontleedDienst, ontleedOmloop, dienstSleutel, omloopSleutel, maskerDagen, knipOmloop, zoekDienst } from '../src/core/bedrijfsplan'
import { buildNetwork } from '../src/core/network'
import { dutyVanRitten } from '../src/core/duty'
import { toets, bevoegd, type Blok } from '../src/core/planregels'
import { boete, busKosten, chauffeurKosten, reputatieVerlies, vergoeding, overurenKosten } from '../src/core/plantarief'
import { vormVanVoertuig } from '../src/core/voertuigvorm'
import { migreer } from '../src/core/bedrijfsdag'
import { afrekening, dagplan } from '../src/core/rooster'
import { rijvenster } from '../src/core/bedrijfsrit'
import type { Dagrooster } from '../src/core/planTypen'
import { ANKER, LIJN, MAP, fixtureBedrijf, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

const map = fixtureKaart()
const kal = fixtureKalender()
const omloopNrs = (dag: number): string =>
  omlopenVanDag(map, LIJN, bedrijfsdatum(ANKER, dag), kal)
    .map((o) => o.tourNumber)
    .sort()
    .join('')

// ---- datums en maskers ----
klopt('dag 1 is een maandag', bedrijfsdatum(ANKER, 1).getUTCDay() === 1)
klopt('het anker is de maandag op of vóór het tijdvak (woensdag 27-04-2016 → 25-04)', ankerVoor({ year: 2016, dayOfYear: 118 }) === ANKER)
klopt('een maandag: A en B', omloopNrs(1) === 'AB')
klopt('een vrijdag: A en C', omloopNrs(5) === 'AC')
klopt('een zaterdag: D', omloopNrs(6) === 'D')
klopt('een zondag: E', omloopNrs(7) === 'E')
klopt('de feestdag op donderdag rijdt de zondagdienst', omloopNrs(11) === 'E')
klopt('in de vakantie rijden ma–vr en ma–do gewoon (beide bits)', omloopNrs(22) === 'AB')
klopt('masker 799: ma–vr, geen feestdag', maskerDagen(799).dagen.join() === 'ma,di,wo,do,vr' && !maskerDagen(799).feestdag)
klopt('masker 960: zo en feestdag', maskerDagen(960).dagen.join() === 'zo' && maskerDagen(960).feestdag)

// ---- knippen ----
const maandag = omlopenVanDag(map, LIJN, bedrijfsdatum(ANKER, 1), kal)
const a = maandag.find((o) => o.tourNumber === 'A')!
klopt(`omloop A (${Math.round(a.minuten)} min) in 2 of 3 delen`, a.diensten.length === 2 || a.diensten.length === 3)
klopt('elk deel hoogstens 570 minuten', a.diensten.every((d) => d.minuten <= 570))
klopt(
  'elke knip vóór een rit die telt, na minstens 3 minuten stilstand',
  a.diensten.slice(1).every((d) => {
    const vorige = a.diensten[a.diensten.indexOf(d) - 1]
    return d.ritten[0].telt && d.ritten[0].vertrek - vorige.ritten[vorige.ritten.length - 1].aankomst >= 3
  })
)
klopt('de LEE-rit hoort bij de werktijd maar niet bij de rituren', a.van === 290 && a.diensten[0].ritten[0].telt === false)
klopt('geen dienst zonder rit die telt', maandag.every((o) => o.diensten.every((d) => d.ritten.some((r) => r.telt))))
klopt('niet knippen als het niet hoeft', knipOmloop(a.diensten[0].ritten.slice(0, 4)).length === 1)
const zaterdag = omlopenVanDag(map, LIJN, bedrijfsdatum(ANKER, 6), kal)
const d = zaterdag[0]
klopt('omloop D heeft de rit om −15 en die om 00:14', d.van === -15 && d.diensten[0].ritten[0].vertrek === -15 && d.diensten[0].ritten.some((r) => r.vertrek === 14))

// ---- sleutels ----
const week: Dagrooster[] = Array.from({ length: 7 }, (_, i) => ({ dag: i + 1, kaarten: [kaartDag(map, kal, [LIJN], ANKER, i + 1)] }))
const alle = week.flatMap((r) => r.kaarten.flatMap((k) => k.omlopen.flatMap((o) => o.diensten.map((x) => x.sleutel))))
klopt('dienstsleutels zijn per dag uniek', week.every((r) => {
  const s = r.kaarten.flatMap((k) => k.omlopen.flatMap((o) => o.diensten.map((x) => x.sleutel)))
  return new Set(s).size === s.length
}))
klopt('elke sleutel is terug te ontleden', alle.every((s) => ontleedDienst(s) !== undefined))
const raar = omloopSleutel('Kaart|x', 'L|1', 799, 'omloop|3')
klopt('met een | in het omloopnummer: ontleden van links', ontleedOmloop(omloopSleutel('Kaart', 'L1', 799, 'omloop|3'))?.tourNumber === 'omloop|3')
klopt('en het deel van rechts', ontleedDienst(dienstSleutel(omloopSleutel('Kaart', 'L1', 799, 'omloop|3'), 2))?.deel === 2)
klopt('een kapotte sleutel geeft niets', ontleedDienst('onzin') === undefined && raar.length > 0)
klopt('zoekDienst vindt hem terug', zoekDienst(week[0], a.diensten[1].sleutel)?.dienst.deel === 2)

// ---- de dienst voor OMSI ----
const net = buildNetwork(map)
const tweede = a.diensten[1]
const duty = dutyVanRitten(map, net, {
  lineFile: LIJN,
  tourNumber: 'A',
  days: 799,
  ritten: tweede.ritten.filter((r) => r.telt).map((r) => r.sleutel)
})
klopt(
  'dutyVanRitten: precies de ritten die tellen, van dezelfde omloop',
  Boolean(duty) && duty!.legs.length === tweede.ritten.filter((r) => r.telt).length && duty!.legs.every((l) => l.tourNumber === 'A')
)
const venster = rijvenster(tweede, tweede.ritten.filter((r) => r.telt)[1].sleutel, tweede.ritten.filter((r) => r.telt)[3].sleutel)
klopt('rijvenster: van de 2e tot de 4e telbare rit', venster?.telt.length === 3 && venster.van === tweede.ritten.filter((r) => r.telt)[1].vertrek)
klopt('rijvenster: laatste vóór eerste geeft niets', rijvenster(tweede, venster!.telt[2], venster!.telt[0]) === undefined)

// ---- werktijdregels ----
const blok = (sleutel: string, van: number, tot: number, vanHalte = 'A', totHalte = 'A'): Blok => ({ sleutel, van, tot, vanHalte, totHalte })
klopt('overlap is dubbel', toets([blok('x', 300, 600)], blok('y', 550, 700)).dubbel === 'x')
klopt('rust tussen twee diensten', toets([blok('x', 300, 600)], blok('y', 610, 700)).rust === 10)
klopt('overstap naar een andere halte binnen 45 min', toets([blok('x', 300, 600, 'A', 'B')], blok('y', 630, 700, 'C')).overstap === 30)
klopt('te lang: meer dan 10 uur werk', toets([blok('x', 300, 700)], blok('y', 720, 960)).teLang)
klopt('overuren boven 8 uur', toets([blok('x', 300, 600)], blok('y', 620, 840)).overuren === 40)
klopt('vr 24:51 tegen za 00:14: geen nachtrust (overlap)', (toets([], blok('za', 14, 480), { vorigeTot: 1491 }).nachtrust ?? 0) < 0)
klopt('een gelede bus vraagt ervaring, een solobus niet', !bevoegd(10, 'geleed') && bevoegd(10, 'solo') && bevoegd(30, 'dubbel'))

// ---- tarieven (§2.2: dienst van 7,1 u werktijd en 5,5 rituren) ----
const f = { vergoeding: 1, inhuur: 1 }
const bedragen = [
  chauffeurKosten('onderaannemer', 426, f),
  chauffeurKosten('uitzend', 426, f),
  chauffeurKosten('uitzend', 426, f, true),
  vergoeding(5.5, 50, f),
  boete(5.5),
  busKosten('huur', 6.79, f, true),
  overurenKosten(230_00, 37)
]
klopt('alle bedragen in hele centen', bedragen.every(Number.isInteger))
klopt('uitbesteden € 269,80', bedragen[0] === 269_80)
klopt('uitzendkracht € 444,70, met spoedtoeslag € 533,64', bedragen[1] === 444_70 && bedragen[2] === 533_64)
klopt('laten liggen: € 583 gemist en € 330 boete', bedragen[3] === 583_00 && bedragen[4] === 330_00)
klopt('reputatie −1 per 4 uitgevallen uur, hoogstens −5', reputatieVerlies(5.5) === 1 && reputatieVerlies(100) === 5)
klopt('eigen chauffeur en liggen kosten niets per dienst', chauffeurKosten('eigen', 426, f) === 0 && chauffeurKosten('liggen', 426, f) === 0)

// ---- busvorm ----
klopt('met een aanhanger: geleed', vormVanVoertuig({ naam: 'MAN SG292', relativePath: 'x.bus', aanhanger: 'SG292_hinten.bus' }) === 'geleed')
klopt('een fietsaanhanger blijft solo', vormVanVoertuig({ naam: 'MAN NL202', relativePath: 'x.bus', aanhanger: 'Fahrradanhaenger.ovh' }) === 'solo')
klopt('geen aanhanger, "Gelenkbus" in het pad: solo', vormVanVoertuig({ naam: 'O530', relativePath: 'Vehicles\\Gelenkbus\\x.bus', aanhanger: '' }) === 'solo')
klopt('onbekend (oude cache): de naam', vormVanVoertuig({ naam: 'MAN NG272 Gelenkbus', relativePath: 'x.bus' }) === 'geleed')

// ---- week, migratie en de stub van het plan ----
const lw = lijnWeek(map, kal, ANKER, 1)[LIJN]
klopt('lijnWeek: 7 dagen, piek 2 omlopen', lw?.dagen.length === 7 && lw.piekOmlopen === 2)
const b = fixtureBedrijf()
const weken = { [MAP]: lijnWeek(map, kal, ANKER, 1) }
const voertuigen = [{ relativePath: 'Vehicles\\NL202\\NL202.bus', manufacturer: 'MAN', type: 'NL202', paint: '', folder: 'NL202', aanhanger: 'NL202_hinten.bus' }]
const m = migreer(b, week, weken, voertuigen)
klopt('migratie: de week in de concessie', m.bedrijf.concessies[0].week?.piekOmlopen === 2)
klopt('migratie: tellers op het maximum', m.bedrijf.busTeller === 103 && m.bedrijf.personeelTeller === 6)
klopt('migratie: bus 102 heeft een aanhanger, dus geleed, met een bericht', m.bedrijf.bussen!.find((x) => x.nummer === 102)?.vorm === 'geleed' && m.bedrijf.post!.some((p) => p.soort === 'vorm'))
klopt('migratie: een rooster en een bericht', Boolean(m.bedrijf.rooster) && m.bedrijf.post![0].soort === 'rooster')
const plan = dagplan(m.bedrijf, week, 1)
const cijfers = afrekening(m.bedrijf, plan)
klopt('de stub zet alles op uitbesteed', plan.telling.uitbesteed === plan.telling.diensten && plan.telling.diensten === maandag.reduce((s, o) => s + o.diensten.length, 0))
klopt('de afrekening van de stub in hele centen', [cijfers.vergoeding, cijfers.onderaannemer, cijfers.kosten, cijfers.lonen].every(Number.isInteger))

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
