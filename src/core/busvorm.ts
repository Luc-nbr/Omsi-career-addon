import { join } from 'node:path'
import { leesO3d } from './o3d'

/**
 * WAAR DE ONDERDELEN VAN EEN APPARAAT LIGGEN
 *
 * Een `model.cfg` zegt welk onderdeel een schermvak draagt en welk onderdeel een
 * knop is, maar niet waar die op het apparaat zitten. Dat staat in de
 * `.o3d`-bestanden ernaast: daar zitten de hoekpunten in, en die kan de app al
 * lezen (core/o3d.ts, voor de bustegels).
 *
 * Daarmee is de indeling van een apparaat na te METEN in plaats van te gokken.
 * Nagemeten aan de ALMEX van de Hamburgse stadsbus van 2017 (maten in meters,
 * zoals ze in de bus staan):
 *
 *   17_almex_s_hst1   y 1,689   -- de haltelijst begint ONDERAAN, zoals de cfg
 *   17_almex_s_hst7   y 1,771      er zelf bij schrijft: "Haltestelle 1 (unten)"
 *   17_almex_clickN1  y 1,681   -- en het cijferblok heeft de 1 BOVEN,
 *   17_almex_clickN7  y 1,655      anders dan op een telefoon
 *
 * EEN APPARAAT IS ZELDEN ÉÉN VLAK
 * Bij deze ALMEX staat het scherm overeind, ligt er een rij functietoetsen
 * onderlangs en ligt het cijferblok verderop bijna plat. Een vlak door alles
 * heen zou nergens op lijken. Daarom wordt een apparaat eerst in VLAKJES gehakt:
 * onderdelen die dicht bij elkaar liggen én dezelfde kant op kijken. Elk vlakje
 * krijgt zijn eigen boven en rechts, en de vlakjes komen op hoogte onder elkaar.
 *
 * WAT DIT NIET DOET
 * Het apparaat op millimeters natekenen. Een ALMEX heeft eenentwintig tekstvakken
 * op een vlak van tien bij vijf centimeter; op een telefoon van 330 beeldpunten
 * breed wordt dat onleesbaar. De meting bepaalt de VOLGORDE en de RIJEN -- welk
 * vak boven welk ligt, welke knoppen naast elkaar zitten -- en voor het scherm
 * ook de plaats van elk vak binnen dat scherm.
 */

/** Eén richting of punt in de ruimte. */
export type V3 = [number, number, number]

/** De doos waar een onderdeel in past, met de kant waar het naar kijkt. */
export interface Doos {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  /** Het midden. */
  m: V3
  /**
   * De richting waar het onderdeel naar kijkt.
   *
   * Een tekstvak en een klikvlak zijn platte plaatjes; de richting waarin hun
   * hoekpunten het minst uit elkaar liggen staat haaks op dat plaatje. Daarmee
   * is te zien of twee onderdelen op hetzelfde vlak liggen of op twee kanten van
   * een console.
   */
  n: V3
}

/** Een onderdeel op het apparaat: 0 is links en boven, 1 is rechts en onder. */
export interface Plek {
  links: number
  rechts: number
  boven: number
  onder: number
}

function lengte(v: V3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function eenheid(v: V3): V3 {
  const l = lengte(v)
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]
}

