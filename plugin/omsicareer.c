/*
 * OMSI Career - live-gegevensplugin
 *
 * OMSI laadt elke .opl in zijn plugins-map en roept daarna per beeld de
 * Access-functies aan, een keer per variabele die in de .opl staat. De index is
 * de positie in die lijst, dus de volgorde hier moet gelijk lopen met
 * OMSICareer.opl.
 *
 * Het contract komt uit OMSI's eigen RTTI:
 *   TAccessVariable(varindex, value, write)
 *   TAccessSystemVariable(varindex, value, write)
 *   TAccessStringVariable(varindex, str, write)
 *   TStart(AOwner) / TFinalize()
 *
 * De plugin schrijft alleen; `write` wordt nooit op waar gezet. OMSI is een
 * 32-bits Delphi-programma, dus dit moet als 32-bits DLL gebouwd worden en de
 * namen moeten onversierd geexporteerd worden (zie omsicareer.def).
 */

#include <windows.h>
#include <shlobj.h>
#include <stdarg.h>
#include <stdbool.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

#pragma comment(lib, "shell32.lib")

/* Volgorde gelijk aan [systemvarlist] in de .opl. */
enum {
  SYS_TIME = 0,
  SYS_DAY,
  SYS_MONTH,
  SYS_YEAR,
  /*
   * Neerslag is een systeemvariabele, geen voertuigvariabele. In de busscripts
   * staat hij als (L.S.PrecipRate); als voertuigvariabele opgevraagd riep OMSI
   * hem nooit aan.
   */
  SYS_PRECIP_RATE,
  SYS_PRECIP_TYPE,
  /*
   * Hierachter staat wat niet zeker is. Het wegschrijven hangt aan
   * SYS_PRECIP_TYPE en niet aan de laatste index: bestaat een naam hieronder
   * niet, dan roept OMSI hem nooit aan, en met de laatste index als sein zou de
   * plugin dan niets meer schrijven.
   */
  SYS_COLL_ENERGY,
  SYS_TEMPERATURE,
  SYS_COUNT
};

/*
 * Volgorde gelijk aan [varlist]. De eerste groep houdt OMSI in elk voertuig bij
 * (zie TScriptVarIndizes in de binary) en is dus altijd beschikbaar. De groep
 * daaronder komt uit de scripts van het busmodel zelf en ontbreekt op bussen
 * die hem niet kennen - vandaar dat we bijhouden welke indexen OMSI werkelijk
 * heeft aangeroepen.
 */
enum {
  VAR_VELOCITY = 0,
  VAR_HUMANS,
  VAR_SCHEDULE_ACTIVE,
  VAR_TARGET_INDEX,
  VAR_TANK,
  VAR_KM,
  VAR_M,
  VAR_ENTRY_REQ,
  VAR_EXIT_REQ,
  VAR_TICKET,
  VAR_ENTRY_OPEN,
  VAR_EXIT_OPEN,
  VAR_AT_STATION,
  VAR_BRIGHTNESS,
  VAR_STREETCOND,
  VAR_GROUND_SPEED,
  VAR_SCHEDULE_ACTIVE2,
  /* vanaf hier: per busmodel, kan ontbreken */
  VAR_LIGHTS_LOW,
  VAR_BLINKER_L,
  VAR_BLINKER_R,
  VAR_BRAKELIGHT,
  VAR_ENGINE_ON,
  VAR_BUSSTOP_INDEX,
  /* Alleen elektrische bussen; een deel van 0 tot 1, geen percentage. */
  VAR_BATTERY,
  VAR_COUNT
};

/* Volgorde gelijk aan [stringvarlist]. */
enum {
  STR_BUSSTOP = 0,
  STR_DELAY_MIN,
  STR_DELAY_SEC,
  STR_LINE,
  STR_TERMINUS,
  STR_MATRIX,
  /*
   * Het schermpje van de IBIS, voor de spiegel op een telefoon of tablet.
   * Welke hiervan bestaan hangt van het busmodel af; wat ontbreekt blijft leeg.
   */
  STR_IBIS_TERMINUS,
  STR_IBIS_LIJN,
  STR_LAWO1,
  STR_LAWO2,
  STR_LAWO3,
  STR_LAWO4,
  STR_COUNT
};

#define STR_MAX 96
#define WRITE_INTERVAL_MS 100
/*
 * WIE DEZE PLUGIN IS
 *
 * OMSI laadt de DLL uit zijn eigen `plugins`-map. De app zet hem daar neer,
 * maar alleen met het spel dicht -- draait OMSI, dan blijft de oude staan en
 * mist de app stilletjes alles wat er sindsdien bij gekomen is. Daarom noemt
 * de plugin zijn nummer in elk beeld, en zegt de app het als dat te oud is.
 *
 * 1  eerste versie met live.json
 * 2  positie en dienstregeling uit het geheugen
 * 3  de kaartverkoop aan de deur, en toetsen die de app laat indrukken
 * 4  het schermpje van de IBIS, per busmodel
 */
#define PLUGIN_VERSIE 4

/*
 * Drempels voor hard remmen en optrekken, in meter per seconde kwadraat.
 *
 * Een bus remt comfortabel op ongeveer 1 tot 1,5; stevig maar normaal rond 2,5.
 * De grens stond op 3,0 en dat bleek te krap: chauffeurs die voor een halte wat
 * steviger op de rem gingen kregen dat aangerekend, terwijl er in de bus niets
 * gebeurt. Bij 3,5 grijpt een staande passagier zich vast -- daar begint hard
 * remmen. Optrekken haalt een bus zelden boven de 2.
 *
 * De snelheid komt per beeld uit het spel, en dat getal springt weleens. Daarom
 * telt niet de piek maar wat blijft staan: gladgestreken, en pas na een derde
 * seconde boven de drempel.
 */
#define HARSH_BRAKE 3.5
#define HARSH_ACCEL 2.2

/* Zakt het weer onder dit deel van de drempel, dan is de gebeurtenis voorbij. */
#define RELEASE_RATIO 0.6

/* Zo lang moet het aanhouden voordat het telt; korter is een oneffenheid. */
#define MIN_EVENT_S 0.35

/* Onder deze snelheid niet meten: stilstaand gerammel is geen rijgedrag. */
#define MIN_SPEED_KMH 5.0

/*
 * Wanneer een klap een aanrijding is.
 *
 * Niet zelf bedacht: de busscripts van OMSI gebruiken dezelfde grens. In
 * collision.osc staat `(L.S.coll_energy) 10 >` voordat er schade wordt
 * geboekt. Alles daaronder is een stoeprand of een paaltje.
 */
