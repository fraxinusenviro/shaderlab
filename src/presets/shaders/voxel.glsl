// Block World — Shader Forge original (MIT)  [Theme: Earth / Geometry]
// Voxel ("blocky") rendering of the Landscape Studio worlds: the same terrain
// generator, quantised into cubes and traced with a 3D DDA. Procedural
// pixel-art block textures (grass, dirt, stone, sand, snow, terracotta, wood,
// leaves), seeded trees, translucent water, a square sun and blocky clouds.
// Drag on the view to look around.
uniform int uStyle;          // @param options="Mountains:0,Rolling hills:1,Archipelago:2,Canyons:3,Dunes:4" default=0 label="Terrain type" group=Terrain
uniform float uSeed;         // @param widget=seed default=17 min=0 max=999 label="World seed" group=Terrain
uniform float uScale;        // @param default=1.0 min=0.3 max=3 step=0.01 label="Feature scale" group=Terrain
uniform float uHeight;       // @param default=1.6 min=0.1 max=4 step=0.01 label="Relief height" group=Terrain
uniform float uRoughness;    // @param default=0.5 min=0.3 max=0.65 step=0.005 label="Roughness" group=Terrain
uniform int uOctaves;        // @param default=7 min=2 max=9 label="Detail octaves" group=Terrain
uniform float uSnowLine;     // @param default=1.6 min=0 max=4 step=0.01 label="Snow line" group=Terrain
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
uniform float uBlockSize;    // @param default=0.12 min=0.04 max=0.4 step=0.005 label="Block size" group=Blocks
uniform float uPixelTexture; // @param default=1 min=0 max=1 step=0.01 label="Pixel texture strength" group=Blocks
uniform float uEdges;        // @param default=0.35 min=0 max=1 step=0.01 label="Block edge shading" group=Blocks
uniform float uWaterLevel;   // @param default=0.35 min=-0.5 max=2.5 step=0.01 label="Water level" group=Water
uniform float uWaveSpeed;    // @param default=0.8 min=0 max=3 step=0.01 label="Water shimmer speed" group=Water
uniform float uClarity;      // @param default=0.5 min=0 max=1 step=0.01 label="Water clarity" group=Water
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
// Octaves finer than a block are invisible once quantised; set in mainImage.
int gOctaves = 7;

float fbmT(vec2 p, bool ridged) {
  float h = 0.0, a = 0.5, w = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= gOctaves) break;
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

vec3 sunDir() {
  return normalize(vec3(cos(uSunElevation) * sin(uSunAzimuth), sin(uSunElevation), cos(uSunElevation) * cos(uSunAzimuth)));
}
vec3 sunColor() {
  float e = clamp(uSunElevation, -0.15, 1.5);
  return mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.95, 0.85), smoothstep(0.0, 0.5, e)) * smoothstep(-0.05, 0.06, e);
}

// ---------------------------------------------------------------- blocks

const float M_GRASS = 1.0;
const float M_DIRT = 2.0;
const float M_STONE = 3.0;
const float M_SAND = 4.0;
const float M_SNOW = 5.0;
const float M_WOOD = 6.0;
const float M_LEAVES = 7.0;
const float M_CLAY = 8.0;
const float M_GRAVEL = 9.0;
const float M_SPRUCE = 10.0;
const float M_CACTUS = 11.0;

float hash13(vec3 p) {
  p = mod(p, 289.0);
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719)) + 0.07 * uSeed) * 43758.5453);
}

// Ground height of a column, in whole blocks.
float columnTop(vec2 cell) {
  return floor(terrain((cell + 0.5) * uBlockSize) / uBlockSize);
}
float waterTop() {
  return floor(uWaterLevel / uBlockSize + 0.5);
}

