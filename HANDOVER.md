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
- **Valkuil: PowerShell 5.1 verminkt UTF-8.** `Get-Content -Raw` leest de
  bronbestanden als Windows-1252; wie dat met `Set-Content` terugschrijft maakt
  van "één" "Ã©Ã©n". Tijdelijke wijzigingen met het Edit-gereedschap doen.
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
| `geo.ts` | Tegelraster, halteposities, wegennet en rijstroken uit de tegels |
| `roads.ts` | Spline- en objectbanen: meetkunde, soort verkeer, rijrichting |
| `track.ts` | Route van een rit uit OMSI's eigen `.ttr` |
| `routing.ts` | Rijstrokennet en routeplanner van halte naar halte; kiest per rit `.ttr` of planner |
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
- `RouteMap.tsx` — de kaart (halteborden, routes, zoomen, slepen), in SVG.
- `roadLayer.ts` — het wegennet op een canvas onder die SVG; per vak van 300 m
  gesneden en uitgezoomd gebufferd. Als één SVG-pad kostte slepen over
  HamburgLi20 350 ms per beeld, zo 7 ms.
- `DutyMap.tsx` — het paneel eromheen plus het routevenster.
- `overlay.tsx` — de overlay boven het spel.
- `receipt.tsx` — het kaartje voor de bonprinter.
- `language.tsx` — `useT()` en `useLanguage()`.

### `plugin/`

Een 32-bits DLL in C die OMSI laadt. Schrijft `%LOCALAPPDATA%\OMSI Career\live.json`.
Zie `README.md` voor de details; die zijn duur betaald en staan er goed in.

---

## 4. Wat is nagerekend (niet aannemen — gemeten)

Deze getallen komen uit de probes in `scripts/` (zie §6). Draai ze opnieuw als je
aan `geo.ts`, `roads.ts`, `track.ts` of `routing.ts` komt.

**Tegelmeetkunde (`geo.ts`, `roads.ts`)**

- Een tegel is 300 × 300 m; `tile_X_Y.map`. **Behalve** als `global.cfg` een
  regel `[worldcoordinates]` heeft: dan volgen de tegels het Mercator-raster van
  OpenStreetMap op 65.536 tegels, en is een tegel `2π·6378137/65536 · cos(φ)`
  meter, met `φ = atan(sinh(2π·y/65536))`. Berlin-Spandau is zo gebouwd (371,7 m).
  Met 300 m lagen daar alle 341 splinekoppelingen over een tegelgrens precies
  71,7 m verkeerd; met het raster 2 van de 341. Zie `readTileGrid()`.
- Blokken die weg dragen: `[spline]`, `[spline_h]` (zelfde indeling, met
  hoogteverloop) en `[object]` waarvan de `.sco` `[path]`-blokken heeft.
  Kruisingen, rotondes en in Hamburg hele straten zijn zulke objecten.
- Een `[spline]` kan een losse regel `mirror` hebben (Thüringer Wald): het
  dwarsprofiel ligt gespiegeld, rijstroken wisselen van kant én van richting.
- In een `[object]`-blok zijn veld 4 en 5 de grondcoördinaten, veld 6 de hoogte.
- In een `[spline]`-blok staat de hoogte **tussen** de twee grondcoördinaten in.
- Richting: graden, noord is nul, met de klok mee. Recht:
  `eind = start + lengte · (sin θ, cos θ)`. Bocht: `θ = lengte / straal`, lokaal
  `(R(1−cos t), R sin t)`, positieve straal buigt naar rechts.
- **Er bestaan twee veldindelingen naast elkaar**, ook binnen dezelfde
  tegelversie: de meeste blokken noemen de vorige én de volgende spline, een deel
  alleen de vorige. In Rheinhausen staan ze door elkaar. `parseSpline()` kiest per
  blok op inhoud (een koppelveld is een heel getal, een lengte is nooit negatief).
- Proef op de som (`probe-geo.ts`): het eindpunt van elke spline valt op het
  beginpunt van de volgende. Kijk naar het aantal **boven 1 m**, niet alleen naar
  de mediaan: die stond in Spandau op 0,000 terwijl een op de vier koppelingen
  72 m verkeerd lag. Nu hooguit 16 per kaart.

**Banen: soort, plek, richting**

- `.sli`: `[path]` en `[path_2]` (één veld extra; de DDR-straten van Spandau
  hebben alleen die). Velden: soort verkeer (0 weg, 1 voetganger, 2 spoor),
  zijwaartse afstand (rechts positief), hoogte, breedte, richting.
- `.sco`: `[path]` met x, y, hoogte, richting, straal, lengte, twee hellingen,
  soort verkeer, breedte, rijrichting, knipperlicht.
