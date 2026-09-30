/**
 * De rittenstaat, nagerekend op nagebootste ritten.
 *
 *   npx tsx scripts/probe-rittenstaat.ts
 *
 * Hoe OMSI de volgende halte laat verspringen -- bij aankomst, bij deur dicht of
 * pas bij het wegrijden -- is in het spel nog niet nagekeken. De rittenstaat
 * hoort in alle drie de gevallen hetzelfde vertrek te vinden. Deze proef rijdt
 * dezelfde rit drie keer, elke keer met een andere sprong, en kijkt ook:
 * - een halte zonder stilstaan telt als doorgereden;
 * - te vroeg weg bij een vaste tijd is "vroeg", bij een geschatte tijd geen oordeel;
 * - de laatste halte van een rit krijgt geen vertrek;
 * - een teller die terugloopt (OMSI herstart) telt niet als hard remmen;
 * - een sprong terug in dezelfde rit is geen gereden halte;
 * - de deuren (B3): een regel bij de eerste stand en bij elke verandering, en
 *   geen zonder deurgetallen.
 * Leest en schrijft niets.
 */
import { bouwRittenstaat, volgSpoor, type MeetStand, type Meting, type SpoorRegel } from '../src/core/rittenstaat'
import type { Duty } from '../src/core/types'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

// Een rit van vier haltes om 10:00. Halte 1 en 3 liggen vast, halte 2 is geschat.
const duty = {
  mapFolder: 'Proef',
  mapName: 'Proef',
  lineFile: '1',
  tourNumber: '1',
  depot: '',
  signOn: 590,
  start: 600,
  end: 612,
  durationMinutes: 12,
  totalStops: 4,
  lineNumbers: ['1'],
  days: 127,
  period: 0,
  legs: [
    {
      tripFile: 'rit',
      lineFile: '1',
      lineNumber: '1',
      terminus: 'Eind',
      departure: 600,
      arrival: 612,
      minutes: 12,
      tourNumber: '1',
      layoverBefore: 0,
      stops: ['Begin', 'Markt', 'Kerk', 'Eind'],
      stopIds: ['a', 'b', 'c', 'd'],
      stopTimes: [600, 604, 608, 612],
      stopVast: [600, 604, null, 612]
    }
  ]
} as unknown as Duty

type Sprong = 'aankomst' | 'vertrek' | 'paal'

/**
 * De rit seconde voor seconde. Per halte: aankomen, stilstaan, wegrijden op
 * `weg` (minuten). De sprong van de volgende halte valt waar `sprong` zegt.
 */
function rij(sprong: Sprong, weg: number[], doorrijden = new Set<number>()): SpoorRegel[] {
  const regels: SpoorRegel[] = []
  let stand: MeetStand | undefined
  let volgende = 0
  const stap = (klok: number, snelheid: number, extra: Partial<Meting> = {}): void => {
    const uit = volgSpoor(stand, {
      klok,
      rit: 0,
      halte: volgende,
      uitMenu: true,
      snelheid,
      reizigers: 3,
      remmen: 0,
      optrekken: 0,
      ...extra
    })
    stand = uit.stand
    regels.push(...uit.regels)
  }
  let klok = 599
  for (let halte = 0; halte < 4; halte++) {
    const vertrek = weg[halte]
    if (doorrijden.has(halte)) {
      // Rijdend langs de paal: de sprong valt midden in het rijden.
      while (klok < vertrek) { stap(klok, 40); klok += 1 / 60 }
      volgende = halte + 1
      stap(klok, 40)
      klok += 1 / 60
      continue
    }
    // Aankomen en stilstaan tot het vertrek.
    stap(klok, 20); klok += 1 / 60
    if (sprong === 'aankomst') volgende = Math.min(halte + 1, 3)
    while (klok < vertrek) { stap(klok, 0); klok += 1 / 60 }
    if (sprong === 'vertrek') volgende = Math.min(halte + 1, 3)
    // Wegrijden.
    for (let i = 0; i < 20; i++) { stap(klok, 15 + i); klok += 1 / 60 }
    if (sprong === 'paal') volgende = Math.min(halte + 1, 3)
    for (let i = 0; i < 30; i++) { stap(klok, 40); klok += 1 / 60 }
  }
  return regels
}

