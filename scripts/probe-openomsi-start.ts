/**
 * Starten en stoppen van openOMSI (ontwerp openomsi-koppeling §5.2, §5.3; stap 2).
 *
 *   npx tsx scripts/probe-openomsi-start.ts     (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Er start nooit een echt openOMSI. In een nagebouwde OMSI 2-map staan een
 * nep-`openomsi-launcher.exe` en een nep-`openomsi.exe` (nepexe met
 * scripts/nepexe/neplauncher.cjs en nepspel.cjs erachter; nepexe wordt hier
 * gebouwd met MSVC). ~/.openomsi is een eigen map. Alleen eigen
 * nep-processen worden gestopt.
 *
 *  1. De Duty voor Lucs dienst (TH_Wald 302) is gelijk aan de fixture-JSON.
 *  2. De terugval-opties zijn precies de lijst uit launcher.log:568 (en uit
 *     een instance met een kleurstelling); geen -windowed; --plate pas vanaf
 *     0.1.307.
 *  3. Starten via `--cli launch`: de launcher krijgt precies de fixture-JSON,
 *     het antwoord (pid) komt binnen terwijl het spel doordraait.
 *  4. Een fout van de launcher komt letterlijk terug; "no OMSI 2 folder
 *     configured" en een ontbrekende launcher geven de terugval, met de
 *     uitvoer in openomsi-game.log.
 *  5. Stoppen: via `--cli stop` netjes; een spel dat de launcher niet kent:
 *     taskkill zonder /F, 8 s, dan /F.
 *  6. Het spel blijft draaien als de app dichtgaat (beide wegen).
 *  7. Voortzetten kiest laststn.osn uit de inhoudsmap van openOMSI, en het
 *     keyboard.cfg dat openOMSI echt volgt.
 *  8. Hash-momentopname: een dienst en een vrije rit in openOMSI veranderen
 *     in de OMSI 2-map buiten openOMSI\ en plugins\omsihub\ alleen
 *     Situations\OMSI Enhancer.*.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  bouwDuty,
  bouwSituatieDuty,
  dutyArgs,
  keyboardCfgVoorOpenOmsi,
  laststnVoorOpenOmsi,
  startOpenOmsi,
  stopOpenOmsi,
  vindOpenOmsi,
  vrijeRitDepsVoorOpenOmsi,
  type OpenOmsiDuty
} from '../src/core/motoren/openomsi'
import { procesMetPid } from '../src/core/omsiProces'
import { writeSituation } from '../src/core/situation'
import { presetStartup } from '../src/core/startup'
import { startVrijeRit, type VrijStartDeps } from '../src/core/vrijstart'
import { splitsOpdrachtregel } from '../src/core/spelmotor'
import { einde, klopt, proefMap, schrijf } from './proefhulp'
import { bouwNepexe, leeft, nepExe, wacht } from './nepexe/hulp'

const FIX = join(__dirname, 'fixtures', 'openomsi')
const LUC_ROOT = 'C:/Program Files (x86)/Steam\\steamapps/common/OMSI 2'

function momentopname(map: string): Map<string, string> {
  const uit = new Map<string, string>()
  const loop = (m: string): void => {
    for (const e of readdirSync(m, { withFileTypes: true })) {
      const p = join(m, e.name)
      if (e.isDirectory()) loop(p)
      else uit.set(relative(map, p).replace(/\\/g, '/'), createHash('sha256').update(readFileSync(p)).digest('hex'))
    }
  }
  loop(map)
  return uit
}

function verschil(voor: Map<string, string>, na: Map<string, string>): string[] {
  const alle = new Set([...voor.keys(), ...na.keys()])
  return [...alle].filter((p) => voor.get(p) !== na.get(p)).sort()
}

/** Wat een start in openOMSI in de OMSI 2-map mag veranderen (klaar-eis stap 2). */
function mag(pad: string): boolean {
  const p = pad.toLowerCase()
  return p.startsWith('openomsi/') || p.startsWith('plugins/omsihub/') || /^situations\/omsi enhancer\./.test(p)
}

