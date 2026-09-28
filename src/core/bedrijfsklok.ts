import type { BedrijfKlokStand } from '../shared/bedrijfApi'

/*
 * Rijdt OMSI nu de kaart waar de vlootkaart naar kijkt? Dan telt de klok van
 * OMSI; anders niet.
 *
 * Nagemeten op Lucs installatie (28-09-2026): een lijnnaam alleen wijst zelden
 * één kaart aan (48 van de 52 lijnen van HafenCity bestaan ook elders), en een
 * dienst of vrije rit in de app zegt niet welke kaart OMSI werkelijk geladen
 * heeft. Dus:
 *
 * - staat de lijn van OMSI niet op deze kaart, dan is het aantoonbaar een
 *   andere kaart (`kaartKlopt: false`), wat de app verder ook denkt;
 * - staat hij alleen op deze kaart, dan klopt het;
 * - staat hij op meer kaarten, dan eerst de plek in OMSI's lijst (`mem.line`),
 *   en is het dan nog niet één kaart, de rit in de app, als die op een van
 *   die kaarten is. Die rit kan oud zijn (na een crash blijft `activeDuty`
 *   staan), dus hij beslist alleen wat OMSI zelf openlaat;
 * - zonder lijnnaam, of met een die op geen enkele kaart staat (de index is
 *   van voor er een kaart bijkwam), beslist alleen de rit in de app;
 * - weet niets het, dan `geen`: liever geen klok dan een verkeerde.
 */

/** Een lijnnaam zoals hij vergeleken wordt: zonder .ttl, zonder hoofdletters. */
export function lijnSleutel(naam: string): string {
  // Twee keer trim: "X .ttl" moet "x" worden, niet "x ".
  return naam.trim().replace(/\.ttl$/i, '').trim().toLowerCase()
}

/** Een kaart waarop een lijn staat, en de plek van die lijn in OMSI's lijst. */
export interface LijnPlek {
  folder: string
  plek: number
}

export interface KlokLive {
  time: number
  year: number
  month: number
  day: number
  mem?: { ok: number; lineName?: string; line?: number }
}

export function bedrijfsklok(
  live: KlokLive | undefined,
  mapFolder: string,
  /** De kaart van de dienst of vrije rit die in de app loopt. */
  ritKaart: string | undefined,
  kaartenMetLijn: (lijn: string) => LijnPlek[]
): BedrijfKlokStand {
  // Kaartmappen zijn op Windows hoofdletterloos: "hafencityhamburg" is dezelfde.
  const folder = mapFolder.trim().toLowerCase()
  const rit = ritKaart?.trim().toLowerCase() || undefined
  if (!folder) return { bron: 'geen' }
  // Een datum van nullen komt van een OMSI dat nog in het menu staat.
  if (!live || !(live.year > 0 && live.month > 0 && live.day > 0) || !Number.isFinite(live.time)) return { bron: 'geen' }
  const mem = live.mem?.ok === 1 ? live.mem : undefined
  const lijn = mem ? lijnSleutel(String(mem.lineName ?? '')) : ''
  let plekken = lijn ? kaartenMetLijn(lijn) : []
  /*
   * De plek van de lijn in OMSI's lijst (`mem.line`; de plugin haalt de naam
   * daar ook uit) onderscheidt de meeste gedeelde lijnen: lijn 109 staat op
   * HafenCity op plek 44, op HamburgLi20 op 41. Staat hij op die plek op geen
   * enkele kaart (een chrono kan de lijst verschuiven), dan gelden alle kaarten
   * met die naam.
   */
  const opPlek = typeof mem?.line === 'number' && mem.line >= 0 ? plekken.filter((p) => p.plek === mem.line) : []
  if (opPlek.length > 0) plekken = opPlek
  const kaarten = plekken.map((p) => p.folder.toLowerCase())
  let klopt: boolean | undefined
  if (kaarten.length > 0) {
    if (!kaarten.includes(folder)) klopt = false
    else if (kaarten.length === 1) klopt = true
    else if (rit && kaarten.includes(rit)) klopt = rit === folder
  } else if (rit) {
    klopt = rit === folder
  }
  if (klopt === undefined) return { bron: 'geen' }
  const twee = (n: number): string => String(Math.floor(n)).padStart(2, '0')
  return {
    bron: 'omsi',
    minuten: live.time / 60,
    datum: `${String(Math.floor(live.year)).padStart(4, '0')}-${twee(live.month)}-${twee(live.day)}`,
    kaartKlopt: klopt
  }
}
