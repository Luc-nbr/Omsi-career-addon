import { readFileSync } from 'node:fs'

/**
 * De texturen van OMSI, uitgepakt tot kale RGBA-pixels.
 *
 * WAAROM DIT BESTAAT
 * `busmodel.ts` weet welk plaatje er op welk stuk bus hoort, maar niet wat
 * erin staat. Chromium laadt `.png`, `.jpg` en `.bmp` zelf in; de twee
 * formaten die OMSI het meest gebruikt kan hij niet. Geteld over alle 342
 * bestuurbare bussen (`scripts/probe-busmodel.ts`): 79.520 verwijzingen naar
 * `.dds`, 48.272 naar `.tga`, 9.222 `.bmp`, 2.621 `.png` en 531 `.jpg`. Zonder
 * die eerste twee blijft een bus in de keuze dus grijs.
 *
 * DE EXTENSIE ZEGT NIET WAT HET IS
 * Dit bestand kijkt naar de eerste bytes en niet naar de naam, en dat is geen
 * netheid maar noodzaak. Van de 6115 `.dds` onder `Vehicles` zijn er 724 in het
 * geheel geen DDS: 722 zijn een BMP met een andere naam, één is een
 * Paint.NET-bestand (`PDN3`) en één is nul bytes lang. Andersom net zo: 26 van
 * de 5184 `.tga` in deze installatie zijn een DDS, één is een BMP en één een
 * JPEG. Wie op de extensie afgaat, stuurt een BMP door de DXT-uitpakker.
 *
 * WAT ER OP SCHIJF STAAT, GETELD
 * DDS, over de hele installatie (33.707 bestanden): DXT1 14.813, A8 6506,
 * DXT3 6300, DXT5 5145, 32 bits 121, 24 bits 50, 16 bits 1. Onder `Vehicles`
 * alleen: DXT1 2445, DXT3 1624, DXT5 1166, 32 bits 91, 24 bits 50, A8 14,
 * 16 bits 1. Er komt geen DXT2, geen DXT4, geen `DX10`-kop, geen cubemap en
 * geen volumetextuur voor -- niet bij de bussen en niet in de kaarten.
 *
 * TGA, over de hele installatie (5184 bestanden): RLE 32 bits 2355,
 * ongecomprimeerd 32 bits 2056, RLE 24 bits 392, ongecomprimeerd 24 bits 316,
 * RLE met kleurkaart 16, RLE 16 bits 13, grijswaarden 2, kleurkaart 1. Die
 * laatste vier soorten staan niet in `Vehicles`, maar ze kosten samen dertig
 * regels en anders is "wij kunnen TGA" een halve waarheid.
 *
 * DE MAAT
 * De grootste texturen onder `Vehicles` zijn 8192 x 4096 (DDS, `HOH_MAN-A20`)
 * en 4096 x 4096 (TGA, `HC_Volvo7900H`); dat laatste is 64 MB aan RGBA uit één
 * bestand. Van de texturen waar een bestuurbare bus werkelijk naar wijst is de
 * grootste 8192 x 2048 (`MAN_SL_SG\Texture\MAN_SL_ext.dds`), ook 64 MB. 359
 * DDS'en hebben een zijde die geen macht van twee is en bij 46 is een zijde
 * niet deelbaar door vier -- daar loopt het blokrooster van DXT dus over de
 * rand heen en blijft de laatste rij of kolom blokken half onbenut.
 *
 * ALLEEN HET GROOTSTE MIPNIVEAU
 * 1782 DDS'en onder `Vehicles` dragen een mipketen van drie tot dertien
 * niveaus; 3605 hebben alleen het grootste vlak (teller 0 of 1). Die keten
 * hebben wij niet nodig en wordt niet gelezen -- het grootste vlak staat
 * vooraan, dus overslaan kost niets.
 *
 * HOE WE WETEN DAT HET KLOPT
 * Windows heeft sinds Windows 10 zijn eigen DDS-uitpakker in WIC, en die is
 * volstrekt onafhankelijk van deze code. Over 1024 afgetaste pixels per bestand
 * komen wij op: DXT1 (`MAN_NewLionsCity\Texture\18C_main.dds`) 1020 precies
 * gelijk en 4 die één stap van 255 afwijken, DXT3 (`HOH_MAN-A20\Texture\
 * A20_ext.dds`) 1008 gelijk en 16 met één stap verschil, DXT5 (`Citybus 628c
 * ...\Texture\tex3.dds`) 794 gelijk en 230 met één stap. Nooit meer dan één
 * stap, en het **alfakanaal komt bij alle drie op elke afgetaste pixel exact
 * uit** -- de rest is afrondverschil in de twee tussenkleuren. WIC weigert de
 * ongecomprimeerde D3D9-vormen ("the image header might be corrupted"), dus die
 * zijn met het oog nagekeken: zie `scripts/probe-textuur.ts`, dat er plaatjes
 * van schrijft.
 *
 * WAT ER NOOIT GEBEURT
 * Dit bestand gooit niet, net als `o3d.ts` en om dezelfde reden: het draait
 * straks in de werker, en één addon met een verminkte textuur mag niet de hele
 * buslijst omvertrekken. Alles wat niet lukt komt terug als `undefined`, met de
 * reden ernaast voor wie ernaar vraagt.
 *
 * Er zit geen Electron in dit bestand, alleen `node:fs`, zodat het ook in een
 * worker_thread laadt.
 */

