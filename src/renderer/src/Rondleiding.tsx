import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import { t, type Language, type TextKey } from "../../shared/i18n";
import "./rondleiding.css";

/**
 * De rondleiding voor wie de app voor het eerst opent.
 *
 * WAAROM
 * Wie binnenkomt ziet drie tegels, een staat van dienst en vier knoppen, en weet
 * nog niet wat een dienst in deze app is, dat hij zich in de bus moet aanmelden,
 * of dat de overlay als venster boven het spel hangt. Dat staat nu op één plek,
 * in een minuut, aan de dingen zelf uitgelegd: een lichtvlek op wat er besproken
 * wordt, met de uitleg ernaast.
 *
 * Over te slaan bij elke stap (ook met Esc), en daarna nooit meer vanzelf; het
 * vraagtekentje in de balk van het hoofdmenu laat hem opnieuw zien.
 */

interface Stap {
  /** Waar de lichtvlek op valt; zonder doel staat de uitleg in het midden. */
  doel?: string;
  titel: TextKey;
  tekst: TextKey;
  /** Een rijtje erbij. Genummerd als het een volgorde is, anders met stippen. */
  lijst?: TextKey[];
  volgorde?: boolean;
}

const STAPPEN: Stap[] = [
  { titel: "tour.welcomeTitle", tekst: "tour.welcomeText" },
  {
    doel: ".hub-tegel[data-modus='career']",
    titel: "tour.careerTitle",
    tekst: "tour.careerText",
  },
  {
    doel: ".hub-tegel[data-modus='service']",
    titel: "tour.serviceTitle",
    tekst: "tour.serviceText",
  },
  {
    doel: ".hub-tegel[data-modus='free']",
    titel: "tour.freeTitle",
    tekst: "tour.freeText",
  },
  { doel: ".hub-paneel", titel: "tour.recordTitle", tekst: "tour.recordText" },
  { doel: ".hub-knoppen", titel: "tour.buttonsTitle", tekst: "tour.buttonsText" },
  {
    titel: "tour.dutyTitle",
    tekst: "tour.dutyText",
    lijst: ["tour.duty1", "tour.duty2", "tour.duty3", "tour.duty4", "tour.duty5"],
    volgorde: true,
  },
  {
    titel: "tour.overlayTitle",
    tekst: "tour.overlayText",
    lijst: ["tour.overlay1", "tour.overlay2", "tour.overlay3"],
  },
  { doel: ".hub-hulp", titel: "tour.doneTitle", tekst: "tour.doneText" },
];

/** Hoeveel lucht de lichtvlek om zijn doel laat, en hoe ver de uitleg ervan staat. */
const RAND = 8;
const AFSTAND = 16;
const GOOT = 16;

interface Vak {
  x: number;
  y: number;
  w: number;
  h: number;
}

function meet(doel: string | undefined): Vak | undefined {
  if (!doel) return undefined;
  const element = document.querySelector(doel);
  if (!element) return undefined;
  const r = element.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return undefined;
  return { x: r.left - RAND, y: r.top - RAND, w: r.width + RAND * 2, h: r.height + RAND * 2 };
}

/**
 * Waar de uitleg komt: onder het doel als dat past, anders erboven, anders
 * ernaast, en zonder doel in het midden. Altijd helemaal in beeld.
 */
function plaats(vak: Vak | undefined, breed: number, hoog: number): { x: number; y: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const midden = { x: (W - breed) / 2, y: (H - hoog) / 2 };
  if (!vak) return midden;
  const houd = (waarde: number, max: number): number =>
    Math.min(Math.max(GOOT, waarde), Math.max(GOOT, max - GOOT));
  const x = houd(vak.x + vak.w / 2 - breed / 2, W - breed);
  if (vak.y + vak.h + AFSTAND + hoog <= H - GOOT) return { x, y: vak.y + vak.h + AFSTAND };
  if (vak.y - AFSTAND - hoog >= GOOT) return { x, y: vak.y - AFSTAND - hoog };
  const y = houd(vak.y + vak.h / 2 - hoog / 2, H - hoog);
  if (vak.x + vak.w + AFSTAND + breed <= W - GOOT) return { x: vak.x + vak.w + AFSTAND, y };
  if (vak.x - AFSTAND - breed >= GOOT) return { x: vak.x - AFSTAND - breed, y };
  return midden;
}

