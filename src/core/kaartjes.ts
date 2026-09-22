/**
 * De kaartsoorten van een kaart, met hun prijzen.
 *
 * WAT OMSI WEL EN NIET VERTELT
 * Niet: dat een passagier een kaartje wil, welk kaartje, of hoeveel geld hij
 * aangeeft. Nagemeten en drie keer bevestigd: de systeemvariabelen die bussen
 * lezen zijn zevenentwintig namen en gaan alleen over weer, tijd, botsingen en
 * de muis; de `PAX_`-variabelen gaan alleen over deuren; en het kaartprinter-
 * script van een bus krijgt van buiten precies vijf dingen binnen --
 * `IBIS_modetimerS`, `elec_busbar_rg`, `in_language_ibis`, `zeller` en
 * `elec_busbar_main`. Geen passagier, geen kaartsoort, geen geld. Het spel zegt
 * wat iemand wil met een geluidje (`Ticket_1_1.wav`) en verder niets.
 *
 * Wel: welke kaartjes er op deze kaart bestaan en wat ze kosten. Dat staat in
 * een `.otp` in `TicketPacks`, en dat bestand legt zijn eigen indeling uit in
 * het commentaar bovenaan. De kaart wijst in haar `global.cfg` aan welke set ze
 * gebruikt.
 *
 * Daarmee is het rekenwerk te doen dat je achter het stuur niet wilt doen: wat
 * kost dit kaartje, en wat krijgt hij terug.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readOmsiLines } from './omsiFile'
import type { Kaartje, Kaartset } from '../shared/kaartjes'

export type { Kaartje, Kaartset } from '../shared/kaartjes'

const getal = (regel: string | undefined): number => {
  const w = Number.parseFloat((regel ?? '').trim().replace(',', '.'))
  return Number.isFinite(w) ? w : 0
}

/**
 * Welke kaartset deze kaart gebruikt.
 *
 * De regel staat als `[ticketpack]` met het pad eronder, ten opzichte van de
 * OMSI-map. Niet elke kaart noemt er een -- dan is er geen kaartverkoop en
 * blijft de lijst leeg, wat iets anders is dan een fout.
 */
export function kaartsetVan(omsiPad: string, kaartmap: string): string | undefined {
  const cfg = join(omsiPad, 'maps', kaartmap, 'global.cfg')
  if (!existsSync(cfg)) return undefined
  let regels: string[]
  try {
    regels = readOmsiLines(cfg)
  } catch {
    return undefined
  }
  const at = regels.findIndex((r) => r.trim().toLowerCase() === '[ticketpack]')
  if (at < 0) return undefined
  const pad = (regels[at + 1] ?? '').trim()
  if (!pad) return undefined
  const heel = join(omsiPad, pad.replace(/\\/g, '/'))
  return existsSync(heel) ? heel : undefined
}

/**
 * Een `.otp` uitlezen.
 *
 * Twee soorten blok, `[ticket]` en `[ticket_2]`, met dezelfde eerste zeven
 * velden; de tweede heeft er een dagkaartvlag en een kans achter. De volgorde
 * staat in het commentaar bovenaan het bestand zelf: naam, Engelse naam, aantal
 * haltes, minimumleeftijd, maximumleeftijd, prijs, schermtekst.
 */
export function leesKaartset(bestand: string): Kaartset | undefined {
  let regels: string[]
  try {
    regels = readOmsiLines(bestand)
  } catch {
    return undefined
  }

  const kaartjes: Kaartje[] = []
  let koopkans: number | undefined

  for (let i = 0; i < regels.length; i++) {
    const tag = regels[i].trim().toLowerCase()

    if (tag === '[ticketpack]') {
      // stempelkans, koopkans, spraakzaamheid, mopperkans
      koopkans = getal(regels[i + 2])
      continue
    }

    if (tag !== '[ticket]' && tag !== '[ticket_2]') continue
    const naam = (regels[i + 1] ?? '').trim()
    if (!naam) continue

    kaartjes.push({
      naam,
      naamEngels: (regels[i + 2] ?? '').trim(),
      maxHaltes: getal(regels[i + 3]),
      leeftijdVan: getal(regels[i + 4]),
      leeftijdTot: getal(regels[i + 5]),
      prijs: getal(regels[i + 6]),
      schermtekst: (regels[i + 7] ?? '').trim(),
      dagkaart: tag === '[ticket_2]' ? getal(regels[i + 8]) > 0.5 : undefined
    })
  }

  if (kaartjes.length === 0) return undefined
  const naam = bestand.replace(/\\/g, '/').split('/').at(-1)?.replace(/\.otp$/i, '') ?? 'onbekend'
  return { naam, bestand, kaartjes, koopkans }
}

/** De kaartjes van deze kaart, of niets als er geen kaartverkoop is. */
export function kaartjesVoor(omsiPad: string, kaartmap: string): Kaartset | undefined {
  const bestand = kaartsetVan(omsiPad, kaartmap)
  return bestand ? leesKaartset(bestand) : undefined
}

/**
 * Alle kaartsets die er staan; voor het geval een kaart er geen aanwijst maar er
 * wel een bij hoort.
 */
export function alleKaartsets(omsiPad: string): string[] {
  const map = join(omsiPad, 'TicketPacks')
  if (!existsSync(map)) return []
  const uit: string[] = []
  for (const naam of readdirSync(map)) {
    const otp = join(map, naam, `${naam}.otp`)
    if (existsSync(otp)) uit.push(otp)
  }
  return uit
}
