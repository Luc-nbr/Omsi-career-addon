import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Dirent
} from 'node:fs'
import { basename, dirname, join, parse, relative, resolve, sep } from 'node:path'
import { schrijfVeilig } from './veilig'
import { openZip, veiligPad, type Zip } from './zip'

/*
 * De add-on-manager: add-ons installeren, bijhouden en weer weghalen.
 *
 * WAAROM DIT ER IS
 * Een add-on voor OMSI installeren is een zip uitpakken en de mappen op de
 * goede plek zetten -- en daar gaat het vaak mis. De ene zip heeft een map
 * `OMSI 2` eromheen, de andere begint meteen met `Vehicles`, een derde is
 * alleen de busmap zelf. Wat er overschreven wordt, ziet niemand, en weghalen
 * kan alleen als je nog weet welke bestanden erbij hoorden. Luc (stap 7): de
 * add-on-manager uit de Bus Company Simulator, met foutcontrole, maar zonder
 * downloadlijst -- je installeert wat je zelf gedownload hebt.
 *
 * WAT HIER STAAT
 * - een bron lezen: een zip of een uitgepakte map;
 * - per bestand bepalen waar het in de OMSI-map hoort (`plaatsVan`);
 * - een plan: wat is nieuw, wat staat er al precies zo, wat wordt overschreven;
 * - installeren, met een reservekopie van wat overschreven wordt;
 * - een register van wat elke add-on neerzette;
 * - verwijderen: alleen wat nog is zoals wij het neerzetten, en wat
 *   overschreven was komt terug.
 *
 * Alles synchroon per bestand, en de lussen staan in het hoofdproces met
 * pauzes ertussen (zie main), zodat een kaart van een paar gigabyte de app
 * niet stillegt.
 */

/* ---- de bron ---- */

export interface BronBestand {
  /** Pad in de bron, met schuine strepen naar rechts. */
  pad: string
  grootte: number
}

export interface Bron {
  naam: string
  soort: 'zip' | 'map'
  /** Alleen wat bruikbaar is: veilige namen, zonder rommel. */
  bestanden: BronBestand[]
  /**
   * Namen die buiten de map zouden uitkomen of op Windows niet mogen (zie
   * `veiligPad`), zoals ze in de bron staan. Die komen nergens in een plan.
   */
  geweigerd: string[]
  /** Hoeveel bestanden rommel waren (`__MACOSX`, `Thumbs.db`, ...). */
  rommel: number
  lees(bestand: BronBestand): Buffer
  /** Kopieer naar een pad op schijf; bij een map zonder het in het geheugen te laden. */
  kopieer(bestand: BronBestand, naar: string): void
  sluit(): void
}

/**
 * Wat een ander systeem of de verkenner in een map achterlaat, en wat nooit in
 * OMSI hoort: de metadata van een Mac (`__MACOSX/`, `._naam`, `.DS_Store`) en
 * de plaatjescache en mapinstellingen van Windows (`Thumbs.db`, `desktop.ini`).
 * Een `desktop.ini` in een map van OMSI verandert hoe de verkenner die map
 * toont; een `._`-bestand naast een textuur is geen textuur.
 */
export function isRommel(pad: string): boolean {
  return pad.split('/').some((deel) => {
    const klein = deel.toLowerCase()
    return (
      klein === '__macosx' ||
      klein === '.ds_store' ||
      klein === 'thumbs.db' ||
      klein === 'desktop.ini' ||
      deel.startsWith('._')
    )
  })
}

/** De bestanden van een bron gesplitst in bruikbaar, geweigerd en rommel. */
function schift(
  ruw: Array<{ naam: string; grootte: number }>
): { bestanden: Array<BronBestand & { naam: string }>; geweigerd: string[]; rommel: number } {
  const bestanden: Array<BronBestand & { naam: string }> = []
  const geweigerd: string[] = []
  let rommel = 0
  for (const b of ruw) {
    const pad = veiligPad(b.naam)
    if (!pad) geweigerd.push(b.naam)
    else if (isRommel(pad)) rommel += 1
    else bestanden.push({ pad, grootte: b.grootte, naam: b.naam })
  }
  return { bestanden, geweigerd, rommel }
}

