import type { JSX } from "react";
import { GEBEURTENIS, type OnderwegBeeld } from "../../core/onderweg";
import type { LiveStatus } from "../../core/live";
import { formatMoney } from "../../shared/format";
import { t, type Language } from "../../shared/i18n";
import { gebeurtenisTekst } from "./Onderweg";

/*
 * Onderweg op de telefoon: een flits als melding bovenin, en de gebeurtenis
 * van de dienst met hoe het er nu voor staat. Alleen wat je tijdens het rijden
 * kunt beïnvloeden; de afrekening staat na de dienst in het logboek.
 */

/**
 * De flits: een halve minuut bovenin, over elke app heen. Geen knop om weg te
 * klikken -- in een rijdende bus ga je niet mikken -- hij gaat vanzelf weg.
 */
export function FlitsMelding({
  flits,
  language,
}: {
  flits: NonNullable<OnderwegBeeld["flits"]>;
  language: Language;
}): JSX.Element {
  return (
    <div className="ow-flits" role="alert">
      <b>{t(language, "ow.flashTitle")}</b>
      <span>
        {t(language, "ow.flashText", {
          kmh: flits.kmh,
          limit: flits.limiet,
          money: formatMoney(flits.boete, language),
        })}
      </span>
    </div>
  );
}

/** De gebeurtenis bovenaan de rit-app, met de tussenstand. */
export function GebeurtenisKaart({
  onderweg,
  status,
  language,
}: {
  onderweg: OnderwegBeeld;
  status?: LiveStatus;
  language: Language;
}): JSX.Element | null {
  const g = onderweg.gebeurtenis;
  if (!g) return null;
  const { titel } = gebeurtenisTekst(language, g, onderweg.uitstapHalte);
  const geld = (euro: number): string =>
    `${euro > 0 ? "+" : ""}${formatMoney(euro, language)}`;

  let stand: { tekst: string; slecht?: boolean } | undefined;
  switch (g.soort) {
    case "stiptheid": {
      const s = onderweg.stiptheid;
      if (s) {
        const bedrag = (s.goed - s.vroeg - s.laat) * GEBEURTENIS.stiptheidPerHalte;
        stand = { tekst: `${s.goed} ✓ · ${s.vroeg + s.laat} ✗ · ${geld(bedrag)}`, slecht: bedrag < 0 };
      }
      break;
    }
    case "comfort": {
      if (status) {
        const n = status.harshBrakes + status.harshAccels;
        stand = {
          tekst: t(language, "ow.harsh", { n, max: GEBEURTENIS.comfortMax }),
          slecht: n > GEBEURTENIS.comfortMax,
        };
      }
      break;
    }
    case "schadevrij":
      if (status) {
        stand = {
          tekst: t(language, "ow.collisions", { n: status.collisions }),
          slecht: status.collisions > 0,
        };
      }
      break;
    case "flitsactie":
      stand = {
        tekst: t(language, "ow.flashCount", { n: onderweg.flitsen }),
        slecht: onderweg.flitsen > 0,
      };
      break;
    case "controle":
      stand = { tekst: t(language, "ow.untilStop", { stop: onderweg.uitstapHalte ?? "—" }) };
      break;
  }

  return (
    <section className={`ow-kaart ${g.soort === "controle" ? "controle" : ""}`}>
      <span className="ow-kaartkop">{titel}</span>
      {stand && <b className={stand.slecht ? "min" : undefined}>{stand.tekst}</b>}
    </section>
  );
}

/** De aankondiging bij de dienstopdracht; de controleurs worden niet aangekondigd. */
export function Aankondiging({
  onderweg,
  language,
}: {
  onderweg?: OnderwegBeeld;
  language: Language;
}): JSX.Element | null {
  const g = onderweg?.gebeurtenis;
  if (!g || g.soort === "controle") return null;
  const { titel, uitleg } = gebeurtenisTekst(language, g);
  return (
    <div className="ow-aankondiging">
      <span className="ow-kaartkop">{t(language, "ow.today")}</span>
      <b>{titel}</b>
      <p>{uitleg}</p>
    </div>
  );
}
