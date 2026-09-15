# Overdracht — OMSI Enhancer

Dit bestand is bedoeld voor wie het werk overneemt. Het beschrijft wat er staat,
wat er is nagerekend, waar de valkuilen zitten en wat er nog open ligt.

Repo: https://github.com/Luc-nbr/Omsi-career-addon — tak `master`.

---

## 1. Wat het is

Een Windows-app die van OMSI 2 een carrièremodus maakt, in de geest van Advanced
Omni Bus Driver maar modern. De app heette eerst OMSI Career; sinds hij ook de
instellingen en de toetsen van het spel beheert heet hij **OMSI Enhancer**. De
map met gebruikersgegevens heet daardoor `%APPDATA%\omsi-enhancer`, en bij de
eerste start worden de profielen uit `%APPDATA%\omsi-career` overgenomen (een
kopie, dus de oude versie blijft werken). Twee dingen houden hun oude naam met
opzet: de map `%LOCALAPPDATA%\OMSI Career` waar de plugin zijn `live.json`
neerzet -- dat pad zit in de DLL -- en de kopie `laststn.osn.voor-omsi-career`
die er bij sommigen al staat. De app zoekt een echte omloop uit de dienstregeling
van een kaart, geeft een dienstkaart met de IBIS-codes, zet de dienst klaar in
OMSI (kaart, bus, datum, tijd, dienstregeling), start het spel en hangt een
overlay boven het spel met live gegevens.

De app opent altijd met twee vragen: **wie rijdt er** (profielkeuze) en **hoe wil
je rijden**. Die tweede vraag kent drie antwoorden:

- **Carrière** — met papieren. Zonder rijexamen mag je niets; dat examen doe je op
  een route die je zelf kiest, en die route is daarna je eerste vergunning. Elke
  lijn erbij vraagt een eigen examen. De remise wijst de dienst toe en kiest
  alleen uit lijnen waar je een vergunning voor hebt.
- **Dienst** — hetzelfde rijden zonder die regels: eigen route, eigen lengte.
- **Vrij rijden** — niets wordt geboekt of beoordeeld. Je kiest lijn, bus, plek,
  weer, datum en tijd; de app zet het klaar en biedt de overlay aan.

Daarnaast beheert de app de **instellingen, toetsen en gamecontrollers van OMSI
zelf**: 33 van de 47 blokken uit `options.cfg` met uitleg erbij in vier talen,
alle 128 toetsbindingen uit `Inputs\keyboard.cfg`, en de apparaten uit
`Inputs\gamectrler.cfg` met hun assen en knoppen -- met de namen die OMSI er zelf
aan geeft. Bij de controllers beweegt de balk mee terwijl je stuurt of trapt (de
Gamepad-API van de browser), en een wizard vraagt de belangrijkste twaalf dingen
na; elke stap mag worden overgeslagen en de wizard ook. Er wordt alleen
geschreven wat je verandert; de rest van elk bestand blijft byte voor byte staan
(`probe-gamecfg.ts`, `probe-controllers.ts`).

Electron 33 + electron-vite + React 19 + TypeScript. `npm run dev` voor
ontwikkelen, `npm run typecheck`, `npm run build`, `npm run dist` voor de
installer.

