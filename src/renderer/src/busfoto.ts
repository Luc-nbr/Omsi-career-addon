/**
 * Een bus in beeld brengen, in een venster dat niemand ziet.
 *
 * WAAROM DIT BESTAAT
 * In de buskeuze staan uitvoeringen die alleen in hun kleurstelling verschillen
 * -- `MB_C2_EN_BVG` alleen al heeft er 85, met namen die je uit elkaar moet
 * pluizen. Wie de bus ziet, kiest wat hij wil rijden. OMSI heeft daar geen
 * plaatje voor: van de 166 voertuigmappen heeft er geen één een voorbeeldfoto,
 * het spel tekent zijn eigen model in het menu. Dus tekenen wij het ook.
 *
 * Het gebeurt hier en niet in het hoofdproces omdat tekenen een tekenkaart
 * vraagt, en die zit aan een venster. Het venster staat verborgen: het krijgt
 * een tekening binnen, maakt er een PNG van, en stuurt die terug. Daarna wordt
 * het plaatje bewaard, want dit kost tijd -- het uitlezen van de honderden
 * onderdelen van één bus duurde gemeten 266 tot 1092 ms.
 */

/** Wat het hoofdproces stuurt. De buffers komen zonder kopie aan. */
interface Stuk {
  posities: Float32Array
  normalen: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  /** Welke plaat uit `platen`; -1 als er geen textuur bij hoort. */
  plaat: number
}

/**
 * Een textuur, in twee soorten.
 *
 * Wat het hoofdproces zelf uitpakte (.dds en .tga) komt als kale pixels binnen;
 * de rest komt als gegevens-URL en laat Chromium het decoderen -- dat kan hij
 * voor .bmp, .png en .jpg beter dan wij.
 */
type Plaat = { breedte: number; hoogte: number; pixels: Uint8Array } | { bron: string }

interface Tekening {
  stukken: Stuk[]
  platen: Plaat[]
  doos: { min: [number, number, number]; max: [number, number, number] }
  breedte: number
  hoogte: number
  /** Achtergrond; doorzichtig als hij ontbreekt. */
  achtergrond?: [number, number, number, number]
}

/* Dit bestand is een module (zie `export {}` onderaan); zo mag `declare global`. */
declare global {
  interface Window {
    busfoto: {
      opTekening(doen: (plan: Tekening) => void): void
      klaar(png: string, tijden?: unknown): void
      mislukt(reden: string): void
    }
  }
}

const HOEKPUNT_SHADER = `#version 300 es
in vec3 plek;
in vec3 normaal;
in vec2 uv;
uniform mat4 beeld;
out vec3 vNormaal;
out vec2 vUv;
void main() {
  vNormaal = normaal;
  vUv = uv;
  gl_Position = beeld * vec4(plek, 1.0);
}`

/*
 * Twee lampen en een vloer aan licht: een bus die van één kant belicht wordt
 * valt aan de andere kant in het zwart, en dan zie je juist de kleurstelling
 * niet die je wilde laten zien.
 */
const KLEUR_SHADER = `#version 300 es
precision highp float;
in vec3 vNormaal;
in vec2 vUv;
uniform sampler2D plaat;
uniform bool metPlaat;
out vec4 kleur;
void main() {
  vec3 n = normalize(vNormaal);
  if (dot(n, n) < 0.001) n = vec3(0.0, 1.0, 0.0);
  float voor = max(dot(n, normalize(vec3(-0.4, 0.75, 0.55))), 0.0);
  float achter = max(dot(n, normalize(vec3(0.6, 0.3, -0.5))), 0.0) * 0.35;
  float licht = 0.35 + voor * 0.75 + achter;
  vec4 grond = metPlaat ? texture(plaat, vUv) : vec4(0.72, 0.74, 0.78, 1.0);
  /*
   * Niet op alfa wegknippen.
   *
   * Hier stond 'is de alfa onder 0,35, laat het vlak dan weg'. Dat leek
   * logisch en gooide juist de hele bus weg: bij OMSI is de alfa van een
   * carrosserietextuur het spiegelmasker van [matl_envmap], geen dekking.
   * Gemeten: newC2_77.tga heeft 100,0 procent van zijn pixels onder die
   * drempel, newC2EG.tga 99,6 en SD77_01.tga 100,0 -- en bij geen van die
   * onderdelen staat [matl_alpha] in de cfg. Zo verdween 18 tot 52 procent van
   * de driehoeken, de buitenhuid voorop.
   */
  kleur = vec4(grond.rgb * licht, 1.0);
}`

function maakShader(gl: WebGL2RenderingContext, soort: number, bron: string): WebGLShader {
  const shader = gl.createShader(soort)
  if (!shader) throw new Error('geen shader')
  gl.shaderSource(shader, bron)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader mislukt')
  }
  return shader
}

