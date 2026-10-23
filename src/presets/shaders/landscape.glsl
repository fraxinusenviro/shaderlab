// Landscape Studio — Shader Forge original (MIT)  [Theme: Earth / Water]
// Procedural raymarched terrain and water: five terrain styles, animated
// waves with fresnel sky reflection, shoreline foam, depth-tinted water,
// slope/height materials, soft shadows, sun, clouds, fog and a flyover camera.
// Drag on the view to look around.
uniform int uStyle;          // @param options="Mountains:0,Rolling hills:1,Archipelago:2,Canyons:3,Dunes:4" default=0 label="Terrain type" group=Terrain
uniform float uSeed;         // @param widget=seed default=17 min=0 max=999 label="World seed" group=Terrain
uniform float uScale;        // @param default=1.0 min=0.3 max=3 step=0.01 label="Feature scale" group=Terrain
uniform float uHeight;       // @param default=1.6 min=0.1 max=4 step=0.01 label="Relief height" group=Terrain
uniform float uRoughness;    // @param default=0.5 min=0.3 max=0.65 step=0.005 label="Roughness" group=Terrain
uniform int uOctaves;        // @param default=7 min=2 max=9 label="Detail octaves" group=Terrain
uniform float uSnowLine;     // @param default=1.6 min=0 max=4 step=0.01 label="Snow line" group=Terrain
uniform bool uPlants;        // @param default=true label="Plants (trees, shrubs, flowers)" group=Vegetation
uniform float uVegetation;   // @param default=0.6 min=0 max=1 step=0.01 label="Grass cover" group=Vegetation
uniform float uForest;       // @param default=0.45 min=0 max=1 step=0.01 label="Forest density" group=Vegetation
uniform float uForestPatch;  // @param default=0.55 min=0 max=1 step=0.01 label="Forest clumping" group=Vegetation
uniform float uConifer;      // @param default=0.5 min=0 max=1 step=0.01 label="Conifer share" group=Vegetation
uniform float uTreeSize;     // @param default=1 min=0.4 max=2.5 step=0.01 label="Tree size" group=Vegetation
uniform float uTreeVariety;  // @param default=0.5 min=0 max=1 step=0.01 label="Size variation" group=Vegetation
uniform float uTreeLine;     // @param default=1.3 min=0 max=4 step=0.01 label="Tree line altitude" group=Vegetation
uniform float uShrubs;       // @param default=0.3 min=0 max=1 step=0.01 label="Shrubs" group=Vegetation
uniform float uFlowers;      // @param default=0.2 min=0 max=1 step=0.01 label="Wildflowers" group=Vegetation
uniform float uCacti;        // @param default=0.3 min=0 max=1 step=0.01 label="Desert cacti" group=Vegetation
uniform vec3 uLeafColor;     // @param widget=color default=0.15,0.3,0.09 label="Foliage colour" group=Vegetation
uniform vec3 uGrassColor;    // @param widget=color default=0.25,0.32,0.1 label="Grass colour" group=Vegetation
uniform vec3 uFlowerColor;   // @param widget=color default=0.95,0.78,0.2 label="Flower colour" group=Vegetation
uniform float uVegSeed;      // @param widget=seed default=3 min=0 max=999 label="Vegetation seed" group=Vegetation
uniform vec3 uRock;          // @param widget=color default=0.42,0.36,0.3 label="Rock colour" group=Terrain
uniform float uWaterLevel;   // @param default=0.35 min=-0.5 max=2.5 step=0.01 label="Water level" group=Water
uniform float uWaveHeight;   // @param default=0.35 min=0 max=1 step=0.01 label="Wave height" group=Water
uniform float uWaveSpeed;    // @param default=0.8 min=0 max=3 step=0.01 label="Wave speed" group=Water
uniform float uClarity;      // @param default=0.5 min=0 max=1 step=0.01 label="Water clarity" group=Water
uniform float uFoam;         // @param default=0.5 min=0 max=1 step=0.01 label="Shore foam" group=Water
uniform vec3 uWaterDeep;     // @param widget=color default=0.02,0.12,0.2 label="Deep water" group=Water
uniform vec3 uWaterShallow;  // @param widget=color default=0.1,0.45,0.45 label="Shallow water" group=Water
uniform float uSunElevation; // @param default=0.35 min=-0.15 max=1.5 step=0.005 label="Sun elevation" group=Sky
uniform float uSunAzimuth;   // @param widget=angle default=0.8 min=0 max=6.2832 label="Sun direction" group=Sky
uniform float uClouds;       // @param default=0.45 min=0 max=1 step=0.01 label="Cloud cover" group=Sky
uniform float uFog;          // @param default=0.35 min=0 max=1 step=0.01 label="Haze" group=Sky
uniform float uAltitude;     // @param default=0.6 min=0.05 max=4 step=0.01 label="Camera altitude" group=Camera
uniform float uPitch;        // @param default=-0.12 min=-0.9 max=0.5 step=0.005 label="Camera pitch" group=Camera
uniform float uHeading;      // @param widget=angle default=0.3 min=0 max=6.2832 label="Heading" group=Camera
uniform float uFlySpeed;     // @param default=0.4 min=0 max=3 step=0.01 label="Flight speed" group=Camera
uniform float uFov;          // @param default=1.4 min=0.6 max=3 step=0.01 label="Lens (focal length)" group=Camera
uniform vec2 uPan;           // @param default=0,0 min=-500 max=500 step=0.001 label="Camera position" group=Camera
uniform int uQuality;        // @param options="Draft:0,Balanced:1,High:2" default=1 label="Render quality" group=Camera

