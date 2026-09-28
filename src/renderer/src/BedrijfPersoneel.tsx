import { useState, type JSX } from 'react'
import {
  REGELS,
  aanHetWerk,
  dagprognose,
  marktloon,
  sollicitanten,
  type Bedrijf as BedrijfStaat,
  type Medewerker
} from '../../core/bedrijf'
import type { CareerPayload } from '../../shared/api'
import { useT } from './language'
import { type Handel, useGeld, Paneel, Meter } from './BedrijfDelen'

/* ------------------------------------------------------------------ */
/* Personeel                                                          */
/* ------------------------------------------------------------------ */

/**
 * Het rooster van vandaag, de mensen in dienst en de sollicitanten. Het rooster
 * maakt de app zelf (zie `dagprognose`): hier zie je hoe het uitvalt, en wat je
 * eraan doet is mensen aannemen -- of zelf invallen.
 */
export function Personeel({ bedrijf, handel }: { bedrijf: BedrijfStaat; handel: Handel }): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const prognose = dagprognose(bedrijf)
  const mensen = bedrijf.personeel ?? []
  const vandaag = sollicitanten(bedrijf)
  const monteurs = aanHetWerk(bedrijf, 'monteur').length
  const [bezig, setBezig] = useState(false)
  const doe = (actie: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>): void => {
    setBezig(true)
    void handel(actie).finally(() => setBezig(false))
  }
  /* De balk in uren, want dat is wat er geboekt wordt; jouw invaluren zijn zelden een hele dienst. */
  const eigenUren = prognose.chauffeurUren - prognose.zelfUren
  const openUren = Math.max(0, prognose.uren - prognose.chauffeurUren)
  const deel = (uren: number): string => `${prognose.uren ? (uren / prognose.uren) * 100 : 0}%`
  const u = (uren: number): string => `${Math.round(uren * 10) / 10}`
  return (
    <div className="bd-kolom">
      <Paneel titel={tr('bd.rosterToday', { day: bedrijf.dag })}>
        {prognose.diensten === 0 ? (
          <p className="bd-rustig">{tr('bd.rosterEmpty')}</p>
        ) : (
          <>
            <div className="bd-rooster" aria-hidden="true">
              {/* Alleen wat er is: een leeg stuk zou toch een kier achterlaten. */}
              {eigenUren > 0 && <i className="eigen" style={{ width: deel(eigenUren) }} />}
              {prognose.zelfUren > 0 && <i className="zelf" style={{ width: deel(prognose.zelfUren) }} />}
              {openUren > 0 && <i className="open" style={{ width: deel(openUren) }} />}
            </div>
            <div className="bd-roostercijfers">
              <span>
                <b>{prognose.diensten}</b>
                {tr('bd.shiftsNeeded', { hours: Math.round(prognose.uren) })}
              </span>
              <span>
                <i className="eigen" />
                <b>{prognose.eigenDiensten}</b>
                {tr('bd.shiftsOwn')}
              </span>
              <span>
                <i className="zelf" />
                <b>{u(prognose.zelfUren)}</b>
                {tr('bd.hoursYou')}
              </span>
              <span>
                <i className="open" />
                <b>{prognose.openDiensten}</b>
                {tr('bd.shiftsOpen')}
              </span>
            </div>
            <p className="bd-rustig bd-klein">{tr('bd.rosterNote')}</p>
          </>
        )}
      </Paneel>

      <Paneel titel={tr('bd.staffCount', { n: mensen.length, money: geld(prognose.lonen) })}>
        {mensen.length === 0 ? (
          <p className="bd-rustig">{tr('bd.noStaff')}</p>
        ) : (
          <ul className="bd-mensen">
            {mensen.map((m) => (
              <MedewerkerRij key={m.id} m={m} dag={bedrijf.dag} bezig={bezig} doe={doe} />
            ))}
          </ul>
        )}
        {monteurs > 0 && (
          <p className="bd-rustig bd-klein">
            {tr('bd.mechanicsEffect', {
              service: Math.round(Math.min(REGELS.monteurOnderhoudMax, monteurs * REGELS.monteurOnderhoud) * 100),
              wear: Math.round(Math.min(REGELS.monteurSlijtageMax, monteurs * REGELS.monteurSlijtage) * 100)
            })}
          </p>
        )}
      </Paneel>

      <Paneel titel={tr('bd.applicants', { day: bedrijf.dag })}>
        {vandaag.length === 0 ? (
          <p className="bd-rustig">{tr('bd.noApplicants')}</p>
        ) : (
          <div className="bd-aanbod">
            {vandaag.map((s) => {
              const markt = marktloon(s.rol, s.ervaring)
              return (
                <article key={s.nr} className="bd-kaart">
                  <span className="bd-vorm">{tr(s.rol === 'chauffeur' ? 'bd.role.driver' : 'bd.role.mechanic')}</span>
                  <b>{s.naam}</b>
                  <Meter waarde={s.ervaring} tekst={tr('bd.experience', { n: Math.round(s.ervaring) })} />
                  <span className="bd-prijs">
                    {geld(s.loon)}
                    <small> {tr('bd.perDayShort')}</small>
                  </span>
                  <small className={s.loon > markt ? 'let' : ''}>
                    {tr(s.loon > markt ? 'bd.aboveMarket' : 'bd.atMarket', { money: geld(markt) })}
                  </small>
                  <button
                    type="button"
                    className="bd-knop hoofd"
                    disabled={bezig}
                    onClick={() => doe(window.career.bedrijfAannemen(s.nr))}
                  >
                    {tr('bd.hire')}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </Paneel>
    </div>
  )
}

function MedewerkerRij({
  m,
  dag,
  bezig,
  doe
}: {
  m: Medewerker
  dag: number
  /* Eén handeling tegelijk: een dubbelklik gaf "dat lukte niet" terwijl het wel lukte. */
  bezig: boolean
  doe: (actie: Promise<{ payload: CareerPayload; fout?: string } | CareerPayload>) => void
}): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  const ziek = m.ziekTot !== undefined && m.ziekTot >= dag
  const cursus = m.cursusTot !== undefined && m.cursusTot >= dag
  return (
    <li>
      <span className="bd-avatar" aria-hidden="true">
        {/* Voornaam en het laatste deel van de achternaam: "Frank de Vries" is FV, niet Fd. */}
        {`${m.naam.split(' ')[0]?.[0] ?? ''}${m.naam.split(' ').slice(-1)[0]?.[0] ?? ''}`.toUpperCase()}
      </span>
      <span className="bd-wat">
        <b>{m.naam}</b>
        <small>
          {tr(m.rol === 'chauffeur' ? 'bd.role.driver' : 'bd.role.mechanic')} ·{' '}
          {tr('bd.since', { day: m.sinds })}
        </small>
      </span>
      <Meter waarde={m.ervaring} tekst={tr('bd.experience', { n: Math.round(m.ervaring) })} />
      <Meter
        waarde={m.tevredenheid}
        tekst={tr('bd.satisfaction', { n: Math.round(m.tevredenheid) })}
        toon={m.tevredenheid < REGELS.vertrekOnder + 10 ? 'laat' : m.tevredenheid < 50 ? 'let' : 'goed'}
      />
      <span className="bd-bedrag">
        {geld(m.loon)}
        <small> {tr('bd.perDayShort')}</small>
      </span>
      <span className={`bd-status ${ziek || cursus ? 'let' : 'optijd'}`}>
        {ziek ? tr('bd.sickUntil', { day: m.ziekTot ?? dag }) : cursus ? tr('bd.onCourse') : tr('bd.working')}
      </span>
      <span className="bd-acties">
        <button
          type="button"
          className="bd-knop"
          disabled={bezig || cursus || ziek || m.ervaring >= 100}
          title={tr('bd.trainingTitle', { n: REGELS.bijscholingErvaring })}
          onClick={() => doe(window.career.bedrijfBijscholing(m.id))}
        >
          {tr('bd.training', { money: geld(REGELS.bijscholingKosten) })}
        </button>
        <button type="button" className="bd-knop" disabled={bezig} onClick={() => doe(window.career.bedrijfOpslag(m.id))}>
          {tr('bd.raise', { money: geld(Math.round((m.loon * REGELS.opslagFactor) / 100) * 100 - m.loon) })}
        </button>
        <button
          type="button"
          className="bd-knop zacht"
          disabled={bezig}
          onClick={() => {
            if (!window.confirm(tr('bd.fireAsk', { name: m.naam, money: geld(m.loon * REGELS.ontslagDagen) }))) return
            doe(window.career.bedrijfOntslaan(m.id))
          }}
        >
          {tr('bd.fire')}
        </button>
      </span>
    </li>
  )
}
