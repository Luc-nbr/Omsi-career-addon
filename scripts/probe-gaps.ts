/**
 * Waarom vindt de planner sommige stukken niet?
 *
 * Een stuk dat niet gevonden wordt, wordt op de kaart een kaarsrechte lijn dwars
 * door het landschap. Deze proef zoekt van elk zo'n stuk uit waar het op vastloopt:
 *
 * - **halte los van de weg** -- er ligt binnen bereik geen rijstrook, dus er is
 *   niets om aan te haken;
 * - **richting** -- er is wel een weg, maar niet een die je mag rijden. Dat
 *   blijkt als dezelfde route wél lukt op een net waarin elke strook beide
 *   kanten op mag;
 * - **net valt uiteen** -- ook dan niet: de twee haltes zitten in losse stukken
 *   wegennet;
 * - **te ver** -- de zoektocht stopt bij een maximale omweg.
 *
 * Sinds de terugval op een net waarin elke strook beide kanten op mag, blijft
 * alleen de eerste soort over: een halte die nergens aan de weg ligt. Wat de
 * terugval redt staat er apart bij, met de omweg die hij oplevert -- een route
 * die drie keer zo lang is als de rechte lijn zou verdacht zijn.
 *
 *   npx tsx scripts/probe-gaps.ts [kaart ...]
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapData, type StopPoint } from '../src/core/geo'
import { findOmsiInstall } from '../src/core/install'
import { LaneNetwork } from '../src/core/routing'
import { loadMap } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')
const only = process.argv.slice(2)

for (const folder of readdirSync(maps)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const map = loadMap(maps, folder)
  if (!map) continue

  const ids = new Set<string>(map.stops.keys())
  for (const trip of map.trips.values()) for (const stop of trip.stops) ids.add(stop.id)
  const { geometry, lanes } = readMapData(map.path, ids, omsi)
  if (lanes.length === 0) continue

  const network = new LaneNetwork(lanes)
  // Hetzelfde net, maar alles mag beide kanten op: zo zie je of de richting het is.
  const bothWays = new LaneNetwork(lanes.map((lane) => ({ ...lane, direction: 2 })))
  const byId = new Map(geometry.stops.map((stop) => [stop.id, stop]))

  let hops = 0
  let missing = 0
  let rescued = 0
  let worstDetour = 0
  const reasons = { loose: 0, direction: 0, split: 0, far: 0 }
  const examples: string[] = []
  const seen = new Set<string>()

  for (const trip of map.trips.values()) {
    const points: StopPoint[] = []
    for (const stop of trip.stops) {
      const found = byId.get(stop.id)
      if (found) points.push(found)
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) continue
      const key = `${a.id}>${b.id}`
      if (seen.has(key)) continue
      seen.add(key)
      hops++
      if (network.route(a, b)) continue

      /*
       * De app geeft het hier niet op: hij probeert het nog eens op een net
       * waarin elke strook beide kanten op mag. Wat dat oplevert ligt op de weg,
       * en dat is oneindig veel beter dan een rechte lijn door het landschap.
       */
      const rescue = bothWays.route(a, b)
      if (rescue) {
        rescued++
        let length = 0
        for (let k = 2; k < rescue.length; k += 2) {
          length += Math.hypot(rescue[k] - rescue[k - 2], rescue[k + 1] - rescue[k - 1])
        }
        const detour = length / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
        worstDetour = Math.max(worstDetour, detour)
        continue
      }
      missing++

      const straight = Math.hypot(a.x - b.x, a.y - b.y)
      const da = network.distanceToLane(a.x, a.y)
      const db = network.distanceToLane(b.x, b.y)
      let why: keyof typeof reasons
      if (da > 30 || db > 30) why = 'loose'
      else if (straight > 2500) why = 'far'
      else why = 'split'
      reasons[why]++

      if (examples.length < 8) {
        examples.push(
          `${why.padEnd(9)} ${Math.round(straight).toString().padStart(5)} m  ` +
            `${a.name} -> ${b.name}  (weg op ${da === Infinity ? '>40' : da.toFixed(1)} en ` +
            `${db === Infinity ? '>40' : db.toFixed(1)} m)`
        )
      }
    }
  }

  console.log(
    `\n== ${folder}: ${hops - missing}/${hops} stukken op de weg, ${missing} als rechte lijn\n` +
      `   waarvan ${rescued} pas lukte zonder op de richting te letten` +
      (rescued > 0 ? ` (grootste omweg ${worstDetour.toFixed(1)}x de rechte lijn)` : '') +
      `\n   wat overblijft: halte los van de weg ${reasons.loose}, ` +
      `net valt uiteen ${reasons.split}, te ver ${reasons.far}`
  )
  for (const line of examples) console.log(`   ${line}`)
}
