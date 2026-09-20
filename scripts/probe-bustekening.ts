/**
 * Hoe zwaar is de tekening van een bus?
 *
 *   npx tsx scripts/probe-bustekening.ts [aantal]
 *
 * Bouwt van een handvol bussen de tekenopdracht en meet wat die kost: hoeveel
 * stukken, hoeveel driehoeken, hoeveel megabyte aan buffers, en hoe lang het
 * duurt. Dat laatste bepaalt of het plaatje eenmalig gemaakt en bewaard moet
 * worden -- wat het antwoord is -- en het eerste of het door de IPC past.
 */
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { bouwBusTekening } from '../src/core/busbeeld'
import { findOmsiInstall } from '../src/core/install'
import { listVehicles, vehicleName } from '../src/core/vehicles'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const hoeveel = Number(process.argv[2] ?? 6)

const bussen = listVehicles(omsi)
/* Een doorsnede: de eerste, de laatste en een paar ertussen. */
const stap = Math.max(1, Math.floor(bussen.length / hoeveel))
const keuze = bussen.filter((_, i) => i % stap === 0).slice(0, hoeveel)

console.log(
  `${'bus'.padEnd(34)}${'stukken'.padStart(8)}${'driehoeken'.padStart(12)}` +
    `${'texturen'.padStart(10)}${'MB'.padStart(7)}${'ms'.padStart(7)}`
)
for (const bus of keuze) {
  const begin = performance.now()
  const tekening = bouwBusTekening(join(omsi, bus.relativePath))
  const ms = performance.now() - begin
  if (!tekening) {
    console.log(`${vehicleName(bus).slice(0, 33).padEnd(34)}  geen tekening`)
    continue
  }
  let bytes = 0
  const texturen = new Set<string>()
  for (const stuk of tekening.stukken) {
    bytes += stuk.posities.byteLength + stuk.normalen.byteLength + stuk.uvs.byteLength + stuk.indices.byteLength
    if (stuk.textuur) texturen.add(stuk.textuur)
  }
  const maat = tekening.doos
  console.log(
    vehicleName(bus).slice(0, 33).padEnd(34) +
      String(tekening.stukken.length).padStart(8) +
      tekening.driehoeken.toLocaleString('nl-NL').padStart(12) +
      String(texturen.size).padStart(10) +
      (bytes / 1024 / 1024).toFixed(1).padStart(7) +
      ms.toFixed(0).padStart(7) +
      `   ${(maat.max[0] - maat.min[0]).toFixed(1)} x ${(maat.max[1] - maat.min[1]).toFixed(1)} x ${(maat.max[2] - maat.min[2]).toFixed(1)} m`
  )
}
