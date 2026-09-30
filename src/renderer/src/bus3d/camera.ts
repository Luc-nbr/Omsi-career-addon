import { graden, kijkNaar, orthografisch, perspectief, projecteer, vermenigvuldig, type Mat4, type Vec3 } from './wiskunde'

/**
 * DE CAMERA VAN HET 3D-VENSTER (bus3d-ontwerp §6)
 *
 * Constanten als idee uit openOMSI (showroom.rs:110-115, 202-210, 331-351):
 * - beginstand schuin rechtsvoor aan de deurzijde: draaiing 215°, 8° hoog,
 *   lens 30° (verticaal);
 * - inpassen op `[boundingbox]`: afstand = max((lengte/2 + 1) / (tan 15° ·
 *   verhouding · 0,92), (hoogte/2) / (tan 15° · 0,85)) × zoom, minstens 8 m;
 *   mikpunt het midden van de doos met de hoogte × 0,75; nooit lager dan 0,6 m;
 * - slepen 0,35°/px draaien en 0,25°/px kantelen (-2° tot 60°), wiel en knijpen
 *   8% per stap tussen 0,55 en 2,5; naloop exponentieel met τ = 0,18 s.
 *
 * DRAAIING
 * Gemeten vanaf de achterkant, met de klok mee gezien van boven: 0° = achter,
 * 90° = links, 180° = voor, 270° = rechts (de deurkant). In de wereld
 * (rechtshandig, X = -x van de o3d) staat de camera op
 * doel + R · (cos k · sin d, sin k, -cos k · cos d).
 */

export type Stand = 'voor' | 'zijkant' | 'achter' | 'schuin' | 'terug' | Plat

/** De platte aanzichten van de Lakstudio (§4.12, toetsen 1-5): orthografisch. */
export type Plat = 'links' | 'rechts' | 'voorvlak' | 'achtervlak' | 'dak'

export const BEGIN = { draai: 215, kantel: 8, zoom: 1 }
const STANDEN: Record<Exclude<Stand, 'terug' | Plat>, { draai: number; kantel: number }> = {
  voor: { draai: 180, kantel: 6 },
  zijkant: { draai: 270, kantel: 5 },
  achter: { draai: 0, kantel: 6 },
  schuin: { draai: 215, kantel: 8 }
}
const LENS = graden(30)
const KANTEL_MIN = -2
const KANTEL_MAX = 60
const ZOOM_MIN = 0.55
const ZOOM_MAX = 2.5
const TAU = 0.18

export interface CameraStand {
  draai: number
  kantel: number
  zoom: number
}

export interface CameraBeeld {
  beeld: Mat4
  proj: Mat4
  beeldProj: Mat4
  oog: Vec3
  doel: Vec3
  dichtbij: number
  ver: number
}

export class Camera {
  /** Waar de camera naartoe gaat, en waar hij nu is (naloop). */
  doelStand: CameraStand = { ...BEGIN }
  nu: CameraStand = { ...BEGIN }
  /** Een plat aanzicht (Lakstudio), of niets: dan perspectief. */
  plat?: Plat
  /** Verschuiving van het mikpunt (Lakstudio: middelste knop of Shift), in de wereld. */
  schuifBij: Vec3 = [0, 0, 0]
  /** De kleinste zoom: 0,55 in de viewer, 0,1 in de Lakstudio (§4.12). */
  zoomMin = ZOOM_MIN
  /** De doos in de wereld (min, max). */
  private doos: { min: Vec3; max: Vec3 } = { min: [-1.25, 0, -6], max: [1.25, 3, 6] }

  zetDoos(min: Vec3, max: Vec3): void {
    this.doos = { min, max }
  }

  /** Terug naar de beginstand, zonder naloop (een nieuwe bus). */
  herbegin(): void {
    this.doelStand = { ...BEGIN }
    this.nu = { ...BEGIN }
  }

