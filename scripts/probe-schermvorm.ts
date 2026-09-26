/**
 * Kan de app het scherm van elk apparaat in elke bus natekenen?
 *
 *   npx tsx scripts/probe-schermvorm.ts ["<pad naar OMSI 2>"] [--svg <map>] [--stil] [--snel]
 *
 * `--snel` slaat de ronde langs de hele vloot over en doet alleen de harde
 * controles op de nagemeten bussen.
 *
 * Loopt alle bestuurbare bussen af (zoals scripts/probe-busmodel.ts), leest per
 * model.cfg de apparaten (core/busmodule.ts) en bouwt van elk apparaat de
 * schermvorm (core/schermvorm.ts). Per apparaat: of er een achtergrond is, hoeveel
 * delen en klikken, wat versleuteld of benaderd is, welke texturen ontbreken, en
 * hoe ver de tekstvakken en klikken van het vlak liggen.
 *
 * Daarna HARDE CONTROLES op de bussen waarvan het scherm nagemeten is (de
 * ALMEX van de HH20 vooral: nakijken_achtergrond.md §9). Een mislukte controle
 * geeft exitcode 1.
 *
 * Textuur en lettertype zijn hier eenvoudig nagebootst: `zoekTextuur` kijkt in
 * <voertuig>\Texture (ook met een andere extensie) en in OMSI\Texture, `bron` is
 * de sha1 van het pad, en een lettertype is een leeg font van 27 hoog. Getallen
 * krijgt de vorm NIET mee, zoals in de app zolang de plugin ze niet levert: de
 * animatievariabelen komen dan uit de scripts van de bus (core/schermvorm.ts
 * doet dat zelf, met `startwaardenVan`). Leest alleen; schrijft hooguit het
 * SVG-plaatje van de ALMEX.
 *
 * Elke vorm van de vloot gaat ook door `gebreken`: eindige getallen, twaalf
 * getallen per driehoek, plekken in `getallen`/`stringvars` die bestaan,
 * textuur-id's die in `texturen` staan, en de klikken met de voorste als
 * laatste. Eén gebrek in de hele vloot is een mislukte controle.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { modelVanBus } from '../src/core/busmodel'
import { modulesVanModel, type Busmodule } from '../src/core/busmodule'
import { findOmsiInstall } from '../src/core/install'
import { ontleedSchermcfg } from '../src/core/schermcfg'
import { meshlijstVan, schermGetallenVan, schermVormVan, startwaardenVan, type SchermUitvoer } from '../src/core/schermvorm'
import { listVehicles } from '../src/core/vehicles'
import { isZichtbaar, type Schermdeel, type Schermklik, type Schermvorm, type Zicht } from '../src/shared/scherm'

const args = process.argv.slice(2)
const svgMap = args.includes('--svg') ? args[args.indexOf('--svg') + 1] : undefined
const stil = args.includes('--stil')
const snel = args.includes('--snel')
const omsi = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--svg') ?? findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

/* ---------------------------------------------------------------- nabootsen */

function zoekerVoor(modelcfg: string): (naam: string) => string | undefined {
  const voertuig = dirname(dirname(modelcfg))
  return (naam) => {
    const delen = naam.split(/[\\/]+/).filter(Boolean)
    if (delen.some((d) => d === '..') || /^[a-z]:/i.test(naam)) return undefined
    const direct = join(voertuig, 'Texture', ...delen)
    if (existsSync(direct)) return direct
    const stam = naam.replace(/\.[^.\\/]+$/, '')
    for (const ext of ['.dds', '.tga', '.bmp', '.jpg', '.png']) {
      const pad = join(voertuig, 'Texture', ...(stam + ext).split(/[\\/]+/).filter(Boolean))
      if (existsSync(pad)) return pad
    }
    const gedeeld = join(omsi!, 'Texture', basename(naam))
    return existsSync(gedeeld) ? gedeeld : undefined
  }
}

/**
 * Zoals main het doet: eerst de namen, dan de vorm met alleen wat de plugin
 * levert (`getallen`; standaard niets) en eventueel de namen die de bus niet
 * kent. `omsiMap` alleen anders om de opsluiting van de kleurstelling te toetsen.
 */
