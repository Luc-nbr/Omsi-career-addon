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
} from "../../shared/api";
import { formatDuration, formatTime } from "../../shared/format";
import { Dienstoverzicht } from "./Dienstoverzicht";
import { DutyCard } from "./DutyCard";
import { Flag } from "./Flag";
import { GameSetup } from "./GameSetup";
import { Profiel } from "./Profiel";
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
import { ThemaKnop, type Thema } from "./ThemaKnop";
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

/*
 * OMSI telt de dag van het jaar, een datumveld wil een jaartal-maand-dag. Twee
 * kleine omrekeningen, hier bij elkaar omdat ze elkaars omgekeerde zijn.
 */
function isoVanDag(year: number, dayOfYear: number): string {
  const datum = new Date(Date.UTC(year, 0, 1));
  datum.setUTCDate(dayOfYear);
  return datum.toISOString().slice(0, 10);
}

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
const STAPPEN_DIENST: readonly Stap[] = STAPPEN.filter(
  (naam) => naam !== "line" && naam !== "licence",
);
const STAPPEN_CARRIERE: readonly Stap[] = STAPPEN.filter(
  (naam) => naam !== "line",
);
const STAPPEN_VRIJ: readonly Stap[] = STAPPEN.filter(
  (naam) => naam !== "licence",
);

/**
 * Welk scherm er staat. De app begint altijd bij de chauffeur en gaat dan naar
 * de modus; daarna pas komt het rijden in beeld.
 */
