import { SETTINGS, settingKey, type SettingSpec } from '../shared/omsiSettings'
import { optionValues, readOptions, setOptionValues, writeOptions } from './omsiOptions'

/**
 * De instellingen van OMSI zoals de app ze toont en terugschrijft.
 *
 * De brug tussen `options.cfg` (blokken met tekstregels) en de schuiven en
 * vinkjes in het scherm. Alleen wat in `SETTINGS` staat gaat heen en weer;
 * blokken die daar niet in staan blijven onaangeroerd, ook als ze in hetzelfde
 * bestand staan.
 */

/** De stand van alle instellingen die de app kent: sleutel -> waarde uit het bestand. */
export function readGameSettings(omsiPath: string): Record<string, string> {
  const file = readOptions(omsiPath)
  const state: Record<string, string> = {}
  for (const spec of SETTINGS) {
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

    const slot = spec.slot ?? 0
    const values = optionValues(file, spec.tag)

    /*
     * Een lege waarde in de eerste sleuf is hoe OMSI "uit" noteert bij de
     * vlaggen: het blok staat er, met niets eronder. Dan halen we de regel weg
     * in plaats van een lege regel te schrijven, anders staat er straks een
     * lege regel te veel tussen de blokken.
     */
    if (raw === '' && slot === 0 && values.length <= 1) {
      setOptionValues(file, spec.tag, [])
      continue
    }

    const next = [...values]
    while (next.length <= slot) next.push('')
    next[slot] = raw
    setOptionValues(file, spec.tag, next)
  }

  writeOptions(omsiPath, file)
}
