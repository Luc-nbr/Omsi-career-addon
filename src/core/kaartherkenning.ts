import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readTileGrid, type TileGrid } from './geo'
import { terrainHeight } from './terrain'
import { readTileList } from './track'

/*
 * WELKE KAART HEEFT OMSI GELADEN?
 *
 * De plugin geeft de kaart niet door, en `logfile.txt` zit tijdens het spelen
 * op slot. Wie in OMSI een andere kaart laadt dan in de app, kreeg dus stil een
 * navigatie van de verkeerde stad -- of een koppeling die nergens op sloeg.
 *
 * Wel geeft de plugin de plek van de bus: een tegelnummer (de volgorde in
 * global.cfg), en x, hoogte en z binnen die tegel. Die hoogte past maar op één
 * kaart bij het maaiveld. Het monster van 21-09 (tegel 152, x 250,863, z
 * 154,630, hoogte 6,969) ligt op Hohenkirchen 0,01 m van de grond; op de negen
 * andere kaarten met een tegel 152 is het verschil 2,3 tot 27 m
 * (`kaartafdruk.ts`). Eén monster zegt weinig, dus er worden er een paar
 * verzameld, op verschillende plekken, en pas vanaf zes volgt een oordeel.
 *
 * EEN PLEK ZEGT "KLOPT", "KAN NIET" OF NIETS
 * Een weg ligt vaak niet op het maaiveld: op een talud, een dijk, een brug.
 * Op de Hamburgse kaarten ligt het wegdek bij een kwart van de rijstroken
 * meer dan 0,6 m boven de grond (p75 HafenCity 1,05 m, HamburgLi20 0,79 m).
 * Eerst telde zo'n plek als "past niet", en dan zei de app bij 16% van de
 * stukjes rijden op HafenCity (12% HamburgLi20, 4,5% Hamburg109_2) "Je bus
 * staat niet op ..." terwijl hij er gewoon stond. Nu:
 *
 *   - klopt: hooguit 0,6 m van het maaiveld;
 *   - kan niet: de tegel bestaat hier niet, of de bus staat meer dan 0,6 m
 *     ONDER het maaiveld -- een bus rijdt niet door de grond;
 *   - niets: erboven (brug, talud), of een tegel zonder hoogtebestand.
 *
 * Het oordeel "een andere kaart" (`anders`) volgt uit een van twee dingen:
 * minstens de helft van de plekken kan hier niet, of hier klopt minder dan een
 * kwart terwijl een andere kaart er wel goed bij past (75% of meer). Dat
 * tweede houdt de herkenning van een echt verkeerde kaart op peil: alleen
 * "kan niet" ving er 53% van, dit 80% (de oude regel 83%).
 *
 * Gemeten over 2600 stukjes rijden van zes tot acht plekken, op elke kaart
 * vanaf het begin van zijn rijstroken, met de hoogte van het wegdek (deel 2
 * van scripts/probe-kaartherkenning.ts): onterecht "andere kaart" 81 -> 1 (een
 * tunnel op HamburgLi20). Met twaalf plekken 72 -> 1.
 *
 * WISSELEN
 * De navigatie wisselt alleen naar een kaart die als enige 75% of meer haalt,
 * en als geen enkele andere kaart ook maar de helft haalt. Zonder die tweede
 * eis wisselde de app in 57 van de 31200 gevallen (bus op kaart K, app op een
 * andere) naar een derde kaart: Hamburg109_2 en HamburgLi20 naar Hamburg109
 * (hetzelfde terrein, één plek scheelt), TH_Wald naar Krefrath, Ahlheim naar
 * Region Grundorf. Met de eis: 0 foute wissels, en 12001 goede (38,5%) tegen
 * 12961 (41,5%) met de oude regel; met twaalf plekken 0 fout tegen 85. Van
 * de eigen kaart weg wisselde hij in beide nooit.
 *
 * Een kaart die overal op hoogte nul ligt, geeft op elke andere platte kaart
 * ook een treffer. Dan blijft het twijfel, en dan wisselt de app niet en meldt
 * hij niets: liever geen oordeel dan een vals.
 *
 * Alleen de `.terrain`-bestanden worden gelezen, één keer per tegel, plus
 * global.cfg en de tegellijst van elke kaart. Dat kostte de eerste keer 62 tot
 * 75 ms voor alle kaarten, en daarom draait dit in de kaartwerker (`herken`
 * en `elders` in core/kaartlaag.ts), niet in het hoofdproces.
 */

