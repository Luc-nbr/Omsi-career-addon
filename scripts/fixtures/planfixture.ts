/**
 * Een kunstmatige kaart en een busbedrijf, voor de proeven van de planning.
 *
 * Alles in het geheugen, zonder OMSI en zonder bestanden, zodat de proeven ook
 * in de cloud draaien (ontwerp busbedrijf-planning §3.1). De maskers zijn die
 * van lijn 109 op HafenCity:
 *
 *   A  ma–vr (799)          05:00–23:30, langer dan 9,5 u: wordt geknipt;
 *                           met een LEE-rit en Überliege-ritten van 2 haltes
 *   B  ma–do (783)          06:00–10:00
 *   C  vr (784)             15:00–19:00
 *   D  za (800)             vanaf 00:14, met een rit om −15 (vrijdag 23:45)
 *   E  zo en feestdag (960) 08:00–18:00
 *
 * Kalender: dag 1 is maandag 25-04-2016; donderdag 5 mei (dag 11) is een
 * feestdag, 16–20 mei (dagen 22–26) is schoolvakantie.
 */
import { richtBedrijfOp, type Bedrijf, type Concessie, type EigenBus, type Medewerker } from '../../src/core/bedrijf'
import type { Calendar } from '../../src/core/calendar'
import type { OmsiMap, Tour, TourTrip, Trip } from '../../src/core/types'

export const ANKER = '2016-04-25'
export const MAP = 'Proefstad'
export const LIJN = 'L1'

const halte = (id: string): { id: string; name: string } => ({ id, name: `Halte ${id}` })

function rit(file: string, haltes: string[], minuten: number, terminus: string): Trip {
  return {
    file,
    ident: '1',
    terminus,
    lineNumber: '1',
    stops: haltes.map(halte),
    profiles: [{ name: 'standard', minutes: minuten }]
  }
}

export const RITTEN: Trip[] = [
  rit('heen', ['1', '2', '3', '4', '5'], 25, 'Station'),
  rit('terug', ['5', '4', '3', '2', '1'], 25, 'Markt'),
  // Twee haltes: een Überliegeplatz- of LEE-rit, die de chauffeur wel rijdt maar die niets oplevert.
  rit('lee', ['D', '1'], 10, 'Markt'),
  rit('ueberliege', ['5', '5b'], 5, 'Station')
]

/** Omloop A: 05:00–23:30 heen en terug, met een LEE-rit vooraf en af en toe een Überliege-rit. */
function omloopA(): TourTrip[] {
  const uit: TourTrip[] = [{ tripFile: 'lee', profileIndex: 0, departure: 290 }]
  let t = 300
  let heen = true
  let n = 0
  while (t + 25 <= 1410) {
    uit.push({ tripFile: heen ? 'heen' : 'terug', profileIndex: 0, departure: t })
    t += 25
    if (heen && n % 4 === 1) {
      uit.push({ tripFile: 'ueberliege', profileIndex: 0, departure: t + 1 })
      t += 6
    }
    t += 5
    heen = !heen
    n += 1
  }
  return uit
}

function heenEnWeer(van: number, tot: number): TourTrip[] {
  const uit: TourTrip[] = []
  let heen = true
  for (let t = van; t + 25 <= tot; t += 30) {
    uit.push({ tripFile: heen ? 'heen' : 'terug', profileIndex: 0, departure: t })
    heen = !heen
  }
  return uit
}

const tour = (number: string, days: number, trips: TourTrip[], depot = 'Betriebshof Gelenkbus'): Tour => ({
  lineFile: LIJN,
  userAllowed: true,
  number,
  depot,
  days,
  trips
})

export function fixtureKaart(): OmsiMap {
  const tours: Tour[] = [
    tour('A', 799, omloopA()),
    tour('B', 783, heenEnWeer(360, 600), 'Betriebshof Solo'),
    tour('C', 784, heenEnWeer(900, 1140), 'Betriebshof Solo'),
    tour('D', 800, [{ tripFile: 'terug', profileIndex: 0, departure: -15 }, ...heenEnWeer(14, 480)], 'Betriebshof'),
    tour('E', 960, heenEnWeer(480, 1080), 'Betriebshof')
  ]
  const stops = new Map<string, { id: string; name: string }>()
  for (const r of RITTEN) for (const s of r.stops) stops.set(s.id, { id: s.id, name: s.name ?? s.id })
  return {
    folder: MAP,
    name: 'Proefstad',
    path: '/proefstad',
    stops,
    trips: new Map(RITTEN.map((r) => [r.file.toLowerCase(), r])),
    tours
  }
}

export function fixtureKalender(): Calendar {
  return { holidays: new Set([20160505]), breaks: [[20160516, 20160520]] }
}

export function fixtureConcessie(dag = 1): Concessie {
  return {
    mapFolder: MAP,
    mapName: 'Proefstad',
    lineFile: LIJN,
    lineNumbers: ['1'],
    omlopen: 5,
    ritten: 100,
    urenPerDag: 40,
    vanaf: dag,
    tot: dag + 27
  }
}

/**
 * Een bedrijf met één concessie, drie bussen (geleed, solo, en één in de
 * werkplaats), vijf chauffeurs (ervaring 10 tot 80, één ziek) en een monteur.
 */
export function fixtureBedrijf(): Bedrijf {
  const bus = (nummer: number, naam: string, vorm: EigenBus['vorm'], extra: Partial<EigenBus> = {}): EigenBus => ({
    nummer,
    relativePath: `Vehicles\\${naam}\\${naam}.bus`,
    naam,
    vorm,
    aankoop: 60_000_00,
    gekochtOp: 1,
    km: 10_000,
    staat: 90,
    schade: 0,
    ...extra
  })
  const mens = (id: number, rol: Medewerker['rol'], ervaring: number, extra: Partial<Medewerker> = {}): Medewerker => ({
    id,
    naam: `Medewerker ${id}`,
    rol,
    ervaring,
    loon: 230_00,
    tevredenheid: 60,
    sinds: 1,
    ...extra
  })
  return {
    ...richtBedrijfOp('Proefbedrijf', new Date(Date.UTC(2026, 0, 1))),
    concessies: [fixtureConcessie()],
    bussen: [bus(101, 'SG292', 'geleed'), bus(102, 'NL202', 'solo'), bus(103, 'O530', 'solo', { werkplaatsTot: 1 })],
    personeel: [
      mens(1, 'chauffeur', 10),
      mens(2, 'chauffeur', 30),
      mens(3, 'chauffeur', 50),
      mens(4, 'chauffeur', 70, { ziekTot: 2, ziekSinds: 1 }),
      mens(5, 'chauffeur', 80),
      mens(6, 'monteur', 40)
    ],
    ankers: { [MAP]: ANKER }
  }
}
