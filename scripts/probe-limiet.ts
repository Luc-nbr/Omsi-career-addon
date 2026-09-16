/**
 * Kloppen de snelheidsborden langs een route?
 *
 *   npx tsx scripts/probe-limiet.ts [kaartmap]
 *
 * OMSI schrijft nergens op hoe hard je ergens mag; die kennis staat alleen op de
 * borden, en die zijn gewone objecten met hun snelheid in de naam. Ze langs de
 * route leggen is dus een benadering: een bord voor de tegenrichting staat net
 * zo dicht bij de weg als een bord voor jou.
 *
 * Deze proef legt de borden op de route van een echte rit en drukt de reeks af.
 * De vraag is niet of elk bord klopt, maar of de reeks eruitziet als een rit:
 * dertig in het dorp, zestig of tachtig ertussen, en niet om de vijftig meter
 * iets anders.
 */
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { readMapData } from '../src/core/geo'
import { LaneNetwork, routeForTrip } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'

/** Zo dicht moet een bord bij de route staan om erbij te horen. */
const NAAST_DE_WEG_M = 12

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const kaart = process.argv[2] ?? 'Hohenkirchen - Herrenhof'

const loaded = loadMap(join(omsi, 'maps'), kaart)
if (!loaded) throw new Error(`Geen dienstregeling in ${kaart}.`)

const ids = new Set<string>(loaded.stops.keys())
for (const trip of loaded.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
const { geometry, lanes } = readMapData(loaded.path, ids, omsi)
const borden = geometry.limits ?? []
console.log(`${kaart}: ${borden.length} snelheidsborden, ${geometry.stops.length} haltes`)
if (borden.length === 0) process.exit(0)

// Een rit van enige lengte; welke doet er niet toe, als er maar weg onder ligt.
const trip = [...loaded.trips.values()].find((item) => item.stops.length >= 10)
if (!trip) throw new Error('Geen rit met genoeg haltes.')
console.log(`rit ${trip.lineNumber} ${trip.file} -> ${trip.terminus}, ${trip.stops.length} haltes`)

const stops = trip.stops
  .map((stop) => geometry.stops.find((punt) => punt.id === stop.id))
  .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop))
let netwerk: LaneNetwork | undefined
const { points } = routeForTrip(loaded.path, omsi, trip.file, stops, () => {
  netwerk ??= new LaneNetwork(lanes)
  return netwerk
})

/** Afstand langs de route bij elk punt. */
const langs: number[] = [0]
for (let i = 2; i < points.length; i += 2) {
  langs.push(langs[langs.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]))
}
const lengte = langs[langs.length - 1]
console.log(`route: ${(lengte / 1000).toFixed(1)} km`)

/** Het dichtstbijzijnde punt op de route, en hoe ver dat langs de route ligt. */
function opDeRoute(x: number, y: number): { afstand: number; langsDeRoute: number; kant: number } {
  let beste = Infinity
  let waar = 0
  let kant = 0
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2]
    const ay = points[i - 1]
    const bx = points[i]
    const by = points[i + 1]
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2)) : 0
    const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t))
    if (d < beste) {
      beste = d
      waar = langs[i / 2 - 1] + Math.sqrt(len2) * t
      // Links of rechts van de rijrichting: borden staan rechts, en een bord
      // links hoort dus bij het verkeer dat de andere kant op komt.
      kant = Math.sign(vx * (y - ay) - vy * (x - ax))
    }
  }
  return { afstand: beste, langsDeRoute: waar, kant }
}

const gevonden = borden
  .map((bord) => ({ bord, ...opDeRoute(bord.x, bord.y) }))
  .filter((item) => item.afstand <= NAAST_DE_WEG_M)
  .sort((a, b) => a.langsDeRoute - b.langsDeRoute)

console.log(`${gevonden.length} borden langs deze route:`)
let vorige: number | undefined
let wissels = 0
for (const item of gevonden) {
  const anders = item.bord.kmh !== vorige
  if (anders) wissels += 1
  console.log(
    `   ${(item.langsDeRoute / 1000).toFixed(2).padStart(6)} km  ` +
      `${String(item.bord.kmh).padStart(3)} km/u  (${item.afstand.toFixed(1)} m ${item.kant < 0 ? 'rechts' : 'links'})` +
      `${anders ? '' : '   zelfde als hiervoor'}`
  )
  vorige = item.bord.kmh
}
console.log(
  `${wissels} keer een andere snelheid over ${(lengte / 1000).toFixed(1)} km` +
    ` -- gemiddeld elke ${wissels > 0 ? (lengte / wissels / 1000).toFixed(2) : '-'} km`
)
