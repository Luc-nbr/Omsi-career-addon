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
  /* De twee regels van de AFR 200, de kaartautomaat in de Thueringer Wald-bus. */
  STR_AFR1,
  STR_AFR2,
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
 * 5  de AFR 200 erbij, en opdrachten die niet aan een oplopend nummer hangen
 * 6  de eigen stringvariabelen van de bus, met naam, rechtstreeks uit het geheugen
 * 7  de lijst met mensen goed gelezen, en daarmee eindelijk de kaartverkoop
 * 8  in schermen.json ook wat er met de laatste opdracht gebeurd is
 * 9  de toets lang genoeg ingedrukt houden, en de uitgebreide toetsen goed
 * 10 sneller kijken of de app iets vraagt: dertig keer per seconde in plaats van vijf
 * 11 geen opdracht van de vorige sessie meer uitvoeren bij het opstarten
 * 12 honderdzestig namen in plaats van vierenzestig, en geen NaN in het bericht
 * 13 de getalvariabelen en per mesh wat OMSI toont, rechtstreeks uit het geheugen
 */
#define PLUGIN_VERSIE 13

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

/*
 * DE EIGEN VARIABELEN VAN DE BUS
 *
 * Elk schermpje in een bus -- de IBIS, de kaartautomaat, de thermometer -- is in
 * OMSI een stukje textuur waar het spel tekst op tekent. Welke tekst dat is,
 * staat in een stringvariabele van het busscript, en welke variabele bij welk
 * schermpje hoort staat in de model.cfg van de bus, in een `[texttexture]`.
 *
 * Langs de plugin-API zijn die variabelen alleen te lezen als hun naam al bij
 * het starten van OMSI in de .opl stond. Dat betekent voor elke nieuwe bus een
 * nieuwe .opl en het spel opnieuw op. In het geheugen draagt de bus zijn eigen
 * namenlijst bij zich, en dan hoeft dat niet:
 *
 *   voertuig + 0x210 -> TComplMapObj, het bestandsobject van dit bustype
 *                       + 0x1f0 -> de NAMEN van de stringvariabelen
 *   voertuig + 0x214 -> TComplObjInst, dit exemplaar
 *                       + 0x2c  -> de WAARDEN, in dezelfde volgorde
 *
 * Allebei zijn het Delphi-arrays: op het adres staat een wijzer naar het eerste
 * element, en vier bytes voor dat eerste element staat hoeveel elementen er
 * zijn. Elk element is zelf een wijzer naar een string. OmsiHook doet het net
 * zo; zie Memory.ReadMemoryStringArray en OmsiComplMapObjInst.GetStringVariable
 * in github.com/space928/Omsi-Extensions.
 *
 * De app zegt in `vragen.txt` welke namen ze wil zien -- die haalt ze uit de
 * model.cfg van de bus die rijdt -- en die zet de plugin in live.json. De hele
 * lijst gaat hooguit eens per twee seconden naar `schermen.json`; zo hoeft
 * live.json niet tien keer per seconde tien kilobyte groot te zijn.
 */
#define OFS_COMPL_MAPOBJ 0x210  /* TComplMapObj: het bestandsobject van dit bustype */
#define OFS_COMPL_INST 0x214    /* TComplObjInst: dit exemplaar in de wereld */
#define OFS_CMO_BESTAND 0x4     /* het .bus-bestand zelf; TFileObject erft dit */
#define OFS_CMO_NAAM 0x19c      /* hoe de bus zichzelf noemt */
#define OFS_CMO_MODEL 0x1a4     /* het pad naar de model.cfg, vanaf de busmap */
#define OFS_CMO_PAD 0x1a8       /* de map van de bus */
#define OFS_CMO_STRNAMEN 0x1f0  /* de namen van de stringvariabelen */
#define OFS_COI_STRWAARDEN 0x2c /* de waarden, in dezelfde volgorde */
/*
 * Een gelede bus of een aanhanger deelt het script met het voertuig ervoor: de
 * stringvariabelen staan dan bij dat exemplaar en niet bij dit. Staat hier een
 * wijzer, dan is dat het exemplaar dat het script draait.
 */
#define OFS_CMOI_SCRIPTOUDER 0x240

/*
 * DE GETALVARIABELEN VAN DE BUS
 *
 * Naast tekst houdt een busscript vooral getallen bij: welk menu de ALMEX
 * toont (almex_menu), of hij aanstaat (almex_ein), welke regel oplicht. Daaraan
 * hangt in de model.cfg wat er te zien is, en bij een `[matl_change]` welk
 * plaatje. Wie het apparaat na wil tekenen, moet ze dus kennen.
 *
 * Ze staan naast de stringvariabelen, met een wijzer meer:
 *
 *   voertuig + 0x210 -> TComplMapObj
 *                       + 0x1ec -> de NAMEN (Delphi-array van strings)
 *   voertuig + 0x214 -> TComplObjInst
 *                       + 0x28  -> wijzer naar de Delphi-array met de WAARDEN;
 *                                  elk element is een wijzer naar een float (Single)
 *
 * Dezelfde wijzer staat op voertuig + 0x23c; gemeten wijzen ze allebei naar
 * voertuig + 0x238. De plugin neemt eerst die van het exemplaar, want daar
 * leest OMSI's eigen zichtbaarheidscode hem (omsi.exe VA 0x5fcf4f), en valt
 * pas daarna terug op die van het voertuig.
 *
 * Wijzers, omdat niet alles in een lijst staat: de namen die OMSI zelf in elk
 * voertuig bijhoudt (Velocity, ...) wijzen in het voertuig, de rest naar de
 * eigen getallen van het script. Het script leest en schrijft via deze
 * wijzers, dus wat hier staat is precies wat het spel gebruikt.
 *
 * Gemeten in OMSI 2.3.004 op 26-09-2026: de lijst begint met 138 namen van OMSI
 * zelf (Refresh_Strings tot en met wearlifespan) en daarna, regel voor regel,
 * de varlist-bestanden uit [varnamelist] van de .bus. Een lege regel is een
 * lege naam (nil). Zo in de Hamburgse elektrobus: 1699 namen, almex_menu op
 * plek 1449 met 6.0 als de ALMEX menu 6 toont. Hoe breed een naam is (1 of 2
 * bytes per teken) staat in zijn eigen kop; zie lees_omsi_tekst. Zie ook
 * OmsiComplMapObj.VarStrings en OmsiComplObjInst in
 * github.com/space928/Omsi-Extensions.
 */
#define OFS_CMO_GETALNAMEN 0x1ec
#define OFS_COI_GETALWAARDEN 0x28
#define OFS_CMOI_GETALWAARDEN 0x23c /* de terugval, als het exemplaar niets heeft */
/*
 * Zoveel getalvariabelen mag de app vragen. De Citybus O530 van Kajosoft
 * (model_o530_e2_3.cfg) gebruikt er in zijn eentje 293 in een [visible], en
 * dan komen [matl_change] en [matl_lightmap] er nog bij; 256 was te krap.
 */
#define GETALLEN_MAX 512
/* Een bus heeft er een paar duizend (de grootste 2580); daarboven is het geen namenlijst. */
#define GETAL_NAMEN_GRENS 20000
/* Plekken in de tabel waarin de gevraagde namen opgezocht worden: minstens twee keer GETALLEN_MAX. */
#define GETAL_HASH 1024

/*
 * WAT OMSI ZELF TOONT
 *
 * Een [mesh] in de model.cfg kan een voorwaarde hebben, `[visible] almex_menu
 * 6`. OMSI rekent die bij elk beeld zelf uit en zet de uitkomst per mesh in een
 * byte. Die byte lezen is precies wat het spel tekent, voor elke bus: de app
 * hoeft de regels van OMSI dan niet na te bouwen -- een naam die de bus niet
 * kent is altijd zichtbaar, afronden gaat bij .5 naar even, sommige namen
 * staan twee keer in de varlists.
 *
 *   voertuig + 0x214 -> TComplObjInst
 *                       + 0x20 -> TComplObj, het model
 *                                 + 0x38 -> TList van TAnimSubMesh, een per mesh:
 *                                           + 0x17c het o3d-bestand (string)
 *                                           + 0x1a4 plek van de variabele, -1 = geen
 *                                           + 0x1a8 de waarde uit [visible] (int)
 *                       + 0xe0 -> TList van TAnimSubMeshInst, in dezelfde volgorde:
 *                                 + 0xd0 byte: 1 = OMSI toont hem
 *
 * Een TList heeft zijn elementen op +4 en het aantal op +8. OMSI's regel
 * (omsi.exe VA 0x5fcf01-0x5fcfbb): zichtbaar als er geen variabele is, als de
 * plek buiten de lijst valt, of als Round(waarde) gelijk is aan het doel.
 * Gemeten in de Hamburgse elektrobus: 608 meshes en 608 exemplaren, en bij
 * almex_menu 6 staat alleen 17_almex_screen_6 op 1, alle andere schermen van
 * de ALMEX op 0. model_21_main.cfg heeft 621 [mesh]-regels, waarvan 13 met een
 * o3d die niet bestaat: OMSI slaat die over, en dan blijven er 608. Welke plek
 * welke mesh is, zet de plugin in meshes.json, zodat de app het na kan kijken.
 */
#define OFS_COI_COMPLOBJ 0x20
#define OFS_CO_MESHES 0x38
#define OFS_COI_MESHINSTS 0xe0
#define OFS_MESH_O3D 0x17c
#define OFS_MESH_VAR 0x1a4
#define OFS_MESH_DOEL 0x1a8
#define OFS_INST_ZICHTBAAR 0xd0
/* Het grootste model in Vehicles heeft 1195 [mesh]-regels. */
#define MESHES_MAX 4096

/* Hooguit zoveel namen vraagt de app op; zo veel tekens mogen naam en waarde zijn. */
/*
 * Zoveel namen mag de app vragen. Het stond op 64, en dat was te weinig: een
 * ALMEX in een Hamburgse bus heeft in zijn eentje al tweeentwintig schermpjes,
 * en met de kaartnamen en een tweede apparaat erbij viel de rest eraf -- die
 * schermpjes bleven dan zwart zonder dat ergens te zien was waarom.
 */
