/**
 * DE 3D-WEERGAVE VAN EEN BUS ("BUS3D"): TYPEN EN PURE REGELS
 *
 * Het ontwerp staat in design/ontwerpen/bus3d.md. In het kort:
 * - de werker `'bus3d'` leest cfg, .bus, o3d's en de KOPPEN van de texturen, en
 *   bouwt per bus een PAKKET: geometrie, materialen en de textuurlijst
 *   (core/bus3d.ts), in een schijfcache (main/bus3d.ts);
 * - main geeft pakketten en texturen op id via het protocol `omsi3d://`
 *   (`p/<id>`, `t/<id>`, `h/<id>`), nooit op pad;
 * - het 3D-venster tekent (F2).
 *
 * Dit bestand heeft geen `node:` en geen `Buffer`: het hoort ook bij de
 * renderer-werker.
 *
 * ASSEN
 * Alles hier staat in de assen van de o3d-bestanden: x breed, y hoog, z lang
 * (vooruit). De .bus schrijft x, y (vooruit), z (omhoog); die wordt bij het lezen
 * omgezet.
 */

export type V3 = [number, number, number]

/** Waarom er geen 3D komt; het venster kiest er de terugval bij (§9). */
export type Bus3dReden = 'geen-model' | 'versleuteld' | 'te-zwaar' | 'fout' | 'tijd' | 'vervangen' | 'verouderd'

/** De route van een textuur naar de GPU (§5.7). */
export type Bus3dTextuurSoort = 'dxt' | 'dxt-zonder-mips' | 'beeld' | 'eigen'

export interface Bus3dTextuur {
  /** Voor `omsi3d://t/<id>`: 40 hextekens, uit het register van main. */
  id: string
  soort: Bus3dTextuurSoort
  formaat?: 'bc1' | 'bc2' | 'bc3'
  srgb: boolean
  b: number
  h: number
  /** Aantal mipniveaus in het bestand (1 = alleen het grootste). */
  mips: number
  /** DXT: de plek van elk niveau in het bronbestand. */
  niveaus?: Array<{ off: number; len: number }>
  /** Bij `beeld`: het soort beeld op de inhoud (image/png, image/jpeg, image/bmp). */
  mime?: string
  /** Wat er precies in staat, voor het logboek: DXT1, BMP24, TGA-RLE-32 ... */
  vorm: string
  /** De grootte van het bestand in bytes. */
  bytes: number
  /** Buitenoppervlak in de wereld (m²) en UV-oppervlak, voor de doelmaat (§5.7). */
  oppervlak: number
  uv: number
  /** De `[CTCTexture]`-plek, als een kleurstelling deze textuur vervangt. */
  ctc?: string
  /** Alleen als envmap gebruikt: wordt niet geladen (§5.5). */
  envmap?: boolean
  /** De bestandsnaam, zonder map: voor het logboek en de proeven. */
  naam: string
}

export interface Bus3dManifest {
  versie: 1
  pakket: string
  /** Het .bus-pad ten opzichte van de OMSI-map. */
  bus: string
  /** `[friendlyname]`: merk, type, standaardkleurstelling. */
  naam: [string, string, string]
  /** `[description]` uit de .bus (meestal Duits). */
  beschrijving?: string
  /** Uit `<bus>_<TAAL>.dsc`: per taalcode (ENG, DEU, FRA ...). Kies met `beschrijvingVoor`. */
  beschrijvingen?: Record<string, string>
  /** `[boundingbox]` van de hele trein, in o3d-assen; de gemeten doos als die ontbreekt. */
  doos: { min: V3; max: V3 }
  /** Voorwagen en aanhangers, met hun plek ten opzichte van de voorwagen. */
  delen: Array<{ bus: string; verschuiving: V3 }>
  /** Oogpunt uit `[add_camera_driver]`, voor Instappen (F5). */
  bestuurder?: { plek: V3 }
  texturen: Bus3dTextuur[]
  /** Gebruikte o3d-sleutels (0 of geregistreerd); main toetst ze vóór het tonen (§5.1). */
  sleutels: number[]
  telling: {
    driehoeken: number
    /** Unieke (deel, o3d). */
    stukken: number
    vermeldingen: number
    texturen: number
    /** Weggelaten o3d's: sleutel niet geregistreerd, zoals OMSI ze weigert. */
    versleuteld: number
    /** O3d's met sleutel 0 of een geregistreerde sleutel. */
    ontward: number
    /** Texturen die de o3d noemt maar die er niet zijn. */
    ontbrekend: number
    /** Texturen die er wel zijn maar waarvan de kop niet te lezen is. */
    onleesbaar: number
    /**
     * Buitenmeshes volgens de cfg (na LOD), en hoeveel daarvan hun o3d mist op
     * deze pc. De MB O530 Facelift mist er 268 van de 416 en stond zonder label
     * bijna leeg in beeld (proefdraaier F2); boven 25% zegt bv.incompleteModel het.
     * Ontbreekt in een pakket van vóór de tegenlezing van F2.
     */
    meshes?: number
    meshesWeg?: number
  }
  /** Namen, voor het logboek en de proeven: geen paden. */
  problemen: {
    ontbrekend: string[]
    onleesbaar: Array<{ naam: string; reden: string }>
    versleuteld: Array<{ o3d: string; sleutel: number }>
  }
  bytes: { geometrie: number }
  ms: { lezen: number; schrijven: number }
}

