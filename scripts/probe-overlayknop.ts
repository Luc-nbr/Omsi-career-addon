/**
 * Blijft Steams instellingenbestand heel als de app de overlay van OMSI omzet?
 *
 *   npx tsx scripts/probe-overlayknop.ts
 *
 * LEEST HET ECHTE BESTAND EN SCHRIJFT ER NIET IN. Deel 1 werkt op de tekst in
 * het geheugen. Deel 2 draait het echte `zetSteam` op kopieën in een tijdelijke
 * map; het register en tasklist zijn daar nagebootst, zodat de module zijn
 * Steam in die map vindt en denkt dat Steam niet draait.
 *
 * `localconfig.vdf` is het bestand waar Steam je hele bibliotheek in bijhoudt --
 * speeltijd, laatst gespeeld, opties per spel. De app raakt er één regel in aan,
 * of zet er het blok van OMSI bij, en daar hoort het bij te blijven.
 *
 * DE FUNCTIES KOMEN UIT DE MODULE ZELF.
 * De eerste versie van deze probe had ze overgeschreven, en dat bewijst niets:
 * een kopie kan kloppen terwijl het origineel iets anders doet. Precies dat
 * gebeurde ook -- de kopie leek in orde terwijl `zetVlag` in de module de sleutel
 * over het héle bestand zocht en dus bij iemand met meer spellen de vlag van het
 * verkeerde spel had omgezet. Daarna liep de probe nog `zetVlag` op beide vlaggen
 * na terwijl `zetSteam` er nog maar één omzette, en zag hij niet dat "uit" zonder
 * blok voor OMSI niets deed.
 *
 * Deel 1, het echte bestand in het geheugen:
 *   1. Uit en weer aan geeft byte voor byte het oorspronkelijke bestand terug.
 *   2. Eén omzetting verandert één cijfer, dat van OMSI; de algemene vlag blijft.
 *   3. Een blok dat ontbreekt komt er precies zo bij als Steam het schreef.
 *
 * Deel 2, `zetSteam` op drie accounts (met het blok van OMSI, zonder "252530",
 * zonder "apps"):
 *   4. Draait Steam, dan wordt er niets geschreven.
 *   5. Uit: alleen dat ene cijfer, of alleen het blok erbij; een kopie per account.
 *   6. Weer aan: het account met blok is byte voor byte terug.
 *   7. Een bestand op alleen-lezen: een nette fout, en geen account half omgezet.
 *
 * Deel 3, bestanden waar het eerder misging, elk met alleen zijn eigen accounts:
 *   8. Een vriend met '}' of '{' in zijn Steam-naam: het blok komt toch achteraan
 *      in UserLocalConfigStore, en niet ergens in friends.
 *   9. Geen enkele vlag, zoals bij Steam af fabriek: dat leest als aan, en ook
 *      naast een account dat hem voor alle spellen uit heeft.
 *  10. Een "Apps" met hoofdletter: daarin komt 252530, er komt geen tweede bij.
 *  11. Een bestand dat niet klopt: `geenblok`, en er verandert geen byte.
 */
import childProcess, { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startLogboek } from '../src/core/logboek'
import { draait, leesSteam, zetSteam, zetVlag, zoekBlok } from '../src/core/overlayknop'
import { zetKopieMap } from '../src/core/veilig'

