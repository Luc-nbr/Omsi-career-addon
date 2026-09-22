import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LANGUAGE, isLanguage, type Language } from '../shared/i18n'
import { isOverlayRate, type OverlayRate } from '../shared/overlay'

/**
 * Instellingen die voor de hele app gelden en niet bij een chauffeur horen.
 * De taal is er zo een: je kiest hem eenmaal, ook als je drie chauffeurs hebt.
 */
export interface Settings {
  language: Language
  /**
   * Hoe vaak de overlay wordt bijgewerkt. Een doorzichtig venster over het spel
   * moet Windows bij elke verversing opnieuw over het beeld heen mengen, en op
   * een machine die het al krap heeft kost dat merkbaar vloeiendheid in OMSI.
   */
  overlayRate: OverlayRate
  /**
   * OMSI in een venster starten in plaats van op volledig scherm.
   *
   * Staat standaard aan, en dat is een keuze. De overlay is een venster dat
   * altijd bovenop ligt; boven een spel dat het scherm exclusief opeist is dat
   * de klassieke aanleiding voor een verloren Direct3D-apparaat, en dan blijft
   * het beeld zwart terwijl de menu's er gewoon overheen staan. Een gebruiker
   * meldde precies dat. In een venster speelt OMSI net zo goed, en de overlay
   * doet wat hij hoort te doen.
   *
   * Wie liever volledig scherm rijdt zet hem uit; dan start de app OMSI zoals
   * het spel het zelf zou doen.
   */
  windowedOmsi: boolean
  /**
   * De OMSI-map die de speler zelf heeft aangewezen.
   *
   * De app zoekt hem zelf op de gebruikelijke plekken, maar iemand kan het spel
   * ergens hebben staan waar niemand kijkt. Dan wijst hij hem eenmaal aan en is
   * het daarna klaar. Leeg betekent: zoek het zelf maar uit.
   */
  omsiPath?: string
  /**
   * Heeft de speler die map zelf bevestigd?
   *
   * Los van `omsiPath`, want de app kan hem ook zelf gevonden hebben. Pas als
   * dit aanstaat houdt hij op met vragen; tot die tijd legt hij zijn vondst
   * eenmaal voor. Iemand met twee installaties krijgt anders stil de verkeerde.
   */
  omsiConfirmed?: boolean
  /**
   * Hoe de kaartenlijst eruitziet: als lijst of als tegels met de afbeelding
   * die OMSI zelf bij elke kaart heeft staan (`picture.jpg`).
   *
   * Een gebruiker vroeg erom: "een selectie met tegels en daarbij afbeeldingen
   * van de kaarten". Een lijst leest sneller als je precies weet welke kaart je
   * zoekt; een plaatje herken je zonder de naam te lezen. Allebei goed, dus
   * allebei er, en de keuze blijft staan.
   *
   * Tegels staan voor: dat is wat Luc wil dat mensen als eerste zien, en het is
   * ook de vriendelijkste kennismaking -- twaalf foto's zeggen meer dan twaalf
   * regels tekst. Wie de lijst wil, klikt hem aan en houdt hem.
   */
  mapView?: 'lijst' | 'tegels'
  /**
   * Heeft iemand hier ooit zelf een taal gekozen?
   *
   * De app start in het Nederlands omdat er iets moet staan, maar dat is een
   * gok en geen keuze. Bij de allereerste start vraagt hij het daarom, vóór
   * alles: een scherm met vier grote tegels. Daarna nooit meer -- de vlaggen in
   * de balk blijven er voor wie zich bedenkt.
   */
  languageChosen?: boolean
  /**
   * Per overlay: waarschuwen als hij in OMSI zit? Zie core/omsiProces.ts.
   *
   * Steam staat standaard uit, want die valt niet uit te zetten (Steam zet hem
   * bij elke start terug) en een waarschuwing waar je niets mee kunt is ruis.
   * opentrack staat er niet bij: dat wil de speler juist houden.
   */
  overlayWaarschuwing?: Partial<Record<'steam' | 'discord' | 'nvidia' | 'rtss' | 'obs' | 'd3d9', boolean>>
  /**
   * Is de vraag om alle busfoto's in één keer te maken al gesteld?
   *
   * Eén keer, als laatste stap van het installeren -- ook bij wie de app al
   * had, want die heeft ze evenmin. Wie ja zegt of overslaat krijgt hem niet
   * meer; voor bussen die later komen staat er een knop op het startscherm.
   */
  busPhotosOffered?: boolean
  /**
   * Is de rondleiding voor nieuwe gebruikers al gezien of overgeslagen?
   *
   * Per computer, net als de taal: een tweede chauffeur op dezelfde pc kent de
   * app al. Wie hem opnieuw wil zien, drukt op het vraagteken in het hoofdmenu.
   */
  tourSeen?: boolean
  /**
   * Animaties: `systeem` volgt Windows, `aan` beweegt altijd, `uit` nooit.
   * Zie renderer/src/animaties.ts voor waarom dat los van Windows moet kunnen.
   */
  animaties?: 'systeem' | 'aan' | 'uit'
  /**
   * Dag of nacht. `systeem` volgt wat Windows zegt en is de beginstand.
   *
   * Los van Windows, want de app wordt 's avonds in een donkere kamer gebruikt
   * terwijl Windows nog op dag staat -- of andersom. Wie er niets van vindt
   * merkt er niets van; wie er wel iets van vindt drukt op het knopje.
   */
  theme?: 'systeem' | 'licht' | 'donker'
  /**
   * Hoeveel van het rijscherm de navigatie krijgt, als deel van de breedte.
   *
   * Op dat scherm staan twee dingen naast elkaar: de dienst en de kaart. Wat
   * daarvan het grootst hoort te zijn, weet de app niet -- wie op twee schermen
   * rijdt kijkt vooral naar de kaart, wie de overlay gebruikt juist niet. Dus
   * mag de gebruiker de scheiding verslepen, en blijft staan waar hij hem zet.
   *
   * Een deel en geen aantal pixels: het venster verandert van maat en een vaste
   * kolom wordt dan op de ene machine een strookje en op de andere de helft.
   * Begint op 0.32, de maat die er stond toen het nog vastlag.
   */
  navDeel?: number
  /**
   * De geheime sleutel in het adres van de webpagina voor je telefoon of tablet
   * (zie main/apparaat.ts), en de poort waarop die luistert.
   *
   * Bewaard, zodat een bladwijzer of een icoon op het beginscherm van de telefoon
   * na een herstart van de app nog werkt. "Nieuwe link" in de overlay maakt een
   * nieuwe sleutel, en dan werkt de oude nergens meer.
   */
  apparaatSleutel?: string
  apparaatPoort?: number
}

