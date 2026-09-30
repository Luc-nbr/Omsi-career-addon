import type { Bus3dLak, Bus3dManifest, Bus3dMeting, Bus3dOmgeving } from '../../../shared/bus3d'
import type { Laag, LakFamilieInfo, LakStart } from '../../../shared/lak'
import type { CameraStand, Stand } from './camera'
import type { DecalAnalyse } from './lak/lakdoek'

/** Waar Snelle lak de naam of het logo zoekt: delen van de lengte, en hoogtes (m boven de onderkant) op voorkeur. */
export interface LakVrijVraag {
  zVan: number
  zTot: number
  zVoorkeur: number
  banden: Array<[number, number]>
  /** Laag-id's waar de plek niet mag overlappen (het logo mijdt de naam). */
  vermijd?: string[]
}
import type { Vec3 } from './wiskunde'

/**
 * De berichten tussen het venster en zijn renderer-werker (bus3d-ontwerp §4.4).
 *
 * Het venster (verbinding.ts) meldt viewers aan, geeft ze een maat en stuurt
 * het manifest; de werker haalt pakket en texturen zelf op via `omsi3d://`,
 * tekent, en stuurt elk beeld als ImageBitmap terug voor een
 * `bitmaprenderer`-doek. Tijden gaan als tijdstip sinds 1970 (timeOrigin +
 * now), want het venster en de werker hebben elk hun eigen `performance.now()`.
 */

export type Invoer =
  | { soort: 'sleep'; dx: number; dy: number }
  | { soort: 'zoom'; factor: number }
  | { soort: 'stand'; stand: Stand }
  /** Verschuiven (middelste knop of Shift, §2.3), in pixels. */
  | { soort: 'schuif'; dx: number; dy: number }
  | { soort: 'draai'; graden: number }
  | { soort: 'kantel'; graden: number }
  /** Zoomen naar de cursor (Lakstudio, §2.3): x en y in NDC van de viewer. */
  | { soort: 'zoomNaar'; factor: number; x: number; y: number }
  /** Centreren op een punt van de bus (dubbelklik, §2.3), in o3d-assen. */
  | { soort: 'centreer'; punt: Vec3 }
  /** Inpassen (toets F): zoom 1, geen verschuiving, het aanzicht blijft. */
  | { soort: 'inpassen' }

export interface AfdrukVraag {
  /** Een eigen stand, of het mikpunt en de afstand van een close-up (wereld). */
  stand?: CameraStand
  doel?: Vec3
  afstand?: number
  b: number
  h: number
  /** Ook een masker: wit waar de bus is, zwart daarbuiten (voor de proef). */
  masker?: boolean
  /** Diagnose: een beeld met per tekenbeurt een eigen kleur, en de tabel erbij. */
  id?: boolean
  /**
   * De foto v4 (§9): de camera van de foto (215°/8°, 88% van de breedte), een
   * doorzichtige achtergrond met alleen de contactschaduw als alfa. Altijd WebP.
   */
  foto?: boolean
  formaat: 'png' | 'webp'
}

