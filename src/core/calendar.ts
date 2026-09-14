import { join } from 'node:path'
import { blockTag, num, readOmsiLines } from './omsiFile'
import { weekdayBit } from '../shared/format'

/**
 * De kalender van een kaart: feestdagen en schoolvakanties.
 *
 * `Holidays.txt` kent twee blokken. `[holiday]` is een losse feestdag met een
 * datum en een naam; `[holidays]` is een reeks van twee datums, de
 * schoolvakanties. Datums staan als jjjjmmdd.
 */
export interface Calendar {
  holidays: Set<number>
  /** Begin- en einddatum van elke schoolvakantie, allebei meegerekend. */
  breaks: Array<[number, number]>
}

/** Wat voor dag het is voor de dienstregeling. */
export type DayKind = 'holiday' | 'break' | 'school'

/*
 * De hoge bits van het dagmasker. De lage zeven zijn maandag tot en met zondag;
 * deze drie zeggen wanneer de omloop geldt. Af te lezen aan de kaarten zelf: in
 * Thueringer Wald draagt omloop 101 masker 287 (ma-vr plus schooldag) en omloop
 * 301 masker 543 (ma-vr plus vakantie) -- dezelfde dagen, andere periode. De
 * zaterdagomlopen hebben ze allebei, en de zondagomlopen ook de feestdagbit.
 */
const BIT_HOLIDAY = 1 << 7
const BIT_SCHOOL = 1 << 8
const BIT_BREAK = 1 << 9
const WEEKDAYS = 0b1111111

const EMPTY: Calendar = { holidays: new Set(), breaks: [] }

export function readCalendar(mapPath: string): Calendar {
  let lines: string[]
  try {
    lines = readOmsiLines(join(mapPath, 'Holidays.txt'))
  } catch {
    return EMPTY
  }

  const holidays = new Set<number>()
  const breaks: Array<[number, number]> = []
  for (let i = 0; i < lines.length; i++) {
    const tag = blockTag(lines[i])
    if (tag === '[holiday]') {
      const date = Math.round(num(lines[i + 1]))
      if (date > 0) holidays.add(date)
    } else if (tag === '[holidays]') {
      const from = Math.round(num(lines[i + 1]))
      const to = Math.round(num(lines[i + 2]))
      if (from > 0 && to >= from) breaks.push([from, to])
    }
  }
  return { holidays, breaks }
}

/** Datum als jjjjmmdd, zoals OMSI hem noteert. */
function stamp(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
}

export function dayKind(calendar: Calendar, date: Date): DayKind {
  const key = stamp(date)
  if (calendar.holidays.has(key)) return 'holiday'
  if (calendar.breaks.some(([from, to]) => key >= from && key <= to)) return 'break'
  return 'school'
}

/**
 * Rijdt een omloop met dit masker op deze datum?
 *
 * Op een feestdag rijdt de zondagsdienst -- dat is waarom de zondagomlopen de
 * feestdagbit dragen en de doordeweekse niet. Verder telt of het schooldag of
 * schoolvakantie is; een kaart die daar geen onderscheid in maakt zet allebei
 * de bits en rijdt dus altijd.
 */
export function runsOn(mask: number, date: Date, calendar: Calendar): boolean {
  const kind = dayKind(calendar, date)
  // Zondagsdienst op een feestdag, dus dan telt de zondagbit.
  const weekday = kind === 'holiday' ? 6 : weekdayBit(date)
  if (((mask & WEEKDAYS) >> weekday & 1) === 0) return false

  const needed = kind === 'holiday' ? BIT_HOLIDAY : kind === 'break' ? BIT_BREAK : BIT_SCHOOL
  /*
   * Kaarten van voor deze indeling zetten geen enkele hoge bit. Die omlopen
   * rijden altijd; er is dan niets om tegen af te wegen.
   */
  if ((mask & (BIT_HOLIDAY | BIT_SCHOOL | BIT_BREAK)) === 0) return true
  return (mask & needed) !== 0
}

/**
 * De eerste datum vanaf `preferred` waarop deze omloop rijdt.
 *
 * OMSI leidt de weekdag en de schoolperiode uit de datum af, dus een dienst
 * klaarzetten op de verkeerde dag levert een omloop op die niet eens in het
 * dienstregelingsmenu staat. Een jaar is ruim genoeg: ook een omloop die alleen
 * in de zomervakantie rijdt, komt binnen dat jaar langs.
 */
export function dateForMask(
  calendar: Calendar,
  year: number,
  preferredDayOfYear: number,
  mask: number
): { year: number; dayOfYear: number; date: Date } | undefined {
  for (let offset = 0; offset < 366; offset++) {
    const dayOfYear = preferredDayOfYear + offset
    const date = new Date(Date.UTC(year, 0, dayOfYear))
    if (runsOn(mask, date, calendar)) {
      // Rolt de dag over het jaar heen, dan telt het jaar van die datum.
      const start = Date.UTC(date.getUTCFullYear(), 0, 0)
      return {
        year: date.getUTCFullYear(),
        dayOfYear: Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000),
        date
      }
    }
  }
  return undefined
}
