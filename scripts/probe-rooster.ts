/**
 * Het rooster van het busbedrijf nagerekend op de kunstmatige kaart.
 *
 *   npx tsx scripts/probe-rooster.ts
 *
 * Deel A van de planning (ontwerp busbedrijf-planning §4.6): elke soort
 * conflict in een eigen situatie, het aanvullen, de afrekening, een oud
 * bedrijf zonder rooster, de prognose tegen de afsluiting en de terugval per
 * concessie. Puur: geen OMSI, geen bestanden.
 */
import { sluitDagAf, type Bedrijf } from '../src/core/bedrijf'
import { dienstSleutel, kaartDag, omloopSleutel } from '../src/core/bedrijfsplan'
import { chauffeurKosten, busKosten, overurenKosten, vergoeding, TARIEF } from '../src/core/plantarief'
import { PLAN } from '../src/core/planregels'
import { afrekening, dagplan, pasRoosterToe, vulAan, kopieerRooster } from '../src/core/rooster'
import type {
  ConflictSoort,
  DagPlan,
  Dagrooster,
  DienstVanDag,
  KaartDag,
  OmloopVanDag,
  PlanCijfers,
  VastRooster
} from '../src/core/planTypen'
import { ANKER, LIJN, MAP, fixtureBedrijf, fixtureConcessie, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

let fouten = 0
function klopt(wat: string, ja: boolean, uitleg?: unknown): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}${!ja && uitleg !== undefined ? `: ${JSON.stringify(uitleg)}` : ''}`)
  if (!ja) fouten++
}

const map = fixtureKaart()
const kal = fixtureKalender()
const dagen: Dagrooster[] = Array.from({ length: 12 }, (_, i) => i + 1).map((dag) => ({
  dag,
  kaarten: [kaartDag(map, kal, [LIJN], ANKER, dag)]
}))
const A = omloopSleutel(MAP, LIJN, 799, 'A')
const B = omloopSleutel(MAP, LIJN, 783, 'B')
const C = omloopSleutel(MAP, LIJN, 784, 'C')
const D = omloopSleutel(MAP, LIJN, 800, 'D')
const E = omloopSleutel(MAP, LIJN, 960, 'E')
const A1 = dienstSleutel(A, 1)
const A2 = dienstSleutel(A, 2)
const B1 = dienstSleutel(B, 1)
const C1 = dienstSleutel(C, 1)
const D1 = dienstSleutel(D, 1)
const E1 = dienstSleutel(E, 1)
const E2 = dienstSleutel(E, 2)

/** Een bedrijf op dag `dag` met dit rooster. */
function met(rooster: Partial<VastRooster>, dag = 1, extra: Partial<Bedrijf> = {}): Bedrijf {
  const b = fixtureBedrijf()
  return { ...b, dag, rooster: { bussen: {}, chauffeurs: {}, ...rooster }, ...extra }
}
const aantal = (plan: DagPlan, soort: ConflictSoort): number => plan.conflicten.filter((c) => c.soort === soort).length

/** Een kunstmatige dag: elke dienst één telbare rit van `van` tot `tot`. */
function kunstdag(
  dag: number,
  omlopen: Array<{ tour: string; days: number; diensten: Array<{ van: number; tot: number; vanHalte?: string; naar?: string }> }>
): Dagrooster {
  const echt = kaartDag(map, kal, [LIJN], ANKER, dag)
  const lijst: OmloopVanDag[] = omlopen.map((o) => {
    const sleutel = omloopSleutel(MAP, LIJN, o.days, o.tour)
    const diensten: DienstVanDag[] = o.diensten.map((d, i) => ({
      sleutel: dienstSleutel(sleutel, i + 1),
      omloop: sleutel,
      deel: i + 1,
      delen: o.diensten.length,
      van: d.van,
      tot: d.tot,
      minuten: d.tot - d.van,
      rituren: (d.tot - d.van) / 60,
      ritten: [
        {
          sleutel: `heen@${d.van}`,
          tripFile: 'heen',
          vertrek: d.van,
          aankomst: d.tot,
          haltes: 5,
          telt: true,
          lijn: '1',
          van: d.vanHalte ?? 'Halte 1',
          naar: d.naar ?? 'Station'
        }
      ]
    }))
    return {
      sleutel,
      mapFolder: MAP,
      lineFile: LIJN,
      lijn: '1',
      tourNumber: o.tour,
      days: o.days,
      depot: 'Betriebshof',
      van: Math.min(...diensten.map((d) => d.van)),
      tot: Math.max(...diensten.map((d) => d.tot)),
      minuten: Math.max(...diensten.map((d) => d.tot)) - Math.min(...diensten.map((d) => d.van)),
      rituren: diensten.reduce((s, d) => s + d.rituren, 0),
      diensten
    }
  })
  const kaart: KaartDag = { ...echt, omlopen: lijst }
  return { dag, kaarten: [kaart] }
}

/* ---------------- elke conflictsoort, precies één keer ---------------- */
{
  const geval = (soort: ConflictSoort, b: Bedrijf, ds: Dagrooster[] = dagen, dag = b.dag): void => {
    const plan = dagplan(b, ds, dag)
    klopt(`conflict ${soort} precies één keer`, aantal(plan, soort) === 1, plan.conflicten.map((c) => c.soort))
  }
  geval('bus-weg', met({ bussen: { [A]: 999 } }))
  geval('bus-werkplaats', met({ bussen: { [B]: 103 } }))
  geval('bus-dubbel', met({ bussen: { [A]: 101, [B]: 101 } }))
  geval('bus-vorm', met({ bussen: { [A]: 102 } }))
  geval('chauffeur-weg', met({ chauffeurs: { [A1]: 99 } }))
  {
    const b = met({ chauffeurs: { [A1]: 5 } })
    b.personeel = b.personeel!.map((m) => (m.id === 5 ? { ...m, cursusTot: 3 } : m))
    geval('chauffeur-afwezig', b)
  }
  geval('chauffeur-dubbel', met({ chauffeurs: { [A1]: 3, [B1]: 3 } }))
  geval('chauffeur-rust', met({ chauffeurs: { [E1]: 3, [E2]: 3 } }, 7))
  {
    // Twee diensten met 30 minuten ertussen en een andere halte: krap overstappen.
    const zondag = kunstdag(7, [
      { tour: 'E', days: 960, diensten: [{ van: 480, tot: 700, naar: 'Markt' }] },
      { tour: 'F', days: 960, diensten: [{ van: 730, tot: 900, vanHalte: 'Station' }] }
    ])
    geval('chauffeur-overstap', met({ chauffeurs: { [E1]: 3, [dienstSleutel(omloopSleutel(MAP, LIJN, 960, 'F'), 1)]: 3 } }, 7), [zondag])
  }
  // Vrijdag A|2 tot 23:25, zaterdag D vanaf 23:45 de avond ervoor: 20 minuten nachtrust.
  geval('chauffeur-nachtrust', met({ chauffeurs: { [A2]: 3, [D1]: 3 } }, 5))
  geval('overuren', met({ chauffeurs: { [E1]: 3, [E2]: 3 } }, 7))
  geval('te-lang', met({ chauffeurs: { [A1]: 3, [A2]: 3 } }))
  geval('bevoegd', met({ chauffeurs: { [A1]: 1 } }))
  geval('monteur', met({ chauffeurs: { [A1]: 6 } }))
}

/* ---------------- vrijdag 24:51 tegen zaterdag 00:14 ---------------- */
{
  const vrijdag = kunstdag(5, [{ tour: 'N', days: 784, diensten: [{ van: 1200, tot: 1491 }] }])
  const zaterdag = kunstdag(6, [{ tour: 'D', days: 800, diensten: [{ van: 14, tot: 400 }] }])
  const N1 = dienstSleutel(omloopSleutel(MAP, LIJN, 784, 'N'), 1)
  const b = met({ chauffeurs: { [N1]: 3, [D1]: 3 } }, 6)
  const za = dagplan(b, [vrijdag, zaterdag], 6)
  klopt("vr 24:51 tegen za 00:14 geeft 'chauffeur-dubbel'", aantal(za, 'chauffeur-dubbel') === 1, za.conflicten)
  klopt('… en de zaterdagdienst wordt uitbesteed', za.kaarten[0].omlopen[0].diensten[0].stand.wie.soort === 'onderaannemer')
  const vr = dagplan({ ...b, dag: 5 }, [vrijdag, zaterdag], 5)
  klopt('… op vrijdag rijdt hij gewoon (de vroegste dag wint)', vr.kaarten[0].omlopen[0].diensten[0].stand.wie.soort === 'eigen')
}

/* ---------------- vulAan ---------------- */
{
  const b0 = { ...fixtureBedrijf(), rooster: { bussen: {}, chauffeurs: {} } }
  const een = vulAan(b0, dagen, 1, 'week')
  const twee = vulAan(b0, dagen, 1, 'week')
  klopt('vulAan is deterministisch', JSON.stringify(een.bedrijf.rooster) === JSON.stringify(twee.bedrijf.rooster))
  klopt('vulAan deelt bussen en diensten in', een.bussen > 0 && een.diensten > 0, { bussen: een.bussen, diensten: een.diensten })
  const r = een.bedrijf.rooster!
  klopt('bus 101 (geleed, beste staat) rijdt omloop A (meeste rituren)', r.bussen[A] === 101, r.bussen)
  klopt('de zieke chauffeur 4 staat niet op maandag', ![A1, A2, B1].some((d) => r.chauffeurs[d] === 4), r.chauffeurs)
  klopt('de monteur rijdt nergens', !Object.values(r.chauffeurs).includes(6))
  const slecht: ConflictSoort[] = ['chauffeur-dubbel', 'te-lang', 'chauffeur-rust', 'overuren', 'chauffeur-nachtrust', 'chauffeur-afwezig', 'bus-dubbel', 'monteur']
  for (let dag = 1; dag <= 7; dag++) {
    const plan = dagplan({ ...een.bedrijf, dag }, dagen, dag)
    const mis = plan.conflicten.filter((c) => slecht.includes(c.soort))
    klopt(`dag ${dag}: geen overlap, rust ≥ 20, geen overuren, nachtrust ≥ 660, niemand afwezig`, mis.length === 0, mis)
  }
  // Niets overschrijven: wat er stond, blijft staan.
  const vast = { bussen: { [B]: 102 }, chauffeurs: { [A2]: 2 } }
  const derde = vulAan({ ...fixtureBedrijf(), rooster: vast }, dagen, 1, 'week').bedrijf.rooster!
  klopt('vulAan overschrijft niets', derde.bussen[B] === 102 && derde.chauffeurs[A2] === 2)
  // Eén bus en geen geleed: toch naar de omloop met de meeste rituren (de vorm weegt maar 10 %).
  const solo = { ...fixtureBedrijf(), bussen: fixtureBedrijf().bussen!.filter((x) => x.nummer === 102), rooster: { bussen: {}, chauffeurs: {} } }
  klopt('een enkele solobus gaat naar omloop A', vulAan(solo, dagen, 1, 'dag').bedrijf.rooster!.bussen[A] === 102)
  // Zaterdag D na een vrijdag tot 23:25: nachtrust 20 minuten; het aanvullen zet daar iemand anders.
  const zat = een.bedrijf.rooster!
  klopt('nachtrust: wie vrijdag A|2 rijdt, rijdt zaterdag niet D', zat.chauffeurs[A2] === undefined || zat.chauffeurs[A2] !== zat.chauffeurs[D1])
}

/* ---------------- afrekening ---------------- */
const geldvelden = (c: PlanCijfers): number[] => [
  c.vergoeding,
  c.onderaannemer,
  c.eigenBus,
  c.uitzend.kosten,
  c.huurbus.kosten,
  c.overuren.kosten,
  c.lonen,
  c.uitgevallen.boete,
  c.legacyZelf,
  c.kosten,
  ...c.perConcessie.flatMap((p) => [p.vergoeding, p.onderaannemer])
]
{
  // Alles uitbesteed: de tarieven uit §2.2, per dienst en per omloop afgerond.
  const b: Bedrijf = { ...fixtureBedrijf(), personeel: [], bussen: [], rooster: { bussen: {}, chauffeurs: {} } }
  const plan = dagplan(b, dagen, 1)
  const c = afrekening(b, plan)
  const k = dagen[0].kaarten[0]
  const verwachtOnder =
    k.omlopen.reduce((s, o) => s + busKosten('onderaannemer', o.rituren, { inhuur: 1 }), 0) +
    k.omlopen.flatMap((o) => o.diensten).reduce((s, d) => s + Math.round((d.minuten / 60) * TARIEF.onderChauffeurPerWerkuur), 0)
  const rit = k.omlopen.reduce((s, o) => s + o.rituren, 0)
  klopt('alles uitbesteed: onderaannemer volgens §2.2', c.onderaannemer === verwachtOnder, { c: c.onderaannemer, verwachtOnder })
  klopt('alles uitbesteed: vergoeding volgens §2.2', c.vergoeding === vergoeding(rit, b.reputatie, { vergoeding: 1 }))
  klopt('alles uitbesteed: kosten zijn onderaannemer', c.kosten === c.onderaannemer)
  klopt('afrekening: alle bedragen in hele centen', geldvelden(c).every(Number.isInteger), geldvelden(c))
}
{
  // Overuren: zondag E|1 en E|2 voor dezelfde chauffeur, 590 minuten.
  const b = met({ chauffeurs: { [E1]: 3, [E2]: 3 } }, 7)
  const c = afrekening(b, dagplan(b, dagen, 7))
  const boven = 590 - PLAN.dagDoel
  klopt('overuren precies', c.overuren.minuten === boven && c.overuren.kosten === overurenKosten(230_00, boven), c.overuren)
  klopt('overuren: 7906 cent (110 min tegen anderhalf keer 230/8)', c.overuren.kosten === 7906)
  klopt('overwerkt en werkend', c.overwerkt.join() === '3' && c.werkend.includes(3))
  klopt('overuren: hele centen', geldvelden(c).every(Number.isInteger))
}
{
  // legacyZelf afgekapt op de uitbestede rituren.
  const b = met({}, 1, { zelfUren: 1000 })
  const c = afrekening(b, dagplan(b, dagen, 1))
  const rit = dagen[0].kaarten[0].omlopen.reduce((s, o) => s + o.rituren, 0)
  klopt('legacyZelf is afgekapt op de uitbestede rituren', c.legacyZelf === Math.round(rit * TARIEF.onderChauffeurPerWerkuur), c.legacyZelf)
  const b2 = met({}, 1, { zelfUren: 1.5 })
  klopt('legacyZelf voor 1,5 u', afrekening(b2, dagplan(b2, dagen, 1)).legacyZelf === 5700)
}
{
  // Wat jij rijdt, verlaagt de kosten naar rato.
  const gereden = { van: 290, tot: 410, werkMinuten: 120, rituren: 1.5, deel: 1 }
  const vandaag = { dag: 1, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: { [A1]: gereden } }
  const zonder = met({})
  const metJij = met({}, 1, { vandaag })
  const p0 = dagplan(zonder, dagen, 1)
  const p1 = dagplan(metJij, dagen, 1)
  const kost = (p: DagPlan): number => p.kaarten[0].omlopen[0].diensten[0].stand.kosten
  klopt(
    'jij op een uitbestede dienst: 120 werkminuten minder',
    kost(p0) - kost(p1) === chauffeurKosten('onderaannemer', 545, { inhuur: 1 }) - chauffeurKosten('onderaannemer', 425, { inhuur: 1 }),
    { voor: kost(p0), na: kost(p1) }
  )
  klopt('jij staat in het plan', p1.kaarten[0].omlopen[0].diensten[0].jij?.gereden?.werkMinuten === 120 && p1.telling.jij === 1)
  // Een eigen chauffeur plus jij: geen besparing.
  const e0 = met({ chauffeurs: { [A1]: 3 } })
  const e1 = met({ chauffeurs: { [A1]: 3 } }, 1, { vandaag })
  const c0 = afrekening(e0, dagplan(e0, dagen, 1))
  const c1 = afrekening(e1, dagplan(e1, dagen, 1))
  klopt('eigen chauffeur plus jij: dezelfde kosten', c0.kosten === c1.kosten, { c0: c0.kosten, c1: c1.kosten })
  klopt('eigen chauffeur plus jij: hetzelfde eigen aandeel', Math.abs(c0.eigenAandeel - c1.eigenAandeel) < 1e-9)
}
{
  // Ziek op de eerste dag en te laat: plotse gaten die de centrale vult.
  const b = met({ chauffeurs: { [A1]: 4, [B1]: 3 } })
  const vandaag = { dag: 1, uitval: [{ id: '1|telaat|3', soort: 'telaat' as const, medewerker: 3, minuten: 40 }], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} }
  const plan = dagplan({ ...b, vandaag }, dagen, 1)
  const a1 = plan.kaarten[0].omlopen[0].diensten[0]
  klopt('ziek op de eerste dag: plots, door de centrale gevuld', a1.plots && a1.stand.bron === 'centrale' && a1.stand.reden === 'ziek', a1.stand)
  const b1 = plan.kaarten[0].omlopen[1].diensten[0]
  klopt('te laat: een stuk vooraan voor de centrale, de rest eigen', b1.stuk !== undefined && b1.stuk.stand.bron === 'centrale' && b1.stand.wie.soort === 'eigen', b1)
  klopt('te laat: het stuk eindigt bij de eerste rit na 40 minuten', b1.stuk !== undefined && b1.stuk.tot >= 400 && b1.stuk.van === 360)
  klopt('telling: 2 open', plan.telling.open === 2, plan.telling)
  const c = afrekening({ ...b, vandaag }, plan)
  // Het uitzendbureau heeft op niveau 0 één kracht: het tweede gat (later op de dag) valt uit.
  klopt('uitzend in de afrekening, tot het maximum', c.uitzend.diensten === plan.uitzend.max && c.uitzend.kosten > 0, c.uitzend)
  klopt('wat de centrale niet kan vullen, valt uit (boete, reputatie)', c.uitgevallen.rituren > 0 && c.uitgevallen.boete > 0 && b1.stuk?.stand.wie.soort === 'liggen', c.uitgevallen)
  klopt('plotse gaten: hele centen', geldvelden(c).every(Number.isInteger))
}

/* ---------------- een oud bedrijf zonder rooster ---------------- */
{
  const b = { ...fixtureBedrijf(), rooster: undefined, vandaag: undefined }
  let goed = true
  let plan: DagPlan | undefined
  try {
    plan = dagplan(b, dagen, 1)
    afrekening(b, plan)
  } catch (fout) {
    goed = false
    console.log(fout)
  }
  klopt('oud bedrijf zonder rooster: geen fout', goed)
  klopt('oud bedrijf: alles uitbesteed', plan !== undefined && plan.telling.uitbesteed === plan.telling.diensten && plan.conflicten.length === 0)
}

/* ---------------- prognose gelijk aan afsluiting ---------------- */
{
  const b0 = vulAan({ ...fixtureBedrijf(), rooster: { bussen: {}, chauffeurs: {} } }, dagen, 1, 'week').bedrijf
  const b = { ...b0, zelfUren: 0.5 }
  const cijfers = afrekening(b, dagplan(b, dagen, 1))
  const na = sluitDagAf(b, cijfers)
  const delta = na.kas - b.kas
  klopt(
    'de kas-delta van de afsluiting is vergoeding − kosten + legacyZelf',
    delta === cijfers.vergoeding - cijfers.kosten + cijfers.legacyZelf,
    { delta, verwacht: cijfers.vergoeding - cijfers.kosten + cijfers.legacyZelf }
  )
  klopt('na de afsluiting: geen vandaag, geen zelfUren', na.vandaag === undefined && (na.zelfUren ?? 0) === 0)
}

/* ---------------- terugval per concessie ---------------- */
{
  const ander = { ...fixtureConcessie(), mapFolder: 'Anderstad', mapName: 'Anderstad', lineFile: 'X9', lineNumbers: ['9'], urenPerDag: 30 }
  const b: Bedrijf = { ...fixtureBedrijf(), concessies: [fixtureConcessie(), ander], rooster: { bussen: {}, chauffeurs: {} } }
  const echt = dagen[0].kaarten[0]
  const kapot: KaartDag = { ...echt, mapFolder: 'Anderstad', mapName: 'Anderstad', lineFiles: ['X9'], omlopen: [], fout: 'kaart' }
  const plan = dagplan(b, [{ dag: 1, kaarten: [echt, kapot] }], 1)
  klopt('terugval: alleen de concessie van de kapotte kaart', plan.terugval.length === 1 && plan.terugval[0].mapFolder === 'Anderstad', plan.terugval)
  const c = afrekening(b, plan)
  const tv = c.perConcessie.find((p) => p.mapFolder === 'Anderstad')
  const pl = c.perConcessie.find((p) => p.mapFolder === MAP)
  klopt('terugval: de oude rekensom (zonder week)', tv?.bron === 'terugval' && tv.vergoeding === Math.round(30 * 95_00) && tv.onderaannemer === Math.round(30 * 86_00), tv)
  klopt('terugval: de andere concessie rekent op het plan', pl?.bron === 'plan' && pl.rituren > 0)
}

/* ---------------- het rooster aanpassen ---------------- */
{
  const b = met({})
  const uit = pasRoosterToe(b, dagen, { soort: 'chauffeur', dienst: A1, id: 3 })
  klopt('chauffeur indelen', 'bedrijf' in uit && uit.bedrijf.rooster!.chauffeurs[A1] === 3)
  const teLang = pasRoosterToe(met({ chauffeurs: { [A1]: 3 } }), dagen, { soort: 'chauffeur', dienst: A2, id: 3 })
  klopt("te lang wordt geweigerd ('te-lang')", 'fout' in teLang && teLang.fout === 'te-lang')
  const kort = kunstdag(1, [
    { tour: 'P', days: 799, diensten: [{ van: 300, tot: 400 }] },
    { tour: 'Q', days: 799, diensten: [{ van: 350, tot: 450 }] }
  ])
  const P1 = dienstSleutel(omloopSleutel(MAP, LIJN, 799, 'P'), 1)
  const Q1 = dienstSleutel(omloopSleutel(MAP, LIJN, 799, 'Q'), 1)
  const dubbel = pasRoosterToe(met({ chauffeurs: { [P1]: 3 } }), [kort], { soort: 'chauffeur', dienst: Q1, id: 3 })
  klopt('dubbel mag (wordt een conflict)', 'bedrijf' in dubbel && aantal(dagplan(dubbel.bedrijf, [kort], 1), 'chauffeur-dubbel') === 1)
  klopt('een bus dubbel mag ook', 'bedrijf' in pasRoosterToe(met({ bussen: { [A]: 101 } }), dagen, { soort: 'bus', omloop: B, nummer: 101 }))
  klopt("onbekende chauffeur: 'weg'", 'fout' in pasRoosterToe(b, dagen, { soort: 'chauffeur', dienst: A1, id: 77 }))
  const lijn = pasRoosterToe(b, dagen, { soort: 'busOpLijn', mapFolder: MAP, lineFile: LIJN, nummer: 101, dag: 1 })
  klopt('busOpLijn: de geleed bus op omloop A', 'bedrijf' in lijn && lijn.bedrijf.rooster!.bussen[A] === 101)
  const vol = pasRoosterToe(met({ bussen: { [A]: 101, [B]: 102 } }), dagen, { soort: 'busOpLijn', mapFolder: MAP, lineFile: LIJN, nummer: 103, dag: 1 })
  klopt("busOpLijn zonder plek: 'geenPlek'", 'fout' in vol && vol.fout === 'geenPlek')
  const auto = pasRoosterToe(b, dagen, { soort: 'auto', aan: true })
  klopt("automatisch aanvullen vraagt Planner ('planner')", 'fout' in auto && auto.fout === 'planner')
  const vollerooster = met({ bussen: { [A]: 101, [D]: 102 }, chauffeurs: { [A1]: 3, [D1]: 2 } })
  const wis = pasRoosterToe(vollerooster, dagen, { soort: 'wis', wat: 'masker', mapFolder: MAP, lineFile: LIJN, days: 799 })
  klopt(
    'wis een masker: alleen dat masker',
    'bedrijf' in wis && wis.bedrijf.rooster!.bussen[A] === undefined && wis.bedrijf.rooster!.chauffeurs[A1] === undefined && wis.bedrijf.rooster!.bussen[D] === 102 && wis.bedrijf.rooster!.chauffeurs[D1] === 2
  )
  const herstel = pasRoosterToe(b, dagen, { soort: 'herstel', rooster: vollerooster.rooster! })
  klopt('herstel zet het rooster terug', 'bedrijf' in herstel && herstel.bedrijf.rooster!.chauffeurs[A1] === 3)
  // Kopiëren van ma–vr (799) naar zondag (960): omloopnummers verschillen, dus op volgorde.
  const kop = kopieerRooster(met({ bussen: { [A]: 101 }, chauffeurs: { [A1]: 3, [A2]: 5 } }), dagen, MAP, LIJN, 799, 960)
  klopt('kopieer 799 → 960 op volgorde', !('fout' in kop) && kop.rooster.bussen[E] === 101 && kop.rooster.chauffeurs[E1] === 3 && kop.rooster.chauffeurs[E2] === 5, kop)
  // Opruimen: een verkochte bus verdwijnt bij de volgende actie.
  const oud = met({ bussen: { [A]: 555 } })
  const na = pasRoosterToe(oud, dagen, { soort: 'chauffeur', dienst: C1, id: 2 })
  klopt('sleutels van een verkochte bus worden opgeruimd', 'bedrijf' in na && na.bedrijf.rooster!.bussen[A] === undefined)
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
