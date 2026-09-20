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
   * Het maaiveld blijft de ondergrens en de terugval: een rijstrook zonder
   * hoogte bestaat, en lager dan de grond kan een weg niet liggen.
   *
   * WAAROM ER GEEN BOVENGRENS MEER STAAT
   * Hier stond: ligt het wegdek meer dan acht meter boven het maaiveld, dan is
   * het geen talud maar een viaduct dat over de halte heen loopt, dus terug naar
   * het maaiveld. Dat was een gok, en hij was verkeerd. Wat de gok voor een
   * viaduct aanzag is het maaiveld dat niet klopt: op HamburgLi20 staat de
   * Michaeliskirche met een maaiveld van -11,5 m in de boeken -- dat is de bodem
   * van de Elbe en geen straat. Van de 47 haltes waar de grens aansloeg lag er
   * geen enkele onder een viaduct; ze lagen allemaal aan een weg die gewoon
   * hoger ligt dan de gemeten grond. De bus werd er tot vijftien meter onder
   * gezet, en dat is precies de klacht "de bus spawnt onder de wegen"
   * (probe-viaduct.ts).
   *
   * Het wegdek is nagemeten en klopt: waar een baan uit een object aansluit op
   * een baan uit een spline, komen de twee hoogtes in 96 tot 98 procent van de
   * gevallen binnen een meter overeen (probe-baanhoogte.ts). Het maaiveld is dus
   * de zwakke van de twee, en die hoort niet te winnen van de sterke.
   */
  const weg = place.height
  const bruikbaar = weg !== undefined && Number.isFinite(weg)

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
