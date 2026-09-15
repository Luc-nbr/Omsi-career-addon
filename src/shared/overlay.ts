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
  /**
   * Hoe dicht het element is. De navigatie ligt over de weg heen, dus wie er
   * doorheen wil kunnen kijken zet hem lichter.
   */
  opacity: number
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

/** Nog lichter dan dit en er valt niets meer af te lezen. */
export const OPACITY_MIN = 0.25

export const PANELS: PanelInfo[] = [
  { id: 'dienst', title: 'Dienst', minW: 230, minH: 60, autoHeight: true },
  { id: 'navigatie', title: 'Navigatie', minW: 240, minH: 170 }
]

/** Het paneel linksboven, de navigatie eronder. */
export const DEFAULT_LAYOUT: OverlayLayout = {
  detail: 1,
  dienst: { x: 24, y: 30, w: 320, h: 0, scale: 1, opacity: 1, visible: true },
  navigatie: { x: 24, y: 470, w: 360, h: 300, scale: 1, opacity: 1, visible: true }
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
      opacity: Math.min(1, Math.max(OPACITY_MIN, numberOr(state.opacity, 1))),
      visible: state.visible !== false
    }
  }
  return layout
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Hoe vaak de overlay wordt bijgewerkt.
 *
 * De overlay is een doorzichtig venster over het spel heen. Elke keer dat hij
 * zichzelf opnieuw tekent, moet Windows dat beeld over OMSI heen mengen -- en
 * dat kost het spel beeldjes. Tien keer per seconde ziet er het mooist uit,
 * maar wie haperingen merkt, zet hem rustiger; de cijfers lopen dan net zo goed
 * mee, alleen de bus op de kaart schuift met grotere stappen op.
 */
export type OverlayRate = 'vloeiend' | 'rustig' | 'zuinig'

/** Milliseconden tussen twee verversingen. */
export const OVERLAY_RATES: Record<OverlayRate, number> = {
  vloeiend: 100,
  rustig: 200,
  zuinig: 500
}

export function isOverlayRate(value: unknown): value is OverlayRate {
  return value === 'vloeiend' || value === 'rustig' || value === 'zuinig'
}
