/**
 * Wordt elke OMSI-map geaccepteerd, hoe iemand hem ook aanwijst?
 *
 *   npx tsx scripts/probe-omsimap.ts "<pad naar OMSI 2>"
 *
 * Leest alleen. Wijst dezelfde installatie op zes manieren aan -- de map zelf,
 * mappen erin, mappen erboven -- en kijkt of `resolveOmsiFolder` er steeds
 * dezelfde installatie uit haalt. Een gebruiker die gevraagd wordt "waar staat
 * OMSI 2?" wijst namelijk van alles aan, en dat hoort geen foutmelding op te
 * leveren.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isOmsiInstall, resolveOmsiFolder } from '../src/core/install'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}
if (!isOmsiInstall(omsi)) {
  console.error(`${omsi} draagt geen Omsi.exe.`)
  process.exit(1)
}

/** Windows kent beide schuine strepen; een vergelijking hoort dat ook te doen. */
const kaal = (pad?: string): string =>
  (pad ?? '')
    .replace(/[\\/]+/g, '\\')
    .replace(/\\$/, '')
    .toLowerCase()

const gevallen: Array<[string, string]> = [
  ['de map zelf', omsi],
  ['de kaartenmap erin', join(omsi, 'maps')],
  ['de voertuigmap erin', join(omsi, 'Vehicles')],
  ['de map erboven (steamapps/common)', dirname(omsi)],
  ['twee mappen erboven (steamapps)', dirname(dirname(omsi))],
  ['drie mappen erboven (de bibliotheek)', dirname(dirname(dirname(omsi)))]
]

let goed = 0
for (const [wat, pad] of gevallen) {
  if (!existsSync(pad)) {
    console.log(`${wat.padEnd(38)} bestaat niet, overgeslagen`)
    continue
  }
  const begin = Date.now()
  const uit = resolveOmsiFolder(pad)
  const duur = Date.now() - begin
  const raak = kaal(uit.path) === kaal(omsi)
  if (raak) goed++
  console.log(
    `${wat.padEnd(38)} ${raak ? 'GEVONDEN' : 'MIS     '} via=${(uit.via ?? '-').padEnd(6)} ` +
      `${duur}ms  ${uit.path ?? ''}`
  )
}

// En iets wat het echt niet is; daar hoort niets uit te komen.
// Niet TEMP: daar staat op deze machine een uitgepakte Omsi.exe van Steam, en
// die vondst is terecht. Een map waar het spel echt niet staat is beter bewijs.
const onzin = resolveOmsiFolder('C:\\Windows\\Fonts')
console.log(`\neen map zonder OMSI: ${onzin.path ? `TEN ONRECHTE ${onzin.path}` : 'terecht niets'}`)

console.log(`\n${goed} van de gevallen kwamen op dezelfde installatie uit.`)
