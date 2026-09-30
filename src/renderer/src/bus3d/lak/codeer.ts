import { codeerBc, type BcFormaat } from '../../../../shared/bcn'

/**
 * EEN CODEERWERKER VAN DE EXPORT (lakstudio-ontwerp §4.14, punt 4)
 *
 * De export codeert elk mipniveau in banden van 64 blokrijen, verdeeld over
 * N = min(4, hardwareConcurrency − 2) van deze werkers. Een band is een los stuk
 * van het niveau (blokken van 4x4 raken elkaar niet), dus de banden achter
 * elkaar zijn precies wat één werker voor het hele niveau zou geven.
 */
interface Vraag {
  id: number
  rgba: ArrayBuffer
  b: number
  h: number
  formaat: BcFormaat
  vanRij: number
  totRij: number
}

const doel = self as unknown as {
  onmessage: ((e: MessageEvent<Vraag>) => void) | null
  postMessage(bericht: unknown, overdracht?: Transferable[]): void
}

doel.onmessage = (e) => {
  const v = e.data
  try {
    const uit = codeerBc(new Uint8Array(v.rgba), v.b, v.h, v.formaat, v.vanRij, v.totRij)
    doel.postMessage({ id: v.id, blokken: uit.buffer }, [uit.buffer])
  } catch (fout) {
    doel.postMessage({ id: v.id, fout: String(fout) })
  }
}
