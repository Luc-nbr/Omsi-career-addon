/**
 * Vrij rijden starten, zonder Electron en zonder de spelmap (core/vrijstart.ts).
 *
 *   npx tsx scripts/probe-vrijstart.ts
 *
 * Elke tak van START met nagemaakte stappen: kijken of OMSI draait, de
 * controle, de situatie schrijven, het startscherm klaarzetten, de wachtende
 * knoppen bijschrijven en OMSI starten. Getoetst wordt wat er aangeroepen
 * wordt en wat `klaargezet` zegt:
 * - OMSI dicht: alles, in die volgorde; een fout bij de knoppen houdt het
 *   starten niet tegen; een geweigerde of mislukte start zegt dat;
 * - OMSI dicht en iets ontbreekt (bus, tegels, plek, schrijven): een weigering
 *   met reden, en er wordt niets gestart;
 * - OMSI draait: alleen de situatie (echt geschreven, in een tijdelijke map),
 *   nooit het startscherm en nooit een start; lukt het niet, dan "niets".
 * - het weer (in een nagemaakte spelmap): presetStartup haalt alleen weer weg
 *   dat de app zelf koos, bewaart het weer van de kaart naast de kopie van
 *   laststn.osn, en writeSituation neemt het weer van de kaart ook als het
 *   sjabloon een kopie zonder `.owt` is (tegenlezing 28-09).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Beginplek, VrijCheckVol } from '../src/core/beginplek'
import { readOmsiLines } from '../src/core/omsiFile'
import { writeSituation, type SituationRequest, type SituationResult } from '../src/core/situation'
import { presetStartup } from '../src/core/startup'
import { startVrijeRit, type VrijStartDeps, type VrijStartVerzoek } from '../src/core/vrijstart'

const PLEK: Beginplek = {
  nr: 3,
  naam: '[ 51 ]  Krefrath Hbf',
  bron: 'vertrekken',
  aantal: 9,
  tot: 890,
  klok: 845,
  spawn: { tx: 1, ty: 2, x: 174.993, z: 297.511, height: 0.15, heading: 322.1, quaternion: [0, -0.325, 0, 0.946] },
  wereld: { x: 474.993, y: 897.511 }
}
const CHECK: VrijCheckVol = {
  ok: true,
  plek: PLEK,
  moment: { iso: '2017-12-25', year: 2017, dayOfYear: 359, minutes: 845, bron: 'klok' }
}

interface Spoor {
  stappen: string[]
  geschreven?: SituationRequest
  /** Waarmee de controle gevraagd werd. */
  wanneer?: VrijStartVerzoek['wanneer']
}

function deps(
  spoor: Spoor,
  opties: {
    draait?: boolean
    check?: VrijCheckVol | Error
    inzetpunt?: Beginplek
    schrijven?: Error
    echtSchrijven?: string
    preset?: { lastSituation: boolean; lastMap: boolean }
    straks?: Error
    start?: 'gestart' | 'geweigerd' | 'mislukt' | Error
  }
): VrijStartDeps {
  return {
    isRunning: async () => {
      spoor.stappen.push('draait?')
      return Boolean(opties.draait)
    },
    check: async (_folder, wanneer) => {
      spoor.stappen.push('check')
      spoor.wanneer = wanneer
      if (opties.check instanceof Error) throw opties.check
      return opties.check ?? CHECK
    },
    inzetpunt: (_folder, nr) => {
      spoor.stappen.push(`inzetpunt ${nr}`)
      return opties.inzetpunt
    },
    writeSituation: (request): SituationResult => {
      spoor.stappen.push('schrijf')
      spoor.geschreven = request
      if (opties.schrijven) throw opties.schrijven
      if (opties.echtSchrijven) return writeSituation('C:/bestaat-niet', { ...request, into: opties.echtSchrijven })
      return { file: 'nep.osn', vehiclePlaced: Boolean(request.vehicle && request.spawn), spawnPlaced: Boolean(request.spawn) }
    },
    presetStartup: () => {
      spoor.stappen.push('preset')
      return opties.preset ?? { lastSituation: true, lastMap: true }
    },
    schrijfStraks: async () => {
      spoor.stappen.push('straks')
      if (opties.straks) throw opties.straks
    },
    launchOmsi: async () => {
      spoor.stappen.push('start')
      if (opties.start instanceof Error) throw opties.start
      return opties.start ?? 'gestart'
    },
    log: () => undefined
  }
}

const VERZOEK: VrijStartVerzoek = {
  mapFolder: 'Krefrath',
  vehicle: { relativePath: 'Vehicles\\MAN_SD200\\SD77.bus', lineNumber: '', terminus: '' },
  naam: 'OMSI Enhancer — Vrij rijden'
}