/** Een uitgepakte textuur: RGBA, vier bytes per pixel, van boven naar beneden. */
export interface Textuur {
  breedte: number
  hoogte: number
  /** `breedte * hoogte * 4` bytes, in de volgorde r, g, b, a. */
  pixels: Uint8Array
}

/** Het soort bestand, herkend aan de eerste bytes en niet aan de naam. */
export type TextuurSoort = 'dds' | 'tga' | 'bmp' | 'png' | 'jpg'

/** Waarom er geen pixels uitkwamen. */
export type TextuurKlacht =
  /** Niet te openen: weg, vergrendeld, geen rechten. */
  | 'onleesbaar'
  /** Nul bytes lang, of te kort voor een kop. */
  | 'leeg'
  /**
   * Een formaat dat de browser zelf aankan (`.bmp`, `.png`, `.jpg`). Met opzet
   * niet uitgepakt: die bytes gaan ongewijzigd naar Chromium.
   */
  | 'chromium-kan-dit'
  /** De eerste bytes horen bij geen enkel formaat dat we kennen. */
  | 'onbekend-formaat'
  /** Het formaat is herkend, maar deze variant pakken we niet uit. */
  | 'niet-ondersteund'
  /** De kop belooft meer bytes dan het bestand heeft. */
  | 'afgekapt'
  /** Nul pixels breed, of zo groot dat het geheugen kost dat er niet is. */
  | 'onzinnige-maat'

/**
 * Het antwoord van de lezer.
 *
 * `soort` en `vorm` zijn ook gevuld als het misging -- dat is precies wat je
 * wilt weten bij een bestand dat niet uitkomt, en `vorm` is de tekst die de
 * probe optelt.
 */
export interface TextuurLezing {
  textuur?: Textuur
  soort?: TextuurSoort
  /** Wat er precies in stond: `DXT1`, `BGRA32`, `TGA-RLE-32` ... */
  vorm?: string
  klacht?: TextuurKlacht
  /** Waar het misging, voor in een logregel. */
  detail?: string
}

/**
 * De grootste zijde die we accepteren.
 *
 * Een verminkte kop levert zo een klacht op in plaats van een poging om vier
 * gigabyte te reserveren. 16.384 is ruim: de grootste textuur hier is 8192 en
 * dat is al 32 MB op schijf.
 */
const MAX_ZIJDE = 16384

/**
 * En een grens op het aantal pixels samen: 8192 x 8192. Een kop die 16.384 bij
 * 16.384 beweert komt op een gigabyte RGBA uit; dat is geen textuur meer maar
 * een leesfout.
 */
const MAX_PIXELS = 8192 * 8192

/**
 * Leest een textuur van schijf. Geeft `undefined` bij alles wat niet lukt --
 * ook bij een BMP, PNG of JPEG, want die laat de app door Chromium inladen.
 *
 * Dit is de vorm voor wie gewoon pixels wil. Wie wil weten *waarom* het niet
 * lukte -- de probe, en straks het logboek -- neemt `leesTextuurLezing`.
 */
export function leesTextuur(pad: string): Textuur | undefined {
  return leesTextuurLezing(pad).textuur
}

/** Hetzelfde, maar met het soort en de reden erbij. */
export function leesTextuurLezing(pad: string): TextuurLezing {
  let bytes: Buffer
  try {
    bytes = readFileSync(pad)
  } catch (fout) {
    return { klacht: 'onleesbaar', detail: (fout as Error).message }
  }
  return ontleedTextuur(bytes)
}

/**
 * Ontleedt bytes die al in het geheugen staan.
 *
 * Staat er apart naast om dezelfde reden als `ontleedO3d`: het lezen van schijf
 * en het uitpakken gebeuren niet altijd op dezelfde plek, en een probe wil
 * dezelfde bytes twee keer uitpakken zonder de leeskop er twee keer bij te
 * halen.
 */
