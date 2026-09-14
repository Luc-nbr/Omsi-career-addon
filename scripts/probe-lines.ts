/**
 * Welke lijnen mag de speler rijden?
 *
 * OMSI zet in een `.ttl` een blok `[userallowed]` als de lijn in het
 * dienstregelingsmenu mag verschijnen. Zonder dat blok is het een AI-lijn:
 * stadsbanen, treinen, schoolbussen van het verkeer. Die horen niet in het
 * rooster, want je kunt ze in het spel niet eens aanklikken.
 *
 * Het tweede veld van `[newtour]` noemt de voertuiggroep uit ailists.cfg
 * ("Solobusse", "Stadtbahn"); dat is een tweede aanwijzing.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockTag, readOmsiLines, str } from '../src/core/omsiFile'
import { findOmsiInstall } from '../src/core/install'

const omsi = findOmsiInstall()
if (!omsi) throw new Error('Geen OMSI 2 gevonden.')
const maps = join(omsi, 'maps')

for (const folder of readdirSync(maps)) {
  const data = join(maps, folder, 'TTData')
  let files: string[]
  try {
    files = readdirSync(data).filter((name) => name.toLowerCase().endsWith('.ttl'))
  } catch {
    continue
  }
  if (files.length === 0) continue

  const allowed: string[] = []
  const blocked: Array<{ name: string; group: string }> = []

  for (const file of files) {
    let lines: string[]
    try {
      lines = readOmsiLines(join(data, file))
    } catch {
      continue
    }
    let user = false
    const groups = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      const tag = blockTag(lines[i])
      if (tag === '[userallowed]') user = true
      if (tag === '[newtour]') {
        const group = str(lines[i + 2])
        if (group) groups.add(group)
      }
    }
    const name = file.replace(/\.ttl$/i, '')
    if (user) allowed.push(name)
    else blocked.push({ name, group: [...groups].join('/') || '—' })
  }

  console.log(`${folder}  (${files.length} lijnen)`)
  console.log(`   mag:  ${allowed.join(', ') || '(geen)'}`)
  console.log(
    `   niet: ${blocked.map((item) => `${item.name} [${item.group}]`).join(', ') || '(geen)'}`
  )
}
