import { useEffect, useMemo, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import type { MapGeometry } from "../../core/geo";
import type { TripRoute } from "../../core/routing";
import type { CareerApi } from "../../shared/api";
import { DEFAULT_LANGUAGE, t, type Language } from "../../shared/i18n";
import { zetAnimaties, type Animaties } from "./animaties";
import { LanguageProvider } from "./language";
import { useRitStand, useStable } from "./navigatie";
import {
  LEGE_TELEFOON,
  Telefoon,
  type TelefoonActies,
  type TelefoonFrame,
} from "./telefoon";
import { dutyKeyOf } from "../../shared/telefoon";
import type { AanmeldUitslag } from "../../shared/telefoon";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "./theme.css";
import "./overlay.css";
import "./apparaat.css";

/*
 * De navigatie op een telefoon of tablet.
 *
 * Deze pagina draait niet in de app maar in de browser van het toestel, en
 * komt van de webserver in main/apparaat.ts. Hij laat dezelfde kaart zien als
 * de telefoon in de overlay -- zelfde onderdelen, zelfde sommen, zie
 * navigatie.tsx -- en krijgt elk beeld dat ook naar de overlay gaat, via een
 * stroom (`api/stroom`).
 *
 * Alle adressen zijn relatief. De pagina staat onder `/n/<sleutel>/`, en zo
 * gaat de sleutel vanzelf mee met alles wat hij vraagt.
 */

async function haal<T>(pad: string): Promise<T> {
  const antwoord = await fetch(pad, { cache: "no-store" });
  if (!antwoord.ok) throw new Error(`${pad}: ${antwoord.status}`);
  return (await antwoord.json()) as T;
}

/*
 * De kaart vraagt zijn routes aan de brug van de app, en die is er in een
 * browser niet. Hier staat wat ervoor in de plaats komt: de server kent de
 * dienst al, dus er gaat niets mee in de vraag.
 */
window.career = {
  routes: () => haal<TripRoute[] | null>("api/routes").then((routes) => routes ?? []),
  logboekMelden: async () => undefined,
} as unknown as CareerApi;

/**
 * Wat je op de telefoon doet -- aanmelden, tekenen, pauze, IBIS -- gaat naar de
 * pc, die het nakijkt en bewaart. Daardoor ziet de overlay het ook, en hoeft je
 * pincode niet over het netwerk: je toetst hem in, de pc zegt of hij klopt.
 */
async function stuur(opdracht: Record<string, unknown>): Promise<unknown> {
  const antwoord = await fetch("api/telefoon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opdracht),
  });
  if (!antwoord.ok) throw new Error(`telefoon: ${antwoord.status}`);
  return antwoord.json();
}

/** De manifest voor "Zet op beginscherm"; zie de server. */
const manifest = document.createElement("link");
manifest.rel = "manifest";
manifest.href = "manifest.webmanifest";
document.head.appendChild(manifest);

type Lijn = "bezig" | "ja" | "kwijt" | "verlopen";

/* De maat van het navigatiepaneel in de overlay; zie `shared/overlay.ts`. */
const PANEEL_BREED = 330;
const PANEEL_HOOG = 620;