export function ontleedTextuur(bytes: Uint8Array): TextuurLezing {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (buf.length === 0) return { klacht: 'leeg', detail: 'nul bytes' }
  if (buf.length < 18) return { klacht: 'leeg', detail: `${buf.length} bytes, te kort voor een kop` }

  if (buf[0] === 0x44 && buf[1] === 0x44 && buf[2] === 0x53 && buf[3] === 0x20) return ontleedDds(buf)
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { soort: 'bmp', vorm: 'BMP', klacht: 'chromium-kan-dit', detail: 'bitmap' }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { soort: 'png', vorm: 'PNG', klacht: 'chromium-kan-dit', detail: 'png' }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { soort: 'jpg', vorm: 'JPEG', klacht: 'chromium-kan-dit', detail: 'jpeg' }
  }

  /*
   * Wat overblijft proberen we als TGA. Dat moet wel, want een TGA heeft geen
   * herkenningsbytes vooraan: de kop begint meteen met de velden. Sinds versie
   * 2 staat er wel een staart (`TRUEVISION-XFILE`), maar lang niet elk bestand
   * draagt die, dus daar valt niet op te bouwen. De veldcontrole in
   * `ontleedTga` doet het werk: een bestand dat geen TGA is, valt daar om.
   */
  return ontleedTga(buf)
}

// ---------------------------------------------------------------------- DDS

/** De vlaggen uit het `DDS_PIXELFORMAT`-blok die hier voorkomen. */
const PF_ALPHAPIXELS = 0x1
const PF_ALPHA = 0x2
const PF_FOURCC = 0x4
const PF_RGB = 0x40
const PF_LUMINANCE = 0x20000

function ontleedDds(buf: Buffer): TextuurLezing {
  if (buf.length < 128) return { soort: 'dds', klacht: 'leeg', detail: `${buf.length} bytes` }

  const hoogte = buf.readUInt32LE(12)
  const breedte = buf.readUInt32LE(16)
  const pfVlaggen = buf.readUInt32LE(80)
  const fourcc = buf.toString('latin1', 84, 88)
  const bits = buf.readUInt32LE(88)
  const maskR = buf.readUInt32LE(92)
  const maskG = buf.readUInt32LE(96)
  const maskB = buf.readUInt32LE(100)
  const maskA = buf.readUInt32LE(104)

  const maat = keurMaat(breedte, hoogte)
  if (maat) return { soort: 'dds', klacht: maat[0], detail: maat[1] }

  if (pfVlaggen & PF_FOURCC) {
    /*
     * Alles wat hier niet met naam genoemd wordt -- `DXT2`, `DXT4`, `ATI2`, en
     * `DX10`, dat een tweede kop van twintig bytes achter de eerste zet --
     * komt er als "niet-ondersteund" uit, mét de vier letters erbij. Er staat
     * geen enkel zo'n bestand in deze installatie; het gaat erom dat er geen
     * DXT1-uitpakker overheen gaat als iemand er ooit een meelevert.
     */
    if (fourcc === 'DXT1') return pakDxt(buf, 128, breedte, hoogte, 1)
    if (fourcc === 'DXT3') return pakDxt(buf, 128, breedte, hoogte, 3)
    if (fourcc === 'DXT5') return pakDxt(buf, 128, breedte, hoogte, 5)
    const naam = fourcc.replace(/[^\x20-\x7e]/g, '.')
    return { soort: 'dds', vorm: naam, klacht: 'niet-ondersteund', detail: `fourcc "${naam}"` }
  }

  if (pfVlaggen & (PF_RGB | PF_ALPHA | PF_LUMINANCE)) {
    /*
     * Een ongecomprimeerde DDS mag achter elke rij opvulling zetten; hoeveel
     * staat in `pitch`, en dat veld telt alleen als vlag 0x8 aan staat. Geen
     * van de 6686 ongecomprimeerde DDS'en van deze installatie doet dat (pitch
     * is overal precies breedte maal bytes), maar het kost drie regels om er
     * niet op te hoeven vertrouwen.
     */
    const vlaggen = buf.readUInt32LE(8)
    const pitch = vlaggen & 0x8 ? buf.readUInt32LE(20) : 0
    return pakDdsKanalen(buf, 128, breedte, hoogte, bits, maskR, maskG, maskB, maskA, pfVlaggen, pitch)
  }

  return {
    soort: 'dds',
    klacht: 'niet-ondersteund',
    detail: `pixelformaatvlaggen 0x${pfVlaggen.toString(16)}`
  }
}

