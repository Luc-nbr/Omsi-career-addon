/**
 * Opmaakhulp zonder Node-afhankelijkheden, zodat zowel het hoofdproces als de
 * interface hem kan gebruiken.
 */

/** `minuten na middernacht` → `uu:mm`, ook voorbij 24:00. */
export function formatTime(minutes: number): string {
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60) % 24
  return `${String(hours).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`
}

/** `minuten` → `4u 05m`, voor dienstlengtes. */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  return `${Math.floor(total / 60)}u ${String(total % 60).padStart(2, '0')}m`
}

/** Bedrag in euro's, Nederlandse notatie. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

/** Dag van het jaar (1-366) voor een datum. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0)
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((now - start) / 86_400_000)
}

/**
 * Dagmaskers uit de dienstregeling: bit 0 is maandag tot en met bit 4 vrijdag,
 * bit 5 zaterdag en bit 6 zondag. De bits daarboven zijn feestdagcategorieen.
 */
const DAY_NAMES = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
const WEEKDAYS = 0b0011111
const WEEKEND = 0b1100000

/** Bitpositie van een datum: maandag is 0. */
export function weekdayBit(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

/** Korte omschrijving van de dagen waarop een dienst rijdt. */
export function describeDays(mask: number): string {
  const days = mask & 0b1111111
  if (days === 0) return 'onbekende dag'
  if ((days & WEEKDAYS) === WEEKDAYS && (days & WEEKEND) === 0) return 'doordeweeks'
  if (days === WEEKEND) return 'weekend'
  if ((days & 0b1111111) === 0b1111111) return 'elke dag'
  const named = DAY_NAMES.filter((_, index) => (days >> index) & 1)
  return named.length <= 2 ? named.join(' en ') : `${named.length} dagen`
}

/**
 * Eerste dag van het jaar vanaf `preferred` waarop dit masker geldt. OMSI leidt
 * de weekdag uit de datum af, dus een doordeweekse dienst op een zondag zou de
 * verkeerde dienstregeling opleveren.
 */
export function dayOfYearForDays(year: number, preferred: number, mask: number): number {
  const days = mask & 0b1111111
  if (days === 0) return preferred
  for (let offset = 0; offset < 7; offset++) {
    const candidate = preferred + offset
    const date = new Date(Date.UTC(year, 0, candidate))
    if ((days >> weekdayBit(date)) & 1) return candidate
  }
  return preferred
}
