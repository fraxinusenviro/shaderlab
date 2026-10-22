// Neon Plasma — Shader Forge original (MIT)
// Classic sum-of-sines plasma written as a conventional WebGL main() shader.
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float uFrequency;   // @param default=6.0 min=0.5 max=20 label="Frequency" group=Shape
uniform float uSpeed;       // @param default=1.0 min=-4 max=4 label="Speed" group=Animation
uniform float uContrast;    // @param default=1.0 min=0.2 max=3 label="Contrast" group=Colour
uniform vec3 uPhase;        // @param default=0.0,0.33,0.67 widget=vector min=0 max=1 label="Palette phase" group=Colour
uniform bool uRings;        // @param default=true label="Radial rings"

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * uSpeed;
  float v = sin(uv.x * uFrequency + t);
  v += sin((uv.y * uFrequency + t) * 0.5);
  v += sin((uv.x * uFrequency + uv.y * uFrequency + t) * 0.5);
  if (uRings) {
    vec2 c = uv + 0.5 * vec2(sin(t / 5.0), cos(t / 3.0));
    v += sin(sqrt(100.0 * dot(c, c) + 1.0) * uFrequency * 0.3 + t);
  }
  v *= 0.5 * uContrast;
  vec3 col = 0.5 + 0.5 * cos(3.14159 * v + 6.2831853 * uPhase);
  gl_FragColor = vec4(col, 1.0);
}