// ---------------------------------------------------------------- noise

float hash12(vec2 p) {
  p = mod(p, 289.0);
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + 0.137 * uSeed) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);

float fbmT(vec2 p, bool ridged) {
  float h = 0.0, a = 0.5, w = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= uOctaves) break;
    float n = vnoise(p);
    if (ridged) { n = 1.0 - abs(n * 2.0 - 1.0); n *= n; }
    h += a * n;
    w += a;
    p = ROT * p + vec2(1.7, 9.2);
    a *= uRoughness;
  }
  return h / w;
}
float fbm5(vec2 p) {
  float h = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { h += a * vnoise(p); p = ROT * p + vec2(3.1, 4.7); a *= 0.5; }
  return h;
}

// ---------------------------------------------------------------- terrain

float terrain(vec2 xz) {
  vec2 p = xz * 0.35 / uScale + vec2(uSeed * 7.31, uSeed * 3.17);
  float h;
  if (uStyle == 0) {
    h = fbmT(p, true);
    h = pow(h, 1.5) * 1.35;
  } else if (uStyle == 1) {
    h = fbmT(p * 0.55, false) * 0.75;
  } else if (uStyle == 2) {
    h = fbmT(p * 0.8, false);
    h = smoothstep(0.42, 0.95, h) * 1.1 + 0.05 * h;
  } else if (uStyle == 3) {
    h = fbmT(p * 0.6, false);
    float steps = 5.0;
    float tr = floor(h * steps) / steps;
    h = mix(tr, h, 0.25 + 0.75 * smoothstep(0.85, 1.0, fract(h * steps)));
    float river = abs(fbm5(p * 0.35) - 0.5);
    h *= smoothstep(0.0, 0.08, river) * 0.8 + 0.2;
  } else {
    // Dunes: asymmetric wind ridges whose crest lines are bent by low-frequency noise.
    float d = fbmT(p * 0.35, false);
    float ph = p.x * 5.5 + p.y * 2.0 + d * 9.0;
    float r = fract(ph / 6.2831853);
    float ridge = r < 0.7 ? smoothstep(0.0, 0.7, r) : 1.0 - smoothstep(0.7, 1.0, r);
    h = ridge * ridge * 0.4 * (0.5 + d) + d * 0.45;
  }
  return h * uHeight;
}

vec3 terrainNormal(vec2 xz, float e) {
  return normalize(vec3(terrain(xz - vec2(e, 0.0)) - terrain(xz + vec2(e, 0.0)), 2.0 * e, terrain(xz - vec2(0.0, e)) - terrain(xz + vec2(0.0, e))));
}

// ---------------------------------------------------------------- water

