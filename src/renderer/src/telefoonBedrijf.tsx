import { useState, type JSX } from "react";
import type { BedrijfBeeld, Bericht, BerichtSoort } from "../../core/bedrijf";
import { formatMoney } from "../../shared/format";
import { t, type Language, type TextKey } from "../../shared/i18n";

/*
 * Het bedrijf op de telefoon: hoe het ervoor staat, het geld, en de post.
 *
 * WAAROM OP DE TELEFOON
 * Het eigen scherm van het bedrijf (Bedrijf.tsx) is waar je beslist: kopen,
 * aannemen, inschrijven. Maar tijdens een dienst zit je in OMSI, en dan wil je
 * zonder alt-tab weten of die zieke chauffeur al terug is en wat de dag gaat
 * opleveren. Dat is wat hier staat, en daarom alleen kijken: het enige dat je
 * hier doet is een bericht lezen. Beslissen doe je niet tussen twee haltes.
 *
 * Drie tabbladen in één app en niet drie apps: het balkje onderin telt al zes
 * knoppen van 330 punten breed, en een zevende, achtste en negende maken ze
 * te klein om in een rijdende bus te raken.
 */

type Tab = "bedrijf" | "geld" | "post";

type Afzender =
  | "directie"
  | "boekhouding"
  | "opdrachtgever"
  | "personeelszaken"
  | "werkplaats"
  | "opleidingen";

const AFZENDER: Record<BerichtSoort, Afzender> = {
  welkom: "directie",
  niveau: "directie",
  dagrapport: "boekhouding",
  kas: "boekhouding",
  rit: "opdrachtgever",
  verlengd: "opdrachtgever",
  vervallen: "opdrachtgever",
  afloop: "opdrachtgever",
  ziek: "personeelszaken",
  vertrek: "personeelszaken",
  ontevreden: "personeelszaken",
  werkplaats: "werkplaats",
  slijtage: "werkplaats",
  opleiding: "opleidingen",
};

/** Waarden in centen: die worden een bedrag voordat ze in de tekst gaan. */
const BEDRAGEN = new Set(["kas", "resultaat", "bedrag"]);

/**
 * Onderwerp en tekst van een bericht, in de taal van nu. Het bedrijf bewaart
 * alleen de soort en de waarden, zie `Bericht` in core/bedrijf.ts.
 */
export function berichtTekst(
  bericht: Bericht,
  naam: string,
  language: Language,
): { van: string; onderwerp: string; tekst: string } {
  const v: Record<string, string | number> = { naam, dag: bericht.dag };
  for (const [sleutel, waarde] of Object.entries(bericht.v ?? {})) {
    v[sleutel] =
      BEDRAGEN.has(sleutel) && typeof waarde === "number"
        ? formatMoney(waarde / 100, language)
        : waarde;
  }
  if (bericht.soort === "opleiding") {
    v.cursus = t(language, `bd.course.${bericht.v?.id}` as TextKey);
  }
  if (bericht.soort === "rit") {
    const stap = Number(bericht.v?.stap ?? 0);
    v.stap = stap > 0 ? `+${stap}` : stap < 0 ? `${stap}` : "±0";
  }
  const soort = bericht.soort;
  const tekst =
    soort === "afloop"
      ? t(language, bericht.v?.verlengt ? "tb.msg.afloop.ja" : "tb.msg.afloop.nee")
      : t(language, `tb.msg.${soort}.b` as TextKey, v);
  return {
    van: t(language, `tb.from.${AFZENDER[soort]}` as TextKey),
    onderwerp: t(language, `tb.msg.${soort}.t` as TextKey, v),
    tekst,
  };
}

/** Welke berichten goed nieuws, slecht nieuws of gewoon nieuws zijn: de kleur van de stip. */
function toon(bericht: Bericht): "goed" | "slecht" | "gewoon" {
  switch (bericht.soort) {
    case "kas":
    case "vertrek":
    case "vervallen":
    case "ontevreden":
    case "slijtage":
      return "slecht";
    case "afloop":
      return bericht.v?.verlengt ? "gewoon" : "slecht";
    case "dagrapport":
      return Number(bericht.v?.resultaat ?? 0) < 0 ? "slecht" : "goed";
    case "rit":
      return Number(bericht.v?.stap ?? 0) < 0 ? "slecht" : "goed";
    case "opleiding":
    case "niveau":
    case "verlengd":
    case "werkplaats":
      return "goed";
    default:
      return "gewoon";
  }
}

