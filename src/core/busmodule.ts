import { readOmsiLines } from './omsiFile'
import { modelcfgVanBus, schermvakVan, type Schermvak } from './busscherm'
import type { Paneel, Profielknop } from './busprofiel'

/**
 * De apparaten van een bus, door de app zelf samengesteld uit het model.
 *
 * WAAROM DIT KAN
 * Een `model.cfg` beschrijft de bus onderdeel voor onderdeel, en bij elk
 * onderdeel staat wat erop zit:
 *
 *   [mesh]              AFR200\O550_AFR200_Body.o3d
 *   [useTextTexture]    3        -> het vierde `[texttexture]`-blok van dit
 *                                   bestand wordt op dit onderdeel getekend
 *   [mesh]              AFR200\O550_AFR200_Num_7.o3d
 *   [mouseevent]        IBIS_7   -> hierop klik je, en dit hoort het busscript
 *
 * Daarmee ligt alles er al in: welke schermpjes bij elkaar horen (ze zitten op
 * hetzelfde onderdeel), welke knoppen erbij horen (ze staan in dezelfde map),
 * en hoe die knoppen heten (het onderdeel is naar de knop genoemd). De map van
 * het onderdeel -- `AFR200\`, `Matrix\`, `Panel_O550\` -- is het apparaat.
 *
 * Nagemeten in O550_Euro3.cfg: `[useTextTexture]` telt vanaf NUL, en dan komen
 * alle dertien koppelingen uit. De vijf schermpjes van de AFR 200 zitten op
 * `AFR200\O550_AFR200_Body`, de vier regels van de LAWO op
 * `Matrix\Matrix_Bedienteil_Display_01` tot en met `_04`, en het kenteken op
 * `misc\O550_Kennzeichen`.
 *
 * Zo hoeft er voor een bus niets met de hand: de app stelt zijn IBIS-module
 * zelf samen. Staat er in core/busprofiel.ts een uitgewerkt profiel voor deze
 * bus, dan gaat dat voor -- dat is dezelfde module, maar met de knoppen op de
 * plek waar ze in het echt liggen.
 */

/** Een knop, zoals het model hem beschrijft. */
export interface Moduleknop {
  /** De naam waar het busscript op luistert; ook de naam in `keyboard.cfg`. */
  actie: string
  /** Het onderdeel waar hij aan hangt. */
  onderdeel: string
  /** Wat erop staat, afgeleid uit die naam. */
  opschrift: string
  /** Een cijfertoets hoort in een blok; de rest komt eronder. */
  cijfer?: number
}

/** Een apparaat in de bus: zijn schermpjes en zijn knoppen. */
export interface Busmodule {
  /** De map van de onderdelen, in kleine letters: `afr200`, `matrix`. */
  id: string
  /** Wat er boven komt te staan. */
  naam: string
  schermen: Schermvak[]
  knoppen: Moduleknop[]
}

/*
 * Woorden die in de naam van een onderdeel staan maar niet op de knop.
 * `Bedienteil` is het paneel zelf, `Taste` en `Num` zeggen alleen dat het een
 * toets is, en `Ticket` staat op alle kaartknoppen van de AFR -- daar lees je
 * alleen KURZ, KIND of 24H.
 */
const WEG = /^(taste|tasten|num|button|knopf|btn|bedienteil|switch|ticket|key)$/i

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
  [/^geld$/i, 'GELD']
]

/** Het opschrift van een knop, uit de naam van zijn onderdeel. */
export function opschriftVan(onderdeel: string, gedeeld: string): string {
  const kaal = onderdeel
    .split(/[\\/]/)
    .pop()!
    .replace(/\.o3d$/i, '')
  const zonder = gedeeld && kaal.toLowerCase().startsWith(gedeeld.toLowerCase())
    ? kaal.slice(gedeeld.length)
    : kaal
  const woorden = zonder
    .split(/[_\s-]+/)
    .filter((woord) => woord.length > 0 && !WEG.test(woord))
    .map((woord) => {
      for (const [patroon, vervang] of KLANKEN) if (patroon.test(woord)) return vervang
      /* `00` en `01` op een toetsenbord zijn gewoon 0 en 1. */
      if (/^\d+$/.test(woord)) return String(Number(woord))
      return woord.toUpperCase()
    })
  return woorden.join(' ') || kaal.toUpperCase()
}

