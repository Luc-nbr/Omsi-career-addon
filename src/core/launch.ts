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
export type LaunchResult = 'gestart' | 'geweigerd' | 'mislukt'

/**
 * Waarom dit meer is dan één regel `spawn`.
 *
 * Wie in Windows bij `Omsi.exe` "als administrator uitvoeren" aanvinkt, kan het
 * spel niet meer vanuit een gewoon programma gestart worden: Windows weigert
 * met ERROR_ELEVATION_REQUIRED, en Node maakt daar EACCES van. Erger nog, die
 * fout komt niet uit de aanroep maar later als gebeurtenis binnen -- een
 * `try/catch` eromheen vangt hem dus niet, en de hele app viel om met "A
 * JavaScript error occurred in the main process".
 *
 * Daarom twee dingen. De fout wordt hier opgevangen waar hij vandaan komt, en
 * als het aan de rechten ligt proberen we het nog een keer via Windows zelf:
 * `Start-Process -Verb RunAs` laat het UAC-venster zien, precies zoals wanneer
 * je het spel met de hand start. Zegt de speler daar nee, dan is dat een
 * antwoord en geen fout.
 */
export async function launchOmsi(
  omsiPath: string,
  /*
   * Alleen om de rechtenvraag na te kunnen doen. Een spel dat om rechten vraagt
   * valt niet na te bootsen met een bestandje, en juist die tak moet werken.
   */
  starten: (executable: string, cwd: string) => Promise<void> = gewoon,
  /** En de weg langs Windows, om dezelfde reden apart te kunnen zetten. */
  vragen: (executable: string, cwd: string) => Promise<LaunchResult> = metRechten
): Promise<LaunchResult> {
  const executable = join(omsiPath, 'Omsi.exe')
  if (!existsSync(executable)) throw new Error(`Omsi.exe niet gevonden in ${omsiPath}`)

  try {
    await starten(executable, omsiPath)
    return 'gestart'
  } catch (reden) {
    if (!rechtenProbleem(reden)) throw reden
  }
  return vragen(executable, omsiPath)
}

/** De gewone weg: rechtstreeks starten, losgekoppeld van de app. */
function gewoon(executable: string, cwd: string): Promise<void> {
  return new Promise((klaar, mislukt) => {
    const kind = spawn(executable, [], { cwd, detached: true, stdio: 'ignore' })
    kind.once('error', mislukt)
    kind.once('spawn', () => {
      kind.unref()
      klaar()
    })
  })
}

/**
 * Windows het laten doen, met de vraag om rechten erbij.
 *
 * PowerShell is hier het kortste pad naar ShellExecute: dat is dezelfde weg die
 * de verkenner neemt, dus het vlaggetje "als administrator" wordt netjes
 * opgevolgd. Het venster zelf blijft verborgen en is meteen weer weg.
 */
function metRechten(executable: string, cwd: string): Promise<LaunchResult> {
  const quote = (waarde: string): string => `'${waarde.replace(/'/g, "''")}'`
  /*
   * Met -ErrorAction Stop en een eigen afsluitcode, anders meldt PowerShell de
   * mislukking alleen op het scherm dat we net verborgen hebben en komt er een
   * vrolijke nul terug. Nul is hier: het venster verscheen en de speler zei ja.
   */
  const opdracht =
    `try { Start-Process -FilePath ${quote(executable)} ` +
    `-WorkingDirectory ${quote(cwd)} -Verb RunAs -ErrorAction Stop } catch { exit 1 }`
  return new Promise((klaar) => {
    const kind = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', opdracht],
      { detached: true, stdio: 'ignore', windowsHide: true }
    )
    kind.once('error', () => klaar('mislukt'))
    // Een nul betekent dat het venster verscheen en de speler ja zei.
    kind.once('close', (code) => klaar(code === 0 ? 'gestart' : 'geweigerd'))
  })
}

/** Ligt het aan de rechten, of aan iets anders? */
function rechtenProbleem(reden: unknown): boolean {
  const code = (reden as { code?: string } | undefined)?.code
  return code === 'EACCES' || code === 'EPERM'
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
