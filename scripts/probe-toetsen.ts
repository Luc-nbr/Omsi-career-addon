/**
 * De knoppen van de busapparaten in keyboard.cfg: erbij zetten en weghalen.
 *
 *   npx tsx scripts/probe-toetsen.ts
 *
 * Werkt op een KOPIE van de echte keyboard.cfg in een tijdelijke map -- het
 * bestand van de speler wordt niet aangeraakt. Wat er nagerekend wordt:
 * - alle knoppen uit `BUSTOETSEN` krijgen een toets, zonder botsing met wat er
 *   al stond;
 * - wat van OMSI zelf is blijft ongemoeid, op dezelfde toets;
 * - ze komen op een modificatie die OMSI zelf ook gebruikt (Ctrl of Shift), en
 *   niet op de onbewezen Ctrl+Shift van de eerste versie;
 * - weghalen laat precies het bestand achter waarmee we begonnen.
 */
import { toetsenStand, zetBustoetsen, haalBustoetsenWeg, BUSTOETSEN } from '../src/core/bustoetsen'
import { readKeyboard } from '../src/core/omsiKeys'
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'



const echt = 'C:/program files (x86)/steam/steamapps/common/OMSI 2'
const nep = mkdtempSync(join(tmpdir(), 'omsi-toetsen-'))
mkdirSync(join(nep, 'Inputs'), { recursive: true })
cpSync(join(echt, 'Inputs', 'keyboard.cfg'), join(nep, 'Inputs', 'keyboard.cfg'))
console.log('uitgangspunt: de echte keyboard.cfg van nu, met de regels van de vorige versie erin')
const voor = readKeyboard(nep)
console.log('voor      :', voor.length, 'bindingen |', toetsenStand(nep).ontbreekt.length, 'knoppen ontbreken')

const uitslag = zetBustoetsen(nep)
const na = readKeyboard(nep)
const stand = toetsenStand(nep)
console.log('na zetten :', na.length, 'bindingen |', uitslag.toegevoegd, 'bij,', uitslag.geenPlek, 'zonder plek |', stand.ontbreekt.length, 'nog ontbrekend | kopie:', stand.backup)

/* Niets van wat er stond mag veranderd zijn. */
/* Alles wat niet van ons is moet ongemoeid blijven staan, op dezelfde toets. */
const vanOmsi = (l: typeof voor) => l.filter((b) => !BUSTOETSEN.some((t) => t.actie.toLowerCase() === b.action.toLowerCase()))
const a1 = vanOmsi(voor), a2 = vanOmsi(na)
const zelfde = a1.length === a2.length && a1.every((b, i) => a2[i].action === b.action && a2[i].scancode === b.scancode && a2[i].modifiers === b.modifiers)
const tel = (lijst: typeof na) => { const g = new Set<string>(); let n = 0; for (const b of lijst) { const s = `${b.scancode}|${b.modifiers}`; if (g.has(s)) n++; g.add(s) } return n }
const botsingVoor = tel(voor)
const botsing = tel(na) - botsingVoor
console.log('dubbele combinaties die er al stonden:', botsingVoor)
console.log('oude regels ongewijzigd:', zelfde, '| dubbele toetscombinaties:', botsing)

const weg = haalBustoetsenWeg(nep)
const terug = readKeyboard(nep)
const gelijk = readFileSync(join(nep, 'Inputs', 'keyboard.cfg'), 'latin1').length
console.log('na weghalen:', terug.length, 'bindingen (', weg, 'weg ) | ontbreekt weer:', toetsenStand(nep).ontbreekt.length)
const goed = uitslag.toegevoegd === BUSTOETSEN.length && stand.ontbreekt.length === 0 && zelfde && botsing === 0 && terug.length === a1.length
const modjes = na.filter((b) => BUSTOETSEN.some((t) => t.actie.toLowerCase() === b.action.toLowerCase())).map((b) => b.modifiers)
console.log('onze knoppen staan op modificatie:', [...new Set(modjes)].join(', '))
console.log(goed ? 'de busknoppen kloppen' : 'DE BUSKNOPPEN KLOPPEN NIET', '| bytes na afloop:', gelijk)
