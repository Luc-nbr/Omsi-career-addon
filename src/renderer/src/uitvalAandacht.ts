import type { Bedrijf } from '../../core/bedrijf'
import type { BusKeuze, DagPlan, InvulKeuze } from '../../core/planTypen'
import { dienstNaam, gevolgenVan, verliesVan, type UitvalGevolg, type UitvalPlek } from '../../core/uitval'
import { formatMoney, formatTime } from '../../shared/format'
import { DEFAULT_LANGUAGE, t, type Language } from '../../shared/i18n'
import type { Focus, Tab } from './BedrijfDelen'

/*
 * De zinnen bij de uitval van vanochtend, los van React: de meldingen, het
 * ochtendvenster en de aandachtlijst van het dashboard gebruiken dezelfde.
 */

const geld = (centen: number, taal: Language): string => formatMoney(centen / 100, taal)

function naamVan(b: Bedrijf, id: number | undefined): string {
  return (b.personeel ?? []).find((m) => m.id === id)?.naam ?? `#${id ?? '?'}`
}

/** Waar de [Invullen]-knop heen gaat: de planning, met die dienst of omloop in beeld. */
export function focusVan(b: Bedrijf, plek: UitvalPlek): Focus {
  return plek.soort === 'omloop'
    ? { dag: b.dag, omloop: plek.omloop.omloop.sleutel }
    : { dag: b.dag, dienst: plek.dienst.dienst.sleutel, omloop: plek.omloop.omloop.sleutel }
}

/** De hoofdzin van een uitval: wie of wat, en welk stuk van het plan open staat. */
export function uitvalZin(taal: Language, b: Bedrijf, g: UitvalGevolg, plek?: UitvalPlek, planBekend = true): string {
  const u = g.uitval
  const p = plek ?? g.plekken[0]
  // Zonder plan (nog aan het laden) weten we niet wat hij raakt: dan alleen wie of wat.
  if (!p && !planBekend) {
    if (u.soort === 'pech') return t(taal, 'bd.uitval.pechKaal', { bus: u.bus ?? '?' })
    const naam = naamVan(b, u.medewerker)
    return u.soort === 'ziek' ? t(taal, 'bd.uitval.ziekKaal', { naam }) : t(taal, 'bd.uitval.telaatKaal', { naam, min: u.minuten ?? 0 })
  }
  if (u.soort === 'pech') {
    if (!p) return t(taal, 'bd.uitval.pechVrij', { bus: u.bus ?? '?' })
    return t(taal, 'bd.uitval.pech', { bus: u.bus ?? '?', omloop: p.omloop.omloop.tourNumber })
  }
  const naam = naamVan(b, u.medewerker)
  if (!p || p.soort === 'omloop') {
    return u.soort === 'ziek'
      ? t(taal, 'bd.uitval.ziekVrij', { naam })
      : t(taal, 'bd.uitval.telaatVrij', { naam, min: u.minuten ?? 0 })
  }
  const tijden = { van: formatTime(p.van), tot: formatTime(p.tot), dienst: dienstNaam(p.omloop.omloop, p.dienst.dienst) }
  if (u.soort === 'ziek') return t(taal, 'bd.uitval.ziek', { naam, ...tijden })
  return t(taal, p.soort === 'dienst' ? 'bd.uitval.telaatHeel' : 'bd.uitval.telaat', { naam, min: u.minuten ?? 0, ...tijden })
}

/** Wie een plek vult, in een paar woorden ("uitzendkracht", "Anna valt in", "bus 107"). */
export function wieTekst(taal: Language, b: Bedrijf, plek: UitvalPlek): string {
  if (plek.soort === 'omloop') {
    const wie = plek.stand.wie
    if (wie.soort === 'eigen') return t(taal, 'bd.uitval.wie.eigenBus', { bus: wie.nummer })
    if (wie.soort === 'huur') return t(taal, 'bd.uitval.wie.huur')
    if (wie.soort === 'onderaannemer') return t(taal, 'bd.uitval.wie.onder')
    return t(taal, 'bd.uitval.wie.liggen')
  }
  const wie = plek.stand.wie
  if (wie.soort === 'collega') return t(taal, 'bd.uitval.wie.collega', { naam: naamVan(b, wie.id) })
  if (wie.soort === 'eigen') return t(taal, 'bd.uitval.wie.eigen', { naam: naamVan(b, wie.id) })
  if (wie.soort === 'uitzend') return t(taal, 'bd.uitval.wie.uitzend')
  if (wie.soort === 'onderaannemer') return t(taal, 'bd.uitval.wie.onder')
  return t(taal, 'bd.uitval.wie.liggen')
}

