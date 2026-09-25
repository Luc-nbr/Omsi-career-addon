import {
  useEffect,
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
  PLUGIN_VERSIE,
  type AanmeldUitslag,
  type TelefoonStand,
} from "../../shared/telefoon";
import type { Verkoop } from "../../core/live";
import { NavKaart, stopName, type NavFrame, type RitStand } from "./navigatie";
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
  | "ibis"
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
  /**
    * Een knop van de bus indrukken: de naam waar het busscript op luistert,
    * zoals `IBIS_7` of `ticketprinter_button_enter`. Het hoofdproces kijkt na of
    * die naam bij deze bus hoort voordat er iets gebeurt.
    */
  toets(actie: string): void;
  /** De knoppen van de apparaten in de bus bereikbaar maken; zie core/bustoetsen.ts. */
  knoppenAan(): void;
  /** Een apparaat uit deze bus in de telefoon zetten, of er weer uit halen. */
  module(id: string, aan: boolean): void;
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
  /*
   * De telefoon springt niet meer vanzelf van app.
   *
   * Hij ging naar de kaartverkoop zodra een deur openging of er iemand aan de
   * balie kwam, en daarna weer terug naar de kaart. Dat klinkt behulpzaam, maar
   * het haalt het scherm weg waar je net naar keek -- je IBIS terwijl je hem aan
   * het intoetsen bent -- en op een tablet die naast je ligt is dat helemaal
   * onhandig. Op verzoek eruit: je kiest zelf met het balkje onderin.
   */

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
          {app === "ibis" ? (
            <IbisApp
              frame={frame}
              rit={rit}
              acties={acties}
              language={language}
            />
          ) : app === "dienst" ? (
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
              busKaartjes={frame.status?.busKaartjes}
              opdracht={frame.status?.opdracht}
              /*
               * Draait OMSI nog met een oudere plugin, dan komt de verkoop
               * helemaal niet door. Dat hoort de telefoon te zeggen in plaats
               * van stil te blijven.
               */
              pluginOud={
                frame.connected &&
                (frame.status?.pluginVersie ?? PLUGIN_VERSIE) < PLUGIN_VERSIE
              }
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
      id: "ibis",
      label: "ovl.appIbis",
      /* Een apparaat met een schermpje en toetsen eronder. */
      pad: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v6h14V5Zm0 8v2h3v-2Zm5 0v2h4v-2Zm6 0v2h3v-2ZM5 17v2h3v-2Zm5 0v2h4v-2Zm6 0v2h3v-2Z",
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
/*
 * En de briefjes. Die zitten niet in de wisselaar -- die geeft alleen munten --
 * maar ze horen er wel bij: krijg je een tientje voor een kaartje van 2,20, dan
 * gaat er een briefje van vijf terug en de rest uit de bak. Zonder deze rij was
 * zulk wisselgeld in de app niet af te tellen.
 */
const BRIEFJES = [2000, 1000, 500];

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
  busKaartjes,
  opdracht,
  acties,
  language,
}: {
  verkoop: Verkoop;
  set: Kaartset;
  busKaartjes?: string[];
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
   * Welk kaartje de klant wil. De naam komt uit het kaartpakket van de kaart,
   * de prijs uit het spel; het nummer erbij is de plek in dat pakket, en dat is
   * de knop die je op de automaat in de bus kiest.
   *
   * Kloppen de twee prijzen niet met elkaar, dan staat de naam er nog steeds --
   * je hebt op dat moment iets nodig -- maar met de waarschuwing erbij dat ze
   * uiteenlopen.
   */
  const kaartje = set.kaartjes[verkoop.kaartje];
  /*
   * Staat de automaat aan, dan draagt hij de namen die op zijn eigen knoppen
   * staan (zie `kaartnamenVan` in core/live.ts). Die gaan voor: dat is wat de
   * chauffeur in de bus ziet als hij het kaartje aanslaat.
   */
  const naam = (busKaartjes?.[verkoop.kaartje] ?? "").trim() || kaartje?.naam;
  const prijsWijktAf =
    kaartje !== undefined && Math.abs(Math.round(kaartje.prijs * 100) - prijs) > 1;
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
        <b>{naam ?? t(language, "ovl.saleUnknown")}</b>
        <span>{euro(prijs)}</span>
      </div>

      {/* Welke knop je op de automaat in de bus kiest. */}
      <p className="verkoop-automaat">
        {t(language, "ovl.saleMachine", { nummer: verkoop.kaartje + 1 })}
      </p>

      {prijsWijktAf && (
        <p className="verkoop-mopper">
          {t(language, "ovl.salePriceOff", {
            prijs: (kaartje?.prijs ?? 0).toFixed(2)
          })}
        </p>
      )}

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
              {/* De geldwisselaar van de bus: een knop per munt, en de briefjes erbij. */}
              <div className="wisselaar">
                {[...BRIEFJES, ...MUNTEN].map((cent) => (
                  <button
                    key={cent}
                    type="button"
                    className={[
                      voorstel.some((m) => m.cent === cent) ? "raad" : "",
                      BRIEFJES.includes(cent) ? "briefje" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
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
              onClick={() => acties.toets("ticket_give")}
            >
              {t(language, "ovl.saleGiveTicket")}
            </button>
            {terug > 0 && (
              <button
                type="button"
                className="app-knop"
                onClick={() => acties.toets("change_give")}
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


/**
 * De IBIS van de bus, op je telefoon of tablet.
 *
 * WAAROM ZO
 * Elke bus heeft een ander apparaat. Een MAN heeft een IBIS met een paar
 * regels, de Thueringer Wald-bus een LAWO met vier, en een moderne bus een
 * boordcomputer. Daarom spiegelt dit scherm wat de bus zelf doorgeeft -- de
 * regels zoals ze op het apparaat staan -- en verzint het er niets bij. Geeft
 * de bus niets door, dan staat er het scherm dat de app zelf kan vullen: lijn
 * en omloop, waar je heen rijdt, de eerstvolgende halte met de afstand, en hoe
 * je op de dienstregeling ligt.
 *
 * De toetsen zijn wel voor elke bus gelijk: OMSI heeft er zijn eigen
 * toetsindeling voor (`IBIS_0` tot `IBIS_9`, `IBIS_eingabe`, `IBIS_loeschen`
 * en de drie standen). De plugin drukt ze in -- zie `OMSI_TOETSEN` -- en dus
 * bedien je hem van de bank, van je iPad, zonder aan het stuur te zitten.
 */
/**
 * De naam van een apparaat, kort genoeg voor een knopje.
 *
 * De bus noemt ze naar zijn variabelen: `LAWO_display_line`, `afr_display`,
 * `ticketprinter_display`. Het staartje zegt niets meer dan "dit is een
 * schermpje", dus dat gaat eraf.
 */
function apparaatNaam(naam: string): string {
  const kort = naam
    .replace(/[_-]?(display|anzeige|scherm|line|zeile|text)s?[_-]?/gi, " ")
    .replace(/[_-]+/g, " ")
    .trim();
  return (kort || naam).slice(0, 14).toUpperCase();
}

function IbisApp({
  frame,
  rit,
  acties,
  language,
}: {
  frame: TelefoonFrame;
  rit: RitStand;
  acties: TelefoonActies;
  language: Language;
}): JSX.Element {
  const status = frame.status;
  const scherm = status?.ibisScherm;

  /*
   * Kent de app deze bus van binnen? Dan staat hier het apparaat zelf: het
   * schermpje met daaronder zijn eigen knoppen, op hun eigen plek en in hun
   * eigen kleur -- de AFR 200 met zijn gele kaartknoppen en zijn rode DRUCKEN.
   * Dat staat per bus in core/busprofiel.ts.
   *
   * Kent hij hem niet, dan blijft de generieke weg staan: het schermpje dat uit
   * de model.cfg van de bus komt, met het gewone IBIS-blok eronder. Zo doet
   * elke bus iets, en de bekende bussen doen het goed.
   */
  const panelen = frame.panelen ?? [];
  const apparaten = scherm?.apparaten ?? [];
  /*
   * De generieke lijst: de IBIS en de kaartautomaat zijn interessant, de
   * thermometer en de klok alleen als er verder niets is. Schermpjes met
   * "punkte" in hun naam zijn een tweede kleurlaag over hetzelfde veld.
   */
  const bruikbaar = apparaten.filter(
    (apparaat) => !/punkt|dots/i.test(apparaat.naam),
  );
  const toonbaar = bruikbaar.some((apparaat) => apparaat.soort !== "anders")
    ? bruikbaar.filter((apparaat) => apparaat.soort !== "anders")
    : bruikbaar;

  const [welke, setWelke] = useState(0);
  const [lijstOpen, setLijstOpen] = useState(false);
  const keuzes =
    panelen.length > 0
      ? panelen.map((paneel) => paneel.naam)
      : toonbaar.map((apparaat) => apparaatNaam(apparaat.naam));
  const plek = Math.min(welke, Math.max(0, keuzes.length - 1));
  const paneel = panelen[plek];
  const getoond = paneel ?? toonbaar[plek];
  /*
   * De letters vullen de breedte. Bij een vaste-breedteletter is een teken
   * ongeveer 0,6 keer de letterhoogte, en er staat 0,06 aan ruimte tussen, dus
   * past 150/regellengte -- met 166 liep de laatste letter net van het schermpje
   * af. Een apparaat
   * dat zegt hoeveel tekens erop passen houdt zijn maat ook als er even niets
   * staat. De css zet er een bovengrens op, anders wordt een breed paneel een
   * affiche.
   */
  const langsteRegel = Math.max(
    paneel?.tekens ?? 10,
    ...(getoond?.regels.map((regel) => regel.length) ?? [10]),
  );

  /*
   * Waar de tekst staat. Een nagebouwd apparaat zet hem links: die regels zijn
   * al met spaties opgemaakt door de bus zelf, en dan is uitvullen dubbelop.
   */
  const generiek = paneel ? undefined : toonbaar[plek];
  const uitlijning: "left" | "right" | "center" =
    generiek?.uitlijning === "links"
      ? "left"
      : generiek?.uitlijning === "rechts"
        ? "right"
        : generiek
          ? "center"
          : "left";

  /*
   * Hangen de knoppen van dit apparaat al aan een toets van OMSI? De meeste
   * bestaan in het spel alleen als muisknop; de app kan ze bijschrijven in
   * keyboard.cfg (core/bustoetsen.ts) en tot dat gebeurd is doen ze niets.
   */
  const beschikbaar = frame.knoppen?.beschikbaar ?? [];
  const kan = (actie: string): boolean => beschikbaar.includes(actie);
  const ontbreekt = Boolean(
    paneel?.rijen.some((rij) => rij.some((knop) => !kan(knop.actie))),
  );

  /*
   * Met een oudere plugin in het spel komen de schermpjes van de bus niet door
   * en tekent de app zijn eigen scherm, zonder dat iemand weet waarom.
   */
  const pluginOud =
    frame.connected && (status?.pluginVersie ?? PLUGIN_VERSIE) < PLUGIN_VERSIE;
  const leg = rit.leg ?? rit.upcoming;
  const halte =
    rit.passed !== undefined && leg ? stopName(leg, rit.passed) : undefined;
  const afstand =
    status?.metresToStop === undefined
      ? undefined
      : status.metresToStop >= 1000
        ? `${(status.metresToStop / 1000).toFixed(1).replace(".", ",")} km`
        : `${status.metresToStop} m`;

  const toets = (
    actie: string,
    tekst: string,
    soort?: "stand" | "invoer",
  ): JSX.Element => (
    <button
      key={actie}
      type="button"
      className={soort ? `ibis-knop ${soort}` : "ibis-knop"}
      onClick={() => acties.toets(actie)}
    >
      {tekst}
    </button>
  );

  return (
    <div className="ibis" data-hit>
      {pluginOud && (
        <p className="verkoop-mopper">{t(language, "ovl.salePluginOld")}</p>
      )}

      {/*
        De apparaten die in deze bus zitten. De app zoekt ze zelf op in het model
        (core/busmodule.ts): welke schermpjes bij elkaar horen, welke knoppen
        erbij zitten en hoe die heten. Wat je erbij wilt hebben kies je hier.
      */}
      {(frame.busmodules?.length ?? 0) > 0 && (
        <div className="module-kiezer">
          <button
            type="button"
            className="module-knop"
            onClick={() => setLijstOpen((open) => !open)}
          >
            {lijstOpen ? t(language, "ovl.moduleHide") : t(language, "ovl.moduleAdd")}
          </button>
          {lijstOpen && (
            <ul className="module-lijst">
              {frame.busmodules?.map((module) => (
                <li key={module.id}>
                  <button
                    type="button"
                    className={module.erbij ? "aan" : undefined}
                    onClick={() => acties.module(module.id, !module.erbij)}
                  >
                    <b>{module.naam}</b>
                    <small>
                      {t(language, "ovl.moduleSize", {
                        schermen: module.schermen,
                        knoppen: module.knoppen,
                      })}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Welk apparaat je voor je hebt; alleen als de bus er meer heeft. */}
      {keuzes.length > 1 && (
        <div className="ibis-keuze">
          {keuzes.map((naam, index) => (
            <button
              key={naam}
              type="button"
              className={index === plek ? "aan" : undefined}
              onClick={() => setWelke(index)}
            >
              {naam}
            </button>
          ))}
        </div>
      )}

      {getoond ? (
        <div className="ibis-groot">
          <div
            className={paneel ? "ibis-apparaat paneel-scherm" : "ibis-apparaat"}
            style={{
              background: getoond.achtergrond,
              color: getoond.tekstkleur,
              ["--ibis-letter" as string]: `${(150 / langsteRegel).toFixed(2)}cqw`,
              textAlign: uitlijning,
            }}
          >
            {getoond.regels.map((regel, index) => (
              <span key={index}>{regel || "\u00a0"}</span>
            ))}
          </div>
          {paneel?.merk && <p className="paneel-merk">{paneel.merk}</p>}
        </div>
      ) : scherm && scherm.regels.length > 0 ? (
        /*
         * De terugval, voor een oudere plugin: de vaste namen die in de .opl
         * staan, met de vorm die bij dat apparaat hoort.
         */
        <div className={`ibis-scherm spiegel ${scherm.soort}`}>
          {scherm.regels.map((regel, index) => (
            <span key={index}>{regel || "\u00a0"}</span>
          ))}
        </div>
      ) : (
        <div className="ibis-scherm eigen">
          <div className="ibis-kop">
            <b>{scherm?.lijn ?? leg?.lineNumber ?? "—"}</b>
            <span>{status ? formatTime(status.clockMinutes) : "--:--"}</span>
          </div>
          <div className="ibis-regel">
            <small>{t(language, "ovl.ibisTo")}</small>
            <span>{scherm?.bestemming ?? leg?.terminus ?? "—"}</span>
          </div>
          <div className="ibis-regel">
            <small>{t(language, "ovl.ibisNext")}</small>
            <span>{halte ?? status?.nextStop ?? "—"}</span>
          </div>
          <div className="ibis-cijfers">
            <div>
              <small>{t(language, "ovl.ibisDistance")}</small>
              <b>{afstand ?? "—"}</b>
            </div>
            <div>
              <small>{t(language, "ovl.ibisDelay")}</small>
              <b>
                {status?.deltaSeconds === undefined
                  ? "—"
                  : `${status.deltaSeconds > 0 ? "+" : ""}${Math.round(status.deltaSeconds / 60)}`}
              </b>
            </div>
          </div>
        </div>
      )}

      {ontbreekt && (
        <div className="afr-aanzetten">
          <p>{t(language, "ovl.afrKeysOff")}</p>
          <button type="button" onClick={() => acties.knoppenAan()}>
            {t(language, "ovl.afrKeysOn")}
          </button>
        </div>
      )}

      {paneel ? (
        /* Het toetsenbord van dit apparaat, rij voor rij zoals het erop ligt. */
        <div className="paneel-toetsen">
          {paneel.rijen.map((rij, index) => (
            <div
              key={index}
              className="paneel-rij"
              style={{
                gridTemplateColumns: rij
                  .map((knop) => (knop.breed ? "2fr" : "1fr"))
                  .join(" "),
              }}
            >
              {rij.map((knop) => (
                <button
                  key={knop.actie}
                  type="button"
                  className={`paneel-knop${knop.kleur ? ` ${knop.kleur}` : ""}`}
                  disabled={!kan(knop.actie)}
                  onClick={() => acties.toets(knop.actie)}
                >
                  {knop.opschrift}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* De drie standen, zoals de knoppen op het apparaat zelf. */}
          <div className="ibis-standen">
            {toets("IBIS_setmode_linie_kurs", t(language, "ovl.ibisLine"), "stand")}
            {toets("IBIS_setmode_route", t(language, "ovl.ibisRoute"), "stand")}
            {toets("IBIS_setmode_ziel", t(language, "ovl.ibisDest"), "stand")}
          </div>

          <div className="ibis-toetsen">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((cijfer) =>
              toets(`IBIS_${cijfer}`, cijfer),
            )}
            {toets("IBIS_loeschen", t(language, "ovl.ibisClear"), "invoer")}
            {toets("IBIS_0", "0")}
            {toets("IBIS_eingabe", t(language, "ovl.ibisEnter"), "invoer")}
          </div>
        </>
      )}

      {frame.status?.opdracht?.fout && (
        <p className="verkoop-mopper">{t(language, "ovl.saleNotFront")}</p>
      )}
    </div>
  );
}

function KaartjesApp({
  set,
  keuze,
  verkoop,
  busKaartjes,
  opdracht,
  pluginOud,
  acties,
  language,
}: {
  set?: Kaartset;
  /** Wat er in de bus gekozen is (GivenTicket); dan hoeft het hier niet nog eens. */
  keuze?: number;
  /** Wat er aan de deur verkocht wordt, uit het spel zelf; zie core/live.ts. */
  verkoop?: Verkoop;
  /** De namen die de kaartautomaat van de bus zelf toont; zie `kaartnamenVan`. */
  busKaartjes?: string[];
  /** Hoe het de laatste toets in OMSI verging. */
  opdracht?: { nr: number; fout: boolean };
  /** OMSI draait met een plugin van voor de kaartverkoop. */
  pluginOud?: boolean;
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
   * De naam zoals de automaat in de bus hem toont, als hij aanstaat; anders die
   * uit het kaartpakket van de kaart. Zie `kaartnamenVan` in core/live.ts.
   */
  const naamVan = (index: number, terugval: string): string =>
    (busKaartjes?.[index] ?? '').trim() || terugval;

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
      {pluginOud && (
        <p className="verkoop-mopper">{t(language, "ovl.salePluginOld")}</p>
      )}
      {/*
        Staat er iemand te betalen, dan komt zijn verkoop onder de kaartkeuze:
        het spel weet welk kaartje hij wil, wat het kost en wat hij gegeven
        heeft. De keuze blijft staan -- je kiest het kaartje zelf op de automaat
        in de bus, en dan wil je zien welk nummer daarbij hoort.
      */}
      {verkoop && (
        <Verkoopscherm
          key={verkoopSleutel}
          verkoop={verkoop}
          set={set}
          busKaartjes={busKaartjes}
          opdracht={opdracht}
          acties={acties}
          language={language}
        />
      )}
      {!gekozen ? (
        /*
         * Tegels en geen lijst: je zoekt met een blik en je tikt met een duim,
         * terwijl er iemand voor je staat. De prijs is het grootst, want daar
         * gaat het om.
         */
        <ul className="kaarttegels">
          {set.kaartjes.map((kaartje, index) => (
            <li key={kaartje.naam}>
              <button type="button" onClick={() => setGekozen(kaartje)}>
                <span className="kaartprijs">{kaartje.prijs.toFixed(2)}</span>
                <span className="kaartnaam">{naamVan(index, kaartje.naam)}</span>
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
            <span className="kaartnaam">
              {naamVan(set.kaartjes.indexOf(gekozen), gekozen.naam)}
            </span>
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
