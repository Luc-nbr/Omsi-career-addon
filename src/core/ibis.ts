import { join } from 'node:path'
import { listHofs, matchHof, normalise, pickHof, type Route } from './hof'
import type { Duty } from './types'
import { shortRoute } from '../shared/format'

/** Wat de chauffeur per rit in de IBIS zet. */
export interface IbisLeg {
  departure: number
  lineNumber: string
  terminus: string
  /**
   * Routenummer. Dit is wat je na de lijn intoetst; de bestemming hoort bij de
   * route en volgt er vanzelf uit.
   */
  route?: string
  /**
   * Hetzelfde nummer zonder het lijnnummer ervoor: lijn 135 met route 13502
   * wordt hier 02.
   *
   * Wagenparken schrijven hun routecodes met de lijn erin, en overal waar dit
   * getal staat, staat het lijnnummer er al naast. Dan is driekwart van de
   * code een herhaling van wat er links van staat, terwijl juist het staartje
   * zegt welke kant je oprijdt.
   *
   * De volle code blijft in `route` staan -- daar rekent de rest mee, en wie
   * hem ergens toch voluit nodig heeft kan erbij.
   */
  routeShort?: string
  /** Korte omschrijving van de route, zoals "URUH-NERV". */
  routeName?: string
  /** Bestemmingscode. Alleen ter controle van wat er op de film verschijnt. */
  code?: string
  /** De tekst die dan op de bestemmingsfilm verschijnt. */
  display?: string
}

/**
 * De invoer voor het Integriertes Bord-Informations-System. Bij het instappen
 * toetst de chauffeur achtereenvolgens lijn, omloop en bestemmingscode in; bij
 * elke keer keren voert hij de nieuwe bestemmingscode in.
 */
export interface IbisPlan {
  /** Wagenpark waar de codes uit komen. Staat ook als `yard` in de situatie. */
  yard?: string
  line: string
  tour: string
  legs: IbisLeg[]
  /** Hoeveel ritten een routenummer kregen, en hoeveel er in totaal zijn. */
  resolved: number
  total: number
  /** Kent dit wagenpark uberhaupt routes? Zo niet, dan blijft alleen de film over. */
  hasRoutes: boolean
}

/**
 * Kiest uit meerdere routes die op dezelfde bestemming uitkomen. De route die de
 * meeste haltes met de rit deelt is de juiste; het beginpunt weegt het zwaarst,
 * want daarin verschillen de varianten meestal.
 */
function bestByStops(candidates: Route[], stops: string[]): Route | undefined {
  const wanted = new Set(stops.map(normalise))
  const first = normalise(stops[0] ?? '')
  let best: Route | undefined
  let bestScore = -1
  for (const route of candidates) {
    if (route.stops.length === 0) continue
    const overlap = route.stops.filter((stop) => wanted.has(normalise(stop))).length
    const score = overlap / Math.max(route.stops.length, stops.length) +
      (first && normalise(route.stops[0]) === first ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      best = route
    }
  }
  return best ?? candidates[0]
}

/**
 * Zoekt de bestemmingscodes bij een dienst. De codes komen uit het wagenpark
 * (.hof) dat naast het busmodel ligt, en verschillen per tijdvak: Johannesstift
 * is in 1988 code 221 en in 1994 code 161. Daarom telt het jaar van de kaart mee.
 */
export function buildIbisPlan(
  omsiPath: string,
  vehicleRelativePath: string,
  duty: Duty,
  year: number,
  /*
   * Een wagenpark dat de chauffeur zelf aanwijst. Eén busmodel heeft er soms
   * tien naast zich liggen -- Spandau 86 tot en met 94, Grundorf, Rheinhausen --
   * en de app kiest er een die de bestemmingen kent. Wie het beter weet, of een
   * ander tijdvak wil rijden, zet hier zijn eigen keuze neer.
   */
  yardName?: string
): IbisPlan {
  const termini = [...new Set(duty.legs.map((leg) => leg.terminus).filter(Boolean))]
  const hofs = listHofs(join(omsiPath, vehicleRelativePath))
  const gekozen = yardName ? hofs.find((hof) => hof.name === yardName) : undefined
  const match = gekozen ? matchHof(gekozen, termini) : pickHof(hofs, termini, year)

  const routes = match?.hof.routes ?? []
  const sameLine = (a: string, b: string) => a.trim() === b.trim()

  const legs: IbisLeg[] = duty.legs.map((leg) => {
    const terminus = match?.codes.get(normalise(leg.terminus))
    /**
     * De route is die van deze lijn die op deze bestemming uitkomt. Staan er
     * meerdere varianten, dan is de eerste de gewone rit; de rest zijn
     * afwijkende routes die we niet uit elkaar kunnen houden.
     */
    const candidates = terminus
      ? routes.filter(
          (entry) =>
            sameLine(entry.lineNumber, leg.lineNumber) && entry.target.trim() === terminus.code.trim()
        )
      : []
    const route = candidates.length > 1 ? bestByStops(candidates, leg.stops) : candidates[0]

    return {
      departure: leg.departure,
      lineNumber: leg.lineNumber,
      terminus: leg.terminus,
      route: route?.code,
      routeShort: shortRoute(route?.code, leg.lineNumber),
      routeName: route?.name,
      code: terminus?.code,
      display: terminus?.display
    }
  })

  /*
   * Het lijnnummer voor de IBIS is dat van de eerste rit die een route heeft.
   * De eerste rit van een dienst is vaak een Betriebsfahrt zonder lijnnummer,
   * en dan viel de dienst terug op de naam van het lijnbestand - "5 & 5N" typ
   * je niet in op een IBIS.
   */
  const withRoute = legs.find((leg) => leg.route && leg.lineNumber)
  const anyNumber = legs.find((leg) => /[0-9]/.test(leg.lineNumber))

  return {
    yard: match?.hof.name,
    line: (withRoute ?? anyNumber)?.lineNumber ?? duty.lineNumbers[0] ?? '',
    tour: duty.tourNumber,
    legs,
    resolved: legs.filter((leg) => leg.route).length,
    total: legs.length,
    hasRoutes: routes.length > 0
  }
}
