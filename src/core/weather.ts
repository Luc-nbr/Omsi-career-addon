import { writeFileSync } from 'node:fs'
import { WEATHER_PRESETS, type WeatherKind } from '../shared/weather'

/**
 * Het weer bij een situatie schrijven.
 *
 * OMSI zet het weer in een eigen bestand naast de situatie: `<situatie>.osn.owt`,
 * UTF-16 met dezelfde blokindeling als de rest. Welke waarden erin kunnen staat
 * in `shared/weather.ts`; de interface kiest daaruit.
 */

const BOM = Buffer.from([0xff, 0xfe])

function block(tag: string, values: Array<string | number>): string[] {
  return [tag, ...values.map((value) => (typeof value === 'number' ? value.toFixed(6) : value)), '']
}

/** Schrijft het weerbestand dat bij een situatie hoort. */
export function writeWeather(situationFile: string, kind: WeatherKind): string {
  const preset = WEATHER_PRESETS[kind] ?? WEATHER_PRESETS.clear
  const lines = [
    '[name]',
    preset.name,
    '',
    '[description]',
    '',
    '[end]',
    '',
    ...block('[fog]', preset.fog),
    ...block('[wind]', preset.wind),
    ...block('[temp]', preset.temp),
    ...block('[press]', [preset.press]),
    ...block('[clouds]', preset.clouds),
    ...block('[precip]', preset.precip),
    ...block('[groundwet]', preset.groundwet)
  ]
  const file = `${situationFile}.owt`
  writeFileSync(file, Buffer.concat([BOM, Buffer.from(lines.join('\r\n'), 'utf16le')]))
  return file
}
