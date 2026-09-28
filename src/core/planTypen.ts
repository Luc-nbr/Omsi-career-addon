/*
 * De typen van de planning van het busbedrijf.
 *
 * Alleen typen, zodat elk deel (rooster, uitval, invullen, zelf rijden, de
 * vlootkaart) ertegen kan bouwen zonder op de rest te wachten. Het ontwerp
 * staat in design/ontwerpen/busbedrijf-planning.md (§3.1); wat hier staat is
 * het contract, en wijzigt alleen centraal.
 *
 * Tijden zijn minuten na middernacht van de bedrijfsdatum; kleiner dan nul en
 * groter dan 1440 mag (nachtritten). Bedragen in hele centen, zoals in bedrijf.ts.
 */
import type { Busvorm } from './bedrijf'
export type OmloopSleutel = string   // `${mapFolder}|${lineFile}|${days}|${tourNumber}`
export type DienstSleutel = string   // `${omloopSleutel}|${deel}`

export interface PlanRit {
  sleutel: string        // `${tripFile.toLowerCase()}@${departure}` (zoals duty.ts:407 ontdubbelt)
  tripFile: string
  vertrek: number        // minuten na middernacht van de bedrijfsdatum; <0, >1440 en breuken mogen
  aankomst: number       // vertrek + tripMinutes(trip, profileIndex)
  haltes: number
  telt: boolean          // haltes >= MIN_STOPS_FOR_BUS_LINE (network.ts:5)
  lijn: string           // trip.lineNumber || trip.ident || lineFile
  van: string            // naam eerste halte
  naar: string           // trip.terminus
}
export interface DienstVanDag {
  sleutel: DienstSleutel; omloop: OmloopSleutel
  deel: number; delen: number          // 1-based
  van: number; tot: number             // eerste vertrek, laatste aankomst, alle ritten
  minuten: number                      // werktijd = tot − van
  rituren: number                      // Σ(aankomst−vertrek)/60 over ritten met telt; niet afgerond
  ritten: PlanRit[]
}
export interface OmloopVanDag {
  sleutel: OmloopSleutel; mapFolder: string; lineFile: string; lijn: string
  tourNumber: string; days: number; depot: string; vorm?: Busvorm
  van: number; tot: number; minuten: number; rituren: number
  diensten: DienstVanDag[]
}
export interface KaartDag {
  mapFolder: string; mapName: string; lineFiles: string[]
  dag: number; datum: string; weekdag: number /*0=zo*/; soort: 'school' | 'break' | 'holiday'
  omlopen: OmloopVanDag[]
  fout?: 'kaart'
}
export interface Dagrooster { dag: number; kaarten: KaartDag[] }
export interface LijnWeek {
  lineFile: string
  dagen: Array<{ dag: number; datum: string; omlopen: number; diensten: number; rituren: number; werkuren: number }>
  gemRituren: number; gemWerkuren: number; gemDiensten: number; gemOmlopen: number; piekOmlopen: number
}

export interface VastRooster {
  bussen: Record<OmloopSleutel, number>
  chauffeurs: Record<DienstSleutel, number>
  autoAanvullen?: boolean
  gemaakt?: number                       // bedrijfsdag van de migratie
}

export type UitvalSoort = 'ziek' | 'telaat' | 'pech'
export interface Uitval {
  id: string                             // `${dag}|${soort}|${medewerker ?? bus}`
  soort: UitvalSoort; medewerker?: number; bus?: number
  minuten?: number                       // telaat: 20..60
  kosten?: number                        // pech: al geboekt, centen
}

