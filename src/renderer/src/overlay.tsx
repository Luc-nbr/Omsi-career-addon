import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent,
} from "react";
import { createRoot } from "react-dom/client";
import type { MapGeometry } from "../../core/geo";
import type { IbisPlan } from "../../core/ibis";
import type { LiveStatus } from "../../core/live";
import type { Duty, DutyLeg } from "../../core/types";
import type { CareerApi } from "../../shared/api";
import { formatTime } from "../../shared/format";
import { RouteCode } from "./RouteCode";
import { ApparaatApp } from "./apparaatdeel";
import {
  LEGE_TELEFOON,
  Telefoon,
  type TelefoonActies,
  type TelefoonFrame,
} from "./telefoon";
import { dutyKeyOf } from "../../shared/telefoon";
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
import { stopName, useRitStand, useStable, walkedStops } from "./navigatie";
/*
 * Dezelfde letter als het hoofdvenster. Manrope blijft erbij staan omdat delen
 * van de overlay hem nog noemen; wat de nieuwe wereld tekent gebruikt Hanken.
 */
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "./theme.css";
import { zetAnimaties } from "./animaties";
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
/** Zo dicht bij een schermrand klikt een element er tegenaan, in schermpunten. */
const KLEEF = 14;

/**
 * De ruimte boven een element voor zijn balk: 30 hoog en 6 lucht.
 *
 * De balk zweeft boven het element. Het venster krimpt buiten het slepen tot
 * het vak om de elementen heen, en rekende hem niet mee: van de oude balk viel
 * de helft buiten het venster, en die helft kon je niet zien en niet pakken.
 * Staat een element zo hoog dat er geen ruimte boven is, dan komt de balk
 * erbinnen (zie `data-balk`).
 */
const BALK_RUIMTE = 36;

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

