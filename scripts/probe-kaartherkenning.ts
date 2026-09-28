/**
 * Herkent de app aan de plek van de bus op welke kaart OMSI rijdt?
 * (core/kaartherkenning.ts)
 *
 *   npx tsx scripts/probe-kaartherkenning.ts [--snel]
 *
 * Twee soorten grondwaarheid.
 *
 * 1. De bussen die OMSI zelf wegschreef, in `laststn.osn`, de kopie
 *    `laststn.osn.voor-omsi-enhancer` en de situaties in `Situations`. Een
 *    voertuigblok noemt zijn tegel als x en y van de bestandsnaam; dat wordt
 *    het tegelnummer uit global.cfg, zoals de plugin het doorgeeft. Plus het
 *    monster van 21-09 (Hohenkirchen, tegel 152) en de inzetpunten van elke
 *    kaart (daar zet OMSI de bus exact neer).
 *
 * 2. Stukjes rijden (niet met --snel): per kaart 200 keer zes tot acht plekken
 *    binnen 600 m, 50 m uit elkaar, op het begin van een rijstrook en op de
 *    hoogte van het wegdek -- zo verzamelt de app ze onderweg. Het wegdek ligt
 *    in Hamburg vaak een meter of meer boven het maaiveld; daar ging de oude
 *    regel mis ("Je bus staat niet op ..." op de eigen kaart).
 *
 * Moet: de eigen kaart wordt nooit `anders` en nooit weggewisseld (op de
 * stukjes rijden hooguit 0,2% `anders`: een tunnel); een verkeerde kaart in de
 * app wisselt nooit naar een DERDE kaart; HafenCity en Li20, die dezelfde tegels
 * delen, wisselen niet naar elkaar. En de herkenning moet blijven werken: een
 * verkeerde kaart in de app wordt op de stukjes rijden minstens 75% herkend.
 *
 * Alleen lezen; de rijstroken worden in een tijdelijke map ingelezen.
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { herkenKaart, MIN_MONSTERS, neemMonster, type Monster } from '../src/core/kaartherkenning'
import { leesInzetpunten } from '../src/core/beginplek'
import { readTileGrid } from '../src/core/geo'
import { maakKaartlaag } from '../src/core/kaartlaag'
import { readOmsiLines } from '../src/core/omsiFile'
import { readTileList } from '../src/core/track'
import { listMaps } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) {
  console.log('Geen OMSI 2 gevonden; proef overgeslagen.')
  process.exit(0)
}
const snel = process.argv.includes('--snel')
const mappen = listMaps(omsi)
let fout = 0

/* ---- 1. situaties en inzetpunten ---- */

/* Alle bussen uit situaties die OMSI zelf schreef, per kaart. */
const perKaart = new Map<string, Monster[]>()
const bestanden: string[] = []
for (const naam of readdirSync(join(omsi, 'Situations'))) {
  if (/\.osn$/i.test(naam)) bestanden.push(join(omsi, 'Situations', naam))
}
for (const folder of readdirSync(join(omsi, 'maps'))) {
  for (const naam of ['laststn.osn', 'laststn.osn.voor-omsi-enhancer', 'laststn.osn.voor-omsi-career']) {
    const pad = join(omsi, 'maps', folder, naam)
    if (existsSync(pad)) bestanden.push(pad)
  }
}
for (const bestand of bestanden) {
  let regels: string[]
  try {
    regels = readOmsiLines(bestand)
  } catch {
    continue
  }
  const naamAt = regels.findIndex((regel) => regel.trim() === '[name]')
  if (naamAt >= 0 && /^\s*OMSI (Enhancer|Career)/i.test(regels[naamAt + 1] ?? '')) continue
  const kaartAt = regels.findIndex((regel) => regel.trim() === '[map]')
  const folder = (regels[kaartAt + 1] ?? '').match(/maps[\\/]([^\\/]+)[\\/]/i)?.[1]
  if (!folder) continue
  const echt = mappen.find((item) => item.toLowerCase() === folder.toLowerCase())
  if (!echt) continue
  const tegels = readTileList(join(omsi, 'maps', echt))
  let lijst = perKaart.get(echt) ?? []
  regels.forEach((regel, k) => {
    if (regel.trim() !== '[vehicle]') return
    const x = Number(regels[k + 2])
    const y = Number(regels[k + 3])
    const z = Number(regels[k + 4])
    const tx = Number(regels[k + 12])
    const ty = Number(regels[k + 13])
    const tile = tegels.findIndex((tegel) => tegel.tx === tx && tegel.ty === ty)
    if (tile < 0) return
    lijst = neemMonster(lijst, { ok: 1, tile, x, y, z })
  })
  perKaart.set(echt, lijst)
}

