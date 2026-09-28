import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

/**
 * Een bestand vervangen zonder dat er ooit een half bestand ligt.
 *
 * WAAROM
 * `writeFileSync` op het bestand zelf maakt het eerst leeg en schrijft het dan
 * vol. Valt de app of de pc ertussen weg, of houdt Defender het vast terwijl hij
 * het scant, dan ligt er een afgekapt bestand -- en een profiel dat niet meer te
 * lezen is, werd tot nu toe stil een lege "Nieuwe chauffeur" die bij de eerste
 * keer opslaan het oude overschreef. Eerst naar een tijdelijke naam schrijven en
 * dan hernoemen maakt de vervanging ondeelbaar: er ligt het oude bestand of het
 * nieuwe, nooit iets ertussenin. Zo doet de kaartcache het al.
 *
 * Windows kan het hernoemen weigeren zolang een virusscanner of indexeerder het
 * bestand even open heeft (EPERM, EBUSY, EACCES). Dat duurt milliseconden, dus
 * een paar nieuwe pogingen lossen het op; lukt het dan nog niet, dan gaat de fout
 * door naar de aanroeper, zoals vroeger.
 *
 * Sinds 28-09 wordt het tijdelijke bestand eerst teruggelezen: pas als daar
 * byte voor byte staat wat er moest staan, gaat het naar de echte plek. En een
 * bestand dat niet leeg was, wordt niet door een leeg vervangen, tenzij de
 * aanroeper dat met `leegMag` zegt -- een lege keyboard.cfg of profiel is altijd
 * een fout ergens eerder, nooit wat iemand bedoelde.
 */
export function schrijfVeilig(
  pad: string,
  inhoud: string | Buffer,
  codering: BufferEncoding = 'utf8',
  opties: { leegMag?: boolean } = {}
): void {
  const bytes = typeof inhoud === 'string' ? Buffer.from(inhoud, codering) : inhoud
  if (bytes.length === 0 && !opties.leegMag && grootteVan(pad) > 0) {
    throw new Error(`Niet geschreven: ${basename(pad)} zou leeg worden.`)
  }
  mkdirSync(dirname(pad), { recursive: true })
  const tijdelijk = `${pad}.${process.pid}.bezig`
  try {
    writeFileSync(tijdelijk, bytes)
    const terug = readFileSync(tijdelijk)
    if (!terug.equals(bytes)) {
      throw new Error(`Niet geschreven: ${basename(pad)} kwam anders terug dan hij geschreven werd.`)
    }
    metNieuwePogingen(() => renameSync(tijdelijk, pad))
  } catch (fout) {
    try {
      unlinkSync(tijdelijk)
    } catch {
      // Dan blijft er een .bezig liggen; de volgende keer overschrijft hij hem.
    }
    throw fout
  }
  naOpslaan?.(pad)
}

function grootteVan(pad: string): number {
  try {
    return statSync(pad).size
  } catch {
    return 0
  }
}

/*
 * Wie wil weten dat er iets opgeslagen is. Het hoofdproces noteert zo welke
 * versie van de app het laatst in de gebruikersmap schreef (zie
 * core/versiewacht.ts); zonder aanroeper (een proef) gebeurt er niets.
 */
let naOpslaan: ((pad: string) => void) | undefined

export function zetNaOpslaan(doe: ((pad: string) => void) | undefined): void {
  naOpslaan = doe
}

/* ---- de bestanden van OMSI ---- */

/**
 * Hoe een tekstbestand van OMSI op schijf staat. OMSI schrijft zijn cfg's in
 * de Windows-codering (1252), maar er zijn er ook in UTF-16 met een BOM -- van
 * een editor, of van een add-on. De app las `keyboard.cfg` altijd als losse
 * bytes; een UTF-16-bestand leek dan leeg (de regeleinden zijn daar `\r\0\n\0`),
 * en terugschrijven had het vervangen door alleen wat de app ervan begreep.
 */
export type CfgCodering = 'latin1' | 'utf16le'

/** De codering van een bestand aan zijn eerste bytes; zonder BOM Windows-1252. */
export function cfgCodering(bytes: Buffer): { codering: CfgCodering; bom: boolean } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { codering: 'utf16le', bom: true }
  // UTF-16 zonder BOM: tekst van gewone letters heeft om de andere byte een nul.
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[2] !== 0 && bytes[3] === 0) {
    return { codering: 'utf16le', bom: false }
  }
  return { codering: 'latin1', bom: false }
}

/**
 * Een cfg van OMSI als tekst. `latin1` en niet `win1252`: zo komt elke byte
 * heen en terug als dezelfde byte, ook de paar die 1252 anders leest -- en
 * dat is wat de app belooft (probe-gamecfg: byte-identiek heen en weer).
 */
export function leesCfg(pad: string): string {
  const bytes = readFileSync(pad)
  const { codering, bom } = cfgCodering(bytes)
  return bytes.subarray(bom ? 2 : 0).toString(codering)
}

/**
 * Een cfg van OMSI terugschrijven in de codering die hij had, via
 * `schrijfVeilig`. Een nieuw bestand wordt Windows-1252, zoals OMSI het doet.
 */