- Rijrichting: 0 met de baan mee, 1 ertegenin, 2 beide. Nagemeten tegen de
  routes die OMSI zelf in `.ttr`-bestanden rijdt (`probe-tracks.ts`): Hamburg109
  14.830 banen mee en 0 tegen; TH_Wald 39.593 tegen 4, maar alleen mét `mirror`.
- Objecten draaien met de klok mee en de baanrichting telt op bij die van het
  object (`probe-objjoin.ts`).
- Op de naam filteren werkt niet: Thüringer Wald gebruikt achthonderd
  verschillende splinebestanden.

**Routes (`track.ts`, `routing.ts`)**

- Niet alleen treinen hebben een `.ttr`: Grundorf 3/3 ritten, TH_Wald 165/165,
  Hamburg109 113/124. Rheinhausen heeft er geen. Een `[track_entry]` is: id van
  spline of object in de tegel, volgnummer van de baan daarin (stoepen tellen
  mee), volgnummer van de tegel in `global.cfg`, volgnummer in de tegel, lengte.
- Een `.ttr` wordt niet bijgewerkt als de kaart verandert; hij wordt alleen
  gebruikt als alle banen gevonden zijn, alles naadloos aansluit en elke halte
  binnen 15 m ligt. Anders plant `LaneNetwork`.
- Planner tegen OMSI's eigen routes (`probe-routing.ts`): mediaan 100% van de lijn
  binnen 5 m in TH_Wald, HamburgLi20, Grundorf. Gevonden haltestukken: Spandau
  1392/1474, Rheinhausen 948/972, HamburgLi20 4116/4209. Wat mist valt terug op
  een rechte lijn.
- Losse rijstrookuiteinden koppelen aan een evenwijdige rijstrook binnen 12 m is
  nodig (zonder: Spandau 978, TH_Wald 878). Rijstrookwissels zijn geprobeerd en
  weer verwijderd: +9 stukken, twee keer zo traag.

---

## 5. Openstaand werk

### 5.1 Wegennet en routes — opgelost, met twee losse eindjes

Het wegennet was niet te dun omdat kaarten geen splines gebruiken, maar omdat we
de helft niet lazen (`[spline_h]`, `[path_2]`, objecten met rijbanen) en Spandau
op het verkeerde tegelraster lag. Haltes binnen 25 m van een weg: nu 93–100% op
elke kaart (was 2–93%). Routes volgen de weg, zie §4.

Nog open:

- **Trams en stadsbanen rijden over de weg.** Lijn 5 in Rheinhausen is een
  stadsbaan zonder `.ttr`; de planner kent alleen wegrijstroken en neemt de straat
  naast het spoor. Oplossing: ook een spoornet bouwen en per rit kiezen welk net
  de haltes het best bedient.
- **Onvolledig geïnstalleerde kaarten** zoals `Vienna_2005_Line_24A` hebben geen
  enkele tegel; de kaart blijft leeg. Dat is juist, maar er staat nog geen
  uitleg bij in de interface.

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
  variabele voor. Omni Navigation (dat bij de gebruiker geïnstalleerd staat) is
  een Java-programma met een eigen plugin-DLL dat per tegel een wegenkaart als
  plaatje maakt (`OmniNavigation\res\<kaart>\tile_X_Y.map.roadmap.png`); of die
  DLL de positie van de bus uitleest is niet nagekeken. Maar de
  kilometerteller komt wél mee: `status.odometerKm` is er net voor toegevoegd.
  Onthoud de stand op het moment dat `stopIndex` verspringt, en zet de stip op
  `(km_nu − km_bij_halte) / (hemelsbrede afstand × 1,25)` van de vorige naar de
  volgende halte. Die 1,25 vangt op dat een straat niet recht loopt. Het is een
  schatting en dat hoort er ook bij te staan (`ovl.busHere`).

### 5.3 Kleiner grut

- De routes worden in het hoofdproces uitgerekend, synchroon. Het rijstrokennet
  opbouwen kost tot een seconde (HamburgLi20); het inlezen van TH_Wald 2,5 s. Zo
  lang staat de overlay stil. Verhuizen naar een worker kan.
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
- `probe-objjoin.ts` — draairichting van objecten, aan de aansluiting gemeten.
- `probe-tracks.ts` — routes uit `.ttr`: aansluiting, haltes, rijrichting.
- `probe-routing.ts` — de routeplanner, en hoe dicht hij bij OMSI's routes blijft.
- `render-roads.ts`, `render-area.ts` + `rasterize.cjs` — het wegennet of een
  uitsnede met rijrichtingen als plaatje, om een haperende plek te bekijken.
- `screenshotMap.cjs` — de kaart in de echte app op een gekozen kaart, met
  tijdelijke gebruikersmap, plus framtijden van slepen en zoomen.
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