interface Frame extends TelefoonFrame {
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

function Overlay(): JSX.Element | null {
  const [frame, setFrame] = useState<Frame>({
    connected: false,
    editing: false,
  });
  /** Staat de navigatie open voor een telefoon of tablet? Zie `ApparaatApp`. */
  const [deelt, setDeelt] = useState(false);
  const [layout, setLayout] = useState<OverlayLayout>();
  const [geometry, setGeometry] = useState<MapGeometry>();
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
  /*
   * Aangemeld, getekend, pauze en IBIS komen uit het hoofdproces: dezelfde
   * stand als op een telefoon of tablet, zodat aanmelden op je iPad hier ook
   * telt. Een beeld van voor die verandering heeft hem niet; dan staat alles
   * op af.
   */
  const stand = frame.telefoon ?? LEGE_TELEFOON;
  const acties = useMemo<TelefoonActies>(
    () => ({
      aanmelden: (nummer, pin) => window.career.telefoonAanmelden(nummer, pin),
      overslaan: () => void window.career.telefoonOverslaan(),
      aanvaarden: () => void window.career.telefoonAanvaard(),
      pauze: (vanaf) => void window.career.telefoonPauze(vanaf),
      ibisKlaar: (tripKey) => void window.career.telefoonIbis(tripKey),
    }),
    [],
  );
  const ibis = useStable(
    frame.ibis,
    frame.ibis ? `${frame.ibis.line}|${frame.ibis.tour}` : "",
  );
  useEffect(() => {
    window.overlay.onFrame(setFrame);
    void window.career.overlayLayout().then(setLayout);
    void window.career.settings().then((settings) => {
      setLanguage(settings.language);
      setRate(settings.overlayRate);
      // Ook de overlay volgt wat er in de app voor animaties gekozen is.
      zetAnimaties(settings.animaties);
    });
    // Een overlay die opnieuw opent, hoort te weten dat er al gedeeld werd.
    void window.career
      .apparaatStand()
      .then((stand) => setDeelt(stand.aan))
      .catch(() => undefined);
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

  // Waar de dienst staat; dezelfde som als op de webpagina, zie navigatie.tsx.
  const rit = useRitStand(frame, duty, stand.ibisReady);

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
        const boven =
          state.y >= BALK_RUIMTE * state.scale ? BALK_RUIMTE * state.scale : 0;
        delen.push({
          x: state.x,
          y: state.y - boven,
          w: element.offsetWidth * state.scale,
          h: element.offsetHeight * state.scale + boven,
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

  const {
    readable,
    ibisLoaded,
    ibisCapable,
    upcomingIndex,
    upcoming,
    tripKey,
    ibisTyped,
  } = rit;
  /*
   * Klaar om te rijden: aangemeld, en getekend voor deze dienst. Zonder dienst
   * -- vrij rijden -- is aanmelden genoeg; er valt dan niets te aanvaarden.
   */
  const getekend = stand.aangemeld && (!duty || stand.aanvaard);

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
              <Dienstpas chauffeur={frame.chauffeur} language={language} />
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
          ) : duty && ibisCapable && !ibisTyped && stand.ibisReady !== tripKey ? (
            <IbisStep
              leg={upcoming}
              ibis={ibis}
              legIndex={upcomingIndex}
              language={language}
              onDone={() => acties.ibisKlaar(tripKey)}
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
          <Telefoon
            frame={frame}
            duty={duty}
            geometry={geometry}
            rit={rit}
            stand={stand}
            acties={acties}
            pixelScale={layout.navigatie.scale}
            language={language}
            /*
             * De QR-code staat alleen in de overlay: op het toestel zelf heb je
             * er niets aan. Het stipje zegt dat er gedeeld wordt.
             */
            extra={{
              id: "apparaat",
              label: "ovl.appDevice",
              // Een tablet met een telefoon ervoor: de navigatie op een ander toestel.
              pad: "M4 3h12a2 2 0 0 1 2 2v1.5h-1.8V4.8H3.8v12.4h7.4V19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm11 5h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm-.2 2v8.2h5.4V10Zm2.1 9.1h1.4v1h-1.4Z",
              stip: deelt,
              scherm: <ApparaatApp language={language} onStand={setDeelt} />,
            }}
          />
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
  /** Wordt het nu versleept of geschaald? Dan draagt het de blauwe rand. */
  const [sleept, setSleept] = useState(false);
  const hold = (element: HTMLElement | null): void => {
    self.current = element;
    innerRef?.(element);
  };

  /*
   * Slepen rekent in SCHERMpunten (`screenX`), niet in vensterpunten. Zodra je
   * vastpakt groeit het overlayvenster van het vak om de elementen heen naar het
   * hele scherm; met `clientX` verschoof daarmee halverwege de sleep de
   * nulpunt, en sprong het element een eind op. Schermpunten veranderen niet
   * als het venster verandert.
   */
  const startDrag = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    // Een knop of de schuif in de balk is geen handvat.
    if ((event.target as Element).closest("button, input, label")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.screenX,
      y: event.screenY,
      ox: state.x,
      oy: state.y,
    };
    setSleept(true);
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
      x: event.screenX,
      y: event.screenY,
      w: state.w,
      h: state.h,
    };
    setSleept(true);
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
      const maxX = Math.max(0, room.w - wide);
      const maxY = Math.max(0, room.h - tall);
      /*
       * Dicht bij een schermrand klikt het element er tegenaan. Een hoek halen
       * was pixelwerk: het bleef een paar punten van de rand hangen, en dan zie
       * je een streepje spel tussen de navigatie en de rand van je scherm.
       */
      const kleef = (plek: number, max: number): number =>
        plek < KLEEF ? 0 : max - plek < KLEEF ? max : plek;
      onChange({
        x: kleef(clamp(ox + event.screenX - x, 0, maxX), maxX),
        y: kleef(clamp(oy + event.screenY - y, 0, maxY), maxY),
      });
    } else if (size.current) {
      const { x, y, w, h } = size.current;
      // Het element is vergroot, dus een muisstap van tien punten is er minder.
      onChange({
        w: Math.max(info.minW, w + (event.screenX - x) / state.scale),
        h: info.autoHeight
          ? state.h
          : Math.max(info.minH, h + (event.screenY - y) / state.scale),
      });
    }
  };

  const stop = (): void => {
    const bezig = Boolean(drag.current || size.current);
    drag.current = undefined;
    size.current = undefined;
    setSleept(false);
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
      data-balk={state.y < BALK_RUIMTE * state.scale ? "binnen" : undefined}
      data-sleept={sleept ? "ja" : undefined}
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
        {/* Het greepje: zes stippen, het teken voor "hier kun je aan trekken". */}
        <svg className="panel-greep" viewBox="0 0 10 16" aria-hidden="true">
          {[3, 8, 13].map((cy) => (
            <g key={cy}>
              <circle cx="2.5" cy={cy} r="1.3" />
              <circle cx="7.5" cy={cy} r="1.3" />
            </g>
          ))}
        </svg>
        <span className="panel-title">{title}</span>
        <span className="panel-maat">
          <button
            type="button"
            className="panel-scale"
            title={t(language, "ovl.smaller")}
            aria-label={t(language, "ovl.smaller")}
            onClick={() => rescale(-SCALE_STEP)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6h7" />
            </svg>
          </button>
          <span className="panel-percent">{Math.round(state.scale * 100)}%</span>
          <button
            type="button"
            className="panel-scale"
            title={t(language, "ovl.bigger")}
            aria-label={t(language, "ovl.bigger")}
            onClick={() => rescale(SCALE_STEP)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6h7M6 2.5v7" />
            </svg>
          </button>
        </span>
        {/*
          De doorzichtigheid: een druppel met de schuif erachter. De schuif zit
          in de balk waaraan je sleept; `startDrag` laat invoervelden met rust,
          en stopPropagation houdt de sleep bij de schuif.
        */}
        <label
          className="panel-dicht"
          title={`${t(language, "ovl.opacity")} ${Math.round(state.opacity * 100)}%`}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.6C4.2 4 3 5.6 3 7.2a3 3 0 0 0 6 0C9 5.6 7.8 4 6 1.6Z" />
          </svg>
          <input
            type="range"
            className="panel-fade"
            min={Math.round(OPACITY_MIN * 100)}
            max={100}
            step={5}
            value={Math.round(state.opacity * 100)}
            aria-label={t(language, "ovl.opacity")}
            style={
              {
                "--vulling": `${((state.opacity - OPACITY_MIN) / (1 - OPACITY_MIN)) * 100}%`,
              } as CSSProperties
            }
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChange({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <button
          type="button"
          className="panel-hide"
          title={t(language, "ovl.hide")}
          aria-label={t(language, "ovl.hide")}
          onClick={() => onChange({ visible: false })}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3l6 6M9 3 3 9" />
          </svg>
        </button>
      </header>

      <div className="panel-body">{children}</div>

      {/*
        Vastpakken kan aan elke rand, niet alleen aan de balk.

        Alleen aan de balk betekende: de navigatie in een hoek onderaan zetten
        door hem aan zijn bovenkant naar beneden te trekken, zonder te zien waar
        de onderrand uitkomt. Nu pak je hem aan de kant die je in de hoek wilt.
        Het zijn smalle stroken langs de rand en niet het hele element: overal
        waar `data-hit` staat vangt de overlay de muis, en dan krijgt OMSI hem
        niet -- ook niet om rond te kijken.
      */}
      {(["boven", "links", "rechts", "onder"] as const).map((kant) => (
        <span
          key={kant}
          className={`panel-rand panel-rand-${kant}`}
          data-hit
          aria-hidden="true"
          onPointerDown={startDrag}
        />
      ))}

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

      {/* Je dienstpas, klein: voor wie zich na een herstart van OMSI opnieuw aanmeldt. */}
      <Dienstpas chauffeur={frame.chauffeur} language={language} klein />
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

createRoot(document.getElementById("root")!).render(<Overlay />);

/**
 * Je dienstpas: personeelsnummer en pincode.
 *
 * Ze stonden alleen in de app, bij de staat van dienst en op het rijscherm --
 * en dat is net niet het scherm dat je voor je hebt als je in de bus zit met
 * het cijferblok van de telefoon voor je neus. Luc wilde ze in het
 * dienstpaneel: groot zolang je nog moet aanmelden, en daarna als een kleine
 * regel onderaan, voor wie zich na een herstart van OMSI opnieuw aanmeldt.
 */
function Dienstpas({
  chauffeur,
  language,
  klein,
}: {
  chauffeur?: { personeelsnummer?: string; pincode?: string };
  language: Language;
  klein?: boolean;
}): JSX.Element | null {
  if (!chauffeur?.personeelsnummer || !chauffeur.pincode) return null;
  if (klein) {
    return (
      <p className="pasregel">
        <span>{t(language, "prof.staffNumber")}</span>
        <b>{chauffeur.personeelsnummer}</b>
        <span>{t(language, "prof.pin")}</span>
        <b>{chauffeur.pincode}</b>
      </p>
    );
  }
  return (
    <dl className="aanmeld-pas">
      <div>
        <dt>{t(language, "prof.staffNumber")}</dt>
        <dd>{chauffeur.personeelsnummer}</dd>
      </div>
      <div>
        <dt>{t(language, "prof.pin")}</dt>
        <dd>{chauffeur.pincode}</dd>
      </div>
    </dl>
  );
}

