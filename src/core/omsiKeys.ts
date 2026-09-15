import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * De toetsindeling van OMSI.
 *
 * `Inputs\keyboard.cfg` is gewone tekst met CRLF: twee secties (`[game]` en
 * `[vehicles]`) met daarin blokken `[entry]` van drie regels -- de naam van de
 * handeling, de scancode van de toets, en een getal met de bijbehorende
 * modificatietoetsen. `Inputs\keyboard_reset.cfg` is dezelfde indeling met de
 * standaardwaarden.
 *
 * Wat dat derde getal betekent is afgelezen aan de 128 bindingen die er staan:
 * bit 2 is Shift en bit 4 is Ctrl. Dat is te zien aan de IBIS-cijfers op het
 * numerieke blok (die staan op 4, en dat is in OMSI Ctrl+cijfer) en aan "Quit
 * OMSI" op Q met 4, wat Ctrl+Q is.
 *
 * Bit 1 zit op gas, rem, sturen, koppeling, claxon en nog een handvol andere.
 * Wat het precies betekent is niet nagemeten, dus we doen er geen uitspraak
 * over en laten hem staan zoals hij staat: bij het wijzigen van een toets gaat
 * alleen Shift en Ctrl over.
 *
 * De namen van de toetsen komen uit `Inputs\ENG.kyb` (of DEU), die van de
 * handelingen uit `Languages\<taal>_key_game.olf` en `..._key_veh_gen.olf`.
 */

export const MOD_SHIFT = 2
export const MOD_CTRL = 4

export interface KeyBinding {
  action: string
  /** In welke sectie hij staat; die volgorde moet bij het schrijven kloppen. */
  section: string
  scancode: number
  modifiers: number
}

function keyboardPath(omsiPath: string): string {
  return join(omsiPath, 'Inputs', 'keyboard.cfg')
}

/** Leest een toetsenbestand: het eigen bestand of dat met de standaardwaarden. */
export function readKeyboard(omsiPath: string, defaults = false): KeyBinding[] {
  const file = defaults
    ? join(omsiPath, 'Inputs', 'keyboard_reset.cfg')
    : keyboardPath(omsiPath)
  if (!existsSync(file)) return []

  const lines = readFileSync(file, 'latin1').split('\r\n').map((line) => line.trim())
  const bindings: KeyBinding[] = []
  let section = 'game'
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === '[entry]') {
      const action = lines[i + 1] ?? ''
      const scancode = Number.parseInt(lines[i + 2] ?? '', 10)
      const modifiers = Number.parseInt(lines[i + 3] ?? '', 10)
      if (action && Number.isFinite(scancode)) {
        bindings.push({ action, section, scancode, modifiers: Number.isFinite(modifiers) ? modifiers : 0 })
      }
      i += 3
    } else if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1)
    }
  }
  return bindings
}

/**
 * Schrijft de toetsindeling terug.
 *
 * Het bestand wordt opnieuw opgebouwd in de volgorde van de secties die er
 * stonden; OMSI leest het zo terug. Wat er verder in `modifiers` staat gaat
 * onveranderd mee.
 */
export function writeKeyboard(omsiPath: string, bindings: KeyBinding[]): void {
  const sections: string[] = []
  for (const binding of bindings) {
    if (!sections.includes(binding.section)) sections.push(binding.section)
  }

  const lines: string[] = ['']
  for (const section of sections) {
    lines.push(`[${section}]`, '')
    for (const binding of bindings.filter((item) => item.section === section)) {
      lines.push('[entry]', binding.action, String(binding.scancode), String(binding.modifiers), '')
    }
  }
  // OMSI sluit het bestand af met een lege regel; zonder deze staat er één
  // regeleinde minder dan in het bestand dat het spel zelf schrijft.
  lines.push('')
  writeFileSync(keyboardPath(omsiPath), lines.join('\r\n'), 'latin1')
}

/** De namen van de scancodes, zoals OMSI ze in zijn eigen menu toont. */
export function readKeyNames(omsiPath: string, language: string): Map<number, string> {
  const wanted = join(omsiPath, 'Inputs', `${language}.kyb`)
  const file = existsSync(wanted) ? wanted : join(omsiPath, 'Inputs', 'ENG.kyb')
  const names = new Map<number, string>()
  if (!existsSync(file)) return names
  for (const line of readFileSync(file, 'latin1').split(/\r?\n/)) {
    const [code, name] = line.split('\t')
    const number = Number.parseInt(code ?? '', 10)
    if (Number.isFinite(number) && name) names.set(number, name.trim())
  }
  return names
}

/**
 * De namen van de handelingen: `KY_sim_pause` heet "Pause".
 *
 * Er zijn drie bestanden per taal: het spel, het voertuig en een aanvulling uit
 * versie 2.0. Ze vullen elkaar aan; wat in geen van drieën staat houdt zijn
 * technische naam.
 */
export function readActionLabels(omsiPath: string, language: string): Map<string, string> {
  const labels = new Map<string, string>()
  for (const part of ['key_game', 'key_veh_gen', 'key_veh_gen_103', 'key_200']) {
    const file = join(omsiPath, 'Languages', `${language}_${part}.olf`)
    const fallback = join(omsiPath, 'Languages', `ENG_${part}.olf`)
    const use = existsSync(file) ? file : fallback
    if (!existsSync(use)) continue
    for (const line of readFileSync(use, 'latin1').split(/\r?\n/)) {
      const [key, label] = line.split('\t')
      if (key?.startsWith('KY_') && label) labels.set(key.slice(3), label.trim())
    }
  }
  return labels
}
