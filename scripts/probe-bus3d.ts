/**
 * Bus3D, de proefbank van F0 en F1 (design/ontwerpen/bus3d.md §13, §14).
 *
 *   npx tsx scripts/probe-bus3d.ts                  de proefset: pakketten, tijden, T-G1, T-V1 t/m T-V5, protocol, randgevallen
 *   npx tsx scripts/probe-bus3d.ts --nulmeting      v3 (de foto van nu) als referentie, per bus
 *   npx tsx scripts/probe-bus3d.ts --alles [--diep] listVehicles plus alle .bus met [friendlyname]: 0 crashes, texturen
 *
 * Alleen lezen in de OMSI-map. De schijfcache en de nagebootste OMSI-map voor de
 * protocolproef komen in een tijdelijke map, die aan het eind weggaat. Het
 * register van Windows wordt niet aangeraakt; Lucs gegevens ook niet.
 *
 * WAT HIER GETOETST WORDT
 * - Per bus van de proefset (scripts/bus3d-proefset.json): het pakket nieuw
 *   (bouwen en schrijven, twee keer; de tweede telt, met de bronnen in de
 *   OS-cache) en warm (zijspoor en pakket lezen), de textuurroutes, het
 *   textuurplan bij 160 MB, ontbrekend tegen onleesbaar, de doostoets.
 *   Klaar-eis F1: SD77 ≤ 0,4 s en NLC ≤ 1,2 s nieuw.
 * - T-G1: de [matl]-koppeling op de SD77.
 * - T-V1: de tweeling `21_aussen_weich3` exact.
 * - T-V2: ontwarde bussen in breedte en hoogte binnen de doos + 0,5 m (de
 *   doostoets van core/bus3d.ts), en de tegenproef: met sleutel + 1 valt de bus erop.
 * - T-V3: 25 van de 26 icoonbussen een pakket, de GS GU240 `'versleuteld'` (12411).
 * - T-V4: met een lege registratie geven de 21 bussen met een geregistreerde
 *   sleutel `'versleuteld'` en de 4 MAN NL/NG (sleutel 0) niet.
 * - T-V5: in de cache staat van elke gehusselde o3d het blok byte voor byte
 *   zoals in het bronbestand, en verder geen hoekpuntbestand.
 * - Het protocol `omsi3d://` op een nagebootste OMSI-map: p/ en t/ (met Range),
 *   409 na een gewijzigd bestand, 403 als de sleutel uit de registratie
 *   verdwijnt, 404 op wat niet in het register staat, en 'vervangen' in de rij.
 * - Het textuurplan: nooit een DXT-begin dat WebGL weigert (zijde niet deelbaar
 *   door 4), synthetisch, per bus van de proefset en met --alles over alle bussen.
 * - CTC op de texturen die de cfg noemt: de transmap van de NLC 12C bij
 *   "Rheinhausen".
 * - De randgevallen uit de tegenlezing van F1, op nagebootste mappen: de
 *   registratielezer (dubbele sectie, ArtNr buiten Integer), de rustklok, de rij
 *   met achtergrondbeurten, een mislukte herbouw na 'verouderd', een afgekapt
 *   pakket en 'stuk', de bronnen (o3d die later verschijnt, .dsc), kleurstellingen
 *   die erbij komen, en de cachegrens tijdens een sessie.
 */
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { bouwBusTekening } from '../src/core/busbeeld'
import { bouwBus3d, bus3dLak, pakketVerouderd } from '../src/core/bus3d'
import { typischVan } from '../src/core/busrust'
import { kleurstalen } from '../src/core/kleurstalen'
import { leesRustProgramma, rekenRust } from '../src/core/oscrust'
import { Bus3dCache, bus3dWerk, type Bus3dOpdracht } from '../src/core/bus3dcache'
import { findOmsiInstall } from '../src/core/install'
import { ontleedO3d } from '../src/core/o3d'
import { leesKleurstellingen } from '../src/core/kleurstelling'
import { beschrijfRegistratie, leesIni, leesOmsiRegistratie, omsiRegistratie } from '../src/core/omsiregistratie'
import { leesPng } from '../src/core/png'
import { ontleedTextuur, pakBmpUit } from '../src/core/textuur'
import { listVehicles } from '../src/core/vehicles'
import type { WebContents } from 'electron'
import { maakBus3dDienst, type Bus3dWerkerModel } from '../src/main/bus3d'
import {
  dxtMaxOverslaan,
  rustRegels,
  textuurPlan,
  type Bus3dAntwoord,
  type Bus3dLak,
  type Bus3dManifest,
  type Bus3dPakKop,
  type Bus3dTextuur,
  type RustVermelding
} from '../src/shared/bus3d'
import { leesPakket } from '../src/shared/bus3dpak'
import { ontwar } from '../src/shared/o3dhussel'

const omsi = findOmsiInstall()
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(1)
}
const OMSI: string = omsi
const set = JSON.parse(readFileSync(join(__dirname, 'bus3d-proefset.json'), 'utf8')) as {
  bussen: Array<{ nr: number; naam: string; pad: string; verwacht: 'pakket' | 'versleuteld'; tijdNieuwMs?: number; sleutels?: number[] }>
  volgorde: string[]
  disabled: string
  tg1: { pad: string; regels: Array<{ o3d: string; groep: number; alfa?: number; nietSchrijven?: boolean }> }
  tv3: { bussen: string[]; icoon: string[]; nul: string[] }
  tweeling: { gehusseld: string; open: string; hoekpunten: number }
}
const args = new Set(process.argv.slice(2))
const MB = (b: number): string => (b / 1048576).toFixed(1)

let fouten = 0
function toets(naam: string, goed: boolean, detail = ''): void {
  if (!goed) fouten++
  console.log(`${goed ? 'GOED' : 'FOUT'}  ${naam}${detail ? `: ${detail}` : ''}`)
}

const tijdelijk = mkdtempSync(join(tmpdir(), 'probe-bus3d-'))
process.on('exit', () => rmSync(tijdelijk, { recursive: true, force: true }))

async function bouwEnSchrijf(cache: Bus3dCache, pad: string, geregistreerd: ReadonlySet<number>): Promise<{ uit: Bus3dWerkerModel; ms: number }> {
  const t0 = performance.now()
  const uit = (await bus3dWerk({ soort: 'bus3d:model', relatiefPad: pad, geregistreerd: [...geregistreerd] }, OMSI, cache)) as Bus3dWerkerModel
  return { uit, ms: performance.now() - t0 }
}

function routes(m: Bus3dManifest): string {
  const r = { dxt: 0, 'dxt-zonder-mips': 0, beeld: 0, eigen: 0 }
  for (const t of m.texturen) r[t.soort]++
  return `dxt ${r.dxt} / rtt ${r['dxt-zonder-mips']} / beeld ${r.beeld} / eigen ${r.eigen}`
}

/**
 * WebGL weigert een S3TC-begin (niveau 0 op de GPU) waarvan een zijde niet
 * deelbaar is door 4 (gemeten in Electron 33). Geeft de DXT-texturen waarvan het
 * plan zo'n begin kiest, bij 160 MB en bij 96 MB (OMSI draait).
 */
function dxtBeginFout(m: Bus3dManifest): string[] {
  const uit: string[] = []
  for (const budget of [160, 96]) {
    const plan = textuurPlan(m.texturen, budget * 1024 * 1024)
    m.texturen.forEach((t, i) => {
      const r = plan.regels[i]
      if (t.soort === 'dxt' && r.laden && (r.b % 4 !== 0 || r.h % 4 !== 0)) uit.push(`${t.naam} ${t.b}x${t.h} -> ${r.b}x${r.h} (${budget} MB)`)
    })
  }
  return uit
}

function planRegel(m: Bus3dManifest): string {
  const plan = textuurPlan(m.texturen, 160 * 1024 * 1024)
  const i = m.texturen.findIndex((t) => t.ctc && t.ctc === plan.carrosserie)
  const c = i >= 0 ? `${m.texturen[i].naam} ${m.texturen[i].b}x${m.texturen[i].h} -> ${plan.regels[i].b}x${plan.regels[i].h}` : 'geen CTC'
  return `plan ${MB(plan.bytes)} MB${plan.teZwaar ? ' TE ZWAAR' : ''}, carrosserie ${c}`
}

// ------------------------------------------------------------ nulmeting (v3)
function nulmeting(): void {
  console.log('\n== Nulmeting: de foto van nu (v3, core/busbeeld.ts), warm (tweede keer) ==')
  const paden = [...set.bussen.map((b) => b.pad), ...set.volgorde, set.disabled]
  for (const pad of paden) {
    bouwBusTekening(join(OMSI, pad))
    const t0 = performance.now()
    const t = bouwBusTekening(join(OMSI, pad))
    const ms = Math.round(performance.now() - t0)
    console.log(
      `v3 ${pad}: ` +
        (t
          ? `${t.driehoeken} driehoeken, ${t.stukken.length} stukken, ${new Set(t.stukken.map((s) => s.textuur)).size} texturen, ` +
            `${t.versleuteld} versleuteld, ${t.overgeslagen} overgeslagen, ${ms} ms`
          : `geen tekening (icoon), ${ms} ms`)
    )
  }
}

