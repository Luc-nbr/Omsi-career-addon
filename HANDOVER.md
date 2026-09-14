# Overdracht — OMSI Career

Dit bestand is bedoeld voor wie het werk overneemt. Het beschrijft wat er staat,
wat er is nagerekend, waar de valkuilen zitten en wat er nog open ligt.

Repo: https://github.com/Luc-nbr/Omsi-career-addon — tak `master`.

---

## 1. Wat het is

Een Windows-app die van OMSI 2 een carrièremodus maakt, in de geest van Advanced
Omni Bus Driver maar modern. De gebruiker kiest een kaart en een dienstlengte; de
app zoekt een echte omloop uit de dienstregeling van die kaart, geeft een
dienstkaart met de IBIS-codes, laat op een kaartje zien waar de bus neergezet
moet worden, start OMSI en hangt een overlay boven het spel met live gegevens.

Electron 33 + electron-vite + React 19 + TypeScript. `npm run dev` voor
ontwikkelen, `npm run typecheck`, `npm run build`, `npm run dist` voor de
installer.

**De app schrijft niets in de spelmap** behalve de overlay-plugin in `plugins/`.
Dat is een bewuste grens: eerdere experimenten met situatiebestanden zijn
teruggedraaid.

---

## 2. Werkafspraken met de gebruiker

- **Antwoord in het Nederlands.** De gebruiker is Nederlandstalig.
- **Code-commentaar en commitberichten in het Nederlands**, in de stijl die er
  staat: leg uit *waarom*, niet *wat*. Kijk naar bestaande commits.
- **Geen processen van de gebruiker afschieten.** Als een bestand vastzit omdat
  de app draait, meld dat en laat de keuze aan hem.
- **De installer bouwen naar een tijdelijke map**
  (`npx electron-builder -c.directories.output=<tmp>`) en daarna kopiëren.
  Defender houdt `release/` regelmatig vast.
