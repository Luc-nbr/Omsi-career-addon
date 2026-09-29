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
 * 6. (29-09) Een bestand dat een ander programma openhoudt zonder "verwijderen"
 *    toe te staan, wordt toch geschreven (ter plekke, zoals tot 28-09).
 * 7. (0.4.9) Wat een dienst en vrij rijden schrijven: `[last_map]` in
 *    options.cfg (ook in UTF-16), de situatie en het weer, laststn.osn met het
 *    weer en de kopieën ernaast. Codering blijft, en een onderbreking laat het
 *    vorige bestand heel. Op 3880b6d faalt 7: zeven fouten.
 *
 * Op de oude code (vóór 28-09) faalt dit: keyboard.cfg werd rechtstreeks
 * overschreven en bleef half achter, een lege lijst werd gewoon geschreven, en
 * een UTF-16-bestand las als leeg.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { join } from 'node:path'
import { readControllers, writeControllers } from '../src/core/omsiControllers'
import { readKeyboard, writeKeyboard, type KeyBinding } from '../src/core/omsiKeys'
import { readOptions, writeOptions } from '../src/core/omsiOptions'
import { writeSituation } from '../src/core/situation'
import { presetStartup, readLastMap, setLastMap } from '../src/core/startup'
import { writeWeather } from '../src/core/weather'
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

/*
 * 7. (0.4.9) Wat een dienst en vrij rijden in OMSI schrijven. Vrij rijden en
 *    deel 0 van het busbedrijf kwamen tegelijk met ronde 1 binnen, en hun
 *    schrijvers gingen er nog buitenom: `setLastMap` schreef options.cfg
 *    rechtstreeks in latin1, de situatie en het weer met `writeFileSync`,
 *    laststn.osn en zijn kopieën met `copyFileSync`. Op 3880b6d faalt dit
 *    deel: UTF-16 wordt verminkt, en een onderbreking laat halve bestanden.
 */
const BOM = Buffer.from([0xff, 0xfe])
const halfBezig = (map: string): string[] => fs.readdirSync(map).filter((n) => n.endsWith('.bezig'))
/** `doe` draaien terwijl elke schrijfbeurt naar een pad met `bevat` erin halverwege omvalt. */
function onderbreek(bevat: string, doe: () => unknown): string | undefined {
  const echtW = fs.writeFileSync
  const echtC = fs.copyFileSync
  const half = (pad: fs.PathOrFileDescriptor, bytes: Buffer): never => {
    echtW(pad, bytes.subarray(0, Math.floor(bytes.length / 2)))
    throw new Error('onderbroken halverwege het schrijven')
  }
  ;(fs as { writeFileSync: unknown }).writeFileSync = (pad: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...rest: unknown[]) => {
    if (String(pad).includes(bevat)) {
      const codering = typeof rest[0] === 'string' ? (rest[0] as BufferEncoding) : 'utf8'
      half(pad, typeof data === 'string' ? Buffer.from(data, codering) : Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    }
    return (echtW as (...a: unknown[]) => void)(pad, data, ...rest)
  }
  ;(fs as { copyFileSync: unknown }).copyFileSync = (van: fs.PathLike, naar: fs.PathLike, ...rest: unknown[]) => {
    if (String(naar).includes(bevat)) half(String(naar), fs.readFileSync(van))
    return (echtC as (...a: unknown[]) => void)(van, naar, ...rest)
  }
  try {
    doe()
    return undefined
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout)
  } finally {
    ;(fs as { writeFileSync: unknown }).writeFileSync = echtW
    ;(fs as { copyFileSync: unknown }).copyFileSync = echtC
  }
}

// 7a. [last_map] in een options.cfg in UTF-16.
const optiesTekst = '[max_fps]\r\n60\r\n\r\n[last_map]\r\nmaps\\Oud\\global.cfg\r\n\r\n'
fs.writeFileSync(opties, Buffer.concat([BOM, Buffer.from(optiesTekst, 'utf16le')]))
const gezet = setLastMap(omsi, 'Proefkaart')
const naSet = fs.readFileSync(opties)
klopt(
  `7a. [last_map] in een options.cfg in UTF-16 (${gezet ? 'gezet' : 'niet gezet'}): nog steeds UTF-16 met BOM, alleen die regel anders`,
  gezet &&
    naSet[0] === 0xff &&
    naSet[1] === 0xfe &&
    naSet.subarray(2).toString('utf16le') === optiesTekst.replace('maps\\Oud\\', 'maps\\Proefkaart\\')
)
klopt(`7a. readLastMap leest hem terug: ${readLastMap(omsi)}`, readLastMap(omsi) === 'Proefkaart')