function allesIn(map: string): Array<{ naam: string; grootte: number }> {
  const uit: Array<{ naam: string; grootte: number }> = []
  const loop = (hier: string): void => {
    let inhoud: Dirent[]
    try {
      inhoud = readdirSync(hier, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of inhoud) {
      const vol = join(hier, item.name)
      if (item.isDirectory()) loop(vol)
      else if (item.isFile()) {
        uit.push({ naam: relative(map, vol).split(sep).join('/'), grootte: statSync(vol).size })
      }
    }
  }
  loop(map)
  return uit
}

export function openBron(pad: string): Bron {
  if (statSync(pad).isDirectory()) {
    const { bestanden, geweigerd, rommel } = schift(allesIn(pad))
    const opNaam = new Map(bestanden.map((b) => [b.pad, b.naam]))
    const vol = (b: BronBestand): string => join(pad, ...(opNaam.get(b.pad) ?? b.pad).split('/'))
    return {
      naam: basename(pad),
      soort: 'map',
      bestanden: bestanden.map((b) => ({ pad: b.pad, grootte: b.grootte })),
      geweigerd,
      rommel,
      lees: (b) => readFileSync(vol(b)),
      kopieer: (b, naar) => copyFileSync(vol(b), naar),
      sluit: () => undefined
    }
  }
  const zip: Zip = openZip(pad)
  const { bestanden, geweigerd, rommel } = schift(zip.bestanden)
  // Op het veilige pad, want dat is wat het plan kent; de zip kent de ruwe naam.
  const perNaam = new Map(zip.bestanden.map((b) => [b.naam, b]))
  const perPad = new Map(bestanden.map((b) => [b.pad, perNaam.get(b.naam)!]))
  return {
    naam: basename(pad).replace(/\.zip$/i, ''),
    soort: 'zip',
    bestanden: bestanden.map((b) => ({ pad: b.pad, grootte: b.grootte })),
    geweigerd,
    rommel,
    lees: (b) => zip.lees(perPad.get(b.pad)!),
    kopieer: (b, naar) => writeFileSync(naar, zip.lees(perPad.get(b.pad)!)),
    sluit: () => zip.sluit()
  }
}

/* ---- waar hoort het ---- */

/**
 * De mappen die direct in de OMSI-map staan en waar add-ons in thuishoren, met
 * de schrijfwijze die OMSI zelf gebruikt. Een map met een andere naam komt er
 * niet vanzelf bij: een `Readme`- of `Bilder`-map hoort niet in je OMSI.
 */
export const OMSI_MAPPEN = [
  'Vehicles',
  'maps',
  'Sceneryobjects',
  'Splines',
  'Fonts',
  'Texture',
  'Humans',
  'Drivers',
  'TicketPacks',
  'Money',
  'plugins',
  'Weather',
  'Trains',
  'Situations',
  'Sounds',
  'Scripts'
] as const
/*
 * Nagekeken aan Lucs Steam-OMSI (29-09, alleen gelezen): `Sounds` en `Scripts`
 * staan in de hoofdmap, met de geluiden en scripts van de AI-auto's
 * (`Sounds\AI_Cars`, `Scripts\AI_Cars`); een AI-pakket dat daarin schrijft
 * kwam als "niet geplaatst" uit. `Gras` stond in de lijst, maar bestaat daar
 * niet -- de grastexturen staan in `Texture` -- en een zip met een map `Gras`
 * maakte er een nieuwe map naast Omsi.exe van, die OMSI nooit leest.
 */

const MAP_OP_NAAM = new Map<string, string>(OMSI_MAPPEN.map((m) => [m.toLowerCase(), m]))
/**
 * De OMSI-mappen die nooit ín een bus, kaart of object liggen. `Texture` en
 * `Fonts` niet: die heeft een bus of een object ook. `Sounds` en `Scripts`
 * evenmin: een object met zijn geluid in een map `Sounds` blijft een object.
 */
const PAKKET = new Set(
  OMSI_MAPPEN.filter((m) => !['Texture', 'Fonts', 'Sounds', 'Scripts'].includes(m)).map((m) => m.toLowerCase())
)

/*
 * Welke map een map is, aan de bestanden die er direct in staan.
 *
 * De volgorde telt: een map met een `global.cfg` is een kaart, ook als er
 * objecten naast liggen; een map met een `.bus` is een bus, ook met een
 * `.sco` erin. Daarna wat er het meest los verspreid wordt: objecten,
 * splines, mensen, kaartsets, en de soorten die OMSI plat in één map zet.
 *
 * `plat` is afgelezen aan een echte OMSI-map (Lucs Steam-installatie, 28-09,
 * alleen gelezen): `Weather`, `Fonts`, `Drivers`, `Trains` en `Situations`
 * hebben geen submappen maar alleen losse bestanden -- 709 `.oft` in Fonts,
 * 9 `.owt` in Weather, 60 `.zug` in Trains. Een weerbestand in
 * `Weather\MijnWeer\` ziet OMSI niet. `Sceneryobjects`, `Splines`,
 * `Humans`, `TicketPacks` en `Money` hebben er wel een map per pakket.
 * Bij de platte soorten gaan alleen de bestanden die erbij horen mee (`mee`);
 * een leesmij naast een `.owt` komt niet in `Weather`.
 */
const SOORTEN: Array<{ ext: RegExp; map: string; plat?: boolean; mee?: RegExp }> = [
  { ext: /^global\.cfg$/i, map: 'maps' },
  { ext: /\.(bus|ovh)$/i, map: 'Vehicles' },
  { ext: /\.sco$/i, map: 'Sceneryobjects' },
  { ext: /\.sli$/i, map: 'Splines' },
  { ext: /\.hum$/i, map: 'Humans' },
  { ext: /\.otp$/i, map: 'TicketPacks' },
  { ext: /\.zug$/i, map: 'Trains', plat: true, mee: /\.zug$/i },
  { ext: /\.osn$/i, map: 'Situations', plat: true, mee: /\.(osn|owt|dsc|dds|jpg)$/i },
  { ext: /\.owt$/i, map: 'Weather', plat: true, mee: /\.(owt|dsc)$/i },
  { ext: /\.oft$/i, map: 'Fonts', plat: true, mee: /\.(oft|bmp|tga|png|dds)$/i },
  { ext: /\.odr$/i, map: 'Drivers', plat: true, mee: /\.(odr|bmp|jpg|png)$/i },
  // Een plugin: de .opl zegt dat het er een is; een losse .dll kan van alles zijn.
  { ext: /\.opl$/i, map: 'plugins', plat: true, mee: /\.(dll|opl|ini|cfg)$/i }
]

/**
 * Waar elk bestand van de bron in de OMSI-map komt, of `undefined` als het er
 * niet in hoort (een leesmij, plaatjes van de maker).
 *
 * In deze volgorde:
 * 1. Een map met een bestand dat zegt wat hij is (`SOORTEN`): een `.bus` of
 *    `.ovh` maakt een busmap, en die hoort in `Vehicles`; een `global.cfg`
 *    maakt een kaart voor `maps`; een `.sco` een objectenpakket voor
 *    `Sceneryobjects`, enzovoort. Veel add-ons komen zo, als alleen hun
 *    eigen map -- of zelfs als losse bestanden zonder map; dan krijgt het
 *    pakket de naam van de add-on (`naam`).
 * 2. Anders: staat er een bekende OMSI-map in het pad -- `OMSI 2/Vehicles/...`,
 *    `Mijn bus v2/Vehicles/...` -- dan begint het daar.
 *
 * De eerste regel geldt alleen voor mappen die niet al onder een bekende
 * OMSI-map staan, en gaat voor als hij dieper zou knippen: de map `Texture`
 * IN een busmap is de textuurmap van die bus, niet die van OMSI. Van twee
 * zulke mappen in elkaar wint de buitenste: een map `objects` met een `.sco`
 * in een busmap hoort bij de bus.
 *
 * Tot 28-09 kende de eerste regel alleen bussen en kaarten, en kwam een zip
 * met alleen objecten, splines, weer of lettertypen als "niet geplaatst" uit.
 */
export function plaatsVan(paden: string[], naam = 'Add-on'): Map<string, string> {
  const uit = new Map<string, string>()
  const delen = paden.map((p) => p.split('/').filter(Boolean))

  // Per map de sterkste soort die er direct in staat, en welke submappen hij heeft.
  const soortVan = new Map<string, number>()
  const submappen = new Map<string, Set<string>>()
  for (const d of delen) {
    for (let n = 0; n < d.length - 1; n++) {
      const k = d.slice(0, n).join('/')
      if (!submappen.has(k)) submappen.set(k, new Set())
      submappen.get(k)!.add(d[n].toLowerCase())
    }
    const bestand = d[d.length - 1]
    const soort = SOORTEN.findIndex((s) => s.ext.test(bestand))
    if (soort < 0) continue
    const boven = d.slice(0, -1)
    if (boven.some((s) => MAP_OP_NAAM.has(s.toLowerCase()))) continue
    const sleutel = boven.join('/')
    const had = soortVan.get(sleutel)
    if (had === undefined || soort < had) soortVan.set(sleutel, soort)
  }
  /*
   * Een map met naast zijn `.sco` ook een map `Vehicles` of `Splines` is geen
   * objectenpakket maar een verzameling: dan geldt regel 2 voor wat eronder
   * staat (zo doet openOMSI het ook). `Texture` en `Fonts` tellen niet mee:
   * die heeft een bus of een object ook. Een kaart blijft een kaart.
   */
  const verzameling = (k: string, soort: number): boolean =>
    SOORTEN[soort].map !== 'maps' && [...(submappen.get(k) ?? [])].some((s) => PAKKET.has(s))
  for (const [k, soort] of soortVan) if (verzameling(k, soort)) soortVan.delete(k)
  // Alleen de buitenste; de lege sleutel is de bron zelf en ligt om alles heen.
  const binnen = (k: string, om: string): boolean => (om === '' ? k !== '' : k.startsWith(`${om}/`))
  const eigen = [...soortVan.entries()].filter(([k]) => ![...soortVan.keys()].some((om) => binnen(k, om)))

  paden.forEach((pad, i) => {
    const d = delen[i]
    const onder = eigen.find(([k]) => k === '' || pad.startsWith(`${k}/`))
    if (onder) {
      const [k, nr] = onder
      const soort = SOORTEN[nr]
      const map = k === '' ? [] : k.split('/')
      const rest = d.slice(map.length)
      if (soort.plat) {
        // Plat: alleen wat er direct in staat en erbij hoort.
        if (rest.length === 1 && soort.mee!.test(rest[0])) uit.set(pad, [soort.map, rest[0]].join('/'))
        return
      }
      uit.set(pad, [soort.map, map[map.length - 1] ?? naam, ...rest].join('/'))
      return
    }
    const at = d.findIndex((s, n) => n < d.length - 1 && MAP_OP_NAAM.has(s.toLowerCase()))
    if (at >= 0) uit.set(pad, [MAP_OP_NAAM.get(d[at].toLowerCase())!, ...d.slice(at + 1)].join('/'))
  })
  return uit
}

/**
 * De naam van de add-on als mapnaam, voor losse bestanden zonder eigen map.
 *
 * De naam komt uit de bestandsnaam van de zip, en die mag op Windows dingen
 * die een map niet mag: `Bomen v1..zip` gaf `Bomen v1.` en `Bomen .zip` gaf
 * `Bomen ` -- een naam die op een punt of spatie eindigt, en die `veiligPad`
 * terecht weigert. Dan werd elk los bestand "geweigerd", met de uitleg dat de
 * namen buiten de OMSI-map wezen. Nu: punten en spaties aan het eind weg,
 * verboden tekens een liggend streepje, en wat daarna nog niet mag (`CON`,
 * niets) wordt `Add-on`.
 */
export function pakketNaam(naam: string): string {
  // eslint-disable-next-line no-control-regex
  const schoon = naam.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim()
  return schoon && veiligPad(schoon) === schoon ? schoon : 'Add-on'
}

/*
 * PROGRAMMACODE
 *
 * Een plugin (`.dll` met zijn `.opl`) is programmacode die OMSI bij het
 * starten zelf laadt, met alle rechten van het spel. Die komt er alleen bij
 * als de speler zegt dat hij de maker vertrouwt; tot 28-09 ging hij stil mee
 * naar `plugins`. Programma's en scripts die je zou kunnen dubbelklikken
 * horen nergens in OMSI thuis en worden nooit neergezet -- ook niet met het
 * vinkje. (Idee uit openOMSI, dat plugins uit een download apart zet.)
 */
export const IS_CODE = /\.(dll|opl)$/i
/*
 * Ook nooit: snelkoppelingen en bestanden waarvan de verkenner zelf een
 * pictogram of inhoud ophaalt (`.url`, `.scf`, `.library-ms`,
 * `.searchConnector-ms`, `.website`). Wie alleen de map opent, laat Windows
 * dan naar het pad in dat bestand gaan -- ook een netwerkpad als
 * `\\server\x.ico`, en daarbij stuurt Windows de aanmeldgegevens (de
 * NTLM-hash) mee. En programmacode die geen plugin is: `.jar`, `.msc`, `.inf`,
 * `.chm`, stuurprogramma's en ActiveX-onderdelen. (29-09, uit de tegenlezing.)
 */
export const NOOIT =
  /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|wsc|sct|hta|scr|pif|cpl|msi|msp|reg|lnk|url|scf|library-ms|searchconnector-ms|website|appref-ms|settingcontent-ms|application|jar|msc|inf|chm|sys|drv|ocx|diagcab)$/i

