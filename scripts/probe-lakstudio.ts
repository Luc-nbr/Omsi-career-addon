/**
 * De Lakstudio L2 nagerekend: opslaan als OMSI-kleurstelling (design/ontwerpen/lakstudio.md §5, §9).
 *
 *   PROEF_MAP=<map> npx tsx scripts/probe-lakstudio.ts [--snel] [--alleen P1,P8]
 *
 * NOOIT in de echte OMSI-map: alles wat geschreven wordt, gaat naar een
 * NAGEBOOTSTE OMSI-map onder PROEF_MAP (`lakstudio/omsi/OMSI 2`), gemaakt uit de
 * echte door de tekstbestanden (.bus/.ovh/.sco/.cfg/.cti/.osc/.txt/.rpc) te
 * kopiëren en van elke textuur alleen de eerste 4 kB (de kop) te bewaren. De
 * echte OMSI-map wordt alleen gelezen: de Bus3D-pakketten (voor oppervlak,
 * ruiten en doos) en de standaardtexturen (om een lak van te maken) komen
 * daaruit. De gebruikersmap is ook nagebootst (`lakstudio/ud`).
 *
 * P1  .cti voor de 11 bussen, de C2 GN Hybrid, de O530 3 deuren en de KI-C2's
 * P2  DDS: terug te lezen, volle keten, PSNR, `_#low`, BC1 alleen zonder alfa
 * P8  nooit overschrijven (a-f)
 * P9  busbedrijf: `eigen`, het nummer, de Hybrid alleen als hij gebakken is
 * P13 terugval: geen [CTC], een ontbrekende map, conflicten, NG313
 * P15 klaarzetten terwijl OMSI "draait", en de wachtrij
 * P16 busopties (de indeling; wisselen in ≤ 300 ms is L1)
 * herstel: de meldingen van de proefdraaier en de tegenlezing van L3 (zie `pHerstel`)
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, closeSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import iconv from 'iconv-lite'
import { bouwBus3d } from '../src/core/bus3d'
import { omsiRegistratie } from '../src/core/omsiregistratie'
import { eigenKleurstellingen, kleurstellingenVanBus, leesKleurstellingen, zoekKleurstelling } from '../src/core/kleurstelling'
import { familieVan, lakInfoVan, lakOpties, texcoordtransTelling, type Familie, type LakInfo } from '../src/core/lakfamilie'
import {
  bewaarProject,
  klaarzetten,
  lakPlan,
  leesWachtrij,
  nieuwProjectId,
  plaatsLak,
  verwerkWachtrij,
  verwijderLak,
  wezen,
  weesWeg,
  type LakOmgeving
} from '../src/core/lakstudio'
import { leesRegister } from '../src/core/addon'
import { maakLakstudio } from '../src/main/lakstudio'
import { niveauBytes } from '../src/shared/bcn'
import { codeerBc, heeftAlfa, mipKeten } from '../src/shared/bcn'
import { leesDdsKop, lowUitDds, niveauMaten, schrijfDds, ddsKop } from '../src/shared/dds'
import { cp1252Vriendelijk, ctiTekst, naamFout, omsiHoofdletters, type LakProject } from '../src/shared/lak'
import { ontleedTextuur, pakBmpUit, textuurKop, type Textuur } from '../src/core/textuur'
import { leesPng } from '../src/core/png'
import { maakGrendel } from '../src/main/grendel'
import { einde, klopt } from './proefhulp'

const ECHT = process.env.OMSI_ECHT || 'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const basis = join(process.env.PROEF_MAP || join(process.env.TEMP ?? '.', 'proef'), 'lakstudio')
/*
 * De nagebootste OMSI-map staat in de proefmap, maar die ligt diep (150 tekens):
 * dan komt elk pad boven de 259 tekens die OMSI aankan (addon.ts `MAX_PAD`), en
 * weigert het plan terecht alles. Daarom een korte ingang: een junction in de
 * tijdelijke map van Windows (`%TEMP%\lkp`) naar de proefmap. Wat geschreven
 * wordt, landt in de proefmap. De junction zelf wordt nooit recursief gewist.
 */
const KORT = join(process.env.TEMP ?? dirname(basis), 'lkp')
function korteIngang(): string {
  mkdirSync(join(basis, 'omsi'), { recursive: true })
  if (!existsSync(KORT)) execFileSync('cmd', ['/c', 'mklink', '/J', KORT, join(basis, 'omsi')], { stdio: 'ignore' })
  if (!existsSync(join(KORT, '.')) || realpathSync(KORT).toLowerCase() !== realpathSync(join(basis, 'omsi')).toLowerCase()) {
    throw new Error(`${KORT} wijst niet naar ${join(basis, 'omsi')}`)
  }
  return join(KORT, 'OMSI 2')
}
const NEP = korteIngang()
const UD = join(basis, 'ud')
const args = process.argv.slice(2)
const SNEL = args.includes('--snel')
const alleenArg = args.indexOf('--alleen') >= 0 ? args[args.indexOf('--alleen') + 1] : ''
const ALLEEN = new Set(alleenArg.split(',').filter(Boolean))
const doe = (p: string): boolean => ALLEEN.size === 0 || ALLEEN.has(p)

const MAPPEN = [
  'MAN_SD200',
  'MB_C2_EN_BVG',
  'MB_O530',
  'ABCoach_O560',
  'MAN_NewLionsCity',
  'HH20_EBus2021',
  'MAN_NL_NG',
  'HOH_Iveco-Urbanway-18',
  'Citybus 530 by Kajosoft',
  'TH_Ueberlandbus',
  'HH109_Stadtbus_VHHPVG_AI',
  'HC_C2_parked',
  'MAN_NL_NG_263',
  'VA_GS_Hochflurer'
]
const TEKST = /\.(bus|ovh|sco|cfg|cti|osc|txt|rpc|hof|org)$/i
const BEELD = /\.(dds|tga|bmp|png|jpg|jpeg)$/i

/** De nagebootste OMSI-map: tekst helemaal, beelden alleen hun kop (4 kB), de rest niet. */
function maakNep(): void {
  const merk = join(NEP, '.nagebootst')
  if (existsSync(merk)) return
  rmSync(NEP, { recursive: true, force: true })
  let n = 0
  const kopie = (van: string, naar: string): void => {
    for (const d of readdirSync(van, { withFileTypes: true })) {
      const a = join(van, d.name)
      const b = join(naar, d.name)
      if (d.isDirectory()) {
        mkdirSync(b, { recursive: true })
        kopie(a, b)
      } else if (TEKST.test(d.name)) {
        mkdirSync(naar, { recursive: true })
        copyFileSync(a, b)
        n++
      } else if (BEELD.test(d.name)) {
        mkdirSync(naar, { recursive: true })
        const fd = openSync(a, 'r')
        const buf = Buffer.alloc(4096)
        const len = readSync(fd, buf, 0, 4096, 0)
        closeSync(fd)
        writeFileSync(b, buf.subarray(0, len))
        n++
      }
    }
  }
  for (const m of MAPPEN) kopie(join(ECHT, 'Vehicles', m), join(NEP, 'Vehicles', m))
  kopie(join(ECHT, 'SDK', 'RepaintTool'), join(NEP, 'SDK', 'RepaintTool'))
  for (const m of ['Texture', 'maps', 'Sceneryobjects', 'Splines', 'plugins', 'Fonts', 'Weather']) mkdirSync(join(NEP, m), { recursive: true })
  writeFileSync(join(NEP, 'Omsi.exe'), '')
  // P13: de CTC-map van de C2 E5 GN ontbreekt (op Lucs pc is hij leeg).
  rmSync(join(NEP, 'Vehicles', 'MB_C2_EN_BVG', 'Texture', 'Repaints', 'rep_GN_E5'), { recursive: true, force: true })
  writeFileSync(merk, `nagebootst ${new Date().toISOString()}, ${n} bestanden`)
}

/* ------------------------------------------------------------------ hulp */

const reg = omsiRegistratie(ECHT).sleutels
const pakketInfo = new Map<string, LakInfo>()
async function info(rel: string): Promise<LakInfo> {
  const bekend = pakketInfo.get(rel.toLowerCase())
  if (bekend) return bekend
  const u = await bouwBus3d({ omsiMap: ECHT, relatiefPad: rel, geregistreerd: reg })
  const i: LakInfo = u.bouw
    ? lakInfoVan(u.bouw.manifest, u.bouw.kop)
    : { oppervlak: new Map(), glas: new Set(), bakbaar: u.reden === 'versleuteld' ? 'versleuteld' : 'geen-model' }
  pakketInfo.set(rel.toLowerCase(), i)
  return i
}

