# Definitief ontwerp: de planning van het busbedrijf (delen 0 en A–E)

De basis is worktree `C:/OMSI Career/.claude/worktrees/ecstatic-noether-296800`, tak `claude/busbedrijf-samen`, commit eb1c610 (versie 0.4.7). Ik heb alleen gelezen: in de worktree is niets gewijzigd of gecommit, en de app is niet gestart. Mijn eigen kladproef is `…/scratchpad/planning/definitief/d1.ts`. Die leest alleen de OMSI-map en zet de cache in mkdtemp. `probe-bedrijf.ts` draait nu met 92 keer ok.

---

## 0. Wat er verandert ten opzichte van het ontwerp, en waarom

1. **Hoeveel diensten er zijn.** Beide tegenlezers hebben gelijk, elk voor de regel die zij gebruikten. De telling hangt af van hoe een omloop geknipt wordt.
   - Definitief: werktijd en knippen gaan over de **hele omloop**, inclusief de korte ritten (LEE- en Überliegeplatz-ritten met 2 haltes). Die rijdt de chauffeur ook.
   - Een knip mag alleen vóór een rit met minstens 3 haltes, na een pauze van minstens 3 minuten.
   - Alleen ritten met minstens 3 haltes zijn dienstregelingsuren: ze leveren geld op en komen in de Duty.
   - Uitkomst: werkdag 28 diensten, zaterdag 23, zondag 18 (d1.ts). Knippen op alleen de netritten geeft 25, 20 en 18 (t3.ts).
2. **Hoe er afgerekend wordt.** De opdrachtgever betaalt per gereden dienstregelingsuur (rituur) van die dag. Een chauffeur van de onderaannemer of van het uitzendbureau kost geld **per werkuur** (diensttijd); een bus kost per rituur.
   - Waarom: per rituur kwam een eigen chauffeur gemiddeld op € 201 per dag, onder zijn loon (spel-tegenlezer 1, nagemeten in d1.ts).
   - Per werkuur is dat € 265. De vergoeding gaat van 95 naar 106 €/rituur, zodat alles uitbesteden licht winstgevend blijft (§2).
3. **Zelf rijden schrijft geen invulling meer.**
   - Wat je rijdt, komt bij het afronden in `vandaag.gereden`. De rest van de dienst valt terug op wat hij zonder jou was, en de roosterchauffeur blijft gewoon.
   - Bij Zelf rijden kies je de eerste en laatste rit, en je ziet vooraf wat de rest kost.
   - Annuleren laat niets achter.
4. **Uitval wordt getrokken los van de indeling**, per beschikbare chauffeur en per inzetbare bus. Wie 's avonds een leeg rooster achterlaat, ontloopt daarmee geen uitval.
5. **De centrale.** Een plots gat dat je niet zelf invult, regelt de app zelf, in deze volgorde: een vrije collega, dan een uitzendkracht met 20 % spoedtoeslag, en pas als dat niet kan valt de dienst uit. Voor een bus: een vrije eigen bus, anders een huurbus met 20 % toeslag.
   - Dat staat al in `dagplan`, dus wat de speler vooraf ziet, is wat er wordt afgerekend.
   - Dag afsluiten vraagt bevestiging zolang er nog gaten open staan.
6. **Het nummerprobleem.**
   - Er komen tellers die alleen oplopen voor bus- en personeelsnummers.
   - Bij verkoop, ontslag en vertrek worden de sleutels opgeruimd.
7. **Na de update rijdt Lucs bus en chauffeur meteen mee.**
   - Eén migratie vult het rooster voor een hele week.
   - Er komt een postbericht over de nieuwe rekensom.
8. **Terugval per concessie** als een kaart ontbreekt, in plaats van de hele dag terug naar de oude rekensom.
9. **Concessiemarkt.**
   - De markt toont het weekgemiddelde aan rituren en de piek aan omlopen.
   - De inschrijving rekent op het aantal omlopen op de drukste dag: bij lijn 109 is dat 22 in plaats van 54.
10. **De klok van de kaart** loopt over het bereik van het lijnplan (lijn 109: −15 tot 1506). De vaste 03:00–27:00 vervalt, zodat de nachtritten er wel op komen.
11. **Het busscherm van de bedrijfsrit.**
    - De eigen bus ligt vast; kleurstelling en remise mag je kiezen.
    - Een bus van de onderaannemer mag je wel wisselen, en main krijgt dat te horen via `bedrijfRitBus`.
    - Schade gaat alleen naar het busnummer als het gereden pad gelijk is aan de eigen bus.
12. **Bouwen in parallel.**
    - Deel 0 splitst `Bedrijf.tsx` op in losse bestanden per paneel en zet slots neer.
    - Alle `bd.fout.*`-sleutels staan in één bestand.
    - `LijnPlan` staat in planTypen.
    - Een tekstproef vangt dubbele sleutels en ontbrekende plaatshouders.
13. **Spel.**
    - Er komen geldregels in de Planning, terugverdientijd bij het aannemen en in de busmarkt, en een weekstrook in plaats van +2…+6 dagen.
    - Het woord "uitbesteed" vervangt "open", dat alleen nog voor uitval geldt.
    - Er komt een ochtendvenster met keuzes, en een vaste knop "Zelf rijden".
    - Bedienen gaat met pointer-events en tik-tik, zodat het ook op een aanraakscherm werkt.
14. **Namen en overige punten.**
    - `BedrijfKaart` bestaat al in telefoonBedrijf.tsx:24. De nieuwe kaart heet `Vlootkaart`.
    - De reservebus-schakelaar vervalt: elke vrije bus is reserve.
    - "Bevoegd" wordt een waarschuwing en geen verbod.

---

## 1. Kernbeslissingen

1. **Bedrijfsdatum.** Elke kaart krijgt een anker: de ISO-datum van de maandag op of vóór haar tijdvak. `datum = anker + (dag − 1)`.
   - Het anker wordt bij het eerste gebruik vastgelegd in `Bedrijf.ankers[mapFolder]`. Zonder situatiebestand of jaartal valt het tijdvak terug op het jaar van de pc (kaartlaag.ts:300-304), en dat mag de datum niet verschuiven.
   - Op HafenCity is dag 1 maandag 25-04-2016. Feestdagen lopen tot en met 2023 (t1.ts), dus ongeveer 2700 bedrijfsdagen.
2. **Omlopen van een dag.**
   - Welke omlopen rijden: `map.tours` van de concessielijn met `runsOn(tour.days, datum, kalender)` (calendar.ts:79-92).
   - Een rit is `map.tours[i].trips`, gesorteerd, met `aankomst = vertrek + tripMinutes`, ontdubbeld op `tripFile@vertrek`.
   - Een omloop zonder rit van minstens 3 haltes valt weg.
3. **Dienst.**
   - Een dienst is een aaneengesloten stuk van één omloop van hoogstens 570 minuten; zie §0.1 voor hoe er geknipt wordt.
   - Een stuk zonder telbare rit gaat op in het vorige stuk.
   - Werktijd is `tot − van` over alle ritten.
4. **Sleutels.**
   - `OmloopSleutel = mapFolder|lineFile|days|tourNumber`. tourNumber staat achteraan, omdat het vrije tekst is.
   - `DienstSleutel = omloopSleutel|deel`: `deel` is alles na de laatste `|`.
   - De bus hangt aan de omloop, de chauffeur aan de dienst.
   - Het rooster geldt per masker (Tour.days). Een indeling op dinsdag geldt dus voor alle dagen ma–vr, en voor zaterdag is een eigen rooster nodig.
5. **Uitval** wordt bij het begin van de dag getrokken, met `reeks(zaad)` (bedrijf.ts:498), per beschikbare chauffeur en per inzetbare bus. Het wordt vastgelegd in `Bedrijf.vandaag` en de gevolgen gaan naar wat die chauffeur of bus op dat moment rijdt.
6. **De centrale** vult een plots gat zonder handmatige invulling, zoals beschreven in §0.5.
7. **Uitval per soort.**
   - Plots is: ziek op de eerste dag, te laat, of pech. Daarbij mag er niet uitbesteed worden (fout 'kort').
   - Ziek vanaf de tweede dag, cursus en werkplaats zijn vooraf bekend: dan wordt gewoon uitbesteed, met een waarschuwing.
8. **Zelf rijden.**
   - Er komt een `ActiveDuty` met `mode 'service'` en het veld `bedrijf: LopendeRit`; er komt geen nieuwe GameMode.
   - Er komt geen invulling bij.
   - `dagplan(b, dagen, dag, lopend)` toont "Rijdt nu (jij)".
   - Afronden schrijft `vandaag.gereden[d]`.
9. **De klok** is alleen weergave. Hij wordt niet opgeslagen en beslist niets.
10. **Main, voor gelijktijdigheid.**
    - Eerst alles ophalen (await). Daarna `career.bedrijf` opnieuw lezen, rekenen en wegschrijven zonder een await ertussen.
    - Alle schrijvende `bedrijf:*`-handlers die await gebruiken, lopen achter één slot (een promise-keten).
    - Het goede voorbeeld staat al in `bedrijf:koop` (index.ts:4979-4989).
11. **Mijn bedrijf** komt in `LanguageProvider`. Nu staat het altijd in het Engels (App.tsx:2359-2366; language.tsx:11).
12. **Een kaart die ontbreekt** zet alleen haar eigen concessies op de terugval (§2). De rest van de dag rekent gewoon op de planning.

---

## 2. Metingen en tarieven

### 2.1 Gemeten in d1.ts

HafenCityHamburg, "Addon Tag und Nacht Li. 109", met de definitieve knipregel:

| Datum | Omlopen | Diensten | Rituren | Werkuren | Rituren per dienst | Werkuren per dienst | Kortste | Langste |
|---|---|---|---|---|---|---|---|---|
| ma–do 25–28-04-2016 | 22 | 28 | 153,0 | 199,3 | 5,46 | 7,12 | 03:04 | 09:28 |
| vr 29-04 | 22 | 28 | 153,4 | 200,4 | 5,48 | 7,16 | 03:04 | 09:28 |
| za 30-04 | 18 | 23 | 106,2 | 149,2 | 4,62 | 6,49 | 04:01 | 09:28 |
| zo en feestdag 01-05 | 13 | 18 | 86,3 | 115,9 | 4,80 | 6,44 | 03:22 | 09:29 |

- **Over de hele week:**
  - 181 dienst-dagen, 957,7 rituren en 1262,9 werkuren; gemiddeld 136,8 rituren per dag.
  - Per dienst 5,29 rituren; per omloop 6,79 rituren (dus niet 7,4).
- **Maskers van lijn 109** (t1.ts):

  | Masker | Dagen | Omlopen |
  |---|---|---|
  | 799 | ma–vr | 21 |
  | 783 | ma–do | 1 (55122) |
  | 784 | vr | 1 (55123) |
  | 800 | za | 18 |
  | 960 | zo en feestdag | 13 |

- **Tijden:**
  - Vroegste vertrek −15,017 (55301), laatste aankomst 1506,4.
  - 35 vertrekken liggen vóór 03:00. Zaterdag 55201 rijdt van 00:14 tot 08:11.
  - Van de 1217 ritten hebben er 533 twee haltes. Dat zijn Überliegeplatz- en LEE-ritten (t2.ts).

### 2.2 Tarieven

In het nieuwe bestand `core/plantarief.ts`. De REGELS in bedrijf.ts blijven gelijk voor het oude pad.

| Wat | Bedrag |
|---|---|
| Vergoeding | 106 € per gereden rituur × (1 + (reputatie − 50)/500) × f.vergoeding |
| Onderaannemer, chauffeur | 38 € per werkuur × f.inhuur |
| Onderaannemer, bus | 48 € per rituur × f.inhuur |
| Eigen bus | 10 € per rituur |
| Uitzendkracht | 40 € vast + 57 € per werkuur, × f.inhuur (× 1,2 als de centrale hem inzet, tenzij de opleiding Planner af is) |
| Huurbus | 100 € vast + 62 € per rituur, × f.inhuur (× 1,2 via de centrale, tenzij Planner) |
| Laten liggen | geen vergoeding + boete 60 € per rituur; reputatie −min(5, floor(uitgevallen rituren per dag / 4)) |
| Overuren | minuten boven 480 per dag: (min/60) × loon/8 × 1,5 |
| xp | 1 per gereden rituur (was floor(uren/2)); +10 bij een winstdag, zoals nu |
| Uitzendkrachten per dag | 1 + floor(niveau/2) |

Wat dat oplevert op lijn 109 (d1.ts):

- **Alles uitbesteed:**
  - Werkdag: 153,0 × 106 = 16.218 € vergoeding, tegen 199,3 × 38 + 153 × 48 = 14.917 € kosten, dus ongeveer +1.301 €.
  - Zaterdag ongeveer +490 €, zondag ongeveer +602 €. Over de week gemiddeld ongeveer +1.080 € per dag. Nu is het ongeveer +3.111 € per dag, maar dat getal kwam van de fout "alle dagsoorten bij elkaar".
- **Eigen chauffeur:** bespaart gemiddeld 6,98 werkuren × 38 = € 265 per dag, tegen een loon van € 190 tot 270.
  - Bij een loon van € 230 verdienen 104 van de 181 diensten zich terug; per rituur waren dat er 73.
  - Vul aan zet chauffeurs op de langste diensten, en daar is het ruim.
- **Eigen bus:** bespaart 38 € per rituur × 6,79 ≈ € 258 per dag. Een nieuwe solobus van € 60k verdient zich terug in ongeveer 233 dagen; dat was in het oude model ook ongeveer zo.
- **Voorbeeld van één dienst** (werktijd 7,1 u, 5,5 rituren):

  | Wie | Kosten |
  |---|---|
  | Uitbesteden | € 269,80 |
  | Uitzendkracht | € 444,70 (met toeslag € 533,64) |
  | Laten liggen | € 583 gemiste vergoeding + € 330 boete, reputatie −1 |
  | Collega of zelf rijden | € 0 extra |

---

## 3. DEEL 0 — Fundament (eerst, één bouwer)

Deel 0 legt vast: alle typen, de API, de IPC, de werker, de i18n-opzet, het opsplitsen van Bedrijf.tsx met slots, en de pure kern. Die kern is hier al volledig uitgewerkt: bedrijfsplan, planregels, plantarief, busvorm, en `sluitDagAf` met cijfers. Stubs komen alleen waar een deel ze zelf invult.

### 3.1 Nieuwe bestanden

**`src/core/planTypen.ts`** bevat alleen typen. Wat uit `./bedrijf` komt, is een type-import; zo'n kringverwijzing is in TS toegestaan.

