import { readFileSync, statSync } from 'node:fs'
import { readOmsiLines } from './omsiFile'

/**
 * DE REKENMACHINE VOOR DE RUSTSTAND (bus3d-ontwerp §5.2; tegenlezing F2)
 *
 * Een kleine voorloper van de OSC-machine van F3: de `{init}`- en
 * `{frame}`-blokken van de scripts van een bus doorrekenen zoals OMSI dat doet,
 * maar alleen voor zover de uitkomst ZEKER is. Waarom al in F2: de regels van
 * §5.2 raadden voor een variabele die geen script letterlijk zet "de kleinste
 * waarde die de [visible]-regels gebruiken" -- en wordt alleen 1 gebruikt, dan
 * stond het onderdeel aan. Zo stonden bij 8 van de 12 proefbussen dingen in
 * beeld die OMSI in rust verbergt: alle segmenten van het zonnescherm van de
 * O560 als plaat boven het dak, de fietsendrager en twee stoeltypes tegelijk in
 * de NLC, de laadkabel met paal van de HH20, het schoolbusbord van de O550
 * (beeldbeoordeling F2). Wat OMSI werkelijk toont volgt uit de scripts: de NLC
 * kiest zijn stoelen in `{frame}` uit `vis_Sitztyp`
 * (MAN_NewLionsCity\script\setvar.osc:1233-1249), de O550 zijn velgen uit
 * `vis_radkappe` (TH_Ueberlandbus\Script\visual.osc:346-351).
 *
 * DE SEMANTIEK (idee uit openOMSI docs/FORMATS.md, "Scripts"; eigen code)
 * - een stapel van 8 getallen: een nieuwe waarde komt bovenop, de onderste valt
 *   eraf; een binaire bewerking haalt er twee af en zet de uitkomst terug
 *   (`a b -` is a - b), en onderaan komt een 0 bij; delen door 0 geeft 0;
 * - `(S.L.x)` en `s0`..`s9` bewaren de bovenste zonder hem weg te halen;
 * - `{if}` kijkt naar de bovenste (zonder weghalen), `{else}`, `{endif}`;
 * - `(C.L.x)` een constante en `(F.L.x)` een curve uit de constfiles;
 * - `(M.L.x)` een macro; een macro die twee keer bestaat: de laatste telt;
 * - alle L-variabelen beginnen op 0.
 *
 * ONZEKER = NaN. Wat van buiten komt en niet vaststaat (systeemvariabelen als
 * de datum, `random`, teksten, `(M.V.…)`), is NaN, en NaN gaat door elke
 * berekening heen. Een `{if}` op NaN: beide takken lopen, en wat ze
 * toekennen wordt NaN. Zo zegt de machine nooit iets zekers wat niet zeker is;
 * een NaN-variabele valt terug op de regels (`rustRegels`).
 *
 * Triggers (knoppen, muis) en `{frame_ai}` lopen niet: in rust drukt niemand.
 * Grenzen: 2 miljoen bewerkingen per ronde, macro's 64 diep.
 */

const ONZEKER = Number.NaN

type Knoop =
  | { k: 'getal'; w: number }
  | { k: 'laad'; naam: string }
  | { k: 'bewaar'; naam: string }
  | { k: 'systeem'; naam: string }
  | { k: 'const'; naam: string }
  | { k: 'curve'; naam: string }
  | { k: 'macro'; naam: string }
  | { k: 'besmet' } // (M.V.…), tekstbewerkingen en wat we niet kennen: de hele stapel onzeker
  | { k: 'niets' } // teksten, geluid
  | { k: 'op'; op: string }
  | { k: 'reg'; laad: boolean; nr: number }
  | { k: 'als'; dan: Knoop[]; anders: Knoop[] }

export interface RustProgramma {
  init: Knoop[][]
  frame: Knoop[][]
  macros: Map<string, Knoop[]>
  constanten: Map<string, number>
  curves: Map<string, Array<[number, number]>>
}

