/** Halte zoals OMSI hem kent: een numeriek id met een naam. */
export interface BusStop {
  id: string
  name: string
}

/** Eén rijtijdprofiel van een rit, bijvoorbeeld "HVZ" (spits) of "standard". */
export interface TripProfile {
  name: string
  minutes: number
  /**
   * Vaste tijden uit de dienstregeling, in minuten na vertrek: per halte-index
   * de aankomst en het vertrek. Niet elke halte heeft ze -- op Thüringer Wald
   * staan ze overal, op Rheinhausen bij een op de twintig.
   */
  arrivals?: Map<number, number>
  departures?: Map<number, number>
}

/**
 * Halte binnen een rit. Nieuwere kaarten noteren alleen een id en laten de naam
 * in Busstops.cfg staan; oudere kaarten zetten de naam in de rit zelf.
 */
export interface TripStop {
  id: string
  name?: string
  /**
   * Rijtijd tot deze halte, opgeteld vanaf het begin van de rit. OMSI noteert
   * hem in de oude halteschrijfwijze; de nieuwe (`[station_typ2]`) laat hem weg
   * en dan verdelen we de rittijd gelijkmatig over de haltes.
   */
  cumulative?: number
}

/** Een rit: één keer van beginpunt naar eindbestemming over een reeks haltes. */
export interface Trip {
  /** Bestandsnaam zonder extensie; hiermee verwijst een dienst naar de rit. */
  file: string
  ident: string
  terminus: string
  lineNumber: string
  stops: TripStop[]
  profiles: TripProfile[]
}

/** Verwijzing vanuit een dienst naar een rit, met vertrektijd en profielkeuze. */
export interface TourTrip {
  tripFile: string
  profileIndex: number
  /** Minuten na middernacht; mag boven 1440 uitkomen bij nachtritten. */
  departure: number
}

/**
 * Een omloop (Umlauf): alles wat één voertuig op een dag rijdt. Dit is nog geen
 * chauffeursdienst — die is er een aaneengesloten stuk uit.
 */
export interface Tour {
  /** Naam van het .ttl-bestand, meestal het lijnnummer. */
  lineFile: string
  /**
   * Mag de speler deze lijn rijden? OMSI zet daarvoor een blok `[userallowed]`
   * in het lijnbestand. Zonder dat blok staat de lijn niet in het
   * dienstregelingsmenu: stadsbanen, treinen, en op Berlin-Spandau zelfs een
   * helikopter en een vliegtuig.
   */
  userAllowed: boolean
  number: string
  depot: string
  /**
   * Bitmasker van de dagen waarop deze omloop rijdt: bit 0 is maandag tot en
   * met bit 4 vrijdag, bit 5 zaterdag, bit 6 zondag. De bits daarboven zijn
   * feestdagcategorieen. Omlopen met de naam "Mo-Fr" hebben masker 287 of 799,
   * die met "Sa" 288 of 800.
   */
  days: number
  trips: TourTrip[]
}

/** Een geïnstalleerde kaart met zijn dienstregeling. */
export interface OmsiMap {
  folder: string
  name: string
  path: string
  stops: Map<string, BusStop>
  trips: Map<string, Trip>
  tours: Tour[]
}

/** Een rit binnen een toegewezen dienst, met uitgerekende tijden en haltenamen. */
export interface DutyLeg {
  tripFile: string
  lineNumber: string
  terminus: string
  departure: number
  arrival: number
  minutes: number
  /** Omloop waar deze rit uit komt; een dienst kan er meerdere raken. */
  tourNumber: string
  /** Wachttijd op het eindpunt sinds de vorige rit. Nul bij de eerste. */
  layoverBefore: number
  stops: string[]
  /** Dezelfde haltes als id, om ze op de kaart terug te vinden. */
  stopIds: string[]
  /**
   * Wanneer je bij elke halte hoort te zijn, in minuten na middernacht. Uit de
   * vaste tijden van het rijtijdprofiel; waar die ontbreken verdeeld naar
   * rijtijd.
   */
  stopTimes: number[]
}

/** De dienst die de speler krijgt toegewezen. */
export interface Duty {
  mapFolder: string
  mapName: string
  lineFile: string
  tourNumber: string
  depot: string
  legs: DutyLeg[]
  /** Aanmelden bij de remise, standaard tien minuten voor vertrek. */
  signOn: number
  start: number
  end: number
  durationMinutes: number
  /** Som van de haltes over alle ritten; ruwe maat voor de drukte van de dienst. */
  totalStops: number
  lineNumbers: string[]
  /** Dagen waarop deze dienst rijdt; alle ritten delen minstens een dag. */
  days: number
  /**
   * In welke periode de dienst geldt: feestdag, schooldag, schoolvakantie. Nul
   * als de kaart geen onderscheid maakt. Samen met `days` bepaalt dit op welke
   * datum de omloop in het dienstregelingsmenu van OMSI staat.
   */
  period: number
}
