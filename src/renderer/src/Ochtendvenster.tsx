import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Bedrijf } from '../../core/bedrijf'
import type { BusKeuze, DagPlan, InvulKeuze } from '../../core/planTypen'
import { centraleGaten, doelVan, gevolgenVan, stilVan, type UitvalPlek } from '../../core/uitval'
import type { CareerPayload } from '../../shared/api'
import { useGeld, type Handel, type Naar } from './BedrijfDelen'
import { useLanguage, useT } from './language'
import { UitvalLijst } from './UitvalMeldingen'
import { datumTekst } from './uitvalAandacht'
import './uitval.css'

/*
 * Het ochtendvenster (ontwerp busbedrijf-planning §5.2): na het afsluiten van
 * een dag in één blik hoe die afliep, en wat er vanochtend anders is.
 *
 * Bovenaan het dagrapport van gisteren (uit het nieuwste bericht
 * 'dagrapport'). Daaronder de uitval van vandaag, elke regel met één knop
 * voor de goedkoopste redelijke keuze, of "Iedereen is er en alle bussen
 * rijden." [Alles met uitzendkrachten en huurbussen] zet elk gat dat de
 * centrale met een uitzendkracht of huurbus zou vullen (of zou laten vallen)
 * zelf zo in: zonder spoedtoeslag, want die rekent alleen de centrale.
 *
 * Het ontwerp zet hier `<OpenDiensten compact>` van deel C neer. Bij het
 * samenvoegen is `UitvalLijst` gebleven: die doet hetzelfde met `invulOpties`
 * (ook van C), maar zegt er wie ziek of te laat is en welke bus pech heeft
 * bij. De volledige lijst open diensten staat onder het rooster in de Planning.
 */
export function Ochtendvenster({
  bedrijf,
  plan,
  handel,
  naar,
  onSluit
}: {
  bedrijf: Bedrijf
  plan?: DagPlan
  handel: Handel
  naar: Naar
  onSluit: () => void
}): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = useGeld()
  const [bezig, setBezig] = useState(false)
  const actueel = plan && plan.vandaag && plan.dag === bedrijf.dag ? plan : undefined
  const gevolgen = useMemo(() => gevolgenVan(bedrijf, actueel), [bedrijf, actueel])
  const stil = useMemo(() => stilVan(bedrijf, actueel), [bedrijf, actueel])
  const teVullen = useMemo(() => centraleGaten(actueel).filter(doorUitzend), [actueel])
  const rapport = (bedrijf.post ?? []).find((b) => b.soort === 'dagrapport')

  useEffect(() => {
    const toets = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onSluit()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [onSluit])

  const uren = (n: unknown): string =>
    (Number(n) || 0).toLocaleString(taal === 'en' ? 'en-GB' : `${taal}-${taal.toUpperCase()}`, { maximumFractionDigits: 1 })

  /*
   * Eén voor één, want elke invulling verandert het plan (het uitzendbureau
   * raakt vol). Bij de eerste weigering stoppen: de rest zou dezelfde fout
   * geven. Het laatste antwoord bevat alles wat ervoor gelukt is.
   */
  const allesUitzend = async (): Promise<void> => {
    setBezig(true)
    try {
      let laatste: { payload: CareerPayload; fout?: string } | undefined
      for (const p of teVullen) {
        const keuze: InvulKeuze | BusKeuze = p.soort === 'omloop' ? { soort: 'huur' } : { soort: 'uitzend' }
        laatste = await window.career.bedrijfInvullen(doelVan(p), keuze)
        if (laatste.fout) break
      }
      if (laatste) await handel(Promise.resolve(laatste))
    } finally {
      setBezig(false)
    }
  }

  // Naar de planning: het venster gaat dan dicht, anders ligt het over de planning heen.
  const naarEnSluit: Naar = (tab, focus) => {
    naar(tab, focus)
    onSluit()
  }

  const datum = datumTekst(actueel?.datum, taal)
  return (
    <div className="bd-spelvenster" role="dialog" aria-modal="true" aria-labelledby="bd-ochtend-kop">
      <section className="bd-paneel bd-uitval-venster bd-ochtend">
        {rapport && (
          <header className="bd-ochtend-rapport">
            <h2 id="bd-ochtend-kop">{tr('bd.ochtend.kop', { dag: rapport.dag })}</h2>
            <p>
              {tr('bd.ochtend.rapport', {
                resultaat: geld(Number(rapport.v?.resultaat ?? 0), true),
                uren: uren(rapport.v?.uren),
                uitgevallen: uren(rapport.v?.uitgevallen)
              })}
            </p>
          </header>
        )}
        <h3 id={rapport ? undefined : 'bd-ochtend-kop'}>
          {datum
            ? tr('bd.ochtend.vandaag', { dag: bedrijf.dag, datum })
            : tr('bd.ochtend.vandaagZonder', { dag: bedrijf.dag })}
        </h3>
        {gevolgen.length > 0 ? (
          <UitvalLijst bedrijf={bedrijf} plan={actueel} gevolgen={gevolgen} naar={naarEnSluit} handel={handel} />
        ) : actueel ? (
          <p className="bd-uitval-goed">{tr('bd.ochtend.rustig')}</p>
        ) : null}
        {!actueel && <p className="bd-uitval-zacht">{tr('bd.ochtend.laden')}</p>}
        {stil.chauffeurs.length + stil.bussen.length > 0 && (
          <button type="button" className="bd-link bd-uitval-stil" onClick={() => naarEnSluit('planning', { dag: bedrijf.dag })}>
            {tr('bd.ochtend.stil', { n: stil.chauffeurs.length + stil.bussen.length })} →
          </button>
        )}
        <div className="bd-uitval-onder">
          {teVullen.length > 0 && (
            <button type="button" className="bd-knop" disabled={bezig} onClick={() => void allesUitzend()}>
              {tr('bd.ochtend.allesUitzend')}
            </button>
          )}
          <span className="bd-uitval-vul" />
          <button
            type="button"
            className="bd-knop"
            onClick={() => naarEnSluit('planning', { dag: bedrijf.dag })}
          >
            {tr('bd.ochtend.naarPlanning')}
          </button>
          <button type="button" className="bd-knop hoofd" onClick={onSluit} autoFocus>
            {tr('bd.ochtend.sluiten')}
          </button>
        </div>
      </section>
    </div>
  )
}

/** Een gat dat de centrale met een uitzendkracht of huurbus vult, of laat vallen omdat er niemand is. */
function doorUitzend(p: UitvalPlek): boolean {
  const wie = p.stand.wie.soort
  return p.soort === 'omloop' ? wie === 'huur' || wie === 'liggen' : wie === 'uitzend' || wie === 'liggen'
}
