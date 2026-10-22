// Inferno — Shader Forge original (MIT)  [Theme: Fire]
// Rising turbulent flames shaped by stretched, advected fbm.
uniform float uHeight;      // @param default=0.9 min=0.2 max=2 label="Flame height" group=Shape
uniform float uTurbulence;  // @param default=1.0 min=0 max=3 label="Turbulence" group=Noise
uniform float uSpeed;       // @param default=1.4 min=0 max=4 label="Rise speed" group=Animation
uniform float uWidth;       // @param default=0.6 min=0.1 max=1.5 label="Base width" group=Shape
uniform float uHeat;        // @param default=1.0 min=0.3 max=2 label="Heat" group=Colour
uniform vec3 uCore;         // @param widget=color default=1.0,0.9,0.55 label="Core" group=Colour
uniform vec3 uEdge;         // @param widget=color default=0.9,0.2,0.02 label="Edge" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.0 + vec2(3.1, 1.7); a *= 0.5; }
  return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = vec2((uv.x - 0.5) * iResolution.x / iResolution.y, uv.y);
  float t = iTime * uSpeed;
  float n = fbm(vec2(p.x * 3.0, p.y * 2.0 - t)) * uTurbulence;
  float shape = 1.0 - length(vec2(p.x / (uWidth * (1.0 - p.y / (uHeight + 0.6))), (p.y - 0.1) / uHeight));
  float f = clamp(shape + n * 0.8 - 0.35, 0.0, 1.0) * uHeat;
  vec3 col = mix(vec3(0.0), uEdge, smoothstep(0.0, 0.35, f));
  col = mix(col, uCore, smoothstep(0.35, 0.9, f));
  col += vec3(0.25, 0.05, 0.0) * smoothstep(0.6, 0.0, uv.y) * 0.3;
  fragColor = vec4(col, 1.0);
}
