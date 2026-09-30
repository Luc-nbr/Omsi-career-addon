import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readOmsiLines } from './omsiFile'
import { leesKleurstellingen, zoekKleurstelling } from './kleurstelling'
import { startwaardenVan } from './schermvorm'
import { leesRustProgramma, rekenRust } from './oscrust'
import { MOTORSTANDAARD, rustRegels, type Bus3dPakKop, type RustDeel, type RustVermelding } from '../shared/bus3d'

/**
 * DE RUSTSTAND VAN EEN BUS, ZONDER OSC-MACHINE (bus3d-ontwerp §5.2, F2)
 *
 * OMSI zet een bus die stilstaat zo neer: eerst de standaardwaarden van de motor,
 * dan `{init}` van alle scripts, dan het `[vars]`-blok uit de situatie (bij ons
 * precies `kleurVars`: de CTC-index plus de setvars), en dan `{frame}`. Wat daar
 * uitkomt beslist welke meshes er te zien zijn (`[visible]`, 54% van de
 * buitendriehoeken), welk `[matl_item]` een `[matl_change]` kiest, en hoe
 * doorzichtig een materiaal met `[alphascale]` is.
 *
 * De scripts helemaal draaien komt in F3 (`core/osc.ts`). Sinds de tegenlezing
 * van F2 rekent een kleine rekenmachine (`core/oscrust.ts`) `{init}` en
 * `{frame}` al door voor zover de uitkomst ZEKER is; wat onzeker blijft, valt
 * terug op de REGELS van `rustRegels` (shared/bus3d.ts), met hier de invoer erbij:
 * - per deel de `kleurVars` van de kleurstelling (een aanhanger zonder die
 *   kleurstelling houdt zijn eigen: niets, zoals `aanhangerVan` in main);
 * - de gewone uitvoering van het model (`typischVan`): wat de kleurstelling niet
 *   zet maar de meeste kleurstellingen wel (de wielen van de O560);
 * - de startwaarden uit de scripts (`startwaardenVan`, core/schermvorm.ts);
 * - de variabelen die een script via een curve uit Envir_Brightness zet
 *   (`(L.L.Envir_Brightness) (F.L.<curve>) (S.L.<var>)`), uitgerekend bij
 *   daglicht: het glas van de Kajosoft-bussen (`Szyby`, cockpit.osc:4641, met de
 *   curve 0 -> 0,45, 1 -> 1 in cockpit_constfile.txt:197-205).
 *
 * Geen Electron: dit draait in de werker `'bus3d'`.
 */

/** Wat de .bus over scripts en constanten zegt: paden ten opzichte van de voertuigmap. */
export function busLijsten(busPad: string): { scripts: string[]; constfiles: string[] } {
  const uit = { scripts: [] as string[], constfiles: [] as string[] }
  let regels: string[]
  try {
    regels = readOmsiLines(busPad)
  } catch {
    return uit
  }
  const map = dirname(busPad)
  const pad = (rel: string): string => join(map, ...rel.split(/[\\/]+/).filter(Boolean))
  regels.forEach((regel, i) => {
    const kop = regel.trimEnd()
    const doel = kop === '[script]' ? uit.scripts : kop === '[constfile]' ? uit.constfiles : undefined
    if (!doel) return
    const aantal = Number.parseInt((regels[i + 1] ?? '').trim(), 10)
    for (let k = 0; k < (Number.isFinite(aantal) ? Math.min(aantal, 1000) : 0); k++) {
      const rel = (regels[i + 2 + k] ?? '').trim()
      if (rel) doel.push(pad(rel))
    }
  })
  return uit
}

/** De curves uit de constfiles: naam (klein) -> punten (x, y), in volgorde. */
function leesCurves(constfiles: string[]): Map<string, Array<[number, number]>> {
  const curves = new Map<string, Array<[number, number]>>()
  for (const bestand of constfiles) {
    let regels: string[]
    try {
      regels = readOmsiLines(bestand)
    } catch {
      continue
    }
    let huidig: Array<[number, number]> | undefined
    for (let i = 0; i < regels.length; i++) {
      const kop = regels[i].trimEnd()
      if (kop === '[newcurve]') {
        const naam = (regels[i + 1] ?? '').trim().toLowerCase()
        huidig = []
        // Een tweede curve met dezelfde naam: de eerste telt, zoals bij [const].
        if (naam && !curves.has(naam)) curves.set(naam, huidig)
        i++
      } else if (kop === '[pnt]' && huidig) {
        const x = Number((regels[i + 1] ?? '').trim())
        const y = Number((regels[i + 2] ?? '').trim())
        if (Number.isFinite(x) && Number.isFinite(y)) huidig.push([x, y])
        i += 2
      } else if (kop.startsWith('[') && kop.endsWith(']')) huidig = undefined
    }
  }
  return curves
}

