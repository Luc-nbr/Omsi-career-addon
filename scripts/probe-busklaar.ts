/**
 * Een bus klaarmaken vanuit de app: leest hij de bus goed uit?
 *
 *   npx tsx scripts/probe-busklaar.ts [--vloot]
 *
 * core/busklaar.ts leest een busmap uit zoals de app dat tijdens het rijden doet,
 * maar van schijf en zonder de plugin. Wat hier nagerekend wordt:
 *
 * - de sleutel is dezelfde als die de plugin tijdens het rijden doorgeeft
 *   ("vehicles/hh20_ebus2021" -- gemeten in de instellingen van de gebruiker);
 * - de HH20 geeft precies wat in het spel werkte: een ALMEX als touchscreen,
 *   aanbevolen, met 48 knoppen die aan een toets moeten, het scherm eerst en de
 *   klep, de grendel en het wisselgeld als laatste; de geldlade en de displays
 *   niet aanbevolen;
 * - de Kajosoft-Citybus (26 varianten, 8 modellen in één map) geeft zijn
 *   RG-kastje met het cijferblok erbij, en de knoppen PER VARIANT: twee
 *   varianten rijden nooit tegelijk en mogen toetsen delen;
 * - de O530 en de Setra met hun AFR 200: een scherm met toetsen;
 * - met --vloot: elke busmap, hoeveel er een aanbevolen apparaat hebben, en of
 *   de grootste variant in de toetsen past.
 *
 * Leest alleen; schrijft niets.
 */
import { findOmsiInstall } from '../src/core/install'
import { listVehicles } from '../src/core/vehicles'
import { actiesPerVariant, analyseerBusmap, busmappen, modelcfgsVan } from '../src/core/busklaar'
import { triggersVan } from '../src/core/schermvorm'

/** Zoveel toetsen zijn er vrij voor één bus in een verse installatie (scripts/probe-toetsdelen.ts: 32 + 69). */
const PLAATS = 101

const omsi = findOmsiInstall()
if (!omsi) {
  console.log('geen OMSI; overgeslagen')
  process.exit(0)
}
const voertuigen = listVehicles(omsi)
const mappen = busmappen(voertuigen)
let fouten = 0
function controle(ok: boolean, wat: string): void {
  console.log(`  ${ok ? 'ok ' : 'MIS'} ${wat}`)
  if (!ok) fouten++
}
console.log(`${voertuigen.length} voertuigen in ${mappen.length} busmappen`)

/* ---- HH20: de bus waar het in het spel mee werkte ---- */
{
  const map = mappen.find((m) => m.sleutel === 'vehicles/hh20_ebus2021')
  controle(Boolean(map), 'HH20: de sleutel is "vehicles/hh20_ebus2021", zoals de plugin hem doorgeeft')
  if (map) {
    const cfgs = modelcfgsVan(omsi, voertuigen, map.sleutel)
    const a = analyseerBusmap(omsi, cfgs, map.sleutel)
    console.log(`HH20 (${map.varianten} varianten, ${cfgs.length} model.cfg, ${a.ms} ms):`)
    for (const x of a.apparaten) console.log(`    ${x.aanbevolen ? '*' : ' '} ${x.naam.padEnd(14)} ${x.soort.padEnd(12)} ${x.knoppen} knoppen${x.beperking ? ` (${x.beperking})` : ''}`)
    const almex = a.apparaten.find((x) => x.id === '/almex')
    controle(almex?.soort === 'touchscreen' && almex.aanbevolen, 'HH20: de ALMEX is een touchscreen, en aanbevolen')
    controle(
      a.apparaten.filter((x) => x.aanbevolen).map((x: { id: string }) => x.id).join(',') === '/almex',
      `HH20: alleen de ALMEX aanbevolen (${a.apparaten.filter((x) => x.aanbevolen).map((x) => x.naam).join(', ')})`
    )
    const perVariant = actiesPerVariant(omsi, cfgs, ['/almex'])
    const acties = Object.values(perVariant).sort((x, y) => y.length - x.length)[0] ?? []
    console.log(`    knoppen voor de ALMEX: ${acties.length}; eerst ${acties.slice(0, 3).join(', ')}; laatst ${acties.slice(-4).join(', ')}`)
    controle(acties.length === 48, `HH20: 48 knoppen aan een toets, zoals in het spel (${acties.length})`)
    const laatst = new Set(acties.slice(-4).map((x) => x.toLowerCase()))
    controle(
      ['almex_ticket_toggle', 'almex_riegel', 'cashdesk_change_0500', 'cashdesk_change_1000'].every((x) => laatst.has(x)),
      'HH20: de klep, de grendel en het wisselgeld als laatste'
    )
  }
}