function punt(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function kruis(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** De middelste waarde van een rij getallen; ongevoelig voor één uitschieter. */
function mediaan(waarden: number[]): number {
  const op = [...waarden].sort((a, b) => a - b)
  const n = op.length
  if (n === 0) return 0
  return n % 2 === 1 ? op[(n - 1) / 2] : (op[n / 2 - 1] + op[n / 2]) / 2
}

/**
 * De richting waarin een wolk punten het MINST uit elkaar ligt.
 *
 * Met de methode van Jacobi op de spreidingsmatrix: die is symmetrisch, dus een
 * handvol rotaties maakt hem diagonaal, en de as met de kleinste spreiding is de
 * normaal van het vlak waar de punten op liggen.
 */
function kleinsteAs(hoekpunten: Float32Array, midden: V3): V3 {
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  for (let i = 0; i + 2 < hoekpunten.length; i += 3) {
    const d = [hoekpunten[i] - midden[0], hoekpunten[i + 1] - midden[1], hoekpunten[i + 2] - midden[2]]
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += d[a] * d[b]
  }
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
  for (let ronde = 0; ronde < 12; ronde++) {
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2]
    ] as const) {
      if (Math.abs(c[p][q]) < 1e-16) continue
      const hoek = 0.5 * Math.atan2(2 * c[p][q], c[p][p] - c[q][q])
      const co = Math.cos(hoek)
      const si = Math.sin(hoek)
      for (let k = 0; k < 3; k++) {
        const a = c[k][p]
        const b = c[k][q]
        c[k][p] = co * a + si * b
        c[k][q] = -si * a + co * b
      }
      for (let k = 0; k < 3; k++) {
        const a = c[p][k]
        const b = c[q][k]
        c[p][k] = co * a + si * b
        c[q][k] = -si * a + co * b
      }
      for (let k = 0; k < 3; k++) {
        const a = v[k][p]
        const b = v[k][q]
        v[k][p] = co * a + si * b
        v[k][q] = -si * a + co * b
      }
    }
  }
  let kleinste = 0
  for (const as of [1, 2]) if (c[as][as] < c[kleinste][kleinste]) kleinste = as
  const n = eenheid([v[0][kleinste], v[1][kleinste], v[2][kleinste]])
  return lengte(n) > 0.5 ? n : [0, 0, 1]
}

/**
 * De doos van één onderdeel, met de kant waar het naar kijkt.
 *
 * De hoekpunten staan al in de maten van de BUS; de 4x4-matrix die sommige
 * bestanden in blok 0x79 hebben staan is er al in verwerkt en hoort er niet nog
 * eens over. Nagerekend op `17_almex_s_hst1.o3d`: de hoekpunten liggen op
 * y = 1,690 en z = 4,028, en dat is waar de ALMEX in die bus zit; met de matrix
 * er nog een keer overheen werd het y = 3,20 en z = 7,89, ongeveer het dubbele.
 * De bustekening (core/busmodel.ts) gebruikt hem ook niet.
 */
export function doosVanO3d(pad: string): Doos | undefined {
  const model = leesO3d(pad)
  if (!model || model.vertices.length < 3) return undefined
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i + 2 < model.vertices.length; i += 3) {
    const x = model.vertices[i]
    const y = model.vertices[i + 1]
    const z = model.vertices[i + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(z0)) return undefined
  const m: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
  return { x0, x1, y0, y1, z0, z1, m, n: kleinsteAs(model.vertices, m) }
}

/**
 * De dozen van een lijst onderdeelpaden, uit de modelmap van de bus.
 *
 * De paden in een model.cfg staan met terugslagen en zijn relatief aan de map
 * waar de cfg zelf in staat. Wat niet te lezen is komt er niet in; dat hoort
 * geen enkele weergave te breken.
 */
export function dozenVanOnderdelen(modelmap: string, onderdelen: string[]): Map<string, Doos> {
  const uit = new Map<string, Doos>()
  for (const onderdeel of onderdelen) {
    if (uit.has(onderdeel)) continue
    const delen = onderdeel.split(/[\\/]+/).filter(Boolean)
    if (delen.length === 0) continue
    const doos = doosVanO3d(join(modelmap, ...delen))
    if (doos) uit.set(onderdeel, doos)
  }
  return uit
}

/**
 * Hoe groot een apparaat hoogstens is.
 *
 * Wat verder ligt hoort er niet bij, en dat is niet alleen de binnenanzeige die
 * de bouwer ook naar de ALMEX noemde maar drie meter verderop hangt. Sommige
 * onderdelen staan buiten de bus geparkeerd en worden er door OMSI met een
 * animatie in gezet -- de `AFR200_Modul` van de Setra, en het tellertje dat de
 * kaartjes uitspuugt. Aan zulke plaatsen valt niets af te lezen.
 */
const STRAAL_M = 1.2

/** Hoe ver twee onderdelen hoogstens uit elkaar liggen om bij hetzelfde vlakje te horen. */
const VLAKJE_M = 0.25

/** Hoe veel twee vlakjes van richting mogen schelen om er één te zijn (ruim 25 graden). */
const VLAKJE_HOEK = 0.9

