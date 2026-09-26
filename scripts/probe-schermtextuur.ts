/**
 * Zoekt en levert `core/schermtextuur.ts` de plaatjes van een apparaatscherm
 * zoals OMSI ze gebruikt -- en weigert hij wat hij moet weigeren?
 *
 *   npx tsx scripts/probe-schermtextuur.ts ["<pad naar OMSI 2>"] [--kladmap <map>]
 *
 * Vier proeven, alle vier tegen de echte installatie:
 *
 * 1. WEIGEREN. Namen die de texturenmap uit willen (`..\x`, `C:\x`, `\\server`,
 *    `x.jpg:stroom`, `CON.jpg`) of geen plaatje zijn (`foo.exe`) geven niets.
 * 2. ZOEKEN. De ALMEX-achtergrond van de `HH20_EBus2021`, `AFR200.tga` van de
 *    `TH_Ueberlandbus` (staat op schijf als `.dds`), een freetex-waarde met
 *    submap bij de `MB_C2_EN_BVG`, iets uit `<OMSI>\Texture`, en een naam die
 *    alleen via de index van de voertuigmap te vinden is.
 * 3. LEVEREN. Per geval het type, de maat, of een JPEG ongewijzigd bleef, en
 *    de tijd. De PNG's gaan naar de kladmap om te BEKIJKEN. Daarnaast de
 *    onafhankelijke proef: Windows (WIC, via PowerShell) leest onze PNG terug
 *    en de oorspronkelijke DDS/BMP/PNG zelf, en die pixels worden naast elkaar
 *    gelegd -- zo zegt niet onze eigen code dat onze eigen code klopt.
 *    Daarna de randgevallen: alfatest bij een textuur die verkleind wordt, een
 *    16-bits BMP met alfamasker, een zipbom, 3000 verminkte bestanden (niets
 *    mag gooien), en zoeken zonder volledige paden (dan niets). Elk gevonden
 *    pad moet binnen de bus of `<OMSI>\Texture` liggen.
 * 4. HET REGISTER. Alleen geregistreerde ids, geen raar id, vergeten werkt, en
 *    het geheugen blijft onder de 48 MB.
 *
 * Er wordt alleen gelezen in de spelmap; schrijven gebeurt in de kladmap.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { deflateSync } from 'node:zlib'
import { findOmsiInstall } from '../src/core/install'
import { leesPng, pngKop, pngVan } from '../src/core/png'
import {
  beeldVoorBrowser,
  naamDelen,
  textuurBron,
  zoekSchermtextuur,
  type Vlaggen
} from '../src/core/schermtextuur'
import { ontleedTextuur, pakBmpUit, verkleinGemiddeld, type Textuur } from '../src/core/textuur'
import {
  isTextuurId,
  registreer,
  schermtexturenStand,
  textuurBytes,
  vergeetBehalve
} from '../src/main/schermtexturen'

const losse = process.argv.slice(2)
const kladIndex = losse.indexOf('--kladmap')
const kladmap = kladIndex >= 0 ? losse[kladIndex + 1] : join(process.env.TEMP ?? '.', 'probe-schermtextuur')
const aangewezen = losse.find((a, i) => !a.startsWith('--') && (kladIndex < 0 || i !== kladIndex + 1))
const gevonden = findOmsiInstall(aangewezen)
if (!gevonden) {
  console.error('Geen OMSI 2-installatie gevonden. Geef het pad als argument mee.')
  process.exit(1)
}
const omsi: string = gevonden
mkdirSync(kladmap, { recursive: true })
console.log(`OMSI: ${omsi}\nKladmap: ${kladmap}`)

let fouten = 0
function eis(goed: boolean, tekst: string): void {
  console.log(`  ${goed ? 'ok  ' : 'FOUT'} ${tekst}`)
  if (!goed) fouten++
}
const rel = (pad: string | undefined): string => (pad ? relative(omsi, pad) : '(niets)')
const cfg = (bus: string, naam: string): string => join(omsi, 'Vehicles', bus, 'Model', naam)

const HH20 = cfg('HH20_EBus2021', 'model_21_main.cfg')
const HH109 = cfg('HH109_Stadtgelenkbus2012_HHA', 'model_CG2_VW.cfg')
const TH = cfg('TH_Ueberlandbus', 'O550_Euro3.cfg')
const C2 = cfg('MB_C2_EN_BVG', 'model_MB_C2_E6_Solo.cfg')

// ------------------------------------------------------------------ weigeren

console.log('\n1. WEIGEREN')
const slecht = [
  '..\\x',
  '..\\x.jpg',
  '..\\..\\..\\..\\Windows\\win.ini',
  'Texture\\..\\..\\17_almex_s_0.jpg',
  'a/../../b.jpg',
  '...\\x.jpg',
  '.. \\x.jpg',
  'C:\\x',
  'C:\\Windows\\Web\\Screen\\img100.jpg',
  'C:x.jpg',
  '\\x.jpg',
  '\\\\server\\share\\x.jpg',
  '\\\\?\\C:\\x.jpg',
  '/etc/x.png',
  'foo.exe',
  '17_almex_s_0.jpg.exe',
  '17_almex_s_0.jpg:geheim',
  'CON.jpg',
  'Fahrauftraege\\nul.png',
  'x.jpg\u0000.exe',
  'x*.jpg',
  '',
  '   ',
  'x'
]
for (const naam of slecht) {
  eis(zoekSchermtextuur(HH20, omsi, naam) === undefined, `weigert ${JSON.stringify(naam)}`)
}
// En deze mogen wel, al zien ze er vreemd uit.
for (const naam of ['17_ALMEX_S_0.JPG', '.\\17_almex_s_0.jpg', 'Fahrauftraege//2190101.jpg']) {
  eis(naamDelen(naam) !== undefined, `laat ${JSON.stringify(naam)} door`)
}

// --------------------------------------------------------------------- zoeken

console.log('\n2. ZOEKEN')
const zoekGevallen: [string, string, string, string][] = [
  ['HH20 achtergrond', HH20, '17_almex_s_0.jpg', 'Vehicles\\HH20_EBus2021\\Texture\\17_almex_s_0.jpg'],
  ['HH20 rood vak', HH20, 'almex_versp_rot.jpg', 'Vehicles\\HH20_EBus2021\\Texture\\almex_versp_rot.jpg'],
  ['HH20 hoofdletters', HH20, '17_ALMEX_S_0.JPG', 'Vehicles\\HH20_EBus2021\\Texture\\17_ALMEX_S_0.JPG'],
  ['HH109 freetex', HH109, 'almex_s_0.dds', 'Vehicles\\HH109_Stadtgelenkbus2012_HHA\\Texture\\almex_s_0.dds'],
  ['TH .tga staat als .dds', TH, 'AFR200.tga', 'Vehicles\\TH_Ueberlandbus\\Texture\\AFR200.dds'],
  [
    'C2 freetex met submap',
    C2,
    'AFR4_Displays_neue_Software\\atron_ST1.png',
    'Vehicles\\MB_C2_EN_BVG\\Texture\\AFR4_Displays_neue_Software\\atron_ST1.png'
  ],
  ['HH20 submap exact', HH20, 'Fahrauftraege\\2190101.jpg', 'Vehicles\\HH20_EBus2021\\Texture\\Fahrauftraege\\2190101.jpg'],
  ['gedeelde OMSI-map', HH20, 'HBusstop.tga', 'Texture\\HBusstop.tga'],
  ['alleen via de index', HH20, '2190101.jpg', 'Vehicles\\HH20_EBus2021\\Texture\\Fahrauftraege\\2190101.jpg'],
  ['bestaat nergens', HH109, 'almex_s_start.bmp', '(niets)']
]
for (const [wat, model, naam, verwacht] of zoekGevallen) {
  const t0 = performance.now()
  const pad = zoekSchermtextuur(model, omsi, naam)
  const ms = performance.now() - t0
  eis(rel(pad).toLowerCase() === verwacht.toLowerCase(), `${wat}: ${naam} -> ${rel(pad)} (${ms.toFixed(1)} ms)`)
  // En los van wat er verwacht werd: nooit buiten de bus of de gedeelde texturenmap.
  if (pad) {
    const bus = dirname(dirname(model))
    const binnen = [join(bus, 'Texture'), join(omsi, 'Texture'), bus].some((m) =>
      resolve(pad).toLowerCase().startsWith(resolve(m).toLowerCase() + sep)
    )
    eis(binnen, `${wat}: ligt binnen de bus of ${join('OMSI', 'Texture')}`)
  }
}

// Een freetex-waarde komt tien keer per seconde; de tweede keer moet gratis zijn.
{
  const t0 = performance.now()
  for (let i = 0; i < 100; i++) zoekSchermtextuur(HH109, omsi, 'almex_s_start.bmp')
  const ms = (performance.now() - t0) / 100
  eis(ms < 0.5, `100 keer dezelfde onvindbare naam: ${ms.toFixed(3)} ms per keer`)
}

// ------------------------------------------------------------------- leveren

console.log('\n3. LEVEREN')

interface Geval {
  naam: string
  pad: string
  vlaggen: Vlaggen
  type: 'image/png' | 'image/jpeg' | 'image/bmp'
  maat?: [number, number]
  /** De bytes moeten die van het bestand zijn. */
  ongewijzigd?: boolean
  /** Hoe de pixels gecontroleerd worden tegen wat Windows zelf uit de bron haalt. */
  tegen?: 'rgba' | 'rgb'
  /** Wat de alfa van de uitkomst overal moet zijn, als dat vaststaat. */
  alfa?: number
}

