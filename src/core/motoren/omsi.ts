import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { launchOmsi, type LaunchResult } from '../launch'
import { leesOmsiProces, sluitOmsi, type Afsluiten, type OmsiProces } from '../omsiProces'
import { KAN, type MotorKan } from '../spelmotor'

/**
 * DE MOTOR "OMSI 2" (ontwerp openomsi-koppeling §4)
 *
 * Wat de app al jaren met Omsi.exe doet, op één plek: welk proces het is, of
 * het draait, het uitlezen bij een vastloper, het afsluiten op verzoek en het
 * starten. Niets hiervan is veranderd; het staat hier zodat de rest van de app
 * niet meer zelf naar `Omsi.exe` zoekt (openOMSI heet anders en is anders).
 *
 * DIT IS DE ENIGE PLEK MET `OMSI_PROCES` EN `isOmsiRunning(`. Tot 27-09 zocht
 * een deel van de app vast naar Omsi.exe en een ander deel naar het proces van
 * de proef; een proef met een eigen "OMSI" startte zo het echte spel
 * (scripts/probe-vrijrijden.cjs). Nu kan dat alleen nog hier misgaan.
 */

/*
 * Welk proces OMSI is. Altijd Omsi, behalve in een proef: die zet een eigen
 * programma neer dat vastloopt, zodat er nooit aan het echte spel van de
 * speler gekomen wordt.
 */
export const OMSI_PROCES = process.env.OMSI_ENHANCER_PROEFPROCES || 'Omsi'
/** De naam zoals `tasklist` hem geeft. */
export const OMSI_EXE = `${OMSI_PROCES}.exe`
/** Draait de app in een proef? Dan ziet hij ook het echte openOMSI niet (motoren/openomsi.ts). */
export const IN_PROEF = Boolean(process.env.OMSI_ENHANCER_PROEFPROCES)

/**
 * De naam van een ander programma van dezelfde proef: `<proefproces><achter>.exe`.
 * Zo heten in een proef ook openomsi.exe en de launcher anders (motoren/openomsi.ts),
 * en blijft het proces van de proef op deze ene plek.
 */
export function proefProgramma(achter: string): string {
  return `${OMSI_PROCES}${achter}.exe`
}

export const OMSI_KAN: MotorKan = KAN.omsi

/** Draait OMSI al? Zo ja, dan starten we er geen tweede naast. */
export function isOmsiRunning(programma = OMSI_EXE): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn('tasklist', ['/FI', `IMAGENAME eq ${programma}`, '/NH'], { windowsHide: true })
    let output = ''
    check.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    check.on('close', () => resolve(output.toLowerCase().includes(programma.toLowerCase())))
    check.on('error', () => resolve(false))
  })
}

/** Draait Omsi.exe (niet openOMSI)? Voor wat alleen OMSI 2 doet: options.cfg en keyboard.cfg terugschrijven. */
export function omsiDraait(): Promise<boolean> {
  return isOmsiRunning()
}

/** Het draaiende OMSI met zijn modules, voor de wacht en het tabblad Overlays (32-bits PowerShell). */
export function leesOmsi(): Promise<OmsiProces | undefined> {
  return leesOmsiProces(OMSI_PROCES)
}

/** Een vastgelopen OMSI afsluiten, alleen als onder het pid nog hetzelfde OMSI draait. */
export function sluitVastgelopenOmsi(pid: number, start: string | undefined): Promise<Afsluiten> {
  return sluitOmsi(pid, start, OMSI_PROCES)
}

/** OMSI 2 starten, zoals altijd: Omsi.exe, eventueel met `-windowed`. */
export function startOmsi(omsiPath: string, windowed: boolean): Promise<LaunchResult> {
  return launchOmsi(omsiPath, windowed)
}

/**
 * Wanneer OMSI 2 het laatst gespeeld is (ms): OMSI schrijft bij elke start
 * `logfile.txt` in zijn map; openOMSI doet dat niet (dat schrijft in
 * ~/.openomsi). Voor het voorstel bij de spelkeuze (core/spelmotor.ts).
 */
export function laatstGespeeldOmsi(omsiPad: string | undefined): number | undefined {
  if (!omsiPad) return undefined
  try {
    return statSync(join(omsiPad, 'logfile.txt')).mtimeMs
  } catch {
    return undefined
  }
}
