import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import iconv from 'iconv-lite'
import { leesDdsKop, lowUitDds, volleKeten } from '../shared/dds'
import {
  LAK_CTI,
  LAK_KOP,
  ctiBytes,
  ctiDatum,
  ctiNaam,
  lakSlug,
  lakSubmap,
  naamFout,
  omsiHoofdletters,
  type CtiItem,
  type LakOverzicht,
  type LakPlaatsFout,
  type LakProject
} from '../shared/lak'
import {
  controleerStappen,
  installeerStappen,
  leesRegister,
  loopAf,
  MAX_PAD,
  openBron,
  planStappen,
  registreer,
  reserveMap,
  ruimMappenOp,
  ruimteVoor,
  schrijfpad,
  schrijfRegister,
  sha1,
  verwijderStappen,
  type Addon,
  type Plan
} from './addon'
import { leesKleurstellingen } from './kleurstelling'
import { ctisIn, lakOpties, startItems, voertuigenMetCtc, type Familie } from './lakfamilie'
import { schrijfVeilig } from './veilig'

/**
 * EEN EIGEN LAK IN OMSI ZETTEN (lakstudio-ontwerp §5)
 *
 * Alles wat de Lakstudio op schijf doet, zonder Electron: projecten in de
 * gebruikersmap, en het plaatsen, opnieuw opslaan en verwijderen van een
 * kleurstelling in de OMSI-map. Main (main/lakstudio.ts) houdt de grendel en
 * de IPC; de proef (scripts/probe-lakstudio.ts) roept dit rechtstreeks aan op
 * een nagebootste OMSI-map.
 *
 * DE REGELS (§5.5, §5.6)
 * - Eerst alles controleren, dan pas iets aanraken. `lakPlan` toetst de naam
 *   (na UpperCase in alle mappen van de familie), conflicten, de DDS'en (kop,
 *   maat, volle keten), de afhankelijke bestanden, en of elk doelpad nieuw is.
 * - Nooit overschrijven: er wordt geschreven via de add-on-manager
 *   (`openBron` op een staging in de gebruikersmap, `planStappen`,
 *   `installeerStappen`, `registreer`), en alleen als het plan precies de
 *   verwachte bestanden heeft en elk ervan `nieuw` is. De reservekopie van de
 *   manager komt zo nooit in actie.
 * - De .cti als LAATSTE geschreven en als EERSTE weggehaald: stopt het plaatsen
 *   halverwege, of start OMSI tijdens het schrijven, dan ziet OMSI nooit een
 *   .cti die naar een ontbrekend bestand wijst.
 * - Opnieuw opslaan houdt de naam en de bestandsnaam van de .cti (dus het
 *   nummer); de texturen krijgen de sha1 van hun inhoud in de naam, zodat elke
 *   cache op pad vanzelf vervalt.
 * - Draait OMSI, dan klaarzetten (§5.7): de staging en een regel in
 *   `wachtrij.json`; main plaatst zodra OMSI dicht is.
 */

export interface LakOmgeving {
  omsi: string
  userData: string
  nu?: () => Date
  log?: (regel: string) => void
}

/* ------------------------------------------------------------------ paden in de gebruikersmap */

export const lakMap = (ud: string): string => join(ud, 'lakstudio')
const isId = (id: string): boolean => typeof id === 'string' && /^[0-9a-f]{16}$/.test(id)
export const projectMap = (ud: string, id: string): string => {
  if (!isId(id)) throw new Error(`geen project-id: ${id}`)
  return join(lakMap(ud), id)
}
const projectPad = (ud: string, id: string): string => join(projectMap(ud, id), 'project.json')
const versieMap = (ud: string, id: string, v: number): string => join(projectMap(ud, id), 'versies', String(v))
const tellerPad = (ud: string): string => join(lakMap(ud), 'teller.json')
const wachtrijPad = (ud: string): string => join(lakMap(ud), 'wachtrij.json')

export function nieuwProjectId(): string {
  return randomBytes(8).toString('hex')
}

/* ------------------------------------------------------------------ projecten */

export function leesProject(ud: string, id: string): LakProject | undefined {
  if (!isId(id)) return undefined
  try {
    const p = JSON.parse(readFileSync(projectPad(ud, id), 'utf8')) as LakProject
    return p && p.id === id && p.versie === 1 && Array.isArray(p.lagen) ? p : undefined
  } catch {
    return undefined
  }
}

/** Bewaren via `schrijfVeilig` (§4.10); alleen een project met een geldig id en een .bus. */
export function bewaarProject(ud: string, project: LakProject, nu = new Date()): LakProject {
  if (!isId(project.id) || !/\.bus$/i.test(project.bus) || !Array.isArray(project.lagen)) throw new Error('geen geldig project')
  const p: LakProject = { ...project, versie: 1, bewaard: nu.toISOString() }
  // Hooguit 4 MB: een project is lagen met parameters; beelden staan apart onder hun sha1.
  const tekst = JSON.stringify(p)
  if (tekst.length > 4 * 1024 * 1024) throw new Error('project te groot')
  schrijfVeilig(projectPad(ud, p.id), tekst)
  return p
}

export function projecten(ud: string, bus?: string): LakProject[] {
  let ids: string[]
  try {
    ids = readdirSync(lakMap(ud)).filter(isId)
  } catch {
    return []
  }
  return ids
    .map((id) => leesProject(ud, id))
    .filter((p): p is LakProject => Boolean(p) && (!bus || p!.bus.toLowerCase() === bus.toLowerCase()))
    .sort((a, b) => b.bewaard.localeCompare(a.bewaard))
}