export interface Monster {
  tile: number
  x: number
  z: number
  y: number
}

/** Zo ver van het maaiveld mag de bus staan om als "op deze kaart" te tellen. */
const HOOGTE_M = 0.6
/** Een nieuw monster pas na zoveel meter, of op een andere tegel. */
const STAP_M = 50
const MAX_MONSTERS = 12
/** Vanaf zoveel monsters een oordeel. */
export const MIN_MONSTERS = 6
/** Zo'n deel moet op een kaart kloppen om daar een kandidaat te zijn. */
const KANDIDAAT = 0.75
/** Haalt een andere kaart dit ook, dan is de enige kandidaat niet zeker genoeg om heen te wisselen. */
const OOK_HALF = 0.5

/** Voegt de plek van de bus toe als die nieuw genoeg is; geeft de nieuwe lijst. */
export function neemMonster(
  monsters: Monster[],
  mem: { ok: number; tile: number; x: number; y: number; z: number } | undefined
): Monster[] {
  if (!mem || mem.ok !== 1 || ![mem.tile, mem.x, mem.y, mem.z].every(Number.isFinite)) return monsters
  const vorige = monsters[monsters.length - 1]
  if (vorige && vorige.tile === mem.tile && Math.hypot(vorige.x - mem.x, vorige.z - mem.z) < STAP_M) return monsters
  const uit = [...monsters, { tile: mem.tile, x: mem.x, z: mem.z, y: mem.y }]
  return uit.length > MAX_MONSTERS ? uit.slice(uit.length - MAX_MONSTERS) : uit
}

interface KaartTegels {
  lijst: Array<{ tx: number; ty: number; file: string }>
  bestaat: Map<number, boolean>
  grid: TileGrid | undefined
}

const tegelCache = new Map<string, KaartTegels>()

function tegelsVan(mapPath: string): KaartTegels {
  let bewaard = tegelCache.get(mapPath)
  if (bewaard) return bewaard
  let lijst: KaartTegels['lijst'] = []
  try {
    lijst = readTileList(mapPath)
  } catch {
    lijst = []
  }
  bewaard = { lijst, bestaat: new Map(), grid: lijst.length > 0 ? readTileGrid(mapPath) : undefined }
  tegelCache.set(mapPath, bewaard)
  return bewaard
}

/** Wat één plek van de bus over een kaart zegt; zie hierboven. */
export type Plek = 'klopt' | 'kanNiet' | 'open'

export function plekOp(mapPath: string, monster: Monster): Plek {
  const tegels = tegelsVan(mapPath)
  const tegel = tegels.lijst[monster.tile]
  if (!tegel || !tegels.grid) return 'kanNiet'
  let bestaat = tegels.bestaat.get(monster.tile)
  if (bestaat === undefined) {
    bestaat = existsSync(join(mapPath, tegel.file))
    tegels.bestaat.set(monster.tile, bestaat)
  }
  if (!bestaat) return 'kanNiet'
  const grond = terrainHeight(mapPath, tegel.tx, tegel.ty, monster.x, monster.z, tegels.grid.size(tegel.ty))
  if (grond === undefined) return 'open'
  const verschil = monster.y - grond
  if (Math.abs(verschil) <= HOOGTE_M) return 'klopt'
  return verschil < -HOOGTE_M ? 'kanNiet' : 'open'
}

/** Staat dit monster op deze kaart op de grond? */
export function monsterKlopt(mapPath: string, monster: Monster): boolean {
  return plekOp(mapPath, monster) === 'klopt'
}

