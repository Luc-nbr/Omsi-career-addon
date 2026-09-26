import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Adres,
  Schermdeel,
  Schermfont,
  Schermstand,
  Schermvorm,
} from "../../shared/scherm";
import {
  driehoekgroepen,
  kleurCss,
  canvasMaat,
  naarCanvas,
  nodigePlaatjes,
  omhulsel,
  plaatjeVan,
  tekenvolgorde,
  tekstAlfa,
  isRechthoek,
  zichtbaarheidBekend,
  zichtbareKlikken,
  type Driehoekgroep,
} from "../../shared/schermteken";
import { decodeerFont, tekenTekst } from "../../shared/tekstopmaak";
import "./apparaatscherm.css";

/*
 * HET SCHERM VAN EEN APPARAAT, NAGETEKEND
 *
 * Wat OMSI op het scherm van een ALMEX, een IBIS of een kaartautomaat zet,
 * getekend op een canvas: het echte plaatje van het menu dat nu openstaat, de
 * lagen erboven, de tekst in het lettertype van het spel, en daarboven
 * onzichtbare knoppen op de plek van de aanraakvlakken. De vorm (welke plaatjes
 * en vlakken er zijn) staat in shared/scherm.ts, de rekensommen in
 * shared/schermteken.ts, de letters in shared/tekstopmaak.ts.
 *
 * Hetzelfde onderdeel draait in de overlay (plaatjes via omsischerm://) en op de
 * tablet (plaatjes via de eigen server); `textuurAdres` zegt waar.
 */

