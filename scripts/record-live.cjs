/**
 * Legt vast wat de plugin doorgeeft, zolang je rijdt.
 *
 *   node scripts/record-live.cjs [uitvoerbestand] [minuten]
 *
 * Elke 250 ms wordt `live.json` gelezen en weggeschreven als CSV: de klok, de
 * volgende halte zoals OMSI hem noemt, zijn eigen nummer, de vertraging en of de
 * dienstregeling rijdt. Springt er in het spel iets raars -- een verschil dat
 * ineens zes minuten verspringt, een halte die blijft hangen -- dan staat het
 * hier met tijdstip en al in, en valt achteraf te zien wat OMSI op dat moment
 * doorgaf.
 *
 * Er wordt alleen gelezen. Stoppen met Ctrl+C.
 */
const { existsSync, readFileSync, writeFileSync, appendFileSync } = require('node:fs')
const { join } = require('node:path')

const out = process.argv[2] || join(process.cwd(), 'live-opname.csv')
const minutes = Number(process.argv[3] || 60)
const file = join(process.env.LOCALAPPDATA ?? '', 'OMSI Career', 'live.json')

const COLUMNS = [
  'tijd',
  'klok',
  'schedActive',
  'lijn',
  'omloop',
  'rit',
  'volgendeHalte',
  'nummerVanOmsi',
  'afstand',
  'vertragingSec',
  'ibisHalte',
  'ibisIndex',
  'snelheid',
  'wegdek',
  'neerslag'
]
writeFileSync(out, COLUMNS.join(';') + '\r\n', 'utf8')
console.log(`schrijft naar ${out} -- rijden maar. Stoppen met Ctrl+C.`)

let last = ''
let samples = 0
const started = Date.now()

const tick = () => {
  if (Date.now() - started > minutes * 60000) {
    console.log(`\nklaar: ${samples} metingen in ${out}`)
    process.exit(0)
  }
  if (!existsSync(file)) return

  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    // Halverwege geschreven; volgende keer beter.
    return
  }
  const mem = data.mem ?? {}
  const row = [
    new Date().toISOString().slice(11, 23),
    (data.time / 60).toFixed(3),
    mem.schedActive ?? '',
    (mem.lineName ?? '').trim(),
    (mem.tourName ?? '').trim(),
    (mem.tripName ?? '').trim(),
    (mem.nextStop ?? '').trim(),
    mem.nextIndex ?? '',
    mem.nextDist ?? '',
    mem.delay ?? '',
    (data.busstop ?? '').trim(),
    data.busstopIndex ?? '',
    data.velocity?.toFixed?.(1) ?? '',
    data.streetCond ?? '',
    data.precipRate ?? ''
  ]

  // Alleen wegschrijven als er iets veranderd is; anders staan er duizenden
  // identieke regels in en zie je de sprong niet meer.
  const key = row.slice(1).join(';')
  if (key === last) return
  last = key
  samples++
  appendFileSync(out, row.join(';') + '\r\n', 'utf8')
  if (samples % 20 === 0) process.stdout.write('.')
}

setInterval(tick, 250)