// Material of a solid ground cell (y <= top).
float groundMaterial(vec3 cell, float top) {
  float depth = top - cell.y;
  float wy = waterTop();
  float worldY = top * uBlockSize;
  if (uStyle == 4) return depth < 10.0 ? M_SAND : M_STONE;
  if (uStyle == 3) return depth < 1.0 && hash13(vec3(cell.xz, 3.0)) < 0.5 * uVegetation ? M_SAND : M_CLAY;
  if (top < wy) return depth < 2.0 ? (hash13(vec3(cell.xz, 1.0)) < 0.35 ? M_GRAVEL : M_SAND) : M_STONE;
  // Beaches: coherent patches right at the waterline, thinning one block up.
  float beach = vnoise(cell.xz * 0.12 + 3.7);
  if ((top < wy + 1.0 && beach > 0.35) || (top < wy + 2.0 && beach > 0.7)) return depth < 3.0 ? M_SAND : M_STONE;
  float snowJitter = (hash13(vec3(cell.xz, 2.0)) - 0.5) * 0.15;
  if (worldY > uSnowLine + snowJitter) return depth < 1.0 ? M_SNOW : M_STONE;
  bool rocky = worldY > uSnowLine * 0.75 || hash13(vec3(cell.xz, 5.0)) > 0.35 + uVegetation;
  if (depth < 1.0) return rocky ? M_STONE : M_GRASS;
  if (depth < 4.0) return rocky ? M_STONE : M_DIRT;
  return M_STONE;
}

// Plants sit on a coarse grid: at most one per 6x6 block cell, with the trunk
// two or three blocks in, so a radius-2 canopy stays inside the cell and a
// block only ever needs to test a single candidate.
float vegHash(vec2 c, float k) { return hash13(vec3(c, k + uVegSeed * 7.13)); }

// kind: 0 none, 1 oak, 2 spruce, 3 bush, 4 cactus. size = trunk height in blocks.
vec2 plantKind(vec2 col, out vec2 trunk, out float size) {
  vec2 tc = floor(col / 6.0);
  trunk = tc * 6.0 + 2.0 + floor(vec2(vegHash(tc, 10.0), vegHash(tc, 11.0)) * 1.999);
  size = 0.0;
  float r = vegHash(tc, 9.0);
  bool desert = uStyle >= 3;
  float clump = vnoise(tc * 0.35 + vec2(uVegSeed * 0.71, 3.3));
  float dens = desert ? uCacti * 0.5 : uForest * mix(1.0, smoothstep(0.42, 0.62, clump), uForestPatch) * 0.95;
  float v = vegHash(tc, 12.0);
  if (r < dens) {
    if (desert) {
      size = 2.0 + floor(v * 2.5 * uTreeSize);
      return vec2(4.0, v);
    }
    size = clamp(floor((3.0 + 1.6 * uTreeSize) * (1.0 + (v - 0.5) * uTreeVariety)), 2.0, 9.0);
    return vec2(vegHash(tc, 13.0) < uConifer ? 2.0 : 1.0, v);
  }
  if (r < dens + uShrubs * 0.4) return vec2(3.0, v);
  return vec2(0.0, v);
}

bool plantAllowed(float top, float kind) {
  float worldY = top * uBlockSize;
  if (kind == 4.0) return top > waterTop();
  return uStyle < 3 && top > waterTop() + 1.0 && worldY < uTreeLine && worldY < uSnowLine;
}

// Plant blocks above a column (top = this column's ground). The plant's base
// is assumed to be at this column's ground height (smooth at block scale).
float treeMaterial(vec3 cell, float top) {
  if (uForest <= 0.0 && uShrubs <= 0.0 && uCacti <= 0.0) return 0.0;
  float h = cell.y - top;
  if (h < 1.0 || h > 11.0) return 0.0;
  vec2 trunk;
  float size;
  vec2 kv = plantKind(cell.xz, trunk, size);
  float kind = kv.x;
  if (kind == 0.0 || !plantAllowed(top, kind)) return 0.0;
  vec2 d = abs(cell.xz - trunk);
  float r = max(d.x, d.y);
  if (kind == 3.0) return (r == 0.0 && h == 1.0) || (h == 1.0 && r == 1.0 && d.x + d.y == 1.0 && kv.y > 0.5) ? M_LEAVES : 0.0;
  if (kind == 4.0) return r == 0.0 && h <= size ? M_CACTUS : 0.0;
  if (r == 0.0 && h <= size) return M_WOOD;
  if (kind == 2.0) {
    // Spruce: alternating radius-2 / radius-1 layers narrowing to a tip.
    float j = size + 1.0 - h; // 0 at the tip
    if (j < 0.0 || h < 3.0) return 0.0;
    float rad = j < 0.5 ? 0.0 : mod(j, 2.0) == 1.0 ? 1.0 : (j < size - 1.0 ? 2.0 : 1.0);
    if (r > rad || (rad == 2.0 && d.x == 2.0 && d.y == 2.0)) return 0.0;
    return M_SPRUCE;
  }
  // Oak: wide lower canopy, narrower top.
  float layer = h - size; // -1 .. 2
  if (layer < -1.0 || layer > 2.0) return 0.0;
  float rad = layer <= 0.0 ? 2.0 : 1.0;
  if (layer == 2.0 && d.x == 1.0 && d.y == 1.0) return 0.0;
  if (r > rad) return 0.0;
  if (d.x == 2.0 && d.y == 2.0 && hash13(vec3(trunk, h)) < 0.6) return 0.0;
  return M_LEAVES;
}

