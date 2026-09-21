import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { BrowserWindow, ipcMain, nativeImage } from 'electron'
import { verkleinTextuur, type BusTekeningMetPlaten } from '../core/busbeeld'
import { trailerOf } from '../core/trailer'
import { log, logFout } from '../core/logboek'
import { type Textuur } from '../core/textuur'

/**
 * Een foto van een bus maken, in een venster dat niemand ziet.
 *
 * WAAROM ZO
 * Tekenen vraagt een tekenkaart, en die zit in Electron aan een venster. Dus
 * staat hier een verborgen venster dat één ding doet: een tekening ontvangen en
 * er een PNG van maken. Het hoofdproces leest de modellen (dat is gewoon
 * bestandswerk) en bewaart het plaatje daarna op schijf, want het is duur: het
 * uitlezen van de honderden onderdelen van één bus kostte gemeten 266 tot 1092
 * ms, en een bus levert 19.000 tot 419.000 driehoeken.
 *
 * Eén venster voor alle bussen, en één tekening tegelijk. Het gaat om schijf en
 * geheugen, niet om rekenkracht: twee bussen tegelijk tekenen maakt het voor
 * niemand sneller, en een tweede venster kost nog eens een tekenkaartcontext.
 */

/**
 * Welke versie van de tekenaar deze foto's gemaakt heeft.
 *
 * WAAROM
 * Een foto wordt eenmaal gemaakt en daarna van schijf gehaald -- en dat was
 * precies het probleem. Toen de tekenaar gerepareerd was, bleven de oude,
 * verminkte plaatjes gewoon staan: Luc zag zijn MAN NG272 nog steeds als een
 * waaier van driehoeken, terwijl die bus nu helemaal geen foto hoort te krijgen
 * (hij is volledig versleuteld). "Niks veranderd", terecht.
 *
 * Dus hangen de foto's in een map met dit nummer erin. Verandert er iets aan
 * hoe een bus getekend wordt, dan gaat dit nummer omhoog en worden alle foto's
 * opnieuw gemaakt; de oude mappen ruimt `ruimOudeFotosOp` op.
 */
const FOTO_VORM = 3

/** Waar de foto's komen te staan, per versie van de tekenaar. */
export function busfotoMap(userData: string): string {
  return join(userData, 'busfotos', `v${FOTO_VORM}`)
}

/**
 * De foto's van een oudere tekenaar weghalen.
 *
 * Alleen wat de app zelf in `busfotos` heeft gezet, en nooit de huidige versie.
 * Lukt het niet -- een bestand dat vastzit -- dan is dat geen fout: het kost
 * alleen ruimte, en de volgende start probeert het opnieuw.
 */
export function ruimOudeFotosOp(userData: string): void {
  const wortel = join(userData, 'busfotos')
  let inhoud: string[]
  try {
    inhoud = readdirSync(wortel)
  } catch {
    return
  }
  for (const naam of inhoud) {
    if (naam === `v${FOTO_VORM}`) continue
    try {
      rmSync(join(wortel, naam), { recursive: true, force: true })
      log(`busfoto's van een oudere tekenaar weggehaald: ${naam}`)
    } catch {
      // Volgende keer weer.
    }
  }
}

/**
 * De naam van de foto van deze bus; het pad bepaalt hem, zodat hij terug te
 * vinden is. Een kleurstelling hoort erbij: dezelfde bus in de kleuren van OVPS
 * is een andere foto dan in die van de BVG. Zonder kleurstelling blijft de naam
 * wat hij was, zodat de foto's die er al staan gewoon blijven gelden.
 */
function bestandsnaam(relatiefPad: string, kleurstelling?: string): string {
  const sleutel = kleurstelling
    ? `${relatiefPad.toLowerCase()}|${kleurstelling}`
    : relatiefPad.toLowerCase()
  return `${createHash('sha1').update(sleutel).digest('hex').slice(0, 16)}.png`
}

