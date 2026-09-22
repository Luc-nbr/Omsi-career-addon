import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { logFout } from './logboek'
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
 * bewaren, en alleen de regel veranderen die het betreft, of de paar regels
 * erbij zetten die Steam zelf ook zou schrijven -- de rest van het bestand komt
 * er byte voor byte hetzelfde uit (`probe-overlayknop.ts` rekent dat na).
 */

/** Wat de app werkelijk kan omzetten. */
export type Schakelbaar = 'steam' | 'gamebar'

/**
 * Waarom een schakelaar nu niet om kan.
 *
 * Vaste codes en geen zinnen: de renderer vertaalt ze. Hier stonden eerst een
 * Nederlands pad ("Steam → Instellingen → In-game") en ruwe foutteksten, en die
 * kreeg een Engelse, Duitse of Franse gebruiker zo in beeld. Waar de schakelaar
 * met de hand staat, weet de renderer uit welke van de twee het is.
 *
 * - `steam`: Steam draait, en schrijft zijn instellingen bij het afsluiten terug
 *   over de onze heen.
 * - `allespellen`: Steam heeft de overlay voor alle spellen uit. Die schakelaar
 *   laat de app met rust; zie {@link zetSteam}.
 */
export type Belet = 'steam' | 'allespellen'

/**
 * Waarom omzetten niet lukte; ook vaste codes, om dezelfde reden als
 * {@link Belet}. De foutmelding zelf gaat het logboek in.
 *
 * `geenblok` heet nog naar wat het eerst betekende, geen blok voor OMSI. Dat
 * zet de app nu zelf erbij; de code zegt nu dat een bestand niet in de vorm
 * staat waarin de app het veilig kan aanvullen (zie {@link zetVlag}).
 */
export type Reden =
  | Belet
  | 'nietgevonden'
  | 'geenblok'
  | 'lezen'
  | 'schrijven'
  | 'register'