function steamPad(): string | undefined {
  try {
    const uit = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const m = uit.match(/REG_\w+\s{2,}(.+?)\s*$/m)
    return m ? m[1].replace(/\//g, '\\') : undefined
  } catch {
    return undefined
  }
}

const pad = steamPad()
if (!pad) {
  console.error('Steam niet gevonden in het register.')
  process.exit(1)
}

const configs: string[] = []
const userdata = join(pad, 'userdata')
if (existsSync(userdata)) {
  for (const id of readdirSync(userdata)) {
    const cfg = join(userdata, id, 'config', 'localconfig.vdf')
    if (existsSync(cfg)) configs.push(cfg)
  }
}
if (configs.length === 0) {
  console.error('Geen localconfig.vdf gevonden.')
  process.exit(1)
}

/*
 * Dezelfde paden als de module aanhoudt. Ze staan hier uitgeschreven en niet
 * geimporteerd: als iemand ze in de module verandert, hoort deze probe te gaan
 * piepen in plaats van stilzwijgend mee te bewegen.
 */
const PAD_ALGEMEEN = ['UserLocalConfigStore', 'system'] as const
const PAD_APPS = ['UserLocalConfigStore', 'apps'] as const
const PAD_PER_SPEL = ['UserLocalConfigStore', 'apps', '252530'] as const

/** De inhoud van een blok, om er iets in op te zoeken. */
const inhoud = (t: string, pad: readonly string[]): string | undefined => {
  const span = zoekBlok(t, pad)
  return span ? t.slice(span.open, span.sluit + 1) : undefined
}

const algemeen = (t: string): string | undefined =>
  inhoud(t, PAD_ALGEMEEN)?.match(/"EnableGameOverlay"\s+"(\d)"/)?.[1]
const perSpel = (t: string): string | undefined =>
  inhoud(t, PAD_PER_SPEL)?.match(/"OverlayAppEnable"\s+"(\d)"/)?.[1]

/** Een blok met alles erop en eraan: van de regel met zijn sleutel tot na zijn sluitaccolade. */
function blokRegels(t: string, pad: readonly string[]): { begin: number; eind: number } | undefined {
  const span = zoekBlok(t, pad)
  if (!span) return undefined
  const sleutel = t.lastIndexOf(`"${pad[pad.length - 1]}"`, span.open)
  const na = t.indexOf('\n', span.sluit)
  return { begin: t.lastIndexOf('\n', sleutel) + 1, eind: na < 0 ? t.length : na + 1 }
}

function zonderBlok(t: string, pad: readonly string[]): string {
  const b = blokRegels(t, pad)
  return b ? t.slice(0, b.begin) + t.slice(b.eind) : t
}

/** Op welke plekken twee even lange teksten verschillen; `undefined` als de lengte al verschilt. */
function andereTekens(a: string, b: string): number[] | undefined {
  if (a.length !== b.length) return undefined
  const uit: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) uit.push(i)
  return uit
}

/**
 * Is `nieuw` precies `oud` met `erbij` ergens aan het begin van een regel
 * ingevoegd? Op de tekst zelf vergeleken en niet op een gemeenschappelijk begin
 * en eind: het blok begint met tabs, net als de regel waar het voor komt, en
 * dan schuift zo'n vergelijking een tab op.
 */
function alleenIngevoegd(oud: string, nieuw: string, erbij: string): boolean {
  for (let p = nieuw.indexOf(`\n${erbij}`); p >= 0; p = nieuw.indexOf(`\n${erbij}`, p + 1)) {
    if (nieuw.slice(0, p + 1) + nieuw.slice(p + 1 + erbij.length) === oud) return true
  }
  return false
}

let fouten = 0
function klopt(goed: boolean, tekst: string): void {
  console.log(`  ${goed ? 'ja ' : 'NEE'}  ${tekst}`)
  if (!goed) fouten++
}

/* ------------------------------------------------ deel 1: in het geheugen */

