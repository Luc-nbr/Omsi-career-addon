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
#include <stdio.h>
#include <string.h>

/* Volgorde gelijk aan [systemvarlist] in de .opl. */
enum { SYS_TIME = 0, SYS_DAY, SYS_MONTH, SYS_YEAR, SYS_COUNT };

/* Volgorde gelijk aan [varlist]. */
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

static float g_sys[SYS_COUNT];
static float g_var[VAR_COUNT];
static wchar_t g_str[STR_COUNT][STR_MAX];

static wchar_t g_path[MAX_PATH];
static wchar_t g_temp[MAX_PATH];
static ULONGLONG g_lastWrite;
static int g_ready;

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

/* Schrijft de verzamelde waarden weg, via een tijdelijk bestand zodat de lezer
 * nooit een half bestand ziet. */
static void flush_state(void) {
  char body[2048];
  char stops[STR_COUNT][STR_MAX * 3];
  int i;

  for (i = 0; i < STR_COUNT; i++) {
    if (!WideCharToMultiByte(CP_UTF8, 0, g_str[i], -1, stops[i], sizeof(stops[i]), NULL, NULL)) {
      stops[i][0] = 0;
    }
  }

  int length = _snprintf_s(
      body, sizeof(body), _TRUNCATE,
      "{\"alive\":true,"
      "\"time\":%.3f,\"day\":%.0f,\"month\":%.0f,\"year\":%.0f,"
      "\"velocity\":%.2f,\"passengers\":%.0f,\"scheduleActive\":%.0f,"
      "\"targetIndex\":%.0f,\"tankPercent\":%.3f,\"km\":%.0f,\"metres\":%.1f,"
      "\"entryRequest\":%.0f,\"exitRequest\":%.0f,\"ticket\":%.0f,"
      "\"busstop\":\"%s\",\"delayMin\":\"%s\",\"delaySec\":\"%s\","
      "\"line\":\"%s\",\"terminus\":\"%s\",\"matrix\":\"%s\"}",
      g_sys[SYS_TIME], g_sys[SYS_DAY], g_sys[SYS_MONTH], g_sys[SYS_YEAR],
      g_var[VAR_VELOCITY], g_var[VAR_HUMANS], g_var[VAR_SCHEDULE_ACTIVE],
      g_var[VAR_TARGET_INDEX], g_var[VAR_TANK], g_var[VAR_KM], g_var[VAR_M],
      g_var[VAR_ENTRY_REQ], g_var[VAR_EXIT_REQ], g_var[VAR_TICKET],
      stops[STR_BUSSTOP], stops[STR_DELAY_MIN], stops[STR_DELAY_SEC],
      stops[STR_LINE], stops[STR_TERMINUS], stops[STR_MATRIX]);
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
  g_lastWrite = 0;
  g_ready = 1;
}

__declspec(dllexport) void __stdcall PluginFinalize(void) {
  if (!g_ready) return;
  g_ready = 0;
  /* Een laatste schrijfbeurt met alive=false zou de overlay laten weten dat het
   * spel weg is; eenvoudiger is het bestand weghalen. */
  DeleteFileW(g_path);
}

__declspec(dllexport) void __stdcall AccessSystemVariable(unsigned short index,
                                                         float *value,
                                                         bool *write) {
  (void)write;
  if (!value || index >= SYS_COUNT) return;
  g_sys[index] = *value;
}

__declspec(dllexport) void __stdcall AccessVariable(unsigned short index,
                                                    float *value, bool *write) {
  (void)write;
  if (!value || index >= VAR_COUNT) return;
  g_var[index] = *value;
  /* De laatste variabele van de lijst sluit het beeld af. */
  if (index == VAR_COUNT - 1) maybe_flush();
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