const pad = (model: string, naam: string): string => {
  const p = zoekSchermtextuur(model, omsi, naam)
  if (!p) throw new Error(`${naam} niet gevonden`)
  return p
}
const font = (naam: string): string => join(omsi, 'Fonts', naam)
const voertuig = (...delen: string[]): string => join(omsi, 'Vehicles', ...delen)

const gevallen: Geval[] = [
  { naam: 'hh20_almex_s_0', pad: pad(HH20, '17_almex_s_0.jpg'), vlaggen: { alfa: 0 }, type: 'image/jpeg', ongewijzigd: true },
  { naam: 'hh20_versp_rot', pad: pad(HH20, 'almex_versp_rot.jpg'), vlaggen: { alfa: 0 }, type: 'image/jpeg', ongewijzigd: true },
  { naam: 'hh20_versp_rot_alfa2', pad: pad(HH20, 'almex_versp_rot.jpg'), vlaggen: { alfa: 2 }, type: 'image/jpeg', ongewijzigd: true },
  {
    naam: 'hh109_almex_s_0_dxt3_alfa0',
    pad: pad(HH109, 'almex_s_0.dds'),
    vlaggen: { alfa: 0 },
    type: 'image/png',
    maat: [512, 512],
    tegen: 'rgb',
    alfa: 255
  },
  {
    naam: 'hh109_almex_s_0_dxt3_alfa2',
    pad: pad(HH109, 'almex_s_0.dds'),
    vlaggen: { alfa: 2 },
    type: 'image/png',
    maat: [512, 512],
    tegen: 'rgba'
  },
  {
    naam: 'th_afr200_dxt5',
    pad: pad(TH, 'AFR200.tga'),
    vlaggen: { alfa: 0 },
    type: 'image/png',
    maat: [2048, 2048],
    tegen: 'rgb',
    alfa: 255
  },
  {
    // De strook van de AFR 200 uit de atlas (uv-px 76..830 x 1863..2010).
    naam: 'th_afr200_uitsnede',
    pad: pad(TH, 'AFR200.tga'),
    vlaggen: { alfa: 0, uit: [76, 1863, 754, 147] },
    type: 'image/png',
    maat: [754, 147],
    alfa: 255
  },
  {
    naam: 'c2_atron_st1_png',
    pad: pad(C2, 'AFR4_Displays_neue_Software\\atron_ST1.png'),
    vlaggen: { alfa: 2 },
    type: 'image/png',
    ongewijzigd: true
  },
  {
    naam: 'font_17_hhaschedule_32bit',
    pad: font('17_HHAschedule_font.bmp'),
    vlaggen: { alfa: 0 },
    type: 'image/png',
    tegen: 'rgb',
    alfa: 255
  },
  {
    naam: 'font_17_hhaschedule_alfa_24bit',
    pad: font('17_HHAschedule_font_alpha.bmp'),
    vlaggen: { alfa: 0 },
    type: 'image/bmp',
    ongewijzigd: true
  },
  {
    naam: 'font_17_hhaschedule_uitsnede',
    pad: font('17_HHAschedule_font_alpha.bmp'),
    vlaggen: { alfa: 0, uit: [0, 0, 120, 27] },
    type: 'image/png',
    maat: [120, 27]
  },
  {
    naam: 'font_th_matrix_8bit',
    pad: font('TH_Matrix_Font_7x6 - Kopie.bmp'),
    vlaggen: { alfa: 0, uit: [0, 0, 64, 7] },
    type: 'image/png',
    maat: [64, 7]
  },
  {
    // Een transmap met alleen alfa (grijs 255, alfa in 78 waarden).
    naam: 'manta_transmap',
    pad: voertuig('Opel_Manta_B', 'texture', 'manta_b.dds'),
    vlaggen: { alfa: 2, trans: voertuig('Opel_Manta_B', 'texture', 'Manta_B_T.tga') },
    type: 'image/png',
    maat: [1024, 1024]
  },
  {
    naam: 'bmp_4bit_palet',
    pad: voertuig('HOH_Iveco-Urbanway-18', 'Texture', 'DG3_on.bmp'),
    vlaggen: { alfa: 0, uit: [0, 0, 100000, 100000] },
    type: 'image/bmp',
    ongewijzigd: true
  },
  {
    naam: 'bmp_v5_bitfields_32',
    pad: voertuig('Citybus 628c 628g LF by Kajosoft', 'Texture', 'reflexion4.bmp'),
    vlaggen: { alfa: 2 },
    type: 'image/png',
    tegen: 'rgb'
  },
  {
    naam: 'png_interlaced_alfa0',
    pad: voertuig('HOH_KI_Autos', 'HOH_Polizei', 'Vectra', 'texture', 'Vectra.png'),
    vlaggen: { alfa: 0 },
    type: 'image/png',
    tegen: 'rgb',
    alfa: 255
  },
  {
    // Alfatest op een alfa aan beide kanten van 128: alleen 0 en 255 mogen overblijven.
    naam: 'wartehaus_alfatest',
    pad: join(omsi, 'Sceneryobjects', 'Ruede', 'Texture', '70er_wartehaus_t.tga'),
    vlaggen: { alfa: 1 },
    type: 'image/png',
    maat: [512, 512]
  }
]

