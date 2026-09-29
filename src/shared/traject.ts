/*
 * Welke route een rit rijdt, als sleutel.
 *
 * WAAROM DIT BESTAAT
 * Een omloop rijdt dezelfde paar trajecten de hele dag heen en weer. Luc, over
 * 0.4.8: "in vrij rijden gaat hij in de app alle lijnen tekenen dat voor extreem
 * veel lag zorgt, elke lijn wordt maximaal 1 keer getekend". Krefrath, Wagen 3
 * vanaf 11:50: 26 ritten, maar 9 verschillende ritten -- en de kaart tekende ze
 * alle 26 over elkaar, met 45.552 punten, en sleepte met 90 ms per beeld.
 *
 * De route van een rit hangt af van twee dingen: het ritbestand (daar hangt de
 * `.ttr` van OMSI aan) en de reeks haltes (die ligt op de route, en zonder
 * `.ttr` plant de app van halte naar halte). Gelijk in allebei is dezelfde
 * route; `core/kaartlaag.ts` rekent er ook zo mee. Deze sleutel staat hier en
 * niet in core/, omdat het scherm hem ook gebruikt en core/routing.ts aan `fs`
 * hangt.
 */

/** Wat er van een rit nodig is om zijn route te vinden. */
export interface RitVraag {
  tripFile: string
  stopIds: string[]
}

/** Dezelfde sleutel is dezelfde route: ritbestand en de haltes op volgorde. */
export function ritSleutel(leg: RitVraag): string {
  return `${leg.tripFile}|${leg.stopIds.join(',')}`
}

/**
 * De ritten zonder herhalingen, met per rit waar hij in die korte lijst staat.
 * Wie dan per unieke rit iets uitrekent, zet het zo terug: `plek.map((i) => uit[i])`
 * -- en ritten met dezelfde route delen dan ook hetzelfde voorwerp.
 */
export function uniekeRitten<T extends RitVraag>(legs: T[]): { uniek: T[]; plek: number[] } {
  const waar = new Map<string, number>()
  const uniek: T[] = []
  const plek = legs.map((leg) => {
    const sleutel = ritSleutel(leg)
    let i = waar.get(sleutel)
    if (i === undefined) {
      i = uniek.length
      waar.set(sleutel, i)
      uniek.push(leg)
    }
    return i
  })
  return { uniek, plek }
}
