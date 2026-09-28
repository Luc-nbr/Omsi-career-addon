import type { JSX } from 'react'
import { GEBEURTENIS, type Gebeurtenis, type Onderweg } from '../../core/onderweg'
import { formatMoney } from '../../shared/format'
import { t, type Language, type TextKey } from '../../shared/i18n'
import { useLanguage, useT } from './language'

/*
 * Onderweg in het logboek: flitsen, boetes en hoe de gebeurtenis van de dienst
 * afliep. De regels staan in core/onderweg.ts; hier alleen de woorden.
 */

/** Naam en uitleg van een gebeurtenis, met de bedragen uit de regels. */
export function gebeurtenisTekst(
  language: Language,
  g: Gebeurtenis,
  uitstapHalte?: string
): { titel: string; uitleg: string } {
  const geld = (euro: number): string => formatMoney(euro, language)
  const vars: Record<string, string | number> = {
    money:
      g.soort === 'stiptheid'
        ? geld(GEBEURTENIS.stiptheidPerHalte)
        : g.soort === 'comfort'
          ? geld(GEBEURTENIS.comfortPremie)
          : geld(GEBEURTENIS.schadevrijPremie),
    max: GEBEURTENIS.comfortMax,
    stop: uitstapHalte ?? '—'
  }
  return {
    titel: t(language, `ow.ev.${g.soort}.t` as TextKey),
    uitleg: t(language, `ow.ev.${g.soort}.b` as TextKey, vars)
  }
}

export function OnderwegVak({ onderweg }: { onderweg: Onderweg }): JSX.Element {
  const tr = useT()
  const taal = useLanguage()
  const geld = (euro: number, teken = false): string => `${teken && euro > 0 ? '+' : ''}${formatMoney(euro, taal)}`
  const u = onderweg.gebeurtenis
  return (
    <div className="ow-vak">
      {onderweg.flitsen.length > 0 && (
        <p className="ow-regel slecht">
          {tr('ow.fines', { count: onderweg.flitsen.length, money: geld(onderweg.boetes) })}
        </p>
      )}
      {u && (
        <p className={`ow-regel ${u.gehaald === undefined ? '' : u.gehaald ? 'goed' : 'slecht'}`}>
          <b>{gebeurtenisTekst(taal, { soort: u.soort }).titel}</b>
          {' · '}
          {u.gehaald === undefined ? tr('ow.notMeasured') : u.gehaald ? tr('ow.done') : tr('ow.notDone')}
          {u.rapport && ` · ${tr('ow.report', { count: u.rapport.fouten })}`}
          {u.bedrag !== 0 && ` · ${geld(u.bedrag, true)}`}
        </p>
      )}
      {onderweg.bedrag !== 0 && <p className="ow-regel zacht">{tr('ow.net', { money: geld(onderweg.bedrag, true) })}</p>}
    </div>
  )
}
