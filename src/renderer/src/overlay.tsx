import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent,
} from "react";
import { createRoot } from "react-dom/client";
import type { MapGeometry } from "../../core/geo";
import type { IbisPlan } from "../../core/ibis";
import { wisselgeld, type Kaartje, type Kaartset } from "../../shared/kaartjes";
import type { LiveStatus } from "../../core/live";
import type { Duty, DutyLeg } from "../../core/types";
import type { CareerApi } from "../../shared/api";
import { formatTime } from "../../shared/format";
import { RouteCode } from "./RouteCode";
import { punctuality } from "../../shared/status";
import { DEFAULT_LANGUAGE, loose, t, type Language } from "../../shared/i18n";
import {
  OPACITY_MIN,
  OVERLAY_RATES,
  PANELS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  nextDetail,
  type DetailLevel,
  type OverlayLayout,
  type OverlayRate,
  type PanelId,
  type PanelInfo,
} from "../../shared/overlay";
import { RouteMap, type Manoeuvre } from "./RouteMap";
/*
 * Dezelfde letter als het hoofdvenster. Manrope blijft erbij staan omdat delen
 * van de overlay hem nog noemen; wat de nieuwe wereld tekent gebruikt Hanken.
 */
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "./theme.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "./overlay.css";

/**
 * Hoe groot het scherm is, in dezelfde punten als de indeling.
 *
 * Niet `window.innerWidth`: buiten de sleepstand is het venster niet groter dan
 * zijn inhoud, en dan zou een element zichzelf naar de linkerbovenhoek klemmen.
 * Het scherm blijft even groot, wat het venster ook doet.
 */
function screenSize(): { w: number; h: number } {
  return { w: window.screen.width, h: window.screen.height };
}

/** Een vak in schermpunten: waar iets staat en hoe groot het is. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Het kleinste vak waar alles in past, met wat lucht voor de schaduwranden. */
function union(parts: Box[]): Box | undefined {
  if (parts.length === 0) return undefined;
  const LUCHT = 12;
  const minX = Math.min(...parts.map((part) => part.x));
  const minY = Math.min(...parts.map((part) => part.y));
  const maxX = Math.max(...parts.map((part) => part.x + part.w));
  const maxY = Math.max(...parts.map((part) => part.y + part.h));
  return {
    x: Math.max(0, Math.floor(minX - LUCHT)),
    y: Math.max(0, Math.floor(minY - LUCHT)),
    w: Math.ceil(maxX - minX) + LUCHT * 2,
    h: Math.ceil(maxY - minY) + LUCHT * 2,
  };
}

/** Een punt verschil is geen verschil; anders blijft het venster trillen. */
function same(a: Box | undefined, b: Box | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.w - b.w) < 2 &&
    Math.abs(a.h - b.h) < 2
  );
}

/** De apps op het toestel, in de volgorde van het balkje onderin. */
type OverlayApp = "kaart" | "dienst" | "pauze" | "rit" | "kaartjes";

interface Frame {
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
  /** Wie er rijdt, met zijn dienstgegevens om mee aan te melden. */
  chauffeur?: { naam: string; personeelsnummer?: string; pincode?: string };
  /** In de bewerkstand neemt de overlay muisklikken aan. */
  editing: boolean;
}

