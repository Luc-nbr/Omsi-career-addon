/**
 * Doet de kaartcache wat hij belooft?
 *
 *   npx tsx scripts/probe-kaartcache.ts [kaartmap...]
 *
 * Drie vragen, en alle drie moeten ze met ja beantwoord worden voordat dit in
 * de app mag: komt er hetzelfde uit als er in ging, is het werkelijk sneller,
 * en merkt hij het als de kaart verandert? Die laatste is de belangrijkste --
 * een cache die een gewijzigde kaart blijft serveren is erger dan geen cache.
 */
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MapGeometry } from '../src/core/geo'
import { readMapData } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { cacheGrootte, leesUitCache, schrijfInCache, vingerafdruk } from '../src/core/kaartcache'
import { listMaps, loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const gevraagd = process.argv.slice(2)
const kaarten = gevraagd.length > 0 ? gevraagd : listMaps(omsi)
const userData = mkdtempSync(join(tmpdir(), 'omsi-kaartcache-'))

console.log(
  'kaart'.padEnd(26) + 'uitlezen'.padStart(10) + 'uit cache'.padStart(11) + 'sneller'.padStart(10)
)

let mis = 0
let totaalKoud = 0
let totaalWarm = 0

for (const folder of kaarten) {
  const mapPath = join(omsi, 'maps', folder)
  const afdruk = vingerafdruk(mapPath)

  const t0 = Date.now()
  const loaded = loadMap(join(omsi, 'maps'), folder)
  if (!loaded) continue
  const ids = new Set<string>(loaded.stops.keys())
  for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
  const koud = Date.now() - t0

  schrijfInCache(userData, folder, 'tekening', afdruk, geometry)
  schrijfInCache(userData, folder, 'stroken', afdruk, lanes)

  const t1 = Date.now()
  const terug = leesUitCache<MapGeometry>(userData, folder, 'tekening', afdruk)
  const warm = Date.now() - t1

  if (!terug) {
    console.log(`${folder.padEnd(26)}${'NIETS TERUG'.padStart(31)}`)
    mis += 1
    continue
  }

  // Hetzelfde eruit als erin: haltes, wegen en de maten van de kaart.
  const gelijk =
    terug.stops.length === geometry.stops.length &&
    terug.roads.length === geometry.roads.length &&
    terug.widthM === geometry.widthM &&
    terug.heightM === geometry.heightM
  if (!gelijk) {
    console.log(`${folder.padEnd(26)}ANDERS TERUG`)
    mis += 1
    continue
  }

  totaalKoud += koud
  totaalWarm += warm
  console.log(
    folder.padEnd(26) +
      `${koud} ms`.padStart(10) +
      `${warm} ms`.padStart(11) +
      `${warm > 0 ? Math.round(koud / warm) : '>1000'}x`.padStart(10)
  )
}

console.log('')
console.log(
  `samen: ${(totaalKoud / 1000).toFixed(1)} s uitlezen tegen ${(totaalWarm / 1000).toFixed(2)} s uit de cache`
)
console.log(`op de schijf: ${(cacheGrootte(userData) / 1024 / 1024).toFixed(0)} MB`)

/*
 * En dan de vraag die er echt toe doet: merkt hij het als de kaart verandert?
 *
 * Op een nepmap, niet op de installatie van de speler. Een eerdere versie van
 * deze proef verzette de klok van een echt tegelbestand en kreeg die niet exact
 * terug -- aan andermans spelbestanden kom je niet, ook niet even.
 */
const nep = mkdtempSync(join(tmpdir(), 'omsi-nepkaart-'))
writeFileSync(join(nep, 'global.cfg'), 'niets bijzonders', 'utf8')
writeFileSync(join(nep, 'tile_0_0.map'), 'tegel', 'utf8')
writeFileSync(join(nep, 'tile_0_1.map'), 'tegel', 'utf8')

const afdrukVoor = vingerafdruk(nep)

// Inhoud veranderen: dat verandert de grootte en de wijzigingstijd.
writeFileSync(join(nep, 'tile_0_0.map'), 'tegel met meer erin', 'utf8')
const afdrukNaWijziging = vingerafdruk(nep)

// Een tegel erbij, zoals bij een uitbreiding van een kaart.
writeFileSync(join(nep, 'tile_1_0.map'), 'tegel', 'utf8')
const afdrukNaGroei = vingerafdruk(nep)

console.log('')
console.log(
  afdrukVoor !== afdrukNaWijziging
    ? 'een gewijzigde tegel geeft een andere afdruk'
    : 'MISLUKT: een gewijzigde tegel gaf dezelfde afdruk'
)
console.log(
  afdrukNaWijziging !== afdrukNaGroei
    ? 'een tegel erbij geeft ook een andere afdruk'
    : 'MISLUKT: een extra tegel gaf dezelfde afdruk'
)
console.log(
  vingerafdruk(join(nep, 'bestaat-niet')) === ''
    ? 'een map die niet bestaat levert geen afdruk, dus ook geen cache'
    : 'MISLUKT: een onbestaande map gaf toch een afdruk'
)
if (afdrukVoor === afdrukNaWijziging || afdrukNaWijziging === afdrukNaGroei) mis += 1

/*
 * Een halfgeschreven of onzinnig bestand mag nooit een fout opleveren. Alles
 * onleesbaar maken, niet één willekeurig bestand: de naam is een hash van de
 * mapnaam, dus welk bestand bij welke kaart hoort weet deze proef niet -- en
 * een eerdere versie beschadigde daardoor een ander bestand dan ze uitlas.
 */
mkdirSync(join(userData, 'kaartcache'), { recursive: true })
for (const naam of readdirSync(join(userData, 'kaartcache'))) {
  writeFileSync(join(userData, 'kaartcache', naam), '{ dit is geen json', 'utf8')
}
const kapot = leesUitCache<MapGeometry>(
  userData,
  kaarten[0],
  'tekening',
  vingerafdruk(join(omsi, 'maps', kaarten[0]))
)
console.log(
  kapot === undefined
    ? 'een kapot cachebestand levert niets op in plaats van een fout'
    : 'MISLUKT: een kapot cachebestand werd toch gelezen'
)
if (kapot !== undefined) mis += 1

process.exit(mis === 0 ? 0 : 1)