/** Wat er bij het apparaat hoort; de rest ligt te ver weg. */
function bijElkaar(dozen: Map<string, Doos>): Map<string, Doos> {
  const alles = [...dozen.entries()]
  if (alles.length === 0) return dozen
  const c: V3 = [
    mediaan(alles.map(([, d]) => d.m[0])),
    mediaan(alles.map(([, d]) => d.m[1])),
    mediaan(alles.map(([, d]) => d.m[2]))
  ]
  const uit = new Map<string, Doos>()
  for (const [naam, doos] of alles) {
    if (Math.hypot(doos.m[0] - c[0], doos.m[1] - c[1], doos.m[2] - c[2]) <= STRAAL_M) {
      uit.set(naam, doos)
    }
  }
  return uit.size > 0 ? uit : dozen
}

/**
 * De onderdelen in vlakjes: dicht bij elkaar én dezelfde kant op.
 *
 * Aan elkaar geregen -- ligt A bij B en B bij C, dan horen ze alle drie bij
 * elkaar, ook al liggen A en C ver uit elkaar. Zo wordt een rij van zeven
 * toetsen één vlakje, terwijl een cijferblok dat er haaks op ligt zijn eigen
 * vlakje houdt.
 */
function vlakjes(dozen: Map<string, Doos>): string[][] {
  const namen = [...dozen.keys()]
  const bij = namen.map((_, i) => i)
  const vind = (i: number): number => {
    while (bij[i] !== i) i = bij[i]
    return i
  }
  for (let i = 0; i < namen.length; i++) {
    const a = dozen.get(namen[i])!
    for (let j = i + 1; j < namen.length; j++) {
      const b = dozen.get(namen[j])!
      if (Math.hypot(a.m[0] - b.m[0], a.m[1] - b.m[1], a.m[2] - b.m[2]) > VLAKJE_M) continue
      if (Math.abs(punt(a.n, b.n)) < VLAKJE_HOEK) continue
      const wi = vind(i)
      const wj = vind(j)
      if (wi !== wj) bij[wj] = wi
    }
  }
  const groepjes = new Map<number, string[]>()
  for (let i = 0; i < namen.length; i++) {
    const w = vind(i)
    const lijst = groepjes.get(w) ?? []
    lijst.push(namen[i])
    groepjes.set(w, lijst)
  }
  return [...groepjes.values()]
}

/**
 * De richting waarin een plat apparaat is neergelegd.
 *
 * Een cijferblok dat plat op de kassaplaat ligt, ligt zelden recht: de AFR 200
 * van de Setra staat dertig graden gedraaid ten opzichte van de bus. Hoogte helpt
 * daar niet -- alle toetsen liggen even hoog -- en de assen van de bus ook niet.
 * Wat wel helpt is het rooster zelf: in een toetsenblok wijst bijna elke toets
 * naar zijn buurman langs een rij of langs een kolom, en die twee staan haaks op
 * elkaar. De hoek van al die buurmanrichtingen bij elkaar (viervoudig genomen,
 * zodat een kwartslag hetzelfde antwoord geeft) is de hoek van het rooster.
 *
 * Nagemeten op de AFR 200: de toetsen liggen 20,6 mm uit elkaar, zowel langs de
 * rij als langs de kolom, onder een hoek van dertig graden. Daarmee komt 7-8-9
 * weer op één rij te staan met 4-5-6 eronder.
 */
function roosterhoek(punten: [number, number][]): number {
  if (punten.length < 3) return 0
  let co = 0
  let si = 0
  for (let i = 0; i < punten.length; i++) {
    let dichtst = Infinity
    let dx = 0
    let dz = 0
    for (let j = 0; j < punten.length; j++) {
      if (i === j) continue
      const ax = punten[j][0] - punten[i][0]
      const az = punten[j][1] - punten[i][1]
      const d = Math.hypot(ax, az)
      if (d < 1e-6 || d >= dichtst) continue
      dichtst = d
      dx = ax
      dz = az
    }
    if (!Number.isFinite(dichtst)) continue
    const hoek = Math.atan2(dz, dx)
    co += Math.cos(4 * hoek)
    si += Math.sin(4 * hoek)
  }
  if (Math.hypot(co, si) < 1e-9) return 0
  const hoek = Math.atan2(si, co) / 4
  return hoek
}

