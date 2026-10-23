// Layered Landscape — Shader Forge original (MIT).
// The Landscape studio's worlds drawn the Radiant way: flat 2D layers instead of
// ray marching. Each depth layer is a 1D noise ridge (parallax-scrolled), with
// tree silhouettes, aerial haze, a water plane, sun and clouds. Every pixel tests
// at most a handful of layers, so it costs a small fraction of the 3D styles.
uniform int uStyle;          // @param options="Mountains:0,Rolling hills:1,Archipelago:2,Canyons:3,Dunes:4" default=0 label="Terrain type" group=Terrain
uniform float uSeed;         // @param widget=seed default=17 min=0 max=999 label="World seed" group=Terrain
uniform float uScale;        // @param default=1.0 min=0.3 max=3 step=0.01 label="Feature scale" group=Terrain
uniform float uHeight;       // @param default=1.6 min=0.1 max=4 step=0.01 label="Relief height" group=Terrain
uniform float uRoughness;    // @param default=0.5 min=0.3 max=0.65 step=0.005 label="Roughness" group=Terrain
uniform float uSnowLine;     // @param default=1.6 min=0 max=4 step=0.01 label="Snow line" group=Terrain
uniform bool uPlants;        // @param default=true label="Plants (trees, shrubs, flowers)" group=Vegetation
uniform float uVegetation;   // @param default=0.6 min=0 max=1 step=0.01 label="Grass cover" group=Vegetation
uniform float uForest;       // @param default=0.45 min=0 max=1 step=0.01 label="Forest density" group=Vegetation
uniform float uForestPatch;  // @param default=0.55 min=0 max=1 step=0.01 label="Forest clumping" group=Vegetation
uniform float uConifer;      // @param default=0.5 min=0 max=1 step=0.01 label="Conifer share" group=Vegetation
uniform float uTreeSize;     // @param default=1 min=0.4 max=2.5 step=0.01 label="Tree size" group=Vegetation
uniform float uTreeLine;     // @param default=1.3 min=0 max=4 step=0.01 label="Tree line altitude" group=Vegetation
uniform vec3 uLeafColor;     // @param widget=color default=0.15,0.3,0.09 label="Foliage colour" group=Vegetation
uniform vec3 uGrassColor;    // @param widget=color default=0.25,0.32,0.1 label="Grass colour" group=Vegetation
uniform vec3 uRock;          // @param widget=color default=0.42,0.36,0.3 label="Rock colour" group=Terrain
uniform float uWaterLevel;   // @param default=0.35 min=-0.5 max=2.5 step=0.01 label="Water level" group=Water
uniform float uWaveHeight;   // @param default=0.35 min=0 max=1 step=0.01 label="Wave height" group=Water
uniform float uWaveSpeed;    // @param default=0.8 min=0 max=3 step=0.01 label="Wave speed" group=Water
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

uniform int uLayers;         // @param default=6 min=3 max=8 label="Depth layers" group=Layers
uniform float uPoster;       // @param default=0.3 min=0 max=1 step=0.01 label="Flat colour (poster look)" group=Layers
uniform float uDepthSpread;  // @param default=1 min=0.4 max=2 step=0.01 label="Depth spread" group=Layers

float hash11(float x) { return fract(sin(x * 127.1 + uSeed * 3.17) * 43758.5453); }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + 0.137 * uSeed) * 43758.5453); }
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm1(float x, int oct, bool ridged) {
  float h = 0.0, a = 0.5, w = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    float n = noise1(x);
    if (ridged) { n = 1.0 - abs(n * 2.0 - 1.0); n *= n; }
    h += a * n;
    w += a;
    x = x * 2.03 + 1.7;
    a *= uRoughness;
  }
  return h / w;
}

