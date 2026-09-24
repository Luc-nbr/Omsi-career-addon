import { useRef, type JSX } from "react";
import type { MapGeometry } from "../../core/geo";
import type { IbisPlan } from "../../core/ibis";
import type { Paneel } from '../../core/busprofiel';
import type { LiveStatus } from "../../core/live";
import type { Duty, DutyLeg } from "../../core/types";
import type { Kaartset } from "../../shared/kaartjes";
import { formatTime } from "../../shared/format";
import { punctuality } from "../../shared/status";
import { t, type Language } from "../../shared/i18n";
import { RouteMap, type Manoeuvre } from "./RouteMap";

/*
 * De navigatie, los van het venster waarin hij staat.
 *
 * WAAROM EEN EIGEN BESTAND
 * De navigatie staat op twee plekken: in de telefoon van de overlay, en op een
 * echte telefoon of tablet via de webpagina van `apparaat.tsx`. Beide moeten
 * precies hetzelfde laten zien -- dezelfde rit, dezelfde halte, dezelfde pijl.
 * Die sommen stonden in `Overlay` zelf, en twee plekken met dezelfde regel
 * lopen uit elkaar zodra er een verandert. Dus staan ze hier, en gebruiken
 * beide vensters ze.
 */

/** Wat het hoofdproces elk beeld doorgeeft, voor zover de navigatie het nodig heeft. */
export interface NavFrame {
  status?: LiveStatus;
  duty?: Duty;
  /** Lijn en routes die in de IBIS moeten; de overlay toont ze tot ze erin staan. */
  ibis?: IbisPlan;
  /** De bus op de kaart van de dienst, uit het geheugen van OMSI. */
  vehicle?: {
    x: number;
    y: number;
    heading: number;
    headingFromMotion: boolean;
  };
  /** Draait OMSI met onze plugin? */
  connected: boolean;
  /** OMSI staat open, maar de kaart laadt nog: de plugin geeft pas daarna iets door. */
  laadt?: boolean;
  /** De kaartsoorten van deze kaart, met hun prijzen; zie core/kaartjes.ts. */
  kaartjes?: Kaartset;
  /**
   * Welke knoppen van de apparaten in de bus aan een toets hangen.
   *
   * OMSI kent maar veertien IBIS-commando's; de kaartautomaat en het LAWO-paneel
   * zijn in het spel muisknoppen. De app kan ze bijschrijven in keyboard.cfg
   * (core/bustoetsen.ts), en tot dat gebeurd is hoort de telefoon ze niet als
   * werkende knoppen te tonen.
   */
  knoppen?: { beschikbaar: string[] };
  /**
   * De apparaten van deze bus, nagebouwd zoals ze in de cabine zitten. Alleen
   * gevuld voor bussen die de app van binnen kent; zie core/busprofiel.ts.
   */
  panelen?: Paneel[];
}

/**
 * Dezelfde inhoud, hetzelfde voorwerp.
 *
 * Elk beeld komt door de brug als een verse kopie. Voor React is dat elke tel
 * een andere dienst, en dan rekent de kaart alles opnieuw uit: alle haltes, alle
 * borden, alle lijnen, tien keer per seconde, terwijl er niets veranderd is. Dat
 * werk ging ten koste van het spel eronder. Zolang de sleutel gelijk blijft
 * houden we de eerste kopie vast, en laat de kaart zijn rekenwerk staan.
 */
export function useStable<T>(value: T | undefined, key: string): T | undefined {
  const held = useRef<{ key: string; value: T } | undefined>(undefined);
  if (value === undefined) {
    held.current = undefined;
    return undefined;
  }
  if (held.current?.key !== key) held.current = { key, value };
  return held.current.value;
}

/** Hoeveel haltes de bus gehad heeft, of niets als hij het niet doorgeeft. */
export function walkedStops(status?: LiveStatus): number | undefined {
  if (!status?.leg || !status.reportsStops || status.stopIndex === undefined)
    return undefined;
  return Math.min(Math.max(status.stopIndex, 0), status.leg.stops.length);
}

export function stopName(leg: DutyLeg, at?: number): string | undefined {
  if (at === undefined) return undefined;
  return leg.stops[Math.min(at, leg.stops.length - 1)];
}

