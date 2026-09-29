/*
 * DE MEETSTAND: WAT DE TELEFOON EN HET INSTELLINGENSCHERM ERVAN ZIEN
 *
 * Ronde 0 van de voorvallen (design/ontwerpen/voorvallen-en-controleurs.md,
 * §3.2 en §5 "Wat Luc in OMSI meet"; de handleiding staat in
 * design/ontwerpen/ronde0-meten.md). Hier staat alleen wat de vensters nodig
 * hebben: de stappen van de afvinklijst en het beeld. Het meten en schrijven
 * zelf zit in core/meetstand.ts.
 */

/**
 * De afvinklijst per bus, in de volgorde waarin Luc ze rijdt. Elke stap zegt
 * welke vraag uit ronde 0 hij beantwoordt:
 * - `halte`: wanneer de volgende halte verspringt, en hoe `nextDist` verloopt;
 * - `deuren`: welke `PAX_EntryN`/`PAX_ExitN` bij welke deur hoort;
 * - `knielen`, `oprijplaat`, `alarmlicht`, `stopverzoek`: de scriptnamen, en
 *   of `Axle_Suspension_*` zakt bij knielen;
 * - `laatkomer`: komt er een `PAX_Entry*_Req` na het sluiten van de deuren;
 * - `doorrijden`: de sprong zonder stilstand.
 *
 * De stappen met een stand (knielen, oprijplaat, alarmlicht, stopverzoek)
 * vink je af TERWIJL die stand er is: dan maakt de app een volledige afdruk
 * van alle getallen van de bus, en in het verschil met de afdruk van het begin
 * staat de naam die we zoeken.
 */
export const MEET_STAPPEN = [
  'halte',
  'deuren',
  'knielen',
  'oprijplaat',
  'alarmlicht',
  'stopverzoek',
  'laatkomer',
  'doorrijden'
] as const

export type MeetStap = (typeof MEET_STAPPEN)[number]

export function isMeetStap(waarde: unknown): waarde is MeetStap {
  return typeof waarde === 'string' && (MEET_STAPPEN as readonly string[]).includes(waarde)
}

/** Wat de telefoon (overlay en tablet) en het instellingenscherm van de meting zien. */
export interface MetingBeeld {
  /** Wordt er nu geschreven? Alleen tijdens een dienst of vrije rit met verse gegevens van OMSI. */
  loopt: boolean
  /** De bus van deze meting, zoals OMSI hem noemt. */
  bus?: string
  /** De afvinklijst van deze bus. */
  stappen: Array<{ id: MeetStap; klaar: boolean }>
  /** Hoeveel regels er in deze meting staan, en hoe lang hij loopt (s). */
  regels: number
  seconden: number
  /** Hoeveel scriptnamen van de bus er gevraagd zijn, en hoeveel er buiten de 512 vielen. */
  gevraagd: number
  afgevallen: number
  /** De bestandsnaam (zonder map) van de laatst opgeslagen meting. */
  opgeslagen?: string
}
