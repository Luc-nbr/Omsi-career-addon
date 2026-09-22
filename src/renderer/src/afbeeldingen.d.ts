/**
 * Een afbeelding uit de map van de renderer importeren geeft haar adres.
 *
 * Vite zet het bestand bij het bouwen in de bundel en geeft de URL terug. De
 * typen daarvoor staan in `vite/client`, maar die haalt dit project niet binnen
 * (alleen `node`), dus hier alleen wat de app gebruikt.
 */
declare module '*.webp' {
  const adres: string
  export default adres
}