/**
 * Van vijf en zes bits naar acht, afgerond.
 *
 * De voor de hand liggende weg is de hoogste bits onderaan herhalen
 * (`(v << 3) | (v >> 2)`), en dat is ook wat veel uitpakkers doen. Alleen kapt
 * die weg af waar afronden hoort. Naast de DDS-lezer van Windows gelegd zakte
 * het aantal afgetaste pixels dat er één stap naast lag op `18C_main.dds` van
 * 24 op 1024 naar 4; op `A20_ext.dds` van 65 naar 16. Een tabel van 32 en één
 * van 64 bytes kost niets en wordt per blok twee keer geraadpleegd.
 */
const VIJF = new Uint8Array(32)
const ZES = new Uint8Array(64)
for (let i = 0; i < 32; i++) VIJF[i] = Math.round((i * 255) / 31)
for (let i = 0; i < 64; i++) ZES[i] = Math.round((i * 255) / 63)

/**
 * De drie DXT-vormen, in één lus.
 *
 * Ze verschillen alleen in wat er vóór het kleurblok staat: DXT1 niets, DXT3
 * acht bytes met vier bits alfa per pixel, DXT5 twee ijkwaarden plus drie bits
 * per pixel. Het kleurblok is bij alle drie hetzelfde: twee kleuren in 565 en
 * zestien keer twee bits.
 *
 * Eén verschil dat je zo over het hoofd ziet: alleen bij DXT1 betekent
 * `c0 <= c1` iets -- dan zijn er drie kleuren en is de vierde doorzichtig. Bij
 * DXT3 en DXT5 staat de alfa al ergens anders en zijn het altijd vier kleuren.
 * Die vergissing kost je zwarte vlekken in elke ruit.
 */
function pakDxt(
  buf: Buffer,
  begin: number,
  breedte: number,
  hoogte: number,
  soort: 1 | 3 | 5
): TextuurLezing {
  const stap = soort === 1 ? 8 : 16
  const blokkenX = Math.ceil(breedte / 4)
  const blokkenY = Math.ceil(hoogte / 4)
  const nodig = blokkenX * blokkenY * stap
  const vorm = `DXT${soort}`
  if (begin + nodig > buf.length) {
    return {
      soort: 'dds',
      vorm,
      klacht: 'afgekapt',
      detail: `${nodig} bytes nodig, ${buf.length - begin} over`
    }
  }

  const pixels = new Uint8Array(breedte * hoogte * 4)
  /*
   * De vier kleuren en de acht alfawaarden van het huidige blok, hergebruikt.
   * Een 8192 x 4096-textuur is twee miljoen blokken; wie daar per blok een
   * array voor maakt, laat de vuilnisman het werk doen.
   */
  const r = new Uint8Array(4)
  const g = new Uint8Array(4)
  const b = new Uint8Array(4)
  const a = new Uint8Array(4)
  const alfa = new Uint8Array(8)

  for (let by = 0; by < blokkenY; by++) {
    for (let bx = 0; bx < blokkenX; bx++) {
      const p = begin + (by * blokkenX + bx) * stap

      if (soort === 5) {
        const a0 = buf[p]
        const a1 = buf[p + 1]
        alfa[0] = a0
        alfa[1] = a1
        if (a0 > a1) {
          for (let i = 1; i < 7; i++) alfa[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7)
        } else {
          for (let i = 1; i < 5; i++) alfa[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5)
          alfa[6] = 0
          alfa[7] = 255
        }
      }

      const kleurBegin = soort === 1 ? p : p + 8
      const c0 = buf.readUInt16LE(kleurBegin)
      const c1 = buf.readUInt16LE(kleurBegin + 2)
      r[0] = VIJF[(c0 >> 11) & 31]
      g[0] = ZES[(c0 >> 5) & 63]
      b[0] = VIJF[c0 & 31]
      r[1] = VIJF[(c1 >> 11) & 31]
      g[1] = ZES[(c1 >> 5) & 63]
      b[1] = VIJF[c1 & 31]
      a[0] = 255
      a[1] = 255
      if (soort !== 1 || c0 > c1) {
        /*
         * De twee tussenkleuren, op een derde en op twee derde. De `+ 1` is
         * afronden in plaats van afkappen -- een toekenning aan een
         * `Uint8Array` kapt af. Het scheelde op `18C_main.dds` negen van de
         * 1024 afgetaste pixels ten opzichte van de lezer van Windows.
         */
        r[2] = (2 * r[0] + r[1] + 1) / 3
        g[2] = (2 * g[0] + g[1] + 1) / 3
        b[2] = (2 * b[0] + b[1] + 1) / 3
        r[3] = (r[0] + 2 * r[1] + 1) / 3
        g[3] = (g[0] + 2 * g[1] + 1) / 3
        b[3] = (b[0] + 2 * b[1] + 1) / 3
        a[2] = 255
        a[3] = 255
      } else {
        r[2] = (r[0] + r[1] + 1) / 2
        g[2] = (g[0] + g[1] + 1) / 2
        b[2] = (b[0] + b[1] + 1) / 2
        r[3] = 0
        g[3] = 0
        b[3] = 0
        a[2] = 255
        a[3] = 0
      }

      const index = buf.readUInt32LE(kleurBegin + 4)
      const tot = Math.min(4, hoogte - by * 4)
      const totX = Math.min(4, breedte - bx * 4)
      for (let ry = 0; ry < tot; ry++) {
        const y = by * 4 + ry
        for (let rx = 0; rx < totX; rx++) {
          const nummer = ry * 4 + rx
          const k = (index >>> (2 * nummer)) & 3
          const uit = (y * breedte + bx * 4 + rx) * 4
          pixels[uit] = r[k]
          pixels[uit + 1] = g[k]
          pixels[uit + 2] = b[k]
          if (soort === 1) {
            pixels[uit + 3] = a[k]
          } else if (soort === 3) {
            // Vier bits per pixel, twee pixels per byte, het lage nibble eerst.
            const byte = buf[p + (nummer >> 1)]
            pixels[uit + 3] = (nummer & 1 ? byte >> 4 : byte & 15) * 17
          } else {
            /*
             * Drie bits per pixel in zes bytes: één reeks van 48 bits met de
             * laagste byte voorop. In twee helften van 24 bits lezen houdt het
             * binnen wat een gewoon getal exact aankan, en geen enkele waarde
             * ligt over de naad heen -- pixel 8 begint precies op bit 24.
             */
            const bit = nummer * 3
            const waar = bit < 24 ? p + 2 : p + 5
            const schuif = bit < 24 ? bit : bit - 24
            const drie = (buf[waar] | (buf[waar + 1] << 8) | (buf[waar + 2] << 16)) >>> schuif
            pixels[uit + 3] = alfa[drie & 7]
          }
        }
      }
    }
  }

  return { soort: 'dds', vorm, textuur: { breedte, hoogte, pixels } }
}