console.log('DEEL 1: de echte bestanden, alleen in het geheugen')
for (const cfg of configs) {
  const origineel = readFileSync(cfg, 'latin1')
  console.log(`\n${cfg}`)
  console.log(`  ${(origineel.length / 1024).toFixed(0)} kB, ${origineel.split('\n').length} regels`)
  const alg = algemeen(origineel)
  const spel = perSpel(origineel)
  console.log(
    `  nu: EnableGameOverlay=${alg ?? '(afwezig)'}  OverlayAppEnable=${spel ?? '(afwezig)'}`
  )
  if (spel === undefined) {
    console.log('  geen vlag van OMSI in dit bestand; het erbij zetten loopt deel 2 na')
    continue
  }

  // 1. Heen en terug, zoals `zetSteam` het doet: alleen de vlag van OMSI.
  const heen = zetVlag(origineel, PAD_PER_SPEL, 'OverlayAppEnable', spel !== '1')
  const terug = zetVlag(heen, PAD_PER_SPEL, 'OverlayAppEnable', spel === '1')
  klopt(terug === origineel, 'heen en terug is byte-identiek')

  // 2. Eén cijfer, in het blok van OMSI.
  const anders = andereTekens(origineel, heen)
  const span = zoekBlok(heen, PAD_PER_SPEL)
  klopt(
    anders?.length === 1 && span !== undefined && anders[0] > span.open && anders[0] < span.sluit,
    `één omzetting verandert ${anders ? anders.length : 'de lengte, en dus meer dan'} teken(s),` +
      ' in apps/252530'
  )
  klopt(algemeen(heen) === alg, 'de algemene vlag blijft zoals hij was')

  /*
   * 3. Het blok weghalen en de app het terug laten zetten. Schreef Steam in dit
   *    bestand niets anders in dat blok, en stond het achteraan, dan hoort er
   *    byte voor byte uit te komen wat Steam zelf had staan (met de vlag op 0).
   */
  const alsSteam = zetVlag(origineel, PAD_PER_SPEL, 'OverlayAppEnable', false)
  const alleenDeVlag = /^\{\s*"OverlayAppEnable"\s+"\d"\s*\}$/.test(
    inhoud(origineel, PAD_PER_SPEL) ?? ''
  )
  // Achteraan: na het blok komt meteen de sluitaccolade van het blok eromheen.
  const achteraan = (p: readonly string[]): boolean =>
    /^\t*\}/.test(alsSteam.slice(blokRegels(alsSteam, p)?.eind ?? 0))
  const zonder252530 = zonderBlok(alsSteam, PAD_PER_SPEL)
  const appsLeeg = /^\{\s*\}$/.test(inhoud(zonder252530, PAD_APPS) ?? '')
  const zonderApps = zonderBlok(alsSteam, PAD_APPS)
  const gevallen: Array<[string, string, boolean]> = [
    ['zonder "252530"', zonder252530, alleenDeVlag && achteraan(PAD_PER_SPEL)],
    ['zonder "apps"', zonderApps, alleenDeVlag && appsLeeg && achteraan(PAD_APPS)]
  ]
  for (const [naam, zonder, vergelijkbaar] of gevallen) {
    const terugGezet = zetVlag(zonder, PAD_PER_SPEL, 'OverlayAppEnable', false)
    if (vergelijkbaar) {
      klopt(terugGezet === alsSteam, `${naam}: terug zoals Steam het schreef, byte voor byte`)
    } else {
      console.log(`  --   ${naam}: Steam had hier meer in dat blok, of niet achteraan; zie deel 2`)
    }
  }
}

/* ------------------------------------------- deel 2: zetSteam op kopieën */

console.log('\nDEEL 2: zetSteam op kopieën in een tijdelijke map')
const werkmap = mkdtempSync(join(tmpdir(), 'omsi-overlayknop-'))
const nepSteam = join(werkmap, 'Steam')
const bron = readFileSync(configs[0], 'latin1')
const nl = bron.includes('\r\n') ? '\r\n' : '\n'

/*
 * Een gewone Steam: de overlay voor alle spellen aan en voor OMSI ook. Uit het
 * echte bestand, zodat de rest -- 90 kB bibliotheek, depots, de tweede "apps"
 * onder Software -- er ook in staat.
 */
