/**
 * Elke lijn één keer: klopt de groepering, de vereenvoudiging en het knippen?
 * (src/renderer/src/trajecten.ts, src/shared/traject.ts)
 *
 *   npx tsx scripts/probe-trajecten.ts [kaart ...]
 *
 * Luc, over 0.4.8: "in vrij rijden gaat hij in de app alle lijnen tekenen dat
 * voor extreem veel lag zorgt, elke lijn wordt maximaal 1 keer getekend". De
 * kaart tekent nu per traject in plaats van per rit. Deze proef loopt dat na
 * op de langste omloop van elke kaart, met de echte routes (kaartlaag, zoals
 * de werker ze geeft) en de echte haltes:
 * - elke rit met een lijn zit in precies één traject, en de ritten van één
 *   traject hebben precies dezelfde lijn; twee trajecten nooit dezelfde;
 * - niet meer trajecten dan verschillende ritten (bestand + haltes);
 * - `uniekeRitten` zet elke rit terug op zijn eigen route;
 * - Douglas-Peucker: begin en eind blijven, en geen punt van de lijn ligt
 *   verder dan de drempel van de vereenvoudigde lijn;
 * - `schermPad`: met de hele omloop in beeld één doorlopend pad per stuk (geen
 *   knip), en ingezoomd geen lijnstuk dat helemaal aan één kant buiten beeld
 *   ligt, met minder punten dan de hele lijn.
 *
 * Leest de kaartcache van de app als kopie in een tijdelijke map; schrijft
 * niets in de OMSI-map of in de gebruikersmap van de app.
 */
import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOmsiInstall } from '../src/core/install'
import { maakKaartlaag } from '../src/core/kaartlaag'
import { listMaps } from '../src/core/timetable'
import { ritSleutel, uniekeRitten } from '../src/shared/traject'
import { douglasPeucker, schermPad, trajectenVan, vereenvoudigd, type Beeld } from '../src/renderer/src/trajecten'

const omsi = findOmsiInstall()
if (!omsi) {
  console.log('Geen OMSI 2 gevonden; proef overgeslagen.')
  process.exit(0)
}
const alleen = process.argv.slice(2)
const werk = mkdtempSync(join(tmpdir(), 'omsi-trajecten-'))
const cache = join(process.env.APPDATA ?? '', 'omsi-enhancer', 'kaartcache')
if (existsSync(cache)) cpSync(cache, join(werk, 'userdata', 'kaartcache'), { recursive: true })
const laag = maakKaartlaag(omsi, join(werk, 'userdata'))

let fouten = 0
const meld = (tekst: string): void => {
  fouten++
  console.log(`  FOUT ${tekst}`)
}

/** Afstand van een punt tot het lijnstuk a-b. */
function afstand(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(ax + dx * t - px, ay + dy * t - py)
}

/** Ligt elk punt van `p` binnen `drempel` van de lijn `q`? Geeft de grootste afwijking. */
function grootsteAfwijking(p: number[], q: number[]): number {
  let grootst = 0
  for (let i = 0; i < p.length; i += 2) {
    let best = Infinity
    for (let j = 2; j < q.length; j += 2) best = Math.min(best, afstand(p[i], p[i + 1], q[j - 2], q[j - 1], q[j], q[j + 1]))
    grootst = Math.max(grootst, best)
  }
  return grootst
}

/** De punten van een SVG-pad uit `schermPad`, per subpad. */
function subpaden(d: string): number[][][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((stuk) => stuk.split('L').map((p) => p.split(',').map(Number)))
}