float waves(vec2 xz, float t) {
  float s = uWaveSpeed * t;
  float w = 0.0;
  w += sin(dot(xz, vec2(0.8, 0.6)) * 3.1 + s * 1.3) * 0.5;
  w += sin(dot(xz, vec2(-0.5, 0.9)) * 4.7 + s * 1.7) * 0.3;
  w += sin(dot(xz, vec2(0.95, -0.3)) * 7.3 + s * 2.3) * 0.15;
  w += (vnoise(xz * 6.0 + vec2(s * 0.6, -s * 0.4)) - 0.5) * 0.5;
  return w;
}
vec3 waterNormal(vec2 xz, float t, float dist) {
  float amp = uWaveHeight * 0.06 / (1.0 + dist * 0.15);
  vec2 e = vec2(0.02, 0.0);
  float c = waves(xz, t);
  return normalize(vec3((c - waves(xz + e.xy, t)) * amp / e.x, 1.0, (c - waves(xz + e.yx, t)) * amp / e.x));
}

// ---------------------------------------------------------------- sky

vec3 sunDir() {
  return normalize(vec3(cos(uSunElevation) * sin(uSunAzimuth), sin(uSunElevation), cos(uSunElevation) * cos(uSunAzimuth)));
}
vec3 sunColor() {
  float e = clamp(uSunElevation, -0.15, 1.5);
  return mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.95, 0.85), smoothstep(0.0, 0.5, e)) * smoothstep(-0.05, 0.06, e);
}
vec3 skyColor(vec3 rd, bool withClouds) {
  vec3 sd = sunDir();
  float e = uSunElevation;
  float day = smoothstep(-0.1, 0.35, e);
  vec3 zenith = mix(vec3(0.02, 0.03, 0.08), vec3(0.16, 0.36, 0.75), day);
  vec3 dusk = mix(vec3(0.04, 0.06, 0.12), vec3(0.85, 0.42, 0.25), smoothstep(-0.12, 0.06, e));
  vec3 horizon = mix(dusk, vec3(0.72, 0.82, 0.92), smoothstep(0.1, 0.6, e));
  float y = max(rd.y, 0.0);
  vec3 col = mix(horizon, zenith, pow(y, 0.45));
  // Stars fade in after sunset.
  float night = 1.0 - smoothstep(-0.12, 0.08, e);
  if (night > 0.0 && rd.y > 0.0) {
    vec2 sp = floor(rd.xz / (rd.y + 0.3) * 220.0);
    float st = step(0.996, hash12(sp + 17.0));
    col += vec3(0.8, 0.85, 1.0) * st * night * smoothstep(0.0, 0.2, rd.y);
  }
  float sdot = max(dot(rd, sd), 0.0);
  col += sunColor() * (pow(sdot, 8.0) * 0.25 + pow(sdot, 64.0) * 0.4);
  col += sunColor() * smoothstep(0.9993, 0.9997, sdot) * 4.0;
  if (withClouds && rd.y > 0.0 && uClouds > 0.0) {
    vec2 uv = rd.xz / (rd.y + 0.08) * 1.6 + vec2(iTime * 0.02, 0.0);
    float c = fbm5(uv + vec2(uSeed));
    float cover = smoothstep(1.0 - uClouds * 0.85, 1.05 - uClouds * 0.6, c + 0.15);
    vec3 cc = mix(vec3(0.35, 0.37, 0.42) * (0.2 + day), vec3(1.0) * (0.25 + 0.75 * day), 0.6 + 0.4 * (c - 0.4)) + sunColor() * pow(sdot, 4.0) * 0.4;
    col = mix(col, cc, cover * smoothstep(0.0, 0.12, rd.y));
  }
  return col;
}

// ---------------------------------------------------------------- shading


// ---------------------------------------------------------------- vegetation
// Plants live on a jittered grid (one candidate per cell, kept inside its
// cell so a ray only ever tests the cell it is in). Placement depends on
// forest patches, tree line, slope and shoreline; species on altitude.

float gDist = 0.0; // distance of the shaded point from the camera (for LOD)

