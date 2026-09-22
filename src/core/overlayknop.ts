import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bewaarKopie, schrijfVeilig } from './veilig'

/**
 * Overlays uitzetten vanuit de app.
 *
 * WAAROM DIT ER NU IS
 * OMSI liep herhaaldelijk vast op "Direct3D-Device lost!", en in het hangende
 * spel zaten telkens overlays die in de DirectX 9-weergave haken. `omsiProces.ts`
 * kijkt welke dat zijn en zei erbij: de app kan ze niet uitzetten. Dat klopte
 * voor de hendel die toen geprobeerd was -- de DLL van Steam hernoemen, en die
 * zet Steam bij elke start terug -- maar het is niet de hele waarheid. Steam en
 * de Xbox Game Bar hebben allebei een gewone schakelaar in een gewoon bestand of
 * in het register, en daar kan de app wél bij.
 *
 * WAT DE SCHAKELAAR VAN STEAM NIET DOET
 * Hij stopt het tekenen, niet het inhaken. OMSI heeft Steam-DRM, dus Steam laadt
 * `GameOverlayRenderer.dll` hoe dan ook in het proces. Op deze machine stonden
 * beide schakelaars al op nul terwijl die DLL toch in het vastgelopen spel zat.
 * Wie dus in het overlayscherm "Steam: in OMSI" ziet staan, ziet een bestand dat
 * geladen is en niet per se een overlay die aanstaat. Daar hoort de app eerlijk
 * over te zijn in plaats van te waarschuwen voor iets dat al uit is.
 *
 * WAT DISCORD EN NVIDIA BETREFT
 * Die bewaren hun keuze niet in een bestand waar iets van te maken valt.
 * `%APPDATA%\discord\settings.json` heeft elf sleutels en geen enkele over
 * overlays; de NVIDIA-app houdt het in zijn eigen opslag. Voor die twee blijft
 * het bij zeggen waar de schakelaar staat. Een knop die niets doet is erger dan
 * geen knop.
 *
 * WAT DEZE MODULE AANRAAKT
 * Bestanden van andere programma's, en dat is nieuw voor deze app. Daarom: nooit
 * schrijven terwijl het programma in kwestie draait, altijd eerst een kopie
 * bewaren, en alleen de regel veranderen die het betreft -- de rest van het
 * bestand komt er byte voor byte hetzelfde uit (`probe-overlayknop.ts` rekent
 * dat na).
 */

/** Wat de app werkelijk kan omzetten. */
export type Schakelbaar = 'steam' | 'gamebar'

export interface KnopStand {
  /** Staat de overlay aan? `undefined` als het niet vast te stellen is. */
  aan?: boolean
  /**
   * Waarom hij nu niet te schakelen is. Leeg betekent: hij kan om.
   * Bijvoorbeeld "Steam draait" -- dat programma schrijft zijn instellingen bij
   * het afsluiten terug en zou onze wijziging overschrijven.
   */
  belet?: string
  /** Waar de schakelaar staat, zodat het ook met de hand kan. */
  waar?: string
}

/* ---------------------------------------------------------------- register */