/** Een o3d-materiaal met wat de cfg erover zegt, textuur op nummer in `manifest.texturen`. */
export interface Bus3dMateriaalstand {
  /** diffuus rgba, specular rgb, emissie rgb, macht: uit de o3d of `[matl_allcolor]`. */
  diffuus: [number, number, number, number]
  specular: [number, number, number]
  emissie: [number, number, number]
  macht: number
  textuur?: number
  /** `[matl_alpha]`: 0 dekkend, 1 alfatest, 2 mengen. */
  alfa: 0 | 1 | 2
  /** `[matl_transmap]`: een textuur, een scripttextuur (`\S:n`) of leeg (de eigen alfa). */
  transmap?: { textuur?: number; script?: number }
  envmap?: { sterkte: number; masker?: number }
  bumpmap?: { textuur?: number; sterkte: number }
  lightmap?: { textuur?: number; variabele?: string }
  nightmap?: number
  freetex?: { standaard?: number; variabele: string }
  alfaSchaal?: string
  texcoordX?: string
  texcoordY?: string
}

export interface Bus3dMateriaal extends Bus3dMateriaalstand {
  nietSchrijven?: boolean
  nietTesten?: boolean
  adres?: 'clamp' | 'border'
  /** `[useTextTexture] k` en `[useScriptTexture] k`. */
  tekst?: number
  scripttextuur?: number
  /** `[matl_change]`: de variabele en de items (item 1, 2, ...). */
  wissel?: { variabele: string; items: Bus3dMateriaalstand[] }
}

/** Eén unieke (deel, o3d): de geometrie, gedeeld door alle vermeldingen ervan. */
export interface Bus3dStuk {
  deel: number
  /** De bestandsnaam van de o3d (geen pad). */
  o3d: string
  /** Aantal hoekpunten. */
  n: number
  /** 32 bytes per hoekpunt, BYTE VOOR BYTE zoals in het bronbestand. */
  hoekpunten: { off: number; len: number }
  /**
   * Alleen bij een gehusseld blok: wat `ontwar` nodig heeft. Ontwarren gebeurt
   * pas in het geheugen (renderer-werker, fotovenster); nooit op schijf (§5.1).
   */
  hussel?: { versie: number; vlag: number; sleutel: number }
  /** Driehoeken, op materiaal gesorteerd; 2 of 4 bytes per index. */
  indices: { off: number; len: number; breed: 2 | 4 }
  /** Per o3d-materiaal: waar zijn driehoeken in `indices` staan (in indices, niet in bytes). */
  groepen: Array<{ materiaal: number; begin: number; aantal: number }>
  /** De textuurnamen van de o3d-materialen, voor de diagnose. */
  materiaalnamen: string[]
}

/** Eén `[mesh]`-regel die in het pakket zit. */
export interface Bus3dVermelding {
  stuk: number
  /** Plek in de meshlijst van OMSI (voor de plugin-afdruk) en in de cfg. */
  mesh: number
  cfg: number
  aanzicht: number
  /** In beeld in de buitenweergave: viewpoint 0 of bit 1, hoogste LOD. */
  buiten: boolean
  /** Alleen binnen (viewpoint 2): voor Instappen (F5). */
  binnen: boolean
  schaduw: boolean
  zicht: Array<[string, number]>
  ident?: string
  ouder?: string
  /** Per o3d-materiaal; `null` als de o3d er geen heeft. */
  materialen: Array<Bus3dMateriaal | null>
  /** Aantal `[newanim]`'s (F3b). */
  anims: number
}

/** De JSON-kop van een `.b3d`; de offsets tellen vanaf het begin van de binaire staart. */
export interface Bus3dPakKop {
  versie: 1
  pakket: string
  stukken: Bus3dStuk[]
  vermeldingen: Bus3dVermelding[]
}

