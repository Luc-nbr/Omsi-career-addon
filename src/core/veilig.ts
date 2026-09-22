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
 */
export function schrijfVeilig(
  pad: string,
  inhoud: string | Buffer,
  codering: BufferEncoding = 'utf8'
): void {
  mkdirSync(dirname(pad), { recursive: true })
  const tijdelijk = `${pad}.${process.pid}.bezig`
  if (typeof inhoud === 'string') writeFileSync(tijdelijk, inhoud, codering)
  else writeFileSync(tijdelijk, inhoud)
  try {
    metNieuwePogingen(() => renameSync(tijdelijk, pad))
  } catch (fout) {
    try {
      unlinkSync(tijdelijk)
    } catch {
      // Dan blijft er een .bezig liggen; de volgende keer overschrijft hij hem.
    }
    throw fout
  }
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
 * Waar kopieën van bestanden van andere programma's komen: de OMSI-map, en
 * Steams localconfig.vdf (zie core/overlayknop.ts).
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
 * Voor de instellingen van OMSI: "mijn toetsen zijn weg" is dan terug te zetten
 * vanuit de laatste tien versies. Is het bestand gelijk aan de nieuwste kopie,
 * dan komt er geen nieuwe bij: het startscherm schrijft options.cfg bij elke
 * dienst, en tien keer dezelfde kopie beschermt niets.
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