function bouw(
  modelcfg: string,
  module: Busmodule,
  getallen: Record<string, number> = {},
  opties: { omsiMap?: string; onbekend?: string[] } = {}
): {
  uit?: SchermUitvoer
  namen: string[]
  ms: number
} {
  const begin = performance.now()
  const namen = schermGetallenVan(modelcfg, module)
  const uit = schermVormVan({
    modelcfg,
    omsiMap: opties.omsiMap ?? omsi!,
    module,
    getallen,
    onbekend: opties.onbekend,
    font: (naam) => ({ naam, hoogte: 27, sep: 2, tekens: [] }),
    zoekTextuur: zoekerVoor(modelcfg),
    bron: (pad) => ({ id: createHash('sha1').update(pad.toLowerCase()).digest('hex').slice(0, 20) })
  })
  return { uit, namen, ms: performance.now() - begin }
}

/* ------------------------------------------------------------------ helpers */

function driehoekDoos(deel: Schermdeel): { s0: number; s1: number; t0: number; t1: number; v0: number; v1: number } {
  const d = deel.driehoeken
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (let i = 0; i < d.length; i += 4) {
    s0 = Math.min(s0, d[i]); s1 = Math.max(s1, d[i])
    t0 = Math.min(t0, d[i + 1]); t1 = Math.max(t1, d[i + 1])
    v0 = Math.min(v0, d[i + 3]); v1 = Math.max(v1, d[i + 3])
  }
  return { s0, s1, t0, t1, v0, v1 }
}

function stand(vorm: Schermvorm, waarden: Record<string, number>): { vorm: string; t: string[]; g: number[] } {
  return { vorm: vorm.id, t: [], g: vorm.getallen.map((n) => waarden[n] ?? 0) }
}

function bereik(waarden: number[]): string {
  if (waarden.length === 0) return '-'
  return `${Math.min(...waarden).toFixed(1)}..${Math.max(...waarden).toFixed(1)}`
}

/**
 * Wat er aan een vorm niet deugt als afspraak (shared/scherm.ts), los van of
 * het plaatje klopt. Een NaN wordt null op het netwerk en dan een knop
 * linksboven; een plek die niet bestaat maakt `isZichtbaar` stil onwaar.
 */
function gebreken(v: Schermvorm, r: SchermUitvoer, meshAantal: number, gevraagd: string[]): string[] {
  const uit: string[] = []
  /*
   * Main vraagt de plugin alleen wat `schermGetallenVan` noemde, en zoekt de
   * waarden daarna LETTERLIJK op onder `vorm.getallen`. Een naam die niet (of in
   * een andere schrijfwijze) gevraagd is, komt nooit binnen: dan is elk onderdeel
   * met die voorwaarde onzichtbaar.
   */
  for (const naam of v.getallen) if (!gevraagd.includes(naam)) uit.push(`getal ${naam} staat niet in schermGetallenVan`)
  const eindig = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x)
  const plek = (x: unknown, lengte: number): boolean => Number.isInteger(x) && (x as number) >= 0 && (x as number) < lengte
  const ids = new Set(r.texturen.map((t) => t.id))
  const zichtGoed = (z: Zicht[]): boolean => z.every((x) => plek(x.getal, v.getallen.length) && Number.isInteger(x.waarde))
  const meshGoed = (m: number): boolean => m === -1 || plek(m, meshAantal)
  if (!eindig(v.verhouding) || v.verhouding <= 0) uit.push(`verhouding ${v.verhouding}`)
  v.delen.forEach((d, i) => {
    const wie = `deel ${i} (${d.soort})`
    if (d.driehoeken.length === 0 || d.driehoeken.length % 12 !== 0) uit.push(`${wie}: ${d.driehoeken.length} getallen`)
    if (!d.driehoeken.every(eindig)) uit.push(`${wie}: een driehoeksgetal is niet eindig`)
    if (!eindig(d.diepte)) uit.push(`${wie}: diepte ${d.diepte}`)
    if (!zichtGoed(d.zicht)) uit.push(`${wie}: zicht wijst buiten getallen`)
    if (!meshGoed(d.mesh)) uit.push(`${wie}: mesh ${d.mesh} van ${meshAantal}`)
    if (d.textuur !== undefined && !ids.has(d.textuur)) uit.push(`${wie}: textuur-id niet in texturen`)
    if (d.freetex !== undefined && !plek(d.freetex, v.stringvars.length)) uit.push(`${wie}: freetex buiten stringvars`)
    if (d.keuze) {
      if (!plek(d.keuze.getal, v.getallen.length)) uit.push(`${wie}: keuze buiten getallen`)
      if (!d.keuze.items.every((x) => x === null || ids.has(x))) uit.push(`${wie}: keuze-item niet in texturen`)
    }
    if (d.kleur && (d.kleur.length !== 4 || !d.kleur.every(eindig))) uit.push(`${wie}: kleur`)
    if (d.soort === 'beeld' && d.textuur === undefined && d.freetex === undefined) uit.push(`${wie}: zonder textuur en freetex`)
    if (d.soort === 'tekst') {
      const t = d.tekst
      if (!t) uit.push(`${wie}: zonder tekst`)
      else if (!plek(t.variabele, v.stringvars.length) || !(t.b > 0 && t.h > 0) || !Number.isInteger(t.raster)) uit.push(`${wie}: teksttextuur`)
    }
  })
  const paren = new Set<string>()
  v.klikken.forEach((k, i) => {
    const wie = `klik ${i} (${k.actie})`
    if (paren.has(`${k.mesh}|${k.actie}`)) uit.push(`${wie}: twee keer dezelfde actie op mesh ${k.mesh}`)
    paren.add(`${k.mesh}|${k.actie}`)
    if (![k.x, k.y, k.b, k.h, k.diepte].every(eindig)) uit.push(`${wie}: niet eindig`)
    else if (!(k.b > 0 && k.h > 0)) uit.push(`${wie}: ${k.b} x ${k.h}`)
    if (!zichtGoed(k.zicht)) uit.push(`${wie}: zicht wijst buiten getallen`)
    if (!meshGoed(k.mesh)) uit.push(`${wie}: mesh ${k.mesh} van ${meshAantal}`)
    /* De voorste als laatste; binnen 0,2 mm geldt als even diep. */
    if (i > 0 && k.diepte < v.klikken[i - 1].diepte - 0.2 - 1e-9) uit.push(`${wie}: ligt achter de klik ervoor`)
  })
  return uit
}

