import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { strToInt } from './schermcfg'

/**
 * WELKE O3D-SLEUTELS KENT OMSI OP DEZE PC?
 *
 * Een gehusselde o3d draagt in zijn kop het artikelnummer (ArtNr) van zijn
 * add-on (shared/o3dhussel.ts). OMSI laadt zo'n bestand alleen als dat nummer 0
 * is, of als het add-on hier geregistreerd en bij het starten bevestigd is. Een
 * onbekende sleutel laat OMSI stil weg: de mesh blijft leeg, zonder logregel.
 * De app toont precies hetzelfde (Lucs keuze 1, 28-09-2026; bus3d-ontwerp §5.1):
 * nooit meer dan OMSI, en we omzeilen geen registratie.
 *
 * WAAR OMSI DE REGISTRATIE LEEST (nagelezen in Omsi.exe 2.3.004)
 * - 0x837594, vlak voor de logregel "Addon list created": eerst
 *   `<OMSI>\addons.ini`, dan elk `<OMSI>\RegAddons\*.ini`. De namen worden letter
 *   voor letter opgebouwd, dus "RegAddons" staat niet als tekst in de exe.
 * - 0x8378F8, per ini: `[addon.0]` tot en met `[addon.999]`, met `Name`,
 *   `ArtNr`, `Steamname` en `SteamArtNr`.
 * - 0x836C4C, voor "Addon list set": de bevestiging. De winkelversie via
 *   fontsPr.dll (register en handtekening), de Steam-versie via BaseType.dll:
 *   `SteamApps()->BIsSubscribedApp(SteamArtNr)`.
 * - De o3d-lader (0x56C7B4) vergelijkt de sleutel met StrToInt(ArtNr) van een
 *   BEVESTIGDE vermelding; sleutel 0 slaat de controle over.
 * Het register speelt voor de sleutels geen rol.
 *
 * DE BEVESTIGING DOEN WE NA, ZONDER STEAM AAN TE ROEPEN
 * We roepen geen DLL en geen Steam aan. Voor een Steam-installatie moet de
 * `SteamArtNr` als `dlcappid` van een geïnstalleerd depot in
 * `steamapps\appmanifest_252530.acf` staan: dat benadert BIsSubscribedApp. Een
 * winkelversie (geen `SteamArtNr`, of geen Steam-manifest) kunnen we niet
 * bevestigen; die telt dus niet mee, en dan tonen we alleen sleutel 0. Bij
 * twijfel niet tonen: zo tonen we hooguit te weinig, nooit meer dan OMSI.
 *
 * Op Lucs pc (28-09-2026): `addons.ini` is leeg, in `RegAddons` staan 12726,
 * 13005, 13730, 13887 en 15657, en alle vijf staan als DLC in het manifest.
 *
 * ALLEEN LEZEN
 * De app schrijft niets in `addons.ini`, `RegAddons` of het Steam-manifest, en
 * heeft geen instelling om een sleutel op te geven.
 */

/** Eén `[addon.N]`-vermelding. */
export interface AddonVermelding {
  /** Het bestand, ten opzichte van de OMSI-map. */
  bron: string
  sectie: string
  naam: string
  artNr: number
  steamArtNr?: number
  /** Telt voor OMSI: bevestigd zoals hierboven. */
  bevestigd: boolean
  /** Waarom wel of niet, voor het logboek. */
  waarom: string
}

export interface OmsiRegistratie {
  /** Bevestigde artikelnummers; sleutel 0 staat er NIET in (die mag altijd). */
  sleutels: ReadonlySet<number>
  vermeldingen: AddonVermelding[]
  /** Of er een Steam-manifest van OMSI 2 gevonden is. */
  steam: boolean
  /** Grootte en tijd van alle bronnen: verandert er één, dan opnieuw lezen. */
  vingerafdruk: string
}

/** Het Steam-manifest van OMSI 2, naast `steamapps\common\OMSI 2`. */
function manifestVan(omsiMap: string): string {
  return join(dirname(dirname(omsiMap)), 'appmanifest_252530.acf')
}