/** Een curve uitrekenen zoals OMSI: lineair tussen de punten, buiten de uiteinden vlak. */
export function curveWaarde(punten: Array<[number, number]>, x: number): number | undefined {
  if (punten.length === 0) return undefined
  const p = [...punten].sort((a, b) => a[0] - b[0])
  if (x <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const [x0, y0] = p[i - 1]
      const [x1, y1] = p[i]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return p[p.length - 1][1]
}

/**
 * Welke variabelen de scripts als `(L.L.Envir_Brightness) (F.L.<curve>)
 * (S.L.<var>)` zetten, uitgerekend bij Envir_Brightness = 1 (§5.2).
 */
function daglichtVan(scripts: string[], curves: Map<string, Array<[number, number]>>): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const bestand of scripts) {
    let tekst: string
    try {
      tekst = readFileSync(bestand, 'latin1')
    } catch {
      continue
    }
    // Commentaar begint met een apostrof.
    const woorden = tekst.replace(/'[^\r\n]*/g, ' ').toLowerCase().split(/\s+/)
    for (let i = 0; i + 2 < woorden.length; i++) {
      if (woorden[i] !== '(l.l.envir_brightness)') continue
      const curve = /^\(f\.l\.([^)]+)\)$/.exec(woorden[i + 1])
      const doel = /^\(s\.l\.([^)]+)\)$/.exec(woorden[i + 2])
      if (!curve || !doel) continue
      const w = curveWaarde(curves.get(curve[1]) ?? [], 1)
      if (w !== undefined && uit[doel[1]] === undefined) uit[doel[1]] = w
    }
  }
  return uit
}

/** Per .bus: wat de scripts bij daglicht zetten; onthouden zolang de .bus niet verandert. */
const daglichtGeheugen = new Map<string, { stempel: string; daglicht: Record<string, number> }>()

function daglichtVoorBus(busPad: string): Record<string, number> {
  let stempel = '-'
  try {
    const st = statSync(busPad)
    stempel = `${st.size}|${st.mtimeMs}`
  } catch {
    return {}
  }
  const sleutel = busPad.toLowerCase()
  const bekend = daglichtGeheugen.get(sleutel)
  if (bekend && bekend.stempel === stempel) return bekend.daglicht
  const { scripts, constfiles } = busLijsten(busPad)
  const daglicht = daglichtVan(scripts, leesCurves(constfiles))
  if (daglichtGeheugen.size >= 64) daglichtGeheugen.clear()
  daglichtGeheugen.set(sleutel, { stempel, daglicht })
  return daglicht
}

/** Kleine letters, voor de regels. */
function klein(r: Record<string, number>): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const [k, w] of Object.entries(r)) if (uit[k.toLowerCase()] === undefined) uit[k.toLowerCase()] = w
  return uit
}

export interface RustInvoerDeel {
  /** Het volledige pad van de .bus van dit deel. */
  busPad: string
  /** Het volledige pad van de model.cfg van dit deel. */
  modelcfg: string
}

/**
 * De ruststand voor een pakket en een kleurstelling (`undefined` = Standaard:
 * dan zet de app niets, en de regels ook niet).
 */
export function busRust(
  kop: Bus3dPakKop,
  delen: RustInvoerDeel[],
  kleurstelling: string | undefined
): ReturnType<typeof rustRegels> & { vars: Array<[string, number]>; bron: 'script' | 'regels' } {
  const vermeldingen: RustVermelding[] = kop.vermeldingen.map((v) => ({
    deel: kop.stukken[v.stuk]?.deel ?? 0,
    zicht: v.zicht,
    materialen: v.materialen
  }))
  // Alle namen waar de regels naar kunnen vragen, ook de aliassen.
  const namenPerDeel = delen.map(() => new Set<string>())
  for (const v of vermeldingen) {
    const namen = namenPerDeel[v.deel] ?? namenPerDeel[0]
    const erbij = (naam: string): void => {
      namen.add(naam)
      if (/^vis_/i.test(naam)) {
        namen.add(`vis_CTI_${naam.slice(4)}`)
        namen.add(`vis_SV_${naam.slice(4)}`)
      }
    }
    for (const [naam] of v.zicht) erbij(naam)
    for (const m of v.materialen) {
      if (m?.wissel) erbij(m.wissel.variabele)
      if (m?.alfaSchaal) erbij(m.alfaSchaal)
    }
  }
  let vars: Array<[string, number]> = []
  const rustDelen: RustDeel[] = delen.map((deel, d) => {
    let kleurVars: Array<[string, number]> = []
    const info = deel.modelcfg ? leesKleurstellingen(deel.modelcfg, dirname(deel.busPad)) : undefined
    const gekozen = kleurstelling ? zoekKleurstelling(info, kleurstelling) : undefined
    if (info && gekozen) kleurVars = [[info.variabele, gekozen.index], ...Object.entries(gekozen.setvars)]
    if (d === 0) vars = kleurVars
    /*
     * De startwaarden pas als de regels erom vragen: met de rekenmachine is dat
     * alleen nog voor een handvol onzekere variabelen, en ze lezen alle scripts
     * een tweede keer.
     */
    let startwaarden: Record<string, number> | undefined
    const leesStart = (): Record<string, number> => {
      try {
        return klein(startwaardenVan(deel.modelcfg, [...(namenPerDeel[d] ?? [])]))
      } catch {
        return {}
      }
    }
    const typisch = info ? typischVan(info.lijst, gekozen) : {}
    const kleinVars = klein(Object.fromEntries(kleurVars))
    return {
      kleurVars: kleinVars,
      typisch,
      // De voorwagen rekent ook voor een aanhanger zonder scripts (zie onder): alle namen.
      berekend: berekendVoor(deel.busPad, { ...typisch, ...kleinVars }, d === 0 ? new Set(namenPerDeel.flatMap((n) => [...n])) : (namenPerDeel[d] ?? new Set())),
      get startwaarden(): Record<string, number> {
        startwaarden ??= leesStart()
        return startwaarden
      },
      daglicht: klein(daglichtVoorBus(deel.busPad))
    }
  })
  /*
   * Een aanhanger zonder eigen scripts (de achterwagen van de NLC 18C heeft
   * alleen [varnamelist]) rekent zelf niets: zijn stoelen, deuren en lichten
   * volgen de voorwagen. Dan wat de voorwagen zeker weet, met de eigen
   * kleurVars erover.
   */
  for (let d = 1; d < rustDelen.length; d++) {
    const eigen = rustDelen[d]
    if (eigen.berekend || !rustDelen[0].berekend) continue
    eigen.berekend = { ...rustDelen[0].berekend, ...eigen.kleurVars }
  }
  // 'script': de rekenmachine rekende voor elk deel; wat zij onzeker liet, deden de regels.
  const bron = rustDelen.every((d) => d.berekend) ? 'script' : 'regels'
  return { ...rustRegels(vermeldingen, rustDelen), vars, bron }
}