// Pixel-art texture: 16x16 texels per face.
vec3 blockTexture(float m, vec3 cell, vec3 n, vec2 uv) {
  vec2 tx = floor(uv * 16.0);
  float r = hash13(vec3(tx + cell.xz * 17.0 + cell.y * 5.0, m + n.x * 3.0 + n.z * 7.0));
  float r2 = hash13(vec3(tx * 0.5, m * 11.0 + cell.x));
  float k = mix(1.0, 0.82 + 0.36 * r, uPixelTexture);
  bool top = n.y > 0.5;
  bool side = abs(n.y) < 0.5;
  vec3 dirt = vec3(0.47, 0.33, 0.22);
  vec3 grass = uGrassColor * 1.6;
  if (m == M_GRASS) {
    if (top) {
      // Flowers dotted over grass tops, in patches.
      float fp = smoothstep(0.45, 0.65, vnoise(cell.xz * 0.15 + uVegSeed));
      if (uFlowers > 0.0 && hash13(vec3(tx, cell.x * 3.0 + cell.z)) < uFlowers * 0.12 * fp) return mix(uFlowerColor, vec3(0.95), step(0.7, r2));
      return grass * k;
    }
    if (side) {
      float fringe = 13.0 - floor(r2 * 3.0);
      return (tx.y >= fringe ? grass * 0.9 : dirt) * k;
    }
    return dirt * k;
  }
  if (m == M_DIRT) return dirt * k;
  if (m == M_STONE) {
    vec3 c = mix(uRock, vec3(0.5), 0.55);
    return c * mix(1.0, (r > 0.86 ? 0.7 : 0.9 + 0.2 * r), uPixelTexture);
  }
  if (m == M_SAND) return (uStyle == 4 ? vec3(0.93, 0.74, 0.47) : vec3(0.86, 0.8, 0.58)) * mix(1.0, 0.9 + 0.15 * r, uPixelTexture);
  if (m == M_GRAVEL) return vec3(0.55, 0.52, 0.5) * k;
  if (m == M_SNOW) {
    if (side) return (tx.y >= 12.0 - floor(r2 * 2.0) ? vec3(0.95, 0.97, 1.0) : dirt) * k;
    return vec3(0.95, 0.97, 1.0) * mix(1.0, 0.94 + 0.06 * r, uPixelTexture);
  }
  if (m == M_CLAY) {
    float band = mod(cell.y, 7.0);
    vec3 c = band < 1.0 ? vec3(0.78, 0.6, 0.45) : band < 3.0 ? vec3(0.72, 0.38, 0.22) : band < 4.0 ? vec3(0.85, 0.7, 0.5) : vec3(0.62, 0.32, 0.2);
    return c * mix(1.0, 0.92 + 0.12 * r, uPixelTexture);
  }
  if (m == M_WOOD) {
    if (!side) {
      float ring = length(tx - 7.5);
      return mix(vec3(0.62, 0.48, 0.3), vec3(0.45, 0.32, 0.18), step(0.5, fract(ring * 0.28))) * k;
    }
    return vec3(0.38, 0.27, 0.16) * mix(1.0, (mod(tx.x, 4.0) < 1.0 ? 0.75 : 0.95 + 0.1 * r), uPixelTexture);
  }
  if (m == M_CACTUS) {
    if (!side) return vec3(0.3, 0.55, 0.25) * k;
    return vec3(0.25, 0.5, 0.2) * mix(1.0, (mod(tx.x, 4.0) < 1.0 ? 0.7 : (r > 0.92 ? 1.4 : 0.95)), uPixelTexture);
  }
  if (m == M_SPRUCE) return uLeafColor * vec3(0.85, 1.05, 1.0) * 1.2 * mix(1.0, (r < 0.2 ? 0.6 : 0.8 + 0.3 * r), uPixelTexture);
  // leaves
  return uLeafColor * 1.45 * mix(1.0, (r < 0.2 ? 0.55 : 0.85 + 0.3 * r), uPixelTexture);
}

