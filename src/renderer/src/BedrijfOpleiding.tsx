import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  NIVEAUS,
  OPLEIDINGEN,
  niveauVan,
  opleidingBezig,
  opleidingKlaar,
  type Bedrijf as BedrijfStaat,
  type OpleidingId,
  type Voordeel
} from '../../core/bedrijf'
import type { CareerPayload } from '../../shared/api'
import { formatMoney } from '../../shared/format'
import type { TextKey } from '../../shared/i18n'
import { useLanguage, useT } from './language'

type Handel = (doen: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>) => Promise<void>

/*
 * Stap 4 van het busbedrijf: niveaus, opleidingen en de werkplaats zelf.
 *
 * Het bedrijf groeit door te rijden en te verdienen (ervaringspunten, zie
 * core/bedrijf.ts), en elk niveau geeft een voordeel. De eigenaar -- jij --
 * kan opleidingen volgen die taken vrijspelen, zoals in de Bus Company
 * Simulator: zelf onderhoud doen en zelf schade herstellen, met een minigame.
 */

const VOORDEEL_TEKST: Record<Voordeel, TextKey> = {
  extraSollicitant: 'bd.perk.extraSollicitant',
  extraTweedehands: 'bd.perk.extraTweedehands',
  goedkoperInschrijven: 'bd.perk.goedkoperInschrijven',
  hogereVergoeding: 'bd.perk.hogereVergoeding',
  goedkoperOnderhoud: 'bd.perk.goedkoperOnderhoud',
  nogHogereVergoeding: 'bd.perk.nogHogereVergoeding'
}

const OPLEIDING_TEKST: Record<OpleidingId, { naam: TextKey; uitleg: TextKey }> = {
  werkplaats: { naam: 'bd.course.werkplaats', uitleg: 'bd.course.werkplaatsText' },
  schadeherstel: { naam: 'bd.course.schadeherstel', uitleg: 'bd.course.schadeherstelText' },
  planner: { naam: 'bd.course.planner', uitleg: 'bd.course.plannerText' },
  instructeur: { naam: 'bd.course.instructeur', uitleg: 'bd.course.instructeurText' },
  onderhandelen: { naam: 'bd.course.onderhandelen', uitleg: 'bd.course.onderhandelenText' }
}

/** Hoe ver je bent naar het volgende niveau, 0 tot 1; 1 op het hoogste niveau. */
export function niveauVoortgang(bedrijf: BedrijfStaat): { niveau: number; deel: number; nodig?: number } {
  const niveau = niveauVan(bedrijf)
  const xp = bedrijf.xp ?? 0
  const volgende = NIVEAUS[niveau]
  if (!volgende) return { niveau, deel: 1 }
  const vorige = NIVEAUS[niveau - 1].xp
  return { niveau, deel: (xp - vorige) / (volgende.xp - vorige), nodig: volgende.xp - xp }
}

