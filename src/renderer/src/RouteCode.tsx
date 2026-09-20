import type { JSX } from 'react'

interface Props {
  /** De volle code, zoals hij in het wagenpark staat: 85302. */
  route?: string
  /** Het staartje zonder het lijnnummer ervoor: 02. */
  kort?: string
}

/**
 * Het routenummer zoals je het intoetst, met de nadruk op het staartje.
 *
 * WAAROM NIET GEWOON HET STAARTJE
 * Dat stond hier eerst, en het brak het rijden. Wagenparken schrijven hun
 * routecodes met de lijn erin -- lijn 853 heeft route 85302 -- en dat is ook
 * wat de IBIS wil zien. Wie "02" intoetst krijgt zijn route niet gezet, en dan
 * meldt de bus geen haltes en komt de navigatie nooit op gang.
 *
 * Maar de klacht erachter klopte wel: met het lijnnummer er al naast is
 * driekwart van die code een herhaling, terwijl juist het staartje zegt welke
 * kant je oprijdt. Dus staat de code er voluit -- je moet hem voluit intoetsen --
 * en is alleen het begin gedempt. Je typt 85302 en je oog ziet 02.
 */
export function RouteCode({ route, kort }: Props): JSX.Element {
  if (!route) return <>—</>
  const staart = kort && kort !== route && route.endsWith(kort) ? kort : undefined
  if (!staart) return <>{route}</>
  return (
    <>
      <span className="routekop">{route.slice(0, route.length - staart.length)}</span>
      {staart}
    </>
  )
}
