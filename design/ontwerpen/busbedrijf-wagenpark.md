# Definitief ontwerp: aanschaf van bussen (F) en 3D-viewer bij de dealer (G)

**Basis.** Worktree `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800`, tak `claude/busbedrijf-samen`. HEAD is **0b9b4c8**; die commit zet het definitieve planningsontwerp in `design/ontwerpen/busbedrijf-planning.md` (hieronder **PL**).

**Wat ik gedaan heb.** Ik heb alleen gelezen. Ik heb niets gewijzigd of gecommit en de app niet gestart. De metingen draaiden als tsx-scripts in `…/scratchpad/wagenpark/definitief/`, met de kaartcache in mkdtemp.

**Let op.** Tijdens dit werk wijzigde een andere workflow (wens 7) de worktree. Het gaat om ongeveer 13 bestanden, waaronder `kaartwerker.ts`, `api.ts`, `preload/index.ts`, `kaartlaag.ts` en `timetable.ts`, plus 5 nieuwe bestanden. Alle regelnummers hieronder zijn van HEAD 0b9b4c8. `bedrijf.ts`, `index.ts`, `Bedrijf.tsx`, `BedrijfPost.tsx` en `i18n.ts` waren op het moment van lezen gelijk aan HEAD.

---

## 0. Wat er verandert ten opzichte van het ontwerp, en waarom

1. **Het rekenmodel is dat van de planning, niet de pool.**
   - Het ontwerp en beide tegenlezers rekenden met `dagprognose` (pool, 7,9 u per omloop, € 300 per bus).
   - PL (0b9b4c8) vervangt dat door een afrekening per omloop. Die gebruikt `plantarief.ts`: bus van de onderaannemer 48 €/rituur, eigen bus 10 €/rituur, huurbus 100 € + 62 €/rituur (× 1,2 via de centrale). Slijtage is per rituur; pech komt uit deel B.
   - Alle tarieven van F zijn daarom opnieuw geijkt op **€ 38 per rituur** (§2).
