// Cellular Colony — Shader Forge original (MIT)
// Animated Voronoi cells with membranes and nuclei, like tissue under a microscope.
uniform float uDensity;    // @param default=6 min=1 max=20 label="Cell density" group=Shape
uniform float uWobble;     // @param default=0.35 min=0 max=0.5 label="Wobble amplitude" group=Warp
uniform float uSpeed;      // @param default=0.6 min=0 max=3 label="Wobble speed" group=Animation
uniform float uMembrane;   // @param default=0.08 min=0.01 max=0.3 label="Membrane width" group=Shape
uniform float uNucleus;    // @param default=0.18 min=0 max=0.5 label="Nucleus size" group=Shape
uniform vec3 uCytoplasm;   // @param widget=color default=0.85,0.35,0.45 label="Cytoplasm" group=Colour
uniform vec3 uWall;        // @param widget=color default=0.98,0.85,0.7 label="Membrane" group=Colour

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.y * uDensity;
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 bestId = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(ip + g);
      o = 0.5 + uWobble * sin(iTime * uSpeed + 6.2831 * o);
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; bestId = ip + g; }
      else if (d < d2) d2 = d;
    }
  float edge = d2 - d1;
  float shade = hash2(bestId).x;
  vec3 col = uCytoplasm * (0.55 + 0.45 * shade) * (0.6 + 0.4 * smoothstep(0.0, 0.6, edge));
  col = mix(uWall, col, smoothstep(uMembrane * 0.5, uMembrane, edge));
  col = mix(col * 0.35, col, smoothstep(uNucleus * 0.8, uNucleus, d1));
  fragColor = vec4(col, 1.0);
}
