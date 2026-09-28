/**
 * Proef 0 voor een busbedrijf-modus: wat kan er per kaart?
 *
 *   npx tsx scripts/probe-kaartmogelijkheden.ts "<pad naar OMSI 2>" [kaart]
 *
 * LEEST ALLEEN. Er wordt niets geschreven, niet in de OMSI-map en niet ernaast.
 *
 * Waarom: een busbedrijf zoals in City Bus Manager vraagt dingen van een kaart
 * die per kaart verschillen, en die tot nu toe niemand geteld heeft. Deze proef
 * telt ze, zodat we niet op één kaart bouwen wat op de andere niet kan:
 *
 * - Soort ritten: met een `.ttr` (OMSI rijdt een vastgelegd spoor), met
 *   `[station_typ2]` (OMSI zoekt de weg tussen haltes via `StnLinks.cfg`) of
 *   met de oude `[station]`. Eigen lijnvarianten kunnen hooguit bij typ2.
 * - `StnLinks.cfg`: bestaat hij, hoe groot, en de eerste regels ruw -- het
 *   formaat is in de app nog nergens gelezen, dus die regels zijn om te kijken.
 * - Haltes met meer dan één opvolger in de ritten: alleen daar kan een eigen
 *   variant een andere kant op dan de lijnen die er al zijn.
 * - Per lijn die de speler mag rijden: de KI-groepen (veld 2 van `[newtour]`).
 *   Eén groep voor veel lijnen betekent dat een eigen wagenpark ook op andere
 *   lijnen opduikt.
 * - `ailists.cfg`: aantal remisegroepen en wagenregels, en of er een tweede
 *   lijst is (`ailists_#low.cfg`, of een in een `Chrono`-map).
 * - `global.cfg`: welke blokken er over geld en reizigers gaan.
 *
 * Zet de uitvoer in een bericht; daarmee beslissen we wat er per kaart kan.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, readOmsiLines } from '../src/core/omsiFile'
import { listMaps, loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(join(omsi, 'maps'))) {
  console.error('Geef het pad naar de OMSI 2-map (de map met Omsi.exe en maps).')
  process.exit(1)
}
const alleen = process.argv[3]

/** Alle blokkoppen van een bestand geteld; een onleesbaar bestand geeft niets. */
function tagsVan(pad: string): Map<string, number> {
  const tellen = new Map<string, number>()
  try {
    for (const regel of readOmsiLines(pad)) {
      const tag = blockTag(regel)
      if (tag) tellen.set(tag, (tellen.get(tag) ?? 0) + 1)
    }
  } catch {
    // Telt als leeg.
  }
  return tellen
}

/** Zoekt bestanden met deze naam, ook in submappen (Chrono). */
function zoek(map: string, naam: RegExp, diepte = 3): string[] {
  const gevonden: string[] = []
  if (diepte < 0 || !existsSync(map)) return gevonden
  for (const item of readdirSync(map)) {
    const pad = join(map, item)
    let isMap = false
    try {
      isMap = statSync(pad).isDirectory()
    } catch {
      continue
    }
    if (isMap) gevonden.push(...zoek(pad, naam, diepte - 1))
    else if (naam.test(item)) gevonden.push(pad)
  }
  return gevonden
}

