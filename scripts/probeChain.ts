/**
 * Hoeveel keuze heeft een chauffeur op een eindpunt?
 *
 * Alleen aansluitingen die in de omlopen voorkomen zijn bewezen berijdbaar.
 * Halte-namen of -id's vergelijken is onbetrouwbaar: op Thueringer Wald klopt de
 * halte-id maar in 19% van de gevallen.
 *
 * Maar de relatie is wel uit te breiden zonder iets te verzinnen. Volgt B ergens
 * op A, en volgt B ook op C, dan eindigen A en C op dezelfde plek — dus alles wat
 * op A mag volgen, mag ook op C volgen. Union-find over eind- en beginpunten
 * maakt die gelijkheid expliciet.
 */
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { listMaps, loadMap, tripMinutes } from '../src/core/timetable'

const omsi = findOmsiInstall()!
const mapsPath = join(omsi, 'maps')

class UnionFind {
  private parent = new Map<string, string>()
  find(node: string): string {
    const up = this.parent.get(node)
    if (up === undefined) {
      this.parent.set(node, node)
      return node
    }
    if (up === node) return node
    const root = this.find(up)
    this.parent.set(node, root)
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

console.log('kaart                       ritten  uit-omloop  na-union-find  plaatsen')
console.log('-'.repeat(74))

for (const folder of listMaps(omsi)) {
  const map = loadMap(mapsPath, folder)
  if (!map) continue

  const places = new UnionFind()
  const direct = new Map<string, Set<string>>()

  for (const tour of map.tours) {
    const trips = [...tour.trips].sort((a, b) => a.departure - b.departure)
    for (let i = 1; i < trips.length; i++) {
      const from = trips[i - 1].tripFile.toLowerCase()
      const to = trips[i].tripFile.toLowerCase()
      const prev = map.trips.get(from)
      if (!prev || !map.trips.has(to)) continue
      const gap =
        trips[i].departure - (trips[i - 1].departure + tripMinutes(prev, trips[i - 1].profileIndex))
      // Een lange stilstand is een aflossing, geen aansluiting.
      if (gap < 0 || gap > 45) continue
      places.union(`end:${from}`, `start:${to}`)
      const set = direct.get(from) ?? new Set<string>()
      set.add(to)
      direct.set(from, set)
    }
  }

  // Ritten groeperen op beginplaats.
  const startingAt = new Map<string, string[]>()
  for (const file of map.trips.keys()) {
    const root = places.find(`start:${file}`)
    const list = startingAt.get(root) ?? []
    list.push(file)
    startingAt.set(root, list)
  }

  let directTotal = 0
  let unionTotal = 0
  let counted = 0
  for (const file of map.trips.keys()) {
    const options = startingAt.get(places.find(`end:${file}`)) ?? []
    if (options.length === 0 && !direct.has(file)) continue
    counted++
    directTotal += direct.get(file)?.size ?? 0
    unionTotal += options.length
  }

  const placeCount = new Set(
    [...map.trips.keys()].map((file) => places.find(`end:${file}`))
  ).size

  console.log(
    `${map.name.slice(0, 24).padEnd(26)}${String(map.trips.size).padStart(6)}` +
      `${(directTotal / Math.max(1, counted)).toFixed(2).padStart(12)}` +
      `${(unionTotal / Math.max(1, counted)).toFixed(2).padStart(15)}` +
      `${String(placeCount).padStart(10)}`
  )
}
