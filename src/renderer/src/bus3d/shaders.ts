/**
 * DE SHADERS VAN HET 3D-VENSTER (bus3d-ontwerp §5.3-§5.6)
 *
 * Eén programma voor de bus, met de materiaalregels van OMSI als uniforms (geen
 * varianten: het aantal tekenbeurten is klein, want dichte stukken zijn per
 * materiaal samengevoegd). Daarnaast de hemel, de vloer, de schaduwkaart, de
 * contactschaduw, het vervagen daarvan en het omzetten van DXT zonder mips.
 *
 * LICHT (§5.5, idee uit openOMSI shader.wgsl:976-987)
 *   licht = zon · N·L · schaduw + hemel · (0,5 + 0,5·n.y) · mix(h, 1, schaduw) + omgeving
 *   (h = het hemellicht dat in de schaduw overblijft: openOMSI 0,6, bij ons geijkt 0,8; LICHT in teken.ts)
 *   kleur = textuur · diffuus · licht + textuur · emissie, plus Blinn-Phong aan de zonkant
 * Reflectie alleen waar de cfg `[matl_envmap]` zet: k = min(masker · sterkte, 1);
 * op glas k · (0,18 + 0,82·(1-N·V)^4) over de ruit, op lak k · lakglans · Schlick (F0 0,04).
 * De omgeving die weerspiegelt is dezelfde hemel en vloer als die getekend worden:
 * rechtstreeks uitgerekend in plaats van eerst in een kubuskaart (§5.5 noemde een
 * kaart van 128²; zo is er geen kaart en geen naad, en het kost één textuurblik).
 *
 * TONEMAPPING: Khronos PBR Neutral, nageschreven uit de gepubliceerde formule
 * (https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral), daarna
 * sRGB-codering in de shader: het doek zelf is gewoon RGBA8 met 4x MSAA.
 */

/** De gegevens per beeld, als één uniform-blok (std140). Zie `BeeldBlok` in teken.ts. */
const BEELD_BLOK = /* glsl */ `
layout(std140) uniform Beeld {
  mat4 uBeeldProj;
  mat4 uSchaduwMat;
  mat4 uInvBeeldProj;
  vec4 uOog;        // xyz oog, w belichting
  vec4 uZonRicht;   // xyz naar de zon, w azimut van de zon (rad)
  vec4 uZonKleur;   // rgb zon, w schaduwstraal (in kaartcoördinaten)
  vec4 uHemelLicht; // rgb licht van boven, w lakglans
  vec4 uOmgeving;   // rgb strooilicht, w wolkmaat (m)
  vec4 uVloer;      // rgb albedo van de vloer, w straal van de vloer (m)
  vec4 uContact;    // xy min X/Z van de contactkaart, zw 1/grootte
  vec4 uDivers;     // x hemeltextuur, y wolken, z normaal-verschuiving (m), w dieptebias
  vec4 uDivers2;    // x ruis-zaad, y contactsterkte, z hemel-u van de zon, w hemellicht in de schaduw (0,6)
};
`

const GEMEEN = /* glsl */ `
const float PI = 3.14159265;

vec3 naarSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float naarSrgb1(float c) {
  c = clamp(c, 0.0, 1.0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
float helderheid(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Khronos PBR Neutral (zie de kop van dit bestand).
vec3 neutraal(vec3 kleur) {
  const float beginDruk = 0.8 - 0.04;
  const float ontkleuring = 0.15;
  float x = min(kleur.r, min(kleur.g, kleur.b));
  float verschuiving = x < 0.08 ? x - 6.25 * x * x : 0.04;
  kleur -= verschuiving;
  float piek = max(kleur.r, max(kleur.g, kleur.b));
  if (piek < beginDruk) return kleur;
  const float d = 1.0 - beginDruk;
  float nieuwePiek = 1.0 - d * d / (piek + d - beginDruk);
  kleur *= nieuwePiek / piek;
  float g = 1.0 - 1.0 / (ontkleuring * (piek - nieuwePiek) + 1.0);
  return mix(kleur, vec3(nieuwePiek), g);
}

// Een beetje ruis tegen banden in de hemel en op de vloer (een half niveau van 8 bits).
float ruis(vec2 p) {
  return fract(sin(dot(p + uDivers2.x, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
}
vec4 uitvoer(vec3 lineair, float alfa) {
  return vec4(naarSrgb(neutraal(lineair)) + ruis(gl_FragCoord.xy) / 255.0, alfa);
}
`