export function schrijfCfg(pad: string, tekst: string, opties: { leegMag?: boolean } = {}): void {
  let codering: CfgCodering = 'latin1'
  let bom = false
  if (existsSync(pad)) ({ codering, bom } = cfgCodering(readFileSync(pad)))
  if (!opties.leegMag && tekst.trim() === '' && grootteVan(pad) > 0) {
    throw new Error(`Niet geschreven: ${basename(pad)} zou leeg worden.`)
  }
  const lijf = Buffer.from(tekst, codering)
  schrijfVeilig(pad, bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), lijf]) : lijf, 'utf8', opties)
}

/**
 * Iets met een bestand doen, en het een paar keer opnieuw proberen als Windows
 * het even vasthoudt (EPERM, EBUSY, EACCES). Een virusscanner die een vers
 * bestand bekijkt doet daar milliseconden over; een fout die blijft, gaat na de
 * laatste poging gewoon door naar de aanroeper.
 */
export function metNieuwePogingen<T>(doe: () => T): T {
  for (let poging = 1; ; poging++) {
    try {
      return doe()
    } catch (fout) {
      const code = (fout as NodeJS.ErrnoException).code
      const tijdelijkeFout = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!tijdelijkeFout || poging >= POGINGEN) throw fout
      wachtEven(poging * 40)
    }
  }
}

const POGINGEN = 6

/** Even wachten zonder de gebeurtenislus op te geven; dit pad is synchroon. */
function wachtEven(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/*
 * Waar kopieën van bestanden van andere programma's komen. Nu is dat alleen
 * Steams localconfig.vdf (core/overlayknop.ts); de bestanden in de OMSI-map
 * gaan niet via `bewaarKopie` -- startup.ts zet laststn.osn één keer opzij als
 * .voor-omsi-enhancer, en options.cfg schrijft hij zonder kopie.
 *
 * De modules die zulke bestanden schrijven kennen alleen hun eigen pad. De
 * kopieën horen daar niet -- dat is de map van het spel of van Steam -- maar bij
 * de app. Het hoofdproces zet de plek één keer bij het starten; zonder plek (in
 * een proefscript) worden er geen kopieën gemaakt. Tot 22-09-2026 zette het
 * hoofdproces hem nergens, en bleef "eerst een kopie" voor localconfig.vdf een
 * belofte zonder kopie.
 */
let kopieMap: string | undefined

export function zetKopieMap(map: string): void {
  kopieMap = map
}

/** Hoeveel kopieën er per bestand blijven staan. */
const KOPIEEN_PER_BESTAND = 10

/**
 * Een kopie van een bestand bewaren voordat de app het verandert.
 *
 * Voor Steams localconfig.vdf, per account (zie `kopieMapNaam`): gaat er iets
 * mis met de overlayknop, dan is het bestand terug te zetten vanuit de laatste
 * tien versies. Is het bestand gelijk aan de nieuwste kopie, dan komt er geen
 * nieuwe bij: een knop die twee keer faalt en het bestand terugzet, zou anders
 * twee keer dezelfde kopie maken en een oudere, andere versie eruit duwen.
 */
export function bewaarKopie(bestand: string): void {
  if (!kopieMap || !existsSync(bestand)) return
  try {
    const naam = basename(bestand)
    const map = join(kopieMap, kopieMapNaam(bestand))
    mkdirSync(map, { recursive: true })
    const bestaand = readdirSync(map)
      .filter((item) => item.endsWith(extname(naam) || '.kopie'))
      .sort()
    const nieuwste = bestaand.at(-1)
    const huidig = readFileSync(bestand)
    if (nieuwste) {
      const vorige = join(map, nieuwste)
      if (statSync(vorige).size === huidig.length && readFileSync(vorige).equals(huidig)) return
    }
    copyFileSync(bestand, join(map, `${tijdstempel()}${extname(naam) || '.kopie'}`))
    for (const oud of bestaand.slice(0, Math.max(0, bestaand.length + 1 - KOPIEEN_PER_BESTAND))) {
      unlinkSync(join(map, oud))
    }
  } catch {
    // Een kopie die niet lukt mag het schrijven zelf niet tegenhouden.
  }
}

/**
 * De map met kopieën van één bestand, genoemd naar zijn hele pad.
 *
 * Alleen de bestandsnaam was niet genoeg: Steam heeft een localconfig.vdf per
 * account (userdata\<id>\config), en met twee accounts kwamen hun kopieën samen
 * in één map "localconfig.vdf" te staan, zonder te zien welke van wie was en met
 * tien plekken voor die twee samen. Met het pad in de naam staat het account-id
 * erin.
 */
function kopieMapNaam(bestand: string): string {
  return resolve(bestand).replace(/[\\/:]+/g, '_')
}

/** Een tijd die op naam sorteert: 20260921-115614-123. */
export function tijdstempel(tijd = new Date()): string {
  const twee = (getal: number): string => String(getal).padStart(2, '0')
  return (
    `${tijd.getFullYear()}${twee(tijd.getMonth() + 1)}${twee(tijd.getDate())}-` +
    `${twee(tijd.getHours())}${twee(tijd.getMinutes())}${twee(tijd.getSeconds())}-` +
    String(tijd.getMilliseconds()).padStart(3, '0')
  )
}