  sleep(dx: number, dy: number): void {
    // Draaien in een plat aanzicht schakelt naar Schuin (§2.3).
    if (this.plat) {
      this.plat = undefined
      this.doelStand = { ...STANDEN.schuin, zoom: 1 }
      this.nu = { ...this.doelStand }
    }
    this.doelStand.draai -= dx * 0.35
    this.doelStand.kantel = klem(this.doelStand.kantel + dy * 0.25, KANTEL_MIN, KANTEL_MAX)
  }

  draai(graden: number): void {
    this.doelStand.draai += graden
  }

  kantel(graden: number): void {
    this.doelStand.kantel = klem(this.doelStand.kantel + graden, KANTEL_MIN, KANTEL_MAX)
  }

  zoomStap(factor: number): void {
    this.doelStand.zoom = klem(this.doelStand.zoom * factor, this.zoomMin, ZOOM_MAX)
  }

  /** Verschuiven in het beeldvlak: dx/dy in pixels van een beeld dat `hoogte` pixels hoog is. */
  schuif(dx: number, dy: number, hoogte = 800): void {
    const c = this.beeld(1)
    const rechts: Vec3 = [c.beeld[0], c.beeld[4], c.beeld[8]]
    const op: Vec3 = [c.beeld[1], c.beeld[5], c.beeld[9]]
    const r = this.inpasAfstand(1) * this.nu.zoom
    const perPixel = (2 * r * Math.tan(LENS / 2)) / Math.max(1, hoogte)
    for (let a = 0; a < 3; a++) this.schuifBij[a] += (-rechts[a] * dx + op[a] * dy) * perPixel
  }

  stand(naam: Stand): void {
    if (naam === 'links' || naam === 'rechts' || naam === 'voorvlak' || naam === 'achtervlak' || naam === 'dak') {
      this.plat = naam
      this.doelStand = { ...this.doelStand, zoom: 1 }
      this.schuifBij = [0, 0, 0]
      return
    }
    this.plat = undefined
    if (naam === 'terug') {
      this.doelStand = { ...BEGIN }
      this.schuifBij = [0, 0, 0]
      return
    }
    const s = STANDEN[naam]
    // De kortste weg rond: niet 330° terugdraaien voor een stap van 30°.
    let draai = s.draai
    while (draai - this.doelStand.draai > 180) draai -= 360
    while (draai - this.doelStand.draai < -180) draai += 360
    this.doelStand = { draai, kantel: s.kantel, zoom: 1 }
  }

  /** Eén stap naloop; geeft `true` zolang de camera nog beweegt. */
  stap(dt: number): boolean {
    const k = 1 - Math.exp(-Math.max(0, dt) / TAU)
    let beweegt = false
    for (const veld of ['draai', 'kantel', 'zoom'] as const) {
      const verschil = this.doelStand[veld] - this.nu[veld]
      const drempel = veld === 'zoom' ? 1e-4 : 0.01
      if (Math.abs(verschil) <= drempel) this.nu[veld] = this.doelStand[veld]
      else {
        this.nu[veld] += verschil * k
        beweegt = true
      }
    }
    return beweegt
  }

  /** Meteen op het doel (afdrukken, meten). */
  spring(): void {
    this.nu = { ...this.doelStand }
  }

  /** Het midden waar de camera op mikt: het midden van de doos, met de hoogte × 0,75. */
  mikpunt(): Vec3 {
    const d = this.doos
    return [(d.min[0] + d.max[0]) / 2, ((d.min[1] + d.max[1]) / 2) * 0.75, (d.min[2] + d.max[2]) / 2]
  }

  /** De afstand bij zoom 1 voor deze beeldverhouding (§6). */
  inpasAfstand(verhouding: number): number {
    const d = this.doos
    const lengte = d.max[2] - d.min[2]
    const hoogte = d.max[1] - d.min[1]
    const t = Math.tan(LENS / 2)
    return Math.max((lengte / 2 + 1) / (t * verhouding * 0.92), hoogte / 2 / (t * 0.85), 8)
  }

