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

/** Wat er van een poging tot aanmelden terugkomt. */
export type AanmeldUitslag = 'nummer' | 'aangemeld' | 'fout'

export const LEGE_TELEFOON: TelefoonStand = {
  aangemeld: false,
  aanvaard: false,
  nummerLengte: 0,
  pinLengte: 0
}
