import { useMemo, type JSX } from 'react'
import type { CareerEntry, CareerState, CareerSummary } from '../../core/career'
import { formatDuration } from '../../shared/format'
import type { TextKey } from '../../shared/i18n'
import { useLanguage, useT } from './language'
import './profiel.css'

interface Props {
  state: CareerState
  summary: CareerSummary
}

/**
 * Het overzicht van een chauffeur.
 *
 * WAAROM DIT BESTAAT
 * Het logboek hield al van elke gereden dienst bij hoe lang hij duurde, hoeveel
 * haltes erin zaten, hoeveel kilometer je maakte, hoe laat je was, hoe vaak je
 * hard op de rem ging en hoeveel kaartjes je verkocht. Dat werd allemaal
 * opgeschreven en nergens teruggegeven -- je zag alleen een rang en een teller.
 *
 * WAT HIER WEL EN NIET STAAT
 * Alleen wat werkelijk gemeten is. Geen enkel getal op dit scherm is verzonnen
 * of geschat: elk komt uit een veld dat de app na afloop van een dienst heeft
 * weggeschreven. Ontbreekt zo'n veld -- oude diensten van voor een versie die
 * het nog niet bijhield -- dan telt die dienst voor dat ene cijfer niet mee, en
 * staat erbij hoeveel diensten het dan betreft. Een gemiddelde over drie van de
 * negentien diensten is iets anders dan een gemiddelde, en dat hoort te zien te
 * zijn.
 *
 * VORM
 * Dezelfde wereld als de rest van het opzetscherm: hetzelfde vel, dezelfde
 * letters, dezelfde kleuren. Kleur betekent hier wat ze overal in deze app
 * betekent -- groen op tijd, rood te laat, blauw te vroeg -- en verder niets.
 * De staafjes zijn gewone blokjes met een breedte; er komt geen bibliotheek aan
 * te pas voor iets wat een percentage is.
 */