  /**
   * De matrices voor een beeld. `anders` voor een afdruk met een eigen stand of
   * een eigen mikpunt en afstand (de close-up van een zijruit).
   */
  /**
   * Een plat aanzicht (§4.12): orthografisch van opzij, voor, achter of boven,
   * passend op de doos, met de zoom en de verschuiving erbij. `plat` kan ook van
   * buiten komen (de tweede viewport toont de andere kant).
   */
  platBeeld(verhouding: number, plat: Plat, zoom = this.nu.zoom): CameraBeeld {
    const d = this.doos
    const midden: Vec3 = [(d.min[0] + d.max[0]) / 2 + this.schuifBij[0], (d.min[1] + d.max[1]) / 2 + this.schuifBij[1], (d.min[2] + d.max[2]) / 2 + this.schuifBij[2]]
    const maat: Vec3 = [d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]]
    const r = Math.max(maat[0], maat[1], maat[2]) + 5
    // In de wereld is x gespiegeld: de rechterzijde (deurkant, o3d +x) ligt aan -X.
    const richting: Record<Plat, { oog: Vec3; op: Vec3; b: number; h: number }> = {
      rechts: { oog: [-1, 0, 0], op: [0, 1, 0], b: maat[2], h: maat[1] },
      links: { oog: [1, 0, 0], op: [0, 1, 0], b: maat[2], h: maat[1] },
      voorvlak: { oog: [0, 0, 1], op: [0, 1, 0], b: maat[0], h: maat[1] },
      achtervlak: { oog: [0, 0, -1], op: [0, 1, 0], b: maat[0], h: maat[1] },
      dak: { oog: [0, 1, 0], op: [0, 0, 1], b: maat[0], h: maat[2] }
    }
    const k = richting[plat]
    const oog: Vec3 = [midden[0] + k.oog[0] * r, midden[1] + k.oog[1] * r, midden[2] + k.oog[2] * r]
    const beeld = kijkNaar(oog, midden, k.op)
    // Inpassen met 8% rand, dan de zoom.
    let halfB = (k.b / 2) * 1.08
    let halfH = (k.h / 2) * 1.08
    if (halfB / halfH < verhouding) halfB = halfH * verhouding
    else halfH = halfB / verhouding
    halfB *= zoom
    halfH *= zoom
    const proj = orthografisch(-halfB, halfB, -halfH, halfH, 0.1, 2 * r + 20)
    return { beeld, proj, beeldProj: vermenigvuldig(proj, beeld), oog, doel: midden, dichtbij: 0.1, ver: 2 * r + 20 }
  }

  beeld(verhouding: number, anders?: { stand?: CameraStand; doel?: Vec3; afstand?: number }): CameraBeeld {
    if (this.plat && !anders) return this.platBeeld(verhouding, this.plat)
    const s = anders?.stand ?? this.nu
    const doel: Vec3 = [...(anders?.doel ?? this.mikpunt())]
    if (!anders) for (let a = 0; a < 3; a++) doel[a] += this.schuifBij[a]
    const r = anders?.afstand ?? this.inpasAfstand(verhouding) * s.zoom
    const d = graden(s.draai)
    const k = graden(s.kantel)
    const oog: Vec3 = [
      doel[0] + r * Math.cos(k) * Math.sin(d),
      doel[1] + r * Math.sin(k),
      doel[2] - r * Math.cos(k) * Math.cos(d)
    ]
    // Nooit lager dan 0,6 m: dan gaat de camera omhoog en blijft hij op het doel gericht.
    if (oog[1] < 0.6) oog[1] = 0.6
    const maat = Math.max(this.doos.max[2] - this.doos.min[2], this.doos.max[1] - this.doos.min[1], 4)
    const dichtbij = Math.max(0.05, Math.min(r - maat, r * 0.2))
    const ver = Math.max(1200, r * 4)
    const proj = perspectief(LENS, verhouding, dichtbij, ver)
    let beeld = kijkNaar(oog, doel)
    if (!anders?.doel) {
      /*
       * Zijdelings in het midden: door het perspectief staat de dichtbije kop
       * groter in beeld dan de verre, en dan valt het midden van de doos niet
       * in het midden van het beeld (een gelede bus hing er aan één kant uit).
       * Twee keer de doos projecteren en de camera opzij schuiven, zodat de
       * uitersten even ver van de randen liggen.
       */
      const rechts: Vec3 = [beeld[0], beeld[4], beeld[8]]
      const breedte = r * Math.tan(LENS / 2) * verhouding
      for (let i = 0; i < 2; i++) {
        const bp = vermenigvuldig(proj, beeld)
        let x0 = Infinity
        let x1 = -Infinity
        for (const x of [this.doos.min[0], this.doos.max[0]])
          for (const y of [this.doos.min[1], this.doos.max[1]])
            for (const z of [this.doos.min[2], this.doos.max[2]]) {
              const p = projecteer(bp, [x, y, z])
              if (p[3] <= 0) continue
              x0 = Math.min(x0, p[0])
              x1 = Math.max(x1, p[0])
            }
        if (!Number.isFinite(x0)) break
        const schuif = ((x0 + x1) / 2) * breedte
        for (let a = 0; a < 3; a++) {
          oog[a] += rechts[a] * schuif
          doel[a] += rechts[a] * schuif
        }
        beeld = kijkNaar(oog, doel)
      }
    }
    return { beeld, proj, beeldProj: vermenigvuldig(proj, beeld), oog, doel, dichtbij, ver }
  }

  /**
   * De camera van de foto v4 (§9): de beginstand (215°/8°), en de afstand zo dat
   * de doos precies `deel` van de breedte beslaat -- of minder als hij anders te
   * hoog wordt (hooguit 90% van de hoogte). Door het perspectief is dat niet in
   * één keer uit te rekenen; vier stappen zijn ruim genoeg.
   */
  fotoBeeld(verhouding: number, deel = 0.88): CameraBeeld {
    const stand: CameraStand = { ...BEGIN }
    let r = this.inpasAfstand(verhouding)
    let c = this.beeld(verhouding, { stand, afstand: r })
    for (let i = 0; i < 4; i++) {
      const m = this.maatInBeeld(c)
      if (!m) break
      const factor = Math.max(m.breedte / (2 * deel), m.hoogte / (2 * 0.9))
      if (!(factor > 0) || Math.abs(factor - 1) < 0.002) break
      r *= factor
      c = this.beeld(verhouding, { stand, afstand: r })
    }
    /*
     * Ook in de hoogte in het midden, iets erboven: het mikpunt ligt op 75% van de
     * hoogte (§6), en dan zakte de bus op de foto naar de onderrand, waar de
     * contactschaduw eraf viel.
     */
    const m = this.maatInBeeld(c)
    if (m) {
      const schuif = (m.midden - 0.04) * r * Math.tan(LENS / 2)
      const op: Vec3 = [c.beeld[1], c.beeld[5], c.beeld[9]]
      const oog: Vec3 = [c.oog[0] + op[0] * schuif, c.oog[1] + op[1] * schuif, c.oog[2] + op[2] * schuif]
      const doel: Vec3 = [c.doel[0] + op[0] * schuif, c.doel[1] + op[1] * schuif, c.doel[2] + op[2] * schuif]
      const beeld = kijkNaar(oog, doel)
      c = { ...c, beeld, oog, doel, beeldProj: vermenigvuldig(c.proj, beeld) }
    }
    return c
  }

  /** Hoe breed en hoog de doos in beeld staat, en het midden in de hoogte (in NDC, 2 = het hele beeld). */
  private maatInBeeld(c: CameraBeeld): { breedte: number; hoogte: number; midden: number } | undefined {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const x of [this.doos.min[0], this.doos.max[0]])
      for (const y of [this.doos.min[1], this.doos.max[1]])
        for (const z of [this.doos.min[2], this.doos.max[2]]) {
          const p = projecteer(c.beeldProj, [x, y, z])
          if (p[3] <= 0) return undefined
          x0 = Math.min(x0, p[0])
          x1 = Math.max(x1, p[0])
          y0 = Math.min(y0, p[1])
          y1 = Math.max(y1, p[1])
        }
    return { breedte: x1 - x0, hoogte: y1 - y0, midden: (y0 + y1) / 2 }
  }
}

function klem(w: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, w))
}
