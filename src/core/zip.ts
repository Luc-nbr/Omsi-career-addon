import { constants as bufferConstants } from 'node:buffer'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import iconv from 'iconv-lite'

/*
 * Een zip lezen, met alleen wat Node zelf heeft.
 *
 * WAAROM ZELF
 * Add-ons voor OMSI komen meestal als zip. Een bibliotheek erbij is een
 * afhankelijkheid die in `app.asar` mee moet, en daar is het bouwen al eens
 * op stukgelopen (zie CLAUDE.md). Een zip lezen is weinig werk: de inhoudsopgave
 * staat aan het eind van het bestand, en elk bestand is opgeslagen of met
 * deflate ingepakt -- en deflate zit in zlib.
 *
 * Het bestand wordt niet in zijn geheel ingelezen: een kaart kan een paar
 * gigabyte zijn. Alleen de inhoudsopgave, en daarna één bestand tegelijk.
 *
 * WAT HIJ NIET KAN
 * Zip64 (archieven boven 4 GB of met meer dan 65535 bestanden), versleutelde
 * zips en andere inpakmethodes dan opslaan en deflate. Dan zegt `openZip` dat
 * met een foutmelding, en pak je het zelf uit. Rar en 7z zijn geen zip.
 */

export interface ZipBestand {
  /**
   * Het pad in de zip, met schuine strepen naar rechts -- zoals het er staat,
   * dus mogelijk met `..` of een stationsletter. Zie `veiligPad`.
   */
  naam: string
  grootte: number
  gepakt: number
  methode: number
  crc: number
  /** Waar de lokale kop van dit bestand begint. */
  kop: number
}

export class ZipFout extends Error {
  constructor(
    readonly soort: 'geen-zip' | 'zip64' | 'versleuteld' | 'methode' | 'kapot',
    melding: string
  ) {
    super(melding)
  }
}

export interface Zip {
  bestanden: ZipBestand[]
  lees(bestand: ZipBestand): Buffer
  sluit(): void
}

function leesStuk(fd: number, positie: number, lengte: number): Buffer {
  const buf = Buffer.alloc(lengte)
  let gelezen = 0
  while (gelezen < lengte) {
    const n = readSync(fd, buf, gelezen, lengte - gelezen, positie + gelezen)
    if (n === 0) break
    gelezen += n
  }
  return gelezen === lengte ? buf : buf.subarray(0, gelezen)
}

/*
 * Namen zonder de UTF-8-vlag staan in codepagina 437, de oude DOS-tekenset.
 * Duitse add-ons hebben umlauten in hun mapnamen, en die kwamen als rommel
 * uit een gewone latin-1-lezing.
 *
 * Let op: dit is de naam zoals hij in de zip staat, niet een pad dat je zo mag
 * gebruiken. Een zip mag `../../x` of `C:\x` als naam hebben; wie een naam op
 * schijf gebruikt, haalt hem eerst door `veiligPad`.
 */
function naamVan(ruw: Buffer, utf8: boolean): string {
  return (utf8 ? ruw.toString('utf8') : iconv.decode(ruw, 'cp437')).replace(/\\/g, '/')
}

/*
 * Namen die Windows als apparaat leest, ook met een extensie erachter: wie
 * `CON.txt` opent, schrijft naar de console. Met `COM¹` en dergelijke erbij,
 * die Windows ook zo behandelt.
 */
const APPARAAT = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i

/**
 * Een naam uit een zip (of een map) als gewoon relatief pad met schuine
 * strepen naar rechts, of `undefined` als hij ergens anders uit zou kunnen
 * komen dan in de map waarin hij uitgepakt wordt.
 *
 * WAAROM
 * De zip-lezer gaf namen door zoals ze in de zip stonden, en de add-on-manager
 * plakte ze met `join` aan de OMSI-map: `Vehicles/../../BUITEN.txt` kwam
 * daarmee naast de OMSI-map terecht ("zip slip"). Een zip mag zulke namen
 * gewoon bevatten; het is aan wie uitpakt om ze te weigeren. Geweigerd wordt:
 * - een absoluut pad (`/x`, `\\server\x`) en een stationsletter (`C:x`);
 * - elke `:`, ook midden in een naam: op NTFS is `a.txt:b` een verborgen
 *   tweede stroom in `a.txt`;
 * - `..` als deel van het pad, en een deel dat op een punt of spatie eindigt
 *   (Windows knipt die weg, dus `Vehicles.` is `Vehicles`);
 * - apparaatnamen (`CON`, `NUL`, `COM1`, ... ook als `nul.txt`);
 * - tekens die Windows in een naam niet toelaat, en stuurtekens.
 * Lege delen en `.` vallen weg: `a//./b` is `a/b`.
 */
export function veiligPad(naam: string): string | undefined {
  const pad = naam.replace(/\\/g, '/')
  if (pad.startsWith('/')) return undefined
  const delen: string[] = []
  for (const deel of pad.split('/')) {
    if (deel === '' || deel === '.') continue
    if (deel === '..') return undefined
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f<>:"|?*]/.test(deel)) return undefined
    if (/[. ]$/.test(deel)) return undefined
    if (APPARAAT.test(deel.split('.')[0].trimEnd())) return undefined
    delen.push(deel)
  }
  return delen.length > 0 ? delen.join('/') : undefined
}