/** Een geïmporteerd beeld (§4.10): één keer als bytes, bewaard onder zijn sha1. */
export function bewaarBeeld(ud: string, projectId: string, bytes: Uint8Array): { id: string; soort: string } | undefined {
  const soort =
    bytes[0] === 0x89 && bytes[1] === 0x50
      ? 'png'
      : bytes[0] === 0xff && bytes[1] === 0xd8
        ? 'jpg'
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57
          ? 'webp'
          : /^\s*(<\?xml|<svg)/i.test(new TextDecoder().decode(bytes.subarray(0, 256)))
            ? 'svg'
            : undefined
  if (!soort || bytes.length > 20 * 1024 * 1024) return undefined
  const id = createHash('sha1').update(bytes).digest('hex')
  const pad = join(projectMap(ud, projectId), 'beelden', `${id}.${soort}`)
  if (!existsSync(pad)) {
    mkdirSync(dirname(pad), { recursive: true })
    writeFileSync(pad, bytes)
  }
  return { id, soort }
}

export function leesBeeld(ud: string, projectId: string, beeldId: string): Uint8Array | undefined {
  if (!/^[0-9a-f]{40}$/.test(beeldId)) return undefined
  const map = join(projectMap(ud, projectId), 'beelden')
  for (const ext of ['png', 'jpg', 'webp', 'svg']) {
    const pad = join(map, `${beeldId}.${ext}`)
    if (existsSync(pad)) return readFileSync(pad)
  }
  return undefined
}

/* ------------------------------------------------------------------ de teller (§5.8) */

function leesTeller(ud: string): number {
  try {
    const t = JSON.parse(readFileSync(tellerPad(ud), 'utf8')) as { laatste?: number }
    return Number.isInteger(t.laatste) ? t.laatste! : 0
  } catch {
    return 0
  }
}

/**
 * Het volgende nummer: max(teller, het hoogste ~Lakstudio_nnnn in de mappen
 * van de familie) + 1. Een nieuwe lak sorteert zo in elke map na de oudere,
 * ook na een lak uit een andere installatie (de draagbare versie heeft een
 * eigen gebruikersmap).
 */
export function volgendNnnn(ud: string, familie: Familie): number {
  return Math.min(9999, Math.max(leesTeller(ud), familie.hoogsteNnnn) + 1)
}

function zetTeller(ud: string, nnnn: number): void {
  if (nnnn > leesTeller(ud)) schrijfVeilig(tellerPad(ud), JSON.stringify({ laatste: nnnn }))
}

/* ------------------------------------------------------------------ het plan */

export interface LakTextuur {
  doel: string
  dds: Uint8Array
}

export interface LakBestand {
  /** Ten opzichte van de OMSI-map, schuine strepen naar rechts. */
  rel: string
  inhoud: Uint8Array
  soort: 'textuur' | 'cti'
}

export interface LakPlan {
  naam: string
  nnnn: number
  slug: string
  /** Texturen eerst, de .cti's als laatste. */
  bestanden: LakBestand[]
  cti: Array<{ map: number; rel: string; items: CtiItem[]; setvars: Array<[string, number]> }>
  /** Werden de setvars geschreven (de setvar-regel, §5.4 punt 7)? */
  setvars: boolean
  /** Bestanden van een ander pakket (de start) die de .cti noemt. */
  afhankelijk: string[]
  /** Per lid het nummer dat de naam krijgt: het aantal bestaande kleurstellingen (§5.4). */
  index: Record<string, number>
  /** Wat in het logboek hoort (setvars weg, een start-item dat buiten de map viel ...). */
  meldingen: string[]
}

export interface LakPlanInvoer {
  familie: Familie
  project: LakProject
  naam: string
  texturen: LakTextuur[]
  nnnn: number
  datum: Date
  /** Bij opnieuw opslaan: de naam die we zelf al hadden, telt niet als bezet. */
  eigenNaam?: string
  /** Bij opnieuw opslaan: paden van de vorige versie (klein, t.o.v. de OMSI-map) mogen er al staan; die gaan eerst weg. */
  eigenPaden?: Set<string>
}

type Fout = { fout: LakPlaatsFout; detail?: string; bestanden?: string[] }

const naarRel = (omsi: string, pad: string): string => relative(omsi, pad).split(sep).join('/')

/**
 * Wat er geschreven gaat worden, na alle controles van §5.5 behalve de
 * grendel, de schijfruimte en OMSI (die doet de aanroeper vlak voor het
 * schrijven). Raakt niets aan.
 */
