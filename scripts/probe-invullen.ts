/**
 * Open diensten vullen en de centrale, nagerekend op de kunstmatige kaart.
 *
 *   npx tsx scripts/probe-invullen.ts
 *
 * Ontwerp busbedrijf-planning §6.5. Puur: geen OMSI, geen bestanden. Zolang
 * `dagplan` nog de stub van deel 0 is (PLAN_ACTIEF onwaar), maakt de proef
 * zelf de gaten in een DagPlan uit de fixture; de vergelijking met de
 * afrekening draait pas met het echte `dagplan` van deel A.
 */
import type { Bedrijf } from '../src/core/bedrijf'
import { kaartDag } from '../src/core/bedrijfsplan'
import {
  gatVan,
  huidigeKosten,
  invulOpties,
  kiesAutomatisch,
  openRijen,
  zetInvulling,
  type CentraleContext,
  type Gat,
  type InvulOptie
} from '../src/core/invulling'
import type { Blok } from '../src/core/planregels'
import { chauffeurKosten } from '../src/core/plantarief'
import type { DagPlan, Dagrooster, InvulDoel, LopendeRit, PlanDienst, PlanOmloop } from '../src/core/planTypen'
import { afrekening, dagplan, PLAN_ACTIEF } from '../src/core/rooster'
import { ANKER, LIJN, MAP, fixtureBedrijf, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

let fouten = 0
function klopt(wat: string, ja: boolean, uitleg?: unknown): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}${!ja && uitleg !== undefined ? `: ${JSON.stringify(uitleg)}` : ''}`)
  if (!ja) fouten++
}

const map = fixtureKaart()
const kal = fixtureKalender()
const week: Dagrooster[] = Array.from({ length: 7 }, (_, i) => ({ dag: i + 1, kaarten: [kaartDag(map, kal, [LIJN], ANKER, i + 1)] }))
const b0: Bedrijf = fixtureBedrijf()

const A1 = `${MAP}|${LIJN}|799|A|1`
const B1 = `${MAP}|${LIJN}|783|B|1`
const OA = `${MAP}|${LIJN}|799|A`
const OB = `${MAP}|${LIJN}|783|B`

const kloon = <T>(x: T): T => structuredClone(x)
function plekVan(plan: DagPlan, dienst: string): { po: PlanOmloop; pd: PlanDienst } {
  for (const k of plan.kaarten) for (const po of k.omlopen) for (const pd of po.diensten) if (pd.dienst.sleutel === dienst) return { po, pd }
  throw new Error(`geen dienst ${dienst}`)
}
function omloopVan(plan: DagPlan, sleutel: string): PlanOmloop {
  for (const k of plan.kaarten) for (const po of k.omlopen) if (po.omloop.sleutel === sleutel) return po
  throw new Error(`geen omloop ${sleutel}`)
}
const optie = (o: InvulOptie[], soort: string): InvulOptie | undefined => o.find((x) => x.keuze.soort === soort)
const fout = (u: ReturnType<typeof zetInvulling>): string | undefined => ('fout' in u ? u.fout : undefined)
const bedrijfVan = (u: ReturnType<typeof zetInvulling>): Bedrijf => {
  if ('fout' in u) throw new Error(`fout ${u.fout}`)
  return u.bedrijf
}

const basis = dagplan(b0, week, 1)

/* ---- een dienst van 7,1 u werk en 5,5 rituren (ontwerp §2.2) ---- */
{
  const plan = kloon(basis)
  const { pd } = plekVan(plan, A1)
  pd.dienst.minuten = 426
  pd.dienst.tot = pd.dienst.van + 426
  pd.dienst.rituren = 5.5
  const doel: InvulDoel = { soort: 'dienst', dienst: A1 }
  const o = invulOpties(b0, plan, doel)
  const collega = o.filter((x) => x.keuze.soort === 'collega')
  const onder = optie(o, 'onderaannemer')!
  const uitzend = optie(o, 'uitzend')!
  const liggen = optie(o, 'liggen')!
  const spoed = chauffeurKosten('uitzend', 426, { inhuur: 1 }, true)
  klopt('een vrije collega kost niets (geen overuren)', collega.length > 0 && collega[0].kosten === 0, collega.map((c) => c.kosten))
  klopt('uitbesteden kost € 269,80', onder.kosten === 269_80, onder.kosten)
  klopt('uitzendkracht kost € 444,70', uitzend.kosten === 444_70, uitzend.kosten)
  klopt('uitzendkracht met spoedtoeslag kost € 533,64', spoed === 533_64, spoed)
  klopt(
    'laten liggen: € 583 gemiste vergoeding + € 330 boete = € 913, reputatie −1',
    Math.abs((liggen.gemist ?? 0) - 583_00) <= 1 && liggen.boete === 330_00 && liggen.reputatie === 1,
    liggen
  )
  klopt(
    'rangorde: collega < uitbesteden < uitzend < uitzend met toeslag < liggen',
    collega[0].kosten < onder.kosten && onder.kosten < uitzend.kosten && uitzend.kosten < spoed && spoed < liggen.kosten,
    [collega[0].kosten, onder.kosten, uitzend.kosten, spoed, liggen.kosten]
  )
  klopt('standaard is de goedkoopste die geen liggen is (de collega)', o.filter((x) => x.standaard).length === 1 && o.find((x) => x.standaard)?.keuze.soort === 'collega')
  klopt('een collega op de gelede bus: eerst wie bevoegd is', collega[0].let !== 'bevoegd' && collega.some((c) => c.let === 'bevoegd') && collega[collega.length - 1].let === 'bevoegd')
  klopt('de zieke chauffeur (4) staat er niet tussen', !collega.some((c) => (c.keuze as { id: number }).id === 4))
  klopt('alle bedragen in hele centen', o.every((x) => Number.isInteger(x.kosten) && (x.gemist === undefined || Number.isInteger(x.gemist))))
}

/* ---- plotse uitval: uitbesteden mag niet ---- */
const plots = kloon(basis)
{
  const { pd } = plekVan(plots, A1)
  pd.plots = true
  pd.stand = { wie: { soort: 'uitzend' }, bron: 'centrale', reden: 'ziek', toeslag: true, kosten: chauffeurKosten('uitzend', pd.dienst.minuten, { inhuur: 1 }, true) }
  plots.uitzend.gebruikt = 1
  const doel: InvulDoel = { soort: 'dienst', dienst: A1 }
  const o = invulOpties(b0, plots, doel)
  klopt('uitbesteden bij plotse uitval: niet beschikbaar, reden kort', optie(o, 'onderaannemer')?.beschikbaar === false && optie(o, 'onderaannemer')?.reden === 'kort')
  klopt('zetInvulling uitbesteden bij plotse uitval geeft kort', fout(zetInvulling(b0, plots, doel, { soort: 'onderaannemer' })) === 'kort')
  klopt('de uitzendkracht van de centrale op dit gat telt niet tegen jezelf: zelf kiezen mag', optie(o, 'uitzend')?.beschikbaar === true)
  klopt('wat de centrale doet kost de uitzend met toeslag', huidigeKosten(b0, plots, doel) === pd.stand.kosten)
  const rijen = openRijen(b0, plots)
  klopt('openRijen: het plotse gat staat bovenaan, de rest is uitbesteed', rijen.rijen[0]?.doel.soort === 'dienst' && rijen.rijen[0].gat.plots && rijen.uitbesteed.length === 2, rijen.rijen.map((r) => r.doel))
}

/* ---- een collega die overlapt ---- */
{
  const plan = kloon(basis)
  const { pd } = plekVan(plan, B1)
  pd.stand = { wie: { soort: 'eigen', id: 2 }, bron: 'rooster', kosten: 0 }
  pd.roosterId = 2
  const doel: InvulDoel = { soort: 'dienst', dienst: A1 }
  klopt('een collega met overlap geeft bezet', fout(zetInvulling(b0, plan, doel, { soort: 'collega', id: 2 })) === 'bezet')
  klopt('en staat niet bij de opties', !invulOpties(b0, plan, doel).some((x) => x.keuze.soort === 'collega' && x.keuze.id === 2))
  klopt('een collega zonder overlap mag', fout(zetInvulling(b0, plan, doel, { soort: 'collega', id: 3 })) === undefined)
  klopt('de zieke collega bestaat vandaag niet als invaller (weg)', fout(zetInvulling(b0, plan, doel, { soort: 'collega', id: 4 })) === 'weg')
  klopt('een monteur is geen collega (weg)', fout(zetInvulling(b0, plan, doel, { soort: 'collega', id: 6 })) === 'weg')
}

/* ---- uitzendkrachten, bezig, gereden, null ---- */
{
  const doelA: InvulDoel = { soort: 'dienst', dienst: A1 }
  const doelB: InvulDoel = { soort: 'dienst', dienst: B1 }
  const b1 = bedrijfVan(zetInvulling(b0, basis, doelA, { soort: 'uitzend' }))
  klopt('de invulling komt in vandaag (aangemaakt voor dag 1)', b1.vandaag?.dag === 1 && b1.vandaag.invulling[A1]?.soort === 'uitzend')
  klopt('het tweede uitzendverzoek bij max 1 geeft vol', fout(zetInvulling(b1, dagplan(b1, week, 1), doelB, { soort: 'uitzend' })) === 'vol')
  klopt('hetzelfde gat opnieuw op uitzend mag wel', fout(zetInvulling(b1, dagplan(b1, week, 1), doelA, { soort: 'uitzend' })) === undefined)
  const b2 = bedrijfVan(zetInvulling(b1, dagplan(b1, week, 1), doelA, null))
  klopt('null wist de invulling: de centrale beslist weer', b2.vandaag !== undefined && !(A1 in b2.vandaag.invulling))
  const lopend: LopendeRit = { dienst: A1, dag: 1, van: 290, tot: 835, ritten: [], omloopNr: 'A', deel: 1, delen: 2, lijn: '1' }
  klopt('de dienst die je zelf rijdt geeft bezig', fout(zetInvulling(b0, basis, doelA, { soort: 'liggen' }, lopend)) === 'bezig')
  klopt('ook de bus van die omloop: bezig', fout(zetInvulling(b0, basis, { soort: 'omloop', omloop: OA }, { soort: 'huur' }, lopend)) === 'bezig')
  const gereden: Bedrijf = {
    ...b0,
    vandaag: { dag: 1, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: { [A1]: { van: 290, tot: 500, werkMinuten: 210, rituren: 3, deel: 1 } } }
  }
  klopt('een dienst die je al reed geeft gereden', fout(zetInvulling(gereden, basis, doelA, { soort: 'uitzend' })) === 'gereden')
  klopt('niet vandaag geeft dag', fout(zetInvulling(b0, dagplan(b0, week, 2), doelA, { soort: 'uitzend' })) === 'dag')
  klopt('een dienst die er niet is geeft weg', fout(zetInvulling(b0, basis, { soort: 'dienst', dienst: `${MAP}|${LIJN}|799|Z|1` }, { soort: 'uitzend' })) === 'weg')
  const terug = { ...kloon(basis), terugval: [{ mapFolder: 'Elders', lineFile: 'X' }] }
  klopt('een dienst op een kaart die ontbreekt geeft kaart', fout(zetInvulling(b0, terug, { soort: 'dienst', dienst: 'Elders|X|799|A|1' }, { soort: 'uitzend' })) === 'kaart')
  klopt('een stuk zonder te-laat-stuk geeft weg', fout(zetInvulling(b0, basis, { soort: 'stuk', dienst: A1 }, { soort: 'uitzend' })) === 'weg')
  klopt('een buskeuze voor een dienst geeft weg', fout(zetInvulling(b0, basis, doelA, { soort: 'huur' })) === 'weg')
}

/* ---- te laat: het stuk ---- */
{
  const plan = kloon(basis)
  const { pd } = plekVan(plan, A1)
  const stukTot = pd.dienst.ritten.find((r) => r.vertrek >= pd.dienst.van + 40)?.vertrek ?? pd.dienst.van + 40
  const stukRit = pd.dienst.ritten.filter((r) => r.telt && r.aankomst <= stukTot).reduce((s, r) => s + (r.aankomst - r.vertrek) / 60, 0)
  pd.roosterId = 3
  pd.stand = { wie: { soort: 'eigen', id: 3 }, bron: 'rooster', kosten: 0 }
  pd.stuk = {
    van: pd.dienst.van,
    tot: stukTot,
    minuten: stukTot - pd.dienst.van,
    rituren: stukRit,
    stand: { wie: { soort: 'liggen' }, bron: 'centrale', reden: 'telaat', kosten: 0 }
  }
  const b = { ...b0, vandaag: { dag: 1, uitval: [{ id: '1|telaat|3', soort: 'telaat' as const, medewerker: 3, minuten: 40 }], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} } }
  const doel: InvulDoel = { soort: 'stuk', dienst: A1 }
  const gat = gatVan(b, plan, doel)!
  klopt('het stuk is plots en zo lang als het te-laat-stuk', gat.plots && gat.minuten === stukTot - pd.dienst.van)
  klopt('de dienst na het stuk begint aan het eind van het stuk', gatVan(b, plan, { soort: 'dienst', dienst: A1 })?.van === stukTot)
  klopt('de laatkomer zelf kan zijn stuk niet rijden (bezet)', fout(zetInvulling(b, plan, doel, { soort: 'collega', id: 3 })) === 'bezet')
  klopt('uitbesteden van het stuk: kort', fout(zetInvulling(b, plan, doel, { soort: 'onderaannemer' })) === 'kort')
  const b2 = bedrijfVan(zetInvulling(b, plan, doel, { soort: 'collega', id: 5 }))
  klopt('een collega op het stuk komt in stukInvulling', b2.vandaag?.stukInvulling[A1]?.soort === 'collega' && !(A1 in (b2.vandaag?.invulling ?? {})))
  const rijen = openRijen(b, plan).rijen
  klopt('het stuk staat in de open rijen, met de minuten te laat', rijen.some((r) => r.doel.soort === 'stuk' && r.reden === 'telaat' && r.laatMinuten === 40))
}

/* ---- de bus ---- */
{
  const plan = kloon(basis)
  const pa = omloopVan(plan, OA)
  pa.roosterBus = 101
  pa.bus = { wie: { soort: 'liggen' }, bron: 'centrale', reden: 'pech', kosten: 0 }
  const pb = omloopVan(plan, OB)
  pb.roosterBus = 102
  pb.bus = { wie: { soort: 'eigen', nummer: 102 }, bron: 'rooster', kosten: 33_00 }
  const b = { ...b0, vandaag: { dag: 1, uitval: [{ id: '1|pech|101', soort: 'pech' as const, bus: 101 }], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} } }
  const doel: InvulDoel = { soort: 'omloop', omloop: OA }
  const o = invulOpties(b, plan, doel)
  const eigen = o.filter((x) => x.keuze.soort === 'eigen').map((x) => (x.keuze as { nummer: number }).nummer)
  klopt('geen eigen bus vrij: 101 heeft pech, 102 rijdt B (overlap), 103 in de werkplaats', eigen.length === 0, eigen)
  klopt('de huurbus kost 100 + 62 per rituur', optie(o, 'huur')?.kosten === Math.round(100_00 + pa.omloop.rituren * 62_00))
  klopt('de omloop laten uitvallen kost vergoeding en boete min de chauffeurs', (optie(o, 'liggen')?.kosten ?? 0) > 0 && optie(o, 'liggen')?.reputatie !== undefined)
  klopt('zetInvulling eigen bus 102 (overlapt B) geeft bezet', fout(zetInvulling(b, plan, doel, { soort: 'eigen', nummer: 102 })) === 'bezet')
  klopt('zetInvulling eigen bus 103 (werkplaats) geeft weg', fout(zetInvulling(b, plan, doel, { soort: 'eigen', nummer: 103 })) === 'weg')
  klopt('zetInvulling eigen bus 101 (pech) geeft weg', fout(zetInvulling(b, plan, doel, { soort: 'eigen', nummer: 101 })) === 'weg')
  const b2 = bedrijfVan(zetInvulling(b, plan, doel, { soort: 'huur' }))
  klopt('de huurbus komt in busInvulling', b2.vandaag?.busInvulling[OA]?.soort === 'huur')
  klopt('een dienstkeuze voor een bus geeft weg', fout(zetInvulling(b, plan, doel, { soort: 'uitzend' })) === 'weg')
  // Zonder B op 102 is 102 wel vrij.
  pb.bus = { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: 16_000 }
  const o2 = invulOpties(b, plan, doel)
  klopt('zonder overlap is bus 102 een optie, met de waarschuwing andere vorm (A is geleed)', o2.some((x) => x.keuze.soort === 'eigen' && x.keuze.nummer === 102 && x.let === 'vorm'))
  klopt('de busrij staat in de open rijen met reden pech', openRijen(b, plan).rijen.some((r) => r.doel.soort === 'omloop' && r.reden === 'pech' && r.bus === 101))
}

/* ---- de centrale ---- */
{
  const leeg = (): CentraleContext => ({ vrijeChauffeurs: [1, 2, 3, 5], vrijeBussen: [101, 102, 103], werk: {}, busBezet: {}, uitzend: { gebruikt: 0, max: 1 } })
  const gat: Gat = { doel: { soort: 'dienst', dienst: A1 }, van: 290, tot: 835, minuten: 545, rituren: 7.5, plots: true, vorm: 'geleed' }
  const blok = (van: number, tot: number, s = 'x'): Blok => ({ sleutel: s, van, tot, vanHalte: '', totHalte: '' })
  const k1 = kiesAutomatisch(b0, leeg(), gat)
  const k2 = kiesAutomatisch(b0, leeg(), gat)
  klopt('deterministisch', JSON.stringify(k1) === JSON.stringify(k2))
  klopt('eerst een bevoegde collega met het minste werk (2: ervaring 30, nog niets)', k1.keuze.soort === 'collega' && k1.keuze.id === 2 && !k1.toeslag, k1)
  const ctx = leeg()
  ctx.werk = { 2: [blok(900, 950)], 3: [blok(1000, 1020)], 5: [blok(300, 400)] }
  const k3 = kiesAutomatisch(b0, ctx, gat)
  klopt('bevoegd voor minuten: 3 (20 min) voor 2 (50 min) en 1 (onbevoegd); 5 overlapt', k3.keuze.soort === 'collega' && k3.keuze.id === 3, k3)
  const lang = leeg()
  lang.werk = { 2: [blok(900, 1000)], 3: [blok(1000, 1100)], 5: [blok(300, 400)] }
  const k5 = kiesAutomatisch(b0, lang, gat)
  klopt('wie boven 10 uur zou komen valt af: dan de onbevoegde 1', k5.keuze.soort === 'collega' && k5.keuze.id === 1, k5)
  const vol = leeg()
  vol.vrijeChauffeurs = []
  const k4 = kiesAutomatisch(b0, vol, gat)
  klopt('geen collega: uitzend met spoedtoeslag (geen Planner)', k4.keuze.soort === 'uitzend' && k4.toeslag === true, k4)
  vol.uitzend = { gebruikt: 1, max: 1 }
  klopt('geen uitzend meer: liggen', kiesAutomatisch(b0, vol, gat).keuze.soort === 'liggen')
  const nooitOnder = [leeg(), vol].every((c) => kiesAutomatisch(b0, c, gat).keuze.soort !== 'onderaannemer')
  klopt('de centrale gebruikt geen onderaannemer bij plotse uitval', nooitOnder)
  klopt('een gat dat niet plots is: onderaannemer', kiesAutomatisch(b0, leeg(), { ...gat, plots: false }).keuze.soort === 'onderaannemer')
  const busGat: Gat = { doel: { soort: 'omloop', omloop: OB }, van: 360, tot: 595, minuten: 235, rituren: 3.3, plots: true, vorm: 'solo' }
  const kb = kiesAutomatisch(b0, leeg(), busGat)
  klopt('bus: eerst een vrije eigen bus van de goede vorm (102 solo; 103 in de werkplaats)', kb.keuze.soort === 'eigen' && kb.keuze.nummer === 102, kb)
  const bezet = leeg()
  bezet.busBezet = { 101: [blok(300, 400)], 102: [blok(500, 700)] }
  const kh = kiesAutomatisch(b0, bezet, busGat)
  klopt('geen vrije bus: een huurbus met toeslag', kh.keuze.soort === 'huur' && kh.toeslag === true, kh)
}

/* ---- kosten gelijk aan de afrekening (alleen met het echte dagplan van deel A) ---- */
if (!PLAN_ACTIEF) {
  console.log('--   kosten tegen de afrekening: overgeslagen, dagplan is nog de stub van deel 0')
} else {
  // Chauffeur 4 is vandaag (dag 1) ziek geworden: zijn dienst is een plots gat.
  const b: Bedrijf = { ...b0, rooster: { bussen: {}, chauffeurs: { [A1]: 4 } } }
  const plan = dagplan(b, week, 1)
  const netto = (x: Bedrijf): number => {
    const c = afrekening(x, dagplan(x, week, 1))
    return c.vergoeding - c.kosten
  }
  const doel: InvulDoel = { soort: 'dienst', dienst: A1 }
  const o = invulOpties(b, plan, doel).filter((x) => x.beschikbaar)
  const ref = o.reduce((a, x) => (x.kosten < a.kosten ? x : a), o[0])
  const nRef = netto(bedrijfVan(zetInvulling(b, plan, doel, ref.keuze)))
  for (const x of o) {
    const n = netto(bedrijfVan(zetInvulling(b, plan, doel, x.keuze)))
    klopt(`kosten ${x.keuze.soort} = verschil in de afrekening`, Math.abs(nRef - n - (x.kosten - ref.kosten)) <= 1, { verschil: nRef - n, kosten: x.kosten - ref.kosten })
  }
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
