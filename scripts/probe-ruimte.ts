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
 * Op de oude code (vóór 28-09) faalt dit: er was geen ruimtecontrole, en na
 * de fout bleven de eerste bestanden, een half bestand en een overschreven
 * textuur staan.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as addon from '../src/core/addon'
import { installeerStappen, loopAf, openBron, planStappen, type Bron, type Plan } from '../src/core/addon'
import { afdruk, einde, klopt, maakZip, nepOmsi, proefMap, schrijf } from './proefhulp'

const GB = 1e9
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

einde()