/**
 * De camera: schuin van voren, zoals een bus op een foto staat.
 *
 * De bus ligt in OMSI met zijn lengte langs de z-as en zijn hoogte langs y. We
 * kijken van links-voor omlaag, en de afstand komt uit de doos: zo vult elke
 * bus het beeld even goed, of hij nu tien of achttien meter lang is.
 */
function beeldmatrix(doos: Tekening['doos'], breedte: number, hoogte: number): Float32Array {
  const midden = [
    (doos.min[0] + doos.max[0]) / 2,
    (doos.min[1] + doos.max[1]) / 2,
    (doos.min[2] + doos.max[2]) / 2
  ]
  const maat = Math.max(
    doos.max[0] - doos.min[0],
    doos.max[1] - doos.min[1],
    doos.max[2] - doos.min[2],
    1
  )

  const afstand = maat * 1.15
  const hoek = Math.PI * 0.32
  const oog = [
    midden[0] + Math.cos(hoek) * afstand,
    midden[1] + maat * 0.32,
    midden[2] + Math.sin(hoek) * afstand
  ]

  /*
   * OMSI rekent linkshandig: x is de deurkant, y omhoog, z naar voren. Gemeten
   * aan een bus: het stuur ligt op x -0,96 tot -0,49, de deuren op +0,31 tot
   * +1,27, en de lijnfilm vooraan op z +5,66. Een gewone (rechtshandige)
   * lookAt levert daardoor een spiegelbeeld -- opschriften lezen achterstevoren,
   * en dat krijg je met geen enkele camerastand goed. Vandaar de omgekeerde
   * volgorde in deze twee kruisproducten.
   */
  const kijk = normaliseer([midden[0] - oog[0], midden[1] - oog[1], midden[2] - oog[2]])
  const rechts = normaliseer(kruis([0, 1, 0], kijk))
  const op = kruis(kijk, rechts)

  const zicht = 45 * (Math.PI / 180)
  const f = 1 / Math.tan(zicht / 2)
  const verhouding = breedte / hoogte
  const dichtbij = 0.1
  const ver = maat * 8

  // Kijkrichting en projectie in één matrix; kolomgewijs, zoals WebGL wil.
  const b = [
    rechts[0], op[0], -kijk[0], 0,
    rechts[1], op[1], -kijk[1], 0,
    rechts[2], op[2], -kijk[2], 0,
    -punt(rechts, oog), -punt(op, oog), punt(kijk, oog), 1
  ]
  const p = [
    f / verhouding, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (ver + dichtbij) / (dichtbij - ver), -1,
    0, 0, (2 * ver * dichtbij) / (dichtbij - ver), 0
  ]
  return vermenigvuldig(p, b)
}

const punt = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const kruis = (a: number[], b: number[]): number[] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
function normaliseer(a: number[]): number[] {
  const lengte = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / lengte, a[1] / lengte, a[2] / lengte]
}
function vermenigvuldig(a: number[], b: number[]): Float32Array {
  const uit = new Float32Array(16)
  for (let rij = 0; rij < 4; rij++) {
    for (let kolom = 0; kolom < 4; kolom++) {
      let som = 0
      for (let k = 0; k < 4; k++) som += a[k * 4 + kolom] * b[rij * 4 + k]
      uit[rij * 4 + kolom] = som
    }
  }
  return uit
}

/** De platen omzetten naar iets wat WebGL kan gebruiken. */
async function maakPlaten(gl: WebGL2RenderingContext, platen: Plaat[]): Promise<Array<WebGLTexture | undefined>> {
  const uit: Array<WebGLTexture | undefined> = []
  for (const plaat of platen) {
    const textuur = gl.createTexture()
    if (!textuur) {
      uit.push(undefined)
      continue
    }
    gl.bindTexture(gl.TEXTURE_2D, textuur)
    try {
      if ('pixels' in plaat) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          plaat.breedte,
          plaat.hoogte,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          plaat.pixels
        )
      } else {
        /*
         * Met een <img> en niet met `fetch`: het beleid van deze pagina laat
         * gegevens-URL's toe als afbeelding (`img-src data:`), maar een fetch
         * ernaartoe valt onder `connect-src` en wordt geweigerd.
         */
        const beeld = new Image()
        beeld.src = plaat.bron
        await beeld.decode()
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, beeld)
      }
      /*
       * Mipmaps mogen alleen bij machten van twee in WebGL2? Nee -- WebGL2 kan
       * het voor elke maat. Wel eerst de wikkeling op klemmen zetten, anders
       * herhaalt een textuur die net niet past zich over de rand.
       */
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      uit.push(textuur)
    } catch {
      uit.push(undefined)
    }
  }
  return uit
}

