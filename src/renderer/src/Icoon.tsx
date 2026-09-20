import type { JSX } from 'react'

/**
 * De icoontjes van de app, op één plek.
 *
 * WAAROM ZE GETEKEND ZIJN EN NIET OPGEHAALD
 * Er stond er al een handvol in Setup.tsx, met erboven: "bewust klein en van één
 * gewicht; ze zijn label, geen plaatje." Dat is een stijl, en een stijl houd je
 * alleen als je er niets vreemds tussen zet. Een set uit een pictogrammenpakket
 * -- of uit een model -- komt met andere lijndiktes, andere hoekrondingen en een
 * ander optisch gewicht, en dat zie je meteen naast de zes die er al waren.
 *
 * HOE ZE GEBOUWD ZIJN
 * Allemaal op hetzelfde veld van 24 bij 24, gevuld en niet gelijnd, zodat ze bij
 * zestien pixels nog dicht blijven -- een lijn van twee pixels valt daar uit
 * elkaar. Ze dragen `currentColor`, dus ze volgen de tekst waar ze bij staan.
 *
 * `vulling` is er omdat er twee soorten vorm in zitten. Een ring of een pasje
 * met een uitsparing heeft `evenodd` nodig, anders loopt het gat dicht. Een wolk
 * is het tegenovergestelde: drie cirkels en een balk die elkaar overlappen, en
 * met `evenodd` zouden juist de overlappingen wit worden. Die heeft `nonzero`.
 */
export interface IcoonVorm {
  d: string
  /** Standaard `evenodd`; `nonzero` voor vormen die uit overlappende delen bestaan. */
  vulling?: 'nonzero'
  /** Met een lijn getekend in plaats van gevuld; alleen waar een vlak te zwaar wordt. */
  streek?: boolean
}

/*
 * Een zon van acht stralen. De schuine stralen staan als vierhoeken uitgerekend
 * en niet gedraaid: een transform op een pad binnen een symbool geeft bij
 * zestien pixels een halve pixel verschuiving, en dan staat de ene straal dikker
 * dan de andere.
 */
const ZONSTRALEN =
  'M11.1 2.8h1.8v2.8h-1.8Z M11.1 18.4h1.8v2.8h-1.8Z' +
  ' M2.8 11.1h2.8v1.8H2.8Z M18.4 11.1h2.8v1.8h-2.8Z' +
  ' M16.975 7.925 16.075 7.025 18.055 5.045 18.955 5.945Z' +
  ' M16.975 16.075 16.075 16.975 18.055 18.955 18.955 18.055Z' +
  ' M7.925 16.975 7.025 16.075 5.045 18.055 5.945 18.955Z' +
  ' M7.925 7.025 7.025 7.925 5.045 5.945 5.945 5.045Z'

/** De zon zelf: schijf met acht stralen. */
const ZON = `M12 7.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Z ${ZONSTRALEN}`

/** Een wolk met een vlakke onderkant: drie cirkels en een balk die overlappen. */
const WOLK = (dy: number): string =>
  `M8.5 ${10.5 + dy}a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z` +
  ` M12.5 ${7.5 + dy}a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z` +
  ` M16.6 ${11.5 + dy}a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z` +
  ` M5 ${14 + dy}h14.6v3.5H5Z`

/** Een druppel: punt naar boven, rond naar onder. */
const DRUPPEL = (x: number, y: number): string =>
  `M${x} ${y}l1.25 2.5a1.4 1.4 0 1 1-2.5 0Z`