function Apparaat(): JSX.Element {
  const [frame, setFrame] = useState<TelefoonFrame>({ connected: false });
  const [lijn, setLijn] = useState<Lijn>("bezig");
  const [taal, setTaal] = useState<Language>(DEFAULT_LANGUAGE);
  const acties = useMemo<TelefoonActies>(
    () => ({
      aanmelden: (nummer, pin) =>
        stuur({ wat: "aanmelden", nummer, pin }).then(
          (uitkomst) => (uitkomst as { uitslag: AanmeldUitslag }).uitslag,
        ),
      overslaan: () => void stuur({ wat: "overslaan" }).catch(() => undefined),
      aanvaarden: () => void stuur({ wat: "aanvaard" }).catch(() => undefined),
      pauze: (vanaf) => void stuur({ wat: "pauze", vanaf }).catch(() => undefined),
      ibisKlaar: (tripKey) => void stuur({ wat: "ibis", tripKey }).catch(() => undefined),
      toets: (actie) => void stuur({ wat: "toets", toets: actie }).catch(() => undefined),
      knoppenAan: () => void stuur({ wat: "busknoppen" }).catch(() => undefined),
    }),
    [],
  );

  useEffect(() => {
    void haal<{ taal: Language; animaties?: Animaties }>("api/start")
      .then((start) => {
        setTaal(start.taal);
        document.documentElement.lang = start.taal;
        zetAnimaties(start.animaties);
      })
      .catch(() => undefined);

    /*
     * Een stroom en geen vraag om de zoveel tijd: het hoofdproces stuurt alleen
     * als er iets verandert, en dat is precies wanneer de kaart moet bewegen.
     * Valt de verbinding weg -- de app dicht, de telefoon even uit het wifi --
     * dan probeert de browser het zelf opnieuw. Alleen een 404 geeft hij op, en
     * dat betekent dat er een nieuwe code is gemaakt.
     */
    const stroom = new EventSource("api/stroom");
    stroom.onopen = () => setLijn("ja");
    stroom.onerror = () =>
      setLijn(stroom.readyState === EventSource.CLOSED ? "verlopen" : "kwijt");
    stroom.onmessage = (bericht) => {
      try {
        setFrame(JSON.parse(bericht.data as string) as TelefoonFrame);
      } catch {
        // Een half bericht; het volgende komt zo.
      }
    };
    return () => stroom.close();
  }, []);

  const duty = useStable(frame.duty, dutyKeyOf(frame.duty));
  const verbonden = lijn === "ja";

  /*
   * De kaart van de dienst, eenmaal per kaart gehaald. Valt de verbinding weg,
   * dan blijft hij staan: de laatste stand met een melding erover zegt meer dan
   * een leeg scherm. Pas bij een andere kaart gaat hij weg.
   */
  const [geo, setGeo] = useState<{ kaart: string; geometrie: MapGeometry }>();
  const kaart = duty?.mapFolder;
  useEffect(() => {
    if (!kaart || !verbonden || geo?.kaart === kaart) return;
    let actief = true;
    void haal<MapGeometry | null>("api/geometrie")
      .then((gevonden) => {
        if (actief && gevonden) setGeo({ kaart, geometrie: gevonden });
      })
      .catch(() => undefined);
    return () => {
      actief = false;
    };
  }, [kaart, verbonden, geo?.kaart]);
  const geometry = geo && geo.kaart === kaart ? geo.geometrie : undefined;

  /*
   * `true`: de knop "IBIS ingevoerd" staat in het dienstpaneel van de overlay,
   * en dat paneel staat hier niet. Zodra het spel zegt dat de rit geladen is,
   * loopt hij op dit toestel.
   */
  const rit = useRitStand(frame, duty, true);
  const stand = frame.telefoon ?? LEGE_TELEFOON;

  /*
   * HETZELFDE PANEEL ALS OP DE PC, ALLEEN GROTER
   *
   * De overlay tekent zijn telefoon op 330 bij 620 beeldpunten (zie
   * `shared/overlay.ts`). Dit toestel tekende hetzelfde onderdeel, maar met
   * eigen maten eromheen: grotere knoppen, andere marges, een ander cijferblok.
   * Daardoor stond op de pc iets anders dan op de tablet, terwijl het dezelfde
   * app is.
   *
   * Nu krijgt het paneel hier precies dezelfde maat, en wordt het als geheel
   * vergroot tot het past. Wat je op de tablet ziet is dan letterlijk hetzelfde
   * beeld, alleen op armlengte in plaats van op een meter. `zoom` en niet
   * `transform`, want dan blijven de letters scherp; de kaart krijgt de factor
   * apart mee zodat ook die op de grote maat getekend wordt.
   */
  const [venster, setVenster] = useState({ breed: 0, hoog: 0 });
  useEffect(() => {
    const meet = (): void =>
      setVenster({ breed: window.innerWidth, hoog: window.innerHeight });
    meet();
    window.addEventListener("resize", meet);
    window.addEventListener("orientationchange", meet);
    return () => {
      window.removeEventListener("resize", meet);
      window.removeEventListener("orientationchange", meet);
    };
  }, []);
  const schaal =
    venster.breed > 0
      ? Math.max(1, Math.min(venster.breed / PANEEL_BREED, venster.hoog / PANEEL_HOOG))
      : 1;

  return (
    <LanguageProvider language={taal}>
      <main className="apparaat">
        {lijn !== "ja" && (
          <div className="apparaat-melding" role="status">
            {t(
              taal,
              lijn === "verlopen"
                ? "dev.expired"
                : lijn === "kwijt"
                  ? "dev.lost"
                  : "dev.connecting",
            )}
          </div>
        )}
        {duty ? (
          /*
           * Het hele toestel, niet alleen de kaart: aanmelden, de
           * dienstopdracht, en daarna de apps met het balkje onderin. Precies
           * wat er in de overlay staat, want het is hetzelfde onderdeel.
           */
          <div
            className="apparaat-telefoon"
            style={{
              width: PANEEL_BREED,
              height: PANEEL_HOOG,
              zoom: schaal,
            }}
          >
            {/*
              Dezelfde omhulsels als in de overlay -- `panel`, `panel-navigatie`
              en `panel-body` -- zodat de vormgeving uit overlay.css komt en niet
              hier nog eens beschreven staat. Alleen de titelbalk blijft weg: die
              is er om het venster te verslepen en te schalen, en daar is op een
              tablet niets te verslepen.
            */}
            <div className="panel panel-navigatie">
              <div className="panel-body">
                <Telefoon
                  frame={frame}
                  duty={duty}
                  geometry={geometry}
                  rit={rit}
                  stand={stand}
                  acties={acties}
                  pixelScale={schaal}
                  language={taal}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="apparaat-leeg">
            <b>OMSI Enhancer</b>
            <p>{t(taal, "dev.noDuty")}</p>
          </div>
        )}
      </main>
    </LanguageProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Apparaat />);
