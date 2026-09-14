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

/* Boven deze vertraging telt het als hard remmen, in meter per seconde kwadraat. */
#define HARSH_BRAKE 2.5
/* En hierboven als hard optrekken. */
#define HARSH_ACCEL 1.6
/* Kortere sprongen dan dit zijn ruis of een gepauzeerd spel. */
#define MIN_STEP_S 0.01
#define MAX_STEP_S 0.5

static float g_sys[SYS_COUNT];
static float g_var[VAR_COUNT];
static unsigned int g_seen; /* bit per varindex die OMSI werkelijk aanriep */
static wchar_t g_str[STR_COUNT][STR_MAX];

static wchar_t g_path[MAX_PATH];
static wchar_t g_temp[MAX_PATH];
static ULONGLONG g_lastWrite;
static int g_ready;

/* Rijstijl: opgeteld over de sessie, de app trekt het begin van het eind af. */
static double g_prevSpeed;      /* m/s */
static LARGE_INTEGER g_prevTick;
static LARGE_INTEGER g_freq;
static double g_maxBrake;       /* sterkste vertraging, m/s^2 */
static double g_maxAccel;
static double g_topSpeed;       /* km/h */
static int g_harshBrakes;
static int g_harshAccels;

/* Kopieert een OMSI-string veilig. Een lege of onleesbare waarde wordt leeg. */
static void copy_string(int slot, const wchar_t *source) {
  if (slot < 0 || slot >= STR_COUNT) return;
  if (!source) {
    g_str[slot][0] = 0;
    return;
  }
  __try {
    size_t i = 0;
    while (i < STR_MAX - 1 && source[i]) {
      wchar_t c = source[i];
      /* Aanhalingstekens en stuurtekens zouden de JSON breken. */
      g_str[slot][i] = (c == L'"' || c == L'\\' || c < 32) ? L' ' : c;
      i++;
    }
    g_str[slot][i] = 0;
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

  if (g_prevTick.QuadPart != 0 && g_freq.QuadPart != 0) {
    const double step = (double)(now.QuadPart - g_prevTick.QuadPart) / (double)g_freq.QuadPart;
    if (step >= MIN_STEP_S && step <= MAX_STEP_S) {
      const double a = (speed - g_prevSpeed) / step;
      if (a < 0) {
        const double brake = -a;
        if (brake > g_maxBrake) g_maxBrake = brake;
        if (brake > HARSH_BRAKE) g_harshBrakes++;
      } else {
        if (a > g_maxAccel) g_maxAccel = a;
        if (a > HARSH_ACCEL) g_harshAccels++;
      }
    }
  }
  g_prevTick = now;
  g_prevSpeed = speed;
}

/* Schrijft de verzamelde waarden weg, via een tijdelijk bestand zodat de lezer
 * nooit een half bestand ziet. */
static void flush_state(void) {
  char body[3072];
  char text[STR_COUNT][STR_MAX * 3];
  int i;

  for (i = 0; i < STR_COUNT; i++) {
    if (!WideCharToMultiByte(CP_UTF8, 0, g_str[i], -1, text[i], sizeof(text[i]), NULL, NULL)) {
      text[i][0] = 0;
    }
  }

  int length = _snprintf_s(
      body, sizeof(body), _TRUNCATE,
      "{\"alive\":true,\"seen\":%u,"
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
      g_seen,
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
      text[STR_BUSSTOP], text[STR_DELAY_MIN], text[STR_DELAY_SEC],
      text[STR_LINE], text[STR_TERMINUS], text[STR_MATRIX]);
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
  flush_state();
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
  g_lastWrite = 0;
  g_prevSpeed = 0;
  g_prevTick.QuadPart = 0;
  g_maxBrake = g_maxAccel = g_topSpeed = 0;
  g_harshBrakes = g_harshAccels = 0;
  QueryPerformanceFrequency(&g_freq);
  g_ready = 1;
}

__declspec(dllexport) void __stdcall PluginFinalize(void) {
  if (!g_ready) return;
  g_ready = 0;
  DeleteFileW(g_path);
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
                                                          wchar_t **value,
                                                          bool *write) {
  (void)write;
  if (!value || index >= STR_COUNT) return;
  copy_string(index, *value);
}

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID reserved) {
  (void)instance;
  (void)reserved;
  if (reason == DLL_PROCESS_DETACH && g_ready) PluginFinalize();
  return TRUE;
}
