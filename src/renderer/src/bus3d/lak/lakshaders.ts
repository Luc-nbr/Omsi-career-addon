/**
 * DE SHADERS VAN HET LAKDOEK (lakstudio-ontwerp §4.2-§4.8)
 *
 * Alles rekent in UV-ruimte: het LAKNET (de driehoeken van een doel, met hun UV
 * teruggeschoven naar [0,1], lakdoek.ts) wordt getekend met
 * `gl_Position = (uv - tegel) * schaal * 2 - 1`, en de fragment-shader krijgt per
 * texel de plek op de bus en de normaal. Zo gaan naden, gespiegelde UV-eilanden
 * en UV's buiten [0,1] vanzelf goed: elke laag is een functie van de plek op de
 * bus, niet van de textuur.
 *
 * ASSEN: het laknet staat in o3d-assen (x rechts = deurkant, y omhoog, z
 * vooruit); de lagen ook ("busruimte", shared/lak.ts). De wereld van de viewer is
 * x gespiegeld (teken.ts); de dieptekaarten en de pick rekenen in die wereld.
 */

/** Het laknet in UV-ruimte: plek, normaal, uv (teruggeschoven), vlaggen en tekenbeurt. */
export const LAKNET_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPlek;
layout(location = 1) in vec3 aNormaal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec2 aInfo;
uniform vec4 uTegel;   // xy: begin van de tegel in uv, zw: 1 / maat van de tegel in uv
out vec3 vPlek;        // o3d-assen
out vec3 vNormaal;
out vec2 vUv;
flat out int vVlag;    // 1 glas (gemengd), 2 animatie (deur), 4 hangt aan [visible], 8 wiel
flat out int vTeken;
void main() {
  vec2 t = (aUv - uTegel.xy) * uTegel.zw;
  gl_Position = vec4(t * 2.0 - 1.0, 0.0, 1.0);
  vPlek = aPlek;
  vNormaal = aNormaal;
  vUv = aUv;
  vVlag = int(aInfo.x + 0.5);
  vTeken = int(aInfo.y + 0.5);
}
`

const LAKNET_IN = /* glsl */ `
in vec3 vPlek;
in vec3 vNormaal;
in vec2 vUv;
flat in int vVlag;
flat in int vTeken;
`

/**
 * Eén richting van het buitenmasker (§4.3, kanaal R): vóór de dichte meshes
 * (binnen 1 cm) én vóór de doorzichtige (binnen 5 cm), met een marge voor een
 * schuine texel. Plus G (glas), B (een DRIEHOEK die geen glas is: de randlijnen
 * tellen daar niet) en A (gedekt). Mengen met MAX over de 26 richtingen; het
 * samenvoegen maakt er "alleen glas" van (MASKER_SAMEN_FS).
 */
export const MASKER_FS = /* glsl */ `#version 300 es
precision highp float;
${LAKNET_IN}
uniform highp sampler2D uDicht;
uniform highp sampler2D uDoor;
uniform mat4 uRichting;     // wereld -> klemruimte van deze richting (orthografisch)
uniform vec3 uKijk;         // kijkrichting in de wereld (van de camera naar de bus)
uniform float uDiepte;      // meters van dichtbij tot ver
uniform float uTexelM;      // meters per texel van de dieptekaart
uniform int uLijn;          // 1 bij de randlijnen
uniform int uRichtingGang;  // 1: alleen R, met de dieptekaarten; 0: alleen G, B en A (één keer, zonder richting)
out vec4 uit;
void main() {
  if (uRichtingGang == 0) {
    // Beschermd als glas: gemengde materialen (1) en wielen (8).
    bool glas = (vVlag & 9) != 0;
    uit = vec4(0.0, glas ? 1.0 : 0.0, !glas && uLijn == 0 ? 1.0 : 0.0, 1.0);
    return;
  }
  vec3 w = vec3(-vPlek.x, vPlek.y, vPlek.z);
  vec3 n = vec3(-vNormaal.x, vNormaal.y, vNormaal.z);
  vec4 c = uRichting * vec4(w, 1.0);
  vec3 q = c.xyz * 0.5 + 0.5;
  float buiten = 0.0;
  if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
    float zd = texture(uDicht, q.xy).r;
    float zt = texture(uDoor, q.xy).r;
    float ln = length(n);
    float cosT = ln > 1e-4 ? abs(dot(n / ln, uKijk)) : 1.0;
    float tanT = sqrt(max(1.0 - cosT * cosT, 0.0)) / max(cosT, 0.2);
    float marge = uTexelM * 1.5 * tanT;
    bool dicht = (q.z - zd) * uDiepte <= 0.01 + marge;
    bool door = (q.z - zt) * uDiepte <= 0.05 + marge;
    buiten = dicht && door ? 1.0 : 0.0;
  }
  // Alleen "buiten" telt; de stencil onthoudt het, zodat latere richtingen die texel overslaan.
  if (buiten < 0.5) discard;
  uit = vec4(1.0, 0.0, 0.0, 0.0);
}
`

/** De plek op de bus, genormaliseerd op de doos, voor MIN en MAX (kanaal B: gedeeld). */
export const PLEK_FS = /* glsl */ `#version 300 es
precision highp float;
${LAKNET_IN}
uniform vec3 uDoosMin;
uniform vec3 uDoosMaat;
out vec4 uit;
void main() {
  uit = vec4(clamp((vPlek - uDoosMin) / uDoosMaat, 0.0, 1.0), 1.0);
}
`

/**
 * Scherm: het masker samenvoegen. B = gedeeld als MIN en MAX meer dan 2 stappen
 * verschillen. G = glas alleen als geen driehoek zonder glas de texel dekt: een
 * randlijn van een ruit over de carrosserie maakte anders elke raamrand "glas",
 * terwijl MA van het Repaint-Tool daar lakt (SD77: 96,9% gelijk aan MA).
 */
export const SCHERM_VS = /* glsl */ `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const MASKER_SAMEN_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uRuw;
uniform sampler2D uMin;
uniform sampler2D uMax;
uniform ivec2 uBegin;     // waar de tegel in het masker begint (de hulpdoelen zijn zo groot als de tegel)
out vec4 uit;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) - uBegin;
  vec4 r = texelFetch(uRuw, p, 0);
  vec3 lo = texelFetch(uMin, p, 0).rgb;
  vec3 hi = texelFetch(uMax, p, 0).rgb;
  float gedeeld = r.a > 0.5 && any(greaterThan(hi - lo, vec3(2.5 / 255.0))) ? 1.0 : 0.0;
  float glas = r.g > 0.5 && r.b < 0.5 ? 1.0 : 0.0;
  uit = vec4(r.r, glas, gedeeld, r.a);
}
`

/** De dieptekaarten van het masker en het penseel: plek en (bij alfatest) de alfa. */
export const DIEPTE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPlek;
layout(location = 2) in vec2 aUv;
uniform mat4 uMat;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uMat * vec4(-aPlek.x, aPlek.y, aPlek.z, 1.0);
}
`
export const DIEPTE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform int uAlfatest;
void main() {
  if (uAlfatest == 1 && texture(uTex, vUv).a < 0.5) discard;
}
`

// ------------------------------------------------------------ uitvloeien (JFA, §4.7)

/** Zaad: een gedekte texel wijst naar zichzelf, de rest naar niets (65535). */
export const JFA_ZAAD_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;
uniform sampler2D uMasker;
uniform vec2 uSchaal;     // maat van het masker / maat van dit doel
out uvec2 uit;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float a = texelFetch(uMasker, ivec2(vec2(p) * uSchaal), 0).a;
  uit = a > 0.5 ? uvec2(p) : uvec2(65535u);
}
`

