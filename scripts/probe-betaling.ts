/**
 * Wat een half gereden dienst oplevert.
 *
 *   npx tsx scripts/probe-betaling.ts
 *
 * Sinds een dienst ook afgesloten wordt door de app te sluiten, moest de
 * betaling meebewegen: anders levert een dienst die je na één halte afbreekt
 * evenveel op als een dienst die je uitrijdt. Dat is niet alleen oneerlijk, het
 * is ook een uitnodiging.
 *
 * De regel eromheen is even belangrijk: wat niet gemeten kon worden -- OMSI
 * draaide niet, of de bus geeft geen haltes door -- telt voor vol. Een chauffeur
 * hoort niet te betalen voor een plugin die niets doorgaf.
 */
import { dutyPay, partialPay } from '../src/core/career'
import type { Duty } from '../src/core/types'

const dienst = { durationMinutes: 120, totalStops: 40 } as Duty
const heel = dutyPay(dienst)

const gevallen: Array<[string, number | undefined, number]> = [
  ['uitgereden', 40, heel],
  ['halverwege', 20, Math.round(heel * 0.5 * 100) / 100],
  ['na een kwart', 10, Math.round(heel * 0.25 * 100) / 100],
  ['meteen gestopt', 0, 0],
  ['niets gemeten', undefined, heel],
  ['meer dan er zijn', 60, heel]
]

let mis = 0
console.log(`een hele dienst van 2 uur en 40 haltes: ${heel.toFixed(2)}`)
for (const [naam, haltes, verwacht] of gevallen) {
  const uit = partialPay(dienst, haltes)
  const goed = Math.abs(uit - verwacht) < 0.005
  if (!goed) mis += 1
  console.log(
    `   ${naam.padEnd(18)} ${String(haltes ?? '-').padStart(3)} haltes -> ` +
      `${uit.toFixed(2).padStart(7)}${goed ? '' : `   MISLUKT, verwacht ${verwacht.toFixed(2)}`}`
  )
}

// Een dienst zonder haltes mag niet door nul delen.
const leeg = partialPay({ durationMinutes: 60, totalStops: 0 } as Duty, 0)
console.log(`   dienst zonder haltes -> ${leeg.toFixed(2)} (mag niet NaN zijn)`)
if (!Number.isFinite(leeg)) mis += 1

console.log(mis === 0 ? 'alles klopt' : `${mis} gevallen kloppen niet`)
process.exit(mis === 0 ? 0 : 1)
