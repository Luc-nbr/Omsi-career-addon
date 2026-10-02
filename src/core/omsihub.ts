import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_VERSIE } from '../shared/telefoon'
import type { LiveData } from './live'
import { schrijfVeilig } from './veilig'

/*
 * DE LEESBRON VOOR openOMSI (ontwerp openomsi-koppeling §3)
 *
 * In openOMSI laadt onze DLL niet; daar draait de Lua-plugin `omsihub`
 * (plugin/lua/omsihub/main.lua) in `<OMSI 2>\plugins\omsihub\`. Die schrijft
 * vier keer per seconde `data.save.lua`: een Lua-tabel met één `%q`-string
 * `json`. Hier wordt dat een `LiveData`, dezelfde vorm als live.json van de
 * DLL, zodat de rest van de app (overlay, telefoon, navigatie, loon) niet
 * hoeft te weten welk spel er draait.
 *
 * De andere kant op: `opdracht.save.lua` (knoppen) en `lijsten.save.lua`
 * (welke teksten en getallen de app wil), die de plugin met `require` leest.
 */

/** De map van de plugin in de OMSI 2-installatie (plan §3.1). */
export function omsihubMap(omsiPad: string): string {
  return join(omsiPad, 'plugins', 'omsihub')
}

/** De eerste regel van onze main.lua; zo herkent de app zijn eigen kopie. */
export const OMSIHUB_MERK = '-- OMSIHUB'

/* -------------------------------------------------------------------------- */
/* Een Lua-string uitpakken                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pakt de Lua-string uit die bij `tekst[start]` begint (een `"` of `'`).
 * `tekst` is het bestand als latin1, één teken per byte: `\ddd` zijn bytes,
 * en wat niet ge-escapet is (UTF-8 van ü, ß) ook. Pas aan het eind wordt het
 * UTF-8. Geeft `undefined` bij een half bestand (geen sluitend teken).
 */
export function leesLuaString(tekst: string, start: number): { waarde: string; eind: number } | undefined {
  const quote = tekst[start]
  if (quote !== '"' && quote !== "'") return undefined
  const bytes: number[] = []
  let i = start + 1
  while (i < tekst.length) {
    const c = tekst.charCodeAt(i)
    const ch = tekst[i]
    if (ch === quote) {
      return { waarde: Buffer.from(bytes).toString('utf8'), eind: i + 1 }
    }
    if (ch === '\n') return undefined // een gewone string loopt niet over een regel
    if (ch !== '\\') {
      bytes.push(c & 0xff)
      i++
      continue
    }
    const e = tekst[i + 1]
    if (e === undefined) return undefined
    const eenvoudig: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34, "'": 39 }
    if (e in eenvoudig) {
      bytes.push(eenvoudig[e])
      i += 2
    } else if (e === '\n' || e === '\r') {
      // backslash plus nieuwe regel (zo schrijft %q een "\n"), ook \r\n of \n\r
      bytes.push(10)
      const volgende = tekst[i + 2]
      i += (volgende === '\n' || volgende === '\r') && volgende !== e ? 3 : 2
    } else if (/[0-9]/.test(e)) {
      let j = i + 1
      let getal = ''
      while (j < tekst.length && getal.length < 3 && /[0-9]/.test(tekst[j])) getal += tekst[j++]
      bytes.push(Number.parseInt(getal, 10) & 0xff)
      i = j
    } else if (e === 'x') {
      bytes.push(Number.parseInt(tekst.slice(i + 2, i + 4), 16) & 0xff)
      i += 4
    } else if (e === 'z') {
      i += 2
      while (i < tekst.length && /\s/.test(tekst[i])) i++
    } else if (e === 'u' && tekst[i + 2] === '{') {
      const sluit = tekst.indexOf('}', i + 3)
      if (sluit < 0) return undefined
      const punt = Number.parseInt(tekst.slice(i + 3, sluit), 16)
      for (const b of Buffer.from(String.fromCodePoint(punt), 'utf8')) bytes.push(b)
      i = sluit + 1
    } else {
      return undefined
    }
  }
  return undefined
}