// Ridge height at horizontal position x: the 3D studio's terrain types in 1D.
float profileO(float x, int oct) {
  float h;
  if (uStyle == 0) {
    h = pow(fbm1(x, oct, true), 1.5) * 1.35;
  } else if (uStyle == 1) {
    h = fbm1(x * 0.55, oct, false) * 0.75;
  } else if (uStyle == 2) {
    float f = fbm1(x * 0.8, oct, false);
    h = smoothstep(0.42, 0.95, f) * 1.1 + 0.05 * f;
  } else if (uStyle == 3) {
    float f = fbm1(x * 0.6, oct, false);
    float tr = floor(f * 5.0) / 5.0;
    h = mix(tr, f, 0.25 + 0.75 * smoothstep(0.85, 1.0, fract(f * 5.0)));
    h *= smoothstep(0.0, 0.08, abs(fbm1(x * 0.35 + 9.0, 3, false) - 0.5)) * 0.8 + 0.2;
  } else {
    float d = fbm1(x * 0.35, 3, false);
    float r = fract((x * 5.5 + d * 9.0) / 6.2831853);
    float ridge = r < 0.7 ? smoothstep(0.0, 0.7, r) : 1.0 - smoothstep(0.7, 1.0, r);
    h = ridge * ridge * 0.4 * (0.5 + d) + d * 0.45;
  }
  return h * uHeight;
}
float profile(float x) { return profileO(x, 6); }