/* ------------------------------------------------------- alle bussen langs */

const bussen = listVehicles(omsi)
const cfgs = new Map<string, string>()
for (const bus of bussen) {
  const cfg = modelVanBus(join(omsi, bus.relativePath))
  if (cfg && !cfgs.has(cfg.toLowerCase())) cfgs.set(cfg.toLowerCase(), cfg)
}
console.log(`${bussen.length} bestuurbare bussen, ${cfgs.size} verschillende model.cfg's\n`)

let apparaten = 0
let metVorm = 0
let metAchtergrond = 0
let klikTotaal = 0
const tel = { versleuteld: 0, benaderd: 0, ontbreekt: 0, script: 0, onzeker: 0, startwaarde: 0, freetex: 0, clamp: 0, kleur: 0 }
const uitschieters: string[] = []
const structuur: string[] = []
const tijden: number[] = []

for (const cfg of snel ? [] : cfgs.values()) {
  let modules: Busmodule[]
  try {
    modules = modulesVanModel(cfg)
  } catch (fout) {
    console.log(`!! ${cfg}: ${(fout as Error).message}`)
    continue
  }
  const kort = cfg.split(/[\\/]Vehicles[\\/]/i).pop() ?? cfg
  for (const module of modules) {
    apparaten++
    let r: ReturnType<typeof bouw>
    try {
      r = bouw(cfg, module)
    } catch (fout) {
      console.log(`!! ${kort} ${module.id}: ${(fout as Error).stack}`)
      uitschieters.push(`${kort} ${module.id}: fout ${(fout as Error).message}`)
      continue
    }
    tijden.push(r.ms)
    const v = r.uit?.vorm
    if (!v) {
      if (!stil) console.log(`   ${kort.padEnd(58)} ${module.id.padEnd(24)} geen vorm (${module.vakken.length} vakken, ${module.knoppen.length} knoppen)`)
      continue
    }
    metVorm++
    for (const gebrek of gebreken(v, r.uit!, meshlijstVan(cfg).length, r.namen)) structuur.push(`${kort} ${module.id}: ${gebrek}`)
    const achtergrond = v.delen.find((d) => d.soort === 'beeld' || d.soort === 'kleur')
    const heeftAchtergrond = !v.onvolledig.some((o) => o.startsWith('geen achtergrond'))
    if (heeftAchtergrond) metAchtergrond++
    klikTotaal += v.klikken.length
    const soorten = new Map<string, number>()
    for (const d of v.delen) soorten.set(d.soort, (soorten.get(d.soort) ?? 0) + 1)
    const tel1 = (re: RegExp): number => v.onvolledig.filter((o) => re.test(o)).length
    tel.versleuteld += tel1(/^versleuteld/)
    tel.benaderd += tel1(/^benaderd/)
    tel.ontbreekt += tel1(/^textuur ontbreekt/)
    tel.script += tel1(/^scripttextuur/)
    tel.onzeker += tel1(/^plek onzeker/)
    tel.startwaarde += tel1(/^plek volgens de startwaarde/)
    tel.freetex += v.delen.filter((d) => d.freetex !== undefined).length
    tel.clamp += v.delen.filter((d) => d.adres !== 'wrap').length
    tel.kleur += soorten.get('kleur') ?? 0
    const tekstD = v.delen.filter((d) => d.soort === 'tekst').map((d) => d.diepte)
    const klikD = v.klikken.map((k) => k.diepte)
    if (!stil) {
      console.log(
        `   ${kort.padEnd(58)} ${module.id.padEnd(24)} ` +
          `${heeftAchtergrond ? 'achtergrond' : 'GEEN achtergr'} ${achtergrond?.textuur ? r.uit!.texturen.find((t) => t.id === achtergrond.textuur)?.pad.split(/[\\/]/).pop() ?? '' : achtergrond?.freetex !== undefined ? '(freetex)' : ''} ` +
          `| verh ${v.verhouding.toFixed(2)} | delen ${[...soorten].map(([s, n]) => `${s} ${n}`).join(', ')} | klikken ${v.klikken.length} ` +
          `| tekst d ${bereik(tekstD)} mm, klik d ${bereik(klikD)} mm | ${r.ms.toFixed(0)} ms`
      )
      for (const o of v.onvolledig) console.log(`        - ${o}`)
    }
    if ([...tekstD, ...klikD].some((d) => d < -1 || d > 15)) uitschieters.push(`${kort} ${module.id}: diepte buiten -1..15 mm`)
  }
}