/**
 * De ongecomprimeerde DDS-vormen, via hun bitmaskers.
 *
 * Er wordt niet op een vast formaat gegokt maar op de maskers gelezen, en dat
 * is nodig: 109 bestanden hebben rood op `0x00ff0000` (in bytes dus b, g, r, a,
 * het gebruikelijke), maar twee -- `MAN_NewLionsCity\Texture\
 * nlc_int_driver_cabin.dds` en zijn buurman -- hebben rood op `0x000000ff` en
 * staan andersom in het geheugen. Op het oog merk je dat pas als het blauw van
 * een dashboard rood wordt.
 *
 * De veertien A8-bestanden hebben helemaal geen kleurmasker; dat is geen fout
 * maar het formaat (`D3DFMT_A8`, in de kaarten 6506 keer gebruikt als
 * overvloeimasker tussen twee terreintexturen). Die komen er zwart uit met een
 * alfakanaal, want dat is ook wat Direct3D bij het aftasten teruggeeft.
 */
function pakDdsKanalen(
  buf: Buffer,
  begin: number,
  breedte: number,
  hoogte: number,
  bits: number,
  maskR: number,
  maskG: number,
  maskB: number,
  maskA: number,
  pfVlaggen: number,
  pitch: number
): TextuurLezing {
  if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
    return { soort: 'dds', klacht: 'niet-ondersteund', detail: `${bits} bits per pixel` }
  }
  const bytesPerPixel = bits / 8
  const rij = Math.max(pitch, breedte * bytesPerPixel)
  const nodig = rij * hoogte
  const vorm = beschrijfKanalen(bits, maskR, maskG, maskB, maskA, pfVlaggen)
  if (begin + nodig > buf.length) {
    return {
      soort: 'dds',
      vorm,
      klacht: 'afgekapt',
      detail: `${nodig} bytes nodig, ${buf.length - begin} over`
    }
  }

  const kanaalR = kanaal(maskR)
  const kanaalG = kanaal(maskG)
  const kanaalB = kanaal(maskB)
  const heeftAlfa = maskA !== 0 && (pfVlaggen & (PF_ALPHAPIXELS | PF_ALPHA)) !== 0
  const kanaalA = heeftAlfa ? kanaal(maskA) : undefined
  /*
   * Grijswaarden: één masker voor alle drie de kanalen. Komt in deze
   * installatie niet voor, maar het onderscheid kost één regel en zonder die
   * regel wordt een grijstextuur felrood.
   */
  const grijs = (pfVlaggen & PF_LUMINANCE) !== 0

  const pixels = new Uint8Array(breedte * hoogte * 4)
  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      const p = begin + y * rij + x * bytesPerPixel
      let rauw: number
      if (bytesPerPixel === 1) rauw = buf[p]
      else if (bytesPerPixel === 2) rauw = buf[p] | (buf[p + 1] << 8)
      else if (bytesPerPixel === 3) rauw = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
      else rauw = buf.readUInt32LE(p)
      const uit = (y * breedte + x) * 4
      const rood = kanaalR ? kanaalR(rauw) : 0
      pixels[uit] = rood
      pixels[uit + 1] = grijs ? rood : kanaalG ? kanaalG(rauw) : 0
      pixels[uit + 2] = grijs ? rood : kanaalB ? kanaalB(rauw) : 0
      pixels[uit + 3] = kanaalA ? kanaalA(rauw) : 255
    }
  }

  return { soort: 'dds', vorm, textuur: { breedte, hoogte, pixels } }
}

