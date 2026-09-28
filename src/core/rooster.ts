import { bedrijfsfactoren, heeftConcessie, lijnnaam, type Bedrijf } from './bedrijf'
import { busKosten, chauffeurKosten, terugvalVanConcessie, TARIEF, uitzendMax, vergoeding } from './plantarief'
import type {
  ConcessieCijfers,
  Dagrooster,
  DagPlan,
  LopendeRit,
  PlanCijfers,
  PlanOmloop,
  RoosterActie,
  RoosterFout,
  Telling
} from './planTypen'

/*
 * Het rooster: welke bus en chauffeur wat rijden, en wat de dag kost.
 *
 * DEEL 0: DIT IS DE STUB. Deel A (design/ontwerpen/busbedrijf-planning.md §4)
 * vult `dagplan`, `afrekening`, `vulAan` en `pasRoosterToe` in. De stub zet
 * elke omloop en dienst op "uitbesteed": dat is wat het bedrijf doet zonder
 * rooster, en het laat de delen B-E testen tegen een echt DagPlan.
 *
 * Zolang `PLAN_ACTIEF` onwaar is, sluit main de dag nog af met de oude rekensom
 * (sluitDagAf zonder cijfers) en wordt er niet gemigreerd: met deze stub zou
 * een eigen bus of chauffeur anders niets meer opleveren. Deel A zet hem aan.
 */
export const PLAN_ACTIEF = false

const LEGE_TELLING: Telling = {
  omlopen: 0,
  eigenBus: 0,
  huurbus: 0,
  diensten: 0,
  eigen: 0,
  collega: 0,
  jij: 0,
  uitzend: 0,
  uitbesteed: 0,
  open: 0,
  uitgevallen: 0,
  rituren: 0,
  uitgevallenRituren: 0,
  werkuren: 0
}

export function dagplan(b: Bedrijf, dagen: Dagrooster[], dag: number, lopend?: LopendeRit): DagPlan {
  const f = bedrijfsfactoren(b)
  const rooster = dagen.find((d) => d.dag === dag)
  const telling = { ...LEGE_TELLING }
  const kaarten: DagPlan['kaarten'] = []
  const terugval: DagPlan['terugval'] = []
  const gezien = new Set<string>()
  for (const kaart of rooster?.kaarten ?? []) {
    if (kaart.fout) continue
    const omlopen: PlanOmloop[] = kaart.omlopen
      .filter((o) => heeftConcessie(b, o.mapFolder, o.lineFile))
      .map((omloop) => {
        gezien.add(`${omloop.mapFolder}|${omloop.lineFile.toLowerCase()}`)
        telling.omlopen += 1
        telling.rituren += omloop.rituren
        return {
          omloop,
          bus: { wie: { soort: 'onderaannemer' }, bron: 'standaard', kosten: busKosten('onderaannemer', omloop.rituren, f) },
          diensten: omloop.diensten.map((dienst) => {
            telling.diensten += 1
            telling.uitbesteed += 1
            telling.werkuren += dienst.minuten / 60
            const jij = lopend?.dienst === dienst.sleutel && lopend.dag === dag
            if (jij) telling.jij += 1
            return {
              dienst,
              stand: {
                wie: { soort: 'onderaannemer' },
                bron: 'standaard',
                kosten: chauffeurKosten('onderaannemer', dienst.minuten, f)
              },
              ...(jij ? { jij: { van: lopend!.van, tot: lopend!.tot, nu: true } } : {}),
              plots: false,
              uitgevallen: 0,
              conflicten: []
            }
          }),
          conflicten: []
        }
      })
    kaarten.push({ kaart, omlopen })
  }
  for (const c of b.concessies) {
    if (!gezien.has(`${c.mapFolder}|${c.lineFile.toLowerCase()}`)) {
      const kaart = rooster?.kaarten.find((k) => k.mapFolder === c.mapFolder)
      // Een lijn zonder omlopen vandaag (bijvoorbeeld alleen doordeweeks) is geen terugval.
      if (!kaart || kaart.fout) terugval.push({ mapFolder: c.mapFolder, lineFile: c.lineFile })
    }
  }
  return {
    dag,
    datum: rooster?.kaarten[0]?.datum,
    vandaag: dag === b.dag,
    kaarten,
    terugval,
    vrij: {
      chauffeurs: (b.personeel ?? []).filter((m) => m.rol === 'chauffeur').map((m) => m.id),
      bussen: (b.bussen ?? []).map((x) => x.nummer)
    },
    werk: {},
    uitzend: { gebruikt: 0, max: uitzendMax(b) },
    conflicten: [],
    telling
  }
}

