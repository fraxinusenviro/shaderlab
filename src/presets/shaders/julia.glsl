// Julia Bloom — Shader Forge original (MIT)
// Julia set whose constant orbits a circle, producing blooming forms.
uniform float uOrbitRadius; // @param default=0.7885 min=0.5 max=1.0 step=0.0001 label="Orbit radius" group=Shape
uniform float uOrbitSpeed;  // @param default=0.15 min=-1 max=1 label="Orbit speed" group=Animation
uniform float uScale;       // @param default=1.4 min=0.3 max=4 label="Scale" group=View
uniform int uIterations;    // @param default=128 min=8 max=256 label="Iterations" group=Detail
uniform vec3 uTint;         // @param widget=color default=0.95,0.55,0.25 label="Tint" group=Colour
uniform vec3 uGlow;         // @param widget=color default=0.2,0.35,0.9 label="Glow" group=Colour

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 z = uScale * (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = iTime * uOrbitSpeed;
  vec2 c = uOrbitRadius * vec2(cos(a), sin(a));
  float trap = 1e9;
  float n = 0.0;
  for (int i = 0; i < 256; i++) {
    if (i >= uIterations) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - 0.5));
    if (dot(z, z) > 16.0) break;
    n += 1.0;
  }
  float f = n / float(uIterations);
  vec3 col = mix(uGlow * 0.15, uTint, pow(f, 0.6));
  col += uGlow * exp(-trap * 12.0) * 0.8;
  fragColor = vec4(col, 1.0);
}