// ------------------------------------------------------------ de proefset
async function proefset(): Promise<void> {
  const reg = omsiRegistratie(OMSI)
  console.log(`registratie: ${beschrijfRegistratie(reg)}`)
  for (const v of reg.vermeldingen) console.log(`  ${v.bron} [${v.sectie}] ${v.naam}: ArtNr ${v.artNr}, ${v.waarom}`)
  toets(
    'registratie = {12726, 13005, 13730, 13887, 15657}, alle bevestigd door het Steam-manifest',
    [12726, 13005, 13730, 13887, 15657].every((s) => reg.sleutels.has(s)) && reg.vermeldingen.every((v) => v.bevestigd),
    [...reg.sleutels].join(', ')
  )

  const cache = new Bus3dCache(join(tijdelijk, 'ud'))
  console.log('\n== De proefset: pakket nieuw (bouwen + schrijven, 2e keer) en warm ==')
  const manifesten = new Map<string, Bus3dManifest>()
  for (const b of set.bussen) {
    await bouwEnSchrijf(cache, b.pad, reg.sleutels)
    const { uit, ms } = await bouwEnSchrijf(cache, b.pad, reg.sleutels)
    if ('reden' in uit) {
      console.log(`#${b.nr} ${b.naam}: ${uit.reden} -- ${uit.detail} (${Math.round(ms)} ms)`)
      toets(`#${b.nr} ${b.naam}: verwacht ${b.verwacht}`, b.verwacht === uit.reden, uit.reden)
      if (b.sleutels) toets(`#${b.nr} sleutel ${b.sleutels.join(',')} genoemd`, b.sleutels.every((s) => uit.sleutels?.includes(s)), String(uit.sleutels))
      continue
    }
    const z = uit.zijspoor
    const m = z.manifest
    manifesten.set(b.pad, m)
    // Warm: wat main doet (zijspoor) plus wat het venster ophaalt (het pakket).
    const tw = performance.now()
    const gevonden = cache.zoek(OMSI, b.pad)
    const pak = leesPakket(readFileSync(cache.pakketPad(z.pakket)))
    const warm = performance.now() - tw
    console.log(
      `#${b.nr} ${b.naam}: nieuw ${Math.round(ms)} ms (${JSON.stringify(uit.tijden)}), warm ${Math.round(warm)} ms; ` +
        `${m.telling.driehoeken} driehoeken, ${m.telling.stukken} stukken, ${m.telling.vermeldingen} vermeldingen, ` +
        `${m.telling.texturen} texturen (${routes(m)}), ontbrekend ${m.telling.ontbrekend}, onleesbaar ${m.telling.onleesbaar}, ` +
        `ontward ${m.telling.ontward}, versleuteld ${m.telling.versleuteld}, geometrie ${MB(m.bytes.geometrie)} MB, ${planRegel(m)}` +
        (uit.doostoets ? `, doos ${JSON.stringify(uit.doostoets)}` : '')
    )
    if (m.problemen.onleesbaar.length) console.log(`   onleesbaar: ${JSON.stringify(m.problemen.onleesbaar)}`)
    toets(`#${b.nr} ${b.naam}: verwacht ${b.verwacht}`, b.verwacht === 'pakket')
    toets(`#${b.nr} zijspoor en pakket warm terug`, Boolean(gevonden) && pak.kop.pakket === z.pakket)
    toets(`#${b.nr} 0 texturen onleesbaar`, m.telling.onleesbaar === 0, m.problemen.onleesbaar.map((o) => o.naam).join(', '))
    const dxtFout = dxtBeginFout(m)
    toets(`#${b.nr} textuurplan: elk DXT-begin deelbaar door 4 (160 en 96 MB)`, dxtFout.length === 0, dxtFout.slice(0, 4).join('; '))
    if (b.tijdNieuwMs) toets(`#${b.nr} nieuw ≤ ${b.tijdNieuwMs} ms`, ms <= b.tijdNieuwMs, `${Math.round(ms)} ms`)
    if (b.sleutels) toets(`#${b.nr} sleutels ${b.sleutels.join(',')}`, b.sleutels.every((s) => m.sleutels.includes(s)), m.sleutels.join(','))
  }

  // ---------------------------------------------------------- T-G1
  console.log('\n== T-G1: de [matl]-koppeling op de SD77 ==')
  const sd = cache.zoek(OMSI, set.tg1.pad)
  if (!sd) toets('T-G1 pakket SD77', false)
  else {
    const pak = leesPakket(readFileSync(cache.pakketPad(sd.pakket)))
    for (const r of set.tg1.regels) {
      const stuk = pak.kop.stukken.findIndex((s) => s.o3d.toLowerCase() === r.o3d.toLowerCase())
      const verm = pak.kop.vermeldingen.find((v) => v.stuk === stuk)
      const mat = verm?.materialen[r.groep]
      const goed =
        Boolean(mat) &&
        (r.alfa === undefined || mat!.alfa === r.alfa) &&
        (r.nietSchrijven === undefined || Boolean(mat!.nietSchrijven) === r.nietSchrijven)
      toets(`T-G1 ${r.o3d} groep ${r.groep}`, goed, mat ? `alfa ${mat.alfa}, noZwrite ${Boolean(mat.nietSchrijven)}` : 'niet gevonden')
    }
  }

  // ---------------------------------------------------------- textuurplan: DXT-begin
  console.log('\n== textuurPlan: een DXT-begin moet in beide zijden deelbaar zijn door 4 ==')
  {
    const dxt = (naam: string, b: number, h: number, mips: number, oppervlak: number): Bus3dTextuur => ({
      id: createHash('sha1').update(naam).digest('hex'),
      soort: 'dxt',
      formaat: 'bc1',
      srgb: true,
      b,
      h,
      mips,
      vorm: 'DXT1',
      bytes: 0,
      oppervlak,
      uv: 1,
      naam
    })
    // Een piepklein buitenoppervlak: de dichtheid wil zoveel mogelijk niveaus overslaan.
    const klein = [dxt('Sticker 1000', 1000, 1000, 10, 1e-6), dxt('wzorek 64', 64, 64, 7, 1e-6), dxt('Seitenrollo 64x32', 64, 32, 7, 1e-6), dxt('werbung 512x372', 512, 372, 10, 1e-6), dxt('carrosserie 4096x2048', 4096, 2048, 13, 1e-6)]
    const plan = textuurPlan(klein, 160 * 1024 * 1024)
    const zijden = plan.regels.map((r) => `${r.b}x${r.h}`).join(', ')
    toets('textuurPlan (dichtheid): 1000² -> 500², 64² -> 4², 64x32 -> 8x4, 512x372 blijft, 4096x2048 -> 8x4', zijden === '500x500, 4x4, 8x4, 512x372, 8x4', zijden)
    // Het budget: een textuur die niet verder mag zakken, maakt de bus te zwaar in plaats van een ongeldig begin.
    const budget = textuurPlan([dxt('Kasse 1000', 1000, 1000, 10, 100)], 1)
    toets('textuurPlan (budget): 1000² zakt tot 500², niet tot 250²', budget.regels[0].b === 500 && budget.teZwaar, `${budget.regels[0].b}x${budget.regels[0].h}, te zwaar ${budget.teZwaar}`)
    toets('dxtMaxOverslaan: 1000² 1, 250x298 0, 4096x2048 9', dxtMaxOverslaan({ b: 1000, h: 1000, mips: 10 }) === 1 && dxtMaxOverslaan({ b: 500, h: 596, mips: 10 }) === 0 && dxtMaxOverslaan({ b: 4096, h: 2048, mips: 13 }) === 9)
  }

  // ---------------------------------------------------------- CTC op de texturen die de cfg noemt
  console.log('\n== CTC: een kleurstelling vervangt ook transmap, masker en lightmap ==')
  {
    const nlc = set.bussen.find((b) => b.naam === 'NLC 12C')!
    const z = cache.zoek(OMSI, nlc.pad)
    const trans = z?.manifest.texturen.findIndex((t) => t.naam.toLowerCase() === '12c_2d_01_trans.dds') ?? -1
    toets('NLC 12C: 12C_2d_01_trans.dds (transmap) heeft zijn CTC-plek', trans >= 0 && z!.manifest.texturen[trans].ctc === 'Farbschema_12C_2door_trans', trans >= 0 ? String(z!.manifest.texturen[trans].ctc) : 'niet in het manifest')
    if (z) {
      const uit = (await bus3dWerk({ soort: 'bus3d:lak', pakket: z.pakket, kleurstelling: 'Rheinhausen' }, OMSI, cache)) as { lak: Bus3dLak }
      const vervangen = uit.lak.texturen.find((x) => x.plek === trans)
      toets('NLC 12C "Rheinhausen": de transmap wordt vervangen door Rheinhausen_Trans.dds', vervangen?.textuur.naam.toLowerCase() === 'rheinhausen_trans.dds', `${uit.lak.texturen.length} vervangen: ${uit.lak.texturen.map((x) => x.textuur.naam).join(', ')}`)
    }
  }

  // ---------------------------------------------------------- T-V1
  console.log('\n== T-V1: de tweeling ==')
  {
    const a = readFileSync(join(OMSI, set.tweeling.gehusseld))
    const b = ontleedO3d(readFileSync(join(OMSI, set.tweeling.open))).model!
    const la = ontleedO3d(a, { gehusseld: true }).model!
    const n = la.hussel!.n
    const blok = new Float32Array(new Uint8Array(a.subarray(la.hoekpuntBegin!, la.hoekpuntBegin! + n * 32)).buffer)
    let voor = 0
    for (let i = 0; i < n; i++) if (blok[i * 8] === b.vertices[i * 3] && blok[i * 8 + 1] === b.vertices[i * 3 + 1] && blok[i * 8 + 2] === b.vertices[i * 3 + 2]) voor++
    ontwar(blok, la.hussel!)
    let pos = 0
    let nor = 0
    for (let i = 0; i < n; i++) {
      if (blok[i * 8] === b.vertices[i * 3] && blok[i * 8 + 1] === b.vertices[i * 3 + 1] && blok[i * 8 + 2] === b.vertices[i * 3 + 2]) pos++
      if (blok[i * 8 + 3] === b.normals[i * 3] && blok[i * 8 + 4] === b.normals[i * 3 + 1] && blok[i * 8 + 5] === b.normals[i * 3 + 2]) nor++
    }
    toets(
      `T-V1 21_aussen_weich3 (sleutel ${la.hussel!.sleutel}, versie ${la.hussel!.versie}, vlag ${la.hussel!.vlag})`,
      n === set.tweeling.hoekpunten && pos === n && nor === n,
      `${n} hoekpunten; posities gelijk vóór ontwarren ${voor}, erna ${pos}; normalen ${nor}`
    )
  }

  // ---------------------------------------------------------- T-V3 en T-V2
  console.log('\n== T-V3 (en T-V2): de 26 icoonbussen met de registratie van deze pc ==')
  let pakketten = 0
  for (const pad of set.tv3.bussen) {
    const { uit } = await bouwEnSchrijf(cache, pad, reg.sleutels)
    const icoon = set.tv3.icoon.includes(pad)
    if ('reden' in uit) {
      toets(`T-V3 ${pad}`, icoon && uit.reden === 'versleuteld' && Boolean(uit.sleutels?.includes(12411)), `${uit.reden}: ${uit.detail}`)
      continue
    }
    pakketten++
    const m = uit.zijspoor.manifest
    const d = uit.doostoets as { gehusseld: number; gehusseldBuiten: number; open: number; openBuiten: number } | undefined
    const pct = d && d.gehusseld ? (100 * d.gehusseldBuiten) / d.gehusseld : 0
    const pctOpen = d && d.open ? (100 * d.openBuiten) / d.open : 0
    toets(
      `T-V3 ${pad}`,
      !icoon,
      `pakket, sleutels [${m.sleutels.join(', ')}], ontward ${m.telling.ontward}, versleuteld ${m.telling.versleuteld}; ` +
        `T-V2 doos (breedte en hoogte): gehusseld buiten ${pct.toFixed(2)}%, open ${pctOpen.toFixed(2)}%`
    )
    if (d && d.gehusseld) toets(`T-V2 ${pad}`, pct <= 1, `${pct.toFixed(2)}% buiten de doos + 0,5 m`)
    // Tegenproef: dezelfde blokken met een verkeerde sleutel moeten een waaier geven.
    if (d && d.gehusseld) {
      const tegen = tegenproef(cache, uit.zijspoor.pakket, m)
      toets(`T-V2 tegenproef ${pad} (sleutel + 1)`, tegen > 1, `${tegen.toFixed(1)}% buiten`)
    }
  }
  toets('T-V3 25 van de 26 een pakket', pakketten === 25, `${pakketten}`)

  // ---------------------------------------------------------- T-V4
  console.log('\n== T-V4: dezelfde 26 met een lege registratie (alleen sleutel 0) ==')
  const leeg = new Bus3dCache(join(tijdelijk, 'leeg'))
  let versleuteld = 0
  let nulGoed = 0
  for (const pad of set.tv3.bussen) {
    const { uit } = await bouwEnSchrijf(leeg, pad, new Set())
    if (set.tv3.nul.includes(pad)) {
      if (!('reden' in uit)) nulGoed++
      else toets(`T-V4 ${pad} (sleutel 0)`, false, uit.reden)
    } else if ('reden' in uit && uit.reden === 'versleuteld') versleuteld++
    else toets(`T-V4 ${pad}`, false, 'reden' in uit ? uit.reden : 'toch een pakket')
  }
  toets('T-V4 lege registratie: 22 versleuteld (21 + GU240), de 4 MAN NL/NG een pakket', versleuteld === 22 && nulGoed === 4, `${versleuteld} versleuteld, ${nulGoed} van 4`)

  // ---------------------------------------------------------- T-V5
  console.log('\n== T-V5: geen ontwarde meetkunde op schijf ==')
  const cacheMap = cache.map
  const vreemd: string[] = []
  const loop = (map: string): void => {
    for (const e of readdirSync(map, { withFileTypes: true })) {
      const p = join(map, e.name)
      if (e.isDirectory()) loop(p)
      else if (
        !/[\\/]p[\\/][0-9a-f]{40}\.(b3d|json)$/.test(p) &&
        !/[\\/]bus[\\/][0-9a-f]{40}$/.test(p) &&
        // F2: de ruststand (s/: zichtbaarheid en vars) en heldenbeelden (h/: plaatjes) zijn geen meetkunde.
        !/[\\/]s[\\/][0-9a-f]{40}-[0-9a-f]{24}\.json$/.test(p) &&
        !/[\\/]h[\\/][0-9a-f]{40}-[0-9a-f]{16}-[a-z0-9-]+\.webp$/.test(p)
      )
        vreemd.push(p)
    }
  }
  loop(cacheMap)
  toets(
    'T-V5 in de cache alleen p/<id>.b3d, p/<id>.json, bus/<id>, s/<id>-<stempel>.json en h/<id>-...webp',
    vreemd.length === 0,
    vreemd.slice(0, 3).join(', ')
  )
  let blokken = 0
  let gelijk = 0
  let ontwardOpSchijf = 0
  let grootZijspoor = 0
  for (const { pakket } of cache.inhoud()) {
    const z = cache.zijspoor(pakket)!
    if (statSync(join(cacheMap, 'p', `${pakket}.json`)).size > 4 * 1048576) grootZijspoor++
    const pak = leesPakket(readFileSync(cache.pakketPad(pakket)))
    const o3ds = z.bronnen.filter((b) => /\.o3d$/i.test(b.pad))
    for (const s of pak.kop.stukken) {
      if (!s.hussel) continue
      blokken++
      const opgeslagen = pak.staart.subarray(s.hoekpunten.off, s.hoekpunten.off + s.hoekpunten.len)
      const h = createHash('sha1').update(opgeslagen).digest('hex')
      let raak = false
      for (const b of o3ds.filter((o) => basename(o.pad).toLowerCase() === s.o3d.toLowerCase())) {
        const bytes = readFileSync(b.pad)
        const m = ontleedO3d(bytes, { gehusseld: true }).model
        if (!m?.hoekpuntBegin) continue
        const bron = bytes.subarray(m.hoekpuntBegin, m.hoekpuntBegin + m.hussel!.n * 32)
        if (createHash('sha1').update(bron).digest('hex') === h) raak = true
      }
      if (raak) gelijk++
      // En het is echt niet het ontwarde blok (tenzij ontwarren niets verandert).
      const kopie = new Float32Array(new Uint8Array(opgeslagen).buffer)
      const voor = createHash('sha1').update(new Uint8Array(kopie.buffer)).digest('hex')
      ontwar(kopie, { ...s.hussel, n: s.n })
      if (createHash('sha1').update(new Uint8Array(kopie.buffer)).digest('hex') === voor) ontwardOpSchijf++
    }
  }
  toets('T-V5 elk gehusseld blok byte voor byte gelijk aan het bronbestand', blokken > 0 && gelijk === blokken, `${gelijk} van ${blokken}`)
  toets('T-V5 geen enkel opgeslagen blok is al ontward', ontwardOpSchijf === 0, `${ontwardOpSchijf}`)
  toets('T-V5 zijsporen klein (geen meetkunde erin)', grootZijspoor === 0)
}