**Wat de app in de spelmap schrijft**: de overlay-plugin in `plugins/`, en bij
het starten van een dienst `Situations\OMSI Enhancer.osn` (kaart, datum, tijd, bus
bij de eerste halte, gekozen dienstregeling) plus het weerbestand ernaast. Om het
startscherm van OMSI goed te zetten gaat diezelfde situatie ook naar
`maps\<kaart>\laststn.osn` -- daar leest OMSI "Last Situation" -- en wordt
`[last_map]` in `options.cfg` op die kaart gezet. Van de bestaande `laststn.osn`
blijft eenmalig een kopie staan als `laststn.osn.voor-omsi-career`. Verder niets.

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
  `Start OMSI Enhancer.cmd` start de app via `node_modules\electron\dist\electron.exe`.

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
| `career.ts` | Loopbaan: diensten, uren, rangen, modi, vergunningen, examens |
| `exam.ts` | De eisen van het rijexamen en het oordeel erover |
| `startup.ts` | Het startscherm van OMSI: `laststn.osn` en `[last_map]` |
| `omsiOptions.ts` | `options.cfg` regel voor regel lezen en terugschrijven |
| `gameSettings.ts` | De brug tussen die blokken en de schuiven in het scherm |
| `omsiKeys.ts` | `keyboard.cfg`, de toetsnamen (`.kyb`) en de handelingen (`.olf`) |
| `omsiControllers.ts` | `gamectrler.cfg`: apparaten, assen en knoppen |
| `weather.ts` | Schrijft het `.owt`-bestand bij een situatie |
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
- `weather.ts` — de weertypes waaruit gekozen kan worden, met hun waarden. Staat
  hier en niet in `core/` omdat de interface ze toont; de schrijver zit in
  `core/weather.ts`.
- `api.ts` — het contract tussen hoofdproces en interface.

### `src/renderer/src/`

- `App.tsx` — de drie schermen (chauffeur, modus, rijden), laadt instellingen,
  zet de `LanguageProvider`.
- `Profiles.tsx` — wie rijdt er? Het scherm waarmee de app opent.
- `Modes.tsx` — carrière, dienst of vrij rijden.
- `CareerPanel.tsx` — rijexamen, lijnexamens en de vergunningen.
- `FreePlay.tsx` — lijn, bus, plek, weer, datum en tijd zelf samenstellen.
- `LinePicker.tsx` — een lijn kiezen; wat OMSI een lijn noemt is een bestand.
- `GameSetup.tsx` — de instellingen, de toetsen en de controllers van OMSI.
- `Controllers.tsx` — apparaten, assen met een meebewegende balk, knoppen met
  zoeken, en de wizard voor een nieuw apparaat.
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

**Situaties en het startscherm (`situation.ts`, `startup.ts`)**

- Een situatie kan `[TT_active]` dragen (vlag: er wordt met een dienstregeling
  gereden, met een lege regel erachter) en per voertuig `[settimetable]`. Dat
  laatste blok heeft zes velden: lijnbestand, naam van de omloop, volgnummer van
  de rit in die omloop, halte, een vlag, en de afwijking op de dienstregeling in
  seconden. Afgelezen aan de twee situaties die OMSI zelf schreef en nagerekend
  tegen de dienstregeling (`probe-settimetable.ts`): in het Spandau-scenario is
  veld 3 elf, en rit 11 van omloop "Mo-Fr 6" vertrekt om 14:04 terwijl de klok in
  het bestand op 14:06 staat.
- `options.cfg` is **gewone tekst in de Windows-codering met CRLF**, geen UTF-16.
  Lees en schrijf hem als losse bytes (`latin1`), dan blijven umlauten heel.
  `[last_map]` bepaalt op welke kaart het startscherm opent.
- Het startscherm biedt bovenaan "Last Situation" aan; dat is
  `maps\<kaart>\laststn.osn`. OMSI schrijft dat bestand zelf bij het afsluiten.
- Weer staat in `<situatie>.osn.owt`, UTF-16, zelfde blokindeling: `[fog]` (zicht
  in meters, helderheid), `[wind]`, `[temp]`, `[press]`, `[clouds]` (textuurnaam
  of -1, wolkenbasis in meters), `[precip]` (eerste veld 0 droog, 1 nat) en
  `[groundwet]`. De vijf keuzes in de app komen uit het weer dat OMSI meelevert.

**De instellingen en toetsen van OMSI (`omsiOptions.ts`, `omsiKeys.ts`)**

- `options.cfg` en `Inputs\keyboard.cfg` zijn **gewone tekst in de
  Windows-codering met CRLF**. Lezen en schrijven als losse bytes (`latin1`)
  houdt umlauten heel. Beide gaan byte-identiek heen en weer; zie
  `probe-gamecfg.ts`, dat ook een vlag aan- en uitzet en controleert dat het
  bestand daarna weer gelijk is.