/** Waar de dienst staat, afgeleid uit het beeld; zie `useRitStand`. */
export interface RitStand {
  leg?: DutyLeg;
  /** Hoeveel haltes de bus gehad heeft, als de IBIS het meldt. */
  passed?: number;
  /** Laat OMSI zijn dienstregelingsmenu lezen? */
  readable: boolean;
  /** Is de rit ingeladen: in OMSI gekozen, of een IBIS die haltes meldt. */
  ibisLoaded: boolean;
  /** Kan deze bus haltes melden? */
  ibisCapable: boolean;
  upcomingIndex: number;
  upcoming?: DutyLeg;
  /** Sleutel van de rit, voor de afmelding "IBIS ingevoerd". */
  tripKey: string;
  /** Staan lijn en bestemming van deze rit al op de IBIS? */
  ibisTyped: boolean;
  /** Loopt de rit? Zie `useRitStand`. */
  started: boolean;
  /** Waar de bus ongeveer is, als OMSI zijn plek niet laat lezen. */
  bus?: { legIndex: number; nextStop: number; metresSinceStop: number };
}

/**
 * Alles wat de navigatie uit een beeld afleidt.
 *
 * Een haak, want de meterstand bij de laatste halte moet onthouden worden
 * tussen beelden door. In `Overlay` staat hij boven de vroege return, zodat
 * React de haken bij elk beeld in dezelfde volgorde ziet.
 *
 * `ibisReady` is de rit waarvoor de chauffeur zelf "IBIS ingevoerd" heeft
 * gezegd. Die knop staat in de overlay; de webpagina kent hem niet en geeft
 * `true`: daar loopt de rit zodra het spel zegt dat hij geladen is.
 */
export function useRitStand(
  frame: NavFrame,
  duty: Duty | undefined,
  ibisReady?: string | true,
): RitStand {
  const { status } = frame;
  /*
   * De kilometerstand op het moment dat de IBIS een halte verder springt. Wat de
   * bus daarna rijdt, legt hij af over de route vanaf die halte; zo rijdt de kaart
   * mee zonder dat OMSI een positie hoeft door te geven.
   */
  const stopOdometer = useRef<{ key: string; km: number }>(undefined);
  const passed = walkedStops(status);
  const stopKey =
    status && passed !== undefined ? `${status.legIndex}|${passed}` : "";
  if (status && stopKey && stopOdometer.current?.key !== stopKey) {
    stopOdometer.current = { key: stopKey, km: status.odometerKm };
  }

  const leg = status?.leg;
  /*
   * Kan de app in OMSI kijken, dan telt wat daar in het dienstregelingsmenu is
   * gekozen: pas dan is duidelijk welke rit gereden wordt. Anders valt hij terug
   * op de IBIS, die zich vult zodra lijn en route zijn ingetoetst.
   */
  const readable = Boolean(status?.omsiReadable);
  const scheduled = Boolean(status?.schedule?.matchesDuty);
  const ibisLoaded = readable
    ? scheduled
    : Boolean(status?.reportsStops) && passed !== undefined;
  /*
   * Een bus zonder IBIS meldt nooit een halte; die chauffeur heeft niets aan
   * "toets de route in". Hij krijgt de vraag om zijn dienst in OMSI te kiezen,
   * want daar komt het antwoord dan vandaan.
   */
  const ibisCapable = status ? status.offersStops : true;

  /*
   * De rit waar de instructies over gaan. Dat rekent `describeLive` uit: wat in
   * OMSI gekozen is gaat voor, en anders de eerste rit die nog niet is
   * aangekomen.
   */
  const upcomingIndex = status?.legIndex ?? 0;
  const upcoming = duty?.legs[upcomingIndex];
  /*
   * Elke rit zijn eigen afmelding. De sleutel bevat het ritbestand, zodat een
   * dienst die dezelfde rit later nog eens rijdt opnieuw om de IBIS vraagt.
   */
  const tripKey = upcoming ? `${upcomingIndex}|${upcoming.tripFile}` : "";

  /*
   * Staat het al op de IBIS?
   *
   * De bus geeft door wat er op zijn film staat: het lijnnummer en de
   * bestemming. Klopt het lijnnummer met deze rit en staat er een bestemming,
   * dan heeft de chauffeur zijn lijn en route ingetoetst en hoeft hij dat niet
   * ook nog te melden. Dat scheelt een knop waarvan mensen niet begrepen wat
   * hij van hen wilde.
   *
   * Niet elke bus geeft die velden door. Blijven ze leeg, dan verandert er
   * niets en blijft de knop staan.
   */
  const ibisTyped = Boolean(
    status &&
    /*
     * Het sterkste bewijs komt van OMSI zelf: staat de goede rit in het
     * dienstregelingsmenu, dan weet het spel welke rit er loopt en hoeven wij
     * het niemand meer te vragen. Dat werkt bij elke bus.
     */
    (status.fromTimetable ||
      /*
       * En anders wat er op de film staat. Klassieke bussen geven dat door;
       * moderne bussen met hun eigen scherm laten die velden leeg, ook als de
       * chauffeur alles netjes heeft ingevoerd -- vandaar de regel hierboven.
       */
      (upcoming &&
        status.ibisLine &&
        status.ibisTerminus &&
        status.ibisLine.replace(/\s+/g, "") ===
          upcoming.lineNumber.replace(/\s+/g, ""))),
  );

  /** De rit loopt zodra de IBIS klopt -- of zodra de chauffeur zelf zegt dat het zo is. */
  const started =
    ibisLoaded &&
    (!ibisCapable || ibisTyped || ibisReady === true || ibisReady === tripKey);
  // Alleen schatten waar de bus is als OMSI zijn plek niet laat lezen.
  const bus =
    !frame.vehicle &&
    status &&
    ibisLoaded &&
    passed !== undefined &&
    stopOdometer.current?.key === stopKey
      ? {
          legIndex: status.legIndex,
          nextStop: passed,
          metresSinceStop: Math.max(
            0,
            (status.odometerKm - stopOdometer.current.km) * 1000,
          ),
        }
      : undefined;

  return {
    leg,
    passed,
    readable,
    ibisLoaded,
    ibisCapable,
    upcomingIndex,
    upcoming,
    tripKey,
    ibisTyped,
    started,
    bus,
  };
}

