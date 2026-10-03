/*
 * De lijnen van de concessies op de vlootkaart, als canvaslaag boven het
 * wegennet.
 *
 * WAAROM EEN CANVAS
 * Een lijn als lijn 109 rijdt over een paar dozijn trajecten met samen
 * tienduizenden punten. Als SVG-paden zouden die bij elk beeld opnieuw door
 * React gaan, en tijdens het afspelen tekent de kaart zestig keer per seconde
 * de bussen. Hier staan ze één keer als Path2D in kaartmeters; tekenen is dan
 * alleen een transformatie en een streek, net als de wegen (roadLayer.ts).
 */

export interface LijnView {
  /** Middelpunt in meters. */
  cx: number
  cy: number
  /** Meters per CSS-pixel. */
  mpp: number
  /** Afmeting in CSS-pixels. */
  w: number
  h: number
  /** Beeldpunten per CSS-pixel. */
  dpr: number
}

export class LijnLaag {
  private readonly paden: Path2D[] = []
  readonly leeg: boolean

  constructor(lijnen: number[][]) {
    for (const punten of lijnen) {
      if (punten.length < 4) continue
      const pad = new Path2D()
      pad.moveTo(punten[0], punten[1])
      for (let i = 2; i + 1 < punten.length; i += 2) pad.lineTo(punten[i], punten[i + 1])
      this.paden.push(pad)
    }
    this.leeg = this.paden.length === 0
  }

  /**
   * Over wat er al op het canvas staat heen. Noord boven: de vlootkaart draait
   * niet mee (ontwerp §8.3), dus de transformatie is alleen schaal en schuif.
   */
  draw(ctx: CanvasRenderingContext2D, view: LijnView): void {
    if (this.leeg) return
    const k = view.dpr / view.mpp
    ctx.save()
    ctx.setTransform(k, 0, 0, -k, (view.dpr * view.w) / 2 - k * view.cx, (view.dpr * view.h) / 2 + k * view.cy)
    const stijl = getComputedStyle(ctx.canvas)
    const rand = stijl.getPropertyValue('--vloot-lijn-rand').trim() || 'rgba(0, 0, 0, 0.35)'
    const kleur = stijl.getPropertyValue('--vloot-lijn').trim() || '#2a75f7'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // Een lijn blijft op elke zoomstand even dik op het scherm: de breedte is in meters.
    ctx.strokeStyle = rand
    ctx.lineWidth = 6 * view.mpp
    for (const pad of this.paden) ctx.stroke(pad)
    ctx.strokeStyle = kleur
    ctx.lineWidth = 3.5 * view.mpp
    for (const pad of this.paden) ctx.stroke(pad)
    ctx.restore()
  }
}
