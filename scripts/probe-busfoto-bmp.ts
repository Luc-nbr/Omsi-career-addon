/**
 * De BMP-fix van de busfoto (v3b): hoeveel kleurstellingen krijgen nog een
 * grijze textuur?
 *
 *   npx tsx scripts/probe-busfoto-bmp.ts ["<pad naar OMSI 2>"]
 *
 * Loopt alle kleurstellingen van alle modellen langs en zet per textuur de weg
 * die de foto ermee gaat, twee keer:
 *
 * - OUD, zoals tot 28-09-2026: `.dds`/`.tga` naar de werker (grijs als het geen
 *   DDS of TGA is), `.png`/`.jpg` naar `nativeImage`, en `.bmp` naar
 *   `nativeImage` -- dat geen BMP leest, dus grijs.
 * - NIEUW: `pakPlaatUit` uit core/busbeeld.ts (de echte functie, op de inhoud),
 *   en wat die laat liggen zoals `viaHoofdproces` in main/busfoto.ts het neemt:
 *   PNG/JPEG naar `nativeImage`, een BMP die `pakBmpUit` niet kent als
 *   gegevens-URL naar Chromium, de rest grijs.
 *
 * Alleen lezen; in de spelmap wordt niets geschreven.
 */
import { closeSync, openSync, readSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pakPlaatUit } from '../src/core/busbeeld'
import { modelVanBus } from '../src/core/busmodel'
import { findOmsiInstall } from '../src/core/install'
import { kleurstellingenVanBus } from '../src/core/kleurstelling'
import { listVehicles } from '../src/core/vehicles'

const omsi = findOmsiInstall(process.argv[2])
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(1)
}

/** De eerste bytes: wat het bestand werkelijk is. */
function inhoud(pad: string): 'dds' | 'bmp' | 'png' | 'jpg' | 'anders' | 'weg' {
  try {
    const fd = openSync(pad, 'r')
    const b = Buffer.alloc(4)
    readSync(fd, b, 0, 4, 0)
    closeSync(fd)
    if (b.toString('latin1') === 'DDS ') return 'dds'
    if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
    if (b[0] === 0x89 && b[1] === 0x50) return 'png'
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
    return 'anders'
  } catch {
    return 'weg'
  }
}

/** De oude weg: alleen op de extensie. 'anders' telt als TGA (de werker probeert het). */
function oudGrijs(pad: string): boolean {
  const ext = extname(pad).toLowerCase()
  const soort = inhoud(pad)
  if (ext === '.dds' || ext === '.tga') return !(soort === 'dds' || soort === 'anders')
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return !(soort === 'png' || soort === 'jpg')
  return true
}

const nieuwUitkomst = new Map<string, string>()
/** De nieuwe weg: werker, electron, chromium, of grijs. */
function nieuweWeg(pad: string): 'werker' | 'electron' | 'chromium' | 'grijs' {
  const bekend = nieuwUitkomst.get(pad)
  if (bekend) return bekend as 'werker'
  let weg: 'werker' | 'electron' | 'chromium' | 'grijs'
  if (pakPlaatUit(pad)) weg = 'werker'
  else {
    const soort = inhoud(pad)
    weg = soort === 'png' || soort === 'jpg' ? 'electron' : soort === 'bmp' ? 'chromium' : 'grijs'
  }
  nieuwUitkomst.set(pad, weg)
  return weg
}

const gezien = new Set<string>()
let modellen = 0
let lakken = 0
let oudLakGrijs = 0
let nieuwLakGrijs = 0
const perWeg: Record<string, number> = {}
const grijzeBestanden = new Map<string, string>()
const begin = Date.now()
for (const v of listVehicles(omsi)) {
  const pad = join(omsi, v.relativePath)
  const cfg = modelVanBus(pad)
  if (!cfg || gezien.has(cfg.toLowerCase())) continue
  gezien.add(cfg.toLowerCase())
  const info = kleurstellingenVanBus(pad)
  if (!info) continue
  modellen++
  for (const k of info.lijst) {
    lakken++
    let oud = false
    let nieuw = false
    for (const bestand of Object.values(k.texturen)) {
      if (oudGrijs(bestand)) oud = true
      const weg = nieuweWeg(bestand)
      perWeg[weg] = (perWeg[weg] ?? 0) + 1
      if (weg === 'grijs') {
        nieuw = true
        grijzeBestanden.set(bestand, inhoud(bestand))
      }
    }
    if (oud) oudLakGrijs++
    if (nieuw) nieuwLakGrijs++
  }
}
console.log(`modellen met kleurstellingen: ${modellen}, kleurstellingen: ${lakken} (${Date.now() - begin} ms)`)
console.log(`met minstens één grijze textuur: oud ${oudLakGrijs}, nieuw ${nieuwLakGrijs}`)
console.log(`verwijzingen per weg (nieuw): ${JSON.stringify(perWeg)}`)
if (grijzeBestanden.size > 0) {
  console.log(`\nnog grijs (${grijzeBestanden.size} bestanden):`)
  for (const [bestand, soort] of [...grijzeBestanden].slice(0, 20)) console.log(`  ${soort.padEnd(7)} ${bestand}`)
}