#define COLLISION_ENERGY 10.0

/* Kortere sprongen dan dit zijn ruis of een gepauzeerd spel. */
#define MIN_STEP_S 0.01
#define MAX_STEP_S 0.5

/* Gewicht van een nieuwe meting in het voortschrijdend gemiddelde. */
#define SMOOTH 0.25

static float g_sys[SYS_COUNT];
static float g_var[VAR_COUNT];
static unsigned int g_seen; /* bit per varindex die OMSI werkelijk aanriep */
/*
 * Idem voor de systeemvariabelen. Die waren altijd aanwezig zolang we er alleen
 * tijd en weer uit haalden; sinds er namen achteraan staan die niet elke
 * OMSI-versie hoeft te kennen, moet de app "nul" kunnen onderscheiden van "niet
 * doorgegeven".
 */
static unsigned int g_seenSys;
static unsigned int g_seenStr; /* idem voor de stringvariabelen */
static char g_str[STR_COUNT][STR_MAX * 3]; /* al als UTF-8 */
/* 0 = niets gezien, 1 = bytes (ANSI), 2 = twee bytes per teken (UTF-16). */
static int g_strKind;

/*
 * Positie en dienstregeling uit het geheugen van OMSI.
 *
 * De plugin-API geeft geen positie door en weet niet welke dienstregeling de
 * speler in het menu koos. OMSI zelf weet het wel, en deze DLL draait in zijn
 * proces, dus hij kan het gewoon lezen. De adressen komen uit OmsiHook
 * (github.com/space928/Omsi-Extensions) en gelden voor OMSI 2.3.004; bij een
 * andere versie staat alles ergens anders, en dan leest de plugin niets.
 *
 * Elke pointer wordt eerst getoetst en elke lezing staat in __try: een verkeerd
 * adres mag nooit OMSI laten vastlopen, hooguit geeft het geen gegevens.
 */
#define MEM_IMAGE_BASE 0x00400000u
#define MEM_ROAD_VEHICLES 0x00861508u  /* TMyOMSIList met TRoadVehicleInst */
#define MEM_PLAYER_INDEX 0x00861740u   /* index van het voertuig van de speler */
#define MEM_TIMETABLE_MAN 0x008614e8u  /* TTimeTableMan */
#define MEM_HUMANS 0x0086172cu         /* TMyOMSIList met THumanBeingInst */

/* In TMapObjInst, de basis van elk voertuig. */
#define OFS_POSITION 0x4   /* D3DVector binnen de tegel */
#define OFS_ROTATION 0x50  /* D3DXQuaternion x, y, z, w */
#define OFS_KACHEL 0x74    /* index in de tegellijst van de kaart */
/* In TVehicleInst: wat OMSI's dienstregelingsmenu op de bus zet. */
#define OFS_SCHED_LINE 0x660
#define OFS_SCHED_TOUR 0x664
#define OFS_SCHED_TOURENTRY 0x668
#define OFS_SCHED_TRIP 0x66c
#define OFS_SCHED_NEXT_DIST 0x688
#define OFS_SCHED_NEXT_INDEX 0x6a8
#define OFS_SCHED_NEXT_NAME 0x6ac
#define OFS_SCHED_DELAY 0x6bc
#define OFS_SCHED_ACTIVE 0x6cc
/*
 * De kaartverkoop aan de deur, in TRoadVehicleInst en THumanBeingInst.
 *
 * OMSI weet precies wat er bij de deur gebeurt -- het zet het zelf linksboven
 * in beeld: welk kaartje de passagier wil, wat het kost en hoeveel geld hij
 * gegeven heeft. Aan een plugin geeft het spel dat niet door; in het geheugen
 * staat het wel. De bus houdt bij wie er staat te betalen (-1 als er niemand
 * is), en bij die persoon staat de rest.
 */
#define OFS_TICKET_PASSENGER 0x7a8 /* index in de lijst met mensen, -1 = niemand */
#define OFS_H_TICKET_TYPE 0x61c    /* byte: soort kaartje */
#define OFS_H_TICKET_INDEX 0x61d   /* byte: welk kaartje uit het kaartpakket */
#define OFS_H_TICKET_SOLL 0x620    /* float: wat het kost */
#define OFS_H_TICKET_GEGEVEN 0x624 /* float: wat hij gegeven heeft */
#define OFS_H_TICKET_BADCHANGE 0x628 /* byte: te weinig wisselgeld terug */
#define OFS_H_TICKET_READY 0x629     /* byte: klaar, hij mag doorlopen */
/* In TTimeTableMan: dynamische arrays van records. */
#define OFS_TT_TRIPS 0xc
#define OFS_TT_LINES 0x18
#define SIZE_TT_TRIP 0x28 /* naam op 0x0 */
#define SIZE_TT_LINE 0x10 /* naam op 0x0, omlopen op 0x8 */
#define SIZE_TT_TOUR 0x30 /* naam op 0x0 */

typedef struct {
  int ok;             /* 1 als het voertuig van de speler gevonden is */
  int kachel;
  float pos[3];
  float rot[4];
  int schedLine, schedTour, schedTourEntry, schedTrip, schedNextIndex, schedDelay;
  /* De kaartverkoop: -1 in `koper` betekent dat er niemand staat te betalen. */
  int koper, ticketSoort, ticketIndex, ticketSlecht, ticketKlaar;
  float ticketPrijs, ticketGegeven;
  float schedActive, schedNextDist;
  char lineName[STR_MAX * 3], tourName[STR_MAX * 3], tripName[STR_MAX * 3], nextStop[STR_MAX * 3];
} MemState;

static MemState g_mem;
/* 0 onbekend, 1 OMSI 2.3.004 (lezen mag), 2 een andere versie (niet lezen). */
static int g_memVersion;
static char g_exeVersion[16];

static wchar_t g_path[MAX_PATH];
static wchar_t g_temp[MAX_PATH];
/*
 * OPDRACHTEN VAN DE APP
 *
 * De telefoon in de overlay -- of op een iPad -- wil dingen doen die in OMSI
 * aan een toets hangen: een kaartje geven, wisselgeld teruggeven. Een plugin
 * kan OMSI daar niet rechtstreeks om vragen, maar hij draait wel ín OMSI, en
 * daar mag hij een toetsaanslag afgeven.
 *
 * De app schrijft `opdracht.txt` naast live.json: een regel met een volgnummer,
 * een scancode en de modifiers (2 = shift, 4 = ctrl), precies zoals ze in
 * `Inputs\keyboard.cfg` staan -- dus ook als de speler ze zelf heeft veranderd.
 * De plugin voert elk nummer één keer uit en zet in live.json welk nummer hij
 * gedaan heeft, met de uitkomst erbij.
 *
 * Alleen als OMSI vooraan staat. Een toets gaat naar het venster dat de aandacht
 * heeft; stond er een ander programma voor, dan zou de app daar "t" in typen.
 */