async function familieMet(rel: string, opties: { start?: string; eigenCti?: string; wijzig?: (r: string, i: LakInfo) => LakInfo } = {}): Promise<Familie> {
  const kaal = familieVan(NEP, rel, { sjablonen: false })
  const infos = new Map<string, LakInfo>()
  for (const l of kaal.leden) infos.set(l.rel, opties.wijzig ? opties.wijzig(l.rel, await info(l.rel)) : await info(l.rel))
  return familieVan(NEP, rel, { info: (r) => infos.get(r), start: opties.start, eigenCti: opties.eigenCti, sjablonen: false })
}

/** Van een pad in de nagebootste map naar hetzelfde pad in de echte. */
const naarEcht = (pad: string): string => join(ECHT, relative(NEP, pad))

function decodeer(pad: string): Textuur | undefined {
  const b = readFileSync(pad)
  if (b[0] === 0x42 && b[1] === 0x4d) return pakBmpUit(b)
  if (b[0] === 0x89 && b[1] === 0x50) return leesPng(b)
  return ontleedTextuur(b).textuur
}

/** Een "lak": de echte standaardtextuur, 60% naar een kleur, de alfa van de basis; bijgesneden op de uitvoermaat. */
function maakRgba(standaardNep: string | undefined, b: number, h: number, kleur: [number, number, number]): Uint8Array {
  const uit = new Uint8Array(b * h * 4)
  const t = standaardNep ? decodeer(naarEcht(standaardNep)) : undefined
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const o = (y * b + x) * 4
      let r = 128
      let g = 128
      let bl = 128
      let a = 255
      if (t) {
        const sx = Math.min(t.breedte - 1, Math.floor((x * t.breedte) / b))
        const sy = Math.min(t.hoogte - 1, Math.floor((y * t.hoogte) / h))
        const s = (sy * t.breedte + sx) * 4
        r = t.pixels[s]
        g = t.pixels[s + 1]
        bl = t.pixels[s + 2]
        a = t.pixels[s + 3]
      }
      uit[o] = Math.round(r * 0.4 + kleur[0] * 0.6)
      uit[o + 1] = Math.round(g * 0.4 + kleur[1] * 0.6)
      uit[o + 2] = Math.round(bl * 0.4 + kleur[2] * 0.6)
      uit[o + 3] = a
    }
  }
  return uit
}

/** De export van één doel zoals de werker hem straks doet: keten, BC3 of BC1 op de alfa, DX9-DDS. */
function exporteer(rgba: Uint8Array, b: number, h: number): { dds: Uint8Array; formaat: 'bc1' | 'bc3'; ms: number; keten: ReturnType<typeof mipKeten> } {
  const t0 = performance.now()
  const formaat = heeftAlfa(rgba) ? 'bc3' : 'bc1'
  const keten = mipKeten(rgba, b, h)
  const dds = schrijfDds(b, h, formaat, keten.map((n) => codeerBc(n.rgba, n.b, n.h, formaat)))
  return { dds, formaat, ms: performance.now() - t0, keten }
}

function texturenVoor(
  f: Familie,
  kleur: [number, number, number]
): { texturen: Array<{ doel: string; dds: Uint8Array; rgba: Uint8Array }>; export: Record<string, unknown> } {
  const texturen: Array<{ doel: string; dds: Uint8Array; rgba: Uint8Array }> = []
  const exp: Record<string, unknown> = {}
  for (const d of f.doelen) {
    const rgba = maakRgba(d.standaard, d.uitB, d.uitH, kleur)
    const e = exporteer(rgba, d.uitB, d.uitH)
    texturen.push({ doel: d.id, dds: e.dds, rgba })
    exp[d.id] = { naam: d.naam, maat: `${d.uitB}x${d.uitH}`, formaat: e.formaat, ms: Math.round(e.ms) }
  }
  return { texturen, export: exp }
}

function project(bus: string, naam: string, opties: Record<string, number> = {}, start: LakProject['start'] = 'effen', startKleurstelling?: string): LakProject {
  const nu = new Date().toISOString()
  return bewaarProject(UD, {
    versie: 1,
    id: nieuwProjectId(),
    naam,
    bus,
    start,
    startKleurstelling,
    lagen: [],
    opties,
    spiegel: { aan: true },
    gemaakt: nu,
    bewaard: nu
  })
}