export function Profiel({ state, summary }: Props): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const entries = state.entries

  const cijfers = useMemo(() => rekenen(entries), [entries])

  /*
   * De rang komt als sleutel uit de kern ("ervaren") en de naam staat in de
   * vertaling. Dat is een sleutel die pas bij het draaien bekend is; de lijst
   * rangen staat in core/career.ts en de vertalingen ernaast, dus dit is de
   * plek waar die twee elkaar raken.
   */
  const rangnaam = (sleutel: string): string => tr(`rank.${sleutel}` as TextKey)

  const datum = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="profiel">
      <header className="profiel-kop">
        <div>
          <h3>{state.driver}</h3>
          <p>{tr('prof.since', { date: datum(state.startedAt) })}</p>
        </div>
        <div className="profiel-rang">
          <b>{rangnaam(summary.rank)}</b>
          {summary.nextRank && (
            <>
              <div className="profiel-balk">
                <span style={{ width: `${Math.round(summary.progress * 100)}%` }} />
              </div>
              <small>
                {tr('prof.toNext', { rank: rangnaam(summary.nextRank) })}
              </small>
            </>
          )}
        </div>
      </header>

      {/*
        Je dienstgegevens. Die heb je nodig om je op de telefoon in de overlay
        aan te melden, dus ze horen op de plek te staan waar je over jezelf
        leest -- en niet weggestopt in een instellingenscherm.

        Ze staan er gewoon leesbaar. Er valt hier niets te beschermen: het is je
        eigen pc en je eigen profiel, en een pincode die je niet kunt opzoeken is
        een pincode die je een keer kwijt bent. Zie core/career.ts.
      */}
      {state.personeelsnummer && state.pincode && (
        <section className="profiel-pas">
          <div>
            <span>{tr('prof.staffNumber')}</span>
            <b>{state.personeelsnummer}</b>
          </div>
          <div>
            <span>{tr('prof.pin')}</span>
            <b>{state.pincode}</b>
          </div>
          <p>{tr('prof.signonWhy')}</p>
        </section>
      )}

      {entries.length === 0 ? (
        <p className="profiel-leeg">{tr('prof.empty')}</p>
      ) : (
        <>
          <div className="profiel-tegels">
            <Tegel groot={String(summary.duties)} label={tr('prof.duties')} />
            <Tegel groot={formatDuration(summary.minutes, taal)} label={tr('prof.behindWheel')} />
            <Tegel
              groot={cijfers.metKm > 0 ? cijfers.km.toFixed(0) : '—'}
              eenheid={cijfers.metKm > 0 ? 'km' : undefined}
              label={tr('prof.driven')}
              onder={
                cijfers.metKm === 0
                  ? tr('prof.noKm')
                  : cijfers.metKm < entries.length
                    ? tr('prof.ofDuties', { count: cijfers.metKm, total: entries.length })
                    : undefined
              }
            />
            <Tegel groot={String(summary.stops)} label={tr('prof.stops')} />
            <Tegel
              groot={cijfers.kaartjes === undefined ? '—' : String(cijfers.kaartjes)}
              label={tr('prof.passengers')}
              /*
               * Pas vergelijken als er iets te vergelijken valt. Onder de honderd
               * kaartjes zou er "genoeg voor 1 bus" staan, en dat is geen cijfer
               * maar een afronding die zich groter voordoet dan ze is.
               */
              onder={
                cijfers.kaartjes !== undefined && cijfers.kaartjes >= 100
                  ? tr('prof.busloads', { count: Math.round(cijfers.kaartjes / 100) })
                  : undefined
              }
            />
            <Tegel
              groot={`€ ${summary.earnings.toFixed(0)}`}
              label={tr('prof.earned')}
              onder={
                summary.minutes > 0
                  ? tr('prof.perHour', {
                      amount: ((summary.earnings / summary.minutes) * 60).toFixed(2)
                    })
                  : undefined
              }
            />
          </div>

          {/*
            Stiptheid krijgt de meeste ruimte, want daar gaat het vak over. De
            grens van een minuut is dezelfde als in de overlay en op het
            dienstkaartje: eronder heet het op tijd.
          */}
          {cijfers.stipt && (
            <section className="profiel-vak">
              <h4>{tr('prof.punctual')}</h4>
              <div className="profiel-verdeling">
                <span
                  className="vroeg"
                  style={{ width: `${(cijfers.stipt.vroeg / cijfers.stipt.totaal) * 100}%` }}
                  title={tr('prof.early')}
                />
                <span
                  className="optijd"
                  style={{ width: `${(cijfers.stipt.optijd / cijfers.stipt.totaal) * 100}%` }}
                  title={tr('prof.onTime')}
                />
                <span
                  className="laat"
                  style={{ width: `${(cijfers.stipt.laat / cijfers.stipt.totaal) * 100}%` }}
                  title={tr('prof.late')}
                />
              </div>
              <ul className="profiel-legenda">
                <li>
                  <i className="vroeg" />
                  {tr('prof.early')} <b>{cijfers.stipt.vroeg}</b>
                </li>
                <li>
                  <i className="optijd" />
                  {tr('prof.onTime')} <b>{cijfers.stipt.optijd}</b>
                </li>
                <li>
                  <i className="laat" />
                  {tr('prof.late')} <b>{cijfers.stipt.laat}</b>
                </li>
              </ul>
              <p className="profiel-noot">
                {tr('prof.avgDelay', { minutes: cijfers.stipt.gemiddeld.toFixed(1) })}
                {cijfers.stipt.totaal < entries.length &&
                  ` · ${tr('prof.ofDuties', { count: cijfers.stipt.totaal, total: entries.length })}`}
              </p>
            </section>
          )}

          <div className="profiel-kolommen">
            {/*
              Rijstijl per honderd kilometer en niet per dienst: een dienst van
              een half uur en een van acht uur zijn anders niet te vergelijken.
            */}
            <section className="profiel-vak">
              <h4>{tr('prof.style')}</h4>
              <dl className="profiel-lijst">
                <div>
                  <dt>{tr('prof.harsh')}</dt>
                  <dd>{cijfers.hardPer100 === undefined ? '—' : cijfers.hardPer100.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>{tr('prof.collisions')}</dt>
                  <dd>{cijfers.aanrijdingen === undefined ? '—' : cijfers.aanrijdingen}</dd>
                </div>
                {/*
                  "Sinds de laatste: 0 km" naast "Aanrijdingen: 0" is geen
                  gegeven maar een lege regel die zich voordoet als een gegeven.
                  Hij hoort er pas te staan als er werkelijk iets te tellen valt
                  sinds er iets gebeurd is.
                */}
                {(cijfers.aanrijdingen ?? 0) > 0 && cijfers.schadevrijKm !== undefined && (
                  <div>
                    <dt>{tr('prof.clean')}</dt>
                    <dd>{cijfers.schadevrijKm.toFixed(0)} km</dd>
                  </div>
                )}
                {cijfers.tanks !== undefined && cijfers.tanks > 0 && (
                  <div>
                    <dt>{tr('prof.fuel')}</dt>
                    <dd>{cijfers.tanks.toFixed(1)}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="profiel-vak">
              <h4>{tr('prof.records')}</h4>
              <dl className="profiel-lijst">
                <div>
                  <dt>{tr('prof.longest')}</dt>
                  <dd>{formatDuration(cijfers.langste.durationMinutes, taal)}</dd>
                  <small>{cijfers.langste.mapName}</small>
                </div>
                {cijfers.verste && (
                  <div>
                    <dt>{tr('prof.furthest')}</dt>
                    <dd>{(cijfers.verste.drivenKm ?? 0).toFixed(1)} km</dd>
                    <small>{cijfers.verste.mapName}</small>
                  </div>
                )}
                {cijfers.drukste && (cijfers.drukste.tickets ?? 0) > 0 && (
                  <div>
                    <dt>{tr('prof.busiest')}</dt>
                    <dd>{cijfers.drukste.tickets}</dd>
                    <small>{cijfers.drukste.mapName}</small>
                  </div>
                )}
                {cijfers.stipste && (
                  <div>
                    <dt>{tr('prof.best')}</dt>
                    <dd>{(cijfers.stipste.delayMinutes ?? 0).toFixed(1)} min</dd>
                    <small>{cijfers.stipste.mapName}</small>
                  </div>
                )}
              </dl>
            </section>
          </div>

          <div className="profiel-kolommen">
            <Top titel={tr('prof.favMaps')} rijen={cijfers.kaarten} />
            <Top titel={tr('prof.favBuses')} rijen={cijfers.bussen} />
          </div>

          {/*
            Wanneer je rijdt. Dit is het moment waarop een dienst is afgerond en
            dus wanneer jij achter de computer zat, niet hoe laat het in het spel
            was -- dat laatste staat niet in het logboek.
          */}
          <section className="profiel-vak">
            <h4>{tr('prof.when')}</h4>
            <div className="profiel-klok">
              {cijfers.uren.map((aantal, uur) => (
                <span
                  key={uur}
                  title={tr('prof.atHour', { hour: String(uur).padStart(2, '0'), count: aantal })}
                >
                  <i
                    style={{
                      height: `${cijfers.drukstUur > 0 ? (aantal / cijfers.drukstUur) * 100 : 0}%`
                    }}
                  />
                  {uur % 6 === 0 && <small>{String(uur).padStart(2, '0')}</small>}
                </span>
              ))}
            </div>
          </section>

          {state.licences.length > 0 && (
            <section className="profiel-vak">
              <h4>{tr('prof.licences')}</h4>
              <ul className="profiel-vergunningen">
                {state.licences.map((l) => (
                  <li key={`${l.mapFolder}|${l.lineFile}`}>
                    <b>{l.lineNumbers.join('/') || l.lineFile}</b>
                    <span>{l.mapName || l.mapFolder}</span>
                    <small>{tr('prof.score', { score: l.score })}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="profiel-vak">
            <h4>{tr('prof.recent')}</h4>
            <ul className="profiel-logboek">
              {[...entries]
                .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                .slice(0, 8)
                .map((entry) => (
                  <li key={entry.id}>
                    <span className="wanneer">{datum(entry.completedAt)}</span>
                    <span className="waar">{entry.mapName}</span>
                    <span className="lijn">{entry.lineNumbers.join('/') || '—'}</span>
                    <span className="duur">{formatDuration(entry.durationMinutes, taal)}</span>
                    <span className={`stipt ${kleurVan(entry.delayMinutes)}`}>
                      {Number.isFinite(entry.delayMinutes)
                        ? `${(entry.delayMinutes as number) > 0 ? '+' : ''}${(entry.delayMinutes as number).toFixed(0)}`
                        : '—'}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function Tegel({
  groot,
  eenheid,
  label,
  onder
}: {
  groot: string
  eenheid?: string
  label: string
  onder?: string
}): JSX.Element {
  return (
    <div className="profiel-tegel">
      <b>
        {groot}
        {eenheid && <small>{eenheid}</small>}
      </b>
      <span>{label}</span>
      {onder && <em>{onder}</em>}
    </div>
  )
}

/** Een top drie met een staafje per regel, naar rato van de koploper. */
function Top({ titel, rijen }: { titel: string; rijen: Array<[string, number]> }): JSX.Element {
  const hoogste = rijen[0]?.[1] ?? 0
  return (
    <section className="profiel-vak">
      <h4>{titel}</h4>
      <ul className="profiel-top">
        {rijen.map(([naam, aantal]) => (
          <li key={naam}>
            <span className="naam" title={naam}>
              {naam}
            </span>
            <span className="staaf">
              <i style={{ width: `${hoogste > 0 ? (aantal / hoogste) * 100 : 0}%` }} />
            </span>
            <b>{aantal}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Dezelfde grens als elders in de app: binnen een minuut heet op tijd.
 *
 * `null` bestaat hier echt -- diensten uit een versie die de vertraging nog niet
 * wegschreef staan zo in het logboek -- en die hoort geen kleur te krijgen, want
 * kleur betekent in deze app iets en "onbekend" is niet groen.
 */
function kleurVan(delay: number | undefined): string {
  if (delay === undefined || !Number.isFinite(delay)) return ''
  if (delay > 1) return 'laat'
  if (delay < -1) return 'vroeg'
  return 'optijd'
}

/**
 * Alles wat uit het logboek te halen valt, in één keer.
 *
 * Velden die een dienst niet heeft, tellen niet mee in plaats van als nul mee te
 * doen -- een dienst uit een versie die kaartjes nog niet bijhield is geen
 * dienst met nul kaartjes. Waar dat gebeurt, komt het aantal meetellende
 * diensten mee naar buiten, zodat het scherm het erbij kan zetten.
 */
/**
 * Is deze afstand te rijden in deze tijd?
 *
 * Dezelfde toets als `gereden` in het hoofdproces, en hier nog een keer omdat
 * het logboek regels bevat van voor die toets bestond: diensten van een uur met
 * 2.094.964 km erin, omdat de kilometerteller van de bus niet deugde en de
 * nulmeting op nul stond. Die staan er nog, en ze horen niet meegeteld te
 * worden -- maar het is het logboek van de chauffeur en niet van ons, dus we
 * rekenen ze hier weg in plaats van zijn bestand achter zijn rug om te
 * herschrijven.
 */
function telbaar(km: number | undefined, minuten: number): boolean {
  if (km === undefined || !Number.isFinite(km) || km <= 0) return false
  return km <= Math.max(10, (Math.max(0, minuten) / 60) * 100)
}

function rekenen(entries: CareerEntry[]): {
  km: number
  metKm: number
  kaartjes?: number
  aanrijdingen?: number
  schadevrijKm?: number
  tanks?: number
  hardPer100?: number
  stipt?: { vroeg: number; optijd: number; laat: number; totaal: number; gemiddeld: number }
  langste: CareerEntry
  verste?: CareerEntry
  drukste?: CareerEntry
  stipste?: CareerEntry
  kaarten: Array<[string, number]>
  bussen: Array<[string, number]>
  uren: number[]
  drukstUur: number
} {
  const som = (kies: (e: CareerEntry) => number | undefined): number | undefined => {
    let totaal = 0
    let gezien = 0
    for (const e of entries) {
      const w = kies(e)
      if (w === undefined || !Number.isFinite(w)) continue
      totaal += w
      gezien++
    }
    return gezien > 0 ? totaal : undefined
  }

  const metVertraging = entries.filter(
    (e) => e.delayMinutes !== undefined && Number.isFinite(e.delayMinutes)
  )
  const stipt =
    metVertraging.length > 0
      ? {
          vroeg: metVertraging.filter((e) => (e.delayMinutes as number) < -1).length,
          optijd: metVertraging.filter((e) => Math.abs(e.delayMinutes as number) <= 1).length,
          laat: metVertraging.filter((e) => (e.delayMinutes as number) > 1).length,
          totaal: metVertraging.length,
          gemiddeld:
            metVertraging.reduce((s, e) => s + (e.delayMinutes as number), 0) /
            metVertraging.length
        }
      : undefined

  const gemeten = entries.filter((e) => telbaar(e.drivenKm, e.durationMinutes))
  const km = gemeten.reduce((totaal, e) => totaal + (e.drivenKm as number), 0)
  const hard = som((e) => (e.harshBrakes ?? 0) + (e.harshAccels ?? 0))
  const aanrijdingen = som((e) => e.collisions)

  /*
   * Kilometers zonder schade: alles sinds de laatste dienst waarin het misging.
   * Is het nooit misgegaan, dan is dat alles wat je gereden hebt.
   */
  let schadevrijKm: number | undefined
  if (aanrijdingen !== undefined) {
    const opTijd = [...entries].sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    let sinds = 0
    for (const e of opTijd) {
      if ((e.collisions ?? 0) > 0) sinds = 0
      else if (telbaar(e.drivenKm, e.durationMinutes)) sinds += e.drivenKm as number
    }
    schadevrijKm = sinds
  }

  const tel = (kies: (e: CareerEntry) => string): Array<[string, number]> => {
    const per = new Map<string, number>()
    for (const e of entries) {
      const sleutel = kies(e)
      if (!sleutel) continue
      per.set(sleutel, (per.get(sleutel) ?? 0) + 1)
    }
    return [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }

  const uren = new Array<number>(24).fill(0)
  for (const e of entries) {
    const uur = new Date(e.completedAt).getHours()
    if (Number.isFinite(uur)) uren[uur]++
  }

  const beste = <T,>(lijst: T[], waarde: (x: T) => number | undefined): T | undefined => {
    let uit: T | undefined
    let top = -Infinity
    for (const x of lijst) {
      const w = waarde(x)
      if (w === undefined || !Number.isFinite(w)) continue
      if (w > top) {
        top = w
        uit = x
      }
    }
    return uit
  }

  return {
    km,
    metKm: gemeten.length,
    kaartjes: som((e) => e.tickets),
    aanrijdingen,
    schadevrijKm,
    tanks: som((e) => e.fuelUsed),
    hardPer100: hard !== undefined && km > 0 ? (hard / km) * 100 : undefined,

    stipt,
    langste: beste(entries, (e) => e.durationMinutes) ?? entries[0],
    verste: beste(gemeten, (e) => e.drivenKm),
    drukste: beste(entries, (e) => e.tickets),
    // De stipste is de kleinste afwijking, dus de grootste van het omgekeerde.
    stipste: beste(entries, (e) =>
      e.delayMinutes === undefined ? undefined : -Math.abs(e.delayMinutes)
    ),
    kaarten: tel((e) => e.mapName || e.mapFolder),
    bussen: tel((e) => e.vehicle),
    uren,
    drukstUur: Math.max(0, ...uren)
  }
}