type Screen = "profiles" | "modes" | "drive" | "game" | "profiel";

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
   * Het maken van alle foto's in één keer: bij het installeren als vraag, en
   * later via "Busplaatjes bijwerken" voor de bussen die erbij kwamen.
   *
   * `busfotosGevraagd` is `undefined` zolang de instellingen er nog niet zijn;
   * dan komt het scherm er ook niet, anders flitst het even voor wie hem al
   * gehad heeft. `busfotoScherm` staat open als iemand op de knop drukte.
   */
  const [busfotoStand, setBusfotoStand] = useState<BusfotoStand>();
  const [busfotosGevraagd, setBusfotosGevraagd] = useState<boolean>();
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
  /*
   * Dag of nacht. `systeem` volgt Windows en is de beginstand; wie het knopje
   * indrukt legt het vast. De opmaak hangt aan een attribuut op de wortel --
   * theme.css valt zonder dat attribuut terug op prefers-color-scheme -- dus
   * zetten of weghalen is alles wat hier hoeft te gebeuren.
   */
  const [thema, setThema] = useState<Thema>("systeem");

  /*
   * Vrij rijden: wat er op de ritstap staat.
   *
   * Dit hoorde bij het oude vrije-rit-scherm en staat nu hier, want de stap
   * waar het in thuishoort wordt van hieruit opgebouwd. De datum begint in het
   * tijdvak van de kaart -- 1988 in Spandau, 2016 in HafenCity -- want een bus
   * uit het verkeerde decennium is geen vrije keuze maar een vergissing.
   */
  const [vrijeHalte, setVrijeHalte] = useState("");
  const [vrijeDatum, setVrijeDatum] = useState("");
  const [vrijeTijd, setVrijeTijd] = useState("08:00");
  const [vrijWeer, setVrijWeer] = useState<WeatherKind>("clear");
  /** De haltes van de kaart, om te kiezen waar de bus komt te staan. */
  const [vrijeHaltes, setVrijeHaltes] = useState<
    Array<{ id: string; name: string }>
  >([]);
  /** De bus die de app bij deze kaart voorstelt; bij vrij rijden is er geen dienst. */
  const [vrijeTip, setVrijeTip] = useState<Vehicle>();

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

  // De taalkeuze staat los van de chauffeur; hij hoort bij deze computer.
  useEffect(() => {
    void window.career.settings().then((settings) => {
      setLanguage(settings.language);
      setThema(settings.theme ?? "systeem");
      setKaartweergave(settings.mapView ?? "tegels");
      setTaalGekozen(settings.languageChosen === true);
      setBusfotosGevraagd(settings.busPhotosOffered === true);
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

  const kiesThema = useCallback((next: Thema) => {
    setThema(next);
    void window.career.saveSettings({ theme: next });
  }, []);

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
   * Bij binnenkomst op de lijnstap staat de bovenste regel gemarkeerd, terwijl
   * er nog niets gekozen is: het scherm liet een keuze zien die het niet had
   * gemaakt, en de kaart bleef daardoor leeg. Nu kiest hij die eerste lijn ook
   * echt, en licht de route meteen op.
   */
  useEffect(() => {
    if (stap !== "line" || lineFile || lines.length === 0 || busy) return;
    const eerste = lines[0].lineFile;
    setLineFile(eerste);
    void generateRef.current?.(eerste);
  }, [stap, lineFile, lines, busy]);

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
      return;
    }
    const held = active.assignment as Assignment;
    setMapFolder(held.duty.mapFolder);
    setDuties([held]);
    setSelected(0);
    setVehicleOverride(active.vehicleOverride);
    setStarted(Boolean(active.startedAt));
    if (active.mode) setMode(active.mode);
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
   * Alleen bij vrij rijden blijft de keuze staan; daar stel je je rit zelf samen.
   */
  const lijnVrij = mode !== "free";

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
    setDuties([]);
    setSelected(undefined);
  }, [mode]);
  useEffect(() => {
    if (!lijnVrij || stap !== "duty" || busy || confirmed) return;
    if (duties.length > 0 || !mapFolder) return;
    void generateRef.current?.();
  }, [lijnVrij, stap, busy, confirmed, duties.length, mapFolder]);

  /*
   * Wat de ritstap van vrij rijden nodig heeft: de haltes van de kaart om uit
   * te kiezen, een datum in het tijdvak van de kaart, en de bus die de app zou
   * voorstellen. Alleen in die modus, want alleen daar bestaat die stap.
   */
  useEffect(() => {
    if (mode !== "free" || !mapFolder) {
      setVrijeHaltes([]);
      setVrijeTip(undefined);
      return;
    }
    let geldig = true;
    void window.career.geometry(mapFolder).then((gevonden) => {
      if (!geldig) return;
      setVrijeHaltes(
        (gevonden?.stops ?? [])
          .filter((halte) => halte.name)
          .map((halte) => ({ id: halte.id, name: halte.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
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
   * De datum begint in het tijdvak van de kaart, en de halte gaat weg zodra je
   * een andere kaart kiest: een halte-id van Spandau bestaat niet op Grundorf.
   */
  useEffect(() => {
    if (mode !== "free" || !selectedMap) return;
    setVrijeDatum(isoVanDag(selectedMap.year, selectedMap.dayOfYear || 180));
    setVrijeHalte("");
  }, [mode, selectedMap?.folder]);

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
    if (confirmed || !mapFolder) return;
    const wacht = setTimeout(
      () => void generateRef.current?.(lineFile || undefined),
      400,
    );
    return () => clearTimeout(wacht);
  }, [lengthIndex, timeWindow, lineFile, confirmed, mapFolder]);

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
    return assignment?.vehicle ?? undefined;
  }, [vehicleOverride, vehicles, assignment]);

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
  }, [duty, vehicle, selectedMap, hofTeller]);

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
    [mapFolder, lengthIndex, timeWindow, lineFile, language, confirmed],
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

  /**
   * Dienst starten. Dit zet de situatie klaar in OMSI -- datum, tijd, bus bij de
   * halte en de dienstregeling -- en start daarna pas het spel. Er is geen aparte
   * knop meer voor het klaarzetten; dat hoort bij starten.
   */
  const begin = useCallback(
    async (alBevestigd = false, herstart = false) => {
      /*
       * `confirmed` komt uit de loopbaanstatus en die is er pas een tik later. Wie
       * in één druk bevestigt en start, weet zelf dat het net gebeurd is; daarom
       * mag hij dat hier zeggen in plaats van te wachten tot de status volgt.
       */
      if (!duty || (!confirmed && !alBevestigd)) return;
      setBusy(true);
      setNote(t(language, "start.preparing"));
      try {
        const result = await window.career.beginDuty({
          duty,
          ibis,
          vehiclePath: vehicle?.relativePath,
          kleurstelling:
            busKleur && busKleur.pad === vehicle?.relativePath
              ? busKleur.naam
              : undefined,
          herstart,
          date: assignment?.date,
          lineNumber: ibis?.line || duty.legs[0]?.lineNumber || "",
          terminus: duty.legs[0]?.terminus ?? "",
          yard: ibis?.yard,
        });
        setStarted(true);
        /*
         * De overlay hoort pas in beeld te komen als het spel er is. Draait OMSI
         * al met de plugin, dan is dat nu; anders blijft het venstertje staan tot
         * de plugin gegevens doorgeeft en gaat de overlay op dat moment open.
         */
        if (result.connected) {
          setOverlayOpen(await window.career.setOverlay(duty, true, ibis));
        }
        setStarting(!result.connected);

        const lines: string[] = [];
        if (result.prepareError) {
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
        if (result.running) lines.push(t(language, "start.alreadyRunning"));
        setNote(lines.join(" "));
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
  const startAlles = useCallback(async () => {
    if (!assignment || busy) return;
    if (!confirmed) await confirmDuty();
    await begin(true);
  }, [assignment, busy, confirmed, confirmDuty, begin]);

  /**
   * Vrij rijden: klaarzetten en starten.
   *
   * Hier hoort geen dienst bij en er wordt niets geboekt. De app schrijft de
   * situatie zoals je hem hebt samengesteld, zet hem klaar in het startscherm
   * van OMSI en biedt de overlay aan. Is er een lijn gekozen, dan staat het
   * dienstregelingsmenu daar ook meteen op.
   */
  const startVrij = useCallback(async () => {
    if (!selectedMap || !vrijeDatum || busy) return;
    const bus = vehicleOverride || vrijeTip?.relativePath;
    if (!bus) return;
    setBusy(true);
    setError(undefined);
    setNote(t(language, "start.preparing"));
    try {
      const [uren, minuten] = vrijeTijd.split(":").map(Number);
      const wanneer = dagVanIso(vrijeDatum);
      const result = await window.career.startFree({
        mapFolder,
        lineFile: lineFile || undefined,
        vehiclePath: bus,
        kleurstelling:
          busKleur && busKleur.pad === bus ? busKleur.naam : undefined,
        stopId: vrijeHalte || undefined,
        year: wanneer.year,
        dayOfYear: wanneer.dayOfYear,
        minutes: (uren || 0) * 60 + (minuten || 0),
        weather: vrijWeer,
      });
      const regels: string[] = [
        t(language, "free.ready", { map: selectedMap.name }),
      ];
      if (result.running) regels.push(t(language, "start.alreadyRunning"));
      setNote(regels.join(" "));
      /*
       * Hetzelfde venstertje als bij een dienst: het spel wordt gestart en tot
       * het er is, staat er iets dat dat zegt. Zonder dienst blijft de overlay
       * dicht -- er valt niets op te tonen.
       */
      setStarting(!result.running);
    } catch (cause) {
      setNote(undefined);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [
    selectedMap,
    vrijeDatum,
    busy,
    vehicleOverride,
    vrijeTip,
    vrijeTijd,
    mapFolder,
    lineFile,
    vrijeHalte,
    vrijWeer,
    language,
    busKleur,
  ]);

  /**
   * Carriere: examen afleggen op de aangewezen lijn.
   *
   * Een examen is een enkele rit die meteen vastligt -- er valt niets aan te
   * kiezen, dus wordt hij hier bevestigd en niet pas op de busstap. Daarna ga
   * je gewoon door de busstap heen, net als bij een dienst.
   */
  const doeExamen = useCallback(
    async (line: LineSummary, basic: boolean) => {
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
    [mapFolder, language],
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

  const toggleOverlay = useCallback(async () => {
    if (!duty && !overlayOpen) return;
    setOverlayOpen(await window.career.setOverlay(duty, !overlayOpen, ibis));
  }, [duty, overlayOpen, ibis]);

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
       */
      if (melding.soort !== "overlays") setScreen("drive");
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
            setMode(gekozen);
            setScreen("drive");
          }}
          onStaatVanDienst={() => setScreen("profiel")}
          onInstellingen={() => setScreen("game")}
          onChauffeur={() => setScreen("profiles")}
          onLogboek={() => void window.career.logboekOpenen()}
          melding={hubMelding}
          onMeldingWeg={() => setHubMelding(undefined)}
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
            !career.state.pasGezien &&
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
  if (started && duty) {
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
        <div className="omsimelding-knoppen">
          {omsiMelding.soort === "crash" && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setOmsiMelding(undefined);
                void window.career.vergeetOmsiMelding();
                void begin(true, true);
              }}
            >
              {t(language, "omsi.herstart")}
            </button>
          )}
          {omsiMelding.soort === "vast" && omsiMelding.pid !== undefined && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void window.career.sluitOmsi(omsiMelding.pid as number)
              }
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
          stap="bus"
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
          voet=""
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
                    setNote(t(language, "app.omsiReady"));
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
                onToggleOverlay={toggleOverlay}
                onCancel={cancelDuty}
                onFinish={finish}
                full={volledig}
              />
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
        : window.career
            .placeHofs(mapFolder, [vehicle.folder])
            .then((uit) => ({
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
       * Waar START op uitkomt hangt af van de modus. Dienst en carriere nemen
       * de dienst aan en beginnen hem; vrij rijden heeft geen dienst om aan te
       * nemen en zet alleen de situatie klaar.
       */
      verder: () => void (mode === "free" ? startVrij() : startAlles()),
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
        const naarVolgende = (): void =>
          setStap(
            mode === "free" ? "line" : mode === "career" ? "licence" : "duty",
          );
        const gekozenKaart = maps.find((item) => item.folder === mapFolder);
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
          regelaars: wisselaar,
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
                  onDoen: () => setMapFolder(item.folder),
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
          kies: (index) => setMapFolder(maps[index]?.folder ?? ""),
          voet: checked ?? t(language, "setup.mapFoot", { count: maps.length }),
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
      if (stap === "line") {
        return {
          stap: "line",
          titel: t(language, "setup.lineTitle"),
          onderschrift: t(language, "setup.lineIntro"),
          koppen: [
            t(language, "setup.colLine"),
            t(language, "setup.colTrips"),
            t(language, "setup.colAverage"),
          ],
          /*
           * Bij vrij rijden hoort "geen lijn" er ook bij, en bovenaan: rijden
           * zonder dienstregeling is daar geen restje maar het uitgangspunt.
           * In de andere modi bestaat deze stap niet.
           */
          rijen: (mode === "free"
            ? [
                {
                  lineFile: "",
                  lineNumbers: [t(language, "setup.noLine")],
                  trips: 0,
                  averageMinutes: 0,
                } as LineSummary,
              ]
            : []
          )
            .concat(lines)
            .map((item) => ({
              id: item.lineFile || "geen",
              cellen: [
                item.lineNumbers.join(", ") || item.lineFile,
                item.lineFile ? String(item.trips) : "—",
                item.lineFile
                  ? formatDuration(item.averageMinutes, language)
                  : "—",
              ] as [string, string, string],
              klok: Boolean(item.lineFile),
            })),
          index: Math.max(
            0,
            (mode === "free" ? [{ lineFile: "" } as LineSummary] : [])
              .concat(lines)
              .findIndex((item) => item.lineFile === lineFile),
          ),
          kies: (index) => {
            /*
             * Meteen de diensten ophalen, niet pas bij Verder. Dat is dezelfde
             * ene aanroep, alleen eerder -- en daardoor licht de route van de
             * aangeklikte lijn op de kaart op, wat dit scherm belooft.
             */
            const keuze = (
              mode === "free" ? [{ lineFile: "" } as LineSummary] : []
            ).concat(lines);
            const gekozenLijn = keuze[index]?.lineFile ?? "";
            setLineFile(gekozenLijn);
            // Bij vrij rijden hoort hier geen dienst gezocht te worden.
            if (gekozenLijn && mode !== "free") void generate(gekozenLijn);
          },
          voet: t(language, "setup.lineFoot", {
            map: selectedMap?.name ?? "",
            count: lines.length,
          }),
          verder: () => {
            /*
             * Bij vrij rijden valt er niets te zoeken: de volgende stap vraagt
             * waar en wanneer je wilt rijden, niet welke dienst je neemt.
             */
            if (mode === "free") {
              setStap("duty");
              return;
            }
            /*
             * Wie een lijn aanklikt heeft de diensten al; wie meteen op Verder
             * drukt nog niet. Dan halen we ze alsnog op, want een dienststap
             * zonder diensten is geen stap maar een muur.
             */
            if (duties.length > 0) setStap("duty");
            else
              void generate(lineFile || undefined).then(() => setStap("duty"));
          },
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

      /*
       * DE RITSTAP -- alleen bij vrij rijden.
       *
       * Op de plek waar de dienstenlijst staat, staat hier de vraag die er bij
       * vrij rijden werkelijk toe doet: waar zet ik de bus neer, wanneer, en
       * met wat voor weer. Er valt geen dienst te halen en dus niets te kiezen
       * -- dit is een formulier en wordt niet in rijen geperst alsof het een
       * lijst is.
       *
       * De kaart blijft ernaast staan: waar je begint is een plek, en die hoort
       * te zien te zijn terwijl je hem aanwijst.
       */
      if (mode === "free") {
        return {
          stap: "duty" as Stap,
          titel: t(language, "setup.freeTitle"),
          onderschrift: t(language, "setup.freeIntro"),
          koppen: ["", "", ""] as [string, string, string],
          rijen: [],
          index: 0,
          kies: () => {},
          voet: t(language, "setup.freeFoot", {
            map: selectedMap?.name ?? "",
            time: vrijeTijd,
          }),
          verder: () => setStap("bus"),
          knop: t(language, "setup.next"),
          vrij: (
            <div className="vrijerit">
              <label className="vrijveld">
                <span>{t(language, "free.stop")}</span>
                <select
                  value={vrijeHalte}
                  onChange={(event) => setVrijeHalte(event.target.value)}
                >
                  <option value="">{t(language, "free.stopAuto")}</option>
                  {vrijeHaltes.map((halte) => (
                    <option key={halte.id} value={halte.id}>
                      {halte.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="vrijpaar">
                <label className="vrijveld">
                  <span>{t(language, "free.date")}</span>
                  <input
                    type="date"
                    value={vrijeDatum}
                    onChange={(event) => setVrijeDatum(event.target.value)}
                  />
                </label>
                <label className="vrijveld">
                  <span>{t(language, "free.time")}</span>
                  <input
                    type="time"
                    value={vrijeTijd}
                    onChange={(event) => setVrijeTijd(event.target.value)}
                  />
                </label>
              </div>

              <div className="vrijveld">
                <span>{t(language, "free.weather")}</span>
                <div className="regelaar-chips">
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

              {!lineFile && (
                <p className="vrijnoot">{t(language, "free.noLine")}</p>
              )}
            </div>
          ),
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
          /*
           * Bij vrij rijden staat op de plek van de dienst je eigen rit; dan
           * hoort de balk dat ook te zeggen.
           */
          stapnamen={
            mode === "free"
              ? { duty: t(language, "setup.step.free") }
              : undefined
          }
          tegels={vel.tegels}
          kruimels={vel.kruimels}
          vullend={vel.vullend}
          keuzeloos={vel.keuzeloos}
          regelaars={vel.regelaars}
          /*
           * Twee dingen die je moet weten voordat je op START drukt, en dus op
           * de busstap: dat OMSI op volledig scherm stond -- dan ligt de
           * overlay over een spel dat het scherm exclusief opeist en kan het
           * beeld zwart blijven -- en dat er iets met de plugin is. Ze stonden
           * allebei in de oude wereld en hadden hier geen plek meer.
           */
          waarschuwing={
            stap === "bus" &&
            (schermmodus === "volledig" || plugin?.error || plugin?.changed) ? (
              <>
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
             * gaat over een keuze die de eerste nog moet maken.
             */
            toonBusVraag && assignment?.vehicle && duty ? (
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
            ) : busAanbod && vehicle && duty ? (
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
            if (naar === "map" || naar === "line" || naar === "licence") {
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
