import { execFile, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { procesMetPid, type ProcesOpPid } from '../omsiProces'
import {
  inTemp,
  isSpelOpdracht,
  optieWaarde,
  tempMappenNu,
  zelfdeStart,
  type Herkenning,
  type SpelProces
} from '../spelmotor'
import type { VrijStartDeps } from '../vrijstart'
import { IN_PROEF, proefProgramma } from './omsi'

/**
 * DE MOTOR "openOMSI" (ontwerp openomsi-koppeling §5 en §6)
 *
 * openOMSI (github.com/turbo-devv/openOMSI, MIT) is een herbouw van OMSI 2 in
 * Rust. Het spel is 64-bits; onze plugin (32-bits DLL) laadt er niet in, dus in
 * 0.7.0 heeft de app tijdens het rijden geen gegevens uit openOMSI. Wat wel kan,
 * en wat hier staat:
 *
 * - vinden waar openOMSI staat, en welke versie het is (de ProductVersion van
 *   openomsi.exe: `omsi.version` en de launcher zeggen altijd 0.1.0);
 * - starten en stoppen via de launcher van openOMSI zelf
 *   (`openomsi-launcher.exe --cli launch|stop`), zodat wij de opties niet zelf
 *   hoeven te bouwen -- en alleen als dat niet kan met dezelfde opties als de
 *   launcher (`dutyArgs`, een kopie van `duty_args`);
 * - een herstart van het spel volgen (snel laden, een verloren grafisch
 *   apparaat): openOMSI start dan een nieuw proces, en de dienst loopt door
 *   zolang de keten leeft;
 * - na afloop afrekenen uit `~/.openomsi/sessions/<t>-<pid>.json`.
 *
 * Bronnen staan als OO/<pad>:<regel>; OO is openOMSI op a29cde2 (Lucs 0.1.238)
 * of 7217091 (0.1.307).
 */

/* -------------------------------------------------------------------------- */
/* Namen en mappen                                                             */
/* -------------------------------------------------------------------------- */

function exeNaam(waarde: string): string {
  return /\.exe$/i.test(waarde) ? waarde : `${waarde}.exe`
}

/*
 * De namen van de programma's. In een proef (OMSI_ENHANCER_PROEFPROCES) nooit
 * de echte: dan ziet de app het openOMSI van de speler niet, en kan hij het ook
 * niet starten -- zoals de proeven met een eigen "OMSI" dat al jaren doen.
 */
export const OPENOMSI_EXE = process.env.OMSI_ENHANCER_PROEFOPENOMSI
  ? exeNaam(process.env.OMSI_ENHANCER_PROEFOPENOMSI)
  : IN_PROEF
    ? proefProgramma('Open')
    : 'openomsi.exe'
export const OPENOMSI_LAUNCHER_EXE = process.env.OMSI_ENHANCER_PROEFOPENOMSILAUNCHER
  ? exeNaam(process.env.OMSI_ENHANCER_PROEFOPENOMSILAUNCHER)
  : IN_PROEF
    ? proefProgramma('OpenLauncher')
    : 'openomsi-launcher.exe'

/**
 * `~/.openomsi`: HOME, anders USERPROFILE (OO/crates/omsi-launcher-core/src/lib.rs:32-40,
 * career.rs:335-341). Een proef zet `OMSI_ENHANCER_OPENOMSI_MAP`; zonder die
 * kijkt een proef in een map die niet bestaat, nooit in die van de speler.
 */
export function openOmsiThuis(): string {
  if (process.env.OMSI_ENHANCER_OPENOMSI_MAP) return process.env.OMSI_ENHANCER_OPENOMSI_MAP
  if (IN_PROEF) return join(tmpdir(), 'omsi-enhancer-proef-geen-openomsi')
  const thuis = process.env.HOME || process.env.USERPROFILE || ''
  return join(thuis, '.openomsi')
}

/** De inhoudsmap van openOMSI naast een exe (OO/crates/omsi-cfg/src/lib.rs:926-935). */
export function inhoudsmapVan(exeMap: string): string {
  return existsSync(join(exeMap, 'Omsi.exe')) && existsSync(join(exeMap, 'maps')) ? join(exeMap, 'openOMSI') : exeMap
}

/** `launcher.json` van de launcher: root (de OMSI 2-map), game en profiel. */
export interface LauncherConfig {
  root?: string
  game?: string
  profile?: string
}

export function leesLauncherConfig(thuis: string): LauncherConfig {
  try {
    const c = JSON.parse(readFileSync(join(thuis, 'launcher.json'), 'utf8')) as Record<string, unknown>
    return {
      root: typeof c.root === 'string' ? c.root : undefined,
      game: typeof c.game === 'string' ? c.game : undefined,
      profile: typeof c.profile === 'string' ? c.profile : undefined
    }
  } catch {
    return {}
  }
}

/**
 * Wanneer openOMSI het laatst gespeeld is (ms): het nieuwste van launcher.log,
 * game.log en de sessiebestanden in ~/.openomsi. Voor het voorstel bij de
 * spelkeuze (core/spelmotor.ts). Alleen lezen.
 */
export function laatstGespeeldOpenOmsi(thuis: string): number | undefined {
  const tijd = (pad: string): number => {
    try {
      return statSync(pad).mtimeMs
    } catch {
      return 0
    }
  }
  let laatst = Math.max(tijd(join(thuis, 'launcher.log')), tijd(join(thuis, 'game.log')))
  try {
    for (const naam of readdirSync(join(thuis, 'sessions'))) {
      // `<t>-<pid>.json`: t is het moment van schrijven, in seconden.
      const t = Number(/^(\d+)-\d+\.json$/i.exec(naam)?.[1] ?? 0) * 1000
      if (t > laatst) laatst = t
    }
  } catch {
    // geen sessions-map
  }
  return laatst > 0 ? laatst : undefined
}

/* -------------------------------------------------------------------------- */
/* De versie: ProductVersion uit de exe                                        */
/* -------------------------------------------------------------------------- */

/** Een tekst uit VS_VERSIONINFO (`ProductVersion`, `FileVersion`), zonder PowerShell. */
function zoekVersieTekst(data: Buffer, sleutel: string): string | undefined {
  const naald = Buffer.from(`${sleutel}\0`, 'utf16le')
  let at = data.indexOf(naald)
  while (at >= 0) {
    // Vlak voor de sleutel: wLength, wValueLength, wType van de String-structuur.
    if (at >= 6 && at % 2 === 0) {
      const lengte = data.readUInt16LE(at - 4)
      let p = at + naald.length
      // Opvulling tot een veelvoud van vier (de structuur zelf begint op een veelvoud van vier).
      while (p < data.length - 1 && data.readUInt16LE(p) === 0 && (p - (at - 6)) % 4 !== 0) p += 2
      if (lengte === 0) return ''
      let tekst = ''
      for (let i = 0; i < lengte && p + 1 < data.length; i++, p += 2) {
        const c = data.readUInt16LE(p)
        if (c === 0) break
        tekst += String.fromCharCode(c)
      }
      return tekst.trim()
    }
    at = data.indexOf(naald, at + 2)
  }
  return undefined
}

/**
 * De ProductVersion van een exe, gelezen uit de resources (PE-kop, sectie
 * .rsrc). Bij Luc: openomsi.exe 0.1.238 (FileVersion 0.1.0), de launcher 0.1.0
 * -- dus alleen die van het spel zegt iets.
 */
export function leesProductVersie(pad: string): string | undefined {
  let fd: number | undefined
  try {
    fd = openSync(pad, 'r')
    const lees = (pos: number, lengte: number): Buffer => {
      const b = Buffer.alloc(lengte)
      const n = readSync(fd!, b, 0, lengte, pos)
      return b.subarray(0, n)
    }
    const dos = lees(0, 64)
    if (dos.length < 64 || dos.readUInt16LE(0) !== 0x5a4d) return undefined
    const pe = dos.readUInt32LE(0x3c)
    const kop = lees(pe, 24)
    if (kop.length < 24 || kop.readUInt32LE(0) !== 0x4550) return undefined
    const secties = kop.readUInt16LE(6)
    const optGrootte = kop.readUInt16LE(20)
    const opt = lees(pe + 24, optGrootte)
    const mappen = opt.readUInt16LE(0) === 0x20b ? 112 : 96
    if (opt.length < mappen + 24) return undefined
    const rva = opt.readUInt32LE(mappen + 16)
    const grootte = opt.readUInt32LE(mappen + 20)
    if (!rva || !grootte) return undefined
    const tabel = lees(pe + 24 + optGrootte, secties * 40)
    for (let i = 0; i < secties; i++) {
      const s = tabel.subarray(i * 40, i * 40 + 40)
      if (s.length < 40) break
      const va = s.readUInt32LE(12)
      const lengte = Math.max(s.readUInt32LE(8), s.readUInt32LE(16))
      if (rva >= va && rva < va + lengte) {
        const data = lees(s.readUInt32LE(20) + (rva - va), Math.min(grootte, 32 * 1024 * 1024))
        return zoekVersieTekst(data, 'ProductVersion')
      }
    }
    return undefined
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

const versieCache = new Map<string, { sleutel: string; versie?: string }>()

/** Onthouden per pad, grootte en wijzigtijd: een update van openOMSI geeft een nieuwe. */
export function productVersie(pad: string): string | undefined {
  try {
    const info = statSync(pad)
    const sleutel = `${info.size}|${info.mtimeMs}`
    const oud = versieCache.get(pad)
    if (oud && oud.sleutel === sleutel) return oud.versie
    const versie = leesProductVersie(pad)
    versieCache.set(pad, { sleutel, versie })
    return versie
  } catch {
    return undefined
  }
}

/** Is versie `a` minstens `b`? Op getallen per deel; onbekend telt als nee. */
export function versieMinstens(a: string | undefined, b: string): boolean {
  if (!a) return false
  const x = a.split(/[.\-+ ]/).map((d) => Number.parseInt(d, 10))
  const y = b.split('.').map((d) => Number.parseInt(d, 10))
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = Number.isFinite(x[i]) ? x[i] : 0
    const q = Number.isFinite(y[i]) ? y[i] : 0
    if (p !== q) return p > q
  }
  return true
}

/** `--plate` bestaat pas sinds 0.1.307; een oudere openomsi.exe weigert een onbekende optie (clap). */
export const PLATE_VANAF = '0.1.307'

/* -------------------------------------------------------------------------- */
/* Waar staat openOMSI                                                         */
/* -------------------------------------------------------------------------- */

export interface OpenOmsiInstallatie {
  exe: string
  /** `openomsi-launcher.exe` naast de exe, als die er is. */
  launcher?: string
  map: string
  /** Waar openOMSI zijn eigen bestanden schrijft (laststn, quicksave, toetsen, mods). */
  inhoudsmap: string
  versie?: string
  /** Uit de tijdelijke map (een uitgepakte Rar): dan waarschuwt de app. */
  uitTemp: boolean
  bron: 'omsimap' | 'draaiend' | 'launcher.json'
}

export interface VindOpties {
  draaiend?: SpelProces[]
  thuis?: string
  tempMappen?: string[]
  exe?: string
  launcher?: string
}

/**
 * Waar openOMSI staat (ontwerp §5.2 "Vinden"): in de OMSI 2-map; anders waar
 * een draaiend spel of launcher vandaan komt, als dat niet de tijdelijke map
 * is; en pas als laatste `launcher.json` (bij Luc verouderd: een oude
 * Rar-map), ook niet uit de tijdelijke map.
 */
export function vindOpenOmsi(omsiPad: string | undefined, opties: VindOpties = {}): OpenOmsiInstallatie | undefined {
  const exeNaamNu = opties.exe ?? OPENOMSI_EXE
  const launcherNaam = opties.launcher ?? OPENOMSI_LAUNCHER_EXE
  const temp = opties.tempMappen ?? tempMappenNu()
  const maak = (exe: string, bron: OpenOmsiInstallatie['bron']): OpenOmsiInstallatie => {
    const map = dirname(exe)
    const launcher = join(map, launcherNaam)
    return {
      exe,
      launcher: existsSync(launcher) ? launcher : undefined,
      map,
      inhoudsmap: inhoudsmapVan(map),
      versie: productVersie(exe),
      uitTemp: inTemp(exe, temp),
      bron
    }
  }
  if (omsiPad) {
    const exe = join(omsiPad, exeNaamNu)
    if (existsSync(exe)) return maak(exe, 'omsimap')
  }
  for (const p of opties.draaiend ?? []) {
    if (!p.pad || inTemp(p.pad, temp)) continue
    const naam = p.pad.split(/[\\/]/).pop()?.toLowerCase()
    const exe = naam === launcherNaam.toLowerCase() ? join(dirname(p.pad), exeNaamNu) : p.pad
    if (existsSync(exe)) return maak(exe, 'draaiend')
  }
  const game = leesLauncherConfig(opties.thuis ?? openOmsiThuis()).game
  if (game && !inTemp(game, temp) && existsSync(game) && game.toLowerCase().endsWith(exeNaamNu.toLowerCase())) {
    return maak(game, 'launcher.json')
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/* De Duty: wat de launcher krijgt                                             */
/* -------------------------------------------------------------------------- */

/**
 * De Duty zoals de struct van de launcher hem leest
 * (OO/crates/omsi-launcher-core/src/lib.rs:1920-1962) -- niet het formaat van
 * `launcher-duty.json`: dat is dat van de pagina, met `time: 540` en
 * `traffic: 30.0`, en serde weigert 30.0 als u32. `map`, `bus` en `time` zijn
 * verplicht; onbekende velden negeert serde (geen deny_unknown_fields), dus
 * `plate` mag ook naar 0.1.238.
 */
export interface OpenOmsiDuty {
  map: string
  bus: string
  hof?: string | null
  entry?: number | null
  line?: string | null
  tour?: string | null
  trip?: string | null
  time: string
  date?: string | null
  weather?: string | null
  traffic?: number | null
  passengers?: boolean | null
  schedule?: boolean | null
  autostart?: boolean | null
  on_foot?: boolean | null
  paint?: string | null
  plate?: string | null
  profile?: string | null
  season?: string | null
  situation?: string | null
}

/** Een dienst van de app, in de woorden van openOMSI. */
export interface DienstVoorOpenOmsi {
  /** De kaartmap onder `maps` (TH_Wald). */
  mapFolder: string
  /** Het pad van de bus vanaf de OMSI-map; backslashes mogen. */
  bus: string
  /** Het wagenpark: de `[name]` uit de .hof, zoals de launcher het noemt. */
  hof?: string
  /** Het .ttl-bestand van de lijn (zonder extensie) en de omloop zoals OMSI hem noemt. */
  line?: string
  tour?: string
  /** Minuten na middernacht; over middernacht telt door (1510 is 01:10). */
  minuten: number
  /** jjjj-mm-dd */
  datum?: string
  /** De kleurstelling op naam (OMSI's Appearance). */
  lak?: string
  kenteken?: string
  verkeer?: number
  reizigers?: boolean
}

export function klokTekst(minuten: number): string {
  const m = ((Math.round(minuten) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** De Duty voor een dienst: de struct, in de volgorde van de fixture. */
export function bouwDuty(d: DienstVoorOpenOmsi): OpenOmsiDuty {
  return {
    map: `maps/${d.mapFolder.replace(/\\/g, '/')}/global.cfg`,
    bus: d.bus.replace(/\\/g, '/'),
    hof: d.hof?.trim() || null,
    // -1: het inzetpunt het dichtst bij de eerste halte van de omloop (de launcher: "Automatisch").
    entry: -1,
    line: d.line?.trim() || null,
    tour: d.tour?.trim() || null,
    time: klokTekst(d.minuten),
    date: d.datum || null,
    traffic: d.verkeer ?? 30,
    passengers: d.reizigers ?? true,
    schedule: true,
    paint: d.lak?.trim() || null,
    plate: d.kenteken?.trim() || null
  }
}

/**
 * Een situatie spelen: vrij rijden met onze eigen situatie, of voortzetten
 * waar het spel stopte. Alleen `situation`, `traffic`, `passengers` en het
 * profiel tellen dan (`duty_args` #136); `map`, `bus` en `time` zijn
 * verplichte velden van de struct, en de map komt zo in de instance.
 */
export function bouwSituatieDuty(
  situatie: string,
  mapFolder: string,
  opties: { verkeer?: number; reizigers?: boolean; profiel?: string } = {}
): OpenOmsiDuty {
  return {
    map: `maps/${mapFolder.replace(/\\/g, '/')}/global.cfg`,
    bus: '',
    time: '',
    situation: situatie,
    traffic: opties.verkeer ?? 30,
    passengers: opties.reizigers ?? true,
    profile: opties.profiel?.trim() || null
  }
}

/**
 * Waar voortzetten begint: `laststn.osn` van de kaart, eerst in de inhoudsmap
 * van openOMSI en dan in de OMSI 2-map -- zoals `last_situation`
 * (OO/crates/omsi-launcher-core/src/lib.rs:1964-1973). openOMSI schrijft hem
 * alleen in zijn inhoudsmap (input_script.rs:2259-2270); onze eigen lezer in
 * situation.ts kijkt alleen in de OMSI 2-map en geldt hier dus niet.
 */
export function laststnVoorOpenOmsi(omsiPad: string, inhoudsmap: string | undefined, mapFolder: string): string | undefined {
  const kandidaten = [
    inhoudsmap ? join(inhoudsmap, 'maps', mapFolder, 'laststn.osn') : undefined,
    join(omsiPad, 'maps', mapFolder, 'laststn.osn')
  ].filter((p): p is string => Boolean(p))
  return kandidaten.find((p) => {
    try {
      return statSync(p).isFile()
    } catch {
      return false
    }
  })
}

/**
 * Het `Inputs/keyboard.cfg` dat openOMSI volgt (OO/crates/omsi-app/src/startup.rs:69-78):
 * dat van de inhoudsmap zodra de launcher daar toetsen bewaarde, anders dat van
 * de OMSI 2-map (dat openOMSI nooit schrijft), en waar dat ontbreekt
 * `keyboard_reset.cfg`.
 */
export function keyboardCfgVoorOpenOmsi(omsiPad: string, inhoudsmap: string | undefined): string {
  const eigen = inhoudsmap ? join(inhoudsmap, 'Inputs', 'keyboard.cfg') : undefined
  if (eigen && existsSync(eigen)) return eigen
  const origineel = join(omsiPad, 'Inputs', 'keyboard.cfg')
  if (existsSync(origineel)) return origineel
  const reset = join(omsiPad, 'Inputs', 'keyboard_reset.cfg')
  return existsSync(reset) ? reset : origineel
}

/**
 * De opdrachtregel die een Duty wordt, precies zoals `duty_args` van de launcher
 * (OO/crates/omsi-launcher-core/src/lib.rs:1975-2080). Alleen voor de terugval:
 * geen launcher-exe, of een launcher zonder OMSI 2-map.
 *
 * Twee verschillen, allebei met reden: `--plate` alleen vanaf 0.1.307 (een
 * oudere exe weigert een onbekende optie, en het spel heeft geen console om
 * dat te zeggen), en nooit `-windowed` (dat is een vlag van Omsi.exe). De
 * instellingen `use_real_time`/`use_real_date` doen op Windows niets
 * (`local_now` geeft daar None), dus hier ook niet.
 */
export function dutyArgs(d: OpenOmsiDuty, ctx: { root: string; profiel?: string; versie?: string }): string[] {
  const vol = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== ''
  const a: string[] = []
  if (vol(d.situation)) {
    a.push('--root', ctx.root, '--no-menu', '--situation', d.situation)
    if (vol(d.profile)) a.push('--driver', `Drivers/${d.profile.trim()}.odr`)
    a.push('--traffic', String(d.traffic ?? 30))
    if (d.passengers ?? true) a.push('--passengers')
    return a
  }
  a.push('--root', ctx.root, '--no-menu', '--map', d.map, '--bus', d.bus, '--time', d.time.trim() || '09:00')
  if (vol(d.paint)) a.push('--paint', d.paint.trim())
  if (vol(d.plate) && versieMinstens(ctx.versie, PLATE_VANAF)) a.push('--plate', d.plate.trim())
  if (vol(d.hof) && !/\.bus|\.ovh/i.test(d.hof)) a.push('--hof', d.hof.trim())
  if (typeof d.entry === 'number') {
    if (d.entry < 0) {
      if (vol(d.line)) a.push('--auto-entry')
    } else {
      a.push('--entry', String(d.entry))
    }
  }
  if (vol(d.date)) a.push('--date', d.date.trim())
  if (vol(d.weather)) a.push('--weather', d.weather.trim())
  a.push('--traffic', String(d.traffic ?? 30))
  if (d.passengers ?? true) a.push('--passengers')
  // `d.line.is_some()`: ook een lege lijn zet de dienstregeling aan, zoals bij de launcher.
  const dienstregeling = (d.schedule ?? true) || (d.line !== null && d.line !== undefined)
  if (dienstregeling) a.push('--schedule')
  if (vol(d.line) && dienstregeling) {
    a.push('--line', d.line.trim())
    if (vol(d.tour)) {
      a.push('--tour', d.tour.trim())
      if (vol(d.trip)) a.push('--trip', d.trip.trim())
    }
  }
  if (d.autostart) a.push('--autostart')
  if (d.on_foot) a.push('--on-foot')
  const profiel = vol(d.profile) ? d.profile : (ctx.profiel ?? '')
  if (vol(d.season) && d.season.trim().toLowerCase() !== 'auto') a.push('--season', d.season.trim().toLowerCase())
  if (profiel.trim()) a.push('--driver', `Drivers/${profiel.trim()}.odr`)
  return a
}

/* -------------------------------------------------------------------------- */
/* Starten                                                                     */
/* -------------------------------------------------------------------------- */

export interface Uitvoer {
  code: number | null
  uit: string
  fout: string
}

/**
 * Een programma draaien en de uitvoer lezen, zonder shell en zonder venster
 * (OO/docs/USER_GUIDE.md:176-180).
 *
 * Niet `execFile`: de launcher start het spel als kind, en een kind erft onder
 * Windows de handles van zijn ouder -- ook de pijp naar onze stdout. Die gaat
 * dan pas dicht als het SPEL stopt, en `execFile` wacht op dicht. Hier telt het
 * einde van de launcher zelf; wat hij schreef staat dan al in de pijp.
 */
export function voerUit(exe: string, args: string[], tijdslimiet = 60000): Promise<Uitvoer> {
  return new Promise((klaar) => {
    let uit = ''
    let fout = ''
    let klaarGemeld = false
    const meld = (code: number | null): void => {
      if (klaarGemeld) return
      klaarGemeld = true
      clearTimeout(klok)
      kind.stdout?.destroy()
      kind.stderr?.destroy()
      klaar({ code, uit, fout })
    }
    const kind = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    kind.stdout?.on('data', (stuk) => {
      uit += String(stuk)
    })
    kind.stderr?.on('data', (stuk) => {
      fout += String(stuk)
    })
    const klok = setTimeout(() => {
      fout += `${fout ? '\n' : ''}time-out na ${tijdslimiet} ms`
      try {
        kind.kill()
      } catch {
        // al weg
      }
      meld(null)
    }, tijdslimiet)
    kind.on('error', (reden) => {
      fout += String((reden as Error).message ?? reden)
      meld(null)
    })
    kind.on('exit', (code) => {
      // Wat de launcher net schreef, kan nog onderweg zijn: even laten binnenkomen.
      setTimeout(() => meld(code), 150)
    })
    kind.on('close', (code) => meld(code))
  })
}

export interface StartUitkomst {
  uitkomst: 'gestart' | 'mislukt'
  via: 'launcher' | 'terugval'
  pid?: number
  log?: string
  /** De opdrachtregel waarmee het spel startte. */
  opdracht?: string
  /** Hoeveel spellen er al draaiden volgens de launcher. */
  anderen?: number
  /** De foutregel van de launcher, letterlijk; die toont de app. */
  fout?: string
}

export interface StartOpties {
  thuis?: string
  /** Waar de uitvoer van een zelf gestart spel heen gaat (%LOCALAPPDATA%\OMSI Career). */
  logMap: string
  /** De OMSI 2-map, als `launcher.json` er geen noemt. */
  omsiPad: string
  uitvoeren?: (exe: string, args: string[]) => Promise<Uitvoer>
  zelfStarten?: (exe: string, args: string[], cwd: string, log: string) => Promise<number>
}

/** Het antwoord van `--cli launch` (launcher-core lib.rs:2083-2090): `{pid, log, command, others}`. */
function leesLaunchAntwoord(uit: string): { pid: number; log?: string; command?: string; others?: number } | undefined {
  const begin = uit.indexOf('{')
  const eind = uit.lastIndexOf('}')
  if (begin < 0 || eind <= begin) return undefined
  try {
    const v = JSON.parse(uit.slice(begin, eind + 1)) as Record<string, unknown>
    if (typeof v.pid !== 'number') return undefined
    return {
      pid: v.pid,
      log: typeof v.log === 'string' ? v.log : undefined,
      command: typeof v.command === 'string' ? v.command : undefined,
      others: typeof v.others === 'number' ? v.others : undefined
    }
  } catch {
    return undefined
  }
}

/** De foutregel zoals de launcher hem geeft (`error: …` op stderr, exit 1). */
function foutregel(u: Uitvoer): string {
  const tekst = (u.fout || u.uit).trim()
  return tekst || `de launcher stopte met code ${u.code ?? '?'}`
}

/**
 * Een spel zelf starten (de terugval), losgekoppeld van de app: het blijft
 * draaien als de app dichtgaat. De uitvoer gaat naar een eigen logboek in
 * plaats van `stdio: 'ignore'`, zodat een fout ergens staat.
 */
export function startZelf(exe: string, args: string[], cwd: string, log: string): Promise<number> {
  return new Promise((klaar, mislukt) => {
    let fd: number | undefined
    try {
      fd = openSync(log, 'w')
    } catch {
      fd = undefined
    }
    const kind = spawn(exe, args, {
      cwd,
      detached: true,
      windowsHide: false,
      stdio: fd !== undefined ? ['ignore', fd, fd] : 'ignore'
    })
    const sluit = (): void => {
      if (fd !== undefined) {
        try {
          closeSync(fd)
        } catch {
          // al dicht
        }
        fd = undefined
      }
    }
    kind.once('error', (reden) => {
      sluit()
      mislukt(reden)
    })
    kind.once('spawn', () => {
      sluit()
      kind.unref()
      klaar(kind.pid ?? 0)
    })
  })
}

/**
 * Een dienst starten in openOMSI (ontwerp §5.2). Eerst via de launcher
 * (`--cli launch <Duty>`): die kiest de openomsi.exe naast zichzelf, de
 * OMSI 2-map uit launcher.json, schrijft een instance en zet de uitvoer van het
 * spel in game.log -- zo komen ook de regels van een Lua-plugin ergens
 * terecht. Alleen zonder launcher-exe, of als de launcher geen OMSI 2-map
 * kent, starten we het spel zelf met dezelfde opties.
 */
export async function startOpenOmsi(inst: OpenOmsiInstallatie, duty: OpenOmsiDuty, opties: StartOpties): Promise<StartUitkomst> {
  const uitvoeren = opties.uitvoeren ?? voerUit
  if (inst.launcher) {
    const u = await uitvoeren(inst.launcher, ['--cli', 'launch', JSON.stringify(duty)])
    const antwoord = u.code === 0 ? leesLaunchAntwoord(u.uit) : undefined
    if (antwoord) {
      return {
        uitkomst: 'gestart',
        via: 'launcher',
        pid: antwoord.pid,
        log: antwoord.log,
        opdracht: antwoord.command,
        anderen: antwoord.others
      }
    }
    const fout = foutregel(u)
    // Alleen als de launcher geen OMSI 2-map kent: dan zelf, met onze map.
    if (!/no OMSI 2 folder configured/i.test(fout)) return { uitkomst: 'mislukt', via: 'launcher', fout }
  }
  const thuis = opties.thuis ?? openOmsiThuis()
  const config = leesLauncherConfig(thuis)
  const root = config.root?.trim() ? config.root : opties.omsiPad
  const args = dutyArgs(duty, { root, profiel: config.profile, versie: inst.versie })
  const log = join(opties.logMap, 'openomsi-game.log')
  try {
    const pid = await (opties.zelfStarten ?? startZelf)(inst.exe, args, inst.map, log)
    const opdracht = `${inst.exe} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
    return { uitkomst: 'gestart', via: 'terugval', pid, log, opdracht }
  } catch (reden) {
    return { uitkomst: 'mislukt', via: 'terugval', fout: reden instanceof Error ? reden.message : String(reden) }
  }
}

/* -------------------------------------------------------------------------- */
/* Stoppen                                                                     */
/* -------------------------------------------------------------------------- */

export type StopUitkomst = 'netjes' | 'geforceerd' | 'al-dicht' | 'mislukt'

export interface StopOpties {
  launcher?: string
  uitvoeren?: (exe: string, args: string[]) => Promise<Uitvoer>
  /** Wie er onder een pid zit (naam zonder .exe, starttijd), of weg/onbekend. */
  wieIs?: (pid: number) => Promise<ProcesOpPid>
  taskkill?: (pid: number, hard: boolean, naam: string) => Promise<void>
  /** Hoe lang het spel krijgt om zelf te stoppen (de launcher: 8 s, instances.rs:311). */
  genade?: number
  stap?: number
  /** De naam van het programma, zonder .exe (proef). */
  naam?: string
  log?: (regel: string) => void
}

/** taskkill op pid én naam, met of zonder /F. Zonder /F sluit het venster: het spel rondt af zoals met Escape. */
export function taskkillOpenOmsi(pid: number, hard: boolean, naam: string): Promise<void> {
  const args = ['/FI', `PID eq ${Math.trunc(pid)}`, '/FI', `IMAGENAME eq ${naam}.exe`]
  if (hard) args.unshift('/F')
  return new Promise((klaar) => {
    execFile('taskkill', args, { windowsHide: true }, () => klaar())
  })
}

const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms))

/**
 * Een spel stoppen (ontwerp §5.3). Via de launcher (`--cli stop {"pid":N}`):
 * die vraagt eerst netjes (taskkill zonder /F; het spel schrijft dan zijn
 * sessie en laststn), wacht 8 s en gebruikt pas daarna /F
 * (OO/crates/omsi-launcher-core/src/instances.rs:311-333, 404-424). Kent de
 * launcher het spel niet ("no running game … started by the launcher"), dan
 * hetzelfde hier: taskkill zonder /F, 8 s, pid plus starttijd nakijken, dan /F.
 * NOOIT METEEN /F: dan komt er geen sessie en geen laststn.
 */
export async function stopOpenOmsi(p: SpelProces, opties: StopOpties = {}): Promise<StopUitkomst> {
  const log = opties.log ?? ((): void => undefined)
  if (opties.launcher) {
    const u = await (opties.uitvoeren ?? voerUit)(opties.launcher, ['--cli', 'stop', JSON.stringify({ pid: p.pid })], 30000)
    if (u.code === 0) {
      try {
        const v = JSON.parse(u.uit.slice(u.uit.indexOf('{'), u.uit.lastIndexOf('}') + 1)) as { ended_by_itself?: boolean }
        return v.ended_by_itself === false ? 'geforceerd' : 'netjes'
      } catch {
        return 'netjes'
      }
    }
    const fout = foutregel(u)
    log(`openOMSI stoppen via de launcher: ${fout}`)
    if (/is no longer the game/i.test(fout)) return 'al-dicht'
    // "no running game with process id N was started by the launcher": dan zelf.
  }
  const naam = opties.naam ?? OPENOMSI_EXE.replace(/\.exe$/i, '')
  const wieIs = opties.wieIs ?? procesMetPid
  const kill = opties.taskkill ?? taskkillOpenOmsi
  const genade = opties.genade ?? 8000
  const stap = opties.stap ?? 250
  const isHij = (x: ProcesOpPid): boolean =>
    x !== 'weg' && x !== 'onbekend' && x.naam.toLowerCase() === naam.toLowerCase() && zelfdeStart(x.start, p.gestart)
  const nu = await wieIs(p.pid)
  if (nu === 'onbekend') return 'mislukt'
  if (!isHij(nu)) return 'al-dicht'
  await kill(p.pid, false, naam)
  const t0 = Date.now()
  while (Date.now() - t0 < genade) {
    await wacht(stap)
    const daarna = await wieIs(p.pid)
    if (daarna !== 'onbekend' && !isHij(daarna)) return 'netjes'
  }
  const laatst = await wieIs(p.pid)
  if (laatst !== 'onbekend' && !isHij(laatst)) return 'netjes'
  if (laatst === 'onbekend') return 'mislukt'
  log(`openOMSI (pid ${p.pid}) stopte niet binnen ${Math.round(genade / 1000)} s; nu hard`)
  await kill(p.pid, true, naam)
  for (let poging = 0; poging < 12; poging++) {
    const daarna = await wieIs(p.pid)
    if (daarna !== 'onbekend' && !isHij(daarna)) return 'geforceerd'
    await wacht(stap)
  }
  return 'mislukt'
}

/* -------------------------------------------------------------------------- */
/* De keten van herstarts                                                      */
/* -------------------------------------------------------------------------- */

/** Een lid van de keten, zoals het in het profiel bewaard wordt. */
export interface KetenLid {
  pid: number
  gestart?: string
}

/** Is `p` het vervolg van de keten? Een kind van een lid, of een herstart op quicksave/laststn. */
export function isOpvolger(p: SpelProces, keten: KetenLid[], sinds?: string): boolean {
  if (keten.some((lid) => lid.pid === p.pid)) return false
  if (p.ouder !== undefined && keten.some((lid) => lid.pid === p.ouder)) return true
  const sit = optieWaarde(p.args ?? [], '--situation') ?? ''
  if (!/(quicksave|laststn)\.osn$/i.test(sit.trim())) return false
  // Een herstart op zijn eigen situatie: alleen als hij na het laatste lid begon.
  const na = sinds ?? keten.at(-1)?.gestart
  if (!na || !p.gestart) return true
  return Date.parse(p.gestart) >= Date.parse(na) - 1000
}

export type KetenStand = 'loopt' | 'herstart' | 'zoekt' | 'einde'

/**
 * De dienst loopt zolang de keten leeft (ontwerp §5.3). Snel laden start een
 * nieuw proces met `--situation …quicksave.osn` (input_script.rs:1917-1940);
 * een verloren grafisch apparaat geeft tot twee herstarts op laststn.osn
 * (input_script.rs:2284-2312). Is het laatste lid weg, dan zoekt de wacht 20 s
 * naar een opvolger: een kind van een lid, of een herstart op zijn eigen
 * situatie. Pas daarna is de dienst voorbij.
 */
export class KetenWacht {
  keten: KetenLid[]
  /** Sinds wanneer het laatste lid weg is (ms). */
  weg?: number
  /** Wanneer de keten ophield (ms): het moment dat het laatste lid wegging. */
  einde?: number

  constructor(
    keten: KetenLid[],
    private opties: { zoekMs?: number; nu?: () => number; log?: (regel: string) => void } = {}
  ) {
    this.keten = keten.map((lid) => ({ ...lid }))
  }

  private nu(): number {
    return this.opties.nu?.() ?? Date.now()
  }

  /** Eén blik op wat er draait. */
  stap(h: Herkenning): KetenStand {
    if (this.einde !== undefined) return 'einde'
    let erbij = false
    // Een kind kan er al zijn terwijl de ouder nog afsluit: meteen in de keten.
    for (const p of h.openomsi) {
      if (isOpvolger(p, this.keten)) {
        this.keten.push({ pid: p.pid, gestart: p.gestart })
        this.opties.log?.(`openOMSI start opnieuw: pid ${p.pid} volgt ${this.keten.at(-2)?.pid ?? '?'}`)
        erbij = true
      }
    }
    // Starttijden die de instance of CIM nu pas geeft, erbij zetten.
    for (const lid of this.keten) {
      if (lid.gestart) continue
      const p = h.openomsi.find((item) => item.pid === lid.pid)
      if (p?.gestart) lid.gestart = p.gestart
    }
    const levend = this.keten.some((lid) => h.openomsi.some((p) => p.pid === lid.pid && zelfdeStart(p.gestart, lid.gestart)))
    if (levend) {
      this.weg = undefined
      return erbij ? 'herstart' : 'loopt'
    }
    this.weg ??= this.nu()
    if (this.nu() - this.weg < (this.opties.zoekMs ?? 20000)) return 'zoekt'
    this.einde = this.weg
    return 'einde'
  }
}

/* -------------------------------------------------------------------------- */
/* De afrekening achteraf                                                      */
/* -------------------------------------------------------------------------- */

/** Een sessiebestand van openOMSI (OO/crates/omsi-app/src/career.rs:342-370). */
export interface OpenOmsiSessie {
  time: number
  map?: string
  bus?: string
  line?: string | null
  tour?: string | null
  seconds?: number
  metres?: number
  stops?: number
  early?: number
  late?: number
  tickets?: number
  cash?: number
  crashes?: number
  hurt?: number
  jolts?: number
  boarded?: number
  served?: number
}

export interface Afrekening {
  /** De pids met een sessiebestand. */
  pids: number[]
  bestanden: string[]
  /** Pids van de keten zonder bestand (gecrasht of hard afgesloten). */
  ontbreekt: number[]
  /** Bestanden die bij een andere dienst horen (kaart, lijn of omloop anders); niet meegeteld. */
  afwijkend: string[]
  seconden: number
  meters: number
  km: number
  haltes: number
  teVroeg: number
  teLaat: number
  kaartjes: number
  kas: number
  aanrijdingen: number
  gewonden: number
  schokken: number
  ingestapt: number
  bediend: number
}

export type AfrekeningUitslag = Afrekening | { onvolledig: 'geenRit'; ontbreekt: number[]; afwijkend: string[] }

function getal(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

function kaartVan(map: string | undefined): string {
  return (map ?? '').replace(/\\/g, '/').trim().toLowerCase()
}

/**
 * Afrekenen uit `~/.openomsi/sessions` (ontwerp §6). Per pid van de keten:
 * `<t>-<pid>.json` met t (het moment van schrijven) niet vóór de start van dat
 * pid. openOMSI schrijft zo'n bestand alleen bij een net einde, met een bus en
 * `seconds > 0` (input_script.rs:8-39); een herstart schrijft er een per
 * proces, dus de keten telt op. Kaart, lijn en omloop moeten passen, voor zover
 * ze er staan (een herstart op quicksave kent zijn lijn niet altijd).
 */
export function leesAfrekening(
  keten: KetenLid[],
  thuis: string,
  dienst?: { mapFolder?: string; line?: string; tour?: string },
  /** Wanneer de dienst begon (ISO); de ondergrens als een pid geen starttijd heeft. */
  sinds?: string
): AfrekeningUitslag {
  const map = join(thuis, 'sessions')
  let namen: string[] = []
  try {
    namen = readdirSync(map)
  } catch {
    namen = []
  }
  const uit: Afrekening = {
    pids: [],
    bestanden: [],
    ontbreekt: [],
    afwijkend: [],
    seconden: 0,
    meters: 0,
    km: 0,
    haltes: 0,
    teVroeg: 0,
    teLaat: 0,
    kaartjes: 0,
    kas: 0,
    aanrijdingen: 0,
    gewonden: 0,
    schokken: 0,
    ingestapt: 0,
    bediend: 0
  }
  const verwachteKaart = dienst?.mapFolder ? `maps/${dienst.mapFolder.replace(/\\/g, '/')}/global.cfg`.toLowerCase() : undefined
  for (const lid of keten) {
    const ondergrens = Math.floor((Date.parse(lid.gestart ?? sinds ?? '') || 0) / 1000) - 2
    const eigen = namen
      .map((naam) => ({ naam, m: /^(\d+)-(\d+)\.json$/i.exec(naam) }))
      .filter((x): x is { naam: string; m: RegExpExecArray } => Boolean(x.m) && Number(x.m![2]) === lid.pid && Number(x.m![1]) >= ondergrens)
    let gevonden = false
    for (const { naam } of eigen) {
      let s: OpenOmsiSessie
      try {
        s = JSON.parse(readFileSync(join(map, naam), 'utf8')) as OpenOmsiSessie
      } catch {
        continue
      }
      const kaart = kaartVan(s.map)
      const past =
        (!verwachteKaart || !kaart || kaart === verwachteKaart) &&
        (!dienst?.line || !s.line || s.line.trim().toLowerCase() === dienst.line.trim().toLowerCase()) &&
        (!dienst?.tour || !s.tour || s.tour.trim().toLowerCase() === dienst.tour.trim().toLowerCase())
      if (!past) {
        uit.afwijkend.push(naam)
        continue
      }
      gevonden = true
      uit.bestanden.push(naam)
      uit.seconden += getal(s.seconds)
      uit.meters += getal(s.metres)
      uit.haltes += getal(s.stops)
      uit.teVroeg += getal(s.early)
      uit.teLaat += getal(s.late)
      uit.kaartjes += getal(s.tickets)
      uit.kas += getal(s.cash)
      uit.aanrijdingen += getal(s.crashes)
      uit.gewonden += getal(s.hurt)
      uit.schokken += getal(s.jolts)
      uit.ingestapt += getal(s.boarded)
      uit.bediend += getal(s.served)
    }
    if (gevonden) uit.pids.push(lid.pid)
    else uit.ontbreekt.push(lid.pid)
  }
  if (uit.pids.length === 0) return { onvolledig: 'geenRit', ontbreekt: uit.ontbreekt, afwijkend: uit.afwijkend }
  uit.km = Math.round(uit.meters) / 1000
  return uit
}

/** Hoe lang de app na het einde van de keten op een sessiebestand wacht (ontwerp §6). */
export const AFREKENING_WACHT_MS = 30000

/**
 * De afrekening na het einde van de keten: klaar, nog even wachten (openOMSI
 * schrijft bij het afsluiten), of onvolledig. Onvolledig is geen fout: het
 * spel crashte of werd hard afgesloten, en dan schreef het niets.
 */
export function afrekeningNaEinde(
  keten: KetenLid[],
  einde: number,
  nu: number,
  thuis: string,
  dienst?: { mapFolder?: string; line?: string; tour?: string },
  sinds?: string
): { stand: 'klaar'; afrekening: Afrekening } | { stand: 'wacht' } | { stand: 'onvolledig'; ontbreekt: number[] } {
  const uitslag = leesAfrekening(keten, thuis, dienst, sinds)
  if (!('onvolledig' in uitslag)) {
    // Een lid zonder bestand kan nog schrijven: binnen de wachttijd nog even geduld.
    if (uitslag.ontbreekt.length > 0 && nu - einde < AFREKENING_WACHT_MS) return { stand: 'wacht' }
    return { stand: 'klaar', afrekening: uitslag }
  }
  if (nu - einde < AFREKENING_WACHT_MS) return { stand: 'wacht' }
  return { stand: 'onvolledig', ontbreekt: uitslag.ontbreekt }
}

/* -------------------------------------------------------------------------- */
/* Vrij rijden                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Vrij rijden in openOMSI (ontwerp §5.2): dezelfde volgorde als bij OMSI 2
 * (core/vrijstart.ts), met drie stappen anders.
 *
 * - Het startscherm van OMSI 2 (`laststn.osn` en `[last_map]` in de OMSI
 *   2-map) blijft onaangeroerd: openOMSI leest het niet, en het is van OMSI.
 * - De wachtende knoppen voor keyboard.cfg en een klaargezette lak worden hier
 *   niet in de OMSI 2-map gezet: dat wacht, zoals altijd, tot het gewone
 *   moment. Starten in openOMSI verandert in de OMSI 2-map alleen
 *   `Situations\OMSI Enhancer.*` (de situatie zelf).
 * - Starten is `--cli launch` met `situation` = het absolute pad van onze
 *   situatie (OO/crates/omsi-app/src/situation.rs:63).
 */
export function vrijeRitDepsVoorOpenOmsi(
  basis: VrijStartDeps,
  start: (situatie: string) => Promise<StartUitkomst>
): VrijStartDeps {
  let situatie: string | undefined
  return {
    ...basis,
    writeSituation: (verzoek) => {
      const uit = basis.writeSituation(verzoek)
      situatie = uit.file
      return uit
    },
    presetStartup: () => ({ lastSituation: false, lastMap: false }),
    schrijfStraks: async () => undefined,
    launchOmsi: async () => {
      if (!situatie) throw new Error('er is geen situatie geschreven')
      const uit = await start(situatie)
      if (uit.uitkomst !== 'gestart') throw new Error(uit.fout ?? 'openOMSI startte niet')
      return 'gestart'
    }
  }
}

/** Is het een spel volgens de opdrachtregel? Heruitgevoerd voor de proef. */
export { isSpelOpdracht }
