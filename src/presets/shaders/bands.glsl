// Interference Bands — Shader Forge original (MIT)
// Abstract generative art: two moving wave sources interfere under a cosine palette.
uniform vec2 uSourceA;     // @param default=-0.3,0.0 min=-1 max=1 widget=xy label="Source A" group=Transform
uniform vec2 uSourceB;     // @param default=0.3,0.1 min=-1 max=1 widget=xy label="Source B" group=Transform
uniform float uWavelength; // @param default=40 min=5 max=120 label="Frequency" group=Shape
uniform float uSpeed;      // @param default=2.0 min=-6 max=6 label="Wave speed" group=Animation
uniform float uSharpness;  // @param default=1.5 min=0.2 max=8 label="Sharpness" group=Shape
uniform vec3 uPalA;        // @param default=0.5,0.5,0.5 widget=vector min=0 max=1 label="Palette bias" group=Colour
uniform vec3 uPalD;        // @param default=0.0,0.33,0.67 widget=vector min=0 max=1 label="Palette phase" group=Colour

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float wa = sin(length(p - uSourceA) * uWavelength - iTime * uSpeed);
  float wb = sin(length(p - uSourceB) * uWavelength - iTime * uSpeed * 1.1);
  float v = (wa + wb) * 0.5;
  v = sign(v) * pow(abs(v), 1.0 / uSharpness);
  vec3 col = uPalA + 0.5 * cos(6.2831853 * (v * 0.5 + uPalD + length(p) * 0.3));
  fragColor = vec4(col, 1.0);
}
