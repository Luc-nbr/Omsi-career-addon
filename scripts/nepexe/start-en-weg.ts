/**
 * Hulp voor probe-openomsi-start.ts: start een spel zoals de app dat doet en
 * stopt dan meteen zelf -- zoals de app die dichtgaat. De proef kijkt daarna
 * of het spel nog leeft (ontwerp openomsi-koppeling §10, stap 2).
 *
 *   tsx start-en-weg.ts zelf <exe> <log> <args...>
 *   tsx start-en-weg.ts launcher <launcher> <duty-json>
 *
 * Schrijft het pid op stdout.
 */
import { dirname } from 'node:path'
import { startZelf, voerUit } from '../../src/core/motoren/openomsi'

async function main(): Promise<void> {
  const [soort, exe, ...rest] = process.argv.slice(2)
  if (soort === 'zelf') {
    const [log, ...args] = rest
    const pid = await startZelf(exe, args, dirname(exe), log)
    process.stdout.write(`${pid}\n`)
  } else {
    const u = await voerUit(exe, ['--cli', 'launch', rest[0]])
    const pid = (JSON.parse(u.uit.slice(u.uit.indexOf('{'), u.uit.lastIndexOf('}') + 1)) as { pid: number }).pid
    process.stdout.write(`${pid}\n`)
  }
  // Zoals een app die afsluit: meteen weg, zonder op iets te wachten.
  process.exit(0)
}

void main()
