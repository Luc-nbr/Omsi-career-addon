/**
 * Hebben de ritten een tijd per halte?
 *
 * Een `.ttp` noemt per halte de rijtijd tot daar in seconden, en per profiel
 * `[profile_man_dep_time]`-blokken met een vaste vertrektijd voor bepaalde
 * haltes. De vraag is of die vaste tijden er voor elke halte zijn, of dat er
 * tussen de vaste punten geïnterpoleerd moet worden.
 */
import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { blockTag, readOmsiLines, str } from '../src/core/omsiFile'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')

for (const folder of readdirSync(maps)) {
  const data = join(maps, folder, 'TTData')
  let files: string[]
  try {
    files = readdirSync(data).filter((name) => extname(name).toLowerCase() === '.ttp')
  } catch {
    continue
  }
  if (files.length === 0) continue

  let trips = 0
  let volledig = 0
  let deels = 0
  let geen = 0
  let stations = 0
  let vaste = 0
  let velden = new Set<number>()

  for (const file of files) {
    let lines: string[]
    try {
      lines = readOmsiLines(join(data, file))
    } catch {
      continue
    }
    let count = 0
    const fixedPerProfile: number[] = []
    let profile = -1
    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[station]' || tag === '[station_typ2]') {
        count++
        if (tag === '[station]') {
          // Hoeveel regels tot het volgende blok? Dat is het aantal velden.
          let n = 0
          while (i + 1 + n < lines.length && !blockTag(lines[i + 1 + n]) && str(lines[i + 1 + n]) !== '') n++
          velden.add(n)
        }
      } else if (tag === '[profile]') {
        profile++
        fixedPerProfile[profile] = 0
      } else if (tag === '[profile_man_dep_time]' && profile >= 0) {
        fixedPerProfile[profile]++
      }
    }
    if (count === 0) continue
    trips++
    stations += count
    const best = Math.max(0, ...fixedPerProfile.map((x) => x ?? 0))
    vaste += best
    if (best === 0) geen++
    else if (best >= count) volledig++
    else deels++
  }

  console.log(
    `${folder.padEnd(22)} ${String(trips).padStart(4)} ritten, ${stations} haltes | ` +
      `vaste tijden: alle ${volledig}, deels ${deels}, geen ${geen} | ` +
      `${((vaste / stations) * 100).toFixed(0)}% van de haltes | velden in [station]: ${[...velden].sort().join(',')}`
  )
}