- Een blok in `options.cfg` heeft nul of meer waarderegels. **Nul betekent uit**
  bij de vlaggen: `[no_collision]` staat altijd in het bestand, met een lege
  regel eronder als hij uit staat. Zou de aanwezigheid van het blok "aan"
  betekenen, dan zou niemand ooit botsingen hebben. "Aan" schrijven we als `1`.
- Tussen de blokken staan kopregels (" GRAPHICS -------"). Die horen bij niets;
  de lezer stopt op een regel met `-----`.
- `keyboard.cfg` heeft twee secties met samen 128 `[entry]`-blokken van drie
  regels: handeling, scancode, en een getal met de modificatietoetsen. **Bit 2 is
  Shift, bit 4 is Ctrl** -- af te lezen aan de IBIS-cijfers (Ctrl+numeriek) en aan
  "Quit OMSI" op Ctrl+Q. Bit 1 zit op gas, rem, sturen en nog wat; wat dat
  betekent is niet nagemeten, dus de app laat die bit staan en verandert alleen
  Shift en Ctrl.
- Scancodes zijn set 1; toetsen die met een voorvoegsel komen (pijlen, numeriek
  Enter, rechter Ctrl) staan er met 128 bij op. `shared/scancodes.ts` vertaalt de
  `event.code` van de browser naar dat nummer.
- De namen komen uit OMSI zelf: `Inputs\ENG.kyb` (130 toetsen) en
  `Languages\<taal>_key_game.olf` en `_key_veh_gen.olf` (samen 178 handelingen,
  genoeg voor 127 van de 128 bindingen).
- `gamectrler.cfg` heeft per apparaat `[ctrl]` (naam, en of OMSI het gebruikt),
  `[axis]`, `[buttons]` en `[FFScale]`. **`[axis]` is altijd zestien getallen**:
  acht paren, één per as in de volgorde waarin Windows ze aanlevert. Het eerste
  getal is wat de as doet: -1 niets, 0 sturen, 1 gas, 2 rem, 3 koppeling, 4 gas
  en rem samen. Dat is af te lezen aan de keuzelijst die OMSI er zelf bij zet
  ("<none>@Steering@Throttle@Brake@Clutch@Throttle/Brake") en bevestigd door de
  bestanden van de gebruiker: zijn pedalenset heeft 1, 2 en 3 op drie assen en
  zijn stuurbase 0 op de eerste. Het tweede getal hoort bij de kromme, de
  omkeerknop en "narrowed" uit OMSI's eigen scherm; welk bit wat is, is niet
  nagemeten, dus dat getal blijft staan.
- `[buttons]` is een aantal gevolgd door dat aantal paren (handeling, getal); de
  plaats in de lijst is het knopnummer. De handelingen zijn dezelfde namen als in
  `keyboard.cfg`.
- **Namen niet bijsnijden.** Eén apparaat heet "CH FLIGHT SIM YOKE USB " met een
  spatie, een ander eindigt op byte 0x90. Daarmee herkent OMSI ze; op het scherm
  halen we die tekens weg, in het bestand niet.

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

### 5.2 Wensen van de gebruiker voor de overlay

Gebouwd:

- **Het venster is niet groter dan zijn inhoud** (sinds 15-09-2026). Het lag
  doorzichtig over het hele scherm, en alles wat zo'n venster beslaat moet
  Windows bij elk spelbeeld opnieuw over OMSI heen mengen -- Luc merkte daar
  haperingen van. `overlay.tsx` meet het vak waar de elementen in staan (breedte
  uit de indeling, hoogte uit de inhoud, een `ResizeObserver` per element) en
  geeft dat door met `overlay:bounds`; het hoofdproces zet het venster precies zo
  groot en de pagina schuift zichzelf op met de hoek van dat vak, zodat alles op
  zijn eigen plek op het scherm blijft staan. In de bewerkstand wordt het weer
  schermvullend, anders kun je nergens heen slepen. Van 100% naar ~8% van het
  scherm; nagekeken met `scripts/probe-overlaybox.cjs`.
