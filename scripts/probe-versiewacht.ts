/**
 * De wacht tegen oudere exe's, de regels zelf (zonder Electron).
 *
 *   npx tsx scripts/probe-versiewacht.ts      (PROEF_MAP=<map> voor een eigen werkmap)
 *
 * - versienummers als getallen: 0.4.10 komt na 0.4.9;
 * - noteren wie er schreef; de hoogste blijft staan als een oudere daarna
 *   "toch doorgaan" koos;
 * - een oudere versie ziet dat er een nieuwere schreef, een even nieuwe niet;
 * - (29-09) bij hetzelfde versienummer telt de bouw: een oudere bouw van 0.4.7
 *   ziet dat een nieuwere 0.4.7 schreef, maar niet bij dezelfde hash, een
 *   ontwikkelversie of een notitie zonder bouwtijd;
 * - de kopie om te bekijken neemt profielen en instellingen mee, maar niet de
 *   caches van Chromium, het logboek of de reservekopieën van add-ons;
 * - (29-09) in alleen-bekijken zet de knop voor de Game Bar niets in het
 *   register en start OMSI niet (dat gaat buiten `fs` om);
 * - de bouwstempel en de variant (setup, draagbaar, dev).
 *
 * Dat de app bij het starten meteen noteert, en wat er gebeurt als de kopie
 * niet lukt, staat in scripts/probe-versiestart.cjs; de echte app in
 * alleen-bekijken in scripts/probe-alleenbekijken.cjs.
 * Op d9eeeda faalt het deel over dezelfde versie en dat over het register.
 */
import childProcess from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchOmsi } from '../src/core/launch'
import { zetKnop } from '../src/core/overlayknop'
import * as veilig from '../src/core/veilig'
import * as wacht from '../src/core/versiewacht'
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
import { schrijfVeilig } from '../src/core/veilig'
import { allesOnder, einde, klopt, nepOmsi, proefMap, schrijf } from './proefhulp'

klopt('0.4.10 is nieuwer dan 0.4.9', vergelijkVersies('0.4.10', '0.4.9') === 1)
klopt('0.4.1 is ouder dan 0.4.9', vergelijkVersies('0.4.1', '0.4.9') === -1)
klopt('0.5 is 0.5.0', vergelijkVersies('0.5', '0.5.0') === 0)
klopt('een achtervoegsel telt niet', vergelijkVersies('0.4.9-beta', '0.4.9') === 0)

const map = proefMap('versiewacht')
const data = join(map, 'userdata')
const exe = (versie: string, hash?: string, gebouwd?: string, variant: wacht.Variant = 'setup'): wacht.Wie => ({
  versie,
  bouw: `bouw ${hash ?? '?'} · ${gebouwd ?? '?'} · ${variant}`,
  hash,
  gebouwd,
  variant
})
klopt('een lege map: geen nieuwere schrijver', nieuwereSchrijver(data, exe('0.4.1')) === undefined)

schrijfVeilig(join(data, 'profiles', 'p1.json'), '{"driver":"Proef"}')
noteerSchrijver(data, exe('0.4.9', 'abc1234', '2026-09-28T18:15:00.000Z'), new Date(2026, 8, 28, 20, 15))
const na = leesSchrijvers(data)
klopt(`0.4.9 noteert zich (${na?.hoogste.versie}, ${na?.hoogste.bouw})`, na?.hoogste.versie === '0.4.9' && na.laatst.versie === '0.4.9')

const nieuwer = nieuwereSchrijver(data, exe('0.4.1'))
klopt(`0.4.1 ziet "bijgewerkt door ${nieuwer?.versie}"`, nieuwer?.versie === '0.4.9' && nieuwer.bouw?.startsWith('bouw abc1234') === true)
klopt('0.4.9 zelf ziet niets', nieuwereSchrijver(data, exe('0.4.9', 'abc1234', '2026-09-28T18:15:00.000Z')) === undefined)
klopt('0.5.0 ziet niets', nieuwereSchrijver(data, exe('0.5.0')) === undefined)

noteerSchrijver(data, exe('0.4.1', '0000000', '2026-09-01T08:00:00.000Z', 'draagbaar'))
const daarna = leesSchrijvers(data)
klopt('na "toch doorgaan" met 0.4.1: laatst 0.4.1, hoogste blijft 0.4.9', daarna?.laatst.versie === '0.4.1' && daarna.hoogste.versie === '0.4.9')
klopt('dus de volgende start van 0.4.1 vraagt het weer', nieuwereSchrijver(data, exe('0.4.1'))?.versie === '0.4.9')
noteerSchrijver(data, exe('0.5.0'))
klopt('een nieuwere versie wordt de hoogste', leesSchrijvers(data)?.hoogste.versie === '0.5.0')

