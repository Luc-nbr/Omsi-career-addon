import type { TripRoute } from '../../core/routing'
import { ritSleutel, uniekeRitten, type RitVraag } from '../../shared/traject'

/*
 * ELKE LIJN ÉÉN KEER
 *
 * Luc, over 0.4.8: "in vrij rijden gaat hij in de app alle lijnen tekenen dat
 * voor extreem veel lag zorgt, elke lijn wordt maximaal 1 keer getekend". Zijn
 * omloop -- Krefrath, Wagen 3 vanaf 11:50 -- heeft 26 ritten over 9 trajecten,
 * en de kaart tekende per rit een omranding en een lijn: 61 lijnen met samen
 * 45.552 punten, opnieuw bij elk beeld. Slepen kostte 90 ms per beeld.
 *
 * Wat hier staat:
 * - `trajectenVan`: ritten met dezelfde lijn op de kaart (dezelfde punten, of
 *   zonder route dezelfde haltes) worden één traject, en alleen dat wordt
 *   getekend. De rittenlijst blijft wat hij is; de kaart tekent de weg.
 * - `schermPad`: van kaartmeters naar een SVG-pad, zonder wat buiten beeld
 *   valt en zonder punten die op het scherm op elkaar liggen. Uitgezoomd kiest
 *   `vereenvoudigd` een grovere lijn die er op het scherm hetzelfde uitziet.
 * - `haalRoutes`: elke route één keer vragen, en onthouden tussen twee
 *   diensten door -- de dienstenlijst wijst de ene dienst na de andere aan,
 *   met telkens dezelfde ritten erin.
 */

/** Een stuk van een traject in kaartmeters, x en y om en om. */
export interface Stuk {
  punten: number[]
  /** Waar het stuk in het traject begint (puntnummer); voor de tekenvolgorde. */
  van: number
  /** Lengte in meters. */
  lengte: number
}

/** Eén lijn op de kaart: een weg die in de dienst één of meer keer gereden wordt. */
export interface Traject {
  /** De ritten die deze weg rijden, in de volgorde van de dienst. */
  ritten: number[]
  /** Waar een weg gevonden is. */
  heel: Stuk[]
  /** Waar de planner niets vond: rechte stukken, gestreept getekend. */
  gok: Stuk[]
}

/**
 * De ritten gegroepeerd per lijn op de kaart.
 *
 * Een rit met een route is zijn route; zonder (nog niet binnen, of niet te
 * vinden) is hij de rechte lijn langs zijn haltes -- zo tekende de kaart dat
 * al. Gelijk is gelijk tot op de centimeter, met de gegokte stukken erbij:
 * twee ritten over dezelfde straat met een ander gegokt stuk zien er anders
 * uit en blijven twee lijnen.
 */
export function trajectenVan(
  ritten: Array<Array<{ x: number; y: number }>>,
  routes: ReadonlyArray<TripRoute | undefined> | undefined
): Traject[] {
  const uit: Traject[] = []
  const opAfdruk = new Map<string, Array<{ traject: Traject; punten: number[]; gok: readonly boolean[] }>>()
  ritten.forEach((haltes, rit) => {
    const route = routes?.[rit]
    const metRoute = Boolean(route && route.points.length >= 4)
    const punten = metRoute ? route!.points : haltes.flatMap((h) => [h.x, h.y])
    if (punten.length < 4) return
    const gok: readonly boolean[] = metRoute ? route!.guessed : []
    const afdruk = afdrukVan(punten, gok)
    const kandidaten = opAfdruk.get(afdruk) ?? []
    const zelfde = kandidaten.find((k) => k.punten === punten || (gelijk(k.punten, punten) && gelijkeGok(k.gok, gok)))
    if (zelfde) {
      zelfde.traject.ritten.push(rit)
      return
    }
    const traject: Traject = { ritten: [rit], ...stukkenVan(punten, gok) }
    kandidaten.push({ traject, punten, gok })
    opAfdruk.set(afdruk, kandidaten)
    uit.push(traject)
  })
  return uit
}

