// Ocean Caustics — Shader Forge original (MIT)  [Theme: Water]
// Pool-floor light caustics: bright ridges along the edges of two drifting,
// domain-warped Voronoi layers, multiplied together like interfering wave lenses.
uniform float uScale;      // @param default=4.0 min=1 max=12 label="Pattern scale" group=Shape
uniform float uSharpness;  // @param default=10.0 min=2 max=30 label="Line sharpness" group=Shape
uniform float uWarp;       // @param default=0.35 min=0 max=1 label="Ripple warp" group=Warp
uniform float uSpeed;      // @param default=0.5 min=0 max=2 label="Flow speed" group=Animation
uniform float uBrightness; // @param default=1.3 min=0.2 max=3 label="Brightness" group=Colour
uniform vec3 uDeep;        // @param widget=color default=0.0,0.22,0.35 label="Deep water" group=Colour
uniform vec3 uLight;       // @param widget=color default=0.7,0.95,1.0 label="Caustic light" group=Colour

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance between the nearest and second-nearest animated cell points.
float cellEdge(vec2 p, float t) {
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2831 * hash2(ip + g));
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return d2 - d1;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.y * uScale;
  float t = iTime * uSpeed;
  p += uWarp * vec2(sin(p.y * 1.7 + t), cos(p.x * 1.3 - t * 0.8));
  float a = exp(-cellEdge(p, t) * uSharpness);
  float b = exp(-cellEdge(p * 1.37 + vec2(3.1, 7.7), t * 1.3 + 2.0) * uSharpness);
  float c = (a + b) * 0.5 + a * b;
  vec3 col = uDeep * (0.7 + 0.3 * sin(p.x * 0.5 + p.y * 0.3)) + uLight * c * uBrightness;
  fragColor = vec4(col, 1.0);
}
