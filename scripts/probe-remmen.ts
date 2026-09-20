/**
 * Wanneer telt remmen als hard remmen?
 *
 *   npx tsx scripts/probe-remmen.ts
 *
 * Chauffeurs klaagden dat de app al aansloeg bij een stop die wat steviger is
 * dan gemiddeld. De telling zit in de plugin (C, in het spel geladen) en valt
 * daar niet te draaien zonder OMSI, dus staat hier dezelfde rekensom nog een
 * keer: gladstrijken, drempel, vasthouden, loslaten -- regel voor regel gelijk
 * aan `omsicareer.c`.
 *
 * Daarmee is te zien wat de oude en de nieuwe grens doen met ritten die je
 * herkent: rustig uitrollen, stevig remmen voor een halte, een auto die invoegt,
 * en een noodstop. Alleen die laatste hoort te tellen.
 */

/** Zoals in de plugin: gewicht van een nieuwe meting in het gemiddelde. */
const SMOOTH = 0.25
const RELEASE_RATIO = 0.6
const MIN_SPEED_KMH = 5

interface Grens {
  naam: string
  drempel: number
  vasthouden: number
}

const OUD: Grens = { naam: 'oud (3,0 m/s2, 0,25 s)', drempel: 3.0, vasthouden: 0.25 }
const NIEUW: Grens = { naam: 'nieuw (3,5 m/s2, 0,35 s)', drempel: 3.5, vasthouden: 0.35 }

/** Een remactie: van `van` naar `naar` km/u met deze vertraging, plus meetruis. */
function rit(vanKmh: number, naarKmh: number, vertraging: number, ruis = 0.25): number[] {
  const stap = 1 / 60
  const snelheden: number[] = []
  let v = vanKmh / 3.6
  const eind = naarKmh / 3.6
  // Een seconde constant rijden vooraf, zodat het gemiddelde ergens begint.
  for (let i = 0; i < 60; i++) snelheden.push(v * 3.6)
  let beurt = 0
  while (v > eind && beurt < 60 * 30) {
    // De snelheid uit het spel springt een beetje; dat is de ruis.
    v = Math.max(eind, v - vertraging * stap) + (Math.random() - 0.5) * ruis * stap * 60 * 0.1
    snelheden.push(Math.max(0, v * 3.6))
    beurt++
  }
  for (let i = 0; i < 30; i++) snelheden.push(Math.max(0, eind * 3.6))
  return snelheden
}

/** De telling van de plugin, op een reeks snelheden van zestig per seconde. */
function tel(snelheden: number[], grens: Grens): number {
  const stap = 1 / 60
  let gemiddelde = 0
  let vastgehouden = 0
  let geteld = 0
  let aantal = 0
  for (let i = 1; i < snelheden.length; i++) {
    const ruw = (snelheden[i] - snelheden[i - 1]) / 3.6 / stap
    gemiddelde = gemiddelde * (1 - SMOOTH) + ruw * SMOOTH
    if (snelheden[i] < MIN_SPEED_KMH) {
      vastgehouden = 0
      geteld = 0
      continue
    }
    const remmen = gemiddelde < 0 ? -gemiddelde : 0
    if (remmen >= grens.drempel) {
      vastgehouden += stap
      if (!geteld && vastgehouden >= grens.vasthouden) {
        aantal++
        geteld = 1
      }
    } else if (remmen < grens.drempel * RELEASE_RATIO) {
      vastgehouden = 0
      geteld = 0
    }
  }
  return aantal
}

const gevallen: Array<{ wat: string; snelheden: number[]; hoort: boolean }> = [
  { wat: 'uitrollen voor een halte (1,2 m/s2)', snelheden: rit(50, 0, 1.2), hoort: false },
  { wat: 'normaal remmen voor een halte (2,0)', snelheden: rit(50, 0, 2.0), hoort: false },
  { wat: 'stevig remmen, net wat harder (2,8)', snelheden: rit(50, 0, 2.8), hoort: false },
  { wat: 'auto voegt in, korte dreun (3,2)', snelheden: rit(50, 25, 3.2), hoort: false },
  { wat: 'noodstop (5,0)', snelheden: rit(50, 0, 5.0), hoort: true },
  { wat: 'voluit in de ankers (6,5)', snelheden: rit(60, 0, 6.5), hoort: true }
]

console.log('remactie'.padEnd(38) + OUD.naam.padStart(24) + NIEUW.naam.padStart(26))
let mis = 0
for (const geval of gevallen) {
  const oud = tel(geval.snelheden, OUD)
  const nieuw = tel(geval.snelheden, NIEUW)
  const goed = (nieuw > 0) === geval.hoort
  if (!goed) mis += 1
  console.log(
    geval.wat.padEnd(38) +
      String(oud).padStart(20) +
      'x' +
      String(nieuw).padStart(24) +
      'x' +
      (goed ? '' : '   MISLUKT') +
      (geval.hoort ? '   (hoort te tellen)' : '')
  )
}
console.log(mis === 0 ? 'de nieuwe grens telt precies de noodstops' : `${mis} gevallen kloppen niet`)
process.exit(mis === 0 ? 0 : 1)
