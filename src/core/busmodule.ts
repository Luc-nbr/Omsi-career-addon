import { dirname } from 'node:path'
import { readOmsiLines } from './omsiFile'
import { modelcfgVanBus, schermvakVan, type Schermvak } from './busscherm'
import { dozenVanOnderdelen, indelingVan, schermplekkenVan, type Doos } from './busvorm'
import type { Paneel, Profielknop } from './busprofiel'

/**
 * De apparaten van een bus, door de app zelf samengesteld uit het model.
 *
 * WAAROM DIT KAN
 * Een `model.cfg` beschrijft de bus onderdeel voor onderdeel, en bij elk
 * onderdeel staat wat erop zit:
 *
 *   [mesh]              17_almex_s_hst1.o3d
 *   [useTextTexture]    25       -> het 26e `[texttexture]`-blok van dit bestand
 *                                   wordt op dit onderdeel getekend
 *   [visible]           almex_vis_hst1    -> en dit zet het aan
 *   1
 *   [mesh]              17_almex_clickN7.o3d
 *   [mouseevent]        almex_clickN7     -> hierop klik je, en dit hoort het
 *                                            busscript
 *
 * Daarmee ligt alles er al in: welke schermpjes bij elkaar horen, welke knoppen
 * erbij horen, en hoe die knoppen heten. Waar ze op het apparaat liggen staat er
 * niet bij, maar wel in de `.o3d`-bestanden ernaast -- zie core/busvorm.ts.
 *
 * Nagemeten in O550_Euro3.cfg en in model_17_solo.cfg: `[useTextTexture]` telt
 * vanaf NUL. In de Setra zitten de vijf schermpjes van de AFR 200 op
 * `AFR200\O550_AFR200_Body`, in de Hamburgse bus draagt elk van de tweeentwintig
 * schermpjes van de ALMEX zijn eigen onderdeel.
 *
 * Zo hoeft er voor een bus niets met de hand: de app stelt zijn module zelf
 * samen. Staat er in core/busprofiel.ts een uitgewerkt profiel voor deze bus,
 * dan gaat dat voor.
 */

/** Een knop, zoals het model hem beschrijft. */
export interface Moduleknop {
  /** De naam waar het busscript op luistert; ook de naam in `keyboard.cfg`. */
  actie: string
  /** Het onderdeel waar hij aan hangt. */
  onderdeel: string
  /** Wat erop staat, afgeleid uit de naam van de handeling. */
  opschrift: string
  /** Een cijfertoets; het cijfer zelf. */
  cijfer?: number
  /** Waar zijn onderdeel in de bus ligt, als de o3d te lezen was. */
  doos?: Doos
}

/** Een schermvak van een apparaat: het vak zelf, en waar het ligt. */
export interface Modulevak {
  vak: Schermvak
  onderdeel: string
  /**
   * Een vak dat op een knop zit: de acht verkooptegels van een ALMEX zijn
   * allebei -- er staat tekst in en je kunt erop tikken.
   */
  actie?: string
}

/** Een apparaat in de bus: zijn schermvakken en zijn knoppen. */
export interface Busmodule {
  /** De sleutel waaronder het apparaat onthouden wordt: `afr200`, `/almex`. */
  id: string
  /** Wat er boven komt te staan. */
  naam: string
  vakken: Modulevak[]
  knoppen: Moduleknop[]
  /** De stringvariabelen die dit apparaat vult; dit vraagt de app aan de plugin. */
  variabelen: string[]
  /**
   * Het scherm zoals het in de bus zit: elk vak op zijn eigen plek.
   *
   * Alleen als er genoeg van te meten viel. Anders blijft het bij de regels
   * onder elkaar, zoals het voor elke bus al ging.
   */
  scherm?: Schermvlak
}

/** Eén vak op het scherm van een apparaat, in delen van dat scherm. */
export interface Schermveld {
  /** Waar de tekst vandaan komt; leeg bij een knop die alleen een opschrift heeft. */
  variabele?: string
  /** Aantikbaar: de verkooptegels van een ALMEX zijn knop en scherm in één. */
  actie?: string
  /** Wat erop staat als het geen tekst uit de bus is. */
  opschrift?: string
  links: number
  breedte: number
  boven: number
  hoogte: number
  tekstkleur: string
  achtergrond: string
  uitlijning: Schermvak['uitlijning']
}

/** Het scherm van een apparaat: zijn vakken, en hoe breed het is ten opzichte van hoog. */
export interface Schermvlak {
  verhouding: number
  velden: Schermveld[]
}

/*
 * Woorden die in een naam staan maar niets over het apparaat zeggen.
 *
 * `Bedienteil` is het paneel zelf, `Taste` en `Num` zeggen alleen dat het een
 * toets is, `Clickspot` dat het een klikvlak is, en `Panel`, `CP` en `Generic`
 * staan in het ene model boven elk onderdeel en in het andere boven geen enkel.
 * Deze lijst wordt op twee plekken gebruikt: voor het OPSCHRIFT van een knop, en
 * voor het bepalen van het apparaat waar een onderdeel bij hoort.
 */