export const ICONEN = {
  /* ---- de stappen; deze stonden al in Setup.tsx ---- */
  profile: { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4Z' },
  map: { d: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.2 6 2v11.6l-6-2V6.2Z' },
  line: { d: 'M4 20 10 8l4 6 6-10', streek: true },
  mode: {
    d: 'M12 2 4 6v6c0 5 3.4 9.1 8 10 4.6-.9 8-5 8-10V6l-8-4Zm0 2.2 6 3V12c0 3.9-2.5 7.2-6 8-3.5-.8-6-4.1-6-8V7.2l6-3Z'
  },
  duty: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 9V7h-2v7h6v-2h-4Z' },
  /* Een pasje met een stempel erop: waar je mee mag rijden, en wie dat zegt. */
  licence: {
    d: 'M3 5h18v14H3V5Zm2 2v10h14V7H5Zm1.5 2h6v1.6h-6V9Zm0 3h5v1.6h-5V12Zm9.5-2.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z'
  },
  bus: {
    d: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2v2h-3v-2H8v2H5v-2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 3v5h14V7H5Zm2 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'
  },

  /* ---- het weer, voor de chips op de ritstap ---- */
  weerHelder: { d: ZON },
  /*
   * Zomerdag: de zon met warmte eronder.
   *
   * Eerst stond hier een zonnetje met een wolkje ernaast, en op zestien pixels
   * werden dat twee vlekjes die elkaar raakten. Een zomerdag is in OMSI geen
   * ander weer dan helder maar warmer weer, dus dat is wat het icoon zegt: de
   * zon boven, en twee banden eronder die staan voor de hitte die van de straat
   * komt.
   */
  weerZomer: {
    d:
      'M12 4.2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z' +
      ' M11.1 0.6h1.8v2.4h-1.8Z M3.6 7.3h2.4v1.8H3.6Z M18 7.3h2.4v1.8H18Z' +
      ' M5.42 3.09 6.69 1.82 8.39 3.52 7.12 4.79Z' +
      ' M15.61 3.52 17.31 1.82 18.58 3.09 16.88 4.79Z' +
      ' M6.5 16.4h11v1.9h-11Z M8.5 20.1h7v1.9h-7Z'
  },
  weerBewolkt: { d: WOLK(0), vulling: 'nonzero' as const },
  weerRegen: {
    d: `${WOLK(-3)} ${DRUPPEL(7.6, 16.4)} ${DRUPPEL(11.6, 17.4)} ${DRUPPEL(15.6, 16.4)}`,
    vulling: 'nonzero' as const
  },
  /* Mist: banden die elkaar niet raken, in wisselende lengte. */
  weerMist: {
    d: 'M3.5 7h17v1.8h-17Z M6 11h14.5v1.8H6Z M3.5 15h13v1.8h-13Z M8 19h12.5v1.8H8Z'
  },

  /* ---- het dagdeel, voor de chips op de dienststap ---- */
  /* De hele klok rond: een ring, want er valt geen stand aan te wijzen. */
  dagHele: {
    d: 'M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6Zm0 3a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z'
  },
  /*
   * Ochtend en avond: dezelfde halve zon op dezelfde horizon, en het pijltje
   * zegt welke kant hij op gaat.
   *
   * Eerst wees de koepel de kant aan -- bol omhoog voor de ochtend, bol omlaag
   * voor de avond -- en op zestien pixels werd de tweede een bekertje. Twee
   * tekens die alleen in hun pijl verschillen zijn naast elkaar in een rij
   * chips juist makkelijker te lezen dan twee die allebei iets anders proberen.
   */
  dagOchtend: {
    d:
      'M3.5 18.6h17v1.9h-17Z' +
      ' M6.9 17.4a5.1 5.1 0 0 1 10.2 0Z' +
      ' M8 6.4 12 2.4 16 6.4 14.6 7.8 12 5.2 9.4 7.8Z'
  },
  /*
   * Middag: de zon los van de grond, want dat is wat middag is. De horizon die
   * er eerst bij stond raakte op zestien pixels de onderrand en las als een
   * onderstreping.
   */
  /*
   * Dezelfde zon als bij het weer, met opzet: middag en helder weer zijn niet
   * hetzelfde, maar ze staan in verschillende rijen en er is geen tweede
   * manier om een zon te tekenen die net zo goed leest.
   */
  dagMiddag: { d: ZON },
  dagAvond: {
    d:
      'M3.5 18.6h17v1.9h-17Z' +
      ' M6.9 17.4a5.1 5.1 0 0 1 10.2 0Z' +
      ' M8 3.8 12 7.8 16 3.8 14.6 2.4 12 5 9.4 2.4Z'
  },
  /* Nacht: een maansikkel, uitgespaard en dus met evenodd. */
  dagNacht: {
    d: 'M12.8 2.4A9.6 9.6 0 1 0 21.6 14.4 7.6 7.6 0 0 1 12.8 2.4Zm-1.9 2.9a7.8 7.8 0 1 0 8 11.1 9.4 9.4 0 0 1-8-11.1Z'
  },

  /* ---- de koppen van het chauffeursoverzicht ---- */
  /* Een stopwatch: de kroon bovenop maakt hem iets anders dan de klok. */
  stipt: {
    d:
      'M9.5 1.8h5v2h-5Z' +
      ' M12 4.6a8.7 8.7 0 1 1 0 17.4 8.7 8.7 0 0 1 0-17.4Zm0 2a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4Z' +
      ' M11.1 8.6h1.8v5.2h4v1.8h-5.8Z' +
      ' M17.5 4.7 19 6.2l-2.1 2.1-1.5-1.5Z',
    vulling: 'nonzero' as const
  },
  /* Een stuur: de ring met de naaf en drie spaken. */
  stuur: {
    d:
      'M12 2.6a9.4 9.4 0 1 1 0 18.8 9.4 9.4 0 0 1 0-18.8Zm0 2a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8Z' +
      ' M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z' +
      ' M11.1 4.6h1.8v4.8h-1.8Z' +
      ' M5.4 15.9 9.55 13.5l.9 1.56-4.15 2.4Z' +
      ' M14.45 13.5 18.6 15.9l-.9 1.56-4.15-2.4Z',
    vulling: 'nonzero' as const
  },
  /*
   * Een beker. Hier stond een rozet met twee linten, en op zestien pixels werd
   * dat een rondje met twee beentjes eronder -- een poppetje, en daar staat er
   * al een van op de chauffeursstap. Een beker heeft een silhouet dat klein
   * blijft werken.
   */
  record: {
    d:
      'M7.4 2.8h9.2v5.4a4.6 4.6 0 0 1-9.2 0Z' +
      ' M11 12.6h2v3.4h-2Z' +
      ' M7.8 16h8.4v2.1H7.8Z' +
      ' M6 18.1h12v2.4H6Z'
  },
  /* Een speld op de kaart: waar je rijdt. */
  plek: {
    d: 'M12 2.4a6.6 6.6 0 0 1 6.6 6.6c0 4.6-6.6 12.6-6.6 12.6S5.4 13.6 5.4 9A6.6 6.6 0 0 1 12 2.4Zm0 4.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z'
  },
  /* Een kaartje met een knip in de zijkant. */
  kaartje: {
    d: 'M3 6.5h18v4a2 2 0 0 0 0 3.8v4H3v-4a2 2 0 0 0 0-3.8ZM5 8.5v1.1a4 4 0 0 1 0 5.4v1.1h14v-1.1a4 4 0 0 1 0-5.4V8.5Zm4 1.6h1.6v4.6H9Zm4 0h1.6v4.6H13Z'
  },
  /* Het logboek: regels met hun datum ervoor. */
  logboek: {
    d:
      'M4 4h16v16H4Zm2 2v12h12V6Z' +
      ' M7.5 8.4h2v2h-2Z M11 8.6h6v1.6h-6Z' +
      ' M7.5 12h2v2h-2Z M11 12.2h6v1.6h-6Z' +
      ' M7.5 15.6h2v2h-2Z M11 15.8h6v1.6h-6Z'
  }
} as const

export type Icoonnaam = keyof typeof ICONEN

/**
 * Een icoontje.
 *
 * `klasse` bepaalt de maat, zoals overal in deze app: het icoon weet zelf niet
 * hoe groot het is, want dat hangt af van waar het staat -- zestien pixels in de
 * stappenbalk, dertig in de kop van het vel.
 */
export function Icoon({ naam, klasse }: { naam: Icoonnaam; klasse?: string }): JSX.Element {
  const vorm: IcoonVorm = ICONEN[naam]
  return (
    <svg className={klasse} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={vorm.d}
        fill={vorm.streek ? 'none' : 'currentColor'}
        fillRule={vorm.vulling ?? 'evenodd'}
        stroke={vorm.streek ? 'currentColor' : 'none'}
        strokeWidth={vorm.streek ? 2 : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
