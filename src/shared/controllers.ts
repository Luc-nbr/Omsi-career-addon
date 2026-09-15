/**
 * Hoe een gamecontroller van OMSI eruitziet.
 *
 * De vorm staat hier en niet bij de lezer, omdat de interface hem ook nodig
 * heeft: die tekent de assen en de knoppen. Het lezen en schrijven van
 * `Inputs\gamectrler.cfg` zit in `core/omsiControllers.ts`, met de uitleg over
 * het formaat erbij.
 */

/** Wat een as in OMSI doet. -1 is niets. */
export const AXIS_FUNCTIONS = ['steering', 'throttle', 'brake', 'clutch', 'throttleBrake'] as const
export type AxisFunction = (typeof AXIS_FUNCTIONS)[number]

/** Hoeveel assen een blok altijd beschrijft, ook als het apparaat er minder heeft. */
export const AXIS_SLOTS = 8

export interface ControllerAxis {
  /** -1 als de as niets doet, anders de index in `AXIS_FUNCTIONS`. */
  action: number
  /** De kromme-instelling van OMSI; we laten hem staan zoals hij staat. */
  shape: number
}

export interface ControllerButton {
  /** Naam van de handeling, zoals in keyboard.cfg. Leeg is niets. */
  action: string
  /** Het tweede getal van het paar; onbekend, blijft staan. */
  flag: number
}

export interface ControllerConfig {
  name: string
  /** Of OMSI dit apparaat gebruikt. */
  selected: boolean
  axes: ControllerAxis[]
  buttons: ControllerButton[]
  /** De twee getallen van `[FFScale]`, als tekst zodat ze precies terugkomen. */
  force: string[]
}