console.log(
  `\n${apparaten} apparaten, ${metVorm} met een vorm (${metAchtergrond} met achtergrond), ${klikTotaal} klikken; ` +
    `onvolledig: ${tel.versleuteld} versleuteld, ${tel.benaderd} benaderd, ${tel.ontbreekt} textuur weg, ` +
    `${tel.script} script, ${tel.onzeker} plek onzeker, ${tel.startwaarde} plek uit een startwaarde; ` +
    `delen met freetex ${tel.freetex}, clamp/border ${tel.clamp}, kleur ${tel.kleur}`
)
tijden.sort((a, b) => a - b)
console.log(`tijd per apparaat: mediaan ${tijden[Math.floor(tijden.length / 2)]?.toFixed(0)} ms, max ${tijden[tijden.length - 1]?.toFixed(0)} ms`)
if (uitschieters.length) {
  console.log('\nUITSCHIETERS')
  for (const u of uitschieters) console.log(`   ${u}`)
}

/* ---------------------------------------------------------- harde controles */

let fouten = 0
function controle(ok: boolean, wat: string): void {
  console.log(`${ok ? '  ok ' : 'FOUT '} ${wat}`)
  if (!ok) fouten++
}
function moduleVan(rel: string, id: string): { cfg: string; module?: Busmodule } {
  const cfg = join(omsi!, 'Vehicles', rel)
  return { cfg, module: existsSync(cfg) ? modulesVanModel(cfg).find((m) => m.id === id) : undefined }
}
const klikVan = (v: Schermvorm, actie: string): Schermklik[] => v.klikken.filter((k) => k.actie === actie)
const naamVan = (r: SchermUitvoer, id?: string): string =>
  (id ? r.texturen.find((t) => t.id === id)?.pad.split(/[\\/]/).pop() : undefined) ?? ''

console.log('\nHARDE CONTROLES')

/* De hele vloot: elke vorm houdt zich aan de afspraak. */
for (const s of structuur.slice(0, 20)) console.log(`      ${s}`)
controle(structuur.length === 0, `vloot: ${structuur.length} gebreken in ${metVorm} vormen (NaN, plekken, id's, klikvolgorde)`)

/* De cfg-lezer: een regel die als sleutel van Object.prototype leest, breekt het lezen niet af. */
{
  const regels = [
    '[mesh]', 'bestaat_niet_1.o3d', 'constructor', '[visible]', 'a', '1',
    '[newanim]', 'toString', 'anim_trans', 'b', '0.5',
    '[mesh]', 'bestaat_niet_2.o3d', '__proto__', '[mouseevent]', 'klik'
  ]
  const c = ontleedSchermcfg(join(omsi, 'Vehicles', 'geen_bus', 'model', 'model.cfg'), regels)
  controle(
    c.meshes.length === 2 && c.meshes[0].zicht.length === 1 && c.meshes[0].anims[0]?.schuif?.variabele === 'b' &&
      c.meshes[1].klikken[0] === 'klik' && c.meshes.every((m) => m.meshIndex === -1),
    `schermcfg: 'constructor'/'toString'/'__proto__' als regel breken het lezen niet af (${c.meshes.length} meshes)`
  )
}