declare global {
  interface Window {
    overlay: {
      onFrame(handler: (frame: Frame) => void): void;
      /** De sneltoets klapt het paneel een stand verder. */
      onCycle(handler: () => void): void;
    };
    career: CareerApi;
  }
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
function useStable<T>(value: T | undefined, key: string): T | undefined {
  const held = useRef<{ key: string; value: T } | undefined>(undefined);
  if (value === undefined) {
    held.current = undefined;
    return undefined;
  }
  if (held.current?.key !== key) held.current = { key, value };
  return held.current.value;
}

/** Waaraan je een dienst herkent: welke ritten, in welke volgorde. */
function dutyKeyOf(duty: Duty | undefined): string {
  if (!duty) return "";
  return `${duty.mapFolder}|${duty.legs.map((leg) => `${leg.tripFile}@${leg.departure}`).join(";")}`;
}

/*
 * Waar de handtekening van de telefoon bewaard blijft als de overlay dicht gaat.
 *
 * Het hoofdproces gooit het overlayvenster weg bij "Overlay verbergen" en bouwt
 * bij het openen een vers venster (`closeOverlay` / `openOverlay`). Wat alleen in
 * de state stond was dan weg, en midden in je dienst moest je opnieuw nummer,
 * pincode en handtekening geven. De localStorage van deze pagina blijft staan:
 * elk overlayvenster laadt dezelfde pagina, dus dezelfde herkomst. Eén regel die
 * steeds overschreven wordt -- er loopt maar één dienst tegelijk.
 */
const HANDTEKENING = "overlay.handtekening";

interface Handtekening {
  /** De dienst plus het moment waarop hij is aangenomen; zie `Overlay`. */
  sleutel: string;
  /** Voor welke dienst de opdracht aanvaard is; leeg als je alleen aangemeld bent. */
  aanvaardVoor?: string;
}

function leesHandtekening(): Handtekening | undefined {
  try {
    const tekst = window.localStorage.getItem(HANDTEKENING);
    const waarde = tekst
      ? (JSON.parse(tekst) as Partial<Handtekening> | null)
      : undefined;
    if (typeof waarde?.sleutel !== "string") return undefined;
    return {
      sleutel: waarde.sleutel,
      aanvaardVoor:
        typeof waarde.aanvaardVoor === "string"
          ? waarde.aanvaardVoor
          : undefined,
    };
  } catch {
    return undefined;
  }
}

function bewaarHandtekening(waarde: Handtekening): void {
  try {
    window.localStorage.setItem(HANDTEKENING, JSON.stringify(waarde));
  } catch {
    // Geen opslag: dan teken je na het heropenen opnieuw, zoals voorheen.
  }
}

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({
    connected: false,
    editing: false,
  });
  /*
   * De navigatie staat al staand en smal, als een telefoon in een houder op het
   * dashboard. Die vorm helemaal doortrekken: onderin een balkje waarmee je van
   * app wisselt, en de kaart is er daar een van. Wat je tijdens het rijden nodig
   * hebt staat op de kaart; de rest kijk je op als je stilstaat.
   */
  const [app, setApp] = useState<OverlayApp>("kaart");
  /** Wanneer de pauze begon, in speltijd. Leeg betekent: geen pauze bezig. */
  const [pauzeVanaf, setPauzeVanaf] = useState<number>();
  const [layout, setLayout] = useState<OverlayLayout>();
  /*
   * Welke rit de chauffeur zelf heeft afgemeld met "IBIS ingevoerd". Per rit,
   * want elke rit heeft zijn eigen route: bij de volgende hoort de vraag opnieuw
   * gesteld te worden. Deze haak staat hier en niet verderop: onder de vroege
   * return zou React hem bij het eerste beeld overslaan en daarna verwachten.
   */
  const [ibisReady, setIbisReady] = useState<string>();
  /*
   * Aanmelden en de dienst aanvaarden.
   *
   * Een dienst begint met jezelf aanmelden, en dat is het punt van deze stap.
   * Maar de overlay gaat tussendoor dicht en open, en je hoort niet halverwege
   * opnieuw te moeten tekenen voor dezelfde dienst. Alleen in de state was dat
   * wel zo: het venster wordt bij het sluiten weggegooid. Daarom gaat de
   * handtekening ook naar `HANDTEKENING`, onder `tekenSleutel` -- zie hieronder.
   */
  const [aangemeld, setAangemeld] = useState(false);
  const [aanvaardVoor, setAanvaardVoor] = useState<string>();
  /*
   * Onder welke sleutel de handtekening bewaard wordt: de dienst plus het moment
   * waarop hij in het profiel is aangenomen. Leeg zolang dat nog niet gelezen is;
   * tot dan wordt er niets bewaard, anders overschrijft een vers venster de
   * handtekening voordat hij hem heeft kunnen teruglezen.
   */
  const [tekenSleutel, setTekenSleutel] = useState<string>();
  const [geometry, setGeometry] = useState<MapGeometry>();
  /** Wat er aan bocht voor je ligt; de kaart rekent het uit, de balk tekent het. */
  const [manoeuvre, setManoeuvre] = useState<Manoeuvre>();
  /** Wat het laatste bord langs de route zei; niets als er geen bord stond. */
  const [limit, setLimit] = useState<number>();
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  /** Hoe vaak de overlay wordt bijgewerkt; in de sleepbalk te kiezen. */
  const [rate, setRate] = useState<OverlayRate>("rustig");
  /** De elementen zelf, om hun hoogte te kunnen meten. */
  const panelRefs = useRef<Partial<Record<PanelId, HTMLElement | null>>>({});
  /** Het vak waar ze samen in passen; het venster wordt precies zo groot. */
  const [box, setBox] = useState<Box>();
  /*
   * Wordt er op dit moment gesleept of geschaald?
   *
   * Dat is niet alleen iets van het element zelf. Zolang je sleept maakt het
   * hoofdproces het venster even zo groot als het scherm (`overlayGrab`), want
   * anders stopt de sleep bij de eigen rand. Maar de pagina schoof intussen
   * alles op met de hoek van het vak waar de elementen in staan -- en dat vak
   * verandert juist terwijl je sleept. Gevolg: het element dat je niet
   * vasthield, schoof mee over het scherm. Met deze vlag schuift er niets
   * zolang het venster het hele scherm beslaat, net als in de bewerkstand.
   */
  const [grijpend, setGrijpend] = useState(false);

  const { status, editing } = frame;
  /*
   * De dienst en de codes veranderen zelden; ze komen alleen elke tel opnieuw
   * door de brug. Vasthouden scheelt de kaart een hoop nutteloos rekenwerk.
   */
  const duty = useStable(frame.duty, dutyKeyOf(frame.duty));
  const ibis = useStable(
    frame.ibis,
    frame.ibis ? `${frame.ibis.line}|${frame.ibis.tour}` : "",
  );
  /*
   * Welke dienst dit is. Niet de rit maar de hele dienst: je tekent er één keer
   * voor en niet bij elke rit opnieuw. Hij staat boven de vroege return omdat het
   * bewaren van de handtekening hieronder eraan hangt.
   */
  const dienstSleutel = duty
    ? `${duty.mapFolder}|${duty.tourNumber}|${duty.start}`
    : "";

  useEffect(() => {
    window.overlay.onFrame(setFrame);
    void window.career.overlayLayout().then(setLayout);
    void window.career.settings().then((settings) => {
      setLanguage(settings.language);
      setRate(settings.overlayRate);
    });
  }, []);

  useEffect(() => {
    if (!duty?.mapFolder) return;
    let current = true;
    void window.career.geometry(duty.mapFolder).then((found) => {
      if (current) setGeometry(found);
    });
    return () => {
      current = false;
    };
  }, [duty?.mapFolder]);

  /*
   * De handtekening terughalen die een vorig overlayvenster voor deze dienst
   * bewaarde.
   *
   * De dienst alleen is geen goede sleutel: wie dezelfde omloop een dag later
   * opnieuw aanneemt, heeft een nieuwe dienst met dezelfde kaart, omloop en
   * vertrektijd -- en die hoort weer met aanmelden te beginnen. Daarom telt het
   * moment van aannemen mee (`confirmedAt` in het profiel), net als de sleutel
   * waarmee App.tsx een aangenomen dienst herkent. Een herstart midden in de
   * dienst houdt dat moment, en dus de handtekening. Vrij rijden staat niet in het
   * profiel; dan blijft alleen de dienst zelf over.
   */
  useEffect(() => {
    setTekenSleutel(undefined);
    if (!dienstSleutel) return;
    let current = true;
    void window.career
      .career()
      .then((payload) => {
        if (!current) return;
        const sleutel = `${dienstSleutel}|${payload.state?.activeDuty?.confirmedAt ?? ""}`;
        const bewaard = leesHandtekening();
        // Alleen erbij, nooit eraf: wie in dit venster al getekend heeft, houdt dat.
        if (bewaard?.sleutel === sleutel) {
          setAangemeld(true);
          if (bewaard.aanvaardVoor === dienstSleutel)
            setAanvaardVoor(dienstSleutel);
        }
        setTekenSleutel(sleutel);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [dienstSleutel]);

  // En elke stap die je op de telefoon zet meteen bewaren; zie `HANDTEKENING`.
  useEffect(() => {
    if (!tekenSleutel || !aangemeld) return;
    bewaarHandtekening({ sleutel: tekenSleutel, aanvaardVoor });
  }, [tekenSleutel, aangemeld, aanvaardVoor]);

  // Slepen levert een stroom wijzigingen op; pas als de muis stilligt naar schijf.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const store = useCallback((next: OverlayLayout) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void window.career.saveOverlayLayout(next),
      400,
    );
    return next;
  }, []);

  const move = useCallback(
    (id: PanelId, patch: Partial<OverlayLayout["dienst"]>) => {
      setLayout((old) =>
        old ? store({ ...old, [id]: { ...old[id], ...patch } }) : old,
      );
    },
    [store],
  );

  const cycle = useCallback(() => {
    setLayout((old) =>
      old ? store({ ...old, detail: nextDetail(old.detail) }) : old,
    );
  }, [store]);

  useEffect(() => window.overlay.onCycle(cycle), [cycle]);

  /*
   * De kilometerstand op het moment dat de IBIS een halte verder springt. Wat de
   * bus daarna rijdt, legt hij af over de route vanaf die halte; zo rijdt de kaart
   * mee zonder dat OMSI een positie hoeft door te geven.
   */
  const stopOdometer = useRef<{ key: string; km: number }>(undefined);
  const passedNow = walkedStops(status);
  const stopKey =
    status && passedNow !== undefined ? `${status.legIndex}|${passedNow}` : "";
  if (status && stopKey && stopOdometer.current?.key !== stopKey) {
    stopOdometer.current = { key: stopKey, km: status.odometerKm };
  }

  /*
   * Buiten de bewerkstand laat het venster muisklikken door naar het spel. Dat
   * moet ook: een venster dat klikken opvangt, vangt ze overal op. Alleen waar
   * echt een knop zit vragen we de muis even op, zodat het uitklappen werkt
   * zonder dat OMSI de aandacht kwijtraakt.
   */
  useEffect(() => {
    if (editing) return;
    let over = false;
    const onMove = (event: MouseEvent): void => {
      const hit = Boolean(
        (event.target as Element | null)?.closest?.("[data-hit]"),
      );
      if (hit === over) return;
      over = hit;
      void window.career.overlayHit(hit);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (over) void window.career.overlayHit(false);
    };
  }, [editing]);

  /*
   * Hoe groot moet het venster zijn?
   *
   * Het venster is doorzichtig en ligt over OMSI heen; elke punt die het beslaat
   * moet Windows bij elk spelbeeld opnieuw over het spel heen mengen, ook de
   * lege hoeken. Daarom meten we het vak waar de elementen in staan en geven we
   * dat door -- het venster wordt niet groter dan zijn inhoud.
   *
   * Meten gaat op de eigen maat van de elementen (breedte uit de indeling,
   * hoogte uit de inhoud), niet op hun plek in beeld: die verschuift mee met het
   * venster, en dan zou de ene meting de volgende uitlokken.
   */
  useLayoutEffect(() => {
    if (!layout) return;
    const meet = (): void => {
      const delen: Box[] = [];
      for (const info of PANELS) {
        const state = layout[info.id];
        const element = panelRefs.current[info.id];
        if (!state.visible || !element) continue;
        delen.push({
          x: state.x,
          y: state.y,
          w: element.offsetWidth * state.scale,
          h: element.offsetHeight * state.scale,
        });
      }
      setBox((old) => {
        const next = union(delen);
        return same(old, next) ? old : next;
      });

      /*
       * En wat er al buiten beeld stond, halen we terug. De overlay gebruikte
       * eerst het werkgebied in plaats van het hele scherm; een element dat
       * daardoor half over de rand hing, hoort weer helemaal zichtbaar te zijn.
       */
      const room = screenSize();
      for (const info of PANELS) {
        const state = layout[info.id];
        const element = panelRefs.current[info.id];
        if (!state.visible || !element) continue;
        const x = clamp(
          state.x,
          0,
          Math.max(0, room.w - element.offsetWidth * state.scale),
        );
        const y = clamp(
          state.y,
          0,
          Math.max(0, room.h - element.offsetHeight * state.scale),
        );
        if (Math.abs(x - state.x) > 1 || Math.abs(y - state.y) > 1)
          move(info.id, { x, y });
      }
    };
    meet();

    // De inhoud groeit en krimpt vanzelf: een waarschuwing erbij, een stand
    // verder. Een waarnemer hoort dat, een lijst met afhankelijkheden niet.
    const watcher = new ResizeObserver(meet);
    for (const info of PANELS) {
      const element = panelRefs.current[info.id];
      if (element) watcher.observe(element);
    }
    return () => watcher.disconnect();
  }, [layout]);

  /*
   * In de bewerkstand beslaat het venster het hele scherm, anders kun je een
   * element nergens heen slepen. Daarbuiten krimpt het naar zijn inhoud.
   */
  const boxKey = box ? `${box.x}|${box.y}|${box.w}|${box.h}` : "";
  useEffect(() => {
    void window.career.overlayBounds(editing ? undefined : box);
  }, [boxKey, editing]);

  if (!layout) return null;

  const leg = status?.leg;
  const passed = passedNow;
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
   * aangekomen. Hier stond diezelfde som nog eens; twee plekken met dezelfde
   * regel lopen uit elkaar zodra er een verandert.
   */
  const upcomingIndex = status?.legIndex ?? 0;
  const upcoming = duty?.legs[upcomingIndex];
  /*
   * Elke rit zijn eigen afmelding. De sleutel bevat het ritbestand, zodat een
   * dienst die dezelfde rit later nog eens rijdt opnieuw om de IBIS vraagt.
   */
  const tripKey = upcoming ? `${upcomingIndex}|${upcoming.tripFile}` : "";
  /*
   * Klaar om te rijden: aangemeld, en getekend voor deze dienst. Zonder dienst
   * -- vrij rijden -- is aanmelden genoeg; er valt dan niets te aanvaarden.
   */
  const getekend = aangemeld && (!duty || aanvaardVoor === dienstSleutel);

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
    ibisLoaded && (!ibisCapable || ibisTyped || ibisReady === tripKey);
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

  /*
   * De elementen staan op hun plek op het scherm, maar het venster begint niet
   * meer linksboven: het ligt om de inhoud heen. Dus schuiven we alles op met de
   * hoek van dat vak, en blijft alles staan waar de chauffeur het heeft neergezet.
   */
  const origin = editing || grijpend || !box ? { x: 0, y: 0 } : box;

  return (
    <div
      className={editing ? "stage editing" : "stage"}
      style={
        origin.x || origin.y
          ? { transform: `translate(${-origin.x}px, ${-origin.y}px)` }
          : undefined
      }
    >
      {layout.dienst.visible && (
        <Panel
          info={PANELS[0]}
          title={t(language, "ovl.panelDuty")}
          state={layout.dienst}
          editing={editing}
          language={language}
          innerRef={(element) => {
            panelRefs.current.dienst = element;
          }}
          onGrab={setGrijpend}
          onChange={(patch) => move("dienst", patch)}
        >
          {/*
            Zolang je op de telefoon niet getekend hebt, staat hier niets over de
            dienst. Aanmelden gebeurt daar -- dat is het apparaat dat je in je
            hand hebt -- en dit paneel hoort niet vooruit te lopen op wat daar nog
            moet gebeuren; de codes voor de IBIS staan er dus niet al in voordat
            je weet of je ze nodig hebt.

            Daarna vult het scherm zich pas als het spel zegt dat de dienst loopt:
            de dienstregeling gekozen in OMSI, of anders een IBIS die haltes
            meldt. Een dienst die al ingevuld lijkt terwijl OMSI nog niets weet,
            geeft cijfers die nergens op slaan -- de bus stond gisteren nog stil
            en de klok loopt gewoon door.
          */}
          {!getekend ? (
            <>
              <p className="empty">{t(language, "ovl.signonFirst")}</p>
              {/*
                Wie de telefoon met zijn ✕ had uitgezet, zat hier vast: aanmelden
                kan alleen daar, en die indeling blijft bewaard. De enige
                uitweg was de bewerkstand met "+ Navigatie", en daar zei deze
                regel niets over. Dus dezelfde knop hier, zolang hij nodig is.
                Aanmelden blijft op de telefoon; daar gaat het om.
              */}
              {!layout.navigatie.visible && (
                <button
                  type="button"
                  className="ovl-btn"
                  data-hit
                  onClick={() => move("navigatie", { visible: true })}
                >
                  + {t(language, "ovl.panelNav")}
                </button>
              )}
            </>
          ) : duty && !ibisLoaded ? (
            ibisCapable && !readable ? (
              <IbisPanel
                duty={duty}
                ibis={ibis}
                status={status}
                language={language}
              />
            ) : (
              <SelectPanel
                duty={duty}
                ibis={ibis}
                leg={upcoming}
                legIndex={upcomingIndex}
                status={status}
                language={language}
              />
            )
          ) : duty && ibisCapable && !ibisTyped && ibisReady !== tripKey ? (
            <IbisStep
              leg={upcoming}
              ibis={ibis}
              legIndex={upcomingIndex}
              language={language}
              onDone={() => setIbisReady(tripKey)}
            />
          ) : (
            <DutyPanel
              frame={frame}
              detail={layout.detail}
              language={language}
              onCycle={cycle}
            />
          )}
        </Panel>
      )}

      {layout.navigatie.visible && (
        <Panel
          info={PANELS[1]}
          title={t(language, "ovl.panelNav")}
          state={layout.navigatie}
          editing={editing}
          language={language}
          innerRef={(element) => {
            panelRefs.current.navigatie = element;
          }}
          onGrab={setGrijpend}
          onChange={(patch) => move("navigatie", patch)}
        >
          {/*
            De telefoon is waar je je aanmeldt en waar je tekent voor je dienst.
            Tot dat gebeurd is staat er verder niets op: geen kaart, geen apps en
            geen balk onderin. Een telefoon waarop je nog niet aangemeld bent laat
            je ook geen dienstregeling zien.
          */}
          {!aangemeld ? (
            <AanmeldPaneel
              chauffeur={frame.chauffeur}
              language={language}
              onAangemeld={() => setAangemeld(true)}
            />
          ) : duty && aanvaardVoor !== dienstSleutel ? (
            <DienstOpdracht
              duty={duty}
              chauffeur={frame.chauffeur}
              language={language}
              onAanvaard={() => setAanvaardVoor(dienstSleutel)}
            />
          ) : (
            <>
              {app !== "kaart" ? (
                <div className="app-scherm">
                  {app === "dienst" ? (
                    <DienstApp
                      duty={duty}
                      status={status}
                      language={language}
                    />
                  ) : app === "pauze" ? (
                    <PauzeApp
                      duty={duty}
                      status={status}
                      language={language}
                      vanaf={pauzeVanaf}
                      onVanaf={setPauzeVanaf}
                    />
                  ) : app === "kaartjes" ? (
                    <KaartjesApp set={frame?.kaartjes} language={language} />
                  ) : (
                    <RitApp status={status} language={language} />
                  )}
                </div>
              ) : duty && geometry ? (
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
                    pixelScale={layout.navigatie.scale}
                    routeMode={ibisLoaded && started ? "active" : "none"}
                    bus={bus}
                    vehicle={
                      frame.vehicle && status
                        ? { ...frame.vehicle, speedKmh: status.speedKmh }
                        : undefined
                    }
                    // Nog niets gekozen en geen bus te zien: de eerste halte van de rit in beeld.
                    focusStopId={
                      started || frame.vehicle
                        ? undefined
                        : upcoming?.stopIds[0]
                    }
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
                    onManoeuvre={setManoeuvre}
                    onSpeedLimit={setLimit}
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
                      {limit !== undefined && (
                        <i className="nav-limit">{limit}</i>
                      )}
                    </div>
                  )}
                  <NavFoot leg={leg} passed={passed} language={language} />
                </div>
              ) : (
                <div className="empty">{t(language, "ovl.mapLoading")}</div>
              )}

              <Dock
                app={app}
                onApp={setApp}
                language={language}
                pauze={pauzeVanaf !== undefined}
              />
            </>
          )}
        </Panel>
      )}

      {editing && (
        <EditBar
          layout={layout}
          language={language}
          rate={rate}
          onRate={(next) => {
            setRate(next);
            void window.career.saveSettings({ overlayRate: next });
          }}
          onShow={(id) => move(id, { visible: true })}
          onReset={() =>
            void window.career.resetOverlayLayout().then(setLayout)
          }
        />
      )}
    </div>
  );
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
function NavBar({
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
function NavFoot({
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

/** Een verplaatsbaar element. Slepen en verschalen kan in de bewerkstand. */
function Panel({
  info,
  title,
  state,
  editing,
  language,
  innerRef,
  onGrab,
  onChange,
  children,
}: {
  info: PanelInfo;
  title: string;
  state: OverlayLayout["dienst"];
  editing: boolean;
  language: Language;
  /** Het element zelf, zodat de overlay kan meten hoe hoog het geworden is. */
  innerRef?(element: HTMLElement | null): void;
  /** Meldt het begin en het eind van slepen of schalen; zie `grijpend`. */
  onGrab?(bezig: boolean): void;
  onChange(patch: Partial<OverlayLayout["dienst"]>): void;
  /* Sinds er nog maar één element is, draagt het paneel meer dan één blok. */
  children: ReactNode;
}): JSX.Element {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number }>(
    undefined,
  );
  const size = useRef<{ x: number; y: number; w: number; h: number }>(
    undefined,
  );
  /** Het element zelf: de overlay meet er de hoogte aan, het slepen de grens. */
  const self = useRef<HTMLElement | null>(null);
  const hold = (element: HTMLElement | null): void => {
    self.current = element;
    innerRef?.(element);
  };

  const startDrag = (event: PointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: state.x,
      oy: state.y,
    };
    // Het venster even zo groot als het scherm, anders stopt het slepen bij de eigen rand.
    if (!editing) {
      void window.career.overlayGrab(true);
      onGrab?.(true);
    }
  };

  const startSize = (event: PointerEvent<HTMLElement>): void => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    size.current = {
      x: event.clientX,
      y: event.clientY,
      w: state.w,
      h: state.h,
    };
    if (!editing) {
      void window.career.overlayGrab(true);
      onGrab?.(true);
    }
  };

  /** Een stap groter of kleiner, inhoud en al. */
  const rescale = (step: number): void =>
    onChange({
      scale:
        Math.round(
          Math.min(SCALE_MAX, Math.max(SCALE_MIN, state.scale + step)) * 100,
        ) / 100,
    });

  const onMove = (event: PointerEvent<HTMLElement>): void => {
    if (drag.current) {
      const { x, y, ox, oy } = drag.current;
      /*
       * Helemaal in beeld blijven. Op zijn plek houden gaat over wat je ziet,
       * dus over de vergrote maat -- en dan over het hele element, niet alleen
       * over zijn linkerbovenhoek: een navigatie die voor driekwart buiten beeld
       * hangt, valt niet meer af te lezen.
       */
      const room = screenSize();
      const wide = (self.current?.offsetWidth ?? state.w) * state.scale;
      const tall = (self.current?.offsetHeight ?? state.h) * state.scale;
      onChange({
        x: clamp(ox + event.clientX - x, 0, Math.max(0, room.w - wide)),
        y: clamp(oy + event.clientY - y, 0, Math.max(0, room.h - tall)),
      });
    } else if (size.current) {
      const { x, y, w, h } = size.current;
      // Het element is vergroot, dus een muisstap van tien punten is er minder.
      onChange({
        w: Math.max(info.minW, w + (event.clientX - x) / state.scale),
        h: info.autoHeight
          ? state.h
          : Math.max(info.minH, h + (event.clientY - y) / state.scale),
      });
    }
  };

  const stop = (): void => {
    const bezig = Boolean(drag.current || size.current);
    drag.current = undefined;
    size.current = undefined;
    // Losgelaten: het venster krimpt weer om de overlay heen.
    if (bezig && !editing) {
      void window.career.overlayGrab(false);
      onGrab?.(false);
    }
  };

  return (
    <section
      ref={hold}
      className={`panel panel-${info.id}`}
      style={
        {
          left: state.x,
          top: state.y,
          width: state.w,
          height: info.autoHeight ? undefined : state.h,
          // Schalen bij de linkerbovenhoek: dan blijft het element staan waar je
          // het hebt neergezet en groeit het naar rechtsonder weg.
          transform: state.scale === 1 ? undefined : `scale(${state.scale})`,
          transformOrigin: "top left",
          // Eigen eigenschap: de stylesheet rekent er de dichtheid van de
          // achtergrond, de randen en de inhoud mee uit.
          "--fade": state.opacity,
        } as CSSProperties
      }
      onPointerMove={onMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      {/*
        De balk staat er altijd.
        Verslepen, schalen en doorzichtig maken moest eerst achter een knop --
        Ctrl+Alt+O -- en dat is precies een handeling te veel terwijl je rijdt.
        Hij hangt aan data-hit, dus de muis wordt alleen opgepakt waar hij ligt;
        overal elders gaan je klikken gewoon naar het spel.
      */}
      <header className="panel-bar" data-hit onPointerDown={startDrag}>
        <span className="panel-title">{title}</span>
        <button
          type="button"
          className="panel-scale"
          title={t(language, "ovl.smaller")}
          aria-label={t(language, "ovl.smaller")}
          onClick={() => rescale(-SCALE_STEP)}
        >
          −
        </button>
        <span className="panel-percent">{Math.round(state.scale * 100)}%</span>
        <button
          type="button"
          className="panel-scale"
          title={t(language, "ovl.bigger")}
          aria-label={t(language, "ovl.bigger")}
          onClick={() => rescale(SCALE_STEP)}
        >
          +
        </button>
        {/*
            De schuif zit in de balk waaraan je sleept, dus een sleep erop zou
            het hele element meenemen; stopPropagation houdt hem bij de schuif.
          */}
        <input
          type="range"
          className="panel-fade"
          min={Math.round(OPACITY_MIN * 100)}
          max={100}
          step={5}
          value={Math.round(state.opacity * 100)}
          title={`${t(language, "ovl.opacity")} ${Math.round(state.opacity * 100)}%`}
          aria-label={t(language, "ovl.opacity")}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChange({ opacity: Number(event.target.value) / 100 })
          }
        />
        <button
          type="button"
          className="panel-hide"
          title={t(language, "ovl.hide")}
          onClick={() => onChange({ visible: false })}
        >
          ✕
        </button>
      </header>

      <div className="panel-body">{children}</div>

      <span
        className="panel-grip"
        data-hit
        title={t(language, info.autoHeight ? "ovl.resizeW" : "ovl.resizeWH")}
        onPointerDown={startSize}
      />
    </section>
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
}: {
  app: OverlayApp;
  onApp(app: OverlayApp): void;
  language: Language;
  pauze: boolean;
}): JSX.Element {
  const apps: Array<{
    id: OverlayApp;
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
          {item.id === "pauze" && pauze && (
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
        <b>{bezig ?? staat}</b>
        <span>min</span>
      </div>

      <span className="app-label">
        {over === undefined
          ? t(language, "ovl.appBreakDue")
          : over >= 0
            ? t(language, "ovl.appBreakLeft", { minutes: over })
            : t(language, "ovl.appBreakOver", { minutes: -over })}
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
 * De gegevens van de dienst in drie standen. Uitklappen zet hem een stand
 * verder en weer terug naar beknopt; wat er bij komt staat eronder, zodat de
 * bovenste regel altijd op dezelfde plek blijft.
 */
function DutyPanel({
  frame,
  detail,
  language,
  onCycle,
}: {
  frame: Frame;
  detail: DetailLevel;
  language: Language;
  onCycle(): void;
}): JSX.Element {
  const tr = (
    key: Parameters<typeof t>[1],
    vars?: Record<string, string | number>,
  ): string => t(language, key, vars);
  const { status, duty, connected } = frame;
  const leg = status?.leg;

  if (!status) {
    return (
      <div className="waiting">
        <span className="dot" />{" "}
        {tr(
          connected
            ? "ovl.noData"
            : frame.laadt
              ? "ovl.loading"
              : "ovl.waiting",
        )}
      </div>
    );
  }

  const passed = walkedStops(status);
  const total = leg?.stops.length ?? 0;

  /*
   * De rit is voorbij maar de dienst nog niet: dan moet de chauffeur in OMSI de
   * volgende rit kiezen, en op de IBIS de route ervan intoetsen. Dat staat hier,
   * want anders zit hij aan het eindpunt te wachten op een overlay die niets
   * meer te melden heeft.
   */
  const next =
    duty && status.legIndex >= 0 ? duty.legs[status.legIndex + 1] : undefined;
  const legDone = Boolean(leg && status.clockMinutes >= leg.arrival);
  const nextRoute =
    duty && frame.ibis
      ? frame.ibis.legs[status.legIndex + 1]?.route
      : undefined;

  return (
    <>
      <div className="topline">
        <span className="clock">{formatTime(status.clockMinutes)}</span>
        {leg && <span className="line">{leg.lineNumber}</span>}
        <Delta status={status} tr={tr} />
        <button
          type="button"
          className="expand"
          data-hit
          title={tr("ovl.detail", {
            level: tr(`ovl.detail${detail}` as const),
          })}
          onClick={onCycle}
        >
          <span className={`pips pips-${detail}`}>
            <i />
            <i />
            <i />
          </span>
        </button>
        <LayoutButton language={language} />
      </div>

      {legDone && next && !status.dutyComplete && (
        <div className="advice next-trip">
          {nextRoute
            ? tr("ovl.nextTrip", {
                time: formatTime(next.departure),
                route: nextRoute,
              })
            : tr("ovl.nextTripPlain", { time: formatTime(next.departure) })}
        </div>
      )}

      {status.dutyComplete ? (
        <div className="line-done">{tr("ovl.done")}</div>
      ) : (
        <>
          {/* Beknopt: bestemming en volgende halte op een regel. */}
          {detail === 0 && leg && (
            <div className="tight">
              <span className="tight-stop">
                {stopName(leg, passed) ?? leg.terminus}
              </span>
              <span className="tight-rest">
                {tr("ovl.tight", {
                  passengers: status.passengers,
                  speed: Math.round(status.speedKmh),
                })}
                {total > 0 && passed !== undefined
                  ? tr("ovl.tightLeft", { left: Math.max(0, total - passed) })
                  : ""}
              </span>
            </div>
          )}

          {detail > 0 && leg && (
            <div className="row">
              <span className="label">{tr("ovl.to")}</span>
              <span className="value">{leg.terminus}</span>
              <span className="sub">
                {duty
                  ? tr("ovl.arrival", {
                      time: formatTime(leg.arrival),
                      index: status.legIndex + 1,
                      total: duty.legs.length,
                    })
                  : tr("ovl.arrivalShort", { time: formatTime(leg.arrival) })}
              </span>
            </div>
          )}

          {detail === 1 && leg && (
            <div className="row">
              <span className="label">{tr("ovl.nextStop")}</span>
              <span className="value">{stopName(leg, passed) ?? "—"}</span>
              {passed !== undefined && total > 0 && (
                <span className="sub">
                  {tr("ovl.remaining", {
                    left: Math.max(0, total - passed),
                    total,
                  })}
                </span>
              )}
            </div>
          )}

          {detail === 2 && leg && (
            <NextStops leg={leg} status={status} language={language} />
          )}

          {detail > 0 && (
            <div className="grid">
              <div>
                <b>{status.passengers}</b>
                <span>{tr("ovl.onboard")}</span>
              </div>
              <div>
                <b>{Math.round(status.speedKmh)}</b>
                <span>{tr("ovl.speed")}</span>
              </div>
              <div
                className={
                  status.hasPassengers
                    ? `mood mood-${Math.round(status.mood * 4)}`
                    : "mood"
                }
              >
                <b>
                  {loose(
                    language,
                    `mood.${status.moodLabel}`,
                    status.moodLabel,
                  )}
                </b>
                <span>{tr("ovl.mood")}</span>
              </div>
            </div>
          )}

          {detail === 2 &&
            (status.harshBrakes > 0 || status.harshAccels > 0) && (
              <div className="counters">
                {status.harshBrakes > 0 && (
                  <span>
                    {tr("ovl.harshBrakes", { count: status.harshBrakes })}
                  </span>
                )}
                {status.harshAccels > 0 && (
                  <span>
                    {tr("ovl.harshAccels", { count: status.harshAccels })}
                  </span>
                )}
              </div>
            )}
        </>
      )}

      {(status.entryRequest || status.exitRequest) && (
        <div className="request">
          {tr(status.entryRequest ? "ovl.wantsIn" : "ovl.wantsOut")}
        </div>
      )}

      {/* Waarschuwingen horen er altijd te staan; alleen de rest klapt weg. */}
      {status.advice
        .filter((item) => detail === 2 || item.severity === "warn")
        .map((item) => (
          <div key={item.id} className={`advice ${item.severity}`}>
            {loose(language, `advice.${item.id}`, item.id, {
              count: item.count ?? 0,
            })}
          </div>
        ))}
    </>
  );
}

/**
 * Voor of achter op de dienstregeling, op de seconde.
 *
 * Het verschil komt uit de tijd die bij de eerstvolgende halte hoort; is die er
 * niet -- geen IBIS, geen dienstregeling in het menu -- dan valt hij terug op de
 * vertraging in hele minuten die de bus zelf meldt.
 */
function Delta({
  status,
  tr,
}: {
  status: LiveStatus;
  tr: (
    key: Parameters<typeof t>[1],
    vars?: Record<string, string | number>,
  ) => string;
}): JSX.Element {
  const delta = status.deltaSeconds;
  if (delta === undefined) {
    const late = status.delayMinutes >= 1;
    return (
      <span className={`delay ${late ? "late" : "ontime"}`}>
        {late
          ? tr("ovl.late", { minutes: Math.round(status.delayMinutes) })
          : tr("ovl.ontime")}
        {status.delayFromIbis ? "" : "*"}
      </span>
    );
  }

  /*
   * Waar de grens ligt tussen op tijd, te laat en te vroeg staat op één plek:
   * `punctuality`. Het venster van de app rekent met dezelfde grens, anders
   * staat er op het ene scherm groen en op het andere rood.
   */
  const size = Math.abs(delta);
  const clock = `${Math.floor(size / 60)}:${String(size % 60).padStart(2, "0")}`;
  const state = punctuality(delta);
  const klasse =
    state === "laat" ? "late" : state === "vroeg" ? "early" : "ontime";
  return (
    <span className={`delay ${klasse}`} title={tr("ovl.onTheDot")}>
      {state === "optijd"
        ? tr("ovl.ontime")
        : `${delta > 0 ? "+" : "\u2212"}${clock}`}
    </span>
  );
}

/**
 * Naar de bewerkstand, vanuit de overlay zelf.
 *
 * Hij draagt `data-hit`, want buiten de bewerkstand laat het venster klikken
 * door naar het spel; alleen boven zo'n knop pakt het de muis even op.
 */
/** Het versienummer in de bewerkbalk; gevraagd bij elke foutmelding. */
function OverlayVersie(): JSX.Element | null {
  const [versie, setVersie] = useState<string>();
  useEffect(() => {
    let staat = true;
    void window.career.version().then((waarde) => {
      if (staat) setVersie(waarde);
    });
    return () => {
      staat = false;
    };
  }, []);
  return versie ? <span className="editbar-version">v{versie}</span> : null;
}

function LayoutButton({ language }: { language: Language }): JSX.Element {
  return (
    <button
      type="button"
      className="layout-button"
      data-hit
      title={t(language, "ovl.layout")}
      aria-label={t(language, "ovl.layout")}
      onClick={() => void window.career.editOverlay(true)}
    >
      {/* Twee panelen naast elkaar: dat is waar de knop over gaat. */}
      <svg viewBox="0 0 16 14" aria-hidden="true">
        <rect x="0.75" y="0.75" width="6" height="12.5" rx="1.5" />
        <rect x="9.25" y="0.75" width="6" height="7" rx="1.5" />
      </svg>
    </button>
  );
}

/**
 * De dienst is gekozen, maar de IBIS weet nog van niets.
 *
 * Dit is het moment waarop de chauffeur iets moet intoetsen, dus staat er wat
 * hij moet intoetsen -- en verder niets. Haltes en vertraging hebben pas
 * betekenis zodra de IBIS antwoord geeft.
 */
function IbisPanel({
  duty,
  ibis,
  status,
  language,
}: {
  duty: Duty;
  ibis?: IbisPlan;
  status?: LiveStatus;
  language: Language;
}): JSX.Element {
  const legIndex = status?.legIndex ?? 0;
  const leg = duty.legs[legIndex] ?? duty.legs[0];
  // De route van de rit die nu aan de beurt is; anders de eerste die er een heeft.
  const entry = ibis?.legs[legIndex] ?? ibis?.legs.find((item) => item.route);
  const line = ibis?.line || leg?.lineNumber || "—";

  return (
    <div className="ibis-entry">
      <div className="topline">
        <b>{t(language, "ovl.ibisTitle")}</b>
        <LayoutButton language={language} />
      </div>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, "ibis.line")}</span>
        </div>
        <div>
          <b>
            <RouteCode route={entry?.route} kort={entry?.routeShort} />
          </b>
          <span>{t(language, "ibis.routeAtStart")}</span>
        </div>
      </div>
      <div className="row">
        <span className="sub">
          {entry?.route
            ? t(language, "ovl.ibisWaiting")
            : t(language, "ibis.noTable")}
        </span>
      </div>
    </div>
  );
}

/**
 * Voordat de dienst in OMSI zelf gekozen is.
 *
 * Tijd, haltes en vertraging hebben dan nog geen betekenis; wat de chauffeur
 * nodig heeft is wat hij moet aanklikken en intoetsen. Dat staat hier allebei:
 * de lijn, de omloop en de rit voor Set Time Table, en de lijn en de route voor
 * de IBIS. En het gaat over de rit die nu aan de beurt is, niet over de eerste
 * van de dienst -- na een voltooide rit hoort hier de volgende te staan.
 */
function SelectPanel({
  duty,
  ibis,
  leg,
  legIndex,
  status,
  language,
}: {
  duty: Duty;
  ibis?: IbisPlan;
  leg?: DutyLeg;
  legIndex: number;
  status?: LiveStatus;
  language: Language;
}): JSX.Element {
  const chosen = status?.schedule;
  const line = ibis?.line || leg?.lineNumber || duty.lineNumbers[0] || "—";
  const entry = ibis?.legs[legIndex];
  return (
    <div className="select-duty">
      <div className="topline">
        <span className="line">
          {leg?.lineNumber ?? duty.lineNumbers.join(" / ")}
        </span>
        <b>{t(language, "ovl.selectTitle")}</b>
        <LayoutButton language={language} />
      </div>

      <span className="step-title">{t(language, "ovl.menu")}</span>
      <div className="grid">
        <div>
          <b>{leg?.lineFile ?? duty.lineFile}</b>
          <span>Line</span>
        </div>
        <div>
          <b>{leg?.tourNumber ?? duty.tourNumber}</b>
          <span>Tour</span>
        </div>
        <div>
          <b>{leg ? formatTime(leg.departure) : "—"}</b>
          <span>{t(language, "ovl.menuTrip")}</span>
        </div>
      </div>

      <span className="step-title">{t(language, "ovl.onTheIbis")}</span>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, "ibis.line")}</span>
        </div>
        <div>
          <b>
            <RouteCode route={entry?.route} kort={entry?.routeShort} />
          </b>
          <span>{t(language, "ibis.routeAtStart")}</span>
        </div>
        <div className="wide">
          <b>{leg?.stops[0] ?? "—"}</b>
          <span>{t(language, "ovl.menuFirst")}</span>
        </div>
      </div>

      <div className="row">
        <span className="sub">
          {t(language, "ovl.selectSteps", {
            time: leg ? formatTime(leg.departure) : "—",
          })}
        </span>
      </div>

      {chosen && !chosen.matchesDuty && (
        <div className="advice warn">
          {t(language, "ovl.selectWrong", {
            line: chosen.lineName || "—",
            tour: chosen.tourName || "—",
          })}
        </div>
      )}
    </div>
  );
}

/**
 * De stap tussen kiezen en rijden: de IBIS.
 *
 * OMSI weet dan al welke dienst je rijdt, maar de bus nog niet: lijn en route
 * moeten met de hand op het toetsenblok. De route zegt ook de richting -- heen
 * is een andere dan terug -- en dat is precies waar het misgaat als je gokt.
 *
 * Er zit een knop onder in plaats van dat we het zelf afleiden. De plugin kan
 * niet zien of de chauffeur klaar is met tikken, en een infoscherm dat halverwege
 * het intoetsen aanspringt leidt alleen maar af.
 */
function IbisStep({
  leg,
  ibis,
  legIndex,
  language,
  onDone,
}: {
  leg?: DutyLeg;
  ibis?: IbisPlan;
  legIndex: number;
  language: Language;
  onDone(): void;
}): JSX.Element {
  const line = ibis?.line || leg?.lineNumber || "—";
  const entry = ibis?.legs[legIndex];
  return (
    // Een eigen naam naast die van het keuzescherm: ze lijken op elkaar, en een
    // proef moet kunnen zien welke van de twee er staat.
    <div className="select-duty ibis-step">
      <div className="topline">
        <span className="line">{leg?.lineNumber ?? "—"}</span>
        <b>{t(language, "ovl.ibisStepTitle")}</b>
        <LayoutButton language={language} />
      </div>
      <div className="grid">
        <div>
          <b>{line}</b>
          <span>{t(language, "ibis.line")}</span>
        </div>
        <div>
          <b>
            <RouteCode route={entry?.route} kort={entry?.routeShort} />
          </b>
          <span>{t(language, "ibis.routeAtStart")}</span>
        </div>
        <div>
          <b>{leg?.terminus ?? "—"}</b>
          <span>{t(language, "ovl.to")}</span>
        </div>
      </div>
      <div className="row">
        <span className="sub">
          {t(language, "ovl.ibisStepHow", { line, route: entry?.route ?? "—" })}
        </span>
      </div>
      <button type="button" className="ovl-btn" data-hit onClick={onDone}>
        {t(language, "ovl.ibisDone")}
      </button>
    </div>
  );
}

/** De balk die alleen in de bewerkstand verschijnt. */
function EditBar({
  layout,
  language,
  rate,
  onRate,
  onShow,
  onReset,
}: {
  layout: OverlayLayout;
  language: Language;
  rate: OverlayRate;
  onRate(next: OverlayRate): void;
  onShow(id: PanelId): void;
  onReset(): void;
}): JSX.Element {
  const hidden = PANELS.filter((info) => !layout[info.id].visible);
  const name = (id: PanelId): string =>
    t(language, id === "dienst" ? "ovl.panelDuty" : "ovl.panelNav");
  return (
    <div className="editbar" data-hit>
      <b>{t(language, "ovl.editTitle")}</b>
      <span className="editbar-hint">{t(language, "ovl.editHint")}</span>
      {/* Wie hier staat is aan het instellen; dan is het versienummer ook te vinden. */}
      <OverlayVersie />

      {hidden.length > 0 && (
        <div className="editbar-add">
          <span>{t(language, "ovl.hidden")}</span>
          {hidden.map((info) => (
            <button key={info.id} type="button" onClick={() => onShow(info.id)}>
              + {name(info.id)}
            </button>
          ))}
        </div>
      )}

      {/*
        Hoe vaak de overlay zichzelf opnieuw tekent. Hij ligt doorzichtig over
        OMSI heen, en elke verversing moet Windows over het spel heen mengen --
        dat kost beeldjes. Wie haperingen merkt, zet hem hier rustiger; de
        cijfers lopen net zo goed mee, de bus op de kaart schuift alleen met
        grotere stappen op.
      */}
      <div className="editbar-rate">
        <span>{t(language, "ovl.rate")}</span>
        {(Object.keys(OVERLAY_RATES) as OverlayRate[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={rate === key}
            className={rate === key ? "on" : undefined}
            onClick={() => onRate(key)}
          >
            {t(language, `ovl.rate.${key}` as const)}
          </button>
        ))}
        <span className="editbar-hint">{t(language, "ovl.rateHint")}</span>
      </div>

      <div className="editbar-buttons">
        <button type="button" onClick={onReset}>
          {t(language, "ovl.reset")}
        </button>
        {/* Zonder deze knop kreeg je de overlay alleen via de app dicht. */}
        <button type="button" onClick={() => void window.career.closeOverlay()}>
          {t(language, "ovl.close")}
        </button>
        <button
          type="button"
          className="done"
          onClick={() => void window.career.editOverlay(false)}
        >
          {t(language, "ovl.ready")}
        </button>
      </div>
    </div>
  );
}

/**
 * De haltes die nog komen, als een lijndiagram.
 *
 * Waar je bent komt uit de IBIS; die vult zich pas als de lijn en route zijn
 * ingetoetst. Zolang dat niet is gebeurd staat de hele rit er gewoon, vanaf het
 * begin — dan weet je tenminste wat er aankomt.
 */
function NextStops({
  leg,
  status,
  language,
}: {
  leg: DutyLeg;
  status: LiveStatus;
  language: Language;
}): JSX.Element {
  const tr = (
    key: Parameters<typeof t>[1],
    vars?: Record<string, string | number>,
  ): string => t(language, key, vars);
  const total = leg.stops.length;
  const passed = walkedStops(status);
  const at = passed ?? 0;

  // Eentje terug geeft richting; verder vooruit past niet in de cabine.
  const from = Math.max(0, at - 1);
  const shown = leg.stops.slice(from, from + 6);
  const left = total - (from + shown.length);

  return (
    <div className="nav">
      <div className="nav-head">
        <span className="label">{tr("ovl.stop")}</span>{" "}
        {passed !== undefined ? (
          <span className="sub">
            {tr("ovl.remaining", { left: Math.max(0, total - at), total })}
          </span>
        ) : (
          <span className="sub">
            {tr(status.offersStops ? "ovl.ibisHint" : "ovl.noStopInfo")}
          </span>
        )}
      </div>

      <ol className="strip">
        {shown.map((name, index) => {
          const index2 = from + index;
          const state =
            passed === undefined
              ? "ahead"
              : index2 < at
                ? "done"
                : index2 === at
                  ? "now"
                  : "ahead";
          return (
            <li key={`${index2}-${name}`} className={`stop ${state}`}>
              <span className="pin" />
              <span className="name">{name}</span>
              {leg.stopTimes[index2] !== undefined && (
                <span className="stop-time">
                  {formatTime(leg.stopTimes[index2])}
                </span>
              )}
              {index2 === total - 1 && (
                <span className="tag">{tr("ovl.endpoint")}</span>
              )}
            </li>
          );
        })}
      </ol>

      {left > 0 && (
        <div className="nav-rest">
          {tr("ovl.andMore", { count: left, terminus: leg.terminus })}
        </div>
      )}
    </div>
  );
}

/** Hoeveel haltes de bus gehad heeft, of niets als hij het niet doorgeeft. */
function walkedStops(status?: LiveStatus): number | undefined {
  if (!status?.leg || !status.reportsStops || status.stopIndex === undefined)
    return undefined;
  return Math.min(Math.max(status.stopIndex, 0), status.leg.stops.length);
}

function stopName(leg: DutyLeg, at?: number): string | undefined {
  if (at === undefined) return undefined;
  return leg.stops[Math.min(at, leg.stops.length - 1)];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

createRoot(document.getElementById("root")!).render(<Overlay />);

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
 * WAAROM ER NIETS BEVEILIGD WORDT
 * Het nummer en de pincode staan gewoon in het profiel en gaan gewoon mee in het
 * beeld. Er valt hier niets te beschermen: het is je eigen pc en je eigen
 * profiel. Zie `core/career.ts`. Wie zijn code kwijt is, leest hem terug in de
 * app -- en daarom staat er bij een verkeerde invoer ook gewoon "onbekend
 * nummer" en geen ontmoedigende stilte.
 *
 * Het cijferblok is groot met opzet. Dit gebeurt terwijl je al in de bus zit.
 */
function AanmeldPaneel({
  chauffeur,
  language,
  onAangemeld,
}: {
  chauffeur?: { naam: string; personeelsnummer?: string; pincode?: string };
  language: Language;
  onAangemeld: () => void;
}): JSX.Element {
  const [stap, setStap] = useState<"nummer" | "pin">("nummer");
  const [ingevoerd, setIngevoerd] = useState("");
  const [fout, setFout] = useState(false);

  const verwacht =
    stap === "nummer" ? chauffeur?.personeelsnummer : chauffeur?.pincode;
  const lengte = verwacht?.length ?? 0;

  /*
   * Zodra er genoeg cijfers staan wordt er gekeken. Geen bevestigknop: op een
   * terminal met een vaste codelengte is die overbodig, en je hebt één hand aan
   * het stuur.
   */
  useEffect(() => {
    if (!verwacht || ingevoerd.length < lengte) return;
    if (ingevoerd === verwacht) {
      setFout(false);
      setIngevoerd("");
      if (stap === "nummer") setStap("pin");
      else onAangemeld();
    } else {
      setFout(true);
      setIngevoerd("");
    }
  }, [ingevoerd, verwacht, lengte, stap, onAangemeld]);

  /* Zonder gegevens valt er niets na te kijken; dan maar door. */
  if (!chauffeur?.personeelsnummer || !chauffeur?.pincode) {
    return (
    /*
     * data-hit, anders gebeurt er niets als je drukt.
     *
     * Het overlayvenster laat muisklikken door naar OMSI -- het ligt over het
     * hele scherm, dus een venster dat klikken opvangt vangt ze overal op.
     * Alleen waar `data-hit` staat wordt de muis even opgevraagd. Dat stond er
     * niet, en dus was dit een plaatje van een cijferblok: de klik ging dwars
     * door de toetsen heen naar de bus erachter.
     */
      <div className="aanmelden" data-hit>
        <p className="aanmeld-uitleg">{t(language, "ovl.signonNone")}</p>
        <button type="button" className="aanmeld-door" onClick={onAangemeld}>
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
                : "•"
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
function KaartjesApp({
  set,
  language,
}: {
  set?: Kaartset;
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

  if (!set || set.kaartjes.length === 0) {
    return <p className="app-leeg">{t(language, "ovl.ticketsNone")}</p>;
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
        <ul className="kaartlijst">
          {set.kaartjes.map((kaartje) => (
            <li key={kaartje.naam}>
              <button type="button" onClick={() => setGekozen(kaartje)}>
                <span className="kaartnaam">{kaartje.naam}</span>
                <span className="kaartprijs">{kaartje.prijs.toFixed(2)}</span>
              </button>
              {kaartje.maxHaltes > 0 && (
                <small>
                  {t(language, "ovl.ticketStops", { count: kaartje.maxHaltes })}
                </small>
              )}
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