/** Waar alle namen in een groep mee beginnen; dat deel zegt niets over de knop. */
function gedeeldBegin(namen: string[]): string {
  if (namen.length < 2) return ''
  const kaal = namen.map((naam) => naam.split(/[\\/]/).pop()!.replace(/\.o3d$/i, ''))
  let n = 0
  while (n < kaal[0].length && kaal.every((naam) => naam[n]?.toLowerCase() === kaal[0][n]?.toLowerCase())) {
    n++
  }
  /* Tot en met het laatste liggend streepje: halve woorden zeggen niets. */
  const begin = kaal[0].slice(0, n)
  const streep = begin.lastIndexOf('_')
  return streep > 0 ? begin.slice(0, streep + 1) : ''
}

/**
 * Welke knoppen bij een apparaat horen.
 *
 * In dezelfde map staat meer dan het apparaat zelf: bij de AFR 200 ligt ook de
 * geldlade, en in de map van een dashboard liggen de deuren, de ruitenwissers en
 * de stoelen. Wat bij een apparaat hoort is te zien aan de naam waar het
 * busscript op luistert -- die is bij elke addon hetzelfde soort naam, want het
 * spel moet hem kennen.
 */
const IS_APPARAAT =
  /ibis|ticketprinter|ticket_printer|lawo|matrix|annax|rollband|almex|atron|efad|kasse|cashdesk|drucker|setmode|zielcode|linie|kurs|vdv|rbl/i

/**
 * De naam van het apparaat waar een onderdeel bij hoort.
 *
 * De map van het onderdeel is de eerste scheiding, en daarbinnen het eerste
 * woord van de bestandsnaam: `O550_AFR200_Num_7` hoort bij de AFR,
 * `O550_Zahltisch_Schublade` bij de geldlade, ook al liggen ze in dezelfde map.
 * Het merk van de bus dat overal voorstaat telt niet mee; welk woord dat is,
 * blijkt uit hoe vaak het voorkomt.
 */
function apparaatVan(onderdeel: string, busWoord: string): string {
  const delen = onderdeel.split(/[\\/]/)
  const map = delen.length > 1 ? delen[delen.length - 2] : ''
  const naam = delen[delen.length - 1].replace(/\.o3d$/i, '')
  const woorden = naam.split(/[_\s-]+/).filter(Boolean)
  if (woorden.length > 1 && woorden[0].toLowerCase() === busWoord) woorden.shift()
  return `${map}/${woorden[0] ?? ''}`.toLowerCase()
}

/** Het woord dat bij deze bus voor alles staat; dat zegt niets over het apparaat. */
function busWoordVan(onderdelen: string[]): string {
  const tel = new Map<string, number>()
  for (const onderdeel of onderdelen) {
    const naam = onderdeel.split(/[\\/]/).pop()!.replace(/\.o3d$/i, '')
    const eerste = naam.split(/[_\s-]+/)[0]?.toLowerCase()
    if (eerste) tel.set(eerste, (tel.get(eerste) ?? 0) + 1)
  }
  let beste = ''
  let meeste = 0
  for (const [woord, aantal] of tel) {
    if (aantal > meeste) {
      meeste = aantal
      beste = woord
    }
  }
  return meeste >= onderdelen.length * 0.4 ? beste : ''
}

/**
 * De apparaten van deze bus, uit zijn model.
 *
 * Alleen groepen met een schermpje: een deur of een ruitenwisser is een knop in
 * dezelfde cfg, maar geen apparaat om na te bouwen.
 */