/* HH20: de ALMEX van Luc. */
{
  const { cfg, module } = moduleVan('HH20_EBus2021/Model/model_21_main.cfg', '/almex')
  controle(!!module, 'HH20: apparaat /almex gevonden')
  /* Met trans_dauer live, zoals met plugin 13. */
  const r = module ? bouw(cfg, module, { trans_dauer: 1 }) : undefined
  const v = r?.uit?.vorm
  controle(!!v, 'HH20 ALMEX: er is een vorm')
  if (v && r?.uit) {
    controle(Math.abs(v.verhouding - 1.381) < 0.02, `HH20 ALMEX: verhouding ${v.verhouding.toFixed(3)} ~ 1,38`)
    controle(meshlijstVan(cfg).length === 608, `HH20: ${meshlijstVan(cfg).length} meshes (OMSI telt er 608)`)
    const nul = stand(v, { almex_menu: 0 })
    const zichtbareAchtergronden = v.delen.filter((d) => d.soort === 'beeld' && isZichtbaar(nul, d) === true)
    controle(
      zichtbareAchtergronden.length === 1 && naamVan(r.uit, zichtbareAchtergronden[0].textuur) === '17_almex_s_0.jpg',
      `HH20 ALMEX, menu 0: het enige zichtbare plaatje is ${zichtbareAchtergronden.map((d) => naamVan(r.uit!, d.textuur)).join(', ')}`
    )
    if (zichtbareAchtergronden[0]) {
      const nul0 = zichtbareAchtergronden[0]
      const b = driehoekDoos(nul0)
      controle(
        Math.abs(b.v0 * 1024 - 122.9) < 2 && Math.abs(b.v1 * 1024 - 901.2) < 2,
        `HH20 ALMEX, menu 0: uitsnede rij ${(b.v0 * 1024).toFixed(1)}..${(b.v1 * 1024).toFixed(1)} (verwacht 122,9..901,2)`
      )
      /*
       * Niet gespiegeld en niet op zijn kop: links op het scherm (s klein) is
       * links in het plaatje (u klein, de lege blauwe kolom), boven (t klein) is
       * rij 122,9. De uitsnede-controle hierboven ziet een spiegeling niet.
       */
      const hoeken: [number, number, number, number][] = []
      for (let i = 0; i < nul0.driehoeken.length; i += 4) hoeken.push(nul0.driehoeken.slice(i, i + 4) as [number, number, number, number])
      const links = hoeken.reduce((a, h) => (h[0] < a[0] ? h : a))
      const rechts = hoeken.reduce((a, h) => (h[0] > a[0] ? h : a))
      const boven = hoeken.reduce((a, h) => (h[1] < a[1] ? h : a))
      const onder = hoeken.reduce((a, h) => (h[1] > a[1] ? h : a))
      controle(
        links[2] < 0.01 && rechts[2] > 0.99 && Math.abs(boven[3] * 1024 - 122.9) < 2 && Math.abs(onder[3] * 1024 - 901.2) < 2,
        `HH20 ALMEX, menu 0: rechtop en niet gespiegeld (links u ${links[2].toFixed(3)}, rechts u ${rechts[2].toFixed(3)}, ` +
          `boven rij ${(boven[3] * 1024).toFixed(1)}, onder rij ${(onder[3] * 1024).toFixed(1)})`
      )
      const naam = meshlijstVan(cfg)[nul0.mesh]
      controle(naam === '17_almex_screen_0.o3d', `HH20 ALMEX, menu 0: mesh ${nul0.mesh} is in de meshlijst ${naam}`)
    }
    const klok = v.delen.find((d) => d.soort === 'tekst' && v.stringvars[d.tekst!.variabele] === 'almex_s_uhrzeit')
    if (klok) {
      const b = driehoekDoos(klok)
      const s = (b.s0 + b.s1) / 2
      const t = (b.t0 + b.t1) / 2
      controle(s > 0.7 && t < 0.12, `HH20 ALMEX: de klok ligt rechtsboven (s ${s.toFixed(3)}, t ${t.toFixed(3)})`)
    } else controle(false, 'HH20 ALMEX: de klok almex_s_uhrzeit is er')
    for (let n = 1; n <= 7; n++) {
      const k = klikVan(v, `almex_clickU${n}`)
      controle(
        k.length === 1 && k[0].y > 0.86 && k[0].y + k[0].h < 1.01,
        `HH20 ALMEX: clickU${n} onderaan (y ${k[0]?.y.toFixed(3)}..${k[0] ? (k[0].y + k[0].h).toFixed(3) : '?'})`
      )
    }
    /* De zes regels van 17_almex_s_26.jpg, in beeldpunten van het 1024²-plaatje (zicht 122,9..901,2). */
    const rijen = [317, 398, 480, 564, 645, 729]
    for (let n = 1; n <= 6; n++) {
      const k = klikVan(v, `almex_click_sonderansg_${n}`)
      const zicht = k[0]?.zicht.map((z) => `${v.getallen[z.getal]}=${z.waarde}`).join('&')
      const rij = k[0] ? 122.9 + k[0].y * 778.3 : NaN
      controle(
        k.length === 1 && zicht === 'almex_menu=26' && Math.abs(rij - rijen[n - 1]) < 8,
        `HH20 ALMEX: sonderansg_${n} is een klik bij ${zicht} op rij ${rij.toFixed(0)} (verwacht ${rijen[n - 1]})`
      )
    }
    for (const actie of ['almex_ticket_toggle', 'almex_riegel', 'cashdesk_change_0500', 'cashdesk_change_1000']) {
      controle(klikVan(v, actie).length === 0 && !r.uit.knoppenOpScherm.includes(actie), `HH20 ALMEX: ${actie} is geen klik (fysiek)`)
    }
    const n1 = v.delen.filter((d) => d.mesh === v.klikken.find((k) => k.actie === 'almex_clickN1')?.mesh)
    controle(n1.length === 0, 'HH20 ALMEX: clickN1 wordt niet getekend (kijkt de andere kant op)')
    controle(v.onvolledig.length === 0, `HH20 ALMEX: niets onvolledig (${v.onvolledig.join('; ')})`)
    const nogEens = bouw(cfg, module!, { trans_dauer: 1 }).uit?.vorm
    controle(nogEens?.id === v.id, `HH20 ALMEX: twee keer bouwen geeft hetzelfde id (${v.id})`)
    if (svgMap) schrijfSvg(v, r.uit, join(svgMap, 'almex_hh20_vorm.svg'))
  }
  if (module) {
    /*
     * Zonder getallen, zoals de app met een plugin van voor versie 13: trans_dauer
     * komt dan uit het script (21_cockpit_C2.osc:1497), en de zes regels van menu
     * 26 liggen toch op het scherm. Zegt de plugin dat de bus trans_dauer niet
     * kent, dan geen script maar 0 -- en dan liggen ze ernaast.
     */
    controle(startwaardenVan(cfg, ['trans_dauer']).trans_dauer === 1, 'HH20: startwaarde trans_dauer = 1 uit de scripts')
    /* Uit {macro:cockpit_init} (21_cockpit_C2.osc:1498), niet de grens -1 uit {trigger:vdv_move} (regel 557). */
    const vdv = startwaardenVan(cfg, ['vdv_move_x', 'vdv_move_y'])
    controle(
      vdv.vdv_move_x === -0.22 && vdv.vdv_move_y === 0.4,
      `HH20: startwaarden uit de init, niet uit een trigger (vdv_move_x ${vdv.vdv_move_x}, vdv_move_y ${vdv.vdv_move_y}; verwacht -0,22 en 0,4)`
    )
    const zonder = bouw(cfg, module).uit?.vorm
    const rijen = zonder ? klikVan(zonder, 'almex_click_sonderansg_1').length + klikVan(zonder, 'almex_click_sonderansg_6').length : 0
    controle(
      rijen === 2 && !!zonder?.onvolledig.some((o) => o.startsWith('plek volgens de startwaarde uit het script, trans_dauer = 1')),
      `HH20 ALMEX zonder getallen: sonderansg_1 en _6 zijn klikken, plek uit het script (${zonder?.onvolledig.filter((o) => o.startsWith('plek')).join('; ')})`
    )
    const onbekend = bouw(cfg, module, {}, { onbekend: ['trans_dauer'] }).uit?.vorm
    controle(
      !!onbekend && klikVan(onbekend, 'almex_click_sonderansg_1').length === 0 &&
        onbekend.onvolledig.some((o) => o.startsWith('plek onzeker, trans_dauer')),
      'HH20 ALMEX met trans_dauer onbekend: geen script, sonderansg_1 valt weg en de plek is onzeker'
    )
  }
}