static wchar_t g_opdrachtPad[MAX_PATH];
static int g_opdrachtNr;    /* het laatst uitgevoerde nummer */
static int g_opdrachtFout;  /* 0 gelukt, 1 OMSI stond niet vooraan */
static ULONGLONG g_opdrachtGekeken;
static ULONGLONG g_lastWrite;
static int g_ready;

/*
 * Het eigen logboek van de plugin: plugin.log naast live.json.
 *
 * WAAROM
 * Op 21-09 laadde OMSI de plugin (logfile.txt meldt hem), reed Luc een uur op
 * Ahlheim 5 en sloot OMSI netjes af -- en live.json bleef op 19-09 staan, zonder
 * zelfs een live.tmp. Met een nagebootst OMSI (plugin/proef) schrijft deze
 * zelfde DLL in elk geval: met en zonder bus, netjes afgesloten of niet, met de
 * grootste berichten die kunnen ontstaan. Wat er in het spel anders was, viel
 * achteraf niet meer te zien. Dit logboek zegt het de volgende keer wel: of de
 * DLL geladen werd, of PluginStart kwam, waar hij wilde schrijven, of OMSI hem
 * gegevens gaf, en met welke Windows-fout het schrijven eventueel mislukte.
 *
 * Kort gehouden: hooguit MAX_MELDINGEN regels per start, en elke fout maar een
 * keer. De vorige start blijft staan als plugin.vorige.log.
 */
#define MAX_MELDINGEN 80
#define LEVENSTEKEN_MS (10u * 60u * 1000u)
static wchar_t g_logPath[MAX_PATH];
static int g_meldingen;
static int g_gestart;
static ULONGLONG g_sysAanroepen, g_varAanroepen;
static DWORD g_geschreven, g_mislukt;
static DWORD g_laatsteFout;
static ULONGLONG g_levensteken;

static void meld(const char *formaat, ...) {
  if (!g_logPath[0] || g_meldingen >= MAX_MELDINGEN) return;
  g_meldingen++;
  char regel[600];
  SYSTEMTIME nu;
  GetLocalTime(&nu);
  int kop = _snprintf_s(regel, sizeof(regel), _TRUNCATE, "%02u:%02u:%02u.%03u  ", nu.wHour,
                        nu.wMinute, nu.wSecond, nu.wMilliseconds);
  if (kop < 0) return;
  va_list rest;
  va_start(rest, formaat);
  int tekst = _vsnprintf_s(regel + kop, sizeof(regel) - kop - 2, _TRUNCATE, formaat, rest);
  va_end(rest);
  size_t lengte = strlen(regel);
  (void)tekst;
  regel[lengte++] = '\r';
  regel[lengte++] = '\n';
  HANDLE bestand = CreateFileW(g_logPath, FILE_APPEND_DATA,
                               FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
                               OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return;
  DWORD geschreven = 0;
  WriteFile(bestand, regel, (DWORD)lengte, &geschreven, NULL);
  CloseHandle(bestand);
}

/*
 * De map voor live.json. Eerst de omgevingsvariabele, zoals altijd; ontbreekt
 * die in het proces van OMSI, dan vraagt de plugin het Windows zelf. Vanuit
 * DllMain mag alleen de eerste weg (de tweede laadt shell32 en dat mag daar
 * niet), dus die geeft `metShell` = 0 mee.
 */
static int lokale_map(wchar_t *map, int metShell) {
  DWORD lengte = GetEnvironmentVariableW(L"LOCALAPPDATA", map, MAX_PATH);
  if (lengte > 0 && lengte < MAX_PATH) return 1;
  map[0] = 0;
  if (metShell && SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, map) == S_OK)
    return 2;
  return 0;
}

/* Rijstijl: opgeteld over de sessie, de app trekt het begin van het eind af. */
static double g_prevSpeed;      /* m/s */
static LARGE_INTEGER g_prevTick;
static LARGE_INTEGER g_freq;
static double g_accel;          /* gladgestreken versnelling, m/s^2 */
static double g_maxBrake;       /* sterkste vertraging, m/s^2 */
static double g_maxAccel;
static double g_topSpeed;       /* km/h */
static int g_harshBrakes;
static int g_harshAccels;
/*
 * Aanrijdingen. `coll_energy` is de klap van dit ene beeld en niet een
 * optelsom, dus we tellen hier zelf op. Een aanrijding duurt meer dan een
 * beeld, vandaar dezelfde aanpak als bij hard remmen: hij telt een keer, en pas
 * als de klap weer voorbij is kan er een volgende komen.
 */
static int g_collisions;
static double g_collisionEnergy; /* alles bij elkaar */
static double g_worstCollision;  /* de hardste klap */
static int g_collisionHeld;
/* Lopende gebeurtenis: hoe lang staan we al boven de drempel, en is hij geteld? */
static double g_brakeHeld;
static double g_accelHeld;
static int g_brakeCounted;
static int g_accelCounted;

static void copy_string(int slot, const void *source);
static void copy_text(char *target, size_t size, const void *source);

/* Een adres uit OmsiHook, verschoven als Windows het programma elders laadde. */
static DWORD mem_addr(DWORD address) {
  DWORD base = (DWORD)(ULONG_PTR)GetModuleHandleW(NULL);
  return address - MEM_IMAGE_BASE + base;
}

/* Lijkt dit op een heap-adres in een 32-bits proces? Nul en de eerste 64 kB niet. */
static int plausible_ptr(DWORD value) { return value >= 0x10000u && value < 0xFFFF0000u; }

/*
 * Welke OMSI draait er? De versie-informatie van het bestand zegt 2.2.032, ook
 * bij 2.3.004; die is nooit bijgewerkt. In het programma zelf staat de versie wel
 * goed, als UTF-16-tekst, tientallen keren. Die telt de plugin, eenmalig.
 */