/** Een plaatje of een tekst, klaar om over driehoeken gelegd te worden. */
interface Bron {
  beeld: CanvasImageSource;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------------- *
 * DE PLAATJES
 *
 * Eén geheugen voor de hele pagina: de ids zijn een hash van de inhoud, dus
 * een plaatje dat er eenmaal is blijft goed, ook na een wissel van app of van
 * menu. Maar gedecodeerd weegt een plaatje van 1024 x 1024 vier megabyte, en
 * de ALMEX van de HH20 heeft er 35. Daarom hooguit ongeveer 12 miljoen
 * beeldpunten tegelijk (48 MB), de langst niet gebruikte gaan eerst -- nooit
 * een die het beeld van nu nodig heeft.
 * ------------------------------------------------------------------------- */

interface Plaatje {
  img: HTMLImageElement;
  adres: string;
  klaar: boolean;
  /** Breedte x hoogte, zodra het gedecodeerd is. */
  px: number;
  /** Wanneer het laden begon (Date.now()). */
  sinds: number;
}

const GRENS_PX = 12_000_000;
/* Na een mislukte poging: zo lang wachten voor de volgende. */
const OPNIEUW_MS = 2000;
/*
 * Na zoveel mislukte pogingen op rij wordt er niet meer op het plaatje
 * gewacht: het scherm wordt getekend zonder dat onderdeel (daar staat dan de
 * lege kleur), en er wordt minder vaak opnieuw gevraagd. Anders bleef één
 * kapot plaatje het hele scherm voor altijd op het oude beeld houden.
 */
const OPGEVEN_NA = 3;
const OPNIEUW_NA_OPGEVEN_MS = 10_000;
/*
 * Zo lang mag een plaatje onderweg zijn voordat het scherm zonder verder
 * tekent. Een verzoek dat blijft hangen (de wifi van de tablet hapert, de
 * server antwoordt niet) geeft geen fout, en dan bleef het oude menu staan met
 * een stilstaande klok, tot de browser na minuten opgeeft. Alleen als er al
 * eens een beeld stond: daarvoor is de terugval er, en die zegt meer dan een
 * zwart vlak met tekst.
 */
const LAAD_GEDULD_MS = 3000;

/* Op volgorde van gebruik: de laatst gebruikte achteraan (Map houdt die volgorde). */
const plaatjes = new Map<string, Plaatje>();
const mislukt = new Map<string, { keer: number; tijd: number }>();
let beeldpunten = 0;
/* Wie er een seintje wil als er een plaatje binnenkomt of mislukt. */
const luisteraars = new Set<() => void>();
/* Per getekend scherm de plaatjes die zijn beeld van nu nodig heeft. */
const inGebruik = new Map<symbol, Set<string>>();

function meld(): void {
  for (const luisteraar of luisteraars) luisteraar();
}

/** De langst niet gebruikte plaatjes vergeten tot het geheugen weer onder de grens zit. */
function ruimOp(): void {
  if (beeldpunten <= GRENS_PX) return;
  const nodig = new Set<string>();
  for (const ids of inGebruik.values()) for (const id of ids) nodig.add(id);
  for (const [id, plaatje] of plaatjes) {
    if (beeldpunten <= GRENS_PX) break;
    if (!plaatje.klaar || nodig.has(id)) continue;
    plaatjes.delete(id);
    beeldpunten -= plaatje.px;
  }
}

/**
 * Hoe het met een plaatje staat, en het laden starten als dat nog moet.
 * - 'klaar': te tekenen;
 * - 'laadt': onderweg, wacht er even op;
 * - 'traag': al langer dan LAAD_GEDULD_MS onderweg;
 * - 'mist': het lukte een paar keer niet, teken maar zonder.
 */
function vraagPlaatje(id: string, adres: string): "klaar" | "laadt" | "traag" | "mist" {
  const fout = mislukt.get(id);
  const opgegeven = Boolean(fout && fout.keer >= OPGEVEN_NA);
  const bekend = plaatjes.get(id);
  if (bekend && bekend.adres === adres) {
    /* Achteraan zetten: net gebruikt. */
    plaatjes.delete(id);
    plaatjes.set(id, bekend);
    if (bekend.klaar) return "klaar";
    /*
     * Een nieuwe poging na het opgeven: daar wordt niet op gewacht. Anders
     * stond bij elke poging het hele scherm stil, en bij een verzoek dat
     * blijft hangen voor minuten.
     */
    if (opgegeven) return "mist";
    return Date.now() - bekend.sinds > LAAD_GEDULD_MS ? "traag" : "laadt";
  }
  if (bekend) {
    plaatjes.delete(id);
    beeldpunten -= bekend.px;
  }
  const wacht = opgegeven ? OPNIEUW_NA_OPGEVEN_MS : OPNIEUW_MS;
  if (fout && Date.now() - fout.tijd < wacht) return opgegeven ? "mist" : "laadt";

  const img = new Image();
  img.decoding = "async";
  const plaatje: Plaatje = { img, adres, klaar: false, px: 0, sinds: Date.now() };
  plaatjes.set(id, plaatje);
  let afgehandeld = false;
  const mis = (): void => {
    if (afgehandeld) return;
    afgehandeld = true;
    /*
     * Uit het geheugen, anders bleef een 404 voor altijd een 404. Dat gebeurt
     * echt: na een herstart van de app kent de server de ids pas weer als de
     * vorm opnieuw gebouwd is, en de tablet vraagt dan nog de oude.
     */
    if (plaatjes.get(id) === plaatje) plaatjes.delete(id);
    const keer = (mislukt.get(id)?.keer ?? 0) + 1;
    mislukt.set(id, { keer, tijd: Date.now() });
    window.setTimeout(meld, (keer >= OPGEVEN_NA ? OPNIEUW_NA_OPGEVEN_MS : OPNIEUW_MS) + 20);
    meld();
  };
  const gelukt = (): void => {
    /* Een plaatje zonder maat valt niet te tekenen (drawImage gooit dan); dat telt als mislukt. */
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return mis();
    if (afgehandeld) return;
    afgehandeld = true;
    if (plaatjes.get(id) !== plaatje) return;
    plaatje.klaar = true;
    plaatje.px = img.naturalWidth * img.naturalHeight;
    beeldpunten += plaatje.px;
    mislukt.delete(id);
    ruimOp();
    meld();
  };
  img.onerror = mis;
  img.src = adres;
  img.decode().then(gelukt, () => {
    /* decode() weigert soms een plaatje dat wel geladen is (Safari bij grote); dan toch tekenen. */
    if (img.complete && img.naturalWidth > 0) gelukt();
    else mis();
  });
  /* Ook als er verder niets gebeurt (OMSI staat stil): na het geduld opnieuw kijken. */
  window.setTimeout(meld, LAAD_GEDULD_MS + 20);
  return opgegeven ? "mist" : "laadt";
}

/* ------------------------------------------------------------------------- *
 * TEKENEN
 * ------------------------------------------------------------------------- */

type Font = ReturnType<typeof decodeerFont>;

/* De lettertypen van een vorm, één keer uitgepakt. */
const fonts = new WeakMap<Schermfont, Font | null>();

function fontVan(font: Schermfont | undefined): Font | undefined {
  if (!font) return undefined;
  let klaar = fonts.get(font);
  if (klaar === undefined) {
    try {
      klaar = decodeerFont(font);
    } catch (fout) {
      console.warn("apparaatscherm: lettertype niet te lezen", font.naam, fout);
      klaar = null;
    }
    fonts.set(font, klaar);
  }
  return klaar ?? undefined;
}

/* De driehoeken van elk onderdeel in groepen, één keer per vorm uitgerekend. */
const groepenPerVorm = new WeakMap<Schermvorm, (Driehoekgroep[] | undefined)[]>();

function groepenVan(vorm: Schermvorm, index: number): Driehoekgroep[] {
  let lijst = groepenPerVorm.get(vorm);
  if (!lijst) {
    lijst = [];
    groepenPerVorm.set(vorm, lijst);
  }
  return (lijst[index] ??= driehoekgroepen(vorm.delen[index].driehoeken));
}

/** De driehoeken van een groep als pad, in beeldpunten van het canvas. */
function padVan(ctx: CanvasRenderingContext2D, st: number[], breed: number, hoog: number): void {
  for (let i = 0; i + 5 < st.length; i += 6) {
    ctx.moveTo(st[i] * breed, st[i + 1] * hoog);
    ctx.lineTo(st[i + 2] * breed, st[i + 3] * hoog);
    ctx.lineTo(st[i + 4] * breed, st[i + 5] * hoog);
    ctx.closePath();
  }
}

/**
 * Hoe dekkend een onderdeel getekend wordt, uit `[matl_alpha]` en de diffuse
 * alfa van het materiaal (`kleur[3]`):
 * - 0: helemaal (de server leverde het plaatje al zonder doorzichtigheid);
 * - 1 (alfatest): helemaal of niet, drempel een half (ONZEKER, zoals op de server);
 * - 2 (mengen): de diffuse alfa.
 */
function dekkingVan(deel: Schermdeel): number {
  const a = Math.min(1, Math.max(0, deel.kleur?.[3] ?? 1));
  if (deel.alfa === 2) return a;
  if (deel.alfa === 1) return a >= 0.5 ? 1 : 0;
  return 1;
}

/**
 * Bij 'clamp' herhaalt de rand van het plaatje zich naar buiten: de buitenste
 * rij of kolom, uitgerekt over wat er buiten 0..1 valt. De transformatie staat
 * al op beeldpunten van het plaatje. `over`: de stroken schuiven een half
 * beeldpunt onder het plaatje door, zodat er geen naad tussen zit -- alleen
 * bij volle dekking, anders zou die overlap dubbel mengen.
 */
function tekenRanden(
  ctx: CanvasRenderingContext2D,
  bron: Bron,
  groep: Driehoekgroep,
  over: number,
): void {
  const { beeld, w, h } = bron;
  /* Nooit verder dan vier keer het plaatje: een uitschieter in de uv's mag het canvas niet laten ontsporen. */
  const U0 = Math.max(groep.uvMin[0] * w, -4 * w);
  const U1 = Math.min(groep.uvMax[0] * w, 5 * w);
  const V0 = Math.max(groep.uvMin[1] * h, -4 * h);
  const V1 = Math.min(groep.uvMax[1] * h, 5 * h);
  const links = U0 < 0;
  const rechts = U1 > w;
  const boven = V0 < 0;
  const onder = V1 > h;
  const lb = -U0 + 1 + over;
  const rb = U1 - w + 1 + over;
  const bh = -V0 + 1 + over;
  const oh = V1 - h + 1 + over;
  if (links) ctx.drawImage(beeld, 0, 0, 1, h, U0 - 1, 0, lb, h);
  if (rechts) ctx.drawImage(beeld, w - 1, 0, 1, h, w - over, 0, rb, h);
  if (boven) ctx.drawImage(beeld, 0, 0, w, 1, 0, V0 - 1, w, bh);
  if (onder) ctx.drawImage(beeld, 0, h - 1, w, 1, 0, h - over, w, oh);
  if (links && boven) ctx.drawImage(beeld, 0, 0, 1, 1, U0 - 1, V0 - 1, lb, bh);
  if (rechts && boven) ctx.drawImage(beeld, w - 1, 0, 1, 1, w - over, V0 - 1, rb, bh);
  if (links && onder) ctx.drawImage(beeld, 0, h - 1, 1, 1, U0 - 1, h - over, lb, oh);
  if (rechts && onder) ctx.drawImage(beeld, w - 1, h - 1, 1, 1, w - over, h - over, rb, oh);
}

/**
 * Eén groep driehoeken met een plaatje of tekst erover.
 *
 * Knippen op de driehoeken, dan:
 * - 'wrap': een herhalend patroon met de afbeelding van de groep, en de hele
 *   rechthoek om het knippad daarmee vullen -- hoe ver de uv's ook buiten 0..1
 *   lopen (de ALMEX heeft v -0,88..-0,12), het patroon dekt het;
 * - 'clamp': het plaatje één keer, met de randen naar buiten doorgetrokken;
 * - 'border': het plaatje één keer; daarbuiten de randkleur van Direct3D (zwart
 *   met alfa 0), dus zwart bij een ondoorzichtig materiaal en anders niets.
 *
 * `over`: hoeveel de randstroken van 'clamp' onder het plaatje doorschuiven
 * (zie tekenRanden); 0 in de optellaag van tekenDeel, waar overlap dubbel telt.
 */
function tekenGroep(
  ctx: CanvasRenderingContext2D,
  groep: Driehoekgroep,
  bron: Bron,
  adres: Adres,
  dekking: number,
  ondoorzichtig: boolean,
  breed: number,
  hoog: number,
  over: number,
): void {
  const { beeld, w, h } = bron;
  const [x, y, b, hg] = omhulsel(groep.st);
  const rx = Math.floor(x * breed) - 1;
  const ry = Math.floor(y * hoog) - 1;
  const rb = Math.ceil((x + b) * breed) + 1 - rx;
  const rh = Math.ceil((y + hg) * hoog) + 1 - ry;
  ctx.save();
  /*
   * Altijd weer terug, ook als er iets gooit: anders bleef de knip van deze
   * groep staan en werd elk volgend onderdeel erop afgesneden.
   */
  try {
    ctx.globalAlpha = dekking;
    ctx.beginPath();
    padVan(ctx, groep.st, breed, hoog);
    ctx.clip();
    if (!groep.m) {
      /* De uv's vormen geen driehoek: de hele groep krijgt de kleur van dat ene beeldpunt. */
      let [u, v] = groep.uv ?? [0, 0];
      const buiten = u < 0 || u > 1 || v < 0 || v > 1;
      if (adres === "wrap") {
        u -= Math.floor(u);
        v -= Math.floor(v);
      }
      if (adres === "border" && buiten) {
        if (ondoorzichtig) {
          ctx.fillStyle = "#000";
          ctx.fillRect(rx, ry, rb, rh);
        }
      } else {
        const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
        const py = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
        /* Zonder gladstrijken: anders mengt de browser de buren van dat beeldpunt erin, als strepen. */
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(beeld, px, py, 1, 1, rx, ry, rb, rh);
      }
    } else {
      const m = naarCanvas(groep.m, w, h, breed, hoog);
      if (adres === "wrap") {
        const patroon = ctx.createPattern(beeld, "repeat");
        if (patroon) {
          patroon.setTransform(new DOMMatrix(m));
          ctx.fillStyle = patroon;
          ctx.fillRect(rx, ry, rb, rh);
        }
      } else {
        if (adres === "border" && ondoorzichtig) {
          ctx.fillStyle = "#000";
          ctx.fillRect(rx, ry, rb, rh);
        }
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (adres === "clamp") tekenRanden(ctx, bron, groep, over);
        ctx.drawImage(beeld, 0, 0, w, h);
      }
    }
  } finally {
    ctx.restore();
  }
}

/** Van een tekstonderdeel het canvas met de tekst van nu. */
interface Tekstvak {
  tekst: string;
  doek: HTMLCanvasElement;
}

/**
 * Het tekstcanvas van een onderdeel: `b` x `h` beeldpunten zoals OMSI de
 * textuur maakt, gevuld door `tekenTekst` (shared/tekstopmaak.ts), met de
 * alfaregel van het materiaal erop. Eén canvas per onderdeel, dat alleen
 * opnieuw gevuld wordt als de tekst verandert: de klok verspringt elke
 * seconde, de rest haast nooit.
 */
function tekstBron(
  vorm: Schermvorm,
  index: number,
  deel: Schermdeel,
  stand: Schermstand,
  vakken: Map<number, Tekstvak>,
): Bron | undefined {
  const tt = deel.tekst;
  if (!tt) return undefined;
  /* Hele beeldpunten, zoals tekenTekst en het canvas zelf ze nemen; anders klopte de afbeelding een fractie niet. */
  const b = Math.trunc(tt.b);
  const h = Math.trunc(tt.h);
  /* Een tekstvak groter dan 4096 x 4096 is een fout in de cfg, geen scherm: niet 64 MB voor aanmaken. */
  if (!(b > 0) || !(h > 0) || b * h > 4096 * 4096) return undefined;
  const tekst = stand.t[tt.variabele] ?? "";
  let vak = vakken.get(index);
  if (vak && vak.tekst === tekst) return { beeld: vak.doek, w: b, h };
  const doek = vak?.doek ?? document.createElement("canvas");
  if (doek.width !== b) doek.width = b;
  if (doek.height !== h) doek.height = h;
  const ctx = doek.getContext("2d");
  if (!ctx) return undefined;
  const beeld = ctx.createImageData(b, h);
  try {
    const rgba = tekenTekst(fontVan(vorm.fonts[tt.font]), tt, tekst);
    beeld.data.set(rgba.length === beeld.data.length ? rgba : rgba.subarray(0, beeld.data.length));
  } catch (fout) {
    /* Dan een lege textuur, zoals OMSI bij een fout in de tekst. */
    console.warn("apparaatscherm: tekst niet te tekenen", tt.font, fout);
  }
  tekstAlfa(beeld.data, deel.alfa);
  ctx.putImageData(beeld, 0, 0);
  vak = { tekst, doek };
  vakken.set(index, vak);
  return { beeld: doek, w: b, h };
}

/**
 * Het hele scherm op het canvas: eerst de lege kleur, dan elk onderdeel dat
 * nu zichtbaar is, in de volgorde van de vorm.
 */
function tekenScherm(
  ctx: CanvasRenderingContext2D,
  breed: number,
  hoog: number,
  vorm: Schermvorm,
  stand: Schermstand,
  plaatje: (id: string) => Bron | undefined,
  vakken: Map<number, Tekstvak>,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vorm.leeg;
  ctx.fillRect(0, 0, breed, hoog);
  ctx.imageSmoothingEnabled = true;
  /*
   * 'medium' en niet 'high': Direct3D bemonstert bilineair (met mipmaps bij
   * verkleinen), en dat is 'medium'. 'high' vergroot in Chromium bicubisch --
   * nagemeten op een zwart-wit-rand 40x vergroot: 55 en 207 waar bilineair 67
   * en 194 geeft; 'medium' geeft precies 67 en 194. De letters van de ALMEX
   * worden op een iPad zo'n anderhalf keer vergroot, en kregen zo een harder
   * randje dan in het spel.
   */
  ctx.imageSmoothingQuality = "medium";

  for (const index of tekenvolgorde(vorm, stand)) {
    const deel = vorm.delen[index];
    /*
     * Eén onderdeel dat niet te tekenen is (een plaatje dat de browser toch
     * niet wil, een onmogelijke maat) mag de rest niet tegenhouden: zonder dit
     * bleef het hele scherm op het vorige beeld staan, want de sleutel van het
     * getekende beeld wordt pas na afloop gezet.
     */
    try {
      tekenDeel(ctx, breed, hoog, vorm, index, deel, stand, plaatje, vakken);
    } catch (fout) {
      const sleutel = `${vorm.id}:${index}`;
      if (!gemeld.has(sleutel)) {
        gemeld.add(sleutel);
        console.warn("apparaatscherm: onderdeel niet te tekenen", index, deel.soort, fout);
      }
    }
  }
}

/* Welke onderdelen al een keer in de console stonden; tien keer per seconde dezelfde melding helpt niemand. */
const gemeld = new Set<string>();

/** Eén onderdeel op het canvas. */
function tekenDeel(
  ctx: CanvasRenderingContext2D,
  breed: number,
  hoog: number,
  vorm: Schermvorm,
  index: number,
  deel: Schermdeel,
  stand: Schermstand,
  plaatje: (id: string) => Bron | undefined,
  vakken: Map<number, Tekstvak>,
): void {
  const groepen = groepenVan(vorm, index);
  if (groepen.length === 0) return;

  if (deel.soort === "kleur" || deel.soort === "script") {
    /*
     * Een vlak zonder plaatje in zijn materiaalkleur. Een scripttextuur
     * (`\S:n`) beschildert het busscript zelf en is niet na te tekenen: die
     * wordt een vlak in de lege kleur, zodat er niets van eronder doorschijnt.
     */
    const dekking = deel.soort === "script" ? 1 : dekkingVan(deel);
    if (dekking <= 0) return;
    ctx.save();
    try {
      ctx.globalAlpha = dekking;
      ctx.fillStyle = deel.soort === "script" ? vorm.leeg : kleurCss(deel.kleur);
      ctx.beginPath();
      for (const groep of groepen) padVan(ctx, groep.st, breed, hoog);
      ctx.fill();
    } finally {
      ctx.restore();
    }
    return;
  }

  let bron: Bron | undefined;
  if (deel.soort === "tekst") {
    bron = tekstBron(vorm, index, deel, stand, vakken);
  } else {
    const id = plaatjeVan(deel, stand);
    bron = id ? plaatje(id) : undefined;
  }
  if (!bron) return;
  /*
   * Tekst mengt altijd met zijn eigen alfa en niet met de diffuse alfa: de
   * tekstvelden van de AFR hebben diffuse alfa 0 en zijn in het spel gewoon
   * te lezen (nakijken_achtergrond.md §3).
   */
  const dekking = deel.soort === "tekst" ? 1 : dekkingVan(deel);
  if (dekking <= 0) return;
  const ondoorzichtig = deel.alfa === 0;
  if (groepen.length === 1) {
    tekenGroep(ctx, groepen[0], bron, deel.adres, dekking, ondoorzichtig, breed, hoog, dekking >= 1 ? 0.5 : 0);
    return;
  }

  /*
   * MEER GROEPEN: EERST OPTELLEN, DAN PAS OP HET SCHERM
   *
   * Twee driehoeken met een gedeelde rand maar een andere afbeelding -- bij
   * de HH20 is dat bijna alles: het scherm is in het spel geen zuivere
   * rechthoek (de hoeken liggen op s 0,99867 en 0,00327 in plaats van 1 en
   * 0), dus de twee helften van elke vierhoek verschillen 2e-3, en 74 van de
   * 81 onderdelen vallen in twee groepen. Elke groep wordt apart geknipt, en
   * een beeldpunt op de diagonaal is dan voor de helft van de ene en voor de
   * helft van de andere. Over elkaar gelegd dekt dat 1 - 0,5 x 0,5 = 75%, en
   * het zwart eronder schijnt als een streep van hoek tot hoek door het hele
   * scherm. Opgeteld ('lighter') in een lege laag is het 0,5 + 0,5 = 100%;
   * die laag gaat daarna in één keer op het scherm. Elke driehoek houdt zo
   * zijn eigen afbeelding, zoals in het spel.
   */
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const groep of groepen) {
    const [x, y, b, h] = omhulsel(groep.st);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + b);
    y1 = Math.max(y1, y + h);
  }
  const lx = Math.max(0, Math.floor(x0 * breed) - 2);
  const ly = Math.max(0, Math.floor(y0 * hoog) - 2);
  const lb = Math.min(breed, Math.ceil(x1 * breed) + 2) - lx;
  const lh = Math.min(hoog, Math.ceil(y1 * hoog) + 2) - ly;
  if (!(lb > 0) || !(lh > 0)) return;
  const l = laagVan(breed, hoog);
  if (!l) {
    for (const groep of groepen) tekenGroep(ctx, groep, bron, deel.adres, dekking, ondoorzichtig, breed, hoog, 0);
    return;
  }
  /* Het zwart buiten 0..1 bij 'border' in één vulling voor alle groepen, direct op het scherm: dan ook daar geen naad. */
  if (deel.adres === "border" && ondoorzichtig) {
    ctx.save();
    try {
      ctx.globalAlpha = dekking;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      for (const groep of groepen) padVan(ctx, groep.st, breed, hoog);
      ctx.fill();
    } finally {
      ctx.restore();
    }
  }
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalAlpha = 1;
  l.globalCompositeOperation = "source-over";
  l.clearRect(lx, ly, lb, lh);
  l.globalCompositeOperation = "lighter";
  l.imageSmoothingEnabled = true;
  l.imageSmoothingQuality = "medium";
  try {
    for (const groep of groepen) tekenGroep(l, groep, bron, deel.adres, 1, false, breed, hoog, 0);
  } finally {
    l.globalCompositeOperation = "source-over";
  }
  ctx.save();
  try {
    ctx.globalAlpha = dekking;
    ctx.drawImage(l.canvas, lx, ly, lb, lh, lx, ly, lb, lh);
  } finally {
    ctx.restore();
  }
}