#define VRAGEN_MAX 160
#define NAMEN_MAX 512
#define SCHERM_NAAM_MAX 64
/*
 * Zoveel bytes mag een waarde zijn, als JSON-tekst in UTF-8 (zie json_tekst).
 * Het waren 127 tekens, en dat sneed de meerregelige bon van de MAN NLC af: de
 * telefoon kreeg er maar een deel van. Nu past er 511 bytes in -- 511 gewone
 * tekens, of 255 met een accent -- en live.json blijft ruim binnen zijn buffer
 * (zie flush_state).
 */
#define SCHERM_WAARDE_MAX 512
/* Langer dan dit is geen tekst uit een bus maar een verkeerd adres. */
#define OMSI_TEKST_GRENS 65536

typedef struct {
  int ok;             /* 1 als het voertuig van de speler gevonden is */
  int kachel;
  float pos[3];
  float rot[4];
  int schedLine, schedTour, schedTourEntry, schedTrip, schedNextIndex, schedDelay;
  /* De kaartverkoop: -1 in `koper` betekent dat er niemand staat te betalen. */
  int koper, ticketSoort, ticketIndex, ticketSlecht, ticketKlaar;
  /** Hoeveel mensen OMSI in de wereld heeft; nul betekent: lijst niet gevonden. */
  int mensen;
  float ticketPrijs, ticketGegeven;
  float schedActive, schedNextDist;
  char lineName[STR_MAX * 3], tourName[STR_MAX * 3], tripName[STR_MAX * 3], nextStop[STR_MAX * 3];
} MemState;

static MemState g_mem;

/*
 * De stringvariabelen van de bus; zie de uitleg bij OFS_COMPL_MAPOBJ.
 *
 * De namenlijst hoort bij het bustype en verandert dus alleen als je in een
 * andere bus stapt. Daarom wordt hij een keer overgeschreven -- herkenbaar aan
 * het adres waar hij staat -- en daarna hoeft er per beeld alleen nog gekeken
 * te worden op de plekken die de app gevraagd heeft.
 */
static char g_vragen[VRAGEN_MAX][SCHERM_NAAM_MAX];
static int g_vragenAantal;
static int g_vragenVers; /* telt op bij elke nieuwe vragenlijst */
static ULONGLONG g_vragenGekeken;
static DWORD g_namenBron;   /* het adres waarvan de namenlijst gelezen is */
static int g_namenVers;     /* welke vragenlijst er in g_vraagIndex verwerkt zit */
static char g_namen[NAMEN_MAX][SCHERM_NAAM_MAX];
static int g_namenAantal;
static int g_vraagIndex[VRAGEN_MAX]; /* -1 = deze bus kent die naam niet */
/*
 * 1 als lees_busvars in dit beeld de waarden las. Zonder dit bleef g_vraagIndex
 * staan zoals hij was -- nullen bij de start, of de plekken van de vorige bus
 * -- en dan stond in een bus zonder stringvariabelen elke gevraagde naam in
 * "vars", met een lege tekst, alsof de bus hem kende.
 */
static int g_varsGelezen;
static char g_varWaarde[VRAGEN_MAX][SCHERM_WAARDE_MAX];
static char g_busNaam[SCHERM_WAARDE_MAX];
static char g_busBestand[512];
static char g_busModel[SCHERM_WAARDE_MAX];
static char g_busPad[512];
static ULONGLONG g_schermenGeschreven;
/* De hele lijst, klaar om als schermen.json weggeschreven te worden. */
/*
 * Ruim bemeten: een waarde mag sinds plugin 13 512 bytes zijn, en een bus kan
 * honderden stringvariabelen hebben. Wat toch niet past valt eraf, en dan
 * staat er "afgekapt":true bij.
 */
#define DUMP_MAX 262144
static char g_dump[DUMP_MAX];
static int g_dumpLengte;

/* De getalvariabelen; zie OFS_CMO_GETALNAMEN. Zelfde opzet als de strings. */
static char g_getalVragen[GETALLEN_MAX][SCHERM_NAAM_MAX];
static int g_getalVragenAantal;
static int g_getalVragenVers;   /* telt op bij elke nieuwe lijst in getallen.txt */
static ULONGLONG g_getalVragenGekeken;
static DWORD g_getalNamenBron;  /* het adres van de namenlijst die opgezocht is */
static int g_getalNamenAantal;
static int g_getalNamenVers;    /* welke vragenlijst er in g_getalIndex verwerkt zit */
static DWORD g_getalGemeld;     /* welke namenlijst al in het logboek staat */
static int g_getalIndex[GETALLEN_MAX]; /* plek in de bus; -1 = deze bus kent die naam niet */
/* -1, of een eerdere vraag met dezelfde naam in andere letters: die heeft dezelfde plek. */
static int g_getalZelfde[GETALLEN_MAX];
static short g_getalHash[GETAL_HASH]; /* -1 = leeg, anders een plek in g_getalVragen */
static float g_getalWaarde[GETALLEN_MAX];
/*
 * Wat er van een gevraagde naam bekend is. NIET: niet gelezen (geen bus, of het
 * lezen liep mis). GEEN: de bus kent de naam, maar er staat geen getal (NaN,
 * oneindig, een lege wijzer). ONBEKEND: de bus kent de naam niet -- en dan is
 * een [visible] erop in OMSI altijd waar.
 */
enum { GETAL_NIET = 0, GETAL_GETAL, GETAL_GEEN, GETAL_ONBEKEND };
static unsigned char g_getalStaat[GETALLEN_MAX];
static int g_getalAantalBus;    /* hoeveel getalvariabelen de bus van de speler heeft */
/* De hele lijst, klaar om als getallen.json weggeschreven te worden. */
#define GETALLIJST_MAX 262144
static char g_getalDump[GETALLIJST_MAX];
static int g_getalDumpLengte;
static ULONGLONG g_getalDumpGemaakt;

/* Wat OMSI toont; zie OFS_COI_MESHINSTS. Per mesh '1' of '0', als tekst. */
static char g_zichtbaar[MESHES_MAX + 1];
static int g_meshAantal;        /* 0 = niet te lezen */
static DWORD g_meshBron;        /* het model waarvan meshes.json gemaakt is */
static int g_meshBronAantal;
/* En zoals live.json het model noemt: "model" in meshes.json moet daarmee kloppen. */
static char g_meshModel[SCHERM_WAARDE_MAX];
/* De meshlijst, klaar om als meshes.json weggeschreven te worden; > 0 = nog te doen. */
#define MESHLIJST_MAX 262144
static char g_meshDump[MESHLIJST_MAX];
static int g_meshDumpLengte;
static int g_meshSchrijfFout;   /* al gemeld dat meshes.json niet weg kon */
/*
 * 1 als meshes.json van dit model op schijf staat. Pas dan gaat "zichtbaar"
 * live.json in; zie flush_state.
 */
static int g_meshOpSchijf;

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
/* Waar de app zegt welke schermvariabelen ze wil, en waar de hele lijst heen gaat. */
static wchar_t g_vragenPad[MAX_PATH];
static wchar_t g_schermenPad[MAX_PATH];
static wchar_t g_schermenTemp[MAX_PATH];
/* Welke getalvariabelen de app wil, de hele lijst ervan, en welke mesh welke is. */
static wchar_t g_getallenPad[MAX_PATH];
static wchar_t g_getalLijstPad[MAX_PATH];
static wchar_t g_getalLijstTemp[MAX_PATH];
static wchar_t g_meshLijstPad[MAX_PATH];
static wchar_t g_meshLijstTemp[MAX_PATH];
static int g_opdrachtNr;    /* het laatst uitgevoerde nummer */
static int g_opdrachtScancode; /* en welke toets dat was */
static int g_opdrachtMod;
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
static int copy_omsi_string(char *doel, size_t ruimte, DWORD tekst);
static void lees_busvars(DWORD voertuig);
static void lees_busgetallen(DWORD voertuig);
static void lees_zichtbaarheid(DWORD voertuig);

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
/*
 * Een toets indrukken in OMSI.
 *
 * TWEE DINGEN DIE HIER MISGINGEN
 *
 * 1. Te kort. Eerst gingen indrukken en loslaten in een adem de deur uit: de
 *    toets stond microseconden aan. OMSI kijkt naar het toetsenbord bij elk
 *    beeld -- zestig keer per seconde, dus om de zestien milliseconden -- en
 *    tussen twee van die momenten door was de toets alweer los. Het spel heeft
 *    hem dus nooit gezien. Nu blijft hij staan tot een volgend beeld hem
 *    loslaat; zie `laat_toets_los`.
 *
 * 2. De toetsen van het numerieke blok. In `keyboard.cfg` staat Num Enter als
 *    156 en Num / als 181: dat zijn de "uitgebreide" toetsen, in Windows 0x1C
 *    en 0x35 met een vlag erbij. Wie 156 letterlijk als scancode afgeeft,
 *    stuurt een toets die niet bestaat -- en zo verdween AUSLÖSUNG, de
 *    belangrijkste knop van de kaartautomaat, in het niets.
 */
#define TOETS_MS 50 /* zo lang blijft hij staan: een paar beelden van OMSI */

static WORD g_toetsScan;
static int g_toetsMod;
static ULONGLONG g_toetsSinds;

/** Zet een toetsaanslag klaar; `omhoog` maakt er het loslaten van. */
static void vul_toets(INPUT *invoer, WORD scancode, int omhoog) {
  const int uitgebreid = scancode > 0x7f;
  invoer->type = INPUT_KEYBOARD;
  invoer->ki.wScan = (WORD)(uitgebreid ? (scancode & 0x7f) : scancode);
  invoer->ki.dwFlags = KEYEVENTF_SCANCODE | (uitgebreid ? KEYEVENTF_EXTENDEDKEY : 0) |
                       (omhoog ? KEYEVENTF_KEYUP : 0);
}

