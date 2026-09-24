import { OMSI_TOETSEN, type OmsiToets } from '../shared/telefoon'
import { knoppenVanModel, modelcfgVanBus, type Modelknop } from './busscherm'

/**
 * De apparaten van een bus, nagebouwd zoals ze in de cabine zitten.
 *
 * WAAROM PER BUS
 * De generieke weg (busscherm.ts) haalt uit de `model.cfg` welke schermpjes een
 * bus heeft en welke variabele ze vult. Dat klopt voor elke bus, maar het zegt
 * niets over hoe het apparaat eruitziet: een AFR 200 heeft zijn cijfers in het
 * midden, zijn kaartsoorten geel rechts en DRUCKEN rood eronder. Dat is
 * handwerk per apparaat, en dat staat hier.
 *
 * Kent de app de bus niet, dan blijft de generieke weg staan: het schermpje uit
 * de model.cfg met het gewone IBIS-blok eronder. Er gaat dus niets verloren
 * door een bus niet op te nemen -- hij wordt alleen minder mooi.
 *
 * WAT ER NIET IN STAAT
 * Welke knoppen deze bus werkelijk heeft. Dat leest de app uit hetzelfde
 * `model.cfg`: elke knop in de cabine is daar een `[mouseevent]` met de naam
 * waar het busscript op luistert. Een knop die in het profiel staat maar niet
 * in het model, laat de app weg -- dan zit hij niet in deze uitvoering.
 */

/** Een knop op het paneel. */
export interface Profielknop {
  /** Welke toets van OMSI eronder zit; zie `OMSI_TOETSEN`. */
  actie: OmsiToets
  /** Wat erop staat. */
  opschrift: string
  /** De kleur van de knop, zoals op het apparaat zelf. */
  kleur?: 'geel' | 'rood' | 'blauw' | 'grijs'
  /** Twee plekken breed. */
  breed?: boolean
}

/** Een apparaat: zijn schermpje, en zijn knoppen in rijen zoals ze liggen. */
export interface Apparaatprofiel {
  id: string
  /** Hoe het apparaat heet, voor het knopje erboven. */
  naam: string
  /** Wie het gemaakt heeft; staat op het apparaat en dus ook hier. */
  merk?: string
  /** De stringvariabelen van het schermpje, van boven naar beneden. */
  scherm: string[]
  /** Hoeveel tekens er op een regel passen; bepaalt de lettergrootte. */
  tekens: number
  tekstkleur: string
  achtergrond: string
  /** De knoppen, rij voor rij. */
  rijen: Profielknop[][]
}

/**
 * Een apparaat zoals het op het scherm komt: de vorm uit het profiel, met wat
 * er op dat moment op staat.
 */
export interface Paneel {
  id: string
  naam: string
  merk?: string
  /** De regels van het schermpje, in de volgorde van boven naar beneden. */
  regels: string[]
  tekens: number
  tekstkleur: string
  achtergrond: string
  rijen: Profielknop[][]
}

/** Een bus die de app van binnen kent. */
export interface Busprofiel {
  id: string
  naam: string
  /** Waaraan je hem herkent: een stuk van het pad of het model, kleine letters. */
  herkenAan: RegExp
  apparaten: Apparaatprofiel[]
}

const CIJFERS: OmsiToets[] = [
  'ibis0',
  'ibis1',
  'ibis2',
  'ibis3',
  'ibis4',
  'ibis5',
  'ibis6',
  'ibis7',
  'ibis8',
  'ibis9'
]

/** Het cijferblok van een IBIS: drie rijen van drie, met de nul eronder. */
function cijferblok(extra: Profielknop[]): Profielknop[][] {
  const knop = (n: number): Profielknop => ({ actie: CIJFERS[n], opschrift: String(n) })
  return [
    [knop(7), knop(8), knop(9)],
    [knop(4), knop(5), knop(6)],
    [knop(1), knop(2), knop(3)],
    [knop(0), ...extra]
  ]
}

