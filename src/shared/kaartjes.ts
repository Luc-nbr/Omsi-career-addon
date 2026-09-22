/**
 * Kaartjes en wisselgeld: wat beide kanten van de app nodig hebben.
 *
 * De vormen en het rekenwerk staan hier omdat de overlay ze gebruikt, en de
 * overlay is een pagina zonder Node. Het lézen van een kaartset is iets anders
 * -- dat opent bestanden -- en staat in `core/kaartjes.ts`.
 *
 * WAT OMSI NIET VERTELT
 * Dat er iemand een kaartje wil, welk kaartje, of hoeveel geld hij aangeeft.
 * Nagemeten en drie keer bevestigd; de uitleg staat bij `core/kaartjes.ts`. Deze
 * kant rekent dus, hij raadt niet.
 */

export interface Kaartje {
  /** Naam in de taal van de kaart, zoals de passagier hem zou noemen. */
  naam: string
  naamEngels: string
  /** Prijs in de munt van die kaart; 2.70 is twee zeventig. */
  prijs: number
  /** Hoeveel haltes het kaartje geldig is; 0 is onbeperkt. */
  maxHaltes: number
  leeftijdVan: number
  leeftijdTot: number
  /** Wat de kaartprinter op zijn scherm zet. */
  schermtekst: string
  /** Een dagkaart wordt later op de dag steeds minder gekocht. */
  dagkaart?: boolean
}

export interface Kaartset {
  /** Naam van de set, zoals de map heet. */
  naam: string
  bestand: string
  kaartjes: Kaartje[]
  /** Hoe vaak een instapper een kaartje koopt, 0 tot 1. */
  koopkans?: number
}

/**
 * De coupures waarmee betaald en teruggegeven wordt, in centen, grootste eerst.
 *
 * Grootste eerst omdat je zo uit de lade pakt: eerst de biljetten, dan de
 * grote munten. Een lijst van klein naar groot zou dezelfde som geven en
 * onbruikbaar zijn om te lezen terwijl je rijdt.
 */
export const COUPURES = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const

export interface Muntje {
  /** Waarde in centen. */
  cent: number
  aantal: number
}

/**
 * Het wisselgeld, uitgesplitst in biljetten en munten.
 *
 * In hele centen en niet in kommagetallen: 0,1 + 0,2 is in drijvende komma
 * 0,30000000000000004, en dan komt er een cent te veel of te weinig uit. Dat
 * valt niemand op tot het een keer niet klopt.
 */
export function wisselgeld(centen: number): Muntje[] {
  let rest = Math.max(0, Math.round(centen))
  const uit: Muntje[] = []
  for (const cent of COUPURES) {
    const aantal = Math.floor(rest / cent)
    if (aantal > 0) {
      uit.push({ cent, aantal })
      rest -= aantal * cent
    }
  }
  return uit
}
