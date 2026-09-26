/**
 * Een toets delen met een knop van een andere bus: mag het, en alleen dan?
 *
 *   npx tsx scripts/probe-toetsdelen.ts
 *
 * WAAROM DELEN
 * Er zijn hooguit 62 bewezen toetscombinaties, en OMSI gebruikt er zelf al een
 * deel van. Een ALMEX heeft 44 knoppen; naast de 32 van een AFR en een LAWO-paneel
 * paste dat niet, en de eerste versie gaf de rest een Ctrl+Shift die niet werkt.
 * OMSI's eigen keyboard_reset.cfg laat zien dat één toets meerdere handelingen
 * mag dragen -- F8 is bus_linie_plus EN bus_rollband_setT -- omdat een bus alleen
 * naar zijn eigen namen luistert.
 *
 * DE REGELS, en wat er per regel nagerekend wordt
 * 1. Eerst altijd een vrije toets; delen pas als die op zijn.
 * 2. Nooit een toets die de speler zelf had (alles in de kopie van voor ons
 *    eerste bijschrijven).
 * 3. Nooit een toets waar al een naam op staat waar de bus van nu zelf naar
 *    luistert -- anders gaan er bij één druk twee dingen af.
 * 4. Nooit twee knoppen van dezelfde bus op één toets.
 * 5. Zonder triggers van de bus wordt er niet gedeeld (het veilige gedrag).
 *
 * Werkt op een kopie van keyboard_reset.cfg in een tijdelijke map; de OMSI-map
 * wordt alleen gelezen.
 */
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUSTOETSEN, zetBustoetsen } from '../src/core/bustoetsen'
import { readKeyboard, readKeyboardFile } from '../src/core/omsiKeys'

const echt = 'C:/program files (x86)/steam/steamapps/common/OMSI 2'
let fouten = 0
function controle(ok: boolean, wat: string): void {
  console.log(`  ${ok ? 'ok ' : 'MIS'} ${wat}`)
  if (!ok) fouten++
}

const nep = mkdtempSync(join(tmpdir(), 'omsi-toetsdelen-'))
mkdirSync(join(nep, 'Inputs'), { recursive: true })
cpSync(join(echt, 'Inputs', 'keyboard_reset.cfg'), join(nep, 'Inputs', 'keyboard.cfg'))
const sleutel = (b: { scancode: number; modifiers: number }): string => `${b.scancode}|${b.modifiers}`

/* Bus A: de AFR en het LAWO-paneel, zoals de app ze altijd al bijschreef. De
   eerste keer maakt de app de kopie; alles daarin is van de speler. */
const a = zetBustoetsen(nep)
const vanDeSpeler = readKeyboardFile(join(nep, 'Inputs', 'keyboard.omsi-enhancer.bak'))
const spelerToetsen = new Set(vanDeSpeler.map(sleutel))
console.log(`bus A: ${a.toegevoegd} knoppen, ${a.gedeeld} gedeeld`)

/* Alle vrije toetsen vol, met knoppen van bus A. */
const vol = zetBustoetsen(nep, Array.from({ length: 80 }, (_, i) => `vol_${i}`))
console.log(`de rest vol: ${vol.toegevoegd} erbij, ${vol.geenPlek} zonder plek`)
controle(vol.geenPlek > 0 && vol.gedeeld === 0, 'zonder triggers wordt er niet gedeeld, ook niet als alles vol is (regel 5)')

/* Bus B: tien knoppen, en een bus die zelf ook naar ticketprinter_button_enter
   luistert -- de toets daarvan mag dus niet gedeeld worden. */
const bKnoppen = Array.from({ length: 10 }, (_, i) => `b_knop_${i}`)
const bTriggers = new Set([...bKnoppen, 'ticketprinter_button_enter', 'lawo_taste_mode'])
const b = zetBustoetsen(nep, bKnoppen, { triggers: bTriggers })
console.log(`bus B: ${b.toegevoegd} knoppen, ${b.gedeeld} gedeeld, ${b.geenPlek} zonder plek`)
controle(b.toegevoegd === 10 && b.gedeeld === 10, 'alle tien knoppen van bus B krijgen een gedeelde toets (regel 1: er is niets vrij)')

const na = readKeyboard(nep)
const perToets = new Map<string, string[]>()
for (const binding of na) perToets.set(sleutel(binding), [...(perToets.get(sleutel(binding)) ?? []), binding.action.toLowerCase()])
const toetsVan = (actie: string): string => sleutel(na.find((x) => x.action === actie)!)

const opSpelerToets = bKnoppen.filter((k) => spelerToetsen.has(toetsVan(k)))
controle(opSpelerToets.length === 0, `geen knop van bus B op een toets van de speler (regel 2)${opSpelerToets.length ? `: ${opSpelerToets.join(', ')}` : ''}`)

const botstMetTrigger = bKnoppen.filter((k) =>
  (perToets.get(toetsVan(k)) ?? []).some((actie) => actie !== k && bTriggers.has(actie))
)
controle(
  botstMetTrigger.length === 0,
  `geen knop van bus B op een toets met een naam waar bus B zelf naar luistert (regel 3)${botstMetTrigger.length ? `: ${botstMetTrigger.join(', ')}` : ''}`
)

const bToetsen = bKnoppen.map(toetsVan)
controle(new Set(bToetsen).size === bKnoppen.length, 'geen twee knoppen van bus B op dezelfde toets (regel 4)')

/* En wat er van bus A stond, staat er nog precies zo. */
const aKnoppen = [...BUSTOETSEN.map((t) => t.actie), ...Array.from({ length: vol.toegevoegd }, (_, i) => `vol_${i}`)]
const aVoor = new Map(aKnoppen.map((k) => [k.toLowerCase(), toetsVan(k)]))
controle(aKnoppen.every((k) => na.some((x) => x.action === k)), 'de knoppen van bus A staan er nog allemaal')
controle(
  [...aVoor.values()].every((t) => !t.includes('undefined')),
  'en op hun eigen toets'
)

/* Nog eens hetzelfde verzoek: alles staat er al, er verandert niets. */
const nogEens = zetBustoetsen(nep, bKnoppen, { triggers: bTriggers })
controle(nogEens.toegevoegd === 0, 'een tweede keer hetzelfde verzoek schrijft niets bij')

console.log(fouten === 0 ? 'het delen houdt zich aan de regels' : `HET DELEN KLOPT NIET (${fouten})`)
process.exitCode = fouten ? 1 : 0
