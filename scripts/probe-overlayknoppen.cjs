/**
 * Welke overlays zijn er op deze machine, en valt eraan te draaien?
 *
 *   node scripts/probe-overlayknoppen.cjs
 *
 * LEEST ALLEEN. Er wordt niets geschreven, niets aangezet en niets uitgezet.
 *
 * `omsiProces.ts` ziet welke overlays in het draaiende OMSI hangen, en zegt
 * erbij dat de app ze niet kan uitzetten. Dat was de stand na één poging: de DLL
 * van Steam hernoemen houdt geen stand, want Steam zet hem bij elke start terug.
 * Maar dat is de verkeerde hendel. Elk van deze programma's heeft een eigen
 * schakelaar in zijn eigen instellingen, en die staan in gewone bestanden of in
 * het register.
 *
 * Deze probe zoekt die schakelaars op en zegt per overlay of hij te vinden is,
 * waar hij staat, en wat er nu staat. Pas als dat bekend is valt te bepalen wat
 * de app werkelijk kan aanbieden -- en wat niet, want dat hoort er net zo goed
 * bij.
 *
 * Privacy: van de instellingenbestanden wordt alleen naar de sleutels gekeken
 * die over overlays gaan. Er komt niets anders uit deze bestanden naar buiten.
 */
const { execFileSync } = require('node:child_process')
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const regel = (naam, stand, waar) =>
  console.log(`  ${naam.padEnd(22)} ${stand.padEnd(28)} ${waar ?? ''}`)

/** Een registerwaarde lezen, of niets als hij er niet is. */
function reg(sleutel, naam) {
  try {
    const uit = execFileSync('reg', ['query', sleutel, '/v', naam], {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    /*
     * De waarde loopt tot het eind van de regel en mag spaties bevatten --
     * "c:/program files (x86)/steam". Met \S+ viel die er precies uit.
     */
    const m = uit.match(/REG_\w+\s{2,}(.+?)\s*$/m)
    return m ? m[1] : undefined
  } catch {
    return undefined
  }
}

console.log('\n=== STEAM ===')
const steamPad = reg('HKCU\\Software\\Valve\\Steam', 'SteamPath')
if (!steamPad) {
  regel('Steam', 'niet gevonden')
} else {
  const steam = steamPad.replace(/\//g, '\\')
  regel('installatie', 'gevonden', steam)

  /*
   * De schakelaar voor de overlay staat per gebruiker in localconfig.vdf, en
   * daarnaast is er een algemene in de instellingen van Steam zelf.
   */
  const userdata = join(steam, 'userdata')
  if (existsSync(userdata)) {
    for (const id of readdirSync(userdata)) {
      const cfg = join(userdata, id, 'config', 'localconfig.vdf')
      if (!existsSync(cfg)) continue
      const tekst = readFileSync(cfg, 'latin1')
      // Alleen de sleutels die over de overlay gaan; de rest is privé.
      const treffers = [...tekst.matchAll(/^\s*"(\w*[Oo]verlay\w*)"\s+"([^"]*)"/gm)]
      const uniek = new Map()
      for (const t of treffers) if (!uniek.has(t[1])) uniek.set(t[1], t[2])
      regel(`gebruiker ${id}`, `${treffers.length} overlay-sleutels`, cfg)
      for (const [k, v] of uniek) console.log(`      ${k} = ${v}`)

      // En specifiek het blok van OMSI 2 (appid 252530).
      const app = tekst.match(/"252530"\s*\{([\s\S]{0,600}?)\n\t*\}/)
      if (app) {
        const sleutels = [...app[1].matchAll(/"(\w+)"\s+"([^"]*)"/g)].map((m) => m[1])
        console.log(`      blok 252530 bevat: ${sleutels.join(', ') || '(leeg)'}`)
      } else {
        console.log('      blok 252530: niet gevonden')
      }
    }
  }

  const alg = join(steam, 'config', 'config.vdf')
  if (existsSync(alg)) {
    const tekst = readFileSync(alg, 'latin1')
    const m = [...tekst.matchAll(/"(\w*[Oo]verlay\w*)"\s+"([^"]*)"/g)]
    regel('config.vdf', m.length ? `${m.length} overlay-sleutels` : 'geen overlay-sleutel', alg)
    for (const t of m) console.log(`      ${t[1]} = ${t[2]}`)
  }

  const dll = join(steam, 'GameOverlayRenderer.dll')
  regel('GameOverlayRenderer', existsSync(dll) ? 'aanwezig' : 'afwezig', dll)
}

console.log('\n=== DISCORD ===')
const disc = join(process.env.APPDATA ?? '', 'discord', 'settings.json')
if (!existsSync(disc)) {
  regel('settings.json', 'niet gevonden')
} else {
  try {
    const j = JSON.parse(readFileSync(disc, 'utf8'))
    const overlay = Object.keys(j).filter((k) => /overlay/i.test(k))
    regel('settings.json', `${overlay.length} overlay-sleutels`, disc)
    for (const k of overlay) console.log(`      ${k} = ${JSON.stringify(j[k])}`)
    if (overlay.length === 0) {
      console.log(`      (bestand heeft ${Object.keys(j).length} sleutels, geen met "overlay")`)
    }
  } catch (e) {
    regel('settings.json', 'niet te lezen', String(e.message))
  }
}

console.log('\n=== XBOX GAME BAR ===')
regel(
  'AppCaptureEnabled',
  reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled') ??
    '(niet gezet)',
  'HKCU\\...\\GameDVR'
)
regel(
  'GameDVR_Enabled',
  reg('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled') ?? '(niet gezet)',
  'HKCU\\System\\GameConfigStore'
)
regel(
  'ShowStartupPanel',
  reg('HKCU\\Software\\Microsoft\\GameBar', 'ShowStartupPanel') ?? '(niet gezet)',
  'HKCU\\Software\\Microsoft\\GameBar'
)

console.log('\n=== NVIDIA ===')
const nvPaden = [
  join(process.env.LOCALAPPDATA ?? '', 'NVIDIA Corporation', 'NVIDIA app'),
  join(process.env.LOCALAPPDATA ?? '', 'NVIDIA Corporation', 'NVIDIA GeForce Experience'),
  join(process.env.PROGRAMDATA ?? '', 'NVIDIA Corporation', 'NVIDIA app')
]
let nv = false
for (const p of nvPaden) {
  if (!existsSync(p)) continue
  nv = true
  regel('map', 'aanwezig', p)
}
if (!nv) regel('NVIDIA', 'geen instellingenmap gevonden')

console.log('\n=== WAT ER NU DRAAIT ===')
try {
  const uit = execFileSync(
    'tasklist',
    ['/FO', 'CSV', '/NH'],
    { encoding: 'latin1', maxBuffer: 8 * 1024 * 1024 }
  )
  const zoek = /steam\.exe|discord\.exe|nvcontainer|GameBar|RTSS|afterburner|obs64/i
  const draait = uit
    .split('\n')
    .map((r) => (r.match(/^"([^"]+)"/) || [])[1])
    .filter((n) => n && zoek.test(n))
  const uniek = [...new Set(draait)]
  console.log(uniek.length ? `  ${uniek.join(', ')}` : '  (geen van de bekende overlayprogramma\'s)')
} catch {
  console.log('  tasklist gaf niets')
}

console.log()
