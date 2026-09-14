/**
 * De indeling van de overlay.
 *
 * Er zijn twee elementen die los van elkaar staan: het dienstpaneel met de
 * gegevens, en de navigatie met de kaart. Beide kun je verslepen. Het paneel
 * kent drie standen, van beknopt tot uitgebreid; uitklappen zet hem een stand
 * verder.
 */

export type PanelId = 'dienst' | 'navigatie'

/** 0 beknopt, 1 normaal, 2 uitgebreid. */
export type DetailLevel = 0 | 1 | 2

export const DETAIL_NAMES = ['Beknopt', 'Normaal', 'Uitgebreid'] as const

export interface PanelState {
  x: number
  y: number
  w: number
  /**
   * Vergroting van het hele element, inhoud en al. Breder maken geeft meer
   * ruimte; hiermee wordt alles groter, voor wie verder van het scherm zit.
   */
  scale: number
  /** Alleen de navigatie heeft een eigen hoogte; het paneel groeit met zijn inhoud. */
  h: number
  visible: boolean
}

export interface OverlayLayout {
  detail: DetailLevel
  dienst: PanelState
  navigatie: PanelState
}

export interface PanelInfo {
  id: PanelId
  title: string
  minW: number
  minH: number
  /** De inhoud bepaalt de hoogte; rekken heeft geen zin. */
  autoHeight?: boolean
}

/** Grenzen aan de vergroting: kleiner is onleesbaar, groter dekt het spel af. */
export const SCALE_MIN = 0.6
export const SCALE_MAX = 2.2
export const SCALE_STEP = 0.1

export const PANELS: PanelInfo[] = [
  { id: 'dienst', title: 'Dienst', minW: 230, minH: 60, autoHeight: true },
  { id: 'navigatie', title: 'Navigatie', minW: 240, minH: 170 }
]

/** Het paneel linksboven, de navigatie eronder. */
export const DEFAULT_LAYOUT: OverlayLayout = {
  detail: 1,
  dienst: { x: 24, y: 30, w: 320, h: 0, scale: 1, visible: true },
  navigatie: { x: 24, y: 470, w: 360, h: 300, scale: 1, visible: true }
}

export function defaultLayout(): OverlayLayout {
  return structuredClone(DEFAULT_LAYOUT)
}

export function nextDetail(level: DetailLevel): DetailLevel {
  return (((level + 1) % 3) as DetailLevel)
}

/**
 * Vult een bewaarde indeling aan met wat er ontbreekt, zodat een oud of
 * onvolledig bestand geen lege overlay oplevert.
 */
export function mergeLayout(saved: unknown): OverlayLayout {
  const layout = defaultLayout()
  if (!saved || typeof saved !== 'object') return layout
  const raw = saved as Partial<OverlayLayout>

  if (typeof raw.detail === 'number' && raw.detail >= 0 && raw.detail <= 2) {
    layout.detail = Math.round(raw.detail) as DetailLevel
  }
  for (const panel of PANELS) {
    const state = raw[panel.id]
    if (!state || typeof state !== 'object') continue
    const fallback = layout[panel.id]
    layout[panel.id] = {
      x: numberOr(state.x, fallback.x),
      y: numberOr(state.y, fallback.y),
      w: Math.max(panel.minW, numberOr(state.w, fallback.w)),
      h: Math.max(panel.minH, numberOr(state.h, fallback.h)),
      scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, numberOr(state.scale, 1))),
      visible: state.visible !== false
    }
  }
  return layout
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
