/*
 * De automatische updater, de regels zelf (zonder Electron); de kant die
 * Electron nodig heeft staat in main/bijwerken.ts.
 *
 * Alleen de geïnstalleerde versie (de nsis-installer) werkt zichzelf bij. De
 * draagbare exe meldt alleen dat er een nieuwe versie is; in ontwikkeling, met
 * een eigen gebruikersmap (een proef naast Lucs app) en in "alleen bekijken"
 * gebeurt er niets.
 */

/** Wat de melding in de app laat zien. */
export type BijwerkStand =
  /** Gedownload; wordt geïnstalleerd zodra OMSI dicht is en er geen dienst loopt. */
  | { soort: 'wacht'; versie: string }
  /** De vorige keer bijgewerkt; dit is de eerste start van de nieuwe versie. */
  | { soort: 'bijgewerkt'; versie: string }
  /** De draagbare exe: er is een nieuwere versie, met een knop naar de releasepagina. */
  | { soort: 'nieuw'; versie: string }

export type Uitvoering = 'ontwikkeling' | 'eigenmap' | 'bekijken' | 'draagbaar' | 'installatie'

/** In welke vorm draait de app, voor de vraag of hij zichzelf mag bijwerken. */
export function welkeUitvoering(o: {
  verpakt: boolean
  /** `PORTABLE_EXECUTABLE_DIR`: zet de draagbare exe van electron-builder. */
  draagbaarMap?: string
  argv: readonly string[]
  bekijken: boolean
}): Uitvoering {
  if (!o.verpakt) return 'ontwikkeling'
  if (o.argv.some((a) => a.toLowerCase().startsWith('--user-data-dir'))) return 'eigenmap'
  if (o.bekijken) return 'bekijken'
  if (o.draagbaarMap) return 'draagbaar'
  return 'installatie'
}

/**
 * Mag de app nu dichtgaan om de update te installeren? Nooit tijdens een
 * dienst of vrije rit, nooit terwijl OMSI 2 of openOMSI draait, en niet onder
 * de handen van de speler (venster vooraan en de laatste twee minuten nog
 * muis of toetsenbord gebruikt). Anders gebeurt het bij het afsluiten.
 */
export function magNuInstalleren(o: {
  dienstLoopt: boolean
  vrijeRit: boolean
  spelDraait: boolean
  spelerInDeApp: boolean
}): boolean {
  return !o.dienstLoopt && !o.vrijeRit && !o.spelDraait && !o.spelerInDeApp
}

/** Is versie `a` nieuwer dan `b`? Als getallen: 0.10.0 komt na 0.9.9; een achtervoegsel telt niet. */
export function isNieuwer(a: string, b: string): boolean {
  const delen = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((d) => Number.parseInt(d, 10) || 0)
  const x = delen(a)
  const y = delen(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const verschil = (x[i] ?? 0) - (y[i] ?? 0)
    if (verschil !== 0) return verschil > 0
  }
  return false
}
