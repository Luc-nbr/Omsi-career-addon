# Ontwerp: de Lakstudio, een livery-editor in 3D voor OMSI 2 (definitief)

Stand 30-09-2026. Tak `claude/busbedrijf-samen`, HEAD 8e8c27a. In deze versie is de kritiek van 30-09 verwerkt (28 punten). Bijlage B zet per punt op een rij wat ermee gebeurd is.

**De vraag van Luc:** "heel gemakkelijk liveries maken voor OMSI 2 … kleuren schilderen, decals, tekst, geïmporteerde afbeeldingen … in een 3D-omgeving". Die liveries moeten ook in de busbedrijf-modus te gebruiken zijn.

**Wat ik gedaan heb:**
- Ik heb alleen gelezen. Ik heb de proeven van het ontwerp (K/ontw-*) en van de kritiek (KR/*) gedraaid. Die lezen alleen uit de OMSI-map en rekenen alles in het geheugen uit.
- Voor deze versie heb ik extra nagelezen: de .rpc-sjablonen, de familie van rep_GN, de O530 met 3 deuren, de setvars van de HH20, de volgorde waarin `installeerStappen` schrijft, `kleurVars`, de controle "OMSI draait" en `launchOmsi` (zie bijlage A6).
- In de worktree, de OMSI-map en de gegevens van Luc is niets veranderd. OMSI heb ik niet gestart.

**Waarop het rust:** R = OMSI-REPAINTS, B = ONZE BASIS, S = SCHILDERTECHNIEK, KR = de kritiek. Metingen neem ik over met bron.

**Afkortingen**

| Afkorting | Betekenis |
|---|---|
| ONS/ | `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800/` |
| K/ | `C:/Users/lucru/AppData/Local/Temp/claude/C--OMSI-Career--claude-worktrees-ecstatic-noether-296800/69453af6-61d8-4662-b5b4-760aa670cb78/scratchpad/livery/` |
| KR/ | `K/kritiek/` |
| OMSI/ | `C:/Program Files (x86)/Steam/steamapps/common/OMSI 2/` |
| CLOUD/ | `origin/claude/awesome-wozniak-f2svst:design/ontwerpen/busbedrijf-wagenpark.md` (kopie in K/ontw-wp.md) |
| EXE@adres | Omsi.exe-disassembly (K/rp_texlaad.txt, rp_texpad.txt, rp_ctclaad.txt, KR/zoek.txt) |
| familie | alle .bus/.ovh/.sco die dezelfde CTC-map(pen) lezen (§3.1) |
| lakplek | een CTC-plek die de buitenkant van de bus draagt (§3.2) |
| doel | één textuur die de Lakstudio maakt, voor één of meer lakplekken |

**Naam:**
- In de app heet dit de **Lakstudio**; in het Engels "Livery studio", in het Duits "Lackierstudio", in het Frans "Atelier de livrées".
- Bestanden in de OMSI-map krijgen het voorvoegsel `Lakstudio`, niet de naam van de app. De app gaat Omsi-Hub heten (geheugen "Naam: Omsi-Hub"), en een bestandsnaam in de OMSI-map kun je later niet meer hernoemen zonder de nummers van kleurstellingen te verschuiven (§5.2).

---

## 0. De beslissingen in het kort

1. **Een stand van het bestaande 3D-venster** (`doel: 'lakstudio'`), in dezelfde renderer-werker en dezelfde WebGL2-context. Er komt geen tweede venster (ONS/design/ontwerpen/bus3d.md:698-705).
   - Bij de kleurstalen van dat venster komt een tegel **"+ Eigen lak"**. Zo opent de studio vanuit de buskeuze, de dealer en het wagenpark in hetzelfde venster.
2. **Je werkt op de bus, nooit op de platte textuur.** Elke laag is een functie in de ruimte van de bus. De werker rastert die per texel in UV-ruimte. Zo gaan de volgende dingen vanzelf goed:
   - naden en gespiegelde UV-eilanden;
   - UV's buiten [0,1];
   - de aanhanger en verborgen varianten;
   - **de andere bussen die dezelfde kleurstellingen lezen**, zoals de achterwagen van de C2 G Hybrid en de O530 met 3 deuren. Die krijgen de lak op hun eigen net gebakken (§3.1).
3. **Beschermen gaat automatisch en onzichtbaar.**
   - Heeft de maker een sjabloon voor het OMSI Repaint-Tool (.rpc), dan is zijn masker de regel (§3.3).
   - Anders wordt alleen gelakt wat van buiten zichtbaar is, geen glas is en in een grote kleurzone ligt. Rubbers, lampen en roosters blijven dus vrij, bij elke laagsoort.
   - Losse opschriftmeshes schermen de lak eronder niet af.
   - Het alfakanaal wordt nooit geschreven.
4. **Beginnen met Snelle lak:** 1-3 kleuren, een strook, de naam en een logo. Alles staat meteen op de bus en is daarna laag voor laag verder te bewerken. Andere starts:
   - "Effen in de kleuren van deze lak": de kleuren van de huidige lak, zonder zijn logo's, wagennummers en reclame;
   - "Deze lak precies";
   - "Effen".
5. **Spiegelen staat standaard aan** en gebeurt in de wereld. Tekst blijft aan beide kanten leesbaar.
   - Waar links en rechts dezelfde texels delen, komt geen kopie. Daar staat het vanzelf in spiegelschrift, en dat melden we met een knop om het te verschuiven.
6. **Niets is definitief.**
   - Het project bestaat uit lagen met parameters, bewaard als JSON.
   - 500 stappen terug.
   - Automatisch bewaren.
7. **Opslaan maakt een echte OMSI-kleurstelling voor de hele familie.**
   - De naam bestaat alleen in bussen waarvan alle lakplekken gelakt zijn.
   - De `.cti` sorteert achteraan, met eigen DDS-texturen, en wordt geplaatst via de add-on-manager.
   - Nooit overschrijven.
   - Eerst alles controleren, dan pas iets aanraken.
   - De `.cti` wordt als laatste geschreven en als eerste weggehaald.
8. **OMSI mag openstaan.** Dan wordt [Opslaan in OMSI] vanzelf [Klaarzetten voor OMSI]: de lak wordt nu gemaakt en komt in OMSI zodra OMSI dicht is (beslissing 4).
9. **Een eigen BC-encoder** (BC3/BC1, DX9-kop), parallel in 1-4 codeerwerkers. We schrijven geen TGA.
10. **Busopties.** Onderdelen die via setvars verschijnen of verdwijnen, zoals de HOCHBAHN-letters en de grille, worden schakelaars.
    - Bij Effen en Snelle lak staan losse opschriften over de lak standaard uit.
11. **Busbedrijf.** Een eigen lak is een naam in `busKleurstellingen`, met de vlag `eigen`.
    - Een nieuwe lak maken vanuit Overspuiten gaat helemaal lokaal.
    - De cloud hoeft alleen eigen lakken uit de occasions te houden, naar één gebeurtenis te luisteren en in fase 2 de huisstijl te bouwen.
12. **Delen gebeurt met het recept (`.omsilak`), niet met de textuur.** Zo verspreiden we nooit bestanden van een betaalde add-on.

---

## 1. Wat de speler kan

| Kunnen | Hoe | Fase |
|---|---|---|
| **Snelle lak** | Kies 1-3 kleuren, een strooksjabloon, de naam op de bus en eventueel een logo. Elke keuze staat meteen op de bus en wordt een gewone laag. | 1 |
| **Vullen per zone** | Emmer. De app deelt de lak in 2-8 kleurzones. Een klik kleurt de hele zone, aan alle kanten. "Details behouden" (0-100%, standaard 100%) houdt naden, vuil en schaduw. | 1 |
| **Schilderen en gummen** | Penseel met maat in cm op de bus, hardheid en dekking. Wat je ziet, verf je; niets gaat door de bus heen. De gum is een stand van het penseel (toets E). | 1 |
| **Strepen** | Acht sjablonen: onderband, raamband, dakband, schuine streep, golf, tweekleurig boven/onder, frontvlak en achtervlak. De hoogtes versleep je met handvatten; ze snappen aan de raamlijn en de middenlijn. | 1 |
| **Tekst** | Typen op de bus, met de maat in cm. OFL-lettertypen en de Windows-lettertypen, omlijning en letterafstand. Onder 10 texels letterhoogte volgt een waarschuwing. | 1 |
| **Afbeeldingen en vormen** | Eén paneel. Eigen PNG, JPG, WebP of SVG (slepen of kiezen; "Wit wordt doorzichtig"; hooguit 4096 px). Daarnaast een eigen SVG-bibliotheek: pijl, streep, cirkel, ster, golf, rolstoel, kinderwagen, fiets en stadswapen-kader. | 1 |
| **Spiegelen** | Standaard aan. Een tweede cursor, een klein beeld van de andere kant en de snijlijn zijn zichtbaar. Per laag los te koppelen. | 1 |
| **Busopties** | Opschriften en onderdelen die OMSI via setvars toont of verbergt, als schakelaar. Een klik op zo'n onderdeel geeft een tip met [Weghalen]. | 1 |
| **Lagen** | Zichtbaar, dekking, volgorde (slepen), naam, vergrendelen, dupliceren, verwijderen, "Ook over rubbers en lampen". | 1 (groepen in 2) |
| **Ongedaan maken** | Ctrl+Z en Ctrl+Y, 500 stappen per project. Het project wordt automatisch bewaard. | 1 |
| **Bekijken** | Links, Rechts, Voor, Achter, Dak (plat), Schuin en vrij. [Voor/na]. Licht Dag. | 1 (Schemer en Nacht in 2) |
| **Ook op andere uitvoeringen** | "Komt ook op: C2 G Hybrid, 6 KI-bussen". Elk familielid is te bekijken in de studio. | 1 |
| **In OMSI zetten** | [Opslaan in OMSI], of [Klaarzetten voor OMSI] als OMSI openstaat. Later bewerken en opnieuw opslaan onder dezelfde naam, of verwijderen. | 1 |
| **Busbedrijf** | "+ Eigen lak" in het 3D-venster. De eigen lak kiezen bij bestellen en bij overspuiten. | 1 (cloud: L4) |
| **Huisstijl over modellen** | Eén recept per bedrijf, per model toe te passen, en de hele vloot overspuiten. | 2, **beslissing 1** |
| **Delen** | Het recept exporteren en importeren (`.omsilak`). | 2 (repaint-zip: **beslissing 2**) |
| Later | Zone "alleen dit vlak", vrije decalrichting, beschermpenseel, groepen, "2× scherper", ruitbeplakking en achterruitreclame (met de `_üFenster`/`_full`/`_POP`-sjablonen), glans/mat, wagennummer via het script, nightmap, platte uitslag voor experts. | 2-3 |

---

## 2. Zeer gemakkelijk

### 2.1 De eerste 60 seconden van een nieuwe speler

**Uitgangspunt:** de speler heeft nooit een repaint gemaakt en weet niets van `.cti`, DDS of UV.

- **0:00 — Beginnen.** De speler klikt **[Lak maken]** op de tegel "MAN SD200 · BVG" in de buskeuze.
  - Dezelfde ingang staat als tegel "+ Eigen lak" bij de kleurstalen in het 3D-venster. Dat venster opent ook vanuit de dealer en vanuit [3D] in het wagenpark.
- **0:01-0:03 — De studio opent.**
  - Het 3D-venster opent of wisselt naar de Lakstudio. De bus staat in **Schuin** (voor- en zijkant in beeld), nog in de BVG-lak.
  - Rechts staat het paneel **Snelle lak**. Het blokkeert niets.
  - Er wordt niets gevraagd over resolutie, formaat of map.
  - Het paneel Snelle lak bevat:
    - **Kleuren:** drie stalen, vooringevuld met de kleuren van deze lak (in het busbedrijf met de huiskleuren, zodra die er zijn);
    - **Strook:** acht plaatjes, "Onderband" is gekozen;
    - **Naam op de bus:** in het busbedrijf vooringevuld met de bedrijfsnaam, anders leeg;
    - **Logo:** "Sleep een afbeelding hierheen";
    - onderaan kleine koppelingen: "Of begin met: Effen in de kleuren van deze lak · Deze lak precies · Effen".
  - Intussen zijn het masker en de kleurzones berekend (doel ≤ 150 ms, §4.3).
- **0:05 — Kleur 1.** De speler klikt op het eerste staal en kiest donkerblauw.
  - De carrosserie wordt blauw aan alle kanten.
  - Rubbers, lampen, roosters en ruiten blijven zoals ze waren. Bij de SD77 volgt de app het masker van de maker (§3.3).
  - De grille en het MAN-logo, die de maker alleen in de basis heeft staan, verdwijnen onder de lak, zoals bij een echte volreclame.
- **0:10 — Kleur 2.** Wit: de onderband rondom wordt wit.
- **0:15 — Naam.** De speler typt "Stadtwerke Lucstad".
  - Links en rechts staat de naam boven de band, in wit D-DIN van 25 cm, aan beide kanten leesbaar.
- **0:22 — Logo.** De speler sleept `logo.png` uit de Verkenner op het paneel.
  - Het logo komt vooraan op beide zijden, 60 cm breed.
  - Het beeld heeft geen doorzichtigheid en een witte rand, dus "Wit wordt doorzichtig" staat vanzelf aan.
- **0:28 — Verder in de studio.** De speler klikt [Verder in de studio]. In de lagenlijst staan "Grondkleur", "Onderband", "Tekst" en "Logo".
  - Hij sleept de bovenrand van de band omhoog; bij de raamlijn klikt die vast.
  - Hij sleept de tekst iets naar achteren.
  - Rechtsonder toont een klein beeld de andere kant. De eerste keer verschijnt één keer de tip: "Ook aan de andere kant. Uitzetten met [Spiegel]."
- **0:42 — Nakijken.** [Voor/na] in de onderbalk (ingedrukt houden) toont het origineel. Rechts slepen draait de bus rond.
- **0:48 — Opslaan.**
  - Rechtsboven staat **[Opslaan in OMSI]**. Het naamveld is al ingevuld; daaronder staat "Komt ook op: …" als er familieleden zijn. De speler drukt Enter.
  - De voortgang toont "Lak maken … In OMSI zetten …". Bij de SD77 duurt dat ≤ 1 s + ≤ 2 s. Bij de C2 GN (3 texturen van 4096²) duurt het ≤ 4 s + ≤ 2 s (§9 P3).
  - **Staat OMSI open**, dan heet de knop **[Klaarzetten voor OMSI]**, met de regel "OMSI is open. Je lak komt in OMSI zodra je OMSI sluit." (§5.7).
- **0:53 — Klaar.**
  - De melding: "'Stadtwerke Lucstad' staat in OMSI. Je kiest hem in de buskeuze, bij de dealer en bij Overspuiten." met [Verder aanpassen] en [Sluiten].
  - De tegel krijgt een staal en een foto.
  - Kwam de speler uit het wagenpark, dan gaat het venster terug naar de kleurstalen met de nieuwe lak gekozen, en wordt [Overspuiten € 1.500] actief (§6).

Ctrl+Z maakt elke stap ongedaan. Niets was definitief.

### 2.2 Indeling van het venster

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Bus 107 · MAN SD200  [Vullen][Strook][Tekst][Afbeelding][Penseel]  [Spiegel●]  ↶ ↷  [Meer▾] │
│                                   Naam [Stadtwerke Lucstad]  [Opslaan in OMSI]              │
├────────────┬──────────────────────────────────────────────────────┬────────────────────────┤
│ Lagen      │                                                      │ Snelle lak  ⇄  Kleur   │
│ ◉ Logo     │                   de bus (3D)                        │ ■ ■ ■  kleuren          │
│ ◉ Tekst    │            handvatten op het oppervlak               │ ▭ ▭ ▭ ▭  strook         │
│ ◉ Band     │            tweede cursor bij spiegelen               │ naam · logo             │
│ ◉ Grond    │                              ┌─────────────┐         │ ── gereedschap ──       │
│ Basis: Std │                              │ andere kant │         │ maat, lettertype        │
│            │                              └─────────────┘         │                         │
├────────────┴──────────────────────────────────────────────────────┴────────────────────────┤
│ Links Rechts Voor Achter Dak Schuin │ [Voor/na] │ Dag │ Lak 1024² · 95 texels/m · ook op: – │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Zes hoofdknoppen:** vijf gereedschappen plus [Spiegel].
  - Vormen zitten in [Afbeelding], de gum in [Penseel].
  - Achter [Meer▾] staan: Busopties, Snelle lak opnieuw, Start wisselen, Spiegelvlak, Ontwerp openen/exporteren (fase 2) en Verwijderen uit OMSI (S§3.2; https://www.nngroup.com/articles/progressive-disclosure/).
- **De lagenlijst is voor beginners smal:** alleen de naam en het oogje.
- **De statusregel** toont de lakmaat, de texeldichtheid (95-254 texels/m, S§1) en de familie.

### 2.3 Bediening

**Muis**

| Handeling | Wat het doet |
|---|---|
| Linkerknop | Het actieve gereedschap |
| Rechts slepen | Draaien. In een plat aanzicht schakelt dat naar Schuin. |
| Middelste knop, of Shift + links slepen | Verschuiven |
| Wiel | Zoomen naar de cursor |
| Dubbelklik | Centreren op het aangewezen punt |

**Toetsen** (niet tijdens het typen)

| Toets | Wat het doet |
|---|---|
| 1-5 | Platte aanzichten |
| 6 | Schuin |
| F | Inpassen |
| E | Gum aan/uit |
| [ en ] | Penseelmaat |
| O (ingedrukt) | Voor/na |
| Delete | Laag weg |
| Esc | Loslaten |
| Ctrl+Z / Ctrl+Y | Ongedaan maken / opnieuw |

**De spatie heeft geen functie**, want die typt de speler ook in tekst op de bus (KR punt 23).

### 2.4 Wat we bewust niet vragen of tonen

- Resolutie, formaat, map, CTC-plek, UV-weergave, "bleed px", alfakeuze of de keuze van het .rpc-sjabloon (S§3.12).
- De ramen zijn beschermd, de alfa blijft en het uitvloeien gaat vanzelf.
- De CTC-plekken en de familie kiest de app (§3.1). Zijn er twee goede plekken, zoals bij de SD77 met lak en dak, dan worden beide gelakt.

### 2.5 Meldingen (nl; ook en/de/fr in `src/shared/tekst/lakstudio.ts`, `TEKST_LAKSTUDIO`, in de vorm van CLOUD:207-212)

| Sleutel | Tekst |
|---|---|
| `ls.klaargezet` | OMSI is open. Je lak komt in OMSI zodra je OMSI sluit. Je ontwerp is bewaard. |
| `ls.geplaatst` | '{naam}' staat nu in OMSI. |
| `ls.wacht` | Wacht op OMSI |
| `ls.naamBezet` | Die naam bestaat al bij deze bus, ook met andere hoofdletters. Kies een andere. |
| `ls.naamTeken` | Dit teken kent OMSI niet: {teken}. |
| `ls.geenCtc` | Deze bus kent in OMSI geen kleurstellingen. Een eigen lak kan hier niet. |
| `ls.vast` | Dit deel heeft in OMSI een vaste textuur en kan niet gelakt worden. |
| `ls.gekoppeld` | Deze plek deelt zijn textuur met de andere kant: wat je hier doet, zie je daar ook. |
| `ls.spiegelschrift` | Aan de andere kant staat dit in spiegelschrift, want daar deelt de bus dezelfde lak. [Schuif naar een vrij stuk] |
| `ls.kopieDeur` | De kopie aan de andere kant valt op een deur of ruit. |
| `ls.klein` | Deze letters zijn kleiner dan 10 beeldpunten op de lak en worden in OMSI onscherp. |
| `ls.ruit` | Ruiten lak je nog niet. |
| `ls.onderdeel` | Dit opschrift is een los onderdeel van de bus. [Weghalen] |
| `ls.licht` | Voorbeeld op halve scherpte. De lak in OMSI wordt wel scherp. |
| `ls.ookOp` | Komt ook op: {bussen}. |
| `ls.nietOp` | {bus} krijgt deze lak niet ({reden}). Daar bestaat hij niet. |
| `ls.opties` | Busopties kunnen hier niet: {bus} krijgt deze lak niet. |
| `ls.conflict` | Deze kleurstelling zou ook in {bus} verschijnen, maar past daar niet. Daarom zetten we haar niet in OMSI. |
| `ls.handmatig` | Iemand heeft {n} bestand(en) van deze lak met de hand veranderd. We hebben niets aangeraakt. |
| `ls.bezig` | Even wachten: de app installeert of verwijdert al iets. |
| `ls.gebruik` | Bus {nummers} rijden in deze lak. Daarna rijden ze in Standaard. |
| `ls.wees` | Gemaakt met een andere installatie van de app. |
| `ls.klaar` | '{naam}' staat in OMSI. Je kiest hem in de buskeuze, bij de dealer en bij Overspuiten. Ook KI-bussen van dit type kunnen hem dragen. |
| `ls.lettertype` | Lettertype {naam} ontbreekt; we gebruiken {vervanger}. |
| `ls.logo` | Gebruik alleen logo's die je mag gebruiken. |

---

## 3. Welke bussen

### 3.1 De familie van een kleurstelling

Een `.cti` geldt voor **elke** bus die de CTC-map leest, niet alleen voor de bus die de speler opende (KR punt 1). Daarom werkt de studio met de familie:

1. **CTC-mappen van de geopende bus.** Per deel (main, en trail via `trailerOf`) volgt de app `.bus` → `[model]` → cfg → `[CTC]`.
   - **De basis van het pad is de map van de `.bus`**, niet `dirname(dirname(cfg))`.
   - `MB_KI_C2_E6_Gn_main.bus:37-38` wijst naar `model\KI\…`. Die cfg noemt `Gelenk\…`, en die map bestaat alleen vanaf de busmap.
   - Gemeten: 41 van de 1025 .bus/.ovh/.sco wijken af. Bij 36 daarvan bestaat de CTC-map alleen vanaf de busmap (KR/basis.cjs). `ONS/src/core/kleurstelling.ts:150` doet het nu fout; L0 herstelt dat.
2. **De familie** is elke .bus/.ovh/.sco in de installatie waarvan een cfg naar een van die mappen wijst, met dezelfde regel. Voorbeeld rep_GN: 12 .bus, waarvan 6 KI (KR/gn.cjs).
3. **Per familielid de lakplekken** (§3.2).
4. **Groeperen op de standaardtextuur** (het opgeloste pad, anders sha1): elke verschillende textuur is één **doel**. Plekken van andere leden met dezelfde standaardtextuur liften mee.
   - Voor rep_GN zijn dat 3 doelen:
     - `farbschema_tex1_main` → C2E6_Wagenkasten_main.tga;
     - `farbschema_tex1_trail` → …_trail.tga;
     - `farbschema_tex1_trail_Hybrid` → C2E6_Wagenkasten_Hybrid_trail.tga (OMSI/Vehicles/MB_C2_EN_BVG/Model/model_MB_C2_E6_Gn_Hybrid_Trail.cfg:19-21; 4.122.578 tegen 3.415.459 B).
   - Alle KI-bussen liften mee.
   - Bij de O530 zijn het 2 doelen: `repaint_body` (01white.tga) en `repaint_body_3doors` (3_01white.tga), beide 2500×1300 (A6).
5. **Per doel één bakker:** het lid met die textuur, bij voorkeur een bestuurbare bus, met de hoogste LOD. De wereldlagen worden op het net van dat lid gebakken. De werker laadt daarvoor alleen het laknet en de maskers van dat lid (§4.14).
6. **Dezelfde busruimte.** Familieleden hebben dezelfde carrosserie, dus de wereldlagen passen er één op één op.
   - Proef P7 kijkt dat na: de `[boundingbox]` moet binnen 5 cm gelijk zijn.
   - Wijkt een lid meer af, dan telt het als "niet te bakken".
7. **Een lid dat we niet kunnen bakken** (versleuteld en hier niet geregistreerd, meshes ontbreken, of de doos wijkt af) mag de naam **helemaal niet** krijgen.
   - Items waarvan de plek in dat lid bestaat, vallen weg. Dat geldt ook voor gekopieerde startitems.
   - Daardoor vallen ook de setvars weg (§5.4, punt 7). De studio toont `ls.nietOp` en `ls.opties`.
8. **`eigen` per .bus** geldt alleen als al zijn delen de naam hebben met al hun lakplekken gelakt (§6).

In de studio staat onder de naam "Komt ook op: C2 G Hybrid, 6 KI-bussen", met per bestuurbaar lid [Bekijk]. Dat laadt dat lid in de studio, met hetzelfde project.

### 3.2 De lakhuid van een familielid

- **Rangorde per deel:** hergebruik van `rangschikPlekken` (ONS/src/core/kleurstalen.ts:9-23):
  1. de plek die de meeste kleurstellingen vervangen;
  2. dan het grootste buitenoppervlak (het Bus3D-pakket kent per textuur `ctc`, `oppervlak` en `uv`, ONS/src/shared/bus3d.ts:47-51);
  3. dan het grootste bestand.
- **Een tweede doel** komt erbij als een andere CTC-plek ≥ 10% van het silhouet in een aanzicht draagt. Voorbeeld: SD77_02, het dak, 91,5% van het dakaanzicht (R§D).
- **Meeliftende plekken:** dezelfde standaardtextuur in een ander familielid, of een standaardtextuur `<lak>_#low` (HH20 tex7/tex8). Die krijgen hetzelfde bestand, of het `_#low`-bestand.
- **Glasplekken** zijn plekken waarvan de textuur alleen in gemengde materialen voorkomt (`farbschema_trans`, `_exterior_trans`, `Glass`). Die krijgen geen item en houden dus schone ruiten.
- **Vaste delen** zijn buitenkanten in een textuur zonder CTC-plek. Voorbeelden: Kajosoft tex3.dds 29-34%, O550 Fensterrand 33-39% (R§B5). Die worden grijs gearceerd met `ls.vast`.

### 3.3 De sjablonen van de makers (.rpc)

OMSI heeft een eigen Repaint-Tool (OMSI/SDK/RepaintTool/RepaintTool.exe). Een `.rpc` noemt in de eerste vijf regels, relatief aan zichzelf, vijf sjablonen: BS (basis), AL (alfa), MA (masker), AD (optellen) en MU (vermenigvuldigen) (K/rp_wiki_rpc.txt:70).

**Wat ze betekenen:**
- **MA:** wit = lakken mag, zwart = niet, grijs = gedeeltelijk (:87-88).
- **BS:** de textuur zonder lak. Wat alleen in BS staat, verdwijnt onder lak, zoals de grille-schaduw en het MAN-logo van de SD200 (:92).
- **AL:** de alfa van de uitvoer, bij deze makers het reflectiemasker (:94).
- **De formule:** `BS·(1−MA) + (AD + MU·Anstrich)·MA` per kleurkanaal (:108).

**Waar ze staan:**
- 42 `.rpc` in 11 voertuigmappen: HH109 (5 mappen), HH20_EBus2021 (8), HH_Stadtbus2017 (10), HC_Volvo7900H (4), Rheinhausen_Ueberlandbus (2).
- In de SDK voor MAN D, MAN NG 272, MAN SD en MB O407 (A6).

**Van de 11 bussen hebben er 3 een sjabloon:**

| Bus | Sjabloon | Opmerking |
|---|---|---|
| SD77 | `SDK/RepaintTool/MAN SD/SD77_01.rpc` → `templates\SD77_01_{BS,AL,MA,AD,MU}.bmp` | `SD77_02.rpc` bestaat ook; in templates/ zag ik met die naam alleen SD77_02_BS.bmp. L1 kijkt na welke vijf bestanden het noemt. |
| NL202 | `SDK/RepaintTool/MAN NG 272/EN92_1.rpc` → `EN92_1_{BS,AL,MA,AD,MU}.bmp` | Er is ook een `_full`-variant. |
| HH20 | `Vehicles/HH20_EBus2021/Texture/Werbung(_3T)/C2_21_Standard.rpc` en `C2_21_T_Standard.rpc` → `templates\newC2EG(_T)_*.bmp` | Er zijn ook `_POP`-varianten. |

**Koppelen aan een doel gebeurt niet op naam.** Bij de HH20 heet de .rpc C2_21_Standard, maar de sjablonen heten newC2EG. De regel:
- BS heeft dezelfde maat als het doel;
- op 1/8 van de maat is BS vrijwel gelijk aan de standaardtextuur (PSNR ≥ 30 dB).

De gewone variant wint. `_üFenster`, `_full` en `_POP` openen vermoedelijk de ruiten voor beplakking (:89). Die bewaren we voor fase 3.

**Gebruik** (§4.4): MA is het lakmasker, AD en MU zijn de detailfunctie, BS is de basis bij Effen en Snelle lak. AL gebruiken we niet: de alfa blijft die van de basis, en P5 vergelijkt de twee.

**De sjablonen worden alleen lokaal gelezen**, nooit gedeeld (§7). De magenta-regel van het Tool (:80) is niet nodig, want onze lagen hebben alfa.

### 3.4 De bussen bij Luc

Maten en soort komen uit R§D, alfa uit R§B4, texeldichtheid uit S§1.

| Bus | Doelen → uitvoer | Alfa | Sjabloon | Familie en bijzonder | Steun |
|---|---|---|---|---|---|
| C2 E6 Solo | farbschema_tex1 (C2E6_Wagenkasten, 4096²) → BC3 4096² | T | — | 55 kleurstellingen; busoptie Tuer2_IST_SST (techniek, KR punt 4) | volledig |
| C2 E6 GN | tex1_main + tex1_trail + **tex1_trail_Hybrid** (3× 4096²) → 3× BC3 | T | — | familie van 12 .bus (6 KI), één `.cti` | volledig, 3 doelen |
| MB O530 | repaint_body (01white) + **repaint_body_3doors** (3_01white), 2500×1300 → 2× BC3 | T | — | O530 3 Doors leest dezelfde map `Texture\rep` | volledig, 2 doelen |
| O560 E6 | farbschema_tex1 (4096×2048) → BC3 | R | — | glas apart (tex4), in fase 3 | volledig |
| NLC 12C | Farbschema_12C_2door (4096×2048) → BC1 | N | — | 26 plekken; kenteken via het script | volledig |
| SD77 | tex1 SD77_01 (1024²) + tex2 SD77_02 (dak) → BC3 + BC1 | R | SD77_01.rpc (SD77_02.rpc in L1) | 95 texels/m; busoptie vis_grill_invisible | volledig, 2 doelen |
| HH20 | tex1 newC2EG + tex5 newC2EG_T (2048²), plus `_#low` tex7/tex8 | R | C2_21_Standard / C2_21_T_Standard | 24% gedeelde texels, waarvan 13,5% links/rechts (B§3); busopties hide_hochbahn_ext, decal_ebus_rear | volledig, met arcering |
| NL202 | farbschema_tex1 (EN92_1, 2048²) → **BC1** | alles 255 | EN92_1.rpc | stoelstof op dezelfde textuur | volledig |
| Urbanway 18 | body (4170×2600) → BC3 **4168**×2600 | T | — | één doel voor voor- en achterwagen | volledig |
| Kajosoft O530 | farbschema_tex1 (2048²) → BC3 | T (binair) | — | tex3 vast 29-34% | gedeeltelijk |
| TH O550 | farbschema_exterior (2048²) → BC3 | R | — | Fensterrand vast 33-39%; 12,6% gedeeld | gedeeltelijk |
| MB C2 E5 GN | CTC-map `rep_GN_E5` ontbreekt, 0 kleurstellingen | T | — | de map wordt aangemaakt (§5.1) | volledig |

De maat 4168 volgt de bestaande Urbanway-repaints (4168×2600 DXT5 met 13 mips, R§D). BC vraagt een veelvoud van 4.

### 3.5 Terugval en conflicten

- **Geen `[CTC]`** (9 van 571 bussen; B§3): [Lak maken] staat uit, met `ls.geenCtc`.
- **Geen kleurstellingen, of de CTC-map ontbreekt:** de rangorde gaat alleen op oppervlak. De map wordt bij het plaatsen aangemaakt, en onze lak krijgt index 0.
- **Versleuteld en hier niet geregistreerd:** Bus3D toont wat OMSI toont (ONS/src/core/omsiregistratie.ts:5-13). Ontbreken de lakmeshes van de geopende bus, dan staat de knop uit. Bij een ander familielid geldt §3.1, punt 7.
- **Plekconflict.** Dit is het geval als in een map van de familie dezelfde plek-naam verschillende standaardtexturen heeft, **en** die plek een van onze gebakken lakplekken is.
  - Dan volgt `ls.conflict` en wordt er niets geschreven, voor bestuurbare bussen en KI gelijk. Een KI-bus met een verkeerd gemapte textuur zou verminkt rondrijden.
  - Items die uit de start gekopieerd zijn, tellen niet mee. Die doen precies wat de start-kleurstelling al deed. Voorbeeld: NG313 `farbschema_Innenraum` is `ng313_2.tga` voor en `ng313_2_h.tga` achter.
  - Gemeten vanaf de .bus: 270 mappen, 153 gedeeld, 13 echte conflicten. Geen daarvan raakt een lakdoel van de 11 bussen (KR/gedeeld2.out.txt).
  - Wel `ls.conflict` krijgen onder meer HH109_Stadtbus_VHHPVG_AI (bodyfinal.tga tegen mainbody_vhh_sr.dds), HC_C2_parked en HH20_C2_parked (g2.tga tegen c2.tga).
- **Lak groter dan 4096 aan de lange zijde** (14 cfg's met 8192×2048; B§6): de uitvoer wordt standaard 4096. Volle maat kan in fase 2, met een waarschuwing over het geheugen.

---

## 4. Techniek

### 4.1 Waar het draait

**In de bestaande renderer-werker van het 3D-venster** (ONS/src/renderer/src/bus3d/werker.ts:7-21, 114-169), met een nieuwe module `bus3d/lak/`. Bus3D laadt al het pakket, de texturen, de ruststand en de lak. De samengestelde lak gaat via één override in `voorPlek(plek)` (ONS/src/renderer/src/bus3d/texturen.ts:175-185) meteen in beeld.

**Het venster:**
- `Bus3dDoel = 'buskeuze' | 'dealer' | 'wagenpark' | 'lakstudio'` (ONS/src/shared/bus3d.ts:320).
- `Bus3dVensterVraag` krijgt `lak?: { projectId?: string; start?: string; bedrijf?: { naam: string; kleuren?: string[] } }`.
  - Opent het venster voor 'wagenpark' of 'dealer', dan vult main `bedrijf.naam` uit het actieve profiel. De cloud hoeft daar niets voor te doen.
- **"+ Eigen lak"** is de laatste tegel bij de kleurstalen, in elk doel.
  - Een klik wisselt het venster naar de studio, en main onthoudt de vorige vraag.
  - Na opslaan of klaarzetten gaat het venster terug, met de nieuwe naam gekozen. Het stuurt dan de gewone `Bus3dKeuze` (§6).
- In de studio staat het venster gemaximaliseerd. Alles wordt automatisch bewaard, dus een wissel kost nooit werk.
- **Geen wissel tijdens het maken.** Vraagt een andere 3D-klik een andere bus terwijl "Lak maken … In OMSI zetten …" loopt, dan wacht die wissel tot het klaar is, met "Even wachten: de lak wordt gemaakt" (KR punt 15).
- **Schakelaar:** zie beslissing 5 (nu `bus3d`, ONS/src/main/index.ts:4829-4831).

**Geen heldenbeeld in de studio.** De werker schrijft het heldenbeeld onder `b.lak?.kleurstelling` zodra alles scherp staat (werker.ts:366-370). In de studio komt er naast `licht` en `foto` een vlag `b.lakstudio`, zodat een half ontwerp het heldenbeeld van de basis niet overschrijft.

**Berichten** (uitbreiding van ONS/src/renderer/src/bus3d/berichten.ts:15-70):

| Van → naar | Bericht | Inhoud |
|---|---|---|
| venster → werker | `lakStart` | `{ familie, doelen, sjablonen, project }` |
| werker → venster | `lakKlaar` | `{ zones, per doel: maat, texels/m, gedeeld%, vast%, raamlijn }` |
| venster → werker | `lakLagen` | de hele lagenstapel (JSON, klein) |
| venster → werker | `lakOpties` | busopties `{ variabele: waarde }` → andere ruststand, masker opnieuw |
| venster → werker | `lakLid` | een ander familielid bekijken |
| venster → werker | `lakKies` | `{ x, y }` |
| werker → venster | `lakGekozen` | `{ doel, uv, wereld, normaal, zone, glas, vast, gedeeld, onderdeel?, deur? }` |
| venster → werker | `lakStreek` | penseelstippen plus de camerastand |
| venster → werker | `lakBeeld` | ImageBitmap, overgedragen |
| venster → werker | `lakExport` | |
| werker → venster | `lakVoortgang` | `{ doel, stap, deel }` |
| werker → venster | `lakExport` | per doel de DDS-bytes plus `_#low`, overgedragen |
| venster → werker | `lakStop` | |

### 4.2 Aanwijzen: de pick-pass

- **Een doel van 1×1 pixel** met een smalle pick-projectie rond de cursor.
- **Twee RGBA32UI-uitgangen:** `[teken-id, driehoek, u-bits, v-bits]` en `[x, y, z, normaal oct-gepakt]`. Integer-doelen zijn standaard in WebGL2, er is geen `EXT_color_buffer_float` nodig (werker.ts:192-195).
- **Dezelfde tekenlijsten als het beeld** (`dicht`, `test`, `meng`): eerst alle meshes als afdekkers, dan het laknet.
  - Glas dekt af: een klik op een ruit geeft `glas` (`ls.ruit`).
  - Uit het teken-id volgen ook:
    - `onderdeel`: de mesh hangt aan een `[visible]`-variabele van de busopties, dus `ls.onderdeel` met [Weghalen];
    - `deur`: de mesh heeft een animatie. Dat is nodig voor `ls.kopieDeur` en de raamlijn.
- Tijdens het slepen draait één pick per beeld.

### 4.3 Het lakdoek: rekenen in UV-ruimte

**Het laknet** wordt per doel één keer opgebouwd, bij de start of bij het wisselen van lid:
- alle driehoeken van alle meshes en LOD's die de doeltextuur als hoofdtextuur hebben, met de hoogste LOD als laatste;
- inclusief verborgen `[visible]`-varianten en de aanhanger in de ruststand (S§5);
- ontward in een eigen VBO (positie, normaal, UV, teken-id, driehoek-id).
- Een kopie blijft in het geheugen van de werker, nooit op schijf (bus3d.md:74). 57k driehoeken is ongeveer 6 MB.

**UV terugschuiven:**
- Per driehoek `uv − floor(zwaartepunt)`. Bij 7 van de 11 bussen ligt 99,7-100% van de hoekpunten buiten [0,1] (B§3).
- Een driehoek over een tegelgrens wordt nog eens getekend met ±1 (hooguit 4 kopieën).
- `[texcoordtransX/Y]` wordt gelezen maar niet getekend (B§3). P5 telt of een lakmesh het gebruikt.

**De UV-rastergang:**
- De vertex-shader zet `gl_Position = vec4(uv·2−1, 0, 1)` met de wereldpositie en de normaal als varyings.
- De fragment-shader rekent per texel de lagen uit.
- Er is geen kaart met wereldposities (S§4).

**De maskerkaart** (RGBA8, per doel). Tijdens het bewerken is die op de halve maat, in de lichte stand op een kwart. Bij de export is ze op volle maat, in tegels (§4.14).

| Kanaal | Betekenis | Hoe |
|---|---|---|
| R | **buiten** | Vanuit 26 richtingen (6 assen, 12 diagonalen van ribben, 8 hoeken) per richting **twee** orthografische dieptekaarten van 1024² (≈ 1,8 cm per texel over 18 m): één van de dichte meshes en één van de meshes met alfatest of menging, inclusief glas. Een texel is buiten als hij in minstens één richting vóór beide ligt: binnen **1 cm** van de dichte kaart en binnen **5 cm** van de doorzichtige. Een opschriftmesh die een paar mm tot cm boven de lak ligt, dekt dus niet af (KR punt 5). Stoelen ≥ 20 cm achter een ruit blijven afgedekt (NL202). Een binnenpaneel direct achter de buitenhuid blijft afgedekt door de krappe marge. Het masker volgt de **busopties**: is een onderdeel verborgen, dan telt het niet mee. Bij een wissel wordt het opnieuw berekend. |
| G | **glas** | De texel wordt gebruikt door een gemengd materiaal (`[matl_alpha]` 1 of 2, ruitlagen). Bij soort T zitten de ruiten in dezelfde textuur (R§B4). |
| B | **gedeeld** | Twee gangen met MIN- en MAX-mengen van de wereldplek, genormaliseerd op `[boundingbox]` in UNORM8 (≈ 5 cm per stap). Verschil > 2 stappen betekent gedeeld. |
| A | **gedekt** | Er ligt een driehoek op de texel. Dit is het zaad voor het uitvloeien. |

**Kleurzones:**
- Uit de detailbron (§4.4) op 1/8 van de maat, via readPixels over texels met een lakmasker > 0,5.
- k-means in Lab, k = 2..8 met een elleboog van 15%. Centra dichter bij elkaar dan ΔE 8 worden samengevoegd.
- Doel ≤ 50 ms; niet gemeten, P3 meet het.
- Per texel kiest de GPU het dichtste centrum. In fase 1 is een zone een kleurgroep over de hele bus; "alleen dit vlak" komt in fase 2.

**De raamlijn** per zijde is de onderkant die het vaakst voorkomt (in klassen van 5 cm), gemeten aan glastexels van meshes **zonder animatie**. Deurglas, dat bij lagevloerbussen bijna tot de vloer loopt, telt dus niet (KR punt 8).

### 4.4 Het lakmasker en de detailfunctie

**Het lakmasker M** (0..1) geldt voor **alle** laagsoorten (KR punt 7):
- **Met een sjabloon** (§3.3): `M = MA`.
- **Zonder sjabloon:** `M = buiten · (1 − glas) · Z`.
  - Z is 1 in de zones die ≥ 10% van de lak beslaan in de detailbron, met een zachte rand over 4 ΔE.
  - Rubbers, lampen, roosters en ingebakken opschriften van de standaardtextuur blijven zo vrij.
- **Per laag "Ook over rubbers en lampen":** die laag gebruikt dan `M' = buiten · (1 − glas)`.
- Het penseel volgt dezelfde regel. Het beschermpenseel (fase 2) verandert M.

**De basis B** (wat blijft waar niet gelakt wordt):
- BS van het sjabloon, of anders de standaardtextuur van de plek, bij Snelle lak, Effen en "Effen in de kleuren van deze lak";
- de textuur van de start-kleurstelling bij "Deze lak precies".

**De detailfunctie D** (hoe een laagkleur c naden, vuil en schaduw houdt):
- **Met sjabloon:** `D(c) = AD + MU·c`, per kanaal en in sRGB-waarden, zoals het Repaint-Tool (K/rp_wiki_rpc.txt:108).
- **Zonder sjabloon:** in lineair licht `s = clamp(Y_detail / Y_zonecentrum, 0,4 … 1,3)` en `D(c) = c · mix(1, s, d)`.
  - d is "Details behouden" per laag, standaard 1.
  - Texels ver van elk centrum krijgen s = 1.
- **De detailbron** is de standaardtextuur, of bij "Deze lak precies" de start-textuur.

**Samenstellen per texel:** `uit.rgb = B · (1 − α·M) + D(Ĉ) · α·M` en `uit.a = B.a`.
- (Ĉ, α) is de samenstelling van de lagen (§4.5). Ĉ is niet voorvermenigvuldigd.
- Met α = 1 is dat precies de formule van het Repaint-Tool.

**De vier starts:**

| Start | Basis | Lagen | Items uit de start in de `.cti` |
|---|---|---|---|
| **Snelle lak** (standaard) | BS of standaard | uit het recept: grondkleur, strook, tekst, logo | nee |
| **Effen in de kleuren van deze lak** | BS of standaard | per zone ≥ 10% van de standaard een zonelaag met de mediane kleur van de huidige lak op die texels (mip 3). Logo's, wagennummers en reclame van de oude lak verdwijnen (KR punt 11). | ja (interieur, stoelen, velgen) |
| **Deze lak precies** | de start-textuur | geen | ja |
| **Effen** | BS of standaard | geen | nee |

### 4.5 De lagen en het samenstellen

**Volgorde en mengen:**
- Van onder naar boven, "over" met voorvermenigvuldigde alfa, in lineair licht.
- Het doel is `SRGB8_ALPHA8`; `generateMipmap` gaat dan lineair.
- `readPixels` geeft de sRGB-bytes voor schijf. De viewer leest ze zoals elke OMSI-textuur (texturen.ts:668).
- Alfa: eerst de alfa van de basis kopiëren, dan de lagen met `colorMask(true, true, true, false)`.

**Soorten lagen** (`src/shared/lak.ts`). Elke laag heeft ook `detail` (0..1), `ookOverRubbers?` en `uitRecept?`.

| Soort | Parameters | Per texel |
|---|---|---|
| `zone` | centrum (Lab), straal, kleur | afstand in Lab → dekking |
| `strook` | sjabloon, h1, h2 (in m in busruimte; de handvatten snappen aan doos en raamlijn), hoek, golf, `zijden` of `rondom`, kleur, verloop | een band in busruimte |
| `tekst` | tekst, lettertype, hoogte in cm, kleur, omlijning, `plaats` | decaltextuur (§4.6) |
| `afbeelding` | beeld-id, wit doorzichtig, `plaats` | decaltextuur |
| `vorm` | ingebouwde SVG, kleur, `plaats` | decaltextuur |
| `penseel` | streken (vector, met camerastand), kleur, gum | eigen RGBA8-laag (§4.8) |

`plaats` = `{ zijde: 'L'|'R'|'V'|'A'|'D'; midden: [x, y, z]; breedteM; draai; spiegel: 'gekoppeld'|'los'; zelfdeRichting?: boolean }`.

**Twee paden** (KR punt 14):
1. **Gewone texels:** één UV-gang die per fragment alle lagen samenstelt. Gemeten: 32 decals plus stroken in 1,13 ms bij 4096² (S§4). Deze gang slaat texels met B (gedeeld) over.
2. **Gedeelde texels.** Dit pad draait alleen als ≥ 1% van de lak gedeeld is.
   - Per 4 lagen één UV-gang naar een RGBA8-dekkingsdoel met `blendEquation(MAX)`: elke laag krijgt de hoogste dekking over alle wereldplekken van de texel.
   - Daarna één schermvullende gang die die 4 lagen "over" samenstelt, alleen op gedeelde texels.
   - 32 lagen is 8 + 8 gangen. Het dekkingsdoel wordt hergebruikt (§4.13).
   - P3 meet dit op de HH20. Haalt het de eis niet, dan worden de lagen onder en boven de gesleepte laag vooraf samengesteld.

### 4.6 Decals, tekst en afbeeldingen

- **Projectie per zijde** (S§2.4, keuze 3): de as van de zijde is de projectierichting.
  - Afzwakken tussen 60° en 80° afwijking van de normaal; achterkanten tellen niet.
  - De vrije richting via de normaal komt in fase 2.
- **Tekst:** `fillText` op een OffscreenCanvas in de werker, met `FontFace` vanuit een ArrayBuffer (https://developer.mozilla.org/docs/Web/API/CSS_Font_Loading_API).
  - De hele regel wordt telkens opnieuw gerasterd, op de texeldichtheid van de lak maal 2.
  - Bij < 10 texels letterhoogte volgt `ls.klein`.
- **Afbeeldingen:**
  - PNG, JPG en WebP gaan via `createImageBitmap` met `premultiplyAlpha: 'none'` (texturen.ts:604-610). De Urbanway-PNG van 4170×2600 kostte 70 ms (S§2.10).
  - SVG gaat via `<img>` in de pagina (in beeldmodus geen scripts en geen externe bronnen; https://svgwg.org/specs/integration/), dan naar een ImageBitmap.
  - Plafond: 4096 px en 20 MB.
  - "Wit wordt doorzichtig" staat vanzelf aan als het beeld geen doorzichtigheid heeft en ≥ 90% van de randpixels bijna wit is.
- **Hooguit 32 decals per gang**, als lijst in een UBO. Beelden komen in een `TEXTURE_2D_ARRAY` van 1024². Grotere beelden krijgen een eigen gang.

### 4.7 Naden en uitvloeien

- **Naden:** wereldlagen geven beide kanten van een naad dezelfde kleur.
- **Uitvloeien met JFA:**
  - Een kaart met de dichtstbijzijnde gedekte texel (RG16UI), één keer per doel: 19,3 ms bij 4096² en 7,6 ms bij 2048².
  - Daarna per samenstelling vullen in 0,14 ms (S§2.2, S§4).
  - Er wordt tot het volgende eiland gevuld (https://experienceleague.adobe.com/en/docs/substance-3d-painter/using/technical-support/workflow-issues/export-issues/texture-dilation-or-padding).
  - Tijdens het bewerken op de maat van het masker; bij de export zie §4.14.
- **Haarlijnen:** WebGL2 kent geen conservatieve rasterisatie. De randen van driehoeken worden daarom ook als `LINES` getekend.
- Daarna `generateMipmap` (0,12 ms).

### 4.8 Spiegelen, gedeelde texels en het penseel

**Spiegelen:**
- Het vlak ligt op het midden van `[boundingbox]` in de breedte en is verstelbaar onder [Meer]. P7 kijkt het na.
- Een gespiegelde decal is een tweede instantie met dezelfde id plus `'`.
  - **Tekst:** de plaats wordt gespiegeld en de projectie-as omgedraaid, zodat de tekst leesbaar blijft.
  - **Vormen en afbeeldingen:** standaard gespiegeld (een pijl wijst aan beide kanten naar voren). "Zelfde richting" draait dat om.
- **Geen kopie in een gedeeld gebied** (KR punt 9). Valt > 2% van de voetafdruk van een tekst, afbeelding of vorm op gedeelde texels, dan maakt de app geen kopie.
  - De andere kant krijgt het beeld dan al via de gedeelde texels, in spiegelschrift.
  - Het kleine beeld toont dat, met `ls.spiegelschrift` en [Schuif naar een vrij stuk]. Die knop schuift de decal in de lengte naar de dichtstbijzijnde plek met ≤ 2% gedeeld.
  - Stroken en zones spiegelen gewoon, want die zijn symmetrisch.
- **Het beeld van de andere kant** (KR punt 10) verschijnt tijdens het plaatsen en slepen van een gespiegelde laag, rechtsonder op 320×180.
  - Het is een tweede viewport in dezelfde context, met hetzelfde platte aanzicht van de andere zijde.
  - `ls.kopieDeur` volgt als ≥ 10% van de kopie op glas of op een geanimeerde mesh valt.

**Gedeelde texels:**
- De HH20, O550, NL202 en HH2017 hebben 13-24% gedeelde texels.
- Zo'n texel krijgt per laag de hoogste dekking van al zijn wereldplekken (§4.5, pad 2).
- Bij bussen met ≥ 5% gedeeld worden die plekken bij het aanwijzen gearceerd (`ls.gekoppeld`).

**Het penseel** (projectie vanuit het scherm, S§2.1, keuze B):
- Bij het begin van een streek maakt de werker een dieptebeeld van de camera (D24, zonder MSAA, ≈ 8 MB).
- Per stip een UV-gang over alleen de driehoeken binnen de straal (1/50 van het net, 0,03 ms).
- De fragment-shader berekent de afstand in cm op de bus, doet de dieptetoets en zwakt af van 60° tot niets bij 80°.
- Met spiegel een tweede stip in dezelfde gang: 32 stippen kosten 0,60 ms.
- **Een streek wordt bewaard als vector:** punten in busruimte, straal, hardheid, kleur, gum **en de camerastand** (16 getallen plus de schermmaat).
  - Opnieuw afspelen, zoals bij ongedaan maken, bij een ander familielid of bij de export, maakt het dieptebeeld opnieuw vanuit die camera.

### 4.9 Busopties

**Wat:** elke `[setvar]`-variabele uit de `.cti`'s van de familiemappen, met de waarden die daar voorkomen.

**Indeling:**
- **Uiterlijk:** de variabele komt alleen voor in `[visible]` van de model-cfg's, in varlists en in `.cti`'s.
  - Voorbeeld: `hide_hochbahn_ext` staat alleen in de cfg (OMSI/Vehicles/HH20_EBus2021/model/model_21_3T_main.cfg:19650-19657, en :18602, :18996) en in script/19_visual_varlist.txt.
- **Techniek:** de variabele staat ook in een `.osc`-script of elders. Tuer2_IST_SST (rep_GN/SST.cti:24) valt daar vermoedelijk onder; L1 toetst dat met dezelfde regel.
- Dit is een vuistregel. P16 kijkt hem na.

**In de studio:**
- [Meer▾] › Busopties.
- Uiterlijk-variabelen als schakelaar, met een naam uit de mesh (`21_decals_aussen_hochbahn.o3d` → "Opschrift hochbahn (buiten)").
- Techniek apart onder "Techniek", met de regel "Verandert hoe de bus werkt".
- Een klik op zo'n onderdeel op de bus geeft `ls.onderdeel` met [Weghalen].

**Standaardwaarden:**
- **Deze lak precies:** de waarden van de start.
- **Snelle lak, Effen en Effen in de kleuren:**
  - uiterlijk-variabelen waarvan de meshes over de lak liggen (dezelfde indeling als het masker: alfamesh binnen 5 cm van een lakdoel) krijgen de waarde die ze verbergt;
  - de rest blijft standaard;
  - bij "Effen in de kleuren" komt techniek van de start.
- **Bewijs:** de kleurstellingen die niet van de HHA zijn, zetten `hide_hochbahn_ext` en `decal_ebus_rear` op 1 (Texture/Werbung_3T/3T.cti: " silber", Champagner, Stuttgart, gelb, gruen). De HHA-reclames zetten ze op 0 (Texture/Werbung/21.cti:29, :64, :95).

**Vastleggen:**
- De lak schrijft een expliciete waarde voor **elke** uiterlijk-variabele van de map, ook 0. Zo ziet de lak er altijd hetzelfde uit, welke kleurstelling de bus ook had.
- Techniek wordt alleen geschreven als de speler of de start het kiest.

**Voorbeeld in beeld:**
- Main rekent de ruststand uit met de extra waarden (`bus:lak3d(pakket, kleurstelling, extraVars)`, de volgorde standaard → init → setvars van bus3d.md:1209).
- De werker wisselt de zichtbaarheid en berekent het masker opnieuw. Samen ≤ 300 ms (P16).

**Grens:** busopties gaan in de `.cti` alleen onder de setvar-regel (§5.4, punt 7). Kan dat niet, dan staan de schakelaars uit met `ls.opties`.

### 4.10 Ongedaan maken en bewaren

- **Ongedaan maken:** het project is onveranderlijke data. Elke handeling is een reducer in `lagen.ts`, puur en in node te testen. De geschiedenis houdt **500 stappen**.
- **Penseellagen** worden bij ongedaan maken opnieuw afgespeeld uit hun vectoren: 32 stippen per 0,33 ms, dus 2.000 stippen ≈ 21 ms.
  - Boven 10.000 stippen komt er een controlepunt per laag, op de bewerkmaat en hooguit 2 per laag.
- **Automatisch bewaren:** 2 s na de laatste wijziging gaat `lak:bewaar` naar main, en `schrijfVeilig` schrijft naar `userData/lakstudio/<id>/project.json`.
- **Geïmporteerde beelden** gaan één keer als bytes naar main (`lak:beeld`) en worden bewaard onder hun sha1.
- Nooit meetkunde of een plekkaart op schijf (bus3d.md:74).

### 4.11 Licht

- **Fase 1: alleen Dag.** Dat is de bestaande "Buiten": een vaste middagzon op 38° (teken.ts:56-57).
- **Fase 2 (L5): Schemer en "Nacht (indruk)"** (KR punt 25).
  - Schemer: de zon op 3°, de kleuren uit envir.cfg geïnterpoleerd tussen "Sonnenaufgang" en "Ende Dämmerung", de hemel `himmel04` (OMSI/envir.cfg:8-11, :18-20, :48-63, :117-132, :191-206).
  - Nacht: één warme straatlantaarn (2000 K, 6 m hoog, 4 m opzij), automatische belichting en `himmel05`. De kleuren in het nadir zijn bijna zwart (A = 0, B = 5,5,10, C = 2,2,5).
  - `core/bus3domgeving.ts` (:54-57) krijgt twee hemels en drie `lightcolor`-blokken (~60 regels); `shaders.ts` krijgt één puntlicht (~30 regels).

### 4.12 Camera

Aanvullingen op `bus3d/camera.ts` (~170 regels):
- orthografische aanzichten Links, Rechts, Voor, Achter en Dak (toetsen 1-5), Schuin (6), F voor inpassen;
- de bediening van §2.3;
- dichterbij tot 0,1× de inpasafstand; nu ligt de grens op 0,55-2,5 bij minstens 8 m (camera.ts:34-35, :134);
- dubbelklik centreert op het aangewezen punt;
- de tweede viewport voor de andere kant (§4.8).

### 4.13 Snelheid en geheugen

**Per wijziging:** samenstellen (≤ 1,2 ms bij 4096², 32 lagen, gewoon pad), uitvloeien (0,14 ms) en mips (0,12 ms). Alles kan dus elk beeld opnieuw, ook tijdens het slepen (S§4).

**Geheugen per doel van 4096²** (C2). Dit is herberekend; KR punt 12 wees op 8 MB voor het masker waar 32 MB bij 4096×2048 hoort.

| Wat | Volle stand | Lichte stand |
|---|---|---|
| Basis: de eigen textuur van de plek op doelmaat. TGA wordt RGBA8 **zonder mips** (alleen texel voor texel gelezen); DXT blijft gecomprimeerd (texturen.ts:9-24) | 64 (DXT5: 16) | 16 (4) |
| Resultaat SRGB8_ALPHA8 met mips | 85 | 21 |
| Sjabloon: AD+MA en MU in 2× RGBA8 (sjablonen zijn er tot 2048²) | 0 (bij 2048²: 32) | 8 |
| Maskerkaart RGBA8 (vol: halve maat; licht: kwart) | 16 | 4 |
| JFA RG16UI | 16 | 4 |
| Per penseellaag RGBA8 | 16 | 4 |
| Dekking gedeelde texels (alleen bij ≥ 1% gedeeld) | 0-16 | 0-4 |
| Laknet | 6 | 6 |
| **Per doel** | **≈ 203** (+16 per extra penseellaag) | **≈ 55** |

**Gedeeld over alle doelen:** decal-array ≤ 16 per beeld, dieptebeeld van de camera 8 MB, dieptekaarten voor het masker 8 MB tijdelijk.

**Voorbeelden:**
- C2 GN, met main en trail in beeld (de Hybrid-achterwagen alleen bij [Bekijk] of de export): **volle stand ≈ 430 MB, lichte ≈ 135 MB** boven de rest van de viewer.
- NLC (4096×2048): ≈ 125 MB.
- De viewer zelf gebruikt 146-294 MB (B§3, bus3d.md:856-865).

**De lichte stand geldt:**
- zolang OMSI draait, net als de viewer (ONS/src/shared/bus3d.ts, `Bus3dVensterStand.licht`);
- als de volle stand boven 500 MB zou komen;
- na een contextverlies. Dan herstart de studio in de lichte stand en het ontwerp is bewaard.

**Wat de lichte stand betekent:** beeld op halve scherpte (`ls.licht`). De export is altijd op volle maat.

**Budget:** de lakdoelen staan buiten het textuurplan (texturen.ts:191-223). De andere texturen krijgen 96 MB (werker.ts:249).

### 4.14 De export

1. **Per doel na elkaar**, ook voor de familieleden. De werker laadt het net en de maskers van de bakker uit de Bus3D-pakketcache, zonder het te tonen.
2. **Volle maat in tegels van 2048²** (4 bij 4096²):
   - per tegel het masker (de 52 dieptekaarten opnieuw per tegel), de JFA met een rand van 64 texels, de lagen, en de penseellagen opnieuw afgespeeld uit hun vectoren;
   - verder dan 64 texels van een eiland wordt gevuld uit de JFA van de bewerkmaat, opgeschaald;
   - mips per tegel tot 1 px, de bovenste niveaus op de processor uit het samengevoegde niveau;
   - maten die geen macht van 2 zijn (O530 2500×1300, Urbanway 4168×2600) in één keer, zonder tegels. Dat is hooguit ≈ 58 MB.
3. **Uitlezen met een PBO** (`PIXEL_PACK_BUFFER` + `fenceSync`, WebGL2-kern), per tegel.
4. **Coderen in N codeerwerkers** (N = min(4, hardwareConcurrency − 2), minstens 1), in banden van 64 blokrijen per niveau.
   - **BC3** als ergens in de keten van de basis een alfa < 255 staat, anders **BC1** (NL202, NLC, SD77_02).
   - BC1 altijd in de 4-kleurenmodus (c0 > c1; bij c0 == c1 alleen index 0; K/ontw-bc3.cjs:50-54), dus nooit doorzichtig zwart.
5. **`_#low`** is de keten vanaf niveau 1, dezelfde blokken zonder opnieuw te coderen.
6. **Tijd:**
   - BC3 kost 54-65 ms per Mpx in één draad (K/ontw-bc3.out.txt); 4096² met mips is 22,4 Mpx.
   - C2 GN (3 doelen): ≈ 3,6-4,4 s processortijd, met 4 werkers ≈ 1,0-1,2 s, plus maskers, uitlezen en het laden van de Hybrid.
   - **Eis (P3): C2 GN ≤ 4 s en SD77 ≤ 1 s.** §2.1 is daarop afgestemd (KR punt 13).
7. De bytes gaan overgedragen naar main, en main controleert ze (§5.6).

---

## 5. Opslaan als OMSI-kleurstelling

### 5.1 Welke bestanden, waar

Voorbeeld: C2 E6 GN, eigen lak nummer 7.

```
OMSI/Vehicles/MB_C2_EN_BVG/Texture/Repaints/rep_GN/        ← CTC-map, vanaf de busmap
  ~Lakstudio_0007_stadtwerke-lucstad.cti                    ← nieuw, als laatste geschreven
  Lakstudio/0007_stadtwerke-lucstad/
    C2E6_Wagenkasten_main_3fa9c1d2.dds          (+ _#low.dds)   BC3 4096², volle keten
    C2E6_Wagenkasten_trail_91b0e4aa.dds         (+ _#low.dds)
    C2E6_Wagenkasten_Hybrid_trail_5c20d7e1.dds  (+ _#low.dds)
```

**Waar het staat:**
- De `.cti` staat **in** de CTC-map zelf. OMSI zoekt `<voertuigmap><CTC-map>\*.cti` en kijkt niet in submappen (EXE@0x5F0C37-0x5F0CEA).
- Texturen mogen in een submap. Het pad is `<voertuigmap> + <CTC-map> + "\" + regel 3` (EXE@0x5F107C-0x5F10F9). Gemeten is tot 3 mappen diep (R§B2).
- Leest de familie meer dan één CTC-map, zoals een gelede bus met twee mappen, dan komt er een `.cti` met **dezelfde naam** in elke map. Elk bevat alleen de items voor de cfg's die die map lezen.
- Bestaat de CTC-map niet (C2 E5 GN), dan wordt hij aangemaakt. De cfg blijft onaangeroerd.

**Namen:**
- **`~Lakstudio_<nnnn>_<slug>.cti`:**
  - `~` (0x7E) sorteert na alle letters en na `_` (`opNaam`, ONS/src/core/kleurstelling.ts:53-58). Nummers van bestaande kleurstellingen verschuiven dus niet (R§C3).
  - Van de 994 `.cti`'s bij Luc begint er geen met een teken na `~` (A3).
  - `nnnn` volgt §5.8.
- **`slug`:** ASCII `[a-z0-9-]`, hooguit 32 tekens.
- **Texturen:** `<standaardtextuur>_<8 hex van sha1(dds)>.dds`. Elke versie heeft dus een andere naam, en alle caches op pad en id vervallen vanzelf: het pakket, `lakStempel` (ONS/src/core/bus3d.ts:1276-1283) en de werker.
  - We noemen in de `.cti` meteen `.dds`, zodat geen oudere `.dds` met dezelfde basisnaam voorgaat (R§B3, EXE@0x7F7962-0x7F79E8).
- **`_#low`:** `<naam>_#low.dds`. OMSI laadt dat alleen als het bestand bestaat (EXE@0x7F89D0-0x7F8AAB).
  - Meegeleverd bij een lange zijde ≥ 2048, en altijd als een cfg een `_#low`-plek heeft (HH20).
- `~` en `#` komen door `veiligPad` (ONS/src/core/zip.ts:106-123) en `isRommel`.

### 5.2 De naam van de kleurstelling

Een pure functie `naamFout(naam, bestaand)` in `src/shared/lak.ts` toetst de naam:
- 1-48 tekens, alleen tekens die in cp1252 bestaan. ASCII heeft de voorkeur. OMSI leest de `.cti` als ANSI (R§B2).
- Geen spatie of tab aan het begin of eind, geen regeleinde, geen stuurteken, niet beginnend met `[`.
- **Uniek in elke CTC-map van de familie na ASCII-`UpperCase`.**
  - OMSI vergelijkt plek, naam en setvar-variabele na een omzetting die alleen a-z hoofdletters maakt (0x421374, aangeroepen op 0x7F633C en 0x7F6410/0x5F0EC2; KR/zoek.txt). OMSI trimt niet. ä en Ä blijven verschillend.
  - Een naam die alleen in hoofdletters verschilt, voegt twee kleurstellingen samen (HHA12.cti:98 en :103, "braungold"/"Braungold"; KR/hoofdletters.out.txt).
- Niet "Standaard", "Standard" of "Default", zonder op hoofdletters te letten.
- **Stabiel:** opnieuw opslaan houdt de naam. Een andere naam is een nieuwe kleurstelling.

**Vooringevuld:**
- de bedrijfsnaam in het busbedrijf, anders "Mijn lak N";
- tekens buiten cp1252 worden bij het invullen omgezet: NFKD zonder accenttekens ("Łódź" → "Lodz"), wat daarna nog ontbreekt valt weg.

### 5.3 De textuur

**Formaat:** DDS met een klassieke DX9-kop.
- `'DDS '` + 124 bytes, flags `CAPS|HEIGHT|WIDTH|PIXELFORMAT|MIPMAPCOUNT|LINEARSIZE`.
- `ddspf` FOURCC `DXT5` of `DXT1`.
- Caps `TEXTURE|COMPLEX|MIPMAP`.
- Geen DX10-kop en geen BC7 (https://github.com/brokenphilip/OMSI_Errors/issues/2; https://github.com/microsoft/DirectXTex/wiki/Texconv).
- De volle mipketen maken we zelf, lineair gefilterd (OMSI zou met een boxfilter aanvullen, EXE@0x7F8B18-0x7F908E).

**BC3 of BC1:** per keten, volgens §4.14, punt 4.

**Encoder:** `src/shared/bcn.ts`, puur.
- Kleurblok: PCA-as met machtsiteratie, eindpunten met 1/16 inzet, indices op gewogen afstand.
- Alfablok: 8 niveaus.

| Lak | BC1 | BC3 | PSNR RGB | PSNR alfa |
|---|---|---|---|---|
| HH20 newC2EG, 2048² | 122 ms | 271 ms | 35,7 dB | 59,8 dB |
| O530 01white, 2500×1300 | 75 ms | 177 ms | 37,2 dB | 54,6 dB |

**Maat:**
- de maat van de textuur die de start op die plek legt, en minstens die van de standaard;
- afgerond omlaag op een veelvoud van 4 (4170 → 4168);
- hooguit 4096 aan de lange zijde;
- OMSI laadt ook maten die geen macht van 2 zijn (R§B3; K/rp_d3dx.out.txt).

**Geheugen in OMSI** voor 4096×2048: BC3 met mips ≈ 11 MB, tegen 43 MB als TGA32. Luc heeft `[texmemlimit] 400.0` (OMSI/options.cfg:93-97).

### 5.4 De `.cti`: exacte regels

Pure functie `ctiTekst(project, familie, opties)` in `src/shared/lak.ts`, geschreven met iconv-lite naar cp1252.

1. **De vorm:** cp1252, geen BOM, elke regel eindigt op CRLF, ook de laatste.
2. **Een kop van commentaarregels met sterretjes.** OMSI slaat alles over wat niet precies `[item]` of `[setvar]` is.
3. **`[item]` en `[setvar]`** precies zo, zonder witruimte ervoor of erna (R§B2).
4. **Een `[item]`** heeft drie regels: de naam (in elk item gelijk), de plek (spelling uit de cfg) en het pad relatief aan de CTC-map, met backslashes.
5. **Items in deze volgorde:**
   - a. per doel een item voor **elke plek-naam** in de familie die die standaardtextuur heeft. Elke plek-naam komt één keer voor; de vergelijking is na `UpperCase`;
   - b. de meeliftende `_#low`-plekken;
   - c. bij "Deze lak precies" en "Effen in de kleuren van deze lak": de **andere** plekken van de start (interieur, stoelen, velgen), met hun eigen relatieve pad. Die bestanden worden niet gekopieerd; ze worden afhankelijkheden in het register;
   - d. **niet:** glasplekken, en items waarvan de plek bestaat in een familielid dat niet gebakken kan worden (§3.1, punt 7).
6. **Een `[setvar]`** heeft twee regels: de variabele en een getal met een punt als decimaalteken. De inhoud komt uit de busopties (§4.9).
7. **De setvar-regel:** setvars alleen als **elke** cfg die de map leest minstens één van onze items aanneemt, en alle setvars **na** alle items.
   - Een setvar hangt aan het laatst aangenomen item. Die toestand (ebp-0x440) wordt alleen gezet op 0x5F039C, 0x5F080E, 0x5F0EC7 en 0x5F0F09, en springt tussen bestanden **niet** terug (KR/zoek.txt).
   - De regel is dus nodig en voldoende.
   - Wordt hij niet gehaald: geen setvars, `ls.opties` en een regel in het logboek.
8. **Geen sorteervoorvoegsel in de naam, geen `..\`, geen absolute paden.**

**Voorbeeld** (C2 E6 GN, start "Effen in de kleuren van BVG"). Namen van plekken, bestanden en variabelen zijn ter illustratie.

```
****************************************************************
 Eigen kleurstelling uit de Lakstudio (Omsi-Hub), nr. 0007
 Gemaakt 30-09-2026. Niet met de hand wijzigen.
****************************************************************

[item]
Stadtwerke Lucstad
farbschema_tex1_main
Lakstudio\0007_stadtwerke-lucstad\C2E6_Wagenkasten_main_3fa9c1d2.dds

[item]
Stadtwerke Lucstad
farbschema_tex1_trail
Lakstudio\0007_stadtwerke-lucstad\C2E6_Wagenkasten_trail_91b0e4aa.dds

[item]
Stadtwerke Lucstad
farbschema_tex1_trail_Hybrid
Lakstudio\0007_stadtwerke-lucstad\C2E6_Wagenkasten_Hybrid_trail_5c20d7e1.dds

[item]
Stadtwerke Lucstad
farbschema_interieur
BVG\C2_Innen_BVG.dds

[setvar]
vis_spiegel_typ
1
```

**Het nummer:** de positie volgens de regels van Omsi.exe: bestanden in NTFS-volgorde, daarbinnen van boven naar beneden, alleen items met een bestaande plek, namen samengevoegd na `UpperCase` (R§B2, KR punt 3).
- Omdat onze `.cti` achteraan sorteert, is het nummer gelijk aan het aantal bestaande kleurstellingen van die cfg.
- De app zoekt altijd op naam (`kleurVars`, index.ts:4297-4315) en rekent het nummer elke keer opnieuw uit.

### 5.5 Controles vóór het plaatsen (`lakPlan`)

1. De naam is geldig en vrij na `UpperCase` in **alle** CTC-mappen van de familie.
2. De familie is rond. Elk lid is gebakken, liftend mee, of uitgesloten met al zijn items weg (§3.1).
3. Er is geen plekconflict op een gebakken plek (§3.5).
4. De setvar-regel geldt (§5.4, punt 7), of de setvars vallen weg.
5. Alle doelpaden zijn nieuw en `magSchrijven` (ONS/src/core/addon.ts:367; nooit een programma, `NOOIT` :356).
6. Er is genoeg schijfruimte (`ruimteVoor`, :681).
7. De DDS'en zijn geldig: kop, maat gelijk aan het doel, keten volledig.
8. De afhankelijke bestanden bestaan.
9. De grendel is vrij (§5.6), anders `'bezig'`.
10. OMSI draait niet. Draait het wel, dan klaarzetten (§5.7).

### 5.6 Plaatsen, opnieuw opslaan en verwijderen

We hergebruiken de add-on-manager zonder nieuwe schrijfcode: `openBron` (addon.ts:129), `planStappen` (:539), `installeerStappen` (:750, met terugdraaien :809-844), `registreer` (:873) en `verwijderStappen` (:919).

**Grendel.** `eenTegelijk` zit nu binnen de add-on-IPC (ONS/src/main/index.ts:6625). Hij gaat naar een eigen module `src/main/grendel.ts`, en de add-ons en `lak:plaats`/`lak:verwijder`/de wachtrij gebruiken hem alle drie (KR punt 17).

**Plaatsen** (`core/lakstudio.ts`, `plaatsLak`):
1. De grendel pakken; OMSI draait niet (anders §5.7).
2. De bytes uit de werker controleren (§5.5, punt 7).
3. Een **staging** schrijven in `userData/lakstudio/<id>/versies/<v>/Vehicles/...`, met paden die main zelf maakt, plus de `.cti`.
4. `openBron(staging)` + `planStappen`, met twee harde eisen:
   - de doelen van `plan.regels` zijn **precies** de verwachte set;
   - elke regel heeft `staat === 'nieuw'`.
   - Anders wordt er niets geschreven (`'bestaat'`). De reservekopie (:792-800) komt zo nooit in actie.
5. **Volgorde:** `plan.regels` sorteren met de texturen eerst en de `.cti` **als laatste**. `installeerStappen` volgt die volgorde (addon.ts:763-790). Stopt het plaatsen halverwege, of start OMSI tijdens het schrijven, dan ziet OMSI nooit een `.cti` die naar een ontbrekend bestand wijst.
   - In het register staat de `.cti` **voorop** in `bestanden`, zodat verwijderen hem eerst weghaalt.
6. `installeerStappen` en `registreer`. `Addon` (:394-403) krijgt `soort?: 'lak'` en `lak?: { projectId; naam; bus; familie: string[]; ctcMappen: string[]; versie: number; afhankelijk: string[] }`.
7. **Vergeten:** foto v4 (`sha1(pad|kleurstelling)`, main/busfoto4.ts:63-66), foto v3b (main/busfoto.ts:84-88) en het heldenbeeld (core/bus3dcache.ts:341-344), voor elke `.bus` van de familie. Daarvoor komt er een nieuwe functie `vergeetKleurstelling(bussen, naam)`.
8. De gebeurtenis `bus:kleurstellingenVeranderd` (met de relatieve paden) naar beide vensters. De cache van `kleurstelling.ts` ziet de nieuwe `.cti` vanzelf (vingerafdruk, :60-74).

**Opnieuw opslaan** (versie v → v+1):
1. De nieuwe export heeft nieuwe textuurnamen.
2. **Eerst alles controleren** (KR punt 16). `controleerStappen(addon)` is het controlegedeelte van `verwijderStappen` (sha1 per bestand, :941-944), zonder iets weg te halen.
   - Is iets met de hand veranderd, dan wordt **niets** aangeraakt. `ls.handmatig` volgt met [Wijziging weggooien en opslaan], [Als nieuwe lak opslaan] en [Annuleren].
3. `verwijderStappen(v)`, met de `.cti` eerst.
4. Plaatsen zoals hierboven.
5. Mislukt stap 4, dan wordt v teruggezet uit zijn eigen staging. De laatst geplaatste staging bewaren we daarvoor.

De `.cti` houdt dezelfde bestandsnaam en dus hetzelfde nummer.

**Verwijderen** (vanuit Addons of de studio):
1. `lak:gebruik(naam)`: rijden er eigen bussen in, dan eerst `ls.gebruik`.
2. Eerst alles controleren. Is iets veranderd, dan `ls.handmatig` met [Alles weghalen] en [Alles laten staan].
3. `verwijderStappen`, vergeten, de gebeurtenis, en lege mappen opruimen.
4. Het ontwerp blijft in userData, tenzij "ook het ontwerp weggooien" is aangevinkt.

**Afhankelijkheden:**
- Verwijdert de speler het pakket van de start, dan waarschuwt de add-on-manager: "Eigen kleurstelling '…' gebruikt 3 bestanden uit dit pakket".
- Bij het openen kijkt de studio of die bestanden er nog zijn.

**Addons.tsx** toont `soort: 'lak'` onder "Eigen kleurstellingen", met [Bewerken] en [Verwijderen], plus wachtende lakken (§5.7) en weesbestanden (§5.8).

### 5.7 Klaarzetten terwijl OMSI draait

De app is een overlay naast OMSI, dus OMSI draait meestal (KR punt 22).

**Wanneer:** [Opslaan in OMSI] terwijl `isOmsiRunning` waar is (index.ts:1029). De knop heet dan [Klaarzetten voor OMSI].

**Wat er gebeurt:**
- de export;
- alle controles van `lakPlan` behalve "OMSI draait niet";
- de staging;
- een regel in `userData/lakstudio/wachtrij.json` (via `schrijfVeilig`).

**Wanneer er geplaatst wordt:**
- a. zodra main ziet dat OMSI dicht is (de bestaande controle elke halve minuut, `omsiDraaide`, index.ts:488-489);
- b. bij het starten van de app als OMSI niet draait;
- c. vlak voordat de app zelf OMSI start (`launchOmsi`, index.ts:96), vóór de situatie geschreven wordt. Zo vindt `kleurVars` de naam.

**Vóór het plaatsen:**
- `lakPlan` opnieuw, en OMSI nog eens nagaan vlak voor het eerste bestand.
- Faalt er iets, zoals een naam die intussen bezet is of een bestand dat al bestaat, dan blijft de lak in de wachtrij met de reden in Addons, en volgt een melding.
- Gelukt: `ls.geplaatst`.

**Tijdens het wachten:**
- De studio toont "Klaargezet".
- Addons toont "Wacht op OMSI" met [Niet plaatsen].
- `busKleurstellingen` geeft de naam met `wacht: true` (label `ls.wacht`). Overspuiten mag al; de bus staat die dag toch in de werkplaats (CLOUD:452-456).
- Wordt er een dienst klaargezet terwijl de lak nog wacht, dan vindt `kleurVars` de naam niet. De bus rijdt dan zonder gekozen kleurstelling, zoals nu (index.ts:4302-4305), en de app meldt dat.

**Of dit vanzelf mag, is beslissing 4.**

### 5.8 Teller, register en weesbestanden

Het register en de teller horen bij één userData. `adoptOldProfiles` kopieert (index.ts:6884-6895), en de draagbare versie heeft een eigen userData (KR punt 20). Daarom:
- **`nnnn`** = max(teller in `userData/lakstudio/teller.json`, hoogste `nnnn` van `~Lakstudio_*.cti` in de mappen van de familie) + 1. Een nieuwe lak sorteert zo in elke map na de oudere.
- **`eigen`** komt uit de bestandsnaam `~Lakstudio_`, niet uit het register. Een lak uit een andere installatie telt dus ook mee.
- **Weesbestanden** zijn een `~Lakstudio_*.cti` met onze kop, zonder regel in dit register.
  - Addons toont ze met `ls.wees`, plus [Verwijderen] (na bevestiging alleen die `.cti` en de bestanden die hij noemt onder `Lakstudio\<nnnn>_<slug>\`) en [Overnemen] (registreren met de huidige sha1's; bewerken kan alleen als het project er is).
- **Het hernoemplan naar Omsi-Hub** neemt `userData/lakstudio/` mee.

---

## 6. Koppeling met het busbedrijf (deel F, cloudtak)

**Wat F al ontwierp:**
- `EigenBus.kleurstelling?: string` (CLOUD:239);
- `{ soort: 'overspuiten'; kleurstelling }` (CLOUD:287);
- overspuiten kost 2,5% van de nieuwwaarde (€ 1.500 solo, € 2.100 geleed), met een dag werkplaats (CLOUD:452-456);
- [3D] met kleurstalen, waarna [Overspuiten] actief wordt (CLOUD:745-751);
- `lak = kleurstelling` gaat naar `prepareSituation` (CLOUD:1052).

**Gevolg:** een eigen lak werkt meteen als naam, en `kleurVars` schrijft het nummer en de setvars.

**Deel F bestaat nog niet.** `origin/claude/awesome-wozniak-f2svst` (d77087d) heeft geen `wagenpark.ts` en geen `dealer.ts` (KR punt 27). Wat F nodig heeft, zetten wij daarom al in L2 klaar.

| # | Wat | Wie |
|---|---|---|
| 1 | `eigen?: true` en `wacht?: true` in `Bus3dKleurlijst.lijst[i]` (ONS/src/shared/bus3d.ts:272-275) en in `BusKleurstellingen`. `eigen` komt uit de bestandsnaam en geldt alleen als alle delen van die .bus de naam met al hun lakplekken hebben (§3.1). | lokaal (L2) |
| 2 | **"+ Eigen lak"** in het 3D-venster (§4.1). Na opslaan stuurt het venster de gewone `Bus3dKeuze` met de nieuwe naam, en [Overspuiten € …] wordt actief. Geen UI-werk in de cloud en geen nieuw terugkanaal (KR punt 26). | lokaal (L3) |
| 3 | De gebeurtenis `bus:kleurstellingenVeranderd`. Wagenpark en dealer verversen hun lijst. | lokaal zendt (L2), cloud luistert (één regel) |
| 4 | `bussenInKleurstelling(bussen, relatiefPad, naam): number[]`, puur en structureel getypeerd, in `src/shared/lak.ts`. Wordt gebruikt voor `ls.gebruik` vóór het verwijderen. Het stille wissen van F (CLOUD:990) blijft het vangnet. | lokaal (L2), cloud mag hem gebruiken |
| 5 | **Occasions:** eigen lakken uitsluiten **vóórdat** n geteld wordt in `lijst[floor(kleurZaad × n)]` (CLOUD:492). Anders krijgt een al getoonde occasion een andere kleur zodra er een eigen lak bijkomt. Bij dealer en overspuiten staat de groep "Eigen" bovenaan. | cloud |
| 6 | Huiskleuren in het kleurenpaneel en bij Snelle lak, uit `lak.bedrijf.kleuren`, zodra de cloud die heeft. | lokaal leest (L5) |
| 7 | **Huisstijl** (fase 2, **beslissing 1**): `Huisstijl { naam; kleuren: [string, string, string]; logo?: beeld-id; recept?: LakRecept }` in het bedrijf, met een scherm "Huisstijl". Het recept wordt per model toegepast met de code van Snelle lak. | cloud (data, scherm) + lokaal (recept, af in L3) |
| 8 | **Vloot overspuiten:** [Alle {n} bussen van dit model overspuiten] als reeks F-acties, met het totaal vooraf en elke bus een dag werkplaats. | cloud |
| 9 | **KI-bussen:** 6 van de 12 .bus die rep_GN lezen zijn KI (KR/gn.cjs). Die kunnen de eigen lak ook dragen. Dat staat in `ls.klaar`. Of OMSI voor KI willekeurig een kleurstelling kiest, kijkt P10 na. | lokaal |

**Huisstijl als recept.** Een recept bevat alleen wat per model klopt:
- zones op rang (de grootste zone krijgt kleur 1);
- stroken ten opzichte van de doos en de raamlijn;
- tekst en logo per zijde als fractie van de lengte.

Dat is precies Snelle lak (KR punt 24), dus de rekencode staat in fase 1. Wat fase 2 toevoegt, is het bewaren per bedrijf en het toepassen op de hele vloot. F liet "Huisstijl per CTC-map" bewust weg (CLOUD:1399, :1413). Dit is iets anders, een recept per bedrijf, en daarom beslissing 1.

**Contract** (`src/shared/lak.ts`, lokaal gemaakt, door de cloud gelezen):
- `LakRecept`, `Huisstijl`, `naamFout`, `ctiTekst` en `bussenInKleurstelling`;
- de IPC-namen uit §8;
- de velden `eigen` en `wacht`.

De cloud bouwt F zonder WebGL en zonder OMSI, met omheinde blokken `// --- lakstudio ---` in gedeelde bestanden en vier talen (CLOUD:207-212).

---

## 7. Delen met anderen

**Standaard: het recept (`.omsilak`, fase 2).** Een zip met:
- `lak.json`: het project zonder id's en paden, plus de busherkenning (`relatiefPad`, sha1 en maat van de standaard-lakhuid, de naam van de start, de busopties);
- `beelden/<sha1>.png|jpg|svg`: alleen wat de speler zelf importeerde;
- `LEESMIJ.txt`.

**Geen bytes uit de OMSI-map**, dus ook geen .rpc-sjablonen. P12 controleert dat met sha1 tegen alle bestanden van de bus.

**Importeren:**
- Via "Ontwerp openen…" of door het bestand op het venster te slepen. `openBron` herkent `.omsilak` en stuurt het door naar de studio.
- De ontvanger bouwt de lak opnieuw uit zijn eigen installatie.
- Wijkt de sha1 van de lakhuid af, dan een waarschuwing, en toch openen.
- **Lettertypen:** OFL-lettertypen leveren we mee en gaan op naam. Windows-lettertypen gaan op familienaam; ontbreekt er een, dan `ls.lettertype`.

**Waarom alleen het recept:**
- MAN Standardbus II: "no original files are published" (R§B8, rp_pdf/…Standardbus…en.pdf.txt:995-1003).
- Coach O560: alleen voor persoonlijk gebruik (:643-652).
- Repaintpack Ahlheim: "Bestandteile … dürfen nicht weiterverwendet werden" (rp_pdf/Ahlheim_5_…:131-133).
- WebDisk: ook een gewijzigd werk is afgeleid werk (R§B8).
- Onze lak is afgeleid van de originele textuur (R§C11).

**Een OMSI-repaint-zip** is **beslissing 2**. Een voorwaarde als "onversleuteld" zegt niets over de licentie: ABCoach_O560 heeft 1868 o3d's, alle onversleuteld, en toch staat de licentie alleen persoonlijk gebruik toe (KR/sleutels.cjs; KR punt 21). Zegt Luc ja, dan alleen:
- voor add-ons op een **lijst met bekende licenties** die herverdelen van afgeleid werk toestaan, niet op grond van de sleutel;
- met de start "Effen" of "Standaard";
- met het vinkje "Ik mag deze afgeleide textuur delen volgens de licentie van de maker".

**Lettertypen en beelden** (S§2.9):
- OFL-lettertypen leveren we ongewijzigd mee, met licentie in `resources/fonts/`, zonder subsetting (https://openfontlicense.org/ofl-faq/).
- Kandidaten: D-DIN (https://www.fontsquirrel.com/license/d-din) en Gidole. Alte DIN 1451 alleen na een licentiecheck (https://www.peter-wiegel.de/alteDin1451.html toont geen licentietekst).
- Windows-lettertypen alleen om mee te renderen (https://learn.microsoft.com/en-us/typography/fonts/font-faq). De lijst komt uit `queryLocalFonts()` (https://github.com/electron/electron/issues/39140); de terugval is `C:\Windows\Fonts`.
- Bij het importeren van een beeld: `ls.logo`.

---

## 8. Bestanden en modules

| Bestand | Nieuw of aangepast | Wat | Regels (schatting) |
|---|---|---|---|
| `src/core/kleurstelling.ts` | aangepast (L0) | Lezen zoals Omsi.exe (§10 L0, zes regels); basis = busmap | 60 |
| `src/main/index.ts` (`kleurVars`) | aangepast (L0) | Zoeken als OMSI (`UpperCase`, niet getrimd), met terugval op getrimd voor oude profielen | 15 |
| `src/shared/lak.ts` | nieuw | Typen (`LakProject`, `Laag`, `LakDoel`, `LakFamilie`, `LakRecept`, `Huisstijl`), `naamFout`, `ctiTekst`, slug, cp1252-omzetting, `bussenInKleurstelling` | 450 |
| `src/shared/bcn.ts` | nieuw | BC1/BC3-encoder, puur | 300 |
| `src/shared/dds.ts` | nieuw | DX9-DDS schrijven | 60 |
| `src/core/lakfamilie.ts` | nieuw | Familie, doelen, meeliften, conflicten, .rpc zoeken en koppelen, busopties indelen | 400 |
| `src/core/lakstudio.ts` | nieuw | Projecten, `lakPlan`, staging, plaatsen, controleren, verwijderen, wachtrij, teller, wezen | 600 |
| `src/main/grendel.ts` | nieuw | `eenTegelijk` uit index.ts:6625 | 30 |
| `src/main/lakstudio.ts` | nieuw | IPC en bewaking (zie hieronder), klaarzetten na OMSI, vóór `launchOmsi` | 250 |
| `…/bus3d/lak/lakdoek.ts` | nieuw | Laknet, maskers (twee marges), JFA, twee samenstelpaden, override `voorPlek`, familielid laden | 800 |
| `…/lak/lakshaders.ts` | nieuw | UV-raster, lagen, detailfunctie (sjabloon en eigen), JFA, maskers, MAX-dekking, pick | 550 |
| `…/lak/kiezen.ts` | nieuw | Pick-pass, onderdeel en deur | 170 |
| `…/lak/zones.ts` | nieuw | k-means in Lab, raamlijn | 170 |
| `…/lak/recept.ts` | nieuw | Snelle lak en huisstijl → lagen (puur) | 250 |
| `…/lak/tekst.ts` | nieuw | FontFace en OffscreenCanvas | 120 |
| `…/lak/penseel.ts` | nieuw | Stippen, dieptebeeld per camerastand, opnieuw afspelen | 220 |
| `…/lak/export.ts` + `codeer.ts` | nieuw | Tegels, PBO, codeerwerkers → `bcn` → `dds` | 250 |
| `…/lak/lagen.ts` | nieuw | Reducer en geschiedenis (puur, 500 stappen) | 200 |
| `…/bus3d/werker.ts`, `berichten.ts`, `texturen.ts`, `camera.ts` | aangepast | Berichten, override, vlag voor het heldenbeeld, camera, tweede viewport, wissel uitstellen | 380 |
| `…/bus3d/Lakstudio.tsx`, `SnelleLak.tsx`, `LakGereedschap.tsx`, `LakLagen.tsx`, `LakKleur.tsx`, `Busopties.tsx`, `lakstudio.css` | nieuw | UI | 1900-2300 |
| `…/bus3d/Kleurstalen` (bestaand) | aangepast | Tegel "+ Eigen lak", groep "Eigen", label "wacht" | 40 |
| `src/core/busrust.ts` / `bus:lak3d` | aangepast | Ruststand met extra setvars (busopties) | 30 |
| `src/core/addon.ts` | aangepast | `soort: 'lak'`, `lak`, `controleerStappen`, afhankelijkheden, `.omsilak` (fase 2) | 80 |
| `src/core/bus3dcache.ts`, `src/main/busfoto4.ts`, `src/main/busfoto.ts` | aangepast | `vergeetKleurstelling` | 60 |
| `src/preload/bus3d.ts` | aangepast | Smalle aanroepen, **zonder paden** (bus3d.md:643-644) | 30 |
| `src/shared/bus3d.ts` | aangepast | `'lakstudio'`, `lak?`, `eigen?`, `wacht?` | 25 |
| `src/renderer/src/Addons.tsx` | aangepast | "Eigen kleurstellingen", wachtend, weesbestanden | 90 |
| `src/shared/tekst/lakstudio.ts` | nieuw | `TEKST_LAKSTUDIO`, 4 talen | 300 |
| `src/core/bus3domgeving.ts`, `shaders.ts` | aangepast (L5) | Schemer en Nacht | 90 |
| `resources/fonts/*` | nieuw | OFL-set met licenties | — |
| Proeven (`*.test.ts`, `probe-lakstudio.cjs`) | nieuw | §9 | 800 |

**Totaal:** ongeveer 7.000-7.500 regels over alle fasen, waarvan ≈ 6.500 in L0-L4. Dat is meer dan de eerste schatting (5.500-6.000) door familie, sjablonen, busopties, klaarzetten, Snelle lak en het gedeelde pad.

**IPC.** Main is de enige die paden kent. Elk `lak:`-kanaal wordt bewaakt (KR punt 18):
- **Kanalen van de studio:** alleen als `vanVenster(e)` (ONS/src/main/bus3dvenster.ts:117-118) **en** het venster nu in doel `'lakstudio'` staat. Het verborgen fotovenster laadt dezelfde brug (ONS/src/preload/bus3d.ts:19-22), maar is een ander webContents.
- **Kanalen van Addons:** alleen als `vanHoofd(e)` (:109-112).

| Kanaal | Van | Doet |
|---|---|---|
| `lak:projecten(relatiefPad)` | studio | lijst van projecten |
| `lak:doelen(relatiefPad)` | studio | familie; per doel: id, plek-namen, textuur-id, maat, alfasoort, sjabloon-ids, meeliftend, "niet op" met reden, conflicten, bestaande namen |
| `lak:opties(relatiefPad)` | studio | busopties: variabele, indeling, waarden, meshes |
| `bus:lak3d(pakket, kleurstelling, extraVars?)` | studio | ruststand met busopties |
| `lak:laad(id)` / `lak:bewaar(project)` | studio | project laden en bewaren |
| `lak:beeld(bytes) → { id, soort, b, h }` / `lak:beeldBytes(projectId, beeldId)` | studio | beelden |
| `lak:naamVrij(projectId, naam)` | studio | naam toetsen |
| `lak:plaats(projectId, naam, texturen[])` | studio | → `{ ok, index }`, `{ klaargezet: true }` of `{ fout: 'naam'\|'bestaat'\|'ruimte'\|'conflict'\|'formaat'\|'handmatig'\|'bezig' }` |
| `lak:verwijder(projectId, ookOntwerp, keuze?)` | studio, Addons | verwijderen, met de keuze na `ls.handmatig` |
| `lak:gebruik(naam)` | studio, Addons | eigen bussen in die lak |
| `lak:lijst()` / `lak:wachtrij()` / `lak:nietPlaatsen(projectId)` | Addons | overzicht, wachtrij |
| `lak:wezen()` / `lak:weesWeg(id)` / `lak:weesOvernemen(id)` | Addons | weesbestanden |
| `lak:exporteer(projectId)` / `lak:importeer()` | studio | dialogen in main (fase 2) |
| gebeurtenis `bus:kleurstellingenVeranderd` | main | naar beide vensters |
| gebeurtenis `lak:geplaatst` | main | wachtrij klaar, naar beide vensters |

---

## 9. Proeven met meetbare "klaar"-eisen

**Waar ze draaien:** P1, P8, P13 en P15 draaien tegen een **kopie** in een tijdelijke map (KR punt 19).
- De kopie bevat alleen de .bus/.cfg/.cti van de betrokken voertuigmap, met kleine nepbestanden voor de texturen. De planner kijkt alleen naar bestaan en sha1.
- `core/lakstudio.ts` en `lakfamilie.ts` krijgen de OMSI-map als parameter, net als addon.ts.
- Alleen P10 draait in de echte OMSI, door Luc.

| # | Proef | Klaar als |
|---|---|---|
| L0 | `kleurstelling.ts` gelijk aan Omsi.exe. Vitest, plus een onafhankelijke lezer: K/rp_index.py **zonder** `.strip()` (:38), **met** `UpperCase` en met de busmap als basis, over alle cfg's. | 0 cfg's wijken af. De gevallen: HHA12.cti telt 19 kleurstellingen (geen 20); NL263 Havelbus.cti en SL_SG RVH.cti/BBG.cti nemen de plek aan; de 90 namen met een spatie ervoor of erna houden die (" silber"); de KI-C2's vinden hun CTC-map. Oude profielen met een getrimde naam vinden hun lak via de terugval. |
| P1 | `.cti` schrijven voor de 11 bussen, plus de C2 GN Hybrid, de O530 3 Doors en de KI-C2's | De naam komt per cfg één keer voor (na `UpperCase`). Index = het aantal bestaande kleurstellingen. Elke cfg met de naam heeft al zijn lakplekken gevuld; geen enkele cfg heeft de naam zonder dat. Items van niet-gebakken leden ontbreken. Geen BOM, alleen CRLF, rondreis in cp1252 gelijk. Setvars alleen onder de regel van §5.4, punt 7, en na alle items. |
| P2 | DDS | `pakDxt` en `ontleedTextuur` (ONS/src/shared/beeldlezers.ts:216, :101) lezen elk niveau terug. Geen `DX10`, volle keten. PSNR RGB ≥ 35 dB en alfa ≥ 50 dB tegen de samengestelde RGBA8. `_#low` byte-gelijk aan niveau 1..n. BC1 alleen bij alfa overal 255 en altijd in de 4-kleurenmodus; NL202 wordt BC1. |
| P3 | Snelheid (Luc, RTX 4070 SUPER) | Gewoon pad met 32 lagen ≤ 4 ms bij 4096². Gedeeld pad op de HH20 (2048², 32 lagen) ≤ 6 ms. Slepen ≥ 50 fps. Maskers plus JFA ≤ 150 ms per doel (bewerkmaat). Zones ≤ 50 ms. Export C2 GN (3× 4096² BC3 met mips en `_#low`) ≤ 4 s, SD77 ≤ 1 s. Plaatsen ≤ 2 s. |
| P4 | Geheugen | C2 GN in de volle stand (1 penseellaag) ≤ 500 MB boven de viewer; NLC ≤ 300 MB. Lichte stand ≤ 160 MB. Zou de volle stand boven 500 MB komen, dan vanzelf de lichte stand. Met OMSI draaiend opent de studio licht. Na een geforceerd contextverlies (`WEBGL_lose_context`) herstart de studio licht, met het project intact. |
| P5 | Beschermen | NL202: een band van 0,4-1,6 m rondom verandert 0 texels die alleen stoelmeshes gebruiken. C2 Solo: 0 glastexels veranderd (RGB en A). Alle bussen: A van de uitvoer = A van de basis, op de BC3-kwantisatie na. **HH20 met `hide_hochbahn_ext` = 1: 0 texels oude lak onder de rechthoek van het opschrift.** **Op SD77, NL202 en HH20 komt het automatische masker (zonder sjabloon berekend) voor ≥ 97% overeen met MA** (op texels waar MA 0 of 1 is). Bij sjablonen is AL gelijk aan de alfa van de basis, of het verschil staat in het logboek. Het aantal lakmeshes met `[texcoordtrans]` is geteld; is het niet 0, dan zit het in de UV-gang. |
| P6 | Naden en mips | Met een felle testkleur als achtergrond: 0 texels op mip 3 met > 2% bijmenging. Beeld op 20 m zonder zichtbare naden (schermafdrukken van de 11 bussen). Tegelexport en export in één keer zijn byte-gelijk op niveau 0 van een 2048²-lak. |
| P7 | Spiegel en familie | Per bus ligt het vlak binnen 2 cm van het midden van `[boundingbox]`. Tekst links en de spiegel rechts zijn van buiten even leesbaar. HH20: een tekst op gedeelde texels krijgt geen kopie, `ls.spiegelschrift` verschijnt, en [Schuif naar een vrij stuk] brengt hem naar ≤ 2% gedeeld. De doos van elk familielid valt binnen 5 cm van die van de bakker. |
| P8 | Nooit overschrijven | (a) Een bestaand bestand op een doelpad geeft 0 schrijfacties en `'bestaat'`. (b) Na plaatsen en verwijderen is de sha1-boom van de betrokken mappen gelijk aan ervoor. (c) Opnieuw opslaan houdt het nummer. (d) Eén met de hand gewijzigde textuur: opnieuw opslaan en verwijderen raken 0 bestanden aan tot de speler kiest. (e) Een proces dat na elke schrijfstap wordt afgebroken, laat nooit een `.cti` achter die naar een ontbrekend bestand wijst. (f) Twee tegelijk (add-on en lak) geeft `'bezig'`. |
| P9 | Busbedrijf | Binnen 1 s na plaatsen staat de naam in `busKleurstellingen`, met `eigen`. `kleurVars` geeft het nummer volgens de regels van Omsi.exe. De Hybrid-.bus krijgt `eigen` alleen als de Hybrid-achterwagen gebakken is. Occasions veranderen niet van kleur als er een eigen lak bijkomt. |
| P10 | In OMSI (Luc, één keer) | SD77, C2 GN (ook de Hybrid), NLC en O530 3 deuren in eigen lak op een kaart: de lak is zichtbaar, de ruiten zijn doorzichtig (C2), de reflectie is zoals de basis (SD77), de achterwagen is gelijk (GN), de HOCHBAHN-letters zijn weg (HH20, Effen), en logfile.txt heeft geen regel. OMSI schrijft hetzelfde nummer in laststn.osn. Nagaan of KI-bussen de lak kiezen. |
| P11 | 60 seconden (Luc plus 2 nieuwe spelers, zonder uitleg) | Opdracht: "maak de bus blauw met een witte band en je bedrijfsnaam, en zet hem in OMSI". Mediaan ≤ 90 s, 0 hulpvragen, niemand loopt vast. |
| P12 | Delen | Een `.omsilak` van project A, geïmporteerd in een tweede userData, geeft een byte-gelijke export. Het bestand bevat 0 bytes uit de OMSI-map. |
| P13 | Terugval | Bus zonder `[CTC]`: knop uit. C2 E5 GN: map aangemaakt, één kleurstelling met index 0. HH109_Stadtbus_VHHPVG_AI en HC_C2_parked: `ls.conflict`, niets geschreven. Een NG313-lak vanuit een start met ander interieur voor en achter: **geen** `ls.conflict`. |
| P14 | Zones en starts | Op de 11 bussen ≤ 8 zones. "Effen" laat rubbers en lampen staan. "Effen in de kleuren van BVG" toont geen BVG-opschrift meer. Nagekeken op schermafdrukken door Luc. |
| P15 | Klaarzetten | Met OMSI "draaiend" (een nepproces in de proef): 0 schrijfacties in de OMSI-kopie, wel een staging en een regel in de wachtrij. Na "afsluiten" is de lak binnen 35 s geplaatst. Vóór `launchOmsi` is hij er altijd. Een naam die intussen bezet is, blijft in de wachtrij met de reden. |
| P16 | Busopties | HH20: `hide_hochbahn_ext` en `decal_ebus_rear` zijn "uiterlijk" en staan bij Effen op de verbergwaarde. Tuer2_IST_SST en `vis_Sitztyp` (NLC) zijn "techniek". Wisselen toont het resultaat in ≤ 300 ms, inclusief een nieuw masker. |

---

## 10. Bouwfasen

Elke fase eindigt met de installer volgens CLAUDE.md:
- `npm ci` in de worktree (geen junction);
- de DLL uit `plugin/out`;
- `npx electron-vite build` en `npx electron-builder -c.directories.output=%TEMP%/omsi-release`;
- Setup.exe, blockmap en draagbaar.exe naar `release\` van `C:\OMSI Career`, met een vergelijking van de kopieën;
- de asar-controle op `node_modules/iconv-lite` en `safer-buffer`.

| Fase | Inhoud | Proeven | Waar |
|---|---|---|---|
| **L0** | `kleurstelling.ts` gelijk aan Omsi.exe, in zes regels: (1) kop exact, (2) plek vóór de naam, (3) setvar alleen na een aangenomen item, (4) plek, naam en variabele na ASCII-`UpperCase`, (5) naam niet trimmen, (6) de busmap als basis. Plus `kleurVars` met terugval. Los, klein en meteen; het herstelt ook de nummers van nu (HHA12, KI-C2). | L0 | lokaal |
| **L1** | Het lakdoek in de werker, zonder UI: familie laden, laknet, maskers (twee marges, busopties), sjablonen, JFA, beide samenstelpaden, override, pick, camera en tweede viewport, een ontwikkelpaneel | P3-P7, P16 (deels) | lokaal |
| **L2** | Opslaan: `lak.ts`, `bcn.ts`, `dds.ts`, export, `lakfamilie.ts`, `core/lakstudio.ts`, grendel, add-on `soort: 'lak'`, klaarzetten, teller en wezen, IPC met bewaking, vergeten. Stubs voor F: `eigen`, `wacht`, de gebeurtenis, `bussenInKleurstelling`. | P1, P2, P8, P9, P13, P15 | lokaal |
| **L3** | UI fase 1: Snelle lak en de starts, Vullen, Strook, Tekst, Afbeelding en vormen, Penseel en gum, Spiegel met de andere kant, Lagen, Ongedaan maken, Busopties, Opslaan/Klaarzetten, "+ Eigen lak", Addons; 4 talen. Daarna P10 door Luc. | P10, P11, P14, P16 | lokaal |
| **L4** | Busbedrijf: occasions zonder eigen lakken, luisteren naar de gebeurtenis, groep "Eigen", label "wacht", `ls.gebruik`; F-punten 3, 5 en 8 uit §6 | P9 | lokaal + cloud (F moet gebouwd zijn) |
| **L5** | Fase 2: huisstijl (bij ja op beslissing 1), Schemer en Nacht, zone "alleen dit vlak", vrije richting, groepen, beschermpenseel, `.omsilak`, 2× scherper, nightmap, volle 8192 | P12 | lokaal + cloud (huisstijl) |
| **L6** | Fase 3: ruitbeplakking en achterruitreclame (sjablonen `_üFenster`/`_full`/`_POP`), glans/mat, wagennummer via het script, platte uitslag, repaint-zip (bij ja op beslissing 2) | — | lokaal |

**Wat al kan:** L0 meteen. L1 en L2 kunnen naast de cloud-F gebouwd worden. Het enige wat F nodig heeft, is de naam in de lijst, en die werkt al.

---

## 11. Risico's en onzekerheden

**Nagelezen en daarmee opgelost (KR punt 3, KR G):**
- OMSI vergelijkt plek, naam en variabele na ASCII-`UpperCase` en trimt niet.
- De setvar-toestand springt tussen bestanden niet terug. De regel van §5.4, punt 7 is dus nodig en voldoende.

**Nog open of met een restrisico:**
- **Nummer en volgorde.** Geen van de 994 namen sorteert nu na `~` (A3). Een later geïnstalleerde repaint met zo'n naam, bijvoorbeeld beginnend met `Ü`, komt achter ons en verschuift alleen zijn eigen nummer. De app zoekt op naam. OMSI-eigen opslagen kunnen verschuiven als de speler een eigen lak verwijdert; dat melden we bij het verwijderen.
- **Main en trail.** Of OMSI de kleurstelling van main en trail op nummer of op naam koppelt, is niet nagelezen (R§F). De app schrijft per deel op naam (`aanhangerVan`, index.ts:4317-4323). P10 kijkt het na.
- **Familie en busruimte.** We nemen aan dat familieleden dezelfde busruimte hebben. Dat wordt afgevangen met de doos (P7) en nagekeken in P10 (Hybrid, O530 3 deuren).
- **KI-bussen** dragen de lak ook. Of OMSI ze er willekeurig mee laat rijden, is onbekend (P10). Uitsluiten kan niet: ze delen plek en textuur met de bestuurbare bus.
- **Indeling van de busopties** (uiterlijk of techniek) is een vuistregel. P16 kijkt de bekende gevallen na, en techniek staat apart met een waarschuwing.
- **Sjablonen** zijn er voor 3 van de 11 bussen. Voor de andere 8 draait het automatische masker, en P5 toetst dat op de 3 bussen met sjabloon.
- **Een ontbrekend bestand in een item** (een afhankelijkheid die verdwenen is): wat OMSI dan toont, is niet gemeten. Tegenmaatregel: de waarschuwing in de add-on-manager en de controle bij het openen.
- **Automatische zones** op ruisende of beplakte lak. De terugval is Effen, de tolerantie en het penseel (P14).
- **Plekconflicten** in 13 mappen (KR/gedeeld2.out.txt): vooral KI, geparkeerde bussen en interieur. Spelers kunnen `ls.conflict` voelen als "werkt niet".
- **Tegelexport en de lichte stand** zijn nog niet gemeten (P4, P6).
- **BC-kwaliteit** (35,7-37,2 dB) is die van een eenvoudige encoder. Cluster fit komt er alleen als P10 blokken laat zien.
- **De proefbank van S** was één ronde op een nepnet. De orde van grootte is betrouwbaar, de precieze tijden niet (S§5). Niet gemeten: k-means, het buitenmasker met twee dieptekaarten, het gedeelde pad.
- **Klaarzetten.** Start de speler OMSI buiten de app om tussen twee controles, dan helpt de controle vlak voor het eerste bestand. Omdat de `.cti` als laatste komt, ziet OMSI nooit een half geplaatste lak.
- **Het buitenmasker** met 26 richtingen kan kleine holtes missen, zoals instapnissen en dakranden. De terugval is het penseel met de dieptetoets vanaf de camera.
- **Alte DIN 1451:** de licentie is onbekend, dus niet meeleveren.
- **De appnaam wordt Omsi-Hub.** Daarom het voorvoegsel `Lakstudio`, en het hernoemplan neemt `lakstudio/` mee.

**Bewust niet:**
- model.cfg of een `.bus` aanpassen;
- schrijven terwijl OMSI draait;
- BC7 of DX10;
- `.cti`'s van anderen wijzigen;
- texturen of sjablonen van anderen in een deelbestand;
- het Repaint-Tool starten;
- een 3D-editor op telefoon of tablet;
- beelden laten maken door AI.

---

## 12. Beslissingen voor Luc

Luc was op 30-09 niet bereikbaar en vroeg om alles achter elkaar af te maken. De hoofdsessie nam daarom het advies over; Luc kan elke keuze later omdraaien.

| # | Beslissing | Gekozen (advies) |
|---|---|---|
| 1 | Huisstijl per bedrijf over modellen | Ja, in fase 2 (L5), samen met de cloud |
| 2 | Delen | Alleen het recept (`.omsilak`), geen repaint-zip met texturen |
| 3 | Wagennummer en kenteken | Niet inbakken; via het script waar de bus dat kan |
| 4 | Klaarzetten terwijl OMSI draait | Ja: vanzelf plaatsen zodra OMSI dicht is |
| 5 | Zichtbaarheid | Tot en met L3 achter de schakelaar `bus3d`; daarna altijd zichtbaar na P10/P11 |

De oorspronkelijke tekst van deze paragraaf (de afwegingen per beslissing) staat hieronder.

### 12.1 De afwegingen

1. **Huisstijl per bedrijf, over modellen.**
   - *Advies: ja, in fase 2.* Het bedrijf bewaart één recept (3 kleuren, strook, logo, naam), per model toe te passen met één klik, plus "vloot overspuiten". De rekencode zit al in fase 1 (Snelle lak). Wat erbij komt, is data en een scherm in de cloud.
   - Dit gaat verder dan deel F, dat huisstijl bewust wegliet (CLOUD:1413).
   - *Anders:* per model met Snelle lak, zonder bewaard recept.
2. **Delen.**
   - *Advies: alleen het recept (`.omsilak`).* De ontvanger bouwt de lak uit zijn eigen installatie; er gaan geen bestanden van betaalde add-ons rond.
   - *Anders:* ook een gewone repaint-zip. Dan alleen voor add-ons op een lijst met bekende licenties die dat toestaan (niet op grond van "onversleuteld": ABCoach_O560), gestart vanuit Effen of Standaard, en met een vinkje voor de licentie (§7).
3. **Wagennummer en kenteken in de lak.**
   - *Advies: niet inbakken.* Waar de bus het via het script kan, gebruiken we dat (NLC `vis_CTI_Kennzeichen_Repaint`, Kajosoft `reg_number_on_repaint`; R§E).
   - *Anders:* optioneel inbakken met één textuur per bus. Bij de C2 AVG Ahlheim kost dat 53 texturen, 132 MB op schijf en ~35 MB VRAM per stuk (R§E); in ons BC3 ≈ 11 MB per bus.
4. **Klaarzetten: vanzelf plaatsen als OMSI dicht is.**
   - *Advies: ja.* Eén klik op [Klaarzetten voor OMSI] is genoeg. De app plaatst zodra OMSI dicht is, bij de start van de app, en altijd vóór hij zelf OMSI start, met de melding `ls.geplaatst`.
   - *Anders:* de lak wacht in Addons op een klik op [Nu in OMSI zetten].
5. **Waar de Lakstudio te zien is.**
   - *Advies:* tot en met L3 achter de bestaande schakelaar `bus3d` (proeftijd). Na P10 en P11 altijd zichtbaar ([Lak maken] en "+ Eigen lak"). De studio opent dan zelf het 3D-venster, ook als de 3D-knoppen in de buskeuze uit staan.
   - *Anders:* blijvend achter `bus3d`. Wie 3D niet aanzet, ziet de studio dan niet (KR punt 25).

---

## Bijlage A: metingen (30-09, alleen lezen)

- **A1. BC-encoder:** K/ontw-bc3.cjs, uitvoer in K/ontw-bc3.out.txt.
  - HH20 newC2EG (2048²): BC1 122 ms en BC3 271 ms; PSNR 35,69 en 59,81 dB.
  - O530 01white (2500×1300): BC1 75 ms en BC3 177 ms; PSNR 37,17 en 54,64 dB.
  - Node, één draad.
- **A2. Plekconflicten:** eerst K/ontw-gedeeldeplek.cjs (basis `dirname(dirname(cfg))`, 14 mappen). Vervangen door KR/gedeeld2.cjs vanaf de .bus: 270 mappen, 153 gedeeld, 16 treffers, waarvan 13 echte conflicten (3 alleen witruimte). Geen daarvan raakt een lakdoel van de 11 bussen.
- **A3. Sorteren na `~`:** 994 `.cti`'s onder Vehicles; 0 met een eerste teken na `~` en 0 met een `~` in de naam.
- **A4. envir.cfg:** OMSI/envir.cfg:8-11, :18-20, :48-63, :117-132, :191-206.
- **A5. Proeven van de kritiek:**
  - KR/basis.cjs: 41 van 1025 wijken af; bij 36 bestaat de map alleen vanaf de busmap.
  - KR/gn.cjs (opnieuw gedraaid): rep_GN door 12 .bus gelezen, 6 KI; drie verschillende lakplekken (main, trail, trail_Hybrid).
  - KR/hoofdletters.out.txt: 368 cfg's; 4 cfg's met samengevoegde namen (HHA12); 4 items alleen met de hoofdletterregel; 90 namen met een spatie ervoor of erna.
  - KR/sleutels.cjs: ABCoach_O560 heeft 1868 o3d's, alle onversleuteld.
  - KR/zoek.txt: 0x421374 (UpperCase a-z), 0x7F633C, 0x7F6410, 0x5F0EC2 en de setvar-toestand (ebp-0x440).
- **A6. Extra nagelezen voor deze versie:**
  - KR/varianten.cjs (opnieuw gedraaid over de mappen van de 11 bussen): rep_GN 6 bestuurbare .bus met main (3), trail (2) en trail_Hybrid (1); `MB_O530\Texture\rep` met repaint_body en repaint_body_3doors. De andere treffers zijn gewone main/trail-paren.
  - OMSI/Vehicles/MB_O530/Texture/01white.tga en 3_01white.tga: beide 2500×1300, 32 bit (TGA-kop).
  - Sjablonen:
    - OMSI/SDK/RepaintTool/MAN SD/SD77_01.rpc:1-5 → `templates\SD77_01_{BS,AL,MA,AD,MU}.bmp`, in dezelfde map ook SD77_01_üFenster.rpc en SD77_02.rpc;
    - OMSI/SDK/RepaintTool/MAN NG 272/ bevat EN92_1(.rpc, _full.rpc) en templates EN92_1_{AD,AL,BS,MA,MA_full,MU}.bmp;
    - OMSI/Vehicles/HH20_EBus2021/Texture/Werbung/C2_21_Standard.rpc:1-5 → `templates\newC2EG_{BS,AL,MA,AD,MU}.bmp`, plus _POP en _T;
    - telling onder Vehicles: 42 .rpc in 11 mappen.
  - Werking van het Tool: K/rp_wiki_rpc.txt:70, :80, :87-89, :92, :94, :108.
  - Setvars van de HH20:
    - Texture/Werbung_3T/3T.cti: " silber", Champagner, Stuttgart, gelb, gruen → `hide_hochbahn_ext`=1 en `decal_ebus_rear`=1;
    - Texture/Werbung/21.cti:29, :64, :95 → HOCHBAHN-reclames `hide_hochbahn_ext`=0;
    - model/model_21_3T_main.cfg:19649-19657 (`21_decals_aussen_hochbahn.o3d`, `[visible] hide_hochbahn_ext 0`);
    - in script/ komt de variabele alleen voor in 19_visual_varlist.txt.
  - Code:

| Wat | Plek |
|---|---|
| `kleurVars` (niet gevonden → geen vars, :4302-4305) | ONS/src/main/index.ts:4297-4315 |
| `aanhangerVan` | index.ts:4317-4323 |
| `eenTegelijk` | index.ts:6625 |
| `omsiDraaide` elke halve minuut | index.ts:488-489 |
| `isOmsiRunning`, `launchOmsi` | index.ts:96, :1029 |
| Schakelaar `bus3d` voor het venster | index.ts:4829-4831 |
| Basis `dirname(dirname(cfg))` | ONS/src/core/kleurstelling.ts:150 |
| Naam trimmen | kleurstelling.ts:193 |
| `installeerStappen` volgt `plan.regels` | ONS/src/core/addon.ts:763-790 |
| `verwijderStappen` per bestand | addon.ts:919-958 |
| Routes van texturen (DXT gecomprimeerd, TGA → RGBA8) | ONS/src/renderer/src/bus3d/texturen.ts:9-24 |
| `vanHoofd` / `vanVenster` | ONS/src/main/bus3dvenster.ts:109-112, :117-118 |
| Fotovenster laadt dezelfde brug | ONS/src/preload/bus3d.ts:19-22 |
| `Bus3dKleurlijst` | ONS/src/shared/bus3d.ts:272 |
| `Bus3dDoel` | ONS/src/shared/bus3d.ts:320 |
| Overspuiten | CLOUD (K/ontw-wp.md) "Overspuiten" |
| Occasion-kleur `lijst[floor(kleurZaad × n)]` | idem, "Occasions" |
| [3D] maakt [Overspuiten] actief | idem, "Knoppen"/"Vragen" |
| Stil wissen | idem, randgeval 10 |
| Huisstijl bewust niet | idem, "Bewust niet in deze bouw" |

---

## Bijlage B: wat er met de kritiek gebeurd is

| # | Ernst | Punt | Besluit | Waar |
|---|---|---|---|---|
| 1 | B | Varianten in dezelfde map krijgen een half gelakte bus | Overgenomen: familie, één doel per standaardtextuur, bakken op het eigen net; een lid dat niet te bakken is krijgt de naam niet; `eigen` alleen als het rond is; Hybrid en O530 3 deuren in P1/P9 | §3.1, §5.4, §6, §9 |
| 2 | B | De basis van het CTC-pad is de busmap | Overgenomen in L0 en in `lakfamilie`; conflictregel alleen op gebakken plekken; KI-conflicten mogen niet meer "met waarschuwing" | §3.1, §3.5, §10 |
| 3 | H | Hoofdletters en twee extra afwijkingen in L0 | Overgenomen: L0 heeft zes regels; `naamFout` na `UpperCase`; rp_index zonder strip | §5.2, §9 L0, §10 |
| 4 | H | Logo's en grille via setvars blijven staan | Overgenomen als Busopties. De standaard is **aangepast**: verbergen wat over de lak ligt (3T.cti zet 1, 21.cti zet 0, dus "wat volreclames zetten" is niet eenduidig) | §4.9 |
| 5 | H | Overlay-meshes dekken de lak af | Overgenomen: twee dieptekaarten per richting, 1 cm voor dichte en 5 cm voor doorzichtige meshes; P5 uitgebreid | §4.3 |
| 6 | H | Sjablonen van de makers | Overgenomen: MA = masker, AD/MU = detail, BS = basis; koppelen op inhoud en niet op naam; P5 ≥ 97% | §3.3, §4.4 |
| 7 | H | Stroken en tekst lakken over rubbers | Overgenomen: één lakmasker voor alle lagen, met een schakelaar per laag | §4.4 |
| 8 | M | De raamlijn pakt de deuren | Overgenomen: glas zonder animatie, meest voorkomende onderkant | §4.3 |
| 9 | H | Spiegel plus gedeelde texels | Overgenomen: geen kopie bij > 2% gedeeld, melding en schuifknop | §4.8 |
| 10 | M | De kopie is niet te zien | Overgenomen: beeld van de andere kant, `ls.kopieDeur` | §4.8 |
| 11 | H | De standaardstart houdt logo's | Overgenomen, met aanpassing: de standaard is nu Snelle lak; "Effen in de kleuren van deze lak" is de tweede keuze, "Deze lak precies" de derde | §2.1, §4.4 |
| 12 | H | De C2 past niet in het budget | Overgenomen: basis zonder mips, masker/JFA/penseel op de halve maat, export op volle maat in tegels; nieuwe tabel, P4 ≤ 500 MB | §4.13, §4.14 |
| 13 | M | De export van de C2 GN is te traag | Overgenomen: PBO en 1-4 codeerwerkers; eis ≤ 4 s voor 3 doelen; §2.1 gelijkgetrokken | §4.14, §9 P3 |
| 14 | M | Het gedeelde pad is niet gemeten | Overgenomen, **anders**: 4 lagen per RGBA8 met MAX-mengen in plaats van 8 MRT's, want 8×RGBA8 kost bij 4096² 512 MB; alleen bij ≥ 1% gedeeld; meten op de HH20 | §4.5 |
| 15 | L | Buswissel tijdens de export | Overgenomen: de wissel wacht | §4.1 |
| 16 | H | Een kapotte kleurstelling na opnieuw opslaan of verwijderen | Overgenomen: eerst alles controleren, dan kiezen; plus `.cti` als laatste schrijven en als eerste weghalen | §5.6, P8 |
| 17 | M | Dezelfde grendel | Overgenomen: `src/main/grendel.ts`, fout `'bezig'` | §5.6, §8 |
| 18 | M | Het fotovenster laadt dezelfde brug | Overgenomen: `vanVenster` + doel `'lakstudio'`; Addons via `vanHoofd` | §8 |
| 19 | M | Proeven niet in de OMSI van Luc | Overgenomen: een kopie met nepbestanden; alleen P10 echt | §9 |
| 20 | M | Teller en register per userData | Overgenomen: nummer uit teller en schijf, `eigen` uit de bestandsnaam, wezen in Addons, hernoemplan | §5.8 |
| 21 | M | Onversleuteld zegt niets over de licentie | Overgenomen: licentielijst in beslissing 2 | §7, §12 |
| 22 | H | OMSI draait meestal | Overgenomen: Klaarzetten, met plaatsen na OMSI, bij de start en vóór `launchOmsi` (beslissing 4) | §5.7 |
| 23 | M | Spatie betekent twee dingen | Overgenomen: [Voor/na] en de toets O, verschuiven met de middelste knop of Shift | §2.3 |
| 24 | M | Snelle lak als ingang | Overgenomen: fase 1, dezelfde code als de huisstijl | §2.1, §6 |
| 25 | L | Kleine punten | Overgenomen: 500 stappen overal; zes knoppen (Vorm in Afbeelding, Gum in Penseel); "Sjabloon ▸" vervangen door Snelle lak; huiskleuren naar L5; cp1252-omzetting; Schemer/Nacht naar fase 2; schakelaar als beslissing 5; NL202 BC1 | §1, §2, §4.11, §5.2, §5.3, §12 |
| 26 | M | [Nieuwe lak] helemaal lokaal | Overgenomen: tegel "+ Eigen lak", gewone `Bus3dKeuze` | §4.1, §6 |
| 27 | M | Deel F bestaat nog niet | Overgenomen: stubs in L2; occasions uitsluiten vóór n | §6, §10 |
| 28 | L | KI-bussen | Overgenomen: zin in `ls.klaar`, P10; uitsluiten kan niet (risico) | §2.5, §6, §11 |