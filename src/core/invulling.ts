import type { Bedrijf, Busvorm } from './bedrijf'
import type { Blok } from './planregels'
import type { BusKeuze, DagPlan, InvulDoel, InvulFout, InvulKeuze, LopendeRit } from './planTypen'

/*
 * Open diensten vullen, en de centrale die het doet als jij het niet doet.
 *
 * DEEL 0: DIT IS DE STUB. Deel C (design/ontwerpen/busbedrijf-planning.md §6)
 * vult de opties, de validatie en de keuze van de centrale in.
 */

export interface InvulOptie {
  keuze: InvulKeuze | BusKeuze
  kosten: number
  beschikbaar: boolean
  reden?: InvulFout
  reputatie?: number
  standaard?: boolean
  wie?: string
}

/** Een gat in het plan: een dienst, een te-laat-stuk of een omloop zonder bus. */
export interface Gat {
  doel: InvulDoel
  van: number
  tot: number
  minuten: number
  rituren: number
  plots: boolean
  vorm?: Busvorm
}

/** Wat de centrale weet als hij een gat vult. */
export interface CentraleContext {
  vrijeChauffeurs: number[]
  vrijeBussen: number[]
  werk: Record<number, Blok[]>
  busBezet: Record<number, Blok[]>
  uitzend: { gebruikt: number; max: number }
}

export function invulOpties(_b: Bedrijf, _plan: DagPlan, _doel: InvulDoel): InvulOptie[] {
  return []
}

export function zetInvulling(
  b: Bedrijf,
  _plan: DagPlan,
  _doel: InvulDoel,
  _keuze: InvulKeuze | BusKeuze | null,
  _lopend?: LopendeRit
): { bedrijf: Bedrijf } | { fout: InvulFout } {
  return { bedrijf: b }
}

export function kiesAutomatisch(
  _b: Bedrijf,
  _ctx: CentraleContext,
  _gat: Gat
): { keuze: InvulKeuze | BusKeuze; toeslag: boolean } {
  return { keuze: { soort: 'uitzend' }, toeslag: false }
}
