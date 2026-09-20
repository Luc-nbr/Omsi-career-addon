/**
 * Een versie uitgeven.
 *
 *   node scripts/uitgeven.mjs 0.2.0-beta.1
 *   node scripts/uitgeven.mjs 0.2.0-beta.1 --publiceer
 *   node scripts/uitgeven.mjs 0.2.0 --publiceer --notities pad/naar/tekst.md
 *   node scripts/uitgeven.mjs 0.2.0-beta.1 --publiceer --gewoon
 *
 * Zonder `--publiceer` blijft alles hier: het versienummer gaat in
 * `package.json`, beide installers worden gebouwd en in `release/` gezet, er
 * wordt een commit en een tag gemaakt, en verder niets. Pas met `--publiceer`
 * gaat er iets naar GitHub.
 *
 * Over de nummers. Een beta draagt zijn bestemming in de naam: `0.2.0-beta.1`
 * werkt toe naar `0.2.0`. Alles met een streepje erin wordt op GitHub als
 * pre-release gemarkeerd, en dat is de hele truc -- `releases/latest/download/`
 * slaat pre-releases over, dus de downloadlink in Discord blijft naar de laatste
 * stabiele versie wijzen, ook als er tien beta's achter staan.
 *
 * De bestanden in de release heten met opzet `OMSI-Enhancer-Setup.exe` zonder
 * versienummer. Daardoor blijft die ene link voor altijd goed; het versienummer
 * staat in de release zelf, en sinds kort ook in de app.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const GH = 'C:/Program Files/GitHub CLI/gh.exe'

const argumenten = process.argv.slice(2)
const versie = argumenten.find((arg) => !arg.startsWith('--'))
const publiceren = argumenten.includes('--publiceer')
/*
 * Een beta gaat standaard als pre-release de deur uit, zodat de downloadlink in
 * Discord op de laatste stabiele versie blijft staan. Met --gewoon geef je hem
 * uit als gewone release: dan is hij de nieuwste en krijgt iedereen die op die
 * link klikt deze versie. Dat kan een bewuste keuze zijn -- een beta die
 * crashes repareert is voor iedereen beter dan een stabiele versie die ze nog
 * heeft.
 */
const gewoon = argumenten.includes('--gewoon')
const notitieVlag = argumenten.indexOf('--notities')
const notitiesUit = notitieVlag >= 0 ? argumenten[notitieVlag + 1] : undefined

if (!versie || !/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/.test(versie)) {
  console.error('Gebruik: node scripts/uitgeven.mjs <versie> [--publiceer] [--notities <bestand>]')
  console.error('Bijvoorbeeld 0.2.0-beta.1 of 0.2.0.')
  process.exit(1)
}
const vooraf = versie.includes('-') && !gewoon
const tag = `v${versie}`

/** Een opdracht, met zijn uitvoer op het scherm. */
function draai(opdracht, args, opties = {}) {
  return execFileSync(opdracht, args, { cwd: WORTEL, encoding: 'utf8', ...opties })
}

function git(...args) {
  return draai('git', args).trim()
}

// ---- 1. schone werkmap, anders weet niemand wat er in de build zit ----
if (git('status', '--porcelain')) {
  console.error('Er staan nog wijzigingen open. Eerst vastleggen, dan uitgeven.')
  process.exit(1)
}
/*
 * De vorige tag, en met opzet niet die van deze uitgave: bij een tweede poging
 * hangt die er al, en dan zou de lijst met wijzigingen leeg zijn.
 */
const vorige = (() => {
  try {
    return git('describe', '--tags', '--abbrev=0', `--exclude=${tag}`)
  } catch {
    return ''
  }
})()

console.log(`${tag}${vooraf ? ' (pre-release)' : ''}, vorige was ${vorige || 'geen'}`)

// ---- 2. het nummer in package.json ----
const pakketPad = join(WORTEL, 'package.json')
const pakket = JSON.parse(readFileSync(pakketPad, 'utf8'))
const oudeVersie = pakket.version
/*
 * Opnieuw draaien mag. Een uitgave kan halverwege stranden -- een virusscanner
 * die een bestand vasthoudt, een build die faalt -- en dan moet je hem gewoon
 * nog eens kunnen starten zonder eerst met de hand op te ruimen.
 */
const alGezet = oudeVersie === versie
if (!alGezet) {
  pakket.version = versie
  writeFileSync(pakketPad, `${JSON.stringify(pakket, null, 2)}\n`, 'utf8')
}
console.log(alGezet ? `versie stond al op ${versie}` : `versie: ${oudeVersie} -> ${versie}`)

