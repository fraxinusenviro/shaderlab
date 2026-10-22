// Drifting Cumulus — Shader Forge original (MIT)  [Theme: Air]
// Layered 2D cloud field with self-shadowing and a sky gradient.
uniform float uCoverage;   // @param default=0.45 min=0 max=1 label="Coverage" group=Shape
uniform float uScale;      // @param default=1.8 min=0.5 max=6 label="Cloud scale" group=Shape
uniform float uWind;       // @param default=0.05 min=-0.5 max=0.5 label="Wind speed" group=Animation
uniform float uSoftness;   // @param default=0.25 min=0.02 max=0.6 label="Softness" group=Shape
uniform vec3 uSkyTop;      // @param widget=color default=0.18,0.42,0.78 label="Zenith" group=Colour
uniform vec3 uSkyHorizon;  // @param widget=color default=0.7,0.85,0.95 label="Horizon" group=Colour
uniform vec3 uCloudLight;  // @param widget=color default=1.0,0.98,0.95 label="Cloud light" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(17.1, 113.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = fragCoord / iResolution.y * uScale + vec2(iTime * uWind, 0.0);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 1.0, uv.y));
  float d = fbm(p);
  float cover = 1.0 - uCoverage;
  float c = smoothstep(cover - uSoftness, cover + uSoftness, d);
  float shadow = smoothstep(cover - uSoftness, cover + uSoftness, fbm(p + vec2(0.04, 0.06)));
  vec3 cloud = mix(uCloudLight, uCloudLight * vec3(0.62, 0.66, 0.75), clamp(shadow - c * 0.5, 0.0, 1.0));
  fragColor = vec4(mix(sky, cloud, c), 1.0);
}