/**
 * De manoeuvrebalk boven de kaart.
 *
 * Wat een chauffeur op dat moment wil weten, in de volgorde waarin hij het wil
 * weten: hoeveel meter nog, naar welke halte, en hoe laat hij daar hoort te
 * zijn. Die tijd draagt de kleur van het verschil met de dienstregeling -- de
 * enige kleur op dit paneel die iets betekent.
 *
 * De afstand komt uit het geheugen van OMSI. Laat het spel zich niet lezen, dan
 * staat er geen meterstand; een verzonnen getal is erger dan geen getal.
 */
export function NavBar({
  status,
  leg,
  passed,
  manoeuvre,
  language,
}: {
  status?: LiveStatus;
  leg?: DutyLeg;
  passed?: number;
  manoeuvre?: Manoeuvre;
  language: Language;
}): JSX.Element | null {
  if (!status || !leg || passed === undefined) return null;
  const at = Math.min(passed, leg.stops.length - 1);
  const naam = leg.stops[at];
  if (!naam) return null;

  const meters = status.metresToStop;
  const afstand =
    meters === undefined
      ? undefined
      : meters >= 1000
        ? `${(meters / 1000).toFixed(1).replace(".", ",")} km`
        : `${meters} m`;

  const stand = punctuality(status.deltaSeconds);
  const klasse =
    stand === "laat" ? "late" : stand === "vroeg" ? "early" : "ontime";
  const wanneer = leg.stopTimes[at];

  return (
    <div className="navbar">
      {/*
        De pijl hoort te zeggen wat je doet, niet wat de app kan tekenen. Hij
        stond altijd op afslaan; nu wijst hij rechtdoor tenzij de weg binnen
        tweehonderd meter echt draait.
      */}
      <svg
        className="navbar-arrow"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {manoeuvre?.kind === "rechts" ? (
          <>
            <path d="M12 21V9" />
            <path d="M12 9c0-2.6 2.1-4.7 4.7-4.7H19" />
            <path d="M16.5 1.6 19.3 4.4 16.5 7.2" />
          </>
        ) : manoeuvre?.kind === "links" ? (
          <>
            <path d="M12 21V9" />
            <path d="M12 9c0-2.6-2.1-4.7-4.7-4.7H5" />
            <path d="M7.5 1.6 4.7 4.4 7.5 7.2" />
          </>
        ) : (
          <>
            <path d="M12 21V4" />
            <path d="M5.8 10.2 12 4l6.2 6.2" />
          </>
        )}
      </svg>
      <div className="navbar-what">
        {afstand && <b>{afstand}</b>}
        <span>{naam}</span>
      </div>
      <div className="navbar-when">
        {wanneer !== undefined && (
          <b className={klasse}>{formatTime(wanneer)}</b>
        )}
        <span>
          {t(language, "ovl.stopOf", { at: at + 1, total: leg.stops.length })}
        </span>
      </div>
    </div>
  );
}