```ts
import type { Busvorm } from './bedrijf'
export type OmloopSleutel = string   // `${mapFolder}|${lineFile}|${days}|${tourNumber}`
export type DienstSleutel = string   // `${omloopSleutel}|${deel}`

export interface PlanRit {
  sleutel: string        // `${tripFile.toLowerCase()}@${departure}` (zoals duty.ts:407 ontdubbelt)
  tripFile: string
  vertrek: number        // minuten na middernacht van de bedrijfsdatum; <0, >1440 en breuken mogen
  aankomst: number       // vertrek + tripMinutes(trip, profileIndex)
  haltes: number
  telt: boolean          // haltes >= MIN_STOPS_FOR_BUS_LINE (network.ts:5)
  lijn: string           // trip.lineNumber || trip.ident || lineFile
  van: string            // naam eerste halte
  naar: string           // trip.terminus
}
export interface DienstVanDag {
  sleutel: DienstSleutel; omloop: OmloopSleutel
  deel: number; delen: number          // 1-based
  van: number; tot: number             // eerste vertrek, laatste aankomst, alle ritten
  minuten: number                      // werktijd = tot − van
  rituren: number                      // Σ(aankomst−vertrek)/60 over ritten met telt; niet afgerond
  ritten: PlanRit[]
}
export interface OmloopVanDag {
  sleutel: OmloopSleutel; mapFolder: string; lineFile: string; lijn: string
  tourNumber: string; days: number; depot: string; vorm?: Busvorm
  van: number; tot: number; minuten: number; rituren: number
  diensten: DienstVanDag[]
}
export interface KaartDag {
  mapFolder: string; mapName: string; lineFiles: string[]
  dag: number; datum: string; weekdag: number /*0=zo*/; soort: 'school' | 'break' | 'holiday'
  omlopen: OmloopVanDag[]
  fout?: 'kaart'
}
export interface Dagrooster { dag: number; kaarten: KaartDag[] }
export interface LijnWeek {
  lineFile: string
  dagen: Array<{ dag: number; datum: string; omlopen: number; diensten: number; rituren: number; werkuren: number }>
  gemRituren: number; gemWerkuren: number; gemDiensten: number; gemOmlopen: number; piekOmlopen: number
}

export interface VastRooster {
  bussen: Record<OmloopSleutel, number>
  chauffeurs: Record<DienstSleutel, number>
  autoAanvullen?: boolean
  gemaakt?: number                       // bedrijfsdag van de migratie
}

export type UitvalSoort = 'ziek' | 'telaat' | 'pech'
export interface Uitval {
  id: string                             // `${dag}|${soort}|${medewerker ?? bus}`
  soort: UitvalSoort; medewerker?: number; bus?: number
  minuten?: number                       // telaat: 20..60
  kosten?: number                        // pech: al geboekt, centen
}

export type InvulKeuze = { soort: 'collega'; id: number } | { soort: 'uitzend' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export type BusKeuze = { soort: 'eigen'; nummer: number } | { soort: 'huur' } | { soort: 'liggen' }
export type InvulDoel =
  | { soort: 'dienst'; dienst: DienstSleutel }   // hele dienst
  | { soort: 'stuk'; dienst: DienstSleutel }     // het te-laat-stuk
  | { soort: 'omloop'; omloop: OmloopSleutel }   // de bus

export interface Gereden { van: number; tot: number; werkMinuten: number; rituren: number; deel: number; busnummer?: number }
export interface Vandaag {
  dag: number
  uitval: Uitval[]
  invulling: Record<DienstSleutel, InvulKeuze>
  stukInvulling: Record<DienstSleutel, InvulKeuze>
  busInvulling: Record<OmloopSleutel, BusKeuze>
  gereden: Record<DienstSleutel, Gereden>
}
export interface LopendeRit {
  dienst: DienstSleutel; dag: number
  van: number; tot: number               // het gekozen venster
  ritten: string[]                       // PlanRit.sleutel van de telbare ritten in het venster
  omloopNr: string; deel: number; delen: number; lijn: string
  busnummer?: number
}

export type Wie = { soort: 'eigen'; id: number } | { soort: 'collega'; id: number } | { soort: 'uitzend' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export type Bron = 'rooster' | 'hand' | 'centrale' | 'standaard'
export type Afwezig = 'ziek' | 'telaat' | 'afwezig' | 'weg' | 'dubbel' | 'monteur'
export interface Stand { wie: Wie; bron: Bron; reden?: Afwezig; toeslag?: boolean; kosten: number }
export type BusWie = { soort: 'eigen'; nummer: number } | { soort: 'huur' } | { soort: 'onderaannemer' } | { soort: 'liggen' }
export interface BusStand { wie: BusWie; bron: Bron; reden?: 'pech' | 'werkplaats' | 'weg' | 'dubbel'; toeslag?: boolean; kosten: number }

export type ConflictSoort =
  | 'bus-weg' | 'bus-werkplaats' | 'bus-dubbel' | 'bus-vorm'
  | 'chauffeur-weg' | 'chauffeur-afwezig' | 'chauffeur-dubbel' | 'chauffeur-rust' | 'chauffeur-overstap'
  | 'chauffeur-nachtrust' | 'overuren' | 'te-lang' | 'bevoegd' | 'monteur'
export interface Conflict { soort: ConflictSoort; ernst: 'fout' | 'let'; dienst?: DienstSleutel; omloop?: OmloopSleutel; bus?: number; medewerker?: number; andere?: string; minuten?: number }

export interface PlanDienst {
  dienst: DienstVanDag
  roosterId?: number
  stand: Stand                                   // hele dienst; bij telaat: het deel na het stuk
  stuk?: { van: number; tot: number; minuten: number; rituren: number; stand: Stand }
  jij?: { van: number; tot: number; nu: boolean; gereden?: Gereden }
  plots: boolean
  uitgevallen: number                            // rituren
  conflicten: Conflict[]
}
export interface PlanOmloop { omloop: OmloopVanDag; bus: BusStand; roosterBus?: number; diensten: PlanDienst[]; conflicten: Conflict[] }
export interface Werkdag { minuten: number; rituren: number; diensten: DienstSleutel[] }
export interface Telling {
  omlopen: number; eigenBus: number; huurbus: number
  diensten: number; eigen: number; collega: number; jij: number; uitzend: number
  uitbesteed: number; open: number; uitgevallen: number
  rituren: number; uitgevallenRituren: number; werkuren: number
}
export interface DagPlan {
  dag: number; datum?: string; vandaag: boolean
  kaarten: Array<{ kaart: KaartDag; omlopen: PlanOmloop[] }>
  terugval: Array<{ mapFolder: string; lineFile: string }>
  vrij: { chauffeurs: number[]; bussen: number[] }
  werk: Record<number, Werkdag>
  uitzend: { gebruikt: number; max: number }
  conflicten: Conflict[]
  telling: Telling
}
export interface ConcessieCijfers { mapFolder: string; lineFile: string; naam: string; bron: 'plan' | 'terugval'; rituren: number; uitgevallen: number; vergoeding: number; onderaannemer: number }
export interface PlanCijfers {
  perConcessie: ConcessieCijfers[]
  vergoeding: number; onderaannemer: number; eigenBus: number
  uitzend: { diensten: number; kosten: number }
  huurbus: { omlopen: number; kosten: number }
  overuren: { minuten: number; kosten: number }
  lonen: number
  uitgevallen: { rituren: number; ritten: number; boete: number; reputatie: number }
  legacyZelf: number
  kosten: number                                  // alle kosten samen, positief
  gereden: number                                 // gereden rituren
  werkend: number[]; overwerkt: number[]; eigenAandeel: number
  busUren: Record<number, number>
  omlopen: number; eigenOmlopen: number
  diensten: number; eigenDiensten: number; jijDiensten: number; openDiensten: number; uitbesteed: number
}

export type RoosterActie =
  | { soort: 'bus'; omloop: OmloopSleutel; nummer: number | null }
  | { soort: 'chauffeur'; dienst: DienstSleutel; id: number | null }
  | { soort: 'busOpLijn'; mapFolder: string; lineFile: string; nummer: number; dag: number }
  | { soort: 'vulAan'; dag: number; bereik: 'dag' | 'week'; eerste?: boolean }
  | { soort: 'wis'; wat: 'alles' }
  | { soort: 'wis'; wat: 'masker'; mapFolder: string; lineFile: string; days: number }
  | { soort: 'kopieer'; mapFolder: string; lineFile: string; van: number; naar: number }
  | { soort: 'herstel'; rooster: VastRooster }
  | { soort: 'auto'; aan: boolean }
export type RoosterFout = 'geen' | 'weg' | 'te-lang' | 'planner' | 'kaart' | 'dag' | 'geenPlek'
export type InvulFout = 'geen' | 'weg' | 'bezet' | 'kort' | 'vol' | 'bezig' | 'gereden' | 'dag' | 'kaart'
export type RitFout = 'geen' | 'ritBezig' | 'dienst' | 'kaart' | 'bus' | 'busLigt' | 'gereden' | 'venster'

export interface KaartRit { sleutel: string; route: string; lijn: string; naar: string; vertrek: number; tijden: number[]; stopIds: string[]; leeg: boolean }
export interface KaartOmloop { sleutel: OmloopSleutel; lineFile: string; tourNumber: string; ritten: KaartRit[] }
export interface LijnPlan { mapFolder: string; mapName: string; dag: number; datum: string; van: number; tot: number; omlopen: KaartOmloop[]; routes: Record<string, number[]>; haltes: string[] }
```

**`src/core/bedrijfsplan.ts`** is volledig puur en heeft geen Network nodig.

```ts
export const DIENST_MAX = 570, KNIP_PAUZE = 3
export function ankerVoor(tijdvak: { year: number; dayOfYear: number }): string
export function bedrijfsdatum(anker: string, dag: number): Date              // UTC-middernacht
export function omloopSleutel(mapFolder: string, lineFile: string, days: number, tourNumber: string): OmloopSleutel
export function dienstSleutel(omloop: OmloopSleutel, deel: number): DienstSleutel
export function ontleedOmloop(s: string): { mapFolder: string; lineFile: string; days: number; tourNumber: string } | undefined
//   de eerste drie '|' van links; de rest is tourNumber
export function ontleedDienst(s: string): { omloop: OmloopSleutel; deel: number } | undefined   // laatste '|'
export function vormVanDepot(depot: string): Busvorm | undefined
//   /gelenk|schlenk/i→geleed, /doppeldeck|\bdd\b/i→dubbel, /midi|kurz/i→midi, /solo|standard/i→solo
export function knipOmloop(ritten: PlanRit[], max?: number): PlanRit[][]
export function omlopenVanDag(map: OmsiMap, lineFile: string, datum: Date, kalender: Calendar): OmloopVanDag[]
export function kaartDag(map: OmsiMap, kalender: Calendar, lineFiles: string[], anker: string, dag: number): KaartDag
export function lijnWeek(map: OmsiMap, kalender: Calendar, anker: string, vanDag: number): Record<string, LijnWeek>
export function zoekDienst(r: Dagrooster, s: DienstSleutel): { kaart: KaartDag; omloop: OmloopVanDag; dienst: DienstVanDag } | undefined
export function zoekOmloop(r: Dagrooster, s: OmloopSleutel): { kaart: KaartDag; omloop: OmloopVanDag } | undefined
export function maskerDagen(days: number): { dagen: Array<'ma'|'di'|'wo'|'do'|'vr'|'za'|'zo'>; feestdag: boolean; periode?: 'school' | 'break' }
```

**`knipOmloop`** werkt zo:
- Aantal delen: `delen = max(1, ceil(span/max))`.
- Voor k = 1…delen−1 is het ideale knippunt `begin + span·k/delen`.
- Een kandidaat is een index i ≥ 1 met `ritten[i].telt`, `ritten[i].vertrek − ritten[i−1].aankomst ≥ 3`, en i groter dan de vorige knip. Kies de kandidaat met de kleinste |vertrek − ideaal|.
- Is er geen kandidaat, dan wordt er niet geknipt. Een stuk zonder rit die telt, gaat op in het vorige stuk.

**`omlopenVanDag`** werkt zo:
- De lijn wordt hoofdletterongevoelig vergeleken.
- Het masker wordt getoetst met `runsOn`.
- `vorm = vormVanDepot(tour.depot)`.
- De sortering is op `van`, daarna op sleutel.

**`src/core/planregels.ts`** is ook meteen volledig; na deel 0 is het eigendom van A.

```ts
export const PLAN = { rust: 20, nachtrust: 660, overstap: 45, dagDoel: 480, dagMax: 600, busMarge: 10, ervaringGeleed: 25 } as const
export interface Blok { sleutel: string; van: number; tot: number; vanHalte: string; totHalte: string }
export function blokVan(d: DienstVanDag, venster?: { van: number; tot: number }): Blok
export function overlapt(a: { van: number; tot: number }, b: { van: number; tot: number }, marge?: number): boolean
export function werkMinuten(blokken: Blok[]): number
export function toets(bestaand: Blok[], nieuw: Blok, buren?: { vorigeTot?: number; volgendeVan?: number }):
  { dubbel?: string; teLang: boolean; rust?: number; overstap?: number; overuren: number; nachtrust?: number }
//   vorigeTot is relatief aan dag−1 (bijv. 1491); rust = 1440 + eersteVan − vorigeTot; volgendeVan relatief aan dag+1
export function bevoegd(ervaring: number, vorm?: Busvorm): boolean   // geleed/dubbel ⇒ ervaring ≥ 25
```

**`src/core/plantarief.ts`** is volledig; alles in hele centen met `Math.round`.

```ts
export const TARIEF = { vergoedingPerRituur: 106_00, onderChauffeurPerWerkuur: 38_00, onderBusPerRituur: 48_00,
  eigenBusPerRituur: 10_00, uitzendPerWerkuur: 57_00, uitzendVast: 40_00, huurbusPerRituur: 62_00, huurbusVast: 100_00,
  boetePerRituur: 60_00, uitvalUrenPerReputatie: 4, uitvalReputatieMax: 5, spoedToeslag: 0.2, overurenFactor: 1.5, xpPerRituur: 1 } as const
export function vergoedingPerRituur(reputatie: number): number
export function vergoeding(rituren: number, reputatie: number, f: { vergoeding: number }): number
export function chauffeurKosten(wie: Wie['soort'], werkMinuten: number, f: { inhuur: number }, toeslag?: boolean): number
//   eigen/collega/liggen 0; onderaannemer; uitzend (vast alleen als werkMinuten > 0)
export function busKosten(wie: BusWie['soort'], rituren: number, f: { inhuur: number }, toeslag?: boolean): number
export function boete(rituren: number): number
export function reputatieVerlies(uitgevallenRituren: number): number
export function overurenKosten(loon: number, minutenBoven480: number): number
export function uitzendMax(b: Bedrijf): number                 // 1 + floor(niveauVan(b)/2)
export function toeslagGeldt(b: Bedrijf): boolean              // !opleidingKlaar(b, 'planner')
export function besparingChauffeur(werkMinuten: number, f: { inhuur: number }): number
export function besparingBus(rituren: number, f: { inhuur: number }): number
export function terugvalVanConcessie(c: Concessie, reputatie: number, f: { vergoeding: number; inhuur: number }):
  { vergoeding: number; onderaannemer: number; rituren: number }
//   met c.week: gemRituren×vergoeding − (gemWerkuren×38 + gemRituren×48)×f; zonder: het oude dagresultaat(c)
```

**`src/core/busvorm.ts`**:

```ts
export function vormVanVoertuig(v: { naam: string; relativePath: string; aanhanger?: string }): Busvorm
//   aanhanger === undefined: vormVanNaam(naam + ' ' + pad)  (oud gedrag)
//   aanhanger met naam die niet /fahrrad|bike|velo/i: 'geleed'
//   aanhanger === '' (geen couple_back): vormVanNaam, maar 'geleed' wordt 'solo' (map "Gelenkbus" telt niet)
```

**`src/core/bedrijfsdag.ts`**:

```ts
export function migreer(b: Bedrijf, dagen: Dagrooster[], weken: Record<string, Record<string, LijnWeek>>,
  voertuigen: Vehicle[]): { bedrijf: Bedrijf; melding: { bussen: number; diensten: number } }
export function beginDag(b: Bedrijf, dagen: Dagrooster[], weken: …, voertuigen: Vehicle[]): Bedrijf
//   !b.rooster ⇒ migreer; vandaag leeg voor b.dag; rooster.autoAanvullen && planner ⇒ vulAan(…, 'dag');
//   uitvalVoorDag (B) ⇒ meldUitval (B)
```

**Stubs.** Deel 0 schrijft de definitieve signatuur, met `_param` voor ongebruikte parameters (tsconfig.json:10, `noUnusedParameters`).

- `core/rooster.ts` (A):
  - `dagplan(b, dagen, dag, lopend?): DagPlan`: stub zet alles op uitbesteed.
  - `afrekening(b, plan): PlanCijfers`: stub is alles uitbesteed plus lonen.
  - `vulAan(b, dagen, dag, bereik)`: geeft `{ bedrijf: b, bussen: 0, diensten: 0 }`.
  - `pasRoosterToe(b, dagen, actie, lopend?)`: geeft `{ bedrijf: b }`.
- `core/uitval.ts` (B):
  - `uitvalVoorDag(b, dagen): Bedrijf` zet `vandaag.uitval` op leeg.
  - `meldUitval(b, dagen): Bedrijf` geeft b terug.
  - `uitvalVan(b): Uitval[]`.
- `core/invulling.ts` (C):
  - `invulOpties(b, plan, doel): InvulOptie[]` geeft [].
  - `zetInvulling(b, plan, doel, keuze, lopend?)` geeft `{ bedrijf: b }`.
  - `kiesAutomatisch(b, ctx, gat)` geeft `{ keuze: { soort: 'uitzend' }, toeslag: false }`.
- `core/bedrijfsrit.ts` (D): `voorstellen` geeft []; `rijvenster`; `besparingVanRit`; `geredenVan`.
- `core/lijnplan.ts` (E): `bouwLijnplan` geeft een leeg LijnPlan.

**`src/shared/bedrijfApi.ts`**:

```ts
export interface RitOpties { vanRit?: string; totRit?: string; voorgesteldeBus?: boolean }
export type BedrijfKlokStand = { bron: 'omsi'; minuten: number; datum: string; kaartKlopt: boolean } | { bron: 'geen' }
export interface BedrijfPlanApi {
  bedrijfDagen(van: number, tot: number): Promise<Dagrooster[]>            // hoogstens 10 dagen, van ≥ 1
  bedrijfRooster(actie: RoosterActie): Promise<{ payload: CareerPayload; fout?: RoosterFout; melding?: { bussen: number; diensten: number } }>
  bedrijfInvullen(doel: InvulDoel, keuze: InvulKeuze | BusKeuze | null): Promise<{ payload: CareerPayload; fout?: InvulFout }>
  bedrijfRit(dienst: DienstSleutel, opties?: RitOpties): Promise<{ payload: CareerPayload; fout?: RitFout; bus?: { nummer: number; naam: string } }>
  bedrijfRitBus(pad: string): Promise<{ payload: CareerPayload; fout?: 'geen' | 'eigen' | 'gestart' }>
  bedrijfKaart(mapFolder: string, dag?: number): Promise<LijnPlan | { fout: 'kaart' | 'geen' }>
  bedrijfKlok(mapFolder: string): Promise<BedrijfKlokStand>
  bedrijfLijnWeek(mapFolder: string): Promise<Record<string, LijnWeek> | { fout: 'kaart' }>
}
```

- `CareerApi extends BedrijfPlanApi` (api.ts:514).
- `bedrijfDagAf(): Promise<{ payload: CareerPayload; fout?: 'rit' } | CareerPayload>`.
- Preload (preload/index.ts:141-155) krijgt de kanalen `bedrijf:dagen`, `:rooster`, `:invullen`, `:rit`, `:ritBus`, `:kaart`, `:klok` en `:lijnWeek`.

**Tekstbestanden `src/shared/tekst/`.** Er zijn zes bestanden: `fundament.ts`, `planning.ts`, `uitval.ts`, `invullen.ts`, `bedrijfsrit.ts` en `vlootkaart.ts`.
- Vorm van elk bestand: `export const TEKST_X = { … } as const satisfies Record<string, { en: string; de: string; fr: string; nl: string }>`.
- Deel 0 zet alle zes neer; die van A–E zijn leeg (`{}`).
- In i18n.ts:28 wordt de bestaande tabel `const BASIS = {…} as const`. Daarna komt `const TEXT = { ...BASIS, ...TEKST_FUNDAMENT, ...TEKST_PLANNING, ...TEKST_UITVAL, ...TEKST_INVULLEN, ...TEKST_BEDRIJFSRIT, ...TEKST_VLOOTKAART } as const`, en `export const TEKSTBRONNEN = { BASIS, TEKST_FUNDAMENT, … }` voor de proef.
- **Regel: alle `bd.fout.*`-sleutels staan in fundament.ts.**

**`scripts/fixtures/planfixture.ts`** maakt een kunstmatige kaart in het geheugen (een OmsiMap-object en een Calendar-object, zonder bestanden):
- Lijn L1 met omloop A (ma–vr, 05:00–23:30, langer dan 9,5 u, met een LEE-rit en Überliege-ritten van 2 haltes), B (ma–do), C (vr), D (za, vanaf 00:14, met een rit om −15) en E (zo en feestdag).
- Een feestdag op een donderdag en een vakantieperiode.
- `fixtureBedrijf()`: 1 concessie; 3 bussen (geleed, solo, en één in de werkplaats); 5 chauffeurs (ervaring 10 tot 80, één ziek); 1 monteur.
- Hiermee kunnen de proeven in de cloud draaien.

### 3.2 Wijzigingen in bestaande bestanden (deel 0)

**`core/bedrijf.ts`:**

- **Typen** (:36-205):
  - `Bedrijf += { rooster?: VastRooster; vandaag?: Vandaag; ankers?: Record<string, string>; busTeller?: number; personeelTeller?: number }`
  - `Medewerker += { ziekSinds?: number }`
  - `Concessie += { week?: { gemRituren: number; gemWerkuren: number; gemDiensten: number; gemOmlopen: number; piekOmlopen: number; berekendOp: number } }`
  - `BoekingSoort += 'eigen-bus' | 'uitzend' | 'huurbus' | 'boete' | 'overuren' | 'pech'`
  - `BerichtSoort += 'telaat' | 'pech' | 'ochtend' | 'uitgevallen' | 'rooster' | 'vorm'`
  - `DagStaat += { uitgevallen?: number; uitbesteed?: number }`
- **Exports** zonder gedragswijziging:
  - `export { meld as meldBericht, boek as boekRegel }`;
  - `export function reeks` (:498).
- **Tellers:**
  - `volgendNummer` (:531) wordt `max(100, busTeller ?? max(nummers)) + 1` en werkt `busTeller` bij.
  - `neemAan` (:749) doet hetzelfde met `personeelTeller`.
- **Opruimen:**
  - `verkoop` (:584) haalt het nummer uit `rooster.bussen` en uit `vandaag.busInvulling`.
  - `ontsla` (:770) en het vertrek in `sluitDagAf` halen de id uit `rooster.chauffeurs` en uit de `invulling` en `stukInvulling` van collega's.
