/**
 * Welke bestanden mist een kaart?
 *
 *   npx tsx scripts/probe-mapfiles.ts "Ahlheim 5"
 *
 * Een OMSI-kaart bestaat uit tegels, en in elke tegel staat welk object of welke
 * spline er waar staat -- met een pad naar een bestand ergens in de OMSI-map.
 * Die objecten en splines wijzen op hun beurt naar een model (`.o3d`) en naar
 * texturen, en in dat model staan nog eens texturen genoemd. Ontbreekt er
 * ergens iets in die keten, dan tekent OMSI daar niets of iets blanks: een weg
 * zonder wegdek, huizen die er niet zijn, een kruising die een gat is.
 *
 * Deze proef loopt de hele keten af en zegt wat er niet staat, gegroepeerd per
 * pakket -- zodat je ziet welke download je mist en niet tweeduizend losse
 * regels. Er wordt alleen gelezen.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { readOmsiLines } from '../src/core/omsiFile'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')

const folder = process.argv[2]
if (!folder) throw new Error('Welke kaart? Bijvoorbeeld: npx tsx scripts/probe-mapfiles.ts "Ahlheim 5"')
const mapPath = join(omsi, 'maps', folder)
if (!existsSync(mapPath)) throw new Error(`Kaart ${folder} niet gevonden in ${join(omsi, 'maps')}`)

/** Wat op een pad naar een object of een spline lijkt, zoals het in een tegel staat. */
const SCENERY = /^[A-Za-z0-9_][^\r\n<>|?*"]*\.(sco|sli)$/i
/** Wat op een model of een textuur lijkt, zoals het in een .sco of .sli staat. */
const ASSET = /^[A-Za-z0-9_][^\r\n<>|?*"\\/]*\.(o3d|bmp|dds|tga|jpg|jpeg|png)$/i
/** Losse tekst in een `.o3d`: daar staan de texturen van het model in. */
const IN_MESH = /[A-Za-z0-9_][A-Za-z0-9_ .()-]{0,80}\.(bmp|dds|tga|jpg|jpeg|png)/gi

/** Wie vraagt erom, en hoe vaak. */
interface Use {
  count: number
  /** Een van de bestanden dat ernaar verwijst; genoeg om het na te zoeken. */
  by: string
}

const wanted = new Map<string, Use>()
const note = (file: string, by: string, count = 1): void => {
  const key = file.replace(/\//g, '\\')
  const row = wanted.get(key)
  if (row) row.count += count
  else wanted.set(key, { count, by })
}

// ---- laag 1: de tegels ----
const tiles = readdirSync(mapPath).filter((entry) => /^tile_-?\d+_-?\d+\.map$/i.test(entry))
const scenery = new Map<string, number>()
for (const tile of tiles) {
  let lines: string[]
  try {
    lines = readOmsiLines(join(mapPath, tile))
  } catch {
    console.log(`kon ${tile} niet lezen`)
    continue
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!SCENERY.test(line)) continue
    const key = line.replace(/\//g, '\\')
    scenery.set(key, (scenery.get(key) ?? 0) + 1)
    note(key, `maps\\${folder}\\${tile}`)
  }
}

// ---- laag 2: wat die objecten en splines zelf opvragen ----
const meshes = new Map<string, string>()
for (const [file, count] of scenery) {
  const full = join(omsi, file)
  if (!existsSync(full)) continue
  let lines: string[]
  try {
    lines = readOmsiLines(full)
  } catch {
    continue
  }
  const dir = dirname(file)
  for (const raw of lines) {
    const line = raw.trim()
    if (!ASSET.test(line)) continue
    /*
     * OMSI's indeling: modellen in `model\`, texturen in `texture\`, naast het
     * object of de spline zelf. Zo staat het ook in de meldingen van het spel.
     */
    const sub = line.toLowerCase().endsWith('.o3d') ? 'model' : 'texture'
    const target = `${dir}\\${sub}\\${line}`
    note(target, file, count)
    if (sub === 'model') meshes.set(target, file)
  }
}

// ---- laag 3: de texturen die in een model genoemd staan ----
for (const [mesh, by] of meshes) {
  const full = join(omsi, mesh)
  if (!existsSync(full)) continue
  let blob: string
  try {
    blob = readFileSync(full).toString('latin1')
  } catch {
    continue
  }
  const dir = dirname(dirname(mesh))
  for (const found of blob.matchAll(IN_MESH)) {
    const name = found[0].trim()
    if (name.length < 5) continue
    note(`${dir}\\texture\\${name}`, `${by} -> ${mesh}`)
  }
}

const missing = [...wanted.entries()].filter(([file]) => !existsSync(join(omsi, file)))

/*
 * Twee soorten missers, en alleen de eerste is nieuws.
 *
 * Een object, een spline of een model dat ontbreekt, ontbreekt echt: daar tekent
 * OMSI niets. Een textuur die ontbreekt, ontbreekt lang niet altijd. OMSI tekent
 * een hoop textuurnamen zelf -- straatnaamborden, vertrekdisplays, het rolbord
 * voorop de bus -- en die staan nergens als bestand; een winterversie staat in
 * een andere map; en een model dat een textuur noemt die het niet gebruikt komt
 * ook voor. Ter controle: Grundorf uit het basisspel meldt er zo achtendertig,
 * en dat is een kaart die het prima doet. Gebruik die lijst dus alleen om twee
 * kaarten met elkaar te vergelijken, niet als boodschappenlijstje.
 */
const hard = missing.filter(([file]) => /\.(sco|sli|o3d)$/i.test(file))
const soft = missing.filter(([file]) => !/\.(sco|sli|o3d)$/i.test(file))

console.log(
  `${folder}: ${tiles.length} tegels, ${scenery.size} objecten en splines, ` +
    `${wanted.size} bestanden in totaal`
)

console.log(`\n== wat er echt ontbreekt: ${hard.length} objecten, splines of modellen`)
if (hard.length === 0) {
  console.log('   niets. Alles wat de kaart neerzet, staat er.')
} else {
  for (const [file, use] of hard.sort((a, b) => b[1].count - a[1].count).slice(0, 30)) {
    console.log(`   ${String(use.count).padStart(5)}x  ${file}`)
    console.log(`          gevraagd door ${use.by}`)
  }
  if (hard.length > 30) console.log(`   ... en nog ${hard.length - 30}`)
}

console.log(
  `\n== texturen die niet als bestand te vinden zijn: ${soft.length}` +
    '\n   Let op: dit zegt weinig. OMSI tekent veel van deze namen zelf (borden,' +
    '\n   displays), en ook kaarten die het prima doen melden er tientallen.'
)
const perPackage = new Map<string, number>()
for (const [file, use] of soft) {
  const parts = file.split('\\')
  const key = parts.slice(0, Math.min(2, parts.length - 1)).join('\\')
  perPackage.set(key, (perPackage.get(key) ?? 0) + use.count)
}
for (const [key, count] of [...perPackage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`   ${String(count).padStart(6)}x  ${key}`)
}

process.exit(hard.length === 0 ? 0 : 1)
