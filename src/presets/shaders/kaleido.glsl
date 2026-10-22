// Kaleido Lattice — Shader Forge original (MIT)  [Theme: Geometry]
// N-fold kaleidoscope folding a rotating lattice of rings and lines.
uniform int uSegments;     // @param default=8 min=2 max=24 label="Symmetry segments" group=Symmetry
uniform float uRepeat;     // @param default=3.0 min=1 max=12 label="Repetition" group=Symmetry
uniform float uRotation;   // @param default=0.15 min=-1 max=1 label="Rotation speed" group=Animation
uniform float uZoom;       // @param default=1.0 min=0.2 max=4 label="Zoom" group=View
uniform float uLine;       // @param default=0.04 min=0.005 max=0.2 label="Line weight" group=Shape
uniform vec3 uPalette;     // @param default=0.0,0.1,0.2 widget=vector min=0 max=1 label="Palette phase" group=Colour

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y / uZoom;
  float a = atan(p.y, p.x) + iTime * uRotation;
  float r = length(p);
  float seg = 6.2831853 / float(uSegments);
  a = abs(mod(a, seg) - 0.5 * seg);
  vec2 q = r * vec2(cos(a), sin(a)) * uRepeat;
  vec2 cell = fract(q) - 0.5;
  vec2 id = floor(q);
  float ring = abs(length(cell) - 0.3 - 0.1 * sin(iTime + id.x * 1.3));
  float diag = abs(cell.x + cell.y) * 0.7071;
  float d = min(ring, diag);
  float lines = smoothstep(uLine, 0.0, d);
  vec3 col = 0.5 + 0.5 * cos(6.2831853 * (r * 0.6 + id.x * 0.1 + uPalette + iTime * 0.05));
  col *= lines + 0.08;
  col += 0.15 * exp(-r * 3.0);
  fragColor = vec4(col, 1.0);
}