/**
 * De tegenproef van de doostoets: de gehusselde blokken uit het pakket met
 * sleutel + 1 ontwarren en tellen hoeveel er in breedte of hoogte buiten de doos
 * + 0,5 m valt. De doos zoals in core/bus3d.ts: [boundingbox] samen met de open
 * hoekpunten (hier grof: hun uitersten zonder de verste 1%).
 */
function tegenproef(cache: Bus3dCache, pakket: string, m: Bus3dManifest): number {
  const pak = leesPakket(readFileSync(cache.pakketPad(pakket)))
  const lo = [...m.doos.min]
  const hi = [...m.doos.max]
  const open: number[][] = [[], []]
  for (const s of pak.kop.stukken) {
    if (s.hussel) continue
    const f = new Float32Array(pak.staart.slice(s.hoekpunten.off, s.hoekpunten.off + s.hoekpunten.len).buffer)
    for (let o = 0; o < f.length; o += 64) {
      open[0].push(f[o] + m.delen[s.deel].verschuiving[0])
      open[1].push(f[o + 1] + m.delen[s.deel].verschuiving[1])
    }
  }
  for (let k = 0; k < 2; k++) {
    if (open[k].length < 64) continue
    open[k].sort((a, b) => a - b)
    lo[k] = Math.min(lo[k], open[k][Math.floor(open[k].length * 0.01)])
    hi[k] = Math.max(hi[k], open[k][Math.floor(open[k].length * 0.99)])
  }
  let n = 0
  let buiten = 0
  for (const s of pak.kop.stukken) {
    if (!s.hussel) continue
    const f = new Float32Array(pak.staart.slice(s.hoekpunten.off, s.hoekpunten.off + s.hoekpunten.len).buffer)
    ontwar(f, { ...s.hussel, sleutel: s.hussel.sleutel + 1, n: s.n })
    const v = m.delen[s.deel].verschuiving
    for (let o = 0; o < f.length; o += 8) {
      n++
      const x = f[o] + v[0]
      const y = f[o + 1] + v[1]
      if (x < lo[0] - 0.5 || x > hi[0] + 0.5 || y < lo[1] - 0.5 || y > hi[1] + 0.5) buiten++
    }
  }
  return n ? (100 * buiten) / n : 0
}