function settingsPath(userDataPath: string): string {
  return join(userDataPath, 'settings.json')
}

/*
 * Binnen de grenzen houden. Een deel van 0.02 uit een oud of aangepast
 * bestand zou de kaart tot een streep maken en de scheiding onvindbaar;
 * NaN zou de hele indeling laten instorten.
 */
function geldigNavDeel(waarde: unknown): number | undefined {
  return typeof waarde === 'number' && Number.isFinite(waarde)
    ? Math.min(0.62, Math.max(0.18, waarde))
    : undefined
}

/** Een sleutel zoals `randomBytes(...).toString('base64url')` hem maakt, anders niets. */
function geldigeSleutel(waarde: unknown): string | undefined {
  return typeof waarde === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(waarde) ? waarde : undefined
}

/** Een poort die een gewoon programma mag openen. */
function geldigePoort(waarde: unknown): number | undefined {
  return typeof waarde === 'number' && Number.isInteger(waarde) && waarde >= 1024 && waarde <= 65535
    ? waarde
    : undefined
}

export function readSettings(userDataPath: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(userDataPath), 'utf8')) as Partial<Settings>
    return {
      language: isLanguage(raw.language) ? raw.language : DEFAULT_LANGUAGE,
      overlayRate: isOverlayRate(raw.overlayRate) ? raw.overlayRate : 'rustig',
      windowedOmsi: raw.windowedOmsi !== false,
      omsiPath: typeof raw.omsiPath === 'string' && raw.omsiPath ? raw.omsiPath : undefined,
      omsiConfirmed: raw.omsiConfirmed === true,
      theme:
        raw.theme === 'licht' || raw.theme === 'donker' || raw.theme === 'systeem'
          ? raw.theme
          : 'systeem',
      mapView: raw.mapView === 'lijst' ? 'lijst' : 'tegels',
      languageChosen: raw.languageChosen === true,
      busPhotosOffered: raw.busPhotosOffered === true,
      tourSeen: raw.tourSeen === true,
      animaties: raw.animaties === 'aan' || raw.animaties === 'uit' ? raw.animaties : 'systeem',
      overlayWaarschuwing:
        raw.overlayWaarschuwing && typeof raw.overlayWaarschuwing === 'object'
          ? raw.overlayWaarschuwing
          : undefined,
      navDeel: geldigNavDeel(raw.navDeel),
      apparaatSleutel: geldigeSleutel(raw.apparaatSleutel),
      apparaatPoort: geldigePoort(raw.apparaatPoort)
    }
  } catch {
    return {
      language: DEFAULT_LANGUAGE,
      overlayRate: 'rustig',
      windowedOmsi: true,
      theme: 'systeem',
      mapView: 'tegels',
      languageChosen: false,
      busPhotosOffered: false,
      tourSeen: false,
      animaties: 'systeem'
    }
  }
}

