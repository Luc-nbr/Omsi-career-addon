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
 * Sinds 29-09 ook: `Sounds` en `Scripts` uit de hoofdmap van OMSI (de
 * AI-auto's), geen map `Gras` meer (die heeft OMSI niet), een zip waarvan de
 * naam op een punt of spatie eindigt, en twee bestanden die op dezelfde plek
 * uitkomen (`Zomer/zon.owt` en `Winter/zon.owt`, `a.cfg` en `A.CFG`): één gaat
 * mee, de ander staat in het plan als dubbel, en verwijderen laat niets van
 * de add-on achter.
 *
 * Op de oude code (vóór 28-09) faalt dit: alleen bussen en kaarten werden
 * herkend. De delen van 29-09 falen op d9eeeda.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as addon from '../src/core/addon'
import { installeerStappen, loopAf, OMSI_MAPPEN, openBron, plaatsVan, planStappen, verwijderStappen } from '../src/core/addon'
import { findOmsiInstall } from '../src/core/install'
import { afdruk, einde, klopt, maakZip, nepOmsi, proefMap } from './proefhulp'

const moet = (lijst: string[], naam: string | undefined, verwacht: Record<string, string | undefined>): void => {
  const p = plaatsVan(lijst, naam)
  const mis = Object.entries(verwacht).filter(([bron, doel]) => p.get(bron) !== doel)
  klopt(
    `${Object.values(verwacht).find(Boolean)?.split('/')[0] ?? 'niet geplaatst'}: ${mis.length ? mis.map(([b]) => `${b} -> ${p.get(b)}`).join('; ') : 'goed'}`,
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

// AI-auto's: hun geluiden en scripts staan in de hoofdmap van OMSI.
moet(['OMSI 2/Vehicles/AI_Cars_X/x.ovh', 'OMSI 2/Sounds/AI_Cars/x_motor.wav', 'OMSI 2/Scripts/AI_Cars/x.osc'], 'x', {
  'OMSI 2/Vehicles/AI_Cars_X/x.ovh': 'Vehicles/AI_Cars_X/x.ovh',
  'OMSI 2/Sounds/AI_Cars/x_motor.wav': 'Sounds/AI_Cars/x_motor.wav',
  'OMSI 2/Scripts/AI_Cars/x.osc': 'Scripts/AI_Cars/x.osc'
})
// Een object met zijn geluid in een map `Sounds` blijft een object (geen verzameling).
moet(['Kerk/kerk.sco', 'Kerk/Sounds/glocke.wav'], 'x', {
  'Kerk/kerk.sco': 'Sceneryobjects/Kerk/kerk.sco',
  'Kerk/Sounds/glocke.wav': 'Sceneryobjects/Kerk/Sounds/glocke.wav'
})
// `Gras` bestaat niet in OMSI 2: niet als nieuwe map naast Omsi.exe.
moet(['OMSI 2/Gras/gras.bmp'], 'x', { 'OMSI 2/Gras/gras.bmp': undefined })

// ---- de naam van de zip als pakketnaam ----
const pakketNaam = (addon as Partial<typeof addon>).pakketNaam
klopt(
  `pakketnaam: "Bomen v1." -> ${JSON.stringify(pakketNaam?.('Bomen v1.'))}, "Bomen " -> ${JSON.stringify(pakketNaam?.('Bomen '))}, "CON" -> ${JSON.stringify(pakketNaam?.('CON'))}, "a:b" -> ${JSON.stringify(pakketNaam?.('a:b'))}`,
  pakketNaam?.('Bomen v1.') === 'Bomen v1' && pakketNaam('Bomen ') === 'Bomen' && pakketNaam('CON') === 'Add-on' && pakketNaam('a:b') === 'a_b'
)
{
  const map = proefMap('mapsoorten-naam')
  const omsiN = nepOmsi(map)
  for (const zipNaam of ['Bomen v1..zip', 'Bomen .zip']) {
    const z = join(map, zipNaam)
    maakZip(z, [
      { naam: 'boom.sco', inhoud: '[mesh]\nboom.o3d\n' },
      { naam: 'model/boom.o3d', inhoud: 'o3d' }
    ])
    const br = openBron(z)
    const p = loopAf(planStappen(br, omsiN, { addons: [] }))
    br.sluit()
    klopt(
      `zip "${zipNaam}" met losse objecten: ${p.regels.map((r) => r.doel).join(', ')} (geweigerd: ${p.geweigerd.length})`,
      p.geweigerd.length === 0 && p.regels.length === 2 && p.regels.every((r) => r.doel.startsWith('Sceneryobjects/Bomen'))
    )
  }
}

// ---- twee bestanden voor dezelfde plek ----
{
  const map = proefMap('mapsoorten-dubbel')
  const omsiD = nepOmsi(map)
  const dataD = join(map, 'userdata')
  const z = join(map, 'weer.zip')
  maakZip(z, [
    { naam: 'Zomer/zon.owt', inhoud: 'ZOMER' },
    { naam: 'Winter/zon.owt', inhoud: 'WINTER' },
    { naam: 'Vehicles/Bus/a.cfg', inhoud: 'KLEIN' },
    { naam: 'vehicles/BUS/A.cfg', inhoud: 'GROOT' }
  ])
  const voor = afdruk(omsiD)
  const br = openBron(z)
  const p = loopAf(planStappen(br, omsiD, { addons: [] }))
  const dubbel = (p as { dubbel?: string[] }).dubbel ?? []
  klopt(`dubbel: 2 in het plan, 2 als dubbel (${p.regels.map((r) => `${r.doel}=${r.staat}`).join(', ')}; dubbel: ${dubbel.join(', ')})`, p.regels.length === 2 && dubbel.length === 2)
  const inst = loopAf(installeerStappen(br, p, omsiD, dataD, new Date(2026, 8, 29)))
  br.sluit()
  klopt(`dubbel: het register kent elk bestand één keer, als nieuw (${inst.addon.bestanden.map((b) => `${b.pad}=${b.was}`).join(', ')})`, inst.addon.bestanden.length === 2 && inst.addon.bestanden.every((b) => b.was === 'nieuw'))
  const weg = loopAf(verwijderStappen(inst.addon, { addons: [inst.addon] }, omsiD, dataD))
  klopt(`dubbel: verwijderen haalt alles weg (${weg.verwijderd} weg, ${weg.teruggezet} terug, gewijzigd: ${weg.gewijzigd.join(', ') || 'geen'})`, weg.verwijderd === 2 && weg.teruggezet === 0 && weg.gewijzigd.length === 0)
  klopt('dubbel: de OMSI-map is daarna weer zoals ervoor', afdruk(omsiD) === voor)
}

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
  // Elke map waar een add-on in mag, bestaat ook echt in de hoofdmap van OMSI (29-09: `Gras` niet).
  const mis = OMSI_MAPPEN.filter((m) => !existsSync(join(echt, m)))
  klopt(`echte OMSI: elke map uit OMSI_MAPPEN bestaat (${mis.join(', ') || 'allemaal'})`, mis.length === 0)
  klopt('echte OMSI: Sounds en Scripts staan in de hoofdmap', existsSync(join(echt, 'Sounds')) && existsSync(join(echt, 'Scripts')))
}

einde()