static void detect_version(void) {
  g_memVersion = 2;
  strcpy_s(g_exeVersion, sizeof(g_exeVersion), "?");
  __try {
    HMODULE module = GetModuleHandleW(NULL);
    const IMAGE_DOS_HEADER *dos = (const IMAGE_DOS_HEADER *)module;
    const IMAGE_NT_HEADERS32 *nt = (const IMAGE_NT_HEADERS32 *)((const BYTE *)module + dos->e_lfanew);
    const IMAGE_SECTION_HEADER *section = IMAGE_FIRST_SECTION(nt);
    static const wchar_t *wanted = L"2.3.004";
    static const wchar_t *other = L"2.2.032";
    int hits = 0, others = 0;
    for (WORD s = 0; s < nt->FileHeader.NumberOfSections; s++, section++) {
      const BYTE *start = (const BYTE *)module + section->VirtualAddress;
      DWORD size = section->Misc.VirtualSize;
      /* Alleen leesbare secties met gegevens; de rest kan niet aangeraakt worden. */
      if (!(section->Characteristics & IMAGE_SCN_MEM_READ) || size < 16) continue;
      for (DWORD i = 0; i + 14 <= size; i += 2) {
        if (start[i] != '2' || start[i + 1] != 0) continue;
        if (memcmp(start + i, wanted, 14) == 0) hits++;
        else if (memcmp(start + i, other, 14) == 0) others++;
      }
    }
    if (hits > others && hits > 0) {
      g_memVersion = 1;
      strcpy_s(g_exeVersion, sizeof(g_exeVersion), "2.3.004");
    } else if (others > 0) {
      strcpy_s(g_exeVersion, sizeof(g_exeVersion), "2.2.032");
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_memVersion = 2;
  }
}

/* Element `index` van een Delphi dynamische array van records, of 0 buiten bereik. */
static DWORD dyn_item(DWORD array, int index, DWORD recordSize) {
  if (!plausible_ptr(array) || index < 0) return 0;
  const int length = *(int *)(ULONG_PTR)(array - 4);
  if (length <= 0 || index >= length || length > 100000) return 0;
  return array + (DWORD)index * recordSize;
}

/* Eén toets, met zijn modifiers, als scancodes -- zo leest OMSI ze ook. */
static void druk_toets(WORD scancode, int modifiers) {
  INPUT invoer[6];
  int n = 0;
  const WORD SHIFT = 0x2A, CTRL = 0x1D;
  memset(invoer, 0, sizeof(invoer));
  if (modifiers & 4) {
    invoer[n].type = INPUT_KEYBOARD;
    invoer[n].ki.wScan = CTRL;
    invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE;
    n++;
  }
  if (modifiers & 2) {
    invoer[n].type = INPUT_KEYBOARD;
    invoer[n].ki.wScan = SHIFT;
    invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE;
    n++;
  }
  invoer[n].type = INPUT_KEYBOARD;
  invoer[n].ki.wScan = scancode;
  invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE;
  n++;
  invoer[n].type = INPUT_KEYBOARD;
  invoer[n].ki.wScan = scancode;
  invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
  n++;
  if (modifiers & 2) {
    invoer[n].type = INPUT_KEYBOARD;
    invoer[n].ki.wScan = SHIFT;
    invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
    n++;
  }
  if (modifiers & 4) {
    invoer[n].type = INPUT_KEYBOARD;
    invoer[n].ki.wScan = CTRL;
    invoer[n].ki.dwFlags = KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP;
    n++;
  }
  SendInput((UINT)n, invoer, sizeof(INPUT));
}

/** Staat OMSI zelf vooraan? Anders gaat de toets naar een ander programma. */
static int omsi_vooraan(void) {
  HWND venster = GetForegroundWindow();
  DWORD proces = 0;
  if (!venster) return 0;
  GetWindowThreadProcessId(venster, &proces);
  return proces == GetCurrentProcessId();
}

/*
 * Kijken of de app iets gevraagd heeft. Hooguit vijf keer per seconde: het is
 * een bestandje van een regel, maar het hoeft niet bij elk beeld.
 */
static void lees_opdracht(void) {
  if (!g_opdrachtPad[0]) return;
  const ULONGLONG nu = GetTickCount64();
  if (nu - g_opdrachtGekeken < 200) return;
  g_opdrachtGekeken = nu;

  HANDLE bestand = CreateFileW(g_opdrachtPad, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE,
                               NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return;
  char regel[64];
  DWORD gelezen = 0;
  const BOOL ok = ReadFile(bestand, regel, sizeof(regel) - 1, &gelezen, NULL);
  CloseHandle(bestand);
  if (!ok || gelezen == 0) return;
  regel[gelezen] = 0;

  int nr = 0, scancode = 0, modifiers = 0;
  if (sscanf_s(regel, "%d %d %d", &nr, &scancode, &modifiers) != 3) return;
  if (nr <= g_opdrachtNr || scancode <= 0 || scancode > 255) return;
  g_opdrachtNr = nr;
  if (!omsi_vooraan()) {
    g_opdrachtFout = 1;
    meld("opdracht %d overgeslagen: OMSI staat niet vooraan", nr);
    return;
  }
  g_opdrachtFout = 0;
  druk_toets((WORD)scancode, modifiers);
  meld("opdracht %d: toets %d (modifiers %d)", nr, scancode, modifiers);
}

/*
 * Leest het voertuig van de speler en zijn dienstregeling. Alles of niets: bij
 * elke twijfel blijft `ok` nul en schrijft de app alleen wat de plugin-API gaf.
 */
static void read_memory(void) {
  MemState next;
  memset(&next, 0, sizeof(next));
  next.koper = -1;
  next.ticketIndex = -1;
  next.ticketSoort = -1;
  if (g_memVersion != 1) {
    g_mem = next;
    return;
  }
  __try {
    const DWORD list = *(DWORD *)(ULONG_PTR)mem_addr(MEM_ROAD_VEHICLES);
    const int playerIndex = *(int *)(ULONG_PTR)mem_addr(MEM_PLAYER_INDEX);
    if (plausible_ptr(list) && playerIndex >= 0 && playerIndex < 10000) {
      const DWORD inner = *(DWORD *)(ULONG_PTR)(list + 0x28);
      const DWORD items = plausible_ptr(inner) ? *(DWORD *)(ULONG_PTR)(inner + 0x4) : 0;
      const DWORD vehicle = plausible_ptr(items) ? *(DWORD *)(ULONG_PTR)(items + (DWORD)playerIndex * 4) : 0;
      if (plausible_ptr(vehicle)) {
        memcpy(next.pos, (void *)(ULONG_PTR)(vehicle + OFS_POSITION), sizeof(next.pos));
        memcpy(next.rot, (void *)(ULONG_PTR)(vehicle + OFS_ROTATION), sizeof(next.rot));
        next.kachel = *(int *)(ULONG_PTR)(vehicle + OFS_KACHEL);
        /* Een positie binnen een tegel ligt ruim binnen een kilometer; anders is het geen positie. */
        const int sane = next.kachel >= 0 && next.kachel < 100000 && isfinite(next.pos[0]) &&
                         isfinite(next.pos[2]) && fabs(next.pos[0]) < 2000 && fabs(next.pos[1]) < 2000 &&
                         fabs(next.pos[2]) < 2000;
        if (sane) {
          next.ok = 1;
          next.schedLine = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_LINE);
          next.schedTour = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_TOUR);
          next.schedTourEntry = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_TOURENTRY);
          next.schedTrip = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_TRIP);
          next.schedNextIndex = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_NEXT_INDEX);
          next.schedDelay = *(int *)(ULONG_PTR)(vehicle + OFS_SCHED_DELAY);
          next.schedActive = *(float *)(ULONG_PTR)(vehicle + OFS_SCHED_ACTIVE);
          next.schedNextDist = *(float *)(ULONG_PTR)(vehicle + OFS_SCHED_NEXT_DIST);
          copy_text(next.nextStop, sizeof(next.nextStop), *(void **)(ULONG_PTR)(vehicle + OFS_SCHED_NEXT_NAME));

          /*
           * En wie er aan de deur staat te betalen. De lijst met mensen zit
           * net zo in elkaar als die met voertuigen; `koper` is de plek daarin.
           * Alles wordt getoetst: een prijs boven de duizend of een kaartje
           * boven de honderd is geen verkoop maar een verkeerd adres.
           */
          next.koper = *(int *)(ULONG_PTR)(vehicle + OFS_TICKET_PASSENGER);
          next.ticketIndex = -1;
          next.ticketSoort = -1;
          if (next.koper >= 0 && next.koper < 100000) {
            const DWORD humans = *(DWORD *)(ULONG_PTR)mem_addr(MEM_HUMANS);
            const DWORD hInner = plausible_ptr(humans) ? *(DWORD *)(ULONG_PTR)(humans + 0x28) : 0;
            const DWORD hItems = plausible_ptr(hInner) ? *(DWORD *)(ULONG_PTR)(hInner + 0x4) : 0;
            const DWORD human =
                plausible_ptr(hItems) ? *(DWORD *)(ULONG_PTR)(hItems + (DWORD)next.koper * 4) : 0;
            if (plausible_ptr(human)) {
              const int soort = *(unsigned char *)(ULONG_PTR)(human + OFS_H_TICKET_TYPE);
              const int kaartje = *(unsigned char *)(ULONG_PTR)(human + OFS_H_TICKET_INDEX);
              const float prijs = *(float *)(ULONG_PTR)(human + OFS_H_TICKET_SOLL);
              const float gegeven = *(float *)(ULONG_PTR)(human + OFS_H_TICKET_GEGEVEN);
              if (isfinite(prijs) && isfinite(gegeven) && prijs >= 0 && prijs < 1000 &&
                  gegeven >= 0 && gegeven < 1000 && kaartje < 100) {
                next.ticketSoort = soort;
                next.ticketIndex = kaartje;
                next.ticketPrijs = prijs;
                next.ticketGegeven = gegeven;
                next.ticketSlecht = *(unsigned char *)(ULONG_PTR)(human + OFS_H_TICKET_BADCHANGE) ? 1 : 0;
                next.ticketKlaar = *(unsigned char *)(ULONG_PTR)(human + OFS_H_TICKET_READY) ? 1 : 0;
              }
            }
          }

          /* Namen van lijn, omloop en rit uit de dienstregeling van de kaart. */
          const DWORD tt = *(DWORD *)(ULONG_PTR)mem_addr(MEM_TIMETABLE_MAN);
          if (plausible_ptr(tt)) {
            const DWORD line = dyn_item(*(DWORD *)(ULONG_PTR)(tt + OFS_TT_LINES), next.schedLine, SIZE_TT_LINE);
            if (line) {
              copy_text(next.lineName, sizeof(next.lineName), *(void **)(ULONG_PTR)line);
              const DWORD tour = dyn_item(*(DWORD *)(ULONG_PTR)(line + 0x8), next.schedTour, SIZE_TT_TOUR);
              if (tour) copy_text(next.tourName, sizeof(next.tourName), *(void **)(ULONG_PTR)tour);
            }
            const DWORD trip = dyn_item(*(DWORD *)(ULONG_PTR)(tt + OFS_TT_TRIPS), next.schedTrip, SIZE_TT_TRIP);
            if (trip) copy_text(next.tripName, sizeof(next.tripName), *(void **)(ULONG_PTR)trip);
          }
        }
      }
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    memset(&next, 0, sizeof(next));
  }
  g_mem = next;
}

