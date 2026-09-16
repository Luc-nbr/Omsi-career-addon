import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Draait OMSI op volledig scherm of in een venster?
 *
 * Dat staat nergens in `options.cfg` -- daar houdt OMSI zijn beeldinstellingen
 * bij, maar de schermmodus niet. Het staat wel in de eerste regel van zijn
 * logboek, dat het spel bij elke start opnieuw schrijft:
 *
 *     0 20:36:48 - - Information: OMSI is working in fullscreen mode
 *
 * Waarom dat ons iets aangaat: de overlay is een venster dat altijd bovenop
 * ligt. Boven een spel dat het scherm exclusief opeist, is dat de klassieke
 * aanleiding voor een verloren Direct3D-apparaat -- en dan blijft het beeld
 * zwart terwijl de 2D-vensters er gewoon overheen staan. Precies wat een
 * gebruiker meldde, met een logboek dat op "Direct3D-Device lost" eindigde.
 *
 * We lezen dus de laatste start, en zeggen het als het volledig scherm was.
 */
export type ScreenMode = 'volledig' | 'venster'

export function readScreenMode(omsiPath: string): ScreenMode | undefined {
  const file = join(omsiPath, 'logfile.txt')
  if (!existsSync(file)) return undefined
  try {
    /*
     * Het logboek groeit tot tientallen megabytes; we hoeven alleen de laatste
     * start. Vandaar van achteren naar voren zoeken, en niet het hele bestand
     * ontleden.
     */
    const tekst = readFileSync(file, 'latin1')
    const laatste = tekst.lastIndexOf('OMSI is working in ')
    if (laatste < 0) return undefined
    const regel = tekst.slice(laatste, laatste + 60).toLowerCase()
    if (regel.includes('fullscreen')) return 'volledig'
    if (regel.includes('window')) return 'venster'
    return undefined
  } catch {
    // Een logboek dat niet te lezen is, zegt niets. Dan zwijgen wij ook.
    return undefined
  }
}
