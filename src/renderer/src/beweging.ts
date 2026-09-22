import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Beweging die op de speler reageert: tegels die kantelen, een achtergrond die
 * meeschuift, cijfers die optellen.
 *
 * WAT HIER NIET IN ZIT
 * Niets dat uit zichzelf blijft bewegen. De app staat vaak naast OMSI open, en
 * elke verversing van het venster kost het spel beeldjes -- de overlay stuurt
 * om die reden al niets als er niets veranderd is. Alles hieronder beweegt dus
 * alleen als jij iets doet, of een keer bij het binnenkomen, en staat daarna
 * stil. Wie in Windows minder beweging heeft gekozen, krijgt er niets van.
 */

/** Wil de speler minder beweging? */
export function rustig(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const KANTEL_VARS = ['--kx', '--ky', '--px', '--py', '--gx', '--gy']

/** De tegel die nu scheef staat; er is er hooguit een, want er is een muis. */
let gekanteld: HTMLElement | undefined

function zetRecht(tegel: HTMLElement): void {
  delete tegel.dataset.kantelt
  for (const naam of KANTEL_VARS) tegel.style.removeProperty(naam)
}

/**
 * Laat de tegel onder de muis naar de muis toe kantelen.
 *
 * Aan de houder van de tegels, niet aan elke tegel: een rooster van dertien
 * kaarten krijgt zo een handler in plaats van dertien. De stand gaat als
 * CSS-variabelen op de tegel zelf (`--kx`/`--ky` in graden, `--px`/`--py` van
 * -1 tot 1, `--gx`/`--gy` waar de glans valt) -- geen React-state, want dat zou
 * bij elke muisbeweging het hele scherm opnieuw laten rekenen.
 */
export function kantel(event: ReactPointerEvent<HTMLElement>, keuze: string, graden = 6): void {
  if (event.pointerType !== 'mouse' || rustig()) return
  const tegel = (event.target as Element).closest<HTMLElement>(keuze)
  if (gekanteld && gekanteld !== tegel) {
    zetRecht(gekanteld)
    gekanteld = undefined
  }
  if (!tegel || !event.currentTarget.contains(tegel)) return
  if (tegel instanceof HTMLButtonElement && tegel.disabled) return
  const vak = tegel.getBoundingClientRect()
  if (vak.width === 0 || vak.height === 0) return
  const x = Math.min(1, Math.max(0, (event.clientX - vak.left) / vak.width))
  const y = Math.min(1, Math.max(0, (event.clientY - vak.top) / vak.height))
  const px = x * 2 - 1
  const py = y * 2 - 1
  tegel.dataset.kantelt = ''
  tegel.style.setProperty('--kx', `${(-py * graden).toFixed(2)}deg`)
  tegel.style.setProperty('--ky', `${(px * graden).toFixed(2)}deg`)
  tegel.style.setProperty('--px', px.toFixed(3))
  tegel.style.setProperty('--py', py.toFixed(3))
  tegel.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`)
  tegel.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`)
  gekanteld = tegel
}

/** De muis is weg: de tegel veert terug (de CSS-overgang doet het veren). */
export function kantelLos(): void {
  if (gekanteld) zetRecht(gekanteld)
  gekanteld = undefined
}

/**
 * De achtergrond schuift een beetje mee met de muis, als een raam waar je
 * langs kijkt. Hooguit een keer per beeld: een muis meldt zich vaker dan het
 * scherm ververst.
 */
let meebewegenGepland = 0

export function meebewegen(event: ReactPointerEvent<HTMLElement>): void {
  if (event.pointerType !== 'mouse' || rustig()) return
  const vlak = event.currentTarget
  const x = (event.clientX / window.innerWidth) * 2 - 1
  const y = (event.clientY / window.innerHeight) * 2 - 1
  cancelAnimationFrame(meebewegenGepland)
  meebewegenGepland = requestAnimationFrame(() => {
    vlak.style.setProperty('--hx', x.toFixed(3))
    vlak.style.setProperty('--hy', y.toFixed(3))
  })
}

export function meebewegenLos(event: ReactPointerEvent<HTMLElement>): void {
  cancelAnimationFrame(meebewegenGepland)
  event.currentTarget.style.removeProperty('--hx')
  event.currentTarget.style.removeProperty('--hy')
}

/**
 * Een getal dat naar zijn waarde toe telt: bij het binnenkomen van 0, en als
 * het later verandert van de oude waarde naar de nieuwe. De staat van dienst
 * komt een tel later binnen dan het scherm; dan telt hij vanaf daar op.
 */
export function useOptellen(doel: number, duur = 900): number {
  const [waarde, setWaarde] = useState(() => (rustig() ? doel : 0))
  const getoond = useRef(waarde)
  useEffect(() => {
    const van = getoond.current
    if (rustig() || van === doel) {
      getoond.current = doel
      setWaarde(doel)
      return undefined
    }
    let begin: number | undefined
    let beeld = 0
    const stap = (nu: number): void => {
      begin ??= nu
      const t = Math.min(1, (nu - begin) / duur)
      // Snel weg, rustig aankomen: zo leest het eindgetal als het getal.
      const deel = 1 - Math.pow(1 - t, 3)
      const nieuw = van + (doel - van) * deel
      getoond.current = nieuw
      setWaarde(nieuw)
      if (t < 1) beeld = requestAnimationFrame(stap)
    }
    beeld = requestAnimationFrame(stap)
    return () => cancelAnimationFrame(beeld)
  }, [doel, duur])
  return waarde
}

/** Welk deel van de dag het is, voor de begroeting. */
export function dagdeel(uur = new Date().getHours()): 'ochtend' | 'middag' | 'avond' | 'nacht' {
  if (uur < 6) return 'nacht'
  if (uur < 12) return 'ochtend'
  if (uur < 18) return 'middag'
  return 'avond'
}
