import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Dirent
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { schrijfVeilig } from './veilig'
import { openZip, type Zip } from './zip'

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
  bestanden: BronBestand[]
  lees(bestand: BronBestand): Buffer
  /** Kopieer naar een pad op schijf; bij een map zonder het in het geheugen te laden. */
  kopieer(bestand: BronBestand, naar: string): void
  sluit(): void
}

function allesIn(map: string): BronBestand[] {
  const uit: BronBestand[] = []
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
        uit.push({ pad: relative(map, vol).split(sep).join('/'), grootte: statSync(vol).size })
      }
    }
  }
  loop(map)
  return uit
}

export function openBron(pad: string): Bron {
  if (statSync(pad).isDirectory()) {
    return {
      naam: basename(pad),
      soort: 'map',
      bestanden: allesIn(pad),
      lees: (b) => readFileSync(join(pad, ...b.pad.split('/'))),
      kopieer: (b, naar) => copyFileSync(join(pad, ...b.pad.split('/')), naar),
      sluit: () => undefined
    }
  }
  const zip: Zip = openZip(pad)
  const perNaam = new Map(zip.bestanden.map((b) => [b.naam, b]))
  return {
    naam: basename(pad).replace(/\.zip$/i, ''),
    soort: 'zip',
    bestanden: zip.bestanden.map((b) => ({ pad: b.naam, grootte: b.grootte })),
    lees: (b) => zip.lees(perNaam.get(b.pad)!),
    kopieer: (b, naar) => writeFileSync(naar, zip.lees(perNaam.get(b.pad)!)),
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
  'Gras',
  'Weather'
] as const

const MAP_OP_NAAM = new Map(OMSI_MAPPEN.map((m) => [m.toLowerCase(), m]))

/**
 * Waar elk bestand van de bron in de OMSI-map komt, of `undefined` als het er
 * niet in hoort (een leesmij, plaatjes van de maker).
 *
 * In deze volgorde:
 * 1. Staat er een bekende OMSI-map in het pad -- `OMSI 2/Vehicles/...`,
 *    `Mijn bus v2/Vehicles/...` -- dan begint het daar.
 * 2. Anders: een map met een `.bus` of `.ovh` erin is een busmap, en die hoort
 *    in `Vehicles`; een map met een `global.cfg` is een kaart en hoort in
 *    `maps`. Veel bussen worden zo verspreid, als alleen hun eigen map.
 *
 * De tweede regel gaat vóór de eerste als hij dieper zou knippen: de map
 * `Texture` IN een busmap is de textuurmap van die bus, niet die van OMSI.
 */
export function plaatsVan(paden: string[]): Map<string, string> {
  const uit = new Map<string, string>()
  const delen = paden.map((p) => p.split('/').filter(Boolean))

  // Mappen die een bus of kaart zijn, en die niet al onder een bekende OMSI-map staan.
  const eigen = new Map<string, 'Vehicles' | 'maps'>()
  for (const d of delen) {
    const naam = d[d.length - 1].toLowerCase()
    const soort = /\.(bus|ovh)$/.test(naam) ? 'Vehicles' : naam === 'global.cfg' ? 'maps' : undefined
    if (!soort || d.length < 2) continue
    const boven = d.slice(0, -1)
    if (boven.some((s) => MAP_OP_NAAM.has(s.toLowerCase()))) continue
    // Een bus kan zijn .bus-bestanden in een submap hebben; de kortste map met zo'n bestand wint.
    const sleutel = boven.join('/')
    if (![...eigen.keys()].some((k) => sleutel.startsWith(`${k}/`))) eigen.set(sleutel, soort)
  }

  paden.forEach((pad, i) => {
    const d = delen[i]
    const onder = [...eigen.entries()].find(([k]) => pad.startsWith(`${k}/`))
    if (onder) {
      const [k, soort] = onder
      const map = k.split('/')
      uit.set(pad, [soort, map[map.length - 1], ...d.slice(map.length)].join('/'))
      return
    }
    const at = d.findIndex((s, n) => n < d.length - 1 && MAP_OP_NAAM.has(s.toLowerCase()))
    if (at >= 0) uit.set(pad, [MAP_OP_NAAM.get(d[at].toLowerCase())!, ...d.slice(at + 1)].join('/'))
  })
  return uit
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

export interface PlanRegel {
  bron: string
  doel: string
  grootte: number
  staat: 'nieuw' | 'gelijk' | 'anders'
  /** Bij `anders`: van welke add-on het bestand komt dat er nu staat, als we dat weten. */
  van?: string
}

export interface Plan {
  naam: string
  regels: PlanRegel[]
  /** Wat niet in de OMSI-map hoort: leesmij, plaatjes, onbekende mappen. */
  overig: string[]
  /** Samenvatting per plek: `Vehicles/MAN_NL202` met het aantal bestanden. */
  plekken: Array<{ plek: string; bestanden: number; bytes: number }>
  bussen: string[]
  kaarten: string[]
}

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
  const plaats = plaatsVan(bron.bestanden.map((b) => b.pad))
  const eigenaar = new Map<string, string>()
  for (const a of register.addons) for (const b of a.bestanden) eigenaar.set(b.pad.toLowerCase(), a.naam)

  const regels: PlanRegel[] = []
  const overig: string[] = []
  let n = 0
  for (const b of bron.bestanden) {
    const doel = plaats.get(b.pad)
    if (!doel) {
      overig.push(b.pad)
      continue
    }
    const opPad = opSchijf(omsi, doel)
    let staat: PlanRegel['staat'] = 'nieuw'
    if (existsSync(opPad)) {
      const bestaand = statSync(opPad)
      staat = bestaand.size === b.grootte && sha1(readFileSync(opPad)) === sha1(bron.lees(b)) ? 'gelijk' : 'anders'
    }
    regels.push({ bron: b.pad, doel, grootte: b.grootte, staat, van: staat === 'anders' ? eigenaar.get(doel.toLowerCase()) : undefined })
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
    overig,
    plekken: [...plekken.entries()].map(([plek, v]) => ({ plek, ...v })).sort((a, b) => b.bytes - a.bytes),
    bussen: mappen('Vehicles', /\.(bus|ovh)$/i),
    kaarten: mappen('maps', /\/global\.cfg$/i)
  }
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
}

/**
 * Installeren volgens een plan. Wat anders was, gaat eerst naar de reserve van
 * deze add-on; daarna pas wordt het overschreven. Het register wordt aan het
 * eind in één keer geschreven, door de aanroeper.
 */
export function* installeerStappen(
  bron: Bron,
  plan: Plan,
  omsi: string,
  userData: string,
  nu = new Date()
): Generator<number, Installatie> {
  const id = `${nu.getTime().toString(36)}-${sha1(Buffer.from(plan.naam)).slice(0, 6)}`
  const perPad = new Map(bron.bestanden.map((b) => [b.pad, b]))
  const bestanden: AddonBestand[] = []
  let geschreven = 0
  let overschreven = 0
  for (const regel of plan.regels) {
    const b = perPad.get(regel.bron)
    if (!b) continue
    const doel = opSchijf(omsi, regel.doel)
    if (regel.staat === 'gelijk') {
      bestanden.push({ pad: regel.doel, sha1: sha1(readFileSync(doel)), was: 'gelijk' })
      continue
    }
    let was: Herkomst = 'nieuw'
    if (existsSync(doel)) {
      const reserve = join(reserveMap(userData, id), ...regel.doel.split('/'))
      mkdirSync(dirname(reserve), { recursive: true })
      copyFileSync(doel, reserve)
      was = 'overschreven'
      overschreven += 1
    }
    mkdirSync(dirname(doel), { recursive: true })
    bron.kopieer(b, doel)
    bestanden.push({ pad: regel.doel, sha1: sha1(readFileSync(doel)), was })
    geschreven += 1
    if (geschreven % 25 === 0) yield geschreven
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
    overschreven
  }
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
    const pad = opSchijf(omsi, b.pad)
    if (++n % 50 === 0) yield n
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

  // Lege mappen opruimen, van diep naar ondiep, tot aan de OMSI-mappen.
  const grens = new Set([omsi, ...OMSI_MAPPEN.map((m) => opSchijf(omsi, m))].map((p) => p.toLowerCase()))
  const alle = new Set<string>()
  for (const m of mappen) {
    for (let hier = m; hier.startsWith(omsi) && !grens.has(hier.toLowerCase()); hier = dirname(hier)) alle.add(hier)
  }
  for (const map of [...alle].sort((a, b) => b.length - a.length)) {
    try {
      if (readdirSync(map).length === 0) rmdirSync(map)
    } catch {
      // Niet leeg of al weg.
    }
  }
  return uit
}