/*
 * Kopieert een OMSI-string.
 *
 * Of Delphi hier een PAnsiChar of een PWideChar doorgeeft, staat nergens vast en
 * verschilt per bouwversie. Voor tekst uit het Latijnse alfabet is het verschil
 * aan de tweede byte te zien: bij UTF-16 is die nul, bij ANSI is dat gewoon het
 * volgende teken. Daarop wordt hier herkend, zodat beide vormen werken.
 */
static void copy_string(int slot, const void *source) {
  if (slot < 0 || slot >= STR_COUNT) return;
  copy_text(g_str[slot], sizeof(g_str[slot]), source);
}

/* Zoals copy_string, naar een willekeurige buffer; ook voor tekst uit het geheugen. */
static void copy_text(char *target, size_t size, const void *source) {
  target[0] = 0;
  if (!source || !plausible_ptr((DWORD)(ULONG_PTR)source)) return;

  __try {
    const unsigned char *bytes = (const unsigned char *)source;
    if (bytes[0] == 0) return; /* lege string */

    const int wide = bytes[1] == 0;
    if (wide) {
      if (g_strKind != 2) g_strKind = 2;
      const wchar_t *w = (const wchar_t *)source;
      wchar_t clean[STR_MAX];
      size_t i = 0;
      while (i < STR_MAX - 1 && w[i]) {
        const wchar_t c = w[i];
        clean[i] = (c == L'"' || c == L'\\' || c < 32) ? L' ' : c;
        i++;
      }
      clean[i] = 0;
      if (!WideCharToMultiByte(CP_UTF8, 0, clean, -1, target, (int)size, NULL, NULL)) {
        target[0] = 0;
      }
    } else {
      if (g_strKind != 1) g_strKind = 1;
      const char *a = (const char *)source;
      char clean[STR_MAX];
      size_t i = 0;
      while (i < STR_MAX - 1 && a[i]) {
        const unsigned char c = (unsigned char)a[i];
        clean[i] = (c == '"' || c == '\\' || c < 32) ? ' ' : (char)c;
        i++;
      }
      clean[i] = 0;
      /* OMSI schrijft zijn tekstbestanden in Windows-1252; dat geldt hier ook. */
      wchar_t wide16[STR_MAX];
      if (MultiByteToWideChar(1252, 0, clean, -1, wide16, STR_MAX) == 0 ||
          WideCharToMultiByte(CP_UTF8, 0, wide16, -1, target, (int)size, NULL, NULL) == 0) {
        target[0] = 0;
      }
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    target[0] = 0;
  }
}

/*
 * Meet optrekken en remmen uit de snelheid.
 *
 * `Velocity` staat in km/h - de busscripts delen hem door 3.6 voor hun
 * natuurkunde. De tijd tussen twee beelden komt van de prestatieteller, want
 * GetTickCount is met zijn stap van 15 ms te grof voor een beeld van 16 ms.
 */
static void track_driving(double speedKmh) {
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);

  if (speedKmh > g_topSpeed) g_topSpeed = speedKmh;
  const double speed = speedKmh / 3.6;

  if (g_prevTick.QuadPart == 0 || g_freq.QuadPart == 0) {
    g_prevTick = now;
    g_prevSpeed = speed;
    return;
  }

  const double step = (double)(now.QuadPart - g_prevTick.QuadPart) / (double)g_freq.QuadPart;
  g_prevTick = now;
  if (step < MIN_STEP_S || step > MAX_STEP_S) {
    g_prevSpeed = speed;
    return;
  }

  const double raw = (speed - g_prevSpeed) / step;
  g_prevSpeed = speed;

  /*
   * Een bus haalt geen 12 m/s^2. Zulke sprongen komen van het laden van een
   * kaart of het verzetten van het voertuig, niet van rijgedrag; een sessie
   * leverde zo een "sterkste vertraging" van 15 m/s^2 op.
   */
  if (raw > 12.0 || raw < -12.0) return;

  /* Gladstrijken: een enkel beeld met een sprong is meetruis, geen rijgedrag. */
  g_accel = g_accel * (1.0 - SMOOTH) + raw * SMOOTH;

  if (speedKmh < MIN_SPEED_KMH) {
    g_brakeHeld = g_accelHeld = 0;
    g_brakeCounted = g_accelCounted = 0;
    return;
  }

  const double brake = g_accel < 0 ? -g_accel : 0;
  const double accel = g_accel > 0 ? g_accel : 0;
  if (brake > g_maxBrake) g_maxBrake = brake;
  if (accel > g_maxAccel) g_maxAccel = accel;

  /*
   * Een gebeurtenis telt een keer, niet elk beeld. Bij zestig beelden per
   * seconde zou een remactie van twee tellen anders als honderdtwintig keer
   * hard remmen in het logboek belanden.
   */
  if (brake >= HARSH_BRAKE) {
    g_brakeHeld += step;
    if (!g_brakeCounted && g_brakeHeld >= MIN_EVENT_S) {
      g_harshBrakes++;
      g_brakeCounted = 1;
    }
  } else if (brake < HARSH_BRAKE * RELEASE_RATIO) {
    g_brakeHeld = 0;
    g_brakeCounted = 0;
  }

  if (accel >= HARSH_ACCEL) {
    g_accelHeld += step;
    if (!g_accelCounted && g_accelHeld >= MIN_EVENT_S) {
      g_harshAccels++;
      g_accelCounted = 1;
    }
  } else if (accel < HARSH_ACCEL * RELEASE_RATIO) {
    g_accelHeld = 0;
    g_accelCounted = 0;
  }
}