/* Waar de tijd heen gaat; het hoofdproces zet het in het logboek. */
export interface Tijden {
  platen: number
  buffers: number
  tekenen: number
  png: number
}

async function teken(plan: Tekening, tijden: Tijden): Promise<string> {
  const doek = document.getElementById('doek') as HTMLCanvasElement
  doek.width = plan.breedte
  doek.height = plan.hoogte
  const gl = doek.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true })
  if (!gl) throw new Error('geen webgl2')

  const programma = gl.createProgram()
  if (!programma) throw new Error('geen programma')
  gl.attachShader(programma, maakShader(gl, gl.VERTEX_SHADER, HOEKPUNT_SHADER))
  gl.attachShader(programma, maakShader(gl, gl.FRAGMENT_SHADER, KLEUR_SHADER))
  gl.linkProgram(programma)
  if (!gl.getProgramParameter(programma, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(programma) ?? 'koppelen mislukt')
  }
  gl.useProgram(programma)

  const achter = plan.achtergrond ?? [0, 0, 0, 0]
  gl.clearColor(achter[0], achter[1], achter[2], achter[3])
  gl.enable(gl.DEPTH_TEST)
  /*
   * De achterkant van elk vlak wegsnijden.
   *
   * Dat kan: over vijf bussen loopt 98,7 tot 99,9 procent van de driehoeken
   * dezelfde kant op. `frontFace(CW)` hoort erbij, want met het linkshandige
   * assenstelsel van OMSI (zie `beeldmatrix`) draait de wikkelrichting om;
   * zonder die regel klapt elke buitennormaal om en zakt de gemiddelde
   * helderheid van 98 naar 76.
   */
  gl.frontFace(gl.CW)
  gl.enable(gl.CULL_FACE)
  gl.viewport(0, 0, plan.breedte, plan.hoogte)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  const beeld = gl.getUniformLocation(programma, 'beeld')
  gl.uniformMatrix4fv(beeld, false, beeldmatrix(plan.doos, plan.breedte, plan.hoogte))
  const metPlaat = gl.getUniformLocation(programma, 'metPlaat')
  gl.uniform1i(gl.getUniformLocation(programma, 'plaat'), 0)

  const tPlaten = performance.now()
  const platen = await maakPlaten(gl, plan.platen ?? [])
  tijden.platen = Math.round(performance.now() - tPlaten)
  const tBuffers = performance.now()

  const aPlek = gl.getAttribLocation(programma, 'plek')
  const aNormaal = gl.getAttribLocation(programma, 'normaal')
  const aUv = gl.getAttribLocation(programma, 'uv')

  const buffers: WebGLBuffer[] = []
  for (const stuk of plan.stukken) {
    const zet = (data: ArrayBufferView, plaats: number, maat: number): void => {
      const buffer = gl.createBuffer()
      if (buffer) buffers.push(buffer)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(plaats)
      gl.vertexAttribPointer(plaats, maat, gl.FLOAT, false, 0, 0)
    }
    zet(stuk.posities, aPlek, 3)
    zet(stuk.normalen, aNormaal, 3)
    zet(stuk.uvs, aUv, 2)

    const elementen = gl.createBuffer()
    if (elementen) buffers.push(elementen)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementen)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, stuk.indices, gl.STATIC_DRAW)

    const plaat = stuk.plaat >= 0 ? platen[stuk.plaat] : undefined
    if (plaat) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, plaat)
      gl.uniform1i(metPlaat, 1)
    } else {
      gl.uniform1i(metPlaat, 0)
    }

    gl.drawElements(gl.TRIANGLES, stuk.indices.length, gl.UNSIGNED_INT, 0)
  }

  tijden.tekenen = Math.round(performance.now() - tBuffers)
  gl.finish()
  const tPng = performance.now()
  const png = doek.toDataURL('image/png')
  tijden.png = Math.round(performance.now() - tPng)

  /*
   * Opruimen. Dit venster blijft staan voor de volgende bus, en zonder dit
   * blijven de buffers en platen van elke vorige bus in het geheugen van de
   * tekenkaart hangen -- bij een model met veertig texturen loopt dat hard op.
   */
  for (const buffer of buffers) gl.deleteBuffer(buffer)
  for (const plaat of platen) if (plaat) gl.deleteTexture(plaat)
  gl.deleteProgram(programma)
  return png
}

window.busfoto.opTekening((plan) => {
  const tijden: Tijden = { platen: 0, buffers: 0, tekenen: 0, png: 0 }
  const begin = performance.now()
  void teken(plan, tijden)
    .then((png) => {
      tijden.buffers = Math.round(performance.now() - begin)
      window.busfoto.klaar(png, tijden)
    })
    .catch((fout) => window.busfoto.mislukt(fout instanceof Error ? fout.message : String(fout)))
})

export {}
