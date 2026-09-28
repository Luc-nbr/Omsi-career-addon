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
 * - staat hij op meer kaarten, dan beslist de rit in de app, als die op een
 *   van die kaarten is;
 * - zonder lijnnaam, of met een die op geen enkele kaart staat (de index is
 *   van voor er een kaart bijkwam), beslist alleen de rit in de app;
 * - weet niets het, dan `geen`: liever geen klok dan een verkeerde.
 */

/** Een lijnnaam zoals hij vergeleken wordt: zonder .ttl, zonder hoofdletters. */
export function lijnSleutel(naam: string): string {
  return naam.trim().replace(/\.ttl$/i, '').toLowerCase()
}

export interface KlokLive {
  time: number
  year: number
  month: number
  day: number
  mem?: { ok: number; lineName?: string }
}

export function bedrijfsklok(
  live: KlokLive | undefined,
  folder: string,
  /** De kaart van de dienst of vrije rit die in de app loopt. */
  ritKaart: string | undefined,
  kaartenMetLijn: (lijn: string) => string[]
): BedrijfKlokStand {
  // Een datum van nullen komt van een OMSI dat nog in het menu staat.
  if (!live || !(live.year > 0 && live.month > 0 && live.day > 0) || !Number.isFinite(live.time)) return { bron: 'geen' }
  const lijn = live.mem?.ok === 1 ? lijnSleutel(String(live.mem.lineName ?? '')) : ''
  let klopt: boolean | undefined
  const kaarten = lijn ? kaartenMetLijn(lijn) : []
  if (kaarten.length > 0) {
    if (!kaarten.includes(folder)) klopt = false
    else if (kaarten.length === 1) klopt = true
    else if (ritKaart && kaarten.includes(ritKaart)) klopt = ritKaart === folder
  } else if (ritKaart) {
    klopt = ritKaart === folder
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