export function Rondleiding({
  language,
  naam,
  onKlaar,
}: {
  language: Language;
  /** De naam van de chauffeur, voor het welkom. */
  naam: string;
  /** Afgelopen of overgeslagen: in beide gevallen komt hij niet vanzelf terug. */
  onKlaar: () => void;
}): JSX.Element {
  const [index, setIndex] = useState(0);
  const [vak, setVak] = useState<Vak>();
  const [positie, setPositie] = useState<{ x: number; y: number }>();
  const kaart = useRef<HTMLDivElement>(null);
  const stap = STAPPEN[index];
  const laatste = index === STAPPEN.length - 1;

  const volgende = useCallback(() => {
    if (laatste) onKlaar();
    else setIndex((i) => Math.min(STAPPEN.length - 1, i + 1));
  }, [laatste, onKlaar]);
  const vorige = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /*
   * Meten bij elke stap en bij elke verandering van het venster. Eerst het doel
   * in beeld schuiven: in een klein venster scrolt het vel, en een lichtvlek op
   * iets wat onder de rand ligt, wijst naar niets.
   */
  useLayoutEffect(() => {
    const herbereken = (): void => {
      const nieuw = meet(stap.doel);
      setVak(nieuw);
      const k = kaart.current;
      if (k) setPositie(plaats(nieuw, k.offsetWidth, k.offsetHeight));
    };
    if (stap.doel) document.querySelector(stap.doel)?.scrollIntoView({ block: "nearest" });
    herbereken();
    window.addEventListener("resize", herbereken);
    return () => window.removeEventListener("resize", herbereken);
  }, [stap]);

  /*
   * De uitleg krijgt de focus, zodat de toetsen en een schermlezer bij de stap
   * zijn. Pas als hij een plek heeft: daarvoor staat hij verborgen, en een
   * verborgen element neemt geen focus aan -- bij de eerste stap ging die zo
   * verloren.
   */
  const geplaatst = positie !== undefined;
  useEffect(() => {
    if (geplaatst) kaart.current?.focus();
  }, [index, geplaatst]);

  useEffect(() => {
    const toets = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onKlaar();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        volgende();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        vorige();
      }
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [onKlaar, volgende, vorige]);

  /*
   * Zonder doel krimpt de lichtvlek tot een punt in het midden: dan ligt het
   * donker over alles, en schuift hij bij de volgende stap vandaar naar zijn
   * nieuwe plek in plaats van uit het niets op te duiken.
   */
  const gat: CSSProperties = vak
    ? { left: vak.x, top: vak.y, width: vak.w, height: vak.h }
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };

  const tr = (key: TextKey): string => t(language, key, { naam });

  return (
    <div className="rondleiding" role="presentation">
      <div className="rondleiding-gat" style={gat} data-leeg={vak ? undefined : "ja"} />
      <div
        ref={kaart}
        className="rondleiding-kaart"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rondleiding-titel"
        aria-describedby="rondleiding-tekst"
        tabIndex={-1}
        style={positie ? { left: positie.x, top: positie.y } : { visibility: "hidden" }}
      >
        {/* Waar je bent: de teller, en de stippen ernaast. */}
        <div className="rondleiding-kop">
          <p className="rondleiding-teller">
            {t(language, "tour.step", { nu: index + 1, totaal: STAPPEN.length })}
          </p>
          <span className="rondleiding-stippen" aria-hidden="true">
            {STAPPEN.map((_, i) => (
              <span key={i} data-nu={i === index ? "ja" : undefined} />
            ))}
          </span>
        </div>
        <h2 id="rondleiding-titel">{tr(stap.titel)}</h2>
        <p id="rondleiding-tekst" className="rondleiding-tekst">
          {tr(stap.tekst)}
        </p>
        {stap.lijst &&
          (stap.volgorde ? (
            <ol className="rondleiding-lijst">
              {stap.lijst.map((regel) => (
                <li key={regel}>{tr(regel)}</li>
              ))}
            </ol>
          ) : (
            <ul className="rondleiding-lijst">
              {stap.lijst.map((regel) => (
                <li key={regel}>{tr(regel)}</li>
              ))}
            </ul>
          ))}

        <div className="rondleiding-voet">
          {!laatste && (
            <button type="button" className="rondleiding-over" onClick={onKlaar}>
              {t(language, "tour.skip")}
            </button>
          )}
          {index > 0 && (
            <button type="button" className="rondleiding-terug" onClick={vorige}>
              {t(language, "tour.back")}
            </button>
          )}
          <button type="button" className="rondleiding-verder" onClick={volgende}>
            {t(
              language,
              index === 0 ? "tour.start" : laatste ? "tour.finish" : "tour.next",
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
