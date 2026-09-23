import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logboek'
import { MOD_CTRL, MOD_SHIFT, readKeyboard, writeKeyboard, type KeyBinding } from './omsiKeys'

/**
 * De knoppen van de apparaten in de bus die OMSI zelf aan geen toets hangt.
 *
 * WAAROM DIT BESTAAT
 * De app laat OMSI een toets indrukken (zie `lees_opdracht` in de plugin), en
 * welke toets dat is zoekt ze op in `Inputs\keyboard.cfg`. Maar daar staan maar
 * veertien IBIS-commando's in. De kaartautomaat van de Thueringer Wald-bus --
 * de AFR 200 -- luistert daarnaast naar dertien eigen namen, en het LAWO-
 * bedieningspaneel naar zeventien. Geen daarvan heeft een toets, en ze zijn in
 * het spel alleen met de muis te bedienen. Vanaf de iPad zijn ze dus onbereikbaar.
 *
 * DAT MAG JE ZELF BIJSCHRIJVEN
 * In Omsi.exe staat maar een handvol commandonamen; van de 128 namen in een
 * gewone keyboard.cfg komen er 79 daar niet in voor -- en die werken gewoon.
 * OMSI bouwt zijn lijst uit de `.osc`-bestanden van de voertuigen zelf, en het
 * spel heeft er een eigen knop voor in Opties > Keyboard ("Add Vehicle Key
 * Event"). keyboard.cfg is niet meer dan de opslag daarvan. Wij schrijven
 * hetzelfde blokje dat die knop zou schrijven.
 *
 * VOORZICHTIG
 * Het bestand is van de speler. Er gaat eerst een kopie naast
 * (`keyboard.omsi-enhancer.bak`), er wordt niets veranderd aan wat er al staat,
 * en alles wat wij toevoegen is met een knop weer weg te halen. OMSI leest het
 * bestand bij het starten, dus het gaat pas gelden als het spel opnieuw op is.
 */

/** Een knop op een apparaat in de bus. */
export interface Bustoets {
  /** De naam waarop het busscript luistert: `{trigger:...}`. */
  actie: string
  /** Wat erop het apparaat zelf staat. */
  opschrift: string
  /** Bij welk apparaat hij hoort; zie `Busapparaat.soort` in busscherm.ts. */
  apparaat: 'afr' | 'lawo' | 'ibis'
}

/**
 * De knoppen die we bereikbaar maken.
 *
 * De AFR-namen en wat ze doen komen uit
 * `Vehicles\TH_Ueberlandbus\Script\afr200.osc`: elke `ticketprinter_button_*`
 * kiest een kaartsoort (de naam erbij is dezelfde die op de knop staat), en
 * `ticketprinter_button_enter` is DRUCKEN. `IBIS_Modul` zet de module erin,
 * `IBIS_Uhr` gaat naar datum en tijd, en `IBIS_vor`/`IBIS_rueck` bladeren door
 * de haltes. De LAWO-namen staan in `LAWO8401.osc`.
 */
