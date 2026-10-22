// Ember Sparks — Shader Forge original (MIT)  [Theme: Fire]
// Particle-like glowing embers rising and swirling over a smouldering glow.
uniform int uCount;        // @param default=60 min=5 max=150 label="Particle count" group=Shape
uniform float uRise;       // @param default=0.25 min=0 max=1 label="Rise speed" group=Animation
uniform float uSwirl;      // @param default=0.12 min=0 max=0.5 label="Swirl" group=Warp
uniform float uSize;       // @param default=0.006 min=0.001 max=0.03 step=0.0005 label="Particle size" group=Shape
uniform vec3 uEmber;       // @param widget=color default=1.0,0.55,0.15 label="Ember colour" group=Colour

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = vec3(0.04, 0.01, 0.0) + uEmber * 0.25 * smoothstep(0.2, -0.6, uv.y);
  for (int i = 0; i < 150; i++) {
    if (i >= uCount) break;
    float fi = float(i);
    float life = fract(iTime * uRise * (0.4 + hash(fi)) + hash(fi + 1.3));
    vec2 pos = vec2((hash(fi + 2.1) - 0.5) * 1.6, -0.55 + life * 1.2);
    pos.x += uSwirl * sin(iTime * (1.0 + hash(fi + 4.2)) + fi + life * 6.0);
    float d = length(uv - pos);
    float glow = uSize / (d * d + uSize * 0.2) * 0.02;
    col += uEmber * glow * (1.0 - life) * (0.5 + hash(fi + 9.0));
  }
  fragColor = vec4(1.0 - exp(-col * 1.5), 1.0);
}
