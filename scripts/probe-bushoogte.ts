/**
 * Zet de app de bus op dezelfde hoogte neer als OMSI zelf?
 *
 *   npx tsx scripts/probe-bushoogte.ts "<pad naar OMSI 2>"
 *
 * Leest alleen. OMSI heeft in `laststn.osn` een bus achtergelaten op een plek
 * die het spel zelf goed vond: tegel, plek op die tegel en hoogte. Dat is de
 * enige maatstaf die telt, want het is het spel dat zegt wat klopt.
 *
 * Wat hier naast elkaar staat:
 *
 *   OMSI       wat het spel opschreef
 *   maaiveld   wat wij van het terrein maken op diezelfde plek
 *   rijstrook  de hoogte van het wegdek dat wij daar vinden
 *   wij        wat `spawnAtStop` eruit zou laten komen
 *
 * `probe-spawnhoogte.ts` legde alleen het maaiveld ernaast en liet dus niet zien
 * of de reparatie van "de bus staat in de grond" werkelijk aankomt. Dit wel.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData, readTileGrid } from '../src/core/geo'
import { LaneNetwork } from '../src/core/routing'
import { spawnAtStop } from '../src/core/spawn'
import { terrainHeight } from '../src/core/terrain'
import { loadMap } from '../src/core/timetable'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

function lees(pad: string): string[] {
  const ruw = readFileSync(pad)
  const tekst =
    ruw[0] === 0xff && ruw[1] === 0xfe ? ruw.toString('utf16le') : ruw.toString('latin1')
  return tekst.split('\n').map((r) => r.replace(/\r$/, ''))
}

function blok(regels: string[], naam: string, hoeveel: number): string[] | undefined {
  const i = regels.findIndex((r) => r.trim().toLowerCase() === naam.toLowerCase())
  if (i < 0) return undefined
  return Array.from({ length: hoeveel }, (_, n) => (regels[i + 1 + n] ?? '').trim())
}

const mapsDir = join(omsi, 'maps')

for (const kaart of readdirSync(mapsDir)) {
  const mapPath = join(mapsDir, kaart)
  for (const naam of ['laststn.osn.voor-omsi-enhancer', 'laststn.osn.voor-omsi-career']) {
    const pad = join(mapPath, naam)
    if (!existsSync(pad)) continue
    const regels = lees(pad)
    const v = blok(regels, '[vehicle]', 14)
    if (!v || !v[0]) continue

    const x = Number(v[1])
    const hOmsi = Number(v[2])
    const z = Number(v[3])
    const tx = Number(v[11])
    const ty = Number(v[12])
    if (![x, hOmsi, z, tx, ty].every(Number.isFinite)) continue

    const grid = readTileGrid(mapPath)
    if (!grid) continue
    const maaiveld = terrainHeight(mapPath, tx, ty, x, z, grid.size(ty))

    /*
     * De rijstrook op precies deze plek. Daarvoor moeten we van tegelcoordinaten
     * terug naar kaartmeters; `offset` geeft de hoek van de tegel.
     */
    const [ox, oy] = grid.offset(tx, ty)
    const kaartX = ox + x
    const kaartY = oy + z

    const dienst = loadMap(mapsDir, kaart)
    let rijstrook: number | undefined
    let onsSpawn: number | undefined
    let halte = ''
    if (dienst && dienst.stops.size > 0) {
      try {
        const data = readMapData(mapPath, new Set(dienst.stops.keys()), omsi)
        const net = new LaneNetwork(data.lanes)
        // De halte die het dichtst bij de achtergelaten bus ligt.
        let beste: (typeof data.geometry.stops)[number] | undefined
        let besteAfstand = Infinity
        for (const stop of data.geometry.stops) {
          const d = Math.hypot(stop.x - kaartX, stop.y - kaartY)
          if (d < besteAfstand) {
            besteAfstand = d
            beste = stop
          }
        }
        if (beste && besteAfstand < 120) {
          halte = `${beste.name || beste.id} op ${besteAfstand.toFixed(0)} m`
          rijstrook = (net.spawnAt(beste) ?? net.spawnAt(beste, 60))?.height
          onsSpawn = spawnAtStop(mapPath, grid, net, beste)?.height
        }
      } catch {
        // Een kaart die niet te lezen is, slaan we over.
      }
    }

    const toon = (n: number | undefined): string =>
      n === undefined ? '     --' : n.toFixed(2).padStart(7)

    console.log(
      `${kaart.padEnd(24)} OMSI ${hOmsi.toFixed(2).padStart(7)}` +
        `  maaiveld ${toon(maaiveld)}` +
        `  rijstrook ${toon(rijstrook)}` +
        `  wij ${toon(onsSpawn)}` +
        (halte ? `   (${halte})` : '   (geen halte dichtbij)')
    )
  }
}
