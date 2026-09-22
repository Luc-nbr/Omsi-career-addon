/**
 * Blijft Steams instellingenbestand heel als de app er een vlag in omzet?
 *
 *   npx tsx scripts/probe-overlayknop.ts
 *
 * LEEST HET ECHTE BESTAND EN SCHRIJFT ER NIET IN. Alle bewerkingen gebeuren op
 * de tekst in het geheugen; wat eruit komt gaat naar een tijdelijke map.
 *
 * `localconfig.vdf` is het bestand waar Steam je hele bibliotheek in bijhoudt --
 * speeltijd, laatst gespeeld, opties per spel. De app raakt er één of twee
 * regels in aan, en daar hoort het bij te blijven.
 *
 * DE FUNCTIES KOMEN UIT DE MODULE ZELF.
 * De eerste versie van deze probe had ze overgeschreven, en dat bewijst niets:
 * een kopie kan kloppen terwijl het origineel iets anders doet. Precies dat
 * gebeurde ook -- de kopie leek in orde terwijl `zetVlag` in de module de sleutel
 * over het héle bestand zocht en dus bij iemand met meer spellen de vlag van het
 * verkeerde spel had omgezet.
 *
 * Drie dingen worden nagerekend:
 *   1. Uit en weer aan geeft byte voor byte het oorspronkelijke bestand terug.
 *   2. Eén omzetting raakt alleen de regels die de vlaggen dragen.
 *   3. Een vlag die ontbreekt komt in het goede blok te staan, en nergens anders.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zoekBlok, zetVlag } from '../src/core/overlayknop'

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
const PAD_PER_SPEL = ['UserLocalConfigStore', 'apps', '252530'] as const

/** Beide vlaggen in één keer, zoals `zetSteam` het doet. */
const zetBeide = (t: string, aan: boolean): string => {
  let uit = zetVlag(t, PAD_ALGEMEEN, 'EnableGameOverlay', aan)
  if (zoekBlok(uit, PAD_PER_SPEL)) uit = zetVlag(uit, PAD_PER_SPEL, 'OverlayAppEnable', aan)
  return uit
}

/** De inhoud van een blok, om er iets in op te zoeken. */
const inhoud = (t: string, pad: readonly string[]): string | undefined => {
  const span = zoekBlok(t, pad)
  return span ? t.slice(span.open, span.sluit + 1) : undefined
}

/**
 * Welke regels verschillen. Bij het invoegen van een regel schuift alles erna
 * op, dus dan telt niet het aantal maar of de inhoud verder gelijk blijft;
 * daarom wordt er ook op de gesorteerde inhoud vergeleken.
 */
function verschillen(a: string, b: string): string[] {
  const ra = a.split('\n')
  const rb = b.split('\n')
  const uit: string[] = []
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    if (ra[i] !== rb[i]) {
      uit.push(`  regel ${i + 1}: "${(ra[i] ?? '').trim()}" -> "${(rb[i] ?? '').trim()}"`)
    }
  }
  return uit
}

const werkmap = mkdtempSync(join(tmpdir(), 'omsi-overlayknop-'))
let fouten = 0

for (const cfg of configs) {
  const origineel = readFileSync(cfg, 'latin1')
  console.log(`\n${cfg}`)
  console.log(`  ${(origineel.length / 1024).toFixed(0)} kB, ${origineel.split('\n').length} regels`)

  const alg = inhoud(origineel, PAD_ALGEMEEN)?.match(/"EnableGameOverlay"\s+"(\d)"/)?.[1]
  const spel = inhoud(origineel, PAD_PER_SPEL)?.match(/"OverlayAppEnable"\s+"(\d)"/)?.[1]
  console.log(
    `  nu: EnableGameOverlay=${alg ?? '(afwezig)'}  OverlayAppEnable=${spel ?? '(afwezig)'}`
  )

  // 1. Heen en terug.
  const aanstaand = alg === '1' || spel === '1'
  const heen = zetBeide(origineel, !aanstaand)
  const terug = zetBeide(heen, aanstaand)
  if (terug === origineel) {
    console.log('  heen en terug: byte-identiek')
  } else {
    fouten++
    console.log('  heen en terug: WIJKT AF')
    for (const r of verschillen(origineel, terug).slice(0, 5)) console.log(r)
  }

  // 2. Wat één omzetting raakt.
  const raakt = verschillen(origineel, heen)
  console.log(`  één omzetting raakt ${raakt.length} regel(s):`)
  for (const r of raakt.slice(0, 6)) console.log(r)
  if (raakt.length > 2) {
    fouten++
    console.log('  MEER DAN DE TWEE VLAGGEN -- dat hoort niet')
  }

  /*
   * 3. Een ontbrekende vlag. De regel wordt weggehaald en opnieuw gezet; dan
   *    hoort er precies één regel bij te komen en de rest gelijk te blijven.
   *    Een regelvergelijking telt dat verkeerd -- alles erna schuift op -- dus
   *    wordt het aantal regels geteld en de inhoud als verzameling vergeleken.
   */
  const zonder = origineel.replace(/^\t*"EnableGameOverlay"\s+"\d"\n/m, '')
  if (zonder !== origineel) {
    const bij = zetVlag(zonder, PAD_ALGEMEEN, 'EnableGameOverlay', false)
    const erbij = bij.split('\n').length - zonder.split('\n').length
    const inSystem = inhoud(bij, PAD_ALGEMEEN)?.includes('"EnableGameOverlay"') ?? false
    const rest = (t: string): string =>
      t.split('\n').filter((r) => !/"EnableGameOverlay"/.test(r)).join('\n')
    const restGelijk = rest(bij) === rest(zonder)
    console.log(
      `  ontbrekende vlag: +${erbij} regel, in het blok "system": ${inSystem ? 'ja' : 'NEE'},` +
        ` rest ongemoeid: ${restGelijk ? 'ja' : 'NEE'}`
    )
    if (erbij !== 1 || !inSystem || !restGelijk) fouten++
  }

  writeFileSync(join(werkmap, `uit-${configs.indexOf(cfg)}.vdf`), heen, 'latin1')
}

console.log(`\nbewerkte kopieën in ${werkmap}`)
console.log(fouten === 0 ? 'alles klopt' : `${fouten} ding(en) niet in orde`)
process.exit(fouten === 0 ? 0 : 1)
