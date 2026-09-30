import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import {
  beschrijvingVoor,
  type Bus3dKleurlijst,
  type Bus3dManifest,
  type Bus3dStalen,
  type Bus3dVensterInstellingen,
  type Bus3dVensterStand,
  type Bus3dVensterVraag
} from '../../../shared/bus3d'
import { useLanguage, useT } from '../language'
import { BusViewer, type ViewerStand } from '../BusViewer'
import { Ontwikkelpaneel } from './lak/Ontwikkelpaneel'
import type { ViewerHandvat } from './verbinding'

/**
 * HET 3D-VENSTER: VIEWER PLUS ZIJPANEEL (bus3d-ontwerp §8.1, §8.2)
 *
 * Links de viewer (Buiten, §5.6), rechts het zijpaneel: merk, type en
 * uitvoering, de kleurstellingen met stalen (boven twaalf een zoekveld), de
 * beschrijving, de maat, en onderaan [Kiezen] en [Sluiten]. In de dealer- en
 * wagenparkstand heet de knop [Deze kleurstelling]; het venster komt daar nooit
 * aan geld (F4 sluit het scherm erachter aan).
 *
 * BEKIJKEN IS NIET KIEZEN. Een klik op een rij zet die kleurstelling in beeld;
 * met de muis erover wisselt het beeld na 150 ms rust, en terug bij weggaan.
 * Kiezen is [Kiezen], Enter in de lijst of in het beeld, of een dubbelklik op
 * een rij: gekozen wordt wat in beeld is. Main toetst de keuze en zet hem in
 * het hoofdvenster zoals een klik op die tegel (main/bus3dvenster.ts).
 */

interface Props {
  vraag: Bus3dVensterVraag
  instellingen: Bus3dVensterInstellingen
  stand: Bus3dVensterStand
}

/** Standaard heet in de dataset van de proef leeg. */
const kleurInViewerVoorProef = (kleur: string | undefined): string => kleur ?? ''

/** Vanaf zoveel kleurstellingen een zoekveld (§7). */
const ZOEKEN_VANAF = 12
/** Zo lang rust voordat het beeld bij zweven of pijltjes wisselt (§7). */
const RUST_MS = 150