/**
 * Mag er op dit pad in de OMSI-map geschreven worden?
 *
 * Een laatste controle vlak voor het schrijven, wat het plan ook zegt: een
 * gewoon pad (`veiligPad`), in een van de OMSI-mappen en niet in de hoofdmap
 * van OMSI zelf, waar `Omsi.exe` en `options.cfg` staan. Het plan maakt zulke
 * paden niet, maar een plan kan uit een ouder register of een fout komen.
 */
export function magSchrijven(doel: string): boolean {
  return inOmsiMap(doel) && !NOOIT.test(doel)
}

/** Een gewoon pad onder een van de OMSI-mappen; ook voor wat een oudere versie neerzette. */
function inOmsiMap(doel: string): boolean {
  if (veiligPad(doel) !== doel) return false
  const d = doel.split('/')
  return d.length >= 2 && MAP_OP_NAAM.has(d[0].toLowerCase())
}

/* ---- het register ---- */

export type Herkomst = 'nieuw' | 'gelijk' | 'overschreven'

export interface AddonBestand {
  /** Pad ten opzichte van de OMSI-map, met schuine strepen naar rechts. */
  pad: string
  sha1: string
  /**
   * Hoe het was voor de installatie. `gelijk`: stond er al precies zo, en
   * blijft dus staan bij verwijderen. `overschreven`: er lag iets anders, en
   * dat staat in de reserve en komt terug.
   */
  was: Herkomst
}