const GENERIEK = new Set(
  (
    'taste tasten tast num numpad button buttons btn knopf knoepfe switch sw key keys ' +
    'bedienteil bedienpult panel pult dash dashboard cp cockpit generic misc model mesh obj ' +
    'body display displays screen textfeld textfelder text anzeige clickspot klickspot ' +
    'click klick spot var lod solo main trail teil part dummy overlay ghost low high ' +
    'neu alt links rechts oben unten vorne hinten front heck seite mitte innen aussen ' +
    'ticket setmode set mov move toggle push mouse ticketprinter'
  ).split(' ')
)

/** Duitse klanken zoals een addonbouwer ze zonder trema schrijft. */
const KLANKEN: [RegExp, string][] = [
  [/^ausloesung$/i, 'AUSLÖSUNG'],
  [/^ausloesen$/i, 'AUSLÖSEN'],
  [/^loeschen$/i, 'LÖSCHEN'],
  [/^rueck$/i, 'RÜCK'],
  [/^zurueck$/i, 'ZURÜCK'],
  [/^ueber$/i, 'ÜBER'],
  [/^pfeil$/i, '▶'],
  [/^enter$/i, 'ENTER'],
  [/^geld$/i, 'GELD'],
  [/^fahrschein$/i, 'FAHRSCHEIN'],
  [/^haltestelle$/i, 'HALTE'],
  [/^hst$/i, 'HALTE']
]

/**
 * De ALMEX, met de namen die de scriptschrijver zelf aan zijn toetsen geeft.
 *
 * Die opschriften staan nergens als tekst in de bus: ze zijn in de
 * achtergrondplaatjes van het scherm geschilderd (`17_almex_s_<menu>.jpg`) en
 * wisselen per menu. Wat hier staat komt uit de commentaarregels van het
 * busscript zelf (`Script\17_ticketprinter_almex.osc`): U1 Weiterschaltung, U2
 * Zurueckschaltung, U3 Storno, U4 Pause, U5 Hauptmenue, U6 Zurueck/OK, U7 FIMS,
 * NC "Klickfeld Korrektur (C)", NB "Klickfeld Bestaetigen / Bar / OK".
 *
 * Deze ene tabel scheelt veel: de ALMEX zit in vier Hamburgse bussen, en zonder
 * hem heten zijn knoppen CLICKN7 en CLICKU3.
 */
const ALMEX: [RegExp, string][] = [
  [/_clickn([0-9])$/i, '$1'],
  [/_clicknc$/i, 'C'],
  [/_clicknb$/i, 'OK'],
  [/_clicku1$/i, '▲'],
  [/_clicku2$/i, '▼'],
  [/_clicku3$/i, 'STORNO'],
  [/_clicku4$/i, 'PAUSE'],
  [/_clicku5$/i, 'MENÜ'],
  [/_clicku6$/i, 'ZURÜCK'],
  [/_clicku7$/i, 'FIMS']
]

/** De woorden van een naam, klein en zonder bestandsextensie. */
function woordenVan(naam: string): string[] {
  return naam
    .replace(/\.o3d$/i, '')
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((woord) => woord.toLowerCase())
}

/** Een woord dat niets zegt: te kort, een getal, of uit `GENERIEK`. */
function niksWoord(woord: string, ruis: Set<string>): boolean {
  return woord.length < 2 || /^\d+$/.test(woord) || GENERIEK.has(woord) || ruis.has(woord)
}

/** Het eerste woord dat wel iets zegt. */
function eersteWoord(naam: string, ruis: Set<string>): string {
  for (const woord of woordenVan(naam)) if (!niksWoord(woord, ruis)) return woord
  return ''
}

/**
 * De woorden die in DEZE bus overal voorstaan.
 *
 * Bij de Setra staat `O550_` voor alles, bij de Hamburgse bus `17_`. Dat zegt
 * niets over het apparaat. Een woord hoort erbij als het in minstens vier van de
 * tien bestandsnamen vooropstaat -- en dan ook zijn afkortingen: naast `SD82`
 * staat in de MAN SD 200 ook `SD_IBIS_1` en `SD_Thermometer`, en zonder die
 * tweede helft blijven die twee op één hoop.
 */
function ruiswoorden(onderdelen: string[]): Set<string> {
  const tel = new Map<string, number>()
  for (const onderdeel of onderdelen) {
    const eerste = woordenVan(onderdeel.split(/[\\/]+/).pop() ?? '')[0]
    if (eerste) tel.set(eerste, (tel.get(eerste) ?? 0) + 1)
  }
  const ruis = new Set<string>()
  const grens = Math.max(2, onderdelen.length * 0.4)
  for (const [woord, aantal] of tel) if (aantal >= grens) ruis.add(woord)
  /* En elk beginstuk daarvan van twee letters of meer. */
  for (const woord of [...ruis]) {
    for (let n = 2; n < woord.length; n++) ruis.add(woord.slice(0, n))
  }
  return ruis
}

