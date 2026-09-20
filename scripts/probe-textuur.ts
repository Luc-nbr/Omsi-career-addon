/**
 * Kan de lezer de texturen aan waar de bussen naar wijzen, en wat kost dat?
 *
 *   npx tsx scripts/probe-textuur.ts ["<pad naar OMSI 2>"] [--kladmap <map>]
 *
 * `core/textuur.ts` moet DDS en TGA uitpakken, want die twee geeft Chromium ons
 * niet. Deze probe loopt langs élke textuur die een bestuurbare bus noemt, telt
 * per vorm wat er lukt en wat niet met de reden erbij, en meet hoe lang het
 * uitpakken duurt.
 *
 * DE PROEF OP DE SOM
 * Een uitpakker die netjes op de laatste byte uitkomt kan nog steeds rood en
 * blauw verwisselen of het beeld op zijn kop zetten, en daar zegt geen enkele
 * telling iets over. Daarom zijn er twee controles die niets met onze eigen
 * code te maken hebben:
 *
 * 1. Van elke vorm gaat één textuur als .png naar de kladmap, verkleind tot
 *    iets dat je kunt bekijken. Daar hoort een mens naar te kijken; een logo
 *    dat in spiegelbeeld staat of een brandblusser die blauw is, ziet niemand
 *    in een tabel.
 * 2. Windows heeft sinds Windows 10 zijn eigen DDS-uitpakker in WIC. Die wordt
 *    hier via PowerShell aangeroepen op drie bestanden en pixel voor pixel naast
 *    de onze gelegd. WIC kent alleen de DXT-vormen; de ongecomprimeerde
 *    D3D9-vormen weigert hij, en TGA kent hij helemaal niet -- daarvoor blijft
 *    het oog de enige rechter.
 *
 * Er wordt alleen gelezen. In de spelmap wordt niets geschreven.
 */
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import { leesBusModel } from '../src/core/busmodel'
import { findOmsiInstall } from '../src/core/install'
import { ontleedTextuur, type TextuurKlacht, type TextuurLezing } from '../src/core/textuur'
import { listVehicles } from '../src/core/vehicles'

const losse = process.argv.slice(2)
const kladIndex = losse.indexOf('--kladmap')
const kladmap = kladIndex >= 0 ? losse[kladIndex + 1] : join(process.env.TEMP ?? '.', 'probe-textuur')
const aangewezen = losse.find((a, i) => !a.startsWith('--') && i !== kladIndex + 1)

const omsi = findOmsiInstall(aangewezen)
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden. Geef het pad als argument mee.')
  process.exit(1)
}
const wortel: string = omsi
console.log(`OMSI: ${wortel}`)

// ------------------------------------------------- welke texturen noemt een bus

const bussen = listVehicles(wortel)
/** Pad -> hoe vaak een bus ernaar verwijst. */
const verwijzingen = new Map<string, number>()
/** Namen die in de cfg staan maar niet op schijf gevonden zijn. */
const zoek = new Map<string, number>()
/** Per bus de texturen die hij noemt; één keer gelezen, twee keer gebruikt. */
const perBusTexturen = new Map<string, Set<string>>()
let metModel = 0

for (const bus of bussen) {
  const model = leesBusModel(join(wortel, bus.relativePath))
  if (!model) continue
  metModel++
  const eigen = new Set<string>()
  perBusTexturen.set(bus.relativePath, eigen)
  for (const deel of model.onderdelen) {
    for (const materiaal of deel.materialen) {
      if (!materiaal.pad) {
        const ext = extname(materiaal.textuur).toLowerCase() || '(geen)'
        zoek.set(ext, (zoek.get(ext) ?? 0) + 1)
        continue
      }
      verwijzingen.set(materiaal.pad, (verwijzingen.get(materiaal.pad) ?? 0) + 1)
      eigen.add(materiaal.pad)
    }
  }
}

const paden = [...verwijzingen.keys()]
const totaalVerwijzingen = [...verwijzingen.values()].reduce((a, b) => a + b, 0)
console.log(
  `${bussen.length} bestuurbare bussen, ${metModel} met een model, ` +
    `${totaalVerwijzingen.toLocaleString('nl-NL')} verwijzingen naar ${paden.length.toLocaleString('nl-NL')} verschillende texturen\n`
)

