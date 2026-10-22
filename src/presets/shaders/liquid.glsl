// Liquid Marble — Shader Forge original (MIT)
// Iterative flow distortion producing marbled, fluid-like ink.
uniform float uScale;       // @param default=1.5 min=0.2 max=6 label="Scale" group=Shape
uniform float uDistortion;  // @param default=0.6 min=0 max=1.5 label="Distortion" group=Warp
uniform int uSteps;         // @param default=8 min=1 max=16 label="Flow steps" group=Detail
uniform float uSpeed;       // @param default=0.3 min=-2 max=2 label="Flow speed" group=Animation
uniform vec3 uInkA;         // @param widget=color default=0.05,0.15,0.4 label="Ink A" group=Colour
uniform vec3 uInkB;         // @param widget=color default=0.0,0.7,0.75 label="Ink B" group=Colour
uniform vec3 uInkC;         // @param widget=color default=0.95,0.9,0.85 label="Ink C" group=Colour

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * uScale;
  float t = iTime * uSpeed;
  for (int i = 1; i < 17; i++) {
    if (i > uSteps) break;
    float fi = float(i);
    p.x += uDistortion / fi * sin(fi * 2.1 * p.y + t + 0.3 * fi) + 0.8;
    p.y += uDistortion / fi * cos(fi * 1.7 * p.x + t + 0.5 * fi) - 0.6;
  }
  float a = 0.5 + 0.5 * sin(p.x + p.y);
  float b = 0.5 + 0.5 * cos(p.x * 1.3 - p.y * 0.7);
  vec3 col = mix(uInkA, uInkB, a);
  col = mix(col, uInkC, smoothstep(0.75, 1.0, b));
  fragColor = vec4(col, 1.0);
}