- **`personeelNaDag`** (:890) wordt `personeelNaDag(b, prognose, plan?: { werkend: number[]; overwerkt: number[]; eigenAandeel: number })`:
  - met `plan`: werkend = `plan.werkend` plus alle monteurs die werken (zoals :897);
  - het doel voor tevredenheid krijgt −8 alleen voor wie in `overwerkt` staat; de algemene regel `onderbezet` (:898) vervalt in dat pad;
  - de reputatiestap gebruikt `aandeel = plan.eigenAandeel`;
  - ziekte (:910): als `ziekTot` nieuw gezet wordt, dan ook `ziekSinds = dag + 1`; bij het wissen van `ziekTot` (:911) ook `ziekSinds` wissen.
- **`schrijfIn(b, kaart, lijn, week?: LijnWeek)`** (:995):
  - de kosten worden `inschrijfkosten({ tours: week?.piekOmlopen ?? lijn.tours }, b)`;
  - de concessie krijgt `week` mee;
  - bij `urenPerDag` blijft de oude waarde staan, voor de terugval zonder week.
- **`sluitDagAf(b, cijfers?: PlanCijfers)`** (:1166):
  - Zonder `cijfers` gebeurt precies wat er nu gebeurt; probe-bedrijf.ts moet 92 keer ok blijven geven.
  - Met `cijfers`:
    - per concessie de boekingen `'vergoeding'` (+) en `'exploitatie'` (− onderaannemer); `wat` is lijn · kaart, met " (zonder kaart)" erachter bij terugval;
    - verder `'eigen-bus'`, `'uitzend'`, `'huurbus'`, `'overuren'`, `'loon'` en `'boete'` (alle −), en `'eigen-personeel'` (+legacyZelf) als die > 0 is;
    - reputatie −`uitgevallen.reputatie`;
    - `personeelNaDag(…, { werkend, overwerkt, eigenAandeel })`;
    - slijtage per eigen bus: `km += busUren×22` en `staat −= busUren×0,4×(1−remming)`. Er is geen gelijke verdeling meer (:1222-1234);
    - xp: `floor(gereden × 1) + (resultaat > 0 ? 10 : 0)`;
    - bericht `'uitgevallen'` { uren, ritten, boete } als er rituren uitvielen;
    - `'dagrapport'` krijgt v += { uitgevallen, jij };
    - DagStaat: `dekking = eigenOmlopen/omlopen`, `openDiensten`, `uitgevallen` en `uitbesteed`.
  - Aan het eind altijd `vandaag: undefined` en `zelfUren: 0`.

**`core/career.ts`** (:96-151): `ActiveDuty += { bedrijf?: LopendeRit }`.

**`core/duty.ts`:**

```ts
export function dutyVanRitten(map: OmsiMap, network: Network,
  deel: { lineFile: string; tourNumber: string; days: number; ritten: string[] }): Duty | undefined
```

- Het filtert `net.departingFrom` op: lineFile (hoofdletterongevoelig), tourNumber, `run.days === days & WEEKDAY_MASK`, `run.period === days & PERIOD_MASK`, en `${run.tripFile}@${run.departure}` in `ritten`.
- Daarna sorteren, ontdubbelen en `toDuty` (:158) aanroepen.
- Er wordt op sleutel gefilterd en niet op `arrival ≤ tot`: 265 runs hebben een aankomst met een breuk (t3.ts).

**`core/vehicles.ts`** (:78-95): `Vehicle += { aanhanger?: string }`. Dat is de regel na `[couple_back]`, of `''` als die er niet is. Het bestand wordt toch al gelezen, dus dit kost geen extra tijd. De cache zit alleen in het geheugen (kaartlaag.ts:414-417).

**`core/kaartlaag.ts`** — de interface (:60-128) plus de implementatie:
- `kaartDag(folder, lineFiles, anker, dag): KaartDag`, gecachet op `${folder}|${[...lineFiles].sort()}|${anker}|${dag}`, hoogstens 64 stuks;
- `lijnWeek(folder, anker, vanDag)`;
- `dienstDuty(folder, deel)` roept `dutyVanRitten` aan;
- `lijnplan(folder, lineFiles, anker, dag)` roept `bouwLijnplan(map, (legs) => laag.routes(folder, legs), …)` aan.

**`main/kaartwerker.ts`** — de Opdracht (:27-42) krijgt twee soorten erbij:
- `{ soort: 'dienstduty'; folder; deel }`
- `{ soort: 'lijnplan'; folder; lineFiles; anker; dag }`

In de dispatch komen expliciete `else if`'s. De laatste tak `else uitkomst = laag.routes(...)` (:115) wordt `else if (opdracht.soort === 'routes') … else throw new Error('onbekende opdracht')`.

**`main/index.ts`:**

- **Slot:**

  ```ts
  let bedrijfSlot: Promise<unknown> = Promise.resolve()
  function inSlot<T>(doen: () => Promise<T>): Promise<T> { const v = bedrijfSlot.then(doen, doen); bedrijfSlot = v.catch(() => undefined); return v }
  ```

- **`dagroostersVoor(b, van, tot): Promise<{ dagen: Dagrooster[]; ankers: Record<string,string>; weken: Record<string, Record<string, LijnWeek>> }>`:**
  - per unieke mapFolder van de concessies: `laag().kaartDag(...)` in main, want warm kost dat ongeveer 2,6 ms;
  - na elke kaart `await new Promise(setImmediate)`;
  - `try/catch` per kaart: bij een fout krijgt die kaart `{ fout: 'kaart' }`;
  - het anker komt uit `b.ankers[folder] ?? ankerVoor(era(folder))`;
  - `weken` alleen als erom gevraagd wordt (migratie, en concessies zonder `week`).
- **Handlers:**
  - `bedrijf:dagen` — alleen lezen, zonder slot.
  - `bedrijf:rooster` — `inSlot`:
    - dagen ophalen: `dag−1..dag+1`, of bij `bereik 'week'` `dag−1..dag+7`;
    - dan `career.bedrijf` opnieuw lezen;
    - bij `actie.eerste && !b.rooster` → `migreer`, anders `pasRoosterToe(b, dagen, actie, career.activeDuty?.bedrijf)`;
    - ankers wegschrijven en `persist`.
  - `bedrijf:invullen` — `inSlot`: dagen `dag−1..dag+1`, opnieuw lezen, `zetInvulling(b, dagplan(b, dagen, b.dag, lopend), doel, keuze, lopend)`, `persist`.
  - `bedrijf:dagAf` (vervangt :5047-5050):

    ```ts
    inSlot(async () => {
      if (!career?.bedrijf) return careerPayload()
      if (career.activeDuty?.bedrijf) return { payload: careerPayload(), fout: 'rit' }
      const d0 = career.bedrijf.dag
      const { dagen, ankers, weken } = await dagroostersVoor(career.bedrijf, d0 - 1, d0 + 8, { weken: true })
      let voertuigen: Vehicle[] = []; try { voertuigen = await werkerVraag({ soort: 'voertuigen' }) } catch { voertuigen = laag().voertuigen() }
      // ---- vanaf hier geen await meer ----
      if (!career?.bedrijf) return careerPayload()
      if (career.activeDuty?.bedrijf) return { payload: careerPayload(), fout: 'rit' }
      let b = metAnkersEnWeken(career.bedrijf, ankers, weken)
      if (!b.rooster) b = migreer(b, dagen, weken, voertuigen).bedrijf      // eerste keer
      const cijfers = afrekening(b, dagplan(b, dagen, b.dag))
      let na = sluitDagAf(b, cijfers)
      na = beginDag(na, dagen, weken, voertuigen)
      return persist({ ...career, bedrijf: na })
    })
    ```

  - `bedrijf:kaart` — `werkerVraag({ soort: 'lijnplan', … }, 'voorgrond')`, met terugval op `laag().lijnplan`.
  - `bedrijf:klok`:
    - `freshLive()` (:1604);
    - `kaartKlopt` is waar als de mapFolder van `activeDuty.assignment.duty` of van `vrijeRit` gelijk is aan de gevraagde kaart. Anders, als `live.alive` en `mem.lineName` bij een concessielijn van die kaart hoort: waar. In alle andere gevallen `{ bron: 'geen' }`. `readLastMap` wordt niet gebruikt, want dat is pas bekend als OMSI afgesloten is (startup.ts:95-105);
    - `minuten = live.time/60`, `datum = y-m-d uit live`.
  - `bedrijf:lijnWeek` — `laag().lijnWeek(folder, anker, b?.dag ?? 1)`.
  - `bedrijf:inschrijven` (:4940-4948) — `lijnWeek` voor die lijn berekenen, dan `schrijfIn(b, kaart, lijn, week)` en het anker vastleggen.
  - `bedrijf:rit` en `bedrijf:ritBus` — stub: `{ payload: careerPayload() }`, zonder fout (tech 16).
  - Het geheugen van `kaartDag` wordt gewist in `vergeetKaarten` (:262).

**Renderer:**

- **App.tsx:**
  - `<BedrijfApp>` komt in `<LanguageProvider language={language}>` (:2359);
  - state `bedrijfTab`, `setBedrijfTab`, `bedrijfMelding` naar App tillen;
  - nieuwe props: `activeDuty={career.state.activeDuty}`, `tab`, `onTab`, `melding`, `onMeldingWeg`, en de stubs `onRijden(payload, later?)` en `onNaarRit()`.
- **`Bedrijf.tsx`** wordt de schil:
  - zijbalk en tabs, met `Tab += 'planning' | 'kaart'`; na dashboard komen `{planning, 'duty', 'bd.nav.planning'}` en `{kaart, 'map', 'bd.nav.map'}`;
  - de `handel` (:85-96) wordt: `'kas'` → `bd.tooExpensive`, anders `loose(taal, 'bd.fout.' + fout, tr('bd.failed'))`;
  - de schil roept één keer `useDagplan(bedrijf, bedrijf.dag, lopend, onCareer)` aan en geeft `plan` en `cijfers` door;
  - hij omhult alles met `<ZelfRijdenProvider …>` (D);
  - slots: `<BedrijfsritBanner>` (D) boven de tab-inhoud; `<ZelfRijdenKnop/>` (D) en `<DagAfsluitKnop>` (B) in de zijbalk (dat laatste vervangt :127-135); `<Ochtendvenster>` (B) als de schil `ochtend` in de state heeft;
  - de render-switch krijgt `<Planning>` en `<Vlootkaart>`.
- **Verhuizing, zonder gedragswijziging:**

  | Nieuw bestand | Wat erin komt |
  |---|---|
  | `BedrijfDelen.tsx` | `Tegel`, `Paneel`, `Meter`, `Staatbalk`, `useGeld`, `KasChip`, de typen `Handel`, `Tab` en `Focus`, `naar` |
  | `BedrijfDashboard.tsx` | Dashboard |
  | `BedrijfConcessies.tsx` | Concessies en Aanbestedingen |
  | `BedrijfWagenpark.tsx` | Wagenpark, BusRij en Markt |
  | `BedrijfPersoneel.tsx` | Personeel en MedewerkerRij |

  `Boeken` en `Oprichten` blijven in de schil.
- **`useDagplan.ts`:**

  ```ts
  export function useDagplan(b: Bedrijf | undefined, dag: number | undefined, lopend?: LopendeRit,
    onCareer?: (p: CareerPayload) => void): { dagen?: Dagrooster[]; plan?: DagPlan; cijfers?: PlanCijfers; laden: boolean; ververs(): void }
  ```

  - Haalt `bedrijfDagen(dag−1, dag+1)` op, met als sleutel `${dag}|${concessies}|${ankers}`.
  - `plan` en `cijfers` via `useMemo([b, dagen, lopend])`.
  - Als `!b.rooster && b.concessies.length && dag === b.dag`: één keer `bedrijfRooster({ soort: 'vulAan', dag, bereik: 'week', eerste: true })`, daarna `onCareer`.
- **BedrijfPost.tsx:**
  - AFZENDER (:20-35): telaat → personeelszaken; pech → werkplaats; ochtend → directie; uitgevallen → opdrachtgever; rooster → directie; vorm → werkplaats.
  - `BEDRAGEN` (:38) += `boete` en `kosten`.
  - `toon()`: pech en uitgevallen zijn slecht; rooster is goed; ochtend is slecht als `open > 0`.
  - `vorm`: `v.vorm` vertalen via `bd.vorm.*`, zoals bij `opleiding` (:52).
- **bedrijf.css** (:1092-1120): onder 980 px een compacte, horizontaal scrollende tabbalk met iconen, die niet afbreekt (spel 19).

### 3.3 Migratie

`migreer`, bij de eerste schrijfactie in de nieuwe versie; normaal is dat de automatische `vulAan eerste` uit `useDagplan`:

1. De ankers per kaart van de concessies vastleggen.
2. `c.week` vullen voor elke concessie waarvan de kaart gevonden wordt.
3. `busTeller` en `personeelTeller` op het huidige maximum zetten.
4. Bussen herkennen: `vormVanVoertuig` op het geïnstalleerde voertuig. Wijkt dat af van `EigenBus.vorm`, dan wordt de vorm aangepast en komt er per bus een bericht `'vorm'`. Lucs SG292 (bus 101) wordt dan een gelede bus; het aankoopbedrag blijft staan.
5. `rooster = vulAan(week)` en `rooster.gemaakt = dag`.
6. Bericht `'rooster'` met { uren (vandaag), oud (Σ urenPerDag), bussen, diensten }.
7. Een `vandaag` met `dag !== b.dag` wordt genegeerd. `zelfUren` blijft voor ritten uit het hoofdmenu en telt als legacyZelf.

### 3.4 Tekst voor deel 0 (fundament.ts)

Hieronder de Nederlandse tekst. De bouwer vult Engels, Duits en Frans aan, met dezelfde `{plaatshouders}`.

| Sleutel | Nederlandse tekst |
|---|---|
| bd.nav.planning | Planning |
| bd.nav.map | Kaart |
| bd.fout.geen | Er is nog geen busbedrijf. |
| bd.fout.weg | Dat kan nu niet (meer). |
| bd.fout.al | Dat heb je al. |
| bd.fout.niveau | Daarvoor is je bedrijf nog niet op het goede niveau. |
| bd.fout.lijn | Die lijn staat niet (meer) op de kaart. |
| bd.fout.kaart | De kaart van deze concessie staat niet in je OMSI-map. |
| bd.fout.dag | Dat kan alleen voor vandaag. |
| bd.fout.rit | Rond eerst je bedrijfsrit af of geef hem terug; dan kun je de dag afsluiten. |
| bd.fout.bezet | Die is op dat moment al ingedeeld. |
| bd.fout.te-lang | Dan werkt die chauffeur meer dan 10 uur op één dag. Dat mag niet. |
| bd.fout.planner | Dat kan pas na de opleiding Planner. |
| bd.fout.geenPlek | Op deze lijn is geen omloop meer vrij waar deze bus tussen past. |
| bd.fout.kort | Te kort dag: de onderaannemer heeft niemand meer vrij. |
| bd.fout.vol | Het uitzendbureau heeft vandaag niemand meer. |
| bd.fout.bezig | Deze dienst rijd je nu zelf. |
| bd.fout.gereden | Deze dienst heb je vandaag al (deels) gereden. |
| bd.fout.ritBezig | Je hebt al een dienst aangenomen. Rond die eerst af of geef hem terug. |
| bd.fout.dienst | Deze dienst bestaat vandaag niet (meer). |
| bd.fout.bus | De bus van deze omloop is niet geïnstalleerd in OMSI. |
| bd.fout.busLigt | Deze omloop heeft vandaag geen bus: je liet hem uitvallen. Kies eerst een bus. |
| bd.fout.venster | Kies een eerste en een laatste rit binnen de dienst. |
| bd.kind.eigen-bus | Eigen bussen (brandstof en verzekering) |
| bd.kind.uitzend | Uitzendkrachten |
| bd.kind.huurbus | Vervangende bussen |
| bd.kind.boete | Boete opdrachtgever |
| bd.kind.overuren | Overuren |
| bd.kind.pech | Pech (sleepdienst en onderdelen) |
| bd.dag.ma … bd.dag.zo | ma / di / wo / do / vr / za / zo |
| bd.dag.feest | feestdag |
| bd.masker.school / bd.masker.break | alleen schooldagen / alleen vakantie |
| bd.vorm.midi / solo / geleed / dubbel | midibus / solobus / gelede bus / dubbeldekker |
| tb.msg.uitgevallen.t | {uren} dienstregelingsuren vielen uit |
| tb.msg.uitgevallen.b | Van de opdrachtgever: {ritten} ritten zijn niet gereden. De boete is {boete}, en het kost reputatie. |
| tb.msg.rooster.t | Nieuw: je rooster |
| tb.msg.rooster.b | Vanaf nu plant het bedrijf per dag uit de echte dienstregeling van de kaart. De opdrachtgever betaalt per gereden dienstregelingsuur van die dag: vandaag {uren} u. Eerder telde de app {oud} u, alle dagsoorten bij elkaar. {bussen} bussen en {diensten} diensten zijn al ingedeeld; wat leeg blijft, besteedt het bedrijf uit. Kijk in Planning. |
| tb.msg.vorm.t | Bus {nummer} is een {vorm} |
| tb.msg.vorm.b | OMSI koppelt er een aanhanger aan, maar de app telde hem als solobus. Waarde en planning rekenen nu met een {vorm}. |

In BASIS (i18n.ts) worden `tb.msg.dagrapport.b` en `bd.alert.openShifts` aangepast: "{open}" betekent daar voortaan plotse open diensten.

### 3.5 Randgevallen van deel 0

- **Geen OMSI of geen kaart:** alle concessies gaan op de terugval, en er is geen `beginDag`-uitval voor diensten. Uitval voor bussen en chauffeurs wordt wel getrokken.
- **Een kaart met `fout`:** alleen haar concessies gaan op de terugval.
- **Concessie verloopt bij de afsluiting:** de dagroosters van N+1 zijn nog gemaakt met de oude concessies, maar `dagplan` filtert op `heeftConcessie` (bedrijf.ts:984).
- **Twee snelle acties:** het slot houdt ze op volgorde, en elke handler leest `career.bedrijf` pas na zijn await.
- **Stubs** geven het bedrijf ongewijzigd terug en nooit `fout: 'geen'`, want dat betekent "geen bedrijf" (index.ts:4940).

### 3.6 Testplan deel 0

Deze proeven kunnen in de cloud draaien:

- `npx tsc --noEmit`. Stubs gebruiken `_param`, en scripts worden meegecontroleerd (tsconfig.json:21).
- `npx electron-vite build`.
- `npx tsx scripts/probe-bedrijf.ts` moet 92 keer ok blijven geven. Nieuwe gevallen:
  - `sluitDagAf(b, fixtureCijfers)` boekt precies de bedragen uit de fixture, allemaal `Number.isInteger`;
  - de kas-delta is `vergoeding − kosten + legacyZelf`;
  - `dagstaat.uitgevallen` en `.uitbesteed` kloppen;
  - `vandaag` is weg en `zelfUren` is 0;
  - de tellers: verkoop bus 102 als hoogste, daarna kopen → 103;
  - ontslag van id 5, daarna aannemen → 6; het rooster is opgeruimd;
  - `ziekSinds === dag + 1`, en het wordt gewist als `ziekTot` gewist wordt;
  - `personeelNaDag` met werkend: monteurs krijgen ervaring, en alleen wie in `overwerkt` staat krijgt −8 op zijn doel.
- `npx tsx scripts/probe-planfixture.ts` (nieuw, puur):
  - dag 1 is een maandag;
  - de maskers geven per weekdag de juiste omlopen, en de feestdag geeft de zondagdienst;
  - omloop A wordt in 2 of 3 delen geknipt, elk ≤ 570 minuten, en elke knip ligt vóór een rit die telt met een pauze ≥ 3;
  - omloop D bevat de rit om −15 en die om 00:14;
  - sleutels zijn uniek, en `ontleed*` geeft terug wat erin ging, ook met een `|` in tourNumber;
  - `dutyVanRitten`: `legs` zijn precies de ritten met `telt`, met hetzelfde tourNumber;
  - `planregels.toets`: dubbel, rust, overstap, nachtrust (vr 24:51 tegen za 00:14 is dubbel) en te-lang;
  - `plantarief`: alles in hele centen, en de bedragen uit §2.2;
  - `busvorm`: met aanhanger geleed; een fietsaanhanger blijft solo; `''` plus "Gelenkbus" in het pad wordt solo.
- `npx tsx scripts/probe-teksten.ts` (nieuw):
  - geen sleutel staat in twee bronnen van `TEKSTBRONNEN`;
  - elke taal heeft dezelfde set `{…}` als nl;
  - elke `bd.fout.<RitFout|InvulFout|RoosterFout>` bestaat.

Deze proeven moeten lokaal, met OMSI:

- `npx tsx scripts/probe-bedrijfsplan.ts [kaart] [lijn]` (HafenCity 109, cache in mkdtemp):
  - de aantallen uit §2.1 met een marge van ±0,5 u;
  - 0 diensten langer dan 570 en 0 zonder rit die telt;
  - `dienstDuty` voor alle 28 diensten van een werkdag: `legs.length` is gelijk aan het aantal ritten met `telt`;
  - warme `kaartDag` in minder dan 20 ms.
- `npx electron scripts/probe-bedrijfdag.cjs`:
  - tijdelijke userData via mkdtemp, met settings `{language:'nl', tourSeen:true}`;
  - alles via IPC: profiel aanmaken, `bedrijfOprichten`, `bedrijfInschrijven('HafenCityHamburg', lijn109)` (kosten 13.000 €), `bedrijfKoop` van twee bussen, `bedrijfAannemen` van twee chauffeurs;
  - `bedrijfDagen(1,1)` geeft 22 omlopen en 28 diensten;
  - de zijbalk toont in het Nederlands "Planning", "Kaart" en "Dag afsluiten";
  - na de migratie staat er een rooster met 2 bussen en ≥ 2 diensten, en een bericht 'rooster';
  - 5 keer dag afsluiten geeft geen fout;
  - schermafdruk via `capturePage`;
  - Lucs `%APPDATA%\omsi-enhancer` wordt niet gelezen en niet beschreven.

---

## 4. DEEL A — Planscherm, rooster, afrekening, dashboard en markt

### 4.1 Scherm (tab "Planning")

**Kop:**
- "Planning · dag 12 · dinsdag 26 april 2016 (schooldag)".
- Bij meer kaarten ook kaartchips.
- Een geldregel die na elke actie ververst: "Vandaag: vergoeding € 16.218 · kosten € 14.539 · resultaat +€ 1.679" (uit `afrekening`).

**Weekstrook:** zeven dagen vanaf vandaag, bijvoorbeeld "di 12 · 3/28 · +€ 1.679 | … | za 16 · 0/23 · +€ 490 | zo 17 · 0/18".
- Een lege dagsoort is geel gemarkeerd.
- Klik je een andere dag aan, dan staat het rooster voor dat masker open. Er staat dan: "Vooruitkijken: je past het vaste rooster aan. Uitval en invullen zie je pas op de dag zelf."
- Is er voor een masker nog niets ingedeeld, maar voor een ander wel: [Rooster overnemen van ma–vr].

**Werkbalk:**
- [Vul aan ▾] met "Alleen deze dag" en "De hele week".
- [Rooster leegmaken ▾] met "Alleen {masker}" en "Alles". Er komt een bevestigingsvraag, en daarna 10 s een balk met [Ongedaan maken].
- De schakelaar "Elke nieuwe dag zelf aanvullen". Voor de opleiding Planner is hij uit, met de uitleg zichtbaar eronder (niet alleen in `title`).
- Weergave: [Per omloop | Mensen en bussen].
- Zoomknoppen −/+.

**Tellingregels:**
- "28 diensten · 1 eigen · 0 jij · 0 uitzend · 27 uitbesteed · 0 open"
- "22 omlopen · 1 met eigen bus"
- De chip "2 conflicten" filtert erop.
- Waar het speelt: "Buiten de planning gereden: 1,3 u (telt als invaluren)."

**Rooster, per omloop:**
- Tijdas van `min(van)` tot `max(tot)` van de dag. Standaard 64 px per uur, in te stellen van 32 tot 160, horizontaal scrollend.
- Een vaste linkerkolom van 220 px en een vaste tijdas bovenaan.
- Per lijn gegroepeerd, met een lijnkop waarop je een bus kunt laten vallen (de app kiest de beste vrije omloop).
- Een rij van 44 px:
  - links "55103 · gelede bus · geldt voor ma–vr" met het busvak (chip "101" of "+ bus"), en daaronder in het klein "eigen bus bespaart € 264";
  - op de as de dienstblokken "05:05–14:30" met de chip van de chauffeur;
  - kleuren: eigen = accent, jij = geel, uitzend = paars, centrale = paars gestreept, uitbesteed = gedempt en zonder tekst, open/valt uit = rood.
- Het lege busvak verwijst naar Markt, gefilterd op vorm.
- Een uitbesteed blok verwijst in de popover naar de sollicitanten.

**Weergave "Mensen en bussen":**
- rijen per eigen chauffeur (zijn diensten) en per eigen bus (zijn omlopen);
- een ingeklapte rij "Uitbesteed (27)". Uit die rij sleep je blokken naar een chauffeur.

**Zijbalk "Vrij vandaag":**
- kop "Wie vrij is, springt bij uitval als eerste in.";
- chauffeurs: "Anna B. · 7,1 u werk · bespaart € 270 · loon € 230". Groen als de besparing ≥ loon, rood als hij eronder zit. Ook "geen dienst · loon € 230", "ziek t/m dag 13" en "op cursus";
- bussen: "101 · staat 82 · pechkans 1,2 %" (formule B), "werkplaats" en "niet geïnstalleerd in OMSI".

**Bediening:**
- Slepen gaat met pointer-events: 6 px drempel, op aanraking na 350 ms lang drukken.
- Tik-tik: tik een chip, dan lichten de blokken op waar die past (`toets`), tik een blok om in te delen; Esc of een tik op leeg annuleert.
- Onder 900 px breed wordt het een lijst per omloop, met keuzelijsten.
- Popover van een dienst:
  - "Dienst 55103-1 · lijn 109 · 05:05–14:30 · werktijd 9,4 u · betaald 7,1 u · 13 ritten"
  - "Kost vandaag € 357 (uitbesteed)"
  - "Van HafenCity Universität naar Hauptbahnhof/ZOB"
  - [Chauffeur ▾] en [Bus (hele omloop) ▾], de conflictregels, [Zelf rijden] (via `useZelfRijden().open(d)`, D) en [Uit het rooster halen].

**Onder het rooster:** de slots `<UitvalMeldingen>` (B) en `<OpenDiensten>` (C). De dienst die je nu zelf rijdt, staat op slot met "Rijdt nu (jij)".

**Lege staten:** zie de sleutels in §4.4. Bij de eerste keer staat er een uitlegkaart over omloop, dienst en geld (`bd.plan.uitleg`).

**Dashboard** (BedrijfDashboard.tsx):
- De tegels gebruiken `cijfers` als die er zijn; anders `dagprognose` (:201).
- De tegel Concessies: "22 omlopen · 153 u vandaag".
- De aandachtlijst:
  - open gaten en conflicten gaan naar 'planning' met focus (nu gaat het naar 'personeel', :239-244);
  - stilstand: "Bus 102 staat vandaag niet in het rooster" en "Anna heeft vandaag geen dienst" → planning [Vul aan];
  - plus `aandachtUitval()` (B);
  - plus het slot `<ZelfRijdenTegel>` (D).

**Personeel** (BedrijfPersoneel.tsx):
- De oude urenbalk (:858-899) wordt "Vandaag 1 dienst met eigen chauffeurs, 27 uitbesteed." [Naar planning].
- Een sollicitant: "Op een gemiddelde dienst (7,0 u) bespaart Anna € 265 per dag; loon € 234."

**Concessies en Aanbestedingen** (BedrijfConcessies.tsx):
- Per lijn "136,8 u per dag gemiddeld · 22 omlopen op drukke dagen · ± € 1.080 per dag uitbesteed". Dit komt uit `c.week` en `bedrijfLijnWeek`, en vervangt :478 en :558-559.
- Inschrijven: "kost € 2.000 plus € 500 per omloop op de drukste dag".

**Wagenpark en Markt** (BedrijfWagenpark.tsx):
- de pechkans per bus;
- in de markt: "Op een gemiddelde omloop (6,8 u) bespaart deze bus € 258 per dag: terug in 233 dagen";
- de vorm corrigeren komt niet in deze bouw (dat hoort bij F).

### 4.2 Rekenregels (`core/rooster.ts`)

```ts
export function dagplan(b: Bedrijf, dagen: Dagrooster[], dag: number, lopend?: LopendeRit): DagPlan
export function afrekening(b: Bedrijf, plan: DagPlan): PlanCijfers
export function vulAan(b: Bedrijf, dagen: Dagrooster[], dag: number, bereik: 'dag' | 'week'): { bedrijf: Bedrijf; bussen: number; diensten: number }
export function pasRoosterToe(b: Bedrijf, dagen: Dagrooster[], actie: RoosterActie, lopend?: LopendeRit):
  { bedrijf: Bedrijf; melding?: { bussen: number; diensten: number } } | { fout: RoosterFout }
export function minutenVan(plan: DagPlan, id: number): number
```

**`dagplan`** is deterministisch. Omlopen staan op (van, sleutel), diensten op (van, sleutel).
- `isVandaag = dag === b.dag`.
- `v = isVandaag && b.vandaag?.dag === dag ? b.vandaag : leeg`.
- Alleen omlopen van lijnen met een concessie tellen. Concessies van een kaart met `fout` gaan in `terugval`.

1. **Bus per omloop:**
   - `v.busInvulling[o]` (bron hand):
     - eigen: de bus bestaat, is inzetbaar en overlapt niet (±10 min); anders een conflict en door naar de volgende stap;
     - huur of liggen: zoals gekozen.
   - `rooster.bussen[o]`:
     - bus bestaat niet → `bus-weg` (fout), standaard uitbesteed;
     - `uitval` pech voor deze bus → plots gat (reden pech);
     - `!isInzetbaar` (bedrijf.ts:479) → `bus-werkplaats` (let), standaard uitbesteed;
     - overlap met een eerdere omloop van dezelfde bus → `bus-dubbel` (fout), uitbesteed;
     - `omloop.vorm` bekend en anders dan de bus → `bus-vorm` (let), maar de bus blijft eigen.
   - Anders: uitbesteed (bron standaard).
2. **Chauffeur per dienst:**
   - bus op liggen → stand liggen, uitgevallen = rituren;
   - `v.invulling[d]` (bron hand): collega (bestaat, beschikbaar, `toets` zonder dubbel of te-lang; anders een conflict en genegeerd), uitzend, onderaannemer of liggen;
   - `rooster.chauffeurs[d] = id`:
     - bestaat niet → `chauffeur-weg` (fout), standaard;
     - rol monteur → `monteur` (fout), standaard;
     - `isVandaag && ziekSinds === dag` → plots gat (ziek);
     - ziek (niet de eerste dag) of op cursus → `chauffeur-afwezig` (let), standaard;
     - `toets` geeft dubbel → `chauffeur-dubbel` (fout), standaard;
     - `toets` geeft te-lang → `te-lang` (fout), standaard;
     - anders eigen; dan eventueel als let: rust < 20, overstap (andere halte en < 45 minuten), overuren (> 480), nachtrust (< 660 tegenover dag−1 of dag+1) en bevoegd (ervaring < 25 op geleed of dubbel, voor de bus die rijdt; bij uitbesteed of huur de vorm van de omloop).
   - Telaat voor deze id, en dit is zijn eerste dienst van de dag: `stuk = [van, vertrek van de eerste rit met vertrek ≥ van + minuten)`. Als dat de hele dienst beslaat, is de hele dienst een plots gat.
   - Het stuk krijgt `v.stukInvulling[d]` (hand), of wordt een gat (plots, telaat).
   - Geen roosterchauffeur → uitbesteed (standaard).
3. **Jij:** `lopend?.dienst === d && lopend.dag === dag` → `jij = { nu: true }`; `v.gereden[d]` → `jij.gereden`.
4. **Centrale**, alleen als `isVandaag`, voor gaten zonder handmatige invulling, op volgorde van `van`: `kiesAutomatisch` (C) op een context met de vrije chauffeurs en bussen, het werk tot nu en het uitzendgebruik. Handmatige uitzend-invullingen tellen eerst mee.
5. **Kosten:**
   - Wat jij rijdt, gaat eerst van het stuk af als je venster erin valt, anders van de dienst.
   - `rest werkMin = minuten − gereden.werkMinuten`, `rest rituren = rituren − gereden.rituren`.
   - `stand.kosten = chauffeurKosten(wie, rest werkMin, f, toeslag)`.
   - Bij liggen: uitgevallen += rest rituren.
   - Bus: `busKosten(wie, gereden rituren van de omloop, f, toeslag)`.
6. **Overig:**
   - `vrij`: chauffeurs die beschikbaar zijn maar geen werk hebben; bussen die inzetbaar zijn maar geen omloop hebben.
   - `werk[id]`, `uitzend { gebruikt, max: uitzendMax(b) }`, `telling`.

**`afrekening`** rondt per dienst en per omloop af en telt daarna op (tech 28). Wat het berekent:
- vergoeding per concessie, over de gereden rituren;
- onderaannemer: de uitbestede chauffeurs plus de bussen van de onderaannemer;
- `eigenBus`, `uitzend` en `huurbus`;
- `overuren`, per medewerker: `overurenKosten(loon, werk − 480)`;
- `lonen`: Σ loon van al het personeel, zoals :687;
- boete en reputatie;
- `legacyZelf = round(min(zelfUren, Σ rituren van uitbestede diensten) × 38_00 × f.inhuur)`;
- terugval-concessies via `terugvalVanConcessie`;
- `werkend`: eigen en collega met rest-werk > 0;
- `overwerkt`: > 480;
- `eigenAandeel`: (rituren van eigen chauffeurs + jij) / gereden rituren;
- `busUren`, `kosten` en de tellingen.

**`vulAan`** gaat per dag in `bereik`, op volgorde, en overschrijft nooit iets.
- **Bussen:** eigen bussen, inzetbaar op die dag (voor latere dagen: `werkplaatsTot < dag`).
  - Per bus, gesorteerd op staat van hoog naar laag, kiest hij de set omlopen zonder overlap (±10) met het meeste gewicht (gewogen intervalplanning). Gewicht = rituren × (vorm klopt ? 1 : 0,9).
  - Wat al bezet is op andere maskers van dezelfde dag, telt als bezet.
- **Chauffeurs:** de open diensten, gesorteerd op werktijd van lang naar kort.
  - Per dienst kiest hij de best passende chauffeur: `toets` zonder dubbel, rust ≥ 20, dag ≤ 480 (geen overuren), nachtrust ≥ 660 tegenover de buurdagen in het bereik.
  - Voorkeur: eerst bevoegd, dan de meeste al ingeplande minuten die nog passen (best-fit), dan ervaring, dan id.
  - Nooit iemand die ziek is of op cursus op die dag.
- De optie "met overuren" vervalt (spel 10). Overuren kosten ongeveer € 43 per werkuur tegen € 38 voor de onderaannemer.

**`pasRoosterToe`:**
- `bus` en `chauffeur`: bestaat → anders `'weg'`; `te-lang` wordt geweigerd; dubbel, overuren, bevoegd en nachtrust mogen, dan komt er een conflict.
- `busOpLijn` kiest de vrije omloop met de meeste rituren zonder overlap; anders `'geenPlek'`.
- `kopieer`: eerst per gelijk tourNumber, anders op rangorde van `van`.
- `herstel` zet het rooster terug.
- `auto` vraagt de opleiding Planner (`'planner'`).
- `wis` wist alles of één masker.

### 4.3 Bestanden van deel A

A bezit:
- `core/rooster.ts`, en `core/planregels.ts` voor wijzigingen na deel 0;
- `renderer/src/Planning.tsx` en `planning.css`, met de tokens van `.hub`;
- `BedrijfDashboard.tsx`, `BedrijfConcessies.tsx`, `BedrijfPersoneel.tsx` en `BedrijfWagenpark.tsx`;
- `shared/tekst/planning.ts`;
- `scripts/probe-rooster.ts` en `scripts/probe-planning.cjs`.

### 4.4 Tekst voor deel A (planning.ts)