/** Eén sprong: van de negen buren op afstand k de dichtstbijzijnde gedekte texel. */
export const JFA_SPRONG_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D uVorig;
uniform int uStap;
out uvec2 uit;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 maat = textureSize(uVorig, 0);
  uvec2 beste = texelFetch(uVorig, p, 0).xy;
  float bd = beste.x == 65535u ? 1e20 : dot(vec2(beste) - vec2(p), vec2(beste) - vec2(p));
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      ivec2 q = p + ivec2(i, j) * uStap;
      if (q.x < 0 || q.y < 0 || q.x >= maat.x || q.y >= maat.y) continue;
      uvec2 s = texelFetch(uVorig, q, 0).xy;
      if (s.x == 65535u) continue;
      float d = dot(vec2(s) - vec2(p), vec2(s) - vec2(p));
      if (d < bd) {
        bd = d;
        beste = s;
      }
    }
  }
  uit = beste;
}
`

/**
 * Vullen: een ongedekte texel krijgt de KLEUR van de dichtstbijzijnde gedekte
 * (tot het volgende eiland), maar zijn ALFA blijft die van de basis (P5: A van
 * de uitvoer = A van de basis, ook buiten de eilanden). Het zaad en de ruwe
 * samenstelling zijn op volle maat; het doel is een tegel die op uBegin begint.
 */
export const VUL_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;
uniform sampler2D uRuw;
uniform usampler2D uZaad;
uniform sampler2D uAlfa;
uniform ivec2 uBegin;
out vec4 uit;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + uBegin;
  uvec2 s = texelFetch(uZaad, p, 0).xy;
  vec3 c = texelFetch(uRuw, s.x == 65535u ? p : ivec2(s), 0).rgb;
  float a = textureLod(uAlfa, (vec2(p) + 0.5) / vec2(textureSize(uRuw, 0)), 0.0).a;
  uit = vec4(c, a);
}
`

