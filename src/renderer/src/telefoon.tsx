import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import type { MapGeometry } from "../../core/geo";
import type { Duty } from "../../core/types";
import type { LiveStatus } from "../../core/live";
import { wisselgeld, type Kaartje, type Kaartset } from "../../shared/kaartjes";
import { formatTime } from "../../shared/format";
import { punctuality } from "../../shared/status";
import { t, type Language, type TextKey } from "../../shared/i18n";
import {
  LEGE_TELEFOON,
  type AanmeldUitslag,
  type OmsiToets,
  type TelefoonStand,
} from "../../shared/telefoon";
import type { Verkoop } from "../../core/live";
import { NavKaart, type NavFrame, type RitStand } from "./navigatie";
import type { Manoeuvre } from "./RouteMap";

/*
 * De telefoon: het toestel in de bus, los van het venster waarin hij staat.
 *
 * WAAROM EEN EIGEN BESTAND
 * De telefoon staat in de overlay en op een echte telefoon of tablet
 * (apparaat.tsx). Luc wilde er niet alleen naar kunnen kijken maar hem ook
 * kunnen gebruiken: aanmelden, tekenen voor je dienst, pauze nemen, kaartjes
 * verkopen. Dat werkt alleen als beide precies hetzelfde toestel zijn, dus
 * staan de onderdelen hier.
 *
 * WAT HIER NIET STAAT
 * De stand -- aangemeld, getekend, pauze, IBIS -- staat in het hoofdproces en
 * komt in elk beeld mee. Zo ziet de overlay dat je je op je iPad hebt
 * aangemeld, en andersom. De knoppen hieronder zeggen het alleen maar door via
 * `acties`; welke weg dat is (de brug of het netwerk) weet het venster.
 */

/** De apps op het toestel, in de volgorde van het balkje onderin. */
export type TelefoonApp =
  | "kaart"
  | "dienst"
  | "pauze"
  | "rit"
  | "kaartjes"
  | "apparaat";

/** Een app die er alleen in de overlay bij staat: "Bekijk op apparaat". */
export interface ExtraApp {
  id: TelefoonApp;
  label: TextKey;
  /** Het pad van het icoontje, 24 bij 24. */
  pad: string;
  /** Een stip op het icoon, zolang er iets loopt. */
  stip?: boolean;
  scherm: ReactNode;
}

/** Wat de telefoon mag doen. Het hoofdproces kijkt na en bewaart de stand. */
export interface TelefoonActies {
  /** Zonder pincode: alleen het nummer nakijken. Zie `AanmeldUitslag`. */
  aanmelden(nummer: string, pin?: string): Promise<AanmeldUitslag>;
  /** Geen nummer en pincode bekend; dan zonder aanmelden verder. */
  overslaan(): void;
  aanvaarden(): void;
  pauze(vanaf?: number): void;
  ibisKlaar(tripKey: string): void;
  /** Een toets van OMSI laten indrukken; zie `OmsiToets`. */
  toets(actie: OmsiToets): void;
}

/** Wat de telefoon van het beeld nodig heeft. */
export interface TelefoonFrame extends NavFrame {
  chauffeur?: { naam: string; personeelsnummer?: string; pincode?: string };
  telefoon?: TelefoonStand;
}


/**
 * Het toestel: aanmelden, de dienstopdracht, en daarna de apps met het balkje
 * onderin.
 *
 * De volgorde is het hele punt. Je meldt je aan, je tekent voor je dienst, en
 * pas daarna krijg je de kaart en de codes -- net als op een echte remise. Tot
 * dat gebeurd is staat er verder niets op, ook geen balk.
 */
