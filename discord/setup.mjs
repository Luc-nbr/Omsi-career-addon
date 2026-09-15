/**
 * Zet de kanalen en rollen van de Discord-server neer.
 *
 *   set DISCORD_TOKEN=...        (het token van je eigen bot)
 *   set DISCORD_GUILD=...        (het id van je server)
 *   node discord/setup.mjs [--droog]
 *
 * Wat het doet: de rollen en kanalen uit `server.json` aanmaken in een server
 * die al bestaat. Wat het niet doet: een server aanmaken, want dan zou de bot de
 * eigenaar zijn en niet jij -- maak hem zelf aan in Discord en nodig de bot uit
 * met de rechten "Rollen beheren" en "Kanalen beheren".
 *
 * Het token wordt uit de omgeving gelezen en staat dus nergens in dit bestand of
 * in de geschiedenis. Zet het in je eigen sessie, niet in het project.
 *
 * Met `--droog` wordt er niets aangemaakt en zie je alleen wat er zou gebeuren.
 * Het script is voorzichtig: bestaat een rol of kanaal al met die naam, dan
 * blijft het staan en wordt er niets overschreven. Twee keer draaien levert dus
 * geen dubbele kanalen op.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const API = 'https://discord.com/api/v10'

const token = process.env.DISCORD_TOKEN
const guild = process.env.DISCORD_GUILD
const droog = process.argv.includes('--droog')

if (!droog && (!token || !guild)) {
  console.error('Zet DISCORD_TOKEN en DISCORD_GUILD in je omgeving, of draai met --droog.')
  process.exit(1)
}

const plan = JSON.parse(readFileSync(join(HIER, 'server.json'), 'utf8'))

/** Eén verzoek aan Discord, met een pauze want er geldt een limiet. */
async function api(pad, methode = 'GET', inhoud) {
  if (droog) {
    console.log(`   [droog] ${methode} ${pad}${inhoud ? ' ' + JSON.stringify(inhoud) : ''}`)
    return { id: `droog-${Math.random().toString(36).slice(2, 8)}`, name: inhoud?.name }
  }
  const antwoord = await fetch(`${API}${pad}`, {
    method: methode,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    },
    body: inhoud ? JSON.stringify(inhoud) : undefined
  })
  if (antwoord.status === 429) {
    const wacht = Number((await antwoord.json()).retry_after ?? 1)
    console.log(`   even wachten van Discord: ${wacht}s`)
    await new Promise((r) => setTimeout(r, wacht * 1000 + 250))
    return api(pad, methode, inhoud)
  }
  if (!antwoord.ok) {
    throw new Error(`${methode} ${pad} gaf ${antwoord.status}: ${await antwoord.text()}`)
  }
  await new Promise((r) => setTimeout(r, 350))
  return antwoord.status === 204 ? undefined : antwoord.json()
}

const gelijk = (a, b) => a?.toLowerCase() === b?.toLowerCase()

async function main() {
  console.log(`${plan.naam}: ${plan.rollen.length} rollen, ` +
    `${plan.categorieen.length} categorieën, ` +
    `${plan.categorieen.reduce((n, c) => n + c.kanalen.length, 0)} kanalen\n`)

  const bestaandeRollen = droog ? [] : await api(`/guilds/${guild}/roles`)
  const bestaandeKanalen = droog ? [] : await api(`/guilds/${guild}/channels`)

  // ---- rollen ----
  const rolId = new Map()
  console.log('rollen:')
  for (const rol of plan.rollen) {
    const al = bestaandeRollen.find((r) => gelijk(r.name, rol.naam))
    if (al) {
      rolId.set(rol.naam, al.id)
      console.log(`   bestaat al: ${rol.naam}`)
      continue
    }
    const gemaakt = await api(`/guilds/${guild}/roles`, 'POST', {
      name: rol.naam,
      color: Number.parseInt(rol.kleur, 16),
      hoist: Boolean(rol.apart),
      mentionable: Boolean(rol.aanspreekbaar),
      permissions: '0'
    })
    rolId.set(rol.naam, gemaakt.id)
    console.log(`   aangemaakt: ${rol.naam}`)
  }

  /*
   * Rechten per kanaal. @everyone heeft in Discord hetzelfde id als de server,
   * dus daarmee zet je iets uit voor iedereen.
   *  1024 = kanaal zien, 2048 = berichten sturen.
   */
  // In een droge proef is er geen server; dan tonen we waar het id zou staan.
  const IEDEREEN = guild ?? '<server-id>'
  const ZIEN = 1024n
  const SCHRIJVEN = 2048n

  const rechten = (kanaal) => {
    if (kanaal['alleen-voor']) {
      const id = rolId.get(kanaal['alleen-voor'])
      return [
        { id: IEDEREEN, type: 0, allow: '0', deny: String(ZIEN) },
        ...(id ? [{ id, type: 0, allow: String(ZIEN | SCHRIJVEN), deny: '0' }] : [])
      ]
    }
    if (kanaal['alleen-lezen']) {
      return [{ id: IEDEREEN, type: 0, allow: '0', deny: String(SCHRIJVEN) }]
    }
    return undefined
  }

  // ---- kanalen, per categorie ----
  for (const categorie of plan.categorieen) {
    console.log(`\n${categorie.naam}:`)
    let ouder = bestaandeKanalen.find((k) => k.type === 4 && gelijk(k.name, categorie.naam))
    if (!ouder) {
      ouder = await api(`/guilds/${guild}/channels`, 'POST', { name: categorie.naam, type: 4 })
      console.log(`   categorie aangemaakt`)
    }
    for (const kanaal of categorie.kanalen) {
      if (bestaandeKanalen.some((k) => k.type === 0 && gelijk(k.name, kanaal.naam))) {
        console.log(`   bestaat al: #${kanaal.naam}`)
        continue
      }
      await api(`/guilds/${guild}/channels`, 'POST', {
        name: kanaal.naam,
        type: 0,
        parent_id: ouder.id,
        topic: kanaal.onderwerp,
        permission_overwrites: rechten(kanaal)
      })
      console.log(`   aangemaakt: #${kanaal.naam}`)
    }
  }

  console.log('\nklaar. De teksten voor #welkom-en-regels staan in discord/README.md.')
}

main().catch((reden) => {
  console.error('\nmislukt:', reden.message)
  process.exit(1)
})
