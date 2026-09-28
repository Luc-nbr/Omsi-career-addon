import type {
  BusKeuze,
  Dagrooster,
  DienstSleutel,
  InvulDoel,
  InvulFout,
  InvulKeuze,
  LijnPlan,
  LijnWeek,
  RitFout,
  RoosterActie,
  RoosterFout
} from '../core/planTypen'
import type { CareerPayload } from './api'

/*
 * De brug naar het hoofdproces voor de planning van het busbedrijf
 * (ontwerp busbedrijf-planning §3.1). Het venster vraagt, main rekent en
 * bewaart; wat er terugkomt is het nieuwe profiel, of een fout met een tekst
 * in shared/tekst/fundament.ts (`bd.fout.<fout>`).
 */

export interface RitOpties {
  vanRit?: string
  totRit?: string
  /** Rijden met een voorgestelde bus als de eigen bus niet geïnstalleerd is. */
  voorgesteldeBus?: boolean
}

/** De klok voor de vlootkaart: die van OMSI als die bij deze kaart hoort, anders geen. */
export type BedrijfKlokStand = { bron: 'omsi'; minuten: number; datum: string; kaartKlopt: boolean } | { bron: 'geen' }

export interface BedrijfPlanApi {
  /** De dagroosters van dag `van` tot en met `tot`; hoogstens 10 dagen, `van` ≥ 1. */
  bedrijfDagen(van: number, tot: number): Promise<Dagrooster[]>
  bedrijfRooster(
    actie: RoosterActie
  ): Promise<{ payload: CareerPayload; fout?: RoosterFout; melding?: { bussen: number; diensten: number } }>
  bedrijfInvullen(
    doel: InvulDoel,
    keuze: InvulKeuze | BusKeuze | null
  ): Promise<{ payload: CareerPayload; fout?: InvulFout }>
  bedrijfRit(
    dienst: DienstSleutel,
    opties?: RitOpties
  ): Promise<{ payload: CareerPayload; fout?: RitFout; bus?: { nummer: number; naam: string } }>
  bedrijfRitBus(pad: string): Promise<{ payload: CareerPayload; fout?: 'geen' | 'eigen' | 'gestart' }>
  bedrijfKaart(mapFolder: string, dag?: number): Promise<LijnPlan | { fout: 'kaart' | 'geen' }>
  bedrijfKlok(mapFolder: string): Promise<BedrijfKlokStand>
  bedrijfLijnWeek(mapFolder: string): Promise<Record<string, LijnWeek> | { fout: 'kaart' }>
}