| Sleutel | Nederlandse tekst |
|---|---|
| bd.plan.titel | Planning · dag {dag} · {datum} |
| bd.plan.soort.school / .break / .holiday | schooldag / schoolvakantie / feestdag |
| bd.plan.geld | Vandaag: vergoeding {vergoeding} · kosten {kosten} · resultaat {resultaat} |
| bd.plan.geldToekomst | Verwacht op {datum}: resultaat {resultaat} |
| bd.plan.week | Deze week |
| bd.plan.weekDag | {dag} {nr} · {eigen}/{diensten} |
| bd.plan.vulAan / .vulAanDag / .vulAanWeek | Vul aan / Alleen deze dag / De hele week |
| bd.plan.vulAanKlaar | {bussen} bussen en {diensten} diensten ingedeeld. |
| bd.plan.leegmaken / .leegMasker / .leegAlles | Rooster leegmaken / Alleen {masker} / Alles |
| bd.plan.leegVraag | {n} indelingen weghalen? Je kunt het daarna nog ongedaan maken. |
| bd.plan.ongedaan / .ongedaanKlaar | Ongedaan maken / Rooster teruggezet. |
| bd.plan.auto / .autoPlanner | Elke nieuwe dag zelf aanvullen / Kan na de opleiding Planner. |
| bd.plan.weergave.omlopen / .mensen | Per omloop / Mensen en bussen |
| bd.plan.zoomIn / .zoomUit | Inzoomen / Uitzoomen |
| bd.plan.telling | {n} diensten · {eigen} eigen · {jij} jij · {uitzend} uitzend · {uitbesteed} uitbesteed · {open} open |
| bd.plan.omlopenTelling | {n} omlopen · {eigen} met eigen bus |
| bd.plan.conflicten | {n} conflicten |
| bd.plan.omloop | Omloop {nr} |
| bd.plan.geldtVoor | geldt voor {masker} |
| bd.plan.busVak / .busVakUitleg | Sleep een bus hierheen / Zonder eigen bus rijdt de onderaannemer deze omloop met zijn eigen bus. |
| bd.plan.busKopen | Bus kopen |
| bd.plan.busBespaart | eigen bus bespaart {geld} |
| bd.plan.uitbesteed / .jij / .rijdtNu / .uitzend / .centrale | Uitbesteed / Jij / Rijdt nu (jij) / Uitzend / centrale |
| bd.plan.open | OPEN · {reden} |
| bd.plan.vrij / .vrijUitleg | Vrij vandaag / Wie vrij is, springt bij uitval als eerste in. |
| bd.plan.chauffeurs / .bussen | Chauffeurs / Bussen |
| bd.plan.chauffeurWerk | {uren} u werk · bespaart {bespaart} · loon {loon} |
| bd.plan.chauffeurVrij | geen dienst · loon {loon} |
| bd.plan.ziekTot / .cursus | ziek t/m dag {dag} / op cursus |
| bd.plan.busStaat | staat {staat} · pechkans {kans}% |
| bd.plan.werkplaats / .nietGeinstalleerd | werkplaats / niet geïnstalleerd in OMSI |
| bd.plan.dienst | Dienst {omloop}-{deel} |
| bd.plan.dienstRegel | Lijn {lijn} · {van}–{tot} · werktijd {werk} u · betaald {betaald} u · {ritten} ritten |
| bd.plan.dienstKosten | Kost vandaag {geld} ({wie}) |
| bd.plan.vanNaar | Van {van} naar {naar} |
| bd.plan.chauffeur / .busOmloop / .uitRooster | Chauffeur / Bus (hele omloop) / Uit het rooster halen |
| bd.plan.kiesPlek | Tik op een dienst om {naam} in te delen. |
| bd.plan.kopieer | Rooster overnemen van {masker} |
| bd.plan.leegMaskerMelding | {masker} heeft nog geen rooster: {bussen} bussen en {mensen} chauffeurs staan dan stil. |
| bd.plan.buiten | Buiten de planning gereden: {uren} u (telt als invaluren). |
| bd.plan.toekomst | Vooruitkijken: je past het vaste rooster aan. Uitval en invullen zie je pas op de dag zelf. |
| bd.plan.uitleg | Een omloop is de dag van één bus; een dienst is het stuk dat één chauffeur ervan rijdt, hoogstens 9,5 uur. De opdrachtgever betaalt per dienstregelingsuur; een uitbestede chauffeur kost per werkuur. |
| bd.plan.geenConcessie / .naarConcessies | Nog geen concessies. Schrijf je in op een lijn; dan maakt de app hier het rooster uit de dienstregeling van de kaart. / Naar concessies |
| bd.plan.kaartWeg | Kaart {kaart} staat niet in je OMSI-map. Deze concessie rekent vandaag zoals vroeger, zonder rooster. |
| bd.plan.rijdtNiet | Lijn {lijn} rijdt vandaag ({soort}) niet. |
| bd.plan.geenPersoneel | Nog niemand in dienst: elke dienst wordt uitbesteed. |
| bd.plan.geenBussen | Nog geen bussen: elke omloop rijdt met een bus van de onderaannemer. |
| bd.plan.nieuw | Nieuw: je rooster. Deel je bussen en chauffeurs in op de omlopen; wat leeg blijft, besteedt het bedrijf uit. |
| bd.plan.toursToday | {tours} omlopen · {hours} u vandaag |
| bd.plan.weekCijfers | {rituren} u per dag gemiddeld · {omlopen} omlopen op drukke dagen |
| bd.plan.concessieDag | ± {geld} per dag uitbesteed |
| bd.plan.inschrijfUitleg | Inschrijven kost {vast} plus {per} per omloop op de drukste dag. |
| bd.plan.sollicitantLoont | Op een gemiddelde dienst ({uren} u) bespaart {naam} {bespaart} per dag; loon {loon}. |
| bd.plan.busLoont | Op een gemiddelde omloop ({uren} u) bespaart deze bus {bespaart} per dag: terug in {dagen} dagen. |
| bd.plan.stilBus / .stilChauffeur | Bus {bus} staat vandaag niet in het rooster. / {naam} heeft vandaag geen dienst. |
| bd.plan.naarPlanning | Naar planning |
| bd.plan.personeelSamenvatting | Vandaag {eigen} diensten met eigen chauffeurs, {uitbesteed} uitbesteed. |
| bd.plan.c.bus-weg | Bus {bus} is niet meer van jou. |
| bd.plan.c.bus-werkplaats | Bus {bus} kan vandaag niet uitrijden (werkplaats, versleten of beschadigd). |
| bd.plan.c.bus-dubbel | Bus {bus} staat ook op omloop {andere}, en die overlappen. |
| bd.plan.c.bus-vorm | Deze omloop vraagt een {vorm}; bus {bus} is een {busvorm}. |
| bd.plan.c.chauffeur-weg | Deze chauffeur werkt hier niet meer. |
| bd.plan.c.chauffeur-afwezig | {naam} is er vandaag niet (ziek of op cursus); de dienst wordt uitbesteed. |
| bd.plan.c.chauffeur-dubbel | {naam} rijdt dan al dienst {andere}. |
| bd.plan.c.chauffeur-rust | {naam} heeft maar {min} minuten tussen twee diensten. |
| bd.plan.c.chauffeur-overstap | {naam} moet in {min} minuten van {van} naar {naar}. |
| bd.plan.c.chauffeur-nachtrust | {naam} heeft maar {uren} u rust tussen twee werkdagen. |
| bd.plan.c.overuren | {naam} maakt {uren} u overuren (anderhalf keer loon). |
| bd.plan.c.te-lang | {naam} zou {uren} u werken; meer dan 10 u mag niet. |
| bd.plan.c.bevoegd | {naam} heeft weinig ervaring voor een {vorm} (minder dan {n}); reken op meer vertraging. |
| bd.plan.c.monteur | {naam} is monteur en rijdt geen diensten. |

### 4.5 Randgevallen van deel A

- Geen concessie, geen bus of geen personeel: de lege staten.
- De kaart ontbreekt: een melding en terugval voor die concessie.
- De lijn rijdt vandaag niet: de concessie levert vandaag niets op.
- Een bus verkocht of een chauffeur vertrokken: dat wordt al in bedrijf.ts opgeruimd. Blijft er toch een sleutel over, dan geeft dat een conflict en wordt hij bij de volgende actie opgeruimd.
- Masker ma–do tegen vr (55122 en 55123): er is een aparte rij. De weekstrook laat "vr 0/1" zien.
- Kaarten met aparte maskers voor schooldagen en vakantie: [Rooster overnemen].
- Een vervallen concessie: haar omlopen verdwijnen, en de sleutels blijven onschadelijk staan.
- De dienst die de eigenaar nu rijdt: invullen geeft 'bezig'. Het rooster zelf kan nog wel aangepast worden.

### 4.6 Testplan deel A

`npx tsx scripts/probe-rooster.ts` gebruikt de planfixture en kan in de cloud draaien:

- Elke ConflictSoort ontstaat precies één keer, in een eigen situatie.
- Vrijdag 24:51 tegen zaterdag 00:14 geeft 'chauffeur-dubbel'.
- **`vulAan`:**
  - deterministisch, overschrijft niets;
  - geen overlap, rust ≥ 20, geen overuren, nachtrust ≥ 660, en niemand die ziek is of op cursus;
  - een bus gaat naar de omloop met de meeste rituren.
- **`afrekening`:**
  - alles `Number.isInteger`, met de tarieven uit §2.2;
  - overuren kloppen precies; legacyZelf is afgekapt;
  - wat jij rijdt, verlaagt de kosten naar rato;
  - een eigen chauffeur plus jij geeft geen besparing.
- Een oud bedrijf zonder rooster: alles uitbesteed, zonder fouten.
- **Prognose gelijk aan afsluiting:** de kas-delta van `sluitDagAf(b, afrekening(b, plan))` is gelijk aan `cijfers.vergoeding − cijfers.kosten + legacyZelf`.
- **Terugval:** één kaart op fout geeft alleen voor die concessie de oude rekensom.

`npx electron scripts/probe-planning.cjs` (lokaal, eigen userData, fixture via IPC zoals in §3.6):

- tab Planning: 22 rijen en 28 blokken;
- de migratie heeft gevuld, en [Vul aan] telt de chips;
- `bedrijfRooster({soort:'chauffeur'})` op een dienst die overlapt geeft de conflictchip;
- de geldregel is gelijk aan de `afrekening` in de renderer;
- tik-tik deelt iemand in;
- schermafdrukken licht en donker, en op 720×560 (lijstweergave).

---

## 5. DEEL B — Uitval, dag afsluiten en ochtendvenster

### 5.1 Rekenregels (`core/uitval.ts`)

```ts
export const UITVAL = { telaatKans: 0.03, telaatExtraOnder50: 0.02, telaatMinuten: [20, 60], pechBasis: 0.01, pechSlijtage: 0.06, pechOnder: 70, pechKosten: [200_00, 600_00] } as const
export function uitvalVoorDag(b: Bedrijf, dagen: Dagrooster[]): Bedrijf
export function meldUitval(b: Bedrijf, dagen: Dagrooster[]): Bedrijf
export function uitvalVan(b: Bedrijf): Uitval[]          // vandaag.uitval als vandaag.dag === dag, anders []
export function pechKans(bus: EigenBus, monteurs: number): number
```

- **Ziek:** iedereen met `ziekSinds === b.dag`. Dat wordt gezet in personeelNaDag (deel 0).
- **Te laat:**
  - voor elke chauffeur die er is (niet ziek, niet op cursus), los van de indeling;
  - `k = reeks(dag·7121 + id·97 + 3)`; raak als `k() < 0,03 + (tevredenheid < 50 ? 0,02 : 0)`;
  - `minuten = 20 + floor(k()·5)·10`;
  - `dagplan` legt het op zijn eerste dienst van de dag. Heeft hij die niet, dan gebeurt er niets.
- **Pech:**
  - voor elke inzetbare bus, los van de indeling;
  - `k = reeks(dag·3571 + nummer·131 + 11)`;
  - `p = (0,01 + max(0, 70 − staat)/70 × 0,06) × (1 − remming)`, met `remming = min(0,4; monteurs × 0,1)`;
  - gevolg: `werkplaatsTot = dag`, geen schade;
  - `kosten = round((200_00 + floor(k()·401)·100) × f.onderhoud)`;
  - `boekRegel('pech', −kosten, "{nummer} · start niet")`;
  - het bestaande bericht 'werkplaats' ("rijdt morgen weer", :1241) klopt daarmee.
- Er wordt geen `Math.random` gebruikt. Na een herstart is de uitkomst gelijk, want ze staat in `vandaag.uitval`.
- **`meldUitval`:**
  - 'telaat' { naam, minuten, dienst? };
  - 'pech' { nummer, kosten, omloop? };
  - als laatste 'ochtend' { dag, open, omlopen, stil, kosten }, met als kosten de schatting van de centrale uit `afrekening(dagplan(...))`;
  - het bestaande bericht 'ziek' (:1215) blijft.

### 5.2 Scherm

**`<UitvalMeldingen bedrijf plan naar>`** staat bovenaan het Dashboard en de Planning:
- "Vanochtend: Jan de Vries heeft zich ziek gemeld. Dienst 55103-1 (05:05–14:30) staat open. Doe je niets, dan regelt de centrale het: uitzendkracht (€ 534)." [Invullen]
- "Sanne Visser komt 40 minuten later. 05:54–06:34 van dienst 55104-1 staat open." [Invullen]
- "Bus 104 start niet. Omloop 55108 heeft geen bus." met "Geregeld: bus 107" als dat zo is.

**`aandachtUitval(b, plan)`** in `uitvalAandacht.ts` levert items voor de aandachtlijst van A, met focus op die dienst in de planning.

**`<DagAfsluitKnop bedrijf plan lopend handel onGesloten>`** in de zijbalk:
- Uitgeschakeld bij `lopend`, met `bd.fout.rit` zichtbaar eronder.
- Zijn er gaten die de centrale regelt, of diensten die uitvallen, dan komt er eerst een venster:
  - kop "Dag 12 afsluiten?";
  - "Nog open: 2 diensten en 1 omloop. De centrale regelt ze: uitzendkracht € 534, huurbus € 648.";
  - "Met spoedtoeslag (20 %); na de opleiding Planner vervalt die.";
  - eventueel "1 dienst valt uit: −€ 913, reputatie −1.";
  - [Eerst zelf invullen] [Zo afsluiten].
- Na de afsluiting komt `onGesloten`, en de schil opent het ochtendvenster.

**`<Ochtendvenster bedrijf plan handel naar onSluit>`:**
- "Dag 12 afgesloten · resultaat +€ 1.679 · 153 u gereden · 0 u uitgevallen", uit het nieuwste bericht 'dagrapport'.
- "Vandaag, dag 13 (woensdag 27 april 2016)":
  - de lijst met uitval en daarin `<OpenDiensten compact>` (C), met één klik per regel voor de goedkoopste redelijke optie;
  - [Alles met uitzendkrachten en huurbussen], wat een reeks `bedrijfInvullen`-aanroepen doet;
  - of "Iedereen is er en alle bussen rijden.";
  - [Naar de planning] [Sluiten].

### 5.3 Bestanden van deel B

B bezit:
- `core/uitval.ts`;
- `renderer/src/UitvalMeldingen.tsx`, `DagAfsluiten.tsx`, `Ochtendvenster.tsx`, `uitvalAandacht.ts` en `uitval.css`;
- `shared/tekst/uitval.ts`;
- `scripts/probe-uitval.ts` en `scripts/probe-ochtend.cjs`.

### 5.4 Tekst voor deel B

| Sleutel | Nederlandse tekst |
|---|---|
| bd.uitval.kop | Vanochtend |
| bd.uitval.ziek | {naam} heeft zich ziek gemeld. Dienst {dienst} ({van}–{tot}) staat open. |
| bd.uitval.telaat | {naam} komt {min} minuten later. {van}–{tot} van dienst {dienst} staat open. |
| bd.uitval.pech | Bus {bus} start niet. Omloop {omloop} heeft geen bus. |
| bd.uitval.pechVrij | Bus {bus} start niet; hij stond vandaag niet ingedeeld. |
| bd.uitval.geregeld | Geregeld: {wat} |
| bd.uitval.centrale | Doe je niets, dan regelt de centrale het: {wat} ({geld}). |
| bd.uitval.invullen | Invullen |
| bd.afsluiten.vraagKop | Dag {dag} afsluiten? |
| bd.afsluiten.vraag | Nog open: {diensten} diensten en {omlopen} omlopen. De centrale regelt ze: {wat}. |
| bd.afsluiten.toeslag | Met spoedtoeslag (20 %); na de opleiding Planner vervalt die. |
| bd.afsluiten.valtUit | {n} diensten vallen uit: −{geld}, reputatie −{rep}. |
| bd.afsluiten.eerst / .toch | Eerst zelf invullen / Zo afsluiten |
| bd.ochtend.kop | Dag {dag} afgesloten |
| bd.ochtend.rapport | Resultaat {resultaat} · {uren} u gereden · {uitgevallen} u uitgevallen |
| bd.ochtend.vandaag | Vandaag, dag {dag} ({datum}) |
| bd.ochtend.rustig | Iedereen is er en alle bussen rijden. |
| bd.ochtend.allesUitzend | Alles met uitzendkrachten en huurbussen |
| bd.ochtend.naarPlanning / .sluiten | Naar de planning / Sluiten |
| tb.msg.telaat.t / .b | {naam} komt later / {naam} belde: {minuten} minuten later. Het begin van dienst {dienst} staat open. |
| tb.msg.pech.t / .b | Bus {nummer} start niet / Sleepdienst en onderdelen kosten {kosten}. De bus blijft vandaag in de werkplaats en rijdt morgen weer. |
| tb.msg.ochtend.t / .b | Ochtendmelding dag {dag} / {open} diensten en {omlopen} omlopen staan open. Doe je niets, dan regelt de centrale het (± {kosten}). {stil} eigen bussen of chauffeurs hebben vandaag niets te doen. |

### 5.5 Testplan deel B

`npx tsx scripts/probe-uitval.ts` kan in de cloud draaien:

- dezelfde invoer geeft dezelfde uitval, ook na `JSON.parse(JSON.stringify(b))`;
- over 2000 dagen: te laat ongeveer 3 % per chauffeur-dag (5 % bij tevredenheid < 50); pech ongeveer 1 % bij staat ≥ 70 en ongeveer 5,5 % bij staat 25;
- uitval ontstaat ook voor wie niet ingedeeld is, en een rooster dat later gevuld wordt, verandert de trekking niet;
- na pech: `isInzetbaar` onwaar, geen schade, en een boeking 'pech' in hele centen;
- `rg -n "Math.random" src/core/uitval.ts` geeft niets;
- de berichten staan in de goede volgorde, met 'ochtend' bovenaan.

`npx electron scripts/probe-ochtend.cjs` (lokaal):

- de fixture komt via IPC;
- de app gaat dicht, `vandaag.uitval` wordt in het tijdelijke profiel gezet, en de app start opnieuw;
- het Dashboard toont de meldingen, de afsluitvraag verschijnt, en het ochtendvenster volgt na de afsluiting;
- schermafdrukken.

---

## 6. DEEL C — Open diensten vullen en de centrale

### 6.1 Rekenregels (`core/invulling.ts`)

```ts
export interface InvulOptie { keuze: InvulKeuze | BusKeuze; kosten: number; beschikbaar: boolean; reden?: InvulFout; reputatie?: number; standaard?: boolean; wie?: string }
export interface Gat { doel: InvulDoel; van: number; tot: number; minuten: number; rituren: number; plots: boolean; vorm?: Busvorm }
export interface CentraleContext { vrijeChauffeurs: number[]; vrijeBussen: number[]; werk: Record<number, Blok[]>; busBezet: Record<number, Blok[]>; uitzend: { gebruikt: number; max: number } }
export function invulOpties(b: Bedrijf, plan: DagPlan, doel: InvulDoel): InvulOptie[]
export function zetInvulling(b: Bedrijf, plan: DagPlan, doel: InvulDoel, keuze: InvulKeuze | BusKeuze | null, lopend?: LopendeRit): { bedrijf: Bedrijf } | { fout: InvulFout }
export function kiesAutomatisch(b: Bedrijf, ctx: CentraleContext, gat: Gat): { keuze: InvulKeuze | BusKeuze; toeslag: boolean }
```