static void laat_toets_los(void) {
  if (!g_toetsScan) return;
  INPUT invoer[3];
  int n = 0;
  const WORD SHIFT = 0x2a, CTRL = 0x1d;
  memset(invoer, 0, sizeof(invoer));
  vul_toets(&invoer[n++], g_toetsScan, 1);
  if (g_toetsMod & 2) vul_toets(&invoer[n++], SHIFT, 1);
  if (g_toetsMod & 4) vul_toets(&invoer[n++], CTRL, 1);
  SendInput((UINT)n, invoer, sizeof(INPUT));
  g_toetsScan = 0;
}

static void druk_toets(WORD scancode, int modifiers) {
  /* Stond er nog een toets ingedrukt, dan eerst die los: niet twee tegelijk. */
  laat_toets_los();
  INPUT invoer[3];
  int n = 0;
  const WORD SHIFT = 0x2a, CTRL = 0x1d;
  memset(invoer, 0, sizeof(invoer));
  if (modifiers & 4) vul_toets(&invoer[n++], CTRL, 0);
  if (modifiers & 2) vul_toets(&invoer[n++], SHIFT, 0);
  vul_toets(&invoer[n++], scancode, 0);
  SendInput((UINT)n, invoer, sizeof(INPUT));
  g_toetsScan = scancode;
  g_toetsMod = modifiers;
  g_toetsSinds = GetTickCount64();
}

