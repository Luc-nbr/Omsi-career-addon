import { useEffect, useMemo, useState, type JSX } from "react";
import qrcode from "qrcode-generator";
import type { ApparaatStand } from "../../shared/api";
import { t, type Language } from "../../shared/i18n";

/*
 * "Bekijk op apparaat": de QR-code waarmee een telefoon of tablet de navigatie
 * opent. Hij staat op twee plekken -- in de telefoon van de overlay en in het
 * hoofdmenu van de app -- dus staat hij hier.
 */

/**
 * De navigatie op een telefoon of tablet.
 *
 * Deze app openen is de vraag om te delen: de server gaat aan (zie
 * main/apparaat.ts) en de QR-code verschijnt. Hij blijft aan als je naar een
 * andere app gaat -- de telefoon op het dashboard moet blijven werken terwijl
 * de overlay de kaart laat zien, of helemaal niets -- tot je hier op stoppen
 * drukt of de app afsluit.
 *
 * Elke twee tellen kijkt hij hoeveel toestellen er meekijken. Dat is ook het
 * antwoord op "doet hij het?": staat er een toestel, dan komt de kaart aan.
 */
export function ApparaatApp({
  language,
  onStand,
}: {
  language: Language;
  onStand(aan: boolean): void;
}): JSX.Element {
  const [stand, setStand] = useState<ApparaatStand>();
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let actief = true;
    const zet = (nieuw: ApparaatStand): void => {
      if (!actief) return;
      setStand(nieuw);
      onStand(nieuw.aan);
    };
    void window.career.apparaatStart().then(zet).catch(() => undefined);
    const klok = setInterval(
      () => void window.career.apparaatStand().then(zet).catch(() => undefined),
      2000,
    );
    return () => {
      actief = false;
      clearInterval(klok);
    };
  }, [onStand]);

  const doe = (werk: () => Promise<ApparaatStand>): void => {
    setBezig(true);
    void werk()
      .then((nieuw) => {
        setStand(nieuw);
        onStand(nieuw.aan);
      })
      .finally(() => setBezig(false));
  };

  if (!stand) return <div className="empty">{t(language, "dev.starting")}</div>;

  return (
    // data-hit om dezelfde reden als bij de pauze: anders gaat een klik door de telefoon heen naar OMSI.
    <div className="app-apparaat" data-hit>
      <b className="app-apparaat-kop">{t(language, "dev.title")}</b>
      {!stand.aan ? (
        <>
          <p className="app-label">
            {stand.fout
              ? t(language, "dev.error", { fout: stand.fout })
              : t(language, "dev.stopped")}
          </p>
          <button
            type="button"
            className="app-knop primair"
            disabled={bezig}
            onClick={() => doe(() => window.career.apparaatStart())}
          >
            {t(language, "dev.start")}
          </button>
        </>
      ) : !stand.url ? (
        <p className="app-label">{t(language, "dev.noAddress")}</p>
      ) : (
        <>
          <QrCode tekst={stand.url} label={t(language, "dev.qr")} />
          <span className="app-apparaat-uitleg">{t(language, "dev.scan")}</span>
          {/*
            Het adres er ook in letters bij: voor een camera die de code niet
            pakt, en om te zien of het wel het goede netwerk is.
          */}
          <code className="app-apparaat-url">{stand.url}</code>
          <span
            className={
              stand.kijkers > 0 ? "app-apparaat-kijkers aan" : "app-apparaat-kijkers"
            }
          >
            {stand.kijkers > 0
              ? t(language, "dev.watching", { count: stand.kijkers })
              : t(language, "dev.nobody")}
          </span>
          <p className="app-apparaat-noot">{t(language, "dev.wifi")}</p>
          <p className="app-apparaat-noot">{t(language, "dev.firewall")}</p>
          <div className="app-apparaat-knoppen">
            <button
              type="button"
              className="app-knop"
              disabled={bezig}
              title={t(language, "dev.newLinkHint")}
              onClick={() => doe(() => window.career.apparaatNieuw())}
            >
              {t(language, "dev.newLink")}
            </button>
            <button
              type="button"
              className="app-knop"
              disabled={bezig}
              onClick={() => doe(() => window.career.apparaatStop())}
            >
              {t(language, "dev.stop")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Een QR-code als SVG: zwart op wit met vier vakjes witte rand, want zo lezen
 * alle camera's hem -- ook in de donkere stand, waar een omgekeerde code door
 * een deel van de telefoons niet herkend wordt. Correctieniveau M: een
 * vlekje of een weerspiegeling op het scherm mag.
 */
export function QrCode({ tekst, label }: { tekst: string; label: string }): JSX.Element {
  const { maat, pad } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(tekst);
    code.make();
    const aantal = code.getModuleCount();
    const delen: string[] = [];
    for (let rij = 0; rij < aantal; rij += 1) {
      for (let kolom = 0; kolom < aantal; kolom += 1) {
        if (code.isDark(rij, kolom)) delen.push(`M${kolom + 4} ${rij + 4}h1v1h-1z`);
      }
    }
    return { maat: aantal + 8, pad: delen.join("") };
  }, [tekst]);
  return (
    <svg
      className="app-apparaat-qr"
      viewBox={`0 0 ${maat} ${maat}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={maat} height={maat} fill="#ffffff" />
      <path d={pad} fill="#000000" />
    </svg>
  );
}