export interface Addon {
  id: string
  naam: string
  bron: string
  geinstalleerd: string
  bestanden: AddonBestand[]
  /** De bussen en kaarten erin, voor de foutcontrole. */
  bussen: string[]
  kaarten: string[]
  /**
   * Een eigen kleurstelling uit de Lakstudio (lakstudio-ontwerp §5.6): die
   * staat niet in de gewone lijst en gaat alleen weg via de studio of
   * "Eigen kleurstellingen" (dan worden ook de foto's vergeten).
   */
  soort?: 'lak'
  lak?: AddonLak
}

export interface AddonLak {
  projectId: string
  /** De naam van de kleurstelling. */
  naam: string
  /** De bus waarop hij gemaakt is (relatief .bus-pad). */
  bus: string
  /** Alle .bus/.ovh/.sco die de naam dragen. */
  familie: string[]
  /** De CTC-mappen, ten opzichte van de OMSI-map (schuine strepen naar rechts). */
  ctcMappen: string[]
  nnnn: number
  versie: number
  /** Bestanden van een ander pakket die de .cti noemt (de start, §5.4 punt 5c). */
  afhankelijk: string[]
}

export interface Register {
  addons: Addon[]
}

export const registerPad = (userData: string): string => join(userData, 'addons.json')
export const reserveMap = (userData: string, id: string): string => join(userData, 'addon-reserve', id)

export function leesRegister(userData: string): Register {
  try {
    const r = JSON.parse(readFileSync(registerPad(userData), 'utf8')) as Register
    return Array.isArray(r.addons) ? r : { addons: [] }
  } catch {
    return { addons: [] }
  }
}

export function schrijfRegister(userData: string, register: Register): void {
  schrijfVeilig(registerPad(userData), JSON.stringify(register))
}

/* ---- het plan ---- */

export const sha1 = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex')

/**
 * Een pad in de OMSI-map zoals het op schijf staat, ongeacht hoofdletters.
 *
 * Windows kijkt niet naar hoofdletters en add-ons ook niet: de ene zip heeft
 * `vehicles`, de andere `Vehicles`. Op Windows is `existsSync` al ongevoelig;
 * dit zorgt dat een bestaande map met zijn eigen schrijfwijze gebruikt wordt,
 * ook op een schijf die wel kijkt (en in de proef).
 */
export function opSchijf(omsi: string, pad: string): string {
  let hier = omsi
  for (const deel of pad.split('/')) {
    const recht = join(hier, deel)
    if (existsSync(recht)) {
      hier = recht
      continue
    }
    let gevonden: string | undefined
    try {
      gevonden = readdirSync(hier).find((n) => n.toLowerCase() === deel.toLowerCase())
    } catch {
      gevonden = undefined
    }
    hier = join(hier, gevonden ?? deel)
  }
  return hier
}

/**
 * Hetzelfde, voor een pad waar geschreven of gewist gaat worden.
 *
 * `opSchijf` is ook de opzoeker van de foutcontrole, die paden uit de
 * bestanden van OMSI zelf volgt -- met `..` erin, en dat mag daar: lezen. Voor
 * schrijven niet: `join` haalt `..` gewoon weg, en `Vehicles/../../x` ligt
 * dan naast de OMSI-map. Wat hier binnenkomt is al door `veiligPad` gegaan,
 * maar dit is de plek waar het pad echt een pad wordt, dus hier nog eens.
 */