// ------------------------------------------------------------------- uitpakken

interface Uitslag {
  pad: string
  bytes: number
  ms: number
  breedte: number
  hoogte: number
  lezing: TextuurLezing
  ext: string
}

const uitslagen: Uitslag[] = []
let bytesTotaal = 0
let pixelsTotaal = 0
let leesMs = 0
let ontleedMs = 0

for (const pad of paden) {
  const ext = extname(pad).toLowerCase() || '(geen)'
  let bytes: Buffer
  const tLees = performance.now()
  try {
    bytes = readFileSync(pad)
  } catch (fout) {
    uitslagen.push({
      pad,
      bytes: 0,
      ms: 0,
      breedte: 0,
      hoogte: 0,
      ext,
      lezing: { klacht: 'onleesbaar', detail: (fout as Error).message }
    })
    continue
  }
  leesMs += performance.now() - tLees
  bytesTotaal += bytes.length

  const t0 = performance.now()
  const lezing = ontleedTextuur(bytes)
  const ms = performance.now() - t0
  ontleedMs += ms
  if (lezing.textuur) pixelsTotaal += lezing.textuur.breedte * lezing.textuur.hoogte

  uitslagen.push({
    pad,
    bytes: bytes.length,
    ms,
    breedte: lezing.textuur?.breedte ?? 0,
    hoogte: lezing.textuur?.hoogte ?? 0,
    ext,
    lezing
  })
}

// -------------------------------------------------------------- wat lukt er

const gelukt = uitslagen.filter((u) => u.lezing.textuur)
const chromium = uitslagen.filter((u) => u.lezing.klacht === 'chromium-kan-dit')
const stuk = uitslagen.filter((u) => !u.lezing.textuur && u.lezing.klacht !== 'chromium-kan-dit')

const deel = (aantal: number): string => `${((100 * aantal) / uitslagen.length).toFixed(2)}%`
console.log('UITKOMST (per bestand, dubbele texturen één keer geteld)')
console.log(`  uitgepakt tot pixels : ${gelukt.length} (${deel(gelukt.length)})`)
console.log(`  aan Chromium gelaten : ${chromium.length} (${deel(chromium.length)})`)
console.log(`  niets uit gekregen   : ${stuk.length} (${deel(stuk.length)})`)

/** Hetzelfde maar gewogen naar hoe vaak een bus er werkelijk naar wijst. */
const gewogen = (lijst: Uitslag[]): number =>
  lijst.reduce((som, u) => som + (verwijzingen.get(u.pad) ?? 0), 0)
console.log('\nUITKOMST (gewogen naar het aantal verwijzingen)')
console.log(`  uitgepakt tot pixels : ${gewogen(gelukt).toLocaleString('nl-NL')}`)
console.log(`  aan Chromium gelaten : ${gewogen(chromium).toLocaleString('nl-NL')}`)
console.log(`  niets uit gekregen   : ${gewogen(stuk).toLocaleString('nl-NL')}`)

// ------------------------------------------------------ per extensie en vorm

interface Bak {
  gelukt: number
  mislukt: number
  redenen: Map<string, number>
}
const perExt = new Map<string, Bak>()
const perVorm = new Map<string, Bak>()
const bak = (m: Map<string, Bak>, sleutel: string): Bak => {
  let b = m.get(sleutel)
  if (!b) {
    b = { gelukt: 0, mislukt: 0, redenen: new Map() }
    m.set(sleutel, b)
  }
  return b
}
for (const u of uitslagen) {
  const vorm = u.lezing.vorm ?? '(niet herkend)'
  for (const b of [bak(perExt, u.ext), bak(perVorm, vorm)]) {
    if (u.lezing.textuur) b.gelukt++
    else {
      b.mislukt++
      const reden = `${u.lezing.klacht}: ${u.lezing.detail}`
      b.redenen.set(reden, (b.redenen.get(reden) ?? 0) + 1)
    }
  }
}

