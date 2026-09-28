/**
 * Zip slip: komt er iets buiten de OMSI-map terecht als een zip rare namen heeft?
 *
 *   npx tsx scripts/probe-zipslip.ts          (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Een zip met `..`, een absoluut pad, een stationsletter, een `:` (een
 * verborgen NTFS-stroom), apparaatnamen (CON, nul.txt) en rommel (__MACOSX,
 * Thumbs.db, desktop.ini, .DS_Store) wordt in een nagebouwde OMSI-map
 * geïnstalleerd. Daarna mag er buiten `OMSI 2` en de gebruikersmap niets
 * nieuws staan, moet elk raar pad als geweigerd in het plan staan, en de
 * rommel nergens.
 *
 * De OMSI-map staat hier twee mappen diep (`buiten1/buiten2/OMSI 2`), zodat
 * ook de oude code -- die `Vehicles/../../BUITEN.txt` gewoon naast de
 * OMSI-map schreef -- binnen de proefmap blijft. Op die oude code (vóór 28-09)
 * faalt deze proef: BUITEN.txt komt in `buiten1/`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installeerStappen, loopAf, openBron, planStappen, type Plan } from '../src/core/addon'
import * as zipLezer from '../src/core/zip'
import { allesOnder, einde, klopt, maakZip, nepOmsi, proefMap } from './proefhulp'

const basis = proefMap('zipslip')
const omsi = nepOmsi(join(basis, 'buiten1', 'buiten2'))
const data = join(basis, 'userdata')
const zip = join(basis, 'kwaad.zip')

const RAAR = [
  'Vehicles/../../BUITEN.txt',
  'Vehicles\\..\\..\\..\\BUITEN2.txt',
  '../BUITEN3.txt',
  '/abs/BUITEN4.txt',
  'C:/BUITEN5.txt',
  'C:BUITEN6.txt',
  'Vehicles/MijnBus/stroom.txt:verborgen',
  // Alleen CON en NUL als bestand in de zip: de oude code opende ze echt, en
  // een COM- of LPT-poort kan een echt apparaat zijn (een stuur, pedalen).
  'Vehicles/MijnBus/CON',
  'Vehicles/MijnBus/nul.txt',
  'Vehicles/MijnBus/eindpunt.',
  'Vehicles/MijnBus/vraag?.cfg'
]
// Wel als naam nagekeken, zonder er iets mee te openen.
const APPARATEN = ['Vehicles/MijnBus/com1.cfg', 'Vehicles/MijnBus/LPT9', 'aux', 'Vehicles/prn.txt/x', 'Vehicles/CON .txt']
const ROMMEL = ['__MACOSX/MijnBus/._mijn.bus', 'MijnBus/Thumbs.db', 'MijnBus/desktop.ini', 'MijnBus/.DS_Store', 'MijnBus/model/._model.cfg']
maakZip(zip, [
  { naam: 'MijnBus/mijn.bus', inhoud: '[friendlyname]\nMijn bus\n' },
  { naam: 'MijnBus/model/model.cfg', inhoud: '[mesh]\nbody.o3d\n' },
  { naam: 'options.cfg', inhoud: 'KAPOT' },
  ...RAAR.map((naam) => ({ naam, inhoud: 'raar' })),
  ...ROMMEL.map((naam) => ({ naam, inhoud: 'rommel' }))
])

// ---- plan en installeren ----
const bron = openBron(zip)
const plan = loopAf(planStappen(bron, omsi, { addons: [] }))
klopt(`plan: ${RAAR.length} bestanden geweigerd (${plan.geweigerd?.length})`, plan.geweigerd?.length === RAAR.length)
klopt(`plan: ${ROMMEL.length} rommelbestanden overgeslagen (${plan.rommel})`, plan.rommel === ROMMEL.length)
const doelen = plan.regels.map((r) => r.doel)
const gewoon = (d: string): boolean => !d.split(/[\\/]/).some((s) => s === '..' || s.includes(':') || /^(con|nul|com\d)(\.|$)/i.test(s))
klopt('plan: de bus staat erin', doelen.includes('Vehicles/MijnBus/mijn.bus') && doelen.includes('Vehicles/MijnBus/model/model.cfg'))
klopt(`plan: geen doel met .. of : of een apparaatnaam${doelen.filter((d) => !gewoon(d)).map((d) => ` [${d}]`).join('')}`, doelen.every(gewoon))
klopt('plan: niets in de hoofdmap van OMSI (options.cfg niet geplaatst)', doelen.every((d) => d.includes('/')) && plan.overig.includes('options.cfg'))
klopt('plan: rommel staat nergens, ook niet bij "niet geplaatst"', ![...doelen, ...plan.overig].some((d) => /__MACOSX|thumbs\.db|desktop\.ini|\.DS_Store|\/\._/i.test(d)))

try {
  const inst = loopAf(installeerStappen(bron, plan, omsi, data, new Date(2026, 8, 28)))
  klopt(`geïnstalleerd: ${inst.geschreven} bestanden`, inst.geschreven === 2)
} catch (fout) {
  klopt(`installeren: ${fout instanceof Error ? fout.message : fout}`, false)
}
bron.sluit()

// ---- een plan dat toch iets raars zegt (uit een fout, of van buitenaf) ----
const vals: Plan = {
  ...plan,
  regels: [
    { bron: 'MijnBus/mijn.bus', doel: 'options.cfg', grootte: 1, staat: 'nieuw' },
    { bron: 'MijnBus/mijn.bus', doel: 'Vehicles/../../BUITEN-PLAN.txt', grootte: 1, staat: 'nieuw' },
    { bron: 'MijnBus/mijn.bus', doel: 'Omsi.exe', grootte: 1, staat: 'nieuw' }
  ],
  code: []
}
const bron2 = openBron(zip)
try {
  loopAf(installeerStappen(bron2, vals, omsi, data, new Date(2026, 8, 29)))
} catch (fout) {
  console.log(`     (installeren van het valse plan: ${fout instanceof Error ? fout.message : fout})`)
}
bron2.sluit()
klopt('vals plan: options.cfg in de hoofdmap niet overschreven', readFileSync(join(omsi, 'options.cfg'), 'utf8').startsWith('[last_map]'))
klopt('vals plan: Omsi.exe niet overschreven', readFileSync(join(omsi, 'Omsi.exe')).length === 0)

// ---- niets buiten de OMSI-map ----
const alles = allesOnder(basis)
const buiten = alles.filter((p) => p !== 'kwaad.zip' && !p.startsWith('buiten1/buiten2/OMSI 2/') && !p.startsWith('userdata/'))
klopt(`niets buiten de OMSI-map en de gebruikersmap${buiten.length ? `: ${buiten.join(', ')}` : ''}`, buiten.length === 0)
klopt(
  'geen BUITEN-bestand op de schijf',
  !alles.some((p) => /^BUITEN/.test(p.split('/').pop()!)) && !existsSync(join(basis, 'buiten1', 'BUITEN.txt'))
)
const inOmsi = allesOnder(omsi)
klopt(`in de OMSI-map alleen de bus erbij (${inOmsi.join(', ')})`, inOmsi.join('|') === 'Omsi.exe|Vehicles/MijnBus/mijn.bus|Vehicles/MijnBus/model/model.cfg|options.cfg')

// ---- de regel zelf ----
const veiligPad = (zipLezer as { veiligPad?: (naam: string) => string | undefined }).veiligPad
if (!veiligPad) klopt('veiligPad bestaat', false)
else {
  klopt('veiligPad: gewoon pad blijft', veiligPad('Vehicles/MijnBus/mijn.bus') === 'Vehicles/MijnBus/mijn.bus')
  klopt('veiligPad: backslashes en ./ worden gewoon', veiligPad('a\\.\\b//c') === 'a/b/c')
  for (const naam of [...RAAR, ...APPARATEN]) klopt(`veiligPad weigert ${JSON.stringify(naam)}`, veiligPad(naam) === undefined)
  klopt('veiligPad: "console.cfg" en "nulpunt.txt" mogen wel', veiligPad('Fonts/console.cfg') === 'Fonts/console.cfg' && veiligPad('a/nulpunt.txt') === 'a/nulpunt.txt')
}

einde()
