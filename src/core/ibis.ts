import { join } from 'node:path'
import { listHofs, normalise, pickHof } from './hof'
import type { Duty } from './types'

/** Wat de chauffeur per rit in de IBIS zet. */
export interface IbisLeg {
  departure: number
  lineNumber: string
  terminus: string
  /** Bestemmingscode; ontbreekt als het wagenpark deze bestemming niet kent. */
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
  /** Hoeveel van de ritten een code kregen, en hoeveel er in totaal zijn. */
  resolved: number
  total: number
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
  year: number
): IbisPlan {
  const termini = [...new Set(duty.legs.map((leg) => leg.terminus).filter(Boolean))]
  const match = pickHof(listHofs(join(omsiPath, vehicleRelativePath)), termini, year)

  const legs: IbisLeg[] = duty.legs.map((leg) => {
    const terminus = match?.codes.get(normalise(leg.terminus))
    return {
      departure: leg.departure,
      lineNumber: leg.lineNumber,
      terminus: leg.terminus,
      code: terminus?.code,
      display: terminus?.display
    }
  })

  return {
    yard: match?.hof.name,
    line: duty.lineNumbers[0] ?? '',
    tour: duty.tourNumber,
    legs,
    resolved: legs.filter((leg) => leg.code).length,
    total: legs.length
  }
}