/*
 * Een aanrijding boeken.
 *
 * Wordt aangeroepen zodra OMSI de klap van dit beeld doorgeeft. Boven de grens
 * begint een aanrijding en telt hij een keer; pas als de waarde weer op nul
 * staat kan er een volgende komen. Zonder dat zou een bus die tegen een muur
 * blijft duwen honderd aanrijdingen per seconde opleveren.
 */
static void track_collision(double energy) {
  if (energy < 0) energy = 0;
  g_collisionEnergy += energy;
  if (energy > g_worstCollision) g_worstCollision = energy;

  if (energy >= COLLISION_ENERGY) {
    if (!g_collisionHeld) {
      g_collisions++;
      g_collisionHeld = 1;
    }
  } else if (energy <= 0) {
    g_collisionHeld = 0;
  }
}

/* Schrijft de verzamelde waarden weg, via een tijdelijk bestand zodat de lezer
 * nooit een half bestand ziet. */
static void flush_state(int alive) {
  char body[6144];
  char mem[2048];
  _snprintf_s(
      mem, sizeof(mem), _TRUNCATE,
      ",\"exeVersion\":\"%s\",\"mem\":{\"ok\":%d,\"tile\":%d,\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,"
      "\"qx\":%.5f,\"qy\":%.5f,\"qz\":%.5f,\"qw\":%.5f,"
      "\"schedActive\":%.2f,\"line\":%d,\"tour\":%d,\"tourEntry\":%d,\"trip\":%d,"
      "\"nextIndex\":%d,\"nextDist\":%.1f,\"delay\":%d,"
      "\"opdracht\":%d,\"opdrachtFout\":%d,"
      "\"koper\":%d,\"ticketSoort\":%d,\"ticketIndex\":%d,"
      "\"ticketPrijs\":%.2f,\"ticketGegeven\":%.2f,"
      "\"ticketSlecht\":%d,\"ticketKlaar\":%d,"
      "\"lineName\":\"%s\",\"tourName\":\"%s\",\"tripName\":\"%s\",\"nextStop\":\"%s\"}}",
      g_exeVersion, g_mem.ok, g_mem.kachel, g_mem.pos[0], g_mem.pos[1], g_mem.pos[2],
      g_mem.rot[0], g_mem.rot[1], g_mem.rot[2], g_mem.rot[3],
      g_mem.schedActive, g_mem.schedLine, g_mem.schedTour, g_mem.schedTourEntry, g_mem.schedTrip,
      g_mem.schedNextIndex, g_mem.schedNextDist, g_mem.schedDelay,
      g_opdrachtNr, g_opdrachtFout,
      g_mem.koper, g_mem.ticketSoort, g_mem.ticketIndex,
      g_mem.ticketPrijs, g_mem.ticketGegeven, g_mem.ticketSlecht, g_mem.ticketKlaar,
      g_mem.lineName, g_mem.tourName, g_mem.tripName, g_mem.nextStop);

  int length = _snprintf_s(
      body, sizeof(body), _TRUNCATE,
      "{\"alive\":%s,\"plugin\":%d,\"seen\":%u,\"seenSys\":%u,\"seenStr\":%u,\"strKind\":%d,"
      "\"time\":%.3f,\"day\":%.0f,\"month\":%.0f,\"year\":%.0f,"
      "\"velocity\":%.2f,\"passengers\":%.0f,\"scheduleActive\":%.0f,"
      "\"targetIndex\":%.0f,\"tankPercent\":%.3f,\"km\":%.0f,\"metres\":%.1f,"
      "\"entryRequest\":%.0f,\"exitRequest\":%.0f,\"ticket\":%.0f,"
      "\"entryOpen\":%.0f,\"exitOpen\":%.0f,\"atStation\":%.0f,"
      "\"brightness\":%.3f,\"streetCond\":%.3f,\"precipRate\":%.3f,\"precipType\":%.0f,"
      "\"lightsLow\":%.0f,\"blinkerLeft\":%.0f,\"blinkerRight\":%.0f,"
      "\"brakeLight\":%.0f,\"engineOn\":%.0f,\"busstopIndex\":%.0f,"
      "\"maxBrake\":%.2f,\"maxAccel\":%.2f,\"topSpeed\":%.1f,"
      "\"harshBrakes\":%d,\"harshAccels\":%d,"
      "\"battery\":%.4f,\"temperature\":%.1f,"
      "\"collisions\":%d,\"collisionEnergy\":%.1f,\"worstCollision\":%.1f,"
      "\"busstop\":\"%s\",\"delayMin\":\"%s\",\"delaySec\":\"%s\","
      "\"line\":\"%s\",\"terminus\":\"%s\",\"matrix\":\"%s\","
      "\"ibis\":{\"bestemming\":\"%s\",\"lijn\":\"%s\","
      "\"lawo1\":\"%s\",\"lawo2\":\"%s\",\"lawo3\":\"%s\",\"lawo4\":\"%s\"}%s",
      alive ? "true" : "false", PLUGIN_VERSIE, g_seen, g_seenSys, g_seenStr, g_strKind,
      g_sys[SYS_TIME], g_sys[SYS_DAY], g_sys[SYS_MONTH], g_sys[SYS_YEAR],
      g_var[VAR_VELOCITY], g_var[VAR_HUMANS], g_var[VAR_SCHEDULE_ACTIVE],
      g_var[VAR_TARGET_INDEX], g_var[VAR_TANK], g_var[VAR_KM], g_var[VAR_M],
      g_var[VAR_ENTRY_REQ], g_var[VAR_EXIT_REQ], g_var[VAR_TICKET],
      g_var[VAR_ENTRY_OPEN], g_var[VAR_EXIT_OPEN], g_var[VAR_AT_STATION],
      g_var[VAR_BRIGHTNESS], g_var[VAR_STREETCOND], g_sys[SYS_PRECIP_RATE],
      g_sys[SYS_PRECIP_TYPE], g_var[VAR_LIGHTS_LOW], g_var[VAR_BLINKER_L],
      g_var[VAR_BLINKER_R], g_var[VAR_BRAKELIGHT], g_var[VAR_ENGINE_ON],
      g_var[VAR_BUSSTOP_INDEX],
      g_maxBrake, g_maxAccel, g_topSpeed, g_harshBrakes, g_harshAccels,
      g_var[VAR_BATTERY], g_sys[SYS_TEMPERATURE],
      g_collisions, g_collisionEnergy, g_worstCollision,
      g_str[STR_BUSSTOP], g_str[STR_DELAY_MIN], g_str[STR_DELAY_SEC],
      g_str[STR_LINE], g_str[STR_TERMINUS], g_str[STR_MATRIX],
      g_str[STR_IBIS_TERMINUS], g_str[STR_IBIS_LIJN],
      g_str[STR_LAWO1], g_str[STR_LAWO2], g_str[STR_LAWO3], g_str[STR_LAWO4], mem);
  if (length <= 0) {
    g_mislukt++;
    if (g_laatsteFout != 0xFFFFFFFFu) meld("bericht past niet in de buffer: nu niet geschreven");
    g_laatsteFout = 0xFFFFFFFFu;
    return;
  }

  HANDLE file = CreateFileW(g_temp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) {
    DWORD fout = GetLastError();
    g_mislukt++;
    if (fout != g_laatsteFout) meld("live.tmp openen mislukt: Windows-fout %lu", fout);
    g_laatsteFout = fout;
    return;
  }
  DWORD written = 0;
  WriteFile(file, body, (DWORD)length, &written, NULL);
  CloseHandle(file);
  if (!MoveFileExW(g_temp, g_path, MOVEFILE_REPLACE_EXISTING)) {
    DWORD fout = GetLastError();
    g_mislukt++;
    if (fout != g_laatsteFout) meld("live.json vervangen mislukt: Windows-fout %lu", fout);
    g_laatsteFout = fout;
    return;
  }
  if (g_geschreven++ == 0) meld("eerste live.json geschreven (%d bytes)", length);
  g_laatsteFout = 0;
}