export function afrekening(b: Bedrijf, plan: DagPlan): PlanCijfers {
  const f = bedrijfsfactoren(b)
  const perConcessie: ConcessieCijfers[] = []
  let gereden = 0
  let uitbesteedRituren = 0
  for (const { omlopen } of plan.kaarten) {
    for (const po of omlopen) {
      const o = po.omloop
      const naam = `${lijnnaam(b.concessies.find((c) => c.mapFolder === o.mapFolder && c.lineFile.toLowerCase() === o.lineFile.toLowerCase()) ?? { lineNumbers: [], lineFile: o.lineFile })} · ${o.mapFolder}`
      let c = perConcessie.find((x) => x.mapFolder === o.mapFolder && x.lineFile === o.lineFile)
      if (!c) {
        c = { mapFolder: o.mapFolder, lineFile: o.lineFile, naam, bron: 'plan', rituren: 0, uitgevallen: 0, vergoeding: 0, onderaannemer: 0 }
        perConcessie.push(c)
      }
      c.rituren += o.rituren
      c.onderaannemer += po.bus.kosten + po.diensten.reduce((s, d) => s + d.stand.kosten, 0)
      gereden += o.rituren
      uitbesteedRituren += o.rituren
    }
  }
  for (const c of perConcessie) c.vergoeding = vergoeding(c.rituren, b.reputatie, f)
  for (const t of plan.terugval) {
    const conc = b.concessies.find((c) => c.mapFolder === t.mapFolder && c.lineFile === t.lineFile)
    if (!conc) continue
    const tv = terugvalVanConcessie(conc, b.reputatie, f)
    perConcessie.push({
      mapFolder: t.mapFolder,
      lineFile: t.lineFile,
      naam: `${lijnnaam(conc)} · ${conc.mapName}`,
      bron: 'terugval',
      rituren: tv.rituren,
      uitgevallen: 0,
      vergoeding: tv.vergoeding,
      onderaannemer: tv.onderaannemer
    })
    gereden += tv.rituren
  }
  const lonen = (b.personeel ?? []).reduce((s, m) => s + m.loon, 0)
  const legacyZelf = Math.round(Math.min(b.zelfUren ?? 0, uitbesteedRituren) * TARIEF.onderChauffeurPerWerkuur * f.inhuur)
  const onderaannemer = perConcessie.reduce((s, c) => s + c.onderaannemer, 0)
  return {
    perConcessie,
    vergoeding: perConcessie.reduce((s, c) => s + c.vergoeding, 0),
    onderaannemer,
    eigenBus: 0,
    uitzend: { diensten: 0, kosten: 0 },
    huurbus: { omlopen: 0, kosten: 0 },
    overuren: { minuten: 0, kosten: 0 },
    lonen,
    uitgevallen: { rituren: 0, ritten: 0, boete: 0, reputatie: 0 },
    legacyZelf,
    kosten: onderaannemer + lonen,
    gereden,
    werkend: [],
    overwerkt: [],
    eigenAandeel: 0,
    busUren: {},
    omlopen: plan.telling.omlopen,
    eigenOmlopen: 0,
    diensten: plan.telling.diensten,
    eigenDiensten: 0,
    jijDiensten: plan.telling.jij,
    openDiensten: 0,
    uitbesteed: plan.telling.uitbesteed
  }
}

export function vulAan(
  b: Bedrijf,
  _dagen: Dagrooster[],
  _dag: number,
  _bereik: 'dag' | 'week'
): { bedrijf: Bedrijf; bussen: number; diensten: number } {
  return { bedrijf: b, bussen: 0, diensten: 0 }
}

export function pasRoosterToe(
  b: Bedrijf,
  _dagen: Dagrooster[],
  _actie: RoosterActie,
  _lopend?: LopendeRit
): { bedrijf: Bedrijf; melding?: { bussen: number; diensten: number } } | { fout: RoosterFout } {
  return { bedrijf: b }
}

/** Hoeveel minuten deze medewerker vandaag werkt volgens het plan. */
export function minutenVan(plan: DagPlan, id: number): number {
  return plan.werk[id]?.minuten ?? 0
}
