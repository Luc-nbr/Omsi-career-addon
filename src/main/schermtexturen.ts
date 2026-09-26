import { basename } from 'node:path'
import { log, meet } from '../core/logboek'
import { beeldVoorBrowser, type TextuurBron } from '../core/schermtextuur'

/**
 * Het register van de plaatjes die de telefoon mag ophalen, en het geheugen
 * van wat er al omgezet is.
 *
 * WAAROM EEN REGISTER
 * De telefoon en de overlay vragen een plaatje op met een id, nooit met een
 * pad (`textuur/<id>` bij de tabletserver, `omsischerm://t/<id>` in de app).
 * Een id is alleen iets waard als de server het zelf heeft uitgegeven: bij het
 * bouwen van de schermvorm van de huidige bus, of bij een freetex-waarde van
 * die bus. Wat niet in dit register staat, bestaat voor de buitenwereld niet --
 * ook als het een geldig id van een andere bus is. Zo kan een telefoon in het
 * netwerk niet raden naar bestanden op de pc; hooguit naar plaatjes die hij
 * toch al te zien krijgt.
 *
 * WAAROM EEN GEHEUGEN
 * Omzetten kost tijd (gemeten met `scripts/probe-schermtextuur.ts`): een DXT3
 * van 512 x 512 uitpakken en als PNG inpakken 18 tot 40 ms, de atlas
 * `AFR200.dds` (DXT5, 2048 x 2048) 190 ms, een PNG van 2048 x 2048 met alfa
 * die dekkend moet ongeveer 500 ms (daarvan 350 ms het inpakken van een
 * fotoachtige textuur), en de grootste die een bus noemt,
 * `MAN_SL_SG\Texture\MAN_SL_ext.dds` (8192 x 2048), ongeveer 590 ms. Dat
 * gebeurt één keer per plaatje, daarna komt het uit het geheugen (0,005 ms).
 * De grens is 48 MB aan geleverde bytes: de 35 ALMEX-jpg's van de
 * `HH20_EBus2021` zijn samen 9,9 MB (ongewijzigd, 25 ms voor alle 35), de 25
 * ALMEX-DDS'en van de `HH109` als PNG 1,4 MB (425 ms samen). Wat het langst
 * niet is opgevraagd valt eruit (LRU); het is er daarna in dezelfde tijd weer.
 *
 * Het omzetten gebeurt hier in het hoofdproces, synchroon. Mocht dat bij grote
 * atlassen gaan haperen, dan kan `beeldVoorBrowser` ongewijzigd in de
 * kaartwerker: `core/schermtextuur.ts` heeft geen Electron nodig.
 */

/** Wat de browser krijgt: de bytes en hun soort. */
export interface Textuurbytes {
  bytes: Buffer
  type: string
}

/** De grens van het geheugen, in geleverde bytes. */
const GRENS_BYTES = 48 * 1024 * 1024

/**
 * Hoe lang een plaatje dat niet lukte met rust gelaten wordt. De telefoon
 * vraagt een mislukt plaatje om de paar seconden opnieuw; zonder deze pauze
 * zou een kapot bestand van 8 MB elke keer opnieuw gelezen worden. Na een
 * halve minuut mag het weer: misschien hield een virusscanner het even vast.
 */
const OPNIEUW_NA_MS = 30_000

const register = new Map<string, TextuurBron>()
/** In volgorde van gebruik: de eerste is het langst niet opgevraagd. */
const geleverd = new Map<string, Textuurbytes>()
let bytesInGeheugen = 0
const mislukt = new Map<string, number>()

/** Twintig kleine hextekens, zoals `textuurBron` ze maakt; verder niets. */
export function isTextuurId(id: string): boolean {
  return typeof id === 'string' && /^[0-9a-f]{20}$/.test(id)
}

/** Een plaatje opvraagbaar maken onder zijn id. */
export function registreer(bron: TextuurBron): void {
  if (!isTextuurId(bron.id)) return
  register.set(bron.id, bron)
}

/**
 * Alles uit het register halen behalve deze ids: bij een andere bus, of als
 * de vorm opnieuw gebouwd is. Wat al omgezet was blijft in het geheugen tot de
 * LRU het wegduwt -- het id hangt aan de inhoud, dus komt dezelfde textuur
 * terug (dezelfde bus opnieuw), dan is hij er meteen.
 */
export function vergeetBehalve(ids: Iterable<string>): void {
  const houden = new Set(ids)
  for (const id of [...register.keys()]) {
    if (houden.has(id)) continue
    register.delete(id)
    mislukt.delete(id)
  }
}

/**
 * De bytes van een geregistreerd plaatje, of `undefined` (geen geldig id,
 * niet geregistreerd, of niet te lezen).
 */
export function textuurBytes(id: string): Textuurbytes | undefined {
  if (!isTextuurId(id)) return undefined
  const bron = register.get(id)
  if (!bron) return undefined

  const bekend = geleverd.get(id)
  if (bekend) {
    // Achteraan zetten: nu het laatst gebruikt.
    geleverd.delete(id)
    geleverd.set(id, bekend)
    return bekend
  }

  const eerder = mislukt.get(id)
  if (eerder !== undefined && Date.now() - eerder < OPNIEUW_NA_MS) return undefined

  const uit = meet(`schermtextuur ${basename(bron.pad)}`, () => {
    try {
      return beeldVoorBrowser(bron)
    } catch (fout) {
      // beeldVoorBrowser gooit niet; mocht het toch, dan niet de server mee.
      log(`schermtextuur: ${bron.pad}: ${(fout as Error).message}`)
      return undefined
    }
  })
  if (!uit) {
    mislukt.set(id, Date.now())
    log(`schermtextuur: ${bron.pad} niet te leveren`)
    return undefined
  }
  mislukt.delete(id)
  if (uit.melding) log(`schermtextuur: ${bron.pad}: ${uit.melding}`)

  const antwoord: Textuurbytes = { bytes: uit.bytes, type: uit.type }
  onthoud(id, antwoord)
  return antwoord
}

/** In het geheugen zetten en de oudste eruit tot het weer past. */
function onthoud(id: string, antwoord: Textuurbytes): void {
  // Groter dan het hele geheugen: wel leveren, niet bewaren.
  if (antwoord.bytes.length > GRENS_BYTES) return
  geleverd.set(id, antwoord)
  bytesInGeheugen += antwoord.bytes.length
  for (const [oudId, oud] of geleverd) {
    if (bytesInGeheugen <= GRENS_BYTES) break
    geleverd.delete(oudId)
    bytesInGeheugen -= oud.bytes.length
  }
}

/** Voor de diagnose en de probe: hoeveel er geregistreerd en bewaard is. */
export function schermtexturenStand(): { geregistreerd: number; bewaard: number; bytes: number } {
  return { geregistreerd: register.size, bewaard: geleverd.size, bytes: bytesInGeheugen }
}