const totaal = { ritten: 0, sleutels: 0, trajecten: 0, puntenPerRit: 0, puntenUniek: 0, puntenBeeld: 0 }
for (const folder of listMaps(omsi)) {
  if (alleen.length > 0 && !alleen.some((a) => folder.toLowerCase().includes(a.toLowerCase()))) continue
  let kaart
  try {
    kaart = laag.map(folder)
  } catch {
    continue
  }
  const omloop = [...kaart.tours]
    .map((t) => ({ t, ritten: t.trips.filter((e) => kaart.trips.has(e.tripFile.toLowerCase())) }))
    .sort((a, b) => b.ritten.length - a.ritten.length)[0]
  if (!omloop || omloop.ritten.length < 2) continue
  let geometrie
  try {
    geometrie = laag.geometrie(folder)
  } catch {
    continue
  }
  if (geometrie.stops.length === 0) continue
  const legs = omloop.ritten.map((e) => {
    const rit = kaart.trips.get(e.tripFile.toLowerCase())!
    return { tripFile: rit.file, stopIds: rit.stops.map((s) => s.id) }
  })
  const begin = performance.now()
  const routes = laag.routes(folder, legs)
  const ms = performance.now() - begin

  const { uniek, plek } = uniekeRitten(legs)
  if (plek.some((i, rit) => ritSleutel(uniek[i]) !== ritSleutel(legs[rit]))) meld(`${folder}: uniekeRitten wijst een rit naar een andere`)

  const opId = new Map(geometrie.stops.map((s) => [s.id, s]))
  const haltes = legs.map((leg) => leg.stopIds.map((id) => opId.get(id)).filter((s) => s !== undefined))
  const trajecten = trajectenVan(haltes, routes)

  /* Elke rit met een lijn in precies één traject, en een traject is één lijn. */
  const lijnVan = (rit: number): number[] =>
    routes[rit] && routes[rit].points.length >= 4 ? routes[rit].points : haltes[rit].flatMap((h) => [h.x, h.y])
  const gok = (rit: number): string => (routes[rit]?.points.length >= 4 ? routes[rit].guessed.map((g) => (g ? 1 : 0)).join('') : '')
  const gezien = new Map<number, number>()
  trajecten.forEach((t, i) => {
    for (const rit of t.ritten) {
      if (gezien.has(rit)) meld(`${folder}: rit ${rit} in twee trajecten`)
      gezien.set(rit, i)
    }
    const eerste = lijnVan(t.ritten[0])
    for (const rit of t.ritten.slice(1)) {
      const lijn = lijnVan(rit)
      if (lijn.length !== eerste.length || lijn.some((v, k) => Math.abs(v - eerste[k]) > 0.005) || gok(rit) !== gok(t.ritten[0])) {
        meld(`${folder}: rit ${rit} in traject ${i} heeft een andere lijn`)
      }
    }
  })
  legs.forEach((_leg, rit) => {
    if (lijnVan(rit).length >= 4 && !gezien.has(rit)) meld(`${folder}: rit ${rit} staat in geen traject`)
  })
  for (let a = 0; a < trajecten.length; a++) {
    for (let b = a + 1; b < trajecten.length; b++) {
      const la = lijnVan(trajecten[a].ritten[0])
      const lb = lijnVan(trajecten[b].ritten[0])
      if (la.length === lb.length && la.every((v, k) => Math.abs(v - lb[k]) <= 0.005) && gok(trajecten[a].ritten[0]) === gok(trajecten[b].ritten[0])) {
        meld(`${folder}: traject ${a} en ${b} zijn dezelfde lijn`)
      }
    }
  }
  if (trajecten.length > uniek.length) meld(`${folder}: ${trajecten.length} trajecten bij ${uniek.length} verschillende ritten`)

  /* Het beeld van de hele omloop, zoals de kaart hem inpast. */
  const alle = trajecten.flatMap((t) => [...t.heel, ...t.gok])
  const xs = alle.flatMap((s) => s.punten.filter((_v, k) => k % 2 === 0))
  const ys = alle.flatMap((s) => s.punten.filter((_v, k) => k % 2 === 1))
  const w = 1340
  const h = 860
  const heel: Beeld = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    mpp: Math.max((Math.max(...xs) - Math.min(...xs)) / (w - 80), (Math.max(...ys) - Math.min(...ys)) / (h - 80), 0.2),
    rot: 0,
    w,
    h
  }
  let puntenBeeld = 0
  for (const stuk of alle) {
    /* Douglas-Peucker op de drempel van dit beeld, en op een paar vaste drempels. */
    for (const drempel of [0.1, 1.6, heel.mpp / 2]) {
      const q = douglasPeucker(stuk.punten, drempel)
      if (q[0] !== stuk.punten[0] || q[q.length - 1] !== stuk.punten[stuk.punten.length - 1]) meld(`${folder}: vereenvoudiging verloor begin of eind`)
      const af = grootsteAfwijking(stuk.punten, q)
      if (af > drempel + 1e-6) meld(`${folder}: vereenvoudiging wijkt ${af.toFixed(2)} m af bij drempel ${drempel.toFixed(2)}`)
    }
    const d = schermPad(vereenvoudigd(stuk.punten, heel.mpp), heel)
    const delen = subpaden(d)
    if (delen.length !== 1) meld(`${folder}: met alles in beeld ${delen.length} subpaden`)
    puntenBeeld += delen.reduce((s, p) => s + p.length, 0)

    /* Ingezoomd op het midden van dit stuk: niets dat helemaal buiten beeld ligt. */
    const m = Math.floor(stuk.punten.length / 4) * 2
    const dicht: Beeld = { cx: stuk.punten[m], cy: stuk.punten[m + 1], mpp: 0.3, rot: 35, w: 400, h: 300 }
    const dd = schermPad(vereenvoudigd(stuk.punten, dicht.mpp), dicht)
    let buiten = 0
    let punten = 0
    for (const sub of subpaden(dd)) {
      punten += sub.length
      for (let k = 1; k < sub.length; k++) {
        const [ax, ay] = sub[k - 1]
        const [bx, by] = sub[k]
        const marge = 24.2
        if ((ax < -marge && bx < -marge) || (ax > 400 + marge && bx > 400 + marge) || (ay < -marge && by < -marge) || (ay > 300 + marge && by > 300 + marge)) buiten++
      }
    }
    if (buiten > 0) meld(`${folder}: ingezoomd ${buiten} lijnstuk(ken) helemaal buiten beeld`)
    if (stuk.lengte > 600 && punten >= stuk.punten.length / 2) meld(`${folder}: ingezoomd niets weggelaten (${punten} van ${stuk.punten.length / 2})`)
  }

  const perRit = routes.reduce((s, r) => s + r.points.length / 2, 0)
  const uniekPunten = trajecten.reduce((s, t) => s + [...t.heel, ...t.gok].reduce((a, st) => a + st.punten.length / 2, 0), 0)
  totaal.ritten += legs.length
  totaal.sleutels += uniek.length
  totaal.trajecten += trajecten.length
  totaal.puntenPerRit += perRit
  totaal.puntenUniek += uniekPunten
  totaal.puntenBeeld += puntenBeeld
  console.log(
    `${folder}: ${omloop.t.lineFile}/${omloop.t.number}, ${legs.length} ritten, ${uniek.length} verschillend, ${trajecten.length} trajecten; ` +
      `punten per rit ${perRit}, per traject ${Math.round(uniekPunten)}, in beeld ${puntenBeeld} (${heel.mpp.toFixed(1)} m/pt); routes ${Math.round(ms)} ms`
  )
}
console.log(
  `\nsamen: ${totaal.ritten} ritten, ${totaal.sleutels} verschillend, ${totaal.trajecten} trajecten; ` +
    `punten per rit ${totaal.puntenPerRit}, per traject ${Math.round(totaal.puntenUniek)}, in beeld ${totaal.puntenBeeld}`
)
console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