/** De hemel van OMSI als functie van een richting, voor de koepel en voor reflecties. */
const HEMEL = /* glsl */ `
uniform sampler2D uHemelTex;
uniform sampler2D uWolkTex;

vec2 hemelUv(vec3 d) {
  float hoogte = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  // u = rondom ten opzichte van de zon (het lichte deel van himmel01 staat bij uDivers2.z), v = hoogte.
  float u = fract(uDivers2.z + (az - uZonRicht.w) / (2.0 * PI));
  float v = clamp(1.0 - max(hoogte, 0.0) / (0.5 * PI), 0.002, 0.996);
  return vec2(u, v);
}

vec3 hemelZonderWolken(vec3 d, float lod) {
  if (uDivers.x > 0.5) return textureLod(uHemelTex, hemelUv(d), lod).rgb;
  // Geen envir.cfg: een eigen verloop van horizon naar zenit.
  float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
  return mix(vec3(0.42, 0.55, 0.72), vec3(0.10, 0.24, 0.55), t);
}

vec3 hemelMetWolken(vec3 d) {
  vec3 c = hemelZonderWolken(d, 0.0);
  if (uDivers.y > 0.5 && d.y > 0.01) {
    // Een wolkenlaag op 1500 m, zoals de wolken van OMSI. Laag aan de hemel
    // wordt hij een streperige veeg (de textuur ligt er schuin); daar staan de
    // wolken van het panorama zelf al, dus pas vanaf een graad of twaalf erbij.
    vec2 p = (uOog.xz + d.xz * (1500.0 / d.y)) / uOmgeving.w;
    float a = texture(uWolkTex, p).a * smoothstep(0.2, 0.5, d.y);
    vec3 wolk = vec3(0.93, 0.94, 0.97) * (0.85 + 0.15 * max(dot(d, uZonRicht.xyz), 0.0));
    c = mix(c, wolk, a * 0.8);
  }
  return c;
}

/** Wat een glad oppervlak in richting d ziet: hemel, of de vloer eronder (voor reflecties). */
vec3 omgevingKleur(vec3 d) {
  vec3 horizon = hemelZonderWolken(vec3(d.x, 0.0, d.z) + vec3(0.0, 0.001, 0.0), 4.0);
  if (d.y >= 0.0) return mix(horizon, hemelZonderWolken(d, 4.0), smoothstep(0.0, 0.08, d.y));
  vec3 vloer = uVloer.rgb * (uZonKleur.rgb * max(uZonRicht.y, 0.0) + uHemelLicht.rgb + uOmgeving.rgb);
  return mix(horizon, vloer, smoothstep(0.0, -0.12, d.y));
}
`

/** De schaduwkaart met PCF: eerst 5 monsters, en alleen op de rand 16 erbij (§5.6). */
const SCHADUW = /* glsl */ `
uniform highp sampler2DShadow uSchaduwKaart;
const vec2 POISSON[16] = vec2[16](
  vec2(-0.9420, -0.3991), vec2(0.9456, -0.7689), vec2(-0.0942, -0.9294), vec2(0.3450, 0.2939),
  vec2(-0.9159, 0.4577), vec2(-0.8154, -0.8791), vec2(-0.3828, 0.2768), vec2(0.9748, 0.7565),
  vec2(0.4432, -0.9751), vec2(0.5374, -0.4737), vec2(-0.2650, -0.4189), vec2(0.7920, 0.1909),
  vec2(-0.2419, 0.9971), vec2(-0.8141, 0.9144), vec2(0.1998, 0.7864), vec2(0.1438, -0.1410)
);
float schaduw(vec3 p, vec3 n) {
  vec3 q = p + n * uDivers.z;
  vec4 s = uSchaduwMat * vec4(q, 1.0);
  vec3 c = s.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float z = c.z - uDivers.w;
  float r = uZonKleur.w;
  float som = texture(uSchaduwKaart, vec3(c.xy, z));
  for (int i = 0; i < 4; i++) som += texture(uSchaduwKaart, vec3(c.xy + POISSON[i] * r, z));
  if (som < 0.001 || som > 4.999) return som / 5.0;
  for (int i = 4; i < 16; i++) som += texture(uSchaduwKaart, vec3(c.xy + POISSON[i] * r, z));
  return som / 17.0;
}
`

