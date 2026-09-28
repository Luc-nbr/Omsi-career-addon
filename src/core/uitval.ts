import type { Bedrijf } from './bedrijf'
import type { Dagrooster, Uitval, Vandaag } from './planTypen'

/*
 * Uitval: wie er vanochtend ziek is, te laat komt, en welke bus niet start.
 *
 * DEEL 0: DIT IS DE STUB. Deel B (design/ontwerpen/busbedrijf-planning.md §5)
 * trekt de uitval met een vaste reeks per dag en meldt hem in de post. De stub
 * zet een lege `vandaag` neer, zodat de rest er al mee kan werken.
 */

/** Een lege `vandaag` voor deze dag. */
export function legeVandaag(dag: number): Vandaag {
  return { dag, uitval: [], invulling: {}, stukInvulling: {}, busInvulling: {}, gereden: {} }
}

export function uitvalVoorDag(b: Bedrijf, _dagen: Dagrooster[]): Bedrijf {
  const vandaag = b.vandaag?.dag === b.dag ? b.vandaag : legeVandaag(b.dag)
  return { ...b, vandaag: { ...vandaag, uitval: [] } }
}

export function meldUitval(b: Bedrijf, _dagen: Dagrooster[]): Bedrijf {
  return b
}

/** De uitval van vandaag; leeg als `vandaag` van een andere dag is. */
export function uitvalVan(b: Bedrijf): Uitval[] {
  return b.vandaag?.dag === b.dag ? b.vandaag.uitval : []
}