const metBlok = zetVlag(
  zetVlag(bron, PAD_ALGEMEEN, 'EnableGameOverlay', true),
  PAD_PER_SPEL,
  'OverlayAppEnable',
  true
)
const blok = blokRegels(metBlok, PAD_PER_SPEL)
if (!blok) {
  console.error('Kon geen account met een blok voor OMSI maken.')
  process.exit(1)
}
const accounts: Array<{ id: string; naam: string; tekst: string }> = [
  { id: '100', naam: 'met blok', tekst: metBlok },
  // Een ander spel in apps, en OMSI niet: het blok komt ernaast, 440 blijft.
  {
    id: '200',
    naam: 'zonder "252530"',
    tekst: metBlok.slice(0, blok.begin) + metBlok.slice(blok.begin).replace('"252530"', '"440"')
  },
  { id: '300', naam: 'zonder "apps"', tekst: zonderBlok(metBlok, PAD_APPS) }
]
const cfgVan = (id: string): string => join(nepSteam, 'userdata', id, 'config', 'localconfig.vdf')
function zetKlaar(): void {
  for (const a of accounts) {
    mkdirSync(join(nepSteam, 'userdata', a.id, 'config'), { recursive: true })
    writeFileSync(cfgVan(a.id), a.tekst, 'latin1')
  }
}
zetKlaar()
zetKopieMap(join(werkmap, 'kopieen'))
startLogboek(werkmap, 'probe-overlayknop')

/*
 * Het register en tasklist nabootsen. De module haalt `execFileSync` bij elke
 * aanroep op, dus een vervanging op het moduleobject komt bij hem aan; voor het
 * geval de module als ES-module geladen is, ook `syncBuiltinESMExports`.
 */
const draaiend = new Set<string>()
const echt = childProcess.execFileSync
childProcess.execFileSync = ((bestand: string, args: readonly string[] = []) => {
  if (bestand === 'reg' && args[0] === 'query' && args.includes('SteamPath')) {
    const waarde = nepSteam.replace(/\\/g, '/')
    return `\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    ${waarde}\r\n\r\n`
  }
  if (bestand === 'tasklist') {
    const exe = /IMAGENAME eq (.+)$/.exec(args[1] ?? '')?.[1] ?? ''
    return draaiend.has(exe)
      ? `${exe}                  1234 Console                    1     50.000 K\r\n`
      : 'INFO: No tasks are running which match the specified criteria.\r\n'
  }
  throw new Error(`${bestand} hoort in deze probe niet te draaien`)
}) as typeof childProcess.execFileSync
syncBuiltinESMExports()

/*
 * Eerst nagaan dat de nabootsing aankomt. Anders leest de module het echte
 * register, en dan schrijft `zetSteam` hieronder in de echte bestanden van Steam.
 */
draaiend.add('probe-schildwacht.exe')
if (!draait('probe-schildwacht.exe')) {
  console.error('De nabootsing komt niet aan bij de module; gestopt zonder iets te schrijven.')
  process.exit(1)
}
draaiend.delete('probe-schildwacht.exe')
const voor = leesSteam()
if (voor.aan !== true || voor.belet !== undefined) {
  console.error(`De module leest niet de kopieën (${JSON.stringify(voor)}); gestopt.`)
  process.exit(1)
}
console.log(`  in ${nepSteam}`)
console.log(`  voor: ${JSON.stringify(voor)}`)

const lees = (id: string): string => readFileSync(cfgVan(id), 'latin1')
const allesZoalsKlaargezet = (): boolean => accounts.every((a) => lees(a.id) === a.tekst)