/** Woorden van een .osc: commentaar weg, een tekst tussen aanhalingstekens is één woord. */
function woordenVan(tekst: string): string[] {
  const uit: string[] = []
  for (const regel of tekst.split(/\r?\n/)) {
    let i = 0
    while (i < regel.length) {
      const c = regel[i]
      if (c === "'") break
      if (c === ' ' || c === '\t') {
        i++
        continue
      }
      if (c === '"') {
        const eind = regel.indexOf('"', i + 1)
        uit.push('"')
        i = eind < 0 ? regel.length : eind + 1
        continue
      }
      let j = i
      while (j < regel.length && regel[j] !== ' ' && regel[j] !== '\t' && regel[j] !== "'") j++
      uit.push(regel.slice(i, j))
      i = j
    }
  }
  return uit
}

const BINAIR = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '<=', '>=', '&&', '||', 'min', 'max'])
const UNAIR = new Set(['sin', 'arcsin', 'arctan', 'exp', 'sqrt', 'sqr', 'sgn', 'abs', 'trunc', '!', '/-/', 'random', 'ln', 'cos', 'tan'])

function knoopVan(woord: string): Knoop {
  const w = woord.toLowerCase()
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(w)) return { k: 'getal', w: Number(w) }
  const toegang = /^\(([a-z])\.([a-z$])\.([^)]*)\)$/.exec(w)
  if (toegang) {
    const [, eerste, tweede, naam] = toegang
    if (tweede === '$') return { k: 'niets' }
    if (eerste === 'l' && tweede === 'l') return { k: 'laad', naam }
    if (eerste === 's' && tweede === 'l') return { k: 'bewaar', naam }
    if (eerste === 'l' && tweede === 's') return { k: 'systeem', naam }
    if (eerste === 's' && tweede === 's') return { k: 'niets' }
    if (eerste === 'c') return { k: 'const', naam }
    if (eerste === 'f') return { k: 'curve', naam }
    if (eerste === 'm' && tweede === 'l') return { k: 'macro', naam }
    if (eerste === 't') return { k: 'niets' }
    return { k: 'besmet' }
  }
  if (w === '"') return { k: 'niets' }
  if (w.startsWith('%')) return { k: 'niets' }
  if (BINAIR.has(w) || UNAIR.has(w) || w === 'd' || w === 'pi') return { k: 'op', op: w }
  const reg = /^([sl])(\d)$/.exec(w)
  if (reg) return { k: 'reg', laad: reg[1] === 'l', nr: Number(reg[2]) }
  // Tekstbewerkingen ($…) en iets wat we niet kennen: dan weten we niet meer wat er op de stapel ligt.
  return { k: 'besmet' }
}

/** Van woorden naar een boom met de {if}'s erin. */
function boomVan(woorden: string[]): Knoop[] {
  const wortel: Knoop[] = []
  const stapel: Array<{ als: Extract<Knoop, { k: 'als' }>; inAnders: boolean }> = []
  const hier = (): Knoop[] => {
    const top = stapel[stapel.length - 1]
    return top ? (top.inAnders ? top.als.anders : top.als.dan) : wortel
  }
  for (const woord of woorden) {
    const w = woord.toLowerCase()
    if (w === '{if}') {
      const als: Extract<Knoop, { k: 'als' }> = { k: 'als', dan: [], anders: [] }
      hier().push(als)
      stapel.push({ als, inAnders: false })
    } else if (w === '{else}') {
      const top = stapel[stapel.length - 1]
      if (top) top.inAnders = true
    } else if (w === '{endif}') {
      stapel.pop()
    } else {
      hier().push(knoopVan(woord))
    }
  }
  return wortel
}

function stempelVan(bestanden: string[]): string {
  return bestanden
    .map((b) => {
      try {
        const st = statSync(b)
        return `${st.size}|${Math.round(st.mtimeMs)}`
      } catch {
        return '-'
      }
    })
    .join(';')
}

const programmaGeheugen = new Map<string, { stempel: string; programma: RustProgramma }>()