/** Bij elk beeld: staat er een toets lang genoeg ingedrukt, dan mag hij los. */
static void toets_bijhouden(void) {
  if (g_toetsScan && GetTickCount64() - g_toetsSinds >= TOETS_MS) laat_toets_los();
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
 * Kijken of de app iets gevraagd heeft.
 *
 * Dertig keer per seconde, ongeveer om het andere beeld. Het stond op vijf, en
 * dat was te merken: tussen een tik op de iPad en de toets in OMSI zat tot een
 * vijfde seconde niets dan wachten. Het is een bestandje van tien tekens --
 * openen, lezen, sluiten kost minder dan een honderdste van een beeld.
 */
#define OPDRACHT_INTERVAL_MS 33

static void lees_opdracht(void) {
  if (!g_opdrachtPad[0]) return;
  const ULONGLONG nu = GetTickCount64();
  if (nu - g_opdrachtGekeken < OPDRACHT_INTERVAL_MS) return;
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
  /*
   * Elk ander nummer telt, ook een lager. De app begint bij elke start weer bij
   * een; met "alleen hoger" bleef alles liggen zodra de app opnieuw startte
   * terwijl OMSI door bleef draaien -- en dan deed geen enkele knop nog iets.
   */
  if (nr == g_opdrachtNr || scancode <= 0 || scancode > 255) return;
  g_opdrachtNr = nr;
  /* Ook als het niet lukt: dan is van buiten te zien welke toets gevraagd werd. */
  g_opdrachtScancode = scancode;
  g_opdrachtMod = modifiers;
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
  /*
   * En de bus vergeten tot hij opnieuw gevonden is. Bleef dit staan, dan meldde
   * live.json tussen twee diensten door nog de vorige bus met zijn oude
   * schermteksten -- en dan stond er een apparaat in beeld van een bus waar je
   * niet meer in zat. `lees_busvars` vult het meteen weer als het klopt.
   */
  g_busNaam[0] = g_busModel[0] = g_busPad[0] = g_busBestand[0] = 0;
  for (int i = 0; i < VRAGEN_MAX; i++) g_varWaarde[i][0] = 0;
  g_varsGelezen = 0;
  /* De getallen en wat OMSI toont net zo: zonder bus "getallen":{} en "zichtbaar":"". */
  memset(g_getalStaat, 0, sizeof(g_getalStaat));
  g_getalAantalBus = 0;
  g_meshAantal = 0;
  g_zichtbaar[0] = 0;
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
      /*
       * Hoeveel voertuigen er in de lijst staan (TList.FCount). Tijdens het laden
       * wijst de index van de speler nog nergens heen, en dan zou er een adres uit
       * het niets gelezen worden.
       */
      const int aantalVoertuigen = plausible_ptr(inner) ? *(int *)(ULONG_PTR)(inner + 0x8) : 0;
      const int binnenLijst =
          aantalVoertuigen <= 0 || aantalVoertuigen > 100000 || playerIndex < aantalVoertuigen;
      const DWORD vehicle = plausible_ptr(items) && binnenLijst
                                ? *(DWORD *)(ULONG_PTR)(items + (DWORD)playerIndex * 4)
                                : 0;
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
            /*
             * De lijst met mensen zit ANDERS in elkaar dan die met voertuigen.
             * Bij de voertuigen staat er een TMyOMSIList met binnenin een TList
             * (+0x28, dan +0x4); de mensen staan in een gewoon Delphi-array van
             * wijzers: op het adres staat de wijzer naar het eerste element, en
             * vier bytes daarvoor hoeveel het er zijn. Hier stond de omweg van
             * de voertuiglijst, en dan wees `koper` naar rommel -- dat is de
             * reden dat de kaartverkoop nooit doorkwam, hoe vaak we ook keken.
             * Zie OmsiGlobals.Humans (ReadMemoryObjArray) in Omsi-Extensions.
             */
            const DWORD mensen = *(DWORD *)(ULONG_PTR)mem_addr(MEM_HUMANS);
            const int aantalMensen =
                plausible_ptr(mensen) ? *(int *)(ULONG_PTR)(mensen - 4) : 0;
            next.mensen = aantalMensen;
            const DWORD human =
                aantalMensen > 0 && aantalMensen < 1000000 && next.koper < aantalMensen
                    ? *(DWORD *)(ULONG_PTR)(mensen + (DWORD)next.koper * 4)
                    : 0;
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

          /*
           * En wat de bus zelf aan tekst bijhoudt: zijn schermpjes, de namen op
           * de kaartautomaat, wat er ingetoetst staat. Zie `lees_busvars`.
           */
          lees_busvars(vehicle);
          /*
           * En de getallen, en wat OMSI van de bus toont. Los van de tekst, want
           * een bus zonder stringvariabelen heeft ze evengoed; en elk met een
           * eigen __try, zodat een fout daar niet de positie, de dienstregeling
           * en de kaartverkoop hierboven meeneemt (mem.ok blijft 1).
           */
          lees_busgetallen(vehicle);
          lees_zichtbaarheid(vehicle);

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
/*
 * Lijkt dit op tekst?
 *
 * Niet elke naam in de lijst bestaat in elke bus, en wat OMSI dan doorgeeft is
 * geen string maar wat er toevallig op dat adres staat. Op het scherm van de
 * speler werd dat een regel als "eefxye2Gxy3O...": onleesbaar, en erger dan
 * niets. Tekst uit een bus is grotendeels gewone leestekens; is minder dan
 * driekwart dat, dan is het geen tekst en houdt de plugin het leeg.
 */
static int lijkt_op_tekst(const char *tekst) {
  int goed = 0, totaal = 0;
  for (const unsigned char *p = (const unsigned char *)tekst; *p; p++) {
    totaal++;
    if (*p == ' ' || (*p >= 0x20 && *p < 0x7f)) goed++;
    if (totaal > 400) break;
  }
  if (totaal == 0) return 1;
  return goed * 4 >= totaal * 3;
}

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
      /* Geen tekst? Dan hoort er niets te staan; zie `lijkt_op_tekst`. */
      if (!lijkt_op_tekst(a)) return;
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
 * Tekst als JSON-string, in UTF-8.
 *
 * Wat de plugin uit het geheugen leest, gaat letterlijk live.json in. Tot
 * plugin 12 werd een " daarom een spatie, een \ een schuine streep en een
 * teken onder de 32 een spatie. Maar een font van OMSI kan een " of een \ als
 * teken hebben, en een teken onder de 32 tekent OMSI als teken 0 van het font:
 * wie het scherm exact natekent, moet weten wat er werkelijk staat. Nu gaat
 * het zoals JSON het wil: \" \\ en \u00XX. Een halve UTF-16-reeks (D800-DFFF)
 * gaat als \uXXXX, zodat JavaScript precies dezelfde tekens terugkrijgt, ook
 * als hij los staat.
 *
 * `schuin`: een backslash wordt een schuine streep, zoals vroeger. Alleen voor
 * de map, het model en het bestand van de bus: de app onthoudt de gekozen
 * apparaten per bus onder het pad zoals plugin 12 het gaf ("c:/omsi 2/...";
 * zie busSleutel in main/index.ts), en Windows neemt een / net zo lief.
 *
 * Past niet alles in `ruimte`, dan stopt hij na het laatste hele teken --
 * nooit halverwege een escape of een UTF-8-reeks, want dan brak de JSON -- en
 * geeft hij 0. Paste alles: 1.
 */
static int json_tekst(char *doel, size_t ruimte, const wchar_t *bron, int aantal, int schuin) {
  static const char hex[] = "0123456789abcdef";
  if (ruimte == 0) return 0;
  size_t p = 0;
  for (int i = 0; i < aantal; i++) {
    const unsigned int c = bron[i];
    char stuk[6];
    size_t n = 0;
    if (c == '"' || (c == '\\' && !schuin)) {
      stuk[n++] = '\\';
      stuk[n++] = (char)c;
    } else if (c == '\\') {
      stuk[n++] = '/';
    } else if (c < 0x20 || (c >= 0xd800 && c <= 0xdfff)) {
      stuk[n++] = '\\';
      stuk[n++] = 'u';
      stuk[n++] = hex[(c >> 12) & 0xf];
      stuk[n++] = hex[(c >> 8) & 0xf];
      stuk[n++] = hex[(c >> 4) & 0xf];
      stuk[n++] = hex[c & 0xf];
    } else if (c < 0x80) {
      stuk[n++] = (char)c;
    } else if (c < 0x800) {
      stuk[n++] = (char)(0xc0 | (c >> 6));
      stuk[n++] = (char)(0x80 | (c & 0x3f));
    } else {
      stuk[n++] = (char)(0xe0 | (c >> 12));
      stuk[n++] = (char)(0x80 | ((c >> 6) & 0x3f));
      stuk[n++] = (char)(0x80 | (c & 0x3f));
    }
    /* Een paar (hoog en laag) hoort bij elkaar: allebei erin of geen van beide. */
    const int paar = c >= 0xd800 && c <= 0xdbff && i + 1 < aantal && bron[i + 1] >= 0xdc00 &&
                     bron[i + 1] <= 0xdfff;
    if (p + n + (paar ? 6 : 0) >= ruimte) {
      doel[p] = 0;
      return 0;
    }
    memcpy(doel + p, stuk, n);
    p += n;
  }
  doel[p] = 0;
  return 1;
}

/*
 * Leest een string zoals Delphi hem in het geheugen neerzet, als UTF-16.
 *
 * Voor elke string staat een kopje: vier bytes ervoor hoeveel tekens hij telt,
 * en tien bytes ervoor hoe breed een teken is (1 of 2 bytes). Daarmee valt er
 * niets te raden, en is een verkeerd adres te herkennen aan een onmogelijke
 * lengte of breedte. Hooguit `max` tekens; was er meer, dan wordt `*heel` 0.
 * Geeft het aantal tekens, of -1 als het geen string is.
 */
static int lees_omsi_tekst(DWORD tekst, wchar_t *doel, int max, int *heel) {
  *heel = 1;
  if (!plausible_ptr(tekst) || max <= 0) return -1;
  __try {
    const int lengte = *(const int *)(ULONG_PTR)(tekst - 4);
    const unsigned short breedte = *(const unsigned short *)(ULONG_PTR)(tekst - 10);
    if (lengte <= 0 || lengte > OMSI_TEKST_GRENS) return -1;
    int n = lengte;
    if (n > max) {
      n = max;
      *heel = 0;
    }
    if (breedte == 2) {
      memcpy(doel, (const void *)(ULONG_PTR)tekst, (size_t)n * sizeof(wchar_t));
      return n;
    }
    if (breedte == 1) {
      /*
       * OMSI schrijft zijn tekst in Windows-1252; zie copy_text. Daarin is elke
       * byte precies een UTF-16-teken. Met de lengte erbij, zodat een nul
       * midden in de tekst gewoon een teken is en niet het einde.
       */
      const int m = MultiByteToWideChar(1252, 0, (const char *)(ULONG_PTR)tekst, n, doel, max);
      return m > 0 ? m : -1;
    }
    return -1;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    *heel = 0;
    return -1;
  }
}

/*
 * Een string uit het geheugen van OMSI, als JSON-tekst; zie lees_omsi_tekst en
 * json_tekst. Anders dan copy_text, dat tekst aangereikt krijgt van de
 * plugin-API, staat hier een wijzer naar een string in OMSI's eigen geheugen.
 *
 * Geeft 1 als de hele string in `doel` staat (een lege ook), anders 0: dan
 * staat er een afgekapt stuk, of niets. Wie op naam zoekt, neemt alleen een
 * hele -- een afgekapte naam is een andere naam.
 */
static int omsi_json(char *doel, size_t ruimte, DWORD tekst, int schuin) {
  wchar_t tekens[SCHERM_WAARDE_MAX];
  if (ruimte == 0) return 0;
  doel[0] = 0;
  if (!tekst) return 1; /* zo zet Delphi een lege string neer */
  int heel = 0;
  /* Elk teken wordt minstens een byte: meer dan `ruimte` tekens past nooit. */
  const int max = ruimte < SCHERM_WAARDE_MAX ? (int)ruimte : SCHERM_WAARDE_MAX;
  const int n = lees_omsi_tekst(tekst, tekens, max, &heel);
  if (n < 0) return 0;
  return json_tekst(doel, ruimte, tekens, n, schuin) && heel;
}

static int copy_omsi_string(char *doel, size_t ruimte, DWORD tekst) {
  return omsi_json(doel, ruimte, tekst, 0);
}

/*
 * Alleen de bestandsnaam, zonder de map ervoor: "...\Model\17_almex_screen_6.o3d"
 * wordt "17_almex_screen_6.o3d". Zo staat hij ook in de model.cfg.
 */
static int omsi_bestandsnaam(char *doel, size_t ruimte, DWORD tekst) {
  wchar_t tekens[1024];
  if (ruimte == 0) return 0;
  doel[0] = 0;
  int heel = 0;
  const int n = lees_omsi_tekst(tekst, tekens, 1024, &heel);
  if (n < 0 || !heel) return 0;
  int begin = 0;
  for (int i = 0; i < n; i++)
    if (tekens[i] == L'\\' || tekens[i] == L'/') begin = i + 1;
  return json_tekst(doel, ruimte, tekens + begin, n - begin, 0);
}

/*
 * Een lijst namen uit een bestand van de app, een naam per regel.
 *
 * Voor de stringvariabelen (vragen.txt) en de getalvariabelen (getallen.txt)
 * hetzelfde. De app schrijft het bestand zodra ze merkt dat er een andere bus
 * rijdt; hier wordt er hooguit een keer per seconde naar gekeken. `vers` telt
 * op als de lijst anders is dan de vorige, zodat de namen opnieuw opgezocht
 * worden.
 *
 * Een regel met een aanhalingsteken, een backslash of een stuurteken slaat hij
 * over: zo'n naam komt in een varlist niet voor, en hij gaat letterlijk
 * live.json in. Een regel van meer dan 63 bytes ook -- en die wordt niet
 * afgekapt, want een afgekapte naam kan precies een andere naam zijn.
 */
#define NAMENLIJST_MAX 512 /* de grootste van VRAGEN_MAX en GETALLEN_MAX */

static void lees_namenlijst(const wchar_t *pad, char (*lijst)[SCHERM_NAAM_MAX], int max,
                            int *aantalUit, int *vers, ULONGLONG *gekeken) {
  if (!pad[0]) return;
  const ULONGLONG nu = GetTickCount64();
  if (*gekeken && nu - *gekeken < 1000) return;
  *gekeken = nu;
  if (max > NAMENLIJST_MAX) max = NAMENLIJST_MAX;

  HANDLE bestand = CreateFileW(pad, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                               OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return;
  /*
   * Statisch en niet op de stapel: samen ruim 60 kB, en OMSI roept ons aan op
   * de zijne. Genoeg voor NAMENLIJST_MAX regels van 63 bytes met CRLF.
   */
  static char tekst[NAMENLIJST_MAX * (SCHERM_NAAM_MAX + 2) + 1];
  static char nieuw[NAMENLIJST_MAX][SCHERM_NAAM_MAX];
  DWORD gelezen = 0;
  const BOOL ok = ReadFile(bestand, tekst, sizeof(tekst) - 1, &gelezen, NULL);
  CloseHandle(bestand);
  if (!ok) return;
  /* Paste het bestand niet, dan is de laatste regel misschien half: die niet. */
  if (gelezen == sizeof(tekst) - 1)
    while (gelezen > 0 && tekst[gelezen - 1] != '\n') gelezen--;
  tekst[gelezen] = 0;

  const size_t grootte = (size_t)max * SCHERM_NAAM_MAX;
  memset(nieuw, 0, grootte);
  int aantal = 0;
  const char *p = tekst;
  while (*p && aantal < max) {
    while (*p == '\r' || *p == '\n' || *p == ' ' || *p == '\t') p++;
    int n = 0;
    while (p[n] && p[n] != '\r' && p[n] != '\n') n++;
    const char *volgende = p + n;
    while (n > 0 && (p[n - 1] == ' ' || p[n - 1] == '\t')) n--;
    int bruikbaar = n > 0 && n < SCHERM_NAAM_MAX;
    for (int i = 0; i < n && bruikbaar; i++) {
      const unsigned char c = (unsigned char)p[i];
      if (c == '"' || c == '\\' || c < 0x20) bruikbaar = 0;
    }
    if (bruikbaar) {
      memcpy(nieuw[aantal], p, (size_t)n);
      nieuw[aantal][n] = 0;
      aantal++;
    }
    p = volgende;
  }
  if (aantal == *aantalUit && memcmp(nieuw, lijst, grootte) == 0) return;
  memcpy(lijst, nieuw, grootte);
  *aantalUit = aantal;
  (*vers)++;
}

/* Welke stringvariabelen wil de app zien? */
static void lees_vragen(void) {
  lees_namenlijst(g_vragenPad, g_vragen, VRAGEN_MAX, &g_vragenAantal, &g_vragenVers,
                  &g_vragenGekeken);
}

/* En welke getalvariabelen? */
static void lees_getalvragen(void) {
  lees_namenlijst(g_getallenPad, g_getalVragen, GETALLEN_MAX, &g_getalVragenAantal,
                  &g_getalVragenVers, &g_getalVragenGekeken);
}

/*
 * De stringvariabelen van de bus van de speler, met hun namen.
 *
 * De namenlijst hoort bij het bustype en blijft op hetzelfde adres staan zolang
 * je in dezelfde bus zit. Hij wordt dus een keer overgeschreven en daarna
 * alleen nog opgezocht; per beeld blijft er weinig te doen -- de waarden
 * ophalen op de plekken die de app gevraagd heeft.
 *
 * Eens per twee seconden gaat de hele lijst naar `g_dump`, waar maybe_flush hem
 * als schermen.json wegschrijft. Daarmee kan de app -- en wie een fout zoekt --
 * zien wat een bus werkelijk te bieden heeft.
 */
static void lees_busvars(DWORD voertuig) {
  for (int i = 0; i < VRAGEN_MAX; i++) g_varWaarde[i][0] = 0;
  g_varsGelezen = 0;
  g_busNaam[0] = g_busModel[0] = g_busPad[0] = g_busBestand[0] = 0;

  /*
   * Draait het script bij een ander voertuig -- een aanhanger, de tweede bak van
   * een gelede bus -- dan staan de variabelen daar. Namen en waarden moeten van
   * hetzelfde exemplaar komen, anders wijzen de nummers naar de verkeerde tekst.
   */
  const DWORD ouder = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_CMOI_SCRIPTOUDER);
  if (plausible_ptr(ouder) && ouder != voertuig) voertuig = ouder;

  const DWORD bestand = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_MAPOBJ);
  const DWORD exemplaar = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_INST);
  /*
   * Eerst wie de bus is, en pas daarna of hij stringvariabelen heeft. 63 van de
   * 601 .bus-bestanden in Vehicles hebben geen [stringvarnamelist] (vooral
   * vrachtwagens, AI en aanhangers). Stond dit na die toets, dan kreeg zo'n bus
   * geen model en vond de app zijn model.cfg niet -- terwijl zijn getallen en
   * wat OMSI van hem toont er wel zijn. Paden met een schuine streep; zie
   * json_tekst.
   */
  if (plausible_ptr(bestand)) {
    copy_omsi_string(g_busNaam, sizeof(g_busNaam), *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_NAAM));
    omsi_json(g_busModel, sizeof(g_busModel), *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_MODEL), 1);
    omsi_json(g_busPad, sizeof(g_busPad), *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_PAD), 1);
    omsi_json(g_busBestand, sizeof(g_busBestand),
              *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_BESTAND), 1);
  }
  const DWORD namen =
      plausible_ptr(bestand) ? *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_STRNAMEN) : 0;
  const DWORD waarden =
      plausible_ptr(exemplaar) ? *(const DWORD *)(ULONG_PTR)(exemplaar + OFS_COI_STRWAARDEN) : 0;
  if (!plausible_ptr(namen) || !plausible_ptr(waarden)) {
    g_namenBron = 0;
    g_namenAantal = 0;
    return;
  }

  const int aantalNamen = *(const int *)(ULONG_PTR)(namen - 4);
  const int aantalWaarden = *(const int *)(ULONG_PTR)(waarden - 4);
  if (aantalNamen <= 0 || aantalNamen > 20000 || aantalWaarden <= 0) return;

  /* Een andere bus: de namen opnieuw overschrijven en opnieuw opzoeken. */
  if (namen != g_namenBron) {
    g_namenBron = namen;
    g_namenVers = -1;
    g_namenAantal = aantalNamen < NAMEN_MAX ? aantalNamen : NAMEN_MAX;
    for (int i = 0; i < g_namenAantal; i++) {
      /* Een naam die niet heel past, kan nooit een gevraagde naam zijn: leeg laten. */
      if (!copy_omsi_string(g_namen[i], SCHERM_NAAM_MAX, *(const DWORD *)(ULONG_PTR)(namen + (DWORD)i * 4)))
        g_namen[i][0] = 0;
    }
    g_schermenGeschreven = 0;
    meld("bus %s (%s): %d stringvariabelen", g_busNaam, g_busModel, aantalNamen);
  }

  if (g_namenVers != g_vragenVers) {
    g_namenVers = g_vragenVers;
    for (int v = 0; v < VRAGEN_MAX; v++) {
      g_vraagIndex[v] = -1;
      if (v >= g_vragenAantal) continue;
      for (int i = 0; i < g_namenAantal; i++) {
        if (_stricmp(g_namen[i], g_vragen[v]) == 0) {
          g_vraagIndex[v] = i;
          break;
        }
      }
    }
  }

  for (int v = 0; v < g_vragenAantal && v < VRAGEN_MAX; v++) {
    const int i = g_vraagIndex[v];
    if (i < 0 || i >= aantalWaarden) continue;
    copy_omsi_string(g_varWaarde[v], SCHERM_WAARDE_MAX,
                     *(const DWORD *)(ULONG_PTR)(waarden + (DWORD)i * 4));
  }
  g_varsGelezen = 1;

  /* En af en toe de hele lijst, voor schermen.json. */
  const ULONGLONG nu = GetTickCount64();
  if (g_dumpLengte > 0 || (g_schermenGeschreven && nu - g_schermenGeschreven < 2000)) return;
  g_schermenGeschreven = nu;
  int p = _snprintf_s(g_dump, sizeof(g_dump), _TRUNCATE,
                      "{\"bus\":\"%s\",\"model\":\"%s\",\"pad\":\"%s\",\"bestand\":\"%s\","
                      "\"aantal\":%d,"
                      /*
                       * De kaartverkoop erbij. Niet omdat de app hem hier leest
                       * -- die krijgt hem in live.json -- maar omdat dit het
                       * bestand is waaraan je van buitenaf kunt zien of het
                       * klopt: wie er aan de deur staat, welk kaartje hij wil,
                       * en of de lijst met mensen uberhaupt gevonden is.
                       */
                      "\"verkoop\":{\"mensen\":%d,\"koper\":%d,\"kaartje\":%d,\"soort\":%d,"
                      "\"prijs\":%.2f,\"gegeven\":%.2f,\"klaar\":%d},"
                      /*
                       * En wat er met de laatste toets gebeurd is: welk nummer,
                       * welke scancode, en of hij werkelijk ingedrukt is. Zonder
                       * dit valt van buitenaf niet te zien of een knop die niets
                       * lijkt te doen wel bij OMSI aankwam.
                       */
                      "\"opdracht\":{\"nr\":%d,\"scancode\":%d,\"modifiers\":%d,\"fout\":%d},"
                      "\"vars\":{",
                      g_busNaam, g_busModel, g_busPad, g_busBestand, aantalNamen,
                      g_mem.mensen, g_mem.koper, g_mem.ticketIndex, g_mem.ticketSoort,
                      g_mem.ticketPrijs, g_mem.ticketGegeven, g_mem.ticketKlaar,
                      g_opdrachtNr, g_opdrachtScancode, g_opdrachtMod, g_opdrachtFout);
  if (p <= 0) return;
  int geteld = 0, afgekapt = 0;
  for (int i = 0; i < g_namenAantal && i < aantalWaarden; i++) {
    if (!g_namen[i][0]) continue;
    char waarde[SCHERM_WAARDE_MAX];
    copy_omsi_string(waarde, sizeof(waarde), *(const DWORD *)(ULONG_PTR)(waarden + (DWORD)i * 4));
    /* Ruimte houden voor het slot: zonder slot is het hele bestand geen JSON. */
    const int n = (size_t)p + 64 < sizeof(g_dump)
                      ? _snprintf_s(g_dump + p, sizeof(g_dump) - 64 - (size_t)p, _TRUNCATE,
                                    "%s\"%s\":\"%s\"", geteld ? "," : "", g_namen[i], waarde)
                      : -1;
    if (n <= 0) {
      afgekapt = 1;
      break;
    }
    p += n;
    geteld++;
  }
  const int slot = _snprintf_s(g_dump + p, sizeof(g_dump) - (size_t)p, _TRUNCATE,
                               "},\"afgekapt\":%s}", afgekapt ? "true" : "false");
  if (slot <= 0) {
    g_dumpLengte = 0;
    return;
  }
  g_dumpLengte = p + slot;
}


