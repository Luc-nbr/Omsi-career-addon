/**
 * Wat de wizard vraagt bij een nieuw apparaat.
 *
 * De volgorde is die van een chauffeur die instapt: eerst waarmee je rijdt, dan
 * waarmee je gezien wordt, dan de deuren. OMSI's eigen automatische instelling
 * vraagt alleen sturen, gas, rem en koppeling; de rest moest je daarna zelf
 * opzoeken in een lijst met knopnummers.
 *
 * Niets is verplicht: elke stap kan worden overgeslagen en de wizard zelf ook.
 * De namen van de handelingen zijn dezelfde als in `keyboard.cfg`.
 */

export interface WizardStep {
  /** Sleutel voor de vraag: `ctrl.ask.<id>`. */
  id: string
  kind: 'axis' | 'button'
  /** Voor een as: de plek in `AXIS_FUNCTIONS`. */
  axis?: number
  /** Voor een knop: de handeling zoals OMSI hem noemt. */
  action?: string
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'steering', kind: 'axis', axis: 0 },
  { id: 'throttle', kind: 'axis', axis: 1 },
  { id: 'brake', kind: 'axis', axis: 2 },
  { id: 'clutch', kind: 'axis', axis: 3 },
  { id: 'horn', kind: 'button', action: 'horn' },
  { id: 'blinkerLeft', kind: 'button', action: 'blinker_left_set' },
  { id: 'blinkerRight', kind: 'button', action: 'blinker_right_set' },
  { id: 'blinkerOff', kind: 'button', action: 'blinker_off' },
  { id: 'doorFront', kind: 'button', action: 'bus_doorfront0' },
  { id: 'doorAft', kind: 'button', action: 'bus_dooraft' },
  { id: 'handbrake', kind: 'button', action: 'parking_brake_toggle' },
  { id: 'engine', kind: 'button', action: 'kw_m_enginestart' }
]
