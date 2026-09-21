/*
 * Een nagebootste OMSI: laadt de plugin en roept hem aan zoals het spel dat doet.
 *
 * WAAROM
 * Op 21-09 laadde OMSI de plugin, reed Luc een uur op Ahlheim, en bleef
 * live.json op 19-09 staan. Om dat uit te zoeken zonder het spel te starten,
 * doet dit programma na wat OMSI doet: PluginStart, dan elk beeld de
 * systeemvariabelen, de voertuigvariabelen en de tekstvariabelen, en aan het
 * eind PluginFinalize -- of, zoals een spel dat hangt en wordt afgeschoten,
 * helemaal niets.
 *
 * Draai hem met LOCALAPPDATA op een eigen map, anders schrijft de plugin in
 * dezelfde live.json die de app van de speler leest:
 *
 *   set LOCALAPPDATA=%TEMP%\omsi-proef
 *   gastheer.exe pad\naar\OMSICareerPlugin.dll [voertuig|zonder] [netjes|dll|niets] [zwaar]
 *
 * `zonder` bootst na dat er geen bus bestuurd wordt: alleen de
 * systeemvariabelen. Het tweede woord zegt hoe het spel afsluit: netjes met
 * PluginFinalize, alleen met FreeLibrary (DllMain), of helemaal niet.
 */
#include <windows.h>
#include <stdio.h>
#include <string.h>

typedef void(__stdcall *Start)(void *);
typedef void(__stdcall *Einde)(void);
typedef void(__stdcall *Waarde)(unsigned short, float *, BOOL *);
typedef void(__stdcall *Tekst)(unsigned short, void **, BOOL *);

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "gebruik: gastheer.exe plugin.dll [voertuig|zonder] [netjes|dll|niets] [zwaar]\n");
    return 2;
  }
  const int metVoertuig = argc < 3 || strcmp(argv[2], "zonder") != 0;
  const char *einde = argc >= 4 ? argv[3] : "netjes";
  /*
   * `zwaar`: de grootste berichten die OMSI kan veroorzaken. Teksten van 95
   * tekens die elk drie bytes UTF-8 worden, en getallen zo groot als een float
   * toelaat -- een busscript kan een variabele op zo'n waarde laten staan.
   */
  const int zwaar = argc >= 5 && strcmp(argv[4], "zwaar") == 0;

  HMODULE dll = LoadLibraryA(argv[1]);
  if (!dll) {
    fprintf(stderr, "laden mislukt: %lu\n", GetLastError());
    return 1;
  }
  Start start = (Start)GetProcAddress(dll, "PluginStart");
  Einde finalize = (Einde)GetProcAddress(dll, "PluginFinalize");
  Waarde sys = (Waarde)GetProcAddress(dll, "AccessSystemVariable");
  Waarde var = (Waarde)GetProcAddress(dll, "AccessVariable");
  Tekst str = (Tekst)GetProcAddress(dll, "AccessStringVariable");
  printf("exports: start=%d finalize=%d sys=%d var=%d str=%d\n", start != NULL, finalize != NULL,
         sys != NULL, var != NULL, str != NULL);
  if (!start || !sys || !var) return 1;

  start(NULL);

  /* Een tekst zoals Delphi hem geeft: UTF-16 met de lengte ervoor. */
  static struct {
    int refs;
    int lengte;
    wchar_t tekens[16];
  } halte = {-1, 5, L"Markt"};
  static struct {
    int refs;
    int lengte;
    wchar_t tekens[96];
  } lang;
  lang.refs = -1;
  lang.lengte = 95;
  for (int i = 0; i < 95; i++) lang.tekens[i] = 0x20AC; /* het euroteken: drie bytes in UTF-8 */
  lang.tekens[95] = 0;
  void *tekst = zwaar ? (void *)lang.tekens : (void *)halte.tekens;
  BOOL schrijven = FALSE;

  /* Twee seconden aan beelden, vijftig per seconde. */
  for (int beeld = 0; beeld < 100; beeld++) {
    for (unsigned short i = 0; i < 8; i++) {
      float waarde = zwaar && i >= 4 ? 3.0e38f : (float)(i == 0 ? 36000 + beeld : i);
      sys(i, &waarde, &schrijven);
    }
    if (metVoertuig) {
      for (unsigned short i = 0; i < 24; i++) {
        float waarde = zwaar ? (i == 0 ? 3.0e38f : -3.0e38f) : (i == 0 ? (float)(beeld % 50) : (float)i);
        var(i, &waarde, &schrijven);
      }
      if (str)
        for (unsigned short i = 0; i < 6; i++) str(i, &tekst, &schrijven);
    }
    Sleep(20);
  }

  if (strcmp(einde, "netjes") == 0 && finalize) finalize();
  if (strcmp(einde, "niets") == 0) {
    /* Zoals een vastgelopen spel dat wordt afgeschoten: geen afscheid. */
    TerminateProcess(GetCurrentProcess(), 0);
  }
  FreeLibrary(dll);
  printf("klaar (%s, %s)\n", metVoertuig ? "voertuig" : "zonder voertuig", einde);
  return 0;
}