/*
 * De optellaag van tekenDeel: één canvas voor de hele pagina, zo groot als het
 * scherm dat getekend wordt (tekenen gebeurt nooit door elkaar heen). Alleen
 * het stuk van het onderdeel wordt gewist en overgezet.
 */
let laag: HTMLCanvasElement | undefined;

function laagVan(breed: number, hoog: number): CanvasRenderingContext2D | null {
  laag ??= document.createElement("canvas");
  if (laag.width !== breed) laag.width = breed;
  if (laag.height !== hoog) laag.height = hoog;
  return laag.getContext("2d");
}

/**
 * Alles wat bij één getekend scherm hoort en niet in React-state hoeft: het
 * canvas, de maat in echte beeldpunten, de tekstvakken en wat het laatst
 * getekend is. Tekenen gebeurt in een animatieframe, en alleen als er iets te
 * tekenen valt: een andere stand, een andere maat, of een plaatje dat
 * binnenkomt.
 */
class Tekenaar {
  readonly token = Symbol("apparaatscherm");
  doek: HTMLCanvasElement | null = null;
  breed = 0;
  hoog = 0;
  private frame = 0;
  private getekend = "";
  private vakken = new Map<number, Tekstvak>();
  private vakkenVan = "";

  constructor(
    private readonly bron: () => {
      vorm: Schermvorm;
      stand: Schermstand;
      textuurAdres: (id: string) => string;
      /* Onwaar zolang de terugval blijft staan: dan is er niets te tekenen. */
      tekenen: boolean;
    },
    /* Na elk getekend beeld, met de stand die er nu op staat. */
    private readonly opBeeld: (stand: Schermstand) => void,
  ) {}

