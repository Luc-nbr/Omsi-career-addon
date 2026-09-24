import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { modelVanBus } from './busmodel'
import { readOmsiLines } from './omsiFile'

/**
 * De schermpjes die in een bus zitten, zoals de bus ze zelf beschrijft.
 *
 * WAAROM DIT BESTAAT
 * Elk schermpje in OMSI -- de IBIS, de kaartautomaat, de thermometer -- is een
 * stukje textuur waar het spel tekst op tekent. In de `model.cfg` van de bus
 * staat per schermpje welke stringvariabele de tekst levert, in welk
 * lettertype, hoe groot de textuur is en in welke kleur de letters komen. De
 * plugin leest die variabelen uit het geheugen (zie `lees_busvars` in
 * plugin/omsicareer.c); hier staat wat ze betekenen.
 *
 * Daarmee hoeft er voor een nieuwe bus niets in de app bij: de bus vertelt zelf
 * dat hij twee regels van 885 bij 78 in `TH_AFR-Font` in mintgroen heeft, en de
 * app tekent dat na.
 *
 * HOE ZO'N BLOK ERUITZIET
 * `[texttexture]` leest acht regels, `[texttexture_enh]` tien. Beide komen veel
 * voor -- in deze installatie 4132 om 3072 keer -- dus allebei worden ze hier
 * gelezen:
 *
 *   [texttexture]
 *   afr_display_1    1  de stringvariabele van het busscript
 *   TH_AFR-Font      2  het lettertype; let op, dit is de naam BINNENIN een
 *                       .oft-bestand in `Fonts`, niet de bestandsnaam
 *   885              3  breedte van de textuur in beeldpunten
 *   78               4  hoogte
 *   0                5  waar de kleur vandaan komt: 0 = de letters worden in de
 *                       kleur hieronder getekend, anders komt de kleur uit de
 *                       bitmap van het lettertype
 *   95 211 188       6-8 de kleur van de LETTERS, niet van de achtergrond
 *   (+ bij _enh)     9  horizontaal uitlijnen: 0 midden, 1 links, 2 rechts
 *                   10  verticaal uitlijnen
 *
 * Wat ertussen staat is commentaar van de bouwer ("AFR200 Zeile 1", "3"); OMSI
 * kijkt alleen naar regels die met een blokhaak beginnen, en wij dus ook.
 *
 * DE ACHTERGROND STAAT ER NIET IN
 * Wat niet beschreven is blijft doorzichtig: je kijkt op het paneel van het
 * apparaat zelf. Daarom kiest de app hem hier, naar wat het apparaat is: zwarte
 * cijfers horen bij een lcd-ruitje en dat is licht, lichte of gekleurde letters
 * horen bij een oplichtend scherm en dat is bijna zwart. Zo ziet een AFR 200 er
 * in de app uit als in de bus: mintgroene letters op donker.
 */

/** Waar de letters staan als de regel smaller is dan het schermpje. */
export type Uitlijning = 'midden' | 'links' | 'rechts'

/** Eén schermpje: een variabele met de vorm waarin de bus hem toont. */
export interface Schermvak {
  /** De stringvariabele van het busscript die de tekst levert. */
  variabele: string
  /** Het lettertype, zoals het binnenin het .oft-bestand heet. */
  font: string
  /** De afmeting van de textuur; bepaalt de verhouding van het schermpje. */
  breedte: number
  hoogte: number
  /** De kleur van de letters. */
  tekstkleur: string
  /** De achtergrond die de app erbij kiest; zie de kop van dit bestand. */
  achtergrond: string
  uitlijning: Uitlijning
  /** De kleurcode zoals hij in de cfg staat, om schermpjes te kunnen vergelijken. */
  kleurcode: string
}

/**
 * Wat voor apparaat het is.
 *
 * Een bus heeft meer schermpjes dan alleen zijn IBIS: een thermometer, een
 * klok, de kilometerteller. Die horen er ook bij -- ze staan in dezelfde lijst
 * en ze kloppen -- maar wie de IBIS zoekt wil hem bovenaan hebben.
 */
export type Apparaatsoort = 'ibis' | 'kaartautomaat' | 'anders'

