import { execFile, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { uptime } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { isMotorActie, MOTOR_ACTIES } from '../shared/telefoon'
import type { Paneel } from './busprofiel'

/**
 * DE SPELMOTOR: OMSI 2 OF openOMSI (ontwerp openomsi-koppeling §4 en §5.1)
 *
 * De app moet met het gewone OMSI 2 én met openOMSI werken. openOMSI is een
 * herbouw in Rust, 64-bits, die de inhoud van de OMSI 2-map leest; onze
 * 32-bits plugin laadt daar niet, dus alles wat de app over het spel weet komt
 * er op een andere manier binnen. Dit bestand is het stuk dat voor beide
 * geldt: wat een spelproces is, wie welke motor draait, en wat elke motor kan.
 * Het eigenlijke werk staat per motor in `motoren/omsi.ts` en
 * `motoren/openomsi.ts`.
 *
 * WAAROM HET HERKENNEN ZO GAAT
 * `openomsi.exe` is niet altijd een spel. Kaal gestart (dubbelklik) is het de
 * launcher, en `openomsi-launcher.exe` start het spel zelf weer met
 * `--launcher` voor zijn venster. Alleen een `openomsi.exe` met een
 * spelopdracht (`--map`, `--situation`, `--no-menu`, `--menu`, `--tutorial`)
 * en zonder `--launcher`, `--export-glb`, `--offscreen` of `--server` is een
 * spel. Dat staat alleen in de opdrachtregel, en die geeft `tasklist` niet;
 * een CIM-vraag kost een PowerShell-start (± 1,5 s). Dus van goedkoop naar
 * duur: de instances van de launcher (~/.openomsi/instances), één `tasklist`
 * voor alle drie de namen, en pas voor een nieuw pid dat de launcher niet kent
 * één CIM-vraag, onthouden per pid.
 */

export type MotorId = 'omsi' | 'openomsi'

export const MOTOR_NAAM: Record<MotorId, string> = { omsi: 'OMSI 2', openomsi: 'openOMSI' }

/** Een draaiend spel (of een launcher), met het pid en de starttijd als identiteit. */
export interface SpelProces {
  motor: MotorId
  pid: number
  /** Wanneer het proces startte, ISO in UTC. Een pid wordt hergebruikt, een starttijd niet. */
  gestart?: string
  /** Het pid van het proces dat dit startte (CIM); voor de keten van herstarts. */
  ouder?: number
  /** Waar de exe staat, als dat bekend is (CIM). */
  pad?: string
  /** Draait hij uit de tijdelijke map (een uitgepakte Rar)? Dan waarschuwt de app. */
  uitTemp: boolean
  /** De opdrachtregel zonder de programmanaam. */
  args?: string[]
  /** Wat de launcher (instance) of de opdrachtregel over de rit zegt. */
  dienst?: { map?: string; bus?: string; line?: string; tour?: string; log?: string }
  bron: 'instance' | 'cim' | 'tasklist'
  /**
   * CIM gaf geen opdrachtregel (de vraag mislukte, of het proces draait als
   * beheerder en de app niet): de app weet niet of dit een spel is. Het telt
   * mee als "er draait iets" (de Lakstudio, add-ons: bestanden kunnen open
   * staan), maar nooit als het spel van een dienst: niet om in mee te rijden,
   * niet als reden om OMSI 2 te weigeren (`welkeDraait`). Alleen een kind van
   * een lid van de keten (CIM gaf de ouder wel) is een herstart.
   */
  onzeker?: boolean
}

export interface Herkenning {
  /** Wanneer er gekeken is (ms). */
  tijd: number
  omsi: SpelProces[]
  /** Alleen de spellen van openOMSI. */
  openomsi: SpelProces[]
  /** `openomsi.exe` zonder spelopdracht en `openomsi-launcher.exe`. */
  launchers: SpelProces[]
}

/**
 * Wat een motor kan (ontwerp §4 en §1). De app beslist per onderdeel, niet op
 * een versienummer: openOMSI geeft een versie per commit, en een waarschuwing
 * "nieuwer dan getest" zou dan altijd aanstaan.
 */
export interface MotorKan {
  /** Live gegevens tijdens het rijden (overlay, km, loon). openOMSI: pas met de Lua-brug (0.8.0). */
  dienstLive: boolean
  positie: boolean
  kaartverkoop: boolean
  meshZichtbaar: boolean
  aanrijdingLive: boolean
  /** Scripttriggers (IBIS, AFR, LAWO) op naam indrukken. */
  knopOpNaam: boolean
  /**
   * Kaartje, wisselgeld en de andere motoracties (MOTOR_ACTIES): toetsen die de
   * motor zelf afhandelt. Er is geen tussenstand "alleen als het spel vooraan
   * staat" met een toetsaanslag: dat liet Luc vallen (01-10). `nee` = weg.
   */
  motorKnoppen: 'altijd' | 'nee'
  /** `-windowed` bij het starten. openOMSI kent die vlag niet (clap weigert hem). */
  vensterVlag: boolean
  /** De schakelaar voor de Steam-overlay en de controle op overlays in het spel. */
  steamOverlay: boolean
  overlayModules: boolean
  /** De afrekening komt na afloop uit het spel zelf (openOMSI: ~/.openomsi/sessions). */
  afrekeningAchteraf: boolean
  /** De overlay boven het spel. */
  overlay: boolean
}

/*
 * De motoracties (kaartje, wisselgeld, knipperlicht, handrem, koplampen) staan
 * in shared/telefoon.ts, omdat de telefoon en de overlay ze ook moeten kennen:
 * in openOMSI staan die knoppen er niet.
 */
export { isMotorActie, MOTOR_ACTIES }

/** Mag de app deze knop in dit spel laten zien en indrukken? */
export function knopKanIn(kan: MotorKan, naam: string): boolean {
  return kan.motorKnoppen !== 'nee' || !isMotorActie(naam)
}

/**
 * De apparaten van de bus zonder de motoracties, als het spel die niet via de
 * app kan (openOMSI; keuze van Luc: weg, niet grijs). Een knop gaat uit zijn
 * rij, een lege rij verdwijnt, en een aantikbaar vak op het scherm wordt
 * gewone tekst. Voor OMSI 2 precies hetzelfde voorwerp terug.
 */
export function panelenZonderMotoracties(panelen: Paneel[] | undefined, kan: MotorKan): Paneel[] | undefined {
  if (!panelen || kan.motorKnoppen !== 'nee') return panelen
  const rijen = (knoppen: Paneel['rijen']): Paneel['rijen'] =>
    knoppen.map((rij) => rij.filter((knop) => !isMotorActie(knop.actie))).filter((rij) => rij.length > 0)
  return panelen.map((paneel) => ({
    ...paneel,
    rijen: rijen(paneel.rijen),
    losseRijen: paneel.losseRijen ? rijen(paneel.losseRijen) : undefined,
    vlak: paneel.vlak
      ? {
          ...paneel.vlak,
          velden: paneel.vlak.velden.map((veld) =>
            veld.actie && isMotorActie(veld.actie) ? { ...veld, actie: undefined } : veld
          )
        }
      : undefined
  }))
}

/** De knoppen met een toets, zonder de motoracties als het spel die niet via de app kan. */
export function knoppenZonderMotoracties<T extends { beschikbaar: string[] }>(knoppen: T, kan: MotorKan): T {
  if (kan.motorKnoppen !== 'nee') return knoppen
  return { ...knoppen, beschikbaar: knoppen.beschikbaar.filter((naam) => !isMotorActie(naam)) }
}

export const KAN: Record<MotorId, MotorKan> = {
  omsi: {
    dienstLive: true,
    positie: true,
    kaartverkoop: true,
    meshZichtbaar: true,
    aanrijdingLive: true,
    knopOpNaam: true,
    motorKnoppen: 'altijd',
    vensterVlag: true,
    steamOverlay: true,
    overlayModules: true,
    afrekeningAchteraf: false,
    overlay: true
  },
  /*
   * 0.7.0 "openOMSI zonder live". De motoracties (kaartje, wisselgeld,
   * knipperlicht, handrem, koplampen; zie MOTOR_ACTIES) staan er in openOMSI
   * niet (keuze van Luc); de rest komt met de Lua-plugin `omsihub` in 0.8.0.
   */
  openomsi: {
    dienstLive: false,
    positie: false,
    kaartverkoop: false,
    meshZichtbaar: false,
    aanrijdingLive: false,
    knopOpNaam: false,
    motorKnoppen: 'nee',
    vensterVlag: false,
    steamOverlay: false,
    overlayModules: false,
    afrekeningAchteraf: true,
    overlay: false
  }
}

/* -------------------------------------------------------------------------- */
/* De opdrachtregel                                                            */
/* -------------------------------------------------------------------------- */

const SPELOPDRACHT = new Set(['--map', '--situation', '--no-menu', '--menu', '--tutorial'])
const GEEN_SPEL = new Set(['--launcher', '--export-glb', '--offscreen', '--server'])

/** `--map=x` telt als `--map`: clap neemt beide. */
function optieNaam(arg: string): string {
  return arg.split('=')[0].toLowerCase()
}

/**
 * Is dit de opdrachtregel van een spel (zonder de programmanaam)? Zie de uitleg
 * bovenaan: kaal is de launcher (OO/crates/omsi-app/src/lib.rs:170-181).
 */
export function isSpelOpdracht(args: string[]): boolean {
  const namen = args.map(optieNaam)
  return namen.some((naam) => SPELOPDRACHT.has(naam)) && !namen.some((naam) => GEEN_SPEL.has(naam))
}

/**
 * Een Windows-opdrachtregel in stukken, zoals CommandLineToArgvW het doet:
 * aanhalingstekens groeperen, `\"` is een aanhalingsteken, backslashes zijn
 * alleen bijzonder vlak voor een aanhalingsteken. De launcher van openOMSI
 * (Rust) en Node quoten zo; een pad als `C:/Program Files (x86)/...` blijft
 * één stuk.
 */
export function splitsOpdrachtregel(regel: string): string[] {
  const uit: string[] = []
  const n = regel.length
  let i = 0
  while (i < n) {
    while (i < n && (regel[i] === ' ' || regel[i] === '\t')) i++
    if (i >= n) break
    let arg = ''
    let binnen = false
    while (i < n) {
      const c = regel[i]
      if (c === '\\') {
        let aantal = 0
        while (i < n && regel[i] === '\\') {
          aantal++
          i++
        }
        if (i < n && regel[i] === '"') {
          arg += '\\'.repeat(Math.floor(aantal / 2))
          if (aantal % 2 === 1) {
            arg += '"'
            i++
          }
        } else {
          arg += '\\'.repeat(aantal)
        }
        continue
      }
      if (c === '"') {
        if (binnen && regel[i + 1] === '"') {
          arg += '"'
          i += 2
          continue
        }
        binnen = !binnen
        i++
        continue
      }
      if (!binnen && (c === ' ' || c === '\t')) break
      arg += c
      i++
    }
    uit.push(arg)
  }
  return uit
}

/** De waarde van een optie in een opdrachtregel (`--map x` of `--map=x`). */
export function optieWaarde(args: string[], naam: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.toLowerCase() === naam) return args[i + 1]
    if (a.toLowerCase().startsWith(`${naam}=`)) return a.slice(naam.length + 1)
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/* tasklist, CIM en de instances                                               */
/* -------------------------------------------------------------------------- */

/** `tasklist /FO CSV /NH`: naam en pid per regel. */
export function leesTasklist(csv: string): Array<{ naam: string; pid: number }> {
  const uit: Array<{ naam: string; pid: number }> = []
  for (const regel of csv.split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(regel.trim())
    if (m) uit.push({ naam: m[1], pid: Number(m[2]) })
  }
  return uit
}

export function tasklistNu(): Promise<string> {
  return new Promise((klaar) => {
    const kijk = spawn('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true })
    let uit = ''
    kijk.stdout.on('data', (stuk) => {
      uit += String(stuk)
    })
    kijk.on('close', () => klaar(uit))
    kijk.on('error', () => klaar(''))
  })
}

/** Wat CIM over een proces zegt. */
export interface CimProces {
  pid: number
  ouder?: number
  regel?: string
  pad?: string
  /** ISO, UTC. */
  start?: string
}

/**
 * Eén CIM-vraag voor een rij pids: opdrachtregel, ouder, pad en starttijd. De
 * gewone (64-bits) PowerShell, want openOMSI is 64-bits; de starttijd als
 * ISO-tekst, zodat twee keer lezen hetzelfde geeft.
 */
export function cimVraag(pids: number[]): Promise<CimProces[] | undefined> {
  const filter = pids.map((pid) => `ProcessId=${Math.trunc(pid)}`).join(' OR ')
  const opdracht =
    `$uit = @(Get-CimInstance Win32_Process -Filter '${filter}' -ErrorAction SilentlyContinue | ForEach-Object { ` +
    `$s = $null; try { $s = $_.CreationDate.ToUniversalTime().ToString('o') } catch { }; ` +
    `[pscustomobject]@{ pid = [int]$_.ProcessId; ouder = [int]$_.ParentProcessId; regel = $_.CommandLine; pad = $_.ExecutablePath; start = $s } }); ` +
    `ConvertTo-Json -InputObject $uit -Compress; exit 0`
  return new Promise((klaar) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', opdracht],
      { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      (fout, uit) => {
        if (fout) {
          klaar(undefined)
          return
        }
        try {
          const gelezen = JSON.parse(uit.trim() || '[]') as unknown
          const rij = Array.isArray(gelezen) ? gelezen : [gelezen]
          klaar(
            rij
              .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
              .map((p) => ({
                pid: Number(p.pid),
                ouder: typeof p.ouder === 'number' ? p.ouder : undefined,
                regel: typeof p.regel === 'string' ? p.regel : undefined,
                pad: typeof p.pad === 'string' ? p.pad : undefined,
                start: typeof p.start === 'string' && p.start ? p.start : undefined
              }))
          )
        } catch {
          klaar(undefined)
        }
      }
    )
  })
}

/** Een instance van de launcher (OO/crates/omsi-launcher-core/src/instances.rs:22-60). */
export interface OpenOmsiInstance {
  id: string
  pid: number
  /** FILETIME (100 ns sinds 1601), zoals de launcher hem bewaart. */
  process_started?: number | null
  log?: string
  started?: number
  map?: string
  bus?: string
  entry?: number | null
  line?: string | null
  tour?: string | null
  profile?: string
  args?: string[]
  running?: boolean
  ended?: number | null
}

/** FILETIME naar ISO. Een u64 past niet precies in een double, maar op de milliseconde wel. */
export function filetimeNaarIso(ft: number | null | undefined): string | undefined {
  if (typeof ft !== 'number' || !Number.isFinite(ft) || ft <= 0) return undefined
  const ms = ft / 10000 - 11644473600000
  return Number.isFinite(ms) && ms > 0 ? new Date(Math.round(ms)).toISOString() : undefined
}

/** De instances die de launcher als lopend kent. Een kapot bestand slaat hij over. */
export function leesInstances(thuis: string): OpenOmsiInstance[] {
  const map = join(thuis, 'instances')
  let namen: string[]
  try {
    namen = readdirSync(map).filter((naam) => naam.toLowerCase().endsWith('.json'))
  } catch {
    return []
  }
  const uit: OpenOmsiInstance[] = []
  for (const naam of namen) {
    try {
      const inst = JSON.parse(readFileSync(join(map, naam), 'utf8')) as OpenOmsiInstance
      if (inst && typeof inst.pid === 'number') uit.push(inst)
    } catch {
      // Half geschreven (de launcher schrijft via .tmp en rename) of kapot: volgende keer.
    }
  }
  return uit
}

/** Twee starttijden zijn dezelfde als ze op de seconde gelijk zijn (CIM en Get-Process ronden anders af). */
export function zelfdeStart(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return true
  const x = Date.parse(a)
  const y = Date.parse(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return a === b
  return Math.abs(x - y) < 1000
}

/** Staat dit pad in de tijdelijke map (%TEMP%, een uitgepakte Rar)? */
export function inTemp(pad: string | undefined, tempMappen: string[]): boolean {
  if (!pad) return false
  const p = resolve(pad).toLowerCase()
  return tempMappen.some((map) => {
    const t = resolve(map).toLowerCase()
    return p === t || p.startsWith(t.endsWith(sep) ? t : t + sep)
  })
}

export function tempMappenNu(): string[] {
  return [process.env.TEMP, process.env.TMP, process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp') : undefined].filter(
    (map): map is string => Boolean(map)
  )
}

/* -------------------------------------------------------------------------- */
/* De herkenner                                                                */
/* -------------------------------------------------------------------------- */

export interface HerkenOpties {
  /** De namen van de programma's, met `.exe`. Een proef zet hier zijn eigen namen. */
  namen: { omsi: string; openomsi: string; launcher: string }
  /** ~/.openomsi, voor de instances. */
  thuis: string
  tempMappen?: string[]
  tasklist?: () => Promise<string>
  cim?: (pids: number[]) => Promise<CimProces[] | undefined>
  /** Hoe lang een mislukte CIM-vraag niet herhaald wordt (ms). */
  cimRust?: number
  nu?: () => number
  /**
   * Wanneer de computer opstartte (ms). Een instance met een proces van daarvoor
   * is van een vorige keer, wat er nu ook onder zijn pid draait. Standaard uit
   * `os.uptime()`.
   */
  opgestart?: number
}

interface Gekend {
  gestart?: string
  ouder?: number
  pad?: string
  args?: string[]
  /** Mislukt: niet opnieuw vragen tot dit moment. */
  opnieuwNa?: number
}

/**
 * Houdt per pid vast wat CIM zei, zodat elke `openomsi.exe` hooguit één keer
 * een PowerShell kost. Een pid dat uit `tasklist` verdwijnt, gaat ook hier
 * weg: komt hetzelfde nummer later terug, dan is het een ander proces.
 */
export class Herkenner {
  private gekend = new Map<number, Gekend>()
  /**
   * Instances die `running:true` zeggen terwijl hun pid al eens uit `tasklist`
   * verdwenen was. Een spel dat via `--cli launch` startte, ruimt niemand op
   * (`reap` draait alleen in een launchervenster, instances.rs); komt het pid
   * later terug, dan is het een ander proces -- misschien een kale launcher --
   * en geen spel. Die instance telt dan niet meer: de opdrachtregel beslist.
   */
  private instancesWeg = new Set<string>()
  /** Hoe vaak er per pid een CIM-vraag ging; voor de proef (§9.2: hooguit één). */
  readonly cimVragen = new Map<number, number>()
  /** Hoeveel PowerShell-starts er in totaal waren. */
  cimRondes = 0

  constructor(private opties: HerkenOpties) {}

  async kijk(): Promise<Herkenning> {
    const nu = this.opties.nu?.() ?? Date.now()
    const opgestart = this.opties.opgestart ?? Date.now() - uptime() * 1000
    const temp = this.opties.tempMappen ?? tempMappenNu()
    const lijst = leesTasklist(await (this.opties.tasklist ?? tasklistNu)())
    const is = (naam: string, doel: string): boolean => naam.toLowerCase() === doel.toLowerCase()
    const namen = this.opties.namen

    const omsi: SpelProces[] = lijst
      .filter((p) => is(p.naam, namen.omsi))
      .map((p) => ({ motor: 'omsi', pid: p.pid, uitTemp: false, bron: 'tasklist' }))
    const launchers: SpelProces[] = lijst
      .filter((p) => is(p.naam, namen.launcher))
      .map((p) => ({ motor: 'openomsi', pid: p.pid, uitTemp: false, bron: 'tasklist' }))
    const oo = lijst.filter((p) => is(p.naam, namen.openomsi))

    // Wat niet meer draait, vergeten: een hergebruikt pid is een ander proces.
    const levend = new Set(oo.map((p) => p.pid))
    for (const pid of [...this.gekend.keys()]) if (!levend.has(pid)) this.gekend.delete(pid)

    const instances = new Map<number, OpenOmsiInstance>()
    for (const inst of leesInstances(this.opties.thuis)) {
      if (inst.running !== true || (inst.ended !== null && inst.ended !== undefined)) continue
      const sleutel = inst.id || `${inst.pid}|${inst.process_started ?? inst.started ?? ''}`
      /*
       * Het spel van deze instance is weg; wat er straks onder dit pid draait, is
       * iets anders. Niet voor een instance van de laatste 15 s: die kan net na
       * onze `tasklist` geschreven zijn, voor een spel dat er toen nog niet in stond.
       */
      const jong = typeof inst.started === 'number' && nu / 1000 - inst.started < 15
      /*
       * Een spel van voor het opstarten van de computer draait niet meer, wat er
       * nu ook onder zijn pid zit: na een herstart van Windows komen pids snel
       * terug, en dan zag de app het spel nooit weggaan (tegenlezing 01-10).
       * Zit de opstarttijd ernaast, dan beslist de opdrachtregel (CIM): een echt
       * spel blijft zo een spel.
       */
      const begon = filetimeNaarIso(inst.process_started ?? undefined)
      if (begon && Date.parse(begon) < opgestart - 5000) {
        this.instancesWeg.add(sleutel)
        continue
      }
      if (!levend.has(inst.pid)) {
        if (!jong) this.instancesWeg.add(sleutel)
      } else if (!this.instancesWeg.has(sleutel)) instances.set(inst.pid, inst)
    }

    // 1. De launcher kent hem: dan is het een spel, met de dienst erbij.
    // 2. Al eerder gevraagd: dat antwoord. 3. Anders: in de rij voor CIM.
    const vragen = oo
      .map((p) => p.pid)
      .filter((pid) => !instances.has(pid))
      .filter((pid) => {
        const g = this.gekend.get(pid)
        return !g || (g.opnieuwNa !== undefined && nu >= g.opnieuwNa)
      })
    if (vragen.length > 0) {
      this.cimRondes++
      for (const pid of vragen) this.cimVragen.set(pid, (this.cimVragen.get(pid) ?? 0) + 1)
      const antwoord = await (this.opties.cim ?? cimVraag)(vragen)
      const rust = nu + (this.opties.cimRust ?? 60000)
      for (const pid of vragen) {
        const c = antwoord?.find((item) => item.pid === pid)
        if (c?.regel) {
          this.gekend.set(pid, { gestart: c.start, ouder: c.ouder, pad: c.pad, args: splitsOpdrachtregel(c.regel).slice(1) })
        } else if (c) {
          /*
           * Wel het proces, geen opdrachtregel: zo antwoordt CIM voor een proces
           * dat als beheerder draait (of een vraag die half lukte). Ouder en
           * starttijd zijn er meestal wel. Over een minuut opnieuw vragen, in
           * plaats van het voor altijd "onzeker" te laten.
           */
          this.gekend.set(pid, { gestart: c.start, ouder: c.ouder, pad: c.pad, opnieuwNa: rust })
        } else {
          // Geen antwoord (PowerShell weigerde, of het proces is net weg): een minuut niet opnieuw.
          this.gekend.set(pid, { opnieuwNa: rust })
        }
      }
    }

    const openomsi: SpelProces[] = []
    for (const p of oo) {
      const inst = instances.get(p.pid)
      if (inst) {
        const args = Array.isArray(inst.args) ? inst.args : []
        openomsi.push({
          motor: 'openomsi',
          pid: p.pid,
          gestart: filetimeNaarIso(inst.process_started ?? undefined),
          uitTemp: false,
          args,
          dienst: {
            map: inst.map || undefined,
            bus: inst.bus || undefined,
            line: inst.line ?? undefined,
            tour: inst.tour ?? undefined,
            log: inst.log
          },
          bron: 'instance'
        })
        continue
      }
      const g = this.gekend.get(p.pid)
      if (!g || !g.args) {
        /*
         * Niet te zien wat het is. Het staat in de lijst (er draait iets), maar
         * als onzeker: zie `SpelProces.onzeker`. Ouder en starttijd gaan mee als
         * CIM ze gaf, zodat een herstart van een spel als beheerder in de keten komt.
         */
        openomsi.push({
          motor: 'openomsi',
          pid: p.pid,
          gestart: g?.gestart,
          ouder: g?.ouder,
          pad: g?.pad,
          uitTemp: inTemp(g?.pad, temp),
          bron: 'tasklist',
          onzeker: true
        })
        continue
      }
      const proces: SpelProces = {
        motor: 'openomsi',
        pid: p.pid,
        gestart: g.gestart,
        ouder: g.ouder,
        pad: g.pad,
        uitTemp: inTemp(g.pad, temp),
        args: g.args,
        dienst: {
          map: optieWaarde(g.args, '--map'),
          bus: optieWaarde(g.args, '--bus'),
          line: optieWaarde(g.args, '--line'),
          tour: optieWaarde(g.args, '--tour')
        },
        bron: 'cim'
      }
      if (isSpelOpdracht(g.args)) openomsi.push(proces)
      else launchers.push(proces)
    }
    return { tijd: nu, omsi, openomsi, launchers }
  }
}

/* -------------------------------------------------------------------------- */
/* Welke motor                                                                  */
/* -------------------------------------------------------------------------- */

/** De openOMSI-spellen waarvan zeker is dat het spellen zijn (zie `SpelProces.onzeker`). */
export function zekereSpellen(h: Herkenning | undefined): SpelProces[] {
  return (h?.openomsi ?? []).filter((p) => !p.onzeker)
}

/** Welke spellen draaien er (OMSI 2 eerst)? Een onzeker proces telt niet. */
export function welkeDraaien(h: Herkenning | undefined): MotorId[] {
  const uit: MotorId[] = []
  if (h && h.omsi.length > 0) uit.push('omsi')
  if (zekereSpellen(h).length > 0) uit.push('openomsi')
  return uit
}

/** Draait er een spel, en welk? OMSI gaat voor als het er allebei zijn (dat hoort niet). */
export function welkeDraait(h: Herkenning | undefined): MotorId | undefined {
  return welkeDraaien(h)[0]
}

export function spelDraaitIn(h: Herkenning | undefined): boolean {
  return Boolean(h && (h.omsi.length > 0 || h.openomsi.length > 0))
}

/*
 * DE SPELKEUZE (keuze van Luc, 01-10)
 *
 * De speler kiest zelf in welk spel hij rijdt: "Spel: OMSI 2 / openOMSI", in
 * de instellingen en naast START. Herkennen is alleen voor "welk spel draait
 * nu"; wat de app start, bepaalt de keuze -- nooit stil wisselen.
 *
 * - Zonder openOMSI is er niets te kiezen: OMSI 2, zoals altijd.
 * - Staat openOMSI er wel en koos de speler nog niet, dan stelt de app een
 *   spel voor (wat er draait, anders wat het laatst gespeeld is) en vraagt het
 *   bij de eerste START; er start niets voordat er gekozen is.
 * - Draait het andere spel al, dan start er niets en zegt de app waarom
 *   (`anderSpel`). Een tweede spel naast het eerste schreef in dezelfde
 *   profielen en in dezelfde spelmap.
 * - Koos de speler openOMSI en is het er niet (meer), dan start er ook niets
 *   (`nietGevonden`): niet stilletjes OMSI 2.
 */

/** Waarom de app een spel voorstelt. */
export type VoorstelReden = 'draait' | 'laatst' | 'alleen' | 'standaard'

export interface Voorstel {
  motor: MotorId
  reden: VoorstelReden
}

/**
 * Welk spel de app voorstelt als de speler nog niet koos: wat er draait;
 * anders wat het laatst gespeeld is (ms, uit de bestanden die elk spel
 * achterlaat: logfile.txt van OMSI 2, ~/.openomsi van openOMSI); anders OMSI 2.
 */
export function stelSpelVoor(
  draait: MotorId | undefined,
  laatst: { omsi?: number; openomsi?: number },
  gevonden: { openomsi: boolean }
): Voorstel {
  if (draait) return { motor: draait, reden: 'draait' }
  if (!gevonden.openomsi) return { motor: 'omsi', reden: 'alleen' }
  const oo = laatst.openomsi ?? 0
  const om = laatst.omsi ?? 0
  if (oo > 0 || om > 0) return { motor: oo > om ? 'openomsi' : 'omsi', reden: 'laatst' }
  return { motor: 'omsi', reden: 'standaard' }
}

export interface MotorKeuzeUitslag {
  /** Het spel waarin START begint (of zou beginnen). */
  motor: MotorId
  /** Het andere spel draait al: er start niets. */
  anderSpel?: MotorId
  /** De speler moet nog kiezen (openOMSI gevonden, nooit gekozen): er start niets. */
  kiezen?: boolean
  /** openOMSI gekozen, maar niet gevonden: er start niets. */
  nietGevonden?: boolean
}

/**
 * Met welk spel een dienst of vrije rit start (zie DE SPELKEUZE hierboven).
 * `voorstel` is wat de app voorstelt als er nog niet gekozen is; dat wordt dan
 * `motor`, met `kiezen`.
 *
 * `draait` is wat er draait: één spel, of de lijst (`welkeDraaien`). Draait
 * het andere spel, dan is dat `anderSpel` -- ook als het gekozen spel er
 * naast draait. Twee spellen tegelijk schrijven in dezelfde profielen en
 * dezelfde spelmap; dan begint START niets en zegt het waarom.
 */
export function kiesMotor(
  keuze: MotorId | undefined,
  draait: MotorId | readonly MotorId[] | undefined,
  gevonden: { openomsi: boolean },
  voorstel?: Voorstel
): MotorKeuzeUitslag {
  const uit: MotorKeuzeUitslag = { motor: 'omsi' }
  if (keuze === 'omsi' || keuze === 'openomsi') {
    uit.motor = keuze
    if (keuze === 'openomsi' && !gevonden.openomsi) uit.nietGevonden = true
  } else if (gevonden.openomsi) {
    uit.motor = voorstel?.motor ?? 'omsi'
    uit.kiezen = true
  }
  const lijst: readonly MotorId[] = draait === undefined ? [] : typeof draait === 'string' ? [draait] : draait
  const ander = lijst.find((m) => m !== uit.motor)
  if (ander) uit.anderSpel = ander
  return uit
}
