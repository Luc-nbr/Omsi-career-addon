import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  aanHetWerk,
  bedrijfsfactoren,
  isInzetbaar,
  lijnnaam,
  opleidingKlaar,
  type Bedrijf as BedrijfStaat,
  type Busvorm,
  type EigenBus,
  type Medewerker
} from '../../core/bedrijf'
import { PLAN } from '../../core/planregels'
import { besparingBus, besparingChauffeur } from '../../core/plantarief'
import type {
  Conflict,
  DagPlan,
  Dagrooster,
  DienstSleutel,
  LopendeRit,
  OmloopSleutel,
  OmloopVanDag,
  PlanCijfers,
  PlanDienst,
  PlanOmloop,
  RoosterActie,
  Stand,
  VastRooster
} from '../../core/planTypen'
import {
  afrekening,
  dagplan,
  dienstKosten,
  maskerDagen,
  ontleedDienst,
  ontleedOmloop,
  pasRoosterToe,
  pastBus,
  pastChauffeur,
  zoekPlanDienst,
  zoekPlanOmloop
} from '../../core/rooster'
import type { CareerPayload } from '../../shared/api'
import type { Language } from '../../shared/i18n'
import { loose, type TextKey } from '../../shared/i18n'
import { useLanguage, useT } from './language'
import { type Focus, type Handel, type Naar, useGeld } from './BedrijfDelen'
import './planning.css'

/*
 * DE PLANNING (ontwerp busbedrijf-planning §4.1)
 *
 * Wie rijdt welke omloop met welke bus. Bovenaan wat vandaag oplevert en kost,
 * een strook met de week, en een werkbalk; daaronder het rooster op een
 * tijdas: per lijn de omlopen, op elke omloop de diensten van de chauffeurs.
 * Rechts wie en wat er vrij is. Indelen gaat door te slepen (muis of lang
 * drukken), of tik-tik: eerst een chip, dan de dienst. Onder 900 px breed
 * wordt het een lijst met keuzelijsten.
 *
 * Het rooster is VAST per dagmasker: wie je op dinsdag indeelt, rijdt ook
 * woensdag tot vrijdag. Uitval en invullen bestaan alleen vandaag.
 *
 * De dagroosters van de week haalt dit scherm zelf (`bedrijfDagen`, hoogstens
 * tien dagen). Main geeft bij een roosteractie alleen gisteren tot morgen mee;
 * voor een dag verder in de week toetst het venster een chauffeur vooraf op
 * "te lang" met dezelfde kern (`pasRoosterToe`), en neemt het een rooster van
 * een ander masker over met `herstel` als main de dagen niet heeft.
 */

export interface PlanningProps {
  bedrijf: BedrijfStaat
  /** Het plan van vandaag uit de schil (useDagplan); zonder rekent dit scherm het zelf. */
  plan?: DagPlan
  cijfers?: PlanCijfers
  lopend?: LopendeRit
  handel: Handel
  naar: Naar
  focus?: Focus
  onCareer: (payload: CareerPayload) => void
}

/* ------------------------------------------------------------------ */
/* Kleine hulpjes, ook voor het dashboard, het personeel en de markt  */
/* ------------------------------------------------------------------ */

const LOCALE: Record<Language, string> = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL' }

