import { bedrijfsdatum, omloopSleutel } from './bedrijfsplan'
import { runsOn, type Calendar } from './calendar'
import { MIN_STOPS_FOR_BUS_LINE } from './network'
import type { KaartOmloop, KaartRit, LijnPlan } from './planTypen'
import type { TripRoute } from './routing'
import { stopOffsets, tripMinutes } from './timetable'
import type { OmsiMap } from './types'

/*
 * Het lijnplan voor de vlootkaart: elke omloop van de dag met al zijn ritten,
 * de tijd bij elke halte, en de route van elke rit over de kaart. Daaruit zet
 * het venster de bussen op hun plek op elke klokstand (shared/vloot.ts).
 *
 * WAAROM NIET HET NETWERK
 * network.ts laat de ritten met minder dan drie haltes weg (de LEE-ritten naar
 * de remise en de Überliegeplatz-ritten). Voor geld klopt dat, maar op een
 * kaart verdwijnt een bus dan midden in zijn omloop en komt hij ergens anders
 * weer tevoorschijn. Dus alles uit `map.tours`, zoals bedrijfsplan.ts, met
 * dezelfde ontdubbeling op `tripFile@vertrek` en dezelfde omloopsleutels: een
 * omloop op de kaart is dezelfde als in het plan van de dag (`kaartDag`).
 *
 * Een omloop zonder één rit van drie haltes staat ook in `kaartDag` niet; hier
 * dus ook niet.
 *
 * Ontwerp: design/ontwerpen/busbedrijf-planning.md §8.1.
 */

/** De sleutel van een route: dezelfde rit over dezelfde haltes is dezelfde lijn. */
export function routeSleutel(tripFile: string, stopIds: string[]): string {
  return `${tripFile}|${stopIds.join(',')}`
}

/** Waar de rit eindigt: de tijd bij de laatste halte, of het vertrek als er geen tijden zijn. */
export function eindVan(rit: KaartRit): number {
  return rit.tijden.length > 0 ? rit.tijden[rit.tijden.length - 1] : rit.vertrek
}

export function bouwLijnplan(
  map: OmsiMap,
  routes: (legs: Array<{ tripFile: string; stopIds: string[] }>) => TripRoute[],
  lineFiles: string[],
  kalender: Calendar,
  anker: string,
  dag: number
): LijnPlan {
  const datum = bedrijfsdatum(anker, dag)
  const lijnen = new Set(lineFiles.map((l) => l.toLowerCase()))
  const omlopen: KaartOmloop[] = []
  const legs = new Map<string, { tripFile: string; stopIds: string[] }>()
  const haltes = new Set<string>()

  for (const tour of map.tours) {
    if (!lijnen.has(tour.lineFile.toLowerCase()) || !runsOn(tour.days, datum, kalender)) continue
    const gezien = new Set<string>()
    const ritten: KaartRit[] = []
    for (const entry of [...tour.trips].sort((a, b) => a.departure - b.departure)) {
      const trip = map.trips.get(entry.tripFile.toLowerCase())
      if (!trip || trip.stops.length === 0) continue
      const sleutel = `${entry.tripFile.toLowerCase()}@${entry.departure}`
      if (gezien.has(sleutel)) continue
      gezien.add(sleutel)
      const stopIds = trip.stops.map((s) => s.id)
      /*
       * De tijd bij elke halte: het vertrek plus de verschuiving uit de
       * dienstregeling (timetable.ts). Nooit terug in de tijd, en de laatste
       * halte niet vóór het einde van de rit: anders staat een bus op de kaart
       * stil terwijl hij volgens het plan nog rijdt.
       */
      const tijden: number[] = []
      for (const offset of stopOffsets(trip, entry.profileIndex)) {
        const tijd = entry.departure + (Number.isFinite(offset) ? Math.max(0, offset) : 0)
        tijden.push(Math.max(tijd, tijden[tijden.length - 1] ?? entry.departure))
      }
      if (tijden.length > 1) {
        const eind = entry.departure + tripMinutes(trip, entry.profileIndex)
        if (Number.isFinite(eind) && eind > tijden[tijden.length - 1]) tijden[tijden.length - 1] = eind
      }
      const route = routeSleutel(entry.tripFile, stopIds)
      if (!legs.has(route)) legs.set(route, { tripFile: entry.tripFile, stopIds })
      for (const id of stopIds) haltes.add(id)
      ritten.push({
        sleutel,
        route,
        lijn: trip.lineNumber || trip.ident || tour.lineFile,
        naar: trip.terminus,
        vertrek: entry.departure,
        tijden,
        stopIds,
        leeg: stopIds.length < MIN_STOPS_FOR_BUS_LINE
      })
    }
    if (!ritten.some((r) => !r.leeg)) continue
    omlopen.push({
      sleutel: omloopSleutel(map.folder, tour.lineFile, tour.days, tour.number),
      lineFile: tour.lineFile,
      tourNumber: tour.number,
      ritten
    })
  }
  omlopen.sort((a, b) => a.ritten[0].vertrek - b.ritten[0].vertrek || a.sleutel.localeCompare(b.sleutel))

  /*
   * Elke route één keer, in één vraag (kaartlaag.ts onthoudt ze ook). Lukt het
   * routeren niet, dan toch het plan: het venster trekt dan rechte lijnen van
   * halte naar halte, en dat is beter dan geen bussen.
   */
  const lijst = [...legs.entries()]
  const punten: Record<string, number[]> = {}
  try {
    const gevonden = lijst.length > 0 ? routes(lijst.map(([, leg]) => leg)) : []
    lijst.forEach(([sleutel], i) => {
      punten[sleutel] = gevonden[i]?.points ?? []
    })
  } catch {
    for (const [sleutel] of lijst) punten[sleutel] = []
  }

  const alle = omlopen.flatMap((o) => o.ritten)
  return {
    mapFolder: map.folder,
    mapName: map.name,
    dag,
    datum: datum.toISOString().slice(0, 10),
    van: alle.length > 0 ? Math.min(...alle.map((r) => r.vertrek)) : 0,
    tot: alle.length > 0 ? Math.max(...alle.map(eindVan)) : 1440,
    omlopen,
    routes: punten,
    haltes: [...haltes]
  }
}
