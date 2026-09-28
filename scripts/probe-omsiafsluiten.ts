/**
 * OMSI afsluiten: schiet de knop alleen het OMSI af waar de melding over ging?
 *
 *   npx tsx scripts/probe-omsiafsluiten.ts    (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Er wordt NOOIT aan een echt OMSI of een ander programma van de gebruiker
 * gekomen: de proef start zijn eigen nepproces, een kopie van de 32-bits
 * PING.EXE van Windows onder de naam NepOmsiProef.exe (een minuut pingen naar
 * zichzelf), en werkt alleen met het pid daarvan. Elke taskkill die de app
 * doet, filtert op dat pid én een naam.
 *
 * 1. De app leest het proces uit zoals bij een vastloper: pid en starttijd.
 * 2. Een hergebruikt pid nagebootst: dezelfde naam, maar een andere
 *    starttijd dan in de melding -> niets afsluiten, "al dicht".
 * 3. Het pid is van een ander programma dan OMSI (de naam klopt niet) ->
 *    niets afsluiten, "al dicht".
 * 4. Naam en starttijd kloppen -> afgesloten.
 * 5. Nog een keer -> "al dicht".
 *
 * Op de oude code (vóór 28-09) faalt stap 2: `taskkill /PID` keek niet wie er
 * achter het pid zat, en schoot het nepproces daar al af.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import * as proces from '../src/core/omsiProces'
import { einde, klopt, proefMap } from './proefhulp'

const NAAM = 'NepOmsiProef'
const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms))

async function main(): Promise<void> {
  const map = proefMap('omsiafsluiten')
  const exe = join(map, `${NAAM}.exe`)
  copyFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'SysWOW64', 'PING.EXE'), exe)
  let kind: ChildProcess | undefined
  try {
    kind = spawn(exe, ['-n', '60', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' })
    await wacht(1000)
    // Op de oude code bestaat `procesMetPid` niet; dan vraagt de proef het aan Node.
    const metPid = (proces as Partial<typeof proces>).procesMetPid
    const leeft = async (): Promise<boolean> => {
      if (metPid) return (await metPid(kind!.pid!))?.naam === NAAM
      try {
        process.kill(kind!.pid!, 0)
        return true
      } catch {
        return false
      }
    }

    const gelezen = await proces.leesOmsiProces(NAAM)
    klopt(`1. uitgelezen: pid ${gelezen?.pid} (zelf gestart: ${kind.pid}), starttijd ${gelezen?.start}`, gelezen?.pid === kind.pid && typeof gelezen?.start === 'string')
    const sluit = proces.sluitOmsi as (pid: number, start?: string, naam?: string) => Promise<unknown>

    const hergebruikt = await sluit(kind.pid!, '2001-01-01T00:00:00.0000000Z', NAAM)
    klopt(`2. andere starttijd: niets afgesloten (${String(hergebruikt)})`, hergebruikt === 'al-dicht' && (await leeft()))

    const ander = await sluit(kind.pid!, gelezen?.start, 'Omsi')
    klopt(`3. het pid is geen Omsi.exe: niets afgesloten (${String(ander)})`, ander === 'al-dicht' && (await leeft()))

    const echt = await sluit(kind.pid!, gelezen?.start, NAAM)
    klopt(`4. naam en starttijd kloppen: afgesloten (${String(echt)})`, echt === 'gesloten' && !(await leeft()))

    const nogEens = await sluit(kind.pid!, gelezen?.start, NAAM)
    klopt(`5. nog een keer: al dicht (${String(nogEens)})`, nogEens === 'al-dicht')
  } finally {
    // Ons eigen nepproces, als het nog leeft.
    if (kind && kind.exitCode === null) kind.kill()
  }
  einde()
}

void main()