  vraag = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.teken();
    });
  };

  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    inGebruik.delete(this.token);
  }

  private teken(): void {
    const doek = this.doek;
    if (!doek || this.breed <= 0 || this.hoog <= 0) return;
    const { vorm, stand, textuurAdres, tekenen } = this.bron();
    /* Een stand van een andere vorm: de plekken kloppen niet, dan het oude beeld laten staan. */
    if (stand.vorm !== vorm.id || !tekenen) return;

    const nodig = nodigePlaatjes(vorm, stand);
    inGebruik.set(this.token, new Set(nodig));
    /*
     * Eerst ALLE plaatjes vragen en dan pas kijken of er gewacht moet worden:
     * een nieuw menu met een achtergrond en een laag kwam anders plaatje voor
     * plaatje binnen, elk pas na het vorige.
     */
    const mist: string[] = [];
    let wachten = false;
    for (const id of nodig) {
      const staat = vraagPlaatje(id, textuurAdres(id));
      /*
       * Zolang er een plaatje onderweg is, het vorige beeld laten staan: liever
       * een tel het oude menu dan een zwart scherm met alleen tekst erop. Maar
       * niet eindeloos (LAAD_GEDULD_MS), en voor het eerste beeld wel: dan
       * staat de terugval er.
       */
      if (staat === "laadt" || (staat === "traag" && this.getekend === "")) wachten = true;
      else if (staat === "mist" || staat === "traag") mist.push(id);
    }
    if (wachten) return;

    const sleutel = `${vorm.id}|${this.breed}x${this.hoog}|${mist.join(",")}|${JSON.stringify(stand)}`;
    if (sleutel === this.getekend) return;

    if (this.vakkenVan !== vorm.id) {
      this.vakken = new Map();
      this.vakkenVan = vorm.id;
    }
    /* Pas nu de maat zetten: dat wist het canvas, en dat mag alleen als er meteen een heel beeld op komt. */
    if (doek.width !== this.breed) doek.width = this.breed;
    if (doek.height !== this.hoog) doek.height = this.hoog;
    const ctx = doek.getContext("2d");
    if (!ctx) return;
    tekenScherm(
      ctx,
      this.breed,
      this.hoog,
      vorm,
      stand,
      (id) => {
        const p = plaatjes.get(id);
        return p?.klaar ? { beeld: p.img, w: p.img.naturalWidth, h: p.img.naturalHeight } : undefined;
      },
      this.vakken,
    );
    this.getekend = sleutel;
    this.opBeeld(stand);
  }
}

