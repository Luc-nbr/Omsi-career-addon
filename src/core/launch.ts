import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Start OMSI, verder niets.
 *
 * De app schrijft geen situatiebestanden en raakt `options.cfg` niet aan; de
 * speler kiest zelf zijn kaart en bus. Dit is puur het spel aanzwengelen zodat
 * je niet apart naar Steam hoeft.
 */
export function launchOmsi(omsiPath: string): void {
  const executable = join(omsiPath, 'Omsi.exe')
  if (!existsSync(executable)) throw new Error(`Omsi.exe niet gevonden in ${omsiPath}`)

  const child = spawn(executable, [], { cwd: omsiPath, detached: true, stdio: 'ignore' })
  child.unref()
}

/** Draait OMSI al? Zo ja, dan starten we er geen tweede naast. */
export function isOmsiRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('tasklist', ['/FI', 'IMAGENAME eq Omsi.exe', '/NH'])
    let output = ''
    check.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    check.on('close', () => resolve(/omsi\.exe/i.test(output)))
    check.on('error', () => resolve(false))
  })
}
