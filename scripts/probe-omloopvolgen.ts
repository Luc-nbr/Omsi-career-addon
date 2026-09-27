/**
 * Een dienst uit de omloop die in OMSI gekozen is, over alle kaarten.
 *
 *   npx tsx scripts/probe-omloopvolgen.ts
 *
 * Vrij rijden volgt wat de chauffeur in het dienstregelingsmenu van OMSI kiest
 * (dutyFromTour in core/duty.ts). OMSI noemt de lijn, de omloop en de rit zoals
 * ze in de dienstregeling staan -- de rit als pad, "TTData\\92 Fd-Sg.ttp". Deze
 * proef doet dat na voor een steekproef van omlopen op elke kaart: zoals OMSI
 * het zou doorgeven, en kijkt of de dienst die eruit komt met die rit begint en
 * alleen die omloop rijdt.
 *
 * Leest alleen; de kaarten worden niet aangeraakt.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildNetwork, dutyFromTour } from '../src/core/duty'
import { listMaps, loadMap } from '../src/core/timetable'

const ECHT = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
if (!existsSync(join(ECHT, 'maps'))) {
  console.log('geen OMSI; proef overgeslagen')
  process.exit(0)
}

let fouten = 0
let getoetst = 0
const MAPS = join(ECHT, 'maps')
for (const folder of listMaps(ECHT)) {
  let map
  try {
    map = loadMap(MAPS, folder)
  } catch {
    map = undefined
  }
  if (!map) {
    console.log(`${folder}: niet te laden, overgeslagen`)
    continue
  }
  const net = buildNetwork(map)
  const ritten = [...net.departingFrom.values()].flat()
  if (ritten.length === 0) continue
  /* Een steekproef: elke zevende rit, hooguit twintig per kaart. */
  const proef = ritten.filter((_, i) => i % 7 === 0).slice(0, 20)
  let goed = 0
  for (const run of proef) {
    const klok = run.departure % 1440
    const duty = dutyFromTour(map, net, {
      lineFile: run.lineFile,
      tourNumber: run.tourNumber,
      tripFile: `TTData\\${run.tripFile}.ttp`,
      clockMinutes: klok
    })
    getoetst += 1
    const ok =
      duty !== undefined &&
      duty.legs[0].tripFile === run.tripFile &&
      duty.legs.every((leg) => leg.tourNumber === run.tourNumber && leg.lineFile === run.lineFile) &&
      duty.legs.every((leg, i) => i === 0 || leg.departure >= duty.legs[i - 1].departure)
    if (ok) goed += 1
    else if (fouten < 10) {
      console.log(
        `  FOUT ${folder}: lijn ${run.lineFile} omloop ${run.tourNumber} rit ${run.tripFile} ${run.departure} -> ` +
          (duty ? `begint met ${duty.legs[0].tripFile} ${duty.legs[0].departure}` : 'niets')
      )
    }
    if (!ok) fouten += 1
  }
  console.log(`${map.name}: ${goed}/${proef.length}`)
}

/* En wat OMSI niet kent, levert niets op in plaats van een willekeurige dienst. */
const eerste = listMaps(ECHT)[0]
const eersteKaart = eerste ? loadMap(MAPS, eerste) : undefined
if (eersteKaart) {
  const map = eersteKaart
  const niets = dutyFromTour(map, buildNetwork(map), {
    lineFile: 'bestaat-niet',
    tourNumber: '999999',
    tripFile: 'TTData\\bestaat-niet.ttp',
    clockMinutes: 600
  })
  if (niets) {
    console.log('  FOUT een onbekende omloop gaf toch een dienst')
    fouten += 1
  }
}

console.log(fouten === 0 ? `alle ${getoetst} omlopen gevolgd` : `${fouten} VAN ${getoetst} MIS`)
process.exit(fouten === 0 ? 0 : 1)