float vegHash(vec2 c, float k) { return hash12(c * 1.37 + vec2(k * 17.31 + uVegSeed * 3.71, k * 5.13)); }
float plantCell() { return 0.16 * uTreeSize; }
float vegFar() { return uQuality == 0 ? 4.0 : uQuality == 1 ? 9.0 : 18.0; }
bool vegEnabled() { return uPlants && (uForest > 0.0 || uShrubs > 0.0 || (uStyle >= 3 && uCacti > 0.0)); }
// Value noise in 3D (crown surface detail).
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + i.z * 113.0;
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  vec2 r = mix(m.xy, m.zw, f.y);
  return mix(r.x, r.y, f.x);
}
// Natural foliage: pull towards the colour's luminance and vary hue per plant.
vec3 foliageTint(vec3 base, float v, float w) {
  float l = dot(base, vec3(0.3, 0.55, 0.15));
  vec3 c = mix(vec3(l), base, 0.66);
  c *= mix(vec3(1.08, 1.0, 0.78), vec3(0.85, 0.97, 1.05), v); // yellow-green .. blue-green
  return c * (0.7 + 0.45 * w);
}
float forestMask(vec2 xz) {
  float clump = vnoise(xz * 0.9 / uTreeSize + vec2(uVegSeed * 1.3, 7.1));
  return uForest * mix(1.0, smoothstep(0.42, 0.62, clump), uForestPatch);
}
float treeLineMask(float y) { return 1.0 - smoothstep(uTreeLine - 0.15, uTreeLine + 0.05, y); }

struct Plant {
  float kind;   // 0 none, 1 conifer, 2 broadleaf, 3 shrub, 4 cactus
  vec3 base;
  float s;      // size
  float v;      // per-plant variation 0..1
  vec3 tint;
};

