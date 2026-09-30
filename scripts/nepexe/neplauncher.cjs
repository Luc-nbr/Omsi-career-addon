/**
 * NEPLAUNCHER: een nagebootste `openomsi-launcher.exe` (achter nepexe, zie
 * nepexe.c), voor de proeven van de spelmotor. Er start nooit een echt
 * openOMSI: het "spel" is nepspel.cjs achter een nepexe.
 *
 * Gedraagt zich als de CLI van de launcher (OO/crates/omsi-launcher-core/src/main.rs
 * en lib.rs `cli`): het antwoord als JSON op stdout, een fout als
 * `error: …` op stderr met afsluitcode 1.
 *   --cli launch <Duty>    de Duty lezen zoals serde (map, bus, time verplicht;
 *                          traffic een geheel getal), het spel ernaast starten
 *                          met zijn uitvoer in game.log, een instance schrijven,
 *                          en `{pid, log, command, others}` teruggeven
 *   --cli stop {"pid":N}   alleen een spel dat deze launcher kent: netjes laten
 *                          eindigen (sessiebestand) en `{stopped, ended_by_itself}`
 *   --cli instances        de instances
 *
 * Omgeving:
 *   NEPLAUNCHER_THUIS    ~/.openomsi van de proef (instances, sessions, game.log)
 *   NEPLAUNCHER_VERSLAG  bestand: elke opdracht als JSON-regel, zoals de app hem stuurde
 *   NEPLAUNCHER_FOUT     `--cli launch` faalt met "error: <tekst>"
 *   NEPLAUNCHER_SPEL     de exe van het nep-spel (standaard openomsi.exe ernaast)
 */
const { appendFileSync, closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { spawn } = require('node:child_process')

const [, , vlag, opdracht, arg = '{}'] = process.argv
const thuis = process.env.NEPLAUNCHER_THUIS || join(dirname(__filename), 'thuis')
const instances = join(thuis, 'instances')
mkdirSync(instances, { recursive: true })

if (process.env.NEPLAUNCHER_VERSLAG) {
  appendFileSync(process.env.NEPLAUNCHER_VERSLAG, `${JSON.stringify({ opdracht, arg })}\n`)
}

function fout(tekst) {
  process.stderr.write(`error: ${tekst}\n`)
  process.exit(1)
}

function alleInstances() {
  return readdirSync(instances)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ naam: n, inst: JSON.parse(readFileSync(join(instances, n), 'utf8')) }))
}

function leeft(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

if (vlag !== '--cli') fout('alleen --cli')

if (opdracht === 'launch') {
  if (process.env.NEPLAUNCHER_FOUT) fout(process.env.NEPLAUNCHER_FOUT)
  let d
  try {
    d = JSON.parse(arg)
  } catch {
    d = {}
  }
  for (const veld of ['map', 'bus', 'time']) if (typeof d[veld] !== 'string') fout(`missing field \`${veld}\``)
  // serde: een u32 is geen 30.0 (het formaat van launcher-duty.json is dat van de pagina).
  if (/"traffic"\s*:\s*-?\d+\.\d/.test(arg)) fout('invalid type: floating point `30.0`, expected u32')
  const root = 'C:/nep/OMSI 2'
  const args = d.situation
    ? ['--root', root, '--no-menu', '--situation', d.situation, '--traffic', String(d.traffic ?? 30)]
    : ['--root', root, '--no-menu', '--map', d.map, '--bus', d.bus, '--time', d.time || '09:00']
  if (!d.situation && d.line) args.push('--line', d.line)
  if (!d.situation && d.tour) args.push('--tour', d.tour)
  const spel = process.env.NEPLAUNCHER_SPEL || join(dirname(__filename), 'openomsi.exe')
  const log = join(thuis, 'game.log')
  const fd = openSync(log, 'w')
  const id = `${Math.floor(Date.now() / 1000)}-${process.pid}-0`
  const gestart = Date.now()
  const kind = spawn(spel, args, { detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, OMSI_INSTANCE: id } })
  closeSync(fd)
  kind.unref()
  const pid = kind.pid
  writeFileSync(
    join(instances, `${id}.json`),
    JSON.stringify(
      {
        id,
        pid,
        process_started: (gestart + 11644473600000) * 10000,
        slot: 1,
        log,
        started: Math.floor(gestart / 1000),
        map: d.map,
        bus: d.bus,
        entry: d.entry ?? null,
        line: d.line ?? null,
        tour: d.tour ?? null,
        profile: 'OMSI-Fan',
        lan: 'off',
        args,
        running: true,
        ended: null,
        exit_code: null,
        stopping: null,
        killed: false,
        lan_status: null,
        last_line: ''
      },
      null,
      2
    )
  )
  const command = `${spel} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
  process.stdout.write(`${JSON.stringify({ pid, log, command, others: 0 }, null, 2)}\n`)
  process.exit(0)
}

if (opdracht === 'stop') {
  let pid = 0
  try {
    pid = Number(JSON.parse(arg).pid) || 0
  } catch {
    pid = 0
  }
  const hit = alleInstances().find((x) => x.inst.pid === pid && x.inst.running && leeft(pid))
  if (!hit) fout(`no running game with process id ${pid} was started by the launcher`)
  // Een net einde: het spel schrijft zijn sessie (zoals na taskkill zonder /F).
  const sessies = join(thuis, 'sessions')
  mkdirSync(sessies, { recursive: true })
  const t = Math.floor(Date.now() / 1000)
  writeFileSync(
    join(sessies, `${t}-${pid}.json`),
    JSON.stringify({ time: t, map: hit.inst.map, bus: hit.inst.bus, line: hit.inst.line, tour: hit.inst.tour, seconds: 120, metres: 2500, stops: 3, early: 0, late: 1, tickets: 2, cash: 3.4, crashes: 1, hurt: 0, jolts: 4, boarded: 2, served: 2 }, null, 2)
  )
  process.kill(pid)
  const t0 = Date.now()
  while (leeft(pid) && Date.now() - t0 < 5000) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  hit.inst.running = false
  hit.inst.ended = t
  writeFileSync(join(instances, hit.naam), JSON.stringify(hit.inst, null, 2))
  process.stdout.write(`${JSON.stringify({ stopped: true, ended_by_itself: true }, null, 2)}\n`)
  process.exit(0)
}

if (opdracht === 'instances') {
  process.stdout.write(`${JSON.stringify(alleInstances().map((x) => x.inst), null, 2)}\n`)
  process.exit(0)
}

fout(`unknown command ${opdracht}`)
