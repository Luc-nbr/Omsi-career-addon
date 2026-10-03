import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import type { MapGeometry, StopPoint } from '../../core/geo'
import type { TripRoute } from '../../core/routing'
import type { Duty } from '../../core/types'
import { nearestAlong, pointAlong, trackAlong, type Track } from '../../shared/spoor'
import { ritSleutel } from '../../shared/traject'
import { LijnLaag } from './lijnLaag'
import { useT } from './language'
import { RoadLayer } from './roadLayer'
import {
  haalRoutes,
  routeGeneratie,
  routesUitGeheugen,
  schermPad,
  trajectenVan,
  vereenvoudigd,
  volgRoutes,
  type Beeld,
  type Stuk
} from './trajecten'
import './routemap.css'

/** Een halte zoals hij op de route voorkomt, met zijn plek in de volgorde. */
export interface RouteStop extends StopPoint {
  /** Hoeveelste halte van de hele dienst, over de ritten heen. */
  order: number
  /** Hoeveelste halte binnen de rit, zoals de dienst hem opsomt. */
  at: number
  legIndex: number
  /** Eerste halte van de dienst: hier zet je de bus neer. */
  isStart: boolean
  /** Laatste halte van de dienst. */
  isEnd: boolean
}

interface View {
  /** Middelpunt van het beeld, in meters op de kaart. */
  cx: number
  cy: number
  /** Meters per beeldpunt: groter is verder weg. */
  mpp: number
  /** Koers die boven in beeld staat, in graden. Nul is noord boven; meerijdend de rijrichting. */
  rot: number
}

/** De bus zoals OMSI hem plaatst, uit het geheugen van het spel. */
export interface LiveVehicle {
  x: number
  y: number
  heading: number
  speedKmh: number
}

interface Props {
  /**
   * De dienst die als route getekend wordt.
   *
   * Mag ontbreken. Dan tekent hij alleen wat de kaart zelf is -- de wegen en de
   * haltes -- en dat is precies wat de kaartstap laat zien zodra je een kaart
   * aanwijst: het netwerk waar je straks op rijdt, zonder dat er al een dienst
   * gekozen is.
   */
  duty?: Duty
  geometry: MapGeometry
  /** Halte waar de bus nu heen rijdt; alles daarvoor vergrijst. */
  nextStopId?: string
  /** In het venster is meer ruimte, dus meer namen en grotere borden. */
  variant?: 'panel' | 'full'
  /** Halte die de gebruiker elders aanwees; die springt in beeld. */
  focusStopId?: string
  /**
   * Geeft zoomen en centreren naar buiten door, zodat een scherm er eigen
   * knoppen op kan zetten. Optioneel: de overlay gebruikt alleen wiel en slepen.
   */
  bediening?: (b: { zoomBy: (factor: number) => void; refit: () => void }) => void
  /**
   * Het stuk weg waar de bus nu op rijdt: van de vorige halte naar de volgende.
   * Staat dit aan, dan houdt de kaart dat stuk in beeld in plaats van de hele
   * dienst -- ingezoomd genoeg om de straat te kunnen volgen.
   */
  follow?: { fromId?: string; toId?: string }
  /**
   * De rit waar het nu om gaat. Een dienst rijdt heen en terug over dezelfde
   * straat, langs de haltepalen aan weerskanten; alle ritten even fel tekenen
   * levert een dubbele lijn met pijlen die elkaar tegenspreken. Deze rit komt
   * naar voren, de rest blijft als flauwe lijn staan.
   */
  activeLeg?: number
  /**
   * Alleen de rit `activeLeg` als route tekenen, en de rest niet. In de overlay
   * verschijnt de route pas als de IBIS is ingetoetst: daarvoor weet niemand
   * welke rit er gereden wordt, en is elke lijn een gok.
   */
  routeMode?: 'all' | 'active' | 'none'
  /**
   * Waar de bus is, voor zover we dat weten. OMSI geeft geen positie door, maar
   * wel de volgende halte (uit de IBIS) en de kilometerteller. Vanaf de vorige
   * halte schuift de bus zoveel meter over de route op, en nooit voorbij de
   * volgende. De kaart rijdt dan met hem mee.
   */
  bus?: { legIndex: number; nextStop: number; metresSinceStop?: number }
  /**
   * De echte plek van de bus. Is die er, dan rijdt de kaart mee zoals een
   * navigatiesysteem: rijrichting boven, soepel, en verder uitgezoomd naarmate de
   * bus harder gaat. Hij gaat voor op de schatting in `bus`.
   */
  vehicle?: LiveVehicle
  /** Teksten van de overlay, die zijn eigen taalkeuze heeft. */
  texts?: { waiting?: string; busNote?: string; centre?: string }
  /** Wat er aan manoeuvre voor je ligt; de navigatiebalk tekent hem. */
  onManoeuvre?(manoeuvre: Manoeuvre | undefined): void
  /** De snelheid van het laatste bord dat je voorbij bent; niets als er geen staat. */
  onSpeedLimit?(kmh: number | undefined): void
  /**
   * Vergroting van het venster waar de kaart in hangt. Het wegennet staat op een
   * canvas; zonder deze factor wordt dat bij vergroten uitgerekt en dus wazig.
   */
  pixelScale?: number
  /**
   * Automatisch meezoomen met de snelheid, of een vaste stand. Alleen bij het
   * meerijden; zonder deze prop zoomt de kaart automatisch, zoals altijd.
   */
  zoom?: NavZoom
  /**
   * Waar de omgeving iets over de kaart legt (een balk, knoppen), in punten van
   * de kaart. Daar komt geen haltenaam: hij zou eronder verdwijnen.
   */
  bezet?: (w: number, h: number) => Array<{ x: number; y: number; w: number; h: number }>
  /**
   * Vrij rijden: naar de eerste halte van een rit die nog niet begonnen is.
   * Een rechte lijn van de bus naar de halte, gestreept: er is (nog) geen
   * route berekend, dus hij mag niet lezen als een weg (kaartmeters).
   */
  aanrij?: { punten: [number, number, number, number] }
  /**
   * De vlootkaart van het busbedrijf (ontwerp busbedrijf-planning §8.3): alle
   * bussen van de dag op hun plek, de lijnen van de concessies eronder, en een
   * zwevend kaartje boven de bus die je aanklikt. Erbij, niet in plaats van:
   * zonder `vloot` is de kaart precies wat hij was.
   */
  vloot?: VlootLaag
}

/** Een bus op de vlootkaart. */
export interface VlootBus {
  id: string
  /** In kaartmeters. */
  x: number
  y: number
  /** Koers in graden, noord nul, met de klok mee. */
  koers: number
  /** Wie er rijdt: dat is de kleur. */
  toon: 'eigen' | 'jij' | 'uitzend' | 'onder' | 'uit'
  label: string
  /** Valt uit: een gestreepte bus op de plek waar hij had moeten zijn. */
  spook?: boolean
}

export interface VlootLaag {
  bussen: VlootBus[]
  gekozen?: string
  onKies?(id: string | undefined): void
  /** De kaart houdt de gekozen bus in het midden, met dezelfde rust na slepen als bij het meerijden. */
  volg?: boolean
  /** Hangt boven de gekozen bus en beweegt met hem mee. */
  zweef?: ReactNode
  /** De routes van de concessies, plat als x, y, x, y in kaartmeters. */
  lijnen?: number[][]
  /** De haltes van de concessies; die krijgen een bord. */
  haltes?: string[]
}

/**
 * De zoomstand van de navigatie. `vast` leeg: automatisch, verder uit naarmate
 * de bus harder gaat (`liveZoom`). Anders blijft de kaart op die stand, in
 * meter per punt; in- en uitzoomen verzet dan de vaste stand in plaats van
 * na zes tellen terug te veren. Gebruikers vroegen daarom: bij sommigen deed
 * het uitzoomen bij hogere snelheid de straat onleesbaar klein.
 */
export interface NavZoom {
  vast?: number
  kies(mpp: number | undefined): void
}

/** Grenzen aan een vaste stand: tot op de stoeprand, en tot waar een straat nog te volgen is. */
const VAST_MIN_MPP = 0.2
const VAST_MAX_MPP = 6

const MIN_MPP = 0.2
const MAX_MPP = 60

/**
 * Grenzen voor het meerijdende beeld. Onder de ondergrens kijk je naar losse
 * stoeptegels, boven de bovengrens is de straat niet meer te volgen.
 */
const FOLLOW_MIN_MPP = 0.35
const FOLLOW_MAX_MPP = 2.2
/** Lucht om het stuk weg heen, zodat je ziet wat eraan komt. */
const FOLLOW_PAD_M = 130

/** Namen van andere haltes verschijnen pas als je dicht genoeg bent. */
const OTHER_LABEL_MPP = 2.5
const ROUTE_LABEL_MPP = 14

/**
 * De manoeuvre die eraan komt: rechtdoor, of een bocht met de afstand erbij.
 *
 * Een navigatie die altijd een afslagpijl laat zien, zegt niets. Deze kijkt
 * tweehonderd meter vooruit langs de route en telt de bocht op; pas als de weg
 * echt draait staat er een pijl die die kant op wijst.
 */
export interface Manoeuvre {
  kind: 'rechtdoor' | 'links' | 'rechts'
  /** Meters tot het begin van de bocht; alleen bij een bocht. */
  metres?: number
}

/** Zo dicht moet een snelheidsbord bij de route staan om erbij te horen. */
const SIGN_NEAR_M = 12

/** Zover kijkt de navigatie vooruit voor de volgende manoeuvre. */
const LOOKAHEAD_M = 200
/** Minder dan zoveel graden verschil is een slinger in de weg, geen afslag. */
const TURN_DEG = 32
/** Over hoeveel meter die draai gemaakt moet zijn om als afslag te tellen. */
const TURN_SPAN_M = 60

