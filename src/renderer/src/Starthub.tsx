import type { CSSProperties, JSX, ReactNode } from "react";
import { LANGUAGES, loose, t, type Language } from "../../shared/i18n";
import { formatDuration } from "../../shared/format";
import type { CareerSummary, GameMode } from "../../core/career";
import { Flag } from "./Flag";
import { Icoon } from "./Icoon";
import { ThemaKnop, type Thema } from "./ThemaKnop";
import { Versie } from "./Versie";
import { dagdeel, kantel, kantelLos, useOptellen } from "./beweging";
import carriereFoto from "./assets/modi/carriere.webp";
import dienstFoto from "./assets/modi/dienst.webp";
import vrijFoto from "./assets/modi/vrij.webp";

interface Props {
  /**
   * Een venstertje over de hub heen.
   *
   * Het staat binnen `.hub` en niet ernaast, want daar hangen de kleuren aan:
   * een venster dat buiten dat element valt, krijgt de donkere kleuren van de
   * oude glaswereld terug en staat in de lichte stand donker op donker.
   */
  dialoog?: ReactNode;
  language: Language;
  onLanguage: (language: Language) => void;
  thema: Thema;
  onThema: (thema: Thema) => void;
  /** De naam van de chauffeur die nu rijdt. */
  chauffeur: string;
  samenvatting?: CareerSummary;
  /** De modus waarop de app nu staat; die tegel staat aangewezen. */
  modus: GameMode;
  /** Loopt er een dienst, en zo ja in welke modus? */
  lopend?: GameMode;
  onModus: (modus: GameMode) => void;
  onStaatVanDienst: () => void;
  onInstellingen: () => void;
  onChauffeur: () => void;
  /** Het logboek van de app in de verkenner tonen. */
  onLogboek: () => void;
  /** Van de bussen die nog geen foto hebben er een maken. */
  onBusplaatjes: () => void;
  /** Wat er na de laatste dienst te melden valt: de uitkomst, of dat hij geannuleerd is. */
  melding?: string;
  onMeldingWeg?: () => void;
}

const MODI: GameMode[] = ["career", "service", "free"];

/**
 * Een foto per manier van spelen, gekozen door Luc: het gouden avondlicht bij de
 * remise voor de loopbaan, de klok boven de stad voor een dienst, het groene
 * land voor vrij rijden. Het zijn brede banners; welk deel in de tegel komt,
 * staat in de CSS bij `data-modus`.
 */
const FOTO: Record<GameMode, string> = {
  career: carriereFoto,
  service: dienstFoto,
  free: vrijFoto,
};

/**
 * Het hoofdscherm: waar je binnenkomt en waar je kiest wat je gaat doen.
 *
 * WAAROM DIT GEEN LIJST MEER IS
 * De modus stond eerst als drie regels in hetzelfde keuzevel als de kaarten en
 * de diensten: dezelfde rijen, dezelfde kolommen, met twee kolommen die voor
 * twee van de drie modi niets te melden hadden. Dat werkt voor een lijst van
 * veertig bussen, maar dit is geen lijst -- het zijn drie manieren om te
 * spelen, en dat is de belangrijkste keuze van de hele app. Die hoort als
 * tegels op tafel te liggen, groot genoeg om te lezen waar je aan begint.
 *
 * Eromheen staat wat er verder bij het binnenkomen hoort en nergens anders
 * thuishoorde: wie er rijdt, wat hij tot nu toe deed, en de knoppen naar de
 * instellingen van het spel. Zo is dit scherm de hub en niet een stap.
 *
 * Kleur blijft doen wat DESIGN.md zegt: blauw is de keuze die je maakt, geel
 * alleen het lijnnummer (dat hier niet voorkomt), de rest is grond, vel en
 * inkt.
 */
