import { execFile } from 'node:child_process'
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Wat er in het draaiende OMSI zit, en of het nog leeft.
 *
 * WAAROM
 * OMSI 2 liep op Lucs pc herhaaldelijk vast op "Direct3D-Device lost!" in
 * logfile.txt, daarna reageerde Omsi.exe niet meer (13-09, 19-09, en 21-09 om
 * 17:49 en 17:58). In het hangende proces zaten telkens overlays die in de
 * DirectX 9-weergave haken: Steam (gameoverlayrenderer.dll), Discord
 * (DiscordHook.dll) en NVIDIA (nvspcap.dll). Discord en NVIDIA zijn in hun eigen
 * instellingen uit te zetten -- op 19-09 waren ze daarna echt weg. Steam niet:
 * Steam zet zijn bestand bij elke start terug, en OMSI heeft Steam-DRM. De app
 * kan dus niets uitzetten, maar wel zien wat erin zit en het zeggen.
 *
 * De modulelijst komt uit de 32-bits PowerShell: OMSI is een 32-bits programma,
 * en een 64-bits proces ziet daarvan alleen de WOW64-laag. Een scan kost
 * ongeveer anderhalve seconde (vooral het starten van PowerShell), dus de app
 * doet hem alleen als er reden voor is -- niet elke paar tellen.
 */

export type OverlaySoort =
  | 'steam'
  | 'discord'
  | 'nvidia'
  | 'rtss'
  | 'obs'
  | 'd3d9'
  | 'opentrack'

export interface OverlayInOmsi {
  soort: OverlaySoort
  /** Het bestand zoals het in het proces geladen is. */
  pad: string
}

/**
 * Welke module welke overlay is. Op bestandsnaam; de map zegt weinig, want
 * Discord zet de zijne in een map met een versienummer erin.
 */
const HERKENNING: Array<{ soort: OverlaySoort; naam: RegExp }> = [
  { soort: 'steam', naam: /^gameoverlayrenderer\.dll$/i },
  { soort: 'discord', naam: /^discordhook\.dll$/i },
  { soort: 'nvidia', naam: /^nvspcap\.dll$/i },
  { soort: 'rtss', naam: /^rtsshooks\.dll$/i },
  { soort: 'obs', naam: /^graphics-hook32\.dll$/i },
  // opentrack/TrackIR: geen overlay, maar hij haakt ook in; Luc wil hem houden.
  { soort: 'opentrack', naam: /^npclient\.dll$/i }
]

/** De overlays in een modulelijst. `d3d9.dll` telt alleen als hij uit de OMSI-map komt. */
export function herkenOverlays(modules: string[], omsiPad: string): OverlayInOmsi[] {
  const uit: OverlayInOmsi[] = []
  for (const pad of modules) {
    const naam = basename(pad)
    const raak = HERKENNING.find((item) => item.naam.test(naam))
    if (raak) {
      if (!uit.some((item) => item.soort === raak.soort)) uit.push({ soort: raak.soort, pad })
      continue
    }
    /*
     * Een d3d9.dll naast Omsi.exe vervangt de DirectX 9 van Windows: een
     * wrapper of grafische mod. Op Lucs pc staat er een van 62464 bytes uit
     * 2013. Geen overlay, maar wel iets tussen OMSI en de videokaart.
     */
    if (/^d3d9\.dll$/i.test(naam) && dirname(pad).toLowerCase() === omsiPad.toLowerCase()) {
      uit.push({ soort: 'd3d9', pad })
    }
  }
  return uit
}

export interface OmsiProces {
  pid: number
  /**
   * Wanneer het proces startte, zoals Windows het zegt (ISO, UTC). Met het pid
   * samen is dat wie het is: een pid wordt na afloop hergebruikt, een starttijd
   * niet. Leeg als Windows het niet wilde zeggen.
   */
  start?: string
  /** Wat Windows zegt: reageert het venster nog op berichten? */
  reageert: boolean
  modules: string[]
}