export interface Bus3dLak {
  kleurstelling?: string
  /** Precies kleurVars(): de CTC-index plus de setvars, zoals de app het in de situatie zet. */
  vars: Array<[string, number]>
  bron: 'script' | 'regels' | 'omsi'
  /** Een teken per vermelding ('1' zichtbaar); leeg = onbekend, dan telt alles als zichtbaar. */
  zichtbaar: string
  /**
   * `[matl_change]`: welk item (0 = het materiaal zelf, 1 = het eerste
   * `[matl_item]` ...). De sleutel is `itemSleutel(vermelding, materiaal)`.
   */
  items: Record<number, number>
  alphascale: Record<string, number>
  animaties?: Float32Array
  /** De texturen die deze kleurstelling vervangt: `plek` is de index in `manifest.texturen`. */
  texturen: Array<{ plek: number; textuur: Bus3dTextuur }>
  onbekend: string[]
  ms: number
}

export interface Bus3dVoortgang {
  vraag: number
  stap: 'lezen' | 'lijst' | 'schrijven' | 'script'
  klaar: number
  totaal: number
  lijst?: Bus3dTextuur[]
}

export type Bus3dAntwoord =
  | { manifest: Bus3dManifest; lak?: Bus3dLak; bron?: 'cache' | 'nieuw' }
  | { reden: Bus3dReden; detail?: string }

/**
 * De smalle brug van het 3D-venster (preload/bus3d.ts, `window.bus3d`): alleen
 * wat de viewer nodig heeft, geen profielen, paden of instellingen (§8.1). Het
 * venster eromheen (vraag, kiezen, sluiten) voegt er zijn eigen delen aan toe.
 */
export interface Bus3dBrug {
  busModel3d(relatiefPad: string, kleurstelling?: string): Promise<Bus3dAntwoord>
  busLak3d(pakket: string, kleurstelling?: string): Promise<Bus3dLak | { reden: Bus3dReden }>
  busOmgeving3d(): Promise<Bus3dOmgeving>
  busHeldenbeeld(pakket: string, kleurstelling: string | undefined, sleutel: string, webp: ArrayBuffer): Promise<boolean>
  busFotoAlsKlaar(relatiefPad: string, kleurstelling?: string, verhouding?: 'breed' | 'smal'): Promise<string | undefined>
  bus3dMeld(meting: Bus3dMeting): void
  /** Het venster kan een pakket niet lezen: main vergeet het (`bus:stuk3d`). */
  bus3dStuk(pakket: string): void
  opBus3dVoortgang(luister: (v: Bus3dVoortgang) => void): () => void
  opBus3dVervangen(luister: (pakket: string) => void): () => void

  // ---- het venster eromheen (F2, tweede helft; main/bus3dvenster.ts)
  /** De vraag waarmee het venster opende (`bus3d:vraag`); niets als main dit venster niet kent. */
  vraag(): Promise<Bus3dVensterVraag | undefined>
  /** Een nieuwe bus of een nieuw doel in hetzelfde venster. */
  opVraag(luister: (v: Bus3dVensterVraag) => void): () => void
  /** Taal en thema: bij het openen in de vraag, daarna bij elke wissel. */
  opInstellingen(luister: (i: Bus3dVensterInstellingen) => void): () => void
  /** Pauze en lichte stand (§9), door main bepaald uit de vensters en OMSI. */
  opStand(luister: (s: Bus3dVensterStand) => void): () => void
  /** [Kiezen]: main toetst afzender en volgnummer en geeft het door aan het hoofdvenster. */
  kies(keuze: Bus3dKeuze): void
  /** Dicht zonder keuze (Esc, Ctrl+W, [Sluiten]). */
  sluit(): void
  /** Het eerste plaatje (heldenbeeld, foto of icoon) staat: main mag het venster tonen. */
  getoond(): void
  busKleurstellingen(relatiefPad: string): Promise<Bus3dKleurlijst | undefined>
  /** Drie kleuren per kleurstelling; wat al klaar is meteen, de rest via `opKleurstalen`. */
  busKleurstalen(relatiefPad: string): Promise<Bus3dStalen>
  opKleurstalen(luister: (relatiefPad: string, stalen: Bus3dStalen) => void): () => void

  // ---- het fotovenster (foto v4, §4.5, §9): alleen als main deze pagina als fotovenster laadde
  opFotoVraag(luister: (v: Bus3dFotoVraag) => void): () => void
  /** Het fotovenster luistert: pas daarna stuurt main fotovragen (dit deel laadt na de pagina). */
  fotoGereed(): void
  fotoKlaar(id: number, uitkomst: { webp: ArrayBuffer } | { reden: string }): void
}

/** De lijst met kleurstellingen, zoals de buskeuze hem ook krijgt (`BusKleurstellingen` in api.ts). */
export interface Bus3dKleurlijst {
  variabele: string
  lijst: Array<{ index: number; naam: string; setvars: Record<string, number> }>
}

