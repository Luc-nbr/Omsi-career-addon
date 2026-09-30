import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writevSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { schrijfPakket } from '../shared/bus3dpak'
import type { Bus3dLak, Bus3dManifest, Bus3dPakKop } from '../shared/bus3d'
import { bouwBus3d, bus3dLak, lakStempel, pakketVerouderd, type Bus3dBouw, type Bus3dBron, type Bus3dTextuurBron } from './bus3d'
import { leesBus3dOmgeving } from './bus3domgeving'
import { kleurstalen } from './kleurstalen'

/**
 * DE SCHIJFCACHE VAN BUS3D (bus3d-ontwerp §4.2)
 *
 * Plek: `userData/bus3d/v1/`.
 * - `p/<pakket>.b3d`: de geometrie (shared/bus3dpak.ts). Hoekpuntblokken zoals in
 *   het bronbestand, gehusselde ook gehusseld (Lucs regel, §5.1).
 * - `p/<pakket>.json`: wat alleen main leest -- het manifest, de bronnen met hun
 *   grootte en tijd, en de paden van de texturen voor het register. Paden komen
 *   nooit in het venster: dat krijgt het manifest en vraagt op id.
 * - `bus/<sha1 van het .bus-pad>`: welk pakket nu bij die bus hoort.
 *
 * Er is GEEN textuurcache: texturen stromen rechtstreeks uit de OMSI-map. Wat
 * hier staat is alleen geometrie; de NLC heeft 25 MB unieke geometrie.
 *
 * Grootte: een LRU van standaard 1 GB, opgeruimd bij het starten (main) en na het
 * schrijven zodra de grens overschreden wordt (de werker; zonder dat groeide de
 * cache in één sessie tot 4,5 GB). Gebruik zet de tijd van het `.b3d` vooruit.
 *
 * Een pakket telt alleen als zijn `.b3d` precies zo groot is als het zijspoor
 * zegt: een afgekapt bestand (stroom weg, schijf vol) wordt zo opnieuw gebouwd
 * in plaats van eindeloos uit de cache te komen. Het `.b3d` gaat met `fsync` naar
 * de schijf vóór het de echte naam krijgt.
 *
 * Geen Electron: de werker schrijft (hij heeft het pakket al in handen), main
 * leest het zijspoor, en de probe doet allebei.
 */

export const CACHE_VERSIE = 'v1'
export const STANDAARD_GRENS = 1024 * 1024 * 1024

/** Het zijspoor van een pakket: alleen voor main. */
export interface Bus3dZijspoor {
  versie: 1
  pakket: string
  bus: string
  /** De OMSI-map waaruit gebouwd is. */
  omsi: string
  manifest: Bus3dManifest
  /** De grootte van het `.b3d` in bytes: klopt die niet, dan is het pakket stuk. */
  bytes: number
  bronnen: Bus3dBron[]
  textuurBronnen: Bus3dTextuurBron[]
  /**
   * De geregistreerde sleutels bij het bouwen. Komt er een add-on bij of gaat er
   * een weg, dan kan hetzelfde model anders uitvallen: dan opnieuw bouwen.
   */
  geregistreerd: number[]
  /** Wanneer gebouwd (ms sinds 1970). */
  gebouwd: number
}

/** Voor unieke tijdelijke namen: twee schrijfbeurten in dezelfde werker delen hun pid. */
let schrijfTeller = 0

/** Staat het bestand er al, met precies deze lengte? */
function bestaatMetLengte(pad: string, lengte: number): boolean {
  try {
    return statSync(pad).size === lengte
  } catch {
    return false
  }
}

/**
 * De sleutel van een bus: de OMSI-map hoort erbij. Wie een andere installatie
 * aanwijst, heeft onder hetzelfde relatieve pad misschien een andere bus -- en
 * de bronnen van het oude pakket bestaan dan nog gewoon, dus de controle achteraf
 * zou het verschil niet zien.
 */