/** Wat onze PNG's in de kladmap heten, om ze door Windows terug te laten lezen. */
const wicLijst: { naam: string; bron: string; uitkomst: string; geval: Geval }[] = []
const uitkomsten = new Map<string, Buffer>()

for (const geval of gevallen) {
  const bron = textuurBron(geval.pad, geval.vlaggen)
  const t0 = performance.now()
  const uit = beeldVoorBrowser(bron)
  const ms = performance.now() - t0
  if (!uit) {
    eis(false, `${geval.naam}: niets geleverd`)
    continue
  }
  const ext = uit.type === 'image/png' ? 'png' : uit.type === 'image/jpeg' ? 'jpg' : 'bmp'
  const bestand = join(kladmap, `${geval.naam}.${ext}`)
  writeFileSync(bestand, uit.bytes)
  uitkomsten.set(geval.naam, uit.bytes)
  const origineel = readFileSync(geval.pad)
  let maat = ''
  if (uit.type === 'image/png') {
    const kop = pngKop(uit.bytes)
    maat = kop ? `${kop.breedte} x ${kop.hoogte}` : 'geen geldige kop'
    if (geval.maat) eis(kop?.breedte === geval.maat[0] && kop?.hoogte === geval.maat[1], `${geval.naam}: maat ${maat}`)
  }
  eis(uit.type === geval.type, `${geval.naam}: ${uit.type}, ${uit.bytes.length.toLocaleString('nl-NL')} B` +
    ` (bron ${origineel.length.toLocaleString('nl-NL')} B) ${maat} in ${ms.toFixed(1)} ms` +
    (uit.melding ? ` -- ${uit.melding}` : ''))
  if (geval.ongewijzigd) eis(uit.bytes.equals(origineel), `${geval.naam}: byte voor byte het bestand zelf`)
  if (geval.alfa !== undefined && uit.type === 'image/png') {
    const t = leesPng(uit.bytes)
    let anders = 0
    if (t) for (let i = 3; i < t.pixels.length; i += 4) if (t.pixels[i] !== geval.alfa) anders++
    eis(!!t && anders === 0, `${geval.naam}: alfa overal ${geval.alfa}`)
  }
  if (geval.tegen) wicLijst.push({ naam: geval.naam, bron: geval.pad, uitkomst: bestand, geval })
}