/*
 * De kleurstelling: een textuur uit een .cti gaat alleen naar het register als
 * hij binnen de installatie ligt. S315UL_Euro2, kleurstelling 0 ('Kessler alt')
 * vervangt AFR200.tga door Repaints_generic\AFR200_braun.dds.
 */
{
  const { cfg, module } = moduleVan('TH_Ueberlandbus/Model/S315UL_Euro2.cfg', 'afr200/afr200')
  const binnen = module ? bouw(cfg, module, { Colorscheme: 0 }).uit : undefined
  const basisBinnen = binnen?.vorm.delen[0]
  controle(
    (binnen ? naamVan(binnen, basisBinnen?.textuur) : '').toLowerCase() === 'afr200_braun.dds',
    `S315UL AFR 200, kleurstelling 0: display uit ${(binnen ? naamVan(binnen, basisBinnen?.textuur) : '')} (verwacht AFR200_braun.dds)`
  )
  const elders = join(dirname(omsi), 'geen_omsi_hier')
  const buiten = module ? bouw(cfg, module, { Colorscheme: 0 }, { omsiMap: elders }).uit : undefined
  const basisBuiten = buiten?.vorm.delen[0]
  controle(
    (buiten ? naamVan(buiten, basisBuiten?.textuur) : '').toLowerCase() === 'afr200.dds' &&
      !!buiten?.vorm.onvolledig.some((o) => o.startsWith('kleurstelling wijst buiten de installatie')),
    `S315UL AFR 200, kleurstelling buiten de installatie: genegeerd, display uit ${(buiten ? naamVan(buiten, basisBuiten?.textuur) : '')}`
  )
}