/**
 * Het merkteken van een bus die geen foto kan krijgen.
 *
 * WAAROM
 * Van de 341 bussen hier zijn er 28 zo versleuteld dat er niets van te tekenen
 * valt, en een paar hebben geen model dat we kunnen lezen. Zonder merkteken
 * ging het bijwerken die elke keer opnieuw langs -- elk een halve seconde
 * lezen voor hetzelfde "nee" -- en bleef de teller op "28 te gaan" staan, ook
 * als er niets nieuws was. Een leeg bestand naast de foto's zegt: al geprobeerd.
 *
 * Alleen voor een bus waarvan vaststaat dat het niet gaat. Liep er iets mis in
 * de werker of in het venster, dan komt er geen merkteken: dat kan de volgende
 * keer best lukken.
 */
function merktekenVan(map: string, relatiefPad: string, kleurstelling?: string): string {
  return join(map, bestandsnaam(relatiefPad, kleurstelling).replace(/\.png$/, '.geen'))
}

/** Heeft deze bus al een foto, of staat vast dat hij er geen krijgt? */
export function busfotoAfgehandeld(
  userData: string,
  relatiefPad: string,
  kleurstelling?: string
): 'foto' | 'geen' | undefined {
  const map = busfotoMap(userData)
  if (existsSync(join(map, bestandsnaam(relatiefPad, kleurstelling)))) return 'foto'
  if (existsSync(merktekenVan(map, relatiefPad, kleurstelling))) return 'geen'
  return undefined
}

/** Het adres waaronder het scherm de foto van deze bus opvraagt. */
export function busfotoAdres(bestand: string): string {
  return `omsibus://foto/${basename(bestand)}`
}

let venster: BrowserWindow | undefined
let bezig: Promise<unknown> = Promise.resolve()

/**
 * De uitgepakte texturen, over bussen heen.
 *
 * De uitvoeringen van één model delen bijna al hun texturen -- dat is juist wat
 * een uitvoering is -- en uitpakken kost tijd: de eerste bus van een model deed
 * er 1593 ms over, de tweede 8213 omdat alles opnieuw door de decoder ging.
 * Hier blijft het antwoord staan zolang de app draait. Ze zijn al verkleind tot
 * hooguit 512 in de lengte, dus een bus van veertig texturen kost hooguit een
 * paar tientallen megabytes.
 */
const platenGeheugen = new Map<string, { breedte: number; hoogte: number; pixels: Uint8Array } | { bron: string } | null>()

function maakVenster(preload: string, pagina: { url?: string; bestand?: string }): BrowserWindow {
  if (venster && !venster.isDestroyed()) return venster
  venster = new BrowserWindow({
    width: 640,
    height: 480,
    show: false,
    /*
     * `paintWhenInitiallyHidden` moet aan: een venster dat nooit getoond wordt
     * tekent anders niets, en dan komt er een leeg beeld terug.
     */
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload,
      sandbox: false,
      offscreen: false,
      /*
       * Niet afknijpen. Een venster dat niet in beeld staat zet Chromium op een
       * laag pitje, en dan wacht elke opdracht aan de tekenkaart op een beeld
       * dat nooit komt: het klaarzetten van de texturen sprong van 154 ms bij
       * de eerste bus naar 7300 ms bij elke volgende. Met dit uit blijft het
       * venster volle snelheid draaien, ook onzichtbaar.
       */
      backgroundThrottling: false
    }
  })
  venster.on('closed', () => {
    venster = undefined
  })
  if (pagina.url) void venster.loadURL(pagina.url)
  else if (pagina.bestand) void venster.loadFile(pagina.bestand)
  return venster
}

interface FotoOpdracht {
  /** Het zware leeswerk; hoort in de werker te gebeuren, niet hier. */
  tekenen(busPad: string, kleurstelling?: string): Promise<BusTekeningMetPlaten | undefined>
  /** De naam van de kleurstelling, zoals in OMSI's "Appearance"; leeg is standaard. */
  kleurstelling?: string
  /** De OMSI-map, om de aanhanger van een gelede bus te vinden. */
  omsiPad: string
  /** Volledig pad naar het .bus-bestand. */
  busPad: string
  /** Pad vanaf de OMSI-map; bepaalt de naam van het plaatje. */
  relatiefPad: string
  userData: string
  preload: string
  pagina: { url?: string; bestand?: string }
  breedte?: number
  hoogte?: number
}

