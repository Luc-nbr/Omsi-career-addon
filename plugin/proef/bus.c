/*
 * Een nagebootste OMSI met een bus in zijn geheugen.
 *
 * WAAROM
 * De plugin leest de variabelen van de bus rechtstreeks uit het geheugen van
 * OMSI: de namen staan bij het bustype, de waarden bij het exemplaar dat rijdt
 * (zie `lees_busvars` en `lees_busgetallen` in omsicareer.c), en per mesh staat
 * er een byte die zegt of OMSI hem toont (`lees_zichtbaarheid`). Dat is niet na
 * te rekenen door de app te starten -- daarvoor moet het spel draaien, met de
 * juiste bus, en dan nog zie je alleen het eindresultaat. Dit programma zet
 * dezelfde bouwsels op dezelfde plekken neer als OMSI, laadt de plugin en laat
 * hem ernaar kijken.
 *
 *   set LOCALAPPDATA=%TEMP%\omsi-busproef\gewoon
 *   bus.exe pad\naar\OMSICareerPlugin.dll [gewoon|aanhanger|zonderstrings|exceptie|getalfout]
 *
 * Nooit met de echte LOCALAPPDATA: dan schrijft de plugin over de live.json van
 * het spel heen. bus.exe weigert dat. proef.cmd draait alle vijf de scenario's,
 * elk in een eigen map.
 *
 * Daarna staan in `%LOCALAPPDATA%\OMSI Career` een live.json met wat de app
 * vroeg, een schermen.json met alle tekst van de bus, een getallen.json met al
 * zijn getallen en een meshes.json met zijn meshes. Aan het eind kijkt bus.exe
 * zelf na wat erin staat: GOED of FOUT per punt, en exitcode 0 als alles
 * klopt, 4 als er iets niet klopt.
 *
 * DE SCENARIO'S
 *   gewoon         de bus zoals OMSI hem neerzet, met getallen, zes meshes, en
 *                  tekst met ", \ en stuurtekens, een emoji, een euroteken en
 *                  teksten van 300 en 600 tekens. De eerste tien beelden houdt
 *                  bus.exe een meshes.json van een vorige bus op slot, zoals
 *                  een app die hem net leest: zolang de plugin hem niet kan
 *                  vervangen, mag live.json geen vlaggen hebben (de app zou ze
 *                  naast de lijst van die vorige bus leggen), en daarna moet
 *                  de goede lijst alsnog komen.
 *   aanhanger      de speler zit in een voertuig dat het script deelt met het
 *                  voertuig ervoor (ScriptShareParent op +0x240), zoals de
 *                  achterste bak van een gelede bus. Dat heeft eigen getallen
 *                  (allemaal 111) en eigen vlaggen (alles uit), en die mogen
 *                  NIET in live.json komen.
 *   zonderstrings  de bus heeft geen [stringvarnamelist], zoals 63 van de 601
 *                  .bus-bestanden in Vehicles. Toch moeten naam en model van
 *                  de bus er staan, en de getallen en wat OMSI toont.
 *   exceptie       de lijst met mesh-exemplaren staat op een adres dat niet
 *                  gelezen mag worden. De plugin mag daar niet over vallen:
 *                  "zichtbaar" blijft leeg, en de rest -- positie (mem.ok),
 *                  getallen, tekst -- blijft gewoon staan.
 *   getalfout      net zo, maar dan wijst een gevraagd getal (almex_vis_hst1)
 *                  naar zo'n adres. Dan vallen de getallen weg ("getallen":{}),
 *                  en blijven positie, tekst en wat OMSI toont staan.
 *
 * HOE OMSI HET NEERZET
 * De adressen in de plugin gelden vanaf 0x400000, het beginadres van omsi.exe;
 * `mem_addr` rekent ze om naar waar het programma werkelijk geladen is. Hier
 * wordt daarom een blok geheugen gevraagd op precies die plek in ons eigen
 * programma. De bouwsels erin zijn Delphi: een array is een wijzer naar het
 * eerste element met de lengte vier bytes ervoor, een string is een wijzer
 * naar de tekens, met de lengte er vier bytes voor en de tekenbreedte tien
 * bytes ervoor, en een TList heeft zijn elementen op +4 en het aantal op +8.
 */
#include <windows.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

typedef void(__stdcall *Start)(void *);
typedef void(__stdcall *Einde)(void);
typedef void(__stdcall *Waarde)(unsigned short, float *, BOOL *);

/*
 * Hieraan herkent de plugin OMSI 2.3.004: hij telt hoe vaak deze tekst in het
 * programma staat (zie `detect_version`). Zonder dit leest hij geen geheugen,
 * en dan valt er niets na te rekenen.
 */
static const wchar_t g_versie[] = L"OMSI 2.3.004 -- nagebootst, alleen voor deze proef";

/* Waar in ons eigen geheugen de bouwsels van OMSI komen te staan. */
#define BLOK_OFFSET 0x460000u
#define BLOK_GROOTTE 0x40000u
/* De adressen uit de plugin, min 0x400000 en min BLOK_OFFSET. */
#define OFF_ROAD_VEHICLES 0x1508u
#define OFF_PLAYER_INDEX 0x1740u
#define OFF_TIMETABLE 0x14e8u
#define OFF_HUMANS 0x172cu