/**
 * De twee assen van een plat apparaat, uit de hoek van zijn rooster.
 *
 * Welke van de twee boven is: die naar voren EN naar rechts wijst. De bestuurder
 * zit links vooraan en kijkt naar voren, dus ligt een console rechts van hem en
 * leest hij hem van zich af -- naar +x en naar +z. De andere as is dan rechts,
 * een kwartslag met de klok mee.
 */
function plattAssen(punten: [number, number][]): { breed: V3; hoog: V3 } {
  const hoek = roosterhoek(punten)
  const kandidaten: [number, number][] = [
    [Math.cos(hoek), Math.sin(hoek)],
    [-Math.sin(hoek), Math.cos(hoek)]
  ]
  let op: [number, number] | undefined
  for (const as of kandidaten) {
    for (const keer of [1, -1]) {
      const kx = as[0] * keer
      const kz = as[1] * keer
      if (kx >= -1e-9 && kz >= -1e-9) op = [kx, kz]
    }
  }
  if (!op) {
    /* Geen van beide ligt in die hoek: dan maar die het meest naar rechts wijst. */
    const beste = Math.abs(kandidaten[0][0]) >= Math.abs(kandidaten[1][0]) ? kandidaten[0] : kandidaten[1]
    op = beste[0] >= 0 ? beste : [-beste[0], -beste[1]]
  }
  return { breed: [op[1], 0, -op[0]], hoog: [op[0], 0, op[1]] }
}

/** De twee assen van een vlak: rechts en boven. */
function assenVan(n: V3, punten?: [number, number][]): { breed: V3; hoog: V3 } {
  /* Ligt het apparaat plat, dan zegt de hoogte niets en telt het rooster. */
  if (Math.abs(punt([0, 1, 0], n)) > 0.93 && punten && punten.length >= 3) {
    return plattAssen(punten)
  }
  /*
   * Rechtop binnen het vlak. Ligt het apparaat bijna plat -- het cijferblok van
   * een AFR 200 ligt horizontaal op de kassaplaat -- dan is hoogte geen maat meer
   * en wordt "verder van je af" boven; zo lees je een plat toetsenbord.
   */
  const recht = punt([0, 1, 0], n)
  let hoog =
    Math.abs(recht) > 0.93
      ? eenheid([-n[0] * n[2], -n[1] * n[2], 1 - n[2] * n[2]])
      : eenheid([-n[0] * recht, 1 - n[1] * recht, -n[2] * recht])
  if (lengte(hoog) < 0.5) hoog = [0, 1, 0]
  let breed = eenheid(kruis(hoog, n))
  if (lengte(breed) < 0.5) breed = [1, 0, 0]
  /* Naar +x: dat is rechts voor wie naar voren kijkt. */
  if (breed[0] < 0 || (Math.abs(breed[0]) < 0.2 && breed[2] > 0)) {
    breed = [-breed[0], -breed[1], -breed[2]]
  }
  /* En boven is boven; bij een plat apparaat: van de bestuurder af. */
  let op = eenheid(kruis(n, breed))
  if (lengte(op) < 0.5) op = [0, 1, 0]
  if (op[1] < -0.2 || (Math.abs(op[1]) <= 0.2 && op[2] < 0)) op = [-op[0], -op[1], -op[2]]
  return { breed, hoog: op }
}

/** De uiterste punten van een doos langs een as; een doos heeft acht hoeken. */
function langsAs(doos: Doos, as: V3): [number, number] {
  let laag = Infinity
  let hoogst = -Infinity
  for (const x of [doos.x0, doos.x1]) {
    for (const y of [doos.y0, doos.y1]) {
      for (const z of [doos.z0, doos.z1]) {
        const w = x * as[0] + y * as[1] + z * as[2]
        if (w < laag) laag = w
        if (w > hoogst) hoogst = w
      }
    }
  }
  return [laag, hoogst]
}

