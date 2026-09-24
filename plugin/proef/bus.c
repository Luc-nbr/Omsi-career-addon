/*
 * Een nagebootste OMSI met een bus in zijn geheugen.
 *
 * WAAROM
 * De plugin leest de stringvariabelen van de bus rechtstreeks uit het geheugen
 * van OMSI: de namen staan bij het bustype, de waarden bij het exemplaar dat
 * rijdt (zie `lees_busvars` in omsicareer.c). Dat is niet na te rekenen door de
 * app te starten -- daarvoor moet het spel draaien, met de juiste bus, en dan
 * nog zie je alleen het eindresultaat. Dit programma zet dezelfde bouwsels op
 * dezelfde plekken neer als OMSI, laadt de plugin en laat hem ernaar kijken.
 *
 *   set LOCALAPPDATA=%TEMP%\omsi-busproef
 *   bus.exe pad\naar\OMSICareerPlugin.dll
 *
 * Daarna staan in `%LOCALAPPDATA%\OMSI Career` een live.json met de gevraagde
 * variabelen erin, en een schermen.json met alles wat de bus te bieden heeft.
 *
 * HOE OMSI HET NEERZET
 * De adressen in de plugin gelden vanaf 0x400000, het beginadres van omsi.exe;
 * `mem_addr` rekent ze om naar waar het programma werkelijk geladen is. Hier
 * wordt daarom een blok geheugen gevraagd op precies die plek in ons eigen
 * programma. De bouwsels erin zijn Delphi: een array is een wijzer naar het
 * eerste element met de lengte vier bytes ervoor, en een string is een wijzer
 * naar de tekens, met de lengte er vier bytes voor en de tekenbreedte tien
 * bytes ervoor.
 */
#include <windows.h>
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

/* Een array van wijzers zoals Delphi hem neerzet; de lengte staat ervoor. */
static void *delphi_array(void **items, int aantal) {
  unsigned char *kop = neem((size_t)(4 + aantal * 4));
  *(int *)kop = aantal;
  memcpy(kop + 4, items, (size_t)aantal * sizeof(void *));
  return kop + 4;
}

/* De namen en waarden van een bus, zoals de Setra van Thueringenwald ze heeft. */
static const char *NAMEN[] = {
    "afr_display_1",      "afr_display_2",   "afr_kundendisplay", "afr_zifferneingabe",
    "afr_ticketname_0",   "afr_ticketname_1", "afr_ticketname_2",  "afr_ticketname_3",
    "LAWO_display_line1", "LAWO_display_line2", "IBIS_busstop_name", "cockpit_temperatur",
    "Matrix_Nr",          "ident"};
static const char *WAARDEN[] = {
    "Linie 320    Kurs 1", "13:45      EUR 2,40", "2,40", "12",
    "Einzelfahrt",         "Kind",                "Tageskarte", "Gruppenkarte",
    "320 Oberhof",         "ueber Zella-Mehlis",  "Markt",      "21,5",
    "320",                 "GTH-AB 123"};

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "gebruik: bus.exe pad\\naar\\OMSICareerPlugin.dll\n");
    return 2;
  }
  /* Zonder deze aanraking gooit de compiler de versietekst weg. */
  if (g_versie[0] == 0) return 3;

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

  const int aantal = (int)(sizeof(NAMEN) / sizeof(NAMEN[0]));
  void *namen[64], *waarden[64];
  for (int i = 0; i < aantal; i++) {
    namen[i] = delphi_tekst(NAMEN[i], 2);
    waarden[i] = delphi_tekst(WAARDEN[i], 2);
  }
  *(void **)(bestand + 0x1f0) = delphi_array(namen, aantal);

  /* Het exemplaar in de wereld: hier staan de waarden. */
  unsigned char *exemplaar = neem(0x40);
  *(void **)(exemplaar + 0x2c) = delphi_array(waarden, aantal);

  *(void **)(voertuig + 0x210) = bestand;
  *(void **)(voertuig + 0x214) = exemplaar;

  /* De lijst met voertuigen: TMyOMSIList, met de bus op plek nul. */
  unsigned char *items = neem(0x40);
  *(void **)items = voertuig;
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

  /* De vraag van de app: welke schermvariabelen wil ze zien? */
  wchar_t map[MAX_PATH], pad[MAX_PATH];
  if (GetEnvironmentVariableW(L"LOCALAPPDATA", map, MAX_PATH) == 0) {
    fprintf(stderr, "zet eerst LOCALAPPDATA op een eigen map\n");
    return 1;
  }
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career", map);
  CreateDirectoryW(pad, NULL);
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\vragen.txt", map);
  HANDLE vragen = CreateFileW(pad, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (vragen != INVALID_HANDLE_VALUE) {
    static const char regels[] =
        "afr_display_1\r\nafr_display_2\r\nafr_ticketname_0\r\nafr_ticketname_1\r\n"
        "afr_zifferneingabe\r\nbestaat_niet_in_deze_bus\r\n";
    DWORD geschreven = 0;
    WriteFile(vragen, regels, (DWORD)(sizeof(regels) - 1), &geschreven, NULL);
    CloseHandle(vragen);
  }

  /*
   * En een opdracht: de app vraagt om Ctrl+O, de toets waar in dit huis
   * DRUCKEN op staat. OMSI draait hier niet echt, dus de plugin hoort hem te
   * lezen en te melden dat het spel niet vooraan stond (fout 1) -- daarmee is
   * de hele weg van bestand tot uitvoering nagerekend, op de toetsaanslag na.
   */
  _snwprintf_s(pad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\opdracht.txt", map);
  HANDLE opdracht = CreateFileW(pad, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (opdracht != INVALID_HANDLE_VALUE) {
    static const char regel[] = "42 24 4";
    DWORD geschreven = 0;
    WriteFile(opdracht, regel, (DWORD)(sizeof(regel) - 1), &geschreven, NULL);
    CloseHandle(opdracht);
  }

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

  /* Drie seconden aan beelden: genoeg voor de vragenlijst en voor schermen.json. */
  BOOL schrijven = FALSE;
  for (int beeld = 0; beeld < 150; beeld++) {
    for (unsigned short i = 0; i < 8; i++) {
      float w = (float)(i == 0 ? 43200 + beeld : i);
      sys(i, &w, &schrijven);
    }
    for (unsigned short i = 0; i < 24; i++) {
      float w = i == 0 ? 25.0f : (float)i;
      var(i, &w, &schrijven);
    }
    Sleep(20);
  }
  if (finalize) finalize();
  FreeLibrary(dll);
  printf("klaar: bus in het geheugen gezet en de plugin erlangs gehaald\n");
  return 0;
}