Plant plantAt(vec2 cell) {
  Plant pl;
  pl.kind = 0.0;
  pl.base = vec3(0.0);
  pl.s = 0.0;
  pl.v = 0.0;
  pl.tint = vec3(0.0);
  float G = plantCell();
  bool desert = uStyle >= 3;
  float r0 = vegHash(cell, 1.0);
  vec2 xz = (cell + 0.3 + 0.4 * vec2(vegHash(cell, 2.0), vegHash(cell, 3.0))) * G;
  float dens = desert ? uCacti * 0.3 : forestMask(xz);
  bool tree = r0 < dens;
  bool shrub = !tree && r0 < dens + uShrubs * (desert ? 0.15 : 0.3);
  if (!tree && !shrub) return pl;
  float y = terrain(xz);
  if (y < uWaterLevel + 0.03) return pl;
  if (treeLineMask(y + (vegHash(cell, 4.0) - 0.5) * 0.2) < 0.5 && !desert) return pl;
  float e = 0.03;
  float slope = length(vec2(terrain(xz + vec2(e, 0.0)) - y, terrain(xz + vec2(0.0, e)) - y)) / e;
  if (slope > (tree ? 0.85 : 1.2)) return pl;
  pl.base = vec3(xz.x, y - 0.004, xz.y);
  pl.v = vegHash(cell, 5.0);
  pl.s = G * (1.0 + (pl.v - 0.5) * uTreeVariety * 1.2) * mix(0.75, 1.15, vnoise(xz * 1.7 + 3.0));
  if (desert) pl.kind = tree ? 4.0 : 3.0;
  else if (shrub) pl.kind = 3.0;
  else {
    float con = clamp(uConifer + (y / max(uTreeLine, 0.2) - 0.5) * 0.5, 0.0, 1.0);
    pl.kind = vegHash(cell, 6.0) < con ? 1.0 : 2.0;
  }
  float tv = vegHash(cell, 7.0);
  pl.tint = foliageTint(uLeafColor, vegHash(cell, 8.0), tv);
  if (pl.kind == 1.0) pl.tint *= vec3(0.6, 0.72, 0.74);
  if (pl.kind == 3.0) pl.tint *= desert ? vec3(1.25, 1.08, 0.75) : vec3(0.9, 0.95, 0.85);
  return pl;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdConeY(vec3 q, float yb, float ya, float rb) {
  float r = length(q.xz);
  float hgt = ya - yb;
  float rc = rb * clamp((ya - q.y) / hgt, 0.0, 1.0);
  float d = (r - rc) * hgt / sqrt(hgt * hgt + rb * rb);
  return max(d, max(yb - q.y, q.y - ya));
}

// Returns (distance, material): 1 bark, 2 foliage, 3 cactus.
vec2 plantSDF(vec3 p, Plant pl) {
  vec3 q = p - pl.base;
  float s = pl.s;
  if (pl.kind == 1.0) {
    // Conifer: narrow, many drooping tiers with ragged edges.
    float H = (1.05 + 0.3 * pl.v) * s;
    float trunk = sdCapsule(q, vec3(0.0), vec3(0.0, 0.25 * H, 0.0), 0.022 * s);
    float r = length(q.xz);
    float a = atan(q.z, q.x);
    float h = clamp(q.y / H, 0.0, 1.0);
    float tiers = fract(h * 6.0 + pl.v);
    float rad = 0.3 * s * pow(1.0 - h, 0.9) * (0.6 + 0.4 * tiers) * (0.9 + 0.1 * sin(a * 7.0 + pl.v * 20.0 + h * 9.0));
    float f = max((r - rad) * 0.8, max(0.12 * H - q.y, q.y - H));
    f += 0.012 * s * (vnoise3(q * 60.0 / s) - 0.5);
    return f < trunk ? vec2(f, 2.0) : vec2(trunk, 1.0);
  }
  if (pl.kind == 2.0) {
    // Broadleaf: a few overlapping lobes over a short trunk, lumpy surface.
    float trunk = sdCapsule(q, vec3(0.0), vec3(0.03 * s * (pl.v - 0.5), 0.36 * s, 0.0), 0.034 * s);
    vec3 c = q - vec3(0.0, 0.5 * s, 0.0);
    float crown = (length(c * vec3(1.0, 1.15, 1.0)) - 0.28 * s) / 1.15;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ang = fi * 2.094 + pl.v * 6.283;
      vec3 o = vec3(cos(ang), -0.35 + 0.5 * fract(pl.v * 7.0 + fi * 0.37), sin(ang)) * 0.17 * s;
      crown = min(crown, (length((c - o) * vec3(1.0, 1.2, 1.0)) - (0.16 + 0.04 * fi) * s) / 1.2);
    }
    crown += 0.06 * s * (vnoise3(c * 11.0 / s + pl.v * 9.0) - 0.45) + 0.012 * s * (vnoise3(c * 60.0 / s) - 0.5);
    return crown < trunk ? vec2(crown * 0.8, 2.0) : vec2(trunk, 1.0);
  }
  if (pl.kind == 3.0) {
    vec3 c = q - vec3(0.0, 0.04 * s, 0.0);
    float d = (length(c * vec3(1.0, 1.6, 1.0)) - 0.09 * s) / 1.6;
    d += 0.025 * s * (vnoise3(c * 55.0 / s + pl.v * 5.0) - 0.45);
    return vec2(d * 0.8, 2.0);
  }
  // Cactus: trunk and one or two arms.
  float d = sdCapsule(q, vec3(0.0), vec3(0.0, 0.55 * s, 0.0), 0.045 * s);
  float ay = (0.2 + 0.15 * pl.v) * s;
  d = min(d, sdCapsule(q, vec3(0.0, ay, 0.0), vec3(0.11 * s, ay, 0.0), 0.03 * s));
  d = min(d, sdCapsule(q, vec3(0.11 * s, ay, 0.0), vec3(0.11 * s, ay + 0.17 * s, 0.0), 0.03 * s));
  if (pl.v > 0.45) {
    float by = ay + 0.1 * s;
    d = min(d, sdCapsule(q, vec3(0.0, by, 0.0), vec3(0.0, by, -0.09 * s), 0.028 * s));
    d = min(d, sdCapsule(q, vec3(0.0, by, -0.09 * s), vec3(0.0, by + 0.13 * s, -0.09 * s), 0.028 * s));
  }
  return vec2(d, 3.0);
}

vec3 plantNormal(vec3 p, Plant pl) {
  vec2 e = vec2(0.0015 * pl.s, 0.0);
  return normalize(vec3(plantSDF(p + e.xyy, pl).x - plantSDF(p - e.xyy, pl).x,
                        plantSDF(p + e.yxy, pl).x - plantSDF(p - e.yxy, pl).x,
                        plantSDF(p + e.yyx, pl).x - plantSDF(p - e.yyx, pl).x));
}

