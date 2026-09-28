/**
 * Veilig schrijven: blijven keyboard.cfg, options.cfg en gamectrler.cfg heel
 * als het schrijven halverwege stopt, en wordt een lijst nooit stil leeg?
 *
 *   npx tsx scripts/probe-veiligschrijven.ts  (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * In een nagebouwde OMSI-map:
 * 1. Een onderbreking: `writeFileSync` schrijft de helft en valt dan om (een
 *    crash, een volle schijf, een virusscanner). keyboard.cfg moet byte voor
 *    byte blijven wat hij was, en er mag geen `.bezig` achterblijven.
 * 2. Wat teruggelezen wordt klopt niet: dan wordt er niets vervangen.
 * 3. Een lege lijst over een volle heen: geweigerd, voor toetsen, apparaten
 *    en instellingen. Met `leegMag` wel.
 * 4. Een keyboard.cfg in UTF-16 (met BOM) wordt gelezen en blijft UTF-16.
 * 5. options.cfg met Windows-1252-tekens (€, é) gaat byte voor byte heen en weer.
 *
 * Op de oude code (vóór 28-09) faalt dit: keyboard.cfg werd rechtstreeks
 * overschreven en bleef half achter, een lege lijst werd gewoon geschreven, en
 * een UTF-16-bestand las als leeg.
 */
import fs from 'node:fs'
import { join } from 'node:path'
import { readControllers, writeControllers } from '../src/core/omsiControllers'
import { readKeyboard, writeKeyboard, type KeyBinding } from '../src/core/omsiKeys'
import { readOptions, writeOptions } from '../src/core/omsiOptions'
import { einde, klopt, nepOmsi, proefMap, schrijf } from './proefhulp'

const basis = proefMap('veiligschrijven')
const omsi = nepOmsi(basis)
const inputs = join(omsi, 'Inputs')
const toetsen = join(inputs, 'keyboard.cfg')

const BINDINGEN: KeyBinding[] = [
  { action: 'Pause', section: 'game', scancode: 25, modifiers: 0 },
  { action: 'Quit', section: 'game', scancode: 16, modifiers: 4 },
  { action: 'Throttle', section: 'vehicles', scancode: 200, modifiers: 1 },
  { action: 'Brake', section: 'vehicles', scancode: 208, modifiers: 1 }
]
fs.mkdirSync(inputs, { recursive: true })
writeKeyboard(omsi, BINDINGEN)
const origineel = fs.readFileSync(toetsen)
klopt(`een nieuwe keyboard.cfg gaat heen en weer (${readKeyboard(omsi).length} bindingen)`, readKeyboard(omsi).length === 4)

const bezig = (): string[] => fs.readdirSync(inputs).filter((n) => n.endsWith('.bezig'))
const anders = BINDINGEN.map((b) => (b.action === 'Pause' ? { ...b, scancode: 57 } : b))