export function lakPlan(omgeving: LakOmgeving, invoer: LakPlanInvoer): { plan: LakPlan } | Fout {
  const { familie, project, naam, datum } = invoer
  const omsi = omgeving.omsi
  if (familie.geenCtc || familie.doelen.length === 0) return { fout: 'geenCtc' }
  // 1. De naam: geldig en vrij in alle mappen van de familie (na UpperCase).
  const eigen = invoer.eigenNaam !== undefined ? omsiHoofdletters(invoer.eigenNaam) : undefined
  const bestaand = familie.bestaandeNamen.filter((n) => omsiHoofdletters(n) !== eigen)
  const nf = naamFout(naam, bestaand)
  if (nf) return { fout: 'naam', detail: nf.fout }
  // 3. Conflicten op een gebakken plek (§3.5).
  if (familie.conflicten.length > 0) return { fout: 'conflict', detail: familie.conflicten.map((c) => c.plek).join(', ') }
  // 7. De DDS'en: één per doel, een geldige DX9-kop, de maat van het doel, een volle keten.
  const perDoel = new Map<string, Uint8Array>()
  for (const t of invoer.texturen) perDoel.set(t.doel, t.dds)
  for (const d of familie.doelen) {
    const dds = perDoel.get(d.id)
    if (!dds) return { fout: 'formaat', detail: `${d.id}: geen textuur` }
    const kop = leesDdsKop(dds)
    if (!kop || !kop.formaat || kop.dx10 || !kop.compleet) return { fout: 'formaat', detail: `${d.id}: geen DXT1/DXT5 met een complete keten` }
    if (kop.b !== d.uitB || kop.h !== d.uitH) return { fout: 'formaat', detail: `${d.id}: ${kop.b}x${kop.h}, verwacht ${d.uitB}x${d.uitH}` }
    if (kop.niveaus !== volleKeten(kop.b, kop.h)) return { fout: 'formaat', detail: `${d.id}: ${kop.niveaus} niveaus, verwacht ${volleKeten(kop.b, kop.h)}` }
  }
  if (perDoel.size !== familie.doelen.length) return { fout: 'formaat', detail: 'texturen voor onbekende doelen' }

  const nnnn = invoer.nnnn
  /*
   * OMSI is 32 bits en kent geen lange paden (MAX_PATH, addon.ts `MAX_PAD`):
   * een textuur die daarboven komt, staat er wel maar OMSI vindt hem nooit. De
   * slug wordt zo nodig korter (hooguit 32 tekens, minstens `lak`); past het dan
   * nog niet, dan niet plaatsen. Het langste pad is de `_#low` van het doel met
   * de langste naam.
   */
  const langsteDoel = Math.max(...familie.doelen.map((d) => d.stam.length)) + '_12345678_#low.dds'.length
  const langsteMap = Math.max(...familie.mappen.map((m) => resolve(m).length))
  let slug = lakSlug(naam)
  const lengte = (sl: string): number => langsteMap + 1 + lakSubmap(nnnn, sl).length + 1 + langsteDoel
  while (lengte(slug) > MAX_PAD && slug.length > 3) slug = slug.slice(0, -1).replace(/-+$/, '') || 'lak'
  if (lengte(slug) > MAX_PAD) return { fout: 'fout', detail: `pad te lang voor OMSI (${lengte(slug)} tekens, hooguit ${MAX_PAD})` }
  const sub = lakSubmap(nnnn, slug)
  const meldingen: string[] = []
  const bestanden: LakBestand[] = []
  // Per map: welke texturen staan erin (een doel met plekken in twee mappen komt in beide).
  const itemsPerMap = familie.mappen.map(() => [] as CtiItem[])
  for (const d of familie.doelen) {
    const dds = perDoel.get(d.id)!
    const hash = createHash('sha1').update(dds).digest('hex').slice(0, 8)
    const bestand = `${d.stam}_${hash}.dds`
    const low = d.low ? lowUitDds(dds) : undefined
    if (d.low && !low) meldingen.push(`${d.naam}: geen _#low (niveau 1 is geen veelvoud van 4)`)
    const mappen = new Set([...d.plekken, ...d.lowPlekken].map((p) => p.map))
    for (const m of mappen) {
      const mapRel = naarRel(omsi, familie.mappen[m])
      const onder = `${mapRel}/${sub.replace(/\\/g, '/')}`
      bestanden.push({ rel: `${onder}/${bestand}`, inhoud: dds, soort: 'textuur' })
      if (low) bestanden.push({ rel: `${onder}/${bestand.replace(/\.dds$/, '_#low.dds')}`, inhoud: low, soort: 'textuur' })
      for (const p of d.plekken.filter((x) => x.map === m)) itemsPerMap[m].push({ plek: p.plek, pad: `${sub}\\${bestand}` })
      for (const p of d.lowPlekken.filter((x) => x.map === m)) {
        itemsPerMap[m].push({ plek: p.plek, pad: `${sub}\\${low ? bestand.replace(/\.dds$/, '_#low.dds') : bestand}` })
      }
    }
  }
  // 5c. De andere plekken van de start (interieur, stoelen, velgen), met hun eigen pad.
  let afhankelijk: string[] = []
  if ((project.start === 'precies' || project.start === 'effenKleuren') && project.startKleurstelling) {
    const s = startItems(familie, project.startKleurstelling)
    afhankelijk = s.afhankelijk
    s.perMap.forEach((items, m) => {
      for (const it of items) {
        if (!itemsPerMap[m].some((x) => omsiHoofdletters(x.plek) === omsiHoofdletters(it.plek))) itemsPerMap[m].push(it)
      }
    })
    // 8. De afhankelijke bestanden bestaan (startItems nam alleen bestaande mee).
    for (const a of afhankelijk) if (!existsSync(join(omsi, ...a.split('/')))) return { fout: 'fout', detail: `ontbreekt: ${a}` }
  }
  // Setvars (§5.4 punt 7): alleen onder de regel, alleen variabelen die de familie kent, na alle items.
  const bekend = new Map(lakOpties(familie).map((o) => [omsiHoofdletters(o.variabele), o.variabele]))
  const setvars: Array<[string, number]> = []
  for (const [v, w] of Object.entries(project.opties ?? {})) {
    const spelling = bekend.get(omsiHoofdletters(v))
    if (!spelling || !Number.isFinite(w)) {
      meldingen.push(`busoptie ${v} kent de familie niet; niet geschreven`)
      continue
    }
    setvars.push([spelling, w])
  }
  const metSetvars = setvars.length > 0 && familie.optiesMogelijk
  if (setvars.length > 0 && !familie.optiesMogelijk) meldingen.push('busopties niet geschreven: de setvar-regel wordt niet gehaald (ls.opties)')

  const ctiNaamBestand = ctiNaam(nnnn, slug)
  const cti: LakPlan['cti'] = []
  familie.mappen.forEach((map, m) => {
    if (itemsPerMap[m].length === 0) return
    const rel = `${naarRel(omsi, map)}/${ctiNaamBestand}`
    const sv = metSetvars ? setvars : []
    cti.push({ map: m, rel, items: itemsPerMap[m], setvars: sv })
  })
  for (const c of cti) {
    bestanden.push({ rel: c.rel, inhoud: ctiBytes({ naam, nnnn, datum: ctiDatum(datum), items: c.items, setvars: c.setvars }), soort: 'cti' })
  }
  // 5. Elk doelpad is nieuw (de add-on-manager kijkt straks nog eens, op de hele boom).
  const bestaat = bestanden
    .filter((b) => !invoer.eigenPaden?.has(b.rel.toLowerCase()) && existsSync(join(omsi, ...b.rel.split('/'))))
    .map((b) => b.rel)
  if (bestaat.length > 0) return { fout: 'bestaat', bestanden: bestaat }

  // Het nummer per lid: het aantal kleurstellingen dat OMSI er nu kent (onze .cti sorteert achteraan).
  const index: Record<string, number> = {}
  for (const lid of familie.leden) {
    if (familie.nietOp.some((n) => n.bus === lid.rel)) continue
    // Bij opnieuw opslaan telt de vorige versie van onszelf niet mee: die gaat eerst weg.
    index[lid.rel] = (leesKleurstellingen(lid.cfg, lid.busmap)?.lijst ?? []).filter((k) => omsiHoofdletters(k.naam) !== eigen).length
  }
  return { plan: { naam, nnnn, slug, bestanden, cti, setvars: metSetvars, afhankelijk, index, meldingen } }
}