static unsigned char *g_blok;
static unsigned char *g_vrij; /* bumpt door het blok heen */

static unsigned char *neem(size_t bytes) {
  unsigned char *p = g_vrij;
  g_vrij += (bytes + 15) & ~(size_t)15;
  memset(p, 0, bytes);
  return p;
}

/* Een string zoals Delphi hem neerzet; geeft de wijzer naar de tekens terug. */
static void *delphi_tekst(const char *tekst, int breedte) {
  const int aantal = (int)strlen(tekst);
  unsigned char *kop = neem((size_t)(12 + (aantal + 2) * breedte));
  *(unsigned short *)(kop + 0) = breedte == 2 ? 1200 : 1252; /* codepagina */
  *(unsigned short *)(kop + 2) = (unsigned short)breedte;    /* bytes per teken */
  *(int *)(kop + 4) = -1;                                    /* eeuwig, zoals Delphi's constanten */
  *(int *)(kop + 8) = aantal;
  unsigned char *tekens = kop + 12;
  if (breedte == 2) {
    wchar_t *w = (wchar_t *)tekens;
    for (int i = 0; i < aantal; i++) w[i] = (wchar_t)(unsigned char)tekst[i];
    w[aantal] = 0;
  } else {
    memcpy(tekens, tekst, (size_t)aantal);
    tekens[aantal] = 0;
  }
  return tekens;
}

/* Idem, voor tekst die niet in een byte past: een emoji is twee halve UTF-16-tekens. */
static void *delphi_breed(const wchar_t *tekst) {
  const int aantal = (int)wcslen(tekst);
  unsigned char *kop = neem((size_t)(12 + (aantal + 1) * 2));
  *(unsigned short *)(kop + 0) = 1200;
  *(unsigned short *)(kop + 2) = 2;
  *(int *)(kop + 4) = -1;
  *(int *)(kop + 8) = aantal;
  memcpy(kop + 12, tekst, (size_t)(aantal + 1) * sizeof(wchar_t));
  return kop + 12;
}

/* Een array van wijzers zoals Delphi hem neerzet; de lengte staat ervoor. */
static void *delphi_array(void **items, int aantal) {
  unsigned char *kop = neem((size_t)(4 + aantal * 4));
  *(int *)kop = aantal;
  memcpy(kop + 4, items, (size_t)aantal * sizeof(void *));
  return kop + 4;
}

/* Een TList zoals Delphi hem neerzet: de elementen op +4, het aantal op +8. */
static void *delphi_tlist(void **items, int aantal) {
  unsigned char *lijst = neem(0x10);
  void **elementen = (void **)neem((size_t)aantal * sizeof(void *));
  memcpy(elementen, items, (size_t)aantal * sizeof(void *));
  *(void **)(lijst + 0x4) = elementen;
  *(int *)(lijst + 0x8) = aantal;
  *(int *)(lijst + 0xc) = aantal; /* FCapacity */
  return lijst;
}

/*
 * De stringvariabelen, zoals de Setra van Thueringenwald ze heeft. Een paar
 * waarden worden in main gezet: te lang voor een regel hier, of niet in bytes
 * te zeggen. De laatste naam heeft een " en een \ -- die kan nooit gevraagd
 * worden, maar schermen.json moet er geldige JSON van maken.
 */
static const char *NAMEN[] = {
    "afr_display_1",      "afr_display_2",      "afr_kundendisplay", "afr_zifferneingabe",
    "afr_ticketname_0",   "afr_ticketname_1",   "afr_ticketname_2",  "afr_ticketname_3",
    "LAWO_display_line1", "LAWO_display_line2", "IBIS_busstop_name", "cockpit_temperatur",
    "Matrix_Nr",          "ident",              "naam\"met\\tekens"};
enum { S_KUNDENDISPLAY = 2, S_TICKET0 = 4, S_TEMPERATUUR = 11, S_IDENT = 13, S_AANTAL = 15 };
static const char *WAARDEN[] = {
    "Linie 320    Kurs 1",
    /* Een ", een \, een tab en een teken 1: moet ge-escaped aankomen, niet vervangen. */
    "13:45 \"EUR\" 2\\40\t\x01",
    "(300 tekens, zie main)", "12",
    "(ANSI met euroteken, zie main)", "Kind", "Tageskarte", "Gruppenkarte",
    "320 Oberhof", "ueber Zella-Mehlis", "Markt", "(600 tekens, zie main)",
    "320", "(met emoji, zie main)", "x"};

/*
 * De getalvariabelen, zoals OMSI 2.3.004 ze neerzet (gemeten 26-09-2026 in de
 * Hamburgse elektrobus): de namen bij het bustype op +0x1ec, bij het voertuig
 * op +0x238 een array van WIJZERS naar floats, en op exemplaar+0x28 en
 * voertuig+0x23c een wijzer naar dat veld. Eerst de namen die OMSI zelf
 * bijhoudt, dan de varlists van de bus; een lege regel in een varlist is een
 * lege naam (NULL). Getoetst wordt: hoofdletters maken niet uit, de eerste van
 * twee gelijke namen telt, NaN en een lege wijzer worden null, een naam die de
 * bus niet kent komt in getallenOnbekend, een waarde die verandert komt door,
 * en een vraag van meer dan 63 bytes wordt overgeslagen en niet afgekapt (dan
 * zou hij precies "lang_xxx..." van 63 bytes vinden).
 */
