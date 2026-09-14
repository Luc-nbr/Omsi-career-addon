import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import iconv from 'iconv-lite'
import { readOmsiLines } from './omsiFile'

/**
 * OMSI kent geen startparameter om een situatie te openen — de enige switches
 * zijn -editor, -windowed, -debug, -nolog, -logall en -savelogs. De dienst wordt
 * daarom klaargezet via bestanden: de situatie in Situations\ en de kaart in
 * options.cfg. In het spel kies je de situatie dan nog één keer in het menu.
 */
export interface LaunchOptions {
  omsiPath: string
  mapFolder: string
  windowed?: boolean
}

/** Bewaart de originele instellingen voor we ze aanpassen. */
function backupOptions(optionsFile: string): void {
  const backup = `${optionsFile}.omsicareer-backup`
  if (!existsSync(backup) && existsSync(optionsFile)) {
    copyFileSync(optionsFile, backup)
  }
}

/**
 * Zet de kaart die OMSI bij het starten laadt. Alleen dit blok wordt aangeraakt;
 * grafische instellingen en voorkeuren blijven zoals de speler ze had.
 */
export function setStartMap(omsiPath: string, mapFolder: string): void {
  const optionsFile = join(omsiPath, 'options.cfg')
  if (!existsSync(optionsFile)) return
  backupOptions(optionsFile)

  const lines = readOmsiLines(optionsFile)
  const index = lines.findIndex((line) => line.trim() === '[last_map]')
  const value = `maps\\${mapFolder}\\global.cfg`
  if (index >= 0) {
    lines[index + 1] = value
  } else {
    lines.push('[last_map]', value, '')
  }
  writeFileSync(optionsFile, iconv.encode(lines.join('\r\n'), 'win1252'))
}

/** Start OMSI. Het spel draait los van deze app verder. */
export function launchOmsi(options: LaunchOptions): void {
  const executable = join(options.omsiPath, 'Omsi.exe')
  if (!existsSync(executable)) {
    throw new Error(`Omsi.exe niet gevonden in ${options.omsiPath}`)
  }
  setStartMap(options.omsiPath, options.mapFolder)

  const child = spawn(executable, options.windowed ? ['-windowed'] : [], {
    cwd: options.omsiPath,
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

/** Draait OMSI op dit moment? */
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

/** Leest een instelling uit options.cfg, bijvoorbeeld om de taal te tonen. */
export function readOption(omsiPath: string, tag: string): string | undefined {
  const optionsFile = join(omsiPath, 'options.cfg')
  if (!existsSync(optionsFile)) return undefined
  const lines = readOmsiLines(optionsFile)
  const index = lines.findIndex((line) => line.trim() === `[${tag}]`)
  return index >= 0 ? lines[index + 1]?.trim() : undefined
}

/** Zekerheidshalve: herstelt de instellingen zoals ze voor het eerste gebruik waren. */
export function restoreOptions(omsiPath: string): boolean {
  const optionsFile = join(omsiPath, 'options.cfg')
  const backup = `${optionsFile}.omsicareer-backup`
  if (!existsSync(backup)) return false
  writeFileSync(optionsFile, readFileSync(backup))
  return true
}
