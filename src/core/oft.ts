import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep as scheiding } from 'node:path'
import type { Schermfont, Schermteken } from '../shared/scherm'

/**
 * De lettertypen van OMSI (`Fonts/*.oft` plus twee bitmaps), gelezen zoals
 * Omsi.exe 2.3.004 ze leest.
 *
 * WAAROM DIT BESTAAT
 * Een [texttexture] tekent de tekst van een stringvariabele in een bitmapfont
 * van OMSI: de ALMEX-klok, de bestemming op het IBIS, de regels op de AFR. Wie
 * dat scherm op de telefoon wil natekenen zoals het in het spel staat, kan
 * geen lettertype van de browser nemen: de letters, hun breedte en de ruimte
 * ertussen komen allemaal uit deze bestanden. Dit bestand leest ze; het
 * opmaken en tekenen staat in `shared/tekstopmaak.ts`, dat ook in de renderer
 * draait.
 *
 * ZOALS OMSI, NIET ZOALS HET ER LOGISCH UITZIET
 * Elke regel hieronder is nagelopen in de machinecode van Omsi.exe (de adressen
 * staan erbij) en geteld over de 698 .oft-bestanden van deze installatie
 * (`scripts/probe-letters.ts`). Waar OMSI iets vreemds doet, doen wij het ook:
 *
 * - De tekens worden niet als Windows-1252 gelezen maar byte voor byte: byte
 *   0x80 wordt U+0080, niet '€' (openen 007EF8F4). Busscripts gaan door
 *   dezelfde lezer, dus een '€' in een script past alleen zo op het '€' van
 *   het font. 24 gebruikte fonts hebben tekens in 0x80-0x9F. Begint het bestand
 *   met FF FE, dan is het UTF-16LE (alleen `Arial_gras.oft`). Een UTF-8-BOM
 *   kent OMSI niet.
 * - Een regel loopt tot de CR; daarna wordt precies één teken overgeslagen, de
 *   LF (ReadLine 007EF7E4). Een losse LF hoort gewoon bij de regel.
 * - Tags gelden alleen letterlijk: '[newfont]' en '[char]' zonder spaties of
 *   tabs ervoor (005D61F9, 005D6373). De kop die in elk bestand met tabs is
 *   ingesprongen ('\t\t[newfont]' met '{name}' eronder) is dus commentaar --
 *   322 van zulke regels, en wie trimt leest '{name}' als een font.
 * - Niets wordt getrimd: de tekenregel ' ' IS de spatie, en de naamregel wordt
 *   zo vergeleken met de cfg.
 * - Getallen gaan door StrToInt (0042237C, Delphi _ValLong): spaties vooraan
 *   mogen, een tab of spatie erachter niet. Gaat dat mis, dan gooit OMSI het
 *   font dat hij aan het lezen is en de rest van het bestand weg; fonts die al
 *   af waren blijven (handler 005D64CD). In deze installatie gebeurt dat nul
 *   keer, maar een addon hoeft zich daar niet aan te houden.
 * - Dubbele tekens blijven staan, in bestandsvolgorde; OMSI zoekt lineair en
 *   de eerste wint (FindChar 005D66BC). Voorbeeld: in HH20_HHAschedule_font
 *   staat '+' twee keer, de tweede keer op de plek van 'ß'. Teken 0 is de
 *   terugval voor alles wat het font niet kent -- in TH_AFR-Font is dat 'A'.
 * - De fonts van alle bestanden komen in één lijst, in de volgorde waarin
 *   FindFirst de bestanden geeft (006E5F22). Bij een dubbele naam wint de
 *   eerste (GetFontIndex 005D67E8, hoofdlettergevoelig). FindFirst krijgt
 *   Attr 0 mee en slaat dus verborgen bestanden en systeembestanden over; die
 *   eigenschap ziet Node niet, dus zo'n .oft zou hier wel meetellen (in deze
 *   installatie komt het niet voor).
 * - Omsi.exe is een Unicode-Delphi (_ValLong 00406070 leest woorden), maar de
 *   naam gaat daarna door WideString -> AnsiString (004092CC, codepagina 0).
 *   Een byte 0x80-0x9F in een fontnaam wordt daar '?'; hier blijft het
 *   U+0080-U+009F. Alle 742 namen in deze installatie zijn ASCII, dus dat
 *   verschil is er niet.
 *
 * DE BITMAPS: RUWE BYTES, NIET "DE KLEUR"
 * DrawChar (005D686C) pakt een rij van de bitmap met TBitmap.ScanLine en leest
 * dan byte (x1 + j) * 3 -- zonder te kijken hoeveel bytes een beeldpunt heeft,
 * en zonder te kijken of dat nog op de rij ligt. De dekking is byte 0 van die
 * drie, en bij 24 bit is dat BLAUW, niet rood. Bij 135 van de 155 gebruikte
 * fonts is de alfabitmap grijs en maakt het niets uit; bij twintig wel (SG_LED:
 * 77.802 beeldpunten waar rood en blauw verschillen). Bij volkleur (bit 0 van
 * veld 5 van het cfg-blok) komt de kleur uit de kleurbitmap: rood = byte 2,
 * groen = byte 1, blauw = byte 0 (005D6A6B-005D6BAB).
 *
 * Zo lezen wij ook: `bytes[rijstart(y) + 3 * x + k]`. Een kolom voorbij de rij
 * loopt door in de volgende geheugenrij, zoals in OMSI (vdv_font: kleurbitmap
 * 128 breed, tekens tot x ~168).
 *
 * WANNEER OMSI VASTLOOPT
 * Een rij buiten de bitmap laat TBitmap.ScanLine een exceptie gooien, en een
 * kolom met (x + j) * 3 buiten 0..32767 de bereikcontrole op 005D6A35. Dat
 * breekt het bijwerken van de teksttexturen af; wat het spel dan toont is niet
 * nagemeten. Zo'n teken krijgt hier geen `alfa` (of bij volkleur geen `rgb`),
 * en `tekenTekst` laat dan het hele vak leeg. Hetzelfde als de bitmap
 * ontbreekt of geen BMP is: dan gooit TPicture.LoadFromFile al (005FBF44,
 * 005FBF6F), nog voor er iets getekend wordt.
 *
 * Dat is per teken alles of niets, en daarmee iets strenger dan OMSI:
 * - DrawChar haalt alleen de rijen die boven de onderrand van het vak liggen
 *   (min(h - pen.y, hoogte), 005D68BB). Een teken waarvan alleen de onderste
 *   rijen buiten de bitmap vallen, gaat in OMSI dus goed in een vak dat lager
 *   is dan het font. Bij een vak dat minstens zo hoog is als het font haalt
 *   hij alle rijen, en dan klopt het precies. In de 155 fonts die een bus
 *   gebruikt heeft geen enkel teken zo'n rij; TFT_110Px_Bold (de spatie, rij
 *   900-1030 op een bitmap van 1024) is een voorbeeld dat niemand gebruikt.
 * - De kolomcontrole doet OMSI alleen voor beeldpunten die in het vak vallen.
 *   Hier geldt hij voor het hele teken; de verste kolom in deze installatie
 *   is 8191 (x 3 + 2 = 24.575), ruim binnen de grens.
 * Precies zou pas kunnen als `Schermteken` meestuurt hoeveel rijen er te lezen
 * zijn.
 *
 * WAT HIER NIET WORDT GELEZEN
 * Alleen bitmaps binnen de OMSI-map: een regel als '..\..\x.bmp' in een .oft
 * zou anders elk .bmp op de schijf naar de telefoon sturen. OMSI zelf leest
 * die wel, maar geen font in deze installatie wijst buiten Fonts. En geen
 * bitmap groter dan `MAX_BITMAP` bytes (de grootste font-bitmap is 12,6 MB).
 *
 * Er zit geen Electron in dit bestand, alleen `node:fs` en `node:path`, zodat
 * het ook in een worker_thread laadt. Het gooit niet: wat niet te lezen is,
 * komt terug als een lege lijst of een teken zonder dekking.
 */

