/**
 * Het wagenpark bij de kaart, voor vrij rijden, over alle bussen en kaarten.
 *
 *   npx tsx scripts/probe-vrijhof.ts
 *
 * Luc: "in de vrije modus werkt de hof file selection niet" en "het moet
 * gewoon de map herkennen en die toepassen". hofVoorKaart (core/hof.ts) kiest
 * bij vrij rijden het wagenpark: dat wat naar de kaart heet, anders dat wat de
 * meeste eindbestemmingen van de kaart kent.
 *
 * Nagelopen:
 * - de O560 op Krefrath krijgt Krefrath.hof, op Grundorf Grundorf.hof;
 * - heeft een bus een wagenpark dat naar de kaart heet, dan wordt dat gekozen;
 * - kent een bus de kaart helemaal niet (geen naam, geen bestemming), dan
 *   niets -- OMSI kiest dan zelf.
 *
 * Leest alleen.
 */
import { existsSync, readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { bestemmingenVan } from '../src/core/haltes'
import { hofVoorKaart, listHofs } from '../src/core/hof'
import { listMaps, loadMap } from '../src/core/timetable'

const ECHT = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const MAPS = join(ECHT, 'maps')
const VEHICLES = join(ECHT, 'Vehicles')
if (!existsSync(MAPS)) {
  console.log('geen OMSI; proef overgeslagen')
  process.exit(0)
}

let fouten = 0
const fout = (tekst: string): void => {
  fouten += 1
  if (fouten <= 12) console.log(`  FOUT ${tekst}`)
}

/* De busmappen met wagenparken: de hof's liggen naast de .bus-bestanden. */
const busmappen = readdirSync(VEHICLES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((naam) => readdirSync(join(VEHICLES, naam)).some((f) => extname(f).toLowerCase() === '.hof'))
const hofsPerBus = new Map(busmappen.map((naam) => [naam, listHofs(join(VEHICLES, naam, 'x.bus'))]))
console.log(`${busmappen.length} busmappen met wagenparken`)

const kaal = (tekst: string): string => tekst.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
for (const folder of listMaps(ECHT)) {
  const kaart = loadMap(MAPS, folder)
  if (!kaart) continue
  const termini = bestemmingenVan(kaart)
  let opNaam = 0
  let opBestemming = 0
  let niets = 0
  for (const [bus, hofs] of hofsPerBus) {
    const keuze = hofVoorKaart(hofs, kaart, termini, 2020)
    const naarKaart = hofs.filter((hof) => {
      const namen = [kaal(hof.name), kaal(basename(hof.file, extname(hof.file)))]
      const kaartNamen = [kaal(kaart.folder), kaal(kaart.name)].filter((n) => n.length >= 4)
      return namen.some((n) => n.length >= 4 && kaartNamen.some((k) => k.includes(n) || n.includes(k)))
    })
    if (naarKaart.length > 0) {
      opNaam += 1
      if (!naarKaart.some((hof) => hof.name === keuze)) fout(`${bus} op ${kaart.name}: koos ${keuze}, niet ${naarKaart.map((h) => h.name).join('/')}`)
    } else if (keuze) opBestemming += 1
    else niets += 1
  }
  console.log(`${kaart.name}: ${termini.length} bestemmingen; ${opNaam} bussen met een wagenpark van deze kaart, ${opBestemming} op bestemming, ${niets} zonder`)
}

/* Het geval van Luc. */
const o560 = hofsPerBus.get('ABCoach_O560') ?? []
for (const [folder, verwacht] of [['Krefrath', 'krefrath'], ['Grundorf', 'grundorf']] as const) {
  const kaart = loadMap(MAPS, folder)
  if (!kaart || o560.length === 0) continue
  const keuze = hofVoorKaart(o560, kaart, bestemmingenVan(kaart), 2020)
  const goed = kaal(keuze ?? '').includes(verwacht) || o560.some((h) => h.name === keuze && kaal(basename(h.file)).includes(verwacht))
  console.log(`O560 op ${kaart.name}: ${keuze}`)
  if (!goed) fout(`O560 op ${kaart.name} kreeg ${keuze}`)
}

console.log(fouten === 0 ? 'bij vrij rijden wordt het wagenpark van de kaart gekozen' : `${fouten} FOUTEN`)
process.exit(fouten === 0 ? 0 : 1)