// ------------------------------------------------------------ samenstellen (§4.4, §4.5)

/**
 * De lagen, per texel. Per laag vier vec4 (zie lakdoek.ts `laagBlok`):
 *  v0: soort (1 zone, 2 strook, 3 decal, 4 penseel), dekking, detail, vlaggen
 *      (1 ook over rubbers, 2 alleen zijden, 4 decal gespiegeld)
 *  v1: kleur (lineair), extra (zone: straal ΔE; decal: laag in de array; penseel: plek)
 *  v2: zone: centrum Lab; strook: h1, h2, tan(hoek), golf; decal: midden xyz, breedte
 *  v3: strook: golflengte, midden z; decal: zijde (0 L 1 R 2 V 3 A 4 D), cos, sin, hoogte
 */
export const MAX_LAGEN = 32

const LAGEN_GEMEEN = /* glsl */ `
uniform vec4 uLagen[${MAX_LAGEN * 4}];
uniform int uAantal;
uniform sampler2D uBasis;       // de basis B (BS of de standaard), sRGB -> lineair
uniform sampler2D uDetail;      // de detailbron: de standaard, of de start
uniform sampler2D uAlfaBron;    // de alfa van de basis: altijd de standaard (§4.4)
uniform sampler2D uMasker;      // R buiten, G glas, B gedeeld, A gedekt
uniform sampler2D uSjabloonMA;  // alleen met sjabloon (lineair, 0..1)
uniform sampler2D uSjabloonAD;
uniform sampler2D uSjabloonMU;
uniform highp sampler2DArray uDecals;
uniform sampler2D uPenseel0;
uniform sampler2D uPenseel1;
uniform highp sampler2DArray uDekking;   // pad 2: per 4 lagen de dekking (MAX-gang)
uniform int uSjabloon;
uniform vec4 uZones[8];         // Lab + lak (1) of niet (0)
uniform int uZoneAantal;
uniform vec3 uDoosMin;
uniform vec3 uDoosMax;

vec3 naarLin(vec3 s) {
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s));
}
vec3 naarSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float helderheid(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
// Lineair sRGB -> CIE Lab (D65).
vec3 naarLab(vec3 c) {
  vec3 xyz = mat3(0.4124, 0.2126, 0.0193, 0.3576, 0.7152, 0.1192, 0.1805, 0.0722, 0.9505) * c;
  xyz /= vec3(0.95047, 1.0, 1.08883);
  vec3 f = mix(xyz * 7.787 + 16.0 / 116.0, pow(max(xyz, vec3(1e-6)), vec3(1.0 / 3.0)), step(vec3(0.008856), xyz));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}

/** Z: 1 in een lakzone, 0 in een zone van rubbers en lampen, met een zachte rand over 4 ΔE (§4.4). */
float zoneZ(vec3 lab) {
  if (uZoneAantal == 0) return 1.0;
  float dLak = 1e9;
  float dAnder = 1e9;
  for (int i = 0; i < 8; i++) {
    if (i >= uZoneAantal) break;
    float d = distance(lab, uZones[i].xyz);
    if (uZones[i].w > 0.5) dLak = min(dLak, d);
    else dAnder = min(dAnder, d);
  }
  return clamp((dAnder - dLak) / 4.0 * 0.5 + 0.5, 0.0, 1.0);
}

/** Het dichtstbijzijnde zonecentrum (voor de detailfunctie). */
vec3 zoneCentrum(vec3 lab) {
  vec3 beste = lab;
  float bd = 1e9;
  for (int i = 0; i < 8; i++) {
    if (i >= uZoneAantal) break;
    float d = distance(lab, uZones[i].xyz);
    if (d < bd) {
      bd = d;
      beste = uZones[i].xyz;
    }
  }
  return beste;
}
vec3 vanLab(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  vec3 f = vec3(fy + lab.y / 500.0, fy, fy - lab.z / 200.0);
  vec3 xyz = mix((f - 16.0 / 116.0) / 7.787, f * f * f, step(vec3(0.206893), f)) * vec3(0.95047, 1.0, 1.08883);
  return mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570) * xyz;
}

/** Een decal: de plek op de bus in het vlak van zijn zijde, en of de normaal die kant op wijst (60°-80°). */
vec4 decal(vec3 p, vec3 n, vec4 v2, vec4 v3, float laag, bool spiegel) {
  int zijde = int(v3.x + 0.5);
  vec3 d = p - v2.xyz;
  vec2 uvl;
  vec3 as;
  if (zijde == 0) { uvl = vec2(-d.z, d.y); as = vec3(-1.0, 0.0, 0.0); }
  else if (zijde == 1) { uvl = vec2(d.z, d.y); as = vec3(1.0, 0.0, 0.0); }
  else if (zijde == 2) { uvl = vec2(-d.x, d.y); as = vec3(0.0, 0.0, 1.0); }
  else if (zijde == 3) { uvl = vec2(d.x, d.y); as = vec3(0.0, 0.0, -1.0); }
  else { uvl = vec2(d.x, d.z); as = vec3(0.0, 1.0, 0.0); }
  if (spiegel) uvl.x = -uvl.x;
  vec2 r = vec2(uvl.x * v3.y + uvl.y * v3.z, -uvl.x * v3.z + uvl.y * v3.y);
  vec2 t = vec2(r.x / v2.w + 0.5, 0.5 - r.y / max(v3.w, 1e-4));
  float ln = length(n);
  float c = ln > 1e-4 ? dot(n / ln, as) : 0.0;
  float richting = smoothstep(0.1736, 0.5, c);
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0 || richting <= 0.0) return vec4(0.0);
  // textureLod: in een tak mogen geen afgeleiden (anders maakt de HLSL-vertaler er één rechte lijn van, met alle takken).
  vec4 s = textureLod(uDecals, vec3(t, laag), 0.0);
  return vec4(s.rgb, s.a * richting);
}

/**
 * De dekking van laag i op deze plek (zonder het masker); kleur in lineair licht.
 * \`baseLab\` is de detailbron in Lab (voor een zone).
 */
vec4 laag(int i, vec3 p, vec3 n, vec3 baseLab, vec2 uv, vec2 fw) {
  vec4 v0 = uLagen[i * 4];
  vec4 v1 = uLagen[i * 4 + 1];
  vec4 v2 = uLagen[i * 4 + 2];
  vec4 v3 = uLagen[i * 4 + 3];
  int soort = int(v0.x + 0.5);
  int vlag = int(v0.w + 0.5);
  float dek = 0.0;
  vec3 kleur = v1.rgb;
  if (soort == 1) {
    float d = distance(baseLab, v2.xyz);
    dek = 1.0 - smoothstep(v1.w - 2.0, v1.w + 2.0, d);
  } else if (soort == 2) {
    float h = p.y - uDoosMin.y;
    float z = p.z - v3.y;
    float verschuif = v2.z * z + v2.w * sin(6.2831853 * z / max(v3.x, 0.1));
    float t = h - verschuif;
    // De breedte van één texel in t, uit de afgeleiden van y en z buiten de lus (fw).
    float w = max(fw.x + abs(v2.z) * fw.y, 1e-4);
    dek = clamp((t - v2.x) / w + 0.5, 0.0, 1.0) * clamp((v2.y - t) / w + 0.5, 0.0, 1.0);
    float ln = length(n);
    if ((vlag & 2) != 0) {
      dek *= ln > 1e-4 ? smoothstep(0.35, 0.6, abs(n.x / ln)) : 0.0;
    }
    // Frontvlak (8) en achtervlak (16): alleen waar de normaal naar voren of naar achteren wijst.
    if ((vlag & 8) != 0) dek *= ln > 1e-4 ? smoothstep(0.35, 0.6, n.z / ln) : 0.0;
    if ((vlag & 16) != 0) dek *= ln > 1e-4 ? smoothstep(0.35, 0.6, -n.z / ln) : 0.0;
  } else if (soort == 3) {
    vec4 s = decal(p, n, v2, v3, v1.w, (vlag & 4) != 0);
    // Een tekst of vorm is wit met alfa; de kleur komt van de laag. Een afbeelding (kleur < 0) houdt de
    // zijne; de decal-array is SRGB8_ALPHA8, dus die kleur komt al lineair binnen (geen pow per laag).
    kleur = v1.r >= 0.0 ? v1.rgb : s.rgb;
    dek = s.a;
  } else if (soort == 4) {
    // Het penseel bewaart alleen de dekking; de kleur is die van de laag.
    dek = int(v1.w + 0.5) == 0 ? textureLod(uPenseel0, uv, 0.0).a : textureLod(uPenseel1, uv, 0.0).a;
  }
  return vec4(kleur, dek * v0.y);
}

/**
 * Het hele samenstellen van één texel (§4.4): de lagen "over" in lineair licht,
 * elk door zijn eigen masker en zijn eigen detailfunctie, dan over de basis.
 * \`dekkingen\` geeft voor gedeelde texels de dekking per laag uit de MAX-gang
 * (-1 = zelf rekenen).
 */
vec4 stelSamen(vec3 p, vec3 n, vec2 uv, vec2 st, ivec2 pix, bool metDekking) {
  vec4 basisS = texture(uBasis, st);
  vec3 B = basisS.rgb;
  float alfa = texture(uAlfaBron, st).a;
  vec3 detail = texture(uDetail, st).rgb;
  vec3 detailLab = naarLab(detail);
  vec4 m = texture(uMasker, st);
  float Mzonder = m.r * (1.0 - m.g);
  float M = Mzonder * zoneZ(detailLab);
  vec3 AD = vec3(0.0);
  vec3 MU = vec3(1.0);
  if (uSjabloon == 1) {
    M = texture(uSjabloonMA, st).r;
    Mzonder = M;
    AD = texture(uSjabloonAD, st).rgb;
    MU = texture(uSjabloonMU, st).rgb;
  }
  // Zonder sjabloon: s = Y_detail / Y_zonecentrum, geklemd op 0,4..1,3 (§4.4).
  float yc = helderheid(max(vanLab(zoneCentrum(detailLab)), vec3(1e-4)));
  float s = uZoneAantal > 0 ? clamp(helderheid(detail) / max(yc, 1e-4), 0.4, 1.3) : 1.0;

  vec2 fw = vec2(fwidth(p.y), fwidth(p.z));
  vec3 C = vec3(0.0);
  float A = 0.0;
  // Een lus met een uniforme grens (geen vaste 32 met break): de HLSL-vertaler rolt hem dan niet
  // 32 keer uit, met minder registers en meer fragmenten tegelijk op de GPU.
  int aantal = min(uAantal, ${MAX_LAGEN});
  // Twee lussen in plaats van één tak per laag: de keuze sjabloon of niet valt één keer per texel.
  if (uSjabloon == 1) {
    for (int i = 0; i < aantal; i++) {
      vec4 l = laag(i, p, n, detailLab, uv, fw);
      if (metDekking) l.a = texelFetch(uDekking, ivec3(pix, i / 4), 0)[i - (i / 4) * 4] * uLagen[i * 4].y;
      vec4 v0 = uLagen[i * 4];
      float a = clamp(l.a * (((int(v0.w + 0.5)) & 1) != 0 ? Mzonder : M), 0.0, 1.0);
      if (a <= 0.0) continue;
      // Het Repaint-Tool: AD + MU * kleur, per kanaal in sRGB-waarden; "details behouden" mengt naar de kale kleur.
      vec3 ks = naarSrgb(l.rgb);
      vec3 c = naarLin(mix(ks, clamp(AD + MU * ks, 0.0, 1.0), v0.z));
      C = c * a + C * (1.0 - a);
      A = a + A * (1.0 - a);
    }
  } else {
    for (int i = 0; i < aantal; i++) {
      vec4 l = laag(i, p, n, detailLab, uv, fw);
      if (metDekking) l.a = texelFetch(uDekking, ivec3(pix, i / 4), 0)[i - (i / 4) * 4] * uLagen[i * 4].y;
      vec4 v0 = uLagen[i * 4];
      float a = clamp(l.a * (((int(v0.w + 0.5)) & 1) != 0 ? Mzonder : M), 0.0, 1.0);
      vec3 c = l.rgb * mix(1.0, s, v0.z);
      C = c * a + C * (1.0 - a);
      A = a + A * (1.0 - a);
    }
  }
  return vec4(B * (1.0 - A) + C, alfa);
}
`