**Opties voor een chauffeur.** Bij een te-laat-stuk gaat het alleen om dat stuk.
- **Collega:** een vrije eigen chauffeur voor wie `toets` geen dubbel of te-lang geeft; kost 0. Overuren komen in de afrekening.
- **Uitzendkracht:** `chauffeurKosten('uitzend', …)`, zolang `gebruikt < max` (anders 'vol').
- **Uitbesteden:** alleen als het gat niet plots is (anders 'kort').
- **Laten liggen:** gemiste vergoeding plus boete, en `reputatie` uit `reputatieVerlies`.

**Opties voor een bus.**
- **Andere eigen bus:** inzetbaar en zonder overlap.
- **Huurbus:** `busKosten('huur', …)`.
- **Omloop laten uitvallen:** alle diensten van die omloop vallen uit.

**`standaard`** is de goedkoopste beschikbare optie die geen liggen is.

**Zelf rijden** is geen InvulKeuze: `OpenDiensten` toont de knop van D.

**Validatie in `zetInvulling`:**

| Situatie | Fout |
|---|---|
| Dienst of omloop niet in het plan | 'weg' |
| Niet vandaag | 'dag' |
| `lopend.dienst === d` | 'bezig' |
| `gereden[d]` bestaat al | 'gereden' |
| Collega overlapt | 'bezet' |
| Uitzendbureau vol | 'vol' |
| Uitbesteden bij plotse uitval | 'kort' |

`null` wist de invulling, en dan neemt de centrale het weer over. De invulling komt in `vandaag` (die wordt aangemaakt als hij er nog niet is).

**`kiesAutomatisch`:**
- voor een chauffeur: een vrije collega (eerst bevoegd, dan de minste minuten), anders uitzend met `toeslag = toeslagGeldt(b)` zolang er plek is, anders liggen;
- voor een bus: een vrije eigen bus, anders een huurbus met toeslag.

**Kosten gelijk aan de afrekening:** de bedragen van de opties komen uit dezelfde plantarief-functies en dezelfde rest-regels als `dagplan` in §4.2.

### 6.2 Scherm

`<OpenDiensten bedrijf plan handel lopend compact?>` is het paneel "Open diensten ({n})". Plotse gevallen staan rood bovenaan.

- **Een rij:** "OPEN · ziek · Lijn 109 · omloop 55103 · 05:05–14:30 · werktijd 9,4 u · betaald 7,1 u". Ernaast in grijs: "centrale: uitzendkracht € 534 (+20 % spoed)".
- **Knoppen:**
  - [Zelf rijden · bespaart € 534] (D);
  - [Collega ▾], met als keuze bijvoorbeeld "Anna Becker · 4,3 u vrij";
  - [Uitzendkracht · € 445], met "nog 1 beschikbaar vandaag";
  - [Uitbesteden · € 357], uitgeschakeld bij plotse uitval met `bd.fout.kort` zichtbaar;
  - [Laten liggen · −€ 1.179, reputatie −1].
- **Een ingevulde rij** toont "Uitzendkracht · door jou" en [Ongedaan maken].
- **Een busrij:** "BUS START NIET · omloop 55108 · bus 104" met [Andere eigen bus ▾] [Vervangende bus huren · € 648] [Omloop laten uitvallen · −€ …].
- **Uitbesteed** staat ingeklapt: "27 diensten zijn uitbesteed (€ 9.640)" [Tonen].
- **`compact`** (voor het ochtendvenster): per rij alleen de hoofdknop (`standaard`) en [Meer…].

### 6.3 Bestanden van deel C

C bezit:
- `core/invulling.ts`;
- `renderer/src/OpenDiensten.tsx` (styling in `planning.css` hoort bij A, dus C krijgt eigen klassen in `opendiensten.css`);
- `shared/tekst/invullen.ts`;
- `scripts/probe-invullen.ts` en `scripts/probe-opendiensten.cjs`.

### 6.4 Tekst voor deel C

| Sleutel | Nederlandse tekst |
|---|---|
| bd.inv.kop | Open diensten ({n}) |
| bd.inv.reden.ziek / .telaat / .pech / .afwezig | ziek / te laat ({min} min) / bus start niet / afwezig |
| bd.inv.regel | Lijn {lijn} · omloop {omloop} · {van}–{tot} · werktijd {werk} u · betaald {betaald} u |
| bd.inv.centraleDoet | centrale: {wat} ({geld}) |
| bd.inv.collega / .collegaVrij / .collegaGeen | Collega / {naam} · {uren} u vrij / Niemand vrij die past |
| bd.inv.uitzend / .uitzendSub | Uitzendkracht · {geld} / nog {n} beschikbaar vandaag |
| bd.inv.onder | Uitbesteden · {geld} |
| bd.inv.liggen / .liggenSub | Laten liggen · −{geld}, reputatie −{n} / de ritten vallen uit: geen vergoeding en een boete |
| bd.inv.zelf / .zelfSub | Zelf rijden / bespaart {geld} |
| bd.inv.busAnder / .busHuur / .busLiggen | Andere eigen bus / Vervangende bus huren · {geld} / Omloop laten uitvallen · −{geld} |
| bd.inv.ongedaan | Ongedaan maken |
| bd.inv.structureel | {n} diensten zijn uitbesteed ({geld}) |
| bd.inv.tonen / .verbergen / .meer | Tonen / Verbergen / Meer… |
| bd.inv.gekozen.collega / .uitzend / .onder / .liggen / .huur / .eigenBus | {naam} valt in / Uitzendkracht / Uitbesteed / Laat je liggen / Huurbus / Bus {bus} |
| bd.inv.door.hand / .centrale | door jou / door de centrale |
| bd.inv.toeslag | +20 % spoed |
| bd.inv.geenOpen | Niets open vandaag. |

### 6.5 Testplan deel C

`npx tsx scripts/probe-invullen.ts` gebruikt de fixture en de echte `dagplan` en `afrekening` na het samenvoegen; tot dan een DagPlan uit de fixture:

- De kosten van elke optie zijn gelijk aan het verschil in de afrekening na `zetInvulling`.
- De rangorde voor een dienst van 7,1 u werk en 5,5 rituren: collega 0 < uitbesteden 269,80 < uitzend 444,70 < uitzend met toeslag 533,64 < liggen 913 (plus reputatie).
- Uitbesteden bij plotse uitval geeft 'kort'; een collega met overlap geeft 'bezet'.
- Het tweede uitzendverzoek bij max 1 geeft 'vol'; `lopend` geeft 'bezig'; `null` laat de centrale weer beslissen.
- De centrale is deterministisch, en gebruikt geen onderaannemer bij plotse uitval.
- Alles in hele centen.

Daarnaast een Electron-schermafdruk van de Planning met 2 plotse diensten en 1 kapotte bus.

---

## 7. DEEL D — Zelf rijden vanuit het bedrijf

### 7.1 De stroom

**1. Ingangen.**
- De knop "Zelf rijden" in de zijbalk, onder Dag afsluiten.
- De tegel op het Dashboard met twee à drie voorstellen.
- De popover van een dienst (A), Open diensten (C) en het kaartje op de kaart (E).
- Alle ingangen roepen `useZelfRijden().open(dienst?, { vanRit? })` aan.

**2. Keuzevenster `<ZelfRijdenKeuze>`:**
- Zonder dienst: de voorstellen uit `voorstellen(b, plan)`. Volgorde: plots open eerst, dan korte te-laat-stukken ("Kort klusje"), dan uitbestede diensten op besparing.
- Met dienst: [Eerste rit ▾] [Laatste rit ▾] met de ritten die tellen, en:
  - "Jij rijdt 05:05–09:12 (4,1 u, 3,2 dienstregelingsuren)."
  - "De rest (09:12–14:30) rijdt de uitzendkracht: € 342."
  - "Dat bespaart je bedrijf € 283 vandaag."
  - Bij een eigen roosterchauffeur: "Dit bespaart niets: Anna rijdt deze dienst al. Je krijgt wel ervaring en de tijdhaltebonus."
  - Staan er nog andere gaten open: "Er staan nog 2 diensten open; die regelt de centrale als je niets doet."
  - [Nu rijden] [Vastleggen, later rijden] [Annuleren].

**3. main `bedrijf:rit(dienst, opties)`**, in het slot:

```ts
if (!career?.bedrijf) → 'geen'; if (career.activeDuty) → 'ritBezig'
dagen = await dagroostersVoor(b, dag−1, dag+1); z = zoekDienst(dag) → 'dienst'; z.kaart.fout → 'kaart'
venster = rijvenster(z.dienst, opties.vanRit, opties.totRit) → 'venster'
duty = await werkerVraag({ soort:'dienstduty', folder, deel:{ lineFile, tourNumber, days, ritten: venster.telt } }) ?? laag().dienstDuty(...) → 'dienst'
// ---- geen await meer ----
opnieuw: career.activeDuty → 'ritBezig'; b = career.bedrijf; vandaag.gereden[dienst] → 'gereden'
plan = dagplan(b, dagen, b.dag); po = omloop; po.bus.wie.soort === 'liggen' → 'busLigt'
eigen bus: v = laag().voertuigen().find(pad hoofdletterongevoelig gelijk)
  !v && !opties.voorgesteldeBus → { fout:'bus', bus:{ nummer, naam } }
  busnummer = v ? nummer : undefined
geen v: choice = pickVehicleForDuty(fleet(), duty, era(folder).year, fleetOf(folder), undefined, depotOf(folder))   // zoals :4394-4413
datum = bedrijfsdatum(anker, b.dag) → DutyDate { year, dayOfYear, iso, kind: dayKind(kalender, datum) }
stopVrijeRit()   // :1169
persist({ ...career, activeDuty: { assignment:{ duty, date, vehicle, yard, fit, fromMapFleet, alternatives },
  vehicleOverride: vehicle?.relativePath ?? '', confirmedAt: nu, mode:'service',
  bedrijf: { dienst, dag:b.dag, van, tot, ritten, omloopNr, deel, delen, lijn, busnummer } } })
```

Er wordt niets in `invulling` geschreven.

**4. main `bedrijf:ritBus(pad)`:**
- alleen als `activeDuty.bedrijf`, niet gestart, en zonder `busnummer`;
- dan `vehicleOverride = pad`;
- anders 'eigen', 'gestart' of 'geen'.

**5. Renderer (App.tsx), `onRijden(payload, later)`:**
- `setCareer(payload)`; bij `later` blijf je in Mijn bedrijf (banner).
- Anders: `setMode('service')`, `setScreen('drive')`, `setStap('bus')`.
- Eigen bus:
  - `const lijst = await vraagKleurstellingen(pad)` (:417);
  - `if (lijst?.lijst.length) { setKleurBus(pad); setBusScherm('kleur') } else setBusScherm('hof')`.
- Bus van de onderaannemer: `setBusScherm('bus')`, zodat je vrij kunt kiezen. `onDoen` van een bus-tegel (:4176-4193) roept dan ook `bedrijfRitBus(pad)` aan.
- **Modewissel-effect** (:892-917): direct na `if (vorige === undefined || vorige === mode) return` komt `if (career?.state?.activeDuty?.bedrijf) return`, vóór `setStap('map')`.

**6. Balk en terug:**
- `STAPPEN_BEDRIJF = ['bus']` met `stapnamen = { bus: tr('bd.rit.stap') }`. Tijdens het rijden `['bus', 'rijden']`, in :3023-3030 en :4618-4624, gekozen als `active?.bedrijf`.
- `onTerug` (:4875-4916):
  - eigen bus: 'hof' → 'kleur' als je via de kleurstelling kwam, anders naar Mijn bedrijf. Het busniveau 'bus' en de merkkruimels zijn verborgen; staat `busScherm` toch op 'bus', dan gaat hij naar 'hof';
  - bus van de onderaannemer: van het bovenste niveau naar Mijn bedrijf;
  - naar Mijn bedrijf betekent `setScreen('bedrijf')` + `setBedrijfTab('planning')`.

**7. START:** ongewijzigd (drukOpStart → DraaitDialog → begin, :1410-1559, :1631). `duty:begin` en `captureBaseline` bewaren het veld `bedrijf` (:4590-4616, :1649-1662).

**8. Tijdens de rit:**
- `wisselbareDienst` (:1881) geeft `undefined` als `actief.bedrijf`. Anders raakt `wisselDienst` het veld kwijt (:2006-2016).
- In RunningDuty staat de chip "Bedrijfsrit · omloop 55103 (1/1)".
- `ritVoorBedrijf(b, duty, busPad, staat, rit?)` (:1353) krijgt `BedrijfRit.dienst = { omloop, deel, delen, tot }`. De bus is `rit.busnummer` als het pad klopt, anders `eigenBusMetPad`. telefoonBedrijf.tsx toont "Bedrijfsrit · omloop 55103 · tot 14:30".
- `bedrijfVoorTelefoon` (:2964) geeft `lopend.bedrijf` mee.

**9. Afronden:**
- `career:complete` (:4905-4927) en `sluitLopendeDienstAf` (:1279-1309) roepen `boekEigenDienst(b, duty, staat, busPad, stopsDone, lopend.bedrijf)` aan.
- `boekEigenDienst` (:1048):
  - als `rit && rit.dag === b.dag`:
    - `vandaag.gereden[rit.dienst] = geredenVan(duty, rit, stopsDone)`, met `deel = stopsDone/totalStops` (zonder telling 1), `rituren = deel × Σ leg.minutes/60` van de concessielegs en `werkMinuten = deel × (tot − van)`. Een bestaande waarde wordt alleen vervangen door een grotere;
    - `zelfUren` blijft onaangeroerd;
    - schade gaat naar `rit.busnummer` als `busPad` (hoofdletterongevoelig) gelijk is aan `EigenBus.relativePath`, anders naar niemand;
  - anders het oude pad;
  - tijdhaltes, reputatie en xp blijven zoals ze zijn.
- **Renderer:**
  - `finish`, `cancelDuty` en `verwijderOpenDienst` bepalen vóór de IPC `terug = active?.bedrijf ? 'bedrijf' : 'modes'`;
  - `naarBegin(melding, terug)` (:1364) krijgt die parameter erbij. Bij 'bedrijf': `setScreen('bedrijf')`, `setBedrijfTab('planning')`, `setBedrijfMelding(melding)`;
  - het automatisch afronden (:1838) gaat via dezelfde `finish`.

**10. Annuleren en teruggeven:** `cancelDuty` wist alleen `activeDuty` (:4576-4582). Omdat er niets geschreven was, is de stand van de dienst weer zoals vóór het aannemen.

**11. Dag afsluiten** is geblokkeerd zolang er een bedrijfsrit aangenomen is (deel 0 en B).

**12. Rijden via het hoofdmenu (modus Dienst):**
- Rijd je daar op een concessiekaart van je bedrijf, dan staat er bij de dienstenlijst: "Rijd je voor je eigen bedrijf? Kies je dienst in Mijn bedrijf → Planning; dan telt hij in je rooster." [Naar Mijn bedrijf].
- Zulke ritten tellen als invaluren (legacyZelf).

### 7.2 Banner en weigeringen

**`<BedrijfsritBanner>`** staat op alle tabs:
- Nog niet gestart: "Bedrijfsrit klaar: lijn 109, omloop 55103, 05:05–09:12 met bus 101 (MAN SG292)." [Verder naar de bus] [Teruggeven]
- Gestart: "Je rijdt nu omloop 55103 voor {bedrijf}." [Naar het rijscherm]

**Weigeringen:**
- 'ritBezig': "…" plus [Die dienst teruggeven en deze rijden], als de andere dienst niet gestart is. Anders [Naar je dienst].
- 'bus': "De bus van deze omloop (101, MAN SG292) is niet geïnstalleerd in OMSI." [Rijden met een voorgestelde bus]
- 'busLigt', 'dienst' en 'gereden': met de tekst uit fundament.

**Na afloop, in de Planning:** "Dienst 55103-1 gereden: 3,1 van 3,2 dienstregelingsuren telt voor je bedrijf." Daarnaast de uitkomst van finish.

### 7.3 Signaturen (`core/bedrijfsrit.ts`)

```ts
export interface RitVoorstel { dienst: DienstSleutel; reden: 'open' | 'stuk' | 'uitbesteed'; bespaart: number; van: number; tot: number; lijn: string; omloop: string }
export function voorstellen(b: Bedrijf, plan: DagPlan, max?: number): RitVoorstel[]
export function rijvenster(d: DienstVanDag, vanRit?: string, totRit?: string): { van: number; tot: number; ritten: PlanRit[]; telt: string[] } | undefined
export function besparingVanRit(b: Bedrijf, plan: DagPlan, dienst: DienstSleutel, venster: { van: number; tot: number; ritten: PlanRit[] }): { bespaart: number; rest?: Stand; restKosten: number }
export function geredenVan(duty: Duty, rit: LopendeRit, stopsDone: number | undefined, telt: (lineFile: string) => boolean): Gereden
```

Renderer (`ZelfRijden.tsx`):

```ts
export function ZelfRijdenProvider(props: { bedrijf; plan?; lopend?; handel; onRijden(p: CareerPayload, later?: boolean): void; children }): JSX.Element
export function useZelfRijden(): { open(dienst?: DienstSleutel, o?: { vanRit?: string }): void }
export function ZelfRijdenKnop(): JSX.Element
export function ZelfRijdenTegel(props: { plan?: DagPlan }): JSX.Element
export function BedrijfsritBanner(props: { bedrijf; lopend?; onNaarRit(): void }): JSX.Element | null
```

### 7.4 Bestanden van deel D

D bezit:
- `core/bedrijfsrit.ts`;
- in `core/bedrijf.ts` alleen de secties "eigen dienst" en "telefoon": `boekEigenDienst`, `eigenDienstTelling`, `eigenBusMetPad`, `schadeVanDienst`, `BedrijfRit` en `ritVoorBedrijf` (:1036-1160 en :1325-1373);
- `main/index.ts`, voor alles na deel 0;
- `renderer/src/App.tsx`, `RunningDuty.tsx`, `telefoonBedrijf.tsx`, `ZelfRijden.tsx` en `zelfrijden.css`;
- `shared/tekst/bedrijfsrit.ts`;
- `scripts/probe-bedrijfsrit.cjs` en een nieuwe sectie onderaan `probe-bedrijf.ts`.

### 7.5 Tekst voor deel D