console.log('\nPER EXTENSIE (wat de naam belooft)')
for (const [ext, b] of [...perExt].sort((a, c) => c[1].gelukt + c[1].mislukt - a[1].gelukt - a[1].mislukt)) {
  console.log(`  ${ext.padEnd(8)} ${String(b.gelukt).padStart(5)} gelukt, ${String(b.mislukt).padStart(5)} niet`)
}
if (zoek.size) {
  console.log('  niet op schijf gevonden (naam uit de cfg, bestand ontbreekt):')
  for (const [ext, aantal] of [...zoek].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${ext.padEnd(8)} ${aantal} verwijzingen`)
  }
}

console.log('\nPER VORM (wat er werkelijk in staat)')
for (const [vorm, b] of [...perVorm].sort((a, c) => c[1].gelukt + c[1].mislukt - a[1].gelukt - a[1].mislukt)) {
  console.log(`  ${vorm.padEnd(14)} ${String(b.gelukt).padStart(5)} gelukt, ${String(b.mislukt).padStart(5)} niet`)
  for (const [reden, aantal] of [...b.redenen].sort((a, c) => c[1] - a[1]).slice(0, 4)) {
    console.log(`       ${aantal}x ${reden}`)
  }
}

// -------------------------------------------------- wat er niet uit te krijgen is

const perKlacht = new Map<TextuurKlacht, Uitslag[]>()
for (const u of stuk) {
  const klacht = u.lezing.klacht ?? 'onbekend-formaat'
  const lijst = perKlacht.get(klacht) ?? []
  lijst.push(u)
  perKlacht.set(klacht, lijst)
}
console.log('\nWAT NIET LUKT')
if (!perKlacht.size) console.log('  niets')
for (const [klacht, lijst] of [...perKlacht].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${klacht}: ${lijst.length}`)
  for (const u of lijst.slice(0, 6)) {
    console.log(`     ${relative(wortel, u.pad)} (${u.bytes} bytes) — ${u.lezing.detail}`)
  }
  if (lijst.length > 6) console.log(`     ... en nog ${lijst.length - 6}`)
}

// ------------------------------------------------------------------- de tijd

console.log('\nTIJD')
console.log(
  `  uitpakken van alles: ${(ontleedMs / 1000).toFixed(2)} s voor ` +
    `${(bytesTotaal / 1024 / 1024).toFixed(0)} MB op schijf en ` +
    `${(pixelsTotaal / 1e6).toFixed(0)} miljoen pixels ` +
    `(${(pixelsTotaal / 1e6 / (ontleedMs / 1000)).toFixed(0)} Mpx/s)`
)
console.log(`  van schijf halen   : ${(leesMs / 1000).toFixed(2)} s`)
const zwaarste = [...gelukt].sort((a, b) => b.ms - a.ms)
console.log('\n  de zwaarste texturen')
for (const u of zwaarste.slice(0, 6)) {
  console.log(
    `     ${u.ms.toFixed(0).padStart(5)} ms  ${String(u.breedte).padStart(5)}x${String(u.hoogte).padEnd(5)}` +
      ` ${(u.bytes / 1024 / 1024).toFixed(1).padStart(5)} MB  ${u.lezing.vorm?.padEnd(12)} ${relative(wortel, u.pad)}`
  )
}

/** Wat kost een hele bus aan texturen? Dat is wat de buskeuze moet ophoesten. */
const opPad = new Map(uitslagen.map((u) => [u.pad, u]))
const perBus = new Map<string, { ms: number; bytes: number; aantal: number }>()
for (const [naam, eigen] of perBusTexturen) {
  let ms = 0
  let bytes = 0
  for (const pad of eigen) {
    const u = opPad.get(pad)
    if (!u) continue
    ms += u.ms
    bytes += u.bytes
  }
  perBus.set(naam, { ms, bytes, aantal: eigen.size })
}
console.log('\n  de bussen met de meeste textuurtijd')
for (const [naam, b] of [...perBus].sort((a, c) => c[1].ms - a[1].ms).slice(0, 5)) {
  console.log(
    `     ${b.ms.toFixed(0).padStart(5)} ms  ${String(b.aantal).padStart(4)} texturen ` +
      `${(b.bytes / 1024 / 1024).toFixed(0).padStart(4)} MB  ${naam}`
  )
}
const alleTijden = [...perBus.values()].map((b) => b.ms).sort((a, b) => a - b)
if (alleTijden.length) {
  console.log(
    `     midden: ${alleTijden[alleTijden.length >> 1].toFixed(0)} ms per bus, ` +
      `gemiddeld ${(alleTijden.reduce((a, b) => a + b, 0) / alleTijden.length).toFixed(0)} ms`
  )
}