async function main(): Promise<void> {
  /* ------------------------------------------------------------ 1. de Duty */
  const fixture = readFileSync(join(FIX, 'duty-th-wald-302.json'), 'utf8').trim()
  const duty302 = bouwDuty({
    mapFolder: 'TH_Wald',
    bus: 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_ZF.bus',
    hof: 'Thueringer Wald 2005',
    line: 'Omnibusverkehr Rennsteig',
    tour: '302 - 725302',
    minuten: 540,
    datum: '1989-05-30'
  })
  klopt('de Duty voor Lucs dienst is teken voor teken de fixture-JSON', JSON.stringify(duty302) === fixture)
  const pagina = JSON.parse(readFileSync(join(FIX, 'launcher-duty.json'), 'utf8')) as Record<string, unknown>
  klopt(
    'niet het formaat van launcher-duty.json (time 540, traffic 30.0): time is HH:MM, traffic een geheel getal',
    typeof pagina.time === 'number' && duty302.time === '09:00' && Number.isInteger(duty302.traffic)
  )
  klopt('over middernacht: 1510 minuten is 01:10', bouwDuty({ mapFolder: 'x', bus: 'b', minuten: 1510 }).time === '01:10')

  /* ------------------------------------------------------------ 2. de terugval-opties */
  const regels = readFileSync(join(FIX, 'launcher-gestart.log'), 'utf8').split(/\r?\n/)
  const r568 = regels.find((r) => r.startsWith('568\t'))!
  const verwacht568 = splitsOpdrachtregel(r568.slice(r568.indexOf(' --root ')))
  const args568 = dutyArgs(JSON.parse(fixture) as OpenOmsiDuty, { root: LUC_ROOT, profiel: 'OMSI-Fan', versie: '0.1.238' })
  klopt('terugval-opties = launcher.log:568, precies', JSON.stringify(args568) === JSON.stringify(verwacht568))
  if (JSON.stringify(args568) !== JSON.stringify(verwacht568)) console.log(`     kreeg   ${JSON.stringify(args568)}\n     verwacht ${JSON.stringify(verwacht568)}`)
  const inst2 = JSON.parse(readFileSync(join(FIX, 'instances', '1790788729-25340-2.json'), 'utf8')) as {
    map: string
    bus: string
    line: string
    tour: string
    args: string[]
  }
  const metLak = dutyArgs(
    {
      map: inst2.map,
      bus: inst2.bus,
      hof: 'Thueringer Wald 2005',
      entry: -1,
      line: inst2.line,
      tour: inst2.tour,
      time: '09:00',
      date: '1989-05-30',
      traffic: 30,
      passengers: true,
      schedule: true,
      paint: 'RVH (rostig)',
      plate: null
    },
    { root: LUC_ROOT, profiel: 'OMSI-Fan', versie: '0.1.238' }
  )
  klopt('met een kleurstelling = de opdrachtregel uit de instance van 19:18', JSON.stringify(metLak) === JSON.stringify(inst2.args))
  klopt('nooit -windowed', ![...args568, ...metLak].some((a) => a.toLowerCase() === '-windowed'))
  const metKenteken = { ...(JSON.parse(fixture) as OpenOmsiDuty), plate: 'B-AB 1234' }
  klopt('--plate niet voor 0.1.238', !dutyArgs(metKenteken, { root: LUC_ROOT, versie: '0.1.238' }).includes('--plate'))
  klopt('--plate niet als de versie onbekend is', !dutyArgs(metKenteken, { root: LUC_ROOT }).includes('--plate'))
  const a307 = dutyArgs(metKenteken, { root: LUC_ROOT, versie: '0.1.307' })
  klopt('--plate wel vanaf 0.1.307, na --time en voor --hof', a307.indexOf('--plate') > a307.indexOf('--time') && a307.indexOf('--plate') < a307.indexOf('--hof'))

  /* ------------------------------------------------------------ opzet: nep-OMSI 2-map met nep-openOMSI */
  const werk = proefMap('openomsi-start')
  const nepexe = bouwNepexe(join(werk, '..', 'nepexe-bouw'))
  const o2 = join(werk, 'OMSI 2')
  schrijf(o2, 'Omsi.exe', '')
  schrijf(o2, 'options.cfg', '[last_map]\r\nmaps\\TH_Wald\r\n\r\n')
  schrijf(o2, 'maps/TH_Wald/global.cfg', '[name]\r\nThüringer Wald\r\n')
  schrijf(o2, 'maps/TH_Wald/laststn.osn', 'OMSI 2 zelf\r\n')
  schrijf(o2, 'Inputs/keyboard.cfg', '[vehicles]\r\n')
  schrijf(o2, 'plugins/OMSICareer.opl', 'plugin\r\n')
  schrijf(o2, 'Situations/Andere.osn', 'blijft\r\n')
  mkdirSync(join(o2, 'openOMSI', 'maps'), { recursive: true })
  nepExe(nepexe, join(o2, 'openomsi.exe'), 'nepspel.cjs')
  nepExe(nepexe, join(o2, 'openomsi-launcher.exe'), 'neplauncher.cjs')
  const thuis = join(werk, 'thuis')
  schrijf(thuis, 'launcher.json', JSON.stringify({ root: o2.replace(/\\/g, '/'), game: '', profile: 'OMSI-Fan' }))
  const logMap = join(werk, 'log')
  mkdirSync(logMap, { recursive: true })
  const verslag = join(werk, 'verslag.jsonl')
  const merk = join(werk, 'merk')
  Object.assign(process.env, {
    NEPEXE_NODE: process.execPath,
    NEPLAUNCHER_THUIS: thuis,
    NEPLAUNCHER_VERSLAG: verslag,
    NEPSPEL_ACHTER: '1',
    NEPSPEL_MERK: merk,
    NEPSPEL_DUUR: '120000'
  })
  const gezien: number[] = []
  const inst = vindOpenOmsi(o2, { thuis, tempMappen: [join(werk, 'Temp')] })
  klopt('openOMSI gevonden in de OMSI 2-map, met launcher', inst?.bron === 'omsimap' && Boolean(inst.launcher))
  klopt('de inhoudsmap is OMSI 2\\openOMSI (Omsi.exe en maps staan ernaast)', inst?.inhoudsmap === join(o2, 'openOMSI'))
  if (!inst) throw new Error('geen nep-openOMSI')

  const voorAlles = momentopname(o2)

  /* ------------------------------------------------------------ 3. starten via --cli launch */
  const t0 = Date.now()
  const s1 = await startOpenOmsi(inst, duty302, { thuis, logMap, omsiPad: o2 })
  const duur = Date.now() - t0
  klopt(`gestart via de launcher (pid ${s1.pid}, ${duur} ms)`, s1.uitkomst === 'gestart' && s1.via === 'launcher' && Boolean(s1.pid))
  klopt('het antwoord kwam terwijl het spel doordraait (< 10 s)', duur < 10000 && leeft(s1.pid!))
  const gestuurd = readFileSync(verslag, 'utf8').trim().split('\n').map((r) => JSON.parse(r) as { opdracht: string; arg: string })
  klopt('de launcher kreeg precies de fixture-JSON', gestuurd.at(-1)?.opdracht === 'launch' && gestuurd.at(-1)?.arg === fixture)
  klopt('de launcher noemt zijn log (game.log) en de opdracht', Boolean(s1.log?.endsWith('game.log')) && Boolean(s1.opdracht?.includes('--map')))
  gezien.push(s1.pid!)

  /* ------------------------------------------------------------ 5a. stoppen via --cli stop */
  await wacht(800)
  const t1 = Date.now()
  const stop1 = await stopOpenOmsi({ motor: 'openomsi', pid: s1.pid!, uitTemp: false, bron: 'instance' }, { launcher: inst.launcher })
  klopt(`--cli stop: ${stop1} (${Date.now() - t1} ms)`, stop1 === 'netjes')
  await wacht(300)
  klopt('het spel is weg', !leeft(s1.pid!))
  const sessies = readdirSync(join(thuis, 'sessions')).filter((n) => n.endsWith(`-${s1.pid}.json`))
  klopt('en schreef zijn sessie (net einde)', sessies.length === 1)
  klopt('de launcher kreeg {"pid":N}', gestuurd.length >= 1 && readFileSync(verslag, 'utf8').includes(`"arg":"{\\"pid\\":${s1.pid}}"`))

  /* ------------------------------------------------------------ 4. fouten van de launcher, en de terugval */
  process.env.NEPLAUNCHER_FOUT = 'the bus Vehicles/x.bus was not found'
  const s2 = await startOpenOmsi(inst, duty302, { thuis, logMap, omsiPad: o2 })
  klopt(`een fout van de launcher komt letterlijk terug: "${s2.fout}"`, s2.uitkomst === 'mislukt' && s2.fout === 'error: the bus Vehicles/x.bus was not found')
  process.env.NEPLAUNCHER_FOUT = 'no OMSI 2 folder configured (set it under Setup)'
  const s3 = await startOpenOmsi(inst, duty302, { thuis, logMap, omsiPad: o2 })
  delete process.env.NEPLAUNCHER_FOUT
  klopt(`"no OMSI 2 folder configured" -> de terugval (pid ${s3.pid})`, s3.uitkomst === 'gestart' && s3.via === 'terugval' && Boolean(s3.pid))
  await wacht(1500)
  const gemerkt = JSON.parse(readFileSync(join(merk, `${s3.pid}.json`), 'utf8')) as { args: string[]; cwd: string }
  const terugvalVerwacht = dutyArgs(duty302, { root: o2.replace(/\\/g, '/'), profiel: 'OMSI-Fan', versie: inst.versie })
  klopt('het spel kreeg de opties van duty_args (root en profiel uit launcher.json)', JSON.stringify(gemerkt.args) === JSON.stringify(terugvalVerwacht))
  klopt('in de map van openomsi.exe', gemerkt.cwd.toLowerCase() === o2.toLowerCase())
  klopt('uitvoer naar openomsi-game.log, niet weggegooid', statSync(join(logMap, 'openomsi-game.log')).isFile())
  gezien.push(s3.pid!)

  /* ------------------------------------------------------------ 5b. stoppen zonder launcher: zonder /F, 8 s, dan /F */
  const wie = await procesMetPid(s3.pid!)
  const gestartOp = typeof wie === 'object' ? wie.start : undefined
  const kills: Array<{ hard: boolean; na: number }> = []
  const t2 = Date.now()
  const stop2 = await stopOpenOmsi(
    { motor: 'openomsi', pid: s3.pid!, gestart: gestartOp, uitTemp: false, bron: 'cim' },
    {
      launcher: inst.launcher,
      taskkill: async (pid, hard, naam) => {
        kills.push({ hard, na: Date.now() - t2 })
        const args = ['/FI', `PID eq ${pid}`, '/FI', `IMAGENAME eq ${naam}.exe`]
        if (hard) args.unshift('/F')
        spawnSync('taskkill', args, { windowsHide: true })
      }
    }
  )
  klopt(
    `onbekend bij de launcher: taskkill zonder /F, dan na ${kills[1] ? Math.round(kills[1].na / 1000) : '?'} s met /F -> ${stop2}`,
    kills.length === 2 && !kills[0].hard && kills[1].hard && kills[1].na >= 8000 && stop2 === 'geforceerd'
  )
  klopt('de launcher werd eerst gevraagd', readFileSync(verslag, 'utf8').includes(`"arg":"{\\"pid\\":${s3.pid}}"`))
  klopt('het spel is weg', !leeft(s3.pid!))
  const nogmaals = await stopOpenOmsi({ motor: 'openomsi', pid: s3.pid!, gestart: gestartOp, uitTemp: false, bron: 'cim' }, { launcher: inst.launcher })
  klopt(`nog een keer stoppen -> ${nogmaals}`, nogmaals === 'al-dicht')

  /* zonder launcher-exe: ook de terugval */
  const o2b = join(werk, 'OMSI 2 zonder launcher')
  schrijf(o2b, 'Omsi.exe', '')
  mkdirSync(join(o2b, 'maps'), { recursive: true })
  nepExe(nepexe, join(o2b, 'openomsi.exe'), 'nepspel.cjs')
  const instB = vindOpenOmsi(o2b, { thuis, tempMappen: [] })
  const s4 = await startOpenOmsi(instB!, duty302, { thuis, logMap, omsiPad: o2b })
  klopt('zonder openomsi-launcher.exe: de terugval', !instB?.launcher && s4.uitkomst === 'gestart' && s4.via === 'terugval')
  if (s4.pid) {
    gezien.push(s4.pid)
    spawnSync('taskkill', ['/F', '/FI', `PID eq ${s4.pid}`, '/FI', 'IMAGENAME eq openomsi.exe'], { windowsHide: true })
  }

  /* ------------------------------------------------------------ 6. het spel blijft draaien als de app sluit */
  const tsx = join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const hulp = join(__dirname, 'nepexe', 'start-en-weg.ts')
  const zelf = spawnSync(process.execPath, [tsx, hulp, 'zelf', inst.exe, join(logMap, 'zelf.log'), '--no-menu', '--map', 'maps/TH_Wald/global.cfg'], {
    encoding: 'utf8',
    env: process.env
  })
  const pidZelf = Number(zelf.stdout.trim())
  await wacht(1500)
  klopt(`terugval: de "app" is dicht, het spel (pid ${pidZelf || '?'}) draait door`, zelf.status === 0 && pidZelf > 0 && leeft(pidZelf))
  const viaL = spawnSync(process.execPath, [tsx, hulp, 'launcher', inst.launcher!, JSON.stringify(duty302)], { encoding: 'utf8', env: process.env })
  const pidL = Number(viaL.stdout.trim())
  await wacht(1500)
  klopt(`launcher: de "app" is dicht, het spel (pid ${pidL || '?'}) draait door`, viaL.status === 0 && pidL > 0 && leeft(pidL))
  for (const p of [pidZelf, pidL]) {
    if (p > 0) {
      gezien.push(p)
      spawnSync('taskkill', ['/F', '/FI', `PID eq ${p}`, '/FI', 'IMAGENAME eq openomsi.exe'], { windowsHide: true })
    }
  }

  /* ------------------------------------------------------------ 7. voortzetten en keyboard.cfg */
  klopt('voortzetten zonder laststn in de inhoudsmap: die van OMSI 2', laststnVoorOpenOmsi(o2, inst.inhoudsmap, 'TH_Wald') === join(o2, 'maps', 'TH_Wald', 'laststn.osn'))
  schrijf(inst.inhoudsmap, 'maps/TH_Wald/laststn.osn', 'openOMSI\r\n')
  const laststn = laststnVoorOpenOmsi(o2, inst.inhoudsmap, 'TH_Wald')
  klopt('voortzetten kiest laststn.osn uit de inhoudsmap van openOMSI', laststn === join(inst.inhoudsmap, 'maps', 'TH_Wald', 'laststn.osn'))
  klopt('een kaart zonder laststn: niets', laststnVoorOpenOmsi(o2, inst.inhoudsmap, 'Grundorf') === undefined)
  const voort = bouwSituatieDuty(laststn!, 'TH_Wald', { profiel: 'OMSI-Fan' })
  klopt(
    'voortzetten wordt --situation met bestuurder, verkeer en reizigers (duty_args #136)',
    JSON.stringify(dutyArgs(voort, { root: 'R' })) ===
      JSON.stringify(['--root', 'R', '--no-menu', '--situation', laststn, '--driver', 'Drivers/OMSI-Fan.odr', '--traffic', '30', '--passengers'])
  )
  const s5 = await startOpenOmsi(inst, voort, { thuis, logMap, omsiPad: o2 })
  const laatste = JSON.parse(readFileSync(verslag, 'utf8').trim().split('\n').at(-1)!) as { arg: string }
  const gestuurdVoort = JSON.parse(laatste.arg) as OpenOmsiDuty
  klopt('voortzetten via de launcher: situation, map, en de verplichte velden', s5.uitkomst === 'gestart' && gestuurdVoort.situation === laststn && gestuurdVoort.map === 'maps/TH_Wald/global.cfg' && gestuurdVoort.time === '' && gestuurdVoort.bus === '')
  if (s5.pid) {
    gezien.push(s5.pid)
    await stopOpenOmsi({ motor: 'openomsi', pid: s5.pid, uitTemp: false, bron: 'instance' }, { launcher: inst.launcher })
  }
  klopt('keyboard.cfg: zonder eigen bestand volgt openOMSI dat van OMSI 2', keyboardCfgVoorOpenOmsi(o2, inst.inhoudsmap) === join(o2, 'Inputs', 'keyboard.cfg'))
  schrijf(inst.inhoudsmap, 'Inputs/keyboard.cfg', '[vehicles]\r\n')
  klopt('keyboard.cfg: met een eigen bestand in de inhoudsmap dat', keyboardCfgVoorOpenOmsi(o2, inst.inhoudsmap) === join(inst.inhoudsmap, 'Inputs', 'keyboard.cfg'))
  rmSync(join(inst.inhoudsmap, 'Inputs'), { recursive: true, force: true })
  rmSync(join(inst.inhoudsmap, 'maps', 'TH_Wald'), { recursive: true, force: true })

  /* ------------------------------------------------------------ 8. hash-momentopname */
  const naDienst = momentopname(o2)
  const dienstVerschil = verschil(voorAlles, naDienst)
  klopt(`dienst in openOMSI: in OMSI 2 veranderde ${dienstVerschil.length ? dienstVerschil.join(', ') : 'niets'}`, dienstVerschil.every(mag))

  const spoor: string[] = []
  const basis: VrijStartDeps = {
    isRunning: async () => false,
    check: async () => ({
      ok: true,
      plek: {
        nr: 0,
        naam: 'Ilmenau Bf',
        bron: 'vertrekken',
        aantal: 3,
        klok: 540,
        spawn: { tx: 0, ty: 0, x: 10, z: 20, height: 0, heading: 90, quaternion: [0, 0.7071, 0, 0.7071] },
        wereld: { x: 10, y: 20 }
      },
      moment: { iso: '1989-05-30', year: 1989, dayOfYear: 150, minutes: 540, bron: 'klok' }
    }),
    inzetpunt: () => undefined,
    writeSituation: (verzoek) => {
      spoor.push('situatie')
      return writeSituation(o2, verzoek)
    },
    presetStartup: (kaart, file) => {
      spoor.push('startscherm')
      return presetStartup(o2, kaart, file)
    },
    schrijfStraks: async () => {
      spoor.push('knoppen')
    },
    launchOmsi: async () => {
      spoor.push('Omsi.exe')
      return 'gestart'
    },
    log: () => undefined
  }
  let vrijPid: number | undefined
  const deps = vrijeRitDepsVoorOpenOmsi(basis, async (situatie) => {
    spoor.push('openOMSI')
    const u = await startOpenOmsi(inst, bouwSituatieDuty(situatie, 'TH_Wald', { profiel: 'OMSI-Fan' }), { thuis, logMap, omsiPad: o2 })
    vrijPid = u.pid
    return u
  })
  const vrij = await startVrijeRit(deps, {
    mapFolder: 'TH_Wald',
    vehicle: { relativePath: 'Vehicles\\MAN_NewLionsCity\\MAN_12C_2door_ZF.bus', lineNumber: '', terminus: '' },
    naam: 'OMSI Enhancer — Vrij rijden'
  })
  klopt(`vrije rit in openOMSI: ${spoor.join(' > ')} (${vrij.start})`, vrij.launched && JSON.stringify(spoor) === JSON.stringify(['situatie', 'openOMSI']))
  const gestuurdVrij = JSON.parse((JSON.parse(readFileSync(verslag, 'utf8').trim().split('\n').at(-1)!) as { arg: string }).arg) as OpenOmsiDuty
  klopt('met ons eigen situatiebestand, als absoluut pad', gestuurdVrij.situation === join(o2, 'Situations', 'OMSI Enhancer.osn'))
  const naVrij = momentopname(o2)
  const vrijVerschil = verschil(voorAlles, naVrij)
  klopt(`vrije rit in openOMSI: in OMSI 2 veranderde ${vrijVerschil.join(', ') || 'niets'}`, vrijVerschil.length > 0 && vrijVerschil.every(mag))
  klopt('laststn.osn en options.cfg van OMSI 2 onaangeroerd', naVrij.get('maps/TH_Wald/laststn.osn') === voorAlles.get('maps/TH_Wald/laststn.osn') && naVrij.get('options.cfg') === voorAlles.get('options.cfg'))
  if (vrijPid) {
    gezien.push(vrijPid)
    await stopOpenOmsi({ motor: 'openomsi', pid: vrijPid, uitTemp: false, bron: 'instance' }, { launcher: inst.launcher })
  }

  await wacht(500)
  klopt('alle nep-spellen weer weg', gezien.every((p) => !leeft(p)))
  writeFileSync(join(werk, 'klaar.txt'), new Date().toISOString())
}

main()
  .then(() => einde())
  .catch((fout) => {
    console.error(fout)
    process.exit(1)
  })