// ---- hetzelfde versienummer, een andere bouw ----
{
  const zelfde = join(map, 'zelfde-versie')
  const nieuw = exe('0.4.7', 'bbbbbbb', '2026-10-05T10:00:00.000Z', 'setup')
  const oud = exe('0.4.7', 'cd06dcd', '2026-09-28T19:00:00.000Z', 'draagbaar')
  noteerSchrijver(zelfde, nieuw)
  const w = nieuwereSchrijver(zelfde, oud)
  klopt(`zelfde versie: een oude draagbare 0.4.7 (28-09) na een setup 0.4.7 (05-10) wordt gewaarschuwd (${w?.bouw ?? 'geen waarschuwing'})`, w?.hash === 'bbbbbbb')
  klopt('zelfde versie: de nieuwe bouw zelf niet', nieuwereSchrijver(zelfde, nieuw) === undefined)
  klopt(
    'zelfde versie: niet bij dezelfde hash (twee keer gebouwd)',
    nieuwereSchrijver(zelfde, { ...oud, hash: 'bbbbbbb' }) === undefined
  )
  klopt('zelfde versie: niet als deze exe een ontwikkelversie is', nieuwereSchrijver(zelfde, { ...oud, variant: 'dev' }) === undefined)
  klopt('zelfde versie: niet zonder bouwtijd', nieuwereSchrijver(zelfde, { ...oud, gebouwd: undefined }) === undefined)
  // Daarna "toch doorgaan" met de oude: die noteert zich als laatste, de nieuwe blijft de hoogste.
  noteerSchrijver(zelfde, oud)
  klopt('zelfde versie: na "toch doorgaan" blijft de nieuwe bouw de hoogste', leesSchrijvers(zelfde)?.hoogste.hash === 'bbbbbbb')
  // Een ontwikkelversie die daarna schreef, wordt niet de hoogste en waarschuwt dus niemand.
  const dev = join(map, 'zelfde-dev')
  noteerSchrijver(dev, exe('0.4.7', 'ddddddd', '2026-10-09T10:00:00.000Z', 'dev'))
  klopt('zelfde versie: een notitie van een ontwikkelversie waarschuwt een gebouwde 0.4.7 niet', nieuwereSchrijver(dev, oud) === undefined)
}

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

// ---- alleen bekijken: ook niets buiten `fs` om ----
async function bekijkstand(): Promise<void> {
  /*
   * Geen enkel echt `reg add` of echte start: `execFileSync` en `spawn` worden
   * hier vervangen door iets dat alleen opschrijft wie er gevraagd werd. Zo
   * raakt de proef Lucs register ook niet als de wacht faalt.
   */
  const gevraagd: string[] = []
  const cp = childProcess as unknown as Record<string, unknown>
  const echt = { execFileSync: cp.execFileSync, spawn: cp.spawn }
  cp.execFileSync = (bestand: string, args: string[] = []) => {
    gevraagd.push(`${bestand} ${args.join(' ')}`)
    if (bestand === 'reg' && args[0] === 'query') throw new Error('geen register in de proef')
    /*
     * "Steam draait" zeggen: faalt de wacht (de oude code), dan stopt de
     * Steam-knop daar, vóór hij Steams echte localconfig.vdf leest of schrijft.
     */
    if (bestand === 'tasklist') return 'steam.exe 1234 Console 1 10.000 K'
    return ''
  }
  cp.spawn = (bestand: string) => {
    gevraagd.push(`spawn ${bestand}`)
    throw new Error('geen processen in de proef')
  }
  const zet = (veilig as Partial<typeof veilig>).zetBekijkstand
  try {
    zet?.(true)
    const gamebar = zetKnop('gamebar', true)
    klopt(`bekijken: de Game Bar-knop weigert (${JSON.stringify(gamebar)})`, gamebar.gelukt === false && (gamebar.reden as string) === 'bekijken')
    const steam = zetKnop('steam', false)
    klopt(`bekijken: de Steam-knop weigert (${JSON.stringify(steam)})`, steam.gelukt === false && (steam.reden as string) === 'bekijken')
    klopt(`bekijken: geen reg add gevraagd (${gevraagd.filter((g) => / add /.test(g)).join('; ') || 'geen'})`, !gevraagd.some((g) => g.startsWith('reg add')))
    const omsi = nepOmsi(join(map, 'bekijkstand'))
    let gestart = 0
    let uit: string
    try {
      uit = await launchOmsi(
        omsi,
        false,
        async () => {
          gestart++
        },
        async () => {
          gestart++
          return 'gestart'
        }
      )
    } catch (fout) {
      uit = `geweigerd (${(fout as NodeJS.ErrnoException).code})`
    }
    klopt(`bekijken: OMSI starten weigert (${uit}), niets gestart`, uit === 'geweigerd (EROFS)' && gestart === 0)
  } finally {
    zet?.(false)
    cp.execFileSync = echt.execFileSync
    cp.spawn = echt.spawn
  }
}

async function main(): Promise<void> {
  await bekijkstand()

  // Bouwstempel en variant.
  klopt('variant: niet ingepakt is dev', variantVan(false, {}) === 'dev')
  klopt('variant: ingepakt zonder PORTABLE_EXECUTABLE_DIR is setup', variantVan(true, {}) === 'setup')
  klopt('variant: met PORTABLE_EXECUTABLE_DIR is draagbaar', variantVan(true, { PORTABLE_EXECUTABLE_DIR: 'D:\\Spul' }) === 'draagbaar')
  klopt(
    `stempel: ${bouwstempel({ hash: '1a2b3c4', tijd: '2026-09-28 20:15' }, 'draagbaar')}`,
    bouwstempel({ hash: '1a2b3c4', tijd: '2026-09-28 20:15' }, 'draagbaar') === 'bouw 1a2b3c4 · 2026-09-28 20:15 · draagbaar'
  )
  einde()
}

void main()
