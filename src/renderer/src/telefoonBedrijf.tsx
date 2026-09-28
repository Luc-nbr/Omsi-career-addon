import type { JSX } from "react";
import type { BedrijfRit } from "../../core/bedrijf";
import { formatMoney } from "../../shared/format";
import { t, type Language } from "../../shared/i18n";

/*
 * Je eigen bedrijf op de telefoon: alleen wat tijdens het rijden telt.
 *
 * Luc: "de telefoon wordt alleen ingame gebruikt, dus alleen info die relevant
 * is tijdens het rijden moet in de telefoon, de rest kan in de app". Kas,
 * boekingen, personeel en post staan in Mijn bedrijf. Hier staat alleen iets
 * als de rit die je nu rijdt op een lijn van je eigen bedrijf ligt, en dan
 * precies wat je onderweg kunt beïnvloeden: hoe de tijdhaltes van deze dienst
 * lopen en wat ze opleveren, je reputatie (die bepaalt of de concessie
 * verlengd wordt), en hoe het met de bus gaat waar je in zit.
 *
 * Een kaart bovenaan de rit-app, en geen eigen app: onderweg wil je niet
 * wisselen, en het hoort bij de rit.
 */

/** De grens waaronder de werkplaats een bus meldt; zie `slijtageMelding`. */
const STAAT_LAAG = 40;

export function BedrijfKaart({
  rit,
  lineFile,
  language,
}: {
  rit: BedrijfRit;
  /** De lijn van de rit die nu loopt; alleen een eigen lijn krijgt de kaart. */
  lineFile?: string;
  language: Language;
}): JSX.Element | null {
  const lijn = lineFile
    ? rit.lijnen.find((l) => l.lineFile.toLowerCase() === lineFile.toLowerCase())
    : undefined;
  if (!lijn) return null;
  const geld = (c: number, teken = false): string =>
    `${teken && c > 0 ? "+" : ""}${formatMoney(c / 100, language)}`;
  const telling = rit.telling ?? { opTijd: 0, vroeg: 0, laat: 0, bedrag: 0 };
  const rep = rit.reputatie < rit.verlengVanaf;

  return (
    <section className="tb-kaart">
      <div className="tb-kaartkop">
        <span>{t(language, "tb.ownLine", { lijn: lijn.lijn })}</span>
        <span className={lijn.dagenOver <= 3 ? "min" : undefined}>
          {lijn.dagenOver <= 0
            ? t(language, "tb.lastDay")
            : lijn.dagenOver === 1
              ? t(language, "tb.oneDayLeft")
              : t(language, "tb.daysLeft", { n: lijn.dagenOver })}
        </span>
      </div>
      {/*
        De drie oordelen van de rittenstaat, met wat elk kost of oplevert
        eronder: zo zie je bij de volgende tijdhalte wat er op het spel staat.
      */}
      <div className="tb-oordelen">
        <div>
          <b className="plus">{telling.opTijd}</b>
          <span>{t(language, "tb.onTime")}</span>
          <small>{geld(rit.tarief.opTijd, true)}</small>
        </div>
        <div>
          <b className={telling.vroeg > 0 ? "min" : undefined}>{telling.vroeg}</b>
          <span>{t(language, "tb.early")}</span>
          <small>{geld(-rit.tarief.teVroeg)}</small>
        </div>
        <div>
          <b className={telling.laat > 0 ? "min" : undefined}>{telling.laat}</b>
          <span>{t(language, "tb.late")}</span>
          <small>{geld(-rit.tarief.teLaat)}</small>
        </div>
      </div>
      <div className="tb-kaartvoet">
        <span>
          {t(language, "tb.thisDuty")}{" "}
          <b className={telling.bedrag < 0 ? "min" : telling.bedrag > 0 ? "plus" : undefined}>
            {geld(telling.bedrag, true)}
          </b>
        </span>
        <span title={rep ? t(language, "tb.repLow", { n: rit.verlengVanaf }) : undefined}>
          {t(language, "tb.reputation")}{" "}
          <b className={rep ? "min" : undefined}>{rit.reputatie}</b>
        </span>
      </div>
      {rit.bus && (
        <div className="tb-kaartvoet">
          <span>{t(language, "tb.busN", { n: rit.bus.nummer })}</span>
          <span>
            {t(language, "tb.condition")}{" "}
            <b className={rit.bus.staat < STAAT_LAAG ? "min" : undefined}>{rit.bus.staat}</b>
            {rit.bus.schade > 0 && (
              <>
                {" · "}
                {t(language, "tb.damage")} <b className="min">{rit.bus.schade}</b>
              </>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