/**
 * De gewone uitvoering van een model (tegenlezing F2): per setvar die de
 * gekozen kleurstelling (of Standaard) NIET zet, de waarde die de meeste
 * kleurstellingen van dit model geven; een kleurstelling die hem niet zet telt
 * als 0 (zo begint OMSI). Bij gelijke stand: de waarde van de eerste in OMSI's
 * volgorde. Alleen wat niet 0 is komt erin.
 *
 * Waarom: de O560 zet `vis_wheels` alleen in zijn .cti's (3 van de 4 op 1). Bij
 * Standaard zet de app niets, en een variabele die geen script zet is in OMSI 0
 * -- dan had de bus geen wielen. Dit toont het model zoals de maker het
 * bedoelde; wat OMSI zelf bij Standaard toont, meet de plugin-afdruk in F3.
 */
export function typischVan(
  lijst: Array<{ setvars: Record<string, number> }>,
  gekozen?: { setvars: Record<string, number> }
): Record<string, number> {
  const eigen = new Set(Object.keys(gekozen?.setvars ?? {}).map((n) => n.toLowerCase()))
  const perKleur = lijst.map((k) => klein(k.setvars))
  const namen = new Set<string>()
  for (const s of perKleur) for (const n of Object.keys(s)) if (!eigen.has(n)) namen.add(n)
  const uit: Record<string, number> = {}
  for (const naam of namen) {
    const tel = new Map<number, number>()
    for (const s of perKleur) tel.set(s[naam] ?? 0, (tel.get(s[naam] ?? 0) ?? 0) + 1)
    const meest = Math.max(...tel.values())
    const kandidaten = new Set([...tel].filter(([, n]) => n === meest).map(([w]) => w))
    const w = perKleur.map((s) => s[naam] ?? 0).find((x) => kandidaten.has(x)) ?? 0
    if (w !== 0) uit[naam] = w
  }
  return uit
}

/** Systeemvariabelen die in rust vaststaan; de rest (datum, weer, ...) is onzeker. */
const SYSTEEM: Readonly<Record<string, number>> = { timegap: 1 / 30 }

/**
 * Wat de rekenmachine (core/oscrust.ts) zeker weet over de namen waar de regels
 * naar vragen: `{init}`, dan de vars (kleurVars plus de gewone uitvoering), dan
 * `{frame}` tot die namen stilstaan. Niets als het niet lukt (dan gelden de regels).
 */
function berekendVoor(busPad: string, vars: Record<string, number>, namen: Set<string>): Record<string, number> | undefined {
  try {
    const { scripts, constfiles } = busLijsten(busPad)
    if (scripts.length === 0) return undefined
    const programma = leesRustProgramma(scripts, constfiles)
    const gevraagd = new Set([...namen].map((n) => n.toLowerCase()))
    const uit = rekenRust(programma, { motor: MOTORSTANDAARD, vars, systeem: SYSTEEM, gevraagd })
    const zeker: Record<string, number> = {}
    for (const [naam, w] of uit.waarden) if (!Number.isNaN(w)) zeker[naam] = w
    return zeker
  } catch {
    return undefined
  }
}