/** Eén teken zoals OMSI het bewaart (RTTI TOFTChar: buchstabe, Ecke, width). */
export interface OftTeken {
  /** Eén UTF-16-eenheid: het eerste teken van de regel na '[char]'. */
  teken: string
  /** Linkerbovenhoek in de bitmap (x1, y). */
  x: number
  y: number
  /** x2 - x1, met x2 exclusief. Mag negatief zijn (81 keer): dan schuift de pen terug. */
  breedte: number
}

/** Eén font uit een .oft (RTTI TOFT). */
export interface OftFont {
  /** Letterlijk de regel na '[newfont]': zo vergelijkt OMSI hem met de cfg. */
  naam: string
  /** De kleurbitmap, ten opzichte van de OMSI-map ('Fonts/' + de regel). */
  bitmap: string
  /** De alfabitmap, idem. In 615 fonts is dat hetzelfde bestand als `bitmap`. */
  alfa: string
  /** De hoogte van ELK teken, in beeldpunten (TOFT.height). */
  hoogte: number
  /** De ruimte na elk teken behalve het laatste van een regel (TOFT.sep). */
  sep: number
  /** In bestandsvolgorde, dubbelen inbegrepen. Nooit leeg. */
  tekens: OftTeken[]
  /** Het .oft-bestand waar het font in staat (alleen voor het logboek). */
  bestand: string
}