/** Kort oplichten als je een vlak indrukt; ook op een iPad, waar `:active` zonder meer niet komt. */
const lichtKlok = new WeakMap<HTMLElement, number>();

function licht(event: ReactPointerEvent<HTMLButtonElement>): void {
  const knop = event.currentTarget;
  if (knop.disabled) return;
  knop.dataset.gedrukt = "";
  window.clearTimeout(lichtKlok.get(knop));
  lichtKlok.set(
    knop,
    window.setTimeout(() => delete knop.dataset.gedrukt, 160),
  );
}

const binnen = (x: number): number => Math.min(1, Math.max(0, x));
const procent = (x: number): string => `${(x * 100).toFixed(3)}%`;

/**
 * De `zoom` waarmee een element in beeld staat: die van hemzelf maal die van
 * al zijn ouders. De tablet vergroot het hele paneel met `zoom` (apparaat.tsx,
 * bij een iPad 1,3 tot 1,9), en dat laat de CSS-maat van het canvas gelijk.
 */
function zoomVan(element: Element): number {
  let zoom = 1;
  for (let knoop: Element | null = element; knoop; knoop = knoop.parentElement) {
    const waarde = getComputedStyle(knoop).zoom;
    const getal = parseFloat(waarde);
    if (Number.isFinite(getal) && getal > 0) zoom *= waarde.trim().endsWith("%") ? getal / 100 : getal;
  }
  return zoom;
}

