import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readOmsiLines } from './omsiFile'
import { leesKleurstellingen } from './kleurstelling'
import { startwaardenVan } from './schermvorm'
import { rustRegels, type Bus3dPakKop, type RustDeel, type RustVermelding } from '../shared/bus3d'

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
 * De scripts zelf draaien komt in F3 (`core/osc.ts`). Tot dan de REGELS van
 * `rustRegels` (shared/bus3d.ts), met hier de invoer erbij:
 * - per deel de `kleurVars` van de kleurstelling (een aanhanger zonder die
 *   kleurstelling houdt zijn eigen: niets, zoals `aanhangerVan` in main);
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
): ReturnType<typeof rustRegels> & { vars: Array<[string, number]> } {
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
    if (kleurstelling) {
      const info = leesKleurstellingen(deel.modelcfg)
      const gekozen = info?.lijst.find((item) => item.naam === kleurstelling)
      if (info && gekozen) kleurVars = [[info.variabele, gekozen.index], ...Object.entries(gekozen.setvars)]
    }
    if (d === 0) vars = kleurVars
    let startwaarden: Record<string, number> = {}
    try {
      startwaarden = startwaardenVan(deel.modelcfg, [...(namenPerDeel[d] ?? [])])
    } catch {
      startwaarden = {}
    }
    return {
      kleurVars: klein(Object.fromEntries(kleurVars)),
      startwaarden: klein(startwaarden),
      daglicht: klein(daglichtVoorBus(deel.busPad))
    }
  })
  return { ...rustRegels(vermeldingen, rustDelen), vars }
}
