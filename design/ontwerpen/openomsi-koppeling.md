# Plan: Omsi-Hub met openOMSI (definitief)

## Kern

- **Op dit moment komt er niets uit openOMSI in de app.**
  - openomsi.exe is 64-bit. De Windows-download heeft geen 32-bit pluginhost, dus onze DLL laadt niet (H/game.log:183).
  - Daardoor is er geen live.json, geen overlay, geen km of loon, en werken de knoppen niet.
  - De app ziet ook niet dat er gespeeld wordt, want hij zoekt naar `Omsi.exe` (W/src/core/launch.ts:121-131).
- **Gekozen route: een eigen Lua-plugin `omsihub`, geplaatst in `OMSI 2\plugins\omsihub\`.**
  - Die werkt met wat Luc nu al heeft en gebruikt alleen gedocumenteerde functies.
  - Ze geeft de dienst, de positie, variabelen op naam en scripttriggers.
- **Starten en stoppen gaan via de launcher van openOMSI zelf**: `openomsi-launcher.exe --cli launch|stop|instances`. We bouwen de opties niet zelf.
- **0.7.0 werkt zonder live-gegevens:** de app herkent openOMSI, start en stopt het netjes, en rekent achteraf af uit `~/.openomsi/sessions/<t>-<pid>.json`.
- **0.8.0 voegt de Lua-brug toe.**
- **Stap 0 is een proef van een half uur door Luc**, vóór al het Lua-werk. Die bepaalt of knoppen via een bestand kunnen. Ook levert ze het echte bestandsformaat en de echte werking van start en stop.
- **Wat blijvend niet kan via de plugin:**
  - kaartje en wisselgeld, knipperlichten, handrem en koplampen (openOMSI handelt die zelf af);
  - aanrijdingen live;
  - details van de kaartverkoop;
  - zichtbaarheid van onderdelen.

## 0. Stand, afkortingen en bewijsmateriaal

**Afkortingen**
- **OO**: de kloon `…/scratchpad/openomsi/bron/openOMSI`. Die staat op `7217091` (0.1.307); na een fetch om ongeveer 20:05 op 30-09 waren er geen nieuwere commits.
- **W**: de werkmap (0.6.0, `5d8cf69`).
- **O2**: `C:/Program Files (x86)/Steam/steamapps/common/OMSI 2`.
- **H**: `C:/Users/lucru/.openomsi`.
- **K**: `…/scratchpad/openomsi-koppeling`.

**Bij Luc**

| Wat | Waarde | Bron |
|---|---|---|
| Spel in gebruik | `O2\openomsi.exe`, ProductVersion 0.1.238 (FileVersion 0.1.0), build `a29cde2` | Bestandsversie; H/game.log:1 |
| Inhoudsmap van dat spel | `O2\openOMSI` | H/game.log:5 |
| Launcher-exe | `O2\openomsi-launcher.exe`, ProductVersion **0.1.0**, dus onbruikbaar als versie | Bestandsversie |
| Draaiende launchers | pid 25340 `O2\openomsi.exe` (sinds 19:04) en pid 26420 `Temp\Rar$EXa24888…\openomsi.exe` **0.1.237** (sinds 17:21). Beide zonder opties, dus launcher | CIM Win32_Process |
| Laatste starts | Sinds 18:25 vanuit `O2\openomsi.exe`. Daarvoor vanuit Rar-tijdmappen | H/launcher.log:310-344 (Rar), 513-568 (O2) |
| `launcher.json` | `game` wijst naar een oude Rar-map, `root` = O2, `profile` = OMSI-Fan | H/launcher.json |
| Toetsen | `drive_keys=simple`, `max_fps=144`. In de inhoudsmap staat alleen `Inputs/gamectrler.cfg`, dus keyboard.cfg komt nog uit O2 | H/settings.cfg:19 en 36; `O2/openOMSI/Inputs` |
| Pluginmappen | `O2\openOMSI\Plugins` is leeg. In `O2\plugins` staan OMSICareer en OmniNavigation | Mapinhoud |
| instances | **Leeg om 19:56.** Het eerdere bewijs `1790788971-25340-4.json` is weg (na 30 min opgeruimd, instances.rs:20). H/launcher.log:568 bevat dezelfde opdrachtregel voor pid 23516 | Mapinhoud |

**Veiliggesteld in `K/fixtures/`** (alleen gekopieerd, bron ongewijzigd, sha256 gecontroleerd):
- 10 × `sessions/*.json`
- `game.log`, `launcher.log`, `launcher-duty.json`, `launcher.json`, `settings.cfg`
- `openOMSI-inhoud/TH_Wald-laststn.osn`
- `.openomsi-files`

Verder niets gestart, gebouwd of gewijzigd.

**Tussen 0.1.238 en 0.1.307** (`git diff a29cde2 7217091`):
- Aan de plugin-API, de Lua-runtime, sessions en instances is niets veranderd.
- `Duty` en `duty_args` kregen `plate` erbij.
- De Lua-bestanden zijn gelijk aan `afecd34` (28-09).
- Het versienummer is het aantal commits: van 238 naar 307 op één dag.

## 1. Wat werkt wanneer

| Onderdeel | Nu (0.6.0) | 0.7.0 (zonder live) | 0.8.0+ (Lua) | Nooit via openOMSI |
|---|---|---|---|---|
| Loopbaan, busbedrijf/cloud, vloot, 3D, Lakstudio, add-ons | ja (openOMSI leest O2 als inhoudsbron) | + waarschuwing als iets in de inhoudsmap een bestand in O2 verbergt (§11.11) | – | – |
| Busknoppen in keyboard.cfg | tijdelijk: openOMSI leest die van O2 zolang de inhoudsmap er geen heeft (OO/crates/omsi-app/src/startup.rs:69-78) | schrijft naar het bestand dat openOMSI echt gebruikt; de wachtrij "tot OMSI dicht is" vervalt | alleen nog nodig voor kaartje en wisselgeld | – |
| Spel herkennen | nee | ja (§5.1) | – | – |
| Geen tweede spel, slot op de spelmap | nee | ja | – | – |
| Dienst starten in openOMSI | nee | ja, `--cli launch` | – | – |
| Netjes stoppen | nee (`taskkill /F`) | ja, `--cli stop` | – | – |
| Herstart volgen (snel laden, verloren grafisch apparaat) | nee | ja, als keten van processen (§5.3) | – | – |
| Afrekening (km, haltes, te vroeg/te laat, kaartjes, aanrijdingen, schokken) | nee | achteraf uit sessions, alleen bij een net einde (§6) | ook live | – |
| Overlay: snelheid, volgende halte, vertraging | nee | – | ja | – |
| km, loon en rang live (nulmeting) | nee | – | ja, nulmeting per sessie | – |
| IBIS-spiegel, apparaatschermen, meetstand | nee | – | ja (`omsi.str`, `omsi.vars()` op verzoek) | – |
| IBIS-, AFR- en LAWO-knoppen vanaf pc of telefoon | nee | – | ja, via `press` plus een `release` na 0,1 s, als stap 0 slaagt | – |
| Kaartje, wisselgeld, knipperlicht, handrem, koplampen | nee | – | alleen met openOMSI vooraan (SendInput), anders grijs | via plugin niet (OO/crates/omsi-app/src/player.rs:460-510) |
| Vrij rijden, vlootklok, kaartpositie | nee | kaartmap uit args, instance of session | positie via `omsi.position()` | – |
| Kaartverkoop per koper, zichtbaarheid van onderdelen, tourEntry | nee | – | – | grijs |
| Aanrijdingen live | nee | achteraf (`crashes`, `hurt`) | – | `coll_energy` staat al op 0 vóór het pluginbeeld (OO/crates/omsi-sim/src/vehicle.rs:1933-1937) |

## 2. De routes en de keuze

| | A: onze DLL via host32 | **B: Lua-plugin `omsihub`** | C: uitbreiding bij openOMSI |
|---|---|---|---|
| Werkt met de huidige download | nee: host32 zit niet in de zip (OO/.github/workflows/release.yml:73-80, O2/.openomsi-files) | **ja** | pas na merge en release |
| Dienst en positie | nee: geheugenversie onbekend, dus `read_memory` stopt (W/plugin/omsicareer.c:863-866) | **ja**: `omsi.info()` en `omsi.position()` (OO/crates/omsi-app/src/plugins.rs:47-80) | ja |
| Scripttriggers | nee: `omsi_vooraan()` klopt nooit in de host (omsicareer.c:783-789) | **ja, zonder terugmelding**: `fire` roept `veh.trigger` aan (plugins.rs:124-134) | ja |
| Motoracties (kaartje e.d.) | nee | **nee** (player.rs:460-510) | pas na het issue (§13.1) |
| Veiligheid | een hangende host bevriest het spel (OO/crates/omsi-plugin/src/lib.rs:413-418) | hooguit 1 s per aanroep; na 10 fouten gaat alleen de plugin uit (OO/crates/omsi-plugin/src/lua.rs:23-25, 311-333) | – |
| Onderhoud | twee builds, geheugenwerk per exe | één .lua, laadt vanzelf opnieuw | afhankelijk van hen |

**Keuze: B.** A doen we niet. C wordt een issue (§13).

## 3. De Lua-plugin `omsihub`

### 3.1 Plaats

**`O2\plugins\omsihub\main.lua`**, en niet in de inhoudsmap. Waarom:
- openOMSI zoekt plugins in elke inhoudsbron: eerst de map van de exe, dan de OMSI 2-installatie (OO/crates/omsi-cfg/src/lib.rs:510-529; OO/crates/omsi-app/src/plugins.rs:9-25).
- De eerste kopie per relatief pad wint (OO/crates/omsi-plugin/src/lib.rs:698-705).
- `O2\plugins` is dus altijd een bron, ook als openOMSI uit een Rar-tijdmap draait. Die is dan de inhoudsmap (omsi-cfg lib.rs:926-935), en de 0.1.237-launcher uit `Temp\Rar$…` staat nog open.
- Omsi.exe kijkt in `plugins\` alleen naar `*.opl` op het bovenste niveau. Een submap stoort OMSI 2 dus niet.
- Schrijven in O2 kan bij Luc al: onze DLL staat daar sinds 18:31, en openOMSI is erin uitgepakt.

**Precies één kopie**
- Het installatieprogramma verwijdert alleen een eigen `omsihub` (herkend aan een merkregel in main.lua) uit de inhoudsmappen die het kent: `O2\openOMSI\Plugins` en de map van een draaiend openomsi.exe.
- Waarom: een kopie daar zou voorgaan en ons exemplaar verbergen.

**Gegevensbestand**
- `O2\plugins\omsihub\data.save.lua` (lua.rs:72).
- Er is maar één plek, dus de app hoeft niet te zoeken.

### 3.2 Levenscyclus (bron: lua.rs:337-352 en 366-372; omsi-plugin lib.rs:706 en 731-738; app_events.rs:1109-1116)

| Moment | Wat openOMSI doet | Hoe `omsihub` het herkent | Wat de plugin doet |
|---|---|---|---|
| Echte start (eerste wereldbeeld) | `start` met `NoVehicle`: `info()` is leeg en `message` doet niets | `next(omsi.info()) == nil` | Wist `omsi.data` (die is uit het vorige bestand geladen, prelude.lua:166-176). Maakt een nieuwe `sessie` uit `os.time()` en `os.clock()`. Zet status "laden" |
| Bus erin | `vehicle`-event met naam, bij het eerste beeld met een bus (lua.rs:355-359) | eerste keer per sessie | Eenmalig `omsi.message("Omsi-Hub gekoppeld", 3)` |
| Herladen (een `.lua` in de map veranderd, niet `.save.lua`, lua.rs:95-111) | `stop` en dan `start`, met echte gegevens | `info()` niet leeg | Bij `stop`: `herladen=true`, `einde=false`. Bij `start`: sessie en tellers terugzetten uit `omsi.data.staat` |
| Pauze | geen beelden, geen timers (app_events.rs:1110) | – | niets. Het bestand veroudert |
| Echt einde | `stop` met `NoVehicle`, daarna wegschrijven | `info()` leeg | `einde=true`. openOMSI schrijft zelf nog een keer weg |

**Regel voor de app:** `einde` is alleen het label "netjes gesloten". De dienst eindigt pas als de procesketen weg is (§5.3).

### 3.3 Uitgaand (spel naar app)

**Vorm**
- `omsi.data = { json = "<live-JSON>", staat = { sessie=…, maxBrake=…, harshBrakes=…, … } }`, weggeschreven met `pcall(omsi.save)`.
- `dump` schrijft dat als `return {\n  json = "<%q>",\n  staat = {…},\n}` (prelude.lua:121-163).
- De app pakt alleen de ene `%q`-string uit en doet `JSON.parse`. Zo worden de live.json-lezer en de typen opnieuw gebruikt.
- `%q` uitpakken (`\\`, `\"`, backslash plus nieuwe regel, `\r`, `\ddd`) kost ongeveer 25 regels TS.
- De JSON-encoder in Lua is ongeveer 40 regels:
  - stuurtekens als `\u00XX`;
  - NaN en ±inf worden `null`.

**Inhoud van `json`**
- Dezelfde velden bovenin als live.json: time, day, month, year, precipRate, precipType, temperature, velocity, passengers, scheduleActive, km, metres, entryOpen, ticket (`GivenTicket`), maxBrake/harshBrakes (zelf uitgerekend met `dt`), …
- Daarnaast:
  - `spel = {motor:"openomsi", busGeladen, voertuig, sessie, herladen, einde, opFoot, kaartNaam: info.map, schrijfMs, kan:{info, position, vars, press, command}}`
  - `dienst = {lijn, omloop, rit, ritten, eindpunt, volgende, aankomst, vertrek, vertragingS}`. Alle velden zijn optioneel.
  - `plek = {x, y, z, koers}`
  - `vars` en `getallen` (alleen de gevraagde namen)
  - `opdrachtSeq`

**Frequentie**
- Via `omsi.every` (speltijd): 4 keer per seconde als er een bus is en er iets veranderd is, anders eens per seconde als hartslag.
- Grote lijsten (`omsi.vars()` voor de meetstand) hooguit eens per seconde, en alleen op verzoek.
- `schrijfMs` wordt gemeten met `os.clock()`. Is het gemiddelde boven 2 ms, dan gaat de frequentie omlaag.

**Fouten**
- Na een mislukte `pcall(omsi.save)` schrijft de plugin 5 s niet. Een schrijffout telt dan niet mee voor de 10 fouten (lua.rs:311-333).

**Variabelen**
- De namenlijst in main.lua is de bedoelde lijst uit `plugin/OMSICareer.opl`, inclusief `coll_energy` en `Weather_Temperature`. Een proef bewaakt dat.
- `Weather_Temperature` werkt hier wel, want het wordt op naam gelezen (`omsi.sys`).

### 3.4 Inkomend (app naar spel)

**Bestand en vorm**
- De app schrijft atomair (tijdelijk bestand, dan rename, met een paar pogingen bij EPERM) `O2\plugins\omsihub\opdracht.save.lua`.
- Vorm: `return { voor = "<sessie>", seq = 42, knoppen = { {"IBIS_7","druk"} }, vragen = {…}, getallen = {…} }`.
- Knopnamen komen alleen uit de vaste lijst (W/src/shared/telefoon.ts:99-150), dus `[A-Za-z0-9_]`, zonder escapes.

**Hoe de plugin het leest**
- De plugin zet eenmalig `package.path = <eigen map>/?.save.lua`. De map komt uit het oorspronkelijke pad `dir/?.lua;dir/?/init.lua` (lua.rs:156-159).
- Elke 0,2 s: `package.loaded.opdracht = nil; pcall(require, "opdracht")`.
- Waarom deze omweg:
  - `.save.lua` zet geen herladen in gang (lua.rs:106).
  - `require("opdracht.save")` zou `opdracht/save.lua` zoeken, en een gewone `.lua` zou de plugin telkens herladen.
- Het werkt met standaard-Lua, maar openOMSI documenteert niet dat `package.path` aangepast mag worden. **Stap 0 toetst het.**

**Wanneer de plugin een opdracht uitvoert**
- Alleen als `voor` zijn eigen `sessie` is en `seq` nieuw is. Anders gebeurt er niets; zo voeren twee spellen tegelijk een opdracht niet dubbel uit.
- Een half geschreven bestand geeft een mislukte `pcall` en verder niets.
- De uitgevoerde `seq` gaat terug in `json.opdrachtSeq`.

### 3.5 Knoppen: twee soorten

1. **Scripttriggers: IBIS, AFR 200 en LAWO** (telefoon.ts:102-150).
   - `druk` = `omsi.press(naam)` plus `omsi.after(0.1, release)`; `vast` = alleen press; `los` = alleen release.
   - `omsi.trigger` doet press en release in hetzelfde beeld (lua.rs:226). Dat is goed voor IBIS, AFR en LAWO, maar niet voor knoppen die je moet vasthouden.
   - Een terugmelding ("bestaat niet") is er niet, want `fire` geeft niets terug.
2. **Motoracties:** `ticket_give`, `change_give`, `change_take`, `blinker_*`, `parking_brake_toggle` en `kw_scheinwerfer_toggle`.
   - openOMSI handelt die zelf af in `Player::action` (player.rs:460-510). Via `veh.trigger` zouden ze niets of het verkeerde doen.
   - Alleen via SendInput van de toets uit de keyboard.cfg die openOMSI gebruikt, en alleen als het openOMSI-venster vooraan staat.
   - Anders staat de knop grijs, met de reden "alleen als openOMSI vooraan staat".
   - Nooit andere toetsen via SendInput: bij `drive_keys=simple` rijden W, S en D (player.rs:106-137; H/settings.cfg:19).

### 3.6 Versie en mogelijkheden

- `omsi.version` is altijd "0.1.0" (lua.rs:172, Cargo.toml:29). De echte versie staat in `OPENOMSI_VERSION` (OO/crates/omsi-app/build.rs:16).
- De app leest daarom de **ProductVersion van openomsi.exe**, en toont die alleen ter informatie. Die van de launcher-exe is 0.1.0.
- De plugin meldt in `spel.kan` welke functies er zijn, en de app beslist per onderdeel.
- Er komt geen waarschuwing "nieuwer dan getest": door een versie per commit zou die altijd aan staan.

### 3.7 Bijwerken

- De app vervangt main.lua als er een nieuwere versie meekomt, maar niet tijdens een dienst.
- openOMSI laadt hem binnen 1 s opnieuw (lua.rs:337-352). De plugin ziet dat als herladen (§3.2), dus de dienst loopt door.

## 4. De abstractie "spelmotor"

`W/src/core/spelmotor.ts`:

```ts
export type MotorId = 'omsi' | 'openomsi'
export interface SpelProces {
  motor: MotorId; pid: number; gestart: string        // pid + starttijd = identiteit
  ouder?: number; pad: string; uitTemp: boolean
  dienst?: { map?: string; bus?: string; line?: string; tour?: string; log?: string } // uit instance of args
}
export interface Spelmotor {
  id: MotorId; naam: string                            // 'OMSI 2' | 'openOMSI'
  gevonden(): Promise<{ exe: string; versie?: string; launcher?: string; inhoudsmap?: string } | undefined>
  spelProces(): Promise<SpelProces | undefined>        // het SPEL, nooit de launcher
  start(req: DienstStart): Promise<LaunchResult & { pid?: number; log?: string }>
  stop(p: SpelProces): Promise<'netjes' | 'geforceerd' | 'al-dicht' | 'mislukt'>
  opvolger(p: SpelProces, binnenMs: number): Promise<SpelProces | undefined> // herstart; OMSI: altijd undefined
  afrekening(keten: SpelProces[]): Promise<Afrekening | { onvolledig: string }>
  bron: LiveBron
  kan: {
    dienstLive: boolean; positie: boolean; kaartverkoop: boolean; meshZichtbaar: boolean
    aanrijdingLive: boolean; knopOpNaam: boolean; motorKnoppen: 'altijd' | 'vooraan' | 'nee'
    vensterVlag: boolean; steamOverlay: boolean; overlayModules: boolean; afrekeningAchteraf: boolean
  }
}
export interface LiveBron {
  installeer(): PluginStatus                            // DLL+.opl | plugins/omsihub/main.lua
  lees(): LiveData | undefined                          // live.json | data.save.lua (veld json)
  vraag(namen: string[], getallen: string[]): void
  drukKnop(trigger: string, soort: 'druk' | 'vast' | 'los'): 'verstuurd' | { grijs: string }
  logboek(): string[]                                   // plugin.log | "[lua omsihub]"-regels uit het game-N.log van dit spel
}
```

**`LiveData` krijgt de neutrale velden `spel`, `dienst` en `plek`.**
- De OMSI-bron vult ze uit `mem`; `busOpKaart` en `readSchedule` verhuizen daarheen.
- `busGeladen(live) = live.mem?.ok===1 || live.spel?.busGeladen===true`.
- `captureBaseline` (W/src/main/index.ts:2422-2440) gaat als eerste over, met een **nulmeting per sessie**. De km van een dienst is de som over de sessies, want `kmcounter` begint per proces op 0 (OO/crates/omsi-sim/src/host.rs:39).

**Alle ongeveer 20 plekken met `OMSI_PROCES`/`isOmsiRunning(` gaan via `actieveMotor()`.** Lakstudio, 3D en add-ons kijken dan naar "draait er een spel", welk dan ook.

## 5. Herkennen, starten, stoppen, bewaken

### 5.1 Herkennen

In de bestaande wacht van 10 s (W/src/main/index.ts:7180), van goedkoop naar duur:

1. **`H/instances/*.json` lezen** (instances.rs:22-60).
   - `running:true` plus een pid uit stap 2 betekent: spel, met map, bus, line, tour, log en args erbij.
   - Zo worden ook spellen herkend die Luc met zijn eigen launcher start.
2. **Eén `tasklist /FO CSV /NH`**, samen voor `Omsi.exe`, `openomsi.exe` en `openomsi-launcher.exe`.
3. **Alleen voor een nieuw openomsi.exe-pid dat niet in instances staat:** één CIM-vraag naar CommandLine, ParentProcessId en CreationDate, bewaard per pid plus starttijd.
   - Dat houdt `tasklist` zeldzaam, zoals nu (index.ts:2354-2360 en 2477-2490); één PowerShell-start kost ongeveer 1,5 s (omsiProces.ts:19-21).

**Filter**
- **Spel** = `openomsi.exe` met ten minste één van `--map`, `--situation`, `--no-menu`, `--menu` of `--tutorial`, en zonder `--launcher`, `--export-glb`, `--offscreen` of `--server`.
- Een kale `openomsi.exe` is de launcher (OO/crates/omsi-app/src/lib.rs:170-181). `openomsi-launcher.exe` start `openomsi.exe --launcher` (OO/crates/omsi-launcher-core/src/main.rs:20-26).
- Een exe onder `%TEMP%` telt wel mee, maar de app waarschuwt (§7).

**Live-gegevens**
- `fs.stat` op `data.save.lua` elke 0,5 s. Er is daarvoor geen proces nodig.
- Is het bestand ouder dan 3 s terwijl het proces leeft, dan geldt "gepauzeerd, in het menu of aan het laden".

**Twee spellen tegelijk** (instances.rs:1-3)
- De app waarschuwt.
- Live-gegevens en knoppen voor openOMSI blijven uit tot er één over is.
- Wisselende `sessie`-id's in `data.save.lua` tellen als bewijs.

### 5.2 Starten

**Vinden**
- `openomsi.exe` plus `openomsi-launcher.exe` in `<omsiPath>`.
- Anders het pad van een draaiend spel of launcher dat niet onder `%TEMP%` staat.
- `H/launcher.json.game` alleen als laatste, en niet als het onder `%TEMP%` staat (bij Luc is het verouderd).

**Nieuwe dienst**
- Opdracht: `openomsi-launcher.exe --cli launch <Duty-JSON>` via `execFile`, met `windowsHide` en zonder shell (OO/docs/USER_GUIDE.md:176-180).
- **De Duty heeft de vorm van de struct**, niet die van `H/launcher-duty.json`. Dat laatste is het formaat van de pagina, met `time:540`, `traffic:30.0`, `free` en `lan_mode`; serde weigert `30.0` als u32 (OO/crates/omsi-launcher-core/src/lib.rs:1920-1962). Voorbeeld:

  ```json
  {"map":"maps/TH_Wald/global.cfg","bus":"Vehicles/MAN_NewLionsCity/MAN_12C_2door_ZF.bus",
   "hof":"Thueringer Wald 2005","entry":-1,"line":"Omnibusverkehr Rennsteig","tour":"302 - 725302",
   "time":"09:00","date":"1989-05-30","traffic":30,"passengers":true,"schedule":true,"paint":null,"plate":null}
  ```
- **Waarom deze route:**
  - Onbekende velden worden genegeerd, want er staat geen `deny_unknown_fields`. `plate` kan dus ook naar 0.1.238. Met eigen opties zou clap juist weigeren, en het spel heeft geen console (OO/crates/omsi-app/src/main.rs:5).
  - De launcher kiest de openomsi.exe naast zichzelf (launcher-core lib.rs:54-63) en de root uit launcher.json (lib.rs:229-244).
  - Hij schrijft een instance en leidt stdout en stderr om naar `game.log` of `game-N.log` (instances.rs:252-307). Zo komen de `[lua omsihub]`-regels ergens terecht.
- **Antwoord:** `{pid, log, command, others}` op stdout. Bij een fout exit 1 met `error: …` op stderr, en die tekst toont de app (launcher-core main.rs:8-17; lib.rs:2099-2113).

**Voortzetten**
- Duty `{situation, traffic, passengers}`. `duty_args` voegt verkeer, reizigers en de bestuurder toe (lib.rs:1976-1994, #136).
- Het bestand komt eerst uit de inhoudsmap, dan uit O2, zoals `last_situation` (lib.rs:1964-1973). Bij Luc bestaat `O2/openOMSI/maps/TH_Wald/laststn.osn`. openOMSI schrijft dat alleen daar, en elke 300 s (input_script.rs:2259-2270; app_events.rs:206-209).
- Onze `situation.ts:198-262`, die alleen `O2\maps\<k>\laststn.osn` leest, geldt niet voor openOMSI.

**Vrij rijden met onze eigen situatie**
- `situation: <absoluut pad O2\Situations\OMSI Enhancer.osn>`; een absoluut pad werkt (situation.rs:63).

**Terugval** (geen launcher-exe, of `root` ontbreekt: "no OMSI 2 folder configured")
- Eigen opties, precies zoals `duty_args` (lib.rs:1975-2080).
- `--plate` pas vanaf 0.1.307, nooit `-windowed` (W/src/core/launch.ts:71).
- stdout en stderr gaan naar `%LOCALAPPDATA%\OMSI Career\openomsi-game.log`, in plaats van `stdio:'ignore'`.

**Voor openOMSI slaat de app over:** `presetStartup`, `[last_map]`, `herstelStartscherm` en de keyboard.cfg-wachtrij.

### 5.3 Stoppen en herstart volgen

**Stoppen**
- `--cli stop {"pid":N}`. De launcher doet eerst `taskkill` zonder `/F` (het spel sluit dan zijn sessie af zoals met Escape), wacht 8 s en gebruikt pas daarna `/F` (instances.rs:311-333 en 404-424; OO/crates/omsi-app/src/quit.rs:93).
- Alleen als dat faalt ("no running game … started by the launcher"): zelf `taskkill /PID` zonder `/F`, 8 s wachten, pid plus starttijd controleren, dan `/F`.
- Nooit meteen `/F`: dan is er geen sessie en geen laststn (omsiProces.ts:192-201 blijft alleen voor OMSI).

**Herstart**
- Snel laden start een nieuw proces met `--situation …quicksave.osn` (input_script.rs:1917-1940).
- Een verloren grafisch apparaat geeft tot twee keer een herstart (input_script.rs:2284-2312). Dat is bij Luc bekend (omsiProces.ts:8-16).
- Is het spelproces weg, dan zoekt de app 20 s naar een openomsi.exe met `ParentProcessId` gelijk aan het oude pid, of met `quicksave.osn`/`laststn.osn` in de commandoregel.
- Gevonden: het proces komt in de keten en de dienst loopt door. De overlay zegt "openOMSI start opnieuw…".
- **Een dienst eindigt pas als de hele keten weg is.**

## 6. Afrekening achteraf

**Map**
- `HOME`, anders `USERPROFILE`, plus `.openomsi/sessions` (career.rs:335-341).

**Koppelen en optellen**
- Per pid in de keten: `<t>-<pid>.json` met `t` groter dan of gelijk aan de starttijd van dat pid.
- Opgeteld worden seconds, metres, stops, early, late, tickets, cash, crashes, hurt, jolts, boarded en served (career.rs:342-370).
- Controle: map, line en tour moeten bij de dienst passen.

**Wanneer er geen bestand is**
- openOMSI schrijft alleen bij een net einde, met een bus en `seconds>0` (input_script.rs:8-39).
- Geen bestand binnen 30 s na het einde van de keten: "afrekening onvolledig: openOMSI schreef geen rit (gecrasht of hard afgesloten)". Er is dan geen fout.
- Waren er Lua-gegevens, dan komt de km daaruit.

**Normen en regels**
- Te laat bij aankomst betekent meer dan 180 s; te vroeg vertrekken betekent vóór −120 s (career.rs:26-27). Dat is gelijk aan onze norm.
- Loon en rang mogen niet afhangen van velden die openOMSI niet geeft.

**Fixture**
- `1790789187-23516.json`: 567,13 m, 1 halte, 1 te vroeg, 0 te laat, 0 aanrijdingen, 8 schokken.
- Opgestart volgens H/launcher.log:568.

## 7. Wat de speler ziet

**Instellingen > Spel** (alleen als openomsi.exe gevonden is)
- "Rijden in: OMSI 2 / openOMSI / automatisch" (de laatst gebruikte).
- De gevonden versies met hun map, bijvoorbeeld "openOMSI 0.1.238 (OMSI 2-map)".
- "Koppeling: omsihub v1 in OMSI 2\plugins", met een knop om hem te verwijderen.

**Startknop:** "Start dienst in openOMSI". De foutregel van de launcher wordt letterlijk getoond.

**Kop van de overlay en statusregel**
- "openOMSI · live".
- "openOMSI · gepauzeerd of in het menu".
- "openOMSI start opnieuw…".
- "openOMSI draait, nog geen rijgegevens" (0.7.0, of de koppeling ontbreekt).
- "Twee openOMSI-spellen: live en knoppen uit".

**In het spel:** eenmalig "Omsi-Hub gekoppeld", bij het eerste `vehicle`-event.

**Grijs, met één zin uitleg**
- Kaartverkoop per koper, zichtbaarheid van onderdelen, aanrijdingen live: "openOMSI geeft dit niet door".
- Kaartje en wisselgeld als openOMSI niet vooraan staat.
- De Steam-overlay-schakelaar en de controle op overlays: verborgen. 32-bit PowerShell ziet de modules van 64-bit processen niet, en de namen verschillen (omsiProces.ts:18-21 en 43-51).

**Waarschuwingen**
- "openOMSI draait uit een tijdelijke map (Rar). Laststn, toetsen en mods daar verdwijnen; pak openOMSI uit in de OMSI 2-map."
- Lakstudio: "Een bestand in openOMSI\… verbergt deze lak in openOMSI."

**Afrekening:** "uit openOMSI-rit(ten) <pid's>", met km, haltes, te vroeg/te laat, kaartjes en aanrijdingen.

## 8. Bestanden

**Nieuw**
- `src/core/spelmotor.ts`: typen, `actieveMotor()`, herkenning met cache per pid.
- `src/core/motoren/omsi.ts`: de huidige launch, omsiProces, startup en live, ingepakt.
- `src/core/motoren/openomsi.ts`: exe en launcher zoeken, Duty bouwen, `--cli launch/stop/instances`, terugval-opties, herstartketen, sessions lezen.
- `src/core/openomsiBron.ts`: `%q` uitpakken en `JSON.parse`, `opdracht.save.lua` schrijven, motoracties via SendInput met de controle of openOMSI vooraan staat.
- `plugin/openomsi/omsihub/main.lua` en `plugin/openomsi/omsihubproef/main.lua` (stap 0, ongeveer 40 regels).
- `scripts/probe-spelmotor.ts`, `probe-openomsi-start.ts`, `probe-openomsi-afrekening.ts`, `probe-luaq.ts`, `probe-omsihub-lua.ts` (wasmoon), `probe-openomsi-live.cjs`, `probe-motorgelijk.cjs`.
- `scripts/fixtures/openomsi/`: de inhoud van `K/fixtures/`, later aangevuld met de uitslag van stap 0 en de handproef.
- `scripts/fixtures/rit/th-wald-302.json`: het scenario.

**Gewijzigd**
- `src/main/index.ts`: proceskeuze, `captureBaseline` per sessie, `omsiToets` gaat naar `bron.drukKnop`, bewaking met keten.
- `src/core/live.ts`: neutrale velden, `busGeladen`.
- `src/core/launch.ts`, `src/core/omsiProces.ts`.
- `src/core/situation.ts`: laststn uit de inhoudsmap voor openOMSI.
- `src/core/pluginInstall.ts`: `ensureLuaPlugin`, en eigen kopieën in de inhoudsmappen opruimen.
- `src/core/bustoetsen.ts`: de keyboard.cfg die openOMSI gebruikt.
- `src/core/overlayknop.ts`, `src/core/settings.ts`, `App.tsx`, `i18n.ts`.
- `electron-builder.yml:21-28`: extraResources `plugin/openomsi/**`.
- `package.json`: devDependency `wasmoon` (MIT), alleen voor de proeven.

## 9. Proeven

1. **Nagebootst per motor.**
   - Eén scenario (TH_Wald 302: laden, bus erin, rijden, halte, pauze, einde) met twee generatoren: live.json en `data.save.lua`.
   - De app draait met tijdelijke mappen (`OMSI_ENHANCER_LIVEMAP` en `OMSI_ENHANCER_OPENOMSI_MAP`).
   - Eis: overlayteksten, nulmeting, km, loon en stiptheid zijn gelijk, behalve de velden die in §1 als "nooit" staan.
   - Alleen voor openOMSI:
     - pauze geeft geen einde;
     - herladen geeft geen einde en geen waarschuwing;
     - `einde=true` zonder dat het proces stopt, sluit de dienst niet;
     - herstart (twee sessies achter elkaar) telt de km op;
     - een half bestand laat de laatste goede stand staan;
     - wisselende sessies geven een waarschuwing en zetten live uit.
2. **Nep-processen.**
   - Kopieën van node.exe als `openomsi.exe` met de commandoregels:
     - geen opties;
     - `--launcher`;
     - `--no-menu --map x`;
     - `--menu`;
     - `--export-glb x`;
     - `--offscreen`;
     - `--server`;
     - vanuit `%TEMP%`;
     - een kind met `--situation …quicksave.osn` als ouder-pid gelijk is aan het spel;
     - plus een nep-`Omsi.exe`.
   - Daarnaast een nep-`openomsi-launcher.exe` (node-script) die op `--cli launch` het fixture-antwoord geeft en op `--cli stop` ook.
   - Eis: alleen de spelgevallen tellen, de herstart houdt de dienst open, en per pid is er hooguit één CIM-vraag.
3. **Lua zonder spel** (wasmoon, met onze eigen nagebootste `omsi`-tabel; er draait geen code van openOMSI).
   - De nabootsing moet dit doen:
     - `NoVehicle` bij de eerste start en bij het einde (`info()` leeg, `message` doet niets);
     - `stop` en `start` met echte gegevens bij herladen;
     - geen beelden en timers tijdens de pauze;
     - `trigger` drukt in en laat los in hetzelfde beeld;
     - `_save` verwijdert het bestand bij een lege `omsi.data`;
     - `omsi.data` wordt bij elke start uit het bestand geladen;
     - pad `dir/?.lua;dir/?/init.lua` met `/`;
     - geen io, loadfile of dofile, en `os` alleen met clock, time, date en difftime (lua.rs:143-162);
     - 1 s per aanroep en 10 fouten.
   - Eis:
     - de uitvoer is leesbaar voor de `%q`-decoder;
     - 100 opdrachten geven precies 100 keer press en release;
     - een opdracht met een andere `voor` wordt genegeerd;
     - een half `opdracht.save.lua` geeft geen fout;
     - een save die een fout gooit, legt de plugin niet stil;
     - met 2000 variabelen worden grootte en `schrijfMs` gemeten en gelogd.
4. **Handproef door Luc** (ongeveer 20 min, stap 6):
   1. main.lua staat in `O2\plugins\omsihub\`.
   2. "Start dienst in openOMSI" opent de goede kaart, bus, lijn en omloop.
   3. "Omsi-Hub gekoppeld" verschijnt.
   4. Binnen 2 s toont de overlay snelheid, volgende halte en vertraging.
   5. Een IBIS-knop vanaf de telefoon werkt, ook met de app vooraan. Kaartje werkt alleen met openOMSI vooraan.
   6. 20 s pauze: de app zegt "gepauzeerd" en de dienst loopt door.
   7. Snel laden: de dienst loopt door en de km telt verder.
   8. Na twee haltes via de app stoppen: er komt een sessiebestand, en de km van de app en `metres` verschillen minder dan 1%.
   9. Luc stuurt `data.save.lua`, `game.log`, sessions en het app-logboek. Die worden fixtures.

## 10. Bouwvolgorde en "klaar"-eisen

| Stap | Inhoud | Duur | Klaar als |
|---|---|---|---|
| 0 | **Proef door Luc**: `omsihubproef/main.lua` in `O2\plugins\omsihubproef\`, een rit van 5 min met zijn eigen launcher. De proef: logt `omsi.info()` bij start en stop; schrijft elke seconde `omsi.data`; leest een klaargezet `opdracht.save.lua` via `package.path` (Luc verhoogt tijdens de rit `seq` in Kladblok); drukt `IBIS_7` met press en release en leest daarna de IBIS-string; meet `#omsi.vars()` en `schrijfMs`; slaat main.lua één keer opnieuw op (herladen). Daarna haalt Luc de map weg | ½ d ons, ½ u Luc | game.log (regels `[lua omsihubproef]`) en `data.save.lua` zijn binnen, en beslissing 1 is genomen |
| 1 | Spelmotor en herkenning | 2 d | `probe-spelmotor` slaagt in alle gevallen van §9.2. `OMSI_PROCES`/`isOmsiRunning(` staan alleen nog in `motoren/omsi.ts`. `probe-draait`, `probe-geenomsi`, `probe-omsiafsluiten` en `probe-livestop` slagen ongewijzigd. Met een nep-openOMSI-spel weigert de app Omsi.exe te starten |
| 2 | Starten en stoppen via `--cli` | 1 d | De Duty voor Luc's dienst is gelijk aan de fixture-JSON. De terugval-opties zijn exact de lijst uit H/launcher.log:568. Geen `-windowed`, en `--plate` alleen vanaf 0.1.307. Stoppen volgt `--cli stop`, dan taskkill zonder /F, 8 s, dan /F. Hash-momentopname: in O2 buiten `openOMSI\` en `plugins\omsihub\` verandert alleen `Situations\OMSI Enhancer.*`. Voortzetten kiest laststn uit de inhoudsmap. Het spel blijft draaien als de app sluit |
| 3 | Afrekening achteraf | 1 d | De fixture geeft 0,567 km, 1 halte, 1 te vroeg, 0 aanrijdingen en 8 schokken. Een keten van twee fixtures wordt opgeteld. Ontbreekt het bestand na 30 s, dan zegt de app "onvolledig" en crasht hij niet |
| → | **0.7.0 "openOMSI zonder live"** (installer en draagbaar, volgens CLAUDE.md) | ≈ 4½ d | |
| 4 | Lua-plugin en leesbron | 3 d | De wasmoon-proef slaagt. `probe-luaq` slaagt voor 12 fixtures (escapes, ü/ß, `\ddd`, backslash plus nieuwe regel, half bestand, de echte `data.save.lua` uit stap 0). `probe-openomsi-live` slaagt: overlay binnen 2 s, nulmeting per sessie, km exact, pauze/herladen/einde/herstart goed. De namenlijst is gelijk aan de .opl |
| 5 | Knoppen (alleen als beslissing 1 = ja) | 1 d | wasmoon: geen dubbele triggers en `voor` wordt gerespecteerd. App-probe: de telefoonknop geeft een goed `opdracht.save.lua`, en `opdrachtSeq` komt binnen 1 s terug. Kaartje en wisselgeld zijn grijs, tenzij het venster vooraan staat |
| 6 | Handproef Luc (§9.4) | ½ d | Alle 9 punten goed, de echte bestanden zijn fixtures → **0.8.0** |
| 7 | De rest | 4-6 d | Per onderdeel geeft `probe-motorgelijk` hetzelfde resultaat voor beide motoren. Kaartmap uit args, instance of session (`info.map` is `[name]`, plugins.rs:50, en dient alleen als controle). Positie via een overgenomen `world_to_tile_local` inclusief `world_tile_scale` (OO/crates/omsi-map/src/lib.rs:109-120, MIT, met vermelding). Bij een tweede handproef staat de bus binnen 10 m van een bekende halte. De Lakstudio waarschuwt bij overschaduwing |

## 11. Risico's

1. **openOMSI verandert snel.**
   - De plugin meldt `kan`; alles staat in `pcall`; alle velden zijn optioneel.
   - Vóór elke release van ons bekijken we de diff van:
     - `docs/PLUGINS.md`
     - `crates/omsi-plugin/`
     - `omsi-app/src/{plugins,player,input_script,career,cli}.rs`
     - `omsi-launcher-core/src/{lib,instances,main}.rs`
2. **Het `package.path`-kanaal gaat dicht.** Dan werken de scriptknoppen niet meer, de rest wel. Terugval: grijs, of SendInput alleen voor gebonden toetsen en nooit voor rijtoetsen.
3. **Schrijven op de renderthread.** Er wordt `schrijfMs` gemeten en de frequentie gaat omlaag als het nodig is. Na een schrijffout volgt 5 s rust, zodat de plugin niet uitgaat na 10 fouten.
4. **Pauze, menu en laden geven geen gegevens.** Alleen de procesketen bepaalt het einde.
5. **Herstarts maken nieuwe processen.** Daarom werkt de app met een keten, met nulmeting en afrekening per pid.
6. **Gaten tegenover OMSI:** motoracties, kaartverkoop, zichtbaarheid, tourEntry, live aanrijdingen. Loon en rang hangen er niet van af.
7. **Iemand bouwt host32 zelf.** Dan schrijft onze DLL live.json met `mem.ok=0`, en de openOMSI-bron negeert live.json. Een aanpassing in de DLL ("niets schrijven buiten Omsi.exe") komt later en wordt eerst in OMSI getest.
8. **Een kopie in de inhoudsmap verbergt ons exemplaar.** Het installatieprogramma ruimt eigen kopieën op, en de app controleert de map van `[lua omsihub]` in game.log.
9. **Het sessieformaat verandert.** Er zijn fixtures en proeven, en ontbrekende velden geven "onvolledig".
10. **openOMSI draait uit `%TEMP%`.** De 0.1.237-launcher van Luc staat nog open. De plugin wordt dan nog gevonden, maar laststn, toetsen en mods staan in een map die verdwijnt. De app waarschuwt; wij sluiten niets af.
11. **Mods in `O2\openOMSI\…` verbergen bestanden in O2.** De app leest de inhoudsmap mee, alleen lezend.
12. **Instances en logboeken verdwijnen na 30 min** (instances.rs:20), en game.log wordt bij elke start overschreven. Een fixture moet dus direct worden veiliggesteld.

## 12. Bijvangst

- **a. `.opl` (bevestigd).**
  - `[systemvarlist]` zegt 8, maar regels 21-30 zijn een lege regel en commentaar (W/plugin/OMSICareer.opl:13-32, ongewijzigd sinds `ab31ee0`).
  - `coll_energy` en `Weather_Temperature` vallen daardoor ook in OMSI buiten de lijst.
  - Dit wordt een eigen taak, eerst te beproeven in OMSI.
- **b. `AccessStringVariable` (hypothese).**
  - Zie W/plugin/omsicareer.c:2316-2322 tegenover OO/docs/PLUGINS.md:222-224. Die documentatie beschrijft hun host, niet Omsi.exe; commit `15d3756` noemt PAnsiChar of PWideChar per bouwversie.
  - Eerst in OMSI beide lezingen van de ruwe bytes loggen, en pas daarna iets veranderen.
- **c. `omsi.command`.**
  - Geeft 14 spelacties: refuel, wash, repair, shot, save, load, weather, later, earlier, info, timetable, reset, couple, uncouple (lua.rs:260; plugins.rs:44).
  - Mogelijke telefoonknoppen later. Kaartverkoop zit er niet bij.

## 13. Het issue bij openOMSI (onder de naam van Luc, met hun sjabloon `a170e5c`)

1. Triggers van een plugin via `Player::action` laten lopen (kaartje, wisselgeld, knipperlicht), en een bool teruggeven.
2. `omsi.version` moet de releaseversie geven (`OPENOMSI_VERSION`), niet `CARGO_PKG_VERSION`.
3. Bij `start` en `stop` een reden meegeven (spel of herladen), en bij de eerste start de echte spelgegevens.
4. Een officieel in- en uitkanaal (`plugin-data/<naam>`, bijvoorbeeld `omsi.publish`/`omsi.inbox`).

Punten 1 tot en met 3 zijn klein en halen de grootste beperkingen weg. Geen PR voor host32.

## 14. Wat de toetsing veranderde

- Knoppen zijn gesplitst in scripttriggers en motoracties; scripttriggers gaan via press plus release na 0,1 s.
- Herkenning van start, stop en herladen via `info()`, met sessie en tellers in `omsi.data.staat`.
- Een procesketen voor snel laden en voor het verloren grafisch apparaat.
- Geen versiewacht meer: de ProductVersion van de exe plus `kan`.
- Starten en stoppen via `--cli`, en herkennen via instances + tasklist + CIM per nieuw pid, met het juiste filter.
- Plaats in `O2\plugins\omsihub`.
- `voor=<sessie>` in de opdracht.
- De kaartmap komt niet uit `info.map`.
- laststn komt uit de inhoudsmap.
- keyboard.cfg: het bestand dat openOMSI echt gebruikt.
- JSON in `%q` in plaats van een Lua-parser.
- Tijd per beeld wordt gemeten.
- De wasmoon-nabootsing volgt de echte werking.
- Afrekening via een net einde.
- §12b is een hypothese.
- Stap 0 komt vooraan.

**Eigen correcties op de toetsing:**
- De Duty volgt de struct, niet `launcher-duty.json`.
- Luc speelt sinds 18:25 vanuit O2. Het Rar-risico blijft bestaan door de open 0.1.237-launcher.
- Het instance-bewijs is al verdwenen en vervangen door launcher.log:568.
- `omsi.data` wordt bij elke start uit het bestand geladen.

## 15. Beslissingen voor Luc

1. **Stap 0 nu doen?** Een half uur rijden met een proefplugin die wij klaarzetten. Aanbevolen: ja. Zonder die proef bouwen we stap 4 en 5 op aannames.
2. **Knoppen via het opdrachtbestand (`package.path`-omweg):**
   - bouwen als stap 0 slaagt (aanbevolen), of
   - de knoppen in openOMSI uitstellen tot er een officieel kanaal is.
3. **Kaartje en wisselgeld in openOMSI:**
   - alleen als openOMSI vooraan staat, via een toetsaanslag (aanbevolen), of
   - grijs laten tot openOMSI het via plugins toestaat.
4. **Issue indienen onder jouw naam, met de 4 punten van §13.** Aanbevolen: ja, alleen een issue.
5. **Eerst 0.7.0 "openOMSI zonder live"** (ongeveer 4½ dag: herkennen, starten, stoppen, afrekening achteraf) en daarna de Lua-brug in 0.8.0. Aanbevolen: ja. Het alternatief is alles in één keer.
6. **Plaats van de plugin: `OMSI 2\plugins\omsihub\`.** De app schrijft daar dan `data.save.lua` en `opdracht.save.lua`. Aanbevolen: ja. Het alternatief is `OMSI 2\openOMSI\Plugins\`, maar dat werkt niet als openOMSI uit een andere map draait.
7. **Graag zelf doen:** de oude openOMSI 0.1.237-launcher uit `Temp\Rar$EXa24888…` (pid 26420) sluiten, en openOMSI alleen uit de OMSI 2-map starten. Wij sluiten geen processen van jou af.