export const BUSTOETSEN: Bustoets[] = [
  { actie: 'IBIS_Modul', opschrift: 'U', apparaat: 'afr' },
  { actie: 'IBIS_Uhr', opschrift: 'Z1', apparaat: 'afr' },
  { actie: 'IBIS_vor', opschrift: 'HST VOR', apparaat: 'afr' },
  { actie: 'IBIS_rueck', opschrift: 'HST RUCK', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_1', opschrift: 'KURZ', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_2', opschrift: '24H', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_3', opschrift: 'KIND', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_4', opschrift: 'KIND KURZ', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_grp', opschrift: 'GRP', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_mo', opschrift: 'MO', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_wo', opschrift: 'WO', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_smo', opschrift: 'SMO', apparaat: 'afr' },
  { actie: 'ticketprinter_button_ticket_swo', opschrift: 'SWO', apparaat: 'afr' },
  { actie: 'ticketprinter_button_enter', opschrift: 'DRUCKEN', apparaat: 'afr' },
  { actie: 'ticketprinter_getticket', opschrift: 'KAARTJE GEVEN', apparaat: 'afr' },
  { actie: 'LAWO_Taste_MODE', opschrift: 'MODE', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_ENTER', opschrift: 'ENTER', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_CE', opschrift: 'CE', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_L', opschrift: 'L', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_M', opschrift: 'M', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_A', opschrift: 'A', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_B', opschrift: 'B', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_0', opschrift: '0', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_1', opschrift: '1', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_2', opschrift: '2', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_3', opschrift: '3', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_4', opschrift: '4', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_5', opschrift: '5', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_6', opschrift: '6', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_7', opschrift: '7', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_8', opschrift: '8', apparaat: 'lawo' },
  { actie: 'LAWO_Taste_9', opschrift: '9', apparaat: 'lawo' }
]

/**
 * Toetsen waar we ze aan mogen hangen.
 *
 * Ctrl+Shift erbij, want die combinatie gebruikt OMSI nergens: van de 128
 * bindingen staat er geen enkele op 6. Het numerieke blok eerst -- dat ligt bij
 * elkaar en OMSI gebruikt het al voor de IBIS -- daarna de letters.
 */
const KANDIDATEN: number[] = [
  79, 80, 81, 75, 76, 77, 71, 72, 73, 82, 83, 74, 78, 55, 181,
  30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31, 20, 22, 47, 17, 45, 21, 44
]
const KANDIDAAT_MOD = MOD_CTRL | MOD_SHIFT

function backupPad(omsiPath: string): string {
  return join(omsiPath, 'Inputs', 'keyboard.omsi-enhancer.bak')
}

/** Hoe het ervoor staat: wat ontbreekt er, en hebben wij al iets bijgeschreven? */
export function toetsenStand(omsiPath: string): {
  ontbreekt: Bustoets[]
  aanwezig: Bustoets[]
  backup: boolean
} {
  let bindings: KeyBinding[] = []
  try {
    bindings = readKeyboard(omsiPath)
  } catch {
    return { ontbreekt: BUSTOETSEN, aanwezig: [], backup: false }
  }
  const bekend = new Set(bindings.map((binding) => binding.action.toLowerCase()))
  return {
    ontbreekt: BUSTOETSEN.filter((toets) => !bekend.has(toets.actie.toLowerCase())),
    aanwezig: BUSTOETSEN.filter((toets) => bekend.has(toets.actie.toLowerCase())),
    backup: existsSync(backupPad(omsiPath))
  }
}

/**
 * Schrijft de ontbrekende knoppen bij, elk op een vrije toetscombinatie.
 *
 * Wat er al stond blijft staan; er wordt alleen achteraan de sectie
 * `[vehicles]` bijgeschreven, net zoals OMSI zelf doet. Geeft terug hoeveel er
 * bij kwamen.
 */
export function zetBustoetsen(omsiPath: string): { toegevoegd: number; geenPlek: number } {
  const bindings = readKeyboard(omsiPath)
  const bezet = new Set(bindings.map((binding) => `${binding.scancode}|${binding.modifiers}`))
  const bekend = new Set(bindings.map((binding) => binding.action.toLowerCase()))
  /* De sectie waar de knoppen van voertuigen in horen; zonder die sectie achteraan. */
  const sectie = bindings.some((binding) => binding.section === 'vehicles') ? 'vehicles' : (bindings[bindings.length - 1]?.section ?? 'game')

  if (!existsSync(backupPad(omsiPath))) {
    try {
      copyFileSync(join(omsiPath, 'Inputs', 'keyboard.cfg'), backupPad(omsiPath))
    } catch (fout) {
      log(`kopie van keyboard.cfg maken mislukt: ${String(fout)}`)
    }
  }

  let toegevoegd = 0
  let geenPlek = 0
  for (const toets of BUSTOETSEN) {
    if (bekend.has(toets.actie.toLowerCase())) continue
    const scancode = KANDIDATEN.find((code) => !bezet.has(`${code}|${KANDIDAAT_MOD}`))
    if (scancode === undefined) {
      geenPlek += 1
      continue
    }
    bezet.add(`${scancode}|${KANDIDAAT_MOD}`)
    bindings.push({ action: toets.actie, section: sectie, scancode, modifiers: KANDIDAAT_MOD })
    toegevoegd += 1
  }
  if (toegevoegd > 0) writeKeyboard(omsiPath, bindings)
  log(`busknoppen in keyboard.cfg: ${toegevoegd} bijgeschreven, ${geenPlek} zonder vrije toets`)
  return { toegevoegd, geenPlek }
}

/** Haalt onze eigen regels er weer uit; wat de speler zelf had blijft staan. */
export function haalBustoetsenWeg(omsiPath: string): number {
  const bindings = readKeyboard(omsiPath)
  const onze = new Set(BUSTOETSEN.map((toets) => toets.actie.toLowerCase()))
  const over = bindings.filter(
    (binding) => !(onze.has(binding.action.toLowerCase()) && binding.modifiers === KANDIDAAT_MOD)
  )
  const weg = bindings.length - over.length
  if (weg > 0) writeKeyboard(omsiPath, over)
  log(`busknoppen uit keyboard.cfg: ${weg} weggehaald`)
  return weg
}
