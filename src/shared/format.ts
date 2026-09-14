/**
 * Opmaakhulp zonder Node-afhankelijkheden, zodat zowel het hoofdproces als de
 * interface hem kan gebruiken.
 *
 * Alles wat een taal kent neemt die als laatste argument, met Engels als
 * terugval. Het hoofdproces heeft de keuze van de gebruiker niet altijd bij de
 * hand, en dan is een Engelse duur beter dan een Nederlandse.
 */
import { DEFAULT_LANGUAGE, t, type Language } from './i18n'

/** `minuten na middernacht` → `uu:mm`, ook voorbij 24:00. */
export function formatTime(minutes: number): string {
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60) % 24
  return `${String(hours).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`
}

/** Uren- en minutenteken per taal; Duits schrijft het uit. */
const UNITS: Record<Language, [string, string]> = {
  en: ['h', 'm'],
  de: ['Std', 'Min'],
  fr: ['h', 'min'],
  nl: ['u', 'm']
}

/** `minuten` → `4h 05m`, voor dienstlengtes. */
export function formatDuration(minutes: number, language: Language = DEFAULT_LANGUAGE): string {
  const total = Math.round(minutes)
  const [hour, minute] = UNITS[language] ?? UNITS[DEFAULT_LANGUAGE]
  return `${Math.floor(total / 60)}${hour} ${String(total % 60).padStart(2, '0')}${minute}`
}

const MONEY_LOCALE: Record<Language, string> = {
  en: 'en-IE',
  de: 'de-DE',
  fr: 'fr-FR',
  nl: 'nl-NL'
}

/** Bedrag in euro's, in de notatie van de gekozen taal. */
export function formatMoney(amount: number, language: Language = DEFAULT_LANGUAGE): string {
  const locale = MONEY_LOCALE[language] ?? MONEY_LOCALE[DEFAULT_LANGUAGE]
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount)
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
const DAY_KEYS = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat', 'days.sun'] as const
const WEEKDAYS = 0b0011111
const WEEKEND = 0b1100000

/** Bitpositie van een datum: maandag is 0. */
export function weekdayBit(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

/** Korte omschrijving van de dagen waarop een dienst rijdt. */
export function describeDays(mask: number, language: Language = DEFAULT_LANGUAGE): string {
  const days = mask & 0b1111111
  if (days === 0) return t(language, 'days.unknown')
  if ((days & WEEKDAYS) === WEEKDAYS && (days & WEEKEND) === 0) return t(language, 'days.weekdays')
  if (days === WEEKEND) return t(language, 'days.weekend')
  if ((days & 0b1111111) === 0b1111111) return t(language, 'days.every')
  const named = DAY_KEYS.filter((_, index) => (days >> index) & 1).map((key) => t(language, key))
  return named.length <= 2
    ? named.join(` ${t(language, 'days.and')} `)
    : t(language, 'days.count', { count: named.length })
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
