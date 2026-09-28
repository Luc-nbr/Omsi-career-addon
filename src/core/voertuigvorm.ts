import { vormVanNaam, type Busvorm } from './bedrijf'

/*
 * De vorm van een geïnstalleerde bus, voor de planning en de prijs.
 *
 * (Het ontwerp noemde dit bestand busvorm.ts, maar die naam is al van de
 * 3D-vorm van een bus; vandaar voertuigvorm.ts.)
 *
 * `vormVanNaam` raadt uit de naam, en dat gaat mis bij een gelede bus die
 * "SG292" heet: de app telde Lucs bus 101 als solobus. OMSI zegt het zelf: een
 * gelede bus hangt een aanhanger aan zich (`[couple_back]`). Dus:
 * - een aanhanger die geen fietsdrager is: geleed;
 * - geen aanhanger: de naam, maar nooit geleed (een map die "Gelenkbus" heet
 *   maar geen aanhanger koppelt, is een solobus);
 * - onbekend (oude cache): de naam, zoals het was.
 */
export function vormVanVoertuig(v: { naam: string; relativePath: string; aanhanger?: string }): Busvorm {
  const naarNaam = vormVanNaam(`${v.naam} ${v.relativePath}`)
  if (v.aanhanger === undefined) return naarNaam
  if (v.aanhanger && !/fahrrad|bike|velo/i.test(v.aanhanger)) return 'geleed'
  return naarNaam === 'geleed' ? 'solo' : naarNaam
}