// ------------------------------------------------------------- de afmetingen

const opMaat = [...gelukt].sort((a, b) => b.breedte * b.hoogte - a.breedte * a.hoogte)
console.log('\nDE GROOTSTE AFMETINGEN')
for (const u of opMaat.slice(0, 6)) {
  console.log(
    `  ${String(u.breedte).padStart(5)} x ${String(u.hoogte).padEnd(5)} ` +
      `${((u.breedte * u.hoogte * 4) / 1024 / 1024).toFixed(0).padStart(4)} MB aan RGBA  ${relative(wortel, u.pad)}`
  )
}
const zijden = new Map<string, number>()
for (const u of gelukt) {
  const s = `${u.breedte}x${u.hoogte}`
  zijden.set(s, (zijden.get(s) ?? 0) + 1)
}
console.log('  meest voorkomende maten:')
for (const [s, n] of [...zijden].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`     ${s}: ${n}`)
console.log(
  `  samen ${(gelukt.reduce((som, u) => som + u.breedte * u.hoogte * 4, 0) / 1024 / 1024 / 1024).toFixed(1)} GB` +
    ' aan RGBA als je ze allemaal tegelijk zou willen vasthouden'
)

// ------------------------------------------------------------------ de alfa

/*
 * Hoeveel doorzichtigheid zit er werkelijk in? Dit is de controle op de
 * alfakanalen van DXT3, DXT5 en 32-bits TGA: staat die overal op nul, dan is de
 * bus onzichtbaar en klopt er iets niet aan de uitpakker.
 */
console.log('\nDE ALFA, PER VORM')
const alfaBak = new Map<string, { vol: number; nul: number; varieert: number }>()
/** De texturen waar werkelijk iets van te zien is; die gaan straks op de foto. */
const alfaZichtbaar: string[] = []
for (const u of gelukt) {
  const t = u.lezing.textuur
  if (!t) continue
  let min = 255
  let max = 0
  const n = t.breedte * t.hoogte
  const stap = Math.max(1, Math.floor(n / 20000))
  for (let i = 0; i < n; i += stap) {
    const a = t.pixels[i * 4 + 3]
    if (a < min) min = a
    if (a > max) max = a
  }
  const vorm = u.lezing.vorm ?? '?'
  const b = alfaBak.get(vorm) ?? { vol: 0, nul: 0, varieert: 0 }
  if (min === 255) b.vol++
  else if (max === 0) b.nul++
  else b.varieert++
  if (max > 0) alfaZichtbaar.push(u.pad)
  alfaBak.set(vorm, b)
}
for (const [vorm, b] of [...alfaBak].sort((a, c) => c[1].vol + c[1].nul + c[1].varieert - a[1].vol - a[1].nul - a[1].varieert)) {
  console.log(`  ${vorm.padEnd(14)} dekkend ${b.vol}, varieert ${b.varieert}, overal doorzichtig ${b.nul}`)
}

// ------------------------------------------------------- de plaatjes zelf

/*
 * Van elke vorm één textuur als .png, verkleind. Niet om iets te tellen maar om
 * er met een oog naar te kijken: een omgekeerd beeld en verwisseld rood en
 * blauw zie je op geen enkele andere manier.
 */
mkdirSync(kladmap, { recursive: true })
console.log(`\nDE PLAATJES (in ${kladmap})`)

/*
 * Niet zomaar de grootste van elke vorm. `MAN_SL_ext.dds` is de grootste DXT5
 * en staat in het bestand op alfa nul over de hele textuur -- dat is geen
 * leesfout (de ijkwaarden a0 en a1 zijn in élk van de 262.144 blokken nul) maar
 * het levert wel een leeg plaatje op, en daar valt niets aan te zien. Dus:
 * de grootste waar iets van te zien is.
 */