/** De gemiddelde richting van een groepje; alle normalen dezelfde kant op gedraaid. */
export function richtingVan(dozen: Doos[]): V3 {
  if (dozen.length === 0) return [0, 0, 1]
  const eerste = dozen[0].n
  let x = 0
  let y = 0
  let z = 0
  for (const doos of dozen) {
    const keer = punt(doos.n, eerste) < 0 ? -1 : 1
    x += doos.n[0] * keer
    y += doos.n[1] * keer
    z += doos.n[2] * keer
  }
  const n = eenheid([x, y, z])
  return lengte(n) > 0.5 ? n : eerste
}

/**
 * De plek van elk onderdeel op het vlak waar ze samen op liggen.
 *
 * Gemeten in het vlak zelf, niet in de assen van de bus: het ALMEX-scherm staat
 * schuin achterover, en in de hoogte van de bus is een regel van dertien
 * millimeter dan nog maar vijf. Zeven haltes onder elkaar werden daarmee zeven
 * streepjes bovenin.
 */
export function plekkenOpVlak(dozen: Map<string, Doos>, normaal?: V3): Map<string, Plek> {
  const uit = new Map<string, Plek>()
  if (dozen.size === 0) return uit
  const lijst = [...dozen.entries()]
  const { breed, hoog } = assenVan(
    normaal ?? richtingVan(lijst.map(([, doos]) => doos)),
    lijst.map(([, doos]): [number, number] => [doos.m[0], doos.m[2]])
  )

  const overBreed = lijst.map(([, doos]) => langsAs(doos, breed))
  const overHoog = lijst.map(([, doos]) => langsAs(doos, hoog))
  const b0 = Math.min(...overBreed.map((r) => r[0]))
  const b1 = Math.max(...overBreed.map((r) => r[1]))
  const h0 = Math.min(...overHoog.map((r) => r[0]))
  const h1 = Math.max(...overHoog.map((r) => r[1]))
  const bb = b1 - b0
  const hh = h1 - h0

  lijst.forEach(([naam], i) => {
    uit.set(naam, {
      links: bb > 1e-6 ? (overBreed[i][0] - b0) / bb : 0,
      rechts: bb > 1e-6 ? (overBreed[i][1] - b0) / bb : 1,
      /* De hoogte-as wijst omhoog, het scherm rekent van boven naar beneden. */
      boven: hh > 1e-6 ? 1 - (overHoog[i][1] - h0) / hh : 0,
      onder: hh > 1e-6 ? 1 - (overHoog[i][0] - h0) / hh : 1
    })
  })
  return uit
}

/** Hoe groot een vlak werkelijk is: breed en hoog in meters, in zijn eigen assen. */
export function vlakmaatVan(dozen: Map<string, Doos>, normaal?: V3): { breed: number; hoog: number } {
  const lijst = [...dozen.values()]
  if (lijst.length === 0) return { breed: 1, hoog: 1 }
  const { breed, hoog } = assenVan(
    normaal ?? richtingVan(lijst),
    lijst.map((doos): [number, number] => [doos.m[0], doos.m[2]])
  )
  const b = lijst.map((doos) => langsAs(doos, breed))
  const h = lijst.map((doos) => langsAs(doos, hoog))
  return {
    breed: Math.max(1e-6, Math.max(...b.map((r) => r[1])) - Math.min(...b.map((r) => r[0]))),
    hoog: Math.max(1e-6, Math.max(...h.map((r) => r[1])) - Math.min(...h.map((r) => r[0])))
  }
}

/** Hoe ver een knop van het vlak van het scherm mag liggen om er nog op te zitten. */
const OP_SCHERM_M = 0.04

/**
 * De vakken van een scherm op hun plek, en de knoppen die OP dat scherm liggen.
 *
 * Een scherm is één vlak, dus hier geen vlakjes: alleen wat te ver weg ligt valt
 * af, en de rest wordt op dat ene vlak gemeten.
 *
 * De knoppen erbij, want een aanraakscherm heeft knoppen die nergens anders
 * liggen dan op het scherm zelf: de acht verkooptegels van een ALMEX en de zeven
 * FIMS-knoppen ernaast. Die horen in beeld op hun eigen plaats, niet in een rij
 * knopjes eronder. Een knop telt mee als hij in hetzelfde vlak ligt (hoogstens
 * vier centimeter ervandaan en dezelfde kant op kijkend) -- het cijferblok van
 * een ALMEX ligt twintig centimeter naar voren en valt daarmee af, zoals het
 * hoort.
 */
