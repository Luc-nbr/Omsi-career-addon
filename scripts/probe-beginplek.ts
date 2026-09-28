/**
 * Waar zet vrij rijden de bus neer? (core/beginplek.ts, `vrijCheck` in core/kaartlaag.ts)
 *
 *   npx tsx scripts/probe-beginplek.ts [kaart ...]
 *
 * Per kaart:
 * - de inzetpunten uit `[entrypoints]`, en of hun hoogte klopt: binnen 3 m van
 *   het maaiveld of van een rijstrook (anders zakt de bus weg of zweeft hij);
 * - de plek die gekozen wordt om 14:05, 08:00 en 02:00 op de automatische
 *   datum, met hoeveel ritten er vertrekken.
 * Moet: elke speelbare kaart heeft om 14:05 en om 08:00 een plek met minstens
 * één vertrek; Wenen (geen tegels) is `onvolledig`.
 *
 * Daarna het schrijven, in een tijdelijke map en nooit in de spelmap:
 * - het `[vehicle]`-blok draagt precies het quaternion van het inzetpunt;
 * - het sjabloon slaat de situaties van de app zelf over;
 * - een oud weerbestand wordt opgeruimd als er geen nieuw weer is, ook naast
 *   `laststn.osn` (presetStartup, op een nagemaakte OMSI-map).
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kiesVertrekplek, koersVan, vertrekkenOp } from '../src/core/beginplek'
import { findOmsiInstall } from '../src/core/install'
import { maakKaartlaag } from '../src/core/kaartlaag'
import { buildSituation, findTemplate, writeSituation } from '../src/core/situation'
import { presetStartup } from '../src/core/startup'
import { terrainHeight } from '../src/core/terrain'
import { readTileGrid } from '../src/core/geo'
import { listMaps } from '../src/core/timetable'

const omsi = findOmsiInstall()
if (!omsi) {
  console.log('Geen OMSI 2 gevonden; proef overgeslagen.')
  process.exit(0)
}
const only = process.argv.slice(2)
const werk = mkdtempSync(join(tmpdir(), 'omsi-beginplek-'))
const laag = maakKaartlaag(omsi, join(werk, 'userdata'))
const hhmm = (m: number): string => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`

let fout = 0
const meld = (tekst: string): void => {
  fout++
  console.log(`  FOUT ${tekst}`)
}

for (const folder of listMaps(omsi)) {
  if (only.length > 0 && !only.includes(folder)) continue
  const pad = join(omsi, 'maps', folder)
  const punten = laag.inzetpunten(folder)
  const check14 = laag.vrijCheck(folder, { tijd: 14 * 60 + 5 })
  if (!check14.ok) {
    console.log(`${folder.padEnd(26)} ${punten.length} inzetpunten; ${check14.fout}`)
    if (/vienna/i.test(folder)) {
      if (check14.fout !== 'onvolledig') meld(`${folder}: verwacht onvolledig, kreeg ${check14.fout}`)
    } else meld(`${folder}: geen plek (${check14.fout})`)
    continue
  }

  /* De hoogte van elk punt: maaiveld of rijstrook, binnen 3 m. */
  const grid = readTileGrid(pad)
  const net = laag.rijstrokennet(folder)
  let hoogteGoed = 0
  for (const punt of punten) {
    const grond = grid ? terrainHeight(pad, punt.tx, punt.ty, punt.x, punt.z, grid.size(punt.ty)) : undefined
    const stroken = net.heightsNear({ id: '', name: '', x: punt.wereld.x, y: punt.wereld.y }, 15)
    const past = (grond !== undefined && Math.abs(grond - punt.y) <= 3) || stroken.some((h) => Math.abs(h - punt.y) <= 3)
    if (past) hoogteGoed++
  }
  if (hoogteGoed < punten.length) meld(`${folder}: ${punten.length - hoogteGoed} inzetpunten niet op maaiveld of rijstrook`)

  const uit: string[] = []
  for (const tijd of [14 * 60 + 5, 8 * 60, 2 * 60]) {
    const check = tijd === 14 * 60 + 5 ? check14 : laag.vrijCheck(folder, { tijd })
    const plek = check.plek
    if (!check.ok || !plek) {
      uit.push(`${hhmm(tijd)} -> ${check.fout}`)
      if (tijd !== 2 * 60) meld(`${folder} ${hhmm(tijd)}: geen plek`)
      continue
    }
    uit.push(`${hhmm(tijd)} -> "${plek.naam}" (${plek.bron}, ${plek.aantal}${plek.tot !== undefined ? ` tot ${hhmm(plek.tot)}` : ''})`)
    if (tijd !== 2 * 60 && plek.aantal < 1) meld(`${folder} ${hhmm(tijd)}: "${plek.naam}" zonder vertrek`)
  }
  /*
   * 's Nachts met een automatische tijd: naar vlak voor het eerste vertrek bij
   * een inzetpunt. De klok van de pc valt hier niet te zetten, dus de keuze
   * zelf, met dezelfde vertrekken als de controle.
   */
  const vertrekken = vertrekkenOp(laag.map(folder), laag.geometrie(folder), new Date(`${check14.moment.iso}T00:00:00Z`), laag.kalender(folder), omsi)
  const nacht = kiesVertrekplek(punten, vertrekken, { klok: 2 * 60, tijdAutomatisch: true })
  const nachtTekst = nacht
    ? `02:00 automatisch -> "${nacht.naam}" (${nacht.bron}${nacht.eerste !== undefined ? `, eerste ${hhmm(nacht.eerste)}` : ''}, ${nacht.aantal}) om ${hhmm(nacht.klok)}`
    : '02:00 automatisch -> niets'
  if (!nacht || nacht.aantal < 1) meld(`${folder} 02:00 automatisch: geen vertrek`)
  console.log(`${folder.padEnd(26)} ${punten.length} inzetpunten (${hoogteGoed} op hoogte), datum ${check14.moment.iso}; ${uit.join(' | ')} | ${nachtTekst}`)
}