export function BedrijfTelefoon({
  beeld,
  language,
  onGelezen,
}: {
  beeld: BedrijfBeeld;
  language: Language;
  /** Een bericht gelezen; zonder id het hele postvak. */
  onGelezen(id?: number): void;
}): JSX.Element {
  const [tab, setTab] = useState<Tab>("bedrijf");
  const tr = (key: TextKey, vars?: Record<string, string | number>): string =>
    t(language, key, vars);

  return (
    <div className="tb" data-hit>
      <div className="tb-tabs" role="tablist">
        {(["bedrijf", "geld", "post"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {tr(
              id === "bedrijf"
                ? "tb.tab.company"
                : id === "geld"
                  ? "tb.tab.money"
                  : "tb.tab.mail",
            )}
            {id === "post" && beeld.ongelezen > 0 && (
              <i className="tb-teller">{beeld.ongelezen}</i>
            )}
          </button>
        ))}
      </div>
      {tab === "bedrijf" ? (
        <Overzicht beeld={beeld} language={language} />
      ) : tab === "geld" ? (
        <Geld beeld={beeld} language={language} />
      ) : (
        <Post beeld={beeld} language={language} onGelezen={onGelezen} />
      )}
    </div>
  );
}

function Overzicht({
  beeld,
  language,
}: {
  beeld: BedrijfBeeld;
  language: Language;
}): JSX.Element {
  const tr = (key: TextKey, vars?: Record<string, string | number>): string =>
    t(language, key, vars);
  const geld = (c: number): string => formatMoney(c / 100, language);
  const weg = beeld.personeel.ziek + beeld.personeel.cursus;
  return (
    <>
      <div className="tb-kop">
        <b>{beeld.naam}</b>
        <span>{tr("tb.levelDay", { n: beeld.niveau, dag: beeld.dag })}</span>
        <i className="tb-meter" aria-hidden="true">
          <i style={{ width: `${Math.round(beeld.xpDeel * 100)}%` }} />
        </i>
      </div>
      <div className="app-tegels">
        <div className="breed">
          <b className={beeld.kas < 0 ? "late" : undefined}>{geld(beeld.kas)}</b>
          <span>{tr("tb.cash")}</span>
        </div>
        <div>
          <b>{beeld.reputatie}</b>
          <span>{tr("tb.reputation")}</span>
        </div>
        <div>
          <b>
            {beeld.bussen.inzetbaar}
            <small>/ {beeld.bussen.totaal}</small>
          </b>
          <span>{tr("tb.buses")}</span>
        </div>
      </div>
      {(beeld.bussen.werkplaats > 0 || beeld.bussen.aandacht > 0) && (
        <p className="tb-noot">
          {[
            beeld.bussen.werkplaats > 0 &&
              tr("tb.busWorkshop", { n: beeld.bussen.werkplaats }),
            beeld.bussen.aandacht > 0 &&
              tr("tb.busAttention", { n: beeld.bussen.aandacht }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="app-label tb-sectie">{tr("tb.staff")}</p>
      <p className="tb-regel">
        {tr("tb.staffLine", {
          c: beeld.personeel.chauffeurs,
          m: beeld.personeel.monteurs,
        })}
        {weg > 0 && <em> · {tr("tb.staffAway", { n: weg })}</em>}
      </p>
      <p className="app-label tb-sectie">{tr("tb.contracts")}</p>
      {beeld.concessies.length === 0 ? (
        <p className="tb-leeg">{tr("tb.noContracts")}</p>
      ) : (
        <div className="app-lijst">
          {beeld.concessies.map((c) => (
            <div className="tb-rij" key={`${c.kaart}|${c.lijn}`}>
              <span className="tb-lijn">{c.lijn}</span>
              <span className="tb-wat">{c.kaart}</span>
              <span className={`tb-bedrag ${c.dagenOver <= 3 ? "min" : ""}`}>
                {c.dagenOver <= 0
                  ? tr("tb.lastDay")
                  : c.dagenOver === 1
                    ? tr("tb.oneDayLeft")
                    : tr("tb.daysLeft", { n: c.dagenOver })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Geld({
  beeld,
  language,
}: {
  beeld: BedrijfBeeld;
  language: Language;
}): JSX.Element {
  const tr = (key: TextKey, vars?: Record<string, string | number>): string =>
    t(language, key, vars);
  const geld = (c: number): string => formatMoney(c / 100, language);
  const v = beeld.vandaag;
  const grootste = Math.max(1, ...beeld.week.map((d) => Math.abs(d.resultaat)));
  return (
    <>
      <div className="app-tegels">
        <div className="breed">
          <b className={v.resultaat < 0 ? "late" : "ontime"}>
            {v.resultaat > 0 ? "+" : ""}
            {geld(v.resultaat)}
          </b>
          <span>{tr("tb.today")}</span>
        </div>
      </div>
      <div className="tb-staat">
        <span>{tr("tb.income")}</span>
        <b>{geld(v.vergoeding)}</b>
        <span>{tr("tb.costs")}</span>
        <b>−{geld(v.kosten)}</b>
        <span>{tr("tb.hours")}</span>
        <b>{v.uren.toLocaleString(language)}</b>
        <span>{tr("tb.open")}</span>
        <b className={v.openDiensten > 0 ? "min" : undefined}>
          {v.openDiensten} / {v.diensten}
        </b>
      </div>

      <p className="app-label tb-sectie">{tr("tb.week")}</p>
      {beeld.week.length === 0 ? (
        <p className="tb-leeg">{tr("tb.noWeek")}</p>
      ) : (
        /*
         * Staafjes vanaf een nullijn in het midden: een verliesdag hangt
         * eronder. Geen as met bedragen; het getal staat bij aanwijzen in de
         * titel en het precieze bedrag in de boekingen hieronder.
         */
        <div className="tb-week">
          {beeld.week.map((d) => {
            const hoog = Math.round((Math.abs(d.resultaat) / grootste) * 100) / 2;
            return (
              <div key={d.dag} title={`${tr("tb.dayN", { n: d.dag })}: ${geld(d.resultaat)}`}>
                <i
                  className={d.resultaat < 0 ? "min" : "plus"}
                  style={{
                    height: `${Math.max(2, hoog)}%`,
                    [d.resultaat < 0 ? "top" : "bottom"]: "50%",
                  }}
                />
                <small>{d.dag}</small>
              </div>
            );
          })}
        </div>
      )}

      <p className="app-label tb-sectie">{tr("tb.bookings")}</p>
      <div className="app-lijst">
        {beeld.boekingen.map((b, i) => (
          <div className="tb-rij" key={`${b.dag}-${i}`}>
            <span className="tb-lijn">{b.dag}</span>
            <span className="tb-wat">
              <b>{tr(`bd.kind.${b.soort}` as TextKey)}</b>
              <small>{b.wat}</small>
            </span>
            <span className={`tb-bedrag ${b.bedrag < 0 ? "min" : b.bedrag > 0 ? "plus" : ""}`}>
              {b.bedrag === 0 ? "" : geld(b.bedrag)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Post({
  beeld,
  language,
  onGelezen,
}: {
  beeld: BedrijfBeeld;
  language: Language;
  onGelezen(id?: number): void;
}): JSX.Element {
  const [open, setOpen] = useState<number>();
  if (beeld.post.length === 0) {
    return <p className="tb-leeg">{t(language, "tb.noMail")}</p>;
  }
  return (
    <>
      {beeld.ongelezen > 0 && (
        <button type="button" className="tb-allesgelezen" onClick={() => onGelezen()}>
          {t(language, "tb.allRead")}
        </button>
      )}
      <div className="tb-post">
        {beeld.post.map((bericht) => {
          const { van, onderwerp, tekst } = berichtTekst(bericht, beeld.naam, language);
          const isOpen = open === bericht.id;
          return (
            <button
              key={bericht.id}
              type="button"
              className={`tb-bericht ${bericht.gelezen ? "" : "nieuw"} ${isOpen ? "open" : ""}`}
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? undefined : bericht.id);
                if (!bericht.gelezen) onGelezen(bericht.id);
              }}
            >
              <i className={`tb-stip ${toon(bericht)}`} aria-hidden="true" />
              <span className="tb-van">
                {van}
                <small>{t(language, "tb.dayN", { n: bericht.dag })}</small>
              </span>
              <b>{onderwerp}</b>
              {isOpen && <p>{tekst}</p>}
            </button>
          );
        })}
      </div>
    </>
  );
}