/*
 * ---- 2b. eerst kijken of GitHub ons kent ----
 *
 * Alleen als er ook werkelijk gepubliceerd gaat worden, en voor het bouwen: dat
 * duurt twee minuten, en het is zonde om die te draaien om daarna te horen dat
 * gh niet ingelogd is. Dat overkwam ons twee versies lang.
 *
 * gh bewaart zijn token in de Windows-sleutelring, en die is van de sessie waarin
 * je bent ingelogd. Een venster dat als administrator draait is een andere
 * sessie en ziet die token niet -- dan zegt gh dat je moet inloggen terwijl je
 * dat gewoon bent.
 */
if (publiceren) {
  try {
    draai(GH, ['auth', 'status'], { stdio: ['inherit', 'pipe', 'pipe'] })
  } catch (reden) {
    const bericht = `${String(reden.stdout ?? '')}${String(reden.stderr ?? '')}`.trim()
    console.error('GitHub kent dit venster niet:')
    console.error(bericht || '(gh zei niets)')
    console.error('')
    console.error('Drie dingen om na te gaan, in deze volgorde:')
    console.error('  1. Draait dit venster als administrator? Dan ziet gh de sleutelring')
    console.error('     niet. Open een gewoon venster en probeer het daar.')
    console.error('  2. Staat GH_TOKEN of GITHUB_TOKEN gezet maar leeg? Dan pakt gh die')
    console.error('     en negeert hij de sleutelring.')
    console.error('  3. Anders: gh auth login')
    console.error('')
    console.error('Er is nog niets gebouwd, dus dit kost je niets.')
    process.exit(1)
  }
  console.log('GitHub kent ons')
}

// ---- 3. bouwen, buiten het project om ----
const uit = mkdtempSync(join(tmpdir(), 'omsi-uitgave-'))
console.log('bouwen...')
draai('npx', ['electron-vite', 'build'], { stdio: 'inherit', shell: true })
draai('npx', ['electron-builder', `-c.directories.output=${uit}`], { stdio: 'inherit', shell: true })

// ---- 4. naar release/, en nakijken of het echt hetzelfde bestand is ----
const release = join(WORTEL, 'release')
const namen = [
  `OMSI Enhancer ${versie} Setup.exe`,
  `OMSI Enhancer ${versie} Setup.exe.blockmap`,
  `OMSI Enhancer ${versie} draagbaar.exe`
]
for (const naam of namen) {
  copyFileSync(join(uit, naam), join(release, naam))
  const a = readFileSync(join(uit, naam))
  const b = readFileSync(join(release, naam))
  if (!a.equals(b)) {
    console.error(`De kopie van ${naam} is niet gelijk aan de build.`)
    process.exit(1)
  }
}
console.log(`in release/: ${namen.join(', ')}`)

/*
 * Wat er van een oudere versie in release/ staat moet weg. Een installer die
 * ouder is dan de code heeft ooit een tweede overlay boven OMSI gehangen, en
 * dat wil je niet nog eens.
 */
for (const bestand of readdirSync(release)) {
  if (!/\.exe(\.blockmap)?$/i.test(bestand) || namen.includes(bestand)) continue
  try {
    rmSync(join(release, bestand))
    console.log(`   ouder weggehaald: ${bestand}`)
  } catch (reden) {
    /*
     * Defender houdt een verse installer regelmatig nog even vast. Dat is geen
     * reden om de uitgave af te breken -- het is een oud bestand dat niemand
     * meer gebruikt -- maar het hoort wel gezegd te worden.
     */
    console.log(`   ouder blijft staan (${(reden).code ?? 'in gebruik'}): ${bestand}`)
  }
}

// ---- 5. de twee bestanden met hun vaste naam, voor de link die nooit verandert ----
const assets = [
  { van: `OMSI Enhancer ${versie} Setup.exe`, naar: 'OMSI-Enhancer-Setup.exe' },
  { van: `OMSI Enhancer ${versie} draagbaar.exe`, naar: 'OMSI-Enhancer-draagbaar.exe' }
]
for (const asset of assets) copyFileSync(join(uit, asset.van), join(uit, asset.naar))

// ---- 6. vastleggen en van een tag voorzien ----
if (git('status', '--porcelain')) {
  git('add', 'package.json')
  git('commit', '-m', `Versie ${versie}`)
  console.log(`vastgelegd: Versie ${versie}`)
}
if (!git('tag', '--list', tag)) {
  git('tag', '-a', tag, '-m', `OMSI Enhancer ${versie}`)
  console.log(`getagd: ${tag}`)
} else {
  const waar = git('rev-list', '-n', '1', tag)
  console.log(
    waar === git('rev-parse', 'HEAD')
      ? `${tag} stond er al, op deze commit`
      : `LET OP: ${tag} wijst naar een andere commit`
  )
}