/** Per kleurstelling drie kleuren (#rrggbb), de meest voorkomende eerst (§7). */
export type Bus3dStalen = Record<string, [string, string, string]>

/** Wat main het venster laat weten over pauzeren en de lichte stand (§9). */
export interface Bus3dVensterStand {
  /** Verborgen of geminimaliseerd, of OMSI draait en geen van onze vensters had 60 s focus. */
  pauze: boolean
  /** OMSI draait: DPR 1, budget 96 MB, geen draaiplateau en geen heldenbeeld. */
  licht: boolean
  reden?: 'verborgen' | 'omsi-zonder-focus'
}

export interface Bus3dVensterInstellingen {
  taal: string
  thema: 'systeem' | 'licht' | 'donker'
  /** Minder beweging (instelling `animaties`, of Windows): geen draaiplateau. */
  rustig?: boolean
}

/** Een foto v4 (§9): 640x400, doorzichtig, 215°/8°, op 88% van de breedte. */
export interface Bus3dFotoVraag {
  id: number
  relatiefPad: string
  kleurstelling?: string
  b: number
  h: number
  licht?: boolean
}

export interface Bus3dMeting {
  pakket: string
  bron: 'cache' | 'nieuw'
  eersteBeeldMs: number
  scherpMs: number
  p50: number
  p95: number
  gpuBytes: number
  dpr: number
  driehoeken: number
  texturenMB: number
}

/** Het 3D-venster (§8.1). */
export type Bus3dDoel = 'buskeuze' | 'dealer' | 'wagenpark'
export interface Bus3dVensterVraag {
  /** Volgnummer van main; een keuze met een ouder nummer telt niet. */
  aanvraag: number
  doel: Bus3dDoel
  relatiefPad: string
  /** In beeld bij het openen; undefined = Standaard. */
  kleurstelling?: string
  /** Wat nu in de buskeuze of bij de dealer staat (het vinkje); null = Standaard. */
  gekozen?: string | null
  /** "MAN Lion's City 12C E6"; in het wagenpark "Bus 107 · MAN SD200". */
  titel: string
  /** Merk, type en uitvoering zoals de tegels ze tonen: het zijpaneel heeft ze vóór het manifest er is. */
  naam?: [string, string, string]
  /** De vorm voor het icoon als er geen foto en geen 3D is. */
  vorm?: 'solo' | 'geleed' | 'dubbel' | 'midi'
  /** Het heldenbeeld of de foto van de tegel, door main al opgezocht: nooit een leeg kader (§0.9). */
  foto?: string
  vloot?: { nummer: string; kenteken?: string }
  /** Taal en thema van het hoofdvenster op het moment van openen. */
  instellingen?: Bus3dVensterInstellingen
  /** Pauze en lichte stand op het moment van openen. */
  stand?: Bus3dVensterStand
}

/** Wat het hoofdvenster vraagt (`bus3dOpen`): main zet er het volgnummer, de foto en de instellingen bij. */
export type Bus3dOpenVraag = Omit<Bus3dVensterVraag, 'aanvraag' | 'foto' | 'instellingen' | 'stand'>

/** Wat het hoofdvenster over het 3D-venster hoort (`bus3d:venster`): de gevulde 3D-knop en bv.windowFailed. */
export interface Bus3dVensterMelding {
  open: boolean
  relatiefPad?: string
  kleurstelling?: string
  doel?: Bus3dDoel
  aanvraag?: number
  gecrasht?: boolean
}
export interface Bus3dKeuze {
  aanvraag: number
  doel: Bus3dDoel
  relatiefPad: string
  kleurstelling?: string
}

/**
 * De beschrijving in de taal van de app (§5.1): nl → ENG → DEU; en → ENG;
 * de → DEU (of die van de .bus); fr → FRA → ENG. Hooguit `grens` tekens.
 */
export function beschrijvingVoor(manifest: Bus3dManifest, taal: string, grens = 600): string | undefined {
  const b = manifest.beschrijvingen ?? {}
  const volgorde: Record<string, string[]> = {
    nl: ['NLD', 'ENG', 'DEU'],
    en: ['ENG', 'DEU'],
    de: ['DEU'],
    fr: ['FRA', 'ENG', 'DEU']
  }
  let tekst: string | undefined
  for (const code of volgorde[taal] ?? ['ENG', 'DEU']) {
    tekst = b[code] ?? (code === 'DEU' ? manifest.beschrijving : undefined)
    if (tekst) break
  }
  tekst ??= manifest.beschrijving
  if (!tekst) return undefined
  return tekst.length > grens ? `${tekst.slice(0, grens - 1).trimEnd()}…` : tekst
}

