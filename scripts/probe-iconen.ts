/**
 * Hoe zien de icoontjes er werkelijk uit?
 *
 *   npx tsx scripts/probe-iconen.ts <uitvoerbestand.html>
 *
 * Een pad is uitgerekend en niet getekend: een halve komma verkeerd en er staat
 * een vlek in plaats van een zon, en dat is aan de code niet te zien. Dit zet de
 * hele set op een vel, in de maten waarin ze in de app voorkomen -- zestien
 * pixels in de stappenbalk, dertig in de kop van een vel -- en op de twee
 * achtergronden waar ze op moeten werken.
 *
 * Zestien pixels is de maat die telt. Wat daar dichtloopt of uit elkaar valt,
 * is mis, ook als het op tweeënzeventig prachtig is.
 */
import { writeFileSync } from 'node:fs'
import { ICONEN } from '../src/renderer/src/Icoon'

const uit = process.argv[2] ?? 'iconen.html'

const svg = (naam: string, maat: number): string => {
  const vorm = ICONEN[naam as keyof typeof ICONEN] as {
    d: string
    vulling?: string
    streek?: boolean
  }
  const gevuld = !vorm.streek
  return (
    `<svg viewBox="0 0 24 24" width="${maat}" height="${maat}">` +
    `<path d="${vorm.d}"` +
    ` fill="${gevuld ? 'currentColor' : 'none'}"` +
    ` fill-rule="${vorm.vulling ?? 'evenodd'}"` +
    `${gevuld ? '' : ' stroke="currentColor" stroke-width="2"'}` +
    ` stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

const namen = Object.keys(ICONEN)
const rij = (naam: string): string =>
  `<div class="cel"><div class="maten">${[16, 24, 30, 72]
    .map((m) => `<span class="maat">${svg(naam, m)}</span>`)
    .join('')}</div><code>${naam}</code></div>`

writeFileSync(
  uit,
  `<!doctype html><meta charset="utf-8"><title>Iconen</title><style>
  body{margin:0;font:14px/1.4 'Segoe UI',system-ui,sans-serif}
  section{padding:24px 28px}
  .donker{background:#141a26;color:#e8ebf2}
  .licht{background:#f7f8f8;color:#0e1117}
  h2{margin:0 0 18px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
  .raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px}
  .maten{display:flex;align-items:flex-end;gap:14px;min-height:76px}
  .maat{display:flex;align-items:center}
  code{display:block;margin-top:8px;font-size:11px;opacity:.55}
  </style>
  <section class="donker"><h2>donker — 16 / 24 / 30 / 72 px</h2>
  <div class="raster">${namen.map(rij).join('')}</div></section>
  <section class="licht"><h2>licht</h2>
  <div class="raster">${namen.map(rij).join('')}</div></section>`,
  'utf8'
)

console.log(`${namen.length} icoontjes op ${uit}`)