// De transmap moet de alfa geven, en de alfatest mag daarvan alleen 0 en 255 overlaten.
{
  const kaart = ontleedTextuur(readFileSync(voertuig('Opel_Manta_B', 'texture', 'Manta_B_T.tga'))).textuur
  const manta = leesPng(uitkomsten.get('manta_transmap') ?? Buffer.alloc(0))
  let gelijk = 0
  if (manta && kaart) for (let i = 3; i < manta.pixels.length; i += 4) if (manta.pixels[i] === kaart.pixels[i]) gelijk++
  eis(!!manta && gelijk === 1024 * 1024, `transmap: alfa gelijk aan die van Manta_B_T.tga op ${gelijk} van 1.048.576 pixels`)

  const test = leesPng(uitkomsten.get('wartehaus_alfatest') ?? Buffer.alloc(0))
  const bron = ontleedTextuur(readFileSync(join(omsi, 'Sceneryobjects', 'Ruede', 'Texture', '70er_wartehaus_t.tga'))).textuur
  const waarden = new Map<number, number>()
  let goed = 0
  if (test && bron) {
    for (let i = 3; i < test.pixels.length; i += 4) {
      waarden.set(test.pixels[i], (waarden.get(test.pixels[i]) ?? 0) + 1)
      if (test.pixels[i] === (bron.pixels[i] >= 128 ? 255 : 0)) goed++
    }
  }
  const telling = [...waarden].sort((a, b) => a[0] - b[0]).map(([a, n]) => `alfa ${a}: ${n} px`).join(', ')
  eis(!!test && goed === 512 * 512 && waarden.size === 2, `alfatest: ${telling}, overal volgens de drempel`)
}

// ---------------------------------------------------- naast Windows (WIC) gelegd

console.log('\n   Naast de lezer van Windows (WIC), 32 x 32 punten per beeld:')
const script = join(kladmap, 'wic.ps1')
writeFileSync(
  script,
  [
    'param([string]$Lijst)',
    'Add-Type -AssemblyName PresentationCore',
    'Add-Type -AssemblyName WindowsBase',
    'foreach ($regel in [System.IO.File]::ReadAllLines($Lijst)) {',
    '  $delen = $regel.Split("`t"); $Pad = $delen[0]; $Uit = $delen[1]',
    '  try {',
    '    $stroom = [System.IO.File]::OpenRead($Pad)',
    '    $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create($stroom,' +
      ' [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,' +
      ' [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)',
    '    $om = New-Object System.Windows.Media.Imaging.FormatConvertedBitmap',
    '    $om.BeginInit(); $om.Source = $decoder.Frames[0]',
    '    $om.DestinationFormat = [System.Windows.Media.PixelFormats]::Bgra32; $om.EndInit()',
    '    $b = $om.PixelWidth; $h = $om.PixelHeight; $stride = $b * 4',
    '    $buf = New-Object byte[] ($stride * $h)',
    '    $om.CopyPixels($buf, $stride, 0)',
    '    $regels = New-Object System.Collections.Generic.List[string]',
    '    $regels.Add("$b $h")',
    '    for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {',
    '      $py = [int][Math]::Floor($y * $h / 32); $px = [int][Math]::Floor($x * $b / 32); $p = $py * $stride + $px * 4',
    '      $regels.Add("$px $py $($buf[$p+2]) $($buf[$p+1]) $($buf[$p]) $($buf[$p+3])") } }',
    '    [System.IO.File]::WriteAllLines($Uit, $regels)',
    '    $stroom.Close()',
    '  } catch { [System.IO.File]::WriteAllText($Uit, "FOUT $($_.Exception.Message)") }',
    '}'
  ].join('\r\n'),
  'utf8'
)