export function Bus3dVenster({ vraag, instellingen, stand }: Props): JSX.Element {
  const t = useT()
  const taal = useLanguage()
  const brug = window.bus3d!
  const pad = vraag.relatiefPad
  /*
   * Wat bij één bus of één vraag hoort, draagt die bus of vraag mee en geldt
   * alleen zolang hij klopt. Eerst werd het pas in een effect teruggezet: bij een
   * andere bus in een open venster liepen de stalen dan meteen (met de lijst en
   * "scherp" van de vorige bus), en vroeg de viewer eerst de nieuwe bus in de
   * kleurstelling van de vorige: het eerste 3D-beeld werd twee keer zo traag
   * (aanvalsverslag F2, punt 5).
   */
  const [lijstVan, zetLijstVan] = useState<{ pad: string; lijst: Bus3dKleurlijst | null }>()
  const lijst = lijstVan && lijstVan.pad === pad ? lijstVan.lijst : undefined
  const [stalenVan, zetStalenVan] = useState<{ pad: string; stalen: Bus3dStalen }>({ pad, stalen: {} })
  const stalen = stalenVan.pad === pad ? stalenVan.stalen : {}
  const [inBeeldVan, zetInBeeldVan] = useState<{ aanvraag: number; kleur: string | undefined }>({ aanvraag: vraag.aanvraag, kleur: vraag.kleurstelling })
  const inBeeld = inBeeldVan.aanvraag === vraag.aanvraag ? inBeeldVan.kleur : vraag.kleurstelling
  const zetInBeeld = (kleur: string | undefined): void => zetInBeeldVan({ aanvraag: vraag.aanvraag, kleur })
  const [zweefVan, zetZweefVan] = useState<{ aanvraag: number; kleur: string | undefined | null }>({ aanvraag: vraag.aanvraag, kleur: null })
  const zweef = zweefVan.aanvraag === vraag.aanvraag ? zweefVan.kleur : null
  const zetZweef = (kleur: string | undefined | null): void => zetZweefVan({ aanvraag: vraag.aanvraag, kleur })
  const [zoek, zetZoek] = useState('')
  const [manifest, zetManifest] = useState<Bus3dManifest>()
  const [meer, zetMeer] = useState(false)
  const [hervat, zetHervat] = useState(false)
  const [scherpVoor, zetScherpVoor] = useState<string>()
  /** De viewer zelf, voor het lakdoek (Lakstudio). */
  const [handvat, zetHandvat] = useState<ViewerHandvat>()
  const scherp = scherpVoor === pad
  const zoekRef = useRef<HTMLInputElement>(null)
  const lijstRef = useRef<HTMLUListElement>(null)
  const zweefKlok = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const padRef = useRef(pad)
  padRef.current = pad

  // Af te lezen voor de proef: welke vraag er staat en wanneer hij kwam, en wat in beeld is.
  useEffect(() => {
    const d = document.documentElement.dataset
    d.bus = pad
    d.doel = vraag.doel
    d.aanvraag = String(vraag.aanvraag)
    d.vraagMs = String(Math.round(performance.now()))
  }, [pad, vraag.aanvraag, vraag.doel])
  useEffect(() => {
    document.documentElement.dataset.inBeeld = kleurInViewerVoorProef(inBeeld)
  })

  // Een nieuwe vraag in hetzelfde venster: de kleurstelling van die vraag staat al in beeld (zie boven); het zoekveld leeg.
  useEffect(() => {
    if (zweefKlok.current) clearTimeout(zweefKlok.current)
    zweefKlok.current = undefined
    zetZoek('')
  }, [vraag.aanvraag, vraag.kleurstelling])
  /*
   * Een andere bus: de lijst, het manifest en de rest van de vorige weg. Niet
   * bij dezelfde bus in een andere kleurstelling: dan laadt de viewer alleen de
   * lak en komt er geen nieuw manifest (de beschrijving viel dan weg).
   */
  useEffect(() => {
    zetManifest(undefined)
    zetMeer(false)
    let geldig = true
    void brug.busKleurstellingen(pad).then(
      (l) => geldig && zetLijstVan({ pad, lijst: l ?? null }),
      () => geldig && zetLijstVan({ pad, lijst: null })
    )
    return () => {
      geldig = false
    }
  }, [brug, pad])

  // De stalen: pas als het 3D-beeld staat (of na 1,5 s), want ze delen de werker met het pakket.
  const vulStalen = useCallback((bus: string, deel: Bus3dStalen) => {
    zetStalenVan((oud) => ({ pad: bus, stalen: oud.pad === bus ? { ...oud.stalen, ...deel } : { ...deel } }))
  }, [])
  useEffect(() => {
    let geldig = true
    const weg = brug.opKleurstalen((bus, deel) => {
      if (geldig && bus === pad) vulStalen(bus, deel)
    })
    return () => {
      geldig = false
      weg()
    }
  }, [brug, pad, vulStalen])
  const stalenGevraagd = useRef('')
  const vraagStalen = useCallback(() => {
    if (stalenGevraagd.current === pad) return
    stalenGevraagd.current = pad
    void brug.busKleurstalen(pad).then((s) => vulStalen(pad, s), () => undefined)
  }, [brug, pad, vulStalen])
  useEffect(() => {
    if (!lijst || lijst.lijst.length === 0) return
    if (scherp) return vraagStalen()
    const klok = setTimeout(vraagStalen, 1500)
    return () => clearTimeout(klok)
  }, [lijst, scherp, vraagStalen])

  // Het doel en de titel (§8.1, G7).
  const naam = vraag.naam ?? (manifest ? [manifest.naam[0], manifest.naam[1], ''] : ['', vraag.titel, ''])
  const kort = vraag.titel || naam.filter(Boolean).join(' ')
  const titel =
    vraag.doel === 'dealer'
      ? t('bv.dealerTitle', { naam: kort })
      : vraag.doel === 'wagenpark' && vraag.vloot
        ? t('bv.fleetTitle', { nr: vraag.vloot.nummer, naam: kort })
        : t('bv.windowTitle', { naam: kort })
  useEffect(() => {
    document.title = titel
  }, [titel])

  // De lijst: alfabetisch zoals OMSI ze toont, gefilterd op het zoekveld.
  const namen = useMemo(
    () => (lijst?.lijst ?? []).map((k) => k.naam).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [lijst]
  )
  const zoekLaag = zoek.trim().toLocaleLowerCase()
  const zichtbaar = useMemo(
    () => (zoekLaag ? namen.filter((n) => n.toLocaleLowerCase().includes(zoekLaag)) : namen),
    [namen, zoekLaag]
  )
  /** De rijen in volgorde: Standaard bovenaan (undefined), dan de treffers. */
  const rijen: Array<string | undefined> = useMemo(() => (zoekLaag ? zichtbaar : [undefined, ...zichtbaar]), [zichtbaar, zoekLaag])

  const kleurInViewer = zweef === null ? inBeeld : zweef
  const gekozen = vraag.gekozen ?? undefined

  const kies = useCallback(
    (kleur: string | undefined) => {
      brug.kies({ aanvraag: vraag.aanvraag, doel: vraag.doel, relatiefPad: pad, kleurstelling: kleur })
    },
    [brug, pad, vraag.aanvraag, vraag.doel]
  )

  const zetMetRust = (kleur: string | undefined | null): void => {
    if (zweefKlok.current) clearTimeout(zweefKlok.current)
    zweefKlok.current = setTimeout(() => zetZweef(kleur), RUST_MS)
  }

  // ------------------------------------------------------------ toetsen van het venster (§8.1)
  useEffect(() => {
    const toets = (e: globalThis.KeyboardEvent): void => {
      const doel = e.target as HTMLElement | null
      if (e.key === 'Escape') {
        e.preventDefault()
        if (zoekRef.current && zoekRef.current.value) {
          zetZoek('')
          return
        }
        if (document.fullscreenElement) {
          void document.exitFullscreen()
          return
        }
        brug.sluit()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        brug.sluit()
      } else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && doel?.tagName !== 'INPUT')) {
        if (!zoekRef.current) return
        e.preventDefault()
        zoekRef.current.focus()
        zoekRef.current.select()
      } else if (e.key === 'F11') {
        e.preventDefault()
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [brug])

  const [focusRij, zetFocusRij] = useState(0)
  const lijstToets = (e: KeyboardEvent<HTMLUListElement>): void => {
    // Vanaf de aangewezen rij, niet vanaf die in beeld: die volgt pas na 150 ms rust.
    const i = focusRij < rijen.length ? focusRij : rijen.indexOf(inBeeld)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const j = Math.max(0, Math.min(rijen.length - 1, (i < 0 ? -1 : i) + (e.key === 'ArrowDown' ? 1 : -1)))
      const kleur = rijen[j]
      // Het vakje meteen, het beeld na 150 ms rust.
      zetZweef(null)
      if (zweefKlok.current) clearTimeout(zweefKlok.current)
      zweefKlok.current = setTimeout(() => zetInBeeld(kleur), RUST_MS)
      zetFocusRij(j)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Wat er aangewezen is: na een pijltje staat het beeld pas na 150 ms, de keuze meteen.
      kies(focusRij < rijen.length ? rijen[focusRij] : inBeeld)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const j = e.key === 'Home' ? 0 : rijen.length - 1
      zetFocusRij(j)
      zetInBeeld(rijen[j])
    }
  }
  useEffect(() => {
    const i = rijen.indexOf(inBeeld)
    if (i >= 0) zetFocusRij(i)
  }, [rijen, inBeeld])
  useEffect(() => {
    lijstRef.current?.querySelector<HTMLElement>(`[data-rij="${focusRij}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focusRij])

  const zoekToets = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // De eerste treffer in beeld.
      if (zichtbaar.length > 0) zetInBeeld(zichtbaar[0])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      lijstRef.current?.focus()
    }
  }

  // ------------------------------------------------------------ pauze en lichte stand (§9)
  useEffect(() => {
    // Een nieuwe pauze van main geldt weer, ook na [Hervatten].
    zetHervat(false)
  }, [stand.pauze, stand.reden])
  const pauze = stand.pauze && !hervat
  const rustig = instellingen.rustig || matchMedia('(prefers-reduced-motion: reduce)').matches
  const plateau = vraag.doel === 'dealer' && !rustig && !stand.licht

  const opStand = useCallback((s: ViewerStand) => {
    if (s.fase === 'scherp') zetScherpVoor(padRef.current)
  }, [])

  // ------------------------------------------------------------ gegevens
  const beschrijving = manifest ? beschrijvingVoor(manifest, taal, 600) : undefined
  const volledig = manifest ? beschrijvingVoor(manifest, taal, 100_000) : undefined
  const maat = manifest
    ? {
        breedte: manifest.doos.max[0] - manifest.doos.min[0],
        hoogte: manifest.doos.max[1] - manifest.doos.min[1],
        lengte: manifest.doos.max[2] - manifest.doos.min[2]
      }
    : undefined
  const getal = (n: number): string => n.toLocaleString(taal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const knopTekst = vraag.doel === 'buskeuze' ? t('bv.pick') : t('bv.pickDealer')

  const staal = (kleur: string | undefined): JSX.Element => {
    const s = kleur ? stalen[kleur] : undefined
    return (
      <span className={`bv-staal${s ? '' : ' bv-staal-leeg'}`} aria-hidden="true">
        {s ? (
          <>
            <i style={{ background: s[0], flexGrow: 6 }} />
            <i style={{ background: s[1], flexGrow: 3 }} />
            <i style={{ background: s[2], flexGrow: 2 }} />
          </>
        ) : null}
      </span>
    )
  }

  return (
    <div className="bv-venster setup">
      <div className="bv-beeld">
        <BusViewer
          relatiefPad={pad}
          kleurstelling={kleurInViewer}
          naam={kort}
          foto={vraag.foto}
          vorm={vraag.vorm}
          licht={stand.licht}
          pauze={pauze}
          plateau={plateau}
          autoFocus
          onStand={opStand}
          onManifest={zetManifest}
          onGetoond={() => {
            brug.getoond()
            // Het voorlopige plaatje van de ingang (venster.tsx) is nu overbodig.
            document.getElementById('bv-voorlopig')?.remove()
          }}
          onHervat={() => zetHervat(true)}
          onKies={() => kies(inBeeld)}
          onHandvat={zetHandvat}
        />
      </div>
      <aside className="bv-paneel" aria-label={titel}>
        <header className="bv-kop">
          {naam[0] ? <span className="bv-merk">{naam[0]}</span> : null}
          <h1 className="bv-type">{naam[1] || kort}</h1>
          {naam[2] ? <span className="bv-uitvoering">{naam[2]}</span> : null}
          {vraag.vloot?.kenteken ? <span className="bv-uitvoering">{vraag.vloot.kenteken}</span> : null}
        </header>

        {vraag.doel === 'lakstudio' ? (
          <Ontwikkelpaneel
            pad={pad}
            handvat={handvat}
            projectId={vraag.lak?.projectId}
            bedrijf={vraag.lak?.bedrijf?.naam}
            licht={stand.licht}
            klaarVoorLak={scherp}
          />
        ) : null}

        <section className="bv-blok bv-kleuren" hidden={vraag.doel === 'lakstudio'}>
          <h2 className="bv-blokkop">{t('bv.schemes')}</h2>
          {lijst === undefined ? (
            <p className="bv-zacht">…</p>
          ) : !lijst || lijst.lijst.length === 0 ? (
            <p className="bv-zacht">{t('bv.noSchemes')}</p>
          ) : (
            <>
              {namen.length > ZOEKEN_VANAF ? (
                <input
                  ref={zoekRef}
                  className="bv-zoek"
                  type="search"
                  value={zoek}
                  placeholder={t('bv.search')}
                  aria-label={t('bv.search')}
                  onChange={(e) => zetZoek(e.target.value)}
                  onKeyDown={zoekToets}
                />
              ) : null}
              <ul
                ref={lijstRef}
                className="bv-lijst"
                role="listbox"
                tabIndex={0}
                aria-label={t('bv.schemes')}
                aria-activedescendant={`bv-rij-${focusRij}`}
                onKeyDown={lijstToets}
                onMouseLeave={() => zetMetRust(null)}
              >
                {rijen.map((kleur, i) => {
                  const isInBeeld = kleur === inBeeld
                  // undefined: deze bus is niet de gekozen bus, dan geen vinkje; null: Standaard.
                  const isGekozen = vraag.gekozen !== undefined && kleur === gekozen
                  return (
                    <li
                      key={kleur ?? '__standaard'}
                      id={`bv-rij-${i}`}
                      data-rij={i}
                      role="option"
                      aria-selected={isInBeeld}
                      className={`bv-rij${isInBeeld ? ' bv-rij-inbeeld' : ''}${i === focusRij ? ' bv-rij-focus' : ''}`}
                      onClick={() => {
                        zetZweef(null)
                        if (zweefKlok.current) clearTimeout(zweefKlok.current)
                        zetInBeeld(kleur)
                        zetFocusRij(i)
                      }}
                      onDoubleClick={() => kies(kleur)}
                      onMouseEnter={() => zetMetRust(kleur)}
                    >
                      {staal(kleur)}
                      <span className="bv-rijnaam">{kleur ?? t('bv.standard')}</span>
                      {isGekozen ? <span className="bv-gekozen">✓ {t('bv.chosen')}</span> : null}
                    </li>
                  )
                })}
              </ul>
              {zoekLaag && zichtbaar.length === 0 ? <p className="bv-zacht">{t('bv.noHits', { zoek: zoek.trim() })}</p> : null}
            </>
          )}
        </section>

        {beschrijving ? (
          <section className="bv-blok">
            <h2 className="bv-blokkop">{t('bv.description')}</h2>
            <p className="bv-tekst">
              {meer ? volledig : beschrijving}{' '}
              {volledig && volledig.length > (beschrijving?.length ?? 0) ? (
                <button type="button" className="bv-link" onClick={() => zetMeer((m) => !m)}>
                  {meer ? t('bv.less') : t('bv.more')}
                </button>
              ) : null}
            </p>
          </section>
        ) : null}

        {maat ? (
          <section className="bv-blok">
            <h2 className="bv-blokkop">{t('bv.facts')}</h2>
            <p className="bv-tekst">
              {t('bv.size', { lengte: getal(maat.lengte), breedte: getal(maat.breedte), hoogte: getal(maat.hoogte) })}
              <br />
              {manifest && manifest.delen.length > 1 ? t('bv.articulated') : t('bv.rigid')}
              {namen.length > 0 ? (
                <>
                  {' · '}
                  {namen.length === 1 ? t('bv.schemeCountOne') : t('bv.schemeCount', { n: namen.length })}
                </>
              ) : null}
            </p>
          </section>
        ) : null}

        <footer className="bv-voet">
          <button type="button" className="bv-hoofdknop" onClick={() => kies(inBeeld)}>
            {knopTekst}
          </button>
          <button type="button" className="bv-tweedeknop" onClick={() => brug.sluit()}>
            {t('bv.close')}
          </button>
        </footer>
      </aside>
    </div>
  )
}