export interface ApparaatschermProps {
  vorm: Schermvorm;
  stand: Schermstand;
  /** Waar het plaatje met deze id te halen is (omsischerm:// of textuur/<id>). */
  textuurAdres: (id: string) => string;
  /** Of de bus op deze actie reageert: heeft hij er een toets voor? */
  kan: (actie: string) => boolean;
  toets: (actie: string) => void;
  /**
   * Wat er staat zolang er nog nooit een heel beeld getekend is, en zolang de
   * telefoon niet kan weten wat er te zien is (een plugin zonder getallen en
   * zonder meshvlaggen; zie `zichtbaarheidBekend`).
   */
  fallback?: JSX.Element;
}

/**
 * Het scherm van één apparaat, zo breed als de ouder, in de verhouding van het
 * echte scherm.
 *
 * Het canvas krijgt zoveel beeldpunten als het in beeld beslaat (CSS-maat maal
 * devicePixelRatio, ook onder de `zoom` van de tablet), dus de letters van OMSI
 * blijven scherp op een telefoon van 330 breed en op een iPad.
 *
 * De aanraakvlakken horen bij het beeld dat er STAAT, niet bij de nieuwste
 * stand: zolang het plaatje van een nieuw menu nog onderweg is, blijft het oude
 * menu staan, en dan moeten ook zijn knoppen blijven. Anders tikte je op
 * 'Einstieg vorn' en kreeg de bus de knop van het volgende menu.
 */