2. **De besparing is marginaal en komt uit het rooster.**
   - Op lijn 109 bespaart bus 1 € 312 per dag, bus 13 € 236 en bus 22 € 99 (§2.1).
   - Een vast bedrag (€ 300 in het ontwerp, € 258 in PL-A's markt) klopt dus voor bijna geen enkele bus.
3. **F bouwt op deel 0 van PL.**
   - Deel 0 heeft al: `Bedrijf.busTeller`, de export van `boek`/`meld`/`reeks`, de opsplitsing in `BedrijfDelen.tsx`/`BedrijfWagenpark.tsx`/`BedrijfDashboard.tsx`, de tekstbestanden in `src/shared/tekst/` (met de regel dat `bd.fout.*` alleen in `fundament.ts` staat), `busvorm.ts` en `inSlot`.
   - F gebruikt die en maakt ze niet opnieuw.
   - Tegenlezerpunt T-F12 (verhuizing en kringverwijzing) is daarmee opgelost door deel 0.
4. **Botsingen met de planning zijn weggenomen.**
   - `BoekingSoort 'boete'` is van PL. F gebruikt `'contractboete'`.
   - "Huurbus" is in PL de vervangende bus per omloop en per dag (`BusKeuze 'huur'`). De huur van F is daarom **vanaf morgen, minstens 3 dagen, als bus in je wagenpark**. `huurSnel` vervalt: voor dezelfde dag is er de vervangende bus van PL-C.
5. **Vorm.**
   - Geleed alleen met een aanhanger (T-F1, gelijk aan PL `vormVanVoertuig`).
   - Hoogte > 3,6 m → dubbel, lengte < 10,8 m → midi.
   - Resultaat over 395 bussen: solo 254, geleed 106, dubbel 28, midi 7 (§2.2).
6. **Geldlekken dicht** (S-B3, S-B4).
   - Occasion, inruil en verkoop rekenen met een **marktwaarde**: de waarde bij staat 100 min het achterstallige onderhoud.
   - Overnemen rekent met de waarde bij staat 100.
   - Gemeten: 0 van de 277.530 flip-routes geven winst (§2.4).
7. **Beslag** (T-F2, S-B8). De bank neemt alleen bussen die van jou zijn (eigen of lening), en alleen als dat de kas verhoogt. Een leasemaatschappij legt geen beslag.
8. **Full service** (T-F5, S-E). De staat gaat 's nachts terug naar 100, en pech kost dan niets.
9. **Looptijden** (S-B5). Lease 30 dagen vervalt. Er zijn 90, 180 en 360 dagen, en huur is duurder dan lease 90 met onderhoud.
10. **3D, lezen van het model.**
    - `[matl]` koppelt aan het n-de materiaal met die textuur (T-G1, 99,7 %).
    - `[alphascale]` en `texadress` tellen mee.
    - `[visible]` wordt beoordeeld vóór het ontdubbelen.
    - Een lege transmap betekent geen transmap.
11. **3D, keten en geheugen.**
    - Geometrie en kleurstelling zijn gesplitst (`bus:model3d` en `bus:lak3d`, S-C1/T-G7).
    - JPG wordt in het venster uitgepakt (T-G5).
    - De terugvalfoto komt alleen uit de cache (T-G6).
    - Er loopt hooguit één vraag en er wacht er hooguit één; de nieuwste wint (T-G7).
    - Het geheugen gaat na 120 s vrij (T-G9).
12. **Dealergevoel.** Uit de spel-tegenlezer komen: aantal 1–20 met volumekorting, merken, "Koersrol past", vergelijken, overspuiten, occasions in de kleuren van de vorige eigenaar, een levering met knop, lease verlengen, en het wagenpark gegroepeerd per model.

## 1. Kernbeslissingen

1. **Enige ingang voor de planning:** `inzetStatus(bus, dag)` en `isInzetbaar(bus, dag)` in `bedrijf.ts`. Lease- en huurbussen zijn gewone `EigenBus`-en.
2. **Wie rekent.** Het venster rekent de offerte zelf, met dezelfde pure functies. Het hoofdproces rekent opnieuw, controleert elke keuze en voert uit in `inSlot`.
3. **Termijnen** lopen vanaf de levering (lease) of vanaf het afsluiten (lening). Inleveren gebeurt 's avonds bij de dagafsluiting.
4. **Resultaat** = boekingen buiten `INVESTERING` min afschrijving. De afschrijving raakt de kas niet.
5. **Volgorde.** F komt na de integratie van PL (stap 2). G mag eerder op een eigen tak, maar wordt pas daarna samengevoegd.

---

## 2. Metingen

### 2.1 Wat een eigen bus bespaart onder de planning (`rituren.ts`, `rituren2.ts`)

**Meting.**
- Opzet: 69 lineFiles op 14 kaarten, 3590 ms. Een week vanaf het anker (de maandag op of vóór het tijdvak).
- Rituren tellen alleen ritten met ≥ 3 haltes.
- De k-de bus rijdt elke dag de k-de langste omloop. Dat is een ondergrens: omlopen koppelen telt niet mee.

**Rituren per omloop-dag** (3684 stuks): p10 1,58 · p25 4,23 · mediaan 7,30 · p75 10,87 · p90 14,17.

**Lijn 109 (HafenCity)**: piek 22, gemiddeld 6,79 rituren per omloop.

| Bus k | 1 | 5 | 10 | 13 | 14 | 18 | 19 | 22 |
|---|---|---|---|---|---|---|---|---|
| Rituren per dag, weekgemiddelde | 8,22 | 7,64 | 6,73 | 6,20 | 5,67 | 5,13 | 4,60 | 2,61 |
| Besparing (× 38 €) | 312 | 290 | 256 | 236 | 215 | 195 | 175 | 99 |

- Bus 1–13 rijden gemiddeld 7,25 rituren, bus 14–22 gemiddeld 4,73.
- Per lineFile is de mediaan van de "eerste bus" 4,62 rituren, maar veel lineFiles zijn aparte dagsoorten (bijvoorbeeld Hohenkirchen *samstag*: 11 omlopen op 1 dag per week).

### 2.2 Catalogus met de definitieve vormregel (`catalogus.ts`)

- **Leestijd:** 395 .bus-bestanden in 913 ms.
- **Vorm:** solo 254, geleed 106, dubbel 28, midi 7. Honderd bussen wijken af van `vormVanNaam`: solo→geleed 63, solo→dubbel 28, solo→midi 5, geleed→solo 4.
- **Mediaan aantal plaatsen:** midi 46, solo 56, geleed 87, dubbel 81.
- **Prijzen** (laagste / mediaan / hoogste):

  | Vorm | Laagste | Mediaan | Hoogste |
  |---|---|---|---|
  | midi | 44.500 € | 45.000 € | 52.000 € |
  | solo | 52.000 € | 60.000 € | 69.000 € |
  | geleed | 76.000 € | 85.000 € | 98.000 € |
  | dubbel | 94.500 € | 95.000 € | 97.500 € |

- **Voorbeelden:**
  - MAN SG292 (Luc, bus 101): geleed, 15,1 m, 55 + 59 plaatsen, 93.000 €.
  - Kajosoft O530 L: solo, 14,95 m, 50 + 32 plaatsen, 68.500 €. Het ontwerp maakte daar een gelede bus van.
- **Merken** (tabel in F2): Kajosoft 148, Mercedes-Benz 121, MAN 77, Setra 18, Hamburger Stadtbus 17, Thueringer Wald 8, Iveco 2, Volvo 2, ÖAF 1, Rheinhausen 1. De 8 van Thueringer Wald zijn Setra S 317; de regex in F2 vangt dat, maar dat is nog niet opnieuw gemeten.
- **Modelgroepen:** 60 als sleutel map | vorm | lengte, tegen 47 als map | vorm. Met alleen map | vorm vielen bijvoorbeeld O530 en O530 L samen.

### 2.3 Tarieven en de ladder (`econ.ts`)

**Tarieven per vorm** (basisprijs):

| Vorm | Nieuw | Belasting en keuring per dag | Lease 90/180/360 | Onderhoud inbegrepen | Borg 90/180/360 | Huur per dag | Lening 90/180/360 (20 %) per dag | Rente per dag (360) |
|---|---|---|---|---|---|---|---|---|
| midi | 45.000 | 10 | 105/90/75 | +70 | 1.050/900/750 | 205 | 407,32/207,33/107,39 | 7 |
| solo | 60.000 | 15 | 140/120/100 | +90 | 1.400/1.200/1.000 | 270 | 543,10/276,44/143,19 | 10 |
| geleed | 85.000 | 20 | 195/170/145 | +130 | 1.950/1.700/1.450 | 385 | 769,39/391,62/202,85 | 14 |
| dubbel | 95.000 | 25 | 220/190/160 | +145 | 2.200/1.900/1.600 | 430 | 859,90/437,69/226,72 | 16 |

**Ladder** per solo per dag, in euro kasstroom, zonder monteurs.
- Onderhoud gebeurt bij staat 50, met een dag werkplaats. Pech is volgens PL-B met een vervangende bus (× 1,2).
- Bij "eigen" staat het resultaat na afschrijving tussen haakjes.

| Rituren | Besparing | Huur | Lease 90 met / zonder onderhoud | Lease 180 met / zonder | Lease 360 met / zonder | Eigen | Lening 360 |
|---|---|---|---|---|---|---|---|
| 2,6 | 99 | −174 | −134 / −91 | −114 / −71 | −94 / −51 | 34 (30) | 24 |
| 4,73 | 180 | −95 | −55 / −48 | −35 / −28 | −15 / −8 | 77 (70) | 67 |
| **6,79** | 258 | **−18** | 22 / −9 | 42 / 11 | **62** / 31 | **116** (106) | 106 |
| 7,25 | 276 | 0 | 40 / −1 | 60 / 19 | 80 / 39 | 124 (113) | 114 |
| 10 | 380 | 102 | 142 / 46 | 162 / 66 | 182 / 86 | 171 (156) | 161 |

- **Met 3 monteurs, bij 6,79:** lease 180 zonder onderhoud +80, tegen +44 met onderhoud inbegrepen. Welke het beste is, hangt dus af van je monteurs.
- **Eigen onderhoud bij 6,79:** onderhoud 100 + stilstand 14 + pech 13 = 127 € per dag. Een oude bus (680k km, slijtfactor) kost 179 € per dag.

### 2.4 Geen geldlek (`econ.ts` §3–4, `lek.ts`)

- **Flip-routes.** Kopen, onderhoud en direct verkopen of inruilen, over nieuwwaarde 38k–110k, km 120k–680k en staat 40–90. Onderhoud normaal, met 3 monteurs, of zelf plus voordeel.
  - Nieuwe regel: **0 van de 277.530 routes geven winst**. De beste route kost € 367.
  - Oude regel: 67 van de 319 met winst (tegenlezer, `flip.out.txt`).
- **Lease verwaarlozen en overnemen** (solo, lease 180, na 180 dagen):
  - overnemen kost 55.300 €, ook bij staat 25;
  - daarna inruilen levert −3.500 € (staat 100) tot −5.375 € (staat 25) op. Voorheen was dat tot +11.148 €.
- **Boete voor achterstallig onderhoud bij normaal inleveren:** staat 45 → 1.975 €, staat 25 → 2.475 €, staat ≥ 50 → 0.

### 2.5 Beslag op een leningbus (`econ.ts` §5)

Beslag gebeurt alleen als 0,7 × marktwaarde groter is dan de restschuld. Bij een lening van 360 dagen gaat dat pas na ongeveer dag 60:

| Situatie | Uitkomst |
|---|---|
| dag 30, staat 75 | −3.325 € → geen beslag |
| dag 60 | +252 € |
| dag 90 | +3.875 € |

### 2.6 Scenario lijn 109, 360 dagen (`scenario.ts`)

**Opzet.**
- Start met 137.000 € (inschrijving 13.000 €). Omlopen per weekdag 22/22/22/22/22/18/13.
- De basismarge "alles uitbesteed" komt uit PL §2.2: werkdag +1.301 €, zaterdag +490 €, zondag +602 €.
- Alle regels van F doen mee: kredietruimte, rood staan en beslag.

| Plan | Eindkas | Laagste kas | Eigen vermogen | Resultaat per dag | Opmerking |
|---|---|---|---|---|---|
| niets | 528.350 | 137.000 | 528.350 | 1.087 | |
| 2 solo contant | 516.316 | 18.301 | 625.673 | 1.365 | |
| 6 solo lening 360 (20 %) | 473.130 | 78.938 | 747.187 | 1.713 | 1 geweigerd (kredietruimte) |
| 13 lease 360 met onderhoud | 884.923 | 125.301 | 897.923 | 2.114 | |
| 22 lease 360 met onderhoud | 830.001 | 116.301 | 852.001 | 1.986 | bus 14–22 kosten geld |
| 13 lease 360 zonder onderhoud | 745.903 | 125.301 | 758.903 | 1.728 | |
| 2 contant + 11 lease met onderhoud | 797.732 | 7.301 | 918.089 | 2.177 | |
| 13 huur (steeds verlengd) | 526.860 | 137.000 | 526.860 | 1.083 | ongeveer neutraal |
| groei: steeds contant bij | 107.028 | 18.301 | 790.357 | 1.856 | 12 bussen op dag 360 |
| 22 lease + 6 lening | 761.936 | 104.437 | 843.060 | 1.964 | 5 leningen geweigerd |

Er kwam in geen enkel plan rood staan of beslag voor.

### 2.7 Kleurstalen (`stalen.ts`)

- MB_C2_E6: 76 kleurstellingen. De lijst lezen kost 282 ms.
- De eerste textuur per kleurstelling lezen en uitpakken: 76 × 59 ms = **4,5 s**, 167 MB (74 tga, 2 png).
- Te traag voor elke keer, dus lui en op schijf bewaard (G4).

### 2.8 Uit eerdere rondes (gebruikt, niet opnieuw gemeten)

- **Tekenen:** 1,3 / 1,3 / 3,7 ms per beeld (mediaan) voor SD77 / O530 / NLC.
- **Klaarzetten (warm) plus ipc:** SD77 0,2 + 0,18 s; O530 1,1 + 0,30 s; NLC 3,7 + 0,92 s.
- **Mipniveau:** de NLC gaat van 4111 naar 1921 ms.
- **JPG** (tegenlezer): in het hoofdproces 364 ms met blokken tot 78 ms; in het venster via `createImageBitmap` 92 ms met gaten van hooguit 11 ms.
- **[matl]-koppeling:** 80.163 regels. "Het n-de materiaal met die textuur" klopt bij 99,7 %, "n = groepsnummer" bij 50,3 %.
- **Transmap:** 1.150 van de 5.913 zijn leeg. `texadress_clamp` komt 1.169 keer voor, `_border` 24 keer.
- **Dubbele o3d's:** 4.494 o3d's staan dubbel in één cfg. Bij 249 is de eerste vermelding verborgen en een latere zichtbaar.
- **Beeldvulling:** de bus vult 37–42 % van de breedte.

---

## 3. Afspraken voor F en G

### Volgorde

**PL stap −1 … 2**
- **F0** (pure kern en datamodel, kan in de cloud).
- Daarna tegelijk:
  - **F1** (catalogus, main en ipc, lokaal) en **F2** (schermen);
  - **G1** (werker en main) en **G2** (viewer).
- Dan samenvoegen, daarna **G3** (kleurstalen).
- Daarna de installer volgens CLAUDE.md: `npm ci` in de worktree, DLL uit `plugin/out`, beide targets naar `release\`, en asar-controle op iconv-lite en safer-buffer.

**Details.**
- G mag al na deel 0 op een eigen tak worden gebouwd. De stukjes in gedeelde bestanden (`index.ts`, `kaartwerker.ts`, `api.ts`, preload, `i18n.ts`) worden pas na PL stap 2 samengevoegd.
- G levert in F0 een **stub** van `BusViewer.tsx` met de definitieve props. De stub toont alleen de foto uit de cache.

### Werkafspraken

- **Omheining.** Gedeelde bestanden krijgen alleen omheinde blokken: `// --- wagenpark (ontwerp F) ---` en `// --- bus3d (ontwerp G) ---`.
- **Tekst.**
  - `src/shared/tekst/wagenpark.ts` (`TEKST_WAGENPARK`) en `src/shared/tekst/bus3d.ts` (`TEKST_BUS3D`), in de vorm van PL: `as const satisfies Record<string,{en,de,fr,nl}>`.
  - Beide in `TEXT` en `TEKSTBRONNEN` in `i18n.ts`.
  - De `bd.fout.*` van F komen in een omheind blok in `tekst/fundament.ts` (regel van PL).
  - Alle vier talen.
- **Geen `node:fs`** in `core/wagenpark.ts` en `core/dealer.ts`, want de renderer importeert ze. Schijfwerk staat alleen in `core/busspec.ts` en `core/bus3d.ts`, en die draaien in een werker.
- **Kringverwijzing.** `bedrijf.ts` importeert `wagenpark.ts` (voor `sluitDagAf` en `dagprognose`) en `wagenpark.ts` importeert `bedrijf.ts`. Dat mag zolang imports alleen binnen functies gebruikt worden. `WAGENPARK` en `INVESTERING` zijn letterlijke constanten zonder `REGELS`.
- **Bedragen** in hele centen:
  - dagbedragen `r5` (op 5 €);
  - nieuwprijzen op 500 €;
  - occasions **naar boven** op 100 €;
  - overname en inruil op 100 €;
  - annuïteiten `Math.round` (niet op 5 €, bijvoorbeeld 211,21).

---

# F. AANSCHAF VAN BUSSEN

## F1. Datamodel

**`bedrijf.ts` — `EigenBus`** (:94-110), optionele velden in een omheind blok:

```ts
  // --- wagenpark (ontwerp F); regels in core/wagenpark.ts ---
  bezit?: Bezit                  // 'eigen' | 'lening' | 'lease' | 'huur'; ontbreekt = 'eigen'
  contract?: number              // Contract.id
  geleverdOp?: number            // eerste dag dat hij rijdt; ontbreekt = geleverd
  totDag?: number                // lease/huur: laatste dag; daarna 'afgelopen'
  onderhoudInbegrepen?: boolean  // lease met onderhoud en huur: staat 's nachts 100, pech gratis
  nieuwwaarde?: number           // basis van waardeVan; ontbreekt = REGELS.nieuwprijs[vorm]
  bouwjaar?: number
  kleurstelling?: string         // naam zoals OMSI "Appearance"
  plaatsen?: { zit: number; sta: number }
  lengte?: number                // m, inclusief aanhanger
  inleverenOp?: number           // vanavond inleveren (actie 'inleveren')
```

**`Bezit` en `InzetStatus`** staan in `bedrijf.ts` (alleen typen), zodat de planning ze gebruikt zonder `wagenpark.ts`.

```ts
export type Bezit = 'eigen' | 'lening' | 'lease' | 'huur'
export type InzetStatus = 'inzetbaar' | 'levering' | 'afgelopen' | 'werkplaats' | 'versleten' | 'schade'
```

**`Bedrijf`** (:173-205):
- `contracten?: Contract[]`, `contractTeller?: number`;
- `huurWeg?: number[]`;
- `roodSinds?: number`.
- `busTeller` komt uit deel 0.

**`DagStaat`** (:152-171): `afschrijving?`, `lasten?` (per dag, zonder aflossing), `restschuld?`, `vlootwaarde?`.

**`BoekingSoort`** (:50-69) plus: `'lease' | 'huur' | 'rente' | 'aflossing' | 'vaste-lasten' | 'aanbetaling' | 'borg' | 'borg-terug' | 'contractboete' | 'inruil' | 'overname' | 'beslag' | 'overspuiten'`.

**`BerichtSoort`** (:214-228) plus: `'levering' | 'contract-afloop' | 'contract-einde' | 'lening-af' | 'aanmaning' | 'beslag'`. Een vormcorrectie gebruikt `'vorm'` van PL.

**`core/wagenpark.ts`** (puur):

```ts
export type ContractSoort = 'lening' | 'lease' | 'huur'
export interface Contract {
  id: number; soort: ContractSoort; bus: number
  afgesloten: number; vanaf: number; tot: number          // termijnen vanaf..tot (inclusief)
  perDag: number                                          // lease basis+onderhoud / huur / annuïteit
  basis?: number; fullService?: boolean; borg?: number; kmStart?: number   // lease
  hoofdsom?: number; restschuld?: number; rente?: number                  // lening (rente per dag, vast)
}
export type Aanschaf =
  | { wijze: 'kopen'; inruil?: number }
  | { wijze: 'lening'; aanbetaling: 0.2 | 0.3 | 0.5; looptijd: 90 | 180 | 360; inruil?: number }
  | { wijze: 'lease'; looptijd: 90 | 180 | 360; fullService: boolean }
export interface Verwacht { nuTeBetalen: number; perDag: number }
export type DealerKeuze =
  | { dag: number; bron: 'nieuw'; relativePath: string; kleurstelling?: string; aantal: number; aanschaf: Aanschaf; verwacht: Verwacht }
  | { dag: number; bron: 'occasion'; nr: number; aanschaf: Extract<Aanschaf, { wijze: 'kopen' | 'lening' }>; verwacht: Verwacht }
  | { dag: number; bron: 'huur'; nr: number; dagen: 3 | 7 | 14 | 28; verwacht: Verwacht }
export type WagenparkFout = 'kas' | 'rood' | 'krediet' | 'weg' | 'aanbod' | 'inruil' | 'restschuld' | 'bezit' | 'termijn' | 'ongeldig' | 'catalogus'
export type WagenparkActie =
  | { soort: 'verkopen' } | { soort: 'inleveren' } | { soort: 'overnemen' } | { soort: 'aflossen' }
  | { soort: 'verlengen'; dagen: 7 | 14 | 90 } | { soort: 'overspuiten'; kleurstelling: string }
export type WagenparkUitslag = { bedrijf: Bedrijf; nummers?: number[] } | { fout: WagenparkFout }
export interface Besparing { perDag: number; rituren: number; bron: 'plan' | 'terugval' | 'geen' | 'vol' }
export interface Offerte {
  bron: 'nieuw' | 'occasion' | 'huur'; wijze: 'kopen' | 'lening' | 'lease' | 'huur'
  naam: string; vorm: Busvorm; relativePath: string; kleurstelling?: string; aantal: number
  km: number; staat: number; bouwjaar?: number; nieuwwaarde: number
  prijs: number; korting: 0 | 0.03 | 0.05                       // per bus
  inruil?: { nummer: number; waarde: number; restschuld: number; netto: number }
  aanbetaling?: number; hoofdsom?: number; termijn?: number; totaal?: number; rentePerDag?: number
  leaseBasis?: number; onderhoud?: number; borg?: number; kmTegoed?: number
  huurPerDag?: number; dagen?: number
  nuTeBetalen: number                                          // alle bussen samen; negatief = je krijgt terug
  perDag: number                                               // vaste kosten per dag samen, lening incl. aflossing
  vasteLasten: number                                          // belasting en keuring per dag samen
  levering: number[]                                           // leverdag per bus
  besparing: Besparing[]                                       // per bus van de bestelling
  netto: number                                                // eerste bus: besparing − kosten − verwacht onderhoud
  kredietNa?: number
  fout?: WagenparkFout
}
export interface Lasten {
  lease: number; huur: number; rente: number; aflossing: number; vasteLasten: number
  kosten: number              // lease + huur + rente + vasteLasten (zonder aflossing)
  afschrijving: number        // schatting voor de prognose
  restschuld: number; leaseNog: number; contracten: number
}
```

**`core/dealer.ts`** (puur):

```ts
export interface DealerBus extends MarktBus {
  model: string; merk: string; fabrikant: string; type: string; map: string; bestand: string
  modeljaar?: number; lengte: number; lengteVoor: number; breedte: number; hoogte: number; massa?: number
  zit: number; sta: number; aanhanger: boolean; nieuwprijs: number; levertijd: number
  beschrijving?: Partial<Record<'en' | 'de' | 'fr' | 'nl' | 'basis', string>>
}
export interface DealerModel { sleutel: string; naam: string; merk: string; vorm: Busvorm; map: string
  varianten: string[]; vanafPrijs: number; plaatsen: [number, number]; lengte: number; modeljaar?: number
  opKaarten: Array<{ folder: string; naam: string; wagens: number }> }
export interface DealerCatalogus { bussen: DealerBus[]; modellen: DealerModel[]; mediaanPlaatsen: Record<Busvorm, number> }
export interface Occasion { nr: number; bus: DealerBus; bouwjaar?: number; km: number; staat: number; prijs: number; kleurZaad: number }
export interface Huuraanbod { nr: number; bus: DealerBus; staat: number; perDag: number }
```

## F2. Rekenregels

```ts
export const WAGENPARK = {
  levertijd: { midi: 2, solo: 3, geleed: 4, dubbel: 5 }, levertijdOccasion: 1, levertijdHuur: 1,
  perDagGeleverd: 5, maxAantal: 20, volumekorting: [[10, 0.05], [5, 0.03]],
  vasteLasten: 0.00025,
  lease: { 90: 0.0023, 180: 0.002, 360: 0.0017 }, fullService: 0.0015, leaseVerlengen: 90,
  borgDagen: 10, leaseKmPerDag: 200, meerKm: 20 /* cent/km */, vroegInleverenBoete: 0.5,
  overnameVenster: 5, overnameFactor: 0.95, achterstalligOnder: 50,
  huur: 0.0045, huurDagen: [3, 7, 14, 28], huurVerlengen: [7, 14], huurAanbod: 3,
  lening: { rente: 0.0004, aanbetaling: [0.2, 0.3, 0.5], looptijd: [90, 180, 360], looptijdOccasion: [90, 180] },
  hefboom: 2, leaseWeging: 0.25,
  inruilFactor: 0.9, verkoopFactor: 0.85, occasionOpslag: 1.05, occasionMinMarge: 1_000_00, marktOnderhoud: 1,
  roodRente: 0.001, aanmaningNa: 3, aanmaningElke: 7, beslagNa: 7, beslagFactor: 0.7, roodruimte: 0.1,
  slijtKm: 0.6, afschrijvingTot: 0.85, capaciteit: { min: 0.85, max: 1.15 }, afloopMelding: 3, overspuiten: 0.025
} as const
export const INVESTERING = new Set(['oprichting','bus-koop','bus-verkoop','aanbetaling','aflossing','inruil','overname','borg','borg-terug','beslag'])
```

### Catalogus

**Vorm** (`vormVanMaten` in `busvorm.ts` van deel 0).
- **Invoer:** L_voor uit `[boundingbox]`, L = afstand + L_aanhanger/2 + L_voor/2, H.
- Er is een aanhanger en die is geen fietsaanhanger (`/fahrrad|bike|velo/i`) → geleed.
- L_voor < 8 → `vormVanVoertuig`; bij 'geleed' zonder aanhanger wordt dat 'solo'.
- H > 3,6 → dubbel.
- L < 10,8 → midi.
- Anders solo.

**Nieuwprijs:** `REGELS.nieuwprijs[vorm] × clamp(0,85; 1,15; 0,7 + 0,3 × (zit+sta)/mediaan[vorm])`, afgerond op 500 €. Zonder plaatsen is de factor 1. Die prijs is ook de `nieuwwaarde`.

**Merk:** de eerste regex die past op `type + map + fabrikant`, en anders de fabrikant:
- `/setra|\bs ?31\d\b/` → Setra
- `/iveco|urbanway/` → Iveco
- `/volvo/` → Volvo
- `/öaf|oeaf|\blu ?200\b/` → ÖAF
- `/kajosoft/` → Kajosoft
- `/mercedes|\bmb\b|mb_|evobus|citaro|\bo ?(305|407|530|550|560)\b|abcoach_o560|(^|[_ ])c2([_ ]|$)/` → Mercedes-Benz
- `/\bman\b|man_|lion|\bsd ?20\d|\bsg ?29\d|\bnl ?2\d\d|\bng ?2\d\d|\ba2\d\b/` → MAN

**Model:**
- Sleutel: `map|vorm|round(L)`.
- Naam: merk + het gemeenschappelijke begin van `type`, afgekapt op een woordgrens. Is dat korter dan 4 tekens, dan merk + map.
- Hebben twee modellen dezelfde naam, dan komt de lengte erachter ("(14,9 m)").
- "Rijdt op" per model: `readMapDepot` per kaart, samengeteld per voertuigmap. Exact matchen op pad mist 5 paren (T-F16).

### Waarden

- `waardeVan(bus)` (:472): gebruikt `bus.nieuwwaarde ?? REGELS.nieuwprijs[vorm]`; de rest blijft gelijk.
- `waarde100(bus)` = `waardeVan({...bus, staat: 100, schade: 0})`.
- `achterstallig(bus)` = (staat < 100 ? `onderhoudskosten(bus, 0)` : 0) + `reparatiekosten(bus)`.
- **`marktwaarde(bus)`** = `max(0, waarde100 − 1,0 × achterstallig)`.
- **Occasionprijs** = `ceil100(max(M × 1,05; M + 1.000 €))`.
- **Inruil** = `r100(M × 0,90)`.
- **Verkoop** = `round(M × 0,85)`.
- **Overname** = `r100(waarde100 × 0,95)`.
- **Vlootwaarde** = Σ M over eigen en lening.

### Vaste lasten, onderhoud, slijtage en afschrijving

- **Belasting en keuring:** `r5(nieuwwaarde × 0,00025)` per dag, voor eigen en lening vanaf `geleverdOp`. Loopt ook als de bus stilstaat.
- **Slijtfactor** = `1 + 0,6 × min(1, km/900.000)`, in de slijtage van deel 0 (plan-pad).
- **Afschrijving** per eigen of leningbus: `round(nieuwwaarde × (km_na − km_voor)/900.000)` zolang km_voor < 765.000.

### Lease

- **Basistermijn:** `r5(nieuwwaarde × lease[looptijd])`. Met onderhoud inbegrepen komt daar `r5(nieuwwaarde × 0,0015)` bij.
- **Borg:** 10 × basistermijn, te betalen bij afsluiten.
- **Km:** `kmStart + looptijd × 200`. Daarboven kost het 0,20 € per km. Bij eerder inleveren telt het tegoed naar rato.
- **Periode:** `vanaf = geleverdOp`, `tot = vanaf + looptijd − 1`.
- **Normaal inleveren** (automatisch op `tot`):
  - borg terug;
  - meer-km betalen;
  - schade × 120 € betalen;
  - zonder onderhoud inbegrepen en bij staat < 50: `onderhoudskosten(bus, 0)` als contractboete.
- **Vroeg inleveren:** boete = `round(0,5 × perDag × (tot − dag))`. Borg terug.
- **Overnemen:** alleen als `dag ≥ tot − 4`, voor de overnameprijs. Borg terug en km afrekenen.
- **Verlengen:** in hetzelfde venster, `tot += 90`, `perDag` = tarief voor 90 dagen (+ onderhoud), km-tegoed + 18.000.
- **Onderhoud inbegrepen:** staat 's nachts 100, pech kost 0 (PL-B).

### Huur

- **Prijs:** `r5(nieuwwaarde × 0,0045)` per dag.
- **Duur:** 3, 7, 14 of 28 dagen, onderhoud inbegrepen, geen borg, geen kredietcontrole.
- **Levering:** morgen; `vanaf = geleverdOp = dag + 1`.
- **Verlengen:** met 7 of 14 dagen, altijd, zonder maximum.
- **Eerder inleveren** ('s avonds): geen boete, de huur loopt tot en met die dag.
- **Schade** bij inleveren × 120 €.
- **Aanbod:** 3 per dag (solo, geleed en een willekeurige vorm), elk uit een willekeurige modelgroep; `reeks(dag × 4583 + lengte bedrijfsnaam)`, staat 80–95.

### Lening

- **Aanbetaling:** ≥ pct × prijs. `aanbetaling = max(pct × prijs, netto inruil)`.
- **Nu te betalen** = aanbetaling − netto inruil. Is de netto inruil negatief (restschuld groter dan inruilwaarde), dan komt het verschil erbij.
- **Hoofdsom:** P = prijs − aanbetaling. P ≤ 0 → fout 'ongeldig' ("kies Kopen").
- **Annuïteit:** A = `round(P·r/(1−(1+r)^−n))`, r = 0,0004. Termijnen vanaf de dag van afsluiten.
- **Per dag:**
  - rente = `round(rest × r)`;
  - aflossing = `min(rest, A − rente)`; op `tot` de hele rest.
- **Voorbeeld NLC 88.500 €, 20 %, 360 dagen:** aanbetaling 17.700 €, termijn **€ 211,21**, totaal **€ 76.033,93**, rente ongeveer € 15 per dag.
- **Vervroegd aflossen:** altijd, zonder kosten.

### Krediet

- **Eigen vermogen** = kas + Σ M(eigen, lening) − Σ restschuld + Σ borg.
- **Verplichtingen** = Σ restschuld + 0,25 × Σ lease-basis × (tot − dag + 1).
- **Kredietruimte** = kas < 0 ? 0 : `max(0, 2 × eigen vermogen − verplichtingen)`.
- **Controle:**
  - lening: P × aantal ≤ ruimte;
  - lease: 0,25 × basis × looptijd × aantal ≤ ruimte;
  - lease verlengen: 0,25 × basis × 90 ≤ ruimte.

### Inruil en verkoop

- **Netto inruil** = inruilwaarde − restschuld (mag negatief zijn). Er kan één inruilbus per bestelling.
- **Verkopen** mag alleen bij eigen of lening. Een lening wordt eerst uit de opbrengst afgelost. Is de opbrengst kleiner dan de restschuld, dan moet de kas het verschil hebben, anders fout 'restschuld'.
- **Lease en huur** kun je niet verkopen of inruilen (fout 'bezit').

### Overspuiten

- Alleen eigen of lening.
- Kost `r100(nieuwwaarde × 0,025)`: solo 1.500 €, geleed 2.100 €.
- `werkplaatsTot = dag`, `kleurstelling` = de nieuwe naam.

### Volume

- Alleen bij nieuw, `aantal` 1–20.
- Korting op de prijs: vanaf 5 bussen 3 %, vanaf 10 bussen 5 %. Bij lease en huur geen korting.
- Bus i wordt geleverd op `dag + levertijd + floor(i/5)`.
- Per bus komt er een eigen contract.

### Marginale besparing

```ts
export function marginaleBesparing(b: Bedrijf, week: Dagrooster[], extra: number, f: { inhuur: number }): Besparing[]
```

- Voor elke dag d van de week:
  - omlopen = alle `OmloopVanDag` van de kaarten zonder fout, en alleen van lijnen met een concessie;
  - voeg synthetische omlopen toe voor concessies die terugvallen: `c.week.piekOmlopen` × `gemRituren/gemOmlopen`;
  - sorteer aflopend op rituren;
  - n = aantal bussen met `isInzetbaar(bus, d)`.
- Bus i van de bestelling krijgt R = `omlopen[n+i]?.rituren ?? 0`.
- `perDag` = het gemiddelde over de dagen van `besparingBus(R, f)` (plantarief).
- Bron:
  - 'geen' zonder concessie;
  - 'vol' als alle R 0 zijn;
  - anders 'plan' of 'terugval'.
- **Netto** (eerste bus) = perDag − kosten per dag van de wijze (zonder aflossing) − belasting en keuring − `verwachtOnderhoud(R̄)`.
  - `verwachtOnderhoud(R̄)` = R̄ × 0,4 × (1 − remming) × slijtfactor × (25 € × (1 − korting) × f.onderhoud + 600 €/50 × (1 − korting) × f.onderhoud) + stilstand.
  - Geen verwacht onderhoud bij onderhoud inbegrepen en bij huur.
  - Pech telt niet mee; die laat PL-A zien.

### Occasions

- Aantal: `bedrijfsfactoren(b).tweedehands` (4 of 6), met `reeks(dag × 7919 + lengte naam)` zoals nu (:516).
- Eerst een modelgroep uniform kiezen, dan een variant.
- km = 120k–680k, staat = 40–90, `bouwjaar = modeljaar + ⌊k·6⌋`, `kleurZaad = k()`.
- Kleurstelling bij kopen = `lijst[floor(kleurZaad × n)]` uit `busKleurstellingen`.

### Blokkades

- Bij kas < 0 kun je niets aanschaffen, verlengen, overnemen of overspuiten (fout 'rood').
- Na betaling moet de kas ≥ 0 zijn.
- **Onderhoud en reparatie** mogen tot `−roodruimte` = −round(0,1 × vlootwaarde). Dit komt in de kascontrole van `naarWerkplaats` (:601), `zelfOnderhoud` (:847) en `zelfRepareren` (:865), zodat een bus in het rood niet voorgoed stil blijft staan (T-F2).

## F3. Dagafsluiting (`wagenparkNaDag(uit, voor): { bedrijf; afschrijving; kasGemeld: boolean }`)

**Plaats.** De aanroep staat in `sluitDagAf`, direct na de slijtage (in HEAD :1222-1243; in PL het blok per bus met `busUren`) en vóór de concessies (:1245). Stappen, voor dag D = `uit.dag`:

1. **Termijnen**, per soort samengevoegd tot één boeking. Contracten met `vanaf ≤ D ≤ tot`:
   - 'lease' en 'huur' (`perDag`);
   - lening: 'rente' en 'aflossing';
   - 'vaste-lasten' voor eigen en lening met `geleverdOp ≤ D`.
   - `wat` is bijvoorbeeld "{n} bussen". Hooguit 5 boekingen.
2. **Onderhoud inbegrepen / huur:** staat = 100.
3. **Afloop:**
   - lease of huur met `tot === D` of `inleverenOp === D`: inleveren volgens F2 (boekingen 'borg-terug' en 'contractboete'). Bus weg via `verwijderBus` (deel 0, ruimt ook `rooster.bussen` en `vandaag.busInvulling` op). Bericht 'contract-einde';
   - lening met restschuld 0: contract dicht, `bezit` wordt 'eigen', bericht 'lening-af';
   - contract zonder bus: stil dicht.
4. **Vooruit melden:**
   - `tot − D === 3` → 'contract-afloop' {nummer, soort, prijs = overnameprijs};
   - `geleverdOp === D + 1` → 'levering' {nummer, naam}.
5. **Afschrijving** uit km_na − km uit `voor`.
6. **Rood:**
   - kas < 0 → 'rente' −round(−kas × 0,001), wat = "Rood staan";
   - `roodSinds ??= D`; n = D − roodSinds + 1;
   - n = 3, 10, 17, … → 'aanmaning' {dagen: n, kas, over: max(0, 7 − n)};
   - n ≥ 7 → hooguit één **beslag**. Kandidaten zijn eigen of leningbussen die niet in levering zijn, met netto = round(M × 0,7) − restschuld > 0. Eerst bussen die niet in `rooster.bussen` staan, daarna de hoogste netto. Boeking 'beslag' +opbrengst en 'aflossing' −restschuld, bus weg (`verwijderBus`), bericht 'beslag'. Geen kandidaat → geen beslag;
   - kas ≥ 0 → `roodSinds` wissen.
7. `huurWeg: []`.

**Daarna in `sluitDagAf`:**
- `investering` (:1270) wordt `INVESTERING`;
- `resultaat` = boekingen buiten `INVESTERING` − afschrijving (één helper `resultaatVan(b, dag, afschrijving)`);
- DagStaat krijgt `afschrijving`, `lasten`, `restschuld` en `vlootwaarde`;
- het bericht 'kas' (:1306) komt alleen als `!kasGemeld` (T-F8).

**Boekingen per dag.** De termijnen geven hooguit 5 boekingen per dag. Gebeurtenissen (borg terug, boete, beslag, rente bij rood) komen er los bij (T-F17). `boekingenBewaard` (200) blijft.

**Prognose.**
- **Oud pad:** `dagprognose` (:657) krijgt `lasten: Lasten`, en `kosten += lasten.kosten` (:688-689).
- **Plan-pad:** F voegt in `afrekening` (PL-A, `rooster.ts`) toe: `cijfers.wagenpark = { lasten, aflossing, afschrijving }` en `kosten += lasten`.
  - Dit verandert de proef van PL-A: kas-delta = vergoeding − kosten + legacyZelf − aflossing, bij kas ≥ 0.
  - De afschrijving is in het plan-pad exact te voorspellen: km += busUren × 22 (T-F18).

## F4. Bestanden en signaturen

**Eigendom van F:**

- **`src/core/wagenpark.ts`:**
  - `WAGENPARK`, `INVESTERING`;
  - `bezitVan(bus)`, `contractVan(b, nummer)`;
  - `annuiteit(P, r, n)`, `leaseTermijn(nw, looptijd, fs)`, `huurPrijs(nw)`, `slijtfactor(bus)`;
  - `waarde100`, `marktwaarde`, `inruilwaarde(b, nummer)`, `verkoopopbrengst`, `overnameprijs`, `vlootwaarde(b)`;
  - `restschuld(b)`, `eigenVermogen(b)`, `verplichtingen(b)`, `kredietruimte(b)`, `roodruimte(b)`;
  - `wagenparkLasten(b, dag?)`, `marginaleBesparing(…)`, `verwachtOnderhoud(…)`;
  - `occasions(b, cat)`, `huuraanbod(b, cat)`;
  - `valideerKeuze(b, keuze, cat): DealerKeuze | { fout }`;
  - `offerte(b, keuze, cat, week?): Offerte`;
  - `sluitAf(b, keuze, cat, kleurstellingen?: Record<string, string[]>, week?): WagenparkUitslag`;
  - `wagenparkActie(b, nummer, actie): WagenparkUitslag`;
  - `wagenparkNaDag(uit, voor)`;
  - `vulSpecsAan(b, cat): Bedrijf`;
  - `wagenparkAandacht(b): Array<{ soort: 'laat'|'let'; sleutel: TextKey; v: Record<string,string|number>; tab: Tab; focus?: Focus }>`.
- **`src/core/dealer.ts`:** de typen uit F1, `merkVan`, `nieuwprijsVan(bus, mediaan)`, `groepeerModellen(bussen, remises)`, `modelnaam`.
- **`src/core/busspec.ts`** (met fs, alleen in de werker):
  - `leesDealerCatalogus(omsiPad, voertuigen: Vehicle[], kaarten: Array<{ folder; naam; pad }>): DealerCatalogus`;
  - leest `[boundingbox]`, `[mass]`, `[kmcounter_init]` (alleen het jaar), `[description]`, `<stam>_{ENG,DEU,FRA,NLD}.dsc`, passengercabin (`[passpos]`, het 4e getal > 0 = zitplaats), `trailerOf` en `readMapDepot`;
  - geen ontdubbeling op naam.
- **`src/main/dealer.ts`:**
  - `registreerDealer(deps: { handle, werkerVraag, sluitWerker, inSlot, career, persist, careerPayload, dagroosters, kleurstellingen, log, logFout })`, `laadCatalogusNaStart()` en `vergeetDealer()`;
  - de catalogus is één promise per sessie, op een eigen werker (`Werksoort 'dealer'`) die daarna sluit;
  - `vulSpecsAan` in `inSlot`, op het **opnieuw gelezen** `career.bedrijf`, en alleen `persist` als het profiel nog hetzelfde is en er iets veranderde (T-F11).
- **Renderer:**
  - `BedrijfDealer.tsx` en `dealer.css` (prefix `dl-`);
  - `BedrijfWagenpark.tsx` (neemt het over van PL-A na de integratie): `Wagenpark`, `BusRij`, `Contracten`, `Bus3dVenster` (gebruikt `BusViewer` uit G);
  - `Markt` vervalt, en PL-A's `bd.plan.busLoont` vervalt mee.
- **`src/shared/tekst/wagenpark.ts`.**
- **`scripts/probe-contracten.ts`** en **`scripts/probe-dealer.cjs`.**

**Raakpunten (omheind):**

- **`bedrijf.ts`:**
  - velden en unions (F1);
  - `inzetStatus`, met `isInzetbaar` (:479) als `inzetStatus(…) === 'inzetbaar'`. Volgorde: levering → afgelopen → werkplaats → versleten (staat < 25) → schade (≥ 50);
  - `waardeVan` (:472): Pick krijgt `nieuwwaarde`;
  - `onderhoudskosten` (:487) geeft 0 als `onderhoudInbegrepen`;
  - de kascontroles :601, :847 en :865 (roodruimte);
  - `dagprognose` (:688);
  - `sluitDagAf` (hook, `INVESTERING` :1270, DagStaat, 'kas' :1306).
- **`busvorm.ts`** (deel 0): `vormVanMaten`.
- **`rooster.ts`** (A): `afrekening` → `cijfers.wagenpark`.
- **Slijtregel van deel 0** (plan-pad): × `slijtfactor(bus)`.
- **`uitval.ts`** (B): pechkosten × (`onderhoudInbegrepen` ? 0 : 1).
- **Bedrijf.tsx (schil):**
  - render-switch 'markt' → `<Dealer bedrijf handel naar focus>`;
  - navigatielabel 'markt' → `bd.nav.dealer`.
- **`BedrijfDashboard.tsx`:**
  - de tegel Wagenpark rekent met `vlootwaarde(bedrijf)`;
  - de tegel Kas krijgt een extra regel `bd.obligations` als er contracten zijn. Er komt geen 7e tegel: `.bd-tegels` heeft 6 kolommen (`bedrijf.css`:224) en 3 onder 1400 px (:1153);
  - `lijst.push(...wagenparkAandacht(b))`;
  - de oude regel `bd.alert.cash` alleen bij n < 3.
- **`BedrijfPost.tsx`:**
  - `Afzender` (:18) krijgt `'dealer' | 'bank'`;
  - `AFZENDER` (:20): levering / contract-afloop / contract-einde → dealer; lening-af / aanmaning / beslag → bank;
  - `BEDRAGEN` (:38) krijgt `prijs`, `borg`, `restschuld`, `bedrag` en `kas` erbij;
  - de tekst van contract-afloop kiest `.lease` of `.huur` (zoals 'afloop' :63);
  - `toon` (:70): aanmaning en beslag 'slecht', levering en lening-af 'goed';
  - 'levering' krijgt knop `tb.knop.bekijk` → `naar('wagenpark', { bus })`.
- **`App.tsx`** (D): het kleurscherm van de bedrijfsrit kiest vooraf `EigenBus.kleurstelling`.
- **`kaartwerker.ts`:** opdracht `{ soort: 'dealercatalogus' }` → `leesDealerCatalogus(omsiPath, laag.voertuigen(), kaarten)`.
- **`index.ts`:**
  - `Werksoort` (:344) krijgt `'dealer'`;
  - `registreerDealer` in `registerHandlers` (:3540);
  - `vergeetDealer()` in `vergeetKaarten` (:262);
  - `laadCatalogusNaStart()` na de voertuigen in `warmKaarten` (:559), alleen als er een bedrijf is;
  - de handlers `bedrijf:markt`, `bedrijf:koop` en `bedrijf:verkoop` (:4973-4996) eruit.
- **`api.ts` / preload:**
  - erbij: `dealerCatalogus`, `dealerKoersrol`, `dealerSluitAf`, `wagenparkActie`;
  - eruit: `bedrijfMarkt`, `bedrijfKoop`, `bedrijfVerkoop` (HEAD `api.ts`:794-799, preload :145-147);
  - `koopNieuw`, `koopTweedehands` en `verkoop` blijven in `bedrijf.ts` voor `probe-bedrijf.ts`.

## F5. ipc

| Kanaal | Aanroep | Antwoord |
|---|---|---|
| `dealer:catalogus` | `dealerCatalogus()` | `DealerCatalogus \| { fout: 'catalogus' }` |
| `dealer:koersrol` | `dealerKoersrol(relativePath)` | `Array<{ mapFolder; lineFile; lijn; bekend; totaal }>`; per concessie `hofaanbodrit`, met als termini de `terminus` van de ritten van die lijn |
| `dealer:sluitAf` | `dealerSluitAf(keuze: DealerKeuze)` | `{ payload; fout?: WagenparkFout; nummers?: number[]; offerte?: Offerte }` |
| `wagenpark:actie` | `wagenparkActie(nummer, actie: WagenparkActie)` | `{ payload; fout?: WagenparkFout }` |

**`dealer:sluitAf`** loopt in `inSlot`:
1. Catalogus, `dagroosters(dag, dag+6)` en `kleurstellingen` ophalen.
2. `career.bedrijf` opnieuw lezen.
3. `valideerKeuze`.
4. `offerte` opnieuw uitrekenen. Wijkt `verwacht` af, dan fout 'aanbod' met de nieuwe offerte.
5. `sluitAf` en `persist`.

**Het venster** rekent de offerte live: `offerte(b, keuze, cat, week)`, met `week` uit `bedrijfDagen(dag, dag+6)` (PL, hooguit 10 dagen).

**Controle in het hoofdproces** (T-F13), anders fout 'ongeldig':
- `dag === b.dag` (anders 'aanbod');
- bron, nr en pad (anders 'weg' of 'catalogus');
- `aantal` is een geheel getal van 1 tot 20;
- aanbetaling ∈ {0,2; 0,3; 0,5};
- looptijden: lening {90, 180, 360}, maar voor occasions {90, 180}; lease {90, 180, 360};
- huurdagen ∈ {3, 7, 14, 28};
- kleurstelling staat in de lijst;
- inruil: bestaat, is eigen of lening, en is niet in levering;
- acties: de soort bestaat, verlengdagen ∈ {7, 14} voor huur en 90 voor lease binnen het venster (anders 'termijn').

## F6. Schermen en tekst (NL)

**Zijbalk:** "Dealer" (tab-id blijft 'markt'). Een focus `{ vorm }` uit de planning ("leeg busvak → markt, gefilterd op vorm") zet het filter.

### Tabbladen: Nieuw · Occasions · Verhuur

**Nieuw**

- **Bovenaan:**
  - de merkenstrook "Alle · MAN · Mercedes-Benz · Kajosoft · Setra · …";
  - het zoekveld "Zoek op merk of type";
  - "Alle · Midibus · Solobus · Gelede bus · Dubbeldekker";
  - "Sorteren: Prijs · Plaatsen · Bouwjaar";
  - de schakelaar "Alleen wat op mijn lijnen past".
- **Raster van 60 modelkaarten.** Per kaart:
  - foto (`busFotoAlsKlaar` van de eerste variant, anders het busicoon);
  - naam met vormlabel;
  - "18,1 m · 97 plaatsen · model 2019";
  - "vanaf € 88.500";
  - "15 uitvoeringen";
  - "Levering in 4 dagen";
  - [Bekijken] en het vinkje "Vergelijken".
- **Vergelijken:** met 2–3 vinkjes verschijnt onderaan [Vergelijk (3)]. Dat opent een tabel met de specificaties naast elkaar, zonder 3D.
- **Laden:** "De dealer leest je bussen in…". Mislukt het: "De bussen konden niet gelezen worden." [Opnieuw]. Leeg: "Geen bussen gevonden in de OMSI-map."

**Showroom** (vervangt het raster; bovenaan "← Terug naar het aanbod")

*Links:* `<BusViewer relativePath kleurstelling kleurkeuze draaiplateau onKleurstelling>` (G).

*Rechts:*
- "Uitvoering: [3-deurs Voith ▾]".
- **Specificaties:**
  - Merk · Lengte 18,1 m · Breedte 2,55 m · Hoogte 3,05 m · Gewicht 16,3 t · Zitplaatsen 47 · Staanplaatsen 50 · Modeljaar 2019;
  - "Rijdt op: Ahlheim (6 in de remise)", of "Staat op geen enkele kaart in de remise".
- **Koersrol:** "Koersrol past op lijn 109: 38 van 40 bestemmingen", of in rood "Koersrol kent maar 4 van 40 bestemmingen van lijn 109".
- **Brochure:** "Uit de brochure" (inklapbaar), met "(in het Duits)" als de tekst niet in de taal van de speler is.

*Paneel "Zo schaf je hem aan":* [Kopen · Financieren · Leasen], plus "Aantal [1 ▾ … 20]" en bij ≥ 5 "Volumekorting 3%".

- **Kopen:**
  - "Prijs € 88.500";
  - "Inruil: [Geen inruil ▾ | 104 · MAN SD200 (je krijgt € 46.300)]" (bij 400.000 km en staat 70). Met lening erop: "waarvan € … naar de bank voor de lening";
  - "Nu te betalen € 42.200" (of "Je krijgt nu terug € …");
  - "Belasting en keuring € 20 per dag";
  - "Levering op dag 17", of bij meer bussen "Levering van dag 17 tot dag 18, 5 per dag";
  - [Kopen].
- **Financieren:**
  - "Aanbetaling [20% · 30% · 50%]" en "Looptijd [90 · 180 · 360 dagen]";
  - "Rente 0,04% per dag";
  - "Termijn € 211,21 per dag";
  - "Totaal terug te betalen € 76.033,93";
  - "Financieren kost je ongeveer € 15 per dag aan rente";
  - "Nu te betalen € 17.700";
  - "Kredietruimte € …";
  - [Financiering afsluiten].
- **Leasen:**
  - "Looptijd [90 · 180 · 360 dagen]";
  - schakelaar "Onderhoud inbegrepen (+€ 135 per dag)", met eronder "De leasemaatschappij houdt hem elke nacht op staat 100; pech kost je niets.";
  - "Termijn € 285 per dag" (360 dagen met onderhoud);
  - "Borg € 1.500, terug bij inleveren";
  - "72.000 km inbegrepen, daarboven € 0,20 per km";
  - "Aan het eind lever je hem in, of neem je hem in de laatste 5 dagen over voor zijn waarde als nieuw onderhouden min 5%.";
  - [Lease afsluiten].
- **Onderaan, altijd:**
  - "Bij jouw lijnen rijdt deze bus ongeveer 7,3 dienstregelingsuren per dag en bespaart hij € 276 per dag." en "Na termijn, belasting en onderhoud blijft er € … per dag over (terug in … dagen)";
  - of "Je hebt al genoeg bussen voor al je omlopen: deze bus bespaart nu niets.";
  - of "Je hebt nog geen concessie; een bus bespaart pas iets als hij omlopen rijdt.";
  - bij aantal > 1 staat per bus een regel met de besparing.
- **Knop uit, met de reden eronder:** "Te weinig kas" / "Je staat rood: eerst de kas aanvullen" / "De bank leent niet meer: je kredietruimte is op".

**Bevestigscherm "Bestelling bevestigen"** (geen `window.confirm`):
- samenvatting van de offerte, [Bevestigen] [Annuleren];
- daarna "MAN Lion's City 18C besteld; hij rijdt vanaf dag 17 als bus 112.", of bij meer bussen "5 × … besteld: bus 112 tot 116, geleverd van dag 17 tot 17.";
- bij fout 'aanbod': "Het aanbod is veranderd; bekijk de nieuwe bedragen." met de nieuwe offerte.

**Occasions · dag 12**
- Kaarten: foto, "MAN SD202", vormlabel, "Bouwjaar 1987 · 412.000 km", "in de kleuren van {kleurstelling}", staatbalk, "€ 52.500", [Bekijken].
- De showroom heeft alleen Kopen en Financieren (looptijd 90 of 180), zonder aantal en zonder keuze voor de uitvoering. De viewer toont zijn kleurstelling.
- Alles weg: "Alles van vandaag is weg; morgen is er nieuw aanbod."

**Verhuur · dag 12**
- Uitleg: "Morgen inzetbaar, onderhoud inbegrepen, per dag te betalen. Voor een bus die vandaag uitvalt: Vervangende bus in de planning."
- Kaarten: foto, naam, "€ 270 per dag", "Aantal dagen [3 · 7 · 14 · 28]", "Samen € 810", [Huren].
- Daarna: "{naam} gehuurd tot en met dag 15 als bus 117; hij rijdt vanaf morgen."

### Wagenpark · 7 bussen

- **Filter:** "Alle · Eigen · Financiering · Lease · Huur · In aflevering".
- **Groepering:** vanaf 3 bussen van hetzelfde model inklapbaar: "4 × MAN Lion's City 18C".
- **Regel per bus:**
  - foto 48 px, nummer, naam en label: "Eigen" / "Financiering · rest € 31.200" / "Lease · tot dag 190" / "Huur · tot dag 15" / "In aflevering · dag 17" / "Niet meer geïnstalleerd";
  - "Gelede bus · 18,1 m · 97 plaatsen · 214k km · waard € 51.300" (marktwaarde);
  - staatbalk en status: nieuw zijn "In aflevering" en "Contract afgelopen"; "Wordt vanavond ingeleverd".
- **Knoppen:**
  - de bestaande (onderhoud, zelf, reparatie);
  - [3D];
  - lening: [Aflossen € …];
  - lease: [Inleveren] of [Inleveren (boete € 4.725)], en in de laatste 5 dagen [Overnemen € 55.300] en [Verlengen +90 dagen];
  - huur: [Verlengen +7 dagen] [Verlengen +14 dagen] [Inleveren];
  - eigen en lening: [Overspuiten € 1.500] en [Verkopen].
- **Vragen** (eigen venster):
  - "Bus 107 vanavond inleveren? Boete € 4.725, borg terug € 1.200.";
  - "Bus 107 overnemen voor € 55.300? Hij wordt dan van jou.";
  - "Bus 101 verkopen voor € …? Daarvan gaat € … naar de bank.";
  - "Bus 104 overspuiten in {kleurstelling} voor € 1.500? Hij staat dan vandaag in de werkplaats."
- **[3D]** opent het venster "Bus 107 · MAN SD200" met de viewer in de kleurstelling van die bus en met kleurstalen. Kies je een andere kleurstelling, dan wordt [Overspuiten € …] actief. Plus [Sluiten].
- **Paneel "Contracten en verplichtingen":**
  - "Lease 12 · bus 107 · € 210 per dag · dag 10–189 · borg € 1.200";
  - "Lening 3 · bus 101 · € 143,19 per dag · rest € 31.200 · tot dag 360";
  - "Huur 14 · bus 117 · € 270 per dag · dag 13–15";
  - "Samen € 1.240 per dag · restschuld € 96.400 · lease nog € 38.700";
  - "Onderhoud kan tot € … in het rood."

### Dashboard

- **Tegel Kas**, extra regel: "Vaste lasten € 1.240 per dag · restschuld € 96.400".
- **Aandacht:**
  - "Lease van bus 107 loopt over 3 dagen af";
  - "Bus 112 wordt op dag 17 afgeleverd";
  - "Je staat 4 dagen rood; vanaf dag 7 haalt de bank bussen op" (rood);
  - vanaf dag 7: "De bank haalt bussen op tot de kas weer boven nul staat".

## F7. Vertaalsleutels

In `tekst/wagenpark.ts`, alle vier talen. Hieronder de Nederlandse tekst.

**Dealer**

| Sleutel | Nederlandse tekst |
|---|---|
| bd.nav.dealer | Dealer |
| bd.dl.tab.new / .used / .rent | Nieuw / Occasions / Verhuur |
| bd.dl.search | Zoek op merk of type |
| bd.dl.all | Alle |
| bd.dl.brands | Merken |
| bd.dl.sort | Sorteren |
| bd.dl.sort.price / .seats / .year | Prijs / Plaatsen / Bouwjaar |
| bd.dl.fitsOnly | Alleen wat op mijn lijnen past |
| bd.dl.fromPrice | vanaf {money} |
| bd.dl.variants | {n} uitvoeringen |
| bd.dl.delivery | Levering in {n} dagen |
| bd.dl.deliveryTomorrow | Morgen inzetbaar |
| bd.dl.view | Bekijken |
| bd.dl.compare | Vergelijken |
| bd.dl.compareN | Vergelijk ({n}) |
| bd.dl.compareTitle | Vergelijken |
| bd.dl.back | ← Terug naar het aanbod |
| bd.dl.cardLine | {length} m · {seats} plaatsen · model {year} |
| bd.dl.cardLineNoYear | {length} m · {seats} plaatsen |
| bd.dl.usedLine | Bouwjaar {year} · {km} km |
| bd.dl.usedColours | in de kleuren van {livery} |
| bd.dl.usedTitle | Occasions · dag {day} |
| bd.dl.rentTitle | Verhuur · dag {day} |
| bd.dl.rentNote | Morgen inzetbaar, onderhoud inbegrepen, per dag te betalen. Voor een bus die vandaag uitvalt: Vervangende bus in de planning. |
| bd.dl.perDay | {money} per dag |
| bd.dl.empty | Geen bussen gevonden in de OMSI-map. |
| bd.dl.soldOut | Alles van vandaag is weg; morgen is er nieuw aanbod. |
| bd.dl.loading | De dealer leest je bussen in… |
| bd.dl.catalogFailed | De bussen konden niet gelezen worden. |
| bd.dl.retry | Opnieuw |

**Specificaties**

| Sleutel | Nederlandse tekst |
|---|---|
| bd.dl.spec.brand / .length / .width / .height / .mass / .seats / .standing / .year / .maps / .variant / .livery | Merk / Lengte / Breedte / Hoogte / Gewicht / Zitplaatsen / Staanplaatsen / Modeljaar / Rijdt op / Uitvoering / Kleurstelling |
| bd.dl.liveryDefault | Standaard |
| bd.dl.mapsLine | {map} ({n} in de remise) |
| bd.dl.mapsNone | Staat op geen enkele kaart in de remise |
| bd.dl.brochure | Uit de brochure |
| bd.dl.brochureLang | (in het {lang}) |
| bd.dl.lang.en / .de / .fr / .nl | Engels / Duits / Frans / Nederlands |
| bd.dl.fits | Koersrol past op lijn {line}: {known} van {total} bestemmingen |
| bd.dl.fitsNot | Koersrol kent maar {known} van {total} bestemmingen van lijn {line} |

**Aanschaf**

| Sleutel | Nederlandse tekst |
|---|---|
| bd.dl.buyHow | Zo schaf je hem aan |
| bd.dl.way.buy / .loan / .lease / .rent | Kopen / Financieren / Leasen / Huren |
| bd.dl.count | Aantal |
| bd.dl.discount | Volumekorting {pct}% |
| bd.dl.price | Prijs {money} |
| bd.dl.tradeIn | Inruil |
| bd.dl.tradeInNone | Geen inruil |
| bd.dl.tradeInOpt | {bus} · {name} (je krijgt {money}) |
| bd.dl.tradeInDebt | waarvan {money} naar de bank voor de lening |
| bd.dl.payNow | Nu te betalen {money} |
| bd.dl.receiveNow | Je krijgt nu terug {money} |
| bd.dl.fixed | Belasting en keuring {money} per dag |
| bd.dl.deliveryDay | Levering op dag {day} |
| bd.dl.deliverySpread | Levering van dag {from} tot dag {to}, 5 per dag |
| bd.dl.downPayment | Aanbetaling |
| bd.dl.term | Looptijd |
| bd.dl.days | {n} dagen |
| bd.dl.interest | Rente 0,04% per dag |
| bd.dl.interestCost | Financieren kost je ongeveer {money} per dag aan rente |
| bd.dl.instalment | Termijn {money} per dag |
| bd.dl.totalRepay | Totaal terug te betalen {money} |
| bd.dl.creditRoom | Kredietruimte {money} |
| bd.dl.fullService | Onderhoud inbegrepen (+{money} per dag) |
| bd.dl.fullServiceNote | De leasemaatschappij houdt hem elke nacht op staat 100; pech kost je niets. |
| bd.dl.deposit | Borg {money}, terug bij inleveren |
| bd.dl.kmIncluded | {km} km inbegrepen, daarboven € 0,20 per km |
| bd.dl.leaseEnd | Aan het eind lever je hem in, of neem je hem in de laatste 5 dagen over voor zijn waarde als nieuw onderhouden min 5%. |
| bd.dl.rentDays | Aantal dagen |
| bd.dl.rentTotal | Samen {money} |
| bd.dl.saves | Bij jouw lijnen rijdt deze bus ongeveer {hours} dienstregelingsuren per dag en bespaart hij {money} per dag. |
| bd.dl.savesNet | Na termijn, belasting en onderhoud blijft er {money} per dag over. |
| bd.dl.payback | terug in {days} dagen |
| bd.dl.savesNothing | Je hebt al genoeg bussen voor al je omlopen: deze bus bespaart nu niets. |
| bd.dl.savesNoConcession | Je hebt nog geen concessie; een bus bespaart pas iets als hij omlopen rijdt. |
| bd.dl.doBuy / .doLoan / .doLease / .doRent | Kopen / Financiering afsluiten / Lease afsluiten / Huren |
| bd.dl.why.kas / .rood / .krediet | Te weinig kas / Je staat rood: eerst de kas aanvullen / De bank leent niet meer: je kredietruimte is op |
| bd.dl.confirmTitle | Bestelling bevestigen |
| bd.dl.confirm / .cancel | Bevestigen / Annuleren |
| bd.dl.ordered | {name} besteld; hij rijdt vanaf dag {day} als bus {bus}. |
| bd.dl.orderedN | {n} × {name} besteld: bus {first} tot {last}, geleverd van dag {from} tot {to}. |
| bd.dl.rented | {name} gehuurd tot en met dag {day} als bus {bus}; hij rijdt vanaf morgen. |
| bd.dl.changed | Het aanbod is veranderd; bekijk de nieuwe bedragen. |

**Wagenpark**

| Sleutel | Nederlandse tekst |
|---|---|
| bd.wp.title | Wagenpark · {n} bussen |
| bd.wp.filter.all / .own / .loan / .lease / .rent / .delivery | Alle / Eigen / Financiering / Lease / Huur / In aflevering |
| bd.wp.badge.own | Eigen |
| bd.wp.badge.loan | Financiering · rest {money} |
| bd.wp.badge.lease | Lease · tot dag {day} |
| bd.wp.badge.rent | Huur · tot dag {day} |
| bd.wp.badge.delivery | In aflevering · dag {day} |
| bd.wp.badge.missing | Niet meer geïnstalleerd |
| bd.wp.line | {shape} · {length} m · {seats} plaatsen · {km}k km · waard {money} |
| bd.wp.group | {n} × {name} |
| bd.wp.payOff | Aflossen {money} |
| bd.wp.return | Inleveren |
| bd.wp.returnFine | Inleveren (boete {money}) |
| bd.wp.returnPlanned | Wordt vanavond ingeleverd |
| bd.wp.takeOver | Overnemen {money} |
| bd.wp.extend | Verlengen +{n} dagen |
| bd.wp.view3d | 3D |
| bd.wp.repaint | Overspuiten {money} |
| bd.wp.sellAsk | Bus {bus} verkopen voor {money}? |
| bd.wp.sellDebt | Daarvan gaat {money} naar de bank. |
| bd.wp.returnAsk | Bus {bus} vanavond inleveren? Boete {fine}, borg terug {deposit}. |
| bd.wp.takeOverAsk | Bus {bus} overnemen voor {money}? Hij wordt dan van jou. |
| bd.wp.repaintAsk | Bus {bus} overspuiten in {livery} voor {money}? Hij staat dan vandaag in de werkplaats. |
| bd.wp.contracts | Contracten en verplichtingen |
| bd.wp.contract.lease | Lease {id} · bus {bus} · {money} per dag · dag {from}–{to} · borg {deposit} |
| bd.wp.contract.huur | Huur {id} · bus {bus} · {money} per dag · dag {from}–{to} |
| bd.wp.contract.lening | Lening {id} · bus {bus} · {money} per dag · rest {debt} · tot dag {to} |
| bd.wp.totals | Samen {money} per dag · restschuld {debt} · lease nog {lease} |
| bd.wp.redLimit | Onderhoud kan tot {money} in het rood. |
| bd.status.delivery / .ended | In aflevering / Contract afgelopen |

**Dashboard**

| Sleutel | Nederlandse tekst |
|---|---|
| bd.obligations | Vaste lasten {money} per dag · restschuld {debt} |
| bd.alert.contractEnds | {soort} van bus {bus} loopt over {n} dagen af |
| bd.alert.delivery | Bus {bus} wordt op dag {day} afgeleverd |
| bd.alert.red | Je staat {n} dagen rood; vanaf dag 7 haalt de bank bussen op |
| bd.alert.seizure | De bank haalt bussen op tot de kas weer boven nul staat |

**Boekingen:** `bd.kind.{lease, huur, rente, aflossing, vaste-lasten, aanbetaling, borg, borg-terug, contractboete, inruil, overname, beslag, overspuiten}` = Leasetermijnen / Huur van bussen / Rente / Aflossing / Belasting en keuring / Aanbetaling / Borg / Borg terug / Boete leasemaatschappij / Inruil / Overname / Beslag / Overspuiten.

**Fouten** (in `fundament.ts`, omheind; `bd.fout.weg` bestaat al):

| Sleutel | Nederlandse tekst |
|---|---|
| bd.fout.rood | Je staat rood: eerst de kas aanvullen. |
| bd.fout.krediet | De bank leent niet meer: je kredietruimte is op. |
| bd.fout.aanbod | Het aanbod is veranderd; bekijk de nieuwe bedragen. |
| bd.fout.inruil | Deze bus kun je niet inruilen. |
| bd.fout.restschuld | De opbrengst dekt de lening niet; er is te weinig kas voor het verschil. |
| bd.fout.bezit | Deze bus is niet van jou; lever hem in bij de verhuurder. |
| bd.fout.termijn | Dat kan alleen in de laatste 5 dagen van de lease. |
| bd.fout.ongeldig | Die keuze bestaat niet. |
| bd.fout.catalogus | Deze bus staat niet (meer) in je OMSI-map. |

**Post**

| Sleutel | Nederlandse tekst |
|---|---|
| tb.from.dealer / .bank | Dealer / Bank |
| tb.knop.bekijk | Bekijk bus {nummer} |
| tb.msg.levering.t / .b | Bus {nummer} is afgeleverd / {naam} staat in de remise en rijdt vanaf vandaag mee. |
| tb.msg.contract-afloop.t | Contract van bus {nummer} loopt over 3 dagen af |
| tb.msg.contract-afloop.lease | Lever hem in, verleng met 90 dagen of neem hem over voor {prijs}. |
| tb.msg.contract-afloop.huur | Verleng de huur als je hem nog nodig hebt. |
| tb.msg.contract-einde.t / .b | Bus {nummer} is ingeleverd / Borg terug {borg}; afgerekend voor km en schade {bedrag}. |
| tb.msg.lening-af.t / .b | Lening afgelost / Bus {nummer} is nu helemaal van jou. |
| tb.msg.aanmaning.t / .b | Aanmaning van de bank / Je staat al {dagen} dagen rood ({kas}). Vanaf dag 7 halen we elke dag een bus op die meer waard is dan wat erop geleend is, tot de kas weer boven nul staat. |
| tb.msg.beslag.t / .b | De bank heeft bus {nummer} opgehaald / {naam} is verkocht voor {bedrag}; de lening erop is afgelost. |

**Woordenlijst** (de/fr/en), zoals in het ontwerp:
- Leasing / location longue durée / lease
- Finanzierung / financement / finance
- Miete / location courte durée / rental
- Kaution / dépôt de garantie / deposit
- Tilgung / remboursement / repayment
- Restschuld / capital restant dû / outstanding
- Inzahlungnahme / reprise / trade-in
- übernehmen / lever l'option d'achat / buy out
- Gebrauchtbus / occasion / used
- Pfändung / saisie / seizure
- Mahnung / mise en demeure / reminder
- Kreditrahmen / capacité d'emprunt / credit available
- Lieferung / livraison / delivery
- Händler / Concessionnaire / Dealer
- neu lackieren / repeindre / repaint
- Kfz-Steuer und Hauptuntersuchung / taxe et contrôle technique / tax and inspection

In het Frans nooit "Concession" voor de dealer: dat is een lijnconcessie.

## F8. Migratie

**Niets wordt herschreven; standaardwaarden gelden bij het lezen:**
- `bezit` → 'eigen';
- `geleverdOp` → geleverd;
- `nieuwwaarde` → `REGELS.nieuwprijs[vorm]`;
- `contracten` → [].

**`vulSpecsAan`** (één keer per sessie, na het laden van de catalogus):
- vult `plaatsen`, `lengte` en `bouwjaar` voor bestaande bussen die in de catalogus staan;
- zet `nieuwwaarde ??=` de prijs van de **huidige** vorm;
- wijkt `vormVanMaten` af, dan vorm aanpassen plus bericht 'vorm'. Na deel 0 gebeurt dat alleen nog bij midi en dubbel.

**`career.ts:298-301`** hoeft niet te veranderen: het neemt `bedrijf` over zoals het is.

## F9. Randgevallen

1. **Dubbelklik of twee vensters:** `bezig` in het venster, en `inSlot`, `aanbodWeg` en `huurWeg` in het hoofdproces.
2. **De dag of de kas verandert tussen offerte en bevestigen:** fout 'aanbod' met de nieuwe offerte.
3. **Add-on verwijderd terwijl de bus in bezit is:** label "Niet meer geïnstalleerd". Hij telt in het rekenmodel; de planning meldt "niet geïnstalleerd in OMSI".
4. **Leasebus in de werkplaats op de einddag:** hij wordt toch ingeleverd.
5. **Eerder inleveren:** 's avonds. De termijn van die dag wordt nog geboekt (T-F9).
6. **Inruil boven de prijs:** "Je krijgt nu terug", de kas stijgt.
7. **Inruil met een lening erop:** de restschuld gaat uit de inruilwaarde. Netto negatief → het tekort komt bij "Nu te betalen".
8. **Beslag op de bus waarmee je net rijdt:** OMSI rijdt door, `schadeVanDienst` vindt de bus niet en doet niets. PL-D geeft schade alleen aan `rit.busnummer` bij hetzelfde pad.
9. **Nummers:** nooit opnieuw uitgedeeld (`busTeller`). Verdwijnt een bus (inleveren, afloop, beslag, verkoop), dan ruimt `verwijderBus` hem uit het rooster en uit `vandaag`.
10. **Occasion zonder kleurstellingen:** `kleurstelling` blijft leeg. Een kleurstelling die bij kopen niet meer bestaat, wordt stil gewist.
11. **Catalogus leest niet (geen OMSI):** Dealer toont `bd.dl.catalogFailed`. Wagenpark en contracten werken gewoon.
12. **Huur loopt af op een dag dat de bus in het rooster staat:** vanaf morgen 'afgelopen'. PL toont het conflict en besteedt uit.
13. **Rood zonder kandidaten voor beslag:** alleen rente en elke 7 dagen een aanmaning.
14. **Lease verlengen of overnemen buiten het venster:** fout 'termijn'.
15. **Een bus met staat < 25 bij onderhoud inbegrepen of huur:** bestaat niet, want de staat is elke ochtend 100.

## F10. Testplan

**`scripts/probe-contracten.ts`** (tsx, puur, cloud; fixture van PL `fixtureBedrijf()` plus eigen gevallen):
- **Tarieven:** de tabel in §2.3 in centen, en `Number.isInteger` overal.
- **Lening:** annuïteit 543,10 / 276,44 / 143,19. Som van de aflossingen = hoofdsom. Vervroegd aflossen.
- **Kopen:** met inruil, met inruil met restschuld, met inruil boven de prijs. Aantal 5 → korting 3 % en leveringen 5 op één dag. Aantal 6 → twee dagen.
- **Lease:**
  - termijnen pas vanaf `geleverdOp`;
  - `tot = vanaf + looptijd − 1`;
  - normaal inleveren: borg terug, meer-km, schade, boete bij staat 45;
  - vroeg inleveren: boete 4.725 bij 45 dagen over;
  - overnemen in het venster; daarbuiten 'termijn';
  - verlengen +90;
  - met onderhoud inbegrepen: staat 100 en `onderhoudskosten` 0.
- **Huur:** morgen inzetbaar, verlengen, aflopen, schade.
- **Geldlekken:** het raster uit `lek.ts` geeft **0 routes met winst**. Overnemen na verwaarlozing is negatief.
- **Rood:**
  - rente;
  - aanmaning op dag 3 en 10;
  - beslag vanaf dag 7, alleen bij netto > 0 en eerst bussen buiten het rooster;
  - geen 'kas'-bericht op aanmanings- of beslagdagen;
  - fout 'rood' bij elke aanschaf;
  - onderhoud tot de roodruimte.
- **Krediet:** 6 leningen op dag 1 → de 6e geeft 'krediet'. 22 leases plus 6 leningen → 5 geweigerd (§2.6).
- **Resultaat:** zonder `INVESTERING`, min afschrijving; het dagrapport is gelijk aan `historie.resultaat`.
- **`inzetStatus`:** levering, afgelopen, werkplaats, versleten, schade. Een oud bedrijf geeft dezelfde `isInzetbaar` en `waardeVan`.
- **`busTeller`:** na verkoop, inleveren en beslag.
- **Marginaal:** `marginaleBesparing` op de fixture: bus k krijgt de k-de langste omloop. Met `n` bussen in levering telt de dag van levering. 'vol' en 'geen'.
- **Controle:** aanbetaling 0,01, looptijd 100000 of aantal 21 → 'ongeldig'.
- **Bestaande proeven:** `probe-bedrijf.ts` (92 ok) moet blijven slagen, want `dagprognose` neemt de lasten mee. De gelijkheidsproef van PL-A krijgt `− aflossing`.

**`scripts/probe-dealer.cjs`** (Electron, lokaal):
- `app.setPath('userData', mkdtemp)` en een profiel zetten zoals `probe-chauffeurs.cjs`, via ipc met de planfixture.
- Schermafdrukken van:
  - het Nieuw-raster (60 kaarten);
  - showroom NLC 18C;
  - Leasen 360 met onderhoud → bevestigscherm → Wagenpark "In aflevering";
  - 5 × dag afsluiten → "Lease · tot dag …" en inzetbaar;
  - Occasions en Verhuur 7 dagen;
  - de Kas-tegel met vaste lasten;
  - een rood scenario tot beslag, met het postvak;
  - de showroom in en/de/fr/nl (op tekst die niet past).
- **Tijden:** catalogus < 3 s warm, 60 kaarten zonder één `bus:foto`-render (tel de nieuwe PNG's in `userData/busfotos`: moet 0 zijn).

**Daarna:** `npx tsc --noEmit`, `probe-teksten.ts` (PL) en beide targets bouwen (CLAUDE.md).

## F11. Wat de planning moet weten

**Verzoeken die nog in deel 0 kunnen** (klein):
- (a) `EigenBus.nieuwwaarde?`, met `waardeVan` die hem gebruikt. In `migreer` stap 4 eerst `nieuwwaarde = REGELS.nieuwprijs[oude vorm]` zetten en dan pas de vorm aanpassen. Anders stijgt de waarde van Lucs SG292 van een 60k- naar een 85k-basis (+42 %).
- (b) `busTeller` ook uit de nummers in 'bus-koop'- en 'bus-verkoop'-boekingen (`wat` begint met het nummer, :552/:578/:590). Anders komt het hoogste verkochte nummer één keer terug (T-F14).
- (c) Een geëxporteerde `verwijderBus(b, nummer)` die ook het rooster en `vandaag` opruimt.
- (d) `Focus` krijgt `{ vorm?: Busvorm; bus?: number }`.

**Wat vastligt:**
- **Id** = `EigenBus.nummer`, **pad** = `relativePath`, **lak** = `kleurstelling`. Geef hem mee aan `prepareSituation(…, kleurstelling)` (`index.ts`:3309) en kies hem vooraf in het kleurscherm van D.
- **Beschikbaarheid** komt alleen uit `isInzetbaar(bus, d)` en `inzetStatus(bus, d)`, ook voor dagen in de toekomst in `vulAan`: die zijn nu `werkplaatsTot < dag` (PL §4.2). Lease en huur zijn gewone eigen bussen.
- **Conflicttekst** 'bus-werkplaats': graag met reden uit `inzetStatus`. Levering: "Bus {bus} wordt pas op dag {dag} afgeleverd"; afgelopen: "Het contract van bus {bus} is afgelopen".
- **`eigenBusMetPad`** (D, :1131): de terugval moet levering en afgelopen overslaan (T-F10).
- **Pech (B):** kosten 0 bij `onderhoudInbegrepen`. Pech zelf blijft; de staat is elke ochtend 100.
- **Slijtage (deel 0, plan-pad):** × `slijtfactor(bus)`. De km moeten vóór `wagenparkNaDag` bijgewerkt zijn.
- **`afrekening` (A):** F voegt `cijfers.wagenpark` toe en telt de lasten bij `kosten`. De aanroep van `wagenparkNaDag` blijft na de slijtage.
- **Vervangende bus (C) tegenover dealerhuur:** de vervangende bus is dezelfde dag en per omloop (€ 521, € 625 via de centrale bij 6,79 rituren). Dealerhuur is vanaf morgen en per dag (€ 270 plus € 68 eigen kosten). Er is geen `huurSnel`.
- **Ijkpunt:** `TARIEF.onderBusPerRituur − eigenBusPerRituur` = € 38. Verandert dat, dan de ladder in `probe-contracten` opnieuw draaien.
- **Capaciteit** doet niets in de afrekening. `plaatsen`, `lengte` en `vorm` liggen klaar, voor als A een capaciteitsregel wil (keuze 4).
- **Tekst:** `bd.plan.busLoont` (A, in Markt) vervalt, want F toont de marginale besparing.

---

# G. 3D-VIEWER BIJ DE DEALER EN IN HET WAGENPARK

## G1. Keuze: eigen WebGL2, geen three.js

Dit blijft zoals in het ontwerp:
- `busfoto.ts` heeft al shaders, camera, `frontFace(CW)` en `maakPlaten`, en tekende 643 foto's;
- three.js heeft geen o3d- en geen DDS-lezer;
- tekenen kost 1,3–3,7 ms per beeld;
- geen nieuwe afhankelijkheid en geen wijziging van de CSP.

`busgl.ts` krijgt een **kopie** van `busfoto.ts:58-333`, zodat de foto's niet veranderen.

## G2. Keten en typen

**Stappen:**
1. `BusViewer` vraagt `busModel3d(pad)`. Tegelijk toont hij `busFotoAlsKlaar(pad, kleur)` of het icoon.
2. `main/bus3d.ts` stuurt de vraag naar werker `'bus3d'`.
3. `core/bus3d.ts` bouwt het model en stuurt het terug met transfer, met tussenberichten over de voortgang.
4. Het venster pakt JPG-bytes uit met `createImageBitmap(blob, { premultiplyAlpha:'none', colorSpaceConversion:'none', resizeWidth/Height ≤ grens, resizeQuality:'high' })`.
5. Bij een andere kleurstelling vraagt het venster alleen `busLak3d(pad, naam)`: vervangen platen plus setvars.

**`src/shared/bus3d.ts`** (typen plus één pure functie):

```ts
export type Bus3dReden = 'geen-model' | 'versleuteld' | 'te-groot' | 'fout' | 'tijd' | 'vervangen'
export interface Bus3dMesh { deel: 0 | 1; posities: Float32Array; normalen: Float32Array; uvs: Float32Array; groepen: Array<Uint16Array | Uint32Array> }
export interface Bus3dVermelding { deel: 0 | 1; o3d: string; zicht?: Array<{ variabele: string; waarde: number }> }
export interface Bus3dStuk {
  vermelding: number; mesh: number; groep: number
  textuur?: string; plaat: number; transmap: number          // index in platen, −1 = geen
  kleur: [number, number, number, number]; alfa: 0 | 1 | 2; zonderDiepte: boolean
  alphascale?: string; adres: 'herhaal' | 'rand'; midden: [number, number, number]
}
export interface Bus3dPlaat { naam: string; breedte: number; hoogte: number; pixels?: Uint8Array; jpg?: Uint8Array }
export interface Bus3dModel {
  meshes: Bus3dMesh[]; vermeldingen: Bus3dVermelding[]; stukken: Bus3dStuk[]; platen: Bus3dPlaat[]
  doos: { min: [number, number, number]; max: [number, number, number] }
  driehoeken: number; onderdelen: number; versleuteld: number; ontbrekend: number
  grens: 512 | 1024; ms: { lezen: number; platen: number; totaal: number }
}
export interface Bus3dLak { naam: string; setvars: [Record<string, number>, Record<string, number>]; vervangen: Array<{ deel: 0 | 1; textuur: string; plaat: Bus3dPlaat }> }
export type Bus3dAntwoord = { model: Bus3dModel } | { reden: Bus3dReden; detail?: string }
export type Bus3dLakAntwoord = { lak: Bus3dLak } | { reden: Bus3dReden }
export interface Bus3dVoortgang { vraag: number; klaar: number; totaal: number }
/** Per stuk zichtbaar (1) of niet: [visible] per vermelding, daarna ontdubbelen op (deel, o3d) tussen de zichtbare. */
export function zichtbaar(model: Bus3dModel, setvars?: Bus3dLak['setvars']): Uint8Array
```

## G3. Bestanden en signaturen

**Eigendom van G:**

- **`src/core/bus3d.ts`** (werker, met fs):
  - `bouwBus3d(omsiPad, relatiefPad, voortgang?: (klaar, totaal) => void): Bus3dAntwoord`;
  - `lak3d(omsiPad, relatiefPad, naam, grens): Bus3dLakAntwoord`;
  - `kleurstalen(omsiPad, relatiefPad, namen): Record<string, [string, string, string]>`;
  - `overdraagbaar(x): ArrayBuffer[]`: alleen verse buffers met byteOffset 0 en volle lengte, elk één keer; nooit iets uit een cache.
- **`src/shared/bus3d.ts`** (G2).
- **`src/main/bus3d.ts`:**
  - `registreerBus3d(deps: { handle, werkerVraag, sluitWerker, userData, omsi, venster: () => BrowserWindow[], log, logFout })` en `vergeetBus3d()`;
  - `bus:model3d(pad)` en `bus:lak3d(pad, naam)`: per kanaal hooguit één vraag in uitvoering en één wachtend; een vervangen vraag krijgt `{ reden: 'vervangen' }`;
  - een fout in de werker → één keer opnieuw;
  - **tijdslimiet 20 s zonder voortgang** (elk tussenbericht zet de klok terug) → `sluitWerker()` en `'tijd'`;
  - het model blijft bewaard (sleutel pad) en gaat 120 s na de laatste vraag weg; de laatste 8 lakken per pad blijven bewaard;
  - de werker sluit 120 s na de laatste vraag;
  - `bus:fotoAlsKlaar(pad, kleur)` → adres als `busfotoAfgehandeld` (`main/busfoto.ts`:105) 'foto' geeft, anders `undefined` (T-G6);
  - `bus:kleurstalen(pad)` → wat klaar is, en vult de rest aan via de werker; op schijf in `userData/kleurstalen/<sha1(pad)>.json`; gebeurtenis `bus3d:stalen`;
  - voortgang naar het venster als `bus3d:voortgang`;
  - logregel "bus3d <pad>: N driehoeken, S stukken, P platen, lezen X ms, platen Y ms".
- **`src/renderer/src/busgl.ts`:** `maakBusGl(doek): BusGl | undefined`, met `laad(model)`, `lak(lak)`, `teken(camera)`, `maat(b, h, dpr)`, `ruimOp()`.
- **`src/renderer/src/BusViewer.tsx`:**

  ```ts
  { relativePath: string; kleurstelling?: string; hoogte?: number; kleurkeuze?: boolean
    onKleurstelling?: (naam?: string) => void; draaiplateau?: boolean
    onInfo?: (i: { onderdelen: number; ontbrekend: number; versleuteld: number; driehoeken: number }) => void }
  ```

- **`busviewer.css`** (prefix `bv-`) en **`src/shared/tekst/bus3d.ts`.**
- **`scripts/probe-bus3d.ts`** en **`scripts/probe-busviewer.cjs`.**

**Raakpunten:**
- **`index.ts`:**
  - `Werksoort` (:344) krijgt `'bus3d'`;
  - de handler in `kaartWerker` (:384) verwerkt `{ id, tussen: true, voortgang }` zonder de wachtende te verwijderen;
  - `werkerVraag(opdracht, soort, opVoortgang?)` (:412);
  - `registreerBus3d` in `registerHandlers` en `vergeetBus3d` in `vergeetKaarten` (:262).
- **`kaartwerker.ts`** (HEAD :27-42, :66-128):
  - opdrachten `'bus3d'`, `'bus3dlak'`, `'kleurstalen'`;
  - voor die opdrachten `postMessage(antwoord, overdraagbaar(uitkomst))`;
  - voortgang hooguit elke 100 ms.
- **`api.ts` / preload:** `busModel3d`, `busLak3d`, `busFotoAlsKlaar`, `busKleurstalen`, `opBus3dVoortgang`, `opKleurstalen`.
- **`i18n.ts`:** spread en TEKSTBRONNEN.

## G4. Het model lezen (`core/bus3d.ts`)

- **Vermeldingen.** Elke `[mesh]` is een vermelding. Er wordt niet ontdubbeld (T-G3). De geometrie wordt gedeeld per `(deel, o3d)` (T-G14).
- **Filters** zoals `busbeeld.ts`:145-162:
  - aanzicht bit 1 of 0;
  - de laagste LOD-groep valt weg;
  - `[isshadow]` valt weg;
  - `VUIL` op bestandsnaam.
  - Interieur (viewpoint 2) blijft uit.
- **`[matl] tex n`** hoort bij het (n+1)-de materiaal van de o3d waarvan de textuurnaam (basename, hoofdletterongevoelig) gelijk is aan `tex` (T-G1). Niet gevonden (0,3 %) → blok negeren. Per blok gelden:
  - `[matl_alpha]` 0/1/2;
  - `[matl_transmap]` (leeg = geen, T-G4);
  - `[matl_noZwrite]` → mengfase zonder diepte;
  - `[alphascale] var`;
  - `[matl_texadress_clamp]` en `_border` → `'rand'` (T-G10).
  - `[matl_change]` wordt genegeerd.
- **`[alphascale]`** geldt alleen bij alfa ≥ 1 (dat lost de waarschuwing in `busbeeld.ts`:139-140 op, die voortkwam uit de verkeerde koppeling). Dekking × waarde:
  - `Envir_Brightness` = 1;
  - `Rain_*`, `Dirt_*`, `*_Grain` en `Dash_*` = 0, en dan het stuk overslaan;
  - andere variabelen = 1.
- **`[visible] var waarde`** (per vermelding, in het venster via `zichtbaar`):
  - eerst de setvars van de kleurstelling, dan de alias `vis_CTI_<var>`;
  - anders 0 als een vermelding 0 gebruikt;
  - anders de laagste waarde.
- **Aanhanger** via `trailerOf`. De posities schuiven z − afstand, met eigen setvars (deel 1).
- **Versleuteld:** `versleuteld / unieke o3d-lezingen > 0,1` → `'versleuteld'`. Dus niet de dubbeltelling van `busbeeld.ts`:249 (T-G13); de foto's blijven zoals ze zijn.
- **Te groot:** meer dan 2,5 miljoen driehoeken of meer dan 256 MB aan platen → `'te-groot'`.
- **Textuurgrens:** 1024 bij ≤ 40 texturen, anders 512. De textuurcache van de werker telt bytes (256 MB), met de grens in de sleutel (T-G9).
- **Texturen:**
  - DDS: het eerste mipniveau ≤ grens, via `ontleedTextuur` met een aangepaste kop; anders niveau 0 plus `verkleinGemiddeld`;
  - TGA via `leesTextuur`, BMP via `pakBmpUit`, PNG via `leesPng`;
  - JPG: de werker leest alleen de bytes (`{ jpg }`), er komt geen `pakJpgUit` in het hoofdproces (T-G5).
- **Kleurstalen:**
  - per kleurstelling de eerste vervangen textuur;
  - de kleinste mip of een verkleining tot 16 px;
  - 3 kleuren (mediaan van de drie helderste en donkerste clusters);
  - begrensd op 8 s per aanroep, daarna de volgende keer verder.

## G5. Tekenen (`busgl.ts`)

**Uploaden:**
- VBO's per mesh, IBO per groep, VAO per `(mesh, groep)`.
- Texturen met mipmaps, anisotroop ×4, en een sampler per stuk (REPEAT of CLAMP_TO_EDGE).

**Drie gangen:**
1. Dekkend (alfa 0), met diepte.
2. Alfatest (alfa 1), `discard` bij < 0,5.
3. Mengen (alfa 2 of zonder diepte): `depthMask(false)`, van achter naar voren gesorteerd op `midden`.

Blend: `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`. De eerste twee gangen schrijven alfa 1 (T-G8).

**Shader.**
- Basiskleur = plaat of kleur.
- Dekking = alfa van de transmap, anders plaat.a × kleur.a bij alfa > 0, anders 1; en × alphascale.
- **Studiolicht:** licht van boven en onder plus een hoofdlicht, en nep-reflectie met fresnel. De reflectie is geschaald met het spiegelmasker (de alfa van de carrosserieplaat, `busfoto.ts`:102-112), zodat de lak glanst (S-C3).
- **Schaduw:** een zachte ellips als vlak op `doos.min.y`, die meedraait.

**Camera.**
- Draait om het midden van de doos (middelste 98 %). Verticale fov 30°.
- **Afstand per model vast** = `max((L/2)/tan(hfov/2), (H/2)/tan(vfov/2)) / 0,85 + B/2` (S-C2: bij 18 m ongeveer 22 m in plaats van 37 m).
- Hoogte −5° tot 70°, zoom 0,6–2,5, links = kruis(Y, kijkrichting), `frontFace(CW)`.

**Bediening.**
- Slepen draait (pointer-events, ook op een aanraakscherm).
- **Zoomen met het wiel alleen als de viewer de focus heeft (na een klik), of met ctrl+wiel.** Knijpen op een touchpad werkt. Er zijn zichtbare +/−-knoppen (S-C4).
- Dubbelklik zet de camera terug. Pijltjes draaien 15°, +/− zoomt.
- Knoppen [Voor] [Zijkant] [Achter] [Schuin] [Draaien].

**Zuinig.**
- Alleen tekenen als er iets verandert.
- **Draaiplateau** in de showroom: langzaam draaien tot de eerste aanraking. Niet bij `prefers-reduced-motion` en niet als `omsiRunning()`.
- DPR hooguit 1,5. De tijd tussen twee animatiebeelden wordt gemeten (niet de CPU-tijd, T-G11); zijn drie beelden na elkaar langer dan 50 ms, dan DPR 1.
- Het doek is doorzichtig boven een achtergrond uit de thematokens.

**Vrijgeven.**
- Bij sluiten, bij `visibilitychange` (verborgen) en zodra `omsiRunning()` waar wordt (gecontroleerd bij openen en elke 15 s): `deleteBuffer/Texture/VertexArray` en `WEBGL_lose_context.loseContext()`.
- Daarna de foto met "3D staat stil zolang OMSI draait" [Hervatten] (T-G9).
- Er is nooit meer dan één viewer tegelijk.

**Meten.** Op de viewer staan `data-bv-status="laden|klaar|terugval|gepauzeerd"`, `data-bv-reden`, `data-bv-laadms`, `data-bv-p50`, `data-bv-p95` en `data-bv-driehoeken`.

## G6. Terugval

- Tijdens het laden: de foto uit de cache (of het icoon), met een balk en "3D-model laden… 812 van 1809 onderdelen" (S-C5).
- Teksten:

  | Situatie | Tekst |
  |---|---|
  | geen WebGL2 | `bd.v3d.noWebgl` |
  | versleuteld | `bd.v3d.encrypted` |
  | geen model | `bd.v3d.noModel` |
  | te groot | `bd.v3d.tooHeavy` |
  | fout of tijdslimiet | `bd.v3d.failed` + [Opnieuw] |
  | beeld weggevallen | `bd.v3d.lost` + [Opnieuw] |
  | vervangen | niets tonen |

- **Labels:** bij versleuteld tot 10 % "deels versleuteld (n onderdelen)"; bij `ontbrekend/onderdelen > 0,25` `bd.v3d.incomplete` (eigen sleutel, T-G12).

## G7. Schermen en tekst

**Showroom:**
- vlak van 16:9;
- rechtsonder de hint en de knoppen;
- daaronder de kleurstalen, bij meer dan 12 met een zoekveld (MB_C2: 76). Een staal toont eerst alleen de naam; de kleur verschijnt zodra die klaar is.

**Wagenpark:** het venster "Bus 107 · MAN SD200", met de stalen en [Sluiten].

**Sleutels** (`tekst/bus3d.ts`):

| Sleutel | Nederlandse tekst |
|---|---|
| bd.v3d.open | 3D bekijken |
| bd.v3d.title | Bus {bus} · {name} |
| bd.v3d.loading | 3D-model laden… {klaar} van {totaal} onderdelen |
| bd.v3d.hint | Sleep om te draaien, klik en scrol om te zoomen, dubbelklik om terug te gaan |
| bd.v3d.front / .side / .rear / .angle / .spin | Voor / Zijkant / Achter / Schuin / Draaien |
| bd.v3d.zoomIn / .zoomOut / .reset | Inzoomen / Uitzoomen / Terug |
| bd.v3d.encrypted | De maker heeft dit model versleuteld; in 3D is het niet te tonen. |
| bd.v3d.noModel | Van deze bus is geen model te lezen. |
| bd.v3d.noWebgl | Je videokaart of stuurprogramma kan geen WebGL2; je ziet de foto. |
| bd.v3d.tooHeavy | Dit model is te zwaar om hier te tonen. |
| bd.v3d.lost | Het 3D-beeld viel weg. |
| bd.v3d.paused | 3D staat stil zolang OMSI draait. |
| bd.v3d.resume | Hervatten |
| bd.v3d.retry | Opnieuw |
| bd.v3d.failed | 3D laden lukte niet. |
| bd.v3d.partial | deels versleuteld ({n} onderdelen) |
| bd.v3d.incomplete | Add-on onvolledig: {n} van {m} onderdelen ontbreken |
| bd.v3d.livery | Kleurstelling |
| bd.v3d.liverySearch | Zoek een kleurstelling |
| bd.v3d.close | Sluiten |

## G8. Randgevallen

1. **Snel wisselen:** een volgnummer per vraag, en de nieuwste wint in het hoofdproces. Het vorige model wordt eerst opgeruimd.
2. **Sluiten tijdens het laden:** het venster negeert het antwoord. Het hoofdproces bewaart het model 120 s voor het geval je terugkomt.
3. **Formaat of DPR verandert:** ResizeObserver, dan `maat()` en opnieuw tekenen.
4. **Aanhanger zonder die kleurstelling:** eigen kleuren en eigen setvars.
5. **Stukken zonder textuur:** de diffuse kleur.
6. **JPG** (O530: 38 van de 58): uitpakken in het venster.
7. **DXT zonder veelvoud van 4:** de CPU-decoder (bestaat al).
8. **DDS zonder mipketen:** niveau 0 plus verkleinen.
9. **OMSI draait:** alles wordt vrijgegeven.
10. **Koude schijf:** de tijdslimiet loopt alleen zonder voortgang.
11. **Losse onderdelen ver buiten de bus:** de doos over de middelste 98 %.
12. **Planning en dealer tegelijk:** er is maar één viewer.

## G9. Testplan

**`scripts/probe-bus3d.ts`** (tsx, lokaal):
- **Koppeling (acceptatie T-G1):**
  - `SD77_Klappfenster_OL1.o3d` groep 5 heeft alfa 2;
  - `SD77_wagenkasten.o3d` groep 2 is dekkend zonder noZwrite, groep 4 heeft noZwrite.
- **Alphascale:** SD77 geen stuk met `Dirt_*` of `Rain_*`; het glas met `Envir_Brightness` blijft.
- **NLC 18C:**
  - vermeldingen met `zicht` > 0;
  - na `zichtbaar()` zonder kleurstelling ongeveer 767.000 driehoeken (ongeveer 340.000 verborgen);
  - platen ongeveer 2 s (meting 1921 ms).
- **Aanhanger:** meshes per `(deel, o3d)`.
- **HH20_EBus2021:** `'versleuteld'`. **Citaro Facelift 10M:** `ontbrekend/onderdelen > 0,25`.
- **Transfer:** alle buffers in `overdraagbaar` hebben byteOffset 0, volle lengte en zijn uniek.
- **Kleurstelling:** `lak3d` voor MB_C2 met 3–21 vervangen platen, snel.
- **Kleurstalen:** MB_C2 76 stuks, eerste keer ≤ 8 s per aanroep, tweede keer van schijf < 50 ms.

**`scripts/probe-busviewer.cjs`** (Electron, eigen userData, profiel met bedrijf):
- Dealer → SD77, O530 en NLC. Wacht op `data-bv-status="klaar"`, dan schermafdrukken Voor, Zijkant, Achter.
- **Eisen (warm, 1280×720):** SD77 < 1 s, O530 < 2,5 s, NLC < 5 s; p95 per beeld < 16 ms. De bus vult ≥ 65 % van de breedte in zijaanzicht.
- **Kleurstelling wisselen:** NLC < 1 s.
- **Terugval:** HH20 geeft de terugvaltekst; `window.__bvForceer = 'geen-webgl2'` forceert de terugval.
- **Tijdslimiet:** een nep-trage werker geeft `'tijd'` en daarna werkt [Opnieuw].
- **Geheugen:** 10 × NLC openen en sluiten: werkset van renderer en GPU (`app.getAppMetrics`) binnen 100 MB van het begin. 130 s na sluiten is het model in het hoofdproces weg (logregel).
- **Scrollen:** wiel zonder focus scrollt de pagina.
- De knoppen in vier talen.

**Met het oog:**
- de ruiten van de SD77 zijn doorzichtig;
- de zijruiten van de NLC zijn niet zwart;
- de wielen van de O530 hebben textuur;
- er zijn geen regendruppels;
- de lak glanst.

## G10. Wat de planning moet weten

- `<BusViewer relativePath={bus.relativePath} kleurstelling={bus.kleurstelling} />` werkt overal, maar er is maar één tegelijk.
- De goedkope tegel is `busFotoAlsKlaar`: die rendert nooit.
- G verandert niets aan het rekenmodel en niets aan de busfoto's.

---

## Punten van de tegenlezers

**T** = technische tegenlezer, **S** = spel-tegenlezer.

| Punt | Wat ermee gebeurt |
|---|---|
| T-G1 [matl] n-de materiaal | Overgenomen (G4) plus acceptatietest (G9) |
| T-G2 alphascale | Overgenomen, alleen bij alfa ≥ 1 (G4) |
| T-G3 [visible] vóór ontdubbelen | Overgenomen: `zichtbaar()` |
| T-G4 lege transmap | Overgenomen |
| T-G5 JPG in het venster | Overgenomen; de werker stuurt de bytes |
| T-G6 terugvalfoto rendert | `bus:fotoAlsKlaar` |
| T-G7 samenvoegen en tijdslimiet | 1 bezig + 1 wachtend, klok op voortgang, de werker sluiten |
| T-G8 glas te licht | `blendFuncSeparate`, alfa 1 in de eerste twee gangen |
| T-G9 geheugen | 120 s, loseContext bij verbergen of als OMSI draait, cache op bytes |
| T-G10 texadress | Sampler per stuk |
| T-G11 CPU-tijd | Tijd tussen twee animatiebeelden |
| T-G12 sleutel van F | `bd.v3d.incomplete` |
| T-G13 dubbeltelling | Gecorrigeerd in `bus3d.ts`; `busbeeld.ts` blijft (foto's gelijk) |
| T-G14 meshsleutel | `(deel, o3d)` |
| T-F1 O530 L | Geleed alleen met aanhanger: 36 bussen worden solo |
| T-F2 / S-B8 beslag | Alleen eigen en lening met netto > 0; lease en huur niet; onderhoud mag in de roodruimte |
| T-F3 / S-B2 besparing | Marginaal uit het rooster van PL (§2.1) |
| T-F4 verzekering dubbel | Hernoemd tot "Belasting en keuring"; PL `bd.kind.eigen-bus` zegt al "brandstof en verzekering" |
| T-F5 / S-E onderhoud inbegrepen | Staat 's nachts 100 en pech gratis, voor lease met onderhoud en huur |
| T-F6 scenario | Opnieuw, met de echte regels (§2.6) |
| T-F7 bedragen | Uit `econ.ts`; annuïteit niet op 5 € |
| T-F8 dashboardtekst | "vanaf dag 7", n gedefinieerd, 'kas'-bericht onderdrukt |
| T-F9 begin en einde | vanaf = levering (lease) of afsluiten (lening); inleveren 's avonds |
| T-F10 eigenBusMetPad | Verzoek aan D |
| T-F11 vulSpecsAan | Catalogus na de start, eigen werker, opnieuw lezen in `inSlot` |
| T-F12 verhuizing | Opgelost door deel 0; geen 7e tegel; `Afzender` + dealer/bank |
| T-F13 controle | `valideerKeuze` |
| T-F14 busTeller | Verzoek (b) aan deel 0 |
| T-F15 inruil | r100; boven de aanbetaling verlaagt het de hoofdsom |
| T-F16 remise | Per voertuigmap/model |
| T-F17 aantal boekingen | Tekst aangepast |
| T-F18 prognose zonder afschrijving | Exact in `cijfers.wagenpark` |
| T §3 raakvlak | F na de integratie van PL; `InzetStatus` in `bedrijf.ts` |
| S-B1 keuze doet niets | Deels: pech (PL-B) plus slijtfactor op km maken oud duurder (179 tegen 127 €/dag). Capaciteit is keuze 4 |
| S-B3 flip | Marktwaarde; 0 van 277.530 |
| S-B4 overname | Op waarde bij staat 100, plus boete voor achterstallig onderhoud |
| S-B5 lease 30 / huur | Lease 30 geschrapt; huur ligt boven lease 90 met onderhoud; het tabblad blijft (Luc wil huren) |
| S-B6 financieren | "kost ongeveer € X per dag aan rente"; lease telt 25 % mee in de kredietruimte |
| S-B7 schaal | Aantal 1–20, korting, 5 per dag, groeperen |
| S-C1 kleurstelling traag | `bus:lak3d` plus kleurstalen |
| S-C2 klein in beeld | Afstand op lengte |
| S-C3 vlak | Studiolicht, glans, schaduwvlak, draaiplateau |
| S-C4 wiel | Alleen met focus of ctrl |
| S-C5 voortgang | Tussenberichten van de werker plus balk |
| S-D1 overspuiten | Ja; huisstijl niet (bewust niet) |
| S-D2 proefrit | Bewust niet |
| S-D3 past op je lijnen | `dealer:koersrol` plus filter |
| S-D4 merken | Tabel (§2.2) |
| S-D5 levering | Bericht met knop |
| S-D6 occasion-kleuren | `kleurZaad`; vuil naar staat: bewust niet |
| S-D7 vergelijken | Tabel, max 3 |
| S-D8 lease verlengen | +90 in het venster |
| S-E MB_C2 | 76 kleurstellingen, gemeten (85 is het aantal .bus-bestanden, `busmodel.ts`:10) |
| S-E bus 101 | SG292 wordt geleed in deel 0; nieuwwaarde: verzoek (a) |

## Bewust niet in deze bouw

- **Proefrit.** Kan later als bedrijfsrit zonder gevolgen voor het geld, met de stroom van D.
- **Huisstijl per CTC-map.** De kleurstelling kies je per bestelling, dus het is niet nodig.
- **Vuillagen naar de staat.** Hoe OMSI `Dirt_*` aanstuurt, is niet onderzocht.
- **Faillissement.**
- **Capaciteit in de opbrengst** (keuze 4).
- **Interieur in 3D.**
- **Een leasemaatschappij die bij achterstand opzegt.**
- **three.js.**

## Onzeker

- **Rituren.** `rituren.ts` gebruikte `kaartlaag.ts` en `timetable.ts` uit de werkkopie, terwijl wens 7 die aan het wijzigen was. Lijn 109 komt exact overeen met PL (22 omlopen, 6,79 rituren), maar andere lijnen zijn niet nagekeken.
- **"Marginaal = k-de langste omloop"** is een ondergrens. `vulAan` kan omlopen koppelen, dan bespaart een bus meer.
- **Pech** staat in `econ.ts` en `scenario.ts` als verwachte waarde; PL-B loot hem.
- **Maandag-anker.** De planningdatum per kaart is benaderd met de maandag op of vóór het tijdvak.
- **`[kmcounter_init]`:** alleen het jaar is bruikbaar. Het bouwjaar van een occasion is modeljaar + 0–5 jaar.
- **Beslag en rood staan** zijn doorgerekend in `scenario.ts`, niet in de app gespeeld. Rood kwam in de 10 plannen niet voor.
- **De `[visible]`-regel** en de alias `vis_CTI_` zijn gecontroleerd op 3 bussen.
- **`Envir_Brightness` = 1** is een aanname. Dat de doorzichtigheid van een transmap in het alfakanaal zit, is alleen gemeten op `SD80_trans.tga`.
- **Alphascale** alleen bij alfa ≥ 1: aangenomen. De wielen van de O530 moeten met het oog gecontroleerd worden.
- **Een DDS-mipniveau als eigen buffer** is niet met WIC vergeleken.
- **De snelheid van `bus:lak3d`** (< 1 s) is niet gemeten.
- **De kleurstalen:** de kwaliteit van "3 kleuren uit de eerste textuur" is niet op beeld gecontroleerd.
- **De merkenregex** is niet opnieuw gemeten na de toevoeging van S 31x. Hamburger Stadtbus (17) blijft een add-on-naam.
- **Modelnamen** uit het gemeenschappelijke begin zijn soms lelijk ("Mercedes-Benz Release"); ze zijn niet met de hand nagekeken.
- **Snelheid op een geïntegreerde GPU** is onbekend.
- **Of deel 0 al gebouwd is** voordat verzoeken (a)–(d) aankomen: dan wordt (a) een eenmalige waardesprong.

## Keuzes die Luc misschien anders wil

1. **Balans van de aanschaf.**
   - *Gekozen:* op een gemiddelde omloop van lijn 109 (6,8 rituren) levert een solo per dag: huur −€ 18, lease 360 met onderhoud +€ 62, eigen +€ 116 (dan zit er wel kapitaal vast). Lease 30 dagen vervalt.
   - *Anders:* leasen goedkoper maken, zodat alles leasen duidelijk wint.
2. **Huren.**
   - *Gekozen:* huren bij de dealer is vanaf morgen, 3–28 dagen, en de bus staat in je wagenpark. Voor een bus die vandaag uitvalt blijft de "Vervangende bus" van de planning (€ 648).
   - *Anders:* bij de dealer ook dezelfde dag huren. Dat botst met de vervangende bus.
3. **Rood staan.**
   - *Gekozen:* 0,1 % rente per dag, aanmaning op dag 3, en vanaf dag 7 elke dag beslag op een eigen of leningbus met overwaarde. Onderhoud mag tot 10 % van de vlootwaarde in het rood. Er is geen faillissement.
   - *Anders:* strenger (faillissement) of milder (alleen rente).
4. **Capaciteit.**
   - *Gekozen:* vorm en plaatsen tellen niet in de opbrengst; in de planning geeft een verkeerde vorm alleen een waarschuwing. Rationeel wint dan de goedkoopste bus die past.
   - *Anders:* per omloop een benodigd aantal plaatsen, met minder vergoeding bij een te kleine bus. Dat is werk voor planningsdeel A.
5. **Levering.**
   - *Gekozen:* nieuw 2–5 dagen (per vorm), occasion en huur 1 dag, bestellen tot 20 met 3/5 % volumekorting.
   - *Anders:* alles direct geleverd.

## Kladbestanden

Nieuw, in `C:/Users/lucru/AppData/Local/Temp/claude/C--OMSI-Career--claude-worktrees-ecstatic-noether-296800/69453af6-61d8-4662-b5b4-760aa670cb78/scratchpad/wagenpark/definitief/`:
- `catalogus.ts` / `.out.txt`
- `rituren.ts` / `.out.txt`, met `rituren.json`
- `rituren2.ts` / `.out.txt`
- `econ.ts` / `.out.txt`
- `lek.ts` / `.out.txt`
- `scenario.ts` / `.out.txt`
- `stalen.ts` / `.out.txt`
- `merkjes.ts`

Gebruikt: `../tegenlezer/*.out.txt` en `../ijk-definitief.out.txt`, `../meet-mip.out.txt`, `../meet-catalogus.out.txt`.

Planningsontwerp: `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800/design/ontwerpen/busbedrijf-planning.md` (HEAD 0b9b4c8).