/*
 * Te weinig: op deze installatie schreef OMSI zelf maar een handvol situaties
 * (de rest is van de app, en die telt niet). Daarom ook de inzetpunten van elke
 * kaart: daar zet OMSI de bus exact neer, met dezelfde hoogte (tegenlezing,
 * `quat.cjs`). Die komen apart, zodat te zien is wat elk van beide zegt.
 */
const uitInzetpunten = new Map<string, Monster[]>()
for (const folder of mappen) {
  let lijst: Monster[] = []
  for (const punt of leesInzetpunten(join(omsi, 'maps', folder))) {
    lijst = neemMonster(lijst, { ok: 1, tile: punt.tile, x: punt.x, y: punt.y, z: punt.z })
  }
  uitInzetpunten.set(folder, lijst)
}

/* Het monster van 21-09: Hohenkirchen, tegel 152. */
{
  const echt = mappen.find((item) => /hohenkirchen/i.test(item))
  if (echt) perKaart.set(echt, neemMonster(perKaart.get(echt) ?? [], { ok: 1, tile: 152, x: 250.863, y: 6.969, z: 154.63 }))
}

const zelfdeTegels = (a: string, b: string): boolean => /hafencity/i.test(a + b) && /li20/i.test(a + b)
const reeksen: Array<[string, string, Monster[]]> = [
  ...[...perKaart].map(([folder, monsters]): [string, string, Monster[]] => [folder, 'situaties', monsters]),
  ...[...uitInzetpunten].map(([folder, monsters]): [string, string, Monster[]] => [folder, 'inzetpunten', monsters])
]
/* Ook in groepjes van zes, zoals de app ze onderweg verzamelt. */
for (const [folder, bron, monsters] of [...reeksen]) {
  if (bron !== 'inzetpunten') continue
  for (let i = 0; i + MIN_MONSTERS <= monsters.length && i < 60; i += MIN_MONSTERS) {
    reeksen.push([folder, `inzetpunten ${i}-${i + MIN_MONSTERS - 1}`, monsters.slice(i, i + MIN_MONSTERS)])
  }
}
let beoordeeld = 0
let zekerTeller = 0
let goedGewisseld = 0
let wisselKansen = 0
for (const [folder, bron, monsters] of reeksen) {
  if (monsters.length < MIN_MONSTERS) {
    if (!bron.startsWith('inzetpunten ')) console.log(`${folder.padEnd(26)} ${bron}: ${monsters.length} monsters, te weinig voor een oordeel`)
    continue
  }
  beoordeeld++
  const eigen = herkenKaart(omsi, folder, mappen, monsters)
  /* De app op elke andere kaart: waar wisselt hij heen? */
  const andere = mappen
    .filter((item) => item !== folder)
    .map((item) => ({ item, uit: herkenKaart(omsi, item, mappen, monsters) }))
  const foutGewisseld = andere.filter((a) => a.uit.wisselNaar && a.uit.wisselNaar !== folder)
  const goed = andere.filter((a) => a.uit.wisselNaar === folder)
  wisselKansen += andere.length
  goedGewisseld += goed.length
  /*
   * De eigen kaart hoort zeker te zijn, met één uitzondering: een groepje van
   * zes inzetpunten dat toevallig op bruggen en taluds ligt mag twijfelen --
   * twijfel wisselt niet en meldt niets. Een oordeel "anders" over de eigen
   * kaart is altijd fout: dan meldt de app een andere kaart.
   */
  const nietZeker = bron.startsWith('inzetpunten ') ? eigen.oordeel === 'anders' : eigen.oordeel !== 'zeker'
  if (eigen.oordeel === 'zeker') zekerTeller++
  const wegGewisseld = eigen.wisselNaar !== undefined
  /* Twee kaarten met dezelfde tegels: nooit van de ene naar de andere. */
  const tweeling = andere.some((a) => zelfdeTegels(folder, a.item) && a.uit.wisselNaar !== undefined)
  if (foutGewisseld.length > 0 || nietZeker || wegGewisseld || tweeling) fout++
  if (bron.startsWith('inzetpunten ') && foutGewisseld.length === 0 && !nietZeker && !wegGewisseld && !tweeling) continue
  console.log(
    `${folder.padEnd(26)} ${bron}, ${monsters.length} monsters: eigen kaart ${eigen.oordeel}; ` +
      `vanaf een andere kaart: ${andere.filter((a) => a.uit.oordeel === 'anders').length} van ${andere.length} herkend, ` +
      `${goed.length} keer hierheen gewisseld` +
      (foutGewisseld.length ? `  <-- FOUT GEWISSELD naar ${[...new Set(foutGewisseld.map((a) => a.uit.wisselNaar))].join(', ')}` : '') +
      (nietZeker ? '  <-- EIGEN KAART NIET ZEKER' : '') +
      (wegGewisseld ? `  <-- WEG VAN DE EIGEN KAART naar ${eigen.wisselNaar}` : '') +
      (tweeling ? '  <-- GEWISSELD TUSSEN KAARTEN MET DEZELFDE TEGELS' : '')
  )
}
console.log(
  `${beoordeeld} reeksen beoordeeld, ${zekerTeller} keer de eigen kaart zeker; ` +
    `vanaf een andere kaart ${goedGewisseld} van ${wisselKansen} keer hierheen gewisseld`
)