// Halte 0 op tijd, halte 1 twee minuten te vroeg, halte 2 een minuut later dan geschat.
const weg = [600, 602, 609, 612]
for (const sprong of ['aankomst', 'vertrek', 'paal'] as Sprong[]) {
  const staat = bouwRittenstaat(duty, rij(sprong, weg))
  const [begin, markt, kerk, eind] = staat.ritten[0].haltes
  const min = (v?: number): string => (v === undefined ? '—' : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`)
  console.log(`\nsprong bij ${sprong}: Begin ${min(begin.vertrek)} Markt ${min(markt.vertrek)} Kerk ${min(kerk.vertrek)} Eind ${min(eind.vertrek)}`)
  // Wegrijden begint op `weg`; de lus rekent in hele seconden, dus binnen twee tellen.
  const bijna = (v: number | undefined, doel: number): boolean => v !== undefined && Math.abs(v - doel) < 2 / 60
  klopt(`${sprong}: vertrek Begin gevonden rond 10:00`, bijna(begin.vertrek, 600))
  klopt(`${sprong}: vertrek Markt rond 10:02`, bijna(markt.vertrek, 602))
  klopt(`${sprong}: Markt is twee minuten te vroeg`, markt.oordeel === 'vroeg' && Math.abs((markt.verschilS ?? 0) + 120) <= 2)
  klopt(`${sprong}: Kerk heeft een geschatte tijd en geen oordeel`, kerk.vast === false && kerk.oordeel === undefined && kerk.vertrek !== undefined)
  klopt(`${sprong}: Eind is een aankomst, zonder vertrek`, eind.vertrek === undefined)
  klopt(`${sprong}: telling klopt (3 gemeten, 2 vast, 1 te vroeg)`, staat.gemeten === 3 && staat.vastGemeten === 2 && staat.teVroeg === 1)
}

{
  const staat = bouwRittenstaat(duty, rij('aankomst', weg, new Set([1])))
  const markt = staat.ritten[0].haltes[1]
  console.log('')
  klopt('doorgereden bij Markt telt als doorgereden, met de sprong als vertrek', markt.doorgereden === true && markt.vertrek !== undefined)
}

{
  // Een teller die terugloopt: OMSI is opnieuw gestart.
  let stand: MeetStand | undefined
  const regels: SpoorRegel[] = []
  for (const [remmen, klok] of [[5, 600], [6, 600.1], [0, 600.2], [1, 600.3]] as const) {
    const uit = volgSpoor(stand, { klok, rit: 0, halte: 1, uitMenu: true, snelheid: 30, reizigers: 0, remmen, optrekken: 0 })
    stand = uit.stand
    regels.push(...uit.regels)
  }
  const n = regels.filter((r) => r.t === 'rem').reduce((som, r) => som + (r.t === 'rem' ? r.n : 0), 0)
  klopt('teller die terugloopt telt niet: 2 keer hard geremd, niet 7', n === 2)
}

{
  // OMSI bedenkt zich: halte 2, dan weer 1, dan 2.
  let stand: MeetStand | undefined
  const regels: SpoorRegel[] = []
  for (const [halte, klok] of [[1, 600], [2, 601], [1, 601.1], [2, 601.2]] as const) {
    const uit = volgSpoor(stand, { klok, rit: 0, halte, uitMenu: true, snelheid: 30, reizigers: 0, remmen: 0, optrekken: 0 })
    stand = uit.stand
    regels.push(...uit.regels)
  }
  klopt('een sprong terug in dezelfde rit is geen gereden halte', regels.filter((r) => r.t === 'halte').length === 2)
}

{
  // Zonder dienstregeling uit het menu: niets gemeten, en dus "niet gemeten".
  let stand: MeetStand | undefined
  const regels: SpoorRegel[] = []
  for (const [halte, klok] of [[0, 600], [1, 602], [2, 605]] as const) {
    const uit = volgSpoor(stand, { klok, rit: 0, halte, uitMenu: false, snelheid: 30, reizigers: 0, remmen: 0, optrekken: 0 })
    stand = uit.stand
    regels.push(...uit.regels)
  }
  klopt('zonder menu wordt geen halte geteld', bouwRittenstaat(duty, regels).gemeten === 0)
}

// ---- de deuren in het spoor (B3) ----
{
  const basis: Meting = { klok: 600, rit: 0, halte: 1, uitMenu: true, snelheid: 0, reizigers: 3, remmen: 0, optrekken: 0 }
  const eerst = volgSpoor(undefined, { ...basis, deuren: { open: 0b10, vraag: 0 } })
  klopt('de eerste meting met deuren: een regel met de stand', eerst.regels.length === 1 && eerst.regels[0].t === 'deuren' && eerst.regels[0].open === 0b10)
  const zelfde = volgSpoor(eerst.stand, { ...basis, klok: 600.02, deuren: { open: 0b10, vraag: 0 } })
  klopt('niets veranderd: geen regel', !zelfde.regels.some((r) => r.t === 'deuren'))
  const dicht = volgSpoor(zelfde.stand, { ...basis, klok: 600.03, deuren: { open: 0, vraag: 0 } })
  const vraag = volgSpoor(dicht.stand, { ...basis, klok: 600.04, deuren: { open: 0, vraag: 1 << 9 } })
  const regel = vraag.regels.find((r) => r.t === 'deuren')
  klopt(
    'deur dicht, en dan een wens bij deur 1 (uit): elk een regel met rit en halte',
    dicht.regels.some((r) => r.t === 'deuren' && r.open === 0) && regel?.t === 'deuren' && regel.vraag === 1 << 9 && regel.rit === 0 && regel.halte === 1
  )
  const zonder = volgSpoor(vraag.stand, { ...basis, klok: 600.05 })
  klopt('zonder deurgetallen (oude plugin): geen regel', !zonder.regels.some((r) => r.t === 'deuren'))
  const staat = bouwRittenstaat(duty, [{ t: 'begin', k: 599, dienst: 'x' }, ...eerst.regels, ...dicht.regels, ...vraag.regels])
  klopt('deurregels veranderen de rittenstaat niet', staat.gemeten === 0 && staat.teVroeg === 0)
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
