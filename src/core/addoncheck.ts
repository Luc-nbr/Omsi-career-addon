import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { opSchijf } from './addon'
import { leesBusModel, vergeetBestandenIndex, zoekTextuurVan } from './busmodel'
import { blockTag, readOmsiLines, str } from './omsiFile'

/*
 * De foutcontrole: wat een bus of kaart noemt en wat er niet ligt.
 *
 * WAAROM
 * Het meeste gedoe met OMSI-add-ons is een bestand dat ontbreekt: een kaart die
 * een sceneryobject noemt uit een pakket dat je niet hebt (grijze blokken of
 * een crash bij het laden), een bus met een ontbrekende textuur of een script
 * dat er niet is. OMSI zegt dat hoogstens in een logbestand. Hier staat het
 * per bus en per kaart, met het pad dat ontbreekt en wie het noemt.
 *
 * Alleen lezen, en alleen verwijzingen die de bestanden zelf noemen. Wat OMSI
 * elders nog zoekt (standaardgeluiden, fonts in de scripts) valt buiten deze
 * controle; een lege lijst betekent "niets gevonden", niet "gegarandeerd goed".
 */

export type Ontbreeksoort =
  | 'model'
  | 'o3d'
  | 'textuur'
  | 'script'
  | 'geluid'
  | 'object'
  | 'spline'
  | 'voertuig'
  | 'kaartset'
  | 'bestand'

export interface Ontbrekend {
  soort: Ontbreeksoort
  /** Wat er ontbreekt, zoals het genoemd wordt. */
  pad: string
  /** Welk bestand het noemt (ten opzichte van de OMSI-map). */
  door: string
  /** Hoe vaak het genoemd wordt, bij objecten en splines op een kaart. */
  keer?: number
}

export interface Controle {
  soort: 'bus' | 'kaart'
  naam: string
  /** Hoeveel verwijzingen er bekeken zijn. */
  bekeken: number
  ontbrekend: Ontbrekend[]
  /** Er stond meer dan dit; de lijst is afgekapt. */
  meer?: number
}

/** Hoogstens zoveel regels per bus of kaart in de uitslag. */
const MAX = 400

const rel = (omsi: string, pad: string): string => pad.slice(omsi.length + 1).replace(/\\/g, '/')

/** Bestaat dit pad onder deze map, ongeacht hoofdletters en schuine strepen. */
export function bestaat(basis: string, pad: string): boolean {
  const schoon = pad.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!schoon) return true
  return existsSync(opSchijf(basis, schoon))
}

/** Waarden van blokken met een vaste regel eronder, of met een telling en zoveel regels. */
function paden(regels: string[], tag: string, geteld: boolean): string[] {
  const uit: string[] = []
  for (let i = 0; i < regels.length; i++) {
    if (blockTag(regels[i]) !== tag) continue
    if (!geteld) {
      uit.push(str(regels[i + 1]))
      continue
    }
    const n = Number.parseInt(str(regels[i + 1]), 10)
    for (let k = 0; k < (Number.isFinite(n) ? Math.min(n, 200) : 0); k++) uit.push(str(regels[i + 2 + k]))
  }
  return uit.filter(Boolean)
}

/* ---- bussen ---- */

/**
 * Eén `.bus` of `.ovh`: het model en zijn onderdelen en texturen, de scripts,
 * de geluidsbestanden en de losse cfg's die hij noemt.
 */