static const char *GETAL_NAMEN[] = {"Refresh_Strings", "Velocity",    NULL,
                                    "almex_ein",       "almex_menu",  "almex_vis_hst1",
                                    "kapot_getal",     "leeg_getal",  "almex_menu",
                                    "rare\"naam\\met\x01tekens", NULL /* lang, zie main */};
enum {
  G_REFRESH, G_VELOCITY, G_LEEG, G_EIN, G_MENU, G_HST1, G_KAPOT, G_NILWIJZER, G_MENU_DUBBEL,
  G_RAAR, G_LANG, G_AANTAL
};

/*
 * De meshes van het model, zoals de ALMEX in de Hamburgse bus: per mesh het
 * o3d-bestand (met map ervoor, zoals OMSI het bewaart), de plek van de
 * variabele uit [visible] (-1 = geen, of een die de bus niet kent, zoals
 * `pvs`) en het doel. Bij menu 6 horen de vlaggen 1,1,0,1,1,0: het scherm
 * zonder voorwaarde, menu 6 wel en menu 5 niet, pvs altijd, hst1 bij 0,5
 * (Round naar even: 0), en de laatste niet (0 is geen 1).
 */
typedef struct {
  const char *o3d;
  int var;
  int doel;
} Meshdef;
static const Meshdef MESHES[] = {
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\17_almex_screen_-1.o3d", -1, 0},
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\17_almex_screen_6.o3d", G_MENU, 6},
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\17_almex_screen_5.o3d", G_MENU, 5},
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\19_pvs_1.o3d", -1, 1},
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\17_almex_hst1.o3d", G_HST1, 0},
    {"C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\Model\\17_almex_raar.o3d", G_RAAR, 1}};
#define M_AANTAL 6

/* Een pagina die niet gelezen mag worden: wie hem aanraakt, krijgt een exceptie. */
static void *g_verboden;

static void *verboden_pagina(void) {
  if (!g_verboden) g_verboden = VirtualAlloc(NULL, 4096, MEM_RESERVE | MEM_COMMIT, PAGE_NOACCESS);
  return g_verboden;
}

/*
 * Wat OMSI bij elk beeld doet (omsi.exe VA 0x5fcf01): zichtbaar zonder
 * variabele, of als Round(waarde) -- naar even bij .5 -- het doel is. Zo
 * staan de vlaggen er als de plugin komt kijken, net als in het spel. Een
 * getal op de verboden pagina (`getalfout`) raakt deze proef zelf niet aan;
 * die mesh staat dan uit.
 */
static void zet_vlaggen(unsigned char **exemplaren, void **wijzers) {
  for (int j = 0; j < M_AANTAL; j++) {
    const int var = MESHES[j].var;
    int zichtbaar = 1;
    if (var >= 0 && var < G_AANTAL) {
      const float *plek = (const float *)wijzers[var];
      zichtbaar = plek && plek != g_verboden && isfinite(*plek) &&
                  (long long)nearbyintf(*plek) == MESHES[j].doel;
    }
    exemplaren[j][0xd0] = (unsigned char)zichtbaar;
  }
}

/* Lange teksten: tot plugin 12 kapte hij af op 127 tekens. */
static char g_lang300[301];
static char g_lang600[601];

static int g_fouten;

/* Een controle die geen tekst zoekt: `goed` is de uitkomst. */
static void klopt(const char *wat, int goed) {
  printf("%s: %s\n", goed ? "GOED" : "FOUT", wat);
  if (!goed) g_fouten++;
}

/* Staat `stuk` in `inhoud` (moet = 1), of juist niet (moet = 0)? */
static void verwacht(const char *wat, const char *inhoud, const char *stuk, int moet) {
  const int staat = strstr(inhoud, stuk) != NULL;
  const int goed = staat == moet;
  printf("%s: %s\n", goed ? "GOED" : "FOUT", wat);
  if (!goed) {
    g_fouten++;
    printf("  %s: %.300s\n", moet ? "ontbreekt" : "hoort er niet in", stuk);
  }
}