/* Wordt na de laatste variabele van een beeld aangeroepen. */
static void maybe_flush(void) {
  ULONGLONG now = GetTickCount64();
  /* Wat de app vraagt, mag niet op het schrijfritme wachten; zie `lees_opdracht`. */
  lees_opdracht();
  if (!g_ready || now - g_lastWrite < WRITE_INTERVAL_MS) return;
  g_lastWrite = now;
  read_memory();
  flush_state(1);
}

__declspec(dllexport) void __stdcall PluginStart(void *owner) {
  (void)owner;
  g_gestart = 1;
  meld("PluginStart");

  wchar_t base[MAX_PATH];
  const int bron = lokale_map(base, 1);
  if (!bron) {
    meld("geen map voor live.json: LOCALAPPDATA ontbreekt en Windows gaf er ook geen");
    return;
  }
  if (bron == 2) meld("LOCALAPPDATA ontbreekt in dit proces; de map komt van Windows zelf");

  _snwprintf_s(g_path, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career", base);
  CreateDirectoryW(g_path, NULL);
  _snwprintf_s(g_temp, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\live.tmp", base);
  _snwprintf_s(g_opdrachtPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\opdracht.txt", base);
  _snwprintf_s(g_path, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\live.json", base);

  memset(g_sys, 0, sizeof(g_sys));
  memset(g_var, 0, sizeof(g_var));
  memset(g_str, 0, sizeof(g_str));
  g_seen = 0;
  g_seenStr = 0;
  g_strKind = 0;
  g_lastWrite = 0;
  g_prevSpeed = 0;
  g_prevTick.QuadPart = 0;
  g_accel = 0;
  g_maxBrake = g_maxAccel = g_topSpeed = 0;
  g_harshBrakes = g_harshAccels = 0;
  g_seenSys = 0;
  g_collisions = 0;
  g_collisionEnergy = g_worstCollision = 0;
  g_collisionHeld = 0;
  g_brakeHeld = g_accelHeld = 0;
  g_brakeCounted = g_accelCounted = 0;
  QueryPerformanceFrequency(&g_freq);
  memset(&g_mem, 0, sizeof(g_mem));
  detect_version();
  g_ready = 1;
  g_levensteken = GetTickCount64();
  meld("klaar om te schrijven naar %ls (OMSI %s)", g_path, g_exeVersion);
}

__declspec(dllexport) void __stdcall PluginFinalize(void) {
  if (!g_ready) return;
  /*
   * Laatste stand bewaren met alive=false in plaats van het bestand weggooien.
   * Wie het spel afsluit voor hij de dienst afrondt, zou anders zijn gemeten
   * kilometers kwijt zijn.
   */
  flush_state(0);
  g_ready = 0;
  meld("afgesloten: %I64u systeemaanroepen, %I64u voertuigaanroepen, %lu keer geschreven, %lu keer mislukt",
       g_sysAanroepen, g_varAanroepen, g_geschreven, g_mislukt);
}

__declspec(dllexport) void __stdcall AccessSystemVariable(unsigned short index,
                                                         float *value,
                                                         bool *write) {
  (void)write;
  if (!value || index >= SYS_COUNT) return;
  if (g_sysAanroepen++ == 0) meld("eerste systeemvariabele van OMSI (index %u)", index);
  g_sys[index] = *value;
  g_seenSys |= (1u << index);

  /* Elke tien minuten een teken van leven, zodat te zien is of de stroom opdroogt. */
  if (index == 0 && g_ready) {
    ULONGLONG nu = GetTickCount64();
    if (nu - g_levensteken >= LEVENSTEKEN_MS) {
      g_levensteken = nu;
      meld("loopt: %I64u systeemaanroepen, %I64u voertuigaanroepen, %lu keer geschreven, %lu keer mislukt",
           g_sysAanroepen, g_varAanroepen, g_geschreven, g_mislukt);
    }
  }

  if (index == SYS_COLL_ENERGY) track_collision((double)*value);

  /*
   * Wegschrijven na de laatste naam waarvan zeker is dat OMSI hem kent. De
   * namen daarachter komen er misschien niet; met `SYS_COUNT - 1` als sein zou
   * de plugin dan zwijgen.
   */
  if (index == SYS_PRECIP_TYPE) maybe_flush();
}

__declspec(dllexport) void __stdcall AccessVariable(unsigned short index,
                                                    float *value, bool *write) {
  (void)write;
  if (!value || index >= VAR_COUNT) return;
  if (g_varAanroepen++ == 0) meld("eerste voertuigvariabele van OMSI (index %u)", index);
  g_var[index] = *value;
  g_seen |= (1u << index);

  if (index == VAR_VELOCITY) track_driving((double)*value);
  /*
   * Wegschrijven na de laatste variabele die OMSI zelf in elk voertuig bijhoudt.
   * De per-busvariabelen daarachter ontbreken op veel modellen; die als sein
   * gebruiken zou betekenen dat er op zo'n bus nooit iets wordt geschreven.
   */
  if (index == VAR_SCHEDULE_ACTIVE2) maybe_flush();
}

__declspec(dllexport) void __stdcall AccessStringVariable(unsigned short index,
                                                          void **value, bool *write) {
  (void)write;
  if (!value || index >= STR_COUNT) return;
  g_seenStr |= (1u << index);
  copy_string(index, *value);
}

/*
 * Het logboek openen zodra de DLL geladen is, nog voor PluginStart: bleef die
 * weg, dan hoort dat er ook te staan. Hier alleen kernel32 -- geen shell32, geen
 * andere DLL's laden terwijl Windows de laadvergrendeling vasthoudt. Is er geen
 * LOCALAPPDATA, dan komt het logboek naast de DLL in de plugins-map.
 */
static void logboek_openen(HINSTANCE instance) {
  wchar_t map[MAX_PATH];
  if (lokale_map(map, 0)) {
    wchar_t submap[MAX_PATH];
    _snwprintf_s(submap, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career", map);
    CreateDirectoryW(submap, NULL);
    _snwprintf_s(g_logPath, MAX_PATH, _TRUNCATE, L"%s\\plugin.log", submap);
  } else {
    wchar_t eigen[MAX_PATH];
    DWORD lengte = GetModuleFileNameW(instance, eigen, MAX_PATH);
    if (lengte == 0 || lengte >= MAX_PATH) return;
    wchar_t *streep = wcsrchr(eigen, L'\\');
    if (streep) *streep = 0;
    _snwprintf_s(g_logPath, MAX_PATH, _TRUNCATE, L"%s\\OMSICareer.log", eigen);
  }

  /* De vorige start bewaren, deze begint leeg. */
  wchar_t vorige[MAX_PATH];
  _snwprintf_s(vorige, MAX_PATH, _TRUNCATE, L"%s", g_logPath);
  wchar_t *punt = wcsrchr(vorige, L'.');
  if (punt) *punt = 0;
  wcscat_s(vorige, MAX_PATH, L".vorige.log");
  MoveFileExW(g_logPath, vorige, MOVEFILE_REPLACE_EXISTING);

  wchar_t exe[MAX_PATH];
  if (!GetModuleFileNameW(NULL, exe, MAX_PATH)) exe[0] = 0;
  wchar_t werkmap[MAX_PATH];
  if (!GetCurrentDirectoryW(MAX_PATH, werkmap)) werkmap[0] = 0;
  meld("geladen in %ls (werkmap %ls)%s", exe, werkmap,
       lokale_map(map, 0) ? "" : " -- LOCALAPPDATA ontbreekt");
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
  (void)reserved;
  if (reason == DLL_PROCESS_ATTACH) logboek_openen(instance);
  if (reason == DLL_PROCESS_DETACH) {
    if (g_ready) PluginFinalize();
    else if (!g_gestart) meld("ontladen zonder dat OMSI PluginStart aanriep");
  }
  return TRUE;
}