export function Starthub({
  language,
  onLanguage,
  thema,
  onThema,
  chauffeur,
  samenvatting,
  modus,
  lopend,
  onModus,
  onStaatVanDienst,
  onInstellingen,
  onChauffeur,
  onLogboek,
  onBusplaatjes,
  melding,
  onMeldingWeg,
  dialoog,
}: Props): JSX.Element {
  /*
   * De cijfers tellen op bij het binnenkomen. Ze komen een tel later binnen dan
   * het scherm (de staat van dienst wordt apart gelezen); dan tellen ze vanaf
   * daar. Zie `useOptellen`.
   */
  const diensten = useOptellen(samenvatting?.duties ?? 0, 900, 560);
  const minuten = useOptellen(samenvatting?.minutes ?? 0, 900, 560);
  const kilometers = useOptellen(samenvatting?.km ?? 0, 1200, 560);
  const vergunningen = useOptellen(samenvatting?.licences ?? 0, 900, 560);
  const uren = samenvatting
    ? formatDuration(Math.round(minuten), language)
    : undefined;

  /*
   * De begroeting volgt de klok: 's ochtends goedemorgen, 's avonds goedenavond,
   * en wie na middernacht nog start, zit kennelijk in de nachtdienst.
   */
  const groet = {
    ochtend: "hub.titleMorning",
    middag: "hub.titleAfternoon",
    avond: "hub.titleEvening",
    nacht: "hub.titleNight",
  } as const;

  return (
    <div className="hub">
      <header className="vel hub-balk">
        <span className="hub-merk">OMSI Enhancer</span>
        <Versie klasse="hub-versie" />
        <div className="balk-rechts">
          <ThemaKnop language={language} thema={thema} onThema={onThema} />
          {LANGUAGES.map((taal) => (
            <button
              key={taal.code}
              type="button"
              aria-pressed={taal.code === language}
              aria-label={taal.native}
              title={taal.native}
              onClick={() => onLanguage(taal.code)}
            >
              <Flag code={taal.code} />
            </button>
          ))}
        </div>
      </header>

      {/* Scrollen schuift de tegels onder een stilstaande muis weg; dan niet scheef blijven staan. */}
      <main className="hub-vel vel" onScroll={kantelLos}>
        <div className="hub-kop">
          <h1>{t(language, groet[dagdeel()], { naam: chauffeur })}</h1>
          <p>{t(language, "hub.intro")}</p>
        </div>

        {/* De uitkomst van de dienst die net klaar is; weg met één klik. */}
        {melding && (
          <div className="hub-melding" role="status">
            <span>{melding}</span>
            {onMeldingWeg && (
              <button
                type="button"
                onClick={onMeldingWeg}
                aria-label={t(language, "hub.dismiss")}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* De hoofdkeuze: drie tegels, en niets anders even groot. */}
        <div
          className="hub-tegels"
          onPointerMove={(event) => kantel(event, ".hub-tegel", 7)}
          onPointerLeave={kantelLos}
        >
          {MODI.map((naam, index) => (
            <button
              key={naam}
              type="button"
              className="hub-tegel"
              data-modus={naam}
              style={{ "--i": index } as CSSProperties}
              aria-pressed={naam === modus}
              onClick={() => onModus(naam)}
            >
              {/*
                De foto ligt onder de tekst, met een donker verloop ertussen:
                wit op een zonsondergang is anders niet te lezen. De naam van
                de modus staat al in de tegel, dus de foto zelf zegt niets.
              */}
              <img
                className="hub-tegel-foto"
                src={FOTO[naam]}
                alt=""
                draggable={false}
              />
              {/* Het licht dat de muis volgt; zie `kantel`. */}
              <span className="hub-tegel-glans" aria-hidden="true" />
              <span className="hub-tegel-tekst">
                <span className="hub-tegel-icoon">
                  <Icoon
                    naam={
                      naam === "career"
                        ? "licence"
                        : naam === "service"
                          ? "duty"
                          : "map"
                    }
                  />
                </span>
                <span className="hub-tegel-naam">
                  {t(language, `mode.${naam}` as const)}
                </span>
                <span className="hub-tegel-uitleg">
                  {t(language, `mode.${naam}Intro` as const)}
                </span>
                {/*
                  De tegel van de modus waarin je rijdt is de weg terug.

                  Er stond "loopt", en dat is een mededeling; je moest zelf
                  bedenken dat je erop kon drukken om verder te gaan. Nu staat
                  er wat het doet. De tegel zelf is altijd al een knop geweest.
                */}
                {lopend === naam && (
                  <span className="hub-tegel-stand loopt">
                    {t(language, "hub.resume")}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="hub-onder">
          {/* Wat je tot nu toe deed. De hele staat van dienst zit erachter. */}
          <button
            type="button"
            className="hub-paneel"
            onClick={onStaatVanDienst}
          >
            <span className="hub-paneel-kop">{t(language, "hub.record")}</span>
            <span className="hub-cijfers">
              <span>
                <b>{Math.round(diensten)}</b>
                {t(language, "hub.duties")}
              </span>
              <span>
                <b>{uren ?? "0"}</b>
                {t(language, "hub.hours")}
              </span>
              <span>
                <b>{Math.round(kilometers)}</b>
                {t(language, "hub.km")}
              </span>
              <span>
                <b>{Math.round(vergunningen)}</b>
                {t(language, "hub.licences")}
              </span>
            </span>
            <span className="hub-rang">
              {samenvatting
                ? loose(
                    language,
                    `rank.${samenvatting.rank}`,
                    samenvatting.rank,
                  )
                : ""}
            </span>
          </button>

          <div className="hub-knoppen">
            <button type="button" className="hub-knop" onClick={onInstellingen}>
              <Icoon naam="stuur" />
              {t(language, "setup.omsiSettings")}
            </button>
            <button type="button" className="hub-knop" onClick={onChauffeur}>
              <Icoon naam="profile" />
              {t(language, "hub.driver", { naam: chauffeur })}
            </button>
            {/*
              Voor de bussen die later kwamen: de installatie maakte de foto's
              van wat er toen stond, deze knop doet de rest.
            */}
            <button type="button" className="hub-knop" onClick={onBusplaatjes}>
              <Icoon naam="bus" />
              {t(language, "photos.sync")}
            </button>
            {/* Voor als er iets misgaat: het logboek, waar het ook staat. */}
            <button type="button" className="hub-knop" onClick={onLogboek}>
              <Icoon naam="logboek" />
              {t(language, "hub.log")}
            </button>
          </div>
        </div>
      </main>
      {dialoog}
    </div>
  );
}
