/**
 * Een gebouwde versie op GitHub zetten, zodat de automatische updater hem vindt.
 *
 *   node scripts/publiceer.cjs                          (uit %TEMP%\omsi-release)
 *   node scripts/publiceer.cjs <map>                    (een andere bouwmap)
 *   node scripts/publiceer.cjs <map> --notities tekst.md
 *
 * Eerst gewoon bouwen zoals in CLAUDE.md staat. Dit script bouwt niets: het
 * controleert dat de vier bestanden er zijn en bij de versie uit package.json
 * horen, en maakt dan met `gh` de release v<versie> in Luc-nbr/Omsi-career-addon
 * met OMSI-Enhancer-Setup.exe, de blockmap, latest.yml en
 * OMSI-Enhancer-draagbaar.exe. Een versie met een streepje (0.8.0-beta.1) wordt
 * een pre-release; die slaat de updater over.
 *
 * Pas na deze stap krijgen spelers met de geïnstalleerde versie de update:
 * binnen vier uur (of bij de volgende start) gedownload, en geïnstalleerd zodra
 * OMSI dicht is.
 */
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const REPO = 'Luc-nbr/Omsi-career-addon'
const versie = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version

const args = process.argv.slice(2)
const notitieIndex = args.indexOf('--notities')
const notities = notitieIndex >= 0 ? args[notitieIndex + 1] : undefined
const map = args.find((a, i) => !a.startsWith('--') && i !== notitieIndex + 1) ?? join(process.env.TEMP ?? tmpdir(), 'omsi-release')

function stop(tekst) {
  console.error(`publiceren gestopt: ${tekst}`)
  process.exit(1)
}

const bestanden = ['OMSI-Enhancer-Setup.exe', 'OMSI-Enhancer-Setup.exe.blockmap', 'latest.yml', 'OMSI-Enhancer-draagbaar.exe'].map(
  (naam) => join(map, naam)
)
for (const bestand of bestanden) if (!existsSync(bestand)) stop(`${bestand} ontbreekt; eerst bouwen (zie CLAUDE.md)`)

// latest.yml moet bij deze versie en bij deze Setup.exe horen, anders weigert de updater de download.
const yml = readFileSync(join(map, 'latest.yml'), 'utf8')
const ymlVersie = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim()
if (ymlVersie !== versie) stop(`latest.yml zegt ${ymlVersie}, package.json zegt ${versie}`)
if (!/^path:\s*OMSI-Enhancer-Setup\.exe\s*$/m.test(yml)) stop('latest.yml wijst niet naar OMSI-Enhancer-Setup.exe')
const sha = /^sha512:\s*(.+)$/m.exec(yml)?.[1]?.trim()
const echt = createHash('sha512').update(readFileSync(join(map, 'OMSI-Enhancer-Setup.exe'))).digest('base64')
if (sha !== echt) stop('de sha512 in latest.yml hoort niet bij OMSI-Enhancer-Setup.exe (een oude bouw?)')

const tag = `v${versie}`
const gh = ['release', 'create', tag, ...bestanden, '--repo', REPO, '--title', `OMSI Enhancer ${versie}`]
// De tag op de commit van deze bouw zetten, niet op origin/master: die tak wordt niet
// gepusht, en anders wees v0.7.1 eerst naar de broncode van 0.4.1. De commit moet wel
// op GitHub staan (push de tak eerst).
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
gh.push('--target', commit)
if (versie.includes('-')) gh.push('--prerelease')
if (notities) gh.push('--notes-file', notities)
else
  gh.push(
    '--notes',
    `OMSI Enhancer ${versie}.\n\n` +
      '**Download:** `OMSI-Enhancer-Setup.exe` (installer) of `OMSI-Enhancer-draagbaar.exe` (zonder installatie).\n\n' +
      'Wie de installer al gebruikt, krijgt deze versie vanzelf: hij wordt geïnstalleerd zodra OMSI dicht is.'
  )

console.log(`release ${tag} maken in ${REPO} met:\n  ${bestanden.join('\n  ')}`)
execFileSync('gh', gh, { stdio: 'inherit' })
console.log(`klaar: https://github.com/${REPO}/releases/tag/${tag}`)