// 7b. Windows-1252 blijft byte voor byte, op de ene regel na.
const optiesAnsi = (kaart: string): Buffer =>
  Buffer.from(`[last_map]\r\nmaps\\${kaart}\\global.cfg\r\n\r\n[naam]\r\nJ\xfcrgen \x80 Stra\xdfe\r\n\r\n`, 'latin1')
fs.writeFileSync(opties, optiesAnsi('Oud'))
setLastMap(omsi, 'Proefkaart')
klopt('7b. [last_map] in Windows-1252 (ü, €, ß): de rest byte voor byte', fs.readFileSync(opties).equals(optiesAnsi('Proefkaart')))

// 7c. options.cfg halverwege onderbroken.
let lastMapGezet = true
onderbreek('options.cfg', () => {
  lastMapGezet = setLastMap(omsi, 'Anders')
})
klopt(
  `7c. options.cfg halverwege onderbroken: setLastMap ${lastMapGezet ? 'zegt ja' : 'zegt nee'}, het bestand is wat het was, geen .bezig (${halfBezig(omsi).join(', ') || 'geen'})`,
  !lastMapGezet && fs.readFileSync(opties).equals(optiesAnsi('Proefkaart')) && halfBezig(omsi).length === 0
)
klopt('7c. een options.cfg die er niet is, wordt niet gemaakt', (() => {
  const zonder = join(basis, 'zonder-opties')
  fs.mkdirSync(zonder, { recursive: true })
  return !setLastMap(zonder, 'Proefkaart') && !fs.existsSync(join(zonder, 'options.cfg'))
})())

// 7d. De situatie en het weer: UTF-16 met BOM, en een onderbreking laat de vorige heel.
const situaties = join(omsi, 'Situations')
const verzoek = { mapFolder: 'Proefkaart', name: 'OMSI Enhancer — proef', description: '', year: 2020, dayOfYear: 100, minutes: 600, weather: 'clear' as const }
const eerste = writeSituation(omsi, verzoek)
const osn = fs.readFileSync(eerste.file)
const owt = fs.readFileSync(`${eerste.file}.owt`)
klopt('7d. de situatie is UTF-16 met BOM, het weer ernaast ook', osn[0] === 0xff && osn[1] === 0xfe && owt[0] === 0xff && owt[1] === 0xfe)
const situatieFout = onderbreek('OMSI Enhancer.osn', () => writeSituation(omsi, { ...verzoek, minutes: 700 }))
klopt(
  `7d. de situatie halverwege onderbroken (${situatieFout ?? 'geen fout'}): de vorige staat er heel, geen .bezig`,
  situatieFout !== undefined && fs.readFileSync(eerste.file).equals(osn) && halfBezig(situaties).length === 0
)
const weerFout = onderbreek('.osn.owt', () => writeWeather(eerste.file, 'rain'))
klopt(
  `7d. het weer halverwege onderbroken (${weerFout ?? 'geen fout'}): het vorige staat er heel, geen .bezig`,
  weerFout !== undefined && fs.readFileSync(`${eerste.file}.owt`).equals(owt) && halfBezig(situaties).length === 0
)