/**
 * De map waar dit onderdeel bij hoort: de BUITENSTE map met een bruikbaar woord.
 *
 * Buitenste, niet binnenste: de HOH MAN A20 zet zijn kaartautomaat per
 * menupagina in een eigen ondermap (`Drucker\Numpad\`, `Drucker\Kasse\`), en met
 * de binnenste map werd dat zesentwintig losse apparaatjes. Zo wordt het er weer
 * één. Bij `IBISPlus\Clickspot\` levert het `ibisplus` in plaats van `clickspot`.
 */
function mapVan(onderdeel: string, ruis: Set<string>): string {
  const delen = onderdeel.split(/[\\/]+/).filter(Boolean)
  for (let i = 0; i < delen.length - 1; i++) {
    const woord = eersteWoord(delen[i], ruis)
    if (woord) return woord
  }
  return ''
}

/*
 * Handelingen die bij een apparaat horen.
 *
 * In dezelfde map staat meer dan het apparaat: de deuren, de ruitenwissers, de
 * stoelen. Wat bij een apparaat hoort is te zien aan de naam waar het busscript
 * op luistert -- die is bij elke addon hetzelfde soort naam, want het spel moet
 * hem doorgeven.
 */
const IS_APPARAAT =
  /ibis|ticketprinter|ticket_printer|lawo|matrix|annax|rollband|almex|atron|efad|kasse|kasownik|cashdesk|cashlever|drucker|fahrschein|setmode|zielcode|linie|kurs|vdv|rbl|actia|bordcomputer/i

/** Alles wat aan één onderdeel van het model hangt. */
interface Onderdeel {
  pad: string
  vakken: number[]
  acties: string[]
  zichtbaar?: string
}

/** Het model uitgekleed tot de onderdelen en de schermvakken. */
function leesModel(modelcfg: string): { vakken: (Schermvak | undefined)[]; onderdelen: Onderdeel[] } {
  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return { vakken: [], onderdelen: [] }
  }

  /* Eerst alle schermvakken op volgorde: `[useTextTexture]` telt in deze lijst. */
  const vakken: (Schermvak | undefined)[] = []
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop !== '[texttexture]' && kop !== '[texttexture_enh]') continue
    vakken.push(schermvakVan(regels, i, kop === '[texttexture_enh]'))
  }

  const onderdelen: Onderdeel[] = []
  let nu: Onderdeel | undefined
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop === '[mesh]') {
      const pad = (regels[i + 1] ?? '').trim()
      nu = pad ? { pad, vakken: [], acties: [] } : undefined
      if (nu) onderdelen.push(nu)
      continue
    }
    if (!nu) continue
    if (kop === '[usetexttexture]') {
      const nummer = Number((regels[i + 1] ?? '').trim())
      if (Number.isInteger(nummer) && nummer >= 0 && nummer < vakken.length && !nu.vakken.includes(nummer)) {
        nu.vakken.push(nummer)
      }
      continue
    }
    if (kop === '[mouseevent]') {
      const actie = (regels[i + 1] ?? '').trim()
      if (actie && !nu.acties.includes(actie)) nu.acties.push(actie)
      continue
    }
    if (kop === '[visible]') {
      const naam = (regels[i + 1] ?? '').trim()
      if (naam && !nu.zichtbaar) nu.zichtbaar = naam
    }
  }
  return { vakken, onderdelen }
}

/** Een groep in de maak. */
interface Groep {
  map: string
  stam: string
  vakken: { nummer: number; onderdeel: string; actie?: string }[]
  knoppen: { actie: string; onderdeel: string }[]
}

/** Of een groep in zijn eentje iets voorstelt; anders hoort hij ergens bij. */
function steltIetsVoor(groep: Groep): boolean {
  return groep.vakken.length > 0 || groep.knoppen.length >= 3
}

/**
 * De apparaten van deze bus, uit zijn model.
 *
 * DE SLEUTEL: MAP + EERSTE BRUIKBARE WOORD
 * Het eerste woord van de bestandsnaam dat iets zegt, binnen de buitenste map
 * die iets zegt. `O550_AFR200_Num_7` hoort bij `afr200`, `O550_Zahltisch_Schublade`
 * bij `zahltisch`, ook al liggen ze in dezelfde map -- en `17_almex_clickN7`,
 * `17_almex_s_hst1` en `21_almex_clickN7` allemaal bij `almex`, hoe de bouwer zijn
 * onderdelen ook nummert.
 *
 * Zegt de bestandsnaam niets -- `SD82\SD82_panel.o3d`, met alleen het buswoord en
 * "panel" -- dan wordt er gekeken naar wat er OP het onderdeel zit: de handeling,
 * de variabele van het schermvak, en als laatste de variabele die het onderdeel
 * aan- en uitzet (`[visible] almex_vis_hst1`). Zo komt het IBIS-schermpje van de
 * SD 200 bij zijn eigen toetsen te staan in plaats van los ernaast.
 *
 * DAARNA TWEE KEER OPRUIMEN
 * Een map wordt alleen in stukken gehakt als er minstens twee stukken zijn die
 * zelf iets voorstellen. Anders is het één apparaat waarvan de bouwer elk knopje
 * een eigen naam gaf -- de dertien knoppen in `Fahrscheindrucker\` van de Iveco.
 * En groepjes die niets voorstellen gaan bij elkaar op de stam van hun handeling:
 * de twaalf muntbakjes `cashlever005` tot `cashlever8` van de VHH zijn samen één
 * geldlade.
 */