export function Opleidingen({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = (c: number): string => formatMoney(c / 100, taal)
  const { niveau, deel, nodig } = niveauVoortgang(bedrijf)
  const [bezig, setBezig] = useState(false)

  return (
    <div className="bd-kolom">
      <section className="bd-paneel bd-niveau">
        <div className="bd-niveaukop">
          <span className="bd-niveaugetal">{niveau}</span>
          <span>
            <b>{tr('bd.levelN', { n: niveau })}</b>
            <small>
              {nodig !== undefined
                ? tr('bd.levelNext', { xp: Math.round(bedrijf.xp ?? 0), need: nodig })
                : tr('bd.levelMax', { xp: Math.round(bedrijf.xp ?? 0) })}
            </small>
            <span className="bd-meter">
              <i style={{ width: `${Math.round(deel * 100)}%` }} />
            </span>
          </span>
        </div>
        <p className="bd-rustig bd-klein">{tr('bd.levelHow')}</p>
        <ul className="bd-voordelen">
          {NIVEAUS.map((n, i) =>
            n.voordeel ? (
              <li key={n.voordeel} className={niveau >= i + 1 ? 'aan' : ''}>
                <span className="bd-nummer">{i + 1}</span>
                <span>{tr(VOORDEEL_TEKST[n.voordeel])}</span>
                <small>{niveau >= i + 1 ? tr('bd.unlocked') : tr('bd.fromXp', { xp: n.xp })}</small>
              </li>
            ) : null
          )}
        </ul>
      </section>

      <section className="bd-paneel">
        <div className="bd-paneelkop">
          <h2>{tr('bd.courses')}</h2>
        </div>
        <div className="bd-aanbod">
          {(Object.keys(OPLEIDINGEN) as OpleidingId[]).map((id) => {
            const o = OPLEIDINGEN[id]
            const klaar = opleidingKlaar(bedrijf, id)
            const tot = opleidingBezig(bedrijf, id)
            const opslot = niveau < o.niveau
            return (
              <article key={id} className={`bd-kaart ${klaar ? 'klaar' : ''}`}>
                <span className="bd-vorm">{tr('bd.fromLevel', { n: o.niveau })}</span>
                <b>{tr(OPLEIDING_TEKST[id].naam)}</b>
                <small>{tr(OPLEIDING_TEKST[id].uitleg)}</small>
                <span className="bd-prijs">
                  {geld(o.kosten)}
                  <small> · {tr('bd.days', { n: o.dagen })}</small>
                </span>
                {klaar ? (
                  <span className="bd-eigen">{tr('bd.courseDone')}</span>
                ) : tot !== undefined ? (
                  <span className="bd-status let">{tr('bd.courseUntil', { day: tot })}</span>
                ) : (
                  <button
                    type="button"
                    className="bd-knop hoofd"
                    disabled={bezig || opslot || bedrijf.kas < o.kosten}
                    title={opslot ? tr('bd.needLevel', { n: o.niveau }) : undefined}
                    onClick={() => {
                      setBezig(true)
                      void handel(window.career.bedrijfOpleiding(id)).finally(() => setBezig(false))
                    }}
                  >
                    {opslot ? tr('bd.needLevel', { n: o.niveau }) : tr('bd.startCourse')}
                  </button>
                )}
              </article>
            )
          })}
        </div>
        <p className="bd-rustig bd-klein">{tr('bd.trainingHint')}</p>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* De minigames van de werkplaats                                      */
/* ------------------------------------------------------------------ */

const ONDERDELEN: TextKey[] = [
  'bd.part.brakes',
  'bd.part.tyres',
  'bd.part.oil',
  'bd.part.lights',
  'bd.part.doors',
  'bd.part.wipers',
  'bd.part.battery',
  'bd.part.coolant',
  'bd.part.belts',
  'bd.part.filters',
  'bd.part.suspension',
  'bd.part.mirrors'
]

const HERSTELSTAPPEN: TextKey[] = [
  'bd.step.inspect',
  'bd.step.dismantle',
  'bd.step.straighten',
  'bd.step.fill',
  'bd.step.paint',
  'bd.step.assemble'
]

const INSPECTIE_SECONDEN = 25

/**
 * Een minigame in een venstertje. Onderhoud is een inspectieronde: de
 * onderdelen liggen open, een paar zijn versleten, en je hebt 25 seconden om
 * ze te vinden -- elk goed onderdeel dat je openmaakt kost tijd. Reparatie is
 * een stappenplan: de herstelstappen door elkaar, en jij zet ze in de goede
 * volgorde. De score (0 tot 1) bepaalt hoe goed de bus eruit komt.
 */
export function WerkplaatsSpel({
  soort,
  busNummer,
  staat,
  onKlaar,
  onAnnuleer
}: {
  soort: 'onderhoud' | 'reparatie'
  busNummer: number
  /** De staat van de bus; een slechtere bus heeft meer versleten onderdelen. */
  staat: number
  onKlaar: (score: number) => void
  onAnnuleer: () => void
}): JSX.Element {
  const tr = useT()
  return (
    <div className="bd-spelvenster" role="dialog" aria-modal="true">
      <section className="bd-paneel bd-spel">
        <div className="bd-paneelkop">
          <h2>
            {tr(soort === 'onderhoud' ? 'bd.game.inspectTitle' : 'bd.game.repairTitle', { bus: busNummer })}
          </h2>
          <button type="button" className="bd-link" onClick={onAnnuleer}>
            {tr('bd.game.cancel')}
          </button>
        </div>
        {soort === 'onderhoud' ? (
          <Inspectie staat={staat} onKlaar={onKlaar} />
        ) : (
          <Stappenplan onKlaar={onKlaar} />
        )}
      </section>
    </div>
  )
}

function Inspectie({ staat, onKlaar }: { staat: number; onKlaar: (score: number) => void }): JSX.Element {
  const tr = useT()
  // Drie tot vijf versleten onderdelen, meer naarmate de bus er slechter aan toe is.
  const defect = useMemo(() => {
    const aantal = 3 + (staat < 60 ? 1 : 0) + (staat < 35 ? 1 : 0)
    const volgorde = ONDERDELEN.map((_, i) => i).sort(() => Math.random() - 0.5)
    return new Set(volgorde.slice(0, aantal))
  }, [staat])
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [tijd, setTijd] = useState(INSPECTIE_SECONDEN)
  const [klaar, setKlaar] = useState(false)

  const gevonden = [...open].filter((i) => defect.has(i)).length
  const mis = open.size - gevonden
  // Alles gevonden telt voor vol; elk goed onderdeel dat je openmaakte kost wat.
  const score = Math.max(0, gevonden / defect.size - mis * 0.05)

  useEffect(() => {
    if (klaar) return
    if (tijd <= 0 || gevonden === defect.size) {
      setKlaar(true)
      return
    }
    const t = setTimeout(() => setTijd((x) => x - 1), 1000)
    return () => clearTimeout(t)
  }, [tijd, klaar, gevonden, defect.size])

  return (
    <>
      <p className="bd-rustig">{tr('bd.game.inspectHow', { n: defect.size, s: INSPECTIE_SECONDEN })}</p>
      <div className="bd-spelbalk">
        <span>{tr('bd.game.found', { n: gevonden, of: defect.size })}</span>
        <span className={tijd <= 5 ? 'laat' : ''}>{tr('bd.game.seconds', { n: Math.max(0, tijd) })}</span>
      </div>
      <div className="bd-onderdelen">
        {ONDERDELEN.map((naam, i) => {
          const isOpen = open.has(i)
          return (
            <button
              key={naam}
              type="button"
              disabled={isOpen || klaar}
              className={isOpen ? (defect.has(i) ? 'defect' : 'goed') : ''}
              onClick={() => setOpen((o) => new Set(o).add(i))}
            >
              <b>{tr(naam)}</b>
              <small>{isOpen ? tr(defect.has(i) ? 'bd.game.worn' : 'bd.game.fine') : '?'}</small>
            </button>
          )
        })}
      </div>
      {klaar && <Uitslag score={score} onKlaar={onKlaar} />}
    </>
  )
}

function Stappenplan({ onKlaar }: { onKlaar: (score: number) => void }): JSX.Element {
  const tr = useT()
  const geschud = useMemo(() => HERSTELSTAPPEN.map((_, i) => i).sort(() => Math.random() - 0.5), [])
  const [gedaan, setGedaan] = useState<number[]>([])
  const [fouten, setFouten] = useState(0)
  const [fout, setFout] = useState<number>()
  const klaar = gedaan.length === HERSTELSTAPPEN.length
  const score = Math.max(0, 1 - fouten * 0.2)

  return (
    <>
      <p className="bd-rustig">{tr('bd.game.repairHow')}</p>
      <div className="bd-spelbalk">
        <span>{tr('bd.game.steps', { n: gedaan.length, of: HERSTELSTAPPEN.length })}</span>
        <span className={fouten > 0 ? 'laat' : ''}>{tr('bd.game.mistakes', { n: fouten })}</span>
      </div>
      <ol className="bd-stappen">
        {gedaan.map((i) => (
          <li key={i}>{tr(HERSTELSTAPPEN[i])}</li>
        ))}
      </ol>
      <div className="bd-onderdelen">
        {geschud.map((i) =>
          gedaan.includes(i) ? null : (
            <button
              key={i}
              type="button"
              disabled={klaar}
              className={fout === i ? 'defect' : ''}
              onClick={() => {
                if (i === gedaan.length) {
                  setGedaan((g) => [...g, i])
                  setFout(undefined)
                } else {
                  setFouten((f) => f + 1)
                  setFout(i)
                }
              }}
            >
              <b>{tr(HERSTELSTAPPEN[i])}</b>
            </button>
          )
        )}
      </div>
      {klaar && <Uitslag score={score} onKlaar={onKlaar} />}
    </>
  )
}

function Uitslag({ score, onKlaar }: { score: number; onKlaar: (score: number) => void }): JSX.Element {
  const tr = useT()
  const procent = Math.round(score * 100)
  return (
    <div className="bd-uitslag">
      <b className={procent >= 80 ? 'optijd' : procent >= 50 ? 'let' : 'laat'}>{procent}%</b>
      <span>{tr(procent >= 80 ? 'bd.game.great' : procent >= 50 ? 'bd.game.ok' : 'bd.game.poor')}</span>
      <button type="button" className="bd-knop hoofd" onClick={() => onKlaar(score)}>
        {tr('bd.game.finish')}
      </button>
    </div>
  )
}
