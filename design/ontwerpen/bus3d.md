# Ontwerp: de 3D-busweergave van OMSI Enhancer ("Bus3D")

Stand 28-09-2026 (avond), tak `claude/busbedrijf-samen` (HEAD b7f3d7b plus de werkkopie). Dit document vervangt het concept van vandaag. De kritiek is punt voor punt verwerkt; zie bijlage A. Wat nog open stond, heb ik voor een deel met eigen proefjes beslist; zie bijlage B.

**Met Lucs keuzes van 28-09 verwerkt** (§17): versleutelde modellen tonen zoals OMSI ze hier toont (§5.1), tegels plus een eigen 3D-venster in plaats van een showroom (§8), en deel G vervalt ten gunste van dit ontwerp. Het document wordt gecommit als `design/ontwerpen/bus3d.md`.

Ik heb alleen gelezen en proefjes in de scratchpad gedraaid. In de worktree, in de OMSI-map en in de gegevens van Luc is niets veranderd. Het register is alleen gelezen (`reg query`). OMSI draaide niet. Lucs eigen app draaide wel, en die heb ik niet aangeraakt.

**Afkortingen in de bronverwijzingen**
- **ONS/** = `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800/`
  - Een andere agent bewerkt `src/main/index.ts` en `src/renderer/src/App.tsx`. `index.ts` groeide vanavond met ongeveer 250 regels.
  - Bij die twee bestanden noem ik daarom de naam van het symbool, met het regelnummer van 28-09 rond 20:15.
- **B/** = `…/scratchpad/bus3d/bron/openOMSI/`: openOMSI v0.1.7, commit cd5232a, MIT.
- **G/** = `origin/claude/awesome-wozniak-f2svst:design/ontwerpen/busbedrijf-wagenpark.md`, deel G. Die is gelijk aan K/wagenpark.md.
- **K/** = `C:/Users/lucru/AppData/Local/Temp/claude/C--OMSI-Career--claude-worktrees-ecstatic-noether-296800/69453af6-61d8-4662-b5b4-760aa670cb78/scratchpad/bus3d/`: het vooronderzoek en de kritiek (K/kritiek/).
- **D/** = K/definitief/: de nieuwe metingen voor dit document (`vram3.cjs`/`.out.txt`, `spike/`, en voor de versleutelde modellen `sleutels/`).
- **OMSI/** = `C:/Program Files (x86)/Steam/steamapps/common/OMSI 2/`

---

## 0. De beslissingen in het kort

1. **Eén eigen WebGL2-renderer (`bus3d`)**, zonder three.js en zonder WebGPU.
   - Die ene renderer tekent de live weergave en ook alle stilstaande plaatjes (busfoto v4).
   - De huidige foto-renderer en de geplande `busgl.ts` uit G vervallen.
2. **De werkverdeling**
   - **De werker `'bus3d'`** (worker_thread onder main):
     - leest cfg, .bus, .cti en o3d, en draait de scripts;
     - bouwt per bus een **pakket**: geometrie, materialen en de textuurlijst met kopgegevens, in een schijfcache;
     - komt niet aan de pixels van texturen.
   - **Main** doet de regie en stroomt via `omsi3d://` op id:
     - pakketten uit de cache;
     - texturen rechtstreeks uit de OMSI-map, alleen lezend.

     Er is **geen textuurcache**.
   - **Het 3D-venster** (§8.1) heeft één renderer-werker, met een eigen OffscreenCanvas en één WebGL2-context. Het hoofdvenster heeft geen WebGL-context.
     - Daar worden de texturen gedecodeerd: DXT rechtstreeks, PNG/JPG/BMP met `createImageBitmap`, TGA en de rest met eigen lezers.
     - De mips maakt de GPU.
     - Elke viewer krijgt zijn beelden via `transferToImageBitmap` op een `bitmaprenderer`-doek.
3. **De ruststand is die van OMSI**, in deze volgorde:
   1. de standaardwaarden van de motor;
   2. `{init}`;
   3. precies de `[vars]` die de app ook in de situatie schrijft (`kleurVars`: de CTC-index plus de setvars);
   4. `{frame}`-rondes.

   De eigen OSC-machine komt in F3; tot dan gelden verbeterde regels. We ijken tegen de plugin-afdruk van het echte spel.
4. **Het beeld**
   - Tekenvolgorde: dekkend, dan alfatest met alpha-to-coverage, dan mengen in cfg-volgorde.
   - sRGB, het lichtmodel van OMSI, glans en reflectie via het masker.
   - Khronos Neutral, 4× MSAA.
   - Schaduwkaart van 2048², plus contactschaduw, plus `[isshadow]`.
5. **Omgeving: "Buiten" is de standaard, vanaf F2.** Dat is wat Luc aanwees:
   - de OMSI-hemel uit envir.cfg, met wolken;
   - een grijze, matte vloer;
   - een vaste middagzon.

   Tijd en weer van je rit komen in F5. Een Studio komt alleen later, als optie.
6. **Camera:** 30°, 215°/8°, gepast op `[boundingbox]`, met naloop. Een draaiplateau alleen in de dealerstand van het 3D-venster.
7. **UI: tegels plus een eigen 3D-venster** (Lucs keuze 2, "Tegels + apart venster"; §8.1).
   - Het tegelrooster met plaatjes blijft. De tegels van een uitvoering (niveau 3) en van een kleurstelling (niveau 4) krijgen een 3D-knop.
   - Die knop, of een dubbelklik op de tegel, opent de 3D-weergave in een eigen `BrowserWindow`. Er is er hooguit één; een volgende klik wisselt de bus in hetzelfde venster.
   - In het venster bekijk en kies je de kleurstelling. [Kiezen] zet bus en kleurstelling in de buskeuze, precies zoals een klik op die tegel, en sluit het venster. START blijft in de voet van het hoofdvenster.
   - De dealer en het wagenpark van het busbedrijf openen hetzelfde venster (§8.2).
   - De showroom van het vorige ontwerp vervalt.
8. **De busfoto blijft**, als miniatuur op de tegel en als eerste beeld in het venster. Hij wordt v4, uit dezelfde renderer. De BMP-fix in v3 komt nu al, los van de rest.
9. **Nooit een leeg kader.** Het 3D-venster toont binnen 50 ms na het laden van zijn pagina het heldenbeeld of de foto.
10. **Pauzeren**
    - Alleen als het 3D-venster verborgen of geminimaliseerd is (ook als het met het hoofdvenster mee minimaliseert), of als OMSI draait en geen van onze vensters 60 s focus heeft.
    - Zolang OMSI draait: een lichte stand.
    - Het venster sluiten maakt de context en het GPU-geheugen helemaal vrij, want zijn renderer-proces stopt.
11. **Versleutelde modellen: we tonen wat OMSI op deze pc zelf toont** (Lucs keuze 1, "Ik wil dat alles getoond wordt"; §5.1).
    - Sleutel 0, en elke sleutel die in de OMSI-installatie geregistreerd en bevestigd is (`ArtNr` in `OMSI/RegAddons/*.ini` of `addons.ini`, met de DLC geïnstalleerd in Steam), ontwarren we in eigen code. Daarvoor is alleen het woord uit de o3d-kop nodig.
    - Een sleutel die niet geregistreerd is, weigert OMSI; wij ook. Dan het icoon met uitleg (`'versleuteld'`). We omzeilen geen registratie.
    - Gehusselde hoekpunten staan in de schijfcache precies zoals in het bronbestand en worden pas in het geheugen ontward. Ontwarde meetkunde komt nooit op schijf.
    - Op Lucs pc: van de 26 bussen die nu een icoon krijgen, komen er 25 in 3D en op de foto. Alleen de GS GU240 (sleutel 12411, niet geregistreerd) blijft een icoon (D/sleutels/perbus.out.txt).
12. **Deel G vervalt ten gunste van dit ontwerp** (Lucs keuze 3). De cloudsessie is ingelicht.
    - De IPC-namen van G nemen we over waar de betekenis gelijk is.
    - De teksten krijgen `bv.*` in een eigen bron, zonder aliassen.
    - Het venster van G7 ("Bus 107 · MAN SD200") en de viewer in de dealershowroom worden dit ene 3D-venster.
13. **openOMSI (MIT):** we nemen ideeën en constanten over, geen code.

---

## 1. Uitgangspunt

### openOMSI
- **Scène:** de bus wordt getekend met de wgpu-renderer van het spel zelf, in een eigen scène:
  - een grondschijf van 400 m (lineair 0,12);
  - de hemel van OMSI met wolken;
  - zonlicht naar kaart, datum en weer.

  Bron: B/crates/omsi-app/src/launcher/showroom.rs:1-10, 364-402.
- **Hemel:** de hemeltexturen uit `envir.cfg`, met u = azimut ten opzichte van de zon en v = hoogte, gemengd naar de zonstand (B/crates/omsi-render/src/sky.wgsl:1-2).
- **Wolken:** de soort uit het weer; zonder weer "Cumulus 1" (B/crates/omsi-app/src/weather_setup.rs:26-31, 53-75).
- **Schaduw en beeld:** een cascaded shadow map van 1024 plus `[isshadow]`, 4× MSAA, geen tonemapping (B/crates/omsi-app/src/launcher/mod.rs:879-883).
- **De bus in rust:**
  - Eerst de standaardwaarden van de motor: Envir_Brightness 1, GivenTicket −1, wearlifespan, Dirt_Norm, DirtRate, PrecipRate en StreetCond 0, Axle_Springfactor_* 1, `$.yard` (B/crates/omsi-sim/src/vehicle.rs:831-892).
  - Dan `run_init` (vehicle.rs:893).
  - Dan pas de setvars van de lak (showroom.rs:241-251).
  - Daarna drie keer `update(1/30)` (showroom.rs:249-251).
- **Glas:** gemengd, zonder diepte te schrijven, in cfg-volgorde, met fresnel (B/crates/omsi-app/src/scene.rs:9400-9409; B/crates/omsi-render/src/shader.wgsl:1081-1089; B/crates/omsi-render/src/lib.rs:7048-7104). Op dichte lak geen reflectie (shader.wgsl:1075-1080).
- **Texturen:** per map eerst de exacte naam, dan de andere extensies, dan de volgende map (B/crates/omsi-texture/src/lib.rs:244-282).

### Wij
- **De foto:** één plaatje van 512×384 (ONS/src/main/busfoto.ts:393-400).
- **Glas:** altijd dekkend, dus zwart. Dat is 39% van de buspixels bij de O560 (ONS/src/renderer/src/busfoto.ts:73-122; K/ons/10-o560-e6-groot.png).
- **`[visible]`:** wordt voor de foto niet gelezen (ONS/src/core/busmodel.ts:223-272).
- **BMP:** elke `.bmp` wordt grijs, omdat `nativeImage` geen BMP leest (ONS/src/main/busfoto.ts:361-373). Daardoor hebben 545 van de 2234 kleurstellingen minstens één grijze textuur (K/ons/harnas/telling-lak.out.txt:1).
- **De kleurstelling in het spel:** de app zet die al in OMSI, met een `[vars]`-blok in de situatie. Daarin staan de CTC-variabele met haar index en de setvars.
  - `kleurVars` in ONS/src/main/index.ts (≈:3890-3910), gebruikt op ≈:3916, :3948 en :5100.
  - `varsBlok` in ONS/src/core/situation.ts:127-130.

  De setvars worden dus wél gebruikt. Het concept zei van niet, en dat was fout.
- **Er is al een model.cfg-lezer die met het spel geijkt is:** ONS/src/core/schermcfg.ts:5-35.
  - Nagelezen in Omsi.exe 2.3.004: een trefwoord telt alleen als de regel er exact gelijk aan is.
  - 129 ingesprongen `[mesh]` tellen niet mee.
  - Bij de HH20 komen de 608 meshes overeen met OMSI.
  - Zijn meshvolgorde wordt gelegd tegen `meshes.json` van de plugin (ONS/src/main/scherm.ts:192-231; ONS/src/core/live.ts:1003).

### Deel G
Deel G is ontworpen maar niet gebouwd (G/:1066-1347). Geen enkel bestand in de cloudtak gebruikt `bd.v3d`, `model3d`, `lak3d`, `fotoAlsKlaar` of `kleurstalen`; nagekeken met `git grep` op de tak.

De cloudtak is vandaag wel actief: commits tot 1380dc3 om 16:24 UTC, waaronder c8b4a53 "verzoeken uit het wagenparkontwerp (§F11)".

---

## 2. De meetlat: minstens zo goed, en waar beter

### 2.1 Gelijk aan openOMSI (dit moet er allemaal zijn)

| openOMSI | Hier | Fase |
|---|---|---|
| Doorzichtig glas, stoelen zichtbaar | Mengen in cfg-volgorde, geen diepte schrijven, fresnel op glas | F2 |
| Zon, hemel en omgeving | Idem (Lambert), plus specular | F2 |
| Zachte schaduw onder de bus | Schaduwkaart met PCF, plus `[isshadow]`, plus contactschaduw | F2 |
| Hemel met wolken, grijze grond | Buiten: OMSI-hemel, clouds, matte vloer | **F2** |
| Bus in rust via scripts | Motorstandaarden → `{init}` → `[vars]` → `{frame}`×n | F2 (regels), F3 (OSC) |
| sRGB, DXT-mips, aniso, 4× MSAA | Idem; gemeten beschikbaar op Lucs pc (bijlage B) | F2 |
| Aanhanger | `[coupling_back]` en `[coupling_front]` | F1 |
| Reparaties voor mods | Als idee, in eigen code | F1 |
| Camera: 30°, 215°/8°, naloop | Idem, gepast op `[boundingbox]` | F2 |
| Kenteken en wagennummer (showroom.rs:279-282) | `[texttexture]` met onze OMSI-lettertypen | **F3** |

### 2.2 Beter dan openOMSI

1. **Het eerste beeld staat er binnen 50 ms**: het heldenbeeld of de foto v4. openOMSI laadt bij elke lakwissel alles opnieuw en toont intussen een boogje (showroom.rs:180-193).
2. **Lakwissel zonder opnieuw laden:** alleen de vervangen texturen en de ruststand worden vernieuwd.
3. **Scherpere, rustige schaduw:** ongeveer 1 cm per texel tegen ongeveer 6 cm bij openOMSI (lib.rs:1197-1209). De kaart wordt één keer getekend.
4. **Tonemapping (Khronos Neutral):** witte lak loopt niet dicht.
5. **Lak glanst**, gedempt en geschaald met het OMSI-masker. openOMSI zet de reflectie op lak op 0.
6. **Alpha-to-coverage** voor roosters en gaas.
7. **IJking tegen het echte spel** met de zichtvlaggen die onze plugin leest (ONS/src/shared/scherm.ts:209-213; ONS/src/main/scherm.ts:192-231).
8. **Kleurstalen en zoeken** bij veel kleurstellingen: MB C2 heeft er 76.
9. **Het licht van jouw rit** (F5).
10. **Instappen** (F5).

---

## 3. Techniek: eigen WebGL2

| | Eigen WebGL2 (gekozen) | three.js (MIT) | WebGPU |
|---|---|---|---|
| Gewicht | Eigen code, ongeveer 2500 regels renderer; geen nieuwe afhankelijkheid (ONS/package.json:17-22) | Orde 600-700 kB geminificeerd (niet gemeten in onze bundel) | Geen bibliotheek, wel nieuwe WGSL-shaders |
| Wat het oplevert | Precies de OMSI-regels (alfamodi, cfg-volgorde, noZwrite, masker in de alfa, transmap, alphascale) | Schaduw, PBR, orbit, tonemapping | Snelheid |
| Wat het kost | Schaduw ~200, omgeving ~250, camera ~200, tonemapping ~20 regels | Eigen ShaderMaterial of `onBeforeCompile`-hacks. PBR helpt niet, want OMSI-texturen zijn diffuus met een spiegelmasker | Tablet en fotovenster opnieuw; jong in Electron 33 |

**Gemeten op de pc van Luc** (D/spike/uitslag-file.json)
- ANGLE op D3D11, NVIDIA GeForce RTX 4070 SUPER.
- Beschikbaar:
  - `WEBGL_compressed_texture_s3tc` en `_s3tc_srgb`;
  - `EXT_texture_filter_anisotropic` (tot 16);
  - `KHR_parallel_shader_compile`;
  - `EXT_texture_compression_bptc`.
- `MAX_SAMPLES` = 8; met `antialias:true` krijgt de context 4 samples.
- Het maken van de context duurt 15 ms.
- Een shader met PCF, Neutral en omgevingskaart compileert en linkt koud in 38-43 ms.

De onzekerheid over S3TC-sRGB onder ANGLE is daarmee weg voor Luc. Voor andere pc's blijft er een terugval (§5.7).

**Heroverwegen** als we PBR-repaints, SSAO, bloom of een spiegelende vloer willen.

---

## 4. Architectuur: waar welk werk gebeurt

```
3D-venster bus3d.html (React, §8.1)     renderer-werker (één per venster, module-werker)
  BusViewer ── opdrachten, maat, muis ─▶ bus3d/werker.ts: eigen OffscreenCanvas + één WebGL2-context
  <canvas bitmaprenderer> ◀─ ImageBitmap ─┘  fetch omsi3d://p|t → decoderen → uploaden → tekenen
       │ ipc bus:model3d / bus:lak3d        ▲ bytes rechtstreeks uit de stroom
       ▼                                    │
main (regie, registry, geen modeldata) ── protocol omsi3d://p/<id>  (pakket uit de cache)
       │ werkerVraag(…, 'bus3d')           omsi3d://t/<id>  (textuurbestand of -plak uit de OMSI-map)
       ▼                                   omsi3d://h/<id>  (heldenbeeld)
werker 'bus3d' (worker_thread): cfg/.bus/.cti, o3d, textuurkoppen, OSC → pakket + stand op schijf
```

### 4.1 De werker `'bus3d'`

Een nieuwe `Werksoort` naast `'voorgrond' | 'achtergrond' | 'fotos' | 'bussen'` (ONS/src/main/index.ts, `type Werksoort`, ≈:372). Zo wacht een vraag van de viewer nooit achter een fotoronde of achter het uitlezen van een bus. Een fotoronde pauzeert zolang de viewer laadt.

**Taken**
- **`bus3d:model`** (IPC `bus:model3d`, naam uit G):
  1. De cfg lezen met de uitgebreide `schermcfg.ts` (§5.1), plus de .bus en de .cti's.
  2. Van elke textuur alleen de kop lezen (DDS 128 bytes, overige ≤ 64 kB): soort, maat, mips en de byteplek per niveau. Nieuw: `ddsPlakken()`.
  3. Dat meteen als tussenbericht **`lijst`** sturen, zodat het venster al texturen ophaalt terwijl de o3d's nog gelezen worden.
  4. Daarna de geometrie per `(deel, o3d)`, de materiaaltabel, en per textuur het buitenoppervlak in de wereld en het UV-oppervlak (voor de doelmaat, §5.7). Het hoekpuntblok van elke o3d gaat byte voor byte zoals in het bronbestand het pakket in; een gehusseld blok met zijn kopgegevens (§5.1, "Geen ontwarde meetkunde op schijf").
  5. Het pakket naar schijf schrijven.
- **`bus3d:lak`** (IPC `bus:lak3d`): ruststand plus vervangen texturen voor één kleurstelling (§5.2, §7).
- **`bus3d:stalen`** (IPC `bus:kleurstalen`): drie kleuren per kleurstelling, uit het kleinste mipniveau of een verkleinde decode, met de bestaande lezers van `core/textuur.ts` (idee uit G/:1188-1193).

**Voortgang** gaat elke ≤ 250 ms naar main en dan als `bus3d:voortgang` naar het venster.

**Samenvoegen** (zoals G/:1128-1131)
- Per kanaal is er één vraag bezig en hooguit één in de wacht. De nieuwste wint; een vervangen vraag krijgt `'vervangen'`.
- 20 s zonder voortgang: de werker sluiten en antwoorden met `'tijd'`.
- De werker sluit 120 s na de laatste vraag.
- LRU van de geometrie ≤ 256 MB; de laatste 8 standen per pakket blijven bewaard.

### 4.2 De schijfcache

**Plek:** `userData/bus3d/v1/`

| Bestand | Inhoud |
|---|---|
| `p/<pakket>.b3d` | Geometrie (hoekpuntblokken zoals in het bronbestand, gehusselde ook gehusseld; §5.1), materialen, vermeldingen met `[visible]`-voorwaarden, de gebruikte sleutels, en de textuurlijst met koppen en byteplekken |
| `s/<pakket>-<kleur>.json` | De ruststand per kleurstelling |
| `h/<pakket>-<kleur>-<sleutel>.webp` | Het heldenbeeld (§9) |
| `zicht/<sha1(cfg)>-<kleur>.json` | De plugin-afdruk (§5.2) |

- **Geen `t/`: texturen worden niet gekopieerd of omgezet** (bijlage A.1). Daarmee vervallen de 81-1046 MB per bus uit K/kritiek/bank.out.txt.
- **Sleutel van het pakket:** een sha1 van het pad van de .bus plus `(grootte, mtime)` van alle bronnen: .bus, cfg, .cti, o3d's en textuurbestanden. Dat laatste is nodig, want de byteplekken in het pakket gelden alleen voor die versie van het bestand.
- **Eerst tonen, dan controleren.** Het pakket gaat meteen naar het venster; de werker controleert daarna de bronnen. Is er iets veranderd, dan volgt `bus3d:vervangen`. Eén uitzondering: vóór het tonen kijkt main of elke sleutel uit het pakket nog 0 of geregistreerd is (§5.1). Zo niet, dan wordt het pakket opnieuw gebouwd.
- **Grootte:** een LRU van standaard 1 GB (instelling), opgeruimd bij het starten.
  - Alleen geometrie: de NLC heeft 25 MB unieke geometrie (K/kritiek/vram.out.txt).
  - De add-on-manager roept `vergeetBus3d(map)` aan.
- Een fotoronde over de hele vloot bewaart geen pakketten (`bewaar: false`).

### 4.3 Het protocol `omsi3d://`

- **Privileges:** `standard`, `secure` en `supportFetchAPI`, net als de bestaande schema's (ONS/src/main/index.ts, `registerSchemesAsPrivileged`, ≈:6301).
  - Gemeten: `fetch` vanuit de hoofddraad én vanuit een module-werker werkt zo al, onder `file://` en onder `http://localhost`, zonder `corsEnabled` en zonder ACAO-kop (D/spike/uitslag-file.json en uitslag-http.json).
  - Een ACAO-kop zetten we dus niet.
- **Adressen:**
  - `p/<40hex>`: pakket;
  - `t/<40hex>`: textuurbestand of plak;
  - `h/<40hex>`: heldenbeeld.

  Alleen id's uit de registry, nooit paden, volgens het patroon van `omsischerm` (index.ts, `schermplaatje`) en van de apparaatserver (ONS/src/main/apparaat.ts:26-41).
- **Registry:** `t/<id>` wijst naar `(pad, grootte, mtime, off, len)`.
  - Het pad moet binnen de installatie liggen en een textuurextensie hebben (dezelfde toets als `veiligePlaatje` in ONS/src/core/schermvorm.ts).
  - Vóór het stromen doet main een `stat`. Kloppen grootte of mtime niet meer, dan antwoordt main met 409, en het venster vraagt `bus:model3d` opnieuw.
- **Waarom geen IPC voor grote buffers:** een kopie in de gebeurtenislus van main, en die bedient ook de overlay. Een stroom uit een bestand kost main vrijwel niets.

### 4.4 Tekenen in het venster: één renderer-werker per venster

Live 3D gebeurt alleen in het eigen 3D-venster (`bus3d.html`, §8.1), en het verborgen fotovenster (§4.5) tekent de stilstaande plaatjes. Het hoofdvenster toont alleen foto's en heeft geen WebGL-context en geen 3D-geheugen.

- **`bus3d/verbinding.ts`** is een singleton per venster. Die maakt bij de eerste viewer `new Worker(new URL('./werker.ts', import.meta.url), { type: 'module' })`.
- **De werker maakt zelf `new OffscreenCanvas()` met één WebGL2-context**, en houdt die (met de geüploade texturen) vast zolang het venster leeft.
- **Elke `BusViewer`** heeft een eigen `<canvas>` met een `bitmaprenderer`-context. De werker tekent op maat, doet `transferToImageBitmap()` en stuurt het beeld; het venster doet `transferFromImageBitmap`.
- **Waarom zo**
  - `transferControlToOffscreen` bindt de context aan één doek. Een tweede aanroep geeft `InvalidStateError`: gemeten, D/spike. Dat botst met React StrictMode (ONS/src/renderer/src/main.tsx:24; het 3D-venster krijgt dezelfde StrictMode) en met het wisselen van bus of doel (buskeuze → dealer → wagenpark) in hetzelfde venster.
  - Zo blijft er één context. Mounten en unmounten is alleen aan- en afmelden.
  - Het heldenbeeld gaat via `convertToBlob` in de werker: WebP 1280×800 in 118-127 ms (D/spike), buiten de React-draad.
  - **Gehusselde hoekpuntblokken** (§5.1) worden hier ontward, direct na de fetch en vóór het uploaden, in stukken van ≤ 16 ms.
- **Eén viewer.** Er is hooguit één 3D-venster, met één `BusViewer`. De bitmaprenderer-opzet laat later meer viewers toe zonder tweede context, maar dat is nu niet nodig.
- **Gemeten in dev (`http://localhost`) en onder `file://`:**
  - de module-werker start;
  - een blob-werker start met `worker-src 'self' blob:`;
  - `fetch` naar het eigen schema werkt;
  - de bitmaprenderer werkt.
- **Nog te meten in F0:** een werker die uit `app.asar` laadt in de gebouwde exe. Lukt dat niet, dan `?worker&inline` (blob, gemeten werkend). Als laatste terugval draait dezelfde module op de hoofddraad, in stukken.

### 4.5 Het fotovenster

`busfoto.html` laadt dezelfde `bus3d/teken.ts` en tekent vanuit hetzelfde pakket, in het verborgen `BrowserWindow`; gehusselde blokken ontwart het net als de renderer-werker in het geheugen. De rij, de `.geen`-bestanden en `omsibus://` uit ONS/src/main/busfoto.ts:40-45 en 79-119 blijven.

---

## 5. Wat er getekend wordt

### 5.1 Het model lezen zoals OMSI: `schermcfg.ts` uitbreiden, geen nieuwe lezer

We bouwen voort op ONS/src/core/schermcfg.ts. Die kent al (:169-198):
- `[matl]`, `[matl_alpha]`, `noZwrite`, transmap, envmap, allcolor, texadress;
- alphascale, alle `[visible]`'s, `[newanim]`, LOD, viewpoint en isshadow.

**Erbij komen:**
- `[matl_noZcheck]`, `[matl_envmap_mask]`, `[matl_bumpmap]`;
- `[matl_change]`/`[matl_item]` (als ze er nog niet volledig in zitten), `[texttexture]`, `[scripttexture]`, `[matl_freetex]`.

`busmodel.ts` stapt later op dezelfde lezer over; dat valt buiten deze bouw.

**`-<DISABLED>-` … `-<ENABLED>-`** staat in standaardbussen, bijvoorbeeld OMSI/Vehicles/MAN_SL_SG/Model/model_SL92_main.cfg:1913-1946 en 2504-2536. De betekenis komt alleen uit B/docs/FORMATS.md:36-50, niet uit onze eigen Omsi.exe-analyse. Daarom:
1. **Eerst meten.** `meshes.json` van de plugin na een rit met de SL92, naast onze meshlijst.
2. Pas als OMSI die meshes echt overslaat, komt het in `schermcfg.ts`. Anders verschuift de mesh-index die de plugin gebruikt.

**Textuurpaden**
- Mapvolgorde: de map van de kleurstelling, `<bus>\Texture`, `<model>\Texture`, `<model>`, `OMSI\Texture`.
- Per map eerst de exacte naam, dan dds, bmp, tga, jpg en png. Pas daarna de volgende map (idee uit B/crates/omsi-texture/src/lib.rs:244-282).
- Niet door de hele voertuigmap zoeken: daar liggen 8146 repaint-texturen in submappen (vooronderzoek §C.2).

**Wat in beeld komt**
- Viewpoint 0 of bit 1 (buiten). Vp 2 (alleen binnen) gaat mee in het pakket, met een vlag, voor Instappen. Vp 4 (alleen AI) valt weg.
- Bij LOD alleen de groep met de hoogste waarde, plus de meshes vóór de eerste `[LOD]`.
- Dubbele vermeldingen blijven vermeldingen; hun geometrie wordt gedeeld per `(deel, o3d)` (G/:1162).

**`[matl] tex n`** hoort bij het (n+1)-de materiaal met die textuurnaam in de o3d. De o3d-kleuren gaan mee: diffuus, specular, emissie en macht (ONS/src/core/o3d.ts:78-90).

**Reparaties** (ideeën uit B/crates/omsi-app/src/scene.rs:9321-9354 en 9414-9420, in eigen code)
- Een carrosserie die ten onrechte als Blend staat, wordt dicht getekend, tenzij de naam op glas wijst.
- `noZcheck` op zo'n carrosserie gaat uit.
- Een CTC-display waarvan de eigen textuur één vlakke kleur is, krijgt de textuur van de eerste kleurstelling (idee uit B/crates/omsi-sim/src/vehicle.rs:473-521).

**Maat, naam en beschrijving**
- `[boundingbox]` uit de .bus (in 394 van de 395 bussen), met de aanhangers erbij.
- Assen: in OMSI ligt y vooruit en z omhoog; wij wisselen y en z (FORMATS.md:158-161).
- De aanhanger komt op zijn plek via `[coupling_back]` en `[coupling_front]` (C2 GN op −9,077 m; vooronderzoek §C.17).
- `[friendlyname]` (3 regels) en `[description]`.
- `<bus>_<TAAL>.dsc` in de volgorde: nl → ENG → DEU; en → ENG; de → DEU; fr → FRA.

**Versleutelde modellen: we tonen wat OMSI op deze pc toont** (Lucs keuze 1, 28-09: "Ik wil dat alles getoond wordt")

*Wat versleuteld is.* Vanaf o3d-versie 4 staat op byte 4-7 een woord. `ffffffff` betekent open. Elk ander woord betekent dat per hoekpunt de coördinaten, de normaal en de uv gehusseld zijn (ONS/src/core/o3d.ts:152-162). Driehoeken, materialen, matrix en beenderen staan open in het bestand.

*Het woord is het artikelnummer van het add-on.* Het is geen geheim en geen licentiecode. Gemeten over alle o3d's onder Vehicles, Sceneryobjects, Splines en Humans (D/sleutels/sleutels.out.txt):

| Woord | = ArtNr | Add-on (uit RegAddons) | Bestanden |
|---|---|---|---|
| 0x31b6 | 12726 | OMSI 2 - Hamburg | 4882 |
| 0x35a2 | 13730 | Add-On HafenCity | 2793 |
| 0x32cd | 13005 | OMSI 2 - Drei Generationen | 2468 |
| 0x3d29 | 15657 | Add-on Hamburg Linie 20 | 1201 |
| 0x363f | 13887 | Add-On MAN Stadtbusfamilie | 754 |
| 0 | — | de standaardinhoud (MAN NL/NG, Buildings_MC en andere) | 2156 |
| 0x307b | 12411 | **niet geregistreerd** | 81, allemaal in VA_GS_Hochflurer |
| 0x364f | 13903 | **niet geregistreerd** | 12: de Almex-tekstmeshes (`*_almex_hst1`, `_s_datum`, `_s_ticketpreis`, `_s_ziel`) in HC_Volvo7900H, HH20_EBus2021 en HH_Stadtbus2017 |

*Waar OMSI de registratie leest.* `OMSI/addons.ini` en `OMSI/RegAddons/*.ini`: per add-on een blok `[addon.N]` met `Name`, `ArtNr`, `Steamname` en `SteamArtNr`. Op Lucs pc is `addons.ini` leeg (0 bytes) en staan er in `RegAddons` vijf: 12726, 13005, 13730, 13887 en 15657. Het bewijs:
- Omsi.exe (2.3.004) kent een record `TAddon` met de velden `Name`, `ArtNr`, `SteamName`, `SteamArtNr` en `Active` (RTTI rond byte 1.476.858; D/sleutels/exe.cjs, `.out.txt`).
- OMSI schrijft bij het starten "Registrations loaded" in zijn logboek (OMSI/logfile.txt:104).
- Een parallelle proef van vanavond heeft de lader in Omsi.exe nagelezen (K/sleutels/registratie.ts:1-8, `o3dlaad*.txt`, `addons*.txt`, `basetype_settype.txt`; door mij alleen steekproefsgewijs bekeken). Volgens die proef slaat sleutel 0 de controle over, komt de lijst uit `addons.ini` en daarna `RegAddons\*.ini`, en telt een vermelding pas als ze bij het starten bevestigd is: in de Steam-versie via Steam (`BIsSubscribedApp(SteamArtNr)` in BaseType.dll), in de winkelversie via fontsPr.dll (register en handtekening). Dat is het veld `Active`. De hussel-constanten 0x17D en 0xFDE8 staan in dezelfde lader (K/sleutels/o3dlaad.txt:231-245).
- Volgens openOMSI weigert het origineel sleutels die niet in zijn registratielijst staan (B/docs/FORMATS.md:193-194; B/crates/omsi-o3d/src/lib.rs:141-143).

*De bevestiging doen we na, zonder Steam aan te roepen.* Voor een Steam-installatie moet de `SteamArtNr` als `dlcappid` in `steamapps/appmanifest_252530.acf` staan (alleen gelezen). Op Lucs pc staan alle vijf erin: 313430, 299350, 434066, 630010 en 1889540. Een winkelversie kunnen we niet bevestigen; daar tonen we alleen sleutel 0. Het register kent op Lucs pc geen add-ons: onder `HKLM\SOFTWARE\WOW6432Node\aerosoft\OMSI 2` staan alleen `Product_Path`, `Article_Number` en `version`, en onder HKCU niets van OMSI (alleen gelezen). Zo tonen we hooguit te weinig, nooit meer dan OMSI. Eén controle door Luc in F0 (§14) sluit het af.

*De regel.*
- Een o3d met sleutel 0 wordt ontward en getoond. Een o3d met een andere sleutel ook, als die sleutel als `ArtNr` in `addons.ini` of `RegAddons` staat én bevestigd is (Steam: de `SteamArtNr` is een geïnstalleerde DLC).
- Een o3d met een andere sleutel laten we weg, zoals OMSI hem weigert. Hij telt als `versleuteld`.
- Is meer dan 10% van de unieke o3d-lezingen van een bus weggelaten, dan antwoorden we met `'versleuteld'`: het icoon met uitleg (§9). Tot 10%: 3D zonder die onderdelen, met het label `bv.partial`. Hier wordt niet dubbel geteld.
- De app voegt nooit zelf een sleutel toe, schrijft niets in `addons.ini`, `RegAddons` of het Steam-manifest, en heeft geen instelling om een sleutel op te geven. We omzeilen geen registratie.
- Main leest de registratie bij het starten en opnieuw als de add-on-manager iets verandert (`stat` van de ini's en van het manifest). Verdwijnt een sleutel, dan vergeten we de pakketten, heldenbeelden en foto's v4 met die sleutel (`vergeetBus3d`). Daarna volgt het icoon.

*Ontwarren.* Eigen code in `src/shared/o3dhussel.ts` (ongeveer 80 regels, een pure functie op een `Float32Array` over het hoekpuntblok). Het idee komt uit B/crates/omsi-o3d/src/lib.rs:137-180 en 239-278 en B/docs/FORMATS.md:177-194; de code wordt niet vertaald of gekopieerd (§15).
- Invoer: alleen wat in het bestand zelf staat: de versie, de vlagbyte, het woord uit de kop en het aantal hoekpunten. Geen andere sleutel, geen lijst van buiten.
- Per hoekpunt volgt uit een lopende toestand welke assen van positie en normaal wisselen, welke normaalcomponenten van teken wisselen en hoeveel u en v verschuiven. De toestand van het volgende hoekpunt hangt af van de nog gehusselde positie van het vorige.
- Nagemeten met een eigen proefversie (D/sleutels/ontwar.cjs, `.out.txt`):
  - `21_aussen_weich3.o3d` (sleutel 15657, versie 7) tegen zijn open tweeling `21_aussen_weich3_#low.o3d`: vóór het ontwarren wijken 271 van de 582 posities af, erna 0. Ook normalen en uv's zijn gelijk.
  - Sleutel 0, de 209 meshes van `model_EN92.cfg` (MAN NL/NG): gehusseld ligt de 1e-99e percentiel op ±5,8 m langs alle drie de assen, een waaier. Ontward is dat 2,50 × 2,68 × 11,62 m (breedte × hoogte × lengte), en de `[boundingbox]` van de .bus zegt 2,472 × 2,491 × 11,663 m.
  - Alle 40 bussen met een ontwarbare sleutel, tegen hun eigen `[boundingbox]` + 0,5 m (D/sleutels/allebussen.cjs, `.out.txt`). Gehusseld valt 35-65% van de hoekpunten erbuiten. Ontward is dat bij de solobussen 0,00% (op de MAN NUE263 na, zie hieronder): HC Volvo 12, de vier HH109-stadsbussen, HHStadtbus 97, 98 en 99, de 2012 solo, MAN EN92, NL263, NL263_3, NL313-15 en de 15 SD-bussen. In die solobussen zitten sleutel 0, 12726, 13005, 13730 en 13887, met versie 4, 5 en 7 en vlag 0, 1 en 2 (D/sleutels/combis.out.txt). Alleen sleutel 0 met versie 7 en sleutel 15657 met vlag 0 komen in geen solobus voor; 15657 met vlag 2 is door de tweeling exact bevestigd. Bij de gelede bussen (ook de HH20 EBus 2021) blijft 0,7-31% buiten de doos van de voorwagen. Dat zijn balg, gelenk en middenframe net achter de voorwagen, plus een paar wielen die onder de doos uitsteken; geen waaier (D/sleutels/buiten.cjs, `.out.txt`: HHStadtgelenkbus 99, NG313, GN92, HH20). De MAN NUE263 komt op 50%, maar daar valt ook 65% van de open hoekpunten buiten zijn doos: die doos past niet bij het model.
  - Snelheid in node: 1.146.007 hoekpunten (alle 754 o3d's van MAN_NL_NG_263) in 33 ms, 318.000 (HH109 Stadtgelenkbus 1999) in 10 ms.

*Geen ontwarde meetkunde op schijf.* We kiezen "bewaren zoals in het bronbestand", niet "niet cachen". Niet cachen zou de 21 Hamburgse en MAN-bussen bij elke opening de tijden van "nieuw" geven (§10), terwijl ontwarren in het geheugen maar 3-35 ms kost.
- Het pakket (`.b3d`) bewaart het hoekpuntblok van **elke** o3d byte voor byte zoals in het bronbestand: 32 bytes per hoekpunt, in de assen van de o3d. Bij een gehusseld blok staan de versie, de vlag en het woord erbij. Sleutel 0 volgt dezelfde weg; zo is er één route en één proef.
- Ontward wordt alleen in het geheugen:
  - in de werker `'bus3d'`, voor het buitenoppervlak per textuur, het UV-oppervlak en de controle op de doos; daarna gaat alleen het getal naar het pakket;
  - in de renderer-werker van het 3D-venster en in het fotovenster, direct na de fetch en vóór het uploaden.
- Alles wat hoekpunten verandert (y en z wisselen, normalen van lengte 0 repareren, stukken samenvoegen per materiaal, §5.4) gebeurt daarom pas in het geheugen, voor open en gehusselde blokken gelijk. Het wisselen van y en z kan in de vertex-shader.
- Wat wel in het pakket mag, omdat het geen meetkunde is: tellingen, de doos, en per textuur de oppervlakken A en U (§5.7).
- Heldenbeeld en foto v4 zijn plaatjes, geen meetkunde, net als een schermafdruk in OMSI. Die mogen op schijf.
- De probe controleert het (§13): voor elke gehusselde o3d is het blok in de `.b3d` byte voor byte gelijk aan het bronbestand.

*Wat dit oplevert op Lucs pc* (D/sleutels/perbus.out.txt)
- 394 bussen hebben een model. 41 daarvan hebben minstens één versleutelde o3d, en 26 zitten boven de 10%. Die krijgen nu een icoon, ook in de foto v3 (ONS/src/core/busbeeld.ts:236-250).
- Van die 26 komen er 25 in 3D en op de foto:
  - 4 met sleutel 0: MAN EN92, EN92 EUR, GN92 en GN92 EUR (MAN_NL_NG, 100% sleutel 0);
  - 21 met een geregistreerde sleutel: HC Volvo 7900H (2), HH109 Stadtbus HHA, Schnellbus, VHH en PVG (4), de mappen HH109_Stadtgelenkbus1992_HHA (1), _1999_VHH (4) en _2012_HHA (2), HH20 EBus 2021 (2) en de MAN NL/NG 263 en 313 (6).
- Eén blijft een icoon: GS GU240 (VA_GS_Hochflurer), 100% sleutel 12411.
- De 15 SD77-achtige bussen van MAN_SD200 hebben elk 100 buitendriehoeken met sleutel 0 (ongeveer 3% van hun o3d's). Die zijn nu ook compleet.
- Opgeteld komen er 293.254 buitendriehoeken met sleutel 0 (19 bussen) en 2.662.269 met een geregistreerde sleutel (21 bussen) in beeld. 107.574 blijven weg (1 bus).
- De 12 Almex-tekstmeshes met sleutel 13903 komen in de `model.cfg`'s van de bestuurbare bussen niet voor, dus die tellen hier niet mee.

### 5.2 De ruststand (`core/busrust.ts`; `core/osc.ts` vanaf F3)

**Waarom scripts en geen regel**
- 54% van de buitendriehoeken valt onder een `[visible]`.
- "Alles op 0" verbergt 40,6%.
- De stoelen van de NLC 12C hangen aan waarden die `{frame}` zet uit `vis_Sitztyp` (MAN_NewLionsCity\script\setvar.osc:1233-1249; vooronderzoek §C.15a).

**De invoer, in de volgorde van OMSI**
1. Alle variabelen uit `[varnamelist]` en `[stringvarnamelist]` op 0 en "".
2. De constanten en curves uit `[constfile]`.
3. De standaardwaarden van de motor, vóór `{init}` (idee uit B/crates/omsi-sim/src/vehicle.rs:831-892):
   - Envir_Brightness 1, GivenTicket −1, wearlifespan 1;
   - Axle_Springfactor_* 1;
   - Dirt_Norm, DirtRate, PrecipRate en StreetCond 0;
   - `$.yard` = de naam van de gekozen remise als die bekend is, anders "".
4. `{init}` van alle `[script]`'s, in de volgorde van de .bus.
5. **Precies `kleurVars(relatiefPad, kleurstelling)`**: de CTC-variabele met haar index plus de setvars. Dat is hetzelfde blok dat de app in de situatie schrijft (ONS/src/main/index.ts `kleurVars`; ONS/src/core/situation.ts:127-130).
   - Zo is wat je ziet gelijk aan wat je rijdt.
   - Bij "Standaard" zet de app niets, en de viewer dus ook niet.
6. `{frame}` met Timegap 1/30, tot er niets meer verandert in `[visible]`, `[matl_change]` en `[alphascale]`, met een maximum van 10 rondes.
7. Vaste systeemwaarden:
   - Time 12:00 (in F5 de tijd van de rit), en een datum;
   - regen en natheid 0, snelheid 0.

   Onbekende systeemvariabelen lezen als 0 en worden per bus gelogd (`onbekend[]`).

**Gemeten waarom de volgorde telt** (K/kritiek/volgorde.out.txt): in 5 bussen schrijft `{init}` letterlijk een setvar-variabele:
- HH109 Stadtbus en Schnellbus, Stadtgelenkbus 92 en 99 (`decals_*`);
- Rheinhausen Überlandbus (`hide_engl_*`, `hide_stern_*`).

Die vijf gaan in `probe-osc.ts`.

**Onzeker:** of OMSI de `[vars]` direct na `{init}` toepast of pas na het eerste frame. De plugin-afdruk beslist dat.

**Wat eruit komt**
- `[visible] var w`: zichtbaar als |var − w| < 0,5 (B/crates/omsi-sim/src/vehicle.rs:2438-2442). Of OMSI afrondt of exact vergelijkt, beslist de plugin-afdruk (ONS/HANDOVER.md:1011-1013).
- `[matl_change]`/`[matl_item]`: het item volgens de waarde.
- `[alphascale]`: de waarde uit het script.
- `[newanim]` in rust (F3b): stand = var × factor + offset, samengesteld in bestandsvolgorde (FORMATS.md:290-297, 418-427).
- De stringvariabelen voor `[texttexture]` (F3).

**De regels, zolang de OSC-machine er niet is (F2), en als terugval**

Voor `[visible]` en `[matl_change]`, in deze voorrang:
1. `kleurVars`: CTC-index en setvars. Die winnen van wat `{init}` letterlijk toekent, zoals in het spel.
2. `startwaardenVan` (ONS/src/core/schermvorm.ts:1426-1690).
3. De alias `vis_CTI_<var>`.
4. 0 als een vermelding 0 gebruikt.
5. Anders de laagste waarde (G/:1177-1180).

Voor `[alphascale]`:
- **Een curve bij daglicht.** Zet het script de variabele via het patroon `(L.L.Envir_Brightness) (F.L.<curve>) (S.L.<var>)`, dan rekenen we de curve uit bij Envir_Brightness = 1.
  - Voorbeeld: `Szyby` in Kajosoft, OMSI/Vehicles/Citybus 530 by Kajosoft/Script/cockpit.osc:4641, met de curve in cockpit_constfile.txt:197-205 (0 → 0,45, 1 → 1). Dat geeft 1,0.
- **Anders de lijst op naam:** 0 voor `Rain_*`, `Dirt_*`, `*_Grain`, `Dash_*`, `para_*`, `mroz*` en `beschlag_*`.
  - Elke naam wordt eerst in `probe-bus3d.ts` nagemeten.
  - **`Szyby*` staat er niet meer in.** Dat is het glas zelf: 47 vermeldingen in model_o530_e2_2.cfg, 44 cfg's in Citybus 530 en 10 in Citybus 628 (nagekeken).
- 1 voor `Envir_Brightness` en voor onbekende namen.

De stand krijgt dan `bron: 'regels'`.

**`core/osc.ts`** (F3, een eigen stapelmachine van 1200-1800 regels)
- Getallen en teksten, `(L.L.x)`/`(S.L.x)`, stringvariabelen en `$`-bewerkingen.
- Registers, rekenen, `{if}{else}{endif}`, macro's, constanten en curves, `random` met een vaste zaadwaarde.
- Triggers, geluid en invoer doen niets.
- Grenzen: 2 miljoen bewerkingen per blok, macrodiepte 64.
- Omvang om rekening mee te houden: mediaan 48.684 tokens per bus, maximaal 59.396 (NLC 18C: 24 scripts, 763 kB, 2119 variabelen; K/kritiek/scripts.out.txt).
- Bronnen voor de betekenis: de SDK-wiki (K/weergave/wiki_*.html), B/docs/FORMATS.md en onze eigen metingen. Geen vertaalde code (§15).

**De plugin-afdruk**
- Als OMSI draait en `meshesKloppen` waar is (ONS/src/main/scherm.ts:204-231), bewaart main bij de eerste stilstand van een rit `live.zichtbaar` in `zicht/<sha1(cfg)>-<kleur>.json`.
- Die afdruk is een ijkpunt in `probe-osc.ts`.
- Hij krijgt voorrang (`bron: 'omsi'`) bij een bus waar het script faalt.
- Lichten en deuren tellen in de vergelijking niet mee.

### 5.3 Materialen en doorzichtigheid

| Geval | Gang | Diepte | Dekking |
|---|---|---|---|
| Geen `[matl_alpha]` of 0 | Dekkend | Test en schrijven | 1. De textuuralfa is het spiegelmasker (ONS/src/renderer/src/busfoto.ts:102-112) |
| `[matl_alpha] 1` | Alfatest | Test en schrijven | Alpha-to-coverage met een verscherpte alfa, zodat de drempel op 0,5 blijft: `a' = clamp((a − 0,5)/fwidth(a) + 0,5, 0, 1)`. Zonder MSAA `discard` < 0,5 |
| `[matl_alpha] 2` | Mengen | Test; schrijven alleen zonder `noZwrite` | textuur.a (of transmap.a, anders de helderheid) × diffuus.a × alphascale |
| `noZcheck` | Mengen | Diepteverschuiving met `polygonOffset`, niet zonder test (B/crates/omsi-render/src/lib.rs:635-636) | — |
| `[isshadow]` | Eerste van de mengfase | Test, niet schrijven | textuur × 0,6, op het wielvlak (FORMATS.md:440-446) |
| `[texttexture]` zonder inhoud | Mengen | — | Doorzichtig zwart, geen "Textfield" meer |

- **Kleur** = textuur × diffuus × licht, plus textuur × emissie (idee uit shader.wgsl:1001, 1014). Zonder textuur de diffuse kleur.
- **Adressering:** REPEAT, of CLAMP_TO_EDGE bij `texadress_clamp`/`_border`.

### 5.4 De tekenvolgorde

1. **Dekkend en alfatest.** Stukken zonder `[visible]`-voorwaarde (46% van de buitendriehoeken) worden per materiaal samengevoegd. Wisselende stukken worden per vermelding getekend.
2. **Mengen.** Per deel van achter naar voren; binnen een deel in cfg-volgorde, zonder sorteren op middelpunt (vooronderzoek §D.1).
3. **Blend:** `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`.
4. **Achterkanten:** wegsnijden met `frontFace(CW)`. Normalen met lengte 0 (0,19%) krijgen een vervangende waarde.

### 5.5 Licht, glans, reflectie en tonemapping

- **Licht:** zon × N·L × schaduw, plus hemel × (0,5 + 0,5·n.z) × (0,6 + 0,4·schaduw), plus omgeving (idee uit shader.wgsl:976-987).
  - Beginwaarden in Buiten: zon 1,0 warmwit op 38° hoogte, van rechtsvoor-boven gezien vanuit de beginstand van de camera; hemel 0,45; omgeving 0,15.
  - We ijken op de witte O560 en de beige SD77, naast Lucs schermafdruk van openOMSI.
- **Specular:** Blinn-Phong met de specular-kleur en macht uit o3d of `[matl_allcolor]`, alleen aan de zonkant.
- **Reflectie:** k = min(masker × factor, 1).
  - Op glas: k × (0,18 + 0,82·(1−N·V)⁴), over de ruit gelegd.
  - Op lak: k × `lakglans` (standaard 0,35, instelbaar) × Schlick (F0 0,04).
  - Is het gemiddelde masker op de carrosserie > 0,9 bij factor ≥ 1, dan begrenzen we op 0,3 (vooronderzoek §C.14).
- **Omgevingskaart:** één keer per omgeving getekend uit de hemelkoepel en de vloer, in een cubemap van 128² met mips. De `[matl_envmap]`-texturen van de bus laden we dus niet.
- **Bumpmap:** alleen in F5, en alleen voor de reflectie.
- **Tonemapping:** Khronos PBR Neutral met een vaste belichting, daarna sRGB-codering in de shader. Nageschreven uit de gepubliceerde formule, met de bron in een commentaarregel.

### 5.6 Schaduw, grond, hemel

- **Schaduwkaart**
  - Eén richting, orthografisch, gepast op de doos plus 1 m; 2048² in DEPTH32F (16 MB).
  - PCF met eerst 5 monsters, dan 16 (idee uit shader.wgsl:542-558), en een normal-offset-bias.
  - Opnieuw getekend alleen bij een ander model, een andere stand of ander licht.
- **Contactschaduw:** één keer per model een diepte-opname van onderen (≤ 0,6 m, 256²), twee keer vervaagd en op de vloer vermenigvuldigd.
- **`[isshadow]`:** op 60% sterkte.
- **Buiten, de standaard vanaf F2:**
  - **Hemelkoepel:**
    - Uit `[sky_textures]` van OMSI/envir.cfg:8-11: himmel01.bmp, 04 en 05. Dat zijn 2048×512 BMP's van 32 bits, gelezen met onze eigen BMP-lezer.
    - u = azimut ten opzichte van de zon, v = hoogte; overdag himmel01 (idee uit B/…/sky.wgsl:1-2).
    - Wolken uit `OMSI/Texture/clouds.tga` (1024², 24 bits). In F5 de wolkensoort van het gekozen weer (idee uit weather_setup.rs:53-75).
  - **Vloer:** een matte grijze schijf (lineair 0,12, te ijken op het oog), die naar de horizon overgaat in de kleur van de hemel. Zo is er geen harde rand.
  - **Zon:** vast in F2-F4, zoals in §5.5. In F5 uit breedte en lengte van de kaart plus datum en tijd van de rit (FreeRequest `wanneer`, ONS/src/shared/api.ts:180).
  - **Het doek is dicht** (`alpha:false`) en hangt niet af van het thema.
- **Foto v4:** doorzichtig. Alleen de contactschaduw staat als alfa in het plaatje, zodat hij op elke tegelkleur past.
- **Studio** (optioneel, F5): een vloer met een verloop in themakleuren, voor de dealer als Luc dat wil.

### 5.7 Texturen: de GPU doet het werk

**Routes**

| Soort | Route | Gemeten (D/spike, bijlage B) |
|---|---|---|
| DXT1/3/5 met mipketen, zijden deelbaar door 4 | Gecomprimeerd uploaden (`COMPRESSED_SRGB_*_S3TC_*`), rechtstreeks uit de stroom; niveaus boven de doelmaat overgeslagen | 12C_2d_01 (4096×2048, 13 mips): fetch 28 ms, upload van niveau 1-12 in 4,4-5,5 ms |
| DXT zonder mips, of niet deelbaar door 4 | Tijdelijk gecomprimeerd uploaden, in één tekenstap naar `SRGB8_ALPHA8` op de doelmaat, `generateMipmap`, tijdelijke textuur weg | nlc_pipes 2048² naar 1024² met mips in 13,8-15,1 ms; gemiddelde waarde 59,7 (niet zwart); geen GL-fout |
| PNG, JPG | `createImageBitmap(blob, { premultiplyAlpha:'none', colorSpaceConversion:'none', resize… })` in de renderer-werker, dan `texStorage2D(SRGB8_ALPHA8)` en `generateMipmap` | C2: 58 bestanden, 42 Mpx, decode 85-88 ms, upload plus mips 75-80 ms. Urbanway: 53 bestanden, 76 Mpx, 161-178 ms plus 198-241 ms |
| BMP van 1, 4, 8 of 24 bits | Idem, via de decoder van Chromium | Gelijk aan `pakBmpUit` in 84 van 84 echte BMP's |
| TGA, BMP van 32 bits of met bitmaskers, niet-DXT DDS, bestanden met een verkeerde extensie | Eigen lezers op DataView in de renderer-werker (`shared/beeldlezers.ts`, overgezet uit `core/textuur.ts`, dat ze daarna zelf ook gebruikt) | `pakBmpUit` 6,6 ms/Mpx (node) |

- **BMP: Chromium of eigen lezer.** Achter elkaar decodeert Chromium een BMP trager dan `pakBmpUit` (14 tegen 6,6 ms/Mpx). Chromium kan wel parallel decoderen; bij PNG haalde het 2 ms/Mpx. F2 meet welke route bij BMP het snelst is. De pixels zijn gelijk, dus het is alleen een snelheidskeuze.
- **Soort op inhoud.** De soort wordt op de inhoud herkend, niet op de naam. `vmatrix_grey.bmp` heeft geen BMP-kop.
- **Geen `.b3t`, geen CPU-mips, geen `verkleinGemiddeld`.** Voor de NLC gaat het CPU-werk van 3,8 s (K/kritiek/bank.out.txt) naar vrijwel 0 in node. Wat overblijft zijn de eigen lezers in de renderer-werker: 4,3 Mpx BMP/TGA bij de NLC.
- **Zonder `_s3tc_srgb`:** RGB-S3TC plus linearisatie in de shader, met een vlag per materiaal. Zonder S3TC (proef `--use-angle=swiftshader`): de DXT-lezer uit `textuur.ts` in de werker, en dan RGBA.

**Doelmaat per textuur** (in plaats van "de 4 met de meeste driehoeken")
- **De maat komt uit de texeldichtheid, niet uit de naam.**
  - De werker levert per textuur het buitenoppervlak A in de wereld (m²) en het UV-oppervlak U.
  - De eigen dichtheid is d₀ = √(U·b·h / A) texels per meter.
  - Het doel is d* = 400 texels/m: een bus van 12 m op 1600 apparaatpixels is 130 px/m, en bij zoom 2,5 ongeveer 330 px/m.
  - Het aantal over te slaan niveaus is k = max(0, ⌊log₂(d₀/d*)⌋).
  - Kap: 4096 voor DXT (goedkoop: 4096×2048 DXT1 met mips is 5,3 MB) en 2048 voor RGBA.
- **Waarom niet de CTC-regel.** `[CTCTexture]` betekent niet "carrosserie". De NLC heeft 26 CTC-plekken, waaronder stoelen, buizen en velgen; de O560 heeft er 14 (D/vram3.out.txt). "Stoelen ≤ 512 op naam" is om dezelfde reden te broos.
- **De carrosserie** is de CTC-plek met het grootste buitenoppervlak. Die zakt als laatste in het budget.
- **Envmap-texturen** worden niet geladen (§5.5).

**Budget:** ≤ 160 MB aan texturen per viewer, ≤ 96 MB zolang OMSI draait.
- Zolang het er boven zit, zakt de textuur met de meeste bytes per m² buitenoppervlak één niveau.
- Een schatting vóór het budget, met RGBA voor DXT zonder mips (D/vram3.out.txt; indeling nog op naam, dus grof):

| Bus | Schatting vóór het budget | Oordeel |
|---|---|---|
| SD77 | 76 MB | Past zonder stap |
| O560 E6 | 78 MB | Past zonder stap |
| NLC | 248 MB | Het budget grijpt in |
| C2 GN | 203 MB | Het budget grijpt in |
| O550 | 207 MB | Het budget grijpt in |
| Urbanway 18 | 405 MB | Het budget grijpt in |

- Eén niveau lager maakt een RGBA-textuur 4× kleiner, dus meestal volstaat één stap op de grootste.

**Progressief laden**
- Het eerste beeld komt zodra de geometrie er is, met de kleinste DXT-niveaus en voor de rest de diffuse kleur van het materiaal.
- Daarna komen de texturen, de carrosserie eerst.
- De eigen lezers werken in stukken van ≤ 16 ms tussen twee beelden, zodat slepen tijdens het laden niet hapert. Is dat niet genoeg, dan komt er een tweede werker als ontleder.

**Geen BC-encoder.** Die is niet nodig, want er is geen cache meer. Heroverwegen alleen als het budget op andere pc's te veel kwaliteit kost.

### 5.8 Anti-aliasing en resolutie

- 4× MSAA via `antialias:true` (gemeten: 4 samples) plus alpha-to-coverage.
- DPR = min(apparaat, 2). Is p95 > 12 ms over 30 beelden, dan DPR 1,25 en daarna 1, gemeten als tijd tussen twee beelden.
- Er wordt alleen getekend bij een verandering.
- Shaders compileren met `KHR_parallel_shader_compile`, zodat de werker tijdens het compileren al texturen ophaalt.

---

## 6. Camera en bediening

- **Beginstand:** schuin rechtsvoor aan de deurzijde: yaw 215°, 8° hoog, lens 30° (idee uit showroom.rs:110-115, 331).
- **Inpassen:** afstand = max(lengte/2 + 1 over tan15°·beeldverhouding·0,92, hoogte/2 over tan15°·0,85) × zoom, minimaal 8 m.
  - Mikpunt: het midden van de doos, met z × 0,75.
  - De camera komt nooit lager dan 0,6 m (idee uit showroom.rs:331-351).
- **Bediening**
  - Slepen draait 0,35°/px en kantelt 0,25°/px, begrensd op −2° tot 60°.
  - Wiel en knijpen zoomen 8% per stap, tussen 0,55 en 2,5. In het 3D-venster valt er boven het beeld niets te scrollen, dus daar zoomt het wiel altijd; boven het zijpaneel scrolt het paneel. (Dat vervangt "alleen met focus of met ctrl" uit G/:1221, dat voor een viewer midden in een pagina bedoeld was.)
  - Pijltjes draaien 15°, +/− zoomt, dubbelklik zet terug. Alle toetsen van het venster staan in §8.1.
  - Knoppen Voor, Zijkant, Achter en Schuin.
  - Naloop exponentieel met τ = 0,18 s (idee uit showroom.rs:202-210).
- **Draaiplateau:** 6°/s na 6 s stilstand, alleen in de dealerstand van het 3D-venster. Niet bij `prefers-reduced-motion` en niet als OMSI draait.
- **Instappen** (F5): oogpunt uit `[add_camera_driver]`, viewpoint 0 of bit 2 (die meshes zitten al in het pakket), lens 60°, alleen rondkijken, met een knop "Uitstappen".

---

## 7. Kleurstellingen

- **Vinden:** zoals nu in ONS/src/core/kleurstelling.ts:17-27 en 62-177, met hetzelfde type `BusKleurstellingen` (ONS/src/shared/api.ts:83-86).
- **Kiezen** is `setBusKleur({ pad, naam })`, via een tegel of via [Kiezen] in het 3D-venster (§8.1). Dat komt in `FreeRequest.kleurstelling` en `BeginRequest.kleurstelling` (api.ts:177-178, 358-359). Er komt geen nieuw veld.
- **"Standaard":** de app zet niets. De viewer toont de eigen texturen van het model, plus de placeholder-reparatie. Het onderschrift is regel 3 van `[friendlyname]`.
- **Wisselen**
  - `busLak3d(pakket, naam)` geeft de ruststand plus de vervangen texturen als id's.
  - Het venster vervangt alleen die texturen en zet de zichtbaarheid opnieuw.
  - De schaduwkaart wordt opnieuw getekend als de zichtbaarheid verandert.
  - De texturen van de vorige kleurstellingen blijven in een LRU in de renderer-werker (≤ 64 MB boven het budget). Terugwisselen is dan alleen opnieuw binden.
- **Tonen** (in het zijpaneel van het 3D-venster)
  - Een lijst plus een rij stalen; boven 12 een zoekveld.
  - Een staal toont eerst alleen de naam en krijgt zijn kleur zodra die klaar is.
  - Met de muis erover wisselt de viewer na 150 ms rust. Een klik zet hem in beeld; kiezen is een aparte handeling (§8.1).
- **Aanhanger zonder die kleurstelling:** eigen texturen en eigen setvars, net als `aanhangerVan` in index.ts.

---

## 8. De UI

### 8.1 Buskeuze (vrij rijden én loopbaan): tegels plus een eigen 3D-venster

**Lucs keuze (28-09): "Tegels + apart venster".** Het tegelrooster met plaatjes blijft. De 3D-weergave krijgt een eigen venster. De showroom van het vorige ontwerp (niveau 3 en 4 samen in `Showroom.tsx`) vervalt.

**Wat blijft zoals het is:** merk → type → uitvoering (tegels) → kleurstelling (tegels, App.tsx ≈:4058-4130) → remise (`busScherm` `'hof'`, ≈:4132). De schermen blijven `"bus" | "kleur" | "hof" | "overzetten"` (App.tsx:307-309). START in de voet (ONS/src/renderer/src/Setup.tsx:200-201, ≈:1097) doet wat het nu doet.

#### Wat de tegel toont

- **Merk en type:** zoals nu (monogram, icoon of foto v4). Geen 3D-knop: een type is nog niet één bus.
- **Uitvoering (niveau 3) en kleurstelling (niveau 4, ook "Standaard"):**
  - de foto v4 als `beeld` (tot de omschakeling na F3 de foto v3), anders het busicoon;
  - titel, onderschrift en `gekozen` zoals nu;
  - rechtsboven een **3D-knop**: een `Tegelactie` met een nieuw `teken: '3d'` (Setup.tsx:145-152). Er staat "3D" in, met `bv.open3d` ("Bekijk in 3D") als titel en `aria-label`.
- **De 3D-knop is altijd zichtbaar**, gedempt (60%) en vol bij zweven of focus. De andere tegelacties verschijnen pas bij zweven (setup.css:2059-2082), maar deze knop is de enige weg naar 3D en moet te vinden zijn.
- De tegel waarvan de bus nu in het 3D-venster staat, heeft een gevulde 3D-knop (`aria-pressed`).
- Ook een tegel zonder foto (icoon) heeft de knop. Het venster legt dan uit waarom er geen 3D is (§9). Zo hoeft de tegel niet vooraf te weten of een model te lezen is.
- **Geen 3D-knop** op de tegels van "busjes klaarzetten" (`'overzetten'`) en van de remise.

#### Hoe het venster opent

- **Klik op de 3D-knop.** Het venster opent met die bus: op niveau 4 met die kleurstelling, op niveau 3 met de kleurstelling die nu voor die bus gekozen is (`busKleur` als het pad klopt, anders "Standaard"). De klik kiest de tegel niet: `stopPropagation`, zoals de bestaande tegelacties (Setup.tsx ≈:866-877).
- **Dubbelklik op de tegel.** De eerste klik doet meteen wat hij nu doet (kiezen, naar het volgende niveau). De dubbelklik opent daarbovenop het venster voor de tegel van die eerste klik.
  - Zo wacht een gewone klik nooit op een mogelijke tweede klik.
  - Uitvoering: de tegel negeert een `click` met `event.detail ≥ 2`. Een `dblclick` op het rooster opent het venster voor de tegel die ≤ 500 ms eerder is aangeklikt (in een ref). Na de eerste klik staan er andere tegels op die plek; daarom telt de onthouden tegel en niet de tegel onder de muis.
- **Toetsenbord:** de 3D-knop is met Tab te bereiken en werkt met Enter en spatie, zoals de bestaande tegelacties.
- **In main** (`src/main/bus3dvenster.ts`, IPC `bus3d:open`):
  - Is er geen 3D-venster, dan maakt main er een (`show: false`), laadt `bus3d.html` en toont het bij `ready-to-show`.
  - Is er al een, dan krijgt dat de nieuwe vraag (`bus3d:vraag`); main haalt het terug uit geminimaliseerd en geeft het focus.
  - Elke vraag krijgt een volgnummer (`aanvraag`). Een keuze met een ouder volgnummer telt niet.

#### Welk venster

- Een `BrowserWindow` met een eigen pagina `bus3d.html` (nieuwe ingang in `electron.vite.config.ts`) en een eigen preload `preload/bus3d.ts`.
  - Die preload geeft alleen: de vraag, `busModel3d`, `busLak3d`, `busKleurstellingen`, `busKleurstalen`, `busFotoAlsKlaar`, `busHeldenbeeld`, `bus3dMeld`, de voortgangs- en vervangberichten, `kies` en `sluit`.
  - Geen profielen, geen paden, geen instellingen, net als de brug van het fotovenster (ONS/src/preload/busfoto.ts:3-9).
- `parent: mainWindow`, niet modaal.
  - Het blijft boven het hoofdvenster en raakt er niet achter kwijt. Het minimaliseert mee, en hoort in de taakbalk bij de app in plaats van een los venster te zijn. Hoe Windows dat precies toont, meet de vensterspike in F0.
  - De tegels blijven intussen te gebruiken.
- Maat standaard 1200×760, minimaal 720×480. Plek en maat worden onthouden in de instellingen (`bus3dVenster`: x, y, breedte, hoogte, gemaximaliseerd) en bij het openen getoetst aan de schermen die er nu zijn; anders gecentreerd boven het hoofdvenster.
- Gewone Windows-rand, `autoHideMenuBar`, `backgroundColor` in de themakleur (geen witte flits).
- Venstertitel `bv.windowTitle`: "{naam} · 3D". Bij de dealer "Dealer · {naam}", in het wagenpark "Bus {nr} · {naam}" (G7).
- Taal en thema komen bij het openen van main mee en daarna bij elke wissel (`bus3d:instellingen`). Het zijpaneel volgt het thema; het beeld (Buiten) niet (§5.6).
- **Eigen renderer-proces.** Het hoofdvenster houdt nooit een WebGL-context of 3D-geheugen vast. Gaat het 3D-venster onderuit (`render-process-gone`), dan logt main dat, meldt het hoofdvenster één keer `bv.windowFailed`, en werken de tegels gewoon door. De volgende klik opent een nieuw venster.

#### Wat erin staat

```
+-- MAN Lion's City 12C E6 · 3D ------------------------ _ [] x --+
|                                             | MAN               |
|                                             | Lion's City 12C   |
|           viewer (Buiten, §5.6)             | E6                |
|                                             | Kleurstelling     |
|                                             | [zoek ...]        |
|                                             | o Standaard       |
|                                             | # BVG   v gekozen |
| 3D-model laden... 812 van 1809              | # HVV             |
|          [Voor][Zijkant][Achter][Schuin]    | Beschrijving ...  |
|          [Terug][+][-]                      | 12,2 x 2,55 m ... |
|                                             | [Kiezen][Sluiten] |
+---------------------------------------------+-------------------+
```

- **De viewer** vult de ruimte links (smal venster, < 900 px: bovenaan in 16:10).
  - Rechtsonder de knoppen Voor, Zijkant, Achter, Schuin, Terug, + en − (§6).
  - Linksonder de voortgang ("3D-model laden… 812 van 1809 onderdelen") en de labels `bv.partial` of `bv.incomplete`.
  - Zolang OMSI draait, klein de regel `bv.omsiRunning` (§9).
- **Het zijpaneel** (320 px; smal venster: onder de viewer):
  1. regel 1 van `[friendlyname]` klein, daaronder type en uitvoering;
  2. het blok Kleurstelling (§7): "Standaard" bovenaan, dan de lijst met stalen, boven 12 een zoekveld. De kleurstelling die nu in de buskeuze staat, heeft een vinkje met `bv.chosen` ("gekozen"). De kleurstelling in beeld is gemarkeerd;
  3. een beschrijving van hooguit 600 tekens met "meer";
  4. feiten: afmetingen uit `[boundingbox]`, geleed ja/nee, aantal kleurstellingen;
  5. onderaan [Kiezen] (hoofdknop) en [Sluiten].
- **Niet in het venster:** remise, rit, tijd en weer, START. Die horen bij de stappen van het hoofdvenster. In F5 komt er alleen een regel ter lezing bij met het licht van de rit.
- **Een andere uitvoering** van hetzelfde type kies je in de tegels; dat stuurt een nieuwe vraag naar hetzelfde venster. Het venster heeft geen eigen lijst met uitvoeringen.

#### Hoe de keuze terugkomt

- **Bekijken is niet kiezen.** In de lijst zet een klik een kleurstelling in beeld; met de muis erover wisselt de viewer na 150 ms rust, en terug bij weggaan (§7).
- **Kiezen:** [Kiezen], Enter in de lijst of in het beeld, of een dubbelklik op een rij in de lijst. Gekozen wordt de kleurstelling die in beeld is.
- Het venster stuurt `bus3d:kies { aanvraag, relatiefPad, kleurstelling }`. Main controleert:
  - komt het van het 3D-venster zelf (`event.sender`);
  - is het volgnummer het nieuwste;
  - staat de bus in de registry en de kleurstelling in zijn lijst.

  Dan stuurt main `bus3d:keuze` naar het hoofdvenster, sluit het 3D-venster en geeft het hoofdvenster focus.
- **Het hoofdvenster doet precies wat een klik op de tegel van die kleurstelling doet** (App.tsx ≈:4104-4128): `setVehicleOverride(pad)`, `setKleurBus(pad)`, `setBusKleur({ pad, naam })` (bij "Standaard" `undefined`), en naar `'hof'`. Heeft de bus geen kleurstellingen, dan zoals de uitvoeringstegel (≈:4429-4445). De tegel is daarna `gekozen`, de kruimel toont de naam, en START werkt zoals altijd.
- Een keuze met een oud volgnummer, of terwijl het hoofdvenster de busstap al verlaten heeft, telt niet.

#### Eén venster tegelijk

- Er is altijd hooguit één 3D-venster. Een volgende 3D-klik (andere tegel, dealer, wagenpark) wisselt de bus in hetzelfde venster. De texturen van de vorige bus blijven in de LRU van de renderer-werker (§7), dus heen en terug is snel.
- Waarom één:
  - één WebGL-context en één GPU-budget (≤ 300 MB, §10) naast OMSI;
  - één plek waar een keuze vandaan komt, dus geen twijfel welke keuze telt;
  - geen tweede renderer-proces en renderer-werker.
- Twee bussen naast elkaar vergelijken kan dus niet (§16, bewust niet).

#### Sluiten

- Met ×, Esc, Ctrl+W of [Sluiten]: dicht zonder keuze. Staat er tekst in het zoekveld, dan maakt de eerste Esc dat leeg.
- Na [Kiezen] vanzelf.
- Vanzelf als het doel ophoudt: het hoofdvenster verlaat de busstap (START, een andere stap in de balk, een ander profiel), het dealerscherm of wagenpark gaat dicht, of het hoofdvenster sluit (het 3D-venster is een kind en gaat mee). Het hoofdvenster stuurt daarvoor `bus3d:sluit` met zijn laatste volgnummer.
- **Sluiten is `destroy()`.** Het renderer-proces stopt, en daarmee zijn context en GPU-geheugen (§10). Er is geen verborgen hergebruik, tenzij de proef in F0 laat zien dat openen langer duurt dan 400 ms. Dan wordt het venster bij het betreden van de busstap alvast verborgen geladen, nog zonder WebGL-context, en na sluiten weer verborgen tot de busstap verlaten wordt.

#### Toetsen in het venster

| Toets | Wat |
|---|---|
| Esc | Sluiten zonder keuze; eerst het zoekveld leegmaken als daar iets staat |
| Enter | Kiezen (in de lijst of in het beeld); in het zoekveld: de eerste treffer in beeld zetten |
| ↑ / ↓ in de lijst | Vorige of volgende kleurstelling, in beeld na 150 ms rust |
| ← / → in het beeld | Draaien 15° |
| ↑ / ↓ in het beeld | Kantelen 5° |
| + / − | Zoomen |
| 1 · 2 · 3 · 4 | Voor · Zijkant · Achter · Schuin |
| 0 of Home, of dubbelklik in het beeld | Terug naar de beginstand |
| Ctrl+F of / | Naar het zoekveld (als dat er is) |
| F11 | Volledig scherm aan of uit |
| Ctrl+W | Sluiten zonder keuze |

- Tabvolgorde: beeld → knoppen van het beeld → zoekveld → lijst → [Kiezen] → [Sluiten]. Het beeld begint met focus, zodat de pijltjes meteen werken.
- Het wiel: boven het beeld altijd zoomen, boven het zijpaneel scrollen (§6).

#### Verder

- **Loopbaan:** dezelfde tegels en hetzelfde venster; de aanbevolen bus staat zoals nu vooraan.
- **OMSI draait:** de bestaande waarschuwing in het hoofdvenster blijft (`free.runningHint` / `app.omsiDraaitAl`, App.tsx ≈:4795). Het 3D-venster gaat in de lichte stand (§9).
- **Nieuwe teksten** (`bv.*`, nl/en/de/fr):
  - `bv.open3d` "Bekijk in 3D"; `bv.windowTitle` "{naam} · 3D";
  - `bv.pick` "Kiezen"; `bv.pickDealer` "Deze kleurstelling"; `bv.chosen` "gekozen"; `bv.close` "Sluiten";
  - `bv.omsiRunning` "OMSI draait: 3D in de lichte stand";
  - `bv.windowFailed` "Het 3D-venster ging onverwacht dicht. Klik opnieuw op 3D om het weer te openen.";
  - daarnaast de sleutels uit G7, als `bv.*` (§11.3).

### 8.2 Dealer en wagenpark: hetzelfde venster

Lucs keuze 2 geldt ook hier: de dealer van het busbedrijf gebruikt hetzelfde venster. Er komt dus nergens een `<BusViewer>` in het hoofdvenster.

- **Dealer, showroom** (F6 in G/wagenpark.md:671-673; daar stond links `<BusViewer … kleurkeuze draaiplateau onKleurstelling>`):
  - Links komt de foto v4 van de gekozen uitvoering en kleurstelling, groot in 16:10 (`busFotoAlsKlaar`), met rechtsonder de knop [Bekijk in 3D]. Een dubbelklik op de foto doet hetzelfde.
  - Het venster opent in de dealerstand (`doel: 'dealer'`): titel "Dealer · {naam}", draaiplateau aan (§6), de kleurstellingen in het zijpaneel, onderaan [Deze kleurstelling] en [Sluiten].
  - [Deze kleurstelling] stuurt de keuze terug naar het dealerscherm (`onKleurstelling`) en sluit het venster.
  - Kopen, financieren en leasen blijven in het dealerscherm, met hun eigen bevestiging. Het venster komt nooit aan geld.
  - Het dealerscherm houdt een eigen keuze zonder 3D: "Kleurstelling [naam ▾]", een lijst met namen en stalen. Die werkt ook zonder WebGL2, of als je geen 3D wilt.
  - "Uitvoering [▾]" blijft in het dealerscherm. Een andere uitvoering terwijl het venster open is, stuurt een nieuwe vraag naar hetzelfde venster.
- **Wagenpark** (G/wagenpark.md:740-752): [3D] bij een bus opent hetzelfde venster in de wagenparkstand (`doel: 'wagenpark'`).
  - Titel "Bus 107 · MAN SD200" (G7), in de kleurstelling van die bus.
  - Vlootnummer en kenteken op de bus vanaf F3, via `[texttexture]` en onze OMSI-lettertypen (`leesOmsiFonts`, ONS/src/core/oft.ts:317).
  - Onderaan [Deze kleurstelling] en [Sluiten]. Een andere kleurstelling kiezen maakt in het wagenpark [Overspuiten € …] actief, met de vraag die daar al ontworpen is. Overspuiten gebeurt dus in het hoofdvenster.
  - Het onderdeel `Bus3dVenster` in `BedrijfWagenpark.tsx` (G/wagenpark.md:570) vervalt; het wagenpark roept `bus3dOpen` aan.
- **Planning en dealer tegelijk** (G8.12): er is één venster; de nieuwste vraag wint.
- **Voor de planning in de cloudtak** (vervangt G10 en de stub uit G/wagenpark.md:203): `window.career.bus3dOpen({ relatiefPad, kleurstelling, doel, titel })` en `opBus3dKeuze(...)`. De goedkope tegel is `busFotoAlsKlaar`; die rendert nooit.
- **Wat van G blijft:** G6 (terugvalteksten, als `bv.*`), G7 (de schermen, met de twee aanpassingen hierboven), G8 (randgevallen), en de eisen uit G9 met de tijden uit §10.
- **Wat vervalt:** G1, G2, G3 (keten met transfer via IPC), de textuur- en zichtregels uit G4 en G5, en G10 (`<BusViewer>` overal in het hoofdvenster).

### 8.3 Telefoon en tablet

- **Geen live 3D.** Redenen: OMSI heeft de GPU nodig, een pakket is groot, mobiele GPU's hebben geen S3TC, en de accu.
- **Wel de foto v4** van de huidige bus en van de vloot, via de apparaatserver op id (`/n/<sleutel>/bus/<id>.webp`, zelfde regels als ONS/src/main/apparaat.ts:26-41). In de overlay-telefoon de foto van de huidige bus.
- **Later:** een draaibeeld van 24 beelden als WebP-strook (F5).

---

## 9. Terugval, busfoto v4 en heldenbeeld

**Busfoto v4**
- Map `userData/busfotos/v4/`.
- 640×400 WebP, doorzichtig, camera 215°/8°, strak ingepast op 88% van de breedte.
- Het `nativeImage`-pad vervalt.
- `busFoto(relatiefPad, kleurstelling)` houdt dezelfde vorm (ONS/src/shared/api.ts:666).
- Dit is het plaatje op de tegels (§8.1) en op de dealerkaarten (§8.2).
- Versleutelde bussen met sleutel 0 of een geregistreerde sleutel krijgen nu ook een foto: op Lucs pc 25 bussen die nu een icoon hebben (§5.1). Een foto is een plaatje en geen meetkunde, dus hij mag op schijf.

**Nu al, los van de rest:** de BMP-fix in v3. Kies het formaat op inhoud en gebruik `pakBmpUit` in ONS/src/main/busfoto.ts:361-373 en in `busbeeld.ts:351-357`. Dat repareert 545 kleurstellingen.

**Heldenbeeld**
- Zodra de viewer in het 3D-venster een bus helemaal scherp toont, maakt de werker één WebP (`convertToBlob`) en stuurt die naar `busHeldenbeeld`.
- Sleutel: pakket, kleurstelling, verhoudingsklasse (breed vanaf 1,45, anders smal), DPR-klasse en omgeving (`buiten-vast`, later tijd/weer). Het thema hoort er niet bij, want Buiten hangt niet van het thema af.
- `busFotoAlsKlaar` levert het heldenbeeld of anders de foto v4, **zonder te wachten**. Zo staat er binnen 50 ms na het laden van de pagina iets in het 3D-venster; bij een andere verhouding als letterbox.
- **Zolang OMSI draait** wordt er geen heldenbeeld weggeschreven.

**Terugval in het 3D-venster**

Het venster opent altijd, ook als er geen 3D kan komen. Het zijpaneel met de kleurstellingen werkt dan gewoon, en [Kiezen] ook: in plaats van 3D staat er het heldenbeeld, de foto of het icoon.

| Situatie | Wat je ziet | Tekst |
|---|---|---|
| Geen WebGL2, of de context faalt | Heldenbeeld of foto v4, anders het icoon | `bv.noWebgl` (één keer per sessie) |
| Context verloren | Eén keer vanzelf herstellen; de tweede keer foto plus [Opnieuw] | `bv.lost` |
| **Versleuteld met een sleutel die hier niet geregistreerd is**, meer dan 10% van de o3d-lezingen (§5.1) | Icoon | `bv.encrypted`: "Dit model is versleuteld met een sleutel die in jouw OMSI niet geregistreerd is (sleutel {sleutel}). OMSI laadt die onderdelen dan ook niet, en daarom tonen wij ze niet." |
| Deels zo'n onbekende sleutel (≤ 10%) | 3D zonder die onderdelen, met label | `bv.partial` ("{n} onderdelen versleuteld, niet getoond") |
| Sleutel 0 of een geregistreerde sleutel | Gewoon 3D, geen label | — |
| Een sleutel verdwijnt uit de registratie (add-on verwijderd) | Pakketten, heldenbeelden en foto's met die sleutel worden vergeten; daarna het icoon | `bv.encrypted` |
| Geen model | Icoon | `bv.noModel` |
| Te zwaar (> 3 M driehoeken, of het budget haalt het bij 256 niet) | Foto | `bv.tooHeavy` |
| Fout of tijdslimiet | Foto plus [Opnieuw] | `bv.failed` |
| Het 3D-venster is verborgen of geminimaliseerd (ook als het met het hoofdvenster mee minimaliseert), of OMSI draait en geen van onze vensters heeft 60 s focus | `loseContext`, foto plus [Hervatten] | `bv.paused` |
| OMSI draait en een van onze vensters heeft focus | 3D in lichte stand: DPR 1, budget 96 MB, geen draaiplateau, geen heldenbeeld | `bv.omsiRunning`, klein |
| Meer dan 25% ontbrekend | 3D met label | `bv.incomplete` |
| Script faalde (`bron: 'regels'`) | 3D, zonder melding; wel gelogd | — |

**Terugval rond het venster**

| Situatie | Wat er gebeurt | Tekst |
|---|---|---|
| Het 3D-venster gaat onverwacht dicht (`render-process-gone`) | Main logt het; het hoofdvenster meldt het één keer; de tegels werken door; de volgende 3D-klik opent een nieuw venster | `bv.windowFailed` |
| Het venster wordt gesloten terwijl het laadt | Het antwoord van de werker wordt genegeerd; het pakket blijft 120 s in de werker (G8.2) | — |
| Een keuze komt binnen met een oud volgnummer, of het hoofdvenster is de busstap al uit | Genegeerd; niets verandert in de buskeuze | — |
| Tegel zonder foto | Het busicoon, met de 3D-knop; het venster legt uit waarom er geen 3D is | — |

---

## 10. Snelheid en geheugen: de doelen

**Voorwaarden van de meting:** op de pc van Luc (RTX 4070 SUPER), 3D-venster 1280×720, DPR 1,5, p50 over 5 runs.
- **Warm** = het pakket staat in de cache.
- **Nieuw** = geen pakket, maar de bronbestanden staan in de OS-cache.
- Ter vergelijking, de foto v3 nu: NLC 9975 ms koud en 801 ms warm aan lezen; 2344 ms in totaal (K/ons/harnas/run1.log:25, 28).

| Moment | SD77 | O530 | O560 | NLC 12C | C2 GN + aanh. |
|---|---|---|---|---|---|
| Heldenbeeld of foto in het 3D-venster, na het laden van de pagina | ≤ 50 ms | ≤ 50 | ≤ 50 | ≤ 50 | ≤ 50 |
| Eerste 3D-beeld, warm | ≤ 150 ms | ≤ 250 | ≤ 300 | ≤ 500 | ≤ 400 |
| Alles scherp, warm | ≤ 400 ms | ≤ 600 | ≤ 700 | ≤ 1000 | ≤ 1000 |
| **Eerste 3D-beeld, nieuw** | ≤ 400 ms | ≤ 800 | ≤ 1000 | ≤ 1500 | ≤ 1200 |
| Alles scherp, nieuw | ≤ 600 ms | ≤ 1200 | ≤ 1500 | ≤ 2500 | ≤ 2000 |
| Koude schijf (na herstart) | geen harde grens; voortgang minstens elke 500 ms; foto staat | | | | |
| Kleurstelling wisselen (eerder / eerste keer) | ≤ 150 / ≤ 500 ms | idem | idem | idem | ≤ 150 / ≤ 800 |
| Ruststand in de werker, p95 | ≤ 150 ms voor alle bussen | | | | |
| Beeldtijd p95 bij draaien | ≤ 4 ms | ≤ 6 | ≤ 8 | ≤ 12 | ≤ 8 |
| Lange taken > 50 ms op de hoofddraad tijdens laden | 0 | 0 | 0 | 0 | 0 |

De tijden voor "nieuw" zijn haalbaar omdat texturen niet meer op de werker wachten: ze worden parallel aan het lezen van de o3d's opgehaald (§4.1 `lijst`). De bouwstenen zijn gemeten in bijlage B.

**Versleutelde bussen** (sleutel 0 of geregistreerd, §5.1): dezelfde doelen als de NLC-kolom, met het ontwarren erin. Het ontwarren zelf: ≤ 40 ms per bus in de renderer-werker, in stukken van ≤ 16 ms. Gemeten in node: 1.146.007 hoekpunten (alle o3d's van MAN_NL_NG_263) in 33 ms (D/sleutels/ontwar.out.txt). Proefbussen: HH20 EBus 2021 en MAN NL263.

**Het venster** (§8.1)

| Moment | Doel |
|---|---|
| Klik op de 3D-knop → 3D-venster zichtbaar met heldenbeeld, foto of icoon | ≤ 400 ms als het venster nieuw is; ≤ 100 ms als het al open is. Haalt het nieuwe venster de 400 ms niet, dan wordt het vooraf verborgen geladen (§8.1, Sluiten) |
| Een gewone klik op een tegel | Niet trager dan nu: geen wachttijd voor een mogelijke dubbelklik |
| [Kiezen] → tegel `gekozen` in het hoofdvenster, 3D-venster dicht | ≤ 150 ms |
| 3D-venster dicht → renderer-proces weg, GPU-geheugen terug | ≤ 2 s |

**Geheugen**
- **GPU van het 3D-venster:** ≤ 300 MB. Dat is:
  - geometrie ≤ 50 MB (NLC 25 MB);
  - texturen ≤ 160 MB;
  - schaduwkaart 16 MB;
  - MSAA-kleur en -diepte bij 1920×1080×4 ongeveer 66 MB;
  - klein spul.

  Het concept noemde 256 MB en vergat de MSAA-buffers.

  Het 3D-venster kan groot worden (maximaliseren, F11). Daarom begrenzen we het doek op 1920×1080 tekenpixels (2,1 Mpx, na de DPR-regel van §5.8); een groter venster schaalt het beeld op. Zo blijven de MSAA-buffers onder 66 MB, ook op een 4K-scherm.
- **3D-venster:** de JS-heap na het laden hooguit 20 MB boven die van een leeg 3D-venster; bitmaps en buffers gaan weg na het uploaden.
- **Hoofdvenster:** geen 3D-geheugen en geen WebGL-context; alleen de foto's op de tegels.
- **Main:** alleen de registry, ≤ 5 MB.
- **Werker `bus3d`:** ≤ 256 MB; sluit na 120 s.
- **Tien keer het 3D-venster met de NLC openen en sluiten:** main en GPU-proces binnen 50 MB van het begin.
- **Schijf:** LRU van 1 GB, alleen geometrie.

---

## 11. API en typen

### 11.1 `src/shared/bus3d.ts` (typen plus pure functies)

```ts
export type V3 = [number, number, number]
export type Bus3dReden = 'geen-model' | 'versleuteld' | 'te-zwaar' | 'fout' | 'tijd' | 'vervangen' | 'verouderd'

export interface Bus3dTextuur {
  id: string                                   // voor omsi3d://t/<id>
  soort: 'dxt' | 'dxt-zonder-mips' | 'beeld' | 'eigen'   // route uit §5.7
  formaat?: 'bc1' | 'bc2' | 'bc3'; srgb: boolean
  b: number; h: number; mips: number
  niveaus?: Array<{ off: number; len: number }>  // DXT: plek per niveau in het bronbestand
  oppervlak: number; uv: number                // m² buiten en UV-oppervlak, voor de doelmaat
  ctc?: string                                 // naam van de [CTCTexture]-plek
  envmap?: boolean                             // alleen als envmap gebruikt: niet laden
}

export interface Bus3dManifest {
  versie: 1
  pakket: string
  bus: string
  naam: [string, string, string]
  beschrijving?: string
  doos: { min: V3; max: V3 }
  delen: Array<{ bus: string; verschuiving: V3 }>
  bestuurder?: { plek: V3; richting: V3 }
  texturen: Bus3dTextuur[]
  sleutels: number[]                           // gebruikte o3d-sleutels (0 of geregistreerd); main toetst ze vóór het tonen (§5.1)
  telling: {
    driehoeken: number; stukken: number; texturen: number
    versleuteld: number                        // weggelaten o3d's: sleutel niet geregistreerd
    ontward: number                            // o3d's met sleutel 0 of een geregistreerde sleutel
    ontbrekend: number
  }
  bytes: { geometrie: number }
  ms: { lezen: number; schrijven: number }
}

export interface Bus3dLak {                     // naam uit G; was "Bus3dStand"
  kleurstelling?: string
  vars: Array<[string, number]>                 // precies kleurVars(): CTC-index + setvars
  bron: 'script' | 'regels' | 'omsi'
  zichtbaar: string
  items: Record<number, number>
  alphascale: Record<string, number>
  animaties?: Float32Array
  texturen: Array<{ plek: number; textuur: Bus3dTextuur }>
  onbekend: string[]
  ms: number
}

export interface Bus3dVoortgang { vraag: number; stap: 'lezen' | 'lijst' | 'schrijven' | 'script'; klaar: number; totaal: number; lijst?: Bus3dTextuur[] }
export type Bus3dAntwoord =
  | { manifest: Bus3dManifest; lak: Bus3dLak }
  | { reden: Bus3dReden; detail?: string }
export interface Bus3dMeting {
  pakket: string; bron: 'cache' | 'nieuw'; eersteBeeldMs: number; scherpMs: number
  p50: number; p95: number; gpuBytes: number; dpr: number; driehoeken: number; texturenMB: number
}

/** Het 3D-venster (§8.1). */
export type Bus3dDoel = 'buskeuze' | 'dealer' | 'wagenpark'
export interface Bus3dVensterVraag {
  aanvraag: number                             // volgnummer van main; een keuze met een ouder nummer telt niet
  doel: Bus3dDoel
  relatiefPad: string
  kleurstelling?: string                       // in beeld bij het openen; undefined = Standaard
  gekozen?: string | null                      // wat nu in de buskeuze of bij de dealer staat (vinkje); null = Standaard
  titel: string                                // "MAN Lion's City 12C E6"; in het wagenpark "Bus 107 · MAN SD200"
  vloot?: { nummer: string; kenteken?: string } // wagenpark, vanaf F3
}
export interface Bus3dKeuze { aanvraag: number; doel: Bus3dDoel; relatiefPad: string; kleurstelling?: string }