export function modulesVanModel(modelcfg: string): Busmodule[] {
  const { vakken, onderdelen } = leesModel(modelcfg)
  if (onderdelen.length === 0) return []
  const ruis = ruiswoorden(onderdelen.map((o) => o.pad))

  const stamVan = (o: Onderdeel): string => {
    const uitNaam = eersteWoord(o.pad.split(/[\\/]+/).pop() ?? '', ruis)
    if (uitNaam) return uitNaam
    for (const actie of o.acties) {
      const woord = eersteWoord(actie, ruis)
      if (woord) return woord
    }
    for (const nummer of o.vakken) {
      const woord = eersteWoord(vakken[nummer]?.variabele ?? '', ruis)
      if (woord) return woord
    }
    return eersteWoord(o.zichtbaar ?? '', ruis)
  }

  const groepen = new Map<string, Groep>()
  const pak = (map: string, stam: string): Groep => {
    const sleutel = `${map}/${stam}`
    let groep = groepen.get(sleutel)
    if (!groep) {
      groep = { map, stam, vakken: [], knoppen: [] }
      groepen.set(sleutel, groep)
    }
    return groep
  }

  for (const o of onderdelen) {
    const acties = o.acties.filter((actie) => IS_APPARAAT.test(actie))
    if (o.vakken.length === 0 && acties.length === 0) continue
    const groep = pak(mapVan(o.pad, ruis), stamVan(o))
    /*
     * Een onderdeel met tekst EN een handeling is een toets met een opschrift dat
     * de bus zelf schrijft: de acht verkooptegels van een ALMEX. Die horen als
     * knop op het scherm, niet als losse regel eronder.
     */
    for (const nummer of o.vakken) {
      if (!vakken[nummer]) continue
      groep.vakken.push({ nummer, onderdeel: o.pad, actie: acties[0] })
    }
    for (const actie of acties) {
      if (!groep.knoppen.some((knop) => knop.actie === actie)) {
        groep.knoppen.push({ actie, onderdeel: o.pad })
      }
    }
  }

  /* Een map met maar één zinnig stuk erin is één apparaat. */
  const perMap = new Map<string, Groep[]>()
  for (const groep of groepen.values()) {
    if (!groep.map) continue
    const lijst = perMap.get(groep.map) ?? []
    lijst.push(groep)
    perMap.set(groep.map, lijst)
  }
  for (const [map, lijst] of perMap) {
    if (lijst.length < 2 || lijst.filter(steltIetsVoor).length >= 2) continue
    const samen = pak(map, '')
    for (const groep of lijst) {
      if (groep === samen) continue
      samen.vakken.push(...groep.vakken)
      for (const knop of groep.knoppen) {
        if (!samen.knoppen.some((eerder) => eerder.actie === knop.actie)) samen.knoppen.push(knop)
      }
      groepen.delete(`${groep.map}/${groep.stam}`)
    }
  }

  /* Wat in zijn eentje niets voorstelt, bij elkaar op de stam van de handeling. */
  for (const [sleutel, groep] of [...groepen]) {
    if (steltIetsVoor(groep) || groep.knoppen.length === 0) continue
    const stam = eersteWoord(groep.knoppen[0].actie, new Set())
    if (!stam || stam === groep.stam) continue
    const samen = pak(groep.map, `~${stam}`)
    if (samen === groep) continue
    samen.vakken.push(...groep.vakken)
    for (const knop of groep.knoppen) {
      if (!samen.knoppen.some((eerder) => eerder.actie === knop.actie)) samen.knoppen.push(knop)
    }
    groepen.delete(sleutel)
  }

  /*
   * Knoppen die los van hun schermpje liggen.
   *
   * Niet elke bouwer legt het toetsenbord bij het scherm. Dan brengt de naam van
   * de handeling ze bij elkaar: `IBIS_setmode_linie_kurs` hoort bij een apparaat
   * waarvan de schermvakken ook met `IBIS` beginnen. Alleen bij een duidelijke
   * winnaar; bij twijfel liever weg dan bij het verkeerde apparaat.
   */
  const woordVan = (naam: string): string => naam.split(/[_\s-]+/)[0]?.toLowerCase() ?? ''
  const metVak = [...groepen.values()].filter((groep) => groep.vakken.length > 0)
  for (const groep of groepen.values()) {
    if (groep.vakken.length > 0 || groep.knoppen.length === 0) continue
    const woorden = new Set(groep.knoppen.map((knop) => woordVan(knop.actie)))
    const past = metVak
      .map((doel) => ({
        doel,
        raak: doel.vakken.filter((vak) => woorden.has(woordVan(vakken[vak.nummer]?.variabele ?? '')))
          .length
      }))
      .filter((rij) => rij.raak > 0)
      .sort((a, b) => b.raak - a.raak)
    if (past.length === 0 || (past.length > 1 && past[0].raak === past[1].raak)) continue
    for (const knop of groep.knoppen) {
      if (!past[0].doel.knoppen.some((eerder) => eerder.actie === knop.actie)) {
        past[0].doel.knoppen.push(knop)
      }
    }
    groep.knoppen = []
  }

  /*
   * En dan opmaken. Alleen groepen die een apparaat kunnen zijn: een schermvak,
   * of genoeg knoppen om een bedieningspaneel te zijn. De nieuwste bussen tekenen
   * hun boordcomputer met een `[scripttexture]` -- het busscript schildert de
   * beeldpunten zelf en er valt geen tekst te lezen -- maar de knoppen zijn er
   * wel, en daarmee is het apparaat op de tablet nog te bedienen. Zes knoppen als
   * ondergrens, anders is het een schakelaar op het dashboard.
   */
  const modelmap = dirname(modelcfg)
  const modules: Busmodule[] = []
  for (const [sleutel, groep] of groepen) {
    if (groep.vakken.length === 0 && groep.knoppen.length < 6) continue

    /* Waar alles ligt. Alleen de onderdelen van dit apparaat worden gelezen. */
    const paden = [
      ...new Set([...groep.vakken.map((v) => v.onderdeel), ...groep.knoppen.map((k) => k.onderdeel)])
    ]
    const dozen = dozenVanOnderdelen(modelmap, paden)

    const gezien = new Set<string>()
    const vakkenUit: Modulevak[] = []
    for (const vak of groep.vakken) {
      const schermvak = vakken[vak.nummer]
      if (!schermvak || gezien.has(schermvak.variabele)) continue
      gezien.add(schermvak.variabele)
      vakkenUit.push({ vak: schermvak, onderdeel: vak.onderdeel, actie: vak.actie })
    }

    /*
     * Waar de handelingen van dit apparaat mee beginnen.
     *
     * Dat is niet altijd het woord waar de groep naar heet: de AFR 200 van de
     * Setra heet naar zijn onderdelen (`O550_AFR200_Num_7`) maar zijn knoppen
     * heten `IBIS_7` en `ticketprinter_enter`. Wat er bij minstens twee
     * handelingen vooraan staat is een voorvoegsel en geen opschrift, en gaat
     * eraf -- anders staat er "IBIS 7" op de toets 7.
     */
    const voorop = new Map<string, number>()
    for (const knop of groep.knoppen) {
      const woorden = knop.actie.split(/[_\s-]+/).filter(Boolean)
      if (woorden.length < 2) continue
      const eerste = woorden[0].toLowerCase()
      voorop.set(eerste, (voorop.get(eerste) ?? 0) + 1)
    }
    const voorvoegsels = new Set([groep.stam])
    for (const [woord, aantal] of voorop) if (aantal >= 2) voorvoegsels.add(woord)

    const knoppenUit: Moduleknop[] = groep.knoppen.map((knop) => {
      const opschrift = opschriftVan(knop.actie, voorvoegsels, knop.onderdeel, ruis)
      return {
        actie: knop.actie,
        onderdeel: knop.onderdeel,
        opschrift,
        cijfer: /^\d$/.test(opschrift) ? Number(opschrift) : undefined,
        doos: dozen.get(knop.onderdeel)
      }
    })

    modules.push({
      id: sleutel,
      naam: naamVan(sleutel, vakkenUit),
      vakken: vakkenUit,
      knoppen: knoppenUit,
      variabelen: vakkenUit.map((vak) => vak.vak.variabele),
      scherm: schermVan(vakkenUit, knoppenUit, dozen)
    })
  }
  /* Een apparaat waar je iets mee kunt eerst; de rest is meetlat en klok. */
  return modules.sort((a, b) => (b.knoppen.length > 0 ? 1 : 0) - (a.knoppen.length > 0 ? 1 : 0))
}