- **Minder werk per beeld.** De dienst kwam elke tel opnieuw door de brug, wat
  voor React een andere dienst is: `useStable` in `overlay.tsx` houdt dezelfde
  kopie vast zolang de ritten gelijk blijven, zodat de kaart zijn rekenwerk laat
  staan. Het hoofdproces stuurt niets meer als er niets veranderd is, en de
  verversing is te kiezen in de sleepbalk (`OVERLAY_RATES`: vloeiend 100 ms,
  rustig 200 ms, zuinig 500 ms; standaard rustig, bewaard in `settings.json`).
  **Let op**: wat het spel zelf kwijt is aan het mengen gebeurt in `dwm.exe` en
  valt hiervandaan niet te meten. `scripts/probe-overlaycost.cjs` meet alleen ons
  eigen verbruik; of de hapering echt weg is, weet alleen Luc in het spel.

- **De kaart tekent pas een route als de IBIS is ingetoetst** (`status.reportsStops`
  plus een halte-index), en dan alleen de rit die nu gereden wordt. Daarvoor staat
  de eerste halte van de rit in beeld met `ovl.mapWaiting`.
- **De kaart rijdt met de bus mee.** OMSI geeft geen positie door, maar wel de
  volgende halte en de kilometerteller. Op het moment dat de halte-index
  verspringt onthoudt `overlay.tsx` de stand; `RouteMap` legt de haltes op de
  routelijn (`trackAlong`, elke halte pas voorbij de vorige, want een rit komt
  vaak twee keer door dezelfde straat) en zet de bus zoveel meter over de route
  verder, nooit voorbij de volgende halte. Pijl in rijrichting, `ovl.busHere`
  eronder.
- **Slepen of zoomen geeft zes seconden rust**, dan veert de kaart terug.
  Centreerknop (`ovl.centre`) zet hem meteen terug. De kaart en de knoppen dragen
  `data-hit`, zodat ze in de overlay de muis vangen.
- Nagekeken met `scripts/screenshotNav.cjs` (nepframes, eigen overlayvenster,
  raakt `live.json` niet aan) op Rheinhausen en Berlin-Spandau.

**Busplek en dienstregeling uit het geheugen van OMSI** (sinds 15-09-2026). De
plugin leest in het proces van `Omsi.exe` het voertuig van de speler: tegel
(`+0x74`), positie binnen de tegel (`+0x04`), draaiing (`+0x50`) en wat het
dienstregelingsmenu erop zette (lijn/omloop/rit `+0x660..+0x66c`, volgende halte,
vertraging), plus de namen uit `TTimeTableMan`. Adressen uit OmsiHook
(space928/Omsi-Extensions), alleen geldig voor **2.3.004**. Let op: de
versie-informatie van `Omsi.exe` zegt 2.2.032, ook bij 2.3.004; de plugin telt
daarom de versietekst in het programma zelf. Andere versie → niets lezen, de app
valt terug op de IBIS. `src/core/vehicle.ts` rekent om naar kaartmeters en stelt
zelf vast welke Direct3D-as het noorden is (de lezing die op een rijstrook valt).
**Nog niet in het spel nagekeken**: de as, het teken van de draaiing, de eenheid
van de vertraging en of `tripName` een pad of een naam is. Kijk in `live.json`
onder `mem` zodra een bus staat. Proeven: `scripts/probe-vehicle.ts` (kern) en
`scripts/screenshotLive.cjs` (overlay met rijdende nepbus).

**Tijdens het rijden toont de app zelf alleen de kern** (sinds 15-09-2026).
Zodra de dienst gestart is komt `RunningDuty.tsx` in beeld in plaats van de
dienstkaart: lijn, route, vertrektijd, de halte waar je begint en de richting,
plus of OMSI er al is. De hele dienstkaart en de routekaart (`RouteViewer` uit
`DutyMap.tsx`) zitten achter een knop; annuleren en afronden staan ernaast.
Nagekeken met `scripts/probe-running.cjs`, dat het scherm uit de bron bouwt en de
knoppen ook echt indrukt.