/** sha1 van elk bestand onder een map (voor "na plaatsen en verwijderen gelijk"). */
function boom(map: string): Map<string, string> {
  const uit = new Map<string, string>()
  const loop = (m: string): void => {
    let inhoud: import('node:fs').Dirent[]
    try {
      inhoud = readdirSync(m, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of inhoud) {
      const vol = join(m, d.name)
      if (d.isDirectory()) {
        uit.set(`${relative(map, vol)}${sep}`, 'map')
        loop(vol)
      } else uit.set(relative(map, vol), createHash('sha1').update(readFileSync(vol)).digest('hex'))
    }
  }
  loop(map)
  return uit
}
const boomGelijk = (a: Map<string, string>, b: Map<string, string>): string[] => {
  const verschil: string[] = []
  for (const [k, v] of a) if (b.get(k) !== v) verschil.push(`- ${k}`)
  for (const [k, v] of b) if (a.get(k) !== v) verschil.push(`+ ${k}`)
  return verschil
}

const omgeving: LakOmgeving = { omsi: NEP, userData: UD, log: (r) => logregels.push(r) }
const logregels: string[] = []
const uitslag: Record<string, unknown> = {}

/* ------------------------------------------------------------------ P1 + P2 + P9 + P8(b) per bus */

const BUSSEN: Array<{ naam: string; rel: string; verwacht: string[] }> = [
  { naam: 'C2 E6 Solo', rel: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Solo.bus', verwacht: ['C2E6_Wagenkasten'] },
  { naam: 'C2 E6 GN', rel: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus', verwacht: ['C2E6_Wagenkasten_main', 'C2E6_Wagenkasten_trail', 'C2E6_Wagenkasten_Hybrid_trail'] },
  { naam: 'MB O530', rel: 'Vehicles\\MB_O530\\MB_O530.bus', verwacht: ['01white', '3_01white'] },
  { naam: 'O560 E6', rel: 'Vehicles\\ABCoach_O560\\O560_E6.bus', verwacht: ['O560_E6_Main'] },
  { naam: 'NLC 12C', rel: 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus', verwacht: ['12C_2d_01'] },
  { naam: 'SD77', rel: 'Vehicles\\MAN_SD200\\MAN_SD77.bus', verwacht: ['SD77_01', 'SD77_02'] },
  { naam: 'HH20', rel: 'Vehicles\\HH20_EBus2021\\HHEBus2021_main.bus', verwacht: ['newC2EG', 'newC2EG_T'] },
  { naam: 'NL202', rel: 'Vehicles\\MAN_NL_NG\\MAN_EN92_main.bus', verwacht: ['EN92_1'] },
  { naam: 'Urbanway 18', rel: 'Vehicles\\HOH_Iveco-Urbanway-18\\Urbanway_18_main.bus', verwacht: ['Ext_Urbanway18_3p'] },
  { naam: 'Kajosoft O530', rel: 'Vehicles\\Citybus 530 by Kajosoft\\01a_o530_e2_2.bus', verwacht: ['body_s_e2_2'] },
  { naam: 'TH O550', rel: 'Vehicles\\TH_Ueberlandbus\\O550_Euro2.bus', verwacht: ['O550_BS'] },
  { naam: 'MB C2 E5 GN', rel: 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E5_Gn_main.bus', verwacht: ['C2E5_Wagenkasten_main', 'C2E5_Wagenkasten_trail'] }
]

interface CtiRegels {
  items: Array<{ naam: string; plek: string; pad: string }>
  setvars: Array<[string, string]>
  setvarNaItem: boolean
  crlf: boolean
  bom: boolean
}
function leesCti(pad: string): CtiRegels {
  const bytes = readFileSync(pad)
  const bom = bytes[0] === 0xef || bytes[0] === 0xff
  const tekst = iconv.decode(bytes, 'win1252')
  const crlf = !/[^\r]\n/.test(tekst) && !/\r[^\n]/.test(tekst) && tekst.endsWith('\r\n')
  const r = tekst.split('\r\n')
  const items: CtiRegels['items'] = []
  const setvars: CtiRegels['setvars'] = []
  let setvarGezien = false
  let setvarNaItem = true
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '[item]') {
      if (setvarGezien) setvarNaItem = false
      items.push({ naam: r[i + 1], plek: r[i + 2], pad: r[i + 3] })
      i += 3
    } else if (r[i] === '[setvar]') {
      setvarGezien = true
      setvars.push([r[i + 1], r[i + 2]])
      i += 2
    }
  }
  return { items, setvars, setvarNaItem, crlf, bom }
}

async function p1(): Promise<void> {
  const rijen: Array<Record<string, unknown>> = []
  let kleur = 0
  for (const b of BUSSEN) {
    const t0 = performance.now()
    const f = await familieMet(b.rel)
    const tFam = performance.now() - t0
    const opties: Record<string, number> = {}
    for (const o of lakOpties(f)) if (o.soort === 'uiterlijk') opties[o.variabele] = o.overLak && o.verberg !== undefined ? o.verberg : 0
    const naam = `Lakstudio Proef ${b.naam.replace(/[^A-Za-z0-9 ]/g, '')}`
    const p = project(b.rel, naam, opties)
    const kleuren: Array<[number, number, number]> = [[20, 40, 140], [200, 30, 30], [30, 140, 60], [240, 200, 20]]
    const { texturen, export: exp } = texturenVoor(f, kleuren[kleur++ % kleuren.length])
    const voor = boom(join(NEP, 'Vehicles'))
    const t1 = performance.now()
    const u = plaatsLak(omgeving, { familie: f, project: p, naam, texturen })
    const tPlaats = performance.now() - t1
    const rij: Record<string, unknown> = {
      bus: b.naam,
      leden: f.leden.length,
      ki: f.leden.filter((l) => !l.bestuurbaar).length,
      nietOp: f.nietOp,
      doelen: f.doelen.map((d) => `${d.naam} ${d.uitB}x${d.uitH}${d.low ? ' +low' : ''}${d.lowPlekken.length ? ` lowplek ${d.lowPlekken.map((x) => x.plek).join('/')}` : ''}`),
      export: exp,
      familieMs: Math.round(tFam),
      plaatsMs: Math.round(tPlaats)
    }
    if (!('ok' in u)) {
      rij.fout = u
      klopt(`P1 ${b.naam}: geplaatst`, false)
      rijen.push(rij)
      continue
    }
    rij.nnnn = u.nnnn
    rij.setvars = u.plan.setvars
    klopt(
      `P1 ${b.naam}: doelen ${f.doelen.map((d) => `${d.naam} ${d.uitB}x${d.uitH}`).join(', ')} = verwacht ${b.verwacht.join(', ')}`,
      f.doelen.length === b.verwacht.length && b.verwacht.every((v) => f.doelen.some((d) => d.stam.toLowerCase() === v.toLowerCase()))
    )
    // De familieleden die §9 P1 noemt: de Hybrid, de O530 met 3 deuren, de KI-C2's.
    const bijzonder = f.leden.filter((l) => /Hybrid|3 Doors|_KI_/i.test(l.rel))
    if (bijzonder.length) {
      const met = bijzonder.filter((l) => (leesKleurstellingen(l.cfg, l.busmap)?.lijst ?? []).some((x) => omsiHoofdletters(x.naam) === omsiHoofdletters(naam)))
      rij.bijzonder = bijzonder.map((l) => `${l.rel.split('\\').pop()}: ${met.includes(l) ? 'ja' : 'nee'}`)
      klopt(`P1 ${b.naam}: ${met.length} van ${bijzonder.length} (Hybrid / 3 deuren / KI) dragen de naam: ${(rij.bijzonder as string[]).join(', ')}`, met.length === bijzonder.length)
    }
    klopt(`P1 ${b.naam}: plaatsen ≤ 2 s (${Math.round(tPlaats)} ms)`, tPlaats <= 2000)

    // Per lid (alle cfg's die een map lezen): de naam één keer, op het nummer van ervoor, en alle lakplekken gevuld.
    const doelKeys = new Map(f.doelen.map((d) => [d.sleutel, d]))
    let ledenMet = 0
    let fout = ''
    for (const lid of f.leden) {
      const k = leesKleurstellingen(lid.cfg, lid.busmap)
      const met = (k?.lijst ?? []).filter((x) => omsiHoofdletters(x.naam) === omsiHoofdletters(naam))
      const uitgesloten = f.nietOp.some((n) => n.bus === lid.rel)
      const lakplekken = lid.plekken.filter((pl) => doelKeys.has(pl.pad ? pl.pad.toLowerCase() : `naam:${pl.standaard.toLowerCase()}`))
      if (met.length > 1) fout ||= `${lid.rel}: naam ${met.length} keer`
      if (met.length === 1) {
        ledenMet++
        if (uitgesloten) fout ||= `${lid.rel}: uitgesloten maar heeft de naam`
        if (met[0].index !== u.plan.index[lid.rel]) fout ||= `${lid.rel}: index ${met[0].index}, verwacht ${u.plan.index[lid.rel]}`
        for (const pl of lakplekken) {
          const pad = met[0].texturen[pl.plek]
          if (!pad || !/Lakstudio[\\/]\d{4}_/.test(pad)) fout ||= `${lid.rel}: lakplek ${pl.plek} niet gevuld`
        }
      } else if (!uitgesloten && lakplekken.length > 0) fout ||= `${lid.rel}: heeft lakplekken maar niet de naam`
    }
    rij.ledenMetNaam = ledenMet
    klopt(`P1 ${b.naam}: per cfg de naam één keer, index = aantal ervoor, alle lakplekken gevuld (${ledenMet} leden)${fout ? ` -- ${fout}` : ''}`, !fout && ledenMet > 0)

    // De .cti's: geen BOM, alleen CRLF, rondreis cp1252, setvars alleen onder de regel en na alle items.
    let ctiFout = ''
    for (const c of u.plan.cti) {
      const vol = join(NEP, ...c.rel.split('/'))
      const r = leesCti(vol)
      const tekst = ctiTekst({ naam, nnnn: u.nnnn, datum: r.items.length ? readFileSync(vol, 'latin1').match(/Gemaakt (\S+)\./)?.[1] ?? '' : '', items: c.items, setvars: c.setvars })
      if (r.bom) ctiFout ||= 'BOM'
      if (!r.crlf) ctiFout ||= 'niet alleen CRLF'
      if (iconv.decode(readFileSync(vol), 'win1252') !== tekst) ctiFout ||= 'rondreis cp1252 anders'
      if (!r.setvarNaItem) ctiFout ||= 'setvar vóór een item'
      if (r.setvars.length > 0 && !f.optiesMogelijk) ctiFout ||= 'setvars zonder de regel'
      const namen = new Set(r.items.map((x) => omsiHoofdletters(x.naam)))
      if (namen.size !== 1) ctiFout ||= 'meer dan één naam'
      const plekken = r.items.map((x) => omsiHoofdletters(x.plek))
      if (new Set(plekken).size !== plekken.length) ctiFout ||= 'een plek twee keer'
      for (const it of r.items) if (it.pad.includes('..') || /^[\\/]|^[a-z]:/i.test(it.pad)) ctiFout ||= `pad ${it.pad}`
      rij.setvarsInCti = (rij.setvarsInCti as number ?? 0) + r.setvars.length
    }
    klopt(`P1 ${b.naam}: .cti zonder BOM, CRLF, cp1252, setvars na de items en onder de regel${ctiFout ? ` -- ${ctiFout}` : ''}`, !ctiFout)

    // P2 op de geplaatste texturen.
    for (const t of texturen) p2(b.naam, f, t.doel, t.dds, t.rgba)

    // P9: eigen in busKleurstellingen (via eigenKleurstellingen), binnen 1 s; kleurVars geeft dat nummer.
    const t9 = performance.now()
    const eigen = eigenKleurstellingen(join(NEP, b.rel))
    const lijst = kleurstellingenVanBus(join(NEP, b.rel))
    const gevonden = zoekKleurstelling(lijst, naam)
    const t9ms = performance.now() - t9
    klopt(`P9 ${b.naam}: naam in de lijst met eigen binnen 1 s (${Math.round(t9ms)} ms), nummer ${gevonden?.index} = ${u.plan.index[b.rel]}`, eigen.has(omsiHoofdletters(naam)) && t9ms < 1000 && gevonden?.index === u.plan.index[b.rel])

    // P8(b): verwijderen zet alles terug.
    const v = verwijderLak(omgeving, p.id)
    const na = boom(join(NEP, 'Vehicles'))
    const verschil = boomGelijk(voor, na)
    klopt(`P8b ${b.naam}: na plaatsen en verwijderen dezelfde sha1-boom${verschil.length ? ` -- ${verschil.slice(0, 4).join(', ')}` : ''}`, 'ok' in v && verschil.length === 0)
    rijen.push(rij)
  }
  uitslag.P1 = rijen
}

const p2rijen: Array<Record<string, unknown>> = []
function p2(bus: string, f: Familie, doel: string, dds: Uint8Array, origineel: Uint8Array): void {
  const d = f.doelen.find((x) => x.id === doel)!
  const kop = leesDdsKop(dds)!
  const t = textuurKop(dds, dds.length)
  const leesbaar = !('klacht' in t) && t.b === d.uitB && t.h === d.uitH && t.mips === kop.niveaus
  // Elk niveau terug met de lezer van de app (een DDS van één niveau per keer).
  let psnrRgb = Infinity
  let psnrAlfa = Infinity
  let alleNiveaus = true
  const bron = ontleedTextuur(dds).textuur
  let vierKleuren = true
  if (kop.formaat === 'bc1') {
    for (const pl of kop.plakken) {
      for (let o = pl.off; o < pl.off + pl.len; o += 8) {
        const c0 = dds[o] | (dds[o + 1] << 8)
        const c1 = dds[o + 2] | (dds[o + 3] << 8)
        const idx = dds[o + 4] | dds[o + 5] | dds[o + 6] | dds[o + 7]
        if (c0 < c1 || (c0 === c1 && idx !== 0)) vierKleuren = false
      }
    }
  }
  for (let i = 0; i < kop.niveaus; i++) {
    const pl = kop.plakken[i]
    const een = new Uint8Array(128 + pl.len)
    een.set(ddsKop(pl.b, pl.h, 1, kop.formaat!), 0)
    een.set(dds.subarray(pl.off, pl.off + pl.len), 128)
    if (!ontleedTextuur(een).textuur) alleNiveaus = false
  }
  // PSNR tegen de RGBA8 waaruit hij gemaakt is (niveau 0).
  if (bron) {
    let se = 0
    let sa = 0
    for (let i = 0; i < origineel.length; i += 4) {
      for (let k = 0; k < 3; k++) se += (origineel[i + k] - bron.pixels[i + k]) ** 2
      sa += (origineel[i + 3] - bron.pixels[i + 3]) ** 2
    }
    const n = origineel.length / 4
    psnrRgb = 10 * Math.log10((255 * 255) / (se / (3 * n)))
    psnrAlfa = sa === 0 ? 99 : 10 * Math.log10((255 * 255) / (sa / n))
  }
  const low = d.low ? lowUitDds(dds) : undefined
  const lowGoed = !low || Buffer.from(low.subarray(128)).equals(Buffer.from(dds.subarray(kop.plakken[1].off)))
  const volle = kop.niveaus === Math.floor(Math.log2(Math.max(kop.b, kop.h))) + 1
  const bc1Juist = kop.formaat === 'bc3' || (bron ? bron.pixels.every((v, i) => (i & 3) !== 3 || v === 255) : false)
  p2rijen.push({ bus, doel: d.naam, formaat: kop.formaat, maat: `${kop.b}x${kop.h}`, niveaus: kop.niveaus, psnrRgb: +psnrRgb.toFixed(2), psnrAlfa: +psnrAlfa.toFixed(2), low: Boolean(low) })
  klopt(
    `P2 ${bus} ${d.naam}: DX9 ${kop.fourcc}, geen DX10, volle keten (${kop.niveaus}), elk niveau terug te lezen, kop voor Bus3D; ` +
      `PSNR RGB ${psnrRgb.toFixed(1)} ≥ 35, alfa ${psnrAlfa.toFixed(1)} ≥ 50; _#low ${low ? 'byte-gelijk' : 'geen'}; ${kop.formaat === 'bc1' ? `BC1 zonder alfa, 4-kleuren ${vierKleuren}` : 'BC3'}`,
    !kop.dx10 && kop.compleet && volle && alleNiveaus && leesbaar && psnrRgb >= 35 && psnrAlfa >= 50 && lowGoed && bc1Juist && vierKleuren
  )
}

/* ------------------------------------------------------------------ P8 */

async function p8(): Promise<void> {
  const rel = 'Vehicles\\MAN_SD200\\MAN_SD77.bus'
  const f = await familieMet(rel)
  const { texturen } = texturenVoor(f, [10, 90, 200])
  const naam = 'Lakstudio Proef P8'
  // (a) Een bestaand bestand op een doelpad: 0 schrijfacties en 'bestaat'.
  const pa = project(rel, naam)
  const plan = lakPlan(omgeving, { familie: f, project: pa, naam, texturen, nnnn: 9001, datum: new Date() })
  if ('plan' in plan) {
    const eerste = plan.plan.bestanden[0].rel
    // Hetzelfde nummer afdwingen: de teller op 9000, zodat plaatsLak 9001 kiest.
    writeFileSync(join(UD, 'lakstudio', 'teller.json'), JSON.stringify({ laatste: 9000 }))
    const vreemd = join(NEP, ...eerste.split('/'))
    mkdirSync(dirname(vreemd), { recursive: true })
    writeFileSync(vreemd, 'van iemand anders')
    const voor = boom(join(NEP, 'Vehicles'))
    const u = plaatsLak(omgeving, { familie: f, project: pa, naam, texturen })
    const na = boom(join(NEP, 'Vehicles'))
    klopt(`P8a bestaand bestand op een doelpad: 'bestaat', 0 schrijfacties`, 'fout' in u && u.fout === 'bestaat' && boomGelijk(voor, na).length === 0)
    rmSync(dirname(vreemd), { recursive: true, force: true })
    let m = dirname(dirname(vreemd))
    // Lege mappen van de proef zelf weer weg.
    for (let i = 0; i < 2; i++) {
      try {
        if (readdirSync(m).length === 0) rmSync(m, { recursive: true })
      } catch {
        // al weg
      }
      m = dirname(m)
    }
    writeFileSync(join(UD, 'lakstudio', 'teller.json'), JSON.stringify({ laatste: 0 }))
  } else klopt('P8a: plan', false)

  // (c) Opnieuw opslaan houdt het nummer (en de bestandsnaam van de .cti).
  const pc = project(rel, 'Lakstudio Proef P8c')
  const eerst = plaatsLak(omgeving, { familie: f, project: pc, naam: pc.naam, texturen })
  const ctiEerst = 'ok' in eerst ? eerst.plan.cti.map((c) => c.rel) : []
  const indexEerst = 'ok' in eerst ? eerst.index : -1
  const tweede = texturenVoor(f, [220, 220, 220]).texturen
  const pc2 = { ...pc, geplaatst: 'ok' in eerst ? { naam: pc.naam, nnnn: eerst.nnnn, versie: eerst.versie } : undefined }
  const opnieuw = plaatsLak(omgeving, { familie: await familieMet(rel, { eigenCti: ctiEerst[0]?.split('/').pop() }), project: pc2, naam: 'Andere naam genegeerd', texturen: tweede })
  klopt(
    `P8c opnieuw opslaan: zelfde nummer ${'ok' in eerst ? eerst.nnnn : '?'} = ${'ok' in opnieuw ? opnieuw.nnnn : JSON.stringify(opnieuw)}, zelfde .cti, zelfde index, versie 2`,
    'ok' in eerst && 'ok' in opnieuw && eerst.nnnn === opnieuw.nnnn && opnieuw.versie === 2 && opnieuw.index === indexEerst &&
      JSON.stringify(opnieuw.plan.cti.map((c) => c.rel)) === JSON.stringify(ctiEerst)
  )
  const oudeTexturen = 'ok' in eerst ? eerst.plan.bestanden.filter((b) => b.soort === 'textuur').map((b) => b.rel) : []
  klopt('P8c de texturen van versie 1 zijn weg', oudeTexturen.every((r) => !existsSync(join(NEP, ...r.split('/')))))

  // (d) Eén met de hand gewijzigde textuur: opnieuw opslaan en verwijderen raken niets aan tot de speler kiest.
  if ('ok' in opnieuw) {
    const tex = opnieuw.plan.bestanden.find((b) => b.soort === 'textuur')!
    const pad = join(NEP, ...tex.rel.split('/'))
    const inhoud = readFileSync(pad)
    inhoud[200] ^= 0xff
    writeFileSync(pad, inhoud)
    const voor = boom(join(NEP, 'Vehicles'))
    const pc3 = { ...pc2, geplaatst: { naam: pc.naam, nnnn: opnieuw.nnnn, versie: opnieuw.versie } }
    const r1 = plaatsLak(omgeving, { familie: f, project: pc3, naam: pc.naam, texturen })
    const r2 = verwijderLak(omgeving, pc.id)
    const na = boom(join(NEP, 'Vehicles'))
    klopt(
      `P8d handmatig gewijzigd: opnieuw opslaan en verwijderen geven 'handmatig' en raken 0 bestanden aan`,
      'fout' in r1 && r1.fout === 'handmatig' && 'fout' in r2 && r2.fout === 'handmatig' && boomGelijk(voor, na).length === 0
    )
    const r3 = verwijderLak(omgeving, pc.id, { keuze: 'alles' })
    klopt(`P8d na [Alles weghalen] is alles weg`, 'ok' in r3 && !existsSync(pad))
  }

  // (e) Afbreken na elke schrijfstap: nooit een .cti die naar een ontbrekend bestand wijst.
  const pe = project(rel, 'Lakstudio Proef P8e')
  const volgorde: string[] = []
  const bestaandBijCti: boolean[] = []
  const fe = await familieMet(rel)
  const ue = plaatsLak(omgeving, {
    familie: fe,
    project: pe,
    naam: pe.naam,
    texturen,
    kopieerHaak: (bronPad) => {
      volgorde.push(bronPad)
      if (/\.cti$/i.test(bronPad)) {
        // Alle texturen die deze .cti noemt, staan er al op het moment dat hij geschreven wordt.
        const staging = readFileSync(join(UD, 'lakstudio', pe.id, 'versies', '1', 'omsi', ...bronPad.split('/')))
        const r = iconv.decode(staging, 'win1252').split('\r\n')
        for (let i = 0; i < r.length; i++) {
          if (r[i] !== '[item]') continue
          const doel = join(NEP, ...bronPad.split('/').slice(0, -1), ...r[i + 3].split('\\'))
          bestaandBijCti.push(existsSync(doel))
          i += 3
        }
      }
    }
  })
  const laatste = volgorde.findIndex((p) => /\.cti$/i.test(p))
  klopt(
    `P8e de .cti als laatste geschreven (${volgorde.length} bestanden, .cti op ${laatste + 1}), en al zijn texturen stonden er toen`,
    'ok' in ue && laatste === volgorde.length - 1 && bestaandBijCti.length > 0 && bestaandBijCti.every(Boolean)
  )
  const reg8 = leesRegister(UD).addons.find((a) => a.lak?.projectId === pe.id)
  klopt('P8e in het register staat de .cti voorop (verwijderen haalt hem eerst weg)', Boolean(reg8 && /\.cti$/i.test(reg8.bestanden[0].pad)))
  verwijderLak(omgeving, pe.id)

  // (f) Twee tegelijk (add-on en lak) geeft 'bezig'.
  const grendel = maakGrendel()
  let los: () => void = () => undefined
  const lang = grendel.probeer(() => new Promise<string>((k) => (los = () => k('klaar'))), 'add-on')
  const tweedeKlus = await grendel.probeer(async () => 'lak', 'lak')
  los()
  klopt(`P8f twee klussen tegelijk: de tweede krijgt 'bezig'`, typeof tweedeKlus === 'object' && tweedeKlus.fout === 'bezig' && (await lang) === 'klaar')
}

/* ------------------------------------------------------------------ P9: de Hybrid alleen als hij gebakken is */

async function p9(): Promise<void> {
  const rel = 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus'
  const hybrid = 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_Hybrid_main.bus'
  // Alsof de Hybrid-achterwagen niet te bakken is (en geen ander lid zijn textuur heeft).
  const f = await familieMet(rel, {
    wijzig: (r, i) => (/Hybrid_trail/i.test(r) ? { ...i, bakbaar: 'versleuteld' } : i)
  })
  const naam = 'Lakstudio Proef P9'
  const p = project(rel, naam)
  const { texturen } = texturenVoor(f, [90, 20, 120])
  const u = plaatsLak(omgeving, { familie: f, project: p, naam, texturen })
  const eigenHybrid = eigenKleurstellingen(join(NEP, hybrid))
  const eigenGewoon = eigenKleurstellingen(join(NEP, rel))
  klopt(
    `P9 de Hybrid-.bus krijgt eigen alleen als de Hybrid-achterwagen gebakken is (niet gebakken: ${eigenHybrid.has(omsiHoofdletters(naam)) ? 'wel' : 'niet'} eigen; de gewone GN: ${eigenGewoon.has(omsiHoofdletters(naam)) ? 'wel' : 'niet'})`,
    'ok' in u && !eigenHybrid.has(omsiHoofdletters(naam)) && eigenGewoon.has(omsiHoofdletters(naam))
  )
  if ('ok' in u) verwijderLak(omgeving, p.id)
}

/* ------------------------------------------------------------------ P13 */

async function p13(): Promise<void> {
  // Geen [CTC]: knop uit (geenCtc), niets geschreven.
  const gs = familieVan(NEP, 'Vehicles\\VA_GS_Hochflurer\\GS_GU240.bus', { sjablonen: false })
  const pg = project('Vehicles\\VA_GS_Hochflurer\\GS_GU240.bus', 'Lakstudio Proef GS')
  const ug = plaatsLak(omgeving, { familie: gs, project: pg, naam: pg.naam, texturen: [] })
  klopt('P13 bus zonder [CTC]: geenCtc, niets geschreven', Boolean(gs.geenCtc) && 'fout' in ug && ug.fout === 'geenCtc')

  // C2 E5 GN: de CTC-map ontbreekt; hij wordt aangemaakt en de lak krijgt index 0.
  const e5 = 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E5_Gn_main.bus'
  const map = join(NEP, 'Vehicles', 'MB_C2_EN_BVG', 'Texture', 'Repaints', 'rep_GN_E5')
  const ontbrak = !existsSync(map)
  const f = await familieMet(e5)
  const pe = project(e5, 'Lakstudio Proef E5')
  const { texturen } = texturenVoor(f, [0, 120, 200])
  const ue = plaatsLak(omgeving, { familie: f, project: pe, naam: pe.naam, texturen })
  const lijst = kleurstellingenVanBus(join(NEP, e5))
  klopt(
    `P13 C2 E5 GN: de map ontbrak (${ontbrak}), is aangemaakt, één kleurstelling met index 0 (${'ok' in ue ? `${lijst?.lijst.length} kleurstelling(en), index ${lijst?.lijst[0]?.index}` : JSON.stringify(ue)})`,
    ontbrak && 'ok' in ue && existsSync(map) && lijst?.lijst.length === 1 && lijst.lijst[0].index === 0
  )
  if ('ok' in ue) verwijderLak(omgeving, pe.id)
  klopt('P13 C2 E5 GN: na verwijderen is de map weer weg', !existsSync(map))

  // Conflicten: HH109_Stadtbus_VHHPVG_AI en HC_C2_parked.
  for (const rel of ['Vehicles\\HH109_Stadtbus_VHHPVG_AI\\HHStadtbus_PVG_AI.bus', 'Vehicles\\HC_C2_parked\\HC_C2G_main.bus']) {
    const fc = await familieMet(rel)
    const pc = project(rel, `Lakstudio Proef conflict`)
    const voor = boom(join(NEP, 'Vehicles'))
    const { texturen: tc } = texturenVoor(fc, [50, 50, 50])
    const uc = plaatsLak(omgeving, { familie: fc, project: pc, naam: pc.naam, texturen: tc })
    klopt(
      `P13 ${rel.split('\\')[1]}: ls.conflict (${fc.conflicten.map((c) => c.plek).join(', ')}), niets geschreven`,
      'fout' in uc && uc.fout === 'conflict' && boomGelijk(voor, boom(join(NEP, 'Vehicles'))).length === 0
    )
  }

  // NG313 vanuit een start met een ander interieur voor en achter: geen conflict.
  const ng = 'Vehicles\\MAN_NL_NG_263\\MAN_NG313_main.bus'
  // Een start met items naast de wagenkast (ruiten-dooraanzicht, wielen, lampen): die komen mee, de wagenkast niet.
  const start = kleurstellingenVanBus(join(NEP, ng))?.lijst.find((k) => Object.keys(k.texturen).length > 3)
  const fn = await familieMet(ng, { start: start?.naam })
  const pn = project(ng, 'Lakstudio Proef NG313', {}, 'effenKleuren', start?.naam)
  const { texturen: tn } = texturenVoor(fn, [200, 120, 0])
  const un = plaatsLak(omgeving, { familie: fn, project: pn, naam: pn.naam, texturen: tn })
  const uitStart = 'ok' in un ? un.plan.cti.flatMap((c) => c.items).filter((i) => !i.pad.startsWith('Lakstudio')) : []
  klopt(
    `P13 NG313 vanuit "${start?.naam}" (farbschema_Innenraum is voor NG313_2.tga, achter NG313_2_H.tga): geen ls.conflict, ` +
      `${uitStart.length} item(s) uit de start (${uitStart.map((i) => i.plek).join(', ')}), ${'ok' in un ? un.plan.afhankelijk.length : 0} afhankelijk` +
      ('ok' in un ? '' : ` -- ${JSON.stringify(un).slice(0, 400)}`),
    'ok' in un && fn.conflicten.length === 0 && uitStart.length > 0
  )
  if ('ok' in un) verwijderLak(omgeving, pn.id)
}

/* ------------------------------------------------------------------ P15 */

async function p15(): Promise<void> {
  const rel = 'Vehicles\\MAN_NL_NG\\MAN_EN92_main.bus'
  const f = await familieMet(rel)
  const { texturen } = texturenVoor(f, [0, 0, 160])
  const naam = 'Lakstudio Proef P15'
  const p = project(rel, naam)
  const voor = boom(join(NEP))
  // OMSI "draait" (nep): klaarzetten, niets in de OMSI-kopie.
  const k = klaarzetten(omgeving, { familie: f, project: p, naam, texturen })
  const na = boom(join(NEP))
  const staging = existsSync(join(UD, 'lakstudio', p.id, 'versies', '1', 'omsi'))
  const w = leesWachtrij(UD)
  klopt(`P15 klaarzetten met OMSI "draaiend": 0 schrijfacties in de OMSI-kopie, wel een staging en een regel in de wachtrij`, 'klaargezet' in k && boomGelijk(voor, na).length === 0 && staging && w.some((x) => x.projectId === p.id))
  // OMSI "dicht": de wachtrij geplaatst.
  const t0 = performance.now()
  const r = verwerkWachtrij(omgeving, () => f, () => false)
  const ms = performance.now() - t0
  const lijst = kleurstellingenVanBus(join(NEP, rel))
  klopt(
    `P15 na "afsluiten" geplaatst (${Math.round(ms)} ms; main kijkt elke 20 s, dus ≤ 35 s), uit de wachtrij, de naam in OMSI`,
    r.length === 1 && 'ok' in r[0].uitkomst && leesWachtrij(UD).length === 0 && Boolean(zoekKleurstelling(lijst, naam))
  )
  // Een naam die intussen bezet is: blijft in de wachtrij met de reden.
  const p2 = project(rel, 'Lakstudio Proef P15b')
  klaarzetten(omgeving, { familie: f, project: p2, naam: 'Lakstudio Proef P15b', texturen })
  // Iemand anders zet een .cti met die naam in de map.
  const ctiMap = f.mappen[0]
  writeFileSync(join(ctiMap, 'zz_iemand.cti'), '[item]\r\nlakstudio proef p15B\r\nfarbschema_tex1\r\nEN92_1.tga\r\n')
  const f2 = await familieMet(rel)
  const r2 = verwerkWachtrij(omgeving, () => f2, () => false)
  const w2 = leesWachtrij(UD)
  klopt(`P15 een naam die intussen bezet is (na UpperCase) blijft in de wachtrij met de reden (${w2[0]?.reden})`, r2.length === 1 && 'fout' in r2[0].uitkomst && w2.length === 1 && /naam/.test(w2[0].reden ?? ''))
  rmSync(join(ctiMap, 'zz_iemand.cti'), { force: true })
  // Opruimen.
  verwijderLak(omgeving, p.id)
  writeFileSync(join(UD, 'lakstudio', 'wachtrij.json'), JSON.stringify({ lakken: [] }))
}

/* ------------------------------------------------------------------ P16 (de indeling) */

function p16(): void {
  const hh3t = lakOpties(familieVan(NEP, 'Vehicles\\HH20_EBus2021\\HHEBus2021_3T_main.bus', { sjablonen: false }))
  const hh = lakOpties(familieVan(NEP, 'Vehicles\\HH20_EBus2021\\HHEBus2021_main.bus', { sjablonen: false }))
  const c2 = lakOpties(familieVan(NEP, 'Vehicles\\MB_C2_EN_BVG\\MB_C2_E6_Gn_main.bus', { sjablonen: false }))
  const nlc = lakOpties(familieVan(NEP, 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus', { sjablonen: false }))
  const zoek = (l: ReturnType<typeof lakOpties>, v: string): ReturnType<typeof lakOpties>[number] | undefined =>
    l.find((o) => o.variabele.toLowerCase() === v.toLowerCase())
  const hide = zoek(hh, 'hide_hochbahn_ext') ?? zoek(hh3t, 'hide_hochbahn_ext')
  const decal = zoek(hh3t, 'decal_ebus_rear') ?? zoek(hh, 'decal_ebus_rear')
  const tuer = zoek(c2, 'Tuer2_IST_SST')
  // De NLC noemt hem in de .cti vis_CTI_Sitztyp; setvar.osc maakt er vis_Sitztyp van (bus3d-ontwerp §5.2, de alias).
  const sitz = zoek(nlc, 'vis_CTI_Sitztyp') ?? zoek(nlc, 'vis_Sitztyp')
  uitslag.P16 = { hide, decal, tuer, sitz, nlc: nlc.map((o) => `${o.variabele}=${o.soort}`), hh20_3t: hh3t.map((o) => `${o.variabele}=${o.soort}`) }
  klopt(`P16 HH20 hide_hochbahn_ext uiterlijk, verbergwaarde 1 (${hide?.soort}, ${hide?.verberg})`, hide?.soort === 'uiterlijk' && hide.verberg === 1)
  /*
   * decal_ebus_rear: de mesh (21_3T_decal_heckscheibe.o3d, model_21_3T.cfg:2477-2484) staat er bij waarde 1;
   * de niet-HHA-lakken zetten 1 en tonen hem dus. De verbergwaarde is 0 (het ontwerp las "zet 1" als verbergen).
   */
  klopt(`P16 HH20 decal_ebus_rear uiterlijk, verbergwaarde 0 (${decal?.soort}, ${decal?.verberg})`, decal?.soort === 'uiterlijk' && decal.verberg === 0)
  klopt(`P16 C2 Tuer2_IST_SST techniek (${tuer?.soort})`, tuer?.soort === 'techniek')
  klopt(`P16 NLC ${sitz?.variabele ?? 'vis_Sitztyp'} techniek (${sitz?.soort ?? 'niet gevonden'})`, sitz?.soort === 'techniek')
}

/* ------------------------------------------------------------------ P5: [texcoordtrans] op lakmeshes */

function p5texcoord(): void {
  const per: Record<string, number> = {}
  for (const b of BUSSEN) {
    const f = familieVan(NEP, b.rel, { sjablonen: false })
    const t = texcoordtransTelling(f)
    per[b.naam] = Object.values(t).reduce((a, x) => a + x, 0)
  }
  uitslag.P5texcoord = per
  const som = Object.values(per).reduce((a, x) => a + x, 0)
  // Het lakdoek rastert de uv zonder [texcoordtrans] (§4.3); bij 0 lakmeshes klopt dat voor elke texel.
  klopt(`P5 lakmeshes met [texcoordtrans] geteld: ${som} (${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', ')}); 0 = het lakdoek hoeft ze niet te tekenen`, som === 0)
}

/* ------------------------------------------------------------------ wezen */

async function pWees(): Promise<void> {
  const rel = 'Vehicles\\MAN_SD200\\MAN_SD77.bus'
  const f = await familieMet(rel)
  const { texturen } = texturenVoor(f, [0, 0, 0])
  const p = project(rel, 'Lakstudio Proef wees')
  const u = plaatsLak(omgeving, { familie: f, project: p, naam: p.naam, texturen })
  // Het register "kwijt" (een andere installatie): de .cti is dan een wees.
  const register = readFileSync(join(UD, 'addons.json'))
  writeFileSync(join(UD, 'addons.json'), JSON.stringify({ addons: [] }))
  const w = wezen(omgeving)
  const deze = w.find((x) => x.naam === p.naam)
  klopt(`wezen: de .cti zonder register is een wees met ${deze?.bestanden.length} bestand(en)`, 'ok' in u && Boolean(deze) && deze!.bestanden.length === texturen.length)
  if (deze) weesWeg(omgeving, deze.id)
  const lijst = kleurstellingenVanBus(join(NEP, rel))
  klopt('wezen: [Verwijderen] haalt de .cti en zijn texturen weg', !zoekKleurstelling(lijst, p.naam) && (u as { plan?: { bestanden: Array<{ rel: string }> } }).plan!.bestanden.every((b) => !existsSync(join(NEP, ...b.rel.split('/')))))
  writeFileSync(join(UD, 'addons.json'), JSON.stringify({ addons: JSON.parse(register.toString()).addons.filter((a: { lak?: { projectId: string } }) => a.lak?.projectId !== p.id) }))
}

/* ------------------------------------------------------------------ herstel na de tegenlezing van L3 */

/**
 * Wat de proefdraaier en de tegenlezer van L3 vonden, nagespeeld op de
 * nagebootste map: onzichtbare tekens in de naam (punt 8), een lege DDS van een
 * verloren context (punt 1), een `versie` die van de renderer komt (punt 10),
 * opnieuw opslaan dat halverwege een uitzondering gooit (punt 3), een oude regel
 * in de wachtrij na direct plaatsen (punt 15), elke uiterlijk-variabele expliciet
 * in de .cti (§4.9, proefdraaier punt 4), en in main (main/lakstudio.ts, met een
 * nagebootste IPC): de wachtrij met de maat van de start (punt 2), OMSI die start
 * terwijl de wachtrij rekent (punt 5), en [Alles laten staan] zonder gebeurtenis
 * (proefdraaier punt 10).
 */
async function pHerstel(): Promise<void> {
  // Punt 8: vaste spatie en zacht afbreekstreepje.
  const nbsp = naamFout('Stadtwerke\u00a0Lucstad')
  const alleen = naamFout('\u00a0')
  const zacht = naamFout('Lucstad\u00ad')
  klopt(
    `herstel 8: een vaste spatie of zacht afbreekstreepje in de naam is een fout (${nbsp?.fout}, ${alleen?.fout}, ${zacht?.fout}); bij het invullen wordt "A\\u00a0B" "${cp1252Vriendelijk('A\u00a0B')}"`,
    nbsp?.fout === 'teken' && alleen?.fout === 'teken' && zacht?.fout === 'teken' && cp1252Vriendelijk('A\u00a0B') === 'A B'
  )

  // Punt 1: een DDS die helemaal nul is (uitgelezen op een verloren context) komt niet in OMSI.
  const rel = 'Vehicles\\MAN_SD200\\MAN_SD77.bus'
  const f = await familieMet(rel)
  const { texturen } = texturenVoor(f, [30, 60, 120])
  const d0 = f.doelen[0]
  const leeg = schrijfDds(
    d0.uitB,
    d0.uitH,
    'bc3',
    niveauMaten(d0.uitB, d0.uitH, Math.floor(Math.log2(Math.max(d0.uitB, d0.uitH))) + 1).map((m) => new Uint8Array(niveauBytes(m.b, m.h, 'bc3')))
  )
  const pl = project(rel, 'Lakstudio Herstel leeg')
  const voor1 = boom(join(NEP, 'Vehicles', 'MAN_SD200'))
  const u1 = plaatsLak(omgeving, { familie: f, project: pl, naam: pl.naam, texturen: texturen.map((t) => (t.doel === d0.id ? { doel: t.doel, dds: leeg } : t)) })
  klopt(
    `herstel 1: een lege DDS (zwart, alfa 0) wordt geweigerd (${'fout' in u1 ? `${u1.fout}: ${u1.detail}` : 'geplaatst'}), 0 schrijfacties`,
    'fout' in u1 && u1.fout === 'formaat' && boomGelijk(voor1, boom(join(NEP, 'Vehicles', 'MAN_SD200'))).length === 0
  )

  // Punt 10: een versie van de renderer ("../..") komt niet buiten de projectmap.
  const pv = { ...project(rel, 'Lakstudio Herstel versie'), geplaatst: { naam: 'x', nnnn: 1, versie: '../../../buiten' as unknown as number } }
  const u10 = plaatsLak(omgeving, { familie: f, project: pv, naam: pv.naam, texturen })
  const buiten = existsSync(join(UD, 'buiten')) || existsSync(join(UD, 'lakstudio', 'buiten'))
  klopt(`herstel 10: een versie "../../../buiten" wordt versie 1 (${'ok' in u10 ? u10.versie : JSON.stringify(u10)}), niets buiten de projectmap`, 'ok' in u10 && u10.versie === 1 && !buiten)

  // Punt 3: opnieuw opslaan dat halverwege een uitzondering gooit (een bestand dat vastzit): de vorige versie staat terug.
  if ('ok' in u10) {
    const naPlaatsen = boom(join(NEP, 'Vehicles', 'MAN_SD200'))
    const regVoor = leesRegister(UD).addons.find((a) => a.lak?.projectId === pv.id)
    const pv2 = { ...pv, geplaatst: { naam: pv.naam, nnnn: u10.nnnn, versie: u10.versie } }
    const anders = texturenVoor(f, [200, 40, 40]).texturen
    let gegooid = 0
    const u3 = plaatsLak(omgeving, {
      familie: await familieMet(rel, { eigenCti: u10.plan.cti[0].rel.split('/').pop() }),
      project: pv2,
      naam: pv.naam,
      texturen: anders,
      kopieerHaak: () => {
        gegooid++
        const f2 = new Error('EBUSY: resource busy or locked (nagebootst)') as NodeJS.ErrnoException
        f2.code = 'EBUSY'
        throw f2
      }
    })
    const naFout = boom(join(NEP, 'Vehicles', 'MAN_SD200'))
    const regNa = leesRegister(UD).addons.find((a) => a.lak?.projectId === pv.id)
    const lijst = kleurstellingenVanBus(join(NEP, rel))
    klopt(
      `herstel 3: opnieuw opslaan dat halverwege gooit (${'fout' in u3 ? u3.fout : 'ok?'}, ${gegooid} keer) zet de vorige versie terug: dezelfde bestanden (${boomGelijk(naPlaatsen, naFout).length} anders), in het register (versie ${regNa?.lak?.versie}), en in OMSI`,
      'fout' in u3 && boomGelijk(naPlaatsen, naFout).length === 0 && regNa?.lak?.versie === regVoor?.lak?.versie && Boolean(zoekKleurstelling(lijst, pv.naam))
    )
    verwijderLak(omgeving, pv.id)
  }

  // Punt 15: na direct plaatsen staat er geen oude regel meer in de wachtrij.
  const pw = project(rel, 'Lakstudio Herstel wachtrij')
  klaarzetten(omgeving, { familie: f, project: pw, naam: pw.naam, texturen })
  const u15 = plaatsLak(omgeving, { familie: f, project: pw, naam: pw.naam, texturen })
  klopt(`herstel 15: na direct plaatsen staat de lak niet meer in de wachtrij (${leesWachtrij(UD).filter((w) => w.projectId === pw.id).length})`, 'ok' in u15 && !leesWachtrij(UD).some((w) => w.projectId === pw.id))
  verwijderLak(omgeving, pw.id)

  // §4.9: elke uiterlijk-variabele expliciet in de .cti (de O560: vis_wheels 1 zoals 3 van de 4 kleurstellingen; OMSI begint met 0).
  const o560 = 'Vehicles\\ABCoach_O560\\O560_E6.bus'
  const fo = await familieMet(o560)
  const po = project(o560, 'Lakstudio Herstel setvars', {}, 'snel', 'Stadtbus Haren')
  const uo = plaatsLak(omgeving, { familie: fo, project: po, naam: po.naam, texturen: texturenVoor(fo, [20, 60, 160]).texturen })
  const uiterlijk = lakOpties(fo).filter((o) => o.soort === 'uiterlijk')
  const cti = 'ok' in uo ? leesCti(join(NEP, ...uo.plan.cti[0].rel.split('/'))) : undefined
  const sv = new Map((cti?.setvars ?? []).map(([v, w]) => [v.toLowerCase(), w]))
  klopt(
    `herstel §4.9: de .cti schrijft elke uiterlijk-variabele (${uiterlijk.length}: ${uiterlijk.map((o) => `${o.variabele}=${sv.get(o.variabele.toLowerCase()) ?? '-'}`).join(', ')}), vis_wheels = 1, na de items`,
    Boolean(cti) && uiterlijk.every((o) => sv.has(o.variabele.toLowerCase())) && sv.get('vis_wheels') === '1' && cti!.setvarNaItem
  )
  if ('ok' in uo) verwijderLak(omgeving, po.id)

  // Main (main/lakstudio.ts) met een nagebootste IPC en een nagebootst 3D-venster.
  const kanalen = new Map<string, (e: unknown, ...a: unknown[]) => unknown>()
  let omsiDraait = false
  let draaitNaFamilie = false
  let veranderd = 0
  const main = maakLakstudio({ handle: (k: string, f2: (e: unknown, ...a: unknown[]) => unknown) => kanalen.set(k, f2) } as never, {
    omsi: () => NEP,
    userData: () => UD,
    log: (r) => logregels.push(r),
    logFout: (w, f2) => logregels.push(`FOUT ${w}: ${String(f2)}`),
    aan: () => true,
    omsiDraait: async () => omsiDraait,
    bus3d: () =>
      ({
        lakPakket: async (r: string) => {
          // Na het uitrekenen van de familie "start OMSI" (punt 5).
          if (draaitNaFamilie) omsiDraait = true
          const b = await bouwBus3d({ omsiMap: ECHT, relatiefPad: r, geregistreerd: reg })
          return b.bouw ? { manifest: b.bouw.manifest, kop: b.bouw.kop } : { reden: b.reden }
        },
        registreerLos: () => new Map(),
        kleurstellingenVeranderd: () => void veranderd++
      }) as never,
    venster: () => ({ vanStudio: () => true, vanHoofd: () => true, stuur: () => undefined }) as never,
    grendel: maakGrendel(),
    naarHoofd: () => undefined
  })

  // Punt 2: een start met een grotere textuur (TH O550, "Mueller (LIT-YP 22)": 2048² → 4096²). Klaargezet met de start;
  // main werkt de wachtrij af met de familie MET de start (eerst gaf dat elke 20 s 'formaat').
  const o550 = 'Vehicles\\TH_Ueberlandbus\\O550_Euro2.bus'
  const start = 'Mueller (LIT-YP 22)'
  const fz = await familieMet(o550)
  const fs = await familieMet(o550, { start })
  const pz = project(o550, 'Lakstudio Herstel start', {}, 'snel', start)
  const kz = klaarzetten(omgeving, { familie: fs, project: pz, naam: pz.naam, texturen: texturenVoor(fs, [10, 120, 60]).texturen })
  // Punt 5: OMSI start terwijl main de familie uitrekent: niets schrijven, de lak blijft wachten.
  draaitNaFamilie = true
  await main.omsiDicht('proef: OMSI start tijdens het rekenen')
  draaitNaFamilie = false
  const nogNiet = !zoekKleurstelling(kleurstellingenVanBus(join(NEP, o550)), pz.naam)
  klopt(
    `herstel 5: OMSI start terwijl de wachtrij de familie uitrekent: niets geschreven, de lak wacht nog (${leesWachtrij(UD).some((w) => w.projectId === pz.id)})`,
    'klaargezet' in kz && nogNiet && leesWachtrij(UD).some((w) => w.projectId === pz.id)
  )
  omsiDraait = false
  await main.omsiDicht('proef: OMSI dicht')
  const geplaatst = zoekKleurstelling(kleurstellingenVanBus(join(NEP, o550)), pz.naam)
  klopt(
    `herstel 2: de start maakt het doel ${fz.doelen[0]?.uitB}² → ${fs.doelen[0]?.uitB}²; main plaatst de klaargezette lak met die maat (${geplaatst ? `nr. ${geplaatst.index}` : `wacht: ${leesWachtrij(UD).find((w) => w.projectId === pz.id)?.reden}`})`,
    fs.doelen[0]?.uitB !== fz.doelen[0]?.uitB && Boolean(geplaatst) && !leesWachtrij(UD).some((w) => w.projectId === pz.id)
  )

  // Proefdraaier punt 10: [Alles laten staan] na een handmatige wijziging verandert niets, dus geen gebeurtenis.
  const reg10 = leesRegister(UD).addons.find((a) => a.lak?.projectId === pz.id)
  if (reg10) {
    const tex = reg10.bestanden.find((b) => /\.dds$/i.test(b.pad))!
    const pad = join(NEP, ...tex.pad.split('/'))
    const inhoud = readFileSync(pad)
    inhoud[300] ^= 0xff
    writeFileSync(pad, inhoud)
    const verwijder = kanalen.get('lak:verwijderHoofd')!
    const h = (await verwijder({}, pz.id, false)) as { fout?: string }
    const voorLaten = veranderd
    const l = (await verwijder({}, pz.id, false, 'laten')) as { ok?: boolean }
    const naLaten = veranderd
    const a = (await verwijder({}, pz.id, false, 'alles')) as { ok?: boolean }
    klopt(
      `herstel P10: handmatig gewijzigd → '${h.fout}'; [Alles laten staan] ${l.ok ? 'ok' : '?'} zonder gebeurtenis (${naLaten - voorLaten}); [Alles weghalen] ${a.ok ? 'ok' : '?'} met gebeurtenis (${veranderd - naLaten})`,
      h.fout === 'handmatig' && Boolean(l.ok) && naLaten === voorLaten && Boolean(a.ok) && veranderd > naLaten
    )
  } else klopt('herstel P10: de lak van punt 2 staat niet in het register', false)
  writeFileSync(join(UD, 'lakstudio', 'wachtrij.json'), JSON.stringify({ lakken: [] }))
}

/* ------------------------------------------------------------------ de ronde */

async function hoofd(): Promise<void> {
  const t0 = performance.now()
  maakNep()
  rmSync(UD, { recursive: true, force: true })
  mkdirSync(UD, { recursive: true })
  console.log(`nagebootste OMSI: ${NEP}\ngebruikersmap: ${UD}\n`)
  // De echte map blijft onaangeroerd: van een paar bestanden de tijd en grootte vooraf en achteraf.
  const echtVoor = ['Vehicles/MB_C2_EN_BVG/Texture/Repaints/rep_GN', 'Vehicles/MAN_SD200/Texture'].map((m) => statSync(join(ECHT, m)).mtimeMs)
  if (doe('P1')) await p1()
  if (doe('P8')) await p8()
  if (doe('P9')) await p9()
  if (doe('P13')) await p13()
  if (doe('P15')) await p15()
  if (doe('P16')) p16()
  if (doe('P5')) p5texcoord()
  if (doe('wees')) await pWees()
  if (doe('herstel')) await pHerstel()
  const echtNa = ['Vehicles/MB_C2_EN_BVG/Texture/Repaints/rep_GN', 'Vehicles/MAN_SD200/Texture'].map((m) => statSync(join(ECHT, m)).mtimeMs)
  klopt('de echte OMSI-map is niet aangeraakt (tijden van de CTC-mappen gelijk)', echtVoor.every((t, i) => t === echtNa[i]))
  uitslag.P2 = p2rijen
  uitslag.ms = Math.round(performance.now() - t0)
  writeFileSync(join(basis, 'uitslag.json'), JSON.stringify(uitslag, null, 2))
  writeFileSync(join(basis, 'log.txt'), logregels.join('\n'))
  console.log(`\nuitslag: ${join(basis, 'uitslag.json')} (${uitslag.ms} ms)`)
  void SNEL
  einde()
}

void hoofd()