/**
 * Van een bitmasker naar een functie die er een waarde van 0 tot 255 uit haalt.
 *
 * De schaling is `waarde * 255 / max` en niet een bitverschuiving, want bij vijf
 * bits levert verschuiven hoogstens 248 op en dan wordt wit vuilwit.
 */
function kanaal(masker: number): ((rauw: number) => number) | undefined {
  if (!masker) return undefined
  let schuif = 0
  let rest = masker >>> 0
  while ((rest & 1) === 0) {
    rest >>>= 1
    schuif++
  }
  const max = rest
  if (max === 255) return (rauw: number): number => (rauw >>> schuif) & 255
  return (rauw: number): number => Math.round((((rauw >>> schuif) & max) * 255) / max)
}

/** Een leesbare naam voor de vorm, voor in de telling van de probe. */
function beschrijfKanalen(
  bits: number,
  maskR: number,
  maskG: number,
  maskB: number,
  maskA: number,
  pfVlaggen: number
): string {
  if (pfVlaggen & PF_ALPHA && !maskR && !maskG && !maskB) return `A${bits}`
  if (pfVlaggen & PF_LUMINANCE) return maskA ? `LA${bits}` : `L${bits}`
  const volgorde = maskR > maskB ? 'BGR' : 'RGB'
  return `${volgorde}${maskA ? 'A' : 'X'}${bits}`
}

// ---------------------------------------------------------------------- TGA