/** De regels van §5.2 (voorrang en alphascale), puur; ook voor de probe. */
export function rustRegels(/* vermeldingen, kleurVars, startwaarden, curves */): Pick<Bus3dLak, 'zichtbaar' | 'items' | 'alphascale'>
/** Doelmaat en budget uit §5.7, puur; ook voor de probe. */
export function textuurPlan(texturen: Bus3dTextuur[], budgetBytes: number): Array<{ id: string; overslaan: number; bytes: number }>
```

### 11.2 `src/shared/bus3dpak.ts` en `src/shared/beeldlezers.ts`

- **`.b3d`:** magic `B3D1`, een u32 met de lengte van de kop, een JSON-kop en binaire secties op 4 bytes uitgelijnd. `schrijfPakket` en `leesPakket(buf)` (views zonder kopie).
- **`beeldlezers.ts`:** BMP, TGA en niet-DXT DDS op `DataView`/`Uint8Array`, zonder `Buffer`. `core/textuur.ts` roept ze aan, zodat node en de renderer-werker dezelfde code gebruiken.
- **Hoekpuntblokken in de `.b3d`:** per `(deel, o3d)` de 32 bytes per hoekpunt zoals in de o3d, in de assen van de o3d. Een gehusseld blok heeft in de JSON-kop `hussel: { versie, vlag, sleutel }` (§5.1). `leesPakket` geeft views; het ontwarren gebeurt daarna ter plekke in de gefetchte buffer, die van de renderer-werker zelf is.
- **`src/shared/o3dhussel.ts`** (puur, geen `Buffer`):

  ```ts
  /** Zet gehusselde hoekpunten ter plekke terug (8 floats per hoekpunt). Alleen het woord uit de kop gaat erin. */
  export function ontwar(blok: Float32Array, kop: { versie: number; vlag: number; sleutel: number; n: number }): void
  /** Sleutel 0 of geregistreerd; anders laten we de o3d weg, zoals OMSI. */
  export function magOntwarren(sleutel: number, geregistreerd: ReadonlySet<number>): boolean
  ```

### 11.3 IPC, preload en protocol (namen uit G waar de betekenis gelijk is)

```ts
busModel3d(relatiefPad: string, kleurstelling?: string): Promise<Bus3dAntwoord>          // ipc bus:model3d
busLak3d(pakket: string, kleurstelling?: string): Promise<Bus3dLak | { reden: Bus3dReden }>  // bus:lak3d
busKleurstalen(relatiefPad: string): Promise<Record<string, [string, string, string]>>   // bus:kleurstalen
busFotoAlsKlaar(relatiefPad: string, kleurstelling?: string, verhouding?: 'breed' | 'smal'): Promise<string | undefined>  // bus:fotoAlsKlaar
busHeldenbeeld(pakket: string, kleurstelling: string | undefined, sleutel: string, webp: ArrayBuffer): Promise<void>
bus3dMeld(meting: Bus3dMeting): void
opBus3dVoortgang(l: (v: Bus3dVoortgang) => void): () => void    // bus3d:voortgang
opBus3dVervangen(l: (pakket: string) => void): () => void       // bus3d:vervangen
opKleurstalen(l: (bus: string, stalen: Record<string, [string, string, string]>) => void): () => void  // bus3d:stalen
// busFoto(relatiefPad, kleurstelling) blijft gelijk (api.ts:666) en levert v4

