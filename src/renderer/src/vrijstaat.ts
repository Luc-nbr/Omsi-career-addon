import { formatTime } from "../../shared/format";
import { t, type Language } from "../../shared/i18n";
import type { VrijStaat, VrijSuggestie } from "../../shared/api";

/*
 * De teksten bij vrij rijden, op één plek.
 *
 * Het hoofdproces rekent uit hoe het ervoor staat (`vrijStaat` in
 * main/index.ts); het rijscherm, de overlay en de telefoon tonen dat. Stonden
 * de zinnen in elk venster apart, dan zei het rijscherm "kies een omloop"
 * terwijl de overlay al zag dat OMSI op een andere kaart reed.
 */

/**
 * De zin bij een staat. `plek` zegt waar hij komt: in de overlay is er weinig
 * ruimte, en daar volstaat bij "nog geen omloop" de korte versie.
 */
export function vrijeStaatTekst(
  taal: Language,
  staat: VrijStaat | undefined,
  kaart: string,
  plek: "scherm" | "overlay" = "scherm",
): string {
  if (!staat) return t(taal, "free.waiting");
  switch (staat.soort) {
    case "wacht":
      return t(taal, staat.lang ? "free.waitingLong" : "free.waiting");
    case "geenBus":
      return t(
        taal,
        staat.klaargezet === "start"
          ? "free.noBus"
          : staat.klaargezet === "situatie"
            ? "free.noBusLoad"
            : "free.noBusNothing",
      );
    case "geenGeheugen":
      return t(taal, "free.noMemory");
    case "andereKaart":
      return t(taal, "free.otherMap", { map: kaart });
    case "geenOmloop":
      if (staat.losgelaten) return t(taal, "free.tourEnded");
      return plek === "overlay"
        ? t(taal, "ovl.freePickTour", { kaart })
        : t(taal, "free.drivingPick", { map: kaart });
    case "gevolgd":
      return t(taal, "free.drivingTour", { line: staat.line, tour: staat.tour });
    case "alleenRit":
      return t(taal, "free.tripOnly", {
        tour: staat.tour,
        line: staat.line,
        map: kaart,
        trip: staat.trip,
      });
    case "onbekend":
      return t(taal, "free.lost", {
        line: staat.line,
        tour: staat.tour,
        trip: staat.trip,
        map: kaart,
      });
  }
}

/** Een regel "straks vertrekken": een omloop die uitrukt, of een gewone rit. */
export function suggestieRegel(taal: Language, regel: VrijSuggestie): string {
  const time = formatTime(regel.vertrek);
  if (regel.uitrukken) {
    return t(taal, "free.pulloutRow", {
      time,
      tour: regel.tourNumber,
      naar: regel.naar,
      lineFile: regel.lineFile,
    });
  }
  return t(taal, "free.suggestRow", {
    time,
    line: regel.lineNumber || regel.lineFile,
    naar: regel.naar,
    lineFile: regel.lineFile,
    tour: regel.tourNumber,
  });
}

/**
 * De suggesties in groepjes met een kop: eerst wat vlak bij de bus vertrekt
 * ("Vertrekken vanaf ..." als hij bij een halte staat), dan de rest.
 */
export function suggestieGroepen(
  taal: Language,
  staat: VrijStaat | undefined,
  max: number,
): Array<{ titel: string; regels: string[] }> {
  if (!staat || staat.soort !== "geenOmloop") return [];
  const lijst = staat.suggesties.slice(0, max);
  /* Een eigen kop alleen als de bus bij een halte staat; anders is het één lijst. */
  const dichtbij = staat.halte ? lijst.filter((regel) => regel.dichtbij) : [];
  const verder = lijst.filter((regel) => !dichtbij.includes(regel));
  const groepen: Array<{ titel: string; regels: string[] }> = [];
  if (dichtbij.length > 0 && staat.halte) {
    groepen.push({
      titel: t(taal, "free.hereTitle", { stop: staat.halte }),
      regels: dichtbij.map((regel) => suggestieRegel(taal, regel)),
    });
  }
  if (verder.length > 0) {
    groepen.push({
      titel: t(taal, "free.suggestTitle"),
      /*
       * Op tijd. De lijst komt met wat binnen 300 m vertrekt vooraan; zonder
       * eigen kop stond er dan "07:35, 07:40, 07:50, 07:05, 07:06" onder
       * "Straks vertrekken" (nakijken 28-09). Welke regels er staan, blijft.
       */
      regels: opTijd(verder).map((regel) => suggestieRegel(taal, regel)),
    });
  }
  return groepen;
}

/**
 * Op vertrektijd. Alles ligt binnen het uur na de klok, dus liggen de tijden
 * meer dan twaalf uur uiteen, dan is het over middernacht: 00:10 na 23:50.
 */
function opTijd(regels: VrijSuggestie[]): VrijSuggestie[] {
  const tijden = regels.map((regel) => regel.vertrek % 1440);
  const overMiddernacht = Math.max(...tijden) - Math.min(...tijden) > 720;
  const sleutel = (regel: VrijSuggestie): number => {
    const minuut = regel.vertrek % 1440;
    return overMiddernacht && minuut < 720 ? minuut + 1440 : minuut;
  };
  return [...regels].sort((a, b) => sleutel(a) - sleutel(b));
}

/** Een afstand zoals een navigatie hem zegt: meters tot een kilometer, daarna kilometers. */
export function afstandTekst(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
