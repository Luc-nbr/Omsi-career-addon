/**
 * De indeling van de overlay: welke vensters er zijn, waar ze staan en hoe groot
 * ze zijn. Zowel het hoofdproces (dat het bewaart) als de overlay zelf gebruiken
 * deze beschrijving, zodat er maar een lijst bestaat.
 */

export type WidgetId =
  | 'klok'
  | 'rit'
  | 'navigatie'
  | 'kaart'
  | 'meters'
  | 'rijstijl'
  | 'advies'

export interface WidgetState {
  x: number
  y: number
  w: number
  h: number
  visible: boolean
  /** Dichtgeklapt: alleen de titelbalk blijft staan. */
  collapsed: boolean
}

export type OverlayLayout = Record<WidgetId, WidgetState>

export interface WidgetInfo {
  id: WidgetId
  title: string
  /** Waar het over gaat, voor de knoppenbalk in de bewerkstand. */
  hint: string
  minW: number
  minH: number
  /** Vaste hoogte: de inhoud bepaalt hem, rekken heeft geen zin. */
  fixedHeight?: boolean
}

export const WIDGETS: WidgetInfo[] = [
  { id: 'klok', title: 'Klok en lijn', hint: 'tijd, lijnnummer, vertraging', minW: 200, minH: 52, fixedHeight: true },
  { id: 'rit', title: 'Rit', hint: 'waar je heen rijdt en wanneer je er bent', minW: 200, minH: 60, fixedHeight: true },
  { id: 'navigatie', title: 'Haltes', hint: 'de haltes die nog komen', minW: 210, minH: 120 },
  { id: 'kaart', title: 'Kaart', hint: 'de route met je volgende halte', minW: 220, minH: 160 },
  { id: 'meters', title: 'Meters', hint: 'passagiers, snelheid, stemming', minW: 220, minH: 62, fixedHeight: true },
  { id: 'rijstijl', title: 'Rijstijl', hint: 'hard remmen en optrekken', minW: 180, minH: 40, fixedHeight: true },
  { id: 'advies', title: 'Adviezen', hint: 'meldingen tijdens de rit', minW: 220, minH: 50 }
]

/**
 * Een kolom links met de kaart eronder. De tussenruimte is ruim genoeg voor de
 * titelbalk die in de bewerkstand boven elk venster verschijnt.
 */
export const DEFAULT_LAYOUT: OverlayLayout = {
  klok: { x: 24, y: 30, w: 310, h: 56, visible: true, collapsed: false },
  rit: { x: 24, y: 112, w: 310, h: 72, visible: true, collapsed: false },
  navigatie: { x: 24, y: 210, w: 310, h: 196, visible: true, collapsed: false },
  meters: { x: 24, y: 432, w: 310, h: 66, visible: true, collapsed: false },
  rijstijl: { x: 24, y: 524, w: 310, h: 42, visible: true, collapsed: false },
  advies: { x: 24, y: 592, w: 310, h: 92, visible: true, collapsed: false },
  kaart: { x: 24, y: 710, w: 310, h: 250, visible: true, collapsed: false }
}

export function defaultLayout(): OverlayLayout {
  return structuredClone(DEFAULT_LAYOUT)
}

/**
 * Vult een bewaarde indeling aan met wat er ontbreekt. Zo blijft een oude
 * overlay.json bruikbaar als er later een venster bij komt.
 */
export function mergeLayout(saved: Partial<OverlayLayout> | undefined): OverlayLayout {
  const layout = defaultLayout()
  if (!saved) return layout
  for (const widget of WIDGETS) {
    const state = saved[widget.id]
    if (!state) continue
    layout[widget.id] = {
      x: numberOr(state.x, layout[widget.id].x),
      y: numberOr(state.y, layout[widget.id].y),
      w: Math.max(widget.minW, numberOr(state.w, layout[widget.id].w)),
      h: Math.max(widget.minH, numberOr(state.h, layout[widget.id].h)),
      visible: state.visible !== false,
      collapsed: state.collapsed === true
    }
  }
  return layout
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