let fout = 0
function tijdIs(naam: string, spoor: Spoor, minuten: number): void {
  const goed = spoor.geschreven?.minutes === minuten
  if (!goed) fout++
  console.log(`${goed ? 'goed' : 'FOUT'}  ${naam}: situatie om ${spoor.geschreven?.minutes} (verwacht ${minuten})`)
}
async function geval(
  naam: string,
  opties: Parameters<typeof deps>[1],
  verzoek: Partial<VrijStartVerzoek>,
  verwacht: { stappen: string[]; klaargezet: string; fout?: string; start?: string; launched?: boolean }
): Promise<Spoor> {
  const spoor: Spoor = { stappen: [] }
  const uit = await startVrijeRit(deps(spoor, opties), { ...VERZOEK, ...verzoek })
  const goed =
    spoor.stappen.join(',') === verwacht.stappen.join(',') &&
    uit.klaargezet === verwacht.klaargezet &&
    uit.fout === verwacht.fout &&
    (verwacht.start === undefined || uit.start === verwacht.start) &&
    (verwacht.launched === undefined || uit.launched === verwacht.launched)
  if (!goed) fout++
  console.log(
    `${goed ? 'goed' : 'FOUT'}  ${naam}: ${spoor.stappen.join(' > ')} -> klaargezet ${uit.klaargezet}` +
      `${uit.fout ? `, fout ${uit.fout}` : ''}${uit.start ? `, start ${uit.start}` : ''}${uit.foutTekst ? ` (${uit.foutTekst})` : ''}` +
      (goed ? '' : `   verwacht ${verwacht.stappen.join(' > ')} / ${verwacht.klaargezet} / ${verwacht.fout ?? '-'}`)
  )
  return spoor
}

