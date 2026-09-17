import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Herkent een OMSI-installatie aan het spel zelf plus zijn kaartenmap. */
export function isOmsiInstall(path: string): boolean {
  return existsSync(join(path, 'Omsi.exe')) && existsSync(join(path, 'maps'))
}

/**
 * Waar Steam zelf staat.
 *
 * Eerst het register, want dat is waar Steam het opschrijft -- en de enige
 * plek die klopt als iemand Steam op D: of E: heeft gezet. De vaste paden
 * staan erachteraan voor het geval het register niets zegt.
 */
function steamRoots(): string[] {
  const roots = new Set<string>()
  const sleutels: Array<[string, string]> = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']
  ]
  for (const [sleutel, waarde] of sleutels) {
    try {
      const uit = execFileSync('reg', ['query', sleutel, '/v', waarde], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const match = uit.match(/REG_SZ\s+(.+)/i)
      // Steam schrijft schuine strepen de andere kant op; Windows kan beide.
      if (match) roots.add(match[1].trim().replace(/\//g, '\\'))
    } catch {
      // Sleutel bestaat niet, of reg.exe is er niet. Dan de vaste paden maar.
    }
  }
  for (const vast of [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'C:\\Steam',
    'D:\\Steam'
  ]) {
    roots.add(vast)
  }
  return [...roots]
}

/**
 * Steam noteert zijn extra schijven in libraryfolders.vdf. Het bestand is geen
 * JSON maar genest sleutel/waarde-tekst, dus we vissen er alleen de paden uit.
 */
function steamLibraries(): string[] {
  const libraries = new Set<string>()
  for (const root of steamRoots()) {
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

/**
 * De plekken waar OMSI staat als Steam er niets over te zeggen heeft.
 *
 * De doosversie van Aerosoft installeert waar de koper hem neerzet, en een
 * Steam-bibliotheek op een tweede schijf heet vaak gewoon `SteamLibrary`. Een
 * gebruiker meldde precies dat: `F:\SteamLibrary\steamapps\common\OMSI 2`, en
 * daar keek de app niet. Daarom elke schijf langs, met de handvol namen die
 * mensen echt gebruiken. Het kost een paar bestaanscontroles, eenmalig.
 */
function losseKandidaten(): string[] {
  const paden: string[] = []
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const schijf = `${String.fromCharCode(code)}:`
    if (!existsSync(`${schijf}\\`)) continue
    for (const romp of [
      '',
      '\\Games',
      '\\Spiele',
      '\\Program Files (x86)',
      '\\Program Files',
      '\\SteamLibrary\\steamapps\\common',
      '\\Steam\\steamapps\\common',
      '\\SteamLibrary\\SteamApps\\common',
      '\\Games\\Steam\\steamapps\\common'
    ]) {
      paden.push(`${schijf}${romp}\\OMSI 2`)
    }
  }
  return paden
}

/**
 * Zoekt de OMSI 2-installatie.
 *
 * De map die de speler zelf heeft aangewezen gaat voor: die weet hij beter dan
 * wij. Daarna Steam, en daarna de plekken waar het spel buiten Steam pleegt te
 * staan. Levert niets iets op, dan geeft dit `undefined` en vraagt de app erom.
 */
export function findOmsiInstall(chosen?: string): string | undefined {
  if (chosen && isOmsiInstall(chosen)) return chosen

  for (const library of steamLibraries()) {
    const candidate = join(library, 'steamapps', 'common', 'OMSI 2')
    if (isOmsiInstall(candidate)) return candidate
  }
  for (const kandidaat of losseKandidaten()) {
    if (isOmsiInstall(kandidaat)) return kandidaat
  }
  return undefined
}
