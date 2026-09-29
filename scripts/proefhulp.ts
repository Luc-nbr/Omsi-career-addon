/**
 * Gedeeld gereedschap voor de proeven uit de veiligheidsronde van 28-09
 * (probe-zipslip, -programmacode, -ruimte, -mapsoorten, -veiligschrijven,
 * -omsiafsluiten, -versiewacht). Geen proef zelf.
 *
 * Elke proef werkt in een eigen map onder `PROEF_MAP` (of de tijdelijke map
 * van Windows) en raakt niets daarbuiten: geen echte OMSI-map, geen
 * gebruikersmap van de app.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import iconv from 'iconv-lite'
import { crc32 } from '../src/core/zip'

let fouten = 0

export function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

export function einde(): never {
  console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
  process.exit(fouten ? 1 : 0)
}

/** Een lege werkmap voor deze proef. */
export function proefMap(naam: string): string {
  const map = join(process.env.PROEF_MAP || tmpdir(), naam)
  rmSync(map, { recursive: true, force: true })
  mkdirSync(map, { recursive: true })
  return map
}

export function schrijf(basis: string, pad: string, inhoud: string | Buffer): string {
  const vol = join(basis, ...pad.split('/'))
  mkdirSync(dirname(vol), { recursive: true })
  writeFileSync(vol, inhoud)
  return vol
}

/** Een nagebouwde OMSI-map: Omsi.exe, options.cfg en de mappen die er altijd zijn. */
export function nepOmsi(basis: string): string {
  const omsi = join(basis, 'OMSI 2')
  schrijf(omsi, 'Omsi.exe', '')
  schrijf(omsi, 'options.cfg', '[last_map]\r\nmaps\\Proef\r\n\r\n')
  for (const m of ['Vehicles', 'maps', 'Sceneryobjects', 'Splines', 'plugins', 'Fonts', 'Weather']) {
    mkdirSync(join(omsi, m), { recursive: true })
  }
  return omsi
}

/**
 * Een zip schrijven met de namen PRECIES zoals opgegeven -- ook `..`,
 * `C:` of een backslash -- zodat de lezer krijgt wat een kwaadwillende zip zou
 * bevatten. `crcFout` geeft dat bestand een verkeerde crc: een beschadigde zip.
 */
export function maakZip(pad: string, bestanden: Array<{ naam: string; inhoud: Buffer | string; crcFout?: boolean }>): void {
  const lokaal: Buffer[] = []
  const centraal: Buffer[] = []
  let at = 0
  for (const b of bestanden) {
    const inhoud = Buffer.isBuffer(b.inhoud) ? b.inhoud : Buffer.from(b.inhoud)
    const gepakt = deflateRawSync(inhoud)
    const naam = iconv.encode(b.naam, 'cp437')
    const crc = b.crcFout ? (crc32(inhoud) ^ 1) >>> 0 : crc32(inhoud)
    const kop = Buffer.alloc(30)
    kop.writeUInt32LE(0x04034b50, 0)
    kop.writeUInt16LE(20, 4)
    kop.writeUInt16LE(8, 8)
    kop.writeUInt32LE(crc, 14)
    kop.writeUInt32LE(gepakt.length, 18)
    kop.writeUInt32LE(inhoud.length, 22)
    kop.writeUInt16LE(naam.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(gepakt.length, 20)
    c.writeUInt32LE(inhoud.length, 24)
    c.writeUInt16LE(naam.length, 28)
    c.writeUInt32LE(at, 42)
    lokaal.push(kop, naam, gepakt)
    centraal.push(c, naam)
    at += 30 + naam.length + gepakt.length
  }
  const cd = Buffer.concat(centraal)
  const eind = Buffer.alloc(22)
  eind.writeUInt32LE(0x06054b50, 0)
  eind.writeUInt16LE(bestanden.length, 8)
  eind.writeUInt16LE(bestanden.length, 10)
  eind.writeUInt32LE(cd.length, 12)
  eind.writeUInt32LE(at, 16)
  writeFileSync(pad, Buffer.concat([...lokaal, cd, eind]))
}

/** Alle bestanden onder een map, relatief en met schuine strepen naar rechts. */
export function allesOnder(map: string): string[] {
  const uit: string[] = []
  const loop = (hier: string): void => {
    for (const naam of readdirSync(hier)) {
      const vol = join(hier, naam)
      if (statSync(vol).isDirectory()) loop(vol)
      else uit.push(relative(map, vol).split(sep).join('/'))
    }
  }
  if (existsSync(map)) loop(map)
  return uit.sort()
}

/** Een afdruk van een hele map: elk bestand met de sha1 van zijn inhoud, en elke map. */
export function afdruk(map: string): string {
  const regels: string[] = []
  const loop = (hier: string): void => {
    for (const naam of readdirSync(hier).sort()) {
      const vol = join(hier, naam)
      const rel = relative(map, vol).split(sep).join('/')
      if (statSync(vol).isDirectory()) {
        regels.push(`${rel}/`)
        loop(vol)
      } else regels.push(`${rel} ${createHash('sha1').update(readFileSync(vol)).digest('hex')}`)
    }
  }
  if (existsSync(map)) loop(map)
  return regels.join('\n')
}