// ------------------------------------------------------------ de bus

export const BUS_VS = /* glsl */ `#version 300 es
precision highp float;
${BEELD_BLOK}
layout(location = 0) in vec3 aPlek;
layout(location = 1) in vec3 aNormaal;
layout(location = 2) in vec2 aUv;
out vec3 vWereld;
out vec3 vNormaal;
out vec2 vUv;
void main() {
  // o3d (linkshandig) naar de wereld (rechtshandig): x spiegelen.
  vec3 p = vec3(-aPlek.x, aPlek.y, aPlek.z);
  vWereld = p;
  vNormaal = vec3(-aNormaal.x, aNormaal.y, aNormaal.z);
  vUv = aUv;
  gl_Position = uBeeldProj * vec4(p, 1.0);
}
`

export const BUS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${BEELD_BLOK}
${GEMEEN}
${HEMEL}
${SCHADUW}
in vec3 vWereld;
in vec3 vNormaal;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uTrans;
uniform sampler2D uMasker;
uniform vec4 uDiffuus;
uniform vec4 uSpec;       // rgb, macht
uniform vec3 uEmissie;
uniform int uModus;       // 0 dicht, 1 alfatest, 2 mengen, 3 [isshadow]
uniform int uTexModus;    // 0 geen, 1 textuur, 2 textuur die nog lineair moet (S3TC zonder sRGB)
uniform int uTransModus;  // 0 eigen alfa, 1 transmap-alfa, 2 transmap-helderheid, 3 niets (scripttextuur)
uniform int uMaskerModus; // 0 alfa van de textuur, 1 masker-alfa, 2 masker-helderheid
uniform int uGlas;
uniform int uVlak;        // 1: alleen wit (het masker van de proef), 2: de kleur van de tekenbeurt (diagnose)
uniform vec3 uId;
uniform float uEnv;
uniform float uAlfaSchaal;
out vec4 uitKleur;