export function controleerBusbestand(omsi: string, busPad: string): { bekeken: number; ontbrekend: Ontbrekend[] } {
  const door = rel(omsi, busPad)
  const ontbrekend: Ontbrekend[] = []
  let bekeken = 0
  const map = dirname(busPad)
  let regels: string[]
  try {
    regels = readOmsiLines(busPad)
  } catch {
    return { bekeken: 0, ontbrekend: [{ soort: 'bestand', pad: door, door }] }
  }
  const kijk = (soort: Ontbreeksoort, pad: string, basis = map): void => {
    bekeken += 1
    if (!bestaat(basis, pad)) ontbrekend.push({ soort, pad, door })
  }

  const model = paden(regels, '[model]', false)[0]
  if (model) {
    kijk('model', model)
    const bm = bestaat(map, model) ? leesBusModel(busPad) : undefined
    for (const o of bm?.onderdelen ?? []) {
      bekeken += 1
      if (!o.pad) ontbrekend.push({ soort: 'o3d', pad: o.bestand, door: rel(omsi, bm!.modelcfg) })
      for (const m of o.materialen) {
        bekeken += 1
        if (!m.pad && m.textuur) ontbrekend.push({ soort: 'textuur', pad: m.textuur, door: rel(omsi, bm!.modelcfg) })
      }
    }
  }
  for (const s of [...paden(regels, '[script]', true), ...paden(regels, '[varnamelist]', true), ...paden(regels, '[stringvarnamelist]', true), ...paden(regels, '[constfile]', true)]) {
    kijk('script', s)
  }
  for (const tag of ['[paths]', '[passengercabin]']) for (const p of paden(regels, tag, false)) kijk('bestand', p)

  // Het geluid: de cfg, en de wav's die hij noemt, naast die cfg.
  for (const tag of ['[sound]', '[sound_ai]']) {
    for (const cfg of paden(regels, tag, false)) {
      kijk('geluid', cfg)
      if (!bestaat(map, cfg)) continue
      const cfgPad = opSchijf(map, cfg.replace(/\\/g, '/'))
      let geluid: string[] = []
      try {
        geluid = readOmsiLines(cfgPad)
      } catch {
        continue
      }
      const wavs = new Set(geluid.map((r) => r.trim()).filter((r) => /\.wav$/i.test(r)))
      for (const wav of wavs) {
        bekeken += 1
        if (!bestaat(dirname(cfgPad), wav)) ontbrekend.push({ soort: 'geluid', pad: wav, door: rel(omsi, cfgPad) })
      }
    }
  }
  return { bekeken, ontbrekend }
}

/** Een busmap: al zijn `.bus`- en `.ovh`-bestanden, met elke ontbrekende verwijzing één keer. */
export function* controleerBus(omsi: string, busmap: string): Generator<number, Controle> {
  vergeetBestandenIndex()
  const map = opSchijf(omsi, `Vehicles/${busmap}`)
  const bestanden: string[] = []
  const loop = (hier: string, diepte: number): void => {
    if (diepte > 2) return
    let inhoud: string[] = []
    try {
      inhoud = readdirSync(hier)
    } catch {
      return
    }
    for (const naam of inhoud) {
      const vol = join(hier, naam)
      if (/\.(bus|ovh)$/i.test(naam)) bestanden.push(vol)
      else if (!naam.includes('.')) loop(vol, diepte + 1)
    }
  }
  loop(map, 0)
  let bekeken = 0
  const gezien = new Map<string, Ontbrekend>()
  for (const [i, bus] of bestanden.entries()) {
    const uit = controleerBusbestand(omsi, bus)
    bekeken += uit.bekeken
    for (const o of uit.ontbrekend) {
      const sleutel = `${o.soort}|${o.pad.toLowerCase()}`
      const eerder = gezien.get(sleutel)
      if (eerder) eerder.keer = (eerder.keer ?? 1) + 1
      else gezien.set(sleutel, { ...o })
    }
    yield i
  }
  return afgekapt('bus', busmap, bekeken, [...gezien.values()])
}

function afgekapt(soort: Controle['soort'], naam: string, bekeken: number, lijst: Ontbrekend[]): Controle {
  return lijst.length > MAX
    ? { soort, naam, bekeken, ontbrekend: lijst.slice(0, MAX), meer: lijst.length - MAX }
    : { soort, naam, bekeken, ontbrekend: lijst }
}

/* ---- kaarten ---- */

const TEGEL = /^tile_-?\d+_-?\d+\.map$/i

/**
 * Een kaart: de objecten en splines op elke tegel, de voertuigen in de
 * KI-lijst en de kaartset; en van elk object en elke spline die er wel is, de
 * modellen en texturen die dat bestand zelf noemt.
 *
 * In stappen per tegel, want Berlin-Spandau heeft er honderden van.
 */
