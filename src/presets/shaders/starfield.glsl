// Warp Starfield — Shader Forge original (MIT)
// Particle-like star streaks flying toward the viewer through layered depth.
uniform float uSpeed;      // @param default=0.5 min=-2 max=3 label="Warp speed" group=Animation
uniform float uDensity;    // @param default=12 min=2 max=40 label="Star density" group=Shape
uniform int uLayers;       // @param default=6 min=1 max=10 label="Depth layers" group=Detail
uniform float uStreak;     // @param default=0.6 min=0 max=1 label="Streak length" group=Shape
uniform float uTwinkle;    // @param default=0.5 min=0 max=1 label="Twinkle" group=Colour
uniform vec3 uTint;        // @param widget=color default=0.7,0.85,1.0 label="Star tint" group=Colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453); }

vec3 layer(vec2 uv, float seed) {
  vec2 g = uv * uDensity;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id + seed);
  vec2 off = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) - 0.5;
  float d = length(f - off * 0.8);
  float size = 0.02 + 0.05 * h * h;
  float star = smoothstep(size, 0.0, d) * step(0.6, h);
  float tw = 1.0 - uTwinkle * 0.5 * (1.0 + sin(iTime * 6.0 + h * 50.0));
  return uTint * star * tw * (0.5 + h);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = vec3(0.0);
  float t = iTime * uSpeed;
  for (int i = 0; i < 10; i++) {
    if (i >= uLayers) break;
    float fi = float(i) / float(uLayers);
    float depth = fract(fi + t * 0.1);
    float scale = mix(8.0, 0.5, depth);
    float fade = depth * smoothstep(1.0, 0.85, depth);
    vec2 p = uv * scale;
    vec3 s = layer(p, float(i) * 17.3);
    // radial streak: sample slightly inward along the ray
    s += uStreak * layer(p * (1.0 - 0.03 * uStreak), float(i) * 17.3) * 0.6;
    col += s * fade;
  }
  col += vec3(0.02, 0.01, 0.05) * (1.0 - length(uv));
  fragColor = vec4(col, 1.0);
}
