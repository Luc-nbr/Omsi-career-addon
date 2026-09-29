import fs from 'node:fs'
import { constants } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * NIETS SCHRIJVEN BUITEN DE KOPIE
 *
 * De app schrijft op tientallen plekken: profielen, instellingen, de
 * situatie en het weer in OMSI, keyboard.cfg, de plugin, Steams
 * localconfig.vdf. Bij elk daarvan een eigen vraag "mag dat nu?" zetten, kan
 * altijd één plek missen -- en wie er later een bijmaakt, weet er niets van.
 * Daarom zit de grens een laag lager: in alleen-bekijken
 * (main/versiewacht.ts) weigeren de schrijvende functies van `fs` zelf alles
 * buiten de kopie, met de fout EROFS ("alleen-lezen bestandssysteem"), die het
 * scherm meldt zoals elke andere fout. Het werkt omdat de gebouwde app
 * `fs.writeFileSync(...)` bij elke aanroep op het moduleobject opzoekt.
 *
 * Staat hier en niet meer in main/versiewacht.ts sinds 29-09 (0.4.9): de
 * kaartwerker is een worker_thread, en een worker heeft zijn eigen `fs` -- het
 * slot van het hoofdproces gold daar niet. De werker schrijft zijn kaartcache
 * in de gebruikersmap die hij bij het starten meekrijgt (in alleen-bekijken
 * de kopie), maar "schrijft alleen zijn cache" was een belofte en geen grens.
 * Nu zet de werker hetzelfde slot op zijn eigen `fs` (main/kaartwerker.ts), en
 * daarom mag deze module Electron niet kennen.
 *
 * Twee dingen gaan niet via `fs`, en die kijken zelf naar `inBekijkstand`
 * (core/veilig.ts): de knop voor de Game Bar, die met `reg add` in het
 * register schrijft (core/overlayknop.ts), en OMSI starten (core/launch.ts).
 */
const PADEN: Record<string, number[]> = {
  writeFileSync: [0],
  appendFileSync: [0],
  copyFileSync: [1],
  cpSync: [1],
  renameSync: [0, 1],
  rmSync: [0],
  rmdirSync: [0],
  unlinkSync: [0],
  mkdirSync: [0],
  truncateSync: [0],
  symlinkSync: [1],
  linkSync: [1],
  utimesSync: [0],
  createWriteStream: [0],
  writeFile: [0],
  appendFile: [0],
  copyFile: [1],
  cp: [1],
  rename: [0, 1],
  rm: [0],
  rmdir: [0],
  unlink: [0],
  mkdir: [0],
  truncate: [0],
  symlink: [1],
  link: [1]
}

function alsPad(waarde: unknown): string | undefined {
  if (typeof waarde === 'string') return waarde
  if (Buffer.isBuffer(waarde)) return waarde.toString()
  if (waarde instanceof URL) return fileURLToPath(waarde)
  return undefined
}

function schrijftBijOpenen(vlaggen: unknown): boolean {
  if (vlaggen === undefined || vlaggen === null) return false
  if (typeof vlaggen === 'number') {
    const schrijf = constants.O_WRONLY | constants.O_RDWR | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND
    return (vlaggen & schrijf) !== 0
  }
  return /[wa+]/.test(String(vlaggen))
}

/** Laat `fs` (en `fs.promises`) van deze thread alleen nog schrijven binnen `toegestaan`. */
export function sluitSchrijvenAf(toegestaan: string[]): void {
  const grenzen = toegestaan.map((map) => resolve(map).toLowerCase())
  const mag = (pad: string): boolean => {
    const vol = resolve(pad).toLowerCase()
    return grenzen.some((g) => vol === g || vol.startsWith(g + sep))
  }
  const weiger = (pad: string): Error =>
    Object.assign(new Error(`Alleen bekijken: niet geschreven naar ${pad}`), { code: 'EROFS', path: pad })

  const bewaak = (doel: Record<string, unknown>, naam: string, indexen: number[]): void => {
    const origineel = doel[naam]
    if (typeof origineel !== 'function') return
    doel[naam] = function (this: unknown, ...args: unknown[]) {
      for (const i of indexen) {
        const pad = alsPad(args[i])
        if (pad !== undefined && !mag(pad)) throw weiger(pad)
      }
      return (origineel as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
  const openen = (doel: Record<string, unknown>, naam: string): void => {
    const origineel = doel[naam]
    if (typeof origineel !== 'function') return
    doel[naam] = function (this: unknown, ...args: unknown[]) {
      const pad = alsPad(args[0])
      if (pad !== undefined && schrijftBijOpenen(args[1]) && !mag(pad)) throw weiger(pad)
      return (origineel as (...a: unknown[]) => unknown).apply(this, args)
    }
  }

  const modules = [fs as unknown as Record<string, unknown>, fs.promises as unknown as Record<string, unknown>]
  for (const doel of modules) {
    for (const [naam, indexen] of Object.entries(PADEN)) bewaak(doel, naam, indexen)
    openen(doel, 'openSync')
    openen(doel, 'open')
  }
}