/** Een getal met één decimaal, in de notatie van de taal: 7,1. */
export function eenDecimaal(x: number, taal: Language): string {
  return x.toLocaleString(LOCALE[taal], { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Minuten na middernacht als klok, ook voor nachtritten (−15 is 23:45, 1506 is 01:06). */
export function klok(minuten: number): string {
  const m = ((Math.round(minuten) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** `jjjj-mm-dd` als "dinsdag 26 april 2016". */
export function datumTekst(iso: string | undefined, taal: Language, kort = false): string {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(LOCALE[taal], kort
    ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }
    : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const WEEKDAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] as const
const DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const

/** Een dagmasker leesbaar: "ma–vr", "za", "zo + feestdag (alleen schooldagen)". */
export function maskerTekst(days: number, tr: ReturnType<typeof useT>): string {
  const m = maskerDagen(days)
  const idx = m.dagen.map((d) => DAGEN.indexOf(d)).sort((a, b) => a - b)
  const groepen: number[][] = []
  for (const i of idx) {
    const g = groepen[groepen.length - 1]
    if (g && g[g.length - 1] === i - 1) g.push(i)
    else groepen.push([i])
  }
  const dag = (i: number): string => tr(`bd.dag.${DAGEN[i]}` as TextKey)
  const delen = groepen.map((g) => (g.length >= 3 ? `${dag(g[0])}–${dag(g[g.length - 1])}` : g.map(dag).join(', ')))
  if (m.feestdag) delen.push(tr('bd.dag.feest'))
  const tekst = delen.join(' + ')
  return m.periode ? `${tekst} (${tr(m.periode === 'school' ? 'bd.masker.school' : 'bd.masker.break')})` : tekst
}

/**
 * De pechkans van een bus per dag (ontwerp §5.1, formule van deel B).
 * OMWEG: deel B levert `pechKans` in core/uitval.ts; tot de integratie staat
 * dezelfde formule hier.
 */
export function pechkans(bus: EigenBus, monteurs: number): number {
  const remming = Math.min(0.4, monteurs * 0.1)
  return (0.01 + (Math.max(0, 70 - bus.staat) / 70) * 0.06) * (1 - remming)
}

/**
 * Een gemiddelde dienst en omloop van de concessies, uit de weken in de
 * concessies (`c.week`). Zonder week: undefined.
 */
export function gemiddelden(b: BedrijfStaat): { dienstUren?: number; omloopRituren?: number } {
  const met = b.concessies.filter((c) => c.week)
  const werk = met.reduce((s, c) => s + c.week!.gemWerkuren, 0)
  const diensten = met.reduce((s, c) => s + c.week!.gemDiensten, 0)
  const rit = met.reduce((s, c) => s + c.week!.gemRituren, 0)
  const omlopen = met.reduce((s, c) => s + c.week!.gemOmlopen, 0)
  return {
    ...(diensten > 0 ? { dienstUren: werk / diensten } : {}),
    ...(omlopen > 0 ? { omloopRituren: rit / omlopen } : {})
  }
}

/** "Anna Becker" → "Anna B." */
export function korteNaam(naam: string): string {
  const delen = naam.split(' ')
  return delen.length > 1 ? `${delen[0]} ${delen[delen.length - 1][0]}.` : naam
}

const nummerVan = (sleutel: OmloopSleutel): string => ontleedOmloop(sleutel)?.tourNumber ?? sleutel
const dienstNaam = (sleutel: DienstSleutel): string => {
  const d = ontleedDienst(sleutel)
  return d ? `${nummerVan(d.omloop)}-${d.deel}` : sleutel
}

/** Welke kleur een stuk werk krijgt. */
function soortVan(stand: Stand, jij?: PlanDienst['jij']): string {
  if (jij) return 'jij'
  const w = stand.wie.soort
  if (w === 'eigen' || w === 'collega') return 'eigen'
  if (w === 'uitzend') return stand.bron === 'centrale' ? 'uitzend centrale' : 'uitzend'
  if (w === 'liggen') return 'open'
  return 'uitbesteed'
}

function useSmal(): boolean {
  const vraag = '(max-width: 900px)'
  const [smal, setSmal] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(vraag).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(vraag)
    if (!mq) return
    const zet = (): void => setSmal(mq.matches)
    mq.addEventListener('change', zet)
    return () => mq.removeEventListener('change', zet)
  }, [])
  return Boolean(smal)
}

function bewaard(sleutel: string): string | null {
  try {
    return window.localStorage.getItem(sleutel)
  } catch {
    return null
  }
}
function bewaar(sleutel: string, waarde: string): void {
  try {
    window.localStorage.setItem(sleutel, waarde)
  } catch {
    /* geen opslag: dan onthoudt hij het niet */
  }
}

/* ------------------------------------------------------------------ */
/* Slepen en tik-tik                                                  */
/* ------------------------------------------------------------------ */

type Sleepbaar = { soort: 'chauffeur'; id: number; tekst: string } | { soort: 'bus'; nummer: number; tekst: string } | { soort: 'dienst'; dienst: DienstSleutel; tekst: string }
type Doel =
  | { soort: 'dienst'; dienst: DienstSleutel }
  | { soort: 'bus'; omloop: OmloopSleutel }
  | { soort: 'lijn'; mapFolder: string; lineFile: string }
  | { soort: 'mens'; id: number }

function doelVan(el: Element | null): Doel | undefined {
  const t = el?.closest<HTMLElement>('[data-drop]')
  if (!t) return undefined
  const d = t.dataset
  if (d.drop === 'dienst' && d.dienst) return { soort: 'dienst', dienst: d.dienst }
  if (d.drop === 'bus' && d.omloop) return { soort: 'bus', omloop: d.omloop }
  if (d.drop === 'lijn' && d.map && d.lijn) return { soort: 'lijn', mapFolder: d.map, lineFile: d.lijn }
  if (d.drop === 'mens' && d.id) return { soort: 'mens', id: Number(d.id) }
  return undefined
}

/* ------------------------------------------------------------------ */
/* Het scherm                                                         */
/* ------------------------------------------------------------------ */

const ZOOM_SLEUTEL = 'omsi-enhancer.planning.zoom'
const UITLEG_SLEUTEL = 'omsi-enhancer.planning.uitleg'

export function Planning({ bedrijf: b, plan, cijfers, lopend, handel, naar, focus, onCareer }: PlanningProps): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const smal = useSmal()
  const f = bedrijfsfactoren(b)
  const mensen = useMemo(() => new Map((b.personeel ?? []).map((m) => [m.id, m])), [b.personeel])
  const bussen = useMemo(() => new Map((b.bussen ?? []).map((x) => [x.nummer, x])), [b.bussen])

  /* ---- de dagroosters van de week ---- */
  const [week, setWeek] = useState<Dagrooster[]>()
  const sleutel = `${b.dag}|${b.concessies.map((c) => `${c.mapFolder}/${c.lineFile}`).join(',')}|${JSON.stringify(b.ankers ?? {})}`
  useEffect(() => {
    if (b.concessies.length === 0) {
      setWeek([])
      return
    }
    let weg = false
    window.career
      .bedrijfDagen(Math.max(1, b.dag - 1), b.dag + 7)
      .then((d) => {
        if (!weg) setWeek(d)
      })
      .catch(() => {
        if (!weg) setWeek([])
      })
    return () => {
      weg = true
    }
  }, [sleutel]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- welke dag, welke weergave ---- */
  const [dag, setDag] = useState(focus?.dag ?? b.dag)
  useEffect(() => setDag(b.dag), [b.dag])
  useEffect(() => {
    if (focus?.dag !== undefined) setDag(focus.dag)
  }, [focus])
  const vandaag = dag === b.dag
  const [weergave, setWeergave] = useState<'omlopen' | 'mensen'>('omlopen')
  const [zoom, setZoom] = useState(() => {
    const z = Number(bewaard(ZOOM_SLEUTEL))
    return z >= 32 && z <= 160 ? z : 64
  })
  const zetZoom = (z: number): void => {
    const nieuw = Math.max(32, Math.min(160, z))
    setZoom(nieuw)
    bewaar(ZOOM_SLEUTEL, String(nieuw))
  }
  const [kaartFilter, setKaartFilter] = useState('')
  const [alleenConflict, setAlleenConflict] = useState(false)
  const [uitlegWeg, setUitlegWeg] = useState(() => bewaard(UITLEG_SLEUTEL) === '1')
  const [menu, setMenu] = useState<'vulAan' | 'leeg' | undefined>()
  const [bericht, setBericht] = useState<{ tekst: string; soort: 'goed' | 'laat' }>()
  const [ongedaan, setOngedaan] = useState<VastRooster>()
  const [bezig, setBezig] = useState(false)
  const [keuze, setKeuze] = useState<Sleepbaar>()
  const [pop, setPop] = useState<{ dienst?: DienstSleutel; omloop?: OmloopSleutel; x: number; y: number }>()
  const [uitbesteedOpen, setUitbesteedOpen] = useState(false)

  /* ---- het plan van de gekozen dag, en de week ---- */
  const planVandaag = useMemo(
    () => plan ?? (week ? dagplan(b, week, b.dag, lopend) : undefined),
    [plan, week, b, lopend]
  )
  const dagPlan = useMemo(
    () => (vandaag ? planVandaag : week ? dagplan(b, week, dag) : undefined),
    [vandaag, planVandaag, week, b, dag]
  )
  const dagCijfers = useMemo(
    () => (vandaag && cijfers ? cijfers : dagPlan ? afrekening(b, dagPlan) : undefined),
    [vandaag, cijfers, dagPlan, b]
  )
  const strook = useMemo(() => {
    if (!week) return []
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = b.dag + i
      const p = i === 0 ? planVandaag : dagplan(b, week, d)
      const r = week.find((x) => x.dag === d)
      return { d, p, c: p ? afrekening(b, p) : undefined, r }
    })
  }, [week, b, planVandaag])

  /* ---- maskers per lijn in de week, voor "overnemen" en "leegmaken" ---- */
  const lijnen = useMemo(() => {
    const uit = new Map<string, { mapFolder: string; lineFile: string; naam: string; maskers: Map<number, OmloopVanDag[]> }>()
    for (const r of week ?? []) {
      for (const k of r.kaarten) {
        if (k.fout) continue
        for (const o of k.omlopen) {
          const c = b.concessies.find((x) => x.mapFolder === o.mapFolder && x.lineFile.toLowerCase() === o.lineFile.toLowerCase())
          if (!c) continue
          const sl = `${o.mapFolder}|${o.lineFile.toLowerCase()}`
          const lijn = uit.get(sl) ?? { mapFolder: o.mapFolder, lineFile: c.lineFile, naam: lijnnaam(c), maskers: new Map() }
          if (!lijn.maskers.has(o.days)) lijn.maskers.set(o.days, r.kaarten.find((x) => x.mapFolder === o.mapFolder)?.omlopen.filter((x) => x.days === o.days && x.lineFile.toLowerCase() === o.lineFile.toLowerCase()) ?? [])
          uit.set(sl, lijn)
        }
      }
    }
    return uit
  }, [week, b.concessies])

  const rooster = b.rooster ?? { bussen: {}, chauffeurs: {} }
  const ingedeeld = useCallback(
    (mapFolder: string, lineFile: string, days: number): number => {
      const hoort = (s: string): boolean => {
        const o = ontleedOmloop(s)
        return Boolean(o && o.mapFolder === mapFolder && o.lineFile.toLowerCase() === lineFile.toLowerCase() && o.days === days)
      }
      return (
        Object.keys(rooster.bussen).filter(hoort).length +
        Object.keys(rooster.chauffeurs).filter((s) => hoort(ontleedDienst(s)?.omloop ?? s)).length
      )
    },
    [rooster]
  )

  /* ---- Esc en tikken op leeg ---- */
  useEffect(() => {
    const toets = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setKeuze(undefined)
        setPop(undefined)
        setMenu(undefined)
      }
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [])

  // Een focus op iemand of een bus (stilstand op het dashboard): meteen gekozen voor tik-tik.
  useEffect(() => {
    const m = focus?.medewerker !== undefined ? mensen.get(focus.medewerker) : undefined
    const bus = focus?.bus !== undefined ? bussen.get(focus.bus) : undefined
    if (m) setKeuze({ soort: 'chauffeur', id: m.id, tekst: korteNaam(m.naam) })
    else if (bus) setKeuze({ soort: 'bus', nummer: bus.nummer, tekst: String(bus.nummer) })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Een focus uit een andere tab: de dienst of omloop in beeld.
  useEffect(() => {
    const doel = focus?.dienst ?? focus?.omloop
    if (!doel) return
    const t = window.setTimeout(() => {
      document.querySelector(`[data-sleutel="${CSS.escape(doel)}"]`)?.scrollIntoView({ block: 'center', inline: 'center' })
    }, 60)
    return () => window.clearTimeout(t)
  }, [focus, dagPlan])

  /* ---- het rooster aanpassen ---- */
  const foutTekst = (fout: string): string => loose(taal, `bd.fout.${fout}`, tr('bd.failed'))
  const doe = async (actie: RoosterActie, klaar?: (uit: { melding?: { bussen: number; diensten: number } }) => void): Promise<boolean> => {
    // Vooraf toetsen met dezelfde kern, op de dagen die dit venster heeft (main ziet er maar drie).
    if (week && (actie.soort === 'chauffeur' || actie.soort === 'bus')) {
      const lokaal = pasRoosterToe(b, week, actie)
      if ('fout' in lokaal) {
        setBericht({ tekst: foutTekst(lokaal.fout), soort: 'laat' })
        return false
      }
    }
    setBezig(true)
    try {
      const uit = await window.career.bedrijfRooster(actie)
      onCareer(uit.payload)
      if (uit.fout) {
        setBericht({ tekst: foutTekst(uit.fout), soort: 'laat' })
        return false
      }
      if (klaar) klaar(uit)
      else setBericht(undefined)
      return true
    } catch {
      setBericht({ tekst: tr('bd.failed'), soort: 'laat' })
      return false
    } finally {
      setBezig(false)
    }
  }
  const meldKlaar = (uit: { melding?: { bussen: number; diensten: number } }): void => {
    if (uit.melding) setBericht({ tekst: tr('bd.plan.vulAanKlaar', uit.melding), soort: 'goed' })
  }
  const kopieer = async (mapFolder: string, lineFile: string, van: number, naar_: number): Promise<void> => {
    if (!week) return
    const actie: RoosterActie = { soort: 'kopieer', mapFolder, lineFile, van, naar: naar_ }
    const lokaal = pasRoosterToe(b, week, actie)
    if ('fout' in lokaal) {
      setBericht({ tekst: foutTekst(lokaal.fout), soort: 'laat' })
      return
    }
    setBezig(true)
    try {
      let uit = await window.career.bedrijfRooster(actie)
      // OMWEG: main had de dagen van die maskers niet; dan het rooster dat dit venster uitrekende.
      if (uit.fout === 'dag' && lokaal.bedrijf.rooster) uit = await window.career.bedrijfRooster({ soort: 'herstel', rooster: lokaal.bedrijf.rooster })
      onCareer(uit.payload)
      if (uit.fout) setBericht({ tekst: foutTekst(uit.fout), soort: 'laat' })
      else setBericht({ tekst: tr('bd.plan.vulAanKlaar', lokaal.melding ?? { bussen: 0, diensten: 0 }), soort: 'goed' })
    } finally {
      setBezig(false)
    }
  }
  const wis = async (actie: Extract<RoosterActie, { soort: 'wis' }>): Promise<void> => {
    setMenu(undefined)
    const voor = b.rooster
    const lokaal = pasRoosterToe(b, week ?? [], actie)
    const na = 'fout' in lokaal ? undefined : lokaal.bedrijf.rooster
    const n = voor && na
      ? Object.keys(voor.bussen).length + Object.keys(voor.chauffeurs).length - Object.keys(na.bussen).length - Object.keys(na.chauffeurs).length
      : 0
    if (!voor || n <= 0) return
    if (!window.confirm(tr('bd.plan.leegVraag', { n }))) return
    if (await doe(actie)) {
      setOngedaan(voor)
      setBericht(undefined)
    }
  }
  useEffect(() => {
    if (!ongedaan) return
    const t = window.setTimeout(() => setOngedaan(undefined), 10_000)
    return () => window.clearTimeout(t)
  }, [ongedaan])

  const deelIn = (wat: Sleepbaar, doel: Doel): void => {
    setKeuze(undefined)
    if (wat.soort === 'chauffeur' && doel.soort === 'dienst') void doe({ soort: 'chauffeur', dienst: doel.dienst, id: wat.id })
    else if (wat.soort === 'bus' && doel.soort === 'bus') void doe({ soort: 'bus', omloop: doel.omloop, nummer: wat.nummer })
    else if (wat.soort === 'bus' && doel.soort === 'lijn')
      void doe({ soort: 'busOpLijn', mapFolder: doel.mapFolder, lineFile: doel.lineFile, nummer: wat.nummer, dag }, meldKlaar)
    else if (wat.soort === 'dienst' && doel.soort === 'mens') void doe({ soort: 'chauffeur', dienst: wat.dienst, id: doel.id })
  }

  /* ---- slepen met pointer-events: 6 px drempel, op aanraking 350 ms lang drukken ---- */
  type Sleep = { wat: Sleepbaar; x0: number; y0: number; actief: boolean; aanraking: boolean; klok?: number }
  const sleep = useRef<Sleep | undefined>(undefined)
  const [spook, setSpook] = useState<{ x: number; y: number; tekst: string }>()
  const negeerKlik = useRef(false)
  useEffect(() => {
    const beweeg = (e: PointerEvent): void => {
      const s = sleep.current
      if (!s) return
      const ver = Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 6
      if (!s.actief) {
        if (!ver) return
        if (s.aanraking) {
          // Bewogen voor het lang drukken klaar was: geen slepen.
          window.clearTimeout(s.klok)
          sleep.current = undefined
          return
        }
        s.actief = true
      }
      setSpook({ x: e.clientX, y: e.clientY, tekst: s.wat.tekst })
    }
    const los = (e: PointerEvent): void => {
      const s = sleep.current
      sleep.current = undefined
      if (!s) return
      window.clearTimeout(s.klok)
      setSpook(undefined)
      if (!s.actief) return
      negeerKlik.current = true
      window.setTimeout(() => (negeerKlik.current = false), 60)
      const doel = doelVan(document.elementFromPoint(e.clientX, e.clientY))
      if (doel) deelIn(s.wat, doel)
    }
    const stop = (): void => {
      if (sleep.current) window.clearTimeout(sleep.current.klok)
      sleep.current = undefined
      setSpook(undefined)
    }
    window.addEventListener('pointermove', beweeg)
    window.addEventListener('pointerup', los)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', beweeg)
      window.removeEventListener('pointerup', los)
      window.removeEventListener('pointercancel', stop)
    }
  })
  const pak = (wat: Sleepbaar) => (e: ReactPointerEvent): void => {
    if (e.button !== 0 || bezig) return
    const aanraking = e.pointerType === 'touch'
    const s: Sleep = { wat, x0: e.clientX, y0: e.clientY, actief: false, aanraking }
    if (aanraking) {
      s.klok = window.setTimeout(() => {
        if (sleep.current !== s) return
        s.actief = true
        setSpook({ x: s.x0, y: s.y0, tekst: wat.tekst })
      }, 350)
    }
    sleep.current = s
  }
  const tik = (wat: Sleepbaar) => (): void => {
    if (negeerKlik.current) return
    setPop(undefined)
    setKeuze((k) => (k && JSON.stringify(k) === JSON.stringify(wat) ? undefined : wat))
  }
  const opDienst = (pd: PlanDienst) => (e: ReactMouseEvent): void => {
    if (negeerKlik.current) return
    e.stopPropagation()
    if (keuze?.soort === 'chauffeur') deelIn(keuze, { soort: 'dienst', dienst: pd.dienst.sleutel })
    else setPop({ dienst: pd.dienst.sleutel, x: e.clientX, y: e.clientY })
  }
  const opBusvak = (po: PlanOmloop) => (e: ReactMouseEvent): void => {
    if (negeerKlik.current) return
    e.stopPropagation()
    if (keuze?.soort === 'bus') deelIn(keuze, { soort: 'bus', omloop: po.omloop.sleutel })
    else setPop({ omloop: po.omloop.sleutel, x: e.clientX, y: e.clientY })
  }

  /* ---- teksten ---- */
  const naamVan = (id?: number): string => (id !== undefined ? mensen.get(id)?.naam ?? `#${id}` : '')
  const vormTekst = (v?: Busvorm): string => (v ? loose(taal, `bd.vorm.${v}`, v) : '')
  const wieTekst = (s: Stand): string => {
    const w = s.wie
    if (w.soort === 'eigen') return tr('bd.plan.wie.eigen')
    if (w.soort === 'collega') return `${tr('bd.plan.wie.collega')} · ${korteNaam(naamVan(w.id))}`
    if (w.soort === 'uitzend') return s.bron === 'centrale' ? `${tr('bd.plan.uitzend')} · ${tr('bd.plan.centrale')}` : tr('bd.plan.uitzend')
    if (w.soort === 'liggen') return tr('bd.plan.valtUit')
    return tr('bd.plan.uitbesteed')
  }
  const conflictTekst = (c: Conflict): string => {
    const z = c.dienst && dagPlan ? zoekPlanDienst(dagPlan, c.dienst) : undefined
    const po = c.omloop && dagPlan ? zoekPlanOmloop(dagPlan, c.omloop) : z?.po
    const bus = c.bus !== undefined ? bussen.get(c.bus) : undefined
    let van = ''
    let naar_ = ''
    if (c.soort === 'chauffeur-overstap' && z && c.andere && dagPlan) {
      const ander = zoekPlanDienst(dagPlan, c.andere)
      if (ander) {
        const eerst = ander.pd.dienst.van < z.pd.dienst.van ? ander.pd.dienst : z.pd.dienst
        const dan = eerst === z.pd.dienst ? ander.pd.dienst : z.pd.dienst
        van = eerst.ritten[eerst.ritten.length - 1]?.naar ?? ''
        naar_ = dan.ritten[0]?.van ?? ''
      }
    }
    return loose(taal, `bd.plan.c.${c.soort}`, c.soort, {
      naam: naamVan(c.medewerker),
      bus: c.bus ?? '',
      andere: c.andere ? (c.soort.startsWith('bus') ? nummerVan(c.andere) : dienstNaam(c.andere)) : '',
      vorm: vormTekst(po?.omloop.vorm),
      busvorm: vormTekst(bus?.vorm),
      min: Math.round(c.minuten ?? 0),
      uren: eenDecimaal((c.minuten ?? 0) / 60, taal),
      n: PLAN.ervaringGeleed,
      van,
      naar: naar_
    })
  }

  /* ---- lege staten ---- */
  if (b.concessies.length === 0) {
    return (
      <div className="pl-planning">
        <section className="bd-paneel pl-leeg">
          <p>{tr('bd.plan.geenConcessie')}</p>
          <button type="button" className="bd-knop hoofd" onClick={() => naar('concessies')}>
            {tr('bd.plan.naarConcessies')}
          </button>
        </section>
      </div>
    )
  }
  if (!dagPlan) {
    return (
      <div className="pl-planning">
        <p className="bd-rustig">{tr('bd.loading')}</p>
      </div>
    )
  }

  /* ---- wat er op het scherm staat ---- */
  const kaartDag = dagPlan.kaarten[0]?.kaart
  const soort = kaartDag ? tr(`bd.plan.soort.${kaartDag.soort}` as TextKey) : ''
  const titel = tr('bd.plan.titel', {
    dag,
    datum: `${datumTekst(dagPlan.datum, taal)}${soort ? ` (${soort})` : ''}`
  })
  const zichtbaar = dagPlan.kaarten.filter((k) => !kaartFilter || k.kaart.mapFolder === kaartFilter)
  const heeftConflict = (po: PlanOmloop): boolean => po.conflicten.length > 0 || po.diensten.some((pd) => pd.conflicten.length > 0)
  const groepen = zichtbaar.flatMap(({ kaart, omlopen }) => {
    const perLijn = new Map<string, PlanOmloop[]>()
    for (const po of omlopen) {
      if (alleenConflict && !heeftConflict(po)) continue
      const sl = po.omloop.lineFile.toLowerCase()
      perLijn.set(sl, [...(perLijn.get(sl) ?? []), po])
    }
    return [...perLijn.values()].map((rijen) => {
      const c = b.concessies.find((x) => x.mapFolder === kaart.mapFolder && x.lineFile.toLowerCase() === rijen[0].omloop.lineFile.toLowerCase())
      return { kaart, lineFile: c?.lineFile ?? rijen[0].omloop.lineFile, naam: c ? lijnnaam(c) : rijen[0].omloop.lijn, rijen }
    })
  })
  const alleOmlopen = dagPlan.kaarten.flatMap((k) => k.omlopen)
  const begin = alleOmlopen.length ? Math.floor(Math.min(...alleOmlopen.map((po) => po.omloop.van)) / 60) * 60 : 300
  const einde = alleOmlopen.length ? Math.ceil(Math.max(...alleOmlopen.map((po) => po.omloop.tot)) / 60) * 60 : 1440
  const breedte = ((einde - begin) / 60) * zoom
  const x = (min: number): number => ((min - begin) / 60) * zoom
  const uren: number[] = []
  for (let u = begin; u <= einde; u += 60) uren.push(u)

  const conflictAantal = dagPlan.conflicten.length
  const t = dagPlan.telling
  const resultaat = dagCijfers ? dagCijfers.vergoeding - dagCijfers.kosten + dagCijfers.legacyZelf : 0
  const chauffeurs = (b.personeel ?? []).filter((m) => m.rol === 'chauffeur')
  const monteurs = aanHetWerk(b, 'monteur').length
  const planner = opleidingKlaar(b, 'planner')

  // Lijnen die vandaag niet rijden, en kaarten die ontbreken.
  const rijdtNiet = b.concessies.filter((c) => {
    const k = dagPlan.kaarten.find((x) => x.kaart.mapFolder === c.mapFolder)
    return k && !k.omlopen.some((po) => po.omloop.lineFile.toLowerCase() === c.lineFile.toLowerCase())
  })
  const kaartenWeg = [...new Set(dagPlan.terugval.map((x) => x.mapFolder))].map(
    (m) => b.concessies.find((c) => c.mapFolder === m)?.mapName ?? m
  )

  // Maskers van deze dag zonder rooster, terwijl een ander masker van dezelfde lijn er wel een heeft.
  const overnemen: Array<{ mapFolder: string; lineFile: string; van: number; naar: number; naamVan: string; naamNaar: string }> = []
  const maskersVandaag: Array<{ mapFolder: string; lineFile: string; days: number; naam: string }> = []
  for (const { kaart, omlopen } of dagPlan.kaarten) {
    const gezien = new Set<string>()
    for (const po of omlopen) {
      const sl = `${kaart.mapFolder}|${po.omloop.lineFile.toLowerCase()}|${po.omloop.days}`
      if (gezien.has(sl)) continue
      gezien.add(sl)
      const lijn = lijnen.get(`${kaart.mapFolder}|${po.omloop.lineFile.toLowerCase()}`)
      maskersVandaag.push({ mapFolder: kaart.mapFolder, lineFile: lijn?.lineFile ?? po.omloop.lineFile, days: po.omloop.days, naam: maskerTekst(po.omloop.days, tr) })
      if (!lijn || ingedeeld(kaart.mapFolder, lijn.lineFile, po.omloop.days) > 0) continue
      const bron = [...lijn.maskers.keys()]
        .filter((m) => m !== po.omloop.days)
        .map((m) => ({ m, n: ingedeeld(kaart.mapFolder, lijn.lineFile, m) }))
        .filter((x) => x.n > 0)
        .sort((a, c) => c.n - a.n)[0]
      if (bron) {
        overnemen.push({
          mapFolder: kaart.mapFolder,
          lineFile: lijn.lineFile,
          van: bron.m,
          naar: po.omloop.days,
          naamVan: maskerTekst(bron.m, tr),
          naamNaar: maskerTekst(po.omloop.days, tr)
        })
      }
    }
  }

  /* ---- de stukken ---- */
  const chip = (m: Medewerker): Sleepbaar => ({ soort: 'chauffeur', id: m.id, tekst: korteNaam(m.naam) })
  const busChip = (bus: EigenBus): Sleepbaar => ({ soort: 'bus', nummer: bus.nummer, tekst: String(bus.nummer) })
  const gekozen = (w: Sleepbaar): boolean => Boolean(keuze && JSON.stringify(keuze) === JSON.stringify(w))

  const blok = (pd: PlanDienst, top = 0): JSX.Element => {
    const d = pd.dienst
    const wie = pd.stand.wie
    const naam = wie.soort === 'eigen' || wie.soort === 'collega' ? korteNaam(naamVan(wie.id)) : ''
    const klasse = soortVan(pd.stand, pd.jij)
    const past = keuze?.soort === 'chauffeur' ? pastChauffeur(dagPlan, keuze.id, d.sleutel) : undefined
    const fout = pd.conflicten.some((c) => c.ernst === 'fout')
    const let_ = !fout && pd.conflicten.length > 0
    const tekst = `${klok(d.van)}–${klok(d.tot)}`
    const label =
      pd.jij?.nu ? tr('bd.plan.rijdtNu')
        : pd.jij ? tr('bd.plan.jij')
          : wie.soort === 'liggen' ? tr('bd.plan.valtUit')
            : wie.soort === 'uitzend' ? tr('bd.plan.uitzend')
              : naam
    return (
      <button
        key={d.sleutel}
        type="button"
        data-drop="dienst"
        data-dienst={d.sleutel}
        data-sleutel={d.sleutel}
        className={`pl-blok ${klasse} ${past ? (past.schoon ? 'past' : past.past ? 'past krap' : 'past-niet') : ''} ${fout ? 'fout' : ''} ${let_ ? 'let' : ''} ${focus?.dienst === d.sleutel ? 'focus' : ''}`}
        style={{ left: x(d.van), width: Math.max(6, x(d.tot) - x(d.van)), top }}
        title={`${tr('bd.plan.dienst', { omloop: nummerVan(d.omloop), deel: d.deel })} · ${tekst} · ${wieTekst(pd.stand)}`}
        onClick={opDienst(pd)}
      >
        {pd.stuk && (
          <i
            className={`pl-stuk ${soortVan(pd.stuk.stand)}`}
            style={{ width: `${Math.min(100, (pd.stuk.minuten / Math.max(1, d.minuten)) * 100)}%` }}
            aria-hidden="true"
          />
        )}
        {klasse !== 'uitbesteed' && (
          <span className="pl-bloktekst">
            <small>{tekst}</small>
            {label && <b>{label}</b>}
          </span>
        )}
      </button>
    )
  }

  const busVak = (po: PlanOmloop): JSX.Element => {
    const w = po.bus.wie
    const vul = keuze?.soort === 'bus' ? pastBus(dagPlan, keuze.nummer, po.omloop.sleutel) : undefined
    return (
      <button
        type="button"
        className={`pl-busvak ${w.soort === 'eigen' ? 'eigen' : w.soort === 'huur' ? 'huur' : w.soort === 'liggen' ? 'open' : ''} ${vul === undefined ? '' : vul ? 'past' : 'past-niet'}`}
        data-drop="bus"
        data-omloop={po.omloop.sleutel}
        onClick={opBusvak(po)}
        title={w.soort === 'eigen' ? undefined : tr('bd.plan.busVakUitleg')}
      >
        {w.soort === 'eigen' ? w.nummer : w.soort === 'huur' ? tr('bd.plan.huur') : w.soort === 'liggen' ? tr('bd.plan.valtUit') : '+ bus'}
      </button>
    )
  }

  const omloopKop = (po: PlanOmloop): JSX.Element => (
    <span className="pl-omloopkop">
      <b>
        {nummerVan(po.omloop.sleutel)}
        {po.omloop.vorm ? ` · ${vormTekst(po.omloop.vorm)}` : ''}
      </b>
      <small>{tr('bd.plan.geldtVoor', { masker: maskerTekst(po.omloop.days, tr) })}</small>
      {po.bus.wie.soort !== 'eigen' && (
        <small className="pl-bespaart">{tr('bd.plan.busBespaart', { geld: geld(besparingBus(po.omloop.rituren, f)) })}</small>
      )}
    </span>
  )

  /* ---- de popover ---- */
  const popover = (): JSX.Element | null => {
    if (!pop) return null
    const z = pop.dienst ? zoekPlanDienst(dagPlan, pop.dienst) : undefined
    const po = z?.po ?? (pop.omloop ? zoekPlanOmloop(dagPlan, pop.omloop) : undefined)
    if (!po) return null
    const pd = z?.pd
    const links = Math.max(8, Math.min(pop.x, window.innerWidth - 360))
    const boven = Math.max(8, Math.min(pop.y + 10, window.innerHeight - 440))
    const busKeuzes = [...bussen.values()]
    return (
      <>
        <div className="pl-achter" onClick={() => setPop(undefined)} />
        <div className="pl-pop bd-paneel" role="dialog" aria-modal="false" style={{ left: links, top: boven }}>
          {pd ? (
            <>
              <h3>{tr('bd.plan.dienst', { omloop: nummerVan(po.omloop.sleutel), deel: pd.dienst.deel })}</h3>
              <p>
                {tr('bd.plan.dienstRegel', {
                  lijn: po.omloop.lijn,
                  van: klok(pd.dienst.van),
                  tot: klok(pd.dienst.tot),
                  werk: eenDecimaal(pd.dienst.minuten / 60, taal),
                  betaald: eenDecimaal(pd.dienst.rituren, taal),
                  ritten: pd.dienst.ritten.filter((r) => r.telt).length
                })}
              </p>
              <p>{tr('bd.plan.dienstKosten', { geld: geld(dienstKosten(pd)), wie: wieTekst(pd.stand) })}</p>
              {pd.stuk && (
                <p className="let">
                  {tr('bd.plan.stuk', { van: klok(pd.stuk.van), tot: klok(pd.stuk.tot), wie: wieTekst(pd.stuk.stand) })}
                </p>
              )}
              <p className="bd-rustig">
                {tr('bd.plan.vanNaar', { van: pd.dienst.ritten[0]?.van ?? '', naar: pd.dienst.ritten[pd.dienst.ritten.length - 1]?.naar ?? '' })}
              </p>
              {pd.jij?.nu && <p className="pl-jijregel">{tr('bd.plan.rijdtNu')}</p>}
              <label className="pl-veld">
                <span>{tr('bd.plan.chauffeur')}</span>
                <select
                  value={pd.roosterId ?? ''}
                  disabled={bezig}
                  onChange={(e) =>
                    void doe({ soort: 'chauffeur', dienst: pd.dienst.sleutel, id: e.target.value === '' ? null : Number(e.target.value) })
                  }
                >
                  <option value="">— {tr('bd.plan.uitbesteed')} —</option>
                  {chauffeurs.map((m) => {
                    const p = pastChauffeur(dagPlan, m.id, pd.dienst.sleutel)
                    return (
                      <option key={m.id} value={m.id}>
                        {m.naam}
                        {m.id === pd.roosterId ? '' : p.past ? '' : ' ⚠'}
                      </option>
                    )
                  })}
                </select>
              </label>
            </>
          ) : (
            <>
              <h3>{tr('bd.plan.omloop', { nr: nummerVan(po.omloop.sleutel) })}</h3>
              <p>
                {vormTekst(po.omloop.vorm)}
                {po.omloop.vorm ? ' · ' : ''}
                {tr('bd.plan.geldtVoor', { masker: maskerTekst(po.omloop.days, tr) })}
              </p>
              {po.bus.wie.soort !== 'eigen' && <p className="bd-rustig">{tr('bd.plan.busVakUitleg')}</p>}
            </>
          )}
          <label className="pl-veld">
            <span>{tr('bd.plan.busOmloop')}</span>
            <select
              value={po.roosterBus ?? ''}
              disabled={bezig}
              onChange={(e) =>
                void doe({ soort: 'bus', omloop: po.omloop.sleutel, nummer: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">— {tr('bd.plan.uitbesteed')} —</option>
              {busKeuzes.map((bus) => (
                <option key={bus.nummer} value={bus.nummer}>
                  {bus.nummer} · {bus.naam} · {vormTekst(bus.vorm)}
                  {bus.nummer === po.roosterBus || pastBus(dagPlan, bus.nummer, po.omloop.sleutel) ? '' : ' ⚠'}
                </option>
              ))}
            </select>
          </label>
          {(pd?.conflicten ?? po.conflicten).length > 0 && (
            <ul className="pl-conflicten">
              {[...(pd ? pd.conflicten : []), ...po.conflicten].map((c, i) => (
                <li key={i} className={c.ernst === 'fout' ? 'laat' : 'let'}>
                  {conflictTekst(c)}
                </li>
              ))}
            </ul>
          )}
          {!vandaag && <p className="bd-rustig bd-klein">{tr('bd.plan.toekomst')}</p>}
          <div className="pl-popknoppen">
            {/* SLOT deel D: [Zelf rijden] via useZelfRijden().open(dienst); komt bij de integratie. */}
            {pd && pd.roosterId !== undefined && (
              <button
                type="button"
                className="bd-knop zacht"
                disabled={bezig}
                onClick={() => void doe({ soort: 'chauffeur', dienst: pd.dienst.sleutel, id: null }).then(() => setPop(undefined))}
              >
                {tr('bd.plan.uitRooster')}
              </button>
            )}
            {pd && pd.stand.wie.soort === 'onderaannemer' && (
              <button type="button" className="bd-link" onClick={() => naar('personeel')}>
                {tr('bd.applicants', { day: b.dag })} →
              </button>
            )}
            {!pd && po.bus.wie.soort !== 'eigen' && (
              <button
                type="button"
                className="bd-link"
                onClick={() => naar('markt', po.omloop.vorm ? { vorm: po.omloop.vorm } : undefined)}
              >
                {tr('bd.plan.busKopen')} →
              </button>
            )}
            <button type="button" className="bd-knop" onClick={() => setPop(undefined)}>
              {tr('bd.plan.sluit')}
            </button>
          </div>
        </div>
      </>
    )
  }

  /* ---- de zijbalk: wie en wat er vrij is ---- */
  const zijbalk = (
    <aside className="pl-vrij bd-paneel">
      <h2>{tr('bd.plan.vrij')}</h2>
      <p className="bd-rustig bd-klein">{tr('bd.plan.vrijUitleg')}</p>
      <h3>{tr('bd.plan.chauffeurs')}</h3>
      {chauffeurs.length === 0 ? (
        <p className="bd-rustig bd-klein">{tr('bd.plan.geenPersoneel')}</p>
      ) : (
        <ul>
          {chauffeurs.map((m) => {
            const w = dagPlan.werk[m.id]
            const ziek = m.ziekTot !== undefined && m.ziekTot >= dag
            const cursus = m.cursusTot !== undefined && m.cursusTot >= dag
            const bespaart = w ? besparingChauffeur(w.minuten, f) : 0
            const c = chip(m)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`pl-chip mens ${gekozen(c) ? 'gekozen' : ''}`}
                  disabled={ziek || cursus}
                  onPointerDown={pak(c)}
                  onClick={tik(c)}
                >
                  {c.tekst}
                </button>
                <small
                  className={ziek || cursus ? 'let' : w ? (bespaart >= m.loon ? 'optijd' : 'laat') : 'bd-rustig'}
                >
                  {ziek
                    ? tr('bd.plan.ziekTot', { dag: m.ziekTot! })
                    : cursus
                      ? tr('bd.plan.cursus')
                      : w
                        ? tr('bd.plan.chauffeurWerk', { uren: eenDecimaal(w.minuten / 60, taal), bespaart: geld(bespaart), loon: geld(m.loon) })
                        : tr('bd.plan.chauffeurVrij', { loon: geld(m.loon) })}
                </small>
              </li>
            )
          })}
        </ul>
      )}
      <h3>{tr('bd.plan.bussen')}</h3>
      {bussen.size === 0 ? (
        <p className="bd-rustig bd-klein">
          {tr('bd.plan.geenBussen')}{' '}
          <button type="button" className="bd-link" onClick={() => naar('markt')}>
            {tr('bd.plan.busKopen')} →
          </button>
        </p>
      ) : (
        <ul>
          {[...bussen.values()].map((bus) => {
            const inzet = isInzetbaar(bus, dag)
            const c = busChip(bus)
            return (
              <li key={bus.nummer}>
                <button
                  type="button"
                  className={`pl-chip bus ${gekozen(c) ? 'gekozen' : ''}`}
                  onPointerDown={pak(c)}
                  onClick={tik(c)}
                >
                  {bus.nummer}
                </button>
                <small className={inzet ? (dagPlan.vrij.bussen.includes(bus.nummer) ? 'bd-rustig' : '') : 'let'}>
                  {inzet
                    ? tr('bd.plan.busStaat', {
                        staat: Math.round(bus.staat),
                        kans: eenDecimaal(pechkans(bus, monteurs) * 100, taal)
                      })
                    : tr('bd.plan.werkplaats')}
                </small>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )

  /* ---- het rooster per omloop ---- */
  const tijdas = (
    <div className="pl-as-kop" style={{ width: breedte }}>
      {uren.map((u) => (
        <span key={u} style={{ left: x(u) }}>
          {klok(u)}
        </span>
      ))}
    </div>
  )
  const perOmloop = (
    <div className="pl-rooster" style={{ ['--pl-zoom' as string]: `${zoom}px` }}>
      <div className="pl-rij pl-kop">
        <div className="pl-links" />
        {tijdas}
      </div>
      {groepen.map((g) => (
        <div key={`${g.kaart.mapFolder}|${g.lineFile}`} className="pl-groep">
          <div className="pl-rij pl-lijnkop" data-drop="lijn" data-map={g.kaart.mapFolder} data-lijn={g.lineFile}>
            <div className="pl-links">
              <span className="bd-lijn">{g.naam}</span>
              <small>{dagPlan.kaarten.length > 1 ? g.kaart.mapName : tr('bd.plan.lijnDrop')}</small>
            </div>
            <div className="pl-as" style={{ width: breedte }} />
          </div>
          {g.rijen.map((po) => (
            <div key={po.omloop.sleutel} className="pl-rij" data-sleutel={po.omloop.sleutel}>
              <div className="pl-links">
                {omloopKop(po)}
                {busVak(po)}
              </div>
              <div className="pl-as" style={{ width: breedte }} onClick={() => setKeuze(undefined)}>
                {uren.map((u) => (
                  <i key={u} className="pl-uurlijn" style={{ left: x(u) }} />
                ))}
                {po.diensten.map((pd) => blok(pd))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  /* ---- mensen en bussen ---- */
  const uitbesteed = alleOmlopen.flatMap((po) => po.diensten).filter((pd) => pd.stand.wie.soort === 'onderaannemer')
  const banen: PlanDienst[][] = []
  for (const pd of [...uitbesteed].sort((a, c) => a.dienst.van - c.dienst.van)) {
    const baan = banen.find((l) => l[l.length - 1].dienst.tot + 5 <= pd.dienst.van)
    if (baan) baan.push(pd)
    else banen.push([pd])
  }
  const mensenRooster = (
    <div className="pl-rooster" style={{ ['--pl-zoom' as string]: `${zoom}px` }}>
      <div className="pl-rij pl-kop">
        <div className="pl-links" />
        {tijdas}
      </div>
      {chauffeurs.map((m) => {
        const eigen = alleOmlopen.flatMap((po) => po.diensten).filter((pd) => {
          const w = pd.stand.wie
          const s = pd.stuk?.stand.wie
          return ((w.soort === 'eigen' || w.soort === 'collega') && w.id === m.id) || ((s?.soort === 'eigen' || s?.soort === 'collega') && s.id === m.id)
        })
        const c = chip(m)
        return (
          <div key={m.id} className="pl-rij" data-drop="mens" data-id={m.id}>
            <div className="pl-links">
              <button type="button" className={`pl-chip mens ${gekozen(c) ? 'gekozen' : ''}`} onPointerDown={pak(c)} onClick={tik(c)}>
                {c.tekst}
              </button>
              <small>{eenDecimaal((dagPlan.werk[m.id]?.minuten ?? 0) / 60, taal)} u</small>
            </div>
            <div className="pl-as" style={{ width: breedte }}>
              {uren.map((u) => (
                <i key={u} className="pl-uurlijn" style={{ left: x(u) }} />
              ))}
              {eigen.map((pd) => blok(pd))}
            </div>
          </div>
        )
      })}
      {[...bussen.values()].map((bus) => {
        const rijdt = alleOmlopen.filter((po) => po.bus.wie.soort === 'eigen' && po.bus.wie.nummer === bus.nummer)
        return (
          <div key={`bus${bus.nummer}`} className="pl-rij">
            <div className="pl-links">
              <span className="pl-chip bus">{bus.nummer}</span>
              <small>{vormTekst(bus.vorm)}</small>
            </div>
            <div className="pl-as" style={{ width: breedte }}>
              {rijdt.map((po) => (
                <span
                  key={po.omloop.sleutel}
                  className="pl-blok eigen pl-busblok"
                  style={{ left: x(po.omloop.van), width: Math.max(6, x(po.omloop.tot) - x(po.omloop.van)) }}
                >
                  <span className="pl-bloktekst">
                    <small>{`${klok(po.omloop.van)}–${klok(po.omloop.tot)}`}</small>
                    <b>{tr('bd.plan.omloop', { nr: nummerVan(po.omloop.sleutel) })}</b>
                  </span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
      <div className="pl-rij pl-lijnkop">
        <div className="pl-links">
          <button type="button" className="bd-link" onClick={() => setUitbesteedOpen((o) => !o)}>
            {uitbesteedOpen ? '▾' : '▸'} {tr('bd.plan.uitbesteedRij', { n: uitbesteed.length })}
          </button>
        </div>
        <div className="pl-as" style={{ width: breedte }} />
      </div>
      {uitbesteedOpen &&
        banen.map((baan, i) => (
          <div key={`baan${i}`} className="pl-rij">
            <div className="pl-links" />
            <div className="pl-as" style={{ width: breedte }}>
              {baan.map((pd) => {
                const w: Sleepbaar = { soort: 'dienst', dienst: pd.dienst.sleutel, tekst: dienstNaam(pd.dienst.sleutel) }
                return (
                  <button
                    key={pd.dienst.sleutel}
                    type="button"
                    className="pl-blok uitbesteed sleepbaar"
                    style={{ left: x(pd.dienst.van), width: Math.max(6, x(pd.dienst.tot) - x(pd.dienst.van)) }}
                    onPointerDown={pak(w)}
                    onClick={opDienst(pd)}
                    title={`${dienstNaam(pd.dienst.sleutel)} · ${klok(pd.dienst.van)}–${klok(pd.dienst.tot)}`}
                  >
                    <span className="pl-bloktekst">
                      <small>{dienstNaam(pd.dienst.sleutel)}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )

  /* ---- smal: een lijst per omloop met keuzelijsten ---- */
  const lijst = (
    <div className="pl-lijst">
      {groepen.map((g) => (
        <section key={`${g.kaart.mapFolder}|${g.lineFile}`} className="bd-paneel">
          <h3>
            <span className="bd-lijn">{g.naam}</span> {dagPlan.kaarten.length > 1 ? g.kaart.mapName : ''}
          </h3>
          {g.rijen.map((po) => (
            <div key={po.omloop.sleutel} className="pl-lijstomloop" data-sleutel={po.omloop.sleutel}>
              <div className="pl-lijstkop">
                {omloopKop(po)}
                <select
                  aria-label={tr('bd.plan.busOmloop')}
                  value={po.roosterBus ?? ''}
                  disabled={bezig}
                  onChange={(e) => void doe({ soort: 'bus', omloop: po.omloop.sleutel, nummer: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <option value="">+ bus</option>
                  {[...bussen.values()].map((bus) => (
                    <option key={bus.nummer} value={bus.nummer}>
                      {bus.nummer} · {vormTekst(bus.vorm)}
                    </option>
                  ))}
                </select>
              </div>
              {po.diensten.map((pd) => (
                <div key={pd.dienst.sleutel} className={`pl-lijstdienst ${soortVan(pd.stand, pd.jij)}`} data-sleutel={pd.dienst.sleutel}>
                  <button type="button" className="bd-link" onClick={opDienst(pd)}>
                    {klok(pd.dienst.van)}–{klok(pd.dienst.tot)}
                  </button>
                  <select
                    aria-label={tr('bd.plan.chauffeur')}
                    value={pd.roosterId ?? ''}
                    disabled={bezig}
                    onChange={(e) =>
                      void doe({ soort: 'chauffeur', dienst: pd.dienst.sleutel, id: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  >
                    <option value="">{tr('bd.plan.uitbesteed')}</option>
                    {chauffeurs.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.naam}
                      </option>
                    ))}
                  </select>
                  <small>{wieTekst(pd.stand)} · {geld(dienstKosten(pd))}</small>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )

  return (
    <div className="pl-planning" onClick={() => setMenu(undefined)}>
      {/* SLOT deel B: <UitvalMeldingen bedrijf plan naar /> bovenaan (ontwerp §5.2). */}
      <header className="pl-kopregel">
        <h2>{titel}</h2>
        {dagPlan.kaarten.length > 1 && (
          <div className="pl-kaartchips">
            <button type="button" className={`pl-kaartchip ${kaartFilter ? '' : 'aan'}`} onClick={() => setKaartFilter('')}>
              ✱
            </button>
            {dagPlan.kaarten.map((k) => (
              <button
                key={k.kaart.mapFolder}
                type="button"
                className={`pl-kaartchip ${kaartFilter === k.kaart.mapFolder ? 'aan' : ''}`}
                onClick={() => setKaartFilter(k.kaart.mapFolder)}
              >
                {k.kaart.mapName}
              </button>
            ))}
          </div>
        )}
        {dagCijfers && (
          <p className={`pl-geld ${resultaat < 0 ? 'laat' : resultaat > 0 ? 'optijd' : ''}`}>
            {vandaag
              ? tr('bd.plan.geld', {
                  vergoeding: geld(dagCijfers.vergoeding),
                  kosten: geld(dagCijfers.kosten),
                  resultaat: geld(resultaat, true)
                })
              : tr('bd.plan.geldToekomst', { datum: datumTekst(dagPlan.datum, taal, true), resultaat: geld(resultaat, true) })}
          </p>
        )}
      </header>

      {!uitlegWeg && (
        <section className="bd-paneel pl-uitleg">
          <p>
            <b>{tr('bd.plan.nieuw')}</b>
          </p>
          <p className="bd-rustig">{tr('bd.plan.uitleg')}</p>
          <button
            type="button"
            className="bd-knop"
            onClick={() => {
              setUitlegWeg(true)
              bewaar(UITLEG_SLEUTEL, '1')
            }}
          >
            {tr('bd.plan.begrepen')}
          </button>
        </section>
      )}

      {/* De week: zeven dagen vanaf vandaag. */}
      <nav className="pl-week" aria-label={tr('bd.plan.week')}>
        {strook.map(({ d, p, c, r }) => {
          const k = r?.kaarten[0]
          const res = c ? c.vergoeding - c.kosten + c.legacyZelf : undefined
          const leeg = p && p.telling.diensten > 0 && p.telling.eigen === 0 && p.telling.eigenBus === 0 && (chauffeurs.length > 0 || bussen.size > 0)
          return (
            <button
              key={d}
              type="button"
              className={`pl-weekdag ${d === dag ? 'aan' : ''} ${leeg ? 'leeg' : ''}`}
              aria-current={d === dag ? 'date' : undefined}
              onClick={() => {
                setDag(d)
                setPop(undefined)
              }}
            >
              <b>
                {tr('bd.plan.weekDag', {
                  dag: k ? tr(`bd.dag.${WEEKDAG[k.weekdag]}` as TextKey) : '',
                  nr: d,
                  eigen: p ? p.telling.eigen + p.telling.collega : 0,
                  diensten: p?.telling.diensten ?? 0
                })}
              </b>
              {res !== undefined && <small className={res < 0 ? 'laat' : res > 0 ? 'optijd' : ''}>{geld(res, true)}</small>}
            </button>
          )
        })}
      </nav>

      {!vandaag && (
        <p className="pl-toekomst">
          {tr('bd.plan.toekomst')}{' '}
          <button type="button" className="bd-link" onClick={() => setDag(b.dag)}>
            {tr('bd.plan.terugVandaag')}
          </button>
        </p>
      )}

      {kaartenWeg.map((k) => (
        <p key={k} className="bd-melding">
          {tr('bd.plan.kaartWeg', { kaart: k })}
        </p>
      ))}
      {rijdtNiet.map((c) => (
        <p key={`${c.mapFolder}|${c.lineFile}`} className="pl-notitie">
          {tr('bd.plan.rijdtNiet', { lijn: lijnnaam(c), soort })}
        </p>
      ))}
      {overnemen.map((o) => (
        <p key={`${o.mapFolder}|${o.lineFile}|${o.naar}`} className="pl-notitie let">
          {tr('bd.plan.leegMaskerMelding', {
            masker: o.naamNaar,
            bussen: dagPlan.vrij.bussen.length,
            mensen: dagPlan.vrij.chauffeurs.length
          })}{' '}
          <button type="button" className="bd-knop" disabled={bezig} onClick={() => void kopieer(o.mapFolder, o.lineFile, o.van, o.naar)}>
            {tr('bd.plan.kopieer', { masker: o.naamVan })}
          </button>
        </p>
      ))}

      {/* De werkbalk. */}
      <div className="pl-werkbalk" onClick={(e) => e.stopPropagation()}>
        <div className="pl-menu">
          <button type="button" className="bd-knop hoofd" disabled={bezig} onClick={() => setMenu(menu === 'vulAan' ? undefined : 'vulAan')} aria-expanded={menu === 'vulAan'}>
            {tr('bd.plan.vulAan')} ▾
          </button>
          {menu === 'vulAan' && (
            <div className="pl-menulijst bd-paneel" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(undefined); void doe({ soort: 'vulAan', dag, bereik: 'dag' }, meldKlaar) }}>
                {tr('bd.plan.vulAanDag')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenu(undefined); void doe({ soort: 'vulAan', dag, bereik: 'week' }, meldKlaar) }}>
                {tr('bd.plan.vulAanWeek')}
              </button>
            </div>
          )}
        </div>
        <div className="pl-menu">
          <button type="button" className="bd-knop" disabled={bezig} onClick={() => setMenu(menu === 'leeg' ? undefined : 'leeg')} aria-expanded={menu === 'leeg'}>
            {tr('bd.plan.leegmaken')} ▾
          </button>
          {menu === 'leeg' && (
            <div className="pl-menulijst bd-paneel" role="menu">
              {maskersVandaag.map((m) => (
                <button
                  key={`${m.mapFolder}|${m.lineFile}|${m.days}`}
                  type="button"
                  role="menuitem"
                  onClick={() => void wis({ soort: 'wis', wat: 'masker', mapFolder: m.mapFolder, lineFile: m.lineFile, days: m.days })}
                >
                  {tr('bd.plan.leegMasker', { masker: maskersVandaag.length > 1 ? `${lijnnaam(b.concessies.find((c) => c.mapFolder === m.mapFolder && c.lineFile === m.lineFile) ?? { lineNumbers: [], lineFile: m.lineFile })} · ${m.naam}` : m.naam })}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={() => void wis({ soort: 'wis', wat: 'alles' })}>
                {tr('bd.plan.leegAlles')}
              </button>
            </div>
          )}
        </div>
        <label className={`pl-schakel ${planner ? '' : 'uit'}`}>
          <input
            type="checkbox"
            checked={Boolean(b.rooster?.autoAanvullen) && planner}
            disabled={!planner || bezig}
            onChange={(e) => void handel(window.career.bedrijfRooster({ soort: 'auto', aan: e.target.checked }))}
          />
          <span>
            {tr('bd.plan.auto')}
            {!planner && <small>{tr('bd.plan.autoPlanner')}</small>}
          </span>
        </label>
        <div className="pl-schakelaar" role="group">
          <button type="button" className={weergave === 'omlopen' ? 'aan' : ''} onClick={() => setWeergave('omlopen')}>
            {tr('bd.plan.weergave.omlopen')}
          </button>
          <button type="button" className={weergave === 'mensen' ? 'aan' : ''} onClick={() => setWeergave('mensen')}>
            {tr('bd.plan.weergave.mensen')}
          </button>
        </div>
        {!smal && (
          <div className="pl-zoom">
            <button type="button" className="bd-knop" aria-label={tr('bd.plan.zoomUit')} title={tr('bd.plan.zoomUit')} onClick={() => zetZoom(zoom / 1.5)} disabled={zoom <= 32}>
              −
            </button>
            <button type="button" className="bd-knop" aria-label={tr('bd.plan.zoomIn')} title={tr('bd.plan.zoomIn')} onClick={() => zetZoom(zoom * 1.5)} disabled={zoom >= 160}>
              +
            </button>
          </div>
        )}
      </div>

      {(bericht || ongedaan) && (
        <p className={`pl-bericht ${bericht?.soort === 'laat' ? 'laat' : ''}`} role="status">
          {ongedaan ? tr('bd.plan.leegmaken') : bericht?.tekst}
          {ongedaan && (
            <button
              type="button"
              className="bd-knop"
              onClick={() => {
                const r = ongedaan
                setOngedaan(undefined)
                void doe({ soort: 'herstel', rooster: r }, () => setBericht({ tekst: tr('bd.plan.ongedaanKlaar'), soort: 'goed' }))
              }}
            >
              {tr('bd.plan.ongedaan')}
            </button>
          )}
        </p>
      )}

      {/* De tellingen. */}
      <div className="pl-telling">
        <span>
          {tr('bd.plan.telling', {
            n: t.diensten,
            eigen: t.eigen + t.collega,
            jij: t.jij,
            uitzend: t.uitzend,
            uitbesteed: t.uitbesteed,
            open: t.open
          })}
        </span>
        <span>{tr('bd.plan.omlopenTelling', { n: t.omlopen, eigen: t.eigenBus })}</span>
        {conflictAantal > 0 && (
          <button type="button" className={`pl-conflictchip ${alleenConflict ? 'aan' : ''}`} onClick={() => setAlleenConflict((a) => !a)}>
            {alleenConflict ? tr('bd.plan.toonAlles') : tr('bd.plan.conflicten', { n: conflictAantal })}
          </button>
        )}
        {vandaag && (b.zelfUren ?? 0) > 0 && (
          <span className="bd-rustig">{tr('bd.plan.buiten', { uren: eenDecimaal(b.zelfUren ?? 0, taal) })}</span>
        )}
      </div>

      {keuze && (
        <p className="pl-kiesregel" role="status">
          {keuze.soort === 'bus' ? tr('bd.plan.kiesOmloop', { bus: keuze.nummer }) : tr('bd.plan.kiesPlek', { naam: keuze.tekst })}{' '}
          <button type="button" className="bd-link" onClick={() => setKeuze(undefined)}>
            {tr('bd.plan.annuleer')}
          </button>
        </p>
      )}

      <div className="pl-werk">
        <div className="pl-hoofd">
          {alleOmlopen.length === 0 ? null : smal ? lijst : weergave === 'mensen' ? mensenRooster : perOmloop}
          {/* SLOT deel B en C: <UitvalMeldingen …/> en <OpenDiensten bedrijf plan handel lopend /> onder het rooster. */}
        </div>
        {zijbalk}
      </div>

      {popover()}
      {spook && (
        <span className="pl-spook" style={{ left: spook.x, top: spook.y }} aria-hidden="true">
          {spook.tekst}
        </span>
      )}
    </div>
  )
}

