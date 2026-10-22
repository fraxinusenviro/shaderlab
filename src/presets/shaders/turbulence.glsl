// Domain Turbulence — Shader Forge original (MIT)
// Two-level domain warping of fractal Brownian motion.
uniform float uScale;       // @param default=3.0 min=0.5 max=10 label="Scale" group=Shape
uniform int uOctaves;       // @param default=6 min=1 max=8 label="Octaves" group=Noise
uniform float uLacunarity;  // @param default=2.0 min=1.5 max=3 label="Lacunarity" group=Noise
uniform float uGain;        // @param default=0.5 min=0.2 max=0.8 label="Gain" group=Noise
uniform float uWarp;        // @param default=4.0 min=0 max=8 label="Warp amount" group=Warp
uniform float uSpeed;       // @param default=0.12 min=0 max=1 label="Flow speed" group=Animation
uniform vec3 uColorA;       // @param widget=color default=0.1,0.05,0.2 label="Deep" group=Colour
uniform vec3 uColorB;       // @param widget=color default=0.9,0.45,0.15 label="Mid" group=Colour
uniform vec3 uColorC;       // @param widget=color default=0.95,0.95,0.8 label="Highlight" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= uOctaves) break;
    v += a * noise(p);
    p = p * uLacunarity + vec2(1.7, 9.2);
    a *= uGain;
  }
  return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.y * uScale;
  float t = iTime * uSpeed;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.5 * t), fbm(p + uWarp * q + vec2(8.3, 2.8)));
  float f = fbm(p + uWarp * r);
  vec3 col = mix(uColorA, uColorB, clamp(f * f * 2.5, 0.0, 1.0));
  col = mix(col, uColorC, clamp(length(r) * 0.6 - 0.2, 0.0, 1.0) * f);
  fragColor = vec4(col, 1.0);
}
