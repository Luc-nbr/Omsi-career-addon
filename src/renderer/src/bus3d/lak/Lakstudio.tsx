import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Bus3dManifest, Bus3dVensterStand, Bus3dVensterVraag } from '../../../../shared/bus3d'
import {
  cp1252Vriendelijk,
  type Laag,
  type LakFamilieInfo,
  type LakOptie,
  type LakPlaatsUitkomst,
  type LakProject,
  type LakStart,
  type NaamFout,
  type Plaats,
  type SnelleLakStand,
  type StrookSjabloon
} from '../../../../shared/lak'
import type { TextKey } from '../../../../shared/i18n'
import { BusViewer, type StudioBediening, type ViewerStand } from '../../BusViewer'
import { useT } from '../../language'
import type { Plat } from '../camera'
import { Verbinding, type ViewerHandvat } from '../verbinding'
import { beeldVanBytes, leesBeeld } from './beeldimport'
import type { DecalAnalyse, LakKeuze, LakKlaarInfo } from './lakdoek'
import {
  AfbeeldingPaneel,
  LaagPaneel,
  LagenLijst,
  OptiesPaneel,
  PenseelPaneel,
  SnelleLakPaneel,
  StartPaneel,
  StrookPaneel,
  TekstPaneel,
  VlakPaneel,
  VulPaneel,
  type PenseelStand
} from './LakPanelen'
import { begin, doe, ongedaan, opnieuw, type Geschiedenis, type Handeling } from './lagen'
import { lettertypeVoor, STANDAARD_LETTERTYPE, tekstBeeld, tekstBreedtePx, windowsLettertypen } from './lettertypen'
import {
  decalHoeken,
  decalMaat,
  decalSleutel,
  effenInKleuren,
  nieuwId,
  pasSnelleLak,
  plaatsBij,
  raamHoogte,
  RECEPT_ID,
  spiegelPlaats,
  strook,
  tekstBreedteM,
  volgBand,
  vulStraal,
  type Busmaat,
  type ReceptNamen,
  type V3
} from './recept'
import './lakstudio.css'

/**
 * DE LAKSTUDIO (lakstudio-ontwerp §1, §2): het 3D-venster in doel 'lakstudio'.
 *
 * Bovenin de bus, de vijf gereedschappen plus [Spiegel], ongedaan maken en
 * [Meer▾]; daaronder de naam en [Opslaan in OMSI] (of [Klaarzetten voor OMSI]
 * als OMSI draait). Links de lagen, in het midden de bus met handvatten op het
 * oppervlak, rechts Snelle lak of het paneel van het gereedschap, en onderin de
 * aanzichten, [Voor/na], het licht en de statusregel (§2.2).
 *
 * Alles wat de speler doet is een handeling op het project (lagen.ts): de
 * werker krijgt de hele lagenstapel, 2 s na de laatste wijziging bewaart main
 * het project, en 500 stappen terug kan altijd. Slepen is voorlopig (geen stap
 * per beweging) en wordt bij het loslaten één stap.
 *
 * Het lakdoek zelf (maskers, zones, samenstellen, export) staat in de werker;
 * hier alleen wat de speler ziet en aanwijst. Alles achter de schakelaar
 * `bus3d`: zonder schakelaar opent main dit venster niet.
 */

interface Props {
  vraag: Bus3dVensterVraag
  stand: Bus3dVensterStand
}

type Gereedschap = 'snel' | 'vullen' | 'strook' | 'tekst' | 'afbeelding' | 'penseel'
type MeerPaneel = 'opties' | 'start' | 'vlak' | undefined

/** Wat de muis nu sleept: een rand van een strook, een decal, zijn hoek, of een penseelstreek. */
type Sleep =
  | { soort: 'strook'; id: string; rand: 'h1' | 'h2'; y0: number; waarde0: number; perMeter: number }
  | { soort: 'decal'; id: string; kopie: boolean; vlakX: number }
  | { soort: 'hoek'; id: string; midden: [number, number]; afstand0: number; laag0: Laag }
  | { soort: 'penseel'; id: string }

interface Uitkomst {
  soort: 'ok' | 'klaargezet' | 'fout' | 'verwijderd'
  tekst: string
  handmatig?: boolean
}

const STAND_VAN: Record<string, Plat | 'schuin'> = { '1': 'links', '2': 'rechts', '3': 'voorvlak', '4': 'achtervlak', '5': 'dak', '6': 'schuin' }

/** Een punt in o3d-assen op het scherm (CSS-pixels van het beeld), met de diepte; de wereld is x gespiegeld. */
function naarScherm(cam: Float32Array, p: V3, b: number, h: number): { x: number; y: number; z: number } | undefined {
  const X = -p[0]
  const Y = p[1]
  const Z = p[2]
  const cx = cam[0] * X + cam[4] * Y + cam[8] * Z + cam[12]
  const cy = cam[1] * X + cam[5] * Y + cam[9] * Z + cam[13]
  const cz = cam[2] * X + cam[6] * Y + cam[10] * Z + cam[14]
  const cw = cam[3] * X + cam[7] * Y + cam[11] * Z + cam[15]
  if (cw <= 1e-6) return undefined
  return { x: ((cx / cw + 1) / 2) * b, y: ((1 - cy / cw) / 2) * h, z: cz / cw }
}

function inVeelhoek(p: [number, number], veelhoek: Array<[number, number]>): boolean {
  let binnen = false
  for (let i = 0, j = veelhoek.length - 1; i < veelhoek.length; j = i++) {
    const [xi, yi] = veelhoek[i]
    const [xj, yj] = veelhoek[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) binnen = !binnen
  }
  return binnen
}

/**
 * Staat de studiolak op de bus? Bij Snelle lak pas vanaf de eerste laag (tot dan
 * staat de bus in de lak van de start, §2.1 0:01); bij de andere starts altijd,
 * want dan is de basis zelf al de keuze (Effen, of de start precies).
 */
const lakTonen = (p: LakProject): boolean => p.lagen.length > 0 || p.start !== 'snel'

/** De standaardwaarden van de busopties bij een start (§4.9): bij alles behalve "precies" wat over de lak ligt verborgen. */
function standaardOpties(opties: LakOptie[], start: LakStart, mogelijk: boolean): Record<string, number> {
  if (start === 'precies' || !mogelijk) return {}
  const uit: Record<string, number> = {}
  for (const o of opties) if (o.soort === 'uiterlijk' && o.overLak && o.verberg !== undefined) uit[o.variabele] = o.verberg
  return uit
}