/** Zoveel meter voorbij een halte telt hij pas als gehad. */
const STOP_PASSED_M = 12

/** Wie de kaart zelf versleept of zoomt, krijgt zoveel rust voordat hij terugveert naar de bus. */
const MANUAL_MS = 6000
/** Zo ver ingezoomd (hoogstens) zet de vlootkaart een gekozen bus in beeld. */
const VLOOT_VOLG_MPP = 2.5
/** Minder beweging dan dit tussen neerdrukken en loslaten is een klik, geen sleep. */
const KLIK_PX = 5

/** Zoomstand als de kaart met de bus meerijdt: straten en zijstraten zijn nog te lezen. */
const BUS_MPP = 0.9

/**
 * Meerijden als een navigatiesysteem: langzaam rijden zoomt in, harder rijden
 * zoomt uit, zodat je de volgende kruising ruim ziet aankomen. De bus staat
 * onder het midden, want wat voor je ligt telt zwaarder dan wat achter je ligt.
 */
const LIVE_MAX_MPP = 2
const LIVE_AHEAD = 0.22

/**
 * Stapvoets hoort de kaart op vijfentwintig meter te staan.
 *
 * Dat is de stand waarin je de halte, de inrit en de stoeprand nog uit elkaar
 * houdt -- precies wat je nodig hebt als je langzaam rijdt, want dan ben je aan
 * het aanrijden, keren of invoegen. De schaalbalk van de navigatie mikt op
 * negentig punten breed, dus vijfentwintig meter valt op 25/90 meter per punt.
 */
const SLOW_KMH = 30
const SLOW_MPP = 25 / 90

/** En bij deze snelheid is hij helemaal uitgezoomd. */
const FAST_KMH = 80

/** Hoeveel meter per punt erbij komt boven stapvoets. */
const LIVE_MPP_PER_KMH = (LIVE_MAX_MPP - SLOW_MPP) / (FAST_KMH - SLOW_KMH)

/**
 * De zoomstand die bij een snelheid hoort. Onder de stapvoetsgrens vast op
 * vijfentwintig meter, daarboven vloeiend verder open -- zonder sprong op de
 * grens zelf, want een kaart die bij precies dertig ineens wegspringt leest als
 * een storing.
 */
export function liveZoom(speedKmh: number): number {
  if (!(speedKmh > SLOW_KMH)) return SLOW_MPP
  return Math.min(LIVE_MAX_MPP, SLOW_MPP + (speedKmh - SLOW_KMH) * LIVE_MPP_PER_KMH)
}
/** Hoe snel de getoonde bus de gemeten plek volgt, in seconden; kleiner is strakker. */
const LIVE_SMOOTH_S = 0.18
/** Zo ver rekent de kaart vooruit op de snelheid, tussen twee metingen in. */
const LIVE_PREDICT_S = 0.3
const LIVE_FRAME_MS = 33