/**
 * Het opschrift van een knop, uit de naam van zijn handeling.
 *
 * De handeling is wat het busscript hoort, en die is bij elke bouwer vergelijkbaar
 * opgebouwd: eerst het apparaat, dan wat de knop doet. `IBIS_7` wordt "7",
 * `ticketprinter_button_enter` wordt "ENTER", `cashdesk_changer_0_50` wordt
 * "0,50". Zegt de handeling niets meer nadat het apparaat eraf is -- een knop die
 * gewoon `almex_riegel` heet -- dan blijft wat er staat.
 *
 * Eerder kwam dit uit de BESTANDSNAAM, en dan werd `17_almex_clickN7.o3d` de knop
 * "CLICKN7" en viel het hele cijferblok niet meer als cijferblok op.
 */
export function opschriftVan(
  actie: string,
  voorvoegsels: Set<string>,
  onderdeel: string,
  ruis: Set<string>
): string {
  for (const [patroon, vervang] of ALMEX) {
    const raak = patroon.exec(actie)
    if (raak) return vervang.replace('$1', raak[1] ?? '')
  }
  /* Geld: `cashdesk_changer_0_50` is vijftig cent, `cashdesk_change_0500` vijf euro. */
  const munt = /_(?:changer|change|geldscheine|schein|muenze)_?(\d+)(?:_(\d+))?$/i.exec(actie)
  if (munt) {
    const euro = munt[2] !== undefined ? Number(munt[1]) : Math.floor(Number(munt[1]) / 100)
    const cent = munt[2] !== undefined ? Number(munt[2]) : Number(munt[1]) % 100
    return `${euro},${String(cent).padStart(2, '0')}`
  }

  const woorden = woordenVan(actie)
  const zonder = woorden.filter((woord, i) => {
    if (i === 0 && voorvoegsels.has(woord)) return false
    return !GENERIEK.has(woord) || /^\d+$/.test(woord)
  })
  const kern = (zonder.length > 0 ? zonder : woorden.slice(1).length > 0 ? woorden.slice(1) : woorden).map(
    (woord) => {
      for (const [patroon, vervang] of KLANKEN) if (patroon.test(woord)) return vervang
      if (/^\d+$/.test(woord)) return String(Number(woord))
      return woord.toUpperCase()
    }
  )
  const tekst = kern.join(' ').trim()
  /* Wat het ONDERDEEL erover zegt; daar staat soms de echte naam van de toets in. */
  const kaal = onderdeel.split(/[\\/]/).pop() ?? actie
  const uitOnderdeel = woordenVan(kaal)
    /* Cijfers blijven staan: op de toets 7 hoort een 7, niet de naam van het apparaat. */
    .filter((woord) => /^[0-9]+$/.test(woord) || (!niksWoord(woord, ruis) && !voorvoegsels.has(woord)))
    .map((woord) => {
      for (const [patroon, vervang] of KLANKEN) if (patroon.test(woord)) return vervang
      return woord.toUpperCase()
    })
    .join(' ')
  /*
   * Een handeling die alleen een nummer overhoudt zegt niets: de kaartknoppen van
   * een AFR 200 heten `ticketprinter_1` tot en met `_4`, terwijl hun onderdelen
   * `..._Ticket_Kurz` en `..._Ticket_Kind` heten. Dan liever KURZ dan 1.
   */
  if (tekst && !(/^\d+$/.test(tekst) && /[a-z]/i.test(uitOnderdeel))) return tekst
  return uitOnderdeel || tekst || actie.toUpperCase()
}

