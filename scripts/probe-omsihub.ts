/**
 * De leesbron voor openOMSI (core/omsihub.ts), kort:
 *
 *   npx tsx scripts/probe-omsihub.ts
 *
 * 1. De echte data.save.lua van Lucs proefrit (30-09, fixture) wordt een
 *    LiveData en daarna een LiveStatus (describeLive), met de dienst, de halte,
 *    de vertraging en de plek.
 * 2. Een %q-string met escapes (\", \\, backslash plus nieuwe regel, \ddd,
 *    UTF-8) komt heel terug; een half bestand geeft niets.
 * 3. Een knop en de lijsten gaan naar opdracht.save.lua en lijsten.save.lua, in
 *    een tijdelijke map (nooit de echte OMSI-map), en main.lua wordt geplaatst.
 * 4. De omrekening van wereldmeters naar een tegel (gewone kaart).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeLive } from '../src/core/live'
import { jsonUitDataSave, leesLuaString, naarLiveData, omsihubKnop, plaatsOmsihub, zetOmsihubLijst, type OmsihubJson } from '../src/core/omsihub'
import { wereldNaarTegel } from '../src/core/geo'

let fouten = 0
function klopt(wat: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'goed' : 'FOUT'}  ${wat}${extra ? `  (${extra})` : ''}`)
  if (!ok) fouten++
}

// 1. De echte data.save.lua
const echt = readFileSync(join(__dirname, 'fixtures', 'openomsi', 'proefrit-30-09', 'data.save.lua'))
const tekst = jsonUitDataSave(echt)
klopt('json uit data.save.lua', typeof tekst === 'string' && tekst.startsWith('{'))
const j = JSON.parse(tekst ?? '{}') as OmsihubJson
const live = naarLiveData(j, 120)
klopt('alive met bus', live.alive === true)
klopt('klok uit sys.Time', Math.abs(live.time - 32471.12305) < 0.01, String(live.time))
klopt('datum 30-05-1989', live.day === 30 && live.month === 5 && live.year === 1989)
klopt('tank', Math.abs(live.tankPercent - 0.7439505458) < 1e-6)
klopt('seen: Velocity en GivenTicket, geen accu', (live.seen & 1) === 1 && ((live.seen >>> 9) & 1) === 1 && ((live.seen >>> 23) & 1) === 0)
klopt('temperatuur 15', live.temperature === 15)
klopt('mem: halte en vertraging', live.mem?.nextStop === 'Hohenkirchen, Bahnhof B4b' && Math.round(live.mem?.delay ?? 0) === -49)
klopt('mem.ok 0 zonder kaart', live.mem?.ok === 0)
klopt('wereldplek', Math.abs((live.openomsi?.wereld?.x ?? 0) - 246.4406964) < 1e-6)
klopt('motor openomsi', live.motor === 'openomsi')
// Een dienst met die halte rond 09:02 (32520 s = 542 min)
const duty = {
  legs: [
    {
      departure: 530, arrival: 560, tripFile: 'TTData\\rit9.ttp', tourNumber: '07 - Solo',
      stops: ['Ernstroda, Ort', 'Hohenkirchen, Bahnhof B4b', 'Ernstroda, Ort'], stopTimes: [530, 542, 560]
    }
  ],
  totalStops: 3
} as unknown as Parameters<typeof describeLive>[1]
const status = describeLive({ ...live, mem: { ...live.mem!, ok: 1 } }, duty)
klopt('LiveStatus: rit uit de dienstregeling', status.fromTimetable === true && status.legIndex === 0, `leg ${status.legIndex}`)
klopt('LiveStatus: volgende halte', status.nextStop === 'Hohenkirchen, Bahnhof B4b')
klopt('LiveStatus: vertraging -49 s', status.deltaSeconds === -49, String(status.deltaSeconds))

// 2. %q
const q = Buffer.from('return {\n  json = "a\\"b\\\\c\\\nd\\9e\\195\\188ü",\n}\n', 'utf8')
klopt('%q-escapes', jsonUitDataSave(q) === 'a"b\\c\nd\teüü', JSON.stringify(jsonUitDataSave(q)))
klopt('half bestand', jsonUitDataSave('return {\n  json = "{\\"a\\":1') === undefined)
klopt('enkele aanhalingstekens', leesLuaString("'x\\'y'", 0)?.waarde === "x'y")

// 3. Schrijven, in een tijdelijke map
const map = mkdtempSync(join(tmpdir(), 'omsihub-proef-'))
try {
  const plaats = plaatsOmsihub(map, join(__dirname, '..', 'plugin', 'lua', 'omsihub', 'main.lua'))
  klopt('main.lua geplaatst', plaats.geplaatst && plaats.veranderd, plaats.fout ?? '')
  klopt('tweede keer niets', !plaatsOmsihub(map, join(__dirname, '..', 'plugin', 'lua', 'omsihub', 'main.lua')).veranderd)
  const seq = omsihubKnop(map, 'IBIS_7')
  const opdracht = readFileSync(join(map, 'plugins', 'omsihub', 'opdracht.save.lua'), 'utf8')
  klopt('opdracht.save.lua met IBIS_7', seq !== undefined && opdracht.includes(`s = ${seq}, n = "IBIS_7"`) && opdracht.includes('w = "druk"'))
  klopt('vreemde knopnaam geweigerd', omsihubKnop(map, 'IBIS 7"; os.exit()') === undefined)
  zetOmsihubLijst(map, 'vragen', ['IBIS_cabindisplay', 'a"b'])
  const lijsten = readFileSync(join(map, 'plugins', 'omsihub', 'lijsten.save.lua'), 'utf8')
  klopt('lijsten.save.lua', lijsten.includes('"IBIS_cabindisplay"') && lijsten.includes('"a\\"b"'))
} finally {
  rmSync(map, { recursive: true, force: true })
}

// 4. Wereld naar tegel
const t = wereldNaarTegel(246.44, -161.05, { wereld: false, rijen: [0, -1] })
klopt('tegel (0,-1), plek (246.44, 138.95)', t.tx === 0 && t.ty === -1 && Math.abs(t.ly - 138.95) < 1e-6)

console.log(fouten === 0 ? 'alles goed' : `${fouten} fout(en)`)
process.exit(fouten === 0 ? 0 : 1)
