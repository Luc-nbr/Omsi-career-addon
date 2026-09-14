/**
 * Het dienstkaartje afdrukken op een bonprinter.
 *
 * Er wordt via het Windows-stuurprogramma afgedrukt, niet met rauwe
 * ESC/POS-opdrachten. Dat laatste geeft meer grip — automatisch afsnijden,
 * vetgedrukte regels — maar vereist dat je weet hoe de printer hangt (USB,
 * serieel, netwerk). Vrijwel elke 80mm-printer installeert een stuurprogramma,
 * en dan werkt dit zonder iets te hoeven weten.
 */

/** Papierbreedte van een bonprinter, in micrometers. */
export const RECEIPT_WIDTH_MICRONS = 80_000

/** CSS-pixels naar micrometers: 96 pixels per inch, 25 400 micrometer per inch. */
export function pxToMicrons(px: number): number {
  return Math.round(px * (25_400 / 96))
}

/**
 * Hoogte van de pagina uit de gemeten inhoud.
 *
 * Bonpapier is een rol: de pagina is precies zo lang als het kaartje, anders
 * schuift de printer een halve meter wit papier door. Er gaat wat marge bij
 * zodat de laatste regel niet in de afsnijrand valt.
 */
export function receiptHeightMicrons(contentPx: number): number {
  const withTail = pxToMicrons(contentPx) + 6_000
  // Onder de vier centimeter wordt het voor de meeste printers te kort.
  return Math.max(40_000, withTail)
}