/*
 * Zet `lengte` bytes in `pad`, via een tijdelijk bestand: wie leest, ziet nooit
 * een half bestand. Geeft 1 als het gelukt is.
 */
static int schrijf_via_tmp(const wchar_t *tijdelijk, const wchar_t *pad, const char *inhoud,
                           int lengte) {
  HANDLE bestand = CreateFileW(tijdelijk, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                               FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand == INVALID_HANDLE_VALUE) return 0;
  DWORD geschreven = 0;
  const BOOL ok = WriteFile(bestand, inhoud, (DWORD)lengte, &geschreven, NULL);
  CloseHandle(bestand);
  if (!ok || geschreven != (DWORD)lengte) return 0;
  return MoveFileExW(tijdelijk, pad, MOVEFILE_REPLACE_EXISTING) ? 1 : 0;
}

/*
 * Namen opzoeken zonder op hoofdletters te letten, zoals bij de strings. Alleen
 * A-Z: de namen in een varlist zijn gewone letters, en zo vouwen de hash en
 * de vergelijking precies hetzelfde.
 */
static char klein(char c) { return c >= 'A' && c <= 'Z' ? (char)(c - 'A' + 'a') : c; }

static int zelfde_naam(const char *a, const char *b) {
  for (;; a++, b++) {
    if (klein(*a) != klein(*b)) return 0;
    if (!*a) return 1;
  }
}

/* FNV-1a over de naam in kleine letters: "ALMEX_MENU" en "almex_menu" vallen op dezelfde plek. */
static unsigned int getal_hash(const char *naam) {
  unsigned int h = 2166136261u;
  for (; *naam; naam++) {
    h ^= (unsigned char)klein(*naam);
    h *= 16777619u;
  }
  return h & (GETAL_HASH - 1);
}

/*
 * De gevraagde namen in een hashtabel. Zo hoeft een bus van 2580 namen niet
 * 2580 keer langs alle 512 vragen: elke naam van de bus wordt een keer
 * opgezocht. Vraagt de app dezelfde naam twee keer (in andere letters), dan
 * verwijst de tweede naar de eerste.
 */
static void maak_getalhash(void) {
  for (int h = 0; h < GETAL_HASH; h++) g_getalHash[h] = -1;
  for (int v = 0; v < GETALLEN_MAX; v++) g_getalZelfde[v] = -1;
  for (int v = 0; v < g_getalVragenAantal && v < GETALLEN_MAX; v++) {
    unsigned int h = getal_hash(g_getalVragen[v]);
    /* Er zijn twee keer zoveel plekken als vragen: er is altijd een lege. */
    while (g_getalHash[h] >= 0 && !zelfde_naam(g_getalVragen[g_getalHash[h]], g_getalVragen[v]))
      h = (h + 1) & (GETAL_HASH - 1);
    if (g_getalHash[h] >= 0)
      g_getalZelfde[v] = g_getalHash[h];
    else
      g_getalHash[h] = (short)v;
  }
}

/* Welke vraag hoort bij deze naam van de bus? -1 als de app hem niet vroeg. */
static int zoek_getalvraag(const char *naam) {
  unsigned int h = getal_hash(naam);
  while (g_getalHash[h] >= 0) {
    if (zelfde_naam(g_getalVragen[g_getalHash[h]], naam)) return g_getalHash[h];
    h = (h + 1) & (GETAL_HASH - 1);
  }
  return -1;
}