/**
 * De foto van één bus. Staat hij er al, dan komt hij van schijf.
 *
 * Geeft het pad naar het plaatje terug, of `undefined` als het niet lukte. Het
 * mislukken van een plaatje mag nooit een scherm ophouden: de tegel valt dan
 * terug op het icoon, zoals een kaart zonder `picture.jpg` op zijn monogram.
 */
export function maakBusfoto(opdracht: FotoOpdracht): Promise<string | undefined> {
  const map = busfotoMap(opdracht.userData)
  const doel = join(map, bestandsnaam(opdracht.relatiefPad, opdracht.kleurstelling))
  if (existsSync(doel)) return Promise.resolve(doel)
  if (existsSync(merktekenVan(map, opdracht.relatiefPad, opdracht.kleurstelling))) {
    return Promise.resolve(undefined)
  }

  /* In de rij: één tekening tegelijk; zie de uitleg bovenaan. */
  const beurt = bezig.then(() => tekenEen(opdracht, map, doel))
  bezig = beurt.catch(() => undefined)
  return beurt
}

async function tekenEen(
  opdracht: FotoOpdracht,
  map: string,
  doel: string
): Promise<string | undefined> {
  const begin = Date.now()
  /*
   * Met de kleurstelling erbij. Zonder die naam stond dezelfde MAN_12C_3door_Voith
   * zeventien keer achter elkaar in het logboek -- zeventien kleurstellingen,
   * maar het las als een app die steeds dezelfde foto overdeed.
   */
  const wat = opdracht.kleurstelling
    ? `${opdracht.relatiefPad} in "${opdracht.kleurstelling}"`
    : opdracht.relatiefPad
  /*
   * Het lezen gaat naar de werker. Het kost 283 tot 1376 ms per bus, en het
   * hoofdproces doet één ding tegelijk: zolang het hier leest, beweegt er geen
   * knop en geen overlay. Zie `kaartwerker.ts`.
   */
  let tekening: BusTekeningMetPlaten | undefined
  try {
    tekening = await opdracht.tekenen(opdracht.busPad, opdracht.kleurstelling)
  } catch (fout) {
    // Geen merkteken: dit is pech, geen eigenschap van de bus.
    logFout(`busfoto ${wat} lezen`, fout)
    return undefined
  }
  if (!tekening) {
    log(`busfoto: geen model voor ${wat}`)
    try {
      mkdirSync(map, { recursive: true })
      writeFileSync(merktekenVan(map, opdracht.relatiefPad, opdracht.kleurstelling), '')
    } catch {
      // Dan probeert de volgende ronde het nog eens; meer kost het niet.
    }
    return undefined
  }

  /*
   * Een gelede bus is in OMSI twee voertuigen.
   *
   * De voorwagen noemt in `[couple_back]` het bestand van de aanhanger, en de
   * twee koppelpunten samen geven de afstand -- nagemeten aan OMSI's eigen
   * situatiebestand: een MAN GN92 komt op 4,331 + 4,169 = 8,5 meter uit tegen
   * 8,49 in dat bestand. Zonder dit stuk houdt de foto op bij de harmonica, en
   * dat is precies de bus waar iemand naar kijkt als hij een gelede kiest.
   */
  const aanhanger = trailerOf(opdracht.omsiPad, opdracht.relatiefPad)
  if (aanhanger) {
    // In dezelfde kleurstelling; kent de aanhanger die naam niet, dan in zijn eigen kleuren.
    const achterop = await opdracht.tekenen(
      join(opdracht.omsiPad, aanhanger.relativePath),
      opdracht.kleurstelling
    )
    if (achterop) {
      for (const stuk of achterop.stukken) {
        const verzet = new Float32Array(stuk.posities)
        for (let i = 2; i < verzet.length; i += 3) verzet[i] -= aanhanger.distance
        tekening.stukken.push({ ...stuk, posities: verzet })
      }
      for (const paar of achterop.platen) tekening.platen.push(paar)
      tekening.doos.min[2] -= aanhanger.distance
      tekening.driehoeken += achterop.driehoeken
    }
  }
  const gelezen = Date.now() - begin

  return new Promise<string | undefined>((klaar) => {
    const paneel = maakVenster(opdracht.preload, opdracht.pagina)
    let afgerond = false
    const stop = (uitkomst: string | undefined): void => {
      if (afgerond) return
      afgerond = true
      ipcMain.removeListener('busfoto:klaar', opPng)
      ipcMain.removeListener('busfoto:mislukt', opFout)
      clearTimeout(wekker)
      klaar(uitkomst)
    }

    const opPng = (_gebeurtenis: unknown, png: string, tijden?: Record<string, number>): void => {
      try {
        mkdirSync(map, { recursive: true })
        const data = png.replace(/^data:image\/png;base64,/, '')
        writeFileSync(doel, Buffer.from(data, 'base64'))
        log(
          `busfoto ${wat}: ${tekening.driehoeken} driehoeken, ` +
            `${tekening.stukken.length} stukken, ${platen.length} platen, ` +
            `${gelezen} ms lezen, ${klaarzetten} ms klaarzetten, ${Date.now() - begin} ms in totaal` +
            (tijden
              ? ` (venster: platen ${tijden.platen}, alles ${tijden.buffers}, tekenen ${tijden.tekenen}, png ${tijden.png})`
              : '')
        )
        stop(doel)
      } catch (fout) {
        logFout('busfoto bewaren', fout)
        stop(undefined)
      }
    }
    const opFout = (_gebeurtenis: unknown, reden: string): void => {
      log(`busfoto ${wat} mislukt: ${reden}`)
      stop(undefined)
    }

    ipcMain.on('busfoto:klaar', opPng)
    ipcMain.on('busfoto:mislukt', opFout)
    /*
     * Een tekening die nooit terugkomt mag niet de hele rij ophouden. Twintig
     * seconden is ruim: de zwaarste bus hier kostte 1,1 seconde aan inlezen en
     * de tekening zelf een fractie daarvan.
     */
    const wekker = setTimeout(() => {
      log(`busfoto ${wat}: geen antwoord binnen twintig seconden`)
      stop(undefined)
    }, 20000)

    /*
     * De texturen erbij, elk hooguit één keer.
     *
     * Twee soorten. Wat `.dds` of `.tga` is pakken we hier zelf uit -- een
     * browser kent die formaten niet, en samen zijn ze het leeuwendeel van wat
     * OMSI gebruikt. De rest (`.bmp`, `.png`, `.jpg`) gaat als bytes mee en
     * laat Chromium het doen; dat kan hij beter dan wij.
     *
     * En ze gaan verkleind mee. De grootste textuur in deze installatie is
     * 8192 bij 2048 en dat is 64 MB aan pixels; voor een plaatje van 512 bij
     * 384 is 512 in de lengte ruim genoeg, en het scheelt zestien keer zoveel
     * kopieerwerk door de IPC.
     */
    const platen: Array<{ breedte: number; hoogte: number; pixels: Uint8Array } | { bron: string }> = []
    const perPad = new Map<string, number>()
    /* Wat de werker al uitpakte: .dds en .tga. De rest doen we hier. */
    const vanDeWerker = new Map(
      tekening.platen.filter((paar): paar is [string, { breedte: number; hoogte: number; pixels: Uint8Array }] => paar[1] !== null)
    )
    const nummerVoor = (pad: string | undefined): number => {
      if (!pad) return -1
      const bekend = perPad.get(pad)
      if (bekend !== undefined) return bekend

      const onthouden = platenGeheugen.get(pad)
      if (onthouden !== undefined) {
        if (onthouden === null) {
          perPad.set(pad, -1)
          return -1
        }
        const nummer = platen.push(onthouden) - 1
        perPad.set(pad, nummer)
        return nummer
      }

      let plaat: { breedte: number; hoogte: number; pixels: Uint8Array } | { bron: string } | undefined
      const uitDeWerker = vanDeWerker.get(pad)
      if (uitDeWerker) plaat = uitDeWerker
      const soort = extname(pad).toLowerCase()
      if (plaat) {
        // al uitgepakt in de werker
      } else if (soort === '.bmp' || soort === '.png' || soort === '.jpg' || soort === '.jpeg') {
        /*
         * Deze drie kent Electron zelf. Eerst gingen ze als gegevens-URL naar
         * het venster, dat er een <img> van maakte -- en daar stond de tijd:
         * het klaarzetten van de platen sprong van 154 ms naar 7300 ms zodra er
         * zulke platen bij zaten. Hier uitpakken kost een fractie daarvan, en
         * het venster hoeft alleen nog pixels te uploaden.
         */
        plaat = viaElectron(pad)
      }
      platenGeheugen.set(pad, plaat ?? null)
      if (!plaat) {
        perPad.set(pad, -1)
        return -1
      }
      const nummer = platen.push(plaat) - 1
      perPad.set(pad, nummer)
      return nummer
    }

    const stukken = tekening.stukken.map((stuk) => ({
      posities: stuk.posities,
      normalen: stuk.normalen,
      uvs: stuk.uvs,
      indices: stuk.indices,
      plaat: nummerVoor(stuk.textuur)
    }))

    const klaarzetten = Date.now() - begin - gelezen
    const stuur = (): void =>
      paneel.webContents.send('busfoto:teken', {
        stukken,
        platen,
        doos: tekening.doos,
        breedte: opdracht.breedte ?? 512,
        hoogte: opdracht.hoogte ?? 384
      })

    if (paneel.webContents.isLoading()) paneel.webContents.once('did-finish-load', stuur)
    else stuur()
  })
}

