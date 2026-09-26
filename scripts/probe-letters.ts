/**
 * Leest de app de lettertypen van OMSI zoals OMSI, en zet hij de tekst op
 * dezelfde beeldpunten?
 *
 *   npx tsx scripts/probe-letters.ts ["<pad naar OMSI 2>"] [--kladmap <map>]
 *        [--vergelijk <fonts_omsi.json>] [--gebruik <refs.json>]
 *
 * `core/oft.ts` leest de .oft-bestanden en hun bitmaps, `shared/tekstopmaak.ts`
 * zet de tekst in een teksttextuur. Deze probe:
 *
 * 1. telt de bestanden en de fonts (verwacht: 698 bestanden, 745 fonts, 0
 *    fouten) en kijkt of de volgorde van Node gelijk is aan hoofdletter-
 *    ongevoelig ordinaal sorteren, de volgorde van FindFirst op NTFS;
 * 2. legt met `--vergelijk` elk font naast de onafhankelijke Python-nabouw van
 *    de lader (tegen_letters/omsioft.py -> fonts_omsi.json);
 * 3. rekent de voorbeelden uit de specificatie na (x, y0 en regelbreedte);
 * 4. legt de dekking van een paar tekens naast wat Windows zelf (GDI+, via
 *    PowerShell) uit dezelfde bitmap leest: het BLAUWE kanaal, niet het rode;
 * 5. telt de tekens die OMSI niet uit de bitmap kan lezen, met `--gebruik`
 *    alleen voor fonts die een bus echt gebruikt;
 * 6. schrijft plaatjes van de ALMEX-klok, een AFR-regel en een tekst met '@'
 *    naar de kladmap, plus de alfabitmaps zoals Windows ze leest, om naast
 *    elkaar te bekijken;
 * 7. legt `tekenTekst` naast een tweede, los daarvan geschreven nabouw van
 *    OMSI: regel voor regel overgenomen uit de machinecode (meten 005FBF74,
 *    x per regel 005FB84C, DrawChar 005D686C), die de bitmap zelf ruw leest
 *    en de excepties van OMSI nadoet. Duizenden teksten, op de echte blokken
 *    uit de cfg's (met `--gebruik`) en op willekeurige vakken bij alle fonts.
 *    Elk verschil moet verklaard zijn;
 * 8. kijkt de randgevallen na: kapotte .oft's, bitmaps buiten de OMSI-map,
 *    vakken zonder maat of veel te groot.
 *
 * Er wordt alleen gelezen. In de spelmap wordt niets geschreven.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import { deflateSync } from 'node:zlib'
import { findOmsiInstall } from '../src/core/install'
import { leesOmsiFonts, oftBestanden, ontleedOft, schermfontVan, strToInt, zoekFont, type OftFont } from '../src/core/oft'
import type { Teksttextuur } from '../src/shared/scherm'
import { decodeerFont, maakOp, tekenIndex, tekenTekst, tekstBreedte, type DecodedFont } from '../src/shared/tekstopmaak'

const losse = process.argv.slice(2)
const optie = (naam: string): string | undefined => {
  const i = losse.indexOf(naam)
  return i >= 0 ? losse[i + 1] : undefined
}
const metWaarde = new Set(['--kladmap', '--vergelijk', '--gebruik'])
const aangewezen = losse.find((a, i) => !a.startsWith('--') && !metWaarde.has(losse[i - 1] ?? ''))
const kladmap = optie('--kladmap') ?? join(process.env.TEMP ?? '.', 'probe-letters')
mkdirSync(kladmap, { recursive: true })

const omsi = findOmsiInstall(aangewezen ?? 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2')
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden. Geef het pad als argument mee.')
  process.exit(1)
}
const wortel: string = omsi
console.log(`OMSI: ${wortel}`)
console.log(`kladmap: ${kladmap}\n`)

let fouten = 0
function check(wat: string, gekregen: unknown, verwacht: unknown): void {
  const goed = JSON.stringify(gekregen) === JSON.stringify(verwacht)
  if (!goed) fouten++
  console.log(`  ${goed ? 'ok  ' : 'FOUT'} ${wat}: ${JSON.stringify(gekregen)}${goed ? '' : ` (verwacht ${JSON.stringify(verwacht)})`}`)
}

// ---------------------------------------------------------------- 1. bestanden en fonts
console.log('1. BESTANDEN EN FONTS')
const namen = oftBestanden(wortel)
check('aantal .oft-bestanden', namen.length, 698)
const groot = (s: string): string =>
  Array.from(s, (c) => (c.toUpperCase().length === 1 ? c.toUpperCase() : c)).join('')
const gesorteerd = [...namen].sort((a, b) => {
  const [x, y] = [groot(a), groot(b)]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x.charCodeAt(i) !== y.charCodeAt(i)) return x.charCodeAt(i) - y.charCodeAt(i)
  }
  return x.length - y.length
})
check('volgorde van Node == hoofdletterongevoelig ordinaal', namen.every((n, i) => n === gesorteerd[i]), true)

const perBestand: OftFont[] = []
const parsefouten: string[] = []
let utf16 = 0
let zonderCr = 0
for (const naam of namen) {
  const bytes = readFileSync(join(wortel, 'Fonts', naam))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) utf16++
  if (!bytes.includes(0x0d)) zonderCr++
  const lezing = ontleedOft(bytes, naam)
  perBestand.push(...lezing.fonts)
  if (lezing.fout) parsefouten.push(lezing.fout)
}
check('aantal fonts', perBestand.length, 745)
check('parsefouten', parsefouten, [])
check('UTF-16-bestanden', utf16, 1)
console.log(`       bestanden zonder CR (voor OMSI één lange regel): ${zonderCr}`)

let t0 = performance.now()
const fonts = leesOmsiFonts(wortel)
const eerste = performance.now() - t0
t0 = performance.now()
const nogEens = leesOmsiFonts(wortel)
const tweede = performance.now() - t0
check('leesOmsiFonts geeft dezelfde lijst', fonts.length === perBestand.length && fonts.every((f, i) => f.naam === perBestand[i].naam), true)
check('tweede keer uit de cache', nogEens === fonts, true)
console.log(`       tijd: ${eerste.toFixed(0)} ms, uit de cache ${tweede.toFixed(1)} ms`)

const perNaam = new Map<string, string[]>()
for (const f of fonts) perNaam.set(f.naam, [...(perNaam.get(f.naam) ?? []), f.bestand])
const dubbeleNamen = [...perNaam].filter(([, b]) => b.length > 1)
check('dubbele fontnamen', dubbeleNamen.map(([n]) => n).sort(), ['Atron-14px-input', 'Atron-18px-input', 'StreetHamburg2'])
for (const [naam, bestanden] of dubbeleNamen) {
  console.log(`       ${naam}: ${bestanden.join(', ')} -> zoekFont kiest ${zoekFont(fonts, naam)?.bestand}`)
}
check('dubbele tekens', fonts.reduce((n, f) => n + f.tekens.length - new Set(f.tekens.map((t) => t.teken)).size, 0), 320)
check('tekens met negatieve breedte', fonts.reduce((n, f) => n + f.tekens.filter((t) => t.breedte < 0).length, 0), 81)
check('fonts waarvan teken 0 een spatie is', fonts.filter((f) => f.tekens[0].teken === ' ').length, 248)

console.log('   strToInt zoals _ValLong:')
check("'27' ' 27' '27 ' '\\t27' '' '-' '$1F' '0x1f' '-$10' '2147483648' '-2147483648'",
  ['27', ' 27', '27 ', '\t27', '', '-', '$1F', '0x1f', '-$10', '2147483648', '-2147483648'].map(strToInt),
  [27, 27, undefined, undefined, undefined, undefined, 31, 31, -16, undefined, -2147483648])
// Nagelopen tegen _ValLong 00406070 (de Unicode-versie): '0' en dan niets is 0, '+' of '$' alleen is fout,
// een tweede teken na het teken is fout, acht hexcijfers passen (en worden negatief), negen niet.
check("'0' '05' '+' '--5' '- 5' '$' '$FFFFFFFF' '$100000000' '0x' 'x7' '   ' '1<nul>2' '<arabische 3>'",
  ['0', '05', '+', '--5', '- 5', '$', '$FFFFFFFF', '$100000000', '0x', 'x7', '   ', '1\u00002', '\u0663'].map(strToInt),
  [0, 5, undefined, undefined, undefined, undefined, -1, undefined, undefined, 7, undefined, 1, undefined])

console.log('   ontleedOft met gemaakte bestanden:')
const bytesVan = (tekst: string): Uint8Array => Uint8Array.from(tekst, (c) => c.charCodeAt(0))
const kort = (bytes: Uint8Array): { fonts: string[]; fout: boolean } => {
  const l = ontleedOft(bytes, 'proef.oft')
  return {
    fonts: l.fonts.map((f) => `${f.naam}:${f.hoogte}/${f.sep}:${f.tekens.map((t) => `${t.teken}${t.x},${t.y},${t.breedte}`).join(' ')}`),
    fout: l.fout !== undefined
  }
}
const kop = (naam: string): string => `[newfont]\r\n${naam}\r\na.bmp\r\na.bmp\r\n10\r\n1\r\n`
const tekenBlok = (c: string, x1: string, x2: string, y: string): string => `[char]\r\n${c}\r\n${x1}\r\n${x2}\r\n${y}\r\n`
check('ingesprongen tag telt niet, spatie is een teken, byte 0x80 wordt U+0080, rest van de regel valt weg',
  kort(bytesVan('\t\t[newfont]\r\n{name}\r\n' + kop('A') + tekenBlok(' ', '5', '9', '0') + '\t[char]\r\n' + tekenBlok('\u0080x', '1', '3', '2'))),
  { fonts: ['A:10/1: 5,0,4 \u00801,2,2'], fout: false })
check('alleen LF: één lange regel, dus geen font', kort(bytesVan((kop('A') + tekenBlok('B', '0', '1', '0')).replace(/\r/g, ''))), { fonts: [], fout: false })
check("fout ('5 ') in het tweede font: het eerste blijft, de rest vervalt",
  kort(bytesVan(kop('A') + tekenBlok('A', '0', '5', '0') + kop('B') + tekenBlok('B', '0', '5 ', '0') + kop('C') + tekenBlok('C', '0', '5', '0'))),
  { fonts: ['A:10/1:A0,0,5'], fout: true })
check('lege tekenregel en overlopende breedte zijn fouten',
  [kort(bytesVan(kop('A') + tekenBlok('', '0', '5', '0'))).fout, kort(bytesVan(kop('A') + tekenBlok('A', '-1', '2147483647', '0'))).fout],
  [true, true])
{
  const tekst = kop('A') + tekenBlok('\u20ac', '0', '5', '0')
  const u16 = new Uint8Array(2 + tekst.length * 2)
  u16.set([0xff, 0xfe])
  for (let i = 0; i < tekst.length; i++) u16.set([tekst.charCodeAt(i) & 0xff, tekst.charCodeAt(i) >> 8], 2 + 2 * i)
  check('font zonder tekens bestaat niet; UTF-16LE na FF FE',
    [kort(bytesVan(kop('A') + kop('B'))).fonts.length, ontleedOft(u16, 'u16.oft').fonts[0]?.tekens[0].teken], [0, '\u20ac'])
}

// ---------------------------------------------------------------- 2. naast de Python-nabouw
const vergelijk = optie('--vergelijk')
if (vergelijk) {
  console.log('\n2. NAAST DE PYTHON-NABOUW VAN DE LADER')
  type PyFont = { naam: string; fn: string; fna: string; h: number; sep: number; bestand: string; chars: [string, number, number, number, number][] }
  const py = JSON.parse(readFileSync(vergelijk, 'utf8')) as PyFont[]
  let verschil = 0
  for (let i = 0; i < Math.max(py.length, fonts.length); i++) {
    const [a, b] = [fonts[i], py[i]]
    const gelijk =
      a && b &&
      a.naam === b.naam && a.bestand === b.bestand && a.bitmap === 'Fonts/' + b.fn && a.alfa === 'Fonts/' + b.fna &&
      a.hoogte === b.h && a.sep === b.sep && a.tekens.length === b.chars.length &&
      a.tekens.every((t, k) => t.teken === b.chars[k][0] && t.x === b.chars[k][1] && t.y === b.chars[k][2] && t.breedte === b.chars[k][3])
    if (!gelijk) {
      if (verschil < 5) console.log(`       verschil bij font ${i}: ${a?.naam} / ${b?.naam}`)
      verschil++
    }
  }
  check(`fonts die afwijken van ${vergelijk}`, verschil, 0)
}

// ---------------------------------------------------------------- 3. rekenvoorbeelden
console.log('\n3. REKENVOORBEELDEN UIT DE SPECIFICATIE')
const decodeer = new Map<string, DecodedFont>()
function font(naam: string, volkleur = false): DecodedFont {
  const sleutel = `${naam}|${volkleur}`
  let d = decodeer.get(sleutel)
  if (!d) {
    const oft = zoekFont(fonts, naam)
    if (!oft) throw new Error(`font ${naam} niet gevonden`)
    d = decodeerFont(schermfontVan(wortel, oft, volkleur))
    decodeer.set(sleutel, d)
  }
  return d
}
const vak = (b: number, h: number, meer: Partial<Teksttextuur> = {}): Teksttextuur => ({
  variabele: 0, b, h, font: '', fc: 0, kleur: [255, 255, 255], orientatie: 0, raster: 1, ...meer
})
const plek = (f: DecodedFont, tt: Teksttextuur, tekst: string) => {
  const op = maakOp(f, tt, tekst)
  return { lw: op.regels.map((r) => r.breedte), x: op.regels.map((r) => r.x), y0: op.y0 }
}

const hha = font('HH20_HHAschedule_font')
check('HH20_HHAschedule_font hoogte/sep/teken 0', [hha.hoogte, hha.sep, hha.tekens[0].teken, hha.tekens.length], [27, 2, ' ', 79])
check("'04:13:07' op 256x256", plek(hha, vak(256, 256), '04:13:07'), { lw: [91], x: [82], y0: 114 })
check("'    LEE' op 282x256", plek(hha, vak(282, 256), '    LEE'), { lw: [87], x: [97], y0: 114 })
check("'LEER' op 330x256", plek(hha, vak(330, 256), 'LEER'), { lw: [59], x: [135], y0: 114 })
check("'--:--' op 282x256", plek(hha, vak(282, 256), '--:--'), { lw: [43], x: [119], y0: 114 })
const afr = font('TH_AFR-Font')
check('TH_AFR-Font hoogte/sep/teken 0', [afr.hoogte, afr.sep, afr.tekens[0].teken], [78, 1, 'A'])
check("'Tacho          0' op 885x78", plek(afr, vak(885, 78), 'Tacho          0'), { lw: [895], x: [0], y0: 0 })
check('puntenlaag 893x62', plek(afr, vak(893, 62), 'Tacho          0').y0, -8)
check('IBIS-2_5x7 (h19) op H16', plek(font('IBIS-2_5x7'), vak(256, 16), 'X').y0, -1)

console.log('   verder:')
check("'@': 'AB@@C' in HHAschedule op 256x256 (3 regels)", plek(hha, vak(256, 256), 'AB@@C'),
  { lw: [tekstBreedte(hha, 'AB'), 0, tekstBreedte(hha, 'C')], x: [half(256 - tekstBreedte(hha, 'AB')), 128, half(256 - tekstBreedte(hha, 'C'))], y0: half(256 - 3 * 27) })
check('rechts, te breed: ERangeError, vak leeg', [plek(afr, vak(885, 78, { orientatie: 2 }), 'Tacho          0').x, tekenTekst(afr, vak(885, 78, { orientatie: 2 }), 'Tacho          0').some((v) => v !== 0)], [[undefined], false])
check("links en rechts: 'LEER' op 330", [1, 2].map((o) => plek(hha, vak(330, 256, { orientatie: o }), 'LEER').x[0]), [0, 330 - 59])
check('raster 4: x 135 wordt 132', plek(hha, vak(330, 256, { raster: 4 }), 'LEER').x, [132])
// Oriëntatie 3/4/5 met de hand: 'AB CD' in AFR (alles 55, sep 1): lw 279, helft 139.
// S na A 55, na sep 56, na B 111, na sep 112, na ' ' 167: 139 <= 167 + 0 -> na = 167, voor = 167 - 1 - 55 = 111.
// |167-139| = 28 tegen |111-139| = 28: gelijk, dus 3 kiest voor. x = 442 - G.
check("oriëntatie 3/4/5: 'AB CD' in AFR op 885", [3, 4, 5].map((o) => plek(afr, vak(885, 78, { orientatie: o }), 'AB CD').x[0]), [442 - 111, 442 - 167, 442 - 111])
check("onbekend teken '§' in AFR wordt teken 0 ('A')", afr.tekens[tekenIndex(afr, '§')].teken, 'A')
const ibis = font('IBIS-2_5x7')
// Kennz_DtAlt (191 keer gebruikt, kentekens) heeft geen kleine letters.
const kenteken = font('Kennz_DtAlt')
check("kleine letter in Kennz_DtAlt wordt hoofdletter", [kenteken.eerste.has('e'), kenteken.tekens[tekenIndex(kenteken, 'e')].teken], [false, 'E'])
const plus = hha.tekens.map((t, i) => [t.teken, i] as const).filter(([t]) => t === '+').map(([, i]) => i)
check("dubbele '+' in HHAschedule: de eerste wint", [plus.length, tekenIndex(hha, '+') === plus[0]], [2, true])

function half(a: number): number {
  return Math.trunc(a / 2)
}

// ---------------------------------------------------------------- 3b. de tekenregels zelf
console.log('\n3b. TEKENREGELS MET EEN GEMAAKT FONT')
// Drie tekens van 2 hoog, sep 1: 'A' 2 breed, 'B' -3 breed (de pen gaat terug), 'C' 1 breed,
// 'D' niet te lezen. 'ABC' links: A op 0-1, pen 3; B tekent niets, pen 3 - 3 + 1 = 1; C op 1.
const b64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64')
const proef = decodeerFont({
  naam: 'proef', hoogte: 2, sep: 1,
  tekens: [
    { teken: 'A', breedte: 2, alfa: b64([10, 20, 30, 40]) },
    { teken: 'B', breedte: -3, alfa: '' },
    { teken: 'C', breedte: 1, alfa: b64([0, 50]) },
    { teken: 'D', breedte: 1 }
  ]
})
const proefvak = (fc: number): Teksttextuur => ({ variabele: 0, b: 4, h: 2, font: 'proef', fc, kleur: [1, 2, 3], orientatie: 1, raster: 1 })
const alfaVan = (p: Uint8ClampedArray): number[] => Array.from({ length: p.length / 4 }, (_, i) => p[i * 4 + 3])
check("'ABC' breedte 2 + -3 + 1 + 2 sep", tekstBreedte(proef, 'ABC'), 2)
check("'ABC': C overschrijft A, ook met dekking 0", alfaVan(tekenTekst(proef, proefvak(0), 'ABC')), [10, 0, 0, 0, 30, 50, 0, 0])
check("'ABC' met fc 2: dekking 0 laat A staan", alfaVan(tekenTekst(proef, proefvak(2), 'ABC')), [10, 20, 0, 0, 30, 50, 0, 0])
check('kleur uit de cfg, ook onder dekking 0', Array.from(tekenTekst(proef, proefvak(0), 'ABC').subarray(4, 8)), [1, 2, 3, 0])
check("onleesbaar teken 'D' maakt het vak leeg", alfaVan(tekenTekst(proef, proefvak(0), 'AD')), [0, 0, 0, 0, 0, 0, 0, 0])
// Vier regels op 4 hoog: y0 = (4 - 8) div 2 = -2, dus 'A' op rij 0 en 'D' op rij 4, onder het vak.
check("'D' onder de onderrand wordt niet gelezen", alfaVan(tekenTekst(proef, { ...proefvak(0), h: 4 }, '@A@@D')), [10, 20, 0, 0, 30, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
check('volkleur zonder rgb: vak leeg', alfaVan(tekenTekst(proef, proefvak(1), 'A')), [0, 0, 0, 0, 0, 0, 0, 0])
check('zonder font: leeg', tekenTekst(undefined, proefvak(0), 'A').length, 32)

// De klok: elk teken moet op zijn penplek precies zijn eigen dekking hebben, en daarbuiten niets.
{
  const tt: Teksttextuur = { variabele: 0, b: 256, h: 256, font: '', fc: 0, kleur: [240, 230, 210], orientatie: 0, raster: 1 }
  const p = tekenTekst(hha, tt, '04:13:07')
  const verwacht = new Uint8Array(256 * 256)
  let pen = 82
  for (const c of '04:13:07') {
    const g = hha.tekens[tekenIndex(hha, c)]
    for (let i = 0; i < 27; i++) for (let j = 0; j < g.breedte; j++) verwacht[(114 + i) * 256 + pen + j] = g.alfa![i * g.breedte + j]
    pen += g.breedte + hha.sep
  }
  let anders = 0
  for (let i = 0; i < verwacht.length; i++) if (p[i * 4 + 3] !== verwacht[i]) anders++
  check("klok '04:13:07': beeldpunten die afwijken van teken voor teken", anders, 0)
}

// ---------------------------------------------------------------- 4. dekking naast GDI+
console.log('\n4. DEKKING NAAST WAT WINDOWS UIT DE BITMAP LEEST')
/** R, G en B van een rechthoek, gelezen door GDI+ (System.Drawing), niet door onze code. */
function gdiPixels(pad: string, x: number, y: number, b: number, h: number): number[][] {
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$b = New-Object System.Drawing.Bitmap('${pad.replace(/'/g, "''")}')`,
    '$uit = New-Object System.Text.StringBuilder',
    `for ($j = ${y}; $j -lt ${y + h}; $j++) { for ($i = ${x}; $i -lt ${x + b}; $i++) { $p = $b.GetPixel($i, $j); [void]$uit.Append("$($p.R),$($p.G),$($p.B);") } }`,
    '$b.Dispose()',
    '$uit.ToString()'
  ].join('; ')
  const tekst = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim()
  return tekst.split(';').filter(Boolean).map((p) => p.split(',').map(Number))
}
function vergelijkMetGdi(fontnaam: string, teken: string): void {
  const oft = zoekFont(fonts, fontnaam)!
  const d = font(fontnaam)
  const g = oft.tekens[tekenIndex(d, teken)]
  const b = Math.max(0, g.breedte)
  const gdi = gdiPixels(join(wortel, oft.alfa), g.x, g.y, b, oft.hoogte)
  const alfa = d.tekens[tekenIndex(d, teken)].alfa!
  let gelijkB = 0
  let gelijkR = 0
  for (let i = 0; i < alfa.length; i++) {
    if (alfa[i] === gdi[i][2]) gelijkB++
    if (alfa[i] === gdi[i][0]) gelijkR++
  }
  check(`${fontnaam} '${teken}' (${b}x${oft.hoogte}): elk beeldpunt gelijk aan het blauw van GDI+`, gelijkB === alfa.length, true)
  console.log(`       ${alfa.length} beeldpunten: ${gelijkB} gelijk aan blauw, ${gelijkR} gelijk aan rood`)
}
try {
  vergelijkMetGdi('HH20_HHAschedule_font', '0')
  vergelijkMetGdi('TH_AFR-Font', 'T')
  // SG_LED heeft een alfabitmap waar rood en blauw verschillen: daar moet het blauw zijn.
  const sg = zoekFont(fonts, 'SG_LED')
  if (sg) {
    const d = font('SG_LED')
    const metVerschil = sg.tekens.find((t) => {
      if (t.breedte <= 0) return false
      const gdi = gdiPixels(join(wortel, sg.alfa), t.x, t.y, 1, 1)
      return gdi[0] && gdi[0][0] !== gdi[0][2]
    })
    vergelijkMetGdi('SG_LED', metVerschil?.teken ?? d.tekens[1].teken)
  }
} catch (fout) {
  console.log(`  (GDI+ niet beschikbaar: ${(fout as Error).message.split('\n')[0]})`)
}

