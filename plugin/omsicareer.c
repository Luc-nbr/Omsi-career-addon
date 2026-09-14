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
#include <stdbool.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

/* Volgorde gelijk aan [systemvarlist] in de .opl. */
enum { SYS_TIME = 0, SYS_DAY, SYS_MONTH, SYS_YEAR, SYS_COUNT };

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
  VAR_PRECIP_RATE,
  VAR_PRECIP_TYPE,
  /* vanaf hier: per busmodel, kan ontbreken */
  VAR_LIGHTS_LOW,
  VAR_BLINKER_L,
  VAR_BLINKER_R,
  VAR_BRAKELIGHT,
  VAR_ENGINE_ON,
  VAR_BUSSTOP_INDEX,
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
  STR_COUNT
};

#define STR_MAX 96
#define WRITE_INTERVAL_MS 100

/*
 * Drempels voor hard remmen en optrekken, in meter per seconde kwadraat.
 *
 * Een bus remt comfortabel op ongeveer 1 tot 1,5; stevig maar normaal rond 2,5.
 * Pas daarboven vliegen staande passagiers naar voren, dus daar ligt de grens.
 * Optrekken haalt een bus zelden boven de 2.
 */
#define HARSH_BRAKE 3.0
#define HARSH_ACCEL 2.0

/* Zakt het weer onder dit deel van de drempel, dan is de gebeurtenis voorbij. */
#define RELEASE_RATIO 0.6

/* Zo lang moet het aanhouden voordat het telt; korter is een oneffenheid. */
#define MIN_EVENT_S 0.25

/* Onder deze snelheid niet meten: stilstaand gerammel is geen rijgedrag. */
#define MIN_SPEED_KMH 5.0

/* Kortere sprongen dan dit zijn ruis of een gepauzeerd spel. */
#define MIN_STEP_S 0.01
#define MAX_STEP_S 0.5

/* Gewicht van een nieuwe meting in het voortschrijdend gemiddelde. */
#define SMOOTH 0.25

static float g_sys[SYS_COUNT];
static float g_var[VAR_COUNT];
static unsigned int g_seen; /* bit per varindex die OMSI werkelijk aanriep */
static unsigned int g_seenStr; /* idem voor de stringvariabelen */
static char g_str[STR_COUNT][STR_MAX * 3]; /* al als UTF-8 */
/* 0 = niets gezien, 1 = bytes (ANSI), 2 = twee bytes per teken (UTF-16). */
static int g_strKind;

static wchar_t g_path[MAX_PATH];
static wchar_t g_temp[MAX_PATH];
static ULONGLONG g_lastWrite;
static int g_ready;

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
/* Lopende gebeurtenis: hoe lang staan we al boven de drempel, en is hij geteld? */
static double g_brakeHeld;
static double g_accelHeld;
static int g_brakeCounted;
static int g_accelCounted;

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
  g_str[slot][0] = 0;
  if (!source) return;

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
      if (!WideCharToMultiByte(CP_UTF8, 0, clean, -1, g_str[slot], (int)sizeof(g_str[slot]), NULL,
                               NULL)) {
        g_str[slot][0] = 0;
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
          WideCharToMultiByte(CP_UTF8, 0, wide16, -1, g_str[slot], (int)sizeof(g_str[slot]), NULL,
                              NULL) == 0) {
        g_str[slot][0] = 0;
      }
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_str[slot][0] = 0;
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

/* Schrijft de verzamelde waarden weg, via een tijdelijk bestand zodat de lezer
 * nooit een half bestand ziet. */