export function modulesVanModel(modelcfg: string): Busmodule[] {
  let regels: string[]
  try {
    regels = readOmsiLines(modelcfg)
  } catch {
    return []
  }

  /* Eerst alle schermpjes op volgorde: `[useTextTexture]` telt in deze lijst. */
  const vakken: (Schermvak | undefined)[] = []
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop !== '[texttexture]' && kop !== '[texttexture_enh]') continue
    vakken.push(schermvakVan(regels, i, kop === '[texttexture_enh]'))
  }

  /* Welk woord bij deze bus overal voorstaat; zie `busWoordVan`. */
  const alleOnderdelen: string[] = []
  for (let i = 0; i < regels.length; i++) {
    if (regels[i].trim().toLowerCase() === '[mesh]') {
      const naam = (regels[i + 1] ?? '').trim()
      if (naam) alleOnderdelen.push(naam)
    }
  }
  const busWoord = busWoordVan(alleOnderdelen)

  /* En dan per onderdeel wat erop zit. */
  const groepen = new Map<string, { schermen: number[]; knoppen: Moduleknop[]; onderdelen: string[] }>()
  const pak = (onderdeel: string): { schermen: number[]; knoppen: Moduleknop[]; onderdelen: string[] } => {
    const sleutel = apparaatVan(onderdeel, busWoord)
    let groep = groepen.get(sleutel)
    if (!groep) {
      groep = { schermen: [], knoppen: [], onderdelen: [] }
      groepen.set(sleutel, groep)
    }
    if (!groep.onderdelen.includes(onderdeel)) groep.onderdelen.push(onderdeel)
    return groep
  }

  let onderdeel = ''
  for (let i = 0; i < regels.length; i++) {
    const kop = regels[i].trim().toLowerCase()
    if (kop === '[mesh]') {
      onderdeel = (regels[i + 1] ?? '').trim()
      continue
    }
    if (!onderdeel) continue
    if (kop === '[usetexttexture]') {
      const nummer = Number((regels[i + 1] ?? '').trim())
      if (Number.isFinite(nummer) && nummer >= 0 && nummer < vakken.length) {
        const groep = pak(onderdeel)
        if (!groep.schermen.includes(nummer)) groep.schermen.push(nummer)
      }
      continue
    }
    if (kop === '[mouseevent]') {
      const actie = (regels[i + 1] ?? '').trim()
      /* Alleen knoppen die bij een apparaat horen; zie `IS_APPARAAT`. */
      if (!actie || !IS_APPARAAT.test(actie)) continue
      const groep = pak(onderdeel)
      if (!groep.knoppen.some((knop) => knop.actie === actie)) {
        groep.knoppen.push({ actie, onderdeel, opschrift: '' })
      }
    }
  }

  /*
   * Knoppen die los van hun schermpje liggen.
   *
   * Niet elke bouwer legt het toetsenbord bij het scherm: in de MAN NL/NG zitten
   * de IBIS-toetsen op `GN_Panel_IBIS2_*` terwijl het schermpje op een heel
   * ander onderdeel staat. Dan brengt de naam van de handeling ze bij elkaar --
   * `IBIS_setmode_linie_kurs` hoort bij een apparaat waarvan de schermpjes ook
   * met `IBIS` beginnen. Alleen als er precies één zo'n apparaat is; bij twijfel
   * laten we ze liever weg dan bij het verkeerde apparaat zetten.
   */
  const woordVan = (naam: string): string => naam.split(/[_\s-]+/)[0]?.toLowerCase() ?? ''
  const metScherm = [...groepen.entries()].filter(([, groep]) => groep.schermen.length > 0)
  for (const [id, groep] of groepen) {
    if (groep.schermen.length > 0 || groep.knoppen.length === 0) continue
    const woorden = new Set(groep.knoppen.map((knop) => woordVan(knop.actie)))
    const past = metScherm
      .map(([, doel]) => ({
        doel,
        raak: doel.schermen.filter((nummer) => {
          const vak = vakken[nummer]
          return vak !== undefined && woorden.has(woordVan(vak.variabele))
        }).length
      }))
      .filter((rij) => rij.raak > 0)
      .sort((a, b) => b.raak - a.raak)
    /* Alleen bij een duidelijke winnaar; bij gelijkspel weten we het niet. */
    if (past.length === 0 || (past.length > 1 && past[0].raak === past[1].raak)) continue
    past[0].doel.knoppen.push(...groep.knoppen)
    groep.knoppen = []
    void id
  }

  const modules: Busmodule[] = []
  for (const [id, groep] of groepen) {
    const schermen = groep.schermen
      .map((nummer) => vakken[nummer])
      .filter((vak): vak is Schermvak => vak !== undefined)
    /*
     * Een apparaat zonder schermpje mag ook, als het er duidelijk een is.
     *
     * De nieuwste bussen tekenen hun boordcomputer met een :
     * het busscript schildert de beeldpunten zelf, en er valt geen tekst te
     * lezen -- de Citaro C2 doet dat met zijn Atron. Wat er dan nog wel is, zijn
     * de knoppen: Verkauf, Schicht, Drucker, de kaartsoorten. Daarmee is het
     * apparaat op de tablet nog steeds te bedienen, ook al staat het beeld
     * alleen in het spel. Zes knoppen als ondergrens, anders is het een
     * schakelaar op het dashboard en geen apparaat.
     */
    if (schermen.length === 0 && groep.knoppen.length < 6) continue
    const gedeeld = gedeeldBegin(groep.knoppen.map((knop) => knop.onderdeel))
    const knoppen = groep.knoppen.map((knop) => {
      const opschrift = opschriftVan(knop.onderdeel, gedeeld)
      return {
        ...knop,
        opschrift,
        cijfer: /^\d$/.test(opschrift) ? Number(opschrift) : undefined
      }
    })
    modules.push({
      id: id || 'bus',
      naam: naamVan(id, schermen),
      schermen,
      knoppen
    })
  }
  /* Een apparaat waar je iets mee kunt eerst; de rest is meetlat en klok. */
  return modules.sort((a, b) => (b.knoppen.length > 0 ? 1 : 0) - (a.knoppen.length > 0 ? 1 : 0))
}

