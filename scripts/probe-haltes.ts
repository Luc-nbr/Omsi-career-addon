/**
 * Beginpunten en tussenhaltes, over alle kaarten.
 *
 *   npx tsx scripts/probe-haltes.ts
 *
 * Vrij rijden laat bij het beginpunt zien welke lijnen er stoppen en of ritten
 * er beginnen (haltesVan in core/haltes.ts). Deze proef kijkt of dat klopt met
 * de dienstregeling zelf: de eerste halte van elke kiesbare rit is een
 * beginpunt, elke halte van een rit draagt de lijn van die rit, en de haltes
 * waar ritten beginnen staan ook op de kaart (dezelfde id's als de geometrie).
 *
 * Leest alleen.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { haltesVan } from '../src/core/haltes'
import { listMaps, loadMap } from '../src/core/timetable'
import { readMapGeometry } from '../src/core/geo'

const ECHT = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const MAPS = join(ECHT, 'maps')
if (!existsSync(MAPS)) {
  console.log('geen OMSI; proef overgeslagen')
  process.exit(0)
}

let fouten = 0
const fout = (tekst: string): void => {
  fouten += 1
  if (fouten <= 10) console.log(`  FOUT ${tekst}`)
}

for (const folder of listMaps(ECHT)) {
  const map = loadMap(MAPS, folder)
  if (!map) continue
  const info = new Map(haltesVan(map).map((halte) => [halte.id, halte]))
  const kiesbaar = map.tours.some((tour) => tour.userAllowed)
    ? map.tours.filter((tour) => tour.userAllowed)
    : map.tours
  for (const tour of kiesbaar) {
    for (const entry of tour.trips) {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!trip || trip.stops.length === 0) continue
      const eerste = info.get(trip.stops[0].id)
      if (!eerste || eerste.begint === 0) fout(`${folder}: rit ${trip.file} begint bij ${trip.stops[0].id}, dat geen beginpunt heet`)
      const lijn = trip.lineNumber || trip.ident || tour.lineFile
      for (const stop of trip.stops) {
        if (!info.get(stop.id)?.lijnen.includes(lijn)) fout(`${folder}: lijn ${lijn} ontbreekt bij halte ${stop.id}`)
      }
    }
  }
  let geometrie: { stops: Array<{ id: string }> } | undefined
  try {
    geometrie = readMapGeometry(join(MAPS, folder), new Set(info.keys()), ECHT)
  } catch {
    geometrie = undefined
  }
  const opKaart = new Set((geometrie?.stops ?? []).map((halte) => halte.id))
  const begin = [...info.values()].filter((halte) => halte.begint > 0)
  const tussen = [...info.values()].filter((halte) => halte.begint === 0)
  const beginOpKaart = begin.filter((halte) => opKaart.has(halte.id)).length
  const zonder = [...opKaart].filter((id) => !info.has(id)).length
  console.log(
    `${map.name}: ${begin.length} beginpunten (${beginOpKaart} op de kaart), ${tussen.length} tussenhaltes, ` +
      `${zonder} haltes op de kaart zonder lijn`
  )
  /*
   * Staat er geen enkel beginpunt op de kaart, dan vindt de app de haltes van
   * deze kaart niet in zijn tegels (Wenen). Dat ligt aan de kaartlezer, niet aan
   * de indeling; wel goed om te weten, want dan valt er niets te kiezen.
   */
  if (geometrie && begin.length > 0 && beginOpKaart === 0) console.log(`  let op: op ${map.name} staat geen enkele halte op de kaart`)
}

console.log(fouten === 0 ? 'beginpunten en tussenhaltes kloppen met de dienstregeling' : `${fouten} FOUTEN`)
process.exit(fouten === 0 ? 0 : 1)