// 7e. laststn.osn, het weer ernaast en de kopieën.
const kaartMap = join(omsi, 'maps', 'Proefkaart')
fs.mkdirSync(kaartMap, { recursive: true })
const eigenStand = Buffer.concat([BOM, Buffer.from('[map]\r\nmaps\\Proefkaart\\global.cfg\r\n\r\n[eigen rit]\r\n', 'utf16le')])
const kaartWeer = Buffer.concat([BOM, Buffer.from('[name]\r\nWeer van de kaart\r\n\r\n', 'utf16le')])
const laststn = join(kaartMap, 'laststn.osn')
fs.writeFileSync(laststn, eigenStand)
fs.writeFileSync(`${laststn}.owt`, kaartWeer)
fs.writeFileSync(opties, optiesAnsi('Oud'))
const klaar = presetStartup(omsi, 'Proefkaart', eerste.file)
klopt(
  `7e. presetStartup: laatste situatie ${klaar.lastSituation}, last_map ${klaar.lastMap}${klaar.weerFout ? `, weer: ${klaar.weerFout}` : ''}`,
  klaar.lastSituation && klaar.lastMap && !klaar.weerFout
)
klopt(
  '7e. laststn.osn en het weer zijn byte voor byte de situatie; de kopie en het weer van de kaart ernaast ook',
  fs.readFileSync(laststn).equals(osn) &&
    fs.readFileSync(`${laststn}.owt`).equals(owt) &&
    fs.readFileSync(`${laststn}.voor-omsi-enhancer`).equals(eigenStand) &&
    fs.readFileSync(`${laststn}.voor-omsi-enhancer.owt`).equals(kaartWeer) &&
    fs.readFileSync(opties).equals(optiesAnsi('Proefkaart')) &&
    halfBezig(kaartMap).length === 0
)
const tweede = writeSituation(omsi, { ...verzoek, minutes: 800, weather: 'fog' })
const tweedeOsn = fs.readFileSync(tweede.file)
let tweedeKlaar: ReturnType<typeof presetStartup> | undefined
const laststnFout = onderbreek('laststn.osn', () => {
  tweedeKlaar = presetStartup(omsi, 'Proefkaart', tweede.file)
})
klopt(
  `7e. laststn.osn halverwege onderbroken (${laststnFout ?? (tweedeKlaar?.lastSituation ? 'klaargezet' : 'niet klaargezet')}): de vorige staat er heel, geen .bezig`,
  !tweedeKlaar?.lastSituation && fs.readFileSync(laststn).equals(osn) && !tweedeOsn.equals(osn) && halfBezig(kaartMap).length === 0
)
// De kopie wordt maar één keer gemaakt; een halve bleef dus voorgoed.
const andereKaart = join(omsi, 'maps', 'Proefkaart2')
fs.mkdirSync(andereKaart, { recursive: true })
const andereStand = Buffer.concat([BOM, Buffer.from('[map]\r\nmaps\\Proefkaart2\\global.cfg\r\n\r\n[nog een eigen rit]\r\n', 'utf16le')])
fs.writeFileSync(join(andereKaart, 'laststn.osn'), andereStand)
onderbreek('voor-omsi-enhancer', () => presetStartup(omsi, 'Proefkaart2', tweede.file))
presetStartup(omsi, 'Proefkaart2', tweede.file)
const andereKopie = join(andereKaart, 'laststn.osn.voor-omsi-enhancer')
klopt(
  '7e. de kopie van laststn.osn halverwege onderbroken: de volgende keer komt er een hele',
  fs.existsSync(andereKopie) && fs.readFileSync(andereKopie).equals(andereStand) && halfBezig(andereKaart).length === 0
)

/*
 * 6. (29-09) Een ander programma houdt keyboard.cfg open met lezen en
 *    schrijven gedeeld, maar niet verwijderen (zoals een programma dat het
 *    bestand in de gaten houdt). Hernoemen over zo'n bestand heen lukt nooit;
 *    gewoon overschrijven, zoals tot 28-09, wel. Op d9eeeda gaf schrijfVeilig
 *    hier EPERM terwijl de oude code het schreef.
 */
async function openGehouden(): Promise<void> {
  writeKeyboard(omsi, BINDINGEN)
  const pad = toetsen.replace(/'/g, "''")
  const ps = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$f = [System.IO.File]::Open('${pad}', 'Open', 'ReadWrite', 'ReadWrite'); Write-Output open; Start-Sleep -Seconds 6; $f.Close()`
    ],
    { windowsHide: true }
  )
  await new Promise<void>((klaar, mislukt) => {
    ps.stdout.on('data', (d) => String(d).includes('open') && klaar())
    ps.on('exit', () => mislukt(new Error('PowerShell hield het bestand niet open')))
  })
  let uit: string
  try {
    writeKeyboard(omsi, BINDINGEN.map((b) => (b.action === 'Brake' ? { ...b, scancode: 209 } : b)))
    uit = 'geschreven'
  } catch (fout) {
    uit = `fout ${(fout as NodeJS.ErrnoException).code ?? (fout as Error).message}`
  }
  const brake = readKeyboard(omsi).find((b) => b.action === 'Brake')?.scancode
  klopt(`6. keyboard.cfg open bij een ander programma (zonder "verwijderen"): ${uit}, Brake=${brake}`, uit === 'geschreven' && brake === 209)
  klopt('6. geen .bezig achtergebleven', !fs.readdirSync(inputs).some((n) => n.endsWith('.bezig')))
  await new Promise((klaar) => ps.on('exit', klaar))
}

void openGehouden()
  .catch((fout) => klopt(`6. ${fout instanceof Error ? fout.message : fout}`, false))
  .then(() => einde())
