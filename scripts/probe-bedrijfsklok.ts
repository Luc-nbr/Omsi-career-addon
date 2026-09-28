/**
 * De klok van de vlootkaart: wanneer telt de tijd van OMSI voor deze kaart?
 *
 *   npx tsx scripts/probe-bedrijfsklok.ts
 *
 * De gevallen komen uit de lokale meting op Lucs installatie (28-09-2026).
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bedrijfsklok, lijnSleutel, type KlokLive, type LijnPlek } from '../src/core/bedrijfsklok'
import { maakKaartlaag } from '../src/core/kaartlaag'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

// Op welke kaarten staat welke lijn (zoals kaartenMetLijn het teruggeeft).
// HafenCity heeft 52 lijnen, HamburgLi20 49 (gemeten bij Luc).
const hc = (plek: number): LijnPlek => ({ folder: 'HafenCity', plek, lijnen: 52 })
const li20 = (plek: number): LijnPlek => ({ folder: 'HamburgLi20', plek, lijnen: 49 })
const INDEX: Record<string, LijnPlek[]> = {
  'addon tag und nacht li. 109': [hc(44), li20(41)],
  // Op beide kaarten op dezelfde plek: de plek helpt dan niet, de lengte wel.
  '1': [hc(0), li20(0)],
  // Tijdens de Dom schuift een chrono op HafenCity alles één op: 112 komt dan
  // op 11, precies de plek van 112 op Li20.
  '112': [hc(10), li20(11)],
  alleenhier: [hc(3)],
  nachtnetz: [{ folder: 'Krefrath', plek: 7, lijnen: 20 }],
  freitag: [hc(9)]
}
const kaarten = (lijn: string): LijnPlek[] => INDEX[lijnSleutel(lijn)] ?? []
const live = (lineName?: string, extra: Partial<KlokLive> = {}): KlokLive => ({
  time: 865.5 * 60,
  year: 2016,
  month: 4,
  day: 25,
  mem: { ok: 1, lineName },
  ...extra
})
const stand = (l: KlokLive | undefined, rit?: string, folder = 'HafenCity') => bedrijfsklok(l, folder, rit, kaarten)
const opPlek = (lineName: string, line: number, lines?: number): KlokLive =>
  live(lineName, { mem: { ok: 1, lineName, line, ...(lines === undefined ? {} : { lines }) } })
const is = (x: ReturnType<typeof stand>, klopt: boolean | 'geen'): boolean =>
  klopt === 'geen' ? x.bron === 'geen' : x.bron === 'omsi' && x.kaartKlopt === klopt

klopt('geen OMSI: geen', stand(undefined, 'HafenCity').bron === 'geen')
klopt('datum 0-00-00: geen', stand(live('alleenhier', { year: 0, month: 0, day: 0 })).bron === 'geen')
klopt('mem.ok=1 zonder lineName: geen crash', (() => { try { stand(live(undefined), 'HafenCity'); return true } catch { return false } })())
const uniek = stand(live('Alleenhier.ttl'))
klopt('lijn alleen op deze kaart: klopt', uniek.bron === 'omsi' && uniek.kaartKlopt)
klopt('en de datum en minuten', uniek.bron === 'omsi' && uniek.datum === '2016-04-25' && uniek.minuten === 865.5)
const vrijdag = stand(live('Freitag'))
klopt('lijnnaam zonder .ttl, zoals bij Luc: klopt', vrijdag.bron === 'omsi' && vrijdag.kaartKlopt)
const ander = stand(live('Addon Tag und Nacht Li. 109'), 'HamburgLi20')
klopt('lijn op twee kaarten, rit op de andere: kaartKlopt false', ander.bron === 'omsi' && !ander.kaartKlopt)
const zelf = stand(live('Addon Tag und Nacht Li. 109'), 'HafenCity')
klopt('lijn op twee kaarten, rit op deze: klopt', zelf.bron === 'omsi' && zelf.kaartKlopt)
klopt('lijn op twee kaarten, geen rit: geen', stand(live('Addon Tag und Nacht Li. 109')).bron === 'geen')
const nacht = stand(live('Nachtnetz'), 'HafenCity')
klopt('lijn niet op deze kaart wint van de rit in de app: false', nacht.bron === 'omsi' && !nacht.kaartKlopt)
const zonder = stand(live(''), 'HafenCity')
klopt('geen lijnnaam, rit op deze kaart: klopt', zonder.bron === 'omsi' && zonder.kaartKlopt)
const zonderAnder = stand(live(''), 'Krefrath')
klopt('geen lijnnaam, rit op een andere kaart: false', zonderAnder.bron === 'omsi' && !zonderAnder.kaartKlopt)
klopt('geen lijnnaam, geen rit: geen', stand(live('')).bron === 'geen')
klopt('mem.ok=0 telt de lijnnaam niet', stand(live('Nachtnetz', { mem: { ok: 0, lineName: 'Nachtnetz' } }), 'HafenCity').bron === 'omsi')
const onbekend = stand(live('Bestaatniet'), 'HafenCity')
klopt('onbekende lijn en een rit: de rit beslist', onbekend.bron === 'omsi' && onbekend.kaartKlopt)
klopt('onbekende lijn zonder rit: geen', stand(live('Bestaatniet')).bron === 'geen')

// A: de plek in OMSI's lijst gaat voor de rit in de app (die kan na een crash oud zijn).
klopt('109 op plek 41 (Li20) met een HafenCity-rit: false', is(stand(opPlek('Addon Tag und Nacht Li. 109', 41), 'HafenCity'), false))
klopt('109 op plek 44 (HafenCity) met een Li20-rit: klopt', is(stand(opPlek('Addon Tag und Nacht Li. 109', 44), 'HamburgLi20'), true))
klopt('109 op plek 44 zonder rit: klopt', is(stand(opPlek('Addon Tag und Nacht Li. 109', 44)), true))
klopt('109 op een plek die nergens past: de oude regels', is(stand(opPlek('Addon Tag und Nacht Li. 109', 12)), 'geen'))
klopt('lijn 1 op dezelfde plek op beide: de rit beslist', is(stand(opPlek('1', 0), 'HafenCity'), true) && is(stand(opPlek('1', 0)), 'geen'))
// De lengte van OMSI's lijst (plugin 14).
klopt('lijn 1 op plek 0 met 49 lijnen: Li20, ook met een oude HafenCity-rit', is(stand(opPlek('1', 0, 49), 'HafenCity'), false))
klopt('lijn 1 op plek 0 met 52 lijnen: HafenCity', is(stand(opPlek('1', 0, 52)), true))
klopt('109 op 44 met 52 lijnen: HafenCity', is(stand(opPlek('Addon Tag und Nacht Li. 109', 44, 52), 'HamburgLi20'), true))
klopt('Dom: 112 op 11 met 53 lijnen, HafenCity-rit: klopt (was false)', is(stand(opPlek('112', 11, 53), 'HafenCity'), true))
klopt('Dom zonder rit: geen, geen valse false', is(stand(opPlek('112', 11, 53)), 'geen'))
klopt('112 op 11 met 49 lijnen: echt Li20', is(stand(opPlek('112', 11, 49), 'HafenCity'), false))
klopt('oude plugin zonder lengte: de plek telt zoals voorheen', is(stand(opPlek('112', 11), 'HafenCity'), false))
klopt('lengte 0 telt als geen lengte', is(stand(opPlek('1', 0, 0)), 'geen'))
// B: kaartnamen zonder hoofdletters.
klopt('hafencity in kleine letters: klopt', is(stand(live('Alleenhier'), undefined, 'hafencity'), true))
klopt('rit in andere schrijfwijze telt ook', is(stand(live(''), 'HAFENCITY'), true))
// F: spatie voor .ttl.
klopt('"X .ttl" wordt "x"', lijnSleutel('X .ttl') === 'x' && lijnSleutel(' Lead.ttl') === 'lead')
// H: geen kaart gevraagd.
klopt('lege kaartnaam: geen', is(stand(live('Alleenhier'), 'HafenCity', ''), 'geen'))

/* C, D, G en de volgorde: de index van de kaartlaag op een nep-OMSI-map. */
{
  const omsi = mkdtempSync(join(tmpdir(), 'klok-'))
  const kaart = (naam: string, lijnen: string[]): void => {
    mkdirSync(join(omsi, 'maps', naam, 'TTData'), { recursive: true })
    for (const l of lijnen) writeFileSync(join(omsi, 'maps', naam, 'TTData', l), '')
  }
  kaart('A', ['b.ttl', 'A.ttl', '_x.ttl', 'Lead.ttl', ' Lead.ttl', 'notitie.txt', 'Z .TTL'])
  const laag = maakKaartlaag(omsi, join(omsi, 'data'))
  // De plek volgt readdir, zoals OMSI FindFirstFile volgt; hier (Linux) is dat een willekeurige volgorde.
  const volgorde = readdirSync(join(omsi, 'maps', 'A', 'TTData')).filter((n) => /\.ttl$/i.test(n))
  const a = laag.kaartenMetLijn('A')
  klopt('lijn gevonden, plek in de volgorde van readdir', a.length === 1 && a[0].folder === 'A' && a[0].plek === volgorde.indexOf('A.ttl'))
  klopt('ook voor _x', laag.kaartenMetLijn('_x')[0]?.plek === volgorde.indexOf('_x.ttl'))
  klopt('het aantal lijnen telt beide Leads mee (6 .ttl)', a[0].lijnen === 6)
  klopt('dezelfde sleutel twee keer op één kaart: één keer in de index', laag.kaartenMetLijn('lead').length === 1)
  klopt('.TTL met spatie ervoor telt mee', laag.kaartenMetLijn('z').length === 1)
  klopt('een .txt telt niet', laag.kaartenMetLijn('notitie').length === 0)
  // C: een kaart komt erbij terwijl de app draait.
  kaart('F', ['A.ttl'])
  klopt('een nieuwe kaart komt in de index', laag.kaartenMetLijn('A').length === 2)
  rmSync(omsi, { recursive: true, force: true })
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
