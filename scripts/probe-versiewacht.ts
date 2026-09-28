/**
 * De wacht tegen oudere exe's, de regels zelf (zonder Electron).
 *
 *   npx tsx scripts/probe-versiewacht.ts      (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * - versienummers als getallen: 0.4.10 komt na 0.4.9;
 * - de eerste opslag noteert wie er schreef; de hoogste versie blijft staan
 *   als een oudere daarna "toch doorgaan" koos;
 * - een oudere versie ziet dat er een nieuwere schreef, een even nieuwe niet;
 * - de kopie om te bekijken neemt profielen en instellingen mee, maar niet de
 *   caches van Chromium, het logboek of de reservekopieën van add-ons;
 * - de bouwstempel en de variant (setup, draagbaar, dev).
 *
 * De echte app in alleen-bekijken staat in scripts/probe-alleenbekijken.cjs.
 * Op de oude code (vóór 28-09) bestaat core/versiewacht.ts niet.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bouwstempel,
  kopieVoorBekijken,
  leesSchrijvers,
  nieuwereSchrijver,
  noteerSchrijver,
  SCHRIJVER_BESTAND,
  variantVan,
  vergelijkVersies
} from '../src/core/versiewacht'
import { schrijfVeilig, zetNaOpslaan } from '../src/core/veilig'
import { allesOnder, einde, klopt, proefMap, schrijf } from './proefhulp'

klopt('0.4.10 is nieuwer dan 0.4.9', vergelijkVersies('0.4.10', '0.4.9') === 1)
klopt('0.4.1 is ouder dan 0.4.9', vergelijkVersies('0.4.1', '0.4.9') === -1)
klopt('0.5 is 0.5.0', vergelijkVersies('0.5', '0.5.0') === 0)
klopt('een achtervoegsel telt niet', vergelijkVersies('0.4.9-beta', '0.4.9') === 0)

const map = proefMap('versiewacht')
const data = join(map, 'userdata')
klopt('een lege map: geen nieuwere schrijver', nieuwereSchrijver(data, '0.4.1') === undefined)

// De eerste opslag van 0.4.9 noteert zichzelf, via het haakje in schrijfVeilig.
let genoteerd = false
zetNaOpslaan((pad) => {
  if (genoteerd || !pad.startsWith(data)) return
  genoteerd = true
  noteerSchrijver(data, '0.4.9', 'bouw abc1234 · 2026-09-28 20:15 · setup', new Date(2026, 8, 28, 20, 15))
})
schrijfVeilig(join(data, 'profiles', 'p1.json'), '{"driver":"Proef"}')
zetNaOpslaan(undefined)
const na = leesSchrijvers(data)
klopt(`de eerste opslag noteert 0.4.9 (${na?.hoogste.versie}, ${na?.hoogste.bouw})`, na?.hoogste.versie === '0.4.9' && na.laatst.versie === '0.4.9')

const nieuwer = nieuwereSchrijver(data, '0.4.1')
klopt(`0.4.1 ziet "bijgewerkt door ${nieuwer?.versie}"`, nieuwer?.versie === '0.4.9' && nieuwer.bouw?.startsWith('bouw abc1234') === true)
klopt('0.4.9 zelf ziet niets', nieuwereSchrijver(data, '0.4.9') === undefined)
klopt('0.5.0 ziet niets', nieuwereSchrijver(data, '0.5.0') === undefined)

noteerSchrijver(data, '0.4.1', 'bouw 0000000 · 2026-09-01 10:00 · draagbaar')
const daarna = leesSchrijvers(data)
klopt('na "toch doorgaan" met 0.4.1: laatst 0.4.1, hoogste blijft 0.4.9', daarna?.laatst.versie === '0.4.1' && daarna.hoogste.versie === '0.4.9')
klopt('dus de volgende start van 0.4.1 vraagt het weer', nieuwereSchrijver(data, '0.4.1')?.versie === '0.4.9')
noteerSchrijver(data, '0.5.0')
klopt('een nieuwere versie wordt de hoogste', leesSchrijvers(data)?.hoogste.versie === '0.5.0')

// De kopie om te bekijken.
schrijf(data, 'settings.json', '{"language":"nl"}')
schrijf(data, 'kaartcache/HamburgLi20.json', '{}')
schrijf(data, 'logs/omsi-enhancer.log', 'regel')
schrijf(data, 'addon-reserve/x/groot.bin', 'reserve')
schrijf(data, 'GPUCache/data_0', 'chromium')
schrijf(data, 'Local Storage/leveldb/000003.log', 'chromium')
const kopie = join(map, 'bekijken')
kopieVoorBekijken(data, kopie)
const mee = allesOnder(kopie)
klopt(
  `kopie: profielen, instellingen, kaartcache, Local Storage en de notitie mee (${mee.join(', ')})`,
  ['profiles/p1.json', 'settings.json', 'kaartcache/HamburgLi20.json', 'Local Storage/leveldb/000003.log', SCHRIJVER_BESTAND].every((p) => mee.includes(p))
)
klopt('kopie: geen logboek, reserve of cache van Chromium', !mee.some((p) => /^(logs|addon-reserve|GPUCache)\//.test(p)))
klopt('kopie: het origineel is er nog', existsSync(join(data, 'profiles', 'p1.json')) && readFileSync(join(kopie, 'profiles', 'p1.json'), 'utf8') === '{"driver":"Proef"}')

// Bouwstempel en variant.
klopt('variant: niet ingepakt is dev', variantVan(false, {}) === 'dev')
klopt('variant: ingepakt zonder PORTABLE_EXECUTABLE_DIR is setup', variantVan(true, {}) === 'setup')
klopt('variant: met PORTABLE_EXECUTABLE_DIR is draagbaar', variantVan(true, { PORTABLE_EXECUTABLE_DIR: 'D:\\Spul' }) === 'draagbaar')
klopt(
  `stempel: ${bouwstempel({ hash: '1a2b3c4', tijd: '2026-09-28 20:15' }, 'draagbaar')}`,
  bouwstempel({ hash: '1a2b3c4', tijd: '2026-09-28 20:15' }, 'draagbaar') === 'bouw 1a2b3c4 · 2026-09-28 20:15 · draagbaar'
)

einde()