/**
 * De omgeving "Buiten" (§5.6): de hemel uit `[sky_textures]` van envir.cfg
 * (overdag de eerste) en de wolken van het weer "Cumulus 1" uit
 * Weather/clouds.cfg, als texturen op id zoals die van de bus. Ontbreekt er
 * iets, dan tekent de renderer een eigen verloop.
 */
export interface Bus3dOmgeving {
  hemel?: Bus3dTextuur
  wolken?: Bus3dTextuur
  /** Hoeveel meter één herhaling van de wolkentextuur beslaat (clouds.cfg). */
  wolkMaat: number
}

/** De sleutel van een `[matl_change]`-keuze in `Bus3dLak.items`. */
export function itemSleutel(vermelding: number, materiaal: number): number {
  return vermelding * 4096 + materiaal
}

/**
 * De sleutel van een heldenbeeld (§9): verhoudingsklasse (breed vanaf 1,45),
 * DPR-klasse en omgeving. Het thema hoort er niet bij: Buiten hangt er niet van af.
 */
export function heldenSleutel(verhouding: number, dpr: number): string {
  const klasse = verhouding >= 1.45 ? 'breed' : 'smal'
  const scherpte = dpr >= 1.75 ? 'd2' : dpr >= 1.25 ? 'd15' : 'd1'
  return `${klasse}-${scherpte}-buiten-vast`
}

// ------------------------------------------------------------ de ruststand (§5.2)

/**
 * De standaardwaarden die de motor zet vóór `{init}` (idee uit openOMSI,
 * vehicle.rs:831-892). Namen in kleine letters: OMSI kijkt niet naar
 * hoofdletters.
 */
export const MOTORSTANDAARD: Readonly<Record<string, number>> = {
  envir_brightness: 1,
  giventicket: -1,
  wearlifespan: 1,
  dirt_norm: 0,
  dirtrate: 0,
  preciprate: 0,
  streetcond: 0,
  axle_springfactor_0_l: 1,
  axle_springfactor_0_r: 1,
  axle_springfactor_1_l: 1,
  axle_springfactor_1_r: 1,
  axle_springfactor_2_l: 1,
  axle_springfactor_2_r: 1
}

/** Wat de regels per deel (voorwagen, aanhanger) weten, met namen in kleine letters. */
export interface RustDeel {
  /** `kleurVars`: de CTC-index plus de setvars van de kleurstelling van dit deel. */
  kleurVars: Record<string, number>
  /**
   * Wat deze kleurstelling (of Standaard) NIET zet, maar de meeste kleurstellingen
   * van dit model wel: de gewone uitvoering van het model (niet gezet telt als 0).
   * Zonder dit had de O560 bij Standaard geen wielen (`vis_wheels` zet alleen een
   * .cti).
   */
  typisch?: Record<string, number>
  /**
   * Wat de rekenmachine (core/oscrust.ts) ZEKER weet na `{init}`, de vars en
   * `{frame}`. Een naam die ontbreekt is onzeker; dan gelden de regels.
   */
  berekend?: Record<string, number>
  /**
   * Wat de scripts letterlijk zetten in `{init}` en `{frame}` (`startwaardenVan`).
   * Alleen als de rekenmachine niet rekende (`berekend` ontbreekt): wat die
   * onzeker laat, is met een letterlijke waarde uit een {if} ook niet zekerder.
   */
  startwaarden: Record<string, number>
  /** Voor `[alphascale]`: variabelen die een script via een curve uit Envir_Brightness zet, bij daglicht. */
  daglicht: Record<string, number>
}

/** Wat de regels van een vermelding nodig hebben. */
export interface RustVermelding {
  deel: number
  zicht: Array<[string, number]>
  materialen: Array<{ wissel?: { variabele: string; items: unknown[] }; alfaSchaal?: string } | null>
}

/**
 * `[alphascale]` op naam, als geen script en geen curve iets zegt (§5.2): regen,
 * vuil, korrel, dashboardgloed, parasieten, vorst en beslag staan overdag bij
 * droog weer uit. `Szyby*` staat er NIET in: dat is het glas zelf van de
 * Kajosoft-bussen (47 vermeldingen in model_o530_e2_2.cfg).
 */
const ALFA_NUL = [/^rain_/i, /^dirt_/i, /_grain$/i, /^dash_/i, /^para_/i, /^mroz/i, /^beschlag_/i]