/** Wat één .oft-bestand oplevert. */
export interface OftLezing {
  fonts: OftFont[]
  /** Waarom OMSI halverwege stopte; de fonts in `fonts` bleven dan wel staan. */
  fout?: string
}

/**
 * StrToInt zoals Delphi's _ValLong (00406070): alleen spaties vooraan, dan een
 * optioneel + of -, dan hex met '$', 'x', 'X' of '0x', of anders alleen cijfers
 * tot het einde. Een U+0000 telt als einde, want _ValLong loopt tot het
 * eerste nulteken. Al het andere -- ook een tab of spatie erachter en een lege
 * regel -- is een fout: `undefined`.
 */
export function strToInt(regel: string): number | undefined {
  const nul = regel.indexOf('\u0000')
  const s = nul >= 0 ? regel.slice(0, nul) : regel
  let i = 0
  while (i < s.length && s[i] === ' ') i++
  let negatief = false
  if (s[i] === '+' || s[i] === '-') {
    negatief = s[i] === '-'
    i++
  }
  let hex = false
  if (s[i] === '$' || s[i] === 'x' || s[i] === 'X') {
    hex = true
    i++
  } else if (s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
    hex = true
    i += 2
  }
  if (i >= s.length) return undefined
  let waarde = 0
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i)
    let cijfer: number
    if (c >= 0x30 && c <= 0x39) cijfer = c - 0x30
    else if (hex && c >= 0x61 && c <= 0x66) cijfer = c - 0x61 + 10
    else if (hex && c >= 0x41 && c <= 0x46) cijfer = c - 0x41 + 10
    else return undefined
    if (hex) {
      if (waarde > 0x0fffffff) return undefined
      waarde = waarde * 16 + cijfer
    } else {
      if (waarde > 214748364) return undefined
      waarde = waarde * 10 + cijfer
    }
  }
  if (hex) {
    // Acht hexcijfers passen in 32 bits en worden als Integer gelezen: '$FFFFFFFF' is -1.
    const geheel = waarde | 0
    return negatief ? -geheel | 0 : geheel
  }
  if (negatief) return waarde > 2147483648 ? undefined : 0 - waarde
  return waarde > 2147483647 ? undefined : waarde
}

/**
 * De code-eenheden van het bestand zoals OMSI ze ziet: UTF-16LE na FF FE,
 * anders elke byte één eenheid (U+0000..U+00FF). Een losse byte achter een
 * UTF-16-bestand valt weg, want OMSI leest daar per twee bytes.
 */
function eenhedenVan(bytes: Uint8Array): ArrayLike<number> {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const n = (bytes.length - 2) >> 1
    const uit = new Uint16Array(n)
    for (let i = 0; i < n; i++) uit[i] = bytes[2 + 2 * i] | (bytes[3 + 2 * i] << 8)
    return uit
  }
  return bytes
}

/** ReadLine van OMSI (007EF7E4): tot de CR, en dan één eenheid overslaan. */
class Regellezer {
  private p = 0
  constructor(private readonly u: ArrayLike<number>) {}

  get eof(): boolean {
    return this.p >= this.u.length
  }

  regel(): string {
    const begin = this.p
    while (this.p < this.u.length) {
      if (this.u[this.p++] === 0x0d) {
        const eind = this.p - 1
        if (this.p < this.u.length) this.p++
        return tekstVan(this.u, begin, eind)
      }
    }
    return tekstVan(this.u, begin, this.p)
  }
}

