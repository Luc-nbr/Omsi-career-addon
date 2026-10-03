import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Bedrijf } from '../../core/bedrijf'
import type { DagPlan, LopendeRit } from '../../core/planTypen'
import { centraleGaten, centraleSom, type CentraleSom } from '../../core/uitval'
import { useGeld, type Handel, type Naar } from './BedrijfDelen'
import { useT } from './language'
import { focusVan } from './uitvalAandacht'
import './uitval.css'

/*
 * De knop "Dag afsluiten" in de zijbalk (ontwerp busbedrijf-planning §5.2).
 *
 * Zolang je zelf een bedrijfsrit rijdt, kan het niet: main weigert het dan
 * ook ('rit'), maar de knop zegt het meteen. Staan er nog gaten open die de
 * centrale vult, of vallen er diensten uit, dan eerst een vraag met wat dat
 * kost -- zo zie je vooraf wat er afgerekend wordt, en kun je het eerst zelf
 * goedkoper regelen. Na de afsluiting komt `onGesloten`; de schil opent dan
 * het ochtendvenster.
 *
 * `naar` is een aanvulling op het contract (§9.2): met [Eerst zelf invullen]
 * ga je dan meteen naar de eerste open plek in de planning.
 */
export function DagAfsluitKnop({
  bedrijf,
  plan,
  lopend,
  handel,
  onGesloten,
  naar
}: {
  bedrijf: Bedrijf
  plan?: DagPlan
  lopend?: LopendeRit
  handel: Handel
  onGesloten: () => void
  naar?: Naar
}): JSX.Element {
  const tr = useT()
  const [vraag, setVraag] = useState(false)
  const [bezig, setBezig] = useState(false)
  const actueel = plan && plan.vandaag && plan.dag === bedrijf.dag ? plan : undefined
  const som = useMemo(() => centraleSom(bedrijf, actueel), [bedrijf, actueel])
  const moetVragen = som.diensten + som.omlopen > 0 || som.liggen.diensten > 0

  const sluit = async (): Promise<void> => {
    setVraag(false)
    setBezig(true)
    try {
      const doen = window.career.bedrijfDagAf()
      await handel(doen)
      const uit = await doen
      if (!('payload' in uit) || !uit.fout) onGesloten()
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="bd-knop hoofd breed"
        disabled={Boolean(lopend) || bezig}
        aria-describedby={lopend ? 'bd-afsluit-noot' : undefined}
        onClick={() => (moetVragen ? setVraag(true) : void sluit())}
      >
        {bezig ? tr('bd.afsluiten.bezig') : tr('bd.closeDay')}
      </button>
      {lopend && (
        <small id="bd-afsluit-noot" className="bd-uitval-noot">
          {tr('bd.fout.rit')}
        </small>
      )}
      {vraag && (
        <AfsluitVraag
          bedrijf={bedrijf}
          som={som}
          onToch={() => void sluit()}
          onEerst={() => {
            setVraag(false)
            const eerste = centraleGaten(actueel)[0]
            naar?.('planning', eerste ? focusVan(bedrijf, eerste) : { dag: bedrijf.dag })
          }}
        />
      )}
    </>
  )
}

function AfsluitVraag({
  bedrijf,
  som,
  onToch,
  onEerst
}: {
  bedrijf: Bedrijf
  som: CentraleSom
  onToch: () => void
  onEerst: () => void
}): JSX.Element {
  const tr = useT()
  const geld = useGeld()
  useEffect(() => {
    const toets = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEerst()
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [onEerst])

  const wat = [
    som.uitzend.n > 0 ? tr('bd.afsluiten.uitzend', { n: som.uitzend.n, geld: geld(som.uitzend.kosten) }) : '',
    som.huur.n > 0 ? tr('bd.afsluiten.huur', { n: som.huur.n, geld: geld(som.huur.kosten) }) : '',
    som.collega > 0 ? tr('bd.afsluiten.collegas', { n: som.collega }) : '',
    som.eigenBus > 0 ? tr('bd.afsluiten.eigenBussen', { n: som.eigenBus }) : ''
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="bd-spelvenster" role="dialog" aria-modal="true" aria-labelledby="bd-afsluit-kop">
      <section className="bd-paneel bd-uitval-venster">
        <div className="bd-paneelkop">
          <h2 id="bd-afsluit-kop">{tr('bd.afsluiten.vraagKop', { dag: bedrijf.dag })}</h2>
        </div>
        {som.diensten + som.omlopen > 0 && (
          <p>{tr('bd.afsluiten.vraag', { diensten: som.diensten, omlopen: som.omlopen, wat })}</p>
        )}
        {som.toeslag && <p className="bd-uitval-zacht">{tr('bd.afsluiten.toeslag')}</p>}
        {som.liggen.diensten > 0 && (
          <p className="bd-uitval-slecht">
            {tr('bd.afsluiten.valtUit', {
              n: som.liggen.diensten,
              geld: geld(som.liggen.verlies),
              rep: som.liggen.reputatie
            })}
          </p>
        )}
        <div className="bd-uitval-onder">
          <button type="button" className="bd-knop" onClick={onEerst} autoFocus>
            {tr('bd.afsluiten.eerst')}
          </button>
          <button type="button" className="bd-knop hoofd" onClick={onToch}>
            {tr('bd.afsluiten.toch')}
          </button>
        </div>
      </section>
    </div>
  )
}