/** Een apparaat: de schermpjes die bij elkaar horen, op volgorde. */
export interface Busapparaat {
  soort: Apparaatsoort
  /** Waar de variabelen het over eens zijn, bijvoorbeeld "afr_display". */
  naam: string
  font: string
  breedte: number
  hoogte: number
  tekstkleur: string
  achtergrond: string
  uitlijning: Uitlijning
  /** De variabelen, in de volgorde waarin ze op het apparaat staan. */
  variabelen: string[]
}

/**
 * Kentekens en wagennummers. Dat zijn geen schermpjes, en ze zouden de spiegel
 * vullen met de kentekenplaat van de bus.
 */
const GEEN_SCHERM = /^(ident|number|anh_ident|wagennr|PVG_wagennr|Kennz)/i
const PLAATFONT = /kennz|euro|wagen/i

const IS_IBIS = /ibis|lawo|annax|matrix|bordcomputer|rbl|vdv/i
const IS_AUTOMAAT = /afr|ticketprinter|ticket_printer|almex|atron|efad|kasse|drucker|kasownik/i

/** Waar het schermpje bij hoort; zie `Apparaatsoort`. */
function soortVan(naam: string, font: string): Apparaatsoort {
  if (IS_AUTOMAAT.test(naam) || IS_AUTOMAAT.test(font)) return 'kaartautomaat'
  if (IS_IBIS.test(naam) || IS_IBIS.test(font)) return 'ibis'
  return 'anders'
}

/** Hoe licht een kleur is, in de verhouding waarin het oog de kleuren weegt. */
function helderheid(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * De kleur van de letters als die niet in de cfg staat.
 *
 * Bij kleurbron 1 komen de letters uit de bitmap van het lettertype, en die
 * ligt in `Fonts` naast een `.oft` met de naam erin. Die bitmaps uitlezen kan,
 * maar de matrixschermen waar het hier om gaat delen allemaal hetzelfde soort
 * lettertype, en dat is oranje op zwart -- zoals elke IBIS die je in het echt
 * ziet. De rest krijgt gebroken wit.
 */
function kleurUitFont(font: string): string {
  return /ibis|matrix|annax|lawo|rollband|dot/i.test(font) ? '#ffb44d' : '#e8eef6'
}

/**
 * Het paneel waarop het schermpje ligt; zie de kop van dit bestand.
 *
 * Donkere letters horen bij een verlicht ruitje: bij een IBIS of een matrix is
 * dat het oranje van een IBIS-2, bij de rest het grijsgroen van een lcd. Lichte
 * of gekleurde letters lichten zelf op, en dan is het paneel bijna zwart. Dit
 * is de enige plek waar de app iets kiest dat niet in de bus staat -- de
 * achtergrond wordt in OMSI niet beschreven, want daar kijk je door de textuur
 * heen op het apparaat zelf.
 */
function achtergrondBij(font: string, r: number, g: number, b: number, mono: boolean): string {
  if (mono && helderheid(r, g, b) < 90) {
    return /ibis|matrix|annax|lawo|dot|5x7|8x11/i.test(font) ? 'rgb(214, 132, 24)' : 'rgb(168, 183, 160)'
  }
  return 'rgb(12, 14, 16)'
}

/** Het lezen van één blok; `enh` heeft er twee velden bij. */
function vakVan(regels: string[], i: number, enh: boolean): Schermvak | undefined {
  const variabele = (regels[i + 1] ?? '').trim()
  const font = (regels[i + 2] ?? '').trim()
  const breedte = Number((regels[i + 3] ?? '').trim())
  const hoogte = Number((regels[i + 4] ?? '').trim())
  const kleurbron = Number((regels[i + 5] ?? '').trim())
  const r = Number((regels[i + 6] ?? '').trim())
  const g = Number((regels[i + 7] ?? '').trim())
  const b = Number((regels[i + 8] ?? '').trim())
  const horizontaal = enh ? Number((regels[i + 9] ?? '').trim()) : 0
  if (!variabele || !font) return undefined
  if (GEEN_SCHERM.test(variabele) || PLAATFONT.test(font)) return undefined
  if (!Number.isFinite(breedte) || !Number.isFinite(hoogte) || breedte <= 0 || hoogte <= 0) {
    return undefined
  }
  const klem = (waarde: number): number =>
    Number.isFinite(waarde) ? Math.min(255, Math.max(0, waarde)) : 0
  const [rood, groen, blauw] = [klem(r), klem(g), klem(b)]
  const mono = kleurbron === 0
  const tekstkleur = mono ? `rgb(${rood}, ${groen}, ${blauw})` : kleurUitFont(font)
  return {
    variabele,
    font,
    breedte,
    hoogte,
    tekstkleur,
    achtergrond: achtergrondBij(font, rood, groen, blauw, mono),
    uitlijning: horizontaal === 1 ? 'links' : horizontaal === 2 ? 'rechts' : 'midden',
    kleurcode: `${kleurbron}|${rood},${groen},${blauw}`
  }
}

/** De schermpjes uit een model.cfg, op volgorde. */
export function schermenVanModel(modelcfg: string): Schermvak[] {
  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return []
  }
  const vakken: Schermvak[] = []
  /*
   * Een variabele die al een schermpje heeft, staat er een tweede keer in voor
   * een ander onderdeel van het model -- niet voor een tweede regel.
   */
  const gezien = new Set<string>()
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop !== '[texttexture]' && kop !== '[texttexture_enh]') continue
    const vak = vakVan(regels, i, kop === '[texttexture_enh]')
    if (!vak || gezien.has(vak.variabele.toLowerCase())) continue
    gezien.add(vak.variabele.toLowerCase())
    vakken.push(vak)
  }
  return vakken
}