function ontleedTga(buf: Buffer): TextuurLezing {
  const idLengte = buf[0]
  const kleurkaartSoort = buf[1]
  const soort = buf[2]
  const kaartEersteIndex = buf.readUInt16LE(3)
  const kaartLengte = buf.readUInt16LE(5)
  const kaartBits = buf[7]
  const breedte = buf.readUInt16LE(12)
  const hoogte = buf.readUInt16LE(14)
  const bits = buf[16]
  const beschrijver = buf[17]

  const bekend = soort === 1 || soort === 2 || soort === 3 || soort === 9 || soort === 10 || soort === 11
  if (!bekend || kleurkaartSoort > 1) {
    /*
     * Hier vallen de bestanden om die helemaal geen TGA zijn en die ook niet aan
     * hun eerste bytes te herkennen waren. Het eerste veld van een TGA is geen
     * merkteken, dus dit ís de herkenning.
     */
    const kop = [...buf.subarray(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')
    return { klacht: 'onbekend-formaat', detail: `begint met ${kop}` }
  }

  const maat = keurMaat(breedte, hoogte)
  if (maat) return { soort: 'tga', klacht: maat[0], detail: maat[1] }

  const metKleurkaart = soort === 1 || soort === 9
  const grijs = soort === 3 || soort === 11
  const gecomprimeerd = soort >= 9
  const wat = metKleurkaart ? 'kaart' : grijs ? 'grijs' : ''
  const vorm = `TGA${gecomprimeerd ? '-RLE' : ''}-${wat}${bits}`

  if (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32) {
    return { soort: 'tga', vorm, klacht: 'niet-ondersteund', detail: `${bits} bits per pixel` }
  }

  let p = 18 + idLengte
  /*
   * De kleurkaart staat tussen de kop en de pixels. Hij is er ook als het
   * bestand hem niet gebruikt, dus hij wordt altijd overgeslagen en alleen
   * ingelezen als de pixels er werkelijk naar wijzen.
   */
  let kaart: Uint8Array | undefined
  if (kleurkaartSoort === 1 && kaartLengte > 0) {
    const kaartBytes = Math.ceil(kaartBits / 8)
    if (p + kaartLengte * kaartBytes > buf.length) {
      return { soort: 'tga', vorm, klacht: 'afgekapt', detail: 'kleurkaart' }
    }
    if (metKleurkaart) {
      if (kaartBits !== 15 && kaartBits !== 16 && kaartBits !== 24 && kaartBits !== 32) {
        return {
          soort: 'tga',
          vorm,
          klacht: 'niet-ondersteund',
          detail: `kleurkaart van ${kaartBits} bits`
        }
      }
      kaart = new Uint8Array((kaartEersteIndex + kaartLengte) * 4)
      for (let i = 0; i < kaartLengte; i++) {
        zetKleur(kaart, (kaartEersteIndex + i) * 4, buf, p + i * kaartBytes, kaartBits)
      }
    }
    p += kaartLengte * kaartBytes
  }
  if (metKleurkaart && !kaart) {
    return { soort: 'tga', vorm, klacht: 'niet-ondersteund', detail: 'kleurkaart ontbreekt' }
  }

  const bytesPerPixel = bits / 8
  const n = breedte * hoogte
  const pixels = new Uint8Array(n * 4)

  /*
   * Eén pixel uit het bestand op plek `uit` in het beeld. De keuze staat buiten
   * de lus zodat er per pixel niet opnieuw op het soort getoetst wordt: de
   * zwaarste TGA hier is 4096 x 4096, en dat zijn zestien miljoen keuzes.
   */
  const tabel = kaart
  const schrijf = tabel
    ? (uit: number, bron: Buffer, q: number): void => {
        const index = bits === 8 ? bron[q] : bron[q] | (bron[q + 1] << 8)
        const k = index * 4
        if (k + 3 < tabel.length) {
          pixels[uit] = tabel[k]
          pixels[uit + 1] = tabel[k + 1]
          pixels[uit + 2] = tabel[k + 2]
          pixels[uit + 3] = tabel[k + 3]
        }
      }
    : grijs
      ? (uit: number, bron: Buffer, q: number): void => {
          pixels[uit] = bron[q]
          pixels[uit + 1] = bron[q]
          pixels[uit + 2] = bron[q]
          pixels[uit + 3] = 255
        }
      : bits === 32
        ? (uit: number, bron: Buffer, q: number): void => {
            pixels[uit] = bron[q + 2]
            pixels[uit + 1] = bron[q + 1]
            pixels[uit + 2] = bron[q]
            pixels[uit + 3] = bron[q + 3]
          }
        : bits === 24
          ? (uit: number, bron: Buffer, q: number): void => {
              pixels[uit] = bron[q + 2]
              pixels[uit + 1] = bron[q + 1]
              pixels[uit + 2] = bron[q]
              pixels[uit + 3] = 255
            }
          : (uit: number, bron: Buffer, q: number): void => zetKleur(pixels, uit, bron, q, bits)

  if (!gecomprimeerd) {
    if (p + n * bytesPerPixel > buf.length) {
      return {
        soort: 'tga',
        vorm,
        klacht: 'afgekapt',
        detail: `${n * bytesPerPixel} bytes nodig, ${buf.length - p} over`
      }
    }
    for (let i = 0; i < n; i++) schrijf(i * 4, buf, p + i * bytesPerPixel)
  } else {
    /*
     * RLE: een kopbyte, dan óf één pixel die zich herhaalt (hoogste bit aan) óf
     * een rijtje losse pixels. De telling staat er altijd één te laag in. De
     * norm zegt dat een pakket niet over het einde van een rij heen mag lopen,
     * maar er zijn schrijvers die dat toch doen, dus er wordt doorgeteld en pas
     * op het aantal pixels gestopt.
     */
    let i = 0
    while (i < n) {
      if (p >= buf.length) {
        return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `${i} van ${n} pixels uitgepakt` }
      }
      const kop = buf[p]
      p++
      const aantal = (kop & 0x7f) + 1
      if (kop & 0x80) {
        if (p + bytesPerPixel > buf.length) {
          return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `herhaling bij pixel ${i}` }
        }
        for (let k = 0; k < aantal && i < n; k++, i++) schrijf(i * 4, buf, p)
        p += bytesPerPixel
      } else {
        if (p + aantal * bytesPerPixel > buf.length) {
          return { soort: 'tga', vorm, klacht: 'afgekapt', detail: `rijtje bij pixel ${i}` }
        }
        for (let k = 0; k < aantal && i < n; k++, i++) schrijf(i * 4, buf, p + k * bytesPerPixel)
        p += aantal * bytesPerPixel
      }
    }
  }

  /*
   * En dan de volgorde. Een TGA bewaart zijn rijen van onder naar boven, tenzij
   * bit 5 van de beschrijver aan staat; bit 4 doet hetzelfde voor links en
   * rechts. Van de 3023 TGA's onder `Vehicles` staat bit 5 bij geen enkele aan
   * -- ze moeten dus állemaal omgekeerd worden, en wie dat vergeet ziet een bus
   * op zijn kop zonder dat er iets kapot lijkt. Omkeren gebeurt achteraf en per
   * rij, niet per pixel tijdens het uitpakken: dat scheelt een deling en een
   * aftrekking op elk van de zestien miljoen pixels van de zwaarste textuur.
   */
  if ((beschrijver & 0x20) === 0) keerRijenOm(pixels, breedte, hoogte)
  if ((beschrijver & 0x10) !== 0) keerKolommenOm(pixels, breedte, hoogte)

  return { soort: 'tga', vorm, textuur: { breedte, hoogte, pixels } }
}