/** Een vingerafdruk van de lijn, op een centimeter; `gelijk` beslist. */
function afdrukVan(punten: number[], gok: readonly boolean[]): string {
  let h = 2166136261
  for (let i = 0; i < punten.length; i++) {
    h ^= Math.round(punten[i] * 100)
    h = Math.imul(h, 16777619)
  }
  let g = 0
  for (let i = 0; i < gok.length; i++) if (gok[i]) g = (Math.imul(g, 31) + i + 1) | 0
  return `${punten.length}:${h >>> 0}:${g}`
}

function gelijk(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.005) return false
  return true
}

function gelijkeGok(a: readonly boolean[], b: readonly boolean[]): boolean {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) if (Boolean(a[i]) !== Boolean(b[i])) return false
  return true
}

/**
 * In stukken gehakt op de overgang tussen gevonden en gegokt. `gok[i]` hoort
 * bij het lijnstuk van punt i naar i+1; dezelfde verdeling als de kaart al
 * maakte, maar nu één keer per route en niet bij elk beeld.
 */
function stukkenVan(punten: number[], gok: readonly boolean[]): { heel: Stuk[]; gok: Stuk[] } {
  const n = punten.length / 2
  if (gok.length === 0 || !gok.some(Boolean)) return { heel: [stuk(punten, 0)], gok: [] }
  const heel: Stuk[] = []
  const gegokt: Stuk[] = []
  let van = 0
  for (let i = 1; i <= n - 1; i++) {
    const klaar = i === n - 1
    if (!klaar && Boolean(gok[i]) === Boolean(gok[van])) continue
    const tot = klaar ? n : i + 1
    if (tot - van > 1) (gok[van] ? gegokt : heel).push(stuk(punten.slice(van * 2, tot * 2), van))
    van = i
  }
  return { heel, gok: gegokt }
}

function stuk(punten: number[], van: number): Stuk {
  let lengte = 0
  for (let i = 2; i < punten.length; i += 2) lengte += Math.hypot(punten[i] - punten[i - 2], punten[i + 1] - punten[i - 1])
  return { punten, van, lengte }
}

/*
 * GROVER ALS JE VERDER WEG BENT
 *
 * Een `.ttr` legt om de paar meter een punt. Uitgezoomd op een hele omloop
 * (vijf meter per beeldpunt) liggen er dan tientallen punten binnen één
 * beeldpunt, en elke streep erdoor kost tekentijd zonder dat je iets ziet.
 * Douglas-Peucker haalt weg wat minder dan een drempel van de lijn afwijkt; de
 * drempel is hooguit een half beeldpunt, dus het verschil valt niet te zien.
 * De trappen liggen een factor twee uit elkaar en worden per stuk één keer
 * uitgerekend (en bewaard zolang het stuk bestaat).
 */
const TRAPPEN = [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6]
const vereenvoudigingen = new WeakMap<number[], Map<number, number[]>>()

/** De punten van een lijn, zo grof als bij deze zoomstand onzichtbaar blijft. */
export function vereenvoudigd(punten: number[], mpp: number): number[] {
  const drempel = mpp / 2
  let trap: number | undefined
  for (const t of TRAPPEN) if (t <= drempel) trap = t
  if (trap === undefined || punten.length <= 6) return punten
  let perTrap = vereenvoudigingen.get(punten)
  if (!perTrap) {
    perTrap = new Map()
    vereenvoudigingen.set(punten, perTrap)
  }
  let uit = perTrap.get(trap)
  if (!uit) {
    uit = douglasPeucker(punten, trap)
    perTrap.set(trap, uit)
  }
  return uit
}

/**
 * Douglas-Peucker zonder recursie, met de afstand tot het lijnstuk en niet tot
 * de hele lijn: een rit "mit Wende" gaat heen en terug door dezelfde straat,
 * en de afstand tot een oneindige lijn zou het keerpunt wegpoetsen.
 */