export interface KnopStand {
  /** Staat de overlay aan? `undefined` als het niet vast te stellen is. */
  aan?: boolean
  /** Waarom hij nu niet te schakelen is. Leeg betekent: hij kan om. */
  belet?: Belet
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
 * `EnableGameOverlay` geldt voor alle spellen, `OverlayAppEnable` voor één. De
 * overlay verschijnt in OMSI alleen als ze allebei aan staan. De app leest ze
 * dus allebei, maar zet alleen die van OMSI om. Eerst zette hij ook de algemene
 * om, in het bestand van elk account: "uit" gold dan ook voor The Bus, TSW en
 * Assetto Corsa op deze machine, waar niemand om had gevraagd.
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
/** Het buitenste blok. Zonder dat is het bestand niet heel, of niet van Steam. */
const PAD_WORTEL = ['UserLocalConfigStore']

/** Waar een blok begint en eindigt: de indexen van zijn accolades. */
interface Blokspan {
  open: number
  sluit: number
}

/** Een tekst tussen aanhalingstekens of een accolade, zoals ze in het bestand staan. */
interface Stuk {
  soort: '"' | '{' | '}'
  /** Index van het aanhalingsteken vooraan, of van de accolade. */
  begin: number
  /** Index net na het aanhalingsteken achteraan, of na de accolade. */
  eind: number
  /** Bij een accolade: waar in de lijst de accolade staat die erbij hoort. */
  paar: number
}

/**
 * Het bestand in stukken, of niets als het niet klopt.
 *
 * WAAROM DE TEKSTEN EROMHEEN GAAN
 * Accolades tellen over het hele bestand telde ook die ín een waarde mee, en
 * daar staan er in dit bestand ruim duizend: WebStorage bewaart JSON als tekst,
 * en onder friends staan de Steam-namen van vrienden (`name`, `NameHistory`), en
 * die kiezen ze zelf. Eén '}' in zo'n naam, en `UserLocalConfigStore` leek al bij
 * friends te eindigen; het blok van OMSI kwam dan middenin friends te staan, de
 * knop zei "uit" en Steam liet de overlay gewoon zien. Dus wordt elke tekst tussen
 * aanhalingstekens in zijn geheel overgeslagen, met de backslash ervoor zoals
 * Steam hem schrijft (`\"` in die JSON, `\\` voor een backslash).
 *
 * Buiten de teksten hoort er alleen witruimte en accolades te staan. Iets anders
 * -- een tekst die niet sluit, een accolade te veel of te weinig, een woord
 * zonder aanhalingstekens -- en de app weet niet meer zeker waar een blok
 * begint of eindigt. Dan liever niets dan raden.
 */
function stukken(tekst: string): Stuk[] | undefined {
  const uit: Stuk[] = []
  const nogOpen: number[] = []
  let i = 0
  while (i < tekst.length) {
    const c = tekst[i]
    if (c === '"') {
      let j = i + 1
      while (j < tekst.length && tekst[j] !== '"') j += tekst[j] === '\\' ? 2 : 1
      if (j >= tekst.length) return undefined
      uit.push({ soort: '"', begin: i, eind: j + 1, paar: -1 })
      i = j + 1
    } else if (c === '{') {
      nogOpen.push(uit.length)
      uit.push({ soort: '{', begin: i, eind: i + 1, paar: -1 })
      i++
    } else if (c === '}') {
      const open = nogOpen.pop()
      if (open === undefined) return undefined
      uit[open].paar = uit.length
      uit.push({ soort: '}', begin: i, eind: i + 1, paar: open })
      i++
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++
    } else {
      return undefined
    }
  }
  return nogOpen.length === 0 ? uit : undefined
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
 * ligt er nu eenmaal eerder in. Daarom slaat elke stap de blokken die geen
 * treffer zijn in hun geheel over, tot hun eigen sluitaccolade. Eerder ging dat
 * op inspringing -- een direct kind staat één tab dieper -- maar dan moest ook
 * het tellen van accolades kloppen, en dat deed het niet; zie `stukken`.
 *
 * Hoofdletters tellen niet mee, want bij Steam ook niet: die leest "Apps" en
 * "apps" als dezelfde sleutel. Zocht de app alleen op "apps", dan zag hij een
 * "Apps" over het hoofd en zette hij er een tweede naast.
 */
export function zoekBlok(tekst: string, pad: readonly string[]): Blokspan | undefined {
  const lijst = stukken(tekst)
  if (!lijst) return undefined

  let van = 0
  let tot = lijst.length
  let span: Blokspan | undefined
  for (const sleutel of pad) {
    const naam = sleutel.toLowerCase()
    let hit = -1
    for (let i = van; i < tot; i++) {
      const stuk = lijst[i]
      // Een sleutel met een blok erachter; een waarde heeft nooit een accolade na zich.
      const blok = stuk.soort === '"' ? lijst[i + 1] : stuk
      if (blok?.soort !== '{') continue
      if (blok !== stuk && tekst.slice(stuk.begin + 1, stuk.eind - 1).toLowerCase() === naam) {
        hit = i + 1
        break
      }
      // Het hele blok over, zodat alleen de directe kinderen meetellen.
      i = blok.paar
    }
    if (hit < 0) return undefined

    const open = lijst[hit]
    span = { open: open.begin, sluit: lijst[open.paar].begin }
    van = hit + 1
    tot = open.paar
  }
  return span
}

/** De inhoud van een blok, om er iets in op te zoeken. */
function inhoudVan(tekst: string, pad: readonly string[]): string | undefined {
  const span = zoekBlok(tekst, pad)
  return span ? tekst.slice(span.open, span.sluit + 1) : undefined
}

interface SteamVlaggen {
  algemeen?: boolean
  perSpel?: boolean
}

/**
 * De twee vlaggen van één account; `undefined` als het bestand niet in de vorm
 * staat die de app kan lezen (zie `stukken`).
 *
 * Een vlag die ontbreekt is geen "weet niet" maar Steams standaard, en die is
 * aan. Steam schrijft ze pas als iemand de schakelaar een keer omzet: in de
 * kopie die deze gebruiker op 13-09 van zijn bestand maakte, heeft `system`
 * geen EnableGameOverlay. Eerder sloeg `leesSteam` zo'n account over; bij wie
 * nooit aan de schakelaars had gezeten stond er dan "niet te lezen" en geen knop,
 * en bij twee accounts kon het samen "uit" worden terwijl hij bij dat ene in OMSI
 * gewoon verscheen.
 *
 * Hoofdletters tellen ook hier niet mee, om dezelfde reden als in `zoekBlok`.
 */
function leesSteamVlaggen(tekst: string): SteamVlaggen | undefined {
  if (!zoekBlok(tekst, PAD_WORTEL)) return undefined
  const alg = inhoudVan(tekst, PAD_ALGEMEEN)?.match(/"EnableGameOverlay"\s+"(\d)"/i)
  const spel = inhoudVan(tekst, PAD_PER_SPEL)?.match(/"OverlayAppEnable"\s+"(\d)"/i)
  return {
    algemeen: alg ? alg[1] === '1' : undefined,
    perSpel: spel ? spel[1] === '1' : undefined
  }
}

/**
 * Verschijnt de overlay in OMSI voor dit account?
 *
 * Alleen als beide vlaggen aan staan. Hier stond eerst "aan zodra één van de
 * twee aan staat", en dan las iemand die hem in Steam alleen voor OMSI had
 * uitgezet (algemeen 1, OMSI 0) "staat aan" -- met een knop ernaast die de
 * algemene uitzette. Een vlag die ontbreekt staat op wat Steam standaard doet,
 * en dat is aan.
 */
function zichtbaar(vlaggen: SteamVlaggen): boolean {
  return vlaggen.algemeen !== false && vlaggen.perSpel !== false
}

export function leesSteam(): KnopStand {
  const configs = steamConfigs()
  if (configs.length === 0) return {}

  /*
   * Aan als hij voor één account in OMSI verschijnt: welk account er straks
   * speelt weet de app niet (zie `steamConfigs`).
   */
  let aan = false
  let gezien = false
  let algemeenOveralUit = true
  for (const cfg of configs) {
    let vlaggen: SteamVlaggen | undefined
    try {
      vlaggen = leesSteamVlaggen(readFileSync(cfg, 'latin1'))
    } catch {
      // Een bestand dat niet te lezen is, zegt niets over de overlay.
      continue
    }
    /*
     * Alleen een bestand dat niet in Steams vorm staat valt af. Eén zonder
     * vlaggen telt mee, als aan; zie `leesSteamVlaggen`.
     */
    if (!vlaggen) continue
    gezien = true
    if (zichtbaar(vlaggen)) aan = true
    if (vlaggen.algemeen !== false) algemeenOveralUit = false
  }
  if (!gezien) return {}

  /*
   * Staat hij uit omdat Steam hem voor alle spellen uit heeft, dan helpt de
   * knop niet: die zet alleen de vlag van OMSI om. Dan hoort er te staan waar
   * het wel kan, in plaats van een knop die niets verandert.
   */
  return {
    aan,
    belet: !aan && algemeenOveralUit ? 'allespellen' : draait('steam.exe') ? 'steam' : undefined
  }
}

/**
 * Een vlag in het blok op dit pad zetten, of hem erbij zetten als hij ontbreekt.
 *
 * Staat de vlag er al, dan verandert alleen zijn cijfer; de rest van het bestand
 * blijft byte voor byte zoals het was. Ontbreekt de vlag, het blok, of een deel
 * van het pad ernaartoe, dan komt wat ontbreekt erbij, achteraan in het diepste
 * blok dat er al is.
 *
 * WAAROM DE BLOKKEN ERBIJ
 * Steam maakt `apps` / 252530 pas aan als iemand de schakelaar van OMSI in Steam
 * een keer heeft omgezet. In het bestand van deze gebruiker staan 140 spellen
 * met hun speeltijd, en is 252530 het enige blok onder `apps`. Zonder dat blok
 * gaf "uit" bij een gewone Steam `geenblok` en veranderde er niets, terwijl het
 * tabblad dezelfde knop bleef aanbieden.
 *
 * Wat erbij komt staat er zoals Steam het in dat bestand schrijft: sleutel en
 * accolades elk op een eigen regel, per niveau één tab, twee tabs tussen sleutel
 * en waarde, en het regeleinde van de rest van het bestand:
 *
 *     \t"apps"
 *     \t{
 *     \t\t"252530"
 *     \t\t{
 *     \t\t\t"OverlayAppEnable"\t\t"0"
 *     \t\t}
 *     \t}
 *
 * Achteraan, omdat Steam `apps` daar ook als laatste blok zette; verder leest
 * Steam het bestand op sleutel en niet op volgorde.
 *
 * WANNEER NIET
 * Dan blijft de tekst zoals hij was, en dat ziet `zetSteam` als `geenblok`:
 * - als `stukken` het bestand niet rond krijgt, of het buitenste blok er niet is;
 * - als niet elke regel met tabs en dan een sleutel of accolade begint. Wat erbij
 *   komt is met tabs ingesprongen, en tussen spaties hoort het niet;
 * - als de sluitaccolade van het blok waar het in komt niet alleen op zijn regel
 *   staat, met precies zoveel tabs als dat blok diep is. Hier werd eerst alleen
 *   gekeken of er vóór die accolade niets dan tabs stond, en toen het tellen van
 *   accolades nog misging (zie `stukken`) gold dat ook voor de sluitaccolade van
 *   friends, één tab diep, die toen voor die van UserLocalConfigStore doorging;
 *   die van UserLocalConfigStore heeft er geen. Staat hij waar Steam hem zet, dan
 *   klopt ook de rest; staat hij ergens anders, dan klopt er iets niet.
 */
export function zetVlag(
  tekst: string,
  pad: readonly string[],
  sleutel: string,
  aan: boolean
): string {
  const waarde = aan ? '1' : '0'

  const span = zoekBlok(tekst, pad)
  if (span) {
    const inhoud = tekst.slice(span.open, span.sluit + 1)
    // Zonder hoofdletters, om dezelfde reden als in `zoekBlok`: anders kwam er een tweede.
    const bestaand = new RegExp(`("${sleutel}"\\s+")\\d(")`, 'i')
    if (bestaand.test(inhoud)) {
      const nieuw = inhoud.replace(bestaand, `$1${waarde}$2`)
      return tekst.slice(0, span.open) + nieuw + tekst.slice(span.sluit + 1)
    }
  }

  // Elke regel begint met tabs en dan een sleutel of een accolade, zoals bij Steam.
  if (/^(?!\t*["{}]).+$/m.test(tekst)) return tekst

  // Het diepste blok van het pad dat er al is; `diepte` is hoeveel stappen dat zijn.
  let diepte = pad.length
  let ouder = span
  while (!ouder && diepte > 1) {
    diepte--
    ouder = zoekBlok(tekst, pad.slice(0, diepte))
  }
  if (!ouder) return tekst

  const tabs = (n: number): string => '\t'.repeat(n)

  // Vóór de regel met de sluitaccolade van dat blok: alleen, en met zijn eigen diepte.
  const regelBegin = tekst.lastIndexOf('\n', ouder.sluit) + 1
  const regelEind = tekst.indexOf('\n', ouder.sluit)
  const regel = tekst.slice(regelBegin, regelEind < 0 ? tekst.length : regelEind)
  if (regel.replace(/\r$/, '') !== `${tabs(diepte - 1)}}`) return tekst

  const nl = tekst.includes('\r\n') ? '\r\n' : '\n'
  const regels: string[] = []
  for (let i = diepte; i < pad.length; i++) regels.push(`${tabs(i)}"${pad[i]}"`, `${tabs(i)}{`)
  regels.push(`${tabs(pad.length)}"${sleutel}"\t\t"${waarde}"`)
  for (let i = pad.length - 1; i >= diepte; i--) regels.push(`${tabs(i)}}`)

  return tekst.slice(0, regelBegin) + regels.map((r) => r + nl).join('') + tekst.slice(regelBegin)
}

export interface Uitkomst {
  gelukt: boolean
  /** Waarom niet, als het niet lukte. */
  reden?: Reden
  /** Hoeveel bestanden of waarden er zijn aangepast. */
  aantal?: number
}

/**
 * De overlay van Steam in OMSI aan of uit, voor elk account op deze pc.
 *
 * Alleen de vlag van OMSI (`OverlayAppEnable` onder apps/252530) gaat om; de
 * algemene blijft van de gebruiker, want die geldt voor al zijn spellen. Staat
 * die uit, dan zegt "aan" dat met `allespellen` in plaats van hem om te zetten.
 *
 * Eerst alles lezen en uitrekenen, dan pas schrijven, en lukt een schrijfbeurt
 * niet, dan gaat wat al geschreven was terug. Zonder dat kwam een fout (een
 * bestand op alleen-lezen, een scanner die het vasthoudt) als onafgevangen
 * uitzondering bij het scherm, dat dan niets meldde -- terwijl bij twee
 * accounts het eerste al omgezet kon zijn en het tweede niet.
 */
export function zetSteam(aan: boolean): Uitkomst {
  if (draait('steam.exe')) return { gelukt: false, reden: 'steam' }
  const configs = steamConfigs()
  if (configs.length === 0) return { gelukt: false, reden: 'nietgevonden' }

  const teSchrijven: Array<{ cfg: string; oud: string; nieuw: string }> = []
  let geenBlok = false
  let gezien = false
  let ergensZichtbaar = false
  for (const cfg of configs) {
    let oud: string
    try {
      oud = readFileSync(cfg, 'latin1')
    } catch (fout) {
      logFout('Steam-instellingen lezen', fout)
      return { gelukt: false, reden: 'lezen' }
    }
    const vlaggen = leesSteamVlaggen(oud)
    /*
     * Niet te lezen, dan ook niet aan te passen -- ook niet bij aanzetten. Dat
     * meldde eerst "gelukt" terwijl dit account bleef staan zoals het stond.
     */
    if (!vlaggen) {
      geenBlok = true
      continue
    }
    let nieuw = oud
    /*
     * Aanzetten hoeft alleen waar hij uit staat; een ontbrekende vlag is al aan.
     * Uitzetten zet het blok van OMSI erbij als Steam het nog niet had; zie
     * `zetVlag`.
     */
    if (!aan || vlaggen.perSpel === false) {
      nieuw = zetVlag(oud, PAD_PER_SPEL, 'OverlayAppEnable', aan)
    }
    const na = leesSteamVlaggen(nieuw)
    if (!aan && (!na || zichtbaar(na))) {
      /*
       * Dan kon het blok er niet bij: het bestand staat niet in de vorm waarin
       * de app het veilig kan aanvullen (zie `zetVlag`). Aan de algemene vlag
       * komt de app niet, want die is niet van ons; de schakelaar in Steam kan
       * het wel. En wat `zetVlag` er dan toch van maakte gaat het bestand niet
       * in: leest de app zelf niet terug dat hij uit staat, dan is elke regel
       * die in Steams bestand verandert er één te veel.
       */
      geenBlok = true
      continue
    }
    if (na) {
      gezien = true
      if (zichtbaar(na)) ergensZichtbaar = true
    }
    if (nieuw !== oud) teSchrijven.push({ cfg, oud, nieuw })
  }

  let aantal = 0
  for (const wijziging of teSchrijven) {
    try {
      // Eerst een kopie; dit is niet ons bestand.
      bewaarKopie(wijziging.cfg)
      schrijfVeilig(wijziging.cfg, Buffer.from(wijziging.nieuw, 'latin1'))
      aantal++
    } catch (fout) {
      logFout('Steam-instellingen schrijven', fout)
      for (const eerder of teSchrijven.slice(0, aantal)) {
        try {
          schrijfVeilig(eerder.cfg, Buffer.from(eerder.oud, 'latin1'))
        } catch (terug) {
          // Dan staat de kopie er nog; zie `bewaarKopie`.
          logFout('Steam-instellingen terugzetten', terug)
        }
      }
      return { gelukt: false, reden: 'schrijven' }
    }
  }

  if (geenBlok) return { gelukt: false, reden: 'geenblok', aantal }
  if (aan && gezien && !ergensZichtbaar) return { gelukt: false, reden: 'allespellen', aantal }
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
  return { aan: gezien ? aan : undefined }
}

export function zetGameBar(aan: boolean): Uitkomst {
  let aantal = 0
  try {
    for (const { sleutel, naam } of GAMEBAR) {
      schrijfReg(sleutel, naam, aan ? 1 : 0)
      aantal++
    }
  } catch (oorzaak) {
    // "Command failed: reg add HKCU\..." is geen zin voor het scherm; wel voor het logboek.
    logFout('Game Bar in het register zetten', oorzaak)
    return { gelukt: false, reden: 'register' }
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