/* ---- 2. stukjes rijden ---- */

if (!snel) {
  const laag = maakKaartlaag(omsi, mkdtempSync(join(tmpdir(), 'probe-kaartherkenning-')))
  let rnd = 987654
  const random = (): number => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
    return rnd / 0x7fffffff
  }
  const RITJES = 200
  const tel = { eigen: 0, eigenAnders: 0, eigenWeg: 0, verkeerd: 0, herkend: 0, goed: 0, fout: 0 }
  const perKaartAnders = new Map<string, number>()
  const foutNaar = new Set<string>()
  for (const folder of mappen) {
    const pad = join(omsi, 'maps', folder)
    const grid = readTileGrid(pad)
    if (!grid) continue
    const index = new Map(readTileList(pad).map((tegel, i) => [`${tegel.tx},${tegel.ty}`, i]))
    let stroken
    try {
      stroken = laag.stroken(folder)
    } catch {
      continue
    }
    const plekken: Array<Monster & { wx: number; wy: number }> = []
    for (const strook of stroken) {
      if (strook.height === undefined || strook.points.length < 2) continue
      const [wx, wy] = strook.points
      const plek = grid.at(wx, wy)
      const tile = index.get(`${plek.tx},${plek.ty}`)
      if (tile !== undefined) plekken.push({ tile, x: plek.localX, z: plek.localZ, y: strook.height, wx, wy })
    }
    if (plekken.length < 50) continue
    for (let r = 0; r < RITJES; r++) {
      const start = plekken[Math.floor(random() * plekken.length)]
      const dichtbij = plekken
        .map((m) => ({ m, d: Math.hypot(m.wx - start.wx, m.wy - start.wy) }))
        .filter((item) => item.d <= 600)
        .sort((a, b) => a.d - b.d)
      const gekozen: Array<Monster & { wx: number; wy: number }> = []
      for (const item of dichtbij) {
        if (gekozen.every((g) => Math.hypot(g.wx - item.m.wx, g.wy - item.m.wy) >= 50)) gekozen.push(item.m)
        if (gekozen.length >= 8) break
      }
      if (gekozen.length < MIN_MONSTERS) continue
      const monsters: Monster[] = gekozen.map(({ tile, x, y, z }) => ({ tile, x, y, z }))
      for (const app of mappen) {
        const uit = herkenKaart(omsi, app, mappen, monsters)
        if (app === folder) {
          tel.eigen++
          if (uit.oordeel === 'anders') {
            tel.eigenAnders++
            perKaartAnders.set(folder, (perKaartAnders.get(folder) ?? 0) + 1)
          }
          if (uit.wisselNaar) tel.eigenWeg++
        } else {
          tel.verkeerd++
          if (uit.oordeel === 'anders') tel.herkend++
          if (uit.wisselNaar === folder) tel.goed++
          else if (uit.wisselNaar) {
            tel.fout++
            foutNaar.add(`${folder} -> ${uit.wisselNaar} (app op ${app})`)
          }
        }
      }
    }
  }
  const pct = (a: number, b: number): string => `${a}/${b} (${((a / Math.max(1, b)) * 100).toFixed(1)}%)`
  console.log(
    `stukjes rijden, eigen kaart: onterecht "andere kaart" ${pct(tel.eigenAnders, tel.eigen)}` +
      `${perKaartAnders.size ? ` [${[...perKaartAnders].map(([k, n]) => `${k} ${n}`).join(', ')}]` : ''}, ` +
      `weggewisseld ${tel.eigenWeg}`
  )
  console.log(
    `stukjes rijden, verkeerde kaart in de app: herkend ${pct(tel.herkend, tel.verkeerd)}, ` +
      `naar de goede gewisseld ${pct(tel.goed, tel.verkeerd)}, naar een derde kaart ${tel.fout}`
  )
  for (const regel of foutNaar) console.log(`  FOUT GEWISSELD: ${regel}`)
  if (tel.eigenAnders > tel.eigen * 0.002) {
    console.log('  <-- TE VAAK "ANDERE KAART" OP DE EIGEN KAART')
    fout++
  }
  if (tel.eigenWeg > 0 || tel.fout > 0) fout++
  if (tel.herkend < tel.verkeerd * 0.75) {
    console.log('  <-- EEN VERKEERDE KAART WORDT TE WEINIG HERKEND')
    fout++
  }
}

console.log(fout === 0 ? 'kaartherkenning: goed' : `KAARTHERKENNING KLOPT NIET (${fout})`)
process.exit(fout === 0 ? 0 : 1)
