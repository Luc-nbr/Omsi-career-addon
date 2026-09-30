/**
 * De meetsessie van de meetstand (core/meetstand.ts) los nagerekend, zonder
 * Electron, met een nagebootste plugin in een tijdelijke map. En de
 * namenlijsten voor de plugin (`schrijfGetallen` in core/live.ts).
 *
 *   npx tsx scripts/probe-meetsessie.ts
 *
 * Wat de tegenlezing en de proefdraaier van 30-09 vonden, en wat hier nu vastligt:
 * - na "Meting opslaan" rust de sessie: geen losse map meer tot `hervat`
 *   (proefverslag punt 5), de ruwe map gaat weg zodra de zip klopt, en er
 *   blijven hoogstens `METINGEN_BEWAARD` metingen staan (tegenlezing punt 1);
 * - een meting die vol is, schrijft niets meer tot hij opgeslagen is (punt 1);
 * - opslaan gebeurt op de achtergrond: het hoofdproces blijft vrij (punt 6),
 *   twee keer drukken geeft één zip;
 * - een vink die weer uitgaat schrapt zijn afdruk, een tweede vink van
 *   dezelfde stap overschrijft de eerste afdruk niet (proefverslag punt 6);
 * - `bus.model` wordt net zo ingekort als `pad` (punt 7);
 * - geen regel `vraag` met alleen de vier veringen terwijl OMSI een bus laadt,
 *   en `meetregels` naast `regels` in meting.json (punt 9);
 * - plek, tank, de hele kaartverkoop en de flitspalen in het bestand (punt 8);
 * - wat de speler als nummer of pincode in de IBIS intikt, gaat niet mee in
 *   een afdruk (tegenlezing punt 7);
 * - twee exemplaren van de app schrijven getallen.txt niet om en om terug
 *   (tegenlezing punt 5).
 *
 * Schrijft alleen in een tijdelijke map.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LiveData } from '../src/core/live'
import { AFDRUK_GEHEIM, METINGEN_BEWAARD, Meetsessie, type MeetKop, veiligeAfdruk } from '../src/core/meetstand'
import { crc32, maakZip, maakZipAchtergrond, openZip } from '../src/core/zip'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

const werk = mkdtempSync(join(tmpdir(), 'omsi-meetsessie-'))
const liveMap = join(werk, 'live')
mkdirSync(liveMap, { recursive: true })
const getallenJson = join(liveMap, 'getallen.json')

/* De klok van de proef: elke regel 250 ms verder. */
let klok = Date.parse('2026-09-30T10:00:00')
const nu = (): number => klok
const meldingen: string[] = []

/** Een getallen.json zoals de plugin hem schrijft, met een tijdstempel die de sessie als "na de vink" ziet. */
function schrijfAfdruk(bus: string, getallen: Record<string, number>): void {
  writeFileSync(getallenJson, JSON.stringify({ bus, aantal: 900, getallen, afgekapt: false }))
  const t = new Date(klok + 100)
  utimesSync(getallenJson, t, t)
}

const MAN = { naam: 'MAN NL meetbus', model: 'model\\model_NL202.cfg', pad: 'vehicles/MAN_NL_NG', bestand: '' }
const ABSOLUUT = {
  naam: 'Citybus meetbus',
  model: 'C:\\Users\\Proefpersoon\\OMSI 2\\Vehicles\\Citybus 530 by Kajosoft\\model\\model_o530_u_e2_1.cfg',
  pad: 'C:\\Users\\Proefpersoon\\OMSI 2\\Vehicles\\Citybus 530 by Kajosoft',
  bestand: ''
}

function live(bus: LiveData['bus'] | undefined, extra: Partial<LiveData> = {}): LiveData {
  return {
    alive: true,
    time: 8 * 3600,
    velocity: 30,
    passengers: 4,
    atStation: 0,
    entryOpen: 0,
    exitOpen: 0,
    entryRequest: 0,
    exitRequest: 0,
    lightsLow: 1,
    tankPercent: 0.62,
    bus,
    getallen: { cp_kneeling_sw: 0, PAX_Entry0_Open: 0 },
    mem: {
      ok: 1,
      tile: 0,
      x: 0,
      y: 0,
      z: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      schedActive: 1,
      line: 0,
      tour: 0,
      tourEntry: 0,
      trip: 0,
      nextIndex: 3,
      nextDist: 120,
      delay: 0,
      lineName: '',
      tourName: '',
      tripName: '',
      nextStop: 'Rathaus',
      koper: 2,
      ticketSoort: 1,
      ticketIndex: 0,
      ticketPrijs: 2.5,
      ticketGegeven: 5,
      ticketSlecht: 1,
      ticketKlaar: 0
    },
    ...extra
  } as unknown as LiveData
}

