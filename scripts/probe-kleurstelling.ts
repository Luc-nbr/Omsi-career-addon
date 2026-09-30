/**
 * Proef L0 van de Lakstudio (design/ontwerpen/lakstudio.md §9 en §10):
 * core/kleurstelling.ts leest de kleurstellingen zoals Omsi.exe.
 *
 *   npx tsx scripts/probe-kleurstelling.ts
 *
 * Drie delen:
 * 1. Nagebootst: per regel een kleine bus in een eigen map (`PROEF_MAP` of de
 *    tijdelijke map van Windows): kop exact, plek vóór naam, setvar alleen na
 *    een aangenomen item (ook over bestanden heen), UpperCase van a-z, niet
 *    trimmen, de busmap als basis; plus twee [CTC]'s, losse CR's, en de
 *    terugval voor een getrimde naam uit een oud profiel.
 * 2. De echte installatie, alleen lezen: de gevallen uit het ontwerp (HHA12,
 *    NL263 Havelbus.cti, SL_SG RVH.cti/BBG.cti, " silber", de KI-C2's, de MAN
 *    LC) en de onafhankelijke lezer `scripts/probe-kleurstelling.py` over elke
 *    .bus/.ovh/.sco onder Vehicles: 0 afwijkingen in naam, nummer, variabele,
 *    map en setvars.
 * 3. De .osn-bestanden die OMSI zelf schreef (met alle scriptvariabelen): het
 *    nummer in de CTC-variabele wijst een kleurstelling aan waarvan elke setvar
 *    met dezelfde waarde in de .osn staat.
 *
 * Schrijft alleen in de proefmap; de OMSI-map en de gegevens van Luc blijven
 * onaangeroerd.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import iconv from 'iconv-lite'
import { kleurVarsVan } from '../src/core/bus3d'
import { findOmsiInstall } from '../src/core/install'
import {
  busmapBijCfg,
  kleurstellingenVanBus,
  leesKleurstellingen,
  omsiHoofdletters,
  zoekKleurstelling,
  type Kleurstellingen
} from '../src/core/kleurstelling'
import { einde, klopt, proefMap, schrijf } from './proefhulp'

const R = '\r\n'
const regels = (...r: string[]): string => r.join(R) + R
const ansi = (tekst: string): Buffer => iconv.encode(tekst, 'win1252')

// ------------------------------------------------------------ 1. nagebootst
{
  console.log('== Nagebootst ==')
  const basis = proefMap('probe-kleurstelling')
  const V = join(basis, 'OMSI 2', 'Vehicles')
  const bus = (map: string, cfgRel: string, cfg: string, busNaam = 'Bus.bus'): string => {
    schrijf(V, `${map}/${cfgRel.replace(/\\/g, '/')}`, ansi(cfg))
    return schrijf(V, `${map}/${busNaam}`, ansi(regels('[friendlyname]', 'Proef', '', '[model]', cfgRel, '')))
  }
  const cti = (map: string, pad: string, inhoud: string | Buffer): void => {
    schrijf(V, `${map}/${pad}`, typeof inhoud === 'string' ? ansi(inhoud) : inhoud)
  }
  const namen = (k: Kleurstellingen | undefined): string => JSON.stringify(k?.lijst.map((x) => x.naam) ?? null)
  const cfgGewoon = regels('[CTC]', 'Colorscheme', 'Texture\\Rep', '0', '', '[CTCTexture]', 'Lak', 'lak.tga', '', '[CTCTexture]', 'Farbschema_Innenraum', 'innen.tga', '', '[mesh]', 'a.o3d')

  // (1) Kop exact, in .cti en cfg.
  {
    const b = bus('Kop', 'Model\\model.cfg', cfgGewoon)
    cti('Kop', 'Texture/Rep/a.cti', regels('\t[item]', 'Ingesprongen', 'Lak', 'x.tga', '[Item]', 'Hoofdletter', 'Lak', 'x.tga', '[item] ', 'Spatie', 'Lak', 'x.tga', '[item]', 'Goed', 'Lak', 'x.tga', '[SETVAR]', 'v', '1', '\t[setvar]', 'w', '2'))
    const k = kleurstellingenVanBus(b)
    klopt('regel 1: alleen de exacte kop [item] telt ("\\t[item]", "[Item]", "[item] " niet)', namen(k) === '["Goed"]' && JSON.stringify(k?.lijst[0].setvars) === '{}')
    const b2 = bus('KopCfg', 'Model\\model.cfg', regels('\t[CTC]', 'Colorscheme', 'Texture\\Rep', '0', '[CTCTexture]', 'Lak', 'lak.tga', '[mesh]', 'a.o3d'))
    cti('KopCfg', 'Texture/Rep/a.cti', regels('[item]', 'A', 'Lak', 'x.tga'))
    klopt('regel 1: een ingesprongen "\\t[CTC]" in de cfg is geen [CTC] (en de [CTCTexture] erna hoort nergens bij)', kleurstellingenVanBus(b2) === undefined)
  }

  // (2) Eerst de plek, dan de naam.
  {
    const b = bus('Plek', 'Model\\model.cfg', cfgGewoon)
    cti('Plek', 'Texture/Rep/a.cti', regels('[item]', 'Vreemd', 'Andere_plek', 'x.tga', '[item]', 'Eerste', 'Lak', 'x.tga', '[item]', 'Vreemd', 'Lak', 'x.tga'))
    const k = kleurstellingenVanBus(b)
    klopt('regel 2: een naam op een vreemde plek bestaat niet en schuift de nummers niet op', namen(k) === '["Eerste","Vreemd"]' && k?.lijst[1].index === 1)
  }

  // (3) Setvar alleen na een aangenomen item, ook over de bestandsgrens.
  {
    const b = bus('Setvar', 'Model\\model.cfg', cfgGewoon)
    cti('Setvar', 'Texture/Rep/a.cti', regels('[setvar]', 'voor_alles', '5', '[item]', 'A', 'Lak', 'x.tga', '[setvar]', 'spiegel', '1', '[item]', 'B', 'Andere_plek', 'x.tga', '[setvar]', 'na_vreemd', '2'))
    cti('Setvar', 'Texture/Rep/b.cti', regels('[setvar]', 'volgend_bestand', '3', '[item]', 'C', 'Lak', 'x.tga', '[setvar]', 'eigen', '4.5'))
    const k = kleurstellingenVanBus(b)
    const a = k?.lijst.find((x) => x.naam === 'A')?.setvars
    const c = k?.lijst.find((x) => x.naam === 'C')?.setvars
    klopt(
      'regel 3: setvars na een vreemd item en aan het begin van het volgende bestand gaan naar A; vóór alles vervalt',
      namen(k) === '["A","C"]' && JSON.stringify(a) === '{"spiegel":1,"na_vreemd":2,"volgend_bestand":3}' && JSON.stringify(c) === '{"eigen":4.5}'
    )
  }

  // (4) UpperCase van alleen a-z: plek, naam en variabele.
  {
    const b = bus('Hoofd', 'Model\\model.cfg', cfgGewoon)
    cti('Hoofd', 'Texture/Rep/a.cti', regels(
      '[item]', 'braungold', 'LAK', 'x.tga', '[setvar]', 'Vis_X', '1',
      '[item]', 'Braungold', 'lak', 'y.tga', '[setvar]', 'vis_x', '2',
      '[item]', 'Grün', 'Lak', 'x.tga', '[item]', 'GRüN', 'Lak', 'x.tga', '[item]', 'GRÜN', 'Lak', 'x.tga',
      '[item]', 'Havel', 'farbschema_innenraum', 'i.tga'
    ))
    cti('Hoofd', 'Texture/Rep/x.tga', 'x')
    cti('Hoofd', 'Texture/Rep/y.tga', 'y')
    cti('Hoofd', 'Texture/Rep/i.tga', 'i')
    const k = kleurstellingenVanBus(b)
    const bg = k?.lijst[0]
    klopt(
      'regel 4: braungold/Braungold één kleurstelling (eerste spelling), Vis_X/vis_x één variabele (laatste waarde)',
      bg?.naam === 'braungold' && JSON.stringify(bg.setvars) === '{"Vis_X":2}' && bg.texturen.Lak?.endsWith('y.tga') === true
    )
    klopt('regel 4: Grün en GRüN samen, GRÜN apart (ü/Ü is geen a-z)', namen(k) === '["braungold","Grün","GRÜN","Havel"]')
    klopt('regel 4: plek farbschema_innenraum vindt Farbschema_Innenraum (in de spelling van de cfg)', Boolean(k?.lijst[3]?.texturen.Farbschema_Innenraum?.endsWith('i.tga')))
  }

  // (5) Niet trimmen, en de terugval voor oude profielen.
  {
    const b = bus('Trim', 'Model\\model.cfg', cfgGewoon)
    cti('Trim', 'Texture/Rep/a.cti', regels('[item]', ' silber', 'Lak', 'x.tga', '[setvar]', 'cg_kinderwagen ', '1', '[item]', 'gelb', 'Lak', 'x.tga', '[item]', 'gelb ', 'Lak', 'x.tga'))
    const k = kleurstellingenVanBus(b)
    klopt('regel 5: " silber", "gelb" en "gelb " zijn drie kleurstellingen, ongetrimd', namen(k) === '[" silber","gelb","gelb "]')
    klopt('regel 5: de setvar-variabele "cg_kinderwagen " blijft met spatie (OMSI kent hem dan niet)', JSON.stringify(k?.lijst[0].setvars) === '{"cg_kinderwagen ":1}')
    const precies = zoekKleurstelling(k, ' SILBER')
    const oud = zoekKleurstelling(k, 'silber')
    const gelb = zoekKleurstelling(k, 'gelb ')
    klopt(
      'zoeken: " SILBER" precies (UpperCase), "silber" uit een oud profiel via de terugval, "gelb " is niet "gelb"',
      precies?.naam === ' silber' && !precies.terugval && oud?.naam === ' silber' && oud.terugval === true && gelb?.index === 2 && !gelb.terugval && zoekKleurstelling(k, 'rood') === undefined
    )
    klopt('kleurVars (via kleurVarsVan): het oude "silber" geeft Colorscheme 0 en de setvar', JSON.stringify(k && kleurVarsVan(k, 'silber')) === '[["Colorscheme",0],["cg_kinderwagen ",1]]')
  }

  // (6) De busmap als basis: de cfg in model\KI\.
  {
    const b = bus('Basis', 'model\\KI\\model_KI.cfg', regels('[CTC]', 'Colorscheme', 'Texture\\Repaints\\rep_GN', '0', '[CTCTexture]', 'Lak', 'lak.tga', '[mesh]', 'a.o3d'), 'KI.bus')
    cti('Basis', 'Texture/Repaints/rep_GN/a.cti', regels('[item]', 'BVG', 'Lak', 'x.tga'))
    const k = kleurstellingenVanBus(b)
    const cfg = join(V, 'Basis', 'model', 'KI', 'model_KI.cfg')
    klopt(
      'regel 6: de KI-cfg in model\\KI\\ vindt zijn CTC-map vanaf de busmap (ook via busmapBijCfg)',
      namen(k) === '["BVG"]' && namen(leesKleurstellingen(cfg, busmapBijCfg(cfg))) === '["BVG"]' && k?.map === join(V, 'Basis', 'Texture', 'Repaints', 'rep_GN')
    )
  }

  // Twee [CTC]'s: de eerste telt, elke [CTCTexture] hoort bij de [CTC] erboven.
  {
    const b = bus('TweeCtc', 'Model\\model.cfg', regels(
      '[CTC]', 'Colorscheme', 'Texture\\Werbung', '0', '[CTCTexture]', 'farbschema_tex1', 'Body.tga',
      '[CTC]', 'cp_VDVdisplay_Brightness', 'Texture\\VDV', '0', '[CTCTexture]', 'Monitor1', 'VDV2.bmp', '[mesh]', 'a.o3d'
    ))
    cti('TweeCtc', 'Texture/Werbung/a.cti', regels('[item]', 'Stadtwerke', 'farbschema_tex1', 'x.tga', '[item]', 'Scherm', 'Monitor1', 'x.tga'))
    cti('TweeCtc', 'Texture/VDV/a.cti', regels('[item]', 'Hell', 'Monitor1', 'x.bmp'))
    const k = kleurstellingenVanBus(b)
    klopt(
      "twee [CTC]'s: Colorscheme met Texture\\Werbung en alleen farbschema_tex1 (Monitor1 hoort bij de tweede)",
      k?.variabele === 'Colorscheme' && namen(k) === '["Stadtwerke"]' && JSON.stringify(Object.keys(k.plekken)) === '["farbschema_tex1"]'
    )
  }

  // Regeleinden: .cti met Readln (losse CR valt weg), cfg met TStringList (losse CR breekt).
  {
    const b = bus('Einden', 'Model\\model.cfg', '[CTC]\rColorscheme\rTexture\\Rep\r0\r[CTCTexture]\rLak\rlak.tga\r[mesh]\ra.o3d\r')
    cti('Einden', 'Texture/Rep/a.cti', Buffer.from('[item]\nA\rB\nLak\r\r\nx.tga\n[item]\r\nC\r\nLak\r\nx.tga\r\n', 'latin1'))
    klopt('regeleinden: de cfg met alleen CR, de .cti met LF, CRLF en een losse CR ("A\\rB" is "AB")', namen(kleurstellingenVanBus(b)) === '["AB","C"]')
  }

  // Een setvar-waarde gaat door StrToFloat: geen leeg, geen komma, geen hex.
  {
    const b = bus('Getal', 'Model\\model.cfg', cfgGewoon)
    cti('Getal', 'Texture/Rep/a.cti', regels('[item]', 'A', 'Lak', 'x.tga', '[setvar]', 'leeg', '', '[setvar]', 'komma', '1,5', '[setvar]', 'hex', '0x10', '[setvar]', 'goed', ' -2.5e1 '))
    klopt('setvar-waarden: "", "1,5" en "0x10" vallen weg, " -2.5e1 " is -25', JSON.stringify(kleurstellingenVanBus(b)?.lijst[0].setvars) === '{"goed":-25}')
  }
  rmSync(basis, { recursive: true, force: true })
}

// ------------------------------------------------------------ 2. de echte installatie
const OMSI = findOmsiInstall()
if (!OMSI || !existsSync(join(OMSI, 'Vehicles'))) {
  console.log('\ngeen OMSI-map; de proef op de echte installatie is overgeslagen')
  einde()
}
const V = join(OMSI, 'Vehicles')

console.log('\n== De gevallen uit het ontwerp (alleen lezen) ==')
{
  const cg2 = kleurstellingenVanBus(join(V, 'HH109_Stadtgelenkbus2012_HHA', 'HHStadtgelenkbus2012_main.bus'))
  const braungold = cg2?.lijst.filter((k) => omsiHoofdletters(k.naam) === 'BRAUNGOLD') ?? []
  klopt(`HHA12: braungold en Braungold zijn één kleurstelling (${cg2?.lijst.length} in de CG2, ${braungold.length}× BRAUNGOLD)`, braungold.length === 1)

  // Havelbus.cti schrijft farbschema_innenraum; de cfg noemt farbschema_Innenraum.
  const havel = zoekKleurstelling(kleurstellingenVanBus(join(V, 'MAN_NL_NG_263', 'MAN_NL263.bus')), 'Havelbus (HVL-VK 488)')
  const innen = havel?.texturen.farbschema_Innenraum
  klopt(`NL263: Havelbus.cti neemt farbschema_innenraum aan als farbschema_Innenraum (${innen ? relative(V, innen) : 'niets'})`, Boolean(innen && /NL2x3_2\.dds$/i.test(innen)))

  // RVH.cti en BBG.cti schrijven farbschema_seats_u; de cfg noemt farbschema_seats_U.
  for (const [bus, naam, textuur] of [
    ['MAN_SUE_standard_stuelb_Usitze.bus', 'RVH (rostig)', 'Sitze_SU_RVH.dds'],
    ['MAN_SUE_standard_USitze.bus', 'BBG 303 (rostig)', 'Sitze_SU_Bunt.dds']
  ] as const) {
    const k = zoekKleurstelling(kleurstellingenVanBus(join(V, 'MAN_SL_SG', bus)), naam)
    const stoel = k?.texturen.farbschema_seats_U
    klopt(`SL_SG ${bus}: "${naam}" neemt farbschema_seats_u aan (${stoel ? relative(V, stoel) : 'niets'})`, Boolean(stoel?.endsWith(textuur)))
  }

  const hh20 = kleurstellingenVanBus(join(V, 'HH20_EBus2021', 'HHEBus2021_3T_main.bus'))
  const silber = hh20?.lijst.find((k) => k.naam === ' silber')
  const spaties = hh20?.lijst.filter((k) => k.naam !== k.naam.trim()).length ?? 0
  klopt(
    `HH20 3T: " silber" heet zo, met spatie (nummer ${silber?.index}, setvars ${JSON.stringify(silber?.setvars)}); ${spaties} namen met spatie; "silber" uit een oud profiel vindt hem`,
    Boolean(silber) && zoekKleurstelling(hh20, 'silber')?.index === silber?.index
  )

  const ki = kleurstellingenVanBus(join(V, 'MB_C2_EN_BVG', 'MB_KI_C2_E6_Gn_main.bus'))
  klopt(`KI-C2 (cfg in model\\KI\\): ${ki?.lijst.length ?? 0} kleurstellingen uit ${ki ? relative(V, ki.map) : 'geen map'}`, (ki?.lijst.length ?? 0) > 0 && /rep_GN$/i.test(ki?.map ?? ''))

  // De eerste [CTC] (Colorscheme, Texture\Werbung) heeft geen .cti; de tweede is de helderheid van het VDV-scherm.
  const lcMap = join(V, 'MAN_LC_GUE', 'Texture', 'Werbung')
  const lcCti = existsSync(lcMap) ? readdirSync(lcMap).filter((f) => /\.cti$/i.test(f)).length : -1
  const lc = kleurstellingenVanBus(join(V, 'MAN_LC_GUE', 'MAN lions City G.bus'))
  klopt(
    `MAN LC: de eerste [CTC] telt; Texture\\Werbung heeft ${lcCti} .cti, dus geen kleurstellingen (${lc ? `wel: ${lc.variabele}` : 'geen'}), niet de helderheid van het VDV-scherm`,
    lcCti === 0 ? lc === undefined : lc?.variabele === 'Colorscheme'
  )
}

console.log('\n== Tegen de onafhankelijke lezer (scripts/probe-kleurstelling.py) ==')
{
  const py = spawnSync('python', [join(__dirname, 'probe-kleurstelling.py'), OMSI], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (py.status !== 0 || !py.stdout) {
    console.log(`python gaf niets (${py.error?.message ?? py.stderr?.slice(0, 300)}); dit deel is overgeslagen`)
  } else {
    type Py = { cfg: string; variabele: string; map: string; namen: string[]; setvars: Array<Record<string, number>> }
    const onafhankelijk = JSON.parse(py.stdout) as Record<string, Py>
    const bussen: string[] = []
    const loop = (map: string): void => {
      for (const d of readdirSync(map, { withFileTypes: true })) {
        if (d.isDirectory()) loop(join(map, d.name))
        else if (/\.(bus|ovh|sco)$/i.test(d.name)) bussen.push(join(map, d.name))
      }
    }
    loop(V)
    const cfgs = new Set<string>()
    const afwijkend = new Map<string, string>()
    let metKleur = 0
    for (const pad of bussen) {
      const rel = relative(V, pad)
      const ts = kleurstellingenVanBus(pad)
      const p = onafhankelijk[rel]
      if (!ts && !p) continue
      metKleur++
      // Eén cfg per busmap: de uitkomst hangt van beide af (regel 6).
      const sleutel = `${dirname(rel)}|${p?.cfg ?? rel}`
      cfgs.add(sleutel.toLowerCase())
      /** Setvars zonder volgorde: python schrijft ze gesorteerd. */
      const sv = (s: Record<string, number> | undefined): string => JSON.stringify(Object.entries(s ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      let fout: string | undefined
      if (!ts || !p) fout = `alleen ${ts ? 'de app' : 'python'} vindt kleurstellingen`
      else if (ts.variabele !== p.variabele) fout = `variabele ${ts.variabele} tegen ${p.variabele}`
      else if (relative(V, ts.map).toLowerCase() !== p.map.toLowerCase()) fout = `map ${relative(V, ts.map)} tegen ${p.map}`
      else if (JSON.stringify(ts.lijst.map((k) => k.naam)) !== JSON.stringify(p.namen)) {
        const i = ts.lijst.findIndex((k, n) => k.naam !== p.namen[n])
        fout = `namen: ${ts.lijst.length} tegen ${p.namen.length}, eerste verschil bij ${i} (${JSON.stringify(ts.lijst[i]?.naam)} tegen ${JSON.stringify(p.namen[i])})`
      } else {
        const i = ts.lijst.findIndex((k, n) => sv(k.setvars) !== sv(p.setvars[n]))
        if (i >= 0) fout = `setvars van "${ts.lijst[i].naam}": ${sv(ts.lijst[i].setvars)} tegen ${sv(p.setvars[i])}`
      }
      if (fout && !afwijkend.has(sleutel.toLowerCase())) afwijkend.set(sleutel.toLowerCase(), `${rel}: ${fout}`)
    }
    for (const r of [...afwijkend.values()].slice(0, 15)) console.log(`     ${r}`)
    klopt(`${bussen.length} .bus/.ovh/.sco, ${metKleur} met kleurstellingen, ${cfgs.size} cfg's: ${afwijkend.size} wijken af in naam, nummer, variabele, map of setvars`, afwijkend.size === 0 && metKleur > 500)
  }
}

