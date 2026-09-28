import { REGELS, type Busvorm } from './bedrijf'
import type { DienstVanDag } from './planTypen'

/*
 * De werktijdregels van het rooster: wat mag, wat een waarschuwing is.
 *
 * Een dienst van hoogstens 9,5 uur (`dienstMax`, bij het knippen), een
 * werkdag van hoogstens 10 uur (harde grens), overuren boven 8 uur. Rust
 * tussen twee diensten, nachtrust tegenover de dag ervoor en erna, een krappe
 * overstap naar een andere halte en weinig ervaring op een gelede bus zijn
 * waarschuwingen en geen verbod (ontwerp §13.4). De getallen staan in
 * `REGELS.planning` (bedrijf.ts).
 */

const P = REGELS.planning
export const PLAN = {
  rust: P.rust,
  nachtrust: P.nachtrust,
  overstap: P.overstap,
  dagDoel: P.dagDoel,
  dagMax: P.dagMax,
  busMarge: P.busMarge,
  ervaringGeleed: P.ervaringGeleed
} as const

/** Een stuk werk van één chauffeur of bus: een dienst, of een venster eruit. */
export interface Blok {
  sleutel: string
  van: number
  tot: number
  vanHalte: string
  totHalte: string
}

export function blokVan(d: DienstVanDag, venster?: { van: number; tot: number }): Blok {
  const ritten = venster ? d.ritten.filter((r) => r.vertrek >= venster.van && r.aankomst <= venster.tot) : d.ritten
  const eerste = ritten[0] ?? d.ritten[0]
  const laatste = ritten[ritten.length - 1] ?? d.ritten[d.ritten.length - 1]
  return {
    sleutel: d.sleutel,
    van: venster?.van ?? d.van,
    tot: venster?.tot ?? d.tot,
    vanHalte: eerste?.van ?? '',
    totHalte: laatste?.naar ?? ''
  }
}

export function overlapt(a: { van: number; tot: number }, b: { van: number; tot: number }, marge = 0): boolean {
  return a.van < b.tot + marge && b.van < a.tot + marge
}

export function werkMinuten(blokken: Blok[]): number {
  return blokken.reduce((som, b) => som + (b.tot - b.van), 0)
}

/**
 * Past `nieuw` bij wat deze chauffeur al rijdt?
 *
 * - `dubbel`: de sleutel van een blok dat overlapt;
 * - `teLang`: de werkdag komt boven `dagMax`;
 * - `rust`: de kortste pauze tussen `nieuw` en een buurblok;
 * - `overstap`: die pauze, als hij korter is dan `overstap` en de haltes verschillen;
 * - `overuren`: minuten boven `dagDoel`;
 * - `nachtrust`: de kortste rust tegenover de dag ervoor of erna. `vorigeTot`
 *   is relatief aan dag − 1 (bijvoorbeeld 1491), `volgendeVan` aan dag + 1.
 */
export function toets(
  bestaand: Blok[],
  nieuw: Blok,
  buren?: { vorigeTot?: number; volgendeVan?: number }
): { dubbel?: string; teLang: boolean; rust?: number; overstap?: number; overuren: number; nachtrust?: number } {
  const anderen = bestaand.filter((b) => b.sleutel !== nieuw.sleutel)
  const dubbel = anderen.find((b) => overlapt(b, nieuw))?.sleutel
  const alle = [...anderen, nieuw].sort((a, b) => a.van - b.van)
  const werk = werkMinuten(alle)
  let rust: number | undefined
  let overstap: number | undefined
  const at = alle.indexOf(nieuw)
  const paren: Array<[Blok, Blok]> = []
  if (at > 0) paren.push([alle[at - 1], nieuw])
  if (at < alle.length - 1) paren.push([nieuw, alle[at + 1]])
  for (const [a, b] of paren) {
    const pauze = b.van - a.tot
    if (pauze < 0) continue
    rust = rust === undefined ? pauze : Math.min(rust, pauze)
    if (pauze < PLAN.overstap && a.totHalte && b.vanHalte && a.totHalte !== b.vanHalte) {
      overstap = overstap === undefined ? pauze : Math.min(overstap, pauze)
    }
  }
  const nachten: number[] = []
  if (buren?.vorigeTot !== undefined) nachten.push(1440 + alle[0].van - buren.vorigeTot)
  if (buren?.volgendeVan !== undefined) nachten.push(1440 + buren.volgendeVan - alle[alle.length - 1].tot)
  return {
    dubbel,
    teLang: werk > PLAN.dagMax,
    rust,
    overstap,
    overuren: Math.max(0, werk - PLAN.dagDoel),
    nachtrust: nachten.length > 0 ? Math.min(...nachten) : undefined
  }
}

/** Mag deze chauffeur deze bus rijden zonder waarschuwing? Geleed en dubbel vragen ervaring. */
export function bevoegd(ervaring: number, vorm?: Busvorm): boolean {
  return vorm === 'geleed' || vorm === 'dubbel' ? ervaring >= PLAN.ervaringGeleed : true
}