export function Telefoon({
  frame,
  duty,
  geometry,
  rit,
  stand,
  acties,
  pixelScale,
  language,
  extra,
}: {
  frame: TelefoonFrame;
  duty?: Duty;
  geometry?: MapGeometry;
  rit: RitStand;
  stand: TelefoonStand;
  acties: TelefoonActies;
  pixelScale: number;
  language: Language;
  extra?: ExtraApp;
}): JSX.Element {
  const [app, setApp] = useState<TelefoonApp>("kaart");
  /*
   * De bocht en het laatste bord horen bij de kaart, maar worden hier bewaard:
   * ga je naar een andere app en weer terug, dan staat het bord dat je net
   * voorbij reed er nog.
   */
  const [manoeuvre, setManoeuvre] = useState<Manoeuvre>();
  const [limit, setLimit] = useState<number>();

  /*
   * De deur open is het moment van de kaartverkoop.
   *
   * Zolang je rijdt kijk je naar de kaart; zodra er iemand instapt heb je de
   * kaartjes nodig, en dan hoor je niet eerst een balkje onderin te moeten
   * zoeken. Alleen bij het opengaan: doe je de app daarna zelf dicht, dan
   * blijft dat zo tot de volgende halte.
   */
  const deurOpen = Boolean(frame.status?.doorsOpen);
  const deurStond = useRef(deurOpen);
  useEffect(() => {
    if (deurOpen && !deurStond.current) setApp("kaartjes");
    /*
     * En dicht is rijden. Dan hoort de kaart er weer te staan -- alleen als je
     * nog bij de kaartjes bent; was je zelf al naar een andere app gegaan, dan
     * blijf je daar.
     */
    if (!deurOpen && deurStond.current) {
      setApp((huidig) => (huidig === "kaartjes" ? "kaart" : huidig));
    }
    deurStond.current = deurOpen;
  }, [deurOpen]);

  if (!stand.aangemeld) {
    return <AanmeldPaneel stand={stand} acties={acties} language={language} />;
  }
  if (duty && !stand.aanvaard) {
    return (
      <DienstOpdracht
        duty={duty}
        chauffeur={frame.chauffeur}
        language={language}
        onAanvaard={acties.aanvaarden}
      />
    );
  }

  return (
    <>
      {app !== "kaart" ? (
        <div className="app-scherm">
          {app === "dienst" ? (
            <DienstApp duty={duty} status={frame.status} language={language} />
          ) : app === "pauze" ? (
            <PauzeApp
              duty={duty}
              status={frame.status}
              language={language}
              vanaf={stand.pauzeVanaf}
              onVanaf={acties.pauze}
            />
          ) : app === "kaartjes" ? (
            <KaartjesApp
              set={frame.kaartjes}
              keuze={frame.status?.ticketKeuze}
              verkoop={frame.status?.verkoop}
              opdracht={frame.status?.opdracht}
              acties={acties}
              language={language}
            />
          ) : extra && app === extra.id ? (
            extra.scherm
          ) : (
            <RitApp status={frame.status} language={language} />
          )}
        </div>
      ) : (
        <NavKaart
          frame={frame}
          duty={duty}
          geometry={geometry}
          rit={rit}
          pixelScale={pixelScale}
          language={language}
          manoeuvre={manoeuvre}
          onManoeuvre={setManoeuvre}
          limit={limit}
          onSpeedLimit={setLimit}
        />
      )}

      <Dock
        app={app}
        onApp={setApp}
        language={language}
        pauze={stand.pauzeVanaf !== undefined}
        extra={extra}
      />
    </>
  );
}

/** De lege stand, voor een beeld dat nog van een oudere app komt. */
export { LEGE_TELEFOON };

/**
 * Aanmelden op de telefoon.
 *
 * WAAROM DIT ER IS
 * Een dienst begon met een venster dat opengaat. Nu begint hij zoals hij bij een
 * echte remise begint: je meldt je aan met je personeelsnummer, je tekent voor
 * je dienst, en pas daarna krijg je te horen welke omloop je moet kiezen en
 * welke codes in de IBIS moeten. De volgorde is het hele punt -- de codes stonden
 * eerst in beeld voordat je wist of je ze nodig had.
 *
 * WAAROM HET NAKIJKEN NIET HIER GEBEURT
 * Ditzelfde cijferblok staat op een telefoon of tablet, en dat toestel hangt
 * aan het netwerk. Je pincode hoort daar niet heen, dus gaat wat je intoetst
 * naar de pc en komt alleen het antwoord terug. Hier is alleen bekend hoeveel
 * cijfers er in moeten, zodat de vakjes kloppen.
 *
 * Het cijferblok is groot met opzet. Dit gebeurt terwijl je al in de bus zit.
 */