/** De scripts en constfiles van een bus als programma; onthouden zolang de bestanden niet veranderen. */
export function leesRustProgramma(scripts: string[], constfiles: string[]): RustProgramma {
  const sleutel = [...scripts, '|', ...constfiles].join('\n').toLowerCase()
  const stempel = stempelVan([...scripts, ...constfiles])
  const bekend = programmaGeheugen.get(sleutel)
  if (bekend && bekend.stempel === stempel) return bekend.programma
  const programma: RustProgramma = { init: [], frame: [], macros: new Map(), constanten: new Map(), curves: new Map() }
  for (const bestand of scripts) {
    let tekst: string
    try {
      tekst = readFileSync(bestand, 'latin1')
    } catch {
      continue
    }
    let soort: 'init' | 'frame' | 'macro' | 'anders' | undefined
    let naam = ''
    let blok: string[] = []
    const sluit = (): void => {
      if (soort === 'init') programma.init.push(boomVan(blok))
      else if (soort === 'frame') programma.frame.push(boomVan(blok))
      // Een macro die twee keer bestaat: die van het latere bestand (zoals OMSI).
      else if (soort === 'macro') programma.macros.set(naam, boomVan(blok))
      soort = undefined
      blok = []
    }
    for (const woord of woordenVan(tekst)) {
      const w = woord.toLowerCase()
      if (w === '{end}') {
        sluit()
        continue
      }
      const kop = /^\{(init|frame|macro:(.*)|[^}]*)\}$/.exec(w)
      if (kop && w !== '{if}' && w !== '{else}' && w !== '{endif}') {
        sluit()
        soort = kop[1] === 'init' ? 'init' : kop[1] === 'frame' ? 'frame' : kop[2] !== undefined ? 'macro' : 'anders'
        naam = (kop[2] ?? '').trim()
        continue
      }
      if (soort) blok.push(woord)
    }
    sluit()
  }
  for (const bestand of constfiles) {
    let regels: string[]
    try {
      regels = readOmsiLines(bestand)
    } catch {
      continue
    }
    let curve: Array<[number, number]> | undefined
    for (let i = 0; i < regels.length; i++) {
      const kop = regels[i].trimEnd()
      if (kop === '[const]') {
        const naam = (regels[i + 1] ?? '').trim().toLowerCase()
        const w = Number((regels[i + 2] ?? '').trim())
        // Twee keer dezelfde constante: de eerste telt.
        if (naam && Number.isFinite(w) && !programma.constanten.has(naam)) programma.constanten.set(naam, w)
        curve = undefined
        i += 2
      } else if (kop === '[newcurve]') {
        const naam = (regels[i + 1] ?? '').trim().toLowerCase()
        curve = []
        if (naam && !programma.curves.has(naam)) programma.curves.set(naam, curve)
        i++
      } else if (kop === '[pnt]' && curve) {
        const x = Number((regels[i + 1] ?? '').trim())
        const y = Number((regels[i + 2] ?? '').trim())
        if (Number.isFinite(x) && Number.isFinite(y)) curve.push([x, y])
        i += 2
      } else if (kop.startsWith('[') && kop.endsWith(']')) curve = undefined
    }
  }
  for (const punten of programma.curves.values()) punten.sort((a, b) => a[0] - b[0])
  if (programmaGeheugen.size >= 16) programmaGeheugen.clear()
  programmaGeheugen.set(sleutel, { stempel, programma })
  return programma
}

/** Een curve zoals OMSI: lineair tussen de punten, buiten de uiteinden vlak. */
function curveOp(p: Array<[number, number]>, x: number): number {
  if (Number.isNaN(x) || p.length === 0) return ONZEKER
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

const waar = (b: boolean): number => (b ? 1 : 0)

function binair(op: string, a: number, b: number): number {
  // Een zekere 0 maakt && zeker 0, een zekere niet-0 maakt || zeker 1.
  if (op === '&&') {
    if (a === 0 || b === 0) return 0
    return Number.isNaN(a) || Number.isNaN(b) ? ONZEKER : 1
  }
  if (op === '||') {
    if ((a !== 0 && !Number.isNaN(a)) || (b !== 0 && !Number.isNaN(b))) return 1
    return Number.isNaN(a) || Number.isNaN(b) ? ONZEKER : 0
  }
  if (Number.isNaN(a) || Number.isNaN(b)) return ONZEKER
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? 0 : a / b
    case '%':
      return b === 0 ? 0 : a % b
    case '=':
      return waar(a === b)
    case '<':
      return waar(a < b)
    case '>':
      return waar(a > b)
    case '<=':
      return waar(a <= b)
    case '>=':
      return waar(a >= b)
    case 'min':
      return Math.min(a, b)
    case 'max':
      return Math.max(a, b)
  }
  return ONZEKER
}

