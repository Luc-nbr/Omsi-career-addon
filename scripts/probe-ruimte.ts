/**
 * Vrije ruimte: weigert het plan een installatie die niet past, en laat een
 * volle schijf halverwege niets half achter?
 *
 *   npx tsx scripts/probe-ruimte.ts           (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * 1. `ruimteVoor` met een nagemaakte schijf: 3,4 GB erbij op een schijf met
 *    2,1 GB vrij past niet; op een lege schijf wel. OMSI en de reservekopie op
 *    twee schijven tellen elk voor zich, op één schijf samen.
 * 2. Een installatie waarbij de schijf bij het vierde bestand volloopt
 *    (ENOSPC, halverwege een bestand), na een bestand dat overschreven werd:
 *    daarna moet de OMSI-map byte voor byte zijn zoals ervoor, en de
 *    reservekopie van deze poging weg.
 *
 * 3. (29-09) Het register kan na een geslaagde installatie niet geschreven
 *    worden (ENOSPC op de gebruikersmap): de installatie gaat terug, en er
 *    blijft geen add-on in OMSI staan die de app niet kent.
 * 4. (29-09) Een kapot bestand als eerste in een nieuwe map: na het
 *    terugdraaien geen lege mappen.
 * 5. (29-09) Een zip die over zijn grootte liegt (1 byte opgegeven, 50 MB
 *    erin): "beschadigd" zonder die 50 MB eerst uit te pakken.
 *
 * Op de oude code (vóór 28-09) faalt dit: er was geen ruimtecontrole, en na
 * de fout bleven de eerste bestanden, een half bestand en een overschreven
 * textuur staan. Stap 3 tot 5 falen op d9eeeda.
 */
