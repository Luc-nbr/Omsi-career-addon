/**
 * De teksten nagekeken.
 *
 *   npx tsx scripts/probe-teksten.ts
 *
 * - geen sleutel in twee bronnen (de delen van de planning hebben elk een
 *   eigen bestand in shared/tekst/, en een dubbele sleutel overschrijft stil);
 * - elke taal heeft dezelfde {plaatshouders} als het Nederlands;
 * - elke fout van de planning (RitFout, InvulFout, RoosterFout) heeft een tekst.
 */
import { TEKSTBRONNEN } from '../src/shared/i18n'

let fouten = 0
function klopt(wat: string, ja: boolean, uitleg?: string): void {
  console.log(`${ja ? 'ok  ' : 'FOUT'} ${wat}${!ja && uitleg ? `: ${uitleg}` : ''}`)
  if (!ja) fouten++
}

const bronnen = Object.entries(TEKSTBRONNEN) as Array<[string, Record<string, Record<string, string>>]>

const waar = new Map<string, string[]>()
for (const [naam, bron] of bronnen) for (const sleutel of Object.keys(bron)) waar.set(sleutel, [...(waar.get(sleutel) ?? []), naam])
const dubbel = [...waar.entries()].filter(([, in_]) => in_.length > 1)
klopt('geen sleutel in twee bronnen', dubbel.length === 0, dubbel.map(([k, in_]) => `${k} (${in_.join(', ')})`).join('; '))

const plaatshouders = (tekst: string): string => [...tekst.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const scheef: string[] = []
for (const [, bron] of bronnen) {
  for (const [sleutel, talen] of Object.entries(bron)) {
    const nl = plaatshouders(talen.nl ?? '')
    for (const taal of ['en', 'de', 'fr']) {
      if (talen[taal] === undefined) scheef.push(`${sleutel}: geen ${taal}`)
      else if (plaatshouders(talen[taal]) !== nl) scheef.push(`${sleutel} (${taal})`)
    }
  }
}
klopt('elke taal dezelfde plaatshouders als nl', scheef.length === 0, scheef.slice(0, 20).join('; '))

/* De foutsoorten uit core/planTypen.ts; bij een nieuwe soort hier en in fundament.ts bijschrijven. */
const FOUTEN = [
  // RoosterFout
  'geen', 'weg', 'te-lang', 'planner', 'kaart', 'dag', 'geenPlek',
  // InvulFout
  'bezet', 'kort', 'vol', 'bezig', 'gereden',
  // RitFout
  'ritBezig', 'dienst', 'bus', 'busLigt', 'venster'
]
const zonder = FOUTEN.filter((f) => !waar.has(`bd.fout.${f}`))
klopt('elke fout van de planning heeft een tekst', zonder.length === 0, zonder.join(', '))
const buiten = [...waar.entries()].filter(([k, in_]) => k.startsWith('bd.fout.') && !in_.includes('TEKST_FUNDAMENT'))
klopt('alle bd.fout.* staan in fundament.ts', buiten.length === 0, buiten.map(([k]) => k).join(', '))

console.log(fouten ? `\n${fouten} fout(en)` : '\nalles klopt')
process.exit(fouten ? 1 : 0)
