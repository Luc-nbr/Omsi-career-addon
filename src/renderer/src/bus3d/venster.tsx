import type { Bus3dBrug, Bus3dVensterVraag } from '../../../shared/bus3d'

/**
 * DE INGANG VAN HET 3D-VENSTER (bus3d.html, bus3d-ontwerp §8.1, §0.9)
 *
 * Met opzet klein en zonder React: nooit een leeg kader. Zodra main de vraag
 * geeft (`bus3d:vraag`, met het heldenbeeld of de foto van de tegel erin) staat
 * dat plaatje er -- of het busicoon -- en pas daarna wordt het React-deel
 * geladen (ingang.tsx: viewer, zijpaneel, teksten). Met alles in één stuk kwam
 * het eerste plaatje pas 290 ms na het laden van de pagina (de teksten alleen
 * al zijn een megabyte script); zo is het er vrijwel meteen. Het voorlopige
 * plaatje gaat weg zodra de viewer zijn eigen eerste plaatje toont.
 *
 * Drie standen, op het adres:
 * - gewoon: het 3D-venster van main (main/bus3dvenster.ts);
 * - `?foto=1`: het verborgen fotovenster van de foto v4 (bus3d/fotomodus.ts);
 * - `?proef=1` of `?bus=...`: alleen de viewer, voor scripts/probe-bus3d-beeld.cjs.
 */

declare global {
  interface Window {
    bus3d?: Bus3dBrug
  }
}

const adres = new URLSearchParams(location.search)
const brug = window.bus3d
// Voor de proef (probe-bus3d-venster.cjs): wanneer de ingang begon en wanneer de vraag er was.
document.documentElement.dataset.ingangMs = String(Math.round(performance.now()))

/** Het vlak van de viewer: links naast het paneel van 320 px, of in een smal venster bovenaan in 16:10 (§8.1). */
function vlakVanViewer(): { links: number; boven: number; breedte: number; hoogte: number } {
  const b = window.innerWidth
  const h = window.innerHeight
  if (b < 900) return { links: 0, boven: 0, breedte: b, hoogte: Math.min(h * 0.6, (b * 10) / 16) }
  return { links: 0, boven: 0, breedte: b - 320, hoogte: h }
}

/** De vorm van een bus als SVG, dezelfde als het busicoon van de viewer. */
function busicoon(vorm: Bus3dVensterVraag['vorm']): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 96 40')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'width:min(42%,360px);height:auto;fill:rgba(255,255,255,0.55)'
  const delen: Array<[string, Record<string, number>]> =
    vorm === 'geleed'
      ? [
          ['rect', { x: 2, y: 8, width: 44, height: 22, rx: 4 }],
          ['rect', { x: 56, y: 8, width: 38, height: 22, rx: 4 }],
          ['circle', { cx: 14, cy: 32, r: 4 }],
          ['circle', { cx: 40, cy: 32, r: 4 }],
          ['circle', { cx: 82, cy: 32, r: 4 }]
        ]
      : vorm === 'midi'
        ? [
            ['rect', { x: 16, y: 10, width: 52, height: 20, rx: 4 }],
            ['circle', { cx: 28, cy: 32, r: 4 }],
            ['circle', { cx: 58, cy: 32, r: 4 }]
          ]
        : vorm === 'dubbel'
          ? [
              ['rect', { x: 6, y: 2, width: 72, height: 28, rx: 4 }],
              ['circle', { cx: 20, cy: 32, r: 4 }],
              ['circle', { cx: 66, cy: 32, r: 4 }]
            ]
          : [
              ['rect', { x: 6, y: 8, width: 78, height: 22, rx: 4 }],
              ['circle', { cx: 20, cy: 32, r: 4 }],
              ['circle', { cx: 70, cy: 32, r: 4 }]
            ]
  for (const [soort, attrs] of delen) {
    const el = document.createElementNS(ns, soort)
    for (const [k, w] of Object.entries(attrs)) el.setAttribute(k, String(w))
    svg.appendChild(el)
  }
  return svg
}

/** Het plaatje meteen, zonder React: de foto of het icoon, op de plek van de viewer. */
function toonVoorlopig(v: Bus3dVensterVraag, b: Bus3dBrug): void {
  const d = document.documentElement.dataset
  const meld = (wat: 'foto' | 'icoon'): void => {
    if (d.getoondMs) return
    d.getoond = wat
    d.getoondMs = String(Math.round(performance.now()))
    b.getoond()
  }
  const vlak = document.createElement('div')
  vlak.id = 'bv-voorlopig'
  const v0 = vlakVanViewer()
  vlak.style.cssText =
    `position:fixed;left:${v0.links}px;top:${v0.boven}px;width:${v0.breedte}px;height:${v0.hoogte}px;` +
    'display:grid;place-items:center;background:#8fa7c0;z-index:5;pointer-events:none'
  const icoon = busicoon(v.vorm)
  vlak.appendChild(icoon)
  if (v.foto) {
    const img = document.createElement('img')
    img.alt = ''
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain'
    img.onload = () => {
      icoon.remove()
      meld('foto')
    }
    img.onerror = () => meld('icoon')
    img.src = v.foto
    vlak.appendChild(img)
  }
  document.body.appendChild(vlak)
  if (!v.foto) meld('icoon')
}

if (adres.has('foto') && brug) {
  void import('./fotomodus').then((m) => m.startFotomodus(brug))
} else if (adres.has('proef') || adres.has('bus') || !brug) {
  void import('./ingang').then((m) => m.startProef())
} else {
  void brug.vraag().then((v) => {
    if (!v) {
      // Main kent dit venster niet (meer): dicht.
      brug.sluit()
      return
    }
    document.documentElement.dataset.vraagKlaarMs = String(Math.round(performance.now()))
    toonVoorlopig(v, brug)
    void import('./ingang').then((m) => m.startVenster(v))
  })
}

export {}
