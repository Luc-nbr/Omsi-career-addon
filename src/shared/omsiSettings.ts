/**
 * Welke instellingen van OMSI de app laat aanpassen, en hoe.
 *
 * `options.cfg` kent 47 blokken. Hier staan er drieëndertig; de rest raken we niet
 * aan omdat we niet met zekerheid weten wat de waarden betekenen, en een
 * verkeerde gok in een spelbestand is duurder dan een ontbrekende schuif.
 *
 * Drie soorten waarden komen voor:
 * - **getal** -- `[maxFPS]` met `76` eronder.
 * - **aan/uit met tekst** -- `[sound_doppler]` met `on` of `off`.
 * - **aan/uit met niets** -- `[no_collision]` met een lege regel eronder als
 *   het uit staat. Dat het leeg is en niet afwezig telt: de blokken staan altijd
 *   in het bestand, ook als de instelling uit staat. "Aan" schrijven we als `1`.
 *
 * Een blok kan meer dan één waarde dragen; `slot` zegt welke we bedoelen.
 */

export type SettingGroup = 'graphics' | 'sound' | 'game' | 'traffic'

export interface SettingSpec {
  /** Het blok in options.cfg, inclusief haken. */
  tag: string
  group: SettingGroup
  kind: 'number' | 'toggle' | 'choice'
  /** Welke waarde van het blok; standaard de eerste. */
  slot?: number
  min?: number
  max?: number
  step?: number
  /** Hoeveel cijfers achter de komma het bestand verwacht. */
  decimals?: number
  /** Wat "aan" en "uit" in het bestand zijn. Leeg betekent: de regel weghalen. */
  on?: string
  off?: string
  /** Bij een keuze: de waarden zoals ze in het bestand staan. */
  choices?: string[]
  /** Heeft deze instelling een uitleg nodig? Dan staat die onder `set.<sleutel>.hint`. */
  hint?: boolean
}

/**
 * De sleutel waaronder een instelling in de vertalingen staat: de tag zonder
 * haken, plus het nummer van de waarde als het er meer zijn.
 */
export function settingKey(spec: SettingSpec): string {
  const bare = spec.tag.slice(1, -1)
  return spec.slot ? `${bare}.${spec.slot}` : bare
}

export const SETTINGS: SettingSpec[] = [
  // ---------- beeld ----------
  { tag: '[maxFPS]', group: 'graphics', kind: 'number', min: 20, max: 200, step: 1, hint: true },
  { tag: '[performance_maxObjDist]', group: 'graphics', kind: 'number', min: 200, max: 3000, step: 50, decimals: 3, hint: true },
  { tag: '[performance_tiledistmax]', group: 'graphics', kind: 'number', min: 1, max: 5, step: 1, hint: true },
  { tag: '[maxcomplexity]', group: 'graphics', kind: 'number', min: 0, max: 3, step: 1, hint: true },
  { tag: '[maxcomplexity_map]', group: 'graphics', kind: 'number', min: 0, max: 3, step: 1 },
  { tag: '[texFilter]', group: 'graphics', kind: 'number', slot: 1, min: 1, max: 16, step: 1, hint: true },
  { tag: '[texmemlimit]', group: 'graphics', kind: 'number', min: 256, max: 8192, step: 64, decimals: 1, hint: true },
  { tag: '[performance_reflTexSize]', group: 'graphics', kind: 'number', min: 1, max: 10, step: 1, hint: true },
  { tag: '[shadow_stencil]', group: 'graphics', kind: 'toggle', on: 'on', off: 'off' },
  { tag: '[sunglow]', group: 'graphics', kind: 'toggle', on: '1', off: '' },
  { tag: '[no_humans_on_rain_refl]', group: 'graphics', kind: 'toggle', on: '1', off: '' },
  { tag: '[smokesystems]', group: 'graphics', kind: 'toggle', on: '1', off: '0' },
  { tag: '[texture_uselow]', group: 'graphics', kind: 'toggle', on: '1', off: '', hint: true },

  // ---------- geluid ----------
  { tag: '[sound_vol_master]', group: 'sound', kind: 'number', min: 0, max: 1, step: 0.05, decimals: 2 },
  { tag: '[sound_maxcount]', group: 'sound', kind: 'number', min: 50, max: 1000, step: 10, hint: true },
  { tag: '[sound_stereo]', group: 'sound', kind: 'number', min: 0, max: 100, step: 5 },
  { tag: '[sound_doppler]', group: 'sound', kind: 'toggle', on: 'on', off: 'off' },
  { tag: '[sound_scenery]', group: 'sound', kind: 'toggle', on: '1', off: '' },

  // ---------- spel ----------
  { tag: '[language]', group: 'game', kind: 'choice', choices: ['ENG', 'DEU', 'FRA', 'HUN', 'POL'], hint: true },
  { tag: '[ticketselling]', group: 'game', kind: 'toggle', on: '1', off: '0', hint: true },
  { tag: '[see_own_driver]', group: 'game', kind: 'toggle', on: '1', off: '' },
  { tag: '[driverview_smooth]', group: 'game', kind: 'toggle', on: '1', off: '' },
  { tag: '[noAutoSave]', group: 'game', kind: 'toggle', on: '1', off: '', hint: true },
  { tag: '[no_collision]', group: 'game', kind: 'toggle', on: '1', off: '', hint: true },
  { tag: '[no_collision_terrain]', group: 'game', kind: 'toggle', on: '1', off: '' },
  { tag: '[no_collision_vehToVeh]', group: 'game', kind: 'toggle', on: '1', off: '' },
  { tag: '[no_collision_pedastrians]', group: 'game', kind: 'toggle', on: '1', off: '' },

  // ---------- verkeer ----------
  { tag: '[AIMaxCountRandom]', group: 'traffic', kind: 'number', min: 0, max: 400, step: 5, hint: true },
  { tag: '[AIMaxCountParked]', group: 'traffic', kind: 'number', min: 0, max: 300, step: 5 },
  { tag: '[AIMaxCountScheduled]', group: 'traffic', kind: 'number', min: 0, max: 100, step: 1, hint: true },
  { tag: '[AIUnschedFactor]', group: 'traffic', kind: 'number', min: 0, max: 200, step: 5, hint: true },
  { tag: '[AIPassFactor]', group: 'traffic', kind: 'number', min: 0, max: 200, step: 5, hint: true },
  { tag: '[AIPriorityScheduled]', group: 'traffic', kind: 'number', min: 0, max: 5, step: 1 }
]