/* ------------------------------------------------------------------ staging */

/** De staging van een versie: `versies/<v>/omsi/<rel>`, en de bytes per doel voor de wachtrij. */
function schrijfStaging(ud: string, projectId: string, versie: number, plan: LakPlan, texturen: LakTextuur[]): string {
  const basis = versieMap(ud, projectId, versie)
  rmSync(basis, { recursive: true, force: true })
  const boom = join(basis, 'omsi')
  for (const b of plan.bestanden) {
    const pad = join(boom, ...b.rel.split('/'))
    mkdirSync(dirname(pad), { recursive: true })
    writeFileSync(pad, b.inhoud)
    if (!readFileSync(pad).equals(Buffer.from(b.inhoud.buffer, b.inhoud.byteOffset, b.inhoud.byteLength))) {
      throw new Error(`staging kwam anders terug: ${b.rel}`)
    }
  }
  const bytes = join(basis, 'bytes')
  mkdirSync(bytes, { recursive: true })
  for (const t of texturen) writeFileSync(join(bytes, `${t.doel}.dds`), t.dds)
  writeFileSync(join(basis, 'plan.json'), JSON.stringify({ naam: plan.naam, nnnn: plan.nnnn, slug: plan.slug, bestanden: plan.bestanden.map((b) => b.rel) }))
  return boom
}

function leesStagingBytes(ud: string, projectId: string, versie: number): LakTextuur[] {
  const map = join(versieMap(ud, projectId, versie), 'bytes')
  try {
    return readdirSync(map)
      .filter((n) => /^d\d+\.dds$/.test(n))
      .map((n) => ({ doel: n.replace(/\.dds$/, ''), dds: new Uint8Array(readFileSync(join(map, n))) }))
  } catch {
    return []
  }
}

/** Alleen de laatst geplaatste versie en de nieuwe blijven staan (om terug te kunnen, §5.6). */
function ruimVersiesOp(ud: string, projectId: string, houd: number[]): void {
  const map = join(projectMap(ud, projectId), 'versies')
  try {
    for (const n of readdirSync(map)) if (!houd.includes(Number(n))) rmSync(join(map, n), { recursive: true, force: true })
  } catch {
    // geen versies
  }
}

/* ------------------------------------------------------------------ plaatsen */

export interface PlaatsInvoer {
  familie: Familie
  project: LakProject
  naam: string
  texturen: LakTextuur[]
  /** Voor de proef: het wegschrijven van één bestand (om een onderbreking na te bootsen). */
  kopieerHaak?: (rel: string) => void
  /** Vlak voor het eerste bestand: draait OMSI? Dan niets (de aanroeper zet klaar). */
  omsiDraait?: () => boolean
  /** Na ls.handmatig bij opnieuw opslaan: [Wijziging weggooien en opslaan]. */
  keuze?: 'weggooien'
}

export type PlaatsUitkomst =
  | { ok: true; addon: Addon; plan: LakPlan; index: number; nnnn: number; versie: number }
  | Fout
  | { omsi: true }

/** Het verwachte doelpad per bestand, klein geschreven, voor de harde eis op het plan. */
const zelfde = (a: string[], b: string[]): boolean => {
  const x = new Set(a.map((s) => s.toLowerCase()))
  const y = new Set(b.map((s) => s.toLowerCase()))
  return x.size === y.size && [...x].every((s) => y.has(s))
}

/**
 * Plaatsen (§5.6). De grendel en "OMSI draait niet" zijn van de aanroeper;
 * `omsiDraait` wordt vlak voor het eerste bestand nog eens gevraagd.
 */
export function plaatsLak(omgeving: LakOmgeving, invoer: PlaatsInvoer): PlaatsUitkomst {
  const ud = omgeving.userData
  const nu = omgeving.nu?.() ?? new Date()
  const { familie, project } = invoer
  const register = leesRegister(ud)
  const bestaand = register.addons.find((a) => a.soort === 'lak' && a.lak?.projectId === project.id)
  if (bestaand) return opnieuwOpslaan(omgeving, invoer, bestaand)
  const nnnn = volgendNnnn(ud, familie)
  const versie = (project.geplaatst?.versie ?? 0) + 1
  const p = lakPlan(omgeving, { familie, project, naam: invoer.naam, texturen: invoer.texturen, nnnn, datum: nu })
  if ('fout' in p) return p
  return zetNeer(omgeving, invoer, p.plan, versie)
}