export function schermplekkenVan(
  vakdozen: Map<string, Doos>,
  knopdozen: Map<string, Doos>
): {
  plekken: Map<string, Plek>
  knoppen: Map<string, Plek>
  maat: { breed: number; hoog: number }
} {
  const bij = bijElkaar(vakdozen)
  const n = richtingVan([...bij.values()])
  const mid = [...bij.values()].reduce(
    (op, doos) => [op[0] + doos.m[0] / bij.size, op[1] + doos.m[1] / bij.size, op[2] + doos.m[2] / bij.size] as V3,
    [0, 0, 0] as V3
  )
  const opHetVlak = new Map<string, Doos>()
  for (const [naam, doos] of knopdozen) {
    if (Math.abs(punt(doos.n, n)) < VLAKJE_HOEK) continue
    const weg = Math.abs(
      (doos.m[0] - mid[0]) * n[0] + (doos.m[1] - mid[1]) * n[1] + (doos.m[2] - mid[2]) * n[2]
    )
    if (weg > OP_SCHERM_M) continue
    opHetVlak.set(naam, doos)
  }

  const samen = new Map<string, Doos>()
  for (const [naam, doos] of bij) samen.set(`v:${naam}`, doos)
  for (const [naam, doos] of opHetVlak) samen.set(`k:${naam}`, doos)
  const alles = plekkenOpVlak(samen, n)

  const plekken = new Map<string, Plek>()
  const knoppen = new Map<string, Plek>()
  for (const naam of bij.keys()) {
    const plek = alles.get(`v:${naam}`)
    if (plek) plekken.set(naam, plek)
  }
  for (const naam of opHetVlak.keys()) {
    const plek = alles.get(`k:${naam}`)
    if (plek) knoppen.set(naam, plek)
  }
  return { plekken, knoppen, maat: vlakmaatVan(bij, n) }
}

/**
 * De indeling van een apparaat: rijen van boven naar beneden, per rij van links
 * naar rechts.
 *
 * Eerst uit elkaar in vlakjes -- het scherm, de rij functietoetsen, het
 * cijferblok -- want elk daarvan ligt anders in de ruimte en heeft zijn eigen
 * boven. Dan per vlakje de rijen, en de vlakjes zelf op hoogte onder elkaar.
 * Wat niet te meten viel komt achteraan, drie op een rij, in de volgorde van het
 * bestand.
 */
export function indelingVan<T>(
  dingen: T[],
  doosVan: (ding: T) => Doos | undefined
): { ding: T; plek?: Plek }[][] {
  const dozen = new Map<string, Doos>()
  const waarvan = new Map<string, T>()
  const zonder: T[] = []
  dingen.forEach((ding, i) => {
    const doos = doosVan(ding)
    if (!doos) {
      zonder.push(ding)
      return
    }
    dozen.set(String(i), doos)
    waarvan.set(String(i), ding)
  })

  const bij = bijElkaar(dozen)
  const groepjes = vlakjes(bij)
    .map((namen) => {
      const eigen = new Map<string, Doos>()
      for (const naam of namen) eigen.set(naam, bij.get(naam)!)
      return { namen, eigen, hoogte: Math.max(...namen.map((naam) => bij.get(naam)!.y1)) }
    })
    .sort((a, b) => b.hoogte - a.hoogte)

  const uit: { ding: T; plek?: Plek }[][] = []
  for (const groepje of groepjes) {
    const plekken = plekkenOpVlak(groepje.eigen)
    for (const laag of lagenVan(groepje.namen, (naam) => plekken.get(naam))) {
      for (const rij of rijenVanPlekken(laag, (naam) => plekken.get(naam))) {
        uit.push(rij.map((naam) => ({ ding: waarvan.get(naam)!, plek: plekken.get(naam) })))
      }
    }
  }
  /* En wat buiten het apparaat lag of niet te lezen was. */
  const rest = [
    ...[...dozen.keys()].filter((naam) => !bij.has(naam)).map((naam) => waarvan.get(naam)!),
    ...zonder
  ]
  for (let i = 0; i < rest.length; i += 3) uit.push(rest.slice(i, i + 3).map((ding) => ({ ding })))
  return uit
}