/* HH_Stadtbus2017: dezelfde ALMEX. */
{
  const { cfg, module } = moduleVan('HH_Stadtbus2017/Model/model_17_solo.cfg', '/almex')
  const v = module ? bouw(cfg, module).uit?.vorm : undefined
  controle(!!v && Math.abs(v.verhouding - 1.381) < 0.02, `HH_Stadtbus2017 ALMEX: vorm met verhouding ${v?.verhouding.toFixed(3)}`)
  controle(!!v && klikVan(v, 'almex_click_sonderansg_1')[0]?.zicht.length === 1, 'HH_Stadtbus2017 ALMEX: sonderansg_1 is een klik')
}

/* HH109: freetex almex_s_texname op het scherm. */
{
  const { cfg, module } = moduleVan('HH109_Stadtgelenkbus2012_HHA/Model/model_CG2_VW.cfg', '/almex')
  const v = module ? bouw(cfg, module).uit?.vorm : undefined
  const basis = v?.delen[0]
  controle(
    !!v && !!basis && basis.freetex !== undefined && v.stringvars[basis.freetex] === 'almex_s_texname' && basis.alfa === 2,
    `HH109 ALMEX: het scherm is freetex ${basis?.freetex !== undefined ? v?.stringvars[basis.freetex] : '-'} met alfa ${basis?.alfa}`
  )
}

/* TH O550: de AFR 200, tekstvakken op het display, toetsen fysiek. */
{
  const { cfg, module } = moduleVan('TH_Ueberlandbus/Model/O550_Euro3.cfg', 'afr200/afr200')
  const r = module ? bouw(cfg, module).uit : undefined
  const v = r?.vorm
  const teksten = v?.delen.filter((d) => d.soort === 'tekst').length ?? 0
  controle(!!v && teksten >= 2, `O550 AFR 200: vorm met ${teksten} tekstvakken`)
  controle(!!v && v.klikken.filter((k) => /^IBIS_\d$/.test(k.actie)).length === 0, 'O550 AFR 200: de cijfertoetsen zijn geen klik (fysiek)')
  const basis = v?.delen[0]
  if (basis && r) {
    const b = driehoekDoos(basis)
    controle(
      naamVan(r, basis.textuur).toLowerCase() === 'afr200.dds' && Math.abs(b.v0 * 2048 - 1863) < 4,
      `O550 AFR 200: display uit ${naamVan(r, basis.textuur)}, rij ${(b.v0 * 2048).toFixed(0)}..${(b.v1 * 2048).toFixed(0)} (verwacht 1863..2010)`
    )
  }
}