/** De staging schrijven en via de add-on-manager plaatsen; de .cti als laatste. */
function zetNeer(omgeving: LakOmgeving, invoer: PlaatsInvoer, plan: LakPlan, versie: number): PlaatsUitkomst {
  const { omsi, userData: ud } = omgeving
  const nu = omgeving.nu?.() ?? new Date()
  const { familie, project } = invoer
  const boom = schrijfStaging(ud, project.id, versie, plan, invoer.texturen)
  const bron = openBron(boom)
  try {
    const register = leesRegister(ud)
    const addonPlan: Plan = loopAf(planStappen(bron, omsi, register))
    // Twee harde eisen (§5.6, punt 4): precies de verwachte set, en alles nieuw.
    const verwacht = plan.bestanden.map((b) => b.rel)
    const extra = [...addonPlan.code, ...addonPlan.dubbel, ...addonPlan.teLang, ...addonPlan.geweigerd, ...addonPlan.nooit, ...addonPlan.overig]
    if (!zelfde(addonPlan.regels.map((r) => r.doel), verwacht) || extra.length > 0) {
      const ontbreekt = verwacht.filter((v) => !addonPlan.regels.some((r) => r.doel.toLowerCase() === v.toLowerCase()))
      const teVeel = addonPlan.regels.filter((r) => !verwacht.some((v) => v.toLowerCase() === r.doel.toLowerCase())).map((r) => r.doel)
      return {
        fout: 'fout',
        detail: `het plan van de add-on-manager wijkt af (ontbreekt ${ontbreekt.length}, te veel ${teVeel.length}, overig ${extra.length})`,
        bestanden: [...ontbreekt.map((x) => `- ${x}`), ...teVeel.map((x) => `+ ${x}`), ...extra.map((x) => `? ${String(x)}`)]
      }
    }
    const nietNieuw = addonPlan.regels.filter((r) => r.staat !== 'nieuw').map((r) => r.doel)
    if (nietNieuw.length > 0) return { fout: 'bestaat', bestanden: nietNieuw }
    if (!ruimteVoor(addonPlan, omsi, ud).past) return { fout: 'ruimte' }
    // De volgorde: texturen eerst, de .cti's als laatste (installeerStappen volgt plan.regels).
    const volgorde = new Map(plan.bestanden.map((b, i) => [b.rel.toLowerCase(), b.soort === 'cti' ? 1e6 + i : i]))
    addonPlan.regels.sort((a, b) => (volgorde.get(a.doel.toLowerCase()) ?? 0) - (volgorde.get(b.doel.toLowerCase()) ?? 0))
    if (invoer.omsiDraait?.()) return { omsi: true }
    const haak = invoer.kopieerHaak
    const metHaak = haak
      ? { ...bron, kopieer: (b: Parameters<typeof bron.kopieer>[0], naar: string) => (haak(b.pad), bron.kopieer(b, naar)) }
      : bron
    const uit = loopAf(installeerStappen(metHaak, { ...addonPlan, naam: `Lakstudio: ${plan.naam}` }, omsi, ud, nu))
    // In het register de .cti's VOOROP: verwijderen haalt ze dan eerst weg (§5.6, punt 5).
    uit.addon.bestanden.sort((a, b) => Number(/\.cti$/i.test(b.pad)) - Number(/\.cti$/i.test(a.pad)))
    uit.addon.soort = 'lak'
    uit.addon.bussen = []
    uit.addon.lak = {
      projectId: project.id,
      naam: plan.naam,
      bus: project.bus,
      familie: familie.leden.filter((l) => !familie.nietOp.some((n) => n.bus === l.rel)).map((l) => l.rel),
      ctcMappen: familie.mappen.map((m) => naarRel(omsi, m)),
      nnnn: plan.nnnn,
      versie,
      afhankelijk: plan.afhankelijk
    }
    registreer(ud, omsi, uit)
    zetTeller(ud, plan.nnnn)
    ruimVersiesOp(ud, project.id, [versie])
    const index = plan.index[familie.bus] ?? Object.values(plan.index)[0] ?? 0
    omgeving.log?.(
      `Lakstudio: '${plan.naam}' geplaatst als nr. ${plan.nnnn} versie ${versie} (${uit.geschreven} bestanden, index ${index})` +
        (plan.meldingen.length ? `; ${plan.meldingen.join('; ')}` : '')
    )
    return { ok: true, addon: uit.addon, plan, index, nnnn: plan.nnnn, versie }
  } finally {
    bron.sluit()
  }
}

/**
 * Opnieuw opslaan (§5.6): eerst alles controleren (niets met de hand
 * veranderd), dan het nieuwe plan (zelfde naam, zelfde nummer, nieuwe
 * texturen), dan de oude versie weg met de .cti eerst, dan de nieuwe erin. Gaat
 * dat laatste mis, dan komt de oude versie terug uit zijn eigen staging.
 */
