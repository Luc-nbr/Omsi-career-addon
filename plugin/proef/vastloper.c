/*
 * Een programma dat vastloopt, om de wacht over OMSI na te meten.
 *
 * WAAROM
 * De app merkt een vastgelopen OMSI aan een venster dat niet meer op berichten
 * reageert (Process.Responding) en leest welke overlays erin zitten. Dat is niet
 * na te meten op het echte spel zonder het te laten hangen, en dat doen we de
 * speler niet aan. Dit programma doet na wat OMSI dan doet: het opent een
 * venster, laadt de DLL's die je meegeeft (bijvoorbeeld een kopie van een DLL
 * onder de naam DiscordHook.dll, zodat de herkenning iets te vinden heeft),
 * verwerkt een paar seconden berichten en houdt daarna op.
 *
 *   vastloper.exe [seconden-levend] [pad\naar\een.dll ...]
 *
 * Draait het onder zijn eigen naam; de app kijkt er alleen naar als de
 * omgevingsvariabele OMSI_ENHANCER_PROEFPROCES op "vastloper" staat.
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

static LRESULT CALLBACK venster(HWND h, UINT bericht, WPARAM w, LPARAM l) {
  if (bericht == WM_DESTROY) {
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProcA(h, bericht, w, l);
}

int main(int argc, char **argv) {
  const int levend = argc > 1 ? atoi(argv[1]) : 3;
  for (int i = 2; i < argc; i++) {
    HMODULE dll = LoadLibraryA(argv[i]);
    printf("geladen %s: %s\n", argv[i], dll ? "ja" : "nee");
  }

  WNDCLASSA soort = {0};
  soort.lpfnWndProc = venster;
  soort.hInstance = GetModuleHandleA(NULL);
  soort.lpszClassName = "OmsiEnhancerVastloper";
  RegisterClassA(&soort);
  /* Klein en in de hoek: het hoeft er alleen te zijn, niet in de weg te staan. */
  HWND h = CreateWindowA("OmsiEnhancerVastloper", "OMSI Enhancer - proef: vastloper",
                         WS_OVERLAPPEDWINDOW, 0, 0, 240, 120, NULL, NULL, soort.hInstance, NULL);
  ShowWindow(h, SW_SHOWNOACTIVATE);
  printf("venster open, %d s levend, dan vast\n", levend);
  fflush(stdout);

  DWORD einde = GetTickCount() + (DWORD)levend * 1000;
  MSG bericht;
  while (GetTickCount() < einde) {
    while (PeekMessageA(&bericht, NULL, 0, 0, PM_REMOVE)) {
      TranslateMessage(&bericht);
      DispatchMessageA(&bericht);
    }
    Sleep(20);
  }
  /* Nu vast: geen berichten meer, zoals OMSI na "Direct3D-Device lost!". */
  Sleep(INFINITE);
  return 0;
}
