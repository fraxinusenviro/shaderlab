// Ridge Flyover — Shader Forge original (MIT)  [Theme: Earth]
// Raymarched fractal heightfield with fog, sun lighting and snow line.
uniform float uHeight;     // @param default=1.2 min=0.2 max=3 label="Mountain height" group=Terrain
uniform float uRoughness;  // @param default=0.5 min=0.3 max=0.7 label="Roughness" group=Noise
uniform float uSpeed;      // @param default=0.6 min=0 max=3 label="Flight speed" group=Animation
uniform float uFog;        // @param default=0.06 min=0 max=0.3 label="Fog density" group=Atmosphere
uniform float uSnowLine;   // @param default=0.85 min=0 max=2 label="Snow line" group=Terrain
uniform vec3 uSky;         // @param widget=color default=0.55,0.7,0.9 label="Sky colour" group=Colour
uniform vec3 uRock;        // @param widget=color default=0.36,0.3,0.24 label="Rock colour" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float terrain(vec2 p) {
  float h = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) {
    float n = noise(p);
    h += a * (1.0 - abs(n * 2.0 - 1.0));
    p = m * p;
    a *= uRoughness;
  }
  return h * uHeight;
}
vec3 normalAt(vec2 p) {
  vec2 e = vec2(0.01, 0.0);
  return normalize(vec3(terrain(p - e.xy) - terrain(p + e.xy), 2.0 * e.x, terrain(p - e.yx) - terrain(p + e.yx)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float z = iTime * uSpeed;
  vec3 ro = vec3(0.0, uHeight * 1.1 + 0.4, z);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.25, 1.0));
  vec3 sun = normalize(vec3(0.6, 0.45, 0.4));
  float t = 0.1;
  float hit = 0.0;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - terrain(p.xz);
    if (d < 0.002 * t) { hit = 1.0; break; }
    t += max(0.01, d * 0.45);
    if (t > 30.0) break;
  }
  vec3 sky = uSky - rd.y * 0.35 + pow(max(dot(rd, sun), 0.0), 32.0) * vec3(1.0, 0.8, 0.5);
  vec3 col = sky;
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p.xz);
    float diff = max(dot(n, sun), 0.0);
    vec3 base = mix(uRock, vec3(0.25, 0.35, 0.15), smoothstep(0.7, 0.95, n.y) * (1.0 - smoothstep(uSnowLine * 0.8, uSnowLine, p.y)));
    base = mix(base, vec3(0.95), smoothstep(uSnowLine, uSnowLine + 0.1, p.y) * smoothstep(0.5, 0.8, n.y));
    col = base * (0.25 + diff * vec3(1.1, 1.0, 0.9));
    col = mix(col, sky, 1.0 - exp(-uFog * t * t * 0.1));
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
