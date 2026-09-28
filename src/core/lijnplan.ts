import type { Calendar } from './calendar'
import type { LijnPlan } from './planTypen'
import type { TripRoute } from './routing'
import type { OmsiMap } from './types'

/*
 * Het lijnplan voor de vlootkaart: elke omloop van de dag met zijn ritten,
 * haltetijden en routes over de kaart.
 *
 * DEEL 0: DIT IS DE STUB. Deel E (design/ontwerpen/busbedrijf-planning.md §8)
 * bouwt het echte plan; de stub geeft een leeg plan met de goede kop.
 */
export function bouwLijnplan(
  map: OmsiMap,
  _routes: (legs: Array<{ tripFile: string; stopIds: string[] }>) => TripRoute[],
  _lineFiles: string[],
  _kalender: Calendar,
  anker: string,
  dag: number
): LijnPlan {
  return { mapFolder: map.folder, mapName: map.name, dag, datum: anker, van: 0, tot: 1440, omlopen: [], routes: {}, haltes: [] }
}
