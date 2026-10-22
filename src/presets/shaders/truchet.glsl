#version 300 es
// Truchet Weave — Shader Forge original (MIT)
// Randomly oriented quarter-circle tiles, written as a GLSL ES 3.00 main() shader.
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float uTiles;       // @param default=10 min=2 max=40 label="Tiles across" group=Symmetry
uniform float uThickness;   // @param default=0.12 min=0.02 max=0.3 label="Band thickness" group=Shape
uniform float uFlow;        // @param default=0.5 min=-3 max=3 label="Flow speed" group=Animation
uniform float uSeed;        // @param default=7 widget=seed min=0 max=999 label="Seed" group=Random
uniform vec3 uBand;         // @param widget=color default=0.95,0.8,0.3 label="Band" group=Colour
uniform vec3 uGround;       // @param widget=color default=0.07,0.08,0.12 label="Ground" group=Colour
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.y * uTiles;
  vec2 id = floor(uv);
  vec2 f = fract(uv) - 0.5;
  if (hash(id) > 0.5) f.x = -f.x;
  vec2 c = f.x > -f.y ? vec2(0.5) : vec2(-0.5);
  float d = abs(length(f - c) - 0.5);
  float ang = atan(f.y - c.y, f.x - c.x);
  float stripes = 0.5 + 0.5 * sin(ang * 8.0 + u_time * uFlow * 6.0 * (mod(id.x + id.y, 2.0) * 2.0 - 1.0));
  float band = smoothstep(uThickness, uThickness - 0.02, d);
  vec3 col = mix(uGround, uBand * (0.6 + 0.4 * stripes), band);
  col *= 1.0 - 0.6 * smoothstep(uThickness - 0.03, uThickness + 0.02, d) * band;
  outColor = vec4(col, 1.0);
}