// Approximate shadow of tree crowns on the ground.
float canopyShadow(vec3 p, vec3 sd) {
  if (uQuality == 0 || sd.y <= 0.05 || !vegEnabled() || gDist > vegFar()) return 1.0;
  float G = plantCell();
  vec3 q = p + sd * (0.55 * G / max(sd.y, 0.25));
  Plant pl = plantAt(floor(q.xz / G));
  if (pl.kind < 0.5 || pl.kind > 2.5) return 1.0;
  float r = length(q.xz - pl.base.xz);
  return mix(0.45, 1.0, smoothstep(0.22 * pl.s, 0.3 * pl.s, r));
}

vec3 terrainMaterial(vec3 p, vec3 n) {
  float slope = n.y;
  vec3 rock = uRock * (0.8 + 0.4 * vnoise(p.xz * 8.0));
  vec3 grass = mix(vec3(dot(uGrassColor, vec3(0.3, 0.55, 0.15))), uGrassColor, 0.8) * mix(0.75, 1.2, vnoise(p.xz * 3.0));
  grass = mix(grass, grass * vec3(1.25, 1.05, 0.7), smoothstep(0.55, 0.85, vnoise(p.xz * 0.7 + 4.0)) * 0.6);
  vec3 sand = vec3(0.76, 0.68, 0.5);
  if (uStyle == 4) sand = vec3(0.86, 0.66, 0.42);
  vec3 col = rock;
  float g = smoothstep(0.72, 0.85, slope) * uVegetation * (1.0 - smoothstep(uSnowLine * 0.6, uSnowLine * 0.9, p.y));
  if (uStyle == 4) g *= 0.15;
  col = mix(col, grass, g);
  // Wildflower meadows (near the camera only).
  if (uPlants && uFlowers > 0.0 && gDist < 4.0) {
    vec2 fc = floor(p.xz * 220.0);
    float fpatch = smoothstep(0.45, 0.7, vnoise(p.xz * 2.5 + uVegSeed));
    float speck = step(1.0 - 0.18 * uFlowers, hash12(fc + uVegSeed));
    vec3 fcol = mix(uFlowerColor, vec3(0.9, 0.88, 0.82), step(0.7, hash12(fc + 3.1))) * 0.8;
    col = mix(col, fcol, 0.7 * g * fpatch * speck * (1.0 - smoothstep(1.5, 4.0, gDist)));
  }
  // Distant forests: canopy texture instead of individual trees.
  if (uPlants && uStyle < 3 && uForest > 0.0) {
    float cover = forestMask(p.xz) * treeLineMask(p.y) * smoothstep(0.7, 0.85, slope) * step(uWaterLevel + 0.03, p.y);
    cover *= smoothstep(vegFar() * 0.75, vegFar(), gDist);
    vec3 canopy = foliageTint(uLeafColor, vnoise(p.xz * 3.0), 0.5) * mix(0.4, 0.85, vnoise(p.xz * 22.0 / uTreeSize)) * mix(vec3(1.0), vec3(0.72, 0.86, 0.86), uConifer);
    col = mix(col, canopy, clamp(cover * 1.6, 0.0, 0.92));
  }
  float beach = 1.0 - smoothstep(uWaterLevel + 0.015, uWaterLevel + 0.05 + 0.04 * vnoise(p.xz * 5.0), p.y);
  col = mix(col, sand, beach * smoothstep(0.6, 0.8, slope));
  if (uStyle == 4) col = mix(col, sand, 0.75);
  float snow = smoothstep(uSnowLine, uSnowLine + 0.15, p.y + 0.15 * vnoise(p.xz * 4.0)) * smoothstep(0.55, 0.75, slope);
  col = mix(col, vec3(0.93, 0.95, 1.0), snow);
  return col;
}

