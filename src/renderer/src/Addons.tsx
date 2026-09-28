import { useEffect, useState, type DragEvent, type JSX } from 'react'
import type { Controle, Ontbrekend } from '../../core/addoncheck'
import type { AddonFout, AddonOverzicht, AddonPlan } from '../../shared/api'
import type { TextKey } from '../../shared/i18n'
import { Icoon, type Icoonnaam } from './Icoon'
import { useLanguage, useT } from './language'
import './bedrijf.css'
import './addons.css'

/*
 * De add-on-manager (stap 7): installeren, wat er staat, en de foutcontrole.
 *
 * Een eigen scherm zoals Mijn bedrijf, met dezelfde zijbalk en panelen -- het
 * is een beheerplek, geen stap op weg naar een dienst. De regels staan in
 * core/addon.ts en core/addoncheck.ts; dit venster vraagt en toont alleen.
 *
 * Geen downloadlijst: je installeert wat je zelf gedownload hebt. Luc koos dat
 * zo; veel makers van OMSI-add-ons verbieden verspreiden via een ander.
 */

type Tab = 'installeren' | 'geinstalleerd' | 'controle'

const TABS: Array<{ tab: Tab; icoon: Icoonnaam; tekst: TextKey }> = [
  { tab: 'installeren', icoon: 'kaartje', tekst: 'ad.nav.install' },
  { tab: 'geinstalleerd', icoon: 'logboek', tekst: 'ad.nav.installed' },
  { tab: 'controle', icoon: 'stipt', tekst: 'ad.nav.check' }
]

const isFout = (x: unknown): x is AddonFout => typeof x === 'object' && x !== null && 'fout' in x

function useFoutTekst(): (f: AddonFout) => string {
  const tr = useT()
  return (f) => (f.fout === 'fout' && f.melding ? f.melding : tr(`ad.err.${f.fout}` as TextKey))
}

