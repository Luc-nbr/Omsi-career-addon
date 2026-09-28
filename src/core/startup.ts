import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isEigenWeer } from './situation'

/**
 * OMSI zo laten opstarten dat de dienst al klaarstaat.
 *
 * Het startscherm van OMSI opent op de kaart uit `[last_map]` in `options.cfg`
 * en zet bovenaan de lijst "Last Situation": dat is `maps\<kaart>\laststn.osn`,
 * het bestand dat het spel bij het afsluiten zelf wegschrijft. Zetten wij daar
 * onze situatie neer en de kaart in `options.cfg`, dan hoeft de chauffeur niet
 * meer door het laadmenu te zoeken en is Start genoeg.
 *
 * `options.cfg` is gewone tekst in de Windows-codering met CRLF. We lezen hem
 * als losse bytes (`latin1`) en schrijven hem zo terug: dan blijft alles wat we
 * niet aanraken byte voor byte staan, ook de Duitse umlauten in namen van
 * chauffeurs en weerstations.
 */

export interface StartupResult {
  /** Of de situatie als "Last Situation" klaarstaat. */
  lastSituation: boolean
  /** Of het startscherm op de goede kaart opent. */
  lastMap: boolean
  /** Waar de vorige `laststn.osn` gebleven is, als we er een opzij hebben gezet. */
  backup?: string
  /**
   * Het weerbestand naast `laststn.osn` kon niet gekopieerd of weggehaald
   * worden. De situatie staat wel klaar; dit is alleen voor het logboek.
   */
  weerFout?: string
}

const BACKUP_SUFFIX = '.voor-omsi-enhancer'

/** Zoals de kopie heette toen de app nog OMSI Career was. */
const OLD_BACKUP_SUFFIX = '.voor-omsi-career'

/**
 * Zet de geschreven situatie klaar als "Last Situation" van zijn kaart en laat
 * het startscherm op die kaart openen.
 */
export function presetStartup(
  omsiPath: string,
  mapFolder: string,
  situationFile: string
): StartupResult {
  const result: StartupResult = { lastSituation: false, lastMap: false }
  const target = join(omsiPath, 'maps', mapFolder, 'laststn.osn')

  try {
    /*
     * Eén keer een kopie van wat de speler zelf had staan. OMSI schrijft dit
     * bestand bij elke afsluiter opnieuw, dus veel is het niet waard -- maar wie
     * midden in een eigen rit stond, mag dat kunnen terughalen.
     */
    if (
      existsSync(target) &&
      !existsSync(target + BACKUP_SUFFIX) &&
      !existsSync(target + OLD_BACKUP_SUFFIX)
    ) {
      copyFileSync(target, target + BACKUP_SUFFIX)
      result.backup = target + BACKUP_SUFFIX
    }
    copyFileSync(situationFile, target)
    result.lastSituation = true
  } catch {
    // Geen schrijfrechten in de spelmap; dan kiest de speler de situatie zelf.
  }

  /*
   * Het weer hoort bij de situatie en staat in een bestand ernaast. Een eigen
   * `try`: de situatie staat al klaar, en een `.owt` die niet te kopiëren of
   * weg te halen valt (op slot bij een virusscanner, alleen-lezen) maakte
   * eerst de hele "Last Situation" tot mislukt -- dan zette de app het
   * startscherm niet terug na het afsluiten van OMSI, en zei de voet dat de
   * speler zelf moest laden. Het ergste nu: het weer van de vorige rit.
   */
  if (result.lastSituation) {
    const weer = `${target}.owt`
    try {
      /*
       * Eerst het weer van de kaart veiligstellen, naast de kopie van
       * `laststn.osn` -- één keer, en alleen weer dat de app niet zelf koos
       * (`isEigenWeer`). Die kopie had nooit een `.owt`, en `findWeather`
       * vond het weer van de kaart dan nergens meer zodra het hieronder
       * overschreven was (tegenlezing 28-09).
       */
      const kopie = [target + BACKUP_SUFFIX, target + OLD_BACKUP_SUFFIX].find((pad) => existsSync(pad))
      if (kopie && existsSync(weer) && !existsSync(`${kopie}.owt`) && !isEigenWeer(weer)) {
        copyFileSync(weer, `${kopie}.owt`)
      }
      if (existsSync(`${situationFile}.owt`)) copyFileSync(`${situationFile}.owt`, weer)
      /*
       * Heeft de situatie geen eigen weer, dan hoort het weer dat de app bij de
       * vorige rit koos er ook niet naast te blijven staan: OMSI zou het
       * meelezen. Het weer van de kaart zelf blijft wel staan -- dat is precies
       * "zoals de kaart"; het staat er bijvoorbeeld als OMSI het na het
       * afsluiten net schreef (herstelStartscherm). Eerst ging ook dat weg, en
       * dan was er op sommige kaarten geen weer van de kaart meer over.
       */ else if (existsSync(weer) && isEigenWeer(weer)) unlinkSync(weer)
    } catch (fout) {
      result.weerFout = fout instanceof Error ? fout.message : String(fout)
    }
  }

  result.lastMap = setLastMap(omsiPath, mapFolder)
  return result
}

/** Zet `[last_map]` in options.cfg op deze kaart. */
export function setLastMap(omsiPath: string, mapFolder: string): boolean {
  const file = join(omsiPath, 'options.cfg')
  const value = `maps\\${mapFolder}\\global.cfg`
  try {
    const text = readFileSync(file, 'latin1')
    const lines = text.split('\r\n')
    const at = lines.findIndex((line) => line.trim() === '[last_map]')
    if (at < 0) {
      // Geen blok? Dan zetten we het er netjes onder, met een lege regel ertussen.
      lines.push('[last_map]', value, '')
    } else if (lines[at + 1] === value) {
      return true
    } else {
      lines[at + 1] = value
    }
    writeFileSync(file, lines.join('\r\n'), 'latin1')
    return true
  } catch {
    return false
  }
}

/** Leest welke kaart OMSI de vorige keer geladen had. */
export function readLastMap(omsiPath: string): string | undefined {
  try {
    const lines = readFileSync(join(omsiPath, 'options.cfg'), 'latin1').split('\r\n')
    const at = lines.findIndex((line) => line.trim() === '[last_map]')
    if (at < 0) return undefined
    return lines[at + 1].match(/maps[\\/]([^\\/]+)[\\/]/i)?.[1]
  } catch {
    return undefined
  }
}