/** Te lezen door WIC: per beeld de bron en onze uitkomst, plus losse PNG's en BMP's voor de lezers. */
const lezerPngs = [
  voertuig('HOH_KI_Autos', 'HOH_Polizei', 'Vectra', 'texture', 'Vectra.png'),
  voertuig('Anzeigen', 'Rollband_O307_Std', 'text3780.png'),
  voertuig('DAF_XF_105', 'texture', 'Anstriche', 'Heck.png'),
  voertuig('HC_HHA_DT4', 'texture', 'Monitor2.png'),
  voertuig('HOH_Iveco-Urbanway-18', 'Texture', 'Ext_Urbanway18_4.png'),
  voertuig('HOH_Iveco-Urbanway-18', 'Texture', 'vmatrix_leer_led_LM.png'),
  voertuig('Hohenkirchen_BR650', 'Texture', 'Innen_LM.png'),
  join(omsi, 'Vehicles', 'MB_C2_EN_BVG', 'Texture', 'AFR4_Displays_neue_Software', 'atron_ST1.png')
]
const lezerBmps = [
  font('17_HHAschedule_font.bmp'),
  font('17_HHAschedule_font_alpha.bmp'),
  font('TH_Matrix_Font_7x6 - Kopie.bmp'),
  font('BVG_TFT_Fett.bmp'),
  voertuig('HOH_Iveco-Urbanway-18', 'Texture', 'DG3_on.bmp'),
  voertuig('Citybus 628c 628g LF by Kajosoft', 'Texture', 'reflexion4.bmp'),
  voertuig('MAN_NewLionsCity', 'Texture', 'Display_ST.bmp'),
  voertuig('Opel_Manta_B', 'texture', 'manta_b.dds')
]

const lijst: string[] = []
const wicUit = (i: number, soort: string): string => join(kladmap, `wic-${soort}-${i}.txt`)
wicLijst.forEach((w, i) => {
  lijst.push(`${w.bron}\t${wicUit(i, 'bron')}`, `${w.uitkomst}\t${wicUit(i, 'uit')}`)
})
lezerPngs.forEach((p, i) => lijst.push(`${p}\t${wicUit(i, 'png')}`))
lezerBmps.forEach((p, i) => lijst.push(`${p}\t${wicUit(i, 'bmp')}`))
const lijstPad = join(kladmap, 'wic-lijst.txt')
writeFileSync(lijstPad, lijst.join('\r\n'), 'utf8')
const tWic = performance.now()
let wicGelukt = true
try {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Lijst', lijstPad], {
    stdio: 'pipe'
  })
} catch (fout) {
  wicGelukt = false
  console.log(`   Windows kreeg het niet open (${String(fout).split('\n')[0]})`)
}
console.log(`   (WIC: ${((performance.now() - tWic) / 1000).toFixed(1)} s)`)

type Punt = [number, number, number, number, number, number]
function leesWic(bestand: string): { breedte: number; hoogte: number; punten: Punt[] } | string {
  let tekst: string
  try {
    tekst = readFileSync(bestand, 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return 'geen uitvoer'
  }
  if (tekst.startsWith('FOUT')) return tekst.trim()
  const regels = tekst.trim().split(/\r?\n/)
  const [breedte, hoogte] = regels[0].split(' ').map(Number)
  return { breedte, hoogte, punten: regels.slice(1).map((r) => r.split(' ').map(Number) as Punt) }
}

/** Het grootste verschil per kanaal tussen twee reeksen punten, en hoe vaak de alfa verschilt. */
function verschil(a: Punt[], b: Punt[], alfaMee: boolean): { max: number; alfa: number } {
  let max = 0
  let alfa = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    for (let k = 2; k < 5; k++) max = Math.max(max, Math.abs(a[i][k] - b[i][k]))
    if (alfaMee && a[i][5] !== b[i][5]) alfa++
  }
  return { max, alfa }
}

/** Dezelfde punten uit pixels die wij zelf uitpakten. */
function punten(t: Textuur): Punt[] {
  const uit: Punt[] = []
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const py = Math.floor((y * t.hoogte) / 32)
      const px = Math.floor((x * t.breedte) / 32)
      const p = (py * t.breedte + px) * 4
      uit.push([px, py, t.pixels[p], t.pixels[p + 1], t.pixels[p + 2], t.pixels[p + 3]])
    }
  }
  return uit
}

