/**
 * Onze meshlijst tegen die van OMSI zelf (bus3d-ontwerp §5.1, §13; F0).
 *
 *   npx tsx scripts/probe-meshlijst.ts [meshes.json ...]
 *
 * De plugin schrijft bij elke bus die OMSI laadt `meshes.json`: per mesh in
 * OMSI's geheugen de o3d-naam, in OMSI's volgorde. core/schermcfg.ts telt die
 * lijst zelf na uit de model.cfg (`meshlijstVan`), en het 3D-pakket hangt zijn
 * vermeldingen aan dezelfde nummers (`Bus3dVermelding.mesh`). Klopt de telling
 * niet, dan verschuift alles wat de plugin over zichtbaarheid zegt.
 *
 * Wat hier gebeurt:
 * 1. Elke meshes.json die we vinden (de plugin-map van deze pc, alleen lezen,
 *    plus wat op de opdrachtregel staat) naast onze lijst leggen: aantal en de
 *    eerste plek waar ze verschillen.
 * 2. Vaste ijkpunten zonder rit: de HH20 heeft in OMSI 608 meshes, met 13
 *    ingesprongen `[mesh]`-regels die niet meetellen (schermcfg.ts:28-33).
 * 3. `-<DISABLED>-`: welke meshes van de SL92 in zo'n blok staan, en wat er
 *    met de telling zou gebeuren als OMSI ze oversloeg. Beslissen kan pas met
 *    een meshes.json van een rit met de SL92; zonder die afdruk blijft
 *    DISABLED buiten schermcfg.ts (ontwerp §5.1: eerst meten).
 * 4. Het 3D-pakket: elke vermelding draagt het meshnummer uit dezelfde lijst.
 *
 * Alleen lezen: in de OMSI-map en in de map van de plugin wordt niets geschreven.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { cfgRegels, leesSchermcfg } from '../src/core/schermcfg'
import { meshlijstVan } from '../src/core/schermvorm'
import { findOmsiInstall } from '../src/core/install'
import { bouwBus3d } from '../src/core/bus3d'
import { omsiRegistratie } from '../src/core/omsiregistratie'

const omsi = findOmsiInstall()
if (!omsi) {
  console.error('Geen OMSI 2-installatie gevonden.')
  process.exit(1)
}
const OMSI: string = omsi
let fouten = 0
function toets(naam: string, goed: boolean, detail = ''): void {
  if (!goed) fouten++
  console.log(`${goed ? 'GOED' : 'FOUT'}  ${naam}${detail ? `: ${detail}` : ''}`)
}
const klein = (naam: string): string => basename(naam.replace(/\\/g, '/')).toLowerCase()

// ------------------------------------------------------------ 1. de afdrukken van de plugin
const afdrukken = [
  join(process.env.LOCALAPPDATA ?? '', 'OMSI Career', 'meshes.json'),
  ...process.argv.slice(2)
].filter((p) => p && existsSync(p))
console.log(`== meshes.json van de plugin: ${afdrukken.length} gevonden ==`)
const gezienModel = new Set<string>()
for (const pad of afdrukken) {
  let ruw: { model?: string; meshes?: unknown[] }
  try {
    ruw = JSON.parse(readFileSync(pad, 'utf8'))
  } catch (fout) {
    console.log(`  ${pad}: niet te lezen (${(fout as Error).message})`)
    continue
  }
  const model = String(ruw.model ?? '')
  const lijst = (ruw.meshes ?? []).map((m) => (Array.isArray(m) ? String(m[0]) : String(m)))
  const cfg = join(OMSI, ...model.split(/[\\/]+/))
  if (!model || !existsSync(cfg)) {
    console.log(`  ${pad}: model "${model}" staat niet in deze installatie (proefafdruk?)`)
    continue
  }
  /*
   * Een afdruk die ouder is dan de cfg zegt niets meer: dan is de bus daarna
   * bijgewerkt (een add-on eroverheen). Op Lucs pc is dat zo met de Kajosoft
   * o530: de afdruk is van 27-09 21:12, de cfg en `Tabley-Kun\Mercedes-Benz-Stern.o3d`
   * kwamen op 28-09 19:44 -- en precies die mesh scheelt.
   */
  const afdrukTijd = statSync(pad).mtimeMs
  const cfgStat = statSync(cfg)
  const cfgTijd = Math.max(cfgStat.mtimeMs, cfgStat.birthtimeMs || 0)
  if (cfgTijd > afdrukTijd) {
    console.log(
      `  ${model}: afdruk van ${new Date(afdrukTijd).toISOString()} is ouder dan de cfg (${new Date(cfgTijd).toISOString()}); ` +
        `niet te vergelijken (wij ${meshlijstVan(cfg).length}, de oude afdruk ${lijst.length})`
    )
    continue
  }
  gezienModel.add(cfg.toLowerCase())
  const eigen = meshlijstVan(cfg)
  const eerste = eigen.findIndex((naam, i) => klein(naam) !== klein(lijst[i] ?? ''))
  toets(
    `afdruk ${model}`,
    eigen.length === lijst.length && eerste < 0,
    `OMSI ${lijst.length}, wij ${eigen.length}` + (eerste >= 0 ? `; eerste verschil op ${eerste}: OMSI ${lijst[eerste]}, wij ${eigen[eerste]}` : '')
  )
}