/** Pad 1 (§4.5): het laknet, per fragment alle lagen; gedeelde texels slaat het over. */
export const SAMENSTEL_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
${LAKNET_IN}
${LAGEN_GEMEEN}
uniform vec2 uMaat;      // de maat van het hele doel: een tegel is een viewport, gl_FragCoord telt vanaf het doel
uniform vec4 uTegel;
uniform int uGedeeldApart;
out vec4 uit;
void main() {
  vec2 st = gl_FragCoord.xy / uMaat;
  vec4 m = texture(uMasker, st);
  if (uGedeeldApart == 1 && m.b > 0.5) discard;
  uit = stelSamen(vPlek, vNormaal, vUv, st, ivec2(gl_FragCoord.xy), false);
}
`

/** Pad 2, eerste gang: per 4 lagen de hoogste dekking over alle plekken van een texel (MAX-mengen). */
export const DEKKING_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
${LAKNET_IN}
${LAGEN_GEMEEN}
uniform int uEerste;
out vec4 uit;
void main() {
  vec3 lab = naarLab(texture(uDetail, vUv).rgb);
  vec2 fw = vec2(fwidth(vPlek.y), fwidth(vPlek.z));
  vec4 d = vec4(0.0);
  for (int c = 0; c < 4; c++) {
    int i = uEerste + c;
    if (i >= uAantal) break;
    vec4 l = laag(i, vPlek, vNormaal, lab, vUv, fw);
    d[c] = l.a / max(uLagen[i * 4].y, 1e-4);
  }
  uit = d;
}
`