const kop = (gevraagd: string[], palen?: MeetKop['palen']): MeetKop => ({
  modus: 'dienst',
  kaart: 'Grundorf',
  appVersie: 'proef',
  gevraagd,
  afgevallen: [],
  varlists: ['script/varlist.txt'],
  palen
})
const VOL = ['Axle_Suspension_1_L', 'cp_kneeling_sw', 'haltewunsch']
const LEEG = ['Axle_Suspension_1_L', 'Axle_Suspension_1_R', 'Axle_Suspension_2_L', 'Axle_Suspension_2_R']

function regelsIn(map: string): Array<Record<string, unknown> & { bestand: string }> {
  const uit: Array<Record<string, unknown> & { bestand: string }> = []
  for (const n of readdirSync(map).filter((x) => x.endsWith('.jsonl'))) {
    for (const r of readFileSync(join(map, n), 'utf8').split('\n').filter(Boolean)) uit.push({ bestand: n, ...JSON.parse(r) })
  }
  return uit
}

async function hoofd(): Promise<void> {
  /* ---- een meting met twee bussen, vinken, afdrukken ---- */
  const basis = join(werk, 'metingen')
  const sessie = new Meetsessie(basis, () => getallenJson, nu, (r) => meldingen.push(r))
  schrijfAfdruk(MAN.naam, { Velocity: 30, IBIS_PIN: 4711, '6_numer_kierowcy': 123456, cp_fahrertuer_pos: 1, cp_kneeling_sw: 0 })
  const palen = [
    { id: 11, x: 100.123, y: 50, kmh: 50 },
    { id: 12, x: 300, y: 80, kmh: 30 }
  ]
  const stap = (l: LiveData, k: MeetKop, plek?: { x: number; y: number; koers: number }): void => {
    klok += 250
    sessie.schrijf({ live: l, verkocht: 3, plek }, k)
  }
  for (let i = 0; i < 8; i++) stap(live(MAN), kop(VOL, i >= 4 ? palen : undefined), { x: 12.345, y: 67.891, koers: 91.6 })
  const map = sessie.mapVanMeting!
  klopt(`een meting begint (${map ? 'meting-...' : 'geen'})`, Boolean(map && existsSync(map)))

  /* Vink en meteen weer uit: de afdruk vervalt. */
  klopt('vink knielen aan', sessie.vink('knielen', true))
  klok += 100
  sessie.vink('knielen', false)
  schrijfAfdruk(MAN.naam, { Velocity: 0, IBIS_PIN: 4711, cp_kneeling_sw: 1 })
  stap(live(MAN), kop(VOL, palen))
  klopt('een vink die weer uitgaat, schrapt zijn afdruk', !existsSync(join(map, 'dump-1-knielen.json')))

  /* Twee keer aan: twee afdrukken. */
  sessie.vink('knielen', true)
  klok += 50
  schrijfAfdruk(MAN.naam, { Velocity: 0, IBIS_PIN: 4711, '6_numer_kierowcy': 123456, cp_fahrertuer_pos: 1, cp_kneeling_sw: 1 })
  stap(live(MAN), kop(VOL, palen))
  sessie.vink('knielen', true)
  klok += 50
  schrijfAfdruk(MAN.naam, { Velocity: 0, cp_kneeling_sw: 1, Axle_Suspension_0_R: -0.19 })
  stap(live(MAN), kop(VOL, palen))
  klopt('de tweede vink van dezelfde stap overschrijft de eerste afdruk niet', existsSync(join(map, 'dump-2-knielen.json')) === false && existsSync(join(map, 'dump-1-knielen-2.json')) && existsSync(join(map, 'dump-1-knielen-3.json')))
  const afdruk = JSON.parse(readFileSync(join(map, 'dump-1-knielen-2.json'), 'utf8'))
  klopt(
    `afdruk zonder IBIS-pincode en chauffeursnummer, de deur van de chauffeur blijft (${JSON.stringify(afdruk.gemaskeerd)})`,
    afdruk.getallen.IBIS_PIN === null && afdruk.getallen['6_numer_kierowcy'] === null && afdruk.getallen.cp_fahrertuer_pos === 1 &&
      !readFileSync(join(map, 'dump-1-knielen-2.json'), 'utf8').includes('4711') && !readFileSync(join(map, 'dump-1-knielen-2.json'), 'utf8').includes('123456')
  )
  klopt(
    'het patroon van de pincode raakt geen gewone namen',
    ['IBIS_PIN', '6_numer_kierowcy', 'pin', 'IBIS_PIN_temp'].every((n) => AFDRUK_GEHEIM.test(n)) &&
      !['cp_fahrertuer_pos', 'lights_fahrerlicht', 'setvar_personalised', 'spin_speed', 'pinion', 'Driver_Seat_VertTransl'].some((n) => AFDRUK_GEHEIM.test(n))
  )
  klopt('een afdruk die geen JSON van de plugin is, gaat niet mee', veiligeAfdruk(Buffer.from('{kapot')) === undefined && veiligeAfdruk(Buffer.from('[]')) === undefined)

  /* OMSI laadt een andere bus: even geen bus, dan een bus met een absoluut pad. */
  for (let i = 0; i < 4; i++) stap(live(undefined), kop(LEEG))
  for (let i = 0; i < 4; i++) stap(live(ABSOLUUT), kop(VOL))
  const regels = regelsIn(map)
  const vragenMan = regels.filter((r) => r.bestand.startsWith('meting-1-') && r.t === 'vraag')
  klopt(`geen regel 'vraag' met alleen de vier veringen terwijl er geen bus is (${vragenMan.length} in het bestand van de MAN)`, vragenMan.length === 0)
  const kop2 = regels.find((r) => r.bestand.startsWith('meting-2-') && r.t === 'kop') as { bus?: { model: string; pad: string } } | undefined
  klopt(
    `het model net zo ingekort als het pad (${kop2?.bus?.model})`,
    kop2?.bus?.model === 'Vehicles/Citybus 530 by Kajosoft/model/model_o530_u_e2_1.cfg' && kop2?.bus?.pad === 'Vehicles/Citybus 530 by Kajosoft'
  )
  const eerste = regels.find((r) => r.t === 'm') as unknown as Record<string, unknown> & { kassa: Record<string, unknown> }
  klopt(
    `plek, tank en de hele kaartverkoop in een meetregel (${JSON.stringify(eerste.plek)}, ${eerste.tank}, ${JSON.stringify(eerste.kassa)})`,
    JSON.stringify(eerste.plek) === '[12.3,67.9,92]' &&
      eerste.tank === 0.62 &&
      eerste.kassa.slecht === 1 && eerste.kassa.gegeven === 5 && eerste.kassa.prijs === 2.5 && eerste.kassa.soort === 1
  )
  const palenRegels = regels.filter((r) => r.t === 'palen') as unknown as Array<{ palen: Array<{ id: number; x: number }>; bereikM: number }>
  klopt(
    `de flitspalen één keer per bus, zodra ze er zijn (${palenRegels.length})`,
    palenRegels.length === 1 && palenRegels[0].palen.length === 2 && palenRegels[0].palen[0].x === 100.123 && palenRegels[0].bereikM > 0
  )
  const vinken = regels.filter((r) => r.t === 'vink')
  klopt(
    `de vinkregels: aan, uit met de geschrapte afdruk, twee keer aan (${vinken.map((v) => `${v.aan}${v.dump ? ':' + v.dump : ''}${v.geschrapt ? ':-' + v.geschrapt : ''}`).join(' ')})`,
    vinken.length === 4 &&
      (vinken[1].geschrapt as string[] | undefined)?.[0] === 'dump-1-knielen.json' &&
      vinken[3].dump === 'dump-1-knielen-3.json'
  )

  /* ---- opslaan: op de achtergrond, één zip, de map weg, en dan rust ---- */
  const aantalM = regels.filter((r) => r.t === 'm').length
  const eenKeer = sessie.opslaan()
  const tweeKeer = sessie.opslaan()
  /* Terwijl hij inpakt, komt er een regel: die mag niet in de map die ingepakt wordt, en geen nieuwe map beginnen. */
  stap(live(MAN), kop(VOL))
  const [zip, zip2] = await Promise.all([eenKeer, tweeKeer])
  klopt(`twee keer drukken, één zip (${zip && zip.split(/[\\/]/).pop()})`, Boolean(zip && zip === zip2 && existsSync(zip)))
  klopt('de ruwe map is weg zodra de zip klopt', !existsSync(map))
  const inhoud: Record<string, string> = {}
  const z = openZip(zip!)
  for (const b of z.bestanden) inhoud[b.naam] = z.lees(b).toString('utf8')
  z.sluit()
  const meting = JSON.parse(inhoud['meting.json'])
  klopt(
    `meting.json: meetregels (${meting.meetregels}) naast per bus alle regels (${meting.bussen.map((b: { regels: number; meetregels: number }) => `${b.regels}/${b.meetregels}`).join(', ')})`,
    meting.meetregels === aantalM &&
      !('regels' in meting) &&
      meting.bussen.reduce((s: number, b: { meetregels: number }) => s + b.meetregels, 0) === aantalM &&
      meting.bussen.every((b: { regels: number; meetregels: number }) => b.regels > b.meetregels)
  )
  const alles = Object.values(inhoud).join('\n')
  klopt('geen pad van deze pc in de zip, geen pincode', !alles.includes('Proefpersoon') && !alles.includes('C:\\\\Users') && !alles.includes('4711'))
  klopt(`de zip heeft de afdrukken en beide bussen (${Object.keys(inhoud).join(', ')})`, ['dump-1-begin.json', 'dump-1-knielen-2.json', 'dump-2-begin.json'].every((n) => n in inhoud) && Object.keys(inhoud).some((n) => /^meting-2-Citybus_meetbus\.jsonl$/.test(n)))

  const voor = readdirSync(basis).length
  for (let i = 0; i < 6; i++) stap(live(MAN), kop(VOL))
  const beeldRust = sessie.beeld(true)
  klopt(
    `na het opslaan rust hij: geen nieuwe map (${voor} -> ${readdirSync(basis).length}), beeld zegt 'opgeslagen'`,
    readdirSync(basis).length === voor && beeldRust.rust === 'opgeslagen' && beeldRust.loopt === false && sessie.mapVanMeting === undefined
  )
  klopt('in rust kan er niet gevinkt worden', sessie.vink('halte', true) === false)
  sessie.hervat()
  klok += 1000
  stap(live(MAN), kop(VOL))
  klopt('na hervat (een nieuwe dienst of rit) begint een nieuwe meting', Boolean(sessie.mapVanMeting && existsSync(sessie.mapVanMeting)) && sessie.beeld(true).rust === undefined)

  /* ---- vol: stoppen tot opslaan ---- */
  const volBasis = join(werk, 'metingen-vol')
  const klein = new Meetsessie(volBasis, () => getallenJson, nu, (r) => meldingen.push(r), { maxBytes: 12_000 })
  let n = 0
  while (klein.beeld(true).rust !== 'vol' && n < 200) {
    klok += 250
    klein.schrijf({ live: live(MAN), verkocht: 0 }, kop(VOL))
    n++
  }
  const volMap = klein.mapVanMeting!
  const groot = regelsIn(volMap).length
  for (let i = 0; i < 20; i++) {
    klok += 250
    klein.schrijf({ live: live(MAN), verkocht: 0 }, kop(VOL))
  }
  klopt(`een volle meting schrijft niets meer (${groot} regels na ${n} keer, daarna ${regelsIn(volMap).length})`, n < 200 && regelsIn(volMap).length === groot)
  klein.hervat()
  klok += 250
  klein.schrijf({ live: live(MAN), verkocht: 0 }, kop(VOL))
  klopt('hervat maakt een volle meting niet leeg: eerst opslaan', regelsIn(volMap).length === groot && klein.beeld(true).rust === 'vol')
  const volZip = await klein.opslaan()
  klopt('een volle meting laat zich opslaan, en rust daarna', Boolean(volZip && existsSync(volZip)) && klein.beeld(true).rust === 'opgeslagen')

  /* ---- opruimen: de nieuwste vijf, alleen namen van de meetstand ---- */
  const ruim = join(werk, 'metingen-ruim')
  mkdirSync(ruim, { recursive: true })
  const stammen = Array.from({ length: 8 }, (_, i) => `meting-202609${String(10 + i).padStart(2, '0')}-120000`)
  /* Een map, een zip of allebei: nooit niets. */
  for (const [i, stam] of stammen.entries()) {
    if (i % 3 !== 2) mkdirSync(join(ruim, stam))
    if (i % 3 !== 0) writeFileSync(join(ruim, `${stam}.zip`), 'zip')
  }
  writeFileSync(join(ruim, 'meting-20260917-120000.zip.tmp'), 'half')
  writeFileSync(join(ruim, 'notities.txt'), 'van Luc')
  mkdirSync(join(ruim, 'meting-eigen'))
  new Meetsessie(ruim, () => getallenJson, nu).ruimOp()
  const over = readdirSync(ruim).sort()
  const stamOver = [...new Set(over.filter((x) => /^meting-\d{8}-\d{6}(\.zip)?$/.test(x)).map((x) => x.replace(/\.zip$/, '')))].sort()
  klopt(
    `opruimen: de nieuwste ${METINGEN_BEWAARD} blijven, een map met zip gaat weg, andere namen blijven (${over.join(', ')})`,
    JSON.stringify(stamOver) === JSON.stringify(stammen.slice(-METINGEN_BEWAARD)) &&
      !over.some((x) => x.endsWith('.tmp')) &&
      over.includes('notities.txt') &&
      over.includes('meting-eigen') &&
      stamOver.every((stam) => !(over.includes(stam) && over.includes(`${stam}.zip`)))
  )

  /* ---- de zip op de achtergrond: dezelfde zip, en het hoofdproces blijft vrij ---- */
  const tekst = Buffer.from(
    Array.from({ length: 160_000 }, (_, i) => JSON.stringify({ t: 'm', tijd: i * 250, klok: 28800 + i / 4, getallen: { a: i % 7, b: (i * 13) % 101 } })).join('\n')
  )
  const bestanden = [
    { naam: 'meting-1-bus.jsonl', inhoud: tekst },
    { naam: 'meting.json', inhoud: Buffer.from('{}') }
  ]
  const datum = new Date(klok)
  klopt(
    `de crc in stukken is dezelfde als in één keer (${(tekst.length / 1024 / 1024).toFixed(1)} MB)`,
    crc32(tekst.subarray(4_000_000), crc32(tekst.subarray(0, 4_000_000))) === crc32(tekst)
  )
  let t0 = performance.now()
  const zo = maakZip(bestanden, datum)
  const zoMs = performance.now() - t0
  let grootsteGat = 0
  let vorige = performance.now()
  const tik = setInterval(() => {
    const nu2 = performance.now()
    grootsteGat = Math.max(grootsteGat, nu2 - vorige)
    vorige = nu2
  }, 1)
  t0 = performance.now()
  vorige = t0
  const achter = await maakZipAchtergrond(bestanden, datum)
  const achterMs = performance.now() - t0
  clearInterval(tik)
  klopt('de zip op de achtergrond is dezelfde als de gewone', achter.equals(zo))
  klopt(
    `het hoofdproces blijft vrij: ${Math.round(zoMs)} ms vast in één keer, op de achtergrond hoogstens ${Math.round(grootsteGat)} ms achter elkaar (in ${Math.round(achterMs)} ms)`,
    grootsteGat < Math.max(60, zoMs / 3)
  )

  /* ---- getallen.txt: twee exemplaren vechten niet ---- */
  const pluginMap = join(werk, 'plugin')
  mkdirSync(pluginMap, { recursive: true })
  process.env.OMSI_ENHANCER_LIVEMAP = pluginMap
  const { schrijfGetallen } = await import('../src/core/live')
  const txt = join(pluginMap, 'getallen.txt')
  const lees = (): string => readFileSync(txt, 'utf8').trim().split(/\r?\n/).join(',')
  schrijfGetallen(['A', 'B'])
  klopt('getallen.txt: de eerste lijst gaat erin', lees() === 'A,B')
  writeFileSync(txt, 'X\r\nY\r\n')
  const tijdAnder = statSync(txt).mtimeMs
  for (let i = 0; i < 5; i++) schrijfGetallen(['A', 'B'])
  klopt('een ander exemplaar schreef zijn lijst: dit schrijft niet terug zolang zijn eigen lijst gelijk blijft', lees() === 'X,Y' && statSync(txt).mtimeMs === tijdAnder)
  schrijfGetallen(['A', 'B', 'C'])
  klopt('een nieuwe eigen lijst gaat er wel in', lees() === 'A,B,C')
  rmSync(txt)
  schrijfGetallen(['A', 'B', 'C'])
  klopt('is het bestand weg, dan komt het terug', existsSync(txt) && lees() === 'A,B,C')

  klopt('het logboek zegt dat de meting vol is', meldingen.some((m) => m.includes('meting vol')))
}

hoofd()
  .catch((fout) => {
    console.log(`FOUT ${String(fout?.stack ?? fout)}`)
    fouten++
  })
  .finally(() => {
    rmSync(werk, { recursive: true, force: true })
    console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
    process.exit(fouten ? 1 : 0)
  })