/**
 * De ruststand volgens de regels van §5.2, met wat de rekenmachine zeker weet
 * (core/oscrust.ts, tegenlezing F2) voorop. Puur, ook voor de probe.
 *
 * `[visible]` en `[matl_change]`, per variabele, in deze voorrang:
 *  1. wat de rekenmachine zeker weet (die rekent al met kleurVars, de gewone
 *     uitvoering en de motor; een variabele die geen script zet is daar 0,
 *     zoals in OMSI);
 *  2. `kleurVars` (die wint van wat `{init}` letterlijk toekent, zoals in het
 *     spel), dan de gewone uitvoering van het model (`typisch`);
 *  3. de startwaarden uit de scripts (alleen als de rekenmachine niet rekende);
 *  4. de alias: bij `vis_<rest>` de waarde van `vis_CTI_<rest>` of `vis_SV_<rest>`
 *     (zo zet de NLC spiegels, deuren en matrix, setvar.osc:510-519);
 *  5. de standaardwaarden van de motor;
 *  6. anders 0, zoals OMSI elke variabele begint -- behalve bij een KEUZE zonder
 *     0-tak (de vermeldingen gebruiken twee of meer waarden en geen 0): dan de
 *     laagste, zodat er iets van dat onderdeel te zien is. Eerst was dit altijd
 *     "de laagste gebruikte waarde", en wordt alleen 1 gebruikt, dan stond het
 *     aan: zonnescherm, fietsendrager, laadkabel, wimpels (beeldbeoordeling F2).
 * Zichtbaar is |waarde - w| < 0,5 (openOMSI; de plugin-afdruk beslist in F3).
 *
 * `[alphascale]`: een curve bij daglicht, dan kleurVars, dan de lijst op naam
 * (0), dan de rekenmachine, de startwaarden en de motor, anders 1.
 */
export function rustRegels(
  vermeldingen: RustVermelding[],
  delen: RustDeel[]
): Pick<Bus3dLak, 'zichtbaar' | 'items' | 'alphascale' | 'onbekend'> {
  // Welke waarden de vermeldingen per (deel, variabele) gebruiken.
  const gebruikt = new Map<string, number[]>()
  const noteer = (d: number, naam: string, w: number): void => {
    const k = `${d}|${naam.toLowerCase()}`
    const lijst = gebruikt.get(k)
    if (lijst) lijst.push(w)
    else gebruikt.set(k, [w])
  }
  for (const v of vermeldingen) {
    for (const [naam, w] of v.zicht) noteer(v.deel, naam, w)
    for (const m of v.materialen) if (m?.wissel) noteer(v.deel, m.wissel.variabele, 0)
  }
  const onbekend = new Set<string>()
  const geheugen = new Map<string, number>()
  const bron = (d: number, naam: string): number | undefined => {
    const deel = delen[d] ?? delen[0]
    if (!deel) return undefined
    return deel.kleurVars[naam] ?? deel.typisch?.[naam] ?? (deel.berekend ? undefined : deel.startwaarden[naam])
  }
  const waarde = (d: number, naamRuw: string): number => {
    const naam = naamRuw.toLowerCase()
    const k = `${d}|${naam}`
    const bekend = geheugen.get(k)
    if (bekend !== undefined) return bekend
    let w = (delen[d] ?? delen[0])?.berekend?.[naam]
    w ??= bron(d, naam)
    if (w === undefined && naam.startsWith('vis_')) {
      const rest = naam.slice(4)
      w = bron(d, `vis_cti_${rest}`) ?? bron(d, `vis_sv_${rest}`)
    }
    w ??= MOTORSTANDAARD[naam]
    if (w === undefined) {
      const lijst = gebruikt.get(k) ?? []
      const verschillend = new Set(lijst)
      w = verschillend.size >= 2 && !verschillend.has(0) ? Math.min(...lijst) : 0
      onbekend.add(naamRuw)
    }
    geheugen.set(k, w)
    return w
  }

  let zichtbaar = ''
  const items: Record<number, number> = {}
  const alphascale: Record<string, number> = {}
  vermeldingen.forEach((v, i) => {
    const zien = v.zicht.every(([naam, w]) => Math.abs(waarde(v.deel, naam) - w) < 0.5)
    zichtbaar += zien ? '1' : '0'
    v.materialen.forEach((m, k) => {
      if (m?.wissel) {
        const w = Math.round(waarde(v.deel, m.wissel.variabele))
        items[itemSleutel(i, k)] = w >= 0 && w <= m.wissel.items.length ? w : 0
      }
      if (m?.alfaSchaal && alphascale[m.alfaSchaal] === undefined) {
        const naam = m.alfaSchaal.toLowerCase()
        const deel = delen[v.deel] ?? delen[0]
        /*
         * De lijst op naam gaat vóór de rekenmachine en de startwaarden: regen,
         * vorst en beslag zet een script juist onder een voorwaarde (Kajosoft:
         * `1 (S.L.mroz)` bij vorst onder -10 graden, cockpit.osc:2410), en het
         * weer van Buiten is droog en zacht.
         */
        const a =
          deel?.daglicht[naam] ??
          deel?.kleurVars[naam] ??
          (ALFA_NUL.some((r) => r.test(naam)) ? 0 : undefined) ??
          deel?.berekend?.[naam] ??
          (deel?.berekend ? undefined : deel?.startwaarden[naam]) ??
          MOTORSTANDAARD[naam] ??
          1
        alphascale[m.alfaSchaal] = Math.max(0, Math.min(1, a))
      }
    })
  })
  return { zichtbaar, items, alphascale, onbekend: [...onbekend].sort() }
}