export function Lakstudio({ vraag, stand }: Props): JSX.Element {
  const t = useT()
  const brug = window.bus3d!
  const pad = vraag.relatiefPad
  const kleurstelling = vraag.kleurstelling

  /* ------------------------------------------------------------------ toestand */
  const [handvat, zetHandvat] = useState<ViewerHandvat>()
  const [manifest, zetManifest] = useState<Bus3dManifest>()
  /** Een ander familielid in beeld: [Bekijk] (§3.1), of om een doel van dat lid te bakken bij het opslaan. */
  const [bekijkPad, zetBekijkPad] = useState<string>()
  const [bakPad, zetBakPad] = useState<string>()
  const viewPad = bakPad ?? bekijkPad ?? pad
  const [scherpVoor, zetScherpVoor] = useState<string>()
  const [familie, zetFamilie] = useState<LakFamilieInfo>()
  const [opties, zetOpties] = useState<LakOptie[]>([])
  const [klaar, zetKlaar] = useState<LakKlaarInfo>()
  const [klaarFout, zetKlaarFout] = useState<string>()
  const [gesch, zetGesch] = useState<Geschiedenis>()
  const geschRef = useRef<Geschiedenis | undefined>(undefined)
  const projectId = useRef('')
  const [naam, zetNaam] = useState('')
  const naamVolgt = useRef(true)
  const [naamFout, zetNaamFout] = useState<string>()
  const [gereedschap, zetGereedschap] = useState<Gereedschap>('snel')
  const [meer, zetMeer] = useState(false)
  const [meerPaneel, zetMeerPaneel] = useState<MeerPaneel>()
  const [gekozen, zetGekozen] = useState<string>()
  const [kleur, zetKleur] = useState('#1d3f8f')
  const [penseel, zetPenseel] = useState<PenseelStand>({ straalCm: 8, hardheid: 0.7, dekking: 1, gum: false })
  const [voorvulling, zetVoorvulling] = useState<[string, string, string]>(['#1d3f8f', '#ffffff', '#ffffff'])
  const [zoneKleuren, zetZoneKleuren] = useState<Array<{ kleur: string; lak: boolean }>>([])
  const [analyse, zetAnalyse] = useState<Record<string, DecalAnalyse>>({})
  const [bezig, zetBezig] = useState<string>()
  const [uitkomst, zetUitkomst] = useState<Uitkomst>()
  const [tip, zetTip] = useState<{ tekst: string; knop?: { tekst: string; doe: () => void } }>()
  const [cam, zetCam] = useState<Float32Array>()
  const [camTweede, zetCamTweede] = useState<Float32Array>()
  const [maat, zetMaat] = useState<{ b: number; h: number }>({ b: 1, h: 1 })
  const [sleep, zetSleep] = useState<Sleep>()
  const [zweefHandvat, zetZweefHandvat] = useState(false)
  const [windows, zetWindows] = useState<string[]>([])
  const [afbFout, zetAfbFout] = useState<string>()
  const [logoUrl, zetLogoUrl] = useState<string>()
  const [optiesMs, zetOptiesMs] = useState<number>()
  const [getoondeOpties, zetGetoondeOpties] = useState<string>()
  const [voorNa, zetVoorNa] = useState(false)
  const [lichtHerstart, zetLichtHerstart] = useState(false)
  const beeldRef = useRef<HTMLDivElement>(null)
  const tekstRef = useRef<HTMLInputElement>(null)
  const tweedeDoek = useRef<HTMLCanvasElement>(null)
  const bewaarKlok = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sleepBegin = useRef<Geschiedenis | undefined>(undefined)
  /** Welke beelden en teksten de werker al heeft (na een nieuwe start of een herstart opnieuw). */
  const verstuurd = useRef(new Set<string>())
  const gestartVoor = useRef('')
  const scherpWachters = useRef<Array<{ pad: string; klaar: () => void }>>([])
  const kiesBezig = useRef(false)
  const kiesVolgende = useRef<[number, number] | undefined>(undefined)
  const t0 = useRef(performance.now())

  const heden = gesch?.heden
  const lagen = heden?.lagen ?? []
  const laag = lagen.find((l) => l.id === gekozen)
  const spiegelAan = heden?.spiegel.aan ?? true
  const vlakX = heden?.spiegel.vlakX ?? (klaar ? (klaar.doos.min[0] + klaar.doos.max[0]) / 2 : 0)
  const busmaat: Busmaat | undefined = klaar ? { min: klaar.doos.min as V3, max: klaar.doos.max as V3, raamlijn: klaar.raamlijn } : undefined
  const eersteDoel = klaar?.doelen[0]

  /* ------------------------------------------------------------------ voor de proef: de stand op de wortel */
  useEffect(() => {
    const d = document.documentElement.dataset
    d.lakstudio = klaarFout ? 'fout' : !klaar ? 'laden' : bezig ? 'bezig' : uitkomst ? uitkomst.soort : 'klaar'
    d.lakLagen = String(lagen.length)
    d.lakStreken = String(lagen.reduce((n, l) => n + (l.soort === 'penseel' ? l.streken.length : 0), 0))
    d.lakSoorten = lagen.map((l) => l.soort).join(',')
    d.lakNaam = naam
    if (klaar) {
      d.lakZones = String(Math.max(...klaar.doelen.map((x) => x.zones.length)))
      d.lakKlaarMs = String(Math.round(klaar.ms))
    }
    if (optiesMs !== undefined) d.lakOptiesMs = String(optiesMs)
    if (uitkomst) d.lakUitkomst = JSON.stringify(uitkomst)
    else delete d.lakUitkomst
  })

  /* ------------------------------------------------------------------ het project */
  const namen: ReceptNamen = useMemo(
    () => ({
      grond: t('ls.laag.grond'),
      strook: (s: StrookSjabloon) => t(`ls.strook.${s}` as TextKey),
      tekst: t('ls.laag.tekst'),
      logo: t('ls.laag.logo')
    }),
    [t]
  )

  const planBewaar = useCallback(
    (p: LakProject) => {
      if (bewaarKlok.current) clearTimeout(bewaarKlok.current)
      bewaarKlok.current = setTimeout(() => {
        void brug.lakBewaar({ ...p, id: projectId.current }).then((b) => {
          if (b?.id) projectId.current = b.id
        })
      }, 2000)
    },
    [brug]
  )

  /** Het project heeft een id nodig (voor beelden): nu bewaren als het er nog geen had. */
  const zorgId = useCallback(async (): Promise<string> => {
    if (projectId.current) return projectId.current
    const p = geschRef.current?.heden
    if (!p) return ''
    const b = await brug.lakBewaar({ ...p, id: '', naam: naam || p.naam })
    if (b?.id) projectId.current = b.id
    return projectId.current
  }, [brug, naam])

  /** Een nieuwe stand van het project: in beeld, naar de werker, en straks bewaard. */
  const zet = useCallback(
    (g: Geschiedenis) => {
      geschRef.current = g
      zetGesch(g)
      handvat?.studio.lagen(g.heden.lagen, g.heden.spiegel)
      // Een nieuw project staat nog in de lak van de bus (§2.1, 0:01): de eerste laag zet de studiolak aan,
      // en wie alles ongedaan maakt, ziet de bus weer zoals hij was.
      if (!voorNaRef.current) handvat?.studio.toon(lakTonen(g.heden))
      planBewaar(g.heden)
    },
    [handvat, planBewaar]
  )
  const voorNaRef = useRef(false)
  voorNaRef.current = voorNa

  const doeH = useCallback(
    (h: Handeling) => {
      const g = geschRef.current
      if (g) zet(doe(g, h))
    },
    [zet]
  )

  /** Voorlopig (tijdens slepen): geen stap in de geschiedenis. `vast` legt het vast als één stap vanaf het begin van de sleep. */
  const wijzigLaag = useCallback(
    (id: string, deel: Partial<Laag>, vast: boolean) => {
      const g = geschRef.current
      if (!g) return
      const h: Handeling = { soort: 'wijzig', id, deel }
      if (vast) {
        const van = sleepBegin.current ?? g
        sleepBegin.current = undefined
        zet(doe(van, h))
      } else {
        sleepBegin.current ??= g
        zet({ ...g, heden: doe(sleepBegin.current, h).heden })
      }
    },
    [zet]
  )

  // Familie, busopties en project: één keer per bus of project.
  useEffect(() => {
    let weg = false
    t0.current = performance.now()
    zetKlaar(undefined)
    zetKlaarFout(undefined)
    zetUitkomst(undefined)
    gestartVoor.current = ''
    verstuurd.current.clear()
    void (async () => {
      const [f, o] = await Promise.all([brug.lakDoelen(pad, kleurstelling), brug.lakOpties(pad)])
      if (weg) return
      zetFamilie(f)
      zetOpties(o)
      if (!f) {
        zetKlaarFout(t('ls.geenCtc'))
        return
      }
      let p = vraag.lak?.projectId ? await brug.lakLaad(vraag.lak.projectId) : undefined
      if (weg) return
      if (p) {
        projectId.current = p.id
        naamVolgt.current = false
      } else {
        const bestaand = await brug.lakProjecten(pad)
        const bedrijf = vraag.lak?.bedrijf?.naam
        const start = (vraag.lak?.start as LakStart | undefined) ?? 'snel'
        const nu = new Date().toISOString()
        projectId.current = ''
        naamVolgt.current = !bedrijf
        p = {
          versie: 1,
          id: '',
          naam: cp1252Vriendelijk(bedrijf || t('ls.mijnLak', { n: bestaand.length + 1 })),
          bus: pad,
          start,
          startKleurstelling: kleurstelling,
          lagen: [],
          opties: standaardOpties(o, start, f.optiesMogelijk),
          spiegel: { aan: true },
          gemaakt: nu,
          bewaard: nu,
          bedrijf: vraag.lak?.bedrijf,
          snel: { kleuren: [null, null, null], strook: 'onderband', naam: bedrijf ?? '', lettertype: STANDAARD_LETTERTYPE }
        }
      }
      const g = begin(p)
      geschRef.current = g
      zetGesch(g)
      zetNaam(p.naam)
      zetGereedschap(p.lagen.length === 0 && (p.start === 'snel' || !p.start) ? 'snel' : 'vullen')
    })()
    return () => {
      weg = true
    }
    // Per vraag (een nieuwe [Lak maken] is een nieuw project), per bus en per project; de rest lezen de effecten zelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brug, pad, vraag.aanvraag, vraag.lak?.projectId])

  useEffect(() => () => handvat?.studio.stop(), [handvat])

  // Een klaargezette lak is geplaatst nu OMSI dicht is (§5.7, ls.geplaatst).
  useEffect(() => brug.opLakGeplaatst(({ naam: n }) => zetTip({ tekst: t('ls.geplaatst', { naam: n }) })), [brug, t])

  // Windows-lettertypen (gemeten): één keer.
  useEffect(() => {
    void windowsLettertypen().then(zetWindows)
  }, [])

  /* ------------------------------------------------------------------ de busopties in beeld (§4.9) */
  const optieSleutel = JSON.stringify(heden?.opties ?? {})
  const zetOptiesInBeeld = useCallback(
    async (waarden: Record<string, number>): Promise<number | undefined> => {
      if (!handvat || !manifest) return undefined
      const t1 = performance.now()
      const lak = await brug.busLak3d(manifest.pakket, kleurstelling, Object.entries(waarden))
      // Ook als het niet lukt: dan start het lakdoek met wat er staat, in plaats van te blijven wachten.
      zetGetoondeOpties(JSON.stringify(waarden))
      if ('reden' in lak) return undefined
      handvat.lak(lak, performance.timeOrigin + performance.now())
      return performance.now() - t1
    },
    [brug, handvat, manifest, kleurstelling]
  )

  /* ------------------------------------------------------------------ het lakdoek starten */
  const opStand = useCallback((s: ViewerStand) => {
    if (s.fase !== 'scherp') return
    zetScherpVoor(huidigPad.current)
    const w = scherpWachters.current.filter((x) => x.pad === huidigPad.current)
    scherpWachters.current = scherpWachters.current.filter((x) => x.pad !== huidigPad.current)
    for (const x of w) x.klaar()
  }, [])
  const huidigPad = useRef(viewPad)
  huidigPad.current = viewPad
  const wachtScherp = (p: string): Promise<void> => new Promise((klaar) => scherpWachters.current.push({ pad: p, klaar }))

  /** Beelden en teksten die de werker nog niet heeft (na een start of een herstart). */
  const stuurBeelden = useCallback(
    async (ls: Laag[]) => {
      if (!handvat) return
      for (const l of ls) {
        const k = l.soort === 'afbeelding' ? l.beeld : l.soort === 'tekst' ? decalSleutel(l) : undefined
        if (!k || verstuurd.current.has(k)) continue
        verstuurd.current.add(k)
        try {
          if (l.soort === 'afbeelding') {
            const id = projectId.current
            const bytes = id ? await brug.lakBeeldBytes(id, l.beeld) : undefined
            if (bytes) handvat.studio.beeld(l.beeld, await beeldVanBytes(bytes))
          } else if (l.soort === 'tekst') handvat.studio.beeld(k, await tekstBeeld(l))
        } catch {
          verstuurd.current.delete(k)
        }
      }
    },
    [brug, handvat]
  )

  const startLakdoek = useCallback(
    async (p: LakProject, f: LakFamilieInfo, licht: boolean): Promise<LakKlaarInfo | undefined> => {
      if (!handvat) return undefined
      verstuurd.current.clear()
      const k = (await handvat.studio.start(f, p.lagen, p.spiegel, licht, { start: p.start, getoond: lakTonen(p) })) as LakKlaarInfo | { fout: string }
      if ('fout' in k) {
        zetKlaarFout(k.fout)
        return undefined
      }
      void stuurBeelden(p.lagen)
      return k
    },
    [handvat, stuurBeelden]
  )

  useEffect(() => {
    if (!handvat || !familie || !gesch || !manifest || bakPad) return
    if (scherpVoor !== viewPad) return
    if (familie.geenCtc || familie.doelen.length === 0) {
      zetKlaarFout(t('ls.geenCtc'))
      return
    }
    const p = gesch.heden
    // Eerst de busopties van het project in beeld (het masker volgt wat zichtbaar is), dan het lakdoek.
    if (getoondeOpties !== optieSleutel && Object.keys(p.opties).length > 0) {
      void zetOptiesInBeeld(p.opties)
      return
    }
    const sleutel = `${viewPad}|${p.start}|${stand.licht}`
    if (gestartVoor.current === sleutel) return
    gestartVoor.current = sleutel
    void startLakdoek(p, familie, stand.licht).then(async (k) => {
      if (!k) return
      zetKlaar(k)
      zetZoneKleuren(k.doelen[0]?.zones.map((z) => ({ kleur: z.kleur, lak: z.lak })) ?? [])
      // De kleuren van de lak die nu op de bus staat: de stalen van Snelle lak (§2.1), en "Effen in de kleuren".
      const kl = (await handvat.studio.kleuren()) as Array<{ doel: string; zones: Array<{ lab: V3; lak: boolean; kleur?: string; deel: number }> }> | { fout: string }
      if (!Array.isArray(kl) || !kl[0]) return
      const lakZones = [...kl[0].zones].filter((z) => z.lak && z.kleur).sort((a, b) => b.deel - a.deel)
      const v = lakZones.map((z) => z.kleur!).slice(0, 3)
      while (v.length < 3) v.push(v.length === 0 ? '#1d3f8f' : '#ffffff')
      zetVoorvulling(v as [string, string, string])
      zetZoneKleuren(kl[0].zones.map((z) => ({ kleur: z.kleur ?? '#808080', lak: z.lak })))
      const nu = geschRef.current?.heden
      if (nu && nu.start === 'effenKleuren' && nu.lagen.length === 0) {
        doeH({ soort: 'vervang', lagen: effenInKleuren(kl[0].zones, (n) => t('ls.laag.zone', { n })) })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handvat, familie, gesch !== undefined, gesch?.heden.start, manifest, scherpVoor, viewPad, bakPad, stand.licht, getoondeOpties, optieSleutel])

  // Na een contextverlies start de werker het lakdoek zelf opnieuw, licht (P4): beelden opnieuw sturen.
  useEffect(() => {
    const v = Verbinding.get()
    v.opLakHerstart = (k) => {
      if (k && typeof k === 'object' && !('fout' in k)) zetKlaar(k as LakKlaarInfo)
      zetLichtHerstart(true)
      verstuurd.current.clear()
      void stuurBeelden(geschRef.current?.heden.lagen ?? [])
    }
    v.opLakAnalyse = (u) => zetAnalyse(u)
    return () => {
      v.opLakHerstart = undefined
      v.opLakAnalyse = undefined
    }
  }, [stuurBeelden])

  // Teksten die er bij kwamen of veranderden: het beeld met het echte lettertype naar de werker.
  useEffect(() => {
    if (klaar) void stuurBeelden(lagen)
  }, [lagen, klaar, stuurBeelden])

  /* ------------------------------------------------------------------ naam (§5.2) */
  useEffect(() => {
    let weg = false
    const klok = setTimeout(() => {
      void brug.lakNaamVrij(pad, naam, projectId.current || undefined).then((f: NaamFout | undefined) => {
        if (weg) return
        zetNaamFout(f ? naamFoutTekst(f) : undefined)
      })
    }, 200)
    return () => {
      weg = true
      clearTimeout(klok)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naam, pad])
  const naamFoutTekst = (f: NaamFout): string =>
    f.fout === 'bezet'
      ? t('ls.naamBezet')
      : f.fout === 'teken'
        ? t('ls.naamTeken', { teken: f.teken })
        : f.fout === 'lang'
          ? t('ls.naam.lang', { max: f.max })
          : t(`ls.naam.${f.fout}` as TextKey)

  /* ------------------------------------------------------------------ Snelle lak (§2.1) */
  const meetTekst = useCallback((tekst: string, lt: string) => tekstBreedtePx(tekst, lt), [])
  /** De naam en het logo van Snelle lak die de speler nog niet zelf verplaatste: die zoeken zelf een vrij stuk. */
  const zelfGezet = useRef(new Set<string>())
  const vrijKlok = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const zoekVrij = useCallback(() => {
    if (vrijKlok.current) clearTimeout(vrijKlok.current)
    vrijKlok.current = setTimeout(() => {
      void (async () => {
        for (const [id, van, tot] of [
          [RECEPT_ID.tekst, 0.15, 0.85],
          [RECEPT_ID.logo, 0.55, 0.95]
        ] as const) {
          if (zelfGezet.current.has(id) || !handvat || !geschRef.current?.heden.lagen.some((l) => l.id === id)) continue
          const p = await handvat.studio.vrij(id, van, tot)
          const g = geschRef.current
          const l = g?.heden.lagen.find((x) => x.id === id)
          // In dezelfde stap als de keuze in het paneel: geen eigen stap in de geschiedenis.
          if (g && p && l && 'plaats' in l) zet({ ...g, heden: { ...g.heden, lagen: g.heden.lagen.map((x) => (x.id === id ? ({ ...x, plaats: { ...l.plaats, midden: p.midden } } as Laag) : x)) } })
        }
      })()
    }, 250)
  }, [handvat, zet])
  const pasSnel = useCallback(
    (nieuw: SnelleLakStand, vast: boolean) => {
      const g = geschRef.current
      if (!g || !busmaat) return
      const van = vast ? (sleepBegin.current ?? g) : (sleepBegin.current ??= g)
      const lagenNa = pasSnelleLak(van.heden.lagen, nieuw, busmaat, namen, meetTekst)
      const h: Handeling = { soort: 'project', deel: { snel: nieuw, lagen: lagenNa } }
      if (vast) {
        sleepBegin.current = undefined
        zet(doe(van, h))
      } else zet({ ...g, heden: doe(van, h).heden })
      if (naamVolgt.current && nieuw.naam.trim()) zetNaam(cp1252Vriendelijk(nieuw.naam.trim()).slice(0, 48))
      if (vast) zoekVrij()
    },
    [busmaat, namen, meetTekst, zet, zoekVrij]
  )
  const snel: SnelleLakStand = heden?.snel ?? { kleuren: [null, null, null], strook: 'onderband', naam: '' }

  // Het logo als plaatje in het paneel.
  useEffect(() => {
    let url: string | undefined
    let weg = false
    const id = heden?.snel?.logo
    if (!id || !projectId.current) {
      zetLogoUrl(undefined)
      return
    }
    void brug.lakBeeldBytes(projectId.current, id).then((b) => {
      if (weg || !b) return
      url = URL.createObjectURL(new Blob([b as Uint8Array<ArrayBuffer>]))
      zetLogoUrl(url)
    })
    return () => {
      weg = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [brug, heden?.snel?.logo])

  /** Een beeld inlezen (logo of afbeelding): naar main onder zijn sha1, en naar de werker. */
  const importeer = useCallback(
    async (f: File): Promise<{ id: string; verhouding: number; wit: boolean } | undefined> => {
      zetAfbFout(undefined)
      const b = await leesBeeld(f)
      if ('fout' in b) {
        zetAfbFout(t(`ls.afb.fout.${b.fout}` as TextKey))
        return undefined
      }
      const id = await zorgId()
      const r = id ? await brug.lakBeeld(id, b.bytes) : undefined
      if (!r) {
        b.bitmap.close()
        zetAfbFout(t('ls.afb.fout.soort'))
        return undefined
      }
      handvat?.studio.beeld(r.id, b.bitmap)
      verstuurd.current.add(r.id)
      zetTip({ tekst: t('ls.logo') })
      return { id: r.id, verhouding: b.h / Math.max(1, b.b), wit: b.witDoorzichtig }
    },
    [brug, handvat, t, zorgId]
  )

  /* ------------------------------------------------------------------ starten en busopties */
  const kiesStart = useCallback(
    async (s: LakStart) => {
      const g = geschRef.current
      if (!g || !familie) return
      const nieuweOpties = standaardOpties(opties, s, familie.optiesMogelijk)
      let nieuweLagen: Laag[] = []
      if (s === 'snel' && busmaat) nieuweLagen = pasSnelleLak([], g.heden.snel ?? snel, busmaat, namen, meetTekst)
      if (s === 'effenKleuren' && handvat) {
        const kl = (await handvat.studio.kleuren()) as Array<{ zones: Array<{ lab: V3; lak: boolean; kleur?: string }> }> | { fout: string }
        if (Array.isArray(kl) && kl[0]) nieuweLagen = effenInKleuren(kl[0].zones, (n) => t('ls.laag.zone', { n }))
      }
      zet(doe(g, { soort: 'project', deel: { start: s, lagen: nieuweLagen, opties: nieuweOpties } }))
      zetGekozen(undefined)
      zetMeerPaneel(undefined)
      zetGereedschap(s === 'snel' ? 'snel' : 'vullen')
      // Een andere basis (precies of niet) vraagt een nieuw lakdoek; dat doet het start-effect bij de volgende stand.
      if ((s === 'precies') !== (g.heden.start === 'precies')) gestartVoor.current = ''
    },
    [busmaat, familie, handvat, meetTekst, namen, opties, snel, t, zet]
  )

  const zetOptie = useCallback(
    async (variabele: string, waarde: number) => {
      const g = geschRef.current
      if (!g || !handvat) return
      const nieuw = { ...g.heden.opties, [variabele]: waarde }
      zet(doe(g, { soort: 'opties', opties: nieuw }))
      const t1 = performance.now()
      await zetOptiesInBeeld(nieuw)
      // P16: de nieuwe ruststand en het masker opnieuw, samen in ≤ 300 ms.
      await handvat.studio.maskers()
      zetOptiesMs(Math.round(performance.now() - t1))
    },
    [handvat, zet, zetOptiesInBeeld]
  )

  /* ------------------------------------------------------------------ aanwijzen en gereedschap */
  const vul = async (x: number, y: number): Promise<void> => {
    if (!handvat) return
    const k = (await handvat.studio.kies(x, y, true)) as LakKeuze
    toonTipVoor(k)
    if (!k.lak || k.glas || !k.zone) return
    const g = geschRef.current
    if (!g) return
    const z = k.zone
    // Dezelfde zone nog eens: de kleur van die laag, geen nieuwe laag.
    const bestaand = [...g.heden.lagen].reverse().find((l) => l.soort === 'zone' && !l.uitRecept && Math.hypot(l.centrum[0] - z.lab[0], l.centrum[1] - z.lab[1], l.centrum[2] - z.lab[2]) < 1)
    if (bestaand) {
      zet(doe(g, { soort: 'wijzig', id: bestaand.id, deel: { kleur } }))
      zetGekozen(bestaand.id)
      return
    }
    const nieuw: Laag = {
      id: nieuwId('z'),
      naam: t('ls.laag.zone', { n: z.index + 1 }),
      zichtbaar: true,
      dekking: 1,
      detail: 1,
      // Een zone van rubbers of lampen: wie daar bewust op klikt, wil hem gelakt (§4.4).
      ookOverRubbers: !z.lak || undefined,
      soort: 'zone',
      centrum: z.lab,
      straal: vulStraal(z.lab as V3, z.alle as V3[]),
      kleur
    }
    zet(doe(g, { soort: 'voegToe', laag: nieuw }))
    zetGekozen(nieuw.id)
  }

  const toonTipVoor = (k: LakKeuze): void => {
    if (k.variabelen?.length) {
      const o = opties.find((x) => k.variabelen!.some((v) => v.toLowerCase() === x.variabele.toLowerCase()) && x.verberg !== undefined)
      zetTip({
        tekst: t('ls.onderdeel'),
        knop: o && familie?.optiesMogelijk ? { tekst: t('ls.weghalen'), doe: () => void zetOptie(o.variabele, o.verberg!) } : undefined
      })
    } else if (k.glas) zetTip({ tekst: t('ls.ruit') })
    else if (!k.lak && k.plek) zetTip({ tekst: t('ls.vast') })
    else if (k.gedeeld && (klaar?.doelen.some((d) => d.gedeeld >= 5) ?? false)) zetTip({ tekst: t('ls.gekoppeld') })
  }

  /** De zijde die nu naar de camera kijkt: daar komt een nieuw beeld of een nieuwe vorm. */
  const zichtbareZijde = (): 'L' | 'R' | 'V' | 'A' => {
    if (!cam || !busmaat) return 'R'
    const { min, max } = busmaat
    const midden: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const kanten: Array<['L' | 'R' | 'V' | 'A', V3]> = [
      ['R', [max[0], midden[1], midden[2]]],
      ['L', [min[0], midden[1], midden[2]]],
      ['V', [midden[0], midden[1], max[2]]],
      ['A', [midden[0], midden[1], min[2]]]
    ]
    let beste: 'L' | 'R' | 'V' | 'A' = 'R'
    let bz = Infinity
    for (const [z, p] of kanten) {
      const s = naarScherm(cam, p, 1, 1)
      if (s && s.z < bz) {
        bz = s.z
        beste = z
      }
    }
    return beste
  }

  /** Een plaats midden op de zijde in beeld, op een hoogte boven de onderkant. */
  const plaatsOpZijde = (breedteM: number, hoogteDeel = 0.6): Plaats => {
    const m = busmaat!
    const z = zichtbareZijde()
    const raam = raamHoogte(m)
    const y = m.min[1] + raam * hoogteDeel
    const midden: V3 =
      z === 'R' ? [m.max[0], y, (m.min[2] + m.max[2]) / 2] : z === 'L' ? [m.min[0], y, (m.min[2] + m.max[2]) / 2] : z === 'V' ? [(m.min[0] + m.max[0]) / 2, y, m.max[2]] : [(m.min[0] + m.max[0]) / 2, y, m.min[2]]
    return { zijde: z, midden, breedteM, draai: 0, spiegel: 'gekoppeld' }
  }

  const nieuweTekst = async (x: number, y: number): Promise<void> => {
    if (!handvat) return
    const k = (await handvat.studio.kies(x, y, true)) as LakKeuze
    toonTipVoor(k)
    if (!k.lak || !k.plek || !k.normaal) return
    const g = geschRef.current
    if (!g) return
    const tekst = t('ls.tekst.voorbeeld')
    const lt = STANDAARD_LETTERTYPE
    const breedte = tekstBreedteM(tekstBreedtePx(tekst, lt), 25)
    const nieuw: Laag = {
      id: nieuwId('t'),
      naam: t('ls.laag.tekst'),
      zichtbaar: true,
      dekking: 1,
      detail: 1,
      soort: 'tekst',
      tekst,
      lettertype: lt,
      hoogteCm: 25,
      kleur,
      plaats: plaatsBij(k.plek as V3, k.normaal as V3, breedte)
    }
    zet(doe(g, { soort: 'voegToe', laag: nieuw }))
    zetGekozen(nieuw.id)
    tekstFocus.current = nieuw.id
  }
  /** "Typen op de bus" (§1): na een klik met Tekst meteen in het tekstveld, zodra het paneel van die laag er staat. */
  const tekstFocus = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!tekstFocus.current || tekstFocus.current !== gekozen || !tekstRef.current) return
    tekstFocus.current = undefined
    tekstRef.current.focus()
    tekstRef.current.select()
  })

  /** Een tekstlaag wijzigen: de breedte volgt de tekst, het lettertype, de hoogte en de letterafstand. */
  const wijzigTekst = (l: Extract<Laag, { soort: 'tekst' }>, deel: Partial<Laag>, vast: boolean): void => {
    const n = { ...l, ...deel } as Extract<Laag, { soort: 'tekst' }>
    const breedte = tekstBreedteM(tekstBreedtePx(n.tekst, n.lettertype, n.letterafstand), n.hoogteCm)
    wijzigLaag(l.id, { ...deel, plaats: { ...(deel as { plaats?: Plaats }).plaats ?? l.plaats, breedteM: breedte } } as Partial<Laag>, vast)
  }

  /* ------------------------------------------------------------------ handvatten en decals op het scherm */
  const geo = useMemo(() => {
    const uit: {
      decals: Array<{ id: string; kopie: boolean; hoeken: Array<[number, number]> }>
      strook?: { id: string; lijnen: Array<{ rand: 'h1' | 'h2'; a: [number, number]; b: [number, number]; perMeter: number }> }
      hoek?: { id: string; p: [number, number]; midden: [number, number] }
      vlak?: Array<[number, number]>
      gidsen: Array<{ naam: string; a: [number, number]; b: [number, number] }>
    } = { decals: [], gidsen: [] }
    if (!cam || !busmaat) return uit
    const scherm = (p: V3): [number, number] | undefined => {
      const s = naarScherm(cam, p, maat.b, maat.h)
      return s ? [s.x, s.y] : undefined
    }
    for (const l of lagen) {
      if (!l.zichtbaar || !('plaats' in l)) continue
      const bm = decalMaat(l)
      if (!bm) continue
      const voeg = (p: Plaats, kopie: boolean): void => {
        const h = decalHoeken(p, bm.b, bm.h).map(scherm)
        if (h.every(Boolean)) uit.decals.push({ id: l.id, kopie, hoeken: h as Array<[number, number]> })
      }
      voeg(l.plaats, false)
      const s = spiegelAan ? spiegelPlaats(l.plaats, vlakX) : undefined
      if (s && analyse[l.id]?.kopie !== false) voeg(s.plaats, true)
    }
    // De randen van de gekozen strook, op de zijkant die naar de camera kijkt.
    if (laag?.soort === 'strook' && laag.zijden !== 'voor' && laag.zijden !== 'achter') {
      const { min, max } = busmaat
      const r = naarScherm(cam, [max[0], (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], 1, 1)
      const lk = naarScherm(cam, [min[0], (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], 1, 1)
      const x = r && lk && lk.z < r.z ? min[0] : max[0]
      const zmid = (min[2] + max[2]) / 2
      const lijnen: NonNullable<typeof uit.strook>['lijnen'] = []
      for (const rand of ['h1', 'h2'] as const) {
        const hh = laag[rand]
        const a = scherm([x, min[1] + hh, min[2] + 0.3])
        const b = scherm([x, min[1] + hh, max[2] - 0.3])
        const p0 = scherm([x, min[1] + hh, zmid])
        const p1 = scherm([x, min[1] + hh + 1, zmid])
        if (a && b && p0 && p1) lijnen.push({ rand, a, b, perMeter: Math.max(1, Math.abs(p1[1] - p0[1])) })
      }
      uit.strook = { id: laag.id, lijnen }
      // Gidsen: de raamlijn en de middenlijn.
      const raam = min[1] + raamHoogte(busmaat)
      const midden = (min[1] + max[1]) / 2
      for (const [n, y] of [[t('ls.raamlijn'), raam], [t('ls.middenlijn'), midden]] as Array<[string, number]>) {
        const a = scherm([x, y, min[2]])
        const b = scherm([x, y, max[2]])
        if (a && b) uit.gidsen.push({ naam: n, a, b })
      }
    }
    // De hoek van de gekozen decal: slepen maakt hem groter of kleiner.
    if (laag && 'plaats' in laag) {
      const d = uit.decals.find((x) => x.id === laag.id && !x.kopie)
      if (d) {
        const m: [number, number] = [d.hoeken.reduce((s, p) => s + p[0], 0) / 4, d.hoeken.reduce((s, p) => s + p[1], 0) / 4]
        uit.hoek = { id: laag.id, p: d.hoeken[2], midden: m }
      }
    }
    // De snijlijn van het spiegelvlak (§1): over het dak en langs voor en achter.
    if (spiegelAan) {
      const { min, max } = busmaat
      const pts = [
        [vlakX, min[1] + 0.3, min[2]],
        [vlakX, max[1], min[2]],
        [vlakX, max[1], max[2]],
        [vlakX, min[1] + 0.3, max[2]]
      ].map((p) => scherm(p as V3))
      if (pts.every(Boolean)) uit.vlak = pts as Array<[number, number]>
    }
    return uit
  }, [cam, busmaat, maat, lagen, laag, spiegelAan, vlakX, analyse, t])

  const raakHandvat = (px: [number, number]): Sleep | undefined => {
    if (geo.hoek && Math.hypot(px[0] - geo.hoek.p[0], px[1] - geo.hoek.p[1]) < 12 && laag && 'plaats' in laag) {
      return { soort: 'hoek', id: laag.id, midden: geo.hoek.midden, afstand0: Math.max(4, Math.hypot(geo.hoek.p[0] - geo.hoek.midden[0], geo.hoek.p[1] - geo.hoek.midden[1])), laag0: laag }
    }
    if (geo.strook && laag?.soort === 'strook') {
      for (const l of geo.strook.lijnen) {
        const [ax, ay] = l.a
        const [bx, by] = l.b
        const t2 = Math.max(0, Math.min(1, ((px[0] - ax) * (bx - ax) + (px[1] - ay) * (by - ay)) / (((bx - ax) ** 2 + (by - ay) ** 2) || 1)))
        const d = Math.hypot(px[0] - (ax + t2 * (bx - ax)), px[1] - (ay + t2 * (by - ay)))
        if (d < 8) return { soort: 'strook', id: laag.id, rand: l.rand, y0: px[1], waarde0: laag[l.rand], perMeter: l.perMeter }
      }
    }
    return undefined
  }

  const raakDecal = (px: [number, number]): { id: string; kopie: boolean } | undefined => {
    // Bovenste laag eerst.
    for (let i = geo.decals.length - 1; i >= 0; i--) {
      const d = geo.decals[i]
      if (inVeelhoek(px, d.hoeken)) return { id: d.id, kopie: d.kopie }
    }
    return undefined
  }

  /** Een decal naar het aangewezen punt, met één aanwijzing tegelijk (de nieuwste wint). */
  const sleepDecal = (s: Extract<Sleep, { soort: 'decal' }>, ndc: [number, number]): void => {
    if (!handvat) return
    if (kiesBezig.current) {
      kiesVolgende.current = ndc
      return
    }
    kiesBezig.current = true
    void (handvat.studio.kies(ndc[0], ndc[1]) as Promise<LakKeuze>).then((k) => {
      kiesBezig.current = false
      const l = geschRef.current?.heden.lagen.find((x) => x.id === s.id)
      if (l && 'plaats' in l && k.lak && k.plek && k.normaal) {
        let p = plaatsBij(k.plek as V3, k.normaal as V3, l.plaats.breedteM)
        // Aan de kopie gesleept: het origineel is het spiegelbeeld van waar de kopie heen gaat.
        if (s.kopie) p = spiegelPlaats({ ...p, spiegel: 'gekoppeld' }, s.vlakX)?.plaats ?? p
        wijzigLaag(s.id, { plaats: { ...l.plaats, zijde: p.zijde, midden: p.midden } } as Partial<Laag>, false)
      }
      const volgende = kiesVolgende.current
      kiesVolgende.current = undefined
      if (volgende) sleepDecal(s, volgende)
    })
  }

  const naarPx = (ndc: [number, number]): [number, number] => [((ndc[0] + 1) / 2) * maat.b, ((1 - ndc[1]) / 2) * maat.h]

  const penseelLaag = (): string | undefined => {
    const g = geschRef.current
    if (!g) return undefined
    if (laag?.soort === 'penseel' && !laag.vergrendeld) return laag.id
    const bestaande = g.heden.lagen.filter((l) => l.soort === 'penseel')
    if (bestaande.length >= 2) {
      zetTip({ tekst: t('ls.penseel.vol') })
      return undefined
    }
    const nieuw: Laag = { id: nieuwId('p'), naam: t('ls.laag.penseel'), zichtbaar: true, dekking: 1, detail: 1, soort: 'penseel', kleur, streken: [] }
    zet(doe(g, { soort: 'voegToe', laag: nieuw }))
    zetGekozen(nieuw.id)
    return nieuw.id
  }

  const bediening: StudioBediening = {
    omlaag: (ndc) => {
      zetTip(undefined)
      const px = naarPx(ndc)
      const hv = raakHandvat(px)
      if (hv) {
        sleepBegin.current = geschRef.current
        zetSleep(hv)
        return true
      }
      if (gereedschap === 'penseel' && handvat) {
        const id = penseelLaag()
        if (!id) return false
        handvat.studio.penseel('begin', ndc[0], ndc[1], id, penseel)
        zetSleep({ soort: 'penseel', id })
        return true
      }
      const d = raakDecal(px)
      if (d) {
        const l = lagen.find((x) => x.id === d.id)
        zetGekozen(d.id)
        if (l) zetGereedschap(l.soort === 'tekst' ? 'tekst' : l.soort === 'afbeelding' || l.soort === 'vorm' ? 'afbeelding' : gereedschap)
        if (l?.vergrendeld) return false
        sleepBegin.current = geschRef.current
        zelfGezet.current.add(d.id)
        zetSleep({ soort: 'decal', id: d.id, kopie: d.kopie, vlakX })
        return true
      }
      if (gereedschap === 'vullen') void vul(ndc[0], ndc[1])
      else if (gereedschap === 'tekst') void nieuweTekst(ndc[0], ndc[1])
      else if (handvat) {
        // Snelle lak, strook, afbeelding: alleen aanwijzen (tips), en loslaten wat gekozen was.
        void (handvat.studio.kies(ndc[0], ndc[1], true) as Promise<LakKeuze>).then(toonTipVoor)
        if (gereedschap !== 'strook') zetGekozen(undefined)
      }
      return false
    },
    beweeg: (ndc) => {
      const s = sleep
      if (!s || !handvat) return
      const px = naarPx(ndc)
      if (s.soort === 'penseel') handvat.studio.penseel('punt', ndc[0], ndc[1], s.id, penseel)
      else if (s.soort === 'decal') sleepDecal(s, ndc)
      else if (s.soort === 'strook' && busmaat) {
        let w = s.waarde0 - (px[1] - s.y0) / s.perMeter
        // Vastklikken aan de raamlijn en de middenlijn (binnen 6 cm).
        for (const gids of [raamHoogte(busmaat), (busmaat.max[1] - busmaat.min[1]) / 2]) if (Math.abs(w - gids) < 0.06) w = gids
        const l = geschRef.current?.heden.lagen.find((x) => x.id === s.id)
        if (l?.soort !== 'strook') return
        if (s.rand === 'h1') w = Math.min(w, l.h2 - 0.02)
        else w = Math.max(w, l.h1 + 0.02)
        wijzigLaag(s.id, { [s.rand]: Math.round(w * 1000) / 1000 } as Partial<Laag>, false)
      } else if (s.soort === 'hoek') {
        const f = Math.max(0.1, Math.min(10, Math.hypot(px[0] - s.midden[0], px[1] - s.midden[1]) / s.afstand0))
        const l0 = s.laag0
        if (l0.soort === 'tekst') wijzigTekst(l0, { hoogteCm: Math.max(2, Math.round(l0.hoogteCm * f)) }, false)
        else if ('plaats' in l0) wijzigLaag(s.id, { plaats: { ...l0.plaats, breedteM: Math.max(0.05, l0.plaats.breedteM * f) } } as Partial<Laag>, false)
      }
    },
    los: () => {
      const s = sleep
      zetSleep(undefined)
      if (!s) return
      if (s.soort === 'penseel') {
        void handvat?.studio.penseelEinde().then((streek) => {
          const g = geschRef.current
          const l = g?.heden.lagen.find((x) => x.id === s.id)
          if (!g || !streek || l?.soort !== 'penseel') return
          const { laagId: _, ...zonder } = streek
          void _
          zet(doe(g, { soort: 'wijzig', id: s.id, deel: { streken: [...l.streken, zonder] } as Partial<Laag> }))
        })
        return
      }
      // De sleep wordt één stap in de geschiedenis.
      const g = geschRef.current
      const van = sleepBegin.current
      sleepBegin.current = undefined
      if (!g || !van || g.heden === van.heden) return
      // De band van Snelle lak versleept: de naam en het logo gaan mee naar boven de band (in dezelfde stap).
      const heden = s.soort === 'strook' && s.id === RECEPT_ID.strook && busmaat ? { ...g.heden, lagen: volgBand(g.heden.lagen, busmaat, zelfGezet.current, g.heden.snel) } : g.heden
      zet({ verleden: [...van.verleden, van.heden].slice(-500), heden, toekomst: [] })
    },
    zweef: (ndc) => zetZweefHandvat(Boolean(ndc && raakHandvat(naarPx(ndc)))),
    dubbel: (ndc) => {
      void (handvat?.studio.kies(ndc[0], ndc[1]) as Promise<LakKeuze> | undefined)?.then((k) => {
        if (k?.plek) handvat?.invoer({ soort: 'centreer', punt: k.plek as V3 })
      })
    },
    cursor: sleep?.soort === 'strook' ? 'ns-resize' : zweefHandvat ? 'grab' : gereedschap === 'penseel' ? 'crosshair' : gereedschap === 'tekst' ? 'text' : gereedschap === 'vullen' ? 'cell' : 'default'
  }

  /* ------------------------------------------------------------------ Voor/na, toetsen */
  const zetVoorNaAan = useCallback(
    (aan: boolean) => {
      zetVoorNa(aan)
      const p = geschRef.current?.heden
      handvat?.studio.toon(!aan && Boolean(p && lakTonen(p)))
    },
    [handvat]
  )

  const stapGeschiedenis = useCallback(
    (terug: boolean) => {
      const g = geschRef.current
      if (!g) return
      zet(terug ? ongedaan(g) : opnieuw(g))
    },
    [zet]
  )

  useEffect(() => {
    const typt = (el: EventTarget | null): boolean => {
      const e = el as HTMLElement | null
      if (!e) return false
      if (e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable) return true
      return e.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes((e as HTMLInputElement).type)
    }
    const neer = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (typt(e.target)) (e.target as HTMLElement).blur()
        zetMeer(false)
        zetMeerPaneel(undefined)
        zetGekozen(undefined)
        zetTip(undefined)
        return
      }
      if (typt(e.target)) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        stapGeschiedenis(!e.shiftKey)
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault()
        stapGeschiedenis(false)
      } else if ((e.ctrlKey || e.metaKey) && k === 'w') {
        e.preventDefault()
        brug.sluit()
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      } else if (STAND_VAN[e.key]) {
        handvat?.invoer({ soort: 'stand', stand: STAND_VAN[e.key] })
      } else if (k === 'f') {
        handvat?.invoer({ soort: 'inpassen' })
      } else if (k === 'e') {
        zetGereedschap('penseel')
        zetPenseel((p) => ({ ...p, gum: !p.gum }))
      } else if (e.key === '[' || e.key === ']') {
        zetPenseel((p) => ({ ...p, straalCm: Math.max(0.5, Math.min(100, p.straalCm * (e.key === ']' ? 1.25 : 0.8))) }))
      } else if (k === 'o') {
        if (!e.repeat) zetVoorNaAan(true)
      } else if (e.key === 'Delete') {
        if (gekozen) {
          doeH({ soort: 'weg', id: gekozen })
          zetGekozen(undefined)
        }
      } else return
      e.preventDefault()
    }
    const op = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'o') zetVoorNaAan(false)
    }
    window.addEventListener('keydown', neer)
    window.addEventListener('keyup', op)
    return () => {
      window.removeEventListener('keydown', neer)
      window.removeEventListener('keyup', op)
    }
  }, [brug, doeH, gekozen, handvat, stapGeschiedenis, zetVoorNaAan])

  /* ------------------------------------------------------------------ maat van het beeld, de tweede viewport (§4.8) */
  useEffect(() => {
    const el = beeldRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      zetMaat({ b: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const gespiegeld = Boolean(laag && 'plaats' in laag && spiegelAan && laag.plaats.spiegel === 'gekoppeld' && (laag.plaats.zijde === 'L' || laag.plaats.zijde === 'R'))
  const toonTweede = gespiegeld && Boolean(klaar)
  useEffect(() => {
    if (!toonTweede || !tweedeDoek.current) return
    const doek = tweedeDoek.current
    doek.width = 320
    doek.height = 180
    const h = Verbinding.get().meld(doek, { opCamera: zetCamTweede })
    h.maat(320, 180, 1)
    h.studio.tweede(true)
    // De eerste keer één tip (§2.1, 0:28).
    try {
      if (!localStorage.getItem('lakstudio.spiegeltip')) {
        localStorage.setItem('lakstudio.spiegeltip', '1')
        zetTip({ tekst: t('ls.spiegel.tip') })
      }
    } catch {
      // geen opslag: dan elke keer niets
    }
    return () => {
      h.studio.tweede(false)
      h.weg()
      zetCamTweede(undefined)
    }
  }, [toonTweede, t])

  /* ------------------------------------------------------------------ opslaan (§5.6, §5.7) */
  /** Alle doelen van de familie: wat deze bus niet draagt, bakt een ander lid (§3.1). */
  const exporteerAlles = async (): Promise<Array<{ doel: string; dds: Uint8Array }> | { fout: string }> => {
    if (!handvat || !familie || !geschRef.current) return { fout: 'geen lakdoek' }
    const uit = new Map<string, Uint8Array>()
    const eerst = (await handvat.studio.exporteer()) as Array<{ doel: string; dds: Uint8Array }> | { fout: string }
    if ('fout' in eerst) return eerst
    for (const x of eerst) uit.set(x.doel, x.dds)
    let ontbreekt = familie.doelen.map((d) => d.id).filter((d) => !uit.has(d))
    let bakte = false
    while (ontbreekt.length > 0) {
      const lid =
        familie.leden.find((l) => l.bestuurbaar && l.doelen.includes(ontbreekt[0])) ?? familie.leden.find((l) => l.doelen.includes(ontbreekt[0]))
      if (!lid) return { fout: `${ontbreekt[0]}: geen familielid` }
      zetBezig(t('ls.bakken', { bus: lid.bus.split('\\').pop()!.replace(/\.bus$/i, '') }))
      bakte = true
      const klaarVoor = wachtScherp(lid.bus)
      zetBakPad(lid.bus)
      await klaarVoor
      const p = geschRef.current.heden
      await handvat.studio.start(familie, p.lagen, p.spiegel, false, { start: p.start, getoond: false })
      verstuurd.current.clear()
      await stuurBeelden(p.lagen)
      const r = (await handvat.studio.exporteer({ alleen: ontbreekt })) as Array<{ doel: string; dds: Uint8Array }> | { fout: string }
      if ('fout' in r) return r
      if (r.length === 0) return { fout: `${ontbreekt[0]}: niet te bakken op ${lid.bus}` }
      for (const x of r) uit.set(x.doel, x.dds)
      ontbreekt = ontbreekt.filter((d) => !uit.has(d))
    }
    if (bakte) {
      // Terug naar de bus van de studio, en het lakdoek daar opnieuw.
      const terug = wachtScherp(bekijkPad ?? pad)
      gestartVoor.current = ''
      zetBakPad(undefined)
      await terug
    }
    return familie.doelen.map((d) => ({ doel: d.id, dds: uit.get(d.id)! }))
  }

  const opslaan = async (keuze?: 'weggooien'): Promise<void> => {
    const g = geschRef.current
    if (!handvat || !g || naamFout) return
    zetUitkomst(undefined)
    zetTip(undefined)
    zetBezig(t('ls.stap.maken'))
    const id = await zorgId()
    await brug.lakBewaar({ ...g.heden, id, naam })
    const texturen = await exporteerAlles()
    if ('fout' in texturen) {
      zetBezig(undefined)
      zetUitkomst({ soort: 'fout', tekst: t('ls.fout.formaat', { detail: texturen.fout }) })
      return
    }
    zetBezig(t(stand.licht ? 'ls.stap.klaarzetten' : 'ls.stap.plaatsen'))
    const r: LakPlaatsUitkomst = await brug.lakPlaats(id, naam, texturen, keuze)
    zetBezig(undefined)
    if ('ok' in r) {
      naamVolgt.current = false
      // Main schreef het nummer en de versie in het project: overnemen, anders wist het volgende bewaren dat.
      const bewaard = await brug.lakLaad(id)
      const nu = geschRef.current
      if (bewaard && nu) zet({ ...nu, heden: { ...nu.heden, naam: bewaard.naam, geplaatst: bewaard.geplaatst } })
      zetUitkomst({ soort: 'ok', tekst: t('ls.klaar', { naam }) })
    } else if ('klaargezet' in r) {
      zetUitkomst({ soort: 'klaargezet', tekst: t('ls.klaargezet') })
    } else {
      const f = r.fout
      const tekst =
        f === 'naam'
          ? naamFoutTekst({ fout: (r.detail ?? 'leeg') as 'leeg' } as NaamFout)
          : f === 'conflict'
            ? t('ls.conflict', { bus: familie?.conflicten.flatMap((c) => c.bussen).map((b) => b.split('\\').pop()).join(', ') ?? '' })
            : f === 'handmatig'
              ? t('ls.handmatig', { n: r.bestanden?.length ?? 1 })
              : f === 'bezig'
                ? t('ls.bezig')
                : f === 'geenCtc'
                  ? t('ls.geenCtc')
                  : f === 'bestaat'
                    ? t('ls.fout.bestaat')
                    : f === 'ruimte'
                      ? t('ls.fout.ruimte')
                      : f === 'formaat'
                        ? t('ls.fout.formaat', { detail: r.detail ?? '' })
                        : t('ls.fout.fout', { detail: r.detail ?? f })
      zetUitkomst({ soort: 'fout', tekst, handmatig: f === 'handmatig' })
    }
  }

  const alsNieuwe = (): void => {
    const g = geschRef.current
    if (!g) return
    projectId.current = ''
    const p: LakProject = { ...g.heden, id: '', geplaatst: undefined }
    zet({ ...g, heden: p })
    zetNaam(`${naam} 2`.slice(0, 48))
    zetUitkomst(undefined)
  }

  const verwijderUitOmsi = async (): Promise<void> => {
    zetMeer(false)
    if (!projectId.current || !heden?.geplaatst) return
    // Rijden er eigen bussen in deze lak (het busbedrijf), dan dat eerst (ls.gebruik).
    const inGebruik = await brug.lakGebruik(pad, heden.geplaatst.naam)
    const vraagTekst = [inGebruik.length ? t('ls.gebruik', { nummers: inGebruik.join(', ') }) : '', t('ls.verwijder.zeker', { naam: heden.geplaatst.naam })]
      .filter(Boolean)
      .join(' ')
    if (!window.confirm(vraagTekst)) return
    const r = (await brug.lakVerwijder(projectId.current, false)) as { ok?: true; fout?: string; bestanden?: string[] }
    if (r && 'ok' in r) {
      doeH({ soort: 'project', deel: {} })
      zetUitkomst({ soort: 'verwijderd', tekst: t('ls.verwijderd', { naam: heden.geplaatst.naam }) })
    } else if (r?.fout === 'omsi') zetUitkomst({ soort: 'fout', tekst: t('ls.verwijder.omsi') })
    else if (r?.fout === 'handmatig') zetUitkomst({ soort: 'fout', tekst: t('ls.handmatig', { n: r.bestanden?.length ?? 1 }) })
    else zetUitkomst({ soort: 'fout', tekst: t('ls.fout.fout', { detail: r?.fout ?? '?' }) })
  }

  /* ------------------------------------------------------------------ opbouw */
  const titel = vraag.vloot ? `${t('bv.fleetTitle', { nr: vraag.vloot.nummer, naam: vraag.titel })}` : vraag.titel
  useEffect(() => {
    document.title = `${t('ls.titel')} · ${titel}`
  }, [t, titel])

  const bestuurbareLeden = (familie?.leden ?? []).filter((l) => l.bus.toLowerCase() !== pad.toLowerCase() && l.bestuurbaar && l.doelen.length > 0)
  const kiLeden = (familie?.leden ?? []).filter((l) => !l.bestuurbaar && l.doelen.length > 0)
  const ookOp = [
    ...bestuurbareLeden.map((l) => l.bus.split('\\').pop()!.replace(/\.bus$/i, '')),
    ...(kiLeden.length ? [t('ls.kiBussen', { n: kiLeden.length })] : [])
  ]
  const opslaanTekst = stand.licht ? t('ls.klaarzetten') : t('ls.opslaan')
  const basisNaam = t('ls.basis', { naam: heden?.start === 'precies' ? (heden.startKleurstelling ?? t('ls.basis.std')) : t('ls.basis.std') })
  const texelsKlein = laag?.soort === 'tekst' && eersteDoel ? (laag.hoogteCm / 100) * eersteDoel.texelsPerM < 10 : false
  const lettertypeMelding = laag?.soort === 'tekst' && lettertypeVoor(laag.lettertype).vervangen ? { naam: laag.lettertype, vervanger: STANDAARD_LETTERTYPE } : undefined
  const penseelVol = gereedschap === 'penseel' && lagen.filter((l) => l.soort === 'penseel').length >= 2 && laag?.soort !== 'penseel'

  const kiesGereedschap = (g: Gereedschap): void => {
    zetGereedschap(g)
    zetMeerPaneel(undefined)
    // De gekozen laag blijft als hij bij dit gereedschap hoort.
    if (laag) {
      const past = (g === 'vullen' && laag.soort === 'zone') || (g === 'strook' && laag.soort === 'strook') || (g === 'tekst' && laag.soort === 'tekst') || (g === 'afbeelding' && (laag.soort === 'afbeelding' || laag.soort === 'vorm')) || (g === 'penseel' && laag.soort === 'penseel')
      if (!past) zetGekozen(undefined)
    }
  }

  const paneel = ((): JSX.Element | null => {
    if (!heden) return null
    if (meerPaneel === 'opties')
      return (
        <OptiesPaneel
          opties={opties}
          waarden={heden.opties}
          mogelijk={familie?.optiesMogelijk ?? false}
          nietOp={familie?.nietOp[0]?.bus.split('\\').pop()}
          ms={optiesMs}
          onZet={(v, w) => void zetOptie(v, w)}
        />
      )
    if (meerPaneel === 'start') return <StartPaneel start={heden.start} onStart={(s) => void kiesStart(s)} />
    if (meerPaneel === 'vlak')
      return (
        <VlakPaneel
          schuifCm={Math.round((vlakX - (klaar ? (klaar.doos.min[0] + klaar.doos.max[0]) / 2 : 0)) * 100)}
          onZet={(cm, vast) => {
            const g = geschRef.current
            if (!g || !klaar) return
            const x = (klaar.doos.min[0] + klaar.doos.max[0]) / 2 + cm / 100
            const h: Handeling = { soort: 'spiegel', spiegel: { ...g.heden.spiegel, vlakX: x } }
            if (vast) {
              const van = sleepBegin.current ?? g
              sleepBegin.current = undefined
              zet(doe(van, h))
            } else {
              sleepBegin.current ??= g
              zet({ ...g, heden: doe(sleepBegin.current, h).heden })
            }
          }}
        />
      )
    if (gereedschap === 'snel')
      return (
        <SnelleLakPaneel
          snel={snel}
          voorvulling={voorvulling}
          logo={logoUrl}
          onKleur={(i, k, vast) => {
            const kleuren = [...snel.kleuren] as SnelleLakStand['kleuren']
            kleuren[i] = k
            pasSnel({ ...snel, kleuren }, vast)
          }}
          onStrook={(s) => pasSnel({ ...snel, strook: s, strookGekozen: true }, true)}
          onNaam={(n) => pasSnel({ ...snel, naam: n }, true)}
          onLogo={(f) =>
            void importeer(f).then((b) => {
              if (b) pasSnel({ ...snel, logo: b.id, logoVerhouding: b.verhouding }, true)
            })
          }
          onLogoWeg={() => pasSnel({ ...snel, logo: undefined }, true)}
          onStart={(s) => void kiesStart(s)}
          onVerder={() => {
            zetGereedschap('vullen')
            if (lagen.some((l) => l.id === RECEPT_ID.strook)) {
              zetGereedschap('strook')
              zetGekozen(RECEPT_ID.strook)
            }
          }}
        />
      )
    const laagPaneel = laag ? (
      <LaagPaneel
        laag={laag}
        spiegelAan={spiegelAan}
        analyse={analyse[laag.id]}
        onWijzig={(deel, vast) => (laag.soort === 'tekst' ? wijzigTekst(laag, deel, vast) : wijzigLaag(laag.id, deel, vast))}
        onWeg={() => {
          doeH({ soort: 'weg', id: laag.id })
          zetGekozen(undefined)
        }}
        onDupliceer={() => {
          const id = nieuwId('d')
          doeH({ soort: 'dupliceer', id: laag.id, nieuwId: id })
          zetGekozen(id)
        }}
        onStap={(r) => doeH({ soort: 'verplaats', id: laag.id, naar: lagen.findIndex((l) => l.id === laag.id) + r })}
        onSchuif={() =>
          void handvat?.studio.schuif(laag.id).then((p) => {
            if (p) doeH({ soort: 'wijzig', id: laag.id, deel: { plaats: p } as Partial<Laag> })
          })
        }
      />
    ) : null
    const kleurZetter = (k: string, vast: boolean): void => {
      zetKleur(k)
      if (laag && 'kleur' in laag) wijzigLaag(laag.id, { kleur: k } as Partial<Laag>, vast)
    }
    let gp: JSX.Element | null = null
    if (gereedschap === 'vullen') gp = <VulPaneel kleur={laag?.soort === 'zone' ? laag.kleur : kleur} onKleur={(k) => kleurZetter(k, true)} zones={zoneKleuren} />
    else if (gereedschap === 'strook')
      gp = (
        <StrookPaneel
          laag={laag?.soort === 'strook' ? laag : undefined}
          kleur={kleur}
          onKleur={kleurZetter}
          onNieuw={(s) => {
            if (!busmaat) return
            const l = strook(s, kleur, busmaat, t(`ls.strook.${s}` as TextKey))
            doeH({ soort: 'voegToe', laag: { ...l, uitRecept: undefined } })
            zetGekozen(l.id)
          }}
          onWijzig={(deel, vast) => laag && wijzigLaag(laag.id, deel, vast)}
        />
      )
    else if (gereedschap === 'tekst')
      gp = (
        <TekstPaneel
          laag={laag?.soort === 'tekst' ? laag : undefined}
          lettertypen={windows}
          kleur={kleur}
          klein={texelsKlein}
          vervangen={lettertypeMelding}
          tekstRef={tekstRef}
          onMeer={() => void windowsLettertypen(true).then(zetWindows)}
          onWijzig={(deel, vast) => laag?.soort === 'tekst' && wijzigTekst(laag, deel, vast)}
          onKleur={kleurZetter}
        />
      )
    else if (gereedschap === 'afbeelding')
      gp = (
        <AfbeeldingPaneel
          laag={laag?.soort === 'afbeelding' || laag?.soort === 'vorm' ? laag : undefined}
          kleur={kleur}
          fout={afbFout}
          onBestand={(f) =>
            void importeer(f).then((b) => {
              if (!b || !busmaat) return
              const nieuw: Laag = {
                id: nieuwId('a'),
                naam: t('ls.laag.afbeelding'),
                zichtbaar: true,
                dekking: 1,
                detail: 1,
                soort: 'afbeelding',
                beeld: b.id,
                witDoorzichtig: b.wit,
                verhouding: b.verhouding,
                plaats: plaatsOpZijde(0.8)
              }
              doeH({ soort: 'voegToe', laag: nieuw })
              zetGekozen(nieuw.id)
            })
          }
          onVorm={(v) => {
            if (!busmaat) return
            const nieuw: Laag = { id: nieuwId('v'), naam: t(`ls.vorm.${v}` as TextKey), zichtbaar: true, dekking: 1, detail: 1, soort: 'vorm', vorm: v, kleur, plaats: plaatsOpZijde(0.6) }
            doeH({ soort: 'voegToe', laag: nieuw })
            zetGekozen(nieuw.id)
          }}
          onWijzig={(deel, vast) => laag && wijzigLaag(laag.id, deel, vast)}
          onKleur={kleurZetter}
        />
      )
    else if (gereedschap === 'penseel') gp = <PenseelPaneel stand={penseel} kleur={laag?.soort === 'penseel' ? laag.kleur : kleur} vol={penseelVol} onZet={zetPenseel} onKleur={kleurZetter} />
    return (
      <>
        {gp}
        {laagPaneel}
      </>
    )
  })()

  const knopGereedschap = (g: Exclude<Gereedschap, 'snel'>): JSX.Element => (
    <button
      key={g}
      type="button"
      className={`ls-gereedschap${gereedschap === g ? ' ls-aan' : ''}`}
      aria-pressed={gereedschap === g}
      data-gereedschap={g}
      onClick={() => kiesGereedschap(g)}
    >
      {t(`ls.tool.${g}` as TextKey)}
    </button>
  )

  return (
    <div className="ls-venster setup" data-gereedschap={gereedschap}>
      <header className="ls-kop">
        <div className="ls-kop-rij">
          <h1 className="ls-titel">{titel}</h1>
          <div className="ls-gereedschappen" role="toolbar" aria-label={t('ls.titel')}>
            {(['vullen', 'strook', 'tekst', 'afbeelding', 'penseel'] as const).map(knopGereedschap)}
            <button
              type="button"
              className={`ls-gereedschap ls-spiegel${spiegelAan ? ' ls-aan' : ''}`}
              aria-pressed={spiegelAan}
              data-knop="spiegel"
              onClick={() => heden && doeH({ soort: 'spiegel', spiegel: { ...heden.spiegel, aan: !spiegelAan } })}
            >
              {t('ls.spiegel')} <span aria-hidden="true">{spiegelAan ? '●' : '○'}</span>
            </button>
          </div>
          <div className="ls-geschiedenis">
            <button type="button" className="ls-knop" title={t('ls.ongedaan')} aria-label={t('ls.ongedaan')} disabled={!gesch?.verleden.length} onClick={() => stapGeschiedenis(true)}>
              ↶
            </button>
            <button type="button" className="ls-knop" title={t('ls.opnieuw')} aria-label={t('ls.opnieuw')} disabled={!gesch?.toekomst.length} onClick={() => stapGeschiedenis(false)}>
              ↷
            </button>
          </div>
          <div className="ls-meer">
            <button type="button" className="ls-knop" aria-expanded={meer} data-knop="meer" onClick={() => zetMeer((m) => !m)}>
              {t('ls.meer')} ▾
            </button>
            {meer ? (
              <div className="ls-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => (zetMeerPaneel('opties'), zetMeer(false))}>
                  {t('ls.meer.opties')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    zetMeer(false)
                    zetMeerPaneel(undefined)
                    zetGereedschap('snel')
                  }}
                >
                  {t('ls.meer.snel')}
                </button>
                <button type="button" role="menuitem" onClick={() => (zetMeerPaneel('start'), zetMeer(false))}>
                  {t('ls.meer.start')}
                </button>
                <button type="button" role="menuitem" onClick={() => (zetMeerPaneel('vlak'), zetMeer(false))}>
                  {t('ls.meer.vlak')}
                </button>
                <button type="button" role="menuitem" disabled>
                  {t('ls.meer.ontwerp')}
                </button>
                <button type="button" role="menuitem" disabled={!heden?.geplaatst} onClick={() => void verwijderUitOmsi()}>
                  {t('ls.meer.verwijder')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="ls-kop-rij ls-opslaanrij">
          <label className="ls-naamveld">
            <span>{t('ls.naam')}</span>
            <input
              className="ls-invoer"
              name="lakNaam"
              value={naam}
              maxLength={48}
              // Opnieuw opslaan houdt de naam (§5.2): een andere naam is een nieuwe kleurstelling.
              readOnly={Boolean(heden?.geplaatst)}
              aria-invalid={Boolean(naamFout)}
              onChange={(e) => {
                naamVolgt.current = false
                zetNaam(e.target.value)
              }}
              onKeyDown={(e) => e.key === 'Enter' && !bezig && !naamFout && klaar && void opslaan()}
            />
          </label>
          <button type="button" className="ls-hoofdknop" data-knop="opslaan" disabled={Boolean(bezig) || Boolean(naamFout) || !klaar} onClick={() => void opslaan()}>
            {opslaanTekst}
          </button>
          {naamFout ? <span className="ls-naamfout">{naamFout}</span> : null}
          {stand.licht ? <span className="ls-zacht">{t('ls.omsiOpen')}</span> : null}
          {ookOp.length ? (
            <span className="ls-zacht ls-ookop">
              {t('ls.ookOp', { bussen: ookOp.join(', ') })}
              {bestuurbareLeden.map((l) => (
                <button
                  key={l.bus}
                  type="button"
                  className="ls-link"
                  onClick={() => {
                    gestartVoor.current = ''
                    zetBekijkPad(bekijkPad === l.bus ? undefined : l.bus)
                  }}
                >
                  {t('ls.bekijk')} {l.bus.split('\\').pop()!.replace(/\.bus$/i, '')}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </header>

      <aside className="ls-links">
        <LagenLijst
          lagen={lagen}
          gekozen={gekozen}
          basis={basisNaam}
          onKies={(id) => {
            zetGekozen(id)
            const l = lagen.find((x) => x.id === id)
            if (l) zetGereedschap(l.soort === 'zone' ? 'vullen' : l.soort === 'strook' ? 'strook' : l.soort === 'tekst' ? 'tekst' : l.soort === 'penseel' ? 'penseel' : 'afbeelding')
            zetMeerPaneel(undefined)
          }}
          onZichtbaar={(id, aan) => doeH({ soort: 'wijzig', id, deel: { zichtbaar: aan } })}
          onVerplaats={(id, naar) => doeH({ soort: 'verplaats', id, naar })}
        />
      </aside>

      <main className="ls-midden" ref={beeldRef}>
        <BusViewer
          relatiefPad={viewPad}
          kleurstelling={kleurstelling}
          naam={vraag.titel}
          foto={viewPad === pad ? vraag.foto : undefined}
          vorm={vraag.vorm}
          licht={stand.licht}
          pauze={stand.pauze}
          autoFocus
          onStand={opStand}
          onManifest={zetManifest}
          onGetoond={() => {
            brug.getoond()
            document.getElementById('bv-voorlopig')?.remove()
          }}
          onHandvat={(h) => {
            zetHandvat(h)
          }}
          studio={bediening}
        />
        <ViewerCamera handvat={handvat} onCamera={zetCam} />
        <svg className="ls-overlay" width={maat.b} height={maat.h} aria-hidden="true">
          {/* De snijlijn van het spiegelvlak, bij het verstellen van het vlak (de doos is ruimer dan de bus: altijd getoond zweefde hij). */}
          {geo.vlak && spiegelAan && meerPaneel === 'vlak' ? <polyline className="ls-vlak" points={geo.vlak.map((p) => p.join(',')).join(' ')} /> : null}
          {geo.decals
            .filter((d) => d.id === gekozen)
            .map((d, i) => (
              <polygon key={i} className={`ls-kader${d.kopie ? ' ls-kopie' : ''}`} points={d.hoeken.map((p) => p.join(',')).join(' ')} />
            ))}
          {geo.hoek ? <circle className="ls-hoekhandvat" cx={geo.hoek.p[0]} cy={geo.hoek.p[1]} r={6} /> : null}
          {sleep?.soort === 'strook'
            ? geo.gidsen.map((g) => (
                <g key={g.naam}>
                  <line className="ls-gids" x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} />
                  <text className="ls-gidsnaam" x={g.a[0] + 6} y={g.a[1] - 4}>
                    {g.naam}
                  </text>
                </g>
              ))
            : null}
          {geo.strook?.lijnen.map((l) => (
            <g key={l.rand} data-rand={l.rand}>
              <line className="ls-rand" x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} />
              <rect className="ls-randhandvat" x={(l.a[0] + l.b[0]) / 2 - 14} y={(l.a[1] + l.b[1]) / 2 - 4} width={28} height={8} rx={4} />
            </g>
          ))}
        </svg>
        {toonTweede ? (
          <figure className="ls-tweede" aria-label={t('ls.spiegel.anderKant')}>
            <canvas ref={tweedeDoek} />
            {camTweede && laag && 'plaats' in laag ? <TweedeKader cam={camTweede} laag={laag} vlakX={vlakX} kopie={analyse[laag.id]?.kopie !== false} /> : null}
            <figcaption>{t('ls.spiegel.anderKant')}</figcaption>
          </figure>
        ) : null}
        {tip ? (
          <div className="ls-tip" role="status" data-tip={tip.tekst}>
            <span>{tip.tekst}</span>
            {tip.knop ? (
              <button type="button" className="ls-link" data-knop="tip" onClick={() => (tip.knop!.doe(), zetTip(undefined))}>
                {tip.knop.tekst}
              </button>
            ) : null}
            <button type="button" className="ls-sluitje" aria-label={t('ls.sluiten')} onClick={() => zetTip(undefined)}>
              ×
            </button>
          </div>
        ) : null}
        {!klaar && !klaarFout ? <div className="ls-laden">{t('ls.laden')}</div> : null}
        {klaarFout ? <div className="ls-laden ls-fout">{klaarFout}</div> : null}
        {bezig ? (
          <div className="ls-bezig" role="status" data-bezig={bezig}>
            {bezig}
          </div>
        ) : null}
        {uitkomst ? (
          <div className={`ls-uitkomst ls-${uitkomst.soort}`} role="status" data-uitkomst={uitkomst.soort}>
            <p>{uitkomst.tekst}</p>
            <div className="ls-rij">
              {uitkomst.handmatig ? (
                <>
                  <button type="button" className="ls-knop" onClick={() => void opslaan('weggooien')}>
                    {t('ls.handmatig.weggooien')}
                  </button>
                  <button type="button" className="ls-knop" onClick={alsNieuwe}>
                    {t('ls.handmatig.nieuw')}
                  </button>
                  <button type="button" className="ls-knop" onClick={() => zetUitkomst(undefined)}>
                    {t('ls.annuleren')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="ls-knop" data-knop="verderAanpassen" onClick={() => zetUitkomst(undefined)}>
                    {t('ls.verderAanpassen')}
                  </button>
                  {uitkomst.soort === 'ok' || uitkomst.soort === 'klaargezet' ? (
                    <button type="button" className="ls-knop" data-knop="terug" onClick={() => void brug.terugUitStudio(naam)}>
                      {t('ls.terug')}
                    </button>
                  ) : null}
                  <button type="button" className="ls-knop" data-knop="sluiten" onClick={() => brug.sluit()}>
                    {t('ls.sluiten')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </main>

      <aside className="ls-rechts">
        <div className="ls-paneelkop">
          <button type="button" className={`ls-tab${gereedschap === 'snel' && !meerPaneel ? ' ls-aan' : ''}`} onClick={() => (zetGereedschap('snel'), zetMeerPaneel(undefined))}>
            {t('ls.snel.titel')}
          </button>
          <span aria-hidden="true">⇄</span>
          <button
            type="button"
            className={`ls-tab${gereedschap !== 'snel' || meerPaneel ? ' ls-aan' : ''}`}
            onClick={() => (gereedschap === 'snel' ? zetGereedschap('vullen') : undefined, zetMeerPaneel(undefined))}
          >
            {t('ls.kleur.titel')}
          </button>
        </div>
        {lichtHerstart ? <p className="ls-melding">{t('ls.dev.herstart')}</p> : null}
        {klaar?.licht ? <p className="ls-zacht">{t('ls.licht')}</p> : null}
        {familie?.nietOp.map((n) => (
          <p key={n.bus} className="ls-melding">
            {t('ls.nietOp', { bus: n.bus.split('\\').pop() ?? n.bus, reden: n.reden })}
          </p>
        ))}
        {paneel}
      </aside>

      <footer className="ls-voet">
        <div className="ls-zichten" role="group">
          {(
            [
              ['links', 'ls.zicht.links'],
              ['rechts', 'ls.zicht.rechts'],
              ['voorvlak', 'ls.zicht.voor'],
              ['achtervlak', 'ls.zicht.achter'],
              ['dak', 'ls.zicht.dak'],
              ['schuin', 'ls.zicht.schuin']
            ] as const
          ).map(([s, k]) => (
            <button key={s} type="button" className="ls-knop" data-zicht={s} onClick={() => handvat?.invoer({ soort: 'stand', stand: s })}>
              {t(k)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`ls-knop${voorNa ? ' ls-aan' : ''}`}
          data-knop="voorna"
          title={t('ls.voorna.uitleg')}
          onPointerDown={() => zetVoorNaAan(true)}
          onPointerUp={() => zetVoorNaAan(false)}
          onPointerLeave={() => voorNa && zetVoorNaAan(false)}
        >
          {t('ls.voorna')}
        </button>
        <span className="ls-knop ls-dag">{t('ls.dag')}</span>
        <span className="ls-status" data-status="">
          {eersteDoel ? t('ls.status', { b: eersteDoel.b, h: eersteDoel.h, texels: eersteDoel.texelsPerM }) : '…'}
          {' · '}
          {t('ls.status.ookOp', { bussen: ookOp.length ? ookOp.join(', ') : '–' })}
        </span>
      </footer>
    </div>
  )
}

/** De camera van de gewone viewer: de werker stuurt hem bij elk beeld mee. */
function ViewerCamera({ handvat, onCamera }: { handvat?: ViewerHandvat; onCamera: (c: Float32Array) => void }): null {
  useEffect(() => {
    if (!handvat) return
    return Verbinding.get().luisterCamera(handvat.id, onCamera)
  }, [handvat, onCamera])
  return null
}

/** Het kader van de kopie in het beeld van de andere kant: de tweede cursor (§1, "Spiegelen"). */
function TweedeKader({ cam, laag, vlakX, kopie }: { cam: Float32Array; laag: Laag; vlakX: number; kopie: boolean }): JSX.Element | null {
  if (!('plaats' in laag)) return null
  const s = spiegelPlaats(laag.plaats, vlakX)
  const m = decalMaat(laag)
  if (!s || !m || !kopie) return null
  const pts = decalHoeken(s.plaats, m.b, m.h).map((p) => naarScherm(cam, p, 320, 180))
  if (!pts.every(Boolean)) return null
  return (
    <svg className="ls-tweedekader" viewBox="0 0 320 180" aria-hidden="true">
      <polygon points={pts.map((p) => `${p!.x},${p!.y}`).join(' ')} />
    </svg>
  )
}