export type InvulKeuze = { soort: 'collega'; id: number } | { soort: 'uitzend' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export type BusKeuze = { soort: 'eigen'; nummer: number } | { soort: 'huur' } | { soort: 'liggen' }
export type InvulDoel =
  | { soort: 'dienst'; dienst: DienstSleutel }   // hele dienst
  | { soort: 'stuk'; dienst: DienstSleutel }     // het te-laat-stuk
  | { soort: 'omloop'; omloop: OmloopSleutel }   // de bus

export interface Gereden { van: number; tot: number; werkMinuten: number; rituren: number; deel: number; busnummer?: number }
export interface Vandaag {
  dag: number
  uitval: Uitval[]
  invulling: Record<DienstSleutel, InvulKeuze>
  stukInvulling: Record<DienstSleutel, InvulKeuze>
  busInvulling: Record<OmloopSleutel, BusKeuze>
  gereden: Record<DienstSleutel, Gereden>
}
export interface LopendeRit {
  dienst: DienstSleutel; dag: number
  van: number; tot: number               // het gekozen venster
  ritten: string[]                       // PlanRit.sleutel van de telbare ritten in het venster
  omloopNr: string; deel: number; delen: number; lijn: string
  busnummer?: number
}

export type Wie = { soort: 'eigen'; id: number } | { soort: 'collega'; id: number } | { soort: 'uitzend' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export type Bron = 'rooster' | 'hand' | 'centrale' | 'standaard'
export type Afwezig = 'ziek' | 'telaat' | 'afwezig' | 'weg' | 'dubbel' | 'monteur'
export interface Stand { wie: Wie; bron: Bron; reden?: Afwezig; toeslag?: boolean; kosten: number }
export type BusWie = { soort: 'eigen'; nummer: number } | { soort: 'huur' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export interface BusStand { wie: BusWie; bron: Bron; reden?: 'pech' | 'werkplaats' | 'weg' | 'dubbel'; toeslag?: boolean; kosten: number }

export type ConflictSoort =
  | 'bus-weg' | 'bus-werkplaats' | 'bus-dubbel' | 'bus-vorm'
  | 'chauffeur-weg' | 'chauffeur-afwezig' | 'chauffeur-dubbel' | 'chauffeur-rust' | 'chauffeur-overstap'
  | 'chauffeur-nachtrust' | 'overuren' | 'te-lang' | 'bevoegd' | 'monteur'
export interface Conflict { soort: ConflictSoort; ernst: 'fout' | 'let'; dienst?: DienstSleutel; omloop?: OmloopSleutel; bus?: number; medewerker?: number; andere?: string; minuten?: number }

export interface PlanDienst {
  dienst: DienstVanDag
  roosterId?: number
  stand: Stand                                   // hele dienst; bij telaat: het deel na het stuk
  stuk?: { van: number; tot: number; minuten: number; rituren: number; stand: Stand }
  jij?: { van: number; tot: number; nu: boolean; gereden?: Gereden }
  plots: boolean
  uitgevallen: number                            // rituren
  conflicten: Conflict[]
}
export interface PlanOmloop { omloop: OmloopVanDag; bus: BusStand; roosterBus?: number; diensten: PlanDienst[]; conflicten: Conflict[] }
export interface Werkdag { minuten: number; rituren: number; diensten: DienstSleutel[] }
export interface Telling {
  omlopen: number; eigenBus: number; huurbus: number
  diensten: number; eigen: number; collega: number; jij: number; uitzend: number
  uitbesteed: number; open: number; uitgevallen: number
  rituren: number; uitgevallenRituren: number; werkuren: number
}
export interface DagPlan {
  dag: number; datum?: string; vandaag: boolean
  kaarten: Array<{ kaart: KaartDag; omlopen: PlanOmloop[] }>
  terugval: Array<{ mapFolder: string; lineFile: string }>
  vrij: { chauffeurs: number[]; bussen: number[] }
  werk: Record<number, Werkdag>
  uitzend: { gebruikt: number; max: number }
  conflicten: Conflict[]
  telling: Telling
}
export interface ConcessieCijfers { mapFolder: string; lineFile: string; naam: string; bron: 'plan' | 'terugval'; rituren: number; uitgevallen: number; vergoeding: number; onderaannemer: number }
export interface PlanCijfers {
  perConcessie: ConcessieCijfers[]
  vergoeding: number; onderaannemer: number; eigenBus: number
  uitzend: { diensten: number; kosten: number }
  huurbus: { omlopen: number; kosten: number }
  overuren: { minuten: number; kosten: number }
  lonen: number
  uitgevallen: { rituren: number; ritten: number; boete: number; reputatie: number }
  legacyZelf: number
  kosten: number                                  // alle kosten samen, positief
  gereden: number                                 // gereden rituren
  werkend: number[]; overwerkt: number[]; eigenAandeel: number
  busUren: Record<number, number>
  omlopen: number; eigenOmlopen: number
  diensten: number; eigenDiensten: number; jijDiensten: number; openDiensten: number; uitbesteed: number
}

export type RoosterActie =
  | { soort: 'bus'; omloop: OmloopSleutel; nummer: number | null }
  | { soort: 'chauffeur'; dienst: DienstSleutel; id: number | null }
  | { soort: 'busOpLijn'; mapFolder: string; lineFile: string; nummer: number; dag: number }
  | { soort: 'vulAan'; dag: number; bereik: 'dag' | 'week'; eerste?: boolean }
  | { soort: 'wis'; wat: 'alles' }
  | { soort: 'wis'; wat: 'masker'; mapFolder: string; lineFile: string; days: number }
  | { soort: 'kopieer'; mapFolder: string; lineFile: string; van: number; naar: number }
  | { soort: 'herstel'; rooster: VastRooster }
  | { soort: 'auto'; aan: boolean }
export type RoosterFout = 'geen' | 'weg' | 'te-lang' | 'planner' | 'kaart' | 'dag' | 'geenPlek'
export type InvulFout = 'geen' | 'weg' | 'bezet' | 'kort' | 'vol' | 'bezig' | 'gereden' | 'dag' | 'kaart'
export type RitFout = 'geen' | 'ritBezig' | 'dienst' | 'kaart' | 'bus' | 'busLigt' | 'gereden' | 'venster'

export interface KaartRit { sleutel: string; route: string; lijn: string; naar: string; vertrek: number; tijden: number[]; stopIds: string[]; leeg: boolean }
export interface KaartOmloop { sleutel: OmloopSleutel; lineFile: string; tourNumber: string; ritten: KaartRit[] }
export interface LijnPlan { mapFolder: string; mapName: string; dag: number; datum: string; van: number; tot: number; omlopen: KaartOmloop[]; routes: Record<string, number[]>; haltes: string[] }
