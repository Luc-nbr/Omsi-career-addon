import { REGELS, dagresultaat, niveauVan, opleidingKlaar, type Bedrijf, type Concessie } from './bedrijf'
import type { BusWie, Wie } from './planTypen'

/*
 * Wat de planning kost en oplevert (ontwerp §2.2).
 *
 * De opdrachtgever betaalt per gereden dienstregelingsuur (rituur) van die dag.
 * Een chauffeur van de onderaannemer of het uitzendbureau kost per werkuur
 * (diensttijd, met de korte ritten en pauzes erbij); een bus per rituur. Per
 * rituur kwam een eigen chauffeur onder zijn loon uit; per werkuur verdient
 * hij zich op de lange diensten terug.
 *
 * Alles in hele centen, met `Math.round` op elk bedrag. De getallen staan in
 * `REGELS.planning` (bedrijf.ts).
 */
export const TARIEF = REGELS.planning

type Factoren = { vergoeding: number; inhuur: number }

export function vergoedingPerRituur(reputatie: number): number {
  return Math.round(TARIEF.vergoedingPerRituur * (1 + (reputatie - 50) / 500))
}

export function vergoeding(rituren: number, reputatie: number, f: Pick<Factoren, 'vergoeding'>): number {
  return Math.round(rituren * TARIEF.vergoedingPerRituur * (1 + (reputatie - 50) / 500) * f.vergoeding)
}

const spoed = (toeslag?: boolean): number => (toeslag ? 1 + TARIEF.spoedToeslag : 1)

/** Wat een chauffeur deze minuten kost: eigen, collega en liggen niets (het loon staat apart). */
export function chauffeurKosten(wie: Wie['soort'], werkMinuten: number, f: Pick<Factoren, 'inhuur'>, toeslag?: boolean): number {
  if (werkMinuten <= 0) return 0
  if (wie === 'onderaannemer') return Math.round((werkMinuten / 60) * TARIEF.onderChauffeurPerWerkuur * f.inhuur)
  if (wie === 'uitzend') {
    return Math.round((TARIEF.uitzendVast + (werkMinuten / 60) * TARIEF.uitzendPerWerkuur) * f.inhuur * spoed(toeslag))
  }
  return 0
}

export function busKosten(wie: BusWie['soort'], rituren: number, f: Pick<Factoren, 'inhuur'>, toeslag?: boolean): number {
  if (rituren <= 0) return 0
  if (wie === 'onderaannemer') return Math.round(rituren * TARIEF.onderBusPerRituur * f.inhuur)
  if (wie === 'huur') return Math.round((TARIEF.huurbusVast + rituren * TARIEF.huurbusPerRituur) * f.inhuur * spoed(toeslag))
  if (wie === 'eigen') return Math.round(rituren * TARIEF.eigenBusPerRituur)
  return 0
}

export function boete(rituren: number): number {
  return Math.round(rituren * TARIEF.boetePerRituur)
}

export function reputatieVerlies(uitgevallenRituren: number): number {
  return Math.min(TARIEF.uitvalReputatieMax, Math.floor(uitgevallenRituren / TARIEF.uitvalUrenPerReputatie))
}

/** Overuren: per minuut boven de dagdoelstelling, tegen anderhalf keer het uurloon (dagloon / 8). */
export function overurenKosten(loon: number, minutenBoven480: number): number {
  if (minutenBoven480 <= 0) return 0
  return Math.round((minutenBoven480 / 60) * (loon / 8) * TARIEF.overurenFactor)
}

/** Zoveel uitzendkrachten per dag: meer naarmate het bedrijf groeit. */
export function uitzendMax(b: Bedrijf): number {
  return 1 + Math.floor(niveauVan(b) / 2)
}

/** De spoedtoeslag van de centrale vervalt na de opleiding Planner. */
export function toeslagGeldt(b: Bedrijf): boolean {
  return !opleidingKlaar(b, 'planner')
}

/** Wat een eigen chauffeur op deze dienst bespaart tegenover de onderaannemer. */
export function besparingChauffeur(werkMinuten: number, f: Pick<Factoren, 'inhuur'>): number {
  return chauffeurKosten('onderaannemer', werkMinuten, f)
}

/** Wat een eigen bus op deze rituren bespaart: de bus van de onderaannemer min de eigen kosten. */
export function besparingBus(rituren: number, f: Pick<Factoren, 'inhuur'>): number {
  return busKosten('onderaannemer', rituren, f) - busKosten('eigen', rituren, f)
}

/**
 * Een concessie zonder plan (de kaart ontbreekt): het weekgemiddelde alsof
 * alles uitbesteed is, of zonder week de oude rekensom.
 */
export function terugvalVanConcessie(
  c: Concessie,
  reputatie: number,
  f: Factoren
): { vergoeding: number; onderaannemer: number; rituren: number } {
  if (c.week) {
    return {
      vergoeding: vergoeding(c.week.gemRituren, reputatie, f),
      onderaannemer: Math.round(
        (c.week.gemWerkuren * TARIEF.onderChauffeurPerWerkuur + c.week.gemRituren * TARIEF.onderBusPerRituur) * f.inhuur
      ),
      rituren: c.week.gemRituren
    }
  }
  const oud = dagresultaat(c, reputatie, f)
  return { vergoeding: oud.vergoeding, onderaannemer: oud.kosten, rituren: c.urenPerDag }
}