/** Onderste rij naar boven: de gewone volgorde van een TGA. */
function keerRijenOm(pixels: Uint8Array, breedte: number, hoogte: number): void {
  const rij = breedte * 4
  const hulp = new Uint8Array(rij)
  for (let y = 0; y < hoogte >> 1; y++) {
    const boven = y * rij
    const onder = (hoogte - 1 - y) * rij
    hulp.set(pixels.subarray(boven, boven + rij))
    pixels.copyWithin(boven, onder, onder + rij)
    pixels.set(hulp, onder)
  }
}

/** Hetzelfde voor links en rechts; komt hier bij geen enkel bestand voor. */
function keerKolommenOm(pixels: Uint8Array, breedte: number, hoogte: number): void {
  for (let y = 0; y < hoogte; y++) {
    const rij = y * breedte * 4
    for (let x = 0; x < breedte >> 1; x++) {
      const links = rij + x * 4
      const rechts = rij + (breedte - 1 - x) * 4
      for (let k = 0; k < 4; k++) {
        const hulp = pixels[links + k]
        pixels[links + k] = pixels[rechts + k]
        pixels[rechts + k] = hulp
      }
    }
  }
}

/**
 * Eén pixel uit een TGA of uit een kleurkaart, naar RGBA.
 *
 * TGA bewaart kleur als blauw, groen, rood -- de volgorde van het geheugen van
 * een pc uit 1984 en nog steeds die van het formaat. Bij 32 bits wordt de
 * vierde byte altijd als alfa gelezen, ook als de beschrijverbyte nul
 * attribuutbits belooft: van de 1172 ongecomprimeerde 32-bits TGA's onder
 * `Vehicles` zeggen er 341 "geen alfa" terwijl hun vierde byte wel degelijk
 * varieert, en dat zijn juist de ruiten en de schaduwen. Zes bestanden hebben
 * alfa overal nul en zijn daarmee onzichtbaar; dat is dan zo, OMSI ziet
 * hetzelfde.
 */
function zetKleur(doel: Uint8Array, uit: number, bron: Buffer, q: number, bits: number): void {
  if (bits === 32) {
    doel[uit] = bron[q + 2]
    doel[uit + 1] = bron[q + 1]
    doel[uit + 2] = bron[q]
    doel[uit + 3] = bron[q + 3]
    return
  }
  if (bits === 24) {
    doel[uit] = bron[q + 2]
    doel[uit + 1] = bron[q + 1]
    doel[uit + 2] = bron[q]
    doel[uit + 3] = 255
    return
  }
  if (bits === 16 || bits === 15) {
    /*
     * Vijf bits per kanaal met één bit over. Die ene bit is in de norm de alfa,
     * maar in de praktijk laten schrijvers hem op nul staan bij een dekkend
     * beeld -- en dan zou alles onzichtbaar worden. Hij wordt hier dus niet
     * gebruikt; de dertien 16-bits bestanden in deze installatie komen dekkend
     * binnen.
     */
    const waarde = bron[q] | (bron[q + 1] << 8)
    doel[uit] = Math.round((((waarde >> 10) & 31) * 255) / 31)
    doel[uit + 1] = Math.round((((waarde >> 5) & 31) * 255) / 31)
    doel[uit + 2] = Math.round(((waarde & 31) * 255) / 31)
    doel[uit + 3] = 255
    return
  }
  // Acht bits in een kleurkaart: een grijswaarde.
  doel[uit] = bron[q]
  doel[uit + 1] = bron[q]
  doel[uit + 2] = bron[q]
  doel[uit + 3] = 255
}

// -------------------------------------------------------------------- samen

/** Is dit een maat waar we geheugen voor willen reserveren? */
function keurMaat(breedte: number, hoogte: number): [TextuurKlacht, string] | undefined {
  if (breedte <= 0 || hoogte <= 0) return ['onzinnige-maat', `${breedte} x ${hoogte}`]
  if (breedte > MAX_ZIJDE || hoogte > MAX_ZIJDE || breedte * hoogte > MAX_PIXELS) {
    return ['onzinnige-maat', `${breedte} x ${hoogte}`]
  }
  return undefined
}
