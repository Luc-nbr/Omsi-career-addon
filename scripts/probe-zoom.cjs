/**
 * Staat de navigatie op vijfentwintig meter als de bus stapvoets rijdt?
 *
 *   node scripts/probe-zoom.cjs
 *
 * De kaart zoomt mee met de snelheid. Langzaam rijden betekent aanrijden,
 * keren of invoegen, en dan wil je de halte en de stoeprand uit elkaar kunnen
 * houden; hard rijden betekent dat je de volgende kruising ruim wilt zien
 * aankomen. Deze proef rekent de schaalbalk uit bij een reeks snelheden en
 * kijkt of hij onder de dertig op 25 m staat -- en of hij daarboven zonder
 * sprong verder open gaat.
 */
const { build } = require('esbuild')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const stubCss = {
  name: 'css-leeg',
  setup(builder) {
    builder.onResolve({ filter: /\.css$/ }, (found) => ({ path: found.path, namespace: 'leeg' }))
    builder.onLoad({ filter: /.*/, namespace: 'leeg' }, () => ({ contents: '', loader: 'js' }))
  }
}

const entry = `
export { liveZoom, niceScale } from './src/renderer/src/RouteMap'
`

const out = join(mkdtempSync(join(tmpdir(), 'omsi-zoom-')), 'bundel.cjs')

build({
  stdin: { contents: entry, resolveDir: join(__dirname, '..'), loader: 'tsx', sourcefile: 'zoom.tsx' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  jsx: 'automatic',
  plugins: [stubCss],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning'
})
  .then(() => {
    const { liveZoom, niceScale } = require(out)
    // De schaalbalk van de navigatie mikt op negentig punten breed.
    const AIM = 90

    let ok = true
    const eis = (naam, goed) => {
      if (!goed) ok = false
      console.log(`   ${goed ? 'ja ' : 'NEE'} ${naam}`)
    }

    console.log('de schaalbalk per snelheid:')
    for (const speed of [0, 5, 10, 20, 29, 30, 31, 40, 50, 60, 80, 100]) {
      const mpp = liveZoom(speed)
      const bar = niceScale(mpp, AIM)
      console.log(
        `   ${String(speed).padStart(3)} km/u  ->  ${mpp.toFixed(3)} m per punt, balk ${bar.label}`
      )
    }

    // Stap voor stap langs de hele reeks: zo blijkt of er ergens een sprong zit.
    let jump = 0
    for (let speed = 1; speed <= 120; speed++) {
      jump = Math.max(jump, liveZoom(speed) / liveZoom(speed - 1))
    }

    console.log('')
    for (const speed of [0, 10, 20, 29, 30]) {
      eis(`bij ${speed} km/u staat de balk op 25 m`, niceScale(liveZoom(speed), AIM).label === '25 m')
    }
    eis('boven de dertig gaat hij open', liveZoom(50) > liveZoom(30))
    eis('en bij 80 is hij helemaal uit', Math.abs(liveZoom(80) - 2) < 0.001)
    eis('harder dan dat verandert niets meer', liveZoom(120) === liveZoom(80))
    // Een kaart die op een bepaalde snelheid ineens wegspringt, leest als een storing.
    eis(`geen sprong per km/u (grootste stap ${jump.toFixed(3)}x)`, jump < 1.15)

    console.log(ok ? '\nde zoom volgt de snelheid' : '\nKLOPT NIET')
    process.exit(ok ? 0 : 1)
  })
  .catch((cause) => {
    console.error(cause)
    process.exit(1)
  })
