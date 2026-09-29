import type { Bus3dLak, Bus3dManifest, Bus3dMeting, Bus3dOmgeving } from '../../../shared/bus3d'
import type { CameraStand, Stand } from './camera'
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
  | { soort: 'draai'; graden: number }
  | { soort: 'kantel'; graden: number }

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
    }
  | { soort: 'lak'; viewer: number; lak: Bus3dLak }
  | { soort: 'invoer'; viewer: number; invoer: Invoer }
  | { soort: 'gezien'; viewer: number }
  | { soort: 'pauze'; viewer: number; aan: boolean; vrijgeven?: boolean }
  | { soort: 'afdruk'; vraag: number; viewer: number; afdruk: AfdrukVraag }
  | { soort: 'meet'; vraag: number; viewer: number; wat: 'draaien' | 'schaduw' | 'geheugen'; beelden?: number }

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
  | { soort: 'beeld'; viewer: number; bitmap: ImageBitmap }
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

/** Nu, in ms sinds 1970, met de fijnheid van `performance.now()`. */
export const klok = (): number => performance.timeOrigin + performance.now()
