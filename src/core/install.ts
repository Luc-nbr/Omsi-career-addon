import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Herkent een OMSI-installatie.
 *
 * Aan `Omsi.exe`, en aan niets anders. Eerst stond `maps` er ook bij, en dat
 * klinkt redelijk -- een spel zonder kaarten kun je niet spelen. Maar het is de
 * app niet die daarover gaat: wie zijn kaartenmap heeft hernoemd, verplaatst of
 * leeggehaald heeft nog steeds OMSI staan, en kreeg van ons te horen dat dit
 * geen OMSI was. Dat is geen herkennen meer maar keuren.
 *
 * Wat er verder wel of niet in staat, merkt de app vanzelf: zonder kaarten is de
 * kaartenlijst leeg, en dat vertelt hij dan gewoon.
 */
export function isOmsiInstall(path: string): boolean {
  return existsSync(join(path, 'Omsi.exe'))
}

/** Heeft deze installatie ook kaarten? Zonder valt er niets te rijden. */
export function hasMaps(path: string): boolean {
  try {
    const maps = join(path, 'maps')
    return existsSync(maps) && readdirSync(maps).some((naam) => statSync(join(maps, naam)).isDirectory())
  } catch {
    return false
  }
}

/** Wat er van een aangewezen map te maken valt. */
export interface Resolved {
  /** De installatie, als we er een gevonden hebben. */
  path?: string
  /**
   * Hoe hij gevonden is. `zelf` is de map die is aangewezen, `kind` een map
   * erin, `ouder` een map erboven. Dat laatste is het geval als iemand
   * `OMSI 2\maps` aanwijst in plaats van `OMSI 2`.
   */
  via?: 'zelf' | 'kind' | 'ouder'
  /** De installatie staat er, maar zonder kaarten valt er niets te rijden. */
  zonderKaarten?: boolean
}

/**
 * Van een aangewezen map naar de installatie.
 *
 * Wie gevraagd wordt "waar staat OMSI 2?" wijst niet altijd precies die map
 * aan. De een kiest `steamapps\common`, de ander `OMSI 2\maps`, de derde de
 * snelkoppelingsmap waar het spel in staat. Dat zijn geen fouten van de
 * gebruiker maar van de vraag, dus lossen we ze hier op in plaats van "dit is
 * geen OMSI-map" te zeggen tegen iemand die er bovenop staat.
 *
 * Er wordt drie mappen diep gezocht en niet dieper. Drie is nodig omdat een
 * Steam-bibliotheek aanwijzen `steamapps`, `common` en dan pas `OMSI 2`
 * betekent. Dieper duurt merkbaar lang en levert zelden nog iets op.
 *
 * WAAROM ER EEN KLOK BIJ STAAT
 * Wie `C:\` aanwijst -- en dat doet iemand, want het is de schijf waar het spel
 * op staat -- kreeg hier een app die twaalf en een halve seconde niets deed en
 * daarna zei dat er niets gevonden was. Gemeten, op deze machine. Dit loopt in
 * het hoofdproces: zolang het loopt tekent het venster niet en doet geen knop
 * iets, dus het ziet eruit als vastlopen. Vandaar twee grenzen. De namen die
 * Windows voor zichzelf houdt slaan we over -- `Windows` alleen is al het
 * leeuwendeel van die twaalf seconden -- en na anderhalve seconde houdt het op.
 * Dat kost geen vondsten: de waarschijnlijke namen gaan voor, en een
 * installatie die binnen drie lagen ligt is er ruim binnen die tijd. `C:\` doet
 * er nu 485 ms over.
 */
export function resolveOmsiFolder(picked: string): Resolved {
  if (!picked || !existsSync(picked)) return {}

  const antwoord = (path: string, via: Resolved['via']): Resolved => ({
    path,
    via,
    zonderKaarten: !hasMaps(path)
  })

  if (isOmsiInstall(picked)) return antwoord(picked, 'zelf')

  // Een map erboven: `OMSI 2\maps`, `OMSI 2\Vehicles`, `OMSI 2\plugins`.
  let boven = dirname(picked)
  for (let stap = 0; stap < 2 && boven && boven !== dirname(boven); stap++) {
    if (isOmsiInstall(boven)) return antwoord(boven, 'ouder')
    boven = dirname(boven)
  }

  /*
   * En anders erin kijken. Twee lagen diep, want `steamapps\common` is een
   * gewone keuze en daar staat `OMSI 2` een laag lager; een Steam-bibliotheek
   * aanwijzen zet hem twee lagen lager.
   */
  const gezien = new Set<string>()
  const stop = Date.now() + ZOEKTIJD_MS
  let laag = [picked]
  for (let diepte = 0; diepte < 3; diepte++) {
    const volgende: string[] = []
    for (const map of laag) {
      if (Date.now() > stop) return {}
      let kinderen: string[]
      try {
        kinderen = readdirSync(map)
      } catch {
        continue
      }
      // De waarschijnlijke namen eerst, dan pas de rest van de map.
      kinderen.sort((a, b) => Number(waarschijnlijk(b)) - Number(waarschijnlijk(a)))
      for (const naam of kinderen) {
        if (overslaan(naam)) continue
        const kind = join(map, naam)
        if (gezien.has(kind.toLowerCase())) continue
        gezien.add(kind.toLowerCase())
        try {
          if (!statSync(kind).isDirectory()) continue
        } catch {
          continue
        }
        if (isOmsiInstall(kind)) return antwoord(kind, 'kind')
        volgende.push(kind)
      }
    }
    laag = volgende
    if (laag.length > 400) break
  }
  return {}
}

/** Hoe lang het zoeken hoogstens mag duren. */
const ZOEKTIJD_MS = 1500

/**
 * Mappen waar OMSI niet in staat en die groot genoeg zijn om het zoeken op te
 * eten. `Windows` is de grootste van allemaal; de rest houdt Windows voor
 * zichzelf en laat ons er half niet in.
 */
const NOOIT = new Set([
  'windows',
  'windows.old',
  '$recycle.bin',
  'system volume information',
  'programdata',
  'appdata',
  'perflogs',
  'recovery',
  'msocache',
  'config.msi',
  'node_modules',
  '.git'
])

function overslaan(naam: string): boolean {
  return NOOIT.has(naam.toLowerCase())
}

/** Namen waar OMSI achter pleegt te zitten; die kijken we het eerst na. */
function waarschijnlijk(naam: string): boolean {
  const kaal = naam.toLowerCase()
  return kaal.includes('omsi') || kaal === 'steamapps' || kaal === 'common' || kaal === 'steamlibrary'
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