/** En wat er daarna komt; één regel, want verder kijkt niemand tijdens het rijden. */
export function NavFoot({
  leg,
  passed,
  language,
}: {
  leg?: DutyLeg;
  passed?: number;
  language: Language;
}): JSX.Element | null {
  if (!leg || passed === undefined) return null;
  const next = Math.min(passed + 1, leg.stops.length - 1);
  if (next <= passed || !leg.stops[next]) return null;
  return (
    <div className="navfoot">
      <span className="navfoot-dot" />
      <span className="navfoot-name">
        {t(language, "ovl.thenStop", { stop: leg.stops[next] })}
      </span>
      <span className="navfoot-time">
        {formatTime(leg.stopTimes[next] ?? leg.arrival)}
      </span>
    </div>
  );
}

/**
 * De kaart met alles wat erbij hoort: de manoeuvrebalk erboven, de snelheid
 * met het laatste bord, en onderin de halte daarna.
 *
 * De bocht en het bord worden door de ouder bewaard en niet hier: de overlay
 * haalt de kaart weg zodra je een andere app opent, en het bord dat je net
 * voorbij reed hoort er nog te staan als je terugkomt.
 */
export function NavKaart({
  frame,
  duty,
  geometry,
  rit,
  pixelScale,
  language,
  manoeuvre,
  onManoeuvre,
  limit,
  onSpeedLimit,
}: {
  frame: NavFrame;
  duty?: Duty;
  geometry?: MapGeometry;
  rit: RitStand;
  pixelScale: number;
  language: Language;
  manoeuvre?: Manoeuvre;
  onManoeuvre(manoeuvre: Manoeuvre | undefined): void;
  limit?: number;
  onSpeedLimit(kmh: number | undefined): void;
}): JSX.Element {
  const { status } = frame;
  const { leg, passed, readable, ibisLoaded, started, upcoming, bus } = rit;
  if (!duty || !geometry) {
    return <div className="empty">{t(language, "ovl.mapLoading")}</div>;
  }
  return (
    <div className="nav-wrap">
      <NavBar
        status={status}
        leg={leg}
        passed={passed}
        manoeuvre={manoeuvre}
        language={language}
      />
      <RouteMap
        duty={duty}
        geometry={geometry}
        nextStopId={
          leg && passed !== undefined
            ? leg.stopIds[Math.min(passed, leg.stopIds.length - 1)]
            : undefined
        }
        activeLeg={status?.legIndex}
        pixelScale={pixelScale}
        routeMode={ibisLoaded && started ? "active" : "none"}
        bus={bus}
        vehicle={
          frame.vehicle && status
            ? { ...frame.vehicle, speedKmh: status.speedKmh }
            : undefined
        }
        // Nog niets gekozen en geen bus te zien: de eerste halte van de rit in beeld.
        focusStopId={started || frame.vehicle ? undefined : upcoming?.stopIds[0]}
        texts={{
          /*
            Waar de kaart op wacht verschilt per stap: eerst de dienst in
            OMSI, daarna de IBIS. "Kies je dienst" blijven zeggen terwijl
            die al gekozen is, stuurt de chauffeur het verkeerde menu in.
            Zolang OMSI niets doorgeeft is er nog geen stap: dan zegt de
            kaart of OMSI er al is en de kaart laadt, of dat het er nog
            niet is.
          */
          waiting: t(
            language,
            !frame.connected
              ? frame.laadt
                ? "ovl.loading"
                : "ovl.waiting"
              : ibisLoaded
                ? "ovl.mapIbis"
                : readable
                  ? "ovl.mapSelect"
                  : "ovl.mapWaiting",
          ),
          busNote: t(language, "ovl.busHere"),
          centre: t(language, "ovl.centre"),
        }}
        variant="panel"
        onManoeuvre={onManoeuvre}
        onSpeedLimit={onSpeedLimit}
      />
      {status && (
        <div className="nav-speed">
          <b
            className={
              limit !== undefined && status.speedKmh > limit + 3
                ? "tehard"
                : undefined
            }
          >
            {Math.max(0, Math.round(status.speedKmh))}
          </b>
          <span>km/u</span>
          {/*
            Het bord zoals het langs de weg staat: wit met een rode ring.
            Alleen als er eentje voorbij is gekomen -- verzinnen wat er
            mag is erger dan niets zeggen.
          */}
          {limit !== undefined && <i className="nav-limit">{limit}</i>}
        </div>
      )}
      <NavFoot leg={leg} passed={passed} language={language} />
    </div>
  );
}