/** De naam zonder zijn regelnummer: "afr_display_1" en "LAWO_display_line3" worden gelijk. */
function stam(naam: string): string {
  return naam.replace(/(_?(line|zeile|row|regel)?_?\d+|_[AB])$/i, '').toLowerCase()
}

/**
 * Een knop in de cabine, zoals het model hem beschrijft.
 *
 * Elke knop die je in OMSI met de muis kunt indrukken is in de `model.cfg` een
 * `[mouseevent]` met de naam waar het busscript op luistert, vlak onder het
 * onderdeel waar hij bij hoort. Dat onderdeel heet meestal naar de knop --
 * `O550_AFR200_Ticket_Kind_Kurz.o3d`, `Matrix_Bedienteil_CE.o3d` -- en daarmee
 * is te zien welke toets welke knop op het paneel is, zonder te raden.
 */
export interface Modelknop {
  /** De naam waar het busscript op luistert; ook de naam in `keyboard.cfg`. */
  actie: string
  /** Het onderdeel waar hij aan hangt, zoals het in de cfg staat. */
  onderdeel: string
}

/** De knoppen uit een model.cfg, in de volgorde van het bestand. */
export function knoppenVanModel(modelcfg: string): Modelknop[] {
  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return []
  }
  const knoppen: Modelknop[] = []
  const gezien = new Set<string>()
  let onderdeel = ''
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop === '[mesh]') {
      onderdeel = (regels[i + 1] ?? '').trim()
      continue
    }
    if (kop !== '[mouseevent]') continue
    const actie = (regels[i + 1] ?? '').trim()
    if (!actie || gezien.has(actie.toLowerCase())) continue
    gezien.add(actie.toLowerCase())
    knoppen.push({ actie, onderdeel })
  }
  return knoppen
}

/** Waar twee namen het over eens zijn. */
function gemeenschappelijk(a: string, b: string): string {
  let n = 0
  while (n < a.length && n < b.length && a[n].toLowerCase() === b[n].toLowerCase()) n++
  return a.slice(0, n)
}

/**
 * Welke schermpjes bij hetzelfde apparaat horen.
 *
 * Een apparaat tekent zijn regels in hetzelfde lettertype op even grote stukjes
 * textuur, en de bouwer zet ze onder elkaar in de cfg met namen die op elkaar
 * lijken: `afr_display_1` en `_2`, `LAWO_display_line1` tot en met `4`. De
 * regel is dus: op elkaar volgend, zelfde lettertype, zelfde afmeting, en dan
 * ofwel dezelfde naam op het regelnummer na -- dan mag de kleur verschillen,
 * want dat is een tweede kleurlaag van hetzelfde veld -- ofwel dezelfde kleur
 * met een gemeenschappelijk begin van minstens vier tekens.
 */