export function schrijfpad(omsi: string, pad: string): string {
  if (veiligPad(pad) !== pad) throw new Error(`Geen gewoon pad in de OMSI-map: ${pad}`)
  const hier = opSchijf(omsi, pad)
  if (!binnen(omsi, hier)) throw new Error(`Buiten de OMSI-map: ${pad}`)
  return hier
}

/** Ligt `pad` in `map` (en is het niet `map` zelf)? Op tekst, na `resolve`. */
export function binnen(map: string, pad: string): boolean {
  const basis = resolve(map).toLowerCase()
  const vol = resolve(pad).toLowerCase()
  return vol.startsWith(basis.endsWith(sep) ? basis : basis + sep)
}

export interface PlanRegel {
  bron: string
  doel: string
  grootte: number
  staat: 'nieuw' | 'gelijk' | 'anders'
  /** Bij `anders`: van welke add-on het bestand komt dat er nu staat, als we dat weten. */
  van?: string
  /** Bij `anders`: hoe groot wat er nu staat is; zo groot wordt de reservekopie. */
  grootteNu?: number
}

export interface Plan {
  naam: string
  /** Wat er neergezet wordt, zonder de programmacode. */
  regels: PlanRegel[]
  /** Plugins (`.dll`, `.opl`): alleen als de speler de maker vertrouwt. */
  code: PlanRegel[]
  /** Programma's en scripts (`.exe`, `.bat`, ...): nooit neergezet. */
  nooit: string[]
  /** Wat niet in de OMSI-map hoort: leesmij, plaatjes, onbekende mappen. */
  overig: string[]
  /** Namen die buiten de OMSI-map uitkwamen of op Windows niet mogen. */
  geweigerd: string[]
  /**
   * Bestanden die op dezelfde plek zouden komen als een eerder bestand uit
   * dezelfde bron (`Zomer/zon.owt` en `Winter/zon.owt` gaan allebei naar
   * `Weather/zon.owt`; `a.cfg` en `A.CFG` zijn op Windows één bestand). Het
   * eerste gaat mee, deze niet.
   */
  dubbel: string[]
  /** Bestanden waarvan het pad in de OMSI-map te lang wordt voor OMSI (zie `MAX_PAD`). */
  teLang: string[]
  /** Hoeveel rommelbestanden (`__MACOSX`, `Thumbs.db`, ...) er overgeslagen zijn. */
  rommel: number
  /** Samenvatting per plek: `Vehicles/MAN_NL202` met het aantal bestanden. */
  plekken: Array<{ plek: string; bestanden: number; bytes: number }>
  bussen: string[]
  kaarten: string[]
}

/*
 * OMSI is een 32-bits programma dat geen lange paden kent: een pad van 260
 * tekens of meer (MAX_PATH, met het afsluitende nulteken) kan het niet openen.
 * Node schrijft zo'n bestand wel (met `\\?\` ervoor), en dan staat het er
 * zonder dat OMSI het ooit vindt -- een grijs blok of een ontbrekend geluid,
 * en niemand die ziet waarom. Het plan zet ze apart.
 */
export const MAX_PAD = 259

/** De plek van een doelpad: de eerste twee mappen (`Vehicles/MAN_NL202`). */
function plekVan(doel: string): string {
  const d = doel.split('/')
  return d.length > 2 ? d.slice(0, 2).join('/') : d[0]
}

/**
 * Wat een installatie zou doen. Leest van elk bestand dat er al staat de
 * inhoud om te zien of het gelijk is; wie dat voor een kaart van duizenden
 * bestanden doet, roept dit via `planStappen` aan zodat het in stukken kan.
 */
export function* planStappen(bron: Bron, omsi: string, register: Register): Generator<number, Plan> {
  const nooit = bron.bestanden.filter((b) => NOOIT.test(b.pad)).map((b) => b.pad)
  const bruikbaar = bron.bestanden.filter((b) => !NOOIT.test(b.pad))
  const plaats = plaatsVan(bruikbaar.map((b) => b.pad), pakketNaam(bron.naam))
  const eigenaar = new Map<string, string>()
  for (const a of register.addons) for (const b of a.bestanden) eigenaar.set(b.pad.toLowerCase(), a.naam)

  const regels: PlanRegel[] = []
  const code: PlanRegel[] = []
  const overig: string[] = []
  const geweigerd = [...bron.geweigerd]
  const dubbel: string[] = []
  const teLang: string[] = []
  /*
   * Elk doel één keer, zonder op hoofdletters te letten (zoals Windows). Twee
   * bronbestanden met hetzelfde doel schreven eerst allebei: het tweede
   * maakte een "reservekopie" van het eerste, net neergezette, en bij
   * verwijderen kwam die terug -- een bestand van de add-on dat bleef staan,
   * met de melding "gewijzigd".
   */
  const doelen = new Set<string>()
  let n = 0
  for (const b of bruikbaar) {
    const doel = plaats.get(b.pad)
    if (!doel) {
      overig.push(b.pad)
      continue
    }
    if (!magSchrijven(doel)) {
      geweigerd.push(b.pad)
      continue
    }
    if (doelen.has(doel.toLowerCase())) {
      dubbel.push(b.pad)
      continue
    }
    doelen.add(doel.toLowerCase())
    const opPad = schrijfpad(omsi, doel)
    if (resolve(opPad).length > MAX_PAD) {
      teLang.push(b.pad)
      continue
    }
    let staat: PlanRegel['staat'] = 'nieuw'
    let grootteNu: number | undefined
    if (existsSync(opPad)) {
      const bestaand = statSync(opPad)
      staat = bestaand.size === b.grootte && sha1(readFileSync(opPad)) === sha1(bron.lees(b)) ? 'gelijk' : 'anders'
      if (staat === 'anders') grootteNu = bestaand.size
    }
    const regel: PlanRegel = {
      bron: b.pad,
      doel,
      grootte: b.grootte,
      staat,
      van: staat === 'anders' ? eigenaar.get(doel.toLowerCase()) : undefined,
      grootteNu
    }
    ;(IS_CODE.test(doel) ? code : regels).push(regel)
    if (++n % 50 === 0) yield n
  }

  const plekken = new Map<string, { bestanden: number; bytes: number }>()
  for (const r of regels) {
    const p = plekken.get(plekVan(r.doel)) ?? { bestanden: 0, bytes: 0 }
    p.bestanden += 1
    p.bytes += r.grootte
    plekken.set(plekVan(r.doel), p)
  }
  const mappen = (soort: string, test: RegExp): string[] => [
    ...new Set(
      regels
        .filter((r) => r.doel.toLowerCase().startsWith(`${soort.toLowerCase()}/`) && test.test(r.doel))
        .map((r) => r.doel.split('/')[1])
    )
  ]
  return {
    naam: bron.naam,
    regels,
    code,
    nooit,
    overig,
    geweigerd,
    dubbel,
    teLang,
    rommel: bron.rommel,
    plekken: [...plekken.entries()].map(([plek, v]) => ({ plek, ...v })).sort((a, b) => b.bytes - a.bytes),
    bussen: mappen('Vehicles', /\.(bus|ovh)$/i),
    kaarten: mappen('maps', /\/global\.cfg$/i)
  }
}