/*
 * De hele lijst getalvariabelen, als getallen.json naast live.json.
 *
 * Hooguit eens per twee seconden, net als schermen.json. De app heeft hem niet
 * nodig om iets te tonen -- wat ze vraagt staat in live.json -- maar zonder
 * deze lijst is van buiten niet te zien of een naam die niets doet wel bestaat,
 * en welke waarde hij heeft. Een naam die twee keer in de varlists staat, staat
 * hier ook twee keer; JSON.parse houdt dan de laatste. Een eigen __try: een
 * fout in deze lijst mag de gevraagde getallen niet meenemen.
 */
static void maak_getallenlijst(DWORD namen, DWORD waarden, int aantal) {
  const ULONGLONG nu = GetTickCount64();
  if (g_getalDumpLengte > 0 || (g_getalDumpGemaakt && nu - g_getalDumpGemaakt < 2000)) return;
  g_getalDumpGemaakt = nu;
  __try {
    int p = _snprintf_s(g_getalDump, sizeof(g_getalDump), _TRUNCATE,
                        "{\"bus\":\"%s\",\"aantal\":%d,\"getallen\":{", g_busNaam, aantal);
    if (p <= 0) return;
    int afgekapt = 0, geteld = 0;
    for (int i = 0; i < aantal; i++) {
      const DWORD tekst = *(const DWORD *)(ULONG_PTR)(namen + (DWORD)i * 4);
      if (!tekst) continue; /* een lege regel in de varlist */
      char naam[SCHERM_NAAM_MAX * 2];
      if (!copy_omsi_string(naam, sizeof(naam), tekst) || !naam[0]) continue;
      const DWORD plek = *(const DWORD *)(ULONG_PTR)(waarden + (DWORD)i * 4);
      char getal[32];
      strcpy_s(getal, sizeof(getal), "null");
      if (plausible_ptr(plek)) {
        const float w = *(const float *)(ULONG_PTR)plek;
        if (isfinite(w)) _snprintf_s(getal, sizeof(getal), _TRUNCATE, "%.9g", (double)w);
      }
      /* Ruimte houden voor het slot; wat niet past valt eraf, en dat staat er dan bij. */
      const int n = (size_t)p + 64 < sizeof(g_getalDump)
                        ? _snprintf_s(g_getalDump + p, sizeof(g_getalDump) - 64 - (size_t)p,
                                      _TRUNCATE, "%s\"%s\":%s", geteld ? "," : "", naam, getal)
                        : -1;
      if (n <= 0) {
        afgekapt = 1;
        break;
      }
      p += n;
      geteld++;
    }
    const int slot = _snprintf_s(g_getalDump + p, sizeof(g_getalDump) - (size_t)p, _TRUNCATE,
                                 "},\"afgekapt\":%s}", afgekapt ? "true" : "false");
    g_getalDumpLengte = slot > 0 ? p + slot : 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_getalDumpLengte = 0;
  }
}

/*
 * De getalvariabelen van de bus van de speler; zie OFS_CMO_GETALNAMEN.
 *
 * Zelfde opzet als lees_busvars: de namen horen bij het bustype en worden
 * alleen opgezocht als je in een andere bus stapt of de app iets anders vraagt;
 * per beeld worden alleen de gevraagde waarden gelezen. Zonder onderscheid
 * tussen hoofd- en kleine letters, en de eerste naam telt: in de Hamburgse
 * elektrobus staan bremse_halte, cp_stopbrake_targeton en cp_innenlicht_sos_sw
 * twee keer in de varlists, elk met een eigen getal.
 *
 * Met een eigen __try. Hij draait binnen die van read_memory, en een fout hier
 * zou daar de hele geheugenstand wissen: positie, dienstregeling en
 * kaartverkoop weg, om een getal. Nu vergeet hij alleen de getallen.
 */
static void lees_busgetallen(DWORD voertuig) {
  memset(g_getalStaat, 0, sizeof(g_getalStaat));
  g_getalAantalBus = 0;
  __try {
    /* Deelt dit voertuig het script met een ander, dan staan de getallen daar. */
    const DWORD ouder = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_CMOI_SCRIPTOUDER);
    if (plausible_ptr(ouder) && ouder != voertuig) voertuig = ouder;

    const DWORD bestand = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_MAPOBJ);
    const DWORD exemplaar = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_INST);
    const DWORD namen =
        plausible_ptr(bestand) ? *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_GETALNAMEN) : 0;
    /* Eerst waar OMSI's eigen zichtbaarheidscode kijkt, dan de wijzer op het voertuig. */
    DWORD bron =
        plausible_ptr(exemplaar) ? *(const DWORD *)(ULONG_PTR)(exemplaar + OFS_COI_GETALWAARDEN) : 0;
    DWORD waarden = plausible_ptr(bron) ? *(const DWORD *)(ULONG_PTR)bron : 0;
    if (!plausible_ptr(waarden)) {
      bron = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_CMOI_GETALWAARDEN);
      waarden = plausible_ptr(bron) ? *(const DWORD *)(ULONG_PTR)bron : 0;
    }
    if (!plausible_ptr(namen) || !plausible_ptr(waarden)) {
      g_getalNamenBron = 0;
      return;
    }
    const int aantalNamen = *(const int *)(ULONG_PTR)(namen - 4);
    const int aantalWaarden = *(const int *)(ULONG_PTR)(waarden - 4);
    if (aantalNamen <= 0 || aantalNamen > GETAL_NAMEN_GRENS || aantalWaarden <= 0 ||
        aantalWaarden > GETAL_NAMEN_GRENS)
      return;
    const int aantal = aantalNamen < aantalWaarden ? aantalNamen : aantalWaarden;

    /* Een andere bus: opnieuw opzoeken. */
    if (namen != g_getalNamenBron || aantalNamen != g_getalNamenAantal) {
      g_getalNamenBron = namen;
      g_getalNamenAantal = aantalNamen;
      g_getalNamenVers = -1;
      g_getalDumpGemaakt = 0;
      if (namen != g_getalGemeld) {
        g_getalGemeld = namen;
        meld("bus %s: %d getalvariabelen", g_busNaam, aantalNamen);
      }
    }

    if (g_getalNamenVers != g_getalVragenVers) {
      maak_getalhash();
      int uniek = 0;
      for (int v = 0; v < GETALLEN_MAX; v++) {
        g_getalIndex[v] = -1;
        if (v < g_getalVragenAantal && g_getalZelfde[v] < 0) uniek++;
      }
      int gevonden = 0;
      for (int i = 0; i < aantal && gevonden < uniek; i++) {
        const DWORD tekst = *(const DWORD *)(ULONG_PTR)(namen + (DWORD)i * 4);
        if (!tekst) continue; /* een lege regel in de varlist */
        /* Ruimer dan een vraag lang mag zijn: een langere naam past dan niet heel en telt niet. */
        char naam[SCHERM_NAAM_MAX * 2];
        if (!copy_omsi_string(naam, sizeof(naam), tekst) || !naam[0]) continue;
        const int v = zoek_getalvraag(naam);
        if (v >= 0 && g_getalIndex[v] < 0) {
          g_getalIndex[v] = i;
          gevonden++;
        }
      }
      for (int v = 0; v < g_getalVragenAantal && v < GETALLEN_MAX; v++)
        if (g_getalZelfde[v] >= 0) g_getalIndex[v] = g_getalIndex[g_getalZelfde[v]];
      /* Pas als alles opgezocht is: liep het halverwege mis, dan de volgende keer opnieuw. */
      g_getalNamenVers = g_getalVragenVers;
    }

    for (int v = 0; v < g_getalVragenAantal && v < GETALLEN_MAX; v++) {
      const int i = g_getalIndex[v];
      if (i < 0 || i >= aantal) {
        g_getalStaat[v] = GETAL_ONBEKEND;
        continue;
      }
      const DWORD plek = *(const DWORD *)(ULONG_PTR)(waarden + (DWORD)i * 4);
      if (!plausible_ptr(plek)) {
        g_getalStaat[v] = GETAL_GEEN;
        continue;
      }
      const float w = *(const float *)(ULONG_PTR)plek;
      g_getalWaarde[v] = w;
      g_getalStaat[v] = isfinite(w) ? GETAL_GETAL : GETAL_GEEN;
    }
    g_getalAantalBus = aantal;

    maak_getallenlijst(namen, waarden, aantal);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    memset(g_getalStaat, 0, sizeof(g_getalStaat));
    g_getalAantalBus = 0;
    g_getalNamenBron = 0;
  }
}

/*
 * meshes.json: welke plek in "zichtbaar" welke mesh is.
 *
 * Per mesh het o3d-bestand zonder map, de plek van de variabele uit
 * [visible] (-1 als er geen is, of als de bus hem niet kent), het doel, en de
 * naam van die variabele. Zo kan de app haar eigen telling van de [mesh]-regels
 * naast die van OMSI leggen: OMSI slaat een mesh over als zijn o3d niet
 * bestaat, en dan schuift alles erna een plek op.
 *
 * Alleen als er een ander model is, het aantal verandert of het model in
 * live.json anders heet. Een eigen __try: een fout hier mag de vlaggen niet
 * meenemen. Ook dan geldt deze bus als gedaan -- anders probeerde hij het tien
 * keer per seconde opnieuw.
 *
 * Een naam die niet heel past, wordt leeg en niet afgekapt: een afgekapte
 * o3d-naam zou bij een andere mesh uit de cfg kunnen passen.
 */
