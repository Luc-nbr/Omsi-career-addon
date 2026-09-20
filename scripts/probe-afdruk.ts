/**
 * Ziet de afdruk van de busmappen wat er verandert?
 *
 *   npx tsx scripts/probe-afdruk.ts
 *
 * De schijfcache van de busindex hing aan `vingerafdruk()` uit `kaartcache.ts`,
 * die naar tegelbestanden van een kaart kijkt -- in `Vehicles` bestaan die
 * niet, dus was de afdruk daar een vaste waarde en werd een nieuwe bus nooit
 * gezien. Deze proef bouwt een nepmap en kijkt of de nieuwe afdruk wel
 * meebeweegt. Raakt de OMSI-installatie niet aan.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wagenparkAfdruk } from '../src/core/hofTool'
import { vingerafdruk } from '../src/core/kaartcache'

const nep = mkdtempSync(join(tmpdir(), 'omsi-nep-'))
mkdirSync(join(nep, 'Vehicles', 'MAN_SD200'), { recursive: true })
writeFileSync(join(nep, 'Vehicles', 'MAN_SD200', 'Berlin.hof'), 'x')

const begin = wagenparkAfdruk(nep)
const oud = vingerafdruk(join(nep, 'Vehicles'))

// Een bus erbij, zoals iemand die een add-on installeert.
mkdirSync(join(nep, 'Vehicles', 'NieuweBus'))
const naBus = wagenparkAfdruk(nep)

// En een wagenpark erbij, zoals `placeHof` dat neerlegt.
writeFileSync(join(nep, 'Vehicles', 'MAN_SD200', 'Hohenkirchen.hof'), 'x')
const naHof = wagenparkAfdruk(nep)

console.log(`nieuwe afdruk ziet een bus erbij:     ${begin !== naBus}`)
console.log(`nieuwe afdruk ziet een .hof erbij:    ${naBus !== naHof}`)
console.log(`oude afdruk (die voor kaarten is):    ${oud === vingerafdruk(join(nep, 'Vehicles')) ? 'onveranderd' : 'veranderd'}`)
