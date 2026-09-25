import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { OMSI_TOETSEN } from '../shared/telefoon'
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
 * Toetsen waar we de knoppen aan mogen hangen.
 *
 * WAAROM CTRL EN NIET CTRL+SHIFT
 * Eerst stond hier Ctrl+Shift, want dat gebruikt OMSI nergens. Precies daarom
 * was het ook nergens bewezen: geen van de 128 bindingen van het spel staat op
 * 6, dus of OMSI die combinatie überhaupt herkent viel nergens aan af te lezen
 * -- en in de praktijk deden de knoppen niets. Ctrl alleen is wel bewezen: de
 * IBIS-cijfers staan erop, en "Quit OMSI" ook.
 *
 * De letters en de functietoetsen dus, met Ctrl. Wat al bezet is valt vanzelf
 * af; komen we tekort, dan Shift en als laatste toch Ctrl+Shift.
 */
const LETTERS = [
  30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 19, 31, 20, 22, 47, 17, 45, 21, 44
]
const FUNCTIETOETSEN = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88]
const KANDIDATEN: { scancode: number; modifiers: number }[] = [
  ...LETTERS.map((scancode) => ({ scancode, modifiers: MOD_CTRL })),
  ...FUNCTIETOETSEN.map((scancode) => ({ scancode, modifiers: MOD_CTRL })),
  ...LETTERS.map((scancode) => ({ scancode, modifiers: MOD_SHIFT })),
  ...LETTERS.map((scancode) => ({ scancode, modifiers: MOD_CTRL | MOD_SHIFT }))
]

/**
 * Modificaties waarvan we weten dat OMSI ze doorgeeft, omdat het spel ze zelf
 * gebruikt. Staat een van onze knoppen op iets anders, dan is hij van een
 * eerdere versie van de app en hoort hij opnieuw gelegd te worden.
 */
const GOEDE_MOD = [MOD_CTRL, MOD_SHIFT, 0]

/**
 * Welke toetsen die de telefoon kan indrukken er werkelijk liggen.
 *
 * Alles uit `OMSI_TOETSEN` dat in keyboard.cfg staat op een modificatie die
 * OMSI zelf ook gebruikt. Een knop die op een onbewezen combinatie staat telt
 * niet mee: hij zou er in de app uitzien alsof hij werkt.
 */
export function bruikbareToetsen(omsiPath: string): string[] {
  let bindings: KeyBinding[] = []
  try {
    bindings = readKeyboard(omsiPath)
  } catch {
    return []
  }
  const goed = new Set(
    bindings
      .filter((binding) => GOEDE_MOD.includes(binding.modifiers & ~1))
      .map((binding) => binding.action.toLowerCase())
  )
  return Object.values(OMSI_TOETSEN).filter((naam) => goed.has(naam.toLowerCase()))
}

function backupPad(omsiPath: string): string {
  return join(omsiPath, 'Inputs', 'keyboard.omsi-enhancer.bak')
}

/**
 * Hoe het ervoor staat voor een lijst knoppen.
 *
 * De lijst komt uit de apparaten die op dat moment in de telefoon staan -- het
 * handgemaakte profiel van deze bus, of wat de app zelf uit het model heeft
 * samengesteld (core/busmodule.ts). Zo krijgt elke bus zijn eigen knoppen aan
 * een toets, ook een bus die we nooit gezien hebben.
 */
export function toetsenStandVan(omsiPath: string, acties: string[]): {
  ontbreekt: string[]
  aanwezig: string[]
  backup: boolean
} {
  let bindings: KeyBinding[] = []
  try {
    bindings = readKeyboard(omsiPath)
  } catch {
    return { ontbreekt: acties, aanwezig: [], backup: false }
  }
  const goed = new Set(
    bindings
      .filter((binding) => GOEDE_MOD.includes(binding.modifiers & ~1))
      .map((binding) => binding.action.toLowerCase())
  )
  const uniek = [...new Set(acties)]
  return {
    ontbreekt: uniek.filter((actie) => !goed.has(actie.toLowerCase())),
    aanwezig: uniek.filter((actie) => goed.has(actie.toLowerCase())),
    backup: existsSync(backupPad(omsiPath))
  }
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
  const goed = new Set(
    bindings
      .filter((binding) => GOEDE_MOD.includes(binding.modifiers & ~1))
      .map((binding) => binding.action.toLowerCase())
  )
  return {
    ontbreekt: BUSTOETSEN.filter((toets) => !goed.has(toets.actie.toLowerCase())),
    aanwezig: BUSTOETSEN.filter((toets) => goed.has(toets.actie.toLowerCase())),
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
export function zetBustoetsen(
  omsiPath: string,
  acties: string[] = BUSTOETSEN.map((toets) => toets.actie)
): { toegevoegd: number; geenPlek: number } {
  const gevraagd = [...new Set(acties.filter((actie) => actie && actie.length < 80))]
  const onze = new Set(gevraagd.map((actie) => actie.toLowerCase()))
  /*
   * Onze eigen regels gaan er eerst uit. Anders blijft een knop van een vorige
   * versie op zijn oude toets staan -- en dan zegt de app dat alles er is
   * terwijl die knop niets doet.
   */
  const bindings = readKeyboard(omsiPath).filter(
    (binding) => !(onze.has(binding.action.toLowerCase()) && !GOEDE_MOD.includes(binding.modifiers & ~1))
  )
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
  for (const actie of gevraagd) {
    if (bekend.has(actie.toLowerCase())) continue
    const plek = KANDIDATEN.find(
      (kandidaat) => !bezet.has(`${kandidaat.scancode}|${kandidaat.modifiers}`)
    )
    if (!plek) {
      geenPlek += 1
      continue
    }
    bezet.add(`${plek.scancode}|${plek.modifiers}`)
    bindings.push({
      action: actie,
      section: sectie,
      scancode: plek.scancode,
      modifiers: plek.modifiers
    })
    toegevoegd += 1
  }
  if (toegevoegd > 0) writeKeyboard(omsiPath, bindings)
  log(`busknoppen in keyboard.cfg: ${toegevoegd} bijgeschreven, ${geenPlek} zonder vrije toets`)
  return { toegevoegd, geenPlek }
}

/** Haalt onze eigen regels er weer uit; wat de speler zelf had blijft staan. */
export function haalBustoetsenWeg(
  omsiPath: string,
  acties: string[] = BUSTOETSEN.map((toets) => toets.actie)
): number {
  const bindings = readKeyboard(omsiPath)
  const onze = new Set(acties.map((actie) => actie.toLowerCase()))
  const over = bindings.filter((binding) => !onze.has(binding.action.toLowerCase()))
  const weg = bindings.length - over.length
  if (weg > 0) writeKeyboard(omsiPath, over)
  log(`busknoppen uit keyboard.cfg: ${weg} weggehaald`)
  return weg
}