void main() {
  if (uVlak == 1) {
    uitKleur = vec4(1.0);
    return;
  }
  vec3 V = normalize(uOog.xyz - vWereld);
  vec3 n = vNormaal;
  float ln = length(n);
  if (ln < 1e-4) {
    // Normaal van lengte 0 (0,19% van de hoekpunten): het vlak zelf, naar de kijker.
    n = normalize(cross(dFdx(vWereld), dFdy(vWereld)));
    if (dot(n, V) < 0.0) n = -n;
  } else {
    n /= ln;
  }

  vec4 tex = vec4(1.0);
  if (uTexModus >= 1) {
    tex = texture(uTex, vUv);
    if (uTexModus == 2) tex.rgb = pow(tex.rgb, vec3(2.2));
  }

  float alfa = 1.0;
  if (uModus >= 1) {
    float a = tex.a;
    if (uTransModus == 1) a = texture(uTrans, vUv).a;
    else if (uTransModus == 2) a = naarSrgb1(helderheid(texture(uTrans, vUv).rgb));
    else if (uTransModus == 3) a = 0.0;
    alfa = a * uDiffuus.a * uAlfaSchaal;
  }
  if (uModus == 1) {
    // Alpha-to-coverage met een verscherpte alfa: de drempel blijft op 0,5 (§5.3).
    float w = max(fwidth(alfa), 1e-4);
    alfa = clamp((alfa - 0.5) / w + 0.5, 0.0, 1.0);
    if (alfa <= 0.0) discard;
  } else if (uModus >= 2) {
    if (uModus == 3) alfa *= 0.6;
    if (alfa <= 0.003) discard;
  }
  if (uVlak == 2) {
    // Diagnose: welke tekenbeurt ligt hier bovenop (alleen waar hij echt te zien is).
    if (uModus >= 1 && alfa < 0.5) discard;
    uitKleur = vec4(uId, 1.0);
    return;
  }

  vec3 L = uZonRicht.xyz;
  float NdL = dot(n, L);
  float s = NdL > 0.0 ? schaduw(vWereld, n) : 0.0;
  vec3 zon = uZonKleur.rgb * max(NdL, 0.0) * s;
  vec3 licht = zon + uHemelLicht.rgb * (0.5 + 0.5 * n.y) * mix(uDivers2.w, 1.0, s) + uOmgeving.rgb;
  vec3 kleur = tex.rgb * uDiffuus.rgb * licht + tex.rgb * uEmissie;

  if (NdL > 0.0 && uSpec.a > 0.0 && (uSpec.r + uSpec.g + uSpec.b) > 0.0) {
    vec3 H = normalize(L + V);
    kleur += uSpec.rgb * pow(max(dot(n, H), 0.0), uSpec.a) * uZonKleur.rgb * s;
  }

  if (uEnv > 0.0) {
    // Het masker: de alfa van de textuur (bij OMSI het spiegelmasker), of een eigen
    // maskertextuur. Bij glas is de alfa de doorzichtigheid en geen masker: dan 1.
    float m = uGlas == 1 ? 1.0 : tex.a;
    if (uMaskerModus == 1) m = texture(uMasker, vUv).a;
    else if (uMaskerModus == 2) m = naarSrgb1(helderheid(texture(uMasker, vUv).rgb));
    float k = min(m * uEnv, 1.0);
    float NdV = clamp(dot(n, V), 0.0, 1.0);
    vec3 omg = omgevingKleur(reflect(-V, n));
    if (uGlas == 1) {
      // Glas: de weerspiegeling over de ruit, sterker onder een schuine hoek.
      float f = k * (0.18 + 0.82 * pow(1.0 - NdV, 4.0));
      float a2 = alfa + f * (1.0 - alfa);
      kleur = (kleur * alfa * (1.0 - f) + omg * f / max(uOog.w, 1e-3)) / max(a2, 1e-4);
      alfa = a2;
    } else {
      // Lak: gedempt en alleen op het masker (openOMSI zet dit op 0).
      float f = k * uHemelLicht.w * (0.04 + 0.96 * pow(1.0 - NdV, 5.0));
      kleur = mix(kleur, omg / max(uOog.w, 1e-3), f);
    }
  }

  uitKleur = uitvoer(kleur * uOog.w, uModus == 0 ? 1.0 : alfa);
}
`

// ------------------------------------------------------------ schaduwkaart

export const SCHADUW_VS = /* glsl */ `#version 300 es
precision highp float;
${BEELD_BLOK}
layout(location = 0) in vec3 aPlek;
layout(location = 2) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uSchaduwMat * vec4(-aPlek.x, aPlek.y, aPlek.z, 1.0);
}
`

export const SCHADUW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uAlfatest;
void main() {
  if (uAlfatest == 1 && texture(uTex, vUv).a < 0.5) discard;
}
`

// ------------------------------------------------------------ contactschaduw

/** Van onderen gezien: hoe dicht zit de bus boven dit stuk vloer (tot 0,6 m)? */
export const CONTACT_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPlek;
uniform mat4 uContactMat;
out float vHoogte;
void main() {
  vec3 p = vec3(-aPlek.x, aPlek.y, aPlek.z);
  vHoogte = p.y;
  gl_Position = uContactMat * vec4(p, 1.0);
}
`

export const CONTACT_FS = /* glsl */ `#version 300 es
precision highp float;
in float vHoogte;
out vec4 uit;
void main() {
  float d = 1.0 - clamp(vHoogte / 0.6, 0.0, 1.0);
  uit = vec4(d, 0.0, 0.0, 1.0);
}
`

/** Eén driehoek over het hele beeld. */
export const SCHERM_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vScherm;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vScherm = p * 2.0 - 1.0;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}
`