/**
 * Hoe het apparaat heet.
 *
 * De sleutel is `map/eerste woord`; meestal zegt een van die twee wat het is
 * ("AFR200/body" wordt AFR200, "matrix/matrix" wordt MATRIX). Zegt geen van
 * beide iets, dan maar de naam van zijn eerste schermpje.
 */
function naamVan(id: string, schermen: Schermvak[]): string {
  const delen = id
    .split('/')
    .map((deel) => deel.replace(/[_-]+/g, ' ').trim())
    .filter((deel) => deel && !/^(body|panel|bedienteil|misc|generic|display|cockpit)$/i.test(deel))
  const uniek = [...new Set(delen.map((deel) => deel.toLowerCase()))]
  if (uniek.length > 0) return uniek.join(' ').toUpperCase()
  const eerste = schermen[0]?.variabele ?? 'scherm'
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

/**
 * Een samengesteld apparaat als paneel voor de telefoon.
 *
 * De schermpjes worden de regels, en de knoppen komen eronder: de cijfers in een
 * blok zoals op elk toetsenbord, de rest in rijen van drie in de volgorde waarin
 * ze in het model staan -- dat is meestal ook de volgorde waarin ze op het
 * apparaat liggen.
 *
 * Hoeveel tekens er op een regel passen volgt uit de textuur: een venster van
 * 885 bij 78 met een vaste-breedteletter draagt er ongeveer twintig, want een
 * teken is ruim de helft van zijn hoogte breed.
 */
export function paneelVanModule(module: Busmodule, vars: Record<string, string>): Paneel {
  const eerste = module.schermen[0]
  const tekens = eerste
    ? Math.max(8, Math.min(48, Math.round(eerste.breedte / Math.max(1, eerste.hoogte * 0.62))))
    : 16

  const cijfers = module.knoppen.filter((knop) => knop.cijfer !== undefined)
  const rest = module.knoppen.filter((knop) => knop.cijfer === undefined)
  const rijen: Profielknop[][] = []

  /* Eerst wat geen cijfer is, drie op een rij. */
  for (let i = 0; i < rest.length; i += 3) {
    rijen.push(rest.slice(i, i + 3).map(knopVan))
  }
  /* En dan het cijferblok, als de bus er een heeft. */
  if (cijfers.length >= 10) {
    const zoek = (n: number): Moduleknop | undefined => cijfers.find((knop) => knop.cijfer === n)
    for (const rij of [[7, 8, 9], [4, 5, 6], [1, 2, 3], [0]]) {
      const knoppen = rij.map(zoek).filter((knop): knop is Moduleknop => knop !== undefined)
      if (knoppen.length > 0) rijen.push(knoppen.map(knopVan))
    }
  } else {
    for (let i = 0; i < cijfers.length; i += 3) rijen.push(cijfers.slice(i, i + 3).map(knopVan))
  }

  return {
    id: module.id,
    naam: module.naam,
    regels: module.schermen.map((vak) => (vars[vak.variabele] ?? '').replace(/\s+$/, '')),
    tekens,
    tekstkleur: eerste?.tekstkleur ?? 'rgb(232, 238, 246)',
    achtergrond: eerste?.achtergrond ?? 'rgb(12, 14, 16)',
    rijen
  }
}

/** De kleur van een knop, naar wat erop staat. */
function knopVan(knop: Moduleknop): Profielknop {
  const tekst = knop.opschrift
  const kleur = /drucken|print|ausloesung|ausloesen|storno|cancel|abbruch/i.test(tekst)
    ? ('rood' as const)
    : /ticket|fahrschein|kurz|kind|24h|mo$|wo$|grp|einzel/i.test(tekst)
      ? ('geel' as const)
      : /enter|eingabe|getticket|ausgabe|▶/i.test(tekst)
        ? ('blauw' as const)
        : undefined
  return { actie: knop.actie, opschrift: tekst, kleur }
}
