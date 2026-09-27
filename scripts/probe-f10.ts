/**
 * Geen knop meer op F10 of Shift+`, en wat er al stond verhuist.
 *
 *   npx tsx scripts/probe-f10.ts
 *
 * Luc, 26-09: "mijn omsi verliest telkens focus, waardoor omsi tijdelijk geen
 * inputs krijgt en het beeld bevriest zonder dat de simulatie stopt". Het
 * logboek van de plugin: na Shift+F10 kwamen de volgende tikken niet meer aan.
 * F10 is in Windows de menutoets; zie verbodenToets in core/bustoetsen.ts.
 *
 * Op een KOPIE van de keyboard.cfg van de speler (en zijn kopie van voor ons
 * eerste bijschrijven), in een eigen map. Het echte bestand wordt alleen gelezen.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aantalVerbodenToetsen,
  bruikbareToetsen,
  verbodenToets,
  verlegVerbodenToetsen,
  zetBustoetsen
} from '../src/core/bustoetsen'
import { readKeyboard, readKeyboardFile } from '../src/core/omsiKeys'

const ECHT = 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
let fouten = 0
const toets = (goed: boolean, wat: string): void => {
  console.log(`  ${goed ? 'ok ' : 'FOUT'} ${wat}`)
  if (!goed) fouten += 1
}

if (!existsSync(join(ECHT, 'Inputs', 'keyboard.cfg'))) {
  console.log('geen OMSI; proef overgeslagen')
  process.exit(0)
}
const nep = mkdtempSync(join(tmpdir(), 'omsi-f10-'))
mkdirSync(join(nep, 'Inputs'))
cpSync(join(ECHT, 'Inputs', 'keyboard.cfg'), join(nep, 'Inputs', 'keyboard.cfg'))
const bak = join(ECHT, 'Inputs', 'keyboard.omsi-enhancer.bak')
if (existsSync(bak)) cpSync(bak, join(nep, 'Inputs', 'keyboard.omsi-enhancer.bak'))

const vanDeSpeler = new Set(
  existsSync(bak) ? readKeyboardFile(bak).map((b) => b.action.toLowerCase()) : []
)
const voor = readKeyboard(nep)
const opF10 = voor.filter((b) => verbodenToets(b.scancode, b.modifiers))
const onzeOpF10 = opF10.filter((b) => !vanDeSpeler.has(b.action.toLowerCase()))
console.log(`in de kopie: ${voor.length} regels, ${opF10.length} op F10 of Shift+\`, waarvan ${onzeOpF10.length} van de app`)
console.log(`  ${onzeOpF10.map((b) => `${b.action}=${b.scancode}/${b.modifiers}`).join(', ')}`)

/* 1. Een knop op F10 telt niet als "aan een toets": dan drukt de app hem niet in. */
if (onzeOpF10.length > 0) {
  const bruikbaar = new Set(bruikbareToetsen(nep, onzeOpF10.map((b) => b.action)).map((a) => a.toLowerCase()))
  toets(onzeOpF10.every((b) => !bruikbaar.has(b.action.toLowerCase())), 'een knop op F10 telt niet als bruikbaar')
}
toets(aantalVerbodenToetsen(nep) === onzeOpF10.length, `de telling klopt (${aantalVerbodenToetsen(nep)})`)

/* 2. Verhuizen. */
const uit = verlegVerbodenToetsen(nep)
const na = readKeyboard(nep)
toets(uit.verlegd + uit.weg === onzeOpF10.length, `verlegd ${uit.verlegd}, zonder plek ${uit.weg}`)
toets(
  na.filter((b) => verbodenToets(b.scancode, b.modifiers) && !vanDeSpeler.has(b.action.toLowerCase())).length === 0,
  'geen knop van de app meer op F10 of Shift+`'
)
toets(
  opF10.filter((b) => vanDeSpeler.has(b.action.toLowerCase())).every((b) =>
    na.some((n) => n.action === b.action && n.scancode === b.scancode && n.modifiers === b.modifiers)
  ),
  'wat de speler zelf op F10 zette, staat er nog'
)
const sleutels = new Set<string>()
let dubbel = 0
for (const b of na.filter((n) => onzeOpF10.some((o) => o.action === n.action))) {
  const k = `${b.scancode}|${b.modifiers}`
  if (na.filter((n) => `${n.scancode}|${n.modifiers}` === k).length > 1) dubbel += 1
  sleutels.add(k)
}
toets(dubbel === 0, 'de verhuisde knoppen staan elk op een eigen, vrije toets')
toets(voor.length - uit.weg === na.length, `er is niets anders verdwenen (${voor.length} -> ${na.length})`)
if (uit.verlegd > 0) {
  const nu = new Set(bruikbareToetsen(nep, onzeOpF10.map((b) => b.action)).map((a) => a.toLowerCase()))
  toets(onzeOpF10.every((b) => nu.has(b.action.toLowerCase())), 'na het verhuizen zijn ze weer bruikbaar')
}
toets(aantalVerbodenToetsen(nep) === 0, 'een tweede keer is er niets meer te verhuizen')

/*
 * 3. Bijschrijven vult alle vrije toetsen, en komt nooit op F10 of Shift+`.
 * Op een schone keyboard.cfg -- die van de speler van voor de app -- want de
 * echte zit vol: daar is geen vrije toets meer, en dan valt er niets te zien.
 */
const schoon = mkdtempSync(join(tmpdir(), 'omsi-f10-schoon-'))
mkdirSync(join(schoon, 'Inputs'))
cpSync(existsSync(bak) ? bak : join(ECHT, 'Inputs', 'keyboard.cfg'), join(schoon, 'Inputs', 'keyboard.cfg'))
const veel = Array.from({ length: 150 }, (_, i) => `proef_knop_${i}`)
zetBustoetsen(schoon, veel)
const vol = readKeyboard(schoon).filter((b) => b.action.startsWith('proef_knop_'))
toets(vol.length > 0, `${vol.length} proefknoppen bijgeschreven`)
toets(vol.every((b) => !verbodenToets(b.scancode, b.modifiers)), 'geen enkele op F10 of Shift+`')

console.log(fouten === 0 ? 'F10 en Shift+` blijven van OMSI af' : `${fouten} CONTROLES MISLUKT`)
process.exit(fouten === 0 ? 0 : 1)