float softShadow(vec3 ro, vec3 rd) {
  if (uQuality == 0) return 1.0;
  float res = 1.0, t = 0.05;
  for (int i = 0; i < 40; i++) {
    if (uQuality == 1 && i >= 18) break;
    vec3 p = ro + rd * t;
    float h = p.y - terrain(p.xz);
    res = min(res, 10.0 * h / t);
    t += clamp(h * 0.6, 0.05, 0.6);
    if (res < 0.02 || p.y > uHeight * 1.5) break;
  }
  return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Camera: fly along the heading and follow the ground/water surface.
  float look = iMouse.z > 0.0 ? (iMouse.x / iResolution.x - 0.5) * 3.0 : 0.0;
  float pitch = uPitch + (iMouse.z > 0.0 ? (iMouse.y / iResolution.y - 0.5) * 1.2 : 0.0);
  float heading = uHeading + look;
  vec2 dir = vec2(sin(uHeading), cos(uHeading));
  vec2 camXZ = dir * iTime * uFlySpeed + uPan;
  float ground = max(max(terrain(camXZ), terrain(camXZ + dir * 1.2)), uWaterLevel);
  vec3 ro = vec3(camXZ.x, ground + uAltitude, camXZ.y);
  vec3 fw = normalize(vec3(sin(heading), pitch, cos(heading)));
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + uFov * fw);

  float far = 45.0;
  // Analytic water-plane intersection bounds the terrain march.
  float tWater = rd.y < 0.0 ? (uWaterLevel - ro.y) / rd.y : 1e9;
  float tMax = min(far, tWater);

  float t = 0.02;
  bool hit = false;
  // Vegetation: walk the plant grid cell by cell while near the ground.
  bool veg = vegEnabled();
  float G = plantCell();
  float vFar = vegFar();
  float band = 1.4 * G * (1.0 + 0.6 * uTreeVariety);
  vec2 cachedCell = vec2(1e9);
  Plant cached;
  cached.kind = 0.0;
  Plant hitPlant;
  hitPlant.kind = 0.0;
  float hitMat = 0.0;
  int budget = uQuality == 0 ? 90 : uQuality == 1 ? 190 : 320;
  for (int i = 0; i < 320; i++) {
    if (i >= budget) break;
    vec3 p = ro + rd * t;
    float d = p.y - terrain(p.xz);
    if (d < 0.0015 * t) { hit = true; break; }
    float stp = max(0.012, d * (uQuality == 0 ? 0.6 : 0.42)) * (1.0 + t * 0.012);
    if (veg && t < vFar && d < band) {
      vec2 cell = floor(p.xz / G);
      if (cell != cachedCell) {
        cached = plantAt(cell);
        cachedCell = cell;
      }
      if (cached.kind > 0.0) {
        vec2 v = plantSDF(p, cached);
        if (v.x < 0.0004 + 0.0008 * t) { hit = true; hitPlant = cached; hitMat = v.y; break; }
        stp = min(stp, max(v.x * 0.8, 0.0015));
      }
      // Never step past the cell boundary: the next cell may hold a plant.
      vec2 tb = ((cell + step(0.0, rd.xz)) * G - p.xz) / rd.xz;
      stp = min(stp, max(min(tb.x, tb.y), 0.0) + 0.0005);
    }
    t += stp;
    if (t > tMax) break;
  }

  vec3 sd = sunDir();
  vec3 sc = sunColor();
  vec3 col;
  float dist;
  if (hit && t < tMax && hitMat > 0.0) {
    // Plant shading.
    dist = t;
    gDist = t;
    vec3 p = ro + rd * t;
    vec3 n = plantNormal(p, hitPlant);
    vec3 mat = hitMat == 1.0 ? vec3(0.3, 0.22, 0.15) : hitMat == 3.0 ? vec3(0.27, 0.45, 0.22) : hitPlant.tint;
    if (hitMat == 2.0) mat *= 0.85 + 0.3 * hash12(floor(p.xz * 900.0 + p.y * 700.0));
    // Self-occlusion: darker low in the crown and in its hollows.
    float hgt = clamp((p.y - hitPlant.base.y) / (1.2 * hitPlant.s), 0.0, 1.0);
    float ao = hitPlant.kind <= 2.0 ? 0.3 + 0.7 * hgt * hgt : 0.75;
    if (hitMat == 2.0) ao *= 0.6 + 0.4 * clamp(plantSDF(p + n * 0.03 * hitPlant.s, hitPlant).x / (0.03 * hitPlant.s), 0.0, 1.0);
    float ndl = dot(n, sd);
    float wrap = hitMat == 2.0 ? clamp((ndl + 0.35) / 1.35, 0.0, 1.0) : max(ndl, 0.0);
    float dif = wrap * softShadow(p + n * 0.005, sd);
    // Light through the leaves when looking towards the sun.
    if (hitMat == 2.0) dif += 0.25 * pow(max(dot(rd, sd), 0.0), 4.0) * (1.0 - hgt * 0.5);
    vec3 skyAmb = skyColor(vec3(0.0, 1.0, 0.0), false);
    vec3 moon = vec3(0.025, 0.035, 0.07) * (1.0 - smoothstep(-0.1, 0.1, uSunElevation));
    col = mat * (dif * sc * 1.4 + ao * (skyAmb * 0.45 + moon) + 0.01);
  } else if (hit && t < tMax) {
    dist = t;
    gDist = t;
    vec3 p = ro + rd * t;
    vec3 n = terrainNormal(p.xz, 0.003 + 0.0015 * t);
    vec3 mat = terrainMaterial(p, n);
    float dif = max(dot(n, sd), 0.0) * softShadow(p + n * 0.01, sd) * canopyShadow(p, sd);
    float amb = 0.5 + 0.5 * n.y;
    vec3 skyAmb = skyColor(vec3(0.0, 1.0, 0.0), false);
    vec3 moon = vec3(0.025, 0.035, 0.07) * (1.0 - smoothstep(-0.1, 0.1, uSunElevation));
    col = mat * (dif * sc * 1.6 + amb * (skyAmb * 0.45 + moon) + 0.015);
  } else if (tWater < far) {
    dist = tWater;
    gDist = tWater;
    vec3 p = ro + rd * tWater;
    vec3 n = waterNormal(p.xz, iTime, dist);
    float depth = max(uWaterLevel - terrain(p.xz), 0.0);
    vec3 refl = reflect(rd, n);
    refl.y = abs(refl.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    // Body colour: deep vs shallow, seeing the bed through clear water.
    vec3 bed = terrainMaterial(vec3(p.x, uWaterLevel - depth, p.z), vec3(0.0, 1.0, 0.0)) * (0.35 + 0.65 * max(sd.y, 0.0));
    float k = mix(9.0, 1.5, uClarity);
    vec3 body = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-depth * k * 0.5));
    body = mix(body, bed * uWaterShallow * 2.0, exp(-depth * k) * uClarity);
    body *= 0.35 + 0.65 * smoothstep(-0.1, 0.4, uSunElevation);
    col = mix(body, skyColor(refl, true), fres);
    col += sc * pow(max(dot(refl, sd), 0.0), 180.0) * 2.5;
    float shore = 1.0 - smoothstep(0.0, 0.015 + 0.035 * uFoam, depth);
    float crest = smoothstep(0.55, 0.9, waves(p.xz * 1.3, iTime)) * uWaveHeight;
    float foam = (shore * (0.6 + 0.4 * sin(depth * 60.0 - iTime * 3.0 * uWaveSpeed)) + crest * 0.4) * uFoam * vnoise(p.xz * 18.0 + iTime);
    col = mix(col, vec3(0.92) * (0.3 + 0.7 * max(sd.y, 0.1)), clamp(foam * 1.4, 0.0, 1.0));
  } else {
    dist = far;
    col = skyColor(rd, true);
  }

  // Aerial perspective.
  if (dist < far) {
    vec3 fogCol = skyColor(normalize(vec3(rd.x, 0.02, rd.z)), false) + sc * pow(max(dot(rd, sd), 0.0), 6.0) * 0.3;
    float fogAmt = 1.0 - exp(-dist * (0.01 + uFog * 0.07));
    col = mix(col, fogCol, fogAmt);
  }

  col = col / (1.0 + col * 0.35);
  col = pow(max(col, vec3(0.0)), vec3(0.4545));
  col *= 1.0 - 0.25 * dot(uv, uv);
  fragColor = vec4(col, 1.0);
}
