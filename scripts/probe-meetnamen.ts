/**
 * Welke getallen de meetstand per bus vraagt, en past dat in de 512?
 *
 *   npx tsx scripts/probe-meetnamen.ts [busmap ...]
 *
 * Alleen lezen, in de echte OMSI-map: de varlists van de bus (zoals
 * `varlistVanBus` ze uit de [varnamelist] van de .bus leest), de namen die op
 * de patronen van ronde 0 passen (`MEET_PATRONEN`), en wat `getallenlijst` er
 * met de systeemgetallen voor maakt. Standaard de drie bussen van ronde 0 (de
 * C2, de o530 U e2 en de MAN NL) plus de twee grootste Hamburgers.
 *
 * Nagekeken: de systeemgetallen staan vooraan en zijn er alle 37; de lijst is
 * hooguit 512; elk patroon dat de bus kent, heeft minstens één naam in de
 * lijst (dus knielen, stopverzoek, alarmlicht vallen niet buiten de grens);
 * en ook met 300 getallen van de apparaatschermen erbij blijven de namen van
 * knielen tot en met klima binnen.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getallenlijst, GETALLEN_MAX, VOERTUIG_GETALLEN } from '../src/core/live'
import { MEET_PATRONEN, meetGetallenVoor, varlistVanBus } from '../src/core/meetstand'

let fouten = 0
function klopt(wat: string, ja: boolean): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}`)
  if (!ja) fouten++
}

const instellingen = join(process.env.APPDATA ?? '', 'omsi-enhancer', 'settings.json')
const omsi =
  (existsSync(instellingen) && (JSON.parse(readFileSync(instellingen, 'utf8')) as { omsiPath?: string }).omsiPath) ||
  'C:/Program Files (x86)/Steam/steamapps/common/OMSI 2'
const bussen = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['MB_C2_EN_BVG', 'Citybus 530 by Kajosoft', 'MAN_NL_NG', 'HH20_EBus2021', 'HH_Stadtbus2017']

/* Bij het nagebouwde scherm van de o530 zijn het er 293 in een [visible]; neem er 300. */
const scherm = Array.from({ length: 300 }, (_, i) => `scherm_getal_${i}`)

for (const map of bussen) {
  if (!existsSync(join(omsi, 'Vehicles', map))) {
    console.log(`-- ${map}: niet geïnstalleerd, overgeslagen`)
    continue
  }
  const { namen, bestanden } = varlistVanBus(omsi, { pad: `Vehicles/${map}` })
  const meet = meetGetallenVoor(namen)
  const zonder = getallenlijst({ meet })
  const met = getallenlijst({ scherm, meet })
  console.log(
    `-- ${map}: ${namen.length} namen uit ${bestanden.length} varlists; meetstand vraagt ${meet.length}; ` +
      `lijst ${zonder.namen.length} (${zonder.afgevallen.length} eraf), met 300 schermgetallen ${met.namen.length} (${met.afgevallen.length} eraf)`
  )
  klopt(`${map}: de 37 systeemgetallen vooraan`, VOERTUIG_GETALLEN.every((naam, i) => zonder.namen[i] === naam))
  klopt(`${map}: hooguit ${GETALLEN_MAX}`, zonder.namen.length <= GETALLEN_MAX && met.namen.length <= GETALLEN_MAX)
  const binnen = new Set(zonder.namen.map((n) => n.toLowerCase()))
  const binnenMet = new Set(met.namen.map((n) => n.toLowerCase()))
  const perPatroon: string[] = []
  for (const { id, patroon } of MEET_PATRONEN) {
    const eigen = namen.filter((n) => patroon.test(n))
    if (eigen.length === 0) continue
    const erin = eigen.filter((n) => binnen.has(n.toLowerCase())).length
    perPatroon.push(`${id} ${erin}/${eigen.length}`)
    klopt(`${map}: ${id} heeft een naam in de lijst`, erin > 0)
    /* De kern (alles voor deur en licht) blijft binnen, ook naast de schermen. */
    if (id !== 'tuer' && id !== 'licht') {
      klopt(`${map}: ${id} ook naast 300 schermgetallen`, eigen.some((n) => binnenMet.has(n.toLowerCase())))
    }
  }
  console.log(`   ${perPatroon.join(', ')}`)
}

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
