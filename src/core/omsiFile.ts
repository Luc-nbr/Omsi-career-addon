import { readFileSync } from 'node:fs'
import iconv from 'iconv-lite'

/**
 * OMSI-configbestanden zijn regelgebaseerd: een `[tag]` op een eigen regel wordt
 * gevolgd door een vast aantal waarderegels, daarna meestal een lege regel.
 *
 * Lege regels binnen een blok zijn echte, lege velden en mogen NIET worden
 * overgeslagen. `[trip]` heeft drie velden (ident, eindbestemming, lijnnummer);
 * bij bussen is de eerste leeg, bij S-Bahn-ritten de derde. Wie blanks filtert
 * krijgt alles een positie opgeschoven en leest het lijnnummer als bestemming.
 */
export interface Block {
  tag: string
  values: string[]
}

/** Aantal waarderegels per tag. Alleen tags hierin worden uitgelezen. */
export type BlockSchema = Record<string, number>

const BOM_UTF16LE = [0xff, 0xfe]
const BOM_UTF8 = [0xef, 0xbb, 0xbf]

function startsWith(buf: Buffer, bytes: number[]): boolean {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b)
}

/**
 * Leest een OMSI-bestand als regels. Situatiebestanden (.osn) zijn UTF-16LE,
 * de rest is Windows-1252 — dat laatste is geen latin-1: de tekens 0x80-0x9F
 * verschillen, en OMSI-addons gebruiken die voor aanhalingstekens en €.
 */
export function readOmsiLines(path: string): string[] {
  const raw = readFileSync(path)
  let text: string
  if (startsWith(raw, BOM_UTF16LE)) {
    text = raw.subarray(2).toString('utf16le')
  } else if (startsWith(raw, BOM_UTF8)) {
    text = raw.subarray(3).toString('utf8')
  } else {
    text = iconv.decode(raw, 'win1252')
  }
  return text.split(/\r?\n/).map((line) => line.replace(/\r$/, ''))
}

/**
 * Haalt alle blokken uit een reeks regels waarvan de tag in het schema staat.
 * Regels buiten een blok zijn commentaar (OMSI-editors schrijven er kopjes en
 * `Dep.: 5:10:0`-notities tussen) en worden genegeerd.
 */
export function parseBlocks(lines: string[], schema: BlockSchema): Block[] {
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const tag = lines[i].trim()
    if (!tag.startsWith('[') || !tag.endsWith(']')) continue
    const count = schema[tag]
    if (count === undefined) continue
    blocks.push({ tag, values: lines.slice(i + 1, i + 1 + count) })
    i += count
  }
  return blocks
}

/** Leest en parseert in één stap. */
export function parseOmsiFile(path: string, schema: BlockSchema): Block[] {
  return parseBlocks(readOmsiLines(path), schema)
}

/** Getal uit een veld; lege of onleesbare velden worden `fallback`. */
export function num(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat((value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Tekst uit een veld, zonder omliggende spaties. */
export function str(value: string | undefined): string {
  return (value ?? '').trim()
}