/* ---- ruimte ---- */

/**
 * Hoeveel er vrij is op de schijf waar `pad` op staat, in bytes; `undefined`
 * als dat niet te zeggen is. Een map die er nog niet is, telt voor de eerste
 * map erboven die er wel is.
 */
export function vrijeRuimte(pad: string): number | undefined {
  let hier = resolve(pad)
  while (!existsSync(hier)) {
    const boven = dirname(hier)
    if (boven === hier) return undefined
    hier = boven
  }
  try {
    const s = statfsSync(hier)
    return s.bavail * s.bsize
  } catch {
    return undefined
  }
}

/*
 * Zoveel blijft er na een installatie minstens vrij: een twintigste van wat er
 * bij komt, en nooit minder dan een kwart gigabyte. OMSI schrijft zelf ook
 * (logfile.txt, options.cfg), en Windows loopt slecht op een volle schijf.
 * (openOMSI houdt een halve gigabyte aan; daar gaat het om hele kaarten.)
 */
const MARGE_MIN = 256 * 1024 * 1024
const marge = (bytes: number): number => Math.max(Math.round(bytes / 20), MARGE_MIN)

export interface Schijfruimte {
  /** Waar het om gaat: de OMSI-map, of de reservekopie (of allebei op één schijf). */
  wat: 'omsi' | 'reserve' | 'samen'
  /** De schijf, zoals `D:\`. */
  schijf: string
  /** Wat er bij komt; dit toont het venster als "nodig". */
  bytes: number
  /** Met de marge erbij; hieraan wordt `vrij` getoetst. */
  nodig: number
  vrij?: number
  past: boolean
}

/**
 * Past deze installatie? Nodig op de schijf van OMSI is wat er geschreven
 * wordt (nieuw en overschreven); op de schijf van de gebruikersgegevens wat
 * er nu staat en overschreven wordt, want dat gaat eerst naar de reserve.
 * Staan ze op dezelfde schijf, dan telt het samen. `vrij` is er om de proef
 * een volle schijf te kunnen laten zien.
 */
export function ruimteVoor(
  plan: Plan,
  omsi: string,
  userData: string,
  metCode = false,
  vrij: (pad: string) => number | undefined = vrijeRuimte
): { schijven: Schijfruimte[]; past: boolean } {
  const alles = metCode ? [...plan.regels, ...plan.code] : plan.regels
  const schrijven = alles.filter((r) => r.staat !== 'gelijk').reduce((som, r) => som + r.grootte, 0)
  const reserve = alles.filter((r) => r.staat === 'anders').reduce((som, r) => som + (r.grootteNu ?? r.grootte), 0)
  const schijfVan = (pad: string): string => parse(resolve(pad)).root.toUpperCase()
  const maak = (wat: Schijfruimte['wat'], pad: string, bytes: number): Schijfruimte => {
    const nodig = bytes > 0 ? bytes + marge(bytes) : 0
    const v = nodig > 0 ? vrij(pad) : undefined
    return { wat, schijf: schijfVan(pad), bytes, nodig, vrij: v, past: nodig === 0 || v === undefined || nodig <= v }
  }
  const schijven =
    schijfVan(omsi) === schijfVan(userData)
      ? [maak(reserve > 0 ? 'samen' : 'omsi', omsi, schrijven + reserve)]
      : [maak('omsi', omsi, schrijven), maak('reserve', userData, reserve)].filter((s) => s.nodig > 0 || s.wat === 'omsi')
  return { schijven, past: schijven.every((s) => s.past) }
}

/** Een generator helemaal aflopen, voor wie niet in stukken hoeft (de proef). */
export function loopAf<T>(stappen: Generator<unknown, T>): T {
  for (;;) {
    const s = stappen.next()
    if (s.done) return s.value
  }
}

/* ---- installeren ---- */

export interface Installatie {
  addon: Addon
  geschreven: number
  overschreven: number
  /** Hoeveel plugins (`.dll`/`.opl`) er met de rest mee gingen. */
  code: number
}

/**
 * Een installatie die niet af kon, en die daarom helemaal teruggedraaid is.
 * `ruimte`: de schijf liep vol (ENOSPC). `teruggedraaid` is false als het
 * terugzetten zelf ook niet lukte; dan staat de reserve er nog.
 */
