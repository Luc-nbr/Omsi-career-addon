import { useEffect, useState, type JSX } from 'react'
import type { ApparaatStand } from '../../shared/api'
import { useT } from './language'
import { QrCode } from './apparaatdeel'

/**
 * De QR-code in de app zelf: koppel je telefoon of tablet voordat je rijdt.
 *
 * WAAROM HIJ OOK HIER STAAT
 * Hij stond alleen in de telefoon van de overlay, en die is er pas als er een
 * dienst loopt. Dat is te laat: je legt je iPad klaar voordat je instapt, niet
 * halverwege de eerste rit. Vanaf hier zet je de verbinding aan, scan je de
 * code, en staat het toestel al te wachten tot de dienst begint.
 *
 * Wat er op het toestel komt is de hele telefoon -- aanmelden, tekenen, de
 * kaart, de apps -- en die stand deelt hij met de overlay; zie
 * `renderer/src/telefoon.tsx` en "DE STAND VAN DE TELEFOON" in main/index.ts.
 */
export function ApparaatDialoog({ onClose }: { onClose: () => void }): JSX.Element {
  const tr = useT()
  const [stand, setStand] = useState<ApparaatStand>()
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    let actief = true
    const zet = (nieuw: ApparaatStand): void => {
      if (actief) setStand(nieuw)
    }
    void window.career.apparaatStart().then(zet).catch(() => undefined)
    // Elke twee tellen: kijkt er al iemand mee? Dat is het antwoord op "doet hij het?".
    const klok = setInterval(
      () => void window.career.apparaatStand().then(zet).catch(() => undefined),
      2000
    )
    return () => {
      actief = false
      clearInterval(klok)
    }
  }, [])

  const doe = (werk: () => Promise<ApparaatStand>): void => {
    setBezig(true)
    void werk()
      .then(setStand)
      .finally(() => setBezig(false))
  }

  return (
    <div className="backdrop">
      <section className="dialog apparaat-venster">
        <div className="glow" />
        <h2>{tr('dev.title')}</h2>

        {!stand ? (
          <p>{tr('dev.starting')}</p>
        ) : !stand.aan ? (
          <p>{stand.fout ? tr('dev.error', { fout: stand.fout }) : tr('dev.stopped')}</p>
        ) : !stand.url ? (
          <p>{tr('dev.noAddress')}</p>
        ) : (
          <>
            <QrCode tekst={stand.url} label={tr('dev.qr')} />
            <p>{tr('dev.scan')}</p>
            {/* Het adres er ook in letters bij, voor een camera die de code niet pakt. */}
            <code className="apparaat-venster-url">{stand.url}</code>
            <p className={stand.kijkers > 0 ? 'note kijkt' : 'note'}>
              {stand.kijkers > 0
                ? tr('dev.watching', { count: stand.kijkers })
                : tr('dev.nobody')}
            </p>
            <p className="note">{tr('dev.wifi')}</p>
            <p className="note">{tr('dev.firewall')}</p>
          </>
        )}

        <div className="dialog-actions">
          {stand?.aan ? (
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={bezig}
                title={tr('dev.newLinkHint')}
                onClick={() => doe(() => window.career.apparaatNieuw())}
              >
                {tr('dev.newLink')}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={bezig}
                onClick={() => doe(() => window.career.apparaatStop())}
              >
                {tr('dev.stop')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn ghost"
              disabled={bezig || !stand}
              onClick={() => doe(() => window.career.apparaatStart())}
            >
              {tr('dev.start')}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {tr('hub.dismiss')}
          </button>
        </div>
      </section>
    </div>
  )
}