// Hoofdvenster (preload index, window.career)
bus3dOpen(vraag: Omit<Bus3dVensterVraag, 'aanvraag'>): Promise<number>   // bus3d:open; geeft het volgnummer
bus3dSluit(aanvraag: number): void                                     // bus3d:sluit, als het doel ophoudt
opBus3dKeuze(l: (k: Bus3dKeuze) => void): () => void                   // bus3d:keuze
opBus3dVenster(l: (s: { open: boolean; relatiefPad?: string; gecrasht?: boolean }) => void): () => void  // bus3d:venster (gevulde 3D-knop, bv.windowFailed)

// 3D-venster (preload bus3d, window.bus3d): alleen dit, plus busModel3d tot en met opKleurstalen hierboven en busKleurstellingen
vraag(): Promise<Bus3dVensterVraag>                                    // bus3d:vraag, bij het laden
opVraag(l: (v: Bus3dVensterVraag) => void): () => void                 // bus3d:vraag, nieuwe bus in hetzelfde venster
opInstellingen(l: (i: { taal: string; thema: string }) => void): () => void  // bus3d:instellingen
kies(k: Bus3dKeuze): void                                              // bus3d:kies; main toetst afzender en volgnummer
sluit(): void                                                          // bus3d:sluitVenster
```

- **CSP:** `bus3d.html` en `busfoto.html` krijgen `connect-src 'self' omsi3d:`, `worker-src 'self' blob:` en in `img-src` `omsi3d:`. `index.html:6-9` krijgt alleen `omsi3d:` in `img-src`, voor het heldenbeeld op de dealerfoto; het hoofdvenster haalt geen pakketten op en start geen werker.
- **Teksten:** een nieuwe bron `src/shared/tekst/busviewer.ts` met sleutels `bv.*` in nl, en, de en fr, opgenomen in `TEKSTBRONNEN`.
  - Geen aliassen.
  - `bd.v3d.*` wordt nooit gebouwd; de sleutels uit G/:1248-1290 worden `bv.*`.
  - `scripts/probe-teksten.ts` in de cloudtak bewaakt dubbele sleutels en plaatshouders.
- **Logregels**
  - `bus3d <pad>: N driehoeken, S stukken, T texturen (dxt a / rtt b / beeld c / eigen d), X MB tex, lezen a ms, bron cache|nieuw`
  - `bus3d lak <pad> <kleur>: bron script|regels|omsi, c ms, onbekend [...]`
  - `bus3d sleutels: geregistreerd [12726, 13005, ...] uit RegAddons` (bij het starten en na een wijziging), en per bus `versleuteld n (sleutel ...), ontward m`
  - `bus3d venster: open <doel> <pad>` / `keuze <pad> <kleur>` / `dicht` / `FOUT weg: <reden>`

---

## 12. Bestanden en modules

**Nieuw** (schatting van de regels)
- `src/shared/bus3d.ts` (200), `src/shared/bus3dpak.ts` (250), `src/shared/beeldlezers.ts` (350, overgezet)
- `src/core/osc.ts` (1200-1800, F3), `src/core/busrust.ts` (400)
- `src/core/bus3d.ts` (600): het pakket bouwen in de werker
- `src/shared/o3dhussel.ts` (80): ontwarren en `magOntwarren` (§5.1)
- `src/core/omsiregistratie.ts` (80): `OMSI/addons.ini` en `OMSI/RegAddons/*.ini` lezen (`ArtNr`, `SteamArtNr`), de DLC's uit `steamapps/appmanifest_252530.acf` als bevestiging, en `stat` om een wijziging te zien
- `src/main/bus3d.ts` (400): IPC, registry, protocol, LRU, plugin-afdruk, logregels
- `src/main/bus3dvenster.ts` (250): het 3D-venster: maken, hergebruiken, plek onthouden, `bus3d:open`/`vraag`/`kies`/`keuze`/`sluit`, afzender en volgnummer toetsen
- `src/preload/bus3d.ts` (60): de smalle brug van het 3D-venster
- `src/renderer/src/bus3d/`:
  - `verbinding.ts` (120)
  - `werker.ts` (250)
  - `teken.ts` (900)
  - `shaders.ts` (400)
  - `texturen.ts` (350): routes, plan, budget, LRU
  - `camera.ts` (200)
  - `omgeving.ts` (300): Buiten, omgevingskaart
- `src/renderer/bus3d.html` en `src/renderer/src/bus3d/venster.tsx` (20, ingang met StrictMode)
- `src/renderer/src/BusViewer.tsx` (350), `src/renderer/src/bus3d/Venster.tsx` (400: viewer, zijpaneel, kiezen, toetsen), `busviewer.css` (prefix `bv-`, 300)
- `src/shared/tekst/busviewer.ts`

**Gewijzigd**
- `src/core/schermcfg.ts`: noZcheck, envmap_mask, bumpmap, change/item/texttexture waar nodig; DISABLED alleen na meting.
- `src/core/textuur.ts`: `ddsPlakken()`; gebruikt `beeldlezers.ts`.
- `src/core/o3d.ts`: een optie om van een gehusseld bestand het rauwe hoekpuntblok plus de kop te geven. Zonder die optie blijft de klacht `'versleuteld'` (:152-162, :245-249), dus `busbeeld.ts` en `schermvorm.ts` merken niets.
- `src/main/index.ts`:
  - `Werksoort` `'bus3d'`;
  - voortgang als tussenbericht;
  - `registerSchemesAsPrivileged` plus `protocol.handle('omsi3d')`;
  - `registreerBus3d`/`vergeetBus3d` en `registreerBus3dVenster`;
  - focus en minimaliseren van beide vensters doorgeven (pauzeren, §9).
- `electron.vite.config.ts`: ingang `bus3d.html` bij de renderer en `bus3d` bij de preload.
- `src/main/kaartwerker.ts`: opdrachten `bus3d:model`, `bus3d:lak`, `bus3d:stalen`.
- `src/main/busfoto.ts` (v4, en nu al de BMP-fix), `src/renderer/src/busfoto.ts` (dun omhulsel), `src/main/scherm.ts` (plugin-afdruk).
- `Setup.tsx`: `Tegelactie.teken` krijgt `'3d'` en een vlag `altijd` (altijd zichtbaar); een tegel negeert `click` met `detail ≥ 2`, en het rooster krijgt `onDubbel`.
- `setup.css`: de 3D-knop (gedempt zichtbaar, gevuld als de bus in het venster staat).
- `App.tsx`: de 3D-knop op de tegels van niveau 3 en 4, `opBus3dKeuze` doet wat de tegel doet, `bus3dSluit` bij het verlaten van de busstap. Niveau 3 en 4 blijven tegels; er komt geen `Showroom`.
- `Addons.tsx` (`vergeetBus3d`, en de registratie opnieuw lezen), `api.ts`, preload `index.ts`, `i18n.ts`, instellingen (`bus3dVenster`), `index.html`/`busfoto.html` (CSP), `HANDOVER.md` (hoofdstuk "Bus3D", met de regel over versleutelde modellen).

**Vervalt**
- De shaders en de tekenlus in `renderer/src/busfoto.ts:58-333`.
- De `nativeImage`-route in `main/busfoto.ts:361-373, 414-431`.
- Het vuilfilter `VUIL` in `busbeeld.ts:149`.
- `busbeeld.ts` blijft alleen zolang v3 bestaat.
- Er komt geen `modelcfg.ts`, geen `.b3t` en geen `verkleinGemiddeld`-mips.
- Er komt geen `Showroom.tsx` (vorige versie van dit ontwerp) en geen `Bus3dVenster` in `BedrijfWagenpark.tsx` (G/wagenpark.md:570).

**Later, buiten deze bouw:** `schermvorm.ts` legt versleutelde tekst- en klikmeshes nu met een benadering op het vlak (ONS/src/core/schermvorm.ts:1040-1172). Met `o3dhussel.ts` en dezelfde registratieregel kan dat exact.

---

## 13. Proeven

Proefset in `scripts/bus3d-proefset.json`, 13 bussen:
1. SD77
2. O560 E6
3. NLC 12C
4. NLC 18C
5. MB O530
6. Kajosoft o530
7. TH O550
8. HH Stadtbus 2017
9. MB C2 GN + aanhanger
10. Urbanway 18 + aanhanger
11. HH20 EBus2021 (sleutel 15657, geregistreerd: ontward)
12. MAN NL202 (sleutel 0: ontward)
13. GS GU240 (VA_GS_Hochflurer; sleutel 12411, niet geregistreerd: icoon)

Plus: de vijf bussen uit K/kritiek/volgorde.out.txt, de SL92 (DISABLED), en een bus met ingesprongen meshes.

| Script | Soort | Wat het meet |
|---|---|---|
| `scripts/probe-bus3d.ts` | tsx | Pakket per bus: tijden (nieuw en warm), bytes, driehoeken. Textuurroutes per soort; onleesbaar tegen echt ontbrekend. `textuurPlan`: MB per bus, en of de carrosserie op ≥ 2048 of op eigen maat staat. `[matl]`-koppeling (T-G1: `SD77_Klappfenster_OL1.o3d` groep 5 alfa 2; `SD77_wagenkasten.o3d` groep 2 dicht, groep 4 noZwrite; G/:1310-1313). Alphascale-regels, met de Kajosoft-ramen zichtbaar. Met `--alles`: 395 bussen, 0 crashes. Met `--nulmeting`: v3 als referentie. **Versleuteld (§5.1):** de registratie is {12726, 13005, 13730, 13887, 15657}, alle vijf bevestigd door het Steam-manifest; een ingespoten ini zonder DLC in het manifest telt niet; T-V1 de tweeling `21_aussen_weich3.o3d` tegen `_#low`: alle 582 hoekpunten gelijk (al gemeten, D/sleutels/ontwar.out.txt); T-V2 elke solobus met gehusselde o3d's ligt na het ontwarren binnen zijn `[boundingbox]` + 0,5 m (≤ 1% erbuiten, of niet meer dan zijn open hoekpunten; nu gemeten 0,00%, alleen de MAN NUE263 heeft een doos die niet past, D/sleutels/allebussen.out.txt), en een gelede bus binnen de doos van de hele trein; T-V3 25 van de 26 bussen boven 10% geven een pakket, GS GU240 geeft `'versleuteld'` met sleutel 12411; T-V4 met een lege registratie (ingespoten) geven de 21 bussen met een geregistreerde sleutel `'versleuteld'` en de 4 MAN NL/NG niet; T-V5 cache: voor elke gehusselde o3d is het blok in de `.b3d` byte voor byte gelijk aan het bronbestand (sha1), en er staat nergens anders een hoekpuntbestand in `userData/bus3d/` |
| `scripts/probe-meshlijst.ts` | tsx | Onze meshlijst tegen `meshes.json` van de plugin (SL92, ingesprongen meshes, HH20 608) |
| `scripts/probe-osc.ts` | tsx | Ruststand per bus: bron, ms, onbekend. Vaste uitkomsten: NLC één stoeltype; O560 geen groene achterruit; HH20 `trans_dauer = 1`; de 5 volgordebussen met de stickers van hun kleurstelling. Tegen plugin-afdrukken: overeenstemming per mesh |
| `scripts/probe-bus3d-beeld.cjs` | Electron, `--user-data-dir` | Afdrukken per bus en stand. Tijden uit §10 (koud, nieuw en warm). Beeldtijd p50/p95, GPU-bytes, lange taken. Wisseltijden. 10× NLC open en dicht. Tien grote bussen achter elkaar (LRU, schrijfwerk). Twee keer mounten (StrictMode) in het 3D-venster, en buskeuze → dealer → wagenpark in hetzelfde venster met één context. Geforceerde terugval (`__bvForceer`), `--use-angle=swiftshader` (geen S3TC). Nep-OMSI-proces (HANDOVER.md:938): lichte stand, pauze als geen van beide vensters 60 s focus heeft. Wiel boven het beeld zoomt, boven het zijpaneel scrolt het. Teksten in 4 talen |
| `scripts/probe-bus3d-venster.cjs` | Electron, `--user-data-dir` | De buskeuze met het venster (§8.1): de 3D-knop staat op niveau 3 en 4 en niet op merk, type, remise en "busjes klaarzetten". Een klik opent één venster (hoofdvenster plus één); een tweede 3D-klik wisselt de bus in hetzelfde venster (zelfde `webContents.id`). Dubbelklik op een tegel: het hoofdvenster gaat precies één niveau verder, en het venster toont de bus van de eerste klik. [Kiezen] zet `vehicleOverride` en `busKleur` zoals de tegel, gaat naar `'hof'` en sluit het venster. Esc en × sluiten zonder keuze. Een keuze met een oud volgnummer, of van een ander `webContents`, telt niet. START en Terug sluiten het venster. Hoofdvenster minimaliseren geeft `bv.paused`. Een gecrasht 3D-venster (`forcefullyCrashRenderer`) geeft `bv.windowFailed`, en de tegels werken door. Plek en maat worden onthouden; een plek op een scherm dat er niet meer is, valt terug op het midden. Alle toetsen uit §8.1. De tijden uit §10 "Het venster". Dealer- en wagenparkstand: [Deze kleurstelling] geeft de keuze terug en raakt geen geld |
| `scripts/probe-busfoto-v4.cjs` | Electron | Alle foto's opnieuw, met een contactblad v3 naast v4: zwart-% en grijs-% op de bus, breedte |
| `scripts/probe-bus3d-exe.cjs` | Gebouwde exe, `--user-data-dir` | Werker uit `app.asar`, fetch naar `omsi3d://`, een DXT-plak stromen, 409 na een gewijzigd bestand. Het 3D-venster opent in de exe (`bus3d.html` en preload `bus3d` uit `app.asar`), en de opentijd van een nieuw venster |

**Beeldmaten**
- Zwart op de bus (O560 nu 39%).
- Blauw in het vak van een zijruit (stoelen zichtbaar).
- Een vloerpixel onder de bus tegen 3 m ernaast (schaduw aanwezig).
- De bus beslaat ≥ 65% van de breedte in zijaanzicht.
- Geen "Textfield".
- Kajosoft: het ruitvak is niet leeg.
- HH20 en NL202 (ontward): geen waaier. De bus beslaat in zijaanzicht ≥ 65% van de breedte, en er steekt niets meer dan 0,5 m buiten de doos van de hele bus.
- GS GU240: het icoon met `bv.encrypted`, geen 3D.

---

## 14. Bouwvolgorde

Na elke fase: beide targets bouwen en in `release/` zetten, zoals CLAUDE.md voorschrijft, met de `@electron/asar`-controle op iconv-lite en safer-buffer. Nieuwe onderdelen staan achter de instelling `bus3d` totdat F3 klaar is.

**Stap 0, nu en los van de rest**
- De BMP-fix in v3 (§9).
- Luc heeft beslist (28-09, keuze 3): deel G vervalt. De cloudsessie is ingelicht en vervangt deel G in wagenpark.md op de cloudtak door een verwijzing naar dit ontwerp. Daarbij gaan ook de `<BusViewer>` in de dealershowroom (F6), het `Bus3dVenster` in het wagenpark en G10 over op het 3D-venster (§8.2), en wordt G9 bijgewerkt. Dat moet klaar zijn vóór F4.
- Dit ontwerp committen als `design/ontwerpen/bus3d.md`.

**F0 Proefbank en spike**
- Proefset en `probe-bus3d.ts --nulmeting`.
- `probe-meshlijst.ts`.
- `probe-bus3d-exe.cjs` in de gebouwde exe, met een leeg 3D-venster (`bus3d.html`, preload `bus3d`): opentijd van een nieuw venster, koud en warm.
- **Vensterspike** in dev (eigen `--user-data-dir`): een kind-`BrowserWindow` met `parent` (meeminimaliseren, taakbalk, boven het hoofdvenster), plek onthouden, `destroy()` en het GPU-geheugen daarna (`app.getAppMetrics`), dubbelklik met `event.detail` op het tegelrooster.
- **Controle door Luc, één keer in OMSI** (wij starten OMSI niet): staat de GS GU240 (VA_GS_Hochflurer, sleutel 12411) in OMSI zonder carrosserie of helemaal niet? Zo ja, dan klopt "OMSI weigert wat niet in RegAddons staat". Toont OMSI hem wel compleet, dan kent OMSI nog een andere registratie; dan zoeken we die (alleen lezen) en tot die tijd blijft hij een icoon.

In dev en onder `file://` is de spike voor werker en protocol al gedaan (bijlage B). Het ontwarren is al nagemeten (D/sleutels/).

Klaar als:
- de nulmeting per bus in het log staat;
- de werkerroute in de exe vastligt;
- DISABLED beslist is;
- vaststaat of het 3D-venster vooraf verborgen geladen moet worden (nieuw venster > 400 ms, §8.1);
- Luc de GS GU240 bekeken heeft.

**F1 Model en pakket**
- Het uitgebreide `schermcfg.ts`, paden zoals OMSI, `[matl]` en alle materiaaleigenschappen.
- Textuurkoppen en `ddsPlakken`, oppervlakken, `[boundingbox]`, koppelpunten.
- `beeldlezers.ts`, pakketformaat, cache, protocol en registry.
- Versleuteld (§5.1): `omsiregistratie.ts`, `o3dhussel.ts`, de optie in `o3d.ts`, gehusselde blokken zoals in het bronbestand in het pakket, `sleutels` in het manifest en de toets in main.

Klaar als:
- T-G1 geslaagd is;
- T-V1 tot en met T-V5 geslaagd zijn (§13): de tweeling exact, 25 van de 26 bussen een pakket, GS GU240 `'versleuteld'`, lege registratie geeft niets extra, en geen ontwarde meetkunde in `userData/bus3d/`;
- over 395 bussen 0 crashes;
- 0 texturen onleesbaar (echt ontbrekend apart geteld);
- het pakket nieuw binnen de werker SD77 ≤ 0,4 s en NLC ≤ 1,2 s is;
- `textuurPlan` per bus gelogd is.

**F2 Renderer, 3D-venster en de 3D-knop op de tegels** (achter de schakelaar)
- Renderer-werker met bitmaprenderer, texturen via de routes van §5.7 met het budget, en het ontwarren in de werker.
- Drie gangen, glas, licht, schaduw met contactschaduw en `[isshadow]`.
- Buiten (vast), Neutral, heldenbeeld.
- Het 3D-venster (§8.1): `bus3d.html`, preload `bus3d`, `main/bus3dvenster.ts`, `Venster.tsx` met `BusViewer`, zijpaneel met kleurstellingen en stalen, [Kiezen], toetsen, plek onthouden, sluitregels.
- In het hoofdvenster: de 3D-knop op niveau 3 en 4, de dubbelklik, en de keuze die terugkomt als een tegelklik. Verder verandert de buskeuze niet.
- Terugval en de pauzeregels van §9.
- Ruststand met de regels van §5.2.
- Foto v4 achter de schakelaar.

Klaar als:
- zwart op de O560 < 10%;
- stoelen zichtbaar door de zijruiten van O560 en SD77;
- de Kajosoft-ramen zichtbaar zijn;
- geen "Textfield";
- de schaduwmaat ≥ 25% donkerder is;
- alle tijden uit §10 gehaald zijn;
- GPU ≤ 300 MB;
- 0 lange taken;
- geheugen na 10× het 3D-venster met de NLC openen en sluiten binnen 50 MB;
- StrictMode en het wisselen van bus in hetzelfde venster één context houden;
- `probe-bus3d-venster.cjs` slaagt: één venster, keuze komt terug zoals een tegelklik, dubbelklik navigeert één keer, sluiten geeft het GPU-geheugen terug, de tijden van §10 "Het venster";
- HH20 EBus 2021 en MAN NL202 staan zonder waaier in beeld; de GS GU240 toont het icoon met uitleg.

**F3 Ruststand via scripts:** `osc.ts`, plugin-afdruk, F3b animaties in rust, kenteken en wagennummer (`[texttexture]` zonder stroom, met `oft.ts`).

Klaar als:
- NLC één stoeltype toont;
- O560 geen groene achterruit heeft;
- de 5 volgordebussen kloppen;
- het script bij ≥ 95% van de 395 bussen zonder fout draait;
- p95 ≤ 150 ms;
- bij ≥ 3 bussen ≥ 98% van de meshes overeenkomt met de plugin-afdruk.

Daarna gaan de schakelaar en de foto's v4 standaard aan (volledige ronde met `probe-busfoto-v4`).

**F4 Dealer en wagenpark** (na F uit G), plus de foto op telefoon en tablet.
- De dealershowroom met de grote foto, [Bekijk in 3D] en de eigen kleurkeuze zonder 3D; het 3D-venster in de dealerstand (draaiplateau, [Deze kleurstelling]).
- Het wagenpark met [3D]: hetzelfde venster in de wagenparkstand, met de keuze terug naar [Overspuiten].

Klaar als:
- de eisen uit G9 met de tijden uit §10 gehaald worden;
- buskeuze, dealer en wagenpark één en hetzelfde venster gebruiken, en de nieuwste vraag wint;
- het venster in de dealer- en wagenparkstand nooit iets koopt of betaalt;
- het draaiplateau stopt bij aanraking, bij reduced-motion en als OMSI draait;
- de tablet de foto op id toont en een pad weigert.

**F5 Extra's**, elk apart af te ronden:
- Buiten met tijd en weer van de rit: afdrukken om 8, 12 en 19 uur verschillen, en de wolkensoort van het weer is zichtbaar.
- Instappen: ≤ 100 ms, zonder opnieuw te lezen.
- Bumpmap op de reflectie.
- Draaibeeld voor de telefoon.
- Studio, als Luc die wil.

---

## 15. Licentie

**openOMSI (MIT)**, "Copyright (c) 2026 usonskyyyy" (B/LICENSE:1-3)
- We kopiëren niets.
- Overgenomen als idee:
  - glas en tekenvolgorde;
  - de lichttermen;
  - de reparaties voor mods;
  - de cameraconstanten;
  - de ruststand via scripts, met de volgorde standaardwaarden → init → setvars;
  - de lijst motorstandaarden;
  - hemel en wolken uit envir.cfg;
  - de grondschijf;
  - de standaard Cumulus;
  - de zoekvolgorde van texturen;
  - de rekenregel om gehusselde hoekpunten te ontwarren (B/docs/FORMATS.md:177-194; B/crates/omsi-o3d/src/lib.rs:137-180 en 239-278). Die schrijven we zelf, in `o3dhussel.ts`. De registratietoets die openOMSI bewust weglaat (lib.rs:141-143), doen wij wel.
- Ideeën en constanten overnemen van MIT-code mag, met of zonder vermelding.
- Wie later toch code vertaalt (bijvoorbeeld details uit `crates/omsi-script`), zet de volledige MIT-tekst in `THIRD_PARTY_NOTICES.md` plus een kopregel boven het vertaalde stuk.
- Wat op analyses van Omsi.exe door openOMSI steunt (B/crates/omsi-app/src/player.rs:1413), meten we zelf na, met de plugin.

**Andere bronnen**
- **O3DView (GPL-3.0):** nooit code.
- **Blender-O3D-IO:** geen licentie, dus geen code.
- **Roadhog-wiki en webdisk:** alleen in eigen woorden.
- **Khronos Neutral:** nageschreven uit de gepubliceerde formule, met de bron in een commentaarregel.

**Wat we meeleveren:** niets van OMSI. Hemel, wolken, lettertypen en texturen worden bij de speler uit zijn eigen installatie gelezen.

---

## 16. Risico's, onzekerheden en wat bewust niet

**Risico's en onzekerheden**
- **De OSC-machine** is groot (tot ongeveer 59.000 tokens script per bus). Tegenmaatregel: de regels van F2, en de ijking met de plugin-afdruk.
- **Wanneer OMSI de `[vars]` toepast**, en of `[visible]` afrondt of exact vergelijkt: de plugin-afdruk beslist.
- **Werker uit `app.asar`** in de gebouwde exe: F0. Terugval is de blob-werker, gemeten werkend in dev.
- **DISABLED-blokken:** eerst meten (F0).
- **Andere pc's dan die van Luc:** S3TC-sRGB, GPU-geheugen. Er zijn terugvallen (§5.7) en het budget.
- **Het envmap-masker** verschilt per mod.
- **Eigen lezers in de renderer-werker** kunnen slepen tijdens het laden laten haperen. Tegenmaatregel: werken in stukken, of een tweede werker.
- **De registratielijst** (§5.1). De bronnen (`addons.ini`, `RegAddons`) en de bevestiging via Steam komen uit een parallelle lezing van Omsi.exe die ik alleen steekproefsgewijs heb bekeken; het Steam-manifest is een benadering van `BIsSubscribedApp`. Een winkelversie kunnen we niet bevestigen. Tegenmaatregel: bij twijfel niet tonen. We tonen dus hooguit te weinig, nooit meer dan OMSI. Luc controleert de GS GU240 één keer in OMSI (F0).
- **De hussel-regel** komt uit openOMSI. Bij ons nagemeten: exact op één tweeling (sleutel 15657, versie 7, vlag 2), en met de doos op alle 40 bussen met een ontwarbare sleutel, over versie 4, 5 en 7 en vlag 0, 1 en 2 (D/sleutels/allebussen.out.txt; §5.1). Een mod met een afwijkende opbouw kan er toch buiten vallen. Tegenmaatregel: de doostoets van T-V2 draait ook in de werker. Valt bij een solobus na het ontwarren meer dan 1% van de gehusselde hoekpunten buiten `[boundingbox]` + 0,5 m, en tegelijk minder dan 1% van de open hoekpunten, dan gaat die bus terug naar `'versleuteld'` en wordt het gelogd. Gelede bussen toetsen we tegen de doos van de hele trein.
- **Het aparte venster**
  - Opentijd: een nieuw `BrowserWindow` met React-pagina is niet gemeten. F0 meet het; boven 400 ms laden we het vooraf verborgen (§8.1).
  - Dubbelklik: de eerste klik navigeert al. Opgelost met de `detail`-regel en de onthouden tegel; `probe-bus3d-venster.cjs` bewaakt het.
  - Een kindvenster op een ander scherm met een andere DPR: de ResizeObserver en `devicePixelRatio` in het venster vangen dat op (G8.3).
  - Twee renderer-processen (hoofdvenster en 3D-venster) kosten samen meer werkgeheugen dan één. Het 3D-venster bestaat alleen zolang het open is.

**Bewust niet**
- Live 3D op telefoon of tablet.
- PBR, SSAO, bloom, een spiegelende vloer.
- Rijdende animaties.
- Nacht- en interieurverlichting.
- Regen- en vuillagen naar het weer.
- three.js en WebGPU.
- Een textuurcache of een BC-encoder.
- **Sleutels die hier niet geregistreerd zijn ontwarren.** Ook niet als de rekenregel het zou toelaten: OMSI weigert ze, wij ook.
- **Ontwarde meetkunde op schijf**, in welke cache of welk bestand ook.
- Een sleutellijst of instelling in de app om een sleutel toe te voegen.
- Een showroom of een 3D-viewer in het hoofdvenster.
- Meer dan één 3D-venster tegelijk, en twee bussen naast elkaar vergelijken.
- Een eigen lijst met uitvoeringen in het 3D-venster: die keuze blijft in de tegels.

---

## 17. Beslissingen van Luc (28-09), afgehandeld

| # | Vraag | Lucs keuze | Uitgewerkt als | Waar |
|---|---|---|---|---|
| 1 | Versleutelde modellen | "Ik wil dat alles getoond wordt." | We tonen wat OMSI op deze pc toont: sleutel 0 en elke sleutel die in `OMSI/RegAddons` (of `addons.ini`) geregistreerd en via Steam bevestigd is. Ontwarren in eigen code met alleen het woord uit de o3d-kop. Een onbekende sleutel: het icoon met uitleg. Gehusselde hoekpunten gaan zoals in het bronbestand de cache in en worden pas in het geheugen ontward. Op Lucs pc: 25 van de 26 bussen die nu een icoon hebben, komen in 3D en op de foto; de GS GU240 niet | §0.11, §5.1, §9, §13 (T-V1 tot en met T-V5), §14 F0/F1 |
| 2 | De buskeuze | "Tegels + apart venster" | Het tegelrooster blijft; niveau 3 en 4 krijgen een 3D-knop, en een dubbelklik werkt ook. Eén eigen `BrowserWindow` met viewer en kleurstellingen; [Kiezen] zet de keuze in de buskeuze zoals een tegelklik. De dealer en het wagenpark openen hetzelfde venster. De showroom vervalt | §0.7, §8.1, §8.2, §10, §13, §14 F2/F4 |
| 3 | Deel G in de cloudtak | Vervalt ten gunste van dit ontwerp | De cloudsessie is ingelicht en vervangt deel G door een verwijzing. De `<BusViewer>` van de dealershowroom en het `Bus3dVenster` van het wagenpark worden het 3D-venster | §0.12, §8.2, §14 stap 0 |

**Wat nog moet, zonder nieuwe keuze**
- Luc bekijkt één keer de GS GU240 in OMSI (§14 F0). Dat bevestigt de registratieregel, of laat zien dat OMSI nog een andere registratie kent.
- De opentijd van het venster meten (F0), en daarmee beslissen of het vooraf verborgen geladen wordt.

---

## Bijlage A: de kritiek, punt voor punt

| # | Kritiek | Oordeel | Wat er veranderde, en waarom |
|---|---|---|---|
| 1 | De textuurverwerking haalt de tijd-, geheugen- en cachedoelen niet | **Overgenomen, deels anders uitgewerkt** | De metingen kloppen (K/kritiek/bank.out.txt). Er is geen `.b3t`-cache meer; de GPU maakt de mips (§5.7). **Weerlegd:** "DXT zonder mips: niveau 0 zoals het is". Dat geeft aliasing, en vram2 hield die 79 NLC-texturen daardoor ongekapt en ongefilterd (K/kritiek/vram2.cjs); de 104 MB is dus te laag. Wij zetten ze op de GPU om naar RGBA op doelmaat (gemeten 14 ms voor 2048² naar 1024²); het budget vangt de extra VRAM op (D/vram3.out.txt). BMP gaat via Chromium, gemeten gelijk aan `pakBmpUit`. De rij "Eerste 3D-beeld, nieuw" staat nu in §10 |
| 2 | Het standaardbeeld is niet wat Luc aanwees | **Overgenomen, verder doorgevoerd** | Buiten (hemel uit envir.cfg, clouds.tga, grijze vloer, vaste zon) is de enige omgeving van F2 tot F4 en de standaard; nagekeken in OMSI/envir.cfg:8-11 en OMSI/Texture/. De studio gaat naar F5, als optie. Keuze 3 van het concept vervalt, want Lucs eigen woorden beslissen het. Neveneffect: het heldenbeeld hangt niet meer van het thema af (9c) |
| 3 | De volgorde setvar → `{init}` is omgekeerd | **Overgenomen** | Nagekeken: `kleurVars` en het `[vars]`-blok (ONS/src/main/index.ts; situation.ts:127-130), en openOMSI (vehicle.rs:893; showroom.rs:241-251). De invoer is nu precies `kleurVars`, ná `{init}`, met de motorstandaarden ervoor. De 5 bussen gaan in de probe. Blijft onzeker: meteen na `{init}` of na het eerste frame (plugin-afdruk) |
| 4 | Een vierde cfg-lezer | **Overgenomen** | `schermcfg.ts` wordt uitgebreid (nagekeken :5-35). DISABLED kent hij niet (nagekeken met grep), en komt er pas na een meting tegen `meshes.json` op de SL92 (model_SL92_main.cfg:1913-1946, 2504-2536) |
| 5a | Eén context over meerdere schermen kan niet met `transferControlToOffscreen` | **Overgenomen** | De werker heeft een eigen OffscreenCanvas; elke viewer een bitmaprenderer (gemeten werkend). Na Lucs keuze 2 is er nog maar één viewer, in het eigen 3D-venster; de opzet houdt het wisselen van bus en doel in dat venster op één context |
| 5b | StrictMode mount twee keer | **Overgenomen, gemeten** | Een tweede transfer geeft `InvalidStateError` (D/spike). Opgelost door 5a |
| 5c | `fetch` naar omsi3d:// vraagt `corsEnabled` en ACAO | **Weerlegd** | Gemeten in Electron 33.4.11: werkt zonder `corsEnabled` en zonder ACAO, onder `file://` én `http://localhost`, op de hoofddraad én in een module-werker (D/spike/uitslag-*.json). Wel blijft de proef vanuit `app.asar` in de exe (F0) |
| 6 | Pauzeren zolang OMSI draait raakt de busstap | **Overgenomen** | Nagekeken (ONS/HANDOVER.md:1541-1556; App.tsx `free.runningHint`). Pauze alleen als het 3D-venster verborgen of geminimaliseerd is, of als OMSI draait en geen van onze vensters 60 s focus heeft. Anders een lichte stand (§9) |
| 7 | "Top-4 op driehoeken = carrosserie" klopt niet | **Overgenomen, oplossing anders** | De meting klopt. Maar "CTC = carrosserie" klopt ook niet: de NLC heeft 26 CTC-plekken, waaronder stoelen en buizen; de O560 14 (D/vram3.out.txt). Namen als "Sitz" zijn niet betrouwbaar. Daarom een doelmaat uit texeldichtheid, de carrosserie = de CTC-plek met het grootste buitenoppervlak, DXT tot 4096, envmaps niet laden |
| 8 | Botsing met deel G | **Overgenomen** | Nagekeken: de tak is actief (1380dc3, c8b4a53), G legt dezelfde namen vast, en aliassen bestaan niet (`probe-teksten.ts` op de tak). IPC-namen van G overgenomen; teksten `bv.*` in eigen bron; `bd.v3d.*` wordt nooit gebouwd (geen code gebruikt het, nagekeken). Luc heeft beslist (28-09, keuze 3): G vervalt, de cloudsessie is ingelicht. Ook de `<BusViewer>` in de dealershowroom en het `Bus3dVenster` in het wagenpark gaan naar het 3D-venster (§8.2) |
| 9a | "Deze bus" doet dubbel met START | **Overgenomen** | Na Lucs keuze 2 blijven de tegels: kiezen is een tegel aanklikken, of [Kiezen] in het 3D-venster, en dat doet precies wat de tegelklik doet. [Kiezen] start niets; START (Setup.tsx:200-201) blijft de enige knop die rijdt. De remise blijft de stap `'hof'` |
| 9b | Tijd en weer staan op de kaartstap | **Overgenomen** | Nagekeken (App.tsx ≈:3781-3830). Ze staan niet in het 3D-venster; in F5 alleen een regel ter lezing met het licht van de rit |
| 9c | Het heldenbeeld hangt van thema en maat af | **Deels** | Het thema telt niet meer mee (Buiten is thema-onafhankelijk). Verhouding en DPR-klasse zitten wel in de sleutel |
| 10 | Alphascale-regel haalt het Kajosoft-glas weg | **Overgenomen** | Nagekeken: 47 `Szyby` in model_o530_e2_2.cfg; 44 cfg's in Citybus 530 en 10 in 628; cockpit.osc:4641; constfile:197-205. Szyby is uit de nullijst; curves bij daglicht worden uitgerekend; elke naam wordt eerst nagemeten |
| 11 | Kenteken en nummer pas in F6 | **Overgenomen** | Naar F3: dat heeft stringvariabelen uit de scripts nodig. In de buskeuze leeg als er geen nummer is; in het wagenpark ons vlootnummer |
| 12 | Luc ziet pas in F4 iets | **Overgenomen** | Het 3D-venster met de 3D-knop op de tegels zit in F2 (achter de schakelaar), met de regels. De OSC-machine komt daarna (F3) |
| 13 | Kleinere punten | **Overgenomen** | `verkleinGemiddeld` vervalt. Zoekvolgorde zoals openOMSI (nagekeken, lib.rs:244-282). `stat` bij het stromen (409). Alpha-to-coverage met verscherpte alfa. `KHR_parallel_shader_compile` (aanwezig, 38-43 ms koud) |
| 14 | Ontbrekende proeven | **Overgenomen** | Alle opgenomen in §13 |
| — | Eigen aanvulling | — | Het GPU-doel van 256 MB vergat de MSAA-buffers (ongeveer 66 MB): nu ≤ 300 MB. `Werksoort` heeft sinds vandaag ook `'bussen'`. Het scherm "klaar" heet nu `'overzetten'` |
| — | Lucs keuzes van 28-09 | — | Versleutelde modellen tonen zoals OMSI (§5.1), tegels plus een eigen 3D-venster (§8), deel G vervalt. Gevolgen voor de kritiek: 5a en 5b gelden nu voor één venster; 6 gaat over het 3D-venster; 8 is beslist; 9a en 9b zijn opgelost doordat de buskeuze tegels blijft. Zie §17 |

---

## Bijlage B: nieuwe metingen voor dit document (D/)

**Opzet**
- Electron 33.4.11 uit ONS/node_modules, alleen gelezen.
- Verborgen venster, eigen `--user-data-dir` (D/spike/ud*).
- Pagina onder `file://` en onder `http://localhost`, met een CSP zoals de app plus `connect-src omsi3d:` en `worker-src 'self' blob:`.
- Twee schema's: met `corsEnabled` en ACAO, en zonder.
- Uitkomsten in D/spike/uitslag-file.json en uitslag-http.json; de code staat in D/spike/*.js.

**Werker en protocol**
- Module-werker uit `file://` en uit `http://localhost`: start.
- Blob-werker: start.
- Fetch naar het eigen schema, met en zonder CORS-privilege, op de hoofddraad en in de werker: werkt.
- `transferControlToOffscreen` twee keer: `InvalidStateError`.
- `transferToImageBitmap` → `bitmaprenderer`: werkt.
- `convertToBlob` WebP 1280×800: 118-127 ms.

**GPU**
- RTX 4070 SUPER via ANGLE/D3D11.
- S3TC en S3TC-sRGB, aniso 16, MAX_SAMPLES 8 (context 4), `KHR_parallel_shader_compile`, bptc.
- Context 14,7 ms; grote shader koud 38-43 ms.

**PNG/JPG** (`createImageBitmap` parallel, plus upload met `generateMipmap`)

| Bus | Bestanden | Mpx | Fetch | Decode | Upload plus mips |
|---|---|---|---|---|---|
| C2 | 58 | 42 | 86-98 ms | 85-88 ms | 75-80 ms |
| Urbanway | 53 | 76 | 83-97 ms | 161-178 ms | 198-241 ms |

Met verkleinen naar ≤ 1024 duurt de decode ongeveer even lang.

**DXT**
- 12C_2d_01 (DXT1 4096×2048, 13 mips): fetch 28 ms, upload vanaf niveau 1 in 4,4-5,5 ms, sRGB.
- nlc_pipes (DXT1 2048², 1 mip): naar 1024² RGBA plus mips in 13,8-15,1 ms. Framebuffer compleet, gemiddelde 59,7.

**BMP** (86 bestanden uit de 4 bussen van K/kritiek/lijst.json)
- 84 gelijk aan `pakBmpUit` (sha1 van de pixels): 1, 4, 8 en 24 bits.
- `vmatrix_grey.bmp` heeft geen BMP-kop: `pakBmpUit` weigert, Chromium geeft 1×1.
- `i7_1.bmp` (32 bits met alfa) wijkt af. Dat komt waarschijnlijk deels door de premultiplicatie in de 2D-canvas van de meting; 32 bits blijft daarom bij de eigen lezer.
- Tijd: `pakBmpUit` 50,6 Mpx in 336 ms (node); Chromium achter elkaar 668-710 ms.

**VRAM volgens het plan, vóór het budget** (D/vram3.out.txt; indeling interieur en carrosserie nog op naam)

| Bus | VRAM | CTC-plekken | Via de GPU omgezet |
|---|---|---|---|
| SD77 | 76 MB | 3 | — |
| O560 E6 | 78 MB | 14 | 16 |
| NLC | 248 MB | 26 | 79 DXT |
| C2 | 203 MB | — | — |
| O550 | 207 MB | — | — |
| Urbanway | 405 MB | 1 (`Ext_Urbanway18_3p.png`, 4170×2600) | — |

**Versleutelde modellen** (D/sleutels/; alleen gelezen, register alleen met `reg query`)
- `sleutels.cjs`: sleutelwoorden in alle o3d-koppen onder Vehicles, Sceneryobjects, Splines en Humans, tegen de `ArtNr`'s in `OMSI/RegAddons/*.ini`. Uitslag in §5.1.
- Steam-manifest `steamapps/appmanifest_252530.acf`: 14 `dlcappid`'s, waaronder de vijf `SteamArtNr`'s uit `RegAddons`.
- Parallel, niet van mij: K/sleutels/ (registratie.ts, perbus.ts, tegenproef.ts, lezingen van Omsi.exe, BaseType.dll en fontsPr.dll). De uitkomst per bus is gelijk aan de mijne: 25 bussen boven 10% volledig te tonen, de GS GU240 niet.
- `exe.cjs`: in Omsi.exe het RTTI-record `TAddon` met `Name`, `ArtNr`, `SteamName`, `SteamArtNr` en `Active`. De tekst `RegAddons` staat in geen enkele exe of DLL van OMSI leesbaar.
- `perbus.cjs`: per bestuurbare bus het deel versleuteld, naar soort sleutel (394 bussen).
- `ontwar.cjs` en `ontwarlib.cjs`: een eigen proefversie van het ontwarren. De tweeling exact gelijk; snelheid 29 ns per hoekpunt in node.
- `doos.cjs`, `allebussen.cjs`, `combis.cjs`, `buiten.cjs`: de ontwarde meetkunde tegen `[boundingbox]` over alle 40 bussen, welke versie en vlag erin zitten, en welke onderdelen van de gelede bussen buiten de doos van de voorwagen vallen.

**Nagelezen**
- ONS/src/main/index.ts:
  - `kleurVars` en het gebruik ervan;
  - `type Werksoort`;
  - `registerSchemesAsPrivileged`.
- Verder: situation.ts:127-130, schermcfg.ts:5-35, main.tsx:24, HANDOVER.md:1541-1556, App.tsx:307-309 en ≈:4058-4132, Setup.tsx:200-225, live.ts:1003.
- OMSI/envir.cfg:8-11 (himmel 2048×512 32-bit, clouds.tga 1024² 24-bit), SL92-cfg:1913-2536, Kajosoft-cfg:2600-2612, cockpit.osc:4641, constfile:195-206.
- B/omsi-sim/vehicle.rs:830-893, showroom.rs:236-285 en 364-405, sky.wgsl:1-2, weather_setup.rs:20-90, omsi-texture/lib.rs:240-282.
- Cloudtak: log tot 1380dc3, `scripts/probe-teksten.ts`, `src/shared/tekst/`.
- Voor het venster: ONS/src/main/index.ts `createWindow` en `printReceipt` (tweede venster), ONS/src/main/busfoto.ts:138 (verborgen venster), ONS/src/preload/busfoto.ts, ONS/electron.vite.config.ts (ingangen), ONS/src/renderer/src/Setup.tsx:86-152 en ≈:817-895 (`Tegel`, `Tegelactie`, het rooster), setup.css:1968-2082, App.tsx ≈:4058-4128 en ≈:4404-4445 (tegels van niveau 3 en 4).
- Voor de versleuteling: ONS/src/core/o3d.ts:140-162, 237-249; busbeeld.ts:236-250; schermvorm.ts:168-188; G/wagenpark.md:203, 570, 671-673, 740-752.

---

## Bijlage C: bronnen, samengevat

**openOMSI:** B/crates/omsi-o3d/src/lib.rs:137-180, 239-278; B/docs/FORMATS.md:177-194; B/crates/omsi-app/src/launcher/showroom.rs:1-10, 110-115, 180-264, 331-351, 364-405; mod.rs:879-883; B/crates/omsi-app/src/scene.rs:9321-9420; B/crates/omsi-app/src/weather_setup.rs:26-31, 53-75; B/crates/omsi-render/src/shader.wgsl:542-558, 976-1089; sky.wgsl:1-2; lib.rs:635-636, 1197-1209, 7048-7104; B/crates/omsi-sim/src/vehicle.rs:473-521, 831-893, 2438-2442; B/crates/omsi-texture/src/lib.rs:244-282; B/docs/FORMATS.md:36-50, 158-161, 290-297, 418-427, 440-446; B/LICENSE:1-3.

**Onze code:**
- ONS/src/main/index.ts: `kleurVars`, `aanhangerVan`, `type Werksoort`, `registerSchemesAsPrivileged`, `schermplaatje`.
- ONS/src/core/situation.ts:127-130; ONS/src/core/schermcfg.ts:5-35, 169-198; ONS/src/core/kleurstelling.ts:8-16, 140-151.
- ONS/src/core/textuur.ts:74-79, 827-960; ONS/src/core/oft.ts:317; ONS/src/core/live.ts:1003-1015.
- ONS/src/main/scherm.ts:192-231; ONS/src/main/busfoto.ts:40-45, 79-119, 361-373, 393-400; ONS/src/renderer/src/busfoto.ts:58-333.
- ONS/src/renderer/src/main.tsx:24; ONS/src/renderer/src/App.tsx:307-309, ≈3781-3830, ≈4058-4132, ≈4795; ONS/src/renderer/src/Setup.tsx:200-225.
- ONS/src/renderer/index.html:6-9; ONS/src/shared/api.ts:83-86, 177-180, 358-359, 666; ONS/src/main/apparaat.ts:26-41.
- ONS/HANDOVER.md:938, 1011-1013, 1541-1556; ONS/package.json:17-22.

**Deel G:** G/:1066-1347 (G3 :1114-1158, G7 :1258-1290, G9 :1307-1335); deel F: G/wagenpark.md:203, 570, 671-673, 740-752.

**OMSI:**
- OMSI/envir.cfg:8-11; OMSI/Texture/himmel01.bmp, clouds.tga.
- OMSI/Vehicles/MAN_SL_SG/Model/model_SL92_main.cfg:1913-1946, 2504-2536.
- OMSI/Vehicles/Citybus 530 by Kajosoft/model/model_o530_e2_2.cfg:2600-2612, Script/cockpit.osc:4641, Script/cockpit_constfile.txt:195-206.
- OMSI/RegAddons/*.ini (vijf add-ons); OMSI/logfile.txt:104 ("Registrations loaded"); Omsi.exe, record `TAddon`; OMSI/Vehicles/HH20_EBus2021/Model/21_aussen_weich3.o3d en `21_aussen_weich3_#low.o3d`.

**Metingen:**
- K/kritiek/bank.out.txt, bank2.out.txt, vram.out.txt, vram2.out.txt, volgorde.out.txt, scripts.out.txt.
- K/ons/harnas/run1.log:20-28, K/ons/harnas/telling-lak.out.txt:1.
- D/vram3.out.txt; D/spike/uitslag-file.json, uitslag-http.json, bmpref.json.
- D/sleutels/sleutels.out.txt, perbus.out.txt, ontwar.out.txt, doos.out.txt, allebussen.out.txt, combis.out.txt, buiten.out.txt, exe.out.txt.

---

## Bijlage D: stand van de bouw (29-09-2026, tak `claude/bus3d`)

**Gebouwd:** stap 0, F0 en F1. Zie HANDOVER.md §5.000 voor de bestanden.

**Gemeten** (Lucs pc, node, bronnen in de OS-cache; `scripts/probe-bus3d.ts`):

| | SD77 | O560 E6 | NLC 12C | NLC 18C | C2 GN | Urbanway 18 | HH20 | NL202 |
|---|---|---|---|---|---|---|---|---|
| Pakket nieuw (bouwen + schrijven) | 79-143 ms | 280-336 | 349-431 | 507-590 | 228-294 | 213-288 | 203-283 | 76-95 |
| Warm (zijspoor + pakket lezen) | 4-7 ms | 9 | 15-27 | 20-22 | 10-12 | 11-12 | 7-9 | 4-6 |
| Geometrie | 2,1 MB | 13,7 | 25,1 | 34,1 | 15,2 | 19,5 | 4,5 | 2,0 |
| Textuurplan bij 160 MB (met transmaps en maskers) | 56 MB | 113 | 159 | 158 | 155 | 158 | 160 | 78 |

- Klaar-eisen F1: SD77 ≤ 0,4 s en NLC ≤ 1,2 s gehaald. Over alle 395 bussen met `[friendlyname]`: 393 pakketten, 1 `'versleuteld'` (GS GU240), 1 zonder model (GS LU200), **0 crashes**, bouwen p50 321 ms, p95 681 ms, max 958 ms. 3058 unieke texturen: **0 onleesbaar**; 2743 door onze eigen lezers helemaal uitgepakt, 315 JPEG/RLE-BMP alleen op de kop (Chromium); 84 textuurnamen (797 verwijzingen) echt ontbrekend.
- T-G1, T-V1 (582/582), T-V3 (25 van 26), T-V4 (22 versleuteld, 4 MAN NL/NG een pakket), T-V5 (6586 gehusselde blokken byte voor byte gelijk aan de bron) en de protocolproef slagen.
- Het o3d-lezen ging van 530 naar 150 ms bij de NLC door acht bestanden tegelijk te lezen: een bestand openen kost op Windows ongeveer 0,75 ms, ook warm.
- De nulmeting van v3 staat in de uitvoer van `probe-bus3d.ts --nulmeting` (NLC 12C 983 ms lezen, HH20 en NL202 een icoon).

**Afwijkingen van het ontwerp, met reden**
- **Doostoets (§16):** alleen breedte en hoogte, tegen [boundingbox] samen met de gemeten doos (1e-99e percentiel) van de open hoekpunten. De letterlijke regel ([boundingbox] + 0,5 m op alle assen) wees de Volvo 7900 18 m af (zijn doos houdt 1,2 m vóór de cabine op) en de gelede Hamburger van 1992 (doos van 1 tot 3 m hoog). Een waaier zit in breedte en hoogte; de tegenproef (sleutel + 1) geeft 2,2-3,5% buiten bij een geregistreerde sleutel en 40-51% bij sleutel 0, tegen 0,00-0,09% met de goede sleutel.
- **Winkelversie:** een vermelding zonder `SteamArtNr` telt niet (alleen sleutel 0), zoals §5.1 zegt; het sleutelonderzoek raadde "accepteren" aan.
- **Route `beeld`** gaat op de inhoud, ook bij een verkeerde extensie (main geeft het juiste MIME-type); §5.7 zette een verkeerde extensie bij `eigen`.
- **Foto's van de BMP-fix** in `busfotos/v3b`, zodat de grijze foto's opnieuw gemaakt worden; `v4` blijft voor de renderer.
- **Nog niet in F1:** de lak geeft alleen de vervangen texturen en de vars (`zichtbaar` leeg tot F2), geen `bus3d:stalen`, geen geometrie-LRU in de werker (het pakket komt van schijf), `h/` geeft 404, de CSP en de instelling `bus3d` komen met het venster in F2.
- **DISABLED:** nog niet beslist: op deze pc is er geen meshes.json van een rit met de SL92. De enige afdruk (Kajosoft o530 e3_3) is ouder dan de cfg: `Tabley-Kun\Mercedes-Benz-Stern.o3d` kwam er op 28-09 bij, en precies die mesh scheelt.

**Tegenlezing F1 (29-09): wat er daarna veranderde.** Elk punt heeft een proef in `probe-bus3d.ts` die op 1592f14 faalt.
- **Registratie (§5.1):** een dubbele `[addon.N]` wordt niet samengevoegd (nagemeten met GetPrivateProfileString: alleen de eerste telt), en `ArtNr`/`SteamArtNr` tellen alleen van 1 tot 2147483647, zoals Delphi's StrToInt. Zo tonen we nooit meer dan OMSI.
- **Textuurplan (§5.7):** een DXT-textuur met mips slaat alleen niveaus over tot een begin waarvan beide zijden deelbaar zijn door 4. WebGL weigert anders dat begin; gemeten in Electron 33 op 250x250, 256x186 en 2x2. Het budget zakt zo'n textuur dus niet verder; lukt het budget daardoor niet, dan geldt `te-zwaar` zoals §9 zegt.
- **CTC (§7):** ook de texturen die de cfg noemt (transmap, envmap-masker, bump, light- en nightmap, freetex) krijgen hun CTC-plek en worden door een kleurstelling vervangen, zoals OMSI op naam vervangt.
- **Rij (§4.1):** per venster (`WebContents`). Het herbouwen na de controle (§4.2) is een achtergrondbeurt: die vervangt nooit een wachtende vraag van de speler, en een vraag van de speler vervangt een wachtende achtergrondbeurt. De 120 s rust tellen vanaf het eind van de laatste werkervraag, en de klok staat stil zolang er een loopt. Mislukt het herbouwen van een verouderd pakket, dan wordt het vergeten en krijgt het venster `bus3d:vervangen`; bij de volgende vraag komt de reden (het icoon). Nieuw kanaal `bus:stuk3d`: het venster meldt een pakket dat `leesPakket` niet leest, en main vergeet het.
- **Cache (§4.2):** het zijspoor noemt de grootte van het `.b3d`; klopt die niet, dan wordt er opnieuw gebouwd. Het `.b3d` gaat met `fsync` naar de schijf vóór het hernoemen. De werker houdt de LRU-grens ook na elke schrijfbeurt aan (na een volle ronde stond er anders 4,5 GB).
- **Bronnen (§4.2):** ook de mappen van alle `[mesh]`-regels (een o3d die later verschijnt), de gelezen `.dsc`'s en de map van de .bus. `leesSchermcfg` en `leesKleurstellingen` houden hun geheugen alleen zolang de schijf niet veranderd is (mappen van de meshes; cfg, CTC-map en elke .cti).
- **Niet veranderd, met reden:** de GS GU240 is een KI-bus en staat niet in de buskeuze; T-V3 geldt op codeniveau. Het werkergeheugen na een volle ronde (64 MB na gc) blijft binnen de 256 MB en gaat na 120 s weg; alleen het kleurstellingengeheugen kreeg een grens (32 modellen). De witte driehoeken in de voorruit van de SD77 zitten in de foto v3 (die [visible] en doorzichtigheid niet kent, §1) en staan ook op de foto van vóór de BMP-fix; F2 met foto v4 moet ze laten verdwijnen.