// ---------------------------------------------------------------- sky

vec3 skyColor(vec3 rd, bool withClouds) {
  vec3 sd = sunDir();
  float e = uSunElevation;
  float day = smoothstep(-0.1, 0.35, e);
  vec3 zenith = mix(vec3(0.02, 0.03, 0.08), vec3(0.25, 0.48, 0.9), day);
  vec3 dusk = mix(vec3(0.04, 0.06, 0.12), vec3(0.9, 0.5, 0.3), smoothstep(-0.12, 0.06, e));
  vec3 horizon = mix(dusk, vec3(0.68, 0.82, 0.98), smoothstep(0.1, 0.6, e));
  float y = max(rd.y, 0.0);
  vec3 col = mix(horizon, zenith, pow(y, 0.5));
  // Square sun (and moon opposite) in a basis aligned with the sun direction.
  vec3 su = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
  vec3 sv = cross(su, sd);
  float fwd = dot(rd, sd);
  if (fwd > 0.0) {
    vec2 q = vec2(dot(rd, su), dot(rd, sv)) / fwd;
    float sq = max(abs(q.x), abs(q.y));
    col += sunColor() * (step(sq, 0.06) * 3.0 + smoothstep(0.25, 0.06, sq) * 0.25);
  } else {
    vec2 q = vec2(dot(rd, su), dot(rd, sv)) / -fwd;
    col += vec3(0.85, 0.88, 0.95) * step(max(abs(q.x), abs(q.y)), 0.045) * (1.0 - day);
  }
  float night = 1.0 - smoothstep(-0.12, 0.08, e);
  if (night > 0.0 && rd.y > 0.0) {
    vec2 sp = floor(rd.xz / (rd.y + 0.3) * 160.0);
    col += vec3(0.85, 0.9, 1.0) * step(0.996, hash12(sp + 31.0)) * night;
  }
  // Flat, blocky cloud layer.
  if (withClouds && rd.y > 0.02 && uClouds > 0.0) {
    vec2 uv = rd.xz / rd.y * 6.0 + vec2(iTime * 0.15, 0.0);
    vec2 cc = floor(uv);
    float c = vnoise(cc * 0.35 + vec2(uSeed * 0.1)) * 0.65 + vnoise(cc * 0.9) * 0.35;
    float cover = step(1.0 - uClouds * 0.65, c);
    vec3 cloud = vec3(1.0) * (0.25 + 0.75 * day) + sunColor() * 0.1;
    col = mix(col, cloud, cover * 0.92 * smoothstep(0.02, 0.15, rd.y));
  }
  return col;
}

// ---------------------------------------------------------------- tracing

struct Hit {
  float t;      // distance in block units
  float m;      // material (0 = sky)
  vec3 cell;
  vec3 n;
  float waterT; // entry distance into water (or -1)
  vec3 waterN;
};

