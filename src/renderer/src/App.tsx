import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type JSX } from 'react'
import type { GameMode } from '../../core/career'
import type { Duty } from '../../core/types'
import type { LiveStatus } from '../../core/live'
import type { VehiclePosition } from '../../core/vehicle'
import type { LineSummary } from '../../core/duty'
import type { IbisPlan } from '../../core/ibis'
import type { PluginStatus } from '../../core/pluginInstall'
import type { Vehicle } from '../../core/vehicles'
import {
  TIME_WINDOWS,
  type Assignment,
  type CareerApi,
  type CareerPayload,
  type DutyRequest,
  type MapSummary,
  type PrinterInfo,
  type HofOffer,
  type OmsiState,
  type SessionResult,
  type YardOption
} from '../../shared/api'
import { formatDuration, formatTime } from '../../shared/format'
import { CareerPanel } from './CareerPanel'
import { DutyCard } from './DutyCard'
import { DutyProposal } from './DutyProposal'
import { Flag } from './Flag'
import { FreePlay } from './FreePlay'
import { GameSetup } from './GameSetup'
import { LinePicker } from './LinePicker'
import { RunningDuty } from './RunningDuty'
import {
  Setup,
  STAPPEN,
  type Busvorm,
  type Kruimel,
  type Rij,
  type Stap,
  type Tegel
} from './Setup'
import { Sidebar } from './Sidebar'
import { StartingDialog } from './StartingDialog'
import { LiveDienst } from './LiveDienst'
import { HofDialog } from './HofDialog'
import { BusDialog } from './BusDialog'
import { Welkom } from './Welkom'
import { ThemaKnop, type Thema } from './ThemaKnop'
import { Versie } from './Versie'
import { DEFAULT_LANGUAGE, LANGUAGES, t, type Language } from '../../shared/i18n'
import { LanguageProvider } from './language'

declare global {
  interface Window {
    career: CareerApi
  }
}

/**
 * De naam van een bus, zoals hij in de lijst staat.
 *
 * `vehicleName` staat in core/vehicles.ts, maar dat bestand leest ook mappen en
 * sleept dus node:fs mee; in het venster hoort dat niet thuis. Twee regels hier
 * is goedkoper dan een bestand splitsen om er één functie uit te halen.
 */
function busnaam(bus: Vehicle): string {
  return [bus.manufacturer, bus.type].filter(Boolean).join(' ') || bus.folder
}

/**
 * Een bus uit elkaar halen in merk, type en uitvoering.
 *
 * OMSI zet dat allemaal in een veld, gescheiden door " - ": "Gelenkbus - 18C -
 * 3 Tuerer - Voith" of "628c LF - 5HP502". Het eerste stuk is het type, de rest
 * de uitvoering. Het merk staat apart in `manufacturer` en is altijd gevuld.
 */
function ontleedBus(bus: Vehicle): { merk: string; type: string; uitvoering: string } {
  const delen = bus.type
    .split(' - ')
    .map((deel) => deel.trim())
    .filter(Boolean)
  return {
    merk: bus.manufacturer || bus.folder,
    type: delen[0] || bus.folder,
    uitvoering: delen.slice(1).join(' · ') || bus.paint || '—'
  }
}

/**
 * De vorm van de bus, afgeleid uit hoe hij heet.
 *
 * OMSI zegt nergens of een bus geleed is, maar de naam wel: een Gelenkbus is
 * geleed, 18C en 19C zijn de gelede lengtes, en een Doppeldecker is een
 * dubbeldekker. Beter een vorm die meestal klopt dan overal hetzelfde blokje.
 */
function busvorm(tekst: string): Busvorm {
  const laag = tekst.toLowerCase()
  if (/gelenk|artic|18c|19c/.test(laag)) return 'geleed'
  if (/doppeldeck|double ?deck/.test(laag)) return 'dubbel'
  if (/midi|10c|o530k|kurz/.test(laag)) return 'midi'
  return 'solo'
}

/** Dienstlengtes die je kunt kiezen, in minuten. Korter dan een half uur niet. */
const LENGTHS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480]

/*
 * De stappenbalk zonder de lijnstap. In dienst en carriere kiest de app de
 * lijnen zelf, dus een stap die daarover gaat hoort er niet te staan.
 */
const ZONDER_LIJN: readonly Stap[] = STAPPEN.filter((naam) => naam !== 'line')

/**
 * Welk scherm er staat. De app begint altijd bij de chauffeur en gaat dan naar
 * de modus; daarna pas komt het rijden in beeld.
 */
type Screen = 'profiles' | 'modes' | 'drive' | 'game'

/** Staat de overlay-plugin klaar in OMSI? */
function PluginNote({ status, language }: { status?: PluginStatus; language: Language }): JSX.Element {
  if (!status) return <span className="note">{t(language, 'app.pluginChecking')}</span>
  if (status.error)
    return <span className="note warn">{t(language, 'app.pluginError', { error: status.error })}</span>
  if (status.changed) return <span className="note">{t(language, 'app.pluginUpdated')}</span>
  return <span className="note">{t(language, 'app.pluginReady')}</span>
}