/** Gauss van 13 tikken langs één as; twee keer beide assen (§5.6: "twee keer vervaagd"). */
export const VAAG_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uBron;
uniform vec2 uStap;
out vec4 uit;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uBron, 0));
  const float G[7] = float[7](0.1512, 0.1435, 0.1226, 0.0943, 0.0653, 0.0407, 0.0228);
  float s = texture(uBron, uv).r * G[0];
  for (int i = 1; i < 7; i++) {
    s += texture(uBron, uv + uStap * float(i)).r * G[i];
    s += texture(uBron, uv - uStap * float(i)).r * G[i];
  }
  uit = vec4(s / 1.1296, 0.0, 0.0, 1.0);
}
`

// ------------------------------------------------------------ hemel en vloer

export const HEMEL_FS = /* glsl */ `#version 300 es
precision highp float;
${BEELD_BLOK}
${GEMEEN}
${HEMEL}
in vec2 vScherm;
out vec4 uitKleur;
void main() {
  vec4 a = uInvBeeldProj * vec4(vScherm, -1.0, 1.0);
  vec4 b = uInvBeeldProj * vec4(vScherm, 1.0, 1.0);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  // Onder de horizon (voorbij de vloer): de kleur van de horizon.
  vec3 c = d.y >= 0.0 ? hemelMetWolken(d) : hemelZonderWolken(vec3(d.x, 0.001, d.z), 5.0);
  uitKleur = uitvoer(c, 1.0);
}
`

export const VLOER_VS = /* glsl */ `#version 300 es
precision highp float;
${BEELD_BLOK}
layout(location = 0) in vec2 aXz;
out vec3 vWereld;
void main() {
  vec3 p = vec3(aXz.x * uVloer.w + uOog.x, 0.0, aXz.y * uVloer.w + uOog.z);
  vWereld = p;
  gl_Position = uBeeldProj * vec4(p, 1.0);
}
`

export const VLOER_FS = /* glsl */ `#version 300 es
precision highp float;
${BEELD_BLOK}
${GEMEEN}
${HEMEL}
${SCHADUW}
uniform sampler2D uContactTex;
in vec3 vWereld;
out vec4 uitKleur;
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  float s = schaduw(vWereld, n);
  vec2 cuv = (vWereld.xz - uContact.xy) * uContact.zw;
  float occ = 0.0;
  if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) occ = texture(uContactTex, cuv).r * uDivers2.y;
  vec3 zon = uZonKleur.rgb * max(uZonRicht.y, 0.0) * s * (1.0 - 0.35 * occ);
  vec3 rond = (uHemelLicht.rgb * mix(uDivers2.w, 1.0, s) + uOmgeving.rgb) * (1.0 - 0.9 * occ);
  vec3 kleur = uVloer.rgb * (zon + rond) * uOog.w;
  // Naar de horizon toe gaat de vloer over in de kleur van de hemel daar: geen harde rand.
  vec3 d = normalize(vWereld - uOog.xyz);
  // Vaag (mipniveau 5): de onderste rij van het panorama zou anders als strepen over de vloer lopen.
  vec3 horizon = hemelZonderWolken(vec3(d.x, 0.001, d.z), 5.0);
  float afstand = length(vWereld.xz - uOog.xz);
  float f = smoothstep(uVloer.w * 0.12, uVloer.w * 0.95, afstand);
  vec3 lin = mix(kleur, horizon, f);
  uitKleur = uitvoer(lin, 1.0);
}
`

// ------------------------------------------------------------ omzetten van texturen

/**
 * Een textuur naar een andere maat (DXT zonder mips, of te groot): elk
 * doelpixel is het gemiddelde van zijn blok van 2^k x 2^k bronpixels, met
 * bilineaire tikken tussen telkens vier pixels.
 */
export const OMZET_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uBron;
uniform int uStap;
uniform int uLineariseer;
out vec4 uit;
void main() {
  vec2 maat = vec2(textureSize(uBron, 0));
  vec2 begin = (gl_FragCoord.xy - 0.5) * float(uStap);
  vec4 s = vec4(0.0);
  if (uStap == 1) {
    s = texture(uBron, (begin + 0.5) / maat);
  } else {
    int n = uStap / 2;
    for (int j = 0; j < 8; j++) {
      if (j >= n) break;
      for (int i = 0; i < 8; i++) {
        if (i >= n) break;
        s += texture(uBron, (begin + vec2(float(i * 2 + 1), float(j * 2 + 1))) / maat);
      }
    }
    s /= float(n * n);
  }
  if (uLineariseer == 1) s.rgb = pow(s.rgb, vec3(2.2));
  uit = s;
}
`