export function douglasPeucker(p: number[], drempel: number): number[] {
  const n = p.length / 2
  if (n <= 2) return p
  const houd = new Uint8Array(n)
  houd[0] = 1
  houd[n - 1] = 1
  const stapel = [0, n - 1]
  const d2max = drempel * drempel
  while (stapel.length > 0) {
    const b = stapel.pop()!
    const a = stapel.pop()!
    if (b - a < 2) continue
    const ax = p[a * 2]
    const ay = p[a * 2 + 1]
    const dx = p[b * 2] - ax
    const dy = p[b * 2 + 1] - ay
    const len2 = dx * dx + dy * dy
    let verst = -1
    let waar = -1
    for (let i = a + 1; i < b; i++) {
      const px = p[i * 2] - ax
      const py = p[i * 2 + 1] - ay
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = dx * t - px
      const ey = dy * t - py
      const d2 = ex * ex + ey * ey
      if (d2 > verst) {
        verst = d2
        waar = i
      }
    }
    if (verst > d2max) {
      houd[waar] = 1
      stapel.push(a, waar, waar, b)
    }
  }
  const uit: number[] = []
  for (let i = 0; i < n; i++) if (houd[i]) uit.push(p[i * 2], p[i * 2 + 1])
  return uit
}

/** Het beeld: middelpunt en schaal in kaartmeters, draaiing in graden, maat in punten. */
export interface Beeld {
  cx: number
  cy: number
  mpp: number
  rot: number
  w: number
  h: number
}

/** Zoveel punten buiten het beeld telt nog mee: de dikste streep plus wat lucht. */
const MARGE = 24
/** Punten dichter bij elkaar dan dit (in beeldpunten) zie je niet als twee. */
const ZELFDE_PUNT2 = 0.5 * 0.5

/**
 * Van kaartmeters naar een SVG-pad op het scherm.
 *
 * Een lijnstuk dat helemaal aan één kant buiten beeld ligt, valt weg; zo
 * kost ingezoomd alleen het stukje weg dat je ziet tekentijd, en niet de
 * kilometers ernaast. Waar een stuk wegvalt begint het pad opnieuw (`M`), zodat
 * er geen streep dwars door het beeld komt. Zelfde rekensom als `toScreen` in
 * RouteMap.tsx.
 */
export function schermPad(punten: number[], beeld: Beeld): string {
  const n = punten.length / 2
  if (n < 2) return ''
  const r = (beeld.rot * Math.PI) / 180
  const cos = Math.cos(r) / beeld.mpp
  const sin = Math.sin(r) / beeld.mpp
  const w2 = beeld.w / 2
  const h2 = beeld.h / 2
  const links = -MARGE
  const rechts = beeld.w + MARGE
  const boven = -MARGE
  const onder = beeld.h + MARGE
  const code = (x: number, y: number): number =>
    (x < links ? 1 : x > rechts ? 2 : 0) | (y < boven ? 4 : y > onder ? 8 : 0)

  let d = ''
  let open = false
  let lx = 0
  let ly = 0
  let vx = 0
  let vy = 0
  let vc = 0
  for (let i = 0; i < n; i++) {
    const dx = punten[i * 2] - beeld.cx
    const dy = punten[i * 2 + 1] - beeld.cy
    const x = w2 + dx * cos - dy * sin
    const y = h2 - (dx * sin + dy * cos)
    const c = code(x, y)
    if (i > 0) {
      if ((c & vc) !== 0) {
        // Beide punten aan dezelfde kant buiten beeld: dit stuk valt weg.
        open = false
      } else {
        if (!open) {
          d += `M${vx.toFixed(1)},${vy.toFixed(1)}`
          lx = vx
          ly = vy
          open = true
        }
        const laatste = i === n - 1
        const ex = x - lx
        const ey = y - ly
        if (laatste || ex * ex + ey * ey >= ZELFDE_PUNT2) {
          d += `L${x.toFixed(1)},${y.toFixed(1)}`
          lx = x
          ly = y
        }
      }
    }
    vx = x
    vy = y
    vc = c
  }
  return d
}

/*
 * ELKE ROUTE ÉÉN KEER VRAGEN
 *
 * Per venster onthouden, op kaart en rit (shared/traject.ts). De dienstenlijst
 * wijst de ene dienst na de andere aan, de overlay krijgt bij elke wissel van
 * rit een nieuwe kopie van de dienst, en telkens staan er ritten in die al
 * binnen zijn. Wat nog onderweg is, wordt niet nog eens gevraagd.
 *
 * Vergeet het hoofdproces de kaarten (andere OMSI-map, nakijken, een add-on
 * die een `.ttr` bijwerkt), dan vergeet dit geheugen ze ook: de sleutel blijft
 * dezelfde, de weg niet. `routeGeneratie` telt dan op, en RouteMap vraagt met
 * die teller opnieuw (`volgRoutes`).
 */