/**
 * Hoe het apparaat heet.
 *
 * De sleutel is `map/woord`; meestal zegt een van die twee wat het is
 * ("afr200/afr200" wordt AFR 200, "/almex" wordt ALMEX). Zegt geen van beide
 * iets, dan maar de naam van het eerste schermvak.
 */
function naamVan(sleutel: string, vakken: Modulevak[]): string {
  const delen = sleutel
    .split('/')
    .map((deel) => deel.replace(/^~/, '').replace(/[_-]+/g, ' ').trim())
    .filter(Boolean)
  const uniek = [...new Set(delen.map((deel) => deel.toLowerCase()))]
  if (uniek.length > 0) return uniek.join(' ').toUpperCase()
  const eerste = vakken[0]?.vak.variabele ?? 'scherm'
  return eerste.replace(/[_-]+/g, ' ').replace(/\s*\d+$/, '').trim().toUpperCase()
}

/** De apparaten van de bus die rijdt; leeg als de model.cfg niet te lezen is. */
export function modulesVanBus(
  omsiPad: string,
  bus: { pad?: string; model?: string; bestand?: string } | undefined
): Busmodule[] {
  const modelcfg = modelcfgVanBus(omsiPad, bus)
  return modelcfg ? modulesVanModel(modelcfg) : []
}

/** Hoeveel tekens er op een schermvak passen, naar de maat van zijn textuur. */
function tekensVan(vak: Schermvak): number {
  return Math.max(4, Math.min(48, Math.round(vak.breedte / Math.max(1, vak.hoogte * 0.62))))
}

/**
 * Een samengesteld apparaat als paneel voor de telefoon.
 *
 * HET SCHERM
 * Past het gemeten, dan komt er een echt scherm: elk vak op zijn eigen plek, de
 * haltelijst onder elkaar, de klok rechtsboven, de verkooptegels als vlakken waar
 * je op kunt tikken. Alleen de vakken waar tekst in staat worden getekend -- een
 * ALMEX heeft dertien vakken die over elkaar heen liggen omdat het per menu een
 * ander scherm is, en welk menu aanstaat is te zien aan welke vakken gevuld zijn.
 *
 * Kon er niets gemeten worden (een o3d die niet te lezen is, of een bus waarvan
 * de onderdelen elders staan), dan blijft de oude weg: de regels onder elkaar.
 *
 * DE KNOPPEN
 * In de rijen waarin ze op het apparaat liggen; zie core/busvorm.ts. Dat is waar
 * het cijferblok van een ALMEX vandaan komt, met de 1 boven -- die staat daar
 * echt zo, anders dan op een telefoon.
 */
