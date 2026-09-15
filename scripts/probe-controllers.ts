/**
 * Gaat `Inputs\gamectrler.cfg` byte-identiek heen en weer?
 *
 * En klopt de lezing van de assen? Een set pedalen hoort gas, rem en koppeling
 * op zijn assen te hebben; een stuurwiel het sturen op de eerste.
 *
 *   npx tsx scripts/probe-controllers.ts
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { AXIS_FUNCTIONS, readControllers, writeControllers } from '../src/core/omsiControllers'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const root = mkdtempSync(join(tmpdir(), 'omsi-ctrl-'))
mkdirSync(join(root, 'Inputs'), { recursive: true })
copyFileSync(join(omsi, 'Inputs', 'gamectrler.cfg'), join(root, 'Inputs', 'gamectrler.cfg'))

const file = join(root, 'Inputs', 'gamectrler.cfg')
const before = readFileSync(file)
const controllers = readControllers(root)
writeControllers(root, controllers)
const after = readFileSync(file)

console.log(`gamectrler.cfg: ${controllers.length} apparaten, heen en weer ${before.equals(after) ? 'byte-identiek' : 'VERSCHILT'}`)
if (!before.equals(after)) {
  const a = before.toString('latin1').split('\r\n')
  const b = after.toString('latin1').split('\r\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`   eerste verschil op regel ${i}: ${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}`)
      break
    }
  }
  console.log(`   regels: ${a.length} vs ${b.length}`)
}

for (const controller of controllers) {
  const axes = controller.axes
    .map((axis, slot) =>
      axis.action >= 0 ? `as ${slot + 1} = ${AXIS_FUNCTIONS[axis.action] ?? axis.action} (${axis.shape})` : ''
    )
    .filter(Boolean)
  const bound = controller.buttons.filter((button) => button.action).length
  console.log(`\n${controller.name}${controller.selected ? ' [gekozen]' : ''}`)
  console.log(`   ${axes.length > 0 ? axes.join(', ') : 'geen assen toegewezen'}`)
  console.log(`   knoppen: ${controller.buttons.length}, waarvan ${bound} met een handeling`)
  if (bound > 0) {
    console.log(
      `   eerste: ${controller.buttons
        .map((button, index) => (button.action ? `${index + 1}=${button.action}` : ''))
        .filter(Boolean)
        .slice(0, 6)
        .join(', ')}`
    )
  }
}