/**
 * Een .bmp, .png of .jpg uitpakken met wat Electron al meebrengt.
 *
 * `getBitmap()` geeft de pixels in de volgorde blauw, groen, rood, alfa; WebGL
 * wil rood, groen, blauw, alfa. Dat omdraaien kost een doorloop en is de enige
 * reden dat deze functie meer is dan twee regels.
 */
function viaElectron(pad: string): { breedte: number; hoogte: number; pixels: Uint8Array } | undefined {
  try {
    const beeld = nativeImage.createFromPath(pad)
    if (beeld.isEmpty()) return undefined
    const maat = beeld.getSize()
    const bgra = beeld.getBitmap()
    const pixels = new Uint8Array(bgra.length)
    for (let i = 0; i < bgra.length; i += 4) {
      pixels[i] = bgra[i + 2]
      pixels[i + 1] = bgra[i + 1]
      pixels[i + 2] = bgra[i]
      pixels[i + 3] = bgra[i + 3]
    }
    return verklein({ breedte: maat.width, hoogte: maat.height, pixels }, 512)
  } catch {
    return undefined
  }
}

/**
 * Een textuur terugbrengen tot hooguit `grens` in de langste richting.
 *
 * Grof bemonsterd en niet gemiddeld: het gaat om een plaatje van 512 bij 384,
 * en een bus die je van vier meter afstand ziet heeft aan een scherpe textuur
 * niets. Wel scheelt het fors: de zwaarste textuur hier is 8192 bij 2048, en
 * dat is 64 MB aan pixels tegen 4 MB na het verkleinen.
 */
function verklein(textuur: Textuur, grens: number): Textuur {
  return verkleinTextuur(textuur, grens)
}

/** Het venster opruimen; de app hoeft er niet op te wachten bij het afsluiten. */
export function sluitBusfotoVenster(): void {
  if (venster && !venster.isDestroyed()) venster.destroy()
  venster = undefined
}
