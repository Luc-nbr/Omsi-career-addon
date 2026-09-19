/**
 * Komt OMSI op de goede kaart binnen?
 *
 *   npx tsx scripts/probe-startscherm.ts "<pad naar OMSI 2>"
 *
 * Leest alleen, en verandert niets in de spelmap.
 *
 * Het startscherm van OMSI opent op de kaart uit `[last_map]` in `options.cfg`
 * en zet bovenaan de lijst "Last Situation": dat is `maps\<kaart>\laststn.osn`.
 * De app zet allebei klaar. Deze proef kijkt of dat ook kan en of het nog staat:
 *
 * - mogen we in `options.cfg` en in de kaartmappen schrijven? Zonder rechten
 *   mislukt het klaarzetten stil, en dan kom je op de kaart van de vorige keer;
 * - wijst `[last_map]` naar de kaart waar onze situatie ligt?
 * - en vooral: heeft OMSI `options.cfg` ná ons geschreven? Het spel schrijft dat
 *   bestand bij het afsluiten opnieuw, met de kaart die het zelf net speelde. Is
 *   dat later dan onze situatie, dan heeft het spel onze keuze overschreven.
 */
import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const omsi = process.argv[2]
if (!omsi || !existsSync(omsi)) {
  console.error('Geef het pad naar de OMSI 2-map.')
  process.exit(1)
}

function schrijfbaar(pad: string): boolean {
  try {
    accessSync(pad, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function tijd(pad: string): Date | undefined {
  try {
    return statSync(pad).mtime
  } catch {
    return undefined
  }
}

const opties = join(omsi, 'options.cfg')
console.log(`options.cfg  schrijfbaar: ${schrijfbaar(opties) ? 'ja' : 'NEE'}`)
const optiesTijd = tijd(opties)
console.log(`             geschreven:  ${optiesTijd?.toLocaleString('nl-NL') ?? 'onbekend'}`)

let lastMap = ''
try {
  const regels = readFileSync(opties, 'latin1').split('\r\n')
  const at = regels.findIndex((r) => r.trim() === '[last_map]')
  if (at >= 0) lastMap = (regels[at + 1] ?? '').trim()
} catch {
  // Onleesbaar; dan zegt de regel hieronder dat al.
}
console.log(`             [last_map]:  ${lastMap || 'LEEG'}\n`)

/** De situatie die de app neerzet, herken je aan de naam bovenin. */
function vanOns(pad: string): boolean {
  try {
    const ruw = readFileSync(pad)
    const tekst = ruw[0] === 0xff && ruw[1] === 0xfe ? ruw.toString('utf16le') : ruw.toString('latin1')
    return /OMSI (Enhancer|Career)/.test(tekst.slice(0, 400))
  } catch {
    return false
  }
}

const kaarten = join(omsi, 'maps')
let nieuwste: { kaart: string; tijd: Date } | undefined

for (const kaart of readdirSync(kaarten)) {
  const map = join(kaarten, kaart)
  try {
    if (!statSync(map).isDirectory()) continue
  } catch {
    continue
  }
  const laatste = join(map, 'laststn.osn')
  const t = tijd(laatste)
  const ons = existsSync(laatste) && vanOns(laatste)
  if (ons && t && (!nieuwste || t > nieuwste.tijd)) nieuwste = { kaart, tijd: t }
  console.log(
    `${kaart.padEnd(26)} map schrijfbaar: ${schrijfbaar(map) ? 'ja ' : 'NEE'}  ` +
      `laststn.osn: ${existsSync(laatste) ? (ons ? 'van ons ' : 'van OMSI') : 'ontbreekt'}  ` +
      `${t ? t.toLocaleString('nl-NL') : ''}`
  )
}

console.log()
if (!nieuwste) {
  console.log('Er staat nergens een situatie van de app klaar.')
} else {
  const hoort = `maps\\${nieuwste.kaart}\\global.cfg`
  console.log(`Onze nieuwste situatie staat op ${nieuwste.kaart} (${nieuwste.tijd.toLocaleString('nl-NL')}).`)
  console.log(`[last_map] zou dan ${hoort} moeten zijn.`)
  console.log(
    lastMap.toLowerCase() === hoort.toLowerCase()
      ? 'Dat klopt: OMSI opent op de goede kaart.'
      : `MAAR ER STAAT: ${lastMap || 'niets'} -- OMSI opent op de verkeerde kaart.`
  )
  if (optiesTijd && optiesTijd > nieuwste.tijd) {
    console.log(
      '\nEn options.cfg is LATER geschreven dan onze situatie. OMSI schrijft dat\n' +
        'bestand bij het afsluiten opnieuw, met de kaart die het zelf speelde --\n' +
        'dus heeft het spel onze keuze overschreven.'
    )
  }
}