/**
 * De AFR 200 van ADtranz, de kaartautomaat in de Thueringer Wald-bussen.
 *
 * De namen van de knoppen komen uit het model zelf: elke `[mouseevent]` in
 * `O550_Euro3.cfg` hangt aan een onderdeel als `O550_AFR200_Ticket_Kind_Kurz`,
 * en daar is precies aan te zien welke toets welke knop is. `IBIS_eingabe` is
 * AUSLÖSUNG, `IBIS_Uhr` is de rode U, `IBIS_setmode_route` is KURS, en
 * `ticketprinter_getticket` is de gleuf waar het kaartje uitkomt.
 *
 * Het schermpje is een groen oplichtend venster van twee regels; de kleur komt
 * uit de model.cfg (95, 211, 188).
 */
const AFR200: Apparaatprofiel = {
  id: 'afr200',
  naam: 'AFR 200',
  merk: 'ADtranz',
  scherm: ['afr_display_1', 'afr_display_2'],
  tekens: 20,
  tekstkleur: 'rgb(95, 211, 188)',
  achtergrond: 'rgb(10, 26, 22)',
  rijen: [
    [
      { actie: 'ibisInvoer', opschrift: 'AUSLÖSUNG', kleur: 'rood', breed: true },
      { actie: 'wisselgeld', opschrift: 'GELD-RÜCKGABE', breed: true }
    ],
    [
      { actie: 'ibisLijn', opschrift: 'LINIE' },
      { actie: 'ibisRoute', opschrift: 'KURS' },
      { actie: 'ibisBestemming', opschrift: 'F' },
      { actie: 'afrUhr', opschrift: 'U', kleur: 'rood' }
    ],
    [
      { actie: 'afrRueck', opschrift: 'HST RÜCK' },
      { actie: 'afrVor', opschrift: 'HST VOR' },
      { actie: 'afrModul', opschrift: 'MODUL' }
    ],
    ...cijferblok([{ actie: 'ibisWissen', opschrift: 'C' }]),
    [
      { actie: 'afrKurz', opschrift: 'KURZ', kleur: 'geel' },
      { actie: 'afr24h', opschrift: '24H', kleur: 'geel' },
      { actie: 'afrKind', opschrift: 'KIND', kleur: 'geel' }
    ],
    [
      { actie: 'afrKindKurz', opschrift: 'KIND KURZ', kleur: 'geel' },
      { actie: 'afrWo', opschrift: 'WO', kleur: 'geel' },
      { actie: 'afrSwo', opschrift: 'SWO', kleur: 'geel' }
    ],
    [
      { actie: 'afrDrucken', opschrift: 'DRUCKEN', kleur: 'rood', breed: true },
      { actie: 'afrGeven', opschrift: 'TICKET', kleur: 'blauw', breed: true }
    ]
  ]
}

/**
 * Het LAWO 8401-bedieningsdeel, waarmee je de matrix voorop de bus zet.
 *
 * Vier regels van twintig tekens in oranje puntjes, en een toetsenbord met
 * cijfers, A, B, L en M, een wistoets en een pijl om te bevestigen. De namen
 * komen uit `Matrix\Matrix_Bedienteil_*` in hetzelfde model.
 */
const LAWO8401: Apparaatprofiel = {
  id: 'lawo8401',
  naam: 'LAWO',
  merk: 'LAWO 8401',
  scherm: [
    'LAWO_display_line1',
    'LAWO_display_line2',
    'LAWO_display_line3',
    'LAWO_display_line4'
  ],
  tekens: 20,
  tekstkleur: 'rgb(20, 16, 8)',
  achtergrond: 'rgb(214, 132, 24)',
  rijen: [
    [
      { actie: 'lawo7', opschrift: '7' },
      { actie: 'lawo8', opschrift: '8' },
      { actie: 'lawo9', opschrift: '9' },
      { actie: 'lawoL', opschrift: 'L' }
    ],
    [
      { actie: 'lawo4', opschrift: '4' },
      { actie: 'lawo5', opschrift: '5' },
      { actie: 'lawo6', opschrift: '6' },
      { actie: 'lawoM', opschrift: 'M' }
    ],
    [
      { actie: 'lawo1', opschrift: '1' },
      { actie: 'lawo2', opschrift: '2' },
      { actie: 'lawo3', opschrift: '3' },
      { actie: 'lawoA', opschrift: 'A' }
    ],
    [
      { actie: 'lawo0', opschrift: '0' },
      { actie: 'lawoWissen', opschrift: 'CE' },
      { actie: 'lawoMode', opschrift: 'MODE' },
      { actie: 'lawoB', opschrift: 'B' }
    ],
    [{ actie: 'lawoEnter', opschrift: '▶', kleur: 'blauw', breed: true }]
  ]
}