In de overlay: het dienstpaneel toont "kies je dienst in OMSI" (lijn, omloop,
vertrektijd) tot die in het menu gekozen is; de kaart toont de bus altijd en de
route pas daarna, en rijdt mee als een navigatiesysteem (rijrichting boven,
glijdend tussen metingen, uitzoomen met de snelheid).

Nog niet gebouwd:

1. **Knop in de overlay zelf om de indeling aan te passen** — "een knopje met pas
   layout aan". Nu kan dat via de app of Ctrl+Alt+O. Vertaling: `ovl.layout`.
2. **Het infoscherm toont eerst wat er ingetoetst moet worden** (lijn + route uit
   het IBIS-plan), en schakelt om zodra de IBIS gevuld is. Teksten:
   `ovl.ibisTitle`, `ovl.ibisWaiting`, `ovl.ibisNoSupport`.
3. **Situatie klaarzetten** — gebouwd. "Dienst starten" schrijft de situatie en
   start daarna pas het spel; de losse knop is weg.

**Nog in het spel na te kijken.** Dat het startscherm van OMSI de dienst al
geselecteerd heeft, is op bestandsniveau bewezen (`probe-startup.ts`) maar niet
met eigen ogen gezien: schermafdrukken van OMSI maken lukt niet vanuit deze
omgeving ("The handle is invalid" -- er is geen bureaublad om te grijpen). Wat er
nog gekeken moet worden zodra iemand voor het scherm zit:

- opent OMSI op de goede kaart met de situatie al aangewezen?
- staat in het dienstregelingsmenu de lijn, de omloop én de rit goed?
- klopt de vijfde waarde van `[settimetable]` (wij zetten 1) en de zesde (0)?

### 5.3 Kleiner grut

- De routes worden in het hoofdproces uitgerekend, synchroon. Het rijstrokennet
  opbouwen kost tot een seconde (HamburgLi20); het inlezen van TH_Wald 2,5 s. Zo
  lang staat de overlay stil. Verhuizen naar een worker kan.
- De drie standen van het overlay-paneel zijn nog niet naast elkaar bekeken: er
  staat een oude `live.json` op de machine van de gebruiker waarin de dienst als
  uitgereden staat, en dan valt het paneel in alle standen terug op één regel.
- Builds van vóór de single-instance lock (Setup en draagbaar tot en met 15
  september 00:18) houden zich niet aan dat slot. Draait zo'n oude versie nog,
  dan kan een nieuwe er gewoon naast starten. Eenmalig de oude afsluiten en de
  nieuwe Setup installeren lost het op.

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
- `probe-settimetable.ts` — wat de velden van `[settimetable]` betekenen,
  gemeten aan situaties die OMSI zelf schreef.
- `probe-startup.ts` — zet een dienst klaar in een nagebouwde spelmap en leest
  terug of de situatie, `laststn.osn` en `[last_map]` kloppen.
- `probe-exam.ts` — hoe lang een examenrit per lijn duurt.
- `probe-gamecfg.ts` — of `options.cfg` en `keyboard.cfg` byte-identiek heen en
  weer gaan, en of een vlag aan- en uitzetten het bestand ongemoeid laat.
- `probe-controllers.ts` — of `gamectrler.cfg` byte-identiek heen en weer gaat,
  en wat er per apparaat aan assen en knoppen staat.
- `probe-rebind.cjs` — een toets opnieuw toewijzen via het scherm, en kijken of
  het in keyboard.cfg landt. Zet zijn kopie daarna terug.
- `screenshotGameSetup.cjs` — de schermen met de instellingen, de toetsen en de
  controllers, plus de wizard.
- `prepare-real.ts` — zet één dienst klaar in de échte spelmap, om in OMSI zelf
  te kijken of het startscherm klopt.
- `screenshotModes.cjs` — loopt de schermen langs: chauffeur, modus, en de drie
  modi. Eigen gebruikersmap, raakt de spelmap niet aan.
- `screenshotExam.cjs` — het rijexamen van routekeuze tot examenrit.

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