const busSleutel = (omsiMap: string, relatiefPad: string): string =>
  createHash('sha1')
    .update(`${resolve(omsiMap).toLowerCase()}|${relatiefPad.replace(/\//g, '\\').toLowerCase()}`)
    .digest('hex')

export class Bus3dCache {
  readonly map: string

  constructor(
    userData: string,
    readonly grens = STANDAARD_GRENS
  ) {
    this.map = join(userData, 'bus3d', CACHE_VERSIE)
  }

  pakketPad(pakket: string): string {
    return join(this.map, 'p', `${pakket}.b3d`)
  }

  private zijspoorPad(pakket: string): string {
    return join(this.map, 'p', `${pakket}.json`)
  }

  /**
   * Een gebouwd pakket wegschrijven: eerst naar een tijdelijke naam en dan
   * hernoemen, zodat een half bestand nooit als pakket gelezen wordt.
   */
  schrijf(
    bouw: Bus3dBouw,
    omsiMap: string,
    geregistreerd: Iterable<number>
  ): { ms: number; bytes: number; zijspoor: Bus3dZijspoor } {
    const t0 = performance.now()
    mkdirSync(join(this.map, 'p'), { recursive: true })
    mkdirSync(join(this.map, 'bus'), { recursive: true })
    const pakket = bouw.manifest.pakket
    const delen = schrijfPakket(bouw.kop, bouw.staart)
    const lengte = delen.reduce((s, d) => s + d.byteLength, 0)
    /*
     * Hetzelfde id is dezelfde inhoud (een hash van alle bronnen). Twee bouwbeurten
     * van dezelfde bus tegelijk -- het 3D-venster en het fotovenster van de foto
     * v4 -- schreven eerst allebei, en de tweede kon niet over het bestand heen
     * dat het 3D-venster al via p/ las: EPERM, en het venster kreeg 'fout'
     * (proef van de tegenlezing F2). Staat het er al met de goede lengte, dan
     * laten we het staan; lukt het hernoemen niet terwijl het er intussen wel
     * staat, dan ook.
     */
    const doel = this.pakketPad(pakket)
    let bytes = lengte
    if (!bestaatMetLengte(doel, lengte)) {
      const tijdelijk = `${doel}.${process.pid}.${++schrijfTeller}.tmp`
      const fd = openSync(tijdelijk, 'w')
      bytes = 0
      try {
        // In stukken van hooguit 1024 buffers (de grens van writev).
        for (let i = 0; i < delen.length; i += 1024) bytes += writevSync(fd, delen.slice(i, i + 1024))
        // Eerst echt op de schijf, dan pas de echte naam: anders kan een stroomstoring
        // een pakket met de goede naam en een halve inhoud achterlaten.
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      try {
        renameSync(tijdelijk, doel)
      } catch (fout) {
        rmSync(tijdelijk, { force: true })
        if (!bestaatMetLengte(doel, bytes)) throw fout
      }
    }
    bouw.manifest.ms.schrijven = Math.round(performance.now() - t0)
    const zijspoor: Bus3dZijspoor = {
      versie: 1,
      pakket,
      bus: bouw.manifest.bus,
      omsi: resolve(omsiMap),
      manifest: bouw.manifest,
      bytes,
      bronnen: bouw.bronnen,
      textuurBronnen: bouw.textuurBronnen,
      geregistreerd: [...geregistreerd].sort((a, b) => a - b),
      gebouwd: Date.now()
    }
    const json = JSON.stringify(zijspoor)
    const zijTijdelijk = `${this.zijspoorPad(pakket)}.${process.pid}.${++schrijfTeller}.tmp`
    writeFileSync(zijTijdelijk, json)
    try {
      renameSync(zijTijdelijk, this.zijspoorPad(pakket))
    } catch (fout) {
      // Een gelijktijdige bouwbeurt van hetzelfde pakket schreef hem al (zelfde inhoud, op de bouwtijd na).
      rmSync(zijTijdelijk, { force: true })
      if (!existsSync(this.zijspoorPad(pakket))) throw fout
    }
    // Het vorige pakket van deze bus mag weg: het heeft een ander id.
    const vorige = this.pakketVan(omsiMap, bouw.manifest.bus)
    writeFileSync(join(this.map, 'bus', busSleutel(omsiMap, bouw.manifest.bus)), pakket)
    let weg = 0
    if (vorige && vorige !== pakket) weg = this.gooiWeg(vorige)
    this.handhaafGrens(bytes + Buffer.byteLength(json) - weg)
    return { ms: Math.round(performance.now() - t0), bytes, zijspoor }
  }

  /**
   * Wat er naar schatting in de cache staat; `undefined` = nog niet geteld. De
   * werker telt één keer alles (`inhoud`) en houdt het daarna bij, zodat hij
   * niet na elke schrijfbeurt de hele map hoeft te bekijken.
   */
  private geschat: number | undefined

  /** Na een schrijfbeurt: boven de grens, dan de LRU (de oudste eerst weg). */
  private handhaafGrens(erbij: number): void {
    this.geschat = this.geschat === undefined ? this.inhoud().reduce((s, p) => s + p.bytes, 0) : this.geschat + erbij
    if (this.geschat > this.grens) this.geschat = this.ruimOp().bytes
  }

  /** Welk pakket er voor deze bus staat (zonder te controleren of het nog klopt). */
  pakketVan(omsiMap: string, relatiefPad: string): string | undefined {
    try {
      const id = readFileSync(join(this.map, 'bus', busSleutel(omsiMap, relatiefPad)), 'utf8').trim()
      return /^[0-9a-f]{40}$/.test(id) ? id : undefined
    } catch {
      return undefined
    }
  }

  /** Het zijspoor van de bus, als zijn pakket er ook staat. */
  zoek(omsiMap: string, relatiefPad: string): Bus3dZijspoor | undefined {
    const pakket = this.pakketVan(omsiMap, relatiefPad)
    if (!pakket) return undefined
    const z = this.zijspoor(pakket)
    return z && z.omsi.toLowerCase() === resolve(omsiMap).toLowerCase() ? z : undefined
  }

  /**
   * Het zijspoor van een pakket, als het `.b3d` erbij er heel staat: precies de
   * grootte die het zijspoor noemt. Een afgekapt `.b3d` telt niet; dan wordt de
   * bus opnieuw gebouwd (aanvalsverslag F1, punt 8).
   */
  zijspoor(pakket: string): Bus3dZijspoor | undefined {
    try {
      const st = statSync(this.pakketPad(pakket))
      const z = JSON.parse(readFileSync(this.zijspoorPad(pakket), 'utf8')) as Bus3dZijspoor
      return z.versie === 1 && z.pakket === pakket && z.bytes === st.size ? z : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Alleen de JSON-kop van een `.b3d` (de vermeldingen en stukken, zonder de
   * geometrie): wat de ruststand nodig heeft. De kop staat vooraan; de staart
   * met de hoekpunten wordt niet gelezen.
   */
  leesKop(pakket: string): Bus3dPakKop | undefined {
    let fd: number | undefined
    try {
      fd = openSync(this.pakketPad(pakket), 'r')
      const begin = Buffer.alloc(8)
      if (readSync(fd, begin, 0, 8, 0) < 8 || begin.toString('latin1', 0, 4) !== 'B3D1') return undefined
      const lengte = begin.readUInt32LE(4)
      const json = Buffer.alloc(lengte)
      if (readSync(fd, json, 0, lengte, 8) < lengte) return undefined
      const kop = JSON.parse(json.toString('utf8')) as Bus3dPakKop
      return kop.versie === 1 && kop.pakket === pakket ? kop : undefined
    } catch {
      return undefined
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }

  /** Gebruikt: de tijd vooruit, zodat de LRU hem als laatste weggooit. */
  raak(pakket: string): void {
    const nu = new Date()
    try {
      utimesSync(this.pakketPad(pakket), nu, nu)
    } catch {
      // Niet erg: dan valt hij iets eerder uit de LRU.
    }
  }

  /** Een pakket van de schijf, met zijn heldenbeelden; geeft hoeveel bytes er weg zijn. */
  private gooiWeg(pakket: string): number {
    let bytes = 0
    for (const pad of [this.pakketPad(pakket), this.zijspoorPad(pakket), ...this.heldenVan(pakket), ...this.standenVan(pakket)]) {
      try {
        bytes += statSync(pad).size
      } catch {
        continue
      }
      rmSync(pad, { force: true })
    }
    return bytes
  }

  // ------------------------------------------------------------ de ruststand (§4.2: s/)
  /*
   * `s/<pakket>-<stempel>.json`: de lak van een kleurstelling -- de ruststand en
   * de vervangen texturen. De stempel (`lakStempel`) volgt de scripts, de .bus en
   * de texturen van de kleurstelling; het pakket-id de rest. Zo kost een warme
   * lak ook na een nieuwe werker geen scripts lezen (tot 570 ms bij de NLC).
   */
  private standPad(pakket: string, stempel: string): string {
    return join(this.map, 's', `${pakket}-${stempel}.json`)
  }

  private standenVan(pakket: string): string[] {
    try {
      return readdirSync(join(this.map, 's'))
        .filter((naam) => naam.startsWith(`${pakket}-`))
        .map((naam) => join(this.map, 's', naam))
    } catch {
      return []
    }
  }

  leesStand(pakket: string, stempel: string): { lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] } | undefined {
    try {
      const uit = JSON.parse(readFileSync(this.standPad(pakket, stempel), 'utf8')) as { lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] }
      return uit?.lak && Array.isArray(uit.textuurBronnen) ? uit : undefined
    } catch {
      return undefined
    }
  }

  schrijfStand(pakket: string, stempel: string, stand: { lak: Bus3dLak; textuurBronnen: Bus3dTextuurBron[] }): void {
    try {
      mkdirSync(join(this.map, 's'), { recursive: true })
      const pad = this.standPad(pakket, stempel)
      // Hooguit 8 standen per pakket (§4.1): de oudste weg.
      const bestaand = this.standenVan(pakket)
        .map((p) => ({ p, t: statSync(p).mtimeMs }))
        .sort((a, b) => a.t - b.t)
      for (const oud of bestaand.slice(0, Math.max(0, bestaand.length - 7))) rmSync(oud.p, { force: true })
      writeFileSync(`${pad}.${process.pid}.tmp`, JSON.stringify(stand))
      renameSync(`${pad}.${process.pid}.tmp`, pad)
    } catch {
      // Niet erg: dan wordt hij de volgende keer opnieuw uitgerekend.
    }
  }

  // ------------------------------------------------------------ heldenbeelden (§9)
  /*
   * `h/<pakket>-<kleur>-<sleutel>.webp`: het beeld dat het 3D-venster maakte
   * zodra de bus helemaal scherp stond. Een plaatje, geen meetkunde (§5.1), dus
   * het mag op schijf. Het hoort bij zijn pakket en gaat met dat pakket weg --
   * ook als een sleutel uit de registratie verdwijnt.
   */
  private heldNaam(pakket: string, kleurstelling: string | undefined, sleutel: string): string {
    const kleur = createHash('sha1').update(`kleur|${kleurstelling ?? ''}`).digest('hex').slice(0, 16)
    return `${pakket}-${kleur}-${sleutel}.webp`
  }

  /**
   * De heldenbeelden van één kleurstelling van een pakket vergeten (Lakstudio:
   * opnieuw opslaan of verwijderen onder dezelfde naam, §5.6 punt 7).
   */
  vergeetHelden(pakket: string, kleurstelling: string | undefined): number {
    const voor = this.heldNaam(pakket, kleurstelling, '').replace(/\.webp$/, '')
    let n = 0
    for (const p of this.heldenVan(pakket)) {
      if (!p.split(/[\/]/).pop()!.startsWith(voor)) continue
      rmSync(p, { force: true })
      n++
    }
    return n
  }

  /** Alleen de kop van een pakket (vermeldingen en stukken), zonder de hoekpunten te lezen. */
  kop(pakket: string): Bus3dPakKop | undefined {
    let fd: number | undefined
    try {
      fd = openSync(this.pakketPad(pakket), 'r')
      const begin = Buffer.alloc(8)
      readSync(fd, begin, 0, 8, 0)
      const n = begin.readUInt32LE(4)
      if (n <= 0 || n > 256 * 1024 * 1024) return undefined
      const json = Buffer.alloc(n)
      readSync(fd, json, 0, n, 8)
      return JSON.parse(json.toString('utf8').replace(/\u0000+$/, '').trimEnd()) as Bus3dPakKop
    } catch {
      return undefined
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }

  heldPad(pakket: string, kleurstelling: string | undefined, sleutel: string): string {
    return join(this.map, 'h', this.heldNaam(pakket, kleurstelling, sleutel))
  }

  private heldenVan(pakket: string): string[] {
    try {
      return readdirSync(join(this.map, 'h'))
        .filter((naam) => naam.startsWith(`${pakket}-`))
        .map((naam) => join(this.map, 'h', naam))
    } catch {
      return []
    }
  }

  /** Een heldenbeeld wegschrijven (tijdelijk bestand, dan hernoemen). */
  schrijfHeld(pakket: string, kleurstelling: string | undefined, sleutel: string, webp: Uint8Array): string {
    mkdirSync(join(this.map, 'h'), { recursive: true })
    const pad = this.heldPad(pakket, kleurstelling, sleutel)
    writeFileSync(`${pad}.${process.pid}.tmp`, webp)
    renameSync(`${pad}.${process.pid}.tmp`, pad)
    return pad
  }

  /** Het heldenbeeld van een pakket en kleurstelling met deze sleutels, de eerste die er is. */
  zoekHeld(pakket: string, kleurstelling: string | undefined, sleutels: string[]): string | undefined {
    for (const sleutel of sleutels) {
      const pad = this.heldPad(pakket, kleurstelling, sleutel)
      try {
        if (statSync(pad).size > 0) return pad
      } catch {
        // niet dit
      }
    }
    return undefined
  }

  /**
   * Eén pakket vergeten: het bestand, het zijspoor, en de wijzer van zijn bus als
   * die nog naar dit pakket wijst. Voor een pakket dat verouderd is terwijl de
   * herbouw mislukt (punt 7), en voor een pakket dat het venster stuk meldt.
   */
  vergeetPakket(pakket: string, omsiMap: string, bus?: string): void {
    const relatief = bus ?? this.zijspoorOngetoetst(pakket)?.bus
    const weg = this.gooiWeg(pakket)
    if (this.geschat !== undefined) this.geschat -= weg
    if (relatief && this.pakketVan(omsiMap, relatief) === pakket) {
      rmSync(join(this.map, 'bus', busSleutel(omsiMap, relatief)), { force: true })
    }
  }

  /** Het zijspoor zonder de toets op het `.b3d` (om een stuk pakket op te ruimen). */
  private zijspoorOngetoetst(pakket: string): Bus3dZijspoor | undefined {
    try {
      const z = JSON.parse(readFileSync(this.zijspoorPad(pakket), 'utf8')) as Bus3dZijspoor
      return z.versie === 1 && z.pakket === pakket ? z : undefined
    } catch {
      return undefined
    }
  }

  /** Alles wat er staat: pakket, bytes, tijd. */
  inhoud(): Array<{ pakket: string; bytes: number; tijd: number }> {
    let namen: string[]
    try {
      namen = readdirSync(join(this.map, 'p'))
    } catch {
      return []
    }
    const uit: Array<{ pakket: string; bytes: number; tijd: number }> = []
    for (const naam of namen) {
      const m = /^([0-9a-f]{40})\.b3d$/.exec(naam)
      if (!m) continue
      try {
        const st = statSync(join(this.map, 'p', naam))
        let bytes = st.size
        try {
          bytes += statSync(this.zijspoorPad(m[1])).size
        } catch {
          // geen zijspoor: telt alleen het pakket
        }
        uit.push({ pakket: m[1], bytes, tijd: st.mtimeMs })
      } catch {
        // net weg
      }
    }
    return uit
  }

  /**
   * De LRU: het oudste eerst weg tot het onder de grens zit. Ook weg: halve
   * bestanden van een afgebroken schrijfbeurt, en zijsporen zonder pakket.
   */
  ruimOp(): { weg: number; bytes: number } {
    let weg = 0
    try {
      for (const naam of readdirSync(join(this.map, 'p'))) {
        const zonderPakket = /^([0-9a-f]{40})\.json$/.exec(naam)
        const half = naam.endsWith('.tmp')
        let wees = false
        if (zonderPakket) {
          try {
            statSync(this.pakketPad(zonderPakket[1]))
          } catch {
            wees = true
          }
        }
        if (half || wees) {
          rmSync(join(this.map, 'p', naam), { force: true })
          weg++
        }
      }
    } catch {
      return { weg: 0, bytes: 0 }
    }
    const lijst = this.inhoud().sort((a, b) => a.tijd - b.tijd)
    let bytes = lijst.reduce((s, p) => s + p.bytes, 0)
    for (const p of lijst) {
      if (bytes <= this.grens) break
      this.gooiWeg(p.pakket)
      bytes -= p.bytes
      weg++
    }
    return { weg, bytes }
  }

  /**
   * Pakketten vergeten: allemaal, of die van bussen onder deze voertuigmappen
   * (de add-on-manager, §4.2), of die met een van deze o3d-sleutels (een add-on
   * is weg, §5.1), of (`toegestaan`) die met een sleutel die niet 0 is en niet
   * in deze registratie staat -- ook een pakket uit een vorige sessie
   * (aanvalsverslag F2, punt 2).
   */
  vergeet(filter?: { mappen?: string[]; sleutels?: number[]; toegestaan?: ReadonlySet<number> }): number {
    let weg = 0
    const mappen = filter?.mappen?.map((m) => m.toLowerCase().replace(/\//g, '\\'))
    for (const { pakket } of this.inhoud()) {
      if (filter) {
        const z = this.zijspoor(pakket)
        const bus = z?.bus.toLowerCase().replace(/\//g, '\\') ?? ''
        const opMap = mappen?.some((m) => bus.startsWith(`vehicles\\${m}\\`) || bus.startsWith(`${m}\\`)) ?? false
        const opSleutel = filter.sleutels?.some((s) => z?.manifest.sleutels.includes(s)) ?? false
        const toegestaan = filter.toegestaan
        const nietToegestaan = toegestaan ? (z?.manifest.sleutels.some((s) => s !== 0 && !toegestaan.has(s)) ?? false) : false
        if (z && !opMap && !opSleutel && !nietToegestaan) continue
      }
      this.gooiWeg(pakket)
      weg++
    }
    this.geschat = undefined
    return weg
  }
}

/** De opdrachten van de werker `'bus3d'` (main/kaartwerker.ts). */
export type Bus3dOpdracht =
  | { soort: 'bus3d:model'; relatiefPad: string; geregistreerd: number[] }
  | { soort: 'bus3d:lak'; pakket: string; kleurstelling?: string; extra?: Array<[string, number]> }
  | { soort: 'bus3d:controle'; pakket: string }
  | { soort: 'bus3d:omgeving' }
  | { soort: 'bus3d:stalen'; relatiefPad: string }

/**
 * Wat de werker `'bus3d'` doet, los van de werker zelf: de probe roept precies
 * dit aan. `tussen` krijgt de voortgang en, zodra die er is, de textuurlijst
 * (bus3d-ontwerp §4.1), zodat het venster al texturen ophaalt terwijl de rest
 * nog gebouwd wordt.
 *
 * - `bus3d:model`: bouwen en naar de cache schrijven; geeft het zijspoor (voor
 *   main) of een reden.
 * - `bus3d:lak`: de texturen en vars van een kleurstelling, met de ruststand
 *   (ook bij "Standaard", `kleurstelling` leeg).
 * - `bus3d:controle`: het eerste bronbestand dat veranderd is, of niets.
 * - `bus3d:omgeving`: de hemel en de wolken van "Buiten" uit de installatie.
 */
export async function bus3dWerk(
  opdracht: Bus3dOpdracht,
  omsiMap: string,
  cache: Bus3dCache,
  tussen?: (bericht: unknown) => void
): Promise<unknown> {
  if (opdracht.soort === 'bus3d:model') {
    const geregistreerd = new Set(opdracht.geregistreerd)
    const uit = await bouwBus3d({
      omsiMap,
      relatiefPad: opdracht.relatiefPad,
      geregistreerd,
      opLijst: (lijst, bronnen) => tussen?.({ stap: 'lijst', klaar: lijst.length, totaal: lijst.length, lijst, bronnen }),
      opVoortgang: (klaar, totaal) => tussen?.({ stap: 'lezen', klaar, totaal })
    })
    if (!uit.bouw) return { reden: uit.reden, detail: uit.detail, sleutels: uit.sleutels }
    tussen?.({ stap: 'schrijven', klaar: 0, totaal: 1 })
    const geschreven = cache.schrijf(uit.bouw, omsiMap, geregistreerd)
    return { zijspoor: geschreven.zijspoor, tijden: { ...uit.bouw.tijden, schrijven: geschreven.ms }, doostoets: uit.bouw.doostoets }
  }
  if (opdracht.soort === 'bus3d:omgeving') return leesBus3dOmgeving(omsiMap)
  if (opdracht.soort === 'bus3d:stalen') {
    /*
     * Het buitenoppervlak per CTC-plek uit het pakket, als dat er is: bij gelijke
     * telling kiest kleurstalen.ts de plek die het meest van de bus beslaat. De
     * plek zelf kiest kleurstalen.ts (de plek die de meeste kleurstellingen
     * vervangen, per kleurstelling de beste die zij zelf vervangt; nooit glas).
     */
    const z = cache.zoek(omsiMap, opdracht.relatiefPad)
    const oppervlak: Record<string, number> = {}
    for (const t of z?.manifest.texturen ?? []) if (t.ctc) oppervlak[t.ctc] = Math.max(oppervlak[t.ctc] ?? 0, t.oppervlak)
    return kleurstalen(omsiMap, opdracht.relatiefPad, oppervlak, (stalen) => tussen?.({ stalen }))
  }
  const z = cache.zijspoor(opdracht.pakket)
  if (opdracht.soort === 'bus3d:lak') {
    if (!z) return { reden: 'verouderd' }
    const t0 = performance.now()
    const extra = opdracht.extra ?? []
    const stempel = lakStempel(omsiMap, z.manifest, opdracht.kleurstelling, extra)
    const bekend = cache.leesStand(opdracht.pakket, stempel)
    if (bekend) return { ...bekend, lak: { ...bekend.lak, ms: Math.round(performance.now() - t0) } }
    const uit = bus3dLak(omsiMap, z.manifest, opdracht.kleurstelling, cache.leesKop(opdracht.pakket), extra)
    cache.schrijfStand(opdracht.pakket, stempel, uit)
    return uit
  }
  return z ? pakketVerouderd(z.bronnen) : 'pakket weg'
}
