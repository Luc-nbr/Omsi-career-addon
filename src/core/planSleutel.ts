import type { DienstSleutel, Dagrooster, DienstVanDag, KaartDag, OmloopSleutel, OmloopVanDag } from './planTypen'

/*
 * De pure sleutelhulpjes van de planning: sleutels maken en ontleden, een
 * omloop of dienst in een dagrooster opzoeken, en wat een dagmasker betekent.
 *
 * WAAROM EEN EIGEN BESTAND
 * Ze stonden in bedrijfsplan.ts, maar dat bestand trekt calendar.ts en
 * timetable.ts mee (node:path en node:fs). De rekenkern van de planning
 * (rooster, invulling, uitval) draait ook in het venster, en daar brak de
 * build op. Hier staat niets dat Node nodig heeft; bedrijfsplan.ts geeft alles
 * door, dus main en de proeven kunnen het daar blijven halen.
 */

const DAG_MS = 86_400_000

/** De datum van een bedrijfsdag op deze kaart, als UTC-middernacht. */
export function bedrijfsdatum(anker: string, dag: number): Date {
  const [j, m, d] = anker.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d) + (dag - 1) * DAG_MS)
}

/*
 * De sleutels. tourNumber staat achteraan omdat het vrije tekst is (er kan een
 * `|` in staan); ontleden gaat dus van links voor de omloop en van rechts voor
 * het deel.
 */
export function omloopSleutel(mapFolder: string, lineFile: string, days: number, tourNumber: string): OmloopSleutel {
  return `${mapFolder}|${lineFile}|${days}|${tourNumber}`
}

export function dienstSleutel(omloop: OmloopSleutel, deel: number): DienstSleutel {
  return `${omloop}|${deel}`
}

export function ontleedOmloop(s: string): { mapFolder: string; lineFile: string; days: number; tourNumber: string } | undefined {
  const a = s.indexOf('|')
  const b = a < 0 ? -1 : s.indexOf('|', a + 1)
  const c = b < 0 ? -1 : s.indexOf('|', b + 1)
  if (c < 0) return undefined
  const days = Number(s.slice(b + 1, c))
  if (!Number.isInteger(days)) return undefined
  return { mapFolder: s.slice(0, a), lineFile: s.slice(a + 1, b), days, tourNumber: s.slice(c + 1) }
}

export function ontleedDienst(s: string): { omloop: OmloopSleutel; deel: number } | undefined {
  const at = s.lastIndexOf('|')
  if (at < 0) return undefined
  const deel = Number(s.slice(at + 1))
  const omloop = s.slice(0, at)
  if (!Number.isInteger(deel) || deel < 1 || !ontleedOmloop(omloop)) return undefined
  return { omloop, deel }
}

export function zoekOmloop(r: Dagrooster, s: OmloopSleutel): { kaart: KaartDag; omloop: OmloopVanDag } | undefined {
  for (const kaart of r.kaarten) {
    const omloop = kaart.omlopen.find((o) => o.sleutel === s)
    if (omloop) return { kaart, omloop }
  }
  return undefined
}

export function zoekDienst(
  r: Dagrooster,
  s: DienstSleutel
): { kaart: KaartDag; omloop: OmloopVanDag; dienst: DienstVanDag } | undefined {
  const o = ontleedDienst(s)
  const z = o && zoekOmloop(r, o.omloop)
  const dienst = z?.omloop.diensten.find((d) => d.sleutel === s)
  return z && dienst ? { ...z, dienst } : undefined
}

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const

/** Waarvoor een dagmasker geldt, om het rooster per masker te kunnen tonen ("geldt voor ma–vr"). */
export function maskerDagen(days: number): {
  dagen: Array<(typeof DAGNAMEN)[number]>
  feestdag: boolean
  periode?: 'school' | 'break'
} {
  const school = (days & (1 << 8)) !== 0
  const vakantie = (days & (1 << 9)) !== 0
  return {
    dagen: DAGNAMEN.filter((_, i) => (days & (1 << i)) !== 0),
    feestdag: (days & (1 << 7)) !== 0,
    ...(school && !vakantie ? { periode: 'school' as const } : vakantie && !school ? { periode: 'break' as const } : {})
  }
}