// ------------------------------------------------------------ het protocol op een nagebootste OMSI-map
async function protocol(): Promise<void> {
  console.log('\n== Protocol omsi3d:// en de registratietoets, op een nagebootste OMSI-map ==')
  const bib = join(tijdelijk, 'steam', 'steamapps')
  const nep = join(bib, 'common', 'OMSI 2')
  const busmap = join(nep, 'Vehicles', 'Proef')
  mkdirSync(join(busmap, 'Model'), { recursive: true })
  mkdirSync(join(busmap, 'Texture'), { recursive: true })
  mkdirSync(join(nep, 'RegAddons'), { recursive: true })
  mkdirSync(join(nep, 'Texture'), { recursive: true })
  writeFileSync(join(nep, 'addons.ini'), '')
  // Eén gehusselde o3d (sleutel 15657) en één open o3d, met hun texturen.
  const bronBus = join(OMSI, 'Vehicles', 'HH20_EBus2021')
  const o3ds = ['21_aussen_weich3.o3d', '21_aussen_weich3_#low.o3d']
  for (const o of o3ds) copyFileSync(join(bronBus, 'Model', o), join(busmap, 'Model', o))
  const namen = new Set<string>()
  for (const o of o3ds) for (const m of ontleedO3d(readFileSync(join(bronBus, 'Model', o)), { gehusseld: true }).model!.materialen) if (m.textuur) namen.add(m.textuur)
  // En een DXT-textuur met mipketen, voor de Range-proef: de carrosserie van de SD77 volstaat niet (BMP); neem de NLC.
  const dxt = join(OMSI, 'Vehicles', 'MAN_NewLionsCity', 'Texture', '12C_2d_01.dds')
  copyFileSync(dxt, join(busmap, 'Texture', 'dxtproef.dds'))
  for (const naam of namen) {
    for (const map of [join(bronBus, 'Texture'), join(OMSI, 'Texture')]) {
      try {
        copyFileSync(join(map, naam), join(busmap, 'Texture', naam))
        break
      } catch {
        // volgende map
      }
    }
  }
  const cfg = [
    '[mesh]',
    '21_aussen_weich3.o3d',
    '',
    '[mesh]',
    '21_aussen_weich3_#low.o3d',
    '[matl]',
    [...namen][0] ?? 'x.dds',
    '0',
    '[matl_transmap]',
    'dxtproef.dds',
    ''
  ].join('\r\n')
  writeFileSync(join(busmap, 'Model', 'model.cfg'), cfg)
  const bus = (naam: string): string =>
    ['[friendlyname]', 'Proef', naam, 'Wit', '', '[model]', 'Model\\model.cfg', '', '[boundingbox]', '3', '14', '4', '0', '0', '2', ''].join('\r\n')
  for (const n of ['Proef', 'Proef2', 'Proef3']) writeFileSync(join(busmap, `${n}.bus`), bus(n))
  const ini = join(nep, 'RegAddons', 'Linie20_15657.ini')
  writeFileSync(ini, '[addon.0]\r\nName=Proef Linie 20\r\nArtNr=15657\r\nSteamname=Proef\r\nSteamArtNr=1889540')
  writeFileSync(join(bib, 'appmanifest_252530.acf'), '"AppState"\n{\n\t"InstalledDepots"\n\t{\n\t\t"1889540"\n\t\t{\n\t\t\t"dlcappid"\t\t"1889540"\n\t\t}\n\t}\n}\n')

  const ud = join(tijdelijk, 'ud-protocol')
  const werkCache = new Bus3dCache(ud)
  const logregels: string[] = []
  let vertraging = 0
  const dienst = maakBus3dDienst({
    userData: () => ud,
    omsi: () => nep,
    werkerVraag: async <T>(opdracht: Record<string, unknown>, tussen?: (b: unknown) => void): Promise<T> => {
      if (vertraging) await new Promise((k) => setTimeout(k, vertraging))
      return (await bus3dWerk(opdracht as Bus3dOpdracht, nep, werkCache, tussen)) as T
    },
    sluitWerker: () => undefined,
    log: (r) => logregels.push(r),
    logFout: (w, f) => logregels.push(`FOUT ${w}: ${String(f)}`),
    tijden: { rust: 50 }
  })
  const antwoord = await dienst.model3d('Vehicles\\Proef\\Proef.bus')
  if (!('manifest' in antwoord)) {
    toets('protocol: pakket van de nagebootste bus', false, `${antwoord.reden} ${antwoord.detail ?? ''}`)
    return
  }
  const m = antwoord.manifest
  toets('protocol: pakket met sleutel 15657 (geregistreerd, bevestigd)', m.sleutels.includes(15657), `sleutels [${m.sleutels.join(', ')}]`)
  const haal = (url: string, kop?: Record<string, string>): Promise<Response> => dienst.antwoord(new Request(url, { headers: kop }))
  const p = await haal(`omsi3d://p/${m.pakket}`)
  const pBytes = new Uint8Array(await p.arrayBuffer())
  const opSchijf = readFileSync(dienst.cache.pakketPad(m.pakket))
  toets('protocol: p/<id> geeft het pakket', p.status === 200 && Buffer.compare(Buffer.from(pBytes), opSchijf) === 0, `${p.status}, ${pBytes.length} bytes`)
  const t = m.texturen.find((x) => x.naam === 'dxtproef.dds')
  if (!t?.niveaus || t.niveaus.length < 2) toets('protocol: DXT-textuur met mipketen in het manifest', false, JSON.stringify(t))
  else {
    const van = t.niveaus[1].off
    const tot = t.niveaus[t.niveaus.length - 1].off + t.niveaus[t.niveaus.length - 1].len - 1
    const r = await haal(`omsi3d://t/${t.id}`, { Range: `bytes=${van}-${tot}` })
    const stuk = new Uint8Array(await r.arrayBuffer())
    const echt = readFileSync(join(busmap, 'Texture', 'dxtproef.dds')).subarray(van, tot + 1)
    toets('protocol: t/<id> met Range geeft de DXT-niveaus 1..n (206)', r.status === 206 && Buffer.compare(Buffer.from(stuk), echt) === 0, `${r.status}, ${stuk.length} bytes (${t.b}x${t.h}, ${t.mips} niveaus, ${t.soort})`)
    const heel = await haal(`omsi3d://t/${t.id}`)
    toets('protocol: t/<id> zonder Range geeft het hele bestand', heel.status === 200 && (await heel.arrayBuffer()).byteLength === t.bytes)
    // Het bestand verandert (een nieuwe versie van de add-on): 409.
    const later = new Date(Date.now() + 5000)
    utimesSync(join(busmap, 'Texture', 'dxtproef.dds'), later, later)
    const r409 = await haal(`omsi3d://t/${t.id}`)
    toets('protocol: t/<id> na een gewijzigd bestand geeft 409', r409.status === 409, `${r409.status}`)
  }
  toets('protocol: onbekend id geeft 404', (await haal(`omsi3d://t/${'0'.repeat(40)}`)).status === 404)
  toets('protocol: een pad in plaats van een id geeft 404', (await haal('omsi3d://t/..%5C..%5CWindows%5Cwin.ini')).status === 404)

  // De rij: drie vragen tegelijk; de middelste wordt vervangen door de laatste.
  vertraging = 30
  const [a1, a2, a3] = await Promise.all([
    dienst.model3d('Vehicles\\Proef\\Proef2.bus'),
    dienst.model3d('Vehicles\\Proef\\Proef3.bus'),
    dienst.model3d('Vehicles\\Proef\\Proef.bus')
  ])
  vertraging = 0
  toets(
    "rij: de middelste van drie vragen krijgt 'vervangen', de nieuwste wint",
    'manifest' in a1 && 'reden' in a2 && a2.reden === 'vervangen' && 'manifest' in a3,
    `${'reden' in a1 ? a1.reden : 'pakket'} / ${'reden' in a2 ? a2.reden : 'pakket'} / ${'reden' in a3 ? a3.reden : 'pakket'}`
  )

  // Het tussenbericht `lijst`: de texturen staan al in het register terwijl de werker nog bouwt.
  let tijdensLijst: Promise<Response> | undefined
  let padenInBericht = false
  const soorten: string[] = []
  const venster = {
    isDestroyed: () => false,
    send: (kanaal: string, b: { stap?: string; lijst?: Array<{ id: string; naam: string }> }) => {
      if (kanaal !== 'bus3d:voortgang') return
      soorten.push(String(b.stap))
      if (b.stap !== 'lijst') return
      if ('bronnen' in b || JSON.stringify(b).includes(tijdelijk.replace(/\\/g, '\\\\'))) padenInBericht = true
      const t = b.lijst?.find((x) => x.naam === 'dxtproef.dds')
      if (t) tijdensLijst = haal(`omsi3d://t/${t.id}`)
    }
  } as unknown as WebContents
  await dienst.model3d('Vehicles\\Proef\\Proef3.bus', undefined, venster)
  const tijdens = await tijdensLijst
  toets(
    'voortgang: bij het tussenbericht lijst werkt t/<id> al (200), zonder paden naar het venster',
    tijdens?.status === 200 && !padenInBericht,
    `berichten ${soorten.join(', ')}; t/ ${tijdens?.status}`
  )

  // De add-on gaat weg: de sleutel is niet meer geregistreerd.
  rmSync(ini)
  const p403 = await haal(`omsi3d://p/${m.pakket}`)
  toets('registratie: p/<id> na het verdwijnen van de sleutel geeft 403 (of 404: vergeten)', p403.status === 403 || p403.status === 404, `${p403.status}`)
  const opnieuw = await dienst.model3d('Vehicles\\Proef\\Proef.bus')
  toets("registratie: daarna geeft de bus 'versleuteld' (het icoon)", 'reden' in opnieuw && opnieuw.reden === 'versleuteld', 'reden' in opnieuw ? `${opnieuw.reden}: ${opnieuw.detail}` : 'pakket')
  toets('registratie: logregels "bus3d sleutels"', logregels.some((r) => r.startsWith('bus3d sleutels: geregistreerd [15657]')), logregels.filter((r) => r.startsWith('bus3d sleutels')).join(' | '))
  console.log('logregels van de dienst:')
  for (const r of logregels) console.log(`   ${r}`)
}

// ------------------------------------------------------------ randgevallen (de tegenlezing van F1)
/*
 * Elk punt uit de tegenlezing van F1 (aanvaller en proefdraaier) dat een fout
 * bleek, met een proef die het vastlegt. Alles op nagebootste OMSI-mappen in de
 * tijdelijke map; uit de echte installatie wordt alleen gekopieerd (één open o3d
 * en zijn textuur) en, voor de cachegrens, gelezen.
 */
const OPEN_O3D = join(OMSI, 'Vehicles', 'HH20_EBus2021', 'Model', '21_aussen_weich3_#low.o3d')
const OPEN_TEX = join(OMSI, 'Vehicles', 'HH20_EBus2021', 'Texture', 'newC2EG_#low.tga')
const R = '\r\n'
const busTekst = (naam: string): string =>
  ['[friendlyname]', 'Proef', naam, 'Wit', '', '[model]', 'Model\\model.cfg', '', '[boundingbox]', '3', '14', '4', '0', '0', '2', ''].join(R)
const slaap = (ms: number): Promise<void> => new Promise((k) => setTimeout(k, ms))
const uitkomst = (u: Bus3dAntwoord | { reden: string }): string => ('manifest' in u ? 'pakket' : u.reden)

/** Een nagebootste OMSI-map met Vehicles\Proef: één open o3d en zijn textuur, en de .bus-bestanden. */
function nepOmsi(naam: string, cfg: string[], bussen: string[]): { nep: string; bib: string; busmap: string } {
  const bib = join(tijdelijk, naam, 'steamapps')
  const nep = join(bib, 'common', 'OMSI 2')
  const busmap = join(nep, 'Vehicles', 'Proef')
  mkdirSync(join(busmap, 'Model'), { recursive: true })
  mkdirSync(join(busmap, 'Texture'), { recursive: true })
  mkdirSync(join(nep, 'Texture'), { recursive: true })
  writeFileSync(join(nep, 'addons.ini'), '')
  copyFileSync(OPEN_O3D, join(busmap, 'Model', 'open.o3d'))
  copyFileSync(OPEN_TEX, join(busmap, 'Texture', 'newC2EG_#low.tga'))
  writeFileSync(join(busmap, 'Model', 'model.cfg'), cfg.join(R))
  for (const b of bussen) writeFileSync(join(busmap, `${b}.bus`), busTekst(b))
  return { nep, bib, busmap }
}

/**
 * De dienst van main met een nagebootste werker zoals index.ts hem heeft: een
 * vraag kan een vertraging krijgen, en `sluitWerker` laat iedereen die nog wacht
 * falen (zoals `stuurWachtendenWeg` na `terminate`).
 */
function nepDienst(nep: string, ud: string, rust: number, vertraging: Record<string, number>, log: string[]): ReturnType<typeof maakBus3dDienst> {
  const cache = new Bus3dCache(ud)
  let werker = 1
  const wachtend = new Set<(f: Error) => void>()
  return maakBus3dDienst({
    userData: () => ud,
    omsi: () => nep,
    werkerVraag: <T>(opdracht: Record<string, unknown>, tussen?: (b: unknown) => void): Promise<T> =>
      new Promise<T>((klaar, fout) => {
        const mijn = werker
        wachtend.add(fout)
        setTimeout(async () => {
          try {
            const uit = (await bus3dWerk(opdracht as Bus3dOpdracht, nep, cache, tussen)) as T
            if (mijn !== werker) return
            wachtend.delete(fout)
            klaar(uit)
          } catch (e) {
            wachtend.delete(fout)
            fout(e as Error)
          }
        }, vertraging[String(opdracht.soort)] ?? 0)
      }),
    sluitWerker: () => {
      log.push('sluitWerker()')
      werker++
      for (const f of [...wachtend]) f(new Error('werker bus3d is gestopt (1)'))
      wachtend.clear()
    },
    log: (r) => log.push(r),
    logFout: (w, f) => log.push(`FOUT ${w}: ${String(f)}`),
    tijden: { rust, stil: 20_000 }
  })
}

/** Een venster dat alleen onthoudt wat main het stuurt. */
function nepVenster(id: number): { venster: WebContents; vervangen: string[]; wachtOpVervangen: (ms: number) => Promise<string | undefined> } {
  const vervangen: string[] = []
  let wekker: ((p: string) => void) | undefined
  const venster = {
    id,
    isDestroyed: () => false,
    send: (kanaal: string, b: unknown) => {
      if (kanaal !== 'bus3d:vervangen') return
      vervangen.push(String(b))
      wekker?.(String(b))
    }
  } as unknown as WebContents
  const wachtOpVervangen = (ms: number): Promise<string | undefined> =>
    new Promise((k) => {
      wekker = k
      setTimeout(() => k(undefined), ms)
    })
  return { venster, vervangen, wachtOpVervangen }
}

