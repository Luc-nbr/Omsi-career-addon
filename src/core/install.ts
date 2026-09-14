import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Herkent een OMSI-installatie aan het spel zelf plus zijn kaartenmap. */
export function isOmsiInstall(path: string): boolean {
  return existsSync(join(path, 'Omsi.exe')) && existsSync(join(path, 'maps'))
}

const STEAM_ROOTS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'C:\\Steam',
  'D:\\Steam'
]

/**
 * Steam noteert zijn extra schijven in libraryfolders.vdf. Het bestand is geen
 * JSON maar genest sleutel/waarde-tekst, dus we vissen er alleen de paden uit.
 */
function steamLibraries(): string[] {
  const libraries = new Set<string>()
  for (const root of STEAM_ROOTS) {
    if (existsSync(root)) libraries.add(root)
    const vdf = join(root, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdf)) continue
    try {
      const text = readFileSync(vdf, 'utf8')
      for (const match of text.matchAll(/"path"\s*"([^"]+)"/gi)) {
        libraries.add(match[1].replace(/\\\\/g, '\\'))
      }
    } catch {
      // Onleesbare bibliotheek overslaan; de andere paden blijven bruikbaar.
    }
  }
  return [...libraries]
}

/** Zoekt de OMSI 2-installatie. Geeft `undefined` als die er niet is. */
export function findOmsiInstall(): string | undefined {
  for (const library of steamLibraries()) {
    const candidate = join(library, 'steamapps', 'common', 'OMSI 2')
    if (isOmsiInstall(candidate)) return candidate
  }
  for (const fallback of ['C:\\OMSI 2', 'C:\\Program Files (x86)\\OMSI 2']) {
    if (isOmsiInstall(fallback)) return fallback
  }
  return undefined
}