console.log('\n== Tegen de .osn-bestanden die OMSI zelf schreef ==')
{
  const osns: string[] = []
  for (const m of readdirSync(join(OMSI, 'maps'))) {
    try {
      for (const f of readdirSync(join(OMSI, 'maps', m))) if (/^laststn\.osn(\.voor-omsi-(career|enhancer))?$/i.test(f)) osns.push(join(OMSI, 'maps', m, f))
    } catch {
      // geen map
    }
  }
  try {
    for (const f of readdirSync(join(OMSI, 'Situations'))) if (/\.osn$/i.test(f)) osns.push(join(OMSI, 'Situations', f))
  } catch {
    // geen Situations
  }
  let voertuigen = 0
  let bevestigd = 0
  let zonderSetvars = 0
  let standaard = 0
  let ouder = 0
  let onbeslist = 0
  const tegen: string[] = []
  /** OMSI schrijft de vars als single: 1 wordt 0,99999998. */
  const gelijk = (a: number | undefined, b: number): boolean => a !== undefined && Math.abs(a - b) <= 1e-4
  for (const osn of osns) {
    const osnTijd = statSync(osn).mtimeMs
    if (statSync(osn).size > 64 * 1048576) continue
    const b = readFileSync(osn)
    const tekst = b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString('utf16le') : iconv.decode(b, 'win1252')
    const r = tekst.split(/\r\n|\r|\n/)
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== '[vehicle]') continue
      const busRel = r[i + 1] ?? ''
      const j = r.indexOf('[vars]', i)
      const volgende = r.indexOf('[vehicle]', i + 1)
      if (j < 0 || (volgende >= 0 && j > volgende)) continue
      const n = Number(r[j + 1])
      // Alleen wat OMSI schreef: de app zet een handvol vars, OMSI alle (honderden).
      if (!(n >= 100)) continue
      const vars = new Map<string, number>()
      for (let q = 0; q < n; q++) vars.set(omsiHoofdletters(r[j + 2 + 2 * q] ?? ''), Number(r[j + 3 + 2 * q]))
      const info = kleurstellingenVanBus(join(OMSI, busRel))
      if (!info) continue
      const waarde = vars.get(omsiHoofdletters(info.variabele))
      if (waarde === undefined) continue
      voertuigen++
      const nummer = Math.round(waarde)
      const naam = `${relative(OMSI, osn)} | ${busRel}: ${info.variabele} ${nummer}`
      // -1: geen kleurstelling gekozen (de situaties die bij OMSI horen).
      if (nummer < 0) {
        standaard++
        console.log(`     ${naam} (Standaard)`)
        continue
      }
      /*
       * Een .cti die na de .osn geschreven is, kan inhoudelijk veranderd zijn;
       * bij Luc zijn de meeste pakketten op 22 en 29-09 opnieuw uitgepakt. Dan
       * telt een afwijking niet als bewijs tegen, alleen als opmerking.
       */
      const later = readdirSync(info.map).filter((f) => /\.cti$/i.test(f) && statSync(join(info.map, f)).mtimeMs > osnTijd).length
      if (later > 0) ouder++
      const k = info.lijst[nummer]
      if (!k) {
        tegen.push(`${naam} bestaat niet (${info.lijst.length} kleurstellingen)`)
        continue
      }
      const sv = Object.entries(k.setvars).filter(([v]) => vars.has(omsiHoofdletters(v)))
      if (sv.length === 0) {
        zonderSetvars++
        console.log(`     ${naam} = "${k.naam}" (geen setvars om na te kijken)`)
        continue
      }
      const mis = sv.filter(([v, w]) => !gelijk(vars.get(omsiHoofdletters(v)), w))
      // Past een andere kleurstelling wel helemaal? Dan wijst het nummer de verkeerde aan.
      const beter = info.lijst.filter((x) => x !== k && Object.keys(x.setvars).length > 0 && Object.entries(x.setvars).every(([v, w]) => gelijk(vars.get(omsiHoofdletters(v)), w)))
      console.log(
        `     ${naam} = "${k.naam}": ${sv.length - mis.length} van ${sv.length} setvars gelijk` +
          (mis.length ? ` (anders: ${mis.map(([v, w]) => `${v} ${w}/${vars.get(omsiHoofdletters(v))}`).join(', ')})` : '') +
          (beter.length ? `; alle setvars kloppen ook bij ${beter.length} andere` : '') +
          (later ? `; ${later} .cti nieuwer dan de .osn` : '')
      )
      if (mis.length === 0) bevestigd++
      else if (beter.length > 0 && later === 0) tegen.push(`${naam} = "${k.naam}": wel helemaal: ${beter.map((x) => `"${x.naam}"`).join(', ')}`)
      else onbeslist++
    }
  }
  for (const t of tegen) console.log(`     TEGEN ${t}`)
  klopt(
    `${voertuigen} voertuigen in ${osns.length} .osn's: ${bevestigd} bevestigd door alle setvars, ${zonderSetvars} zonder setvars, ${standaard} Standaard, ${onbeslist} onbeslist, ${tegen.length} tegen (${ouder} met .cti's die nieuwer zijn dan de .osn)`,
    tegen.length === 0 && bevestigd > 0
  )
}

einde()