export class InstallatieFout extends Error {
  constructor(
    readonly soort: 'ruimte' | 'fout',
    melding: string,
    readonly teruggedraaid: boolean
  ) {
    super(melding)
  }
}

/**
 * Installeren volgens een plan. Wat anders was, gaat eerst naar de reserve van
 * deze add-on; daarna pas wordt het overschreven. Het register wordt aan het
 * eind in één keer geschreven, door de aanroeper, met `registreer`.
 *
 * Plugins gaan alleen mee met `metCode` (de speler vertrouwt de maker).
 *
 * Gaat er halverwege iets mis -- een volle schijf, een bestand dat vastzit --
 * dan wordt alles wat deze installatie al deed teruggedraaid: nieuwe bestanden
 * weg, overschreven bestanden terug uit de reserve, lege mappen weg. Tot 28-09
 * bleef er dan een halve add-on staan zonder dat het register hem kende, en
 * was er niets meer om te verwijderen.
 */
export function* installeerStappen(
  bron: Bron,
  plan: Plan,
  omsi: string,
  userData: string,
  nu = new Date(),
  opties: { metCode?: boolean } = {}
): Generator<number, Installatie> {
  const id = `${nu.getTime().toString(36)}-${sha1(Buffer.from(plan.naam)).slice(0, 6)}`
  const perPad = new Map(bron.bestanden.map((b) => [b.pad, b]))
  const bestanden: AddonBestand[] = []
  const regels = opties.metCode ? [...plan.regels, ...plan.code] : plan.regels
  // Wat al gedaan is, om terug te kunnen: het pad op schijf, en of er een reserve van is.
  const gedaan: Array<{ doel: string; reserve?: string }> = []
  // Ook hier elk doel één keer; zie `doelen` in `planStappen`.
  const al = new Set<string>()
  let geschreven = 0
  let overschreven = 0
  let code = 0
  try {
    for (const regel of regels) {
      const b = perPad.get(regel.bron)
      if (!b || !magSchrijven(regel.doel) || al.has(regel.doel.toLowerCase())) continue
      al.add(regel.doel.toLowerCase())
      const doel = schrijfpad(omsi, regel.doel)
      if (regel.staat === 'gelijk') {
        bestanden.push({ pad: regel.doel, sha1: sha1(readFileSync(doel)), was: 'gelijk' })
        continue
      }
      let was: Herkomst = 'nieuw'
      let reserve: string | undefined
      if (existsSync(doel)) {
        reserve = join(reserveMap(userData, id), ...regel.doel.split('/'))
        mkdirSync(dirname(reserve), { recursive: true })
        copyFileSync(doel, reserve)
        was = 'overschreven'
        overschreven += 1
      }
      // Eerst noteren, dan schrijven: een half geschreven bestand moet ook terug.
      gedaan.push({ doel, reserve })
      mkdirSync(dirname(doel), { recursive: true })
      bron.kopieer(b, doel)
      bestanden.push({ pad: regel.doel, sha1: sha1(readFileSync(doel)), was })
      geschreven += 1
      if (IS_CODE.test(regel.doel)) code += 1
      if (geschreven % 25 === 0) yield geschreven
    }
  } catch (fout) {
    const teruggedraaid = draaiTerug(omsi, gedaan)
    if (teruggedraaid) rmSync(reserveMap(userData, id), { recursive: true, force: true })
    const vol = (fout as NodeJS.ErrnoException).code === 'ENOSPC'
    throw new InstallatieFout(vol ? 'ruimte' : 'fout', fout instanceof Error ? fout.message : String(fout), teruggedraaid)
  }
  return {
    addon: {
      id,
      naam: plan.naam,
      bron: bron.naam,
      geinstalleerd: nu.toISOString(),
      bestanden,
      bussen: plan.bussen,
      kaarten: plan.kaarten
    },
    geschreven,
    overschreven,
    code
  }
}

/**
 * Een halve installatie ongedaan maken, van achter naar voren: wat nieuw was
 * weg, wat overschreven was terug uit de reserve. Geeft terug of alles lukte.
 * Op een volle schijf lukt terugzetten meestal wel: het bestand dat half
 * geschreven werd, gaf zijn ruimte net terug.
 */
function draaiTerug(omsi: string, gedaan: Array<{ doel: string; reserve?: string }>): boolean {
  let gelukt = true
  const mappen = new Set<string>()
  for (const { doel, reserve } of [...gedaan].reverse()) {
    /*
     * De map van elk doel, ook als het bestand er (nog) niet is: de mappen
     * worden gemaakt vóór het schrijven, en een kapot bestand in de zip of
     * een volle schijf kan daartussen vallen. Dan bleef er een lege
     * `Vehicles/NieuweBus/model/...` staan. Alleen lege mappen gaan weg.
     */
    mappen.add(dirname(doel))
    try {
      if (reserve) copyFileSync(reserve, doel)
      else if (existsSync(doel)) unlinkSync(doel)
    } catch {
      gelukt = false
    }
  }
  ruimLegeMappenOp(omsi, mappen)
  return gelukt
}

/**
 * Een geslaagde installatie weer ongedaan maken, aan wat ze teruggaf: wat
 * nieuw was weg, wat overschreven was terug uit de reserve, en de reserve
 * weg als dat lukte. Voor als het register daarna niet geschreven kan worden.
 */