export function Apparaatscherm({
  vorm,
  stand,
  textuurAdres,
  kan,
  toets,
  fallback,
}: ApparaatschermProps): JSX.Element {
  const doekRef = useRef<HTMLCanvasElement>(null);
  /* De stand die nu op het canvas staat; null zolang er nog niets getekend is. */
  const [getekend, setGetekend] = useState<Schermstand | null>(null);
  const onzeker = !zichtbaarheidBekend(vorm, stand);
  const tekenen = !(onzeker && fallback !== undefined);
  const nu = useRef({ vorm, stand, textuurAdres, tekenen });
  const [tekenaar] = useState(
    () => new Tekenaar(() => nu.current, (getoond) => setGetekend(getoond)),
  );

  /* Elke nieuwe stand of vorm: opnieuw tekenen (als er iets veranderd is). */
  useLayoutEffect(() => {
    nu.current = { vorm, stand, textuurAdres, tekenen };
    tekenaar.vraag();
  }, [vorm, stand, textuurAdres, tekenen, tekenaar]);

  /* Het canvas, de maat ervan, en het seintje als er een plaatje binnenkomt. */
  useEffect(() => {
    const doek = doekRef.current;
    if (!doek) return;
    tekenaar.doek = doek;
    luisteraars.add(tekenaar.vraag);

    /* Of de browser de echte beeldpunten al eens gaf; dan is hij de enige die meet. */
    let echtGezien = false;
    const meet = (entry?: ResizeObserverEntry): void => {
      /*
       * Het liefst de echte beeldpunten van de browser (Chromium, Firefox).
       * Anders (Safari) de CSS-maat van het canvas maal de `zoom` van het paneel
       * maal devicePixelRatio. Niet getBoundingClientRect: die telt de zoom in
       * Chromium sinds versie 128 wel mee, maar WebKit deelt nog door de zoom,
       * zoals Chromium vroeger -- op een iPad met zoom 1,9 werd het canvas dan
       * bijna twee keer te klein en de letters wazig. getComputedStyle geeft in
       * allebei de maat zonder zoom. Niet door elkaar met de echte beeldpunten:
       * de twee ronden anders af, en dan wisselde het canvas om de beurt een punt.
       */
      const echt = entry?.devicePixelContentBoxSize?.[0];
      let breed: number;
      let hoog: number;
      if (echt && echt.inlineSize > 0) {
        echtGezien = true;
        breed = echt.inlineSize;
        hoog = echt.blockSize;
      } else if (echtGezien) {
        return;
      } else {
        const stijl = getComputedStyle(doek);
        const schaal = zoomVan(doek) * (window.devicePixelRatio || 1);
        breed = parseFloat(stijl.width) * schaal;
        hoog = parseFloat(stijl.height) * schaal;
      }
      if (!(breed > 0) || !(hoog > 0)) return;
      const [b, h] = canvasMaat(breed, hoog);
      if (b === tekenaar.breed && h === tekenaar.hoog) return;
      tekenaar.breed = b;
      tekenaar.hoog = h;
      tekenaar.vraag();
    };
    const kijker = new ResizeObserver((entries) => meet(entries[entries.length - 1]));
    try {
      kijker.observe(doek, { box: "device-pixel-content-box" });
    } catch {
      /* Safari kent die maat niet. */
      kijker.observe(doek);
    }
    meet();
    /*
     * Wat de kijker in Safari mist: een andere `zoom` van het paneel (de tablet
     * schaalt bij het draaien) laat de CSS-maat van het canvas gelijk, en een
     * ander devicePixelRatio (het venster naar een ander scherm) ook. Dan na
     * een draai of een wissel even opnieuw meten, als de nieuwe opmaak er staat.
     */
    let later: number | undefined;
    const straks = (): void => {
      window.clearTimeout(later);
      later = window.setTimeout(() => meet(), 120);
    };
    window.addEventListener("resize", straks);
    let scherpte: MediaQueryList | undefined;
    const volgScherpte = (): void => {
      scherpte?.removeEventListener("change", opScherpte);
      scherpte = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      scherpte?.addEventListener("change", opScherpte);
    };
    function opScherpte(): void {
      volgScherpte();
      straks();
    }
    volgScherpte();
    /* Ook na een tweede keer opzetten (StrictMode) meteen tekenen, niet pas bij de volgende stand. */
    tekenaar.vraag();

    return () => {
      window.clearTimeout(later);
      window.removeEventListener("resize", straks);
      scherpte?.removeEventListener("change", opScherpte);
      kijker.disconnect();
      luisteraars.delete(tekenaar.vraag);
      tekenaar.stop();
      tekenaar.doek = null;
    };
  }, [tekenaar]);

  const heeftBeeld = getekend !== null;
  const wacht = fallback !== undefined && (!heeftBeeld || onzeker);
  /* De knoppen van het beeld dat er staat, en alleen als dat bij deze vorm hoort. */
  const klikStand = getekend && getekend.vorm === vorm.id ? getekend : undefined;
  const stijl = {
    ["--scherm-verhouding" as string]: String(vorm.verhouding > 0 ? vorm.verhouding : 1),
  } as CSSProperties;

  return (
    /*
     * data-hit: in de overlay vangt het venster de muis alleen waar dat staat.
     * Zonder gingen de klik en het wieltje door het scherm heen naar OMSI.
     */
    <div
      className="apparaatscherm"
      data-hit
      data-beeld={heeftBeeld ? "ja" : "nee"}
      style={stijl}
    >
      {wacht && fallback}
      <div
        className={wacht ? "scherm-vlak wacht" : "scherm-vlak"}
        style={{ background: vorm.leeg }}
        aria-hidden={wacht || undefined}
      >
        <canvas ref={doekRef} className="scherm-doek" aria-hidden="true" />
        {/*
          De aanraakvlakken, onzichtbaar over het plaatje: je drukt op de knop
          die je op het scherm van de bus ziet. In de volgorde van de vorm, dus
          de voorste als laatste -- bij overlap krijgt die de tik, net als in
          klikOp (shared/schermteken.ts). Zolang de terugval staat, geen.
        */}
        {!wacht &&
          klikStand &&
          zichtbareKlikken(vorm, klikStand).map((index) => {
            const klik = vorm.klikken[index];
            /*
             * Een maat die geen getal is (NaN komt als null over het netwerk,
             * en binnen(null) is 0) geeft geen knop; klikOp slaat hem ook over.
             */
            if (!isRechthoek(klik)) return null;
            /* Binnen het scherm gehouden: wat erbuiten steekt, gaf een schuifbalk. */
            const x0 = binnen(klik.x);
            const y0 = binnen(klik.y);
            const b = binnen(klik.x + klik.b) - x0;
            const h = binnen(klik.y + klik.h) - y0;
            /* Helemaal buiten het scherm: geen knop. */
            if (!(b > 0) || !(h > 0)) return null;
            return (
              <button
                key={`${vorm.id}:${index}`}
                type="button"
                className="scherm-klik"
                data-actie={klik.actie}
                style={{
                  left: procent(x0),
                  top: procent(y0),
                  width: procent(b),
                  height: procent(h),
                }}
                disabled={!kan(klik.actie)}
                aria-label={klik.opschrift || klik.actie}
                onPointerDown={licht}
                onClick={() => toets(klik.actie)}
              />
            );
          })}
      </div>
    </div>
  );
}