Hit traceBlocks(vec3 ro, vec3 rd, int maxSteps, bool trees, bool stopAtWater) {
  Hit h;
  h.t = 1e9;
  h.m = 0.0;
  h.cell = vec3(0.0);
  h.n = vec3(0.0, 1.0, 0.0);
  h.waterT = -1.0;
  h.waterN = vec3(0.0, 1.0, 0.0);
  rd = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x, abs(rd.y) < 1e-5 ? 1e-5 : rd.y, abs(rd.z) < 1e-5 ? 1e-5 : rd.z);
  float ceilingY = (uHeight * 1.5) / uBlockSize + 13.0;
  float t0 = 0.0;
  // Skip empty space above the tallest possible terrain.
  if (ro.y > ceilingY) {
    if (rd.y >= 0.0) return h;
    t0 = (ro.y - ceilingY) / -rd.y;
  }
  // Leap through open air on the continuous height field (with clearance for
  // block quantisation and trees), then walk blocks only near the surface.
  float clearance = (trees ? 13.0 : 2.0);
  for (int i = 0; i < 48; i++) {
    vec3 q = ro + rd * t0;
    float gap = q.y - (terrain(q.xz * uBlockSize) / uBlockSize + clearance);
    if (gap < 1.0) break;
    t0 += gap * 0.6;
    if (q.y > ceilingY && rd.y > 0.0) return h;
  }
  vec3 p = ro + rd * t0;
  vec3 cell = floor(p);
  vec3 stp = sign(rd);
  vec3 tDelta = abs(1.0 / rd);
  vec3 tMax = (stp * (cell - p) + stp * 0.5 + 0.5) * tDelta + t0;
  float t = t0;
  vec3 n = -stp * vec3(0.0, 1.0, 0.0);
  vec2 col = vec2(1e9);
  float top = 0.0;
  float wy = waterTop();
  for (int i = 0; i < 420; i++) {
    if (i >= maxSteps) break;
    if (cell.x != col.x || cell.z != col.y) {
      col = cell.xz;
      top = columnTop(col);
    }
    if (cell.y <= top) {
      h.t = t;
      h.m = groundMaterial(cell, top);
      h.cell = cell;
      h.n = n;
      return h;
    }
    if (trees) {
      float tm = treeMaterial(cell, top);
      if (tm > 0.0) {
        h.t = t;
        h.m = tm;
        h.cell = cell;
        h.n = n;
        return h;
      }
    }
    if (cell.y < wy && h.waterT < 0.0) {
      h.waterT = t;
      h.waterN = n;
      if (stopAtWater) return h;
    }
    // Beyond ~40 blocks of water the bed is invisible.
    if (h.waterT >= 0.0 && t - h.waterT > 40.0) return h;
    if (cell.y > ceilingY && rd.y > 0.0) break;
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      t = tMax.x;
      cell.x += stp.x;
      tMax.x += tDelta.x;
      n = vec3(-stp.x, 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      t = tMax.y;
      cell.y += stp.y;
      tMax.y += tDelta.y;
      n = vec3(0.0, -stp.y, 0.0);
    } else {
      t = tMax.z;
      cell.z += stp.z;
      tMax.z += tDelta.z;
      n = vec3(0.0, 0.0, -stp.z);
    }
  }
  return h;
}

vec2 faceUV(vec3 p, vec3 n) {
  vec3 f = fract(p);
  if (abs(n.x) > 0.5) return vec2(n.x > 0.0 ? 1.0 - f.z : f.z, f.y);
  if (abs(n.z) > 0.5) return vec2(n.z > 0.0 ? f.x : 1.0 - f.x, f.y);
  return f.xz;
}