| Sleutel | Nederlandse tekst |
|---|---|
| bd.rit.knop / .stap / .tegel | Zelf rijden / Bedrijfsrit / Zelf rijden |
| bd.rit.kies.kop | Zelf rijden · dienst {dienst} |
| bd.rit.kies.van / .tot | Eerste rit / Laatste rit |
| bd.rit.kies.jij | Jij rijdt {van}–{tot} ({werk} u, {betaald} dienstregelingsuren). |
| bd.rit.kies.rest / .restGeen | De rest ({van}–{tot}) rijdt {wie}: {geld}. / Er blijft niets over. |
| bd.rit.kies.bespaart / .bespaartNiets | Dat bespaart je bedrijf {geld} vandaag. / Dit bespaart niets: {naam} rijdt deze dienst al. Je krijgt wel ervaring en de tijdhaltebonus. |
| bd.rit.kies.nuRijden / .later | Nu rijden / Vastleggen, later rijden |
| bd.rit.kies.andereOpen | Er staan nog {n} diensten open; die regelt de centrale als je niets doet. |
| bd.rit.voorstellen | Voorstellen |
| bd.rit.voorstel.open / .stuk / .uitbesteed / .geen | Open ({reden}) · {lijn} · {van}–{tot} · bespaart {geld} / Kort klusje: {van}–{tot} · bespaart {geld} / {lijn} · {van}–{tot} · bespaart {geld} / Niets te rijden vandaag dat geld bespaart. |
| bd.rit.banner.klaar | Bedrijfsrit klaar: lijn {lijn}, omloop {omloop}, {van}–{tot} met {bus}. |
| bd.rit.banner.verder / .terug / .rijdt / .naarRijscherm | Verder naar de bus / Teruggeven / Je rijdt nu omloop {omloop} voor {bedrijf}. / Naar het rijscherm |
| bd.rit.busEigen / .busOnder | bus {nummer} ({naam}) / een bus van de onderaannemer |
| bd.rit.voorgesteld / .anderTeruggeven / .naarDienst | Rijden met een voorgestelde bus / Die dienst teruggeven en deze rijden / Naar je dienst |
| bd.rit.chip / .telefoon | Bedrijfsrit · omloop {omloop} ({deel}/{delen}) / Bedrijfsrit · omloop {omloop} · tot {tot} |
| bd.rit.geboekt | Dienst {dienst} gereden: {rituren} van {totaal} dienstregelingsuren telt voor je bedrijf. |
| bd.rit.hintDienst / .naarBedrijf | Rijd je voor je eigen bedrijf? Kies je dienst in Mijn bedrijf → Planning; dan telt hij in je rooster. / Naar Mijn bedrijf |

### 7.6 Randgevallen van deel D

- **OMSI draait al:** de bestaande DraaitDialog. Bij meerijden kan de datum afwijken; de overlay zegt welke omloop je kiest.
- **Een examen of een lopende dienst:** 'ritBezig'.
- **De eigen bus is niet geïnstalleerd:** 'bus', met een voorgestelde bus. Er gaat dan geen schade naar een busnummer.
- **Omloop zonder eigen bus:** een bus van de onderaannemer. Die heet overal zo, niet "gehuurd".
- **Tweede deel van een geknipte omloop:** de bus wordt neergezet bij `legs[0].stopIds[0]` (index.ts:3309-3361).
- **Herstart van de app:** HervatDialog, en `bedrijf` blijft in het profiel.
- **`rit.dag !== b.dag`:** het oude pad.
- **Een tweede rit op dezelfde dienst:** 'gereden'.
- **Een venster binnen het te-laat-stuk:** dat telt tegen het stuk.

### 7.7 Testplan deel D

`npx tsx scripts/probe-bedrijf.ts`, nieuwe sectie:

- `boekEigenDienst` met `rit` vult `gereden` en niet `zelfUren`;
- bij twee bussen van hetzelfde model gaat de schade naar het goede nummer;
- een ander pad geeft geen schade;
- `geredenVan` met de helft van de haltes geeft `deel` 0,5.

`npx electron scripts/probe-bedrijfsrit.cjs` (lokaal):

- tijdelijke userData, de fixture via IPC;
- `OMSI_ENHANCER_LIVEMAP` op een tijdelijke map met een nep-`live.json`, en `OMSI_ENHANCER_PROEFPROCES='GeenOmsiProef'` (index.ts:833, live.ts:331);
- `bedrijfRit(d)`: controleer `activeDuty.bedrijf`, `mode 'service'`, `vehicleOverride === bus.relativePath` (of fout 'bus'), dat alle legs hetzelfde tourNumber hebben en binnen het venster liggen, en dat `date.iso` gelijk is aan `bedrijfsdatum`;
- het venster (vanRit en totRit) geeft precies die legs;
- het scherm is 'drive', op de stap 'bus', de balk heeft één stap, en het niveau is 'kleur' of 'hof';
- "Terug" gaat naar Mijn bedrijf, tab Planning;
- `bedrijfDagAf` geeft 'rit';
- `cancelDuty` laat `vandaag` ongewijzigd;
- `completeDuty(duty, 'x', { stopsDone: totalStops/2 })` geeft `gereden.deel ≈ 0,5`, en het scherm staat op de Planning met de melding;
- **roep `beginDuty` nooit aan.** Dat schrijft in de echte OMSI-map;
- schermafdrukken van de keuze, de busstap, de banner en de Planning na afloop.

---

## 8. DEEL E — De vlootkaart, getekend uit de OMSI-kaart van de concessie

### 8.1 Gegevens

**`core/lijnplan.ts`:**

```ts
export function bouwLijnplan(map: OmsiMap, routes: (legs: Array<{ tripFile: string; stopIds: string[] }>) => TripRoute[],
  lineFiles: string[], kalender: Calendar, anker: string, dag: number): LijnPlan
```

- Het lijnplan komt uit `map.tours` met `runsOn`, dus met alle ritten, ook die met 2 haltes en de LEE-ritten (`leeg: haltes < 3`). Anders verdwijnen bussen midden in hun omloop, want network.ts:88-120 laat ze weg.
- `tijden = vertrek + stopOffsets(trip, profileIndex)` (timetable.ts:173).
- `route = ${tripFile}|${stopIds.join(',')}`.
- Sleutels komen uit dezelfde `omloopSleutel`, dus ze zijn gelijk aan die van `kaartDag`.
- `van` en `tot` zijn de vroegste en laatste tijd van het plan. Op zaterdag 109 begint het om 00:14; op zondag om −15.

**`shared/spoor.ts`:** trackAlong, pointAlong en nearestAlong verhuizen uit RouteMap.tsx (:1473-1576); RouteMap importeert ze voortaan.

**`shared/vloot.ts`:**

```ts
export function maakSporen(plan: LijnPlan, stops: Map<string, { x: number; y: number }>): Map<string, Track>
export interface VlootPlek { omloop: OmloopSleutel; staat: 'remise' | 'rit' | 'pauze' | 'leeg' | 'klaar' | 'wacht'; ritIndex: number; x: number; y: number; koers: number; volgendeHalte?: string; volgendeTijd?: number }
export function plekOpKlok(o: KaartOmloop, sporen: Map<string, Track>, stops: Map<string, { x: number; y: number }>, klok: number, vertraging?: number, wachtTot?: number): VlootPlek
export function vertragingVan(dag: number, omloop: OmloopSleutel, rit: number, ervaring?: number, staat?: number): number
//   −1..8 min, reeks-zaad; hoger bij ervaring < 50 en staat < 80; alleen weergave
export function klokUitOmsi(minuten: number, omsiDatum: string, bedrijfsdatum: string, plan: { van: number; tot: number }): number | undefined
//   zelfde datum → minuten; datum = bedrijfsdatum + 1 en minuten + 1440 ≤ plan.tot → minuten + 1440; anders undefined
```

- **Klok:** het bereik is `[plan.van, plan.tot]`. De regel 03:00–27:00 vervalt; `klokVoorDienst` (index.ts:1345-1347) is hier niet het goede voorbeeld.
- **Gebeurtenissen:**
  - te laat en niet ingevuld: de bus staat in de remise ('wacht') tot `van + minuten`;
  - pech: rood in de remise, of de huurbus rijdt met label "H";
  - liggen: een spookmarker (gestreept) op de geplande plek, in de lijst onder "Valt uit".

**`renderer/src/useBedrijfsklok.ts`:**

```ts
export interface Bedrijfsklok { minuten: number; bron: 'omsi' | 'eigen'; loopt: boolean; snelheid: 1 | 10 | 60; van: number; tot: number; kaartKlopt?: boolean; datumKlopt?: boolean; speel(): void; pauze(): void; snel(s: 1 | 10 | 60): void; zet(m: number): void; nu(): void }
export function useBedrijfsklok(mapFolder: string | undefined, plan: { van: number; tot: number; datum: string } | undefined): Bedrijfsklok
```

- Peilt `bedrijfKlok` elke 2 s zolang het venster zichtbaar is.
- Bij `omsi`, `kaartKlopt` en een `klokUitOmsi` die iets geeft: de OMSI-tijd, en daartussen ×1.
- Anders een eigen klok via rAF, die begint bij de tijd van de pc of bij de waarde in `localStorage['bd.klok.'+kaart]` (in try/catch).

### 8.2 Scherm (tab "Kaart")

**Bovenbalk:**
- kaartchips;
- de klok: "● OMSI 14:25" of "Bedrijfsklok 14:25", met [▶ Afspelen] [⏸ Pauze] [×1] [×10] [×60], een schuif over het bereik van het plan, en [Nu];
- de regel: "Plekken volgens de dienstregeling en de ervaring van de chauffeur; alleen jouw bus is gemeten.";
- bij een afwijkende datum of kaart de bijbehorende melding.

**Kaart:** RouteMap met het wegennet uit `window.career.geometry(folder)` (map:geometry, index.ts:3865). Daaroverheen de lijnen van de concessies (lijnLaag), en per omloop een pijl met wagennummer of omloopnummer. Kleur naar wie rijdt:
- accent: eigen bus en eigen chauffeur;
- geel "JIJ": jij;
- paars: uitzendkracht of huurbus;
- grijs: uitbesteed;
- rood: valt uit (spook).

**Rechterpaneel:** "Onderweg (13)", "In de remise (9)" en "Valt uit (1)". Een rij ziet er zo uit: `[101] Lijn 109 → Hauptbahnhof/ZOB · omloop 55103 · Anna B. · +2 min`.

**Klik op een bus (wens 4 van Luc):**
- Er verschijnt een zwevend kaartje boven de bus dat met de bus meebeweegt. De camera volgt, met noord boven.
- Slepen, zoomen of het wieltje geeft 6 s rust (MANUAL_MS); daarna volgt de camera weer.
- Inhoud van het kaartje:
  - "Bus 101 · MAN Standardbus SG292 ×"
  - "Lijn 109 → Hauptbahnhof/ZOB"
  - "Omloop 55103 · dienst 1 van 1 · 05:05–14:30"
  - "Chauffeur Anna Becker · ervaring 42"
  - "Volgende halte Überseequartier · 10:14 (+2 min)"
  - "Staat 82 · schade 0"
  - [Volgen] [In de planning] [Invullen] (alleen bij rood) [Zelf rijden]
- [Zelf rijden] opent D met `vanRit` = de eerste rit na de klok ("overnemen vanaf de volgende rit").
- Bij uitbesteed: "Uitbesteed · bus van de onderaannemer".
- Bij jij: "Jij · live uit OMSI · 43 km/h · +1 min". Dat komt uit `liveStatus()` (1×/s, alleen bij `kaartKlopt` en `activeDuty.bedrijf` op die omloop); de geplande pijl van die omloop gaat dan weg.

**Leeg en fout:**
- "Nog geen concessies: er rijdt nog niets."
- "Kaart wordt uit de OMSI-map gelezen…"
- "De kaart {kaart} staat niet in je OMSI-map."

**Op een smal scherm:** onder 900 px staat het paneel onder de kaart en is het kaartje compact. Knijpen werkt al (RouteMap:846-935). De kaart komt **niet** op de telefoon in het spel (bedrijf.ts:1331-1336).

### 8.3 RouteMap uitbreiden (additief)

```ts
vloot?: {
  bussen: Array<{ id: string; x: number; y: number; koers: number; toon: 'eigen' | 'jij' | 'uitzend' | 'onder' | 'uit'; label: string; spook?: boolean }>
  gekozen?: string; onKies?(id: string | undefined): void; volg?: boolean
  zweef?: ReactNode          // absoluut boven toScreen(gekozen); data-hit; pointerdown stopPropagation
  lijnen?: number[][]        // canvaslaag lijnLaag.ts (Path2D in wereldcoördinaten)
  haltes?: string[]
}
```

- Met `vloot` is de rotatie altijd 0, en de kaart past zich aan op de omvang van `lijnen`.
- `following` (:383) wordt `… || Boolean(vloot?.volg && vloot.gekozen)`.
- `markManual` (:502) en de wielhandler (:765) gelden ook bij `vloot?.volg`.
- Volgen gebruikt hetzelfde mechanisme als `centreOnBus` (:484-500).
- Klikken: pointerup met minder dan 5 px beweging op `[data-bus]` (een onzichtbare cirkel r=16). Klik op leeg deselecteert.

### 8.4 Bestanden van deel E

E bezit:
- `core/lijnplan.ts`;
- `shared/spoor.ts` en `shared/vloot.ts`;
- `renderer/src/RouteMap.tsx`, `lijnLaag.ts`, `useBedrijfsklok.ts`, `Vlootkaart.tsx` (met BusKaartje) en `vlootkaart.css`;
- `shared/tekst/vlootkaart.ts`;
- `scripts/probe-lijnplan.ts` en `scripts/screenshot-vlootkaart.cjs`.

### 8.5 Tekst voor deel E

| Sleutel | Nederlandse tekst |
|---|---|
| bd.kaart.omsi / .eigen | OMSI {tijd} / Bedrijfsklok {tijd} |
| bd.kaart.speel / .pauze / .nu / .snelheid | Afspelen / Pauze / Nu / ×{n} |
| bd.kaart.gepland | Plekken volgens de dienstregeling en de ervaring van de chauffeur; alleen jouw bus is gemeten. |
| bd.kaart.andereDatum | OMSI speelt {datum}; je bedrijf rijdt dag {dag} ({bdatum}). |
| bd.kaart.andereKaart | OMSI speelt een andere kaart; de bedrijfsklok loopt zelf. |
| bd.kaart.onderweg / .remise / .uit | Onderweg ({n}) / In de remise ({n}) / Valt uit ({n}) |
| bd.kaart.naar | Lijn {lijn} → {eind} |
| bd.kaart.omloopDienst | Omloop {omloop} · dienst {deel} van {delen} · {van}–{tot} |
| bd.kaart.chauffeur | Chauffeur {naam} · ervaring {n} |
| bd.kaart.volgende / .opTijd | Volgende halte {halte} · {tijd} ({vertraging}) / op tijd |
| bd.kaart.jij | Jij · live uit OMSI · {kmh} km/h · {vertraging} |
| bd.kaart.onder / .uitzend / .huur | Uitbesteed · bus van de onderaannemer / Uitzendkracht / Huurbus |
| bd.kaart.valtUit / .wachtLaat | Valt uit ({reden}) / Wacht op de chauffeur (+{min} min) |
| bd.kaart.busStaat | Staat {staat} · schade {schade} |
| bd.kaart.volgen / .inPlanning / .invullen | Volgen / In de planning / Invullen |
| bd.kaart.laden / .geen / .weg | Kaart wordt uit de OMSI-map gelezen… / Nog geen concessies: er rijdt nog niets. / De kaart {kaart} staat niet in je OMSI-map. |
| bd.kaart.legenda.eigen / .jij / .uitzend / .onder / .uit | eigen bus en chauffeur / jij / uitzendkracht of huurbus / uitbesteed / valt uit |

### 8.6 Prestatie

- De geometrie wordt één keer per kaart gelezen: 2,9 MB; koud 2,5 s, daarna 7–30 ms uit de schijfcache. Ze gaat nooit mee in de peiling.
- Het lijnplan is er één keer per kaart en per dag, en wordt gemaakt op de voorgrondwerker (met terugval op main).
- Posities per beeld kosten minder dan 0,05 ms. De markers worden per rAF opnieuw getekend tijdens afspelen, en 1×/s bij ×1.

### 8.7 Testplan deel E

`npx tsx scripts/probe-lijnplan.ts`:
- Op de fixture (cloud): omloop D staat erop bij klok −15 en 14; LEE-ritten staan op 'leeg'; de sleutels zijn gelijk aan `kaartDag`.
- Op HafenCity (lokaal):
  - een werkdag heeft 22 omlopen, met korte en lege ritten, en 0 routes zonder punten;
  - op zaterdag om klok 30 zijn 55201 en 55202 onderweg;
  - op een werkdag om klok 1470 zijn de late omlopen (tot 24:51) onderweg;
  - 8640 klokstanden kosten minder dan 0,5 s.

`npx electron scripts/screenshot-vlootkaart.cjs` (lokaal, tijdelijke userData, fixture via IPC, taal nl):
- tab Kaart; de klok via de schuif op 10:00, gepauzeerd; schermafdruk;
- klik op de eerste `[data-bus]` via `getBoundingClientRect` en een `PointerEvent`: het kaartje is zichtbaar;
- een paar seconden ×60: de afstand tussen kaartje en marker blijft gelijk en de weergave volgt; de gemeten beeldtijd is gemiddeld < 16 ms;
- een venster van 420×800: het paneel staat onder de kaart; licht en donker;
- met een nep-`live.json` zijn alleen `bron: 'omsi'` en de tijd na te kijken.

---

## 9. Bouwplan

### 9.1 Volgorde

- **Stap −1.**
  - Eerst wens 7 (vrij rijden en de Duitse fouten, luc-wensen.md punt 7): committen en de installer bouwen. Die raakt ook App.tsx.
  - Volgens het besluit in luc-wensen.md (:29-33) wordt dit gebouwd in de cloudsessie, op tak `claude/busbedrijf-planning` vanaf `origin/claude/busbedrijf-samen` (eb1c610).
- **Stap 0 — deel 0 (één bouwer).** Het is klaar als:
  - `tsc` en `electron-vite build` slagen;
  - `probe-bedrijf.ts` (92 ok plus de nieuwe gevallen), `probe-planfixture.ts` en `probe-teksten.ts` slagen;
  - lokaal later: `probe-bedrijfsplan.ts` en `probe-bedrijfdag.cjs`.
- **Stap 1 — A, B, C, D en E tegelijk.** Elke bouwer raakt alleen zijn eigen bestanden (§4.3, 5.3, 6.3, 7.4, 8.4).
  - Nooit aanraken: i18n.ts, api.ts, preload, planTypen.ts, bedrijfApi.ts, Bedrijf.tsx (de schil), BedrijfDelen.tsx, useDagplan.ts, kaartwerker.ts en kaartlaag.ts.
  - Is een contract onvoldoende, dan meldt de bouwer dat, en wordt het één keer centraal aangepast.
  - Als een deel op een ander wacht, test het met de fixture: B, C en D gebruiken de stub van `dagplan`, of een DagPlan uit de fixture.