function grootte(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} kB`
}

export function AddonsApp({ onTerug }: { onTerug: () => void }): JSX.Element {
  const tr = useT()
  const [tab, setTab] = useState<Tab>('installeren')
  const [voortgang, setVoortgang] = useState<{ fase: string; n: number }>()
  useEffect(() => window.career.opAddonVoortgang(setVoortgang), [])

  return (
    <div className="hub bd-app">
      <aside className="bd-zij">
        <div className="bd-merk">
          <span className="bd-logo" aria-hidden="true">
            <Icoon naam="kaartje" />
          </span>
          <span>
            <b>{tr('ad.title')}</b>
            <small>{tr('ad.subtitle')}</small>
          </span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              className={tab === t.tab ? 'actief' : ''}
              aria-current={tab === t.tab ? 'page' : undefined}
              onClick={() => setTab(t.tab)}
            >
              <Icoon naam={t.icoon} />
              {tr(t.tekst)}
            </button>
          ))}
        </nav>
        <div className="bd-zij-onder">
          <button type="button" className="bd-terug" onClick={onTerug}>
            ← {tr('bd.toMenu')}
          </button>
        </div>
      </aside>
      <main className="bd-hoofd">
        <header className="bd-balk">
          <h1>{tr(TABS.find((t) => t.tab === tab)!.tekst)}</h1>
        </header>
        {tab === 'installeren' && <Installeren voortgang={voortgang} naarControle={() => setTab('controle')} />}
        {tab === 'geinstalleerd' && <Geinstalleerd voortgang={voortgang} />}
        {tab === 'controle' && <Foutcontrole voortgang={voortgang} />}
      </main>
    </div>
  )
}

/* ---- installeren ---- */

type Stap =
  | { soort: 'leeg' }
  | { soort: 'plannen'; pad: string }
  | { soort: 'plan'; pad: string; plan: AddonPlan }
  | { soort: 'installeren'; pad: string; plan: AddonPlan }
  | { soort: 'klaar'; plan: AddonPlan; geschreven: number; overschreven: number; controles: Controle[] }

function Installeren({
  voortgang,
  naarControle
}: {
  voortgang?: { fase: string; n: number }
  naarControle: () => void
}): JSX.Element {
  const tr = useT()
  const foutTekst = useFoutTekst()
  const [stap, setStap] = useState<Stap>({ soort: 'leeg' })
  const [fout, setFout] = useState<string>()
  const [naam, setNaam] = useState('')
  const [boven, setBoven] = useState(false)

  const bekijk = async (pad: string | undefined): Promise<void> => {
    if (!pad) return
    setFout(undefined)
    setStap({ soort: 'plannen', pad })
    const uit = await window.career.addonPlan(pad)
    if (isFout(uit)) {
      setFout(foutTekst(uit))
      setStap({ soort: 'leeg' })
      return
    }
    setNaam(uit.plan.naam)
    setStap({ soort: 'plan', pad, plan: uit.plan })
  }

  const installeer = async (): Promise<void> => {
    if (stap.soort !== 'plan') return
    setFout(undefined)
    setStap({ soort: 'installeren', pad: stap.pad, plan: stap.plan })
    const uit = await window.career.addonInstalleer(stap.pad, naam)
    if (isFout(uit)) {
      setFout(foutTekst(uit))
      setStap({ soort: 'plan', pad: stap.pad, plan: stap.plan })
      return
    }
    // Meteen de bussen en kaarten uit deze add-on nakijken: dan weet je of er iets bij moet.
    const controles: Controle[] = []
    for (const bus of stap.plan.bussen) {
      const c = await window.career.addonControleer('bus', bus)
      if (!isFout(c)) controles.push(c)
    }
    for (const kaart of stap.plan.kaarten) {
      const c = await window.career.addonControleer('kaart', kaart)
      if (!isFout(c)) controles.push(c)
    }
    setStap({ soort: 'klaar', plan: stap.plan, geschreven: uit.geschreven, overschreven: uit.overschreven, controles })
  }

  const losgelaten = (e: DragEvent): void => {
    e.preventDefault()
    setBoven(false)
    const bestand = e.dataTransfer.files[0]
    if (bestand) void bekijk(window.career.addonPad(bestand))
  }

  return (
    <div className="bd-kolom">
      {fout && (
        <p className="bd-melding" role="alert">
          {fout}
        </p>
      )}
      {(stap.soort === 'leeg' || stap.soort === 'klaar') && (
        <section
          className={`bd-paneel ad-sleep ${boven ? 'boven' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setBoven(true)
          }}
          onDragLeave={() => setBoven(false)}
          onDrop={losgelaten}
        >
          <Icoon naam="kaartje" klasse="ad-sleepicoon" />
          <h2>{tr('ad.dropTitle')}</h2>
          <p className="bd-rustig">{tr('ad.dropText')}</p>
          <div className="ad-knoppen">
            <button type="button" className="bd-knop hoofd" onClick={() => void window.career.addonKies('zip').then(bekijk)}>
              {tr('ad.pickZip')}
            </button>
            <button type="button" className="bd-knop" onClick={() => void window.career.addonKies('map').then(bekijk)}>
              {tr('ad.pickFolder')}
            </button>
          </div>
          <p className="bd-rustig bd-klein">{tr('ad.rarNote')}</p>
        </section>
      )}

      {stap.soort === 'plannen' && (
        <section className="bd-paneel">
          <p>{tr('ad.reading', { n: voortgang?.fase === 'plan' ? voortgang.n : 0 })}</p>
        </section>
      )}

      {(stap.soort === 'plan' || stap.soort === 'installeren') && (
        <PlanVak
          plan={stap.plan}
          naam={naam}
          onNaam={setNaam}
          bezig={stap.soort === 'installeren'}
          voortgang={stap.soort === 'installeren' && voortgang?.fase === 'installeer' ? voortgang.n : undefined}
          onInstalleer={() => void installeer()}
          onAnnuleer={() => setStap({ soort: 'leeg' })}
        />
      )}

      {stap.soort === 'klaar' && (
        <section className="bd-paneel">
          <div className="bd-paneelkop">
            <h2>{tr('ad.doneTitle', { naam: stap.plan.naam })}</h2>
          </div>
          <p>
            {tr('ad.doneText', { n: stap.geschreven })}
            {stap.overschreven > 0 && ` ${tr('ad.doneBackup', { n: stap.overschreven })}`}
          </p>
          {stap.controles.length > 0 ? (
            stap.controles.map((c) => <ControleVak key={`${c.soort}|${c.naam}`} controle={c} />)
          ) : (
            <p className="bd-rustig">
              {tr('ad.noCheckHere')}{' '}
              <button type="button" className="bd-link" onClick={naarControle}>
                {tr('ad.nav.check')} →
              </button>
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function PlanVak({
  plan,
  naam,
  onNaam,
  bezig,
  voortgang,
  onInstalleer,
  onAnnuleer
}: {
  plan: AddonPlan
  naam: string
  onNaam: (naam: string) => void
  bezig: boolean
  voortgang?: number
  onInstalleer: () => void
  onAnnuleer: () => void
}): JSX.Element {
  const tr = useT()
  const niets = plan.nieuw + plan.andersAantal === 0
  const totaal = plan.nieuw + plan.andersAantal
  return (
    <>
      <section className="bd-paneel">
        <div className="bd-paneelkop">
          <h2>{tr('ad.planTitle')}</h2>
        </div>
        <label className="ad-naam">
          <span>{tr('ad.name')}</span>
          <input value={naam} maxLength={80} onChange={(e) => onNaam(e.target.value)} disabled={bezig} />
        </label>
        <div className="ad-tellers">
          <div>
            <b>{plan.nieuw}</b>
            <span>{tr('ad.new')}</span>
          </div>
          <div>
            <b>{plan.gelijk}</b>
            <span>{tr('ad.same')}</span>
          </div>
          <div className={plan.andersAantal > 0 ? 'let-op' : ''}>
            <b>{plan.andersAantal}</b>
            <span>{tr('ad.overwrite')}</span>
          </div>
          <div>
            <b>{plan.overigAantal}</b>
            <span>{tr('ad.notPlaced')}</span>
          </div>
          <div>
            <b>{grootte(plan.bytes)}</b>
            <span>{tr('ad.size')}</span>
          </div>
        </div>
        {(plan.bussen.length > 0 || plan.kaarten.length > 0) && (
          <p className="ad-gevonden">
            {plan.bussen.length > 0 && tr('ad.foundBuses', { lijst: plan.bussen.join(', ') })}
            {plan.bussen.length > 0 && plan.kaarten.length > 0 && ' · '}
            {plan.kaarten.length > 0 && tr('ad.foundMaps', { lijst: plan.kaarten.join(', ') })}
          </p>
        )}
        {niets ? (
          <p className="bd-melding">{plan.gelijk > 0 ? tr('ad.allThere') : tr('ad.nothing')}</p>
        ) : (
          <div className="ad-knoppen">
            <button type="button" className="bd-knop hoofd" disabled={bezig} onClick={onInstalleer}>
              {bezig ? tr('ad.installing', { n: voortgang ?? 0, total: totaal }) : tr('ad.install')}
            </button>
            <button type="button" className="bd-knop" disabled={bezig} onClick={onAnnuleer}>
              {tr('ad.cancel')}
            </button>
          </div>
        )}
      </section>

      <section className="bd-paneel">
        <div className="bd-paneelkop">
          <h2>{tr('ad.where')}</h2>
        </div>
        <ul className="ad-lijst">
          {plan.plekken.map((p) => (
            <li key={p.plek}>
              <span className="ad-pad">{p.plek}</span>
              <span className="bd-rustig">{tr('ad.files', { n: p.bestanden })}</span>
              <span className="bd-rustig">{grootte(p.bytes)}</span>
            </li>
          ))}
        </ul>
      </section>

      {plan.andersAantal > 0 && (
        <section className="bd-paneel">
          <div className="bd-paneelkop">
            <h2>{tr('ad.overwriteTitle', { n: plan.andersAantal })}</h2>
          </div>
          <p className="bd-rustig">{tr('ad.overwriteText')}</p>
          <ul className="ad-lijst">
            {plan.anders.map((a) => (
              <li key={a.doel}>
                <span className="ad-pad">{a.doel}</span>
                <span className="bd-rustig">{a.van ? tr('ad.fromAddon', { naam: a.van }) : tr('ad.fromUnknown')}</span>
              </li>
            ))}
            {plan.andersAantal > plan.anders.length && (
              <li className="bd-rustig">{tr('ad.more', { n: plan.andersAantal - plan.anders.length })}</li>
            )}
          </ul>
        </section>
      )}

      {plan.overigAantal > 0 && (
        <details className="bd-paneel ad-overig">
          <summary>{tr('ad.notPlacedTitle', { n: plan.overigAantal })}</summary>
          <p className="bd-rustig">{tr('ad.notPlacedText')}</p>
          <ul className="ad-lijst">
            {plan.overig.map((o) => (
              <li key={o}>
                <span className="ad-pad">{o}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

/* ---- geïnstalleerd ---- */

function Geinstalleerd({ voortgang }: { voortgang?: { fase: string; n: number } }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const foutTekst = useFoutTekst()
  const [lijst, setLijst] = useState<AddonOverzicht[]>()
  const [zeker, setZeker] = useState<string>()
  const [bezig, setBezig] = useState<string>()
  const [melding, setMelding] = useState<string>()

  const laad = (): void => void window.career.addonLijst().then(setLijst)
  useEffect(laad, [])

  const verwijder = async (a: AddonOverzicht): Promise<void> => {
    setBezig(a.id)
    setZeker(undefined)
    const uit = await window.career.addonVerwijder(a.id)
    setBezig(undefined)
    if (isFout(uit)) {
      setMelding(foutTekst(uit))
      return
    }
    setMelding(
      [
        tr('ad.removed', { naam: a.naam, n: uit.verwijderd }),
        uit.teruggezet > 0 ? tr('ad.restored', { n: uit.teruggezet }) : '',
        uit.gewijzigd.length > 0 ? tr('ad.keptChanged', { n: uit.gewijzigd.length }) : ''
      ]
        .filter(Boolean)
        .join(' ')
    )
    laad()
  }

  return (
    <div className="bd-kolom">
      {melding && (
        <p className="bd-melding" role="status">
          {melding}
        </p>
      )}
      <section className="bd-paneel">
        {!lijst ? null : lijst.length === 0 ? (
          <p className="bd-rustig">{tr('ad.noneInstalled')}</p>
        ) : (
          <ul className="ad-addons">
            {lijst.map((a) => (
              <li key={a.id}>
                <span className="ad-addonnaam">
                  <b>{a.naam}</b>
                  <small>
                    {new Date(a.geinstalleerd).toLocaleDateString(taal)} · {tr('ad.files', { n: a.bestanden })}
                    {a.overschreven > 0 && ` · ${tr('ad.backups', { n: a.overschreven })}`}
                  </small>
                  {(a.bussen.length > 0 || a.kaarten.length > 0) && (
                    <small>{[...a.bussen, ...a.kaarten].join(', ')}</small>
                  )}
                </span>
                {bezig === a.id ? (
                  <span className="bd-rustig">{tr('ad.removing', { n: voortgang?.fase === 'verwijder' ? voortgang.n : 0 })}</span>
                ) : zeker === a.id ? (
                  <span className="ad-knoppen">
                    <button type="button" className="bd-knop gevaar" onClick={() => void verwijder(a)}>
                      {tr('ad.removeSure')}
                    </button>
                    <button type="button" className="bd-knop" onClick={() => setZeker(undefined)}>
                      {tr('ad.cancel')}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="bd-knop" disabled={Boolean(bezig)} onClick={() => setZeker(a.id)}>
                    {tr('ad.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="bd-rustig bd-klein">{tr('ad.registerNote')}</p>
      </section>
    </div>
  )
}

/* ---- foutcontrole ---- */

function Foutcontrole({ voortgang }: { voortgang?: { fase: string; n: number } }): JSX.Element {
  const tr = useT()
  const foutTekst = useFoutTekst()
  const [inhoud, setInhoud] = useState<{ bussen: string[]; kaarten: string[] }>()
  const [uitslag, setUitslag] = useState<Record<string, Controle | string>>({})
  const [bezig, setBezig] = useState<string>()
  const [alles, setAlles] = useState(false)

  useEffect(() => void window.career.addonInhoud().then(setInhoud), [])

  const controleer = async (soort: 'bus' | 'kaart', naam: string): Promise<void> => {
    const sleutel = `${soort}|${naam}`
    setBezig(sleutel)
    const uit = await window.career.addonControleer(soort, naam)
    setUitslag((u) => ({ ...u, [sleutel]: isFout(uit) ? foutTekst(uit) : uit }))
    setBezig(undefined)
  }
  const allesBussen = async (): Promise<void> => {
    setAlles(true)
    for (const bus of inhoud?.bussen ?? []) await controleer('bus', bus)
    setAlles(false)
  }

  const rij = (soort: 'bus' | 'kaart', naam: string): JSX.Element => {
    const sleutel = `${soort}|${naam}`
    const u = uitslag[sleutel]
    return (
      <li key={sleutel}>
        <div className="ad-rij">
          <span className="ad-pad">{naam}</span>
          {bezig === sleutel ? (
            <span className="bd-rustig">{tr('ad.checking', { n: voortgang?.fase === 'controle' ? voortgang.n : 0 })}</span>
          ) : typeof u === 'string' ? (
            <span className="ad-slecht">{u}</span>
          ) : u ? (
            <span className={u.ontbrekend.length > 0 ? 'ad-slecht' : 'ad-goed'}>
              {u.ontbrekend.length > 0
                ? tr('ad.missingN', { n: u.ontbrekend.length + (u.meer ?? 0) })
                : tr('ad.allFound', { n: u.bekeken })}
            </span>
          ) : (
            <span />
          )}
          <button type="button" className="bd-knop" disabled={Boolean(bezig)} onClick={() => void controleer(soort, naam)}>
            {tr('ad.check')}
          </button>
        </div>
        {u && typeof u !== 'string' && u.ontbrekend.length > 0 && <ControleVak controle={u} kaal />}
      </li>
    )
  }

  if (!inhoud) return <div className="bd-kolom" />
  return (
    <div className="bd-kolom">
      <p className="bd-rustig">{tr('ad.checkIntro')}</p>
      <div className="bd-rij">
        <section className="bd-paneel">
          <div className="bd-paneelkop">
            <h2>{tr('ad.buses', { n: inhoud.bussen.length })}</h2>
            <button type="button" className="bd-link" disabled={Boolean(bezig) || alles} onClick={() => void allesBussen()}>
              {tr('ad.checkAll')} →
            </button>
          </div>
          <ul className="ad-controles">{inhoud.bussen.map((b) => rij('bus', b))}</ul>
        </section>
        <section className="bd-paneel">
          <div className="bd-paneelkop">
            <h2>{tr('ad.maps', { n: inhoud.kaarten.length })}</h2>
          </div>
          <p className="bd-rustig bd-klein">{tr('ad.mapSlow')}</p>
          <ul className="ad-controles">{inhoud.kaarten.map((k) => rij('kaart', k))}</ul>
        </section>
      </div>
    </div>
  )
}

/** De ontbrekende bestanden van één bus of kaart. */
function ControleVak({ controle, kaal }: { controle: Controle; kaal?: boolean }): JSX.Element {
  const tr = useT()
  const regel = (o: Ontbrekend, i: number): JSX.Element => (
    <li key={i}>
      <span className="ad-soort">{tr(`ad.kind.${o.soort}` as TextKey)}</span>
      <span className="ad-pad">{o.pad}</span>
      <small className="bd-rustig">
        {o.door && tr('ad.namedBy', { door: o.door })}
        {(o.keer ?? 1) > 1 && ` · ${tr('ad.times', { n: o.keer ?? 1 })}`}
      </small>
    </li>
  )
  return (
    <div className="ad-uitslag">
      {!kaal && (
        <p>
          <b>{controle.naam}</b>{' '}
          <span className={controle.ontbrekend.length > 0 ? 'ad-slecht' : 'ad-goed'}>
            {controle.ontbrekend.length > 0
              ? tr('ad.missingN', { n: controle.ontbrekend.length + (controle.meer ?? 0) })
              : tr('ad.allFound', { n: controle.bekeken })}
          </span>
        </p>
      )}
      {controle.ontbrekend.length > 0 && <ul className="ad-ontbrekend">{controle.ontbrekend.map(regel)}</ul>}
      {controle.meer ? <p className="bd-rustig">{tr('ad.more', { n: controle.meer })}</p> : null}
    </div>
  )
}