export function* controleerKaart(omsi: string, kaart: string): Generator<number, Controle> {
  vergeetBestandenIndex()
  const map = opSchijf(omsi, `maps/${kaart}`)
  const ontbrekend: Ontbrekend[] = []
  let bekeken = 0
  const genoemd = new Map<string, { soort: 'object' | 'spline'; pad: string; door: string; keer: number }>()

  let tegels: string[] = []
  try {
    tegels = readdirSync(map).filter((n) => TEGEL.test(n))
  } catch {
    return { soort: 'kaart', naam: kaart, bekeken: 0, ontbrekend: [{ soort: 'bestand', pad: `maps/${kaart}`, door: '' }] }
  }
  for (const [i, tegel] of tegels.entries()) {
    let regels: string[]
    try {
      regels = readOmsiLines(join(map, tegel))
    } catch {
      continue
    }
    for (let r = 0; r < regels.length; r++) {
      const tag = blockTag(regels[r])
      const soort = tag === '[object]' ? 'object' : tag === '[spline]' || tag === '[spline_h]' ? 'spline' : undefined
      if (!soort) continue
      const pad = str(regels[r + 2])
      if (!pad) continue
      const sleutel = pad.toLowerCase().replace(/\\/g, '/')
      const eerder = genoemd.get(sleutel)
      if (eerder) eerder.keer += 1
      else genoemd.set(sleutel, { soort, pad, door: `maps/${kaart}/${tegel}`, keer: 1 })
    }
    if (i % 5 === 0) yield i
  }

  // Wat de tegels noemen, en daarbinnen wat elk object en elke spline noemt.
  let n = 0
  for (const g of genoemd.values()) {
    bekeken += 1
    if (!bestaat(omsi, g.pad)) {
      ontbrekend.push({ soort: g.soort, pad: g.pad, door: g.door, keer: g.keer })
      continue
    }
    const bestand = opSchijf(omsi, g.pad.replace(/\\/g, '/'))
    let regels: string[] = []
    try {
      regels = readOmsiLines(bestand)
    } catch {
      continue
    }
    const eigen = dirname(bestand)
    const door = rel(omsi, bestand)
    // Een object: [mesh] staat in `model/` naast het bestand, [matl] in `texture/` of in OMSI's Texture.
    for (const mesh of paden(regels, '[mesh]', false)) {
      bekeken += 1
      if (!bestaat(join(eigen, 'model'), mesh) && !bestaat(eigen, mesh)) ontbrekend.push({ soort: 'o3d', pad: mesh, door })
    }
    for (const tex of [...paden(regels, '[matl]', false), ...paden(regels, '[texture]', false)]) {
      bekeken += 1
      if (!zoekTextuurVan(eigen, omsi, tex)) ontbrekend.push({ soort: 'textuur', pad: tex, door })
    }
    if (++n % 100 === 0) yield tegels.length + n
  }

  // De KI-lijst: bussen en auto's die op de kaart rijden.
  const ai = join(map, 'ailists.cfg')
  if (existsSync(ai)) {
    const voertuigen = new Set<string>()
    try {
      for (const regel of readOmsiLines(ai)) {
        const m = regel.match(/vehicles[\\/][^\t]*?\.(bus|ovh)\b/i)
        if (m) voertuigen.add(m[0])
      }
    } catch {
      // Een onleesbare lijst is geen ontbrekend voertuig.
    }
    for (const v of voertuigen) {
      bekeken += 1
      if (!bestaat(omsi, v)) ontbrekend.push({ soort: 'voertuig', pad: v, door: `maps/${kaart}/ailists.cfg` })
    }
  }

  // De kaartset uit global.cfg.
  const cfg = join(map, 'global.cfg')
  if (existsSync(cfg)) {
    try {
      for (const pad of paden(readOmsiLines(cfg), '[ticketpack]', false)) {
        bekeken += 1
        if (!bestaat(omsi, pad)) ontbrekend.push({ soort: 'kaartset', pad, door: `maps/${kaart}/global.cfg` })
      }
    } catch {
      // idem
    }
  }

  // Wat het vaakst genoemd wordt eerst: dat ziet de speler het meest.
  ontbrekend.sort((a, b) => (b.keer ?? 1) - (a.keer ?? 1))
  return afgekapt('kaart', kaart, bekeken, ontbrekend)
}
