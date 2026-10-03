/**
 * De uitval van het busbedrijf, nagerekend op de kunstmatige kaart.
 *
 *   npx tsx scripts/probe-uitval.ts
 *
 * Ziek, te laat en pech (ontwerp busbedrijf-planning §5.5): dezelfde dag geeft
 * dezelfde uitval, de kansen kloppen over 2000 dagen, de trekking staat los
 * van het rooster, pech zet de bus in de werkplaats en boekt in hele centen,
 * en de berichten staan op volgorde met 'ochtend' bovenaan. Daarnaast de
 * gevolgen in het plan en wat de centrale kost. Puur: geen OMSI, geen
 * bestanden (behalve core/uitval.ts zelf lezen).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isInzetbaar, type Bedrijf, type EigenBus, type Medewerker } from '../src/core/bedrijf'
import { kaartDag } from '../src/core/bedrijfsplan'
import { beginDag } from '../src/core/bedrijfsdag'
import { boete, chauffeurKosten, busKosten, reputatieVerlies, vergoeding } from '../src/core/plantarief'
import type { DagPlan, Dagrooster } from '../src/core/planTypen'
import { dagplan } from '../src/core/rooster'
import {
  UITVAL,
  centraleGaten,
  centraleSom,
  gevolgenVan,
  meldUitval,
  pechKans,
  stilVan,
  telaatStuk,
  uitvalVan,
  uitvalVoorDag
} from '../src/core/uitval'
import { ANKER, LIJN, MAP, fixtureBedrijf, fixtureKaart, fixtureKalender } from './fixtures/planfixture'

let fouten = 0
function klopt(wat: string, ja: boolean, uitleg?: string): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}${uitleg ? ` (${uitleg})` : ''}`)
  if (!ja) fouten++
}

const map = fixtureKaart()
const kal = fixtureKalender()
const roosterVan = (dag: number): Dagrooster => ({ dag, kaarten: [kaartDag(map, kal, [LIJN], ANKER, dag)] })
function opDag(b: Bedrijf, dag: number): Bedrijf {
  return { ...b, dag, vandaag: undefined }
}

// ---- dezelfde invoer, dezelfde uitval ----
{
  // Zoek een dag met zowel te laat als pech, zodat er iets te vergelijken is.
  let dag = 2
  let uit = uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])
  while (dag < 3000 && !(uitvalVan(uit).some((u) => u.soort === 'telaat') && uitvalVan(uit).some((u) => u.soort === 'pech'))) {
    dag++
    uit = uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])
  }
  klopt('er is een dag met te laat én pech', dag < 3000, `dag ${dag}`)
  const b = opDag(fixtureBedrijf(), dag)
  const nogEens = uitvalVoorDag(b, [])
  const naJson = uitvalVoorDag(JSON.parse(JSON.stringify(b)) as Bedrijf, [])
  const zelfde = (x: Bedrijf, y: Bedrijf): boolean =>
    JSON.stringify([x.vandaag, x.kas, x.bussen, x.boekingen]) === JSON.stringify([y.vandaag, y.kas, y.bussen, y.boekingen])
  klopt('dezelfde dag geeft dezelfde uitval', zelfde(uit, nogEens))
  klopt('ook na JSON heen en terug (een herstart)', zelfde(uit, naJson))
  const tweede = uitvalVoorDag(uit, [])
  klopt('een tweede trekking op dezelfde dag verandert niets (geen dubbele boeking)', zelfde(uit, tweede) && tweede.kas === uit.kas)
  klopt('elke uitval-id begint met de dag', uitvalVan(uit).every((u) => u.id.startsWith(`${dag}|${u.soort}|`)))
  const telaat = uitvalVan(uit).filter((u) => u.soort === 'telaat')
  klopt(
    'te laat: 20 tot 60 minuten in stappen van 10',
    telaat.every((u) => u.minuten !== undefined && u.minuten >= 20 && u.minuten <= 60 && u.minuten % 10 === 0)
  )
}

// ---- ziek ----
{
  const b = fixtureBedrijf() // chauffeur 4: ziekTot 2, ziekSinds 1
  const dag1 = uitvalVan(uitvalVoorDag(opDag(b, 1), []))
  const dag2 = uitvalVan(uitvalVoorDag(opDag(b, 2), []))
  klopt('ziek op de eerste dag is uitval', dag1.some((u) => u.soort === 'ziek' && u.medewerker === 4))
  klopt('ziek vanaf de tweede dag niet meer (vooraf bekend)', !dag2.some((u) => u.soort === 'ziek'))
  klopt('wie ziek is, komt niet ook te laat', !dag1.some((u) => u.soort === 'telaat' && u.medewerker === 4))
}

// ---- de kansen over 2000 dagen ----
{
  const DAGEN = 2000
  const mens = (id: number, tevredenheid: number): Medewerker => ({
    id,
    naam: `M${id}`,
    rol: 'chauffeur',
    ervaring: 50,
    loon: 230_00,
    tevredenheid,
    sinds: 1
  })
  const tevreden = Array.from({ length: 20 }, (_, i) => mens(i + 1, 60))
  const ontevreden = Array.from({ length: 20 }, (_, i) => mens(i + 101, 40))
  let raakT = 0
  let raakO = 0
  for (let dag = 1; dag <= DAGEN; dag++) {
    const b: Bedrijf = { ...fixtureBedrijf(), dag, bussen: [], personeel: [...tevreden, ...ontevreden] }
    for (const u of uitvalVan(uitvalVoorDag(b, []))) {
      if (u.soort !== 'telaat') continue
      if ((u.medewerker ?? 0) > 100) raakO++
      else raakT++
    }
  }
  const pT = raakT / (DAGEN * 20)
  const pO = raakO / (DAGEN * 20)
  klopt('te laat ongeveer 3 % per chauffeur-dag', Math.abs(pT - 0.03) < 0.004, `${(pT * 100).toFixed(2)} %`)
  klopt('te laat ongeveer 5 % bij tevredenheid onder 50', Math.abs(pO - 0.05) < 0.005, `${(pO * 100).toFixed(2)} %`)

  const bus = (nummer: number, staat: number): EigenBus => ({
    nummer,
    relativePath: `Vehicles\\B${nummer}\\b.bus`,
    naam: `B${nummer}`,
    vorm: 'solo',
    aankoop: 60_000_00,
    gekochtOp: 1,
    km: 0,
    staat,
    schade: 0
  })
  const goed = Array.from({ length: 20 }, (_, i) => bus(i + 1, 90))
  const slecht = Array.from({ length: 20 }, (_, i) => bus(i + 101, 25))
  const telPech = (monteurs: number): { goed: number; slecht: number } => {
    let g = 0
    let s = 0
    const personeel: Medewerker[] = Array.from({ length: monteurs }, (_, i) => ({ ...mens(900 + i, 60), rol: 'monteur' }))
    for (let dag = 1; dag <= DAGEN; dag++) {
      const b: Bedrijf = { ...fixtureBedrijf(), dag, bussen: [...goed, ...slecht], personeel }
      for (const u of uitvalVan(uitvalVoorDag(b, []))) {
        if (u.soort !== 'pech') continue
        if ((u.bus ?? 0) > 100) s++
        else g++
      }
    }
    return { goed: g / (DAGEN * 20), slecht: s / (DAGEN * 20) }
  }
  const zonder = telPech(0)
  klopt('pechkans bij staat 90 is 1 %', Math.abs(pechKans(goed[0], 0) - 0.01) < 1e-9)
  klopt('pech ongeveer 1 % bij staat ≥ 70', Math.abs(zonder.goed - 0.01) < 0.003, `${(zonder.goed * 100).toFixed(2)} %`)
  const verwacht25 = pechKans(slecht[0], 0)
  klopt(
    'pech bij staat 25 volgens de formule (0,01 + 45/70 × 0,06 ≈ 4,9 %)',
    Math.abs(zonder.slecht - verwacht25) < 0.007,
    `${(zonder.slecht * 100).toFixed(2)} % tegen ${(verwacht25 * 100).toFixed(2)} %`
  )
  const twee = telPech(2)
  klopt('twee monteurs remmen de pech met 20 %', Math.abs(pechKans(slecht[0], 2) - verwacht25 * 0.8) < 1e-9)
  klopt('… en dat zie je terug', Math.abs(twee.slecht - verwacht25 * 0.8) < 0.007, `${(twee.slecht * 100).toFixed(2)} %`)
  klopt('vijf monteurs remmen niet meer dan 40 %', Math.abs(pechKans(slecht[0], 5) - verwacht25 * 0.6) < 1e-9)
}

// ---- los van het rooster ----
{
  const dagen = [roosterVan(1)]
  const diensten = dagen[0].kaarten[0].omlopen.flatMap((o) => o.diensten)
  // Zoek een dag waarop iemand te laat is; zonder rooster.
  let dag = 1
  const met = (b: Bedrijf): Bedrijf => ({
    ...b,
    rooster: {
      bussen: Object.fromEntries(dagen[0].kaarten[0].omlopen.map((o, i) => [o.sleutel, 101 + (i % 2)])),
      chauffeurs: Object.fromEntries(diensten.map((d, i) => [d.sleutel, 1 + (i % 5)]))
    }
  })
  while (dag < 3000 && uitvalVan(uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])).length === 0) dag++
  const zonderRooster = uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])
  const metRooster = uitvalVoorDag(met(opDag(fixtureBedrijf(), dag)), [])
  klopt('zonder rooster is er ook uitval', uitvalVan(zonderRooster).length > 0, `dag ${dag}: ${uitvalVan(zonderRooster).map((u) => u.id).join(', ')}`)
  klopt(
    'een rooster dat later gevuld wordt, verandert de trekking niet',
    JSON.stringify(uitvalVan(zonderRooster)) === JSON.stringify(uitvalVan(metRooster))
  )
}

// ---- pech: werkplaats, geen schade, een boeking in hele centen ----
{
  let dag = 1
  let uit = uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])
  while (dag < 5000 && !uitvalVan(uit).some((u) => u.soort === 'pech')) {
    dag++
    uit = uitvalVoorDag(opDag(fixtureBedrijf(), dag), [])
  }
  const voor = opDag(fixtureBedrijf(), dag)
  const pech = uitvalVan(uit).filter((u) => u.soort === 'pech')
  klopt('er is een dag met pech', pech.length > 0, `dag ${dag}`)
  for (const p of pech) {
    const was = voor.bussen!.find((x) => x.nummer === p.bus)!
    const nu = uit.bussen!.find((x) => x.nummer === p.bus)!
    klopt(`bus ${p.bus}: was inzetbaar, nu niet`, isInzetbaar(was, dag) && !isInzetbaar(nu, dag))
    klopt(`bus ${p.bus}: werkplaats tot vandaag, morgen weer inzetbaar`, nu.werkplaatsTot === dag && isInzetbaar(nu, dag + 1))
    klopt(`bus ${p.bus}: geen schade, staat gelijk`, nu.schade === was.schade && nu.staat === was.staat)
    klopt(
      `bus ${p.bus}: kosten € 200–600 in hele centen`,
      Number.isInteger(p.kosten) && (p.kosten ?? 0) >= UITVAL.pechKosten[0] && (p.kosten ?? 0) <= UITVAL.pechKosten[1],
      `${p.kosten}`
    )
  }
  const geboekt = uit.boekingen.filter((x) => x.dag === dag && x.soort === 'pech')
  const totaal = pech.reduce((s, p) => s + (p.kosten ?? 0), 0)
  klopt('een boeking "pech" per bus', geboekt.length === pech.length)
  klopt('de boekingen zijn hele centen en negatief', geboekt.every((x) => Number.isInteger(x.bedrag) && x.bedrag < 0))
  klopt('de kas gaat er precies af', uit.kas === voor.kas - totaal)
  let inWerkplaats = 0
  for (let d = 1; d <= 2000; d++) {
    const b = opDag(fixtureBedrijf(), d)
    const w = { ...b, bussen: b.bussen!.map((x) => ({ ...x, staat: 25, werkplaatsTot: 9999 })) }
    inWerkplaats += uitvalVan(uitvalVoorDag(w, [])).filter((u) => u.soort === 'pech').length
  }
  klopt('een bus in de werkplaats krijgt geen pech (2000 dagen)', inWerkplaats === 0)
}

// ---- geen toevalsgenerator ----
{
  const bron = readFileSync(join(__dirname, '..', 'src', 'core', 'uitval.ts'), 'utf8')
  klopt('core/uitval.ts gebruikt geen Math.random', !bron.includes(['Math', 'random'].join('.')))
}

// ---- gevolgen in het plan, en de berichten ----
{
  // Een rooster waarin elke chauffeur een dienst heeft, en een dag met te laat en pech.
  const kaart = roosterVan(1).kaarten[0]
  const omlopen = kaart.omlopen
  const diensten = omlopen.flatMap((o) => o.diensten)
  const metRooster = (b: Bedrijf): Bedrijf => ({
    ...b,
    rooster: {
      bussen: Object.fromEntries(omlopen.map((o, i) => [o.sleutel, [101, 102][i % 2]])),
      chauffeurs: Object.fromEntries(diensten.map((d, i) => [d.sleutel, [1, 2, 3, 5][i % 4]]))
    }
  })
  // Alleen werkdagen met hetzelfde masker als dag 1 (ma–do), zodat het rooster past.
  let dag = 1
  const goedeDag = (d: number): boolean => {
    const u = uitvalVan(uitvalVoorDag(metRooster(opDag(fixtureBedrijf(), d)), []))
    const wd = (d - 1) % 7
    return wd < 4 && d !== 11 && u.some((x) => x.soort === 'telaat' && x.medewerker !== 4) && u.some((x) => x.soort === 'pech' && (x.bus === 101 || x.bus === 102))
  }
  while (dag < 20000 && !goedeDag(dag)) dag++
  klopt('er is een werkdag met te laat en pech op een ingedeelde bus', dag < 20000, `dag ${dag}`)
  const dagen = [roosterVan(dag)]
  const b = uitvalVoorDag(metRooster(opDag(fixtureBedrijf(), dag)), dagen)
  const plan = dagplan(b, dagen, dag)
  const gevolgen = gevolgenVan(b, plan)
  const tl = gevolgen.find((g) => g.uitval.soort === 'telaat')!
  const pc = gevolgen.find((g) => g.uitval.soort === 'pech')!
  klopt('te laat raakt zijn eerste dienst', tl.plekken.length === 1 && tl.plekken[0].soort !== 'omloop')
  if (tl.plekken[0] && tl.plekken[0].soort !== 'omloop') {
    const d = tl.plekken[0].dienst.dienst
    const eerste = diensten
      .filter((x) => b.rooster!.chauffeurs[x.sleutel] === tl.uitval.medewerker)
      .sort((x, y) => x.van - y.van)[0]
    klopt('… en dat is echt zijn eerste van de dag', d.sleutel === eerste.sleutel)
    const stuk = telaatStuk(d, tl.uitval.minuten!)
    klopt('het stuk loopt van het begin tot de eerste rit die hij haalt', stuk.van === d.van && stuk.tot >= d.van + tl.uitval.minuten!)
  }
  klopt('pech raakt de omlopen van die bus', pc.plekken.length > 0 && pc.plekken.every((p) => p.soort === 'omloop'))

  const na = meldUitval(b, dagen)
  const nieuw = (na.post ?? []).slice(0, (na.post?.length ?? 0) - (b.post?.length ?? 0))
  klopt("'ochtend' staat bovenaan", nieuw[0]?.soort === 'ochtend', nieuw.map((x) => x.soort).join(', '))
  klopt("er is een bericht 'telaat' met de dienst", nieuw.some((x) => x.soort === 'telaat' && typeof x.v?.dienst === 'string'))
  klopt("er is een bericht 'pech' met de kosten", nieuw.some((x) => x.soort === 'pech' && typeof x.v?.kosten === 'number'))
  klopt('de ochtendmelding is voor vandaag', nieuw[0]?.v?.dag === dag && nieuw[0]?.dag === dag)
  const ochtend = nieuw[0]?.v ?? {}
  klopt('de ochtendmelding telt stilstaande eigen mensen en bussen', Number(ochtend.stil) === stilVan(b, plan).chauffeurs.length + stilVan(b, plan).bussen.length)

  // Wie te laat is zonder dienst: geen bericht.
  const zonder = uitvalVoorDag(opDag(fixtureBedrijf(), dag), dagen)
  const naZonder = meldUitval(zonder, dagen)
  klopt("te laat zonder dienst: geen bericht 'telaat'", !(naZonder.post ?? []).some((x) => x.soort === 'telaat' && x.dag === dag))
}

// ---- de centrale: wat hij vult, wat het kost, wat uitvalt ----
{
  const dag = 1
  const dagen = [roosterVan(dag)]
  const b = opDag(fixtureBedrijf(), dag)
  const stub = dagplan(b, dagen, dag)
  klopt('het stub-plan heeft omlopen', stub.kaarten.length > 0 && stub.telling.omlopen > 0)
  const f = { inhuur: 1, vergoeding: 1 }
  // Een plan zoals deel A het maakt na uitval: één dienst door de centrale met een uitzendkracht,
  // één stuk dat uitvalt, en één omloop met een huurbus.
  const plan: DagPlan = JSON.parse(JSON.stringify(stub)) as DagPlan
  const po = plan.kaarten[0].omlopen[0]
  const [d1, d2] = [po.diensten[0], po.diensten[1] ?? plan.kaarten[0].omlopen[1].diensten[0]]
  d1.plots = true
  d1.stand = { wie: { soort: 'uitzend' }, bron: 'centrale', reden: 'ziek', toeslag: true, kosten: chauffeurKosten('uitzend', d1.dienst.minuten, f, true) }
  d2.plots = true
  d2.stand = { wie: { soort: 'liggen' }, bron: 'centrale', reden: 'ziek', kosten: 0 }
  d2.uitgevallen = d2.dienst.rituren
  po.bus = { wie: { soort: 'huur' }, bron: 'centrale', reden: 'pech', toeslag: true, kosten: busKosten('huur', po.omloop.rituren, f, true) }
  const gaten = centraleGaten(plan)
  klopt('drie gaten door de centrale', gaten.length === 3, gaten.map((g) => g.soort).join(', '))
  const som = centraleSom(b, plan)
  klopt('één dienst en één omloop door de centrale gevuld', som.diensten === 1 && som.omlopen === 1)
  klopt('uitzend en huurbus apart geteld', som.uitzend.n === 1 && som.huur.n === 1)
  klopt('de kosten van de centrale zijn uitzend plus huurbus', som.kosten === d1.stand.kosten + po.bus.kosten)
  klopt('met spoedtoeslag', som.toeslag)
  const rit = d2.dienst.rituren
  klopt(
    'wat uitvalt: gemiste vergoeding plus boete, en reputatie',
    som.liggen.diensten === 1 &&
      som.liggen.verlies === vergoeding(rit, b.reputatie, f) + boete(rit) &&
      som.liggen.reputatie === reputatieVerlies(rit)
  )
  klopt('alles in hele centen', [som.kosten, som.uitzend.kosten, som.huur.kosten, som.liggen.verlies].every(Number.isInteger))
  const leeg = centraleSom(b, { ...plan, vandaag: false })
  klopt('een plan van een andere dag telt niet', leeg.diensten === 0 && leeg.kosten === 0)
}

// ---- het begin van een dag ----
{
  const dag = 3
  const dagen = [roosterVan(dag)]
  const b: Bedrijf = { ...opDag(fixtureBedrijf(), dag), rooster: { bussen: {}, chauffeurs: {} } }
  const na = beginDag(b, dagen, {}, [])
  klopt('beginDag zet een vandaag voor deze dag', na.vandaag?.dag === dag)
  klopt('beginDag trekt de uitval (gelijk aan los trekken)', JSON.stringify(uitvalVan(na)) === JSON.stringify(uitvalVan(uitvalVoorDag(b, dagen))))
  const tweede = beginDag(na, dagen, {}, [])
  klopt('beginDag twee keer boekt de pech niet dubbel', tweede.kas === na.kas)
  klopt('kaart en lijn van de fixture', dagen[0].kaarten[0].mapFolder === MAP)
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