function unair(op: string, a: number): number {
  if (Number.isNaN(a)) return ONZEKER
  switch (op) {
    case 'sin':
      return Math.sin(a)
    case 'cos':
      return Math.cos(a)
    case 'tan':
      return Math.tan(a)
    case 'arcsin':
      return Math.asin(a)
    case 'arctan':
      return Math.atan(a)
    case 'exp':
      return Math.exp(a)
    case 'ln':
      return a > 0 ? Math.log(a) : 0
    case 'sqrt':
      return a >= 0 ? Math.sqrt(a) : 0
    case 'sqr':
      return a * a
    case 'sgn':
      return Math.sign(a)
    case 'abs':
      return Math.abs(a)
    case 'trunc':
      return Math.trunc(a)
    case '!':
      return waar(a === 0)
    case '/-/':
      return -a
  }
  // random: niet vast.
  return ONZEKER
}

export interface RustInvoer {
  /** Wat vóór `{init}` staat: de standaardwaarden van de motor (namen klein). */
  motor: Readonly<Record<string, number>>
  /** Wat na `{init}` gezet wordt: bij ons `kleurVars` (namen klein). */
  vars: Readonly<Record<string, number>>
  /** Systeemvariabelen `(L.S.x)` die vaststaan (namen klein); de rest is onzeker. */
  systeem: Readonly<Record<string, number>>
  /** Welke variabelen ertoe doen (klein): zodra die niet meer veranderen, stopt `{frame}`. */
  gevraagd: Iterable<string>
  /** Hoogstens zoveel `{frame}`-rondes (§5.2: 10). */
  rondes?: number
}

export interface RustUitkomst {
  /** Per gevraagde variabele (klein) de waarde; NaN = niet zeker. */
  waarden: Map<string, number>
  rondes: number
  bewerkingen: number
}

/** Per lijst knopen (tak of macro): welke variabelen hij kan schrijven, met de macro's die hij aanroept. */
const schrijfGeheugen = new WeakMap<Knoop[], Set<string>>()

function schrijftIn(p: RustProgramma, knopen: Knoop[]): Set<string> {
  const bekend = schrijfGeheugen.get(knopen)
  if (bekend) return bekend
  /*
   * Eén doorloop met één lijst van bezochte macro's: elke macro telt één keer,
   * ook als hij zichzelf (via een omweg) aanroept, en alleen de uitkomst van
   * deze hele doorloop gaat in het geheugen (een tussenstand binnen een kring
   * zou onvolledig zijn).
   */
  const uit = new Set<string>()
  const gezien = new Set<Knoop[]>([knopen])
  const langs = (lijst: Knoop[]): void => {
    for (const n of lijst) {
      if (n.k === 'bewaar') uit.add(n.naam)
      else if (n.k === 'als') {
        langs(n.dan)
        langs(n.anders)
      } else if (n.k === 'macro') {
        const m = p.macros.get(n.naam)
        if (!m || gezien.has(m)) continue
        gezien.add(m)
        const klaar = schrijfGeheugen.get(m)
        if (klaar) for (const naam of klaar) uit.add(naam)
        else langs(m)
      }
    }
  }
  langs(knopen)
  schrijfGeheugen.set(knopen, uit)
  return uit
}

/** Een berekening die over de grenzen gaat: dan gelden de regels. */
export class RustTeLang extends Error {}

/**
 * `{init}`, dan de vars, dan `{frame}` tot de gevraagde variabelen stilstaan.
 * Gooit `RustTeLang` bij een te lange berekening.
 */
