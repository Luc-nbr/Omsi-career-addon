/** Wordt bij het bouwen ingevuld uit package.json; zie electron.vite.config.ts. */
declare const __APP_VERSION__: string

/**
 * De bouwstempel: de korte git-hash (met een + als er onvastgelegde wijzigingen
 * waren) en het moment van bouwen; zie electron.vite.config.ts en
 * main/versiewacht.ts.
 */
declare const __BOUW__: { hash: string; tijd: string; iso: string }
