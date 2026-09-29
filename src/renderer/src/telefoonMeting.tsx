import { useState, type JSX } from "react";
import { t, type Language } from "../../shared/i18n";
import type { MetingBeeld } from "../../shared/meetstand";
import type { TelefoonActies } from "./telefoon";

/*
 * De meetstand op de telefoon: de afvinklijst van ronde 0 (shared/meetstand.ts,
 * design/ontwerpen/ronde0-meten.md). Staat alleen in het balkje als de
 * meetstand aanstaat, in de overlay en op de tablet hetzelfde.
 *
 * Grote vakken, want Luc vinkt af terwijl hij in de bus zit, en de uitleg per
 * stap is één zin: wat je doet, en wanneer je afvinkt.
 */

/** Een klembord met een vinkje, 24 bij 24, gevuld (zie de regels in Icoon.tsx). */
export const MEET_ICOON =
  "M5 4h3v2h8V4h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 4v12h12V8ZM9 2h6v3H9Zm6.6 8.6L17 12l-6 6-3.5-3.5 1.4-1.4 2.1 2.1Z";

/** Minuten en seconden, zoals een stopwatch. */
function duur(seconden: number): string {
  const m = Math.floor(seconden / 60);
  const s = seconden % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MeetApp({
  meting,
  acties,
  language,
}: {
  meting?: MetingBeeld;
  acties: TelefoonActies;
  language: Language;
}): JSX.Element {
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState<string>();
  if (!meting) return <div className="empty">{t(language, "meet.uit")}</div>;
  const opslaan = (): void => {
    setBezig(true);
    void acties
      .meetOpslaan()
      .then((bestand) =>
        setBericht(
          bestand
            ? t(language, "meet.opgeslagen", { bestand })
            : t(language, "meet.nietsOpgeslagen"),
        ),
      )
      .catch(() => setBericht(t(language, "meet.nietsOpgeslagen")))
      .finally(() => setBezig(false));
  };
  const opgeslagen =
    bericht ??
    (meting.opgeslagen
      ? t(language, "meet.opgeslagen", { bestand: meting.opgeslagen })
      : undefined);
  return (
    <div className="app-meting" data-hit>
      <section className="ow-kaart meet-kop">
        <span className="ow-kaartkop">{t(language, "meet.titel")}</span>
        <b>
          {meting.loopt
            ? t(language, "meet.loopt", {
                bus: meting.bus ?? "—",
                regels: meting.regels,
                tijd: duur(meting.seconden),
              })
            : t(language, "meet.wacht")}
        </b>
      </section>
      <p className="meet-uitleg">{t(language, "meet.vinkUitleg")}</p>
      <ul className="meet-lijst">
        {meting.stappen.map((stap) => (
          <li key={stap.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={stap.klaar}
              className="meet-stap"
              data-stap={stap.id}
              disabled={!meting.loopt}
              onClick={() => acties.meetVink(stap.id, !stap.klaar)}
            >
              <i className="meet-vak" aria-hidden="true" />
              <span>
                <b>{t(language, `meet.stap.${stap.id}`)}</b>
                <small>{t(language, `meet.stap.${stap.id}.uitleg`)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {meting.afgevallen > 0 && (
        <p className="meet-uitleg warn">
          {t(language, "meet.afgevallen", { n: meting.afgevallen })}
        </p>
      )}
      <button
        type="button"
        className="meet-opslaan"
        disabled={bezig}
        onClick={opslaan}
      >
        {t(language, "meet.opslaan")}
      </button>
      {opgeslagen && <p className="meet-uitleg">{opgeslagen}</p>}
    </div>
  );
}
