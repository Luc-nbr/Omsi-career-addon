/**
 * De afrekening achteraf uit openOMSI (ontwerp openomsi-koppeling §6; stap 3).
 *
 *   npx tsx scripts/probe-openomsi-afrekening.ts     (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Met de sessiebestanden die Lucs openOMSI op 28 en 30-09 schreef
 * (scripts/fixtures/openomsi/sessions, gekopieerd, zonder zijn gebruikersnaam),
 * in een eigen ~/.openomsi. Niets draait; alleen lezen.
 *
 *  1. De fixture 1790789187-23516.json (TH_Wald 302, opgestart volgens
 *     launcher.log:568): 0,567 km, 1 halte, 1 te vroeg, 0 te laat,
 *     0 aanrijdingen, 8 schokken.
 *  2. Een keten van twee processen (Krefrath, Wagen 3: 18452 en 21488) telt op.
 *  3. Een bestand van een andere omloop of kaart telt niet mee.
 *  4. Ontbreekt het bestand: eerst wachten, na 30 s "onvolledig" -- geen fout.
 *     Ook zonder sessions-map, met een kapot bestand en bij een hergebruikt pid.
 *  5. Een keten waarvan één proces niets schreef (gecrasht): wat er is, telt,
 *     en het ontbrekende pid staat erbij.
 *  6. De sessie van Lucs proefrit (30-09, openOMSI 0.1.307, TH_Wald 306,
 *     pid 31028, met de echte instance erbij): een korte rit van 7 s en 0,15 m
 *     wordt een afrekening van 0 km, 0 haltes, zonder fout; de nieuwe velden
 *     (comfort, driving, ticketing, driver) storen niet.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afrekeningNaEinde, AFREKENING_WACHT_MS, leesAfrekening, type Afrekening } from '../src/core/motoren/openomsi'
import { filetimeNaarIso } from '../src/core/spelmotor'
import { einde, klopt, proefMap } from './proefhulp'

const FIX = join(__dirname, 'fixtures', 'openomsi')
const iso = (seconden: number): string => new Date(seconden * 1000).toISOString()
const isAfrekening = (x: unknown): x is Afrekening => Boolean(x) && typeof x === 'object' && !('onvolledig' in (x as object))

function main(): void {
  const thuis = proefMap('openomsi-afrekening')
  mkdirSync(join(thuis, 'sessions'), { recursive: true })
  for (const f of readdirSync(join(FIX, 'sessions'))) copyFileSync(join(FIX, 'sessions', f), join(thuis, 'sessions', f))

  /* 1. de fixture van launcher.log:568 */
  const inst = JSON.parse(readFileSync(join(FIX, 'instances', '1790788971-25340-4.json'), 'utf8')) as { pid: number; process_started: number }
  const dienst302 = { mapFolder: 'TH_Wald', line: 'Omnibusverkehr Rennsteig', tour: '302 - 725302' }
  const a = leesAfrekening([{ pid: inst.pid, gestart: filetimeNaarIso(inst.process_started) }], thuis, dienst302)
  klopt('de fixture wordt een afrekening', isAfrekening(a))
  if (isAfrekening(a)) {
    console.log(`     ${a.km} km, ${a.haltes} halte(s), ${a.teVroeg} te vroeg, ${a.teLaat} te laat, ${a.aanrijdingen} aanrijdingen, ${a.schokken} schokken, ${Math.round(a.seconden)} s`)
    klopt('0,567 km', a.km === 0.567)
    klopt('1 halte', a.haltes === 1)
    klopt('1 te vroeg, 0 te laat', a.teVroeg === 1 && a.teLaat === 0)
    klopt('0 aanrijdingen, 0 gewonden', a.aanrijdingen === 0 && a.gewonden === 0)
    klopt('8 schokken', a.schokken === 8)
    klopt('uit pid 23516, bestand 1790789187-23516.json', a.pids.join() === '23516' && a.bestanden.join() === '1790789187-23516.json')
  }
  const naEinde = afrekeningNaEinde([{ pid: inst.pid }], Date.now(), Date.now(), thuis, dienst302)
  klopt('met het bestand er al: meteen klaar, ook binnen de 30 s', naEinde.stand === 'klaar')

  /* 2. een keten van twee: optellen */
  const lees = (naam: string): Record<string, number> => JSON.parse(readFileSync(join(FIX, 'sessions', naam), 'utf8')) as Record<string, number>
  const s1 = lees('1790782204-18452.json')
  const s2 = lees('1790785015-21488.json')
  const krefrath = { mapFolder: 'Krefrath', line: 'Region', tour: 'Wagen 3' }
  const k = leesAfrekening(
    [
      { pid: 18452, gestart: iso(1790781940) },
      { pid: 21488, gestart: iso(1790782332) }
    ],
    thuis,
    krefrath
  )
  klopt('een keten van twee processen wordt één afrekening', isAfrekening(k))
  if (isAfrekening(k)) {
    console.log(`     ${k.km} km, ${k.haltes} haltes, ${k.teVroeg} te vroeg, ${k.aanrijdingen} aanrijdingen, ${k.schokken} schokken`)
    klopt('meters opgeteld', k.km === Math.round(s1.metres + s2.metres) / 1000)
    klopt('haltes, te vroeg, te laat opgeteld', k.haltes === s1.stops + s2.stops && k.teVroeg === s1.early + s2.early && k.teLaat === s1.late + s2.late)
    klopt('aanrijdingen en schokken opgeteld', k.aanrijdingen === s1.crashes + s2.crashes && k.schokken === s1.jolts + s2.jolts)
    klopt('seconden opgeteld', Math.abs(k.seconden - (s1.seconds + s2.seconds)) < 1e-6)
    klopt('beide pids', k.pids.join() === '18452,21488' && k.ontbreekt.length === 0)
  }

  /* 3. een andere omloop telt niet */
  const ander = leesAfrekening([{ pid: 3728, gestart: iso(1790788879) }], thuis, dienst302)
  klopt('een bestand van omloop 304 bij een dienst op 302: niet meegeteld, onvolledig', !isAfrekening(ander) && ander.afwijkend.includes('1790788954-3728.json'))
  const andereKaart = leesAfrekening([{ pid: 23516 }], thuis, { mapFolder: 'Krefrath' })
  klopt('een bestand van een andere kaart: niet meegeteld', !isAfrekening(andereKaart))
  const zonderLijn = leesAfrekening([{ pid: 23516 }], thuis, { mapFolder: 'TH_Wald' })
  klopt('een dienst zonder lijn of omloop (vrij rijden): alleen de kaart telt', isAfrekening(zonderLijn))

  /* 4. geen bestand */
  const nu = Date.now()
  const geen = afrekeningNaEinde([{ pid: 424242, gestart: iso(nu / 1000 - 60) }], nu - 5000, nu, thuis, dienst302)
  klopt('geen bestand, 5 s na het einde: nog wachten', geen.stand === 'wacht')
  const laat = afrekeningNaEinde([{ pid: 424242, gestart: iso(nu / 1000 - 60) }], nu - AFREKENING_WACHT_MS - 1000, nu, thuis, dienst302)
  klopt('geen bestand, 31 s na het einde: onvolledig, met het pid', laat.stand === 'onvolledig' && laat.ontbreekt.join() === '424242')
  let gegooid = false
  try {
    afrekeningNaEinde([{ pid: 1 }], 0, nu, join(thuis, 'bestaat-niet'))
    leesAfrekening([], join(thuis, 'bestaat-niet'))
  } catch {
    gegooid = true
  }
  klopt('zonder sessions-map of zonder keten: geen fout', !gegooid && afrekeningNaEinde([{ pid: 1 }], 0, nu, join(thuis, 'bestaat-niet')).stand === 'onvolledig')
  writeFileSync(join(thuis, 'sessions', `${Math.floor(nu / 1000)}-515151.json`), '{"time": 17, "metres": ')
  const kapot = afrekeningNaEinde([{ pid: 515151 }], nu - 40000, nu, thuis)
  klopt('een half geschreven bestand: onvolledig, geen fout', kapot.stand === 'onvolledig')
  // Een pid dat de vorige dag ook bestond: een bestand van vóór de start telt niet.
  const oud = leesAfrekening([{ pid: 23516, gestart: iso(1790789187 + 3600) }], thuis, dienst302)
  klopt('hergebruikt pid: een bestand van vóór de start van dit proces telt niet', !isAfrekening(oud))

  /* 5. een keten waarin één proces niets schreef */
  const deels = [{ pid: 23516, gestart: filetimeNaarIso(inst.process_started) }, { pid: 616161, gestart: iso(1790789200) }]
  const binnen = afrekeningNaEinde(deels, nu - 1000, nu, thuis, dienst302)
  klopt('een lid zonder bestand, binnen 30 s: nog wachten (het kan nog schrijven)', binnen.stand === 'wacht')
  const erna = afrekeningNaEinde(deels, nu - 40000, nu, thuis, dienst302)
  klopt(
    'na 30 s: wat er is telt (0,567 km), het ontbrekende pid staat erbij',
    erna.stand === 'klaar' && erna.afrekening.km === 0.567 && erna.afrekening.ontbreekt.join() === '616161'
  )

  /* 6. de proefrit van 30-09 */
  const inst4 = JSON.parse(readFileSync(join(FIX, 'instances', '1790799227-13696-4.json'), 'utf8')) as { pid: number; process_started: number; line: string; tour: string }
  const proef = leesAfrekening(
    [{ pid: inst4.pid, gestart: filetimeNaarIso(inst4.process_started) }],
    thuis,
    { mapFolder: 'TH_Wald', line: inst4.line, tour: inst4.tour }
  )
  klopt('de proefrit wordt een afrekening', isAfrekening(proef))
  if (isAfrekening(proef)) {
    console.log(`     ${proef.km} km (${proef.meters.toFixed(3)} m), ${proef.haltes} haltes, ${proef.seconden.toFixed(1)} s, ${proef.schokken} schokken`)
    klopt('0 km (0,155 m), 0 haltes, 0 te vroeg/te laat, 0 aanrijdingen, 7,2 s', proef.km === 0 && Math.abs(proef.meters - 0.1546) < 0.001 && proef.haltes === 0 && proef.teVroeg === 0 && proef.teLaat === 0 && proef.aanrijdingen === 0 && Math.abs(proef.seconden - 7.167) < 0.01)
    klopt('uit pid 31028, bestand 1790799329-31028.json', proef.pids.join() === '31028' && proef.bestanden.join() === '1790799329-31028.json')
  }
  const andereOmloop = leesAfrekening([{ pid: inst4.pid, gestart: filetimeNaarIso(inst4.process_started) }], thuis, { mapFolder: 'TH_Wald', line: inst4.line, tour: '302 - 725302' })
  klopt('dezelfde sessie bij een dienst op omloop 302: niet meegeteld', !isAfrekening(andereOmloop) && andereOmloop.afwijkend.includes('1790799329-31028.json'))
}

main()
einde()
