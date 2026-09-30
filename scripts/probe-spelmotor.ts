/**
 * De spelmotor: herkent de app welk spel draait, en alleen de spellen?
 *
 *   npx tsx scripts/probe-spelmotor.ts        (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * Ontwerp openomsi-koppeling §9.2, met nep-processen: kopieën van node.exe die
 * `openomsi.exe` (en `Omsi.exe`) heten, met als opdrachtregel die van het
 * geval. Er start nooit een echt OMSI of openOMSI, en er wordt niets
 * afgesloten dan de eigen nep-processen. Wat Luc zelf open heeft (zijn echte
 * openOMSI of OMSI) komt wel in de lijst van `tasklist`, maar telt in deze
 * proef niet mee: alles wordt beoordeeld op de eigen pids.
 *
 *  1. Losse stukken: de opdrachtregel splitsen (de regels uit Lucs
 *     launcher.log), het filter spel/launcher, tasklist lezen, FILETIME.
 *  2. Eén herkenning met alle gevallen tegelijk:
 *     geen opties, --launcher, --export-glb, --offscreen, --server -> launcher;
 *     --no-menu --map, --menu -> spel; vanuit %TEMP% -> spel met waarschuwing;
 *     een spel dat de launcher kent (instance) -> spel, zonder CIM-vraag;
 *     een nep-Omsi.exe -> OMSI.
 *  3. Nog twee keer kijken: per pid hooguit één CIM-vraag, en geen voor het
 *     spel uit de instance.
 *  4. De herstart: het spel start een kind met --situation …quicksave.osn en
 *     stopt; de keten loopt door (`herstart`, dan `loopt`), en pas als ook het
 *     kind weg is en de zoektijd voorbij, is het `einde`.
 *  5. Geen tweede spel: met een nep-openOMSI-spel weigert de keuze OMSI 2 te
 *     starten (`anderSpel`), en andersom; `automatisch` neemt wat draait.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  filetimeNaarIso,
  Herkenner,
  isSpelOpdracht,
  kiesMotor,
  leesTasklist,
  splitsOpdrachtregel,
  welkeDraait,
  type Herkenning
} from '../src/core/spelmotor'
import { KetenWacht } from '../src/core/motoren/openomsi'
import { einde, klopt, proefMap } from './proefhulp'
import { leeft, NEPSPEL, nodeKopie, wacht } from './nepexe/hulp'

const FIX = join(__dirname, 'fixtures', 'openomsi')

async function main(): Promise<void> {
  /* ------------------------------------------------------------ 1. losse stukken */
  const gestart = readFileSync(join(FIX, 'launcher-gestart.log'), 'utf8')
    .split(/\r?\n/)
    .filter((r) => /^\d+\t/.test(r) && r.includes('launched pid'))
  const r568 = gestart.find((r) => r.startsWith('568\t'))!
  const args568 = splitsOpdrachtregel(r568.slice(r568.indexOf(' --root ')))
  klopt(
    'launcher.log:568 gesplitst: --root is één stuk met spaties en een backslash',
    args568[0] === '--root' && args568[1] === 'C:/Program Files (x86)/Steam\\steamapps/common/OMSI 2'
  )
  klopt(
    'launcher.log:568: --hof "Thueringer Wald 2005" en --tour "302 - 725302" blijven heel',
    args568.includes('Thueringer Wald 2005') && args568.includes('302 - 725302')
  )
  klopt('launcher.log:568 is een spel', isSpelOpdracht(args568))
  klopt('alle tien de launcher-regels zijn spellen', gestart.every((r) => isSpelOpdracht(splitsOpdrachtregel(r.slice(r.indexOf(' --root '))))))
  const filter: Array<[string, boolean]> = [
    ['', false],
    ['--launcher', false],
    ['--no-menu --map maps/x/global.cfg', true],
    ['--menu', true],
    ['--situation C:/x/quicksave.osn --no-menu', true],
    ['--tutorial 2', true],
    ['--map=maps/x/global.cfg', true],
    ['--export-glb x.glb --bus y.bus', false],
    ['--offscreen x.png --map maps/x/global.cfg', false],
    ['--server server.cfg --map maps/x/global.cfg', false],
    ['--launcher --no-menu', false]
  ]
  for (const [regel, spel] of filter) {
    klopt(`filter: "${regel || '(geen opties)'}" -> ${spel ? 'spel' : 'geen spel'}`, isSpelOpdracht(splitsOpdrachtregel(regel)) === spel)
  }
  klopt(
    'splitsen: \\" en een lege "" zoals CommandLineToArgvW',
    JSON.stringify(splitsOpdrachtregel('a "b c" "d\\"e" "" f\\\\g')) === JSON.stringify(['a', 'b c', 'd"e', '', 'f\\\\g'])
  )
  const tl = leesTasklist('"System Idle Process","0","Services","0","8 K"\r\n"openomsi.exe","25340","Console","1","812.345 K"\r\n')
  klopt('tasklist /FO CSV /NH gelezen', tl.length === 2 && tl[1].naam === 'openomsi.exe' && tl[1].pid === 25340)
  const inst = JSON.parse(readFileSync(join(FIX, 'instances', '1790788971-25340-4.json'), 'utf8')) as { process_started: number; started: number }
  const iso = filetimeNaarIso(inst.process_started)!
  klopt(`FILETIME van de instance -> ${iso} (binnen 2 s van "started")`, Math.abs(Date.parse(iso) / 1000 - inst.started) < 2)

  /* ------------------------------------------------------------ 2. de nep-processen */
  const werk = proefMap('spelmotor')
  const nep = join(werk, 'nep')
  const temp = join(werk, 'Temp', 'Rar$EXa1.rartemp')
  const thuis = join(werk, 'thuis')
  mkdirSync(join(thuis, 'instances'), { recursive: true })
  const oo = nodeKopie(join(nep, 'openomsi.exe'))
  const ooTemp = nodeKopie(join(temp, 'openomsi.exe'))
  const omsiNep = nodeKopie(join(nep, 'Omsi.exe'))
  const kinderen: ChildProcess[] = []
  const start = (exe: string, regel: string[], env: Record<string, string> = {}): number => {
    const k = spawn(exe, [NEPSPEL, ...regel], { stdio: 'ignore', windowsHide: true, env: { ...process.env, ...env } })
    kinderen.push(k)
    return k.pid!
  }
  const pid = {
    kaal: start(oo, []),
    launcher: start(oo, ['--launcher']),
    spel: start(oo, ['--root', 'C:/nep/OMSI 2', '--no-menu', '--map', 'maps/TH_Wald/global.cfg'], { NEPSPEL_HERSTART: '9000' }),
    menu: start(oo, ['--menu']),
    glb: start(oo, ['--export-glb', 'x.glb', '--bus', 'Vehicles/x.bus']),
    offscreen: start(oo, ['--offscreen', 'x.png', '--map', 'maps/x/global.cfg']),
    server: start(oo, ['--server', 'server.cfg']),
    temp: start(ooTemp, ['--no-menu', '--map', 'maps/y/global.cfg']),
    instance: start(oo, ['--no-menu', '--map', 'maps/Grundorf/global.cfg']),
    omsi: start(omsiNep, [])
  }
  // Het spel dat "de launcher" startte: een instance zoals instances.rs hem schrijft.
  const nu = Date.now()
  writeFileSync(
    join(thuis, 'instances', `${Math.floor(nu / 1000)}-99-0.json`),
    JSON.stringify({
      id: `${Math.floor(nu / 1000)}-99-0`,
      pid: pid.instance,
      process_started: (nu + 11644473600000) * 10000,
      slot: 1,
      log: join(thuis, 'game.log'),
      started: Math.floor(nu / 1000),
      map: 'maps/Grundorf/global.cfg',
      bus: 'Vehicles/MAN_SD200/SD200.bus',
      entry: -1,
      line: '76',
      tour: '1',
      profile: 'OMSI-Fan',
      lan: 'off',
      args: ['--root', 'C:/nep/OMSI 2', '--no-menu', '--map', 'maps/Grundorf/global.cfg'],
      running: true,
      ended: null
    })
  )
  // En een oude instance van een spel dat allang weg is: telt niet.
  writeFileSync(join(thuis, 'instances', 'oud.json'), JSON.stringify({ id: 'oud', pid: 4, running: false, ended: 1790000000 }))
  await wacht(1500)

  const eigen = new Set(Object.values(pid))
  const herkenner = new Herkenner({
    namen: { omsi: 'Omsi.exe', openomsi: 'openomsi.exe', launcher: 'openomsi-launcher.exe' },
    thuis,
    tempMappen: [join(werk, 'Temp')]
  })
  const t0 = Date.now()
  const h = await herkenner.kijk()
  console.log(`   herkenning in ${Date.now() - t0} ms, ${herkenner.cimRondes} CIM-ronde(s)`)
  const vreemd = [...h.omsi, ...h.openomsi, ...h.launchers].filter((p) => !eigen.has(p.pid))
  if (vreemd.length > 0) console.log(`   (niet van de proef, niet meegeteld: ${vreemd.map((p) => `${p.motor} ${p.pid}`).join(', ')})`)
  const spellen = new Set(h.openomsi.filter((p) => eigen.has(p.pid)).map((p) => p.pid))
  const launchers = new Set(h.launchers.filter((p) => eigen.has(p.pid)).map((p) => p.pid))
  const verwacht: Array<[keyof typeof pid, 'spel' | 'launcher']> = [
    ['kaal', 'launcher'],
    ['launcher', 'launcher'],
    ['spel', 'spel'],
    ['menu', 'spel'],
    ['glb', 'launcher'],
    ['offscreen', 'launcher'],
    ['server', 'launcher'],
    ['temp', 'spel'],
    ['instance', 'spel']
  ]
  for (const [naam, soort] of verwacht) {
    const is = spellen.has(pid[naam]) ? 'spel' : launchers.has(pid[naam]) ? 'launcher' : 'niets'
    klopt(`${naam} (pid ${pid[naam]}) -> ${soort}`, is === soort)
  }
  klopt('nep-Omsi.exe -> OMSI', h.omsi.some((p) => p.pid === pid.omsi))
  const tempSpel = h.openomsi.find((p) => p.pid === pid.temp)
  klopt('het spel uit %TEMP% draagt de waarschuwing (uitTemp)', tempSpel?.uitTemp === true)
  klopt('de andere spellen niet', h.openomsi.filter((p) => eigen.has(p.pid) && p.pid !== pid.temp).every((p) => !p.uitTemp))
  const viaInstance = h.openomsi.find((p) => p.pid === pid.instance)
  klopt(
    'het spel van de launcher komt uit de instance, met kaart, lijn en omloop',
    viaInstance?.bron === 'instance' && viaInstance.dienst?.map === 'maps/Grundorf/global.cfg' && viaInstance.dienst.line === '76'
  )
  const viaCim = h.openomsi.find((p) => p.pid === pid.spel)
  klopt('een ander spel via CIM, met starttijd en ouder', viaCim?.bron === 'cim' && Boolean(viaCim.gestart) && viaCim.ouder === process.pid)
  klopt('de oude instance (running:false) telt niet', !h.openomsi.some((p) => p.pid === 4))

  /* ------------------------------------------------------------ 3. hooguit één CIM-vraag per pid */
  await herkenner.kijk()
  await herkenner.kijk()
  const vragen = [...eigen].map((p) => herkenner.cimVragen.get(p) ?? 0)
  klopt(`na drie keer kijken: per pid hooguit één CIM-vraag (${vragen.join(',')})`, vragen.every((n) => n <= 1))
  klopt('het spel uit de instance kostte geen CIM-vraag', (herkenner.cimVragen.get(pid.instance) ?? 0) === 0)
  klopt('Omsi.exe kostte geen CIM-vraag', (herkenner.cimVragen.get(pid.omsi) ?? 0) === 0)

  /* ------------------------------------------------------------ 5. geen tweede spel */
  const alleenEigen = (x: Herkenning): Herkenning => ({
    ...x,
    omsi: x.omsi.filter((p) => eigen.has(p.pid)),
    openomsi: x.openomsi.filter((p) => eigen.has(p.pid)),
    launchers: x.launchers.filter((p) => eigen.has(p.pid))
  })
  const metBeide = alleenEigen(h)
  const zonderOmsi: Herkenning = { ...metBeide, omsi: [] }
  const zonderOpen: Herkenning = { ...metBeide, openomsi: [] }
  const k1 = kiesMotor('omsi', welkeDraait(zonderOmsi), { openomsi: true })
  klopt('nep-openOMSI draait, keuze OMSI 2 -> geweigerd (anderSpel openomsi)', k1.motor === 'omsi' && k1.anderSpel === 'openomsi')
  const k2 = kiesMotor('openomsi', welkeDraait(zonderOpen), { openomsi: true })
  klopt('nep-OMSI draait, keuze openOMSI -> geweigerd (anderSpel omsi)', k2.motor === 'openomsi' && k2.anderSpel === 'omsi')
  const k3 = kiesMotor('automatisch', welkeDraait(zonderOmsi), { openomsi: true }, 'omsi')
  klopt('automatisch met openOMSI open -> openOMSI, niets geweigerd', k3.motor === 'openomsi' && !k3.anderSpel)
  const k4 = kiesMotor('automatisch', undefined, { openomsi: true }, 'openomsi')
  klopt('automatisch zonder spel -> de laatst gebruikte', k4.motor === 'openomsi' && !k4.anderSpel)
  const k5 = kiesMotor('openomsi', undefined, { openomsi: false })
  klopt('openOMSI gekozen maar niet gevonden -> OMSI 2', k5.motor === 'omsi')
  const k6 = kiesMotor(undefined, undefined, { openomsi: true })
  klopt('nooit gekozen en niets draait -> OMSI 2 (zoals altijd)', k6.motor === 'omsi' && !k6.anderSpel)

  /* ------------------------------------------------------------ 4. de herstart als keten */
  const keten = new KetenWacht([{ pid: pid.spel, gestart: viaCim?.gestart }], { zoekMs: 4000 })
  const standen: string[] = []
  let kind: number | undefined
  const tot = Date.now() + 25000
  while (Date.now() < tot) {
    const stand = keten.stap(await herkenner.kijk())
    if (standen.at(-1) !== stand) standen.push(stand)
    kind = keten.keten[1]?.pid
    if (kind && !leeft(pid.spel)) break
    await wacht(700)
  }
  klopt(`het spel startte zichzelf opnieuw (kind ${kind ?? '-'}) en stopte`, Boolean(kind) && !leeft(pid.spel))
  const hk = await herkenner.kijk()
  const kindProces = hk.openomsi.find((p) => p.pid === kind)
  klopt(
    'het kind is een spel met --situation …quicksave.osn en het spel als ouder',
    Boolean(kindProces?.args?.some((a) => a.endsWith('quicksave.osn'))) && kindProces?.ouder === pid.spel
  )
  klopt(`de keten liep door: ${standen.join(' > ')}`, standen.includes('herstart') && !standen.includes('einde'))
  klopt('de dienst loopt nog (het kind leeft)', keten.stap(hk) === 'loopt')
  if (kind) process.kill(kind)
  await wacht(500)
  const na: string[] = []
  const tot2 = Date.now() + 15000
  while (Date.now() < tot2) {
    const stand = keten.stap(await herkenner.kijk())
    if (na.at(-1) !== stand) na.push(stand)
    if (stand === 'einde') break
    await wacht(700)
  }
  klopt(`zonder kind: eerst zoeken, dan einde (${na.join(' > ')})`, na[0] === 'zoekt' && na.at(-1) === 'einde')
  klopt('het einde is het moment dat het laatste lid wegging', keten.einde !== undefined && keten.weg === keten.einde)
  klopt(`CIM per pid, ook voor het kind: hooguit één (${kind ? (herkenner.cimVragen.get(kind) ?? 0) : '-'})`, !kind || (herkenner.cimVragen.get(kind) ?? 0) <= 1)

  for (const k of kinderen) {
    try {
      k.kill()
    } catch {
      // al weg
    }
  }
  await wacht(300)
  klopt('alle nep-processen weer weg', Object.values(pid).every((p) => !leeft(p)))
}

main()
  .then(() => einde())
  .catch((fout) => {
    console.error(fout)
    process.exit(1)
  })
