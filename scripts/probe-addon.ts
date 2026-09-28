/**
 * De add-on-manager, nagerekend op een nagebouwde OMSI-map in een tijdelijke map.
 *
 *   npx tsx scripts/probe-addon.ts
 *
 * Een zip lezen (ook met umlauten in de namen), bepalen waar alles hoort, het
 * plan, installeren met reserve, verwijderen met terugzetten, en de
 * foutcontrole van een bus en een kaart. Raakt niets buiten de tijdelijke map.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import iconv from 'iconv-lite'
import {
  installeerStappen,
  loopAf,
  openBron,
  plaatsVan,
  planStappen,
  verwijderStappen,
  type Register
} from '../src/core/addon'
import { controleerBus, controleerKaart } from '../src/core/addoncheck'
import { crc32, openZip } from '../src/core/zip'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

/** Een zip schrijven, zodat de lezer iets echts te lezen krijgt. */
function maakZip(pad: string, bestanden: Array<{ naam: string; inhoud: Buffer | string; utf8?: boolean; opslaan?: boolean }>): void {
  const lokaal: Buffer[] = []
  const centraal: Buffer[] = []
  let at = 0
  for (const b of bestanden) {
    const inhoud = Buffer.isBuffer(b.inhoud) ? b.inhoud : Buffer.from(b.inhoud)
    const gepakt = b.opslaan ? inhoud : deflateRawSync(inhoud)
    const naam = b.utf8 ? Buffer.from(b.naam, 'utf8') : iconv.encode(b.naam, 'cp437')
    const vlag = b.utf8 ? 0x800 : 0
    const methode = b.opslaan ? 0 : 8
    const kop = Buffer.alloc(30)
    kop.writeUInt32LE(0x04034b50, 0)
    kop.writeUInt16LE(20, 4)
    kop.writeUInt16LE(vlag, 6)
    kop.writeUInt16LE(methode, 8)
    kop.writeUInt32LE(crc32(inhoud), 14)
    kop.writeUInt32LE(gepakt.length, 18)
    kop.writeUInt32LE(inhoud.length, 22)
    kop.writeUInt16LE(naam.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(vlag, 8)
    c.writeUInt16LE(methode, 10)
    c.writeUInt32LE(crc32(inhoud), 16)
    c.writeUInt32LE(gepakt.length, 20)
    c.writeUInt32LE(inhoud.length, 24)
    c.writeUInt16LE(naam.length, 28)
    c.writeUInt32LE(at, 42)
    lokaal.push(kop, naam, gepakt)
    centraal.push(c, naam)
    at += 30 + naam.length + gepakt.length
  }
  const cd = Buffer.concat(centraal)
  const eind = Buffer.alloc(22)
  eind.writeUInt32LE(0x06054b50, 0)
  eind.writeUInt16LE(bestanden.length, 8)
  eind.writeUInt16LE(bestanden.length, 10)
  eind.writeUInt32LE(cd.length, 12)
  eind.writeUInt32LE(at, 16)
  writeFileSync(pad, Buffer.concat([...lokaal, cd, eind]))
}

function schrijf(basis: string, pad: string, inhoud: string): void {
  const vol = join(basis, ...pad.split('/'))
  mkdirSync(dirname(vol), { recursive: true })
  writeFileSync(vol, inhoud)
}

const tmp = mkdtempSync(join(tmpdir(), 'omsi-addon-'))
try {
  const omsi = join(tmp, 'OMSI 2')
  const data = join(tmp, 'userdata')
  mkdirSync(data, { recursive: true })
  schrijf(omsi, 'Omsi.exe', '')
  schrijf(omsi, 'Vehicles/Oud/oud.bus', '[friendlyname]\nOud\n')
  schrijf(omsi, 'Texture/gedeeld.bmp', 'GEDEELD-OUD')
  schrijf(omsi, 'Sceneryobjects/Pak/zelfde.sco', 'ZELFDE')

  // ---- zip ----
  const zipPad = join(tmp, 'MAN NL202 v1.2.zip')
  maakZip(zipPad, [
    { naam: 'MAN NL202 v1.2/Readme.txt', inhoud: 'lees mij' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/NL202.bus', inhoud: '[model]\nmodel\\model.cfg\n\n[script]\n2\nscript\\main.osc\nscript\\ontbreekt.osc\n\n[sound]\nsound\\sound.cfg\n' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/model/model.cfg', inhoud: '[mesh]\nbody.o3d\n\n[matl]\nlak.bmp\n0\n\n[mesh]\nweg.o3d\n\n[matl]\nkwijt.bmp\n0\n' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/model/body.o3d', inhoud: 'o3d', opslaan: true },
    { naam: 'MAN NL202 v1.2/MAN_NL202/Texture/lak.bmp', inhoud: 'bmp' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/script/main.osc', inhoud: '' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/sound/sound.cfg', inhoud: '[sound]\nmotor.wav\n1\n\n[sound]\nweg.wav\n1\n' },
    { naam: 'MAN NL202 v1.2/MAN_NL202/sound/motor.wav', inhoud: 'wav' },
    { naam: 'MAN NL202 v1.2/Sceneryobjects/Pak/nieuw.sco', inhoud: '[mesh]\nnieuw.o3d\n\n[matl]\nnieuw.bmp\n0\n' },
    { naam: 'MAN NL202 v1.2/Sceneryobjects/Pak/zelfde.sco', inhoud: 'ZELFDE' },
    { naam: 'MAN NL202 v1.2/Texture/gedeeld.bmp', inhoud: 'GEDEELD-NIEUW' },
    { naam: 'MAN NL202 v1.2/Bilder/Straßenbahn.jpg', inhoud: 'jpg' },
    { naam: 'MAN NL202 v1.2/Sceneryobjects/Pak/Häuschen.sco', inhoud: 'x', utf8: true }
  ])
  const zip = openZip(zipPad)
  klopt('zip: alle bestanden gelezen', zip.bestanden.length === 13)
  klopt('zip: umlaut in codepagina 437', zip.bestanden.some((b) => b.naam.endsWith('Straßenbahn.jpg')))
  klopt('zip: umlaut met UTF-8-vlag', zip.bestanden.some((b) => b.naam.endsWith('Häuschen.sco')))
  klopt('zip: opgeslagen en ingepakt terug te lezen', zip.lees(zip.bestanden[3]).toString() === 'o3d' && zip.lees(zip.bestanden[1]).toString().startsWith('[model]'))
  zip.sluit()

  // ---- waar hoort het ----
  const p = plaatsVan([
    'OMSI 2/Vehicles/A/a.bus',
    'X/Sceneryobjects/Pak/b.sco',
    'MijnBus/Texture/t.bmp',
    'MijnBus/mijn.bus',
    'MijnKaart/global.cfg',
    'MijnKaart/tile_0_0.map',
    'readme.txt',
    'maps/Echt/global.cfg'
  ])
  klopt('een map OMSI 2 eromheen valt weg', p.get('OMSI 2/Vehicles/A/a.bus') === 'Vehicles/A/a.bus')
  klopt('een eigen map eromheen valt weg', p.get('X/Sceneryobjects/Pak/b.sco') === 'Sceneryobjects/Pak/b.sco')
  klopt('een losse busmap gaat naar Vehicles, met zijn eigen Texture-map', p.get('MijnBus/Texture/t.bmp') === 'Vehicles/MijnBus/Texture/t.bmp')
  klopt('een losse kaartmap gaat naar maps', p.get('MijnKaart/tile_0_0.map') === 'maps/MijnKaart/tile_0_0.map')
  klopt('een leesmij hoort er niet in', !p.has('readme.txt'))
  klopt('maps met een kaart erin blijft maps', p.get('maps/Echt/global.cfg') === 'maps/Echt/global.cfg')

  // ---- plan en installeren ----
  const leeg: Register = { addons: [] }
  const bron = openBron(zipPad)
  const plan = loopAf(planStappen(bron, omsi, leeg))
  const staat = (doel: string): string | undefined => plan.regels.find((r) => r.doel === doel)?.staat
  klopt('plan: nieuw', staat('Vehicles/MAN_NL202/NL202.bus') === 'nieuw')
  klopt('plan: stond er al precies zo', staat('Sceneryobjects/Pak/zelfde.sco') === 'gelijk')
  klopt('plan: wordt overschreven', staat('Texture/gedeeld.bmp') === 'anders')
  klopt('plan: leesmij en plaatjes niet geplaatst', plan.overig.length === 2)
  klopt('plan: de bus herkend', plan.bussen.join() === 'MAN_NL202')

  const inst = loopAf(installeerStappen(bron, plan, omsi, data, new Date(2026, 8, 28)))
  bron.sluit()
  klopt('geïnstalleerd, met één overschreven', existsSync(join(omsi, 'Vehicles/MAN_NL202/model/body.o3d')) && inst.overschreven === 1)
  klopt('het overschreven bestand is nieuw, de reserve oud', readFileSync(join(omsi, 'Texture/gedeeld.bmp'), 'utf8') === 'GEDEELD-NIEUW')
  let register: Register = { addons: [inst.addon] }

  // Een tweede add-on met hetzelfde nieuwe bestand erin.
  const tweede = join(tmp, 'tweede')
  schrijf(tweede, 'Sceneryobjects/Pak/nieuw.sco', '[mesh]\nnieuw.o3d\n\n[matl]\nnieuw.bmp\n0\n')
  const bron2 = openBron(tweede)
  const plan2 = loopAf(planStappen(bron2, omsi, register))
  klopt('tweede add-on: hetzelfde bestand is gelijk', plan2.regels[0].staat === 'gelijk')
  const inst2 = loopAf(installeerStappen(bron2, plan2, omsi, data, new Date(2026, 8, 29)))
  register = { addons: [inst.addon, inst2.addon] }

  // Iemand past een bestand van de eerste add-on aan.
  writeFileSync(join(omsi, 'Vehicles/MAN_NL202/script/main.osc'), 'eigen aanpassing')

  // ---- foutcontrole ----
  const bus = loopAf(controleerBus(omsi, 'MAN_NL202'))
  const mist = (soort: string, pad: string): boolean => bus.ontbrekend.some((o) => o.soort === soort && o.pad === pad)
  klopt('bus: ontbrekend o3d', mist('o3d', 'weg.o3d'))
  klopt('bus: ontbrekende textuur', mist('textuur', 'kwijt.bmp'))
  klopt('bus: ontbrekend script', mist('script', 'script\\ontbreekt.osc'))
  klopt('bus: ontbrekend geluid', mist('geluid', 'weg.wav'))
  klopt(`bus: wat er is, is niet ontbrekend (${bus.ontbrekend.length} gevonden)`, bus.ontbrekend.length === 4)

  schrijf(omsi, 'maps/Test/global.cfg', '[ticketpack]\nTicketPacks\\Weg\\weg.otp\n')
  schrijf(
    omsi,
    'maps/Test/tile_0_0.map',
    '[object]\n0\nSceneryobjects\\Pak\\nieuw.sco\n1\n0\n0\n0\n0\n\n[object]\n0\nSceneryobjects\\Weg\\weg.sco\n2\n0\n0\n0\n0\n\n[object]\n0\nsceneryobjects\\pak\\NIEUW.sco\n3\n0\n0\n0\n0\n\n[spline]\n0\nSplines\\Weg\\str.sli\n4\n'
  )
  schrijf(omsi, 'maps/Test/ailists.cfg', '[aigroup_2]\nVehicles\\Oud\\oud.bus\t1\nVehicles\\Weg\\weg.bus\t1\n')
  const kaart = loopAf(controleerKaart(omsi, 'Test'))
  const km = (soort: string, pad: string): boolean => kaart.ontbrekend.some((o) => o.soort === soort && o.pad.toLowerCase() === pad.toLowerCase())
  klopt('kaart: ontbrekend object', km('object', 'Sceneryobjects\\Weg\\weg.sco'))
  klopt('kaart: ontbrekende spline', km('spline', 'Splines\\Weg\\str.sli'))
  klopt('kaart: hoofdletters maken niet uit (NIEUW.sco bestaat)', !km('object', 'sceneryobjects\\pak\\NIEUW.sco'))
  klopt('kaart: in een object dat er is, het ontbrekende model en de textuur', km('o3d', 'nieuw.o3d') && km('textuur', 'nieuw.bmp'))
  klopt('kaart: voertuig uit de KI-lijst', km('voertuig', 'Vehicles\\Weg\\weg.bus') && !km('voertuig', 'Vehicles\\Oud\\oud.bus'))
  klopt('kaart: kaartset', km('kaartset', 'TicketPacks\\Weg\\weg.otp'))

  // ---- verwijderen ----
  const weg = loopAf(verwijderStappen(inst.addon, register, omsi, data))
  klopt('verwijderen: het overschreven bestand is terug', readFileSync(join(omsi, 'Texture/gedeeld.bmp'), 'utf8') === 'GEDEELD-OUD' && weg.teruggezet === 1)
  klopt('verwijderen: wat er al stond blijft', existsSync(join(omsi, 'Sceneryobjects/Pak/zelfde.sco')))
  klopt('verwijderen: wat de tweede add-on ook heeft blijft', existsSync(join(omsi, 'Sceneryobjects/Pak/nieuw.sco')))
  klopt('verwijderen: een aangepast bestand blijft, en staat in de lijst', existsSync(join(omsi, 'Vehicles/MAN_NL202/script/main.osc')) && weg.gewijzigd.length === 1)
  klopt('verwijderen: de rest is weg', !existsSync(join(omsi, 'Vehicles/MAN_NL202/model/body.o3d')) && !existsSync(join(omsi, 'Vehicles/MAN_NL202/sound')))
  klopt('verwijderen: lege mappen weg, OMSI-mappen niet', !existsSync(join(omsi, 'Vehicles/MAN_NL202/model')) && existsSync(join(omsi, 'Vehicles')) && existsSync(join(omsi, 'Texture')))
  klopt('verwijderen: niets buiten de OMSI-map aangeraakt', existsSync(join(omsi, 'Vehicles/Oud/oud.bus')))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
