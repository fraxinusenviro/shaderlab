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
uniform float uVegetation;   // @param default=0.6 min=0 max=1 step=0.01 label="Vegetation" group=Terrain
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

vec3 terrainMaterial(vec3 p, vec3 n) {
  float slope = n.y;
  vec3 rock = uRock * (0.8 + 0.4 * vnoise(p.xz * 8.0));
  vec3 grass = mix(vec3(0.18, 0.28, 0.08), vec3(0.32, 0.36, 0.12), vnoise(p.xz * 3.0));
  vec3 sand = vec3(0.76, 0.68, 0.5);
  if (uStyle == 4) sand = vec3(0.86, 0.66, 0.42);
  vec3 col = rock;
  float g = smoothstep(0.72, 0.85, slope) * uVegetation * (1.0 - smoothstep(uSnowLine * 0.6, uSnowLine * 0.9, p.y));
  if (uStyle == 4) g *= 0.15;
  col = mix(col, grass, g);
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
  vec2 camXZ = dir * iTime * uFlySpeed;
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
  for (int i = 0; i < 220; i++) {
    if (uQuality == 0 && i >= 70) break;
    if (uQuality == 1 && i >= 130) break;
    vec3 p = ro + rd * t;
    float d = p.y - terrain(p.xz);
    if (d < 0.0015 * t) { hit = true; break; }
    t += max(0.012, d * (uQuality == 0 ? 0.6 : 0.42)) * (1.0 + t * 0.012);
    if (t > tMax) break;
  }

  vec3 sd = sunDir();
  vec3 sc = sunColor();
  vec3 col;
  float dist;
  if (hit && t < tMax) {
    dist = t;
    vec3 p = ro + rd * t;
    vec3 n = terrainNormal(p.xz, 0.003 + 0.0015 * t);
    vec3 mat = terrainMaterial(p, n);
    float dif = max(dot(n, sd), 0.0) * softShadow(p + n * 0.01, sd);
    float amb = 0.5 + 0.5 * n.y;
    vec3 skyAmb = skyColor(vec3(0.0, 1.0, 0.0), false);
    vec3 moon = vec3(0.025, 0.035, 0.07) * (1.0 - smoothstep(-0.1, 0.1, uSunElevation));
    col = mat * (dif * sc * 1.6 + amb * (skyAmb * 0.45 + moon) + 0.015);
  } else if (tWater < far) {
    dist = tWater;
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