function opnieuwOpslaan(omgeving: LakOmgeving, invoer: PlaatsInvoer, oud: Addon): PlaatsUitkomst {
  const { omsi, userData: ud } = omgeving
  const nu = omgeving.nu?.() ?? new Date()
  const { familie, project } = invoer
  const lak = oud.lak!
  // 1. Eerst alles controleren: is er iets met de hand veranderd, dan niets aanraken tot de speler kiest.
  const controle = controleerStappen(oud, omsi)
  if (controle.gewijzigd.length > 0 && invoer.keuze !== 'weggooien') return { fout: 'handmatig', bestanden: controle.gewijzigd }
  // 2. Het nieuwe plan: dezelfde naam en hetzelfde nummer; de paden van de vorige versie mogen er nog staan.
  const naam = lak.naam
  const eigenPaden = new Set(oud.bestanden.map((b) => b.pad.toLowerCase()))
  const p = lakPlan(omgeving, { familie, project, naam, texturen: invoer.texturen, nnnn: lak.nnnn, datum: nu, eigenNaam: naam, eigenPaden })
  if ('fout' in p) return p
  // 3. De vorige versie weg, de .cti eerst (die staat voorop in het register).
  const register = leesRegister(ud)
  const weg = loopAf(verwijderStappen(oud, register, omsi, ud))
  if (invoer.keuze === 'weggooien') verwijderGewijzigd(omsi, weg.gewijzigd)
  schrijfRegister(ud, { addons: register.addons.filter((a) => a.id !== oud.id) })
  rmSync(reserveMap(ud, oud.id), { recursive: true, force: true })
  // 4. De nieuwe versie.
  const uit = zetNeer(omgeving, invoer, p.plan, lak.versie + 1)
  if ('ok' in uit) return uit
  // 5. Mislukt: de vorige versie terug uit haar eigen staging.
  const oudBytes = leesStagingBytes(ud, project.id, lak.versie)
  const terug = lakPlan(omgeving, { familie, project, naam, texturen: oudBytes, nnnn: lak.nnnn, datum: new Date(oud.geinstalleerd), eigenNaam: naam })
  const hersteld = 'plan' in terug ? zetNeer(omgeving, { ...invoer, texturen: oudBytes }, terug.plan, lak.versie) : terug
  omgeving.log?.(`Lakstudio: opnieuw opslaan van '${naam}' mislukte; de vorige versie ${'ok' in hersteld ? 'staat terug' : 'kon niet terug'}`)
  return uit
}

/** Verwijder bestanden die de speler koos weg te gooien (alleen van deze lak, dus uit het register). */
function verwijderGewijzigd(omsi: string, paden: string[]): void {
  const mappen = new Set<string>()
  for (const p of paden) {
    try {
      const vol = schrijfpad(omsi, p)
      if (existsSync(vol)) unlinkSync(vol)
      mappen.add(dirname(vol))
    } catch {
      // al weg of niet te schrijven: dan blijft hij staan
    }
  }
  ruimMappenOp(omsi, mappen)
}

/* ------------------------------------------------------------------ verwijderen */

export type VerwijderUitkomst =
  | { ok: true; verwijderd: number; blijvend: string[] }
  | { fout: 'handmatig'; bestanden: string[] }
  | { fout: 'weg' }

/**
 * Verwijderen (§5.6): eerst alles controleren. Is iets met de hand veranderd,
 * dan niets doen tot de speler kiest (`keuze`: 'alles' haalt ook die weg,
 * 'laten' laat alles staan). Dan `verwijderStappen` (de .cti eerst), het register,
 * lege mappen weg. Het ontwerp blijft staan, tenzij `ookOntwerp`.
 */
export function verwijderLak(
  omgeving: LakOmgeving,
  projectId: string,
  opties: { keuze?: 'alles' | 'laten'; ookOntwerp?: boolean } = {}
): VerwijderUitkomst {
  const { omsi, userData: ud } = omgeving
  const register = leesRegister(ud)
  const addon = register.addons.find((a) => a.soort === 'lak' && a.lak?.projectId === projectId)
  if (!addon) return { fout: 'weg' }
  const controle = controleerStappen(addon, omsi)
  if (controle.gewijzigd.length > 0 && !opties.keuze) return { fout: 'handmatig', bestanden: controle.gewijzigd }
  if (opties.keuze === 'laten') return { ok: true, verwijderd: 0, blijvend: addon.bestanden.map((b) => b.pad) }
  const uit = loopAf(verwijderStappen(addon, register, omsi, ud))
  if (opties.keuze === 'alles') verwijderGewijzigd(omsi, uit.gewijzigd)
  schrijfRegister(ud, { addons: register.addons.filter((a) => a.id !== addon.id) })
  rmSync(reserveMap(ud, addon.id), { recursive: true, force: true })
  const project = leesProject(ud, projectId)
  if (opties.ookOntwerp) rmSync(projectMap(ud, projectId), { recursive: true, force: true })
  else if (project) {
    bewaarProject(ud, { ...project, geplaatst: undefined })
    ruimVersiesOp(ud, projectId, [])
  }
  haalUitWachtrij(ud, projectId)
  omgeving.log?.(`Lakstudio: '${addon.lak?.naam}' verwijderd (${uit.verwijderd} bestanden)`)
  return { ok: true, verwijderd: uit.verwijderd, blijvend: opties.keuze === 'alles' ? [] : uit.gewijzigd }
}

/* ------------------------------------------------------------------ klaarzetten (§5.7) */

export interface Wachtend {
  projectId: string
  naam: string
  bus: string
  versie: number
  sinds: string
  reden?: string
}

export function leesWachtrij(ud: string): Wachtend[] {
  try {
    const w = JSON.parse(readFileSync(wachtrijPad(ud), 'utf8')) as { lakken?: Wachtend[] }
    return Array.isArray(w.lakken) ? w.lakken.filter((l) => isId(l.projectId)) : []
  } catch {
    return []
  }
}

function schrijfWachtrij(ud: string, lakken: Wachtend[]): void {
  schrijfVeilig(wachtrijPad(ud), JSON.stringify({ lakken }), 'utf8', { leegMag: true })
}