/* Leest een bestand uit de map van de plugin; leeg als het er niet is. Geeft 1 als het er was. */
static int lees_uit(const wchar_t *map, const wchar_t *naam, char *inhoud, DWORD ruimte) {
  wchar_t pad[MAX_PATH];
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\%s", map, naam);
  DWORD gelezen = 0;
  inhoud[0] = 0;
  HANDLE bestand = CreateFileW(pad, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING,
                               FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return 0;
  ReadFile(bestand, inhoud, ruimte - 1, &gelezen, NULL);
  CloseHandle(bestand);
  inhoud[gelezen] = 0;
  return 1;
}

static void schrijf_in(const wchar_t *map, const wchar_t *naam, const char *inhoud) {
  wchar_t pad[MAX_PATH];
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\%s", map, naam);
  HANDLE bestand = CreateFileW(pad, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return;
  DWORD geschreven = 0;
  WriteFile(bestand, inhoud, (DWORD)strlen(inhoud), &geschreven, NULL);
  CloseHandle(bestand);
}

static void weg(const wchar_t *map, const wchar_t *naam) {
  wchar_t pad[MAX_PATH];
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\%s", map, naam);
  DeleteFileW(pad);
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "gebruik: bus.exe pad\\naar\\OMSICareerPlugin.dll "
                    "[gewoon|aanhanger|zonderstrings|exceptie|getalfout]\n");
    return 2;
  }
  const char *scenario = argc >= 3 ? argv[2] : "gewoon";
  const int aanhanger = strcmp(scenario, "aanhanger") == 0;
  const int zonderStrings = strcmp(scenario, "zonderstrings") == 0;
  const int exceptie = strcmp(scenario, "exceptie") == 0;
  const int getalFout = strcmp(scenario, "getalfout") == 0;
  const int gewoon = strcmp(scenario, "gewoon") == 0;
  if (!aanhanger && !zonderStrings && !exceptie && !getalFout && !gewoon) {
    fprintf(stderr, "onbekend scenario: %s\n", scenario);
    return 2;
  }
  /* Zonder deze aanraking gooit de compiler de versietekst weg. */
  if (g_versie[0] == 0) return 3;

  /*
   * Eerst de map. Nooit de echte: de plugin schrijft er live.json in, en draait
   * OMSI, dan zou de app midden in een dienst een nagebootste bus zien.
   */
  wchar_t map[MAX_PATH];
  const DWORD mapLengte = GetEnvironmentVariableW(L"LOCALAPPDATA", map, MAX_PATH);
  static const wchar_t echt[] = L"\\AppData\\Local";
  const size_t echtLengte = wcslen(echt);
  if (mapLengte == 0 || mapLengte >= MAX_PATH ||
      (mapLengte >= echtLengte && _wcsicmp(map + mapLengte - echtLengte, echt) == 0)) {
    fprintf(stderr, "zet eerst LOCALAPPDATA op een eigen map, niet op de echte\n");
    return 1;
  }

  for (int i = 0; i < 300; i++) g_lang300[i] = (char)('0' + i % 10);
  for (int i = 0; i < 600; i++) g_lang600[i] = (char)('a' + i % 26);

  const DWORD basis = (DWORD)(ULONG_PTR)GetModuleHandleW(NULL);
  g_blok = (unsigned char *)VirtualAlloc((void *)(ULONG_PTR)(basis + BLOK_OFFSET), BLOK_GROOTTE,
                                         MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
  if (!g_blok) {
    fprintf(stderr, "geen geheugen op 0x%08lx: %lu\n", basis + BLOK_OFFSET, GetLastError());
    return 1;
  }
  memset(g_blok, 0, BLOK_GROOTTE);
  g_vrij = g_blok + 0x8000;

  /* Het voertuig van de speler: TRoadVehicleInst, met alles wat de plugin leest. */
  unsigned char *voertuig = neem(0x900);
  *(float *)(voertuig + 0x4) = 10.0f;   /* positie binnen de tegel */
  *(float *)(voertuig + 0x8) = 0.0f;
  *(float *)(voertuig + 0xc) = 20.0f;
  *(float *)(voertuig + 0x50) = 0.0f;   /* draaiing */
  *(float *)(voertuig + 0x54) = 0.0f;
  *(float *)(voertuig + 0x58) = 0.0f;
  *(float *)(voertuig + 0x5c) = 1.0f;
  *(int *)(voertuig + 0x74) = 5;        /* tegel */
  *(int *)(voertuig + 0x660) = 0;       /* lijn */
  *(int *)(voertuig + 0x664) = 0;       /* omloop */
  *(int *)(voertuig + 0x668) = 0;
  *(int *)(voertuig + 0x66c) = 0;       /* rit */
  *(float *)(voertuig + 0x688) = 120.0f;
  *(int *)(voertuig + 0x6a8) = 2;
  *(void **)(voertuig + 0x6ac) = delphi_tekst("Markt", 2);
  *(int *)(voertuig + 0x6bc) = 30;
  *(float *)(voertuig + 0x6cc) = 1.0f;
  *(int *)(voertuig + 0x7a8) = 0;       /* de eerste mens staat aan de deur te betalen */

  /* Het bestandsobject van het bustype: hier staan de namen. */
  unsigned char *bestand = neem(0x300);
  *(void **)(bestand + 0x19c) = delphi_tekst("Setra S315 UL Euro 3", 1);
  *(void **)(bestand + 0x1a4) = delphi_tekst("Model\\S315UL_Euro3.cfg", 1);
  *(void **)(bestand + 0x1a8) = delphi_tekst("C:\\OMSI 2\\Vehicles\\TH_Ueberlandbus\\", 1);

  void *namen[S_AANTAL], *waarden[S_AANTAL];
  for (int i = 0; i < S_AANTAL; i++) {
    namen[i] = delphi_tekst(NAMEN[i], 2);
    waarden[i] = delphi_tekst(WAARDEN[i], 2);
  }
  waarden[S_KUNDENDISPLAY] = delphi_tekst(g_lang300, 2);
  waarden[S_TEMPERATUUR] = delphi_tekst(g_lang600, 2);
  /* Een byte-string in Windows-1252, zoals OMSI ze meestal heeft: 0x80 is het euroteken. */
  waarden[S_TICKET0] = delphi_tekst("Einzelfahrt \x80 2,40", 1);
  waarden[S_IDENT] = delphi_breed(L"GTH-AB 123 \xD83D\xDE00");
  /* `zonderstrings`: geen [stringvarnamelist], dus geen namenlijst. */
  *(void **)(bestand + 0x1f0) = zonderStrings ? NULL : delphi_array(namen, S_AANTAL);

  /* Het exemplaar in de wereld: hier staan de waarden. */
  unsigned char *exemplaar = neem(0x100);
  *(void **)(exemplaar + 0x2c) = delphi_array(waarden, S_AANTAL);

  *(void **)(voertuig + 0x210) = bestand;
  *(void **)(voertuig + 0x214) = exemplaar;

  /* De getalvariabelen: namen bij het bustype, wijzers naar floats bij het voertuig. */
  char lang[64];
  memcpy(lang, "lang_", 5);
  memset(lang + 5, 'x', 58);
  lang[63] = 0; /* precies 63 bytes: de langste naam die gevraagd mag worden */
  void *getalNamen[G_AANTAL], *getalWijzers[G_AANTAL];
  float *getallen = (float *)neem(G_AANTAL * sizeof(float)); /* zoals op +0x244 */
  for (int i = 0; i < G_AANTAL; i++) {
    getalNamen[i] = i == G_LANG ? delphi_tekst(lang, 1)
                    : GETAL_NAMEN[i] ? delphi_tekst(GETAL_NAMEN[i], 1)
                                     : NULL;
    getalWijzers[i] = &getallen[i];
  }
  getallen[G_VELOCITY] = 25.0f;
  getallen[G_EIN] = 1.0f;
  getallen[G_MENU] = 0.0f; /* bij beeld 75 wordt het 6 */
  getallen[G_HST1] = 0.5f;
  {
    const unsigned int nan = 0x7fc00000u;
    memcpy(&getallen[G_KAPOT], &nan, sizeof(nan));
  }
  getalWijzers[G_NILWIJZER] = NULL;
  getallen[G_MENU_DUBBEL] = 99.0f; /* mag nooit in live.json komen: de eerste telt */
  if (getalFout) {
    /* Een wijzer die er goed uitziet, naar een getal dat niet gelezen mag worden. */
    getalWijzers[G_HST1] = verboden_pagina();
    if (!getalWijzers[G_HST1]) {
      fprintf(stderr, "geen verboden pagina: %lu\n", GetLastError());
      return 1;
    }
  }
  *(void **)(bestand + 0x1ec) = delphi_array(getalNamen, G_AANTAL);
  *(void **)(voertuig + 0x238) = delphi_array(getalWijzers, G_AANTAL);
  *(void **)(voertuig + 0x244) = getallen;
  /*
   * Waar de plugin de waarden vindt. In OMSI wijzen exemplaar+0x28 en
   * voertuig+0x23c allebei naar voertuig+0x238, en de plugin hoort eerst die
   * van het exemplaar te nemen. Daarom wijst die van het voertuig hier naar een
   * lokvogel met allemaal 222 -- behalve in `zonderstrings`: daar is die van
   * het exemplaar leeg, en moet de plugin terugvallen op het voertuig.
   */
  if (zonderStrings) {
    *(void **)(exemplaar + 0x28) = NULL;
    *(void **)(voertuig + 0x23c) = voertuig + 0x238;
  } else {
    float *lok = (float *)neem(G_AANTAL * sizeof(float));
    void *lokWijzers[G_AANTAL];
    for (int i = 0; i < G_AANTAL; i++) {
      lok[i] = 222.0f;
      lokWijzers[i] = &lok[i];
    }
    unsigned char *lokveld = neem(0x10);
    *(void **)lokveld = delphi_array(lokWijzers, G_AANTAL);
    *(void **)(exemplaar + 0x28) = voertuig + 0x238;
    *(void **)(voertuig + 0x23c) = lokveld;
  }

  /* Het model en zijn meshes, met per mesh een exemplaar met de vlag van OMSI. */
  void *meshes[M_AANTAL], *exemplaarItems[M_AANTAL];
  unsigned char *meshExemplaren[M_AANTAL];
  for (int j = 0; j < M_AANTAL; j++) {
    unsigned char *mesh = neem(0x1b0);
    *(void **)(mesh + 0x17c) = delphi_tekst(MESHES[j].o3d, 1);
    *(int *)(mesh + 0x1a4) = MESHES[j].var;
    *(int *)(mesh + 0x1a8) = MESHES[j].doel;
    meshes[j] = mesh;
    meshExemplaren[j] = neem(0xe0);
    exemplaarItems[j] = meshExemplaren[j];
  }
  unsigned char *model = neem(0x40);
  *(void **)(model + 0x38) = delphi_tlist(meshes, M_AANTAL);
  *(void **)(exemplaar + 0x20) = model;
  if (exceptie) {
    /* Een adres dat er aannemelijk uitziet, maar niet gelezen mag worden. */
    void *verboden = verboden_pagina();
    if (!verboden) {
      fprintf(stderr, "geen verboden pagina: %lu\n", GetLastError());
      return 1;
    }
    *(void **)(exemplaar + 0xe0) = verboden;
  } else {
    *(void **)(exemplaar + 0xe0) = delphi_tlist(exemplaarItems, M_AANTAL);
    zet_vlaggen(meshExemplaren, getalWijzers);
  }

  /*
   * `aanhanger`: de speler zit in een voertuig dat het script deelt met het
   * voertuig ervoor. Dat voertuig heeft eigen getallen -- allemaal 111 -- en
   * een eigen exemplaar met alle vlaggen uit, en die mogen NIET in live.json
   * komen: de plugin hoort naar het voertuig ervoor te kijken, net als bij de
   * stringvariabelen.
   */
  unsigned char *speler = voertuig;
  if (aanhanger) {
    unsigned char *achter = neem(0x900);
    memcpy(achter, voertuig, 0x900);
    float *achterGetallen = (float *)neem(G_AANTAL * sizeof(float));
    void *achterWijzers[G_AANTAL];
    for (int i = 0; i < G_AANTAL; i++) {
      achterGetallen[i] = 111.0f;
      achterWijzers[i] = &achterGetallen[i];
    }
    *(void **)(achter + 0x238) = delphi_array(achterWijzers, G_AANTAL);
    *(void **)(achter + 0x23c) = achter + 0x238;
    *(void **)(achter + 0x244) = achterGetallen;
    *(void **)(achter + 0x240) = voertuig;
    unsigned char *achterExemplaar = neem(0x100);
    memcpy(achterExemplaar, exemplaar, 0x100);
    void *achterItems[M_AANTAL];
    for (int j = 0; j < M_AANTAL; j++) achterItems[j] = neem(0xe0); /* alle vlaggen 0 */
    *(void **)(achterExemplaar + 0x28) = achter + 0x238;
    *(void **)(achterExemplaar + 0xe0) = delphi_tlist(achterItems, M_AANTAL);
    *(void **)(achter + 0x214) = achterExemplaar;
    speler = achter;
  }

  /* De lijst met voertuigen: TMyOMSIList, met de bus op plek nul. */
  unsigned char *items = neem(0x40);
  *(void **)items = speler;
  unsigned char *binnenste = neem(0x40);
  *(void **)(binnenste + 0x4) = items;
  *(int *)(binnenste + 0x8) = 1; /* TList.FCount: hoeveel voertuigen erin staan */
  unsigned char *lijst = neem(0x40);
  *(void **)(lijst + 0x28) = binnenste;
  *(void **)(g_blok + OFF_ROAD_VEHICLES) = lijst;
  *(int *)(g_blok + OFF_PLAYER_INDEX) = 0;
  *(void **)(g_blok + OFF_TIMETABLE) = NULL; /* geen dienstregeling in deze proef */

  /*
   * En de mensen. Let op: dit is GEEN TMyOMSIList zoals de voertuigen, maar een
   * gewoon Delphi-array van wijzers -- dat is precies het verschil waar de
   * kaartverkoop al die tijd op stukliep. Eentje staat er aan de deur: hij wil
   * kaartje 4 van 6,80 en geeft een briefje van tien.
   */
  unsigned char *mens = neem(0x640);
  *(unsigned char *)(mens + 0x61c) = 1;      /* soort kaartje */
  *(unsigned char *)(mens + 0x61d) = 4;      /* de vierde knop op de automaat */
  *(float *)(mens + 0x620) = 6.80f;          /* wat het kost */
  *(float *)(mens + 0x624) = 10.0f;          /* wat hij geeft */
  *(unsigned char *)(mens + 0x628) = 0;
  *(unsigned char *)(mens + 0x629) = 0;
  void *mensen[1] = { mens };
  *(void **)(g_blok + OFF_HUMANS) = delphi_array(mensen, 1);

  /* Niets van een vorige keer laten staan: dan zou een oude uitkomst GOED lijken. */
  wchar_t pad[MAX_PATH];
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career", map);
  CreateDirectoryW(pad, NULL);
  weg(map, L"live.json");
  weg(map, L"schermen.json");
  weg(map, L"getallen.json");
  weg(map, L"meshes.json");
  weg(map, L"plugin.log");

  /*
   * `gewoon`: een meshes.json van een vorige bus, en die op slot, zoals een app
   * die hem net leest. Zolang de plugin hem niet kan vervangen, horen de
   * vlaggen van deze bus niet in live.json te staan.
   */
  HANDLE meshSlot = INVALID_HANDLE_VALUE;
  if (gewoon) {
    schrijf_in(map, L"meshes.json", "{\"model\":\"Model/vorige_bus.cfg\",\"aantal\":6,\"meshes\":[]}");
    wchar_t meshPad[MAX_PATH];
    _snwprintf_s(meshPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\meshes.json", map);
    meshSlot = CreateFileW(meshPad, GENERIC_READ, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (meshSlot == INVALID_HANDLE_VALUE) {
      fprintf(stderr, "meshes.json niet op slot: %lu\n", GetLastError());
      return 1;
    }
  }

  /* De vraag van de app: welke schermvariabelen wil ze zien? */
  schrijf_in(map, L"vragen.txt",
             "afr_display_1\r\nafr_display_2\r\nafr_ticketname_0\r\nafr_ticketname_1\r\n"
             "afr_zifferneingabe\r\nafr_kundendisplay\r\ncockpit_temperatur\r\nident\r\n"
             "bestaat_niet_in_deze_bus\r\n");

  /*
   * En welke getalvariabelen. Met een andere schrijfwijze dan in de bus (twee
   * keer, in andere letters), een naam die er niet is, een naam met een
   * aanhalingsteken en een van 69 bytes: die laatste twee hoort de plugin over
   * te slaan.
   */
  char getalvragen[512];
  _snprintf_s(getalvragen, sizeof(getalvragen), _TRUNCATE,
              "ALMEX_MENU\r\nalmex_ein\r\nalmex_vis_hst1\r\nkapot_getal\r\nleeg_getal\r\n"
              "bestaat_niet_in_deze_bus\r\nmet\"aanhalingsteken\r\n%s_extra\r\nAlmex_Menu\r\n",
              lang);
  schrijf_in(map, L"getallen.txt", getalvragen);

  HMODULE dll = LoadLibraryA(argv[1]);
  if (!dll) {
    fprintf(stderr, "laden mislukt: %lu\n", GetLastError());
    return 1;
  }
  Start start = (Start)GetProcAddress(dll, "PluginStart");
  Einde finalize = (Einde)GetProcAddress(dll, "PluginFinalize");
  Waarde sys = (Waarde)GetProcAddress(dll, "AccessSystemVariable");
  Waarde var = (Waarde)GetProcAddress(dll, "AccessVariable");
  if (!start || !sys || !var) {
    fprintf(stderr, "de plugin mist een functie\n");
    return 1;
  }
  start(NULL);

  /*
   * En een opdracht: de app vraagt om Ctrl+O, de toets waar in dit huis
   * DRUCKEN op staat. OMSI draait hier niet echt, dus de plugin hoort hem te
   * lezen en te melden dat het spel niet vooraan stond (fout 1) -- daarmee is
   * de hele weg van bestand tot uitvoering nagerekend, op de toetsaanslag na.
   */
  schrijf_in(map, L"opdracht.txt", "42 24 4");

  /* Drie seconden aan beelden: genoeg voor de vragenlijsten en voor de lijsten. */
  static char live[400000], lijst2[400000];
  int beeldenOpSlot = 0, vlaggenZonderLijst = 0;
  BOOL schrijven = FALSE;
  for (int beeld = 0; beeld < 150; beeld++) {
    /* Halverwege gaat de ALMEX naar menu 6: dan is te zien dat de waarde leeft. */
    if (beeld == 75) getallen[G_MENU] = 6.0f;
    if (!exceptie) zet_vlaggen(meshExemplaren, getalWijzers);
    for (unsigned short i = 0; i < 8; i++) {
      float w = (float)(i == 0 ? 43200 + beeld : i);
      sys(i, &w, &schrijven);
    }
    for (unsigned short i = 0; i < 24; i++) {
      float w = i == 0 ? 25.0f : (float)i;
      var(i, &w, &schrijven);
    }
    /* Zolang meshes.json op slot zit: wat staat er in live.json? */
    if (meshSlot != INVALID_HANDLE_VALUE) {
      if (lees_uit(map, L"live.json", live, sizeof(live))) {
        beeldenOpSlot++;
        if (!strstr(live, "\"meshAantal\":0,\"zichtbaar\":\"\",")) vlaggenZonderLijst++;
      }
      if (beeld == 10) {
        CloseHandle(meshSlot);
        meshSlot = INVALID_HANDLE_VALUE;
      }
    }
    Sleep(20);
  }
  if (finalize) finalize();
  FreeLibrary(dll);

  /*
   * Nakijken wat er staat, in plaats van het aan het oog over te laten. De
   * volgorde is die van getallen.txt; wat de bus niet kent staat apart, en de
   * vragen met een aanhalingsteken en van 69 bytes ontbreken helemaal.
   */
  printf("scenario %s\n", scenario);
  if (gewoon) {
    klopt("live.json geschreven terwijl meshes.json op slot zat", beeldenOpSlot > 0);
    klopt("geen vlaggen in live.json zolang meshes.json niet weg kon", vlaggenZonderLijst == 0);
    lees_uit(map, L"plugin.log", lijst2, sizeof(lijst2));
    verwacht("plugin.log meldt dat meshes.json niet weg kon", lijst2, "meshes.json schrijven mislukt", 1);
  }
  lees_uit(map, L"live.json", live, sizeof(live));
  verwacht("plugin 13", live, "\"plugin\":13,", 1);
  verwacht("positie uit het geheugen (mem.ok)", live, "\"mem\":{\"ok\":1,", 1);
  char blok[1024];
  if (getalFout)
    /* Het getal op de verboden pagina neemt alle getallen mee, maar niet wat OMSI toont. */
    _snprintf_s(blok, sizeof(blok), _TRUNCATE,
                "\"getallen\":{},\"getallenOnbekend\":[],\"getallenAfgekapt\":false,"
                "\"getalAantal\":0,\"meshAantal\":6,\"zichtbaar\":\"110100\",");
  else
    _snprintf_s(blok, sizeof(blok), _TRUNCATE,
                "\"getallen\":{\"ALMEX_MENU\":6,\"almex_ein\":1,\"almex_vis_hst1\":0.5,"
                "\"kapot_getal\":null,\"leeg_getal\":null,\"Almex_Menu\":6},"
                "\"getallenOnbekend\":[\"bestaat_niet_in_deze_bus\"],\"getallenAfgekapt\":false,"
                "\"getalAantal\":11,\"meshAantal\":%s,\"zichtbaar\":\"%s\",",
                exceptie ? "0" : "6", exceptie ? "" : "110110");
  verwacht("getallen, onbekende namen en zichtbaar", live, blok, 1);
  verwacht("een vraag van 69 bytes niet afgekapt", live, "lang_", 0);
  verwacht("een vraag met een aanhalingsteken overgeslagen", live, "aanhalingsteken", 0);
  verwacht("niets van de aanhanger", live, ":111", 0);
  verwacht("niets van de lokvogel op voertuig+0x23c", live, ":222", 0);
  verwacht("de bus, ook zonder stringvariabelen; paden met /", live,
           "\"bus\":{\"naam\":\"Setra S315 UL Euro 3\",\"model\":\"Model/S315UL_Euro3.cfg\","
           "\"pad\":\"C:/OMSI 2/Vehicles/TH_Ueberlandbus/\",\"bestand\":\"\"}",
           1);
  if (zonderStrings) {
    verwacht("geen stringvariabelen", live, "\"vars\":{},\"varsAfgekapt\":false,", 1);
  } else {
    verwacht("\" \\ tab en teken 1 ge-escaped", live,
             "\"afr_display_2\":\"13:45 \\\"EUR\\\" 2\\\\40\\u0009\\u0001\"", 1);
    verwacht("Windows-1252 naar UTF-8 (euroteken)", live,
             "\"afr_ticketname_0\":\"Einzelfahrt \xe2\x82\xac 2,40\"", 1);
    verwacht("een emoji als twee halve tekens", live, "\"ident\":\"GTH-AB 123 \\ud83d\\ude00\"", 1);
    char stuk[700];
    _snprintf_s(stuk, sizeof(stuk), _TRUNCATE, "\"afr_kundendisplay\":\"%s\"", g_lang300);
    verwacht("300 tekens heel", live, stuk, 1);
    _snprintf_s(stuk, sizeof(stuk), _TRUNCATE, "\"cockpit_temperatur\":\"%.511s\"", g_lang600);
    verwacht("600 tekens netjes afgekapt op 511 bytes", live, stuk, 1);
    verwacht("niet afgekapt", live, "\"varsAfgekapt\":false,", 1);
    lees_uit(map, L"schermen.json", lijst2, sizeof(lijst2));
    verwacht("schermen.json: een naam met \" en \\ ge-escaped", lijst2,
             "\"naam\\\"met\\\\tekens\":\"x\"", 1);
  }
  const int getallijst = lees_uit(map, L"getallen.json", lijst2, sizeof(lijst2));
  if (getalFout) {
    klopt("geen getallen.json als de getallen niet te lezen zijn", !getallijst);
  } else {
    verwacht("getallen.json: een naam met \" \\ en teken 1 ge-escaped", lijst2,
             "\"rare\\\"naam\\\\met\\u0001tekens\":0", 1);
    verwacht("getallen.json: de dubbele naam staat er twee keer", lijst2, "\"almex_menu\":99", 1);
  }
  const int meshlijst = lees_uit(map, L"meshes.json", lijst2, sizeof(lijst2));
  if (exceptie) {
    klopt("geen meshes.json als de meshes niet te lezen zijn", !meshlijst);
  } else {
    verwacht("meshes.json: bestandsnaam, plek, doel en naam per mesh", lijst2,
             "{\"model\":\"Model/S315UL_Euro3.cfg\",\"aantal\":6,\"meshes\":["
             "[\"17_almex_screen_-1.o3d\",-1,0,\"\"],"
             "[\"17_almex_screen_6.o3d\",4,6,\"almex_menu\"],"
             "[\"17_almex_screen_5.o3d\",4,5,\"almex_menu\"],"
             "[\"19_pvs_1.o3d\",-1,1,\"\"],"
             "[\"17_almex_hst1.o3d\",5,0,\"almex_vis_hst1\"],"
             "[\"17_almex_raar.o3d\",9,1,\"rare\\\"naam\\\\met\\u0001tekens\"]],"
             "\"afgekapt\":false}",
             1);
  }
  printf("%s: scenario %s, %d fout(en)\n", g_fouten ? "FOUT" : "GOED", scenario, g_fouten);
  return g_fouten ? 4 : 0;
}