const perVormGrootste = new Map<string, Uitslag>()
const zichtbaar = new Set(alfaZichtbaar)
for (const u of gelukt) {
  const vorm = u.lezing.vorm ?? '?'
  if (!zichtbaar.has(u.pad)) continue
  const staand = perVormGrootste.get(vorm)
  if (!staand || u.breedte * u.hoogte > staand.breedte * staand.hoogte) perVormGrootste.set(vorm, u)
}

for (const [vorm, u] of perVormGrootste) {
  const t = u.lezing.textuur
  if (!t) continue
  const naam = join(kladmap, `${vorm}.png`.replace(/[^\w.-]/g, '_'))
  const klein = verklein(t.pixels, t.breedte, t.hoogte, 384)
  schrijfPng(naam, klein.breedte, klein.hoogte, klein.rgb)
  console.log(`  ${vorm.padEnd(14)} ${t.breedte}x${t.hoogte} -> ${naam}`)
  console.log(`     uit ${relative(wortel, u.pad)}`)
}

// ------------------------------------------------- de tweede mening van Windows

/*
 * Van elke DXT-vorm één bestand door de uitpakker van Windows halen en de
 * pixels vergelijken. Er wordt een rooster van 32 bij 32 afgetast en niet het
 * hele beeld: dat gaat als tekst door PowerShell heen, en duizend pixels op een
 * plek die de hele textuur beslaat vangen een verwisseld kanaal of een
 * omgekeerde volgorde net zo hard als acht miljoen.
 */
console.log('\nNAAST DE UITPAKKER VAN WINDOWS (WIC)')
const script = join(kladmap, 'wic.ps1')
writeFileSync(
  script,
  [
    'param([string]$Pad, [string]$Uit)',
    'Add-Type -AssemblyName PresentationCore',
    'Add-Type -AssemblyName WindowsBase',
    '$stroom = [System.IO.File]::OpenRead($Pad)',
    '$decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stroom,' +
      ' [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,' +
      ' [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)',
    '$om = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap',
    '$om.BeginInit(); $om.Source = $decoder.Frames[0]',
    '$om.DestinationFormat = [System.Windows.Media.PixelFormats]::Bgra32; $om.EndInit()',
    '$b = $om.PixelWidth; $h = $om.PixelHeight; $stride = $b * 4',
    '$buf = New-Object byte[] ($stride * $h)',
    '$om.CopyPixels($buf, $stride, 0)',
    '$regels = New-Object System.Collections.Generic.List[string]',
    '$regels.Add("$b $h")',
    'for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {',
    '  $py = [int]($y * $h / 32); $px = [int]($x * $b / 32); $p = $py * $stride + $px * 4',
    '  $regels.Add("$px $py $($buf[$p+2]) $($buf[$p+1]) $($buf[$p]) $($buf[$p+3])") } }',
    '[System.IO.File]::WriteAllLines($Uit, $regels)',
    '$stroom.Close()'
  ].join('\n'),
  'latin1'
)

for (const vorm of ['DXT1', 'DXT3', 'DXT5']) {
  const u = perVormGrootste.get(vorm)
  const t = u?.lezing.textuur
  if (!u || !t) continue
  const uitPad = join(kladmap, `wic-${vorm}.txt`)
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Pad', u.pad, '-Uit', uitPad],
      { stdio: 'pipe' }
    )
  } catch (fout) {
    console.log(`  ${vorm}: Windows kreeg het niet open (${String(fout).split('\n')[0]})`)
    continue
  }
  const regels = readFileSync(uitPad, 'utf8').trim().split(/\r?\n/)
  let gelijk = 0
  let eenStap = 0
  let verder = 0
  let alfaAnders = 0
  for (const regel of regels.slice(1)) {
    const [x, y, r, g, b, a] = regel.split(' ').map(Number)
    const p = (y * t.breedte + x) * 4
    const verschil = Math.max(
      Math.abs(t.pixels[p] - r),
      Math.abs(t.pixels[p + 1] - g),
      Math.abs(t.pixels[p + 2] - b),
      Math.abs(t.pixels[p + 3] - a)
    )
    if (t.pixels[p + 3] !== a) alfaAnders++
    if (verschil === 0) gelijk++
    else if (verschil === 1) eenStap++
    else verder++
  }
  console.log(
    `  ${vorm.padEnd(6)} ${regels.length - 1} pixels afgetast: ${gelijk} precies gelijk, ` +
      `${eenStap} één stap ernaast, ${verder} verder — alfa anders: ${alfaAnders}`
  )
  console.log(`     ${relative(wortel, u.pad)}`)
}

