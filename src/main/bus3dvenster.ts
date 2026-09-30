import { BrowserWindow, screen, type IpcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { Bus3dVensterPlek } from '../core/settings'
import type {
  Bus3dDoel,
  Bus3dKeuze,
  Bus3dKleurlijst,
  Bus3dOpenVraag,
  Bus3dStalen,
  Bus3dVensterInstellingen,
  Bus3dVensterMelding,
  Bus3dVensterStand,
  Bus3dVensterVraag
} from '../shared/bus3d'

/**
 * HET 3D-VENSTER (bus3d-ontwerp §8.1, §8.2, §9, §11.3)
 *
 * Eén eigen `BrowserWindow` met de pagina `bus3d.html` en de smalle preload
 * `bus3d`: de viewer plus een zijpaneel met de kleurstellingen. Hier staat
 * alles wat main met dat venster doet:
 *
 * - OPENEN: het hoofdvenster vraagt `bus3d:open`. Is er geen venster, dan komt
 *   er een; het blijft verborgen tot de pagina haar eerste plaatje toont
 *   (`bus3d:getoond`), hooguit 300 ms na `ready-to-show`. Is er al een, dan
 *   krijgt dat de nieuwe vraag (`bus3d:vraag`), komt het terug uit
 *   geminimaliseerd en krijgt het focus. Er is er altijd hooguit één: één
 *   WebGL-context en één GPU-budget naast OMSI, en één plek waar een keuze
 *   vandaan komt.
 * - HET VOLGNUMMER: elke vraag krijgt een `aanvraag`. Een keuze telt alleen als
 *   hij van dit venster komt (`event.sender`), het nieuwste volgnummer draagt,
 *   over de bus in het venster gaat en een kleurstelling noemt die in de lijst
 *   van die bus staat. Dan gaat `bus3d:keuze` naar het hoofdvenster, gaat het
 *   3D-venster dicht en krijgt het hoofdvenster focus. Of het hoofdvenster de
 *   busstap nog niet verlaten heeft, toetst het hoofdvenster zelf.
 * - SLUITEN is `destroy()`: het renderer-proces stopt, en daarmee de context en
 *   het GPU-geheugen. Geen verborgen hergebruik (§8.1). Vanzelf dicht na
 *   [Kiezen], als het hoofdvenster de busstap verlaat (`bus3d:sluit` met zijn
 *   laatste volgnummer), als de schakelaar uit gaat, en met het hoofdvenster
 *   (het is een kind).
 * - PAUZE EN LICHTE STAND (§9): verborgen of geminimaliseerd -- ook als het met
 *   het hoofdvenster mee minimaliseert -- is pauze; draait OMSI, dan de lichte
 *   stand, en pauze als geen van onze vensters 60 s focus had.
 * - PLEK EN MAAT worden onthouden (`bus3dVenster` in de instellingen) en bij het
 *   openen getoetst aan de schermen die er nu zijn.
 *
 * De IPC van de viewer zelf (model, lak, protocol) staat in main/bus3d.ts.
 */

export interface Bus3dVensterAfhankelijk {
  hoofd: () => BrowserWindow | null
  /** De schakelaar `bus3d` (tot F3 standaard uit). */
  aan: () => boolean
  preload: string
  pagina: { url?: string; bestand?: string }
  instellingen: () => Bus3dVensterInstellingen
  /** De achtergrond van het venster vóór de pagina er is: de themakleur, geen witte flits. */
  achtergrond: () => string
  leesPlek: () => Bus3dVensterPlek | undefined
  bewaarPlek: (plek: Bus3dVensterPlek) => void
  /** Draait OMSI? Een verse peiling (tasklist); hooguit eens per 20 s zolang het venster open is. */
  peilOmsi: () => Promise<boolean>
  /** Het heldenbeeld, anders de foto van de tegel, zonder te wachten en zonder te tekenen (§9). */
  fotoAlsKlaar: (relatiefPad: string, kleurstelling: string | undefined) => string | undefined
  kleurstellingen: (relatiefPad: string) => Promise<Bus3dKleurlijst | undefined>
  /** De stalen; `tussen` krijgt wat al klaar is terwijl de rest nog loopt. */
  kleurstalen: (relatiefPad: string, tussen: (stalen: Bus3dStalen) => void) => Promise<Bus3dStalen>
  log: (regel: string) => void
  /**
   * Maakt de Lakstudio nu een lak ("Lak maken … In OMSI zetten …")? Dan wacht
   * een wissel naar een andere bus tot het klaar is (lakstudio-ontwerp §4.1,
   * kritiek punt 15).
   */
  lakBezig?: () => boolean
  /** De bedrijfsnaam van het actieve profiel, voor de studio vanuit het wagenpark of de dealer. */
  bedrijfsnaam?: () => string | undefined
}

export interface Bus3dVenster {
  /** Het venster nu, als het er is. */
  venster(): BrowserWindow | undefined
  /** Dicht, zonder keuze (de schakelaar ging uit). */
  sluitAlles(reden: string): void
  /** Taal, thema of beweging veranderde in de instellingen. */
  instellingenGewijzigd(): void
  /** OMSI begon of stopte (de wacht in index.ts), zodat de lichte stand niet achterloopt. */
  omsiGewijzigd(draait: boolean): void
  /**
   * Komt dit bericht van de Lakstudio: het 3D-venster, nu in doel 'lakstudio'?
   * Het verborgen fotovenster laadt dezelfde brug, maar is een ander webContents
   * (lakstudio-ontwerp §8, kritiek punt 18).
   */
  vanStudio(e: IpcMainEvent | IpcMainInvokeEvent): boolean
  /** Komt dit bericht van het hoofdvenster (Addons)? */
  vanHoofd(e: IpcMainEvent | IpcMainInvokeEvent): boolean
  /** Een gebeurtenis naar het 3D-venster, als het er is. */
  stuur(kanaal: string, ...args: unknown[]): void
  /** De vraag waarmee het venster naar de studio wisselde (om na opslaan terug te gaan, §4.1). */
  vorigeVraag(): Bus3dVensterVraag | undefined
}

const BREEDTE = 1200
const HOOGTE = 760
const MIN_BREEDTE = 720
const MIN_HOOGTE = 480
/** Zonder focus op een van onze vensters terwijl OMSI draait: na zoveel ms pauze (§9). */
const ZONDER_FOCUS_MS = 60_000
/** Zolang het venster open is, hooguit zo vaak `tasklist` (een proces starten naast een spel hapert). */
const OMSI_PEILEN_MS = 20_000

export function maakBus3dVenster(ipcMain: IpcMain, af: Bus3dVensterAfhankelijk): Bus3dVenster {
  let win: BrowserWindow | undefined
  let huidig: Bus3dVensterVraag | undefined
  let volgnummer = 0
  /** De kleurstellingen die het venster kreeg, per bus: daartegen toetsen we een keuze zonder werker. */
  const kleurNamen = new Map<string, Set<string>>()
  let omsi = false
  let laatsteFocus = Date.now()
  let stand: Bus3dVensterStand = { pauze: false, licht: false }
  let klok: ReturnType<typeof setInterval> | undefined
  let laatstePeiling = 0
  let gecrashtGemeld = false
  /**
   * Is het venster al eens getoond? Daarvoor is "verborgen" geen pauze: het
   * wacht dan op zijn eerste plaatje. Anders kreeg de pagina bij het laden
   * "pauze" mee en miste ze het "geen pauze" dat een paar ms later kwam.
   */
  let alGetoond = false

  const hoofdWc = (): WebContents | undefined => {
    const h = af.hoofd()
    return h && !h.isDestroyed() ? h.webContents : undefined
  }
  const vanHoofd = (e: IpcMainEvent | IpcMainInvokeEvent): boolean => {
    const wc = hoofdWc()
    return Boolean(wc) && e.sender === wc
  }
  const vanVenster = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    Boolean(win && !win.isDestroyed() && e.sender === win.webContents)

  function meldHoofd(m: Bus3dVensterMelding): void {
    const wc = hoofdWc()
    if (wc && !wc.isDestroyed()) wc.send('bus3d:venster', m)
  }

  // ------------------------------------------------------------ plek en maat
  /** De bewaarde plek als die nog op een scherm valt (minstens 160x120 zichtbaar), anders het midden boven het hoofdvenster. */
  function plek(): { x: number; y: number; width: number; height: number; gemaximaliseerd: boolean } {
    const bewaard = af.leesPlek()
    if (bewaard) {
      const b = Math.max(MIN_BREEDTE, bewaard.breedte)
      const h = Math.max(MIN_HOOGTE, bewaard.hoogte)
      const zichtbaar = screen.getAllDisplays().some((d) => {
        const w = d.workArea
        const x0 = Math.max(w.x, bewaard.x)
        const y0 = Math.max(w.y, bewaard.y)
        const x1 = Math.min(w.x + w.width, bewaard.x + b)
        const y1 = Math.min(w.y + w.height, bewaard.y + h)
        return x1 - x0 >= 160 && y1 - y0 >= 120
      })
      if (zichtbaar) return { x: bewaard.x, y: bewaard.y, width: b, height: h, gemaximaliseerd: bewaard.gemaximaliseerd === true }
    }
    const hoofd = af.hoofd()
    const scherm = hoofd && !hoofd.isDestroyed() ? screen.getDisplayMatching(hoofd.getBounds()) : screen.getPrimaryDisplay()
    const w = scherm.workArea
    const width = Math.min(BREEDTE, w.width)
    const height = Math.min(HOOGTE, w.height)
    const midden = hoofd && !hoofd.isDestroyed() ? hoofd.getBounds() : w
    const x = Math.round(Math.min(Math.max(w.x, midden.x + (midden.width - width) / 2), w.x + w.width - width))
    const y = Math.round(Math.min(Math.max(w.y, midden.y + (midden.height - height) / 2), w.y + w.height - height))
    return { x, y, width, height, gemaximaliseerd: false }
  }

  function bewaar(): void {
    if (!win || win.isDestroyed()) return
    try {
      const b = win.getNormalBounds()
      af.bewaarPlek({ x: b.x, y: b.y, breedte: b.width, hoogte: b.height, gemaximaliseerd: win.isMaximized() || undefined })
    } catch (fout) {
      af.log(`bus3d venster: plek niet bewaard (${fout instanceof Error ? fout.message : String(fout)})`)
    }
  }

  // ------------------------------------------------------------ pauze en lichte stand (§9)
  function rekenStand(): void {
    if (!win || win.isDestroyed()) return
    const nu = Date.now()
    if (BrowserWindow.getFocusedWindow()) laatsteFocus = nu
    const verborgen = alGetoond && (!win.isVisible() || win.isMinimized())
    const zonderFocus = omsi && nu - laatsteFocus > ZONDER_FOCUS_MS
    const nieuw: Bus3dVensterStand = {
      pauze: verborgen || zonderFocus,
      licht: omsi,
      reden: verborgen ? 'verborgen' : zonderFocus ? 'omsi-zonder-focus' : undefined
    }
    if (nieuw.pauze !== stand.pauze || nieuw.licht !== stand.licht || nieuw.reden !== stand.reden) {
      stand = nieuw
      if (!win.webContents.isDestroyed()) win.webContents.send('bus3d:stand', stand)
      af.log(`bus3d venster: ${stand.pauze ? `pauze (${stand.reden})` : 'geen pauze'}${stand.licht ? ', lichte stand' : ''}`)
    }
  }

  async function peil(): Promise<void> {
    laatstePeiling = Date.now()
    try {
      omsi = await af.peilOmsi()
    } catch {
      // Dan blijft de vorige stand staan.
    }
    rekenStand()
  }

  function startKlok(): void {
    if (klok) return
    klok = setInterval(() => {
      if (Date.now() - laatstePeiling >= OMSI_PEILEN_MS) void peil()
      else rekenStand()
    }, 2000)
    klok.unref?.()
  }

  function stopKlok(): void {
    if (klok) clearInterval(klok)
    klok = undefined
  }

  // ------------------------------------------------------------ maken, openen, sluiten
  function maak(): BrowserWindow {
    const p = plek()
    const hoofd = af.hoofd()
    const w = new BrowserWindow({
      parent: hoofd && !hoofd.isDestroyed() ? hoofd : undefined,
      modal: false,
      show: false,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      minWidth: MIN_BREEDTE,
      minHeight: MIN_HOOGTE,
      autoHideMenuBar: true,
      backgroundColor: af.achtergrond(),
      title: '3D',
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: af.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        /*
         * Niet afknijpen: het venster tekent toch alleen bij een verandering,
         * en verborgen of geminimaliseerd pauzeert het zelf (§9). Afgeknepen
         * kwam het eerste beeld van een venster dat nog verborgen was pas na
         * een seconde.
         */
        backgroundThrottling: false
      }
    })
    if (p.gemaximaliseerd) w.maximize()
    let getoond = false
    alGetoond = false
    const toon = (): void => {
      if (getoond || w.isDestroyed()) return
      getoond = true
      w.show()
      if (win === w) alGetoond = true
      rekenStand()
    }
    w.once('ready-to-show', () => setTimeout(toon, 300))
    w.webContents.ipc.on('bus3d:getoond', () => toon())

    for (const gebeurtenis of ['minimize', 'restore', 'hide', 'show', 'focus', 'blur'] as const) {
      w.on(gebeurtenis as 'show', () => {
        if (gebeurtenis === 'focus') laatsteFocus = Date.now()
        rekenStand()
      })
    }
    w.on('close', () => bewaar())
    w.on('closed', () => {
      if (win !== w) return
      win = undefined
      huidig = undefined
      voorStudio = undefined
      stopKlok()
      meldHoofd({ open: false })
      af.log('bus3d venster: dicht')
    })
    w.webContents.on('render-process-gone', (_e, details) => {
      af.log(`bus3d venster: FOUT weg: ${details.reason} (exitcode ${details.exitCode})`)
      if (win !== w) return
      win = undefined
      huidig = undefined
      voorStudio = undefined
      stopKlok()
      // Eén melding per keer dat het misgaat; de volgende 3D-klik opent een nieuw venster.
      meldHoofd({ open: false, gecrasht: !gecrashtGemeld })
      gecrashtGemeld = true
      if (!w.isDestroyed()) w.destroy()
    })
    w.webContents.on('console-message', (_e, niveau, bericht, regel, bron) => {
      if (niveau >= 3) af.log(`bus3d venster: FOUT in de pagina: ${bericht} (${bron}:${regel})`)
    })
    // Geen nieuwe vensters en geen navigatie vanuit de pagina.
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    w.webContents.on('will-navigate', (e) => e.preventDefault())
    if (af.pagina.url) void w.loadURL(af.pagina.url)
    else if (af.pagina.bestand) void w.loadFile(af.pagina.bestand)
    return w
  }

  /** De vraag vóór de studio: na opslaan gaat het venster daarheen terug (§4.1). */
  let voorStudio: Bus3dVensterVraag | undefined
  /** Een wissel die wacht tot de studio klaar is met een lak maken (§4.1). */
  let uitgesteld: ReturnType<typeof setInterval> | undefined

  /** De Lakstudio-velden van een vraag, getoetst: geen paden, alleen een id, een start en een naam. */
  function lakVan(v: Bus3dOpenVraag): Bus3dVensterVraag['lak'] {
    const l = v.lak
    if (!l || typeof l !== 'object') return undefined
    const projectId = typeof l.projectId === 'string' && /^[0-9a-f]{16}$/.test(l.projectId) ? l.projectId : undefined
    const start = typeof l.start === 'string' && ['snel', 'effenKleuren', 'precies', 'effen'].includes(l.start) ? l.start : undefined
    const naam = typeof l.bedrijf?.naam === 'string' ? l.bedrijf.naam.slice(0, 80) : af.bedrijfsnaam?.()
    const kleuren = Array.isArray(l.bedrijf?.kleuren)
      ? l.bedrijf!.kleuren!.filter((k) => typeof k === 'string' && /^#[0-9a-f]{6}$/i.test(k)).slice(0, 3)
      : undefined
    return { projectId, start, bedrijf: naam ? { naam, kleuren } : undefined }
  }

  function open(vraag: Bus3dOpenVraag): number {
    // Maakt de studio net een lak, dan wacht de wissel (§4.1, kritiek punt 15).
    if (af.lakBezig?.() && win && !win.isDestroyed()) {
      const aanvraag = ++volgnummer
      if (uitgesteld) clearInterval(uitgesteld)
      uitgesteld = setInterval(() => {
        if (af.lakBezig?.()) return
        clearInterval(uitgesteld)
        uitgesteld = undefined
        openNu(vraag, aanvraag)
      }, 250)
      uitgesteld.unref?.()
      af.log('bus3d venster: de studio maakt een lak; de wissel wacht')
      return aanvraag
    }
    return openNu(vraag, ++volgnummer)
  }

  function openNu(vraag: Bus3dOpenVraag, aanvraag: number): number {
    const doel: Bus3dDoel =
      vraag.doel === 'dealer' || vraag.doel === 'wagenpark' || vraag.doel === 'lakstudio' ? vraag.doel : 'buskeuze'
    if (doel === 'lakstudio' && huidig && huidig.doel !== 'lakstudio') voorStudio = huidig
    if (doel !== 'lakstudio') voorStudio = undefined
    const kleurstelling = typeof vraag.kleurstelling === 'string' && vraag.kleurstelling ? vraag.kleurstelling : undefined
    const relatiefPad = String(vraag.relatiefPad ?? '')
    const nieuwVenster = !win || win.isDestroyed()
    if (nieuwVenster) {
      gecrashtGemeld = false
      laatsteFocus = Date.now()
      stand = { pauze: false, licht: omsi }
    }
    huidig = {
      aanvraag,
      doel,
      relatiefPad,
      kleurstelling,
      // null = Standaard is gekozen; niets = deze bus is niet de gekozen bus (geen vinkje).
      gekozen: vraag.gekozen === null ? null : typeof vraag.gekozen === 'string' ? vraag.gekozen : undefined,
      titel: String(vraag.titel ?? '').slice(0, 200),
      naam: Array.isArray(vraag.naam)
        ? ([0, 1, 2].map((i) => String(vraag.naam?.[i] ?? '').slice(0, 120)) as [string, string, string])
        : undefined,
      vorm: vraag.vorm === 'geleed' || vraag.vorm === 'dubbel' || vraag.vorm === 'midi' ? vraag.vorm : 'solo',
      vloot:
        vraag.vloot && typeof vraag.vloot.nummer === 'string'
          ? { nummer: vraag.vloot.nummer.slice(0, 20), kenteken: vraag.vloot.kenteken?.slice(0, 20) }
          : undefined,
      foto: af.fotoAlsKlaar(relatiefPad, kleurstelling),
      instellingen: af.instellingen(),
      stand,
      lak: doel === 'lakstudio' ? lakVan(vraag) : undefined
    }
    if (!nieuwVenster && win) {
      win.webContents.send('bus3d:vraag', huidig)
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      af.log(`bus3d venster: open ${doel} ${relatiefPad} (zelfde venster)`)
    } else {
      win = maak()
      startKlok()
      void peil()
      af.log(`bus3d venster: open ${doel} ${relatiefPad}`)
    }
    // In de studio staat het venster gemaximaliseerd (§4.1); alles wordt bewaard, dus een wissel kost niets.
    if (doel === 'lakstudio' && win && !win.isMaximized()) win.maximize()
    meldHoofd({ open: true, relatiefPad, kleurstelling, doel, aanvraag })
    return aanvraag
  }

  function sluit(reden: string): void {
    const w = win
    if (!w || w.isDestroyed()) return
    bewaar()
    af.log(`bus3d venster: sluiten (${reden})`)
    /*
     * destroy() en geen close(): het renderer-proces moet echt weg, met zijn
     * context (§8.1). Eerst de context in de pagina laten opgeven (loseContext)
     * hielp niet: het GPU-proces houdt daarna evengoed 20-180 MB videogeheugen
     * vast, vlak over 12 keer openen en sluiten (probe-bus3d-venster.cjs
     * --geheugen); dat is de cache van ANGLE en het stuurprogramma, geen lek.
     */
    w.destroy()
  }

  // ------------------------------------------------------------ IPC
  ipcMain.handle('bus3d:open', (e, vraag: unknown) => {
    if (!vanHoofd(e) || !af.aan() || !vraag || typeof vraag !== 'object') return 0
    const v = vraag as Bus3dOpenVraag
    if (!/\.bus$/i.test(String(v.relatiefPad ?? ''))) return 0
    return open(v)
  })
  /*
   * "+ Eigen lak" in het venster zelf (§4.1): wissel naar de studio met dezelfde
   * bus. Alleen van het 3D-venster, alleen met de schakelaar, en alleen voor de
   * bus die er nu in staat.
   */
  ipcMain.handle('bus3d:naarStudio', (e, lak: unknown) => {
    if (!vanVenster(e) || !af.aan() || !huidig) return 0
    return open({
      doel: 'lakstudio',
      relatiefPad: huidig.relatiefPad,
      kleurstelling: huidig.kleurstelling,
      gekozen: huidig.gekozen,
      titel: huidig.titel,
      naam: huidig.naam,
      vorm: huidig.vorm,
      vloot: huidig.vloot,
      lak: lak && typeof lak === 'object' ? (lak as Bus3dOpenVraag['lak']) : undefined
    })
  })
  /*
   * Na opslaan of klaarzetten in de studio (§4.1, §6): terug naar de
   * kleurstellingen waar de speler vandaan kwam (de buskeuze, de dealer of het
   * wagenpark), met de nieuwe lak in beeld. Kiezen blijft een eigen klik
   * ([Kiezen] of [Overspuiten]): bekijken is niet kiezen.
   */
  ipcMain.handle('bus3d:terugUitStudio', (e, naam: unknown) => {
    if (!vanVenster(e) || !af.aan() || !huidig || huidig.doel !== 'lakstudio') return 0
    // Alleen terug naar waar de studio vandaan kwam als dat dezelfde bus was; anders de lijst van deze bus.
    const terug = voorStudio && voorStudio.relatiefPad.toLowerCase() === huidig.relatiefPad.toLowerCase() ? voorStudio : huidig
    const kleurstelling = typeof naam === 'string' && naam ? naam.slice(0, 80) : terug.kleurstelling
    // De lijst van deze bus is veranderd: opnieuw lezen bij de volgende keuze.
    kleurNamen.delete(terug.relatiefPad.toLowerCase())
    return open({
      doel: terug.doel === 'lakstudio' ? 'buskeuze' : terug.doel,
      relatiefPad: terug.relatiefPad,
      kleurstelling,
      gekozen: terug.gekozen,
      titel: terug.titel,
      naam: terug.naam,
      vorm: terug.vorm,
      vloot: terug.vloot
    })
  })
  ipcMain.on('bus3d:sluit', (e, aanvraag: unknown) => {
    if (!vanHoofd(e) || !huidig) return
    // Alleen wat het hoofdvenster al had geopend: een nieuwere vraag blijft staan.
    const n = typeof aanvraag === 'number' ? aanvraag : Infinity
    if (huidig.aanvraag <= n) sluit('het doel hield op')
  })
  ipcMain.handle('bus3d:vraag', (e) => (vanVenster(e) && huidig ? { ...huidig, stand, instellingen: af.instellingen() } : undefined))
  ipcMain.on('bus3d:sluitVenster', (e) => {
    if (vanVenster(e)) sluit('zonder keuze')
  })
  ipcMain.handle('bus3d:kleurstellingen', async (e, relatiefPad: unknown) => {
    if (!vanVenster(e)) return undefined
    const pad = String(relatiefPad ?? '')
    if (!/\.bus$/i.test(pad)) return undefined
    const lijst = await af.kleurstellingen(pad)
    if (lijst) kleurNamen.set(pad.toLowerCase(), new Set(lijst.lijst.map((k) => k.naam)))
    return lijst
  })
  ipcMain.handle('bus3d:kleurstalen', async (e, relatiefPad: unknown) => {
    if (!vanVenster(e)) return {}
    const pad = String(relatiefPad ?? '')
    if (!/\.bus$/i.test(pad)) return {}
    const sender = e.sender
    return af.kleurstalen(pad, (stalen) => {
      if (!sender.isDestroyed()) sender.send('bus3d:stalen', pad, stalen)
    })
  })
  ipcMain.on('bus3d:kies', (e, keuze: unknown) => {
    const t0 = Date.now()
    if (!vanVenster(e)) {
      af.log('bus3d venster: keuze van een ander venster dan het 3D-venster; telt niet')
      return
    }
    if (!huidig || !keuze || typeof keuze !== 'object') return
    const k = keuze as Bus3dKeuze
    const pad = String(k.relatiefPad ?? '')
    const kleurstelling = typeof k.kleurstelling === 'string' && k.kleurstelling ? k.kleurstelling : undefined
    if (k.aanvraag !== huidig.aanvraag) {
      af.log(`bus3d venster: keuze met een oud volgnummer (${String(k.aanvraag)}, nu ${huidig.aanvraag}); telt niet`)
      return
    }
    if (pad.toLowerCase() !== huidig.relatiefPad.toLowerCase()) {
      af.log('bus3d venster: keuze voor een andere bus dan die in het venster; telt niet')
      return
    }
    const geldig = (namen: Set<string> | undefined): boolean => !kleurstelling || Boolean(namen?.has(kleurstelling))
    const vraag = huidig
    const geef = (): void => {
      if (huidig !== vraag) return
      const uit: Bus3dKeuze = { aanvraag: vraag.aanvraag, doel: vraag.doel, relatiefPad: vraag.relatiefPad, kleurstelling }
      hoofdWc()?.send('bus3d:keuze', uit)
      af.log(`bus3d venster: keuze ${uit.doel} ${uit.relatiefPad} ${kleurstelling ?? '(standaard)'} (${Date.now() - t0} ms in main)`)
      sluit('gekozen')
      const hoofd = af.hoofd()
      if (hoofd && !hoofd.isDestroyed()) hoofd.focus()
    }
    const weiger = (): void => af.log(`bus3d venster: kleurstelling "${kleurstelling}" staat niet in de lijst van de bus; telt niet`)
    const bekend = kleurNamen.get(pad.toLowerCase())
    // Een naam die er net bij kwam (een eigen lak uit de studio): eerst de lijst opnieuw, dan pas weigeren.
    if (bekend && kleurstelling && !bekend.has(kleurstelling)) kleurNamen.delete(pad.toLowerCase())
    if ((bekend && (!kleurstelling || bekend.has(kleurstelling))) || !kleurstelling) {
      if (geldig(bekend)) geef()
      else weiger()
      return
    }
    // Het venster vroeg de lijst (nog) niet: dan eerst de lijst.
    void af.kleurstellingen(pad).then((lijst) => {
      const namen = lijst ? new Set(lijst.lijst.map((x) => x.naam)) : undefined
      if (namen) kleurNamen.set(pad.toLowerCase(), namen)
      if (geldig(namen)) geef()
      else weiger()
    })
  })

  return {
    vanStudio: (e) => vanVenster(e) && huidig?.doel === 'lakstudio',
    vanHoofd,
    stuur: (kanaal, ...args) => {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(kanaal, ...args)
    },
    vorigeVraag: () => voorStudio,
    venster: () => (win && !win.isDestroyed() ? win : undefined),
    sluitAlles: (reden) => sluit(reden),
    instellingenGewijzigd: () => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('bus3d:instellingen', af.instellingen())
      win.setBackgroundColor(af.achtergrond())
    },
    omsiGewijzigd: (draait) => {
      if (omsi === draait) return
      omsi = draait
      laatstePeiling = Date.now()
      rekenStand()
    }
  }
}
