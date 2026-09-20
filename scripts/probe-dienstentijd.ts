/**
 * Waar blijft de tijd bij het zoeken van diensten?
 *
 *   npx tsx scripts/probe-dienstentijd.ts ["<pad naar OMSI 2>"]
 *
 * Aanleiding: het logboek van een gebruiker met 46 kaarten op een tweede schijf,
 * waarin `duty:list` op 64249 ms stond. Hier wordt per kaart gemeten wat dat
 * kost en waaruit het bestaat: de dienstregeling inlezen, het net bouwen, en
 * het zoeken zelf. Leest alleen.
 */
import { performance } from 'node:perf_hooks'
import { maakKaartlaag } from '../src/core/kaartlaag'
import { findOmsiInstall } from '../src/core/install'
import { listMaps } from '../src/core/timetable'

const omsi = process.argv[2] ?? findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

/** Een eigen map voor de cache, zodat de meting niet van eerdere runs afhangt. */
const laag = maakKaartlaag(omsi, process.env.TEMP ?? '.')

const klok = <T>(doen: () => T): [T, number] => {
  const begin = performance.now()
  const uit = doen()
  return [uit, performance.now() - begin]
}

console.log(
  `${'kaart'.padEnd(28)}${'inlezen'.padStart(9)}${'net'.padStart(8)}${'ritten'.padStart(8)}` +
    `${'zoeken'.padStart(9)}${'diensten'.padStart(9)}`
)

let totaal = 0
for (const folder of listMaps(omsi)) {
  try {
    const [, inlezen] = klok(() => laag.map(folder))
    const [net, netTijd] = klok(() => laag.net(folder))
    let ritten = 0
    for (const lijst of net.departingFrom.values()) ritten += lijst.length

    const [diensten, zoeken] = klok(() =>
      laag.diensten({ mapFolder: folder, targetMinutes: 120, window: 'heledag' })
    )
    totaal += zoeken
    console.log(
      folder.slice(0, 27).padEnd(28) +
        `${inlezen.toFixed(0)} ms`.padStart(9) +
        `${netTijd.toFixed(0)} ms`.padStart(8) +
        String(ritten).padStart(8) +
        `${zoeken.toFixed(0)} ms`.padStart(9) +
        String(diensten.length).padStart(9)
    )
  } catch (fout) {
    console.log(`${folder.slice(0, 27).padEnd(28)} ${(fout as Error).message}`)
  }
}
console.log(`\nzoeken bij elkaar: ${(totaal / 1000).toFixed(1)} s`)