if (wicGelukt) {
  wicLijst.forEach((w, i) => {
    const bron = leesWic(wicUit(i, 'bron'))
    const uit = leesWic(wicUit(i, 'uit'))
    if (typeof uit === 'string') {
      eis(false, `${w.naam}: Windows leest onze PNG niet (${uit})`)
      return
    }
    // Wat wij zelf uit de bron haalden, met de vlaggen erop, moet exact in de PNG staan.
    const eigen = leesPng(uitkomsten.get(w.naam) ?? Buffer.alloc(0))
    const exact = eigen ? verschil(punten(eigen), uit.punten, true) : { max: 999, alfa: 999 }
    eis(exact.max === 0 && exact.alfa === 0, `${w.naam}: Windows leest onze PNG terug zoals wij hem schreven`)
    if (typeof bron === 'string') {
      console.log(`       (de bron kan Windows zelf niet lezen: ${bron})`)
      return
    }
    const v = verschil(bron.punten, uit.punten, w.geval.tegen === 'rgba')
    // DXT: de twee tussenkleuren ronden verschillend af, één stap mag (zie probe-textuur).
    eis(
      bron.breedte === uit.breedte && bron.hoogte === uit.hoogte && v.max <= 1 && v.alfa === 0,
      `${w.naam}: tegen Windows' eigen lezing van de bron: ` +
        `kleur hooguit ${v.max} stap ernaast` +
        (w.geval.tegen === 'rgba' ? `, alfa ${v.alfa} keer anders` : ' (alfa niet vergeleken)')
    )
  })

  console.log('\n   De PNG-lezer (leesPng) tegen Windows, RGBA exact:')
  lezerPngs.forEach((p, i) => {
    const w = leesWic(wicUit(i, 'png'))
    const bytes = readFileSync(p)
    const t0 = performance.now()
    const t = leesPng(bytes)
    const ms = performance.now() - t0
    const kop = pngKop(bytes)
    const vorm = kop ? `kleurtype ${kop.kleurtype}, ${kop.bits} bits${kop.interlace ? ', interlaced' : ''}` : '?'
    if (typeof w === 'string' || !t) {
      eis(false, `${rel(p)}: ${typeof w === 'string' ? w : 'niet uitgepakt'}`)
      return
    }
    const v = verschil(punten(t), w.punten, true)
    eis(v.max === 0 && v.alfa === 0, `${rel(p)} (${vorm}, ${t.breedte} x ${t.hoogte}, ${ms.toFixed(1)} ms)`)
  })

  console.log('\n   De BMP-lezer (pakBmpUit) tegen Windows, RGB exact:')
  lezerBmps.forEach((p, i) => {
    const w = leesWic(wicUit(i, 'bmp'))
    const bytes = readFileSync(p)
    const t = pakBmpUit(bytes)
    const vorm = `${bytes.readUInt16LE(28)} bits, kop ${bytes.readUInt32LE(14)}, compressie ${bytes.readUInt32LE(30)}`
    if (typeof w === 'string' || !t) {
      eis(false, `${rel(p)}: ${typeof w === 'string' ? w : 'niet uitgepakt'}`)
      return
    }
    const v = verschil(punten(t), w.punten, false)
    eis(v.max === 0 && t.breedte === w.breedte && t.hoogte === w.hoogte, `${rel(p)} (${vorm}, ${t.breedte} x ${t.hoogte})`)
  })
}

// Verkleinen met het gemiddelde: een lijn van één pixel mag niet verdwijnen.
{
  const breedte = 8
  const pixels = new Uint8Array(breedte * 2 * 4)
  for (let i = 0; i < pixels.length; i += 4) pixels.set([0, 0, 0, 255], i)
  for (let y = 0; y < 2; y++) pixels.set([255, 255, 255, 255], (y * breedte + 3) * 4) // kolom 3 wit
  const klein = verkleinGemiddeld({ breedte, hoogte: 2, pixels }, 4)
  const rij = [...klein.pixels].filter((_, i) => i % 4 === 0).slice(0, 4)
  eis(rij.join(',') === '0,128,0,0', `verkleinGemiddeld: witte lijn van 1 px op 8 naar 4 wordt grijs (${rij.join(',')})`)
}

// ------------------------------------------------------------- randgevallen

console.log('\n   Randgevallen:')

/** De alfawaarden die in een geleverde PNG voorkomen, met hoe vaak. */
function alfaTelling(bytes: Buffer | undefined): Map<number, number> {
  const t = bytes ? leesPng(bytes) : undefined
  const uit = new Map<number, number>()
  if (t) for (let i = 3; i < t.pixels.length; i += 4) uit.set(t.pixels[i], (uit.get(t.pixels[i]) ?? 0) + 1)
  return uit
}

/*
 * Alfatest bij een textuur die verkleind moet worden. De drempel hoort NA het
 * verkleinen (Direct3D test wat het bemonstert); ervoor maakte het gemiddelde
 * de randen weer halfdoorzichtig. 4096 x 4 naar 2048 x 2, in drie stroken:
 * om en om alfa 64 en 255 (gemiddeld 160, dus dekkend; met de drempel vooraf
 * werd dat 128), overal 100 (doorzichtig) en overal 255 (dekkend).
 */
{
  const [b, h] = [4096, 4]
  const px = new Uint8Array(b * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const a = x < 2048 ? (x % 2 ? 255 : 64) : x < 3072 ? 100 : 255
      px.set([200, 100, 50, a], (y * b + x) * 4)
    }
  }
  const bestand = join(kladmap, 'alfatest_breed.png')
  writeFileSync(bestand, pngVan(b, h, px))
  const uit = beeldVoorBrowser(textuurBron(bestand, { alfa: 1 }))
  const kop = uit && pngKop(uit.bytes)
  const telling = alfaTelling(uit?.bytes)
  eis(
    kop?.breedte === 2048 && kop.hoogte === 2 && telling.size === 2 && telling.get(0) === 1024 && telling.get(255) === 3072,
    `alfatest na verkleinen (${b} -> ${kop?.breedte}): ` +
      [...telling].sort((x, y) => x[0] - y[0]).map(([a, n]) => `alfa ${a}: ${n} px`).join(', ')
  )
}