const GEHEUGEN_MAX = 800
const geheugen = new Map<string, TripRoute>()
const onderweg = new Map<string, Promise<TripRoute | undefined>>()
let generatie = 0
const volgers = new Set<() => void>()
let aangemeld = false

const sleutelIn = (kaart: string, leg: RitVraag): string => `${kaart}|${ritSleutel(leg)}`

function bewaar(sleutel: string, route: TripRoute): void {
  geheugen.delete(sleutel)
  geheugen.set(sleutel, route)
  // De oudste eruit; een Map houdt de volgorde van invoegen aan.
  while (geheugen.size > GEHEUGEN_MAX) geheugen.delete(geheugen.keys().next().value as string)
}

/**
 * Eén keer per venster meeluisteren met het hoofdproces. Pas bij het eerste
 * gebruik: op de telefoonpagina bestaat `window.career` nog niet als deze
 * module geladen wordt, en daar is er ook geen hoofdproces om naar te luisteren
 * (apparaat.tsx roept `vergeetRoutes` zelf aan).
 */
function meldAan(): void {
  if (aangemeld) return
  aangemeld = true
  window.career?.opKaartenVergeten?.(vergeetRoutes)
}

/** Alles vergeten; wat nog onderweg is, komt niet meer in het geheugen. */
export function vergeetRoutes(): void {
  generatie += 1
  geheugen.clear()
  onderweg.clear()
  for (const volger of volgers) volger()
}

/** Telt op bij elk `vergeetRoutes`; voor `useSyncExternalStore`. */
export function routeGeneratie(): number {
  meldAan()
  return generatie
}

/** Horen wanneer het geheugen geleegd is; geeft een opzegfunctie terug. */
export function volgRoutes(volger: () => void): () => void {
  meldAan()
  volgers.add(volger)
  return () => {
    volgers.delete(volger)
  }
}

/** De routes van deze ritten als ze allemaal al binnen zijn; anders niets. */
export function routesUitGeheugen(kaart: string, legs: RitVraag[]): TripRoute[] | undefined {
  meldAan()
  const uit: TripRoute[] = []
  for (const leg of legs) {
    const route = geheugen.get(sleutelIn(kaart, leg))
    if (!route) return undefined
    uit.push(route)
  }
  return uit
}

/**
 * De route van elke rit, per rit -- ritten met dezelfde route krijgen hetzelfde
 * voorwerp. Alleen wat nog niet binnen of onderweg is, gaat naar het
 * hoofdproces, en dan elke rit één keer.
 */
export async function haalRoutes(kaart: string, legs: RitVraag[]): Promise<Array<TripRoute | undefined>> {
  meldAan()
  const { uniek, plek } = uniekeRitten(legs.map(({ tripFile, stopIds }) => ({ tripFile, stopIds })))
  const nodig = uniek.filter((leg) => {
    const sleutel = sleutelIn(kaart, leg)
    return !geheugen.has(sleutel) && !onderweg.has(sleutel)
  })
  if (nodig.length > 0) {
    const toen = generatie
    const vraag = window.career.routes(kaart, nodig) as Promise<Array<TripRoute | undefined>>
    nodig.forEach((leg, i) => {
      const sleutel = sleutelIn(kaart, leg)
      const een: Promise<TripRoute | undefined> = vraag
        .then((gevonden) => {
          const route = gevonden?.[i]
          // Van vóór een `vergeetRoutes`: wel teruggeven, niet onthouden.
          if (route && toen === generatie) bewaar(sleutel, route)
          return route
        })
        .finally(() => {
          if (onderweg.get(sleutel) === een) onderweg.delete(sleutel)
        })
      onderweg.set(sleutel, een)
    })
  }
  const per = await Promise.all(
    uniek.map((leg) => {
      const sleutel = sleutelIn(kaart, leg)
      return geheugen.get(sleutel) ?? onderweg.get(sleutel)
    })
  )
  return plek.map((i) => per[i])
}