- **Valkuil: heredocs eten backslashes.** Python-scripts met `\` erin (paden,
  regex) moeten met het Write-gereedschap geschreven worden, niet via
  `python - <<'PY'`. Dit is meerdere keren misgegaan.
- De gebruiker draait Smart App Control; ongetekende exes worden geblokkeerd.
  `Start OMSI Career.cmd` start de app via `node_modules\electron\dist\electron.exe`.

---

## 3. Wat er staat, per laag

### `src/core/` — lezen van OMSI-bestanden (geen Electron-afhankelijkheden)

| Bestand | Rol |
|---|---|
| `omsiFile.ts` | Coderingsbewuste lezer (UTF-16LE met BOM óf Windows-1252) en `blockTag` |
| `timetable.ts` | `.ttl` (omlopen), `.ttp` (ritten), `Busstops.cfg` → `OmsiMap` |
| `network.ts` | Koppelt ritten aan elkaar tot doorlopende omlopen |
| `duty.ts` | Kiest een dienst van ongeveer de gevraagde lengte |
| `fleet.ts` | Wagenpark van de kaart uit `ailists.cfg`, en buskeuze |
| `hof.ts` | `.hof`-bestanden: bestemmingscodes en routes per wagenpark |
| `ibis.ts` | Bouwt het IBIS-plan (lijn + route per rit) |
| `geo.ts` | Halteposities en wegennet uit de tegels |
| `roads.ts` | Spline-meetkunde en -classificatie |
| `live.ts` | Leest `live.json` van de plugin, maakt er een `LiveStatus` van |
| `career.ts` | Loopbaan: diensten, uren, rangen |
| `profiles.ts` | Profielen in `%APPDATA%\omsi-career\profiles\` |
| `settings.ts` | Taal, in `settings.json` |
| `overlayLayout.ts` | Indeling van de overlay, in `overlay.json` |

### `src/shared/`

- `i18n.ts` — alle teksten, vier talen (en/de/fr/nl), Engels is standaard en
  terugval. Sleutels die pas tijdens het draaien bekend zijn (rangen,
  stemmingen, adviezen) gaan via `loose()`.
- `format.ts` — tijd, duur, bedrag, dagen. Alles wat een taal kent neemt die als
  laatste argument.
- `overlay.ts` — indeling en standen van de overlay.
- `api.ts` — het contract tussen hoofdproces en interface.

### `src/renderer/src/`

- `App.tsx` — hoofdscherm, laadt instellingen, zet de `LanguageProvider`.
- `Welcome.tsx` — eerste start: taal kiezen en een account aanmaken.
- `DutyCard.tsx` — de dienstkaart met alle deelpanelen.
- `RouteMap.tsx` — de kaart (wegennet, halteborden, zoomen, slepen).
- `DutyMap.tsx` — het paneel eromheen plus het routevenster.
- `overlay.tsx` — de overlay boven het spel.
- `receipt.tsx` — het kaartje voor de bonprinter.
- `language.tsx` — `useT()` en `useLanguage()`.

### `plugin/`

Een 32-bits DLL in C die OMSI laadt. Schrijft `%LOCALAPPDATA%\OMSI Career\live.json`.
Zie `README.md` voor de details; die zijn duur betaald en staan er goed in.

---

## 4. Wat is nagerekend (niet aannemen — gemeten)

Deze getallen komen uit `scripts/probe-geo.ts` en `scripts/probe-roads.ts`.
Draai ze opnieuw als je aan `geo.ts` of `roads.ts` komt.

**Tegelmeetkunde (`geo.ts`, `roads.ts`)**

- Een tegel is 300 × 300 m; `tile_X_Y.map`.
- In een `[object]`-blok zijn veld 4 en 5 de grondcoördinaten, veld 6 de hoogte.
- In een `[spline]`-blok staat de hoogte **tussen** de twee grondcoördinaten in.
- Richting: graden, noord is nul, met de klok mee. Recht:
  `eind = start + lengte · (sin θ, cos θ)`. Bocht: `θ = lengte / straal`, lokaal
  `(R(1−cos t), R sin t)`, positieve straal buigt naar rechts.
- **Er bestaan twee veldindelingen naast elkaar**, ook binnen dezelfde
  tegelversie: de meeste blokken noemen de vorige én de volgende spline, een deel
  alleen de vorige. In Rheinhausen staan ze door elkaar. `parseSpline()` kiest per
  blok op inhoud (een koppelveld is een heel getal, een lengte is nooit negatief).
- Proef op de som: het eindpunt van elke spline valt op het beginpunt van de
  volgende, **mediane afwijking 0,000 m over 37.772 koppelingen** in acht kaarten.

**Classificatie van splines**

Het `.sli`-bestand zegt zelf wat het is: elk `[path]`-blok noemt zijn
verkeerssoort in het eerste veld — 0 AI-wegverkeer, 1 voetgangers, 2 spoor. OMSI
documenteert dat in `Splines\Ruede\rail_concrete_01.sli`. Op de naam filteren
werkt niet: Thüringer Wald gebruikt achthonderd verschillende splinebestanden.

---

## 5. Openstaand werk

### 5.1 De wegen kloppen niet overal — gemeten, diagnose rond

De gebruiker meldde dat de route door leegte loopt terwijl er wegen naast liggen.
`npx tsx scripts/probe-roads.ts` meet per kaart hoe ver een halte van de
dichtstbijzijnde weg ligt:

```
Berlin-Spandau     718 wegen | mediaan  19,6 m | binnen 25 m: 56%
Grundorf            45 wegen | mediaan   4,9 m | binnen 25 m: 93%
HafenCityHamburg   387 wegen | mediaan 367,0 m | binnen 25 m:  7%
Hamburg109          53 wegen | mediaan 784,2 m | binnen 25 m:  4%
Hamburg109_2        44 wegen | mediaan 797,7 m | binnen 25 m:  2%
HamburgLi20        467 wegen | mediaan 306,7 m | binnen 25 m:  9%
Rheinhausen       1101 wegen | mediaan  33,6 m | binnen 25 m: 42%
TH_Wald           1102 wegen | mediaan  24,5 m | binnen 25 m: 51%
```

**De meetkunde is niet stuk.** Grundorf zit op 4,9 m mediaan — dat is precies wat
je verwacht van een halte aan de weg. Het probleem is dekking: veel kaarten
bouwen hun straten helemaal niet uit splines. Hamburg109 gebruikt 275 keer
`rail_concrete_01.sli` en maar 35 keer `invis_street.sli`; de zichtbare straten
zijn scenery-objecten, en die dragen geen `[path]` (nagekeken: van 12.468
objecten nul).

Aanbevolen aanpak — niet meer wegen verzinnen, maar eerlijk zijn over dekking:

1. Reken bij het inlezen de dekking uit (aandeel haltes binnen 25 m van een weg).
2. Onder pakweg 35% de weglaag **niet tekenen**. Een half wegennet leest als een
   kapotte kaart; alleen de route en de haltes is rustiger en klopt wel.
3. Zet de dekking in `MapGeometry`, zodat de interface de keuze kan maken.

### 5.2 Wensen van de gebruiker voor de overlay (nog niet gebouwd)

Woordelijk gevraagd, in deze volgorde:

1. **Knop in de overlay zelf om de indeling aan te passen** — "een knopje met pas
   layout aan". Nu kan dat alleen via de app of Ctrl+Alt+O. Vertaling staat al
   klaar: `ovl.layout`. Let op: de overlay laat muisklikken door; een knop moet
   `data-hit` dragen (zie het `mousemove`-mechanisme in `overlay.tsx`).
2. **Centreerknop in het navigatiescherm** — vertaling `ovl.centre` staat klaar.
3. **De kaart tekent pas een lijn als de IBIS gegevens heeft.** Zolang de
   chauffeur lijn en route niet heeft ingetoetst, is elke lijn een gok. Teksten
   staan klaar: `ovl.mapWaiting`.
4. **Het infoscherm toont eerst wat er ingetoetst moet worden** (lijn + route uit
   het IBIS-plan), en schakelt om zodra de plugin terugmeldt dat de IBIS gevuld
   is. De schakelaar is `status.reportsStops` (waar als de bus een haltenaam
   teruggeeft). Teksten: `ovl.ibisTitle`, `ovl.ibisWaiting`, `ovl.ibisNoSupport`.
5. **Slepen om de route te bekijken, en na zes seconden stilte terugkeren** naar
   de bus, met een stipje waar de bus staat.

Voor punt 5 was het ontwerp al rond, alleen niet meer gebouwd:

- `RouteMap` krijgt `travelledM`, `showRoute`, `showCentre`.
- Een `manual`-toestand die aangaat bij wiel/sleep en na `IDLE_MS = 6000`
  vanzelf uitgaat; het meerijden (`follow`) slaat over zolang `manual` aan staat.
  De centreerknop zet hem meteen uit.
- **Het stipje**: OMSI geeft geen positie door — de plugin-API kent er geen
  variabele voor, en Omni Navigation (dat bij de gebruiker geïnstalleerd staat)
  komt niet verder; dat is een Lazarus-venster dat alleen tekst uitleest. Maar de
  kilometerteller komt wél mee: `status.odometerKm` is er net voor toegevoegd.
  Onthoud de stand op het moment dat `stopIndex` verspringt, en zet de stip op
  `(km_nu − km_bij_halte) / (hemelsbrede afstand × 1,25)` van de vorige naar de
  volgende halte. Die 1,25 vangt op dat een straat niet recht loopt. Het is een
  schatting en dat hoort er ook bij te staan (`ovl.busHere`).

### 5.3 Kleiner grut

- De blauwe routelijn loopt recht van halte naar halte, niet door de bochten van
  de straat. OMSI legt voor buslijnen geen vaste route vast (alleen treinen
  hebben `.ttr`). Het is te berekenen: het splinenetwerk is een graaf en de
  haltes liggen erop, dus een kortste pad tussen opeenvolgende haltes kan. Dat is
  een klus van een uur of wat en staat los van 5.1.
- De drie standen van het overlay-paneel zijn nog niet naast elkaar bekeken: er
  staat een oude `live.json` op de machine van de gebruiker waarin de dienst als
  uitgereden staat, en dan valt het paneel in alle standen terug op één regel.
- De draagbare exe in `release/` is ouder dan de rest omdat hij draaide tijdens
  het bouwen. `Setup.exe` is wel bij (20:39, alles tot en met de vlaggen).

---

## 6. Hoe je iets nakijkt zonder de gebruiker lastig te vallen

Er staan probes in `scripts/`:

- `probe-geo.ts` — haltes, wegen, snelheid, en de aansluitingsproef.
- `probe-roads.ts` — afstand van haltes tot de dichtstbijzijnde weg.
- `probe.ts`, `probeChain.ts` — dienstregeling en ketens.

Schermafdrukken maken kan door het hoofdproces te laden in een klein
Electron-scriptje en de renderer met `executeJavaScript` te bedienen; zie de
`screenshot*.cjs`-scripts. Voor het welkomsscherm: zet eerst
`app.setPath('userData', <tijdelijke map>)` zodat de echte profielen van de
gebruiker onaangeroerd blijven. De overlay kun je met een nepframe voeden via
`webContents.send('overlay:frame', …)`.

---

## 7. Dingen die geweigerd zijn, en waarom

- **Smart App Control uitzetten** — dat is een beveiligingsinstelling, kan niet
  per app, en uitzetten is onomkeerbaar zonder Windows opnieuw te installeren.
- **De door Defender in quarantaine gezette `d3d9.dll` terugzetten** — dat was
  DXVK; de gebruiker beslist zelf over zijn virusscanner.
- **De UI ín het spel vervangen** — dat zijn Delphi-interne zaken in `Omsi.exe`,
  daar kom je alleen met code-injectie. Een launcher *vóór* het spel kan wel;
  `options.cfg` (48 instellingen), `Inputs/keyboard.cfg` (128 toetsen) en
  `Inputs/ENG.kyb` zijn gewone tekstbestanden en de rondgang lezen→schrijven is
  byte-identiek nagerekend. Dat plan ligt er, maar is nooit gebouwd.
