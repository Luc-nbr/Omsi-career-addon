/**
 * Kunnen we de bestanden van OMSI veilig terugschrijven?
 *
 * Deze proef kopieert `options.cfg` en `Inputs\keyboard.cfg` naar een eigen map,
 * leest ze en schrijft ze onveranderd terug. Komt er byte voor byte hetzelfde
 * bestand uit, dan raakt er niets zoek aan de instellingen die de app niet
 * toont. Daarna verandert hij één waarde en leest die terug.
 *
 *   npx tsx scripts/probe-gamecfg.ts
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGameSettings, writeGameSettings } from '../src/core/gameSettings'
import { findOmsiInstall } from '../src/core/install'
import {
  readActionLabels,
  readKeyNames,
  readKeyboard,
  writeKeyboard,
  MOD_CTRL,
  MOD_SHIFT
} from '../src/core/omsiKeys'
import { readOptions, writeOptions } from '../src/core/omsiOptions'
import { SETTINGS, settingKey } from '../src/shared/omsiSettings'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

/** Een nagebouwde spelmap met alleen de bestanden die we aanraken. */
const root = mkdtempSync(join(tmpdir(), 'omsi-cfg-'))
mkdirSync(join(root, 'Inputs'), { recursive: true })
mkdirSync(join(root, 'Languages'), { recursive: true })
copyFileSync(join(omsi, 'options.cfg'), join(root, 'options.cfg'))
copyFileSync(join(omsi, 'Inputs', 'keyboard.cfg'), join(root, 'Inputs', 'keyboard.cfg'))
copyFileSync(join(omsi, 'Inputs', 'ENG.kyb'), join(root, 'Inputs', 'ENG.kyb'))

// ---------- options.cfg ----------
const before = readFileSync(join(root, 'options.cfg'))
writeOptions(root, readOptions(root))
const after = readFileSync(join(root, 'options.cfg'))
console.log(`options.cfg heen en weer: ${before.equals(after) ? 'byte-identiek' : 'VERSCHILT'}`)

const state = readGameSettings(root)
const known = SETTINGS.filter((spec) => state[settingKey(spec)] !== undefined)
console.log(`instellingen gelezen: ${known.length} van ${SETTINGS.length}`)
for (const spec of SETTINGS) {
  const value = state[settingKey(spec)]
  if (value === '') console.log(`   leeg: ${spec.tag}`)
}

// Eén waarde veranderen en terugkijken; daarna terugzetten.
const originalFps = state.maxFPS
writeGameSettings(root, { maxFPS: '61' })
console.log(`maxFPS ${originalFps} -> ${readGameSettings(root).maxFPS}`)
writeGameSettings(root, { maxFPS: originalFps })
console.log(
  `en terug: ${readGameSettings(root).maxFPS}, bestand weer gelijk: ${readFileSync(join(root, 'options.cfg')).equals(before)}`
)

// Een vlag aan en uit: de lastige, want "uit" is een blok zonder regel.
const flag = '[no_collision]'
writeGameSettings(root, { no_collision: '1' })
console.log(`${flag} aan -> ${JSON.stringify(readGameSettings(root).no_collision)}`)
writeGameSettings(root, { no_collision: '' })
console.log(
  `${flag} uit -> ${JSON.stringify(readGameSettings(root).no_collision)}, ` +
    `bestand weer gelijk: ${readFileSync(join(root, 'options.cfg')).equals(before)}`
)

// ---------- keyboard.cfg ----------
const keysBefore = readFileSync(join(root, 'Inputs', 'keyboard.cfg'))
const bindings = readKeyboard(root)
writeKeyboard(root, bindings)
const keysAfter = readFileSync(join(root, 'Inputs', 'keyboard.cfg'))
console.log(
  `\nkeyboard.cfg: ${bindings.length} bindingen, heen en weer ${keysBefore.equals(keysAfter) ? 'byte-identiek' : 'VERSCHILT'}`
)
if (!keysBefore.equals(keysAfter)) {
  const a = keysBefore.toString('latin1').split('\r\n')
  const b = keysAfter.toString('latin1').split('\r\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`   eerste verschil op regel ${i}: ${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}`)
      break
    }
  }
  console.log(`   regels: ${a.length} vs ${b.length}`)
}

const names = readKeyNames(root, 'ENG')
const labels = readActionLabels(omsi, 'ENG')
console.log(`toetsnamen: ${names.size}, handelingen met een naam: ${labels.size}`)
let named = 0
for (const binding of bindings) if (labels.has(binding.action)) named++
console.log(`bindingen met een leesbare naam: ${named} van ${bindings.length}`)

for (const binding of bindings.slice(0, 6)) {
  const combo = [
    binding.modifiers & MOD_CTRL ? 'Ctrl' : '',
    binding.modifiers & MOD_SHIFT ? 'Shift' : '',
    names.get(binding.scancode) ?? `#${binding.scancode}`
  ]
    .filter(Boolean)
    .join('+')
  console.log(`   ${(labels.get(binding.action) ?? binding.action).padEnd(34)} ${combo}`)
}