export function apparatenVan(vakken: Schermvak[]): Busapparaat[] {
  const apparaten: Busapparaat[] = []
  let laatste: Schermvak | undefined
  for (const vak of vakken) {
    const vorige = apparaten[apparaten.length - 1]
    const zelfdeVorm =
      vorige && laatste && vorige.font === vak.font && vorige.breedte === vak.breedte && vorige.hoogte === vak.hoogte
    const zelfdeStam = laatste && stam(laatste.variabele) === stam(vak.variabele)
    const zelfdeKleur = laatste && laatste.kleurcode === vak.kleurcode
    const samen = laatste ? gemeenschappelijk(laatste.variabele, vak.variabele) : ''
    if (vorige && zelfdeVorm && (zelfdeStam || (zelfdeKleur && samen.length >= 4))) {
      if (!vorige.variabelen.includes(vak.variabele)) vorige.variabelen.push(vak.variabele)
      const naam = gemeenschappelijk(vorige.naam, vak.variabele)
      if (naam.length >= 3) vorige.naam = naam.replace(/[_\s-]+$/, '')
      laatste = vak
      continue
    }
    apparaten.push({
      soort: soortVan(vak.variabele, vak.font),
      naam: vak.variabele,
      font: vak.font,
      breedte: vak.breedte,
      hoogte: vak.hoogte,
      tekstkleur: vak.tekstkleur,
      achtergrond: vak.achtergrond,
      uitlijning: vak.uitlijning,
      variabelen: [vak.variabele]
    })
    laatste = vak
  }
  /* De IBIS en de kaartautomaat bovenaan; de rest in de volgorde van de cfg. */
  const gewicht = (soort: Apparaatsoort): number =>
    soort === 'ibis' ? 0 : soort === 'kaartautomaat' ? 1 : 2
  return apparaten
    .map((apparaat, plek) => ({ apparaat, plek }))
    .sort((a, b) => gewicht(a.apparaat.soort) - gewicht(b.apparaat.soort) || a.plek - b.plek)
    .map((rij) => rij.apparaat)
}

/**
 * De weg van "welke bus rijdt er" naar zijn model.cfg.
 *
 * De plugin geeft door wat er in het geheugen van OMSI staat: de map van de
 * bus, het modelbestand, en als het er staat het `.bus`-bestand zelf. Wat
 * daarvan gevuld is verschilt, en of een pad met of zonder de OMSI-map ervoor
 * staat ook -- dus worden ze alle drie geprobeerd.
 */
export function modelcfgVanBus(
  omsiPad: string,
  bus: { pad?: string; model?: string; bestand?: string } | undefined
): string | undefined {
  if (!bus) return undefined
  const heel = (deel: string): string => (isAbsolute(deel) ? deel : join(omsiPad, deel))
  const stukken = (deel: string): string[] => deel.split(/[\\/]+/).filter(Boolean)

  if (bus.pad && bus.model) {
    const pad = isAbsolute(bus.pad)
      ? join(bus.pad, ...stukken(bus.model))
      : join(omsiPad, ...stukken(bus.pad), ...stukken(bus.model))
    if (existsSync(pad)) return pad
  }
  if (bus.model) {
    const pad = heel(bus.model)
    if (existsSync(pad)) return pad
  }
  if (bus.bestand) {
    const busPad = heel(bus.bestand)
    if (existsSync(busPad)) return modelVanBus(busPad)
  }
  return undefined
}

/** De apparaten van de bus die nu rijdt; leeg als de model.cfg niet te vinden is. */
export function apparatenVanBus(
  omsiPad: string,
  bus: { pad?: string; model?: string; bestand?: string } | undefined
): Busapparaat[] {
  const modelcfg = modelcfgVanBus(omsiPad, bus)
  return modelcfg ? apparatenVan(schermenVanModel(modelcfg)) : []
}
