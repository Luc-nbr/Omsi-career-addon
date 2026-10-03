import { reeks } from '../core/bedrijf'
import type { KaartOmloop, KaartRit, LijnPlan, OmloopSleutel } from '../core/planTypen'
import { pointAlong, trackAlong, type Punt, type Track } from './spoor'

/*
 * De vloot op de klok: waar elke bus van het bedrijf staat op een tijdstip van
 * de bedrijfsdag, volgens het lijnplan (core/lijnplan.ts).
 *
 * Alleen de dienstregeling en een geschatte vertraging; gemeten wordt er
 * niets, behalve jouw eigen bus als je zelf rijdt (dat doet de kaart zelf met
 * `liveStatus`). Puur en zonder venster, zodat de proef (scripts/probe-
 * lijnplan.ts) duizenden klokstanden kan narekenen.
 *
 * Ontwerp: design/ontwerpen/busbedrijf-planning.md §8.1.
 */

export type { Track } from './spoor'

/** Een rit zonder route en zonder twee haltes op de kaart heeft geen spoor. */
export function maakSporen(plan: LijnPlan, stops: Map<string, { x: number; y: number }>): Map<string, Track> {
  const sporen = new Map<string, Track>()
  for (const omloop of plan.omlopen) {
    for (const rit of omloop.ritten) {
      if (sporen.has(rit.route)) continue
      const haltes: Array<Punt | undefined> = rit.stopIds.map((id) => stops.get(id))
      const route = plan.routes[rit.route]
      if (route && route.length >= 4) {
        sporen.set(rit.route, trackAlong(route, haltes))
        continue
      }
      /*
       * Geen route gevonden: recht van halte naar halte. Zo rijdt de bus toch
       * in de goede richting tussen de goede haltes, ook al volgt hij de straat
       * niet.
       */
      const bekend = haltes.filter((h): h is Punt => h !== undefined)
      if (bekend.length < 2) continue
      sporen.set(
        rit.route,
        trackAlong(
          bekend.flatMap((h) => [h.x, h.y]),
          haltes
        )
      )
    }
  }
  return sporen
}

export interface VlootPlek {
  omloop: OmloopSleutel
  staat: 'remise' | 'rit' | 'pauze' | 'leeg' | 'klaar' | 'wacht'
  /** De rit die rijdt, of de eerstvolgende (in de remise en in een pauze), of de laatste (klaar). */
  ritIndex: number
  /** In kaartmeters; NaN als geen enkele halte van de omloop op de kaart staat. */
  x: number
  y: number
  /** Koers in graden, noord nul, met de klok mee. */
  koers: number
  volgendeHalte?: string
  /** Wanneer de bus daar is, met de vertraging erbij. */
  volgendeTijd?: number
}

function eind(rit: KaartRit): number {
  return rit.tijden.length > 0 ? rit.tijden[rit.tijden.length - 1] : rit.vertrek
}