export function rekenRust(p: RustProgramma, invoer: RustInvoer): RustUitkomst {
  const vars = new Map<string, number>(Object.entries(invoer.motor))
  const regs = new Array<number>(10).fill(0)
  let st = new Array<number>(8).fill(0)
  let bewerkingen = 0
  let teller = 0
  const MAX = 2_000_000

  const duw = (w: number): void => {
    st.pop()
    st.unshift(w)
  }
  const pak = (): number => {
    const w = st.shift()!
    st.push(0)
    return w
  }

  /*
   * Onzeker lopen hoeft niet echt: wat een onzekere tak doet is alleen "alles
   * wat hij kan schrijven wordt NaN". Dat is per tak en per macro één keer uit
   * te rekenen. Echt doorlopen liep bij de MB C2 (de Atron roept zijn macro's
   * in beide takken aan) over de 2 miljoen bewerkingen.
   */
  const onzekerMaak = (knopen: Knoop[]): void => {
    for (const naam of schrijftIn(p, knopen)) vars.set(naam, ONZEKER)
    regs.fill(ONZEKER)
    st = st.map(() => ONZEKER)
  }

  const loop = (knopen: Knoop[], onzeker: boolean, diepte: number): void => {
    if (onzeker) {
      onzekerMaak(knopen)
      return
    }
    for (const n of knopen) {
      if (++teller > MAX) throw new RustTeLang('te veel bewerkingen')
      switch (n.k) {
        case 'getal':
          duw(n.w)
          break
        case 'laad':
          duw(vars.get(n.naam) ?? 0)
          break
        case 'bewaar':
          vars.set(n.naam, onzeker ? ONZEKER : st[0])
          break
        case 'systeem':
          duw(invoer.systeem[n.naam] ?? ONZEKER)
          break
        case 'const':
          duw(p.constanten.get(n.naam) ?? ONZEKER)
          break
        case 'curve': {
          const punten = p.curves.get(n.naam)
          duw(punten ? curveOp(punten, st[0]) : ONZEKER)
          break
        }
        case 'macro': {
          const m = p.macros.get(n.naam)
          if (!m) break
          if (diepte >= 64) throw new RustTeLang('macro te diep')
          loop(m, onzeker, diepte + 1)
          break
        }
        case 'besmet':
          st = st.map(() => ONZEKER)
          break
        case 'niets':
          break
        case 'reg':
          if (n.laad) duw(regs[n.nr])
          else regs[n.nr] = onzeker ? ONZEKER : st[0]
          break
        case 'op':
          if (n.op === 'd') duw(st[0])
          else if (n.op === 'pi') duw(Math.PI)
          else if (UNAIR.has(n.op)) st[0] = unair(n.op, st[0])
          else {
            const b = pak()
            const a = pak()
            duw(binair(n.op, a, b))
          }
          break
        case 'als': {
          const c = st[0]
          if (onzeker || Number.isNaN(c)) {
            // Niet zeker welke tak: beide, en wat ze toekennen is onzeker.
            const voor = [...st]
            loop(n.dan, true, diepte)
            st = [...voor]
            loop(n.anders, true, diepte)
            st = st.map(() => ONZEKER)
          } else if (c !== 0) loop(n.dan, false, diepte)
          else loop(n.anders, false, diepte)
          break
        }
      }
    }
  }

  const blok = (knopen: Knoop[]): void => {
    st = new Array<number>(8).fill(0)
    loop(knopen, false, 0)
  }

  for (const b of p.init) blok(b)
  bewerkingen += teller
  teller = 0
  for (const [naam, w] of Object.entries(invoer.vars)) vars.set(naam, w)

  const gevraagd = [...invoer.gevraagd]
  const foto = (): string => gevraagd.map((n) => String(vars.get(n) ?? 0)).join(',')
  const max = Math.max(1, invoer.rondes ?? 10)
  let rondes = 0
  let vorige = foto()
  while (rondes < max) {
    for (const b of p.frame) blok(b)
    bewerkingen += teller
    teller = 0
    rondes++
    const nu = foto()
    // Twee rondes zonder verschil in wat ertoe doet: klaar (een klok die doorloopt telt niet).
    if (rondes >= 2 && nu === vorige) break
    vorige = nu
  }
  const waarden = new Map<string, number>()
  for (const n of gevraagd) waarden.set(n, vars.get(n) ?? 0)
  return { waarden, rondes, bewerkingen }
}
