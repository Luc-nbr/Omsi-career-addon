/**
 * Hoe je ervoor staat, in één woord.
 *
 * Kleur betekent in deze app precies één ding: de tijd. Rood is te laat, groen
 * is op tijd, blauw is te vroeg -- en verder is niets gekleurd, zodat je bij
 * groen niet hoeft te raden of het iets zegt of gewoon staat.
 *
 * De grens ligt op een minuut. Binnen een minuut heet op tijd: een dienst-
 * regeling is op de minuut geschreven, en seconden eromheen zijn geen nieuws.
 */
export type Punctuality = 'vroeg' | 'optijd' | 'laat'

/** Binnen zoveel seconden van de dienstregeling heet op tijd. */
export const ON_TIME_S = 60

export function punctuality(deltaSeconds: number | undefined): Punctuality | undefined {
  if (deltaSeconds === undefined || !Number.isFinite(deltaSeconds)) return undefined
  if (deltaSeconds > ON_TIME_S) return 'laat'
  if (deltaSeconds < -ON_TIME_S) return 'vroeg'
  return 'optijd'
}