try {
  // 4. Steam draait.
  draaiend.add('steam.exe')
  const bijSteam = zetSteam(false)
  draaiend.delete('steam.exe')
  klopt(
    bijSteam.reden === 'steam' && allesZoalsKlaargezet(),
    `Steam draait: ${JSON.stringify(bijSteam)}, niets geschreven`
  )

  // 5. Uit.
  const uit = zetSteam(false)
  klopt(uit.gelukt && uit.aantal === 3, `uit: ${JSON.stringify(uit)}`)
  const verwacht252530 =
    `\t\t"252530"${nl}\t\t{${nl}\t\t\t"OverlayAppEnable"\t\t"0"${nl}\t\t}${nl}`
  const verwachtApps = `\t"apps"${nl}\t{${nl}${verwacht252530}\t}${nl}`
  for (const a of accounts) {
    const na = lees(a.id)
    let hoe: boolean
    if (a.id === '100') {
      const anders = andereTekens(a.tekst, na)
      hoe = anders?.length === 1 && a.tekst[anders[0]] === '1' && na[anders[0]] === '0'
    } else {
      hoe = alleenIngevoegd(a.tekst, na, a.id === '200' ? verwacht252530 : verwachtApps)
    }
    klopt(
      hoe && perSpel(na) === '0' && algemeen(na) === '1',
      `${a.naam}: ${a.id === '100' ? 'alleen dat ene cijfer' : 'alleen het blok erbij, zoals bij Steam'},` +
        ' OMSI 0, algemeen nog 1'
    )
    if (a.id === '200') {
      klopt(
        /"440"\s*\{\s*"OverlayAppEnable"\s+"1"/.test(na),
        `${a.naam}: het andere spel in apps is ongemoeid`
      )
    }
    const map = join(werkmap, 'kopieen')
    const eigen = readdirSync(map).find((m) => m.includes(`_userdata_${a.id}_config_`))
    const kopieen = eigen ? readdirSync(join(map, eigen)) : []
    klopt(
      kopieen.length === 1 && readFileSync(join(map, eigen!, kopieen[0]), 'latin1') === a.tekst,
      `${a.naam}: eerst een kopie van het bestand zoals het was`
    )
  }
  const naUit = leesSteam()
  klopt(naUit.aan === false && naUit.belet === undefined, `daarna gelezen: ${JSON.stringify(naUit)}`)

  // 6. Weer aan.
  const aan = zetSteam(true)
  klopt(aan.gelukt, `aan: ${JSON.stringify(aan)}`)
  klopt(lees('100') === accounts[0].tekst, 'met blok: byte voor byte terug')
  klopt(
    accounts.every((a) => perSpel(lees(a.id)) === '1' && algemeen(lees(a.id)) === '1'),
    'overal OMSI 1, algemeen 1'
  )
  const naAan = leesSteam()
  klopt(naAan.aan === true, `daarna gelezen: ${JSON.stringify(naAan)}`)

  /*
   * 7. Alleen-lezen, op het laatste account: 100 en 200 zijn dan al geschreven
   *    en moeten terug. Windows weigert het hernoemen over zo'n bestand.
   */
  zetKlaar()
  chmodSync(cfgVan('300'), 0o444)
  const vast = zetSteam(false)
  klopt(!vast.gelukt && vast.reden === 'schrijven', `alleen-lezen: ${JSON.stringify(vast)}`)
  klopt(allesZoalsKlaargezet(), 'alle drie de accounts staan weer zoals ze waren')
  const resten = accounts.flatMap((a) =>
    readdirSync(join(nepSteam, 'userdata', a.id, 'config')).filter((f) => f.endsWith('.bezig'))
  )
  klopt(resten.length === 0, `geen half geschreven bestanden achtergebleven (${resten.length})`)
  const logboek = readFileSync(join(werkmap, 'logs', 'omsi-enhancer.log'), 'utf8')
  klopt(logboek.includes('FOUT  Steam-instellingen schrijven'), 'de fout staat in het logboek')

  /* ------------------------------------ deel 3: waar het eerder misging */

  console.log('\nDEEL 3: bestanden waar het eerder misging')
  chmodSync(cfgVan('300'), 0o666)

  /*
   * Alleen deze accounts in de nagebootste Steam. Elk geval krijgt eigen id's,
   * zodat de kopieën van het ene geval niet voor die van het andere tellen.
   */
  const alleen = (lijst: Array<{ id: string; tekst: string }>): void => {
    rmSync(join(nepSteam, 'userdata'), { recursive: true, force: true })
    for (const a of lijst) {
      mkdirSync(join(nepSteam, 'userdata', a.id, 'config'), { recursive: true })
      writeFileSync(cfgVan(a.id), a.tekst, 'latin1')
    }
  }
  const kopieenVan = (id: string): string[] => {
    const map = join(werkmap, 'kopieen')
    const eigen = readdirSync(map).find((m) => m.includes(`_userdata_${id}_config_`))
    return eigen ? readdirSync(join(map, eigen)) : []
  }

  /*
   * Waar het blok hoort, uitgerekend zonder `zoekBlok`: anders rekent de probe
   * met dezelfde fout als de module. UserLocalConfigStore sluit op de laatste
   * regel die met '}' begint; een blok één niveau dieper op de eerste regel na
   * zijn sleutel met precies één tab en '}'.
   */
  const wortelEind = (t: string): number => t.lastIndexOf(`${nl}}`) + nl.length
  const eindVan = (t: string, sleutelregel: RegExp): number => {
    const sleutel = t.search(sleutelregel)
    return t.indexOf(`${nl}\t}${nl}`, sleutel) + nl.length
  }
  const ingevoegd = (t: string, p: number, erbij: string): string => t.slice(0, p) + erbij + t.slice(p)

  /*
   * De Steam-naam van de eerste vriend met iets erachter. Wie geen vrienden in
   * zijn bestand heeft, krijgt er vooraan in UserLocalConfigStore een bij.
   */
  const metVriendnaam = (t: string, erbij: string): string => {
    const naam = /^(\t\t\t"name"\t\t"(?:[^"\\]|\\.)*)"/m
    if (naam.test(t)) return t.replace(naam, `$1${erbij}"`)
    const open = t.indexOf('{') + 1
    const vriend = [`\t"friends"`, '\t{', '\t\t"1"', '\t\t{', `\t\t\t"name"\t\t"x${erbij}"`, '\t\t}', '\t}']
    return t.slice(0, open) + vriend.map((r) => nl + r).join('') + t.slice(open)
  }

  // 8. Een accolade in de naam van een vriend; `\"` is hoe Steam een aanhalingsteken erin schrijft.
  const zonderApps = accounts[2].tekst
  const vrienden: Array<{ id: string; naam: string; tekst: string }> = [
    { id: '400', naam: '"}" in een naam, zonder "apps"', tekst: metVriendnaam(zonderApps, ' \\"}\\" :}') },
    { id: '450', naam: '"}" in een naam, met blok', tekst: metVriendnaam(metBlok, ' \\"}\\" :}') },
    { id: '500', naam: '"{" in een naam, zonder "apps"', tekst: metVriendnaam(zonderApps, ' :{') }
  ]
  alleen(vrienden)
  const vriendUit = zetSteam(false)
  klopt(vriendUit.gelukt && vriendUit.aantal === 3, `vriendennamen, uit: ${JSON.stringify(vriendUit)}`)
  for (const a of vrienden) {
    const na = lees(a.id)
    const anders = andereTekens(a.tekst, na)
    klopt(
      a.id === '450'
        ? anders?.length === 1 && a.tekst[anders[0]] === '1' && na[anders[0]] === '0'
        : na === ingevoegd(a.tekst, wortelEind(a.tekst), verwachtApps),
      `${a.naam}: ${a.id === '450' ? 'alleen dat ene cijfer' : 'het blok achteraan in UserLocalConfigStore'}`
    )
  }
  const vriendGelezen = leesSteam()
  klopt(vriendGelezen.aan === false, `vriendennamen, daarna gelezen: ${JSON.stringify(vriendGelezen)}`)

  // 9. Geen enkele vlag: Steam schrijft ze pas als iemand de schakelaar omzet.
  const geenVlag = zonderApps.replace(/\t\t"EnableGameOverlay"\t\t"\d"\r?\n/, '')
  if (/EnableGameOverlay|OverlayAppEnable/i.test(geenVlag)) {
    console.error('Kon geen bestand zonder vlaggen maken.')
    process.exit(1)
  }
  alleen([{ id: '600', tekst: geenVlag }])
  const geenGelezen = leesSteam()
  klopt(
    JSON.stringify(geenGelezen) === '{"aan":true}',
    `zonder vlaggen gelezen: ${JSON.stringify(geenGelezen)}, aan en met knop`
  )
  const geenUit = zetSteam(false)
  klopt(
    geenUit.gelukt && geenUit.aantal === 1 &&
      lees('600') === ingevoegd(geenVlag, wortelEind(geenVlag), verwachtApps),
    `zonder vlaggen, uit: ${JSON.stringify(geenUit)}, het blok achteraan`
  )
  const geenNa = leesSteam()
  klopt(geenNa.aan === false, `zonder vlaggen, daarna gelezen: ${JSON.stringify(geenNa)}`)
  alleen([
    { id: '600', tekst: geenVlag },
    { id: '700', tekst: zetVlag(metBlok, PAD_ALGEMEEN, 'EnableGameOverlay', false) }
  ])
  const samen = leesSteam()
  klopt(
    JSON.stringify(samen) === '{"aan":true}',
    `zonder vlaggen naast "alle spellen uit": ${JSON.stringify(samen)}, aan`
  )

  // 10. Hoofdletters: Steam leest "Apps" als "apps".
  const grootApps = accounts[1].tekst.replace(/^\t"apps"(\r?\n)/m, '\t"Apps"$1')
  const kleineVlag = metBlok.replace('"OverlayAppEnable"', '"overlayappenable"')
  if (!/^\t"Apps"\r?$/m.test(grootApps) || !kleineVlag.includes('"overlayappenable"')) {
    console.error('Kon de gevallen met hoofdletters niet maken.')
    process.exit(1)
  }
  alleen([
    { id: '800', tekst: grootApps },
    { id: '850', tekst: kleineVlag }
  ])
  const grootUit = zetSteam(false)
  klopt(grootUit.gelukt && grootUit.aantal === 2, `hoofdletters, uit: ${JSON.stringify(grootUit)}`)
  const grootNa = lees('800')
  klopt(
    grootNa === ingevoegd(grootApps, eindVan(grootApps, /^\t"Apps"\r?$/m), verwacht252530) &&
      (grootNa.match(/^\t"apps"\r?$/gim) ?? []).length === 1,
    '"Apps": 252530 erin, en geen tweede "apps" ernaast'
  )
  const kleinAnders = andereTekens(kleineVlag, lees('850'))
  klopt(
    kleinAnders?.length === 1 && lees('850')[kleinAnders[0]] === '0',
    '"overlayappenable": alleen dat ene cijfer, geen tweede vlag'
  )
  const grootGelezen = leesSteam()
  klopt(grootGelezen.aan === false, `hoofdletters, daarna gelezen: ${JSON.stringify(grootGelezen)}`)

  /*
   * 11. Niet in Steams vorm: de sluitaccolade van UserLocalConfigStore een tab
   *     te diep, en een naam met een aanhalingsteken zonder backslash, waarna
   *     de rest van de regel buiten een tekst valt.
   */
  const scheef = ingevoegd(zonderApps, wortelEind(zonderApps), '\t')
  const los = metVriendnaam(zonderApps, '"x')
  const krom = [
    { id: '900', tekst: scheef },
    { id: '950', tekst: los }
  ]
  alleen(krom)
  const kromUit = zetSteam(false)
  klopt(
    !kromUit.gelukt && kromUit.reden === 'geenblok' && kromUit.aantal === 0,
    `niet in Steams vorm, uit: ${JSON.stringify(kromUit)}`
  )
  klopt(
    krom.every((a) => lees(a.id) === a.tekst && kopieenVan(a.id).length === 0),
    'niet in Steams vorm: geen byte veranderd, en dus ook geen kopie'
  )
} finally {
  childProcess.execFileSync = echt
  syncBuiltinESMExports()
  try {
    chmodSync(cfgVan('300'), 0o666)
  } catch {
    // Dan staat hij er niet; niets om vrij te geven.
  }
}

console.log(`\nkopieën en logboek in ${werkmap}`)
console.log(fouten === 0 ? 'alles klopt' : `${fouten} ding(en) niet in orde`)
process.exit(fouten === 0 ? 0 : 1)
