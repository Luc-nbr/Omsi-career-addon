/**
 * NEPSPEL: een nagebootst openOMSI-spel, voor de proeven van de spelmotor.
 *
 * Er start nooit een echt openOMSI. Dit script draait achter een kopie van
 * node.exe die `openomsi.exe` heet (`openomsi.exe nepspel.cjs --no-menu --map x`:
 * de opdrachtregel die de app leest is dan die van een spel), of achter
 * nepexe (`<naam>.exe` met `<naam>.cjs` ernaast; zie nepexe.c) als de app het
 * zelf start met de opties van openOMSI.
 *
 * Gedrag, via de omgeving:
 *   NEPSPEL_DUUR      ms tot het spel netjes stopt (standaard 120000)
 *   NEPSPEL_HERSTART  ms tot "snel laden": een nieuw proces met
 *                     `--situation …quicksave.osn` (kind van dit proces), dan stoppen
 *   NEPSPEL_MERK      map: `<pid>.json` met de opdrachtregel, bij het starten
 *   NEPSPEL_SESSIES   map: bij een net einde `<t>-<pid>.json`, zoals openOMSI
 *                     (OO/crates/omsi-app/src/career.rs:342-370)
 *   NEPSPEL_ACHTER    1 als dit achter nepexe draait: dan is het spel het ouderproces
 */
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { spawn } = require('node:child_process')

const args = process.argv.slice(2)
const pid = process.env.NEPSPEL_ACHTER === '1' ? process.ppid : process.pid
const waarde = (naam) => {
  const i = args.indexOf(naam)
  return i >= 0 ? args[i + 1] : undefined
}

if (process.env.NEPSPEL_MERK) {
  mkdirSync(process.env.NEPSPEL_MERK, { recursive: true })
  writeFileSync(join(process.env.NEPSPEL_MERK, `${pid}.json`), JSON.stringify({ pid, args, cwd: process.cwd() }))
}

function sessieSchrijven() {
  const map = process.env.NEPSPEL_SESSIES
  if (!map) return
  mkdirSync(map, { recursive: true })
  const t = Math.floor(Date.now() / 1000)
  writeFileSync(
    join(map, `${t}-${pid}.json`),
    JSON.stringify(
      {
        boarded: 0,
        bus: waarde('--bus') ?? '',
        cash: 0,
        crashes: 0,
        early: 1,
        hurt: 0,
        jolts: 2,
        late: 0,
        line: waarde('--line') ?? null,
        map: waarde('--map') ?? '',
        metres: 1000,
        seconds: 60,
        served: 0,
        stops: 2,
        tickets: 0,
        time: t,
        tour: waarde('--tour') ?? null
      },
      null,
      2
    )
  )
}

const herstart = Number(process.env.NEPSPEL_HERSTART || 0)
if (herstart > 0) {
  setTimeout(() => {
    // Zoals load_quicksave: hetzelfde programma, een nieuw proces, op de quicksave.
    const quicksave = join(dirname(process.execPath), 'Situations', 'quicksave.osn')
    const kind = spawn(process.execPath, [__filename, '--root', waarde('--root') ?? '.', '--no-menu', '--situation', quicksave], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NEPSPEL_HERSTART: '' }
    })
    kind.unref()
    setTimeout(() => process.exit(0), 300)
  }, herstart)
}

setTimeout(() => {
  sessieSchrijven()
  process.exit(0)
}, Number(process.env.NEPSPEL_DUUR || 120000))
