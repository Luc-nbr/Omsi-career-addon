import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type JSX,
} from "react";
import type { GameMode } from "../../core/career";
import type { Duty } from "../../core/types";
import type { LiveStatus } from "../../core/live";
import type { VehiclePosition } from "../../core/vehicle";
import type { LineSummary } from "../../core/duty";
import { EXAM_LIMITS } from "../../core/exam";
import type { IbisPlan } from "../../core/ibis";
import type { PluginStatus } from "../../core/pluginInstall";
import type { Vehicle } from "../../core/vehicles";
import { WEATHER_KINDS, type WeatherKind } from "../../shared/weather";
import {
  TIME_WINDOWS,
  type Assignment,
  type BeginResult,
  type CareerApi,
  type CareerPayload,
  type DutyRequest,
  type KaartenStand,
  type BusfotoStand,
  type BusKleurstellingen,
  type OmsiMelding,
  type MapSummary,
  type PrinterInfo,
  type HofOffer,
  type OmsiState,
  type SessionResult,
  type YardOption,
  type Busmapinfo,
  type Busanalyseinfo,
  type FreeCheck,
  type FreeResult,
  type VrijStaat,
  type VrijWanneer,
} from "../../shared/api";
import { formatDuration, formatTime } from "../../shared/format";
import type { Bus3dKeuze } from "../../shared/bus3d";
import { Dienstoverzicht } from "./Dienstoverzicht";
import { DutyCard } from "./DutyCard";
import { Flag } from "./Flag";
import { GameSetup } from "./GameSetup";
import { Profiel } from "./Profiel";
import { BedrijfApp } from "./Bedrijf";
import type { Tab as BedrijfTab } from "./BedrijfDelen";
import { AddonsApp } from "./Addons";
import { RunningDuty } from "./RunningDuty";
import {
  Setup,
  STAPPEN,
  type Busvorm,
  type Kruimel,
  type Rij,
  type Stap,
  type Tegel,
} from "./Setup";
import { StartingDialog } from "./StartingDialog";
import { suggestieGroepen, vrijeStaatTekst } from "./vrijstaat";
import { LiveDienst } from "./LiveDienst";
import { HofDialog } from "./HofDialog";
import { BusDialog } from "./BusDialog";
import { Busrit } from "./Busrit";
import { Chauffeurstart } from "./Chauffeurstart";
import { Taalkeuze } from "./Taalkeuze";
import { Welkom } from "./Welkom";
import { Klaarzetten } from "./Klaarzetten";
import { Busplaatjes } from "./Busplaatjes";
import { Icoon } from "./Icoon";
import { Starthub } from "./Starthub";
import { Dienstpas } from "./Dienstpas";
import { DraaitDialog } from "./DraaitDialog";
import { HervatDialog } from "./HervatDialog";
import { ThemaKnop, type Thema } from "./ThemaKnop";
import { wisselThema } from "./themaOvergang";
import { Rondleiding } from "./Rondleiding";
import { ApparaatDialoog } from "./ApparaatDialoog";
import { zetAnimaties } from "./animaties";
import { Versie } from "./Versie";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  t,
  type Language,
} from "../../shared/i18n";
import { LanguageProvider } from "./language";

declare global {
  interface Window {
    career: CareerApi;
  }
}

/**
 * De naam van een bus, zoals hij in de lijst staat.
 *
 * `vehicleName` staat in core/vehicles.ts, maar dat bestand leest ook mappen en
 * sleept dus node:fs mee; in het venster hoort dat niet thuis. Twee regels hier
 * is goedkoper dan een bestand splitsen om er één functie uit te halen.
 */
function busnaam(bus: Vehicle): string {
  return [bus.manufacturer, bus.type].filter(Boolean).join(" ") || bus.folder;
}

/**
 * Een bus uit elkaar halen in merk, type en uitvoering.
 *
 * OMSI zet dat allemaal in een veld, gescheiden door " - ": "Gelenkbus - 18C -
 * 3 Tuerer - Voith" of "628c LF - 5HP502". Het eerste stuk is het type, de rest
 * de uitvoering. Het merk staat apart in `manufacturer` en is altijd gevuld.
 */
function ontleedBus(bus: Vehicle): {
  merk: string;
  type: string;
  uitvoering: string;
} {
  const delen = bus.type
    .split(" - ")
    .map((deel) => deel.trim())
    .filter(Boolean);
  return {
    merk: bus.manufacturer || bus.folder,
    type: delen[0] || bus.folder,
    uitvoering: delen.slice(1).join(" · ") || bus.paint || "—",
  };
}

/**
 * De vorm van de bus, afgeleid uit hoe hij heet.
 *
 * OMSI zegt nergens of een bus geleed is, maar de naam wel: een Gelenkbus is
 * geleed, 18C en 19C zijn de gelede lengtes, en een Doppeldecker is een
 * dubbeldekker. Beter een vorm die meestal klopt dan overal hetzelfde blokje.
 */
function busvorm(tekst: string): Busvorm {
  const laag = tekst.toLowerCase();
  if (/gelenk|artic|18c|19c/.test(laag)) return "geleed";
  if (/doppeldeck|double ?deck/.test(laag)) return "dubbel";
  if (/midi|10c|o530k|kurz/.test(laag)) return "midi";
  return "solo";
}

/* OMSI telt de dag van het jaar, een datumveld geeft een jaartal-maand-dag. */
function dagVanIso(iso: string): { year: number; dayOfYear: number } {
  const datum = new Date(`${iso}T00:00:00Z`);
  const begin = Date.UTC(datum.getUTCFullYear(), 0, 1);
  return {
    year: datum.getUTCFullYear(),
    dayOfYear: Math.round((datum.getTime() - begin) / 86400000) + 1,
  };
}

/** Dienstlengtes die je kunt kiezen, in minuten. Korter dan een half uur niet. */
const LENGTHS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480];

/*
 * Welke stappen elke modus langsloopt.
 *
 * De reeks is dezelfde en de volgorde ook; wat verschilt is de vraag tussen de
 * kaart en de dienst. In dienst wordt er niets gevraagd -- de app loopt de
 * lijnen zelf. In carriere staat daar je vergunning: je rijdt niet wat je kiest
 * maar wat je mag. Bij vrij rijden staat er de lijn, want daar stel je je rit
 * zelf samen.
 *
 * Een stap weglaten is niet hetzelfde als hem uitzetten: wat er niet staat,
 * belooft ook niets.
 */
/*
 * Welke stappen er in de balk staan. `rijden` valt er standaard uit: dat scherm
 * bestaat pas als de dienst loopt, en een stap waar je niet naartoe kunt is geen
 * stap maar een belofte. Het rijscherm plakt hem er zelf achter.
 */
const STAPPEN_DIENST: readonly Stap[] = STAPPEN.filter(
  (naam) => naam !== "line" && naam !== "licence" && naam !== "rijden",
);
const STAPPEN_CARRIERE: readonly Stap[] = STAPPEN.filter(
  (naam) => naam !== "line" && naam !== "rijden",
);
/*
 * Vrij rijden: alleen de kaart en de bus. Een gebruiker: "nur und nur noch
 * Karte und Bus ausgesucht werden müssen und das Navi es von alleine findet".
 * Waar de bus staat kiest de app; de omloop kies je in OMSI.
 */
const STAPPEN_VRIJ: readonly Stap[] = STAPPEN.filter(
  (naam) =>
    naam !== "line" &&
    naam !== "licence" &&
    naam !== "duty" &&
    naam !== "rijden",
);

/**
 * Welk scherm er staat. De app begint altijd bij de chauffeur en gaat dan naar
 * de modus; daarna pas komt het rijden in beeld.
 */
type Screen =
  | "profiles"
  | "modes"
  | "drive"
  | "game"
  | "profiel"
  | "bussen"
  | "bedrijf"
  | "addons";

/*
 * De stand van de plugin werd hier als los regeltje getoond, in vier smaken --
 * bezig, fout, bijgewerkt, klaar. Drie daarvan zeggen "er is niets aan de
 * hand", en dat hoeft niet gezegd te worden. Wat overblijft staat nu in de
 * waarschuwing op de busstap, waar het er werkelijk toe doet: vlak voordat je
 * op START drukt.
 */