/** Pad 2, tweede gang: schermvullend, alleen op gedeelde texels, met de dekkingen uit de MAX-gang. */
export const GEDEELD_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
${LAGEN_GEMEEN}
uniform vec2 uMaat;
uniform vec4 uTegel;
uniform ivec2 uBegin;    // waar de tegel begint: de dekkingen zijn zo groot als de tegel
out vec4 uit;
void main() {
  vec2 st = gl_FragCoord.xy / uMaat;
  vec4 m = texture(uMasker, st);
  if (m.b < 0.5) discard;
  // Kleur van een zone of penseel hangt niet van de plek af; strook en decal komen alleen als dekking.
  uit = stelSamen(vec3(0.0), vec3(0.0), st, st, ivec2(gl_FragCoord.xy) - uBegin, true);
}
`

/**
 * De voetafdruk van één decal (§4.8, de geen-kopie-regel): per texel of de decal
 * er landt (R), en dan ook op een gedeelde texel (G) of op glas of een deur (B).
 * Mengen met MAX: een texel die twee keer getekend wordt (kopieën over een
 * tegelgrens) telt één keer. De werker telt het na met readPixels.
 */
export const ANALYSE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
${LAKNET_IN}
${LAGEN_GEMEEN}
uniform vec2 uMaat;
out vec4 uit;
void main() {
  vec2 st = gl_FragCoord.xy / uMaat;
  vec4 m = texture(uMasker, st);
  vec2 fw = vec2(fwidth(vPlek.y), fwidth(vPlek.z));
  vec4 l = laag(0, vPlek, vNormaal, vec3(50.0, 0.0, 0.0), vUv, fw);
  float d = l.a > 0.05 ? 1.0 : 0.0;
  float glas = (vVlag & 3) != 0 ? 1.0 : 0.0;
  uit = vec4(d, d * (m.b > 0.5 ? 1.0 : 0.0), d * glas, 1.0);
}
`