// ---------------------------------------------------------------- 5. onleesbare tekens
console.log('\n5. TEKENS DIE OMSI NIET UIT DE BITMAP KAN LEZEN')
const gebruik = optie('--gebruik')
const gebruikt = new Map<string, boolean>() // naam -> volkleur
if (gebruik) {
  for (const r of JSON.parse(readFileSync(gebruik, 'utf8')) as { font: string; fc: string }[]) {
    if (!zoekFont(fonts, r.font)) continue
    const fc = strToInt(r.fc) ?? 0
    gebruikt.set(r.font, (gebruikt.get(r.font) ?? false) || (fc & 1) === 1)
  }
}
t0 = performance.now()
let zonderAlfa = 0
let zonderRgb = 0
const getroffen: string[] = []
const bekeken = gebruik ? [...gebruikt] : [...new Set(fonts.map((f) => f.naam))].map((n) => [n, true] as [string, boolean])
let tekens = 0
for (const [naam, volkleur] of bekeken) {
  const sf = schermfontVan(wortel, zoekFont(fonts, naam)!, volkleur)
  tekens += sf.tekens.length
  const a = sf.tekens.filter((t) => t.alfa === undefined).length
  const k = volkleur ? sf.tekens.filter((t) => t.rgb === undefined).length : 0
  zonderAlfa += a
  zonderRgb += k
  if (a || k) getroffen.push(`${naam}${volkleur ? ' (volkleur)' : ''}: ${a} zonder dekking, ${k} zonder kleur van ${sf.tekens.length}`)
}
console.log(`  ${bekeken.length} fonts${gebruik ? ' die een bus gebruikt' : ''}, ${tekens} tekens, ${(performance.now() - t0).toFixed(0)} ms`)
console.log(`  zonder dekking: ${zonderAlfa}, zonder kleur (bij volkleur): ${zonderRgb}`)
for (const regel of getroffen.slice(0, 40)) console.log(`     ${regel}`)
if (getroffen.length > 40) console.log(`     ... en nog ${getroffen.length - 40}`)