export function haalUitWachtrij(ud: string, projectId: string): boolean {
  const w = leesWachtrij(ud)
  const rest = w.filter((l) => l.projectId !== projectId)
  if (rest.length === w.length) return false
  schrijfWachtrij(ud, rest)
  return true
}

/**
 * Klaarzetten terwijl OMSI draait: alle controles van `lakPlan` behalve OMSI,
 * de staging, en een regel in de wachtrij. Er wordt niets in de OMSI-map
 * geschreven.
 */
export function klaarzetten(omgeving: LakOmgeving, invoer: PlaatsInvoer): { klaargezet: true; nnnn: number; versie: number } | Fout {
  const { userData: ud } = omgeving
  const nu = omgeving.nu?.() ?? new Date()
  const { familie, project } = invoer
  const register = leesRegister(ud)
  const oud = register.addons.find((a) => a.soort === 'lak' && a.lak?.projectId === project.id)
  const nnnn = oud?.lak?.nnnn ?? volgendNnnn(ud, familie)
  const naam = oud?.lak?.naam ?? invoer.naam
  const eigenPaden = oud ? new Set(oud.bestanden.map((b) => b.pad.toLowerCase())) : undefined
  const p = lakPlan(omgeving, { familie, project, naam, texturen: invoer.texturen, nnnn, datum: nu, eigenNaam: oud ? naam : undefined, eigenPaden })
  if ('fout' in p) return p
  const versie = (oud?.lak?.versie ?? 0) + 1
  schrijfStaging(ud, project.id, versie, p.plan, invoer.texturen)
  const rest = leesWachtrij(ud).filter((l) => l.projectId !== project.id)
  schrijfWachtrij(ud, [...rest, { projectId: project.id, naam, bus: project.bus, versie, sinds: nu.toISOString() }])
  bewaarProject(ud, { ...project, naam }, nu)
  omgeving.log?.(`Lakstudio: '${naam}' klaargezet (OMSI draait), versie ${versie}`)
  return { klaargezet: true, nnnn, versie }
}

/**
 * De wachtrij afwerken (§5.7): zodra OMSI dicht is, bij het starten van de app,
 * en vlak voordat de app OMSI start. Per lak `lakPlan` opnieuw (de familie kan
 * intussen veranderd zijn) en plaatsen; wat niet lukt blijft staan met de reden.
 * `familieVan` rekent de familie opnieuw uit; `omsiDraait` wordt per lak
 * gevraagd.
 */
export function verwerkWachtrij(
  omgeving: LakOmgeving,
  familieVan: (bus: string) => Familie,
  omsiDraait: () => boolean
): Array<{ projectId: string; naam: string; uitkomst: PlaatsUitkomst }> {
  const { userData: ud } = omgeving
  const uit: Array<{ projectId: string; naam: string; uitkomst: PlaatsUitkomst }> = []
  for (const w of leesWachtrij(ud)) {
    if (omsiDraait()) break
    const project = leesProject(ud, w.projectId)
    const texturen = leesStagingBytes(ud, w.projectId, w.versie)
    let uitkomst: PlaatsUitkomst
    if (!project || texturen.length === 0) uitkomst = { fout: 'fout', detail: 'het ontwerp of de staging is weg' }
    else {
      try {
        uitkomst = plaatsLak(omgeving, { familie: familieVan(project.bus), project, naam: w.naam, texturen, omsiDraait })
      } catch (fout) {
        uitkomst = { fout: 'fout', detail: fout instanceof Error ? fout.message : String(fout) }
      }
    }
    if ('ok' in uitkomst) {
      haalUitWachtrij(ud, w.projectId)
      bewaarProject(ud, { ...project!, naam: w.naam, geplaatst: { naam: w.naam, nnnn: uitkomst.nnnn, versie: uitkomst.versie } })
    } else if ('fout' in uitkomst) {
      const reden = `${uitkomst.fout}${uitkomst.detail ? `: ${uitkomst.detail}` : ''}`
      // Eén regel per nieuwe reden: de wachtrij wordt elke 20 s opnieuw geprobeerd.
      if (w.reden !== reden) {
        schrijfWachtrij(ud, leesWachtrij(ud).map((l) => (l.projectId === w.projectId ? { ...l, reden } : l)))
        omgeving.log?.(`Lakstudio: '${w.naam}' blijft wachten (${reden})`)
      }
    }
    uit.push({ projectId: w.projectId, naam: w.naam, uitkomst })
  }
  return uit
}

/* ------------------------------------------------------------------ het overzicht (Addons) */

export function lakLijst(ud: string): LakOverzicht[] {
  const register = leesRegister(ud)
  const geplaatst: LakOverzicht[] = register.addons
    .filter((a) => a.soort === 'lak' && a.lak)
    .map((a) => ({
      projectId: a.lak!.projectId,
      naam: a.lak!.naam,
      bus: a.lak!.bus,
      nnnn: a.lak!.nnnn,
      versie: a.lak!.versie,
      geplaatst: a.geinstalleerd,
      bestanden: a.bestanden.length
    }))
  const wacht: LakOverzicht[] = leesWachtrij(ud).map((w) => ({
    projectId: w.projectId,
    naam: w.naam,
    bus: w.bus,
    nnnn: 0,
    versie: w.versie,
    geplaatst: w.sinds,
    bestanden: 0,
    wacht: true,
    reden: w.reden
  }))
  return [...wacht, ...geplaatst]
}

/* ------------------------------------------------------------------ wezen (§5.8) */

export interface Wees {
  id: string
  /** De .cti, ten opzichte van de OMSI-map. */
  cti: string
  naam: string
  nnnn: number
  /** De bestanden die de .cti noemt onder `Lakstudio\<nnnn>_<slug>\`, ten opzichte van de OMSI-map. */
  bestanden: string[]
}

