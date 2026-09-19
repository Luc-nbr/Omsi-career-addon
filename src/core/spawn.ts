import type { StopPoint, TileGrid } from './geo'
import type { LaneNetwork } from './routing'
import { terrainHeight } from './terrain'

/** Waar de bus komt te staan, in de maat die een situatiebestand gebruikt. */
export interface Spawn {
  tx: number
  ty: number
  x: number
  z: number
  height: number
  /** Koers in graden, noord nul, met de klok mee. */
  heading: number
  /** Hoe ver van de halte de bus terechtkomt; boven een meter of tien is het raak. */
  offsetM: number
}

/** Zo ver kijken we als er vlak bij de halte geen rijstrook ligt. */
const FAR_REACH_M = 60

/**
 * Hoe hoog een weg boven het maaiveld nog een talud kan zijn.
 *
 * Erboven is het geen ophoging meer maar een brug of een viaduct dat over de
 * halte heen loopt, en daar hoort de bus niet op te beginnen. Twee verdiepingen
 * is de grens; een dijk waar een bus op stopt wordt niet hoger.
 */
const HOOGSTE_TALUD_M = 8

/**
 * De plek bij een halte waar de bus neergezet wordt: op de rijstrook waar een
 * bus daar zou stoppen, met de neus in de rijrichting, en op de hoogte van het
 * terrein -- anders zakt hij erdoorheen of zweeft hij erboven.
 */
export function spawnAtStop(
  mapPath: string,
  grid: TileGrid,
  network: LaneNetwork,
  stop: StopPoint
): Spawn | undefined {
  /*
   * Eerst dichtbij zoeken, en pas als daar niets ligt verder kijken. Zo blijft
   * een gewone halte staan waar hij stond, en krijgt een stationsplein alsnog
   * een plek in plaats van niets.
   */
  const place = network.spawnAt(stop) ?? network.spawnAt(stop, FAR_REACH_M)
  if (!place) return undefined

  const tile = grid.at(place.x, place.y)
  const grond = terrainHeight(
    mapPath,
    tile.tx,
    tile.ty,
    tile.localX,
    tile.localZ,
    grid.size(tile.ty)
  )

  /*
   * De hoogte van het wegdek gaat voor die van het maaiveld.
   *
   * Een weg ligt zelden op de grond -- hij loopt over een talud, een dijk of een
   * viaduct. Op Thueringer Wald stond de bus die OMSI zelf had weggeschreven
   * 2,14 m boven het terrein; wie daar op terreinhoogte begint staat tot zijn
   * ramen in de berm, en het spel moet hem eruit duwen. Een gelede bus komt
   * daar niet altijd heel uit -- vandaar de halve bussen.
   *
   * Het maaiveld blijft de ondergrens en de terugval: een spline zonder hoogte
   * bestaat, en lager dan de grond kan een weg niet liggen.
   */
  const weg = place.height
  const bruikbaar =
    weg !== undefined &&
    Number.isFinite(weg) &&
    /*
     * Maar niet als het wegdek metershoog boven de grond zweeft.
     *
     * De dichtstbijzijnde rijstrook is niet altijd de weg waar de halte aan
     * ligt: op HafenCity loopt er een viaduct over de Michaeliskirche heen, en
     * dat bord staat plat op straat. Een halte ligt op een talud of een dijk,
     * en die worden geen twee verdiepingen hoog -- daarboven is het een weg die
     * er alleen overheen gaat, en dan is het maaiveld de betere gok.
     */
    (grond === undefined || weg - grond <= HOOGSTE_TALUD_M)

  const height = bruikbaar ? Math.max(weg as number, grond ?? (weg as number)) : grond
  if (height === undefined) return undefined

  return {
    tx: tile.tx,
    ty: tile.ty,
    x: tile.localX,
    z: tile.localZ,
    height,
    heading: place.heading,
    offsetM: Math.hypot(place.x - stop.x, place.y - stop.y)
  }
}
