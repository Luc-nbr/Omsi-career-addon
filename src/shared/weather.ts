/**
 * Het weer waaruit gekozen kan worden.
 *
 * De getallen staan hier en niet bij de schrijver, omdat de interface ze ook
 * nodig heeft: die toont de keuzes. Ze zijn niet verzonnen maar overgenomen uit
 * het weer dat OMSI zelf meelevert -- "Bestes Wetter", "Sommerlich", "Sturm" en
 * "Dämmerungsnebel" -- zodat er niets onmogelijks in staat.
 *
 * Wat de velden doen, afgelezen aan die vier: `fog` is zicht in meters en een
 * helderheidsfactor, `clouds` een wolkentextuur (of -1 voor niets) met de hoogte
 * van de onderkant, `precip` de neerslag (eerste veld 0 droog, 1 nat) en
 * `groundwet` hoe nat het wegdek ligt.
 */

export type WeatherKind = 'clear' | 'summer' | 'cloudy' | 'rain' | 'fog'

export const WEATHER_KINDS: WeatherKind[] = ['clear', 'summer', 'cloudy', 'rain', 'fog']

export interface WeatherPreset {
  name: string
  fog: [number, number]
  wind: [number, number]
  temp: [number, number]
  press: number
  clouds: [string, number]
  precip: [number, number, number, number, number]
  groundwet: [number, number, number]
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherPreset> = {
  clear: {
    name: 'OMSI Career - helder',
    fog: [50000, 1],
    wind: [0, 0],
    temp: [15, 5],
    press: 1013,
    clouds: ['-1', 0],
    precip: [0, 32, 0, 0, 0],
    groundwet: [0, 0, 0]
  },
  summer: {
    name: 'OMSI Career - zomers',
    fog: [2000, 1],
    wind: [70, 0.836],
    temp: [25, 10.84],
    press: 1022,
    clouds: ['Cumulus 1', 300],
    precip: [0, 32, 0, -2, 0],
    groundwet: [0, 0, 0]
  },
  cloudy: {
    name: 'OMSI Career - bewolkt',
    fog: [1500, 1],
    wind: [120, 3.5],
    temp: [14, 10],
    press: 1015,
    clouds: ['Cumulus 2', 300],
    precip: [0, 32, 0, -2, 0],
    groundwet: [0, 0, 0]
  },
  rain: {
    name: 'OMSI Career - regen',
    fog: [700, 0.5],
    wind: [209, 18.92],
    temp: [9, 9],
    press: 1013,
    clouds: ['Cumulus 3', 50],
    precip: [1, 132, 0, -2, 0],
    groundwet: [37.64, 255, 0]
  },
  fog: {
    name: 'OMSI Career - mist',
    fog: [300, 0.5],
    wind: [94, 2.36],
    temp: [8, 8],
    press: 1013,
    clouds: ['-1', 50],
    // Droog, maar het wegdek blijft nat van de mist.
    precip: [0, 32, 0, -2, 0],
    groundwet: [36.69, 250.05, 0]
  }
}