/* ---- Het quaternion gaat ongewijzigd mee ---- */
{
  const q: [number, number, number, number] = [0, -0.325, 0, 0.946]
  const regels = buildSituation({
    mapFolder: 'Krefrath',
    name: 'proef',
    description: '',
    year: 2020,
    dayOfYear: 100,
    minutes: 845,
    vehicle: { relativePath: 'Vehicles\\proef\\bus.bus', lineNumber: '', terminus: '' },
    spawn: { tx: 1, ty: 2, x: 174.993, z: 297.511, height: 0.15, heading: koersVan(q), quaternion: q }
  })
  const at = regels.indexOf('[vehicle]')
  const gelezen = regels.slice(at + 5, at + 9)
  const goed = at > 0 && gelezen.join(',') === '0.000000,-0.325000,0.000000,0.946000'
  if (!goed) meld(`quaternion in [vehicle]: ${gelezen.join(',')}`)
  console.log(`quaternion in de situatie: ${gelezen.join(', ')} ${goed ? '(ongewijzigd)' : ''}; koers ${koersVan(q).toFixed(1)} graden`)
}

/* ---- Het sjabloon zonder eigen situaties, en het oude weer opgeruimd ---- */
{
  const nep = join(werk, 'omsi')
  const kaart = 'ProefKaart'
  mkdirSync(join(nep, 'maps', kaart), { recursive: true })
  mkdirSync(join(nep, 'Situations'), { recursive: true })
  const osn = (naam: string, jaar: number): Buffer =>
    Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(['[name]', naam, '[description]', '', '[end]', '', '[map]', `maps\\${kaart}\\global.cfg`, '', '[time]', String(jaar), '120', '8', '0', '0', '', '[ismyVehicle]', ''].join('\r\n'), 'utf16le')
    ])
  writeFileSync(join(nep, 'maps', kaart, 'laststn.osn'), osn('OMSI Enhancer — vrij rijden', 2031))
  writeFileSync(join(nep, 'maps', kaart, 'laststn.osn.voor-omsi-enhancer'), osn('Door OMSI', 1994))
  writeFileSync(join(nep, 'maps', kaart, 'laststn.osn.owt'), 'oud weer')
  writeFileSync(join(nep, 'options.cfg'), '[last_map]\r\nmaps\\Ergens\\global.cfg\r\n', 'latin1')
  const zonder = findTemplate(nep, kaart, { zonderEigen: true })
  const met = findTemplate(nep, kaart)
  const sjabloonGoed = Boolean(zonder?.endsWith('.voor-omsi-enhancer')) && Boolean(met?.endsWith('laststn.osn'))
  if (!sjabloonGoed) meld(`sjabloon: zonder eigen ${zonder}, met ${met}`)

  const into = join(werk, 'situaties')
  mkdirSync(into, { recursive: true })
  writeFileSync(join(into, 'OMSI Enhancer.osn.owt'), 'oud weer')
  const result = writeSituation(nep, {
    mapFolder: kaart,
    name: 'proef',
    description: '',
    year: 1994,
    dayOfYear: 120,
    minutes: 480,
    into
  })
  const weerWeg = !existsSync(join(into, 'OMSI Enhancer.osn.owt'))
  const start = presetStartup(nep, kaart, result.file)
  const laatsteWeerWeg = !existsSync(join(nep, 'maps', kaart, 'laststn.osn.owt'))
  const opties = readFileSync(join(nep, 'options.cfg'), 'latin1')
  if (!weerWeg) meld('oud OMSI Enhancer.osn.owt bleef staan')
  if (!laatsteWeerWeg) meld('oud laststn.osn.owt bleef staan')
  if (!start.lastSituation || !start.lastMap || !opties.includes(kaart)) meld('presetStartup op de nagemaakte map mislukte')
  console.log(
    `sjabloon zonder eigen: ${zonder?.split(/[\\/]/).pop()}; oud weer weg: situatie ${weerWeg}, laststn ${laatsteWeerWeg}`
  )
  // Met een eigen .owt in het sjabloon gaat dat weer mee.
  writeFileSync(join(nep, 'maps', kaart, 'laststn.osn.voor-omsi-enhancer.owt'), 'weer van de kaart')
  writeSituation(nep, { mapFolder: kaart, name: 'proef', description: '', year: 1994, dayOfYear: 120, minutes: 480, into })
  const meegenomen = existsSync(join(into, 'OMSI Enhancer.osn.owt')) && readFileSync(join(into, 'OMSI Enhancer.osn.owt'), 'utf8') === 'weer van de kaart'
  if (!meegenomen) meld('het weer van het sjabloon ging niet mee')
  void copyFileSync
}

rmSync(werk, { recursive: true, force: true })
console.log(fout === 0 ? 'beginplek: goed' : `BEGINPLEK KLOPT NIET (${fout})`)
process.exit(fout === 0 ? 0 : 1)