async function randgevallen(): Promise<void> {
  console.log('\n== Randgevallen uit de tegenlezing van F1 ==')
  const eenMesh = ['[mesh]', 'open.o3d', '']

  // -------------------------------------------------------- registratie (aanval 1)
  {
    const { nep, bib } = nepOmsi('reg', eenMesh, [])
    mkdirSync(join(nep, 'RegAddons'), { recursive: true })
    writeFileSync(join(bib, 'appmanifest_252530.acf'), '"AppState"\n{\n\t"InstalledDepots"\n\t{\n\t\t"1889540"\n\t\t{\n\t\t\t"dlcappid"\t\t"1889540"\n\t\t}\n\t}\n}\n')
    // Twee keer [addon.0]: Windows leest alleen de eerste (ArtNr 11111, zonder SteamArtNr).
    writeFileSync(join(nep, 'RegAddons', 'Dubbel.ini'), '[addon.0]\r\nName=Eerste\r\nArtNr=11111\r\n\r\n[addon.0]\r\nName=Tweede\r\nArtNr=22222\r\nSteamArtNr=1889540\r\n')
    // Buiten Integer: Delphi's StrToInt weigert; wij maakten er modulo 2^32 sleutel 11726 van.
    writeFileSync(join(nep, 'RegAddons', 'Groot.ini'), '[addon.0]\r\nName=Groot\r\nArtNr=4294979022\r\nSteamArtNr=1889540\r\n')
    writeFileSync(join(nep, 'RegAddons', 'Goed.ini'), '[addon.0]\r\nName=Goed\r\nArtNr=15657\r\nSteamArtNr=1889540\r\n')
    const r = leesOmsiRegistratie(nep)
    toets('registratie: dubbele [addon.0] niet samengevoegd, ArtNr > 2^31-1 geweigerd; alleen 15657', [...r.sleutels].join(',') === '15657', `sleutels [${[...r.sleutels].join(', ')}]; ${r.vermeldingen.map((v) => `${v.artNr}: ${v.waarom}`).join('; ')}`)
    const ini = leesIni('[a]\r\nx=1\r\n[A]\r\nx=2\r\ny=3\r\n')
    toets('leesIni: bij een dubbele sectie telt alleen de eerste', ini.get('a')?.get('x') === '1' && !ini.get('a')?.has('y'))
  }

  // -------------------------------------------------------- de rustklok (aanval 5)
  {
    const { nep } = nepOmsi('rust', eenMesh, ['A', 'B'])
    const log: string[] = []
    const vertraging: Record<string, number> = {}
    const dienst = nepDienst(nep, join(tijdelijk, 'rust', 'ud'), 300, vertraging, log)
    await dienst.model3d('Vehicles\\Proef\\A.bus') // klaar: de rustklok loopt (300 ms)
    await slaap(250)
    vertraging['bus3d:model'] = 200 // B begint 50 ms voor het eind van de rust en bouwt 200 ms
    const b = await dienst.model3d('Vehicles\\Proef\\B.bus')
    vertraging['bus3d:model'] = 0
    toets('rustklok: een vraag die vlak voor de 120 s begint, wordt niet onder zich weggesloten', uitkomst(b) === 'pakket', `${uitkomst(b)}; ${log.filter((l) => l.startsWith('sluit') || l.startsWith('FOUT')).join(' | ')}`)
    const voor = log.filter((l) => l === 'sluitWerker()').length
    await slaap(450)
    toets('rustklok: na de rust na de laatste vraag gaat de werker wel dicht', voor === 0 && log.filter((l) => l === 'sluitWerker()').length === 1, `sluitWerker voor ${voor}, erna ${log.filter((l) => l === 'sluitWerker()').length}`)
  }

  // -------------------------------------------------------- de rij en de achtergrond (aanval 2)
  {
    const { nep, busmap } = nepOmsi('rij', eenMesh, ['A', 'B', 'C', 'D'])
    const log: string[] = []
    const vertraging: Record<string, number> = {}
    const dienst = nepDienst(nep, join(tijdelijk, 'rij', 'ud'), 60_000, vertraging, log)
    const { venster } = nepVenster(1)
    await dienst.model3d('Vehicles\\Proef\\A.bus', undefined, venster)
    await dienst.model3d('Vehicles\\Proef\\B.bus', undefined, venster)
    // (1) A komt uit de cache maar is verouderd; de speler klikt C en meteen D.
    await slaap(20)
    const later = new Date(Date.now() + 10_000)
    utimesSync(join(busmap, 'A.bus'), later, later)
    vertraging['bus3d:controle'] = 30
    vertraging['bus3d:model'] = 150
    const a = dienst.model3d('Vehicles\\Proef\\A.bus', undefined, venster)
    await slaap(1)
    const c = dienst.model3d('Vehicles\\Proef\\C.bus', undefined, venster)
    await slaap(10)
    const d = dienst.model3d('Vehicles\\Proef\\D.bus', undefined, venster)
    const [ra, rc, rd] = await Promise.all([a, c, d])
    toets(
      'rij: de herbouw na de controle verdringt de nieuwste keuze van de speler niet',
      uitkomst(ra) === 'pakket' && uitkomst(rc) === 'pakket' && uitkomst(rd) === 'pakket',
      `A ${uitkomst(ra)}, C ${uitkomst(rc)}, D (de laatste keuze) ${uitkomst(rd)}`
    )
    // (2) B verouderd; terwijl de speler op C wacht, wacht de herbouw van B; de speler klikt D: die gaat voor.
    await slaap(300)
    log.length = 0
    const later2 = new Date(Date.now() + 20_000)
    utimesSync(join(busmap, 'B.bus'), later2, later2)
    rmSync(join(tijdelijk, 'rij', 'ud', 'bus3d'), { recursive: true, force: true }) // alles nieuw, behalve B:
    await (async () => {
      vertraging['bus3d:model'] = 0
      await dienst.model3d('Vehicles\\Proef\\B.bus', undefined, venster) // B nieuw in de cache
      const nu = new Date(Date.now() + 30_000)
      utimesSync(join(busmap, 'B.bus'), nu, nu) // en meteen verouderd
    })()
    log.length = 0
    vertraging['bus3d:model'] = 150
    const b2 = dienst.model3d('Vehicles\\Proef\\B.bus', undefined, venster) // cache; controle na 30 ms, dan herbouw in de wacht
    await slaap(1)
    const c2 = dienst.model3d('Vehicles\\Proef\\C.bus', undefined, venster) // bouwt 150 ms
    await slaap(60)
    const d2 = dienst.model3d('Vehicles\\Proef\\D.bus', undefined, venster) // vervangt de wachtende herbouw van B
    const [rb2, rc2, rd2] = await Promise.all([b2, c2, d2])
    await slaap(400)
    const nieuw = log.filter((l) => l.includes('bron nieuw')).map((l) => /Proef\\(\w)\.bus/.exec(l)?.[1]).join('')
    toets(
      'rij: een vraag van de speler vervangt een wachtende achtergrondbeurt',
      uitkomst(rb2) === 'pakket' && uitkomst(rc2) === 'pakket' && uitkomst(rd2) === 'pakket' && nieuw === 'CD',
      `B ${uitkomst(rb2)}, C ${uitkomst(rc2)}, D ${uitkomst(rd2)}; nieuw gebouwd: ${nieuw}`
    )
    vertraging['bus3d:model'] = 0
    vertraging['bus3d:controle'] = 0
  }

  // -------------------------------------------------------- verouderd en de herbouw mislukt (aanval 7)
  {
    const { nep, busmap } = nepOmsi('weg', eenMesh, ['A'])
    const log: string[] = []
    const dienst = nepDienst(nep, join(tijdelijk, 'weg', 'ud'), 60_000, {}, log)
    const { venster, wachtOpVervangen } = nepVenster(2)
    const eerst = await dienst.model3d('Vehicles\\Proef\\A.bus', undefined, venster)
    const oud = 'manifest' in eerst ? eerst.manifest.pakket : ''
    rmSync(join(busmap, 'Model'), { recursive: true, force: true }) // het model is weg
    const gemeld = wachtOpVervangen(3000)
    const tweede = await dienst.model3d('Vehicles\\Proef\\A.bus', undefined, venster) // nog het oude (eerst tonen)
    const vervangen = await gemeld
    const p = await dienst.antwoord(new Request(`omsi3d://p/${oud}`))
    const derde = await dienst.model3d('Vehicles\\Proef\\A.bus', undefined, venster)
    toets(
      "verouderd + herbouw mislukt: het oude pakket vergeten, 'bus3d:vervangen' naar het venster, daarna de reden",
      uitkomst(tweede) === 'pakket' && vervangen === oud && p.status === 404 && uitkomst(derde) === 'geen-model',
      `tweede ${uitkomst(tweede)}, vervangen ${vervangen === oud ? 'gemeld' : String(vervangen)}, p/ ${p.status}, derde ${uitkomst(derde)}`
    )
  }

  // -------------------------------------------------------- een afgekapt pakket (aanval 8)
  {
    const { nep } = nepOmsi('stuk', eenMesh, ['A'])
    const log: string[] = []
    const ud = join(tijdelijk, 'stuk', 'ud')
    const dienst = nepDienst(nep, ud, 60_000, {}, log)
    const eerst = await dienst.model3d('Vehicles\\Proef\\A.bus')
    const id = 'manifest' in eerst ? eerst.manifest.pakket : ''
    truncateSync(dienst.cache.pakketPad(id), 100)
    const tweede = await dienst.model3d('Vehicles\\Proef\\A.bus')
    const p = await dienst.antwoord(new Request(`omsi3d://p/${'manifest' in tweede ? tweede.manifest.pakket : id}`))
    let leesbaar = 'ja'
    try {
      leesPakket(new Uint8Array(await p.arrayBuffer()))
    } catch (e) {
      leesbaar = (e as Error).message
    }
    toets('afgekapt .b3d: de volgende vraag bouwt opnieuw, p/ geeft een leesbaar pakket', log.filter((l) => l.includes('bron nieuw')).length === 2 && p.status === 200 && leesbaar === 'ja', `${log.filter((l) => l.includes('bron nieuw')).length} keer nieuw, p/ ${p.status}, leesPakket ${leesbaar}`)
    // Het venster meldt een pakket stuk (bijvoorbeeld met de goede grootte maar kapotte inhoud): vergeten.
    dienst.stuk(id)
    const p2 = await dienst.antwoord(new Request(`omsi3d://p/${id}`))
    await dienst.model3d('Vehicles\\Proef\\A.bus')
    toets("'stuk' gemeld: p/ weg (404), de volgende vraag bouwt opnieuw", p2.status === 404 && log.filter((l) => l.includes('bron nieuw')).length === 3, `p/ ${p2.status}, ${log.filter((l) => l.includes('bron nieuw')).length} keer nieuw`)
  }

  // -------------------------------------------------------- bronnen: ontbrekende o3d, .dsc, cfg-geheugen (aanval 9a, 9b)
  {
    const { nep, busmap } = nepOmsi('bronnen', ['[mesh]', 'open.o3d', '', '[mesh]', 'later.o3d', ''], ['A'])
    writeFileSync(join(busmap, 'A_ENG.dsc'), '[description]\r\nOude tekst\r\n[end]\r\n')
    const cache = new Bus3dCache(join(tijdelijk, 'bronnen', 'ud'))
    const bouw = async (): Promise<Bus3dWerkerModel> => (await bus3dWerk({ soort: 'bus3d:model', relatiefPad: 'Vehicles\\Proef\\A.bus', geregistreerd: [] }, nep, cache)) as Bus3dWerkerModel
    const z1 = await bouw()
    await slaap(30)
    copyFileSync(OPEN_O3D, join(busmap, 'Model', 'later.o3d'))
    const na1 = 'zijspoor' in z1 ? pakketVerouderd(z1.zijspoor.bronnen) : 'geen pakket'
    const z2 = await bouw() // in DEZELFDE werker (hetzelfde proces): het cfg-geheugen moet later.o3d zien
    toets(
      'bronnen: een o3d die later verschijnt maakt het pakket verouderd, en de herbouw in dezelfde werker ziet hem',
      'zijspoor' in z1 && z1.zijspoor.manifest.telling.stukken === 1 && Boolean(na1) && 'zijspoor' in z2 && z2.zijspoor.manifest.telling.stukken === 2,
      `eerst ${'zijspoor' in z1 ? z1.zijspoor.manifest.telling.stukken : '-'} stuk, verouderd: ${na1 ? 'ja' : 'nee'}, daarna ${'zijspoor' in z2 ? z2.zijspoor.manifest.telling.stukken : '-'} stukken`
    )
    await slaap(30)
    writeFileSync(join(busmap, 'A_ENG.dsc'), '[description]\r\nNieuwe, langere tekst\r\n[end]\r\n')
    const na2 = 'zijspoor' in z2 ? pakketVerouderd(z2.zijspoor.bronnen) : undefined
    const z3 = await bouw()
    await slaap(30)
    writeFileSync(join(busmap, 'A_FRA.dsc'), '[description]\r\nTexte\r\n[end]\r\n')
    const na3 = 'zijspoor' in z3 ? pakketVerouderd(z3.zijspoor.bronnen) : undefined
    toets(
      'bronnen: een gewijzigde en een nieuwe .dsc maken het pakket verouderd',
      Boolean(na2) && Boolean(na3) && 'zijspoor' in z3 && z3.zijspoor.manifest.beschrijvingen?.ENG === 'Nieuwe, langere tekst',
      `gewijzigd: ${na2 ? 'verouderd' : 'niet gezien'}, nieuw: ${na3 ? 'verouderd' : 'niet gezien'}, ENG "${'zijspoor' in z3 ? z3.zijspoor.manifest.beschrijvingen?.ENG : '-'}"`
    )
  }

  // -------------------------------------------------------- kleurstellingen die erbij komen (aanval 9c)
  {
    const cfg = ['[CTC]', 'Colorscheme', 'Texture', '', '[CTCTexture]', 'Plek', 'newC2EG_#low.tga', '', ...eenMesh]
    const { nep, busmap } = nepOmsi('kleur', cfg, ['A'])
    mkdirSync(join(busmap, 'Texture', 'Rep'), { recursive: true })
    copyFileSync(OPEN_TEX, join(busmap, 'Texture', 'Rep', 'eerste.tga'))
    copyFileSync(OPEN_TEX, join(busmap, 'Texture', 'Rep', 'tweede.tga'))
    writeFileSync(join(busmap, 'Texture', 'a.cti'), ['[item]', 'Eerste', 'Plek', 'Rep\\eerste.tga', ''].join(R))
    const cache = new Bus3dCache(join(tijdelijk, 'kleur', 'ud'))
    const z = (await bus3dWerk({ soort: 'bus3d:model', relatiefPad: 'Vehicles\\Proef\\A.bus', geregistreerd: [] }, nep, cache)) as Bus3dWerkerModel
    const pakket = 'zijspoor' in z ? z.zijspoor.pakket : ''
    const lak = async (naam: string): Promise<Bus3dLak> => ((await bus3dWerk({ soort: 'bus3d:lak', pakket, kleurstelling: naam }, nep, cache)) as { lak: Bus3dLak }).lak
    const eerste = await lak('Eerste')
    await slaap(30)
    writeFileSync(join(busmap, 'Texture', 'b.cti'), ['[item]', 'Tweede', 'Plek', 'Rep\\tweede.tga', ''].join(R))
    const tweede = await lak('Tweede')
    await slaap(30)
    writeFileSync(join(busmap, 'Texture', 'a.cti'), ['[item]', 'Eerste', 'Plek', 'Rep\\eerste.tga', '', '[setvar]', 'spiegel', '1', ''].join(R))
    const opnieuw = await lak('Eerste')
    const main = leesKleurstellingen(join(busmap, 'Model', 'model.cfg'), busmap)
    toets(
      'kleurstellingen: een nieuwe .cti en een gewijzigde .cti ziet dezelfde werker meteen',
      JSON.stringify(eerste.vars) === '[["Colorscheme",0]]' && eerste.texturen.length === 1 &&
        JSON.stringify(tweede.vars) === '[["Colorscheme",1]]' && tweede.texturen.length === 1 &&
        JSON.stringify(opnieuw.vars) === '[["Colorscheme",0],["spiegel",1]]' && main?.lijst.length === 2,
      `Eerste ${JSON.stringify(eerste.vars)} (${eerste.texturen.length}), Tweede ${JSON.stringify(tweede.vars)} (${tweede.texturen.length}), Eerste daarna ${JSON.stringify(opnieuw.vars)}`
    )
  }

  // -------------------------------------------------------- de cachegrens tijdens een sessie (aanval 6, proefdraaier 3)
  {
    const grens = 6 * 1048576
    const cache = new Bus3dCache(join(tijdelijk, 'grens'), grens)
    const reg = omsiRegistratie(OMSI)
    const bussen = ['Vehicles\\MAN_SD200\\MAN_SD77.bus', 'Vehicles\\MAN_NL_NG\\MAN_EN92_main.bus', 'Vehicles\\HH_Stadtbus2017\\HHStadtbus2017_solo.bus']
    const standen: string[] = []
    let goed = true
    for (const pad of bussen) {
      const uit = (await bus3dWerk({ soort: 'bus3d:model', relatiefPad: pad, geregistreerd: [...reg.sleutels] }, OMSI, cache)) as Bus3dWerkerModel
      const totaal = cache.inhoud().reduce((s, p) => s + p.bytes, 0)
      const nieuwste = 'zijspoor' in uit && Boolean(cache.zijspoor(uit.zijspoor.pakket))
      standen.push(`${basename(pad)} ${MB(totaal)} MB`)
      if (totaal > grens || !nieuwste) goed = false
    }
    toets('cache: na elke schrijfbeurt onder de grens (6 MB), het nieuwste pakket blijft', goed && !cache.zoek(OMSI, bussen[0]), `${standen.join(', ')}; SD77 ${cache.zoek(OMSI, bussen[0]) ? 'nog' : 'weg'}`)
  }
}

