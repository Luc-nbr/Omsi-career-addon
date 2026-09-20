import { SETTINGS, settingKey, type SettingGroup, type SettingSpec } from '../shared/omsiSettings'
import {
  addOption,
  hasOption,
  optionValues,
  readOptions,
  removeOption,
  setOptionValues,
  writeOptions
} from './omsiOptions'

/**
 * De instellingen van OMSI zoals de app ze toont en terugschrijft.
 *
 * De brug tussen `options.cfg` (blokken met tekstregels) en de schuiven en
 * vinkjes in het scherm. Alleen wat in `SETTINGS` staat gaat heen en weer;
 * blokken die daar niet in staan blijven onaangeroerd, ook als ze in hetzelfde
 * bestand staan.
 */

/** Onder welke kop in options.cfg een nieuw blok van een groep hoort. */
const HEADINGS: Record<SettingGroup, string> = {
  graphics: 'GRAPHICS',
  sound: 'SOUND',
  game: 'GENERAL',
  traffic: 'AI'
}

/** De stand van alle instellingen die de app kent: sleutel -> waarde uit het bestand. */
export function readGameSettings(omsiPath: string): Record<string, string> {
  const file = readOptions(omsiPath)
  const state: Record<string, string> = {}
  for (const spec of SETTINGS) {
    if (spec.presence) {
      state[settingKey(spec)] = hasOption(file, spec.tag) ? spec.on ?? '1' : spec.off ?? ''
      continue
    }
    const values = optionValues(file, spec.tag)
    state[settingKey(spec)] = values[spec.slot ?? 0] ?? ''
  }
  return state
}

/** Zoekt de beschrijving bij een sleutel. */
function specFor(key: string): SettingSpec | undefined {
  return SETTINGS.find((spec) => settingKey(spec) === key)
}

/**
 * Schrijft wijzigingen terug.
 *
 * Alles gaat in één keer over het bestand, want elke schrijfronde is een kans
 * om iets kwijt te raken. Waarden die niet in `changes` staan blijven staan.
 */
export function writeGameSettings(omsiPath: string, changes: Record<string, string>): void {
  const file = readOptions(omsiPath)

  for (const [key, raw] of Object.entries(changes)) {
    const spec = specFor(key)
    if (!spec) continue

    /*
     * Een vlag is aan als het blok er staat en uit als het er niet staat; zo
     * schrijft OMSI het zelf. Een leeg blok laten staan zou hem dus aan laten.
     */
    if (spec.presence) {
      if (raw === (spec.off ?? '')) removeOption(file, spec.tag)
      else addOption(file, spec.tag, [], HEADINGS[spec.group])
      continue
    }

    const slot = spec.slot ?? 0
    if (!hasOption(file, spec.tag)) {
      // Een blok dat OMSI nog nooit schreef; alleen de eerste waarde weten we.
      if (slot === 0) addOption(file, spec.tag, [raw], HEADINGS[spec.group])
      continue
    }

    const next = [...optionValues(file, spec.tag)]
    while (next.length <= slot) next.push('')
    next[slot] = raw
    setOptionValues(file, spec.tag, next)
  }

  writeOptions(omsiPath, file)
}