/**
 * Bewaart wat er meegegeven wordt en laat de rest staan. De app slaat vaak maar
 * één ding op -- de taal bij het wisselen, de verversing bij het schuiven -- en
 * het zou raar zijn als de taal daarmee de vloeiendheid terugzet.
 */
export function writeSettings(userDataPath: string, settings: Partial<Settings>): Settings {
  const current = readSettings(userDataPath)
  const clean: Settings = {
    language: isLanguage(settings.language) ? settings.language : current.language,
    overlayRate: isOverlayRate(settings.overlayRate) ? settings.overlayRate : current.overlayRate,
    windowedOmsi:
      typeof settings.windowedOmsi === 'boolean' ? settings.windowedOmsi : current.windowedOmsi,
    omsiPath:
      typeof settings.omsiPath === 'string'
        ? settings.omsiPath || undefined
        : current.omsiPath,
    omsiConfirmed:
      typeof settings.omsiConfirmed === 'boolean' ? settings.omsiConfirmed : current.omsiConfirmed,
    theme:
      settings.theme === 'licht' || settings.theme === 'donker' || settings.theme === 'systeem'
        ? settings.theme
        : current.theme,
    mapView:
      settings.mapView === 'tegels' || settings.mapView === 'lijst'
        ? settings.mapView
        : current.mapView,
    languageChosen:
      typeof settings.languageChosen === 'boolean'
        ? settings.languageChosen
        : current.languageChosen,
    busPhotosOffered:
      typeof settings.busPhotosOffered === 'boolean'
        ? settings.busPhotosOffered
        : current.busPhotosOffered,
    // Hoort in deze lijst, anders valt hij weg zodra iets anders bewaard wordt (zie navDeel).
    tourSeen: typeof settings.tourSeen === 'boolean' ? settings.tourSeen : current.tourSeen,
    animaties:
      settings.animaties === 'systeem' || settings.animaties === 'aan' || settings.animaties === 'uit'
        ? settings.animaties
        : current.animaties,
    overlayWaarschuwing:
      settings.overlayWaarschuwing && typeof settings.overlayWaarschuwing === 'object'
        ? { ...current.overlayWaarschuwing, ...settings.overlayWaarschuwing }
        : current.overlayWaarschuwing,
    /*
     * Stond hier niet bij, en `clean` vervangt het hele bestand: de versleepte
     * scheiding op het rijscherm kwam nooit in settings.json en sprong elke
     * keer dat het rijscherm openging terug naar 0.32.
     */
    navDeel: geldigNavDeel(settings.navDeel) ?? current.navDeel,
    apparaatSleutel: geldigeSleutel(settings.apparaatSleutel) ?? current.apparaatSleutel,
    apparaatPoort: geldigePoort(settings.apparaatPoort) ?? current.apparaatPoort
  }
  const path = settingsPath(userDataPath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(clean, undefined, 2)}\n`, 'utf8')
  return clean
}