function AanmeldPaneel({
  stand,
  acties,
  language,
}: {
  stand: TelefoonStand;
  acties: TelefoonActies;
  language: Language;
}): JSX.Element {
  const [stap, setStap] = useState<"nummer" | "pin">("nummer");
  /** Het nummer dat al goedgekeurd is; dat gaat bij de pincode weer mee. */
  const [nummer, setNummer] = useState("");
  const [ingevoerd, setIngevoerd] = useState("");
  const [fout, setFout] = useState(false);
  const [bezig, setBezig] = useState(false);
  const lengte = stap === "nummer" ? stand.nummerLengte : stand.pinLengte;

  /*
   * Zodra er genoeg cijfers staan wordt er gekeken. Geen bevestigknop: op een
   * terminal met een vaste codelengte is die overbodig, en je hebt één hand aan
   * het stuur.
   */
  useEffect(() => {
    if (!lengte || ingevoerd.length < lengte || bezig) return;
    const waarde = ingevoerd;
    setBezig(true);
    void acties
      .aanmelden(stap === "nummer" ? waarde : nummer, stap === "pin" ? waarde : undefined)
      .then((uitslag) => {
        setIngevoerd("");
        setFout(uitslag === "fout");
        if (uitslag === "nummer") {
          setNummer(waarde);
          setStap("pin");
        }
        // Bij "aangemeld" komt de stand uit het volgende beeld en is dit scherm weg.
      })
      .catch(() => {
        setIngevoerd("");
        setFout(true);
      })
      .finally(() => setBezig(false));
  }, [ingevoerd, lengte, bezig, stap, nummer, acties]);

  /* Zonder gegevens valt er niets na te kijken; dan maar door. */
  if (!stand.nummerLengte || !stand.pinLengte) {
    return (
      /*
       * data-hit, anders gebeurt er niets als je drukt.
       *
       * Het overlayvenster laat muisklikken door naar OMSI -- het ligt over het
       * hele scherm, dus een venster dat klikken opvangt vangt ze overal op.
       * Alleen waar `data-hit` staat wordt de muis even opgevraagd.
       */
      <div className="aanmelden" data-hit>
        <p className="aanmeld-uitleg">{t(language, "ovl.signonNone")}</p>
        <button type="button" className="aanmeld-door" onClick={acties.overslaan}>
          {t(language, "ovl.signonSkip")}
        </button>
      </div>
    );
  }

  const toets = (cijfer: string): void => {
    setFout(false);
    setIngevoerd((huidig) =>
      huidig.length >= lengte ? huidig : huidig + cijfer,
    );
  };

  return (
    <div className="aanmelden" data-hit>
      <p className="aanmeld-kop">{t(language, "ovl.signonTitle")}</p>
      <p className="aanmeld-uitleg">
        {t(language, stap === "nummer" ? "ovl.signonNumber" : "ovl.signonPin")}
      </p>

      <div className={`aanmeld-vakjes ${fout ? "fout" : ""}`}>
        {Array.from({ length: lengte }, (_, i) => (
          <span key={i} className={i < ingevoerd.length ? "vol" : ""}>
            {/* Het nummer lees je terug, de pincode niet -- die typ je blind. */}
            {i < ingevoerd.length
              ? stap === "nummer"
                ? ingevoerd[i]
                : "\u2022"
              : ""}
          </span>
        ))}
      </div>

      {fout && <p className="aanmeld-fout">{t(language, "ovl.signonWrong")}</p>}

      <div className="cijferblok">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((cijfer) => (
          <button key={cijfer} type="button" onClick={() => toets(cijfer)}>
            {cijfer}
          </button>
        ))}
        <button type="button" className="leeg" onClick={() => setIngevoerd("")}>
          {t(language, "ovl.signonClear")}
        </button>
        <button type="button" onClick={() => toets("0")}>
          0
        </button>
        <button
          type="button"
          className="leeg"
          onClick={() => setIngevoerd((h) => h.slice(0, -1))}
        >
          ←
        </button>
      </div>
    </div>
  );
}

/**
 * Het balkje onderin: waarmee je van app wisselt.
 *
 * Vaste plekken, altijd dezelfde volgorde. Tijdens het rijden wil je niet
 * zoeken, dus de kaart staat vooraan en verandert nooit van plaats. Loopt er een
 * pauze, dan blijft dat zichtbaar ook als je ergens anders kijkt.
 */