export function paneelVanModule(module: Busmodule, vars: Record<string, string>): Paneel {
  const tekst = (naam: string): string => (vars[naam] ?? '').replace(/\s+$/, '')
  const eerste = module.vakken[0]?.vak

  const vlak = module.scherm
    ? {
        verhouding: module.scherm.verhouding,
        velden: module.scherm.velden.map((veld) => ({
          ...veld,
          tekst: veld.variabele ? tekst(veld.variabele) : (veld.opschrift ?? '')
        }))
      }
    : undefined

  /* De knoppen die niet zelf een schermvak zijn -- die staan al op het scherm. */
  const opScherm = new Set(
    vlak ? module.scherm!.velden.map((veld) => veld.actie).filter(Boolean) : []
  )

  const los = module.knoppen.filter((knop) => !opScherm.has(knop.actie))
  const rijen = indelingVan(los, (knop) => knop.doos).map((rij) => {
    /*
     * Een knop die breder is dan zijn buren krijgt ook op de tablet twee plekken.
     * De bevestigingstoets van een ALMEX is tweemaal zo breed als een cijfer, en
     * dat is aan zijn onderdeel te meten.
     */
    const maten = rij
      .map((k) => (k.plek ? k.plek.rechts - k.plek.links : 0))
      .filter((maat) => maat > 0)
      .sort((a, b) => a - b)
    const midden = maten[Math.floor(maten.length / 2)] ?? 0
    return rij.map((k) => ({
      ...knopVan(k.ding),
      breed:
        maten.length >= 2 && k.plek && k.plek.rechts - k.plek.links > midden * 1.6 ? true : undefined
    }))
  })

  return {
    id: module.id,
    naam: module.naam,
    regels: vlak ? [] : module.vakken.map((vak) => tekst(vak.vak.variabele)),
    tekens: eerste ? tekensVan(eerste) : 16,
    tekstkleur: eerste?.tekstkleur ?? 'rgb(232, 238, 246)',
    achtergrond: eerste?.achtergrond ?? 'rgb(12, 14, 16)',
    rijen,
    vlak
  }
}

/**
 * Het scherm van een apparaat: de vakken op hun eigen plek.
 *
 * Gemeten in het vlak van het scherm zelf, niet in de assen van de bus: het
 * ALMEX-scherm staat vijfenzeventig graden achterover, en in de hoogte van de bus
 * is een regel van achttien millimeter dan nog maar vier. Zie `vlakplekkenVan`.
 *
 * Twee vakken op hetzelfde onderdeel kunnen niet uit elkaar gehouden worden -- ze
 * liggen op dezelfde plaats in de ruimte, op twee stukken van dezelfde textuur.
 * Die komen onder elkaar te staan in de volgorde waarin de bouwer ze opschreef;
 * dat is hoe de AFR 200 zijn twee regels op één plaatje zet.
 *
 * Minder dan twee gemeten vakken is geen scherm: dan blijven het gewoon regels.
 */
