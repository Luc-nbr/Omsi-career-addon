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
  /** Wat Windows zegt: reageert het venster nog op berichten? */
  reageert: boolean
  modules: string[]
}

function powershell32(): string {
  const windows = process.env.SystemRoot ?? 'C:\\Windows'
  return join(windows, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Het draaiende OMSI: of het reageert en welke modules het geladen heeft. */
export function leesOmsiProces(procesnaam = 'Omsi'): Promise<OmsiProces | undefined> {
  const opdracht =
    `$p = Get-Process -Name '${procesnaam.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
    `if ($p) { [pscustomobject]@{ pid = $p.Id; reageert = $p.Responding; ` +
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
          const gelezen = JSON.parse(uit) as { pid: number; reageert: boolean; modules?: string[] | string }
          const modules = Array.isArray(gelezen.modules)
            ? gelezen.modules
            : gelezen.modules
              ? [gelezen.modules]
              : []
          klaar({ pid: gelezen.pid, reageert: gelezen.reageert !== false, modules })
        } catch {
          klaar(undefined)
        }
      }
    )
  })
}

/**
 * OMSI afsluiten, op verzoek van de speler: een vastgelopen spel komt niet
 * meer uit zichzelf terug. De app doet dit nooit zonder dat de speler op de
 * knop drukt.
 */
export function sluitOmsi(pid: number): Promise<boolean> {
  return new Promise((klaar) => {
    execFile('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true }, (fout) => klaar(!fout))
  })
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
