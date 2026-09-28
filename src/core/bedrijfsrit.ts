import type { Bedrijf } from './bedrijf'
import type { DagPlan, DienstSleutel, DienstVanDag, Gereden, LopendeRit, PlanRit, Stand } from './planTypen'
import type { Duty } from './types'

/*
 * Zelf rijden vanuit het bedrijf: een dienst uit het plan aannemen en rijden.
 *
 * DEEL 0: `voorstellen` en `besparingVanRit` zijn stubs; deel D
 * (design/ontwerpen/busbedrijf-planning.md §7) vult ze in. `rijvenster` en
 * `geredenVan` staan er al helemaal, want main en bedrijf.ts rekenen ermee.
 */

export interface RitVoorstel {
  dienst: DienstSleutel
  reden: 'open' | 'stuk' | 'uitbesteed'
  bespaart: number
  van: number
  tot: number
  lijn: string
  omloop: string
}

export function voorstellen(_b: Bedrijf, _plan: DagPlan, _max?: number): RitVoorstel[] {
  return []
}

/**
 * Het stuk van een dienst dat je rijdt: van de eerste tot de laatste gekozen
 * rit (standaard de hele dienst). De korte ritten ertussen horen erbij --
 * die rijd je ook -- maar alleen de ritten die tellen gaan naar OMSI
 * (`telt`, de sleutels die `dutyVanRitten` zoekt). Leeg als de keuze niet klopt.
 */
export function rijvenster(
  d: DienstVanDag,
  vanRit?: string,
  totRit?: string
): { van: number; tot: number; ritten: PlanRit[]; telt: string[] } | undefined {
  const tellend = d.ritten.filter((r) => r.telt)
  const eerste = vanRit ?? tellend[0]?.sleutel
  const laatste = totRit ?? tellend[tellend.length - 1]?.sleutel
  const a = d.ritten.findIndex((r) => r.sleutel === eerste && r.telt)
  const z = d.ritten.findIndex((r) => r.sleutel === laatste && r.telt)
  if (a < 0 || z < 0 || z < a) return undefined
  const ritten = d.ritten.slice(a, z + 1)
  return {
    van: ritten[0].vertrek,
    tot: Math.max(...ritten.map((r) => r.aankomst)),
    ritten,
    telt: ritten.filter((r) => r.telt).map((r) => r.sleutel)
  }
}

export function besparingVanRit(
  _b: Bedrijf,
  _plan: DagPlan,
  _dienst: DienstSleutel,
  _venster: { van: number; tot: number; ritten: PlanRit[] }
): { bespaart: number; rest?: Stand; restKosten: number } {
  return { bespaart: 0, restKosten: 0 }
}

/**
 * Wat je van een bedrijfsrit gereden hebt, naar rato van de gehaalde haltes
 * (zoals het loon): zonder telling telt hij voor vol. De rituren komen alleen
 * uit de ritten op lijnen van het bedrijf (`telt`).
 */
export function geredenVan(
  duty: Duty,
  rit: LopendeRit,
  stopsDone: number | undefined,
  telt: (lineFile: string) => boolean
): Gereden {
  const deel =
    stopsDone === undefined || !(duty.totalStops > 0) ? 1 : Math.min(1, Math.max(0, stopsDone / duty.totalStops))
  const rituren = duty.legs.filter((l) => telt(l.lineFile)).reduce((s, l) => s + l.minutes / 60, 0) * deel
  return {
    van: rit.van,
    tot: rit.tot,
    werkMinuten: deel * (rit.tot - rit.van),
    rituren,
    deel,
    ...(rit.busnummer !== undefined ? { busnummer: rit.busnummer } : {})
  }
}