/** Een id zoals het register ze uitgeeft: 40 kleine hextekens. */
export function isBus3dId(id: string): boolean {
  return typeof id === 'string' && /^[0-9a-f]{40}$/.test(id)
}

// ------------------------------------------------------------ textuurplan

/** De texeldichtheid waar we op mikken: 400 texels per meter (§5.7). */
export const DOEL_DICHTHEID = 400
/** De grootste zijde op de GPU: 4096 voor DXT, 2048 voor RGBA. */
export const KAP_DXT = 4096
export const KAP_RGBA = 2048
/** Onder deze zijde zakt het budget niet verder; haalt het het dan niet, dan is de bus te zwaar. */
export const BUDGET_BODEM = 256

export interface TextuurPlanRegel {
  id: string
  /** Hoeveel mipniveaus bovenaan overgeslagen worden. */
  overslaan: number
  /** Bytes op de GPU, met de mipketen. */
  bytes: number
  /** De zijden na het overslaan. */
  b: number
  h: number
  /** Niet laden: envmap, of niet te zien in de buitenweergave. */
  laden: boolean
}

export interface TextuurPlan {
  regels: TextuurPlanRegel[]
  bytes: number
  /** Past niet, ook niet met alles op `BUDGET_BODEM`. */
  teZwaar: boolean
  /** De carrosserie: de CTC-plek met het grootste buitenoppervlak. */
  carrosserie?: string
}

function blokBytes(t: Bus3dTextuur): number {
  return t.formaat === 'bc1' ? 8 : 16
}

/** Bytes van één niveau op de GPU. */
function niveauBytes(t: Bus3dTextuur, b: number, h: number, rgba: boolean): number {
  if (rgba) return b * h * 4
  return Math.max(1, Math.ceil(b / 4)) * Math.max(1, Math.ceil(h / 4)) * blokBytes(t)
}

/**
 * Hoeveel niveaus er bij een DXT-textuur hooguit overgeslagen mogen worden.
 *
 * Het niveau waarmee we beginnen wordt op de GPU niveau 0, en WebGL weigert een
 * S3TC-niveau 0 waarvan een zijde niet deelbaar is door 4 (INVALID_OPERATION,
 * met `compressedTexImage2D` én met `texStorage2D`; gemeten in Electron 33 op
 * 250x250, 256x186 en 2x2). Een keten van 1000x1000 met daaronder 125x125 of
 * 3x3 mag wel: alleen het begin telt. Dus alleen een k waarbij beide zijden op
 * niveau k deelbaar zijn door 4, en nooit voorbij het laatste niveau in het
 * bestand. Omdat b >> k deelbaar door 4 betekent dat b deelbaar is door 2^(k+2),
 * zijn de toegestane k precies 0 tot en met dit maximum.
 */
export function dxtMaxOverslaan(t: Pick<Bus3dTextuur, 'b' | 'h' | 'mips'>): number {
  let k = 0
  while (k + 1 < t.mips && ((t.b >> (k + 1)) & 3) === 0 && ((t.h >> (k + 1)) & 3) === 0 && t.b >> (k + 1) > 0 && t.h >> (k + 1) > 0) k++
  return k
}

/** Bytes van een textuur vanaf niveau `k`, met de hele mipketen eronder. `s3tc`: kan de GPU DXT zelf aan? */
function bytesVanaf(t: Bus3dTextuur, k: number, s3tc = true): { bytes: number; b: number; h: number } {
  const rgba = t.soort !== 'dxt' || !s3tc
  const b0 = Math.max(1, t.b >> k)
  const h0 = Math.max(1, t.h >> k)
  let bytes = 0
  let b = b0
  let h = h0
  // DXT met mips: de niveaus uit het bestand; al het andere krijgt een volle keten op de GPU.
  const niveaus = t.soort === 'dxt' && s3tc ? Math.max(1, t.mips - k) : Math.floor(Math.log2(Math.max(b0, h0))) + 1
  for (let i = 0; i < niveaus; i++) {
    bytes += niveauBytes(t, b, h, rgba)
    b = Math.max(1, b >> 1)
    h = Math.max(1, h >> 1)
  }
  return { bytes, b: b0, h: h0 }
}