/** Code-eenheden naar een string, in stukken: een bestand zonder CR is één lange regel. */
function tekstVan(u: ArrayLike<number>, van: number, tot: number): string {
  let uit = ''
  for (let i = van; i < tot; i += 8192) {
    const stuk: number[] = []
    for (let k = i; k < Math.min(tot, i + 8192); k++) stuk.push(u[k])
    uit += String.fromCharCode(...stuk)
  }
  return uit
}

/**
 * Eén .oft ontleden zoals 005D6140 dat doet. `bestand` is de naam in de map
 * Fonts; de bitmapnamen worden daar ten opzichte van genomen (ExtractFilePath
 * van het .oft plus de regel, 005D62B4-005D62D3).
 */
export function ontleedOft(bytes: Uint8Array, bestand: string): OftLezing {
  const lezer = new Regellezer(eenhedenVan(bytes))
  const fonts: OftFont[] = []
  const nieuw = (): OftFont => ({ naam: '', bitmap: '', alfa: '', hoogte: 0, sep: 0, tekens: [], bestand })
  let bezig = nieuw()
  const stop = (reden: string): OftLezing => ({ fonts, fout: `${bestand}: ${reden}` })

  while (!lezer.eof) {
    const regel = lezer.regel()
    if (regel === '[newfont]') {
      // Het vorige font gaat pas mee als het tekens heeft; een font zonder tekens bestaat voor OMSI niet.
      if (bezig.tekens.length) {
        fonts.push(bezig)
        bezig = { ...bezig, tekens: [] }
      }
      bezig.naam = lezer.regel()
      bezig.bitmap = 'Fonts/' + lezer.regel()
      bezig.alfa = 'Fonts/' + lezer.regel()
      const hoogte = strToInt(lezer.regel())
      if (hoogte === undefined) return stop(`hoogte van '${bezig.naam}' is geen getal`)
      bezig.hoogte = hoogte
      const sep = strToInt(lezer.regel())
      if (sep === undefined) return stop(`sep van '${bezig.naam}' is geen getal`)
      bezig.sep = sep
    } else if (regel === '[char]') {
      const teken = lezer.regel()
      const x1 = lezer.regel()
      const x2 = lezer.regel()
      const y = lezer.regel()
      if (!teken.length) return stop(`leeg teken in '${bezig.naam}'`)
      const x = strToInt(x1)
      const top = strToInt(y)
      const rechts = strToInt(x2)
      if (x === undefined || top === undefined || rechts === undefined) {
        return stop(`coördinaat van '${teken[0]}' in '${bezig.naam}' is geen getal`)
      }
      // x2 - x1 is een Integer-aftrekking met overloopcontrole (005D647F 'jno'): '2147483647' min '-1' gooit.
      const breedte = rechts - x
      if (breedte !== (breedte | 0)) return stop(`breedte van '${teken[0]}' in '${bezig.naam}' loopt over`)
      bezig.tekens.push({ teken: teken[0], x, y: top, breedte })
    }
  }
  if (bezig.tekens.length) fonts.push(bezig)
  return { fonts }
}

/**
 * De .oft-bestanden van de installatie, in de volgorde van FindFirst op
 * 'Fonts\*.oft'. Node geeft op Windows dezelfde volgorde als FindFirst (beide
 * vragen de map op met NtQueryDirectoryFile, zonder te sorteren); op NTFS is dat
 * hoofdletterongevoelig ordinaal, en `scripts/probe-letters.ts` controleert
 * dat. Submappen tellen niet mee.
 */
export function oftBestanden(omsiMap: string): string[] {
  try {
    return readdirSync(join(omsiMap, 'Fonts'), { withFileTypes: true })
      .filter((item) => item.isFile() && /\.oft$/i.test(item.name))
      .map((item) => item.name)
  } catch {
    return []
  }
}

const fontCache = new Map<string, { afdruk: string; fonts: OftFont[] }>()

/**
 * Alle fonts van de installatie, in de volgorde waarin OMSI ze kent. Wordt per
 * map onthouden zolang geen enkel .oft verandert (naam, grootte, tijd); dat
 * nakijken kost een stat per bestand, het opnieuw lezen van alle 698 niet.
 * De lijst is gedeeld: niet wijzigen.
 */