/** De ini's in de volgorde van OMSI: eerst addons.ini, dan RegAddons. */
function iniBestanden(omsiMap: string): string[] {
  const uit = [join(omsiMap, 'addons.ini')]
  try {
    const map = join(omsiMap, 'RegAddons')
    for (const naam of readdirSync(map).sort()) if (/\.ini$/i.test(naam)) uit.push(join(map, naam))
  } catch {
    // Geen RegAddons: dan geen add-ons van Steam.
  }
  return uit
}

function stempel(pad: string): string {
  try {
    const st = statSync(pad)
    return `${st.size}:${Math.round(st.mtimeMs)}`
  } catch {
    return '-'
  }
}

/**
 * Wat er aan de bronnen veranderd kan zijn, als één tekst. Goedkoop genoeg om
 * bij elke vraag te doen: een handvol `stat`s.
 */
export function registratieVingerafdruk(omsiMap: string): string {
  const delen = [
    `regaddons=${stempel(join(omsiMap, 'RegAddons'))}`,
    `manifest=${stempel(manifestVan(omsiMap))}`
  ]
  for (const ini of iniBestanden(omsiMap)) delen.push(`${basename(ini).toLowerCase()}=${stempel(ini)}`)
  return delen.join('|')
}

/** Tekst van een ini: UTF-16 met BOM, UTF-8 met BOM, of ANSI. */
function iniTekst(pad: string): string | undefined {
  let rauw: Buffer
  try {
    rauw = readFileSync(pad)
  } catch {
    return undefined
  }
  if (rauw.length >= 2 && rauw[0] === 0xff && rauw[1] === 0xfe) return rauw.subarray(2).toString('utf16le')
  if (rauw.length >= 3 && rauw[0] === 0xef && rauw[1] === 0xbb && rauw[2] === 0xbf) return rauw.subarray(3).toString('utf8')
  return rauw.toString('latin1')
}

/**
 * Een ini zoals Windows' GetPrivateProfileString hem leest: secties en sleutels
 * zonder hoofdlettergevoel, spaties eromheen weg, `;` is commentaar, en bij een
 * dubbele sectie of sleutel telt de eerste.
 *
 * Een dubbele sectie wordt NIET samengevoegd: Windows zoekt alleen in de eerste
 * `[addon.0]`, dus wat in de tweede staat (bijvoorbeeld een `SteamArtNr`) bestaat
 * voor OMSI niet. Nagemeten met GetPrivateProfileString op een ini met twee keer
 * `[addon.0]`: ArtNr uit de eerste, SteamArtNr leeg (29-09-2026).
 */
export function leesIni(tekst: string): Map<string, Map<string, string>> {
  const secties = new Map<string, Map<string, string>>()
  let huidig: Map<string, string> | undefined
  for (const regel of tekst.split(/\r\n|\r|\n/)) {
    const r = regel.trim()
    if (!r || r.startsWith(';')) continue
    const kop = /^\[(.*)\]$/.exec(r)
    if (kop) {
      const naam = kop[1].trim().toLowerCase()
      // Een tweede sectie met dezelfde naam: haar regels gaan in een weggooimap.
      huidig = new Map()
      if (!secties.has(naam)) secties.set(naam, huidig)
      continue
    }
    const is = r.indexOf('=')
    if (!huidig || is <= 0) continue
    const sleutel = r.slice(0, is).trim().toLowerCase()
    if (!huidig.has(sleutel)) huidig.set(sleutel, r.slice(is + 1).trim())
  }
  return secties
}

/** De `dlcappid`'s van de geïnstalleerde depots in het Steam-manifest, of `undefined` zonder manifest. */
export function steamDlcs(omsiMap: string): Set<number> | undefined {
  let tekst: string
  try {
    tekst = readFileSync(manifestVan(omsiMap), 'utf8')
  } catch {
    return undefined
  }
  const uit = new Set<number>()
  for (const m of tekst.matchAll(/"dlcappid"\s+"(\d+)"/g)) uit.add(Number(m[1]))
  return uit
}

