// Mandelbrot Explorer — Shader Forge original (MIT)
// Smooth-coloured escape-time fractal with an animated cosine palette.
uniform vec2 uCenter;      // @param default=-0.745,0.186 min=-2 max=2 widget=xy label="Center" group=View
uniform float uZoom;       // @param default=1.6 min=0 max=12 step=0.01 label="Zoom (log2)" group=View
uniform int uIterations;   // @param default=160 min=16 max=512 label="Iterations" group=Detail
uniform vec3 uPalette;     // @param default=0.0,0.15,0.3 widget=vector min=0 max=1 label="Palette phase" group=Colour
uniform float uColorCycle; // @param default=0.08 min=0 max=1 label="Colour cycle speed" group=Animation
uniform float uAutoZoom;   // @param default=0.0 min=0 max=1 label="Auto zoom speed" group=Animation

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + uPalette));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float zoom = exp2(uZoom + uAutoZoom * iTime);
  vec2 c = uCenter + p * 2.5 / zoom;
  vec2 z = vec2(0.0);
  float n = 0.0;
  float escaped = 0.0;
  for (int i = 0; i < 512; i++) {
    if (i >= uIterations) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 256.0) { escaped = 1.0; break; }
    n += 1.0;
  }
  float sn = n - log2(log2(max(dot(z, z), 1.0001))) + 4.0;
  vec3 col = escaped * palette(sn * 0.02 + iTime * uColorCycle);
  fragColor = vec4(col, 1.0);
}