export function leesOmsiFonts(omsiMap: string): OftFont[] {
  const map = join(omsiMap, 'Fonts')
  const namen = oftBestanden(omsiMap)
  const afdruk = namen
    .map((naam) => {
      try {
        const info = statSync(join(map, naam))
        return `${naam}:${info.size}:${info.mtimeMs}`
      } catch {
        return `${naam}:?`
      }
    })
    .join('|')
  const bekend = fontCache.get(map)
  if (bekend && bekend.afdruk === afdruk) return bekend.fonts

  const fonts: OftFont[] = []
  for (const naam of namen) {
    let bytes: Uint8Array
    try {
      bytes = readFileSync(join(map, naam))
    } catch {
      continue
    }
    fonts.push(...ontleedOft(bytes, naam).fonts)
  }
  fontCache.set(map, { afdruk, fonts })
  return fonts
}

/** Het font zoals GetFontIndex (005D67E8) het vindt: exacte naam, eerste treffer. */
export function zoekFont(fonts: OftFont[], naam: string): OftFont | undefined {
  return fonts.find((font) => font.naam === naam)
}

/**
 * Een bitmap zoals TBitmap hem in het geheugen heeft: de beeldpunten van het
 * bestand als één blok, en waar elke rij begint. `undefined` als TPicture hem
 * niet als bitmap zou laden.
 */
interface RuweBitmap {
  /** De beeldpuntgegevens, precies `rij * rijen` bytes. */
  data: Uint8Array
  rijen: number
  rij: number
  /** Van onder naar boven opgeslagen (hoogte in de kop positief). */
  omgekeerd: boolean
}

/**
 * Groter lezen we een bitmap niet: dat is geen font meer, en het hele bestand
 * gaat in één keer het geheugen van de app in. 8192 x 4096 x 24 bit is 96 MB.
 */
const MAX_BITMAP = 128 * 1024 * 1024

/**
 * De plek van een bitmap uit een .oft ('Fonts/' + de regel), maar alleen als
 * die binnen de OMSI-map blijft. Absolute paden en UNC-namen kunnen al niet
 * (join plakt ze achter de map, zoals OMSI ze achter 'Fonts\' plakt); '..'
 * wel, en die houden we hier tegen.
 */
function bitmapPad(omsiMap: string, regel: string): string | undefined {
  const wortel = resolve(omsiMap)
  const pad = resolve(wortel, regel)
  const binnen = relative(wortel, pad)
  if (!binnen || binnen === '..' || binnen.startsWith('..' + scheiding) || isAbsolute(binnen)) return undefined
  return pad
}

/**
 * TPicture kiest de klasse op de extensie; alleen '.bmp' wordt een TBitmap.
 * Alles in Fonts dat een font noemt is .bmp (alle 745). Bij een ander formaat
 * loopt OMSI vast: TPicture kent de extensie niet, of GetBitmap vervangt het
 * plaatje door een lege bitmap waar ScanLine op stukloopt. Hier is het dan
 * onleesbaar. Alleen BI_RGB en BI_BITFIELDS worden ongewijzigd in het geheugen
 * gezet; de rest (RLE, de OS/2-kop) komt in de installatie niet voor en telt
 * ook als onleesbaar.
 */
function leesRuweBitmap(pad: string): RuweBitmap | undefined {
  if (!/\.bmp$/i.test(pad)) return undefined
  let b: Uint8Array
  try {
    if (statSync(pad).size > MAX_BITMAP) return undefined
    b = readFileSync(pad)
  } catch {
    return undefined
  }
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) return undefined
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const begin = dv.getUint32(10, true)
  const kop = dv.getUint32(14, true)
  const breedte = dv.getInt32(18, true)
  const hoogte = dv.getInt32(22, true)
  const bpp = dv.getUint16(28, true)
  const compressie = dv.getUint32(30, true)
  if (kop < 40 || breedte <= 0 || hoogte === 0 || bpp === 0) return undefined
  if (compressie !== 0 && compressie !== 3) return undefined
  const rij = Math.ceil((breedte * bpp) / 32) * 4
  const rijen = Math.abs(hoogte)
  // Een bestand dat korter is dan zijn beeldpunten laat TBitmap met een leesfout stoppen.
  if (begin + rij * rijen > b.length) return undefined
  return { data: b.subarray(begin, begin + rij * rijen), rijen, rij, omgekeerd: hoogte > 0 }
}

/** Waar ScanLine[y] begint in `data`, of -1 als ScanLine een exceptie zou geven. */
function rijstart(bmp: RuweBitmap, y: number): number {
  if (y < 0 || y >= bmp.rijen) return -1
  return (bmp.omgekeerd ? bmp.rijen - 1 - y : y) * bmp.rij
}

