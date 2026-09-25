import { useEffect, useMemo, useRef, useState, type JSX } from "react";
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
      module: (id, aan) =>
        void stuur({ wat: "module", module: id, aan }).catch(() => undefined),
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
  const [poging, setPoging] = useState(0);
  const kaart = duty?.mapFolder;
  /*
   * De kaart van de dienst ophalen. Dat is een paar megabyte over de wifi van
   * een telefoon, en dat gaat weleens mis -- of het hoofdproces is de kaart op
   * dat moment nog aan het inlezen. Mislukte het, dan bleef het daarbij: niets
   * veranderde meer aan de voorwaarden van dit effect, dus er kwam geen tweede
   * poging en de kaart bleef leeg tot je de pagina ververste. Nu wordt het over
   * vijf tellen nog eens geprobeerd.
   */
  useEffect(() => {
    if (!kaart || !verbonden || geo?.kaart === kaart) return;
    let actief = true;
    let opnieuw: ReturnType<typeof setTimeout> | undefined;
    const nogEens = (): void => {
      if (actief) opnieuw = setTimeout(() => setPoging((n) => n + 1), 5000);
    };
    void haal<MapGeometry | null>("api/geometrie")
      .then((gevonden) => {
        if (!actief) return;
        if (gevonden) setGeo({ kaart, geometrie: gevonden });
        else nogEens();
      })
      .catch(() => nogEens());
    return () => {
      actief = false;
      if (opnieuw) clearTimeout(opnieuw);
    };
  }, [kaart, verbonden, geo?.kaart, poging]);
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
  const vak = useRef<HTMLElement | null>(null);
  const [ruimte, setRuimte] = useState({ breed: 0, hoog: 0 });
  useEffect(() => {
    const element = vak.current;
    if (!element) return;
    const meet = (): void =>
      setRuimte({ breed: element.clientWidth, hoog: element.clientHeight });
    meet();
    const kijker = new ResizeObserver(meet);
    kijker.observe(element);
    window.addEventListener("orientationchange", meet);
    return () => {
      kijker.disconnect();
      window.removeEventListener("orientationchange", meet);
    };
  }, []);
  /*
   * De vergroting: zo groot dat de knoppen dezelfde verhouding houden als in de
   * overlay, en niet groter dan het scherm aankan. Het paneel zelf wordt daarna
   * opgerekt tot het hele scherm -- dus breder dan de 330 van de pc als er
   * ruimte is, maar met alles erin op dezelfde maat. Zo vult hij het beeld
   * zonder dat het een ander scherm wordt.
   */
  const schaal =
    ruimte.breed > 0
      ? Math.min(ruimte.breed / PANEEL_BREED, ruimte.hoog / PANEEL_HOOG)
      : 1;
  const paneel =
    ruimte.breed > 0
      ? { breed: Math.floor(ruimte.breed / schaal), hoog: Math.floor(ruimte.hoog / schaal) }
      : { breed: PANEEL_BREED, hoog: PANEEL_HOOG };

  return (
    <LanguageProvider language={taal}>
      <main className="apparaat" ref={vak}>
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
              width: paneel.breed,
              height: paneel.hoog,
              zoom: schaal,
              /*
               * Hoe groot de letters van een apparaatschermpje hoogstens worden.
               * Op een breed scherm zou de breedte alleen ze zo groot maken dat
               * het toetsenbord eronder wegvalt; een zestiende van de hoogte van
               * het paneel houdt dezelfde verhouding aan als op de pc.
               */
              ["--paneel-letter-max" as string]: `${Math.round(paneel.hoog / 18)}px`,
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