/** Een basis zonder lagen (voor de ongedekte texels, die daarna uitvloeien). */
export const KOPIE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uBron;
uniform vec2 uMaat;
out vec4 uit;
void main() {
  uit = texture(uBron, gl_FragCoord.xy / uMaat);
}
`

// ------------------------------------------------------------ het penseel (§4.8)

/** Eén streek-gang: alle stippen binnen de straal, met de dieptetoets van de camera. */
export const PENSEEL_FS = /* glsl */ `#version 300 es
precision highp float;
${LAKNET_IN}
uniform highp sampler2D uCameraDiepte;
uniform mat4 uCamera;
uniform vec4 uStippen[64];     // xyz in o3d-assen, w straal in m
uniform int uStipAantal;
uniform vec4 uKleur;           // rgb (sRGB), a dekking
uniform float uHardheid;
uniform int uGum;
out vec4 uit;
void main() {
  vec3 w = vec3(-vPlek.x, vPlek.y, vPlek.z);
  vec4 c = uCamera * vec4(w, 1.0);
  vec3 q = c.xyz / c.w * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
  float z = texture(uCameraDiepte, q.xy).r;
  if (q.z > z + 0.0005) discard;
  float a = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uStipAantal) break;
    float d = distance(vPlek, uStippen[i].xyz) / max(uStippen[i].w, 1e-4);
    a = max(a, 1.0 - smoothstep(uHardheid, 1.0, d));
  }
  if (a <= 0.0) discard;
  a *= uKleur.a;
  uit = uGum == 1 ? vec4(0.0, 0.0, 0.0, a) : vec4(uKleur.rgb * a, a);
}
`

// ------------------------------------------------------------ aanwijzen (§4.2)

/** De pick-pass: twee RGBA32UI-uitgangen, eerst alle meshes (afdekkers), dan het laknet. */
export const PICK_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPlek;
layout(location = 1) in vec3 aNormaal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec2 aInfo;
uniform mat4 uMat;
uniform int uLaknet;
out vec3 vPlek;
out vec3 vNormaal;
out vec2 vUv;
flat out int vVlag;
flat out int vTeken;
// GLSL ES 3.00 kent geen gl_PrimitiveID: het laknet gaat met drawArrays, dus hoekpunt / 3.
flat out int vDriehoek;
void main() {
  vPlek = aPlek;
  vNormaal = aNormaal;
  vUv = aUv;
  vDriehoek = gl_VertexID / 3;
  vVlag = uLaknet == 1 ? int(aInfo.x + 0.5) : 0;
  vTeken = uLaknet == 1 ? int(aInfo.y + 0.5) : -1;
  gl_Position = uMat * vec4(-aPlek.x, aPlek.y, aPlek.z, 1.0);
}
`
export const PICK_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${LAKNET_IN}
uniform int uLaknet;
uniform int uDoel;
// Buiten het laknet: wat er getekend wordt (glas: 1 << 8; een onderdeel met [visible]: 4 << 8 | (tekenbeurt + 1) << 12).
uniform int uVast;
flat in int vDriehoek;
layout(location = 0) out uvec4 uit0;
layout(location = 1) out uvec4 uit1;
uvec2 pakNormaal(vec3 n) {
  float ln = length(n);
  n = ln > 1e-6 ? n / ln : vec3(0.0, 1.0, 0.0);
  n /= abs(n.x) + abs(n.y) + abs(n.z);
  vec2 o = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * sign(n.xy);
  return uvec2((o * 0.5 + 0.5) * 65535.0);
}
void main() {
  uvec2 on = pakNormaal(vNormaal);
  if (uLaknet == 1) {
    uit0 = uvec4(uint(uDoel + 1) | (uint(vVlag) << 8) | (uint(vTeken + 1) << 12), uint(max(vDriehoek, 0)), floatBitsToUint(vUv.x), floatBitsToUint(vUv.y));
  } else {
    uit0 = uvec4(uint(uVast), 0u, 0xffffffffu, 0xffffffffu);
  }
  uit1 = uvec4(floatBitsToUint(vPlek.x), floatBitsToUint(vPlek.y), floatBitsToUint(vPlek.z), (on.x << 16) | on.y);
}
`

/** Een klein beeld van een textuur voor readPixels (kleurzones op 1/8, §4.3), met het masker in A. */
export const KLEIN_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uBron;
uniform sampler2D uMasker;
uniform vec2 uMaat;
out vec4 uit;
void main() {
  vec2 st = gl_FragCoord.xy / uMaat;
  vec3 c = textureLod(uBron, st, 3.0).rgb;
  vec4 m = texture(uMasker, st);
  // Lineair, als sRGB-bytes terug (het doel is RGBA8): de zones rekenen in Lab op de processor.
  vec3 s = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  uit = vec4(s, m.r * (1.0 - m.g) * m.a);
}
`