- **Stap 2 — integratie (één bouwer).**
  - Samenvoegen; alle pure proeven.
  - Lokaal: alle OMSI- en Electron-proeven.
  - Een rondgang: migratie → Vul aan → dag afsluiten (vraag, ochtendvenster) → invullen → Zelf rijden aannemen, terug, opnieuw, afronden met `completeDuty` (zonder `beginDuty`) → Kaart. Met schermafdrukken.
- **Stap 3 — installer, lokaal, volgens CLAUDE.md.**
  - `npm ci` in de worktree, zonder junction.
  - `plugin\build.cmd`, of de DLL uit `plugin/out` van de hoofdmap.
  - `npx electron-vite build` en `npx electron-builder -c.directories.output=%TEMP%/omsi-release`.
  - `Setup.exe`, `Setup.exe.blockmap` en `draagbaar.exe` naar `C:\OMSI Career\release\` kopiëren en vergelijken.
  - iconv-lite en safer-buffer controleren in `win-unpacked/resources/app.asar`.

### 9.2 Wat in deel 0 vastligt voordat de rest begint

- `planTypen.ts` en `bedrijfApi.ts`, volledig.
- Signaturen van de stubs: `rooster.ts`, `uitval.ts`, `invulling.ts`, `bedrijfsrit.ts` en `lijnplan.ts`.
- Pure kern, volledig: `bedrijfsplan.ts`, `planregels.ts`, `plantarief.ts`, `busvorm.ts` en `bedrijfsdag.ts`.
- Props van de slots:
  - `<Planning bedrijf plan cijfers lopend handel naar focus onCareer>`
  - `<UitvalMeldingen bedrijf plan naar>`
  - `aandachtUitval(b, plan): Array<{ soort: 'laat' | 'let'; tekst: string; tab: Tab; focus?: Focus }>`
  - `<DagAfsluitKnop bedrijf plan lopend handel onGesloten>`
  - `<Ochtendvenster bedrijf plan handel naar onSluit>`
  - `<OpenDiensten bedrijf plan handel lopend compact?>`
  - `ZelfRijdenProvider`, `useZelfRijden`, `ZelfRijdenKnop`, `ZelfRijdenTegel` en `BedrijfsritBanner`
  - `<Vlootkaart bedrijf plan lopend naar>`
  - `<Dashboard bedrijf plan cijfers naar>`
- De typen `Tab`, `Focus` en `Handel`, en `naar(tab, focus?)` in BedrijfDelen.tsx.
- De zes tekstbestanden, en de regel dat `bd.fout.*` alleen in fundament.ts staat.
- De planfixture.

### 9.3 Cloud of lokaal (tech 20)

- **Cloud:** tsc, build, en alle pure proeven op de fixture.
- **Alleen lokaal:**
  - alles wat de OMSI-installatie nodig heeft (HafenCity);
  - de Electron-proeven met kaart;
  - de NSIS-installer.
- De HafenCity-gegevens (een add-on) worden niet gecommit.

---

## 10. Wat er met de punten van de tegenlezers gebeurt

**T** = technische tegenlezer, **S** = spel-tegenlezer.

| Punt | Wat ermee gebeurt |
|---|---|
| T1 invulling eigenaar blijft staan | Er wordt geen invulling meer geschreven; `lopend` gaat mee naar `dagplan`, `gereden` wordt pas bij het afronden geschreven, en de rest valt terug op de stand die de dienst al had (§1.8, §7.1) |
| T2 verouderde stand en async | Eerst ophalen, dan lezen-rekenen-schrijven zonder await; het slot; opnieuw controleren vóór `persist` (§3.2) |
| T3 hergebruikte nummers | Tellers plus opruimen in bedrijf.ts (deel 0) |
| T4 bus en chauffeur staan stil | Migratie met Vul aan voor de hele week (§3.3) |
| T5 uitval alleen voor wie ingedeeld is | Trekking per beschikbare chauffeur en bus (§5.1) |
| T6 bus te vervangen, kleurscherm | Eigen bus ligt vast, `bedrijfRitBus`, `vraagKleurstellingen` eerst, schade alleen als het pad klopt (§7.1) |
| T7 aantallen in de tests | Knipregel expliciet gemaakt; 28/23/18 (d1.ts) |
| T8 nachtritten | Klok over het bereik van het plan, `klokUitOmsi` (§8.1) |
| T9 te-laat-stuk tegen invulling | Aparte `stukInvulling`; `gereden` met werkMinuten en rituren (§3.1) |
| T10 zelf rijden zonder bus | 'busLigt'; de centrale geeft een bus bij pech |
| T11 één kaart weg | Terugval per concessie |
| T12 Concessies en Aanbestedingen | `c.week` en `bedrijfLijnWeek` (A) |
| T13 monteurs en onderbezet | `werkend` plus monteurs; −8 alleen voor wie overwerkt |
| T14 ziekSinds | `dag + 1`, en gewist samen met `ziekTot` |
| T15 BEDRAGEN | `boete` en `kosten` erbij |
| T16 foutsleutels en 'geen' | Alle `bd.fout.*` in fundament; stubs zonder fout |
| T17 dubbele sleutels | probe-teksten.ts |
| T18 Bedrijf.tsx door vier delen aangeraakt | Opgesplitst plus slots; LijnPlan in planTypen |
| T19 stubs en tsc | `_param`; scripts worden mee gecontroleerd |
| T20 cloud | Fixture-proeven; OMSI-proeven en installer lokaal |
| T21 arrival ≤ tot | Filteren op sleutel |
| T22 werker | `kaartDag` in main; `lijnplan` op de voorgrond met terugval (tech stelde de achtergrondwerker voor, zie §12); expliciete else-if |
| T23 geheugen | Sleutel op kaart, gesorteerde lijnen, anker en dag; 64 stuks; gewist in `vergeetKaarten` |
| T24 RouteMap | following, markManual en het wieltje nemen `vloot.volg` mee |
| T25 readLastMap | Niet gebruiken; activeDuty, vrijeRit of `mem.lineName`, anders `bron 'geen'` |
| T26 pc-jaar | Anker per kaart in het bedrijf |
| T27 tourNumber vrije tekst | Staat achteraan de sleutel; ontleden van links en rechts |
| T28 afronding | Per dienst en omloop afronden, daarna optellen |
| T29 pech | Geen schade; het bericht 'werkplaats' klopt dan |
| T30 xp en rekenfout | xp per rituur; 6,95 per werkdag en 6,79 per week |
| T31 overlap van eigen ritten | `rijvenster` en `toets` tegen `gereden`; één rit per dienst |
| T32 overlap over middernacht | Buurdagen in `dagplan` en `vulAan`; `nachtrust` |
| T33 maskers | Chip met het masker, weekstrook, `kopieer` |
| S1 eigen chauffeur verdient zich niet terug | Chauffeur van derden per werkuur; vergoeding 106 |
| S2 zelf rijden is een val | Venster kiezen, de rest valt terug op de stand die hij al had, vooraf met bedrag |
| S3 afsluiten zonder waarschuwing | Afsluitvraag; de centrale met toeslag |
| S4 de keuze ligt vast | Uitzendbureau met plafond; liggen goedkoper voor een kort stuk; vrije chauffeurs zijn reserve |
| S5 geen geld in de planning | Geldregel, besparing per omloop en chauffeur, terugverdientijd |
| S6 concessiemarkt | Weekgemiddelde; inschrijving op de piek; postbericht 'rooster' |
| S7 busvorm | `vormVanVoertuig` met aanhanger plus migratie; bevoegd alleen als waarschuwing; handmatig corrigeren later (F) |
| S8 maskers zie je niet | Chip, weekstrook, ochtendmelding (stil), aandacht op stilstand, kopiëren |
| S9 rust | Nachtrust 11 u als waarschuwing; rustdagen later (§11) |
| S10 vulAan hebzuchtig | Gewogen intervalplanning voor bussen, best-fit voor chauffeurs, geen overuren-optie |
| S11 betekenis van "open" | "Uitbesteed" tegenover "open" |
| S12 drie urenbegrippen | "werktijd · betaald · bedrag" |
| S13 scherm rond omlopen | Weergave "Mensen en bussen", gedempte blokken, bus op de lijnkop, verwijzingen naar markt en sollicitanten |
| S14 stroom van zelf rijden | Nu of later, banner, teruggeven laat niets achter, knop "teruggeven en deze rijden" |
| S15 beginpunt slecht te vinden | Knop in de zijbalk en tegel op het Dashboard |
| S16 kaart zonder spanning | Vertraging uit ervaring en staat (alleen weergave), gebeurtenissen op de kaart, [Invullen], overnemen vanaf de volgende rit |
| S17 vooruitblik | Vervangen door de weekstrook; werkplaats en bijscholing plannen later (§11) |
| S18 aanraking | Pointer-events, tik-tik, zoombare as, uitleg zichtbaar |
| S19 tien tabs | Compacte tabbalk onder 980 px |
| S20 apparaatserver alleen lezen | Later (§11) |
| S21 wissen en ongedaan maken | Bevestiging plus `herstel` |
| S22 naam BedrijfKaart | Vlootkaart |
| S23 ziekSinds | Zoals T14 |
| S24 reservebus | Schakelaar weg; elke vrije bus springt in |
| S25 reistijd | Waarschuwing 'chauffeur-overstap' (< 45 min, andere halte) |
| S26 twee manieren van rijden | Hint in de modus Dienst plus de regel "Buiten de planning" |
| S27 "gehuurde bus" | "Bus van de onderaannemer" |
| S28 te veel klikken | Ochtendvenster met één klik en "Alles met uitzend" |

---

## 11. Bewust niet in deze bouw

- **"7 dagen doorspoelen".** Vraagt een vaste regel voor uitval over meerdere dagen, en een UI om het resultaat te laten zien.
- **Rustdagen en verlof.** Het loon is een dagloon voor 7 dagen. Rustdagen maken een eigen chauffeur verlieslatend, zolang er geen weekloonmodel is.
- **Voorkeuren van chauffeurs** (vroeg of laat, een vaste bus).
- **Werkplaats en bijscholing op een gekozen dag.** Dat raakt `naarWerkplaats` en de bijscholing (bedrijf.ts:606, :851).
- **Een prijs die stijgt per extra uitzendkracht.** Het plafond volstaat voor nu.
- **Vertraging die meetelt voor de reputatie.** Dat zou dubbel tellen met de ervaringsstap in personeelNaDag (:926).
- **Mijn bedrijf op een telefoon of tablet.** De apparaatserver kan alleen lezen, en schrijven is een nieuwe beveiligingsgrens (HANDOVER.md:949-966).
- **De busvorm per bus corrigeren.** Dat hoort bij deel F (wagenpark), dat dan `busvorm.ts` hergebruikt.

---

## 12. Onzeker

- **Het tweede deel van een geknipte omloop.** Niet in OMSI nagekeken of dat netjes start, en wat de KI met dezelfde omloop doet.
- **Een dienst vlak na middernacht.** 55301 begint om −00:15 en 00:05, dus aanmelden valt op zaterdag 23:35 (situation.ts:210-211). Niet nagekeken of OMSI dan de zondagomloop in het menu toont.
- **`vormVanVoertuig`.** Fietsaanhangers (TH S315 UL) worden via de naam uitgesloten. De 69 verschillen tussen naam en aanhanger zijn niet allemaal met de hand nagekeken (Kajosoft 628g, O530 GU).
- **Tekenprestatie.** RouteMap met 22 bewegende markers en een zwevend kaartje bij ×60 is niet in de app gemeten.
- **`kaartKlopt`.** Dat `live.year/month/day` en `mem.lineName` altijd gevuld zijn, is niet nagelopen in een echte live.json.
- **`lijnplan` op de voorgrondwerker.** Kan achter een trage `hofaanbod` wachten; één speler mat 27,7 s (kaartwerker.ts:77-82). De technische tegenlezer stelde de achtergrondwerker voor. Die sluit zich na het opwarmen en wacht tijdens het opwarmen achter het inlezen van de tegels (index.ts:451-540). Ik koos de voorgrond, met een terugval op main.
- **Lucs eigen profiel** is niet gelezen: zijn dag, kas, het loon en de ervaring van zijn chauffeur. Of zijn chauffeur boven de 25 ervaring zit, maakt alleen uit voor de waarschuwing.
- **Het vlootkaart-getal "33 routes, piek ongeveer 15 bussen om 14:25"** komt van de kaartlezer (probe-livekaart.ts) en is niet opnieuw gemeten.
- **tripMinutes tegen stopOffsets.** d1.ts rekende met de laatste waarde van `stopOffsets`, het ontwerp met `tripMinutes`. Ik verwacht dat die gelijk zijn; de marge in de proef is ±0,5 u.
- **Of Electron-proeven in de cloud kunnen draaien** (zonder scherm en zonder OMSI).

---

## 13. Keuzes die Luc misschien anders wil

1. **Balans.**
   - Gekozen: 106 € per gereden dienstregelingsuur; een uitbestede chauffeur 38 € per werkuur; xp 1 per rituur.
   - Alles uitbesteed levert op lijn 109 dan ongeveer € 1.080 per dag op (werkdag € 1.300), tegen ongeveer € 3.111 nu. Dat hoge getal kwam van de fout "alle dagsoorten bij elkaar".
   - Een eigen chauffeur of bus bespaart evenveel als nu (± € 265 en ± € 258 per dag).
   - Wil Luc zijn oude inkomen terug: zet de vergoeding op ongeveer 120.
2. **De centrale.**
   - Gekozen: plotse uitval die je niet invult, regelt de app zelf met 20 % spoedtoeslag (collega → uitzendkracht → pas als niets kan: laten liggen). De toeslag vervalt na de opleiding Planner.
   - Het alternatief is "niets doen = laten liggen": strenger, maar dan kost elke doorgeklikte dag geld en reputatie.
3. **Concessies.**
   - Gekozen: de inschrijving rekent op het aantal omlopen op de drukste dag (lijn 109: € 13.000 in plaats van € 29.000).
   - De markt toont het weekgemiddelde. Lopende concessies behouden hun looptijd.
4. **Werktijdregels.**
   - Gekozen: een dienst hoogstens 9,5 u, een werkdag hoogstens 10 u (harde grens), overuren boven 8 u tegen 1,5× loon.
   - Nachtrust van 11 u, weinig ervaring op een gelede bus en een te krappe overstap zijn **waarschuwingen, geen verbod**.
   - Er zijn geen rustdagen.
5. **De bedrijfsrit.**
   - Gekozen: de eigen bus van de omloop ligt vast; alleen kleurstelling en remise zijn vrij.
   - De rit telt voor je bedrijf én levert, zoals nu, persoonlijk loon en logboek op in je loopbaan.

---

## 14. Bestanden en bewijs

**Kladproeven** in `C:/Users/lucru/AppData/Local/Temp/claude/C--OMSI-Career--claude-worktrees-ecstatic-noether-296800/69453af6-61d8-4662-b5b4-760aa670cb78/scratchpad/planning/`:
- nieuw: `definitief/d1.ts`;
- opnieuw gedraaid: `tegenlezer/t1.ts`, `tegenlezer/t2.ts` en `tegenlezer/t3.ts`;
- gelezen: `luc-wensen.md`, `splits109.ts`, `rituren-per-dienst.ts` en `vorm-trailer.ts`.

**Bronnen in de worktree:**

- **core/bedrijf.ts:**
  - typen en regels 36-205, 341-432; `meld` 435; `boek` 454; `vormVanNaam` 463; `isInzetbaar` 479; `reeks` 498; `volgendNummer` 531
  - `verkoop` 584; `naarWerkplaats` 595-610; `dagprognose` 657-707; `neemAan` 749; `ontsla` 770
  - `personeelNaDag` 890-930 (werkend 892-897, onderbezet 898, ziekte 909-911); `urenVanLijn` 956
  - `schrijfIn` 995; `boekEigenDienst` 1048-1097; `eigenBusMetPad` 1131; `sluitDagAf` 1166-1323 (werkplaats-bericht 1241, xp 1293); `ritVoorBedrijf` 1353
- **Overige core:**
  - core/career.ts 96-151
  - core/duty.ts: `toDuty` 158-214; `dutyFromTour` 363-409; `listLines` 431-464
  - core/network.ts 5, 20, 28, 31-47, 88-120
  - core/calendar.ts 64-122
  - core/timetable.ts 173, 217
  - core/kaartlaag.ts 60-128, 296-327, 414-417
  - core/vehicles.ts 78-115
  - core/trailer.ts 45-60
  - core/live.ts 99-101, 331
  - core/startup.ts 95-105
  - core/profiles.ts 437-442
  - core/types.ts 58-72
- **main:**
  - main/kaartwerker.ts 27-42, 66-128
  - main/index.ts: `laag` 250; `vergeetKaarten` 262; helpers 291-301; werkers 344-445; opwarmen 451-540; `stopVrijeRit` 1169; `sluitLopendeDienstAf` 1279-1309; `klokVoorDienst` 1345-1347; `freshLive` 1604; `captureBaseline` 1645
  - main/index.ts: `wisselbareDienst` 1881-1888; `wisselDienst` 1986-2016; `bedrijfVoorTelefoon` 2964-2984; `persist` 3232; `handle` 3525; `map:lines` en `duty:exam` 4386-4413; `duty:confirm` en `duty:cancel` 4551-4582; `duty:begin` 4590; `career:complete` 4905-4927; bedrijf-handlers 4934-5050; minimale venstergrootte 5226
- **Renderer:**
  - App.tsx: stappen 182-191; `busScherm` 300; `vraagKleurstellingen` 417; `active`, `confirmed`, `activeKey` 795-798; activeKey-effect 815-869; modewissel 892-917; `naarBegin`, `cancelDuty`, `verwijderOpenDienst` 1364-1400; `begin` 1410-1440; BedrijfApp en AddonsApp 2359-2375; balk 3023-3030; busvraag 3259-3269; kleurniveau 3801; `onDoen` 4176-4193; balk 4618-4624; `onTerug` 4875-4916
  - Bedrijf.tsx: 52-61, 85-96, 127-135, 154-161, 189-260, 467-600, 846-899
  - BedrijfPost.tsx 20-38, 51-92
  - telefoonBedrijf.tsx 24; telefoon.tsx 30, 752
  - RouteMap.tsx 32-127, 383-406, 484-517, 765, 1473-1576
  - language.tsx 11
  - bedrijf.css 1092-1120
- **Gedeeld en instellingen:**
  - shared/i18n.ts 22, 28, 3285-3297, 4612-4655
  - shared/api.ts 197-205, 514, 786-820
  - preload/index.ts 141-155
  - tsconfig.json 10, 21
  - HANDOVER.md 949-966