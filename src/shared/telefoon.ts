import type { Duty } from '../core/types'

/*
 * De telefoon: waaraan je een dienst herkent, en wat de stand van de aanmelding is.
 *
 * WAAROM DIT GEDEELD IS
 * De telefoon staat op drie plekken: in de overlay, op een echte telefoon of
 * tablet (renderer/src/apparaat.tsx) en in het hoofdproces, dat de stand
 * bijhoudt. Meld je je op je iPad aan, dan hoort de overlay dat ook te weten --
 * dus staat de stand in het hoofdproces en niet in een van de vensters, en
 * moeten alle drie een dienst op precies dezelfde manier herkennen.
 */

/** Waaraan je een dienst herkent: welke ritten, in welke volgorde. */
export function dutyKeyOf(duty: Duty | undefined): string {
  if (!duty) return ''
  return `${duty.mapFolder}|${duty.legs.map((leg) => `${leg.tripFile}@${leg.departure}`).join(';')}`
}

/** Voor welke dienst je tekent: kaart, omloop en vertrektijd. */
export function dienstSleutelVan(duty: Duty | undefined): string {
  return duty ? `${duty.mapFolder}|${duty.tourNumber}|${duty.start}` : ''
}

/*
 * Voor welke dienst je je aanmeldt: de dienstsleutel plus alle ritten. Kaart,
 * omloop en vertrektijd alleen zijn te grof: een aangenomen dienst kan daarin
 * gelijk zijn aan de vrije rit die ervoor liep, en dan zou de aanmelding van
 * die rit blijven staan.
 */
export function aanmeldSleutelVan(duty: Duty | undefined): string {
  return duty ? `${dienstSleutelVan(duty)}#${dutyKeyOf(duty)}` : ''
}

/** Wat de vensters van de telefoon over de aanmelding te weten krijgen. */
export interface TelefoonStand {
  /** Aangemeld met nummer en pincode (of overgeslagen als er geen gegevens zijn). */
  aangemeld: boolean
  /** De dienstopdracht aanvaard; bij vrij rijden valt er niets te aanvaarden. */
  aanvaard: boolean
  /** Wanneer de pauze begon, in speltijd. Leeg betekent: geen pauze bezig. */
  pauzeVanaf?: number
  /** De rit waarvoor de chauffeur zelf "IBIS ingevoerd" heeft gezegd. */
  ibisReady?: string
  /**
   * Hoeveel cijfers het personeelsnummer en de pincode tellen.
   *
   * Alleen de lengte, want het cijferblok moet weten hoeveel vakjes het tekent.
   * De cijfers zelf blijven op de pc: het nakijken gebeurt in het hoofdproces,
   * zodat een telefoon op het netwerk ze nooit te zien krijgt.
   */
  nummerLengte: number
  pinLengte: number
}

/**
 * Wat de telefoon in OMSI zelf kan laten doen.
 *
 * Elk van deze hangt aan een toets van het spel, met de naam die in
 * `Inputs\keyboard.cfg` staat. De app zoekt de toets daar op -- heeft de speler
 * hem zelf veranderd, dan gaat dat vanzelf mee -- en de plugin drukt hem in,
 * want die draait ín OMSI; zie `lees_opdracht` in plugin/omsicareer.c.
 *
 * Een vaste lijst, en niet "welke naam de telefoon ook stuurt": anders kan een
 * toestel op het netwerk elke toets van het spel laten indrukken.
 */
export const OMSI_TOETSEN = {
  kaartje: 'ticket_give',
  wisselgeld: 'change_give',
  ibis0: 'IBIS_0',
  ibis1: 'IBIS_1',
  ibis2: 'IBIS_2',
  ibis3: 'IBIS_3',
  ibis4: 'IBIS_4',
  ibis5: 'IBIS_5',
  ibis6: 'IBIS_6',
  ibis7: 'IBIS_7',
  ibis8: 'IBIS_8',
  ibis9: 'IBIS_9',
  ibisInvoer: 'IBIS_eingabe',
  ibisWissen: 'IBIS_loeschen',
  ibisLijn: 'IBIS_setmode_linie_kurs',
  ibisRoute: 'IBIS_setmode_route',
  ibisBestemming: 'IBIS_setmode_ziel',
  /*
   * De knoppen van de kaartautomaat en het LAWO-paneel. Die staan niet in
   * OMSI's eigen keyboard.cfg -- in de bus zijn het muisknoppen -- maar het
   * spel geeft elke naam uit dat bestand door aan het busscript, dus de app kan
   * ze er met toestemming bij schrijven. Zie core/bustoetsen.ts, waar ook staat
   * wat elke knop doet.
   */
  afrModul: 'IBIS_Modul',
  afrUhr: 'IBIS_Uhr',
  afrVor: 'IBIS_vor',
  afrRueck: 'IBIS_rueck',
  afrKurz: 'ticketprinter_button_ticket_1',
  afr24h: 'ticketprinter_button_ticket_2',
  afrKind: 'ticketprinter_button_ticket_3',
  afrKindKurz: 'ticketprinter_button_ticket_4',
  afrGrp: 'ticketprinter_button_ticket_grp',
  afrMo: 'ticketprinter_button_ticket_mo',
  afrWo: 'ticketprinter_button_ticket_wo',
  afrSmo: 'ticketprinter_button_ticket_smo',
  afrSwo: 'ticketprinter_button_ticket_swo',
  afrDrucken: 'ticketprinter_button_enter',
  afrGeven: 'ticketprinter_getticket',
  lawoMode: 'LAWO_Taste_MODE',
  lawoEnter: 'LAWO_Taste_ENTER',
  lawoWissen: 'LAWO_Taste_CE',
  lawoL: 'LAWO_Taste_L',
  lawoM: 'LAWO_Taste_M',
  lawoA: 'LAWO_Taste_A',
  lawoB: 'LAWO_Taste_B',
  lawo0: 'LAWO_Taste_0',
  lawo1: 'LAWO_Taste_1',
  lawo2: 'LAWO_Taste_2',
  lawo3: 'LAWO_Taste_3',
  lawo4: 'LAWO_Taste_4',
  lawo5: 'LAWO_Taste_5',
  lawo6: 'LAWO_Taste_6',
  lawo7: 'LAWO_Taste_7',
  lawo8: 'LAWO_Taste_8',
  lawo9: 'LAWO_Taste_9'
} as const

export type OmsiToets = keyof typeof OMSI_TOETSEN

/**
 * Welke plugin de app verwacht in OMSI.
 *
 * Staat er een oudere in het spel, dan mist de app dingen zonder dat iemand het
 * ziet: de kaartverkoop komt niet door, en een toets die de app laat indrukken
 * gebeurt nooit. De telefoon zegt het dan. Hier en niet in core/live.ts, omdat
 * de vensters dit nummer ook nodig hebben en core/live bestanden leest.
 */
export const PLUGIN_VERSIE = 11

/** Wat er van een poging tot aanmelden terugkomt. */
export type AanmeldUitslag = 'nummer' | 'aangemeld' | 'fout'

export const LEGE_TELEFOON: TelefoonStand = {
  aangemeld: false,
  aanvaard: false,
  nummerLengte: 0,
  pinLengte: 0
}