export function RouteMap({
  duty,
  geometry,
  nextStopId,
  variant = 'panel',
  focusStopId,
  follow,
  activeLeg,
  routeMode = 'all',
  bus,
  vehicle,
  texts,
  onManoeuvre,
  onSpeedLimit,
  pixelScale = 1,
  bediening,
  zoom,
  bezet,
  aanrij,
  vloot
}: Props): JSX.Element {
  const tr = useT()
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 640, h: 320 })
  const [view, setView] = useState<View>({ cx: 0, cy: 0, mpp: 8, rot: 0 })
  const [hovered, setHovered] = useState<string>()
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | undefined>(undefined)
  /*
   * Vingers op het scherm, voor het knijpen met twee.
   *
   * Op een telefoon of tablet is er geen muiswiel en zijn de plus- en
   * minknopjes klein werk tijdens het rijden. Twee vingers uit elkaar is wat
   * iedereen daar doet. De kaart houdt daarom bij welke vingers er liggen;
   * zodra dat er twee zijn, bepaalt hun afstand de schaal en hun midden het
   * punt dat onder je vingers blijft liggen.
   */
  const vingers = useRef(new Map<number, { x: number; y: number }>())
  const knijp = useRef<{ afstand: number; midX: number; midY: number } | undefined>(undefined)

  const byId = useMemo(() => new Map(geometry.stops.map((stop) => [stop.id, stop])), [geometry])

  /** De haltes van de dienst op volgorde, zonder de herhalingen eruit te gooien. */
  const legs = useMemo(() => {
    let order = 0
    return (duty?.legs ?? []).map((leg, legIndex) =>
      leg.stopIds
        .map((id, at) => {
          const point = byId.get(id)
          if (!point) return undefined
          const stop: RouteStop = {
            ...point,
            name: leg.stops[at] || point.name,
            order: order++,
            at,
            legIndex,
            isStart: legIndex === 0 && at === 0,
            isEnd:
              legIndex === (duty?.legs.length ?? 0) - 1 && at === leg.stopIds.length - 1
          }
          return stop
        })
        .filter((stop): stop is RouteStop => Boolean(stop))
    )
  }, [duty, byId])

  /*
   * Een halte van de dienst die niet op de kaart gevonden wordt, krijgt geen
   * bord en geen naam -- en dan mis je hem zonder te weten waarom. Eén regel
   * in het logboek per dienst, met de ids, zodat het na te zoeken is
   * (`scripts/probe-stopobjects.ts`).
   */
  const gemeldMissend = useRef('')
  useEffect(() => {
    if (!duty || geometry.stops.length === 0) return
    const missend = [
      ...new Set(duty.legs.flatMap((leg) => leg.stopIds.map((id, at) => (byId.has(id) ? '' : `${leg.stops[at] ?? '?'} (${id})`)).filter(Boolean)))
    ]
    const sleutel = `${duty.mapFolder}|${missend.join(',')}`
    if (missend.length === 0 || gemeldMissend.current === sleutel) return
    gemeldMissend.current = sleutel
    void window.career?.logboekMelden?.(
      `navigatie: ${missend.length} halte(s) van de dienst niet op de kaart van ${duty.mapFolder} gevonden: ${missend.slice(0, 12).join(', ')}`
    )
  }, [duty, geometry, byId])

  /** Elke halte een keer, voor de borden. De eerste vermelding telt. */
  const vlootHaltes = vloot?.haltes
  const routeStops = useMemo(() => {
    // De vlootkaart heeft geen dienst; daar zijn het de haltes van de concessies.
    if (!duty && vlootHaltes) {
      return vlootHaltes
        .map((id) => byId.get(id))
        .filter((p): p is StopPoint => p !== undefined)
        .map((p, i): RouteStop => ({ ...p, order: i, at: i, legIndex: 0, isStart: false, isEnd: false }))
    }
    const seen = new Map<string, RouteStop>()
    for (const leg of legs) {
      for (const stop of leg) {
        const known = seen.get(stop.id)
        if (!known) seen.set(stop.id, stop)
        else if (stop.isEnd) seen.set(stop.id, { ...known, isEnd: true })
      }
    }
    return [...seen.values()]
  }, [legs, duty, vlootHaltes, byId])

  /*
   * Elk bordje één keer. `routeStops` heeft al elke halte één keer, maar op
   * sommige kaarten staan twee haltes met een eigen id op precies dezelfde
   * plek (17 op één kaart bij Luc): dan kwamen er twee borden op elkaar. Per
   * halve meter één bord, dat voor alle haltes daar spreekt -- de eerste
   * vermelding, en dus ook het begin van de dienst, is het gezicht.
   */
  const borden = useMemo(() => {
    const opPlek = new Map<string, { stop: RouteStop; ids: string[] }>()
    const van = new Map<string, { stop: RouteStop; ids: string[] }>()
    for (const stop of routeStops) {
      const plek = `${Math.round(stop.x * 2)},${Math.round(stop.y * 2)}`
      const bord = opPlek.get(plek)
      if (bord) {
        bord.ids.push(stop.id)
        if (stop.isEnd && !bord.stop.isEnd) bord.stop = { ...bord.stop, isEnd: true }
        van.set(stop.id, bord)
      } else {
        const nieuw = { stop, ids: [stop.id] }
        opPlek.set(plek, nieuw)
        van.set(stop.id, nieuw)
      }
    }
    return { lijst: [...opPlek.values()], van, plekken: new Set(opPlek.keys()) }
  }, [routeStops])

  const start = routeStops.find((stop) => stop.isStart)

  /*
   * De weg die elke rit rijdt, uitgerekend in het hoofdproces. Zolang die er niet
   * is, lopen de lijnen recht van halte naar halte. De sleutel is een tekst en
   * geen object: de overlay krijgt elke tel een nieuwe kopie van dezelfde dienst.
   *
   * Elke rit één keer gevraagd, en onthouden (trajecten.ts): wat al binnen is
   * staat er meteen, zonder eerst rechte lijnen. De routes horen bij hun
   * sleutel: bij een andere dienst tekende de kaart eerst één beeld lang de
   * nieuwe ritten met de routes van de vorige.
   */
  const routeKey = `${duty?.mapFolder ?? ''}|${(duty?.legs ?? [])
    .map((leg) => `${leg.tripFile}:${leg.stopIds.join(',')}`)
    .join(';')}`
  /*
   * Telt op als het hoofdproces de kaarten vergat (trajecten.ts): de onthouden
   * routes zijn dan weg, en deze kaart vraagt ze opnieuw.
   */
  const generatie = useSyncExternalStore(volgRoutes, routeGeneratie, routeGeneratie)
  const vraagSleutel = `${generatie}|${routeKey}`
  const [opgehaald, setOpgehaald] = useState<{ sleutel: string; routes: Array<TripRoute | undefined> }>()
  const routes = useMemo(() => {
    if (opgehaald?.sleutel === vraagSleutel) return opgehaald.routes
    // Zonder dienst valt er geen weg te plannen; de kaart blijft dan het net.
    if (!duty || duty.legs.length === 0) return undefined
    return routesUitGeheugen(duty.mapFolder, duty.legs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vraagSleutel, opgehaald])
  useEffect(() => {
    /*
     * Alleen als deze tekening ze niet al had. Niet het geheugen opnieuw
     * lezen: kwam een antwoord van een eerdere vraag binnen tussen het tekenen
     * en dit effect, dan had de tekening nog niets, gaf het geheugen nu wel
     * iets, en bleef de kaart zonder vraag en zonder nieuwe tekening op rechte
     * lijnen staan. Voor wat al binnen is, stuurt `haalRoutes` niets naar het
     * hoofdproces.
     */
    if (!duty || duty.legs.length === 0 || routes) return undefined
    let current = true
    const sleutel = vraagSleutel
    haalRoutes(duty.mapFolder, duty.legs)
      .then((found) => {
        if (current) setOpgehaald({ sleutel, routes: found })
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vraagSleutel])

  /** Waar de route ligt, met wat lucht eromheen. */
  const vlootLijnen = vloot?.lijnen
  const bounds = useMemo(() => {
    // De vlootkaart past op de lijnen van de concessies.
    if (vlootLijnen && vlootLijnen.some((l) => l.length >= 4)) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const lijn of vlootLijnen) {
        for (let i = 0; i + 1 < lijn.length; i += 2) {
          if (lijn[i] < minX) minX = lijn[i]
          if (lijn[i] > maxX) maxX = lijn[i]
          if (lijn[i + 1] < minY) minY = lijn[i + 1]
          if (lijn[i + 1] > maxY) maxY = lijn[i + 1]
        }
      }
      return { minX, minY, maxX, maxY }
    }
    const points = routeStops.length > 0 ? routeStops : geometry.stops
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    return {
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y))
    }
  }, [routeStops, geometry, vlootLijnen])

  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        w: Math.max(160, Math.round(entry.contentRect.width)),
        h: Math.max(140, Math.round(entry.contentRect.height))
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const vlootVolgt = Boolean(vloot?.volg && vloot.gekozen)
  const following = Boolean(follow?.toId) || Boolean(bus) || Boolean(vehicle) || vlootVolgt

  const fitted = useRef<string>('')
  useEffect(() => {
    // Rijdt de kaart mee, dan bepaalt het stuk weg het beeld en niet de dienst.
    // Een aangewezen halte gaat ook voor; die zet het effect hieronder in beeld.
    if (following || (focusStopId && byId.has(focusStopId))) return
    const key = `${duty?.tourNumber ?? 'net'}|${bounds.minX}|${bounds.minY}|${size.w}x${size.h}`
    if (fitted.current === key) return
    fitted.current = key
    const pad = 80
    const spanX = Math.max(60, bounds.maxX - bounds.minX)
    const spanY = Math.max(60, bounds.maxY - bounds.minY)
    setView({
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
      mpp: clamp(
        Math.max(spanX / Math.max(1, size.w - pad), spanY / Math.max(1, size.h - pad)),
        MIN_MPP,
        MAX_MPP
      ),
      rot: 0
    })
  }, [duty?.tourNumber, bounds, size, following, focusStopId, byId])

  /*
   * Meerijden: het stuk van de vorige naar de volgende halte vult het beeld.
   * Een eigen positie geeft OMSI niet door -- de plugin-API kent er geen
   * variabele voor -- maar het weggedeelte tussen twee haltes is precies waar
   * je op zit, en dat is wat je wilt zien.
   */
  useEffect(() => {
    if (!follow?.toId) return
    const to = byId.get(follow.toId)
    if (!to) return
    const from = follow.fromId ? byId.get(follow.fromId) : undefined
    const xs = from ? [from.x, to.x] : [to.x]
    const ys = from ? [from.y, to.y] : [to.y]
    const spanX = Math.max(...xs) - Math.min(...xs) + FOLLOW_PAD_M * 2
    const spanY = Math.max(...ys) - Math.min(...ys) + FOLLOW_PAD_M * 2
    setView({
      cx: (Math.max(...xs) + Math.min(...xs)) / 2,
      cy: (Math.max(...ys) + Math.min(...ys)) / 2,
      mpp: clamp(
        Math.max(spanX / Math.max(1, size.w), spanY / Math.max(1, size.h)),
        FOLLOW_MIN_MPP,
        FOLLOW_MAX_MPP
      ),
      rot: 0
    })
  }, [follow?.fromId, follow?.toId, byId, size])

  // Een halte die elders is aangewezen halen we in beeld.
  useEffect(() => {
    if (!focusStopId) return
    const stop = byId.get(focusStopId)
    if (stop) setView((old) => ({ ...old, cx: stop.x, cy: stop.y, mpp: Math.min(old.mpp, 1.6) }))
  }, [focusStopId, byId])

  /**
   * De lijn over de weg van één rit, met de afstand langs die lijn bij elke
   * halte. Alleen voor de rit die gereden wordt (en die van de bus): voor de
   * andere vijfentwintig van een omloop rekende de kaart dit eerst ook uit, bij
   * elke nieuwe kopie van de dienst. Ritten met dezelfde route en haltes delen
   * de uitkomst.
   */
  const spoor = useMemo(() => {
    const bewaard = new Map<string, Track | undefined>()
    return (legIndex: number | undefined): Track | undefined => {
      if (legIndex === undefined) return undefined
      const leg = duty?.legs[legIndex]
      const route = routes?.[legIndex]?.points
      if (!leg || !route || route.length < 4) return undefined
      const sleutel = ritSleutel(leg)
      if (!bewaard.has(sleutel)) {
        bewaard.set(
          sleutel,
          trackAlong(
            route,
            leg.stopIds.map((id) => byId.get(id))
          )
        )
      }
      return bewaard.get(sleutel)
    }
    // routeKey en niet duty: de overlay krijgt elke tel een nieuwe kopie van dezelfde dienst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, routes, byId])

  const busPoint = useMemo(() => {
    if (!bus) return undefined
    const track = spoor(bus.legIndex)
    const leg = duty?.legs[bus.legIndex]
    if (!track || !leg || leg.stopIds.length === 0) return undefined
    const next = Math.min(Math.max(bus.nextStop, 0), leg.stopIds.length - 1)
    const previous = next > 0 ? track.stops[next - 1] : undefined
    const upcoming = track.stops[next]
    let along: number
    if (previous === undefined) {
      // Nog voor de eerste halte, of de vorige staat niet op de kaart: bij de volgende.
      along = upcoming ?? 0
    } else {
      along = previous + Math.max(0, bus.metresSinceStop ?? 0)
      if (upcoming !== undefined && upcoming >= previous) along = Math.min(along, upcoming)
    }
    return pointAlong(track, along)
  }, [bus, spoor, duty])

  /*
   * Meerijden met de bus. Wie zelf sleept of zoomt krijgt MANUAL_MS rust, daarna
   * veert de kaart terug. Zoomen mag blijven staan, tenzij het zo ver uit is dat
   * je de straat niet meer kunt volgen.
   */
  const manualUntil = useRef(0)
  const busRef = useRef(busPoint)
  busRef.current = busPoint
  const centreOnBus = useCallback((force: boolean) => {
    if (force) manualUntil.current = 0
    const point = busRef.current
    if (!point) return
    if (!force && Date.now() < manualUntil.current) return
    setView((old) => {
      const mpp = old.mpp <= FOLLOW_MAX_MPP * 2 ? old.mpp : BUS_MPP
      if (Math.abs(old.cx - point.x) < 0.05 && Math.abs(old.cy - point.y) < 0.05 && mpp === old.mpp) return old
      return { cx: point.x, cy: point.y, mpp, rot: 0 }
    })
  }, [])
  useEffect(() => centreOnBus(false), [busPoint, centreOnBus])
  const hasBus = Boolean(busPoint)
  useEffect(() => {
    if (!hasBus) return
    const timer = window.setInterval(() => centreOnBus(false), 500)
    return () => window.clearInterval(timer)
  }, [hasBus, centreOnBus])
  const markManual = (): void => {
    if (bus || vehicle || vloot?.volg) manualUntil.current = Date.now() + MANUAL_MS
  }

  /*
   * De vlootkaart volgt de bus die je aanklikt, op dezelfde manier als het
   * meerijden hierboven: het midden op de bus, noord boven, en na slepen of
   * zoomen MANUAL_MS rust. Bij het kiezen zoomt hij in tot je de straat ziet,
   * maar niet verder dan je zelf al stond.
   */
  const gekozenBus = vloot?.gekozen ? vloot.bussen.find((b) => b.id === vloot.gekozen) : undefined
  const gekozenRef = useRef(gekozenBus)
  gekozenRef.current = gekozenBus
  const gekozenId = gekozenBus?.id
  const volgVloot = useCallback((force: boolean) => {
    const doel = gekozenRef.current
    if (!doel || !Number.isFinite(doel.x) || !Number.isFinite(doel.y)) return
    if (force) manualUntil.current = 0
    if (!force && Date.now() < manualUntil.current) return
    setView((old) => {
      const mpp = force ? Math.min(old.mpp, VLOOT_VOLG_MPP) : old.mpp
      if (Math.abs(old.cx - doel.x) < 0.05 && Math.abs(old.cy - doel.y) < 0.05 && mpp === old.mpp && old.rot === 0) return old
      return { cx: doel.x, cy: doel.y, mpp, rot: 0 }
    })
  }, [])
  // Een andere bus gekozen, of volgen aangezet: meteen erheen.
  useEffect(() => {
    if (vlootVolgt) volgVloot(true)
  }, [gekozenId, vlootVolgt, volgVloot])
  // En daarna mee, bij elke nieuwe plek van de bus.
  useEffect(() => {
    if (vlootVolgt) volgVloot(false)
  }, [gekozenBus?.x, gekozenBus?.y, vlootVolgt, volgVloot])

  /*
   * Een vaste zoomstand volgt wat je zelf kiest. Wie met het wieltje, twee
   * vingers of de knoppen zoomt terwijl de stand vastligt, verzet die stand:
   * een halve tel nadat het zoomen stopt wordt hij bewaard. Alleen tijdens
   * eigen bediening -- het meerijden zelf zet de kaart op de vaste stand en
   * mag die niet terugschrijven.
   */
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const z = zoomRef.current
    if (z?.vast === undefined || !(bus || vehicle) || Date.now() >= manualUntil.current) return
    if (Math.abs(view.mpp - z.vast) < z.vast * 0.02) return
    const mpp = clamp(view.mpp, VAST_MIN_MPP, VAST_MAX_MPP)
    const timer = window.setTimeout(() => zoomRef.current?.kies(mpp), 500)
    return () => window.clearTimeout(timer)
  }, [view.mpp, bus, vehicle])

  /*
   * Meerijden met de echte bus. De plugin meet tien keer per seconde; daartussen
   * glijdt de getoonde bus naar de laatste meting en rekent hij een fractie van een
   * seconde vooruit op de snelheid, zodat de kaart niet schokt maar schuift. De
   * kaart draait met de rijrichting mee en zoomt uit naarmate de bus harder gaat.
   */
  const vehicleRef = useRef<{ data: LiveVehicle; at: number } | undefined>(undefined)
  useEffect(() => {
    vehicleRef.current = vehicle ? { data: vehicle, at: performance.now() } : undefined
  }, [vehicle?.x, vehicle?.y, vehicle?.heading, vehicle?.speedKmh])
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [liveBus, setLiveBus] = useState<{ x: number; y: number; heading: number }>()

  /**
   * Hoeveel meter de bus over de route van deze rit is.
   *
   * Uit de kilometerteller volgt dat rechtstreeks. Leest de app de plek uit het
   * geheugen van OMSI, dan is er alleen een punt in de wereld; dat wordt op de
   * route gelegd, en pas vanaf de vorige halte gezocht -- een rit komt vaak twee
   * keer door dezelfde straat, en zonder die ondergrens springt de streep terug.
   */
  const progressAlong = useMemo(() => {
    if (activeLeg === undefined) return undefined
    const track = spoor(activeLeg)
    if (!track) return undefined

    if (liveBus) {
      const leg = duty?.legs[activeLeg]
      const next = bus ? Math.min(Math.max(bus.nextStop, 0), (leg?.stopIds.length ?? 1) - 1) : 0
      const from = next > 0 ? (track.stops[next - 1] ?? 0) : 0
      return nearestAlong(track, liveBus.x, liveBus.y, from)
    }

    if (!bus || bus.legIndex !== activeLeg) return undefined
    const leg = duty?.legs[activeLeg]
    if (!leg || leg.stopIds.length === 0) return undefined
    const next = Math.min(Math.max(bus.nextStop, 0), leg.stopIds.length - 1)
    const previous = next > 0 ? track.stops[next - 1] : undefined
    const upcoming = track.stops[next]
    if (previous === undefined) return upcoming ?? 0
    const along = previous + Math.max(0, bus.metresSinceStop ?? 0)
    return upcoming !== undefined && upcoming >= previous ? Math.min(along, upcoming) : along
  }, [activeLeg, spoor, liveBus, bus, duty])
  /*
   * Waar de weg voor je draait.
   *
   * We lopen de route vooruit en tellen per stuk hoeveel graden hij van koers
   * verandert. Draait hij binnen zestig meter meer dan tweeëndertig graden, dan
   * is dat een afslag en niet een slinger; het teken zegt of het naar links of
   * naar rechts gaat. Gebeurt dat niet binnen tweehonderd meter, dan is het
   * rechtdoor.
   */
  const manoeuvre = useMemo<Manoeuvre | undefined>(() => {
    if (activeLeg === undefined || progressAlong === undefined) return undefined
    const track = spoor(activeLeg)
    if (!track || track.points.length < 8) return undefined
    const { points, cumulative } = track
    const einde = cumulative[cumulative.length - 1]
    const at = clamp(progressAlong, 0, einde)

    // De punten staan plat achter elkaar: x, y, x, y. De afstanden in
    // `cumulative` horen bij die punten, dus per twee getallen een.
    const koers = (i: number): number => {
      const dx = points[(i + 1) * 2] - points[i * 2]
      const dy = points[(i + 1) * 2 + 1] - points[i * 2 + 1]
      return (Math.atan2(dx, dy) * 180) / Math.PI
    }
    const verschil = (a: number, b: number): number => {
      let d = a - b
      while (d > 180) d -= 360
      while (d < -180) d += 360
      return d
    }

    let i = 0
    while (i < cumulative.length - 2 && cumulative[i + 1] < at) i++

    let som = 0
    let begin: number | undefined
    const aantal = Math.min(cumulative.length, Math.floor(points.length / 2))
    for (let k = i; k < aantal - 2; k++) {
      const afstand = cumulative[k] - at
      if (afstand > LOOKAHEAD_M) break
      const draai = verschil(koers(k + 1), koers(k))
      if (Math.abs(draai) < 1) {
        // Recht stuk: wat er tot nu toe gedraaid is telt niet meer mee.
        if (begin !== undefined && cumulative[k] - begin > TURN_SPAN_M) {
          som = 0
          begin = undefined
        }
        continue
      }
      if (begin === undefined || Math.sign(draai) !== Math.sign(som)) {
        begin = cumulative[k]
        som = 0
      }
      som += draai
      if (Math.abs(som) >= TURN_DEG) {
        return {
          kind: som > 0 ? 'rechts' : 'links',
          metres: Math.max(0, Math.round((begin - at) / 10) * 10)
        }
      }
    }
    return { kind: 'rechtdoor' }
  }, [activeLeg, spoor, progressAlong])

  /*
   * Naar boven doorgeven, en alleen als hij verandert: anders krijgt de balk bij
   * elk beeld een nieuw voorwerp en tekent hij zichzelf tien keer per seconde
   * opnieuw.
   */
  const laatsteManoeuvre = useRef('')
  useEffect(() => {
    const sleutel = manoeuvre ? `${manoeuvre.kind}|${manoeuvre.metres ?? ''}` : ''
    if (sleutel === laatsteManoeuvre.current) return
    laatsteManoeuvre.current = sleutel
    onManoeuvre?.(manoeuvre)
  }, [manoeuvre, onManoeuvre])

  /*
   * De snelheidsborden langs deze rit, op volgorde van hoe ver ze langs de
   * route liggen.
   *
   * Ze staan in paren, links en rechts van de weg -- het linker bord is voor het
   * verkeer dat de andere kant op komt. We houden alleen de rechter, want dat is
   * het bord dat over jou gaat.
   */
  const signsAlong = useMemo(() => {
    const track = spoor(activeLeg)
    const borden = geometry.limits
    if (!track || !borden || borden.length === 0) return []
    const { points, cumulative } = track
    const aantal = Math.min(cumulative.length, Math.floor(points.length / 2))
    const gevonden: Array<{ along: number; kmh: number }> = []

    for (const bord of borden) {
      let beste = Infinity
      let waar = 0
      let kant = 0
      for (let i = 1; i < aantal; i++) {
        const ax = points[(i - 1) * 2]
        const ay = points[(i - 1) * 2 + 1]
        const vx = points[i * 2] - ax
        const vy = points[i * 2 + 1] - ay
        const len2 = vx * vx + vy * vy
        const t = len2 > 0 ? clamp(((bord.x - ax) * vx + (bord.y - ay) * vy) / len2, 0, 1) : 0
        const d = Math.hypot(bord.x - (ax + vx * t), bord.y - (ay + vy * t))
        if (d < beste) {
          beste = d
          waar = cumulative[i - 1] + Math.sqrt(len2) * t
          kant = Math.sign(vx * (bord.y - ay) - vy * (bord.x - ax))
        }
        if (beste <= 0.5) break
      }
      // Rechts van de rijrichting, en dicht genoeg bij de weg.
      if (beste <= SIGN_NEAR_M && kant < 0) gevonden.push({ along: waar, kmh: bord.kmh })
    }
    return gevonden.sort((a, b) => a.along - b.along)
  }, [activeLeg, spoor, geometry.limits])

  /** Het laatste bord dat je voorbij bent; daarvoor geldt geen bord. */
  const speedLimit = useMemo(() => {
    if (progressAlong === undefined || signsAlong.length === 0) return undefined
    let kmh: number | undefined
    for (const bord of signsAlong) {
      if (bord.along > progressAlong) break
      kmh = bord.kmh
    }
    return kmh
  }, [signsAlong, progressAlong])

  const laatsteLimiet = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (laatsteLimiet.current === speedLimit) return
    laatsteLimiet.current = speedLimit
    onSpeedLimit?.(speedLimit)
  }, [speedLimit, onSpeedLimit])

  const hasVehicle = Boolean(vehicle)
  useEffect(() => {
    if (!hasVehicle) {
      setLiveBus(undefined)
      return
    }
    let frame = 0
    let last = performance.now()
    let shown: { x: number; y: number; heading: number; mpp: number } | undefined
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      if (now - last < LIVE_FRAME_MS) return
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const target = vehicleRef.current
      if (!target) return
      const age = Math.min(LIVE_PREDICT_S, (now - target.at) / 1000)
      const radians = (target.data.heading * Math.PI) / 180
      const metres = (target.data.speedKmh / 3.6) * age
      const tx = target.data.x + Math.sin(radians) * metres
      const ty = target.data.y + Math.cos(radians) * metres
      if (!shown || Math.hypot(tx - shown.x, ty - shown.y) > 80) {
        // Eerste meting, of de bus is verzet: meteen erheen, niet eroverheen glijden.
        shown = { x: tx, y: ty, heading: target.data.heading, mpp: shown?.mpp ?? BUS_MPP }
      } else {
        const step = 1 - Math.exp(-dt / LIVE_SMOOTH_S)
        shown.x += (tx - shown.x) * step
        shown.y += (ty - shown.y) * step
        shown.heading = (shown.heading + turn(shown.heading, target.data.heading) * step + 360) % 360
      }
      const wanted = zoomRef.current?.vast ?? liveZoom(target.data.speedKmh)
      shown.mpp += (wanted - shown.mpp) * (1 - Math.exp(-dt / 1.2))
      /*
       * Een glijdende beweging komt er nooit helemaal: hij blijft op een kruimel
       * na hangen. Dat is onzichtbaar op de kaart, maar niet op de schaalbalk --
       * die staat op vijfentwintig meter en springt van een honderdste te veel
       * naar vijftig. Dus dicht genoeg is aangekomen.
       */
      if (Math.abs(wanted - shown.mpp) < wanted * 0.01) shown.mpp = wanted
      setLiveBus({ x: shown.x, y: shown.y, heading: shown.heading })
      if (Date.now() < manualUntil.current) return
      const ahead = sizeRef.current.h * LIVE_AHEAD * shown.mpp
      const facing = (shown.heading * Math.PI) / 180
      setView({
        cx: shown.x + Math.sin(facing) * ahead,
        cy: shown.y + Math.cos(facing) * ahead,
        mpp: shown.mpp,
        rot: shown.heading
      })
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [hasVehicle])

  const vlootVolgtRef = useRef(false)
  vlootVolgtRef.current = Boolean(vloot?.volg)

  // React luistert standaard passief naar het wieltje, dus zelf aanhaken —
  // anders scrollt de pagina mee terwijl je inzoomt.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (bus || vehicle || vlootVolgtRef.current) manualUntil.current = Date.now() + MANUAL_MS
      const rect = svg.getBoundingClientRect()
      const px = event.clientX - rect.left - size.w / 2
      const py = size.h / 2 - (event.clientY - rect.top)
      setView((old) => {
        const next = clamp(old.mpp * Math.exp(event.deltaY * 0.0012), MIN_MPP, MAX_MPP)
        // Het punt onder de muis blijft staan waar het staat, ook met een gedraaide kaart.
        const [ox, oy] = unrotate(px * old.mpp, py * old.mpp, old.rot)
        const [nx, ny] = unrotate(px * next, py * next, old.rot)
        return { ...old, mpp: next, cx: old.cx + ox - nx, cy: old.cy + oy - ny }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [size, bus, vehicle])

  /** Van kaartmeters naar schermpunten; de rijrichting staat boven als de kaart meedraait. */
  const toScreen = useCallback(
    (x: number, y: number): [number, number] => {
      const r = (view.rot * Math.PI) / 180
      const dx = x - view.cx
      const dy = y - view.cy
      return [
        size.w / 2 + (dx * Math.cos(r) - dy * Math.sin(r)) / view.mpp,
        size.h / 2 - (dx * Math.sin(r) + dy * Math.cos(r)) / view.mpp
      ]
    },
    [size, view]
  )

  /*
   * De kaart meet zichzelf terwijl je hem versleept.
   *
   * WAAROM
   * Een speler meldde dat de kaart hapert zodra er een dienst gekozen is, en
   * hier is dat niet na te maken: op deze machine haalt hij 144 beelden per
   * seconde, ook op HamburgLi20 met twintigduizend wegen. Wat traag is, is
   * iemands eigen machine, en die spreekt alleen via het logboek. Dus telt de
   * kaart tijdens een sleep zijn eigen beelden en meldt hij het als het
   * werkelijk hapert: één keer per kaart, met de getallen erbij die het
   * verschil kunnen verklaren -- hoeveel er getekend wordt, hoe groot het
   * venster is en hoe fijn het scherm.
   *
   * Alleen op het grote scherm. In de overlay hoort niets te meten dat zelf
   * tijd kost terwijl iemand rijdt.
   */
  const beelden = useRef<{ vorig: number; duur: number[] } | undefined>(undefined)
  const gemeld = useRef(false)

  const meetBeeld = (): void => {
    const staat = beelden.current
    if (!staat) return
    const nu = performance.now()
    if (staat.vorig > 0) staat.duur.push(nu - staat.vorig)
    staat.vorig = nu
    requestAnimationFrame(meetBeeld)
  }

  const meldTraagheid = (): void => {
    const staat = beelden.current
    beelden.current = undefined
    if (!staat || gemeld.current || variant !== 'full') return
    const duur = staat.duur
    if (duur.length < 20) return
    const gemiddeld = duur.reduce((a, b) => a + b, 0) / duur.length
    const traag = duur.filter((d) => d > 33).length
    // Pas melden als het echt hapert: een derde van de beelden te laat, of
    // gemiddeld onder de dertig per seconde.
    if (traag < duur.length / 3 && gemiddeld < 33) return
    gemeld.current = true
    const svg = svgRef.current
    void window.career.logboekMelden?.(
      `kaart hapert op ${duty?.mapFolder ?? 'zonder dienst'}: ` +
        `${Math.round(1000 / gemiddeld)} beelden/s, langste ${Math.round(Math.max(...duur))} ms, ` +
        `${traag} van ${duur.length} te laat; ` +
        `${svg?.querySelectorAll('*').length ?? 0} elementen, ` +
        `venster ${Math.round(size.w)}x${Math.round(size.h)}, ` +
        `scherm ${window.devicePixelRatio}x`
    )
  }

  /*
   * Een klik op de vlootkaart: neerdrukken en loslaten op bijna dezelfde plek.
   * Op een bus (`data-bus`, een onzichtbare cirkel ruim om de pijl) kiest hij
   * die bus; ernaast laat hij hem los. Pointer-events, dus ook met een vinger.
   */
  const klik = useRef<{ x: number; y: number; bus?: string; id: number } | undefined>(undefined)

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (vloot) {
      const raak = (event.target as Element).closest?.('[data-bus]')
      klik.current =
        vingers.current.size === 0
          ? { x: event.clientX, y: event.clientY, bus: raak?.getAttribute('data-bus') ?? undefined, id: event.pointerId }
          : undefined
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    markManual()
    vingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (vingers.current.size >= 2) {
      // Twee vingers: niet meer slepen, maar knijpen. Het begin wordt bij de
      // eerste beweging gemeten, anders springt de kaart bij het neerzetten.
      dragRef.current = undefined
      knijp.current = undefined
      return
    }
    dragRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
    if (variant === 'full' && !gemeld.current) {
      beelden.current = { vorig: 0, duur: [] }
      requestAnimationFrame(meetBeeld)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (vingers.current.has(event.pointerId)) {
      vingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (vingers.current.size >= 2) {
      knijpen()
      return
    }
    const drag = dragRef.current
    if (!drag) return
    markManual()
    setView((old) => {
      const [dx, dy] = unrotate((event.clientX - drag.x) * old.mpp, -(event.clientY - drag.y) * old.mpp, old.rot)
      return { ...old, cx: drag.cx - dx, cy: drag.cy - dy }
    })
  }

  /*
   * Twee vingers: de afstand ertussen is de schaal, hun midden schuift de kaart.
   * Stap voor stap ten opzichte van de vorige beweging, want zo blijft het
   * kloppen als er een vinger van het scherm komt en weer terug.
   */
  const knijpen = (): void => {
    const svg = svgRef.current
    const [a, b] = [...vingers.current.values()]
    if (!svg || !a || !b) return
    const afstand = Math.hypot(a.x - b.x, a.y - b.y)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const vorig = knijp.current
    knijp.current = { afstand, midX, midY }
    if (!vorig || afstand < 1 || vorig.afstand < 1) return
    markManual()
    const rect = svg.getBoundingClientRect()
    const px = midX - rect.left - size.w / 2
    const py = size.h / 2 - (midY - rect.top)
    setView((old) => {
      const next = clamp(old.mpp * (vorig.afstand / afstand), MIN_MPP, MAX_MPP)
      // Het punt tussen je vingers blijft staan waar het staat, ook gedraaid.
      const [ox, oy] = unrotate(px * old.mpp, py * old.mpp, old.rot)
      const [nx, ny] = unrotate(px * next, py * next, old.rot)
      // En de kaart schuift mee met het midden van je vingers.
      const [sx, sy] = unrotate((midX - vorig.midX) * next, -(midY - vorig.midY) * next, old.rot)
      return { ...old, mpp: next, cx: old.cx + ox - nx - sx, cy: old.cy + oy - ny - sy }
    })
  }

  const endDrag = (event?: ReactPointerEvent<SVGSVGElement>): void => {
    const begin = klik.current
    klik.current = undefined
    if (
      vloot &&
      begin &&
      event?.type === 'pointerup' &&
      event.pointerId === begin.id &&
      Math.hypot(event.clientX - begin.x, event.clientY - begin.y) < KLIK_PX
    ) {
      // Een klik is geen eigen bediening: de kaart mag de bus meteen volgen.
      manualUntil.current = 0
      vloot.onKies?.(begin.bus)
    }
    if (event) vingers.current.delete(event.pointerId)
    else vingers.current.clear()
    if (vingers.current.size < 2) knijp.current = undefined
    /*
     * Blijft er één vinger liggen, dan gaat die verder met slepen vanaf waar
     * hij nu is; anders zou de kaart springen zodra je de andere optilt.
     */
    const over = [...vingers.current.values()][0]
    dragRef.current =
      vingers.current.size === 1 && over
        ? { x: over.x, y: over.y, cx: view.cx, cy: view.cy }
        : undefined
    if (vingers.current.size === 0) meldTraagheid()
  }

  const zoomBy = (factor: number): void => {
    markManual()
    setView((old) => ({ ...old, mpp: clamp(old.mpp * factor, MIN_MPP, MAX_MPP) }))
  }

  const refit = (): void => {
    fitted.current = ''
    setSize((old) => ({ ...old }))
  }

  /*
   * Zoomen en centreren zitten hier al, voor het muiswiel en het slepen. Het
   * opzetscherm wil er knoppen op zetten, dus geven we ze naar buiten door. Wie
   * `bediening` niet meegeeft -- de overlay -- merkt hier niets van.
   */
  useEffect(() => {
    bediening?.({ zoomBy, refit })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bediening])

  /* Het wegennet gaat op een canvas onder de SVG; zie roadLayer.ts waarom. */
  const roads = useMemo(() => new RoadLayer(geometry), [geometry])
  /* De lijnen van de vlootkaart op hetzelfde canvas, erbovenop (lijnLaag.ts). */
  const lijnLaag = useMemo(() => (vlootLijnen ? new LijnLaag(vlootLijnen) : undefined), [vlootLijnen])
  const drawnMpp = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Het venster kan vergroot staan; dan moet het canvas evenveel fijner.
    const dpr = (window.devicePixelRatio || 1) * pixelScale
    const width = Math.round(size.w * dpr)
    const height = Math.round(size.h * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const roadView = { ...view, rotation: view.rot, w: size.w, h: size.h, dpr }
    // Tijdens het zoomen de oude tekening schalen, en pas als het wieltje stil
    // is scherp opnieuw tekenen: uitgezoomd kost dat een tiende seconde.
    const zooming = drawnMpp.current !== 0 && drawnMpp.current !== view.mpp
    const teken = (exact: boolean): void => {
      roads.draw(ctx, roadView, exact)
      lijnLaag?.draw(ctx, roadView)
    }
    const frame = requestAnimationFrame(() => teken(!zooming))
    const settle = zooming
      ? window.setTimeout(() => {
          drawnMpp.current = view.mpp
          teken(true)
        }, 160)
      : undefined
    if (!zooming) drawnMpp.current = view.mpp
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [roads, lijnLaag, view, size, pixelScale])

  /** Hoever de dienst gevorderd is, als volgnummer van de eerstvolgende halte. */
  const passedBefore = useMemo(() => {
    if (!nextStopId) return -1
    for (const leg of legs) for (const stop of leg) if (stop.id === nextStopId) return stop.order
    return -1
  }, [legs, nextStopId])

  /**
   * Welke haltes je gehad hebt.
   *
   * Dat volgt uit waar de bus op de route staat en niet uit de halteteller van
   * de IBIS: die twee liepen uit de pas, waardoor haltes vóór de bus al
   * vergrijsden. Nu kleuren de lijn en de borden op dezelfde bron.
   *
   * Een halte die verderop nog een keer langskomt blijft groen; een rit doet
   * dezelfde straat vaak twee keer aan.
   */
  const passedStops = useMemo(() => {
    const state = new Map<string, boolean>()
    const track = spoor(activeLeg)
    for (const leg of legs) {
      for (const stop of leg) {
        let done = false
        if (activeLeg === undefined) done = false
        else if (stop.legIndex < activeLeg) done = true
        else if (stop.legIndex > activeLeg) done = false
        else if (track && progressAlong !== undefined) {
          const along = track.stops[stop.at]
          // Een paar meter speling: op de halte zelf ben je er nog niet voorbij.
          done = along !== undefined && along < progressAlong - STOP_PASSED_M
        } else {
          done = passedBefore >= 0 && stop.order < passedBefore
        }
        if (!done) state.set(stop.id, false)
        else if (!state.has(stop.id)) state.set(stop.id, true)
      }
    }
    return state
  }, [legs, spoor, activeLeg, progressAlong, passedBefore])

  const big = variant === 'full'
  /*
   * De borden krimpen naarmate je verder uitzoomt. Op ware grootte kruipen ze
   * anders over elkaar heen zodra twee haltes dicht bij elkaar liggen, en dan
   * is er van de route niets meer te zien.
   */
  const signR = (big ? 10 : 8) * clamp((14 - view.mpp) / 10, 0.34, 1)
  const showLetter = signR >= 5.5
  const showRouteNames = view.mpp < ROUTE_LABEL_MPP
  const showOtherNames = view.mpp < OTHER_LABEL_MPP

  /** Achtergrondhaltes: alleen wat in beeld valt, en niet te veel. */
  const otherStops = useMemo(() => {
    if (view.mpp > 8) return []
    const radius = view.rot !== 0 ? (Math.hypot(size.w, size.h) / 2) * view.mpp + 100 : 0
    const marginX = radius || (size.w / 2) * view.mpp + 100
    const marginY = radius || (size.h / 2) * view.mpp + 100
    const found: StopPoint[] = []
    for (const stop of geometry.stops) {
      // Niet onder een bord van de route: niet de halte zelf, en niet een halte op dezelfde plek.
      if (borden.van.has(stop.id) || borden.plekken.has(`${Math.round(stop.x * 2)},${Math.round(stop.y * 2)}`)) continue
      if (Math.abs(stop.x - view.cx) > marginX || Math.abs(stop.y - view.cy) > marginY) continue
      found.push(stop)
      if (found.length >= 300) break
    }
    return found
  }, [geometry, borden, view, size])

  /*
   * DE NAMEN BIJ DE HALTES
   *
   * Niet elke naam past: twee haltes aan weerskanten van een straat, of een
   * cluster perrons ("Ortsm M St D", "Ortsm M P1", "Ortsm Post"), liggen op het
   * scherm een paar punten uit elkaar. Wie eerst komt, krijgt de plek. Dat was
   * de volgorde van de dienst over alle ritten heen, met de naam alleen rechts
   * van het bord -- en dan won een halte die je al voorbij was, of een halte van
   * de rit terug aan de overkant, het van de halte waar je heen rijdt. Een
   * gebruiker: "ik mis soms haltes in de navigatie terwijl ze wel op mijn
   * dienstkaart staan".
   *
   * Nu, in deze volgorde: de volgende halte, de haltes die in deze rit nog
   * komen, het begin van de dienst, en pas dan de rest (gehad, of van een
   * andere rit). Elke naam probeert rechts, links, boven en onder zijn bord, en
   * als hij nergens past, nog een keer zonder de plaatsnaam ervoor. Waar de
   * navigatie zijn balk, snelheid en knoppen over de kaart legt (`bezet`),
   * komt geen naam: die zou eronder verdwijnen.
   */
  const labels = useMemo(() => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [...(bezet?.(size.w, size.h) ?? [])]
    const result: Array<{ key: string; x: number; y: number; text: string; strong: boolean; anchor?: 'end' | 'middle' }> = []
    const gedaan = new Set<string>()
    const breedte = (tekst: string): number => tekst.length * 5.7 + 6
    const consider = (stop: StopPoint, strong: boolean): void => {
      if (!stop.name || gedaan.has(stop.id)) return
      // Eén naam per bord: de andere haltes op die plek zijn daarmee ook gedaan.
      for (const id of borden.van.get(stop.id)?.ids ?? [stop.id]) gedaan.add(id)
      const [sx, sy] = toScreen(stop.x, stop.y)
      if (sx < -50 || sy < -20 || sx > size.w + 50 || sy > size.h + 20) return
      const kort = stop.name.includes(', ') ? stop.name.slice(stop.name.indexOf(', ') + 2) : undefined
      for (const tekst of kort ? [stop.name, kort] : [stop.name]) {
        const w = breedte(tekst)
        const r = signR + 5
        // Rechts, links, boven, onder: de tekstregel en het vak dat hij beslaat.
        const plekken: Array<{ x: number; y: number; anchor?: 'end' | 'middle'; box: { x: number; y: number; w: number; h: number } }> = [
          { x: sx + r, y: sy + 4, box: { x: sx + r, y: sy - 7, w, h: 14 } },
          { x: sx - r, y: sy + 4, anchor: 'end', box: { x: sx - r - w, y: sy - 7, w, h: 14 } },
          { x: sx, y: sy - r - 2, anchor: 'middle', box: { x: sx - w / 2, y: sy - r - 13, w, h: 14 } },
          { x: sx, y: sy + r + 10, anchor: 'middle', box: { x: sx - w / 2, y: sy + r - 1, w, h: 14 } }
        ]
        for (const plek of plekken) {
          if (plek.box.x < 0 || plek.box.x + plek.box.w > size.w || plek.box.y < 0 || plek.box.y + plek.box.h > size.h) continue
          if (placed.some((other) => overlaps(plek.box, other))) continue
          placed.push(plek.box)
          result.push({ key: stop.id, x: plek.x, y: plek.y, text: tekst, strong, anchor: plek.anchor })
          return
        }
      }
    }
    /*
     * Een naam per bord (`consider` streept de hele plek af), maar wel de naam
     * van de halte waar het om gaat. Twee ids op één plek hebben vaak een
     * andere naam ("Eckertalstausee" en "SB_Eckertalstausee"); de volgende
     * halte en de haltes van deze rit dragen hun eigen naam, en een bord dat
     * nog komt de naam van de halte daar die nog komt.
     */
    const rijdtNog = (stop: RouteStop): boolean => passedStops.get(stop.id) !== true
    const nogTeGaan = (bord: { stop: RouteStop; ids: string[] }): StopPoint | undefined => {
      const id = bord.ids.find((id) => passedStops.get(id) !== true)
      return id === undefined ? undefined : id === bord.stop.id ? bord.stop : (byId.get(id) ?? bord.stop)
    }
    const volgende = nextStopId ? routeStops.find((stop) => stop.id === nextStopId) : undefined
    if (showRouteNames) {
      if (volgende) consider(volgende, true)
      if (activeLeg !== undefined) {
        for (const stop of legs[activeLeg] ?? []) if (rijdtNog(stop)) consider(stop, true)
      }
    }
    if (start) consider(start, true)
    if (showRouteNames) {
      for (const bord of borden.lijst) {
        const stop = nogTeGaan(bord)
        if (stop) consider(stop, true)
      }
      for (const bord of borden.lijst) consider(bord.stop, false)
    }
    if (showOtherNames) for (const stop of otherStops) consider(stop, false)
    return result
  }, [start, borden, routeStops, byId, otherStops, showRouteNames, showOtherNames, toScreen, size, signR, bezet, passedStops, nextStopId, activeLeg, legs])

  /*
   * ELKE LIJN ÉÉN KEER
   *
   * De kaart tekende per rit een lijn, en een omloop rijdt de hele dag dezelfde
   * paar trajecten heen en weer. Luc: "in vrij rijden gaat hij in de app alle
   * lijnen tekenen dat voor extreem veel lag zorgt, elke lijn wordt maximaal 1
   * keer getekend". Wagen 3 op Krefrath: 26 ritten, 9 trajecten, en 61 lijnen
   * met 45.552 punten -- 90 ms per beeld bij het slepen. Nu één lijn per
   * traject (trajecten.ts), in stukken gehakt op gevonden en gegokte weg; dat
   * gebeurt één keer per route en niet meer bij elk beeld.
   */
  const trajecten = useMemo(() => trajectenVan(legs, routes), [legs, routes])

  /** Hoeveelste halte van de dienst de laatste van elke rit is; voor "gehad". */
  const laatsteVan = useMemo(() => legs.map((leg) => (leg.length > 0 ? leg[leg.length - 1].order : -1)), [legs])

  /*
   * Welke trajecten er getekend worden, en hoe. Het traject van de rit die nu
   * rijdt komt naar voren -- ook als dezelfde weg later in de dienst nog eens
   * gereden wordt -- en de rest blijft flauw staan; `active` tekent alleen dat
   * traject. Een traject is pas gehad als elke rit erover gehad is.
   */
  const getekend = useMemo(() => {
    if (routeMode === 'none') return []
    const actief = activeLeg !== undefined ? trajecten.findIndex((t) => t.ritten.includes(activeLeg)) : -1
    return trajecten
      .map((traject, index) => ({ traject, index, actief: index === actief }))
      .filter(({ actief: a }) => routeMode === 'all' || a)
      .map((t) => ({
        ...t,
        ander: activeLeg !== undefined && !t.actief,
        gehad: !t.actief && passedBefore >= 0 && t.traject.ritten.every((rit) => laatsteVan[rit] < passedBefore)
      }))
      // De rit die aan de beurt is komt als laatste, dus bovenop.
      .sort((a, b) => Number(a.actief) - Number(b.actief))
  }, [trajecten, routeMode, activeLeg, passedBefore, laatsteVan])

  /**
   * Wanneer elk stuk van de route zichzelf tekent.
   *
   * De route bestaat uit losse stukken -- een per traject, en meer zodra er een
   * geraden deel tussen zit -- en die begonnen allemaal tegelijk. Dan groeit de
   * lijn op vier plekken tegelijk uit het niets, en dat is precies wat je niet
   * wilt zien: een dienst loopt van begin naar eind, en de tekening hoort dat
   * te volgen.
   *
   * Dus krijgt elk stuk een aandeel in de tijd naar rato van zijn lengte, en
   * een startmoment gelijk aan alles wat ervoor ligt, in de volgorde waarin de
   * dienst het traject voor het eerst rijdt. De geraden stukken tellen mee in
   * die rekensom ook al tekenen ze zichzelf niet: anders loopt de pen sneller
   * over het stuk erna om de verloren tijd in te halen.
   */
  const tekenplan = useMemo(() => {
    const alle = getekend
      .flatMap(({ traject, index }) =>
        [...traject.heel, ...traject.gok].map((stuk) => ({ sleutel: `${index}-${stuk.van}`, eerste: traject.ritten[0], stuk }))
      )
      .sort((a, b) => a.eerste - b.eerste || a.stuk.van - b.stuk.van)
    const totaal = alle.reduce((som, { stuk }) => som + stuk.lengte, 0)
    const plan = new Map<string, { start: number; deel: number }>()
    if (totaal <= 0) return plan
    let tot = 0
    for (const { sleutel, stuk } of alle) {
      plan.set(sleutel, { start: tot / totaal, deel: Math.max(stuk.lengte / totaal, 0.02) })
      tot += stuk.lengte
    }
    return plan
  }, [getekend])

  /** Het beeld zoals `toScreen` het rekent, voor `schermPad`. */
  const beeld = useMemo<Beeld>(
    () => ({ cx: view.cx, cy: view.cy, mpp: view.mpp, rot: view.rot, w: size.w, h: size.h }),
    [view, size]
  )
  /** Een stuk op het scherm: zo grof als onzichtbaar blijft, en alleen wat in beeld valt. */
  const pad = useCallback((stuk: Stuk): string => schermPad(vereenvoudigd(stuk.punten, beeld.mpp), beeld), [beeld])

  /**
   * De route van de huidige rit gesneden op de plek van de bus: wat gereden is
   * en wat nog komt. Zo verdwijnt de lijn achter de bus, net als in een
   * navigatiesysteem. In kaartmeters; `schermPad` zet het op het scherm.
   */
  const trail = useMemo(() => {
    if (activeLeg === undefined || progressAlong === undefined) return undefined
    const track = spoor(activeLeg)
    if (!track || track.cumulative.length < 2) return undefined
    const { points, cumulative } = track
    const at = clamp(progressAlong, 0, cumulative[cumulative.length - 1])

    let k = 1
    while (k < cumulative.length - 1 && cumulative[k] < at) k++
    const cut = pointAlong(track, at)

    const done = [...points.slice(0, k * 2), cut.x, cut.y]
    const ahead = [cut.x, cut.y, ...points.slice(k * 2, cumulative.length * 2)]
    return { done, ahead, at }
  }, [activeLeg, progressAlong, spoor])

/*
 * Hier stonden pijltjes langs de lijn die de rijrichting aangaven. Ze zijn eruit:
 * op een kaart die met je meedraait wijst de bus zelf al vooruit, en de lijn
 * achter je verdwijnt, dus de richting stond er twee keer te veel bij.
 */

  const hoveredStop = hovered ? byId.get(hovered) : undefined
  const scaleBar = niceScale(view.mpp, big ? 140 : 90)

  return (
    <div className={`route-map ${big ? 'route-map-full' : ''}`} ref={boxRef}>
      <canvas ref={canvasRef} className="route-roads" aria-hidden="true" />
      <svg
        ref={svgRef}
        className="route-canvas"
        data-hit
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label={`Kaart van de route, vertrek bij ${start?.name ?? 'onbekend'}`}
      >
        {/*
          * Eerst de ritten die nu niet aan de beurt zijn en daarna de huidige:
          * in SVG bepaalt de volgorde in de DOM wat bovenop ligt.
          */}
        {/*
          * De route tekent zichzelf als hij voor het eerst verschijnt.
          *
          * Alleen tijdens het klaarzetten. Rijd je, dan wordt deze laag bij elk
          * beeld opnieuw verdeeld in gereden en nog te gaan, en een route die
          * zich tien keer per seconde opnieuw tekent is geen navigatie meer.
          * Vandaar `activeLeg === undefined`: dat is precies het verschil
          * tussen "kijken wat je gaat doen" en "het doen".
          *
          * De sleutel hangt aan de dienst en niet aan de stap: je kiest op de
          * dienstenlijst de ene dienst na de andere, en dan hoort de kaart elke
          * keer opnieuw te tekenen wat je net aanwees. Ga je daarna door naar
          * de bus, dan is het dezelfde route en blijft hij staan.
          *
          * Het aantal stukken staat erbij, en dat is geen sierselsel: de wegen
          * worden opgehaald en zijn er dus niet op het moment dat je klikt.
          * Hing de sleutel alleen aan de dienst, dan kwam deze groep leeg ter
          * wereld, liep de animatie op niets, en werden de lijnen daarna in
          * stilte toegevoegd. Zo komt hij opnieuw zodra de stukken er zijn.
          * Of de wegen er al zijn staat er ook bij: met rechte lijnen en met
          * wegen kan het aantal trajecten toevallig gelijk zijn. Wat al eens
          * opgehaald is, staat er meteen (trajecten.ts) en tekent maar één keer.
          */}
        <g
          key={`${duty?.tourNumber ?? 'net'}|${duty?.start ?? ''}|${legs.length}|${routes ? 'weg' : 'recht'}|${getekend.reduce((som, t) => som + t.traject.heel.length, 0)}`}
          className={
            activeLeg === undefined && routeMode === 'all' ? 'route-intekenen' : undefined
          }
        >
        {getekend.map(({ traject, index, actief, ander, gehad }) => {
          // De rit waar je op zit: het gereden stuk weg, de rest in kleur.
          if (actief && trail) {
            const gereden = schermPad(trail.done, beeld)
            const komt = schermPad(trail.ahead, beeld)
            return (
              <g key={index}>
                <g className="route-done">
                  <path className="route-casing" d={gereden} />
                  <path className="route-line" d={gereden} />
                </g>
                <path className="route-casing" d={komt} />
                <path className="route-line" d={komt} />
              </g>
            )
          }
          return (
            <g key={index} className={ander ? 'route-other' : gehad ? 'route-done' : undefined}>
              {traject.heel.map((stuk) => {
                const sleutel = `${index}-${stuk.van}`
                const d = pad(stuk)
                return (
                  <g
                    key={sleutel}
                    style={
                      {
                        '--start': tekenplan.get(sleutel)?.start ?? 0,
                        '--deel': tekenplan.get(sleutel)?.deel ?? 1
                      } as CSSProperties
                    }
                  >
                    <path className="route-casing" pathLength={1} d={d} />
                    <path className="route-line" pathLength={1} d={d} />
                  </g>
                )
              })}
            </g>
          )
        })}
        </g>

        {/* De stukken zonder gevonden weg: gestreept, zodat ze niet als route lezen. */}
        {getekend.flatMap(({ traject, index }) =>
          traject.gok.map((stuk) => <path key={`gok-${index}-${stuk.van}`} className="route-guess" d={pad(stuk)} />)
        )}

        {/* Naar de eerste halte, zolang de rit nog niet begonnen is: een gok, dus gestreept. */}
        {aanrij &&
          (() => {
            const [ax, ay] = toScreen(aanrij.punten[0], aanrij.punten[1])
            const [bx, by] = toScreen(aanrij.punten[2], aanrij.punten[3])
            return <line className="route-aanrij" x1={ax} y1={ay} x2={bx} y2={by} />
          })()}

        {otherStops.map((stop) => {
          const [x, y] = toScreen(stop.x, stop.y)
          return (
            <circle
              key={stop.id}
              className="map-other"
              cx={x}
              cy={y}
              r={2.4}
              onPointerEnter={() => setHovered(stop.id)}
              onPointerLeave={() => setHovered(undefined)}
            />
          )
        })}

        {/* Eén bord per plek; zie `borden`. Gehad als elke halte daar gehad is. */}
        {borden.lijst.map(({ stop, ids }) => {
          const [x, y] = toScreen(stop.x, stop.y)
          if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null
          const dim = ids.every((id) => passedStops.get(id) === true)
          const next = nextStopId !== undefined && ids.includes(nextStopId)
          return (
            <StopSign
              key={stop.id}
              x={x}
              y={y}
              r={stop.isStart ? Math.max(signR, 6) + 2 : signR}
              dim={dim}
              ahead={!dim && !vloot}
              next={next}
              letter={showLetter}
              onEnter={() => setHovered(stop.id)}
              onLeave={() => setHovered(undefined)}
            />
          )
        })}

        {start &&
          !busPoint &&
          !liveBus &&
          (() => {
            const [x, y] = toScreen(start.x, start.y)
            return <circle className="map-start-halo" cx={x} cy={y} r={Math.max(signR, 6) + 11} />
          })()}

        {(liveBus ?? busPoint) &&
          (() => {
            const point = liveBus
              ? { x: liveBus.x, y: liveBus.y, heading: liveBus.heading }
              : { x: busPoint!.x, y: busPoint!.y, heading: (Math.atan2(busPoint!.dx, busPoint!.dy) * 180) / Math.PI }
            const [x, y] = toScreen(point.x, point.y)
            // Op het scherm telt de koers min de draaiing van de kaart.
            const angle = point.heading - view.rot
            return (
              <g className="map-bus" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                <circle className="bus-halo" r={15} />
                <path className="bus-arrow" d="M0 -10 L7.5 7.5 L0 3.5 L-7.5 7.5 Z" transform={`rotate(${angle.toFixed(1)})`} />
              </g>
            )
          })()}

        {labels.map((label) => (
          <text
            key={label.key}
            className={label.strong ? 'map-label map-label-strong' : 'map-label'}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
          >
            {label.text}
          </text>
        ))}

        {/* Staat er al een naam bij dit bord (misschien van een andere halte op die plek), dan geen tweede. */}
        {hoveredStop &&
          !labels.some((label) => (borden.van.get(hoveredStop.id)?.ids ?? [hoveredStop.id]).includes(label.key)) && (
          <text
            className="map-label map-label-strong"
            x={toScreen(hoveredStop.x, hoveredStop.y)[0] + signR + 5}
            y={toScreen(hoveredStop.x, hoveredStop.y)[1] + 4}
          >
            {hoveredStop.name}
          </text>
        )}

        {/*
          * De bussen van de vlootkaart, boven alles behalve de schaal. De
          * gekozen bus als laatste, dus bovenop. De onzichtbare cirkel met
          * `data-bus` is waar je raak klikt: ruimer dan de pijl, zodat het ook
          * met een vinger lukt.
          */}
        {vloot &&
          [...vloot.bussen]
            .sort((a, b) => Number(a.id === vloot.gekozen) - Number(b.id === vloot.gekozen))
            .map((b) => {
              if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return null
              const [x, y] = toScreen(b.x, b.y)
              if (x < -30 || y < -30 || x > size.w + 30 || y > size.h + 30) return null
              const gekozen = b.id === vloot.gekozen
              return (
                <g
                  key={b.id}
                  className={`vloot-bus toon-${b.toon}${b.spook ? ' spook' : ''}${gekozen ? ' gekozen' : ''}`}
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                >
                  {gekozen && <circle className="vloot-ring" r={17} />}
                  <path
                    className="vloot-pijl"
                    d="M0 -11 L8 8 L0 4 L-8 8 Z"
                    transform={`rotate(${(b.koers - view.rot).toFixed(1)})`}
                  />
                  <text className="vloot-label" x={12} y={4}>
                    {b.label}
                  </text>
                  <circle className="vloot-raak" data-bus={b.id} r={16} />
                </g>
              )
            })}

        <g className="map-scale" transform={`translate(12 ${size.h - 14})`}>
          <line x1={0} y1={0} x2={scaleBar.px} y2={0} />
          <line x1={0} y1={-4} x2={0} y2={4} />
          <line x1={scaleBar.px} y1={-4} x2={scaleBar.px} y2={4} />
          <text x={scaleBar.px + 6} y={4}>
            {scaleBar.label}
          </text>
        </g>
      </svg>

      {/*
        Wie de bediening overneemt, tekent zijn eigen knoppen; twee stel naast
        elkaar is verwarrend. data-hit: in de overlay laten alleen zulke plekken
        de muis niet door naar het spel.
      */}
      <div className="map-tools" data-hit style={bediening ? { display: 'none' } : undefined}>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label={tr('map.zoomIn')}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(1.6)} aria-label={tr('map.zoomOut')}>
          −
        </button>
        {zoom && (bus || vehicle) && (
          <button
            type="button"
            className="map-zoomstand"
            aria-pressed={zoom.vast === undefined}
            title={tr(zoom.vast === undefined ? 'map.zoomAuto' : 'map.zoomFixed')}
            aria-label={tr(zoom.vast === undefined ? 'map.zoomAuto' : 'map.zoomFixed')}
            onClick={() =>
              zoom.kies(zoom.vast === undefined ? clamp(view.mpp, VAST_MIN_MPP, VAST_MAX_MPP) : undefined)
            }
          >
            {zoom.vast === undefined ? 'A' : '▣'}
          </button>
        )}
        {bus || vehicle ? (
          <button
            type="button"
            onClick={() => centreOnBus(true)}
            aria-label={texts?.centre}
            title={texts?.centre}
          >
            ◎
          </button>
        ) : (
          <button type="button" onClick={refit} aria-label={tr('map.fit')}>
            ⤢
          </button>
        )}
      </div>

      {/*
        Het kaartje boven de gekozen bus. Het rekent zijn plek met dezelfde
        `toScreen` als de pijl, dus het blijft er precies boven, ook als de
        bus rijdt of de kaart schuift. data-hit en geen pointerdown naar de
        kaart: knoppen op het kaartje zijn geen sleep.
      */}
      {vloot?.zweef &&
        gekozenBus &&
        Number.isFinite(gekozenBus.x) &&
        Number.isFinite(gekozenBus.y) &&
        (() => {
          const [x, y] = toScreen(gekozenBus.x, gekozenBus.y)
          if (x < 0 || y < 0 || x > size.w || y > size.h) return null
          return (
            <div
              className="vloot-zweef"
              data-hit
              style={{ left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px` }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {vloot.zweef}
            </div>
          )
        })()}

      {routeMode === 'none' && texts?.waiting && <div className="map-note">{texts.waiting}</div>}
      {busPoint && !liveBus && texts?.busNote && <div className="map-note map-note-quiet">{texts.busNote}</div>}
    </div>
  )
}

/**
 * Het Duitse haltebord: een geel rond bord met een groene H. Precies wat er in
 * het spel langs de weg staat, dus je herkent waar je moet zijn.
 */
function StopSign({
  x,
  y,
  r,
  dim,
  ahead,
  next,
  letter,
  onEnter,
  onLeave
}: {
  x: number
  y: number
  r: number
  /** Al voorbij: grijs. */
  dim: boolean
  /** Komt nog: groen, zodat je in een oogopslag ziet wat er nog ligt. */
  ahead: boolean
  next: boolean
  letter: boolean
  onEnter(): void
  onLeave(): void
}): JSX.Element {
  return (
    <g
      className={`stop-sign ${dim ? 'stop-done' : ''} ${ahead ? 'stop-ahead' : ''} ${next ? 'stop-next' : ''}`}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {/* De gloed hoort achter het bord; groen voor wat nog komt. */}
      {ahead && <circle className="sign-glow" cx={x} cy={y} r={r + 3.5} strokeWidth={r * 0.55} />}
      {next && <circle className="sign-next-ring" cx={x} cy={y} r={r + 5} />}
      <circle className="sign-face" cx={x} cy={y} r={r} />
      <circle className="sign-ring" cx={x} cy={y} r={r - 1.2} />
      {letter && (
        <text className="sign-h" x={x} y={y} fontSize={r * 1.3}>
          H
        </text>
      )}
    </g>
  )
}

/** Een verschuiving op het (gedraaide) scherm terug naar kaartrichtingen; x rechts, y omhoog. */
function unrotate(sx: number, sy: number, rotation: number): [number, number] {
  const r = (rotation * Math.PI) / 180
  return [sx * Math.cos(r) + sy * Math.sin(r), -sx * Math.sin(r) + sy * Math.cos(r)]
}

/** Kortste draai van koers `from` naar `to`, in graden tussen -180 en 180. */
function turn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Een ronde maat voor de schaalbalk: 25 m, 50 m, 100 m, 250 m, 500 m, 1 km, … */
export function niceScale(mpp: number, aim: number): { px: number; label: string } {
  const target = mpp * aim
  const steps = [25, 50, 100, 250, 500, 1000, 2000, 5000]
  // Een half procent speling: anders kost een rekenkruimel een hele maat.
  const metres = steps.find((step) => step >= target * 0.995) ?? steps[steps.length - 1]
  return {
    px: metres / mpp,
    label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
  }
}