/**
 * De bytes van één teken, rij voor rij, `kanalen` per beeldpunt: 1 = de dekking
 * (byte 0), 3 = r g b (byte 2, 1, 0). `undefined` als OMSI bij dit teken zou
 * vastlopen: een rij buiten de bitmap, of een kolom waar (x + j) * 3 plus de
 * laatste byte buiten 0..32767 valt (bereikcontrole 005D6A35/005D6B2A).
 * Voorbij het eind van de beeldpunten leest OMSI in het wilde weg; dat wordt 0.
 */
function tekenBytes(bmp: RuweBitmap | undefined, t: OftTeken, hoogte: number, kanalen: 1 | 3): Uint8Array | undefined {
  if (!bmp) return undefined
  const b = Math.max(0, t.breedte)
  const h = Math.max(0, hoogte)
  const hoogsteByte = kanalen === 3 ? 2 : 0
  // Eerst nakijken, dan pas ruimte vragen: een .oft met hoogte 2000000000 mag de app niet laten vallen.
  // Zo blijft het teken binnen de bitmap (h rijen) en binnen 32767 / 3 kolommen.
  if (h > 0 && (t.y < 0 || t.y + h > bmp.rijen)) return undefined
  for (let j = 0; j < b; j++) {
    const kolom = (t.x + j) * 3
    if (kolom < 0 || kolom + hoogsteByte > 0x7fff) return undefined
  }
  const uit = new Uint8Array(b * h * kanalen)
  for (let i = 0; i < h; i++) {
    const start = rijstart(bmp, t.y + i)
    if (start < 0) return undefined
    for (let j = 0; j < b; j++) {
      const bron = start + (t.x + j) * 3
      const doel = (i * b + j) * kanalen
      if (kanalen === 1) {
        uit[doel] = bmp.data[bron] ?? 0
      } else {
        uit[doel] = bmp.data[bron + 2] ?? 0
        uit[doel + 1] = bmp.data[bron + 1] ?? 0
        uit[doel + 2] = bmp.data[bron] ?? 0
      }
    }
  }
  return uit
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')
}

/**
 * Een font klaar voor de telefoon: per teken de dekking en, als een
 * teksttextuur met dit font volkleur tekent, de kleur. Roep dit met
 * `volkleur` = true aan zodra één vak met dit font bit 0 van veld 5 heeft;
 * zonder `rgb` laat `tekenTekst` zo'n vak leeg.
 *
 * De bitmap wordt ruw gelezen zoals DrawChar dat doet (zie boven). Een teken
 * dat OMSI niet kan lezen krijgt geen `alfa`; bij volkleur een teken waarvan
 * de kleur niet te lezen is geen `rgb`. Een bitmap buiten de OMSI-map wordt
 * niet gelezen. Gooit niet.
 *
 * Wat het oplevert is fors: dekking per beeldpunt, in base64. Als JSON is
 * HH20_HHAschedule_font 37 kB, de mediaan van de gebruikte fonts 85 kB, en
 * SG_Rlbnd_Dest met volkleur (98 tekens van 191 hoog) 6,9 MB. Roep dit één
 * keer per font en bus aan, niet per beeld, en stuur het ingepakt.
 */
export function schermfontVan(omsiMap: string, font: OftFont, volkleur: boolean): Schermfont {
  const lees = (regel: string): RuweBitmap | undefined => {
    const pad = bitmapPad(omsiMap, regel)
    return pad ? leesRuweBitmap(pad) : undefined
  }
  const alfaBmp = lees(font.alfa)
  const kleurBmp = !volkleur ? undefined : font.bitmap === font.alfa ? alfaBmp : lees(font.bitmap)
  const tekens = font.tekens.map((t): Schermteken => {
    const uit: Schermteken = { teken: t.teken, breedte: t.breedte }
    const alfa = tekenBytes(alfaBmp, t, font.hoogte, 1)
    if (alfa) uit.alfa = base64(alfa)
    if (volkleur) {
      const rgb = tekenBytes(kleurBmp, t, font.hoogte, 3)
      if (rgb) uit.rgb = base64(rgb)
    }
    return uit
  })
  return { naam: font.naam, hoogte: font.hoogte, sep: font.sep, tekens }
}