import fs, { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as addon from '../src/core/addon'
import { installeerStappen, leesRegister, loopAf, openBron, planStappen, type Bron, type Plan } from '../src/core/addon'
import { allesOnder, afdruk, einde, klopt, maakZip, nepOmsi, proefMap, schrijf } from './proefhulp'

const GB = 1e9
/** Wat er in afdruk `na` staat en niet in `voor`. */
const verschil = (voor: string, na: string): string => {
  const was = new Set(voor.split('\n'))
  return na.split('\n').filter((regel) => !was.has(regel)).join(' | ') || '(er ontbreekt iets)'
}
const ruimteVoor = (addon as Partial<typeof addon>).ruimteVoor
const vrijeRuimte = (addon as Partial<typeof addon>).vrijeRuimte

// ---- 1. past het? ----
const nepPlan = (regels: Plan['regels'], code: Plan['regels'] = []): Plan => ({
  naam: 'Groot',
  regels,
  code,
  nooit: [],
  overig: [],
  geweigerd: [],
  dubbel: [],
  teLang: [],
  rommel: 0,
  plekken: [],
  bussen: [],
  kaarten: []
})
const groot = nepPlan([
  { bron: 'a', doel: 'maps/Groot/a.map', grootte: 3.0 * GB, staat: 'nieuw' },
  { bron: 'b', doel: 'maps/Groot/b.map', grootte: 0.4 * GB, staat: 'anders', grootteNu: 0.3 * GB },
  { bron: 'c', doel: 'maps/Groot/c.map', grootte: 5 * GB, staat: 'gelijk' }
])
if (!ruimteVoor) klopt('ruimteVoor bestaat', false)
else {
  const schijven: Record<string, number> = { 'D:\\': 2.1 * GB, 'C:\\': 50 * GB }
  const nep = (pad: string): number | undefined => schijven[pad.slice(0, 3).toUpperCase()]
  const twee = ruimteVoor(groot, 'D:\\OMSI 2', 'C:\\Users\\proef\\AppData\\Roaming\\omsi-enhancer', false, nep)
  const omsiSchijf = twee.schijven.find((s) => s.wat === 'omsi')
  const reserve = twee.schijven.find((s) => s.wat === 'reserve')
  console.log(`     D: nodig ${((omsiSchijf?.nodig ?? 0) / GB).toFixed(2)} GB, vrij ${((omsiSchijf?.vrij ?? 0) / GB).toFixed(1)} GB; C: nodig ${((reserve?.nodig ?? 0) / GB).toFixed(2)} GB`)
  klopt('twee schijven: 3,4 GB erbij op 2,1 GB vrij past niet', twee.past === false && omsiSchijf?.past === false)
  klopt('twee schijven: wat gelijk is telt niet mee, de marge wel', omsiSchijf !== undefined && omsiSchijf.nodig > 3.4 * GB && omsiSchijf.nodig < 3.8 * GB)
  klopt('twee schijven: de reservekopie telt wat er nu staat (0,3 GB) op C:', reserve !== undefined && reserve.nodig > 0.3 * GB && reserve.nodig < 0.6 * GB && reserve.past)

  schijven['D:\\'] = 20 * GB
  klopt('twee schijven: met 20 GB vrij past het', ruimteVoor(groot, 'D:\\OMSI 2', 'C:\\Users\\proef', false, nep).past)
  schijven['C:\\'] = 3.6 * GB
  const een = ruimteVoor(groot, 'C:\\OMSI 2', 'C:\\Users\\proef', false, nep)
  klopt('één schijf: OMSI en reserve samen (3,7 GB + marge op 3,6 GB) past niet', !een.past && een.schijven.length === 1 && een.schijven[0].wat === 'samen')
  schijven['D:\\'] = 2.1 * GB
  const alleenCode = nepPlan([], [{ bron: 'p', doel: 'plugins/p.dll', grootte: 4 * GB, staat: 'nieuw' }])
  klopt('plugins tellen alleen mee met het vinkje', ruimteVoor(alleenCode, 'D:\\OMSI 2', 'C:\\x', false, nep).past && !ruimteVoor(alleenCode, 'D:\\OMSI 2', 'C:\\x', true, nep).past)
  const echt = vrijeRuimte?.(process.env.PROEF_MAP || process.cwd())
  klopt(`vrijeRuimte op deze schijf: ${echt === undefined ? '?' : (echt / GB).toFixed(1)} GB`, typeof echt === 'number' && echt > 0)
  klopt('vrijeRuimte van een map die er nog niet is: die van de map erboven', vrijeRuimte?.(join(process.cwd(), 'bestaat', 'niet')) === vrijeRuimte?.(process.cwd()))
}

// ---- 2. ENOSPC halverwege ----
const basis = proefMap('ruimte')
const omsi = nepOmsi(basis)
const data = join(basis, 'userdata')
schrijf(omsi, 'Texture/gedeeld.bmp', 'OUD-ORIGINEEL')
const zip = join(basis, 'Vol.zip')
maakZip(zip, [
  { naam: 'Vol/Sceneryobjects/Vol/een.sco', inhoud: 'een' },
  { naam: 'Vol/Texture/gedeeld.bmp', inhoud: 'NIEUW-ANDERS' },
  { naam: 'Vol/Sceneryobjects/Vol/model/twee.o3d', inhoud: 'twee' },
  { naam: 'Vol/Sceneryobjects/Vol/model/drie.o3d', inhoud: 'drie-groot'.repeat(100) },
  { naam: 'Vol/Sceneryobjects/Vol/texture/vier.bmp', inhoud: 'vier' }
])
const voor = afdruk(omsi)
const echteBron = openBron(zip)
const plan = loopAf(planStappen(echteBron, omsi, { addons: [] }))
// Een bron die bij het vierde bestand de schijf vol laat lopen, na de helft geschreven te hebben.
let geschreven = 0
const volleBron: Bron = {
  ...echteBron,
  kopieer(b, naar) {
    geschreven += 1
    if (geschreven === 4) {
      writeFileSync(naar, echteBron.lees(b).subarray(0, 50))
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
    }
    echteBron.kopieer(b, naar)
  }
}
let fout: unknown
try {
  loopAf(installeerStappen(volleBron, plan, omsi, data, new Date(2026, 8, 28)))
} catch (f) {
  fout = f
}
echteBron.sluit()
const soort = (fout as { soort?: string } | undefined)?.soort
klopt(`de installatie stopt met "ruimte" (${soort ?? (fout instanceof Error ? fout.message : 'geen fout')})`, soort === 'ruimte')
klopt('en zegt dat alles teruggedraaid is', (fout as { teruggedraaid?: boolean } | undefined)?.teruggedraaid === true)
const na = afdruk(omsi)
klopt('de OMSI-map is byte voor byte zoals ervoor (geen half bestand, geen nieuwe map)', na === voor)
if (na !== voor) {
  const a = new Set(voor.split('\n'))
  console.log(`     verschil: ${na.split('\n').filter((r) => !a.has(r)).join(' | ')}`)
}
const reserve = join(data, 'addon-reserve')
klopt('geen reservekopie van deze poging achtergebleven', !existsSync(reserve) || readdirSync(reserve).length === 0)

// ---- 3. het register lukt niet na een geslaagde installatie ----
{
  const map = proefMap('ruimte-register')
  const omsi3 = nepOmsi(map)
  const data3 = join(map, 'userdata')
  schrijf(omsi3, 'Vehicles/Bus/a.cfg', 'OUD-A')
  const zip3 = join(map, 'bus.zip')
  maakZip(zip3, [
    { naam: 'Bus/bus.bus', inhoud: 'bus' },
    { naam: 'Bus/a.cfg', inhoud: 'NIEUW-A' },
    { naam: 'Bus/model/diep/m.o3d', inhoud: 'o3d' }
  ])
  const voor3 = afdruk(omsi3)
  const bron3 = openBron(zip3)
  const plan3 = loopAf(planStappen(bron3, omsi3, { addons: [] }))
  const uit3 = loopAf(installeerStappen(bron3, plan3, omsi3, data3))
  bron3.sluit()
  const registreer = (addon as Partial<typeof addon>).registreer
  // Zoals het hoofdproces: daarna het register, en dan is de gebruikersmap vol.
  const echtSchrijven = fs.writeFileSync
  ;(fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = ((pad: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (String(pad).includes('addons.json')) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
    return (echtSchrijven as (...a: unknown[]) => void)(pad, ...rest)
  }) as typeof fs.writeFileSync
  let fout3: unknown
  try {
    if (registreer) registreer(data3, omsi3, uit3)
    else addon.schrijfRegister(data3, { addons: [...leesRegister(data3).addons, uit3.addon] })
  } catch (f) {
    fout3 = f
  } finally {
    ;(fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = echtSchrijven
  }
  const soort3 = (fout3 as { soort?: string } | undefined)?.soort
  klopt(`register vol: de fout zegt "ruimte" (${soort3 ?? String(fout3)})`, soort3 === 'ruimte')
  const na3 = afdruk(omsi3)
  klopt(`register vol: de OMSI-map is weer zoals ervoor (a.cfg=${readFileSync(join(omsi3, 'Vehicles/Bus/a.cfg'), 'utf8')})`, na3 === voor3)
  if (na3 !== voor3) console.log(`     verschil: ${verschil(voor3, na3)}`)
  klopt('register vol: geen reserve van die installatie meer', !existsSync(addon.reserveMap(data3, uit3.addon.id)))
}

// ---- 4. een kapot bestand als eerste in een nieuwe map ----
{
  const map = proefMap('ruimte-kapot')
  const omsi4 = nepOmsi(map)
  const zip4 = join(map, 'bus.zip')
  // Het tweede bestand, het eerste in een nieuwe map `model/diep`, met een verkeerde crc.
  maakZip(zip4, [
    { naam: 'NieuweBus/bus.bus', inhoud: 'bus' },
    { naam: 'NieuweBus/model/diep/m.o3d', inhoud: 'o3d', crcFout: true }
  ])
  const voor4 = afdruk(omsi4)
  const bron4 = openBron(zip4)
  const plan4 = loopAf(planStappen(bron4, omsi4, { addons: [] }))
  let fout4: unknown
  try {
    loopAf(installeerStappen(bron4, plan4, omsi4, join(map, 'userdata')))
  } catch (f) {
    fout4 = f
  } finally {
    bron4.sluit()
  }
  klopt(`kapot bestand: de installatie stopt (${fout4 instanceof Error ? fout4.message : 'geen fout'})`, fout4 instanceof Error)
  // `afdruk` noemt ook elke map, dus ook een lege.
  const na4 = afdruk(omsi4)
  klopt(`kapot bestand: de OMSI-map is weer zoals ervoor, ook geen lege mappen (${na4 === voor4 ? 'gelijk' : verschil(voor4, na4)})`, na4 === voor4)
}

// ---- 5. een zip die over zijn grootte liegt ----
{
  const map = proefMap('ruimte-liegt')
  const omsi5 = nepOmsi(map)
  const zip5 = join(map, 'bus.zip')
  maakZip(zip5, [{ naam: 'Bus/bus.bus', inhoud: Buffer.alloc(50 * 1024 * 1024) }])
  const buf = readFileSync(zip5)
  const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  buf.writeUInt32LE(1, cd + 24)
  writeFileSync(zip5, buf)
  const bron5 = openBron(zip5)
  const plan5 = loopAf(planStappen(bron5, omsi5, { addons: [] }))
  const voorGeheugen = process.memoryUsage().arrayBuffers
  let piek = 0
  let fout5: unknown
  try {
    loopAf(installeerStappen(bron5, plan5, omsi5, join(map, 'userdata')))
  } catch (f) {
    fout5 = f
    piek = process.memoryUsage().arrayBuffers - voorGeheugen
  } finally {
    bron5.sluit()
  }
  const melding = fout5 instanceof Error ? fout5.message : 'geen fout'
  klopt(`liegende zip: "beschadigd" (${melding})`, /Beschadigd/.test(melding))
  klopt(`liegende zip: niet eerst 50 MB uitgepakt (erbij na de fout: ~${Math.round(piek / 1e6)} MB)`, piek < 10e6)
  klopt('liegende zip: niets neergezet', allesOnder(join(omsi5, 'Vehicles')).length === 0)
}

einde()