/**
 * Een `~Lakstudio_*.cti` met onze kop, zonder regel in dit register: gemaakt met
 * een andere installatie van de app (ls.wees), of een register dat weg is.
 */
export function wezen(omgeving: LakOmgeving): Wees[] {
  const { omsi, userData: ud } = omgeving
  const bekend = new Set<string>()
  for (const a of leesRegister(ud).addons) for (const b of a.bestanden) bekend.add(b.pad.toLowerCase())
  const mappen = new Set<string>()
  for (const v of voertuigenMetCtc(omsi)) mappen.add(v.map)
  const uit: Wees[] = []
  for (const map of mappen) {
    for (const bestand of ctisIn(map)) {
      const m = LAK_CTI.exec(bestand)
      if (!m) continue
      const vol = join(map, bestand)
      const rel = naarRel(omsi, vol)
      if (bekend.has(rel.toLowerCase())) continue
      let regels: string[]
      try {
        regels = iconv.decode(readFileSync(vol), 'win1252').split('\n').map((r) => r.replace(/\r/g, ''))
      } catch {
        continue
      }
      if (!(regels[1] ?? '').startsWith(LAK_KOP)) continue
      const sub = lakSubmap(Number(m[1]), m[2].toLowerCase()).toLowerCase()
      let naam = ''
      const bestanden = new Set<string>()
      for (let i = 0; i < regels.length; i++) {
        if (regels[i] !== '[item]') continue
        naam ||= regels[i + 1] ?? ''
        const pad = (regels[i + 3] ?? '').replace(/\//g, '\\')
        // Alleen onze eigen submap: nooit bestanden van een ander pakket (de start).
        if (pad.toLowerCase().startsWith(`${sub}\\`) && !pad.includes('..')) {
          const doel = join(map, ...pad.split('\\'))
          if (existsSync(doel)) bestanden.add(naarRel(omsi, doel))
        }
        i += 3
      }
      uit.push({ id: createHash('sha1').update(rel.toLowerCase()).digest('hex').slice(0, 16), cti: rel, naam, nnnn: Number(m[1]), bestanden: [...bestanden] })
    }
  }
  return uit
}

/** Een wees weghalen: de .cti eerst, dan alleen de bestanden die hij noemt onder zijn eigen submap. */
export function weesWeg(omgeving: LakOmgeving, id: string): boolean {
  const w = wezen(omgeving).find((x) => x.id === id)
  if (!w) return false
  verwijderGewijzigd(omgeving.omsi, [w.cti, ...w.bestanden])
  omgeving.log?.(`Lakstudio: wees '${w.naam}' (${w.cti}) weggehaald`)
  return true
}

/** Een wees overnemen: registreren met de huidige sha1's (bewerken kan alleen als het project er is). */
export function weesOvernemen(omgeving: LakOmgeving, id: string): boolean {
  const { omsi, userData: ud } = omgeving
  const w = wezen(omgeving).find((x) => x.id === id)
  if (!w) return false
  const nu = omgeving.nu?.() ?? new Date()
  const addon: Addon = {
    id: `${nu.getTime().toString(36)}-${createHash('sha1').update(w.cti).digest('hex').slice(0, 6)}`,
    naam: `Lakstudio: ${w.naam}`,
    bron: 'wees',
    geinstalleerd: nu.toISOString(),
    bestanden: [w.cti, ...w.bestanden].map((p) => ({ pad: p, sha1: sha1(readFileSync(join(omsi, ...p.split('/')))), was: 'nieuw' as const })),
    bussen: [],
    kaarten: [],
    soort: 'lak',
    lak: {
      projectId: nieuwProjectId(),
      naam: w.naam,
      bus: '',
      familie: [],
      ctcMappen: [w.cti.split('/').slice(0, -1).join('/')],
      nnnn: w.nnnn,
      versie: 1,
      afhankelijk: []
    }
  }
  const register = leesRegister(ud)
  schrijfRegister(ud, { addons: [...register.addons, addon] })
  return true
}

/* ------------------------------------------------------------------ afhankelijkheden (§5.6) */

/** Welke eigen lakken noemen bestanden van deze add-on (de start)? Voor de waarschuwing bij het verwijderen. */
export function lakkenDieLeunenOp(ud: string, addon: Addon): Array<{ naam: string; aantal: number }> {
  const van = new Set(addon.bestanden.map((b) => b.pad.toLowerCase()))
  return leesRegister(ud)
    .addons.filter((a) => a.soort === 'lak' && a.lak)
    .map((a) => ({ naam: a.lak!.naam, aantal: a.lak!.afhankelijk.filter((p) => van.has(p.toLowerCase())).length }))
    .filter((x) => x.aantal > 0)
}

/** Bestaan de bestanden van de start nog (bij het openen van de studio)? */
export function ontbrekendeAfhankelijk(omgeving: LakOmgeving, projectId: string): string[] {
  const a = leesRegister(omgeving.userData).addons.find((x) => x.soort === 'lak' && x.lak?.projectId === projectId)
  return (a?.lak?.afhankelijk ?? []).filter((p) => !existsSync(join(omgeving.omsi, ...p.split('/'))))
}

/** Hoe groot een staging is (voor het logboek). */
export function stagingBytes(ud: string, projectId: string): number {
  let som = 0
  const loop = (map: string): void => {
    try {
      for (const d of readdirSync(map, { withFileTypes: true })) {
        const vol = join(map, d.name)
        if (d.isDirectory()) loop(vol)
        else som += statSync(vol).size
      }
    } catch {
      // geen map
    }
  }
  loop(join(projectMap(ud, projectId), 'versies'))
  return som
}
