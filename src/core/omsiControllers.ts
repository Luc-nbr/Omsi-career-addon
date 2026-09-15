import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AXIS_SLOTS, type ControllerConfig } from '../shared/controllers'

export { AXIS_FUNCTIONS, AXIS_SLOTS } from '../shared/controllers'
export type { ControllerAxis, ControllerButton, ControllerConfig } from '../shared/controllers'

/**
 * De gamecontrollers van OMSI, uit `Inputs\gamectrler.cfg`.
 *
 * Per apparaat staat er een blok `[ctrl]` met de naam en of het geselecteerd is,
 * daarna `[axis]`, `[buttons]` en `[FFScale]`.
 *
 * **Assen.** `[axis]` heeft altijd zestien getallen: acht paren, één per as van
 * het apparaat (X, Y, Z, Rx, Ry, Rz en twee sliders -- de volgorde waarin
 * Windows ze aanlevert). Het eerste getal van een paar is wat die as in OMSI
 * doet, het tweede iets over de kromme. Dat eerste getal is af te lezen aan de
 * keuzelijst die OMSI er zelf bij zet ("<none>@Steering@Throttle@Brake@Clutch@
 * Throttle/Brake") en aan de bestanden van de gebruiker: een set pedalen heeft
 * 1, 2 en 3 op zijn drie assen (gas, rem, koppeling) en een stuurwiel heeft 0
 * op as X. Wat het tweede getal precies is -- OMSI toont er een kromme, een
 * omkeerknop en "narrowed" bij -- is niet nagemeten, dus dat laten we staan.
 *
 * **Knoppen.** `[buttons]` begint met een aantal en daarna dat aantal paren:
 * de handeling en een getal. De plaats in de lijst is het knopnummer.
 */

function controllerPath(omsiPath: string): string {
  return join(omsiPath, 'Inputs', 'gamectrler.cfg')
}

export function readControllers(omsiPath: string): ControllerConfig[] {
  const file = controllerPath(omsiPath)
  if (!existsSync(file)) return []
  /*
   * De regels blijven zoals ze zijn. Een van de apparaten heet "CH FLIGHT SIM
   * YOKE USB " met een spatie op het eind; die spatie hoort bij de naam waarmee
   * OMSI het apparaat herkent, dus bijsnijden zou de koppeling verbreken.
   */
  const lines = readFileSync(file, 'latin1').split('\r\n')
  const tag = (at: number): string => (lines[at] ?? '').trim()

  const controllers: ControllerConfig[] = []
  let current: ControllerConfig | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = tag(i)
    if (line === '[ctrl]') {
      current = {
        name: lines[i + 1] ?? '',
        selected: tag(i + 2) !== '0',
        axes: [],
        buttons: [],
        force: []
      }
      controllers.push(current)
      i += 2
    } else if (line === '[axis]' && current) {
      for (let slot = 0; slot < AXIS_SLOTS; slot++) {
        const action = Number.parseInt(tag(i + 1 + slot * 2), 10)
        const shape = Number.parseInt(tag(i + 2 + slot * 2), 10)
        current.axes.push({
          action: Number.isFinite(action) ? action : -1,
          shape: Number.isFinite(shape) ? shape : 0
        })
      }
      i += AXIS_SLOTS * 2
    } else if (line === '[buttons]' && current) {
      const count = Number.parseInt(tag(i + 1), 10)
      const total = Number.isFinite(count) ? count : 0
      for (let button = 0; button < total; button++) {
        const flag = Number.parseInt(tag(i + 3 + button * 2), 10)
        current.buttons.push({
          action: lines[i + 2 + button * 2] ?? '',
          flag: Number.isFinite(flag) ? flag : 0
        })
      }
      i += 1 + total * 2
    } else if (line === '[FFScale]' && current) {
      current.force = [lines[i + 1] ?? '1.000', lines[i + 2] ?? '1.000']
      i += 2
    }
  }
  return controllers
}

/**
 * Schrijft de apparaten terug in dezelfde vorm als OMSI ze noteert: een lege
 * regel voor elk `[ctrl]`, de blokken in dezelfde volgorde, en een lege regel
 * na elk blok.
 */
export function writeControllers(omsiPath: string, controllers: ControllerConfig[]): void {
  const lines: string[] = []
  for (const controller of controllers) {
    lines.push('', '[ctrl]', controller.name, controller.selected ? '1' : '0', '', '[axis]')
    for (let slot = 0; slot < AXIS_SLOTS; slot++) {
      const axis = controller.axes[slot] ?? { action: -1, shape: 0 }
      lines.push(String(axis.action), String(axis.shape))
    }
    lines.push('', '[buttons]', String(controller.buttons.length))
    for (const button of controller.buttons) lines.push(button.action, String(button.flag))
    lines.push('', '[FFScale]', controller.force[0] ?? '1.000', controller.force[1] ?? '1.000', '')
  }
  // OMSI sluit af met een lege regel achter het laatste blok.
  lines.push('')
  writeFileSync(controllerPath(omsiPath), lines.join('\r\n'), 'latin1')
}
