import type { JSX } from 'react'

/**
 * Het lijnennet in de ondergrond.
 *
 * Glas heeft iets nodig om op te liggen: zonder iets erachter is doorzichtig
 * hetzelfde als grijs. En als er dan toch iets moet staan, laat het dan over
 * bussen gaan -- vier lijnen en zeven knooppunten, met dezelfde vorm als de
 * haltes op de navigatie.
 *
 * Het staat expres net onder de drempel waarop je het bewust ziet -- eerst stond
 * het te dik en las het als een diagram in plaats van als ondergrond; wie het
 * sterker of zwakker wil, verandert de dekking hieronder. Als element en niet
 * als achtergrondafbeelding, omdat een tekening in een stijlblad niet te
 * bekijken en niet te verstellen is.
 */
export function Backdrop(): JSX.Element {
  return (
    <svg
      className="backdrop-net"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g
        stroke="#ffffff"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.032}
      >
        <path d="M-60 820 L300 820 L470 650 L960 650 L1130 480 L1660 480" strokeWidth={9} />
        <path d="M170 1060 L170 540 L340 370 L340 -60" strokeWidth={7} />
        <path d="M-60 190 L610 190 L840 420 L840 1060" strokeWidth={7} />
        <path d="M1150 1060 L1150 760 L1360 550 L1660 550" strokeWidth={6} />
      </g>
      <g fill="#10141a" stroke="#ffffff" strokeWidth={4} opacity={0.055}>
        <circle cx={300} cy={820} r={11} />
        <circle cx={470} cy={650} r={11} />
        <circle cx={960} cy={650} r={11} />
        <circle cx={1130} cy={480} r={11} />
        <circle cx={340} cy={370} r={9} />
        <circle cx={840} cy={420} r={9} />
        <circle cx={1360} cy={550} r={9} />
      </g>
    </svg>
  )
}
