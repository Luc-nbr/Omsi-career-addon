/**
 * De talen van de app en de teksten die erbij horen.
 *
 * Engels staat voorop: OMSI is een Duits spel met een internationale
 * gemeenschap, en wie de app voor het eerst opent heeft nog niets gekozen. De
 * volgorde daarna is Duits, Frans, Nederlands.
 */

export const LANGUAGES = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'nl', native: 'Nederlands' }
] as const

export type Language = (typeof LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value)
}

/**
 * Alle teksten staan bij elkaar in plaats van per taal in een eigen bestand.
 * Zo zie je bij het toevoegen van een regel meteen welke taal nog ontbreekt.
 */
const TEXT = {
  'welcome.title': {
    en: 'Welcome to OMSI Career',
    de: 'Willkommen bei OMSI Career',
    fr: 'Bienvenue dans OMSI Career',
    nl: 'Welkom bij OMSI Career'
  },
  'welcome.intro': {
    en: 'OMSI Career turns the maps you already own into a job. Choose how long you want to drive and you get a real duty: the line, the tour, the IBIS codes to key in and the stop where your bus belongs.',
    de: 'OMSI Career macht aus den Karten, die du schon hast, einen Dienst. Du wählst, wie lange du fahren möchtest, und bekommst einen echten Umlauf: Linie, Kurs, die IBIS-Eingaben und die Haltestelle, an der dein Bus stehen muss.',
    fr: 'OMSI Career transforme les cartes que vous possédez déjà en service. Choisissez la durée de conduite et vous recevez un vrai roulement : la ligne, le tour, les codes IBIS à saisir et l’arrêt où placer votre bus.',
    nl: 'OMSI Career maakt van de kaarten die je al hebt een dienst. Je kiest hoe lang je wilt rijden en krijgt een echte omloop: de lijn, het omloopnummer, de IBIS-codes die je moet intoetsen en de halte waar je bus hoort te staan.'
  },
  'welcome.language': {
    en: 'Language',
    de: 'Sprache',
    fr: 'Langue',
    nl: 'Taal'
  },
  'welcome.languageNote': {
    en: 'You can change this later in the sidebar.',
    de: 'Das lässt sich später in der Seitenleiste ändern.',
    fr: 'Vous pourrez le changer plus tard dans le panneau latéral.',
    nl: 'Dit kun je later in de zijbalk aanpassen.'
  },
  'welcome.accountTitle': {
    en: 'Your account',
    de: 'Dein Konto',
    fr: 'Votre compte',
    nl: 'Je account'
  },
  'welcome.accountIntro': {
    en: 'Your duties, kilometres and earnings are kept per driver. Everything stays on this computer — there is nothing to sign in to.',
    de: 'Deine Dienste, Kilometer und Einnahmen werden je Fahrer gespeichert. Alles bleibt auf diesem Rechner — es gibt nichts, wo du dich anmelden musst.',
    fr: 'Vos services, kilomètres et recettes sont enregistrés par conducteur. Tout reste sur cet ordinateur — il n’y a aucune connexion à créer.',
    nl: 'Je diensten, kilometers en verdiensten worden per chauffeur bewaard. Alles blijft op deze computer staan — er is nergens om in te loggen.'
  },
  'welcome.name': {
    en: 'Driver name',
    de: 'Name des Fahrers',
    fr: 'Nom du conducteur',
    nl: 'Naam van de chauffeur'
  },
  'welcome.namePlaceholder': {
    en: 'For example Luc',
    de: 'Zum Beispiel Luc',
    fr: 'Par exemple Luc',
    nl: 'Bijvoorbeeld Luc'
  },
  'welcome.create': {
    en: 'Create account',
    de: 'Konto anlegen',
    fr: 'Créer le compte',
    nl: 'Account aanmaken'
  },
  'welcome.creating': {
    en: 'Creating…',
    de: 'Wird angelegt…',
    fr: 'Création…',
    nl: 'Bezig…'
  },
  'app.loading': {
    en: 'Reading the timetables…',
    de: 'Fahrpläne werden eingelesen…',
    fr: 'Lecture des horaires…',
    nl: 'Dienstregeling inlezen…'
  },
  'app.loadingSub': {
    en: 'Going through every map, tour and vehicle you have installed.',
    de: 'Alle installierten Karten, Umläufe und Fahrzeuge werden durchgegangen.',
    fr: 'Toutes les cartes, tous les roulements et tous les véhicules installés sont parcourus.',
    nl: 'Alle kaarten, omlopen en voertuigen worden doorgenomen.'
  }
} as const

export type TextKey = keyof typeof TEXT

/** Zoekt een tekst op. Ontbreekt de taal, dan valt hij terug op het Engels. */
export function t(language: Language, key: TextKey): string {
  const entry: Record<string, string> = TEXT[key]
  return entry[language] ?? entry[DEFAULT_LANGUAGE]
}