/**
 * Knoppen die op dezelfde plek liggen horen niet in dezelfde rij.
 *
 * Een aanraakscherm zet per menu andere knoppen op dezelfde plaats. Op de ALMEX
 * liggen `almex_click_umlauf`, `_linie` en `_sonderziel` precies boven op de
 * toetsen 1, 2 en 3 -- nagemeten, tot op de millimeter. Door elkaar in één rij
 * wordt dat "1 | UMLAUF | 2 | LINIE | 3", en dat is van geen enkel apparaat een
 * afbeelding.
 *
 * Dus eerst in lagen: elke knop komt in de eerste laag waar hij niets bedekt. De
 * grootste laag eerst -- dat is het toetsenbord dat er altijd is, en niet het
 * menu dat er soms overheen komt.
 */
function lagenVan<T>(dingen: T[], plek: (ding: T) => Plek | undefined): T[][] {
  const lagen: { leden: T[]; plekken: Plek[] }[] = []
  for (const ding of dingen) {
    const mijn = plek(ding)
    if (!mijn) {
      if (lagen.length === 0) lagen.push({ leden: [], plekken: [] })
      lagen[0].leden.push(ding)
      continue
    }
    const eigen = Math.max(
      1e-9,
      (mijn.rechts - mijn.links) * (mijn.onder - mijn.boven)
    )
    let waar = lagen.find(
      (laag) =>
        !laag.plekken.some((ander) => {
          const breed = Math.min(ander.rechts, mijn.rechts) - Math.max(ander.links, mijn.links)
          const hoog = Math.min(ander.onder, mijn.onder) - Math.max(ander.boven, mijn.boven)
          return breed > 0 && hoog > 0 && breed * hoog > eigen * 0.3
        })
    )
    if (!waar) {
      waar = { leden: [], plekken: [] }
      lagen.push(waar)
    }
    waar.leden.push(ding)
    waar.plekken.push(mijn)
  }
  return lagen.sort((a, b) => b.leden.length - a.leden.length).map((laag) => laag.leden)
}

/**
 * Dingen in rijen, zoals ze op een vlak liggen.
 *
 * Twee knoppen staan op dezelfde rij als ze in de hoogte over elkaar heen
 * vallen. Binnen een rij van links naar rechts, en de rijen van boven naar
 * beneden. Wat geen plek heeft komt achteraan, drie op een rij.
 */
export function rijenVanPlekken<T>(dingen: T[], plek: (ding: T) => Plek | undefined): T[][] {
  const met = dingen
    .map((ding) => ({ ding, plek: plek(ding) }))
    .filter((rij): rij is { ding: T; plek: Plek } => rij.plek !== undefined)
  const zonder = dingen.filter((ding) => plek(ding) === undefined)
  met.sort((a, b) => a.plek.boven - b.plek.boven || a.plek.links - b.plek.links)

  /*
   * Bij het EERSTE van de rij vergelijken, niet bij het laatste dat erbij kwam.
   * Anders rijgt een apparaat met veel knoppen zich aan elkaar: A raakt B, B
   * raakt C, en voor je het weet staat het hele paneel op één rij. Nagerekend op
   * de ALMEX: de toetsen staan dertien millimeter uit elkaar en zijn er veertien
   * hoog, dus raken ze elkaar altijd nét.
   */
  const rijen: { ding: T; plek: Plek }[][] = []
  const mid = (plek: Plek): number => (plek.boven + plek.onder) / 2
  for (const rij of met) {
    const laatste = rijen[rijen.length - 1]
    const eerste = laatste?.[0]
    const hoogte = eerste
      ? Math.min(eerste.plek.onder - eerste.plek.boven, rij.plek.onder - rij.plek.boven)
      : 0
    if (eerste && Math.abs(mid(rij.plek) - mid(eerste.plek)) < Math.max(1e-6, hoogte) * 0.5) {
      laatste.push(rij)
    } else {
      rijen.push([rij])
    }
  }
  for (const rij of rijen) rij.sort((a, b) => a.plek.links - b.plek.links)
  const uit = rijen.map((rij) => rij.map((r) => r.ding))
  for (let i = 0; i < zonder.length; i += 3) uit.push(zonder.slice(i, i + 3))
  return uit
}