vec3 shadeBlock(Hit h, vec3 ro, vec3 rd, vec3 sd, vec3 sc) {
  vec3 p = ro + rd * h.t;
  vec2 uv = faceUV(p - h.n * 0.001, h.n);
  vec3 alb = blockTexture(h.m, h.cell, h.n, uv);
  // Classic per-face shading plus sun light.
  float face = h.n.y > 0.5 ? 1.0 : h.n.y < -0.5 ? 0.5 : abs(h.n.x) > 0.5 ? 0.8 : 0.68;
  float dif = max(dot(h.n, sd), 0.0);
  float shadow = 1.0;
  if (uQuality == 2 && dif > 0.0 && sd.y > 0.0) {
    Hit s = traceBlocks(p + h.n * 0.01, sd, 80, true, false);
    shadow = s.m > 0.0 ? 0.35 : 1.0;
  } else if (uQuality == 1 && dif > 0.0 && sd.y > 0.0) {
    // Cheap: a few samples along the sun direction against column heights.
    vec3 q = p + h.n * 0.01;
    for (int i = 1; i <= 4; i++) {
      vec3 sp = q + sd * (float(i * i) * 1.5);
      if (sp.y < columnTop(floor(sp.xz)) + 1.0) { shadow = 0.4; break; }
    }
  }
  vec3 moon = vec3(0.04, 0.05, 0.09) * (1.0 - smoothstep(-0.1, 0.1, uSunElevation));
  vec3 skyAmb = skyColor(vec3(0.0, 1.0, 0.0), false);
  vec3 col = alb * (face * (0.35 * skyAmb + moon * 4.0) + dif * shadow * sc * 1.1 + 0.02);
  // Darken towards block edges for a crisp, cubic read.
  vec2 e = min(uv, 1.0 - uv);
  col *= 1.0 - uEdges * 0.35 * (1.0 - smoothstep(0.0, 0.08, min(e.x, e.y)));
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  // Base noise cell is ~2.9 * uScale world units; each octave halves it (x0.5 via ROT's 2x scale).
  float octs = floor(log2((2.857 * uScale) / (uBlockSize * 1.5))) + 1.0;
  gOctaves = int(clamp(min(octs, float(uOctaves)), 1.0, 9.0));

  float look = iMouse.z > 0.0 ? (iMouse.x / iResolution.x - 0.5) * 3.0 : 0.0;
  float pitch = uPitch + (iMouse.z > 0.0 ? (iMouse.y / iResolution.y - 0.5) * 1.2 : 0.0);
  float heading = uHeading + look;
  vec2 dir = vec2(sin(uHeading), cos(uHeading));
  vec2 camXZ = dir * iTime * uFlySpeed;
  float ground = max(max(terrain(camXZ), terrain(camXZ + dir * 1.2)), uWaterLevel);
  vec3 roW = vec3(camXZ.x, ground + uAltitude + uBlockSize * 2.0, camXZ.y);
  vec3 fw = normalize(vec3(sin(heading), pitch, cos(heading)));
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + uFov * fw);

  vec3 ro = roW / uBlockSize;
  int steps = uQuality == 0 ? 120 : uQuality == 1 ? 220 : 400;
  Hit h = traceBlocks(ro, rd, steps, true, false);

  vec3 sd = sunDir();
  vec3 sc = sunColor();
  vec3 sky = skyColor(rd, true);
  vec3 col = sky;
  float dist = 1e9;
  if (h.m > 0.0) {
    col = shadeBlock(h, ro, rd, sd, sc);
    dist = h.t;
  }
  if (h.waterT >= 0.0 && (h.m == 0.0 || h.waterT < h.t)) {
    // Translucent water: absorb along the path to the bed, reflect the sky.
    float through = (h.m > 0.0 ? h.t : h.waterT + 60.0) - h.waterT;
    float k = mix(0.6, 0.06, uClarity);
    vec3 wp = ro + rd * h.waterT;
    vec2 wuv = faceUV(wp - h.waterN * 0.001, h.waterN);
    float shimmer = hash13(vec3(floor(wuv * 16.0) + floor(wp.xz) * 16.0, floor(iTime * uWaveSpeed * 3.0)));
    vec3 body = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-through * 0.15)) * (0.92 + 0.12 * shimmer * uPixelTexture);
    body *= 0.35 + 0.65 * smoothstep(-0.1, 0.4, uSunElevation);
    // The bed is tinted by the water it is seen through.
    col *= mix(vec3(1.0), uWaterShallow * 1.8, 0.75);
    col = mix(col, body, 0.25 + 0.75 * (1.0 - exp(-through * k)));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(h.waterN, -rd), 0.0), 5.0);
    vec3 refl = reflect(rd, h.waterN);
    col = mix(col, skyColor(refl, false), fres * 0.6);
    dist = h.waterT;
  }
  if (dist < 1e8) {
    float far = float(steps) * 0.6;
    float fogAmt = max(1.0 - exp(-dist * uBlockSize * (0.01 + uFog * 0.06)), smoothstep(far * 0.55, far, dist));
    col = mix(col, skyColor(normalize(vec3(rd.x, 0.02, rd.z)), false), fogAmt);
  }
  col = pow(max(col, vec3(0.0)), vec3(0.4545));
  fragColor = vec4(col, 1.0);
}