/**
 * Voor de proef (P5): het automatische masker M = buiten·(1−glas)·Z (zonder
 * sjabloon) in R, het MA van het sjabloon in G, glas in B, gedekt in A.
 */
export const EFFECT_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
${LAGEN_GEMEEN}
uniform vec2 uMaat;
out vec4 uit;
void main() {
  vec2 st = gl_FragCoord.xy / uMaat;
  vec4 m = texture(uMasker, st);
  float z = zoneZ(naarLab(texture(uDetail, st).rgb));
  float ma = uSjabloon == 1 ? texture(uSjabloonMA, st).r : 0.0;
  uit = vec4(m.r * (1.0 - m.g) * z, ma, m.g, m.a);
}
`

/** Voor de proef (P5): welke texels het laknet van gekozen tekenbeurten dekt (R), en van de rest (G). */
export const TEKEN_FS = /* glsl */ `#version 300 es
precision highp float;
${LAKNET_IN}
uniform highp sampler2D uKeuze;   // R8, één texel per tekenbeurt: 1 = gekozen
out vec4 uit;
void main() {
  float k = texelFetch(uKeuze, ivec2(vTeken, 0), 0).r;
  uit = vec4(k > 0.5 ? 1.0 : 0.0, k > 0.5 ? 0.0 : 1.0, 0.0, 1.0);
}
`

/** Het masker in beeld (ontwikkelpaneel): R buiten rood, G glas groen, B gedeeld blauw. */
export const TOON_MASKER_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uMasker;
uniform vec2 uMaat;
out vec4 uit;
void main() {
  vec4 m = texture(uMasker, gl_FragCoord.xy / uMaat);
  uit = vec4(m.r * 0.9, m.g * 0.9, m.b, 1.0) * m.a + vec4(0.1, 0.1, 0.1, 0.0) * (1.0 - m.a);
}
`