/*
 * Een BMP van 16 bits met een alfamasker (A1R5G5B5, kop van 108): Chromium zou
 * de alfa toepassen. Bij alfa 0 moet hij dus door de eigen lezer en dekkend
 * uitkomen; bij alfa 2 houdt hij het masker.
 */
{
  const [b, h, kopMaat] = [4, 2, 108]
  const begin = 14 + kopMaat
  const rij = Math.ceil((b * 16) / 32) * 4
  const buf = Buffer.alloc(begin + rij * h)
  buf.write('BM', 0, 'latin1')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(begin, 10)
  buf.writeUInt32LE(kopMaat, 14)
  buf.writeInt32LE(b, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(16, 28)
  buf.writeUInt32LE(3, 30) // BI_BITFIELDS
  ;[0x7c00, 0x03e0, 0x001f, 0x8000].forEach((m, i) => buf.writeUInt32LE(m, 54 + i * 4))
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) buf.writeUInt16LE(x % 2 ? 0xffff : 0x7fff, begin + y * rij + x * 2)
  const bestand = join(kladmap, 'a1r5g5b5.bmp')
  writeFileSync(bestand, buf)
  const dekkend = beeldVoorBrowser(textuurBron(bestand, { alfa: 0 }))
  const mengen = beeldVoorBrowser(textuurBron(bestand, { alfa: 2 }))
  const d = alfaTelling(dekkend?.bytes)
  const m = alfaTelling(mengen?.bytes)
  eis(dekkend?.type === 'image/png' && d.size === 1 && d.get(255) === 8, `BMP 16 bits met alfamasker, alfa 0: ${dekkend?.type}, overal dekkend`)
  eis(mengen?.type === 'image/png' && m.get(0) === 4 && m.get(255) === 4, `BMP 16 bits met alfamasker, alfa 2: ${mengen?.type}, 4 doorzichtig en 4 dekkend`)
}

/* Een zipbom: een kop van 1 x 1 met beelddata die tot 200 MB uitpakt. */
{
  const blok = (soort: string, inhoud: Buffer): Buffer => {
    const kop = Buffer.alloc(8)
    kop.writeUInt32BE(inhoud.length, 0)
    kop.write(soort, 4, 'latin1')
    return Buffer.concat([kop, inhoud, Buffer.alloc(4)])
  }
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const bom = deflateSync(Buffer.alloc(200 * 2 ** 20), { level: 9 })
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', ihdr),
    blok('IDAT', bom),
    blok('IEND', Buffer.alloc(0))
  ])
  const t0 = performance.now()
  const t = leesPng(png)
  const ms = performance.now() - t0
  eis(t === undefined && ms < 50, `zipbom (${bom.length.toLocaleString('nl-NL')} B -> 200 MB): geweigerd in ${ms.toFixed(1)} ms`)

  // Een blok ná de beelddata dat niet af is: het beeld zelf is heel.
  const heel = pngVan(2, 2, new Uint8Array(16).fill(77))
  const staart = Buffer.concat([heel.subarray(0, heel.length - 12), Buffer.from([0, 0, 1, 0]), Buffer.from('tEXtabc', 'latin1')])
  eis(leesPng(staart)?.pixels[0] === 77, 'PNG met een afgekapt blok achter de beelddata: gelezen')
}

