import type { Laag, LakProject } from '../../../../shared/lak'

/**
 * DE LAGEN: HANDELINGEN EN GESCHIEDENIS (lakstudio-ontwerp §4.10)
 *
 * Het project is onveranderlijke data. Elke handeling is een pure functie van
 * project naar project (hier, in node te toetsen), en de geschiedenis houdt 500
 * stappen terug. Een penseellaag is een lijst streken (vectoren): opnieuw
 * afspelen doet het lakdoek.
 */

export type Handeling =
  | { soort: 'voegToe'; laag: Laag; index?: number }
  | { soort: 'wijzig'; id: string; deel: Partial<Laag> }
  | { soort: 'weg'; id: string }
  | { soort: 'verplaats'; id: string; naar: number }
  | { soort: 'dupliceer'; id: string; nieuwId: string }
  | { soort: 'opties'; opties: Record<string, number> }
  | { soort: 'spiegel'; spiegel: LakProject['spiegel'] }
  | { soort: 'naam'; naam: string }
  | { soort: 'vervang'; lagen: Laag[] }
  /** Meer tegelijk, als één stap: Snelle lak (lagen en keuzes), een andere start (lagen, start, busopties). */
  | { soort: 'project'; deel: Partial<Pick<LakProject, 'lagen' | 'snel' | 'start' | 'opties' | 'spiegel'>> }

export const MAX_STAPPEN = 500

export interface Geschiedenis {
  verleden: LakProject[]
  heden: LakProject
  toekomst: LakProject[]
}

/** Eén handeling op een project; geeft een nieuw project (het oude blijft zoals het was). */
export function pasToe(p: LakProject, h: Handeling): LakProject {
  switch (h.soort) {
    case 'voegToe': {
      const lagen = [...p.lagen]
      lagen.splice(h.index ?? lagen.length, 0, h.laag)
      return { ...p, lagen }
    }
    case 'wijzig':
      return { ...p, lagen: p.lagen.map((l) => (l.id === h.id && !l.vergrendeld ? ({ ...l, ...h.deel, id: l.id, soort: l.soort } as Laag) : l)) }
    case 'weg':
      return { ...p, lagen: p.lagen.filter((l) => l.id !== h.id || l.vergrendeld) }
    case 'verplaats': {
      const van = p.lagen.findIndex((l) => l.id === h.id)
      if (van < 0) return p
      const lagen = [...p.lagen]
      const [laag] = lagen.splice(van, 1)
      lagen.splice(Math.max(0, Math.min(lagen.length, h.naar)), 0, laag)
      return { ...p, lagen }
    }
    case 'dupliceer': {
      const i = p.lagen.findIndex((l) => l.id === h.id)
      if (i < 0) return p
      const lagen = [...p.lagen]
      lagen.splice(i + 1, 0, { ...structuredClone(p.lagen[i]), id: h.nieuwId, naam: `${p.lagen[i].naam} (2)` })
      return { ...p, lagen }
    }
    case 'opties':
      return { ...p, opties: { ...h.opties } }
    case 'spiegel':
      return { ...p, spiegel: { ...h.spiegel } }
    case 'naam':
      return p.geplaatst ? p : { ...p, naam: h.naam }
    case 'vervang':
      return { ...p, lagen: [...h.lagen] }
    case 'project':
      return { ...p, ...h.deel }
  }
}

export function begin(p: LakProject): Geschiedenis {
  return { verleden: [], heden: p, toekomst: [] }
}

/** Doen: de nieuwe stand wordt het heden, de toekomst vervalt, hooguit 500 stappen terug. */
export function doe(g: Geschiedenis, h: Handeling): Geschiedenis {
  const nieuw = pasToe(g.heden, h)
  if (nieuw === g.heden) return g
  const verleden = [...g.verleden, g.heden]
  if (verleden.length > MAX_STAPPEN) verleden.splice(0, verleden.length - MAX_STAPPEN)
  return { verleden, heden: nieuw, toekomst: [] }
}

export function ongedaan(g: Geschiedenis): Geschiedenis {
  if (g.verleden.length === 0) return g
  const verleden = [...g.verleden]
  const vorige = verleden.pop()!
  return { verleden, heden: vorige, toekomst: [g.heden, ...g.toekomst] }
}

export function opnieuw(g: Geschiedenis): Geschiedenis {
  if (g.toekomst.length === 0) return g
  const [volgende, ...toekomst] = g.toekomst
  return { verleden: [...g.verleden, g.heden], heden: volgende, toekomst }
}