function koersVan(dx: number, dy: number, anders = 0): number {
  if (dx === 0 && dy === 0) return anders
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

/** Plek en koers op een rit bij een tijd; `t` buiten de rit valt op begin of einde. */
function opRit(
  rit: KaartRit,
  spoor: Track | undefined,
  stops: Map<string, { x: number; y: number }>,
  t: number
): { x: number; y: number; koers: number } | undefined {
  if (spoor && spoor.cumulative.length >= 2) {
    // De haltes die op het spoor liggen, met hun tijd.
    let vorige: { t: number; a: number } | undefined
    let volgende: { t: number; a: number } | undefined
    for (let k = 0; k < rit.stopIds.length; k++) {
      const a = spoor.stops[k]
      const tk = rit.tijden[k]
      if (a === undefined || tk === undefined) continue
      if (tk <= t) vorige = { t: tk, a }
      else {
        volgende = { t: tk, a }
        break
      }
    }
    let along: number
    if (!vorige && !volgende) {
      // Geen enkele halte op het spoor gevonden: dan naar de tijd over de hele route.
      const lengte = spoor.cumulative[spoor.cumulative.length - 1]
      const duur = eind(rit) - rit.vertrek
      along = duur > 0 ? lengte * Math.min(1, Math.max(0, (t - rit.vertrek) / duur)) : t > rit.vertrek ? lengte : 0
    } else if (!vorige) along = volgende?.a ?? 0
    else if (!volgende) along = vorige.a
    else {
      const f = volgende.t > vorige.t ? (t - vorige.t) / (volgende.t - vorige.t) : 1
      along = vorige.a + Math.min(1, Math.max(0, f)) * (volgende.a - vorige.a)
    }
    const p = pointAlong(spoor, along)
    return { x: p.x, y: p.y, koers: koersVan(p.dx, p.dy) }
  }
  // Zonder spoor: de bekende haltes, en daartussen recht.
  let vorige: { t: number; p: { x: number; y: number } } | undefined
  let volgende: { t: number; p: { x: number; y: number } } | undefined
  for (let k = 0; k < rit.stopIds.length; k++) {
    const p = stops.get(rit.stopIds[k])
    const tk = rit.tijden[k]
    if (!p || tk === undefined) continue
    if (tk <= t) vorige = { t: tk, p }
    else {
      volgende = { t: tk, p }
      break
    }
  }
  if (!vorige && !volgende) return undefined
  if (!vorige) return { ...volgende!.p, koers: 0 }
  if (!volgende) return { ...vorige.p, koers: 0 }
  const f = volgende.t > vorige.t ? Math.min(1, Math.max(0, (t - vorige.t) / (volgende.t - vorige.t))) : 1
  const dx = volgende.p.x - vorige.p.x
  const dy = volgende.p.y - vorige.p.y
  return { x: vorige.p.x + dx * f, y: vorige.p.y + dy * f, koers: koersVan(dx, dy) }
}

type Stand = { x: number; y: number; koers: number } | undefined

/** Waar een rit begint en eindigt, met de koers daar. */
function beginVan(rit: KaartRit, sporen: Map<string, Track>, stops: Map<string, { x: number; y: number }>): Stand {
  return opRit(rit, sporen.get(rit.route), stops, -Infinity)
}
function eindeVan(rit: KaartRit, sporen: Map<string, Track>, stops: Map<string, { x: number; y: number }>): Stand {
  return opRit(rit, sporen.get(rit.route), stops, Infinity)
}

/**
 * Waar de bus van een omloop is op de klok.
 *
 * `vertraging` (minuten) schuift de hele omloop op: de bus is waar het plan
 * hem `vertraging` minuten eerder had. `wachtTot`: een chauffeur die te laat
 * is en die niemand vervangt; tot dan wacht de bus aan het begin van de rit
 * die hij nu had moeten rijden.
 */
export function plekOpKlok(
  o: KaartOmloop,
  sporen: Map<string, Track>,
  stops: Map<string, { x: number; y: number }>,
  klok: number,
  vertraging?: number,
  wachtTot?: number
): VlootPlek {
  const ritten = o.ritten
  const leeg: VlootPlek = { omloop: o.sleutel, staat: 'remise', ritIndex: 0, x: NaN, y: NaN, koers: 0 }
  if (ritten.length === 0) return leeg
  const d = vertraging ?? 0
  const t = klok - d

  if (wachtTot !== undefined && klok < wachtTot) {
    let i = ritten.findIndex((r) => eind(r) > klok)
    if (i < 0) i = ritten.length - 1
    const p = beginVan(ritten[i], sporen, stops)
    return {
      omloop: o.sleutel,
      staat: 'wacht',
      ritIndex: i,
      x: p?.x ?? NaN,
      y: p?.y ?? NaN,
      koers: p?.koers ?? 0,
      volgendeHalte: ritten[i].stopIds[0],
      volgendeTijd: Math.max(wachtTot, ritten[i].vertrek)
    }
  }

  if (t < ritten[0].vertrek) {
    const p = beginVan(ritten[0], sporen, stops)
    return {
      ...leeg,
      x: p?.x ?? NaN,
      y: p?.y ?? NaN,
      koers: p?.koers ?? 0,
      volgendeHalte: ritten[0].stopIds[0],
      volgendeTijd: ritten[0].vertrek + d
    }
  }

  for (let i = 0; i < ritten.length; i++) {
    const rit = ritten[i]
    if (t >= rit.vertrek && t <= eind(rit)) {
      const p = opRit(rit, sporen.get(rit.route), stops, t)
      // De eerstvolgende halte: de eerste met een tijd na nu.
      let k = rit.tijden.findIndex((tk) => tk > t)
      if (k < 0) k = rit.stopIds.length - 1
      return {
        omloop: o.sleutel,
        staat: rit.leeg ? 'leeg' : 'rit',
        ritIndex: i,
        x: p?.x ?? NaN,
        y: p?.y ?? NaN,
        koers: p?.koers ?? 0,
        volgendeHalte: rit.stopIds[k],
        volgendeTijd: (rit.tijden[k] ?? eind(rit)) + d
      }
    }
    const volgende = ritten[i + 1]
    if (volgende && t > eind(rit) && t < volgende.vertrek) {
      const p = eindeVan(rit, sporen, stops)
      return {
        omloop: o.sleutel,
        staat: 'pauze',
        ritIndex: i + 1,
        x: p?.x ?? NaN,
        y: p?.y ?? NaN,
        koers: p?.koers ?? 0,
        volgendeHalte: volgende.stopIds[0],
        volgendeTijd: volgende.vertrek + d
      }
    }
  }

  const laatste = ritten[ritten.length - 1]
  const p = eindeVan(laatste, sporen, stops)
  return { omloop: o.sleutel, staat: 'klaar', ritIndex: ritten.length - 1, x: p?.x ?? NaN, y: p?.y ?? NaN, koers: p?.koers ?? 0 }
}

/** FNV-1a: een vast getal uit een tekst, als zaad voor `reeks`. */
function zaadVan(tekst: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Hoeveel minuten een bus achterloopt op een rit: −1 tot 8, elke keer gelijk
 * voor dezelfde dag, omloop en rit. Een chauffeur met weinig ervaring (onder
 * 50) en een bus in matige staat (onder 80) lopen verder uit. Alleen voor de
 * weergave: niets wordt hiermee afgerekend.
 */
export function vertragingVan(dag: number, omloop: OmloopSleutel, rit: number, ervaring?: number, staat?: number): number {
  const r = reeks(zaadVan(`${dag}|${omloop}|${rit}`))
  // Meestal een beetje, soms meer: het kwadraat houdt de meeste ritten dicht bij op tijd.
  let minuten = -1 + r() ** 2 * 5
  if (ervaring !== undefined && ervaring < 50) minuten += r() * 2 * ((50 - Math.max(0, ervaring)) / 50)
  if (staat !== undefined && staat < 80) minuten += r() * 2 * ((80 - Math.max(0, staat)) / 80)
  return Math.round(Math.min(8, Math.max(-1, minuten)))
}

/** `jjjj-mm-dd` plus of min een aantal dagen. */
function dagErbij(iso: string, dagen: number): string {
  const [j, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d) + dagen * 86_400_000).toISOString().slice(0, 10)
}

/**
 * De klok van OMSI als bedrijfsklok, of niets als OMSI een andere dag speelt.
 *
 * Een bedrijfsdag loopt over middernacht heen (lijn 109: van −15 tot 1506): om
 * 00:30 de volgende ochtend is het nog dezelfde dag, en om 23:45 de avond
 * ervoor begint hij al.
 */
export function klokUitOmsi(
  minuten: number,
  omsiDatum: string,
  bedrijfsdatum: string,
  plan: { van: number; tot: number }
): number | undefined {
  if (omsiDatum === bedrijfsdatum) return minuten
  if (omsiDatum === dagErbij(bedrijfsdatum, 1) && minuten + 1440 <= plan.tot) return minuten + 1440
  if (omsiDatum === dagErbij(bedrijfsdatum, -1) && minuten - 1440 >= plan.van) return minuten - 1440
  return undefined
}