export const SETTING_GROUPS: SettingGroup[] = ['graphics', 'sound', 'game', 'traffic']

export type PresetName = 'low' | 'medium' | 'high'

export const PRESET_NAMES: PresetName[] = ['low', 'medium', 'high']

/**
 * Drie startpunten voor het beeld.
 *
 * Wie niet weet wat "anisotropisch filteren" is, hoort toch een vlot lopende
 * OMSI te kunnen krijgen. Deze knoppen vullen de schuiven in; daarna kun je nog
 * alles zelf verzetten, en er wordt pas geschreven als je opslaat.
 *
 * Twee instellingen blijven met opzet buiten de drie: de beeldsnelheid hangt van
 * je scherm af en het textuurgeheugen van je videokaart. Die weten wij niet.
 */
export const PRESETS: Record<PresetName, Record<string, string>> = {
  low: {
    performance_maxObjDist: '400.000',
    performance_tiledistmax: '1',
    maxcomplexity: '0',
    maxcomplexity_map: '0',
    'texFilter.1': '4',
    performance_reflTexSize: '5',
    texture_uselow: '1',
    shadow_stencil: 'off',
    no_humans_on_rain_refl: '1',
    smokesystems: '0'
  },
  medium: {
    performance_maxObjDist: '800.000',
    performance_tiledistmax: '2',
    maxcomplexity: '1',
    maxcomplexity_map: '1',
    'texFilter.1': '8',
    performance_reflTexSize: '7',
    texture_uselow: '',
    shadow_stencil: 'off',
    no_humans_on_rain_refl: '',
    smokesystems: '1'
  },
  high: {
    performance_maxObjDist: '1600.000',
    performance_tiledistmax: '3',
    maxcomplexity: '2',
    maxcomplexity_map: '2',
    'texFilter.1': '16',
    performance_reflTexSize: '9',
    texture_uselow: '',
    shadow_stencil: 'on',
    no_humans_on_rain_refl: '',
    smokesystems: '1'
  }
}

/** Wat de app aan de interface geeft: de stand van elke instelling. */
export interface SettingState {
  /** De sleutel uit `settingKey`. */
  key: string
  /** De waarde zoals hij nu in het bestand staat. */
  raw: string
  /** Voor getallen de waarde, voor aan/uit 1 of 0. */
  value: number
}