/**
 * Doelmaat en budget per textuur (§5.7), puur.
 *
 * - De maat komt uit de texeldichtheid: d0 = √(U·b·h / A) texels per meter, met
 *   A het buitenoppervlak (m²) en U het UV-oppervlak. Overslaan:
 *   k = max(0, ⌊log2(d0 / 400)⌋), en daarna tot de kap (4096 DXT, 2048 RGBA).
 * - Zolang het totaal boven het budget zit, zakt de textuur met de meeste bytes
 *   per m² buitenoppervlak één niveau. De carrosserie (de CTC-plek met het
 *   grootste buitenoppervlak) zakt als laatste.
 * - Niet laden: envmaps (de omgevingskaart komt uit onze eigen omgeving) en wat
 *   buiten niet te zien is (A = 0).
 * - Zonder S3TC (`s3tc: false`) pakt het venster DXT uit naar RGBA: dan telt DXT
 *   als RGBA, met de kap van 2048 en zonder de grens van `dxtMaxOverslaan` (dat
 *   is een grens van gecomprimeerd uploaden). Eerst rekende het plan ook dan
 *   gecomprimeerd, en kwam de O560 op 254 MB texturen tegen 89 MB in het plan
 *   (aanvalsverslag F2, punt 6).
 */
export function textuurPlan(texturen: Bus3dTextuur[], budgetBytes: number, opties: { s3tc?: boolean } = {}): TextuurPlan {
  const s3tc = opties.s3tc !== false
  let carrosserie: Bus3dTextuur | undefined
  for (const t of texturen) {
    if (t.ctc && t.oppervlak > (carrosserie?.oppervlak ?? 0)) carrosserie = t
  }
  const regels: TextuurPlanRegel[] = []
  const stappen: number[] = []
  for (const t of texturen) {
    const laden = !t.envmap && t.oppervlak > 0 && t.b > 0 && t.h > 0
    if (!laden) {
      regels.push({ id: t.id, overslaan: 0, bytes: 0, b: 0, h: 0, laden: false })
      stappen.push(0)
      continue
    }
    const d0 = Math.sqrt((Math.max(t.uv, 1e-9) * t.b * t.h) / t.oppervlak)
    let k = Math.max(0, Math.floor(Math.log2(d0 / DOEL_DICHTHEID)))
    const dxt = t.soort === 'dxt' && s3tc
    const kap = dxt ? KAP_DXT : KAP_RGBA
    while (Math.max(t.b >> k, t.h >> k) > kap) k++
    // Nooit meer overslaan dan het bestand niveaus heeft en WebGL als begin
    // aanneemt (DXT, zie dxtMaxOverslaan), of dan er zijde is.
    const maxK = dxt ? dxtMaxOverslaan(t) : Math.floor(Math.log2(Math.max(t.b, t.h)))
    k = Math.min(k, maxK)
    const r = bytesVanaf(t, k, s3tc)
    regels.push({ id: t.id, overslaan: k, bytes: r.bytes, b: r.b, h: r.h, laden: true })
    stappen.push(k)
  }
  let totaal = regels.reduce((s, r) => s + r.bytes, 0)
  let teZwaar = false
  while (totaal > budgetBytes) {
    // De zwaarste per m² die nog kan zakken; de carrosserie pas als niets anders meer kan.
    let beste = -1
    let besteWaarde = -1
    for (const kandidaatCarrosserie of [false, true]) {
      for (let i = 0; i < texturen.length; i++) {
        const t = texturen[i]
        const r = regels[i]
        if (!r.laden) continue
        if ((t === carrosserie) !== kandidaatCarrosserie) continue
        if (Math.max(r.b, r.h) <= BUDGET_BODEM) continue
        if (t.soort === 'dxt' && s3tc && stappen[i] + 1 > dxtMaxOverslaan(t)) continue
        const waarde = r.bytes / Math.max(t.oppervlak, 1e-6)
        if (waarde > besteWaarde) {
          besteWaarde = waarde
          beste = i
        }
      }
      if (beste >= 0) break
    }
    if (beste < 0) {
      teZwaar = true
      break
    }
    stappen[beste]++
    const r = bytesVanaf(texturen[beste], stappen[beste], s3tc)
    totaal += r.bytes - regels[beste].bytes
    regels[beste] = { ...regels[beste], overslaan: stappen[beste], bytes: r.bytes, b: r.b, h: r.h }
  }
  return { regels, bytes: totaal, teZwaar, carrosserie: carrosserie?.ctc }
}