/*
 * Verminkte bestanden mogen nooit gooien: elke lezer geeft `undefined` of een
 * beeld. 3000 keer een echt bestand met één tot acht willekeurige bytes anders
 * (meestal in de kop) en in een vijfde van de gevallen afgekapt.
 */
{
  const bronnen = [
    voertuig('HC_HHA_DT4', 'texture', 'Monitor2.png'),
    voertuig('Anzeigen', 'Rollband_O307_Std', 'text3780.png'),
    font('TH_Matrix_Font_7x6 - Kopie.bmp'),
    voertuig('HOH_Iveco-Urbanway-18', 'Texture', 'DG3_on.bmp'),
    voertuig('Citybus 628c 628g LF by Kajosoft', 'Texture', 'reflexion4.bmp'),
    font('17_HHAschedule_font.bmp')
  ].map((p) => readFileSync(p))
  let zaad = 12345
  const kans = (): number => (zaad = (zaad * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  let gooit = 0
  let traagst = 0
  // Heet .png, maar wat het is komt uit de eerste bytes; een BMP gaat dus als BMP.
  const bestand = join(kladmap, 'verminkt.png')
  for (let n = 0; n < 3000; n++) {
    const b = Buffer.from(bronnen[n % bronnen.length])
    for (let j = 1 + Math.floor(kans() * 8); j > 0; j--) {
      b[Math.floor(kans() * Math.min(b.length, kans() < 0.7 ? 140 : b.length))] = Math.floor(kans() * 256)
    }
    const stuk = kans() < 0.2 ? b.subarray(0, Math.floor(kans() * b.length)) : b
    const t0 = performance.now()
    try {
      leesPng(stuk)
      pakBmpUit(stuk)
      pngKop(stuk)
      ontleedTextuur(stuk)
      // Eén op de tien ook door de hele weg, met alle vlaggen die iets doen.
      if (n % 10 === 0) {
        writeFileSync(bestand, stuk)
        beeldVoorBrowser({ id: '0'.repeat(20), pad: bestand, vlaggen: { alfa: 1 } })
        beeldVoorBrowser({ id: '0'.repeat(20), pad: bestand, vlaggen: { alfa: 2, uit: [1, 1, 30, 5], trans: bestand } })
      }
    } catch (fout) {
      if (gooit++ < 3) console.log(`       gooit: ${String(fout)}`)
    }
    traagst = Math.max(traagst, performance.now() - t0)
  }
  eis(gooit === 0, `3000 verminkte PNG's en BMP's: ${gooit} keer gegooid, traagste ${traagst.toFixed(1)} ms`)
}

// Zonder volledige paden valt er niets op te sluiten: dan niets.
for (const [model, map] of [['', omsi], ['Model\\model.cfg', omsi], [HH20, ''], [HH20, 'OMSI 2']]) {
  eis(
    zoekSchermtextuur(model, map, 'icon.png') === undefined && zoekSchermtextuur(model, map, 'HBusstop.tga') === undefined,
    `modelcfg ${JSON.stringify(model)} met omsi ${JSON.stringify(map)}: niets`
  )
}

// ------------------------------------------------------------------- register

console.log('\n4. HET REGISTER')
{
  const almex = textuurBron(pad(HH109, 'almex_s_0.dds'), { alfa: 2 })
  const nogmaals = textuurBron(pad(HH109, 'almex_s_0.dds'), { alfa: 2 })
  const dekkend = textuurBron(pad(HH109, 'almex_s_0.dds'), { alfa: 0 })
  eis(isTextuurId(almex.id), `id ${almex.id}: twintig hextekens`)
  eis(almex.id === nogmaals.id, 'zelfde bestand en vlaggen: zelfde id')
  eis(almex.id !== dekkend.id, 'andere vlaggen: ander id')
  eis(
    textuurBron(pad(HH20, '17_almex_s_0.jpg'), { alfa: 0, trans: 'C:\\x.tga' }).id ===
      textuurBron(pad(HH20, '17_almex_s_0.jpg'), { alfa: 0 }).id,
    'een transmap bij alfa 0 telt niet mee'
  )

  eis(textuurBytes(almex.id) === undefined, 'niet geregistreerd: niets')
  registreer(almex)
  const t0 = performance.now()
  const eerste = textuurBytes(almex.id)
  const ms1 = performance.now() - t0
  const t1 = performance.now()
  const tweede = textuurBytes(almex.id)
  const ms2 = performance.now() - t1
  eis(!!eerste && eerste.type === 'image/png', `geregistreerd: ${eerste?.type}, eerste keer ${ms1.toFixed(1)} ms`)
  eis(tweede === eerste, `tweede keer uit het geheugen: ${ms2.toFixed(3)} ms`)
  for (const raar of ['', 'ABCDEF0123456789ABCD', almex.id.toUpperCase(), '../' + almex.id, almex.id + 'a', almex.id.slice(1)]) {
    eis(textuurBytes(raar) === undefined, `raar id ${JSON.stringify(raar)}: niets`)
  }
  vergeetBehalve([])
  eis(textuurBytes(almex.id) === undefined, 'na vergeetBehalve([]): niets meer')

  /*
   * Het geheugen: tien uitsneden van `Vectra.png` (2048 x 2048, elk een PNG
   * van ongeveer 6 MB) zijn samen meer dan 48 MB; de oudste moeten eruit.
   */
  const vectra = voertuig('HOH_KI_Autos', 'HOH_Polizei', 'Vectra', 'texture', 'Vectra.png')
  const bronnen = Array.from({ length: 10 }, (_, i) => textuurBron(vectra, { alfa: 2, uit: [0, 0, 2048 - i, 2048] }))
  for (const b of bronnen) registreer(b)
  let totaal = 0
  const t2 = performance.now()
  for (const b of bronnen) totaal += textuurBytes(b.id)?.bytes.length ?? 0
  const stand = schermtexturenStand()
  eis(
    stand.bytes <= 48 * 1024 * 1024 && totaal > 48 * 1024 * 1024,
    `10 grote PNG's, samen ${(totaal / 2 ** 20).toFixed(1)} MB in ${((performance.now() - t2) / 1000).toFixed(1)} s; ` +
      `bewaard ${stand.bewaard} met ${(stand.bytes / 2 ** 20).toFixed(1)} MB`
  )
  vergeetBehalve(bronnen.slice(-1).map((b) => b.id))
  eis(schermtexturenStand().geregistreerd === 1, 'vergeetBehalve houdt precies wat genoemd is')
}

console.log(fouten === 0 ? '\nALLES IN ORDE' : `\n${fouten} FOUT(EN)`)
process.exit(fouten === 0 ? 0 : 1)
