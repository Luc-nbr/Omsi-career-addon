import { useLayoutEffect, useRef, useState, type JSX } from 'react'

/**
 * Een grafiek voor het dashboard van het busbedrijf: één reeks over de
 * bedrijfsdagen, als lijn (kas, reputatie) of als staafjes (resultaat per dag).
 *
 * Eén reeks per grafiek en één as: twee grootheden van een andere orde (kas en
 * reputatie) staan in twee grafieken, niet op twee assen in één. Geen legenda --
 * de titel van het paneel zegt wat het is. Dunne lijnen, staafjes met ronde
 * uiteinden vanaf de nullijn, een terughoudend raster, en bij aanwijzen een
 * kruisdraad met de waarde, want een getal op elk punt maakt het onleesbaar.
 *
 * Zelf getekend in SVG en niet uit een bibliotheek: het zijn een paar lijnen,
 * en de app draait zonder internet.
 */
export function Grafiek({
  soort,
  punten,
  opmaak,
  xNaam,
  leeg,
  bereik,
  klein,
  asOpmaak
}: {
  soort: 'lijn' | 'staaf'
  punten: Array<{ x: number; y: number }>
  opmaak: (waarde: number) => string
  xNaam: (x: number) => string
  /** Wat er staat als er nog geen afgesloten dag is. */
  leeg: string
  /** Vaste onder- en bovengrens, bijvoorbeeld 0 tot 100 voor de reputatie. */
  bereik?: [number, number]
  klein?: boolean
  /** Hoe de getallen op de as staan; standaard als `opmaak`. */
  asOpmaak?: (waarde: number) => string
}): JSX.Element {
  const vak = useRef<HTMLDivElement>(null)
  const [breed, setBreed] = useState(600)
  const [wijs, setWijs] = useState<number>()
  const hoog = klein ? 150 : 200

  useLayoutEffect(() => {
    const el = vak.current
    if (!el) return
    const meet = (): void => setBreed(Math.max(200, el.clientWidth))
    meet()
    const kijker = new ResizeObserver(meet)
    kijker.observe(el)
    return () => kijker.disconnect()
  }, [])

  if (punten.length === 0) {
    return (
      <div className="bd-grafiek leeg" style={{ height: hoog }}>
        {leeg}
      </div>
    )
  }

  // Marges: links ruimte voor de waarden, onder voor de dagen.
  const links = 72
  const rechts = 12
  const boven = 10
  const onder = 24
  const w = breed - links - rechts
  const h = hoog - boven - onder

  const ys = punten.map((p) => p.y)
  let laag = bereik ? bereik[0] : Math.min(...ys, soort === 'staaf' ? 0 : Infinity)
  let hoogste = bereik ? bereik[1] : Math.max(...ys, soort === 'staaf' ? 0 : -Infinity)
  if (laag === hoogste) {
    laag -= 1
    hoogste += 1
  }
  // Ronde grenzen, zodat de rasterlijnen op ronde getallen vallen.
  const raster = bereik ? [0, 1, 2, 3].map((k) => laag + ((hoogste - laag) * k) / 3) : rondeStappen(laag, hoogste)
  if (!bereik) {
    laag = raster[0]
    hoogste = raster[raster.length - 1]
  }
  const y = (v: number): number => boven + h - ((v - laag) / (hoogste - laag)) * h
  const n = punten.length
  const stap = w / Math.max(1, soort === 'staaf' ? n : n - 1)
  const x = (i: number): number =>
    links + (soort === 'staaf' ? stap * i + stap / 2 : n === 1 ? w / 2 : stap * i)

  // Dagen onder de as: niet elke dag, anders lopen ze in elkaar.
  const elke = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))))

  const pad = punten.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const vlak = `${pad} L${x(n - 1).toFixed(1)},${(boven + h).toFixed(1)} L${x(0).toFixed(1)},${(boven + h).toFixed(1)} Z`
  const nul = y(Math.max(laag, Math.min(hoogste, 0)))
  const staafBreed = Math.max(2, Math.min(28, stap - 2))

  const aanwijzen = (clientX: number): void => {
    const el = vak.current
    if (!el) return
    const px = clientX - el.getBoundingClientRect().left - links
    const i = soort === 'staaf' ? Math.floor(px / stap) : Math.round(px / stap)
    setWijs(Math.max(0, Math.min(n - 1, i)))
  }

  const gewezen = wijs !== undefined ? punten[wijs] : undefined

  return (
    <div
      ref={vak}
      className="bd-grafiek"
      onMouseMove={(e) => aanwijzen(e.clientX)}
      onMouseLeave={() => setWijs(undefined)}
    >
      <svg width={breed} height={hoog} role="img" aria-label={punten.map((p) => `${xNaam(p.x)}: ${opmaak(p.y)}`).join(', ')}>
        {raster.map((v, k) => (
          <g key={k}>
            <line className="bd-raster" x1={links} x2={links + w} y1={y(v)} y2={y(v)} />
            <text className="bd-as" x={links - 8} y={y(v) + 4} textAnchor="end">
              {(asOpmaak ?? opmaak)(v)}
            </text>
          </g>
        ))}
        {punten.map((p, i) =>
          i % elke === 0 ? (
            <text key={p.x} className="bd-as" x={x(i)} y={hoog - 6} textAnchor="middle">
              {p.x}
            </text>
          ) : null
        )}

        {soort === 'lijn' ? (
          <>
            <path className="bd-vlak" d={vlak} />
            <path className="bd-lijnpad" d={pad} />
            {n === 1 && <circle className="bd-punt" cx={x(0)} cy={y(punten[0].y)} r={4} />}
          </>
        ) : (
          <>
            <line className="bd-nul" x1={links} x2={links + w} y1={nul} y2={nul} />
            {punten.map((p, i) => {
              const top = Math.min(y(p.y), nul)
              const hoogte = Math.max(1, Math.abs(y(p.y) - nul))
              return (
                <rect
                  key={p.x}
                  className={`bd-staaf ${p.y < 0 ? 'min' : ''} ${wijs === i ? 'gewezen' : ''}`}
                  x={x(i) - staafBreed / 2}
                  y={top}
                  width={staafBreed}
                  height={hoogte}
                  rx={Math.min(4, staafBreed / 2)}
                />
              )
            })}
          </>
        )}

        {gewezen && wijs !== undefined && (
          <>
            <line className="bd-draad" x1={x(wijs)} x2={x(wijs)} y1={boven} y2={boven + h} />
            {soort === 'lijn' && <circle className="bd-punt" cx={x(wijs)} cy={y(gewezen.y)} r={5} />}
          </>
        )}
      </svg>
      {gewezen && wijs !== undefined && (
        <div
          className="bd-tip"
          style={{
            left: Math.min(Math.max(x(wijs), links + 60), breed - 70),
            top: Math.max(4, y(gewezen.y) - 46)
          }}
        >
          <small>{xNaam(gewezen.x)}</small>
          <b>{opmaak(gewezen.y)}</b>
        </div>
      )}
    </div>
  )
}

/**
 * Drie à vier rasterlijnen op ronde waarden die het bereik omvatten: een stap
 * van 1, 2 of 5 maal een macht van tien.
 */
function rondeStappen(laag: number, hoog: number): number[] {
  const ruw = (hoog - laag) / 3
  const macht = Math.pow(10, Math.floor(Math.log10(Math.max(ruw, 1e-9))))
  const stap = [1, 2, 5, 10].map((f) => f * macht).find((s) => s >= ruw) ?? 10 * macht
  const begin = Math.floor(laag / stap) * stap
  const uit: number[] = []
  for (let v = begin; v < hoog + stap * 0.999; v += stap) uit.push(v)
  return uit.length >= 2 ? uit : [begin, begin + stap]
}
