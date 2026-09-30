/**
 * KLEURZONES EN DE RAAMLIJN (lakstudio-ontwerp §4.3)
 *
 * De zones: uit de detailbron op 1/8 (readPixels), alleen texels die gelakt
 * mogen worden (masker > 0,5), k-means in Lab met k = 2..8 en een elleboog van
 * 15%; centra dichter dan ΔE 8 samengevoegd. Een zone die ≥ 10% van de lak
 * beslaat is een LAKZONE (Z = 1); de rest (rubbers, lampen, roosters,
 * ingebakken opschriften) blijft vrij, bij elke laagsoort. Puur, zonder GPU.
 *
 * De raamlijn per zijde: de onderkant die het vaakst voorkomt (in klassen van
 * 5 cm) van glas zonder animatie (deurglas loopt bij een lagevloerbus bijna tot
 * de vloer; kritiek punt 8).
 */

export interface Zone {
  lab: [number, number, number]
  /** Het deel van de lak (0..1). */
  deel: number
  lak: boolean
  /** De mediane kleur als sRGB-bytes (voor "Effen in de kleuren van deze lak"). */
  kleur: [number, number, number]
}

const naarLin = (s: number): number => {
  const c = s / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function srgbNaarLab(r: number, g: number, b: number): [number, number, number] {
  const R = naarLin(r)
  const G = naarLin(g)
  const B = naarLin(b)
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const afstand = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Een eenvoudige willekeur met een zaad: dezelfde bus geeft dezelfde zones. */
function lcg(zaad: number): () => number {
  let s = zaad >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function kmeans(punten: Float64Array, n: number, k: number, rnd: () => number): { centra: number[][]; toe: Uint8Array; fout: number } {
  // Platte arrays en vermenigvuldigen in plaats van ** (met ** en arrays van arrays: 54 ms op de SD77).
  const c = new Float64Array(k * 3)
  // k-means++ als begin.
  const eerste = Math.floor(rnd() * n)
  c[0] = punten[eerste * 3]
  c[1] = punten[eerste * 3 + 1]
  c[2] = punten[eerste * 3 + 2]
  const d2 = new Float64Array(n).fill(Infinity)
  for (let m = 1; m < k; m++) {
    let som = 0
    const cx = c[(m - 1) * 3]
    const cy = c[(m - 1) * 3 + 1]
    const cz = c[(m - 1) * 3 + 2]
    for (let i = 0; i < n; i++) {
      const dx = punten[i * 3] - cx
      const dy = punten[i * 3 + 1] - cy
      const dz = punten[i * 3 + 2] - cz
      const d = dx * dx + dy * dy + dz * dz
      if (d < d2[i]) d2[i] = d
      som += d2[i]
    }
    let r = rnd() * som
    let kies = n - 1
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r <= 0) {
        kies = i
        break
      }
    }
    c[m * 3] = punten[kies * 3]
    c[m * 3 + 1] = punten[kies * 3 + 1]
    c[m * 3 + 2] = punten[kies * 3 + 2]
  }
  const toe = new Uint8Array(n).fill(255)
  const som = new Float64Array(k * 4)
  let fout = 0
  for (let ronde = 0; ronde < 12; ronde++) {
    fout = 0
    let anders = 0
    som.fill(0)
    for (let i = 0; i < n; i++) {
      const px = punten[i * 3]
      const py = punten[i * 3 + 1]
      const pz = punten[i * 3 + 2]
      let best = 0
      let bd = Infinity
      for (let m = 0; m < k; m++) {
        const dx = px - c[m * 3]
        const dy = py - c[m * 3 + 1]
        const dz = pz - c[m * 3 + 2]
        const d = dx * dx + dy * dy + dz * dz
        if (d < bd) {
          bd = d
          best = m
        }
      }
      if (toe[i] !== best) anders++
      toe[i] = best
      fout += bd
      som[best * 4] += px
      som[best * 4 + 1] += py
      som[best * 4 + 2] += pz
      som[best * 4 + 3]++
    }
    for (let m = 0; m < k; m++) {
      const t = som[m * 4 + 3]
      if (t > 0) {
        c[m * 3] = som[m * 4] / t
        c[m * 3 + 1] = som[m * 4 + 1] / t
        c[m * 3 + 2] = som[m * 4 + 2] / t
      }
    }
    // Stabiel (minder dan 0,5% wisselt nog): klaar.
    if (anders < n / 200) break
  }
  const centra: number[][] = []
  for (let m = 0; m < k; m++) centra.push([c[m * 3], c[m * 3 + 1], c[m * 3 + 2]])
  return { centra, toe, fout }
}

/**
 * De zones uit een klein beeld (RGBA-bytes, A = masker 0..255). Hooguit 4.096
 * monsters (gelijkmatig over de lak): met 20.000 duurde k = 2..8 op de SD77
 * 60-140 ms; geeft ook hoe lang het duurde (P3: ≤ 50 ms).
 */
export function zonesVan(px: Uint8Array, zaad = 7): { zones: Zone[]; ms: number } {
  const t0 = performance.now()
  const idx: number[] = []
  for (let i = 0; i < px.length / 4; i++) if (px[i * 4 + 3] > 127) idx.push(i)
  if (idx.length < 16) return { zones: [], ms: performance.now() - t0 }
  const rnd = lcg(zaad)
  const stap = Math.max(1, Math.floor(idx.length / 4096))
  const n = Math.floor(idx.length / stap)
  const punten = new Float64Array(n * 3)
  const bytes = new Uint8Array(n * 3)
  for (let j = 0; j < n; j++) {
    const i = idx[j * stap] * 4
    const lab = srgbNaarLab(px[i], px[i + 1], px[i + 2])
    punten.set(lab, j * 3)
    bytes.set([px[i], px[i + 1], px[i + 2]], j * 3)
  }
  // De elleboog: de kleinste k waarna een extra zone minder dan 15% van de fout wint.
  let gekozen = kmeans(punten, n, 2, rnd)
  for (let k = 3; k <= 8; k++) {
    const volgende = kmeans(punten, n, k, rnd)
    if (gekozen.fout - volgende.fout < 0.15 * gekozen.fout) break
    gekozen = volgende
  }
  // Samenvoegen wat dichter dan ΔE 8 bij elkaar ligt.
  let centra = gekozen.centra.map((c, i) => ({ c, leden: [] as number[], i }))
  for (let j = 0; j < n; j++) centra[gekozen.toe[j]].leden.push(j)
  let samen = true
  while (samen) {
    samen = false
    outer: for (let a = 0; a < centra.length; a++) {
      for (let b = a + 1; b < centra.length; b++) {
        if (afstand(centra[a].c, centra[b].c) < 8) {
          const la = centra[a].leden.length
          const lb = centra[b].leden.length
          const c = [0, 1, 2].map((k) => (centra[a].c[k] * la + centra[b].c[k] * lb) / Math.max(1, la + lb))
          centra[a] = { c, leden: [...centra[a].leden, ...centra[b].leden], i: centra[a].i }
          centra.splice(b, 1)
          samen = true
          break outer
        }
      }
    }
  }
  centra = centra.filter((c) => c.leden.length > 0)
  const zones: Zone[] = centra
    .map((c) => {
      const deel = c.leden.length / n
      // De mediane kleur per kanaal.
      const kanaal = (k: number): number => {
        const w = c.leden.map((j) => bytes[j * 3 + k]).sort((x, y) => x - y)
        return w[Math.floor(w.length / 2)] ?? 0
      }
      return { lab: c.c as [number, number, number], deel, lak: deel >= 0.1, kleur: [kanaal(0), kanaal(1), kanaal(2)] as [number, number, number] }
    })
    .sort((a, b) => b.deel - a.deel)
  /*
   * Donker en kleurloos (L* < 30, chroma < 12: rubber, chassis, ruitenwissers,
   * spiegels) is nooit lak, behalve als het de grootste zone is (een zwarte bus).
   * Zonder deze regel lakte de SD77 zijn onderkant mee: 137.000 texels waar MA
   * van het Repaint-Tool 0 zegt (84,8% gelijk aan MA, P5).
   */
  zones.forEach((z, i) => {
    if (i > 0 && z.lab[0] < 30 && Math.hypot(z.lab[1], z.lab[2]) < 12) z.lak = false
  })
  /*
   * Een schaduw of vuil van de lak: een zone (≥ 2%) met dezelfde tint als een
   * lakzone (kleurhoek binnen 12°, verzadiging 0,6-1,6 keer, niet kleurloos) is
   * ook lak. Op de SD77 was het crème in de schaduw (7,7%) anders vrij, terwijl
   * MA van het Repaint-Tool het lakt.
   */
  const tint = (z: Zone): { c: number; h: number } => ({ c: Math.hypot(z.lab[1], z.lab[2]), h: Math.atan2(z.lab[2], z.lab[1]) })
  const lakTinten = zones.filter((z) => z.lak).map(tint).filter((t) => t.c >= 12)
  for (const z of zones) {
    if (z.lak || z.deel < 0.02) continue
    const t = tint(z)
    if (t.c < 12) continue
    const verschil = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
    if (lakTinten.some((l) => verschil(l.h, t.h) < (12 * Math.PI) / 180 && t.c / l.c >= 0.6 && t.c / l.c <= 1.6)) z.lak = true
  }
  /*
   * Hetzelfde voor kleurloze lak: zijn er twee kleurloze lakzones (de HH20: zwart
   * en lichtgrijs, met verloop ertussen), dan is elk grijs daartussen (≥ 2%) ook
   * lak. Anders viel het verloop in zones onder 10% en bleef het oude grijs onder
   * de weggehaalde letters staan.
   */
  const grijsLak = zones.filter((z) => z.lak && tint(z).c < 12).map((z) => z.lab[0])
  if (grijsLak.length >= 2) {
    const laag = Math.min(...grijsLak) - 5
    const hoog = Math.max(...grijsLak) + 5
    for (const z of zones) if (!z.lak && z.deel >= 0.02 && tint(z).c < 12 && z.lab[0] >= laag && z.lab[0] <= hoog) z.lak = true
  }
  return { zones, ms: performance.now() - t0 }
}

/** De raamlijn: de meest voorkomende onderkant (klassen van 5 cm) van glasdriehoeken zonder animatie, per zijde. */
export function raamlijn(glas: Array<{ y: number; x: number; opp: number }>): { L?: number; R?: number } {
  const uit: { L?: number; R?: number } = {}
  for (const zijde of ['L', 'R'] as const) {
    const klassen = new Map<number, number>()
    for (const g of glas) {
      if ((zijde === 'R') !== g.x > 0) continue
      const k = Math.round(g.y / 0.05)
      klassen.set(k, (klassen.get(k) ?? 0) + g.opp)
    }
    let beste: number | undefined
    let bw = 0
    for (const [k, w] of klassen) if (w > bw) {
      bw = w
      beste = k
    }
    if (beste !== undefined) uit[zijde] = beste * 0.05
  }
  return uit
}