for (const kaart of listMaps(omsi)) {
  if (alleen && kaart !== alleen) continue
  const pad = join(omsi, 'maps', kaart)
  const ttData = join(pad, 'TTData')
  console.log(`\n=== ${kaart} ===`)

  let geladen
  try {
    geladen = loadMap(join(omsi, 'maps'), kaart)
  } catch (fout) {
    console.log(`  kon de dienstregeling niet lezen: ${fout instanceof Error ? fout.message : fout}`)
  }
  if (!geladen) {
    console.log('  geen dienstregeling')
    continue
  }

  // Soort ritten.
  let metTtr = 0
  let typ2 = 0
  let oud = 0
  let gemengd = 0
  // Op de bestandsnaam zelf: de sleutels van `trips` staan in kleine letters.
  for (const { file: rit } of geladen.trips.values()) {
    if (existsSync(join(ttData, `${rit}.ttr`))) metTtr++
    const tags = tagsVan(join(ttData, `${rit}.ttp`))
    const t2 = tags.get('[station_typ2]') ?? 0
    const t1 = tags.get('[station]') ?? 0
    if (t2 > 0 && t1 > 0) gemengd++
    else if (t2 > 0) typ2++
    else if (t1 > 0) oud++
  }
  console.log(
    `  ritten: ${geladen.trips.size} · met .ttr ${metTtr} · [station_typ2] ${typ2} · [station] ${oud}` +
      (gemengd ? ` · gemengd ${gemengd}` : '')
  )
  console.log(`  haltes in Busstops.cfg: ${geladen.stops.size}`)

  // StnLinks.cfg: alleen tellen en de eerste regels ruw laten zien.
  const links = zoek(pad, /^stnlinks\.cfg$/i, 1)
  if (links.length === 0) {
    console.log('  StnLinks.cfg: niet gevonden')
  } else {
    for (const bestand of links) {
      let regels: string[] = []
      try {
        regels = readOmsiLines(bestand)
      } catch {
        // leeg
      }
      const gevuld = regels.filter((regel) => regel.trim() !== '')
      const tags = tagsVan(bestand)
      console.log(
        `  ${bestand.slice(pad.length + 1)}: ${statSync(bestand).size} bytes, ${gevuld.length} gevulde regels, ` +
          `blokken: ${[...tags].map(([tag, n]) => `${tag}×${n}`).join(' ') || 'geen'}`
      )
      console.log(`    eerste regels: ${JSON.stringify(gevuld.slice(0, 12))}`)
    }
  }

  // Haltes met meer dan één opvolger, over alle ritten.
  const opvolgers = new Map<string, Set<string>>()
  for (const rit of geladen.trips.values()) {
    for (let i = 0; i + 1 < rit.stops.length; i++) {
      const set = opvolgers.get(rit.stops[i].id) ?? new Set<string>()
      set.add(rit.stops[i + 1].id)
      opvolgers.set(rit.stops[i].id, set)
    }
  }
  const knopen = [...opvolgers.values()].filter((set) => set.size > 1).length
  const paren = [...opvolgers.values()].reduce((som, set) => som + set.size, 0)
  console.log(`  halteparen in ritten: ${paren} · haltes met meer dan één opvolger: ${knopen}`)

  // KI-groepen per lijn die de speler mag rijden.
  const perLijn = new Map<string, Set<string>>()
  const lijnenPerGroep = new Map<string, Set<string>>()
  for (const omloop of geladen.tours) {
    if (!omloop.userAllowed) continue
    const groepen = perLijn.get(omloop.lineFile) ?? new Set<string>()
    groepen.add(omloop.depot || '(leeg)')
    perLijn.set(omloop.lineFile, groepen)
    const lijnen = lijnenPerGroep.get(omloop.depot || '(leeg)') ?? new Set<string>()
    lijnen.add(omloop.lineFile)
    lijnenPerGroep.set(omloop.depot || '(leeg)', lijnen)
  }
  console.log(`  lijnen voor de speler: ${perLijn.size} · KI-groepen: ${lijnenPerGroep.size}`)
  for (const [lijn, groepen] of [...perLijn].sort()) {
    console.log(`    ${lijn}: ${[...groepen].join(', ')}`)
  }
  for (const [groep, lijnen] of [...lijnenPerGroep].sort()) {
    if (lijnen.size > 1) console.log(`    groep ${groep} bedient ${lijnen.size} lijnen`)
  }

  // Het wagenpark.
  const lijsten = zoek(pad, /^ailists.*\.cfg$/i, 3)
  if (lijsten.length === 0) console.log('  ailists: geen')
  for (const lijst of lijsten) {
    const tags = tagsVan(lijst)
    let wagens = 0
    try {
      const regels = readOmsiLines(lijst)
      for (let i = 0; i < regels.length; i++) {
        if (!regels[i].trim().toLowerCase().startsWith('[aigroup_depot_typgroup')) continue
        // Na de kop: busbestand, dan wagenregels tot [end].
        for (let k = i + 2; k < regels.length && !regels[k].trim().toLowerCase().startsWith('[end'); k++) {
          if (regels[k].trim()) wagens++
        }
      }
    } catch {
      // leeg
    }
    console.log(
      `  ${lijst.slice(pad.length + 1)}: remisegroepen ${tags.get('[aigroup_depot]') ?? 0}, ` +
        `bustypes ${[...tags].filter(([tag]) => tag.startsWith('[aigroup_depot_typgroup')).reduce((s, [, n]) => s + n, 0)}, ` +
        `wagenregels ${wagens}`
    )
  }

  // global.cfg: wat er over geld en reizigers staat.
  const globaal = tagsVan(join(pad, 'global.cfg'))
  const relevant = [...globaal.keys()].filter((tag) => /money|ticket|human|pass|curve|traffic|density/i.test(tag))
  console.log(`  global.cfg: ${relevant.length ? relevant.join(' ') : 'niets over geld of reizigers'}`)
}