// ---- 1. een onderbreking halverwege ----
const echtSchrijven = fs.writeFileSync
;(fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((pad: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...rest: unknown[]) => {
  if (String(pad).includes('keyboard.cfg')) {
    const bytes = typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    echtSchrijven(pad, bytes.subarray(0, Math.floor(bytes.length / 2)))
    throw new Error('onderbroken halverwege het schrijven')
  }
  return (echtSchrijven as (...a: unknown[]) => void)(pad, data, ...rest)
}) as typeof fs.writeFileSync
try {
  writeKeyboard(omsi, anders)
  klopt('1. de onderbreking komt als fout terug', false)
} catch (fout) {
  klopt(`1. de onderbreking komt als fout terug (${fout instanceof Error ? fout.message : fout})`, true)
} finally {
  ;(fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = echtSchrijven
}
klopt('1. keyboard.cfg is byte voor byte wat hij was', fs.readFileSync(toetsen).equals(origineel))
klopt(`1. geen half tijdelijk bestand achtergebleven (${bezig().join(', ') || 'geen'})`, bezig().length === 0)

// ---- 2. teruglezen klopt niet ----
const echtLezen = fs.readFileSync
;(fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((pad: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
  const uit = (echtLezen as (...a: unknown[]) => Buffer | string)(pad, ...rest)
  if (String(pad).endsWith('.bezig') && Buffer.isBuffer(uit)) return Buffer.concat([uit.subarray(0, 10), Buffer.from('x')])
  return uit
}) as typeof fs.readFileSync
let teruglezenGeweigerd = false
try {
  writeKeyboard(omsi, anders)
} catch {
  teruglezenGeweigerd = true
} finally {
  ;(fs as { readFileSync: typeof fs.readFileSync }).readFileSync = echtLezen
}
klopt('2. wat anders terugkomt dan geschreven, wordt niet neergezet', teruglezenGeweigerd && fs.readFileSync(toetsen).equals(origineel) && bezig().length === 0)

// ---- 3. een lege lijst ----
const weigert = (wat: string, doe: () => void, bestand: string): void => {
  const voor = fs.readFileSync(bestand)
  let geweigerd = false
  try {
    doe()
  } catch {
    geweigerd = true
  }
  klopt(`3. ${wat}: geweigerd, bestand ongemoeid`, geweigerd && fs.readFileSync(bestand).equals(voor))
}
weigert('keyboard.cfg zonder één binding', () => writeKeyboard(omsi, []), toetsen)
const apparaten = join(inputs, 'gamectrler.cfg')
schrijf(
  omsi,
  'Inputs/gamectrler.cfg',
  '\r\n[ctrl]\r\nProefstuur\r\n1\r\n\r\n[axis]\r\n' + Array.from({ length: 16 }, (_, i) => (i === 0 ? '0' : '-1')).join('\r\n') + '\r\n\r\n[buttons]\r\n0\r\n\r\n[FFScale]\r\n1.000\r\n1.000\r\n\r\n'
)
klopt(`gamectrler.cfg gelezen (${readControllers(omsi).length} apparaat)`, readControllers(omsi).length === 1)
weigert('gamectrler.cfg zonder één apparaat', () => writeControllers(omsi, []), apparaten)
const opties = join(omsi, 'options.cfg')
weigert('options.cfg zonder één blok', () => writeOptions(omsi, { lines: [''], index: new Map() }), opties)
writeKeyboard(omsi, [], { leegMag: true })
klopt('3. met leegMag mag het wel', readKeyboard(omsi).length === 0)
writeKeyboard(omsi, BINDINGEN, { leegMag: true })

// ---- 4. UTF-16 ----
const tekst = origineel.toString('latin1')
fs.writeFileSync(toetsen, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tekst, 'utf16le')]))
const utf16 = readKeyboard(omsi)
klopt(`4. UTF-16 gelezen: ${utf16.length} bindingen`, utf16.length === 4)
try {
  writeKeyboard(omsi, utf16.map((b) => (b.action === 'Pause' ? { ...b, scancode: 57 } : b)))
} catch (fout) {
  console.log(`     (${fout instanceof Error ? fout.message : fout})`)
}
const na = fs.readFileSync(toetsen)
klopt('4. en blijft UTF-16 met BOM', na[0] === 0xff && na[1] === 0xfe && na[3] === 0)
klopt('4. met de nieuwe toets erin', readKeyboard(omsi).find((b) => b.action === 'Pause')?.scancode === 57 && readKeyboard(omsi).length === 4)

// ---- 5. Windows-1252 byte voor byte ----
const cp1252 = Buffer.from('[last_map]\r\nmaps\\Stra\xdfe \x80 caf\xe9\r\n\r\n[max_fps]\r\n60\r\n\r\n', 'latin1')
fs.writeFileSync(opties, cp1252)
writeOptions(omsi, readOptions(omsi))
klopt('5. options.cfg met € en é: heen en weer byte-identiek', fs.readFileSync(opties).equals(cp1252))

einde()
