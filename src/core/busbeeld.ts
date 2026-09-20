import { leesBusModel } from './busmodel'
import { leesO3d } from './o3d'

/**
 * Van een bus naar iets wat een tekenaar begrijpt.
 *
 * WAAROM DIT BESTAAT
 * Een bus is in OMSI geen bestand maar een stapel: een `.bus` wijst naar een
 * `model.cfg`, die wijst naar honderden `.o3d`-bestanden, en elk daarvan draagt
 * zijn eigen hoekpunten, driehoeken en materiaalnummers. Gemeten over alle 342
 * bestuurbare bussen: gemiddeld 331.000 driehoeken uit een paar honderd
 * onderdelen, en voor de zwaarste (MAN Lion's City, 854 onderdelen) ruim een
 * miljoen. Dat wil je één keer uitrekenen en daarna bewaren, niet elke keer dat
 * iemand een bus aanwijst.
 *
 * Hier wordt die stapel plat geslagen tot een handvol buffers die zo de
 * tekenkaart in kunnen: per stuk een lijst hoekpunten, normalen, uv's en
 * driehoeken, met de textuur die erop hoort. Dat gaat als `ArrayBuffer` door de
 * IPC, dus zonder kopieerwerk in JSON.
 */

/** Eén stuk om te tekenen: een groep driehoeken met dezelfde textuur. */
export interface BusStuk {
  posities: Float32Array
  normalen: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  /** Volledig pad naar de textuur; ontbreekt als er geen textuur bij hoort. */
  textuur?: string
}

export interface BusTekening {
  stukken: BusStuk[]
  /**
   * De doos om de bus heen, om de camera op te richten.
   *
   * Niet de uiterste punten, maar de middelste 98 procent. Dat is geen
   * nauwkeurigheidsverlies maar een noodzaak: een SD200 mat zo 36 bij 14 bij
   * 260 meter en een Citaro 29 bij 115 bij 63, omdat er onderdelen tussen
   * zitten die ergens ver weg geparkeerd staan -- hulpstukken, dingen die een
   * animatie pas op zijn plek zet. Op de uitersten richten levert een bus van
   * drie pixels in een leeg beeld. Van de middelste 98 procent blijft een bus
   * over die eruitziet als een bus.
   */
  doos: { min: [number, number, number]; max: [number, number, number] }
  driehoeken: number
  /** Onderdelen die we niet konden lezen; puur om te melden. */
  overgeslagen: number
}

/**
 * Een 4x4-matrix (rijgewijs, zoals o3d hem opschrijft) op een punt toepassen.
 *
 * Staat er klaar, maar wordt met opzet niet gevoed met de matrix uit het
 * bestand. Gemeten: mét die matrix meet een MAN SD200 34 bij 12 bij 18 meter,
 * een Citaro 7 bij 5 bij 16 en een C2 7 bij 20 bij 17. Zonder meten ze alle
 * drie wat een bus meet: 2,5 breed, 2,4 tot 3,9 hoog, 10,5 tot 16,7 lang. Het
 * blok hoort dus bij de animatie van een onderdeel en niet bij de plaats waar
 * het in de bus zit -- die staat al in de hoekpunten zelf.
 */
function verplaats(m: number[] | undefined, x: number, y: number, z: number): [number, number, number] {
  if (!m || m.length < 16) return [x, y, z]
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ]
}

/** Hetzelfde voor een richting: zonder de verschuiving. */
function draai(m: number[] | undefined, x: number, y: number, z: number): [number, number, number] {
  if (!m || m.length < 16) return [x, y, z]
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z
  ]
}

/**
 * De tekening van één bus.
 *
 * Alles wat niet lukt wordt overgeslagen in plaats van dat het gooit: een bus
 * met één onleesbaar onderdeel is nog steeds een bus, en een plaatje met een
 * ontbrekende spiegel is beter dan geen plaatje.
 */
export function bouwBusTekening(busPad: string): BusTekening | undefined {
  const model = leesBusModel(busPad)
  if (!model) return undefined

  const stukken: BusStuk[] = []
  /* Een steekproef van de punten; miljoenen sorteren hoeft niet voor een doos. */
  const steekproef: [number[], number[], number[]] = [[], [], []]
  let driehoeken = 0
  let overgeslagen = 0

  for (const deel of model.onderdelen) {
    if (!deel.pad) {
      overgeslagen++
      continue
    }
    const mesh = leesO3d(deel.pad)
    if (!mesh || mesh.triangles.length === 0) {
      overgeslagen++
      continue
    }

    /*
     * De driehoeken op hun materiaalnummer sorteren. Dat nummer staat per
     * driehoek in het o3d-bestand en verwijst naar de `[matl]`-blokken van dit
     * onderdeel in model.cfg -- daar staat welke textuur erop hoort.
     */
    const perGroep = new Map<number, number[]>()
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const groep = mesh.materiaalPerDriehoek[t / 3] ?? 0
      const lijst = perGroep.get(groep) ?? []
      lijst.push(mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2])
      perGroep.set(groep, lijst)
    }

    const punten = mesh.vertices.length / 3
    const posities = new Float32Array(punten * 3)
    const normalen = new Float32Array(punten * 3)
    for (let i = 0; i < punten; i++) {
      /*
       * De matrix uit het o3d-bestand blijft liggen; zie `verplaats` hieronder.
       */
      const p = verplaats(undefined, mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2])
      const n = draai(undefined, mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2])
      posities[i * 3] = p[0]
      posities[i * 3 + 1] = p[1]
      posities[i * 3 + 2] = p[2]
      normalen[i * 3] = n[0]
      normalen[i * 3 + 1] = n[1]
      normalen[i * 3 + 2] = n[2]
      // Elk twintigste punt is genoeg: de doos hoeft niet op de millimeter.
      if (i % 20 === 0) {
        steekproef[0].push(p[0])
        steekproef[1].push(p[1])
        steekproef[2].push(p[2])
      }
    }

    for (const [groep, indices] of perGroep) {
      const materiaal = deel.materialen[groep] ?? deel.materialen[0]
      stukken.push({
        posities,
        normalen,
        uvs: mesh.uvs,
        indices: Uint32Array.from(indices),
        textuur: materiaal?.pad
      })
      driehoeken += indices.length / 3
    }
  }

  if (stukken.length === 0) return undefined

  /* De middelste 98 procent per as; zie de uitleg bij `doos` hierboven. */
  const grens = (waarden: number[], deel: number): number => {
    if (waarden.length === 0) return 0
    const op = [...waarden].sort((a, b) => a - b)
    return op[Math.min(op.length - 1, Math.max(0, Math.floor((op.length - 1) * deel)))]
  }
  const min: [number, number, number] = [
    grens(steekproef[0], 0.01),
    grens(steekproef[1], 0.01),
    grens(steekproef[2], 0.01)
  ]
  const max: [number, number, number] = [
    grens(steekproef[0], 0.99),
    grens(steekproef[1], 0.99),
    grens(steekproef[2], 0.99)
  ]
  return { stukken, doos: { min, max }, driehoeken, overgeslagen }
}