async function main(): Promise<void> {
  /* ---- OMSI dicht ---- */
  const gewoon = await geval('dicht, alles goed', {}, {}, {
    stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'],
    klaargezet: 'start',
    start: 'gestart',
    launched: true
  })
  const q = gewoon.geschreven?.spawn?.quaternion?.join(',')
  if (q !== '0,-0.325,0,0.946') {
    fout++
    console.log(`FOUT  het quaternion ging niet mee: ${q}`)
  }
  /* Zelf gekozen tijd: de plek en het moment van het scherm. */
  const gekozen = await geval(
    'dicht, gekozen tijd, plek van het scherm',
    { inzetpunt: PLEK },
    { wanneer: { tijd: 800 }, plek: 3, moment: { year: 2017, dayOfYear: 359, minutes: 800 } },
    { stappen: ['draait?', 'inzetpunt 3', 'schrijf', 'preset', 'straks', 'start'], klaargezet: 'start' }
  )
  tijdIs('gekozen tijd blijft', gekozen, 800)
  await geval(
    'dicht, gekozen tijd, plek bestaat niet meer',
    {},
    { wanneer: { tijd: 845 }, plek: 99, moment: { year: 2017, dayOfYear: 359, minutes: 845 } },
    { stappen: ['draait?', 'inzetpunt 99', 'check', 'schrijf', 'preset', 'straks', 'start'], klaargezet: 'start' }
  )
  /*
   * Automatische tijd: START bepaalt plek en moment opnieuw. Het scherm zei
   * 13:20 (800), de controle nu 14:05 (845): wie lang op de busstap bleef,
   * start niet meer in het verleden.
   */
  const opnieuw = await geval(
    'dicht, automatische tijd, opnieuw bepaald',
    { inzetpunt: PLEK },
    { plek: 3, moment: { year: 2017, dayOfYear: 359, minutes: 800 } },
    { stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'], klaargezet: 'start' }
  )
  tijdIs('automatische tijd opnieuw', opnieuw, 845)
  const metDatum = await geval(
    'dicht, gekozen datum, automatische tijd',
    { inzetpunt: PLEK },
    { wanneer: { datum: '2017-12-25' }, plek: 3, moment: { year: 2017, dayOfYear: 359, minutes: 800 } },
    { stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'], klaargezet: 'start' }
  )
  {
    const goed = metDatum.wanneer?.datum === '2017-12-25' && metDatum.wanneer?.tijd === undefined
    if (!goed) fout++
    console.log(`${goed ? 'goed' : 'FOUT'}  de gekozen datum gaat mee naar de controle: ${JSON.stringify(metDatum.wanneer)}`)
  }
  const hapert = await geval(
    'dicht, automatische tijd, controle kapot',
    { inzetpunt: PLEK, check: new Error('werker gestopt') },
    { plek: 3, moment: { year: 2017, dayOfYear: 359, minutes: 800 } },
    { stappen: ['draait?', 'check', 'inzetpunt 3', 'schrijf', 'preset', 'straks', 'start'], klaargezet: 'start' }
  )
  tijdIs('controle kapot: die van het scherm', hapert, 800)
  await geval(
    'dicht, automatische tijd, kaart zonder tegels',
    { inzetpunt: PLEK, check: { ok: false, fout: 'onvolledig', moment: CHECK.moment } },
    { plek: 3, moment: { year: 2017, dayOfYear: 359, minutes: 800 } },
    { stappen: ['draait?', 'check'], klaargezet: 'niets', fout: 'onvolledig' }
  )
  await geval('dicht, last_map niet te zetten', { preset: { lastSituation: true, lastMap: false } }, {}, {
    stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'],
    klaargezet: 'situatie'
  })
  await geval('dicht, knoppen bijschrijven mislukt', { straks: new Error('keyboard.cfg op slot') }, {}, {
    stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'],
    klaargezet: 'start',
    start: 'gestart'
  })
  await geval('dicht, Windows weigert', { start: 'geweigerd' }, {}, {
    stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'],
    klaargezet: 'start',
    start: 'geweigerd',
    launched: false
  })
  await geval('dicht, starten mislukt', { start: new Error('Omsi.exe niet gevonden') }, {}, {
    stappen: ['draait?', 'check', 'schrijf', 'preset', 'straks', 'start'],
    klaargezet: 'start',
    start: 'mislukt',
    launched: false
  })
  await geval('dicht, geen bus', {}, { vehicle: undefined }, { stappen: ['draait?'], klaargezet: 'niets', fout: 'geenBus' })
  await geval('dicht, kaart zonder tegels', { check: { ok: false, fout: 'onvolledig', moment: CHECK.moment } }, {}, {
    stappen: ['draait?', 'check'],
    klaargezet: 'niets',
    fout: 'onvolledig'
  })
  await geval('dicht, geen plek', { check: { ok: false, fout: 'geenPlek', moment: CHECK.moment } }, {}, {
    stappen: ['draait?', 'check'],
    klaargezet: 'niets',
    fout: 'geenPlek'
  })
  await geval('dicht, controle kapot', { check: new Error('werker gestopt') }, {}, {
    stappen: ['draait?', 'check'],
    klaargezet: 'niets',
    fout: 'geenDienstregeling'
  })
  await geval('dicht, schrijven mislukt', { schrijven: new Error('EPERM') }, {}, {
    stappen: ['draait?', 'check', 'schrijf'],
    klaargezet: 'niets',
    fout: 'schrijven'
  })

  /* ---- OMSI draait: alleen de situatie, echt geschreven in een tijdelijke map ---- */
  const into = mkdtempSync(join(tmpdir(), 'omsi-vrijstart-'))
  await geval('draait, situatie klaar', { draait: true, echtSchrijven: into }, {}, {
    stappen: ['draait?', 'check', 'schrijf'],
    klaargezet: 'situatie',
    launched: false
  })
  const bestand = join(into, 'OMSI Enhancer.osn')
  const inhoud = existsSync(bestand) ? readFileSync(bestand).toString('utf16le') : ''
  const regels = inhoud.split('\r\n')
  const at = regels.indexOf('[vehicle]')
  const inBestand = regels.slice(at + 5, at + 9).join(',')
  if (inBestand !== '0.000000,-0.325000,0.000000,0.946000' || !inhoud.includes('maps\\Krefrath\\global.cfg')) {
    fout++
    console.log(`FOUT  de geschreven situatie: quaternion ${inBestand}`)
  } else console.log(`goed  de situatie staat in de tijdelijke map, met quaternion ${inBestand}`)
  rmSync(into, { recursive: true, force: true })

  await geval('draait, geen plek', { draait: true, check: { ok: false, fout: 'geenPlek', moment: CHECK.moment } }, {}, {
    stappen: ['draait?', 'check'],
    klaargezet: 'niets'
  })
  await geval('draait, schrijven mislukt', { draait: true, schrijven: new Error('EPERM') }, {}, {
    stappen: ['draait?', 'check', 'schrijf'],
    klaargezet: 'niets'
  })
  await geval('draait, geen bus', { draait: true }, { vehicle: undefined }, { stappen: ['draait?'], klaargezet: 'niets' })

  /*
   * ---- presetStartup: het weer naast laststn.osn in een eigen `try` ----
   * Een `.owt` die niet weg of over te schrijven is (hier: een map met die
   * naam) maakte eerst de hele "Last Situation" tot mislukt, terwijl
   * laststn.osn al geschreven was. Echt geschreven, in een nagemaakte spelmap.
   */
  const spel = mkdtempSync(join(tmpdir(), 'omsi-startscherm-'))
  mkdirSync(join(spel, 'maps', 'Krefrath'), { recursive: true })
  writeFileSync(join(spel, 'options.cfg'), '[last_map]\r\nmaps\\Ander\\global.cfg\r\n', 'latin1')
  const situatie = join(spel, 'OMSI Enhancer.osn')
  writeFileSync(situatie, 'situatie')
  const laatste = join(spel, 'maps', 'Krefrath', 'laststn.osn')
  const weergeval = (naam: string, goed: boolean, uitleg: string): void => {
    if (!goed) fout++
    console.log(`${goed ? 'goed' : 'FOUT'}  startscherm, ${naam}: ${uitleg}`)
  }
  /* Een bestand zoals OMSI het schrijft: UTF-16 met BOM, blokken met een tag. */
  const utf16 = (pad: string, regels: string[]): void =>
    writeFileSync(pad, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(regels.join('\r\n'), 'utf16le')]))
  const weerBestand = (pad: string, naam: string): void => utf16(pad, ['[name]', naam, '', '[description]', '', '[end]', ''])
  const situatieBestand = (pad: string, naam: string, kaart: string): void =>
    utf16(pad, ['[name]', naam, '', '[map]', `maps\\${kaart}\\global.cfg`, ''])
  const naamVan = (pad: string): string => {
    if (!existsSync(pad) || !statSync(pad).isFile()) return '-'
    const regels = readOmsiLines(pad)
    const at = regels.findIndex((regel) => regel.trim() === '[name]')
    return at >= 0 ? regels[at + 1] : readFileSync(pad, 'utf8')
  }
  const kopie = `${laatste}.voor-omsi-enhancer`
  {
    // Weer dat niet over te schrijven is (een map met die naam): de situatie staat er toch.
    mkdirSync(`${laatste}.owt`)
    writeFileSync(`${situatie}.owt`, 'eigen weer')
    const uit = presetStartup(spel, 'Krefrath', situatie)
    weergeval(
      'weer niet over te schrijven',
      uit.lastSituation && uit.lastMap && Boolean(uit.weerFout) && readFileSync(laatste, 'utf8') === 'situatie',
      `laatste situatie ${uit.lastSituation}, last_map ${uit.lastMap}, weer ${uit.weerFout ? 'niet' : 'wel'} (${uit.weerFout ?? '-'})`
    )
    rmSync(`${laatste}.owt`, { recursive: true, force: true })
    rmSync(`${situatie}.owt`, { force: true })
  }
  {
    // Weer dat de app bij de vorige rit koos: weg, en niet naast de kopie.
    weerBestand(`${laatste}.owt`, 'OMSI Enhancer - regen')
    const uit = presetStartup(spel, 'Krefrath', situatie)
    weergeval(
      'gekozen weer weggehaald',
      uit.lastSituation && !uit.weerFout && existsSync(kopie) && !existsSync(`${laatste}.owt`) && !existsSync(`${kopie}.owt`),
      `laatste situatie ${uit.lastSituation}, kopie ${existsSync(kopie)}, .owt ${naamVan(`${laatste}.owt`)}, kopie.owt ${naamVan(`${kopie}.owt`)}`
    )
  }
  {
    // Het weer van de kaart (van OMSI, na het afsluiten): blijft staan, en gaat naast de kopie.
    weerBestand(`${laatste}.owt`, 'Sommerlich')
    const uit = presetStartup(spel, 'Krefrath', situatie)
    weergeval(
      'weer van de kaart blijft',
      uit.lastSituation && !uit.weerFout && naamVan(`${laatste}.owt`) === 'Sommerlich' && naamVan(`${kopie}.owt`) === 'Sommerlich',
      `.owt ${naamVan(`${laatste}.owt`)}, kopie.owt ${naamVan(`${kopie}.owt`)}`
    )
  }
  {
    // Een situatie met eigen weer: dat gaat mee; het weer naast de kopie blijft.
    writeFileSync(`${situatie}.owt`, 'eigen weer')
    const uit = presetStartup(spel, 'Krefrath', situatie)
    const mee = existsSync(`${laatste}.owt`) && statSync(`${laatste}.owt`).isFile() && readFileSync(`${laatste}.owt`, 'utf8') === 'eigen weer'
    weergeval(
      'eigen weer',
      uit.lastSituation && !uit.weerFout && mee && naamVan(`${kopie}.owt`) === 'Sommerlich',
      `laatste situatie ${uit.lastSituation}, weer mee ${mee}, kopie.owt ${naamVan(`${kopie}.owt`)}`
    )
  }
  rmSync(spel, { recursive: true, force: true })

  /*
   * ---- writeSituation: welk weer "zoals de kaart" is ----
   * De kaart heeft een laststn.osn van de app (met weer dat de app koos) en een
   * kopie van OMSI. Het sjabloon voor het tijdvak is de kopie; het weer moet
   * ook van de kaart komen, niet van de vorige rit en niet van een andere kaart.
   */
  const weerkeuze = (naam: string, goed: boolean, uitleg: string): void => {
    if (!goed) fout++
    console.log(`${goed ? 'goed' : 'FOUT'}  weer van de situatie, ${naam}: ${uitleg}`)
  }
  const spel2 = mkdtempSync(join(tmpdir(), 'omsi-weer-'))
  const kaart2 = join(spel2, 'maps', 'Krefrath')
  mkdirSync(kaart2, { recursive: true })
  mkdirSync(join(spel2, 'Situations'))
  const last2 = join(kaart2, 'laststn.osn')
  situatieBestand(last2, 'OMSI Enhancer — vrij rijden', 'Krefrath')
  weerBestand(`${last2}.owt`, 'OMSI Enhancer - regen')
  situatieBestand(`${last2}.voor-omsi-enhancer`, 'Last Situation', 'Krefrath')
  weerBestand(`${last2}.voor-omsi-enhancer.owt`, 'Sommerlich')
  // Een scenario van een andere kaart, en het weer van de vorige rit (op een andere kaart).
  situatieBestand(join(spel2, 'Situations', 'Anders.osn'), 'Anders', 'Grundorf')
  weerBestand(join(spel2, 'Situations', 'Anders.osn.owt'), 'Sturm')
  const eigen2 = join(spel2, 'Situations', 'OMSI Enhancer.osn')
  weerBestand(`${eigen2}.owt`, 'Nebel')
  const verzoek: SituationRequest = {
    mapFolder: 'Krefrath',
    name: 'OMSI Enhancer — proef',
    description: '',
    year: 2017,
    dayOfYear: 359,
    minutes: 845
  }
  {
    const uit = writeSituation(spel2, verzoek)
    const goed = naamVan(`${eigen2}.owt`) === 'Sommerlich' && uit.weerVan === join('maps', 'Krefrath', 'laststn.osn.voor-omsi-enhancer.owt')
    weerkeuze('weer van de kopie', goed, `weer ${naamVan(`${eigen2}.owt`)} uit ${uit.weerVan ?? '-'}`)
  }
  {
    // Het weer naast een laststn.osn van de app, dat de app niet koos: dat is het weer van de kaart.
    weerBestand(`${last2}.owt`, '<Bestes Wetter>')
    const uit = writeSituation(spel2, verzoek)
    const goed = naamVan(`${eigen2}.owt`) === '<Bestes Wetter>' && uit.weerVan === join('maps', 'Krefrath', 'laststn.osn.owt')
    weerkeuze('weer naast laststn.osn', goed, `weer ${naamVan(`${eigen2}.owt`)} uit ${uit.weerVan ?? '-'}`)
  }
  {
    // Alleen gekozen weer, en een eigen situatie met oud weer: het standaardweer van OMSI.
    weerBestand(`${last2}.owt`, 'OMSI Enhancer - regen')
    rmSync(`${last2}.voor-omsi-enhancer.owt`)
    weerBestand(`${eigen2}.owt`, 'Nebel')
    const uit = writeSituation(spel2, verzoek)
    weerkeuze(
      'geen weer van de kaart',
      !existsSync(`${eigen2}.owt`) && uit.weerVan === undefined,
      `weer ${naamVan(`${eigen2}.owt`)} uit ${uit.weerVan ?? '-'}`
    )
  }
  {
    // Zelf gekozen: precies dat.
    const uit = writeSituation(spel2, { ...verzoek, weather: 'fog' })
    weerkeuze(
      'zelf gekozen weer',
      naamVan(`${eigen2}.owt`).startsWith('OMSI Enhancer') && uit.weerVan === undefined,
      `weer ${naamVan(`${eigen2}.owt`)}`
    )
  }
  rmSync(spel2, { recursive: true, force: true })

  console.log(fout === 0 ? 'vrijstart: goed' : `VRIJSTART KLOPT NIET (${fout})`)
  process.exit(fout === 0 ? 0 : 1)
}

void main()