/**
 * Een nummer zoals Delphi's StrToInt het aanneemt: een Integer van 32 bits. Wat
 * daarbuiten valt, weigert StrToInt (EConvertError), en dan telt de vermelding
 * voor OMSI niet. Zonder deze grens werd ArtNr=4294979022 bij ons sleutel 11726
 * (modulo 2^32), een sleutel die OMSI nooit bevestigt. Nul en negatief laten we
 * ook weg: dan tonen we hooguit minder, nooit meer.
 */
export function artikelnummer(tekst: string | undefined): number | undefined {
  const n = strToInt(tekst)
  return Number.isInteger(n) && n > 0 && n <= 0x7fffffff ? n : undefined
}

/** Alles lezen, zonder geheugen. */
export function leesOmsiRegistratie(omsiMap: string): OmsiRegistratie {
  const vingerafdruk = registratieVingerafdruk(omsiMap)
  const dlcs = steamDlcs(omsiMap)
  const vermeldingen: AddonVermelding[] = []
  for (const ini of iniBestanden(omsiMap)) {
    const tekst = iniTekst(ini)
    if (!tekst) continue
    const secties = leesIni(tekst)
    for (let n = 0; n < 1000; n++) {
      const sectie = secties.get(`addon.${n}`)
      if (!sectie) continue
      const artNr = artikelnummer(sectie.get('artnr'))
      if (artNr === undefined) continue
      const steamRauw = sectie.get('steamartnr')
      const steamArtNr = steamRauw !== undefined ? artikelnummer(steamRauw) : undefined
      let bevestigd = false
      let waarom: string
      if (steamArtNr === undefined) {
        waarom = !steamRauw ? 'geen SteamArtNr: winkelversie, niet na te gaan' : `SteamArtNr "${steamRauw}" is geen geldig nummer`
      } else if (!dlcs) {
        waarom = `SteamArtNr ${steamArtNr}, maar geen Steam-manifest van OMSI 2`
      } else if (!dlcs.has(steamArtNr)) {
        waarom = `DLC ${steamArtNr} niet geïnstalleerd volgens Steam`
      } else {
        bevestigd = true
        waarom = `DLC ${steamArtNr} geïnstalleerd`
      }
      vermeldingen.push({
        bron: ini.slice(omsiMap.length).replace(/^[\\/]+/, ''),
        sectie: `addon.${n}`,
        naam: sectie.get('name') ?? '',
        artNr,
        steamArtNr: Number.isInteger(steamArtNr) ? steamArtNr : undefined,
        bevestigd,
        waarom
      })
    }
  }
  const sleutels = new Set<number>()
  for (const v of vermeldingen) if (v.bevestigd) sleutels.add(v.artNr >>> 0)
  return { sleutels, vermeldingen, steam: dlcs !== undefined, vingerafdruk }
}

const geheugen = new Map<string, OmsiRegistratie>()

/**
 * De registratie, opnieuw gelezen zodra een bron verandert (de add-on-manager,
 * een DLC erbij of eraf). Kost een handvol `stat`s per vraag.
 */
export function omsiRegistratie(omsiMap: string): OmsiRegistratie {
  const vingerafdruk = registratieVingerafdruk(omsiMap)
  const bekend = geheugen.get(omsiMap)
  if (bekend && bekend.vingerafdruk === vingerafdruk) return bekend
  const nieuw = leesOmsiRegistratie(omsiMap)
  geheugen.set(omsiMap, nieuw)
  return nieuw
}

/** Voor het logboek: "geregistreerd [12726, 13005] uit RegAddons". */
export function beschrijfRegistratie(r: OmsiRegistratie): string {
  const ja = [...r.sleutels].sort((a, b) => a - b)
  const nee = r.vermeldingen.filter((v) => !v.bevestigd).map((v) => `${v.artNr} (${v.waarom})`)
  return (
    `geregistreerd [${ja.join(', ')}]` +
    (nee.length ? `, niet bevestigd: ${nee.join('; ')}` : '') +
    (r.steam ? '' : ', geen Steam-manifest')
  )
}