static void maak_meshlijst(DWORD co, DWORD items, int aantal, DWORD namen) {
  g_meshBron = co;
  g_meshBronAantal = aantal;
  strcpy_s(g_meshModel, sizeof(g_meshModel), g_busModel);
  g_meshDumpLengte = 0;
  g_meshSchrijfFout = 0;
  g_meshOpSchijf = 0;
  __try {
    const int aantalNamen = plausible_ptr(namen) ? *(const int *)(ULONG_PTR)(namen - 4) : 0;
    int p = _snprintf_s(g_meshDump, sizeof(g_meshDump), _TRUNCATE,
                        "{\"model\":\"%s\",\"aantal\":%d,\"meshes\":[", g_busModel, aantal);
    if (p <= 0) return;
    int afgekapt = 0;
    for (int j = 0; j < aantal; j++) {
      const DWORD mesh = *(const DWORD *)(ULONG_PTR)(items + (DWORD)j * 4);
      char o3d[256], varnaam[SCHERM_NAAM_MAX * 2];
      int var = -1, doel = 0;
      o3d[0] = varnaam[0] = 0;
      if (plausible_ptr(mesh)) {
        if (!omsi_bestandsnaam(o3d, sizeof(o3d), *(const DWORD *)(ULONG_PTR)(mesh + OFS_MESH_O3D)))
          o3d[0] = 0;
        var = *(const int *)(ULONG_PTR)(mesh + OFS_MESH_VAR);
        doel = *(const int *)(ULONG_PTR)(mesh + OFS_MESH_DOEL);
        if (var >= 0 && var < aantalNamen && aantalNamen <= GETAL_NAMEN_GRENS &&
            !copy_omsi_string(varnaam, sizeof(varnaam),
                              *(const DWORD *)(ULONG_PTR)(namen + (DWORD)var * 4)))
          varnaam[0] = 0;
      }
      /* Ruimte houden voor het slot; een mesh die niet past valt eraf, met de rest. */
      const int n = (size_t)p + 64 < sizeof(g_meshDump)
                        ? _snprintf_s(g_meshDump + p, sizeof(g_meshDump) - 64 - (size_t)p,
                                      _TRUNCATE, "%s[\"%s\",%d,%d,\"%s\"]", j ? "," : "", o3d, var,
                                      doel, varnaam)
                        : -1;
      if (n <= 0) {
        afgekapt = 1;
        break;
      }
      p += n;
    }
    const int slot = _snprintf_s(g_meshDump + p, sizeof(g_meshDump) - (size_t)p, _TRUNCATE,
                                 "],\"afgekapt\":%s}", afgekapt ? "true" : "false");
    if (slot <= 0) return;
    g_meshDumpLengte = p + slot;
    meld("model %s: %d meshes", g_busModel, aantal);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_meshDumpLengte = 0;
    meld("meshlijst van %s niet te lezen", g_busModel);
  }
}

/*
 * Per mesh of OMSI hem nu toont; zie OFS_COI_MESHINSTS.
 *
 * Van hetzelfde voertuig als lees_busvars (na ScriptShareParent), zodat het
 * model in live.json en de meshes bij elkaar horen. Alleen als de twee lijsten
 * even lang zijn -- dan hoort plek j in de ene bij plek j in de andere; zo
 * leest OMSI ze zelf ook (VA 0x5fcf01 en 0x5fcf94, met hetzelfde register).
 *
 * Met een eigen __try, om dezelfde reden als lees_busgetallen.
 */
static void lees_zichtbaarheid(DWORD voertuig) {
  g_meshAantal = 0;
  g_zichtbaar[0] = 0;
  __try {
    const DWORD ouder = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_CMOI_SCRIPTOUDER);
    if (plausible_ptr(ouder) && ouder != voertuig) voertuig = ouder;

    const DWORD exemplaar = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_INST);
    if (!plausible_ptr(exemplaar)) return;
    const DWORD co = *(const DWORD *)(ULONG_PTR)(exemplaar + OFS_COI_COMPLOBJ);
    const DWORD ml = plausible_ptr(co) ? *(const DWORD *)(ULONG_PTR)(co + OFS_CO_MESHES) : 0;
    const DWORD il = *(const DWORD *)(ULONG_PTR)(exemplaar + OFS_COI_MESHINSTS);
    if (!plausible_ptr(ml) || !plausible_ptr(il)) return;
    const DWORD meshes = *(const DWORD *)(ULONG_PTR)(ml + 4);
    const int aantal = *(const int *)(ULONG_PTR)(ml + 8);
    const DWORD exemplaren = *(const DWORD *)(ULONG_PTR)(il + 4);
    const int aantalExemplaren = *(const int *)(ULONG_PTR)(il + 8);
    if (aantal <= 0 || aantal > MESHES_MAX || aantal != aantalExemplaren ||
        !plausible_ptr(meshes) || !plausible_ptr(exemplaren))
      return;

    for (int j = 0; j < aantal; j++) {
      const DWORD inst = *(const DWORD *)(ULONG_PTR)(exemplaren + (DWORD)j * 4);
      g_zichtbaar[j] =
          plausible_ptr(inst) && *(const BYTE *)(ULONG_PTR)(inst + OFS_INST_ZICHTBAAR) ? '1' : '0';
    }
    g_zichtbaar[aantal] = 0;
    g_meshAantal = aantal;

    /*
     * Ook als alleen de naam van het model anders is: stond die bij de eerste
     * keer nog leeg (tijdens het laden), dan bleef meshes.json anders met een
     * verkeerd "model" staan, en paste hij nooit bij bus.model in live.json.
     */
    if (co != g_meshBron || aantal != g_meshBronAantal || strcmp(g_busModel, g_meshModel) != 0) {
      const DWORD bestand = *(const DWORD *)(ULONG_PTR)(voertuig + OFS_COMPL_MAPOBJ);
      const DWORD namen =
          plausible_ptr(bestand) ? *(const DWORD *)(ULONG_PTR)(bestand + OFS_CMO_GETALNAMEN) : 0;
      maak_meshlijst(co, meshes, aantal, namen);
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_meshAantal = 0;
    g_zichtbaar[0] = 0;
  }
}

/* getallen.json weg, net als schermen.json. Lukt het niet, dan over twee seconden weer. */
static void schrijf_getallenlijst(void) {
  if (g_getalDumpLengte <= 0 || !g_getalLijstPad[0]) return;
  schrijf_via_tmp(g_getalLijstTemp, g_getalLijstPad, g_getalDump, g_getalDumpLengte);
  g_getalDumpLengte = 0;
}

/*
 * meshes.json weg. Die komt maar een keer per bus, dus lukt het niet -- de app
 * had hem net open, bijvoorbeeld -- dan bij het volgende beeld opnieuw.
 */
static void schrijf_meshlijst(void) {
  if (g_meshDumpLengte <= 0 || !g_meshLijstPad[0]) return;
  if (schrijf_via_tmp(g_meshLijstTemp, g_meshLijstPad, g_meshDump, g_meshDumpLengte)) {
    g_meshDumpLengte = 0;
    g_meshOpSchijf = 1;
    return;
  }
  if (!g_meshSchrijfFout) meld("meshes.json schrijven mislukt: Windows-fout %lu", GetLastError());
  g_meshSchrijfFout = 1;
}

/*
 * Zet weg wat lees_busvars verzameld heeft.
 *
 * Een eigen bestand, en niet in live.json: de hele lijst is kilobytes groot en
 * hoeft niet tien keer per seconde ververst te worden. Wat wel zo snel moet,
 * staat in live.json onder "vars" -- precies de namen die de app vroeg.
 */
