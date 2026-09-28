/**
 * Meer mapsoorten: komen objecten, splines, mensen, weer, lettertypen en een
 * kaartset op de goede plek, in plaats van "niet geplaatst"?
 *
 *   npx tsx scripts/probe-mapsoorten.ts       (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Eerst `plaatsVan` op add-ons zoals ze verspreid worden: alleen de eigen map
 * van het pakket, of zelfs losse bestanden zonder map. Dan een echte
 * installatie in een nagebouwde OMSI-map. En als er een echte OMSI staat,
 * wordt die (alleen gelezen) nagekeken op wat `plaatsVan` aanneemt: dat
 * Weather, Fonts, Drivers en Trains platte mappen zijn, en Sceneryobjects,
 * Splines, Humans en TicketPacks een map per pakket hebben.
 *
 * Op de oude code (vóór 28-09) faalt dit: alleen bussen en kaarten werden
 * herkend.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { installeerStappen, loopAf, openBron, plaatsVan, planStappen } from '../src/core/addon'
import { findOmsiInstall } from '../src/core/install'
import { einde, klopt, maakZip, nepOmsi, proefMap } from './proefhulp'

const moet = (lijst: string[], naam: string | undefined, verwacht: Record<string, string | undefined>): void => {
  const p = plaatsVan(lijst, naam)
  const mis = Object.entries(verwacht).filter(([bron, doel]) => p.get(bron) !== doel)
  klopt(
    `${Object.values(verwacht).find(Boolean)?.split('/')[0] ?? '?'}: ${mis.length ? mis.map(([b]) => `${b} -> ${p.get(b)}`).join('; ') : 'goed'}`,
    mis.length === 0
  )
}

moet(['Hausbau/haus.sco', 'Hausbau/model/haus.o3d', 'Hausbau/texture/haus.bmp', 'Hausbau/liesmich.txt'], 'x', {
  'Hausbau/haus.sco': 'Sceneryobjects/Hausbau/haus.sco',
  'Hausbau/model/haus.o3d': 'Sceneryobjects/Hausbau/model/haus.o3d',
  'Hausbau/texture/haus.bmp': 'Sceneryobjects/Hausbau/texture/haus.bmp'
})
moet(['Strassen/str_2spur.sli', 'Strassen/texture/asphalt.bmp'], 'x', {
  'Strassen/str_2spur.sli': 'Splines/Strassen/str_2spur.sli',
  'Strassen/texture/asphalt.bmp': 'Splines/Strassen/texture/asphalt.bmp'
})
moet(['Leute/mann.hum', 'Leute/model/mann.o3d'], 'x', {
  'Leute/mann.hum': 'Humans/Leute/mann.hum',
  'Leute/model/mann.o3d': 'Humans/Leute/model/mann.o3d'
})
moet(['HVV Tickets/HVV.otp', 'HVV Tickets/texture/einzel.bmp'], 'x', {
  'HVV Tickets/HVV.otp': 'TicketPacks/HVV Tickets/HVV.otp',
  'HVV Tickets/texture/einzel.bmp': 'TicketPacks/HVV Tickets/texture/einzel.bmp'
})
moet(['Wetter/Sturm.owt', 'Wetter/Sturm.dsc', 'Wetter/liesmich.txt'], 'x', {
  'Wetter/Sturm.owt': 'Weather/Sturm.owt',
  'Wetter/Sturm.dsc': 'Weather/Sturm.dsc',
  'Wetter/liesmich.txt': undefined
})
moet(['Matrix/Matrix_16.oft', 'Matrix/Matrix_16.bmp', 'Matrix/voorbeeld/foto.jpg'], 'x', {
  'Matrix/Matrix_16.oft': 'Fonts/Matrix_16.oft',
  'Matrix/Matrix_16.bmp': 'Fonts/Matrix_16.bmp',
  'Matrix/voorbeeld/foto.jpg': undefined
})
moet(['MijnPlugin.dll', 'MijnPlugin.opl'], 'Mijn plugin', {
  'MijnPlugin.dll': 'plugins/MijnPlugin.dll',
  'MijnPlugin.opl': 'plugins/MijnPlugin.opl'
})
// Losse bestanden zonder map: het pakket krijgt de naam van de add-on.
moet(['haus.sco', 'model/haus.o3d', 'readme.txt'], 'Hausbau v2', {
  'haus.sco': 'Sceneryobjects/Hausbau v2/haus.sco',
  'model/haus.o3d': 'Sceneryobjects/Hausbau v2/model/haus.o3d',
  'readme.txt': 'Sceneryobjects/Hausbau v2/readme.txt'
})
// Wat al goed ging, blijft goed.
moet(['MijnBus/mijn.bus', 'MijnBus/objects/zitje.sco', 'MijnBus/Texture/lak.bmp'], 'x', {
  'MijnBus/mijn.bus': 'Vehicles/MijnBus/mijn.bus',
  'MijnBus/objects/zitje.sco': 'Vehicles/MijnBus/objects/zitje.sco',
  'MijnBus/Texture/lak.bmp': 'Vehicles/MijnBus/Texture/lak.bmp'
})
moet(['OMSI 2/Sceneryobjects/Pak/a.sco', 'OMSI 2/Splines/Pak/b.sli'], 'x', {
  'OMSI 2/Sceneryobjects/Pak/a.sco': 'Sceneryobjects/Pak/a.sco',
  'OMSI 2/Splines/Pak/b.sli': 'Splines/Pak/b.sli'
})
// Een verzameling met een eigen `Vehicles` erin is geen objectenpakket.
moet(['Pack/deko.sco', 'Pack/Vehicles/Bus/bus.bus'], 'x', {
  'Pack/Vehicles/Bus/bus.bus': 'Vehicles/Bus/bus.bus'
})

// ---- een echte installatie ----
const basis = proefMap('mapsoorten')
const omsi = nepOmsi(basis)
const zip = join(basis, 'Stadtpaket.zip')
maakZip(zip, [
  { naam: 'Stadtpaket/Haeuser/haus.sco', inhoud: '[mesh]\nhaus.o3d\n' },
  { naam: 'Stadtpaket/Haeuser/model/haus.o3d', inhoud: 'o3d' },
  { naam: 'Stadtpaket/Strassen/str.sli', inhoud: 'sli' },
  { naam: 'Stadtpaket/Wetter/Nebel.owt', inhoud: 'owt' },
  { naam: 'Stadtpaket/Schrift/Stadt.oft', inhoud: 'oft' },
  { naam: 'Stadtpaket/Schrift/Stadt.bmp', inhoud: 'bmp' },
  { naam: 'Stadtpaket/Liesmich.txt', inhoud: 'lies mich' }
])
const bron = openBron(zip)
const plan = loopAf(planStappen(bron, omsi, { addons: [] }))
klopt(`plan: alleen de leesmij niet geplaatst (${plan.overig.join(', ')})`, plan.overig.join('|') === 'Stadtpaket/Liesmich.txt')
loopAf(installeerStappen(bron, plan, omsi, join(basis, 'userdata'), new Date(2026, 8, 28)))
bron.sluit()
for (const pad of [
  'Sceneryobjects/Haeuser/haus.sco',
  'Sceneryobjects/Haeuser/model/haus.o3d',
  'Splines/Strassen/str.sli',
  'Weather/Nebel.owt',
  'Fonts/Stadt.oft',
  'Fonts/Stadt.bmp'
]) {
  klopt(`geïnstalleerd: ${pad}`, existsSync(join(omsi, ...pad.split('/'))))
}

// ---- de feiten, aan een echte OMSI (alleen gelezen) ----
const echt = findOmsiInstall()
if (!echt) console.log('     (geen OMSI gevonden; de feiten niet nagekeken)')
else {
  const telling = (map: string): { mappen: number; bestanden: number } | undefined => {
    const vol = join(echt, map)
    if (!existsSync(vol)) return undefined
    let mappen = 0
    let bestanden = 0
    for (const n of readdirSync(vol)) {
      if (statSync(join(vol, n)).isDirectory()) mappen++
      else bestanden++
    }
    return { mappen, bestanden }
  }
  for (const map of ['Weather', 'Drivers', 'Trains']) {
    const t = telling(map)
    if (t) klopt(`echte OMSI: ${map} is plat (${t.mappen} mappen, ${t.bestanden} bestanden)`, t.mappen === 0)
  }
  const fonts = telling('Fonts')
  if (fonts) klopt(`echte OMSI: Fonts is vrijwel plat (${fonts.mappen} mappen, ${fonts.bestanden} bestanden)`, fonts.bestanden > 10 * fonts.mappen)
  for (const map of ['Sceneryobjects', 'Splines', 'Humans', 'TicketPacks']) {
    const t = telling(map)
    if (t) klopt(`echte OMSI: ${map} heeft een map per pakket (${t.mappen} mappen, ${t.bestanden} bestanden)`, t.mappen > t.bestanden)
  }
}

einde()