/** De `json`-string uit data.save.lua, of `undefined` als die er (nog) niet heel in staat. */
export function jsonUitDataSave(inhoud: Buffer | string): string | undefined {
  const tekst = typeof inhoud === 'string' ? Buffer.from(inhoud, 'utf8').toString('latin1') : inhoud.toString('latin1')
  const m = /(^|[\s{,])json\s*=\s*(["'])/m.exec(tekst)
  if (!m) return undefined
  const start = m.index + m[0].length - 1
  return leesLuaString(tekst, start)?.waarde
}

/* -------------------------------------------------------------------------- */
/* Van de plugin naar LiveData                                                 */
/* -------------------------------------------------------------------------- */

/** Wat de Lua-plugin in `json` zet (plugin/lua/omsihub/main.lua, `momentopname`). */
export interface OmsihubJson {
  v?: number
  merk?: string
  spel?: {
    motor?: string
    busGeladen?: boolean
    voertuig?: string
    sessie?: string
    herladen?: number
    einde?: boolean
    opFoot?: boolean
    kaartNaam?: string
    pauze?: boolean
    schrijfMs?: number
  }
  dienst?: {
    lijn?: string
    omloop?: string
    rit?: number
    ritten?: number
    eindpunt?: string
    volgende?: string
    aankomst?: number
    vertrek?: number
    vertragingS?: number
  }
  plek?: { x: number; y: number; z: number; koers?: number }
  klok?: number
  dagVanJaar?: number
  jaar?: number
  snelheid?: number
  /** Alleen de proefplugin (stap 0) zette de klok hier. */
  tijd?: { klok?: number; jaar?: number }
  vars?: Record<string, number | null>
  strs?: Record<string, string>
  sys?: Record<string, number | null>
  vragen?: Record<string, string>
  getallen?: Record<string, number | null>
  onbekend?: string[] | Record<string, never>
  getalAantal?: number
  rijstijl?: {
    maxBrake?: number
    maxAccel?: number
    topSpeed?: number
    harshBrakes?: number
    harshAccels?: number
    collisions?: number
    collisionEnergy?: number
    worstCollision?: number
  }
  opdrachtSeq?: number
}

/* De volgorde van plugin/OMSICareer.opl: daaruit komen de bits van `seen`. */
const VAR_NAMEN = [
  'Velocity', 'humans_count', 'schedule_active', 'target_index_int', 'tank_percent', 'kmcounter_km',
  'kmcounter_m', 'PAX_Entry0_Req', 'PAX_Exit0_Req', 'GivenTicket', 'PAX_Entry0_Open', 'PAX_Exit0_Open',
  'AI_Scheduled_AtStation', 'Envir_Brightness', 'StreetCond', 'Velocity_Ground', 'schedule_active',
  'lights_abbl', 'lights_blinker_l', 'lights_blinker_r', 'lights_brems', 'engine_on', 'IBIS_busstop_index',
  'electric_battery'
]
const SYS_NAMEN = ['Time', 'Day', 'Month', 'Year', 'PrecipRate', 'PrecipType', 'coll_energy', 'Weather_Temperature']
const STR_NAMEN = [
  'IBIS_busstop_name', 'IBIS_Delay_min', 'IBIS_Delay_sec', 'SetLineTo', 'IBIS_cabindisplay', 'Matrix_Nr',
  'IBIS_terminus_name', 'IBIS_Complex_Line', 'LAWO_display_line1', 'LAWO_display_line2', 'LAWO_display_line3',
  'LAWO_display_line4', 'afr_display_1', 'afr_display_2'
]

function bits(namen: string[], waarden: Record<string, unknown> | undefined): number {
  let uit = 0
  namen.forEach((naam, i) => {
    if (waarden && waarden[naam] !== undefined) uit |= 1 << i
  })
  return uit >>> 0
}

function getal(w: unknown, anders = 0): number {
  return typeof w === 'number' && Number.isFinite(w) ? w : anders
}

/**
 * De `LiveData` van een momentopname van de plugin. `ageMs` is hoe oud het
 * bestand is. De plek staat in `openomsi.wereld` (meters van openOMSI, x naar
 * het oosten, y naar het noorden); de tegel en de plek daarin (`mem.tile`,
 * `mem.x`, `mem.z`) vult de app pas als de kaart bekend is (`vulTegel`), tot
 * dan staat `mem.ok` op 0.
 */
export function naarLiveData(j: OmsihubJson, ageMs: number): LiveData {
  const vars = j.vars ?? {}
  const sys = j.sys ?? {}
  const strs = j.strs ?? {}
  const r = j.rijstijl ?? {}
  const s = (naam: string): string => (typeof strs[naam] === 'string' ? strs[naam] : '')
  const v = (naam: string): number => getal(vars[naam])
  const d = j.dienst ?? {}
  const klok = getal(sys.Time, getal(j.klok, getal(j.tijd?.klok)))
  const onbekend = Array.isArray(j.onbekend) ? j.onbekend.filter((n) => typeof n === 'string') : []
  const koers = getal(j.plek?.koers)
  const h = (koers * Math.PI) / 180
  const live: LiveData = {
    alive: j.spel?.busGeladen === true && j.spel?.einde !== true,
    plugin: PLUGIN_VERSIE,
    seen: bits(VAR_NAMEN, vars),
    seenSys: bits(SYS_NAMEN, sys),
    seenStr: bits(STR_NAMEN, strs),
    strKind: 1,
    time: klok,
    day: getal(sys.Day),
    month: getal(sys.Month),
    year: getal(sys.Year, getal(j.jaar, getal(j.tijd?.jaar))),
    velocity: vars.Velocity !== undefined ? v('Velocity') : getal(j.snelheid),
    passengers: v('humans_count'),
    scheduleActive: v('schedule_active'),
    targetIndex: v('target_index_int'),
    tankPercent: v('tank_percent'),
    km: v('kmcounter_km'),
    metres: v('kmcounter_m'),
    entryRequest: v('PAX_Entry0_Req'),
    exitRequest: v('PAX_Exit0_Req'),
    ticket: vars.GivenTicket !== undefined ? v('GivenTicket') : -1,
    entryOpen: v('PAX_Entry0_Open'),
    exitOpen: v('PAX_Exit0_Open'),
    atStation: v('AI_Scheduled_AtStation'),
    brightness: v('Envir_Brightness'),
    streetCond: v('StreetCond'),
    precipRate: getal(sys.PrecipRate),
    precipType: getal(sys.PrecipType),
    lightsLow: v('lights_abbl'),
    blinkerLeft: v('lights_blinker_l'),
    blinkerRight: v('lights_blinker_r'),
    brakeLight: v('lights_brems'),
    engineOn: v('engine_on'),
    busstopIndex: v('IBIS_busstop_index'),
    maxBrake: getal(r.maxBrake),
    maxAccel: getal(r.maxAccel),
    topSpeed: getal(r.topSpeed),
    harshBrakes: getal(r.harshBrakes),
    harshAccels: getal(r.harshAccels),
    battery: vars.electric_battery !== undefined ? v('electric_battery') : undefined,
    temperature: sys.Weather_Temperature !== undefined ? getal(sys.Weather_Temperature) : undefined,
    collisions: getal(r.collisions),
    collisionEnergy: getal(r.collisionEnergy),
    worstCollision: getal(r.worstCollision),
    busstop: s('IBIS_busstop_name'),
    delayMin: s('IBIS_Delay_min'),
    delaySec: s('IBIS_Delay_sec'),
    line: s('SetLineTo'),
    terminus: s('IBIS_cabindisplay'),
    matrix: s('Matrix_Nr'),
    ibis: {
      bestemming: s('IBIS_terminus_name'),
      lijn: s('IBIS_Complex_Line'),
      lawo1: s('LAWO_display_line1'),
      lawo2: s('LAWO_display_line2'),
      lawo3: s('LAWO_display_line3'),
      lawo4: s('LAWO_display_line4'),
      afr1: s('afr_display_1'),
      afr2: s('afr_display_2')
    },
    vars: j.vragen && !Array.isArray(j.vragen) ? j.vragen : undefined,
    getallen: j.getallen && !Array.isArray(j.getallen) ? j.getallen : undefined,
    getallenOnbekend: (j.getalAantal ?? 0) > 0 ? onbekend : undefined,
    getalAantal: getal(j.getalAantal),
    ageMs,
    exeVersion: 'openOMSI',
    motor: 'openomsi',
    openomsi: {
      sessie: j.spel?.sessie,
      herladen: getal(j.spel?.herladen),
      einde: j.spel?.einde === true,
      pauze: j.spel?.pauze === true,
      kaartNaam: j.spel?.kaartNaam,
      voertuig: j.spel?.voertuig,
      wereld: j.plek ? { x: getal(j.plek.x), y: getal(j.plek.y), z: getal(j.plek.z) } : undefined,
      aankomstS: typeof d.aankomst === 'number' ? d.aankomst : undefined,
      rit: typeof d.rit === 'number' ? d.rit : undefined,
      ritten: typeof d.ritten === 'number' ? d.ritten : undefined,
      eindpunt: d.eindpunt,
      opdrachtSeq: typeof j.opdrachtSeq === 'number' ? j.opdrachtSeq : undefined
    }
  }
  if (j.plek) {
    live.mem = {
      ok: 0, // pas 1 met een tegel (vulTegel)
      tile: -1,
      x: 0,
      y: getal(j.plek.z),
      z: 0,
      // Een draaiing om de y-as (Direct3D: y omhoog), zoals VehicleTracker hem terugrekent.
      qx: 0,
      qy: Math.sin(h / 2),
      qz: 0,
      qw: Math.cos(h / 2),
      schedActive: d.lijn ? 1 : 0,
      line: -1,
      tour: -1,
      // openOMSI telt de ritten van de omloop vanaf 1, in de volgorde van het bestand.
      tourEntry: typeof d.rit === 'number' && d.rit >= 1 ? d.rit - 1 : -1,
      trip: -1,
      nextIndex: -1,
      nextDist: -1,
      delay: getal(d.vertragingS),
      lineName: d.lijn ?? '',
      tourName: d.omloop ?? '',
      tripName: '',
      nextStop: d.volgende ?? ''
    }
  }
  return live
}

/* -------------------------------------------------------------------------- */
/* Lezen                                                                       */
/* -------------------------------------------------------------------------- */

let onthouden: { pad: string; mtime: number; data: LiveData } | undefined

/**
 * De laatste stand van openOMSI, of `undefined` als er (nog) niets is. Een
 * half geschreven bestand geeft de vorige stand terug, met zijn eigen leeftijd.
 */
export function leesOmsihub(omsiPad: string): LiveData | undefined {
  const pad = join(omsihubMap(omsiPad), 'data.save.lua')
  let mtime: number
  try {
    mtime = statSync(pad).mtimeMs
  } catch {
    return undefined
  }
  const vorig = onthouden?.pad === pad ? onthouden : undefined
  if (vorig && vorig.mtime === mtime) {
    return { ...vorig.data, ageMs: Date.now() - mtime }
  }
  try {
    const tekst = jsonUitDataSave(readFileSync(pad))
    if (tekst) {
      const data = naarLiveData(JSON.parse(tekst) as OmsihubJson, Date.now() - mtime)
      onthouden = { pad, mtime, data }
      return { ...data }
    }
  } catch {
    // Half geschreven of kapot: dan de vorige stand.
  }
  return vorig ? { ...vorig.data, ageMs: Date.now() - vorig.mtime } : undefined
}

/* -------------------------------------------------------------------------- */
/* Schrijven: knoppen en lijsten                                               */
/* -------------------------------------------------------------------------- */

/** Een Lua-string die de plugin met `require` leest. */
export function luaString(s: string): string {
  let uit = '"'
  for (const b of Buffer.from(s, 'utf8')) {
    if (b === 0x22) uit += '\\"'
    else if (b === 0x5c) uit += '\\\\'
    else if (b < 0x20 || b === 0x7f) uit += `\\${String(b).padStart(3, '0')}`
    else uit += String.fromCharCode(b)
  }
  return `${uit}"`
}

/** Hoe lang een knop in opdracht.save.lua blijft staan (de plugin neemt hem tot 5 s). */
const KNOP_BLIJFT_MS = 4000
const knoppen: Array<{ s: number; n: string; t: number; w: string; op: number }> = []
let laatsteSeq = 0

/** Een knopnaam die de plugin aanneemt (main.lua, `knopMag`). */
export function knopnaamMag(naam: string): boolean {
  return /^[A-Za-z0-9_]{1,64}$/.test(naam)
}

/** De inhoud van opdracht.save.lua. Bytes, want de plugin leest ze letterlijk. */
export function opdrachtTekst(lijst: ReadonlyArray<{ s: number; n: string; t: number; w: string }>): string {
  const regels = lijst.map((k) => `    { s = ${k.s}, n = ${luaString(k.n)}, t = ${k.t}, w = ${luaString(k.w)} },`)
  return `-- Omsi-Hub: knoppen voor openOMSI (plugins/omsihub/main.lua leest dit).\nreturn {\n  knoppen = {\n${regels.join('\n')}\n  },\n}\n`
}

/**
 * Een scripttrigger (IBIS, AFR, LAWO) in openOMSI laten indrukken. `druk`:
 * indrukken en na 0,1 s loslaten; `vast` en `los` voor knoppen die je
 * vasthoudt. Het volgnummer loopt op met de klok, dus ook na een herstart van
 * de app is een nieuwe knop altijd nieuwer dan de vorige.
 */
export function omsihubKnop(omsiPad: string, naam: string, wijze: 'druk' | 'vast' | 'los' = 'druk'): number | undefined {
  if (!knopnaamMag(naam)) return undefined
  const nu = Date.now()
  laatsteSeq = Math.max(laatsteSeq + 1, nu)
  while (knoppen.length > 0 && nu - knoppen[0].op > KNOP_BLIJFT_MS) knoppen.shift()
  knoppen.push({ s: laatsteSeq, n: naam, t: Math.floor(nu / 1000), w: wijze, op: nu })
  schrijfVeilig(join(omsihubMap(omsiPad), 'opdracht.save.lua'), opdrachtTekst(knoppen))
  return laatsteSeq
}

const lijsten: { vragen: string[]; getallen: string[] } = { vragen: [], getallen: [] }
let geschrevenLijsten = ''

/** De inhoud van lijsten.save.lua. */
export function lijstenTekst(l: { vragen: readonly string[]; getallen: readonly string[] }): string {
  const lijst = (namen: readonly string[]): string => namen.map((n) => `    ${luaString(n)},`).join('\n')
  return `-- Omsi-Hub: welke teksten en getallen de app van openOMSI wil.\nreturn {\n  vragen = {\n${lijst(l.vragen)}\n  },\n  getallen = {\n${lijst(l.getallen)}\n  },\n}\n`
}

/**
 * De app wil andere teksten (`vragen`) of getallen. Alleen schrijven als de
 * plugin er staat en de lijst echt anders is.
 */
export function zetOmsihubLijst(omsiPad: string | undefined, soort: 'vragen' | 'getallen', namen: readonly string[]): void {
  lijsten[soort] = [...namen]
  if (!omsiPad) return
  const map = omsihubMap(omsiPad)
  if (!existsSync(join(map, 'main.lua'))) return
  const tekst = lijstenTekst(lijsten)
  if (tekst === geschrevenLijsten) return
  schrijfVeilig(join(map, 'lijsten.save.lua'), tekst)
  geschrevenLijsten = tekst
}

/* -------------------------------------------------------------------------- */
/* Plaatsen                                                                    */
/* -------------------------------------------------------------------------- */

export interface Plaatsing {
  geplaatst: boolean
  veranderd: boolean
  doel: string
  fout?: string
}

/**
 * Zet main.lua van de plugin in `<OMSI 2>\plugins\omsihub\` als hij ontbreekt
 * of anders is (plan §3.7). openOMSI laadt hem binnen een seconde opnieuw; de
 * plugin ziet dat als herladen en de dienst loopt door. Een vreemde main.lua
 * (zonder ons merk) wordt niet overschreven. De proefplugin omsihubproef blijft
 * staan: die haalt Luc zelf weg.
 */
export function plaatsOmsihub(omsiPad: string, bron: string): Plaatsing {
  const doel = join(omsihubMap(omsiPad), 'main.lua')
  try {
    const nieuw = readFileSync(bron)
    if (existsSync(doel)) {
      const oud = readFileSync(doel)
      if (oud.equals(nieuw)) return { geplaatst: true, veranderd: false, doel }
      if (!oud.toString('latin1').startsWith(OMSIHUB_MERK)) {
        return { geplaatst: false, veranderd: false, doel, fout: 'er staat een andere main.lua in plugins\\omsihub' }
      }
    }
    schrijfVeilig(doel, nieuw)
    return { geplaatst: true, veranderd: true, doel }
  } catch (fout) {
    return { geplaatst: existsSync(doel), veranderd: false, doel, fout: fout instanceof Error ? fout.message : String(fout) }
  }
}