static void schrijf_schermen(void) {
  if (g_dumpLengte <= 0 || !g_schermenPad[0]) return;
  HANDLE bestand = CreateFileW(g_schermenTemp, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                               FILE_ATTRIBUTE_NORMAL, NULL);
  if (bestand != INVALID_HANDLE_VALUE) {
    DWORD geschreven = 0;
    WriteFile(bestand, g_dump, (DWORD)g_dumpLengte, &geschreven, NULL);
    CloseHandle(bestand);
    MoveFileExW(g_schermenTemp, g_schermenPad, MOVEFILE_REPLACE_EXISTING);
  }
  g_dumpLengte = 0;
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
/** Een getal dat in JSON mag: NaN en oneindig bestaan daar niet. */
static double veilig(double waarde) {
  return isfinite(waarde) ? waarde : 0.0;
}

static void flush_state(int alive) {
  /*
   * Statisch en niet op de stapel: met de variabelen van de bus erbij kan dit
   * bericht tientallen kilobytes worden, en OMSI roept ons aan op zijn eigen
   * stapel.
   */
  static char body[262144];
  char mem[2048];
  /* Wat de app gevraagd heeft, als JSON: "naam":"waarde", door komma's. */
  static char vars[VRAGEN_MAX * (SCHERM_NAAM_MAX + SCHERM_WAARDE_MAX + 8)];
  int vp = 0;
  int varsAfgekapt = 0;
  vars[0] = 0;
  for (int i = 0; i < g_vragenAantal && i < VRAGEN_MAX && g_varsGelezen; i++) {
    /* Een naam die deze bus niet kent, hoort er niet als lege regel in te staan. */
    if (g_vraagIndex[i] < 0) continue;
    const int n = _snprintf_s(vars + vp, sizeof(vars) - (size_t)vp, _TRUNCATE, "%s\"%s\":\"%s\"",
                              vp ? "," : "", g_vragen[i], g_varWaarde[i]);
    if (n <= 0) {
      /* Past niet meer: liever zeggen dat er iets mist dan het stil weglaten. */
      varsAfgekapt = 1;
      vars[vp] = 0;
      break;
    }
    vp += n;
  }
  /*
   * En de getallen die de app vroeg: "naam":getal, of null als de bus de naam
   * kent maar er geen getal staat. %.9g geeft een float precies terug (6 wordt
   * "6", 0.5 wordt "0.5") en is altijd geldige JSON. Namen die de bus niet
   * kent, gaan apart in "getallenOnbekend": een [visible] erop is in OMSI
   * altijd waar, en de app moet dat kunnen onderscheiden van "niet gelezen".
   * Een vraag is hooguit 63 bytes en een getal hooguit 15 tekens: het past
   * altijd, maar liever zeggen dat er iets mist dan het stil weglaten.
   */
  static char getallen[GETALLEN_MAX * (SCHERM_NAAM_MAX + 24)];
  static char onbekend[GETALLEN_MAX * (SCHERM_NAAM_MAX + 4)];
  int gp = 0, op = 0;
  int getallenAfgekapt = 0;
  getallen[0] = onbekend[0] = 0;
  for (int i = 0; i < g_getalVragenAantal && i < GETALLEN_MAX; i++) {
    const int staat = g_getalStaat[i];
    if (staat == GETAL_ONBEKEND && g_getalAantalBus > 0) {
      const int n = _snprintf_s(onbekend + op, sizeof(onbekend) - (size_t)op, _TRUNCATE, "%s\"%s\"",
                                op ? "," : "", g_getalVragen[i]);
      if (n <= 0) {
        getallenAfgekapt = 1;
        onbekend[op] = 0;
      } else {
        op += n;
      }
    } else if (staat == GETAL_GETAL || staat == GETAL_GEEN) {
      char getal[32];
      if (staat == GETAL_GETAL)
        _snprintf_s(getal, sizeof(getal), _TRUNCATE, "%.9g", (double)g_getalWaarde[i]);
      else
        strcpy_s(getal, sizeof(getal), "null");
      const int n = _snprintf_s(getallen + gp, sizeof(getallen) - (size_t)gp, _TRUNCATE,
                                "%s\"%s\":%s", gp ? "," : "", g_getalVragen[i], getal);
      if (n <= 0) {
        getallenAfgekapt = 1;
        getallen[gp] = 0;
      } else {
        gp += n;
      }
    }
  }
  /*
   * Wat OMSI toont, maar alleen als meshes.json van dit model al op schijf
   * staat. Zonder die lijst weet de app niet welke plek welke mesh is, en een
   * nieuwe bus zag ze anders eerst met de lijst van de vorige: dan klopte de
   * uitlijning niet, en dat onthield ze voor deze bus (main/scherm.ts). Lukt
   * het schrijven van meshes.json niet, dan blijft het hier "" tot het lukt.
   */
  const int meshKlaar = g_meshAantal > 0 && g_meshOpSchijf;
  /*
   * Het geheugenblok. Past dit niet, dan zou er een halve regel in live.json
   * belanden en is het hele bericht geen JSON meer; dan liever een leeg blok.
   */
  const int memLengte = _snprintf_s(
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
      g_exeVersion, g_mem.ok, g_mem.kachel, veilig(g_mem.pos[0]), veilig(g_mem.pos[1]),
      veilig(g_mem.pos[2]),
      veilig(g_mem.rot[0]), veilig(g_mem.rot[1]), veilig(g_mem.rot[2]), veilig(g_mem.rot[3]),
      veilig(g_mem.schedActive), g_mem.schedLine, g_mem.schedTour, g_mem.schedTourEntry,
      g_mem.schedTrip, g_mem.schedNextIndex, veilig(g_mem.schedNextDist), g_mem.schedDelay,
      g_opdrachtNr, g_opdrachtFout,
      g_mem.koper, g_mem.ticketSoort, g_mem.ticketIndex,
      g_mem.ticketPrijs, g_mem.ticketGegeven, g_mem.ticketSlecht, g_mem.ticketKlaar,
      g_mem.lineName, g_mem.tourName, g_mem.tripName, g_mem.nextStop);
  if (memLengte <= 0) {
    /* Past het niet, dan een leeg blok: een half blok maakt van live.json rommel. */
    _snprintf_s(mem, sizeof(mem), _TRUNCATE, ",\"exeVersion\":\"%s\",\"mem\":{\"ok\":0}}", g_exeVersion);
  }

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
      "\"bus\":{\"naam\":\"%s\",\"model\":\"%s\",\"pad\":\"%s\",\"bestand\":\"%s\"},"
      "\"vars\":{%s},\"varsAfgekapt\":%s,"
      "\"getallen\":{%s},\"getallenOnbekend\":[%s],\"getallenAfgekapt\":%s,\"getalAantal\":%d,"
      "\"meshAantal\":%d,\"zichtbaar\":\"%s\","
      "\"ibis\":{\"bestemming\":\"%s\",\"lijn\":\"%s\","
      "\"lawo1\":\"%s\",\"lawo2\":\"%s\",\"lawo3\":\"%s\",\"lawo4\":\"%s\","
      "\"afr1\":\"%s\",\"afr2\":\"%s\"}%s",
      /*
       * Door veilig(): een busscript dat door nul deelt geeft OMSI NaN, en
       * "nan" in het bericht is geen JSON -- dan kon de app het hele bestand
       * niet lezen, en niet alleen dat ene getal.
       */
      alive ? "true" : "false", PLUGIN_VERSIE, g_seen, g_seenSys, g_seenStr, g_strKind,
      veilig(g_sys[SYS_TIME]), veilig(g_sys[SYS_DAY]), veilig(g_sys[SYS_MONTH]),
      veilig(g_sys[SYS_YEAR]),
      veilig(g_var[VAR_VELOCITY]), veilig(g_var[VAR_HUMANS]), veilig(g_var[VAR_SCHEDULE_ACTIVE]),
      veilig(g_var[VAR_TARGET_INDEX]), veilig(g_var[VAR_TANK]), veilig(g_var[VAR_KM]),
      veilig(g_var[VAR_M]),
      veilig(g_var[VAR_ENTRY_REQ]), veilig(g_var[VAR_EXIT_REQ]), veilig(g_var[VAR_TICKET]),
      veilig(g_var[VAR_ENTRY_OPEN]), veilig(g_var[VAR_EXIT_OPEN]), veilig(g_var[VAR_AT_STATION]),
      veilig(g_var[VAR_BRIGHTNESS]), veilig(g_var[VAR_STREETCOND]), veilig(g_sys[SYS_PRECIP_RATE]),
      veilig(g_sys[SYS_PRECIP_TYPE]), veilig(g_var[VAR_LIGHTS_LOW]), veilig(g_var[VAR_BLINKER_L]),
      veilig(g_var[VAR_BLINKER_R]), veilig(g_var[VAR_BRAKELIGHT]), veilig(g_var[VAR_ENGINE_ON]),
      veilig(g_var[VAR_BUSSTOP_INDEX]),
      veilig(g_maxBrake), veilig(g_maxAccel), veilig(g_topSpeed), g_harshBrakes, g_harshAccels,
      veilig(g_var[VAR_BATTERY]), veilig(g_sys[SYS_TEMPERATURE]),
      g_collisions, veilig(g_collisionEnergy), veilig(g_worstCollision),
      g_str[STR_BUSSTOP], g_str[STR_DELAY_MIN], g_str[STR_DELAY_SEC],
      g_str[STR_LINE], g_str[STR_TERMINUS], g_str[STR_MATRIX],
      g_busNaam, g_busModel, g_busPad, g_busBestand, vars, varsAfgekapt ? "true" : "false",
      getallen, onbekend, getallenAfgekapt ? "true" : "false", g_getalAantalBus,
      meshKlaar ? g_meshAantal : 0, meshKlaar ? g_zichtbaar : "",
      g_str[STR_IBIS_TERMINUS], g_str[STR_IBIS_LIJN],
      g_str[STR_LAWO1], g_str[STR_LAWO2], g_str[STR_LAWO3], g_str[STR_LAWO4],
      g_str[STR_AFR1], g_str[STR_AFR2], mem);
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
  toets_bijhouden();
  lees_opdracht();
  lees_vragen();
  lees_getalvragen();
  if (!g_ready || now - g_lastWrite < WRITE_INTERVAL_MS) return;
  g_lastWrite = now;
  read_memory();
  /* meshes.json vóór live.json: de vlaggen in live.json horen bij een lijst die er al is. */
  schrijf_meshlijst();
  flush_state(1);
  schrijf_schermen();
  schrijf_getallenlijst();
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
  /*
   * Een opdracht van de vorige keer hoort niet alsnog uitgevoerd te worden.
   * `opdracht.txt` blijft staan als OMSI afsluit, en het nummer erin telt bij
   * een nieuw spel weer vanaf nul -- dan drukte de plugin bij het opstarten de
   * laatste toets van de vorige rit in, zonder dat iemand iets gevraagd had.
   * Weg ermee, voordat we gaan kijken.
   */
  DeleteFileW(g_opdrachtPad);
  _snwprintf_s(g_vragenPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\vragen.txt", base);
  _snwprintf_s(g_schermenPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\schermen.json", base);
  _snwprintf_s(g_schermenTemp, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\schermen.tmp", base);
  /*
   * getallen.txt blijft staan, net als vragen.txt: de app schrijft alleen als
   * er iets verandert, en draaide ze al, dan komt er anders niets meer.
   */
  _snwprintf_s(g_getallenPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\getallen.txt", base);
  _snwprintf_s(g_getalLijstPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\getallen.json", base);
  _snwprintf_s(g_getalLijstTemp, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\getallen.tmp", base);
  _snwprintf_s(g_meshLijstPad, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\meshes.json", base);
  _snwprintf_s(g_meshLijstTemp, MAX_PATH, _TRUNCATE, L"%s\\OMSI Career\\meshes.tmp", base);
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
  /* De bus is nog niet bekeken; de app heeft ook nog niets gevraagd. */
  g_namenBron = 0;
  g_namenAantal = 0;
  g_namenVers = -1;
  g_vragenAantal = 0;
  g_vragenVers = 0;
  g_vragenGekeken = 0;
  g_schermenGeschreven = 0;
  g_dumpLengte = 0;
  memset(g_vragen, 0, sizeof(g_vragen));
  /* De getallen en de meshes evenmin. */
  g_getalNamenBron = 0;
  g_getalNamenAantal = 0;
  g_getalNamenVers = -1;
  g_getalGemeld = 0;
  g_getalVragenAantal = 0;
  g_getalVragenVers = 0;
  g_getalVragenGekeken = 0;
  g_getalAantalBus = 0;
  g_getalDumpLengte = 0;
  g_getalDumpGemaakt = 0;
  memset(g_getalVragen, 0, sizeof(g_getalVragen));
  memset(g_getalStaat, 0, sizeof(g_getalStaat));
  g_meshAantal = 0;
  g_zichtbaar[0] = 0;
  g_meshBron = 0;
  g_meshBronAantal = 0;
  g_meshModel[0] = 0;
  g_meshDumpLengte = 0;
  g_meshSchrijfFout = 0;
  g_meshOpSchijf = 0;
  detect_version();
  g_ready = 1;
  g_levensteken = GetTickCount64();
  meld("klaar om te schrijven naar %ls (OMSI %s)", g_path, g_exeVersion);
}

__declspec(dllexport) void __stdcall PluginFinalize(void) {
  laat_toets_los();
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