function draaiInstallatieTerug(omsi: string, userData: string, addon: Addon): boolean {
  const gedaan = addon.bestanden
    .filter((b) => b.was !== 'gelijk')
    .map((b) => ({
      doel: schrijfpad(omsi, b.pad),
      reserve: b.was === 'overschreven' ? join(reserveMap(userData, addon.id), ...b.pad.split('/')) : undefined
    }))
  const gelukt = draaiTerug(omsi, gedaan)
  if (gelukt) rmSync(reserveMap(userData, addon.id), { recursive: true, force: true })
  return gelukt
}

/**
 * Een installatie in het register zetten.
 *
 * Lukte dat niet (een volle schijf in de gebruikersmap, een bestand dat
 * vastzat), dan stond de add-on wel in OMSI maar kende de app hem niet: niet in
 * de lijst, niet te verwijderen, en zijn reserve bleef liggen. Nu gaat de
 * installatie dan terug, en komt er een `InstallatieFout` zoals bij een
 * volle schijf tijdens het schrijven.
 */
export function registreer(userData: string, omsi: string, installatie: Installatie): void {
  try {
    const register = leesRegister(userData)
    schrijfRegister(userData, { addons: [...register.addons, installatie.addon] })
  } catch (fout) {
    const teruggedraaid = draaiInstallatieTerug(omsi, userData, installatie.addon)
    const vol = (fout as NodeJS.ErrnoException).code === 'ENOSPC'
    throw new InstallatieFout(vol ? 'ruimte' : 'fout', fout instanceof Error ? fout.message : String(fout), teruggedraaid)
  }
}

/** Lege mappen opruimen, van diep naar ondiep, tot aan de OMSI-mappen. */
function ruimLegeMappenOp(omsi: string, mappen: Set<string>): void {
  const grens = new Set([omsi, ...OMSI_MAPPEN.map((m) => opSchijf(omsi, m))].map((p) => p.toLowerCase()))
  const alle = new Set<string>()
  for (const m of mappen) {
    for (let hier = m; binnen(omsi, hier) && !grens.has(hier.toLowerCase()); hier = dirname(hier)) alle.add(hier)
  }
  for (const map of [...alle].sort((a, b) => b.length - a.length)) {
    try {
      if (readdirSync(map).length === 0) rmdirSync(map)
    } catch {
      // Niet leeg of al weg.
    }
  }
}

/* ---- controleren ---- */

/**
 * Het controlegedeelte van `verwijderStappen`, zonder iets aan te raken
 * (lakstudio-ontwerp §5.6, kritiek punt 16): welke bestanden zijn sinds de
 * installatie veranderd, en welke zijn weg. Eerst dit, dan pas iets weghalen
 * of opnieuw zetten.
 */
export function controleerStappen(addon: Addon, omsi: string): { gewijzigd: string[]; weg: string[] } {
  const uit = { gewijzigd: [] as string[], weg: [] as string[] }
  for (const b of addon.bestanden) {
    if (!inOmsiMap(b.pad)) continue
    const pad = schrijfpad(omsi, b.pad)
    if (!existsSync(pad)) uit.weg.push(b.pad)
    else if (sha1(readFileSync(pad)) !== b.sha1) uit.gewijzigd.push(b.pad)
  }
  return uit
}

/* ---- verwijderen ---- */

export interface Verwijdering {
  verwijderd: number
  teruggezet: number
  /** Nog nodig voor een andere add-on, of stond er al voor de installatie. */
  gebleven: number
  /** Sinds de installatie veranderd: niet van ons meer, dus niet aangeraakt. */
  gewijzigd: string[]
}

/**
 * Een add-on weghalen. Per bestand:
 * - veranderd sinds de installatie: laten staan (iemand heeft het aangepast);
 * - overschreven bij de installatie: de reserve terugzetten;
 * - stond er al precies zo, of een andere add-on gebruikt het ook: laten staan;
 * - anders: weg.
 * Mappen die daarna leeg zijn, gaan ook weg -- maar nooit de OMSI-mappen zelf.
 */
export function* verwijderStappen(
  addon: Addon,
  register: Register,
  omsi: string,
  userData: string
): Generator<number, Verwijdering> {
  const anderen = new Set<string>()
  for (const a of register.addons) {
    if (a.id !== addon.id) for (const b of a.bestanden) anderen.add(b.pad.toLowerCase())
  }
  const uit: Verwijdering = { verwijderd: 0, teruggezet: 0, gebleven: 0, gewijzigd: [] }
  const mappen = new Set<string>()
  let n = 0
  for (const b of addon.bestanden) {
    if (++n % 50 === 0) yield n
    // Een register uit een oudere versie kende de controle op paden nog niet.
    if (!inOmsiMap(b.pad)) continue
    const pad = schrijfpad(omsi, b.pad)
    if (!existsSync(pad)) continue
    if (sha1(readFileSync(pad)) !== b.sha1) {
      uit.gewijzigd.push(b.pad)
      continue
    }
    if (b.was === 'overschreven') {
      const reserve = join(reserveMap(userData, addon.id), ...b.pad.split('/'))
      if (existsSync(reserve)) {
        copyFileSync(reserve, pad)
        uit.teruggezet += 1
        continue
      }
    }
    if (b.was === 'gelijk' || anderen.has(b.pad.toLowerCase())) {
      uit.gebleven += 1
      continue
    }
    unlinkSync(pad)
    uit.verwijderd += 1
    mappen.add(dirname(pad))
  }

  ruimLegeMappenOp(omsi, mappen)
  return uit
}

/**
 * Lege mappen opruimen na een verwijdering buiten `verwijderStappen` om (een
 * wees van de Lakstudio, of "alles weghalen" na een handmatige wijziging); nooit
 * de OMSI-mappen zelf.
 */
export function ruimMappenOp(omsi: string, mappen: Iterable<string>): void {
  ruimLegeMappenOp(omsi, new Set(mappen))
}