// ------------------------------------------------------------ alles
async function alles(): Promise<void> {
  /*
   * De lijst van de app (listVehicles: wat de buskeuze toont) samen met alle
   * .bus-bestanden met [friendlyname] (ook KI-bussen en dummies die de app niet
   * toont). Alleen [friendlyname] miste 8 bestuurbare bussen: HH-Stadtbus96/97,
   * de C2G solo, MAN 21C 4door Voith, 10C 2/3door ZF en de O305 E2H 84
   * (proefdraaier F1, bevinding 1).
   */
  console.log('\n== Alle bussen: listVehicles (de buskeuze) samen met elke .bus met [friendlyname] ==')
  const reg = omsiRegistratie(OMSI)
  const app = listVehicles(OMSI).map((v) => v.relativePath)
  const paden: string[] = [...app]
  const gezien = new Set(app.map((p) => p.toLowerCase()))
  let metNaam = 0
  const V = join(OMSI, 'Vehicles')
  for (const map of readdirSync(V)) {
    let namen: string[]
    try {
      namen = readdirSync(join(V, map))
    } catch {
      continue
    }
    for (const n of namen) {
      if (!/\.bus$/i.test(n)) continue
      const pad = join('Vehicles', map, n)
      try {
        const tekst = readFileSync(join(OMSI, pad), 'latin1')
        if (!/(^|\r?\n)\[friendlyname\]\r?\n/.test(tekst)) continue
        metNaam++
        if (gezien.has(pad.toLowerCase())) continue
        gezien.add(pad.toLowerCase())
        paden.push(pad)
      } catch {
        // onleesbaar: telt niet als bus
      }
    }
  }
  const redenen: Record<string, number> = {}
  const crashes: string[] = []
  const tijden: number[] = []
  const onleesbaar = new Map<string, string>()
  const ontbrekendNamen = new Set<string>()
  let ontbrekendVerwijzingen = 0
  let teZwaarPlan = 0
  const texturenUniek = new Map<string, { naam: string; soort: string; mime?: string }>()
  const doosFout: string[] = []
  const dxtFout: string[] = []
  console.log(`listVehicles ${app.length}, met [friendlyname] ${metNaam}, samen ${paden.length}`)
  for (const pad of paden) {
    const t0 = performance.now()
    try {
      const uit = await bouwBus3d({ omsiMap: OMSI, relatiefPad: pad, geregistreerd: reg.sleutels })
      tijden.push(performance.now() - t0)
      if (!uit.bouw) {
        redenen[uit.reden] = (redenen[uit.reden] ?? 0) + 1
        if (uit.detail.startsWith('doostoets')) doosFout.push(pad)
        if (args.has('--uitgebreid') || uit.reden !== 'geen-model') console.log(`  ${pad}: ${uit.reden} -- ${uit.detail}`)
        continue
      }
      redenen.pakket = (redenen.pakket ?? 0) + 1
      const m = uit.bouw.manifest
      for (const o of m.problemen.onleesbaar) onleesbaar.set(o.naam, o.reden)
      for (const n of m.problemen.ontbrekend) ontbrekendNamen.add(n.toLowerCase())
      ontbrekendVerwijzingen += m.telling.ontbrekend
      if (textuurPlan(m.texturen, 160 * 1024 * 1024).teZwaar) teZwaarPlan++
      for (const f of dxtBeginFout(m)) dxtFout.push(`${pad}: ${f}`)
      for (const b of uit.bouw.textuurBronnen) {
        const t = m.texturen.find((x) => x.id === b.id)!
        texturenUniek.set(b.pad.toLowerCase(), { naam: b.pad, soort: t.soort, mime: t.mime })
      }
    } catch (fout) {
      crashes.push(`${pad}: ${(fout as Error).stack ?? String(fout)}`)
    }
  }
  tijden.sort((a, b) => a - b)
  const q = (f: number): number => Math.round(tijden[Math.min(tijden.length - 1, Math.floor(f * (tijden.length - 1)))] ?? 0)
  console.log(`bussen: ${paden.length}; uitkomst ${JSON.stringify(redenen)}; tijd (bouwen, niet schrijven) p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${q(1)} ms`)
  console.log(`texturen: ${texturenUniek.size} unieke bestanden; ontbrekend ${ontbrekendNamen.size} namen (${ontbrekendVerwijzingen} verwijzingen); textuurplan te zwaar bij 160 MB: ${teZwaarPlan}`)
  for (const c of crashes.slice(0, 5)) console.log(`  CRASH ${c}`)
  toets(`--alles: 0 crashes over ${paden.length} bussen`, crashes.length === 0, `${crashes.length}`)
  toets('--alles: 0 texturen met een onleesbare kop', onleesbaar.size === 0, [...onleesbaar].slice(0, 8).map(([n, r]) => `${n} (${r})`).join('; '))
  toets('--alles: geen bus valt op de doostoets', doosFout.length === 0, doosFout.join(', '))
  toets('--alles: het textuurplan kiest nergens een DXT-begin dat niet deelbaar is door 4 (160 en 96 MB)', dxtFout.length === 0, `${dxtFout.length}: ${dxtFout.slice(0, 4).join('; ')}`)

  if (args.has('--diep')) {
    // Ook de pixels: wat onze eigen lezers doen (eigen, BMP, PNG), moet uitkomen.
    let goed = 0
    const slecht: string[] = []
    let alleenKop = 0
    for (const { naam, soort, mime } of texturenUniek.values()) {
      if (soort === 'dxt' || soort === 'dxt-zonder-mips') {
        const l = ontleedTextuur(readFileSync(naam))
        if (l.textuur) goed++
        else slecht.push(`${basename(naam)}: ${l.klacht} ${l.detail}`)
        continue
      }
      if (soort === 'eigen') {
        const b = readFileSync(naam)
        const l = ontleedTextuur(b)
        if (l.textuur || pakBmpUit(b)) goed++
        else slecht.push(`${basename(naam)}: ${l.klacht} ${l.detail}`)
        continue
      }
      if (mime === 'image/png') {
        if (leesPng(readFileSync(naam))) goed++
        else slecht.push(`${basename(naam)}: PNG`)
        continue
      }
      if (mime === 'image/bmp') {
        const b = readFileSync(naam)
        // RLE en OS/2 kent pakBmpUit niet; die doet Chromium (alleen de kop is hier na te gaan).
        if (pakBmpUit(b)) goed++
        else alleenKop++
        continue
      }
      alleenKop++ // JPEG: decodeert Chromium; de kop is gelezen
    }
    console.log(`--diep: ${goed} uitgepakt, ${alleenKop} alleen de kop (JPEG, RLE-BMP: Chromium), ${slecht.length} mislukt`)
    for (const s of slecht.slice(0, 10)) console.log(`  ${s}`)
    toets('--diep: 0 texturen die onze lezers niet uitpakken', slecht.length === 0)
  }
}