static void flush_state(int alive) {
  char body[3072];

  int length = _snprintf_s(
      body, sizeof(body), _TRUNCATE,
      "{\"alive\":%s,\"seen\":%u,\"seenStr\":%u,\"strKind\":%d,"
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
      "\"busstop\":\"%s\",\"delayMin\":\"%s\",\"delaySec\":\"%s\","
      "\"line\":\"%s\",\"terminus\":\"%s\",\"matrix\":\"%s\"}",
      alive ? "true" : "false", g_seen, g_seenStr, g_strKind,
      g_sys[SYS_TIME], g_sys[SYS_DAY], g_sys[SYS_MONTH], g_sys[SYS_YEAR],
      g_var[VAR_VELOCITY], g_var[VAR_HUMANS], g_var[VAR_SCHEDULE_ACTIVE],
      g_var[VAR_TARGET_INDEX], g_var[VAR_TANK], g_var[VAR_KM], g_var[VAR_M],
      g_var[VAR_ENTRY_REQ], g_var[VAR_EXIT_REQ], g_var[VAR_TICKET],
      g_var[VAR_ENTRY_OPEN], g_var[VAR_EXIT_OPEN], g_var[VAR_AT_STATION],
      g_var[VAR_BRIGHTNESS], g_var[VAR_STREETCOND], g_var[VAR_PRECIP_RATE],
      g_var[VAR_PRECIP_TYPE], g_var[VAR_LIGHTS_LOW], g_var[VAR_BLINKER_L],
      g_var[VAR_BLINKER_R], g_var[VAR_BRAKELIGHT], g_var[VAR_ENGINE_ON],
      g_var[VAR_BUSSTOP_INDEX],
      g_maxBrake, g_maxAccel, g_topSpeed, g_harshBrakes, g_harshAccels,
      g_str[STR_BUSSTOP], g_str[STR_DELAY_MIN], g_str[STR_DELAY_SEC],
      g_str[STR_LINE], g_str[STR_TERMINUS], g_str[STR_MATRIX]);
  if (length <= 0) return;

  HANDLE file = CreateFileW(g_temp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return;
  DWORD written = 0;
  WriteFile(file, body, (DWORD)length, &written, NULL);
  CloseHandle(file);
  MoveFileExW(g_temp, g_path, MOVEFILE_REPLACE_EXISTING);
}

/* Wordt na de laatste variabele van een beeld aangeroepen. */
static void maybe_flush(void) {
  ULONGLONG now = GetTickCount64();
  if (!g_ready || now - g_lastWrite < WRITE_INTERVAL_MS) return;
  g_lastWrite = now;
  flush_state(1);
}

__declspec(dllexport) void __stdcall PluginStart(void *owner) {
  (void)owner;

  wchar_t base[MAX_PATH];
  DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", base, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) return;

  _snwprintf_s(g_path, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career", base);
  CreateDirectoryW(g_path, NULL);
  _snwprintf_s(g_temp, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\live.tmp", base);
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
  g_brakeHeld = g_accelHeld = 0;
  g_brakeCounted = g_accelCounted = 0;
  QueryPerformanceFrequency(&g_freq);
  g_ready = 1;
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
}

__declspec(dllexport) void __stdcall AccessSystemVariable(unsigned short index,
                                                         float *value,
                                                         bool *write) {
  (void)write;
  if (!value || index >= SYS_COUNT) return;
  g_sys[index] = *value;
  /* Systeemvariabelen bestaan altijd, dus hier is wegschrijven gegarandeerd. */
  if (index == SYS_COUNT - 1) maybe_flush();
}

__declspec(dllexport) void __stdcall AccessVariable(unsigned short index,
                                                    float *value, bool *write) {
  (void)write;
  if (!value || index >= VAR_COUNT) return;
  g_var[index] = *value;
  g_seen |= (1u << index);

  if (index == VAR_VELOCITY) track_driving((double)*value);
  /*
   * Wegschrijven na de laatste variabele die OMSI zelf in elk voertuig bijhoudt.
   * De per-busvariabelen daarachter ontbreken op veel modellen; die als sein
   * gebruiken zou betekenen dat er op zo'n bus nooit iets wordt geschreven.
   */
  if (index == VAR_PRECIP_TYPE) maybe_flush();
}

__declspec(dllexport) void __stdcall AccessStringVariable(unsigned short index,
                                                          void **value, bool *write) {
  (void)write;
  if (!value || index >= STR_COUNT) return;
  g_seenStr |= (1u << index);
  copy_string(index, *value);
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
  (void)instance;
  (void)reserved;
  if (reason == DLL_PROCESS_DETACH && g_ready) PluginFinalize();
  return TRUE;
}
