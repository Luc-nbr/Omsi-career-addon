import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * De kaartgegevens op de schijf bewaren.
 *
 * Het uitlezen van de tegels van een kaart kost tussen de dertig milliseconden
 * en ruim drie seconden -- gemeten met `scripts/probe-kaarttijd.ts`, waar
 * TH_Wald op 3008 ms uitkwam en Ahlheim 5 op 2538 ms. Tot nu toe gebeurde dat
 * bij elke start opnieuw, want de app onthield het alleen binnen de sessie.
 * Diezelfde gegevens teruglezen van schijf kost 7 tot 30 ms. Dat is de reden
 * dat dit bestand bestaat.
 *
 * Wat hier NIET gebeurt is slim zijn over het formaat. Gewoon JSON: het is
 * honderd keer sneller dan opnieuw rekenen, en een eigen binair formaat zou
 * vooral iets zijn dat kapot kan gaan zonder dat iemand het merkt.
 */

/**
 * Versie van wat hier ligt.
 *
 * Verandert de vorm van de gegevens -- een veld erbij in `MapGeometry`, een
 * andere manier om rijstroken te tellen -- dan is alles wat er ligt onbruikbaar
 * zonder dat het er kapot uitziet. Dit getal ophogen maakt in één klap elke
 * oude cache ongeldig; dat is goedkoper dan een fout opsporen die alleen
 * optreedt bij mensen die de vorige versie draaiden.
 */
const VORM = 2

/** Waar de bewaarde kaarten staan. */
export function cacheMap(userDataPath: string): string {
  return join(userDataPath, 'kaartcache')
}

/**
 * Een vingerafdruk van de bronbestanden van een kaart.
 *
 * Niet de inhoud hashen -- dat zou het hele probleem terugbrengen -- maar de
 * naam, grootte en wijzigingstijd van elk tegelbestand plus global.cfg. Een
 * tegel die verandert, verdwijnt of bijkomt verschuift de afdruk, en dan leest
 * de app de kaart gewoon opnieuw. Dit kost een paar milliseconden.
 */
export function vingerafdruk(mapPath: string): string {
  const hash = createHash('sha1')
  hash.update(`vorm:${VORM}`)
  try {
    const namen = readdirSync(mapPath)
      .filter((naam) => /^tile_.*\.map$/i.test(naam) || /^global\.cfg$/i.test(naam))
      .sort()
    for (const naam of namen) {
      const info = statSync(join(mapPath, naam))
      hash.update(`${naam}:${info.size}:${info.mtimeMs}`)
    }
  } catch {
    /*
     * Onleesbare map: dan geen afdruk die ergens op slaat. Een lege afdruk
     * betekent hier "nooit uit de cache lezen", en dat is de veilige kant.
     */
    return ''
  }
  return hash.digest('hex')
}

/** De naam waaronder een kaart bewaard wordt; mapnamen mogen van alles bevatten. */
function bestand(userDataPath: string, folder: string, soort: string): string {
  const veilig = createHash('sha1').update(folder).digest('hex').slice(0, 16)
  return join(cacheMap(userDataPath), `${veilig}-${soort}.json`)
}

interface Inhoud<T> {
  afdruk: string
  waarde: T
}

/**
 * Teruglezen wat er bewaard is, mits het bij deze kaart hoort.
 *
 * Klopt de afdruk niet, is het bestand er niet, of is het half geschreven, dan
 * levert dit `undefined` en leest de app de kaart gewoon opnieuw. Er is geen
 * geval waarin een kapotte cache een fout op het scherm mag opleveren.
 */
export function leesUitCache<T>(
  userDataPath: string,
  folder: string,
  soort: string,
  afdruk: string
): T | undefined {
  if (!afdruk) return undefined
  const pad = bestand(userDataPath, folder, soort)
  try {
    if (!existsSync(pad)) return undefined
    const inhoud = JSON.parse(readFileSync(pad, 'utf8')) as Inhoud<T>
    if (inhoud.afdruk !== afdruk) return undefined
    return inhoud.waarde
  } catch {
    return undefined
  }
}

/**
 * Wegschrijven, via een tijdelijke naam.
 *
 * Een kaart van negentien megabyte schrijven duurt even, en als de app daar
 * middenin wordt afgesloten ligt er een half bestand. Eerst schrijven en dan
 * hernoemen maakt de vervanging ondeelbaar: er ligt of het oude bestand of het
 * nieuwe, nooit iets ertussenin.
 */
export function schrijfInCache<T>(
  userDataPath: string,
  folder: string,
  soort: string,
  afdruk: string,
  waarde: T
): void {
  if (!afdruk) return
  const pad = bestand(userDataPath, folder, soort)
  try {
    mkdirSync(cacheMap(userDataPath), { recursive: true })
    const tijdelijk = `${pad}.bezig`
    writeFileSync(tijdelijk, JSON.stringify({ afdruk, waarde } satisfies Inhoud<T>), 'utf8')
    renameSync(tijdelijk, pad)
  } catch {
    /*
     * Geen ruimte, geen rechten, schijf vol: dan draait de app gewoon zonder
     * cache verder. Trager, maar niet stuk -- en een foutmelding over een
     * versnelling die niet lukt helpt niemand.
     */
  }
}

/** Hoeveel er nu op de schijf staat, in bytes. Voor het tonen, niet voor de logica. */
export function cacheGrootte(userDataPath: string): number {
  try {
    return readdirSync(cacheMap(userDataPath))
      .map((naam) => statSync(join(cacheMap(userDataPath), naam)).size)
      .reduce((a, b) => a + b, 0)
  } catch {
    return 0
  }
}