function Dock({
  app,
  onApp,
  language,
  pauze,
  extra,
}: {
  app: TelefoonApp;
  onApp(app: TelefoonApp): void;
  language: Language;
  pauze: boolean;
  /** Een app die er alleen in de overlay bij staat; zie `Telefoon`. */
  extra?: ExtraApp;
}): JSX.Element {
  const apps: Array<{
    id: TelefoonApp;
    label: Parameters<typeof t>[1];
    pad: string;
  }> = [
    {
      id: "kaart",
      label: "ovl.appMap",
      pad: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.2 6 2v11.6l-6-2V6.2Z",
    },
    {
      id: "dienst",
      label: "ovl.appDuty",
      pad: "M5 3h14v18l-7-4-7 4V3Zm2 2v12.2l5-2.9 5 2.9V5H7Z",
    },
    {
      id: "pauze",
      label: "ovl.appBreak",
      pad: "M8 5h2v14H8V5Zm6 0h2v14h-2V5Z",
    },
    {
      id: "rit",
      label: "ovl.appTrip",
      pad: "M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z",
    },
    {
      id: "kaartjes",
      label: "ovl.appTickets",
      // Een kaartje met een knip in de zijkant, zoals in Icoon.tsx.
      pad: "M3 6.5h18v4a2 2 0 0 0 0 3.8v4H3v-4a2 2 0 0 0 0-3.8ZM5 8.5v1.1a4 4 0 0 1 0 5.4v1.1h14v-1.1a4 4 0 0 1 0-5.4V8.5Zm4 1.6h1.6v4.6H9Zm4 0h1.6v4.6H13Z",
    },
  ];
  if (extra) apps.push({ id: extra.id, label: extra.label, pad: extra.pad });
  return (
    <nav className="dock" data-hit>
      {apps.map((item) => (
        <button
          key={item.id}
          type="button"
          className="dock-knop"
          aria-pressed={app === item.id}
          title={t(language, item.label)}
          aria-label={t(language, item.label)}
          onClick={() => onApp(item.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.pad} fill="currentColor" fillRule="evenodd" />
          </svg>
          {((item.id === "pauze" && pauze) ||
            (item.id === extra?.id && extra?.stip)) && (
            <i className="dock-stip" aria-hidden="true" />
          )}
        </button>
      ))}
    </nav>
  );
}

/**
 * De hele dienst: elke rit met zijn tijden, en waar je pauze hebt.
 *
 * Een dienst is ook een route -- door de dag heen in plaats van door de stad --
 * en de overlay heeft voor een route al een vorm: de blauwe lijn met een punt
 * op elke halte, zoals op de kaart. Die lijn loopt hier langs de ritten, vol
 * waar je al geweest bent en flauw voor wat nog komt, zodat je in een oogopslag
 * ziet hoever de dag is. Een tweede kleur is er niet bij nodig.
 */
function DienstApp({
  duty,
  status,
  language,
}: {
  duty?: Duty;
  status?: LiveStatus;
  language: Language;
}): JSX.Element {
  if (!duty) return <div className="empty">{t(language, "ovl.appNoDuty")}</div>;
  const nuIndex = status?.legIndex;
  return (
    <div className="app-lijst met-rail">
      {duty.legs.map((leg, index) => (
        <div
          key={`${leg.tripFile}-${index}`}
          className={`app-rit ${nuIndex === index ? "nu" : ""} ${
            nuIndex !== undefined && index < nuIndex ? "gereden" : ""
          }`}
        >
          <i className="app-punt" aria-hidden="true" />
          <span className="app-rit-tijd">{formatTime(leg.departure)}</span>
          <span className="app-rit-naar">
            <b>{leg.terminus}</b>
            <small>
              {t(language, "ovl.appLine", { line: leg.lineNumber })} ·{" "}
              {t(language, "ovl.appStops", { count: leg.stops.length })}
            </small>
          </span>
          <span className="app-rit-aan">{formatTime(leg.arrival)}</span>
          {leg.layoverBefore > 0 && (
            <span className="app-pauzeblok">
              {t(language, "ovl.appLayover", { minutes: leg.layoverBefore })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Pauze houden, met de tijd die er volgens de dienstregeling voor staat.
 *
 * Niets verzonnen: elke rit draagt in `layoverBefore` hoeveel minuten er op het
 * eindpunt tussen zit. De klok loopt op speltijd en niet op die van Windows --
 * OMSI kan sneller of langzamer lopen, en dan is een pauze van tien minuten op
 * je polshorloge geen pauze van tien minuten in de dienst.
 */
function PauzeApp({
  duty,
  status,
  language,
  vanaf,
  onVanaf,
}: {
  duty?: Duty;
  status?: LiveStatus;
  language: Language;
  vanaf?: number;
  onVanaf(vanaf: number | undefined): void;
}): JSX.Element {
  const klok = status?.clockMinutes;
  const volgende = duty?.legs[(status?.legIndex ?? 0) + 1];
  const staat = volgende?.layoverBefore ?? 0;
  const bezig =
    vanaf !== undefined && klok !== undefined
      ? Math.max(0, klok - vanaf)
      : undefined;
  const over = bezig !== undefined ? staat - bezig : undefined;

  /*
   * Twee grote getallen naast elkaar zeiden allebei half zo veel. Nu is er er
   * een: een ring die volloopt zoals de pauze volloopt. Groen zolang je binnen
   * de tijd zit, rood zodra je eroverheen gaat -- dezelfde twee kleuren waarmee
   * de overlay verderop over tijd praat, en geen andere. In de ring staat hoe
   * lang je staat, eronder wat dat betekent.
   */
  const deel =
    staat > 0 && bezig !== undefined ? Math.min(1, bezig / staat) : 0;
  const stand =
    bezig === undefined
      ? "stil"
      : over !== undefined && over < 0
        ? "late"
        : "ontime";

  return (
    // data-hit om dezelfde reden als bij de kaartjes: anders gaat "Pauze
    // starten" door de telefoon heen naar OMSI en begint er niets.
    <div className="app-pauze" data-hit>
      <div
        className={`pauze-ring ${stand}`}
        style={{ "--deel": deel } as CSSProperties}
      >
        {/*
          Hele minuten. De klok van OMSI komt in seconden binnen, dus `bezig` is
          een breuk: op het toestel stond "464.0222666666666 min" in de ring.
        */}
        <b>{Math.round(bezig ?? staat)}</b>
        <span>min</span>
      </div>

      <span className="app-label">
        {over === undefined
          ? t(language, "ovl.appBreakDue")
          : over >= 0
            ? t(language, "ovl.appBreakLeft", { minutes: Math.round(over) })
            : t(language, "ovl.appBreakOver", { minutes: Math.round(-over) })}
      </span>

      {bezig !== undefined ? (
        <button
          type="button"
          className="app-knop"
          onClick={() => onVanaf(undefined)}
        >
          {t(language, "ovl.appBreakStop")}
        </button>
      ) : (
        <button
          type="button"
          className="app-knop primair"
          disabled={klok === undefined}
          onClick={() => onVanaf(klok)}
        >
          {t(language, "ovl.appBreakStart")}
        </button>
      )}

      {/*
        Waar je voor staat te wachten. Een pauze is geen doel op zich -- je houdt
        hem om op tijd aan de volgende rit te beginnen -- dus staat die rit
        eronder, in dezelfde regel als in de dienst.
      */}
      {volgende && (
        <div className="app-volgende">
          <span className="app-label">{t(language, "ovl.appNextTrip")}</span>
          <div className="app-lijst">
            <div className="app-rit">
              <span className="app-rit-tijd">
                {formatTime(volgende.departure)}
              </span>
              <span className="app-rit-naar">
                <b>{volgende.terminus}</b>
                <small>
                  {t(language, "ovl.appLine", { line: volgende.lineNumber })} ·{" "}
                  {t(language, "ovl.appStops", {
                    count: volgende.stops.length,
                  })}
                </small>
              </span>
              <span className="app-rit-aan">
                {formatTime(volgende.arrival)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hoe deze rit loopt: wat de bus doorgeeft, in cijfers.
 *
 * Dit was een lijst label-waarde, en die las braaf: vijf grijze regels die er
 * allemaal even belangrijk uitzagen. Het dienstpaneel heeft al een vorm voor
 * een getal dat ertoe doet -- de tegel met een groot cijfer en een klein
 * onderschrift -- en die vorm hoort hier net zo goed. Geen nieuw middel dus,
 * hetzelfde middel op volle sterkte. De vertraging staat bovenaan en over de
 * hele breedte, want dat is het getal waar het om draait, en hij draagt de
 * tijdkleur: de enige kleur die in deze overlay iets betekent.
 */
function RitApp({
  status,
  language,
}: {
  status?: LiveStatus;
  language: Language;
}): JSX.Element {
  if (!status) return <div className="empty">{t(language, "ovl.noData")}</div>;
  const stand = punctuality(status.deltaSeconds);
  const klasse =
    stand === "laat" ? "late" : stand === "vroeg" ? "early" : "ontime";
  const minuten = Math.round(status.delayMinutes);
  const leg = status.leg;
  const at = status.stopIndex;
  return (
    <div className="app-ritscherm">
      <div className="app-tegels">
        <div className="breed">
          <b className={klasse}>
            {minuten > 0 ? `+${minuten}` : minuten}
            <small>min</small>
          </b>
          <span>{t(language, "ovl.appDelay")}</span>
        </div>
        <div>
          <b>
            {Math.max(0, Math.round(status.speedKmh))}
            <small>km/u</small>
          </b>
          <span>{t(language, "ovl.appSpeed")}</span>
        </div>
        <div>
          <b>{status.passengers}</b>
          <span>{t(language, "ovl.appPassengers")}</span>
        </div>
        <div>
          <b>
            {status.stopIndex ?? 0}
            <small>/ {status.stopsTotal}</small>
          </b>
          <span>{t(language, "ovl.appStopsDone")}</span>
        </div>
        <div>
          <b>
            {Math.round(status.odometerKm)}
            <small>km</small>
          </b>
          <span>{t(language, "ovl.appOdometer")}</span>
        </div>
        {/*
          Tank of accu, niet allebei. Een elektrische bus heeft geen tank en een
          dieselbus geen accustand; wat de bus doorgeeft bepaalt wat er staat. De
          kleur is dezelfde rode als bij de tijd -- ook hier betekent hij "je
          gaat het niet halen".

          Geeft de bus geen van beide door, dan staat er niets. Een tegel met
          een streepje erin is erger dan een tegel minder.
        */}
        {Number.isFinite(status.battery ?? status.fuel) && (
          <div>
            <b
              className={
                (status.battery ?? status.fuel) < 0.1 ? "late" : undefined
              }
            >
              {Math.round((status.battery ?? status.fuel) * 100)}
              <small>%</small>
            </b>
            <span>
              {t(
                language,
                status.battery !== undefined ? "ovl.appBattery" : "ovl.appFuel",
              )}
            </span>
          </div>
        )}
      </div>

      {/*
        En dan waar je langs komt. Dezelfde rail als bij de dienst, want het is
        hetzelfde soort ding: een route met punten erop. Wat je gehad hebt vervaagt,
        de halte waar je heen rijdt draagt de dikke punt.
      */}
      {leg && leg.stops.length > 0 && (
        <div className="app-haltes">
          <div className="app-lijst met-rail">
            {leg.stops.map((naam, index) => (
              <div
                key={`${naam}-${index}`}
                className={`app-rit halte ${at === index ? "nu" : ""} ${
                  at !== undefined && index < at ? "gereden" : ""
                }`}
              >
                <i className="app-punt" aria-hidden="true" />
                <span className="app-rit-tijd">
                  {formatTime(leg.stopTimes[index])}
                </span>
                <span className="app-halte-naam">{naam}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * De dienstopdracht: wat je gaat rijden, en je handtekening eronder.
 *
 * Alles wat je nodig hebt om te weten of dit jouw dienst is -- lijn, omloop,
 * vertrek, duur -- en verder niets. De codes voor de IBIS komen op het volgende
 * scherm, want die heb je pas nodig als je hebt getekend.
 */
function DienstOpdracht({
  duty,
  chauffeur,
  language,
  onAanvaard,
}: {
  duty: Duty;
  chauffeur?: { naam: string };
  language: Language;
  onAanvaard: () => void;
}): JSX.Element {
  const klok = (minuten: number): string => formatTime(minuten);
  return (
    <div className="opdracht" data-hit>
      <p className="opdracht-kop">{t(language, "ovl.dutyOrder")}</p>
      {chauffeur && <p className="opdracht-naam">{chauffeur.naam}</p>}

      <dl className="opdracht-lijst">
        <div>
          <dt>{t(language, "ovl.dutyLine")}</dt>
          <dd>
            {duty.lineNumbers.join(" / ") || duty.legs[0]?.lineNumber || "—"}
          </dd>
        </div>
        <div>
          <dt>{t(language, "ovl.dutyTour")}</dt>
          <dd>{duty.tourNumber || "—"}</dd>
        </div>
        <div>
          <dt>{t(language, "ovl.dutyStart")}</dt>
          <dd>{klok(duty.start)}</dd>
        </div>
        <div>
          <dt>{t(language, "ovl.dutyEnd")}</dt>
          <dd>{klok(duty.end)}</dd>
        </div>
        <div>
          <dt>{t(language, "ovl.dutyTrips")}</dt>
          <dd>{duty.legs.length}</dd>
        </div>
      </dl>

      <button type="button" className="opdracht-teken" onClick={onAanvaard}>
        {t(language, "ovl.dutyAccept")}
      </button>
    </div>
  );
}

/**
 * De kaartjes-app: wat kost dit kaartje, en wat krijgt hij terug.
 *
 * WAAROM DIT ZO WEINIG WEET
 * OMSI vertelt niet dat er iemand een kaartje wil, welk kaartje, of hoeveel geld
 * hij aangeeft. Nagemeten: geen enkele systeemvariabele gaat over kaartjes of
 * geld, de `PAX_`-variabelen gaan alleen over deuren, en het kaartprinterscript
 * van een bus krijgt van buiten alleen IBIS-timing, stroomrails en taal binnen.
 * Het spel zegt wat iemand wil met een geluidje en verder niets. Zie
 * `core/kaartjes.ts`.
 *
 * Wat de app dus niet doet: raden wat er gevraagd wordt. Wat hij wel doet: de
 * kaartsoorten van deze kaart met hun prijzen tonen, en het rekenwerk uit handen
 * nemen -- want dát is wat je achter het stuur niet wilt doen.
 *
 * Het wisselgeld staat uitgesplitst in munten en biljetten, grootste eerst. "Een
 * van twee euro, een van twintig cent" is bruikbaar terwijl je rijdt; "2,20"
 * moet je alsnog zelf uit de lade puzzelen.
 */

/** De munten in de geldwisselaar, zoals de bak in de bus ze heeft. */
const MUNTEN = [200, 100, 50, 20, 10, 5];

/**
 * De verkoop aan de deur, zoals het spel hem kent.
 *
 * WAAROM DIT ER IS
 * OMSI zet linksboven in beeld wat de passagier wil, wat het kost en wat hij
 * je in de hand drukt -- precies de drie dingen waar je op dat moment iets mee
 * moet. Dat stond niet in de app: die liet je het kaartje zelf opzoeken en het
 * bedrag zelf aantikken, terwijl het spel het allang wist. Nu komt het uit het
 * geheugen van OMSI mee (zie plugin/omsicareer.c) en staat het hier.
 *
 * De geldwisselaar eronder is die van de bus, in het klein: tik de munten aan
 * die je teruggeeft, en wat er nog terug moet telt af. Zo hoef je niet te
 * rekenen terwijl er iemand voor je staat.
 */
function Verkoopscherm({
  verkoop,
  set,
  opdracht,
  acties,
  language,
}: {
  verkoop: Verkoop;
  set: Kaartset;
  opdracht?: { nr: number; fout: boolean };
  acties: TelefoonActies;
  language: Language;
}): JSX.Element {
  /** Wat er met de geldwisselaar al teruggegeven is, in centen. */
  const [teruggegeven, setTeruggegeven] = useState(0);
  /** Hoeveel briefjes en munten van zijn geld je al aangenomen hebt. */
  const [aangenomen, setAangenomen] = useState(0);
  const prijs = Math.round(verkoop.prijs * 100);
  /*
   * De naam komt uit het kaartpakket van de kaart, de prijs uit het spel. Ze
   * horen gelijk te zijn; is dat niet zo, dan wijst de plek in het pakket naar
   * iets anders dan wat er verkocht wordt en noemen we liever geen naam dan de
   * verkeerde.
   */
  const uitHetPak = set.kaartjes[verkoop.kaartje];
  const kaartje =
    uitHetPak && Math.abs(Math.round(uitHetPak.prijs * 100) - prijs) <= 1
      ? uitHetPak
      : undefined;
  const gegeven = Math.round(verkoop.gegeven * 100);
  const terug = Math.max(0, gegeven - prijs);
  const rest = Math.max(0, terug - teruggegeven);
  const euro = (cent: number): string => (cent / 100).toFixed(2);
  /* Wat je bij elkaar zou pakken; de wisselaar telt het af zodra je tikt. */
  const voorstel = wisselgeld(rest);

  /*
   * Zijn geld als briefjes en munten. OMSI zegt alleen het bedrag; hoe dat in
   * zijn hand ligt, is de kleinste verzameling die dat bedrag maakt -- en dat
   * is precies wat iemand je aanreikt. Tik ze weg terwijl je ze aanneemt.
   */
  const stukken: number[] = [];
  for (const soort of wisselgeld(gegeven)) {
    for (let i = 0; i < soort.aantal; i += 1) stukken.push(soort.cent);
  }
  const open = stukken.slice(aangenomen);

  return (
    <div className="verkoop" data-hit>
      <p className="verkoop-kop">{t(language, "ovl.saleTitle")}</p>

      <div className="verkoop-kaartje">
        <b>{kaartje?.naam ?? t(language, "ovl.saleUnknown")}</b>
        <span>{euro(prijs)}</span>
      </div>

      <dl className="verkoop-geld">
        <div>
          <dt>{t(language, "ovl.saleTaken")}</dt>
          <dd>{euro(gegeven)}</dd>
        </div>
        <div className={rest > 0 ? "openstaand" : ""}>
          <dt>{t(language, "ovl.saleChange")}</dt>
          <dd>{euro(rest)}</dd>
        </div>
      </dl>

      {verkoop.slechtWisselgeld && (
        <p className="verkoop-mopper">{t(language, "ovl.saleBadChange")}</p>
      )}

      {open.length > 0 ? (
        <>
          <p className="app-label">{t(language, "ovl.saleTake")}</p>
          <div className="geld">
            {open.map((cent, index) => (
              <button
                key={`${cent}-${index}`}
                type="button"
                className={cent >= 500 ? "biljet" : "munt"}
                onClick={() => setAangenomen((al) => al + 1)}
              >
                {euro(cent)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {terug > 0 ? (
            <>
              <p className="app-label">{t(language, "ovl.saleGiveBack")}</p>
              {/* De geldwisselaar van de bus: een knop per munt. */}
              <div className="wisselaar">
                {MUNTEN.map((cent) => (
                  <button
                    key={cent}
                    type="button"
                    className={voorstel.some((m) => m.cent === cent) ? "raad" : undefined}
                    disabled={rest <= 0}
                    onClick={() => setTeruggegeven((al) => Math.min(terug, al + cent))}
                  >
                    {euro(cent)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="app-label">{t(language, "ovl.saleExact")}</p>
          )}

          {/*
            En dan in het spel zelf. Het kaartje geven en het wisselgeld
            teruggeven zijn toetsen van OMSI; de plugin drukt ze in, omdat die
            binnen het spel draait. Staat OMSI niet vooraan, dan gebeurt er
            niets en zegt het volgende beeld dat.
          */}
          <div className="verkoop-doen">
            <button
              type="button"
              className="app-knop primair"
              onClick={() => acties.toets("kaartje")}
            >
              {t(language, "ovl.saleGiveTicket")}
            </button>
            {terug > 0 && (
              <button
                type="button"
                className="app-knop"
                onClick={() => acties.toets("wisselgeld")}
              >
                {t(language, "ovl.saleGiveChangeKey")}
              </button>
            )}
          </div>

          <div className="verkoop-voet">
            {teruggegeven > 0 && (
              <button
                type="button"
                className="app-knop"
                onClick={() => setTeruggegeven(0)}
              >
                {t(language, "ovl.signonClear")}
              </button>
            )}
            {terug > 0 && rest === 0 && (
              <span className="verkoop-klaar">{t(language, "ovl.saleDone")}</span>
            )}
          </div>

          {opdracht?.fout && (
            <p className="verkoop-mopper">{t(language, "ovl.saleNotFront")}</p>
          )}
        </>
      )}
    </div>
  );
}

function KaartjesApp({
  set,
  keuze,
  verkoop,
  opdracht,
  acties,
  language,
}: {
  set?: Kaartset;
  /** Wat er in de bus gekozen is (GivenTicket); dan hoeft het hier niet nog eens. */
  keuze?: number;
  /** Wat er aan de deur verkocht wordt, uit het spel zelf; zie core/live.ts. */
  verkoop?: Verkoop;
  /** Hoe het de laatste toets in OMSI verging. */
  opdracht?: { nr: number; fout: boolean };
  acties: TelefoonActies;
  language: Language;
}): JSX.Element {
  const [gekozen, setGekozen] = useState<Kaartje>();
  /** Wat de passagier tot nu toe heeft aangegeven, in centen. */
  const [gegeven, setGegeven] = useState(0);

  /* Wisselt de kaart, dan slaat de vorige keuze nergens meer op. */
  useEffect(() => {
    setGekozen(undefined);
    setGegeven(0);
  }, [set?.naam]);

  /*
   * Een andere passagier aan de deur betekent opnieuw beginnen. De sleutel is
   * wat er aan hem verkocht wordt: een ander kaartje, een andere prijs of een
   * ander bedrag in zijn hand. Hij staat als `key` op het scherm hieronder, en
   * dan begint dat vanzelf met een schone lei.
   */
  const verkoopSleutel = verkoop
    ? `${verkoop.kaartje}|${verkoop.prijs}|${verkoop.gegeven}`
    : "";

  /*
   * Kiest de chauffeur het kaartje op de automaat in de bus, dan staat het hier
   * meteen goed. OMSI geeft die keuze door als plek in het kaartpakket
   * (`GivenTicket`); wat de passagier wil en waarmee hij betaalt -- de regel
   * die OMSI linksboven toont -- geeft het spel niet door, dus dat tel je zelf
   * aan met de knoppen hieronder.
   */
  const uitDeBus = keuze !== undefined ? set?.kaartjes[keuze] : undefined;
  useEffect(() => {
    if (!uitDeBus) return;
    setGekozen(uitDeBus);
    setGegeven(0);
  }, [uitDeBus]);

  if (!set || set.kaartjes.length === 0) {
    return <p className="app-leeg">{t(language, "ovl.ticketsNone")}</p>;
  }

  /*
   * Staat er iemand te betalen, dan is dit geen rekenmachine meer maar het
   * scherm van de verkoop: het spel weet welk kaartje hij wil, wat het kost en
   * wat hij gegeven heeft. Wat jij nog moet doen, is teruggeven.
   */
  if (verkoop) {
    return (
      <Verkoopscherm
        key={verkoopSleutel}
        verkoop={verkoop}
        set={set}
        opdracht={opdracht}
        acties={acties}
        language={language}
      />
    );
  }

  const prijs = gekozen ? Math.round(gekozen.prijs * 100) : 0;
  const terug = gegeven - prijs;
  const munten = terug > 0 ? wisselgeld(terug) : [];
  const euro = (cent: number): string => (cent / 100).toFixed(2);

  /* De coupures waarmee een passagier betaalt; grootste eerst zoals in de lade. */
  const COUPURES = [2000, 1000, 500, 200, 100, 50, 20, 10];

  return (
    /*
     * data-hit op het hele blok, net als het cijferblok: buiten de bewerkstand
     * vraagt de overlay de muis alleen op boven `[data-hit]`. Dat stond nergens
     * in deze app of erboven, en dus ging elke tik op een kaartje, een munt of
     * "Wissen" dwars door de telefoon heen de bus in. Het blok en niet alleen de
     * knoppen, want een lange lijst kaartsoorten wil je ook kunnen scrollen.
     */
    <div className="kaartjes" data-hit>
      {!gekozen ? (
        /*
         * Tegels en geen lijst: je zoekt met een blik en je tikt met een duim,
         * terwijl er iemand voor je staat. De prijs is het grootst, want daar
         * gaat het om.
         */
        <ul className="kaarttegels">
          {set.kaartjes.map((kaartje) => (
            <li key={kaartje.naam}>
              <button type="button" onClick={() => setGekozen(kaartje)}>
                <span className="kaartprijs">{kaartje.prijs.toFixed(2)}</span>
                <span className="kaartnaam">{kaartje.naam}</span>
                {kaartje.maxHaltes > 0 && (
                  <small>
                    {t(language, "ovl.ticketStops", { count: kaartje.maxHaltes })}
                  </small>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="kaartkop">
            <button
              type="button"
              className="kaartterug"
              onClick={() => {
                setGekozen(undefined);
                setGegeven(0);
              }}
            >
              ‹
            </button>
            <span className="kaartnaam">{gekozen.naam}</span>
            <span className="kaartprijs">{euro(prijs)}</span>
          </div>

          {/* Waarom het al gekozen is, zodat niemand denkt dat de app iets verzint. */}
          {uitDeBus === gekozen && (
            <p className="kaartbron">{t(language, "ovl.ticketFromBus")}</p>
          )}

          {/*
            Tik aan wat hij geeft. Optellen en niet vervangen: iemand geeft
            twee euro en dan nog een vijftig, en dat is drie handelingen aan
            de balie maar één bedrag.
          */}
          <div className="coupures">
            {COUPURES.map((cent) => (
              <button
                key={cent}
                type="button"
                onClick={() => setGegeven((t) => t + cent)}
              >
                {euro(cent)}
              </button>
            ))}
          </div>

          <div className="kaartsom">
            <span>{t(language, "ovl.ticketGiven")}</span>
            <b>{euro(gegeven)}</b>
            <button
              type="button"
              className="kaartwis"
              onClick={() => setGegeven(0)}
            >
              {t(language, "ovl.ticketClear")}
            </button>
          </div>

          {gegeven > 0 && (
            <div className={`kaartterugbedrag ${terug < 0 ? "tekort" : ""}`}>
              {terug < 0 ? (
                <>
                  <span>{t(language, "ovl.ticketShort")}</span>
                  <b>{euro(-terug)}</b>
                </>
              ) : (
                <>
                  <span>{t(language, "ovl.ticketChange")}</span>
                  <b>{euro(terug)}</b>
                  <div className="kaartmunten">
                    {munten.length === 0 ? (
                      <em>{t(language, "ovl.ticketExact")}</em>
                    ) : (
                      munten.map((m) => (
                        <span key={m.cent}>
                          {m.aantal}&times;&nbsp;{euro(m.cent)}
                        </span>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