export function App(): JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [career, setCareer] = useState<CareerPayload>();

  const [screen, setScreen] = useState<Screen>("profiles");
  // De tab en melding van de bedrijfsapp; hier, zodat ze een rit naar OMSI overleven.
  const [bedrijfTab, setBedrijfTab] = useState<BedrijfTab>("dashboard");
  const [bedrijfMelding, setBedrijfMelding] = useState<string>();
  const [mode, setMode] = useState<GameMode>("service");

  const [mapFolder, setMapFolder] = useState("");
  const [lengthIndex, setLengthIndex] = useState(4);
  const [timeWindow, setTimeWindow] =
    useState<DutyRequest["window"]>("heledag");
  /** Leeg betekent: elke lijn van deze kaart mag. */
  const [lineFile, setLineFile] = useState("");
  const [lines, setLines] = useState<LineSummary[]>([]);

  const [duties, setDuties] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<number>();
  /** Leeg betekent: de bus gebruiken die de app voorstelt. */
  const [vehicleOverride, setVehicleOverride] = useState("");
  /*
   * Het wagenpark dat de chauffeur zelf aanwijst, en wat er te kiezen valt.
   * Leeg betekent: laat de app kiezen. De keuze gaat mee naar de IBIS, en van
   * daar naar de situatie -- het is dus één keuze en niet twee.
   */
  const [yardOverride, setYardOverride] = useState("");
  const [yards, setYards] = useState<YardOption[]>([]);
  /*
   * Hoe OMSI de vorige keer draaide. Alleen volledig scherm is een bericht
   * waard: dan ligt de overlay over een spel dat het scherm exclusief opeist,
   * en dat kan op een zwart beeld uitlopen.
   */
  const [schermmodus, setSchermmodus] = useState<"volledig" | "venster">();
  /** Start de app OMSI in een venster? Standaard ja; zie settings.ts waarom. */
  const [inVenster, setInVenster] = useState(true);
  /** Geen OMSI gevonden: dan vraagt de app waar het staat. */
  /*
   * Waar OMSI staat, en of de speler dat zelf heeft bevestigd.
   *
   * Zolang het tweede niet zo is, is dit het enige scherm dat de app toont. De
   * app zoekt zelf en heeft het meestal bij het rechte eind, maar er zijn te
   * veel installaties denkbaar om erop te gokken -- Steam op een tweede schijf,
   * de doosversie, twee kopieën naast elkaar. Eén keer bevestigen, en daarna
   * weet de app het in plaats van dat hij het denkt.
   */
  const [omsi, setOmsi] = useState<OmsiState>();
  const [omsiBezig, setOmsiBezig] = useState(false);
  /*
   * Het klaarzetten van de kaarten: de laatste stap van het installeren.
   *
   * `undefined` betekent dat we het nog niet weten; zodra de stand binnen is en
   * er kaarten te gaan zijn, komt het scherm ervoor. Wie overslaat ziet het
   * deze sessie niet meer -- het klaarzetten loopt dan gewoon door op de
   * achtergrond.
   */
  const [kaartenStand, setKaartenStand] = useState<KaartenStand>();
  const [klaarzettenOverslaan, setKlaarzettenOverslaan] = useState(false);
  useEffect(() => {
    let staat = true;
    void window.career.screenMode().then((modus) => {
      if (staat) setSchermmodus(modus);
    });
    void window.career.settings().then((settings) => {
      if (staat) setInVenster(settings.windowedOmsi);
    });
    return () => {
      staat = false;
    };
  }, []);
  const [ibis, setIbis] = useState<IbisPlan>();
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  /*
   * Waar de speler in de opzet staat. Begint bij de kaart: profiel koos hij al
   * bij binnenkomst, en de bus kan pas als de dienst bekend is.
   */
  const [stap, setStap] = useState<Stap>("map");
  /** Staat de invulregel voor een nieuwe chauffeur open, en wat staat erin? */
  const [nieuweChauffeur, setNieuweChauffeur] = useState<string>();
  /** Waar de speler in de buskeuze staat: merk, dan type, dan uitvoering. */
  const [busMerk, setBusMerk] = useState<string>();
  const [busType, setBusType] = useState<string>();
  /** Op de busstap: kies je een bus, het hof-bestand, of zet je hoven over? */
  const [busScherm, setBusScherm] = useState<
    "bus" | "kleur" | "hof" | "overzetten"
  >("bus");
  /*
   * De kleurstelling: wat OMSI in zijn plaatsingsvenster "Appearance" noemt.
   *
   * Luc: "ik mis de appearance feature in de app". Hij hoort bij één bus: kies
   * je daarna een andere uitvoering, dan geldt hij niet meer. Leeg betekent
   * standaard -- dan zet de app niets en kiest OMSI zelf, zoals tot nu toe.
   * `kleurBus` is de uitvoering waarvan het vierde niveau de kleurstellingen
   * toont; `kleurLijsten` houdt per bus de lijst vast (null: hij heeft er geen).
   */
  const [busKleur, setBusKleur] = useState<{ pad: string; naam: string }>();
  const [kleurBus, setKleurBus] = useState<string>();
  const [kleurLijsten, setKleurLijsten] = useState<
    Record<string, BusKleurstellingen | null>
  >({});
  const gevraagdeKleuren = useRef(new Set<string>());
  /*
   * Bussen die de kaart van deze dienst niet kennen.
   *
   * Een wagenpark ligt in de map van de bus en niet bij de kaart, dus een bus
   * zonder dat bestand kent geen enkele bestemmingscode -- en de app laat hem
   * dan ook niet in dit menu zien. Dat is precies waarom dit hier hoort: je ziet
   * een handvol bussen terwijl je er vijftig hebt, en hier staat waarom, met
   * wat eraan te doen is.
   */
  const [hofAanbod, setHofAanbod] = useState<HofOffer[]>([]);
  const [hofBezig, setHofBezig] = useState(false);
  /*
   * Het aanbod voor de bus die nu gekozen is.
   *
   * Dit is waar het om draait: je kiest een bus, je komt op de remisestap, en
   * elk wagenpark zegt "0 van 2 bestemmingen". Dan weet de app precies wat er
   * mis is en welk bestand het oplost, en hoort hij dat te vragen.
   */
  const [busAanbod, setBusAanbod] = useState<HofOffer>();
  /*
   * Wat er voor déze dienst bij deze bus te halen valt.
   *
   * Los van `hofAanbod`, dat over alle bestemmingen van de kaart gaat. Op het
   * remisescherm staat "0 van 2 bestemmingen" -- die twee van je dienst -- en
   * dan hoort de tegel "wagenpark erbij halen" er ook bij te horen. Hij bleef
   * weg omdat de bus kaartbreed genoeg kende.
   */
  const [ritAanbod, setRitAanbod] = useState<HofOffer>();
  /*
   * En het beste wagenpark dat er bij deze bus gelegd kán worden, ook als het
   * niet beter is dan wat hij al heeft. Daar hangt de knop aan die er altijd
   * hoort te staan.
   */
  /*
   * De foto's van de bussen, per pad.
   *
   * De app tekent ze zelf uit het model van de bus -- OMSI levert er geen -- en
   * dat kost de eerste keer een halve tot vijf seconden per bus. Dus: vragen
   * zodra een tegel in beeld komt, bewaren zodra hij binnen is, en tot die tijd
   * het icoon laten staan. Een tweede keer komt hij van schijf.
   */
  const [busFotos, setBusFotos] = useState<Record<string, string>>({});
  const gevraagdeFotos = useRef(new Set<string>());
  /*
   * HET 3D-VENSTER (bus3d-ontwerp §8.1), achter de schakelaar `bus3d`.
   *
   * `bus3dAan` komt uit de instellingen en wordt opnieuw gelezen bij het
   * betreden van de busstap: de schakelaar staat in een ander scherm.
   * `bus3dInBeeld` is de bus die nu in het venster staat (de gevulde 3D-knop),
   * `bus3dAanvraag` het volgnummer van de laatste vraag: een keuze met een
   * ander nummer telt niet. `bus3dWeg`: het venster ging onverwacht dicht
   * (bv.windowFailed, één keer).
   */
  const [bus3dAan, setBus3dAan] = useState(false);
  const [bus3dInBeeld, setBus3dInBeeld] = useState<{
    pad: string;
    kleur?: string;
  }>();
  const [bus3dWeg, setBus3dWeg] = useState(false);
  const bus3dAanvraag = useRef(0);
  /** De stand van de schakelaar bij de vorige keer lezen (undefined: nog niet gelezen). */
  const bus3dLaatst = useRef<boolean | undefined>(undefined);

  /*
   * Het maken van alle foto's in één keer: bij het installeren als vraag, en
   * later via "Busplaatjes bijwerken" voor de bussen die erbij kwamen.
   *
   * `busfotosGevraagd` is `undefined` zolang de instellingen er nog niet zijn;
   * dan komt het scherm er ook niet, anders flitst het even voor wie hem al
   * gehad heeft. `busfotoScherm` staat open als iemand op de knop drukte.
   */
  const [busfotoStand, setBusfotoStand] = useState<BusfotoStand>();
  const [busfotosGevraagd, setBusfotosGevraagd] = useState<boolean>();
  /*
   * De rondleiding: `undefined` zolang de instellingen er nog niet zijn, zodat
   * hij niet even opflitst bij iemand die hem al gezien heeft. `rondleidingOpen`
   * is het vraagteken in het hoofdmenu, voor wie hem nog eens wil zien.
   */
  const [rondleidingGezien, setRondleidingGezien] = useState<boolean>();
  const [rondleidingOpen, setRondleidingOpen] = useState(false);
  /** De QR-code voor een telefoon of tablet; zie ApparaatDialoog. */
  const [apparaatOpen, setApparaatOpen] = useState(false);
  /*
   * BUSSEN KLAARMAKEN
   *
   * De lijst met busmappen, de bus die aangetikt is, wat de app erin vond, wat
   * er aangevinkt staat, en de uitslag van het klaarmaken. Het uitlezen gebeurt
   * in de werker en kan een minuut duren; zie core/busklaar.ts.
   */
  const [bussenKlaar, setBussenKlaar] = useState<Busmapinfo[]>();
  const [busKlaarKeuze, setBusKlaarKeuze] = useState<string>();
  const [busKlaarAnalyse, setBusKlaarAnalyse] = useState<Busanalyseinfo>();
  const [busKlaarAan, setBusKlaarAan] = useState<Set<string>>(new Set());
  const [busKlaarBezig, setBusKlaarBezig] = useState(false);
  const [busKlaarMelding, setBusKlaarMelding] = useState<{ tekst: string; fout?: boolean }>();
  const [busfotoScherm, setBusfotoScherm] = useState<
    "installatie" | "bijwerken"
  >();

  const vraagBusfoto = useCallback(
    (relatiefPad: string, kleurstelling?: string) => {
      // Per kleurstelling een eigen foto; zonder kleurstelling de sleutel van altijd.
      const sleutel = kleurstelling
        ? `${relatiefPad}|${kleurstelling}`
        : relatiefPad;
      if (!relatiefPad || gevraagdeFotos.current.has(sleutel)) return;
      gevraagdeFotos.current.add(sleutel);
      void window.career
        .busFoto(relatiefPad, kleurstelling)
        .then((adres) => {
          if (adres) setBusFotos((oud) => ({ ...oud, [sleutel]: adres }));
        })
        .catch(() => undefined);
    },
    [],
  );

  /** De kleurstellingen van een bus, één keer per bus opgevraagd. */
  const vraagKleurstellingen = useCallback(
    async (relatiefPad: string): Promise<BusKleurstellingen | null> => {
      const bekend = kleurLijsten[relatiefPad];
      if (bekend !== undefined) return bekend;
      gevraagdeKleuren.current.add(relatiefPad);
      const lijst =
        (await window.career
          .busKleurstellingen(relatiefPad)
          .catch(() => undefined)) ?? null;
      setKleurLijsten((oud) => ({ ...oud, [relatiefPad]: lijst }));
      return lijst;
    },
    [kleurLijsten],
  );

  const [ritKandidaat, setRitKandidaat] = useState<{
    file: string;
    matched: number;
    known: number;
    total: number;
    /** Past de veldindeling bij deze bus? Zo niet, dan zegt het scherm dat erbij. */
    past: boolean;
    /** Het wagenpark van deze kaart ligt er al; dan valt er niets te halen. */
    alAanwezig?: boolean;
  }>();
  /*
   * Of de vraag over de aanbevolen bus al gesteld is voor deze dienst.
   *
   * Eenmaal per dienst: wie "zelf kiezen" aanklikt hoort niet bij elke stap
   * terug opnieuw dezelfde vraag te krijgen.
   */
  const [busGevraagd, setBusGevraagd] = useState("");
  /** Weggeklikt voor deze bus; dan niet opnieuw vragen tot je iets anders kiest. */
  const [hofGevraagd, setHofGevraagd] = useState("");
  /** Gaat omhoog zodra er een wagenpark is neergezet; dan opnieuw kijken. */
  const [hofTeller, setHofTeller] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [note, setNote] = useState<string>();
  const [plugin, setPlugin] = useState<PluginStatus>();
  const [starting, setStarting] = useState(false);
  /** Wat OMSI tijdens het rijden doorgeeft; voedt het compacte scherm. */
  const [session, setSession] = useState<SessionResult>();
  /*
   * Wat de bus op dit moment doorgeeft.
   *
   * De overlay krijgt dit al als beeld toegestuurd; het hoofdvenster had alleen
   * de cijfers over de hele dienst. Voor een dienstregeling die meeloopt is meer
   * nodig: welke rit, welke halte, en hoeveel je daar voor of achter ligt.
   */
  const [live, setLive] = useState<LiveStatus>();
  /** Waar de bus op de kaart staat; hiermee wordt het venster een navigatie. */
  const [liveBus, setLiveBus] = useState<VehiclePosition>();
  const [connected, setConnected] = useState(false);
  /** OMSI staat open maar de plugin zegt nog niets: de kaart laadt. */
  const [omsiLaadt, setOmsiLaadt] = useState(false);
  /** Wat de laatste keer kijken opleverde; staat in de balk bovenaan. */
  const [checked, setChecked] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printer, setPrinter] = useState("");
  const finishRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);

  /* De lijst bij binnenkomst op "Bussen klaarmaken", met de foto's erbij. */
  useEffect(() => {
    if (screen !== "bussen") return;
    let geldig = true;
    void window.career.bussen().then((lijst) => {
      if (!geldig) return;
      setBussenKlaar(lijst);
      for (const map of lijst) vraagBusfoto(map.voorbeeld);
    });
    return () => {
      geldig = false;
    };
  }, [screen, vraagBusfoto]);

  /*
   * Een bus uitlezen zodra hij aangetikt is. Wat al gekozen was blijft
   * aangevinkt; bij een nieuwe bus wat de app aanraadt.
   */
  useEffect(() => {
    if (!busKlaarKeuze) return;
    let geldig = true;
    setBusKlaarAnalyse(undefined);
    setBusKlaarMelding(undefined);
    void window.career
      .busAnalyse(busKlaarKeuze)
      .then((analyse) => {
        if (!geldig) return;
        setBusKlaarAnalyse(analyse);
        setBusKlaarAan(
          new Set(
            analyse.gekozen ??
              analyse.apparaten.filter((x) => x.aanbevolen).map((x) => x.id),
          ),
        );
      })
      .catch((fout: unknown) => {
        if (geldig)
          setBusKlaarMelding({
            tekst: t(language, "bus.klaarFout", { reden: String(fout) }),
            fout: true,
          });
      });
    return () => {
      geldig = false;
    };
  }, [busKlaarKeuze, language]);

  /*
   * Dag of nacht. `systeem` volgt Windows en is de beginstand; wie het knopje
   * indrukt legt het vast. De opmaak hangt aan een attribuut op de wortel --
   * theme.css valt zonder dat attribuut terug op prefers-color-scheme -- dus
   * zetten of weghalen is alles wat hier hoeft te gebeuren.
   */
  const [thema, setThema] = useState<Thema>("systeem");

  /*
   * VRIJ RIJDEN: KAART EN BUS
   *
   * Luc: "Vrij rijden modus moet helemaal geen dienst genereren, de speler
   * kiest in omsi een omloop en de overlay detecteert dat". En een gebruiker
   * daarna: "nur und nur noch Karte und Bus ausgesucht werden müssen und das
   * Navi es von alleine findet". Dus geen halte meer: de app zet de bus op een
   * inzetpunt waar straks iets vertrekt (core/beginplek.ts), start OMSI, en het
   * hoofdproces volgt wat de speler daar kiest (`vrijStaat`).
   */
  /** De bus die de app bij deze kaart voorstelt; bij vrij rijden is er geen dienst. */
  const [vrijeTip, setVrijeTip] = useState<Vehicle>();
  /*
   * Datum, tijd en weer. Leeg is automatisch: een schooldag door de week in
   * het tijdvak van de kaart, de klok van de pc, en het weer van de kaart. Wie
   * iets verzet, kiest zelf; "Weer automatisch" zet het terug.
   */
  const [vrijeDatum, setVrijeDatum] = useState("");
  const [vrijeTijd, setVrijeTijd] = useState("");
  const [vrijWeer, setVrijWeer] = useState<WeatherKind | undefined>();
  /** Waar de bus komt te staan, volgens de controle in het hoofdproces; per kaart en moment. */
  const [vrijCheck, setVrijCheck] = useState<{
    sleutel: string;
    check?: FreeCheck;
    bezig: boolean;
  }>();
  /** Er loopt een vrije rit; het rijscherm van vrij rijden staat. */
  const [vrijBezig, setVrijBezig] = useState(false);
  /** Hoe het ervoor staat, met de omloop die gevolgd wordt zodra die er is. */
  const [vrijUit, setVrijUit] = useState<{
    staat: VrijStaat;
    duty?: Duty;
    ibis?: IbisPlan;
    kaart: string;
    mapFolder: string;
  }>();
  /** De vorige staat, om de melding over een gevolgde omloop op te ruimen als die weg is. */
  const vorigeVrijStaat = useRef<VrijStaat["soort"] | undefined>(undefined);
  /**
   * Wat het startvenster zegt: waar de bus staat, of waarom OMSI niet vanzelf
   * startte. `mislukt`: dan wacht het venster op de speler, niet op een spel
   * dat opstart, en zegt de voet dat ook.
   */
  const [startMelding, setStartMelding] = useState<{
    tekst: string;
    mislukt: boolean;
  }>();

  /*
   * Carriere: de vergunningstap toont wat je mag, of het examen dat daarachter
   * zit. Twee gezichten van een stap en geen twee stappen: het gaat allebei
   * over dezelfde vraag -- waar mag ik rijden -- en de tweede is het antwoord
   * op "nog nergens".
   */
  const [examenScherm, setExamenScherm] = useState(false);
  const [examenLijn, setExamenLijn] = useState("");

  /*
   * Lijst of tegels op de kaartstap.
   *
   * Hoort net als de taal bij deze computer en niet bij de chauffeur, en blijft
   * staan: wie de tegels wil, wil ze morgen weer.
   */
  const [kaartweergave, setKaartweergave] = useState<"lijst" | "tegels">(
    "tegels",
  );

  /*
   * De taalkeuze van de allereerste start; `undefined` zolang we het niet
   * weten, want dan hoort er nog niets in beeld te komen.
   */
  const [taalGekozen, setTaalGekozen] = useState<boolean>();

  /*
   * De bus die oversteekt bij Verder. Een teller en geen `true`: twee keer
   * drukken hoort een tweede bus te laten vertrekken, en met een nieuwe sleutel
   * begint de animatie werkelijk opnieuw.
   */
  const [busrit, setBusrit] = useState(0);
  /*
   * Wat er te melden valt als je na een dienst in het hoofdmenu terugkomt: de
   * uitkomst van de rit, of dat hij geannuleerd is. Stond eerst onderaan het vel
   * van de busstap, en daar bleef je dan hangen met een lege remise.
   */
  const [hubMelding, setHubMelding] = useState<string>();
  /*
   * Wat het hoofdproces over OMSI te melden heeft tijdens een dienst: gecrasht,
   * vastgelopen, of overlays erin die je weg wilt. Zie `bewaakOmsi`.
   */
  const [omsiMelding, setOmsiMelding] = useState<OmsiMelding>();
  /** Met welk tabblad de instellingen openen; de melding over overlays wijst naar "Overlays". */
  const [instellingenTab, setInstellingenTab] = useState<"overlays">();
  /*
   * Twee vragen die de app stelt in plaats van te raden.
   *
   * `hervatVraag`: er stond nog een dienst open toen je de app opende. Hij kwam
   * daar vanzelf op uit, en dat is handig als je verder wilt en hinderlijk in
   * elk ander geval.
   *
   * `draaitVraag`: je drukt op START terwijl OMSI al draait. Klaarzetten heeft
   * dan geen zin -- het spel leest zijn startscherm alleen bij het opstarten --
   * dus is de vraag of je meerijdt of liever opnieuw begint.
   */
  const [hervatVraag, setHervatVraag] = useState(false);
  const [draaitVraag, setDraaitVraag] = useState(false);
  /*
   * Draait deze exe alleen om te bekijken (main/versiewacht.ts)? Dan kan een
   * dienst die nog liep niet verder: main opent er geen overlay voor, en het
   * hervatten zegt waarom (tegenlezing 29-09).
   */
  const [bekijkstand, setBekijkstand] = useState(false);
  useEffect(() => {
    void window.career
      .bouw()
      .then((bouw) => setBekijkstand(Boolean(bouw.alleenBekijken)))
      .catch(() => undefined);
  }, []);
  /** Draait OMSI op dit moment? Gepeild op de busstap, vóór je op START drukt. */
  const [omsiDraaitAl, setOmsiDraaitAl] = useState(false);

  // De taalkeuze staat los van de chauffeur; hij hoort bij deze computer.
  useEffect(() => {
    void window.career.settings().then((settings) => {
      setLanguage(settings.language);
      setThema(settings.theme ?? "systeem");
      setKaartweergave(settings.mapView ?? "tegels");
      setTaalGekozen(settings.languageChosen === true);
      setBusfotosGevraagd(settings.busPhotosOffered === true);
      setRondleidingGezien(settings.tourSeen === true);
      zetAnimaties(settings.animaties);
    });
  }, []);

  const kiesKaartweergave = useCallback((next: "lijst" | "tegels") => {
    setKaartweergave(next);
    void window.career.saveSettings({ mapView: next });
  }, []);

  useEffect(() => {
    if (thema === "systeem") delete document.documentElement.dataset.thema;
    else document.documentElement.dataset.thema = thema;
  }, [thema]);

  const kiesThema = useCallback(
    (next: Thema, vanaf?: { x: number; y: number }) => {
      /*
       * De wortel meteen omzetten, en niet pas in het effect hierboven: de
       * overgang maakt haar foto van het nieuwe scherm zodra `zet` terugkeert.
       */
      wisselThema(() => {
        if (next === "systeem") delete document.documentElement.dataset.thema;
        else document.documentElement.dataset.thema = next;
        setThema(next);
      }, vanaf);
      void window.career.saveSettings({ theme: next });
    },
    [],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const chooseLanguage = useCallback((next: Language) => {
    setLanguage(next);
    void window.career.saveSettings({ language: next });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        /*
         * Eerst de vraag waar OMSI staat, en pas daarna de rest. Alles wat
         * hierna komt -- kaarten, bussen, het profiel -- hangt aan die map, dus
         * er valt niets te laden zolang die niet vaststaat.
         */
        const staat = await window.career.omsiState();
        setOmsi(staat);
        /*
         * De chauffeurs staan in de gebruikersmap en niet in OMSI, dus die
         * kunnen we altijd lezen. Dat moet ook: de eerste start vraagt eerst om
         * een taal, dan om een chauffeur, en pas daarna waar OMSI staat -- en
         * om te weten of er al een chauffeur is, moet dit binnen zijn.
         */
        const eersteChauffeurs = await window.career.career();
        setCareer(eersteChauffeurs);
        if (!staat.confirmed) return;
        const [loadedMaps, loadedVehicles, loadedCareer] = await Promise.all([
          window.career.maps(),
          window.career.vehicles(),
          window.career.career(),
        ]);
        setMaps(loadedMaps);
        setVehicles(loadedVehicles);
        setCareer(loadedCareer);
        setMapFolder(loadedMaps[0]?.folder ?? "");
        setReady(true);
        // Losstaand: de overlay-plugin klaarzetten mag de rest niet ophouden.
        void window.career.pluginStatus().then(setPlugin);
        void window.career.printers().then((found) => {
          setPrinters(found);
          setPrinter(found[0]?.name ?? "");
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, []);

  /*
   * Draait OMSI al? Alleen peilen waar het antwoord ertoe doet.
   *
   * Dit kost een `tasklist` van een tiende seconde, en dat is te veel om er de
   * hele app mee te doorspekken. Op de busstap staat er een START-knop, en daar
   * hangt het antwoord aan vast: draait het spel al, dan heeft klaarzetten geen
   * zin en hoort dat te blijken vóórdat je drukt en niet erna.
   */
  useEffect(() => {
    /* `stap` is de stap van het opzetvel; de busstap is de laatste voor START. */
    if (stap !== "bus" || started) return undefined;
    let geldig = true;
    const peil = (): void => {
      void window.career.omsiRunning().then((draait) => {
        if (geldig) setOmsiDraaitAl(draait);
      });
    };
    peil();
    const klok = setInterval(peil, 5000);
    return () => {
      geldig = false;
      clearInterval(klok);
    };
  }, [stap, started]);

  const selectedMap = useMemo(
    () => maps.find((m) => m.folder === mapFolder),
    [maps, mapFolder],
  );

  const assignment = selected !== undefined ? duties[selected] : undefined;
  const duty = assignment?.duty;

  /*
   * Welke bussen deze kaart niet kennen. Alleen kijken -- er wordt pas iets in
   * de spelmap gezet als de chauffeur erom vraagt. Het loopt zodra de dienst
   * bekend is en niet pas op de busstap, want dan staat het er al als je er
   * komt in plaats van dat het scherm nog even moet nadenken.
   */
  useEffect(() => {
    if (!mapFolder) {
      setHofAanbod([]);
      return;
    }
    let geldig = true;
    void window.career
      .hofOffers(mapFolder)
      .then((aanbod) => {
        if (geldig) setHofAanbod(aanbod);
      })
      .catch(() => {
        if (geldig) setHofAanbod([]);
      });
    return () => {
      geldig = false;
    };
  }, [mapFolder, hofTeller]);

  /*
   * De aangenomen dienst staat in het profiel. Na het laden, na een herstart of
   * na het wisselen van profiel wordt hij hier teruggezet, en zolang hij er is
   * valt er niets anders te kiezen.
   */
  const active = career?.state?.activeDuty;
  const confirmed = Boolean(active);
  const exam = active?.exam;
  const activeKey = active ? `${career?.state?.id}|${active.confirmedAt}` : "";
  /*
   * De telefoon kan een andere dienst aannemen terwijl er gereden wordt (zie
   * `wisselDienst` in main). Dat is een nieuwe dienst met een nieuw moment van
   * aannemen, en daarop springt het effect hieronder -- maar het is geen
   * dienst die "openstond": wie rijdt, hoort op het rijscherm te blijven en
   * niet in het hoofdmenu de vraag te krijgen of hij verder wil.
   */
  const gewisseldRef = useRef(false);
  useEffect(
    () =>
      window.career.onDienstGewisseld((payload) => {
        gewisseldRef.current = true;
        setCareer(payload);
      }),
    [],
  );
  useEffect(() => {
    /*
     * Geen lopende dienst -- een verse chauffeur, of net geannuleerd -- dan
     * hoort er ook niets meer op het scherm te staan. Zonder dit bleef de dienst
     * van de vorige chauffeur gewoon staan, met knoppen en al.
     */
    if (!active) {
      setDuties([]);
      setSelected(undefined);
      setStarted(false);
      setVehicleOverride("");
      /*
       * De vraag hoort bij de dienst waarvoor hij gesteld werd. Bleef hij staan,
       * dan vroeg het hoofdmenu na de volgende aangenomen dienst "lijn X loopt
       * nog" over een dienst die nog niet eens begonnen was.
       */
      setHervatVraag(false);
      return;
    }
    const held = active.assignment as Assignment;
    setMapFolder(held.duty.mapFolder);
    setDuties([held]);
    setSelected(0);
    setVehicleOverride(active.vehicleOverride);
    setStarted(Boolean(active.startedAt));
    if (active.mode) setMode(active.mode);
    /*
     * Een dienst die loopt brengt je naar het rijscherm -- eenmaal, hier.
     *
     * Dit stond niet in het scherm maar in de voorwaarde eromheen: "loopt er een
     * dienst, dan is dit het scherm", en die voorwaarde stond boven de
     * instellingen, de chauffeurs en de staat van dienst. Elke knop in het
     * hoofdmenu kwam daardoor uit bij de lopende dienst. Nu zegt het rijscherm
     * alleen nog iets over `screen === 'drive'`, en brengt deze regel je daar
     * naartoe op het moment dat de dienst verschijnt: bij het aannemen, bij het
     * starten van de app, en bij het wisselen naar een chauffeur die rijdt.
     */
    /*
     * Een dienst die al liep toen hij verscheen -- bij het openen van de app of
     * bij het wisselen naar een chauffeur die rijdt -- brengt je niet meer
     * ongevraagd naar het rijscherm. Je komt in het hoofdmenu en de app vraagt
     * of je verder wilt. Wie in deze sessie zelf op START drukt gaat er wel
     * meteen heen; dat staat in `begin`, want daar valt niets te vragen.
     */
    if (gewisseldRef.current) {
      gewisseldRef.current = false;
      setHervatVraag(false);
      setNote(t(language, "start.riding"));
    } else if (active.startedAt) {
      setScreen("modes");
      setHervatVraag(true);
    } else {
      setHervatVraag(false);
    }
  }, [activeKey]);

  /*
   * In dienst en carriere wordt de lijn niet gekozen maar gelopen.
   *
   * Een dienst is een omloop, en een omloop gaat over lijnen heen: op een
   * knooppunt stap je over. De generator doet dat al -- een lijn die je nog niet
   * reed weegt zes keer zo zwaar als dezelfde doorrijden -- maar zolang de app
   * een lijnbestand meegaf bleef de wandeling op die ene lijn. Vandaar: geen
   * lijnstap, en meteen zoeken zodra de kaart bekend is.
   *
   * Alleen bij vrij rijden blijft de keuze staan; daar stel je je dienst zelf
   * samen uit de lijnen die je aanvinkt.
   */

  /*
   * Van modus wisselen zet je terug op de kaart.
   *
   * De stappen verschillen per modus, en wie in de carriere op de
   * vergunningstap stond en naar vrij rijden gaat, staat dan op een stap die
   * daar niet bestaat: de balk wijst nergens naar en de knop doet iets anders
   * dan er staat. De kaart is de eerste stap die alle drie gemeen hebben.
   */
  const vorigeModus = useRef<GameMode | undefined>(undefined);
  useEffect(() => {
    /*
     * Alleen bij een echte wisseling, en niet bij het eerste beeld: de modus
     * wordt ook gezet als er een dienst wordt teruggehaald uit het profiel, en
     * die dienst hier weggooien zou precies het tegenovergestelde zijn van
     * terughalen.
     */
    const vorige = vorigeModus.current;
    vorigeModus.current = mode;
    if (vorige === undefined || vorige === mode) return;
    setStap("map");
    setExamenScherm(false);
    /*
     * Een aangenomen dienst blijft staan. De controle hierboven ving alleen het
     * eerste beeld, maar het effect dat de dienst uit het profiel terugleest zet
     * de modus pas als het profiel binnen is -- van "service" naar "career" bij
     * een dienst in de carriere of een examen. Dan gooide deze regel de dienst
     * weg die daar net was teruggezet: geen vraag of je verder wilde, "verder
     * rijden" kwam op de kaartstap uit, en afronden of annuleren kon niet meer,
     * want `duties` wordt voor een aangenomen dienst nergens anders gevuld.
     */
    if (confirmed) return;
    setDuties([]);
    setSelected(undefined);
  }, [mode]);
  useEffect(() => {
    // Vrij rijden zoekt geen dienst: de dienststap is daar het beginpunt.
    if (mode === "free" || stap !== "duty" || busy || confirmed) return;
    if (duties.length > 0 || !mapFolder) return;
    void generateRef.current?.();
  }, [mode, stap, busy, confirmed, duties.length, mapFolder]);

  /*
   * Wat de kaartstap van vrij rijden nodig heeft: de bus die de app bij deze
   * kaart voorstelt, en een andere kaart begint weer automatisch.
   */
  useEffect(() => {
    setVrijeDatum("");
    setVrijeTijd("");
    if (mode !== "free" || !mapFolder) {
      setVrijeTip(undefined);
      return;
    }
    let geldig = true;
    void window.career
      .suggestVehicle(mapFolder)
      .then((bus) => {
        if (geldig) setVrijeTip(bus);
      })
      .catch(() => {
        // Geen voorstel is geen fout; dan kies je zelf uit alles.
      });
    return () => {
      geldig = false;
    };
  }, [mode, mapFolder]);

  /*
   * Waar de bus komt te staan. Het hoofdproces rekent het uit in de werker --
   * de dienstregeling en de tekening van de kaart -- bij elke andere kaart,
   * datum of tijd. De voet zegt het, de kaart toont de bus, en START gebruikt
   * precies dit inzetpunt.
   */
  const vrijWanneer = useMemo((): VrijWanneer | undefined => {
    const [uren, minuten] = vrijeTijd.split(":").map(Number);
    const tijd =
      vrijeTijd && Number.isFinite(uren) && Number.isFinite(minuten)
        ? uren * 60 + minuten
        : undefined;
    if (!vrijeDatum && tijd === undefined) return undefined;
    return { datum: vrijeDatum || undefined, tijd };
  }, [vrijeDatum, vrijeTijd]);
  const vrijSleutel = `${mapFolder}|${vrijeDatum}|${vrijeTijd}`;
  useEffect(() => {
    if (mode !== "free" || !mapFolder) {
      setVrijCheck(undefined);
      return;
    }
    let geldig = true;
    setVrijCheck({ sleutel: vrijSleutel, bezig: true });
    void window.career
      .checkFree(mapFolder, vrijWanneer)
      .then((check) => {
        if (geldig) setVrijCheck({ sleutel: vrijSleutel, check, bezig: false });
      })
      .catch(() => {
        if (geldig) setVrijCheck({ sleutel: vrijSleutel, bezig: false });
      });
    return () => {
      geldig = false;
    };
  }, [mode, mapFolder, vrijSleutel]);
  /* Alleen de controle die bij deze kaart en dit moment hoort; een oude telt niet. */
  const vrijePlek =
    vrijCheck && vrijCheck.sleutel === vrijSleutel ? vrijCheck.check : undefined;

  /* Een stap die bij vrij rijden niet meer bestaat: dan de bus. */
  useEffect(() => {
    if (mode === "free" && stap === "duty") setStap("bus");
  }, [mode, stap]);

  /*
   * Opnieuw diensten zoeken zodra je de lengte of het dagdeel verzet.
   *
   * Zonder dit deed de schuif niets: de lijst werd alleen opgebouwd bij het
   * binnenkomen op de lijnstap, en daarna bleef hij staan met de diensten van
   * de vorige vraag. Met een korte pauze erachter, want een schuif geeft tijdens
   * het slepen tien keer per seconde een nieuwe waarde en elke zoektocht loopt
   * door het hele rittennet.
   */
  const vraagRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const sleutel = `${lengthIndex}|${timeWindow}`;
    // De eerste keer is geen wijziging maar de beginstand.
    if (vraagRef.current === undefined) {
      vraagRef.current = sleutel;
      return;
    }
    if (vraagRef.current === sleutel) return;
    vraagRef.current = sleutel;
    /*
     * Zonder gekozen lijn ook zoeken.
     *
     * Hier stond `if (!lineFile) return`, en dat klopte zolang je altijd eerst
     * een lijn koos. Sinds de lijn in dienst en carriere gelopen wordt in plaats
     * van gekozen is `lineFile` daar leeg -- en dus deed de schuif niets meer.
     * Een lege lijn is geen ontbrekende lijn maar "elke lijn".
     */
    if (confirmed || !mapFolder || mode === "free") return;
    const wacht = setTimeout(
      () => void generateRef.current?.(lineFile || undefined),
      400,
    );
    return () => clearTimeout(wacht);
  }, [lengthIndex, timeWindow, lineFile, confirmed, mapFolder, mode]);

  /*
   * Eens per seconde, en alleen tijdens het rijden. De plugin schrijft tien keer
   * per seconde; vaker kijken dan dit levert niets op wat een mens ziet, en het
   * hoofdvenster hoeft er de kaart niet voor te laten haperen.
   */
  useEffect(() => {
    if (!started || !duty) {
      setLive(undefined);
      setLiveBus(undefined);
      return;
    }
    let geldig = true;
    /*
     * Wat we de vorige keer zagen. Zonder deze vergelijking zette elke tel een
     * nieuw object in de toestand, en dan tekent React het hele scherm opnieuw
     * -- inclusief de kaart -- ook als er niets veranderd is. Naast een draaiend
     * spel is dat werk dat je in beelden per seconde terugziet.
     */
    let vorige = "";
    const haal = (): void => {
      /*
       * Niet tekenen wat niemand ziet. Staat het venster geminimaliseerd of
       * achter het spel zonder zichtbaar te zijn, dan hoeft de kaart niet mee
       * te lopen; bij het terugkomen is hij binnen een tel weer bij.
       */
      if (document.visibilityState === "hidden") return;
      void window.career
        .liveStatus()
        .then((stand) => {
          if (!geldig) return;
          const sleutel = JSON.stringify(stand);
          if (sleutel === vorige) return;
          vorige = sleutel;
          setLive(stand.status);
          setLiveBus(stand.vehicle);
        })
        .catch(() => {
          if (!geldig) return;
          vorige = "";
          setLive(undefined);
          setLiveBus(undefined);
        });
    };
    haal();
    const klok = setInterval(haal, 1000);
    const wakker = (): void => haal();
    document.addEventListener("visibilitychange", wakker);
    return () => {
      geldig = false;
      clearInterval(klok);
      document.removeEventListener("visibilitychange", wakker);
    };
  }, [started, duty]);

  /*
   * Vrij rijden: welke rit van de gevolgde omloop OMSI nu rijdt. De kaart van
   * het rijscherm tekent elk traject één keer (trajecten.ts), en dan hoort het
   * traject van deze rit naar voren te komen; de rest blijft flauw staan, net
   * als in het routevenster. Eens per seconde, zoals de lopende dienst
   * hierboven; dezelfde rit geeft geen nieuwe tekening.
   */
  const [vrijRit, setVrijRit] = useState<number>();
  const vrijGevolgd =
    vrijBezig && mode === "free" && screen === "drive" ? vrijUit?.duty : undefined;
  useEffect(() => {
    if (!vrijGevolgd) {
      setVrijRit(undefined);
      return;
    }
    let geldig = true;
    const haal = (): void => {
      if (document.visibilityState === "hidden") return;
      void window.career
        .liveStatus()
        .then((stand) => {
          // -1: nog geen rit; en een rit buiten deze omloop hoort bij een andere kopie.
          const rit = stand.status?.legIndex ?? -1;
          if (geldig) setVrijRit(rit >= 0 && rit < vrijGevolgd.legs.length ? rit : undefined);
        })
        .catch(() => undefined);
    };
    haal();
    const klok = setInterval(haal, 1000);
    return () => {
      geldig = false;
      clearInterval(klok);
    };
  }, [vrijGevolgd]);

  /** De lijnen van de gekozen kaart; die zijn er voor de route- en examenkeuze. */
  useEffect(() => {
    if (!mapFolder) {
      setLines([]);
      return;
    }
    let current = true;
    void window.career
      .lines(mapFolder)
      .then((found) => {
        if (current) setLines(found);
      })
      .catch(() => {
        if (current) setLines([]);
      });
    return () => {
      current = false;
    };
  }, [mapFolder]);

  // Een lijn van de vorige kaart bestaat hier niet; die keuze vervalt.
  useEffect(() => {
    setLineFile("");
  }, [mapFolder]);

  const vehicle = useMemo(() => {
    if (vehicleOverride)
      return vehicles.find((v) => v.relativePath === vehicleOverride);
    /*
     * Bij vrij rijden is er geen dienst met een bus erbij; dan is de bus die de
     * app bij de kaart voorstelt de gekozen bus, tot je een andere aanklikt.
     * Zonder dit bleef de remisestap leeg zolang je de voorgestelde nam.
     */
    return assignment?.vehicle ?? (mode === "free" ? vrijeTip : undefined);
  }, [vehicleOverride, vehicles, assignment, mode, vrijeTip]);

  /*
   * Op de busstap, en alleen daar, telt een keuze uit het 3D-venster (§8.1).
   * START maakt er een eind aan: in dienst en carriere zet hij `started`, bij
   * vrij rijden `vrijBezig` (de stap blijft dan "bus", het rijscherm staat).
   */
  const opBusstap =
    screen === "drive" && stap === "bus" && !started && !vrijBezig;
  const opBusstapRef = useRef(opBusstap);
  opBusstapRef.current = opBusstap;

  /*
   * De 3D-knop of een dubbelklik op een tegel: het 3D-venster met deze bus.
   * Vanaf een kleurtegel met die kleurstelling in beeld; vanaf een
   * uitvoeringstegel met de kleurstelling die nu voor die bus gekozen is.
   */
  const open3d = useCallback(
    (bus: Vehicle, kleurstelling: string | undefined, vanKleurtegel: boolean) => {
      const pad = bus.relativePath;
      const delen = ontleedBus(bus);
      const dezeBus = (vehicleOverride || vehicle?.relativePath) === pad;
      const gekozenKleur = busKleur?.pad === pad ? busKleur.naam : undefined;
      void window.career
        .bus3dOpen({
          doel: "buskeuze",
          relatiefPad: pad,
          kleurstelling: vanKleurtegel ? kleurstelling : gekozenKleur,
          // Het vinkje: wat nu voor deze bus gekozen is (null = Standaard); een andere bus heeft er geen.
          gekozen: dezeBus ? (gekozenKleur ?? null) : undefined,
          titel: `${delen.merk} ${delen.type} ${delen.uitvoering}`.trim(),
          naam: [delen.merk, delen.type, delen.uitvoering],
          vorm: busvorm(delen.type + " " + delen.uitvoering),
        })
        .then((n) => {
          if (n) bus3dAanvraag.current = n;
        })
        .catch(() => undefined);
    },
    [vehicleOverride, vehicle, busKleur],
  );

  /*
   * [Kiezen] in het 3D-venster, door main getoetst: precies wat een klik op
   * de tegel van die kleurstelling doet (of op de uitvoeringstegel als de bus
   * geen kleurstellingen heeft). Niet meer op de busstap, of een ander
   * volgnummer: dan telt hij niet.
   */
  const bus3dKeuze = useRef<(k: Bus3dKeuze) => void>(() => undefined);
  bus3dKeuze.current = (k) => {
    if (k.doel !== "buskeuze" || !opBusstapRef.current) return;
    if (k.aanvraag !== bus3dAanvraag.current) return;
    const bus = vehicles.find((v) => v.relativePath === k.relatiefPad);
    if (!bus) return;
    const pad = bus.relativePath;
    const delen = ontleedBus(bus);
    setBusMerk(delen.merk);
    setBusType(delen.type);
    setVehicleOverride(pad);
    const lijst = kleurLijsten[pad];
    if (k.kleurstelling || (lijst && lijst.lijst.length > 0)) {
      setKleurBus(pad);
      setBusKleur(k.kleurstelling ? { pad, naam: k.kleurstelling } : undefined);
    } else {
      setKleurBus(undefined);
      setBusKleur(undefined);
    }
    setBusScherm("hof");
  };
  useEffect(() => {
    const weg1 = window.career.opBus3dKeuze((k) => bus3dKeuze.current(k));
    const weg2 = window.career.opBus3dVenster((m) => {
      setBus3dInBeeld(
        m.open && m.relatiefPad
          ? { pad: m.relatiefPad, kleur: m.kleurstelling }
          : undefined,
      );
      // De melding staat tot er weer een venster opengaat (of de busstap verlaten wordt).
      if (m.gecrasht) setBus3dWeg(true);
      else if (m.open) setBus3dWeg(false);
    });
    return () => {
      weg1();
      weg2();
    };
  }, []);

  // De busstap verlaten (START, een andere stap, een ander scherm): het 3D-venster dicht.
  useEffect(() => {
    if (!opBusstap) {
      if (bus3dAanvraag.current) window.career.bus3dSluit(bus3dAanvraag.current);
      setBus3dWeg(false);
      return;
    }
    // De schakelaar kan in de instellingen omgezet zijn; hier weer lezen.
    void window.career
      .settings()
      .then((instellingen) => {
        const aan = instellingen.bus3d === true;
        /*
         * Omgezet sinds de vorige keer: de foto's van de tegels opnieuw vragen
         * (met de schakelaar de v4, zonder de v3b). Anders hielden de tegels
         * na "uit" de foto v4 tot de app opnieuw startte (tegenlezing F2).
         */
        if (bus3dLaatst.current !== undefined && bus3dLaatst.current !== aan) {
          gevraagdeFotos.current.clear();
          setBusFotos({});
        }
        bus3dLaatst.current = aan;
        setBus3dAan(aan);
      })
      .catch(() => undefined);
  }, [opBusstap]);

  /** Voertuigen gegroepeerd per map, anders is de lijst van 351 onleesbaar. */
  const vehicleGroups = useMemo(() => {
    const groups = new Map<string, Vehicle[]>();
    for (const item of vehicles) {
      const list = groups.get(item.folder) ?? [];
      list.push(item);
      groups.set(item.folder, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [vehicles]);

  /** Bestemmingscodes hangen aan de bus en aan het tijdvak van de kaart. */
  useEffect(() => {
    if (!duty || !vehicle || !selectedMap) {
      setIbis(undefined);
      return;
    }
    let current = true;
    void window.career
      .ibis(duty, vehicle, selectedMap.year, yardOverride || undefined)
      .then((plan) => {
        if (current) setIbis(plan);
      });
    return () => {
      current = false;
    };
  }, [duty, vehicle, selectedMap, yardOverride]);

  /* En of er voor de bestemmingen van deze dienst een beter wagenpark bestaat. */
  useEffect(() => {
    if (!duty || !vehicle) {
      setRitAanbod(undefined);
      setRitKandidaat(undefined);
      return;
    }
    void window.career
      .hofCandidate(duty, vehicle.folder)
      .then((kandidaat) => setRitKandidaat(kandidaat))
      .catch(() => setRitKandidaat(undefined));
    let geldig = true;
    void window.career
      .hofOfferForDuty(duty, vehicle.folder)
      .then((aanbod) => {
        if (geldig) setRitAanbod(aanbod);
      })
      .catch(() => {
        if (geldig) setRitAanbod(undefined);
      });
    return () => {
      geldig = false;
    };
  }, [duty, vehicle, hofTeller]);

  /*
   * Welke wagenparken er naast deze bus liggen. Wisselt de bus, dan vervalt de
   * keuze: een wagenpark van het ene busmodel zegt niets over het andere.
   */
  useEffect(() => {
    /*
     * Bij vrij rijden is er vooraf geen dienst om de wagenparken aan te meten;
     * dan meet de kaartwerker ze aan alle eindbestemmingen van de kaart.
     */
    if (mode === "free" && vehicle && selectedMap && mapFolder) {
      let current = true;
      void window.career
        .vrijeYards(mapFolder, vehicle.relativePath, selectedMap.year)
        .then((options) => {
          if (current) setYards(options);
        })
        .catch(() => {
          if (current) setYards([]);
        });
      return () => {
        current = false;
      };
    }
    if (!duty || !vehicle || !selectedMap) {
      setYards([]);
      return;
    }
    let current = true;
    void window.career
      .yards(duty, vehicle, selectedMap.year)
      .then((options) => {
        if (current) setYards(options);
      });
    return () => {
      current = false;
    };
  }, [duty, vehicle, selectedMap, hofTeller, mode, mapFolder]);

  /*
   * Kent deze bus de kaart helemaal niet, dan vragen we of we het wagenpark
   * erbij mogen zetten. De maat is streng met opzet: kent hij er een van de
   * vier, dan is dat toeval -- een haltenaam die ook in een andere stad
   * voorkomt -- en niet een bus waarmee je deze dienst kunt rijden.
   *
   * Hier stond `yards.length === 0` bij de redenen om niets te vragen, en dat
   * is precies de verkeerde kant op. Een lege lijst wagenparken betekent niet
   * "deze bus is in orde" maar "deze bus heeft er geen enkele" -- het geval
   * waarin de vraag het hardst nodig is. Wie zelf een bus uit het menu koos die
   * de kaart niet kent, kreeg zo niets te horen en reed met lege
   * bestemmingsfilms weg.
   */
  useEffect(() => {
    const sleutel = vehicle ? `${mapFolder}|${vehicle.folder}` : "";
    if (!mapFolder || !vehicle || sleutel === hofGevraagd) {
      setBusAanbod(undefined);
      return;
    }
    /*
     * Alleen overslaan als de bus het werkelijk zelf afkan. Zonder wagenparken
     * kan hij dat nooit, dus dan gaan we door naar de vraag.
     */
    if (yards.length > 0) {
      const beste = Math.max(0, ...yards.map((yard) => yard.known));
      const nodig = Math.max(1, Math.ceil((yards[0]?.total ?? 0) / 2));
      if (beste >= nodig) {
        setBusAanbod(undefined);
        return;
      }
    }
    /*
     * En dan de vraag zelf -- eerst voor de bestemmingen van deze dienst.
     *
     * Hier stond alleen de kaartbrede vraag, en die zweeg juist in het geval
     * waarin het scherm om hulp vroeg: een bus die drie van de
     * honderdnegenenvijftig bestemmingen van de kaart kent, heeft kaartbreed
     * een aanbod, maar een bus die er veertig kent en geen van de twee van
     * jouw dienst, heeft dat niet. Luc: "ik krijg geen popup".
     */
    let geldig = true;
    const vraag = duty
      ? window.career
          .hofOfferForDuty(duty, vehicle.folder)
          .then(
            (aanbod) =>
              aanbod ?? window.career.hofOfferFor(mapFolder, vehicle.folder),
          )
      : window.career.hofOfferFor(mapFolder, vehicle.folder);
    void vraag
      .then((aanbod) => {
        if (geldig) setBusAanbod(aanbod);
      })
      .catch(() => {
        if (geldig) setBusAanbod(undefined);
      });
    return () => {
      geldig = false;
    };
  }, [mapFolder, vehicle, yards, hofGevraagd, hofTeller, duty]);

  useEffect(() => {
    setYardOverride("");
  }, [vehicleOverride, assignment]);

  /**
   * Genereert een dienst en legt hem voor.
   *
   * De remise wijst er één toe in plaats van een rooster van acht waaruit je
   * maar wat kiest. Bevalt hij niet, dan genereer je een andere; er komt elke
   * keer een andere uit, want de dienst wordt uit de dienstregeling gelopen.
   */
  /*
   * `generate` staat verderop en gebruikt van alles dat hierboven nog niet
   * bestaat; een verwijzing is hier goedkoper dan de volgorde omgooien.
   */
  const generateRef = useRef<
    ((onlyLine?: string) => Promise<void>) | undefined
  >(undefined);

  const generate = useCallback(
    async (onlyLine?: string) => {
      if (confirmed) return;
      setBusy(true);
      setError(undefined);
      setNote(undefined);
      setSelected(undefined);
      setStarted(false);
      setVehicleOverride("");
      try {
        const found = await window.career.listDuties({
          mapFolder,
          targetMinutes: LENGTHS[lengthIndex],
          window: timeWindow,
          // Een lege keuze is "elke lijn"; die mag niet als filter meegaan,
          // want dan zoekt de planner naar een lijn die zo heet.
          lineFile: (onlyLine ?? lineFile) || undefined,
          /*
           * In de carriere rijdt de chauffeur alleen waar hij een vergunning
           * voor heeft -- maar dat zijn er meestal meer dan een, en dan hoort
           * de dienst daar gewoon overheen te lopen.
           */
          lineFiles:
            mode === "career"
              ? (career?.state?.licences ?? [])
                  .filter((vergunning) => vergunning.mapFolder === mapFolder)
                  .map((vergunning) => vergunning.lineFile)
              : undefined,
        });
        if (found.length === 0) {
          setDuties([]);
          setError(
            t(language, "app.noDuty", {
              length: formatDuration(LENGTHS[lengthIndex], language),
            }),
          );
          return;
        }
        /*
         * Er komen er meerdere terug, en sinds het opzetscherm de dienstenlijst
         * toont leggen we ze allemaal voor in plaats van er één uit te loten.
         * Op vertrektijd, want zo leest een dienstregeling: van vroeg naar laat.
         */
        const opTijd = [...found].sort((a, b) => a.duty.start - b.duty.start);
        setDuties(opTijd);
        setSelected(0);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [mapFolder, lengthIndex, timeWindow, lineFile, language, confirmed, mode],
  );

  // De verwijzing bijwerken, zodat het effect hierboven de laatste versie pakt.
  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);

  const confirmDuty = useCallback(
    async (asExam?: {
      lineFile: string;
      lineNumbers: string[];
      basic: boolean;
    }) => {
      if (!assignment || confirmed) return;
      setCareer(
        await window.career.confirmDuty(
          assignment,
          vehicleOverride,
          mode,
          asExam,
        ),
      );
    },
    [assignment, confirmed, vehicleOverride, mode],
  );

  /*
   * Na een dienst -- afgerond of geannuleerd -- terug naar het begin.
   *
   * Luc: "wanneer de dienst is afgerond of is geannuleerd moet het bus selectie
   * menu weer naar het begin gaan, ook wil ik dat de gebruiker weer naar het
   * hoofdmenu wordt gestuurd". Eerst bleef de busstap op het laatste niveau
   * staan, de remise, en die was leeg omdat de dienst er niet meer was.
   */
  const naarBegin = useCallback((melding?: string) => {
    setBusScherm("bus");
    setBusMerk(undefined);
    setBusType(undefined);
    setKleurBus(undefined);
    setBusKleur(undefined);
    setStap("map");
    setNote(undefined);
    setHubMelding(melding);
    setScreen("modes");
  }, []);

  const cancelDuty = useCallback(async () => {
    if (!confirmed || !window.confirm(t(language, "act.cancelAsk"))) return;
    setCareer(await window.career.cancelDuty());
    setDuties([]);
    setSelected(undefined);
    setStarted(false);
    setStarting(false);
    naarBegin(t(language, "done.cancelled"));
  }, [confirmed, language, naarBegin]);

  /*
   * De dienst die openstond verwijderen, vanuit de vraag bij het openen. Net als
   * cancelDuty, maar zonder de tweede vraag: het venster was de vraag al.
   */
  const verwijderOpenDienst = useCallback(
    async (lijn: string) => {
      setCareer(await window.career.cancelDuty());
      setDuties([]);
      setSelected(undefined);
      setStarted(false);
      setStarting(false);
      naarBegin(t(language, "hervat.deleted", { line: lijn }));
    },
    [language, naarBegin],
  );

  /**
   * Dienst starten. Dit zet de situatie klaar in OMSI -- datum, tijd, bus bij de
   * halte en de dienstregeling -- en start daarna pas het spel. Er is geen aparte
   * knop meer voor het klaarzetten; dat hoort bij starten.
   *
   * Geeft terug of de dienst gestart is, zodat de herstartknop na een crash
   * weet of hij terug moet komen.
   */
  const begin = useCallback(
    async (alBevestigd = false, herstart = false, meerijden = false) => {
      /*
       * `confirmed` komt uit de loopbaanstatus en die is er pas een tik later. Wie
       * in één druk bevestigt en start, weet zelf dat het net gebeurd is; daarom
       * mag hij dat hier zeggen in plaats van te wachten tot de status volgt.
       */
      if (!duty || (!confirmed && !alBevestigd)) return false;
      setBusy(true);
      setNote(t(language, "start.preparing"));
      try {
        /*
         * Weigert `duty:begin` -- main logt de fout en gooit hem door -- dan is
         * er niets gestart. Zonder deze vangst bleef de voet van het rijscherm
         * op "Situatie wordt geschreven…" staan, ging de fout nergens heen, en
         * was de herstartknop na een crash weg: die haalt de melding weg voordat
         * hij `begin` aanroept. Alleen om deze aanroep, want wat erna komt hoort
         * bij een `duty:begin` die wel terugkwam.
         */
        let result: BeginResult;
        try {
          result = await window.career.beginDuty({
            duty,
            ibis,
            vehiclePath: vehicle?.relativePath,
            kleurstelling:
              busKleur && busKleur.pad === vehicle?.relativePath
                ? busKleur.naam
                : undefined,
            herstart,
            meerijden,
            date: assignment?.date,
            lineNumber: ibis?.line || duty.legs[0]?.lineNumber || "",
            terminus: duty.legs[0]?.terminus ?? "",
            yard: ibis?.yard,
          });
        } catch (cause) {
          setNote(
            t(language, "start.failed", {
              reason: cause instanceof Error ? cause.message : String(cause),
            }),
          );
          return false;
        }
        /*
         * Alleen bekijken (een oudere exe dan de laatste schrijver): main
         * begint dan niets, en zegt dat. Geen "OMSI niet gestart", want er is
         * niets misgegaan.
         */
        if (result.fout === "bekijken") {
          setNote(t(language, "vw.start"));
          return false;
        }
        /*
         * Ook een `duty:begin` die gewoon terugkomt kan betekenen dat er niets
         * draait. Main vangt het starten van het spel af: zegt de speler nee
         * tegen het UAC-venster, lukt PowerShell niet, of staat er geen
         * Omsi.exe, dan komt er `launched: false` terug, en met
         * `running: false` draaide het spel ook niet al. Dit ging als geslaagd
         * door: de melding en de herstartknop bleven weg, de voet zei dat OMSI
         * op de kaart opende, en het opstartvenster wachtte op een spel dat
         * niet kwam.
         *
         * Alleen `launched` en `running`, niet `connected`: na een crash blijft
         * live.json op alive=true staan (de plugin schrijft alive=false alleen
         * bij netjes afsluiten), en tot vijftien tellen oud telt hij als vers.
         * Wie binnen die tijd op "opnieuw starten" drukt, kreeg anders
         * `connected` terug van een spel dat al weg was.
         *
         * Een eigen zin: het klaarzetten is hier juist gelukt, alleen het spel
         * kwam niet op. Met de reden erbij als main die kent (`start`,
         * `startFout`), zoals het startvenster bij vrij rijden.
         */
        if (!result.launched && !result.running) {
          setNote(
            result.start === "geweigerd"
              ? t(language, "start.launchRefused")
              : result.startFout
                ? t(language, "start.notLaunchedReason", {
                    reden: result.startFout,
                  })
                : t(language, "start.notLaunched"),
          );
          return false;
        }
        setStarted(true);
        /*
         * Wie zelf op START drukt, wil rijden. Dit zat eerst in de voorwaarde om
         * het rijscherm heen -- "loopt er een dienst, dan is dit het scherm" --
         * en die vrat alle andere schermen op.
         */
        setScreen("drive");
        /*
         * De overlay hoort pas in beeld te komen als het spel er is. Draait OMSI
         * al met de plugin, dan is dat nu; anders blijft het venstertje staan tot
         * de plugin gegevens doorgeeft en gaat de overlay op dat moment open.
         */
        if (result.connected) {
          /*
           * Lukt het openen niet, dan is de dienst toch gestart: OMSI draait en
           * geeft gegevens door. Ontsnapte de fout hier, dan bleef de voet op
           * "Situatie wordt geschreven…" staan en was `begin` nooit klaar, dus
           * wist de herstartknop niet hoe het afliep. De knop voor de overlay
           * volgt `overlay:state`, dat main bij elke wisseling zelf stuurt.
           */
          try {
            setOverlayOpen(await window.career.setOverlay(duty, true, ibis));
          } catch {
            // De overlay is met de knop op het rijscherm opnieuw te openen.
          }
        }
        setStarting(!result.connected);

        const lines: string[] = [];
        /*
         * Meerijden: er is met opzet niets klaargezet, dus "alles staat klaar"
         * zou hier gewoon niet waar zijn. Wat er wel geldt staat in de overlay.
         */
        if (result.meegereden) {
          lines.push(t(language, "start.riding"));
        } else if (result.prepareError) {
          lines.push(
            t(language, "start.failed", { reason: result.prepareError }),
          );
        } else {
          lines.push(t(language, "start.ready", { map: duty.mapName }));
          if (result.prepared?.timetableSet)
            lines.push(t(language, "start.timetableSet"));
          /*
           * Lukte het klaarzetten niet, dan hoort dat er te staan. Tot nu toe
           * werd dat wel uitgerekend maar nergens gezegd: je las "alles staat
           * klaar" en kwam vervolgens op de kaart van de vorige keer uit, zonder
           * dat iets verklaarde waarom.
           */
          const klaar = result.prepared?.startup;
          if (klaar && !(klaar.lastMap && klaar.lastSituation)) {
            lines.push(
              t(language, "start.presetFailed", { map: duty.mapName }),
            );
          }
        }
        if (result.running && !result.meegereden)
          lines.push(t(language, "start.alreadyRunning"));
        setNote(lines.join(" "));
        return true;
      } finally {
        setBusy(false);
      }
    },
    [duty, confirmed, ibis, vehicle, assignment, language, busKleur],
  );

  /**
   * Eén druk op START: de dienst aannemen en meteen beginnen.
   *
   * In het oude scherm waren dit twee knoppen, en niemand snapte waarom je
   * eerst moest bevestigen wat je net had aangeklikt. De handeling is er nog
   * wel -- de dienst komt in je loopbaan te staan -- maar hij hangt niet langer
   * aan een eigen knop.
   */
  const startAlles = useCallback(
    async (meerijden?: boolean) => {
      if (!assignment || busy) return;
      if (!confirmed) await confirmDuty();
      await begin(true, false, meerijden);
    },
    [assignment, busy, confirmed, confirmDuty, begin],
  );

  /*
   * Op START drukken. Draait OMSI al, dan eerst de vraag wat de app moet doen:
   * klaarzetten heeft dan geen zin, want het spel leest zijn startscherm alleen
   * bij het opstarten. Dat hoort te blijken voordat de dienst in je loopbaan
   * staat en niet als mededeling erna.
   */
  /**
   * Vrij rijden: de bus neerzetten waar de voet het zei, OMSI starten, en naar
   * het rijscherm van vrij rijden. Weigert het hoofdproces, dan staat de reden
   * in de voet en blijf je op de busstap; START doet nooit stil niets.
   */
  const startVrij = useCallback(async () => {
    if (!selectedMap || busy) return;
    const bus = vehicleOverride || vrijeTip?.relativePath;
    if (!bus) {
      setError(t(language, "free.pickBus"));
      return;
    }
    setBusy(true);
    setError(undefined);
    setNote(t(language, "start.preparing"));
    try {
      const plek = vrijePlek?.ok ? vrijePlek.plek : undefined;
      const moment = vrijePlek?.ok ? vrijePlek.moment : undefined;
      const dag = moment ? dagVanIso(moment.iso) : undefined;
      const result: FreeResult = await window.career.startFree({
        mapFolder,
        vehiclePath: bus,
        kleurstelling:
          busKleur && busKleur.pad === bus ? busKleur.naam : undefined,
        wanneer: vrijWanneer,
        weather: vrijWeer,
        yard: yardOverride || yards.find((optie) => optie.suggested)?.name,
        plek: plek?.nr,
        moment:
          dag && moment
            ? { year: dag.year, dayOfYear: dag.dayOfYear, minutes: moment.minutes }
            : undefined,
      });
      if (result.fout) {
        setNote(undefined);
        setError(vrijeFout(result));
        return;
      }
      const kaart = selectedMap.name;
      const waar = result.plek ?? plek?.naam ?? "";
      /*
       * Wat het startvenster zegt. Mislukte het starten, dan blijft het staan
       * met de reden, en gaat het vanzelf dicht zodra OMSI er is.
       */
      const melding = result.running
        ? t(
            language,
            result.klaargezet === "situatie"
              ? "free.readyRunning"
              : "free.alreadyRunning",
            { map: kaart },
          )
        : result.start === "geweigerd"
          ? t(language, "free.launchRefused")
          : result.start === "mislukt"
            ? t(language, "free.launchFailed", {
                reden: result.foutTekst ?? "?",
              })
            : result.klaargezet === "start"
              ? t(language, "free.ready", { map: kaart, plek: waar })
              : t(language, "free.readyManual", { map: kaart });
      setVrijUit(undefined);
      /*
       * Een nieuwe rit begint zonder vorige staat. Bleef "gevolgd" van de vorige
       * rit staan, dan wiste de eerste staat van deze rit de melding hieronder.
       */
      vorigeVrijStaat.current = undefined;
      setVrijBezig(true);
      setNote(melding);
      setStartMelding(
        result.running
          ? undefined
          : {
              tekst: melding,
              mislukt:
                result.start === "geweigerd" || result.start === "mislukt",
            },
      );
      // Tot het spel er is, zegt het venstertje dat; dan gaat de overlay open.
      setStarting(!result.running);
      setOverlayOpen(await window.career.overlayIsOpen());
    } catch (cause) {
      setNote(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [
    selectedMap,
    busy,
    vehicleOverride,
    vrijeTip,
    vrijePlek,
    vrijWanneer,
    vrijWeer,
    yardOverride,
    yards,
    mapFolder,
    busKleur,
    language,
  ]);

  /** Waarom START weigerde, in de woorden van de speler. */
  const vrijeFout = (uit: FreeResult | FreeCheck): string => {
    const kaart = selectedMap?.name ?? "";
    switch (uit.fout) {
      case "geenBus":
        return t(language, "free.pickBus");
      case "onvolledig":
        return t(language, "free.mapBroken");
      case "geenPlek":
        return t(language, "free.noPlace", { map: kaart });
      case "geenDienstregeling":
        return t(language, "free.noTimetable", { map: kaart });
      case "schrijven":
        return t(language, "free.writeFailed", {
          reden: ("foutTekst" in uit ? uit.foutTekst : undefined) ?? "?",
        });
      case "bekijken":
        return t(language, "vw.start");
      default:
        return t(language, "free.noPlace", { map: kaart });
    }
  };

  const drukOpStart = useCallback(() => {
    /*
     * Vrij rijden heeft geen dienst om aan te nemen of mee te rijden: START zet
     * de bus neer en start OMSI. Draait het al, dan zet het hoofdproces niets
     * klaar en gaat de overlay meteen open; zie free:start.
     */
    if (mode === "free") {
      void startVrij();
      return;
    }
    if (omsiDraaitAl && !started) {
      setDraaitVraag(true);
      return;
    }
    void startAlles();
  }, [mode, omsiDraaitAl, started, startAlles, startVrij]);

  /**
   * Carriere: examen afleggen op de aangewezen lijn.
   *
   * Een examen is een enkele rit die meteen vastligt -- er valt niets aan te
   * kiezen, dus wordt hij hier bevestigd en niet pas op de busstap. Daarna ga
   * je gewoon door de busstap heen, net als bij een dienst.
   */
  const doeExamen = useCallback(
    async (line: LineSummary, basic: boolean) => {
      /*
       * Is er al een dienst aangenomen, dan geen nieuw examen maar verder met
       * die dienst, op de busstap. Dit zette eerst het gevonden examen in
       * `duties` en vroeg pas daarna main om het aan te nemen; main weigert dat
       * zolang er een dienst in het profiel staat, en dan reed je een ander
       * examen dan het profiel -- en `finishExam` beoordeelt het examen in het
       * geheugen. Wie nog geen vergunning heeft, kan op deze stap alleen via
       * deze knop verder: na een herstart van de app, of na terugklikken in de
       * balk, sta je met een aangenomen examen weer hier.
       */
      if (active) {
        const held = active.assignment as Assignment;
        /*
         * De kaart terug op die van de dienst. De kaartstap zit niet op slot,
         * en wie daar intussen een andere kaart koos, kwam op de busstap met de
         * dienst van de ene kaart en `mapFolder` van de andere: "Ja" op de
         * vraag over het wagenpark zette de bussen dan in de verkeerde kaart.
         */
        setMapFolder(held.duty.mapFolder);
        /*
         * En zeggen waarom er geen examen komt, tenzij de aangenomen dienst het
         * examen is waar hij om vroeg. Wie een gewone dienst open had staan en
         * op "Examen starten" drukte, stond zonder een woord op de busstap van
         * die dienst.
         */
        const ditExamen =
          active.exam?.lineFile === line.lineFile &&
          held.duty.mapFolder === mapFolder;
        setError(undefined);
        if (!ditExamen) setNote(t(language, "app.activeDuty"));
        setExamenScherm(false);
        setStap("bus");
        return;
      }
      setBusy(true);
      setError(undefined);
      setNote(undefined);
      try {
        const gevonden = await window.career.examDuty(mapFolder, line.lineFile);
        if (!gevonden) {
          setError(t(language, "exam.none"));
          return;
        }
        setDuties([gevonden]);
        setSelected(0);
        setVehicleOverride("");
        setStarted(false);
        setCareer(
          await window.career.confirmDuty(gevonden, "", "career", {
            lineFile: line.lineFile,
            lineNumbers: line.lineNumbers,
            basic,
          }),
        );
        setExamenScherm(false);
        setStap("bus");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [mapFolder, language, active],
  );

  /**
   * Opnieuw kijken wat er in de OMSI-map staat.
   *
   * Een kaart of een bus installeer je door een map neer te zetten, en de app
   * leest die mappen alleen bij het starten -- wie tussendoor iets installeert,
   * ziet het pas na een herstart. Deze knop leest ze opnieuw en zegt wat erbij
   * is gekomen sinds de vorige keer.
   */
  const checkInstalled = useCallback(async () => {
    setChecking(true);
    setChecked(undefined);
    try {
      const found = await window.career.checkInstalled();
      setMaps(found.maps);
      setVehicles(found.vehicles);
      // Een kaart die weg is, kan niet gekozen blijven.
      if (!found.maps.some((item) => item.folder === mapFolder)) {
        setMapFolder(found.maps[0]?.folder ?? "");
      }

      const buses = new Set(found.vehicles.map((item) => item.folder)).size;
      if (found.first) {
        setChecked(
          t(language, "check.first", { maps: found.maps.length, buses }),
        );
        return;
      }
      const parts: string[] = [];
      if (found.addedMaps.length > 0) {
        parts.push(
          t(language, "check.newMaps", { items: found.addedMaps.join(", ") }),
        );
      }
      if (found.addedBuses.length > 0) {
        parts.push(
          t(language, "check.newBuses", { items: found.addedBuses.join(", ") }),
        );
      }
      if (found.removedMaps.length > 0 || found.removedBuses.length > 0) {
        parts.push(
          t(language, "check.gone", {
            items: [...found.removedMaps, ...found.removedBuses].join(", "),
          }),
        );
      }
      setChecked(
        parts.length > 0
          ? parts.join(" ")
          : t(language, "check.nothing", { maps: found.maps.length, buses }),
      );
    } catch (cause) {
      setChecked(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }, [language, mapFolder]);

  /*
   * Busplaatjes bijwerken: eerst opnieuw in Vehicles kijken, dan tekenen.
   *
   * Het kijken hoort erbij. De lijst met bussen wordt één keer gelezen en dan
   * vastgehouden, dus een bus die je na het starten in Vehicles zet bestaat
   * voor de app pas na een herstart -- en dan maakt de knop er ook geen
   * plaatje van. Het nakijken hier is hetzelfde als de knop op de kaartstap.
   */
  const bijwerkenBusfotos = useCallback(async () => {
    if (busfotoStand?.loopt) return;
    /*
     * Het nakijken duurt een paar seconden. Zolang staat de ronde al als
     * lopend, met wat er gebeurt: anders meldt het scherm "alles is klaar"
     * voordat er ook maar gekeken is.
     */
    setBusfotoStand((oud) => ({
      ...(oud ?? {
        klaar: 0,
        totaal: 0,
        resterend: 0,
        zonder: 0,
        gemaakt: 0,
        duur: 0,
        verwerkt: 0,
      }),
      loopt: true,
      gemaakt: 0,
      duur: 0,
      verwerkt: 0,
      bezig: t(language, "photos.looking"),
    }));
    await checkInstalled();
    setBusfotoStand(await window.career.busfotosMaken());
  }, [busfotoStand?.loopt, checkInstalled, language]);

  const createProfile = useCallback(async (name: string) => {
    setCareer(await window.career.createProfile(name));
    setScreen("modes");
  }, []);

  const chooseProfile = useCallback(async (id: string) => {
    setCareer(await window.career.selectProfile(id));
    setScreen("modes");
  }, []);

  /**
   * Zolang de dienst loopt kijken we of hij is uitgereden: eindtijd voorbij en
   * de bus stil. Dan boekt de app hem zelf, zoals een chauffeur die afmeldt.
   */
  useEffect(() => {
    if (!started) {
      setSession(undefined);
      setConnected(false);
      setOmsiLaadt(false);
      return;
    }
    const look = (): void => {
      void window.career.checkSession().then((result) => {
        setSession(result);
        if (result.dutyComplete) void finishRef.current?.();
      });
      void window.career.liveConnected().then((verbonden) => {
        setConnected(verbonden);
        /*
         * Nog geen gegevens: staat OMSI dan al open? De kaart laden duurde op
         * Lucs pc drie en een halve minuut, en al die tijd zei dit scherm "Wacht
         * op OMSI". Alleen zolang er niets binnenkomt, want het is `tasklist`.
         */
        if (verbonden) setOmsiLaadt(false);
        else void window.career.omsiRunning().then(setOmsiLaadt);
      });
    };
    // Meteen kijken, anders staat het scherm de eerste vijf seconden leeg.
    look();
    const timer = setInterval(look, 5000);
    return () => clearInterval(timer);
  }, [started]);

  // De stand van de overlay komt uit het hoofdproces; hij gaat ook dicht vanuit
  // de overlay zelf of bij het afronden, en dan moet de knop dat weten.
  useEffect(() => {
    void window.career.overlayIsOpen().then(setOverlayOpen);
    return window.career.onOverlayState(setOverlayOpen);
  }, []);

  /*
   * Vrij rijden: hoe het ervoor staat, uit het hoofdproces. Kiest de speler in
   * OMSI een omloop, dan komt die hier mee, al opgebouwd en met zijn IBIS-codes.
   */
  useEffect(
    () =>
      window.career.onVrijStaat((uit) => {
        setVrijUit(uit);
        const vorige = vorigeVrijStaat.current;
        vorigeVrijStaat.current = uit.staat.soort;
        if (uit.staat.soort === "gevolgd" && uit.duty) {
          setNote(
            t(language, "free.followed", {
              line: uit.duty.lineNumbers.join("/") || uit.duty.lineFile,
              tour: uit.duty.tourNumber,
            }),
          );
        } else if (vorige === "gevolgd") {
          // "Je koos lijn ..." klopt niet meer; wat er nu is, staat in het onderschrift.
          setNote(undefined);
        }
      }),
    [language],
  );

  const toggleOverlay = useCallback(async () => {
    if (!duty && !overlayOpen) return;
    // Alleen bekijken: main opent geen overlay; zeg waarom.
    if (!overlayOpen && bekijkstand) {
      setNote(t(language, "vw.start"));
      return;
    }
    setOverlayOpen(await window.career.setOverlay(duty, !overlayOpen, ibis));
  }, [duty, overlayOpen, ibis, bekijkstand, language]);

  /**
   * Afronden. Een examenrit gaat naar de examencommissie in plaats van naar het
   * logboek: daar hangt een vergunning aan vast, geen loon.
   */
  const finish = useCallback(async () => {
    if (!duty || !vehicle) return;
    setBusy(true);
    /* Wat er over de rit te zeggen valt; dat komt in het hoofdmenu te staan. */
    let uitkomst: string | undefined;
    try {
      const result = await window.career.checkSession();
      /*
       * Hoeveel stevige stops er bij deze dienst horen voordat het opvalt. Een
       * op de tien haltes, en minstens twee: op een rit van veertien haltes is
       * één auto die invoegt geen slecht rijgedrag.
       */
      const ruimteVoorRemmen = Math.max(
        2,
        Math.round((duty?.totalStops ?? 0) / 10),
      );
      if (exam) {
        const payload = await window.career.finishExam(
          duty,
          {
            finished: result.dutyComplete || (result.drivenKm ?? 0) > 0,
            delayMinutes: result.delayMinutes,
            harshBrakes: result.harshBrakes,
            harshAccels: result.harshAccels,
            topSpeed: result.topSpeed,
          },
          exam.basic,
        );
        setCareer(payload);
        const verdict = payload.state?.exams[0];
        uitkomst = verdict?.passed
          ? t(language, "exam.granted", {
              line: verdict.lineNumbers.join("/") || verdict.lineFile,
            })
          : t(language, "exam.again");
      } else {
        setCareer(
          await window.career.completeDuty(
            duty,
            `${vehicle.manufacturer} ${vehicle.type}`,
            {
              stopsDone: result.stopsDone,
              drivenKm: result.drivenKm,
              delayMinutes: result.delayMinutes,
              harshBrakes: result.harshBrakes,
              harshAccels: result.harshAccels,
              tickets: result.tickets,
              collisions: result.collisions,
              fuelUsed: result.fuelUsed,
            },
          ),
        );
        uitkomst =
          /*
           * Zonder gemeten kilometers valt er niets over de rit te zeggen. Dat
           * gebeurt als de kilometerteller van de bus onzin gaf; dan is "je reed
           * niets" het eerlijkste van wat er te melden valt.
           */
          result.finished && (result.drivenKm ?? 0) > 0
            ? /*
                Niet alles of niets. Eén stevige stop op veertig haltes is geen
                slechte rit -- dat is verkeer. Pas als het er meer zijn dan een
                op de tien haltes staat het er, en anders heet het gewoon
                vloeiend gereden.

                Een aanrijding gaat daar voor. Dat is geen rijstijl maar een
                gebeurtenis, en de chauffeur hoort er als eerste over te lezen.
              */
              (result.collisions ?? 0) > 0
              ? t(language, "done.collision", {
                  km: (result.drivenKm ?? 0).toFixed(1),
                  count: result.collisions ?? 0,
                })
              : t(
                  language,
                  (result.harshBrakes ?? 0) > ruimteVoorRemmen
                    ? "done.harsh"
                    : "done.smooth",
                  {
                    km: (result.drivenKm ?? 0).toFixed(1),
                    count: result.harshBrakes ?? 0,
                  },
                )
            : t(language, "done.nothing");
      }
      setDuties([]);
      setSelected(undefined);
      setStarted(false);
      setOverlayOpen(false);
      // De uitkomst gaat mee naar het hoofdmenu; zie `naarBegin`.
      naarBegin(uitkomst);
    } finally {
      setBusy(false);
    }
  }, [duty, vehicle, exam, language, naarBegin]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  /*
   * Zodra de OMSI-map vaststaat: beginnen met het klaarzetten van de kaarten,
   * en meeluisteren hoe ver het is. Eén keer per sessie; wat al klaarstaat
   * wordt overgeslagen, dus dit is bij de tweede start meteen voorbij.
   */
  useEffect(() => {
    if (!omsi?.confirmed) return undefined;
    let geldig = true;
    void window.career.kaartenVoorbereiden().then((stand) => {
      if (geldig) setKaartenStand(stand);
    });
    const opzeggen = window.career.opKaartenWarm((stand) => {
      if (geldig) setKaartenStand(stand);
    });
    return () => {
      geldig = false;
      opzeggen();
    };
  }, [omsi?.confirmed]);

  /*
   * Hoe ver de busfoto's zijn, en meeluisteren terwijl er getekend wordt.
   *
   * Elke foto die klaar komt gaat meteen naar de tegels. Wie tijdens het
   * bijwerken op de busstap staat, ziet de iconen zo een voor een foto worden
   * zonder dat die stap er zelf om hoeft te vragen.
   */
  useEffect(() => {
    if (!omsi?.confirmed) return undefined;
    let geldig = true;
    const opzeggen = window.career.opBusfotos((stand) => {
      if (!geldig) return;
      setBusfotoStand(stand);
      const laatste = stand.laatste;
      if (laatste) {
        gevraagdeFotos.current.add(laatste.relativePath);
        setBusFotos((oud) =>
          oud[laatste.relativePath] === laatste.adres
            ? oud
            : { ...oud, [laatste.relativePath]: laatste.adres },
        );
      }
    });
    return () => {
      geldig = false;
      opzeggen();
    };
  }, [omsi?.confirmed]);

  /* Meldingen over OMSI: de laatste bij het openen, en nieuwe zodra ze komen. */
  useEffect(() => {
    let geldig = true;
    void window.career.omsiMelding().then((melding) => {
      if (geldig && melding) setOmsiMelding(melding);
    });
    const opzeggen = window.career.opOmsiMelding((melding) => {
      if (!geldig) return;
      setOmsiMelding(melding);
      /*
       * Een crash of vastloper hoort de speler meteen te zien, ook als hij net
       * in het hoofdmenu of de instellingen staat: dan naar de lopende dienst,
       * waar de knop om opnieuw te starten staat. Een melding over overlays is
       * geen haast; die wacht tot hij daar zelf komt.
       *
       * De vraag of je verder wilt rijden gaat daarbij weg: de app heeft hem nu
       * zelf beantwoord. Bleef hij staan, dan kwam hij terug zodra je naar het
       * hoofdmenu ging, over de dienst waar je op dat moment in zat.
       */
      if (melding.soort !== "overlays") {
        setHervatVraag(false);
        setScreen("drive");
      }
    });
    return () => {
      geldig = false;
      opzeggen();
    };
  }, []);

  /*
   * Tellen voor de vraag bij het installeren, en alleen dan.
   *
   * Pas na de kaarten: zolang die klaargezet worden staat dat scherm er, en
   * tellen kost een werker een doorloop van Vehicles. Wie de
   * vraag al gehad heeft hoeft niet geteld te worden; de knoppen tellen zelf.
   */
  const kaartenBezig = Boolean(
    kaartenStand && kaartenStand.resterend > 0 && !klaarzettenOverslaan,
  );

  /*
   * Rechts in de bovenbalk, op elk scherm met de stappen: het hoofdmenu en de
   * instellingen van OMSI, dan versie, thema en talen.
   *
   * Luc: "Ik wil het hoofdmenu en de settings altijd kunnen bereiken vanuit elk
   * menu." Tot nu toe kwam je alleen terug in het hoofdmenu via de stappen, en
   * bij de instellingen alleen vanuit het hoofdmenu; tijdens een lopende dienst
   * stond de balk er helemaal niet. Wat je in de stappen koos blijft staan: wie
   * vanuit het hoofdmenu weer een modus kiest, gaat verder waar hij was.
   */
  const balkRechts = (
    <>
      {career?.state && (
        <button
          type="button"
          className="balk-knop"
          aria-label={t(language, "nav.home")}
          title={t(language, "nav.home")}
          onClick={() => setScreen("modes")}
        >
          <Icoon naam="thuis" />
        </button>
      )}
      {omsi?.confirmed && (
        <button
          type="button"
          className="balk-knop"
          aria-label={t(language, "nav.settings")}
          title={t(language, "nav.settings")}
          aria-current={screen === "game" ? "page" : undefined}
          onClick={() => setScreen("game")}
        >
          <Icoon naam="stuur" />
        </button>
      )}
      <Versie />
      <ThemaKnop language={language} thema={thema} onThema={kiesThema} />
      {LANGUAGES.map((taal) => (
        <button
          key={taal.code}
          type="button"
          aria-pressed={taal.code === language}
          aria-label={taal.native}
          title={taal.native}
          onClick={() => chooseLanguage(taal.code)}
        >
          <Flag code={taal.code} />
        </button>
      ))}
    </>
  );
  useEffect(() => {
    if (!omsi?.confirmed || busfotosGevraagd !== false || kaartenBezig)
      return undefined;
    let geldig = true;
    void window.career.busfotosStand().then((stand) => {
      if (geldig) setBusfotoStand((oud) => (oud?.loopt ? oud : stand));
    });
    return () => {
      geldig = false;
    };
  }, [omsi?.confirmed, busfotosGevraagd, kaartenBezig]);

  /*
   * Het eerste dat iemand van deze app ziet: waar staat OMSI?
   *
   * Alles hierna hangt aan die map, dus er valt niets te laden zolang die niet
   * vaststaat. Het scherm staat midden in beeld en niet in het stappenvel van
   * de rest -- dit is geen stap in het klaarzetten van een dienst maar de deur
   * ervoor, en er is niets anders te doen dan antwoorden.
   */
  /*
   * Nog geen chauffeur? Dan is dit de eerste start.
   *
   * Staat hier boven de schermen omdat de volgorde ervan afhangt: eerst de
   * taal, dan een chauffeur, en pas daarna de vraag waar OMSI staat.
   */
  const eersteStart =
    Boolean(career) && (!career?.state || (career?.profiles.length ?? 0) === 0);

  /*
   * De allereerste vraag: in welke taal lees je dit? Alles hierna is tekst.
   */
  if (taalGekozen === false) {
    return (
      <Taalkeuze
        onKies={(taal) => {
          setLanguage(taal);
          setTaalGekozen(true);
          void window.career.saveSettings({
            language: taal,
            languageChosen: true,
          });
        }}
      />
    );
  }

  /*
   * Dan wie er rijdt. Luc: "bij het opstarten voor de eerste keer moeten eerst
   * grote tegels komen met de taal selectie, daarna door naar profiel maken en
   * de install wizzard".
   *
   * Dit kan niet de chauffeursstap uit het stappenvel zijn: dat vel leunt op de
   * kaarten en de bussen, en die zijn er nog niet -- de OMSI-map is nog niet
   * eens aangewezen. Vandaar een eigen scherm in dezelfde vorm als de twee
   * andere vragen van de eerste start.
   */
  if (eersteStart) {
    return (
      <Chauffeurstart
        language={language}
        bezig={busy}
        onAanmaken={(naam) => {
          void window.career.createProfile(naam).then(setCareer);
        }}
      />
    );
  }

  /* En pas daarna: waar staat OMSI? */
  if (omsi && !omsi.confirmed) {
    const kiezen = async (): Promise<void> => {
      setOmsiBezig(true);
      try {
        const uit = await window.career.browseOmsi();
        // Geannuleerd: dan blijft staan wat er stond, zonder waarschuwing.
        if (uit.wrong || uit.path) setOmsi({ ...uit, confirmed: false });
      } finally {
        setOmsiBezig(false);
      }
    };
    return (
      <LanguageProvider language={language}>
        <Welkom
          language={language}
          onLanguage={chooseLanguage}
          thema={thema}
          onThema={kiesThema}
          omsi={omsi}
          bezig={omsiBezig}
          onKiezen={() => void kiezen()}
          onBevestig={() => {
            if (!omsi.path) return;
            setOmsiBezig(true);
            void window.career
              .confirmOmsi(omsi.path)
              .then((uit) => {
                /*
                 * Opnieuw beginnen in plaats van de halve app bijwerken: alles
                 * wat er staat is geladen zonder dat deze map vaststond.
                 */
                if (uit.confirmed) window.location.reload();
                else setOmsi({ ...uit, confirmed: false });
              })
              .finally(() => setOmsiBezig(false));
          }}
        />
      </LanguageProvider>
    );
  }

  /*
   * De installatiestap: de kaarten klaarzetten voordat er iets gekozen wordt.
   *
   * Alleen als er werkelijk iets te doen is, dus bij de eerste start en later
   * alleen voor een kaart die erbij is gekomen. Wie overslaat gaat gewoon
   * verder; het klaarzetten loopt dan door op de achtergrond.
   */
  if (kaartenStand && kaartenStand.resterend > 0 && !klaarzettenOverslaan) {
    return (
      <LanguageProvider language={language}>
        <Klaarzetten
          language={language}
          thema={thema}
          onThema={kiesThema}
          stand={kaartenStand}
          onOverslaan={() => setKlaarzettenOverslaan(true)}
        />
      </LanguageProvider>
    );
  }

  /*
   * En de busfoto's: bij het installeren één keer de vraag, en via de knop op
   * het startscherm of de busstap zo vaak als iemand wil.
   *
   * Na de kaarten, want die zijn sneller klaar en het kiezen begint ermee. De
   * vraag komt alleen als er ook iets te maken valt: wie geen bussen heeft of
   * ze allemaal al heeft, slaat hem ongemerkt over.
   */
  const busfotoVraag =
    busfotosGevraagd === false &&
    Boolean(busfotoStand && busfotoStand.resterend > 0);
  if (busfotoStand && (busfotoScherm || busfotoVraag)) {
    const aanleiding = busfotoScherm ?? "installatie";
    const afronden = (): void => {
      setBusfotoScherm(undefined);
      if (busfotosGevraagd === false) {
        setBusfotosGevraagd(true);
        void window.career.saveSettings({ busPhotosOffered: true });
      }
    };
    return (
      <LanguageProvider language={language}>
        <Busplaatjes
          key={aanleiding}
          language={language}
          thema={thema}
          onThema={kiesThema}
          stand={busfotoStand}
          aanleiding={aanleiding}
          onMaken={() => {
            /*
             * Het scherm vastzetten. De vraag staat er omdat er bussen zonder
             * foto zijn; zodra de ronde ze allemaal heeft, zou hij verdwijnen
             * voordat iemand de uitkomst zag of op Verder drukte -- en dan werd
             * ook niet onthouden dat de vraag gesteld is.
             */
            setBusfotoScherm(aanleiding);
            // Meteen als lopend, anders staat tot de eerste melding de uitkomst in beeld.
            setBusfotoStand(
              (oud) =>
                oud && {
                  ...oud,
                  loopt: true,
                  bezig: t(language, "photos.looking"),
                  gemaakt: 0,
                  duur: 0,
                  verwerkt: 0,
                },
            );
            void window.career.busfotosMaken().then(setBusfotoStand);
          }}
          onStoppen={() => {
            void window.career.busfotosStoppen();
          }}
          onKlaar={afronden}
        />
      </LanguageProvider>
    );
  }

  if (error && !ready) {
    return (
      <div className="main">
        <h1>{t(language, "app.errorTitle")}</h1>
        <p className="subtitle">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="main">
        <h1>{t(language, "app.loading")}</h1>
        <p className="subtitle">{t(language, "app.loadingSub")}</p>
      </div>
    );
  }

  /*
   * De starthub: het hoofdscherm.
   *
   * Hier kom je binnen als er een chauffeur is en er nog niets gekozen is, en
   * hier kom je terug via de stappenbalk. De modus staat als drie tegels op
   * tafel in plaats van als drie regels in een keuzevel -- het is de keuze waar
   * de rest van de app aan hangt, en geen rij in een lijst. Wat er verder bij
   * binnenkomen hoort staat eromheen: je staat van dienst, de instellingen van
   * OMSI en wie er rijdt.
   */
  /*
   * Het busbedrijf is een eigen app, venstervullend met een zijbalk en een
   * dashboard -- geen stap op weg naar een dienst. Luc: "het busbedrijf moet
   * zijn eigen UI krijgen en een uitgebreid dashboard".
   */
  if (screen === "bedrijf" && career?.state) {
    return (
      <LanguageProvider language={language}>
        <BedrijfApp
          bedrijf={career.state.bedrijf}
          activeDuty={career.state.activeDuty}
          tab={bedrijfTab}
          onTab={setBedrijfTab}
          melding={bedrijfMelding}
          onMelding={setBedrijfMelding}
          onCareer={setCareer}
          onTerug={() => {
            setBedrijfMelding(undefined);
            setScreen("modes");
          }}
        />
      </LanguageProvider>
    );
  }

  // De add-on-manager, ook een eigen scherm; zie Addons.tsx.
  if (screen === "addons") {
    return (
      <LanguageProvider language={language}>
        <AddonsApp onTerug={() => setScreen("modes")} />
      </LanguageProvider>
    );
  }

  if (screen === "modes" && career?.state) {
    return (
      <LanguageProvider language={language}>
        <Starthub
          language={language}
          onLanguage={chooseLanguage}
          thema={thema}
          onThema={kiesThema}
          chauffeur={career.state.driver}
          samenvatting={career.summary ?? undefined}
          modus={mode}
          lopend={active ? (active.mode ?? "service") : undefined}
          onModus={(gekozen) => {
            /*
             * Zolang er een dienst aangenomen is, is de modus die van de dienst.
             * Een andere tegel kiezen zette de app eerst in een modus waar de
             * dienst niet bij hoort: het wisseleffect gooide hem uit `duties`,
             * en in vrij rijden deed START iets anders dan de dienst rijden. Er
             * valt dan niets anders te kiezen, dus elke tegel brengt je naar de
             * dienst die openstaat.
             */
            setMode(active ? (active.mode ?? "service") : gekozen);
            setScreen("drive");
          }}
          onStaatVanDienst={() => setScreen("profiel")}
          onBedrijf={() => setScreen("bedrijf")}
          onAddons={() => setScreen("addons")}
          onInstellingen={() => setScreen("game")}
          onChauffeur={() => setScreen("profiles")}
          onLogboek={() => void window.career.logboekOpenen()}
          melding={hubMelding}
          onMeldingWeg={() => setHubMelding(undefined)}
          onRondleiding={() => setRondleidingOpen(true)}
          onApparaat={() => setApparaatOpen(true)}
          onBussen={() => {
            setBusKlaarKeuze(undefined);
            setScreen("bussen");
          }}
          onBusplaatjes={() => {
            setBusfotoScherm("bijwerken");
            void bijwerkenBusfotos();
          }}
          /*
            De dienstpas, eenmaal, bij binnenkomst.

            Hier en niet ergens in de opzet: dit is het eerste scherm na het
            kiezen van een profiel, er wordt nog niets van je gevraagd, en de
            staat van dienst is hiervandaan te bereiken -- dus de knop "laat zien
            waar" heeft hier betekenis. Bij een verse installatie valt het samen
            met het aanmaken van je eerste chauffeur; bij wie de app al had, met
            de eerste start waarin de gegevens erbij gekomen zijn.
          */
          dialoog={
            /*
             * De dienstpas gaat voor: die komt maar één keer in je leven en is
             * kort. De vraag over de openstaande dienst komt daarna wel, want
             * die staat er de volgende keer nog.
             */
            /*
             * `duty` en niet `activeDuty.assignment`: dat veld is `unknown` in
             * het profiel en wordt elders al uitgepakt. De aangenomen dienst
             * staat op dit moment in `duties`, gezet door het effect dat hem
             * terugleest.
             */
            hervatVraag && duty ? (
              <HervatDialog
                lijn={duty.lineNumbers[0] ?? duty.legs[0]?.lineNumber ?? "?"}
                kaart={duty.mapName}
                onHervatten={() => {
                  setHervatVraag(false);
                  if (bekijkstand) {
                    setHubMelding(t(language, "vw.start"));
                    return;
                  }
                  setScreen("drive");
                }}
                onVerwijderen={() => {
                  const lijn =
                    duty.lineNumbers[0] ?? duty.legs[0]?.lineNumber ?? "?";
                  setHervatVraag(false);
                  void verwijderOpenDienst(lijn);
                }}
              />
            ) : !career.state.pasGezien &&
              career.state.personeelsnummer &&
              career.state.pincode ? (
              <Dienstpas
                chauffeur={career.state.driver}
                personeelsnummer={career.state.personeelsnummer}
                pincode={career.state.pincode}
                onGezien={() =>
                  void window.career.dienstpasGezien().then(setCareer)
                }
                onStaatVanDienst={() => setScreen("profiel")}
              />
            ) : apparaatOpen ? (
              <ApparaatDialoog onClose={() => setApparaatOpen(false)} />
            ) : rondleidingOpen ||
              /*
               * Vanzelf alleen bij wie nieuw is: de rondleiding nog nooit gezien,
               * en nog geen dienst gereden. Wie de app al gebruikte krijgt hem
               * na deze versie niet ineens voor zijn neus; die vindt hem onder het
               * vraagteken.
               */
              (rondleidingGezien === false &&
                (career.summary?.duties ?? 0) === 0) ? (
              <Rondleiding
                language={language}
                naam={career.state.driver}
                onKlaar={() => {
                  setRondleidingOpen(false);
                  if (!rondleidingGezien) {
                    setRondleidingGezien(true);
                    void window.career.saveSettings({ tourSeen: true });
                  }
                }}
              />
            ) : undefined
          }
        />
      </LanguageProvider>
    );
  }

  /*
   * Het opzetscherm: de kaart vult het venster en de keuzes liggen erop. Dit is
   * het enige scherm dat de zijbalk niet toont -- de stappenbalk is hier de
   * navigatie, en een tweede balk ernaast zou hetzelfde twee keer zeggen.
   *
   * Vier stappen delen één vorm. Wat per stap verschilt zijn de regels en wat
   * de hoofdknop doet; de indeling blijft staan, zodat je niet elke stap
   * opnieuw hoeft te zoeken waar je moet kijken.
   */

  /*
   * Wagenparken overzetten.
   *
   * Dit hing eerst in de busstap, en die stap bestaat alleen in de dienstmodus.
   * Wie in carriere rijdt kwam er dus nooit -- terwijl juist daar geldt dat de
   * remise alleen bussen toewijst die de kaart kennen, en dat er dat een
   * handvol zijn. Vandaar hier, boven de modi: hij is nu vanuit de busstap te
   * openen en vanuit de knoppenbalk van de oude schermen.
   *
   * Hier staat wat er zou gebeuren en wat het oplevert; pas op de knop wordt er
   * iets geschreven. Dit is de enige plek waar de app in de voertuigmappen van
   * OMSI komt.
   */
  /*
   * Het overzicht hangt aan de kaart en niet aan een dienst -- bij vrij rijden
   * is er geen, en juist daar kies je een bus uit alle 342 en loop je de kans
   * er een te pakken die de kaart niet kent.
   */
  /*
   * BUSSEN KLAARMAKEN
   *
   * Eerst de bussen als tegels, met hun foto en of ze al klaar zijn. Tik je er een
   * aan, dan leest de app hem uit en staan zijn apparaten er als tegels: aan of
   * uit, met wat voor apparaat het is en hoeveel knoppen. "Klaarmaken" bewaart
   * de keuze en hangt de knoppen aan een toets -- of noteert het, als OMSI
   * draait. In het spel staan de apparaten daarna gewoon in de telefoon.
   */
  if (screen === "bussen") {
    const kaart = bussenKlaar?.find((map) => map.sleutel === busKlaarKeuze);
    const soortTekst = (x: Busanalyseinfo["apparaten"][number]): string => {
      const soort =
        x.soort === "touchscreen"
          ? t(
              language,
              x.knoppen === 1 ? "bus.soortTouchscreenOne" : "bus.soortTouchscreen",
              { n: x.knoppen },
            )
          : x.soort === "scherm"
            ? t(language, "bus.soortScherm", { n: x.knoppen })
            : x.soort === "knoppen"
              ? t(language, "bus.soortKnoppen", { n: x.knoppen })
              : t(language, "bus.soortDisplay");
      const beperking =
        x.beperking === "script"
          ? t(language, "bus.beperkingScript")
          : x.beperking === "versleuteld"
            ? t(language, "bus.beperkingVersleuteld")
            : "";
      return beperking ? `${soort} -- ${beperking}` : soort;
    };
    const naarLijst = (): void => {
      setBusKlaarKeuze(undefined);
      setBusKlaarAnalyse(undefined);
      setBusKlaarMelding(undefined);
    };
    const klaarmaken = async (): Promise<void> => {
      if (!busKlaarKeuze || busKlaarBezig) return;
      setBusKlaarBezig(true);
      setBusKlaarMelding(undefined);
      try {
        const ids = [...busKlaarAan];
        const uitslag = await window.career.busKlaar(busKlaarKeuze, ids);
        let tekst: string;
        if (uitslag.fout === "bekijken") {
          setBusKlaarMelding({ tekst: t(language, "vw.knoppen"), fout: true });
          return;
        }
        if (ids.length === 0) tekst = t(language, "bus.klaarWeg");
        else if (uitslag.onthouden)
          tekst = t(language, "bus.klaarOnthouden", { n: uitslag.knoppen });
        else if (uitslag.bijgeschreven === 0 && uitslag.geenPlek === 0)
          tekst = t(language, "bus.klaarAlles", { n: uitslag.knoppen });
        else
          tekst = t(language, "bus.klaarGedaan", {
            bij: uitslag.bijgeschreven,
            gedeeld:
              uitslag.gedeeld > 0
                ? t(language, "bus.klaarGedeeld", { n: uitslag.gedeeld })
                : "",
          });
        if (uitslag.geenPlek > 0)
          tekst += t(language, "bus.klaarGeenPlek", { n: uitslag.geenPlek });
        setBusKlaarMelding({ tekst, fout: uitslag.geenPlek > 0 });
        setBussenKlaar(await window.career.bussen());
      } catch (fout) {
        setBusKlaarMelding({
          tekst: t(language, "bus.klaarFout", { reden: String(fout) }),
          fout: true,
        });
      } finally {
        setBusKlaarBezig(false);
      }
    };

    /* Een bus aangetikt: zijn apparaten. */
    if (busKlaarKeuze) {
      const apparaten = busKlaarAnalyse?.apparaten ?? [];
      return (
        <LanguageProvider language={language}>
          <Setup
            stap="bus"
            stappen={["bus"]}
            stapnamen={{ bus: t(language, "bus.klaarTitle") }}
            titel={kaart?.naam ?? busKlaarKeuze}
            onderschrift={
              !busKlaarAnalyse
                ? t(language, "bus.klaarLeest", { bus: kaart?.naam ?? "" })
                : apparaten.length === 0
                  ? t(language, "bus.klaarNiets")
                  : t(language, "bus.klaarKies")
            }
            kruimels={[
              { label: t(language, "bus.klaarTitle"), onDoen: naarLijst },
              { label: kaart?.naam ?? busKlaarKeuze },
            ]}
            koppen={["", "", ""]}
            rijen={[]}
            gekozen={-1}
            onKies={() => {}}
            tegels={apparaten.map((x) => ({
              id: x.id,
              titel: x.naam,
              onder: soortTekst(x),
              monogram: x.naam.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(),
              gekozen: busKlaarAan.has(x.id),
              onDoen: () =>
                setBusKlaarAan((nu) => {
                  const volgend = new Set(nu);
                  if (volgend.has(x.id)) volgend.delete(x.id);
                  else volgend.add(x.id);
                  return volgend;
                }),
            }))}
            vullend
            voet={busKlaarMelding?.tekst ?? ""}
            voetFout={busKlaarMelding?.fout}
            bezig={busKlaarBezig || !busKlaarAnalyse}
            startTekst={
              busKlaarBezig
                ? t(language, "bus.klaarBezig")
                : t(language, "bus.klaarDoe")
            }
            onStart={() => void klaarmaken()}
            onTerug={naarLijst}
            rechtsInBalk={balkRechts}
          />
        </LanguageProvider>
      );
    }

    /* De lijst met bussen. */
    const lijst = bussenKlaar ?? [];
    return (
      <LanguageProvider language={language}>
        <Setup
          stap="bus"
          stappen={["bus"]}
          stapnamen={{ bus: t(language, "bus.klaarTitle") }}
          titel={t(language, "bus.klaarTitle")}
          onderschrift={t(language, "bus.klaarIntro")}
          koppen={["", "", ""]}
          rijen={[]}
          gekozen={-1}
          onKies={() => {}}
          tegels={lijst.map((map) => ({
            id: map.sleutel,
            titel: map.naam,
            onder: map.klaar
              ? t(language, "bus.klaarIsKlaar", {
                  apparaten: map.apparaten
                    .map((id) => id.split("/").pop()?.toUpperCase() ?? id)
                    .join(", "),
                })
              : t(
                  language,
                  map.varianten === 1
                    ? "bus.klaarVariantenOne"
                    : "bus.klaarVarianten",
                  { n: map.varianten },
                ),
            beeld: busFotos[map.voorbeeld],
            gekozen: map.klaar,
            onDoen: () => setBusKlaarKeuze(map.sleutel),
          }))}
          vullend
          voet={t(language, "bus.klaarFoot", {
            klaar: lijst.filter((map) => map.klaar).length,
            totaal: lijst.length,
          })}
          startTekst={t(language, "bus.klaarNaarHub")}
          onStart={() => setScreen("modes")}
          onTerug={() => setScreen("modes")}
          rechtsInBalk={balkRechts}
        />
      </LanguageProvider>
    );
  }

  if (busScherm === "overzetten" && mapFolder) {
    const terug = (): void => {
      setBusScherm("bus");
      setBusMerk(undefined);
      setBusType(undefined);
    };
    return (
      <LanguageProvider language={language}>
        <Setup
          stap="bus"
          titel={t(language, "setup.hofTitle")}
          onderschrift={t(language, "setup.hofIntro", {
            count: hofAanbod.length,
          })}
          kruimels={[
            { label: t(language, "setup.busTitle"), onDoen: terug },
            { label: t(language, "setup.hofTitle") },
          ]}
          koppen={[
            t(language, "setup.hofBus"),
            t(language, "setup.hofNow"),
            t(language, "setup.hofAfter"),
          ]}
          rijen={hofAanbod.map((item) => ({
            id: item.folder,
            cellen: [
              item.folder,
              t(language, "setup.hofOf", {
                known: item.known,
                total: item.total,
              }),
              t(language, "setup.hofOf", {
                known: item.offerMatched ?? 0,
                total: item.total,
              }),
            ] as [string, string, string],
          }))}
          gekozen={-1}
          onKies={() => {}}
          vullend
          keuzeloos
          voet={t(language, "setup.hofFoot")}
          bezig={hofBezig}
          startTekst={
            hofBezig ? t(language, "setup.hofBusy") : t(language, "setup.hofDo")
          }
          onStart={() => {
            if (hofBezig) return;
            setHofBezig(true);
            void window.career
              .placeHofs(
                mapFolder,
                hofAanbod.map((item) => item.folder),
              )
              .then(async (result) => {
                setNote(t(language, "setup.hofDone", { count: result.placed }));
                /*
                 * Opnieuw ophalen: met de nieuwe bestanden erbij staan er bussen
                 * in het menu die er zojuist nog niet waren.
                 */
                setHofAanbod(await window.career.hofOffers(mapFolder));
                terug();
              })
              .finally(() => setHofBezig(false));
          }}
          rechtsInBalk={balkRechts}
        />
      </LanguageProvider>
    );
  }

  /*
   * De dienst loopt: OMSI start op of draait al.
   *
   * Tot nu toe viel de app hier terug op de oude wereld -- je drukte op START en
   * kreeg de zijbalk met het glazen dienstpaneel terug, precies op het moment
   * dat je het spel in gaat. Dit scherm hoort bij dezelfde reeks als de stappen
   * ervoor, dus het krijgt hetzelfde vel; wat erin staat is het bestaande
   * dienstpaneel, dat weet wat er tijdens het rijden toe doet.
   *
   * ONGEACHT DE MODUS. Dit stond eerst op `mode === 'service'`, en daardoor
   * kwam wie zijn dienst in carriere had aangenomen na het herstarten van de
   * app toch weer in de oude zijbalk terecht -- juist op het moment dat de
   * dienst al liep. Een lopende dienst ziet er in elke modus hetzelfde uit: er
   * valt niets meer te kiezen, alleen nog te rijden en af te ronden.
   */
  /*
   * HET RIJSCHERM VAN VRIJ RIJDEN
   *
   * Geen dienst om af te ronden: zolang je geen omloop koos staat hier hoe dat
   * in OMSI gaat, en daarna de omloop die de overlay volgt, rit voor rit, met
   * zijn route op de kaart. "Stoppen" sluit de overlay en brengt je terug naar
   * het hoofdmenu; er wordt niets geboekt.
   */
  if (vrijBezig && mode === "free" && screen === "drive") {
    const gevolgd = vrijUit?.duty;
    const kaartNaam = vrijUit?.kaart ?? selectedMap?.name ?? "";
    const stoppen = async (): Promise<void> => {
      await window.career.stopFree();
      setVrijBezig(false);
      setVrijUit(undefined);
      setOverlayOpen(false);
      setStarting(false);
      setStartMelding(undefined);
      naarBegin(t(language, "free.stopped"));
    };
    /* Wat er straks vertrekt, zolang er in OMSI nog niets gekozen is. */
    const groepen = suggestieGroepen(language, vrijUit?.staat, 5);
    return (
      <LanguageProvider language={language}>
        <Setup
          stap="rijden"
          stappen={[...STAPPEN_VRIJ, "rijden"]}
          rechtsInBalk={balkRechts}
          lijn={gevolgd?.lineNumbers[0] ?? gevolgd?.legs.find((leg) => !leg.leer)?.lineNumber}
          duty={gevolgd}
          /* Zonder omloop het net van de kaart die OMSI speelt; met omloop zijn route. */
          netkaart={gevolgd ? undefined : (vrijUit?.mapFolder ?? mapFolder) || undefined}
          /*
           * De hele omloop, elk traject één keer, met dat van de rit die OMSI
           * nu rijdt naar voren; zie `vrijRit`.
           */
          navigatie={gevolgd && vrijRit !== undefined ? { routeMode: "all", activeLeg: vrijRit } : undefined}
          titel={t(language, "free.drivingTitle")}
          /*
           * Wat het hoofdproces over OMSI weet, in dezelfde woorden als de
           * overlay en de telefoon: wachten, geen bus, een andere kaart, nog
           * geen omloop, of de omloop die gevolgd wordt.
           */
          onderschrift={
            vrijUit
              ? vrijeStaatTekst(language, vrijUit.staat, kaartNaam)
              : t(language, "free.drivingPick", { map: kaartNaam })
          }
          /*
           * Het rijscherm toont zijn inhoud niet als rijen maar in het vel zelf;
           * zie het rijscherm van een dienst hieronder. De omloop staat er rit
           * voor rit, net als bij het kiezen van een dienst.
           */
          koppen={["", "", ""]}
          rijen={[]}
          gekozen={0}
          onKies={() => {}}
          voet={error ?? note ?? ""}
          voetFout={Boolean(error)}
          metKaart
          onStart={() => void stoppen()}
          startTekst={t(language, "free.stop")}
          bezig={busy}
          tweede={[
            {
              tekst: t(
                language,
                overlayOpen ? "act.overlayHide" : "act.overlayShow",
              ),
              onDoen: () =>
                void window.career
                  .setOverlay(undefined, !overlayOpen)
                  .then(setOverlayOpen),
            },
            {
              tekst: t(language, "dev.connect"),
              onDoen: () => setApparaatOpen(true),
            },
          ]}
          onTerug={() => setScreen("modes")}
          inhoud={
            <>
              {gevolgd && (
                <div className="vrij-omloop">
                  <Dienstoverzicht duty={gevolgd} />
                </div>
              )}
              {!gevolgd && groepen.length > 0 && (
                <div className="vrij-straks">
                  {groepen.map((groep) => (
                    <section key={groep.titel}>
                      <h3>{groep.titel}</h3>
                      <ul>
                        {groep.regels.map((regel) => (
                          <li key={regel}>{regel}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {starting && (
                <StartingDialog
                  melding={startMelding?.tekst}
                  mislukt={startMelding?.mislukt}
                  onDone={() => {
                    setStarting(false);
                    setStartMelding(undefined);
                    setNote((nu) => nu ?? t(language, "app.omsiReady"));
                    void window.career
                      .setOverlay(undefined, true)
                      .then(setOverlayOpen);
                  }}
                  onDismiss={() => setStarting(false)}
                />
              )}
              {apparaatOpen && (
                <ApparaatDialoog onClose={() => setApparaatOpen(false)} />
              )}
            </>
          }
        />
      </LanguageProvider>
    );
  }

  if (started && duty && screen === "drive") {
    const volledig = assignment ? (
      <DutyCard
        assignment={assignment}
        ibis={ibis}
        vehicle={vehicle}
        vehicleGroups={vehicleGroups}
        vehicleOverride={vehicleOverride}
        onVehicleChange={setVehicleOverride}
        yards={yards}
        yardOverride={yardOverride}
        onYardChange={setYardOverride}
        busy={busy}
        confirmed={confirmed}
        started={started}
        overlayOpen={overlayOpen}
        exam={Boolean(exam)}
        onConfirm={() => void confirmDuty()}
        onCancel={cancelDuty}
        onBegin={begin}
        onToggleOverlay={toggleOverlay}
        onFinish={finish}
        printers={printers}
        printer={printer}
        onPrinterChange={setPrinter}
      />
    ) : null;

    /*
     * De melding over OMSI, bovenaan de lopende dienst.
     *
     * Luc: "laat de app detecteren wanneer omsi crasht zodat je direct opnieuw
     * kan launchen vanuit de dienst die je speelt". Na een crash: opnieuw
     * starten met dezelfde dienst, bus, kleurstelling en remise, zonder de
     * stappen opnieuw. Na een vastloper eerst het hangende spel afsluiten -- dat
     * doet de app alleen als de speler op de knop drukt. En altijd erbij welke
     * overlays er in het spel zaten.
     */
    const overlayNamen = (omsiMelding?.overlays ?? [])
      .filter((item) => item.soort !== "opentrack")
      .map((item) => t(language, `ovl.naam.${item.soort as "steam"}` as const))
      .join(", ");
    const omsiTijd = omsiMelding
      ? new Date(omsiMelding.tijd).toLocaleTimeString(language, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const omsiBanner = omsiMelding ? (
      <div className="omsimelding">
        <p>
          {omsiMelding.soort === "crash"
            ? t(language, "omsi.crash", { tijd: omsiTijd })
            : omsiMelding.soort === "vast"
              ? t(language, "omsi.vast", { tijd: omsiTijd })
              : t(language, "omsi.overlays", { namen: overlayNamen })}
          {omsiMelding.soort !== "overlays" && overlayNamen
            ? ` ${t(language, "omsi.inHetSpel", { namen: overlayNamen })}`
            : ""}
        </p>
        {omsiMelding.soort === "crash" && (
          <p className="omsimelding-klein">
            {t(language, "omsi.herstartUitleg")}
          </p>
        )}
        {omsiMelding.afgesloten && (
          <p className="omsimelding-klein" role="status">
            {t(language, omsiMelding.afgesloten === "al-dicht" ? "omsi.alDicht" : "omsi.nietGesloten")}
          </p>
        )}
        <div className="omsimelding-knoppen">
          {omsiMelding.soort === "crash" && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                /*
                 * Mislukt de herstart, dan komt de melding terug, en daarmee
                 * deze knop. Hij verdween hier meteen, en na een geweigerde
                 * `duty:begin` stond je op een rijscherm zonder enige manier om
                 * het nog eens te proberen. Een nieuwere melding die intussen
                 * binnenkwam gaat voor.
                 */
                const melding = omsiMelding;
                setOmsiMelding(undefined);
                void window.career.vergeetOmsiMelding();
                void begin(true, true).then((gelukt) => {
                  if (!gelukt) setOmsiMelding((nu) => nu ?? melding);
                });
              }}
            >
              {t(language, "omsi.herstart")}
            </button>
          )}
          {omsiMelding.soort === "vast" && omsiMelding.pid !== undefined && omsiMelding.afgesloten !== "al-dicht" && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                /*
                 * Het hoofdproces sluit alleen af als onder dat pid nog
                 * hetzelfde OMSI draait. Zo niet, dan zegt de melding dat.
                 */
                const melding = omsiMelding;
                void window.career.sluitOmsi(melding.pid as number).then((uit) => {
                  if (uit !== "gesloten") setOmsiMelding((nu) => (nu === melding ? { ...melding, afgesloten: uit } : nu));
                });
              }}
            >
              {t(language, "omsi.afsluiten")}
            </button>
          )}
          {overlayNamen && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setInstellingenTab("overlays");
                setScreen("game");
              }}
            >
              {t(language, "omsi.bekijken")}
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setOmsiMelding(undefined);
              void window.career.vergeetOmsiMelding();
            }}
          >
            {t(language, "omsi.negeren")}
          </button>
        </div>
      </div>
    ) : undefined;

    return (
      <LanguageProvider language={language}>
        <Setup
          /*
           * Zijn eigen stap, met zijn eigen icoontje. Dit stond op "bus", en dan
           * wees de balk de busstap aan terwijl je allang reed -- alsof je nog
           * aan het kiezen was.
           */
          stap="rijden"
          stappen={[
            ...(mode === "career"
              ? STAPPEN_CARRIERE
              : mode === "free"
                ? STAPPEN_VRIJ
                : STAPPEN_DIENST),
            "rijden",
          ]}
          rechtsInBalk={balkRechts}
          waarschuwing={omsiBanner}
          lijn={duty.lineNumbers[0] ?? duty.legs[0]?.lineNumber}
          /*
           * De dienst erbij, want daar haalt de kaart zijn tegels en zijn route
           * uit. Zonder deze regel stond er "de kaart verschijnt zodra je een
           * lijn en een dienst hebt gekozen" terwijl de dienst al reed.
           */
          duty={duty}
          titel={t(language, "run.title")}
          onderschrift={t(language, "run.intro", { map: duty.mapName })}
          koppen={["", "", ""]}
          rijen={[]}
          gekozen={0}
          onKies={() => {}}
          /*
           * Wat `begin` over het starten te zeggen heeft. `begin` zet het net na
           * de sprong naar dit scherm, en hier stond een lege voet: "je rijdt
           * mee, kies de kaart en de omloop zelf" na Meerijden, of dat het
           * klaarzetten mislukte, werd uitgerekend en pas getoond als je daarna
           * de instellingen of de chauffeurs opende.
           */
          voet={note ?? ""}
          onStart={() => void finish()}
          startTekst={t(language, "act.finish")}
          bezig={busy}
          /*
           * De kaart blijft naast het vel staan: tijdens het rijden is dat de
           * navigatie. Wat erop komt hangt van de bus af -- zolang OMSI niets
           * doorgeeft blijft de hele dienst als flauwe lijn staan, en zodra de
           * bus zich meldt is het de rit die loopt, met hem erop.
           */
          metKaart
          rijdend
          navigatie={{
            routeMode: live ? "active" : "all",
            activeLeg: live?.legIndex,
            nextStopId:
              live && live.stopIndex !== undefined
                ? duty.legs[live.legIndex]?.stopIds[live.stopIndex]
                : undefined,
            vehicle: liveBus
              ? { ...liveBus, speedKmh: live?.speedKmh ?? 0 }
              : undefined,
          }}
          inhoud={
            <>
              {starting && (
                <StartingDialog
                  onDone={() => {
                    setStarting(false);
                    /*
                     * Alleen als de voet nog leeg is: `begin` zet er zelf al
                     * neer wat er voor deze start geldt. Sinds de voet van dit
                     * scherm `note` toont, stond na elke gewone START de hele
                     * dienst lang "laad je kaart en bus, en stel de dienst in"
                     * -- terwijl de app dat net allemaal had klaargezet -- en
                     * verdween "klaarzetten lukte niet" of "je rijdt mee"
                     * eronder nog voor je het had kunnen lezen.
                     */
                    setNote((nu) => nu ?? t(language, "app.omsiReady"));
                    if (duty)
                      void window.career
                        .setOverlay(duty, true, ibis)
                        .then(setOverlayOpen);
                  }}
                  onDismiss={() => setStarting(false)}
                />
              )}
              {/*
                De hele dienst die meeloopt. Hij staat boven de knoppen, want
                dit is waar je naar kijkt terwijl je rijdt; afronden en
                annuleren zoek je een keer op.
              */}
              <LiveDienst duty={duty} ibis={ibis} status={live} />
              <RunningDuty
                duty={duty}
                ibis={ibis}
                session={session}
                connected={connected}
                laadt={omsiLaadt}
                busy={busy}
                exam={Boolean(exam)}
                overlayOpen={overlayOpen}
                chauffeur={
                  career?.state
                    ? {
                        personeelsnummer: career.state.personeelsnummer,
                        pincode: career.state.pincode,
                      }
                    : undefined
                }
                onHoofdmenu={() => setScreen("modes")}
                onToggleOverlay={toggleOverlay}
                onApparaat={() => setApparaatOpen(true)}
                onCancel={cancelDuty}
                onFinish={finish}
                full={volledig}
              />
              {/*
                De QR-code hoort ook hier te kunnen: wie zijn iPad pakt terwijl
                hij al rijdt, komt niet meer in het hoofdmenu.
              */}
              {apparaatOpen && (
                <ApparaatDialoog onClose={() => setApparaatOpen(false)} />
              )}
            </>
          }
        />
      </LanguageProvider>
    );
  }

  /*
   * ALLES WAT VOOR HET RIJDEN KOMT.
   *
   * Hieronder stond een voorwaarde -- eerste start, of het profielscherm,
   * of het modusscherm, of de dienstmodus -- en daarachter viel de app terug
   * op een tweede wereld met een glazen zijbalk. Die tweede wereld is weg.
   * Carriere en vrij rijden liepen er nog in: je koos je modus in de nieuwe
   * schermen en stond een klik later in de vorige.
   *
   * Er is nu een reeks, voor elke modus dezelfde. Wat per modus verschilt is
   * de vraag tussen de kaart en de dienst -- niets in dienst, je vergunning
   * in de carriere, de lijn bij vrij rijden -- en dat is een stap, geen
   * ander scherm. Wat daarna komt staat hierboven al: het wagenpark
   * overzetten, en de dienst die loopt.
   */
  {
    const gekozen = selected ?? 0;
    const gekozenDuty = duties[gekozen]?.duty;
    /*
     * De bus die de app zelf zou kiezen staat vooraan; die past het best bij de
     * dienst, en wie iets anders wil scrollt maar. Alle andere bussen blijven
     * staan -- ze passen alleen minder goed, en dat is de keuze van de speler.
     */
    /*
     * Bij de kaart- en lijnstap is er nog geen dienst en dus geen route, maar
     * de kaart hoort er wel te liggen: het scherm belooft dat je op de kaart
     * kiest. Een dienst zonder ritten is genoeg om het wegennet te tekenen.
     */
    const leegOpDeKaart: Duty | undefined = selectedMap && {
      mapFolder: selectedMap.folder,
      mapName: selectedMap.name,
      lineFile: "",
      tourNumber: "",
      depot: "",
      legs: [],
      signOn: 0,
      start: 0,
      end: 0,
      durationMinutes: 0,
      totalStops: 0,
      lineNumbers: [],
      days: 0,
      period: 0,
    };
    const kaartDuty = gekozenDuty ?? leegOpDeKaart;

    /*
     * Welke bussen er op de busstap staan.
     *
     * Bij een dienst zijn dat alle bussen, met de aanbevolen bus vooraan: die
     * past het best, en wie iets anders wil scrollt maar. Bij vrij rijden is er
     * geen dienst om tegen te passen -- daar is de aanbeveling de bus die op
     * deze kaart het meest rondrijdt, en verder staat alles gewoon open.
     */
    const aanbevolenBus =
      mode === "free" ? vrijeTip?.relativePath : vehicle?.relativePath;
    const bussen =
      gekozenDuty || mode === "free"
        ? [...vehicles].sort((a, b) => {
            if (a.relativePath === aanbevolenBus) return -1;
            if (b.relativePath === aanbevolenBus) return 1;
            return busnaam(a).localeCompare(busnaam(b));
          })
        : [];

    /* Welke stap het scherm toont: het profiel- en modusscherm horen erbij. */
    /*
     * De instellingen van OMSI hangen aan de modusstap: daar staat de knop, en
     * daar hoor je weer terug te komen als je klaar bent.
     */
    const opzetStap: Stap =
      eersteStart || screen === "profiles" || screen === "profiel"
        ? "profile"
        : screen === "modes" || screen === "game"
          ? "mode"
          : stap;

    const profielen = career?.profiles ?? [];
    const huidigProfiel = career?.state?.driver ?? "";

    /*
     * De vraag over de aanbevolen bus: alleen op de busstap, alleen als er een
     * aanbeveling is, en alleen zolang de speler er nog niets van gevonden heeft.
     */
    const busSleutel = duty
      ? `${duty.mapFolder}|${duty.tourNumber}|${duty.start}`
      : "";
    const toonBusVraag =
      stap === "bus" &&
      busScherm === "bus" &&
      !busMerk &&
      !confirmed &&
      Boolean(assignment?.vehicle) &&
      busSleutel !== "" &&
      busGevraagd !== busSleutel;

    /* Wat elke tegelweergave op de busstap gemeen heeft. */
    /*
     * Een wagenpark bij deze bus leggen -- vanaf elk busscherm.
     *
     * Dit zat eerst alleen als tegel op de remise, drie schermen diep, en
     * daar vond Luc hem niet: "de hof knop is nogsteeds niet zichtbaar". Een
     * handeling die je zoekt hoort in de knoppenrij te staan, waar hij op elk
     * scherm van de busstap zichtbaar is. Is er een dienst, dan gaat het om de
     * bestemmingen van die dienst; anders om die van de kaart.
     */
    const plaatsWagenpark = (): void => {
      if (hofBezig || !vehicle) return;
      setHofBezig(true);
      const gedaan = duty
        ? window.career.placeHofCandidate(duty, vehicle.folder)
        : window.career.placeHofs(mapFolder, [vehicle.folder]).then((uit) => ({
            placed: uit.placed,
            file: undefined as string | undefined,
          }));
      void gedaan
        .then((uitkomst) => {
          setNote(
            uitkomst.placed > 0
              ? uitkomst.file
                ? t(language, "setup.yardAdded", { file: uitkomst.file })
                : t(language, "setup.hofDone", { count: uitkomst.placed })
              : t(language, "setup.yardAddNone"),
          );
          setHofTeller((n) => n + 1);
        })
        .finally(() => setHofBezig(false));
    };

    const leegBus = {
      koppen: ["", "", ""] as [string, string, string],
      rijen: [] as Rij[],
      index: 0,
      kies: () => {},
      voet: "",
      /*
       * Busplaatjes bijwerken, hier waar de plaatjes staan.
       *
       * Loopt het al, dan staat de stand er in plaats van de knop, met een
       * knop om te stoppen. De tegels krijgen hun foto's ondertussen vanzelf.
       */
      regelaars: (
        <div className="fotosync">
          {busfotoStand?.loopt ? (
            <>
              <span>
                {/* Zolang er nog gekeken wordt is er niets te tellen: geen "0 van 0". */}
                {busfotoStand.totaal > 0
                  ? t(language, "photos.syncBusy", {
                      klaar: busfotoStand.klaar,
                      totaal: busfotoStand.totaal,
                    })
                  : t(language, "photos.looking")}
              </span>
              <button
                type="button"
                onClick={() => void window.career.busfotosStoppen()}
              >
                {t(language, "photos.stop")}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={checking}
              onClick={() => void bijwerkenBusfotos()}
            >
              {t(language, "photos.sync")}
            </button>
          )}
        </div>
      ),
      /* Zie `plaatsWagenpark`: op elk busscherm bereikbaar, niet alleen op de remise. */
      tweede: vehicle
        ? {
            tekst: hofBezig
              ? t(language, "setup.hofBusy")
              : t(language, "setup.yardAdd"),
            onDoen: plaatsWagenpark,
          }
        : undefined,
      /*
       * START neemt de dienst aan en begint hem, in elke modus. Bij vrij rijden
       * is het een dienst die je zelf samenstelde; die telt niet mee in je
       * loopbaan, en gaat mee als je in OMSI een andere omloop kiest.
       */
      verder: drukOpStart,
      knop: t(language, "setup.start"),
    };

    const vel = ((): {
      stap: Stap;
      titel: string;
      onderschrift: string;
      koppen: [string, string, string];
      rijen: Rij[];
      index: number;
      kies: (index: number) => void;
      voet: string;
      verder: () => void;
      knop: string;
      tegels?: Tegel[];
      kruimels?: Kruimel[];
      tweede?: { tekst: string; onDoen: () => void };
      vullend?: boolean;
      keuzeloos?: boolean;
      regelaars?: ReactNode;
      /** Eigen kolommen voor de rijen, als CSS grid-template-columns. */
      kolommen?: string;
      /** Een formulier in plaats van een lijst; alleen de ritstap van vrij rijden. */
      vrij?: ReactNode;
    } => {
      /*
       * De staat van dienst. Hetzelfde vel als de chauffeursstap waar hij aan
       * hangt, met de lijst vervangen door de cijfers; de hoofdknop brengt je
       * terug naar de chauffeurs, want er valt hier niets te kiezen.
       */
      if (opzetStap === "profile" && screen === "profiel") {
        return {
          stap: "profile" as Stap,
          titel: t(language, "prof.title"),
          onderschrift: t(language, "prof.intro"),
          koppen: ["", "", ""] as [string, string, string],
          rijen: [],
          index: 0,
          kies: () => {},
          voet: "",
          verder: () => setScreen("profiles"),
          knop: t(language, "setup.back"),
        };
      }

      if (opzetStap === "profile") {
        /*
         * De eerste start is dezelfde stap zonder chauffeurs. Geen apart
         * welkomstscherm dus: wie de app voor het eerst opent staat gewoon op
         * stap een, met de uitleg erbij en het invulveld al open.
         */
        return {
          stap: "profile" as Stap,
          titel: eersteStart
            ? t(language, "welcome.title")
            : t(language, "setup.driverTitle"),
          onderschrift: eersteStart
            ? t(language, "welcome.intro")
            : t(language, "setup.driverIntro"),
          koppen: [
            t(language, "setup.colDriver"),
            t(language, "setup.colDuties"),
            t(language, "setup.colDriven"),
          ],
          rijen: profielen.map((item) => ({
            id: item.id,
            cellen: [
              item.driver,
              String(item.duties),
              formatDuration(item.minutes, language),
            ] as [string, string, string],
            klok: true,
            actie: {
              label: t(language, "setup.deleteDriver"),
              gevaarlijk: true,
              onDoen: () => {
                if (
                  !window.confirm(
                    t(language, "setup.deleteAsk", { name: item.driver }),
                  )
                )
                  return;
                void window.career.deleteProfile(item.id).then(setCareer);
              },
            },
          })),
          /*
           * Chauffeurs als tegels, net als de kaarten.
           *
           * Luc: "ook het menu van de profiel selectie moet met mooie grote
           * tegels". Een chauffeur is geen rij in een tabel maar een persoon;
           * de initialen in een eigen plaat, de naam eronder, en wat hij
           * gereden heeft erbij. Eén klik kiest, Verder gaat door -- dezelfde
           * afspraak als op de kaartstap, zodat je niet per stap hoeft te leren
           * wat een klik doet.
           *
           * Alleen als er chauffeurs zijn: bij de eerste start staat hier het
           * invulveld en verder niets.
           */
          tegels:
            profielen.length > 0
              ? profielen.map((item) => ({
                  id: item.id,
                  titel: item.driver,
                  monogram: item.driver,
                  /*
                   * Zijn eigen gezicht als hij er een heeft gekozen, anders de
                   * initialen. Het pad gaat nooit door de brug: wat hier staat
                   * is de bestandsnaam uit `<gebruikersgegevens>\profielfotos`,
                   * en het schema laat alleen die map door.
                   *
                   * `v` is het tijdstip waarop de foto er kwam, en het staat er
                   * niet voor de sier: een vervangen foto houdt dezelfde
                   * bestandsnaam, dus zonder dit blijft de URL gelijk en haalt
                   * Chromium niets op. Gemeten in het proefscript: 24x24
                   * vervangen door 96x64 en de tegel toonde nog steeds
                   * `naturalWidth 24`. Het schema kijkt alleen naar het pad, dus
                   * wat erachter hangt raakt het bestand niet.
                   */
                  foto: item.photo
                    ? `omsifoto://chauffeur/${encodeURIComponent(item.photo)}?v=${item.photoAt ?? 0}`
                    : undefined,
                  onder: t(language, "setup.driverTile", {
                    count: item.duties,
                    time: formatDuration(item.minutes, language),
                  }),
                  gekozen: item.driver === huidigProfiel,
                  /*
                   * De handelingen in de hoek, van licht naar zwaar: een foto
                   * kiezen, hem weghalen, en pas daarna de chauffeur zelf. Het
                   * weghalen staat er alleen als er iets weg te halen valt --
                   * een knop die niets doet leert je niets over wat hij doet.
                   */
                  acties: [
                    {
                      label: t(
                        language,
                        item.photo ? "setup.photoChange" : "setup.photoAdd",
                      ),
                      teken: "foto" as const,
                      onDoen: () => {
                        void window.career
                          .chooseProfilePhoto(item.id)
                          .then(setCareer);
                      },
                    },
                    ...(item.photo
                      ? [
                          {
                            label: t(language, "setup.photoRemove"),
                            teken: "fotoweg" as const,
                            onDoen: () => {
                              void window.career
                                .clearProfilePhoto(item.id)
                                .then(setCareer);
                            },
                          },
                        ]
                      : []),
                    {
                      label: t(language, "setup.deleteDriver"),
                      gevaarlijk: true,
                      onDoen: () => {
                        if (
                          !window.confirm(
                            t(language, "setup.deleteAsk", {
                              name: item.driver,
                            }),
                          )
                        )
                          return;
                        void window.career
                          .deleteProfile(item.id)
                          .then(setCareer);
                      },
                    },
                  ],
                  onDoen: () => {
                    void window.career.selectProfile(item.id).then(setCareer);
                  },
                }))
              : undefined,
          index: Math.max(
            0,
            profielen.findIndex((item) => item.driver === huidigProfiel),
          ),
          kies: (index) => {
            const id = profielen[index]?.id;
            if (id) void window.career.selectProfile(id).then(setCareer);
          },
          voet: eersteStart
            ? t(language, "welcome.accountIntro")
            : t(
                language,
                profielen.length === 1
                  ? "setup.driverFootOne"
                  : "setup.driverFoot",
                { count: profielen.length },
              ),
          verder: () => {
            const gekozenProfiel =
              profielen[
                Math.max(
                  0,
                  profielen.findIndex((i) => i.driver === huidigProfiel),
                )
              ];
            if (gekozenProfiel) void chooseProfile(gekozenProfiel.id);
          },
          knop: t(language, "setup.next"),
        };
      }
      if (opzetStap === "mode" && screen === "game") {
        return {
          stap: "mode" as Stap,
          titel: t(language, "cfg.title"),
          onderschrift: t(language, "cfg.intro"),
          koppen: ["", "", ""] as [string, string, string],
          rijen: [],
          index: 0,
          kies: () => {},
          voet: "",
          verder: () => setScreen("modes"),
          knop: t(language, "setup.back"),
        };
      }
      if (opzetStap === "mode") {
        const modi: GameMode[] = ["career", "service", "free"];
        return {
          stap: "mode" as Stap,
          titel: t(language, "setup.modeTitle"),
          onderschrift: t(language, "setup.modeIntro"),
          koppen: [
            t(language, "setup.colMode"),
            t(language, "setup.colLicences"),
            t(language, "setup.colStatus"),
          ],
          rijen: modi.map((naam) => ({
            id: naam,
            cellen: [
              t(language, `mode.${naam}` as const),
              /*
               * Geen streepje waar niets te melden is. Een kolom vol "—" leest
               * als ontbrekende gegevens, terwijl het antwoord gewoon is dat
               * deze modus geen vergunningen kent.
               */
              naam === "career"
                ? String(career?.summary?.licences ?? 0)
                : t(language, "setup.modeNoLicences"),
              active && (active.mode ?? "service") === naam
                ? t(language, "setup.modeRunning")
                : "",
            ] as [string, string, string],
          })),
          index: Math.max(0, modi.indexOf(mode)),
          kies: (index) => setMode(modi[index] ?? "service"),
          /*
           * De voet vertelt wat de aangewezen modus betekent. Het oude scherm
           * zette die uitleg onder elke kaart; hier is maar één regel nodig,
           * want er is er ook maar één aangewezen.
           */
          voet: t(language, `mode.${mode}Intro` as const),
          verder: () => setScreen("drive"),
          knop: t(language, "setup.next"),
        };
      }
      if (stap === "map") {
        /*
         * Dezelfde stap, twee vormen.
         *
         * Een gebruiker stelde tegels met de afbeeldingen van OMSI voor, en
         * daar zit wat in: Hamburg herken je aan de haven, niet aan zijn naam
         * in een regel. Maar wie de kaart al weet, vindt hem sneller in een
         * lijst met het aantal omlopen en het jaar erbij. Dus allebei, met een
         * knop ertussen -- en de stap erna blijft precies wat hij was, want een
         * tegel doet hetzelfde als een regel: hij kiest de kaart en gaat door.
         */
        const gekozenKaart = maps.find((item) => item.folder === mapFolder);
        /*
         * Vrij rijden gaat van de kaart meteen naar de bus. Een kaart waar de
         * bus niet neer kan -- geen tegels, geen dienstregeling, geen plek --
         * houdt hier op, met de reden; anders laadde OMSI straks "garnix".
         */
        const naarVolgende = (): void => {
          if (mode === "free") {
            if (vrijePlek && !vrijePlek.ok) {
              setError(vrijeFout(vrijePlek));
              return;
            }
            setError(undefined);
            setStap("bus");
            return;
          }
          setStap(mode === "career" ? "licence" : "duty");
        };
        /* Wat de voet bij vrij rijden zegt: waar de bus komt te staan, en waarom daar. */
        const vrijVoet = (): string | undefined => {
          if (mode !== "free" || !gekozenKaart) return undefined;
          const map = gekozenKaart.name;
          /*
           * De controle mislukte (de werker gooide een fout): dan niet eeuwig
           * "plek zoeken…", maar wat START in dat geval ook zegt.
           */
          if (!vrijePlek && vrijCheck?.sleutel === vrijSleutel && !vrijCheck.bezig) {
            return t(language, "free.noTimetable", { map });
          }
          if (!vrijePlek) return t(language, "free.mapFootBusy", { map });
          if (!vrijePlek.ok || !vrijePlek.plek) return vrijeFout(vrijePlek);
          const plek = vrijePlek.plek;
          if (plek.bron === "uitrukken" && plek.eerste !== undefined) {
            return t(language, "free.mapFootPullout", {
              map,
              plek: plek.naam,
              tijd: formatTime(plek.eerste),
            });
          }
          if (plek.aantal > 0 && plek.tot !== undefined) {
            return t(language, plek.aantal === 1 ? "free.mapFootOne" : "free.mapFoot", {
              map,
              plek: plek.naam,
              n: plek.aantal,
              tot: formatTime(plek.tot),
            });
          }
          return t(language, "free.mapFootPlain", { map, plek: plek.naam });
        };
        /*
         * Tijd en weer, dichtgeklapt: de meeste spelers willen er niets aan
         * doen. Automatisch is een schooldag door de week uit het tijdvak van de
         * kaart, de klok van de pc, en het weer van de kaart; wat je verzet,
         * verzet ook de plek, en de voet gaat mee.
         */
        const automatisch = !vrijeDatum && !vrijeTijd;
        const datumTekst = vrijePlek?.moment.iso
          ? new Date(`${vrijePlek.moment.iso}T00:00:00Z`).toLocaleDateString(language, {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              timeZone: "UTC",
            })
          : "…";
        const tijdTekst = vrijePlek ? formatTime(vrijePlek.moment.minutes) : vrijeTijd || "…";
        const weerTekst = vrijWeer
          ? t(language, `weather.${vrijWeer}` as const)
          : t(language, "weather.map");
        const wanneer =
          mode === "free" && gekozenKaart ? (
            <details className="vrij-wanneer">
              <summary>
                <b>{t(language, "free.whenTitle")}</b>
                <span>
                  {t(language, automatisch ? "free.whenAuto" : "free.whenOwn", {
                    date: datumTekst,
                    time: tijdTekst,
                    weather: weerTekst,
                  })}
                </span>
              </summary>
              <div className="vrijpaar">
                <label className="vrijveld">
                  <span>{t(language, "free.date")}</span>
                  <input
                    type="date"
                    value={vrijeDatum || vrijePlek?.moment.iso || ""}
                    onChange={(event) => setVrijeDatum(event.target.value)}
                  />
                </label>
                <label className="vrijveld">
                  <span>{t(language, "free.time")}</span>
                  <input
                    type="time"
                    value={vrijeTijd || (vrijePlek ? formatTime(vrijePlek.moment.minutes) : "")}
                    onChange={(event) => setVrijeTijd(event.target.value)}
                  />
                </label>
              </div>
              <div className="regelaar">
                <div className="regelaar-kop">
                  <label>{t(language, "free.weather")}</label>
                </div>
                <div className="regelaar-chips">
                  <button
                    type="button"
                    aria-pressed={!vrijWeer}
                    onClick={() => setVrijWeer(undefined)}
                  >
                    {t(language, "weather.map")}
                  </button>
                  {WEATHER_KINDS.map((soort) => (
                    <button
                      key={soort}
                      type="button"
                      aria-pressed={vrijWeer === soort}
                      onClick={() => setVrijWeer(soort)}
                    >
                      {t(language, `weather.${soort}` as const)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="vrijnoot">{t(language, "free.whenHint")}</p>
              {(!automatisch || vrijWeer) && (
                <button
                  type="button"
                  className="btn secondary vrij-wanneer-terug"
                  onClick={() => {
                    setVrijeDatum("");
                    setVrijeTijd("");
                    setVrijWeer(undefined);
                  }}
                >
                  {t(language, "free.whenReset")}
                </button>
              )}
            </details>
          ) : null;
        const wisselaar = (
          <div
            className="weergavekeuze"
            role="group"
            aria-label={t(language, "setup.viewSwitch")}
          >
            {(["lijst", "tegels"] as const).map((vorm) => (
              <button
                key={vorm}
                type="button"
                aria-pressed={kaartweergave === vorm}
                onClick={() => kiesKaartweergave(vorm)}
              >
                {t(
                  language,
                  vorm === "lijst" ? "setup.viewList" : "setup.viewTiles",
                )}
              </button>
            ))}
          </div>
        );
        return {
          stap: "map",
          titel: t(language, "setup.mapTitle"),
          /*
           * Bovenin staat welke kaart het is.
           *
           * Op een tegel is de naam klein en ligt hij onder een foto die zelf
           * al een naam draagt -- "Hamburg Tag & Nacht" staat op drie foto's,
           * en welke van de drie je nu hebt is dan niet te zien. Zodra er een
           * kaart gekozen is, zegt de kop welke, met het aantal omlopen en het
           * jaar erbij. Zonder keuze staat de vraag er nog.
           */
          onderschrift: gekozenKaart
            ? `${gekozenKaart.name} · ${t(language, "setup.mapTile", {
                count: gekozenKaart.tours,
                year: gekozenKaart.year,
              })}`
            : t(language, "setup.mapIntro"),
          regelaars: wanneer ? (
            <>
              {wisselaar}
              {wanneer}
            </>
          ) : (
            wisselaar
          ),
          tegels:
            kaartweergave === "tegels"
              ? maps.map((item) => ({
                  id: item.folder,
                  titel: item.name,
                  /* De afbeelding die OMSI zelf bij de kaart heeft staan. */
                  beeld: `omsikaart://kaart/${encodeURIComponent(item.folder)}`,
                  onder: t(language, "setup.mapTile", {
                    count: item.tours,
                    year: item.year,
                  }),
                  gekozen: item.folder === mapFolder,
                  /*
                   * Een tegel kiest de kaart, en verder niets.
                   *
                   * Luc: "mensen klikken een map aan en dan op verder, daarna
                   * pas kaart overzicht en lijnen". Het rooster blijft dus vol
                   * in beeld -- de foto's zijn het scherm -- en wat die kaart
                   * is staat bovenin. Het overzicht met het net komt bij de
                   * stap erna, waar het altijd al stond.
                   */
                  onDoen: () => {
                    setMapFolder(item.folder);
                    /* Vrij rijden: een weigering van VERDER hoort bij de vorige kaart. */
                    if (mode === "free") setError(undefined);
                  },
                }))
              : undefined,
          koppen: [
            t(language, "setup.colMap"),
            t(language, "setup.colTours"),
            t(language, "setup.colYear"),
          ],
          rijen: maps.map((item) => ({
            id: item.folder,
            cellen: [item.name, String(item.tours), String(item.year)] as [
              string,
              string,
              string,
            ],
          })),
          index: Math.max(
            0,
            maps.findIndex((item) => item.folder === mapFolder),
          ),
          kies: (index) => {
            setMapFolder(maps[index]?.folder ?? "");
            /*
             * Vrij rijden: VERDER weigerde bij de vorige kaart (Wenen: "deze
             * kaart is onvolledig"). Die melding bleef in de voet staan bij een
             * kaart die wel kan, in plaats van waar de bus komt (nakijken 28-09).
             */
            if (mode === "free") setError(undefined);
          },
          voet:
            checked ??
            vrijVoet() ??
            t(language, "setup.mapFoot", { count: maps.length }),
          /*
           * Opnieuw kijken wat er staat.
           *
           * Een kaart of een bus installeer je door een map neer te zetten, en
           * de app leest die mappen alleen bij het starten. Deze knop stond in
           * de balk van de oude schermen; hij hoort bij de kaartstap, want daar
           * staat de lijst die eruit komt. Wat het opleverde komt in de voet te
           * staan, op de plek waar toch al staat hoeveel kaarten er zijn.
           */
          tweede: {
            tekst: t(language, checking ? "check.busy" : "check.button"),
            onDoen: () => {
              if (checking) return;
              void checkInstalled();
            },
          },
          /*
           * Waar de kaart op uitkomt verschilt per modus: in dienst meteen op
           * de dienstenlijst, in carriere op je vergunningen, en bij vrij
           * rijden op de lijn.
           */
          verder: naarVolgende,
          knop: t(language, "setup.next"),
        };
      }
      if (stap === "bus") {
        const ontleed = bussen.map((bus) => ({ bus, ...ontleedBus(bus) }));

        /*
         * De bus die de app zelf zou kiezen: die past het best bij de dienst.
         * Hij wordt nergens opgedrongen -- je kunt gewoon een ander merk
         * aanklikken -- maar hij hoort wel te zien te zijn op elk niveau,
         * anders moet je drie schermen diep zoeken naar wat de app bedoelde.
         */
        /*
         * Wat er voor deze ene bus te halen valt. Uit het kaartbrede overzicht en
         * niet uit `busAanbod`: dat laatste verdwijnt zodra je het venstertje hebt
         * weggeklikt, en de tegel hoort te blijven staan.
         */
        /*
         * Het aanbod voor deze dienst gaat voor: dat gaat over de bestemmingen die
         * op het scherm staan. Is daar niets, dan blijft het kaartbrede aanbod over
         * -- dat helpt je op de volgende dienst van dezelfde kaart.
         */
        const busHofAanbod = vehicle
          ? (ritAanbod ??
            hofAanbod.find((item) => item.folder === vehicle.folder))
          : undefined;

        const tipBus = mode === "free" ? vrijeTip : assignment?.vehicle;
        const beste = tipBus ? ontleedBus(tipBus) : undefined;
        const nuGekozen =
          vehicleOverride ||
          (mode === "free" ? vrijeTip?.relativePath : vehicle?.relativePath);
        const gekozenOntleed = nuGekozen
          ? ontleed.find((item) => item.bus.relativePath === nuGekozen)
          : undefined;
        /** Het onderschrift van een tegel, met de aanbeveling erachter. */
        const metTip = (tekst: string, isBeste: boolean): string =>
          isBeste ? `${tekst} · ${t(language, "setup.yardSuggested")}` : tekst;

        /*
         * Het hof-bestand bepaalt welke eindbestemmingen op het matrixbord
         * kunnen staan. Het hoort bij de bus omdat je het daar instelt, maar
         * het is een eigen keuze -- vandaar een eigen rooster achter een knop
         * in plaats van een vierde niveau in de bus zelf.
         */
        /*
         * Niveau vier: de kleurstelling, wat OMSI "Appearance" noemt.
         *
         * Alfabetisch, zoals OMSI ze in zijn eigen venster toont; het nummer
         * dat OMSI telt is een andere volgorde, en dat regelt het hoofdproces
         * (zie core/kleurstelling.ts). Vooraan "Standaard": dan zet de app
         * niets en kiest OMSI zelf. Elke tegel krijgt de bus in die kleuren,
         * getekend met de texturen van de kleurstelling.
         */
        const kleurLijst = kleurBus ? kleurLijsten[kleurBus] : undefined;
        const kleurItem = kleurBus
          ? ontleed.find((item) => item.bus.relativePath === kleurBus)
          : undefined;
        if (busScherm === "kleur" && kleurBus && kleurLijst && kleurItem) {
          const namen = kleurLijst.lijst
            .map((item) => item.naam)
            .sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: "base" }),
            );
          for (const naam of namen) vraagBusfoto(kleurBus, naam);
          const gekozenKleur =
            busKleur?.pad === kleurBus ? busKleur.naam : undefined;
          return {
            ...leegBus,
            regelaars: undefined,
            stap: "bus" as Stap,
            titel: kleurItem.uitvoering,
            onderschrift: t(language, "setup.busPickPaint", {
              aantal: namen.length,
            }),
            kruimels: [
              {
                label: t(language, "setup.busTitle"),
                onDoen: () => {
                  setBusScherm("bus");
                  setBusMerk(undefined);
                  setBusType(undefined);
                },
              },
              {
                label: kleurItem.merk,
                onDoen: () => {
                  setBusScherm("bus");
                  setBusMerk(kleurItem.merk);
                  setBusType(undefined);
                },
              },
              {
                label: kleurItem.type,
                onDoen: () => {
                  setBusScherm("bus");
                  setBusMerk(kleurItem.merk);
                  setBusType(kleurItem.type);
                },
              },
              { label: kleurItem.uitvoering },
            ],
            tegels: [
              {
                id: "__standaard",
                titel: t(language, "setup.paintDefault"),
                onder:
                  kleurItem.bus.paint || t(language, "setup.paintDefaultSub"),
                beeld: busFotos[kleurBus],
                vorm: busvorm(kleurItem.type + " " + kleurItem.uitvoering),
                gekozen: !gekozenKleur,
                acties: bus3dAan
                  ? [
                      {
                        label: t(language, "bv.open3d"),
                        teken: "3d" as const,
                        altijd: true,
                        ingedrukt:
                          bus3dInBeeld?.pad === kleurBus && !bus3dInBeeld.kleur,
                        onDoen: () => open3d(kleurItem.bus, undefined, true),
                      },
                    ]
                  : undefined,
                onDubbel: bus3dAan
                  ? () => open3d(kleurItem.bus, undefined, true)
                  : undefined,
                onDoen: () => {
                  setBusKleur(undefined);
                  setBusScherm("hof");
                },
              },
              ...namen.map((naam) => ({
                id: naam,
                titel: naam,
                onder: kleurItem.uitvoering,
                beeld: busFotos[`${kleurBus}|${naam}`],
                vorm: busvorm(kleurItem.type + " " + kleurItem.uitvoering),
                gekozen: gekozenKleur === naam,
                acties: bus3dAan
                  ? [
                      {
                        label: t(language, "bv.open3d"),
                        teken: "3d" as const,
                        altijd: true,
                        ingedrukt:
                          bus3dInBeeld?.pad === kleurBus &&
                          bus3dInBeeld.kleur === naam,
                        onDoen: () => open3d(kleurItem.bus, naam, true),
                      },
                    ]
                  : undefined,
                onDubbel: bus3dAan
                  ? () => open3d(kleurItem.bus, naam, true)
                  : undefined,
                onDoen: () => {
                  setBusKleur({ pad: kleurBus, naam });
                  setBusScherm("hof");
                },
              })),
            ],
          };
        }

        if (busScherm === "hof") {
          /*
           * De app heeft de remise al gekozen -- `yardOverride` leeg betekent
           * "neem de best passende". Dit scherm laat alleen zien welke dat is
           * en staat toe hem te wijzigen; niemand hoeft hier iets te doen.
           */
          return {
            ...leegBus,
            // Over het hof-bestand, niet over plaatjes: de knop hoort hier niet.
            regelaars: undefined,
            stap: "bus" as Stap,
            titel: t(language, "setup.yardTitle"),
            onderschrift: t(language, "setup.yardIntro"),
            kruimels: [
              {
                label: t(language, "setup.busTitle"),
                onDoen: () => {
                  setBusScherm("bus");
                  setBusMerk(undefined);
                  setBusType(undefined);
                },
              },
              ...(busMerk
                ? [
                    {
                      label: busMerk,
                      onDoen: () => {
                        setBusScherm("bus");
                        setBusType(undefined);
                      },
                    },
                  ]
                : []),
              ...(busType
                ? [{ label: busType, onDoen: () => setBusScherm("bus") }]
                : []),
              ...(kleurBus && kleurLijst && kleurBus === vehicle?.relativePath
                ? [
                    {
                      label:
                        busKleur?.pad === kleurBus
                          ? busKleur.naam
                          : t(language, "setup.paintDefault"),
                      onDoen: () => setBusScherm("kleur"),
                    },
                  ]
                : []),
              { label: t(language, "setup.yardTitle") },
            ],
            tegels: [
              ...yards.map((optie) => ({
                id: optie.name,
                titel: optie.name,
                onder:
                  t(language, "setup.yardKnows", {
                    known: optie.known,
                    total: optie.total,
                  }) +
                  (optie.suggested
                    ? ` · ${t(language, "setup.yardSuggested")}`
                    : ""),
                icoon: "hof" as const,
                gekozen:
                  (yardOverride || yards.find((y) => y.suggested)?.name) ===
                  optie.name,
                onDoen: () => setYardOverride(optie.name),
              })),
              /*
               * En er een bij halen.
               *
               * Dit zat alleen achter het venstertje dat de app uit zichzelf
               * toont. Wie dat wegklikte -- of wie later bedenkt dat hij het
               * toch wil -- kwam er niet meer bij, terwijl het bestand er nog
               * net zo goed naast gezet kan worden. Het staat er alleen als er
               * werkelijk iets te halen valt: een tegel die niets doet is erger
               * dan geen tegel.
               */
              /*
               * En er een bij leggen -- altijd.
               *
               * Deze tegel hing eerst aan een aanbod: alleen als de rekensom
               * vond dat er iets te winnen viel, stond hij er. Luc stond op dit
               * scherm met dertien wagenparken die allemaal "0 van 2
               * bestemmingen" zeiden en geen enkele knop. Nu staat hij er
               * altijd zodra er een bus en een dienst zijn; valt er werkelijk
               * niets te halen, dan staat hij er uitgeschakeld met de reden
               * erbij. Dat is duidelijker dan een knop die er soms wel en soms
               * niet is.
               */
              ...(vehicle && duty
                ? [
                    {
                      id: "__nieuw__",
                      titel: t(language, "setup.yardAdd"),
                      onder: hofBezig
                        ? t(language, "setup.hofBusy")
                        : ritKandidaat
                          ? t(language, "setup.yardAddFrom", {
                              file: ritKandidaat.file,
                              matched: ritKandidaat.matched,
                            })
                          : busHofAanbod
                            ? t(language, "setup.yardAddFrom", {
                                file: busHofAanbod.offerFile ?? "",
                                matched: busHofAanbod.offerMatched ?? 0,
                              })
                            : t(language, "setup.yardAddNone"),
                      icoon: "hof" as const,
                      /* Al aanwezig of niets gevonden: dan is er niets te doen. */
                      uit: ritKandidaat?.alAanwezig
                        ? t(language, "setup.yardAddHave", {
                            file: ritKandidaat.file,
                          })
                        : ritKandidaat || busHofAanbod
                          ? undefined
                          : t(language, "setup.yardAddNone"),
                      onDoen: () => {
                        if (hofBezig) return;
                        setHofBezig(true);
                        void window.career
                          .placeHofCandidate(duty, vehicle.folder)
                          .then((result) => {
                            setNote(
                              result.placed > 0 && result.file
                                ? t(language, "setup.yardAdded", {
                                    file: result.file,
                                  })
                                : t(language, "setup.yardAddNone"),
                            );
                            /*
                             * De lijst wagenparken van deze bus opnieuw ophalen;
                             * er ligt er nu een bij, en die hoort meteen naast
                             * de andere te staan.
                             */
                            setHofTeller((n) => n + 1);
                          })
                          .finally(() => setHofBezig(false));
                      },
                    },
                  ]
                : []),
            ],
          };
        }

        /* Niveau een: de merken, met hoeveel bussen er onder hangen. */
        if (!busMerk) {
          const merken = new Map<string, number>();
          for (const item of ontleed)
            merken.set(item.merk, (merken.get(item.merk) ?? 0) + 1);
          return {
            ...leegBus,
            stap: "bus" as Stap,
            titel: t(language, "setup.busTitle"),
            onderschrift: t(language, "setup.busIntro"),
            kruimels: [{ label: t(language, "setup.busTitle") }],
            /*
             * Alleen als er werkelijk iets te halen valt. Staat alles goed, dan
             * hoort hier niets te staan: een knop die niets doet is erger dan
             * geen knop.
             */
            tweede:
              hofAanbod.length > 0
                ? {
                    tekst: t(language, "setup.hofOffer", {
                      count: hofAanbod.length,
                    }),
                    onDoen: () => setBusScherm("overzetten"),
                  }
                : undefined,
            tegels: [...merken.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([merk, aantal]) => ({
                id: merk,
                titel: merk,
                onder: metTip(
                  t(
                    language,
                    aantal === 1 ? "setup.busCountOne" : "setup.busCount",
                    {
                      count: aantal,
                    },
                  ),
                  merk === beste?.merk,
                ),
                monogram: merk,
                gekozen: merk === gekozenOntleed?.merk,
                onDoen: () => {
                  setBusScherm("bus");
                  setBusMerk(merk);
                },
              })),
          };
        }

        /* Niveau twee: de types van dat merk. */
        if (!busType) {
          const types = new Map<string, number>();
          for (const item of ontleed) {
            if (item.merk !== busMerk) continue;
            types.set(item.type, (types.get(item.type) ?? 0) + 1);
          }
          return {
            ...leegBus,
            stap: "bus" as Stap,
            titel: busMerk,
            onderschrift: t(language, "setup.busPickType"),
            kruimels: [
              {
                label: t(language, "setup.busTitle"),
                onDoen: () => setBusMerk(undefined),
              },
              { label: busMerk },
            ],
            tegels: [...types.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([type, aantal]) => ({
                id: type,
                titel: type,
                onder: metTip(
                  t(
                    language,
                    aantal === 1 ? "setup.busCountOne" : "setup.busCount",
                    {
                      count: aantal,
                    },
                  ),
                  busMerk === beste?.merk && type === beste?.type,
                ),
                vorm: busvorm(busMerk + " " + type),
                gekozen:
                  busMerk === gekozenOntleed?.merk &&
                  type === gekozenOntleed?.type,
                onDoen: () => {
                  setBusScherm("bus");
                  setBusType(type);
                },
              })),
          };
        }

        /* Niveau drie: de uitvoeringen, en daar kies je er echt een. */
        const uitvoeringen = ontleed.filter(
          (item) => item.merk === busMerk && item.type === busType,
        );
        /*
         * De foto's erbij vragen zodra dit scherm er is. Eén tegelijk, achter
         * elkaar; het hoofdproces zet ze in de rij en bewaart ze op schijf.
         */
        for (const item of uitvoeringen) {
          vraagBusfoto(item.bus.relativePath);
          // De lijst met kleurstellingen alvast, voor het aantal op de tegel.
          if (!gevraagdeKleuren.current.has(item.bus.relativePath)) {
            void vraagKleurstellingen(item.bus.relativePath);
          }
        }
        return {
          ...leegBus,
          stap: "bus" as Stap,
          titel: busType,
          onderschrift: t(language, "setup.busPickTrim"),
          kruimels: [
            {
              label: t(language, "setup.busTitle"),
              onDoen: () => {
                setBusMerk(undefined);
                setBusType(undefined);
              },
            },
            { label: busMerk, onDoen: () => setBusType(undefined) },
            { label: busType },
          ],
          tegels: uitvoeringen.map((item) => ({
            id: item.bus.relativePath,
            titel: item.uitvoering,
            onder: metTip(
              kleurLijsten[item.bus.relativePath]
                ? t(language, "setup.paintCount", {
                    aantal:
                      kleurLijsten[item.bus.relativePath]?.lijst.length ?? 0,
                  })
                : item.bus.paint,
              item.bus.relativePath === assignment?.vehicle?.relativePath,
            ),
            /*
             * De bus zelf op de tegel.
             *
             * Op dit niveau verschillen de uitvoeringen vaak alleen in hun
             * kleurstelling -- `MB_C2_EN_BVG` heeft er 85 -- en dan kies je uit
             * namen die je uit elkaar moet pluizen. De app tekent de bus uit
             * zijn eigen model; tot dat plaatje er is blijft het icoon staan.
             */
            beeld: busFotos[item.bus.relativePath],
            vorm: busvorm(item.type + " " + item.uitvoering),
            gekozen:
              (vehicleOverride || vehicle?.relativePath) ===
              item.bus.relativePath,
            /* De 3D-knop en de dubbelklik (bus3d-ontwerp §8.1), alleen met de schakelaar. */
            acties: bus3dAan
              ? [
                  {
                    label: t(language, "bv.open3d"),
                    teken: "3d" as const,
                    altijd: true,
                    ingedrukt: bus3dInBeeld?.pad === item.bus.relativePath,
                    onDoen: () => open3d(item.bus, undefined, false),
                  },
                ]
              : undefined,
            onDubbel: bus3dAan
              ? () => open3d(item.bus, undefined, false)
              : undefined,
            onDoen: () => {
              /*
               * De bus vastleggen. Heeft hij kleurstellingen, dan eerst die
               * keuze, zoals "Appearance" in OMSI; anders meteen door naar de
               * remise, het laatste dat nog kan verschillen.
               */
              const pad = item.bus.relativePath;
              setVehicleOverride(pad);
              setBusKleur((oud) => (oud?.pad === pad ? oud : undefined));
              void vraagKleurstellingen(pad).then((lijst) => {
                if (lijst && lijst.lijst.length > 0) {
                  setKleurBus(pad);
                  setBusScherm("kleur");
                } else {
                  setKleurBus(undefined);
                  setBusScherm("hof");
                }
              });
            },
          })),
        };
      }

      /*
       * DE VERGUNNINGSTAP -- alleen in de carriere.
       *
       * Hier kies je geen lijn om te rijden: dat doet de remise, en die kijkt
       * naar waar je een vergunning voor hebt. Wat je hier wel doet is zien wat
       * je mag, en er een lijn bij halen. Dat laatste is een examen, en dat is
       * het tweede gezicht van deze stap -- geen apart scherm, want het gaat
       * over dezelfde vraag.
       *
       * Wie nog nergens een vergunning heeft krijgt dat tweede gezicht meteen:
       * zonder rijexamen valt er niets te rijden, dus is er ook niets te tonen
       * behalve de weg daarheen.
       */
      if (stap === "licence") {
        const vergunningen = career?.state?.licences ?? [];
        const hier = vergunningen.filter(
          (item) => item.mapFolder === mapFolder,
        );
        const teLeren = lines.filter(
          (lijn) => !hier.some((item) => item.lineFile === lijn.lineFile),
        );
        // Een vergunning waar dan ook betekent: het rijexamen is gehaald.
        const gekwalificeerd = vergunningen.length > 0;
        const examenNu = examenScherm || !gekwalificeerd || hier.length === 0;
        const examenKeuze =
          teLeren.find((lijn) => lijn.lineFile === examenLijn) ?? teLeren[0];

        if (examenNu) {
          return {
            stap: "licence" as Stap,
            titel: t(
              language,
              gekwalificeerd ? "exam.lineTitle" : "exam.title",
            ),
            onderschrift: t(
              language,
              gekwalificeerd ? "exam.lineIntro" : "exam.intro",
            ),
            koppen: [
              t(language, "setup.colLine"),
              t(language, "setup.colTrips"),
              t(language, "setup.colAverage"),
            ],
            rijen: teLeren.map((lijn) => ({
              id: lijn.lineFile,
              cellen: [
                lijn.lineNumbers.join(", ") || lijn.lineFile,
                String(lijn.trips),
                formatDuration(lijn.averageMinutes, language),
              ] as [string, string, string],
              klok: true,
            })),
            index: Math.max(
              0,
              teLeren.findIndex(
                (lijn) => lijn.lineFile === examenKeuze?.lineFile,
              ),
            ),
            kies: (index) => setExamenLijn(teLeren[index]?.lineFile ?? ""),
            /*
             * Waar je op beoordeeld wordt, in een regel. De oude wereld zette
             * daar een lijstje van vier voor; dat is hetzelfde vier keer zo
             * groot gezegd, en het staat boven een lijst die de aandacht nodig
             * heeft.
             */
            voet:
              teLeren.length === 0
                ? t(language, "setup.examNone", {
                    map: selectedMap?.name ?? "",
                  })
                : t(language, "setup.examFoot", {
                    delay: EXAM_LIMITS.delayMinutes,
                  }),
            /*
             * Terug naar je vergunningen -- maar alleen als je er hier hebt.
             * Wie nog niets heeft, kan nergens heen terug.
             */
            tweede:
              gekwalificeerd && hier.length > 0
                ? {
                    tekst: t(language, "pick.cancel"),
                    onDoen: () => setExamenScherm(false),
                  }
                : undefined,
            verder: () => {
              if (!examenKeuze || busy) return;
              void doeExamen(examenKeuze, !gekwalificeerd);
            },
            knop: t(language, busy ? "exam.searching" : "exam.start"),
          };
        }

        return {
          stap: "licence" as Stap,
          titel: t(language, "setup.licTitle"),
          onderschrift: t(language, "setup.licIntro"),
          koppen: [
            t(language, "setup.colLine"),
            t(language, "setup.colSince"),
            t(language, "setup.colKind"),
          ],
          /*
           * Geen keuze maar een overzicht: de dienst loopt over al je lijnen
           * heen, dus er valt er geen een aan te wijzen. Vandaar `keuzeloos` --
           * een bolletje zou een keuze beloven die er niet is.
           */
          keuzeloos: true,
          rijen: hier.map((item) => ({
            id: `${item.mapFolder}|${item.lineFile}`,
            cellen: [
              item.lineNumbers.join(", ") || item.lineFile,
              item.earnedAt.slice(0, 10),
              t(
                language,
                item.basic ? "setup.licKindBasic" : "setup.licKindLine",
              ),
            ] as [string, string, string],
          })),
          index: 0,
          kies: () => {},
          voet: t(
            language,
            hier.length === 0
              ? "setup.licFootNone"
              : hier.length === 1
                ? "setup.licFootOne"
                : "setup.licFoot",
            { count: hier.length, map: selectedMap?.name ?? "" },
          ),
          tweede:
            teLeren.length > 0
              ? {
                  tekst: t(language, "setup.licLearn"),
                  onDoen: () => {
                    setExamenLijn("");
                    setExamenScherm(true);
                  },
                }
              : undefined,
          /*
           * De remise zoekt er een dienst bij, over al je lijnen heen. Dezelfde
           * aanroep als in dienst; het verschil zit in `generate`, dat in de
           * carriere alleen de vergunde lijnen meegeeft.
           */
          verder: () => {
            if (duties.length > 0) setStap("duty");
            else void generate().then(() => setStap("duty"));
          },
          knop: t(language, "setup.next"),
        };
      }

      return {
        stap: "duty",
        titel: `${t(language, "setup.duties")}${gekozenDuty ? ` · ${gekozenDuty.lineNumbers[0] ?? ""}` : ""}`,
        onderschrift: t(language, "setup.pick"),
        /*
         * De dienstgenerator wandelt door het rittennet en geeft juist voorrang
         * aan een andere lijn -- zie `appetite` in core/duty.ts. Maar hoe lang
         * hij mag worden en op welk dagdeel, dat zeg jij. Die twee knoppen
         * stonden alleen in de oude schermen; daardoor draaide hij hier altijd
         * op anderhalf uur, hele dag.
         */
        regelaars: (
          <>
            <div className="regelaar">
              <div className="regelaar-kop">
                <label htmlFor="dienstlengte">
                  {t(language, "app.length")}
                </label>
                <span className="regelaar-waarde">
                  {formatDuration(LENGTHS[lengthIndex], language)}
                </span>
              </div>
              <input
                id="dienstlengte"
                type="range"
                min={0}
                max={LENGTHS.length - 1}
                value={lengthIndex}
                disabled={confirmed}
                onChange={(event) => setLengthIndex(Number(event.target.value))}
              />
            </div>

            <div className="regelaar">
              <div className="regelaar-kop">
                <label>{t(language, "app.daypart")}</label>
              </div>
              <div className="regelaar-chips">
                {(
                  Object.keys(TIME_WINDOWS) as Array<DutyRequest["window"]>
                ).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={timeWindow === key}
                    disabled={confirmed}
                    onClick={() => setTimeWindow(key)}
                  >
                    {t(language, `window.${key}` as const)}
                  </button>
                ))}
              </div>
            </div>
          </>
        ),
        koppen: [
          t(language, "setup.departure"),
          t(language, "setup.arrival"),
          t(language, "setup.duration"),
        ],
        rijen: duties.map((item, index) => ({
          id: `${item.duty.tourNumber}-${item.duty.start}-${index}`,
          cellen: [
            formatTime(item.duty.start),
            formatTime(item.duty.end),
            formatDuration(item.duty.durationMinutes, language),
          ] as [string, string, string],
          klok: true,
          /*
           * En wat je in die dienst gaat doen. Alleen bij de regel die je
           * aanwijst -- acht van deze blokken tegelijk is geen lijst meer.
           */
          detail: <Dienstoverzicht duty={item.duty} />,
        })),
        index: gekozen,
        kies: setSelected,
        voet: t(
          language,
          duties.length === 1 ? "setup.availableOne" : "setup.available",
          { line: gekozenDuty?.lineNumbers[0] ?? "", count: duties.length },
        ),
        /*
         * Er komt elke keer iets anders uit -- de dienst wordt uit de
         * dienstregeling gelopen en die wandeling is toevallig. Dus een knop om
         * opnieuw te laten zoeken, met dezelfde vraag: bevalt dit rooster niet,
         * dan haal je een ander.
         */
        tweede: {
          tekst: t(language, busy ? "setup.searching" : "setup.regenerate"),
          onDoen: () => {
            if (busy || confirmed) return;
            void generateRef.current?.(lineFile || undefined);
          },
        },
        verder: () => setStap("bus"),
        knop: t(language, "setup.next"),
      };
    })();

    return (
      <LanguageProvider language={language}>
        {/* Boven het vel, zodat hij een stapwissel overleeft; zie Busrit.tsx. */}
        {busrit > 0 && <Busrit key={busrit} opKlaar={() => setBusrit(0)} />}
        <Setup
          stap={opzetStap}
          lijn={gekozenDuty?.lineNumbers[0] ?? gekozenDuty?.legs[0]?.lineNumber}
          titel={vel.titel}
          onderschrift={vel.onderschrift}
          koppen={vel.koppen}
          rijen={vel.rijen}
          gekozen={vel.index}
          onKies={vel.kies}
          /*
           * Wat er misging gaat voor wat er te melden valt, en dat gaat voor de
           * gewone toelichting. Dit stond in de oude wereld in een kaartje
           * onderaan het scherm; dat kaartje is weg, en zonder deze regel werd
           * "geen dienst gevonden van deze lengte" wel uitgerekend maar nergens
           * gezegd -- je zag een lege lijst en verder niets.
           */
          voet={error ?? note ?? vel.voet}
          voetFout={Boolean(error)}
          duty={kaartDuty}
          /*
           * Op de kaartstap is er nog geen dienst; dan tekent het vel het net
           * van de kaart die je aanwijst.
           */
          netkaart={opzetStap === "map" && mapFolder ? mapFolder : undefined}
          /*
           * Vrij rijden: de bus op de plek die de app koos, als marker. Er is
           * nog geen route; die komt als de speler in OMSI een omloop kiest.
           */
          navigatie={
            mode === "free" &&
            (opzetStap === "map" || opzetStap === "bus") &&
            vrijePlek?.ok &&
            vrijePlek.plek
              ? {
                  routeMode: "none",
                  vehicle: {
                    x: vrijePlek.plek.x,
                    y: vrijePlek.plek.y,
                    heading: vrijePlek.plek.heading,
                    speedKmh: 0,
                  },
                }
              : undefined
          }
          onStart={() => {
            setBusrit((nu) => nu + 1);
            vel.verder();
          }}
          startTekst={vel.knop}
          bezig={busy}
          stappen={
            mode === "career"
              ? STAPPEN_CARRIERE
              : mode === "free"
                ? STAPPEN_VRIJ
                : STAPPEN_DIENST
          }
          tegels={vel.tegels}
          kruimels={vel.kruimels}
          vullend={vel.vullend}
          keuzeloos={vel.keuzeloos}
          regelaars={vel.regelaars}
          kolommen={vel.kolommen}
          /*
           * Twee dingen die je moet weten voordat je op START drukt, en dus op
           * de busstap: dat OMSI op volledig scherm stond -- dan ligt de
           * overlay over een spel dat het scherm exclusief opeist en kan het
           * beeld zwart blijven -- en dat er iets met de plugin is. Ze stonden
           * allebei in de oude wereld en hadden hier geen plek meer.
           */
          waarschuwing={
            /*
             * Het draaiende spel telt hier alleen mee waar zijn regel ook echt
             * verschijnt, dus niet bij vrij rijden. Stond het er los in, dan
             * gaf een draaiend OMSI bij vrij rijden een leeg rood kader.
             *
             * En alleen als het vel ook echt de busstap toont, net als bij het
             * venster over het wagenpark hieronder. `stap` blijft de hele
             * dienst op "bus" staan, en dit vel toont ook de instellingen, de
             * chauffeurs en de staat van dienst: die kregen tijdens een lopende
             * dienst de waarschuwing over volledig scherm of "OMSI draait al"
             * erboven. `opzetStap` is alleen "bus" op `screen === "drive"`.
             */
            opzetStap === "bus" &&
            (omsiDraaitAl ||
              schermmodus === "volledig" ||
              plugin?.error ||
              plugin?.changed ||
              bus3dWeg) ? (
              <>
                {/* Het 3D-venster ging onverwacht dicht; de tegels werken gewoon door (§9). */}
                {bus3dWeg && <p>{t(language, "bv.windowFailed")}</p>}
                {/*
                  Draait het spel al, dan heeft klaarzetten geen zin en wordt
                  START een vraag in plaats van een start. Dat hoort hier te
                  staan en niet pas in het venstertje zelf.
                */}
                {omsiDraaitAl && (
                  <p>
                    {/*
                      Bij vrij rijden schrijft START dan alleen de situatie;
                      de speler laadt hem in OMSI zelf. Dit staat er vóór
                      START, dus nog niet "staat klaar" (free.readyRunning).
                    */}
                    {mode === "free"
                      ? t(language, "free.runningHint", {
                          map: selectedMap?.name ?? "",
                        })
                      : t(language, "app.omsiDraaitAl")}
                  </p>
                )}
                {schermmodus === "volledig" && (
                  <>
                    <p>
                      {t(
                        language,
                        inVenster ? "app.fullscreenFixed" : "app.fullscreen",
                      )}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={inVenster}
                        onChange={(event) => {
                          const aan = event.target.checked;
                          setInVenster(aan);
                          void window.career.saveSettings({
                            windowedOmsi: aan,
                          });
                        }}
                      />
                      {t(language, "app.windowed")}
                    </label>
                  </>
                )}
                {plugin?.error && (
                  <p>
                    {t(language, "app.pluginError", { error: plugin.error })}
                  </p>
                )}
                {plugin?.changed && !plugin.error && (
                  <p>{t(language, "app.pluginUpdated")}</p>
                )}
              </>
            ) : undefined
          }
          dialoog={
            /*
             * Eerst de vraag over de bus zelf, en pas daarna die over het
             * wagenpark: twee vensters tegelijk is er een te veel, en de tweede
             * gaat over een keuze die de eerste nog moet maken. De vraag over
             * een draaiend OMSI gaat voor allebei: die komt op het moment dat je
             * op START drukt, en dan zijn de andere twee al beantwoord.
             */
            draaitVraag ? (
              <DraaitDialog
                kaart={kaartDuty?.mapName ?? selectedMap?.name ?? ""}
                bezig={busy}
                onTerug={() => setDraaitVraag(false)}
                onMeerijden={() => {
                  setDraaitVraag(false);
                  void startAlles(true);
                }}
                onKlaarzetten={() => {
                  setDraaitVraag(false);
                  void startAlles();
                }}
              />
            ) : toonBusVraag && assignment?.vehicle && duty ? (
              <BusDialog
                bus={`${assignment.vehicle.manufacturer} ${assignment.vehicle.type}`.trim()}
                fit={assignment.fit}
                yard={assignment.yard}
                onZelf={() => setBusGevraagd(busSleutel)}
                onDoorgaan={() => {
                  setBusGevraagd(busSleutel);
                  /*
                   * De remise erachteraan: dat is het laatste dat nog kan
                   * verschillen, en hij staat al goed -- je ziet hem dus vooral
                   * om te weten dat hij klopt.
                   */
                  setVehicleOverride(assignment.vehicle!.relativePath);
                  setBusScherm("hof");
                }}
              />
            ) : /*
               * Alleen op de stappen van de opzet. Dit vel toont ook de
               * instellingen, de chauffeurs en de staat van dienst, en die zijn
               * ook bereikbaar terwijl een dienst loopt. Na een herstart is
               * `hofGevraagd` weer leeg, en dan vroeg dit venster bij het openen
               * van de instellingen om een wagenpark in de busmap te zetten --
               * met het spel open. Een lopende dienst op `screen === "drive"`
               * heeft zijn eigen vel hierboven, dus hier rijdt er dan niets.
               */
              screen === "drive" && busAanbod && vehicle && duty ? (
              <HofDialog
                bus={
                  `${vehicle.manufacturer} ${vehicle.type}`.trim() ||
                  vehicle.folder
                }
                aanbod={busAanbod}
                bezig={hofBezig}
                onNee={() => {
                  setHofGevraagd(`${duty.mapFolder}|${vehicle.folder}`);
                  setBusAanbod(undefined);
                }}
                onJa={() => {
                  if (hofBezig) return;
                  setHofBezig(true);
                  void window.career
                    .placeHofs(mapFolder, [vehicle.folder])
                    .then(async (result) => {
                      setNote(
                        t(language, "setup.hofDone", { count: result.placed }),
                      );
                      setHofGevraagd(`${duty.mapFolder}|${vehicle.folder}`);
                      setBusAanbod(undefined);
                      // De wagenparken opnieuw ophalen; er ligt er nu een bij.
                      setHofTeller((n) => n + 1);
                      setHofAanbod(await window.career.hofOffers(mapFolder));
                    })
                    .finally(() => setHofBezig(false));
                }}
              />
            ) : undefined
          }
          tweede={
            vel.tweede ??
            (opzetStap === "profile"
              ? [
                  {
                    tekst: t(language, "setup.newDriver"),
                    onDoen: () => setNieuweChauffeur(""),
                  },
                  /*
                   * Wat de chauffeur die je net aanwees heeft gereden. Hij hoort
                   * hier omdat je hier een chauffeur kiest, en het antwoord op
                   * "welke van de twee ben ik ook alweer" staat in zijn cijfers.
                   */
                  ...(career?.state && career.summary && screen !== "profiel"
                    ? [
                        {
                          tekst: t(language, "prof.open"),
                          onDoen: () => setScreen("profiel"),
                        },
                      ]
                    : []),
                ]
              : opzetStap === "mode" && screen !== "game"
                ? {
                    tekst: t(language, "setup.omsiSettings"),
                    onDoen: () => setScreen("game"),
                  }
                : undefined)
          }
          invoer={
            (nieuweChauffeur !== undefined || eersteStart) &&
            opzetStap === "profile"
              ? {
                  waarde: nieuweChauffeur ?? "",
                  plaatshouder: t(language, "welcome.name"),
                  onWaarde: setNieuweChauffeur,
                  onBevestig: () => {
                    const naam = (nieuweChauffeur ?? "").trim();
                    if (!naam) return;
                    setNieuweChauffeur(undefined);
                    void createProfile(naam);
                  },
                  onAnnuleer: () => setNieuweChauffeur(undefined),
                }
              : undefined
          }
          inhoud={
            screen === "game" ? (
              <GameSetup
                language={language}
                onBack={() => {
                  setInstellingenTab(undefined);
                  setScreen("modes");
                }}
                beginTab={instellingenTab}
              />
            ) : screen === "profiel" && career?.state && career.summary ? (
              <Profiel state={career.state} summary={career.summary} />

            ) : (
              vel.vrij
            )
          }
          /*
           * De ritstap van vrij rijden is vrije inhoud, en vrije inhoud maakt
           * het vel normaal schermvullend. Hier niet: je wijst een halte aan,
           * en dat is een plek op de kaart.
           *
           * Op de kaartstap geldt hetzelfde zodra er een kaart aangewezen is:
           * tegels zouden het vel beeldvullend maken, terwijl juist dán het net
           * van die kaart ernaast hoort te staan.
           */
          metKaart={Boolean(vel.vrij)}
          rechtsInBalk={balkRechts}
          /*
           * Een stap terug, en binnen de busstap een niveau terug.
           *
           * De busstap is drie schermen diep -- merk, type, uitvoering -- plus
           * de remise erachter. Terug hoort daar het bovenliggende scherm te
           * zijn en niet de dienstenlijst: je bent er nog niet klaar, je kijkt
           * een laag hoger. Pas op het eerste niveau is terug een stap terug.
           */
          onTerug={(() => {
            const balk =
              mode === "career"
                ? STAPPEN_CARRIERE
                : mode === "free"
                  ? STAPPEN_VRIJ
                  : STAPPEN_DIENST;

            if (opzetStap === "bus") {
              if (busScherm === "hof") {
                // Terug naar de kleurstelling als je daarlangs kwam.
                const viaKleur =
                  kleurBus &&
                  kleurBus === vehicle?.relativePath &&
                  kleurLijsten[kleurBus];
                return () => setBusScherm(viaKleur ? "kleur" : "bus");
              }
              if (busScherm === "kleur") return () => setBusScherm("bus");
              if (busType) return () => setBusType(undefined);
              if (busMerk) return () => setBusMerk(undefined);
            }
            // In het examen terug naar je vergunningen, als je er hebt.
            if (opzetStap === "licence" && examenScherm) {
              return () => setExamenScherm(false);
            }

            const hier = balk.indexOf(opzetStap);
            const vorige = hier > 0 ? balk[hier - 1] : undefined;
            if (!vorige) return undefined;
            return () => {
              setError(undefined);
              setNote(undefined);
              if (vorige === "profile") {
                setScreen("profiles");
                return;
              }
              if (vorige === "mode") {
                setScreen("modes");
                return;
              }
              setScreen("drive");
              if (vorige === "licence") setExamenScherm(false);
              setStap(vorige);
            };
          })()}
          onStap={(naar) => {
            /*
             * Terug in de balk gooit weg wat van de verlaten stap afhing. Een
             * dienstenlijst van een lijn die je net hebt losgelaten, is geen
             * keuze meer maar een val.
             */
            if (naar === "profile") {
              setScreen("profiles");
              return;
            }
            if (naar === "mode") {
              setScreen("modes");
              return;
            }
            setScreen("drive");
            /*
             * Niet bij een aangenomen dienst: die staat in het profiel, en
             * `duties` is daar het enige beeld van in het geheugen. Een examen
             * wordt al op de vergunningstap aangenomen; wie daarna van de
             * busstap terugklikte naar de kaart, raakte het hier kwijt, en
             * opnieuw zoeken of een ander examen kon niet meer -- `generate` en
             * `confirmDuty` weigeren zolang er een dienst aangenomen is.
             */
            if (
              !confirmed &&
              (naar === "map" || naar === "line" || naar === "licence")
            ) {
              setDuties([]);
              setSelected(undefined);
            }
            // Terug op de vergunningstap begin je bij het overzicht, niet in een examen.
            if (naar === "licence") setExamenScherm(false);
            // Een melding hoort bij de stap waar hij ontstond; verderop zegt hij niets meer.
            setError(undefined);
            setNote(undefined);
            setStap(naar);
          }}
        />
      </LanguageProvider>
    );
  }
}
