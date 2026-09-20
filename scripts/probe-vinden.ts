/**
 * Vindt de app de OMSI-installatie?
 *
 *   npx tsx scripts/probe-vinden.ts
 *
 * Een gebruiker kreeg "No OMSI 2 installation found" terwijl het spel er wel
 * stond. De app keek op vier vaste Steam-paden en twee losse mappen -- staat
 * Steam op een andere schijf, of is het de doosversie van Aerosoft, dan vindt
 * hij niets. Een eerdere melding liet `F:\\SteamLibrary\\steamapps\\common\\OMSI 2`
 * zien, precies zo'n geval.
 *
 * Deze proef kijkt of het zoeken werkt, hoe lang het duurt, en of een map die
 * de speler zelf aanwijst voorgaat -- ook als die onzin is.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOmsiInstall, isOmsiInstall } from '../src/core/install'

const begin = Date.now()
const gevonden = findOmsiInstall()
const duur = Date.now() - begin

console.log(gevonden ? `gevonden: ${gevonden}` : 'MISLUKT: niets gevonden')
console.log(`zoeken duurde ${duur} ms`)
if (!gevonden) process.exit(1)

// Een map die de speler aanwijst gaat voor, mits het spel er staat.
const eigen = findOmsiInstall(gevonden)
console.log(
  eigen === gevonden
    ? 'een aangewezen map wordt gebruikt'
    : `MISLUKT: aangewezen map genegeerd (${eigen})`
)

// En onzin wordt genegeerd in plaats van gevolgd.
const leeg = mkdtempSync(join(tmpdir(), 'geen-omsi-'))
const metOnzin = findOmsiInstall(leeg)
console.log(
  metOnzin === gevonden
    ? 'een lege map wordt genegeerd, het zoeken gaat gewoon door'
    : `MISLUKT: lege map gevolgd (${metOnzin})`
)
console.log(
  isOmsiInstall(leeg) ? 'MISLUKT: lege map telt als installatie' : 'een lege map is geen installatie'
)
