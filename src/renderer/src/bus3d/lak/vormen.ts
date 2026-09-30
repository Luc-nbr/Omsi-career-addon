/**
 * DE EIGEN VORMENBIBLIOTHEEK (lakstudio-ontwerp §1, "Afbeeldingen en vormen")
 *
 * Negen vormen in een vak van 100 bij 100, getekend en niet opgehaald: pijl,
 * streep, cirkel, ster, golf, rolstoel, kinderwagen, fiets en een kader voor een
 * stadswapen. Elke vorm is een lijst stukken: een stuk is een pad dat gevuld
 * wordt (`regel` evenodd voor een ring), of met `dik` een lijn van die dikte.
 * Stukken worden los getekend, dus hun vereniging is de vorm: een ring onder
 * een lichaam maakt zo geen gat waar ze elkaar raken.
 *
 * Dezelfde lijst tekent de werker op het lakdoek (Path2D) en het paneel als
 * plaatje (SVG): wat je kiest is wat op de bus komt.
 */

export interface VormStuk {
  d: string
  regel?: 'evenodd'
  /** Een lijn van deze dikte (in eenheden van het vak) in plaats van een vlak. */
  dik?: number
}

const ring = (x: number, y: number, r: number): string => `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`

export const VORMEN: Record<string, VormStuk[]> = {
  pijl: [{ d: 'M5 40 H65 V20 L95 50 L65 80 V60 H5 Z' }],
  streep: [{ d: 'M0 40 H100 V60 H0 Z' }],
  cirkel: [{ d: ring(50, 50, 45) }],
  ster: [{ d: 'M50 5 L61 38 H95 L67 58 L78 92 L50 72 L22 92 L33 58 L5 38 H39 Z' }],
  golf: [{ d: 'M0 60 Q25 30 50 60 T100 60 V80 Q75 50 50 80 T0 80 Z' }],
  // Het internationale teken: hoofd, lichaam met arm en been, en het wiel.
  rolstoel: [
    { d: ring(42, 12, 8) },
    { d: 'M38 26 L40 54 H66 L76 80', dik: 9 },
    { d: 'M40 38 H62', dik: 7 },
    { d: 'M30 50 A26 26 0 1 0 70 76', dik: 7 }
  ],
  kinderwagen: [
    { d: 'M16 52 A34 34 0 0 1 50 18 V52 Z' },
    { d: 'M16 56 H84 Q82 78 50 78 Q18 78 16 56 Z' },
    { d: 'M84 56 L90 26 H97', dik: 5 },
    { d: `${ring(32, 89, 8)} ${ring(32, 89, 3.5)}`, regel: 'evenodd' },
    { d: `${ring(68, 89, 8)} ${ring(68, 89, 3.5)}`, regel: 'evenodd' }
  ],
  fiets: [
    { d: 'M40 70 A17 17 0 1 0 6 70 A17 17 0 1 0 40 70', dik: 5 },
    { d: 'M94 70 A17 17 0 1 0 60 70 A17 17 0 1 0 94 70', dik: 5 },
    { d: 'M23 70 L38 44 H68 L77 70 M38 44 L50 70 H23 M68 44 L63 32 H72 M38 44 L35 36 M29 36 H43', dik: 5 }
  ],
  // Een schild als lijst: het wapen zelf zet de speler er als afbeelding in.
  kader: [{ d: 'M10 6 H90 V48 Q90 82 50 97 Q10 82 10 48 Z M18 14 V48 Q18 76 50 88 Q82 76 82 48 V14 Z', regel: 'evenodd' }]
}

/** De volgorde in het paneel. */
export const VORM_NAMEN = ['pijl', 'streep', 'cirkel', 'ster', 'golf', 'rolstoel', 'kinderwagen', 'fiets', 'kader'] as const

/** Een vorm op een 2D-doek, in het vak (0, 0)-(b, h), wit. */
export function tekenVorm(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, naam: string, b: number, h: number): void {
  const stukken = VORMEN[naam] ?? VORMEN.cirkel
  ctx.save()
  ctx.scale(b / 100, h / 100)
  ctx.fillStyle = 'white'
  ctx.strokeStyle = 'white'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of stukken) {
    const p = new Path2D(s.d)
    if (s.dik) {
      ctx.lineWidth = s.dik
      ctx.stroke(p)
    } else ctx.fill(p, s.regel ?? 'nonzero')
  }
  ctx.restore()
}