// ---- 7. de tekst bij de release ----
const notities =
  notitiesUit && !notitiesUit.startsWith('--')
    ? readFileSync(join(WORTEL, notitiesUit), 'utf8')
    : [
        vooraf
          ? 'Testversie. Fouten mogen -- daar is hij voor. Meld ze in #bug-reports.'
          : '',
        '',
        '### Wat er veranderd is',
        '',
        ...(vorige
          ? git('log', `${vorige}..HEAD`, '--pretty=- %s')
              .split('\n')
              .filter((regel) => regel && !regel.startsWith(`- Versie ${versie}`))
          : ['- Eerste versie.']),
        '',
        '**Download:** `OMSI-Enhancer-Setup.exe` (installer) of `OMSI-Enhancer-draagbaar.exe` (zonder installatie).',
        '',
        'Windows meldt bij het eerste starten dat de uitgever onbekend is, omdat de exe niet ondertekend is: Meer informatie -> Toch uitvoeren.'
      ]
        .join('\n')
        .trim()
const notitiePad = join(uit, 'notities.md')
writeFileSync(notitiePad, `${notities}\n`, 'utf8')

if (!publiceren) {
  console.log('')
  console.log('Klaar, en er is niets gepubliceerd. Wat er zou gebeuren met --publiceer:')
  console.log(`   gh release create ${tag}${vooraf ? ' --prerelease' : ''} met beide installers`)
  console.log(`   de tekst staat klaar in ${notitiePad}`)
  console.log('')
  console.log('Let op: publiceren vraagt dat de commits op GitHub staan (git push --follow-tags).')
  process.exit(0)
}

// ---- 8. publiceren ----
const lokaal = git('rev-parse', 'HEAD')
let opAfstand = ''
try {
  opAfstand = git('rev-parse', 'origin/master')
} catch {
  opAfstand = ''
}
if (lokaal !== opAfstand) {
  console.error('')
  console.error('De commits staan nog niet op GitHub, dus de release zou naar oude code wijzen.')
  console.error('Eerst:  git push --follow-tags')
  process.exit(1)
}

/*
 * De tag moet eerst op GitHub staan.
 *
 * Hier ging het mis, en niet alleen bij deze versie -- 0.2.0-beta.2 is om
 * dezelfde reden nooit verschenen. Het script maakte de tag netjes lokaal aan en
 * riep daarna `gh release create` aan met `--repo`. Met die vlag werkt gh puur op
 * de server en kent het je lokale git niet: wijst de tag daar nergens naar, dan
 * heeft het niets om een release aan te hangen en weigert het. De tag pushen
 * deed niemand, want het script noemde dat alleen in de tak waarin het juist
 * niet publiceert.
 */
const tagOpServer = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
if (!tagOpServer) {
  console.log(`${tag} staat nog niet op GitHub; pushen...`)
  draai('git', ['push', 'origin', tag], { stdio: 'inherit' })
} else {
  console.log(`${tag} staat al op GitHub`)
}

/*
 * De uitvoer van gh moet leesbaar blijven als het misgaat.
 *
 * Met stdio:'inherit' loopt alles rechtstreeks naar het scherm, maar bij een
 * fout gooit execFileSync er zijn eigen "Command failed:" met de hele opdracht
 * overheen -- en dan zie je wel het commando maar niet waarom het faalde. Nu
 * vangen we wat gh zelf te zeggen heeft en zetten dat vooraan.
 */
try {
  draai(GH, [
    'release',
    'create',
    tag,
    '--repo',
    'Luc-nbr/Omsi-career-addon',
    '--title',
    `OMSI Enhancer ${versie}`,
    '--notes-file',
    notitiePad,
    ...(vooraf ? ['--prerelease'] : []),
    join(uit, 'OMSI-Enhancer-Setup.exe'),
    join(uit, 'OMSI-Enhancer-draagbaar.exe')
  ], { stdio: ['inherit', 'inherit', 'pipe'] })
} catch (reden) {
  const bericht = String(reden.stderr ?? '').trim()
  console.error('')
  console.error('GitHub weigerde de release:')
  console.error(bericht || '(gh zei niets; kijk of gh auth status klopt)')
  console.error('')
  console.error('De build staat wel in release/ en de tag staat lokaal. Los dit op en')
  console.error(`draai dezelfde opdracht opnieuw; hij pakt ${tag} dan gewoon weer op.`)
  process.exit(1)
}

console.log('')
console.log(`gepubliceerd: https://github.com/Luc-nbr/Omsi-career-addon/releases/tag/${tag}`)
if (vooraf) {
  console.log('Als pre-release, dus de downloadlink in #announcements blijft op de vorige staan.')
}