export type NaarWerker =
  | { soort: 'viewer'; viewer: number; b: number; h: number; dpr: number }
  | { soort: 'weg'; viewer: number }
  | { soort: 'omgeving'; omgeving: Bus3dOmgeving }
  /** Alleen voor het ijken: lichtwaarden overschrijven (zie `zetLicht` in teken.ts). */
  | { soort: 'licht'; licht: Record<string, unknown> }
  | {
      soort: 'bus'
      viewer: number
      laad: number
      manifest: Bus3dManifest
      lak?: Bus3dLak
      bron: 'cache' | 'nieuw'
      /** Wanneer het venster de bus vroeg (ms sinds 1970). */
      t0: number
      /** Lichte stand: OMSI draait (budget 96 MB, geen heldenbeeld). */
      licht?: boolean
      /** Het fotovenster: geen heldenbeeld (dat hoort bij het 3D-venster). */
      foto?: boolean
    }
  | { soort: 'lak'; viewer: number; lak: Bus3dLak; t0: number }
  /** De textuurlijst van een pakket dat nog gebouwd wordt: de bestanden alvast ophalen (§4.1). */
  | { soort: 'voorhaal'; lijst: Array<{ id: string; bytes: number }> }
  | { soort: 'invoer'; viewer: number; invoer: Invoer }
  | { soort: 'gezien'; viewer: number }
  | { soort: 'pauze'; viewer: number; aan: boolean; vrijgeven?: boolean }
  /** Het draaiplateau van de dealerstand (§6): 6°/s na 6 s zonder invoer. */
  | { soort: 'plateau'; viewer: number; aan: boolean }
  | { soort: 'afdruk'; vraag: number; viewer: number; afdruk: AfdrukVraag }
  | { soort: 'meet'; vraag: number; viewer: number; wat: 'draaien' | 'schaduw' | 'geheugen'; beelden?: number }
  /*
   * De Lakstudio (lakstudio-ontwerp §4.1): het lakdoek in dezelfde werker en
   * context. Antwoorden gaan als 'antwoord' op het vraagnummer; de voortgang van
   * de export als 'lakVoortgang'.
   */
  | {
      soort: 'lakStart'
      vraag: number
      viewer: number
      familie: LakFamilieInfo
      lagen: Laag[]
      spiegel?: { aan: boolean; vlakX?: number }
      licht?: boolean
      /** De start (§4.4): bij 'precies' is de basis de lak die nu op de bus staat. */
      start?: LakStart
      /** De lak meteen op de bus (anders pas bij `lakToon`: een nieuw project zonder lagen, §2.1). */
      getoond?: boolean
    }
  | { soort: 'lakLagen'; lagen: Laag[]; spiegel?: { aan: boolean; vlakX?: number } }
  | { soort: 'lakBeeld'; id: string; beeld: ImageBitmap }
  | { soort: 'lakMasker'; aan: boolean }
  /** De lak op de bus aan of uit ([Voor/na], §2.1). */
  | { soort: 'lakToon'; aan: boolean }
  | { soort: 'lakKies'; vraag: number; viewer: number; x: number; y: number; onderdeel?: boolean }
  /**
   * Het penseel (§4.8): begin, een punt (x, y in NDC van de viewer: de werker wijst
   * zelf aan), en het einde, dat de streek als vector teruggeeft (antwoord op `vraag`).
   */
  | {
      soort: 'lakPenseel'
      fase: 'begin' | 'punt' | 'einde'
      vraag?: number
      viewer: number
      x: number
      y: number
      laagId: string
      straalCm: number
      hardheid: number
      dekking: number
      gum: boolean
    }
  /** "Effen in de kleuren van deze lak" (§4.4): per zone de kleur van de lak op de bus. */
  | { soort: 'lakKleuren'; vraag: number }
  /** [Schuif naar een vrij stuk] (§4.8). */
  | { soort: 'lakSchuif'; vraag: number; id: string }
  /** Een vrije plek voor de naam of het logo van Snelle lak (zie `Lakdoek.vrijePlek`). */
  | { soort: 'lakVrij'; vraag: number; id: string; zoek: LakVrijVraag }
  /** Welke [visible]-variabelen meshes OVER de lak hebben (§4.9; `Lakdoek.ligging`). */
  | { soort: 'lakLigging'; vraag: number; texturen: string[] }
  | { soort: 'lakExport'; vraag: number; tegel?: number; alleen?: string[]; metRgba?: boolean }
  | { soort: 'lakMeet'; vraag: number; viewer: number; beelden?: number }
  | { soort: 'lakStop' }
  /** Voor de proef (P3-P6), zie `Lakdoek.proef`. */
  | { soort: 'lakProef'; vraag: number; wat: 'masker' | 'effect' | 'teken' | 'tijd' | 'testBasis' | 'plek' | 'zijL' | 'zijR'; doel?: string; ids?: number[]; keer?: number; kleur?: [number, number, number] }
  /** Na andere busopties (een nieuwe ruststand): de maskers opnieuw (§4.9, P16). */
  | { soort: 'lakMaskers'; vraag: number }
  /** De tweede viewport (§4.8): deze viewer toont de andere kant, plat, zolang het lakdoek loopt. */
  | { soort: 'tweede'; viewer: number; aan: boolean }

export interface StandBericht {
  soort: 'stand'
  viewer: number
  laad: number
  fase: 'geometrie' | 'texturen' | 'scherp'
  klaar: number
  totaal: number
  eersteBeeldMs?: number
  scherpMs?: number
  meting?: Bus3dMeting
  /** Waar de tijd heen ging, in ms na het vragen: bericht, geometrie, lak, eersteTik. */
  mijlpalen?: Record<string, number>
}

export type VanWerker =
  | { soort: 'gereed'; webgl: boolean; detail?: string; info?: Record<string, unknown> }
  /**
   * `laad`: bij welke bus (het nummer van zijn 'bus'-bericht) dit beeld hoort.
   * `cam`: de camera van dit beeld (beeld × projectie, wereldassen), voor de
   * handvatten van de Lakstudio die het venster over het beeld tekent.
   */
  | { soort: 'beeld'; viewer: number; bitmap: ImageBitmap; laad: number; cam?: number[] }
  /** De geen-kopie-regel (§4.8) per decal-laag: ls.spiegelschrift en ls.kopieDeur. */
  | { soort: 'lakAnalyse'; uitslag: Record<string, DecalAnalyse> }
  | StandBericht
  | { soort: 'held'; viewer: number; pakket: string; kleurstelling?: string; sleutel: string; webp: ArrayBuffer }
  | {
      soort: 'fout'
      viewer: number
      laad: number
      reden: 'geen-webgl' | 'context-weg' | 'pakket-stuk' | 'te-zwaar' | 'fout'
      detail?: string
      pakket?: string
    }
  | { soort: 'antwoord'; vraag: number; uitkomst: unknown }
  | { soort: 'lakVoortgang'; doel: string; stap: string; deel: number }
  /**
   * Na een contextverlies (§4.13, P4): de werker startte het lakdoek zelf opnieuw,
   * in de lichte stand en met de laatste lagen; `klaar` is wat lakStart gaf.
   */
  | { soort: 'lakHerstart'; viewer: number; klaar: unknown }

/** Nu, in ms sinds 1970, met de fijnheid van `performance.now()`. */
export const klok = (): number => performance.timeOrigin + performance.now()