// ------------------------------------------------------------ tegenlezing F2
/*
 * Elk punt uit de tegenlezing van F2 (beeldbeoordelaar, proefdraaier, aanvaller)
 * dat hier in node na te gaan is: de rekenmachine van de ruststand
 * (core/oscrust.ts), de regels erachter, de ruststand van de proefbussen, de
 * stalen, het textuurplan zonder S3TC en de registratie die een heldenbeeld
 * weer vergeet. Het venster zelf gaat na in probe-bus3d-venster.cjs.
 */
async function tegenlezingF2(): Promise<void> {
  console.log('\n== Tegenlezing F2: ruststand, stalen, plan zonder S3TC, registratie ==')

  // -------------------------------------------------------- de rekenmachine op kleine scripts
  const map = join(tijdelijk, 'osc')
  mkdirSync(map, { recursive: true })
  const script = (naam: string, tekst: string): string => {
    const p = join(map, naam)
    writeFileSync(p, tekst.split('\n').join('\r\n'))
    return p
  }
  const a = script(
    'a.osc',
    [
      '{init}',
      "  5 3 - (S.L.min) ' a b - is a - b",
      '  3 0 / (S.L.deling)',
      '  1 {if} 5 + (S.L.nietgepopt) {endif}',
      '  (M.L.dubbel)',
      '{end}',
      '{macro:dubbel}',
      '  1 (S.L.dubbel)',
      '{end}',
      '{frame}',
      '  (L.L.x) 1 <',
      '  {if} 1 (S.L.tak) {else} 2 (S.L.tak) {endif}',
      '  (L.S.Time) 0 > {if} 1 (S.L.onzeker) {endif}',
      '  0 (L.S.Time) && {if} 1 (S.L.zekernul) {endif}',
      '  10 random (S.L.toeval)',
      '  "een tekst met spaties" $length (S.L.tekst)',
      '  4 (S.L.daarna)',
      '{end}'
    ].join('\n')
  )
  const b = script('b.osc', ['{macro:dubbel}', '  7 (S.L.dubbel)', '{end}'].join('\n'))
  const programma = leesRustProgramma([a, b], [])
  const reken = (vars: Record<string, number>): Map<string, number> =>
    rekenRust(programma, {
      motor: {},
      vars,
      systeem: { timegap: 1 / 30 },
      gevraagd: ['min', 'deling', 'nietgepopt', 'dubbel', 'tak', 'onzeker', 'zekernul', 'toeval', 'tekst', 'daarna']
    }).waarden
  const r0 = reken({})
  const r3 = reken({ x: 3 })
  toets('rekenmachine: a b - is a - b, delen door 0 geeft 0, {if} haalt niets van de stapel', r0.get('min') === 2 && r0.get('deling') === 0 && r0.get('nietgepopt') === 6, `${r0.get('min')} / ${r0.get('deling')} / ${r0.get('nietgepopt')}`)
  toets('rekenmachine: een macro die twee keer bestaat, de laatste telt', r0.get('dubbel') === 7, String(r0.get('dubbel')))
  toets('rekenmachine: {if} {else} volgt de vars (x 0 -> 1, x 3 -> 2)', r0.get('tak') === 1 && r3.get('tak') === 2, `${r0.get('tak')} / ${r3.get('tak')}`)
  toets(
    'rekenmachine: een onzekere voorwaarde maakt onzeker (NaN), een zekere 0 met && niet; random en teksten zijn onzeker; daarna gaat het zeker verder',
    Number.isNaN(r0.get('onzeker')) && r0.get('zekernul') === 0 && Number.isNaN(r0.get('toeval')) && Number.isNaN(r0.get('tekst')) && r0.get('daarna') === 4,
    [...r0].map(([k, w]) => `${k}=${w}`).join(' ')
  )

  // -------------------------------------------------------- de regels voor wat onzeker blijft
  const v = (zicht: Array<[string, number]>): RustVermelding => ({ deel: 0, zicht, materialen: [] })
  const regels = rustRegels(
    [v([['optie', 1]]), v([['keus', 1]]), v([['keus', 2]]), v([['keus', 3]]), v([['metnul', 0]]), v([['metnul', 1]]), v([['geteld', 1]])],
    [{ kleurVars: {}, startwaarden: {}, daglicht: {}, berekend: { geteld: 1 } }]
  )
  toets(
    'regels: onbekend en alleen 1 gebruikt -> 0 (verborgen); een keuze zonder 0-tak -> de laagste; wat de rekenmachine zeker weet gaat voor',
    regels.zichtbaar === '0100101',
    `${regels.zichtbaar} (verwacht 0100101), onbekend [${regels.onbekend.join(', ')}]`
  )
  const t1 = typischVan([{ setvars: { vis_wheels: 1 } }, { setvars: {} }, { setvars: { vis_wheels: 1, vis_x: 2 } }])
  const t2 = typischVan([{ setvars: { vis_wheels: 1 } }, { setvars: {} }, { setvars: { vis_wheels: 1 } }], { setvars: { vis_wheels: 0 } })
  toets('gewone uitvoering: wat de meeste kleurstellingen zetten (niet gezet = 0), niet wat de gekozen zelf zet', t1.vis_wheels === 1 && t1.vis_x === undefined && t2.vis_wheels === undefined, `${JSON.stringify(t1)} / ${JSON.stringify(t2)}`)

  // -------------------------------------------------------- de ruststand van de proefbussen
  const reg = omsiRegistratie(OMSI).sleutels
  const zichtbaarOp = (kop: Bus3dPakKop, lak: Bus3dLak, patroon: RegExp): number => {
    let n = 0
    kop.vermeldingen.forEach((vm, i) => {
      if (!vm.buiten || lak.zichtbaar[i] !== '1') return
      if (!vm.zicht.some(([naam]) => patroon.test(naam))) return
      const st = kop.stukken[vm.stuk]
      n += st ? st.indices.len / st.indices.breed / 3 : 0
    })
    return Math.round(n)
  }
  const rust = async (pad: string): Promise<{ kop: Bus3dPakKop; lak: Bus3dLak; ms: number; manifest: Bus3dManifest } | undefined> => {
    const u = await bouwBus3d({ omsiMap: OMSI, relatiefPad: pad, geregistreerd: reg })
    if (!u.bouw) return undefined
    bus3dLak(OMSI, u.bouw.manifest, undefined, u.bouw.kop)
    const t0 = performance.now()
    const { lak } = bus3dLak(OMSI, u.bouw.manifest, undefined, u.bouw.kop)
    return { kop: u.bouw.kop, lak, ms: performance.now() - t0, manifest: u.bouw.manifest }
  }
  const o560 = await rust('Vehicles\\ABCoach_O560\\O560_E6.bus')
  if (o560) {
    toets('ruststand O560: geen zonnescherm (cp_rollo*) als plaat boven het dak, wel wielen (vis_wheels uit de .cti)', zichtbaarOp(o560.kop, o560.lak, /^cp_rollo/i) === 0 && zichtbaarOp(o560.kop, o560.lak, /^vis_wheels$/i) > 0, `rollo ${zichtbaarOp(o560.kop, o560.lak, /^cp_rollo/i)}, wielen ${zichtbaarOp(o560.kop, o560.lak, /^vis_wheels$/i)} driehoeken; bron ${o560.lak.bron}, ${o560.ms.toFixed(0)} ms`)
    // De stalen: elke kleurstelling een staal, uit de lak (farbschema_tex1), niet uit het interieur.
    const oppervlak: Record<string, number> = {}
    for (const t of o560.manifest.texturen) if (t.ctc) oppervlak[t.ctc] = Math.max(oppervlak[t.ctc] ?? 0, t.oppervlak)
    const stalen = await kleurstalen(OMSI, 'Vehicles\\ABCoach_O560\\O560_E6.bus', oppervlak)
    const licht = (hex?: string): number => (hex ? Math.max(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)) : 0)
    toets('stalen O560: alle vier de kleurstellingen, "Stadtbus Haren" en "Postbus" wit (niet het grijze interieur)', Object.keys(stalen).length === 4 && licht(stalen['Stadtbus Haren']?.[0]) > 230 && licht(stalen['Postbus']?.[0]) > 230, JSON.stringify(stalen))
    // Zonder S3TC pakt het venster DXT uit: dan rekent het plan RGBA en blijft het binnen het budget.
    const MB160 = 160 * 1024 * 1024
    const met = textuurPlan(o560.manifest.texturen, MB160)
    const zonder = textuurPlan(o560.manifest.texturen, MB160, { s3tc: false })
    const dxtRgba = o560.manifest.texturen.every((t, i) => t.soort !== 'dxt' || !zonder.regels[i].laden || zonder.regels[i].bytes >= zonder.regels[i].b * zonder.regels[i].h * 4)
    toets('textuurplan zonder S3TC: DXT telt als RGBA en het plan blijft binnen 160 MB', dxtRgba && (zonder.bytes <= MB160 || zonder.teZwaar), `met S3TC ${MB(met.bytes)} MB, zonder ${MB(zonder.bytes)} MB${zonder.teZwaar ? ' (te zwaar)' : ''}`)
  }
  for (const pad of ['Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_Voith.bus', 'Vehicles\\MAN_NewLionsCity\\MAN_18C_3door_main_Voith.bus']) {
    const r = await rust(pad)
    if (!r) continue
    const stad = zichtbaarOp(r.kop, r.lak, /^vis_stadtsitz$/i)
    const land = zichtbaarOp(r.kop, r.lak, /^vis_ueberlandsitz$/i)
    const fiets = zichtbaarOp(r.kop, r.lak, /^vis_fahrradtraeger$/i)
    toets(`ruststand ${basename(pad)}: één stoeltype (ook in de achterwagen), geen fietsendrager`, (stad > 0) !== (land > 0) && fiets === 0, `Stadtsitz ${stad}, Ueberlandsitz ${land}, fietsendrager ${fiets}; bron ${r.lak.bron}, ${r.ms.toFixed(0)} ms`)
  }
  const verborgen: Array<[string, RegExp, string]> = [
    ['Vehicles\\HH20_EBus2021\\HHEBus2021_main.bus', /^electric_cable_vis$/i, 'de laadkabel met paal'],
    ['Vehicles\\MAN_SD200\\MAN_SD77.bus', /^wimpel_visibility$/i, 'de wimpels'],
    ['Vehicles\\MAN_NL_NG\\MAN_EN92_main.bus', /^wimpel_visibility$/i, 'de wimpels'],
    ['Vehicles\\Citybus 530 by Kajosoft\\01a_o530_e2_2.bus', /^in_wheels_brush$/i, 'de wielborstels']
  ]
  for (const [pad, patroon, wat] of verborgen) {
    const r = await rust(pad)
    if (!r) continue
    const n = zichtbaarOp(r.kop, r.lak, patroon)
    const glas = Object.entries(r.lak.alphascale).filter(([k]) => /^szyby/i.test(k))
    const glasGoed = glas.every(([, w]) => w === 1)
    toets(`ruststand ${basename(pad)}: ${wat} niet in beeld${glas.length ? ', het glas (Szyby) op 1' : ''}`, n === 0 && glasGoed && r.lak.bron === 'script' && r.ms < 150, `${n} driehoeken${glas.length ? `, Szyby ${glas.map(([, w]) => w).join('/')}` : ''}; bron ${r.lak.bron}, ${r.ms.toFixed(0)} ms`)
  }
  const o550 = await rust('Vehicles\\TH_Ueberlandbus\\O550_Euro2.bus')
  if (o550) {
    const felge = zichtbaarOp(o550.kop, o550.lak, /^vis_felge$/i)
    const kappen = o550.kop.vermeldingen.some((vm, i) => vm.buiten && o550.lak.zichtbaar[i] === '1' && vm.zicht.some(([n, w]) => /^vis_radkappe$/i.test(n) && w === 2))
    toets('ruststand O550: velgen volgen de wieldoppen ({frame}: vis_radkappe < 2), nooit allebei', (felge > 0) !== kappen, `velgen ${felge} driehoeken, wieldoppen 2 ${kappen}`)
  }

  // -------------------------------------------------------- twee bouwbeurten van dezelfde bus tegelijk
  {
    /*
     * Het 3D-venster en het fotovenster van de foto v4 vroegen dezelfde bus
     * tegelijk: de tweede schrijfbeurt kon niet over het pakket heen dat al
     * gelezen werd (EPERM), en het venster kreeg 'fout' (proef van de tegenlezing F2).
     */
    const cache2 = new Bus3dCache(join(tijdelijk, 'ud-f2-dubbel'))
    const opdracht = { soort: 'bus3d:model', relatiefPad: 'Vehicles\\MAN_SD200\\MAN_SD77.bus', geregistreerd: [...reg] } as Bus3dOpdracht
    const uitkomsten = await Promise.allSettled([bus3dWerk(opdracht, OMSI, cache2), bus3dWerk(opdracht, OMSI, cache2)])
    const pakketten = uitkomsten.map((u) => {
      if (u.status === 'rejected') return `fout: ${String(u.reason).slice(0, 80)}`
      const w = u.value as { zijspoor?: { pakket: string } }
      return w.zijspoor?.pakket ?? 'geen pakket'
    })
    const leesbaar = Boolean(cache2.zijspoor(pakketten[0]))
    toets('twee bouwbeurten van dezelfde bus tegelijk: allebei hetzelfde pakket, en het zijspoor klopt', pakketten[0] === pakketten[1] && /^[0-9a-f]{40}$/.test(pakketten[0]) && leesbaar, pakketten.join(' / '))
    // Het pakket is niet te overschrijven (zoals toen het venster het las, of een virusscanner het vasthield): opnieuw bouwen moet toch lukken.
    const pakPad = cache2.pakketPad(pakketten[0])
    chmodSync(pakPad, 0o444)
    let nogEens = ''
    try {
      const w = (await bus3dWerk(opdracht, OMSI, cache2)) as { zijspoor?: { pakket: string } }
      nogEens = w.zijspoor?.pakket ?? 'geen pakket'
    } catch (fout) {
      nogEens = `fout: ${String(fout).slice(0, 120)}`
    } finally {
      chmodSync(pakPad, 0o644)
    }
    toets('opnieuw bouwen terwijl het pakket niet te overschrijven is: hetzelfde pakket, geen EPERM', nogEens === pakketten[0], nogEens)
  }

  // -------------------------------------------------------- registratie: een heldenbeeld vergeten
  const bib = join(tijdelijk, 'f2-intrekking', 'steamapps')
  const nep = join(bib, 'common', 'OMSI 2')
  const busmap = join(nep, 'Vehicles', 'Proef')
  mkdirSync(join(busmap, 'Model'), { recursive: true })
  mkdirSync(join(nep, 'RegAddons'), { recursive: true })
  writeFileSync(join(nep, 'addons.ini'), '')
  copyFileSync(join(OMSI, 'Vehicles', 'HH20_EBus2021', 'Model', '21_aussen_weich3.o3d'), join(busmap, 'Model', 'h.o3d'))
  writeFileSync(join(busmap, 'Model', 'model.cfg'), ['[mesh]', 'h.o3d', ''].join('\r\n'))
  writeFileSync(join(busmap, 'Proef.bus'), ['[friendlyname]', 'Proef', 'Proef', 'Wit', '', '[model]', 'Model\\model.cfg', '', '[boundingbox]', '3', '14', '4', '0', '0', '2', ''].join('\r\n'))
  const ini = join(nep, 'RegAddons', 'Linie20_15657.ini')
  writeFileSync(ini, '[addon.0]\r\nName=Proef Linie 20\r\nArtNr=15657\r\nSteamname=Proef\r\nSteamArtNr=1889540')
  writeFileSync(join(bib, 'appmanifest_252530.acf'), '"AppState"\n{\n\t"InstalledDepots"\n\t{\n\t\t"1889540"\n\t\t{\n\t\t\t"dlcappid"\t\t"1889540"\n\t\t}\n\t}\n}\n')
  const ud = join(tijdelijk, 'ud-f2-intrekking')
  const dienstVoor = (log: string[]): ReturnType<typeof maakBus3dDienst> => {
    const cache = new Bus3dCache(ud)
    return maakBus3dDienst({
      userData: () => ud,
      omsi: () => nep,
      werkerVraag: async <T>(o: Record<string, unknown>, tussen?: (b: unknown) => void): Promise<T> => (await bus3dWerk(o as Bus3dOpdracht, nep, cache, tussen)) as T,
      sluitWerker: () => undefined,
      log: (r) => log.push(r),
      logFout: (w, f) => log.push(`FOUT ${w}: ${String(f)}`),
      tijden: { rust: 50 },
      fotoTerugval: () => undefined
    })
  }
  const webp = new Uint8Array(64)
  webp.set([0x52, 0x49, 0x46, 0x46, 56, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const logA: string[] = []
  const dienstA = dienstVoor(logA)
  const mA = await dienstA.model3d('Vehicles\\Proef\\Proef.bus')
  const pakket = 'manifest' in mA ? mA.manifest.pakket : ''
  dienstA.heldenbeeld(pakket, undefined, 'breed-d15-buiten-vast', webp)
  const heldVoor = dienstA.fotoAlsKlaar('Vehicles\\Proef\\Proef.bus')
  const stempelVoor = dienstA.registratieStempel()
  // "Herstart": een nieuwe dienst, en de add-on is intussen weg.
  rmSync(ini)
  const logB: string[] = []
  const dienstB = dienstVoor(logB)
  const heldNa = dienstB.fotoAlsKlaar('Vehicles\\Proef\\Proef.bus')
  const nogInCache = dienstB.cache.zoek(nep, 'Vehicles\\Proef\\Proef.bus')
  await new Promise((k) => setTimeout(k, 2100))
  const stempelNa = dienstB.registratieStempel()
  toets(
    'registratie: na een herstart zonder de add-on geen heldenbeeld meer, het pakket vergeten, en de foto v4 krijgt een andere naam',
    Boolean(heldVoor?.startsWith('omsi3d://h/')) && heldNa === undefined && !nogInCache && stempelVoor !== stempelNa,
    `voor ${heldVoor?.slice(0, 14)}, na ${heldNa}, pakket nog in de cache ${Boolean(nogInCache)}, stempel ${stempelVoor} -> ${stempelNa}; ${logB.filter((r) => /vergeten/.test(r)).join(' | ')}`
  )
  // In dezelfde sessie: de sleutel komt terug, het heldenbeeld komt er weer (nieuw pakket), en gaat weer weg.
  writeFileSync(ini, '[addon.0]\r\nName=Proef Linie 20\r\nArtNr=15657\r\nSteamname=Proef\r\nSteamArtNr=1889540')
  const mB = await dienstB.model3d('Vehicles\\Proef\\Proef.bus')
  if ('manifest' in mB) dienstB.heldenbeeld(mB.manifest.pakket, undefined, 'breed-d15-buiten-vast', webp)
  const weer = dienstB.fotoAlsKlaar('Vehicles\\Proef\\Proef.bus')
  rmSync(ini)
  const weg = dienstB.fotoAlsKlaar('Vehicles\\Proef\\Proef.bus')
  toets('registratie: in dezelfde sessie vergeet fotoAlsKlaar het heldenbeeld zodra de sleutel weg is', Boolean(weer?.startsWith('omsi3d://h/')) && weg === undefined, `met sleutel ${weer?.slice(0, 14)}, zonder ${weg}`)
}

async function main(): Promise<void> {
  console.log(`OMSI: ${OMSI}`)
  if (args.has('--nulmeting')) nulmeting()
  else if (args.has('--alles')) await alles()
  else if (args.has('--f2')) await tegenlezingF2()
  else {
    await proefset()
    await protocol()
    await randgevallen()
    await tegenlezingF2()
  }
  console.log(`\n${fouten === 0 ? 'ALLES GOED' : `${fouten} FOUT(EN)`}`)
  process.exitCode = fouten === 0 ? 0 : 1
}

void main()