/** Een registerwaarde lezen; `undefined` als hij er niet is. */
function leesReg(sleutel: string, naam: string): string | undefined {
  try {
    const uit = execFileSync('reg', ['query', sleutel, '/v', naam], {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    /*
     * De waarde loopt tot het eind van de regel en mag spaties bevatten. Met
     * `\S+` viel een pad als "c:/program files (x86)/steam" er precies uit.
     */
    const m = uit.match(/REG_\w+\s{2,}(.+?)\s*$/m)
    return m ? m[1] : undefined
  } catch {
    return undefined
  }
}

function schrijfReg(sleutel: string, naam: string, waarde: number): void {
  execFileSync('reg', ['add', sleutel, '/v', naam, '/t', 'REG_DWORD', '/d', String(waarde), '/f'], {
    stdio: 'ignore'
  })
}

/** Draait dit programma op dit moment? */
export function draait(exe: string): boolean {
  try {
    const uit = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH'], {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return new RegExp(exe.replace('.', '\\.'), 'i').test(uit)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------- steam */

/**
 * De instellingenbestanden van Steam, één per aangemelde gebruiker.
 *
 * Er kunnen er meer zijn -- twee accounts op één pc -- en welke van de twee er
 * straks speelt weet de app niet. Daarom worden ze allemaal behandeld: "de
 * Steam-overlay uit" hoort op deze machine te gelden en niet voor één account.
 */
function steamConfigs(): string[] {
  const pad = leesReg('HKCU\\Software\\Valve\\Steam', 'SteamPath')
  if (!pad) return []
  const userdata = join(pad.replace(/\//g, '\\'), 'userdata')
  if (!existsSync(userdata)) return []
  const uit: string[] = []
  for (const id of readdirSync(userdata)) {
    const cfg = join(userdata, id, 'config', 'localconfig.vdf')
    if (existsSync(cfg)) uit.push(cfg)
  }
  return uit
}

/** De appid van OMSI 2 op Steam; zijn eigen blok in localconfig.vdf. */
const OMSI_APPID = '252530'

/**
 * De twee schakelaars van Steam, elk op hun eigen plek in het bestand.
 *
 * `EnableGameOverlay` geldt voor alles, `OverlayAppEnable` voor één spel. Ze
 * staan los van elkaar, en de app zet ze allebei -- anders zet je er één uit en
 * blijft de andere aan zonder dat iemand ziet waarom de overlay er toch is.
 *
 * WAAROM OP PAD EN NIET OP NAAM
 * Een localconfig.vdf draagt dezelfde sleutel op meer plekken. In dat van deze
 * gebruiker staat "252530" drie keer:
 *
 *     UserLocalConfigStore / Software / Valve / Steam / apps / 252530   speeltijd
 *     UserLocalConfigStore / depots / 252530                            depots
 *     UserLocalConfigStore / apps / 252530                              hier staat de vlag
 *
 * Zoeken op naam vond de eerste, en daar had de app de vlag in gezet: een blok
 * dat Steam voor iets anders gebruikt en waar hij hem nooit leest. Dat mislukt
 * zonder foutmelding -- de knop zegt "uit" en de overlay komt gewoon op.
 * `probe-overlayknop.ts` ving het; anders had niemand het gemerkt.
 */
const PAD_ALGEMEEN = ['UserLocalConfigStore', 'system']
const PAD_PER_SPEL = ['UserLocalConfigStore', 'apps', OMSI_APPID]

/** Waar een blok begint en eindigt: de indexen van zijn accolades. */
interface Blokspan {
  open: number
  sluit: number
}

/**
 * Het blok op dit pad, of niets.
 *
 * Elke stap zoekt alleen tussen de DIRECTE kinderen van de vorige, en dat is de
 * hele kunst. "apps" komt in dit bestand twee keer voor:
 *
 *     UserLocalConfigStore / Software / Valve / Steam / apps    speeltijd
 *     UserLocalConfigStore / apps                               de vlaggen
 *
 * Zoeken binnen het blok zonder op diepte te letten vindt de eerste, want die
 * ligt er nu eenmaal eerder in. Een direct kind is te herkennen aan zijn
 * inspringing: precies één tab dieper dan de accolade van zijn ouder.
 */
export function zoekBlok(tekst: string, pad: readonly string[]): Blokspan | undefined {
  let begin = 0
  let eind = tekst.length
  let diepteVanOuder = -1

  for (const sleutel of pad) {
    const wil = diepteVanOuder + 1
    // De sleutel staat alleen op zijn regel, met precies zoveel tabs ervoor.
    const zoek = new RegExp(`^\t{${wil}}"${sleutel}"[ \t]*$`, 'm')
    const binnen = tekst.slice(begin, eind)
    const hit = binnen.search(zoek)
    if (hit < 0) return undefined

    const open = tekst.indexOf('{', begin + hit)
    if (open < 0) return undefined

    let diepte = 0
    let sluit = -1
    for (let i = open; i < eind; i++) {
      if (tekst[i] === '{') diepte++
      else if (tekst[i] === '}') {
        diepte--
        if (diepte === 0) {
          sluit = i
          break
        }
      }
    }
    if (sluit < 0) return undefined

    begin = open
    eind = sluit + 1
    diepteVanOuder = wil
  }

  return { open: begin, sluit: eind - 1 }
}

/** De inhoud van een blok, om er iets in op te zoeken. */
function inhoudVan(tekst: string, pad: readonly string[]): string | undefined {
  const span = zoekBlok(tekst, pad)
  return span ? tekst.slice(span.open, span.sluit + 1) : undefined
}

function leesSteamVlaggen(tekst: string): { algemeen?: boolean; perSpel?: boolean } {
  const alg = inhoudVan(tekst, PAD_ALGEMEEN)?.match(/"EnableGameOverlay"\s+"(\d)"/)
  const spel = inhoudVan(tekst, PAD_PER_SPEL)?.match(/"OverlayAppEnable"\s+"(\d)"/)
  return {
    algemeen: alg ? alg[1] === '1' : undefined,
    perSpel: spel ? spel[1] === '1' : undefined
  }
}

export function leesSteam(): KnopStand {
  const configs = steamConfigs()
  const waar = 'Steam → Instellingen → In-game'
  if (configs.length === 0) return { waar }

  /*
   * Aan is aan zodra één van de twee vlaggen aan staat: de overlay verschijnt
   * dan immers. Zo leest de knop hetzelfde als wat je in het spel ziet.
   */
  let aan = false
  let gezien = false
  for (const cfg of configs) {
    const vlaggen = leesSteamVlaggen(readFileSync(cfg, 'latin1'))
    for (const v of [vlaggen.algemeen, vlaggen.perSpel]) {
      if (v === undefined) continue
      gezien = true
      if (v) aan = true
    }
  }

  return {
    aan: gezien ? aan : undefined,
    belet: draait('steam.exe') ? 'steam' : undefined,
    waar
  }
}

/**
 * Een vlag in het blok op dit pad zetten, of hem erbij zetten als hij ontbreekt.
 *
 * Alleen de regel zelf verandert; de inspringing en de rest van het bestand
 * blijven zoals ze waren. Ontbreekt de sleutel, dan komt hij als eerste regel in
 * het blok te staan, met dezelfde inspringing als wat daar al staat -- Steam
 * leest het bestand op sleutel en niet op volgorde.
 */
export function zetVlag(
  tekst: string,
  pad: readonly string[],
  sleutel: string,
  aan: boolean
): string {
  const span = zoekBlok(tekst, pad)
  if (!span) return tekst
  const inhoud = tekst.slice(span.open, span.sluit + 1)

  const waarde = aan ? '1' : '0'
  const bestaand = new RegExp(`("${sleutel}"\\s+")\\d(")`)

  let nieuw: string
  if (bestaand.test(inhoud)) {
    nieuw = inhoud.replace(bestaand, `$1${waarde}$2`)
  } else {
    // De inspringing van de eerste regel ín het blok overnemen.
    const eerste = inhoud.match(/\{\r?\n([ \t]*)/)
    const tab = eerste ? eerste[1] : '\t\t'
    nieuw = inhoud.replace(/\{(\r?\n)/, `{$1${tab}"${sleutel}"\t\t"${waarde}"$1`)
  }

  return tekst.slice(0, span.open) + nieuw + tekst.slice(span.sluit + 1)
}

export interface Uitkomst {
  gelukt: boolean
  /** Waarom niet, als het niet lukte. */
  reden?: string
  /** Hoeveel bestanden of waarden er zijn aangepast. */
  aantal?: number
}

export function zetSteam(aan: boolean): Uitkomst {
  if (draait('steam.exe')) return { gelukt: false, reden: 'steam' }
  const configs = steamConfigs()
  if (configs.length === 0) return { gelukt: false, reden: 'nietgevonden' }

  let aantal = 0
  for (const cfg of configs) {
    const oud = readFileSync(cfg, 'latin1')
    let nieuw = zetVlag(oud, PAD_ALGEMEEN, 'EnableGameOverlay', aan)
    // Het blok van OMSI hoeft er niet te zijn; dan volstaat de algemene vlag.
    if (zoekBlok(nieuw, PAD_PER_SPEL)) {
      nieuw = zetVlag(nieuw, PAD_PER_SPEL, 'OverlayAppEnable', aan)
    }
    if (nieuw === oud) continue
    // Eerst een kopie; dit is niet ons bestand.
    bewaarKopie(cfg)
    schrijfVeilig(cfg, Buffer.from(nieuw, 'latin1'))
    aantal++
  }
  return { gelukt: true, aantal }
}

/* ---------------------------------------------------------------- game bar */

/**
 * De Xbox Game Bar.
 *
 * Drie waarden onder `HKCU`, dus per gebruiker en zonder beheerdersrechten.
 * `GameDVR_Enabled` is het opnemen op de achtergrond, `AppCaptureEnabled` het
 * vastleggen zelf, en `ShowStartupPanel` het paneel dat over het spel komt.
 * Ze horen bij elkaar: laat je er één aan staan, dan haakt de Game Bar alsnog in.
 */
const GAMEBAR: Array<{ sleutel: string; naam: string }> = [
  { sleutel: 'HKCU\\System\\GameConfigStore', naam: 'GameDVR_Enabled' },
  { sleutel: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', naam: 'AppCaptureEnabled' },
  { sleutel: 'HKCU\\Software\\Microsoft\\GameBar', naam: 'ShowStartupPanel' }
]

export function leesGameBar(): KnopStand {
  let aan = false
  let gezien = false
  for (const { sleutel, naam } of GAMEBAR) {
    const w = leesReg(sleutel, naam)
    if (w === undefined) continue
    gezien = true
    // Registerwaarden komen als 0x0 of 0x1 terug.
    if (Number.parseInt(w, 16) !== 0) aan = true
  }
  return {
    aan: gezien ? aan : undefined,
    waar: 'Windows → Instellingen → Gaming → Xbox Game Bar'
  }
}

export function zetGameBar(aan: boolean): Uitkomst {
  let aantal = 0
  try {
    for (const { sleutel, naam } of GAMEBAR) {
      schrijfReg(sleutel, naam, aan ? 1 : 0)
      aantal++
    }
  } catch (oorzaak) {
    return { gelukt: false, reden: oorzaak instanceof Error ? oorzaak.message : 'register' }
  }
  return { gelukt: true, aantal }
}

/* -------------------------------------------------------------- samenvatten */

export interface OverlayKnoppen {
  steam: KnopStand
  gamebar: KnopStand
}

export function leesKnoppen(): OverlayKnoppen {
  return { steam: leesSteam(), gamebar: leesGameBar() }
}

export function zetKnop(welke: Schakelbaar, aan: boolean): Uitkomst {
  return welke === 'steam' ? zetSteam(aan) : zetGameBar(aan)
}