/**
 * De bussen die de app van binnen kent.
 *
 * Eén regel per addon. De Thueringer Wald-bussen -- de Setra's S315/S317 en de
 * Mercedes O550 -- staan allemaal in dezelfde map en hebben dezelfde twee
 * apparaten.
 */
export const BUSPROFIELEN: Busprofiel[] = [
  {
    id: 'th-ueberlandbus',
    naam: 'Thüringer Wald (Setra S315/S317, Mercedes O550)',
    herkenAan: /th_ueberlandbus/i,
    apparaten: [AFR200, LAWO8401]
  }
]

/** Het profiel van de bus die rijdt, als de app hem kent. */
export function profielVoor(bus: { pad?: string; model?: string; bestand?: string } | undefined):
  | Busprofiel
  | undefined {
  if (!bus) return undefined
  const waar = `${bus.pad ?? ''} ${bus.model ?? ''} ${bus.bestand ?? ''}`
  return BUSPROFIELEN.find((profiel) => profiel.herkenAan.test(waar))
}

/**
 * Het profiel zoals het voor déze uitvoering geldt.
 *
 * Niet elke uitvoering van een bus heeft dezelfde knoppen: de O550 mist de
 * GRP-, MO- en SMO-toets die in het script wel bestaan. Welke er zijn staat in
 * het model, als `[mouseevent]`. Knoppen die er niet zijn vallen weg, en een
 * apparaat zonder knoppen valt helemaal weg.
 */
export function profielVanBus(
  omsiPad: string,
  bus: { pad?: string; model?: string; bestand?: string } | undefined,
  namen: Set<string>
): { profiel: Busprofiel; knoppen: Modelknop[] } | undefined {
  const profiel = profielVoor(bus)
  if (!profiel) return undefined
  const modelcfg = modelcfgVanBus(omsiPad, bus)
  const knoppen = modelcfg ? knoppenVanModel(modelcfg) : []
  const inHetModel = new Set(knoppen.map((knop) => knop.actie.toLowerCase()))
  /* Zonder mouseevents (een model dat we niet konden lezen) laten we alles staan. */
  const filter = inHetModel.size > 0

  const apparaten = profiel.apparaten
    .filter((apparaat) => apparaat.scherm.some((naam) => namen.has(naam.toLowerCase())))
    .map((apparaat) => ({
      ...apparaat,
      rijen: apparaat.rijen
        .map((rij) => rij.filter((knop) => !filter || hoortErbij(knop, inHetModel)))
        .filter((rij) => rij.length > 0)
    }))
  if (apparaten.length === 0) return undefined
  return { profiel: { ...profiel, apparaten }, knoppen }
}

/**
 * Zit deze knop in het model?
 *
 * `wisselgeld` en `kaartje` zijn commando's van OMSI zelf en hangen niet aan een
 * onderdeel van de bus; die horen er altijd bij.
 */
function hoortErbij(knop: Profielknop, inHetModel: Set<string>): boolean {
  if (knop.actie === 'wisselgeld' || knop.actie === 'kaartje') return true
  const naam: string | undefined = OMSI_TOETSEN[knop.actie]
  return naam ? inHetModel.has(naam.toLowerCase()) : true
}

/**
 * De panelen van dit profiel, met de tekst die er nu op staat.
 *
 * De waarden komen uit `vars` in live.json, dat de plugin uit het geheugen van
 * de bus haalt. Een regel die de bus niet vult blijft leeg -- en niet weg, want
 * een apparaat met twee regels hoort er twee te houden, ook als de bovenste
 * even niets zegt.
 */
export function panelenVan(profiel: Busprofiel, vars: Record<string, string>): Paneel[] {
  return profiel.apparaten.map((apparaat) => ({
    id: apparaat.id,
    naam: apparaat.naam,
    merk: apparaat.merk,
    regels: apparaat.scherm.map((naam) => (vars[naam] ?? '').replace(/\s+$/, '')),
    tekens: apparaat.tekens,
    tekstkleur: apparaat.tekstkleur,
    achtergrond: apparaat.achtergrond,
    rijen: apparaat.rijen
  }))
}
