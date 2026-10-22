// Topographic Strata — Shader Forge original (MIT)  [Theme: Earth]
// Contour lines over warped noise, like a living geological map.
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float uScale;      // @param default=2.5 min=0.5 max=8 label="Map scale" group=Shape
uniform float uBands;      // @param default=14 min=3 max=40 step=1 label="Contour bands" group=Shape
uniform float uLineWidth;  // @param default=0.08 min=0.01 max=0.4 label="Line width" group=Shape
uniform float uDrift;      // @param default=0.05 min=0 max=0.5 label="Drift speed" group=Animation
uniform vec3 uLow;         // @param widget=color default=0.18,0.26,0.16 label="Lowlands" group=Colour
uniform vec3 uHigh;        // @param widget=color default=0.78,0.62,0.42 label="Highlands" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y * uScale;
  vec2 drift = vec2(u_time * uDrift, u_time * uDrift * 0.6);
  float h = fbm(uv + fbm(uv * 0.7 + drift) * 1.5);
  float b = h * uBands;
  float line = abs(fract(b) - 0.5);
  float w = fwidth(b) + 1e-4;
  float contour = 1.0 - smoothstep(0.5 - uLineWidth - w, 0.5 - uLineWidth, line);
  vec3 col = mix(uLow, uHigh, smoothstep(0.2, 0.8, h));
  col *= 0.75 + 0.25 * floor(b) / uBands;
  col = mix(col, col * 0.35, contour);
  gl_FragColor = vec4(col, 1.0);
}
