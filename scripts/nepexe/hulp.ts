/**
 * Gereedschap voor de proeven van de spelmotor: nep-programma's met de namen
 * van openOMSI, zonder dat er ooit een echt openOMSI start. Geen proef zelf.
 *
 * - `nodeKopie`: een kopie van node.exe onder een andere naam. Met een script
 *   als eerste argument is de opdrachtregel die de app leest die van een spel
 *   (`openomsi.exe nepspel.cjs --no-menu --map x`) -- zo staat het in het
 *   ontwerp (§9.2). Node is ondertekend; Smart App Control laat de kopie door.
 * - `nepExe`: nepexe.exe (zie nepexe.c) onder een naam, met het script
 *   ernaast. Voor wat de app met de opties van openOMSI zelf aanroept
 *   (`openomsi-launcher.exe --cli launch <json>`): een kopie van node.exe
 *   weigert daar onbekende opties.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const HIER = __dirname

/** Bouwt nepexe.exe (MSVC, 64-bits) in `map` als hij er nog niet staat. */
export function bouwNepexe(map: string): string {
  const exe = join(map, 'nepexe.exe')
  if (existsSync(exe)) return exe
  mkdirSync(map, { recursive: true })
  const bouw = join(HIER, 'bouw.cmd')
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${bouw}" "${map}""`], {
    windowsVerbatimArguments: true,
    encoding: 'utf8'
  })
  if (!existsSync(exe)) throw new Error(`nepexe bouwen mislukt: ${r.stdout}\n${r.stderr}`)
  return exe
}

/** nepexe onder een eigen naam, met `script` ernaast als `<naam>.cjs`. */
export function nepExe(nepexe: string, doel: string, script: string): string {
  mkdirSync(dirname(doel), { recursive: true })
  copyFileSync(nepexe, doel)
  copyFileSync(join(HIER, script), doel.replace(/\.exe$/i, '.cjs'))
  return doel
}

/** Een kopie van node.exe onder een andere naam. */
export function nodeKopie(doel: string): string {
  mkdirSync(dirname(doel), { recursive: true })
  if (!existsSync(doel)) copyFileSync(process.execPath, doel)
  return doel
}

export const NEPSPEL = join(HIER, 'nepspel.cjs')

/** Leeft het proces? `process.kill(pid, 0)` gooit als het er niet is. */
export function leeft(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms))