// ---------------------------------------------------------------- 6. plaatjes
console.log('\n6. PLAATJES')
function schrijfVak(naam: string, pixels: Uint8ClampedArray, b: number, h: number, achter: [number, number, number], schaal: number): void {
  // Over een achtergrond gelegd, met een rand van 1 grijs beeldpunt om het vak, en vergroot zonder vervagen.
  const B = (b + 2) * schaal
  const H = (h + 2) * schaal
  const rgb = new Uint8Array(B * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < B; x++) {
      const tx = Math.floor(x / schaal) - 1
      const ty = Math.floor(y / schaal) - 1
      const o = (y * B + x) * 3
      if (tx < 0 || ty < 0 || tx >= b || ty >= h) {
        rgb.set([90, 90, 90], o)
        continue
      }
      const p = (ty * b + tx) * 4
      const a = pixels[p + 3] / 255
      for (let k = 0; k < 3; k++) rgb[o + k] = Math.round(pixels[p + k] * a + achter[k] * (1 - a))
    }
  }
  const pad = join(kladmap, naam)
  schrijfPng(pad, B, H, rgb)
  console.log(`  ${pad}`)
}
const klok: Teksttextuur = { variabele: 0, b: 256, h: 256, font: 'HH20_HHAschedule_font', fc: 0, kleur: [240, 230, 210], orientatie: 0, raster: 1 }
schrijfVak('almex-klok.png', tekenTekst(hha, klok, '04:13:07'), 256, 256, [16, 40, 110], 3)
// Uitsnede rond de regel: rijen 105-145, kolommen 70-185, zes keer vergroot.
const klokPixels = tekenTekst(hha, klok, '04:13:07')
const uit = new Uint8ClampedArray(116 * 41 * 4)
for (let y = 0; y < 41; y++) uit.set(klokPixels.subarray(((105 + y) * 256 + 70) * 4, ((105 + y) * 256 + 186) * 4), y * 116 * 4)
schrijfVak('almex-klok-uitsnede.png', uit, 116, 41, [16, 40, 110], 8)
const afrVak: Teksttextuur = { variabele: 0, b: 885, h: 78, font: 'TH_AFR-Font', fc: 0, kleur: [95, 211, 188], orientatie: 0, raster: 1 }
schrijfVak('afr-regel.png', tekenTekst(afr, afrVak, 'Tacho          0'), 885, 78, [0, 0, 0], 2)
const ibisVak: Teksttextuur = { variabele: 0, b: 160, h: 48, font: 'IBIS-2_5x7', fc: 0, kleur: [255, 160, 40], orientatie: 1, raster: 1 }
schrijfVak('ibis-twee-regels.png', tekenTekst(ibis, ibisVak, 'Linie 5@Hbf'), 160, 48, [0, 0, 0], 4)