export function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [career, setCareer] = useState<CareerPayload>()

  const [screen, setScreen] = useState<Screen>('profiles')
  const [mode, setMode] = useState<GameMode>('service')

  const [mapFolder, setMapFolder] = useState('')
  const [lengthIndex, setLengthIndex] = useState(4)
  const [timeWindow, setTimeWindow] = useState<DutyRequest['window']>('heledag')
  /** Leeg betekent: elke lijn van deze kaart mag. */
  const [lineFile, setLineFile] = useState('')
  const [lines, setLines] = useState<LineSummary[]>([])

  const [duties, setDuties] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<number>()
  /** Leeg betekent: de bus gebruiken die de app voorstelt. */
  const [vehicleOverride, setVehicleOverride] = useState('')
  /*
   * Het wagenpark dat de chauffeur zelf aanwijst, en wat er te kiezen valt.
   * Leeg betekent: laat de app kiezen. De keuze gaat mee naar de IBIS, en van
   * daar naar de situatie -- het is dus één keuze en niet twee.
   */
  const [yardOverride, setYardOverride] = useState('')
  const [yards, setYards] = useState<YardOption[]>([])
  /*
   * Hoe OMSI de vorige keer draaide. Alleen volledig scherm is een bericht
   * waard: dan ligt de overlay over een spel dat het scherm exclusief opeist,
   * en dat kan op een zwart beeld uitlopen.
   */
  const [schermmodus, setSchermmodus] = useState<'volledig' | 'venster'>()
  /** Start de app OMSI in een venster? Standaard ja; zie settings.ts waarom. */
  const [inVenster, setInVenster] = useState(true)
  /** Geen OMSI gevonden: dan vraagt de app waar het staat. */
  /*
   * Waar OMSI staat, en of de speler dat zelf heeft bevestigd.
   *
   * Zolang het tweede niet zo is, is dit het enige scherm dat de app toont. De
   * app zoekt zelf en heeft het meestal bij het rechte eind, maar er zijn te
   * veel installaties denkbaar om erop te gokken -- Steam op een tweede schijf,
   * de doosversie, twee kopieën naast elkaar. Eén keer bevestigen, en daarna
   * weet de app het in plaats van dat hij het denkt.
   */
  const [omsi, setOmsi] = useState<OmsiState>()
  const [omsiBezig, setOmsiBezig] = useState(false)
  useEffect(() => {
    let staat = true
    void window.career.screenMode().then((modus) => {
      if (staat) setSchermmodus(modus)
    })
    void window.career.settings().then((settings) => {
      if (staat) setInVenster(settings.windowedOmsi)
    })
    return () => {
      staat = false
    }
  }, [])
  const [ibis, setIbis] = useState<IbisPlan>()
  const [busy, setBusy] = useState(false)
  /** Staat het voorstelvenster open? Daar kies je de dienst aan of opnieuw. */
  const [proposal, setProposal] = useState(false)
  const [started, setStarted] = useState(false)
  /*
   * Waar de speler in de opzet staat. Begint bij de kaart: profiel koos hij al
   * bij binnenkomst, en de bus kan pas als de dienst bekend is.
   */
  const [stap, setStap] = useState<Stap>('map')
  /** Staat de invulregel voor een nieuwe chauffeur open, en wat staat erin? */
  const [nieuweChauffeur, setNieuweChauffeur] = useState<string>()
  /** Waar de speler in de buskeuze staat: merk, dan type, dan uitvoering. */
  const [busMerk, setBusMerk] = useState<string>()
  const [busType, setBusType] = useState<string>()
  /** Op de busstap: kies je een bus, het hof-bestand, of zet je hoven over? */
  const [busScherm, setBusScherm] = useState<'bus' | 'hof' | 'overzetten'>('bus')
  /*
   * Bussen die de kaart van deze dienst niet kennen.
   *
   * Een wagenpark ligt in de map van de bus en niet bij de kaart, dus een bus
   * zonder dat bestand kent geen enkele bestemmingscode -- en de app laat hem
   * dan ook niet in dit menu zien. Dat is precies waarom dit hier hoort: je ziet
   * een handvol bussen terwijl je er vijftig hebt, en hier staat waarom, met
   * wat eraan te doen is.
   */
  const [hofAanbod, setHofAanbod] = useState<HofOffer[]>([])
  const [hofBezig, setHofBezig] = useState(false)
  /*
   * Het aanbod voor de bus die nu gekozen is.
   *
   * Dit is waar het om draait: je kiest een bus, je komt op de remisestap, en
   * elk wagenpark zegt "0 van 2 bestemmingen". Dan weet de app precies wat er
   * mis is en welk bestand het oplost, en hoort hij dat te vragen.
   */
  const [busAanbod, setBusAanbod] = useState<HofOffer>()
  /*
   * Of de vraag over de aanbevolen bus al gesteld is voor deze dienst.
   *
   * Eenmaal per dienst: wie "zelf kiezen" aanklikt hoort niet bij elke stap
   * terug opnieuw dezelfde vraag te krijgen.
   */
  const [busGevraagd, setBusGevraagd] = useState('')
  /** Weggeklikt voor deze bus; dan niet opnieuw vragen tot je iets anders kiest. */
  const [hofGevraagd, setHofGevraagd] = useState('')
  /** Gaat omhoog zodra er een wagenpark is neergezet; dan opnieuw kijken. */
  const [hofTeller, setHofTeller] = useState(0)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [note, setNote] = useState<string>()
  const [plugin, setPlugin] = useState<PluginStatus>()
  const [starting, setStarting] = useState(false)
  /** Wat OMSI tijdens het rijden doorgeeft; voedt het compacte scherm. */
  const [session, setSession] = useState<SessionResult>()
  /*
   * Wat de bus op dit moment doorgeeft.
   *
   * De overlay krijgt dit al als beeld toegestuurd; het hoofdvenster had alleen
   * de cijfers over de hele dienst. Voor een dienstregeling die meeloopt is meer
   * nodig: welke rit, welke halte, en hoeveel je daar voor of achter ligt.
   */
  const [live, setLive] = useState<LiveStatus>()
  /** Waar de bus op de kaart staat; hiermee wordt het venster een navigatie. */
  const [liveBus, setLiveBus] = useState<VehiclePosition>()
  const [connected, setConnected] = useState(false)
  /** Wat de laatste keer kijken opleverde; staat in de balk bovenaan. */
  const [checked, setChecked] = useState<string>()
  const [checking, setChecking] = useState(false)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printer, setPrinter] = useState('')
  const finishRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE)
  /*
   * Dag of nacht. `systeem` volgt Windows en is de beginstand; wie het knopje
   * indrukt legt het vast. De opmaak hangt aan een attribuut op de wortel --
   * theme.css valt zonder dat attribuut terug op prefers-color-scheme -- dus
   * zetten of weghalen is alles wat hier hoeft te gebeuren.
   */
  const [thema, setThema] = useState<Thema>('systeem')

  // De taalkeuze staat los van de chauffeur; hij hoort bij deze computer.
  useEffect(() => {
    void window.career.settings().then((settings) => {
      setLanguage(settings.language)
      setThema(settings.theme ?? 'systeem')
    })
  }, [])

  useEffect(() => {
    if (thema === 'systeem') delete document.documentElement.dataset.thema
    else document.documentElement.dataset.thema = thema
  }, [thema])

  const kiesThema = useCallback((next: Thema) => {
    setThema(next)
    void window.career.saveSettings({ theme: next })
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const chooseLanguage = useCallback((next: Language) => {
    setLanguage(next)
    void window.career.saveSettings({ language: next })
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        /*
         * Eerst de vraag waar OMSI staat, en pas daarna de rest. Alles wat
         * hierna komt -- kaarten, bussen, het profiel -- hangt aan die map, dus
         * er valt niets te laden zolang die niet vaststaat.
         */
        const staat = await window.career.omsiState()
        setOmsi(staat)
        if (!staat.confirmed) return
        const [loadedMaps, loadedVehicles, loadedCareer] = await Promise.all([
          window.career.maps(),
          window.career.vehicles(),
          window.career.career()
        ])
        setMaps(loadedMaps)
        setVehicles(loadedVehicles)
        setCareer(loadedCareer)
        setMapFolder(loadedMaps[0]?.folder ?? '')
        setReady(true)
        // Losstaand: de overlay-plugin klaarzetten mag de rest niet ophouden.
        void window.career.pluginStatus().then(setPlugin)
        void window.career.printers().then((found) => {
          setPrinters(found)
          setPrinter(found[0]?.name ?? '')
        })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  }, [])

  /*
   * Bij binnenkomst op de lijnstap staat de bovenste regel gemarkeerd, terwijl
   * er nog niets gekozen is: het scherm liet een keuze zien die het niet had
   * gemaakt, en de kaart bleef daardoor leeg. Nu kiest hij die eerste lijn ook
   * echt, en licht de route meteen op.
   */
  useEffect(() => {
    if (stap !== 'line' || lineFile || lines.length === 0 || busy) return
    const eerste = lines[0].lineFile
    setLineFile(eerste)
    void generateRef.current?.(eerste)
  }, [stap, lineFile, lines, busy])


  const selectedMap = useMemo(() => maps.find((m) => m.folder === mapFolder), [maps, mapFolder])
  const assignment = selected !== undefined ? duties[selected] : undefined
  const duty = assignment?.duty

  /*
   * Welke bussen deze kaart niet kennen. Alleen kijken -- er wordt pas iets in
   * de spelmap gezet als de chauffeur erom vraagt. Het loopt zodra de dienst
   * bekend is en niet pas op de busstap, want dan staat het er al als je er
   * komt in plaats van dat het scherm nog even moet nadenken.
   */
  useEffect(() => {
    if (!duty) {
      setHofAanbod([])
      return
    }
    let geldig = true
    void window.career
      .hofOffers(duty)
      .then((aanbod) => {
        if (geldig) setHofAanbod(aanbod)
      })
      .catch(() => {
        if (geldig) setHofAanbod([])
      })
    return () => {
      geldig = false
    }
  }, [duty])

  /*
   * De aangenomen dienst staat in het profiel. Na het laden, na een herstart of
   * na het wisselen van profiel wordt hij hier teruggezet, en zolang hij er is
   * valt er niets anders te kiezen.
   */
  const active = career?.state?.activeDuty
  const confirmed = Boolean(active)
  const exam = active?.exam
  const activeKey = active ? `${career?.state?.id}|${active.confirmedAt}` : ''
  useEffect(() => {
    /*
     * Geen lopende dienst -- een verse chauffeur, of net geannuleerd -- dan
     * hoort er ook niets meer op het scherm te staan. Zonder dit bleef de dienst
     * van de vorige chauffeur gewoon staan, met knoppen en al.
     */
    if (!active) {
      setDuties([])
      setSelected(undefined)
      setStarted(false)
      setVehicleOverride('')
      return
    }
    const held = active.assignment as Assignment
    setMapFolder(held.duty.mapFolder)
    setDuties([held])
    setSelected(0)
    setVehicleOverride(active.vehicleOverride)
    setStarted(Boolean(active.startedAt))
    if (active.mode) setMode(active.mode)
  }, [activeKey])

  /*
   * In dienst en carriere wordt de lijn niet gekozen maar gelopen.
   *
   * Een dienst is een omloop, en een omloop gaat over lijnen heen: op een
   * knooppunt stap je over. De generator doet dat al -- een lijn die je nog niet
   * reed weegt zes keer zo zwaar als dezelfde doorrijden -- maar zolang de app
   * een lijnbestand meegaf bleef de wandeling op die ene lijn. Vandaar: geen
   * lijnstap, en meteen zoeken zodra de kaart bekend is.
   *
   * Alleen bij vrij rijden blijft de keuze staan; daar stel je je rit zelf samen.
   */
  const lijnVrij = mode !== 'free'
  useEffect(() => {
    if (!lijnVrij || stap !== 'duty' || busy || confirmed) return
    if (duties.length > 0 || !mapFolder) return
    void generateRef.current?.()
  }, [lijnVrij, stap, busy, confirmed, duties.length, mapFolder])

  /*
   * Opnieuw diensten zoeken zodra je de lengte of het dagdeel verzet.
   *
   * Zonder dit deed de schuif niets: de lijst werd alleen opgebouwd bij het
   * binnenkomen op de lijnstap, en daarna bleef hij staan met de diensten van
   * de vorige vraag. Met een korte pauze erachter, want een schuif geeft tijdens
   * het slepen tien keer per seconde een nieuwe waarde en elke zoektocht loopt
   * door het hele rittennet.
   */
  const vraagRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const sleutel = `${lengthIndex}|${timeWindow}`
    // De eerste keer is geen wijziging maar de beginstand.
    if (vraagRef.current === undefined) {
      vraagRef.current = sleutel
      return
    }
    if (vraagRef.current === sleutel) return
    vraagRef.current = sleutel
    /*
     * Zonder gekozen lijn ook zoeken.
     *
     * Hier stond `if (!lineFile) return`, en dat klopte zolang je altijd eerst
     * een lijn koos. Sinds de lijn in dienst en carriere gelopen wordt in plaats
     * van gekozen is `lineFile` daar leeg -- en dus deed de schuif niets meer.
     * Een lege lijn is geen ontbrekende lijn maar "elke lijn".
     */
    if (confirmed || !mapFolder) return
    const wacht = setTimeout(() => void generateRef.current?.(lineFile || undefined), 400)
    return () => clearTimeout(wacht)
  }, [lengthIndex, timeWindow, lineFile, confirmed, mapFolder])

  /*
   * Eens per seconde, en alleen tijdens het rijden. De plugin schrijft tien keer
   * per seconde; vaker kijken dan dit levert niets op wat een mens ziet, en het
   * hoofdvenster hoeft er de kaart niet voor te laten haperen.
   */
  useEffect(() => {
    if (!started || !duty) {
      setLive(undefined)
      setLiveBus(undefined)
      return
    }
    let geldig = true
    /*
     * Wat we de vorige keer zagen. Zonder deze vergelijking zette elke tel een
     * nieuw object in de toestand, en dan tekent React het hele scherm opnieuw
     * -- inclusief de kaart -- ook als er niets veranderd is. Naast een draaiend
     * spel is dat werk dat je in beelden per seconde terugziet.
     */
    let vorige = ''
    const haal = (): void => {
      /*
       * Niet tekenen wat niemand ziet. Staat het venster geminimaliseerd of
       * achter het spel zonder zichtbaar te zijn, dan hoeft de kaart niet mee
       * te lopen; bij het terugkomen is hij binnen een tel weer bij.
       */
      if (document.visibilityState === 'hidden') return
      void window.career
        .liveStatus()
        .then((stand) => {
          if (!geldig) return
          const sleutel = JSON.stringify(stand)
          if (sleutel === vorige) return
          vorige = sleutel
          setLive(stand.status)
          setLiveBus(stand.vehicle)
        })
        .catch(() => {
          if (!geldig) return
          vorige = ''
          setLive(undefined)
          setLiveBus(undefined)
        })
    }
    haal()
    const klok = setInterval(haal, 1000)
    const wakker = (): void => haal()
    document.addEventListener('visibilitychange', wakker)
    return () => {
      geldig = false
      clearInterval(klok)
      document.removeEventListener('visibilitychange', wakker)
    }
  }, [started, duty])

  /** De lijnen van de gekozen kaart; die zijn er voor de route- en examenkeuze. */
  useEffect(() => {
    if (!mapFolder) {
      setLines([])
      return
    }
    let current = true
    void window.career
      .lines(mapFolder)
      .then((found) => {
        if (current) setLines(found)
      })
      .catch(() => {
        if (current) setLines([])
      })
    return () => {
      current = false
    }
  }, [mapFolder])

  // Een lijn van de vorige kaart bestaat hier niet; die keuze vervalt.
  useEffect(() => {
    setLineFile('')
  }, [mapFolder])

  const vehicle = useMemo(() => {
    if (vehicleOverride) return vehicles.find((v) => v.relativePath === vehicleOverride)
    return assignment?.vehicle ?? undefined
  }, [vehicleOverride, vehicles, assignment])

  /** Voertuigen gegroepeerd per map, anders is de lijst van 351 onleesbaar. */
  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, Vehicle[]>()
    for (const item of vehicles) {
      const list = groups.get(item.folder) ?? []
      list.push(item)
      groups.set(item.folder, list)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [vehicles])

  /** Bestemmingscodes hangen aan de bus en aan het tijdvak van de kaart. */
  useEffect(() => {
    if (!duty || !vehicle || !selectedMap) {
      setIbis(undefined)
      return
    }
    let current = true
    void window.career.ibis(duty, vehicle, selectedMap.year, yardOverride || undefined).then((plan) => {
      if (current) setIbis(plan)
    })
    return () => {
      current = false
    }
  }, [duty, vehicle, selectedMap, yardOverride])

  /*
   * Welke wagenparken er naast deze bus liggen. Wisselt de bus, dan vervalt de
   * keuze: een wagenpark van het ene busmodel zegt niets over het andere.
   */
  useEffect(() => {
    if (!duty || !vehicle || !selectedMap) {
      setYards([])
      return
    }
    let current = true
    void window.career.yards(duty, vehicle, selectedMap.year).then((options) => {
      if (current) setYards(options)
    })
    return () => {
      current = false
    }
  }, [duty, vehicle, selectedMap, hofTeller])

  /*
   * Kent deze bus de kaart helemaal niet, dan vragen we of we het wagenpark
   * erbij mogen zetten. De maat is streng met opzet: kent hij er een van de
   * vier, dan is dat toeval -- een haltenaam die ook in een andere stad
   * voorkomt -- en niet een bus waarmee je deze dienst kunt rijden.
   */
  useEffect(() => {
    const sleutel = vehicle ? `${duty?.mapFolder}|${vehicle.folder}` : ''
    if (!duty || !vehicle || yards.length === 0 || sleutel === hofGevraagd) {
      setBusAanbod(undefined)
      return
    }
    const beste = Math.max(0, ...yards.map((yard) => yard.known))
    const nodig = Math.max(1, Math.ceil((yards[0]?.total ?? 0) / 2))
    if (beste >= nodig) {
      setBusAanbod(undefined)
      return
    }
    let geldig = true
    void window.career
      .hofOfferFor(duty, vehicle.folder)
      .then((aanbod) => {
        if (geldig) setBusAanbod(aanbod)
      })
      .catch(() => {
        if (geldig) setBusAanbod(undefined)
      })
    return () => {
      geldig = false
    }
  }, [duty, vehicle, yards, hofGevraagd])

  useEffect(() => {
    setYardOverride('')
  }, [vehicleOverride, assignment])

  /**
   * Genereert een dienst en legt hem voor.
   *
   * De remise wijst er één toe in plaats van een rooster van acht waaruit je
   * maar wat kiest. Bevalt hij niet, dan genereer je een andere; er komt elke
   * keer een andere uit, want de dienst wordt uit de dienstregeling gelopen.
   */
  /*
   * `generate` staat verderop en gebruikt van alles dat hierboven nog niet
   * bestaat; een verwijzing is hier goedkoper dan de volgorde omgooien.
   */
  const generateRef = useRef<((onlyLine?: string) => Promise<void>) | undefined>(undefined)

  const generate = useCallback(
    async (onlyLine?: string) => {
      if (confirmed) return
      setBusy(true)
      setError(undefined)
      setNote(undefined)
      setSelected(undefined)
      setStarted(false)
      setVehicleOverride('')
      try {
        const found = await window.career.listDuties({
          mapFolder,
          targetMinutes: LENGTHS[lengthIndex],
          window: timeWindow,
          // Een lege keuze is "elke lijn"; die mag niet als filter meegaan,
          // want dan zoekt de planner naar een lijn die zo heet.
          lineFile: (onlyLine ?? lineFile) || undefined,
          /*
           * In de carriere rijdt de chauffeur alleen waar hij een vergunning
           * voor heeft -- maar dat zijn er meestal meer dan een, en dan hoort
           * de dienst daar gewoon overheen te lopen.
           */
          lineFiles:
            mode === 'career'
              ? (career?.state?.licences ?? [])
                  .filter((vergunning) => vergunning.mapFolder === mapFolder)
                  .map((vergunning) => vergunning.lineFile)
              : undefined
        })
        if (found.length === 0) {
          setDuties([])
          setProposal(false)
          setError(
            t(language, 'app.noDuty', { length: formatDuration(LENGTHS[lengthIndex], language) })
          )
          return
        }
        /*
         * Er komen er meerdere terug, en sinds het opzetscherm de dienstenlijst
         * toont leggen we ze allemaal voor in plaats van er één uit te loten.
         * Op vertrektijd, want zo leest een dienstregeling: van vroeg naar laat.
         */
        const opTijd = [...found].sort((a, b) => a.duty.start - b.duty.start)
        setDuties(opTijd)
        setSelected(0)
        setProposal(true)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setBusy(false)
      }
    },
    [mapFolder, lengthIndex, timeWindow, lineFile, language, confirmed]
  )

  // De verwijzing bijwerken, zodat het effect hierboven de laatste versie pakt.
  useEffect(() => {
    generateRef.current = generate
  }, [generate])

  const confirmDuty = useCallback(
    async (asExam?: { lineFile: string; lineNumbers: string[]; basic: boolean }) => {
      if (!assignment || confirmed) return
      setCareer(await window.career.confirmDuty(assignment, vehicleOverride, mode, asExam))
    },
    [assignment, confirmed, vehicleOverride, mode]
  )

  const cancelDuty = useCallback(async () => {
    if (!confirmed || !window.confirm(t(language, 'act.cancelAsk'))) return
    setCareer(await window.career.cancelDuty())
    setDuties([])
    setSelected(undefined)
    setStarted(false)
    setStarting(false)
    setNote(undefined)
  }, [confirmed, language])

  /**
   * Dienst starten. Dit zet de situatie klaar in OMSI -- datum, tijd, bus bij de
   * halte en de dienstregeling -- en start daarna pas het spel. Er is geen aparte
   * knop meer voor het klaarzetten; dat hoort bij starten.
   */
  const begin = useCallback(async (alBevestigd = false) => {
    /*
     * `confirmed` komt uit de loopbaanstatus en die is er pas een tik later. Wie
     * in één druk bevestigt en start, weet zelf dat het net gebeurd is; daarom
     * mag hij dat hier zeggen in plaats van te wachten tot de status volgt.
     */
    if (!duty || (!confirmed && !alBevestigd)) return
    setBusy(true)
    setNote(t(language, 'start.preparing'))
    try {
      const result = await window.career.beginDuty({
        duty,
        ibis,
        vehiclePath: vehicle?.relativePath,
        date: assignment?.date,
        lineNumber: ibis?.line || duty.legs[0]?.lineNumber || '',
        terminus: duty.legs[0]?.terminus ?? '',
        yard: ibis?.yard
      })
      setStarted(true)
      setProposal(false)
      /*
       * De overlay hoort pas in beeld te komen als het spel er is. Draait OMSI
       * al met de plugin, dan is dat nu; anders blijft het venstertje staan tot
       * de plugin gegevens doorgeeft en gaat de overlay op dat moment open.
       */
      if (result.connected) {
        setOverlayOpen(await window.career.setOverlay(duty, true, ibis))
      }
      setStarting(!result.connected)

      const lines: string[] = []
      if (result.prepareError) {
        lines.push(t(language, 'start.failed', { reason: result.prepareError }))
      } else {
        lines.push(t(language, 'start.ready', { map: duty.mapName }))
        if (result.prepared?.timetableSet) lines.push(t(language, 'start.timetableSet'))
        /*
         * Lukte het klaarzetten niet, dan hoort dat er te staan. Tot nu toe
         * werd dat wel uitgerekend maar nergens gezegd: je las "alles staat
         * klaar" en kwam vervolgens op de kaart van de vorige keer uit, zonder
         * dat iets verklaarde waarom.
         */
        const klaar = result.prepared?.startup
        if (klaar && !(klaar.lastMap && klaar.lastSituation)) {
          lines.push(t(language, 'start.presetFailed', { map: duty.mapName }))
        }
      }
      if (result.running) lines.push(t(language, 'start.alreadyRunning'))
      setNote(lines.join(' '))
    } finally {
      setBusy(false)
    }
  }, [duty, confirmed, ibis, vehicle, assignment, language])

  /**
   * Eén druk op START: de dienst aannemen en meteen beginnen.
   *
   * In het oude scherm waren dit twee knoppen, en niemand snapte waarom je
   * eerst moest bevestigen wat je net had aangeklikt. De handeling is er nog
   * wel -- de dienst komt in je loopbaan te staan -- maar hij hangt niet langer
   * aan een eigen knop.
   */
  const startAlles = useCallback(async () => {
    if (!assignment || busy) return
    if (!confirmed) await confirmDuty()
    await begin(true)
  }, [assignment, busy, confirmed, confirmDuty, begin])

  /**
   * Opnieuw kijken wat er in de OMSI-map staat.
   *
   * Een kaart of een bus installeer je door een map neer te zetten, en de app
   * leest die mappen alleen bij het starten -- wie tussendoor iets installeert,
   * ziet het pas na een herstart. Deze knop leest ze opnieuw en zegt wat erbij
   * is gekomen sinds de vorige keer.
   */
  const checkInstalled = useCallback(async () => {
    setChecking(true)
    setChecked(undefined)
    try {
      const found = await window.career.checkInstalled()
      setMaps(found.maps)
      setVehicles(found.vehicles)
      // Een kaart die weg is, kan niet gekozen blijven.
      if (!found.maps.some((item) => item.folder === mapFolder)) {
        setMapFolder(found.maps[0]?.folder ?? '')
      }

      const buses = new Set(found.vehicles.map((item) => item.folder)).size
      if (found.first) {
        setChecked(t(language, 'check.first', { maps: found.maps.length, buses }))
        return
      }
      const parts: string[] = []
      if (found.addedMaps.length > 0) {
        parts.push(t(language, 'check.newMaps', { items: found.addedMaps.join(', ') }))
      }
      if (found.addedBuses.length > 0) {
        parts.push(t(language, 'check.newBuses', { items: found.addedBuses.join(', ') }))
      }
      if (found.removedMaps.length > 0 || found.removedBuses.length > 0) {
        parts.push(
          t(language, 'check.gone', {
            items: [...found.removedMaps, ...found.removedBuses].join(', ')
          })
        )
      }
      setChecked(
        parts.length > 0
          ? parts.join(' ')
          : t(language, 'check.nothing', { maps: found.maps.length, buses })
      )
    } catch (cause) {
      setChecked(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setChecking(false)
    }
  }, [language, mapFolder])

  const createProfile = useCallback(async (name: string) => {
    setCareer(await window.career.createProfile(name))
    setScreen('modes')
  }, [])

  const chooseProfile = useCallback(async (id: string) => {
    setCareer(await window.career.selectProfile(id))
    setScreen('modes')
  }, [])

  /**
   * Zolang de dienst loopt kijken we of hij is uitgereden: eindtijd voorbij en
   * de bus stil. Dan boekt de app hem zelf, zoals een chauffeur die afmeldt.
   */
  useEffect(() => {
    if (!started) {
      setSession(undefined)
      setConnected(false)
      return
    }
    const look = (): void => {
      void window.career.checkSession().then((result) => {
        setSession(result)
        if (result.dutyComplete) void finishRef.current?.()
      })
      void window.career.liveConnected().then(setConnected)
    }
    // Meteen kijken, anders staat het scherm de eerste vijf seconden leeg.
    look()
    const timer = setInterval(look, 5000)
    return () => clearInterval(timer)
  }, [started])

  // De stand van de overlay komt uit het hoofdproces; hij gaat ook dicht vanuit
  // de overlay zelf of bij het afronden, en dan moet de knop dat weten.
  useEffect(() => {
    void window.career.overlayIsOpen().then(setOverlayOpen)
    return window.career.onOverlayState(setOverlayOpen)
  }, [])

  const toggleOverlay = useCallback(async () => {
    if (!duty && !overlayOpen) return
    setOverlayOpen(await window.career.setOverlay(duty, !overlayOpen, ibis))
  }, [duty, overlayOpen, ibis])

  /**
   * Afronden. Een examenrit gaat naar de examencommissie in plaats van naar het
   * logboek: daar hangt een vergunning aan vast, geen loon.
   */
  const finish = useCallback(async () => {
    if (!duty || !vehicle) return
    setBusy(true)
    try {
      const result = await window.career.checkSession()
      /*
       * Hoeveel stevige stops er bij deze dienst horen voordat het opvalt. Een
       * op de tien haltes, en minstens twee: op een rit van veertien haltes is
       * één auto die invoegt geen slecht rijgedrag.
       */
      const ruimteVoorRemmen = Math.max(2, Math.round((duty?.totalStops ?? 0) / 10))
      if (exam) {
        const payload = await window.career.finishExam(
          duty,
          {
            finished: result.dutyComplete || result.drivenKm > 0,
            delayMinutes: result.delayMinutes,
            harshBrakes: result.harshBrakes,
            harshAccels: result.harshAccels,
            topSpeed: result.topSpeed
          },
          exam.basic
        )
        setCareer(payload)
        const verdict = payload.state?.exams[0]
        setNote(
          verdict?.passed
            ? t(language, 'exam.granted', { line: verdict.lineNumbers.join('/') || verdict.lineFile })
            : t(language, 'exam.again')
        )
      } else {
        setCareer(
          await window.career.completeDuty(duty, `${vehicle.manufacturer} ${vehicle.type}`, {
            stopsDone: result.stopsDone,
            drivenKm: result.drivenKm,
            delayMinutes: result.delayMinutes,
            harshBrakes: result.harshBrakes,
            harshAccels: result.harshAccels,
            tickets: result.tickets,
            collisions: result.collisions,
            fuelUsed: result.fuelUsed
          })
        )
        setNote(
          result.finished && result.drivenKm > 0
            ? /*
                Niet alles of niets. Eén stevige stop op veertig haltes is geen
                slechte rit -- dat is verkeer. Pas als het er meer zijn dan een
                op de tien haltes staat het er, en anders heet het gewoon
                vloeiend gereden.

                Een aanrijding gaat daar voor. Dat is geen rijstijl maar een
                gebeurtenis, en de chauffeur hoort er als eerste over te lezen.
              */
              (result.collisions ?? 0) > 0
              ? t(language, 'done.collision', {
                  km: result.drivenKm.toFixed(1),
                  count: result.collisions ?? 0
                })
              : t(
                  language,
                  (result.harshBrakes ?? 0) > ruimteVoorRemmen ? 'done.harsh' : 'done.smooth',
                  { km: result.drivenKm.toFixed(1), count: result.harshBrakes ?? 0 }
                )
            : t(language, 'done.nothing')
        )
      }
      setDuties([])
      setSelected(undefined)
      setStarted(false)
      setOverlayOpen(false)
    } finally {
      setBusy(false)
    }
  }, [duty, vehicle, exam, language])

  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  /*
   * Het eerste dat iemand van deze app ziet: waar staat OMSI?
   *
   * Alles hierna hangt aan die map, dus er valt niets te laden zolang die niet
   * vaststaat. Het scherm staat midden in beeld en niet in het stappenvel van
   * de rest -- dit is geen stap in het klaarzetten van een dienst maar de deur
   * ervoor, en er is niets anders te doen dan antwoorden.
   */
  if (omsi && !omsi.confirmed) {
    const kiezen = async (): Promise<void> => {
      setOmsiBezig(true)
      try {
        const uit = await window.career.browseOmsi()
        // Geannuleerd: dan blijft staan wat er stond, zonder waarschuwing.
        if (uit.wrong || uit.path) setOmsi({ ...uit, confirmed: false })
      } finally {
        setOmsiBezig(false)
      }
    }
    return (
      <LanguageProvider language={language}>
        <Welkom
          language={language}
          onLanguage={chooseLanguage}
          thema={thema}
          onThema={kiesThema}
          omsi={omsi}
          bezig={omsiBezig}
          onKiezen={() => void kiezen()}
          onBevestig={() => {
            if (!omsi.path) return
            setOmsiBezig(true)
            void window.career
              .confirmOmsi(omsi.path)
              .then((uit) => {
                /*
                 * Opnieuw beginnen in plaats van de halve app bijwerken: alles
                 * wat er staat is geladen zonder dat deze map vaststond.
                 */
                if (uit.confirmed) window.location.reload()
                else setOmsi({ ...uit, confirmed: false })
              })
              .finally(() => setOmsiBezig(false))
          }}
        />
      </LanguageProvider>
    )
  }

  if (error && !ready) {
    return (
      <div className="main">
        <h1>{t(language, 'app.errorTitle')}</h1>
        <p className="subtitle">{error}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="main">
        <h1>{t(language, 'app.loading')}</h1>
        <p className="subtitle">{t(language, 'app.loadingSub')}</p>
      </div>
    )
  }

  /*
   * Het opzetscherm: de kaart vult het venster en de keuzes liggen erop. Dit is
   * het enige scherm dat de zijbalk niet toont -- de stappenbalk is hier de
   * navigatie, en een tweede balk ernaast zou hetzelfde twee keer zeggen.
   *
   * Vier stappen delen één vorm. Wat per stap verschilt zijn de regels en wat
   * de hoofdknop doet; de indeling blijft staan, zodat je niet elke stap
   * opnieuw hoeft te zoeken waar je moet kijken.
   */
  const eersteStart = Boolean(career) && (!career?.state || (career?.profiles.length ?? 0) === 0)

  /*
   * Wagenparken overzetten.
   *
   * Dit hing eerst in de busstap, en die stap bestaat alleen in de dienstmodus.
   * Wie in carriere rijdt kwam er dus nooit -- terwijl juist daar geldt dat de
   * remise alleen bussen toewijst die de kaart kennen, en dat er dat een
   * handvol zijn. Vandaar hier, boven de modi: hij is nu vanuit de busstap te
   * openen en vanuit de knoppenbalk van de oude schermen.
   *
   * Hier staat wat er zou gebeuren en wat het oplevert; pas op de knop wordt er
   * iets geschreven. Dit is de enige plek waar de app in de voertuigmappen van
   * OMSI komt.
   */
  if (busScherm === 'overzetten' && duty) {
    const terug = (): void => {
      setBusScherm('bus')
      setBusMerk(undefined)
      setBusType(undefined)
    }
    return (
      <LanguageProvider language={language}>
        <Setup
          stap="bus"
          titel={t(language, 'setup.hofTitle')}
          onderschrift={t(language, 'setup.hofIntro', { count: hofAanbod.length })}
          kruimels={[
            { label: t(language, 'setup.busTitle'), onDoen: terug },
            { label: t(language, 'setup.hofTitle') }
          ]}
          koppen={[
            t(language, 'setup.hofBus'),
            t(language, 'setup.hofNow'),
            t(language, 'setup.hofAfter')
          ]}
          rijen={hofAanbod.map((item) => ({
            id: item.folder,
            cellen: [
              item.folder,
              t(language, 'setup.hofOf', { known: item.known, total: item.total }),
              t(language, 'setup.hofOf', { known: item.offerMatched ?? 0, total: item.total })
            ] as [string, string, string]
          }))}
          gekozen={-1}
          onKies={() => {}}
          vullend
          keuzeloos
          voet={t(language, 'setup.hofFoot')}
          bezig={hofBezig}
          startTekst={hofBezig ? t(language, 'setup.hofBusy') : t(language, 'setup.hofDo')}
          onStart={() => {
            if (hofBezig) return
            setHofBezig(true)
            void window.career
              .placeHofs(
                duty,
                hofAanbod.map((item) => item.folder)
              )
              .then(async (result) => {
                setNote(t(language, 'setup.hofDone', { count: result.placed }))
                /*
                 * Opnieuw ophalen: met de nieuwe bestanden erbij staan er bussen
                 * in het menu die er zojuist nog niet waren.
                 */
                setHofAanbod(await window.career.hofOffers(duty))
                terug()
              })
              .finally(() => setHofBezig(false))
          }}
          rechtsInBalk={
            <>
              <Versie />
              <ThemaKnop language={language} thema={thema} onThema={kiesThema} />
              {LANGUAGES.map((taal) => (
                <button
                  key={taal.code}
                  type="button"
                  aria-pressed={taal.code === language}
                  aria-label={taal.native}
                  title={taal.native}
                  onClick={() => chooseLanguage(taal.code)}
                >
                  <Flag code={taal.code} />
                </button>
              ))}
            </>
          }
        />
      </LanguageProvider>
    )
  }

  /*
   * De dienst loopt: OMSI start op of draait al.
   *
   * Tot nu toe viel de app hier terug op de oude wereld -- je drukte op START en
   * kreeg de zijbalk met het glazen dienstpaneel terug, precies op het moment
   * dat je het spel in gaat. Dit scherm hoort bij dezelfde reeks als de stappen
   * ervoor, dus het krijgt hetzelfde vel; wat erin staat is het bestaande
   * dienstpaneel, dat weet wat er tijdens het rijden toe doet.
   *
   * ONGEACHT DE MODUS. Dit stond eerst op `mode === 'service'`, en daardoor
   * kwam wie zijn dienst in carriere had aangenomen na het herstarten van de
   * app toch weer in de oude zijbalk terecht -- juist op het moment dat de
   * dienst al liep. Een lopende dienst ziet er in elke modus hetzelfde uit: er
   * valt niets meer te kiezen, alleen nog te rijden en af te ronden.
   */
  if (started && duty) {
    const volledig = assignment ? (
      <DutyCard
        assignment={assignment}
        ibis={ibis}
        vehicle={vehicle}
        vehicleGroups={vehicleGroups}
        vehicleOverride={vehicleOverride}
        onVehicleChange={setVehicleOverride}
        yards={yards}
        yardOverride={yardOverride}
        onYardChange={setYardOverride}
        busy={busy}
        confirmed={confirmed}
        started={started}
        overlayOpen={overlayOpen}
        exam={Boolean(exam)}
        onConfirm={() => void confirmDuty()}
        onCancel={cancelDuty}
        onBegin={begin}
        onToggleOverlay={toggleOverlay}
        onFinish={finish}
        printers={printers}
        printer={printer}
        onPrinterChange={setPrinter}
      />
    ) : null

    return (
      <LanguageProvider language={language}>
        <Setup
          stap="bus"
          lijn={duty.lineNumbers[0] ?? duty.legs[0]?.lineNumber}
          /*
           * De dienst erbij, want daar haalt de kaart zijn tegels en zijn route
           * uit. Zonder deze regel stond er "de kaart verschijnt zodra je een
           * lijn en een dienst hebt gekozen" terwijl de dienst al reed.
           */
          duty={duty}
          titel={t(language, 'run.title')}
          onderschrift={t(language, 'run.intro', { map: duty.mapName })}
          koppen={['', '', '']}
          rijen={[]}
          gekozen={0}
          onKies={() => {}}
          voet=""
          onStart={() => void finish()}
          startTekst={t(language, 'act.finish')}
          bezig={busy}
          /*
           * De kaart blijft naast het vel staan: tijdens het rijden is dat de
           * navigatie. Wat erop komt hangt van de bus af -- zolang OMSI niets
           * doorgeeft blijft de hele dienst als flauwe lijn staan, en zodra de
           * bus zich meldt is het de rit die loopt, met hem erop.
           */
          metKaart
          navigatie={{
            routeMode: live ? 'active' : 'all',
            activeLeg: live?.legIndex,
            nextStopId:
              live && live.stopIndex !== undefined
                ? duty.legs[live.legIndex]?.stopIds[live.stopIndex]
                : undefined,
            vehicle: liveBus ? { ...liveBus, speedKmh: live?.speedKmh ?? 0 } : undefined
          }}
          inhoud={
            <>
              {starting && (
                <StartingDialog
                  onDone={() => {
                    setStarting(false)
                    setNote(t(language, 'app.omsiReady'))
                    if (duty) void window.career.setOverlay(duty, true, ibis).then(setOverlayOpen)
                  }}
                  onDismiss={() => setStarting(false)}
                />
              )}
              {/*
                De hele dienst die meeloopt. Hij staat boven de knoppen, want
                dit is waar je naar kijkt terwijl je rijdt; afronden en
                annuleren zoek je een keer op.
              */}
              <LiveDienst duty={duty} ibis={ibis} status={live} />
              <RunningDuty
                duty={duty}
                ibis={ibis}
                session={session}
                connected={connected}
                busy={busy}
                exam={Boolean(exam)}
                overlayOpen={overlayOpen}
                onToggleOverlay={toggleOverlay}
                onCancel={cancelDuty}
                onFinish={finish}
                full={volledig}
              />
            </>
          }
        />
      </LanguageProvider>
    )
  }

  if (
    eersteStart ||
    screen === 'profiles' ||
    screen === 'modes' ||
    screen === 'game' ||
    (mode === 'service' && !started)
  ) {
    const gekozen = selected ?? 0
    const gekozenDuty = duties[gekozen]?.duty
    /*
     * De bus die de app zelf zou kiezen staat vooraan; die past het best bij de
     * dienst, en wie iets anders wil scrollt maar. Alle andere bussen blijven
     * staan -- ze passen alleen minder goed, en dat is de keuze van de speler.
     */
    /*
     * Bij de kaart- en lijnstap is er nog geen dienst en dus geen route, maar
     * de kaart hoort er wel te liggen: het scherm belooft dat je op de kaart
     * kiest. Een dienst zonder ritten is genoeg om het wegennet te tekenen.
     */
    const leegOpDeKaart: Duty | undefined = selectedMap && {
      mapFolder: selectedMap.folder,
      mapName: selectedMap.name,
      lineFile: '',
      tourNumber: '',
      depot: '',
      legs: [],
      signOn: 0,
      start: 0,
      end: 0,
      durationMinutes: 0,
      totalStops: 0,
      lineNumbers: [],
      days: 0,
      period: 0
    }
    const kaartDuty = gekozenDuty ?? leegOpDeKaart

    const bussen = gekozenDuty
      ? [...vehicles].sort((a, b) => {
          const beste = vehicle?.relativePath
          if (a.relativePath === beste) return -1
          if (b.relativePath === beste) return 1
          return busnaam(a).localeCompare(busnaam(b))
        })
      : []

    /* Welke stap het scherm toont: het profiel- en modusscherm horen erbij. */
    /*
     * De instellingen van OMSI hangen aan de modusstap: daar staat de knop, en
     * daar hoor je weer terug te komen als je klaar bent.
     */
    const opzetStap: Stap =
      eersteStart || screen === 'profiles'
        ? 'profile'
        : screen === 'modes' || screen === 'game'
          ? 'mode'
          : stap

    const profielen = career?.profiles ?? []
    const huidigProfiel = career?.state?.driver ?? ''

    /*
     * De vraag over de aanbevolen bus: alleen op de busstap, alleen als er een
     * aanbeveling is, en alleen zolang de speler er nog niets van gevonden heeft.
     */
    const busSleutel = duty ? `${duty.mapFolder}|${duty.tourNumber}|${duty.start}` : ''
    const toonBusVraag =
      stap === 'bus' &&
      busScherm === 'bus' &&
      !busMerk &&
      !confirmed &&
      Boolean(assignment?.vehicle) &&
      busSleutel !== '' &&
      busGevraagd !== busSleutel

    /* Wat elke tegelweergave op de busstap gemeen heeft. */
    const leegBus = {
      koppen: ['', '', ''] as [string, string, string],
      rijen: [] as Rij[],
      index: 0,
      kies: () => {},
      voet: '',
      verder: () => void startAlles(),
      knop: t(language, 'setup.start')
    }

    const vel = ((): {
      stap: Stap
      titel: string
      onderschrift: string
      koppen: [string, string, string]
      rijen: Rij[]
      index: number
      kies: (index: number) => void
      voet: string
      verder: () => void
      knop: string
      tegels?: Tegel[]
      kruimels?: Kruimel[]
      tweede?: { tekst: string; onDoen: () => void }
      vullend?: boolean
      keuzeloos?: boolean
      regelaars?: ReactNode
    } => {
      if (opzetStap === 'profile') {
        /*
         * De eerste start is dezelfde stap zonder chauffeurs. Geen apart
         * welkomstscherm dus: wie de app voor het eerst opent staat gewoon op
         * stap een, met de uitleg erbij en het invulveld al open.
         */
        return {
          stap: 'profile' as Stap,
          titel: eersteStart ? t(language, 'welcome.title') : t(language, 'setup.driverTitle'),
          onderschrift: eersteStart
            ? t(language, 'welcome.intro')
            : t(language, 'setup.driverIntro'),
          koppen: [
            t(language, 'setup.colDriver'),
            t(language, 'setup.colDuties'),
            t(language, 'setup.colDriven')
          ],
          rijen: profielen.map((item) => ({
            id: item.id,
            cellen: [
              item.driver,
              String(item.duties),
              formatDuration(item.minutes, language)
            ] as [string, string, string],
            klok: true,
            actie: {
              label: t(language, 'setup.deleteDriver'),
              gevaarlijk: true,
              onDoen: () => {
                if (!window.confirm(t(language, 'setup.deleteAsk', { name: item.driver }))) return
                void window.career.deleteProfile(item.id).then(setCareer)
              }
            }
          })),
          index: Math.max(0, profielen.findIndex((item) => item.driver === huidigProfiel)),
          kies: (index) => {
            const id = profielen[index]?.id
            if (id) void window.career.selectProfile(id).then(setCareer)
          },
          voet: eersteStart
            ? t(language, 'welcome.accountIntro')
            : t(
                language,
                profielen.length === 1 ? 'setup.driverFootOne' : 'setup.driverFoot',
                { count: profielen.length }
              ),
          verder: () => {
            const gekozenProfiel = profielen[Math.max(0, profielen.findIndex((i) => i.driver === huidigProfiel))]
            if (gekozenProfiel) void chooseProfile(gekozenProfiel.id)
          },
          knop: t(language, 'setup.next')
        }
      }
      if (opzetStap === 'mode' && screen === 'game') {
        return {
          stap: 'mode' as Stap,
          titel: t(language, 'cfg.title'),
          onderschrift: t(language, 'cfg.intro'),
          koppen: ['', '', ''] as [string, string, string],
          rijen: [],
          index: 0,
          kies: () => {},
          voet: '',
          verder: () => setScreen('modes'),
          knop: t(language, 'setup.back')
        }
      }
      if (opzetStap === 'mode') {
        const modi: GameMode[] = ['career', 'service', 'free']
        return {
          stap: 'mode' as Stap,
          titel: t(language, 'setup.modeTitle'),
          onderschrift: t(language, 'setup.modeIntro'),
          koppen: [
            t(language, 'setup.colMode'),
            t(language, 'setup.colLicences'),
            t(language, 'setup.colStatus')
          ],
          rijen: modi.map((naam) => ({
            id: naam,
            cellen: [
              t(language, `mode.${naam}` as const),
              naam === 'career' ? String(career?.summary?.licences ?? 0) : '—',
              active && (active.mode ?? 'service') === naam ? t(language, 'setup.modeRunning') : '—'
            ] as [string, string, string]
          })),
          index: Math.max(0, modi.indexOf(mode)),
          kies: (index) => setMode(modi[index] ?? 'service'),
          /*
           * De voet vertelt wat de aangewezen modus betekent. Het oude scherm
           * zette die uitleg onder elke kaart; hier is maar één regel nodig,
           * want er is er ook maar één aangewezen.
           */
          voet: t(language, `mode.${mode}Intro` as const),
          verder: () => setScreen('drive'),
          knop: t(language, 'setup.next')
        }
      }
      if (stap === 'map') {
        return {
          stap: 'map',
          titel: t(language, 'setup.mapTitle'),
          onderschrift: t(language, 'setup.mapIntro'),
          koppen: [
            t(language, 'setup.colMap'),
            t(language, 'setup.colTours'),
            t(language, 'setup.colYear')
          ],
          rijen: maps.map((item) => ({
            id: item.folder,
            cellen: [item.name, String(item.tours), String(item.year)] as [string, string, string]
          })),
          index: Math.max(0, maps.findIndex((item) => item.folder === mapFolder)),
          kies: (index) => setMapFolder(maps[index]?.folder ?? ''),
          voet: t(language, 'setup.mapFoot', { count: maps.length }),
          verder: () => setStap(lijnVrij ? 'duty' : 'line'),
          knop: t(language, 'setup.next')
        }
      }
      if (stap === 'line') {
        return {
          stap: 'line',
          titel: t(language, 'setup.lineTitle'),
          onderschrift: t(language, 'setup.lineIntro'),
          koppen: [
            t(language, 'setup.colLine'),
            t(language, 'setup.colTrips'),
            t(language, 'setup.colAverage')
          ],
          rijen: lines.map((item) => ({
            id: item.lineFile,
            cellen: [
              item.lineNumbers.join(', ') || item.lineFile,
              String(item.trips),
              formatDuration(item.averageMinutes, language)
            ] as [string, string, string],
            klok: true
          })),
          index: Math.max(0, lines.findIndex((item) => item.lineFile === lineFile)),
          kies: (index) => {
            /*
             * Meteen de diensten ophalen, niet pas bij Verder. Dat is dezelfde
             * ene aanroep, alleen eerder -- en daardoor licht de route van de
             * aangeklikte lijn op de kaart op, wat dit scherm belooft.
             */
            const gekozenLijn = lines[index]?.lineFile ?? ''
            setLineFile(gekozenLijn)
            if (gekozenLijn) void generate(gekozenLijn)
          },
          voet: t(language, 'setup.lineFoot', {
            map: selectedMap?.name ?? '',
            count: lines.length
          }),
          verder: () => {
            /*
             * Wie een lijn aanklikt heeft de diensten al; wie meteen op Verder
             * drukt nog niet. Dan halen we ze alsnog op, want een dienststap
             * zonder diensten is geen stap maar een muur.
             */
            if (duties.length > 0) setStap('duty')
            else void generate(lineFile || undefined).then(() => setStap('duty'))
          },
          knop: t(language, 'setup.next')
        }
      }
      if (stap === 'bus') {
        const ontleed = bussen.map((bus) => ({ bus, ...ontleedBus(bus) }))

        /*
         * De bus die de app zelf zou kiezen: die past het best bij de dienst.
         * Hij wordt nergens opgedrongen -- je kunt gewoon een ander merk
         * aanklikken -- maar hij hoort wel te zien te zijn op elk niveau,
         * anders moet je drie schermen diep zoeken naar wat de app bedoelde.
         */
        const beste = assignment?.vehicle ? ontleedBus(assignment.vehicle) : undefined
        const nuGekozen = vehicleOverride || vehicle?.relativePath
        const gekozenOntleed = nuGekozen
          ? ontleed.find((item) => item.bus.relativePath === nuGekozen)
          : undefined
        /** Het onderschrift van een tegel, met de aanbeveling erachter. */
        const metTip = (tekst: string, isBeste: boolean): string =>
          isBeste ? `${tekst} · ${t(language, 'setup.yardSuggested')}` : tekst

        /*
         * Het hof-bestand bepaalt welke eindbestemmingen op het matrixbord
         * kunnen staan. Het hoort bij de bus omdat je het daar instelt, maar
         * het is een eigen keuze -- vandaar een eigen rooster achter een knop
         * in plaats van een vierde niveau in de bus zelf.
         */
        if (busScherm === 'hof') {
          /*
           * De app heeft de remise al gekozen -- `yardOverride` leeg betekent
           * "neem de best passende". Dit scherm laat alleen zien welke dat is
           * en staat toe hem te wijzigen; niemand hoeft hier iets te doen.
           */
          return {
            ...leegBus,
            stap: 'bus' as Stap,
            titel: t(language, 'setup.yardTitle'),
            onderschrift: t(language, 'setup.yardIntro'),
            kruimels: [
              {
                label: t(language, 'setup.busTitle'),
                onDoen: () => {
                  setBusScherm('bus')
                  setBusMerk(undefined)
                  setBusType(undefined)
                }
              },
              ...(busMerk
                ? [
                    {
                      label: busMerk,
                      onDoen: () => {
                        setBusScherm('bus')
                        setBusType(undefined)
                      }
                    }
                  ]
                : []),
              ...(busType
                ? [{ label: busType, onDoen: () => setBusScherm('bus') }]
                : []),
              { label: t(language, 'setup.yardTitle') }
            ],
            tegels: yards.map((optie) => ({
              id: optie.name,
              titel: optie.name,
              onder:
                t(language, 'setup.yardKnows', { known: optie.known, total: optie.total }) +
                (optie.suggested ? ` · ${t(language, 'setup.yardSuggested')}` : ''),
              icoon: 'hof' as const,
              gekozen: (yardOverride || yards.find((y) => y.suggested)?.name) === optie.name,
              onDoen: () => setYardOverride(optie.name)
            }))
          }
        }


        /* Niveau een: de merken, met hoeveel bussen er onder hangen. */
        if (!busMerk) {
          const merken = new Map<string, number>()
          for (const item of ontleed) merken.set(item.merk, (merken.get(item.merk) ?? 0) + 1)
          return {
            ...leegBus,
            stap: 'bus' as Stap,
            titel: t(language, 'setup.busTitle'),
            onderschrift: t(language, 'setup.busIntro'),
            kruimels: [{ label: t(language, 'setup.busTitle') }],
            /*
             * Alleen als er werkelijk iets te halen valt. Staat alles goed, dan
             * hoort hier niets te staan: een knop die niets doet is erger dan
             * geen knop.
             */
            tweede:
              hofAanbod.length > 0
                ? {
                    tekst: t(language, 'setup.hofOffer', { count: hofAanbod.length }),
                    onDoen: () => setBusScherm('overzetten')
                  }
                : undefined,
            tegels: [...merken.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([merk, aantal]) => ({
                id: merk,
                titel: merk,
                onder: metTip(
                  t(language, aantal === 1 ? 'setup.busCountOne' : 'setup.busCount', {
                    count: aantal
                  }),
                  merk === beste?.merk
                ),
                monogram: merk,
                gekozen: merk === gekozenOntleed?.merk,
                onDoen: () => {
                  setBusScherm('bus')
                  setBusMerk(merk)
                }
              }))
          }
        }

        /* Niveau twee: de types van dat merk. */
        if (!busType) {
          const types = new Map<string, number>()
          for (const item of ontleed) {
            if (item.merk !== busMerk) continue
            types.set(item.type, (types.get(item.type) ?? 0) + 1)
          }
          return {
            ...leegBus,
            stap: 'bus' as Stap,
            titel: busMerk,
            onderschrift: t(language, 'setup.busPickType'),
            kruimels: [
              { label: t(language, 'setup.busTitle'), onDoen: () => setBusMerk(undefined) },
              { label: busMerk }
            ],
            tegels: [...types.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([type, aantal]) => ({
                id: type,
                titel: type,
                onder: metTip(
                  t(language, aantal === 1 ? 'setup.busCountOne' : 'setup.busCount', {
                    count: aantal
                  }),
                  busMerk === beste?.merk && type === beste?.type
                ),
                vorm: busvorm(busMerk + ' ' + type),
                gekozen: busMerk === gekozenOntleed?.merk && type === gekozenOntleed?.type,
                onDoen: () => {
                  setBusScherm('bus')
                  setBusType(type)
                }
              }))
          }
        }

        /* Niveau drie: de uitvoeringen, en daar kies je er echt een. */
        const uitvoeringen = ontleed.filter(
          (item) => item.merk === busMerk && item.type === busType
        )
        return {
          ...leegBus,
          stap: 'bus' as Stap,
          titel: busType,
          onderschrift: t(language, 'setup.busPickTrim'),
          kruimels: [
            {
              label: t(language, 'setup.busTitle'),
              onDoen: () => {
                setBusMerk(undefined)
                setBusType(undefined)
              }
            },
            { label: busMerk, onDoen: () => setBusType(undefined) },
            { label: busType }
          ],
          tegels: uitvoeringen.map((item) => ({
            id: item.bus.relativePath,
            titel: item.uitvoering,
            onder: metTip(
              item.bus.paint,
              item.bus.relativePath === assignment?.vehicle?.relativePath
            ),
            vorm: busvorm(item.type + ' ' + item.uitvoering),
            gekozen: (vehicleOverride || vehicle?.relativePath) === item.bus.relativePath,
            onDoen: () => {
              /*
               * De bus vastleggen en meteen door naar de remise. Dat is het
               * laatste dat nog kan verschillen, en hij staat al goed -- je
               * ziet hem dus vooral om te weten dat hij klopt.
               */
              setVehicleOverride(item.bus.relativePath)
              setBusScherm('hof')
            }
          }))
        }
      }

      return {
        stap: 'duty',
        titel: `${t(language, 'setup.duties')}${gekozenDuty ? ` · ${gekozenDuty.lineNumbers[0] ?? ''}` : ''}`,
        onderschrift: t(language, 'setup.pick'),
        /*
         * De dienstgenerator wandelt door het rittennet en geeft juist voorrang
         * aan een andere lijn -- zie `appetite` in core/duty.ts. Maar hoe lang
         * hij mag worden en op welk dagdeel, dat zeg jij. Die twee knoppen
         * stonden alleen in de oude schermen; daardoor draaide hij hier altijd
         * op anderhalf uur, hele dag.
         */
        regelaars: (
          <>
            <div className="regelaar">
              <div className="regelaar-kop">
                <label htmlFor="dienstlengte">{t(language, 'app.length')}</label>
                <span className="regelaar-waarde">
                  {formatDuration(LENGTHS[lengthIndex], language)}
                </span>
              </div>
              <input
                id="dienstlengte"
                type="range"
                min={0}
                max={LENGTHS.length - 1}
                value={lengthIndex}
                disabled={confirmed}
                onChange={(event) => setLengthIndex(Number(event.target.value))}
              />
            </div>

            <div className="regelaar">
              <div className="regelaar-kop">
                <label>{t(language, 'app.daypart')}</label>
              </div>
              <div className="regelaar-chips">
                {(Object.keys(TIME_WINDOWS) as Array<DutyRequest['window']>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={timeWindow === key}
                    disabled={confirmed}
                    onClick={() => setTimeWindow(key)}
                  >
                    {t(language, `window.${key}` as const)}
                  </button>
                ))}
              </div>
            </div>
          </>
        ),
        koppen: [
          t(language, 'setup.departure'),
          t(language, 'setup.arrival'),
          t(language, 'setup.duration')
        ],
        rijen: duties.map((item, index) => ({
          id: `${item.duty.tourNumber}-${item.duty.start}-${index}`,
          cellen: [
            formatTime(item.duty.start),
            formatTime(item.duty.end),
            formatDuration(item.duty.durationMinutes, language)
          ] as [string, string, string],
          klok: true
        })),
        index: gekozen,
        kies: setSelected,
        voet: t(
          language,
          duties.length === 1 ? 'setup.availableOne' : 'setup.available',
          { line: gekozenDuty?.lineNumbers[0] ?? '', count: duties.length }
        ),
        /*
         * Er komt elke keer iets anders uit -- de dienst wordt uit de
         * dienstregeling gelopen en die wandeling is toevallig. Dus een knop om
         * opnieuw te laten zoeken, met dezelfde vraag: bevalt dit rooster niet,
         * dan haal je een ander.
         */
        tweede: {
          tekst: t(language, busy ? 'setup.searching' : 'setup.regenerate'),
          onDoen: () => {
            if (busy || confirmed) return
            void generateRef.current?.(lineFile || undefined)
          }
        },
        verder: () => setStap('bus'),
        knop: t(language, 'setup.next')
      }
    })()

    return (
      <LanguageProvider language={language}>
        <Setup
          stap={opzetStap}
          lijn={gekozenDuty?.lineNumbers[0] ?? gekozenDuty?.legs[0]?.lineNumber}
          titel={vel.titel}
          onderschrift={vel.onderschrift}
          koppen={vel.koppen}
          rijen={vel.rijen}
          gekozen={vel.index}
          onKies={vel.kies}
          voet={vel.voet}
          duty={kaartDuty}
          onStart={vel.verder}
          startTekst={vel.knop}
          bezig={busy}
          stappen={lijnVrij ? ZONDER_LIJN : undefined}
          tegels={vel.tegels}
          kruimels={vel.kruimels}
          vullend={vel.vullend}
          keuzeloos={vel.keuzeloos}
          regelaars={vel.regelaars}
          dialoog={
            /*
             * Eerst de vraag over de bus zelf, en pas daarna die over het
             * wagenpark: twee vensters tegelijk is er een te veel, en de tweede
             * gaat over een keuze die de eerste nog moet maken.
             */
            toonBusVraag && assignment?.vehicle && duty ? (
              <BusDialog
                bus={`${assignment.vehicle.manufacturer} ${assignment.vehicle.type}`.trim()}
                fit={assignment.fit}
                yard={assignment.yard}
                onZelf={() => setBusGevraagd(busSleutel)}
                onDoorgaan={() => {
                  setBusGevraagd(busSleutel)
                  /*
                   * De remise erachteraan: dat is het laatste dat nog kan
                   * verschillen, en hij staat al goed -- je ziet hem dus vooral
                   * om te weten dat hij klopt.
                   */
                  setVehicleOverride(assignment.vehicle!.relativePath)
                  setBusScherm('hof')
                }}
              />
            ) : busAanbod && vehicle && duty ? (
              <HofDialog
                bus={`${vehicle.manufacturer} ${vehicle.type}`.trim() || vehicle.folder}
                aanbod={busAanbod}
                bezig={hofBezig}
                onNee={() => {
                  setHofGevraagd(`${duty.mapFolder}|${vehicle.folder}`)
                  setBusAanbod(undefined)
                }}
                onJa={() => {
                  if (hofBezig) return
                  setHofBezig(true)
                  void window.career
                    .placeHofs(duty, [vehicle.folder])
                    .then(async (result) => {
                      setNote(t(language, 'setup.hofDone', { count: result.placed }))
                      setHofGevraagd(`${duty.mapFolder}|${vehicle.folder}`)
                      setBusAanbod(undefined)
                      // De wagenparken opnieuw ophalen; er ligt er nu een bij.
                      setHofTeller((n) => n + 1)
                      setHofAanbod(await window.career.hofOffers(duty))
                    })
                    .finally(() => setHofBezig(false))
                }}
              />
            ) : undefined
          }
          tweede={
            vel.tweede ??
            (opzetStap === 'profile'
              ? {
                  tekst: t(language, 'setup.newDriver'),
                  onDoen: () => setNieuweChauffeur('')
                }
              : opzetStap === 'mode' && screen !== 'game'
                ? { tekst: t(language, 'setup.omsiSettings'), onDoen: () => setScreen('game') }
                : undefined)
          }
          invoer={
            (nieuweChauffeur !== undefined || eersteStart) && opzetStap === 'profile'
              ? {
                  waarde: nieuweChauffeur ?? '',
                  plaatshouder: t(language, 'welcome.name'),
                  onWaarde: setNieuweChauffeur,
                  onBevestig: () => {
                    const naam = (nieuweChauffeur ?? '').trim()
                    if (!naam) return
                    setNieuweChauffeur(undefined)
                    void createProfile(naam)
                  },
                  onAnnuleer: () => setNieuweChauffeur(undefined)
                }
              : undefined
          }
          inhoud={
            screen === 'game' ? (
              <GameSetup language={language} onBack={() => setScreen('modes')} />
            ) : undefined
          }
          rechtsInBalk={
            <>
              <Versie />
              <ThemaKnop language={language} thema={thema} onThema={kiesThema} />
              {LANGUAGES.map((taal) => (
                <button
                  key={taal.code}
                  type="button"
                  aria-pressed={taal.code === language}
                  aria-label={taal.native}
                  title={taal.native}
                  onClick={() => chooseLanguage(taal.code)}
                >
                  <Flag code={taal.code} />
                </button>
              ))}
            </>
          }
          onStap={(naar) => {
            /*
             * Terug in de balk gooit weg wat van de verlaten stap afhing. Een
             * dienstenlijst van een lijn die je net hebt losgelaten, is geen
             * keuze meer maar een val.
             */
            if (naar === 'profile') {
              setScreen('profiles')
              return
            }
            if (naar === 'mode') {
              setScreen('modes')
              return
            }
            setScreen('drive')
            if (naar === 'map' || naar === 'line') {
              setDuties([])
              setSelected(undefined)
            }
            setStap(naar)
          }}
        />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider language={language}>
    <div className="app">
      <Sidebar
        language={language}
        onLanguage={chooseLanguage}
        career={career}
        onRename={async (name) => setCareer(await window.career.renameDriver(name))}
        onSelectProfile={async (id) => setCareer(await window.career.selectProfile(id))}
        onNewProfile={async (name) => setCareer(await window.career.createProfile(name))}
      />

      {starting && (
        <StartingDialog
          onDone={() => {
            setStarting(false)
            setNote(t(language, 'app.omsiReady'))
            // Nu pas: het spel draait, dus de overlay heeft iets om boven te hangen.
            if (duty) void window.career.setOverlay(duty, true, ibis).then(setOverlayOpen)
          }}
          onDismiss={() => setStarting(false)}
        />
      )}

      <main className="main">
        <div className="mode-bar">
          <span className="mode-tag">{t(language, `mode.${mode}` as const)}</span>
          <button type="button" className="link-button" onClick={() => setScreen('modes')}>
            {t(language, 'mode.otherMode')}
          </button>
          <button type="button" className="link-button" onClick={() => setScreen('game')}>
            {t(language, 'cfg.title')}
          </button>
          {/*
            Kaarten en bussen komen als een map de OMSI-map in; niets meldt dat
            aan ons. Deze knop gaat opnieuw kijken, zonder de app te herstarten.
          */}
          <button
            type="button"
            className="link-button"
            disabled={checking}
            onClick={() => void checkInstalled()}
          >
            {t(language, checking ? 'check.busy' : 'check.button')}
          </button>
          {/*
            Ook hier, want de busstap bestaat alleen in de dienstmodus en dit
            hoort bij de installatie en niet bij een modus.
          */}
          {hofAanbod.length > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={() => setBusScherm('overzetten')}
            >
              {t(language, 'setup.hofOffer', { count: hofAanbod.length })}
            </button>
          )}
          {checked && <span className="note mode-note">{checked}</span>}
        </div>

        {schermmodus === 'volledig' && (
          <div className="note warn fullscreen-note">
            <p>{t(language, inVenster ? 'app.fullscreenFixed' : 'app.fullscreen')}</p>
            <label className="fullscreen-keuze">
              <input
                type="checkbox"
                checked={inVenster}
                onChange={(event) => {
                  const aan = event.target.checked
                  setInVenster(aan)
                  void window.career.saveSettings({ windowedOmsi: aan })
                }}
              />
              {t(language, 'app.windowed')}
            </label>
          </div>
        )}

        {/*
          De kop zegt in welke modus je bent; alleen bij dienst is dat "dienst
          kiezen". Rijdt de dienst, dan valt er niets meer te kiezen en zegt het
          compacte scherm zelf wel waar je aan toe bent.
        */}
        {!started && (
          <>
            <h1>
              {mode === 'service' ? t(language, 'app.title') : t(language, `mode.${mode}` as const)}
            </h1>
            <p className="subtitle">
              {mode === 'service'
                ? t(language, 'app.subtitle')
                : t(language, mode === 'career' ? 'mode.careerIntro' : 'mode.freeIntro')}
            </p>
          </>
        )}

        {mode === 'free' ? (
          <FreePlay
            language={language}
            maps={maps}
            lines={lines}
            vehicleGroups={vehicleGroups}
            mapFolder={mapFolder}
            onMapChange={setMapFolder}
            lineFile={lineFile}
            onLineChange={setLineFile}
          />
        ) : (
          <>
            {mode === 'career' && career?.state && !started && (
              <CareerPanel
                language={language}
                state={career.state}
                maps={maps}
                lines={lines}
                mapFolder={mapFolder}
                onMapChange={setMapFolder}
                busy={busy || confirmed}
                onAssign={(licensedLine) => void generate(licensedLine)}
                onExam={async (line, basic) => {
                  setBusy(true)
                  setError(undefined)
                  setNote(undefined)
                  try {
                    const found = await window.career.examDuty(mapFolder, line.lineFile)
                    if (!found) {
                      setError(t(language, 'exam.none'))
                      return
                    }
                    setDuties([found])
                    setSelected(0)
                    setVehicleOverride('')
                    setStarted(false)
                    // Het examen ligt meteen vast: er valt niets te kiezen.
                    setCareer(
                      await window.career.confirmDuty(found, '', 'career', {
                        lineFile: line.lineFile,
                        lineNumbers: line.lineNumbers,
                        basic
                      })
                    )
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause))
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            )}

            {mode === 'service' && !started && (
              <section className="card">
                <div className="field-grid">
                  <div>
                    <label htmlFor="map">{t(language, 'app.map')}</label>
                    <select
                      id="map"
                      value={mapFolder}
                      disabled={confirmed}
                      onChange={(event) => setMapFolder(event.target.value)}
                    >
                      {maps.map((item) => (
                        <option key={item.folder} value={item.folder}>
                          {item.name} — {t(language, 'app.mapTours', { count: item.tours })}
                        </option>
                      ))}
                    </select>
                    {selectedMap && (
                      <p className="note" style={{ marginTop: 8 }}>
                        {t(language, 'app.mapEra', { year: selectedMap.year })}
                      </p>
                    )}
                  </div>

                  <div>
                    <LinePicker
                      language={language}
                      lines={lines}
                      value={lineFile}
                      disabled={confirmed}
                      onChange={setLineFile}
                    />
                  </div>

                  <div>
                    <label htmlFor="length">{t(language, 'app.length')}</label>
                    <div className="length-value">{formatDuration(LENGTHS[lengthIndex], language)}</div>
                    <input
                      id="length"
                      type="range"
                      min={0}
                      max={LENGTHS.length - 1}
                      value={lengthIndex}
                      onChange={(event) => setLengthIndex(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <label>{t(language, 'app.daypart')}</label>
                    <div className="chips">
                      {(Object.keys(TIME_WINDOWS) as Array<DutyRequest['window']>).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="chip"
                          aria-pressed={timeWindow === key}
                          onClick={() => setTimeWindow(key)}
                        >
                          {t(language, `window.${key}` as const)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void generate()}
                    disabled={busy || confirmed}
                  >
                    {t(language, 'app.generate')}
                  </button>
                  {duties.length > 0 && !proposal && (
                    <button type="button" className="btn secondary" onClick={() => setProposal(true)}>
                      {t(language, 'prop.title')}
                    </button>
                  )}
                  <PluginNote status={plugin} language={language} />
                </div>
                {confirmed && (
                  <p className="note" style={{ marginTop: 12 }}>
                    {t(language, 'app.activeDuty')}
                  </p>
                )}
              </section>
            )}

            {(error || note) && (
              <section className="card">
                {error && <p className="note warn">{error}</p>}
                {note && <p className="note">{note}</p>}
              </section>
            )}

            {/*
              Dezelfde kaart, twee plekken: in het voorstelvenster zolang dat
              openstaat, en anders gewoon op het scherm. Eén kaart, want alles
              wat je moet weten staat erop.
            */}
            {assignment &&
              (() => {
                const card = (
                  <DutyCard
                    assignment={assignment}
                    ibis={ibis}
                    vehicle={vehicle}
                    vehicleGroups={vehicleGroups}
                    vehicleOverride={vehicleOverride}
                    onVehicleChange={setVehicleOverride}
                    yards={yards}
                    yardOverride={yardOverride}
                    onYardChange={setYardOverride}
                    busy={busy}
                    confirmed={confirmed}
                    started={started}
                    overlayOpen={overlayOpen}
                    exam={Boolean(exam)}
                    onConfirm={() => void confirmDuty()}
                    onCancel={cancelDuty}
                    onBegin={begin}
                    onToggleOverlay={toggleOverlay}
                    onFinish={finish}
                    printers={printers}
                    printer={printer}
                    onPrinterChange={setPrinter}
                  />
                )
                if (proposal) {
                  return (
                    <DutyProposal
                      language={language}
                      confirmed={confirmed}
                      busy={busy}
                      onRegenerate={() => void generate()}
                      onClose={() => setProposal(false)}
                    >
                      {card}
                    </DutyProposal>
                  )
                }
                /*
                 * Zodra de dienst loopt zit je in de bus. Dan hoort er alleen te
                 * staan wat je voor de eerste rit nodig hebt; de hele kaart en de
                 * route gaan achter een knop.
                 */
                if (started && duty) {
                  return (
                    <RunningDuty
                      duty={duty}
                      ibis={ibis}
                      session={session}
                      connected={connected}
                      busy={busy}
                      exam={Boolean(exam)}
                      overlayOpen={overlayOpen}
                      onToggleOverlay={toggleOverlay}
                      onCancel={cancelDuty}
                      onFinish={finish}
                      full={card}
                    />
                  )
                }
                return card
              })()}
          </>
        )}
      </main>
    </div>
    </LanguageProvider>
  )
}
