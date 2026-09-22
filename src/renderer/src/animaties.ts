/**
 * Animaties aan of uit, los van Windows.
 *
 * WAAROM
 * De app volgde alleen Windows: wie daar "Animaties weergeven" uit heeft staan
 * (of een van de instellingen die dat meeneemt), zag geen kantelende tegels,
 * geen cijfers die optellen en geen cirkel tussen dag en nacht. Soms is dat een
 * bewuste keuze, vaak ook niet -- het staat op veel pc's uit voor de snelheid.
 * Luc wilde dat je het in de app zelf kunt aanzetten, en ook weer uit.
 *
 * Drie standen: `systeem` volgt Windows (zoals altijd), `aan` beweegt altijd,
 * `uit` nooit.
 *
 * HOE
 * De stylesheets hebben overal regels onder `@media (prefers-reduced-motion:
 * reduce)` die de beweging stilzetten. Bij `aan` zet de app die regels buiten
 * werking door hun media-voorwaarde op "not all" te zetten, en bij een andere
 * stand terug naar wat er stond. Bij `uit` zet een regel in theme.css
 * (`data-beweging="uit"` op de wortel) alle animaties en overgangen stil. Wat
 * met script beweegt, vraagt het via `rustig()` in beweging.ts.
 */

export type Animaties = "systeem" | "aan" | "uit";

let stand: Animaties = "systeem";

/** De oorspronkelijke media-voorwaarde van elke regel die we omzetten. */
const origineel = new WeakMap<CSSMediaRule, string>();

function regelsVoorMinderBeweging(): CSSMediaRule[] {
  const gevonden: CSSMediaRule[] = [];
  const loop = (regels: CSSRuleList): void => {
    for (const regel of Array.from(regels)) {
      if (regel instanceof CSSMediaRule) {
        if (origineel.has(regel) || /prefers-reduced-motion/.test(regel.media.mediaText)) {
          gevonden.push(regel);
        }
        loop(regel.cssRules);
      } else if ("cssRules" in regel && (regel as CSSGroupingRule).cssRules) {
        loop((regel as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const blad of Array.from(document.styleSheets)) {
    try {
      loop(blad.cssRules);
    } catch {
      // Een blad van elders laat zich niet lezen; daar staan onze regels niet in.
    }
  }
  return gevonden;
}

/** Zet de stand en laat de stylesheets en `rustig()` hem volgen. */
export function zetAnimaties(nieuw: Animaties | undefined): void {
  stand = nieuw === "aan" || nieuw === "uit" ? nieuw : "systeem";
  const wortel = document.documentElement;
  if (stand === "systeem") delete wortel.dataset.beweging;
  else wortel.dataset.beweging = stand;
  for (const regel of regelsVoorMinderBeweging()) {
    const eerst = origineel.get(regel) ?? regel.media.mediaText;
    origineel.set(regel, eerst);
    regel.media.mediaText = stand === "aan" ? "not all" : eerst;
  }
}

export function animatiesStand(): Animaties {
  return stand;
}

/** Staat Windows op minder beweging? */
export function windowsRustig(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