/* MAN NLC: de kaartautomaat met onzichtbare knoppen, en de displays met clamp. */
{
  const { cfg, module } = moduleVan('MAN_NewLionsCity/model/model_12C_2door.cfg', 'drucker/nlc')
  const v = module ? bouw(cfg, module).uit?.vorm : undefined
  controle(!!v && v.klikken.length > 50, `MAN NLC drucker: ${v?.klikken.length} klikken`)
  const lijst = meshlijstVan(cfg)
  const knopDelen = v?.delen.filter((d) => /NLC_Drucker_\d_Anmeldung/i.test(lijst[d.mesh] ?? '')) ?? []
  controle(!!v && knopDelen.length === 0, 'MAN NLC drucker: de knoppen (diffuus-alfa 0) worden niet getekend')
  const klemmen = modulesVanModel(cfg)
    .filter((m) => m.id.startsWith('2d/'))
    .map((m) => bouw(cfg, m).uit?.vorm)
    .some((vv) => vv?.delen.some((d) => d.adres === 'clamp'))
  controle(klemmen, 'MAN NLC displays: er zijn delen met adres clamp')
}

/* MB C2: de Atron, met zijn scripttextuur. */
{
  const { cfg, module } = moduleVan('MB_C2_EN_BVG/Model/model_MB_C2_E6_Solo.cfg', 'mx200/')
  const v = module ? bouw(cfg, module).uit?.vorm : undefined
  controle(!!v && v.onvolledig.some((o) => o.startsWith('scripttextuur')), 'MB C2 Atron: de scripttextuur staat in onvolledig')
  controle(!!v && v.delen.some((d) => d.soort === 'script'), 'MB C2 Atron: er is een deel van soort script')
}

console.log(fouten ? `\n${fouten} controle(s) mislukt` : '\nalle controles in orde')
process.exitCode = fouten ? 1 : 0

/* -------------------------------------------------------------------- SVG */

/** Driehoeken als omtrek (blauw beeld, groen tekst, oranje script/kleur) en klikken als rode rechthoek. */
function schrijfSvg(vorm: Schermvorm, r: SchermUitvoer, pad: string): void {
  const B = 1200
  const H = Math.round(B / vorm.verhouding)
  const M = 40
  const x = (s: number): string => (M + s * B).toFixed(1)
  const y = (t: number): string => (M + t * H).toFixed(1)
  const delen: string[] = []
  for (const d of vorm.delen) {
    const kleur = d.soort === 'beeld' ? '#4aa3ff' : d.soort === 'tekst' ? '#4dff88' : '#ffb000'
    const dh = d.driehoeken
    for (let i = 0; i < dh.length; i += 12) {
      delen.push(
        `<polygon points="${x(dh[i])},${y(dh[i + 1])} ${x(dh[i + 4])},${y(dh[i + 5])} ${x(dh[i + 8])},${y(dh[i + 9])}" fill="none" stroke="${kleur}" stroke-width="0.8" opacity="0.8"/>`
      )
    }
    if (d.soort === 'tekst') {
      delen.push(`<text x="${x(dh[0])}" y="${y(dh[1])}" fill="${kleur}" font-size="11">${vorm.stringvars[d.tekst!.variabele]}</text>`)
    } else if (d.soort === 'beeld' && d.textuur) {
      const b = driehoekDoos(d)
      const naam = naamVan(r, d.textuur)
      if (b.s1 - b.s0 < 0.9) delen.push(`<text x="${x(b.s0)}" y="${y(b.t1)}" fill="${kleur}" font-size="9">${naam}</text>`)
    }
  }
  for (const k of vorm.klikken) {
    delen.push(
      `<rect x="${x(k.x)}" y="${y(k.y)}" width="${(k.b * B).toFixed(1)}" height="${(k.h * H).toFixed(1)}" fill="none" stroke="#ff4040" stroke-width="1.5"/>` +
        `<text x="${x(k.x + 0.003)}" y="${y(k.y + k.h - 0.01)}" fill="#ff6060" font-size="10">${k.actie.replace(/^almex_/, '')}</text>`
    )
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${B + 2 * M}" height="${H + 2 * M}" viewBox="0 0 ${B + 2 * M} ${H + 2 * M}" font-family="sans-serif">` +
    `<rect width="100%" height="100%" fill="#1d2027"/><rect x="${M}" y="${M}" width="${B}" height="${H}" fill="none" stroke="#fff" stroke-opacity="0.4"/>` +
    delen.join('') +
    `</svg>`
  mkdirSync(dirname(pad), { recursive: true })
  writeFileSync(pad, svg)
  console.log(`   (SVG geschreven: ${pad})`)
}