// ------------------------------------------------------------ 2. vaste ijkpunten
console.log('\n== IJkpunten zonder rit ==')
const hh20 = join(OMSI, 'Vehicles', 'HH20_EBus2021', 'Model', 'model_21_main.cfg')
if (existsSync(hh20)) {
  const regels = cfgRegels(hh20)
  const ingesprongen = regels.filter((r) => r !== '[mesh]' && r.trim() === '[mesh]').length
  toets('HH20 model_21_main.cfg: 608 meshes zoals OMSI', meshlijstVan(hh20).length === 608, `wij ${meshlijstVan(hh20).length}; [mesh]-regels ${regels.filter((r) => r === '[mesh]').length}, ingesprongen ${ingesprongen}`)
}

// ------------------------------------------------------------ 3. DISABLED
console.log('\n== -<DISABLED>- ... -<ENABLED>- ==')
const sl92 = join(OMSI, 'Vehicles', 'MAN_SL_SG', 'Model', 'model_SL92_main.cfg')
if (existsSync(sl92)) {
  const regels = cfgRegels(sl92)
  const cfg = leesSchermcfg(sl92)!
  let uit = false
  const blokken: Array<{ van: number; tot: number }> = []
  for (let i = 0; i < regels.length; i++) {
    if (regels[i] === '-<DISABLED>-') {
      uit = true
      blokken.push({ van: i + 1, tot: -1 })
    } else if (regels[i] === '-<ENABLED>-' && uit) {
      uit = false
      blokken[blokken.length - 1].tot = i + 1
    }
  }
  const binnen = cfg.meshes.filter((m) => m.bestaat && blokken.some((b) => m.regel > b.van && (b.tot < 0 || m.regel < b.tot)))
  console.log(
    `SL92: ${blokken.length} blok(ken) (${blokken.map((b) => `${b.van}-${b.tot}`).join(', ')}), ` +
      `${binnen.length} bestaande meshes erin: ${binnen.map((m) => `${m.meshIndex}:${basename(m.pad)}`).join(', ')}`
  )
  console.log(`  onze telling nu (DISABLED telt mee): ${meshlijstVan(sl92).length}; als OMSI ze overslaat: ${meshlijstVan(sl92).length - binnen.length}`)
  const heeftAfdruk = gezienModel.has(sl92.toLowerCase())
  console.log(
    heeftAfdruk
      ? '  een afdruk van de SL92 is hierboven vergeleken: die beslist.'
      : '  BESLISSING OPEN: geen meshes.json van een rit met de SL92 op deze pc. Tot die er is, blijft DISABLED buiten schermcfg.ts (ontwerp §5.1).'
  )
}

// ------------------------------------------------------------ 4. het 3D-pakket
console.log('\n== Het 3D-pakket hangt aan dezelfde nummers ==')
async function pakketten(): Promise<void> {
  const reg = omsiRegistratie(OMSI)
  for (const rel of ['Vehicles\\HH20_EBus2021\\HHEBus2021_main.bus', 'Vehicles\\MAN_SD200\\MAN_SD77.bus']) {
    const uit = await bouwBus3d({ omsiMap: OMSI, relatiefPad: rel, geregistreerd: reg.sleutels })
    if (!uit.bouw) {
      toets(`pakket ${rel}`, false, uit.reden)
      continue
    }
    const kop = uit.bouw.kop
    const lijsten = new Map<number, string[]>()
    let fout = 0
    for (const v of kop.vermeldingen) {
      const stuk = kop.stukken[v.stuk]
      if (stuk.deel !== 0) continue
      const deelBus = uit.bouw.manifest.delen[0].bus
      let lijst = lijsten.get(0)
      if (!lijst) {
        const regels = readFileSync(join(OMSI, deelBus), 'latin1').split(/\r?\n/)
        const model = regels[regels.indexOf('[model]') + 1].trim()
        lijst = meshlijstVan(join(OMSI, deelBus, '..', model))
        lijsten.set(0, lijst)
      }
      if (klein(lijst[v.mesh] ?? '') !== stuk.o3d.toLowerCase()) fout++
    }
    toets(`pakket ${rel}: vermelding.mesh wijst naar dezelfde o3d als de meshlijst`, fout === 0, `${kop.vermeldingen.length} vermeldingen, ${fout} verschillen`)
  }
}

void pakketten().then(() => {
  console.log(`\n${fouten === 0 ? 'ALLES GOED' : `${fouten} FOUT(EN)`}`)
  process.exitCode = fouten === 0 ? 0 : 1
})