vec3 sunColor() {
  float e = clamp(uSunElevation, -0.15, 1.5);
  return mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.95, 0.88), smoothstep(0.0, 0.5, e)) * smoothstep(-0.12, 0.02, e);
}
vec3 skyAt(float y, float sx) {
  float e = uSunElevation;
  float day = smoothstep(-0.1, 0.35, e);
  vec3 zenith = mix(vec3(0.02, 0.03, 0.08), vec3(0.2, 0.4, 0.78), day);
  vec3 dusk = mix(vec3(0.04, 0.06, 0.12), vec3(0.9, 0.48, 0.3), smoothstep(-0.12, 0.06, e));
  vec3 horizon = mix(dusk, vec3(0.74, 0.83, 0.92), smoothstep(0.1, 0.6, e));
  vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55));
  // Glow towards the sun's side of the sky.
  col += sunColor() * 0.18 * exp(-abs(sx) * 2.0) * (1.0 - clamp(y, 0.0, 1.0));
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float zoom = uFov / 1.4;
  uv /= zoom;
  vec2 dir = vec2(sin(uHeading), cos(uHeading));
  vec2 rt = vec2(-dir.y, dir.x);
  // Flight scrolls sideways; dragging pans (sideways = scroll, vertical = height).
  float scroll = iTime * uFlySpeed * 0.6 + dot(uPan, rt) * -1.0;
  float camY = max(uWaterLevel, 0.3 * uHeight) + uAltitude * 0.6 + dot(uPan, dir) * 0.35;
  float horizon = -uPitch * 0.9;
  // Follow the ground like the 3D flyover: stay above the nearest layer's (smoothed) ridge.
  float nearD = 1.3;
  float nearH = profileO((scroll) * 0.35 / uScale + float(uLayers - 1) * 37.1 + uHeading * 23.0 + uSeed * 7.31, 2);
  camY = max(camY, nearH + uAltitude * 0.6 + 0.1 * nearD);
  float wl = uWaterLevel;
  float sy = uv.y - horizon;

  // Sun position on screen from its direction relative to the heading.
  float rel = atan(sin(uSunAzimuth - uHeading), cos(uSunAzimuth - uHeading));
  vec2 sunP = vec2(rel * 0.6, uSunElevation * 0.75);

  // Sky, sun, stars and clouds.
  vec3 sky = skyAt(sy * 1.6, uv.x - sunP.x);
  float night = 1.0 - smoothstep(-0.12, 0.08, uSunElevation);
  if (night > 0.0) sky += vec3(0.8, 0.85, 1.0) * step(0.997, hash12(floor((uv + vec2(scroll * 0.01, 0.0)) * 260.0))) * night * smoothstep(0.0, 0.15, sy);
  float sd = length(uv - sunP - vec2(0.0, horizon));
  sky += sunColor() * (smoothstep(0.045, 0.035, sd) * 2.0 + 0.25 * exp(-sd * 6.0));
  if (uClouds > 0.0 && sy > 0.0) {
    vec2 cp = vec2((uv.x + scroll * 0.04) * 1.6 + iTime * 0.01, sy * 7.0);
    float c = noise2(cp) * 0.6 + noise2(cp * 2.3 + 5.0) * 0.3 + noise2(cp * 5.1) * 0.1;
    float cover = smoothstep(1.0 - uClouds * 0.7, 1.1 - uClouds * 0.45, c) * smoothstep(0.0, 0.08, sy) * (1.0 - smoothstep(0.35, 0.7, sy));
    float day = smoothstep(-0.1, 0.35, uSunElevation);
    vec3 cc = mix(vec3(0.3, 0.32, 0.38), vec3(1.0), 0.25 + 0.7 * day) + sunColor() * 0.25 * exp(-abs(uv.x - sunP.x) * 3.0);
    sky = mix(sky, cc, cover * 0.9);
  }

  float hazeK = 0.03 + uFog * 0.16;
  vec3 hazeCol = skyAt(0.05, uv.x - sunP.x);
  float lightSide = sin(uSunAzimuth - uHeading) >= 0.0 ? 1.0 : -1.0;
  vec3 col = sky;
  float n = float(uLayers);
  // Water plane depth for this pixel (below the horizon).
  float tWater = sy < -1e-4 ? (wl - camY) / sy : 1e9;
  if (tWater < 0.0) tWater = 1e9;
  bool done = false;
  for (int k = 7; k >= 0; k--) {
    if (k >= uLayers) continue;
    float t = n > 1.0 ? float(k) / (n - 1.0) : 1.0;           // 0 far .. 1 near
    float d = 1.3 * pow(11.0 * uDepthSpread, 1.0 - t);        // layer distance
    if (tWater < d) {
      // Water is in front of this layer.
      vec3 wc = mix(uWaterShallow, uWaterDeep, smoothstep(1.0, 9.0, tWater));
      float wx = uv.x * tWater + scroll;
      float ripple = noise2(vec2(wx * 6.0 + iTime * uWaveSpeed * 0.6, tWater * 9.0));
      vec3 refl = skyAt(-sy * 1.6, uv.x - sunP.x);
      wc = mix(wc, refl, 0.35 + 0.25 * uWaveHeight * ripple);
      float glint = exp(-abs(uv.x - sunP.x) * 10.0) * smoothstep(0.55, 0.9, ripple) * smoothstep(-0.1, 0.1, uSunElevation);
      wc += sunColor() * glint * (0.6 + uWaveHeight);
      col = mix(wc, hazeCol, 1.0 - exp(-tWater * hazeK));
      done = true;
      break;
    }
    float x = (uv.x * d + scroll) * 0.35 / uScale + float(k) * 37.1 + uHeading * 23.0 + uSeed * 7.31;
    float h = profile(x);
    float top = (h - camY) / d;
    // Tree silhouettes along the ridge.
    float treeTop = top;
    bool treeHit = false;
    vec3 treeCol = vec3(0.0);
    if (uPlants && uForest > 0.0 && uStyle != 4 && d < 9.0) {
      float worldCell = floor((uv.x * d + scroll) / (0.055 * uTreeSize));
      float rr = hash12(vec2(worldCell, float(k) * 7.0 + 1.0));
      float patchy = smoothstep(0.35, 0.65, noise1(worldCell * 0.15 + float(k) * 3.0));
      float centerX = ((worldCell + 0.5) * 0.055 * uTreeSize - scroll) / d;
      float hc = profile((centerX * d + scroll) * 0.35 / uScale + float(k) * 37.1 + uHeading * 23.0 + uSeed * 7.31);
      if (rr < uForest * mix(1.0, patchy, uForestPatch) && hc > wl + 0.02 && hc < uTreeLine) {
        float sz = (0.06 + 0.05 * hash12(vec2(worldCell, 3.0 + float(k)))) * uTreeSize / d;
        float base = (hc - camY) / d - 0.01 / d;
        float dx = abs(uv.x - centerX) / (0.5 * 0.055 * uTreeSize / d);
        bool conifer = hash12(vec2(worldCell, 9.0 + float(k))) < uConifer;
        float tt = conifer ? base + sz * 1.6 * (1.0 - dx) : base + sz * sqrt(max(0.0, 1.0 - dx * dx)) * 1.1 + sz * 0.3;
        if (dx < 1.0 && uv.y < tt && uv.y > base - 0.02 / d) {
          treeHit = true;
          float l = dot(uLeafColor, vec3(0.3, 0.55, 0.15));
          treeCol = mix(vec3(l), uLeafColor, 0.7) * (conifer ? vec3(0.65, 0.78, 0.8) : vec3(1.0)) * (0.75 + 0.4 * hash12(vec2(worldCell, 5.0)));
          treeCol *= 0.85 + 0.25 * lightSide * sign(uv.x - centerX);
        }
      }
    }
    float waterLine = (wl - camY) / d;
    if ((sy < top && sy > waterLine) || treeHit) {
      vec3 c;
      if (treeHit && !(sy < top)) c = treeCol;
      else {
        // Ground: material by height, shading by slope and depth below the ridge.
        // Slope of the smoothed ridge (no per-column streaks from fine detail).
        float slope = (profileO(x + 0.08, 2) - profileO(x - 0.08, 2)) / 0.16 * 0.35 / uScale;
        float worldY = camY + sy * d;
        float below = (top - sy) * d;
        vec3 grass = mix(vec3(dot(uGrassColor, vec3(0.3, 0.55, 0.15))), uGrassColor, 0.8);
        vec3 c0 = mix(uRock, grass, uVegetation * (1.0 - smoothstep(uSnowLine * 0.6, uSnowLine * 0.9, worldY)) * smoothstep(1.4, 0.4, abs(slope)));
        if (uStyle == 4) c0 = vec3(0.86, 0.66, 0.42);
        if (uStyle == 3) c0 = mix(vec3(0.62, 0.36, 0.22), vec3(0.78, 0.55, 0.36), noise1(worldY * 18.0));
        c0 = mix(c0, vec3(0.76, 0.68, 0.5), 1.0 - smoothstep(wl + 0.01, wl + 0.06, worldY));
        c0 = mix(c0, vec3(0.93, 0.95, 1.0), smoothstep(uSnowLine, uSnowLine + 0.12, worldY + 0.1 * noise1(x * 9.0)));
        if (uPlants && uForest > 0.0 && uStyle != 4 && worldY < uTreeLine) {
          float l = dot(uLeafColor, vec3(0.3, 0.55, 0.15));
          c0 = mix(c0, mix(vec3(l), uLeafColor, 0.7) * 0.8, uForest * 0.5 * smoothstep(0.02, 0.15, below));
        }
        float shade = 0.85 + 0.15 * clamp(-slope * lightSide, -1.0, 1.0);
        shade *= mix(1.0, 0.72, smoothstep(0.0, 0.8, below));
        float light = 0.35 + 0.75 * smoothstep(-0.1, 0.4, uSunElevation);
        c = mix(c0 * shade, c0 * 0.9, uPoster) * light;
      }
      // Aerial perspective: far layers fade into the haze.
      col = mix(c, hazeCol, 1.0 - exp(-d * hazeK));
      done = true;
      break;
    }
  }
  if (!done && tWater < 1e8) {
    vec3 wc = mix(uWaterShallow, uWaterDeep, 0.8);
    col = mix(mix(wc, skyAt(-sy * 1.6, uv.x - sunP.x), 0.5), hazeCol, 1.0 - exp(-tWater * hazeK));
  }
  col = col / (1.0 + col * 0.15);
  col = pow(max(col, 0.0), vec3(0.95));
  fragColor = vec4(col, 1.0);
}