/**
 * Een verkleinde kopie, met de alfa over een ruitjespatroon gelegd.
 *
 * Het ruitje is er zodat doorzichtig van zwart te onderscheiden valt: een ruit
 * die per ongeluk alfa nul kreeg ziet er anders precies zo uit als een ruit die
 * zwart geverfd is.
 */
function verklein(
  pixels: Uint8Array,
  breedte: number,
  hoogte: number,
  maxZijde: number
): { breedte: number; hoogte: number; rgb: Uint8Array } {
  const factor = Math.max(1, Math.ceil(Math.max(breedte, hoogte) / maxZijde))
  const nb = Math.max(1, Math.floor(breedte / factor))
  const nh = Math.max(1, Math.floor(hoogte / factor))
  const rgb = new Uint8Array(nb * nh * 3)
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nb; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let dy = 0; dy < factor; dy++) {
        const by = y * factor + dy
        if (by >= hoogte) break
        for (let dx = 0; dx < factor; dx++) {
          const bx = x * factor + dx
          if (bx >= breedte) break
          const p = (by * breedte + bx) * 4
          r += pixels[p]
          g += pixels[p + 1]
          b += pixels[p + 2]
          a += pixels[p + 3]
          n++
        }
      }
      const ruit = ((x >> 3) + (y >> 3)) & 1 ? 200 : 140
      const alfa = a / n / 255
      const uit = (y * nb + x) * 3
      rgb[uit] = (r / n) * alfa + ruit * (1 - alfa)
      rgb[uit + 1] = (g / n) * alfa + ruit * (1 - alfa)
      rgb[uit + 2] = (b / n) * alfa + ruit * (1 - alfa)
    }
  }
  return { breedte: nb, hoogte: nh, rgb }
}

/**
 * Een PNG schrijven zonder er een afhankelijkheid bij te halen.
 *
 * Een PNG is niet meer dan vier blokken met een lengte, een naam, de inhoud en
 * een CRC erachter; de pixels gaan door dezelfde deflate die `node:zlib` al
 * meelevert, met voor elke rij een nulbyte die zegt "geen filter".
 */
function schrijfPng(pad: string, breedte: number, hoogte: number, rgb: Uint8Array): void {
  const rauw = Buffer.alloc(hoogte * (1 + breedte * 3))
  for (let y = 0; y < hoogte; y++) {
    const uit = y * (1 + breedte * 3)
    rauw[uit] = 0
    Buffer.from(rgb.buffer, rgb.byteOffset + y * breedte * 3, breedte * 3).copy(rauw, uit + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breedte, 0)
  ihdr.writeUInt32BE(hoogte, 4)
  ihdr[8] = 8 // bits per kanaal
  ihdr[9] = 2 // kleursoort 2: rood, groen, blauw
  const blokken = [
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(rauw, { level: 6 })),
    blok('IEND', Buffer.alloc(0))
  ]
  writeFileSync(pad, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...blokken]))
}

function blok(naam: string, inhoud: Buffer): Buffer {
  const kop = Buffer.alloc(8)
  kop.writeUInt32BE(inhoud.length, 0)
  kop.write(naam, 4, 'latin1')
  const staart = Buffer.alloc(4)
  staart.writeUInt32BE(crc32(Buffer.concat([kop.subarray(4), inhoud])), 0)
  return Buffer.concat([kop, inhoud, staart])
}

/*
 * De tabel wordt binnen de functie gemaakt en niet ernaast. Dat is met opzet:
 * de plaatjes worden hierboven geschreven, en een `const` of `let` die verderop
 * in het bestand staat bestaat op dat moment nog niet (functies worden wel naar
 * voren gehaald, waarden niet). Het kost 256 regels rekenwerk per plaatje,
 * tegen megabytes die er doorheen gaan.
 */
function crc32(bytes: Buffer): number {
  const tabel = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabel[n] = c >>> 0
  }
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = tabel[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