const CRC_TABEL = (() => {
  const tabel = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabel[n] = c >>> 0
  }
  return tabel
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABEL[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function openZip(pad: string): Zip {
  const fd = openSync(pad, 'r')
  try {
    const lengte = fstatSync(fd).size
    // Het einde van de inhoudsopgave: 22 bytes plus hoogstens 64 kB commentaar.
    const staart = Math.min(lengte, 22 + 0xffff)
    const eind = leesStuk(fd, lengte - staart, staart)
    let at = -1
    for (let i = eind.length - 22; i >= 0; i--) {
      if (eind.readUInt32LE(i) === 0x06054b50) {
        at = i
        break
      }
    }
    if (at < 0) throw new ZipFout('geen-zip', 'Dit is geen zip-bestand.')
    const aantal = eind.readUInt16LE(at + 10)
    const grootte = eind.readUInt32LE(at + 12)
    const begin = eind.readUInt32LE(at + 16)
    if (aantal === 0xffff || begin === 0xffffffff || grootte === 0xffffffff) {
      throw new ZipFout('zip64', 'Deze zip is te groot (zip64); pak hem eerst zelf uit.')
    }

    const lijst = leesStuk(fd, begin, grootte)
    const bestanden: ZipBestand[] = []
    let p = 0
    for (let i = 0; i < aantal; i++) {
      if (lijst.readUInt32LE(p) !== 0x02014b50) throw new ZipFout('kapot', 'De inhoudsopgave van de zip is beschadigd.')
      const vlaggen = lijst.readUInt16LE(p + 8)
      const methode = lijst.readUInt16LE(p + 10)
      const crc = lijst.readUInt32LE(p + 16)
      const gepakt = lijst.readUInt32LE(p + 20)
      const ongepakt = lijst.readUInt32LE(p + 24)
      const naamLengte = lijst.readUInt16LE(p + 28)
      const extraLengte = lijst.readUInt16LE(p + 30)
      const commentaarLengte = lijst.readUInt16LE(p + 32)
      const kop = lijst.readUInt32LE(p + 42)
      const naam = naamVan(lijst.subarray(p + 46, p + 46 + naamLengte), (vlaggen & 0x800) !== 0)
      p += 46 + naamLengte + extraLengte + commentaarLengte
      if (naam.endsWith('/')) continue
      if (vlaggen & 1) throw new ZipFout('versleuteld', 'Deze zip is met een wachtwoord beveiligd.')
      if (gepakt === 0xffffffff || ongepakt === 0xffffffff || kop === 0xffffffff) {
        throw new ZipFout('zip64', 'Deze zip is te groot (zip64); pak hem eerst zelf uit.')
      }
      bestanden.push({ naam, grootte: ongepakt, gepakt, methode, crc, kop })
    }

    return {
      bestanden,
      lees(bestand) {
        const kapot = (): ZipFout => new ZipFout('kapot', `Beschadigd in de zip: ${bestand.naam}`)
        const lokaal = leesStuk(fd, bestand.kop, 30)
        if (lokaal.length < 30 || lokaal.readUInt32LE(0) !== 0x04034b50) throw kapot()
        const start = bestand.kop + 30 + lokaal.readUInt16LE(26) + lokaal.readUInt16LE(28)
        /*
         * De groottes in de inhoudsopgave zijn wat de zip zegt, niet wat er
         * is. Een zip die 1 byte opgeeft en 50 MB uitpakt, kwam door de
         * ruimtecontrole (die rekent met de opgegeven grootte) en werd eerst
         * helemaal in het geheugen uitgepakt voordat de controle hierna
         * "beschadigd" zei; een zipbom van een paar gigabyte legt zo het
         * hoofdproces plat. Daarom: niet meer inlezen dan er in het bestand
         * staat, en niet verder uitpakken dan de opgegeven grootte.
         */
        if (start + bestand.gepakt > lengte) throw kapot()
        if (bestand.methode === 0 && bestand.gepakt !== bestand.grootte) throw kapot()
        const ruw = leesStuk(fd, start, bestand.gepakt)
        let inhoud: Buffer
        if (bestand.methode === 0) inhoud = ruw
        else if (bestand.methode === 8) {
          try {
            inhoud = inflateRawSync(ruw, {
              maxOutputLength: Math.min(Math.max(bestand.grootte, 1), bufferConstants.MAX_LENGTH)
            })
          } catch {
            // Groter dan opgegeven (ERR_BUFFER_TOO_LARGE) of geen geldige deflate.
            throw kapot()
          }
        } else throw new ZipFout('methode', `Onbekende inpakmethode (${bestand.methode}) voor ${bestand.naam}; pak de zip zelf uit.`)
        if (inhoud.length !== bestand.grootte || crc32(inhoud) !== bestand.crc) throw kapot()
        return inhoud
      },
      sluit() {
        closeSync(fd)
      }
    }
  } catch (fout) {
    closeSync(fd)
    throw fout
  }
}
