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
