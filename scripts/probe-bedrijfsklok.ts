/**
 * De klok van de vlootkaart: wanneer telt de tijd van OMSI voor deze kaart?
 *
 *   npx tsx scripts/probe-bedrijfsklok.ts
 *
 * De gevallen komen uit de lokale meting op Lucs installatie (28-09-2026).
 */
import { bedrijfsklok, lijnSleutel, type KlokLive } from '../src/core/bedrijfsklok'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

// Op welke kaarten staat welke lijn (zoals kaartenMetLijn het teruggeeft).
const INDEX: Record<string, string[]> = {
  'addon tag und nacht li. 109': ['HafenCity', 'HamburgLi20'],
  alleenhier: ['HafenCity'],
  nachtnetz: ['Krefrath'],
  freitag: ['HafenCity']
}
const kaarten = (lijn: string): string[] => INDEX[lijnSleutel(lijn)] ?? []
const live = (lineName?: string, extra: Partial<KlokLive> = {}): KlokLive => ({
  time: 865.5 * 60,
  year: 2016,
  month: 4,
  day: 25,
  mem: { ok: 1, lineName },
  ...extra
})
const stand = (l: KlokLive | undefined, rit?: string, folder = 'HafenCity') => bedrijfsklok(l, folder, rit, kaarten)

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

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