function powershell32(): string {
  const windows = process.env.SystemRoot ?? 'C:\\Windows'
  return join(windows, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/*
 * De starttijd als tekst met zeven decimalen, zodat twee keer lezen precies
 * hetzelfde oplevert. `StartTime` lezen mag zonder beheerder voor processen van
 * de eigen gebruiker -- en OMSI draait als de speler zelf.
 */
const START = `$s = $null; try { $s = $p.StartTime.ToUniversalTime().ToString('o') } catch { }`

/** Het draaiende OMSI: of het reageert en welke modules het geladen heeft. */
export function leesOmsiProces(procesnaam = 'Omsi'): Promise<OmsiProces | undefined> {
  const opdracht =
    `$p = Get-Process -Name '${procesnaam.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
    `if ($p) { ${START}; [pscustomobject]@{ pid = $p.Id; start = $s; reageert = $p.Responding; ` +
    `modules = @($p.Modules | ForEach-Object { $_.FileName }) } | ConvertTo-Json -Compress }`
  return new Promise((klaar) => {
    execFile(
      powershell32(),
      ['-NoProfile', '-NonInteractive', '-Command', opdracht],
      { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (fout, uit) => {
        if (fout || !uit.trim()) {
          klaar(undefined)
          return
        }
        try {
          const gelezen = JSON.parse(uit) as {
            pid: number
            start?: string | null
            reageert: boolean
            modules?: string[] | string
          }
          const modules = Array.isArray(gelezen.modules)
            ? gelezen.modules
            : gelezen.modules
              ? [gelezen.modules]
              : []
          klaar({
            pid: gelezen.pid,
            start: gelezen.start || undefined,
            reageert: gelezen.reageert !== false,
            modules
          })
        } catch {
          klaar(undefined)
        }
      }
    )
  })
}

/** Wie er nu achter een pid zit: de naam zonder `.exe` en de starttijd. */
export function procesMetPid(pid: number): Promise<{ naam: string; start?: string } | undefined> {
  const opdracht =
    `$p = Get-Process -Id ${Math.trunc(pid)} -ErrorAction SilentlyContinue; ` +
    `if ($p) { ${START}; [pscustomobject]@{ naam = $p.ProcessName; start = $s } | ConvertTo-Json -Compress }`
  return new Promise((klaar) => {
    execFile(
      powershell32(),
      ['-NoProfile', '-NonInteractive', '-Command', opdracht],
      { windowsHide: true, timeout: 15000 },
      (fout, uit) => {
        if (fout || !uit.trim()) {
          klaar(undefined)
          return
        }
        try {
          const gelezen = JSON.parse(uit) as { naam: string; start?: string | null }
          klaar({ naam: gelezen.naam, start: gelezen.start || undefined })
        } catch {
          klaar(undefined)
        }
      }
    )
  })
}

/**
 * Hoe het afsluiten afliep. `al-dicht`: er draait onder dat pid geen OMSI meer
 * -- het is uit zichzelf gestopt, of het pid is intussen van een ander
 * programma, en dan is er niets afgesloten.
 */
export type Afsluiten = 'gesloten' | 'al-dicht' | 'mislukt'

/**
 * OMSI afsluiten, op verzoek van de speler: een vastgelopen spel komt niet
 * meer uit zichzelf terug. De app doet dit nooit zonder dat de speler op de
 * knop drukt.
 *
 * WAAROM ZO VOORZICHTIG
 * Het pid komt uit de melding over de vastloper, en tussen die melding en de
 * klik kan een tijd zitten. Is OMSI intussen weg, dan geeft Windows dat pid aan
 * het volgende programma dat start -- en `taskkill /PID` schoot dan dát af,
 * wat het ook was. Nu eerst: draait onder dit pid nog een proces met deze
 * naam en deze starttijd (zie `leesOmsiProces`)? En daarna laat taskkill het
 * zelf nog eens nakijken met een filter op de naam, zodat ook in het laatste
 * ogenblik niets anders geraakt kan worden. (Idee uit openOMSI: een proces is
 * pid plus starttijd.)
 */
export async function sluitOmsi(pid: number, start: string | undefined, procesnaam = 'Omsi'): Promise<Afsluiten> {
  const nu = await procesMetPid(pid)
  if (!nu || nu.naam.toLowerCase() !== procesnaam.toLowerCase()) return 'al-dicht'
  /*
   * Een ander OMSI onder hetzelfde pid heeft een andere starttijd. Kon Windows
   * die toen en nu allebei niet geven (OMSI als beheerder gestart), dan blijft
   * alleen het filter op pid en naam over -- en dan lukt afsluiten zonder
   * beheerder toch niet, en zegt de knop dat.
   */
  if (nu.start !== start) return 'al-dicht'
  await new Promise<void>((klaar) => {
    execFile(
      'taskkill',
      ['/F', '/FI', `PID eq ${Math.trunc(pid)}`, '/FI', `IMAGENAME eq ${procesnaam}.exe`],
      { windowsHide: true },
      () => klaar()
    )
  })
  /*
   * Niet op de tekst van taskkill afgaan: die is vertaald ("GESLAAGD" op een
   * Nederlandse Windows), en met filters slaagt hij ook als er niets paste.
   * Gewoon kijken of het er nog is; afsluiten duurt soms een tel.
   */
  for (let poging = 0; poging < 10; poging++) {
    const daarna = await procesMetPid(pid)
    if (!daarna || daarna.start !== start) return 'gesloten'
    await new Promise((klaar) => setTimeout(klaar, 300))
  }
  return 'mislukt'
}

export interface LogfileStaart {
  /** Is het laatste over Direct3D "Device lost!", zonder dat het daarna hersteld is? */
  apparaatWeg: boolean
  /** Staat "OMSI is closing..." achteraan: netjes afgesloten. */
  netjesDicht: boolean
  /** Is er een kaart geladen ("... map loaded!")? */
  kaartGeladen: boolean
  /** De tijd uit de laatste regel van het logboek, zoals OMSI hem schrijft. */
  laatsteTijd?: string
  /** Wanneer het bestand voor het laatst geschreven is, in milliseconden. */
  gewijzigd: number
}

/** De laatste 24 kB van OMSI's logfile.txt, gelezen zonder het hele bestand. */
export function leesLogfileStaart(omsiPad: string): LogfileStaart | undefined {
  const pad = join(omsiPad, 'logfile.txt')
  let tekst: string
  let gewijzigd: number
  try {
    const info = statSync(pad)
    gewijzigd = info.mtimeMs
    const grootte = info.size
    const lengte = Math.min(grootte, 24 * 1024)
    const buffer = Buffer.alloc(lengte)
    const bestand = openSync(pad, 'r')
    try {
      readSync(bestand, buffer, 0, lengte, grootte - lengte)
    } finally {
      closeSync(bestand)
    }
    tekst = buffer.toString('latin1')
  } catch {
    return undefined
  }
  const regels = tekst.split(/\r?\n/).filter((regel) => regel.trim())
  let apparaatWeg = false
  for (const regel of regels) {
    if (/Direct3D-Device lost!/i.test(regel)) apparaatWeg = true
    else if (/Direct3D-Device resetted!/i.test(regel)) apparaatWeg = false
  }
  const staart = regels.slice(-4).join('\n')
  const tijd = /\d{2}:\d{2}:\d{2}/.exec(regels.at(-1) ?? '')?.[0]
  return {
    apparaatWeg,
    netjesDicht: /OMSI is closing/i.test(staart),
    kaartGeladen: regels.some((regel) => /map loaded!/i.test(regel)),
    laatsteTijd: tijd,
    gewijzigd
  }
}