function schermVan(
  vakken: Modulevak[],
  knoppen: Moduleknop[],
  dozen: ReturnType<typeof dozenVanOnderdelen>
): Schermvlak | undefined {
  if (vakken.length < 2) return undefined
  const eigen = new Map<string, Doos>()
  for (const vak of vakken) {
    const doos = dozen.get(vak.onderdeel)
    if (doos) eigen.set(vak.onderdeel, doos)
  }
  if (eigen.size < 2) return undefined
  const knopdozen = new Map<string, Doos>()
  for (const knop of knoppen) {
    const doos = knop.doos ?? dozen.get(knop.onderdeel)
    if (doos && !eigen.has(knop.onderdeel)) knopdozen.set(knop.actie, doos)
  }
  const { plekken, knoppen: knopplekken, maat } = schermplekkenVan(eigen, knopdozen)
  const gemeten = vakken.filter((vak) => plekken.has(vak.onderdeel))
  if (gemeten.length < 2) return undefined

  const l0 = Math.min(...gemeten.map((vak) => plekken.get(vak.onderdeel)!.links))
  const l1 = Math.max(...gemeten.map((vak) => plekken.get(vak.onderdeel)!.rechts))
  const b0 = Math.min(...gemeten.map((vak) => plekken.get(vak.onderdeel)!.boven))
  const b1 = Math.max(...gemeten.map((vak) => plekken.get(vak.onderdeel)!.onder))
  const bb = Math.max(1e-6, l1 - l0)
  const hh = Math.max(1e-6, b1 - b0)

  /* Hoeveel vakken er op hetzelfde onderdeel zitten, en de hoeveelste dit is. */
  const perOnderdeel = new Map<string, number>()
  for (const vak of gemeten) {
    perOnderdeel.set(vak.onderdeel, (perOnderdeel.get(vak.onderdeel) ?? 0) + 1)
  }
  const geteld = new Map<string, number>()

  const velden: Schermveld[] = gemeten.map((vak) => {
    const plek = plekken.get(vak.onderdeel)!
    const samen = perOnderdeel.get(vak.onderdeel) ?? 1
    const nummer = geteld.get(vak.onderdeel) ?? 0
    geteld.set(vak.onderdeel, nummer + 1)
    const boven = (plek.boven - b0) / hh
    const hoogte = Math.max(0.01, (plek.onder - plek.boven) / hh)
    return {
      variabele: vak.vak.variabele,
      actie: vak.actie,
      links: (plek.links - l0) / bb,
      breedte: Math.max(0.02, (plek.rechts - plek.links) / bb),
      boven: boven + (hoogte * nummer) / samen,
      hoogte: hoogte / samen,
      tekstkleur: vak.vak.tekstkleur,
      achtergrond: vak.vak.achtergrond,
      uitlijning: vak.vak.uitlijning
    }
  })

  /*
   * REGELS DIE OVER ELKAAR HEEN VALLEN
   *
   * Een tekstvak is het hele plaatje waar de bus zijn regel in tekent, en dat is
   * vaak hoger dan de regel zelf: de twee matrixregels van een ALMEX staan zes
   * honderdsten uit elkaar terwijl hun vakken er zestien hoog zijn, en dan stond
   * de tweede regel dwars door de eerste heen. Ligt er een vak recht onder dit
   * vak -- zelfde kolom, duidelijk lager -- dan is de afstand daartussen de
   * hoogte van de regel.
   */
  for (const veld of velden) {
    if (veld.actie) continue
    let dichtst = Infinity
    for (const ander of velden) {
      if (ander === veld || ander.actie) continue
      const breedOver =
        Math.min(ander.links + ander.breedte, veld.links + veld.breedte) -
        Math.max(ander.links, veld.links)
      if (breedOver < veld.breedte * 0.5) continue
      const stap = ander.boven - veld.boven
      if (stap < veld.hoogte * 0.25 || stap >= veld.hoogte) continue
      if (stap < dichtst) dichtst = stap
    }
    if (Number.isFinite(dichtst)) veld.hoogte = dichtst
  }

  /*
   * WELKE KNOPPEN OP HET SCHERM ZELF LIGGEN
   *
   * Niet: welke binnen de rechthoek van het scherm vallen -- het cijferblok van
   * een ALMEX ligt naast de haltelijst en onder de klok, dus binnen die
   * rechthoek, terwijl het een echt toetsenbord is. Wel: welke BOVEN OP een
   * tekstvak liggen. Dat zijn de aanraakvlakken van het apparaat: de vier
   * verborgen verkooptegels en de zeven FIMS-knoppen van een ALMEX liggen boven
   * op de tegels en boven op de haltelijst, want ze horen bij een ander menu van
   * hetzelfde scherm.
   *
   * Die komen in beeld op hun eigen plaats, onder de tekst. Het cijferblok en de
   * functietoetsen blijven gewone knoppen, in de rijen waarin ze op het apparaat
   * liggen.
   */
  for (const knop of knoppen) {
    const plek = knopplekken.get(knop.actie)
    if (!plek || velden.some((veld) => veld.actie === knop.actie)) continue
    const eigen = Math.max(1e-9, (plek.rechts - plek.links) * (plek.onder - plek.boven))
    let overlap = 0
    for (const vak of gemeten) {
      const ander = plekken.get(vak.onderdeel)!
      /*
       * Alleen vakken van dezelfde orde van grootte. Het invoervak van een ALMEX
       * beslaat het halve scherm en ligt daarmee toevallig ook over de linker
       * kolom van het cijferblok; dat maakt een cijfertoets nog geen aanraakvlak.
       */
      const vlakte = (ander.rechts - ander.links) * (ander.onder - ander.boven)
      if (vlakte > eigen * 4) continue
      const breedOver = Math.min(ander.rechts, plek.rechts) - Math.max(ander.links, plek.links)
      const hoogOver = Math.min(ander.onder, plek.onder) - Math.max(ander.boven, plek.boven)
      if (breedOver > 0 && hoogOver > 0) overlap += breedOver * hoogOver
    }
    if (overlap < eigen * 0.4) continue
    velden.push({
      actie: knop.actie,
      opschrift: knop.opschrift,
      links: (plek.links - l0) / bb,
      breedte: Math.max(0.02, (plek.rechts - plek.links) / bb),
      boven: (plek.boven - b0) / hh,
      hoogte: Math.max(0.02, (plek.onder - plek.boven) / hh),
      tekstkleur: vakken[0].vak.tekstkleur,
      achtergrond: vakken[0].vak.achtergrond,
      uitlijning: 'midden'
    })
  }

  /*
   * De verhouding van het scherm, uit de echte maten in de bus. Een scherm dat
   * uit één regel bestaat zou anders over de volle hoogte worden uitgerekt, dus
   * nooit hoger dan breed en nooit breder dan acht keer zijn hoogte.
   */
  const verhouding = Math.min(8, Math.max(1, (maat.breed * bb) / Math.max(1e-6, maat.hoog * hh)))
  return { verhouding, velden }
}

/** De kleur van een knop, naar wat erop staat. */
function knopVan(knop: Moduleknop): Profielknop {
  /* De kleur komt van wat er op de knop staat; zie hieronder. */
  const tekst = knop.opschrift
  const kleur = /drucken|print|ausloesung|ausloesen|storno|cancel|abbruch/i.test(tekst)
    ? ('rood' as const)
    : /fahrschein|kurz|kind|24h|mo$|wo$|grp|einzel/i.test(tekst)
      ? ('geel' as const)
      : /enter|eingabe|getticket|ausgabe|^ok$|▶|▲|▼/i.test(tekst)
        ? ('blauw' as const)
        : undefined
  return { actie: knop.actie, opschrift: tekst, kleur }
}
