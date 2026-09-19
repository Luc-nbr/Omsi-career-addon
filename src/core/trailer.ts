import { dirname, join } from 'node:path'
import { readOmsiLines } from './omsiFile'

/**
 * De aanhanger van een gelede bus.
 *
 * WAAROM DIT BESTAAT
 * Een gelede bus is in OMSI twee voertuigen: een voorwagen en een aanhanger die
 * eraan hangt. Wij zetten alleen de voorwagen in het situatiebestand, en dan
 * begin je met een halve bus -- de balg achterop en verder niets.
 *
 * Dat OMSI de aanhanger er zelf bij zou zetten, bleek niet te kloppen. In zijn
 * eigen situatie `Nur für Fortgeschrittene.osn` staan er twee voertuigen achter
 * elkaar, `MAN_GN92_main.bus` en `MAN_GN92_trail.bus`, en de tweede draagt een
 * `[coupledwith]`-blok. Zo hoort het dus.
 *
 * WAAR DE MATEN VANDAAN KOMEN
 * De voorwagen noemt in `[coupling_back]` waar zijn koppeling zit, de aanhanger
 * in `[coupling_front]` de zijne -- allebei als x, z en hoogte in het assenstelsel
 * van dat voertuig. De afstand tussen de twee oorsprongen is de som van die twee
 * z-waarden. Voor de GN92 is dat 4,331 + 4,169 = 8,5 m, en precies 8,49 m staat
 * er tussen de twee voertuigen in het bestand van OMSI zelf.
 */
export interface Trailer {
  /** Pad ten opzichte van de OMSI-map, zoals het in een .osn moet staan. */
  relativePath: string
  /** Hoeveel meter de aanhanger achter de voorwagen staat. */
  distance: number
}

/** De drie getallen van een koppelpunt: zijwaarts, vooruit, hoogte. */
function couplingOffset(lines: string[], tag: string): number | undefined {
  const at = lines.findIndex((line) => line.trim().toLowerCase() === tag)
  if (at < 0) return undefined
  const forward = Number.parseFloat((lines[at + 2] ?? '').trim())
  return Number.isFinite(forward) ? forward : undefined
}

/**
 * Wat er achter deze bus hoort te hangen, als er iets achter hoort te hangen.
 *
 * `undefined` bij een gewone bus, en ook als het aanhangerbestand niet te lezen
 * is: dan is een halve bus nog altijd beter dan een situatie die OMSI weigert.
 */
export function trailerOf(omsiPath: string, vehicleRelativePath: string): Trailer | undefined {
  let lines: string[]
  try {
    lines = readOmsiLines(join(omsiPath, vehicleRelativePath))
  } catch {
    return undefined
  }

  const at = lines.findIndex((line) => line.trim().toLowerCase() === '[couple_back]')
  if (at < 0) return undefined
  const naam = (lines[at + 1] ?? '').trim()
  if (!naam || !/\.(bus|ovh)$/i.test(naam)) return undefined

  const folder = dirname(vehicleRelativePath)
  const relativePath = join(folder, naam)

  let trailerLines: string[]
  try {
    trailerLines = readOmsiLines(join(omsiPath, relativePath))
  } catch {
    return undefined
  }

  /*
   * De z van beide koppelpunten bij elkaar. De voorwagen noteert zijn koppeling
   * achter zich (negatief), de aanhanger de zijne voor zich (positief); de
   * afstand is de som van de twee lengtes.
   */
  const achter = couplingOffset(lines, '[coupling_back]')
  const voor = couplingOffset(trailerLines, '[coupling_front]')
  if (achter === undefined || voor === undefined) return undefined

  const distance = Math.abs(achter) + Math.abs(voor)
  // Een koppeling van nul of van dertig meter is geen koppeling maar een leesfout.
  if (!(distance > 1) || distance > 25) return undefined

  return { relativePath, distance }
}