/** Welk deel van de monsters op deze kaart klopt. */
export function aandeelOp(mapPath: string, monsters: Monster[]): number {
  return telling(mapPath, monsters).klopt
}

/** Welk deel klopt, en welk deel kan hier niet. */
function telling(mapPath: string, monsters: Monster[]): { klopt: number; kanNiet: number } {
  if (monsters.length === 0) return { klopt: 0, kanNiet: 0 }
  let klopt = 0
  let kanNiet = 0
  for (const monster of monsters) {
    const plek = plekOp(mapPath, monster)
    if (plek === 'klopt') klopt++
    else if (plek === 'kanNiet') kanNiet++
  }
  return { klopt: klopt / monsters.length, kanNiet: kanNiet / monsters.length }
}

export type Oordeel = 'zeker' | 'anders' | 'twijfel'

/**
 * Staat de bus op deze kaart? De helft of meer klopt: zeker. De helft of meer
 * kan hier niet: een andere kaart. Minder dan een kwart klopt en `elders`
 * andere kaarten passen wel (75%+): ook een andere kaart. Anders, of met te
 * weinig monsters: twijfel.
 */
export function oordeelOver(mapPath: string, monsters: Monster[], elders = 0): Oordeel {
  if (monsters.length < MIN_MONSTERS) return 'twijfel'
  return oordeelUit(telling(mapPath, monsters), elders)
}

function oordeelUit(hier: { klopt: number; kanNiet: number }, elders: number): Oordeel {
  // Bij een gelijke stand (drie klopt, drie kan niet) wint "zeker": liever geen melding dan een valse.
  if (hier.klopt >= 0.5) return 'zeker'
  if (hier.kanNiet >= 0.5) return 'anders'
  if (hier.klopt < 0.25 && elders >= 1) return 'anders'
  return 'twijfel'
}

/** De kaarten waar de bus wel op staat: 75 procent van de monsters of meer. */
export function kandidaatKaarten(omsiPath: string, mappen: string[], monsters: Monster[]): string[] {
  if (monsters.length < MIN_MONSTERS) return []
  return mappen.filter((folder) => aandeelOp(join(omsiPath, 'maps', folder), monsters) >= KANDIDAAT)
}

export interface Herkenning {
  oordeel: Oordeel
  /** De andere kaarten waar de bus goed op past (75%+); alleen uitgerekend als het ertoe deed. */
  kandidaten: string[]
  /** Hierheen mag de navigatie wisselen: de enige kandidaat, en geen andere kaart die ook maar half past. */
  wisselNaar?: string
}

/**
 * Het hele oordeel over de kaart `folder`, met de andere kaarten erbij als dat
 * nodig is. Past de bus hier (de helft of meer), dan worden de andere kaarten
 * niet gelezen.
 */
export function herkenKaart(omsiPath: string, folder: string, mappen: string[], monsters: Monster[]): Herkenning {
  if (monsters.length < MIN_MONSTERS) return { oordeel: 'twijfel', kandidaten: [] }
  const hier = telling(join(omsiPath, 'maps', folder), monsters)
  if (hier.klopt >= 0.5 || (hier.kanNiet < 0.5 && hier.klopt >= 0.25)) {
    return { oordeel: oordeelUit(hier, 0), kandidaten: [] }
  }
  const andere = mappen
    .filter((item) => item !== folder)
    .map((item) => ({ folder: item, klopt: aandeelOp(join(omsiPath, 'maps', item), monsters) }))
  const kandidaten = andere.filter((item) => item.klopt >= KANDIDAAT).map((item) => item.folder)
  const oordeel = oordeelUit(hier, kandidaten.length)
  const half = andere.filter((item) => item.klopt >= OOK_HALF)
  const wisselNaar =
    oordeel === 'anders' && kandidaten.length === 1 && half.length === 1 ? kandidaten[0] : undefined
  return { oordeel, kandidaten, wisselNaar }
}
