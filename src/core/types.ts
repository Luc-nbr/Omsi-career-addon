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
  /**
   * De plek van dit `[addtrip]` in zijn omloop, zoals het bestand hem noemt. Een
   * leeg `[addtrip]` telt mee, ook al staat het niet in `trips`: OMSI telt zijn
   * ritten ook zo, en dit is het nummer dat de plugin als `tourEntry` doorgeeft.
   */
  entry: number
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
  /**
   * De plek van deze `[newtour]` in het lijnbestand, over alle blokken heen --
   * ook de omlopen zonder ritten, die `loadMap` daarna weglaat. Dit is het
   * nummer dat de plugin als `tour` doorgeeft; zie core/omloopvolgen.ts.
   */
  index: number
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
  /** Het lijnbestand, zoals OMSI's dienstregelingsmenu de lijn noemt. */
  lineFile: string
  lineNumber: string
  terminus: string
  departure: number
  arrival: number
  minutes: number
  /** Omloop waar deze rit uit komt; een dienst kan er meerdere raken. */
  tourNumber: string
  /**
   * Hier stap je over op een andere lijn of omloop, en dat betekent dat je het
   * in OMSI opnieuw moet kiezen: Set Time Table kent één lijn met één omloop
   * tegelijk.
   */
  switchInOmsi?: boolean
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
  /**
   * Het vaste vertrek per halte in minuten na middernacht, `null` waar de
   * dienstregeling niets vastlegt; zie `vasteVertrektijden`. Ontbreekt bij een
   * dienst die van voor de rittenstaat in het profiel staat.
   */
  stopVast?: Array<number | null>
  /**
   * Welk nummer OMSI deze rit in zijn omloop geeft (`mem.tourEntry`), in de
   * volgorde waarin de koppeling hem vond. Alleen bij vrij rijden; zie
   * `Duty.omsi`.
   */
  tourEntry?: number
  /**
   * Een leegrit: van of naar de remise, zonder reizigers. Zo'n rit heeft geen
   * lijnnummer, en het lijnbestand is er geen -- dat zou de IBIS een lijn als
   * "Eichenhoehe TA11 Mo-Do Schule" laten intoetsen.
   */
  leer?: boolean
}

/** Hoe de omloop die OMSI rijdt in de dienstregeling van de kaart is teruggevonden. */
export type Koppelsoort = 'index' | 'vertrek' | 'naam' | 'rit' | 'niets'

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
  /**
   * Bij vrij rijden: welke lijn en omloop OMSI hiervoor in zijn geheugen heeft
   * staan, als nummers in zijn eigen lijsten. Daarmee herkent `readSchedule`
   * elke volgende rit aan zijn nummer in plaats van te raden op de klok.
   * `volgorde` zegt of die nummers tellen zoals het bestand ze noemt of op
   * vertrektijd; `zeker` is onwaar als beide volgordes kloppen maar een ander
   * vervolg geven -- dan wordt elke wissel nagekeken.
   */
  omsi?: {
    lineFile: string
    lineIndex: number
    tourIndex: number
    volgorde: 'bestand' | 'vertrek'
    koppeling: Koppelsoort
    zeker: boolean
    /**
     * Het nummer (`mem.tourEntry`) van de rit waarop de koppeling begon. Kiest
     * de speler in OMSI daarna een eerdere rit van dezelfde omloop, dan staat
     * die niet in de dienst en is het een nieuwe keuze -- niet "de rit erna".
     */
    vanaf: number
  }
}
