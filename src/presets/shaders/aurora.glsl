// Aurora Curtains — Shader Forge original (MIT)
// Atmospheric light curtains over a starry night sky.
uniform float uIntensity;  // @param default=1.0 min=0 max=3 label="Intensity" group=Colour
uniform float uWaviness;   // @param default=1.2 min=0 max=4 label="Waviness" group=Warp
uniform float uSpeed;      // @param default=0.25 min=0 max=2 label="Speed" group=Animation
uniform int uCurtains;     // @param default=4 min=1 max=8 label="Curtains" group=Shape
uniform vec3 uGreen;       // @param widget=color default=0.15,0.95,0.55 label="Lower colour" group=Colour
uniform vec3 uViolet;      // @param widget=color default=0.6,0.25,0.9 label="Upper colour" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = mix(vec3(0.0, 0.01, 0.04), vec3(0.02, 0.04, 0.1), uv.y);
  float star = step(0.997, hash(floor(fragCoord * 0.5)));
  col += star * (0.5 + 0.5 * sin(iTime * 3.0 + hash(floor(fragCoord)) * 40.0)) * 0.8;
  float t = iTime * uSpeed;
  for (int i = 0; i < 8; i++) {
    if (i >= uCurtains) break;
    float fi = float(i);
    float y = 0.1 + 0.08 * fi + 0.1 * sin(p.x * (1.5 + fi * 0.3) * uWaviness + t * (1.0 + fi * 0.2) + fi * 2.0);
    float band = exp(-abs(p.y - y) * 18.0) * smoothstep(-0.1, 0.25, p.y - y + 0.3);
    float rays = 0.6 + 0.4 * sin(p.x * 40.0 + t * 4.0 + fi * 13.0);
    vec3 c = mix(uGreen, uViolet, clamp((p.y - y) * 4.0 + 0.5, 0.0, 1.0));
    col += c * band * rays * uIntensity * 0.45;
  }
  fragColor = vec4(col, 1.0);
}