/** De tekst van een keuze uit `invulOpties` (deel C), voor een knop. */
export function keuzeTekst(taal: Language, b: Bedrijf, keuze: InvulKeuze | BusKeuze): string {
  switch (keuze.soort) {
    case 'collega':
      return t(taal, 'bd.uitval.wie.collega', { naam: naamVan(b, keuze.id) })
    case 'uitzend':
      return t(taal, 'bd.uitval.wie.uitzend')
    case 'onderaannemer':
      return t(taal, 'bd.uitval.wie.onder')
    case 'eigen':
      return t(taal, 'bd.uitval.wie.eigenBus', { bus: keuze.nummer })
    case 'huur':
      return t(taal, 'bd.uitval.wie.huur')
    default:
      return t(taal, 'bd.uitval.wie.liggen')
  }
}

/**
 * Hoe het met een plek staat: "Geregeld: bus 107" als jij het deed, "Doe je
 * niets, dan regelt de centrale het: uitzendkracht (€ 534)" als de centrale
 * hem vult, en niets zolang het plan er (nog) niets over zegt.
 */
export function standZin(taal: Language, b: Bedrijf, plek: UitvalPlek): { tekst: string; toon: 'goed' | 'let' | 'laat' } | undefined {
  const s = plek.stand
  if (s.bron === 'hand') return { tekst: t(taal, 'bd.uitval.geregeld', { wat: wieTekst(taal, b, plek) }), toon: s.wie.soort === 'liggen' ? 'laat' : 'goed' }
  if (s.bron !== 'centrale') return undefined
  if (s.wie.soort === 'liggen') {
    return { tekst: t(taal, 'bd.uitval.centraleLiggen', { geld: `−${geld(verliesVan(b, plek.rituren), taal)}` }), toon: 'laat' }
  }
  const bedrag = `${geld(s.kosten, taal)}${s.toeslag ? `, ${t(taal, 'bd.uitval.spoed')}` : ''}`
  return { tekst: t(taal, 'bd.uitval.centrale', { wat: wieTekst(taal, b, plek), geld: bedrag }), toon: 'let' }
}

/** "woensdag 27 april 2016": de bedrijfsdatum, met het jaar erbij. */
export function datumTekst(iso: string | undefined, taal: Language): string | undefined {
  if (!iso) return undefined
  const datum = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(datum.getTime())) return iso
  const locale = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }[taal] ?? 'en-GB'
  return datum.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Items voor de aandachtlijst van het dashboard (deel A): per uitval die nog
 * iets van je vraagt een regel, met de dienst of omloop in beeld in de
 * planning. Wat je zelf al regelde, en uitval van wie vandaag niet ingedeeld
 * stond, komt er niet in.
 *
 * `taal` is een aanvulling op het contract (§9.2): zonder taal kan een
 * module buiten React de tekst niet vertalen.
 */
export function aandachtUitval(
  b: Bedrijf,
  plan: DagPlan | undefined,
  taal: Language = DEFAULT_LANGUAGE
): Array<{ soort: 'laat' | 'let'; tekst: string; tab: Tab; focus?: Focus }> {
  const uit: Array<{ soort: 'laat' | 'let'; tekst: string; tab: Tab; focus?: Focus }> = []
  for (const g of gevolgenVan(b, plan)) {
    const u = g.uitval
    for (const p of g.plekken) {
      if (p.stand.bron === 'hand') continue
      const soort = p.stand.wie.soort === 'liggen' || u.soort === 'pech' ? 'laat' : 'let'
      const tekst =
        p.soort === 'omloop'
          ? t(taal, 'bd.uitval.kort.pech', { bus: u.bus ?? '?', omloop: p.omloop.omloop.tourNumber })
          : t(taal, u.soort === 'ziek' ? 'bd.uitval.kort.ziek' : 'bd.uitval.kort.telaat', {
              naam: naamVan(b, u.medewerker),
              min: u.minuten ?? 0,
              dienst: dienstNaam(p.omloop.omloop, p.dienst.dienst)
            })
      uit.push({ soort, tekst, tab: 'planning', focus: focusVan(b, p) })
    }
  }
  return uit
}