/* ---- Kajosoft: vijf varianten in één map, en een touchscreen met cijferblok ---- */
{
  const map = mappen.find((m) => m.map === 'Citybus 628c 628g LF by Kajosoft')
  if (map) {
    const cfgs = modelcfgsVan(omsi, voertuigen, map.sleutel)
    const a = analyseerBusmap(omsi, cfgs, map.sleutel)
    console.log(`Kajosoft 628 (${map.varianten} varianten, ${cfgs.length} model.cfg, ${a.ms} ms): ${a.apparaten.filter((x) => x.aanbevolen).map((x) => `${x.naam} ${x.soort} ${x.knoppen}`).join(' | ')}`)
    const rg = a.apparaten.find((x) => x.id === 'lf/rg')
    controle(rg?.soort === 'touchscreen' && rg.aanbevolen, 'Kajosoft: het RG-kastje is een aanbevolen touchscreen')
    const ids = a.apparaten.filter((x) => x.aanbevolen).map((x) => x.id)
    const perVariant = actiesPerVariant(omsi, cfgs, ids)
    const maten = Object.entries(perVariant).map(([cfg, lijst]) => `${cfg.split(/[\\/]/).pop()} ${lijst.length}`)
    console.log(`    knoppen per variant: ${maten.join(', ')}`)
    const metRg = Object.values(perVariant).find((lijst) => lijst.some((x) => /^ibis_eingabe$/i.test(x)))
    const blok = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'eingabe', 'loeschen'].map((t) => `ibis_${t}`)
    const inRg = new Set((metRg ?? []).map((x) => x.toLowerCase()))
    controle(blok.every((t) => inRg.has(t)), 'Kajosoft: het cijferblok hoort bij de knoppen van zijn variant')
    controle(Object.keys(perVariant).length > 1, `Kajosoft: de knoppen per variant, niet voor de hele map samen (${Object.keys(perVariant).length} varianten)`)
    controle(triggersVan(cfgs[0]).size > 0, `Kajosoft: de scripts van een variant geven triggers (${triggersVan(cfgs[0]).size})`)
  } else console.log('Kajosoft 628 niet geïnstalleerd; overgeslagen')
}

/* ---- Een AFR 200: een scherm met toetsen ---- */
for (const naam of ['MB_O530_Fam', 'S315UL']) {
  const map = mappen.find((m) => m.map === naam)
  if (!map) continue
  const cfgs = modelcfgsVan(omsi, voertuigen, map.sleutel)
  const a = analyseerBusmap(omsi, cfgs, map.sleutel)
  const aanbevolen = a.apparaten.filter((x) => x.aanbevolen)
  console.log(`${naam} (${a.ms} ms): ${aanbevolen.map((x) => `${x.naam} ${x.soort} ${x.knoppen}`).join(' | ') || 'niets aanbevolen'}`)
  controle(aanbevolen.some((x) => x.soort === 'scherm' || x.soort === 'touchscreen'), `${naam}: een apparaat met een scherm en knoppen`)
}

/* ---- De hele vloot ---- */
if (process.argv.includes('--vloot')) {
  let met = 0
  let langst = 0
  const zonder: string[] = []
  const soorten = new Map<string, number>()
  const teVeel: string[] = []
  for (const map of mappen) {
    const cfgs = modelcfgsVan(omsi, voertuigen, map.sleutel)
    const a = analyseerBusmap(omsi, cfgs, map.sleutel)
    langst = Math.max(langst, a.ms)
    const aanbevolen = a.apparaten.filter((x) => x.aanbevolen)
    if (aanbevolen.length > 0) met++
    else zonder.push(map.map)
    for (const x of aanbevolen) soorten.set(x.soort, (soorten.get(x.soort) ?? 0) + 1)
    const perVariant = actiesPerVariant(omsi, cfgs, aanbevolen.map((x) => x.id))
    const grootst = Math.max(0, ...Object.values(perVariant).map((lijst) => lijst.length))
    if (grootst > PLAATS) teVeel.push(`${map.map} (${grootst})`)
  }
  console.log(`vloot: ${met} van ${mappen.length} busmappen hebben een apparaat om klaar te maken; langst uitlezen ${langst} ms`)
  console.log(`  aanbevolen apparaten per soort: ${[...soorten].map(([s, n]) => `${s} ${n}`).join(', ')}`)
  console.log(`  zonder: ${zonder.slice(0, 20).join(', ')}${zonder.length > 20 ? ', ...' : ''}`)
  console.log(`  grootste variant past niet in ${PLAATS} toetsen: ${teVeel.length ? teVeel.join(', ') : 'geen'}`)
}

console.log(fouten === 0 ? 'de bussen worden goed uitgelezen' : `NIET GOED UITGELEZEN (${fouten})`)
process.exitCode = fouten ? 1 : 0