try {
  for (const naam of ['HH20_HHAschedule_font', 'TH_AFR-Font', 'IBIS-2_5x7']) {
    const oft = zoekFont(fonts, naam)!
    const doel = join(kladmap, `${naam}-alfa-gdi.png`)
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.Drawing; $b = New-Object System.Drawing.Bitmap('${join(wortel, oft.alfa).replace(/'/g, "''")}'); $b.Save('${doel.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()`])
    console.log(`  ${doel} (door Windows omgezet, ter vergelijking)`)
  }
} catch (fout) {
  console.log(`  (alfabitmaps niet omgezet: ${(fout as Error).message.split('\n')[0]})`)
}

// ---------------------------------------------------------------- 7. naast een tweede nabouw van OMSI
console.log('\n7. NAAST EEN TWEEDE NABOUW, LETTERLIJK UIT DE MACHINECODE')
/**
 * Een tweede nabouw, bewust anders opgezet dan `tekstopmaak.ts`: hij leest de
 * bitmap zelf (niet via `schermfontVan`), meet zoals OMSI per teken optelt,
 * rekent x pas uit bij elke '@', en gooit waar OMSI gooit. Een exceptie geeft
 * een leeg vak, zoals de afspraak in `tekstopmaak.ts`.
 */
class OmsiFout extends Error {}
interface Dib { mem: Uint8Array; rijen: number; stride: number; vanOnder: boolean }
const dibs = new Map<string, Dib | OmsiFout>()
function laadDib(pad: string): Dib {
  // TPicture.LoadFromFile (005FBF44): een ontbrekend bestand of iets anders dan een BMP gooit.
  let d = dibs.get(pad)
  if (!d) {
    try {
      if (!/\.bmp$/i.test(pad)) throw new OmsiFout('geen .bmp')
      const b = readFileSync(pad)
      if (b.length < 54 || b.toString('latin1', 0, 2) !== 'BM') throw new OmsiFout('geen BM')
      const w = b.readInt32LE(18), h = b.readInt32LE(22), bpp = b.readUInt16LE(28), off = b.readUInt32LE(10)
      const stride = Math.ceil((w * bpp) / 32) * 4
      if (off + stride * Math.abs(h) > b.length) throw new OmsiFout('te kort')
      d = { mem: b.subarray(off, off + stride * Math.abs(h)), rijen: Math.abs(h), stride, vanOnder: h > 0 }
    } catch (fout) {
      d = fout instanceof OmsiFout ? fout : new OmsiFout(String(fout))
    }
    dibs.set(pad, d)
  }
  if (d instanceof OmsiFout) throw d
  return d
}
const div2 = (a: number): number => Math.trunc(a / 2)
function zoekTeken(f: OftFont, c: number): number {
  for (let i = 0; i < f.tekens.length; i++) if (f.tekens[i].teken.charCodeAt(0) === c) return i
  return -1
}
/** GetCharIndex 005D6754: zoeken; mislukt dat en ligt (c - 'a') & 0xFFFF onder 26, dan met 'and 0FFDFh'; anders 0. */
function charIndex(f: OftFont, ch: string): number {
  const c = ch.charCodeAt(0)
  let i = zoekTeken(f, c)
  if (i < 0) i = zoekTeken(f, ((c - 0x61) & 0xffff) < 26 ? c & 0xffdf : c)
  return i < 0 ? 0 : i
}
/** Het vak zoals 005FBC7C het vult. `bekend`: gelukt, maar een getekend teken heeft rijen buiten de bitmap. */
function omsiVak(f: OftFont, tt: Teksttextuur, tekst: string): { pixels: Uint8ClampedArray; bekend: boolean } {
  const W = tt.b, H = tt.h, fc = tt.fc & 0xff
  const pixels = new Uint8ClampedArray(W * H * 4)
  const kleur = (tt.kleur[0] << 16) | (tt.kleur[1] << 8) | tt.kleur[2]
  let bekend = false
  try {
    const kleurBmp = (fc & 1) === 1 ? laadDib(join(wortel, f.bitmap)) : undefined
    const alfaBmp = laadDib(join(wortel, f.alfa))
    // Meten (005FBF74-005FC25C): per teken de breedte erbij, en sep als er nog een teken volgt dat geen '@' is.
    const lw = [0]
    const regels = ['']
    const n = tekst.length
    for (let k = 1; k <= n; k++) {
      const c = tekst[k - 1]
      if (c === '@') {
        lw.push(0)
        regels.push('')
        continue
      }
      lw[lw.length - 1] += f.tekens[charIndex(f, c)].breedte
      regels[regels.length - 1] += c
      if (n > k && tekst[k] !== '@') lw[lw.length - 1] += f.sep
    }
    let y = div2(H - lw.length * f.hoogte)
    // De geneste functie 005FB84C, met de word-opslag en zijn bereikcontroles.
    const xVan = (r: number): number => {
      let x = div2(W - lw[r])
      if (x < 0) x = 0
      if (x > 0xffff) throw new OmsiFout('bereik midden')
      const o = tt.orientatie & 0xff
      if (o === 1) x = 0
      else if (o === 2) {
        x = W - lw[r]
        if (x < 0 || x > 0xffff) throw new OmsiFout('ERangeError rechts')
      } else if (o >= 3 && o <= 5 && regels[r].length > 0) {
        const s = regels[r]
        let som = 0
        for (let k = 1; k <= s.length; k++) {
          const w = f.tekens[charIndex(f, s[k - 1])].breedte
          som += w
          if (!(div2(lw[r]) > div2(f.sep) + som)) {
            const na = som + div2(f.sep)
            const voor = na - f.sep - w
            const h = div2(lw[r])
            const g = o === 4 ? na : o !== 3 ? voor : Math.abs(na - h) >= Math.abs(voor - h) ? voor : na
            x = div2(W) - g
            if (x < 0) x = 0
            if (x > 0xffff) throw new OmsiFout('bereik tussenruimte')
            break
          }
          if (s.length > k) som += f.sep
        }
      }
      const raster = tt.raster & 0xffff
      if (raster >= 2) x = Math.floor(x / raster) * raster
      return x
    }
    let x = xVan(0)
    let regel = 0
    for (let k = 1; k <= n; k++) {
      const c = tekst[k - 1]
      if (c === '@') {
        regel++
        x = xVan(regel)
        y += f.hoogte
        continue
      }
      // DrawChar 005D686C.
      const t = f.tekens[charIndex(f, c)]
      const rijen = Math.min(H - y, f.hoogte)
      if (rijen > 0) {
        for (const bmp of kleurBmp ? [kleurBmp, alfaBmp] : [alfaBmp]) if (t.y < 0 || t.y + f.hoogte > bmp.rijen) bekend = true
      }
      for (let i = 0; i < rijen; i++) {
        const rij = (bmp: Dib): number => {
          const r = t.y + i
          if (r < 0 || r >= bmp.rijen) throw new OmsiFout('ScanLine')
          return (bmp.vanOnder ? bmp.rijen - 1 - r : r) * bmp.stride
        }
        const kRij = kleurBmp ? rij(kleurBmp) : 0
        const aRij = rij(alfaBmp)
        const lees = (bmp: Dib, o: number): number => (o < bmp.mem.length ? bmp.mem[o] : 0)
        const kolommen = Math.min(t.breedte, W - x)
        for (let j = 0; j < kolommen; j++) {
          const tx = x + j
          const ty = y + i
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
          const o = (t.x + j) * 3
          const binnen = (d: number): void => {
            if (o + d < 0 || o + d > 0x7fff) throw new OmsiFout('kolom')
          }
          if ((fc & 3) === 2) {
            binnen(0)
            if ((lees(alfaBmp, aRij + o) > 0) === ((fc & 7) === 4)) continue
          }
          let r: number, g: number, b: number
          if ((fc & 1) === 1) {
            binnen(0)
            binnen(1)
            binnen(2)
            b = lees(kleurBmp!, kRij + o)
            g = lees(kleurBmp!, kRij + o + 1)
            r = lees(kleurBmp!, kRij + o + 2)
          } else {
            binnen(0)
            r = (kleur >> 16) & 0xff
            g = (kleur >> 8) & 0xff
            b = kleur & 0xff
          }
          const p = W * ty + tx
          if (p > 0x1000000) throw new OmsiFout('beeldpunt')
          pixels.set([r, g, b, lees(alfaBmp, aRij + o)], p * 4)
        }
      }
      x += t.breedte + f.sep
    }
    return { pixels, bekend }
  } catch (fout) {
    if (fout instanceof OmsiFout) return { pixels: new Uint8ClampedArray(W * H * 4), bekend: false }
    throw fout
  }
}
{
  let zaad = 20260926
  const toeval = (): number => {
    zaad = (Math.imul(zaad, 1103515245) + 12345) >>> 0
    return zaad / 2 ** 32
  }
  const kies = <T,>(lijst: T[]): T => lijst[Math.floor(toeval() * lijst.length)]
  const tekstVoor = (f: OftFont): string => {
    let s = ''
    for (let n = Math.floor(toeval() * 22); n > 0; n--) {
      const r = toeval()
      s += r < 0.7 ? kies(f.tekens).teken
        : r < 0.8 ? ' '
        : r < 0.87 ? '@'
        : r < 0.94 ? String.fromCharCode(0x61 + Math.floor(toeval() * 26))
        : kies(['§', '\u0080', 'é', '€', '\u0000', '\t', '"', '\\'])
    }
    return s
  }
  // Per font-OBJECT uitgepakt: bij de drie dubbele namen is het tweede font een ander font.
  const uitgepakt = new Map<OftFont, Map<boolean, DecodedFont>>()
  const onze = (f: OftFont, tt: Teksttextuur, tekst: string): Uint8ClampedArray => {
    const volkleur = (tt.fc & 1) === 1
    let perSoort = uitgepakt.get(f)
    if (!perSoort) uitgepakt.set(f, (perSoort = new Map()))
    let d = perSoort.get(volkleur)
    if (!d) perSoort.set(volkleur, (d = decodeerFont(schermfontVan(wortel, f, volkleur))))
    return tekenTekst(d, tt, tekst)
  }
  let gevallen = 0, nietLeeg = 0, bekendeVerschillen = 0
  const onverklaard: string[] = []
  const vergelijkMetOmsi = (f: OftFont, tt: Teksttextuur, tekst: string): void => {
    gevallen++
    const omsiUit = omsiVak(f, tt, tekst)
    const wij = onze(f, tt, tekst)
    if (omsiUit.pixels.some((v) => v !== 0)) nietLeeg++
    let anders = omsiUit.pixels.length === wij.length ? 0 : -1
    for (let i = 0; anders >= 0 && i < wij.length; i++) if (omsiUit.pixels[i] !== wij[i]) anders++
    if (!anders) return
    // Het ene verschil dat we kennen (core/oft.ts): OMSI haalt alleen de rijen boven de onderrand, wij
    // rekenen een teken met een rij buiten de bitmap als onleesbaar. Dan moeten WIJ leeg zijn.
    if (omsiUit.bekend && wij.every((v) => v === 0)) bekendeVerschillen++
    else onverklaard.push(`${f.naam} (${f.bestand}) ${JSON.stringify({ ...tt, variabele: undefined })} ${JSON.stringify(tekst)}: ${anders}`)
  }
  let echteBlokken = 0
  if (gebruik) {
    const blokken = new Map<string, Teksttextuur>()
    for (const r of JSON.parse(readFileSync(gebruik, 'utf8')) as { font: string; W: string; H: string; fc: string; rgb: string[]; orient: string; grid: string }[]) {
      if (!zoekFont(fonts, r.font)) continue
      const tt: Teksttextuur = {
        variabele: 0, b: strToInt(r.W) ?? 0, h: strToInt(r.H) ?? 0, font: r.font, fc: strToInt(r.fc) ?? 0,
        kleur: r.rgb.map((v) => strToInt(v) ?? 0) as [number, number, number],
        orientatie: strToInt(r.orient) ?? 0, raster: strToInt(r.grid) ?? 1
      }
      blokken.set(JSON.stringify(tt), tt)
    }
    echteBlokken = blokken.size
    for (const tt of blokken.values()) {
      const f = zoekFont(fonts, tt.font)!
      for (let i = 0; i < 4; i++) vergelijkMetOmsi(f, tt, tekstVoor(f))
    }
  }
  const opEchte = gevallen
  for (const f of fonts) {
    for (let i = 0; i < 6; i++) {
      const tt: Teksttextuur = {
        variabele: 0, b: 1 + Math.floor(toeval() * 400), h: 1 + Math.floor(toeval() * 140), font: f.naam,
        fc: kies([0, 0, 1, 2, 3, 255]),
        kleur: [Math.floor(toeval() * 256), Math.floor(toeval() * 256), Math.floor(toeval() * 256)],
        orientatie: kies([0, 1, 2, 3, 4, 5, 6]), raster: kies([0, 1, 1, 2, 3, 5])
      }
      vergelijkMetOmsi(f, tt, tekstVoor(f))
    }
  }
  console.log(`  ${gevallen} teksten: ${opEchte} op ${echteBlokken} echte blokken uit de cfg's, de rest op willekeurige vakken bij alle ${fonts.length} fonts`)
  console.log(`  ${nietLeeg} daarvan niet leeg; ${bekendeVerschillen} bekend verschil (teken deels buiten de bitmap, vak lager dan het font)`)
  check('verschillen met de tweede nabouw die niet verklaard zijn', onverklaard.length, 0)
  for (const regel of onverklaard.slice(0, 10)) console.log(`     ${regel}`)
}

// ---------------------------------------------------------------- 8. randgevallen
console.log('\n8. RANDGEVALLEN')
{
  let verst = 0
  for (const f of fonts) for (const t of f.tekens) verst = Math.max(verst, (t.x + Math.max(0, t.breedte) - 1) * 3 + 2)
  check('verste kolom x 3 + 2 van alle fonts binnen 32767 (anders zou de kolomregel iets uitmaken)', verst <= 0x7fff, true)
  const naarBuiten = fonts.filter((f) => [f.bitmap, f.alfa].some((p) => relative(join(wortel, 'Fonts'), join(wortel, p)).startsWith('..')))
  check('fonts met een bitmap buiten Fonts', naarBuiten.map((f) => f.naam), [])

  // Dezelfde bitmap, één keer buiten de OMSI-map en één keer via '..' binnen de map.
  const hhaOft = zoekFont(fonts, 'HH20_HHAschedule_font')!
  const buiten = join(kladmap, 'buiten-de-omsi-map.bmp')
  writeFileSync(buiten, readFileSync(join(wortel, hhaOft.alfa)))
  const metAlfa = (omsiMap: string, alfa: string): number =>
    schermfontVan(omsiMap, { ...hhaOft, alfa }, false).tekens.filter((t) => t.alfa !== undefined).length
  check('bitmap buiten de OMSI-map wordt niet gelezen, dezelfde erbinnen wel',
    [metAlfa(wortel, 'Fonts/' + relative(join(wortel, 'Fonts'), buiten)), metAlfa(kladmap, 'buiten-de-omsi-map.bmp'),
      metAlfa(wortel, 'Fonts/../' + hhaOft.alfa)],
    [0, hhaOft.tekens.length, hhaOft.tekens.length])
  let gooit = ''
  try {
    schermfontVan(wortel, { ...hhaOft, hoogte: 2000000000 }, true)
  } catch (fout) {
    gooit = String(fout)
  }
  check('een .oft met hoogte 2000000000 laat schermfontVan niet vallen', gooit, '')

  const grootte = (b: number, h: number): number => tekenTekst(hha, vak(b, h), '04:13:07').length
  check('vak NaN / oneindig / -5 / 5000 x 5000 / 4096 x 4096 / 256,7 x 256',
    [grootte(NaN, 256), grootte(Infinity, 256), grootte(-5, 256), grootte(5000, 5000), grootte(4096, 4096), grootte(256.7, 256)],
    [0, 0, 0, 0, 4096 * 4096 * 4, 256 * 256 * 4])
  check('256,7 breed tekent als 256', tekenTekst(hha, vak(256.7, 256), '04:13:07').every((v, i) => v === tekenTekst(hha, vak(256, 256), '04:13:07')[i]), true)
  // 005FB8A2: het midden gaat met bereikcontrole in een word, ook bij links uitlijnen. 200000 x 1 blijft
  // onder de grens van 0x1000001 beeldpunten, dus hier moet de ERangeError het vak leeg maken.
  check('vak 200000 x 1, links: het midden past niet in een word, ERangeError',
    [plek(hha, vak(200000, 1, { orientatie: 1 }), 'A').x, tekenTekst(hha, vak(200000, 1, { orientatie: 1 }), 'A').some((v) => v !== 0)],
    [[undefined], false])
  const leegFont: DecodedFont = { naam: 'leeg', hoogte: 10, sep: 1, tekens: [], eerste: new Map() }
  check('maakOp met een font zonder tekens, oriëntatie 3', plek(leegFont, vak(100, 20, { orientatie: 3 }), 'ab'), { lw: [0], x: [50], y0: 5 })

  const grootst = [...gebruikt.keys()].map((naam) => [naam, JSON.stringify(schermfontVan(wortel, zoekFont(fonts, naam)!, gebruikt.get(naam)!)).length] as const)
    .sort((a, b) => b[1] - a[1])
  console.log(`  grootte als JSON: HH20_HHAschedule_font ${JSON.stringify(schermfontVan(wortel, hhaOft, false)).length} tekens` +
    (grootst.length ? `; grootste gebruikte ${grootst[0][0]} ${grootst[0][1]}` : ''))
}

console.log(`\n${fouten === 0 ? 'Alles klopt.' : `${fouten} controle(s) FOUT.`}`)
process.exit(fouten === 0 ? 0 : 1)

function schrijfPng(pad: string, breedte: number, hoogte: number, rgb: Uint8Array): void {
  const rauw = Buffer.alloc(hoogte * (1 + breedte * 3))
  for (let y = 0; y < hoogte; y++) {
    Buffer.from(rgb.buffer, rgb.byteOffset + y * breedte * 3, breedte * 3).copy(rauw, y * (1 + breedte * 3) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breedte, 0)
  ihdr.writeUInt32BE(hoogte, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  writeFileSync(pad, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(rauw, { level: 6 })),
    blok('IEND', Buffer.alloc(0))
  ]))
}

function blok(naam: string, inhoud: Buffer): Buffer {
  const kop = Buffer.alloc(8)
  kop.writeUInt32BE(inhoud.length, 0)
  kop.write(naam, 4, 'latin1')
  const staart = Buffer.alloc(4)
  staart.writeUInt32BE(crc32(Buffer.concat([kop.subarray(4), inhoud])), 0)
  return Buffer.concat([kop, inhoud, staart])
}

function crc32(bytes: Buffer): number {
  const tabel = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabel[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = tabel[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
